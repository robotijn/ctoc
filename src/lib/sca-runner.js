/**
 * SCA Runner — Software-Composition Analysis (dependency-CVE audit)
 *
 * The static half of security is SAST (src/lib/sast-runner.js, which this file is
 * modeled EXACTLY on); the composition half is SCA — auditing the third-party
 * packages a project pulls in for known vulnerabilities. The capability registry
 * defines a `depsAudit` command per language but nothing consumed them, so
 * dependency CVEs went unchecked. This runner runs + parses them.
 *
 * THE HONESTY RULE (mirrors sast-runner's securityRouteFor): osv-scanner is the
 * UNIVERSAL SCA engine — it covers 11+ ecosystems via lockfiles with ONE unified
 * OSV JSON format — so it is the SCA analog of the multi-language semgrep universal
 * pass. This runner writes NATIVE parsers ONLY for the JSON-emitting tools whose
 * formats are stable: npm audit (--json), pip-audit (--format json), cargo audit
 * (--json). EVERY other language routes to osv-scanner (parsed). We NEVER attribute
 * a finding to a tool this runner cannot parse (composer audit / bundler-audit /
 * govulncheck emit text → routed to osv-scanner, never fake-parsed). If neither a
 * native parser nor osv-scanner is available, run() records scanned:false with an
 * honest reason — a crashed or absent scanner NEVER reads as a clean pass.
 *
 * SECURITY: every scanner is executed on the argv-safe execFileSync path (no
 * string-concatenated shell). The registry depsAudit strings are inert data; this
 * runner invokes fixed argument vectors, exactly like sast-runner's TOOL_CONFIGS.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const safeFs = require('./safe-fs');
const registry = require('./capability-registry');
const { severityFromCvss } = require('./cvss');
const { auditedLanguagesFor } = require('./dependency-auditor');

/**
 * Severity levels aligned with CVSS (same shape as sast-runner's SEVERITY).
 * @type {Object}
 */
const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
};

/**
 * The native SCA tools this runner has a REAL result parser for. A detected
 * language is scanned by its native tool ONLY when SCA_TOOL_CONFIGS maps it to one
 * of these; every other language is covered by the osv-scanner UNIVERSAL pass,
 * which we also parse. We NEVER invoke a scanner whose output we cannot parse.
 * @type {Set<string>}
 */
const PARSEABLE_NATIVE_TOOLS = new Set(['npm-audit', 'pip-audit', 'cargo-audit']);

/**
 * Native SCA configuration per language. `native` is the name of a tool this runner
 * can PARSE (one of PARSEABLE_NATIVE_TOOLS). A language absent from this table has
 * NO native parser here and is routed to osv-scanner universal by scaRouteFor —
 * that includes go (govulncheck text), php (composer audit text), ruby
 * (bundler-audit text), java, and every other registry language.
 * @type {Object<string, {native: string}>}
 */
const SCA_TOOL_CONFIGS = {
  javascript: { native: 'npm-audit' },
  typescript: { native: 'npm-audit' },
  python: { native: 'pip-audit' },
  rust: { native: 'cargo-audit' }
};

/**
 * OSV ecosystem name → the capability-registry language(s) it belongs to (keys are
 * lowercased for case-insensitive matching; osv emits "npm", "PyPI", "Go", "Maven",
 * "crates.io", "RubyGems", "Packagist", "NuGet", …). F2: osv-scanner walks the WHOLE
 * repo and auto-discovers every lockfile, so its universal pass reports findings from
 * ecosystems DependencyAuditor already audits. This map lets the runner drop those
 * findings — keyed on the per-finding `ecosystem` osv records — so an npm CVE that
 * DependencyAuditor also reports is counted ONCE, not twice. An ecosystem absent from
 * this map is never dropped (kept — we never suppress a finding we cannot attribute).
 * @type {Object<string, string[]>}
 */
const OSV_ECOSYSTEM_LANGUAGES = {
  npm: ['javascript', 'typescript'],
  pypi: ['python'],
  go: ['go'],
  'crates.io': ['rust'],
  rubygems: ['ruby'],
  packagist: ['php'],
  maven: ['java'],
  nuget: ['csharp']
};

/**
 * SCA Runner class. Orchestrates dependency auditing across the native parsers and
 * the osv-scanner universal engine.
 */
class SCARunner {
  /**
   * @param {string} projectRoot - Root directory of the project
   * @param {Object} options - Configuration options
   */
  constructor(projectRoot, options = {}) {
    // SCA6 (defense-in-depth): mirror DependencyAuditor's `!root || typeof !== 'string'`
    // guard. A falsy/non-string root must NEVER reach a scanner's exec `cwd` — an
    // empty/nullish `cwd` resolves to the PROCESS cwd, scanning THIS repo instead of the
    // (absent) target. Normalize to null here; detectLanguages, _pythonUsesOsvOnlyLock,
    // _detectRequirementFiles, the exec methods and run() all no-op on a null root.
    this.projectRoot = (projectRoot && typeof projectRoot === 'string') ? projectRoot : null;
    this.options = {
      severityThreshold: SEVERITY.HIGH,
      timeout: 300000, // 5 minutes, matching sast-runner
      ...options
    };
    this.findings = [];
    this.errors = [];
    // The languages DependencyAuditor audits for THIS project, set by run() before
    // the osv-scanner universal pass so parseOSVResults can drop findings from an
    // ecosystem DependencyAuditor already covers (F2). null outside a run() → no
    // filtering, so the standalone parser tests see every finding.
    this._deferredLanguages = null;
  }

  /**
   * Detect languages used in the project, delegating to the single glob-aware
   * capability registry (the same table sast-runner's detectLanguages consumes).
   * Fail-soft: an unreadable root yields no detections.
   * @returns {string[]} detected language names
   */
  detectLanguages() {
    if (!this.projectRoot) return []; // SCA6: a normalized-null root detects nothing
    return registry.detectLanguages(this.projectRoot);
  }

  /**
   * Decide HOW a detected language's dependency audit is performed, honestly.
   * Returns `{ native, osvUniversal }` where `native` is the name of a scanner this
   * runner can actually PARSE (npm-audit / pip-audit / cargo-audit) or null, and
   * `osvUniversal` is true exactly when there is no native parser — in which case
   * osv-scanner (which we parse) is the coverage.
   *
   * This is the HONESTY boundary: a language routes to a native scanner ONLY when
   * SCA_TOOL_CONFIGS maps it to a tool we can parse. Every other language — whose
   * registry depsAudit tool emits text we cannot parse (govulncheck, composer
   * audit, bundler-audit, dependency-check, …) — routes to osv-scanner, NEVER to a
   * fabricated parser. `native` is therefore never a parser-less tool.
   *
   * DEFECT 2 (poetry/uv routing): python defined by a `poetry.lock` or `uv.lock` is
   * readable ONLY by osv-scanner. pip-audit — python's native SCA tool here — audits the
   * AMBIENT environment, never the lockfile, so for such a project it verifies the wrong
   * thing. So a poetry/uv python project drops its `pip-audit` native route and falls
   * through to the osv universal pass; scannability then keys on osv availability, not
   * pip-audit. A pip-managed python project (requirements.txt / pyproject-without-lock)
   * keeps its pip-audit native route — no over-correction. The routing lives HERE, in one
   * place, so every caller (run() and the quality-agent scannable filter) agrees.
   *
   * @param {string} lang detected language name
   * @returns {{ native: (string|null), osvUniversal: boolean }}
   */
  scaRouteFor(lang) {
    const config = SCA_TOOL_CONFIGS[lang];
    let native = config && config.native;
    if (lang === 'python' && native === 'pip-audit' && this._pythonUsesOsvOnlyLock()) {
      native = null; // pip-audit cannot read poetry.lock/uv.lock → route to osv universal
    }
    if ((lang === 'javascript' || lang === 'typescript') && native === 'npm-audit'
        && this._jsUsesOsvOnlyLock()) {
      // npm audit reads ONLY package-lock.json/npm-shrinkwrap.json — never yarn.lock/
      // pnpm-lock.yaml (it ENOLOCKs). A yarn/pnpm project with no npm lockfile therefore
      // has NO usable native parser here; only osv-scanner reads yarn.lock/pnpm-lock.yaml
      // natively → route to the osv universal pass, exactly like poetry.lock/uv.lock.
      native = null;
    }
    if (native && PARSEABLE_NATIVE_TOOLS.has(native)) {
      return { native, osvUniversal: false };
    }
    return { native: null, osvUniversal: true };
  }

  /**
   * Check if an SCA tool is available. Argv-safe probes, no shell.
   * @param {string} tool - Tool name
   * @returns {boolean} True if the tool is available
   */
  isToolAvailable(tool) {
    const checks = {
      'npm-audit': ['npm', ['--version']],
      'pip-audit': ['pip-audit', ['--version']],
      'cargo-audit': ['cargo', ['audit', '--version']],
      'osv-scanner': ['osv-scanner', ['--version']]
    };

    const spec = checks[tool];
    if (!spec) return false;
    const [bin, args] = spec;
    // On Windows the npm launcher is a .cmd shim; the others are native binaries.
    const cmd = (process.platform === 'win32' && bin === 'npm') ? 'npm.cmd' : bin;

    try {
      execFileSync(cmd, args, { stdio: 'ignore', timeout: 10000 });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Run the SCA audit on the project.
   *
   * Prefers ONE osv-scanner pass for every osv-routed language (it is lockfile-based
   * and multi-ecosystem), plus each native tool for its own language. Tracks whether
   * ANY scanner actually ran — a run in which zero scanners were available verified
   * nothing and must report scanned:false, never a clean pass (fail-closed at the
   * module boundary, exactly like sast-runner.run()).
   *
   * @returns {Promise<Object>} Scan results
   */
  async run() {
    const startTime = Date.now();
    const detected = this.detectLanguages();

    // F1 partition (redesigned): defer an ecosystem to DependencyAuditor ONLY when
    // the manager it DETECTED for THIS project is one it actually AUDITS (an
    // implemented switch arm). The old logic deferred the NOMINAL language union, so
    // maven/gradle (java) and poetry/pipenv (python) projects — which DependencyAuditor
    // reports "not implemented" for — were EXCLUDED here and thus scanned by NEITHER
    // runner. auditedLanguagesFor keys on DETECTED ∩ IMPLEMENTED, so those projects now
    // flow to a real SCA scanner (osv-scanner universal / native), while a genuinely
    // audited ecosystem (npm/pip/go/cargo/bundler/composer) is still deferred exactly
    // once. Fail-soft inside auditedLanguagesFor: on error it defers nothing.
    const deferred = auditedLanguagesFor(this.projectRoot);
    // Record the deferred set so the osv-scanner universal pass — which walks the whole
    // repo and auto-discovers EVERY lockfile regardless of this filter — does not ALSO
    // report findings from an ecosystem DependencyAuditor already audits (F2).
    this._deferredLanguages = deferred;
    const languages = detected.filter((l) => !deferred.has(l));

    // DEFECT 2 / F3: a poetry.lock or uv.lock present means python's dependency set is
    // defined by that lockfile, which pip-audit (SCA's native python tool AND
    // DependencyAuditor's) CANNOT read — only osv-scanner reads poetry.lock/uv.lock
    // natively. scaRouteFor() already drops python's pip-audit native route in that case
    // (routing it to the osv universal pass); this flag additionally keeps osv running
    // and defends the short-circuit even if the language registry did not surface python.
    const osvOnlyPythonLock = this._pythonUsesOsvOnlyLock();

    // FALSE-CLEAN / JS analog: a yarn.lock/pnpm-lock.yaml with no npm lockfile is readable
    // ONLY by osv-scanner (npm audit ENOLOCKs on it). The javascript registry marker is
    // `package.json` alone — yarn.lock/pnpm-lock.yaml are NOT language markers — so a repo
    // whose JS presence is signalled ONLY by yarn.lock/pnpm-lock.yaml has detected.length
    // === 0 and would early-return as a false clean no-op unless this flag keeps osv
    // running, exactly as osvOnlyPythonLock does for poetry.lock/uv.lock.
    const osvOnlyJsLock = this._jsUsesOsvOnlyLock();

    // Honest clean no-op ONLY when there is genuinely nothing anywhere to audit — no
    // dependency manifest of ANY kind. (A deferred-but-present ecosystem is NOT a no-op:
    // osv still runs below as the whole-repo net to catch nested lockfiles — SCA1.)
    if (detected.length === 0 && !osvOnlyPythonLock && !osvOnlyJsLock) {
      return {
        success: true,
        findings: [],
        summary: this.generateSummary([], languages, 0),
        message: 'No supported languages detected in project — no dependencies to audit'
      };
    }

    let scannersRun = 0;

    // Native parsers, one per language whose route names a native tool. scaRouteFor()
    // already drops python's native pip-audit route when poetry.lock/uv.lock/Pipfile.lock
    // is present (DEFECT 2 / SCA2), so a poetry/uv/pipenv-lock python project is excluded
    // here without a special-case — the osv universal pass below is its real coverage.
    const nativeLangs = languages.filter((l) => this.scaRouteFor(l).native);
    for (const lang of nativeLangs) {
      if (await this.runNativeScanner(lang)) {
        scannersRun++;
      }
    }

    // SCA1: osv-scanner is a WHOLE-REPO, lockfile-based net. Run it whenever it is
    // available and the repo holds ANY dependency manifest (guaranteed here: we passed
    // the no-op guard above) — DECOUPLED from whether a non-deferred language routes to
    // it. Coupling osv to "some non-deferred language routes to osv" (the old
    // `anyOsvRouted`) left a monorepo whose every ROOT ecosystem is deferred (pure
    // npm/go/cargo/…) with NO osv pass, so a NESTED, independently-installed lockfile
    // (packages/api/package-lock.json) — audited by neither root-only native runner — was
    // scanned by nobody while the human was told everything was covered. osv walks the
    // whole tree; the root-manifest dedup (parseOSVResults / _isRootManifest) drops the
    // root double-count while keeping nested CVEs — this decoupling makes that reachable.
    // SCA7 (honesty): count osv toward scannersRun ONLY when its scan actually RAN and
    // produced parseable output — mirror how runNativeScanner is consumed above. osv used to
    // be counted on tool AVAILABILITY, BEFORE the scan; a crashed osv (non-zero + empty
    // stdout, or unparseable output) that is the SOLE scanner for the ecosystem then read as
    // scanned:true/findings:[] — a crashed scanner reading as a clean pass, the exact thing
    // this module promises never happens. runOsvScanner now returns false on crash (with the
    // error recorded in this.errors), so a sole-osv crash falls through to the fail-closed
    // scannersRun===0 branch below and surfaces the failure.
    if (this.isToolAvailable('osv-scanner')) {
      if (await this.runOsvScanner()) scannersRun++;
    }

    if (scannersRun === 0) {
      // SCA7: an available scanner whose scan CRASHED recorded an error in this.errors. That
      // is NOT a clean pass even when every ROOT ecosystem is deferred to DependencyAuditor —
      // the osv whole-repo net that catches NESTED lockfiles failed, so we cannot claim the
      // repo clean. Only a genuinely quiet no-op (no scanner ran AND nothing crashed) may
      // report the deferred-clean message.
      const scannerCrashed = this.errors.length > 0;
      // No native scanner ran and osv-scanner is absent (not crashed). When EVERY detected
      // ecosystem was deferred to DependencyAuditor (and there is no osv-only python lock),
      // that runner already audits the root manifests — a truthful no-op, not a
      // scanner-missing failure. Otherwise a non-deferred ecosystem had NO scanner and
      // nothing was scanned.
      if (languages.length === 0 && !osvOnlyPythonLock && !osvOnlyJsLock && !scannerCrashed) {
        return {
          success: true,
          findings: [],
          errors: this.errors,
          summary: this.generateSummary([], languages, Date.now() - startTime),
          message: 'All detected ecosystems are audited by DependencyAuditor — nothing further for SCA to audit'
        };
      }
      return {
        success: false,
        scanned: false,
        findings: [],
        errors: this.errors,
        reason: scannerCrashed
          ? 'dependency (SCA) scanner ran but failed — nothing was reliably scanned'
          : 'no dependency (SCA) scanner available',
        summary: this.generateSummary([], languages, Date.now() - startTime),
        message: scannerCrashed
          ? 'An SCA scanner was available but its scan failed — nothing was reliably scanned'
          : 'No SCA scanner available for the detected language(s) — nothing was scanned'
      };
    }

    const uniqueFindings = this.deduplicateFindings();
    uniqueFindings.sort((a, b) => {
      const order = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    });

    const duration = Date.now() - startTime;
    const summary = this.generateSummary(uniqueFindings, languages, duration);

    return {
      success: true,
      scanned: true,
      findings: uniqueFindings,
      errors: this.errors,
      summary,
      message: this.generateReport(uniqueFindings, summary)
    };
  }

  /**
   * Run the native SCA scanner for a language that routes to one.
   * @param {string} lang - Language to scan
   * @returns {Promise<boolean>} true iff a native scanner was available and ran
   */
  async runNativeScanner(lang) {
    const { native } = this.scaRouteFor(lang);
    if (!native) return false;
    if (!this.isToolAvailable(native)) return false;

    try {
      switch (native) {
        case 'npm-audit':
          await this.runNpmAudit();
          break;
        case 'pip-audit':
          await this.runPipAudit();
          break;
        case 'cargo-audit':
          await this.runCargoAudit();
          break;
        default:
          // Unreachable: PARSEABLE_NATIVE_TOOLS gates route.native to exactly these
          // three. Fail-closed anyway — never run a tool we cannot parse.
          return false;
      }
    } catch (error) {
      this.errors.push({ tool: native, language: lang, error: error.message });
    }
    return true;
  }

  /**
   * Run `npm audit --json` and parse the report. npm audit exits non-zero when
   * vulnerabilities exist but still prints its JSON report to stdout (carried on the
   * error object). Valid JSON → parse; anything else is a scanner that ran and
   * produced garbage — a loud error, never silence (fail-closed, mirroring
   * sast-runner's runBandit/runGosec).
   */
  async runNpmAudit() {
    if (!this.projectRoot) return; // SCA6: never exec against a leaked process cwd
    const bin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    let out = '';
    try {
      out = execFileSync(bin, ['audit', '--json'], {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (error) {
      out = (error && error.stdout) ? String(error.stdout) : '';
      if (!(out && out.trim())) {
        this.errors.push({ tool: 'npm-audit', error: error.message });
        return;
      }
    }

    try {
      this.parseNpmAuditResults(JSON.parse(out));
    } catch (e) {
      this.errors.push({ tool: 'npm-audit', error: e.message });
    }
  }

  /**
   * Run `pip-audit --format json` and parse the report. pip-audit exits non-zero
   * when vulnerabilities exist but still prints JSON to stdout. Fail-closed.
   */
  async runPipAudit() {
    if (!this.projectRoot) return; // SCA6: never exec against a leaked process cwd
    // SCA3: `pip-audit --format json` with NO -r audits the AMBIENT interpreter's
    // installed packages, NOT the project's pins — so a requirements-file project whose
    // deps are not installed (typical CI) reads clean though nothing was audited. When a
    // requirements file exists, point pip-audit at each with -r so it audits the manifest.
    // argv-safe: a fixed argument vector (no shell string interpolation).
    const args = ['--format', 'json'];
    for (const reqFile of this._detectRequirementFiles()) {
      args.push('-r', reqFile);
    }
    let out = '';
    try {
      out = execFileSync('pip-audit', args, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (error) {
      out = (error && error.stdout) ? String(error.stdout) : '';
      if (!(out && out.trim())) {
        this.errors.push({ tool: 'pip-audit', error: error.message });
        return;
      }
    }

    try {
      this.parsePipAuditResults(JSON.parse(out));
    } catch (e) {
      this.errors.push({ tool: 'pip-audit', error: e.message });
    }
  }

  /**
   * Run `cargo audit --json` and parse the report. cargo audit exits non-zero when
   * vulnerabilities exist but still prints JSON to stdout. Fail-closed.
   */
  async runCargoAudit() {
    if (!this.projectRoot) return; // SCA6: never exec against a leaked process cwd
    let out = '';
    try {
      out = execFileSync('cargo', ['audit', '--json'], {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (error) {
      out = (error && error.stdout) ? String(error.stdout) : '';
      if (!(out && out.trim())) {
        this.errors.push({ tool: 'cargo-audit', error: error.message });
        return;
      }
    }

    try {
      this.parseCargoAuditResults(JSON.parse(out));
    } catch (e) {
      this.errors.push({ tool: 'cargo-audit', error: e.message });
    }
  }

  /**
   * Run the osv-scanner UNIVERSAL pass — `osv-scanner scan --format json .` — for
   * the whole repo. osv-scanner exits non-zero when vulnerabilities are found but
   * still prints its OSV JSON to stdout. Fail-closed, mirroring sast-runner.
   *
   * SCA7: returns whether the scan actually RAN SUCCESSFULLY (produced parseable output),
   * mirroring runNativeScanner. run() counts osv toward scannersRun ONLY on true, so a
   * crashed osv (non-zero + empty stdout, or unparseable output — error recorded here) is
   * NOT mistaken for a clean pass. A leaked/absent projectRoot (SCA6) also returns false:
   * nothing was scanned.
   * @returns {Promise<boolean>} true iff osv ran and its output parsed
   */
  async runOsvScanner() {
    if (!this.projectRoot) return false; // SCA6: never exec against a leaked process cwd
    let out = '';
    try {
      out = execFileSync('osv-scanner', ['scan', '--format', 'json', '.'], {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (error) {
      out = (error && error.stdout) ? String(error.stdout) : '';
      if (!(out && out.trim())) {
        this.errors.push({ tool: 'osv-scanner', error: error.message });
        return false;
      }
    }

    try {
      this.parseOSVResults(JSON.parse(out));
    } catch (e) {
      this.errors.push({ tool: 'osv-scanner', error: e.message });
      return false;
    }
    return true;
  }

  /**
   * Parse osv-scanner OSV JSON output. Shape: `{ results: [ { source, packages: [
   * { package: {name, ecosystem, version}, vulnerabilities: [ {id, summary, details,
   * aliases, database_specific:{severity}, severity:[{type,score}]} ] } ] } ] }`.
   * @param {Object} data - osv-scanner JSON results
   */
  parseOSVResults(data) {
    if (!data || !Array.isArray(data.results)) return;

    for (const result of data.results) {
      const source = result.source && result.source.path ? result.source.path : null;
      for (const pkg of result.packages || []) {
        const info = pkg.package || {};
        for (const vuln of pkg.vulnerabilities || []) {
          // F2/F1: osv discovers every lockfile in the repo. Drop a finding as
          // DependencyAuditor's ONLY when (a) its ecosystem is one DependencyAuditor
          // audits for this project AND (b) its source is a ROOT manifest — the only
          // thing DependencyAuditor actually covers (detectPackageManagers checks
          // path.join(root, lockFile); npm/pip/cargo audit run at cwd=root). A finding
          // from a NESTED, independent lockfile (packages/api/package-lock.json) is
          // audited by NEITHER runner, so it must NEVER be dropped. Only active inside
          // run() (when _deferredLanguages is set); standalone parse sees every finding.
          if (this._isEcosystemDeferred(info.ecosystem) && this._isRootManifest(source)) continue;
          this.findings.push({
            tool: 'osv-scanner',
            package: info.name || 'unknown',
            version: info.version || null,
            ecosystem: info.ecosystem || null,
            advisory: vuln.id || null,
            title: vuln.summary || vuln.details || vuln.id || 'vulnerability',
            severity: this.mapOSVSeverity(vuln),
            aliases: Array.isArray(vuln.aliases) ? vuln.aliases : [],
            file: source
          });
        }
      }
    }
  }

  /**
   * True when an osv finding's ecosystem belongs to a language DependencyAuditor
   * already audits for this project (F2 cross-runner de-duplication). Inert unless a
   * run() set `_deferredLanguages`; an unmapped/absent ecosystem is never deferred, so
   * a finding we cannot attribute is kept (never silently suppressed).
   * @param {string|null|undefined} ecosystem - the OSV ecosystem name for the finding
   * @returns {boolean} true iff the finding should be dropped as DependencyAuditor's
   */
  _isEcosystemDeferred(ecosystem) {
    if (!(this._deferredLanguages instanceof Set) || this._deferredLanguages.size === 0) return false;
    if (!ecosystem) return false;
    const langs = OSV_ECOSYSTEM_LANGUAGES[String(ecosystem).toLowerCase()] || [];
    // FALSE-CLEAN defense-in-depth: when the JS lockfile is yarn.lock/pnpm-lock.yaml with
    // no npm lockfile, DependencyAuditor's npm-audit fallback ENOLOCKs and audits NOTHING —
    // so a root npm finding must NEVER be dropped as its "duplicate". osv is the only runner
    // that reads yarn.lock/pnpm-lock.yaml; keep the finding even if a caller wrongly left
    // javascript/typescript in _deferredLanguages. (auditedLanguagesFor already omits it,
    // so this is belt-and-suspenders over a mis-populated deferred set.)
    if ((langs.includes('javascript') || langs.includes('typescript')) && this._jsUsesOsvOnlyLock()) {
      return false;
    }
    return langs.some((l) => this._deferredLanguages.has(l));
  }

  /**
   * Express an osv `source.path` relative to the project root. osv-scanner (run with
   * cwd=projectRoot and arg `.`) emits either a path under the root or a repo-relative
   * one; both normalize here. A path that is NOT under the root (absolute + escapes via
   * `..`) is returned unchanged — it is not a manifest of THIS project.
   * @param {string} sourcePath - the osv `source.path`
   * @returns {string} the path relative to projectRoot when it is under it, else as-is
   */
  _relToRoot(sourcePath) {
    const s = String(sourcePath);
    const root = this.projectRoot;
    if (root && typeof root === 'string') {
      // SCA5: resolve BOTH sides before comparing. The old guard required BOTH to be
      // absolute, so a caller passing a RELATIVE root (e.g. new SCARunner('.')) against
      // an ABSOLUTE osv source.path never matched — _isRootManifest returned false for
      // the true root manifest and the root CVE was reported by BOTH osv AND
      // DependencyAuditor (double-count). path.resolve normalizes a relative root (and a
      // relative source) against the process cwd so the classification is correct.
      const rel = path.relative(path.resolve(root), path.resolve(s));
      if (rel && !rel.startsWith('..')) return rel;
    }
    return s;
  }

  /**
   * True when an osv finding's source is a ROOT manifest — one whose directory IS the
   * project root. DependencyAuditor audits ONLY root manifests (detectPackageManagers
   * checks path.join(root, lockFile); the audit tools run at cwd=root), so ONLY a root
   * finding may be dropped as its duplicate (F1). A nested lockfile is audited by
   * neither runner and is always kept.
   * @param {string|null|undefined} sourcePath - the osv `source.path`
   * @returns {boolean} true iff the manifest sits directly at the project root
   */
  _isRootManifest(sourcePath) {
    if (!sourcePath) return false;
    const dir = path.dirname(this._relToRoot(sourcePath));
    return dir === '.' || dir === '' || dir === path.sep;
  }

  /**
   * True when the project root contains a `poetry.lock` OR a `uv.lock` — the two python
   * lockfiles only osv-scanner reads. A direct filesystem check (DEFECT 2 / F3): such a
   * lock present means python's dependency set is defined by the lockfile, and neither
   * DependencyAuditor's nor SCA's native `pip-audit` can read it (pip-audit audits the
   * AMBIENT environment) — only osv-scanner reads poetry.lock/uv.lock natively. Both
   * scaRouteFor() and run() consult this to route python coverage through the osv
   * universal pass (and skip the useless native pip-audit), so a poetry/uv project
   * genuinely gets osv coverage. Fail-soft: an unreadable root reports absent.
   * @returns {boolean} true iff a poetry.lock or uv.lock exists at the project root
   */
  _pythonUsesOsvOnlyLock() {
    const root = this.projectRoot;
    if (!root || typeof root !== 'string') return false;
    try {
      return safeFs.existsSync(path.join(root, 'poetry.lock'))
        || safeFs.existsSync(path.join(root, 'uv.lock'))
        // SCA2: Pipfile.lock is the same class — pip-audit cannot read it (it audits the
        // ambient env); only osv-scanner reads it. pipenv is not an implemented
        // DependencyAuditor manager, so without this the project would route to the
        // useless native pip-audit and osv would never run — a silent coverage hole.
        || safeFs.existsSync(path.join(root, 'Pipfile.lock'));
    } catch {
      return false;
    }
  }

  /**
   * True when the project root contains a `yarn.lock` OR a `pnpm-lock.yaml` AND has NO
   * npm lockfile (`package-lock.json` / `npm-shrinkwrap.json`). This is the JS analog of
   * `_pythonUsesOsvOnlyLock`: `npm audit` — the native SCA tool for javascript/typescript
   * here AND DependencyAuditor's yarn/pnpm fallback — reads ONLY package-lock.json/
   * npm-shrinkwrap.json; on a tree with none it returns `{"error":{"code":"ENOLOCK"}}` and
   * audits nothing. Only osv-scanner reads yarn.lock/pnpm-lock.yaml natively. Both
   * scaRouteFor() and run() consult this to route javascript coverage through the osv
   * universal pass (and keep osv running / keep the finding) for such a project. When an
   * npm lockfile IS present, npm audit genuinely works → this reports false (no
   * over-correction). Fail-soft: an unreadable root reports absent.
   * @returns {boolean} true iff a yarn.lock/pnpm-lock.yaml exists with no npm lockfile
   */
  _jsUsesOsvOnlyLock() {
    const root = this.projectRoot;
    if (!root || typeof root !== 'string') return false;
    try {
      const hasYarnOrPnpm = safeFs.existsSync(path.join(root, 'yarn.lock'))
        || safeFs.existsSync(path.join(root, 'pnpm-lock.yaml'));
      if (!hasYarnOrPnpm) return false;
      const hasNpmLock = safeFs.existsSync(path.join(root, 'package-lock.json'))
        || safeFs.existsSync(path.join(root, 'npm-shrinkwrap.json'));
      return !hasNpmLock;
    } catch {
      return false;
    }
  }

  /**
   * The requirements files present at the project root, in a fixed candidate order
   * (`requirements.txt`, `requirements-dev.txt` — the same set DependencyAuditor's `pip`
   * manager keys on). SCA3: pip-audit MUST be pointed at these with `-r` so it audits the
   * project's PINNED dependencies rather than the ambient interpreter's installed
   * packages. Returns basenames (execFileSync runs with cwd=projectRoot); argv-safe, no
   * shell interpolation. Fail-soft: an unreadable root yields an empty list.
   * @returns {string[]} basenames of the requirements files present at the root
   */
  _detectRequirementFiles() {
    const root = this.projectRoot;
    if (!root || typeof root !== 'string') return [];
    const found = [];
    for (const name of ['requirements.txt', 'requirements-dev.txt']) {
      try {
        if (safeFs.existsSync(path.join(root, name))) found.push(name);
      } catch { /* unreadable → skip */ }
    }
    return found;
  }

  /**
   * Parse `npm audit --json` output. Handles the npm v7+ `vulnerabilities` map, the
   * npm v6 `advisories` map (F5), and — critically — the ERROR ENVELOPE (F3).
   *
   * F3 (honesty contract): a JS project with no lockfile makes `npm audit --json`
   * exit 1 and print `{"error":{"code":"EAUDITNOLOCK",…}}` — NOTHING was audited. The
   * old parser saw no `vulnerabilities` key and returned silently, so the run read as
   * a clean scan though it verified nothing. We now detect the envelope and record a
   * LOUD error, never silence.
   *
   * v7+ shape: `{ vulnerabilities: { <name>: { name, severity, via: [ {source, title,
   * url, severity, cwe:[…]} | <string> ] } } }`. Only object `via` entries are real
   * advisories; string entries are references to other packages and are skipped.
   * v6 shape: `{ advisories: { <id>: { module_name, severity, title, url, cwe } } }`.
   * @param {Object} data - npm audit JSON results
   */
  parseNpmAuditResults(data) {
    if (!data || typeof data !== 'object') return;

    // F3: the npm audit error envelope (no lockfile → EAUDITNOLOCK, registry error,
    // …). npm exited non-zero and printed an error, not a report — nothing was
    // audited. Record it as a loud skip; NEVER read as a clean scan.
    if (data.error && typeof data.error === 'object') {
      const code = data.error.code || 'unknown';
      const summary = data.error.summary ? `: ${data.error.summary}` : '';
      this.errors.push({ tool: 'npm-audit', error: `npm audit did not run (${code})${summary}` });
      return;
    }

    // npm v6: the flat `advisories` map (mirrors dependency-auditor's v1 handling).
    if (data.advisories && typeof data.advisories === 'object') {
      for (const adv of Object.values(data.advisories)) {
        if (!adv || typeof adv !== 'object') continue;
        this.findings.push({
          tool: 'npm-audit',
          package: adv.module_name || 'unknown',
          version: null,
          advisory: adv.id != null ? String(adv.id) : (adv.url || null),
          title: adv.title || `Vulnerable dependency ${adv.module_name || 'unknown'}`,
          severity: this.mapNamedSeverity(adv.severity),
          cwe: Array.isArray(adv.cwe) ? adv.cwe[0] : (adv.cwe || (Array.isArray(adv.cwes) ? adv.cwes[0] : null)),
          url: adv.url || null,
          fixAvailable: null,
          file: 'package-lock.json'
        });
      }
    }

    if (!data.vulnerabilities || typeof data.vulnerabilities !== 'object') return;

    for (const [name, entry] of Object.entries(data.vulnerabilities)) {
      if (!entry || typeof entry !== 'object') continue;
      const vias = Array.isArray(entry.via) ? entry.via : [];
      const advisories = vias.filter((v) => v && typeof v === 'object');

      if (advisories.length === 0) {
        // A vulnerability whose `via` are all string references still carries a
        // package-level severity; record it so a transitive advisory is not lost.
        this.findings.push({
          tool: 'npm-audit',
          package: entry.name || name,
          version: null,
          advisory: null,
          title: `Vulnerable dependency ${entry.name || name}`,
          severity: this.mapNamedSeverity(entry.severity),
          cwe: null,
          fixAvailable: Boolean(entry.fixAvailable),
          file: 'package-lock.json'
        });
        continue;
      }

      for (const adv of advisories) {
        this.findings.push({
          tool: 'npm-audit',
          package: adv.name || entry.name || name,
          version: null,
          advisory: adv.source != null ? String(adv.source) : (adv.url || null),
          title: adv.title || `Vulnerable dependency ${entry.name || name}`,
          severity: this.mapNamedSeverity(adv.severity || entry.severity),
          cwe: Array.isArray(adv.cwe) ? adv.cwe[0] : (adv.cwe || null),
          url: adv.url || null,
          fixAvailable: Boolean(entry.fixAvailable),
          file: 'package-lock.json'
        });
      }
    }
  }

  /**
   * Parse `pip-audit --format json` output. Newer pip-audit emits
   * `{ dependencies: [ {name, version, vulns:[ {id, fix_versions, description,
   * aliases} ]} ] }`; older versions emit the bare dependencies array. Both are
   * handled. pip-audit's `--format json` usually OMITS a severity; when it does, we
   * fail SECURE (F4): an unrated finding is a real, known advisory the human must
   * review, so it defaults to HIGH — never a non-blocking MEDIUM that lets a Python
   * dependency RCE ship green. We never fabricate a precise score; when pip-audit DOES
   * carry a severity we honor it verbatim via the shared scorer.
   * @param {Object|Array} data - pip-audit JSON results
   */
  parsePipAuditResults(data) {
    const deps = Array.isArray(data)
      ? data
      : (data && Array.isArray(data.dependencies) ? data.dependencies : []);

    for (const dep of deps) {
      if (!dep || typeof dep !== 'object') continue;
      for (const vuln of dep.vulns || []) {
        this.findings.push({
          tool: 'pip-audit',
          package: dep.name || 'unknown',
          version: dep.version || null,
          advisory: vuln.id || null,
          title: vuln.description ? String(vuln.description).slice(0, 120) : (vuln.id || 'vulnerability'),
          // F4 fail-secure: honor an explicit severity if present, else HIGH (never
          // a fabricated precise score, never a non-blocking default).
          severity: vuln.severity != null ? severityFromCvss(vuln.severity, SEVERITY) : SEVERITY.HIGH,
          aliases: Array.isArray(vuln.aliases) ? vuln.aliases : [],
          fixVersions: Array.isArray(vuln.fix_versions) ? vuln.fix_versions : [],
          file: 'requirements.txt'
        });
      }
    }
  }

  /**
   * Parse `cargo audit --json` output. Shape:
   * `{ vulnerabilities: { found, count, list: [ { advisory:{id, title, url, cvss},
   * package:{name, version} } ] } }`.
   * @param {Object} data - cargo audit JSON results
   */
  parseCargoAuditResults(data) {
    const vulns = data && data.vulnerabilities && Array.isArray(data.vulnerabilities.list)
      ? data.vulnerabilities.list
      : [];

    for (const item of vulns) {
      if (!item || typeof item !== 'object') continue;
      const adv = item.advisory || {};
      const pkg = item.package || {};
      this.findings.push({
        tool: 'cargo-audit',
        package: pkg.name || 'unknown',
        version: pkg.version || null,
        advisory: adv.id || null,
        title: adv.title || adv.id || 'vulnerability',
        severity: this.mapCvssSeverity(adv.cvss),
        url: adv.url || null,
        file: 'Cargo.lock'
      });
    }
  }

  /**
   * Map an OSV vulnerability to a standard severity: prefer the GitHub-advisory
   * `database_specific.severity` string; else derive from the CVSS entries in the
   * `severity` array; else default to MEDIUM (never fabricate a precise level).
   *
   * F1: OSV emits `severity[].score` as a CVSS **vector** string
   * (`CVSS:3.1/AV:N/...`), NOT a bare number — `parseFloat` of it is NaN, which used
   * to silently downgrade a CVSS-vector CRITICAL to a non-blocking MEDIUM. All scores
   * (vector OR numeric) now route through the shared `severityFromCvss`, taking the
   * MAX across multiple CVSS entries so a CRITICAL is never buried.
   * @param {Object} vuln - a single OSV vulnerability object
   * @returns {string} standard severity
   */
  mapOSVSeverity(vuln) {
    if (vuln && vuln.database_specific && vuln.database_specific.severity) {
      return this.mapNamedSeverity(vuln.database_specific.severity);
    }
    if (vuln && Array.isArray(vuln.severity)) {
      const scores = vuln.severity
        .map((s) => s && (s.score || s.value))
        .filter((x) => x != null);
      if (scores.length) return severityFromCvss(scores, SEVERITY);
    }
    return SEVERITY.MEDIUM;
  }

  /**
   * Map a named severity (critical/high/moderate/medium/low/info, any case) to the
   * standard severity. `moderate` (npm/GitHub) maps to MEDIUM.
   * @param {string} severity
   * @returns {string} standard severity
   */
  mapNamedSeverity(severity) {
    const map = {
      critical: SEVERITY.CRITICAL,
      high: SEVERITY.HIGH,
      moderate: SEVERITY.MEDIUM,
      medium: SEVERITY.MEDIUM,
      low: SEVERITY.LOW,
      info: SEVERITY.INFO,
      informational: SEVERITY.INFO
    };
    return map[String(severity || '').toLowerCase()] || SEVERITY.MEDIUM;
  }

  /**
   * Map a CVSS vector OR numeric score to a standard severity, via the shared
   * single-source scorer. F1: RustSec `advisory.cvss` is a CVSS **vector** string
   * (`CVSS:3.1/AV:N/...`); `parseFloat` of it is NaN, which used to downgrade a
   * CVSS-vector CRITICAL to a non-blocking MEDIUM. `severityFromCvss` base-scores the
   * vector and bands it correctly (an unparseable vector bands HIGH, never MEDIUM).
   * @param {string|number|null} cvss
   * @returns {string} standard severity
   */
  mapCvssSeverity(cvss) {
    if (cvss == null) return SEVERITY.MEDIUM;
    return severityFromCvss(cvss, SEVERITY);
  }

  /**
   * Deduplicate findings by (package, advisory-id) — the same advisory for the same
   * package, reported by more than one lockfile or tool, collapses to one, keeping
   * the higher severity.
   * @returns {Array} unique findings
   */
  deduplicateFindings() {
    const seen = new Map();
    const order = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];

    for (const finding of this.findings) {
      const key = `${finding.package}::${finding.advisory || finding.title}`;
      if (!seen.has(key)) {
        seen.set(key, finding);
      } else {
        const existing = seen.get(key);
        if (order.indexOf(finding.severity) < order.indexOf(existing.severity)) {
          seen.set(key, finding);
        }
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Generate summary statistics (same shape as sast-runner's generateSummary).
   * @param {Array} findings - deduplicated findings
   * @param {Array} languages - detected languages
   * @param {number} duration - scan duration in ms
   * @returns {Object} summary statistics
   */
  generateSummary(findings, languages, duration) {
    const bySeverity = {};
    for (const severity of Object.values(SEVERITY)) {
      bySeverity[severity] = findings.filter((f) => f.severity === severity).length;
    }

    const byTool = {};
    const byPackage = {};
    for (const finding of findings) {
      byTool[finding.tool] = (byTool[finding.tool] || 0) + 1;
      if (finding.package) byPackage[finding.package] = (byPackage[finding.package] || 0) + 1;
    }

    return {
      total: findings.length,
      bySeverity,
      byTool,
      byPackage,
      languages,
      duration: Math.round(duration / 1000),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate a human-readable report (same shape as sast-runner's generateReport).
   * @param {Array} findings - findings
   * @param {Object} summary - summary statistics
   * @returns {string} report text
   */
  generateReport(findings, summary) {
    const lines = [];
    lines.push('SCA Dependency-Vulnerability Report');
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`Scan Date: ${summary.timestamp}`);
    lines.push(`Languages: ${summary.languages.join(', ')}`);
    lines.push(`Duration: ${summary.duration}s`);
    lines.push(`Total Findings: ${summary.total}`);
    lines.push('');

    lines.push('Summary by Severity');
    lines.push('-'.repeat(30));
    for (const [severity, count] of Object.entries(summary.bySeverity)) {
      if (count > 0) lines.push(`  ${severity}: ${count}`);
    }
    lines.push('');

    for (const severity of [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW]) {
      const sev = findings.filter((f) => f.severity === severity);
      if (sev.length === 0) continue;
      lines.push(`${severity} Findings (${sev.length})`);
      lines.push('-'.repeat(30));
      for (const finding of sev.slice(0, 10)) {
        lines.push(`  [${finding.advisory || 'advisory'}] ${finding.package}${finding.version ? `@${finding.version}` : ''}`);
        lines.push(`    ${String(finding.title).substring(0, 80)}`);
      }
      if (sev.length > 10) lines.push(`  ... and ${sev.length - 10} more ${severity} findings`);
      lines.push('');
    }

    if (this.errors.length > 0) {
      lines.push('Scan Errors');
      lines.push('-'.repeat(30));
      for (const error of this.errors) {
        lines.push(`  [${error.tool}] ${error.error}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check if findings exceed a severity threshold (same shape as sast-runner).
   * @param {string} threshold - severity threshold
   * @returns {Object} pass/fail result
   */
  checkThreshold(threshold = SEVERITY.HIGH) {
    const order = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
    const thresholdIndex = order.indexOf(threshold);

    // Count the DEDUPED set so the pass/fail tally matches what run() reports (the
    // same advisory reported by two lockfiles/tools is one finding, not two).
    const failing = this.deduplicateFindings().filter((f) => order.indexOf(f.severity) <= thresholdIndex);

    return {
      pass: failing.length === 0,
      failing: failing.length,
      threshold,
      message: failing.length === 0
        ? `PASS: No ${threshold} or higher severity dependency findings`
        : `FAIL: ${failing.length} dependency finding(s) at ${threshold} or higher severity`
    };
  }
}

module.exports = {
  SCARunner,
  SEVERITY,
  SCA_TOOL_CONFIGS,
  PARSEABLE_NATIVE_TOOLS
};

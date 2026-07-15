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
    this.projectRoot = projectRoot;
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
   * @param {string} lang detected language name
   * @returns {{ native: (string|null), osvUniversal: boolean }}
   */
  scaRouteFor(lang) {
    const config = SCA_TOOL_CONFIGS[lang];
    const native = config && config.native;
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

    if (languages.length === 0) {
      return {
        success: true,
        findings: [],
        summary: this.generateSummary([], languages, 0),
        message: detected.length === 0
          ? 'No supported languages detected in project — no dependencies to audit'
          : 'All detected ecosystems are audited by DependencyAuditor — nothing further for SCA to audit'
      };
    }

    let scannersRun = 0;

    // Native parsers, one per language that routes to one and whose tool is present.
    const nativeLangs = languages.filter((l) => this.scaRouteFor(l).native);
    for (const lang of nativeLangs) {
      if (await this.runNativeScanner(lang)) {
        scannersRun++;
      }
    }

    // osv-scanner universal: a SINGLE pass for the whole repo, run iff at least one
    // detected language routes to it and the tool is installed. osv-scanner is
    // lockfile-based and multi-ecosystem, so one pass covers every osv-routed
    // language at once.
    const anyOsvRouted = languages.some((l) => this.scaRouteFor(l).osvUniversal);
    if (anyOsvRouted && this.isToolAvailable('osv-scanner')) {
      scannersRun++;
      await this.runOsvScanner();
    }

    if (scannersRun === 0) {
      return {
        success: false,
        scanned: false,
        findings: [],
        errors: this.errors,
        reason: 'no dependency (SCA) scanner available',
        summary: this.generateSummary([], languages, Date.now() - startTime),
        message: 'No SCA scanner available for the detected language(s) — nothing was scanned'
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
    let out = '';
    try {
      out = execFileSync('pip-audit', ['--format', 'json'], {
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
   */
  async runOsvScanner() {
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
        return;
      }
    }

    try {
      this.parseOSVResults(JSON.parse(out));
    } catch (e) {
      this.errors.push({ tool: 'osv-scanner', error: e.message });
    }
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
          // F2: osv discovers every lockfile in the repo, including those for
          // ecosystems DependencyAuditor already audits. Drop such findings so the
          // same CVE is not counted by both runners. Only active inside run() (when
          // _deferredLanguages is set); standalone parse still sees every finding.
          if (this._isEcosystemDeferred(info.ecosystem)) continue;
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
    return langs.some((l) => this._deferredLanguages.has(l));
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

/**
 * SAST Runner
 * Orchestrates static application security testing across multiple tools and languages
 *
 * Supported tools:
 * - Semgrep (multi-language)
 * - Bandit (Python)
 * - gosec (Go)
 * - ESLint with security plugins (JavaScript/TypeScript)
 * - SpotBugs with FindSecBugs (Java)
 */

const { execSync, execFileSync } = require('child_process');
const safeFs = require('./safe-fs');
const path = require('path');
const registry = require('./capability-registry');

/**
 * Severity levels aligned with CVSS
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
 * CWE to severity mapping for common vulnerabilities
 * @type {Object}
 */
const CWE_SEVERITY_MAP = {
  // Critical
  'CWE-78': SEVERITY.CRITICAL,   // OS Command Injection
  'CWE-89': SEVERITY.CRITICAL,   // SQL Injection
  'CWE-94': SEVERITY.CRITICAL,   // Code Injection
  'CWE-502': SEVERITY.CRITICAL,  // Deserialization
  'CWE-798': SEVERITY.CRITICAL,  // Hardcoded Credentials

  // High
  'CWE-22': SEVERITY.HIGH,       // Path Traversal
  'CWE-79': SEVERITY.HIGH,       // XSS
  'CWE-352': SEVERITY.HIGH,      // CSRF
  'CWE-611': SEVERITY.HIGH,      // XXE
  'CWE-918': SEVERITY.HIGH,      // SSRF

  // Medium
  'CWE-327': SEVERITY.MEDIUM,    // Weak Crypto
  'CWE-328': SEVERITY.MEDIUM,    // Weak Hash
  'CWE-330': SEVERITY.MEDIUM,    // Insufficient Randomness
  'CWE-532': SEVERITY.MEDIUM,    // Log Injection
  'CWE-614': SEVERITY.MEDIUM,    // Sensitive Cookie without Secure

  // Low
  'CWE-200': SEVERITY.LOW,       // Information Disclosure
  'CWE-209': SEVERITY.LOW,       // Error Info Disclosure
  'CWE-1004': SEVERITY.LOW       // Sensitive Cookie without HttpOnly
};

/**
 * The native tools this runner has a REAL result parser for. Language detection is
 * now the capability registry's job (20 languages, glob-aware), but PARSING stays
 * here — and we only have parsers for these four. A detected language is scanned by
 * its native tool ONLY when TOOL_CONFIGS maps it to one of these; every other
 * language (rust→cargo-audit, php→psalm, ruby→brakeman, java→spotbugs, c→cppcheck,
 * sql→sqlfluff, …) is covered by the multi-language semgrep UNIVERSAL config, which
 * we parse. We NEVER invoke a scanner whose output we cannot parse — that would
 * fabricate findings or silently drop them. `semgrep` is the universal fallback, not
 * a per-language primary, so it is not in this native-primary set.
 * @type {Set<string>}
 */
const PARSEABLE_NATIVE_TOOLS = new Set(['bandit', 'gosec', 'eslint']);

/**
 * SAST Tool configurations per language
 * @type {Object}
 */
const TOOL_CONFIGS = {
  python: {
    primary: 'bandit',
    command: 'bandit -r . -f json -ll',
    fallback: 'semgrep --config=p/python --json .'
  },
  javascript: {
    primary: 'eslint',
    command: 'npx eslint --plugin security --format json .',
    fallback: 'semgrep --config=p/javascript --json .'
  },
  typescript: {
    primary: 'eslint',
    command: 'npx eslint --plugin security --format json .',
    fallback: 'semgrep --config=p/typescript --json .'
  },
  go: {
    primary: 'gosec',
    command: 'gosec -fmt=json ./...',
    fallback: 'semgrep --config=p/golang --json .'
  },
  java: {
    primary: 'spotbugs',
    command: 'mvn com.github.spotbugs:spotbugs-maven-plugin:spotbugs -Dspotbugs.xmlOutput=true',
    fallback: 'semgrep --config=p/java --json .'
  },
  universal: {
    primary: 'semgrep',
    command: 'semgrep --config=p/security-audit --config=p/owasp-top-ten --json .'
  }
};

/**
 * SAST Runner class
 * Orchestrates security scanning across multiple tools
 */
class SASTRunner {
  /**
   * Create a SAST Runner instance
   * @param {string} projectRoot - Root directory of the project
   * @param {Object} options - Configuration options
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      excludeDirs: ['node_modules', 'vendor', 'venv', '.git', '__pycache__', 'dist', 'build'],
      severityThreshold: SEVERITY.MEDIUM,
      timeout: 300000, // 5 minutes
      ...options
    };
    this.findings = [];
    this.errors = [];
  }

  /**
   * Detect languages used in the project.
   *
   * Delegates to the single, glob-aware capability registry
   * (`.ctoc/capabilities/languages/*.yaml`) — the one detection table the four
   * surfaces share — instead of a local, drifting, exact-filename-only copy. This
   * widens detection from the legacy eight to the full registry set (e.g. C via a
   * Makefile or `*.c`, C# via `*.csproj`, Elixir, Swift, Kotlin, SQL, …) while
   * keeping the return shape (a string[] of language names) the rest of this class
   * consumes. The registry read is fail-soft: an unreadable project root simply
   * yields no detections.
   *
   * @returns {string[]} Array of detected languages
   */
  detectLanguages() {
    const registryLangs = registry.detectLanguages(this.projectRoot) || [];
    const result = registryLangs.slice();
    // FN-1: the registry detects languages by MANIFEST markers/globs only, and the five
    // SAST-routed languages (python, javascript, typescript, go, java) have no source-file
    // glob markers. A repo of loose .py/.js/.ts/.go/.java files with no manifest therefore
    // detected as [] → run() reported success:true "no supported languages" and a serverless
    // handler with os.system(request.args["cmd"]) read as a clean pass. Augment detection
    // with a local, excludeDirs-honoring source-file scan so analyzable source is NEVER
    // invisible. Appended AFTER the registry order so the manifest-derived primary
    // (detectLanguages[0], the run target other modules consume) is preserved.
    for (const lang of this.detectSastSourceLanguages()) {
      if (!result.includes(lang)) result.push(lang);
    }
    return result;
  }

  /**
   * Detect analyzable source by the presence of its source files, recursively under the
   * project root, honoring excludeDirs (node_modules, venv, …). Symlinked directories are
   * skipped (they are not walked), which also avoids symlink loops. Bounded by a visit cap
   * so a pathological tree cannot hang detection.
   *
   * R8-D3: the set is the BROAD extension family semgrep's universal config can scan, not
   * just the five native-tool languages. A manifest-less php/ruby/rust/csharp/elixir/…/C
   * file used to detect as [] (the registry only matches manifest markers, and the local
   * scan only knew py/js/ts/go/java), so run() reported "no supported languages" and a real
   * SQL/command-injection sink read as a clean pass. Language names match the capability
   * registry so a source-derived detection dedups against a manifest-derived one.
   * @returns {Set<string>} detected language names
   */
  detectSastSourceLanguages() {
    const extToLang = {
      // Native-tool languages (bandit / gosec / eslint parsers)
      '.py': 'python',
      '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript',
      '.go': 'go',
      '.java': 'java',
      // Semgrep-universal languages (no native parser here → covered by semgrep universal)
      '.php': 'php',
      '.rb': 'ruby',
      '.rs': 'rust',
      '.cs': 'csharp',
      '.ex': 'elixir', '.exs': 'elixir',
      '.swift': 'swift',
      '.kt': 'kotlin', '.kts': 'kotlin',
      '.scala': 'scala', '.sc': 'scala',
      '.lua': 'lua',
      '.dart': 'dart',
      '.sol': 'solidity',
      '.c': 'c', '.h': 'c',
      '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
      '.sql': 'sql'
    };
    const allLangs = new Set(Object.values(extToLang));
    const exclude = new Set([...(this.options.excludeDirs || []), '.git']);
    const found = new Set();
    const MAX_ENTRIES = 100000;
    let visited = 0;

    const walk = (dir) => {
      if (found.size === allLangs.size) return;
      let entries;
      try {
        entries = safeFs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return; // unreadable dir → no evidence from here
      }
      for (const ent of entries) {
        if (++visited > MAX_ENTRIES) return;
        if (ent.isDirectory()) {
          if (exclude.has(ent.name)) continue;
          walk(path.join(dir, ent.name));
          if (found.size === allLangs.size) return;
        } else if (ent.isFile()) {
          const lang = extToLang[path.extname(ent.name).toLowerCase()];
          if (lang) found.add(lang);
        }
      }
    };

    if (typeof this.projectRoot === 'string' && this.projectRoot.length > 0) {
      walk(this.projectRoot);
    }
    return found;
  }

  /**
   * Add a finding, applying the CWE severity FLOOR (FN-2). Every tool severity mapper
   * caps at HIGH, so without this a CWE-78 (OS command injection) / CWE-89 (SQL
   * injection) / CWE-94 / CWE-502 / CWE-798 finding never reached CRITICAL and a gate
   * set to block on CRITICAL always passed. If the finding carries a CWE whose
   * CWE_SEVERITY_MAP entry is MORE severe than its tool-mapped severity, promote it.
   * Promotion only ever RAISES severity — a lower CWE floor never demotes a finding.
   * @param {Object} finding
   */
  addFinding(finding) {
    const floor = this.cweSeverityFloor(finding.cwe);
    if (floor && !this.isFloorExempt(finding)) {
      const order = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
      const cur = order.indexOf(finding.severity);
      const floorIdx = order.indexOf(floor);
      if (cur === -1 || floorIdx < cur) {
        finding.severity = floor;
      }
    }
    this.findings.push(finding);
  }

  /**
   * R8-D2: exempt known-noisy tool rules from the CWE severity FLOOR. Bandit's B603
   * (subprocess_without_shell_equals_true) and B607 (start_process_with_partial_path)
   * both map to CWE-78, yet they fire on essentially EVERY `subprocess.call([...])` even
   * with a static, safe argument list — they are LOW-severity, high-noise findings.
   * Forcing them to CRITICAL blocked clean Python builds on a CRITICAL gate. Excluding
   * exactly these two rule IDs from floor promotion (rather than gating on severity or
   * confidence) is the surgical fix: it preserves the floor for a genuine injection —
   * a semgrep ERROR/INFO CWE-78, or bandit B602 (shell=True) — which still reaches
   * CRITICAL, so Defect FN-2 is NOT reintroduced.
   * @param {Object} finding
   * @returns {boolean} true when this finding must keep its tool-assessed severity
   */
  isFloorExempt(finding) {
    const NOISY_BANDIT_RULES = new Set(['B603', 'B607']);
    return finding
      && finding.tool === 'bandit'
      && NOISY_BANDIT_RULES.has(finding.rule);
  }

  /**
   * Resolve the CWE severity floor for a finding's CWE identifier, normalizing the two
   * shapes tools emit: a canonical "CWE-78" string (semgrep/bandit) and a bare number
   * "78" (gosec's cwe.id). Returns the mapped SEVERITY or null when unknown/unmapped.
   * @param {string|number|null|undefined} cwe
   * @returns {string|null}
   */
  cweSeverityFloor(cwe) {
    // R8-D1 / R11: normalize ANY shape a tool (or a direct caller) emits to the full set
    // of canonical "CWE-<n>" tokens, then take the MOST SEVERE mapped floor across ALL of
    // them. Shapes handled:
    //   - clean string   "CWE-78"                        (semgrep/bandit, native path)
    //   - decorated       "CWE-78: OS Command Injection"  (semgrep metadata array item)
    //   - array           ["CWE-79: ...", "CWE-89: ..."]  (semgrep may tag several CWEs)
    //   - multi in string "CWE-79, CWE-89"                (several tokens in one field)
    //   - bare number     "89" or 89                      (gosec cwe.id — a purely-numeric field)
    // R11 fix: the old code reduced an array to element [0] and matched only the FIRST
    // "CWE-\d+" token, so a finding whose most-severe CWE was not first (e.g.
    // ["CWE-79","CWE-89"]) floored to the WRONG (lower) severity, dropping the CRITICAL
    // floor of the injection CWE. We now map EVERY token and keep the most severe.
    const tokens = this._cweTokens(cwe);
    if (tokens.length === 0) return null;
    let best = null;
    let bestRank = Infinity;
    for (const tok of tokens) {
      const sev = CWE_SEVERITY_MAP[tok];
      if (!sev) continue;
      const rank = this._severityRank(sev);
      if (rank < bestRank) { bestRank = rank; best = sev; }
    }
    return best;
  }

  /**
   * R11: normalize a raw cwe value (string, number, or array of either) to the ordered,
   * de-duplicated list of canonical "CWE-<n>" tokens it genuinely contains.
   *   - Each item is scanned for EVERY "CWE[-\s_]?<n>" token (so a decorated multi-CWE
   *     string like "CWE-79, CWE-89" yields both).
   *   - A structured bare-number field (gosec's cwe.id is the ENTIRE field, e.g. "89")
   *     is promoted to "CWE-89" ONLY when the trimmed item is purely numeric. This
   *     preserves gosec's needs while GUARDING the pre-existing nit: a free-text string
   *     carrying a stray digit ("line 89 of foo") is NOT scraped into a spurious CWE.
   * @param {string|number|Array|null|undefined} cwe
   * @returns {string[]}
   */
  _cweTokens(cwe) {
    if (cwe === null || cwe === undefined) return [];
    const items = Array.isArray(cwe) ? cwe : [cwe];
    const out = [];
    const seen = new Set();
    const push = (tok) => { if (!seen.has(tok)) { seen.add(tok); out.push(tok); } };
    for (const item of items) {
      if (item === null || item === undefined) continue;
      const s = String(item).trim();
      if (!s) continue;
      const matches = s.match(/CWE[-\s_]?\d+/gi);
      if (matches) {
        for (const m of matches) push(`CWE-${m.match(/\d+/)[0]}`);
        continue;
      }
      // Structured bare-number fallback — only a purely-numeric field, never a scrape.
      if (/^\d+$/.test(s)) push(`CWE-${s}`);
    }
    return out;
  }

  /**
   * R11: rank a severity so a lower index is MORE severe. Unknown → Infinity (least severe).
   * @param {string} sev
   * @returns {number}
   */
  _severityRank(sev) {
    const order = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
    const i = order.indexOf(sev);
    return i === -1 ? Infinity : i;
  }

  /**
   * Decide HOW a detected language's security scan is performed, honestly. Returns
   * `{ native, semgrepUniversal }` where `native` is the name of a scanner this
   * runner can actually PARSE (one of bandit / gosec / eslint) or `null`, and
   * `semgrepUniversal` is true exactly when there is no native parser — in which case
   * the multi-language semgrep universal config (which we parse) is the coverage.
   *
   * This is the HONESTY boundary: a language is routed to a native scanner ONLY when
   * TOOL_CONFIGS maps it to a tool we can parse. Every other language — whose registry
   * `security` tool is something we cannot parse (cargo-audit, psalm, brakeman,
   * spotbugs, cppcheck, sqlfluff, detekt, oclint, …) — is routed to semgrep universal,
   * NEVER to a fabricated parser. `native` is therefore never a parser-less tool.
   *
   * @param {string} lang detected language name
   * @returns {{ native: (string|null), semgrepUniversal: boolean }}
   */
  securityRouteFor(lang) {
    const config = TOOL_CONFIGS[lang];
    const primary = config && config.primary;
    if (primary && PARSEABLE_NATIVE_TOOLS.has(primary)) {
      return { native: primary, semgrepUniversal: false };
    }
    return { native: null, semgrepUniversal: true };
  }

  /**
   * Check if a SAST tool is available
   * @param {string} tool - Tool name
   * @returns {boolean} True if tool is available
   */
  isToolAvailable(tool) {
    const checks = {
      semgrep: 'semgrep --version',
      bandit: 'bandit --version',
      gosec: 'gosec --version',
      eslint: 'npx eslint --version',
      spotbugs: 'mvn --version'
    };

    const command = checks[tool];
    if (!command) return false;

    try {
      execSync(command, { stdio: 'ignore', timeout: 10000 });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Run SAST scan on the project
   * @returns {Promise<Object>} Scan results
   */
  async run() {
    const startTime = Date.now();
    const languages = this.detectLanguages();

    if (languages.length === 0) {
      // R8-D4: verified-nothing is NEVER verified-clean. The old return was
      // `{ success: true }` with NO `scanned` field, so a caller keying on
      // result.scanned could not tell "nothing to scan" from "scanned clean" — and a
      // security gate reading `success` passed. When there is no analyzable source we
      // scanned nothing: report scanned:false / success:false, honestly.
      return {
        success: false,
        scanned: false,
        findings: [],
        errors: this.errors,
        reason: 'no analyzable source detected',
        summary: this.generateSummary([], [], Date.now() - startTime),
        message: 'No analyzable source files detected in project — nothing was scanned'
      };
    }

    // Track whether ANY scanner actually ran. A run in which zero scanners were
    // available is NOT a clean scan — it verified nothing. Reporting success there
    // would be fail-open at the module boundary (an exported class whose "success"
    // silently means "checked nothing").
    let scannersRun = 0;

    // Try Semgrep first (universal scanner). FAIL-OPEN FIX: count semgrep toward
    // scannersRun ONLY when its scan actually RAN and produced parseable output —
    // exactly how runLanguageScanner is consumed below, mirroring sca-runner's SCA7
    // osv handling. The old code did scannersRun++ on tool AVAILABILITY, BEFORE the
    // scan, and ignored runSemgrep's outcome: a semgrep that is installed but whose
    // invocation crashes (non-zero exit + no parseable stdout) then read as the SOLE
    // scanner, so scannersRun>0 skipped the fail-closed guard and run() returned
    // success:true / scanned:true / findings:[] — a crashed scanner reporting the
    // project clean. runSemgrep now returns false on crash, so a sole-scanner crash
    // falls through to the scannersRun===0 branch and surfaces the failure.
    if (this.isToolAvailable('semgrep')) {
      if (await this.runSemgrep()) scannersRun++;
    }

    // Run language-specific scanners
    for (const lang of languages) {
      if (await this.runLanguageScanner(lang)) {
        scannersRun++;
      }
    }

    if (scannersRun === 0) {
      return {
        success: false,
        scanned: false,
        findings: [],
        errors: this.errors,
        reason: 'no security scanner available',
        summary: this.generateSummary([], languages, Date.now() - startTime),
        message: 'No security scanner available for the detected language(s) — nothing was scanned'
      };
    }

    // Deduplicate findings
    const uniqueFindings = this.deduplicateFindings();

    // Sort by severity
    uniqueFindings.sort((a, b) => {
      const severityOrder = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
      return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
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
   * Run Semgrep universal scanner.
   *
   * Returns whether the scan actually RAN SUCCESSFULLY (produced parseable output), so
   * run() counts it toward scannersRun ONLY on a genuine execution — mirroring
   * runLanguageScanner and sca-runner's runOsvScanner. A non-zero exit that still
   * carries valid findings JSON (semgrep's normal "findings present" path) parses and
   * returns true; a real crash (non-zero exit with no parseable stdout, or unparseable
   * output) records the error and returns false, never reading as a clean pass.
   * @returns {Promise<boolean>} true iff semgrep ran and its output parsed
   */
  async runSemgrep() {
    try {
      // INJ-1: build an argv array and invoke with NO shell, so a shell metacharacter in
      // an excludeDirs value (e.g. `$(touch /tmp/PWNED)`) is passed to semgrep literally
      // instead of being interpreted by /bin/sh. Each `--exclude=<dir>` is its own argv
      // element. The old execSync SHELL-string interpolation was a command-injection sink.
      const args = ['--config=p/security-audit', '--config=p/owasp-top-ten', '--json'];
      for (const d of (this.options.excludeDirs || [])) {
        args.push(`--exclude=${d}`);
      }
      args.push('.');

      const result = execFileSync('semgrep', args, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024 // 50MB
      });

      const data = JSON.parse(result);
      this.parseSemgrepResults(data);
      return true;
    } catch (error) {
      if (error.stdout) {
        try {
          const data = JSON.parse(error.stdout);
          this.parseSemgrepResults(data);
          return true;
        } catch (e) {
          this.errors.push({ tool: 'semgrep', error: error.message });
          return false;
        }
      } else {
        this.errors.push({ tool: 'semgrep', error: error.message });
        return false;
      }
    }
  }

  /**
   * Run language-specific scanner
   * @param {string} lang - Language to scan
   * @returns {Promise<boolean>} true iff a native scanner ran and reliably scanned
   */
  async runLanguageScanner(lang) {
    // Honest routing: only run a NATIVE scanner we can parse. A language with no
    // native parser (route.native === null) is covered by the semgrep universal
    // pass in run(); returning false here means "no native scanner ran", never a
    // fabricated finding from an unparsed tool.
    const { native } = this.securityRouteFor(lang);
    if (!native) return false;
    if (!this.isToolAvailable(native)) {
      return false;
    }

    // FAIL-OPEN FIX: the inner run methods (runBandit/runGosec/runESLintSecurity)
    // record a crash by PUSHING to this.errors — they do not throw. The old code then
    // returned true UNCONDITIONALLY, so a native scanner that crashed (a traceback /
    // config error where findings JSON was expected) still counted toward scannersRun
    // and, as the sole scanner, let run() report the project clean. Snapshot the error
    // count and return true ONLY when this scanner's run added no error — so a crashed
    // native scanner returns false and is not counted, mirroring runSemgrep and
    // sca-runner's runOsvScanner (a crashed scanner never reads as a clean pass).
    const errorsBefore = this.errors.length;
    try {
      switch (native) {
        case 'bandit':
          await this.runBandit();
          break;
        case 'gosec':
          await this.runGosec();
          break;
        case 'eslint':
          await this.runESLintSecurity();
          break;
        default:
          // Unreachable: PARSEABLE_NATIVE_TOOLS gates route.native to exactly these
          // three. Fail-closed anyway — never run a tool we cannot parse.
          return false;
      }
    } catch (error) {
      this.errors.push({ tool: native, language: lang, error: error.message });
    }
    return this.errors.length === errorsBefore;
  }

  /**
   * Run Bandit for Python
   */
  async runBandit() {
    try {
      // INJ-1: no shell — argv array so a metacharacter in an exclude value is literal.
      // INJ-2: bandit takes a SINGLE `--exclude=<comma-separated-list>`. The old code
      // prefixed each dir with `--exclude=` AND wrapped the join in another `--exclude=`,
      // emitting the malformed `--exclude=--exclude=a,b` — bandit then silently failed to
      // exclude anything and scanned node_modules/venv. Emit exactly one correct exclude.
      const args = ['-r', '.', '-f', 'json', '-ll'];
      const excludeDirs = this.options.excludeDirs || [];
      if (excludeDirs.length > 0) {
        args.push(`--exclude=${excludeDirs.join(',')}`);
      }

      const result = execFileSync('bandit', args, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8'
      });

      const data = JSON.parse(result);
      this.parseBanditResults(data);
    } catch (error) {
      // Bandit exits non-zero when findings exist AND when it crashes. The two are
      // told apart by the stdout: valid findings JSON → parse; anything else (a
      // traceback / config error) is a scanner that RAN and produced garbage — an
      // error the consumer surfaces as a loud skip, never silence. Mirrors
      // runSemgrep exactly (fail-closed).
      if (error.stdout) {
        try {
          const data = JSON.parse(error.stdout);
          this.parseBanditResults(data);
        } catch (e) {
          this.errors.push({ tool: 'bandit', error: error.message });
        }
      } else {
        this.errors.push({ tool: 'bandit', error: error.message });
      }
    }
  }

  /**
   * Run gosec for Go
   */
  async runGosec() {
    try {
      const command = 'gosec -fmt=json ./...';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8'
      });

      const data = JSON.parse(result);
      this.parseGosecResults(data);
    } catch (error) {
      // gosec exits non-zero both on findings and on a crash. Valid findings JSON →
      // parse; a panic/traceback/config error on stdout, or no stdout at all, is a
      // scanner failure that must surface (fail-closed, mirroring runSemgrep).
      if (error.stdout) {
        try {
          const data = JSON.parse(error.stdout);
          this.parseGosecResults(data);
        } catch (e) {
          this.errors.push({ tool: 'gosec', error: error.message });
        }
      } else {
        this.errors.push({ tool: 'gosec', error: error.message });
      }
    }
  }

  /**
   * Run ESLint with security plugins
   */
  async runESLintSecurity() {
    // M13 (cross-platform): invoke npx via an argument array with no shell, so
    // there is no POSIX-only stderr redirect (the null device is absent on
    // Windows) and no POSIX-only success-forcing shell operator. On Windows the
    // npx launcher is named npx.cmd.
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = ['eslint', '--plugin', 'security', '--format', 'json', '.'];

    let out = '';
    try {
      out = execFileSync(npx, args, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        // The stdio setting discards stderr without a shell redirect.
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (error) {
      // ESLint exits non-zero when it finds issues but still prints its JSON report
      // to stdout, which the error object carries. If there is no stdout, ESLint
      // ran but produced nothing usable (a crash / config error to stderr) — that
      // is a scanner failure, recorded loudly (this method is only reached after
      // isToolAvailable('eslint') already confirmed ESLint is installed). Mirrors
      // runSemgrep's fail-closed shape.
      out = (error && error.stdout) ? String(error.stdout) : '';
      if (!(out && out.trim())) {
        this.errors.push({ tool: 'eslint-security', error: error.message });
        return;
      }
    }

    if (out && out.trim()) {
      try {
        this.parseESLintResults(JSON.parse(out));
      } catch (e) {
        // Ran and emitted NON-JSON (a crash / config error printed to stdout).
        // A crashed scanner must never read as a clean scan.
        this.errors.push({ tool: 'eslint-security', error: e.message });
      }
    } else {
      this.errors.push({ tool: 'eslint-security', error: 'eslint-security produced no output' });
    }
  }

  /**
   * Parse Semgrep JSON output
   * @param {Object} data - Semgrep JSON results
   */
  parseSemgrepResults(data) {
    if (!data.results) return;

    for (const result of data.results) {
      const finding = {
        tool: 'semgrep',
        rule: result.check_id,
        file: result.path,
        line: result.start.line,
        column: result.start.col,
        message: result.extra.message,
        severity: this.mapSemgrepSeverity(result.extra.severity),
        cwe: this.extractCWE(result.extra.metadata),
        owasp: result.extra.metadata?.owasp,
        code: result.extra.lines,
        fix: result.extra.fix,
        confidence: result.extra.metadata?.confidence || 'MEDIUM'
      };

      this.addFinding(finding);
    }
  }

  /**
   * Parse Bandit JSON output
   * @param {Object} data - Bandit JSON results
   */
  parseBanditResults(data) {
    if (!data.results) return;

    for (const result of data.results) {
      const finding = {
        tool: 'bandit',
        rule: result.test_id,
        file: result.filename,
        line: result.line_number,
        column: result.col_offset || 0,
        message: result.issue_text,
        severity: this.mapBanditSeverity(result.issue_severity),
        cwe: this.extractCWEFromBandit(result.test_id),
        code: result.code,
        confidence: result.issue_confidence
      };

      this.addFinding(finding);
    }
  }

  /**
   * Parse gosec JSON output
   * @param {Object} data - gosec JSON results
   */
  parseGosecResults(data) {
    if (!data.Issues) return;

    for (const issue of data.Issues) {
      const finding = {
        tool: 'gosec',
        rule: issue.rule_id,
        file: issue.file,
        line: parseInt(issue.line, 10),
        column: parseInt(issue.column, 10),
        message: issue.details,
        severity: this.mapGosecSeverity(issue.severity),
        cwe: issue.cwe?.id,
        code: issue.code,
        confidence: issue.confidence
      };

      this.addFinding(finding);
    }
  }

  /**
   * Parse ESLint JSON output (security rules only)
   * @param {Array} data - ESLint JSON results
   */
  parseESLintResults(data) {
    if (!Array.isArray(data)) return;

    for (const file of data) {
      for (const message of file.messages || []) {
        // FN-3: keep any rule in the known security set. The old `.includes('security')`
        // substring test silently DROPPED the core dangerous built-ins (no-eval,
        // no-implied-eval, no-script-url) and non-'security'-named security plugins
        // (no-unsanitized/*, xss/*), so real code-injection findings never surfaced.
        if (!this.isSecurityRule(message.ruleId)) continue;

        const finding = {
          tool: 'eslint-security',
          rule: message.ruleId,
          file: file.filePath,
          line: message.line,
          column: message.column,
          message: message.message,
          severity: message.severity === 2 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          code: message.source
        };

        this.addFinding(finding);
      }
    }
  }

  /**
   * Decide whether an ESLint ruleId is a security rule we keep (FN-3). Matches a known
   * allowlist of exact rule IDs and security plugin prefixes rather than a bare
   * 'security' substring test, so the dangerous built-ins and the no-unsanitized / xss
   * plugins are not discarded.
   * @param {string} ruleId
   * @returns {boolean}
   */
  isSecurityRule(ruleId) {
    if (!ruleId) return false;
    const exact = new Set(['no-eval', 'no-implied-eval', 'no-script-url']);
    if (exact.has(ruleId)) return true;
    const prefixes = ['security/', 'no-unsanitized', 'xss'];
    if (prefixes.some(p => ruleId.startsWith(p))) return true;
    // Preserve the legacy behavior: any other security-named plugin still matches.
    return ruleId.includes('security');
  }

  /**
   * Map Semgrep severity to standard severity
   * @param {string} severity - Semgrep severity
   * @returns {string} Standard severity
   */
  mapSemgrepSeverity(severity) {
    const map = {
      ERROR: SEVERITY.HIGH,
      WARNING: SEVERITY.MEDIUM,
      INFO: SEVERITY.LOW
    };
    return map[severity] || SEVERITY.MEDIUM;
  }

  /**
   * Map Bandit severity to standard severity
   * @param {string} severity - Bandit severity
   * @returns {string} Standard severity
   */
  mapBanditSeverity(severity) {
    const map = {
      HIGH: SEVERITY.HIGH,
      MEDIUM: SEVERITY.MEDIUM,
      LOW: SEVERITY.LOW
    };
    return map[severity] || SEVERITY.MEDIUM;
  }

  /**
   * Map gosec severity to standard severity
   * @param {string} severity - gosec severity
   * @returns {string} Standard severity
   */
  mapGosecSeverity(severity) {
    const map = {
      HIGH: SEVERITY.HIGH,
      MEDIUM: SEVERITY.MEDIUM,
      LOW: SEVERITY.LOW
    };
    return map[severity] || SEVERITY.MEDIUM;
  }

  /**
   * Extract CWE from metadata
   * @param {Object} metadata - Result metadata
   * @returns {string|string[]|null} a single CWE-<n> for one token, an array for several, null when none
   */
  extractCWE(metadata) {
    if (!metadata) return null;
    // R8-D1: semgrep's universal config (the fallback for EVERY non-native language)
    // emits cwe as an array-with-description — ["CWE-78: OS Command Injection"] — never
    // the clean "CWE-78". The old `if (metadata.cwe) return metadata.cwe` returned that
    // raw array (so the later Array.isArray branch was dead) and the CWE-78 CRITICAL
    // floor never fired for any semgrep finding. Unwrap the array and strip the
    // ": description" suffix down to the canonical "CWE-<n>" head.
    // R11: keep EVERY CWE token the metadata carries, not just the first. A semgrep rule
    // may tag several CWEs of differing severity (["CWE-79: XSS", "CWE-89: SQL Injection"]);
    // dropping all but the first let the CWE severity floor pick the WRONG one. Return a
    // single "CWE-<n>" string for the common one-token case (callers/reporting rely on the
    // string shape) and the full array when a finding genuinely carries several.
    const raw = (metadata.cwe !== undefined && metadata.cwe !== null) ? metadata.cwe : metadata.cwe_id;
    const tokens = this._cweTokens(raw);
    if (tokens.length === 0) return null;
    return tokens.length === 1 ? tokens[0] : tokens;
  }

  /**
   * Extract CWE from Bandit test ID
   * @param {string} testId - Bandit test ID
   * @returns {string|null} CWE identifier
   */
  extractCWEFromBandit(testId) {
    const banditCWE = {
      B101: 'CWE-703',  // assert
      B102: 'CWE-78',   // exec
      B103: 'CWE-732',  // chmod
      B104: 'CWE-259',  // hardcoded_bind_all_interfaces
      B105: 'CWE-259',  // hardcoded_password_string
      B106: 'CWE-259',  // hardcoded_password_funcarg
      B107: 'CWE-259',  // hardcoded_password_default
      B108: 'CWE-377',  // hardcoded_tmp_directory
      B110: 'CWE-703',  // try_except_pass
      B112: 'CWE-703',  // try_except_continue
      B201: 'CWE-94',   // flask_debug_true
      B301: 'CWE-502',  // pickle
      B302: 'CWE-502',  // marshal
      B303: 'CWE-327',  // md5
      B304: 'CWE-327',  // des
      B305: 'CWE-327',  // cipher_modes
      B306: 'CWE-327',  // mktemp_q
      B307: 'CWE-94',   // eval
      B308: 'CWE-94',   // mark_safe
      B310: 'CWE-918',  // urllib_urlopen
      B311: 'CWE-330',  // random
      B312: 'CWE-295',  // telnetlib
      B313: 'CWE-611',  // xml_bad_cElementTree
      B314: 'CWE-611',  // xml_bad_ElementTree
      B315: 'CWE-611',  // xml_bad_expatreader
      B316: 'CWE-611',  // xml_bad_expatbuilder
      B317: 'CWE-611',  // xml_bad_sax
      B318: 'CWE-611',  // xml_bad_minidom
      B319: 'CWE-611',  // xml_bad_pulldom
      B320: 'CWE-611',  // xml_bad_etree
      B321: 'CWE-295',  // ftplib
      B323: 'CWE-295',  // unverified_context
      B324: 'CWE-327',  // hashlib
      B501: 'CWE-295',  // request_with_no_cert_validation
      B502: 'CWE-295',  // ssl_with_bad_version
      B503: 'CWE-295',  // ssl_with_bad_defaults
      B504: 'CWE-295',  // ssl_with_no_version
      B505: 'CWE-326',  // weak_cryptographic_key
      B506: 'CWE-502',  // yaml_load
      B507: 'CWE-295',  // ssh_no_host_key_verification
      B601: 'CWE-78',   // paramiko_calls
      B602: 'CWE-78',   // subprocess_popen_with_shell_equals_true
      B603: 'CWE-78',   // subprocess_without_shell_equals_true
      B604: 'CWE-78',   // any_other_function_with_shell_equals_true
      B605: 'CWE-78',   // start_process_with_a_shell
      B606: 'CWE-78',   // start_process_with_no_shell
      B607: 'CWE-78',   // start_process_with_partial_path
      B608: 'CWE-89',   // hardcoded_sql_expressions
      B609: 'CWE-78',   // linux_commands_wildcard_injection
      B610: 'CWE-78',   // django_extra_used
      B611: 'CWE-78',   // django_rawsql_used
      B612: 'CWE-94',   // logging_config_insecure_listen
      B701: 'CWE-79',   // jinja2_autoescape_false
      B702: 'CWE-79',   // use_of_mako_templates
      B703: 'CWE-611'   // django_mark_safe
    };

    return banditCWE[testId] || null;
  }

  /**
   * Deduplicate findings from multiple tools
   * @returns {Array} Unique findings
   */
  deduplicateFindings() {
    const seen = new Map();

    for (const finding of this.findings) {
      // FN-4: key on the FULL message. The old `message.substring(0, 50)` collapsed two
      // DISTINCT findings at the same file:line whenever they shared a 50-char prefix
      // (common for templated messages like "Potential injection sink detected in …"),
      // silently dropping one real finding.
      const key = `${finding.file}:${finding.line}:${finding.message}`;

      if (!seen.has(key)) {
        seen.set(key, finding);
      } else {
        // Keep the higher severity finding
        const existing = seen.get(key);
        const severityOrder = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
        if (severityOrder.indexOf(finding.severity) < severityOrder.indexOf(existing.severity)) {
          seen.set(key, finding);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Generate summary statistics
   * @param {Array} findings - Deduplicated findings
   * @param {Array} languages - Detected languages
   * @param {number} duration - Scan duration in ms
   * @returns {Object} Summary statistics
   */
  generateSummary(findings, languages, duration) {
    const bySeverity = {};
    for (const severity of Object.values(SEVERITY)) {
      bySeverity[severity] = findings.filter(f => f.severity === severity).length;
    }

    const byTool = {};
    for (const finding of findings) {
      byTool[finding.tool] = (byTool[finding.tool] || 0) + 1;
    }

    const byCWE = {};
    for (const finding of findings) {
      if (finding.cwe) {
        byCWE[finding.cwe] = (byCWE[finding.cwe] || 0) + 1;
      }
    }

    return {
      total: findings.length,
      bySeverity,
      byTool,
      byCWE,
      languages,
      duration: Math.round(duration / 1000),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate human-readable report
   * @param {Array} findings - Findings
   * @param {Object} summary - Summary statistics
   * @returns {string} Report text
   */
  generateReport(findings, summary) {
    const lines = [];

    lines.push('SAST Security Scan Report');
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
      if (count > 0) {
        lines.push(`  ${severity}: ${count}`);
      }
    }
    lines.push('');

    // Group findings by severity
    for (const severity of [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW]) {
      const severityFindings = findings.filter(f => f.severity === severity);
      if (severityFindings.length === 0) continue;

      lines.push(`${severity} Findings (${severityFindings.length})`);
      lines.push('-'.repeat(30));

      for (const finding of severityFindings.slice(0, 10)) {
        lines.push(`  [${finding.rule}] ${finding.file}:${finding.line}`);
        lines.push(`    ${finding.message.substring(0, 80)}`);
        if (finding.cwe) {
          lines.push(`    CWE: ${finding.cwe}`);
        }
      }

      if (severityFindings.length > 10) {
        lines.push(`  ... and ${severityFindings.length - 10} more ${severity} findings`);
      }
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
   * Check if findings exceed threshold
   * @param {string} threshold - Severity threshold
   * @returns {Object} Pass/fail result
   */
  checkThreshold(threshold = SEVERITY.HIGH) {
    const severityOrder = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW, SEVERITY.INFO];
    const thresholdIndex = severityOrder.indexOf(threshold);

    const failing = this.findings.filter(f => {
      const findingIndex = severityOrder.indexOf(f.severity);
      return findingIndex <= thresholdIndex;
    });

    return {
      pass: failing.length === 0,
      failing: failing.length,
      threshold,
      message: failing.length === 0
        ? `PASS: No ${threshold} or higher severity findings`
        : `FAIL: ${failing.length} finding(s) at ${threshold} or higher severity`
    };
  }
}

module.exports = {
  SASTRunner,
  SEVERITY,
  CWE_SEVERITY_MAP,
  TOOL_CONFIGS
};

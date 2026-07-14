/**
 * Dependency Auditor
 * Scans project dependencies for known vulnerabilities using multiple tools
 *
 * Supported package managers:
 * - npm/yarn/pnpm (Node.js)
 * - pip/pipenv/poetry (Python)
 * - go mod (Go)
 * - cargo (Rust)
 * - maven/gradle (Java)
 * - bundler (Ruby)
 * - composer (PHP)
 */

const { execSync } = require('child_process');
const safeFs = require('./safe-fs');
const path = require('path');

/**
 * Vulnerability severity levels
 * @type {Object}
 */
const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MODERATE: 'MODERATE',
  LOW: 'LOW',
  INFO: 'INFO'
};

/**
 * Package manager detection markers
 * @type {Object}
 */
const PACKAGE_MANAGERS = {
  npm: {
    lockFiles: ['package-lock.json', 'npm-shrinkwrap.json'],
    configFiles: ['package.json'],
    command: 'npm audit --json'
  },
  yarn: {
    lockFiles: ['yarn.lock'],
    configFiles: ['package.json'],
    command: 'yarn audit --json'
  },
  pnpm: {
    lockFiles: ['pnpm-lock.yaml'],
    configFiles: ['package.json'],
    command: 'pnpm audit --json'
  },
  pip: {
    lockFiles: ['requirements.txt', 'requirements-dev.txt'],
    configFiles: ['setup.py', 'pyproject.toml'],
    command: 'pip-audit --format=json'
  },
  pipenv: {
    lockFiles: ['Pipfile.lock'],
    configFiles: ['Pipfile'],
    command: 'pipenv check --output json'
  },
  poetry: {
    lockFiles: ['poetry.lock'],
    configFiles: ['pyproject.toml'],
    command: 'poetry audit --json'
  },
  go: {
    lockFiles: ['go.sum'],
    configFiles: ['go.mod'],
    command: 'govulncheck -json ./...'
  },
  cargo: {
    lockFiles: ['Cargo.lock'],
    configFiles: ['Cargo.toml'],
    command: 'cargo audit --json'
  },
  maven: {
    lockFiles: [],
    configFiles: ['pom.xml'],
    command: 'mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=0 -Dformat=JSON'
  },
  gradle: {
    lockFiles: ['gradle.lockfile'],
    configFiles: ['build.gradle', 'build.gradle.kts'],
    command: './gradlew dependencyCheckAnalyze --output-format JSON'
  },
  bundler: {
    lockFiles: ['Gemfile.lock'],
    configFiles: ['Gemfile'],
    command: 'bundle audit check --format json'
  },
  composer: {
    lockFiles: ['composer.lock'],
    configFiles: ['composer.json'],
    command: 'composer audit --format=json'
  }
};

/**
 * Dependency Auditor class
 * Scans for vulnerable dependencies across multiple package managers
 */
class DependencyAuditor {
  /**
   * Create a Dependency Auditor instance
   * @param {string} projectRoot - Root directory of the project
   * @param {Object} options - Configuration options
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      severityThreshold: SEVERITY.MODERATE,
      timeout: 120000, // 2 minutes
      includeDevDependencies: true,
      ...options
    };
    this.vulnerabilities = [];
    this.errors = [];
  }

  /**
   * Detect package managers used in the project
   * @returns {string[]} Array of detected package managers
   */
  detectPackageManagers() {
    const detected = [];

    for (const [name, config] of Object.entries(PACKAGE_MANAGERS)) {
      // Check lock files first (more specific)
      for (const lockFile of config.lockFiles) {
        if (safeFs.existsSync(path.join(this.projectRoot, lockFile))) {
          if (!detected.includes(name)) {
            detected.push(name);
          }
          break;
        }
      }

      // Then check config files
      if (!detected.includes(name)) {
        for (const configFile of config.configFiles) {
          if (safeFs.existsSync(path.join(this.projectRoot, configFile))) {
            // For config-only detection, use the default manager
            if (configFile === 'package.json' && !detected.some(d => ['npm', 'yarn', 'pnpm'].includes(d))) {
              detected.push('npm');
            } else if (configFile === 'pyproject.toml' && !detected.some(d => ['pip', 'poetry'].includes(d))) {
              detected.push('pip');
            } else if (!detected.includes(name)) {
              detected.push(name);
            }
            break;
          }
        }
      }
    }

    return detected;
  }

  /**
   * Check if an audit tool is available
   * @param {string} manager - Package manager name
   * @returns {boolean} True if tool is available
   */
  isToolAvailable(manager) {
    const checks = {
      npm: 'npm --version',
      yarn: 'yarn --version',
      pnpm: 'pnpm --version',
      pip: 'pip-audit --version',
      pipenv: 'pipenv --version',
      poetry: 'poetry --version',
      go: 'govulncheck -version',
      cargo: 'cargo audit --version',
      maven: 'mvn --version',
      gradle: 'gradle --version',
      bundler: 'bundle audit --version',
      composer: 'composer --version'
    };

    const command = checks[manager];
    if (!command) return false;

    try {
      execSync(command, { stdio: 'ignore', timeout: 10000 });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Run dependency audit on the project
   * @returns {Promise<Object>} Audit results
   */
  async run() {
    const startTime = Date.now();
    const managers = this.detectPackageManagers();

    if (managers.length === 0) {
      return {
        success: true,
        vulnerabilities: [],
        summary: {
          total: 0,
          bySeverity: {},
          byPackageManager: {},
          duration: 0
        },
        message: 'No supported package managers detected'
      };
    }

    // Run audit for each detected package manager
    for (const manager of managers) {
      await this.runAudit(manager);
    }

    // Deduplicate vulnerabilities
    const uniqueVulns = this.deduplicateVulnerabilities();

    // Sort by severity
    uniqueVulns.sort((a, b) => {
      const severityOrder = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MODERATE, SEVERITY.LOW, SEVERITY.INFO];
      return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    });

    const duration = Date.now() - startTime;
    const summary = this.generateSummary(uniqueVulns, managers, duration);

    return {
      success: true,
      vulnerabilities: uniqueVulns,
      errors: this.errors,
      summary,
      message: this.generateReport(uniqueVulns, summary)
    };
  }

  /**
   * Run audit for a specific package manager
   * @param {string} manager - Package manager name
   */
  async runAudit(manager) {
    if (!this.isToolAvailable(manager)) {
      // Use npm as fallback for yarn/pnpm
      if (['yarn', 'pnpm'].includes(manager) && this.isToolAvailable('npm')) {
        await this.runNpmAudit();
        return;
      }
      this.errors.push({ manager, error: `${manager} audit tool not available` });
      return;
    }

    try {
      switch (manager) {
        case 'npm':
          await this.runNpmAudit();
          break;
        case 'yarn':
          await this.runYarnAudit();
          break;
        case 'pnpm':
          await this.runPnpmAudit();
          break;
        case 'pip':
          await this.runPipAudit();
          break;
        case 'go':
          await this.runGoVulncheck();
          break;
        case 'cargo':
          await this.runCargoAudit();
          break;
        case 'bundler':
          await this.runBundlerAudit();
          break;
        case 'composer':
          await this.runComposerAudit();
          break;
        default:
          this.errors.push({ manager, error: `Audit not implemented for ${manager}` });
      }
    } catch (error) {
      this.errors.push({ manager, error: error.message });
    }
  }

  /**
   * Run npm audit
   */
  async runNpmAudit() {
    try {
      const command = this.options.includeDevDependencies
        ? 'npm audit --json'
        : 'npm audit --json --omit=dev';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
      });

      this.parseNpmAuditResults(JSON.parse(result));
    } catch (error) {
      // npm audit exits with non-zero when vulnerabilities are found
      if (error.stdout) {
        try {
          this.parseNpmAuditResults(JSON.parse(error.stdout));
        } catch (e) {
          this.errors.push({ manager: 'npm', error: `Failed to parse audit results: ${e.message}` });
        }
      }
    }
  }

  /**
   * Run yarn audit
   */
  async runYarnAudit() {
    try {
      const command = 'yarn audit --json';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
      });

      // Yarn outputs NDJSON (newline-delimited JSON)
      const lines = result.trim().split('\n');
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'auditAdvisory') {
            this.parseYarnAdvisory(data.data);
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    } catch (error) {
      if (error.stdout) {
        const lines = error.stdout.trim().split('\n');
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'auditAdvisory') {
              this.parseYarnAdvisory(data.data);
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }
    }
  }

  /**
   * Run pnpm audit
   */
  async runPnpmAudit() {
    try {
      const command = 'pnpm audit --json';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
      });

      // pnpm audit has similar output to npm audit
      this.parseNpmAuditResults(JSON.parse(result));
    } catch (error) {
      if (error.stdout) {
        try {
          this.parseNpmAuditResults(JSON.parse(error.stdout));
        } catch (e) {
          this.errors.push({ manager: 'pnpm', error: `Failed to parse audit results: ${e.message}` });
        }
      }
    }
  }

  /**
   * Run pip-audit
   */
  async runPipAudit() {
    try {
      const command = 'pip-audit --format=json';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8'
      });

      this.parsePipAuditResults(JSON.parse(result));
    } catch (error) {
      if (error.stdout) {
        try {
          this.parsePipAuditResults(JSON.parse(error.stdout));
        } catch (e) {
          this.errors.push({ manager: 'pip', error: `Failed to parse audit results: ${e.message}` });
        }
      }
    }
  }

  /**
   * Run govulncheck for Go
   */
  async runGoVulncheck() {
    try {
      const command = 'govulncheck -json ./...';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8'
      });

      this.parseGovulncheckResults(result);
    } catch (error) {
      if (error.stdout) {
        this.parseGovulncheckResults(error.stdout);
      }
    }
  }

  /**
   * Run cargo audit for Rust
   */
  async runCargoAudit() {
    try {
      const command = 'cargo audit --json';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8'
      });

      this.parseCargoAuditResults(JSON.parse(result));
    } catch (error) {
      if (error.stdout) {
        try {
          this.parseCargoAuditResults(JSON.parse(error.stdout));
        } catch (e) {
          this.errors.push({ manager: 'cargo', error: `Failed to parse audit results: ${e.message}` });
        }
      }
    }
  }

  /**
   * Run bundle audit for Ruby
   */
  async runBundlerAudit() {
    try {
      const command = 'bundle audit check --format json';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8'
      });

      this.parseBundlerAuditResults(JSON.parse(result));
    } catch (error) {
      if (error.stdout) {
        try {
          this.parseBundlerAuditResults(JSON.parse(error.stdout));
        } catch (e) {
          this.errors.push({ manager: 'bundler', error: `Failed to parse audit results: ${e.message}` });
        }
      }
    }
  }

  /**
   * Run composer audit for PHP
   */
  async runComposerAudit() {
    try {
      const command = 'composer audit --format=json';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8'
      });

      this.parseComposerAuditResults(JSON.parse(result));
    } catch (error) {
      if (error.stdout) {
        try {
          this.parseComposerAuditResults(JSON.parse(error.stdout));
        } catch (e) {
          this.errors.push({ manager: 'composer', error: `Failed to parse audit results: ${e.message}` });
        }
      }
    }
  }

  /**
   * Parse npm audit results
   * @param {Object} data - npm audit JSON output
   */
  parseNpmAuditResults(data) {
    // Handle npm audit v2 format
    if (data.vulnerabilities) {
      for (const [name, vuln] of Object.entries(data.vulnerabilities)) {
        const advisory = vuln.via[0];
        if (typeof advisory === 'object') {
          this.vulnerabilities.push({
            manager: 'npm',
            package: name,
            version: vuln.range || vuln.version,
            severity: this.mapNpmSeverity(advisory.severity || vuln.severity),
            title: advisory.title || vuln.name,
            description: advisory.overview || advisory.title,
            cve: advisory.cve || null,
            cwe: advisory.cwe || null,
            url: advisory.url || null,
            fixedIn: advisory.fixAvailable ? advisory.fixAvailable.version : null,
            isDirect: vuln.isDirect || false
          });
        }
      }
    }

    // Handle npm audit v1 format
    if (data.advisories) {
      for (const advisory of Object.values(data.advisories)) {
        this.vulnerabilities.push({
          manager: 'npm',
          package: advisory.module_name,
          version: advisory.vulnerable_versions,
          severity: this.mapNpmSeverity(advisory.severity),
          title: advisory.title,
          description: advisory.overview,
          cve: advisory.cves?.[0] || null,
          cwe: advisory.cwe || null,
          url: advisory.url,
          fixedIn: advisory.patched_versions,
          isDirect: false
        });
      }
    }
  }

  /**
   * Parse yarn advisory
   * @param {Object} data - Yarn audit advisory data
   */
  parseYarnAdvisory(data) {
    const advisory = data.advisory;
    this.vulnerabilities.push({
      manager: 'yarn',
      package: advisory.module_name,
      version: advisory.vulnerable_versions,
      severity: this.mapNpmSeverity(advisory.severity),
      title: advisory.title,
      description: advisory.overview,
      cve: advisory.cves?.[0] || null,
      cwe: advisory.cwe || null,
      url: advisory.url,
      fixedIn: advisory.patched_versions,
      isDirect: data.resolution?.isDirect || false
    });
  }

  /**
   * Parse pip-audit results
   * @param {Object} data - pip-audit JSON output
   */
  parsePipAuditResults(data) {
    if (!Array.isArray(data)) return;

    for (const vuln of data) {
      this.vulnerabilities.push({
        manager: 'pip',
        package: vuln.name,
        version: vuln.version,
        severity: this.mapPipSeverity(vuln.vulns?.[0]?.severity),
        title: vuln.vulns?.[0]?.id || 'Unknown vulnerability',
        description: vuln.vulns?.[0]?.description || '',
        cve: vuln.vulns?.[0]?.aliases?.find(a => a.startsWith('CVE-')) || null,
        url: vuln.vulns?.[0]?.link || null,
        fixedIn: vuln.vulns?.[0]?.fix_versions?.[0] || null,
        isDirect: true
      });
    }
  }

  /**
   * Parse govulncheck results (NDJSON)
   * @param {string} data - govulncheck output
   */
  parseGovulncheckResults(data) {
    const lines = data.trim().split('\n');
    const vulns = new Map();

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.osv) {
          const id = entry.osv.id;
          if (!vulns.has(id)) {
            vulns.set(id, {
              manager: 'go',
              package: entry.osv.affected?.[0]?.package?.name || 'unknown',
              version: entry.osv.affected?.[0]?.ranges?.[0]?.events?.[0]?.introduced || 'unknown',
              severity: this.mapGoSeverity(entry.osv.severity?.[0]?.score),
              title: entry.osv.summary || entry.osv.id,
              description: entry.osv.details || '',
              cve: entry.osv.aliases?.find(a => a.startsWith('CVE-')) || null,
              url: `https://pkg.go.dev/vuln/${id}`,
              fixedIn: entry.osv.affected?.[0]?.ranges?.[0]?.events?.[1]?.fixed || null,
              isDirect: true
            });
          }
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }

    this.vulnerabilities.push(...vulns.values());
  }

  /**
   * Parse cargo audit results
   * @param {Object} data - cargo audit JSON output
   */
  parseCargoAuditResults(data) {
    if (!data.vulnerabilities?.list) return;

    for (const vuln of data.vulnerabilities.list) {
      this.vulnerabilities.push({
        manager: 'cargo',
        package: vuln.package?.name || 'unknown',
        version: vuln.package?.version || 'unknown',
        severity: this.mapRustAdvisorySeverity(vuln.advisory?.severity),
        title: vuln.advisory?.title || 'Unknown vulnerability',
        description: vuln.advisory?.description || '',
        cve: vuln.advisory?.aliases?.find(a => a.startsWith('CVE-')) || null,
        url: vuln.advisory?.url || null,
        fixedIn: vuln.versions?.patched?.[0] || null,
        isDirect: true
      });
    }
  }

  /**
   * Parse bundler audit results
   * @param {Object} data - bundle audit JSON output
   */
  parseBundlerAuditResults(data) {
    if (!data.results) return;

    for (const vuln of data.results) {
      this.vulnerabilities.push({
        manager: 'bundler',
        package: vuln.gem?.name || 'unknown',
        version: vuln.gem?.version || 'unknown',
        severity: this.mapBundlerSeverity(vuln.advisory?.criticality),
        title: vuln.advisory?.title || 'Unknown vulnerability',
        description: vuln.advisory?.description || '',
        cve: vuln.advisory?.cve || null,
        url: vuln.advisory?.url || null,
        fixedIn: vuln.advisory?.patched_versions?.[0] || null,
        isDirect: true
      });
    }
  }

  /**
   * Parse composer audit results
   * @param {Object} data - composer audit JSON output
   */
  parseComposerAuditResults(data) {
    if (!data.advisories) return;

    for (const [pkgName, advisories] of Object.entries(data.advisories)) {
      for (const advisory of advisories) {
        this.vulnerabilities.push({
          manager: 'composer',
          package: pkgName,
          version: advisory.affectedVersions || 'unknown',
          severity: this.mapComposerSeverity(advisory.severity),
          title: advisory.title || 'Unknown vulnerability',
          description: advisory.description || '',
          cve: advisory.cve || null,
          url: advisory.link || null,
          fixedIn: null,
          isDirect: true
        });
      }
    }
  }

  /**
   * Map npm severity to standard severity
   * @param {string} severity - npm severity
   * @returns {string} Standard severity
   */
  mapNpmSeverity(severity) {
    const map = {
      critical: SEVERITY.CRITICAL,
      high: SEVERITY.HIGH,
      moderate: SEVERITY.MODERATE,
      low: SEVERITY.LOW,
      info: SEVERITY.INFO
    };
    return map[severity?.toLowerCase()] || SEVERITY.MODERATE;
  }

  /**
   * Map a CVSS score OR a severity label to a standard severity — NEVER under-report.
   *
   * The bug this replaces (found by the boundary typecheck, fixed in R3-C): the pip
   * and Go mappers were annotated as taking a number and banded numerically
   * (>= 9.0 / 7.0 / 4.0). But `pip-audit`'s `vulns[].severity` and govulncheck's
   * advisory severity are NOT guaranteed numeric — advisory feeds also emit string
   * labels ("CRITICAL", "high"). Against the string "HIGH" every band comparison is
   * `NaN`-false, so the function fell through and returned LOW: a CRITICAL advisory
   * silently reported as LOW, in the security path that decides whether a push is
   * blocked. A blocking finding became a non-blocking one, with zero test coverage.
   *
   * Rules:
   *   - a number (or a numeric string like "9.8") bands as a CVSS v3 score;
   *   - a known label maps to itself (case-insensitive; "medium" ⇒ MODERATE);
   *   - anything unrecognised (absent, empty, an object, NaN) ⇒ MODERATE, the
   *     documented unknown default — never LOW. When we do not understand a
   *     severity, we OVER-report, never under-report.
   *
   * @param {number|string|Array<any>|Record<string,any>|null|undefined} severity
   *   - a CVSS score, a severity label, or a list/object of either (feeds vary)
   * @returns {string} one of SEVERITY.*
   */
  mapCvssOrLabel(severity) {
    // Arrays/objects (R4-A item 10): several advisory feeds emit a LIST of scores
    // or a scored OBJECT (e.g. { baseScore, score }). Take the MAX severity across
    // them so a CRITICAL entry is never buried under a LOW sibling.
    if (Array.isArray(severity)) {
      let worst = SEVERITY.INFO;
      for (const s of severity) worst = this._maxSeverity(worst, this.mapCvssOrLabel(s));
      return severity.length ? worst : SEVERITY.MODERATE;
    }
    if (severity && typeof severity === 'object') {
      const candidate = severity.baseScore ?? severity.score ?? severity.severity ?? severity.cvss ?? severity.vector;
      return candidate == null ? SEVERITY.MODERATE : this.mapCvssOrLabel(candidate);
    }

    if (typeof severity === 'string') {
      const raw = severity.trim();
      if (raw === '') return SEVERITY.MODERATE;

      // A CVSS vector string ("CVSS:3.1/AV:N/...") — exactly what the Go path reads
      // at osv.severity[0].score — is NOT a bare number, so Number() is NaN. Compute
      // its base score; if the vector cannot be fully parsed, band HIGH (a security
      // advisory carrying a CVSS vector is never MODERATE, never LOW).
      if (/CVSS:|\bAV:[NALP]\b/i.test(raw)) {
        const score = this._cvssVectorBaseScore(raw);
        return score != null ? this.bandCvss(score) : SEVERITY.HIGH;
      }

      // A MIXED string ("7.5 HIGH", "9.8 CRITICAL"): scan for BOTH a label token and
      // a numeric token and take the MAX of what each implies — never under-report.
      const labelSev = this._labelToSeverity(raw);
      const numMatch = raw.match(/[\d.]+/);
      const numSev = (numMatch && Number.isFinite(parseFloat(numMatch[0]))) ? this.bandCvss(parseFloat(numMatch[0])) : null;
      if (labelSev && numSev) return this._maxSeverity(labelSev, numSev);
      if (labelSev) return labelSev;
      if (numSev) return numSev;
      return SEVERITY.MODERATE; // unrecognised ⇒ over-report, never LOW
    }

    if (typeof severity === 'number' && Number.isFinite(severity)) {
      return this.bandCvss(severity);
    }

    return SEVERITY.MODERATE; // null / undefined / NaN ⇒ unknown, not LOW
  }

  /**
   * Map a bare severity LABEL (case-insensitive) to a SEVERITY, or null when the
   * token is not a known label.
   * @param {string} raw
   * @returns {string|null}
   */
  _labelToSeverity(raw) {
    const LABELS = {
      critical: SEVERITY.CRITICAL,
      high: SEVERITY.HIGH,
      moderate: SEVERITY.MODERATE,
      medium: SEVERITY.MODERATE,
      low: SEVERITY.LOW,
      info: SEVERITY.INFO,
      informational: SEVERITY.INFO,
      none: SEVERITY.INFO
    };
    const m = String(raw).toLowerCase().match(/critical|high|moderate|medium|low|informational|info|none/);
    return m ? LABELS[m[0]] : null;
  }

  /** Rank a SEVERITY for MAX comparison (higher = worse). */
  _severityRank(sev) {
    return { INFO: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 }[sev] ?? 2;
  }

  /** Return the worse (higher-ranked) of two severities. */
  _maxSeverity(a, b) {
    return this._severityRank(a) >= this._severityRank(b) ? a : b;
  }

  /**
   * Compute a CVSS v3.0/3.1 base score from a vector string. Returns null when a
   * required metric is missing/unparseable (the caller then bands HIGH rather than
   * under-reporting). Implements the standard CVSS v3 base-score formula.
   * @param {string} vector - e.g. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
   * @returns {number|null} Base score 0.0–10.0, or null if not computable.
   */
  _cvssVectorBaseScore(vector) {
    const parts = {};
    for (const seg of String(vector).split('/')) {
      const [k, v] = seg.split(':');
      if (k && v) parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
    }
    const scope = parts.S; // U (unchanged) or C (changed)
    const AV = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[parts.AV];
    const AC = { L: 0.77, H: 0.44 }[parts.AC];
    const UI = { N: 0.85, R: 0.62 }[parts.UI];
    const PR = scope === 'C'
      ? { N: 0.85, L: 0.68, H: 0.5 }[parts.PR]
      : { N: 0.85, L: 0.62, H: 0.27 }[parts.PR];
    const impactVal = { H: 0.56, L: 0.22, N: 0 };
    const C = impactVal[parts.C];
    const I = impactVal[parts.I];
    const A = impactVal[parts.A];

    if ([AV, AC, UI, PR, C, I, A].some((x) => x == null) || (scope !== 'U' && scope !== 'C')) {
      return null; // incomplete/garbage vector ⇒ caller bands HIGH, never MODERATE
    }

    const iss = 1 - (1 - C) * (1 - I) * (1 - A);
    const impact = scope === 'C'
      ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
      : 6.42 * iss;
    const exploitability = 8.22 * AV * AC * PR * UI;

    if (impact <= 0) return 0;
    const roundup = (x) => Math.ceil(x * 10) / 10;
    const raw = scope === 'C'
      ? Math.min(1.08 * (impact + exploitability), 10)
      : Math.min(impact + exploitability, 10);
    return roundup(raw);
  }

  /**
   * Band a finite CVSS v3 base score. Only ever called with a real number.
   * @param {number} score - CVSS v3 base score (0.0–10.0)
   * @returns {string} one of SEVERITY.*
   */
  bandCvss(score) {
    if (score >= 9.0) return SEVERITY.CRITICAL;
    if (score >= 7.0) return SEVERITY.HIGH;
    if (score >= 4.0) return SEVERITY.MODERATE;
    if (score > 0) return SEVERITY.LOW;
    return SEVERITY.MODERATE; // 0 / negative: not a real score ⇒ unknown
  }

  /**
   * Map pip-audit severity (CVSS score or label) to standard severity.
   * @param {number|string|null|undefined} severity
   * @returns {string} Standard severity
   */
  mapPipSeverity(severity) {
    return this.mapCvssOrLabel(severity);
  }

  /**
   * Map govulncheck severity (CVSS score or label) to standard severity.
   * @param {number|string|null|undefined} score
   * @returns {string} Standard severity
   */
  mapGoSeverity(score) {
    return this.mapCvssOrLabel(score);
  }

  /**
   * Map Rust advisory severity to standard severity
   * @param {string} severity - Rust severity
   * @returns {string} Standard severity
   */
  mapRustAdvisorySeverity(severity) {
    const map = {
      critical: SEVERITY.CRITICAL,
      high: SEVERITY.HIGH,
      medium: SEVERITY.MODERATE,
      low: SEVERITY.LOW,
      informational: SEVERITY.INFO
    };
    return map[severity?.toLowerCase()] || SEVERITY.MODERATE;
  }

  /**
   * Map Bundler criticality to standard severity
   * @param {string} criticality - Bundler criticality
   * @returns {string} Standard severity
   */
  mapBundlerSeverity(criticality) {
    const map = {
      critical: SEVERITY.CRITICAL,
      high: SEVERITY.HIGH,
      medium: SEVERITY.MODERATE,
      low: SEVERITY.LOW,
      unknown: SEVERITY.MODERATE
    };
    return map[criticality?.toLowerCase()] || SEVERITY.MODERATE;
  }

  /**
   * Map Composer severity to standard severity
   * @param {string} severity - Composer severity
   * @returns {string} Standard severity
   */
  mapComposerSeverity(severity) {
    const map = {
      critical: SEVERITY.CRITICAL,
      high: SEVERITY.HIGH,
      medium: SEVERITY.MODERATE,
      low: SEVERITY.LOW
    };
    return map[severity?.toLowerCase()] || SEVERITY.MODERATE;
  }

  /**
   * Deduplicate vulnerabilities
   * @returns {Array} Unique vulnerabilities
   */
  deduplicateVulnerabilities() {
    const seen = new Map();

    for (const vuln of this.vulnerabilities) {
      const key = `${vuln.package}:${vuln.cve || vuln.title}`;

      if (!seen.has(key)) {
        seen.set(key, vuln);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Generate summary statistics
   * @param {Array} vulnerabilities - Deduplicated vulnerabilities
   * @param {Array} managers - Detected package managers
   * @param {number} duration - Scan duration in ms
   * @returns {Object} Summary statistics
   */
  generateSummary(vulnerabilities, managers, duration) {
    const bySeverity = {};
    for (const severity of Object.values(SEVERITY)) {
      bySeverity[severity] = vulnerabilities.filter(v => v.severity === severity).length;
    }

    const byPackageManager = {};
    for (const vuln of vulnerabilities) {
      byPackageManager[vuln.manager] = (byPackageManager[vuln.manager] || 0) + 1;
    }

    return {
      total: vulnerabilities.length,
      bySeverity,
      byPackageManager,
      managers,
      duration: Math.round(duration / 1000),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate human-readable report
   * @param {Array} vulnerabilities - Vulnerabilities
   * @param {Object} summary - Summary statistics
   * @returns {string} Report text
   */
  generateReport(vulnerabilities, summary) {
    const lines = [];

    lines.push('Dependency Audit Report');
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`Scan Date: ${summary.timestamp}`);
    lines.push(`Package Managers: ${summary.managers.join(', ')}`);
    lines.push(`Duration: ${summary.duration}s`);
    lines.push(`Total Vulnerabilities: ${summary.total}`);
    lines.push('');

    lines.push('Summary by Severity');
    lines.push('-'.repeat(30));
    for (const [severity, count] of Object.entries(summary.bySeverity)) {
      if (count > 0) {
        lines.push(`  ${severity}: ${count}`);
      }
    }
    lines.push('');

    // Group vulnerabilities by severity
    for (const severity of [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MODERATE, SEVERITY.LOW]) {
      const sevVulns = vulnerabilities.filter(v => v.severity === severity);
      if (sevVulns.length === 0) continue;

      lines.push(`${severity} Vulnerabilities (${sevVulns.length})`);
      lines.push('-'.repeat(30));

      for (const vuln of sevVulns.slice(0, 10)) {
        lines.push(`  [${vuln.package}@${vuln.version}]`);
        lines.push(`    ${vuln.title}`);
        if (vuln.cve) {
          lines.push(`    CVE: ${vuln.cve}`);
        }
        if (vuln.fixedIn) {
          lines.push(`    Fix: Upgrade to ${vuln.fixedIn}`);
        }
      }

      if (sevVulns.length > 10) {
        lines.push(`  ... and ${sevVulns.length - 10} more ${severity} vulnerabilities`);
      }
      lines.push('');
    }

    if (this.errors.length > 0) {
      lines.push('Audit Errors');
      lines.push('-'.repeat(30));
      for (const error of this.errors) {
        lines.push(`  [${error.manager}] ${error.error}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check if vulnerabilities exceed threshold
   * @param {string} threshold - Severity threshold
   * @returns {Object} Pass/fail result
   */
  checkThreshold(threshold = SEVERITY.HIGH) {
    const severityOrder = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MODERATE, SEVERITY.LOW, SEVERITY.INFO];
    const thresholdIndex = severityOrder.indexOf(threshold);

    const failing = this.vulnerabilities.filter(v => {
      const vulnIndex = severityOrder.indexOf(v.severity);
      return vulnIndex <= thresholdIndex;
    });

    return {
      pass: failing.length === 0,
      failing: failing.length,
      threshold,
      message: failing.length === 0
        ? `PASS: No ${threshold} or higher severity vulnerabilities`
        : `FAIL: ${failing.length} vulnerability(ies) at ${threshold} or higher severity`
    };
  }
}

module.exports = {
  DependencyAuditor,
  SEVERITY,
  PACKAGE_MANAGERS
};

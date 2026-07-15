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

const { execSync, execFileSync } = require('child_process');
const safeFs = require('./safe-fs');
const path = require('path');
const { cvssVectorBaseScore, severityFromCvss } = require('./cvss');

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
 * The capability-registry LANGUAGE names each package manager's ecosystem covers.
 * Keyed to PACKAGE_MANAGERS above (npm/yarn/pnpm → the JS/TS ecosystem, pip/pipenv/
 * poetry → Python, and so on). This is the single source SCARunner consults so it
 * scans ONLY the long-tail ecosystems DependencyAuditor does NOT audit — a CVE is
 * never counted by both scanners into the human-facing tally (F2). Kept in sync with
 * PACKAGE_MANAGERS by `tests/dependency-auditor-severity.test.js`-adjacent coverage.
 * @type {Object<string, string[]>}
 */
const MANAGER_LANGUAGES = {
  npm: ['javascript', 'typescript'],
  yarn: ['javascript', 'typescript'],
  pnpm: ['javascript', 'typescript'],
  pip: ['python'],
  pipenv: ['python'],
  poetry: ['python'],
  go: ['go'],
  cargo: ['rust'],
  maven: ['java'],
  gradle: ['java'],
  bundler: ['ruby'],
  composer: ['php']
};

/**
 * The package managers `runAudit`'s switch ACTUALLY implements — i.e. every switch
 * arm that is NOT the `default` "Audit not implemented" arm (yarn/pnpm are included:
 * they fall back to `runNpmAudit`). This is the SINGLE source of truth for what
 * DependencyAuditor can really audit; maven/gradle/poetry/pipenv are DELIBERATELY
 * absent because their audit is unimplemented and hits the `default` arm.
 *
 * F1 (coverage hole): the old partition keyed deferral on the NOMINAL language union
 * (MANAGER_LANGUAGES over ALL managers), so java (maven/gradle) and python-via-
 * poetry/pipenv read as "covered" though DependencyAuditor audits neither — SCARunner
 * then EXCLUDED those ecosystems and they were scanned by NEITHER runner. Deferral
 * must key on what is genuinely audited: IMPLEMENTED_MANAGERS, not the union. Kept in
 * exact sync with the runAudit switch by `tests/dependency-auditor.test.js`.
 * @type {Set<string>}
 */
const IMPLEMENTED_MANAGERS = new Set([
  'npm', 'yarn', 'pnpm', 'pip', 'go', 'cargo', 'bundler', 'composer'
]);

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

    // F4: a falsy/empty/non-string root matches nothing — mirror registry.detectLanguages,
    // which guards length===0. Without this, path.join('', 'package.json') → 'package.json'
    // resolves against cwd and falsely detects the CURRENT process's package managers.
    if (!this.projectRoot || typeof this.projectRoot !== 'string') return detected;

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
              // F3: a poetry.lock present means python is poetry-managed. DependencyAuditor's
              // `pip-audit --format=json` (no -r) audits the ENVIRONMENT, never poetry.lock —
              // so co-detecting `pip` here falsely claims python coverage while poetry.lock's
              // pinned deps go unaudited. Detect `poetry` (unimplemented → NOT in
              // IMPLEMENTED_MANAGERS) instead, so auditedLanguagesFor omits python and
              // SCA/osv-scanner (which reads poetry.lock natively) covers it. Absent a
              // poetry.lock the project is genuinely pip-managed → keep the `pip` default.
              if (safeFs.existsSync(path.join(this.projectRoot, 'poetry.lock'))) {
                detected.push('poetry');
              } else {
                detected.push('pip');
              }
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
   * True when the project root carries an npm lockfile (`package-lock.json` or
   * `npm-shrinkwrap.json`) — the ONLY files `npm audit` can read. yarn/pnpm are
   * "implemented" in this auditor solely via the npm-audit fallback (runAudit routes
   * yarn/pnpm → runNpmAudit), but `npm audit --json` on a tree with NO npm lockfile
   * returns `{"error":{"code":"ENOLOCK",…}}` and audits NOTHING — it cannot read
   * yarn.lock/pnpm-lock.yaml. So a yarn.lock-/pnpm-lock.yaml-only project is genuinely
   * auditable here ONLY when an npm lockfile is ALSO present; otherwise its coverage
   * belongs to osv-scanner (which reads yarn.lock/pnpm-lock.yaml natively). Fail-soft:
   * an unreadable/falsy root reports absent.
   * @returns {boolean} true iff an npm lockfile exists at the project root
   */
  _hasNpmLockfile() {
    const root = this.projectRoot;
    if (!root || typeof root !== 'string') return false;
    for (const lockFile of PACKAGE_MANAGERS.npm.lockFiles) {
      try {
        if (safeFs.existsSync(path.join(root, lockFile))) return true;
      } catch { /* unreadable → skip */ }
    }
    return false;
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
   * The requirements files present at the project root, in a fixed candidate order
   * (matching the `pip` manager's lockFiles). SCA3: pip-audit must be pointed at these
   * with `-r` so it audits the PINNED dependencies rather than the ambient interpreter's
   * installed packages. Returns basenames (the audit runs with cwd=projectRoot). Fail-soft.
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
   * Run pip-audit.
   *
   * SCA3: `pip-audit --format=json` with NO -r audits the AMBIENT interpreter's installed
   * packages, NOT the project's pinned requirements — so a requirements-file project whose
   * dependencies are not installed (typical CI) reads as clean though nothing was audited.
   * When a requirements file exists, point pip-audit at each with `-r <file>`. Invoked
   * argv-safe via execFileSync (a fixed argument vector, no shell string interpolation).
   */
  async runPipAudit() {
    const args = ['--format=json'];
    for (const reqFile of this._detectRequirementFiles()) {
      args.push('-r', reqFile);
    }
    try {
      const result = execFileSync('pip-audit', args, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
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
    if (!data || typeof data !== 'object') return;

    // Error envelope (ENOLOCK, registry error, …): `npm audit --json` on a tree with
    // NO npm lockfile (yarn.lock/pnpm-lock.yaml only) exits non-zero and prints
    // `{"error":{"code":"ENOLOCK",…}}` — NOTHING was audited. The old parser saw no
    // `vulnerabilities`/`advisories` key and returned SILENTLY, so the run read as a
    // clean 0-vuln/0-error pass though it verified nothing. Record a LOUD error instead
    // (defense-in-depth, mirroring sca-runner's parseNpmAuditResults); never silence.
    if (data.error && typeof data.error === 'object') {
      const code = data.error.code || 'unknown';
      const summary = data.error.summary ? `: ${data.error.summary}` : '';
      this.errors.push({ manager: 'npm', error: `npm audit did not run (${code})${summary}` });
      return;
    }

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
   * Map a CVSS score OR a severity label OR a CVSS vector to a standard severity —
   * NEVER under-report. Delegates to the single-source `src/lib/cvss.js`
   * (`severityFromCvss`), passing THIS module's SEVERITY vocabulary (mid-band key
   * MODERATE) so the extraction is behavior-preserving.
   *
   * The bug this fences (found by the boundary typecheck, fixed in R3-C, and the
   * exact class of F1 in the SCA runner): pip-audit's `vulns[].severity` and
   * govulncheck's advisory severity are NOT guaranteed numeric — feeds emit string
   * labels ("CRITICAL", "high") and CVSS VECTOR strings ("CVSS:3.1/AV:N/..."), on
   * which `Number()` is NaN. Every band comparison against NaN is false, so a
   * CRITICAL advisory silently reported LOW/MODERATE in the push-blocking path. The
   * shared scorer over-reports on the unknown, never under-reports.
   *
   * @param {number|string|Array<any>|Record<string,any>|null|undefined} severity
   *   - a CVSS score, a severity label, a CVSS vector, or a list/object of any (feeds vary)
   * @returns {string} one of SEVERITY.*
   */
  mapCvssOrLabel(severity) {
    return severityFromCvss(severity, SEVERITY);
  }

  /**
   * Compute a CVSS v3.0/3.1 base score from a vector string, delegating to the
   * single-source `src/lib/cvss.js`. Returns null when a required metric is
   * missing/unparseable. Retained as the live in-module caller of
   * `cvssVectorBaseScore` (and its documented public-ish surface).
   * @param {string} vector - e.g. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
   * @returns {number|null} Base score 0.0–10.0, or null if not computable.
   */
  _cvssVectorBaseScore(vector) {
    return cvssVectorBaseScore(vector);
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

/**
 * The languages DependencyAuditor genuinely audits FOR A SPECIFIC PROJECT — the
 * languages of the managers it both DETECTS in that project AND actually implements.
 *
 * This is the honest, per-project partition SCARunner defers on (F1). A static set
 * cannot express it: `pyproject.toml` maps python via `pip` (implemented) but a
 * poetry.lock-/Pipfile-only project maps python via `poetry`/`pipenv` (unimplemented),
 * so whether python is "covered" depends on the detected manager, not the language.
 * When DependencyAuditor detects a manager it cannot audit (maven/gradle/poetry/
 * pipenv), that language is OMITTED here so SCA/osv-scanner covers it — never scanned
 * by neither runner. Fail-soft: any detection error defers nothing (SCA scans all).
 *
 * @param {string} projectRoot - Root directory of the project
 * @returns {Set<string>} capability-registry language names DependencyAuditor audits here
 */
function auditedLanguagesFor(projectRoot) {
  const covered = new Set();
  try {
    const auditor = new DependencyAuditor(projectRoot);
    const npmLockPresent = auditor._hasNpmLockfile();
    for (const manager of auditor.detectPackageManagers()) {
      if (!IMPLEMENTED_MANAGERS.has(manager)) continue;
      // Every JS manager (npm/yarn/pnpm) is audited here through `npm audit`: npm →
      // runNpmAudit directly, yarn/pnpm → the runNpmAudit fallback. `npm audit` reads ONLY
      // package-lock.json/npm-shrinkwrap.json — never yarn.lock/pnpm-lock.yaml, and on a
      // tree with NO npm lockfile it returns {"error":{"code":"ENOLOCK"}} and audits
      // NOTHING (verified against npm 11.x). A yarn.lock-/pnpm-lock.yaml-only project — and
      // note detectPackageManagers also co-detects `npm` from a bare package.json — is
      // therefore NOT genuinely audited here absent an npm lockfile, so javascript/
      // typescript must be OMITTED and routed to SCA/osv (which reads yarn.lock/
      // pnpm-lock.yaml natively) — never claimed covered while its lockfile CVEs go
      // unaudited. Mirror of the F3 poetry.lock routing. With an npm lockfile present, npm
      // audit genuinely works → keep the deferral.
      if ((manager === 'npm' || manager === 'yarn' || manager === 'pnpm') && !npmLockPresent) continue;
      for (const lang of (MANAGER_LANGUAGES[manager] || [])) {
        covered.add(lang);
      }
    }
  } catch {
    // Fail-soft: on any detection error defer NOTHING, so SCA scans everything —
    // safer to double-check an ecosystem than to leave it scanned by neither runner.
  }
  return covered;
}

module.exports = {
  DependencyAuditor,
  SEVERITY,
  PACKAGE_MANAGERS,
  MANAGER_LANGUAGES,
  IMPLEMENTED_MANAGERS,
  auditedLanguagesFor
};

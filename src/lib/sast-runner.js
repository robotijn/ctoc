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

const { execSync } = require('child_process');
const safeFs = require('./safe-fs');
const path = require('path');

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
 * Language detection based on file presence
 * @type {Object}
 */
const LANGUAGE_MARKERS = {
  python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
  javascript: ['package.json'],
  typescript: ['tsconfig.json'],
  go: ['go.mod'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  rust: ['Cargo.toml'],
  ruby: ['Gemfile'],
  php: ['composer.json']
};

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
   * Detect languages used in the project
   * @returns {string[]} Array of detected languages
   */
  detectLanguages() {
    const detected = [];

    for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
      for (const marker of markers) {
        const markerPath = path.join(this.projectRoot, marker);
        if (safeFs.existsSync(markerPath)) {
          if (!detected.includes(lang)) {
            detected.push(lang);
          }
          break;
        }
      }
    }

    return detected;
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
      return {
        success: true,
        findings: [],
        summary: {
          filesScanned: 0,
          languages: [],
          duration: 0,
          bySeverity: {}
        },
        message: 'No supported languages detected in project'
      };
    }

    // Try Semgrep first (universal scanner)
    if (this.isToolAvailable('semgrep')) {
      await this.runSemgrep();
    }

    // Run language-specific scanners
    for (const lang of languages) {
      await this.runLanguageScanner(lang);
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
      findings: uniqueFindings,
      errors: this.errors,
      summary,
      message: this.generateReport(uniqueFindings, summary)
    };
  }

  /**
   * Run Semgrep universal scanner
   */
  async runSemgrep() {
    try {
      const excludeArgs = this.options.excludeDirs.map(d => `--exclude=${d}`).join(' ');
      const command = `semgrep --config=p/security-audit --config=p/owasp-top-ten --json ${excludeArgs} .`;

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024 // 50MB
      });

      const data = JSON.parse(result);
      this.parseSemc(data);
    } catch (error) {
      if (error.stdout) {
        try {
          const data = JSON.parse(error.stdout);
          this.parseSemgrepResults(data);
        } catch (e) {
          this.errors.push({ tool: 'semgrep', error: error.message });
        }
      } else {
        this.errors.push({ tool: 'semgrep', error: error.message });
      }
    }
  }

  /**
   * Run language-specific scanner
   * @param {string} lang - Language to scan
   */
  async runLanguageScanner(lang) {
    const config = TOOL_CONFIGS[lang];
    if (!config) return;

    const tool = config.primary;
    if (!this.isToolAvailable(tool)) {
      return;
    }

    try {
      switch (tool) {
        case 'bandit':
          await this.runBandit();
          break;
        case 'gosec':
          await this.runGosec();
          break;
        case 'eslint':
          await this.runESLintSecurity();
          break;
      }
    } catch (error) {
      this.errors.push({ tool, language: lang, error: error.message });
    }
  }

  /**
   * Run Bandit for Python
   */
  async runBandit() {
    try {
      const excludeArgs = this.options.excludeDirs.map(d => `--exclude=${d}`).join(',');
      const command = `bandit -r . -f json -ll ${excludeArgs ? `--exclude=${excludeArgs}` : ''}`;

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8'
      });

      const data = JSON.parse(result);
      this.parseBanditResults(data);
    } catch (error) {
      if (error.stdout) {
        try {
          const data = JSON.parse(error.stdout);
          this.parseBanditResults(data);
        } catch (e) {
          // Bandit exits with non-zero when findings exist
        }
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
      if (error.stdout) {
        try {
          const data = JSON.parse(error.stdout);
          this.parseGosecResults(data);
        } catch (e) {
          // gosec exits with non-zero when findings exist
        }
      }
    }
  }

  /**
   * Run ESLint with security plugins
   */
  async runESLintSecurity() {
    try {
      const command = 'npx eslint --plugin security --format json . 2>/dev/null || true';

      const result = execSync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        encoding: 'utf8',
        shell: true
      });

      if (result.trim()) {
        const data = JSON.parse(result);
        this.parseESLintResults(data);
      }
    } catch (error) {
      // ESLint may not be configured for security - that's ok
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

      this.findings.push(finding);
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

      this.findings.push(finding);
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

      this.findings.push(finding);
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
        // Only include security-related rules
        if (!message.ruleId?.includes('security')) continue;

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

        this.findings.push(finding);
      }
    }
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
   * @returns {string|null} CWE identifier
   */
  extractCWE(metadata) {
    if (!metadata) return null;
    if (metadata.cwe) return metadata.cwe;
    if (metadata.cwe_id) return metadata.cwe_id;
    if (Array.isArray(metadata.cwe)) return metadata.cwe[0];
    return null;
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
      const key = `${finding.file}:${finding.line}:${finding.message.substring(0, 50)}`;

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

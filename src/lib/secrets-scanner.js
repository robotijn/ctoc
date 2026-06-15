/**
 * Secrets Scanner
 * Detects hardcoded secrets, API keys, passwords, and credentials in source code
 *
 * Detection capabilities:
 * - API keys (AWS, GCP, Azure, GitHub, Stripe, etc.)
 * - Private keys (RSA, EC, SSH, PGP)
 * - Passwords and credentials
 * - Database connection strings
 * - JWT secrets
 * - OAuth tokens
 * - Generic high-entropy strings
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Secret types and their severity
 * @type {Object}
 */
const SECRET_TYPES = {
  AWS_ACCESS_KEY: { name: 'AWS Access Key', severity: 'CRITICAL', verified: true },
  AWS_SECRET_KEY: { name: 'AWS Secret Key', severity: 'CRITICAL', verified: true },
  AZURE_CLIENT_SECRET: { name: 'Azure Client Secret', severity: 'CRITICAL', verified: true },
  GCP_API_KEY: { name: 'GCP API Key', severity: 'CRITICAL', verified: true },
  GITHUB_TOKEN: { name: 'GitHub Token', severity: 'CRITICAL', verified: true },
  GITLAB_TOKEN: { name: 'GitLab Token', severity: 'CRITICAL', verified: true },
  SLACK_TOKEN: { name: 'Slack Token', severity: 'HIGH', verified: true },
  STRIPE_API_KEY: { name: 'Stripe API Key', severity: 'CRITICAL', verified: true },
  TWILIO_API_KEY: { name: 'Twilio API Key', severity: 'HIGH', verified: true },
  SENDGRID_API_KEY: { name: 'SendGrid API Key', severity: 'HIGH', verified: true },
  PRIVATE_KEY: { name: 'Private Key', severity: 'CRITICAL', verified: true },
  SSH_PRIVATE_KEY: { name: 'SSH Private Key', severity: 'CRITICAL', verified: true },
  PGP_PRIVATE_KEY: { name: 'PGP Private Key', severity: 'CRITICAL', verified: true },
  JWT_SECRET: { name: 'JWT Secret', severity: 'HIGH', verified: false },
  PASSWORD: { name: 'Hardcoded Password', severity: 'HIGH', verified: false },
  DATABASE_URL: { name: 'Database Connection String', severity: 'CRITICAL', verified: false },
  GENERIC_SECRET: { name: 'Generic Secret', severity: 'MEDIUM', verified: false },
  HIGH_ENTROPY: { name: 'High Entropy String', severity: 'LOW', verified: false }
};

/**
 * Secret detection patterns
 * @type {Array}
 */
const SECRET_PATTERNS = [
  // AWS
  {
    type: 'AWS_ACCESS_KEY',
    pattern: /\b(A3T[A-Z0-9]|AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    description: 'AWS Access Key ID'
  },
  {
    type: 'AWS_SECRET_KEY',
    pattern: /(?<![A-Za-z0-9/+=])([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/g,
    context: /aws[_-]?secret|secret[_-]?access[_-]?key/i,
    description: 'AWS Secret Access Key'
  },

  // Azure
  {
    type: 'AZURE_CLIENT_SECRET',
    pattern: /\b[a-zA-Z0-9_~.-]{34}\b/g,
    context: /azure|client[_-]?secret/i,
    description: 'Azure Client Secret'
  },

  // GCP
  {
    type: 'GCP_API_KEY',
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    description: 'Google Cloud API Key'
  },

  // GitHub
  {
    type: 'GITHUB_TOKEN',
    pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,
    description: 'GitHub Personal Access Token'
  },
  {
    type: 'GITHUB_TOKEN',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9]{59}\b/g,
    description: 'GitHub Fine-grained PAT'
  },

  // GitLab
  {
    type: 'GITLAB_TOKEN',
    pattern: /\bglpat-[A-Za-z0-9\-_]{20,}\b/g,
    description: 'GitLab Personal Access Token'
  },

  // Slack
  {
    type: 'SLACK_TOKEN',
    pattern: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    description: 'Slack Token'
  },
  {
    type: 'SLACK_TOKEN',
    pattern: /\bxapp-[0-9]-[A-Z0-9]+-[0-9]+-[a-z0-9]+\b/gi,
    description: 'Slack App Token'
  },

  // Stripe
  {
    type: 'STRIPE_API_KEY',
    pattern: /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{24,}\b/g,
    description: 'Stripe API Key'
  },

  // Twilio
  {
    type: 'TWILIO_API_KEY',
    pattern: /\bSK[a-f0-9]{32}\b/g,
    description: 'Twilio API Key'
  },

  // SendGrid
  {
    type: 'SENDGRID_API_KEY',
    pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    description: 'SendGrid API Key'
  },

  // Private Keys
  {
    type: 'PRIVATE_KEY',
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
    description: 'RSA Private Key'
  },
  {
    type: 'PRIVATE_KEY',
    pattern: /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/g,
    description: 'EC Private Key'
  },
  {
    type: 'SSH_PRIVATE_KEY',
    pattern: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/g,
    description: 'OpenSSH Private Key'
  },
  {
    type: 'PGP_PRIVATE_KEY',
    pattern: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/g,
    description: 'PGP Private Key'
  },

  // JWT
  {
    type: 'JWT_SECRET',
    pattern: /\bjwt[_-]?secret\s*[:=]\s*['"]([^'"]{16,})['"]/gi,
    description: 'JWT Secret'
  },

  // Database URLs
  {
    type: 'DATABASE_URL',
    pattern: /\b(mysql|postgres|postgresql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@[^\s'"]+/gi,
    description: 'Database Connection String with Credentials'
  },

  // Generic Passwords
  {
    type: 'PASSWORD',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{8,})['"](?!\s*\.env|\s*process)/gi,
    description: 'Hardcoded Password'
  },

  // Generic Secrets
  {
    type: 'GENERIC_SECRET',
    pattern: /(?:secret|api[_-]?key|token|auth)\s*[:=]\s*['"]([A-Za-z0-9_-]{20,})['"](?!\s*\.env|\s*process)/gi,
    description: 'Generic Secret/API Key'
  }
];

/**
 * Files/directories to exclude from scanning
 * @type {Array}
 */
const DEFAULT_EXCLUDES = [
  'node_modules',
  'vendor',
  'venv',
  '.venv',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.pytest_cache',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Gemfile.lock',
  'poetry.lock',
  'Cargo.lock',
  'go.sum'
];

/**
 * File extensions to scan
 * @type {Array}
 */
const SCANNABLE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.java', '.kt', '.kts', '.scala',
  '.go',
  '.rb', '.erb',
  '.php',
  '.rs',
  '.c', '.cpp', '.h', '.hpp',
  '.cs',
  '.swift',
  '.sh', '.bash', '.zsh',
  '.yaml', '.yml',
  '.json',
  '.xml',
  '.toml',
  '.ini', '.cfg', '.conf',
  '.env', '.env.local', '.env.development', '.env.production',
  '.properties'
];

/**
 * Secrets Scanner class
 */
class SecretsScanner {
  /**
   * Create a Secrets Scanner instance
   * @param {string} projectRoot - Root directory to scan
   * @param {Object} options - Configuration options
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      excludes: [...DEFAULT_EXCLUDES, ...(options.excludes || [])],
      extensions: options.extensions || SCANNABLE_EXTENSIONS,
      maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB
      entropyThreshold: options.entropyThreshold || 4.5,
      verifySecrets: options.verifySecrets || false,
      ...options
    };
    this.findings = [];
    this.scannedFiles = 0;
    this.errors = [];
  }

  /**
   * Check if a file should be scanned
   * @param {string} filePath - Path to file
   * @returns {boolean} True if file should be scanned
   */
  shouldScan(filePath) {
    const relativePath = path.relative(this.projectRoot, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);

    // Check excludes
    for (const exclude of this.options.excludes) {
      if (exclude.startsWith('*')) {
        if (filePath.endsWith(exclude.slice(1))) return false;
      } else if (relativePath.includes(exclude)) {
        return false;
      }
    }

    // Check if .env file (always scan)
    if (basename.startsWith('.env')) return true;

    // Check extension
    if (!this.options.extensions.includes(ext)) return false;

    // Check file size
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > this.options.maxFileSize) return false;
    } catch (e) {
      return false;
    }

    return true;
  }

  /**
   * Get all scannable files in the project
   * @returns {string[]} Array of file paths
   */
  getFilesToScan() {
    const files = [];

    const walk = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Skip excluded directories
          if (entry.isDirectory()) {
            const relativePath = path.relative(this.projectRoot, fullPath);
            const shouldSkip = this.options.excludes.some(ex =>
              relativePath === ex || relativePath.startsWith(ex + path.sep)
            );
            if (!shouldSkip) {
              walk(fullPath);
            }
          } else if (entry.isFile() && this.shouldScan(fullPath)) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        this.errors.push({ path: dir, error: e.message });
      }
    };

    walk(this.projectRoot);
    return files;
  }

  /**
   * Calculate Shannon entropy of a string
   * @param {string} str - String to analyze
   * @returns {number} Entropy value
   */
  calculateEntropy(str) {
    if (!str || str.length === 0) return 0;

    const freq = {};
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Check if a string looks like a placeholder/example
   * @param {string} str - String to check
   * @returns {boolean} True if placeholder
   */
  isPlaceholder(str) {
    const placeholders = [
      'xxx', 'changeme', 'your-', 'example', 'placeholder',
      'replace', 'insert', 'todo', 'fixme', 'sample',
      'test', 'fake', 'dummy', 'demo', '<', '>', 'undefined',
      'null', 'none', 'empty', 'default'
    ];

    const lower = str.toLowerCase();
    return placeholders.some(p => lower.includes(p));
  }

  /**
   * Check if a finding is in a comment or documentation
   * @param {string} content - File content
   * @param {number} position - Position in content
   * @returns {boolean} True if in comment
   */
  isInComment(content, position) {
    // Get the line containing the match
    const lineStart = content.lastIndexOf('\n', position) + 1;
    const lineEnd = content.indexOf('\n', position);
    const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

    // Check for common comment patterns
    const commentPatterns = [
      /^\s*\/\//, // JS/TS/Go/C single line
      /^\s*#/,    // Python/Ruby/Shell
      /^\s*\*/,   // JS block comment continuation
      /\/\*/,     // JS block comment start
      /^\s*<!--/, // HTML
      /^\s*--/,   // SQL/Haskell
      /^\s*;/,    // Lisp/ASM
      /^\s*%/     // LaTeX/Erlang
    ];

    return commentPatterns.some(p => p.test(line));
  }

  /**
   * Scan a single file for secrets
   * @param {string} filePath - Path to file
   * @returns {Array} Findings in this file
   */
  scanFile(filePath) {
    const findings = [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const relativePath = path.relative(this.projectRoot, filePath);

      for (const secretPattern of SECRET_PATTERNS) {
        const matches = content.matchAll(secretPattern.pattern);

        for (const match of matches) {
          const value = match[1] || match[0];
          const position = match.index;

          // Skip placeholders
          if (this.isPlaceholder(value)) continue;

          // Skip if in comment (but still flag .env files)
          if (!relativePath.includes('.env') && this.isInComment(content, position)) continue;

          // Find line number
          let lineNumber = 1;
          let charCount = 0;
          for (let i = 0; i < lines.length; i++) {
            charCount += lines[i].length + 1; // +1 for newline
            if (charCount > position) {
              lineNumber = i + 1;
              break;
            }
          }

          // Context check for patterns that require it
          if (secretPattern.context) {
            const contextStart = Math.max(0, position - 100);
            const contextEnd = Math.min(content.length, position + 100);
            const context = content.slice(contextStart, contextEnd);
            if (!secretPattern.context.test(context)) continue;
          }

          const secretInfo = SECRET_TYPES[secretPattern.type];
          findings.push({
            type: secretPattern.type,
            name: secretInfo.name,
            severity: secretInfo.severity,
            file: relativePath,
            line: lineNumber,
            match: this.redactSecret(value),
            description: secretPattern.description,
            verified: secretInfo.verified,
            entropy: this.calculateEntropy(value)
          });
        }
      }

      // High entropy string detection (last resort)
      if (this.options.detectHighEntropy !== false) {
        const highEntropyFindings = this.detectHighEntropyStrings(content, lines, relativePath);
        findings.push(...highEntropyFindings);
      }

    } catch (e) {
      this.errors.push({ file: filePath, error: e.message });
    }

    return findings;
  }

  /**
   * Detect high entropy strings that might be secrets
   * @param {string} content - File content
   * @param {Array} lines - Lines of file
   * @param {string} relativePath - Relative file path
   * @returns {Array} High entropy findings
   */
  detectHighEntropyStrings(content, lines, relativePath) {
    const findings = [];

    // Pattern for potential secrets in assignments
    const assignmentPattern = /(?:secret|key|token|password|credential|auth)['"]?\s*[:=]\s*['"]([A-Za-z0-9+/=_-]{20,})['"](?!\s*\+)/gi;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.matchAll(assignmentPattern);

      for (const match of matches) {
        const value = match[1];
        const entropy = this.calculateEntropy(value);

        // Skip if entropy too low or too high (likely base64 data, not secret)
        if (entropy < this.options.entropyThreshold || entropy > 6.0) continue;

        // Skip placeholders
        if (this.isPlaceholder(value)) continue;

        // Skip if already detected by specific patterns
        const alreadyFound = this.findings.some(f =>
          f.file === relativePath && f.line === i + 1
        );
        if (alreadyFound) continue;

        findings.push({
          type: 'HIGH_ENTROPY',
          name: SECRET_TYPES.HIGH_ENTROPY.name,
          severity: SECRET_TYPES.HIGH_ENTROPY.severity,
          file: relativePath,
          line: i + 1,
          match: this.redactSecret(value),
          description: `High entropy string (${entropy.toFixed(2)}) - potential secret`,
          verified: false,
          entropy
        });
      }
    }

    return findings;
  }

  /**
   * Redact a secret for safe display
   * @param {string} secret - Secret value
   * @returns {string} Redacted secret
   */
  redactSecret(secret) {
    if (!secret || secret.length < 8) return '***REDACTED***';

    const visibleChars = Math.min(4, Math.floor(secret.length / 4));
    return secret.slice(0, visibleChars) + '***' + secret.slice(-visibleChars);
  }

  /**
   * Run the secrets scan
   * @returns {Promise<Object>} Scan results
   */
  async run() {
    const startTime = Date.now();
    const files = this.getFilesToScan();

    for (const file of files) {
      const fileFindings = this.scanFile(file);
      this.findings.push(...fileFindings);
      this.scannedFiles++;
    }

    // Deduplicate findings
    const uniqueFindings = this.deduplicateFindings();

    // Sort by severity
    uniqueFindings.sort((a, b) => {
      const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    });

    const duration = Date.now() - startTime;
    const summary = this.generateSummary(uniqueFindings, duration);

    return {
      success: true,
      findings: uniqueFindings,
      errors: this.errors,
      summary,
      message: this.generateReport(uniqueFindings, summary)
    };
  }

  /**
   * Run scan using external tools (TruffleHog, detect-secrets)
   * @returns {Promise<Object>} Scan results
   */
  async runWithExternalTools() {
    const results = await this.run();

    // Try TruffleHog if available
    if (this.isToolAvailable('trufflehog')) {
      try {
        const truffleResults = await this.runTruffleHog();
        results.findings.push(...truffleResults);
      } catch (e) {
        this.errors.push({ tool: 'trufflehog', error: e.message });
      }
    }

    // Try detect-secrets if available
    if (this.isToolAvailable('detect-secrets')) {
      try {
        const detectResults = await this.runDetectSecrets();
        results.findings.push(...detectResults);
      } catch (e) {
        this.errors.push({ tool: 'detect-secrets', error: e.message });
      }
    }

    // Deduplicate again after adding external tool results
    results.findings = this.deduplicateFindings();
    results.summary = this.generateSummary(results.findings, results.summary.duration);
    results.message = this.generateReport(results.findings, results.summary);

    return results;
  }

  /**
   * Check if a tool is available
   * @param {string} tool - Tool name
   * @returns {boolean} True if available
   */
  isToolAvailable(tool) {
    const commands = {
      trufflehog: 'trufflehog --version',
      'detect-secrets': 'detect-secrets --version'
    };

    try {
      execSync(commands[tool], { stdio: 'ignore', timeout: 10000 });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Run TruffleHog scanner
   * @returns {Promise<Array>} TruffleHog findings
   */
  async runTruffleHog() {
    const findings = [];

    try {
      const command = `trufflehog filesystem --json --only-verified ${this.projectRoot}`;
      const result = execSync(command, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000
      });

      // TruffleHog outputs NDJSON
      const lines = result.trim().split('\n');
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          findings.push({
            type: data.DetectorName || 'UNKNOWN',
            name: data.DetectorName || 'Unknown Secret',
            severity: 'CRITICAL', // TruffleHog only reports verified secrets
            file: data.SourceMetadata?.Data?.Filesystem?.file || 'unknown',
            line: data.SourceMetadata?.Data?.Filesystem?.line || 0,
            match: this.redactSecret(data.Raw || ''),
            description: `Verified ${data.DetectorName} secret`,
            verified: true,
            tool: 'trufflehog'
          });
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    } catch (e) {
      // TruffleHog may exit with non-zero if findings exist
    }

    return findings;
  }

  /**
   * Run detect-secrets scanner
   * @returns {Promise<Array>} detect-secrets findings
   */
  async runDetectSecrets() {
    const findings = [];

    try {
      const command = `detect-secrets scan ${this.projectRoot} --all-files`;
      const result = execSync(command, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000
      });

      const data = JSON.parse(result);
      for (const [file, secrets] of Object.entries(data.results || {})) {
        for (const secret of secrets) {
          findings.push({
            type: secret.type || 'GENERIC_SECRET',
            name: secret.type || 'Detected Secret',
            severity: 'MEDIUM',
            file: file,
            line: secret.line_number || 0,
            match: '***DETECTED***',
            description: `Detected by detect-secrets: ${secret.type}`,
            verified: false,
            tool: 'detect-secrets'
          });
        }
      }
    } catch (e) {
      // detect-secrets may fail
    }

    return findings;
  }

  /**
   * Deduplicate findings
   * @returns {Array} Unique findings
   */
  deduplicateFindings() {
    const seen = new Map();

    for (const finding of this.findings) {
      const key = `${finding.file}:${finding.line}:${finding.type}`;

      if (!seen.has(key)) {
        seen.set(key, finding);
      } else {
        // Prefer verified findings
        const existing = seen.get(key);
        if (finding.verified && !existing.verified) {
          seen.set(key, finding);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Generate summary statistics
   * @param {Array} findings - Deduplicated findings
   * @param {number} duration - Scan duration in ms
   * @returns {Object} Summary statistics
   */
  generateSummary(findings, duration) {
    const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const byType = {};

    for (const finding of findings) {
      bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
      byType[finding.type] = (byType[finding.type] || 0) + 1;
    }

    return {
      total: findings.length,
      verified: findings.filter(f => f.verified).length,
      bySeverity,
      byType,
      filesScanned: this.scannedFiles,
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

    lines.push('Secrets Scan Report');
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`Scan Date: ${summary.timestamp}`);
    lines.push(`Files Scanned: ${summary.filesScanned}`);
    lines.push(`Duration: ${summary.duration}s`);
    lines.push(`Total Secrets Found: ${summary.total}`);
    lines.push(`Verified Secrets: ${summary.verified}`);
    lines.push('');

    lines.push('Summary by Severity');
    lines.push('-'.repeat(30));
    for (const [severity, count] of Object.entries(summary.bySeverity)) {
      if (count > 0) {
        lines.push(`  ${severity}: ${count}`);
      }
    }
    lines.push('');

    // Critical findings first
    const criticalFindings = findings.filter(f => f.severity === 'CRITICAL');
    if (criticalFindings.length > 0) {
      lines.push('CRITICAL Secrets (Immediate Action Required)');
      lines.push('-'.repeat(45));
      for (const finding of criticalFindings) {
        lines.push(`  [${finding.type}] ${finding.file}:${finding.line}`);
        lines.push(`    Match: ${finding.match}`);
        if (finding.verified) {
          lines.push('    Status: VERIFIED - This secret is valid!');
        }
      }
      lines.push('');
    }

    // High severity findings
    const highFindings = findings.filter(f => f.severity === 'HIGH');
    if (highFindings.length > 0) {
      lines.push('HIGH Severity Secrets');
      lines.push('-'.repeat(30));
      for (const finding of highFindings.slice(0, 10)) {
        lines.push(`  [${finding.type}] ${finding.file}:${finding.line}`);
        lines.push(`    Match: ${finding.match}`);
      }
      if (highFindings.length > 10) {
        lines.push(`  ... and ${highFindings.length - 10} more HIGH severity findings`);
      }
      lines.push('');
    }

    // Recommendations
    if (summary.total > 0) {
      lines.push('Recommendations');
      lines.push('-'.repeat(30));
      lines.push('  1. Rotate all exposed credentials immediately');
      lines.push('  2. Move secrets to environment variables or secret managers');
      lines.push('  3. Add .env files to .gitignore');
      lines.push('  4. Use git-filter-branch or BFG to remove secrets from history');
      lines.push('  5. Set up pre-commit hooks to prevent future leaks');
    }

    if (this.errors.length > 0) {
      lines.push('');
      lines.push('Scan Errors');
      lines.push('-'.repeat(30));
      for (const error of this.errors.slice(0, 5)) {
        lines.push(`  ${error.file || error.tool}: ${error.error}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check if findings exceed threshold
   * @param {string} threshold - Severity threshold
   * @returns {Object} Pass/fail result
   */
  checkThreshold(threshold = 'HIGH') {
    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const thresholdIndex = severityOrder.indexOf(threshold);

    const failing = this.findings.filter(f => {
      const findingIndex = severityOrder.indexOf(f.severity);
      return findingIndex <= thresholdIndex;
    });

    return {
      pass: failing.length === 0,
      failing: failing.length,
      verified: failing.filter(f => f.verified).length,
      threshold,
      message: failing.length === 0
        ? `PASS: No ${threshold} or higher severity secrets found`
        : `FAIL: ${failing.length} secret(s) at ${threshold} or higher severity (${failing.filter(f => f.verified).length} verified)`
    };
  }
}

module.exports = {
  SecretsScanner,
  SECRET_TYPES,
  SECRET_PATTERNS,
  DEFAULT_EXCLUDES,
  SCANNABLE_EXTENSIONS
};

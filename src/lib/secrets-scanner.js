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

const safeFs = require('./safe-fs');
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
  OPENAI_API_KEY: { name: 'OpenAI API Key', severity: 'HIGH', verified: true },
  ANTHROPIC_API_KEY: { name: 'Anthropic API Key', severity: 'HIGH', verified: true },
  TWILIO_API_KEY: { name: 'Twilio API Key', severity: 'HIGH', verified: true },
  SENDGRID_API_KEY: { name: 'SendGrid API Key', severity: 'HIGH', verified: true },
  PRIVATE_KEY: { name: 'Private Key', severity: 'CRITICAL', verified: true },
  SSH_PRIVATE_KEY: { name: 'SSH Private Key', severity: 'CRITICAL', verified: true },
  PGP_PRIVATE_KEY: { name: 'PGP Private Key', severity: 'CRITICAL', verified: true },
  JWT_SECRET: { name: 'JWT Secret', severity: 'HIGH', verified: false },
  // A JWT is a token, not inherently a secret. Public/example/expired JWTs
  // (the jwt.io demo token, SDK fixtures, docs) are everywhere, so a JWT must
  // be SURFACED but must NOT block the gate — hence LOW, mirroring HIGH_ENTROPY.
  // A JWT worth acting on is still reported; a public example no longer blocks.
  JWT_TOKEN: { name: 'JSON Web Token', severity: 'LOW', verified: false },
  PASSWORD: { name: 'Hardcoded Password', severity: 'HIGH', verified: false },
  DATABASE_URL: { name: 'Database Connection String', severity: 'CRITICAL', verified: false },
  // A value assigned to a secret|api_key|token|auth-named variable is a real
  // secret; it must BLOCK the gate (gate fails on CRITICAL/HIGH), so this is
  // HIGH — not MEDIUM. HIGH_ENTROPY stays LOW on purpose: raw Shannon entropy
  // is a noisier heuristic (base64 blobs, hashes, UUIDs trip it), so an
  // entropy-only hit must NOT block the gate, to avoid false-positive blocks.
  GENERIC_SECRET: { name: 'Generic Secret', severity: 'HIGH', verified: false },
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

  // Stripe — SECRET keys only. `pk_` (publishable) is PUBLIC by design and
  // must NOT be flagged. Note the underscore (`sk_`/`rk_`) distinguishes Stripe
  // from the hyphenated OpenAI `sk-` family below, so there is no collision.
  {
    type: 'STRIPE_API_KEY',
    pattern: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{24,}\b/g,
    description: 'Stripe API Key'
  },

  // Anthropic — `sk-ant-...` (hyphen). Bounded, ReDoS-safe (single linear
  // character class). Live-spend exposure: this project shells to `claude`.
  {
    type: 'ANTHROPIC_API_KEY',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{80,}\b/g,
    description: 'Anthropic API Key'
  },

  // OpenAI — project keys (`sk-proj-...`) and classic keys (`sk-...`). Both use
  // a hyphen after `sk`, unlike Stripe's underscore, so they never collide with
  // the Stripe rule. The classic `sk-[A-Za-z0-9]{20,}` cannot match `sk-ant-`
  // or `sk-proj-` (the run of alphanumerics breaks at the hyphen after the
  // 3-/4-char prefix), so those families are matched by their own rules only.
  {
    type: 'OPENAI_API_KEY',
    pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
    description: 'OpenAI Project API Key'
  },
  {
    // Classic OpenAI key. The `(?![a-z]+\b)` negative lookahead rejects an
    // all-lowercase-alphabetic body — real OpenAI keys are mixed base62
    // (upper + lower + digits), whereas a benign `sk-`-prefixed CSS/URL slug
    // (`sk-buttonprimarywrapperelementxl`) is lowercase words. A key with even
    // one uppercase letter or digit still matches. Lookahead is a single
    // bounded `[a-z]+` (no nesting) — ReDoS-safe.
    type: 'OPENAI_API_KEY',
    pattern: /\bsk-(?![a-z]+\b)[A-Za-z0-9]{20,}\b/g,
    description: 'OpenAI API Key'
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
    // `(?:RSA )?` (single space, no nested quantifier) instead of `(RSA\s+)?`
    // keeps this ReDoS-safe; PEM headers use single spaces. The capture group
    // was unused. Outer `\s+` (BEGIN/PRIVATE) preserved for whitespace tolerance.
    pattern: /-----BEGIN\s+(?:RSA )?PRIVATE\s+KEY-----/g,
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
  {
    // A JWT itself: base64url header (`eyJ...`) . payload (`eyJ...`) . signature.
    // The dots exclude these from GENERIC_SECRET, so they need their own rule.
    // Three bounded segments, linear — ReDoS-safe.
    type: 'JWT_TOKEN',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    description: 'JSON Web Token'
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
  '.properties',
  // Cryptographic key / certificate material — a committed key FILE must be
  // scanned, not ignored for lacking a source-code extension.
  '.pem', '.key', '.crt', '.cer', '.pfx', '.p12'
];

/**
 * Well-known extensionless private-key filenames. A committed OpenSSH/DSA/EC/
 * Ed25519 private key ships with no extension, so match by exact basename.
 * (Public `.pub` counterparts are intentionally NOT listed — they are public.)
 * @type {Array}
 */
const KEY_FILENAMES = [
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'
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
      // NOTE (#8): Shannon entropy is bounded by log2(n) for an n-char string,
      // so this 4.5 threshold is mathematically unreachable below ~23 chars
      // (log2(23) ≈ 4.52). The paired assignment scan uses a 20-char floor, so
      // 20–22-char secrets can never trip the entropy heuristic — that is
      // intentional: GENERIC_SECRET (a value assigned to a secret-named var) is
      // the intended catch below ~23 chars, and it now blocks at HIGH. The
      // entropy pass is only a last-resort net for long, high-randomness blobs.
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

    // Check extension OR well-known extensionless private-key filename
    // (id_rsa, id_ed25519, ...). Without the filename special-case a committed
    // OpenSSH key would never be scanned.
    const isKeyFilename = KEY_FILENAMES.includes(basename);
    if (!this.options.extensions.includes(ext) && !isKeyFilename) return false;

    // Check file size. An oversized file is NOT silently dropped — record the
    // skip in this.errors (mirroring the unreadable-file record) so a secret
    // past maxFileSize is surfaced rather than invisibly unscanned.
    try {
      const stats = safeFs.statSync(filePath);
      if (stats.size > this.options.maxFileSize) {
        this.errors.push({
          file: filePath,
          error: `Skipped: file size ${stats.size} exceeds maxFileSize ${this.options.maxFileSize} bytes (unscanned)`
        });
        return false;
      }
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
        const entries = safeFs.readdirSync(dir, { withFileTypes: true });

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
    if (!str) return true;
    const lower = str.toLowerCase().trim();

    // A value IS a placeholder when it obviously equals or is one — NOT when a
    // structurally-valid, high-entropy secret merely CONTAINS one of these
    // substrings. Anchoring to the whole value / a word boundary is the fix:
    // e.g. `AKIAnoneFODNN7Q9WZ2XY` contains "none" incidentally (letters on
    // both sides, no word boundary) and must NOT be dropped.

    // 1. Whole-value equals a known placeholder token.
    const exact = [
      'xxx', 'changeme', 'placeholder', 'example', 'undefined', 'null', 'none',
      'empty', 'default', 'todo', 'fixme', 'test', 'fake', 'dummy', 'demo',
      'sample', 'replace', 'insert'
    ];
    if (exact.includes(lower)) return true;

    // 2. Template / interpolation markers: <...>, ${...}, {{...}}, %...%.
    if (/^<.*>$/.test(str)) return true;
    if (/\$\{.*\}/.test(str)) return true;
    if (/\{\{.*\}\}/.test(str)) return true;
    if (/^%.*%$/.test(str)) return true;

    // 3. "your-..." / "your_..." style stubs.
    if (/^your[-_]/.test(lower)) return true;

    // 4. Runs of x's used as a mask (xxxx, xxxxxxxx).
    if (/^x{3,}$/.test(lower)) return true;

    // 4b. EMBEDDED mask run: a run of >= 4 identical mask-like characters
    //     (x / X / * / 0 / .) anywhere in the value means it is a masked
    //     example — e.g. an OpenAI-doc `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
    //     in a .env.example. This is a RUN signal (a repeated masking char),
    //     NOT a dictionary substring, so it does NOT reintroduce the Round-3
    //     substring-swallow bug: a real secret that merely CONTAINS "none" or
    //     "test" (e.g. `AKIAnoneFODNN7Q9WZ2XY`) has no such run and stays
    //     detected. `*` and `.` never occur in an alphanumeric key body, so
    //     their presence in a run is unambiguously a mask. Bounded, ReDoS-safe.
    if (/([xX*0.])\1{3,}/.test(str)) return true;

    // 4c. DOMINANT single character: a value that is >= 60% one repeated
    //     character is a mask/filler, never a real high-entropy secret. Cheap
    //     single pass over the (short) value; no regex, ReDoS-irrelevant.
    if (str.length >= 5) {
      const counts = {};
      let max = 0;
      for (const ch of str) {
        counts[ch] = (counts[ch] || 0) + 1;
        if (counts[ch] > max) max = counts[ch];
      }
      if (max / str.length >= 0.6) return true;
    }

    // 5. A word-bounded placeholder phrase — the boundary (`-`, `_` edges, space
    //    or ends) is what separates a genuine placeholder like `xxx-secret-xxx`
    //    from a random blob that happens to contain the letters.
    if (/(^|[^a-z0-9])(xxx|changeme|change-me|placeholder|redacted|example|your-key|your-secret|replace-me)([^a-z0-9]|$)/.test(lower)) {
      return true;
    }

    return false;
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

    // REAL PEM boundary lines (-----BEGIN/END <PEM LABEL>-----) begin with
    // dashes but are NOT SQL `--` comments. Without this guard a private-key
    // header on its own line matches /^\s*--/ and the whole key block is
    // silently skipped — the CRITICAL private-key blind spot. The exemption is
    // scoped to KNOWN PEM labels (RFC 7468 + PGP), NOT an arbitrary
    // `-----BEGIN <anything>`: a SQL comment beginning `-----BEGIN AKIA...` is a
    // comment, not a key boundary, and must stay comment-classified. Bounded
    // alternation, no nested quantifiers — ReDoS-safe.
    if (/^\s*-----(BEGIN|END) (CERTIFICATE|CERTIFICATE REQUEST|X509 CRL|(RSA |EC |DSA |ENCRYPTED |OPENSSH )?PRIVATE KEY|(RSA |EC |DSA )?PUBLIC KEY|PGP (PRIVATE|PUBLIC) KEY BLOCK|PGP MESSAGE)-----/.test(line)) {
      return false;
    }

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
      const content = safeFs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const relativePath = path.relative(this.projectRoot, filePath);

      for (const secretPattern of SECRET_PATTERNS) {
        const matches = content.matchAll(secretPattern.pattern);

        for (const match of matches) {
          const value = match[1] || match[0];
          const position = match.index;

          // Skip placeholders
          if (this.isPlaceholder(value)) continue;

          // A canonical UUID (8-4-4-4-12 hex) assigned to a secret/token-named
          // variable is essentially never a real credential — request ids,
          // session ids, fixture ids and correlation ids all take this exact
          // shape. Exclude it from the GENERIC_SECRET fallback ONLY. Pure hex
          // (git SHA / sha256) is intentionally left in: a hex value CAN be a
          // real token, so excluding it would risk a Round-3-style false
          // negative. Bounded anchored regex — ReDoS-safe.
          if (secretPattern.type === 'GENERIC_SECRET' &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
            continue;
          }

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
  SCANNABLE_EXTENSIONS,
  KEY_FILENAMES
};

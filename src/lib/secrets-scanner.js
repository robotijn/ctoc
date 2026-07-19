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
const { execSync, execFileSync } = require('child_process');

/**
 * File extensions whose language has C-style `/* ... *\/` BLOCK comments.
 * The block-comment suppression in isInComment (`_inBlockCommentAt` and the
 * `^\s*\*` continuation line) applies ONLY to these. In shell / YAML / Python /
 * Ruby / TOML / ini / PowerShell / etc. a bare `/*` is a GLOB or path segment,
 * never a comment open — so treating `/*` as a block-comment start there would
 * open a PHANTOM span that swallows a later real secret (a security-gate
 * fail-OPEN). For any extension NOT in this set — including unknown or absent
 * extensions — the scanner FAILS CLOSED: it does not apply block-comment
 * suppression and reports the secret rather than guessing it is commented.
 * The single-line comment handling (`//`, `#`, `--`, `<!--`, `;`, `%`) and the
 * PEM exemption remain language-appropriate and are applied regardless.
 * @type {Set<string>}
 */
const C_FAMILY_BLOCK_COMMENT_EXTENSIONS = new Set([
  // JavaScript / TypeScript family
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  // C / C++ family
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.ino',
  // Objective-C
  '.m', '.mm',
  // JVM / .NET
  '.java', '.cs', '.scala', '.kt', '.kts', '.groovy', '.gvy',
  // Systems / modern compiled
  '.go', '.rs', '.swift', '.dart', '.d',
  // PHP
  '.php',
  // Stylesheets with /* */ comments
  '.css', '.scss', '.less',
  // SQL (ANSI /* */ block comments)
  '.sql',
]);

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
  // An npm granular/automation access token can publish to the registry — a
  // supply-chain compromise vector — so it BLOCKS the gate at CRITICAL.
  NPM_TOKEN: { name: 'npm Access Token', severity: 'CRITICAL', verified: true },
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
    // `=` is DROPPED from the lookbehind (but kept in the value class as base64
    // padding, and in the lookahead). With `=` in the lookbehind, an unquoted
    // `AWS_SECRET_ACCESS_KEY=<40-char>` (Dockerfile ENV / shell export / .env)
    // failed the assertion — the `=` immediately before the value blocked the
    // match — so only QUOTED / space-separated forms fired. `=` is not a base64
    // body character preceding a fresh secret run, so removing it from the
    // lookbehind cannot merge two adjacent base64 blobs; the ±100-char aws-secret
    // context gate below keeps the false-positive rate low.
    pattern: /(?<![A-Za-z0-9/+])([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/g,
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

  // npm — modern access tokens are `npm_` + exactly 36 base62 characters. The
  // fixed length + distinctive prefix bound the false-positive risk: an
  // underscore-separated `npm_config_...` phrase breaks the `[A-Za-z0-9]{36}`
  // run at its first underscore and cannot match. Single linear character
  // class, no nested quantifier — ReDoS-safe.
  {
    type: 'NPM_TOKEN',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
    description: 'npm Access Token'
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
 * Extensions NOT in the scannable set that can nonetheless carry a real
 * credential in plain text — Terraform state/vars (connection strings, IAM
 * keys, provider secrets) and SQL dumps (embedded connection strings). A skip
 * of one of these IS a genuine coverage gap, so it is recorded in this.errors
 * (the "N files unscanned" honesty signal). Every OTHER unknown/binary/media
 * extension (.png, .ico, .woff2, .jpg, .pdf, .gif, .svg, ...) cannot hold a
 * text secret this scanner detects, so its skip is SILENT — ledgering it floods
 * the honesty signal and buries genuine read failures behind benign notices.
 * (`.conf`/`.cfg`/`.ini`/`.properties`/`.env*` are already scannable, so they
 * are scanned outright and never reach the skip branch.)
 * @type {Array}
 */
const SECRET_DENSE_UNSCANNED_EXTENSIONS = ['.tf', '.tfvars', '.tfstate', '.sql'];

/**
 * Secret-dense files whose whole name is significant rather than the extension
 * — dotfiles have no `path.extname` (`.npmrc` → ''). These types CAN hold a
 * text credential but are not in the scannable set, so their skip is ledgered.
 * Same ledger-on-skip rationale as the extensions above. (The Dockerfile family
 * is deliberately NOT here: Dockerfiles are now SCANNED outright — see
 * `isDockerfileFamily` in `shouldScan` — because scanning their ENV/ARG lines
 * for secrets is strictly better than a skip notice.)
 * @type {Array}
 */
const SECRET_DENSE_UNSCANNED_FILENAMES = ['.npmrc', '.netrc', '.pgpass'];

/**
 * Error codes that mean the child process NEVER RAN TO COMPLETION. Its silence
 * therefore carries no information at all — it is a failure, never a finding.
 * @type {Set<string>}
 */
const SPAWN_FAILURE_CODES = new Set([
  'ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOMEM', 'EMFILE'
]);

/**
 * Recover a child process's stdout from EITHER a clean return or the exception
 * `execFileSync` throws on a non-zero exit.
 *
 * A scanner that exits non-zero BECAUSE IT FOUND SOMETHING is the single most
 * important run this class ever performs, and it is the one run where the output
 * arrives attached to an exception instead of a return value. Discarding it
 * turns a repository with a verified leaked credential into a clean scan — which
 * is exactly the defect this helper exists to make impossible.
 *
 * @param {Error & {stdout?: string|Buffer, status?: number|null, code?: string, signal?: string}} err
 * @returns {{ stdout: string, status: number|null, spawnFailure: boolean }}
 *   `spawnFailure` is true when the process never ran to completion (a spawn
 *   error, or a kill by signal) — a genuine failure, never a finding. A killed
 *   process is included deliberately: a timeout truncates the output, and a
 *   truncated scan is not a clean scan.
 */
function outputFromError(err) {
  const rawStdout = err && err.stdout;
  const stdout = Buffer.isBuffer(rawStdout)
    ? rawStdout.toString('utf8')
    : (typeof rawStdout === 'string' ? rawStdout : '');

  const status = (err && Number.isFinite(err.status)) ? err.status : null;
  const spawnFailure = status === null
    || Boolean(err && err.signal)
    || Boolean(err && SPAWN_FAILURE_CODES.has(err.code));

  return { stdout, status, spawnFailure };
}

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

    // Dockerfiles are plain text and routinely carry hardcoded secrets on
    // ENV/ARG lines, so the whole FAMILY is SCANNED (not skip-ledgered) using
    // the ordinary secret patterns. Matched case-insensitively so dockerfile /
    // DOCKERFILE are not dropped. Covered forms: bare `Dockerfile`,
    // `Dockerfile.<stage>` (multi-stage / per-environment Dockerfile.prod,
    // Dockerfile.dev), and the monorepo `<service>.dockerfile` convention
    // (api.dockerfile, web.dockerfile — the common `-f api.dockerfile` form).
    // Scanning is strictly better than a "N files unscanned" notice.
    const lowerBasename = basename.toLowerCase();
    const isDockerfileFamily =
      lowerBasename === 'dockerfile' ||
      lowerBasename.startsWith('dockerfile.') ||
      lowerBasename.endsWith('.dockerfile');

    if (!this.options.extensions.includes(ext) && !isKeyFilename && !isDockerfileFamily) {
      // Only SECRET-DENSE unscanned types are ledgered — files that CAN hold a
      // text credential but are not in the scannable set (Terraform state/vars,
      // SQL dumps, .npmrc/.netrc/.pgpass, Dockerfile). Recording those lets the
      // caller surface "N files unscanned" for types that actually matter,
      // instead of a silent false all-clear. Every OTHER unknown/binary/media
      // extension (.png, .ico, .woff2, .jpg, .pdf, .gif, .svg, ...) is skipped
      // SILENTLY: it cannot hold a text secret this scanner detects, and
      // ledgering it floods the honesty signal — 50 benign .png skips shoved a
      // genuine EACCES read error out of generateReport's window. Silence on
      // assets, honesty on secret-dense types: that preserves the signal.
      // Mirror the ext handling: compare a LOWERCASED basename so case variants
      // (.npmRC) are matched, not silently dropped — the secret-dense filenames
      // (.npmrc/.netrc/.pgpass) match case-insensitively. (The Dockerfile family
      // never reaches here: it is SCANNED via `isDockerfileFamily` above, so it
      // is caught by the ordinary secret patterns rather than skip-ledgered.)
      const isSecretDense =
        SECRET_DENSE_UNSCANNED_EXTENSIONS.includes(ext) ||
        SECRET_DENSE_UNSCANNED_FILENAMES.some(
          (name) => name.toLowerCase() === lowerBasename
        );
      if (isSecretDense) {
        this.errors.push({
          file: filePath,
          kind: 'skip',
          error: `Skipped: secret-dense type '${ext || basename}' not in scannable set (unscanned)`
        });
      }
      return false;
    }

    // Check file size. An oversized file is NOT silently dropped — record the
    // skip in this.errors (mirroring the unreadable-file record) so a secret
    // past maxFileSize is surfaced rather than invisibly unscanned.
    try {
      const stats = safeFs.statSync(filePath);
      if (stats.size > this.options.maxFileSize) {
        this.errors.push({
          file: filePath,
          kind: 'skip',
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
        this.errors.push({ path: dir, kind: 'error', error: e.message });
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

    // 4b. EMBEDDED mask run: a run of >= 4 identical mask characters (`*` or
    //     `.`) anywhere in the value means it is a masked example — e.g. an
    //     OpenAI-doc `sk-****...` or `sk-....` in a .env.example. The class is
    //     RESTRICTED to `*` and `.`, the only characters that NEVER occur in an
    //     alphanumeric secret body; `0`, `x`, `X` are DELIBERATELY EXCLUDED
    //     because they appear in REAL key bodies (e.g. the valid-format AWS key
    //     `AKIAI0000SFODNN7EXAM`, or an `sk-ant-...0000...` key). Including them
    //     produced a CRITICAL false negative — a real secret with an incidental
    //     `0000`/`xxxx` run was dropped as a mask (a clean pass on a live
    //     credential, the worst outcome). Whole-value `0000…`/`xxxx…` masks are
    //     still caught by the dominant-char rule (4c) below, so no genuine
    //     placeholder is lost. This is a RUN signal (a repeated masking char),
    //     NOT a dictionary substring, so it does not reintroduce the Round-3
    //     substring-swallow bug. Bounded, ReDoS-safe.
    if (/([*.])\1{3,}/.test(str)) return true;

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
   * String-literal-aware block-comment span check. Scans content[0..position)
   * left-to-right tracking string-literal state (single-quote, double-quote,
   * backtick — honoring backslash escapes) and block-comment state, counting a
   * `/*` as a comment open (and `* /` as a comment close) ONLY when not inside a
   * string. Returns true iff the scan ends INSIDE a block comment at `position`.
   * A `/*` that occurs inside a string literal (glob, wildcard URL, regex) is
   * therefore NOT treated as a comment open — the fail-closed fix for a real
   * secret being dropped after such a line. O(n) single pass, no regex.
   * @param {string} content - File content
   * @param {number} position - Match start offset
   * @returns {boolean} True if position is inside an unclosed block comment
   */
  _inBlockCommentAt(content, position) {
    let inBlock = false;   // inside /* ... */
    let quote = '';        // '', "'", '"', or '`' — active string delimiter
    let escaped = false;   // previous char was an unescaped backslash (in string)

    for (let i = 0; i < position; i++) {
      const ch = content[i];

      if (quote) {
        // Inside a string literal: only the matching delimiter (unescaped)
        // closes it. Everything else — including `/*` — is inert.
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quote) {
          quote = '';
        }
        continue;
      }

      if (inBlock) {
        // Inside a block comment: only `* /` closes it. String delimiters are
        // inert inside a comment.
        if (ch === '*' && content[i + 1] === '/') {
          inBlock = false;
          i++; // consume the '/'
        }
        continue;
      }

      // In code (not in a string, not in a block comment).
      if (ch === '/' && content[i + 1] === '/') {
        // A `//` line comment runs to end of line. Skip it so a `/*` sequence
        // appearing INSIDE the line comment cannot open a phantom block span
        // (which would wrongly cover — and DROP — a real secret on a later
        // line: a fail-OPEN regression). If the newline is at/after `position`
        // we simply stop.
        const nl = content.indexOf('\n', i + 2);
        if (nl === -1 || nl >= position) return inBlock; // false here
        i = nl; // loop ++ moves past the newline
      } else if (ch === '/' && content[i + 1] === '*') {
        inBlock = true;
        i++; // consume the '*'
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
      }
    }

    return inBlock;
  }

  /**
   * Check if a finding is in a comment or documentation
   * @param {string} content - File content
   * @param {number} position - Position in content
   * @param {string} [filePath] - Path of the scanned file. Its extension gates
   *   the C-style block-comment (`/* ... *\/`) suppression: applied only for
   *   C-family languages, fail-closed (not applied) otherwise. When absent, the
   *   scanner fails CLOSED and skips block-comment suppression.
   * @returns {boolean} True if in comment
   */
  isInComment(content, position, filePath) {
    // A C-style `/* ... *\/` block comment exists ONLY in C-family languages.
    // Gate the block-comment suppression on the file extension so a bare `/*`
    // in a shell glob / YAML / Python line cannot open a PHANTOM block span that
    // swallows a later real secret. Unknown / absent extension => fail closed.
    const ext = filePath ? path.extname(String(filePath)).toLowerCase() : '';
    const isCFamily = C_FAMILY_BLOCK_COMMENT_EXTENSIONS.has(ext);

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

    // Block-comment SPAN analysis (position-aware, STRING-LITERAL AWARE). The
    // match at `position` is inside a block comment ONLY if an UNCLOSED `/*`
    // span (including multi-line blocks) actually covers the position. Two prior
    // heuristics both failed OPEN:
    //   1. An UNANCHORED `/\/\*/` matched `/*` anywhere on the line, so a real
    //      secret with a TRAILING comment (`k = "AKIA..."; /* rotate */`) was
    //      dropped.
    //   2. A naive lastIndexOf('/*') > lastIndexOf('*/') span counted `/*` that
    //      appears INSIDE STRING LITERALS — glob patterns (`"src/*.js"`),
    //      wildcard URLs (`"http://x/*"`), regex-in-strings — as comment opens,
    //      so a genuine secret on a later line was silently DROPPED whenever an
    //      earlier line contained `/*` inside a string. A broad blind spot.
    // The correct test is a lightweight left-to-right scan of content[0..pos]
    // that tracks string-literal state (', ", `) with backslash escapes, and
    // only counts `/*`/`*/` as comment boundaries when NOT inside a string. The
    // match is in a block comment iff the scan ends INSIDE a block comment. When
    // ambiguous we bias to REPORTING (a security scanner must fail closed).
    // O(n) single pass, no regex — ReDoS-safe. C-FAMILY ONLY: a non-C-family or
    // unknown extension has no /* */ block comments, so this suppression is
    // skipped (fail closed) — the secret is reported rather than presumed inside
    // a phantom block opened by a glob/path `/*`.
    if (isCFamily && this._inBlockCommentAt(content, position)) {
      return true; // an unclosed /* ... */ span (string-aware) covers the match
    }

    // Single-line comment patterns — anchored: the comment marker begins the
    // line, so everything after it (including the secret) is commentary. These
    // are language-appropriate and applied regardless of extension.
    const commentPatterns = [
      /^\s*\/\//, // JS/TS/Go/C single line
      /^\s*#/,    // Python/Ruby/Shell
      /^\s*<!--/, // HTML
      /^\s*--/,   // SQL/Haskell
      /^\s*;/,    // Lisp/ASM
      /^\s*%/     // LaTeX/Erlang
    ];

    // The `^\s*\*` block-comment CONTINUATION line (a JSDoc/block interior line
    // whose opener `/*` is on a preceding line) is meaningful ONLY in C-family
    // languages. Elsewhere a leading `*` is not a comment marker, so gating it
    // here keeps the scanner fail-closed for non-C-family files.
    if (isCFamily) {
      commentPatterns.push(/^\s*\*/); // JS/C block comment continuation
    }

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

          // Skip if in comment (but still flag .env files). Pass filePath so the
          // block-comment suppression is gated to C-family languages (fail closed
          // for shell/YAML/Python/unknown — a bare `/*` there is a glob, never a
          // comment, and must not swallow the secret).
          if (!relativePath.includes('.env') && this.isInComment(content, position, filePath)) continue;

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

      // Unquoted secret assignments (KEY=<value> with no surrounding quotes) —
      // the .env / Dockerfile ENV / shell export form. Every provider and
      // generic pattern above anchors on a quote, so an unquoted non-provider
      // secret was invisible across all of them. Runs after the pattern loop so
      // it can dedup against a specific finding already located on the same line.
      const unquotedFindings = this.detectUnquotedAssignments(lines, relativePath, findings);
      findings.push(...unquotedFindings);

      // High entropy string detection (last resort)
      if (this.options.detectHighEntropy !== false) {
        const highEntropyFindings = this.detectHighEntropyStrings(content, lines, relativePath);
        findings.push(...highEntropyFindings);
      }

    } catch (e) {
      this.errors.push({ file: filePath, kind: 'error', error: e.message });
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
   * Detect UNQUOTED secret assignments: `SECRET_NAMED_KEY=<value>` with no
   * surrounding quotes (the .env / Dockerfile ENV / shell export form). Every
   * provider/generic pattern requires a quote, so an unquoted non-provider
   * secret slipped past all of them. This path is deliberately narrow to avoid
   * false positives on ordinary unquoted config:
   *   (a) the value is boundary-anchored (whitespace / EOL / `#`), NOT a quote;
   *   (b) the ASSIGNED KEY NAME is secret-ish (secret/api-key/key/token/
   *       password/credential/auth) — a config key like `COMMIT` is excluded;
   *   (c) the value is at least 20 chars AND passes a RAISED entropy floor
   *       (the scanner's entropyThreshold, 4.5) — an unquoted low-entropy word
   *       is config, not a secret. The quoted GENERIC_SECRET path has NO entropy
   *       gate; requiring high entropy here is what makes the unquoted form safe;
   *   (d) the value contains no `://`, no `/` (URL / path shape) and no space.
   * A line that already produced a specific finding (e.g. an npm/AWS pattern
   * hit) is skipped, so this never double-reports a provider secret.
   * @param {string[]} lines - Lines of the file
   * @param {string} relativePath - Relative file path
   * @param {Array} existingFindings - Findings already located in this file
   * @returns {Array} Unquoted-assignment findings
   */
  detectUnquotedAssignments(lines, relativePath, existingFindings) {
    const findings = [];
    // Key = identifier, value = unquoted run ending on a real boundary.
    const pattern = /(?:^|[\s;])([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*([^\s'"#]+)(?=[\s#]|$)/g;
    const secretishKey = /secret|api[_-]?key|access[_-]?key|token|password|passwd|pwd|credential|auth|session|signature|key/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip obvious comment lines in source files (not .env, where a leading
      // `#` is still a comment but a bare `KEY=value` is the norm).
      if (/^\s*(#|\/\/|--|;|\*)/.test(line)) continue;

      for (const m of line.matchAll(pattern)) {
        const key = m[1];
        const value = m[2];

        if (!secretishKey.test(key)) continue;
        if (value.length < 20) continue;
        if (value.includes('://') || value.includes('/') || value.includes(' ')) continue;
        if (this.isPlaceholder(value)) continue;

        const entropy = this.calculateEntropy(value);
        // Raised floor: below the entropy threshold it is config/an identifier,
        // not a secret; above 6.0 it is dense binary/base64 data, not a key.
        if (entropy < this.options.entropyThreshold || entropy > 6.0) continue;

        // Do not double-report a value a specific provider pattern already caught.
        if (existingFindings.some(f => f.line === i + 1)) continue;

        // An UNQUOTED, entropy-only assignment hit is STRICTLY WEAKER evidence
        // than a QUOTED one: the same `pk_live_...`-style public value, quoted,
        // fires HIGH_ENTROPY/LOW (non-blocking) via detectHighEntropyStrings, so
        // the unquoted form must not be MORE severe. Typing it GENERIC_SECRET at
        // HIGH (Round-11) BLOCKED the gate on values that are PUBLIC BY DESIGN —
        // the SaaS stack CTOC's own templates ship: a Stripe publishable key
        // (STRIPE_PUBLISHABLE_KEY), a NEXT_PUBLIC_* PostHog key, a cache /
        // integrity / SRI key. That contradicts both the Stripe rule (`pk_` is
        // public and must not be flagged) and this file's stated principle that
        // an entropy-only hit must NOT block the gate (HIGH_ENTROPY is LOW on
        // purpose). So it is typed HIGH_ENTROPY/LOW: still SURFACED (the human
        // sees it) but non-blocking. A genuine unquoted secret is still detected
        // here; a REAL provider secret (e.g. an unquoted AWS_SECRET_ACCESS_KEY)
        // is caught earlier at its own CRITICAL severity by SECRET_PATTERNS and
        // is deduped out above, so this reclassification never weakens it.
        findings.push({
          type: 'HIGH_ENTROPY',
          name: SECRET_TYPES.HIGH_ENTROPY.name,
          severity: SECRET_TYPES.HIGH_ENTROPY.severity,
          file: relativePath,
          line: i + 1,
          match: this.redactSecret(value),
          description: `Unquoted high-entropy value (${entropy.toFixed(2)}) on a secret-named identifier - potential secret`,
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
        this.errors.push({ tool: 'trufflehog', kind: 'error', error: e.message });
      }
    }

    // Try detect-secrets if available
    if (this.isToolAvailable('detect-secrets')) {
      try {
        const detectResults = await this.runDetectSecrets();
        results.findings.push(...detectResults);
      } catch (e) {
        this.errors.push({ tool: 'detect-secrets', kind: 'error', error: e.message });
      }
    }

    // Deduplicate again over the COMBINED set (internal scan + external tools).
    // deduplicateFindings() default-reads this.findings, which never received the
    // external results — so dedup the results.findings array we just augmented,
    // otherwise every TruffleHog / detect-secrets finding is silently dropped.
    results.findings = this.deduplicateFindings(results.findings);
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
   * Run TruffleHog scanner.
   *
   * A non-zero exit is the SUCCESS path here: TruffleHog exits non-zero
   * precisely because it found verified secrets, and `execFileSync` throws on a
   * non-zero exit, so the findings arrive attached to an exception. They are
   * parsed exactly as a clean return would be. Only a process that never ran to
   * completion is treated as a failure, and that failure is RECORDED on
   * `this.errors` rather than returned as an empty (clean-looking) array.
   *
   * @returns {Promise<Array>} TruffleHog findings
   */
  async runTruffleHog() {
    const findings = [];
    let raw = '';
    let skippedLines = 0;

    try {
      // execFileSync (argv form, no shell) — a projectRoot containing shell
      // metacharacters ($(...), ;, backticks) is passed as a single literal
      // argument and can never be interpreted as a command.
      raw = execFileSync(
        'trufflehog',
        ['filesystem', '--json', '--only-verified', this.projectRoot],
        {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
          timeout: 300000
        }
      );
    } catch (e) {
      // NOT swallowed. TruffleHog exits NON-ZERO precisely when it has verified
      // findings, so this is the success path for the run that matters most —
      // the output is attached to the exception and is parsed below exactly as a
      // clean return would be. Only a process that never completed is a failure.
      const recovered = outputFromError(e);
      raw = recovered.stdout;
      if (recovered.spawnFailure) {
        this.errors.push({
          tool: 'trufflehog',
          kind: 'error',
          error: `trufflehog did not complete (${e.code || e.signal || 'unknown'}) — the external secret scan DID NOT RUN`
        });
        return findings;
      }
    }

    // TruffleHog outputs NDJSON, reached from BOTH paths above.
    const lines = String(raw).trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
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
        // A non-JSON line is COUNTED, not vanished. TruffleHog interleaves
        // human-readable progress output with its NDJSON, so skipping is
        // correct — but skipping every line without counting is how a changed
        // output format degrades into a silent zero-finding scan.
        skippedLines++;
      }
    }

    // Only ALL-noise-and-no-findings is the signature of a changed output
    // format. Progress lines beside real findings are normal and stay quiet;
    // alarming on every noise line would bury the genuine errors.
    if (skippedLines > 0 && findings.length === 0) {
      this.errors.push({
        tool: 'trufflehog',
        kind: 'error',
        error: `trufflehog produced ${skippedLines} unparseable output line(s) and ZERO parseable findings — treat this scan as NOT PERFORMED, not as clean`
      });
    }

    return findings;
  }

  /**
   * Run detect-secrets scanner.
   *
   * detect-secrets exits non-zero for a real usage error as well as for a
   * report, and its output is a single JSON document rather than NDJSON — so
   * the discriminator is whether the recovered stdout PARSES. A non-zero exit
   * with a parseable report is a report; anything else is a failure that is
   * recorded, never returned as a clean empty scan.
   *
   * @returns {Promise<Array>} detect-secrets findings
   */
  async runDetectSecrets() {
    const findings = [];
    let raw = '';
    let status = null;

    try {
      // execFileSync (argv form, no shell) — projectRoot is passed as a single
      // literal argument, so shell metacharacters in the path cannot inject.
      raw = execFileSync(
        'detect-secrets',
        ['scan', this.projectRoot, '--all-files'],
        {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
          timeout: 300000
        }
      );
      status = 0;
    } catch (e) {
      const recovered = outputFromError(e);
      raw = recovered.stdout;
      status = recovered.status;
      if (recovered.spawnFailure) {
        this.errors.push({
          tool: 'detect-secrets',
          kind: 'error',
          error: `detect-secrets did not complete (${e.code || e.signal || 'unknown'}) — the external secret scan DID NOT RUN`
        });
        return findings;
      }
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      // The recovered stream is SECRET MATERIAL by definition, so the message
      // carries only the tool name and the exit status — never the output.
      this.errors.push({
        tool: 'detect-secrets',
        kind: 'error',
        error: `detect-secrets exited ${status === null ? 'abnormally' : status} and produced no parseable report — the external secret scan DID NOT RUN`
      });
      return findings;
    }

    for (const [file, secrets] of Object.entries((data && data.results) || {})) {
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

    return findings;
  }

  /**
   * Deduplicate findings, preferring verified over unverified on a collision.
   * @param {Array} [findings=this.findings] findings to dedup. Defaults to the
   *   internal scan set; callers that have ALSO gathered external-tool findings
   *   (runWithExternalTools) pass the combined array so those are not dropped.
   * @returns {Array} Unique findings
   */
  deduplicateFindings(findings = this.findings) {
    const seen = new Map();

    for (const finding of findings) {
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
      // Genuine failures (read/permission/directory/external-tool errors) are
      // surfaced PREFERENTIALLY and IN FULL — a real failure must never be
      // hidden behind benign skip notices (the regression this fixes: a real
      // EACCES read error was buried behind 50 benign .png skips in a 5-line
      // window). Skip notices (secret-dense unscanned files) follow, capped,
      // purely as a coverage hint.
      const label = (e) => e.file || e.tool || e.path || '(unknown)';
      const genuine = this.errors.filter(e => e.kind !== 'skip');
      const skips = this.errors.filter(e => e.kind === 'skip');
      for (const error of genuine) {
        lines.push(`  ${label(error)}: ${error.error}`);
      }
      for (const notice of skips.slice(0, 5)) {
        lines.push(`  ${label(notice)}: ${notice.error}`);
      }
      if (skips.length > 5) {
        lines.push(`  ... and ${skips.length - 5} more skip notice(s)`);
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
  KEY_FILENAMES,
  SECRET_DENSE_UNSCANNED_EXTENSIONS,
  SECRET_DENSE_UNSCANNED_FILENAMES
};

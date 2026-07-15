/**
 * Security Module Tests
 * Tests for SAST runner, dependency auditor, secrets scanner, and quality gate
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import modules
const { SASTRunner, SEVERITY: SAST_SEVERITY, CWE_SEVERITY_MAP, TOOL_CONFIGS } = require('../src/lib/sast-runner');
const { DependencyAuditor, SEVERITY: DEP_SEVERITY, PACKAGE_MANAGERS } = require('../src/lib/dependency-auditor');
const { SecretsScanner, SECRET_TYPES, SECRET_PATTERNS, DEFAULT_EXCLUDES } = require('../src/lib/secrets-scanner');
const { QualityGate, GATE_STATUS, DEFAULT_THRESHOLDS } = require('../src/lib/quality-gate');

// Test fixtures
const TEST_DIR = path.join(os.tmpdir(), 'ctoc-security-test-' + Date.now());

describe('SAST Runner Tests', () => {
  it('SASTRunner class exists and can be instantiated', () => {
    const runner = new SASTRunner(TEST_DIR);
    assert.ok(runner instanceof SASTRunner);
    assert.strictEqual(runner.projectRoot, TEST_DIR);
  });

  it('SEVERITY constant contains expected values', () => {
    assert.strictEqual(SAST_SEVERITY.CRITICAL, 'CRITICAL');
    assert.strictEqual(SAST_SEVERITY.HIGH, 'HIGH');
    assert.strictEqual(SAST_SEVERITY.MEDIUM, 'MEDIUM');
    assert.strictEqual(SAST_SEVERITY.LOW, 'LOW');
  });

  it('CWE_SEVERITY_MAP maps common CWEs correctly', () => {
    assert.strictEqual(CWE_SEVERITY_MAP['CWE-89'], 'CRITICAL'); // SQL Injection
    assert.strictEqual(CWE_SEVERITY_MAP['CWE-79'], 'HIGH'); // XSS
    assert.strictEqual(CWE_SEVERITY_MAP['CWE-327'], 'MEDIUM'); // Weak Crypto
  });

  it('TOOL_CONFIGS contains configuration for supported languages', () => {
    assert.ok(TOOL_CONFIGS.python);
    assert.ok(TOOL_CONFIGS.javascript);
    assert.ok(TOOL_CONFIGS.go);
    assert.strictEqual(TOOL_CONFIGS.python.primary, 'bandit');
    assert.strictEqual(TOOL_CONFIGS.go.primary, 'gosec');
  });

  it('detectLanguages returns empty array for empty directory', () => {
    const emptyDir = path.join(TEST_DIR, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const runner = new SASTRunner(emptyDir);
    const languages = runner.detectLanguages();
    assert.deepStrictEqual(languages, []);
  });

  it('detectLanguages detects Python from pyproject.toml', () => {
    const pythonDir = path.join(TEST_DIR, 'python-project');
    fs.mkdirSync(pythonDir, { recursive: true });
    fs.writeFileSync(path.join(pythonDir, 'pyproject.toml'), '[project]\nname = "test"');

    const runner = new SASTRunner(pythonDir);
    const languages = runner.detectLanguages();
    assert.ok(languages.includes('python'));
  });

  it('detectLanguages detects JavaScript from package.json', () => {
    const jsDir = path.join(TEST_DIR, 'js-project');
    fs.mkdirSync(jsDir, { recursive: true });
    fs.writeFileSync(path.join(jsDir, 'package.json'), '{"name": "test"}');

    const runner = new SASTRunner(jsDir);
    const languages = runner.detectLanguages();
    assert.ok(languages.includes('javascript'));
  });

  it('deduplicateFindings removes duplicates keeping higher severity', () => {
    const runner = new SASTRunner(TEST_DIR);
    runner.findings = [
      { file: 'test.js', line: 10, message: 'SQL Injection', severity: 'MEDIUM' },
      { file: 'test.js', line: 10, message: 'SQL Injection', severity: 'HIGH' }  // Same message for dedup
    ];
    const unique = runner.deduplicateFindings();
    assert.strictEqual(unique.length, 1);
    assert.strictEqual(unique[0].severity, 'HIGH');
  });

  it('generateSummary calculates statistics correctly', () => {
    const runner = new SASTRunner(TEST_DIR);
    const findings = [
      { severity: 'CRITICAL', tool: 'semgrep' },
      { severity: 'HIGH', tool: 'semgrep' },
      { severity: 'HIGH', tool: 'bandit' },
      { severity: 'MEDIUM', tool: 'bandit' }
    ];
    const summary = runner.generateSummary(findings, ['python'], 5000);

    assert.strictEqual(summary.total, 4);
    assert.strictEqual(summary.bySeverity.CRITICAL, 1);
    assert.strictEqual(summary.bySeverity.HIGH, 2);
    assert.strictEqual(summary.bySeverity.MEDIUM, 1);
    assert.strictEqual(summary.byTool.semgrep, 2);
    assert.strictEqual(summary.byTool.bandit, 2);
  });

  it('checkThreshold correctly identifies failing findings', () => {
    const runner = new SASTRunner(TEST_DIR);
    runner.findings = [
      { severity: 'CRITICAL' },
      { severity: 'HIGH' },
      { severity: 'MEDIUM' }
    ];

    const result = runner.checkThreshold('HIGH');
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.failing, 2);
  });
});

describe('Dependency Auditor Tests', () => {
  it('DependencyAuditor class exists and can be instantiated', () => {
    const auditor = new DependencyAuditor(TEST_DIR);
    assert.ok(auditor instanceof DependencyAuditor);
  });

  it('SEVERITY constant contains expected values', () => {
    assert.strictEqual(DEP_SEVERITY.CRITICAL, 'CRITICAL');
    assert.strictEqual(DEP_SEVERITY.HIGH, 'HIGH');
    assert.strictEqual(DEP_SEVERITY.MODERATE, 'MODERATE');
    assert.strictEqual(DEP_SEVERITY.LOW, 'LOW');
  });

  it('PACKAGE_MANAGERS contains configurations for common managers', () => {
    assert.ok(PACKAGE_MANAGERS.npm);
    assert.ok(PACKAGE_MANAGERS.pip);
    assert.ok(PACKAGE_MANAGERS.cargo);
    assert.ok(PACKAGE_MANAGERS.npm.lockFiles.includes('package-lock.json'));
    assert.ok(PACKAGE_MANAGERS.pip.lockFiles.includes('requirements.txt'));  // requirements.txt is in lockFiles
  });

  it('detectPackageManagers returns empty array for empty directory', () => {
    const emptyDir = path.join(TEST_DIR, 'empty-pkg');
    fs.mkdirSync(emptyDir, { recursive: true });
    const auditor = new DependencyAuditor(emptyDir);
    const managers = auditor.detectPackageManagers();
    assert.deepStrictEqual(managers, []);
  });

  it('detectPackageManagers detects npm from package-lock.json', () => {
    const npmDir = path.join(TEST_DIR, 'npm-project');
    fs.mkdirSync(npmDir, { recursive: true });
    fs.writeFileSync(path.join(npmDir, 'package-lock.json'), '{}');

    const auditor = new DependencyAuditor(npmDir);
    const managers = auditor.detectPackageManagers();
    assert.ok(managers.includes('npm'));
  });

  it('mapNpmSeverity maps severity levels correctly', () => {
    const auditor = new DependencyAuditor(TEST_DIR);
    assert.strictEqual(auditor.mapNpmSeverity('critical'), 'CRITICAL');
    assert.strictEqual(auditor.mapNpmSeverity('high'), 'HIGH');
    assert.strictEqual(auditor.mapNpmSeverity('moderate'), 'MODERATE');
    assert.strictEqual(auditor.mapNpmSeverity('low'), 'LOW');
  });

  it('deduplicateVulnerabilities removes duplicates', () => {
    const auditor = new DependencyAuditor(TEST_DIR);
    auditor.vulnerabilities = [
      { package: 'lodash', cve: 'CVE-2020-8203', severity: 'HIGH' },
      { package: 'lodash', cve: 'CVE-2020-8203', severity: 'HIGH' },
      { package: 'axios', cve: 'CVE-2021-3749', severity: 'HIGH' }
    ];
    const unique = auditor.deduplicateVulnerabilities();
    assert.strictEqual(unique.length, 2);
  });

  it('generateSummary calculates statistics correctly', () => {
    const auditor = new DependencyAuditor(TEST_DIR);
    const vulns = [
      { severity: 'CRITICAL', manager: 'npm' },
      { severity: 'HIGH', manager: 'npm' },
      { severity: 'MODERATE', manager: 'pip' }
    ];
    const summary = auditor.generateSummary(vulns, ['npm', 'pip'], 3000);

    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.bySeverity.CRITICAL, 1);
    assert.strictEqual(summary.bySeverity.HIGH, 1);
    assert.strictEqual(summary.byPackageManager.npm, 2);
  });

  it('checkThreshold correctly identifies failing vulnerabilities', () => {
    const auditor = new DependencyAuditor(TEST_DIR);
    auditor.vulnerabilities = [
      { severity: 'CRITICAL' },
      { severity: 'HIGH' },
      { severity: 'MODERATE' }
    ];

    const result = auditor.checkThreshold('HIGH');
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.failing, 2);
  });
});

describe('Secrets Scanner Tests', () => {
  it('SecretsScanner class exists and can be instantiated', () => {
    const scanner = new SecretsScanner(TEST_DIR);
    assert.ok(scanner instanceof SecretsScanner);
  });

  it('SECRET_TYPES contains expected secret types', () => {
    assert.ok(SECRET_TYPES.AWS_ACCESS_KEY);
    assert.ok(SECRET_TYPES.GITHUB_TOKEN);
    assert.ok(SECRET_TYPES.PRIVATE_KEY);
    assert.strictEqual(SECRET_TYPES.AWS_ACCESS_KEY.severity, 'CRITICAL');
  });

  it('SECRET_PATTERNS contains detection patterns', () => {
    assert.ok(SECRET_PATTERNS.length > 0);
    const awsPattern = SECRET_PATTERNS.find(p => p.type === 'AWS_ACCESS_KEY');
    assert.ok(awsPattern);
    assert.ok(awsPattern.pattern);
  });

  it('DEFAULT_EXCLUDES contains common exclusions', () => {
    assert.ok(DEFAULT_EXCLUDES.includes('node_modules'));
    assert.ok(DEFAULT_EXCLUDES.includes('.git'));
    assert.ok(DEFAULT_EXCLUDES.includes('vendor'));
  });

  it('calculateEntropy returns expected values', () => {
    const scanner = new SecretsScanner(TEST_DIR);

    // Low entropy (repeated characters)
    const lowEntropy = scanner.calculateEntropy('aaaaaaaaaa');
    assert.ok(lowEntropy < 1);

    // Higher entropy (random string)
    const highEntropy = scanner.calculateEntropy('aB1cD2eF3gH4iJ5k');
    assert.ok(highEntropy > 3);
  });

  it('isPlaceholder detects placeholder values', () => {
    const scanner = new SecretsScanner(TEST_DIR);
    assert.ok(scanner.isPlaceholder('your-api-key-here'));
    assert.ok(scanner.isPlaceholder('CHANGEME'));
    assert.ok(scanner.isPlaceholder('xxx-secret-xxx'));
    assert.ok(!scanner.isPlaceholder('AKIA1234567890ABCDEF'));
  });

  it('redactSecret properly redacts secrets', () => {
    const scanner = new SecretsScanner(TEST_DIR);
    const redacted = scanner.redactSecret('AKIA1234567890ABCDEF');
    assert.ok(redacted.includes('***'));
    assert.ok(!redacted.includes('1234567890'));
  });

  it('shouldScan excludes node_modules', () => {
    const scanner = new SecretsScanner(TEST_DIR);
    const excluded = path.join(TEST_DIR, 'node_modules', 'test.js');
    assert.ok(!scanner.shouldScan(excluded));
  });

  it('shouldScan includes .env files', () => {
    const envDir = path.join(TEST_DIR, 'env-test');
    fs.mkdirSync(envDir, { recursive: true });
    const envFile = path.join(envDir, '.env');
    fs.writeFileSync(envFile, 'SECRET=test');

    const scanner = new SecretsScanner(envDir);
    assert.ok(scanner.shouldScan(envFile));
  });

  it('deduplicateFindings removes duplicates', () => {
    const scanner = new SecretsScanner(TEST_DIR);
    scanner.findings = [
      { file: 'test.js', line: 10, type: 'AWS_ACCESS_KEY', verified: true },
      { file: 'test.js', line: 10, type: 'AWS_ACCESS_KEY', verified: false }
    ];
    const unique = scanner.deduplicateFindings();
    assert.strictEqual(unique.length, 1);
    assert.ok(unique[0].verified); // Prefers verified
  });

  it('checkThreshold correctly identifies failing secrets', () => {
    const scanner = new SecretsScanner(TEST_DIR);
    scanner.findings = [
      { severity: 'CRITICAL' },
      { severity: 'HIGH' },
      { severity: 'MEDIUM' }
    ];

    const result = scanner.checkThreshold('HIGH');
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.failing, 2);
  });
});

// ---------------------------------------------------------------------------
// Real-secret behavioral tests — these drive REALISTIC-FORMAT SYNTHETIC secret
// STRINGS through scanFile (never a real credential; every value below is
// invented filler that matches the shape of the credential family it tests).
// The structural tests above never call scanFile, which is why the historical
// blind spots shipped green. These tests assert detection AND severity.
// ---------------------------------------------------------------------------
describe('Secrets Scanner — real synthetic secret detection', () => {
  const SCAN_DIR = path.join(os.tmpdir(), 'ctoc-secrets-scan-' + Date.now());

  // Write a file under SCAN_DIR and scan it. Returns findings from scanFile.
  function scan(name, contents, opts = {}) {
    fs.mkdirSync(SCAN_DIR, { recursive: true });
    const file = path.join(SCAN_DIR, name);
    fs.writeFileSync(file, contents);
    const scanner = new SecretsScanner(SCAN_DIR, opts);
    return { scanner, findings: scanner.scanFile(file), file };
  }

  after(() => {
    try { fs.rmSync(SCAN_DIR, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  });

  // -- #1 CRITICAL: private keys ------------------------------------------
  // Synthetic PEM body — the header alone is what the pattern matches; the
  // base64-ish filler is deliberately not a real key.
  const SYNTH_RSA_KEY =
    '-----BEGIN RSA PRIVATE KEY-----\n' +
    'MIIBOGUSfakeKEYdoNOTuseTHISisSYNTHETICfillerAAAAAAAAAAAAAAAAAAAAAA\n' +
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' +
    '-----END RSA PRIVATE KEY-----\n';

  it('#1b .pem file containing a synthetic RSA private key -> CRITICAL', () => {
    const { findings } = scan('private.pem', SYNTH_RSA_KEY);
    const pk = findings.find(f => f.type === 'PRIVATE_KEY');
    assert.ok(pk, 'expected a PRIVATE_KEY finding in the .pem file');
    assert.strictEqual(pk.severity, 'CRITICAL');
  });

  it('#1b .key file containing a synthetic RSA private key -> CRITICAL', () => {
    const { findings } = scan('server.key', SYNTH_RSA_KEY);
    assert.ok(findings.some(f => f.type === 'PRIVATE_KEY' && f.severity === 'CRITICAL'));
  });

  it('#1b well-known extensionless key file id_rsa is scannable', () => {
    fs.mkdirSync(SCAN_DIR, { recursive: true });
    const file = path.join(SCAN_DIR, 'id_rsa');
    fs.writeFileSync(file, SYNTH_RSA_KEY);
    const scanner = new SecretsScanner(SCAN_DIR);
    assert.ok(scanner.shouldScan(file), 'id_rsa must be scanned even without an extension');
    assert.ok(scanner.scanFile(file).some(f => f.type === 'PRIVATE_KEY'));
  });

  it('#1a PEM header on its own line inside a .js file is NOT swallowed as a comment', () => {
    const js = 'const key = `\n' + SYNTH_RSA_KEY + '`;\n';
    const { findings } = scan('keys.js', js);
    const pk = findings.find(f => f.type === 'PRIVATE_KEY');
    assert.ok(pk, 'PEM boundary must not be classified as a SQL (--) comment');
    assert.strictEqual(pk.severity, 'CRITICAL');
  });

  it('#1a PEM header on its own line inside a .yaml file is detected', () => {
    const yaml = 'tls:\n  key: |\n' + SYNTH_RSA_KEY;
    const { findings } = scan('secrets.yaml', yaml);
    assert.ok(findings.some(f => f.type === 'PRIVATE_KEY' && f.severity === 'CRITICAL'));
  });

  // -- #2 HIGH: OpenAI / Anthropic API keys -------------------------------
  it('#2 Anthropic sk-ant key -> detected HIGH', () => {
    const key = 'sk-ant-api03-' + 'A1b2C3d4E5f6G7h8I9j0'.repeat(4) + '_-xyz';
    const { findings } = scan('anthropic.js', `const k = "${key}";\n`);
    const f = findings.find(x => x.type === 'ANTHROPIC_API_KEY');
    assert.ok(f, 'sk-ant key must be detected');
    assert.strictEqual(f.severity, 'HIGH');
  });

  it('#2 OpenAI sk-proj key -> detected HIGH', () => {
    const key = 'sk-proj-' + 'Ab12Cd34Ef56Gh78Ij90KlMn';
    const { findings } = scan('openai-proj.js', `const k = "${key}";\n`);
    const f = findings.find(x => x.type === 'OPENAI_API_KEY');
    assert.ok(f, 'sk-proj key must be detected');
    assert.strictEqual(f.severity, 'HIGH');
  });

  it('#2 OpenAI classic sk- key -> detected HIGH', () => {
    const key = 'sk-' + 'Ab12Cd34Ef56Gh78Ij90KlMn';
    const { findings } = scan('openai.js', `const k = "${key}";\n`);
    const f = findings.find(x => x.type === 'OPENAI_API_KEY');
    assert.ok(f, 'sk- key must be detected');
    assert.strictEqual(f.severity, 'HIGH');
  });

  it('#2 Stripe sk_live_ key still detected as CRITICAL (no collision with OpenAI sk-)', () => {
    const key = 'sk_live_' + '0123456789abcdefABCDEF01';
    const { findings } = scan('stripe.js', `const k = "${key}";\n`);
    const f = findings.find(x => x.type === 'STRIPE_API_KEY');
    assert.ok(f, 'Stripe secret key must still be detected');
    assert.strictEqual(f.severity, 'CRITICAL');
    assert.ok(!findings.some(x => x.type === 'OPENAI_API_KEY'),
      'underscore Stripe key must NOT be misclassified as an OpenAI hyphen key');
  });

  // -- #3 JWT -------------------------------------------------------------
  it('#3 synthetic 3-part JWT -> detected', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5Nqm';
    const { findings } = scan('jwt.js', `const t = "${jwt}";\n`);
    assert.ok(findings.some(f => f.type === 'JWT_TOKEN'), 'JWT must be detected');
  });

  // -- #4 placeholder anchoring -------------------------------------------
  it('#4 real secret whose blob merely contains "none" is NOT swallowed', () => {
    // 21-char structurally-valid-looking value; the substring "none" is
    // incidental, not a word-bounded placeholder token.
    const { findings } = scan('aws.js', 'const apiKey = "AKIAnoneFODNN7Q9WZ2XY";\n');
    assert.ok(findings.length > 0, 'a real secret must not be dropped for containing "none"');
    assert.ok(findings.some(f => f.type === 'GENERIC_SECRET'));
  });

  it('#4 secret value containing the substring "fake" is NOT swallowed', () => {
    const { findings } = scan('tok.js', 'const token = "fakeAbCdEf1234567890XYZ";\n');
    assert.ok(findings.some(f => f.type === 'GENERIC_SECRET'),
      'a real secret must not be dropped for containing "fake"');
  });

  it('#4 genuine placeholders are still ignored', () => {
    const { findings } = scan('ph.js', 'const apiKey = "your-secret-key-placeholder-value";\n');
    assert.strictEqual(findings.length, 0, 'a "your-...placeholder..." value must be ignored');
  });

  it('#4 isPlaceholder anchors to the whole value / template markers', () => {
    const scanner = new SecretsScanner(SCAN_DIR);
    // Real-looking secrets that merely contain a placeholder substring:
    assert.strictEqual(scanner.isPlaceholder('AKIAnoneFODNN7Q9WZ2XY'), false);
    assert.strictEqual(scanner.isPlaceholder('fakeAbCdEf1234567890XYZ'), false);
    // Genuine placeholders:
    assert.strictEqual(scanner.isPlaceholder('none'), true);
    assert.strictEqual(scanner.isPlaceholder('your-key-here'), true);
    assert.strictEqual(scanner.isPlaceholder('${API_KEY}'), true);
    assert.strictEqual(scanner.isPlaceholder('<REDACTED>'), true);
    assert.strictEqual(scanner.isPlaceholder('CHANGEME'), true);
    assert.strictEqual(scanner.isPlaceholder('xxx-secret-xxx'), true);
  });

  // -- #5 GENERIC_SECRET now blocks (HIGH) --------------------------------
  it('#5 a secret caught only by the generic-assignment fallback is HIGH', () => {
    const { findings } = scan('gen.js', 'const apiSecret = "aB3dE6gH9jK2mN5pQ8rT1uV4wX7yZ0aC";\n');
    const f = findings.find(x => x.type === 'GENERIC_SECRET');
    assert.ok(f, 'generic secret must be detected');
    assert.strictEqual(f.severity, 'HIGH', 'a named-assignment secret must block, not warn');
  });

  // -- #6 Stripe publishable key is public, not a secret ------------------
  it('#6 Stripe pk_live_ publishable key -> 0 findings', () => {
    const key = 'pk_live_' + '0123456789abcdefABCDEF01';
    const { findings } = scan('pub.js', `const stripePublic = "${key}";\n`);
    assert.strictEqual(findings.length, 0, 'a publishable (public) key must not be flagged as a secret');
  });

  // -- #7 oversized file skip is recorded, not silent ---------------------
  it('#7 a file larger than maxFileSize is recorded in scanner.errors', () => {
    fs.mkdirSync(SCAN_DIR, { recursive: true });
    const big = path.join(SCAN_DIR, 'big.js');
    fs.writeFileSync(big, 'x'.repeat(500));
    const scanner = new SecretsScanner(SCAN_DIR, { maxFileSize: 10 });
    assert.strictEqual(scanner.shouldScan(big), false);
    assert.ok(scanner.errors.some(e => (e.file || '').includes('big.js')),
      'an oversized-file skip must be recorded, not silently dropped');
  });

  // -- Round-4 FALSE-POSITIVE fixes ---------------------------------------
  // The Round-3 hardening over-corrected and began BLOCKING the gate on
  // ubiquitous benign inputs. These tests kill those false positives while
  // proving the real-secret detection (above) still fires.

  // F1: an OpenAI-doc-style MASKED key in a .env.example must be recognized as
  // a placeholder (embedded mask run), not flagged HIGH and block the gate.
  it('F1 masked sk-xxxx...32x in .env.example -> 0 findings (placeholder)', () => {
    const { findings } = scan('.env.example', 'OPENAI_API_KEY=sk-' + 'x'.repeat(32) + '\n');
    assert.strictEqual(findings.length, 0, 'a fully-masked example key must not block the gate');
  });

  it('F1 isPlaceholder recognizes embedded / dominant masks but not substrings', () => {
    const scanner = new SecretsScanner(SCAN_DIR);
    assert.strictEqual(scanner.isPlaceholder('sk-' + 'x'.repeat(32)), true, 'x-mask run is a placeholder');
    assert.strictEqual(scanner.isPlaceholder('sk-' + 'X'.repeat(16)), true, 'X-mask run is a placeholder');
    assert.strictEqual(scanner.isPlaceholder('your-key-here'), true);
    // A REAL secret that merely CONTAINS a placeholder word (no mask RUN) must
    // still be detected — the Round-3 anti-substring-swallow fix is preserved.
    assert.strictEqual(scanner.isPlaceholder('AKIAnoneFODNN7Q9WZ2XY'), false, 'contains "none" but real entropy');
    assert.strictEqual(scanner.isPlaceholder('sk-proj-Ab12Cd34Ef56Gh78Ij90KlMn'), false, 'a real mixed key is not a mask');
  });

  it('F1 a REAL sk-proj key is still HIGH even though masked examples are ignored', () => {
    const key = 'sk-proj-' + 'Ab12Cd34Ef56Gh78Ij90KlMn';
    const { findings } = scan('real-openai.env', 'OPENAI_API_KEY=' + key + '\n');
    assert.ok(findings.some(f => f.type === 'OPENAI_API_KEY' && f.severity === 'HIGH'));
  });

  // F2: the PUBLIC jwt.io demo token appears in countless SDK tests/fixtures.
  // It must NOT block the gate — detection stays, but at a non-blocking severity.
  it('F2 public jwt.io demo token does NOT block the gate (non-blocking severity)', () => {
    const demo = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
      '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
      '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const { findings } = scan('jwt-demo.js', 'const t = "' + demo + '";\n');
    const jwt = findings.find(f => f.type === 'JWT_TOKEN');
    assert.ok(jwt, 'a JWT is still surfaced');
    assert.ok(jwt.severity !== 'CRITICAL' && jwt.severity !== 'HIGH',
      'a JWT (public example) must not block the gate at CRITICAL/HIGH');
    // The gate blocks at HIGH+; a lone JWT finding must therefore pass.
    const gateScanner = new SecretsScanner(SCAN_DIR);
    gateScanner.findings = findings;
    assert.strictEqual(gateScanner.checkThreshold('HIGH').pass, true,
      'a file whose only finding is a public JWT must pass the HIGH gate');
  });

  // F3: a benign `sk-`-prefixed lowercase slug (CSS class, URL) must not be
  // mistaken for an OpenAI key.
  it('F3 benign sk- lowercase slug -> 0 OpenAI findings', () => {
    const { findings } = scan('slug.jsx', 'const cls = "sk-buttonprimarywrapperelementxl";\n');
    assert.ok(!findings.some(f => f.type === 'OPENAI_API_KEY'),
      'a lowercase-alpha sk- slug is not an OpenAI key');
  });

  it('F3 a real mixed-alphanumeric sk- key is still HIGH', () => {
    const key = 'sk-' + 'Abc123Def456Ghi789Jkl';
    const { findings } = scan('real-sk.js', 'const k = "' + key + '";\n');
    assert.ok(findings.some(f => f.type === 'OPENAI_API_KEY' && f.severity === 'HIGH'));
  });

  // F4: a canonical UUID assigned to a token/secret-named var is not a secret.
  it('F4 a canonical UUID assigned to token -> 0 GENERIC_SECRET findings', () => {
    const { findings } = scan('uuid.js', 'const token = "550e8400-e29b-41d4-a716-446655440000";\n');
    assert.ok(!findings.some(f => f.type === 'GENERIC_SECRET'),
      'a canonical UUID is essentially never a secret');
  });

  it('F4 a real high-entropy assigned secret is still HIGH (UUID exclusion is narrow)', () => {
    const { findings } = scan('gen2.js', 'const apiSecret = "aB3dE6gH9jK2mN5pQ8rT1uV4wX7yZ0aC";\n');
    assert.ok(findings.some(f => f.type === 'GENERIC_SECRET' && f.severity === 'HIGH'));
  });

  // F5: the PEM comment-exemption must apply ONLY to real PEM labels, not to an
  // arbitrary `-----BEGIN <anything>` SQL comment line.
  it('F5 a SQL comment line beginning -----BEGIN AKIA... is treated as a comment', () => {
    const { findings } = scan('q.sql', '-----BEGIN AKIAIOSFODNN7EXAMPLE this is a sql comment\n');
    assert.ok(!findings.some(f => f.type === 'AWS_ACCESS_KEY'),
      'a non-PEM -----BEGIN line is a SQL comment, not a private-key boundary');
  });

  it('F5 a real PEM header in a .sql file is still scanned (not comment-swallowed)', () => {
    const { findings } = scan('key.sql', SYNTH_RSA_KEY);
    assert.ok(findings.some(f => f.type === 'PRIVATE_KEY' && f.severity === 'CRITICAL'),
      'a genuine -----BEGIN RSA PRIVATE KEY----- boundary must still be detected');
  });

  // -- S1: mask-run char class must NOT include 0/x/X (real key-body chars) --
  // The embedded-mask-run rule swallowed real keys whose bodies happen to
  // contain an incidental run of 0/x/X. Only `*` and `.` never occur in an
  // alphanumeric secret body, so only those belong in the run class.
  it('S1 isPlaceholder("AKIAI0000SFODNN7EXAM") is NOT a placeholder (incidental 0000 run)', () => {
    const scanner = new SecretsScanner(SCAN_DIR);
    assert.strictEqual(scanner.isPlaceholder('AKIAI0000SFODNN7EXAM'), false,
      'a valid-format AWS key with an incidental 0000 run must not be treated as a mask');
  });

  it('S1 a real sk-ant key containing a 0000 run is DETECTED (not dropped as a mask)', () => {
    const key = 'sk-ant-api03-' + '0000' + 'A1b2C3d4E5f6G7h8I9j0'.repeat(4);
    const { findings } = scan('ant0000.js', 'const k = "' + key + '";\n');
    assert.ok(findings.some(f => f.type === 'ANTHROPIC_API_KEY' && f.severity === 'HIGH'),
      'a real sk-ant key with an incidental 0000 run must still be detected (worst outcome is a clean pass on a real secret)');
  });

  it('S1 regression: a genuine x/X-mask run is STILL a placeholder (dominant-char catch)', () => {
    const scanner = new SecretsScanner(SCAN_DIR);
    assert.strictEqual(scanner.isPlaceholder('sk-' + 'x'.repeat(32)), true,
      'a dominant x-mask is still a placeholder');
    assert.strictEqual(scanner.isPlaceholder('sk-' + 'X'.repeat(16)), true,
      'a dominant X-mask is still a placeholder');
  });

  // -- S2: an unscannable-extension skip must be RECORDED, not a silent pass --
  it('S2 an unscannable-extension file (.tfstate) skip is RECORDED, not silent', () => {
    fs.mkdirSync(SCAN_DIR, { recursive: true });
    const tf = path.join(SCAN_DIR, 'terraform.tfstate');
    fs.writeFileSync(tf, '{"outputs":{"secret":{"value":"AKIAIOSFODNN7EXAMPLE"}}}\n');
    const scanner = new SecretsScanner(SCAN_DIR);
    assert.strictEqual(scanner.shouldScan(tf), false, '.tfstate is not in the scannable set');
    assert.ok(scanner.errors.some(e => (e.file || '').includes('terraform.tfstate')),
      'an extension-based skip of a secret-dense file must be recorded, not a silent clean pass');
  });

  // -- S3: npm access token detection -------------------------------------
  it('S3 a real npm token (npm_ + 36 base62) -> detected', () => {
    const tok = 'npm_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'; // 36 base62 chars
    const { findings } = scan('npmtok.js', 'const t = "' + tok + '";\n');
    assert.ok(findings.some(f => f.type === 'NPM_TOKEN'),
      'a modern npm access token (npm_ + 36 base62) must be detected');
  });

  it('S3 a benign npm_ lookalike is NOT flagged as an npm token', () => {
    const { findings } = scan('npmbenign.js', 'const label = "npm_install_the_package_now";\n');
    assert.ok(!findings.some(f => f.type === 'NPM_TOKEN'),
      'an underscore-separated npm_ phrase is not a 36-char base62 token');
  });

  // -- ReDoS safety -------------------------------------------------------
  it('all patterns are ReDoS-safe against a 100k adversarial string', () => {
    const adversarial =
      'sk-ant-' + 'a'.repeat(50000) + '\n' +
      'eyJ' + '.'.repeat(50000) + '\n' +
      '-'.repeat(50000);
    fs.mkdirSync(SCAN_DIR, { recursive: true });
    const file = path.join(SCAN_DIR, 'adversarial.js');
    fs.writeFileSync(file, adversarial);
    const scanner = new SecretsScanner(SCAN_DIR);
    const start = Date.now();
    scanner.scanFile(file);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 2000, `scan of a 100k adversarial string took ${elapsed}ms (possible catastrophic backtracking)`);
  });
});

describe('Quality Gate Tests', () => {
  it('QualityGate class exists and can be instantiated', () => {
    const gate = new QualityGate(TEST_DIR);
    assert.ok(gate instanceof QualityGate);
  });

  it('GATE_STATUS contains expected values', () => {
    assert.strictEqual(GATE_STATUS.PASSED, 'PASSED');
    assert.strictEqual(GATE_STATUS.FAILED, 'FAILED');
    assert.strictEqual(GATE_STATUS.WARNING, 'WARNING');
    assert.strictEqual(GATE_STATUS.SKIPPED, 'SKIPPED');
  });

  it('DEFAULT_THRESHOLDS contains configurations for all modes', () => {
    assert.ok(DEFAULT_THRESHOLDS.strict);
    assert.ok(DEFAULT_THRESHOLDS.strictest);
    assert.ok(DEFAULT_THRESHOLDS.legacy);
    assert.ok(DEFAULT_THRESHOLDS.strict.coverage);
    assert.ok(DEFAULT_THRESHOLDS.strict.security);
  });

  it('strict mode has stricter thresholds than legacy', () => {
    assert.ok(DEFAULT_THRESHOLDS.strict.coverage.lines > DEFAULT_THRESHOLDS.legacy.coverage.lines);
    assert.ok(DEFAULT_THRESHOLDS.strict.security.high < DEFAULT_THRESHOLDS.legacy.security.high);
  });

  it('evaluateCoverage passes when coverage meets thresholds', () => {
    const gate = new QualityGate(TEST_DIR, { mode: 'strict' });
    const result = gate.evaluateCoverage({
      lines: 85,
      branches: 80,
      functions: 82,
      statements: 81
    });

    assert.strictEqual(result.status, GATE_STATUS.PASSED);
    assert.strictEqual(result.failures.length, 0);
  });

  it('evaluateCoverage fails when coverage below thresholds', () => {
    const gate = new QualityGate(TEST_DIR, { mode: 'strict' });
    const result = gate.evaluateCoverage({
      lines: 70,
      branches: 60,
      functions: 75,
      statements: 72
    });

    assert.strictEqual(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.length > 0);
  });

  it('evaluateSecurity passes with no critical/high findings', () => {
    const gate = new QualityGate(TEST_DIR, { mode: 'strict' });
    const result = gate.evaluateSecurity({
      sast: { MEDIUM: 5, LOW: 10 },
      dependencies: { MODERATE: 3 },
      secrets: 0
    });

    assert.strictEqual(result.status, GATE_STATUS.PASSED);
  });

  it('evaluateSecurity fails with critical findings', () => {
    const gate = new QualityGate(TEST_DIR, { mode: 'strict' });
    const result = gate.evaluateSecurity({
      sast: { CRITICAL: 1, HIGH: 2 },
      dependencies: {},
      secrets: 1
    });

    assert.strictEqual(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.length > 0);
  });

  it('evaluateCodeQuality passes with clean code', () => {
    const gate = new QualityGate(TEST_DIR, { mode: 'strict' });
    const result = gate.evaluateCodeQuality({
      lintErrors: 0,
      lintWarnings: 10,
      duplicatedLines: 2,
      codeSmells: 0
    });

    assert.strictEqual(result.status, GATE_STATUS.PASSED);
  });

  it('evaluateCodeQuality fails with lint errors', () => {
    const gate = new QualityGate(TEST_DIR, { mode: 'strict' });
    const result = gate.evaluateCodeQuality({
      lintErrors: 5,
      lintWarnings: 50,
      duplicatedLines: 5,
      codeSmells: 3
    });

    assert.strictEqual(result.status, GATE_STATUS.FAILED);
  });

  it('evaluate runs all dimension checks', () => {
    const gate = new QualityGate(TEST_DIR, { mode: 'strict' });
    const result = gate.evaluate({
      coverage: { lines: 85, branches: 80, functions: 80, statements: 82 },
      security: { sast: {}, dependencies: {}, secrets: 0 },
      codeQuality: { lintErrors: 0, lintWarnings: 5, duplicatedLines: 1, codeSmells: 0 }
    });

    assert.ok(result.dimensions.length >= 3);
  });

  it('getOverallResult returns FAILED if any dimension fails', () => {
    const gate = new QualityGate(TEST_DIR, { mode: 'strict' });
    gate.evaluate({
      coverage: { lines: 50, branches: 40, functions: 45, statements: 48 }, // Will fail
      security: { sast: {}, dependencies: {}, secrets: 0 }
    });

    const overall = gate.getOverallResult();
    assert.strictEqual(overall.status, GATE_STATUS.FAILED);
    assert.strictEqual(overall.passed, false);
  });

  it('mergeThresholds correctly merges custom thresholds', () => {
    const gate = new QualityGate(TEST_DIR, {
      mode: 'strict',
      thresholds: {
        coverage: { lines: 90 }
      }
    });

    assert.strictEqual(gate.thresholds.coverage.lines, 90);
    assert.strictEqual(gate.thresholds.coverage.branches, 80); // Default preserved
  });
});

// Cleanup after tests
after(() => {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});

console.log('# Security Module Tests');
console.log('# Running tests for SAST Runner, Dependency Auditor, Secrets Scanner, Quality Gate');

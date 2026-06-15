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

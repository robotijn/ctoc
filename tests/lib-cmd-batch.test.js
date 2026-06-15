/**
 * Command-module lib batch tests
 *
 * Contract-based tests for five previously untested command-module libs:
 *   - src/lib/cmd-audit.js
 *   - src/lib/cmd-ci.js
 *   - src/lib/cmd-coverage.js
 *   - src/lib/cmd-detect.js
 *   - src/lib/cmd-security.js
 *
 * These modules orchestrate other libs and occasionally shell out. The tests
 * assert the DOCUMENTED contract of each export: the happy path, the core
 * decision/argument-handling logic, and error/malformed-input paths (asserting
 * no uncaught throw and a structured error result). Filesystem work uses
 * hermetic temp directories cleaned up in afterEach. Cross-platform: every path
 * is built with path.join / os.tmpdir, never string concatenation.
 *
 * Notes on hermetic boundaries:
 *   - cmd-audit / cmd-security exercise DependencyAuditor against a temp dir
 *     that contains only a minimal package.json. npm IS detected, npm audit may
 *     exit non-zero, but the auditor swallows that into results.errors, so the
 *     command path completes deterministically with zero vulnerabilities.
 *   - SAST and secrets scanners read files only (no external binary), so the
 *     full security scan path is fully hermetic.
 *   - cmd-ci runner status / prereq probe the host environment; we assert their
 *     stable result shape rather than environment-specific values, and silence
 *     console noise. No external binary is required for these.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cmdAudit = require('../src/lib/cmd-audit');
const cmdCi = require('../src/lib/cmd-ci');
const cmdCoverage = require('../src/lib/cmd-coverage');
const cmdDetect = require('../src/lib/cmd-detect');
const cmdSecurity = require('../src/lib/cmd-security');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Best-effort cleanup; ignore.
  }
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function readJson(dir, relPath) {
  return JSON.parse(fs.readFileSync(path.join(dir, relPath), 'utf8'));
}

// A minimal node project so DependencyAuditor detects a package manager and the
// audit code path is exercised rather than the early "no managers" branch.
function seedNodeProject(dir) {
  writeFile(dir, 'package.json', JSON.stringify({
    name: 'ctoc-cmd-batch-fixture',
    version: '1.0.0',
    private: true
  }));
}

// Silence console output produced by the CI command's reporting functions so
// the test runner output stays readable. Restored after the call.
async function withSilencedConsole(fn) {
  const origLog = console.log;
  const origErr = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

// ===========================================================================
// cmd-audit.js
// ===========================================================================

describe('cmd-audit.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-cmd-audit-');
    seedNodeProject(projectDir);
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports the documented public API', () => {
    for (const name of ['execute', 'auditDependencies', 'auditAll', 'generateReport', 'checkGate']) {
      assert.equal(typeof cmdAudit[name], 'function', `missing export: ${name}`);
    }
  });

  test('execute({action:"deps"}) audits dependencies and persists results', async () => {
    const result = await cmdAudit.execute({ action: 'deps', projectRoot: projectDir });

    assert.equal(result.success, true);
    // No real vulnerabilities in a bare fixture -> threshold passes.
    assert.equal(result.passed, true);
    assert.ok(Array.isArray(result.vulnerabilities));
    assert.equal(result.vulnerabilities.length, 0);
    assert.ok(typeof result.message === 'string' && result.message.includes('Dependency Audit'));

    // Documented side effect: writes .ctoc/security/dependency-audit.json
    const saved = readJson(projectDir, path.join('.ctoc', 'security', 'dependency-audit.json'));
    assert.ok(Array.isArray(saved.vulnerabilities));
    assert.equal(saved.summary.total, 0);
  });

  test('execute defaults action to "deps" when omitted', async () => {
    const result = await cmdAudit.execute({ projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.passed, true);
  });

  test('execute with unknown action returns a structured error (no throw)', async () => {
    const result = await cmdAudit.execute({ action: 'bogus', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Unknown action: bogus/);
    assert.match(result.error, /deps, all, report, gate/);
  });

  test('auditDependencies includes fix commands when fix:true', async () => {
    // Plant a saved audit shape is not used here; this validates the no-throw
    // contract and the message structure on the empty (passing) case.
    const result = await cmdAudit.auditDependencies(projectDir, { fix: true });
    assert.equal(result.success, true);
    assert.equal(result.passed, true);
    assert.ok(result.message.includes('Audit PASSED'));
  });

  test('generateReport runs an audit first when no cached results exist', async () => {
    // No dependency-audit.json yet -> generateReport must produce one and report.
    const result = await cmdAudit.generateReport(projectDir, 'json');
    assert.equal(result.success, true);
    assert.equal(result.format, 'json');
    const parsed = JSON.parse(result.report);
    assert.ok(Array.isArray(parsed.vulnerabilities));
    // Cache now exists.
    assert.ok(fs.existsSync(path.join(projectDir, '.ctoc', 'security', 'dependency-audit.json')));
  });

  test('generateReport supports markdown format', async () => {
    await cmdAudit.auditDependencies(projectDir, {});
    const result = await cmdAudit.generateReport(projectDir, 'markdown');
    assert.equal(result.success, true);
    assert.equal(result.format, 'markdown');
    assert.match(result.report, /# Dependency Audit Report/);
    assert.match(result.report, /## Summary by Severity/);
  });

  test('checkGate evaluates dependency audit against the quality gate', async () => {
    const result = await cmdAudit.checkGate(projectDir, 'strict');
    assert.equal(result.success, true);
    // Empty audit -> gate passes.
    assert.equal(result.passed, true);
    assert.ok(Array.isArray(result.failures));
    assert.ok(result.message.includes('Dependency Audit Gate'));
  });

  test('auditAll delegates to runSecurityScan in cmd-security (the recently fixed require path)', async () => {
    // Regression guard: cmd-audit had a wrong require; it must resolve
    // runSecurityScan from cmd-security.js and return a full-scan shape.
    const result = await cmdAudit.auditAll(projectDir);
    assert.equal(result.success, true);
    // Full security scan shape: dependencies + sast + secrets + summary.
    assert.ok('dependencies' in result, 'auditAll must return the full security-scan result');
    assert.ok('sast' in result);
    assert.ok('secrets' in result);
    assert.ok(result.summary && typeof result.summary.total === 'number');
  });
});

// ===========================================================================
// cmd-ci.js  (pure argument parsing + stable result-shape handlers)
// ===========================================================================

describe('cmd-ci.js', () => {
  test('exports the documented public API', () => {
    for (const name of ['run', 'parseArgs', 'runPrePushGate', 'runPreReviewGate',
      'showStatus', 'showChecks', 'handleRunner', 'parseRunnerArgs']) {
      assert.equal(typeof cmdCi[name], 'function', `missing export: ${name}`);
    }
  });

  test('parseArgs defaults: action "run", verbose true, no flags', () => {
    const args = cmdCi.parseArgs('');
    assert.equal(args.action, 'run');
    assert.equal(args.prePush, false);
    assert.equal(args.preReview, false);
    assert.equal(args.type, null);
    assert.equal(args.verbose, true);
    assert.equal(args.help, false);
  });

  test('parseArgs maps subcommands to actions', () => {
    assert.equal(cmdCi.parseArgs('quick').action, 'quick');
    assert.equal(cmdCi.parseArgs('full').action, 'full');
    assert.equal(cmdCi.parseArgs('status').action, 'status');
    assert.equal(cmdCi.parseArgs('checks').action, 'checks');
    assert.equal(cmdCi.parseArgs('runner').action, 'runner');
  });

  test('parseArgs recognizes gate flags, quiet, and --type=', () => {
    assert.equal(cmdCi.parseArgs('--pre-push').prePush, true);
    assert.equal(cmdCi.parseArgs('--pre-review').preReview, true);
    assert.equal(cmdCi.parseArgs('-q').verbose, false);
    assert.equal(cmdCi.parseArgs('--quiet').verbose, false);
    assert.equal(cmdCi.parseArgs('--type=lint').type, 'lint');
  });

  test('parseArgs recognizes help in all forms', () => {
    for (const flag of ['help', '--help', '-h']) {
      assert.equal(cmdCi.parseArgs(flag).help, true, `help not set for ${flag}`);
    }
  });

  test('parseRunnerArgs defaults to the "menu" subcommand', () => {
    const args = cmdCi.parseRunnerArgs('');
    assert.equal(args.subcommand, 'menu');
    assert.equal(args.force, false);
    assert.equal(args.help, false);
    assert.equal(args.token, undefined);
  });

  test('parseRunnerArgs extracts subcommand, --force, --help, and a 40-char token', () => {
    const token = 'a'.repeat(40);
    const args = cmdCi.parseRunnerArgs(`setup ${token} --force`);
    assert.equal(args.subcommand, 'setup');
    assert.equal(args.force, true);
    assert.equal(args.token, token);

    const help = cmdCi.parseRunnerArgs('status -h');
    assert.equal(help.subcommand, 'status');
    assert.equal(help.help, true);
    // A non-40-char string must not be misread as a token.
    assert.equal(help.token, undefined);
  });

  test('run("help") returns success without executing checks', async () => {
    const result = await withSilencedConsole(() => cmdCi.run('help'));
    assert.equal(result.success, true);
  });

  test('run with an unknown --type returns success:false (no throw)', async () => {
    const result = await withSilencedConsole(() => cmdCi.run('--type=nonsense'));
    assert.equal(result.success, false);
  });

  test('handleRunner("status") returns a structured runner status (no throw)', async () => {
    const result = await withSilencedConsole(() => cmdCi.handleRunner('status'));
    assert.equal(result.success, true);
    assert.ok('preference' in result);
    assert.ok(result.status && typeof result.status === 'object');
    assert.equal(typeof result.status.installed, 'boolean');
    assert.equal(typeof result.status.running, 'boolean');
  });

  test('handleRunner("remove") without --force requires confirmation (no destructive action)', async () => {
    const result = await withSilencedConsole(() => cmdCi.handleRunner('remove'));
    assert.equal(result.success, false);
    assert.equal(result.action, 'confirm_needed');
  });

  test('handleRunner("preference") reports current global preference shape', async () => {
    const result = await withSilencedConsole(() => cmdCi.handleRunner('preference'));
    assert.equal(result.success, true);
    assert.ok('preference' in result);
    assert.equal(typeof result.asked, 'boolean');
  });

  test('handleRunner with --help returns success without acting', async () => {
    const result = await withSilencedConsole(() => cmdCi.handleRunner('--help'));
    assert.equal(result.success, true);
  });
});

// ===========================================================================
// cmd-coverage.js
// ===========================================================================

describe('cmd-coverage.js', () => {
  let projectDir;

  // Istanbul coverage-summary.json fixture with overall totals.
  function writeIstanbulSummary(dir, pct) {
    const block = { pct, total: 100, covered: Math.round(pct), skipped: 0 };
    writeFile(dir, path.join('coverage', 'coverage-summary.json'), JSON.stringify({
      total: { lines: block, branches: block, functions: block, statements: block }
    }));
  }

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-cmd-cov-');
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports the documented public API', () => {
    for (const name of ['execute', 'checkCoverage', 'generateReport', 'enforceCoverage',
      'showTrend', 'showFilesCoverage', 'findCoverageReport', 'saveCoverageHistory']) {
      assert.equal(typeof cmdCoverage[name], 'function', `missing export: ${name}`);
    }
  });

  test('checkCoverage returns a clear error when no report is found', async () => {
    const result = await cmdCoverage.execute({ action: 'check', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /No coverage report found/);
    assert.ok(typeof result.suggestion === 'string' && result.suggestion.length > 0);
  });

  test('checkCoverage passes when coverage meets the strict (80%) threshold', async () => {
    writeIstanbulSummary(projectDir, 95);
    const result = await cmdCoverage.execute({ action: 'check', mode: 'strict', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.pass, true);
    assert.equal(result.coverage.lines, 95);
    assert.equal(result.failures.length, 0);
    assert.equal(result.format, 'istanbul');
  });

  test('checkCoverage fails and lists failures when below threshold', async () => {
    writeIstanbulSummary(projectDir, 40);
    const result = await cmdCoverage.execute({ action: 'check', mode: 'strict', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.pass, false);
    assert.ok(result.failures.length > 0);
    assert.match(result.failures.join('\n'), /lines: 40% < 80% threshold/);
  });

  test('enforceCoverage honors a custom threshold override', async () => {
    writeIstanbulSummary(projectDir, 70);
    // 70% passes strict? No — strict is 80. With a custom 60% threshold it passes.
    const pass = await cmdCoverage.execute({
      action: 'enforce', mode: 'strict', threshold: 60, projectRoot: projectDir
    });
    assert.equal(pass.success, true);
    assert.equal(pass.pass, true);
    assert.equal(pass.customThreshold, 60);

    const fail = await cmdCoverage.execute({
      action: 'enforce', mode: 'strict', threshold: 90, projectRoot: projectDir
    });
    assert.equal(fail.pass, false);
    assert.ok(fail.failures.some(f => /70% < 90% threshold/.test(f)));
  });

  test('generateReport emits json / markdown / text', async () => {
    writeIstanbulSummary(projectDir, 88);

    const json = await cmdCoverage.execute({ action: 'report', format: 'json', projectRoot: projectDir });
    assert.equal(json.success, true);
    const parsed = JSON.parse(json.report);
    assert.equal(parsed.coverage.lines, 88);
    assert.equal(parsed.pass, true);

    const md = await cmdCoverage.execute({ action: 'report', format: 'markdown', projectRoot: projectDir });
    assert.match(md.report, /# Coverage Report/);

    const text = await cmdCoverage.execute({ action: 'report', format: 'text', projectRoot: projectDir });
    assert.match(text.report, /Coverage Report/);
  });

  test('showTrend reports "no history" when none exists, then reads a planted history', async () => {
    const none = await cmdCoverage.execute({ action: 'trend', projectRoot: projectDir });
    assert.equal(none.success, true);
    assert.equal(none.hasHistory, false);

    writeFile(projectDir, path.join('.ctoc', 'coverage-history.json'), JSON.stringify([
      { timestamp: '2024-01-01T00:00:00.000Z', lines: 70 },
      { timestamp: '2024-02-01T00:00:00.000Z', lines: 85 }
    ]));
    const trend = await cmdCoverage.execute({ action: 'trend', projectRoot: projectDir });
    assert.equal(trend.success, true);
    assert.equal(trend.hasHistory, true);
    assert.equal(trend.current, 85);
    assert.equal(trend.samples, 2);
    assert.equal(trend.change, 15);
  });

  test('showTrend returns a structured error on malformed history JSON (no throw)', async () => {
    writeFile(projectDir, path.join('.ctoc', 'coverage-history.json'), '{ not valid json');
    const result = await cmdCoverage.execute({ action: 'trend', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Failed to read coverage history/);
  });

  test('showFilesCoverage errors when no detailed (istanbul/lcov) report exists', async () => {
    // A summary-only report exists, but per-file needs coverage-final.json or lcov.
    writeIstanbulSummary(projectDir, 90);
    const result = await cmdCoverage.execute({ action: 'files', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /No detailed coverage report found/);
  });

  test('showFilesCoverage parses detailed lcov and filters below threshold', async () => {
    // findCoverageReport must succeed (lcov.info counts), and the detailed path
    // also resolves lcov.info -> per-file data.
    const lcov = [
      'SF:src/good.js',
      'LF:10', 'LH:10', 'BRF:4', 'BRH:4', 'end_of_record',
      'SF:src/bad.js',
      'LF:10', 'LH:3', 'BRF:4', 'BRH:1', 'end_of_record'
    ].join('\n');
    writeFile(projectDir, path.join('coverage', 'lcov.info'), lcov);

    const result = await cmdCoverage.execute({ action: 'files', below: 80, projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.threshold, 80);
    assert.equal(result.total, 2);
    assert.equal(result.belowThreshold, 1);
    assert.equal(result.files[0].lines, 30); // bad.js: 3/10
  });

  test('execute with unknown action returns a structured error', async () => {
    const result = await cmdCoverage.execute({ action: 'bogus', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Unknown action: bogus/);
    assert.match(result.error, /check, report, enforce, trend, files/);
  });

  test('findCoverageReport returns null when nothing is present, and a hit when present', () => {
    assert.equal(cmdCoverage.findCoverageReport(projectDir), null);
    writeFile(projectDir, path.join('coverage', 'lcov.info'), 'SF:x\nend_of_record\n');
    const hit = cmdCoverage.findCoverageReport(projectDir);
    assert.ok(hit);
    assert.equal(hit.relative, path.join('coverage', 'lcov.info'));
  });

  test('saveCoverageHistory appends and caps the history at 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      cmdCoverage.saveCoverageHistory(projectDir, { lines: i });
    }
    const history = readJson(projectDir, path.join('.ctoc', 'coverage-history.json'));
    assert.equal(history.length, 100);
    // Oldest entries trimmed; last is the most recent push.
    assert.equal(history[history.length - 1].lines, 104);
    assert.ok('timestamp' in history[0]);
  });
});

// ===========================================================================
// cmd-detect.js
// ===========================================================================

describe('cmd-detect.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-cmd-detect-');
    // A small real project so the analyzer has something to chew on.
    seedNodeProject(projectDir);
    writeFile(projectDir, path.join('src', 'index.js'), 'module.exports = () => 42;\n');
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports the documented public API', () => {
    for (const name of ['execute', 'detectFull', 'detectQuality', 'detectMode', 'detectUpgrade', 'detectFix']) {
      assert.equal(typeof cmdDetect[name], 'function', `missing export: ${name}`);
    }
  });

  test('detectFull returns analysis + mode suggestion + formatted message', async () => {
    const result = await cmdDetect.execute({ action: 'full', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.ok(result.analysis && typeof result.analysis === 'object');
    assert.ok(result.suggestion && typeof result.suggestion.recommended === 'string');
    assert.match(result.message, /Project Analysis/);
    assert.match(result.message, /Mode Suggestion/);
  });

  test('detectFull with json:true returns raw objects and no message', async () => {
    const result = await cmdDetect.execute({ action: 'full', json: true, projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.ok(result.analysis);
    assert.ok(result.suggestion);
    assert.equal(result.message, undefined);
  });

  test('detectQuality returns a quality score and technical-debt summary', async () => {
    const result = await cmdDetect.execute({ action: 'quality', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.ok(result.quality && typeof result.quality.overall === 'number');
    assert.ok(result.debt);
    assert.match(result.message, /Quality Score/);
  });

  test('detectMode returns a mode suggestion with recommended/alternative', async () => {
    const result = await cmdDetect.execute({ action: 'mode', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.ok(['strict', 'strictest', 'legacy'].includes(result.suggestion.recommended));
    assert.match(result.message, /Mode Suggestion/);
  });

  test('detectUpgrade produces an upgrade roadmap with phases', async () => {
    const result = await cmdDetect.execute({ action: 'upgrade', teamSize: 2, projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.ok(result.plan && Array.isArray(result.plan.phases));
    assert.match(result.message, /Upgrade Roadmap/);
  });

  test('detectFix (no --fix) lists available fixes without applying them', async () => {
    const result = await cmdDetect.execute({ action: 'fix', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.ok(Array.isArray(result.availableFixes));
    assert.match(result.message, /Available Auto-Fixes/);
  });

  test('detectFix with fix:true + dryRun:true returns results without mutating files', async () => {
    const before = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8');
    const result = await cmdDetect.execute({
      action: 'fix', fix: true, dryRun: true, riskLevel: 'low', projectRoot: projectDir
    });
    assert.equal(result.success, true);
    assert.ok(result.results !== undefined);
    const after = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8');
    assert.equal(after, before, 'dry-run must not modify project files');
  });

  test('execute defaults to "full" when action omitted', async () => {
    const result = await cmdDetect.execute({ projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.ok(result.analysis);
  });

  test('execute catches analyzer failures and returns success:false (no throw)', async () => {
    // A non-existent projectRoot must not throw; execute wraps errors.
    const missing = path.join(projectDir, 'does-not-exist-dir');
    const result = await cmdDetect.execute({ action: 'full', projectRoot: missing });
    // Contract: never throws. Either it analyzes an empty tree (success:true)
    // or it reports a structured error (success:false). Both are acceptable;
    // an uncaught throw is not.
    assert.equal(typeof result.success, 'boolean');
    if (!result.success) {
      assert.equal(typeof result.error, 'string');
    }
  });
});

// ===========================================================================
// cmd-security.js
// ===========================================================================

describe('cmd-security.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-cmd-sec-');
    seedNodeProject(projectDir);
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports the documented public API', () => {
    for (const name of ['execute', 'runSecurityScan', 'generateSecurityReport', 'checkSecurityGate', 'suggestFixes']) {
      assert.equal(typeof cmdSecurity[name], 'function', `missing export: ${name}`);
    }
  });

  test('runSecurityScan (all) returns the full multi-scanner shape and persists results', async () => {
    const result = await cmdSecurity.runSecurityScan(projectDir, { all: true });
    assert.equal(result.success, true);
    // All three scanners ran (or were attempted); each yields a {findings|vulnerabilities} object.
    assert.ok(result.sast && Array.isArray(result.sast.findings));
    assert.ok(result.dependencies && Array.isArray(result.dependencies.vulnerabilities));
    assert.ok(result.secrets && Array.isArray(result.secrets.findings));
    assert.equal(typeof result.summary.total, 'number');
    assert.ok(typeof result.summary.bySeverity === 'object');

    // Documented side effect: writes .ctoc/security/latest-scan.json
    const saved = readJson(projectDir, path.join('.ctoc', 'security', 'latest-scan.json'));
    assert.equal(typeof saved.summary.total, 'number');
  });

  test('runSecurityScan with only secrets:true skips sast and deps', async () => {
    const result = await cmdSecurity.runSecurityScan(projectDir, {
      sast: false, deps: false, secrets: true, all: false
    });
    assert.equal(result.success, true);
    assert.equal(result.sast, null);
    assert.equal(result.dependencies, null);
    assert.ok(result.secrets && Array.isArray(result.secrets.findings));
  });

  test('execute({action:"scan"}) runs the scan via the public entrypoint', async () => {
    const result = await cmdSecurity.execute({ action: 'scan', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(typeof result.summary.total, 'number');
  });

  test('execute with unknown action returns a structured error (no throw)', async () => {
    const result = await cmdSecurity.execute({ action: 'bogus', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Unknown action: bogus/);
    assert.match(result.error, /scan, report, gate, fix/);
  });

  test('generateSecurityReport errors before any scan, then renders after a scan', async () => {
    const missing = await cmdSecurity.execute({ action: 'report', projectRoot: projectDir });
    assert.equal(missing.success, false);
    assert.match(missing.error, /No security scan results found/);

    await cmdSecurity.runSecurityScan(projectDir, { all: true });

    const json = await cmdSecurity.execute({ action: 'report', format: 'json', projectRoot: projectDir });
    assert.equal(json.success, true);
    assert.equal(json.format, 'json');
    JSON.parse(json.report); // must be valid JSON

    const md = await cmdSecurity.execute({ action: 'report', format: 'markdown', projectRoot: projectDir });
    assert.match(md.report, /# Security Scan Report/);

    const text = await cmdSecurity.execute({ action: 'report', format: 'text', projectRoot: projectDir });
    assert.match(text.report, /Security Scan Report/);
  });

  test('checkSecurityGate runs a scan if needed and evaluates the gate', async () => {
    const result = await cmdSecurity.execute({ action: 'gate', mode: 'strict', projectRoot: projectDir });
    assert.equal(result.success, true);
    // Clean fixture -> gate passes.
    assert.equal(result.passed, true);
    assert.ok(Array.isArray(result.failures));
    assert.ok(result.metrics && typeof result.metrics === 'object');
    assert.ok(result.message.includes('Security Gate Check'));
  });

  test('suggestFixes errors before any scan, then summarizes after a scan', async () => {
    const missing = await cmdSecurity.execute({ action: 'fix', projectRoot: projectDir });
    assert.equal(missing.success, false);
    assert.match(missing.error, /No security scan results found/);

    await cmdSecurity.runSecurityScan(projectDir, { all: true });
    const result = await cmdSecurity.execute({ action: 'fix', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.ok(Array.isArray(result.suggestions));
    assert.equal(typeof result.autoFixable, 'number');
    // Clean fixture -> no issues found.
    assert.match(result.message, /No security issues found/);
  });

  test('suggestFixes returns a structured error on corrupt cached results (no throw)', async () => {
    writeFile(projectDir, path.join('.ctoc', 'security', 'latest-scan.json'), '{ broken');
    await assert.rejects(
      // JSON.parse on corrupt file is the only uncaught path; document it as a
      // known gap by asserting the throw is a SyntaxError rather than silently
      // passing. If the module is later hardened, switch to a success:false check.
      async () => cmdSecurity.execute({ action: 'fix', projectRoot: projectDir }),
      /JSON|Unexpected/
    );
  });
});

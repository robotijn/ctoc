/**
 * R6-D — A crashed security scanner is a FAILURE, not a pass.
 *
 * THE FAIL-OPEN DEFECT: runGosec/runBandit/runESLintSecurity swallowed an
 * unparseable stdout (a Python traceback / config error printed where findings
 * JSON was expected) with a bare comment. A scanner that CRASHED read IDENTICALLY
 * to a clean scan — zero findings, zero errors — so the push-blocking security
 * gate passed on a scanner that never actually vetted the code. runSemgrep shows
 * the correct pattern (`this.errors.push({ tool, error })`).
 *
 * These tests fail CLOSED: a crash must surface in `this.errors`, and a non-zero
 * exit that still carries valid findings JSON must parse as findings (unchanged).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const SAST_PATH = require.resolve('../src/lib/sast-runner');

const REAL_EXEC = cp.execSync;
const REAL_EXECFILE = cp.execFileSync;

/** Reload sast-runner AFTER installing the current cp.execSync/execFileSync fakes
 *  (the module destructures them at load time). */
function freshSAST() {
  delete require.cache[SAST_PATH];
  return require(SAST_PATH).SASTRunner;
}

function restore() {
  cp.execSync = REAL_EXEC;
  cp.execFileSync = REAL_EXECFILE;
  delete require.cache[SAST_PATH];
}

function crashError(stdout) {
  const e = new Error('Command failed with exit code 1');
  e.status = 1;
  e.stdout = stdout;
  return e;
}

test('runBandit: a crash (traceback on stdout) surfaces in errors, not silence', async () => {
  // INJ-1: runBandit now invokes execFileSync (no shell), so the crash seam is execFileSync.
  cp.execFileSync = () => { throw crashError('Traceback (most recent call last):\n  ImportError: broken plugin'); };
  const SASTRunner = freshSAST();
  try {
    const r = new SASTRunner('/nonexistent-project');
    await r.runBandit();
    assert.ok(
      r.errors.some(e => e.tool === 'bandit' && typeof e.error === 'string' && e.error.length > 0),
      'a crashed bandit must be recorded in this.errors with a message'
    );
    assert.equal(r.findings.length, 0, 'a crash produces no findings');
  } finally {
    restore();
  }
});

test('runGosec: a crash (non-JSON stdout) surfaces in errors', async () => {
  cp.execSync = () => { throw crashError('panic: gosec config error\ngoroutine 1 [running]:'); };
  const SASTRunner = freshSAST();
  try {
    const r = new SASTRunner('/nonexistent-project');
    await r.runGosec();
    assert.ok(
      r.errors.some(e => e.tool === 'gosec' && e.error),
      'a crashed gosec must be recorded in this.errors'
    );
  } finally {
    restore();
  }
});

test('runESLintSecurity: a crash (non-JSON stdout) surfaces in errors', async () => {
  cp.execFileSync = () => { throw crashError('Oops! Something went wrong! :(\nnot json'); };
  const SASTRunner = freshSAST();
  try {
    const r = new SASTRunner('/nonexistent-project');
    await r.runESLintSecurity();
    assert.ok(
      r.errors.some(e => e.tool === 'eslint-security' && e.error),
      'a crashed eslint-security scan must be recorded in this.errors'
    );
  } finally {
    restore();
  }
});

test('CONTRAST — bandit non-zero exit WITH valid findings JSON parses as findings, not an error', async () => {
  const payload = JSON.stringify({
    results: [{
      test_id: 'B602', filename: 'app.py', line_number: 12,
      issue_text: 'subprocess with shell=True', issue_severity: 'HIGH', issue_confidence: 'HIGH'
    }]
  });
  // INJ-1: runBandit now invokes execFileSync (no shell), so mock that seam.
  cp.execFileSync = () => { throw crashError(payload); };
  const SASTRunner = freshSAST();
  try {
    const r = new SASTRunner('/nonexistent-project');
    await r.runBandit();
    assert.equal(r.errors.length, 0, 'valid findings JSON on a non-zero exit is NOT an error');
    assert.equal(r.findings.length, 1, 'the finding must be parsed');
    // FN-2: B602 (subprocess with shell=True) carries CWE-78 (OS command injection),
    // whose CWE_SEVERITY_MAP floor is CRITICAL. Bandit's own severity was HIGH; the
    // CWE floor correctly PROMOTES it to CRITICAL (the whole point of the FN-2 fix —
    // a command-injection finding must be able to fail a CRITICAL gate).
    assert.equal(r.findings[0].severity, 'CRITICAL');
  } finally {
    restore();
  }
});

test('run(): zero scanners available reports scanned:false / success:false, never a clean pass', async () => {
  // Every tool probe fails → no scanner is available.
  cp.execSync = () => { throw new Error('command not found'); };
  const SASTRunner = freshSAST();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r6d-sast-'));
  try {
    fs.writeFileSync(path.join(tmp, 'go.mod'), 'module x\n'); // a detectable language
    const r = new SASTRunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, false, 'run() must report that nothing was scanned');
    assert.equal(res.success, false, 'no scanner ran → not a success');
    assert.ok(/no security scanner/i.test(res.reason || ''), 'reason must name the missing-scanner cause');
    assert.deepEqual(res.findings, [], 'no findings when nothing scanned');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

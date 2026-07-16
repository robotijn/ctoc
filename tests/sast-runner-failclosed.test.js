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

test('runSemgrep: a crash (no parseable stdout) returns false and records an error', async () => {
  // R13: a scanner method must SIGNAL whether it actually ran+parsed, so run() can
  // count only genuine executions. A crash (ENOENT: non-zero exit, no stdout) → false.
  cp.execFileSync = () => { throw crashError(undefined); };
  const SASTRunner = freshSAST();
  try {
    const r = new SASTRunner('/nonexistent-project');
    const ok = await r.runSemgrep();
    assert.equal(ok, false, 'a crashed semgrep must return false (it did not scan)');
    assert.ok(r.errors.some(e => e.tool === 'semgrep' && e.error), 'the crash is recorded');
    assert.equal(r.findings.length, 0, 'a crash produces no findings');
  } finally {
    restore();
  }
});

test('runSemgrep: a clean run (valid empty JSON) returns true', async () => {
  cp.execFileSync = () => JSON.stringify({ results: [] });
  const SASTRunner = freshSAST();
  try {
    const r = new SASTRunner('/nonexistent-project');
    const ok = await r.runSemgrep();
    assert.equal(ok, true, 'a semgrep run that parsed must return true');
    assert.equal(r.errors.length, 0, 'a clean run records no error');
  } finally {
    restore();
  }
});

test('run(): sole scanner AVAILABLE but its scan CRASHES reports scanned:false / success:false', async () => {
  // The fail-OPEN defect: run() counted semgrep on AVAILABILITY, before the scan, and
  // ignored its result. A semgrep that is installed but whose invocation crashes (ENOENT
  // / no parseable stdout) then read as scanned:true / findings:[] — a crashed scanner
  // reporting the project clean. It must fall through to the fail-closed branch.
  cp.execSync = (cmd) => {
    if (typeof cmd === 'string' && cmd.startsWith('semgrep')) return ''; // semgrep "installed"
    throw new Error('command not found'); // every other tool probe fails
  };
  cp.execFileSync = () => { throw crashError(undefined); }; // the semgrep invocation crashes
  const SASTRunner = freshSAST();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-sast-'));
  try {
    fs.writeFileSync(path.join(tmp, 'go.mod'), 'module x\n'); // a detectable language
    const r = new SASTRunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, false, 'a crashed sole scanner scanned nothing');
    assert.equal(res.success, false, 'a crashed sole scanner is not a success');
    assert.ok(/no security scanner/i.test(res.reason || ''), 'reason names the fail-closed cause');
    assert.deepEqual(res.findings, [], 'no findings when nothing reliably scanned');
    assert.ok(r.errors.some(e => e.tool === 'semgrep'), 'the semgrep crash is surfaced');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('run(): OVER-CORRECTION GUARD — a genuinely clean scan (scanner ran, zero findings) stays success:true', async () => {
  // Guards against failing a real clean pass: semgrep is available, runs, and returns
  // valid empty JSON. That is a genuine scan of a clean project → success:true / scanned:true.
  cp.execSync = (cmd) => {
    if (typeof cmd === 'string' && cmd.startsWith('semgrep')) return ''; // semgrep installed
    throw new Error('command not found'); // native tools (gosec) unavailable
  };
  cp.execFileSync = () => JSON.stringify({ results: [] }); // semgrep runs, finds nothing
  const SASTRunner = freshSAST();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r13clean-sast-'));
  try {
    fs.writeFileSync(path.join(tmp, 'go.mod'), 'module x\n');
    const r = new SASTRunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, true, 'a scanner genuinely ran → scanned:true');
    assert.equal(res.success, true, 'a clean scan is a success, not a false failure');
    assert.deepEqual(res.findings, [], 'a clean project has zero findings');
    assert.equal(r.errors.length, 0, 'no crash recorded on a clean run');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
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

'use strict';

/**
 * REQUEST-EXIT — a process must not throw away its own verdict on the way out.
 *
 * `src/scripts/test-gate.js` printed the whole suite output, then its verdict
 * ("coverage 99.02% …", "PASS"), and then called `process.exit(0)`. Writes to a
 * PIPE are asynchronous, and `process.exit` does NOT drain them — so whenever
 * anything captured the gate (which is exactly what Step 14 VERIFY does), the
 * output was cut at the ~64KB pipe capacity, mid-line, and the coverage table and
 * verdict at the very end were discarded. VERIFY then read "no coverage figure was
 * produced" and failed closed, making Gate 3 un-passable for every plan.
 *
 * Interactively it looked perfect, because a write to a terminal is synchronous.
 * Only a pipe reveals it — so these tests use a real pipe, a real child process,
 * and a payload well past the pipe capacity. ZERO doubles.
 *
 * The property under test is the one that matters to a human: everything the
 * process printed arrives, and the exit code is still the one it meant.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REQUEST_EXIT = path.join(__dirname, '..', 'src', 'lib', 'request-exit.js');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-request-exit-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

/**
 * Run a child that writes `bytes` of padding, then a final VERDICT line, then
 * terminates via the given strategy. Captured through a real pipe.
 */
function runChild({ bytes, code, strategy }) {
  const script = path.join(dir, 'child.js');
  const terminate = strategy === 'requestExit'
    ? `require(${JSON.stringify(REQUEST_EXIT)}).requestExit(${code});`
    : `process.exit(${code});`;
  fs.writeFileSync(script, [
    `process.stdout.write('x'.repeat(${bytes}));`,
    "process.stdout.write('\\nVERDICT: coverage 99.02% PASS\\n');",
    terminate
  ].join('\n'));

  const r = spawnSync(process.execPath, [script], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  return { stdout: r.stdout || '', status: r.status };
}

describe('requestExit — the tail of the output survives a piped exit', () => {
  it('R1: a 200KB write followed by requestExit(0) delivers the FINAL verdict line', () => {
    const r = runChild({ bytes: 200000, code: 0, strategy: 'requestExit' });

    assert.ok(
      /VERDICT: coverage 99\.02% PASS/.test(r.stdout),
      'the verdict is printed LAST and is the whole point of the run; it must not be ' +
      `discarded on exit. received ${r.stdout.length} of ~200030 characters`
    );
    assert.ok(
      r.stdout.length >= 200030,
      `the entire output must arrive, not just the pipe buffer; got ${r.stdout.length}`
    );
    assert.equal(r.status, 0, 'the exit code must still be the one the program meant');
  });

  it('R2: a FAILING exit code is preserved, and its output still arrives in full', () => {
    const r = runChild({ bytes: 200000, code: 1, strategy: 'requestExit' });

    assert.equal(r.status, 1, 'a failing gate must still exit non-zero — flushing must not turn red into green');
    assert.ok(
      /VERDICT: coverage 99\.02% PASS/.test(r.stdout),
      'the tail must survive on the failure path too — that is where a human most needs it'
    );
  });

  it('R3: the hazard is real — the same child using process.exit LOSES the tail', () => {
    const r = runChild({ bytes: 200000, code: 0, strategy: 'processExit' });

    // This is the non-vacuity guard: if this ever stops truncating, R1 proves nothing.
    assert.ok(
      r.stdout.length < 200030,
      'process.exit after a large piped write is expected to truncate; if it no longer ' +
      'does, R1 has become a test that cannot fail and must be re-derived'
    );
    assert.ok(
      !/VERDICT: coverage 99\.02% PASS/.test(r.stdout),
      'the discarded tail is exactly the verdict — this is the defect being fixed'
    );
  });

  it('R4: a small output is unaffected and exits with the requested code', () => {
    const r = runChild({ bytes: 10, code: 0, strategy: 'requestExit' });

    assert.ok(/VERDICT: coverage 99\.02% PASS/.test(r.stdout));
    assert.equal(r.status, 0);
  });
});

describe('requestExit — contract', () => {
  it('R5: it sets process.exitCode rather than terminating immediately', () => {
    const script = path.join(dir, 'after.js');
    fs.writeFileSync(script, [
      `require(${JSON.stringify(REQUEST_EXIT)}).requestExit(3);`,
      // If requestExit terminated the process outright, this line never runs and the
      // pending write below is lost — which is the behaviour being replaced.
      "process.stdout.write('STILL RUNNING\\n');"
    ].join('\n'));

    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });

    assert.match(r.stdout, /STILL RUNNING/, 'requestExit must return, letting the caller finish and Node drain');
    assert.equal(r.status, 3, 'the requested code must still be the process exit code');
  });

  it('R6: a non-integer code is rejected loudly rather than silently exiting 0', () => {
    assert.throws(
      () => require('../src/lib/request-exit').requestExit('nope'),
      /integer/i,
      'a bad exit code must never degrade into a silent success'
    );
  });
});

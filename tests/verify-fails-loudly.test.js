'use strict';

/**
 * VERIFY FAILS LOUDLY (R4-A) — a gate that opens on nothing is not a gate.
 *
 * Two independent critics + a live execution confirmed runVerify was broken in
 * BOTH directions:
 *   1. VACUOUS PASS. A project with no toolchain (no package.json, no tests, no
 *      linter) ran ZERO checks and returned { passed:true,
 *      summary:"All fallback quality checks passed." } — and Gate 3 opened on
 *      that artifact. Nothing was verified.
 *   2. SPURIOUS FAIL (finding C2). A normal Node project with a passing test
 *      script but NO `lint`/`typecheck` script minted passed:false, because a
 *      MISSING npm script ("npm error Missing script: lint") does not contain the
 *      literal "not found" the old tryCommands sniffed for, so an ABSENT script
 *      was counted as a FAILING check. Gate 3 refused a perfectly good project.
 *
 * The contract these tests pin (CLAUDE.md, verbatim): "If a test cannot run, it
 * must FAIL LOUDLY." A check that did not run is NOT a check that passed. At least
 * one substantive check must actually RUN, every check that ran must pass, no
 * required check may be skipped, and coverage — when measurable against a declared
 * floor — must clear it. ZERO doubles: every project is real on disk and every
 * check is a real subprocess.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const verify = require('../src/lib/step-13-verify');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-verify-loud-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

function write(name, content) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function pkg(obj) { write('package.json', JSON.stringify(obj, null, 2)); }

// ─────────────────────────────────────────────────────────────────────────────
// V1 — THE VACUITY TEST: no verifiable toolchain is NOT a pass.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — no verifiable toolchain fails LOUDLY', () => {
  it('V1: an empty project (no package.json, no tests, no linter) FAILS with no-verifiable-toolchain', () => {
    const res = verify.runVerify(dir);
    assert.equal(res.passed, false, 'a project where NOTHING could run must not pass — that is the whole defect');
    assert.ok(
      res.errors.some((e) => /no-verifiable-toolchain/i.test(e)),
      `the failure must name what was looked for; errors: ${JSON.stringify(res.errors)}`
    );
    assert.ok(
      !/all .*checks passed/i.test(res.summary),
      `the summary must NEVER claim checks passed when none ran; got: ${res.summary}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2/V3 — a REAL project: tests actually run, and the verdict follows the tests.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — real project, real test run', () => {
  it('V2: a project whose real test script passes → passed:true and the test check RAN', () => {
    pkg({ name: 'real', version: '1.0.0', scripts: { test: 'node -e "process.exit(0)"' } });
    const res = verify.runVerify(dir);
    assert.equal(res.passed, true, `a real passing project must pass; errors: ${JSON.stringify(res.errors)}`);
    assert.equal(res.checks.tests.ran, true, 'the test check must be marked as having actually RUN');
    assert.equal(res.checks.tests.passed, true);
  });

  it('V3: a project whose real test script fails → passed:false, error names the tests', () => {
    pkg({ name: 'real', version: '1.0.0', scripts: { test: 'node -e "process.exit(1)"' } });
    const res = verify.runVerify(dir);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => /test/i.test(e)), `errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V4 — finding C2: a NORMAL project (tests, no lint/typecheck) must PASS.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — a missing script is applicable:false, not a failing check', () => {
  it('V4: a normal Node project (passing test, NO lint/typecheck scripts) PASSES', () => {
    pkg({ name: 'normal', version: '1.0.0', scripts: { test: 'node -e "process.exit(0)"' } });
    const res = verify.runVerify(dir);
    assert.equal(res.passed, true, `a normal project with tests but no lint/typecheck must pass; errors: ${JSON.stringify(res.errors)}`);
    assert.ok(
      !res.errors.some((e) => /lint/i.test(e)),
      `an ABSENT lint script must NOT be reported as a failing check; errors: ${JSON.stringify(res.errors)}`
    );
    assert.equal(res.checks.lint.applicable, false, 'an absent lint script is applicable:false (recorded, not an error)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V5 — the "0 skipped" contract enters VERIFY.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — a skipped test fails the gate (contract: 0 skipped)', () => {
  it('V5: a test run reporting a skipped test → passed:false', () => {
    // A real test run whose output honestly reports one skipped test.
    pkg({ name: 'skips', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'# tests 1\'); console.log(\'# skipped 1\'); process.exit(0)"'
    } });
    const res = verify.runVerify(dir);
    assert.equal(res.passed, false, 'a skipped test violates the 0-skipped contract and must fail VERIFY');
    assert.ok(res.errors.some((e) => /skip/i.test(e)), `the failure must name the skip; errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V6 — coverage below the project's declared floor fails the gate.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — coverage below the declared floor fails the gate', () => {
  it('V6: measured coverage under .ctoc/coverage-baseline.json minPct → passed:false', () => {
    write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: 40 }));
    // A real test run that emits an istanbul-style coverage summary well under the floor.
    pkg({ name: 'lowcov', version: '1.0.0', scripts: {
      test: 'node -e "console.log(\'All files | 12.5 |\'); process.exit(0)"'
    } });
    const res = verify.runVerify(dir);
    assert.equal(res.passed, false, 'coverage below the declared floor must fail VERIFY');
    assert.ok(res.errors.some((e) => /coverage/i.test(e)), `the failure must name coverage; errors: ${JSON.stringify(res.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V7 — the app-run last mile (SYNC path) actually runs and gates.
// ─────────────────────────────────────────────────────────────────────────────
describe('runVerify — app-shaped project whose app does not boot FAILS (sync path)', () => {
  it('V7: a server whose dev script crashes on boot → passed:false, appRuns responded:false', () => {
    // No test/lint/typecheck scripts: the ONLY signal is whether the app runs.
    pkg({ name: 'brokenapp', version: '1.0.0', scripts: { dev: 'node -e "process.exit(1)"' } });
    const res = verify.runVerify(dir);
    assert.equal(res.passed, false, 'an app-shaped project whose app never responds must fail VERIFY');
    assert.equal(res.checks.appRuns.applicable, true, 'a server IS app-shaped — the check applies');
    assert.equal(res.checks.appRuns.responded, false);
    assert.ok(
      !res.errors.some((e) => /Lint failed/.test(e)),
      `an absent lint script must not manufacture a spurious lint failure; errors: ${JSON.stringify(res.errors)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V8 — a run that TIMES OUT is UNCERTIFIED, never mislabeled a test failure.
//
// Finding (review of R4-A): the ENOBUFS overflow was given its own UNCERTIFIED
// branch, but a SIGTERM/ETIMEDOUT timeout fell through the generic catch — which
// marks a launch failure only for ENOENT/exit-127 — so a long-but-green suite
// minted `success:false` with the dishonest reason "Tests failed", and the 120s
// budget was hardcoded so a legitimately long suite had no exit. This is the same
// dishonesty class this plan abolishes, on the one axis it left open: a run that
// did not COMPLETE is not a run that FAILED. It must fail CLOSED (refuse the gate)
// but with its TRUE reason and a RAISABLE budget.
// ─────────────────────────────────────────────────────────────────────────────
describe('tryCommand — a timeout is UNCERTIFIED with its true reason, not a test failure', () => {
  it('V8: a command that exceeds the configured budget → success:false, spawnFailed:false, error names UNCERTIFIED + the budget', () => {
    // A cross-platform 3s sleeper; the budget is 300ms, so it is guaranteed to
    // be terminated by the timeout, not to exit on its own.
    const r = verify.tryCommand('node -e "setTimeout(function(){}, 3000)"', dir, { timeout: 300 });
    assert.equal(r.success, false, 'a run that did not complete fails CLOSED (never a false pass)');
    assert.equal(r.spawnFailed, false, 'a timeout RAN — it is NOT a launch failure (NOT-RUN)');
    assert.ok(/uncertified/i.test(r.error), `the timeout must be reported UNCERTIFIED; got: ${r.error}`);
    assert.ok(
      /budget|timed out|timeout|CTOC_VERIFY_TIMEOUT_MS/i.test(r.error),
      `the reason must name the budget so an operator can raise it; got: ${r.error}`
    );
    assert.ok(
      !/^tests failed/i.test(r.error) && !/^tests? failed/i.test(r.error),
      `a timeout must NOT be mislabeled a test failure; got: ${r.error}`
    );
  });

  it('V8b: the timeout budget is configurable via CTOC_VERIFY_TIMEOUT_MS', () => {
    const prev = process.env.CTOC_VERIFY_TIMEOUT_MS;
    process.env.CTOC_VERIFY_TIMEOUT_MS = '250';
    try {
      const r = verify.tryCommand('node -e "setTimeout(function(){}, 3000)"', dir);
      assert.equal(r.success, false);
      assert.ok(/uncertified/i.test(r.error), `env-configured budget must still fail UNCERTIFIED; got: ${r.error}`);
    } finally {
      if (prev === undefined) delete process.env.CTOC_VERIFY_TIMEOUT_MS;
      else process.env.CTOC_VERIFY_TIMEOUT_MS = prev;
    }
  });
});

'use strict';

/**
 * Vacuous-verification fence (plan 00209).
 *
 * The defect: when tool DETECTION produces no lint/typecheck command to run, the quality
 * agent printed "Lint passed" / "Type check passed" and returned { passed: true, errors: 0 }.
 * A check that never ran was recorded as a success — a verification of nothing read as a
 * pass, and it composed into a green Tier 1 that let a push proceed on an unverified repo.
 *
 * The fix (fail toward honest, never toward green): a zero-tool detection is NOT a pass.
 * runLint / runTypecheck carry a `ran` count and return a not-verified result
 * (passed:false, ran:0, errors:null, undetermined:true) when nothing ran — mirroring the
 * `undetermined` idiom this module already uses for undetermined test detection
 * (undeterminedTestsResult) and test-gate.js's parsers, which return null (not the success
 * value) so an input that was never measured cannot be mistaken for a clean one.
 *
 * These tests are written FIRST (TDD red): against the pre-fix code, cases asserting
 * passed:false / ran / errors:null FAIL, because the code returns passed:true, errors:0
 * and carries no `ran` field.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const qa = require('../src/lib/quality-agent');
const { runLint, runTypecheck, runSecurityScan, notVerifiedLint, notVerifiedTypecheck } = qa;

// Portable commands: node is guaranteed present (this suite runs under it). No shell, no
// assumption that any particular linter is installed. runConfiguredCommand runs these as
// an argv vector via execFileSync (shell:false).
const PASS_CMD = 'node --version';        // exits 0
const FAIL_CMD = 'node -e process.exit(1)'; // exits 1 — a genuine run failure

// Capture console.log for the duration of fn(), returning { res, log }.
async function captureLog(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => { lines.push(args.join(' ')); };
  try {
    const res = await fn();
    return { res, log: lines.join('\n') };
  } finally {
    console.log = original;
  }
}

// 1 — runLint({}) — the defect. No tool carries a lint command → NOT a pass.
test('1. runLint({}) is not-verified, not a vacuous pass', async () => {
  const { res, log } = await captureLog(() => runLint({}));
  assert.equal(res.passed, false);
  assert.equal(res.ran, 0);
  assert.equal(res.errors, null);
  assert.match(res.output, /NOT VERIFIED/);
  assert.doesNotMatch(log, /Lint passed/);
});

// 2 — runTypecheck({}) — same shape.
test('2. runTypecheck({}) is not-verified, not a vacuous pass', async () => {
  const { res, log } = await captureLog(() => runTypecheck({}));
  assert.equal(res.passed, false);
  assert.equal(res.ran, 0);
  assert.equal(res.errors, null);
  assert.match(res.output, /NOT VERIFIED/);
  assert.doesNotMatch(log, /Type check passed/);
});

// 3 — tools present but none carries a lint command (the `continue`-only path).
test('3. runLint with tools but no lint command → passed:false, ran:0', async () => {
  const { res } = await captureLog(() => runLint({ js: { lint: null }, go: {} }));
  assert.equal(res.passed, false);
  assert.equal(res.ran, 0);
});

// 4 — one tool with a succeeding lint command → unbroken pass, ran:1.
test('4. runLint with one succeeding command → passed:true, ran:1', async () => {
  const { res } = await captureLog(() => runLint({ js: { lint: PASS_CMD } }));
  assert.equal(res.passed, true);
  assert.equal(res.ran, 1);
  assert.equal(res.errors, 0);
});

// 5 — one tool with a failing lint command → run failure, distinguishable from a non-run.
test('5. runLint with one failing command → passed:false, ran:1', async () => {
  const { res } = await captureLog(() => runLint({ js: { lint: FAIL_CMD } }));
  assert.equal(res.passed, false);
  assert.equal(res.ran, 1); // a run that failed — NOT the ran:0 of a non-run
  assert.equal(res.errors, 1);
});

// 6 — two tools, the second fails → ran reflects what executed.
test('6. runLint two tools, second fails → passed:false, ran:2', async () => {
  const { res } = await captureLog(() => runLint({
    js: { lint: PASS_CMD },
    py: { lint: FAIL_CMD }
  }));
  assert.equal(res.passed, false);
  assert.equal(res.ran, 2);
});

// 7 — errors is null on the not-verified path, NEVER 0 (0 is a measurement).
test('7. errors is null, never 0, when nothing ran (both functions)', async () => {
  const { res: lint } = await captureLog(() => runLint({}));
  const { res: tc } = await captureLog(() => runTypecheck({}));
  assert.equal(lint.errors, null);
  assert.notEqual(lint.errors, 0);
  assert.equal(tc.errors, null);
  assert.notEqual(tc.errors, 0);
});

// 8 — composition: an empty tools map must NOT produce a passing Tier 1, even when tests
// and security pass. This reproduces runTieredChecks's exact verdict expression
// (Object.values(tier1).every(r => r.passed)) with the REAL lint/typecheck results and
// passing stand-ins for the other two legs — deterministically, without invoking the git
// push-delta or the live security fleet (see Decisions Taken Under Ambiguity in the plan).
test('8. tier1Passed is false when detection is empty', async () => {
  const tier1 = {
    lint: (await captureLog(() => runLint({}))).res,
    typecheck: (await captureLog(() => runTypecheck({}))).res,
    tests: { passed: true },
    security: { passed: true }
  };
  const tier1Passed = Object.values(tier1).every(r => r.passed);
  assert.equal(tier1Passed, false);
});

// 9 — the object runTieredChecks persists (`checks: tier1`) carries the ran-counts, so a
// stored run with zero substantive checks is recorded as a fail, not a plain pass.
test('9. persisted tier status carries ran-counts and is not a plain pass', async () => {
  const tier1 = {
    lint: (await captureLog(() => runLint({}))).res,
    typecheck: (await captureLog(() => runTypecheck({}))).res,
    tests: { passed: true },
    security: { passed: true }
  };
  const status = Object.values(tier1).every(r => r.passed) ? 'pass' : 'fail';
  assert.equal(status, 'fail');
  assert.equal(tier1.lint.ran, 0);
  assert.equal(tier1.typecheck.ran, 0);
});

// 10 — the setCompleted `||` fallbacks are failure-shaped: the not-verified factories the
// fallbacks use return passed:false, never the old passed:true default.
test('10. not-verified fallbacks are failure-shaped, not passed:true', () => {
  const lint = notVerifiedLint('no lint result was produced');
  const tc = notVerifiedTypecheck('no type check result was produced');
  assert.equal(lint.passed, false);
  assert.equal(lint.errors, null);
  assert.equal(lint.ran, 0);
  assert.equal(tc.passed, false);
  assert.equal(tc.errors, null);
  assert.equal(tc.ran, 0);
});

// 11 — output distinguishes "no findings" from "did not run"; neither reads as the other.
test('11. "did not run" and "passed" messages are distinct', async () => {
  const notVerified = notVerifiedLint('no lint tool was detected').output;
  const { log: passLog } = await captureLog(() => runLint({ js: { lint: PASS_CMD } }));
  assert.match(notVerified, /NOT VERIFIED/);
  assert.doesNotMatch(notVerified, /passed/i);
  assert.match(passLog, /Lint passed/);
  assert.doesNotMatch(passLog, /NOT VERIFIED/);
});

// 12 — scope guard: runSecurityScan is not touched by this slice (reported, never fixed).
test('12. runSecurityScan is unmodified and still exported', () => {
  assert.equal(typeof runSecurityScan, 'function');
});

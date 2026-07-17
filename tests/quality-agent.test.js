/**
 * X4 — quality-agent.js must be able to READ its test runner.
 *
 * The module counts test results and its verdict GATES THE PUSH: src/commands/push.js
 * `run()` calls runSmartTests and does `if (!tests.passed) blockedBy.push('tests')`,
 * and a non-empty blockedBy returns `{ ok:false, pushed:false }` without ever calling
 * pushToRemote. Confirmed by READING push.js, not by trusting quality-agent's comment.
 *
 * ZERO DOUBLES. Every case below runs a REAL subprocess that writes the literal bytes a
 * real runner emits and exits with a real code — including case 6, a genuine exit-0 liar
 * (a runner that reports failures on stdout and exits 0 anyway). A bare failing run would
 * be caught by its non-zero exit before the parser was ever consulted, which is exactly how
 * a sibling plan's end-to-end test managed to look green while proving nothing.
 *
 * Colorized fixtures are built with String.fromCharCode(27) — never a raw control byte,
 * which is invisible in review and mangles diffs.
 */

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { runFullTests, runSpecificTests } = require('../src/lib/quality-agent');
const pushCommand = require('../src/commands/push');

const ESC = String.fromCharCode(27);

// --- real runner fixtures: the literal bytes each runner emits -----------------

const NODE_TEST_SPEC = [
  'ℹ tests 8',
  'ℹ suites 0',
  'ℹ pass 8',
  'ℹ fail 0',
  'ℹ cancelled 0',
  'ℹ skipped 0',
  'ℹ todo 0',
  'ℹ duration_ms 12.345'
].join('\n');

const NODE_TEST_TAP = [
  '# tests 8',
  '# suites 0',
  '# pass 8',
  '# fail 0',
  '# cancelled 0',
  '# skipped 0',
  '# todo 0',
  '# duration_ms 12.345'
].join('\n');

// Node colorizes its reporter EVEN WHEN PIPED whenever FORCE_COLOR is set.
const NODE_TEST_COLOR = [
  `${ESC}[32mℹ tests 8${ESC}[39m`,
  `${ESC}[32mℹ pass 8${ESC}[39m`,
  `${ESC}[31mℹ fail 0${ESC}[39m`,
  `${ESC}[34mℹ skipped 0${ESC}[39m`
].join('\n');

const JEST_OUTPUT = [
  'PASS  src/widget.test.js',
  'Test Suites: 1 passed, 1 total',
  'Tests:       8 passed, 8 total',
  'Time:        1.2 s'
].join('\n');

const MOCHA_OUTPUT = [
  '  widget',
  '    ✓ adds',
  '',
  '  8 passing (12ms)'
].join('\n');

const NODE_TEST_SKIPPED = [
  'ℹ tests 11',
  'ℹ pass 8',
  'ℹ fail 0',
  'ℹ skipped 3',
  'ℹ todo 0'
].join('\n');

// The liar: real failures on stdout, exit code 0 (a wrapping `|| true`, a `set +e`,
// or a reporter that swallows the child's status).
const NODE_TEST_LIAR = [
  'ℹ tests 8',
  'ℹ pass 5',
  'ℹ fail 3',
  'ℹ skipped 0'
].join('\n');

// A project whose runner is NOT node:test: a plain assertion script. Output, no
// counters, exit 0 — its EXIT CODE is its instrument and it reported success.
// This is what tests/greenfield-journey.test.js seeds.
const PLAIN_ASSERTION_SCRIPT = 'ok: add(2,3) === 5\nok: sub(3,2) === 1';

// The instrument is PRESENT (a node:test summary block) but its fail counter is
// ILLEGIBLE (renamed key). Not "no counter" — an unreadable dial.
const UNREADABLE_INSTRUMENT = [
  'ℹ tests 8',
  'ℹ pass 6',
  'ℹ failures 2'
].join('\n');

// --- helper: a REAL runner subprocess emitting exactly those bytes -------------

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-x4-'));
let fixtureSeq = 0;

/**
 * Build a tools map whose test command is a REAL node subprocess that writes
 * `output` to stdout and exits with `exitCode`. No mock, no stub: the module runs it.
 */
function runnerEmitting(output, exitCode = 0) {
  const file = path.join(tmpRoot, `runner-${fixtureSeq++}.js`);
  fs.writeFileSync(
    file,
    `process.stdout.write(${JSON.stringify(output)});\nprocess.exit(${exitCode});\n`
  );
  return { javascript: { test: `node ${JSON.stringify(file)}`, testFramework: 'node' } };
}

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// --- Case 1 -------------------------------------------------------------------

test('X4 case 1 — reads a node:test spec pass count (ℹ pass 8)', async () => {
  const result = await runFullTests(runnerEmitting(NODE_TEST_SPEC, 0));
  assert.strictEqual(result.passed, true, 'a clean node:test run must pass');
  assert.strictEqual(result.passCount, 8, 'the spec reporter pass count must be READ, not lost');
});

// --- Case 2 -------------------------------------------------------------------

test('X4 case 2 — reads a node:test TAP pass count (# pass 8)', async () => {
  const result = await runFullTests(runnerEmitting(NODE_TEST_TAP, 0));
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.passCount, 8, 'the TAP reporter pass count must be READ');
});

// --- Case 3 — the regression guard for Decision 2 ------------------------------

test('X4 case 3 — still reads jest (8 passed) and mocha (8 passing)', async () => {
  const jest = await runFullTests(runnerEmitting(JEST_OUTPUT, 0));
  assert.strictEqual(jest.passed, true, 'a clean jest run must pass');
  assert.strictEqual(jest.passCount, 8, 'jest vocabulary must NOT be removed to fix node:test');

  const mocha = await runFullTests(runnerEmitting(MOCHA_OUTPUT, 0));
  assert.strictEqual(mocha.passed, true, 'a clean mocha run must pass');
  assert.strictEqual(mocha.passCount, 8, 'mocha vocabulary must NOT be removed to fix node:test');
});

// --- Case 4 -------------------------------------------------------------------

test('X4 case 4 — reads a colorized node:test count', async () => {
  const result = await runFullTests(runnerEmitting(NODE_TEST_COLOR, 0));
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.passCount, 8, 'colour must be stripped before parsing');
});

// --- Case 5 -------------------------------------------------------------------

test('X4 case 5 — reports the REAL skipped count, not a hardcoded zero', async () => {
  const result = await runFullTests(runnerEmitting(NODE_TEST_SKIPPED, 0));
  assert.strictEqual(result.passCount, 8);
  assert.strictEqual(
    result.skipped,
    3,
    'skipped must be READ from the output — a hardcoded 0 asserts compliance with the ' +
    '"0 skipped" contract instead of enforcing it'
  );
});

// --- Case 6 — the exit-0 liar -------------------------------------------------

test('X4 case 6 — exit 0 with fail > 0 on stdout does NOT pass', async () => {
  // A REAL liar: the child prints 3 failures and exits 0. If the module trusted the
  // exit code alone this run reads as clean and the push proceeds over a broken tree.
  const result = await runFullTests(runnerEmitting(NODE_TEST_LIAR, 0));
  assert.strictEqual(
    result.passed,
    false,
    'a run reporting fail 3 on stdout must NOT pass merely because it exited 0'
  );
});

// --- Case 7 — the false-red guard (Decision 1) --------------------------------

test('X4 case 7 — a non-node:test runner with output and no counters is NOT refused', async () => {
  const result = await runFullTests(runnerEmitting(PLAIN_ASSERTION_SCRIPT, 0));
  assert.strictEqual(
    result.passed,
    true,
    'a plain assertion script has no illegible dial — its exit code IS its instrument. ' +
    'Refusing it is a FALSE RED, worse than the false green: a guard that cries wolf gets disabled'
  );
  assert.notStrictEqual(result.undetermined, true, 'no counter present is not an unreadable instrument');
});

// --- Case 8 — undetermined, and push blocks on it -----------------------------

test('X4 case 8 — an unreadable-but-present instrument yields undetermined, and push blocks on it', async () => {
  const result = await runFullTests(runnerEmitting(UNREADABLE_INSTRUMENT, 0));
  assert.strictEqual(result.passed, false, 'an unreadable instrument is never a pass');
  assert.strictEqual(result.undetermined, true, 'reuse the existing undetermined state');

  // And prove the consumer actually blocks on that verdict — push.js's real DI seam,
  // with the REAL verdict object produced above.
  const pushResult = await pushCommand.run({}, {
    detect: () => ({ tools: {} }),
    runLint: async () => ({ passed: true }),
    runTypecheck: async () => ({ passed: true }),
    runSmartTests: async () => result,
    runSecurityScan: async () => ({ passed: true, skipped: [] }),
    pushToRemote: () => {
      throw new Error('push must NEVER be reached on an undetermined test verdict');
    },
    logger: { log: () => {} }
  });

  assert.strictEqual(pushResult.pushed, false, 'push must not happen on an undetermined verdict');
  assert.strictEqual(pushResult.ok, false);
  assert.deepStrictEqual(pushResult.blockedBy, ['tests']);
});

// --- parity: runSpecificTests shares the same parser --------------------------

test('X4 — runSpecificTests reads node:test too (same parser, same contract)', async () => {
  const tools = runnerEmitting(NODE_TEST_SPEC, 0);
  // testFramework 'node' is not jest/vitest/pytest/go, so this takes the documented
  // full-suite fallback — the same runCommand path, exercised through the other export.
  const result = runSpecificTests(tools, ['tests/widget.test.js']);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.passCount, 8);

  const liar = runSpecificTests(runnerEmitting(NODE_TEST_LIAR, 0), ['tests/widget.test.js']);
  assert.strictEqual(liar.passed, false, 'the exit-0 liar must not pass here either');
});

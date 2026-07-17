'use strict';

/**
 * X3 — step-13-verify.js says "fail closed" in its own comment and fails OPEN.
 *
 * `applyTestQualityContracts` parses the test runner's fail count with
 * `/^#\s*fail\s+(\d+)/im` and guards it with `if (mFail && ...)`. Fed the four
 * shapes node actually emits, three of four read NOTHING:
 *
 *     TAP, plain        (# fail 8)     -> reads 8
 *     spec, plain       (ℹ fail 8)     -> NO MATCH   (no `ℹ` alternation)
 *     TAP, colorized                   -> NO MATCH   (the `^` hits the escape byte)
 *     spec, colorized                  -> NO MATCH   (both causes at once)
 *
 * And a no-match SKIPS the guard in silence: `check.passed` stays true, no error
 * is pushed. There is no third state between "read a number" and "certified
 * clean". This is the module that certifies Step 13 SECURE and Step 14 VERIFY —
 * the last two gates before Gate 3.
 *
 * This is the SECOND instance of this bug; X2 fixed the first in
 * src/scripts/test-gate.js, where it reported `fail 0` over 8 real failures.
 *
 * ZERO doubles. Every project below is real on disk, every check is a real
 * subprocess, and every fixture is the LITERAL bytes node emits — the escape byte
 * is built with String.fromCharCode(27) (the test file is exempt from
 * `security/detect-non-literal-regexp`; src/ is not). Both instances of this bug
 * shipped past green unit tests written against input the parser never receives.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const verify = require('../src/lib/step-13-verify');

const ESC = String.fromCharCode(27);
/** Wrap text in a real SGR colour sequence, exactly as node's reporter does. */
const blue = (s) => `${ESC}[34m${s}${ESC}[39m`;
const red = (s) => `${ESC}[31m${s}${ESC}[39m`;

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-x3-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

function write(name, content) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function pkg(obj) { write('package.json', JSON.stringify(obj, null, 2)); }

/**
 * Seed a library-shaped project (main set, no bin/start ⇒ the app-launch last mile
 * is honestly applicable:false) whose `test` script PRINTS `text` verbatim and
 * EXITS 0 — the exit-0-liar this guard exists to catch. The bytes are passed via a
 * JSON-encoded fixture file rather than the shell, so escape bytes survive intact.
 */
function seedLyingRunner(text) {
  write('fixture.js', `process.stdout.write(${JSON.stringify(text)});\nprocess.exit(0);\n`);
  pkg({
    name: 'liar', version: '1.0.0', private: true, main: 'index.js',
    scripts: { test: 'node fixture.js' }
  });
  write('index.js', 'module.exports = {};\n');
}

/** The error list, joined — for readable assertion messages. */
const why = (res) => JSON.stringify(res.errors, null, 2);

// ─────────────────────────────────────────────────────────────────────────────
// Cases 1-3 — the three output shapes the parser is blind to. Each is a runner
// reporting 8 REAL failures while exiting 0. Each must fail VERIFY.
// ─────────────────────────────────────────────────────────────────────────────
describe('X3 — the fail counter must be readable in all four shapes node emits', () => {
  it('case 1: reads a spec-reporter fail line (ℹ fail 8) — PLAIN, no colour at all', () => {
    // This case is NOT about colour. Node's spec reporter is its DEFAULT on a TTY
    // and emits `ℹ fail 8`. The module is blind to it with colour fully off.
    seedLyingRunner(
      'ℹ tests 8\nℹ suites 1\nℹ pass 0\nℹ fail 8\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 12.3\n'
    );

    const res = verify.runVerify(dir);

    assert.equal(res.checks.tests.ran, true, 'the runner really ran');
    assert.equal(res.checks.tests.passed, false, `8 reported failures must fail the test check; errors: ${why(res)}`);
    assert.equal(res.passed, false, 'VERIFY must not certify a run that reported 8 failures');
    assert.ok(
      res.errors.some((e) => /8 failing test/i.test(e)),
      `the error must name the 8 failing tests; errors: ${why(res)}`
    );
  });

  it('case 2: reads a colorized TAP fail line', () => {
    seedLyingRunner(
      `TAP version 13\nnot ok 1 - broken\n1..8\n${blue('# tests 8')}\n${blue('# pass 0')}\n${red('# fail 8')}\n`
    );

    const res = verify.runVerify(dir);

    assert.equal(res.checks.tests.passed, false, `colorized TAP `
      + `must still be read; errors: ${why(res)}`);
    assert.equal(res.passed, false, 'VERIFY must not certify a colorized TAP run reporting 8 failures');
    assert.ok(
      res.errors.some((e) => /8 failing test/i.test(e)),
      `the error must name the 8 failing tests; errors: ${why(res)}`
    );
  });

  it('case 3: reads a colorized spec fail line', () => {
    // Both causes at once: the `ℹ` prefix AND the SGR escape before it. This is
    // what a real `FORCE_COLOR=3 node --test` pipes out.
    seedLyingRunner(
      `${blue('ℹ tests 8')}\n${blue('ℹ pass 0')}\n${red('ℹ fail 8')}\n${blue('ℹ duration_ms 9.1')}\n`
    );

    const res = verify.runVerify(dir);

    assert.equal(res.checks.tests.passed, false, `colorized spec must still be read; errors: ${why(res)}`);
    assert.equal(res.passed, false, 'VERIFY must not certify a colorized spec run reporting 8 failures');
    assert.ok(
      res.errors.some((e) => /8 failing test/i.test(e)),
      `the error must name the 8 failing tests; errors: ${why(res)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 4 — THE ONE THAT MATTERS. Fail OPEN is the defect; a no-match must not be
// silence. A runner whose SUMMARY BLOCK IS PRESENT but whose fail counter cannot
// be read is UNCERTIFIED, not clean.
// ─────────────────────────────────────────────────────────────────────────────
describe('X3 — an unreadable fail count on a test check is NOT certified', () => {
  it('case 4: a test check that RAN, emitted a summary, and whose fail count cannot be read is NOT certified', () => {
    // The instrument is plainly PRESENT — this is a node:test-shaped summary
    // block, with its sibling counters — but the fail counter is not in a shape
    // this module can read (here: a future/renamed reporter key). "I could not
    // read the fail count" and "there were zero failures" are DIFFERENT FACTS and
    // must never produce the same verdict. Node's reporter format is not our
    // contract and has already changed once; the next change must be a LOUD
    // failure, not a silent green.
    seedLyingRunner(
      'ℹ tests 8\nℹ suites 1\nℹ pass 6\nℹ failures 2\nℹ duration_ms 7.7\n'
    );

    const res = verify.runVerify(dir);

    assert.equal(res.checks.tests.ran, true, 'the runner really ran and really produced output');
    assert.equal(res.checks.tests.passed, false,
      `a test check whose fail counter is unreadable must NOT be certified; errors: ${why(res)}`);
    assert.equal(res.passed, false, 'VERIFY must not certify a run it could not read');
    assert.ok(
      res.errors.some((e) => /could not read/i.test(e) && /fail/i.test(e)),
      `the error must NAME the unreadable instrument, so an operator knows WHICH one went blind; errors: ${why(res)}`
    );
  });

  it('case 4b: TAP failure evidence (not ok) with no readable fail counter is NOT certified', () => {
    // A runner that printed real TAP failures, exited 0, and emitted no readable
    // summary counter. There is failure evidence on stdout and no instrument to
    // quantify it — that is uncertified, never clean.
    seedLyingRunner('TAP version 13\nnot ok 1 - broken\nnot ok 2 - also broken\n1..2\n');

    const res = verify.runVerify(dir);

    assert.equal(res.passed, false, `TAP failures with no readable counter must not certify; errors: ${why(res)}`);
    assert.ok(
      res.errors.some((e) => /could not read/i.test(e) && /fail/i.test(e)),
      `the error must name the unreadable fail counter; errors: ${why(res)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 5 — THE FALSE-RED GUARD (Decision 1). Over-correcting into a false RED is
// WORSE than the false green, because a guard that cries wolf gets disabled.
// A check with no fail line that is not a node:test-shaped run must stay green.
// GREEN BEFORE AND AFTER.
// ─────────────────────────────────────────────────────────────────────────────
describe('X3 — no false red: a check with no fail line is still fine', () => {
  it('case 5: a project with passing lint + typecheck (no fail counts at all) still PASSES', () => {
    write('fixture.js', 'process.stdout.write("ok: 1 assertion passed\\n");\nprocess.exit(0);\n');
    pkg({
      name: 'clean', version: '1.0.0', private: true, main: 'index.js',
      scripts: {
        lint: 'node -e "console.log(\'All files pass linting.\')"',
        typecheck: 'node -e "console.log(\'Found 0 errors.\')"',
        test: 'node fixture.js'
      }
    });
    write('index.js', 'module.exports = {};\n');

    const res = verify.runVerify(dir);

    assert.equal(res.checks.lint.passed, true, `a clean lint emits no fail count and must PASS; errors: ${why(res)}`);
    assert.equal(res.checks.types.passed, true, `a clean typecheck emits no fail count and must PASS; errors: ${why(res)}`);
    assert.equal(res.passed, true,
      `a clean project must not be turned red by the unreadable-instrument guard; errors: ${why(res)}`);
    assert.ok(
      !res.errors.some((e) => /could not read/i.test(e)),
      `no instrument-unreadable error may fire on a project that emits no counters; errors: ${why(res)}`
    );
  });

  it('case 5b: a non-node:test runner (plain assertion script, exit 0) still PASSES', () => {
    // A legitimate project whose test runner is not node:test at all — a plain
    // node assertion script that prints a line and exits 0. It emits no summary
    // block, so there is no instrument to be illegible. Its exit code is the
    // instrument, and it said 0. Turning THIS red would be the false red.
    write('fixture.js', 'process.stdout.write("ok: add(2,3) === 5\\n");\nprocess.exit(0);\n');
    pkg({
      name: 'plainrunner', version: '1.0.0', private: true, main: 'index.js',
      scripts: { test: 'node fixture.js' }
    });
    write('index.js', 'module.exports = {};\n');

    const res = verify.runVerify(dir);

    assert.equal(res.passed, true, `a plain assertion runner must stay green; errors: ${why(res)}`);
    assert.equal(res.checks.tests.passed, true);
  });

  it('case 5c: an honest "ℹ fail 0" spec run still PASSES (0 is not a failure)', () => {
    seedLyingRunner('ℹ tests 8\nℹ pass 8\nℹ fail 0\nℹ skipped 0\nℹ todo 0\n');

    const res = verify.runVerify(dir);

    assert.equal(res.passed, true, `fail 0 is a clean run, not a failure; errors: ${why(res)}`);
    assert.equal(res.checks.tests.passed, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 6 — the existing, hard-won contracts. GREEN BEFORE AND AFTER; the fix must
// break none of them.
// ─────────────────────────────────────────────────────────────────────────────
describe('X3 — the existing contracts still hold', () => {
  it('case 6a: last-match ordering — a spoofed early "all files | 100" loses to the real below-floor summary', () => {
    // The real coverage row is emitted LAST. A stray/spoofed 100 earlier in the
    // stream must never beat it. Now proven with the row COLORIZED and under the
    // spec reporter's `ℹ` prefix, which is what node actually pipes out.
    write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: 99 }));
    seedLyingRunner(
      `all files | 100 | 100 | 100 |\n`
      + `${blue('ℹ tests 3')}\n${blue('ℹ pass 3')}\n${blue('ℹ fail 0')}\n`
      + `${blue('ℹ all files | 40.12 | 30 | 20 |')}\n`
    );

    const res = verify.runVerify(dir);

    assert.equal(res.checks.tests.coverage, 40.12,
      'the LAST coverage row is the real one — a spoofed earlier 100 must not win');
    assert.equal(res.passed, false, `below-floor coverage must fail; errors: ${why(res)}`);
    assert.ok(
      res.errors.some((e) => /40\.12/.test(e) && /99/.test(e)),
      `the error must print the real figure next to the floor; errors: ${why(res)}`
    );
  });

  it('case 6b: absent-script tolerance — a missing lint script is applicable:false, not a failing lint', () => {
    // `npm error Missing script: "lint"` is an ABSENT script, not a failed lint.
    seedLyingRunner('ℹ tests 1\nℹ pass 1\nℹ fail 0\n');

    const res = verify.runVerify(dir);

    assert.equal(res.checks.lint.applicable, false, 'an absent lint script is recorded, not failed');
    assert.equal(res.checks.types.applicable, false, 'an absent typecheck script is recorded, not failed');
    assert.equal(res.passed, true, `a normal project with tests but no lint/typecheck must PASS; errors: ${why(res)}`);
    assert.ok(
      !res.errors.some((e) => /lint/i.test(e)),
      `an ABSENT lint script must never be reported as a failing check; errors: ${why(res)}`
    );
  });

  it('case 6c: no-verifiable-toolchain still fires when nothing ran', () => {
    // An empty project: zero substantive checks. Nothing ran, so nothing was
    // verified. A gate that opens on nothing is not a gate.
    const res = verify.runVerify(dir);

    assert.equal(res.passed, false, 'a project where NOTHING could run must not pass');
    assert.ok(
      res.errors.some((e) => /no-verifiable-toolchain/i.test(e)),
      `the failure must name what was looked for; errors: ${why(res)}`
    );
  });

  it('case 6d: the "0 skipped" contract still fires, and now survives colour + the spec reporter', () => {
    seedLyingRunner(`${blue('ℹ tests 8')}\n${blue('ℹ pass 5')}\n${blue('ℹ fail 0')}\n${blue('ℹ skipped 3')}\n`);

    const res = verify.runVerify(dir);

    assert.equal(res.checks.tests.skipped, 3, 'the skipped counter must survive colour and the spec reporter');
    assert.equal(res.passed, false, `the contract is 0 skipped; errors: ${why(res)}`);
    assert.ok(
      res.errors.some((e) => /skipped/i.test(e) && /3/.test(e)),
      `the error must name the 3 skipped tests; errors: ${why(res)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 7 — THE ONE THAT PROVES THE REAL THING. A unit test on a regex is not
// enough: that is exactly how BOTH instances of this bug shipped. Drive the real
// runner, with real colour, over a suite with a real failure.
// ─────────────────────────────────────────────────────────────────────────────
describe('X3 — end to end, real node --test, real colour', () => {
  it('case 7: VERIFY over a suite with a REAL failure, under FORCE_COLOR=3, does not certify', () => {
    // A REAL node --test suite with one real failing assertion, run by a REAL
    // node --test, emitting REAL colorized reporter bytes — wrapped so it EXITS 0.
    //
    // The wrapper is the whole point. A bare `node --test` exits non-zero, so the
    // EXIT CODE catches the failure and the parser is never consulted — a version
    // of this test without the wrapper passes even against the broken parser, and
    // is hollow. The wrapper (`|| true`, `set +e`, a reporter that swallows the
    // exit code — the exact scenario named in the comment above the defect) leaves
    // the fail counter as the ONLY instrument. This is the real thing.
    write('suite.test.js',
      "const test = require('node:test');\n"
      + "const assert = require('node:assert');\n"
      + "test('a real passing test', () => { assert.strictEqual(1, 1); });\n"
      + "test('a real FAILING test', () => { assert.strictEqual(2 + 2, 5); });\n");
    // Cross-platform `|| true`: a node wrapper, not a shell operator.
    write('run-tests.js',
      "const { spawnSync } = require('node:child_process');\n"
      + "spawnSync(process.execPath, ['--test', 'suite.test.js'], { stdio: 'inherit' });\n"
      + "process.exit(0); // the exit-0 liar: swallow the child's real exit code\n");
    pkg({
      name: 'e2e', version: '1.0.0', private: true, main: 'index.js',
      scripts: { test: 'node run-tests.js' }
    });
    write('index.js', 'module.exports = {};\n');

    const saved = { force: process.env.FORCE_COLOR, ctx: process.env.NODE_TEST_CONTEXT, no: process.env.NO_COLOR };
    let res;
    try {
      // Real colour, inherited straight into the spawn — exactly how the gate went
      // blind in the wild (a CI runner, a wrapper, or a developer's own setting).
      process.env.FORCE_COLOR = '3';
      delete process.env.NO_COLOR;
      // A nested `node --test` INHERITS NODE_TEST_CONTEXT from this outer runner
      // and defers its exit code / suppresses its reporter — which would make the
      // child suite not really run and hand this test a hollow green. Clear it,
      // then PROVE below that the fixture really ran.
      delete process.env.NODE_TEST_CONTEXT;
      res = verify.runVerify(dir);
    } finally {
      if (saved.force === undefined) delete process.env.FORCE_COLOR; else process.env.FORCE_COLOR = saved.force;
      if (saved.ctx === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = saved.ctx;
      if (saved.no === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = saved.no;
    }

    const out = (res.checks.tests && res.checks.tests.output) || '';

    // FAIL LOUDLY if the fixture did not really run — a hollow end-to-end test is
    // how the sibling instance shipped. The child must have really executed both
    // tests and really reported the failure.
    assert.equal(res.checks.tests.ran, true, `the fixture suite must really RUN; check: ${JSON.stringify(res.checks.tests)}`);
    assert.ok(
      /a real FAILING test/.test(out),
      `the fixture suite did not really run — its test names are absent from the captured output. `
      + `This test would be hollow. Captured output was:\n${out}`
    );
    assert.ok(
      /fail/i.test(out),
      `the child reported no fail counter at all — the fixture did not really run. Output:\n${out}`
    );
    // And PROVE the colour really propagated. If FORCE_COLOR did not reach the
    // grandchild, these bytes are plain and this test silently degrades into a
    // weaker one that no longer covers the colour cause.
    assert.ok(
      out.includes(ESC),
      `FORCE_COLOR=3 did not reach the real runner — no escape bytes in the captured output, `
      + `so this test would NOT be covering the colour cause. Output:\n${JSON.stringify(out.slice(0, 400))}`
    );
    assert.ok(
      res.checks.tests.command === 'npm test',
      `the declared script must be what ran; got: ${res.checks.tests.command}`
    );

    // The real assertion.
    assert.equal(res.passed, false,
      `VERIFY must NOT certify a suite with a real failing test under FORCE_COLOR=3; errors: ${why(res)}`);
    assert.equal(res.checks.tests.passed, false, 'the test check itself must be marked failed');
  });
});

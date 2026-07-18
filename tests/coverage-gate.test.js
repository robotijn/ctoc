'use strict';

/**
 * W06-s2 — Coverage gate (findings A4 + S4).
 *
 * Proves the run-summary gate that (1) requires a real, numeric coverage figure,
 * (2) fails on coverage below the threshold, and (3) fails on any skipped test.
 *
 * The gate DECISION logic is unit-tested on synthetic run summaries so RED/GREEN
 * is deterministic and independent of the live suite's momentary numbers. The
 * parsers are additionally exercised against BOTH the TAP-style (`# skipped 0`)
 * and the Node "spec" reporter (`ℹ skipped 0`) summary shapes, so the instrument
 * works on the real, piped `node --test --experimental-test-coverage` output —
 * not just on a hand-shaped string.
 *
 * The subprocess spawn (running the whole suite under coverage) is the CLI path;
 * it is intentionally NOT unit-tested here — spawning the entire suite inside a
 * unit test is neither necessary nor stable.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// Hard require — RED-now: the module does not exist yet, so this throws and the
// FILE FAILS to load (it does NOT skip). Obeys the s1 skip-guard discipline:
// an absent module is a loud failure, never a silent pass.
const gate = require('../src/scripts/test-gate.js');

test('exports the three pure gate functions', () => {
  assert.strictEqual(typeof gate.evaluateSummary, 'function');
  assert.strictEqual(typeof gate.parseSkipped, 'function');
  assert.strictEqual(typeof gate.parseCoveragePct, 'function');
});

test('evaluateSummary: clean run passes (case 1)', () => {
  const r = gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: 92 });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.reasons, []);
});

test('evaluateSummary: any skip fails, reason names the skip (case 2)', () => {
  const r = gate.evaluateSummary({ fail: 0, skipped: 1, coveragePct: 92 });
  assert.strictEqual(r.ok, false);
  assert.ok(
    r.reasons.some((x) => /skip/i.test(x) && /1/.test(x)),
    `expected a reason naming the skip, got ${JSON.stringify(r.reasons)}`
  );
});

test('evaluateSummary: below-threshold coverage fails, prints figure next to 80% (case 3)', () => {
  const r = gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: 71.4 });
  assert.strictEqual(r.ok, false);
  assert.ok(
    r.reasons.some((x) => x.includes('71.4%') && x.includes('80%')),
    `expected a reason printing 71.4% next to 80%, got ${JSON.stringify(r.reasons)}`
  );
});

test('evaluateSummary: unmeasured coverage (null) is a failure (case 4)', () => {
  const r = gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: null });
  assert.strictEqual(r.ok, false);
  assert.ok(
    r.reasons.some((x) => /coverage/i.test(x)),
    `expected a reason about unmeasured coverage, got ${JSON.stringify(r.reasons)}`
  );
});

test('evaluateSummary: a real failing test fails the gate', () => {
  const r = gate.evaluateSummary({ fail: 2, skipped: 0, coveragePct: 92 });
  assert.strictEqual(r.ok, false);
  assert.ok(
    r.reasons.some((x) => /fail/i.test(x) && /2/.test(x)),
    `expected a reason naming the failures, got ${JSON.stringify(r.reasons)}`
  );
});

test('evaluateSummary: threshold is configurable', () => {
  assert.strictEqual(gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: 85 }, { threshold: 90 }).ok, false);
  assert.strictEqual(gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: 85 }, { threshold: 80 }).ok, true);
});

test('parseSkipped: TAP-style summary (case 5)', () => {
  assert.strictEqual(gate.parseSkipped('# skipped 3'), 3);
  assert.strictEqual(gate.parseSkipped('# skipped 0'), 0);
});

test('parseSkipped: Node spec-reporter shape (real piped output)', () => {
  assert.strictEqual(gate.parseSkipped('ℹ skipped 0'), 0);
  assert.strictEqual(gate.parseSkipped('ℹ skipped 7'), 7);
});

test('parseFail/parseSkipped: a "# fail N"/"# skipped N" inside a TEST NAME cannot hijack the gate', () => {
  // Regression: the counters are read from the line-start summary token, LAST match —
  // node emits the real aggregate after all test output, and a `# fail 2` embedded
  // mid-line in a test name (a step-13-verify test names a TAP `# fail 2` fixture) is
  // never at line-start. A first-match/unanchored parse wrongly failed a green run.
  const polluted = [
    '  ✔ K1: test prints "not ok"/"# fail 2" then exits 0 → VERIFY FAILS (2ms)',
    '  ✔ handles a "# skipped 5" literal in its name',
    'ℹ tests 9133',
    'ℹ pass 9133',
    'ℹ fail 0',
    'ℹ skipped 0',
  ].join('\n');
  assert.strictEqual(gate.parseFail(polluted), 0, 'test-name # fail 2 must not spoof a failure');
  assert.strictEqual(gate.parseSkipped(polluted), 0, 'test-name # skipped 5 must not spoof a skip');
  // A genuine aggregate failure is still detected.
  assert.strictEqual(gate.parseFail(['ℹ tests 10', 'ℹ pass 8', 'ℹ fail 2'].join('\n')), 2);
});

// X2: an absent counter line means the instrument could not be READ — NOT "zero".
// This assertion previously demanded `0`, encoding the exact defect X2 exists to
// kill: a no-match default equal to the SUCCESS value makes "unparseable" and
// "perfect" the same number. Tightened to `null` (fail-closed) per the plan's
// Decision 1; `evaluateSummary` turns that null into a named gate failure.
test('parseSkipped: absent line means UNREADABLE (null), never zero', () => {
  assert.strictEqual(gate.parseSkipped('no summary here'), null);
});

test('parseCoveragePct: TAP-shaped all-files line (case 6)', () => {
  assert.strictEqual(gate.parseCoveragePct('# all files | 84.20 |'), 84.2);
  assert.strictEqual(gate.parseCoveragePct('no coverage here'), null);
});

test('parseCoveragePct: real Node spec-reporter coverage line', () => {
  // Verbatim shape emitted by `node --test --experimental-test-coverage` (v24),
  // captured from a real run. Columns: line % | branch % | funcs % | uncovered.
  const real = [
    'ℹ start of coverage report',
    'ℹ ----------------------------------------------------------',
    'ℹ file      | line % | branch % | funcs % | uncovered lines',
    'ℹ ----------------------------------------------------------',
    'ℹ all files | 100.00 |   100.00 |  100.00 | ',
    'ℹ ----------------------------------------------------------',
    'ℹ end of coverage report',
  ].join('\n');
  assert.strictEqual(gate.parseCoveragePct(real), 100);
});

test('parseCoveragePct: extracts the LINE percentage, not branch/funcs', () => {
  assert.strictEqual(gate.parseCoveragePct('ℹ all files | 73.50 |  61.00 |  80.00 | 12-15'), 73.5);
});

// Regression: a stray `all files | N` earlier in the run (a test NAME or stdout
// containing a fixture coverage row — e.g. the step-13-verify parser tests) must
// NOT hijack the gate. Node prints the real coverage summary LAST, so last-match
// wins. A first-match parse reported the fixture's 42.10 as the whole suite's
// coverage and FAILED a genuinely-99% run.
test('parseCoveragePct: the trailing real summary wins over an earlier stray row', () => {
  const polluted = [
    '  ✔ H1: reads a Node-native "# all files | 42.10 |" row (0.3ms)', // a test NAME
    '  console.log fixture: # all files | 42.10 | 30.00 | 25.00 | 1-9', // stray stdout
    'ℹ tests 8990',
    'ℹ pass 8990',
    'ℹ all files                          |  99.38 |    92.29 |   98.76 | ', // the REAL row, last
    'ℹ end of coverage report',
  ].join('\n');
  assert.strictEqual(gate.parseCoveragePct(polluted), 99.38);
});

// Regression (defect a): the parser must be LINE-ANCHORED to the reporter prefix.
// main() builds `output = stdout + stderr`, so a test line emitted to STDERR that
// contains `all files | 100` lands AFTER node's own trailing coverage block in the
// concatenated string. An UNANCHORED last-match parse then picks up that stray 100
// and reports it as the whole suite's coverage — defeating the "no test can print
// after node's coverage block" assumption. Anchoring to line-start (mirroring
// src/lib/step-13-verify.js) rejects the mid-line stray; the real `# all files | 40`
// row wins.
test('parseCoveragePct: a stray "all files | N" appended by stderr cannot override the real anchored row', () => {
  const polluted = [
    '# all files | 40.00 |',                       // the REAL coverage row (line-anchored)
    'stderr log from a test: all files | 100',     // stray, mid-line — appended after coverage
  ].join('\n');
  assert.strictEqual(gate.parseCoveragePct(polluted), 40);
});

// Regression (defect b): a malformed capture (e.g. "1.2.3") yields NaN, which is
// neither null nor < threshold — an UNGUARDED evaluateSummary let a non-finite,
// unmeasured coverage silently PASS. A non-finite figure is treated as unmeasured
// and FAILS the gate.
test('parseCoveragePct + evaluateSummary: a malformed capture is treated as unmeasured and fails the gate', () => {
  const cov = gate.parseCoveragePct('all files | 1.2.3');
  assert.ok(cov === null || !Number.isFinite(cov), `expected null or non-finite, got ${cov}`);
  const r = gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: cov }, { threshold: 99 });
  assert.strictEqual(r.ok, false);
  assert.ok(
    r.reasons.some((x) => /coverage/i.test(x)),
    `expected a reason about coverage, got ${JSON.stringify(r.reasons)}`
  );
});

test('evaluateSummary: a NaN coverage figure is unmeasured and fails the gate', () => {
  const r = gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: NaN }, { threshold: 99 });
  assert.strictEqual(r.ok, false);
  assert.ok(
    r.reasons.some((x) => /coverage/i.test(x)),
    `expected a reason about unmeasured coverage, got ${JSON.stringify(r.reasons)}`
  );
});

// Wiring assertion — read the REAL package.json from disk and prove coverage is
// wired into `npm test` through the gate. RED-now: today's scripts.test is
// `node --test tests/*.test.js` (no coverage flag, no gate).
test('package.json wires coverage + the gate into the test script', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const testScript = (pkg.scripts && pkg.scripts.test) || '';
  assert.ok(
    testScript.includes('--experimental-test-coverage'),
    `scripts.test must wire coverage instrumentation, got: ${testScript}`
  );
  assert.ok(
    testScript.includes('test-gate.js'),
    `scripts.test must route through the gate, got: ${testScript}`
  );
});

// Ratchet baseline — the gate reads .ctoc/coverage-baseline.json (minPct) so a
// codebase that predates instrumentation enforces its measured floor instead of
// the aspirational default, exactly like the typecheck ratchet. The baseline may
// only be RAISED; new code is still held to >= 80% at review.
test('resolveThreshold: reads the committed ratchet baseline (real file)', () => {
  const repoRoot = path.join(__dirname, '..');
  const baseline = JSON.parse(
    fs.readFileSync(path.join(repoRoot, '.ctoc', 'coverage-baseline.json'), 'utf8')
  );
  assert.strictEqual(typeof baseline.minPct, 'number');
  assert.ok(baseline.minPct > 0 && baseline.minPct <= 100);
  assert.strictEqual(gate.resolveThreshold(repoRoot), baseline.minPct);
});

test('resolveThreshold: falls back to the aspirational default when no baseline exists', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-'));
  try {
    assert.strictEqual(gate.resolveThreshold(empty), 80);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('evaluateSummary honors the resolved threshold (floor passes, below floor fails)', () => {
  const atFloor = gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: 41 }, { threshold: 40 });
  assert.strictEqual(atFloor.ok, true);
  const below = gate.evaluateSummary({ fail: 0, skipped: 0, coveragePct: 39 }, { threshold: 40 });
  assert.strictEqual(below.ok, false);
  assert.match(below.reasons.join(' '), /39% < 40%/);
});

// ---------------------------------------------------------------------------
// X2 — THE GATE LIED. Node COLORIZES its summary when FORCE_COLOR is set, even
// when piped. The real line the gate receives is not `ℹ fail 8`, it is
// `ESC[34mℹ fail 8ESC[39m`, so a `^`-anchored parse matches the ESCAPE BYTE and
// finds nothing — and the no-match default was `0`. The gate reported `fail 0`
// over 8 real failures.
//
// Every fixture above reasoned about reporter SHAPE (TAP vs spec) and never about
// reporter COLOUR, so the suite proved the parser worked on input the parser never
// receives in production, and stayed green throughout. These cases feed the parsers
// the LITERAL bytes node emits under colour.
//
// ESC is built with String.fromCharCode(27) so no raw control byte enters this
// source file (a raw escape is invisible in review and mangles diffs/editors).
// ---------------------------------------------------------------------------
const ESC = String.fromCharCode(27);
/** Wrap text in a real SGR colour sequence, exactly as node's reporter emits it. */
const colorize = (text, code) => `${ESC}[${code}m${text}${ESC}[39m`;

// Case 1 — the bug itself, in one assertion.
test('X2 case 1 — parseFail reads a COLORIZED fail line (the reported-zero-over-eight bug)', () => {
  assert.strictEqual(gate.parseFail(colorize('ℹ fail 8', 34)), 8);
  // The full realistic summary block, colorized exactly as node emits it.
  const realColorized = [
    colorize('ℹ tests 9690', 34),
    colorize('ℹ pass 9682', 32),
    colorize('ℹ fail 8', 31),
    colorize('ℹ skipped 0', 34),
  ].join('\n');
  assert.strictEqual(gate.parseFail(realColorized), 8, 'a colorized summary must report the TRUE failure count');
});

// Case 2 — the zero-skipped gate is blinded by the same defect.
test('X2 case 2 — parseSkipped reads a COLORIZED skipped line', () => {
  assert.strictEqual(gate.parseSkipped(colorize('ℹ skipped 7', 34)), 7);
  assert.strictEqual(gate.parseSkipped(colorize('# skipped 3', 34)), 3);
});

// Case 3 — the coverage row too. This one already fails CLOSED (returns null),
// which is why the gate exits non-zero today at all — for the WRONG reason.
test('X2 case 3 — parseCoveragePct reads a COLORIZED coverage row', () => {
  assert.strictEqual(gate.parseCoveragePct(colorize('ℹ all files | 99.07 |', 32)), 99.07);
  const realBlock = [
    colorize('ℹ start of coverage report', 34),
    colorize('ℹ file      | line % | branch % | funcs % | uncovered lines', 34),
    colorize('ℹ all files |  99.38 |    92.29 |   98.76 | ', 32),
    colorize('ℹ end of coverage report', 34),
  ].join('\n');
  assert.strictEqual(gate.parseCoveragePct(realBlock), 99.38);
});

// Case 4 — THE ASSERTION THAT MATTERS MOST. The ANSI strip fixes the cause we
// happened to find. THIS fixes the defect CLASS: a gate that cannot read its
// instrument must never say green. Node's reporter format is not our contract.
test('X2 case 4 — an UNREADABLE summary FAILS the gate, it does not pass it', () => {
  // The fail count could not be parsed. Under the old `0` default this read as
  // "zero failures" and the gate said PASS.
  const unreadableFail = gate.evaluateSummary(
    { fail: null, skipped: 0, coveragePct: 99.5 }, { threshold: 99 }
  );
  assert.strictEqual(unreadableFail.ok, false, 'an unreadable fail count must NEVER pass the gate');
  assert.ok(
    unreadableFail.reasons.some((x) => /fail/i.test(x) && /(could not|unread|unparse)/i.test(x)),
    `expected a reason naming the unreadable FAIL instrument, got ${JSON.stringify(unreadableFail.reasons)}`
  );

  // Same for the skipped instrument, with its OWN distinct reason.
  const unreadableSkip = gate.evaluateSummary(
    { fail: 0, skipped: null, coveragePct: 99.5 }, { threshold: 99 }
  );
  assert.strictEqual(unreadableSkip.ok, false, 'an unreadable skipped count must NEVER pass the gate');
  assert.ok(
    unreadableSkip.reasons.some((x) => /skip/i.test(x) && /(could not|unread|unparse)/i.test(x)),
    `expected a reason naming the unreadable SKIPPED instrument, got ${JSON.stringify(unreadableSkip.reasons)}`
  );

  // End-to-end through the parsers: colorized input that the OLD code read as 0/0.
  // Before the fix this whole summary evaluated to {ok:true} while 8 tests failed.
  const colorized = [colorize('ℹ fail 8', 31), colorize('ℹ skipped 2', 34)].join('\n');
  const viaParsers = gate.evaluateSummary({
    fail: gate.parseFail(colorized),
    skipped: gate.parseSkipped(colorized),
    coveragePct: 99.5,
  }, { threshold: 99 });
  assert.strictEqual(viaParsers.ok, false, 'colorized "fail 8" must fail the gate');
  assert.ok(
    viaParsers.reasons.some((x) => /8/.test(x)),
    `expected the reason to name the 8 failures, got ${JSON.stringify(viaParsers.reasons)}`
  );

  // A garbage summary is unreadable on BOTH counters and must fail, not pass.
  const garbage = gate.evaluateSummary({
    fail: gate.parseFail('node crashed before emitting a summary'),
    skipped: gate.parseSkipped('node crashed before emitting a summary'),
    coveragePct: gate.parseCoveragePct('node crashed before emitting a summary'),
  }, { threshold: 99 });
  assert.strictEqual(garbage.ok, false, 'a run with NO summary at all must never report green');
});

// Case 5 — the strip must not break the uncoloured path the gate has always read.
test('X2 case 5 — the TAP and plain (uncoloured) shapes still parse', () => {
  assert.strictEqual(gate.parseFail('ℹ fail 0'), 0);
  assert.strictEqual(gate.parseFail('# fail 4'), 4);
  assert.strictEqual(gate.parseSkipped('ℹ skipped 0'), 0);
  assert.strictEqual(gate.parseSkipped('# skipped 3'), 3);
  assert.strictEqual(gate.parseCoveragePct('# all files | 84.20 |'), 84.2);
  // A genuinely clean, uncoloured run still PASSES — the fix must not fail-closed
  // on a readable green run (that would be the opposite defect).
  const clean = gate.evaluateSummary({
    fail: gate.parseFail('ℹ fail 0'),
    skipped: gate.parseSkipped('ℹ skipped 0'),
    coveragePct: gate.parseCoveragePct('ℹ all files | 99.40 |'),
  }, { threshold: 99 });
  assert.strictEqual(clean.ok, true, `a clean readable run must still pass, got ${JSON.stringify(clean.reasons)}`);

  // The anti-hijack invariant (line-anchored, last-match) survives the strip —
  // now also when the real summary is colorized and the stray is not.
  const polluted = [
    '  ✔ K1: test prints "not ok"/"# fail 2" then exits 0 → VERIFY FAILS (2ms)',
    '  ✔ handles a "# skipped 5" literal in its name',
    colorize('ℹ fail 0', 32),
    colorize('ℹ skipped 0', 32),
  ].join('\n');
  assert.strictEqual(gate.parseFail(polluted), 0, 'a test-name "# fail 2" must not spoof a failure');
  assert.strictEqual(gate.parseSkipped(polluted), 0, 'a test-name "# skipped 5" must not spoof a skip');
});

// Case 6 — THE ONLY TEST THAT PROVES THE REAL THING. A unit test on the parser is
// not enough; that is EXACTLY how this shipped. Spawn the REAL gate, under
// FORCE_COLOR=3, over a fixture suite with a KNOWN failure count, and assert the
// exit code AND the printed count.
//
// The fixture is a minimal project (its own tests/ + src/) with the real gate copied
// in, so the gate's own `projectRoot = resolve(__dirname,'..','..')` lands on the
// fixture rather than this repo. Zero doubles: this is the real script, really
// spawned, really reading real colorized node output.
test('X2 case 6 — the REAL gate spawned under FORCE_COLOR=3 over a failing suite exits non-zero AND names the true count', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-e2e-'));
  try {
    fs.mkdirSync(path.join(dir, 'src', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });

    // The REAL gate, byte-for-byte.
    fs.copyFileSync(
      path.join(__dirname, '..', 'src', 'scripts', 'test-gate.js'),
      path.join(dir, 'src', 'scripts', 'test-gate.js')
    );
    // Re-export the real safe-fs so the copied gate resolves '../lib/safe-fs'.
    const realSafeFs = path.join(__dirname, '..', 'src', 'lib', 'safe-fs.js');
    fs.writeFileSync(
      path.join(dir, 'src', 'lib', 'safe-fs.js'),
      `module.exports = require(${JSON.stringify(realSafeFs)});\n`
    );
    // Same treatment for the real request-exit, which the gate uses to flush its
    // output before exiting (without it the copied gate cannot resolve its require).
    const realRequestExit = path.join(__dirname, '..', 'src', 'lib', 'request-exit.js');
    fs.writeFileSync(
      path.join(dir, 'src', 'lib', 'request-exit.js'),
      `module.exports = require(${JSON.stringify(realRequestExit)});\n`
    );
    // A covered src file, so coverage is MEASURED and cannot be the failure reason —
    // isolating the fail count as the sole cause of the non-zero exit.
    fs.writeFileSync(path.join(dir, 'src', 'thing.js'), 'module.exports = () => 42;\n');
    // Exactly TWO failing tests, one passing. The known-true count is 2.
    fs.writeFileSync(path.join(dir, 'tests', 'fixture.test.js'), [
      "'use strict';",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const thing = require('../src/thing.js');",
      "test('passes', () => { assert.strictEqual(thing(), 42); });",
      "test('fails on purpose one', () => { assert.strictEqual(thing(), 1); });",
      "test('fails on purpose two', () => { assert.strictEqual(thing(), 2); });",
    ].join('\n') + '\n');

    // NODE_TEST_CONTEXT is set in THIS process (we are inside `node --test`) and is
    // inherited by the child, which makes the child's own `node --test` refuse to run
    // files ("run() is being called recursively") — the fixture suite would silently
    // never execute and this test would prove nothing. Strip it so the child is a
    // clean, top-level test run.
    const childEnv = { ...process.env, FORCE_COLOR: '3' };
    delete childEnv.NODE_TEST_CONTEXT;

    const res = spawnSync(process.execPath, [path.join(dir, 'src', 'scripts', 'test-gate.js')], {
      cwd: dir,
      encoding: 'utf8',
      shell: false,
      maxBuffer: 64 * 1024 * 1024,
      // The exact condition that broke the gate in production.
      env: childEnv,
    });

    const out = (res.stdout || '') + (res.stderr || '');

    // Guard the fixture itself: if the child never ran the suite, this test proves
    // nothing and must fail LOUDLY rather than pass on a hollow run.
    assert.ok(
      !/being called recursively/.test(out),
      `the fixture suite did not actually run (recursive node:test context leaked). Output:\n${out}`
    );
    assert.match(out, /fail\s*2/, `the fixture suite must really run and really fail twice. Output:\n${out}`);

    // 1. It must NOT report green over real failures.
    assert.notStrictEqual(res.status, 0, `the gate must exit non-zero over a failing suite. Output:\n${out}`);

    // 2. It must name the TRUE count (2), not 0. This is the assertion that would
    //    have caught the shipped bug: the old gate printed "failed 0" here.
    const plain = out.replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g'), '');
    assert.match(
      plain, /failed 2/,
      `the gate must PRINT the true failure count (2) under FORCE_COLOR. Got:\n${plain}`
    );
    assert.ok(
      !/failed 0/.test(plain),
      `the gate reported "failed 0" while 2 tests failed — the X2 defect. Output:\n${plain}`
    );

    // 3. Its stated reason must be the failures — not a coverage accident. The old
    //    gate exited non-zero ONLY because the coverage parse happened to fail.
    assert.match(
      plain, /#\s*fail\s*2\s*>\s*0/,
      `the gate must FAIL FOR THE RIGHT REASON (the 2 failures), not by coverage accident. Got:\n${plain}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('V1 case 8 — the REAL gate PIPED over a LOUD suite still delivers its coverage verdict at the very end', () => {
  // THE DEFECT. The gate printed the whole suite output, then its verdict, then
  // called process.exit(0). Writes to a PIPE are asynchronous and process.exit does
  // not drain them, so everything past the ~64KB pipe buffer was discarded — the
  // coverage table and the verdict line among it. Step 14 VERIFY reads this gate
  // through exactly such a pipe, so it saw a run with no coverage figure and failed
  // closed: "coverage floor 99% declared but no coverage figure was produced". Gate 3
  // became un-passable for every plan, leaving "Approve anyway" as the only exit.
  //
  // Interactively the gate looked perfect, because a write to a TERMINAL is
  // synchronous. Only a pipe over a LOUD suite reveals it — which is what this does.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-flush-'));
  try {
    fs.mkdirSync(path.join(dir, 'src', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });

    // The REAL gate, byte-for-byte, with its two real library dependencies.
    fs.copyFileSync(
      path.join(__dirname, '..', 'src', 'scripts', 'test-gate.js'),
      path.join(dir, 'src', 'scripts', 'test-gate.js')
    );
    for (const mod of ['safe-fs', 'request-exit']) {
      const real = path.join(__dirname, '..', 'src', 'lib', `${mod}.js`);
      fs.writeFileSync(
        path.join(dir, 'src', 'lib', `${mod}.js`),
        `module.exports = require(${JSON.stringify(real)});\n`
      );
    }
    fs.writeFileSync(path.join(dir, 'src', 'thing.js'), 'module.exports = () => 42;\n');
    fs.writeFileSync(path.join(dir, '.ctoc', 'coverage-baseline.json'), JSON.stringify({ minPct: 50 }));

    // A LOUD but entirely PASSING suite: ~300KB of output, far past the pipe buffer,
    // so the verdict printed after it is the part at risk.
    fs.writeFileSync(path.join(dir, 'tests', 'loud.test.js'), [
      "'use strict';",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const thing = require('../src/thing.js');",
      "test('loud but passing', () => {",
      "  for (let i = 0; i < 3000; i++) {",
      "    console.log('padding line ' + i + ' '.repeat(80));",
      '  }',
      '  assert.strictEqual(thing(), 42);',
      '});',
    ].join('\n') + '\n');

    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;

    const res = spawnSync(process.execPath, [path.join(dir, 'src', 'scripts', 'test-gate.js')], {
      cwd: dir, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024, env: childEnv,
    });

    const out = (res.stdout || '') + (res.stderr || '');

    // Guard the fixture: a hollow run must fail loudly, not pass vacuously.
    assert.ok(
      !/being called recursively/.test(out),
      `the fixture suite did not actually run. Output tail:\n${out.slice(-500)}`
    );
    assert.ok(
      out.length > 64 * 1024,
      `the fixture must exceed the pipe buffer or it cannot demonstrate the defect; got ${out.length} bytes`
    );

    // THE POINT: the verdict is printed LAST and must survive the pipe.
    assert.match(
      res.stdout, /\[CTOC test-gate\] coverage [\d.]+% \(threshold 50%\)/,
      `the coverage verdict is printed after ~300KB of output and must not be discarded ` +
      `on exit — this is what Step 14 VERIFY reads. Received ${res.stdout.length} bytes, ` +
      `tail:\n${res.stdout.slice(-300)}`
    );
    assert.match(res.stdout, /\[CTOC test-gate\] PASS/, 'the final PASS line must survive too');
    assert.strictEqual(res.status, 0, `a clean loud suite must exit 0. Tail:\n${out.slice(-500)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

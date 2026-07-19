'use strict';

/**
 * THE COVERAGE RATCHET ONLY TIGHTENS — AND AN UNREADABLE FLOOR IS NOT A FLOOR.
 *
 * `.ctoc/coverage-baseline.json`'s `minPct` is the floor Step 14 VERIFY enforces.
 * Before this file, NOTHING checked its direction: tests/coverage-gate.test.js
 * asserts only that it is a number in (0,100] and that the gate reads it, so
 * `minPct` could be lowered from 99 to 40 in one line and the whole suite would
 * stay green. The comment in that file saying the baseline "may only be RAISED"
 * was prose, not a check.
 *
 * Worse, `resolveThreshold` returned DEFAULT_THRESHOLD (80) on ANY read failure —
 * absent, corrupt, a `minPct` that was a string rather than a number, or a value
 * outside (0,100] — while printing a threshold and PASSING. Measured on disk before
 * this slice, every one of those five inputs produced the number 80 and a green run.
 * Cases 7-10 matter most, because that fallback branch was the single line in the
 * whole mechanism no test ever reached.
 *
 * The fix is a DISTINCTION, not a stricter check: an ABSENT baseline is a legitimate
 * state (a project that predates instrumentation) and keeps the documented default,
 * but must ANNOUNCE that it is defaulting. A baseline that EXISTS but cannot be read,
 * parsed, or trusted is a BROKEN INSTRUMENT and must REFUSE — never return a number.
 * This mirrors the discipline already in the same file: its output parsers return
 * `null`, never the success value, so "I could not read my input" can never be
 * mistaken for "everything passed."
 *
 * HISTORICAL_FLOOR is the ratchet. RAISE it when you raise the baseline. Lowering
 * it is the one edit this file exists to make impossible to do quietly.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gate = require('../src/scripts/test-gate.js');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, '.ctoc', 'coverage-baseline.json');

/**
 * The ratchet. This number and `.ctoc/coverage-baseline.json`'s `minPct` state the
 * same fact in two places ON PURPOSE: lowering the enforced floor then requires
 * editing BOTH, one of which is a test whose name says never to do it.
 */
const HISTORICAL_FLOOR = 99;

/** Read the real committed baseline. */
function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
}

/**
 * Build a throwaway project root under the OS temp dir.
 * @param {string|null} baselineContent raw bytes for `.ctoc/coverage-baseline.json`,
 *   or null to leave the baseline ABSENT.
 * @returns {string} the fixture root.
 */
function makeFixture(baselineContent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-ratchet-'));
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  if (baselineContent !== null) {
    fs.writeFileSync(path.join(root, '.ctoc', 'coverage-baseline.json'), baselineContent);
  }
  return root;
}

/** Remove a fixture root. */
function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

/**
 * Run a fixture root through `resolveThreshold` and hand back the outcome, so a
 * case can assert on a REFUSAL rather than on a returned number.
 * @param {string} root
 * @returns {{threshold: number|undefined, error: Error|undefined, notices: string[]}}
 */
function resolve(root) {
  const notices = [];
  try {
    const threshold = gate.resolveThreshold(root, { notice: (m) => notices.push(String(m)) });
    return { threshold, error: undefined, notices };
  } catch (err) {
    return { threshold: undefined, error: /** @type {Error} */ (err), notices };
  }
}

describe('the coverage ratchet only tightens, and an unreadable floor refuses', () => {
  // -------------------------------------------------------------------------
  // Direction — the floor may only ever rise.
  // -------------------------------------------------------------------------

  it('1. the floor never drops below the historical floor', () => {
    const baseline = readBaseline();
    assert.ok(
      baseline.minPct >= HISTORICAL_FLOOR,
      `.ctoc/coverage-baseline.json minPct is ${baseline.minPct}, below the historical floor ` +
      `${HISTORICAL_FLOOR}. The coverage baseline is a RATCHET: RAISE it as coverage improves, ` +
      'NEVER lower it to make a failing run pass. Fix the tests or the code instead. ' +
      'Do not lower HISTORICAL_FLOOR in this file either — it exists to make that edit loud.'
    );
  });

  it('2. the constant tracks the baseline (a second, independent statement)', () => {
    assert.ok(
      HISTORICAL_FLOOR >= 99,
      `HISTORICAL_FLOOR is ${HISTORICAL_FLOOR}; it was 99 and a ratchet may only rise. ` +
      'Lowering it is the exact quiet edit this file exists to prevent.'
    );
  });

  it('3. the baseline is a usable floor: a finite number in (0, 100]', () => {
    const baseline = readBaseline();
    assert.strictEqual(typeof baseline.minPct, 'number');
    assert.ok(Number.isFinite(baseline.minPct));
    assert.ok(baseline.minPct > 0 && baseline.minPct <= 100);
  });

  it('4. the baseline file exists and parses — a missing floor is not a floor of zero', () => {
    assert.ok(fs.existsSync(BASELINE_FILE), `${BASELINE_FILE} is missing`);
    assert.doesNotThrow(() => readBaseline());
  });

  it('5. the gate enforces the recorded floor, so enforced and recorded cannot drift', () => {
    assert.strictEqual(gate.resolveThreshold(ROOT), readBaseline().minPct);
  });

  it('6. raising is allowed: a baseline above the historical floor resolves unchanged', () => {
    const root = makeFixture(JSON.stringify({ minPct: 100 }));
    try {
      const { threshold, error } = resolve(root);
      assert.strictEqual(error, undefined);
      assert.strictEqual(threshold, 100);
      assert.ok(threshold >= HISTORICAL_FLOOR);
    } finally {
      cleanup(root);
    }
  });

  // -------------------------------------------------------------------------
  // The blind cases — a present-but-unreadable floor REFUSES.
  // -------------------------------------------------------------------------

  it('7. a CORRUPT baseline REFUSES — it does not return 80', () => {
    const root = makeFixture('{not json');
    try {
      const { threshold, error } = resolve(root);
      assert.strictEqual(
        threshold, undefined,
        `an unparseable baseline returned the number ${threshold} instead of refusing — ` +
        'that is a verdict on input the gate never received'
      );
      assert.ok(error instanceof Error);
      assert.match(error.message, /coverage-baseline\.json/);
      assert.ok(
        !error.message.includes(root),
        'the refusal must name a repository-relative path, never an absolute one'
      );
      assert.ok(
        !error.message.includes('{not json'),
        'the refusal must not echo the unparsed file contents back into the output'
      );
    } finally {
      cleanup(root);
    }
  });

  it('8. a WRONG-TYPE minPct REFUSES (the string "99", not the number 99)', () => {
    const root = makeFixture(JSON.stringify({ minPct: '99' }));
    try {
      const { threshold, error } = resolve(root);
      assert.strictEqual(
        threshold, undefined,
        `a string minPct returned the number ${threshold} instead of refusing — one character ` +
        'in a JSON file must not silently drop the enforced floor'
      );
      assert.ok(error instanceof Error);
      assert.match(error.message, /minPct/);
    } finally {
      cleanup(root);
    }
  });

  it('9. an OUT-OF-RANGE minPct REFUSES (0, 101, NaN, negative)', () => {
    for (const bad of ['{"minPct": 0}', '{"minPct": 101}', '{"minPct": -5}', '{"minPct": null}']) {
      const root = makeFixture(bad);
      try {
        const { threshold, error } = resolve(root);
        assert.strictEqual(
          threshold, undefined,
          `baseline ${bad} returned the number ${threshold} instead of refusing`
        );
        assert.ok(error instanceof Error, `baseline ${bad} did not refuse`);
        assert.match(error.message, /minPct/);
      } finally {
        cleanup(root);
      }
    }
  });

  it('10. an ABSENT baseline defaults — and ANNOUNCES that it is defaulting', () => {
    const root = makeFixture(null);
    try {
      const { threshold, error, notices } = resolve(root);
      assert.strictEqual(error, undefined, 'an absent baseline must NOT refuse — that would break every uninstrumented project');
      assert.strictEqual(threshold, 80, 'an absent baseline keeps the documented default');
      assert.ok(
        notices.length > 0,
        'an absent baseline defaulted SILENTLY — silence is the failure mode; the default must be announced'
      );
      const said = notices.join('\n');
      assert.match(said, /default/i);
      assert.match(said, /coverage-baseline\.json/);
      assert.match(said, /80/);
    } finally {
      cleanup(root);
    }
  });

  // -------------------------------------------------------------------------
  // The same two facts, through the real command-line gate.
  // -------------------------------------------------------------------------

  it('11. the command-line gate REFUSES a corrupt baseline non-zero, without running the suite', () => {
    const root = buildRunnableGate('{"minPct": "99"}');
    try {
      const res = runGate(root);
      assert.notStrictEqual(res.status, 0, `the gate exited ${res.status} on a corrupt floor; it must refuse`);
      const out = (res.stdout || '') + (res.stderr || '');
      assert.match(out, /coverage-baseline\.json/);
      assert.ok(
        !/threshold 80%/.test(out),
        'the gate reported "threshold 80%" on a floor it could not read — the exact defect this slice removes'
      );
      assert.ok(
        !/all files/.test(out),
        'the gate ran the whole suite before refusing; a broken instrument must be caught before the work'
      );
    } finally {
      cleanup(root);
    }
  });

  it('12. the command-line gate ANNOUNCES the default when no baseline exists', () => {
    const root = buildRunnableGate(null);
    try {
      const res = runGate(root);
      const out = (res.stdout || '') + (res.stderr || '');
      assert.match(out, /no coverage baseline/i, `gate output did not announce the default:\n${out}`);
      assert.match(out, /default/i);
    } finally {
      cleanup(root);
    }
  });
});

/**
 * A throwaway project containing the REAL gate byte-for-byte, its two library
 * dependencies, and one tiny passing test — modelled on the fixture in
 * tests/coverage-gate.test.js.
 * @param {string|null} baselineContent
 * @returns {string} the fixture root.
 */
function buildRunnableGate(baselineContent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-ratchet-cli-'));
  fs.mkdirSync(path.join(root, 'src', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });

  fs.copyFileSync(
    path.join(ROOT, 'src', 'scripts', 'test-gate.js'),
    path.join(root, 'src', 'scripts', 'test-gate.js')
  );
  for (const mod of ['safe-fs', 'request-exit']) {
    const real = path.join(ROOT, 'src', 'lib', `${mod}.js`);
    fs.writeFileSync(
      path.join(root, 'src', 'lib', `${mod}.js`),
      `module.exports = require(${JSON.stringify(real)});\n`
    );
  }
  fs.writeFileSync(path.join(root, 'src', 'thing.js'), 'module.exports = () => 42;\n');
  if (baselineContent !== null) {
    fs.writeFileSync(path.join(root, '.ctoc', 'coverage-baseline.json'), baselineContent);
  }
  fs.writeFileSync(path.join(root, 'tests', 'tiny.test.js'), [
    "'use strict';",
    "const test = require('node:test');",
    "const assert = require('node:assert');",
    "const thing = require('../src/thing.js');",
    "test('tiny but passing', () => { assert.strictEqual(thing(), 42); });",
  ].join('\n') + '\n');
  return root;
}

/**
 * Run a fixture's copy of the gate as a real subprocess.
 * @param {string} root
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
function runGate(root) {
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [path.join(root, 'src', 'scripts', 'test-gate.js')], {
    cwd: root, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024, env: childEnv,
  });
}

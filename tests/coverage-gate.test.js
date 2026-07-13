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

test('parseSkipped: absent line means zero', () => {
  assert.strictEqual(gate.parseSkipped('no summary here'), 0);
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

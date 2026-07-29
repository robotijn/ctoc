'use strict';

/**
 * THE DEAD-EXPORT FENCE'S SURFACE SCAN IS LINEAR — a ReDoS regression guard.
 *
 * WHY (2026-07-29, MEASURED). CTOC's full `npm test` took 864 s (14.4 min), and ONE
 * test — tests/claim-census.test.js's 1-MiB-single-char fixture — was 851,923 ms of
 * it; the next-slowest test was ~10 s. Because `node --test` runs files in parallel,
 * that single test WAS the wall-clock. The cause was a quadratic regex in the
 * dead-export fence (src/lib/reachability.js):
 *
 *     const SURFACE_CALL_RE = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
 *
 * On a long run of identifier characters with no `(`, the UNBOUNDED `[A-Za-z0-9_$]*`
 * consumes the whole run, `\s*\(` fails, and the engine retries from every start
 * position → O(n²). At n = 1 MiB that is ~10¹² steps ≈ 14 minutes. It was BOTH a
 * test-speed problem AND a live ReDoS: `collectSurfaceFiles` deliberately never skips
 * an oversized surface, so a large shipped guide file with a long token run hung the
 * enforcer in production. The fix bounds the identifier to ≤128 chars, matching the
 * sibling regexes (`SURFACE_NODE_RUNS_RE` bounds `{0,80}`, `SURFACE_REQUIRES_RE`
 * `{0,64}`), making each failed start backtrack at most 128 times → linear.
 *
 * WHY A CHILD PROCESS. A synchronous CPU-bound regex CANNOT be interrupted by
 * `node --test`'s own per-test timeout — the timeout fires only between async ticks,
 * and a busy regex never yields. The ONLY way to make the RED a bounded failure
 * instead of a 14-minute hang (and to keep any future regression from hanging the
 * whole suite) is to run the scan in a child process with a hard kill timeout: a
 * child that does not exit within the ceiling is KILLED and the test FAILS. Post-fix
 * the child exits in well under a second, so the ceiling is never approached and the
 * green suite pays nothing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REACH = path.resolve(__dirname, '..', 'src', 'lib', 'reachability.js');
const ROOT = path.resolve(__dirname, '..');
const EXPORT_BASELINE = path.join(ROOT, '.ctoc', 'export-reachability-baseline.json');
const FILE_BASELINE = path.join(ROOT, '.ctoc', 'reachability-baseline.json');

// A linear scan of a 2-MiB single-char surface must finish in a fraction of a
// second; the unbounded regex needed thousands of seconds for the same input.
const BOUND_MS = 3000;
// Hard ceiling on the child. Post-fix the child exits in <1 s so this is never
// reached; pre-fix the child is KILLED here, turning a 14-min hang into a bounded
// ~25-s RED.
const HARD_TIMEOUT_MS = 25000;
const MiB = 1 << 20;

/** Build a temp corpus whose only instruction surface is one single-char skills file. */
function makeSingleCharCorpus(sizeBytes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-linear-'));
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'huge.md'), 'a'.repeat(sizeBytes));
  return root;
}

/**
 * Run `analyzeExports(root)` in a child process, bounded by a hard kill timeout.
 * @returns {{ completed: boolean, elapsedMs: number|null, signal: string|null }}
 *   `completed` is true only when the child exited 0 within the ceiling; `elapsedMs`
 *   is the child's own measured scan time (excludes node startup).
 */
function runScanBounded(root) {
  const runner =
    'const t = Date.now();' +
    'const { analyzeExports } = require(' + JSON.stringify(REACH) + ');' +
    'const r = analyzeExports(process.argv[1]);' +
    'process.stdout.write("ELAPSED=" + (Date.now() - t) + " SC=" + r.surfaceCalled.length);';
  const res = spawnSync(process.execPath, ['-e', runner, root], {
    timeout: HARD_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
    maxBuffer: 64 * MiB
  });
  const completed = res.status === 0 && res.signal === null;
  let elapsedMs = null;
  if (completed && typeof res.stdout === 'string') {
    const m = res.stdout.match(/ELAPSED=(\d+)/);
    if (m) elapsedMs = Number(m[1]);
  }
  return { completed, elapsedMs, signal: res.signal };
}

describe('the dead-export fence scans a surface in LINEAR time (ReDoS guard)', () => {
  it('a 2-MiB single-char surface is scanned within a strict bound (not minutes)', () => {
    const root = makeSingleCharCorpus(2 * MiB);
    try {
      const { completed, elapsedMs, signal } = runScanBounded(root);
      assert.ok(
        completed,
        'analyzeExports did NOT complete on a 2-MiB single-char surface within ' +
          `${HARD_TIMEOUT_MS} ms — it was killed (signal ${signal}). That is the O(n²) ` +
          'ReDoS in SURFACE_CALL_RE: bound the identifier quantifier so the scan is linear.'
      );
      assert.ok(
        elapsedMs !== null && elapsedMs < BOUND_MS,
        `the scan took ${elapsedMs} ms, over the ${BOUND_MS} ms linear bound — the surface ` +
          'regex is backtracking super-linearly on a long token run.'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('doubling the input does not super-linearly increase the scan time', () => {
    const rootS = makeSingleCharCorpus(1 * MiB);
    const root2S = makeSingleCharCorpus(2 * MiB);
    try {
      const a = runScanBounded(rootS);
      const b = runScanBounded(root2S);
      assert.ok(a.completed && b.completed,
        'both scans must complete within the ceiling; a killed scan is the quadratic regression itself.');
      // Linear ⇒ t(2S) ≈ 2·t(S). Quadratic ⇒ ≈ 4·t(S) (and in practice it blows the
      // ceiling entirely, failing the assertion above). A generous constant + a fixed
      // slack absorbs per-run timing noise while still catching a real super-linear.
      assert.ok(
        b.elapsedMs < 3 * a.elapsedMs + 400,
        `t(2 MiB)=${b.elapsedMs} ms vs t(1 MiB)=${a.elapsedMs} ms — that ratio is super-linear; ` +
          'a surface regex is backtracking quadratically on a long run.'
      );
    } finally {
      fs.rmSync(rootS, { recursive: true, force: true });
      fs.rmSync(root2S, { recursive: true, force: true });
    }
  });
});

describe('SEMANTICS PRESERVED — the ≤128 bound drops no real call site', () => {
  it('real identifier( call sites are credited exactly; only a >128-char pathological token is not credited whole', () => {
    // Every real JavaScript identifier is far under 128 chars; the bound only ever
    // clips a pathological run. Prove the boundary directly: a short name, a name at
    // exactly the 128-char limit (still fully credited), and a 200-char run (whose
    // FULL form must NOT appear — pre-fix the unbounded regex credited it whole).
    const name128 = 'b'.repeat(128);
    const name200 = 'c'.repeat(200);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-sem-'));
    try {
      fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'skills', 'sem.md'),
        '# recipes\n' +
          'Run `shortCall(x)` then `snake_case_fn(y)` then `$dollar(z)`.\n' +
          'Edge: `' + name128 + '(q)` at the bound, and `' + name200 + '(q)` over it.\n'
      );
      const { analyzeExports } = require(REACH);
      const surface = new Set(analyzeExports(root).surfaceCalled);
      for (const real of ['shortCall', 'snake_case_fn', '$dollar', name128]) {
        assert.ok(surface.has(real), `a real ${real.length}-char call site must be credited; missing "${real.slice(0, 12)}…".`);
      }
      assert.ok(
        !surface.has(name200),
        'a 200-char pathological token must NOT be credited in full — the unbounded regex used to; the bound clips it.'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('SEMANTICS PRESERVED — the real repo shows ZERO fence movement', () => {
  it('the dead-export set exactly equals the committed baseline (no real identifier dropped)', () => {
    const { analyzeExports } = require(REACH);
    const baseline = JSON.parse(fs.readFileSync(EXPORT_BASELINE, 'utf8'));
    const result = analyzeExports(ROOT);
    // The kill claim: bounding the identifier must not change WHICH exports are dead.
    // If the bound dropped any real call site, some export would flip to dead and this
    // deep-equal would fail — a direct, independent proof of preserved semantics.
    assert.deepEqual(
      [...result.dead].sort(),
      [...baseline.dead].sort(),
      'the dead-export set moved — the ≤128 bound changed which real call sites are credited. ' +
        'That means the bound is wrong (a real identifier exceeded it); do not adjust the baseline.'
    );
    assert.equal(result.dead.length, baseline.maxDead,
      `dead-export count ${result.dead.length} != baseline maxDead ${baseline.maxDead}.`);
  });

  it('the file-reachability set is unmoved too (the surface scan feeds live-root detection)', () => {
    const { analyze } = require(REACH);
    const baseline = JSON.parse(fs.readFileSync(FILE_BASELINE, 'utf8'));
    const result = analyze(ROOT);
    assert.equal(result.readErrors.length, 0, 'analyze() must read every input it judges.');
    assert.deepEqual(
      [...result.unreachable].sort(),
      [...baseline.unreachable].sort(),
      'the unreachable-file set moved — bounding a surface regex changed which files count as roots.'
    );
  });
});

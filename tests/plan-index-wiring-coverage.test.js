'use strict';

/**
 * Dark-branch coverage for `src/lib/plan-index/wiring.js` (PI0 composition root).
 *
 * The smoke suite (`plan-index-smoke.test.js`) already proves the happy shape,
 * per-project caching, the store-THROW fail-open, and probe ollama/in-process.
 * This file targets the branches those tests leave GREEN-but-unpinned — the ones
 * a mutant survives:
 *
 *   • the `||`-operand chain that decides "injected" (line 132: getSetting- and
 *     loadCalibration-only injections MUST force a fresh, uncached build);
 *   • the singleton `!injected` guard both ways (an injected build must never read
 *     OR poison the cache — lines 133/154/184);
 *   • the store PATH handed to openStore (line 145);
 *   • the store-returns-NULL degrade whose reason comes from the `|| 'store-
 *     unavailable'` RIGHT operand (line 152) — distinct from the THROW path where
 *     `degraded` is already truthy;
 *   • the LIVE-store embedder adapter's fail-open `.catch` (line 164) on both a
 *     synchronous throw and an async rejection, plus the exact args it forwards
 *     (line 163);
 *   • `calibrationReady`'s `!= null` loose-equality (null AND undefined → false)
 *     and its catch (line 167);
 *   • `canonicalizeRoot`'s realpath-throws fail-open (lines 74-75, a not-yet-
 *     existing root) and `resolveRoot`'s argless / empty-string branch (line 90);
 *   • `probeEmbeddingSource`'s probe-throws / probe-rejects catch (lines 217-218)
 *     and the arg it forwards.
 *
 * Boundary-only fakes: `openStore`, `embed`, `getSetting`, `loadCalibration`, and
 * the Ollama `probe` are injected at the module's declared test seam. No network,
 * no real embedding backend, no source edits. Real fixtures cleaned in `finally`;
 * the singleton is reset in `afterEach`.
 *
 * Reviewed line-by-line by a human (Tijn) — assertions describe wiring outcomes,
 * not call sequences.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { getWiring, probeEmbeddingSource } = require('../src/lib/plan-index/wiring');
const { findProjectRoot } = require('../src/lib/project-root');

const DIM = 2;

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-wiring-cov-'));
}
function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Reproduce the module's own root canonicalization so assertions compare against
// the exact key/projectPath it will compute (macOS tmpdir is a /var → /private/var
// symlink, so the lexical resolve is NOT the realpath).
function canon(p) {
  try { return fs.realpathSync.native(path.resolve(p)); }
  catch { return path.resolve(p); }
}

// A minimal truthy store sentinel — getWiring only stashes it and gates
// isIndexAvailable on its truthiness; no store behaviour is exercised here.
function fakeStore(tag = 'fake') {
  return { __tag: tag, moveUnit() {}, save() {}, upsertUnit() {}, listPlanPaths() { return []; } };
}

test.afterEach(() => { try { getWiring.__reset(); } catch { /* */ } });

// ── line 132: the `||` operand chain deciding "injected" ──────────────────────
// Each row injects EXACTLY ONE dep and asserts the call is treated as injected:
// it must NOT return a previously-cached wiring but construct fresh. A mutant that
// drops that operand from the chain makes the call non-injected → returns the
// cached wiring → identity assertion goes RED.
for (const dep of ['openStore', 'embed', 'getSetting', 'loadCalibration']) {
  test(`getWiring_with_only_${dep}_injected_forces_a_fresh_uncached_build`, () => {
    // Arrange — seed the singleton with a real (non-injected) wiring.
    const dir = mkTmp();
    try {
      const cached = getWiring({ projectPath: dir });
      assert.ok(cached.store, 'precondition: cached build has a real store');

      // A benign value for whichever single dep this row injects. openStore returns
      // a distinct fake so identity divergence is unambiguous; the rest are no-op
      // functions whose mere presence must still flip the injected flag.
      const opts = { projectPath: dir };
      opts[dep] = dep === 'openStore'
        ? () => fakeStore('only-' + dep)
        : () => (dep === 'loadCalibration' ? null : { vectors: [] });

      // Act
      const built = getWiring(opts);

      // Assert — injected → a brand-new wiring object, never the cached singleton.
      assert.notStrictEqual(built, cached,
        `${dep}-only injection must bypass the cache (line 132 operand)`);
    } finally { rmTmp(dir); }
  });
}

// ── line 133 (`!injected &&`): an injected build must NOT read the cache ───────
test('getWiring_injected_build_ignores_the_populated_cache_and_uses_injected_store', () => {
  // Arrange — populate the cache with a real store.
  const dir = mkTmp();
  try {
    const cached = getWiring({ projectPath: dir });
    const injectedStore = fakeStore('injected');

    // Act — same root, but with an injected openStore.
    const w = getWiring({ projectPath: dir, openStore: () => injectedStore });

    // Assert — it returns the INJECTED store, not the cached real one. A mutant
    // dropping `!injected &&` at line 133 would short-circuit to the cache.
    assert.strictEqual(w.store, injectedStore);
    assert.notStrictEqual(w.store, cached.store);
  } finally { rmTmp(dir); }
});

// ── lines 154/184 (`if (!injected)`): an injected build must NOT poison cache ──
test('getWiring_injected_build_does_not_populate_the_cache_for_later_real_calls', () => {
  // Arrange — first call is injected with a recognizable fake store.
  const dir = mkTmp();
  try {
    const injectedStore = fakeStore('poison');
    const injected = getWiring({ projectPath: dir, openStore: () => injectedStore });
    assert.strictEqual(injected.store, injectedStore, 'precondition: injected store used');

    // Act — a subsequent NON-injected call on the same root.
    const real = getWiring({ projectPath: dir });

    // Assert — it builds a real store, never serving the injected fake. A mutant
    // caching the injected build (dropping `!injected` at line 184) returns the fake.
    assert.notStrictEqual(real.store, injectedStore);
    assert.strictEqual(typeof real.store.moveUnit, 'function', 'real store constructed');
    // And the real build IS now cached (proves the guard only blocked the injected one).
    assert.strictEqual(getWiring({ projectPath: dir }), real);
  } finally { rmTmp(dir); }
});

// ── line 145: the exact path handed to openStore ──────────────────────────────
test('getWiring_opens_the_store_at_dotctoc_index_plan_index_json_under_the_canonical_root', () => {
  // Arrange
  const dir = mkTmp();
  try {
    let capturedPath = null;
    const capture = (p) => { capturedPath = p; return fakeStore(); };

    // Act
    getWiring({ projectPath: dir, openStore: capture });

    // Assert — a mutant altering any path segment at line 145 diverges here.
    assert.strictEqual(capturedPath, path.join(canon(dir), '.ctoc', 'index', 'plan-index.json'));
  } finally { rmTmp(dir); }
});

// ── lines 151-152: store returns NULL (no throw) → `|| 'store-unavailable'` ────
// Distinct from the smoke's THROW path: there `degraded` is SET to
// 'store-unavailable' (line 148, LEFT operand truthy), so the `||` RIGHT operand
// is never exercised. A null RETURN leaves `degraded === null`, so the reason can
// only come from the right operand. A mutant deleting `|| 'store-unavailable'`
// yields degradedReason() === null and reds this test.
test('getWiring_store_returning_null_degrades_via_the_right_operand_fallback_reason', () => {
  // Arrange + Act
  const dir = mkTmp();
  try {
    const w = getWiring({ projectPath: dir, openStore: () => null });

    // Assert — safe no-op wiring with the fallback reason string.
    assert.strictEqual(w.store, null);
    assert.strictEqual(w.isIndexAvailable(), false);
    assert.strictEqual(w.degradedReason(), 'store-unavailable');
  } finally { rmTmp(dir); }
});

// ── lines 147-149: store construction THROWS → degraded set, noop embedder ────
// The complement of the null-RETURN case: here the catch SETS
// `degraded = 'store-unavailable'` (line 148), and the resulting wiring's embedder
// is the noop that resolves { vectors: [] } (line 108), never the live adapter.
test('getWiring_store_throwing_yields_noop_wiring_with_degraded_reason_and_empty_embedder', async () => {
  // Arrange + Act
  const dir = mkTmp();
  try {
    let w;
    assert.doesNotThrow(() => {
      w = getWiring({ projectPath: dir, openStore: () => { throw new Error('construct-boom'); } });
    });

    // Assert — safe no-op wiring; the embedder still resolves empty vectors.
    assert.strictEqual(w.store, null);
    assert.strictEqual(w.isIndexAvailable(), false);
    assert.strictEqual(w.degradedReason(), 'store-unavailable');
    assert.strictEqual(w.calibrationReady(), false);
    const out = await w.embedder(['x']);
    assert.deepStrictEqual(out, { vectors: [] });
  } finally { rmTmp(dir); }
});

// ── line 164: LIVE-store embedder adapter fail-open on a SYNCHRONOUS throw ─────
// Store constructs (real openStore, embed-only injection), but `_embed` throws.
// This is the live-adapter `.catch`, NOT the noop embedder the smoke exercises.
test('getWiring_live_embedder_resolves_empty_vectors_when_embed_throws_synchronously', async () => {
  // Arrange
  const dir = mkTmp();
  try {
    const w = getWiring({ projectPath: dir, embed: () => { throw new Error('sync-boom'); } });
    assert.ok(w.store, 'precondition: live store constructed (not the noop wiring)');

    // Act
    const out = await w.embedder(['x']);

    // Assert — never rejects; fails open to empty vectors.
    assert.deepStrictEqual(out, { vectors: [] });
  } finally { rmTmp(dir); }
});

// ── line 164: LIVE-store embedder adapter fail-open on an ASYNC rejection ──────
test('getWiring_live_embedder_resolves_empty_vectors_when_embed_rejects_asynchronously', async () => {
  // Arrange
  const dir = mkTmp();
  try {
    const w = getWiring({ projectPath: dir, embed: async () => { throw new Error('async-boom'); } });
    assert.ok(w.store, 'precondition: live store constructed');

    // Act
    const out = await w.embedder(['x']);

    // Assert
    assert.deepStrictEqual(out, { vectors: [] });
  } finally { rmTmp(dir); }
});

// ── line 163: the embedder forwards texts + { projectPath, getSetting } exactly ─
test('getWiring_embedder_forwards_texts_and_canonical_projectPath_and_injected_getSetting', async () => {
  // Arrange
  const dir = mkTmp();
  try {
    let capText = null;
    let capOpts = null;
    const capEmbed = async (texts, opts) => {
      capText = texts; capOpts = opts;
      return { vectors: [new Float32Array(DIM).fill(1)], source: 'in-process' };
    };
    const sentinelGetSetting = function sentinel() { return 'SENTINEL'; };
    const w = getWiring({ projectPath: dir, embed: capEmbed, getSetting: sentinelGetSetting });

    // Act
    const out = await w.embedder(['hello']);

    // Assert — the adapter unwraps to { vectors } and forwards the exact opts. A
    // mutant swapping in the real getSetting, or the wrong projectPath, diverges.
    assert.ok(out.vectors[0] instanceof Float32Array);
    assert.deepStrictEqual(capText, ['hello']);
    assert.strictEqual(capOpts.projectPath, canon(dir));
    assert.strictEqual(capOpts.getSetting, sentinelGetSetting);
  } finally { rmTmp(dir); }
});

// ── lines 166-168: calibrationReady's `!= null` (null AND undefined → false) ────
// The loose-equality `!= null` collapses null AND undefined to false, and any
// non-null value to true; a thrown load fails open to false. A mutant tightening
// to `!== null` would make the undefined row return true → that row reds.
for (const row of [
  { id: 'object_present', ret: { p95: 1 }, expected: true },
  { id: 'null_returned', ret: null, expected: false },
  { id: 'undefined_returned', ret: undefined, expected: false },
]) {
  test(`getWiring_calibrationReady_is_${row.expected}_when_loadCalibration_returns_${row.id}`, () => {
    // Arrange — inject loadCalibration (forces fresh, real store so the closure is live).
    const dir = mkTmp();
    try {
      const w = getWiring({ projectPath: dir, loadCalibration: () => row.ret });
      assert.ok(w.store, 'precondition: live store, real calibrationReady closure');

      // Act + Assert
      assert.strictEqual(w.calibrationReady(), row.expected);
    } finally { rmTmp(dir); }
  });
}

// ── line 167: calibrationReady catch → false when loadCalibration THROWS ───────
test('getWiring_calibrationReady_is_false_when_loadCalibration_throws', () => {
  // Arrange
  const dir = mkTmp();
  try {
    const w = getWiring({ projectPath: dir, loadCalibration: () => { throw new Error('cal-boom'); } });

    // Act + Assert — fail-open, never propagates the throw.
    assert.strictEqual(w.calibrationReady(), false);
  } finally { rmTmp(dir); }
});

// ── line 168: calibrationReady passes { projectPath: root } to loadCalibration ─
test('getWiring_calibrationReady_calls_loadCalibration_with_the_canonical_projectPath', () => {
  // Arrange
  const dir = mkTmp();
  try {
    let capOpts = null;
    const w = getWiring({
      projectPath: dir,
      loadCalibration: (o) => { capOpts = o; return { ok: true }; }
    });

    // Act
    const ready = w.calibrationReady();

    // Assert
    assert.strictEqual(ready, true);
    assert.strictEqual(capOpts.projectPath, canon(dir));
  } finally { rmTmp(dir); }
});

// ── lines 74-75: canonicalizeRoot fail-open on a NOT-YET-EXISTING root ─────────
// realpathSync.native throws ENOENT for a path that does not exist; the catch
// returns the lexical resolve so a fresh project (root absent on disk) still
// wires. Uses an openStore stub so no real fs store is opened for the fake root.
test('getWiring_uses_lexical_root_when_realpath_throws_for_a_nonexistent_root', () => {
  // Arrange — an absolute path guaranteed not to exist.
  const nonexistent = path.join(os.tmpdir(), 'ctoc-does-not-exist-' + process.pid + '-' + Date.now());

  // Act
  const w = getWiring({ projectPath: nonexistent, openStore: () => fakeStore() });

  // Assert — projectPath falls back to the lexical resolve (line 75), not a realpath.
  assert.strictEqual(w.projectPath, path.resolve(nonexistent));
});

// ── line 90: resolveRoot argless branch → findProjectRoot(cwd) ─────────────────
// No projectPath → the shared finder resolves the root from cwd. openStore stub
// keeps the real repo store untouched. A mutant skipping the finder diverges from
// the computed expectation.
test('getWiring_with_no_projectPath_resolves_the_root_from_findProjectRoot_of_cwd', () => {
  // Arrange
  const expected = canon(findProjectRoot(process.cwd()));

  // Act
  const w = getWiring({ openStore: () => fakeStore() });

  // Assert
  assert.strictEqual(w.projectPath, expected);
});

// ── line 87 boundary (`projectPath.length > 0`): empty string → finder branch ──
test('getWiring_with_empty_string_projectPath_falls_through_to_the_cwd_finder', () => {
  // Arrange
  const expected = canon(findProjectRoot(process.cwd()));

  // Act — '' has length 0, so the string branch is skipped (boundary `> 0`).
  const w = getWiring({ projectPath: '', openStore: () => fakeStore() });

  // Assert
  assert.strictEqual(w.projectPath, expected);
});

// ── line 219: probeEmbeddingSource — Ollama reachable → source 'ollama' ────────
test('probeEmbeddingSource_reports_ollama_when_the_probe_resolves_true', async () => {
  // Arrange + Act
  const dir = mkTmp();
  try {
    const r = await probeEmbeddingSource({ projectPath: dir, probe: async () => true });

    // Assert
    assert.deepStrictEqual(r, { available: true, source: 'ollama' });
  } finally { rmTmp(dir); }
});

// ── line 223: probe resolves false → in-process fallback, still available ──────
test('probeEmbeddingSource_falls_back_to_in_process_when_the_probe_resolves_false', async () => {
  // Arrange + Act
  const dir = mkTmp();
  try {
    const r = await probeEmbeddingSource({ projectPath: dir, probe: async () => false });

    // Assert
    assert.deepStrictEqual(r, { available: true, source: 'in-process' });
  } finally { rmTmp(dir); }
});

// ── lines 217-218: probe THROWS synchronously → fail-open → in-process ─────────
test('probeEmbeddingSource_fails_open_to_in_process_when_the_probe_throws', async () => {
  // Arrange + Act
  const dir = mkTmp();
  try {
    const r = await probeEmbeddingSource({ projectPath: dir, probe: () => { throw new Error('probe-boom'); } });

    // Assert — the catch (218) forces reachable=false → in-process, never rejects.
    assert.deepStrictEqual(r, { available: true, source: 'in-process' });
  } finally { rmTmp(dir); }
});

// ── lines 217-218: probe REJECTS (async) → fail-open → in-process ──────────────
test('probeEmbeddingSource_fails_open_to_in_process_when_the_probe_rejects', async () => {
  // Arrange + Act
  const dir = mkTmp();
  try {
    const r = await probeEmbeddingSource({ projectPath: dir, probe: async () => { throw new Error('reject'); } });

    // Assert
    assert.deepStrictEqual(r, { available: true, source: 'in-process' });
  } finally { rmTmp(dir); }
});

// ── line 215: probeEmbeddingSource forwards the canonical root to the probe ────
test('probeEmbeddingSource_passes_the_canonical_projectPath_to_the_probe', async () => {
  // Arrange
  const dir = mkTmp();
  try {
    let capOpts = null;
    const probe = async (o) => { capOpts = o; return false; };

    // Act
    await probeEmbeddingSource({ projectPath: dir, probe });

    // Assert
    assert.strictEqual(capOpts.projectPath, canon(dir));
  } finally { rmTmp(dir); }
});

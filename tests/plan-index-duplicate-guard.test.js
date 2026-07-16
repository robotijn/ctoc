'use strict';

/**
 * PI5-s1 — tests for the duplicate-guard module (`checkDuplicate`).
 *
 * Option B correctness fix: `checkDuplicate` decides "too close?" on TRUE COSINE
 * similarity, so the shipped cosine-scale threshold (0.85) is meaningful. It embeds
 * the draft summary ONCE and calls `store.search(qVec, limit, { excludePlanPath })`
 * directly (the same cosine surface `related()`'s common path uses) — it does NOT
 * route the thresholded decision through PI4 `search()`'s Reciprocal Rank Fusion
 * score (whose mathematical ceiling ≈ 2/(60+1) = 0.0328 could NEVER reach 0.85, so
 * the guard was a silent no-op on every default install before this fix).
 *
 * Hermetic: every test injects a REAL `openStore` over a temp JSON (real cosine,
 * real getUnit/search/size) plus a stub embedder mapping the draft text → a fixture
 * query vector, and a stub `getSetting` returning a fixed threshold. ZERO network,
 * ZERO real embedding — deterministic cosine arithmetic over the comparator.
 *
 * Load-bearing property under test: `checkDuplicate` NEVER throws / never rejects.
 * A throwing embedder / store.search, a throwing/NaN getSetting, an empty index,
 * and bad input all resolve to `[]` (fail-open).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { checkDuplicate, DEFAULT_DUPLICATE_LIMIT } = require('../src/lib/plan-index/duplicate-guard');
const { openStore, PLAN_SENTINEL } = require('../src/lib/plan-index/store');

const AXIS_X = [1, 0, 0, 0, 0, 0, 0, 0]; // cosine 1.0 against itself
// A unit vector at cosine 0.85 to AXIS_X: [0.85, sqrt(1 - 0.85^2), 0, …].
const COS_085 = [0.85, Math.sqrt(1 - 0.85 * 0.85), 0, 0, 0, 0, 0, 0];

let tmpDirs = [];

/**
 * Build a REAL PI1 store on a throwaway temp dir, upserting each plan as its
 * `__plan__` unit carrying the given 8-dim vector.
 * @param {Array<{planPath:string, vec:number[], text?:string, files?:string[]}>} plans
 */
function buildStore(plans) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-guard-'));
  tmpDirs.push(dir);
  const store = openStore(path.join(dir, 'plan-index.json'));
  for (const p of plans) {
    store.upsertUnit({
      planPath: p.planPath,
      sectionId: PLAN_SENTINEL,
      kind: 'plan',
      text: p.text || p.planPath,
      files: (p.files || []).slice(),
      contentHash: p.planPath,
      embedding: Float32Array.from(p.vec),
    });
  }
  return store;
}

/**
 * Stub embedder: records every call; maps a query text → its fixture vector, else
 * a unit axis-0 vector. Mirrors the related/conflict test embedders.
 * @param {Map<string, number[]>} [map]
 */
function stubEmbedder(map = new Map()) {
  const calls = [];
  const embedder = async (texts) => {
    calls.push(texts);
    return { vectors: texts.map((t) => Float32Array.from(map.get(t) || AXIS_X)), source: 'stub' };
  };
  embedder.calls = calls;
  return embedder;
}

/** A stub getSetting returning a fixed value for plan_index.duplicate_threshold. */
function stubGetSetting(value) {
  return function getSetting(category, key /*, projectPath */) {
    assert.equal(category, 'plan_index');
    assert.equal(key, 'duplicate_threshold');
    return value;
  };
}

after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  tmpDirs = [];
});

describe('plan-index/duplicate-guard checkDuplicate', () => {
  it('module surface: exports async checkDuplicate and DEFAULT_DUPLICATE_LIMIT=5', () => {
    assert.equal(typeof checkDuplicate, 'function');
    assert.equal(checkDuplicate.constructor.name, 'AsyncFunction');
    assert.equal(DEFAULT_DUPLICATE_LIMIT, 5);
  });

  // ── THE Option-B correctness test (RED against the pre-fix RRF code) ───────────
  // A draft near-identical to an existing plan (cosine ≈ 1.0) MUST be flagged at the
  // shipped 0.85 threshold. Against the old RRF-scored code the result score was the
  // Reciprocal Rank Fusion value (~0.0328) which is < 0.85 → the guard returned [] and
  // never fired. On TRUE COSINE the near-duplicate scores ~1.0 ≥ 0.85 → it is flagged.
  it('near-identical draft (cosine ≈ 1.0) is flagged at the 0.85 threshold (cosine, not RRF)', async () => {
    const store = buildStore([{ planPath: 'plans/existing.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['near-identical draft summary', AXIS_X]]));
    const out = await checkDuplicate('near-identical draft summary', {
      store,
      embedder,
      getSetting: stubGetSetting(0.85),
    });
    assert.equal(out.length, 1, 'the near-duplicate is flagged (cosine 1.0 ≥ 0.85)');
    assert.equal(out[0].plan, 'plans/existing.md');
    assert.ok(out[0].similarity >= 0.85, `similarity is cosine-scale (~1.0), got ${out[0].similarity}`);
    assert.ok(out[0].similarity > 0.5, 'similarity is a TRUE cosine (~1.0), never an RRF value (~0.03)');
    assert.equal(embedder.calls.length, 1, 'the draft summary is embedded exactly once');
  });

  // 1. High threshold suppresses a below-threshold cosine match (comparator `<`).
  it('below-threshold match is suppressed (cosine 0.85 < 0.90 → [])', async () => {
    const store = buildStore([{ planPath: 'plans/ps1-sync-state.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', COS_085]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.9) });
    assert.deepEqual(out, []);
  });

  // 2. Low threshold raises the same cosine match (comparator `>=`).
  it('at/above-threshold match is returned (cosine 0.85 >= 0.70 → warning)', async () => {
    const store = buildStore([{ planPath: 'plans/ps1-sync-state.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', COS_085]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.7) });
    assert.equal(out.length, 1);
    assert.equal(out[0].plan, 'plans/ps1-sync-state.md');
    assert.ok(Math.abs(out[0].similarity - 0.85) < 1e-3, `cosine ~0.85, got ${out[0].similarity}`);
  });

  // 3. Boundary equality is a match (`>=`, not `>`): identical vectors → cosine 1.0
  //    against a 1.0 threshold. A mutant `>=` → `>` drops it (1.0 > 1.0 is false).
  it('boundary equality is a match (cosine 1.0 >= 1.0 pins the >= direction)', async () => {
    const store = buildStore([{ planPath: 'plans/ps1-sync-state.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(1.0) });
    assert.equal(out.length, 1);
    assert.equal(out[0].plan, 'plans/ps1-sync-state.md');
    assert.equal(out[0].similarity, 1);
  });

  // 4. Multiple results filtered on cosine + sorted similarity-descending.
  it('multiple results are cosine-threshold-filtered and sorted descending', async () => {
    const cos = (c) => [c, Math.sqrt(1 - c * c), 0, 0, 0, 0, 0, 0];
    const store = buildStore([
      { planPath: 'plans/a.md', vec: cos(0.72) },
      { planPath: 'plans/b.md', vec: cos(0.91) },
      { planPath: 'plans/c.md', vec: cos(0.86) },
    ]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.8) });
    assert.equal(out.length, 2, 'only the two above-0.80 plans survive');
    assert.deepEqual(out.map((r) => r.plan), ['plans/b.md', 'plans/c.md'], 'sorted cosine-descending');
    assert.ok(out[0].similarity >= out[1].similarity, 'similarity descending');
    assert.ok(out[1].similarity >= 0.8, 'both above the 0.80 threshold');
  });

  // 5. Empty index is a safe no-op — returns [] and does NOT embed (mirrors related).
  it('empty index → [] and the embedder is NOT called', async () => {
    const store = buildStore([]); // size 0
    const embedder = stubEmbedder();
    const out = await checkDuplicate('any', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(embedder.calls.length, 0, 'no embed on the empty-index guard');
  });

  // 6. selfPlanPath is forwarded as store.search excludePlanPath (a re-save never
  //    flags itself), even when self is cosine-1.0 identical.
  it('selfPlanPath is forwarded as excludePlanPath — self never flags itself', async () => {
    const store = buildStore([
      { planPath: 'plans/self.md', vec: AXIS_X },
      { planPath: 'plans/other.md', vec: AXIS_X },
    ]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('q', {
      store,
      embedder,
      getSetting: stubGetSetting(0.85),
      selfPlanPath: 'plans/self.md',
    });
    assert.equal(out.length, 1, 'self excluded, only the OTHER identical plan flags');
    assert.equal(out[0].plan, 'plans/other.md');
  });

  it('options.limit overrides the default limit forwarded to store.search', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    let capturedLimit;
    const realSearch = store.search.bind(store);
    store.search = (q, k, o) => { capturedLimit = k; return realSearch(q, k, o); };
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.85), limit: 3 });
    assert.equal(capturedLimit, 3);
  });

  it('default limit is DEFAULT_DUPLICATE_LIMIT when unspecified', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    let capturedLimit;
    const realSearch = store.search.bind(store);
    store.search = (q, k, o) => { capturedLimit = k; return realSearch(q, k, o); };
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.equal(capturedLimit, DEFAULT_DUPLICATE_LIMIT);
  });

  // 7. Fail-open — a throwing embedder yields [], no throw escapes.
  it('fail-open: a throwing embedder resolves [] (does not reject)', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    const embedder = async () => { throw new Error('embed blew up'); };
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
  });

  it('fail-open: a throwing store.search resolves []', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    store.search = () => { throw new Error('search blew up'); };
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
  });

  it('fail-open: a store.search returning a non-array resolves []', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    store.search = () => ({ not: 'an array' });
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
  });

  it('fail-open: a throwing getSetting resolves []', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const getSetting = () => { throw new Error('getSetting blew up'); };
    const out = await checkDuplicate('q', { store, embedder, getSetting });
    assert.deepEqual(out, []);
  });

  // 8. A non-finite resolved threshold RE-DEFAULTS to the shipped 0.85 (mirrors
  //    conflict-detect's DEFAULT_CONFLICT_THRESHOLD fallback) rather than silently
  //    DISABLING duplicate detection. A typo'd threshold ("high" → NaN, or an
  //    explicit undefined) must not kill the guard — it falls back to 0.85.
  it('non-finite threshold re-defaults to 0.85: an explicit garbage ("high") threshold still flags a near-duplicate', async () => {
    const store = buildStore([{ planPath: 'plans/existing.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['near-identical draft', AXIS_X]]));
    // getSetting yields the raw string "high" → Number("high") === NaN (non-finite).
    const out = await checkDuplicate('near-identical draft', {
      store,
      embedder,
      getSetting: stubGetSetting('high'),
    });
    assert.equal(out.length, 1, 'the near-duplicate is flagged at the 0.85 fallback (not silently disabled)');
    assert.equal(out[0].plan, 'plans/existing.md');
    assert.ok(out[0].similarity >= 0.85, `flagged at the cosine-scale 0.85 fallback, got ${out[0].similarity}`);
    assert.equal(embedder.calls.length, 1, 'the draft is embedded once (the guard is NOT short-circuited)');
  });

  it('undefined threshold re-defaults to 0.85 and flags a near-identical draft', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(undefined) });
    assert.equal(out.length, 1, 'undefined threshold → 0.85 fallback → cosine 1.0 flags');
    assert.equal(out[0].plan, 'plans/a.md');
  });

  it('NaN threshold re-defaults to 0.85: a BELOW-0.85 cosine match is still suppressed (pins the fallback value)', async () => {
    // A store plan at cosine 0.5 to the query — under the 0.85 fallback it must be
    // dropped. This pins the fallback at exactly 0.85 (a lower fallback would flag it).
    const COS_050 = [0.5, Math.sqrt(1 - 0.5 * 0.5), 0, 0, 0, 0, 0, 0];
    const store = buildStore([{ planPath: 'plans/a.md', vec: COS_050 }]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(NaN) });
    assert.deepEqual(out, [], 'NaN → 0.85 fallback → a 0.5 cosine match is below threshold → []');
  });

  // Results carrying a non-finite score are dropped before comparison.
  it('drops results whose score is non-finite', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }, { planPath: 'plans/b.md', vec: AXIS_X }]);
    // Force one hit to carry a NaN score and the other a valid 0.9.
    store.search = () => ([
      { planPath: 'plans/a.md', sectionId: PLAN_SENTINEL, score: Number.NaN },
      { planPath: 'plans/b.md', sectionId: PLAN_SENTINEL, score: 0.9 },
    ]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('q', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, [{ plan: 'plans/b.md', similarity: 0.9 }]);
  });

  // 9. Non-string / empty draftSummary yields [] WITHOUT embedding.
  it('null draftSummary → [] and the embedder is NEVER called', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate(null, { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(embedder.calls.length, 0);
  });

  it('empty-string draftSummary → [] and the embedder is NEVER called', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(embedder.calls.length, 0);
  });

  it('whitespace-only draftSummary → [] and the embedder is NEVER called', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate('   \n\t ', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(embedder.calls.length, 0);
  });

  it('non-string (number) draftSummary → [] and the embedder is NEVER called', async () => {
    const store = buildStore([{ planPath: 'plans/a.md', vec: AXIS_X }]);
    const embedder = stubEmbedder(new Map([['q', AXIS_X]]));
    const out = await checkDuplicate(42, { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(embedder.calls.length, 0);
  });

  it('called with no options at all does not throw (resolves [] fail-open)', async () => {
    // No injected deps → lazy-requires getWiring + the real getSetting. In a bare
    // test cwd the index is empty / unavailable, so it fail-opens to []. The
    // contract we assert: it never throws and always yields an array.
    const out = await checkDuplicate('some draft summary text');
    assert.ok(Array.isArray(out));
  });
});

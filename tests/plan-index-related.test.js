'use strict';

/**
 * PI4-s3 — related() surfacing + index.js public barrel tests.
 *
 * Two things are proven here, hermetically (no Ollama, no network, no live
 * model):
 *
 *  1. `related(planSlug, opts)` — nearest-neighbour plan surfacing SEEDED FROM
 *     the plan's already-stored `__plan__` embedding. The load-bearing invariant
 *     is NO RE-EMBED on the common path: an INDEXED plan's related list is
 *     computed from `store.getUnit(slug, '__plan__').embedding` fed straight into
 *     `store.search(vec, limit, { excludePlanPath: slug, kind })`. The injected
 *     embedder is a SPY whose call count MUST stay 0 on the seeded path (that is
 *     the whole point of the seed-from-stored-vector ADR). Self-exclusion is
 *     `store.search`'s `excludePlanPath`, so the seed plan never appears in its
 *     own list. `kind` passes straight through for PI6. Fail-open: null store,
 *     empty index, or absent-with-no-embedder → `[]` (never a throw into the
 *     caller — the overview/inbox render must never crash).
 *
 *  2. Barrel Integrity — after the additive PI4 edit, EVERY pre-PI4 export of
 *     `src/lib/plan-index/index.js` still resolves (openStore, PLAN_SENTINEL,
 *     getWiring, probeEmbeddingSource, kickBackfillBackground, isBackfillNeeded)
 *     AND the two new ones (search, related) resolve — with no circular-dependency
 *     warning emitted when the barrel loads.
 *
 * Store construction is a REAL `openStore` over a temp JSON (the cleanest
 * hermetic store — the real cosine, the real getUnit/search/size), populated by
 * upserting the deterministic 8-dim fixture vectors. A tiny stub store (matching
 * the real signature) drives the null/empty/absent-seed branches.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { related, DEFAULT_RELATED_LIMIT } = require('../src/lib/plan-index/related');
const { openStore, PLAN_SENTINEL } = require('../src/lib/plan-index/store');

// ── fixture (reuse s2's deterministic hand-authored vectors) ─────────────────────

const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'plan-index', 'search-fixture.json'),
    'utf8'
  )
);

/** The `cluster` group of a fixture plan by planPath (0=ps*, 1=ah*, 2=qg*). */
function clusterOf(planPath) {
  const p = FIXTURE.plans.find((x) => x.planPath === planPath);
  return p ? p.cluster : undefined;
}

// ── a real openStore over a fresh temp JSON, populated with the fixture ──────────

let tmpDirs = [];

/**
 * Build a REAL PI1 store on a throwaway temp dir, upserting every fixture plan as
 * its `__plan__` unit (optionally overriding which planPaths to include).
 * @param {{ only?: string[] }} [opts]
 */
function realStoreWithFixture(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi4-related-'));
  tmpDirs.push(dir);
  const store = openStore(path.join(dir, 'plan-index.json'));
  const include = opts.only
    ? FIXTURE.plans.filter((p) => opts.only.includes(p.planPath))
    : FIXTURE.plans;
  for (const p of include) {
    store.upsertUnit({
      planPath: p.planPath,
      sectionId: p.sectionId, // '__plan__'
      kind: p.kind, // 'plan'
      text: p.text,
      files: p.files.slice(),
      contentHash: p.planPath, // opaque, non-empty
      embedding: Float32Array.from(p.embedding),
    });
  }
  return store;
}

test.after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  tmpDirs = [];
});

// ── an embedder SPY (the no-re-embed proof hinges on its call count) ──────────────

/**
 * Records every call. On the seeded path it must NEVER be invoked. On the
 * text-seeded fallback path it is invoked exactly once (via s2 `search`), so we
 * hand back a usable query vector for the requested text: we reuse the seed
 * plan's OWN embedding so the fallback still returns sensible neighbours.
 * @param {Map<string, number[]>} [textToVec] optional slug/text → embedding
 */
function makeSpyEmbedder(textToVec = new Map()) {
  const calls = [];
  const embedder = async (texts) => {
    calls.push(texts);
    return {
      vectors: texts.map((t) => {
        const v = textToVec.get(t);
        // Fallback vector: an arbitrary but valid 8-dim unit vector when unmapped,
        // so s2's KNN still runs; tests that exercise the fallback map explicitly.
        return Float32Array.from(v || [1, 0, 0, 0, 0, 0, 0, 0]);
      }),
      source: 'spy',
    };
  };
  embedder.calls = calls;
  return embedder;
}

// ── a minimal stub store matching the REAL signature (for null/empty/absent) ──────

/**
 * Hand-rolled store implementing exactly the surface `related` touches:
 * `getUnit(planPath, sectionId)`, `search(qVec, k, {kind, excludePlanPath})`,
 * a `size` getter, plus the `listPlanPaths`/`listUnitSectionIds` that s2's
 * fallback enumerates. `units` is an array of view-shaped records.
 */
function stubStore(units) {
  function l2(v) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); }
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  const store = {
    getUnit(planPath, sectionId) {
      const rec = units.find((u) => u.planPath === planPath && u.sectionId === sectionId);
      return rec ? { ...rec, embedding: Float32Array.from(rec.embedding), files: (rec.files || []).slice() } : null;
    },
    search(qVec, k, o = {}) {
      if (!(qVec instanceof Float32Array)) throw new TypeError('stub store: qVec must be Float32Array');
      const limit = Number.isInteger(k) && k > 0 ? k : 0;
      if (limit === 0) return [];
      const qn = l2(qVec);
      if (qn === 0) return [];
      const out = [];
      for (const rec of units) {
        if (o.kind && rec.kind !== o.kind) continue;
        if (o.excludePlanPath && rec.planPath === o.excludePlanPath) continue;
        const rn = l2(rec.embedding);
        const score = rn === 0 ? 0 : dot(qVec, rec.embedding) / (qn * rn);
        if (o.minScore != null && score < o.minScore) continue;
        out.push({ ...rec, embedding: Float32Array.from(rec.embedding), score });
      }
      out.sort((a, b) => b.score - a.score);
      return out.slice(0, limit);
    },
    listPlanPaths() { return [...new Set(units.map((u) => u.planPath))]; },
    listUnitSectionIds(planPath) { return units.filter((u) => u.planPath === planPath).map((u) => u.sectionId); },
  };
  Object.defineProperty(store, 'size', { get: () => units.length });
  return store;
}

/** view-shaped fixture record for a planPath (for the stub store). */
function fixtureUnit(planPath) {
  const p = FIXTURE.plans.find((x) => x.planPath === planPath);
  return {
    planPath: p.planPath, sectionId: p.sectionId, kind: p.kind, text: p.text,
    files: p.files.slice(), contentHash: p.planPath, embedding: Float32Array.from(p.embedding),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Group A — related() correctness (seeded from __plan__ vector, self-excluded)
// ═══════════════════════════════════════════════════════════════════════════════

test('RL-A1 seeded from stored __plan__ vector: excludes self, ranks same-cluster siblings, score-desc', async () => {
  const store = realStoreWithFixture();
  const embedder = makeSpyEmbedder();
  const seed = 'plans/ps1-sync-state.md'; // cluster 0
  const results = await related(seed, { store, embedder });

  assert.ok(Array.isArray(results), 'returns an array');
  assert.ok(results.length > 0, 'returns neighbours');
  // Self-exclusion: the seed plan is NEVER in its own related list.
  assert.ok(!results.some((r) => r.planPath === seed), 'seed plan excluded from its own related list');
  // Scores strictly non-increasing (cosine-desc).
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score, `score-desc at ${i}`);
  }
  // The nearest neighbour is a same-cluster sibling (ps* cluster 0), because the
  // seed's stored vector shares cluster 0's dominant axis.
  assert.equal(clusterOf(results[0].planPath), clusterOf(seed), 'rank-1 neighbour is same-cluster');
});

test('RL-A2 NO RE-EMBED on the seeded path: the injected embedder is NEVER called', async () => {
  const store = realStoreWithFixture();
  const embedder = makeSpyEmbedder();
  await related('plans/ah2-pretool-hook.md', { store, embedder });
  // The whole ADR: an already-indexed plan reuses its stored __plan__ vector —
  // it must NOT trigger an embed.
  assert.equal(embedder.calls.length, 0, 'embedder call count is exactly 0 on the seeded path');
});

test('RL-A3 default limit is DEFAULT_RELATED_LIMIT (5)', async () => {
  const store = realStoreWithFixture(); // 10 plans → 9 possible neighbours
  const embedder = makeSpyEmbedder();
  const results = await related('plans/ps1-sync-state.md', { store, embedder });
  assert.equal(DEFAULT_RELATED_LIMIT, 5, 'constant is 5 (parent NFR top-5)');
  assert.ok(results.length <= DEFAULT_RELATED_LIMIT, `≤ default limit, got ${results.length}`);
  assert.equal(embedder.calls.length, 0, 'still no re-embed');
});

test('RL-A4 explicit limit is honoured', async () => {
  const store = realStoreWithFixture();
  const embedder = makeSpyEmbedder();
  const results = await related('plans/ps1-sync-state.md', { store, embedder, limit: 2 });
  assert.ok(results.length <= 2, `≤ explicit limit 2, got ${results.length}`);
});

test('RL-A5 kind:section passthrough — only section-kind units surface', async () => {
  // Seed plan has a __plan__ unit AND a section unit; a sibling has a section unit
  // in the same section-space. With kind:'section' the seed still resolves via its
  // stored plan vector, but store.search is restricted to kind:'section'.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi4-related-kind-'));
  tmpDirs.push(dir);
  const store = openStore(path.join(dir, 'plan-index.json'));
  const base = { contentHash: 'h', files: [] };
  // seed plan-level unit (cluster-0 axis)
  store.upsertUnit({ planPath: 'plans/seed.md', sectionId: PLAN_SENTINEL, kind: 'plan', text: 's', embedding: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]), ...base });
  // a section unit on ANOTHER plan, same axis → should surface under kind:'section'
  store.upsertUnit({ planPath: 'plans/other.md', sectionId: 'goals', kind: 'section', text: 'g', embedding: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]), ...base });
  // a plan-level unit on another plan, same axis → must NOT surface under kind:'section'
  store.upsertUnit({ planPath: 'plans/decoy.md', sectionId: PLAN_SENTINEL, kind: 'plan', text: 'd', embedding: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]), ...base });

  const embedder = makeSpyEmbedder();
  const results = await related('plans/seed.md', { store, embedder, kind: 'section' });
  assert.ok(results.length > 0, 'section neighbours surface');
  assert.ok(results.every((r) => r.kind === 'section'), 'every result is kind:section');
  assert.ok(!results.some((r) => r.planPath === 'plans/decoy.md'), 'plan-kind decoy excluded by kind filter');
  assert.equal(embedder.calls.length, 0, 'seeded from stored vector, still no re-embed');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group B — fail-open (empty / single / null store / absent seed)
// ═══════════════════════════════════════════════════════════════════════════════

test('RL-B1 no neighbours (single-plan index) → [] and no throw', async () => {
  const store = realStoreWithFixture({ only: ['plans/ps1-sync-state.md'] });
  const embedder = makeSpyEmbedder();
  const results = await related('plans/ps1-sync-state.md', { store, embedder });
  assert.deepEqual(results, [], 'single-plan index → empty related list (self excluded)');
  assert.equal(embedder.calls.length, 0, 'seed found → still no embed');
});

test('RL-B2 empty index (size 0) → [] and no embed', async () => {
  const store = stubStore([]); // size 0
  const embedder = makeSpyEmbedder();
  const results = await related('plans/anything.md', { store, embedder });
  assert.deepEqual(results, [], 'empty index → []');
  assert.equal(embedder.calls.length, 0, 'no embed on empty-index guard');
});

test('RL-B3 null store → [] and no throw (fail-open, injected null store)', async () => {
  const results = await related('plans/x.md', { store: null, embedder: makeSpyEmbedder() });
  assert.deepEqual(results, [], 'null store → []');
});

test('RL-B4 absent seed with NO embedder → [] (cannot embed the fallback, degrade to empty, no throw)', async () => {
  // A store that has units but no __plan__ unit for the requested slug, and no
  // embedder to run the text-seeded fallback → fail-open empty, never a throw.
  // Inject `embedder: null` (not `undefined`) so `related` does NOT fall through
  // to `getWiring` and pick up the ambient project embedder — we are asserting the
  // no-embedder degrade path explicitly.
  const store = stubStore([fixtureUnit('plans/ps1-sync-state.md')]);
  const results = await related('plans/not-indexed.md', { store, embedder: null });
  assert.deepEqual(results, [], 'absent seed + no usable embedder → []');
});

test('RL-B5 absent seed WITH embedder → text-seeded fallback embeds exactly once and returns neighbours', async () => {
  // The requested plan has no __plan__ unit; the fallback embeds the slug text and
  // KNN-searches. Map the slug to cluster-0's axis so the fallback surfaces ps* plans.
  const store = stubStore([
    fixtureUnit('plans/ps1-sync-state.md'),
    fixtureUnit('plans/ps2-state-machine.md'),
    fixtureUnit('plans/qg1-coverage.md'),
  ]);
  const slug = 'plans/brand-new.md';
  const embedder = makeSpyEmbedder(new Map([[slug, [1, 0, 0, 0, 0, 0, 0, 0]]]));
  const results = await related(slug, { store, embedder });
  assert.equal(embedder.calls.length, 1, 'fallback embeds the slug text exactly once');
  assert.ok(results.length > 0, 'fallback returns neighbours');
  assert.ok(!results.some((r) => r.planPath === slug), 'fallback still self-excludes the seed slug');
});

test('RL-B6 seeded path where store.search THROWS → [] (fail-open, never crashes the caller)', async () => {
  // A store that HAS the seed unit (so the seeded path runs) but whose search()
  // throws (e.g. a dimension mismatch) must degrade to [], not propagate.
  const seedRec = fixtureUnit('plans/ps1-sync-state.md');
  const store = {
    getUnit(p, s) { return (p === seedRec.planPath && s === seedRec.sectionId)
      ? { ...seedRec, embedding: Float32Array.from(seedRec.embedding) } : null; },
    search() { throw new Error('boom: simulated store.search failure'); },
  };
  Object.defineProperty(store, 'size', { get: () => 1 });
  const results = await related('plans/ps1-sync-state.md', { store, embedder: makeSpyEmbedder() });
  assert.deepEqual(results, [], 'store.search throw on the seeded path degrades to []');
});

test('RL-B7 fallback path where s2 search THROWS → [] (fail-open on the fallback too)', async () => {
  // No seed unit → fallback path; a store whose search() throws makes s2 degrade,
  // and even if s2 itself threw, related() catches and returns []. Force the throw
  // by handing s2 a store with NO listPlanPaths/getUnit consistency AND a throwing
  // search — but with size>0 and no seed so we reach the fallback.
  const store = {
    getUnit() { return null; },        // no __plan__ seed → fallback
    listPlanPaths() { return ['plans/x.md']; },
    listUnitSectionIds() { return []; },
    getUnitBad: true,
    search() { throw new Error('boom: fallback store.search failure'); },
  };
  Object.defineProperty(store, 'size', { get: () => 1 });
  const embedder = makeSpyEmbedder(new Map([['plans/new.md', [1, 0, 0, 0, 0, 0, 0, 0]]]));
  const results = await related('plans/new.md', { store, embedder });
  // s2 catches its own store.search throw (degrades to BM25-only), so this may be a
  // non-empty array of BM25 hits OR []; the invariant is that related NEVER throws.
  assert.ok(Array.isArray(results), 'fallback never throws; returns an array');
});

test('RL-B8 store/embedder resolved via getWiring when not injected (no throw, returns array)', async () => {
  // Neither store nor embedder injected → related() lazy-requires getWiring. In this
  // real CTOC project that resolves a real (possibly empty) store; the invariant is
  // it never throws and always yields an array.
  const results = await related('plans/definitely-not-a-real-plan-xyz.md', {});
  assert.ok(Array.isArray(results), 'wiring-resolved path returns an array, never throws');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group C — input validation
// ═══════════════════════════════════════════════════════════════════════════════

test('RL-C1 non-string planSlug throws TypeError', async () => {
  await assert.rejects(() => related(42, { store: stubStore([]) }), TypeError);
  await assert.rejects(() => related(null, { store: stubStore([]) }), TypeError);
  await assert.rejects(() => related(undefined, { store: stubStore([]) }), TypeError);
});

test('RL-C2 empty-string planSlug throws TypeError', async () => {
  await assert.rejects(() => related('', { store: stubStore([]) }), TypeError);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group D — Barrel Integrity (parent's named invariant)
// ═══════════════════════════════════════════════════════════════════════════════

test('RL-D1 Barrel Integrity: ALL six pre-PI4 exports STILL resolve after the additive edit', () => {
  // Fresh, uncached require to observe the barrel exactly as a consumer would.
  delete require.cache[require.resolve('../src/lib/plan-index/index.js')];
  const barrel = require('../src/lib/plan-index');

  // Eager pre-PI4 exports.
  assert.equal(typeof barrel.openStore, 'function', 'openStore still a function');
  assert.equal(barrel.PLAN_SENTINEL, '__plan__', 'PLAN_SENTINEL still __plan__');

  // Lazy pre-PI4 getters (PI0 composition-root re-exports) — each fail-open, so it
  // resolves to a function on a healthy tree (undefined only if the submodule is broken).
  assert.equal(typeof barrel.getWiring, 'function', 'getWiring still resolves');
  assert.equal(typeof barrel.probeEmbeddingSource, 'function', 'probeEmbeddingSource still resolves');
  assert.equal(typeof barrel.kickBackfillBackground, 'function', 'kickBackfillBackground still resolves');
  assert.equal(typeof barrel.isBackfillNeeded, 'function', 'isBackfillNeeded still resolves');
});

test('RL-D2 Barrel Integrity: the two NEW PI4 exports (search, related) resolve as functions', () => {
  delete require.cache[require.resolve('../src/lib/plan-index/index.js')];
  const barrel = require('../src/lib/plan-index');
  assert.equal(typeof barrel.search, 'function', 'search resolves through the barrel');
  assert.equal(typeof barrel.related, 'function', 'related resolves through the barrel');
});

test('RL-D3 Barrel Integrity: barrel through-call works end-to-end (related via the public surface)', async () => {
  const store = realStoreWithFixture();
  const embedder = makeSpyEmbedder();
  const barrel = require('../src/lib/plan-index');
  const results = await barrel.related('plans/qg1-coverage.md', { store, embedder });
  assert.ok(Array.isArray(results) && results.length > 0, 'related() callable through the barrel');
  assert.equal(clusterOf(results[0].planPath), clusterOf('plans/qg1-coverage.md'), 'same-cluster neighbour via barrel');
});

test('RL-D4 Barrel Integrity: loading the barrel emits NO circular-dependency warning', () => {
  const seen = [];
  const orig = process.emitWarning;
  process.emitWarning = (warning, ...rest) => { seen.push(String(warning)); return orig.call(process, warning, ...rest); };
  try {
    delete require.cache[require.resolve('../src/lib/plan-index/index.js')];
    const barrel = require('../src/lib/plan-index');
    // Touch every export so any lazy getter that would cycle fires now.
    void barrel.openStore; void barrel.PLAN_SENTINEL; void barrel.getWiring;
    void barrel.probeEmbeddingSource; void barrel.kickBackfillBackground;
    void barrel.isBackfillNeeded; void barrel.search; void barrel.related;
  } finally {
    process.emitWarning = orig;
  }
  assert.ok(
    !seen.some((w) => /circular|cycle/i.test(w)),
    `no circular-dependency warning on barrel load; saw: ${JSON.stringify(seen)}`
  );
});

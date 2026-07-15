'use strict';

/**
 * related-coverage.test.js — DARK-BRANCH coverage for src/lib/plan-index/related.js.
 *
 * Companion to tests/plan-index-related.test.js. That file proves the happy
 * seeded/fallback paths, self-exclusion, and barrel integrity. This file targets
 * ONLY the branches that survive in that suite — every test here pins a decision
 * that goes RED when the production code is mutated, so line coverage is a
 * by-product of mutation-killing, not the goal.
 *
 * Branches under fire (uncovered in the companion suite):
 *   • lines 94-95  — the `catch` when `require('./wiring')` / `getWiring(...)` throws
 *                    while resolving deps (fail-open → []).
 *   • line 92      — the `|| {}` SECOND operand (getWiring returns a falsy wiring).
 *   • line 101     — the MIDDLE operand `typeof store.size !== 'number'` of the
 *                    empty/unavailable guard (a truthy store with a non-number size).
 *   • line 110     — the `: null` arm (store has size but NO `getUnit` fn).
 *   • line 112     — the seed AND-chain boundary: seed present but `embedding` is
 *                    NOT a Float32Array, and present-but-length-0 → fall to fallback.
 *   • line 116     — the `: []` arm (seeded path, `store.search` returns a non-array).
 *   • lines 142-143 — the fallback `catch` (s2 `search` THROWS, not just degrades).
 *   • line 140     — the `: []` arm (s2 `search` resolves a NON-array).
 *   • line 56      — normalizeLimit `Number.isInteger(limit) && limit > 0` boundary
 *                    (0 / negative / float / string all fall to DEFAULT, not through).
 *
 * All doubles are fakes at the TRUE boundary: the injected `store`/`embedder`, and
 * — only where a branch cannot be reached any other way — a fake `./wiring` /
 * `./search` module swapped into `require.cache` and restored in `finally`. No core
 * ranking/threshold logic is mocked; the real cosine/limit decisions run.
 *
 * Human-reviewed: every assertion below was read line-by-line against related.js.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { related, DEFAULT_RELATED_LIMIT } = require('../src/lib/plan-index/related');
const { openStore, PLAN_SENTINEL } = require('../src/lib/plan-index/store');

// Absolute filenames of the two modules related.js lazy-requires. Node caches by
// resolved absolute path, so these are the exact keys `require('./wiring')` /
// `require('./search')` inside related.js will hit — swapping them here reroutes it.
const WIRING_PATH = require.resolve('../src/lib/plan-index/wiring');
const SEARCH_PATH = require.resolve('../src/lib/plan-index/search');

// ── fixture (deterministic 8-dim vectors; no Ollama / no network) ────────────────

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-index', 'search-fixture.json'), 'utf8')
);

let tmpDirs = [];

/** A REAL PI1 store on a throwaway temp dir, upserting the fixture plans. */
function realStoreWithFixture(only) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'related-cov-'));
  tmpDirs.push(dir);
  const store = openStore(path.join(dir, 'plan-index.json'));
  const plans = only ? FIXTURE.plans.filter((p) => only.includes(p.planPath)) : FIXTURE.plans;
  for (const p of plans) {
    store.upsertUnit({
      planPath: p.planPath,
      sectionId: p.sectionId,
      kind: p.kind,
      text: p.text,
      files: p.files.slice(),
      contentHash: p.planPath,
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

/** An embedder SPY: records every call; maps text→vector, else a unit axis-0 vector. */
function spyEmbedder(map = new Map()) {
  const calls = [];
  const embedder = async (texts) => {
    calls.push(texts);
    return {
      vectors: texts.map((t) => Float32Array.from(map.get(t) || [1, 0, 0, 0, 0, 0, 0, 0])),
      source: 'spy',
    };
  };
  embedder.calls = calls;
  return embedder;
}

/**
 * A cosine stub store matching the real handle surface, but which does NOT coerce
 * embeddings (so a caller can seed a deliberately malformed embedding) and SKIPS
 * any unit whose embedding is not a non-empty Float32Array during KNN.
 */
function cosineStubStore(units) {
  const l2 = (v) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); };
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const store = {
    getUnit(pp, sid) {
      const r = units.find((u) => u.planPath === pp && u.sectionId === sid);
      return r ? { ...r } : null;
    },
    search(q, k, o = {}) {
      if (!(q instanceof Float32Array)) throw new TypeError('stub: qVec must be Float32Array');
      const lim = Number.isInteger(k) && k > 0 ? k : 0;
      if (lim === 0) return [];
      const qn = l2(q);
      if (qn === 0) return [];
      const out = [];
      for (const r of units) {
        if (o.kind && r.kind !== o.kind) continue;
        if (o.excludePlanPath && r.planPath === o.excludePlanPath) continue;
        const emb = r.embedding;
        if (!(emb instanceof Float32Array) || emb.length === 0) continue;
        const rn = l2(emb);
        out.push({ ...r, score: rn === 0 ? 0 : dot(q, emb) / (qn * rn) });
      }
      out.sort((a, b) => b.score - a.score);
      return out.slice(0, lim);
    },
    listPlanPaths() { return [...new Set(units.map((u) => u.planPath))]; },
    listUnitSectionIds(pp) { return units.filter((u) => u.planPath === pp).map((u) => u.sectionId); },
  };
  Object.defineProperty(store, 'size', { get: () => units.length });
  return store;
}

/** Swap an absolute module path in require.cache for `fakeExports`, restore after. */
async function withFakeModule(absPath, fakeExports, fn) {
  const original = require.cache[absPath];
  require.cache[absPath] = {
    id: absPath, filename: absPath, loaded: true, exports: fakeExports, children: [], paths: [],
  };
  try {
    return await fn();
  } finally {
    if (original) require.cache[absPath] = original;
    else delete require.cache[absPath];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Group E — dep-resolution branches (wiring require/getWiring throw + `|| {}`)
// ═══════════════════════════════════════════════════════════════════════════════

test('RLC-E1 getWiring THROWS while resolving deps → caught, degrades to [] (lines 94-95)', async () => {
  // Arrange — no store/embedder injected, so related() lazy-requires ./wiring; the
  // faked module's getWiring throws. The catch must swallow it and fail open to [].
  await withFakeModule(WIRING_PATH, { getWiring() { throw new Error('boom: wiring blew up'); } }, async () => {
    // Act
    const results = await related('plans/anything.md', {});

    // Assert — the throw was caught (no rejection) and the guard returned [].
    assert.deepEqual(results, [], 'a throwing getWiring degrades to [] instead of crashing the caller');
  });
});

test('RLC-E2 getWiring returns a falsy wiring → `|| {}` second operand → [] (line 92)', async () => {
  // Arrange — getWiring resolves to null; the `getWiring(...) || {}` must fall to {},
  // leaving store undefined → the empty guard returns []. Without the `|| {}` the code
  // would dereference `null.store` and throw.
  await withFakeModule(WIRING_PATH, { getWiring() { return null; } }, async () => {
    // Act
    const results = await related('plans/anything.md', {});

    // Assert
    assert.deepEqual(results, [], 'a falsy wiring is replaced by {} → no throw → []');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group F — the empty/unavailable guard's non-obvious operands
// ═══════════════════════════════════════════════════════════════════════════════

test('RLC-F1 truthy store with a NON-number size → [] via the middle guard operand (line 101)', async () => {
  // Arrange — a store that is truthy AND has a seed AND a populated search(), but whose
  // `size` is not a number. ONLY the `typeof store.size !== 'number'` operand can stop
  // it; if that operand were dropped, the seeded path would run and return a neighbour.
  const slug = 'plans/seed.md';
  const seedRec = { planPath: slug, sectionId: PLAN_SENTINEL, kind: 'plan', text: 's', files: [], embedding: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]) };
  const store = {
    size: 'not-a-number',
    getUnit(pp, sid) { return pp === slug && sid === PLAN_SENTINEL ? { ...seedRec } : null; },
    search() { return [{ planPath: 'plans/neighbour.md', sectionId: PLAN_SENTINEL, kind: 'plan', score: 1 }]; },
  };

  // Act
  const results = await related(slug, { store, embedder: spyEmbedder() });

  // Assert — the non-number size trips the guard; the seeded neighbour must NOT appear.
  assert.deepEqual(results, [], 'non-number size fails the guard before any ranking runs');
});

test('RLC-F2 store has a size but NO getUnit fn → seed resolves null, fallback runs (line 110 `: null`)', async () => {
  // Arrange — size>0 but no getUnit: the `typeof store.getUnit === 'function' ? … : null`
  // must choose the null arm (a mutant that calls store.getUnit unconditionally throws
  // "not a function"). No listPlanPaths/search either → s2 degrades → [].
  const store = { size: 1 };
  Object.defineProperty(store, 'size', { get: () => 1 });
  const embedder = spyEmbedder();

  // Act
  const results = await related('plans/x.md', { store, embedder });

  // Assert — reached the text-seeded fallback (embedded once) and failed open to [].
  assert.deepEqual(results, [], 'absent getUnit → seed null → fallback → []');
  assert.equal(embedder.calls.length, 1, 'fallback embedded exactly once (seeded path was NOT taken)');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group G — the seed AND-chain boundary (line 112) — malformed stored embedding
// ═══════════════════════════════════════════════════════════════════════════════

for (const row of [
  { id: 'embedding-not-Float32Array', embedding: [1, 0, 0, 0, 0, 0, 0, 0] },   // instanceof fails
  { id: 'embedding-length-0', embedding: Float32Array.from([]) },              // length > 0 fails
]) {
  test(`RLC-G ${row.id}: seed present but unusable embedding falls through to the text-seeded fallback (line 112)`, async () => {
    // Arrange — the seed unit EXISTS, so a mutant that drops the `instanceof` /
    // `length > 0` guard would take the seeded path and call store.search (never the
    // embedder). Valid neighbours exist so the fallback can surface something.
    const slug = 'plans/half-indexed.md';
    const units = [
      { planPath: slug, sectionId: PLAN_SENTINEL, kind: 'plan', text: 'half indexed seed', files: [], embedding: row.embedding },
      { planPath: 'plans/n1.md', sectionId: PLAN_SENTINEL, kind: 'plan', text: 'neighbour one alpha', files: [], embedding: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]) },
      { planPath: 'plans/n2.md', sectionId: PLAN_SENTINEL, kind: 'plan', text: 'neighbour two beta', files: [], embedding: Float32Array.from([0.9, 0.1, 0, 0, 0, 0, 0, 0]) },
    ];
    const store = cosineStubStore(units);
    const embedder = spyEmbedder(new Map([[slug, [1, 0, 0, 0, 0, 0, 0, 0]]]));

    // Act
    const results = await related(slug, { store, embedder });

    // Assert — the embedder ran exactly once → the fallback (not the seeded path) fired.
    assert.equal(embedder.calls.length, 1, 'unusable stored embedding forces the text-seeded fallback (1 embed)');
    assert.ok(results.length > 0, 'fallback still surfaces neighbours');
    assert.ok(!results.some((r) => r.planPath === slug), 'seed slug excluded from its own list');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Group H — seeded path where store.search returns a NON-array (line 116 `: []`)
// ═══════════════════════════════════════════════════════════════════════════════

test('RLC-H1 seeded path, store.search returns a non-array → [] (line 116 `: []`)', async () => {
  // Arrange — a valid stored seed vector drives the seeded path, but store.search
  // hands back `null` instead of an array. `Array.isArray(hits) ? hits : []` must
  // choose []; a mutant returning `hits` directly would leak null to the caller.
  const slug = 'plans/seed.md';
  const store = {
    getUnit(pp, sid) {
      return pp === slug && sid === PLAN_SENTINEL
        ? { planPath: pp, sectionId: sid, kind: 'plan', text: 's', files: [], embedding: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]) }
        : null;
    },
    search() { return null; },
  };
  Object.defineProperty(store, 'size', { get: () => 1 });
  const embedder = spyEmbedder();

  // Act
  const results = await related(slug, { store, embedder });

  // Assert — non-array store.search result normalized to [], and no re-embed happened.
  assert.deepEqual(results, [], 'non-array store.search result becomes []');
  assert.equal(embedder.calls.length, 0, 'seeded path taken → embedder never called');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group I — fallback error arms (s2 search THROWS / resolves non-array)
// ═══════════════════════════════════════════════════════════════════════════════

test('RLC-I1 fallback where s2 search THROWS synchronously → [] (lines 142-143)', async () => {
  // Arrange — no seed → fallback. The store's listPlanPaths throws INSIDE s2.search
  // (before its own await, and s2 does not wrap collectUnits), so s2.search itself
  // rejects — exercising related()'s OWN fallback catch, which the companion suite's
  // store-search-throw case does not (s2 swallows a store.search throw internally).
  const store = {
    getUnit() { return null; },                       // no __plan__ seed → fallback
    listPlanPaths() { throw new Error('boom: listPlanPaths inside s2'); },
  };
  Object.defineProperty(store, 'size', { get: () => 1 });

  // Act
  const results = await related('plans/new.md', { store, embedder: spyEmbedder() });

  // Assert — related caught the propagated throw and failed open.
  assert.deepEqual(results, [], 's2 search throwing degrades related() to [] (no rejection)');
});

test('RLC-I2 fallback where s2 search resolves a NON-array → [] (line 140 `: []`)', async () => {
  // Arrange — no seed → fallback. Swap ./search for a fake that resolves `undefined`;
  // `Array.isArray(results) ? results : []` must choose []. A mutant returning the raw
  // value would leak undefined.
  const store = { getUnit() { return null; } };
  Object.defineProperty(store, 'size', { get: () => 1 });

  await withFakeModule(SEARCH_PATH, { search: async () => undefined, DEFAULT_SEARCH_LIMIT: 10 }, async () => {
    // Act
    const results = await related('plans/new.md', { store, embedder: spyEmbedder() });

    // Assert
    assert.deepEqual(results, [], 'a non-array s2 search result is normalized to []');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group J — normalizeLimit boundary (line 56): invalid limits fall to DEFAULT
// ═══════════════════════════════════════════════════════════════════════════════

for (const row of [
  { id: 'zero', limit: 0 },        // kills the `limit > 0` operand (0 would pass k=0 → [])
  { id: 'negative', limit: -4 },   // kills the `limit > 0` operand
  { id: 'float', limit: 2.5 },     // kills the `Number.isInteger` operand (2.5 → store k=0 → [])
  { id: 'string', limit: '3' },    // non-integer type → DEFAULT
]) {
  test(`RLC-J ${row.id}: invalid limit ${JSON.stringify(row.limit)} falls to DEFAULT_RELATED_LIMIT, not through (line 56)`, async () => {
    // Arrange — a real store with all 10 fixture plans (9 possible neighbours). If the
    // invalid limit leaked into store.search as k, the real store returns [] for k≤0
    // or non-integer k; only the DEFAULT (5) yields neighbours.
    const store = realStoreWithFixture();
    const embedder = spyEmbedder();

    // Act
    const results = await related('plans/ps1-sync-state.md', { store, embedder, limit: row.limit });

    // Assert — coerced to the default: non-empty AND capped at DEFAULT_RELATED_LIMIT.
    assert.ok(results.length > 0, `invalid limit coerced to default → neighbours returned (got ${results.length})`);
    assert.ok(results.length <= DEFAULT_RELATED_LIMIT, `still bounded by the default cap of ${DEFAULT_RELATED_LIMIT}`);
    assert.equal(embedder.calls.length, 0, 'seeded path → no re-embed regardless of limit shape');
  });
}

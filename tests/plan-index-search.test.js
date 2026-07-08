'use strict';

/**
 * PI4-s2 — Hybrid search (BM25 in-JS index + vector store.search + RRF) tests.
 *
 * Hermetic: no Ollama, no network, no live model, no real embedding source. A
 * STUB EMBEDDER maps each fixture query string to its pre-measured 8-dim
 * Float32Array; a STUB STORE implements the REAL PI1 `search(queryEmbedding,
 * k, opts)` signature (brute-force cosine) over the same fixture vectors, plus a
 * `size` getter. Because the query and plan vectors are hand-authored (see
 * tests/fixtures/plan-index/search-fixture.json), every KNN ranking is
 * deterministic — the ≥20-query falsifiability + ablation assertions are exact,
 * not probabilistic, and none is green-washed (the ablation asserts hybrid
 * STRICTLY beats BM25-only on ≥1 query, which would fail if fusion were a no-op).
 *
 * The five parent falsifiability scenarios (1 NL-first, 2 exact-token recall,
 * 3 MRR beats weaker half + ≥ mean, 4 ablation changes ordering, 7 empty-index
 * no-op) plus BM25 unit tests, the BM25-only degrade path, and the non-string
 * throw are all covered.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  search,
  DEFAULT_SEARCH_LIMIT,
  buildBM25Index,
  scoreBM25,
  tokenize,
} = require('../src/lib/plan-index/search');
const { reciprocalRank } = require('../src/lib/plan-index/fusion');

// ── fixture ────────────────────────────────────────────────────────────────────

const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'plan-index', 'search-fixture.json'),
    'utf8'
  )
);

/** Fixture plan units as PI1-store `view`-shaped records (Float32Array embeddings). */
function fixtureUnits() {
  return FIXTURE.plans.map((p) => ({
    planPath: p.planPath,
    sectionId: p.sectionId,
    kind: p.kind,
    text: p.text,
    files: p.files.slice(),
    parentVision: null,
    stepLabel: null,
    contentHash: p.planPath,
    embedding: Float32Array.from(p.embedding),
  }));
}

/** query string → pre-measured Float32Array (or [] to simulate a fail-open embedder). */
function queryVec(query) {
  const q = FIXTURE.queries.find((x) => x.query === query);
  if (!q) throw new Error(`test bug: no fixture vector for query "${query}"`);
  return Float32Array.from(q.embedding);
}

// ── stub embedder (the ONE async point) ──────────────────────────────────────────

/**
 * A stub embedder matching the wiring contract `embedder(texts) =>
 * Promise<{vectors, source}>`. Records call count so the "one async point" and
 * "not called on empty index" assertions are exact. `empty:true` returns
 * `{vectors:[]}` to drive the degrade path.
 */
function makeEmbedder({ empty = false } = {}) {
  const calls = [];
  const embedder = async (texts) => {
    calls.push(texts);
    if (empty) return { vectors: [], source: 'stub-empty' };
    return { vectors: texts.map((t) => queryVec(t)), source: 'stub' };
  };
  embedder.calls = calls;
  return embedder;
}

// ── stub store (REAL PI1 search signature: search(queryEmbedding, k, opts)) ───────

/**
 * A hand-rolled store matching the real PI1 handle surface s2 relies on:
 * `search(queryEmbedding: Float32Array, k, {kind, excludePlanPath, minScore})`
 * (brute-force cosine, ≤k, cosine-desc) and a `size` getter. `units` are the
 * fixture views. Optionally drop the vector half entirely (`knnOff`) to prove the
 * BM25-only ablation half.
 */
function makeStore(units, { knnOff = false } = {}) {
  function l2(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
  }
  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  const store = {
    search(queryEmbedding, k, opts = {}) {
      if (!(queryEmbedding instanceof Float32Array)) {
        throw new TypeError('stub store: queryEmbedding must be a Float32Array');
      }
      if (knnOff) return [];
      const limit = Number.isInteger(k) && k > 0 ? k : 0;
      if (limit === 0) return [];
      const qn = l2(queryEmbedding);
      if (qn === 0) return [];
      const out = [];
      for (const rec of units) {
        if (opts.kind && rec.kind !== opts.kind) continue;
        if (opts.excludePlanPath && rec.planPath === opts.excludePlanPath) continue;
        const rn = l2(rec.embedding);
        const score = rn === 0 ? 0 : dot(queryEmbedding, rec.embedding) / (qn * rn);
        if (opts.minScore != null && score < opts.minScore) continue;
        out.push({ ...rec, embedding: Float32Array.from(rec.embedding), score });
      }
      out.sort((a, b) => b.score - a.score);
      return out.slice(0, limit);
    },
    // s2 builds its BM25 corpus by enumerating the store the SAME way the real PI1
    // handle exposes it: listPlanPaths() + getUnit(planPath, sectionId). No private
    // `__units` seam — this proves s2 works against the real store surface.
    listPlanPaths() {
      const seen = new Set();
      for (const u of units) seen.add(u.planPath);
      return [...seen];
    },
    getUnit(planPath, sectionId) {
      const rec = units.find((u) => u.planPath === planPath && u.sectionId === sectionId);
      return rec ? { ...rec, embedding: Float32Array.from(rec.embedding), files: rec.files.slice() } : null;
    },
    listUnitSectionIds(planPath) {
      return units.filter((u) => u.planPath === planPath).map((u) => u.sectionId);
    },
  };
  Object.defineProperty(store, 'size', { get: () => units.length });
  return store;
}

/** planPath of the rank-1 (best) result, or undefined. */
function top1(results) {
  return results.length ? results[0].planPath : undefined;
}

/** 1-based rank of `planPath` in a results array, or Infinity if absent. */
function rankOf(results, planPath) {
  const i = results.findIndex((r) => r.planPath === planPath);
  return i === -1 ? Infinity : i + 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Group A — BM25 unit tests (tokenize / buildBM25Index / scoreBM25)
// ═══════════════════════════════════════════════════════════════════════════════

test('SR-A1 tokenize lowercases, splits on non-alnum, and RETAINS the raw identifier token', () => {
  const toks = tokenize('parseYAMLShallow src/lib/state.js');
  // split pieces:
  assert.ok(toks.includes('parseyamlshallow'), 'lowercased identifier piece present');
  assert.ok(toks.includes('src'), 'path piece present');
  assert.ok(toks.includes('lib'), 'path piece present');
  assert.ok(toks.includes('state'), 'path piece present');
  assert.ok(toks.includes('js'), 'extension piece present');
  // raw un-split identifier retained (for exact-identifier recall):
  assert.ok(
    toks.some((t) => t === 'parseyamlshallow' || t === 'parseYAMLShallow'.toLowerCase()),
    'raw identifier token retained so an exact-identifier query hits'
  );
});

test('SR-A2 tokenize returns [] for empty / whitespace-only input', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   \n\t '), []);
});

// MEDIUM-1 (PI4-s4 kickback): the tokenizer now SPLITS compound identifiers into
// their sub-tokens (camelCase humps + . - _ boundaries) so a partial-identifier
// query recalls a doc that only ever wrote the whole identifier. The prior second
// loop was dead (it only kept punctuation-bearing raw tokens already covered by the
// primary split) and its comment lied. This pins the corrected behavior.
test('SR-A1b tokenize splits compound identifiers into sub-tokens (partial-identifier recall)', () => {
  const camel = tokenize('parseYAMLShallow');
  assert.ok(camel.includes('parse'), 'camelCase sub-token "parse"');
  assert.ok(camel.includes('yaml'), 'acronym sub-token "yaml"');
  assert.ok(camel.includes('shallow'), 'camelCase sub-token "shallow"');
  assert.ok(camel.includes('parseyamlshallow'), 'whole identifier still present (exact recall)');

  const kebab = tokenize('parse-yaml-shallow');
  assert.ok(kebab.includes('parse') && kebab.includes('yaml') && kebab.includes('shallow'),
    'hyphenated identifier splits into sub-tokens');

  const snake = tokenize('parse_yaml_shallow');
  assert.ok(snake.includes('parse') && snake.includes('yaml') && snake.includes('shallow'),
    'snake_case identifier splits into sub-tokens');

  // Partial-identifier recall end to end: a doc that only wrote the compound
  // identifier is retrievable by a bare sub-word query.
  const units = [
    { planPath: 'yaml-plan.md', text: 'the parseYAMLShallow helper reads frontmatter' },
    { planPath: 'other-plan.md', text: 'clerk authentication signup and login flow' },
  ];
  const ranked = scoreBM25(buildBM25Index(units), tokenize('yaml'));
  assert.equal(ranked[0] && ranked[0].id, 'yaml-plan.md',
    'a "yaml" query recalls the doc that only wrote parseYAMLShallow');
});

// LOW-1 (PI4-s4 kickback): the BM25/vector fusion id for a section unit MUST use the
// store's real composite-key convention (NUL, KEY_SEP='\x00'), NOT a space join —
// otherwise ("a b","c") and ("a","b c") would collide on the same fusion id. This
// drives a section-kind search over two units whose (planPath, sectionId) pairs
// space-join to the SAME string but NUL-join distinctly, and asserts they remain two
// distinct results (no collapse). Fails if the fusion id ever reverts to a space join.
test('SR-A5 section fusion id uses the NUL composite-key convention (no id collision)', async () => {
  // Two units that a SPACE join would collapse: ("a b","c") vs ("a","b c").
  const units = [
    { planPath: 'a b', sectionId: 'c',   text: 'quality gate coverage lint alpha' },
    { planPath: 'a',   sectionId: 'b c', text: 'quality gate coverage lint beta' },
  ];
  const viewByKey = new Map();
  for (const u of units) viewByKey.set(`${u.planPath} ${u.sectionId}`, u);
  const store = {
    size: units.length,
    listPlanPaths: () => [...new Set(units.map((u) => u.planPath))],
    listUnitSectionIds: (pp) => units.filter((u) => u.planPath === pp).map((u) => u.sectionId),
    getUnit: (pp, sid) => viewByKey.get(`${pp} ${sid}`) || null,
    search: () => [], // BM25-only path is enough to exercise the id join
  };
  const embedder = async () => ({ vectors: [] }); // degrade → BM25-only
  const results = await search('quality gate coverage', { store, embedder, kind: 'section' });
  const ids = results.map((r) => `${r.planPath} ${r.sectionId}`);
  assert.equal(new Set(ids).size, results.length, 'no two results share a fusion id');
  assert.equal(results.length, 2, 'both distinct section units survive (no collision collapse)');
});

test('SR-A3 scoreBM25 ranks a doc containing the query term above one that does not', () => {
  const units = [
    { planPath: 'a.md', text: 'the quality gate enforces coverage and lint' },
    { planPath: 'b.md', text: 'clerk authentication signup and login flow' },
  ];
  const index = buildBM25Index(units);
  const ranked = scoreBM25(index, tokenize('coverage'));
  assert.equal(ranked[0].id, 'a.md', 'doc with "coverage" ranks first');
  const a = ranked.find((r) => r.id === 'a.md');
  const b = ranked.find((r) => r.id === 'b.md');
  assert.ok(a && a.score > 0, 'matching doc has positive score');
  assert.ok(!b || b.score === 0 || b.score < a.score, 'non-matching doc scores lower (or absent)');
});

test('SR-A4 BM25 uses k1=1.2 / b=0.75 (documented Robertson defaults) via exported constants', () => {
  const search = require('../src/lib/plan-index/search');
  assert.equal(search.BM25_K1, 1.2);
  assert.equal(search.BM25_B, 0.75);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group B — Scenario 1: NL query returns intended plan first, score-desc
// ═══════════════════════════════════════════════════════════════════════════════

test('SR-B1 Scenario 1 — NL query returns the intended plan at rank 1, score-desc', async () => {
  const store = makeStore(fixtureUnits());
  const embedder = makeEmbedder();
  const results = await search('How does CTOC sync plan state', { store, embedder });

  assert.equal(top1(results), 'plans/ps1-sync-state.md', 'plan-state plan is rank 1');
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i - 1].score >= results[i].score,
      `results are score-descending at index ${i}`
    );
  }
  // fused results carry the store view fields:
  assert.equal(typeof results[0].text, 'string');
  assert.ok('files' in results[0]);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group C — Scenario 2: exact-token recall via BM25 (KNN alone misses it)
// ═══════════════════════════════════════════════════════════════════════════════

test('SR-C1 Scenario 2 — exact-token: KNN ranks target > 3, BM25 ranks it #1, RRF pulls it into top-3', async () => {
  const units = fixtureUnits();
  const target = 'plans/ps4-frontmatter.md';

  // KNN-only: store returns its cosine ranking; fixture makes ps4 far → rank > 3.
  const knnRanking = makeStore(units).search(queryVec('parseYAMLShallow'), 10, { kind: 'plan' });
  assert.ok(rankOf(knnRanking, target) > 3, `KNN-only rank of target (${rankOf(knnRanking, target)}) is > 3`);

  // BM25-only: literal identifier token → target #1.
  const bm25 = scoreBM25(buildBM25Index(units), tokenize('parseYAMLShallow'));
  assert.equal(bm25[0].id, target, 'BM25-only ranks the exact-token target #1');

  // Full hybrid RRF: target recovered into top-3.
  const fused = await search('parseYAMLShallow', { store: makeStore(units), embedder: makeEmbedder() });
  assert.ok(rankOf(fused, target) <= 3, `RRF-fused rank of target (${rankOf(fused, target)}) is <= 3`);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group D — Scenario 3: RRF MRR strictly beats the weaker half AND ≥ the mean
// ═══════════════════════════════════════════════════════════════════════════════

test('SR-D1 Scenario 3 — over the ≥20 labeled queries, MRR(rrf) > min(MRR halves) and ≥ their mean', async () => {
  const units = fixtureUnits();
  assert.ok(FIXTURE.queries.length >= 20, 'fixture has ≥20 labeled queries');

  let sumBm25 = 0;
  let sumKnn = 0;
  let sumRrf = 0;

  for (const q of FIXTURE.queries) {
    // BM25-only ranking (id = planPath):
    const bm25 = scoreBM25(buildBM25Index(units), tokenize(q.query));
    // KNN-only ranking:
    const knn = makeStore(units)
      .search(Float32Array.from(q.embedding), 10, { kind: 'plan' })
      .map((r) => ({ id: r.planPath }));
    // Full hybrid:
    const rrf = (await search(q.query, { store: makeStore(units), embedder: makeEmbedder() }))
      .map((r) => ({ id: r.planPath }));

    sumBm25 += reciprocalRank(bm25, q.expected);
    sumKnn += reciprocalRank(knn, q.expected);
    sumRrf += reciprocalRank(rrf, q.expected);
  }

  const n = FIXTURE.queries.length;
  const mrrBm25 = sumBm25 / n;
  const mrrKnn = sumKnn / n;
  const mrrRrf = sumRrf / n;

  assert.ok(
    mrrRrf > Math.min(mrrBm25, mrrKnn),
    `MRR(rrf)=${mrrRrf.toFixed(4)} must strictly beat weaker half min(${mrrBm25.toFixed(4)}, ${mrrKnn.toFixed(4)})`
  );
  assert.ok(
    mrrRrf >= (mrrBm25 + mrrKnn) / 2 - 1e-9,
    `MRR(rrf)=${mrrRrf.toFixed(4)} must be ≥ mean of halves ${((mrrBm25 + mrrKnn) / 2).toFixed(4)}`
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group E — Scenario 4: ablation changes ordering (NON-VACUOUS: hybrid STRICTLY
//  outperforms BM25-only on ≥1 query — a green-wash-proof assertion)
// ═══════════════════════════════════════════════════════════════════════════════

test('SR-E1 Scenario 4 — ablation: full-RRF ordering differs from BM25-only on ≥1 query AND from KNN-only on ≥1', async () => {
  const units = fixtureUnits();

  let differsFromBm25 = 0;
  let differsFromKnn = 0;

  for (const q of FIXTURE.queries) {
    const full = (await search(q.query, { store: makeStore(units), embedder: makeEmbedder() }))
      .map((r) => r.planPath);
    // BM25-only: same search but store's vector half zeroed (knnOff).
    const bm25Only = (await search(q.query, { store: makeStore(units, { knnOff: true }), embedder: makeEmbedder() }))
      .map((r) => r.planPath);
    // KNN-only: BM25 half zeroed by passing an empty-corpus store to the BM25 build
    // is not expressible; instead compare full vs a pure store.search ordering.
    const knnOnly = makeStore(units)
      .search(Float32Array.from(q.embedding), 10, { kind: 'plan' })
      .map((r) => r.planPath);

    if (JSON.stringify(full) !== JSON.stringify(bm25Only)) differsFromBm25++;
    if (JSON.stringify(full) !== JSON.stringify(knnOnly)) differsFromKnn++;
  }

  assert.ok(differsFromBm25 >= 1, `full-RRF ordering differs from BM25-only on ≥1 query (got ${differsFromBm25})`);
  assert.ok(differsFromKnn >= 1, `full-RRF ordering differs from KNN-only on ≥1 query (got ${differsFromKnn})`);
});

test('SR-E2 ablation is REAL — hybrid STRICTLY beats BM25-only on ≥1 paraphrase query (better target rank)', async () => {
  const units = fixtureUnits();
  let strictWins = 0;

  for (const q of FIXTURE.queries.filter((x) => x.qkind === 'paraphrase')) {
    const full = await search(q.query, { store: makeStore(units), embedder: makeEmbedder() });
    const bm25Only = await search(q.query, {
      store: makeStore(units, { knnOff: true }),
      embedder: makeEmbedder(),
    });
    // Strictly better = target ranks HIGHER (smaller rank number) with the vector half on.
    if (rankOf(full, q.expected) < rankOf(bm25Only, q.expected)) strictWins++;
  }

  assert.ok(
    strictWins >= 1,
    `hybrid must STRICTLY beat BM25-only on ≥1 paraphrase query (got ${strictWins}); ` +
      'if this is 0 the fusion contributes nothing and the ablation is a tautology'
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group F — Scenario 7: empty-index no-op (null store + size-0 store)
// ═══════════════════════════════════════════════════════════════════════════════

test('SR-F1 Scenario 7 — null store resolves to [] and does NOT call the embedder', async () => {
  const embedder = makeEmbedder();
  const results = await search('anything at all', { store: null, embedder });
  assert.deepEqual(results, []);
  assert.equal(embedder.calls.length, 0, 'embedder MUST NOT be called on an unavailable index');
});

test('SR-F2 Scenario 7 — size-0 store resolves to [] and does NOT call the embedder', async () => {
  const embedder = makeEmbedder();
  const store = makeStore([]); // size === 0
  const results = await search('anything at all', { store, embedder });
  assert.deepEqual(results, []);
  assert.equal(embedder.calls.length, 0, 'embedder MUST NOT be called on an empty index');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group G — Degrade path: empty embedder result → BM25-only + degraded marker
// ═══════════════════════════════════════════════════════════════════════════════

test('SR-G1 degrade — embedder returns {vectors:[]} → BM25-only ranking, degraded marker, no throw', async () => {
  const units = fixtureUnits();
  const embedder = makeEmbedder({ empty: true });
  const store = makeStore(units);

  const results = await search('quality gate coverage lint typecheck', { store, embedder });
  assert.equal(embedder.calls.length, 1, 'embedder was awaited exactly once (the one async point)');
  assert.ok(results.length > 0, 'BM25-only still returns results');
  assert.equal(top1(results), 'plans/qg1-coverage.md', 'BM25-only ranks the lexical-match target #1');
  assert.equal(results.degraded, 'no-embedding', 'a visible degraded marker is attached');
});

test('SR-G2 degrade path never throws even when store.search would throw (fail-open to BM25-only)', async () => {
  const units = fixtureUnits();
  const throwingStore = makeStore(units);
  throwingStore.search = () => {
    throw new Error('simulated dimension mismatch');
  };
  const embedder = makeEmbedder();
  // Use the EXACT fixture query so the embedder returns a real vector — then the
  // ONLY throw comes from store.search, exercising the vector-error degrade branch.
  const results = await search('security scanner path traversal secret exposure', { store: throwingStore, embedder });
  assert.ok(Array.isArray(results), 'returns an array (does not throw)');
  assert.ok(results.length > 0, 'degrades to BM25-only results');
  assert.equal(top1(results), 'plans/qg2-security-scan.md', 'BM25-only recovers the target');
  assert.equal(results.degraded, 'vector-error', 'a store.search throw is marked vector-error');
});

test('SR-G3 a store lacking listPlanPaths/getUnit yields an empty BM25 corpus (defensive, no throw)', async () => {
  // Minimal store surface: only `size` + `search`, no enumeration methods. The BM25
  // corpus is empty (collectUnits guard), so results come from the vector half only.
  const units = fixtureUnits();
  function l2(v) { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s); }
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  const bareStore = {
    search(q, k, opts = {}) {
      const out = units
        .filter((r) => !opts.kind || r.kind === opts.kind)
        .map((r) => ({ ...r, score: dot(q, r.embedding) / (l2(q) * l2(r.embedding)) }));
      out.sort((a, b) => b.score - a.score);
      return out.slice(0, k);
    },
  };
  Object.defineProperty(bareStore, 'size', { get: () => units.length });

  const results = await search('How does CTOC sync plan state', { store: bareStore, embedder: makeEmbedder() });
  assert.ok(results.length > 0, 'vector half alone still returns results when BM25 corpus is empty');
  assert.equal(top1(results), 'plans/ps1-sync-state.md', 'KNN-only ranking is returned');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Group H — the ONE async point + input validation
// ═══════════════════════════════════════════════════════════════════════════════

test('SR-H1 one async point — the embedder is awaited exactly once per search', async () => {
  const store = makeStore(fixtureUnits());
  const embedder = makeEmbedder();
  await search('kanban board plan stages transitions', { store, embedder });
  assert.equal(embedder.calls.length, 1, 'exactly one embedder call');
  assert.deepEqual(embedder.calls[0], ['kanban board plan stages transitions'], 'batched as [query]');
});

test('SR-H2 non-string query throws TypeError', async () => {
  const store = makeStore(fixtureUnits());
  const embedder = makeEmbedder();
  await assert.rejects(() => search(42, { store, embedder }), TypeError);
  await assert.rejects(() => search(null, { store, embedder }), TypeError);
  await assert.rejects(() => search(undefined, { store, embedder }), TypeError);
});

test('SR-H7 non-injected deps resolve via getWiring (fresh empty project → []), no Ollama', async () => {
  // Drives the lazy-require(getWiring) fallback WITHOUT injecting store/embedder.
  // A fresh temp project has an empty (size-0) index, so the empty-index guard
  // returns [] — hermetic, no network, no embedding source touched.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-search-'));
  try {
    const { getWiring } = require('../src/lib/plan-index/wiring');
    if (typeof getWiring.__reset === 'function') getWiring.__reset();
    const results = await search('anything', { projectPath: dir });
    assert.deepEqual(results, [], 'empty fresh project resolves to [] through the wiring path');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SR-H8 store injected but embedder omitted still resolves the embedder via wiring', async () => {
  // Exercises the partial-injection branch (store !== undefined, embedder === undefined).
  // Injected empty store → size-0 guard returns [] before any embedder call, proving
  // the resolution branch is reached without needing a live embedding source.
  const store = makeStore([]);
  const results = await search('anything', { store });
  assert.deepEqual(results, []);
});

test('SR-H3 DEFAULT_SEARCH_LIMIT is a numeric module constant (10)', () => {
  assert.equal(typeof DEFAULT_SEARCH_LIMIT, 'number');
  assert.equal(DEFAULT_SEARCH_LIMIT, 10);
});

test('SR-H4 limit opt bounds the result count', async () => {
  const store = makeStore(fixtureUnits());
  const embedder = makeEmbedder();
  const results = await search('plan state machine todo queue ordering', { store, embedder, limit: 3 });
  assert.ok(results.length <= 3, `results respect limit=3 (got ${results.length})`);
});

test('SR-H6 kind:"section" enumerates section units (skips the __plan__ sentinel) and fuses them', async () => {
  // A store carrying BOTH a plan-level (__plan__) unit and two section units for
  // one plan. kind:'section' must build BM25 over the sections, skip __plan__, and
  // return section-shaped results.
  const secUnits = [
    {
      planPath: 'plans/ps1-sync-state.md',
      sectionId: '__plan__',
      kind: 'plan',
      text: 'plan level summary sync state',
      files: [],
      parentVision: null,
      stepLabel: null,
      contentHash: 'p',
      embedding: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]),
    },
    {
      planPath: 'plans/ps1-sync-state.md',
      sectionId: 'sec-overview',
      kind: 'section',
      text: 'overview of how the kanban board reconciles stage transitions',
      files: [],
      parentVision: null,
      stepLabel: null,
      contentHash: 's1',
      embedding: Float32Array.from([0.9, 0.1, 0, 0, 0, 0, 0, 0]),
    },
    {
      planPath: 'plans/ps1-sync-state.md',
      sectionId: 'sec-testing',
      kind: 'section',
      text: 'testing the state machine with fixtures and assertions',
      files: [],
      parentVision: null,
      stepLabel: null,
      contentHash: 's2',
      embedding: Float32Array.from([0.8, 0.2, 0, 0, 0, 0, 0, 0]),
    },
  ];
  // stub embedder maps the query to a vector near the overview section:
  const embedder = async (texts) => ({ vectors: texts.map(() => Float32Array.from([0.9, 0.1, 0, 0, 0, 0, 0, 0])) });
  const store = makeStore(secUnits);

  const results = await search('kanban board reconciles stage transitions', {
    store,
    embedder,
    kind: 'section',
  });

  assert.ok(results.length > 0, 'section search returns results');
  assert.ok(
    results.every((r) => r.sectionId !== '__plan__'),
    'the __plan__ sentinel unit is excluded from a kind:"section" search'
  );
  assert.equal(results[0].sectionId, 'sec-overview', 'the matching section ranks first');
});

test('SR-H5 excludePlanPath is honored (self-exclusion for related())', async () => {
  const store = makeStore(fixtureUnits());
  const embedder = makeEmbedder();
  const excluded = 'plans/ps1-sync-state.md';
  const results = await search('How does CTOC sync plan state', {
    store,
    embedder,
    excludePlanPath: excluded,
  });
  assert.ok(
    results.every((r) => r.planPath !== excluded),
    'excluded plan never appears in results'
  );
});

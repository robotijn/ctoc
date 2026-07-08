'use strict';

/**
 * PI4-s2 — Hybrid plan search: BM25 (pure-JS inverted index) + vector KNN
 * (PI1 `store.search`, brute-force cosine) fused with s1's Reciprocal Rank
 * Fusion (RRF, k=60). This is the INTERNAL retrieval engine behind the public
 * `search()` that s3's `index.js` barrel re-exports; callers outside the package
 * never import this file directly (the barrel is the public boundary).
 *
 * ── Design (ADRs, per plans/todo/pi4-…-s2-search.md) ────────────────────────────
 *
 * • THE ONE ASYNC POINT. The PI4 non-functional requirement is "read the
 *   already-built index synchronously". The single unavoidable async call is
 *   embedding the *query text* (`embedder` returns a Promise). So `search()` is
 *   `async` and `await`s the embedder EXACTLY ONCE; everything after is synchronous
 *   — `store.search` is sync, BM25 scoring is sync, `fuseRRF` is sync. No timeout
 *   caps, no partial returns: one awaited embed, then pure computation.
 *
 * • BM25 over the in-memory unit corpus. The lexical half is a pure-JS BM25
 *   inverted index (k1 = 1.2, b = 0.75 — the standard Robertson/Spärck-Jones
 *   defaults) built per-search from the store's plan-level (`__plan__`) units,
 *   enumerated through the REAL PI1 handle surface (`listPlanPaths()` +
 *   `getUnit(planPath, '__plan__')`) — no private store seam. At ~1,720 units this
 *   is sub-millisecond. Tokenization: lowercase, split on `/[^a-z0-9]+/`, PLUS the
 *   raw un-split lowercased identifier retained as a token so an exact-identifier
 *   query (e.g. `parseYAMLShallow`) still hits (Scenario 2 exact-token recall). No
 *   stemming / no stopword removal — the corpus is tiny and over-processing hurts
 *   exact-token recall.
 *
 * • RRF fusion, index-agnostic. `fuseRRF` fuses by RANK POSITION, so BM25's
 *   unbounded term-frequency scores and cosine's [-1, 1] need no cross-scale
 *   normalization; a retriever that returns nothing simply contributes nothing.
 *
 * • DEGRADE PATH = fail-open, never a crash ("never break the menu"). If the store
 *   is null / empty → `[]` (no embed call). If the embedder returns `{vectors:[]}`
 *   (fail-open source) → BM25-only ranking + a visible `degraded:'no-embedding'`
 *   marker. If `store.search` itself throws (unexpected dimension mismatch) → caught,
 *   degrade to BM25-only with `degraded:'vector-error'`. Only a non-string `query`
 *   throws (a caller bug).
 *
 * • Dependency injection. `store` + `embedder` come from `opts` (tests inject a mock
 *   store + a stub embedder mapping query→fixture vector); when absent they are
 *   resolved via `getWiring({projectPath})` (lazy-required, mirroring how actions.js
 *   / the sync hook lazy-require the wiring). PI2 is NEVER imported directly — only
 *   the pre-wired `embedder` is called.
 *
 * Cross-platform: pure JS + Map accumulators (proto-pollution-safe); no fs/path/os
 * of its own — all filesystem access lives inside the PI1 store.
 */

const { fuseRRF } = require('./fusion');
const { PLAN_SENTINEL } = require('./store');

/** Default top-N for search (parent NFR: "default top-10", a named constant). */
const DEFAULT_SEARCH_LIMIT = 10;

/** BM25 term-frequency saturation (Robertson/Spärck-Jones default). */
const BM25_K1 = 1.2;
/** BM25 length-normalization strength (Robertson/Spärck-Jones default). */
const BM25_B = 0.75;

/**
 * Tokenize text for the BM25 lexical index: lowercase, split on runs of
 * non-alphanumeric characters, drop empties, AND retain each original
 * whitespace-delimited token (lowercased) so a compound identifier like
 * `parseYAMLShallow` survives as one token for exact-identifier recall.
 *
 * @param {string} text
 * @returns {string[]} tokens (may contain duplicates — BM25 counts term frequency)
 */
function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lower = text.toLowerCase();
  const tokens = [];
  // Split pieces on non-alphanumeric boundaries (path separators, punctuation).
  for (const piece of lower.split(/[^a-z0-9]+/)) {
    if (piece.length > 0) tokens.push(piece);
  }
  // Raw whitespace-delimited tokens (lowercased) — keeps a hyphen/dot-joined
  // identifier addressable as a single token when the query repeats it verbatim.
  for (const raw of lower.split(/\s+/)) {
    if (raw.length > 0 && raw !== '' && !/^[a-z0-9]+$/.test(raw)) {
      // only add compound (non-simple) raw tokens; a bare word already appears above
      tokens.push(raw);
    }
  }
  return tokens;
}

/**
 * @typedef {Object} BM25Doc
 * @property {string} id           The document id (planPath).
 * @property {number} length       Token count of the document (for length norm).
 * @property {Map<string, number>} tf  term → frequency within this document.
 */

/**
 * @typedef {Object} BM25Index
 * @property {BM25Doc[]} docs
 * @property {Map<string, number>} df   term → number of docs containing it.
 * @property {number} avgdl             Average document length.
 * @property {number} N                 Corpus size (number of docs).
 */

/**
 * Build a BM25 inverted index over a list of `{ id, text }` units. Pure and
 * synchronous. Uses Map accumulators (proto-pollution-safe even for a token like
 * `__proto__`).
 *
 * @param {Array<{ id?: string, planPath?: string, text?: string }>} units
 * @returns {BM25Index}
 */
function buildBM25Index(units) {
  const docs = [];
  const df = new Map();
  let totalLen = 0;

  for (const u of Array.isArray(units) ? units : []) {
    const id = typeof u.id === 'string' ? u.id : u.planPath;
    if (typeof id !== 'string' || id.length === 0) continue;
    const tokens = tokenize(typeof u.text === 'string' ? u.text : '');
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.push({ id, length: tokens.length, tf });
    totalLen += tokens.length;
  }

  const N = docs.length;
  const avgdl = N > 0 ? totalLen / N : 0;
  return { docs, df, avgdl, N };
}

/**
 * Score a BM25 index against a tokenized query, returning docs ranked best-first.
 * Standard BM25 with the classic (Robertson) probabilistic IDF, clamped at 0 so a
 * term present in > half the corpus never contributes a negative score.
 *
 * @param {BM25Index} index
 * @param {string[]} queryTokens
 * @returns {Array<{ id: string, score: number }>} score-descending, only docs with
 *   score > 0 (a doc sharing no query term contributes nothing — RRF-friendly).
 */
function scoreBM25(index, queryTokens) {
  if (!index || !Array.isArray(index.docs) || index.N === 0) return [];
  const uniqueQ = [...new Set(Array.isArray(queryTokens) ? queryTokens : [])];
  const { docs, df, avgdl, N } = index;

  const scored = [];
  for (const doc of docs) {
    let score = 0;
    for (const term of uniqueQ) {
      const n = df.get(term) || 0;
      if (n === 0) continue;
      const f = doc.tf.get(term) || 0;
      if (f === 0) continue;
      // Robertson IDF, clamped to ≥ 0 (avoids negative weights for very common terms).
      const idf = Math.max(0, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
      const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * doc.length) / (avgdl || 1));
      score += idf * ((f * (BM25_K1 + 1)) / (denom || 1));
    }
    if (score > 0) scored.push({ id: doc.id, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // deterministic tie-break
  });
  return scored;
}

/**
 * Enumerate the store's units for a given kind, honoring `excludePlanPath`, using
 * ONLY the real PI1 handle surface (`listPlanPaths` + `getUnit` / `listUnitSectionIds`).
 * For the default `kind: 'plan'` this is one `getUnit(planPath, '__plan__')` per plan.
 *
 * @param {object} store
 * @param {'plan'|'section'} kind
 * @param {string|undefined} excludePlanPath
 * @returns {Array<{ id: string, planPath: string, sectionId: string, text: string, view: object }>}
 */
function collectUnits(store, kind, excludePlanPath) {
  const out = [];
  if (!store || typeof store.listPlanPaths !== 'function' || typeof store.getUnit !== 'function') {
    return out;
  }
  const planPaths = store.listPlanPaths();
  for (const planPath of planPaths) {
    if (excludePlanPath && planPath === excludePlanPath) continue;
    if (kind === 'section') {
      const sectionIds = typeof store.listUnitSectionIds === 'function'
        ? store.listUnitSectionIds(planPath)
        : [];
      for (const sectionId of sectionIds) {
        if (sectionId === PLAN_SENTINEL) continue;
        const view = store.getUnit(planPath, sectionId);
        if (view) out.push({ id: `${planPath} ${sectionId}`, planPath, sectionId, text: view.text || '', view });
      }
    } else {
      const view = store.getUnit(planPath, PLAN_SENTINEL);
      if (view) out.push({ id: planPath, planPath, sectionId: PLAN_SENTINEL, text: view.text || '', view });
    }
  }
  return out;
}

/**
 * Coerce a requested limit to a positive integer, else the default.
 * @param {*} limit
 * @returns {number}
 */
function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_SEARCH_LIMIT;
}

/**
 * Hybrid BM25 + vector search over the plan index, fused with RRF (k=60).
 *
 * @param {string} query - Natural-language or exact-identifier query.
 * @param {object} [opts]
 * @param {object|null} [opts.store]     Injected PI1 store handle; else `getWiring`.
 * @param {(texts: string[]) => Promise<{vectors: Float32Array[], source?: string}>} [opts.embedder]
 *        Injected async embedder; else `getWiring`.
 * @param {string} [opts.projectPath]    Passed to `getWiring` when store/embedder absent.
 * @param {number} [opts.limit]          Top-N (default {@link DEFAULT_SEARCH_LIMIT}).
 * @param {'plan'|'section'} [opts.kind] Restrict the corpus + KNN (default 'plan').
 * @param {string} [opts.excludePlanPath] Drop units of this plan (self-exclusion for related()).
 * @returns {Promise<Array<object & {planPath: string, sectionId: string, score: number}>>}
 *          Fused, score-descending, ≤ limit; each result carries the store view
 *          fields. On the degrade path the array also carries a `degraded` marker.
 * @throws {TypeError} Only when `query` is not a string. Empty index, missing
 *   embedding, and a throwing `store.search` all DEGRADE — they never throw.
 */
async function search(query, opts = {}) {
  if (typeof query !== 'string') {
    throw new TypeError('plan-index search: query must be a string');
  }

  // Resolve injected deps, else lazy-require the wiring (mirrors actions.js / hook).
  let store = opts.store;
  let embedder = opts.embedder;
  if (store === undefined || embedder === undefined) {
    // Lazy-required only when store/embedder are NOT injected — mirrors how
    // actions.js and the sync hook lazy-require the wiring (avoids an eager cycle).
    const { getWiring } = require('./wiring');
    const wiring = getWiring({ projectPath: opts.projectPath });
    if (store === undefined) store = wiring.store;
    if (embedder === undefined) embedder = wiring.embedder;
  }

  // Empty / unavailable guard: no store, or a zero-unit index → []. NO embed call.
  if (!store || typeof store.size !== 'number' || store.size === 0) {
    return [];
  }

  const kind = opts.kind === 'section' ? 'section' : 'plan';
  const limit = normalizeLimit(opts.limit);
  const excludePlanPath = typeof opts.excludePlanPath === 'string' ? opts.excludePlanPath : undefined;

  // ── lexical half (BM25) — always available, pure JS ──────────────────────────
  const units = collectUnits(store, kind, excludePlanPath);
  const viewById = new Map(units.map((u) => [u.id, u.view]));
  const idToLocation = new Map(units.map((u) => [u.id, { planPath: u.planPath, sectionId: u.sectionId }]));
  const bm25Index = buildBM25Index(units);
  const bm25Ranked = scoreBM25(bm25Index, tokenize(query)).slice(0, limit);
  const bm25List = bm25Ranked.map((r) => ({ id: r.id }));

  // ── vector half (KNN via PI1 cosine) — the ONE async point ───────────────────
  let degraded = null;
  let knnList = [];
  let vectors = [];
  try {
    const embedResult = await embedder([query]); // ← the single await
    vectors = embedResult && Array.isArray(embedResult.vectors) ? embedResult.vectors : [];
  } catch {
    vectors = []; // a throwing embedder is fail-open → BM25-only
  }

  const qVec = vectors[0];
  if (!(qVec instanceof Float32Array) || qVec.length === 0) {
    degraded = 'no-embedding'; // fail-open source → BM25-only degrade
  } else {
    try {
      const knn = store.search(qVec, limit, { kind, excludePlanPath });
      for (const hit of Array.isArray(knn) ? knn : []) {
        const id = kind === 'section' ? `${hit.planPath} ${hit.sectionId}` : hit.planPath;
        knnList.push({ id });
        if (!viewById.has(id)) viewById.set(id, hit);
        if (!idToLocation.has(id)) idToLocation.set(id, { planPath: hit.planPath, sectionId: hit.sectionId });
      }
    } catch {
      degraded = 'vector-error'; // unexpected store.search throw → BM25-only degrade
      knnList = [];
    }
  }

  // ── fuse (RRF, s1) ───────────────────────────────────────────────────────────
  const lists = degraded || knnList.length === 0 ? [bm25List] : [bm25List, knnList];
  const fused = fuseRRF(lists);

  const results = [];
  for (const { id, score } of fused.slice(0, limit)) {
    const view = viewById.get(id);
    /** @type {{ planPath?: string, sectionId?: string }} */
    const loc = idToLocation.get(id) || {};
    results.push({
      ...(view || {}),
      planPath: (view && view.planPath) || loc.planPath,
      sectionId: (view && view.sectionId) || loc.sectionId,
      score,
    });
  }

  if (degraded) {
    Object.defineProperty(results, 'degraded', { value: degraded, enumerable: false });
  }
  return results;
}

module.exports = {
  search,
  DEFAULT_SEARCH_LIMIT,
  BM25_K1,
  BM25_B,
  tokenize,
  buildBM25Index,
  scoreBM25,
};

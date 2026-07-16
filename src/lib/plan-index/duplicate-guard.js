'use strict';

/**
 * PI5-s1 — duplicate-guard: the thin threshold+filter layer over the PI1 store's
 * brute-force cosine search.
 *
 * `checkDuplicate(draftSummary, options)` answers "which existing plans is this
 * draft plan semantically too close to?". It WARNS (returns the matches); it
 * NEVER blocks and it NEVER throws — a duplicate check must never break a plan
 * write. The advisory hook + user-facing warning text/log surface belong to the
 * sibling slice `s2`; this module is pure threshold-over-retrieval logic.
 *
 * Design (Option B — TRUE-COSINE thresholding, human-approved):
 *
 *  • Similarity source = TRUE COSINE. The thresholded duplicate decision is made
 *    against the store's raw cosine similarity, exactly as `related()`'s common
 *    (indexed) path does. `checkDuplicate` embeds the draft summary ONCE via the
 *    wired `embedder`, then calls `store.search(qVec, limit, { excludePlanPath })`
 *    (PI1 brute-force cosine) and compares each hit's cosine `score >= threshold`.
 *    It does NOT route the decision through PI4 `search()`'s Reciprocal Rank Fusion
 *    score. RRF's mathematical ceiling ≈ 2/(60+1) = 0.0328 could NEVER reach the
 *    shipped cosine-scale threshold (0.85), so RRF-thresholding was a silent no-op
 *    on every default install; comparing TRUE cosine makes the 0.85 threshold mean
 *    what it says. The `score` field is the cosine value the store attaches to each
 *    hit (store.js `search`: `view.score = cosine`).
 *
 *  • Threshold via the real 3-arg `getSetting('plan_index','duplicate_threshold',
 *    projectPath)` (`src/lib/settings.js`; shipped default 0.85, on the cosine
 *    scale). The threshold is always READ, never hardcoded. A missing / non-finite
 *    threshold → `[]` (we cannot compare without one and we do not guess a default).
 *
 *  • Fail-open, always. The whole body is a single `try { … } catch { return []; }`.
 *    A throwing embedder, a throwing `store.search`, a throwing `getSetting`, a
 *    non-array `store.search` result, an empty / unavailable index, a below-threshold
 *    hit, and bad input all yield `[]`.
 *
 *  • Dependency injection for hermetic tests: `options.store` / `options.embedder` /
 *    `options.getSetting` override the real deps. Production passes none and the
 *    module resolves `store` + `embedder` via `getWiring({projectPath})` (lazy
 *    string-literal require, mirroring `related.js` EXACTLY — avoids an eager require
 *    cycle) and `getSetting` via `../settings` (lazy). The DI shape is store+embedder
 *    (NOT a pre-built `search`), so the guard owns the single embed + cosine call.
 *
 * No `fs`, no `path`, no `os`: pure logic over injected/lazy deps — cross-platform
 * for free.
 */

/**
 * Default number of nearest plans a duplicate warning lists. Smaller than the
 * PI4 search default (a warning names a handful of nearest, not the full top-10).
 * Overridable via `options.limit`.
 * @type {number}
 */
const DEFAULT_DUPLICATE_LIMIT = 5;

/**
 * Check whether a draft plan is semantically too close to existing plans.
 *
 * @param {string} draftSummary - Deterministic summary text of the draft plan
 *   (produced by `s2`; treated here as opaque query text). Non-empty string else `[]`.
 * @param {object} [options]
 * @param {string} [options.projectPath] - Forwarded to `getWiring()` and `getSetting()`.
 * @param {string} [options.selfPlanPath] - Normalized plan path of the draft;
 *   forwarded as `store.search`'s `excludePlanPath` so a re-save never flags itself.
 * @param {number} [options.limit] - Forwarded to `store.search` (default {@link DEFAULT_DUPLICATE_LIMIT}).
 * @param {object|null} [options.store] - Injected PI1 store handle for tests; else `getWiring`.
 * @param {(texts: string[]) => Promise<{vectors: Float32Array[], source?: string}>} [options.embedder]
 *   - Injected async embedder for tests; else `getWiring`.
 * @param {(category: string, key: string, projectPath?: string) => *} [options.getSetting]
 *   - Injected for tests; else the lazy-required real `getSetting`.
 * @returns {Promise<Array<{ plan: string, similarity: number }>>} One entry per
 *   result whose cosine `score >= threshold`, sorted similarity-descending. `[]` on
 *   empty index, no match, bad input, or ANY error. NEVER throws / never rejects.
 */
async function checkDuplicate(draftSummary, options = {}) {
  try {
    // Guard: only a non-empty (non-whitespace) string is a valid query. No query
    // is attempted otherwise — nothing is embedded.
    if (typeof draftSummary !== 'string' || draftSummary.trim() === '') {
      return [];
    }

    const opts = options || {};
    const { projectPath, selfPlanPath } = opts;

    // Resolve store + embedder: injected overrides, else lazy-require the wiring
    // (mirrors related.js's getWiring resolution EXACTLY — string-literal require,
    // fail-open, no eager cycle).
    let store = opts.store;
    let embedder = opts.embedder;
    if (store === undefined || embedder === undefined) {
      let wiring = {};
      try {
        const { getWiring } = require('./wiring');
        wiring = getWiring({ projectPath }) || {};
      } catch {
        wiring = {}; // wiring unavailable → fail-open below (no store ⇒ [])
      }
      if (store === undefined) store = wiring.store;
      if (embedder === undefined) embedder = wiring.embedder;
    }

    // Resolve getSetting: injected override, else the lazy-required real one.
    // Guarded below: a non-function getSetting → [] (fail-open).
    const getSetting =
      typeof opts.getSetting === 'function'
        ? opts.getSetting
        : require('../settings').getSetting;

    if (typeof getSetting !== 'function') {
      return [];
    }

    // Threshold: always read, never hardcoded. NaN/undefined → [] (do not guess).
    // On the cosine scale — the store's raw cosine `score` is compared against it.
    const threshold = Number(getSetting('plan_index', 'duplicate_threshold', projectPath));
    if (!Number.isFinite(threshold)) {
      return [];
    }

    const limit =
      Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_DUPLICATE_LIMIT;

    // Empty / unavailable guard: no store, or a zero-unit index → []. NO embed call.
    if (!store || typeof store.size !== 'number' || store.size === 0) {
      return [];
    }
    if (typeof embedder !== 'function') {
      return [];
    }

    // The ONE async point: embed the draft summary EXACTLY once. A throwing /
    // fail-open embedder degrades to [].
    let vectors = [];
    try {
      const embedResult = await embedder([draftSummary]);
      vectors = embedResult && Array.isArray(embedResult.vectors) ? embedResult.vectors : [];
    } catch {
      return [];
    }
    const qVec = vectors[0];
    if (!(qVec instanceof Float32Array) || qVec.length === 0) {
      return [];
    }

    // TRUE-COSINE retrieval (mirrors related()'s common path): a throwing store.search
    // or a non-array result degrades to [].
    let hits;
    try {
      hits = store.search(qVec, limit, { excludePlanPath: selfPlanPath });
    } catch {
      return [];
    }
    if (!Array.isArray(hits)) {
      return [];
    }

    return hits
      .filter((r) => r && Number.isFinite(r.score) && r.score >= threshold)
      .map((r) => ({ plan: r.planPath, similarity: r.score }))
      .sort((a, b) => b.similarity - a.similarity);
  } catch {
    // Fail-open: a duplicate check must never break a plan write.
    return [];
  }
}

module.exports = { checkDuplicate, DEFAULT_DUPLICATE_LIMIT };

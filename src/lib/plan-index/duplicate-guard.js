'use strict';

/**
 * PI5-s1 — duplicate-guard: the thin threshold+filter layer over PI4 `search()`.
 *
 * `checkDuplicate(draftSummary, options)` answers "which existing plans is this
 * draft plan semantically too close to?". It WARNS (returns the matches); it
 * NEVER blocks and it NEVER throws — a duplicate check must never break a plan
 * write. The advisory hook + user-facing warning text/log surface belong to the
 * sibling slice `s2`; this module is pure threshold-over-retrieval logic.
 *
 * Design (see the PI5-s1 plan `## Implementation Details`):
 *
 *  • It contributes ZERO new retrieval code. It calls the PI4 barrel `search()`
 *    (async, `src/lib/plan-index/index.js` → `./search`), which owns the ONE
 *    embed call and the PI1 brute-force cosine + BM25/RRF fusion. `checkDuplicate`
 *    is therefore async and `await`s `search()` exactly once.
 *
 *  • Similarity source = the fused `score` field on each `search()` result. Those
 *    scores are RRF rank-fusion scores (small positive range), NOT raw cosine in
 *    [-1, 1]. This module does NOT rescale them — it compares `score >= threshold`
 *    faithfully and leaves the score semantics exactly as `search()` returns them.
 *    Any score-scale re-calibration is a separate, human-scheduled concern (see the
 *    plan's `## Decisions Taken Under Ambiguity`), NOT silently baked in here.
 *
 *  • Threshold via the real 3-arg `getSetting('plan_index','duplicate_threshold',
 *    projectPath)` (`src/lib/settings.js`; shipped default 0.85). The threshold is
 *    always READ, never hardcoded. A missing / non-finite threshold → `[]` (we
 *    cannot compare without one and we do not guess a default).
 *
 *  • Fail-open, always. The whole body is a single `try { … } catch { return []; }`.
 *    A thrown/rejecting `search`, a throwing `getSetting`, a non-array `search`
 *    result, an empty index, a below-threshold field, and bad input all yield `[]`.
 *
 *  • Dependency injection for hermetic tests: `options.search` / `options.getSetting`
 *    override the real deps. Production passes neither and the module lazy-requires
 *    the real `search` (`./search`, the module the barrel `./index` re-exports via
 *    its fail-open lazy getter) + real `getSetting` (`../settings`) — lazy to avoid
 *    an eager require cycle. Requiring `./search` directly (rather than reading the
 *    barrel's `Object.defineProperties` getter) is behaviorally identical — the
 *    getter is literally `require('./search').search` — and keeps the reference
 *    statically visible to `tsc --checkJs`.
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
 * @param {string} [options.projectPath] - Forwarded to `search()` and `getSetting()`.
 * @param {string} [options.selfPlanPath] - Normalized plan path of the draft;
 *   forwarded as `search()`'s `excludePlanPath` so a re-save never flags itself.
 * @param {number} [options.limit] - Forwarded to `search()` (default {@link DEFAULT_DUPLICATE_LIMIT}).
 * @param {(query: string, opts: object) => Promise<Array<object>>} [options.search]
 *   - Injected async `search` for tests; else the lazy-required real `search`
 *   (the same function the barrel `./index` re-exports).
 * @param {(category: string, key: string, projectPath?: string) => *} [options.getSetting]
 *   - Injected for tests; else the lazy-required real `getSetting`.
 * @returns {Promise<Array<{ plan: string, similarity: number }>>} One entry per
 *   result whose `score >= threshold`, sorted similarity-descending. `[]` on empty
 *   index, no match, bad input, or ANY error. NEVER throws / never rejects.
 */
async function checkDuplicate(draftSummary, options = {}) {
  try {
    // Guard: only a non-empty (non-whitespace) string is a valid query. No query
    // is attempted otherwise — search() is NOT called.
    if (typeof draftSummary !== 'string' || draftSummary.trim() === '') {
      return [];
    }

    const opts = options || {};
    const { projectPath, selfPlanPath } = opts;

    // Resolve deps: injected overrides, else lazy-require the real ones. We
    // require `./search` directly (the module the barrel `./index` re-exports via
    // its fail-open lazy getter) — same function, but statically visible to tsc.
    // Guarded below: a non-function `search`/`getSetting` → [] (fail-open).
    const search =
      typeof opts.search === 'function' ? opts.search : require('./search').search;
    const getSetting =
      typeof opts.getSetting === 'function'
        ? opts.getSetting
        : require('../settings').getSetting;

    if (typeof search !== 'function' || typeof getSetting !== 'function') {
      return [];
    }

    // Threshold: always read, never hardcoded. NaN/undefined → [] (do not guess).
    const threshold = Number(getSetting('plan_index', 'duplicate_threshold', projectPath));
    if (!Number.isFinite(threshold)) {
      return [];
    }

    const limit =
      Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_DUPLICATE_LIMIT;

    // The ONE async point. search() owns the embed + retrieval + fusion and is
    // itself fail-open (empty index → [], embed failure → BM25-only).
    const results = await search(draftSummary, {
      projectPath,
      excludePlanPath: selfPlanPath,
      limit
    });

    if (!Array.isArray(results)) {
      return [];
    }

    return results
      .filter((r) => r && Number.isFinite(r.score) && r.score >= threshold)
      .map((r) => ({ plan: r.planPath, similarity: r.score }))
      .sort((a, b) => b.similarity - a.similarity);
  } catch {
    // Fail-open: a duplicate check must never break a plan write.
    return [];
  }
}

module.exports = { checkDuplicate, DEFAULT_DUPLICATE_LIMIT };

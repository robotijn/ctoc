'use strict';

/**
 * PI4-s3 — `related(planSlug, opts)`: nearest-neighbour plan surfacing.
 *
 * Surfaces the plans most similar to a given plan, self-excluded, ranked by
 * cosine. It is the sibling of s2's `search()` (which is query-text driven);
 * `related` is PLAN driven and consumes the already-built index directly.
 *
 * ── Design (ADRs, per plans/todo/pi4-…-s3-related-and-barrel.md) ─────────────────
 *
 * • SEED FROM THE STORED PLAN VECTOR — NOT A RE-EMBED (the load-bearing ADR). A
 *   plan is already indexed as its `__plan__` unit carrying a stored `embedding`.
 *   `related(planSlug)` looks up `store.getUnit(planSlug, '__plan__')`; when that
 *   unit is present it feeds its stored `embedding` STRAIGHT into
 *   `store.search(vec, limit, { excludePlanPath: planSlug, kind })` — NO embedder
 *   call on the common path. This honours "PI4 reads the already-built index" and
 *   avoids a redundant async embed. The plan cannot appear in its own list because
 *   `store.search`'s `excludePlanPath` drops it (parent decision) — self-exclusion
 *   is the store's job, not a post-filter here.
 *
 * • TEXT-SEEDED FALLBACK for a not-yet-indexed plan. If the plan-level unit is
 *   absent (e.g. a freshly created plan not yet reconciled into the index),
 *   `related` embeds the slug text ONCE via the wired `embedder` and feeds that
 *   query vector STRAIGHT into `store.search(qVec, limit, { excludePlanPath, kind })`
 *   — the SAME TRUE-COSINE surface the common path uses. It does NOT delegate to s2
 *   `search()` (which fuses BM25+cosine via Reciprocal Rank Fusion and would return
 *   RRF-scaled scores, ~0.0328 ceiling, on the fallback path — breaking any caller
 *   that thresholds `related()`'s score on the cosine scale, e.g. conflict-detect's
 *   0.78). Both paths now return TRUE cosine. A brand-new plan still surfaces
 *   neighbours instead of returning empty; if no embedder is available, or the embed
 *   yields no usable vector, it fails open to `[]` (never a throw — the overview/inbox
 *   render must not crash).
 *
 * • `kind` PASSTHROUGH for PI6. `related(slug, { kind: 'section' })` passes `kind`
 *   straight into `store.search` `opts.kind`, restricting the cosine scan to
 *   section-level units — the additive hook PI6 needs. Default `kind: 'plan'`
 *   preserves current behaviour.
 *
 * • FAIL-OPEN everywhere but a caller bug. Null store, a zero-unit index, no
 *   neighbours, or an absent seed with no embedder all return `[]`. Only a
 *   non-string / empty `planSlug` throws (`TypeError`) — that is a caller bug, not
 *   data.
 *
 * • DEPENDENCY INJECTION. `store` + `embedder` come from `opts` (tests inject a
 *   real `openStore` over a temp JSON + a spy embedder); when absent they resolve
 *   via `getWiring({projectPath})` (lazy-required, mirroring s2 and actions.js —
 *   avoids an eager require cycle).
 *
 * Cross-platform: pure JS delegating to the PI1 store; no fs/path/os of its own.
 */

/** Default top-N for related-plans (parent NFR: "top-5 for related-plans"). */
const DEFAULT_RELATED_LIMIT = 5;

/**
 * Coerce a requested limit to a positive integer, else the default.
 * @param {*} limit
 * @returns {number}
 */
function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_RELATED_LIMIT;
}

/**
 * Surface the plans most similar to `planSlug`, self-excluded, cosine-ranked.
 *
 * @param {string} planSlug - The plan identifier used as the store `planPath` key
 *   (opaque; the caller must key consistently with how PI3 upserts — Decision D9).
 * @param {object} [opts]
 * @param {object|null} [opts.store]  Injected PI1 store handle; else `getWiring`.
 * @param {(texts: string[]) => Promise<{vectors: Float32Array[], source?: string}>} [opts.embedder]
 *        Injected async embedder (only used on the text-seeded fallback); else `getWiring`.
 * @param {string} [opts.projectPath]  Passed to `getWiring` when store/embedder absent.
 * @param {number} [opts.limit]        Top-N (default {@link DEFAULT_RELATED_LIMIT}).
 * @param {'plan'|'section'} [opts.kind] Restrict the KNN scan (default 'plan'; PI6 hook).
 * @returns {Promise<Array<object & {planPath: string, sectionId: string, score: number}>>}
 *          Cosine-descending, ≤ limit, self already excluded. Each result carries
 *          the store view fields (planPath, sectionId, kind, text, files, score).
 * @throws {TypeError} Only when `planSlug` is not a non-empty string. An empty
 *   index, no neighbours, a null store, or an un-embeddable absent seed all return
 *   `[]` — they never throw into the caller.
 */
async function related(planSlug, opts = {}) {
  if (typeof planSlug !== 'string' || planSlug.length === 0) {
    throw new TypeError('plan-index related: planSlug must be a non-empty string');
  }

  // Resolve injected deps, else lazy-require the wiring (mirrors s2 / actions.js).
  let store = opts.store;
  let embedder = opts.embedder;
  if (store === undefined || embedder === undefined) {
    // Lazy-required ONLY when not injected — string-literal require, avoids an
    // eager cycle (the barrel reaches related via a lazy getter, never eagerly).
    let wiring = {};
    try {
      const { getWiring } = require('./wiring');
      wiring = getWiring({ projectPath: opts.projectPath }) || {};
    } catch {
      wiring = {}; // wiring unavailable → fail-open below (no store ⇒ [])
    }
    if (store === undefined) store = wiring.store;
    if (embedder === undefined) embedder = wiring.embedder;
  }

  // Empty / unavailable guard: no store, or a zero-unit index → []. No embed call.
  if (!store || typeof store.size !== 'number' || store.size === 0) {
    return [];
  }

  const kind = opts.kind === 'section' ? 'section' : 'plan';
  const limit = normalizeLimit(opts.limit);

  // ── seed from the plan's already-stored __plan__ vector (NO re-embed) ─────────
  const { PLAN_SENTINEL } = require('./store'); // string-literal require (constant)
  const seed = typeof store.getUnit === 'function' ? store.getUnit(planSlug, PLAN_SENTINEL) : null;

  if (seed && seed.embedding instanceof Float32Array && seed.embedding.length > 0) {
    // Common path: reuse the stored vector; store.search self-excludes the seed.
    try {
      const hits = store.search(seed.embedding, limit, { kind, excludePlanPath: planSlug });
      return Array.isArray(hits) ? hits : [];
    } catch {
      // An unexpected store.search throw (e.g. dimension mismatch) must not crash
      // the caller — degrade to empty (fail-open, "never break the menu").
      return [];
    }
  }

  // ── text-seeded fallback: the plan is not yet indexed ─────────────────────────
  // Embed the slug text ONCE, then feed the query vector straight into the store's
  // TRUE-COSINE search — mirroring the common path so BOTH paths return cosine (not
  // the RRF scores s2 `search()` would produce). Still self-excluded via
  // excludePlanPath. Requires an embedder — without one there is nothing to embed,
  // so degrade to []. Any embed / search failure or a missing query vector is
  // fail-open → [].
  if (typeof embedder !== 'function') {
    return [];
  }
  try {
    const embedResult = await embedder([planSlug]); // the single embed
    const vectors = embedResult && Array.isArray(embedResult.vectors) ? embedResult.vectors : [];
    const qVec = vectors[0];
    if (!(qVec instanceof Float32Array) || qVec.length === 0) {
      return []; // no usable query vector → fail-open
    }
    const hits = store.search(qVec, limit, { kind, excludePlanPath: planSlug });
    return Array.isArray(hits) ? hits : [];
  } catch {
    return []; // fallback failure is still fail-open
  }
}

module.exports = {
  related,
  DEFAULT_RELATED_LIMIT,
};

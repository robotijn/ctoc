'use strict';

/**
 * PI4-s1 — Reciprocal Rank Fusion (RRF) + the MRR building block.
 *
 * Fuses N already-ranked lists into one ranking by RANK POSITION, not by raw
 * score: `rrf_score(d) = Σ_lists 1/(k + rank_list(d))` with `k = 60` (the
 * canonical Cormack, Clarke & Buettcher 2009 constant) and `rank` 1-based. A
 * document absent from a list contributes NOTHING from that list (it is not
 * treated as rank ∞ with an epsilon — it simply adds no term). That is what
 * makes RRF index-agnostic: it needs no cross-scale normalization between BM25's
 * unbounded term-frequency scores and cosine's [-1, 1], and it is what makes the
 * ablation guarantee exact (zeroing a retriever removes its contribution wholly).
 *
 * Pure logic: no imports, no fs, no path, no os. Runs identically on every
 * platform. The accumulator is a Map (keyed on the possibly-untrusted item id),
 * so an id of "__proto__" can never pollute Object.prototype.
 */

/**
 * The canonical RRF damping constant. Exported (not inlined) so the tests and the
 * s2 search module reference one source of truth.
 * @type {number}
 */
const RRF_K = 60;

/**
 * Reciprocal Rank Fusion of N ranked lists into one fused ranking.
 *
 * @param {Array<Array<{ id: string }>>} rankedLists - Each inner array is ONE
 *   retriever's results, already ordered best-first. Only `id` is read; any extra
 *   fields (score, planPath, …) are ignored. Empty outer array and empty inner
 *   arrays are valid and yield `[]`.
 * @param {{ k?: number }} [opts] - RRF constant; defaults to {@link RRF_K} (60).
 * @returns {Array<{ id: string, score: number }>} The union of all ids, each with
 *   its summed RRF score, ordered by descending score. Ties break deterministically
 *   by ascending id (string compare) so the ordering is stable and test-assertable.
 * @throws {TypeError} When `rankedLists` is not an array, an inner element is not
 *   an array, an item lacks a string `id`, or `opts.k` is not a number.
 */
function fuseRRF(rankedLists, opts = {}) {
  if (!Array.isArray(rankedLists)) {
    throw new TypeError('fuseRRF: rankedLists must be an array of ranked lists');
  }
  const k = opts && opts.k !== undefined ? opts.k : RRF_K;
  if (typeof k !== 'number' || !Number.isFinite(k)) {
    throw new TypeError('fuseRRF: opts.k must be a finite number');
  }

  // Map accumulator — proto-safe even when an id is "__proto__" / "constructor".
  const scores = new Map();

  for (const list of rankedLists) {
    if (!Array.isArray(list)) {
      throw new TypeError('fuseRRF: each element of rankedLists must be an array');
    }
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item.id !== 'string') {
        throw new TypeError('fuseRRF: each ranked item must have a string "id"');
      }
      const rank = i + 1; // 1-based rank, per list.
      const contribution = 1 / (k + rank);
      scores.set(item.id, (scores.get(item.id) || 0) + contribution);
    }
  }

  const fused = [];
  for (const [id, score] of scores) {
    fused.push({ id, score });
  }

  // Descending score; deterministic ascending-id tie-break.
  fused.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  return fused;
}

/**
 * Per-query reciprocal rank: `1/rank` (1-based) of the first element whose
 * `id === expectedId`, or `0` when absent. Averaging this across a query set gives
 * Mean Reciprocal Rank (MRR) — the metric the falsifiability / ablation tests use
 * to compare score_bm25, score_knn and score_rrf.
 *
 * @param {Array<{ id: string }>} ranking - Ordered best-first.
 * @param {string} expectedId - The relevant document's id (non-empty string).
 * @returns {number} `1/rank` of the first match, or `0` if not found.
 * @throws {TypeError} When `ranking` is not an array or `expectedId` is not a
 *   non-empty string.
 */
function reciprocalRank(ranking, expectedId) {
  if (!Array.isArray(ranking)) {
    throw new TypeError('reciprocalRank: ranking must be an array');
  }
  if (typeof expectedId !== 'string' || expectedId.length === 0) {
    throw new TypeError('reciprocalRank: expectedId must be a non-empty string');
  }
  for (let i = 0; i < ranking.length; i += 1) {
    const item = ranking[i];
    if (item && item.id === expectedId) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

module.exports = { RRF_K, fuseRRF, reciprocalRank };

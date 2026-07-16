/**
 * Cross-regime compliance-finding dedup (EC5-s2).
 *
 * When `active_profiles` contains both `gdpr` (EC2) and `eu-ai-act-high-risk`
 * (EC3), the two agents can emit findings for the SAME regulatory gap described
 * differently (e.g. GDPR Art. 5(1)(e) data minimization ↔ EU AI Act Art. 10
 * data governance). The CTOC synthesizer is `(file, line)`-oriented and cannot
 * dedup coordinate-less legal findings. This module is the minimal,
 * purpose-built dedup keyed on `(kind, regulation_ref_normalized)`.
 *
 * Load-bearing properties:
 *   - PURE: imports NOTHING; no fs, no paths, no OS-specific behaviour, no gate
 *     logic. Trivially unit-testable and reusable by EC5-s3 orchestration.
 *   - CONSERVATIVE MERGE: merge ONLY when `kind` is identical AND the topic
 *     extracted from `regulation_ref` is identical. When in doubt, keep BOTH —
 *     a false-negative on dedup is safe advisory noise; a false-positive merge
 *     of unrelated findings is the real harm.
 *   - NORMALIZATION IS DATA, NOT RUNTIME REGEX. `REGULATION_TOPIC_TABLE` maps
 *     known regulation-reference stems to a canonical topic slug. Extend the
 *     merge behaviour by adding data rows, never by loosening a regex over free
 *     text. An unknown ref falls back to its own trimmed/lowercased value, so
 *     it can never collide with a known topic.
 *   - FAIL-SAFE: non-array arguments coerce to `[]`; non-object elements pass
 *     through unchanged; never throws for object/array inputs.
 *   - NEVER MUTATES its inputs (survivors are fresh shallow copies).
 *
 * Cross-platform by construction.
 */

'use strict';

/**
 * Conservative merge table: known regulation-reference stems → canonical topic
 * slug. Two findings merge only when they share `kind` AND land on the same
 * topic slug here. Seed rows are grounded in the parent's worked example
 * (GDPR Art. 5 data minimization ↔ EU AI Act Art. 10 data governance). Extend
 * by ADDING rows — never by loosening the match. Frozen: no untrusted key is
 * ever assigned here; keys are only ever looked up.
 * @type {Readonly<Record<string, string>>}
 */
const REGULATION_TOPIC_TABLE = Object.freeze({
  'gdpr art. 5': 'data-governance',
  'gdpr art. 5(1)(e)': 'data-governance',
  'eu-ai-act art. 10': 'data-governance',
});

/**
 * Confidence rank for survivor selection. `undefined`/unknown ⇒ 0. Frozen.
 * @type {Readonly<Record<string, number>>}
 */
const CONFIDENCE_ORDER = Object.freeze({ high: 3, medium: 2, low: 1 });

/**
 * Normalize a `regulation_ref` string to a canonical topic slug.
 *
 * Look up the trimmed, lowercased ref in `REGULATION_TOPIC_TABLE`; on a hit
 * return the canonical topic slug, otherwise fall back to the trimmed,
 * lowercased ref itself (so unknown refs never collide with a known topic).
 * Non-string input ⇒ `''`.
 *
 * The lookup key is a `hasOwnProperty` check against a frozen literal — no
 * dynamic RegExp is ever built from the input (no ReDoS surface).
 *
 * @param {string} regulationRef
 * @returns {string} canonical topic slug, or '' for non-string input.
 */
function normalizeRegulationRef(regulationRef) {
  if (typeof regulationRef !== 'string') return '';
  const stem = regulationRef.trim().toLowerCase();
  if (stem === '') return '';
  if (Object.prototype.hasOwnProperty.call(REGULATION_TOPIC_TABLE, stem)) {
    return REGULATION_TOPIC_TABLE[stem];
  }
  return stem;
}

/**
 * Compute the dedup key for a finding: `${kind}::${normalizedTopic}`. A finding
 * missing `kind` or `regulation_ref` uses `''` for that part — so a `''` kind
 * never merges across different regulation topics (conservative). Never throws.
 *
 * @param {object} finding
 * @returns {string}
 */
function dedupKey(finding) {
  const kind = finding && typeof finding === 'object' ? finding.kind || '' : '';
  const ref = finding && typeof finding === 'object' ? finding.regulation_ref : undefined;
  return `${kind}::${normalizeRegulationRef(ref)}`;
}

/**
 * True when a finding resolves to NO topic (its `regulation_ref` normalizes to
 * `''`). Real GDPR findings carry `gdpr_article` + `kind` only and NEVER a
 * `regulation_ref`, so they all normalize to `''`; such a finding must NEVER be
 * mergeable — otherwise distinct Articles sharing a `kind` collapse to the key
 * `${kind}::` and all but the highest-confidence one are silently dropped.
 */
function hasNoTopic(finding) {
  const ref = finding && typeof finding === 'object' ? finding.regulation_ref : undefined;
  return normalizeRegulationRef(ref) === '';
}

/** Numeric confidence rank; unknown/undefined ⇒ 0. */
function confidenceRank(finding) {
  if (!finding || typeof finding !== 'object') return 0;
  return CONFIDENCE_ORDER[finding.confidence] || 0;
}

/**
 * Build the merged `message` naming both regulation sources so the user sees
 * the cross-regime overlap. Order: survivor's own ref first, then the other.
 */
function mergedMessage(survivor, other) {
  const refA = (survivor && survivor.regulation_ref) || '';
  const refB = (other && other.regulation_ref) || '';
  const base = (survivor && survivor.message) || '';
  const overlap = `Cross-regime overlap: ${refA} ↔ ${refB}.`;
  return base ? `${base} ${overlap}` : overlap;
}

/**
 * Deduplicate plan-stage compliance findings across regimes on a
 * `(kind, regulation_ref_normalized)` key.
 *
 * The EC2 (GDPR) list is concatenated FIRST for stable first-seen precedence.
 * Findings are grouped by `dedupKey`. For each group:
 *   - one member  → kept as-is;
 *   - >1 member   → keep the highest-confidence member (EC2/first on a tie);
 *     the survivor is a fresh shallow copy whose `message` names both
 *     regulation sources and whose `severity` is forced to `'critical'`.
 * Non-object elements are never merged (their key computes over `undefined`
 * fields safely) and pass through unchanged. Output preserves first-seen key
 * order. Inputs are never mutated.
 *
 * @param {object[]} ec2Findings - GDPR (EC2) findings; non-array ⇒ [].
 * @param {object[]} ec3Findings - EU-AI-Act (EC3) findings; non-array ⇒ [].
 * @returns {object[]} merged, de-duplicated list.
 */
function deduplicateFindings(ec2Findings, ec3Findings) {
  const ec2 = Array.isArray(ec2Findings) ? ec2Findings : [];
  const ec3 = Array.isArray(ec3Findings) ? ec3Findings : [];
  const all = [...ec2, ...ec3];

  // Map<key, { survivor, merged, first }> — first-seen insertion order.
  const groups = new Map();

  for (const finding of all) {
    const key = dedupKey(finding);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { survivor: finding, merged: false, first: finding });
      continue;
    }

    // Collision. Members that never merge — a non-object, OR a finding with no
    // resolvable topic (empty normalized ref) — are kept distinct by pushing
    // under a unique synthetic key so BOTH survive. A shared `kind` with an
    // empty topic (every ref-less GDPR finding) must not collapse distinct
    // Articles; when the challenger has no topic the incumbent shares its empty
    // topic too (same key), so checking the challenger is sufficient.
    if (
      !finding || typeof finding !== 'object' ||
      !existing.survivor || typeof existing.survivor !== 'object' ||
      hasNoTopic(finding)
    ) {
      // Preserve both: re-insert the incoming element under a fresh unique key.
      let uniq = key;
      let n = 0;
      while (groups.has(uniq)) uniq = `${key}#${++n}`;
      groups.set(uniq, { survivor: finding, merged: false, first: finding });
      continue;
    }

    // Both are objects that genuinely share the key → conservative merge.
    // Higher confidence wins; EC2/first-seen wins on a tie (strictly-greater
    // required to displace the incumbent, so the incumbent — always earlier in
    // `all`, hence EC2-preferring — keeps a tie).
    const incumbentRank = confidenceRank(existing.survivor);
    const challengerRank = confidenceRank(finding);
    const winner = challengerRank > incumbentRank ? finding : existing.survivor;
    const loser = winner === finding ? existing.survivor : finding;

    existing.survivor = { ...winner, message: mergedMessage(winner, loser), severity: 'critical' };
    existing.merged = true;
  }

  return [...groups.values()].map((g) => g.survivor);
}

module.exports = {
  deduplicateFindings,
  normalizeRegulationRef,
  dedupKey,
  REGULATION_TOPIC_TABLE,
  CONFIDENCE_ORDER,
};

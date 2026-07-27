'use strict';

/**
 * PI6-s1 — `detectConflicts(planSlug, opts)`: conflict/dependency detection core.
 *
 * Two plans that touch the same source files with a similar intent are latent
 * conflicts (the B1/B2 class). Vector similarity alone (similar topic, different
 * files) is insufficient; `files:` overlap alone (same file, unrelated feature,
 * cosine below threshold) is insufficient. BOTH must hold — a strict AND.
 *
 * ── Design (per plans/todo/pi6-s1-conflict-detect-core.md) ───────────────────────
 *
 * • SIMILARITY HALF — `related(planSlug, { kind: 'section', limit: 20, store,
 *   embedder, projectPath })` (PI4) returns the ≤20 section-vector neighbours,
 *   cosine-descending, self-excluded (the store's `excludePlanPath` does the
 *   self-exclusion). No new retrieval logic is added here.
 *
 * • OVERLAP HALF — read the target's and each candidate's `files:` via
 *   `store.getFilesForPlan(slug)` (PI1, O(1) Map read of the `__plan__` unit) and
 *   test every (targetGlob, candidateGlob) pair BIDIRECTIONALLY with the
 *   authoritative `globToRegex` (src/lib/plan-coverage.js — the SAME impl the
 *   enforcement hook uses; no 5th copy of glob logic). A broad glob on either side
 *   matching a literal on the other counts as overlap.
 *
 * • THE AND — a candidate is flagged ONLY when its best section score
 *   `>= conflict_threshold` AND at least one file-overlap pair matches. The
 *   threshold is `getSetting('plan_index','conflict_threshold',projectPath)`,
 *   falling back to {@link DEFAULT_CONFLICT_THRESHOLD} when unset / non-number /
 *   throwing.
 *
 * • BROAD-OVERLAP DOWNGRADE — a candidate whose matched glob matches > 50% of the
 *   DISTINCT literal `files:` entries across the whole index is a "broad overlap"
 *   (a sweeping glob overlaps almost everything and is less actionable as a
 *   specific conflict) rather than a "potential conflict or dependency".
 *
 * • FAIL-OPEN everywhere but a caller bug. Null store, a zero-unit index, a target
 *   with no `files:`, no neighbours, or a throwing `related`/`getSetting` all
 *   return `[]` (never a throw into the caller — the overview/inbox render must
 *   never crash). Only a non-string / empty `planSlug` throws (`TypeError`).
 *
 * • DEPENDENCY INJECTION. `store` / `embedder` / `getSetting` come from `opts`
 *   (tests inject a real `openStore` over a temp JSON + a spy embedder + a stub
 *   getSetting); when absent they resolve via `getWiring({projectPath})` /
 *   the real `getSetting` (lazy string-literal requires, mirroring related.js —
 *   avoids an eager barrel/require cycle).
 *
 * Cross-platform: pure JS over the injected store + `globToRegex`; NO fs/path/os of
 * its own; glob semantics delegated to the audited, ReDoS-safe `globToRegex`.
 */

const { globToRegex } = require('../plan-coverage');

/**
 * Fallback conflict threshold when the `plan_index.conflict_threshold` setting is
 * unset, non-numeric, or its read throws. Section cosine >= this flags a candidate
 * (given file overlap). Registered in the settings schema alongside
 * `duplicate_threshold`; this constant is the last-resort default.
 * @type {number}
 */
const DEFAULT_CONFLICT_THRESHOLD = 0.78;

/** Candidate cap — mirrors the `related` limit so ≤20 candidate file reads occur. */
const CANDIDATE_LIMIT = 20;

/**
 * The store key shape `plans/<stage>/<slug>.md` (the D9 normalized planPath). The
 * stage is derivable from the key with no extra read — the cheap half of the
 * landed-gate. A key that does NOT match is treated as "landed-check NOT
 * APPLICABLE": the row keeps its original severity and is never dropped, which is
 * exactly what preserves every existing detectConflicts test whose keys are opaque
 * (`'target'`, `'cand'`).
 * @type {RegExp}
 */
const PLAN_KEY_RE = /^plans\/([^/]+)\/(.+)\.md$/;

/**
 * Stages whose plans are FINISHED WORK by definition — a candidate resident here is
 * not a live conflict, decided cheaply and certainly from the key alone (no git).
 * This alone removes most already-landed false positives.
 * @type {ReadonlySet<string>}
 */
const LANDED_STAGES = Object.freeze(new Set(['done', 'review']));

/**
 * Severity for a surviving row whose landed-check COULD NOT RUN (git unavailable,
 * or the check errored). The row is passed through UNFILTERED and LABELLED — an
 * unavailable landed-check must never read as "no conflict", which would be this
 * slice's own defect turned inward. The existing severity enum is EXTENDED, not
 * replaced; `renderConflictPanel` reads `severity` as an opaque label and renders
 * any string, so an added value degrades gracefully (confirmed by reading it).
 * @type {string}
 */
const SEVERITY_UNVERIFIED = 'potential conflict or dependency (landed-check unavailable)';

/**
 * The DISTINCT overlap between two glob sets, bidirectional. For each pair
 * `(t, c)`, they overlap when `globToRegex(t).test(c)` OR `globToRegex(c).test(t)`
 * — a broad glob on either side that matches the other's (possibly literal) entry.
 * Returns the DISTINCT set of the more-specific member of each matched pair (the
 * one WITHOUT a `*`, so a concrete path is surfaced when one exists; when both are
 * globs, the target's glob is listed).
 *
 * @param {string[]} targetGlobs
 * @param {string[]} candidateGlobs
 * @returns {string[]} distinct matched entries (may be empty)
 */
function filesOverlap(targetGlobs, candidateGlobs) {
  if (!Array.isArray(targetGlobs) || !Array.isArray(candidateGlobs)) return [];
  if (targetGlobs.length === 0 || candidateGlobs.length === 0) return [];
  const matched = new Set();
  for (const t of targetGlobs) {
    if (typeof t !== 'string' || t.length === 0) continue;
    for (const c of candidateGlobs) {
      if (typeof c !== 'string' || c.length === 0) continue;
      let hit = false;
      try {
        hit = globToRegex(t).test(c) || globToRegex(c).test(t);
      } catch {
        hit = false; // a pathological glob never breaks detection (fail-open)
      }
      if (!hit) continue;
      // Prefer the concrete (glob-free) member so the flag names a real path.
      const tIsGlob = t.indexOf('*') !== -1 || t.indexOf('?') !== -1;
      const cIsGlob = c.indexOf('*') !== -1 || c.indexOf('?') !== -1;
      if (!tIsGlob) matched.add(t);
      else if (!cIsGlob) matched.add(c);
      else matched.add(t); // both globs → list the target's glob
    }
  }
  return [...matched];
}

/**
 * The DISTINCT `files:` entries across every plan in the store — used ONCE per
 * `detectConflicts` call to compute the broad-glob percentage. Bounded and
 * synchronous (O(plans)). Never throws.
 *
 * @param {object} store
 * @returns {string[]}
 */
function collectAllIndexFiles(store) {
  const seen = new Set();
  try {
    const plans = typeof store.listPlanPaths === 'function' ? store.listPlanPaths() : [];
    for (const p of plans) {
      const files = typeof store.getFilesForPlan === 'function' ? store.getFilesForPlan(p) : [];
      if (Array.isArray(files)) {
        for (const f of files) if (typeof f === 'string' && f.length > 0) seen.add(f);
      }
    }
  } catch {
    return []; // a broken enumeration only disables the downgrade, never throws
  }
  return [...seen];
}

/**
 * True when `glob` (via `globToRegex`) matches MORE THAN 50% of the DISTINCT
 * LITERAL (glob-free) entries across the whole index. A sweeping glob (e.g.
 * `src/lib/**`) overlaps almost everything and is downgraded to "broad overlap".
 *
 * @param {string} glob
 * @param {string[]} allIndexFiles  DISTINCT files across the index.
 * @returns {boolean}
 */
function isBroadGlob(glob, allIndexFiles) {
  if (typeof glob !== 'string' || glob.length === 0) return false;
  const literals = allIndexFiles.filter((f) => f.indexOf('*') === -1 && f.indexOf('?') === -1);
  if (literals.length === 0) return false;
  let re;
  try {
    re = globToRegex(glob);
  } catch {
    return false;
  }
  let matches = 0;
  for (const lit of literals) {
    let hit = false;
    try { hit = re.test(lit); } catch { hit = false; }
    if (hit) matches += 1;
  }
  return matches / literals.length > 0.5;
}

/**
 * Read the effective conflict threshold, fail-open to the default.
 * @param {Function|undefined} getSettingFn
 * @param {string|undefined} projectPath
 * @returns {number}
 */
function resolveThreshold(getSettingFn, projectPath) {
  if (typeof getSettingFn !== 'function') return DEFAULT_CONFLICT_THRESHOLD;
  let v;
  try {
    v = getSettingFn('plan_index', 'conflict_threshold', projectPath);
  } catch {
    return DEFAULT_CONFLICT_THRESHOLD;
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_CONFLICT_THRESHOLD;
}

/**
 * Detect the plans that CONFLICT WITH or DEPEND ON `planSlug`: those that are BOTH
 * section-vector similar (>= the conflict threshold) AND glob-`files:`-overlapping.
 *
 * @param {string} planSlug  Plan key (store `planPath`; opaque — the caller keys
 *   consistently with PI3 upserts, Decision D9).
 * @param {object} [opts]
 * @param {object|null} [opts.store]     Injected PI1 store; else `getWiring`.
 * @param {Function} [opts.embedder]     Injected async embedder (only the
 *   text-seeded `related` fallback uses it); else `getWiring`.
 * @param {Function} [opts.getSetting]   Injected getSetting (tests); else the real one.
 * @param {string} [opts.projectPath]    Passed to `getWiring` / `getSetting` and the landed-check.
 * @param {Function} [opts.landedResolver] Injected git-backed landed-evidence
 *   producer `(slug, stage) => StaleEvidence` (tests); else resolves through the
 *   stale-detector's `verifyStaleCandidate` against `projectPath`.
 * @returns {Promise<Array<{ conflictingPlan: string, overlappingFiles: string[], score: number, severity: string }>>}
 *   Cosine-descending. Empty on any data condition (fail-open).
 * @throws {TypeError} ONLY when `planSlug` is not a non-empty string (caller bug).
 */
async function detectConflicts(planSlug, opts = {}) {
  if (typeof planSlug !== 'string' || planSlug.length === 0) {
    throw new TypeError('plan-index detectConflicts: planSlug must be a non-empty string');
  }

  // Resolve injected deps, else lazy-require the wiring (mirrors related.js).
  let store = opts.store;
  let embedder = opts.embedder;
  if (store === undefined || embedder === undefined) {
    let wiring = {};
    try {
      const { getWiring } = require('./wiring'); // string-literal require, no eager cycle
      wiring = getWiring({ projectPath: opts.projectPath }) || {};
    } catch {
      wiring = {};
    }
    if (store === undefined) store = wiring.store;
    if (embedder === undefined) embedder = wiring.embedder;
  }
  const getSettingFn = typeof opts.getSetting === 'function'
    ? opts.getSetting
    : (() => { try { return require('../settings').getSetting; } catch { return undefined; } })();

  // Empty / unavailable guard — no store, or a zero-unit index → [].
  if (!store || typeof store.size !== 'number' || store.size === 0) return [];

  // Overlap half can never hold without target files → [] (with a best-effort note).
  const targetFiles = typeof store.getFilesForPlan === 'function' ? store.getFilesForPlan(planSlug) : [];
  if (!Array.isArray(targetFiles) || targetFiles.length === 0) return [];

  const threshold = resolveThreshold(getSettingFn, opts.projectPath);

  // Similarity half — top-20 section neighbours, self-excluded by the store. Any
  // throw/rejection degrades to no neighbours (fail-open), never crashing a caller.
  let hits = [];
  try {
    const { related } = require('./related'); // string-literal require, no eager cycle
    const r = await related(planSlug, {
      kind: 'section',
      limit: CANDIDATE_LIMIT,
      store,
      // `related` only uses embedder on its text-seeded fallback; its own signature
      // narrows the type. Cast through the store's opts shape (embedder is optional).
      embedder: /** @type {any} */ (embedder),
      projectPath: opts.projectPath,
    });
    hits = Array.isArray(r) ? r : [];
  } catch {
    hits = [];
  }
  if (hits.length === 0) return [];

  // Group hits by candidate plan, keeping each candidate's MAX section score.
  /** @type {Map<string, number>} */
  const maxScore = new Map();
  for (const h of hits) {
    if (!h || typeof h.planPath !== 'string') continue;
    if (h.planPath === planSlug) continue; // defence-in-depth; store already excludes self
    const s = typeof h.score === 'number' ? h.score : -Infinity;
    const prev = maxScore.get(h.planPath);
    if (prev === undefined || s > prev) maxScore.set(h.planPath, s);
  }

  // ── the LANDED term ──────────────────────────────────────────────────────────
  // A plan describing a change is not evidence the change is pending. A conflict is
  // only LIVE when the candidate's own work has not yet landed; finished work cannot
  // collide with anything in the future. The git-backed check resolves through the
  // stale-detector's derivation (via a lazy string-literal require, mirroring
  // `related`/`getWiring` — no eager import, no cycle), sharing ONE full-history
  // scan across every candidate via a single hoisted cache.
  const projectRoot = opts.projectPath || process.cwd();
  const slugHistoryCache = {};
  const landedResolver = typeof opts.landedResolver === 'function'
    ? opts.landedResolver
    : (slug, stage) => {
        const { verifyStaleCandidate } = require('../stale-detector'); // string-literal, no cycle
        return verifyStaleCandidate({ plan: slug, stage }, projectRoot, { slugHistoryCache });
      };
  /**
   * Resolve whether a store-keyed plan is FINISHED work.
   * @returns {{landed:boolean, ran:boolean, applicable:boolean}}
   *   - applicable:false — the key is not a plan path; the landed-check does not
   *     apply (row keeps its original severity, never dropped).
   *   - done/review stage — landed:true, decided cheaply from the key (no git).
   *   - a parseable key whose git-backed check could not run (git unavailable or a
   *     throw) — applicable:true, ran:false ⇒ the row SURVIVES, labelled unverified.
   *   FAIL-OPEN: a landed-check that cannot run must NEVER remove a conflict.
   */
  const landedFor = (key) => {
    const m = PLAN_KEY_RE.exec(typeof key === 'string' ? key : '');
    if (!m) return { landed: false, ran: false, applicable: false };
    if (LANDED_STAGES.has(m[1])) return { landed: true, ran: true, applicable: true };
    try {
      const ev = landedResolver(m[2], m[1]);
      if (!ev || ev.gitAvailable !== true) return { landed: false, ran: false, applicable: true };
      return { landed: ev.landedBySelf === true || ev.landedByOther === true, ran: true, applicable: true };
    } catch {
      return { landed: false, ran: false, applicable: true };
    }
  };

  // The index-wide file set backs the broad-glob downgrade. It is computed LAZILY —
  // only the first time a flagged candidate actually carries a glob — so the common
  // case (all-literal `files:`) never pays the O(plans) enumeration, keeping the
  // per-candidate work to a single capped getFilesForPlan read (≤20 candidates).
  let allIndexFiles = null;
  const indexFiles = () => {
    if (allIndexFiles === null) allIndexFiles = collectAllIndexFiles(store);
    return allIndexFiles;
  };

  /** @type {Array<{ conflictingPlan: string, overlappingFiles: string[], score: number, severity: string }>} */
  const rows = [];
  for (const [candidate, score] of maxScore) {
    if (!(score >= threshold)) continue; // similarity half of the AND
    const candFiles = typeof store.getFilesForPlan === 'function' ? store.getFilesForPlan(candidate) : [];
    const overlap = filesOverlap(targetFiles, candFiles); // overlap half of the AND
    if (overlap.length === 0) continue;
    // LANDED term: finished work is not a live conflict (the human's twelve, silenced).
    const landed = landedFor(candidate);
    if (landed.landed) continue;
    // Broad-overlap downgrade: any candidate glob that sweeps > 50% of the index.
    const broad = Array.isArray(candFiles)
      && candFiles.some((g) => typeof g === 'string' && (g.indexOf('*') !== -1 || g.indexOf('?') !== -1) && isBroadGlob(g, indexFiles()));
    // A surviving row whose landed-check could not run is passed through, LABELLED.
    const unverified = landed.applicable && landed.ran === false;
    rows.push({
      conflictingPlan: candidate,
      overlappingFiles: overlap,
      score,
      severity: broad
        ? 'broad overlap'
        : (unverified ? SEVERITY_UNVERIFIED : 'potential conflict or dependency'),
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return rows;
}

module.exports = {
  detectConflicts,
  DEFAULT_CONFLICT_THRESHOLD,
  SEVERITY_UNVERIFIED,
};

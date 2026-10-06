'use strict';

/**
 * THE APPROVED BUILD QUEUE — a READ-ONLY view of which approved plans wait to be
 * built, and in what order. It never decides whether a session may stop.
 *
 * It once did: a "derived approved-queue regime" (v6.13.18) made the Stop hook refuse
 * to end a turn whenever approved plans waited, even when no human had started a
 * batch — up to 100 blocks in a row. That regime is removed (plan "CTOC does no
 * unasked work at session start or stop", 2026-10-06): only a batch a human
 * explicitly started with `continuation.startBatch` holds a session open, and that
 * lives in `src/lib/continuation.js`. A `.ctoc/state/continuation-queue.json` left by
 * the old regime in an existing project is inert; nothing reads it.
 *
 * What remains, and its live callers:
 *   - `approvedFreeQueue` — the enumerator: plans in `plans/todo/` and
 *     `plans/in-progress/` that a build-gate ledger entry vouches for.
 *   - `nextBuildable` — the same queue in build order (dependencies first, then
 *     criticality); read by `src/lib/loop-b-driver.js` for its "Next up to build" line.
 *   - `approvedQueueBannerLine` — the count shown in the session-start banner
 *     (`src/hooks/SessionStart.js`).
 *
 * "APPROVED" IS APPLIED IN ONE PLACE — `approvedFreeQueue`: a plan counts only when
 * `approval-residency.isApprovedForCoverage` (CTOC's single encoding of "is this
 * resident plan approved") vouches for it — the todo edge for todo, and also for
 * in-progress, because a building plan carries the entry it crossed with. A plan with
 * no ledger entry or a tampered specification is EXCLUDED.
 *
 * FAIL-OPEN: every queue or ledger read error yields an empty queue or a silent
 * banner, never a throw — session start runs every session and must never break.
 */

const path = require('path');
const safeFs = require('./safe-fs');

/**
 * THE ENUMERATOR. Walk `plans/todo/` and `plans/in-progress/` and include a plan
 * ONLY when a build-gate ledger entry vouches for it. FAIL-OPEN and fault-isolated: a
 * missing/unreadable stage dir contributes zero (never throws); a per-plan classify
 * fault skips that plan.
 *
 * @param {string} root - the project root
 * @returns {{ refs: string[], depth: number }} `refs` are `stage/file.md`, `depth`
 *   is their count.
 */
function approvedFreeQueue(root) {
  const refs = [];
  if (!root || typeof root !== 'string') return { refs, depth: 0 };
  let getPlansDir;
  let isApprovedForCoverage;
  try {
    ({ getPlansDir } = require('./state'));
    ({ isApprovedForCoverage } = require('./approval-residency'));
  } catch {
    return { refs, depth: 0 };
  }
  let plansDir;
  try {
    plansDir = getPlansDir(root);
  } catch {
    return { refs, depth: 0 };
  }
  for (const stage of ['todo', 'in-progress']) {
    const stageDir = path.join(plansDir, stage);
    let files;
    try {
      files = safeFs.readdirSync(stageDir);
    } catch {
      // Absent/unreadable stage dir contributes zero — never a throw.
      continue;
    }
    for (const file of files) {
      if (typeof file !== 'string' || !file.endsWith('.md')) continue;
      const planPath = path.join(stageDir, file);
      try {
        if (isApprovedForCoverage(planPath, stage, root).approved === true) {
          refs.push(`${stage}/${file}`);
        }
      } catch {
        // A per-plan classify fault is absorbed by SKIPPING that plan — an
        // unapproved or unclassifiable plan is never counted as approved work,
        // so its exclusion is the correct outcome, not a swallowed verdict. The
        // explicit `continue` states the swallow rather than silently falling
        // through.
        continue;
      }
    }
  }
  return { refs, depth: refs.length };
}

/**
 * Criticality tiers — LOWER rank builds sooner. Case-insensitive; an unset or
 * unrecognised priority ranks LAST (rank 4), so a plan that declares nothing never
 * jumps ahead of one that declares a real tier.
 * @type {Readonly<Record<string, number>>}
 */
const PRIORITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

/**
 * @param {*} p - a raw `priority` frontmatter value
 * @returns {number} 0..4, unknown/unset -> 4
 */
function priorityRank(p) {
  const s = String(p == null ? '' : p).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, s) ? PRIORITY_RANK[s] : 4;
}

/**
 * Normalize a `depends_on` frontmatter value into predecessor slugs. Handles every
 * real shape: an array (block-style list), the literal `none`, a single slug, or a
 * comma-separated list. Each slug is trimmed and stripped of a trailing `.md`; empty
 * and `none` entries are dropped.
 * @param {*} raw
 * @returns {string[]}
 */
function normalizeDeps(raw) {
  const items = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(',');
  const out = [];
  for (const it of items) {
    const slug = String(it).trim().replace(/\.md$/i, '');
    if (slug && slug.toLowerCase() !== 'none') out.push(slug);
  }
  return out;
}

/** Stages whose residents count as SATISFIED predecessors: built-and-waiting for the
 *  human (review) or shipped (done). */
const SATISFYING_STAGES = ['review', 'done'];
/** Stages whose residents are UNBUILT predecessors — the dep must be built first. */
const UNBUILT_STAGES = ['todo', 'in-progress', 'implementation'];

/**
 * Locate a predecessor plan by slug (basename, no extension) across the stage dirs and
 * classify its build-state. Fault-isolated: an unreadable located file yields a null
 * priority, never a throw.
 * @param {string} plansDir
 * @param {string} slug
 * @returns {{state: ('satisfied'|'unbuilt'|'missing'), priority?: *}}
 */
function locatePredecessor(plansDir, slug) {
  for (const stage of SATISFYING_STAGES) {
    if (safeFs.existsSync(path.join(plansDir, stage, `${slug}.md`))) return { state: 'satisfied' };
  }
  for (const stage of UNBUILT_STAGES) {
    const p = path.join(plansDir, stage, `${slug}.md`);
    if (!safeFs.existsSync(p)) continue;
    let priority = null;
    try {
      priority = require('./state').parseMetadata(safeFs.readFileSync(p, 'utf8')).priority;
    } catch {
      // Located but unreadable: state is still UNBUILT (it blocks), priority unknown.
      priority = null;
    }
    return { state: 'unbuilt', priority };
  }
  return { state: 'missing' };
}

/**
 * THE SELECTOR. Order the approved build queue for building: BUILDABLE plans (every
 * `depends_on` predecessor satisfied) most-critical first, plus the diagnostics an
 * engine needs to keep moving. PURE READ — no writes. FAIL-OPEN and fault-isolated
 * exactly like `approvedFreeQueue`: a bad root or unreadable stage contributes zero,
 * an unreadable plan is skipped, nothing throws.
 *
 * SATISFACTION: a predecessor in `plans/review/` (built, awaiting the human) or
 * `plans/done/` (shipped) is satisfied; one still in `todo`/`in-progress`/
 * `implementation` is not (build it first); one that resolves to NO plan file is
 * treated satisfied (a missing/external dep never blocks) but recorded in
 * `missingDeps`.
 *
 * INVERSION (surfaced, NEVER reordered): a `critical` plan blocked behind a
 * lower-criticality unbuilt predecessor is added to `inversions` so a human can
 * re-prioritise; the engine keeps building the predecessor regardless.
 *
 * @param {string} root - the project root
 * @returns {{ buildable: string[], blocked: Array<{ref: string, blockedBy: string[]}>,
 *   inversions: Array<{ref: string, blockedBy: string, reason: string}>,
 *   missingDeps: Array<{ref: string, dep: string}> }}
 *   `buildable` are `stage/file.md` refs in build order.
 */
function nextBuildable(root) {
  const result = { buildable: [], blocked: [], inversions: [], missingDeps: [] };
  const { refs } = approvedFreeQueue(root);
  if (refs.length === 0) return result;

  let plansDir;
  let parseMetadata;
  try {
    const state = require('./state');
    plansDir = state.getPlansDir(root);
    parseMetadata = state.parseMetadata;
  } catch {
    return result;
  }

  const ranked = []; // { ref, rank, queueIndex } for the buildable set
  refs.forEach((ref, queueIndex) => {
    const slash = ref.indexOf('/');
    const stage = ref.slice(0, slash);
    const file = ref.slice(slash + 1);
    let meta;
    try {
      meta = parseMetadata(safeFs.readFileSync(path.join(plansDir, stage, file), 'utf8'));
    } catch {
      // Race guard: a plan approvedFreeQueue enumerated then became unreadable is
      // SKIPPED, never a throw — same fault-isolation as the enumerator.
      return;
    }
    const selfRank = priorityRank(meta.priority);
    const unsatisfied = [];
    let invBlocker = null; // first lower-criticality unbuilt predecessor
    for (const dep of normalizeDeps(meta.depends_on)) {
      let loc;
      try {
        loc = locatePredecessor(plansDir, dep);
      } catch {
        loc = { state: 'missing' };
      }
      if (loc.state === 'missing') {
        result.missingDeps.push({ ref, dep });
        continue; // a missing/external dep never blocks
      }
      if (loc.state === 'satisfied') continue;
      unsatisfied.push(dep);
      if (invBlocker === null && priorityRank(loc.priority) > selfRank) invBlocker = dep;
    }

    if (unsatisfied.length === 0) {
      ranked.push({ ref, rank: selfRank, queueIndex });
    } else {
      result.blocked.push({ ref, blockedBy: unsatisfied });
      if (selfRank === 0 && invBlocker !== null) {
        result.inversions.push({
          ref,
          blockedBy: invBlocker,
          reason: 'critical plan blocked behind a lower-criticality unbuilt predecessor',
        });
      }
    }
  });

  ranked.sort((a, b) => a.rank - b.rank || a.queueIndex - b.queueIndex);
  result.buildable = ranked.map((r) => r.ref);
  return result;
}

/**
 * Fail-open wrapper: names the approved-queue depth for the session-start banner,
 * or '' for a falsy/invalid root or an empty queue — so the banner is unchanged for
 * a project with no approved work (purely ADDITIVE, crash-safe; SessionStart runs
 * every session and must never throw).
 * Shows ONLY a count: no path or filesystem-error string ever reaches the human.
 *
 * @param {string} root - the project root
 * @returns {string} a leading-newline banner line, or '' when nothing to show
 */
function approvedQueueBannerLine(root) {
  try {
    const { depth } = approvedFreeQueue(root);
    return depth > 0 ? `\nApproved queue: ${depth} plan(s) ready to build` : '';
  } catch {
    return '';
  }
}

module.exports = {
  approvedFreeQueue,
  approvedQueueBannerLine,
  priorityRank,
  normalizeDeps,
  locatePredecessor,
  nextBuildable,
};

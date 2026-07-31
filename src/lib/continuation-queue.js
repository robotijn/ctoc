'use strict';

/**
 * DERIVED-QUEUE CONTINUATION (slice 1 of 2) — the approved build queue IS the batch.
 *
 * The shipped continuation gate (`src/lib/continuation.js` +
 * `src/hooks/stop-continuation-gate.js`) makes a session CONTINUE, but only when a
 * human explicitly called `continuation.startBatch`. The owner's requirement — "when
 * CTOC starts it must not stop" — is that a live session with approved, fork-free
 * plans waiting in `plans/todo/` (and recoverable `plans/in-progress/`) must not go
 * idle WITHOUT an explicit startBatch. This module is the DECISION LOGIC for that:
 * a pure read that answers "is the approved queue undrained continuation work?".
 *
 * IT DOES NOT TOUCH THE STOP HOOK. Wiring the actual block-on-idle-stop is the
 * riskier change and is isolated into slice 2 (`00226`, which depends on this one),
 * so it can be reviewed and rolled back alone. This slice's LIVE consumer is
 * `approvedQueueBannerLine`, spliced into the session-start banner by
 * `src/hooks/SessionStart.js` — that is what makes this module reachable from a live
 * root (wired-is-done) and shows the human how much approved work waits.
 *
 * A SEPARATE MODULE AND A SEPARATE STATE FILE, NEVER A SHARED ONE.
 * `continuation.js` carries hard-won explicit-batch invariants (WEDGE-1/2/3, the
 * HARD_CEILING clamp). This module does not edit it and never writes its state file:
 * the derived regime lives in `.ctoc/state/continuation-queue.json`. Two files, one
 * regime each; a second regime writing the same file is how a divergence gets in.
 *
 * THE FIVE SAFETY PROPERTIES (mirroring the shipped gate):
 *   - BOUNDED: `MAX_QUEUE_BLOCKS` caps CONSECUTIVE no-progress blocks; any observed
 *     drain resets the count (see `effectiveBlocks`), so an undrainable queue flips
 *     to `exhausted` within the bound and a draining queue is never cut off.
 *   - FAIL-OPEN: every queue/ledger read error, a corrupt state file, or a failed
 *     counter-persist resolves toward ALLOWING the stop / a silent banner — never a
 *     throw. `shouldContinueQueue` coerces numerics toward allow (a safety gate fails
 *     open); `recordQueueBlock` RETURNS its persist-success boolean so the caller can
 *     fail open when the bound cannot advance (the WEDGE-1 analog).
 *   - HONEST: the banner names the real depth N; no path/filesystem-error string ever
 *     reaches a message (the banner shows only a count).
 *   - FORK-AWARE: `registerQueueFork`/`resolveQueueFork` pause and resume the derived
 *     batch; a pending fork allows the stop for the human.
 *   - ESCAPABLE: consumed by slice 2's hook (the escape hatch lives there).
 *
 * "APPROVED" AND "FORK-FREE" ARE APPLIED IN ONE PLACE — `approvedFreeQueue`:
 *   - Approved = a Gate-2 ledger entry vouches for it. `approval-residency`
 *     `isApprovedForCoverage` is CTOC's single encoding of "is this resident plan
 *     approved" (todo edge for todo, and ALSO for in-progress — a building plan
 *     carries the Gate-2 entry it crossed with; see `COVERAGE_STAGE_EDGE`). A plan
 *     with no ledger entry or a tampered spec is EXCLUDED — an unapproved plan is
 *     never authorized continuation work.
 *   - Fork-free by construction — a plan resident in todo/in-progress is POST-gate;
 *     its decision forks were answered before it crossed Gate 2, and a plan that
 *     hits a real fork mid-build is kicked back to a pre-gate stage and thereby
 *     LEAVES this queue (the queue shrinks). The remaining explicit fork signal is
 *     the `forkPending` flag.
 */

const path = require('path');
const safeFs = require('./safe-fs');

/** The derived-queue state file, distinct from continuation.js's file. */
const QUEUE_STATE_REL = path.join('.ctoc', 'state', 'continuation-queue.json');

/**
 * The ceiling on CONSECUTIVE no-progress blocks. This is a bound on *no-progress*
 * stops, not raw stops: any observed drain resets it (see `effectiveBlocks`), so it
 * need not be large. It is the hard guarantee that an undrainable queue cannot trap
 * the session forever. Deliberately much smaller than `continuation.HARD_CEILING`
 * (500) because, unlike an explicit batch that only advances, this budget self-resets
 * on progress.
 */
const MAX_QUEUE_BLOCKS = 100;

/**
 * Absolute path to the derived-queue state file under a project root.
 * @param {string} root
 * @returns {string}
 */
function queueStatePath(root) {
  return path.join(root, QUEUE_STATE_REL);
}

/**
 * Read the derived-queue state, or null when absent/unreadable/corrupt (fail-open,
 * exactly like `continuation.read`).
 * @param {string} root
 * @returns {Object|null}
 */
function readQueueState(root) {
  if (!root || typeof root !== 'string') return null;
  const p = queueStatePath(root);
  try {
    if (!safeFs.existsSync(p)) return null;
    const parsed = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist the derived-queue state. Best-effort; returns false on failure (mirrors
 * `continuation.write`).
 * @param {string} root
 * @param {Object} state
 * @returns {boolean}
 */
function writeQueueState(root, state) {
  if (!root || typeof root !== 'string') return false;
  const p = queueStatePath(root);
  try {
    safeFs.mkdirSync(path.dirname(p), { recursive: true });
    safeFs.writeFileSync(p, JSON.stringify(state, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * THE ENUMERATOR. Walk `plans/todo/` and `plans/in-progress/` and include a plan
 * ONLY when a Gate-2 ledger entry vouches for it. FAIL-OPEN and fault-isolated: a
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
        // unapproved or unclassifiable plan is never authorized continuation work,
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
 * THE SINGLE progress rule, used by BOTH the decision and the recorder so they
 * cannot drift. Observed drain (depth strictly below the last recorded depth) resets
 * the budget to 0; otherwise the persisted count carries. This is what makes the
 * bound track REAL lack of progress and self-heal the instant the queue drains again.
 *
 * @param {Object} state - the current derived-queue state (or `{}`)
 * @param {number} depth - the current approved-queue depth
 * @returns {number} the effective no-progress block count
 */
function effectiveBlocks(state, depth) {
  const progressed = Number.isFinite(state.lastQueueDepth) && depth < state.lastQueueDepth;
  return progressed ? 0 : (Number.isFinite(state.blocks) ? state.blocks : 0);
}

/**
 * THE DECISION the Stop hook (slice 2) will consume. PURE READ, writes nothing
 * (mirrors `continuation.shouldContinue`). Coerces numerics toward ALLOW — a safety
 * gate fails open.
 *
 * @param {string} root - the project root
 * @returns {{continue: boolean, reason: string, depth?: number, refs?: string[], fork?: boolean, exhausted?: boolean, buildOrder?: ReturnType<typeof nextBuildable>}}
 */
function shouldContinueQueue(root) {
  const state = readQueueState(root) || {};
  if (state.forkPending === true) {
    return {
      continue: false,
      reason: `queue fork pending — ${state.forkReason || 'human decision required'}`,
      fork: true,
    };
  }
  const { refs, depth } = approvedFreeQueue(root);
  if (!(depth > 0)) {
    return { continue: false, reason: 'approved queue empty', depth: 0 };
  }
  const eff = effectiveBlocks(state, depth);
  if (eff >= MAX_QUEUE_BLOCKS) {
    return {
      continue: false,
      reason: 'queue continuation block-budget exhausted — standing down',
      exhausted: true,
      depth,
    };
  }
  // ADDITIVE `buildOrder`: the SAME decision object the Stop hook already consumes now
  // also answers "which approved plan next, in what order" — dependency-and-criticality
  // ordered, with the blocked/inversion/missing diagnostics. Existing consumers read
  // only `continue`/`depth`; this field is extra, never a behaviour change. It is what
  // makes `nextBuildable` reachable on a live path (it runs on every gate evaluation).
  return {
    continue: true,
    reason: `${depth} approved plan(s) waiting to be built`,
    depth,
    refs,
    buildOrder: nextBuildable(root),
  };
}

/**
 * THE SOLE WRITER (mirrors `continuation.recordBlock`). Advances the no-progress
 * block count, RESETTING it first through `effectiveBlocks` so an observed drain
 * zeroes the budget. Returns the `writeQueueState` boolean: if the counter cannot be
 * persisted the bound cannot advance, so slice 2's hook MUST fail open — hence the
 * boolean is returned, never swallowed (the WEDGE-1 analog).
 *
 * @param {string} root - the project root
 * @param {number} depth - the current approved-queue depth
 * @returns {boolean} whether the block was persisted
 */
function recordQueueBlock(root, depth) {
  const state = readQueueState(root) || {};
  const next = effectiveBlocks(state, depth) + 1;
  return writeQueueState(root, {
    blocks: next,
    lastQueueDepth: depth,
    forkPending: state.forkPending === true,
    forkReason: state.forkPending === true ? (state.forkReason || null) : null,
  });
}

/**
 * Register a genuine FORK — a decision that is the human's. Works with NO
 * pre-existing state (the derived regime has no startBatch). Mirrors
 * `continuation.registerFork`. Its live caller is the executor agent (prose-driven),
 * exactly as `continuation.registerFork`'s is today.
 *
 * @param {string} root - the project root
 * @param {string} [reason]
 * @returns {Object} the persisted state
 */
function registerQueueFork(root, reason) {
  const state = readQueueState(root) || {};
  const next = {
    blocks: Number.isFinite(state.blocks) ? state.blocks : 0,
    lastQueueDepth: Number.isFinite(state.lastQueueDepth) ? state.lastQueueDepth : 0,
    forkPending: true,
    forkReason: reason ? String(reason) : 'human decision required',
  };
  writeQueueState(root, next);
  return next;
}

/**
 * Clear a pending queue fork (the human answered) so the queue resumes.
 * @param {string} root - the project root
 * @returns {Object|null} the persisted state, or null when there was none
 */
function resolveQueueFork(root) {
  const state = readQueueState(root);
  if (!state) return null;
  const next = {
    blocks: Number.isFinite(state.blocks) ? state.blocks : 0,
    lastQueueDepth: Number.isFinite(state.lastQueueDepth) ? state.lastQueueDepth : 0,
    forkPending: false,
    forkReason: null,
  };
  writeQueueState(root, next);
  return next;
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
 * THE LIVE CONSUMER for THIS slice. Fail-open wrapper: names the approved-queue
 * depth for the session-start banner, or '' for a falsy/invalid root or an empty
 * queue — so the banner is unchanged for a project with no approved work (purely
 * ADDITIVE, crash-safe; SessionStart runs every session and must never throw).
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
  QUEUE_STATE_REL,
  MAX_QUEUE_BLOCKS,
  queueStatePath,
  readQueueState,
  writeQueueState,
  approvedFreeQueue,
  effectiveBlocks,
  shouldContinueQueue,
  recordQueueBlock,
  registerQueueFork,
  resolveQueueFork,
  approvedQueueBannerLine,
  priorityRank,
  normalizeDeps,
  locatePredecessor,
  nextBuildable,
};

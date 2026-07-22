'use strict';

/**
 * Plan recovery — re-queue an orphaned in-progress plan whose BUILDER IS GONE.
 *
 * WHY THIS EXISTS. The task reconciler (`task-reconcile.js`) already decides "the
 * builder is dead" — with all its kind-aware liveness and staleness logic — and
 * records that verdict DURABLY on the task as `result.orphanReason`. But orphaning
 * the TASK does nothing to the PLAN: the plan file stays in `plans/in-progress/`,
 * where the dashboard renders it as work in flight. A real project (V4) had five
 * approved plans sitting in `in-progress` with no live builder three days after its
 * session ended — they read as active work that nothing was doing. This module
 * closes that gap.
 *
 * A PURE PROJECTION, never a second judgment. Recovery reads the reconciler's own
 * persisted verdict and acts on the plan; it never re-derives liveness or staleness
 * and never edits `task-reconcile.js` / `task-registry.js`.
 *
 * THE HUMAN'S RESOLVED STANCE (2026-07-22) — RE-QUEUE FOR A CLEAN REBUILD, tiered:
 *
 *   | orphaned implement task's result.orphanReason | reconciler's file state | action  |
 *   |-----------------------------------------------|-------------------------|---------|
 *   | 'staleness'                                   | still QUARANTINED       | SURFACE |
 *   | null / 'confirmed-dead' / 'presumed-dead'     | RELEASED                | RE-QUEUE|
 *
 *   • A RELEASED orphan is re-queued `in-progress` → `todo` REGARDLESS of whether its
 *     partial work is structurally review-ready. `validateForReview` checks STRUCTURE
 *     (step labels present, criteria marked), NOT that Step 14 VERIFY actually ran
 *     before the builder died — so a structurally-complete orphan may be functionally
 *     half-built, and letting it flow forward risks a human rubber-stamping unverified
 *     work at the review gate. So this module NEVER calls `validateForReview` and has
 *     no review-readiness gate: the rebuild-and-re-verify path is the chosen stance.
 *   • A STALENESS orphan is only SURFACED, never moved. Its files are still QUARANTINED
 *     because the builder MAY STILL BE ALIVE; re-queuing it would let `startAgent` claim
 *     it and put a SECOND agent on files the first may still be editing — the exact
 *     two-agents-on-one-file hazard the quarantine exists to prevent. `addAndClaim` does
 *     not consult the quarantine, so tiering by the reconciler's own quarantine-release
 *     reuses that safety instead of re-deriving it (and inherits the 120-/240-minute
 *     kind-aware floors for free — recovery never re-computes an age).
 *   • The LIVENESS VETO never touches a plan a fresh agent has re-claimed: because
 *     `orphaned` is a SOFT terminal and a re-claim creates a new RUNNING task for the
 *     same plan, the OLD orphaned task and a LIVE task can both name the plan at once.
 *     `taskRegistry.findActivePlanTask(reg, plan, 'implement')` truthy ⇒ veto.
 *
 * `in-progress → todo` is a BACKWARD recovery edge. The four human gates are FORWARD
 * edges (vision→functional, functional→implementation, implementation→todo,
 * review→done), so an auto-move backward crosses NO gate and needs no approval.
 *
 * SUPERSEDES the forward sweep for dead-builder orphans. `cleanupStaleInProgress`
 * (actions.js) moves review-ready stale plans FORWARD to `review`, and runs only from
 * `startAgent`. Recovery runs on the menu render (its wiring in
 * `menu-screens.buildDashboardTable`) and re-queues a released orphan to `todo` before
 * the forward sweep would ever run — so unverified work never reaches review as "done".
 * The two do not race: recovery is on the hot path and wins by re-queuing first; a plan
 * it re-queues is gone from `in-progress` before any later `startAgent` sweep looks.
 *
 * FAIL-OPEN + HONEST throughout (matching the reconciler): a bad root, a garbage
 * registry, an absent `in-progress/`, a per-plan move collision, and a broken cleanup
 * log each degrade to a recorded skip/surface or an empty result — never a throw.
 *
 * Cross-platform: `path.join` for every path; `safeFs` (the audited fs choke point)
 * for the log; no shell, no separators, no os-specific assumption.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const taskRegistry = require('./task-registry');
const { movePlan } = require('./actions');
const { getPlansDir, readPlans } = require('./state');
const { findProjectRoot } = require('./project-root');

/** The reason recorded on a re-queued plan, in the human's own terms. */
const RECOVER_REASON =
  'its builder is no longer running; the build is re-queued for a clean rebuild and ' +
  're-verification (partial work may remain in the dead worktree)';
/** The reason recorded when an orphan is only surfaced (still quarantined). */
const SURFACE_REASON =
  'orphaned on staleness alone — its builder may still be running; not yet recovered';
/** The reason recorded when a fresh agent has re-claimed the plan. */
const RECLAIM_REASON = 'live registry task — a fresh agent owns this plan';

/**
 * Append a best-effort recovery entry to `.ctoc/logs/cleanup.json`. A broken log
 * must NEVER break recovery, so the whole body is wrapped: any failure is swallowed
 * (the log is a rebuildable audit trail, not a correctness dependency).
 *
 * @param {string} root - project root
 * @param {string} plan - the re-queued plan slug
 * @param {number} now - epoch ms for the entry timestamp
 */
function appendCleanupLog(root, plan, now) {
  try {
    const logDir = path.join(root, '.ctoc', 'logs');
    safeFs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'cleanup.json');
    let log = [];
    if (safeFs.existsSync(logFile)) {
      try {
        const parsed = JSON.parse(safeFs.readFileSync(logFile, 'utf8'));
        if (Array.isArray(parsed)) log = parsed;
      } catch {
        // A corrupt cleanup log is an audit artifact, not a correctness input: start a
        // fresh valid array rather than propagate. The reset is explicit (not a silent
        // fall-through) so the absorbed failure — an unparseable log — is stated in code.
        log = [];
      }
    }
    log.push({
      plan,
      from: 'in-progress',
      to: 'todo',
      action: 'recovered',
      reason: RECOVER_REASON,
      at: new Date(now).toISOString(),
    });
    safeFs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  } catch (err) {
    // The move already succeeded; a failed cleanup-log write must never turn a real
    // recovery into a reported failure. Record it to stderr (the state.js fail-open
    // style) rather than swallow it silently — a log failure is not a recovery verdict.
    process.stderr.write(
      '[ctoc] plan-recovery: cleanup-log write failed for ' + plan + ': ' +
      ((err && err.message) ? err.message : String(err)) + '\n'
    );
  }
}

/**
 * Project the task reconciler's orphan verdict onto the plan files: re-queue every
 * released (file-freed) orphaned build back to `todo` for a clean rebuild; surface a
 * still-quarantined staleness orphan honestly without moving it; never touch a plan a
 * fresh agent has re-claimed. NEVER THROWS.
 *
 * @param {string} root - project root. Falsy ⇒ `findProjectRoot()`.
 * @param {{ now?: number }} [opts]
 *   - `now` — epoch ms for the cleanup-log timestamp (default `Date.now()`),
 *     injectable for deterministic tests.
 * @returns {{ recovered: Array<{plan:string, taskId:string, reason:string}>,
 *             surfaced:  Array<{plan:string, taskId:string, reason:string}>,
 *             skipped:   Array<{plan:string, reason:string}> }}
 *   `recovered` — moved in-progress→todo; `surfaced` — orphaned but still quarantined
 *   (reported, not moved); `skipped` — live-re-claimed or move-failed.
 */
function recoverOrphanedPlans(root, opts = {}) {
  const recovered = [];
  const surfaced = [];
  const skipped = [];

  root = root || findProjectRoot();
  const now = (opts && opts.now != null) ? opts.now : Date.now();

  // The registry load is fail-open on data; the catch guards a bad-root TypeError so a
  // non-string root degrades to an empty result instead of crashing the menu render.
  let reg;
  try {
    reg = taskRegistry.load(root);
  } catch {
    reg = { tasks: [] };
  }

  // Only orphaned IMPLEMENT tasks that carry a plan slug are stalled builds. (Recovery
  // is implement-only, matching how startAgent / cleanupStaleInProgress key on
  // 'implement' for plan↔task mapping.)
  const orphaned = (reg.tasks || []).filter(
    (t) => t && t.status === 'orphaned' && t.kind === 'implement' && t.plan != null
  );
  if (orphaned.length === 0) return { recovered, surfaced, skipped };

  // The resident in-progress plans, keyed by slug. `readPlans` is fail-open: an absent
  // directory yields [] (state.js), so a missing in-progress/ simply means nothing to act
  // on. We only reach here with a string root (load did not throw), so this never faults.
  const plans = readPlans(path.join(getPlansDir(root), 'in-progress'));
  const bySlug = new Map(plans.map((p) => [p.name, p]));

  const seen = new Set(); // act ONCE per plan (first orphaned task wins) — idempotent dedup
  for (const task of orphaned) {
    const plan = task.plan;
    if (seen.has(plan)) continue;
    const planObj = bySlug.get(plan);
    if (!planObj) continue; // a task naming a non-resident plan is simply ignored
    seen.add(plan);

    // 1. Liveness veto — a fresh agent re-claimed this plan; never yank it out from under a live build.
    if (taskRegistry.findActivePlanTask(reg, plan, 'implement')) {
      skipped.push({ plan, reason: RECLAIM_REASON });
      continue;
    }

    // 2. Still quarantined (staleness) — the builder may still be alive; surface, do not move.
    if (task.result && task.result.orphanReason === 'staleness') {
      surfaced.push({ plan, taskId: task.id, reason: SURFACE_REASON });
      continue;
    }

    // 3. Released (orphanReason null / 'confirmed-dead' / 'presumed-dead') — re-queue for a
    //    clean rebuild, REGARDLESS of review-readiness. One move failure never aborts the batch.
    try {
      movePlan(planObj.path, 'todo', root);
      appendCleanupLog(root, plan, now);
      recovered.push({ plan, taskId: task.id, reason: RECOVER_REASON });
    } catch (err) {
      skipped.push({ plan, reason: 'move failed: ' + ((err && err.message) ? err.message : String(err)) });
    }
  }

  return { recovered, surfaced, skipped };
}

module.exports = { recoverOrphanedPlans };
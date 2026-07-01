'use strict';

/**
 * Stale-plan cleanup execution (SP4 — human-gated grouped cleanup).
 *
 * The SOLE module that mutates plan files for stale cleanup. It executes a
 * human-approved cleanup action through one of three primitives:
 *
 *   - archive / reconcile → a DEDICATED reconciliation path that stamps the
 *     gate marker into the frontmatter and moves the plan forward to plans/done/
 *     WITHOUT calling actions.approvePlan(). This deliberately bypasses the live
 *     Gate-3 crossing so months-old stale cleanup never re-fires the deployment
 *     pipeline nor pollutes the live transition audit trail (ADR §5). The marker
 *     carries `gate_crossed: stale-reconciliation <ISO>` so the move is
 *     unambiguous in any audit, and is written to the source file BEFORE the
 *     rename so the unmodified gate auto-revert hook (src/hooks/human-gate-check.js)
 *     accepts the moved file (stamp-before-rename, M5).
 *   - revert → move the plan back ONE stage (reversible; the dead-on-arrival
 *     default). No marker is stamped — a revert is not a gate crossing.
 *   - delete → only when explicitlyRejected === true; refused by construction at
 *     two layers (M6/D4). Deletion is irreversible.
 *
 * GATE-SAFETY IS STRUCTURAL (D2): this module imports ONLY `movePlan` from
 * actions.js — `approvePlan` is deliberately NOT imported, so the module is
 * physically incapable of crossing a live Gate 3 or firing the deployment
 * pipeline. It also imports `listStaleCandidates` from inbox.js to RE-DERIVE a
 * plan's current stage at execution time (D1/D8); inbox.js exports no
 * `approvePlan`, so that import does not widen the gate-safety surface, and it
 * introduces no require cycle (inbox → {cache, stale-detector}; neither re-enters
 * this module; actions never imports inbox).
 */

const safeFs = require('./safe-fs');
const path = require('path');
// movePlan ONLY — approvePlan is deliberately NOT imported (structural gate-safety, D2).
const { movePlan } = require('./actions');
// listStaleCandidates ONLY — RE-DERIVE a plan's current stage at exec time (D1/D8).
const { listStaleCandidates } = require('./inbox');

// Backward revert map (inverse of the forward gate flow). Only the three
// gate-source stages the detector scans are valid inputs.
const REVERT_MAP = Object.freeze({
  review: 'implementation',
  implementation: 'functional',
  functional: 'vision',
});

// Path segments (under project root) of the append-only cleanup log.
const CLEANUP_LOG = ['.ctoc', 'logs', 'stale-cleanup.json'];

/**
 * Prepend a separate leading approval block — identical two-block shape to
 * actions.addApprovalMarker, with an unquoted `gate_crossed` value (D6). The
 * first block satisfies human-gate-check.hasApprovalMarker; the original
 * frontmatter (with `files:`) remains intact as the second block.
 * @param {string} content original file content
 * @param {string} reason  e.g. 'stale-reconciliation <ISO>'
 * @returns {string}
 */
function _stampMarker(content, reason) {
  const iso = new Date().toISOString();
  return `---\napproved_by: human\napproved_at: ${iso}\ngate_crossed: ${reason}\n---\n\n` + content;
}

/**
 * Best-effort append to the cleanup log. A logging failure is swallowed — it
 * NEVER aborts a move that already happened (the rename/unlink is the source of
 * truth; the log is advisory). Mirrors actions.cleanupStaleInProgress.
 *
 * Integrity hardening (F2 + security):
 *   - A corrupt/unparseable existing log is NOT silently wiped. It is renamed
 *     aside to `stale-cleanup.json.corrupt-<now>` so audit history is preserved
 *     for forensics, then a fresh log starts from this entry. If the
 *     preservation rename itself fails, we degrade to stderr and skip the append
 *     rather than destroy the corrupt file.
 *   - The write is atomic: serialize to a sibling temp file, then renameSync over
 *     the target, so a crash mid-write can never leave a half-written log.
 *
 * @param {string} root
 * @param {object} entry { plan, from, to, action, reason, at }
 * @param {number} [now] timestamp for the corrupt-aside filename (Date.now() default)
 */
function _appendLog(root, entry, now = Date.now()) {
  try {
    const dir = path.join(root, ...CLEANUP_LOG.slice(0, -1));
    safeFs.mkdirSync(dir, { recursive: true });
    const logPath = path.join(root, ...CLEANUP_LOG);
    let arr = [];
    if (safeFs.existsSync(logPath)) {
      let parsed;
      let corrupt = false;
      try {
        parsed = JSON.parse(safeFs.readFileSync(logPath, 'utf8'));
      } catch {
        corrupt = true;
      }
      if (corrupt || !Array.isArray(parsed)) {
        // Preserve the corrupt file aside — never silently discard history.
        const asidePath = logPath + '.corrupt-' + now;
        try {
          safeFs.renameSync(logPath, asidePath);
          arr = [];
        } catch (e) {
          // Could not preserve it; do NOT overwrite/wipe it. Skip the append.
          try { process.stderr.write('stale-cleanup: corrupt log, preserve failed: ' + e.message + '\n'); } catch { /* ignore */ }
          return;
        }
      } else {
        arr = parsed;
      }
    }
    arr.push(entry);
    const tmpPath = logPath + '.tmp-' + now + '-' + process.pid;
    safeFs.writeFileSync(tmpPath, JSON.stringify(arr, null, 2));
    safeFs.renameSync(tmpPath, logPath); // atomic publish
  } catch {
    // best-effort: never abort a completed move because logging failed
  }
}

// stage = the parent directory name of a plans/<stage>/<slug>.md path.
function _stageFromPath(planPath) {
  return path.basename(path.dirname(planPath));
}

// project root from <root>/plans/<stage>/<slug>.md (used by deletePlan's log).
function _rootFromPath(planPath) {
  return path.resolve(path.dirname(planPath), '..', '..');
}

/**
 * Shared reconciliation primitive: stamp the marker IN MEMORY, write it to the
 * source path, THEN rename to plans/done/. Self-contained — never calls
 * approvePlan or movePlan (M2/M3). The write-before-rename ordering is the
 * gate-hook window mitigation (M5).
 * @param {string} planPath absolute path to plans/<stage>/<slug>.md
 * @param {string} root
 * @param {string} action log action ('archive-to-done' | 'advance-via-reconciliation')
 */
function _stampAndArchive(planPath, root, action) {
  if (!safeFs.existsSync(planPath)) {
    throw new Error('stale-cleanup: plan not found: ' + planPath);
  }
  // Security (TOCTOU): re-assert the source is a REGULAR file at mutation time.
  // Closes the window where a scan-time plain file is swapped for a symlink (or a
  // directory) before we write through it.
  const srcStat = safeFs.lstatSync(planPath);
  if (!srcStat.isFile()) {
    throw new Error('stale-cleanup: refusing to archive ' + planPath + ': not a regular file');
  }
  const slug = path.basename(planPath, '.md');
  const doneDir = path.join(root, 'plans', 'done');
  const dest = path.join(doneDir, path.basename(planPath));
  // F1: never overwrite a real shipped plan that already occupies done/<slug>.md.
  if (safeFs.existsSync(dest)) {
    throw new Error(
      'refusing to archive ' + slug + ': plans/done/' + slug + '.md already exists (would overwrite shipped work)'
    );
  }
  const iso = new Date().toISOString();
  const from = _stageFromPath(planPath);
  const content = safeFs.readFileSync(planPath, 'utf8');
  const stamped = _stampMarker(content, 'stale-reconciliation ' + iso);
  safeFs.writeFileSync(planPath, stamped); // WRITE strictly BEFORE rename (M5)
  safeFs.mkdirSync(doneDir, { recursive: true });
  safeFs.renameSync(planPath, dest);
  _appendLog(root, {
    plan: path.basename(planPath, '.md'),
    from,
    to: 'done',
    action,
    reason: 'stale-reconciliation',
    at: iso,
  });
  return { from, to: 'done', path: dest, reason: 'stale-reconciliation' };
}

/**
 * shipped-but-early → archive to done/ via the reconciliation path.
 * @param {string} planPath
 * @param {string} root
 */
function archivePlan(planPath, root) {
  return _stampAndArchive(planPath, root, 'archive-to-done');
}

/**
 * approved-but-stranded → advance to done/ via the SAME reconciliation path.
 * Distinct named export for call-site clarity + a distinct log action. Does NOT
 * call approvePlan and does NOT call movePlan (M3).
 * @param {string} planPath
 * @param {string} root
 */
function reconcilePlan(planPath, root) {
  return _stampAndArchive(planPath, root, 'advance-via-reconciliation');
}

/**
 * dead-on-arrival default → move back ONE stage (reversible; NO marker stamped).
 * `deps.movePlan` is the injectable move seam (D2/D3); default is the imported
 * actions.movePlan. Performs NO unlink/rm (M6).
 * @param {string} planPath
 * @param {string} root
 * @param {{ movePlan?: Function }} [deps]
 */
function revertPlan(planPath, root, deps = {}) {
  const stage = _stageFromPath(planPath);
  const prior = REVERT_MAP[stage];
  if (!prior) {
    throw new Error('stale-cleanup: cannot revert from stage ' + stage);
  }
  const move = deps.movePlan || movePlan;
  const newPath = move(planPath, prior, root);
  _appendLog(root, {
    plan: path.basename(planPath, '.md'),
    from: stage,
    to: prior,
    action: 'revert',
    reason: 'stale-revert',
    at: new Date().toISOString(),
  });
  return { from: stage, to: prior, path: newPath, reason: 'stale-revert' };
}

/**
 * dead-on-arrival → delete (irreversible). Refused by construction unless
 * explicitlyRejected === true (D4). This guard is independent of the dispatcher
 * guard in executeCleanup (belt-and-suspenders).
 * @param {string} planPath
 * @param {{ explicitlyRejected?: boolean }} [opts]
 */
function deletePlan(planPath, { explicitlyRejected = false } = {}) {
  if (explicitlyRejected !== true) {
    throw new Error('stale-cleanup: refusing delete: explicitlyRejected not set');
  }
  const stage = _stageFromPath(planPath);
  const root = _rootFromPath(planPath);
  safeFs.unlinkSync(planPath);
  _appendLog(root, {
    plan: path.basename(planPath, '.md'),
    from: stage,
    to: null,
    action: 'delete',
    reason: 'stale-delete',
    at: new Date().toISOString(),
  });
  return { from: stage, to: null, path: planPath, action: 'delete', reason: 'stale-delete' };
}

/**
 * Dispatcher. Re-derives the plan's CURRENT stage at exec time via
 * listStaleCandidates (never trusting a stage from the action string or a
 * render-time snapshot — D1/D8), then routes to the right primitive.
 *
 * The proposal is STAGE-LESS: { plan, category?, proposedAction, action?, explicitlyRejected? }.
 * A slug absent from the live scan (already cleaned / no longer stale) ⇒
 * fail-closed no-op (idempotent), never a wrong-path move and never a throw.
 *
 * deps (SP5 seam): { approvePlan?, movePlan?, listStaleCandidates? }.
 *   - listStaleCandidates: drives stage re-derivation.
 *   - movePlan: the revert mover.
 *   - approvePlan: part of the documented seam contract for SP5's negative
 *     assertion; NEVER referenced by any branch (gate-safety is structural).
 *
 * @param {object} proposal
 * @param {string} root
 * @param {object} [deps]
 * @returns {object} result
 */
function executeCleanup(proposal, root, deps = {}) {
  const scanFn = deps.listStaleCandidates || listStaleCandidates;
  const scan = scanFn(root);
  const matches = Array.isArray(scan) ? scan.filter((c) => c && c.plan === proposal.plan) : [];
  // Security (slug collision across gate-source stages): if the SAME slug is
  // stale in more than one stage, do NOT guess which one the human meant — fail
  // closed with a no-op (no fs op, no throw) rather than silently acting on the
  // first match.
  if (matches.length > 1) {
    _appendLog(root, {
      plan: proposal.plan,
      from: null,
      to: null,
      action: 'ambiguous-skip',
      reason: 'slug-collision-across-stages',
      at: new Date().toISOString(),
    });
    return { plan: proposal.plan, action: 'ambiguous-skip', skipped: true };
  }
  const cand = matches.length === 1 ? matches[0] : null;
  if (!cand) {
    // slug no longer stale (already cleaned / moved) — fail closed, no fs op.
    _appendLog(root, {
      plan: proposal.plan,
      from: null,
      to: null,
      action: 'noop',
      reason: 'not-currently-stale',
      at: new Date().toISOString(),
    });
    return { plan: proposal.plan, action: 'noop', skipped: true };
  }

  const stage = cand.stage; // CURRENT on-disk stage — authoritative
  const planPath = path.join(root, 'plans', stage, proposal.plan + '.md');
  const effective = proposal.action || proposal.proposedAction;

  switch (effective) {
    case 'archive-to-done':
      return archivePlan(planPath, root);
    case 'advance-via-reconciliation':
      return reconcilePlan(planPath, root);
    case 'revert':
      return revertPlan(planPath, root, deps);
    case 'delete':
      if (proposal.explicitlyRejected !== true) {
        throw new Error('stale-cleanup: delete blocked: not explicitlyRejected');
      }
      return deletePlan(planPath, { explicitlyRejected: true });
    default:
      // inconclusive / null / unknown action — nothing executes.
      return { plan: proposal.plan, action: 'none', skipped: true };
  }
}

module.exports = {
  archivePlan,
  reconcilePlan,
  revertPlan,
  deletePlan,
  executeCleanup,
  REVERT_MAP,
  _stampMarker,
};

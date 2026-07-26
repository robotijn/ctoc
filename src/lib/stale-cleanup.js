'use strict';

/**
 * Stale-plan cleanup execution (SP4 — human-gated grouped cleanup).
 *
 * The SOLE module that mutates plan files for stale cleanup. It executes a
 * human-approved cleanup action through one of three primitives:
 *
 *   - archive / reconcile → a DEDICATED reconciliation path that stamps a
 *     PIPELINE-provenance block into the frontmatter and moves the plan forward to
 *     plans/done/ WITHOUT calling actions.approvePlan(). This deliberately bypasses
 *     the live Gate-3 crossing so months-old stale cleanup never re-fires the
 *     deployment pipeline nor pollutes the live transition audit trail (ADR §5).
 *
 *     PROVENANCE MODEL (R2-I). A machine NEVER writes the human's name. The stamped
 *     block is `advanced_by: pipeline` + `advanced_at` + `gate_crossed:
 *     stale-reconciliation <ISO>` — never the human `approved_by` marker. The machine's actual
 *     authority to occupy done/ is a PIPELINE-kind approval-ledger entry
 *     (`writePipelineEntry`, `advanced_by: 'pipeline'` + a mandatory non-empty
 *     `evidence` string) written AFTER the rename SUCCEEDS, with a `content_sha256`
 *     bound to the exact archived bytes. The revived gate hook
 *     (src/hooks/human-gate-check.js) reads that ledger — NOT the plan-body marker,
 *     which any agent can forge — and accepts a pipeline entry at done/ (never at the
 *     pre-done human-only gate). The stamp (the legible in-file provenance block) is
 *     still written to the source file BEFORE the rename (stamp-before-rename, M5); the
 *     LEDGER entry is written strictly AFTER a successful rename (crash-consistency —
 *     see `_stampAndArchive`), so a rename failure can neither destroy the plan's prior
 *     approval provenance nor strand a done-edge entry against a hook-swept source.
 *   - revert → move the plan back ONE stage (reversible; the dead-on-arrival
 *     default). No marker is stamped — a revert is not a gate crossing.
 *
 *     REVERT INVARIANT (R2-I, contradiction 8). A revert may never land a plan in a
 *     hook-swept gate-destination stage whose ledger entry cannot vouch for that
 *     residency. `revertPlan` ENFORCES this by consulting the ledger (via the hook's
 *     own `classifyResidency` predicate) and walking back along `GATE_SOURCE` past
 *     every unvouched swept stage to the nearest stage the ledger can vouch for, or a
 *     non-gate stage that is never swept — so a plan WITH a valid Gate-2 entry lands in
 *     `todo/` (the entry vouches for it) while a dead, unvouched review plan walks past
 *     `todo/` and `implementation/` to `functional/` instead of triggering a chain-
 *     revert cascade. See REVERT_MAP for the full rationale.
 *   - delete → only when explicitlyRejected === true; refused by construction at
 *     two layers (M6/D4). Deletion is irreversible.
 *
 * GATE-SAFETY IS STRUCTURAL (D2): this module imports ONLY `movePlan` from
 * actions.js — `approvePlan` is deliberately NOT imported, so the module is
 * physically incapable of crossing a live Gate 3 or firing the deployment
 * pipeline. It also imports `listStaleCandidates` from inbox.js to RE-DERIVE a
 * plan's current stage at execution time (D1/D8), and the approval-ledger to write
 * a PIPELINE-kind provenance entry (`writePipelineEntry` only). NONE of these
 * exports `approvePlan`, so no import widens the gate-safety surface; none
 * introduces a require cycle (inbox → {cache, stale-detector}; approval-ledger →
 * {crypto, path, safe-fs}; neither re-enters this module; actions never imports
 * inbox).
 */

const safeFs = require('./safe-fs');
const path = require('path');
// movePlan ONLY — approvePlan is deliberately NOT imported (structural gate-safety, D2).
const { movePlan } = require('./actions');
// CF1: bust the in-process read cache on every count-mutating write. cache.js
// imports nothing (no require cycle) and exports no approvePlan — it does NOT
// widen the gate-safety surface (D2 preserved).
const { invalidate } = require('./cache');
// listStaleCandidates ONLY — RE-DERIVE a plan's current stage at exec time (D1/D8).
const { listStaleCandidates } = require('./inbox');
// R2-I: the approval ledger — the SINGLE approval-truth source. Used ONLY to write
// a PIPELINE-kind entry (`writePipelineEntry`, `advanced_by: pipeline` + evidence)
// so the revived gate hook (which reads the ledger, NEVER the plan-body marker)
// accepts a done/ residency this module creates. It exports NO `approvePlan`, so
// this import does NOT widen the structural gate-safety surface (D2 preserved): the
// module still cannot cross a live Gate 3 nor fire the deployment pipeline. It is a
// leaf (crypto/path/safe-fs only) → no require cycle.
const ledger = require('./approval-ledger');
// R2-I (revert invariant ENFORCEMENT): the gate-edge encoding and the ONE approval-
// residency predicate. `GATE_DESTINATIONS` names the hook-swept stages
// (implementation, todo, done); `GATE_SOURCE` is the destination→source inverse used
// to walk a revert backward one gate at a time; `classifyResidency` is the SAME
// predicate the gate hook applies, so `revertPlan` asks the ledger the identical
// question the hook will ask — never a second, divergable encoding of it. Both are
// leaves for cycle purposes: gate-order requires nothing; approval-residency requires
// only {gate-order, safe-fs, approval-ledger} and NEITHER re-enters this module nor
// imports actions/approvePlan, so the structural gate-safety surface (D2) is
// unchanged and no require cycle is introduced.
const { GATE_DESTINATIONS, GATE_SOURCE } = require('./gate-order');
const { classifyResidency } = require('./approval-residency');

// Backward revert map (inverse of the forward gate flow). Only the three
// gate-source stages the detector scans are valid inputs. This is the STARTING
// point of a revert; `revertPlan` then enforces the invariant below against the
// ledger, so the map's target is where a revert lands ONLY when the ledger can
// vouch for that residency (or the target is not a hook-swept stage).
//
// REVERT INVARIANT (R2-I, contradiction 8): a revert may NEVER leave a plan in a
// hook-swept gate-destination stage (`GATE_DESTINATIONS` — implementation, todo,
// done) whose ledger entry cannot vouch for that residency. A plan that legitimately
// reached `review/` crossed Gate 2 (implementation→todo) and so carries a ledger
// entry with `stage_to: 'todo'`; reverting it review→`todo` leaves it hook-consistent
// (the gate hook accepts `todo/` on that very entry, and a byte-identical rename
// preserves the hash it verifies). But a DEAD review plan (the dead-on-arrival default
// revert case) has NO vouching entry, and a plan whose Gate-2 entry is legacy
// file-scope no longer hashes clean — for either, landing in the swept `todo/` makes
// the hook read `no-ledger-entry`/`hash-mismatch` and chain-revert it a SECOND (and
// third) time, an alarming multi-hop "HUMAN GATE VIOLATION" cascade. So `revertPlan`
// CONSULTS the ledger (via `classifyResidency`, the hook's own predicate) and walks
// back along `GATE_SOURCE` past every unvouched swept stage until it reaches a stage
// the ledger CAN vouch for, or a non-gate stage that is never swept. The static map is
// merely the first candidate; the ledger decides the landing.
const REVERT_MAP = Object.freeze({
  review: 'todo',
  implementation: 'functional',
  functional: 'vision',
});

// Path segments (under project root) of the append-only cleanup log.
const CLEANUP_LOG = ['.ctoc', 'logs', 'stale-cleanup.json'];

/**
 * Prepend a separate leading PIPELINE-provenance block. A machine advance is
 * `advanced_by: pipeline` + `advanced_at` + `gate_crossed: <reason>` — it NEVER
 * writes the human `approved_by` marker (R2-I). Forging the human's marker was the exact
 * self-approval the ledger model closes: only the human, through the menu, may
 * author a human-kind approval, and the gate hook no longer trusts the plan-body
 * marker at all — it reads the agent-write-denied ledger. This leading block is
 * therefore human-readable provenance in the archived file; the machine's ACTUAL
 * authority to occupy done/ comes from the pipeline-kind ledger entry written in
 * `_stampAndArchive`. The original frontmatter (with `files:`) remains intact as
 * the second block.
 * @param {string} content original file content
 * @param {string} reason  e.g. 'stale-reconciliation <ISO>'
 * @returns {string}
 */
function _stampMarker(content, reason) {
  const iso = new Date().toISOString();
  return `---\nadvanced_by: pipeline\nadvanced_at: ${iso}\ngate_crossed: ${reason}\n---\n\n` + content;
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
  // M5: stamp the legible in-file provenance block into the SOURCE file strictly
  // BEFORE the rename, so the archived file carries readable provenance the instant it
  // lands in done/. (This is the in-file block only — the ledger entry, the machine's
  // ACTUAL authority, is written after the rename below.)
  safeFs.writeFileSync(planPath, stamped);
  safeFs.mkdirSync(doneDir, { recursive: true });
  safeFs.renameSync(planPath, dest);
  // R2-I (crash-consistency — the archive partial-failure window). The PIPELINE-kind
  // ledger entry is written strictly AFTER the rename SUCCEEDS, never before. Writing
  // it before (the discarded Decision 1 rationale) meant a rename failure left the plan
  // in its SOURCE stage — which is hook-swept for an implementation/todo-source archive
  // (approved-but-stranded routes exactly those stages here) — carrying a done-edge
  // entry the hook reads as `wrong-edge`, so it reverted the plan and posted a false
  // "human gate violation"; and because `persistEntry` overwrites the single per-slug
  // entry, the plan's genuine prior approval provenance was already destroyed. Writing
  // after the rename makes a rename failure incapable of touching the ledger at all
  // (the prior entry survives byte-identical), and the only remaining partial failure —
  // a crash between the rename and this write — leaves a done/ resident with no entry,
  // which the hook resolves in the SAFE direction (a revert back OUT of done/, never a
  // false acceptance and never lost provenance). `content_sha256` binds to the EXACT
  // bytes now occupying done/ (`stamped`, byte-identical across the rename), so the
  // hook's invalidate-on-edit hash check passes. The ledger slug is the canonical
  // lowercase form `slugFromPlanPath` derives — the same key the hook reads. The
  // evidence string is mandatory and non-empty.
  const ledgerSlug = ledger.slugFromPlanPath(planPath);
  ledger.writePipelineEntry(ledgerSlug, {
    content_sha256: ledger.computeContentHash(stamped),
    stage_from: from,
    stage_to: 'done',
    evidence: 'stale-reconciliation: ' + action + ' ' + iso,
  }, root);
  // CF1: the plan left its gate-source stage for done/ — bust the read cache
  // AFTER the successful rename. Strictly post-write; the stamp-before-rename
  // (M5) ordering above is untouched.
  invalidate();
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
  // ENFORCE THE REVERT INVARIANT (contradiction 8): never leave the plan in a hook-
  // swept gate-destination stage the ledger cannot vouch for. Starting from the mapped
  // target, walk back along `GATE_SOURCE` while the target is a swept gate destination
  // AND the ledger does NOT vouch for that residency; stop at the first stage that is
  // either not swept (never a gate destination) or one the ledger DOES vouch for. The
  // vouching question is asked with `classifyResidency` — the gate hook's OWN predicate
  // — so the revert can never disagree with the sweep that follows it. Content is read
  // LAZILY (only when a swept target must actually be checked), so a revert driven by an
  // injected scan with no file on disk (the M8 seam) still works when the target is a
  // non-swept stage. The walk terminates: every gate destination has a `GATE_SOURCE`,
  // and the chain (todo→implementation→functional, done→review) always reaches a
  // non-gate stage.
  let target = prior;
  let content = null;
  while (GATE_DESTINATIONS.includes(target)) {
    if (content === null) content = safeFs.readFileSync(planPath, 'utf8');
    if (classifyResidency(planPath, target, root, content).accepted) break;
    target = GATE_SOURCE[target];
  }
  const move = deps.movePlan || movePlan;
  const newPath = move(planPath, target, root);
  _appendLog(root, {
    plan: path.basename(planPath, '.md'),
    from: stage,
    to: target,
    action: 'revert',
    reason: 'stale-revert',
    at: new Date().toISOString(),
  });
  return { from: stage, to: target, path: newPath, reason: 'stale-revert' };
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
  // CF1: deleting a plan file changes the counts — bust the read cache AFTER the
  // successful unlink (a throwing unlink never needlessly clears).
  invalidate();
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

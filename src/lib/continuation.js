'use strict';

/**
 * CTOC Continuation — the mechanism that makes autonomous building CONTINUE.
 *
 * CTOC is autonomous building steered by the human on the MAIN decisions
 * (Operating Lesson 15). This module is the deterministic enforcement behind that
 * lesson: when the human authorizes a BATCH of work (N rounds, N plans, a queue,
 * "do it all"), the agent must drive ALL N to completion — it may stop ONLY when
 * the batch is complete or a genuine FORK (a decision that is the human's) is
 * registered. A bare "paused, tell me what to do" mid-batch is a defect.
 *
 * The Stop hook `stop-continuation-gate.js` consumes `shouldContinue()`:
 *   - continue:true  -> the hook BLOCKS the stop (exit 2), re-injecting "keep going".
 *   - continue:false -> the hook ALLOWS the stop (exit 0) — no batch, a pending
 *                       fork, batch complete, or the bounded block-budget exhausted.
 *
 * SAFETY (a Stop gate that blocks can wedge a session, so every guard is here):
 *   - OPT-IN: inert unless a batch is explicitly active (no state file -> allow stop).
 *   - FORK-AWARE: a registered fork pauses the batch and allows the stop for the human.
 *   - BOUNDED: `blocks` is capped by `maxBlocks`; past it the gate stands down.
 *   - FAIL-OPEN: any read/write error resolves to "do not block".
 *
 * State lives at `.ctoc/state/continuation.json` via safe-fs. No timestamps in the
 * decision path (keeps it deterministic and testable).
 */

const path = require('path');
const safeFs = require('./safe-fs');

const STATE_REL = path.join('.ctoc', 'state', 'continuation.json');

// Absolute ceiling on the block-budget: no matter how large `total` is (a typo or a
// bad count feeding startBatch), a stuck batch must stand down within bounded human-wait
// time. WEDGE-3: without this, total=1e15 → maxBlocks=4e15 → an effectively permanent
// wedge. A few hundred blocks is far more than any real batch needs.
const HARD_CEILING = 500;

/** @param {string} root @returns {string} */
function statePath(root) {
  return path.join(root, STATE_REL);
}

/**
 * Read the continuation state, or null when absent/unreadable/corrupt (fail-open).
 * @param {string} root
 * @returns {Object|null}
 */
function read(root) {
  if (!root || typeof root !== 'string') return null;
  const p = statePath(root);
  try {
    if (!safeFs.existsSync(p)) return null;
    const parsed = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist the continuation state. Best-effort; returns false on failure.
 * @param {string} root
 * @param {Object} state
 * @returns {boolean}
 */
function write(root, state) {
  if (!root || typeof root !== 'string') return false;
  const p = statePath(root);
  try {
    safeFs.mkdirSync(path.dirname(p), { recursive: true });
    safeFs.writeFileSync(p, JSON.stringify(state, null, 2));
    return true;
  } catch {
    return false;
  }
}

/** Delete the continuation state (batch fully done / cancelled). @param {string} root */
function clear(root) {
  try {
    safeFs.unlinkSync(statePath(root));
  } catch {
    /* already gone / unwritable — nothing to do */
  }
}

/**
 * Start an authorized batch of `total` units. Overwrites any prior batch.
 * @param {string} root
 * @param {{label?: string, total?: number, maxBlocks?: number}} [opts]
 * @returns {Object} the persisted state
 */
function startBatch(root, opts = {}) {
  const total = Number.isInteger(opts.total) && opts.total > 0 ? opts.total : 1;
  const maxBlocks = Math.min(
    Number.isInteger(opts.maxBlocks) && opts.maxBlocks > 0 ? opts.maxBlocks : total * 4 + 20,
    HARD_CEILING // WEDGE-3: cap regardless of `total` so a stuck batch always stands down
  );
  const state = {
    active: true,
    label: String(opts.label || 'batch'),
    total,
    remaining: total,
    forkPending: false,
    forkReason: null,
    blocks: 0,
    maxBlocks,
    // Staleness clock for the resume watchdog (resume-watchdog.js). NOT part of the
    // shouldContinue decision path — that stays timestamp-free and deterministic; only
    // the session-open resume verdict measures how long a batch has been idle.
    lastAdvanceMs: Date.now(),
  };
  write(root, state);
  return state;
}

/**
 * Mark ONE unit of the batch complete. When the last unit finishes, the batch
 * deactivates (the gate then allows the stop). No-op if no active batch.
 * @param {string} root
 * @returns {Object|null} updated state
 */
function advance(root) {
  const state = read(root);
  if (!state || !state.active) return null;
  state.remaining = Math.max(0, (state.remaining || 0) - 1);
  if (state.remaining === 0) state.active = false;
  // Re-stamp the staleness clock: the batch just made progress, so it is not idle.
  // The resume watchdog measures staleness from this moment.
  state.lastAdvanceMs = Date.now();
  write(root, state);
  return state;
}

/**
 * Register a genuine FORK — a decision that is the human's to make. This PAUSES
 * the batch: `shouldContinue` returns continue:false so the agent may stop and
 * surface the decision. Call `resolveFork` once the human answers to resume.
 * @param {string} root
 * @param {string} [reason]
 * @returns {Object|null}
 */
function registerFork(root, reason) {
  const state = read(root);
  if (!state) return null;
  state.forkPending = true;
  state.forkReason = reason ? String(reason) : 'human decision required';
  write(root, state);
  return state;
}

/**
 * Clear a pending fork (the human answered) so the batch resumes.
 * @param {string} root
 * @returns {Object|null}
 */
function resolveFork(root) {
  const state = read(root);
  if (!state) return null;
  state.forkPending = false;
  state.forkReason = null;
  write(root, state);
  return state;
}

/** Explicitly end the batch (completion or cancellation). @param {string} root */
function complete(root) {
  clear(root);
}

/** Current state or null. @param {string} root @returns {Object|null} */
function status(root) {
  return read(root);
}

/**
 * THE DECISION the Stop hook consumes. Fail-open: anything other than an active,
 * fork-free, non-exhausted batch with remaining work resolves to continue:false.
 * @param {string} root
 * @returns {{continue: boolean, reason: string, remaining?: number, total?: number, fork?: boolean, exhausted?: boolean}}
 */
function shouldContinue(root) {
  const state = read(root);
  if (!state) return { continue: false, reason: 'no active batch' };
  // Coerce numerics defensively — a gate that cannot TRUST its own counters must fall
  // toward ALLOWING the stop, never toward blocking (a safety gate fails OPEN).
  const remaining = Number(state.remaining);
  // A finished batch (or a non-finite/negative remaining) is "complete" — allow the stop.
  if (!Number.isFinite(remaining) || remaining <= 0) return { continue: false, reason: 'batch complete' };
  if (state.forkPending) {
    return { continue: false, reason: `fork pending — ${state.forkReason || 'human decision required'}`, fork: true };
  }
  if (!state.active) return { continue: false, reason: 'batch inactive' };
  // WEDGE-2: a non-positive / non-integer maxBlocks means the loop cannot be bounded.
  // `|| Infinity` was exactly backwards — treat an untrustworthy bound as "stand down".
  const maxBlocks = Number(state.maxBlocks);
  if (!Number.isInteger(maxBlocks) || maxBlocks <= 0) {
    return { continue: false, reason: 'continuation bound is invalid — standing down', exhausted: true };
  }
  const blocks = Number.isFinite(Number(state.blocks)) ? Number(state.blocks) : 0;
  if (blocks >= maxBlocks) {
    return { continue: false, reason: 'continuation block-budget exhausted — standing down', exhausted: true };
  }
  return {
    continue: true,
    reason: `${remaining} of ${state.total} unit(s) remaining in "${state.label}"`,
    remaining,
    total: state.total,
  };
}

/**
 * Record that the gate blocked a stop (bounds the loop). Called by the hook.
 * @param {string} root
 * @returns {Object|null}
 */
function recordBlock(root) {
  const state = read(root);
  if (!state) return false;
  state.blocks = (Number(state.blocks) || 0) + 1;
  // WEDGE-1: return the PERSIST result. If the write failed (unwritable state file,
  // full disk), the block was NOT recorded — the bound cannot advance, so the caller
  // MUST fail open (allow the stop) rather than block forever on a frozen counter.
  return write(root, state);
}

module.exports = {
  STATE_REL,
  statePath,
  read,
  write,
  clear,
  startBatch,
  advance,
  registerFork,
  resolveFork,
  complete,
  status,
  shouldContinue,
  recordBlock,
};

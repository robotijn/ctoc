'use strict';
/**
 * AGENT SLOTS — the durable, self-healing semaphore behind CTOC's standing
 * five-concurrent-subagent cap.
 *
 * WHY THIS EXISTS. `task-registry.evaluateConcurrency` (Rule 1) already refuses
 * to start a sixth task — but only for work that walks in through the scheduler
 * (`menu task add` → `canRun`). Nothing ever forced a background subagent to take
 * that on-ramp: a launch that never registered itself was never counted, so the
 * cap was real in the scheduler and optional in practice. This module is the
 * count the `Task` PreToolUse hook consults on EVERY launch, so the on-ramp stops
 * being voluntary.
 *
 * THE NUMBER LIVES IN ONE PLACE. `MAX_CONCURRENT` is imported from
 * `./task-registry` and re-exported — never redefined here. There is exactly one
 * `5` in CTOC.
 *
 * THE STORE. `<root>/.ctoc/state/agent-slots.json`:
 *
 *   { "version": 1, "slots": [ { "token", "label", "acquiredAt" } ] }
 *
 * Written ATOMICALLY (temp file + rename, the same pattern as
 * `streaming-precompute.writePlanQuestions`) so a crash mid-write can never leave
 * a half-parsed store behind.
 *
 * STALE REAPING IS LOAD-BEARING. A subagent that CRASHES never fires
 * `SubagentStop`, so its slot would leak forever and the fence would slowly
 * strangle the session — the exact failure that makes people rip a semaphore out.
 * Any entry older than `SLOT_TTL_MS` (thirty minutes) is therefore presumed dead
 * and reaped before the count is taken. The fence self-heals without anybody
 * touching a file.
 *
 * IT FAILS OPEN, ALWAYS. A missing, unreadable, unparseable, corrupt, or
 * unwritable store never blocks a real launch: `acquire` hands out a token
 * anyway and the corrupt bytes are replaced by a well-formed store on the next
 * successful write. A concurrency fence that bricks the session is worse than the
 * gap it closes. Nothing here throws to the caller — every filesystem and path
 * operation is inside a guarded helper, so a garbage `root` degrades to "empty
 * store" rather than an exception.
 *
 * TIME IS INJECTABLE. Every function that reasons about the TTL accepts an
 * optional `now` (milliseconds), defaulting to the real clock, so tests prove the
 * thirty-minute contract without sleeping for thirty minutes.
 *
 * Cross-platform by construction: `path.join`, `safeFs`, no shell.
 */

const path = require('path');
const crypto = require('crypto');
const safeFs = require('./safe-fs');
const { MAX_CONCURRENT } = require('./task-registry');

/**
 * How long a slot may be held before its holder is presumed dead and the slot is
 * reclaimed. Thirty minutes: comfortably longer than any real subagent run, short
 * enough that a crash cannot wedge the fence for a working session. Exported so
 * callers and tests reason about the same number.
 * @type {number}
 */
const SLOT_TTL_MS = 30 * 60 * 1000;

/** Store schema version — bumped only if the on-disk shape ever changes. */
const STORE_VERSION = 1;

/** Label recorded when a caller supplies none (never `undefined` on disk). */
const DEFAULT_LABEL = 'subagent';

/**
 * The slot store's path for a project root.
 *
 * @param {string} root - project root
 * @returns {string} `<root>/.ctoc/state/agent-slots.json`
 */
function slotsPath(root) {
  return path.join(root, '.ctoc', 'state', 'agent-slots.json');
}

/**
 * A usable slot entry: a non-empty string token and a finite acquire stamp.
 * Anything else on disk is garbage and is dropped rather than trusted.
 *
 * The parameter is typed `any` rather than `unknown` on purpose: this function's
 * whole job is to probe arbitrary parsed JSON for two properties. Under `unknown`,
 * `typeof entry === 'object'` narrows only to `object`, which has no index
 * signature, so every probe below is a compile error for doing exactly what the
 * function exists to do. The runtime guard is unchanged and is the real check.
 *
 * @param {any} entry - a candidate entry parsed from the store
 * @returns {boolean}
 */
function isValidEntry(entry) {
  return !!entry
    && typeof entry === 'object'
    && typeof entry.token === 'string'
    && entry.token.length > 0
    && Number.isFinite(entry.acquiredAt);
}

/** A unique, unguessable slot token. */
function newToken() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Read the store's entries. NEVER throws: an absent, unreadable, unparseable,
 * or structurally wrong store — or an unusable `root` — all read as `[]`, which
 * is what makes the fence fail open. Garbage entries inside an otherwise
 * well-formed store are dropped.
 *
 * @param {string} root - project root
 * @returns {Array<{token:string,label:string,acquiredAt:number}>}
 */
function readSlots(root) {
  try {
    const file = slotsPath(root);
    if (!safeFs.existsSync(file)) return [];
    const parsed = JSON.parse(safeFs.readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.slots)) return [];
    return parsed.slots.filter(isValidEntry);
  } catch {
    return [];                                   // corrupt/unreadable → fail open
  }
}

/**
 * Persist the entries ATOMICALLY (temp file + rename). NEVER throws — a failed
 * write returns `false` and the caller carries on (fail open). Writing here is
 * also what RESETS a corrupt store: the well-formed payload replaces the garbage.
 *
 * @param {string} root - project root
 * @param {Array<object>} slots - the entries to persist
 * @returns {boolean} true iff the store was durably replaced
 */
function writeSlots(root, slots) {
  let tmp = null;
  try {
    const file = slotsPath(root);
    const dir = path.dirname(file);
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    safeFs.writeFileSync(tmp, JSON.stringify({ version: STORE_VERSION, slots }, null, 2));
    safeFs.renameSync(tmp, file);
    return true;
  } catch {
    if (tmp !== null) {
      try { safeFs.unlinkSync(tmp); } catch { /* the temp may never have existed */ }
    }
    return false;
  }
}

/**
 * The entries still presumed alive at `now` — i.e. acquired less than
 * `SLOT_TTL_MS` ago. PURE.
 *
 * @param {Array<{acquiredAt:number}>} slots
 * @param {number} now - milliseconds
 * @returns {Array<object>}
 */
function liveSlots(slots, now) {
  return slots.filter(s => now - s.acquiredAt < SLOT_TTL_MS);
}

/** Resolve an injected `now`, falling back to the real clock. */
function resolveNow(now) {
  return Number.isFinite(now) ? now : Date.now();
}

/**
 * Remove every stale entry (holder presumed dead) and persist the result. This is
 * the self-healing half of the fence: a subagent that crashed without firing
 * `SubagentStop` gets its slot back automatically. NEVER throws.
 *
 * @param {string} root - project root
 * @param {number} [now] - injected clock in milliseconds (defaults to `Date.now()`)
 * @returns {number} how many entries were reaped
 */
function reap(root, now) {
  const at = resolveNow(now);
  const slots = readSlots(root);
  const live = liveSlots(slots, at);
  const removed = slots.length - live.length;
  if (removed > 0) writeSlots(root, live);
  return removed;
}

/**
 * How many slots are live right now, AFTER reaping stale entries. NEVER throws;
 * an unusable or broken store counts as 0 (fail open) and the result is never
 * negative.
 *
 * @param {string} root - project root
 * @param {number} [now] - injected clock in milliseconds
 * @returns {number}
 */
function activeCount(root, now) {
  const at = resolveNow(now);
  reap(root, at);                                // stale holders are presumed dead
  return liveSlots(readSlots(root), at).length;
}

/**
 * Take a slot, or report that the cap is full. This is the mechanical fence: when
 * `MAX_CONCURRENT` slots are already live, the answer is `max-concurrent` — the
 * same reason `task-registry.evaluateConcurrency` Rule 1 returns, from the same
 * constant.
 *
 * FAILS OPEN: if the store is missing, corrupt, or cannot be written, the acquire
 * is GRANTED (with a token) rather than refused — CTOC's own bookkeeping breaking
 * must never stop the human's work.
 *
 * @param {string} root - project root
 * @param {{label?:string, now?:number}} [opts] - `label` names the launch in the
 *   store; `now` injects the clock (milliseconds) for deterministic tests.
 * @returns {{ok:true, token:string}|{ok:false, reason:'max-concurrent', running:number}}
 */
function acquire(root, opts = {}) {
  const at = resolveNow(opts && opts.now);
  const label = (opts && typeof opts.label === 'string' && opts.label) ? opts.label : DEFAULT_LABEL;
  const live = liveSlots(readSlots(root), at);

  if (live.length >= MAX_CONCURRENT) {
    return { ok: false, reason: 'max-concurrent', running: live.length };
  }

  const token = newToken();
  // The write also RESETS a corrupt store (readSlots already dropped the garbage)
  // and persists the reap in the same atomic replace. A failed write is fine: we
  // still hand out the token — fail open.
  writeSlots(root, [...live, { token, label, acquiredAt: at }]);
  return { ok: true, token };
}

/**
 * Give a slot back. NEVER throws, and the count can never go negative.
 *
 * Two modes, and the difference is the honest one:
 *   • `token` is a known live token → THAT entry is released (exact).
 *   • `token` is omitted/null       → the OLDEST live entry is released. This is
 *     what `SubagentStop` uses, because the harness's agent id does not exist yet
 *     when the PreToolUse hook runs, so there is nothing to correlate on. It is a
 *     COUNT-based semaphore, not an identity-based one.
 *   • `token` is a non-empty string nobody holds → NO-OP (returns ok). An unknown
 *     token must never free somebody else's slot.
 *
 * @param {string} root - project root
 * @param {string} [token] - the token handed out by `acquire`, or omitted for
 *   "release the oldest"
 * @param {number} [now] - injected clock in milliseconds
 * @returns {{ok:true, released:string|null}} `released` names the token that was
 *   given back, or null when nothing was
 */
function release(root, token, now) {
  const at = resolveNow(now);
  const live = liveSlots(readSlots(root), at);

  let index;
  if (typeof token === 'string' && token.length > 0) {
    index = live.findIndex(s => s.token === token);
    if (index === -1) return { ok: true, released: null };      // unknown → no-op
  } else {
    if (live.length === 0) return { ok: true, released: null };  // nothing to give back
    index = 0;
    for (let i = 1; i < live.length; i++) {
      if (live[i].acquiredAt < live[index].acquiredAt) index = i;
    }
  }

  const released = live[index].token;
  writeSlots(root, live.filter((_, i) => i !== index));
  return { ok: true, released };
}

module.exports = {
  acquire,
  release,
  activeCount,
  reap,
  slotsPath,
  SLOT_TTL_MS,
  MAX_CONCURRENT,
};

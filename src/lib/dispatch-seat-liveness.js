'use strict';
/**
 * DISPATCH-SEAT LIVENESS — the one honest answer to "did CTOC's dispatch seat
 * actually run here?"
 *
 * THE MEASUREMENT THAT MOTIVATED THIS (plan 00165, taken 2026-07-20 from inside a
 * live `Task` dispatch on this repository): the dispatch-path hook
 * `src/hooks/PreToolUse.Task.js` is correctly declared in `.claude-plugin/hooks.json`
 * and present in the installed plugin, yet it left NO artifact for a real dispatch —
 * `.ctoc/state/agent-slots.json` was absent, and `.ctoc/logs/enforcement.json` held
 * ZERO entries tagged with the `Task` tool or a `subagent` field. A claim mechanism
 * built into a hook that never runs would be indistinguishable from an instruction:
 * the registry would stay as empty as it is now while the suite stayed green, because
 * a hook's decision function tests perfectly in-process whether or not the harness
 * ever calls it. So this module makes the precondition a MEASUREMENT at runtime rather
 * than an assumption written into a plan.
 *
 * THREE STATES, AND THEY MUST NEVER COLLAPSE INTO TWO:
 *   • `live`      — the seat ran; here is the evidence and how old it is.
 *   • `not-live`  — both instruments were read successfully and hold NO Task evidence.
 *   • `unknown`   — an instrument could not be read, so nothing is known either way.
 *
 * `unknown` is the whole point. A check that reported "not live" when it merely could
 * not open the file would be this repository's documented false-green defect — the
 * empty answer standing in for the unread one. `unknown` is louder than `not-live`:
 * "I could not look" is a worse position than "I looked and it is dead". This mirrors
 * `src/scripts/test-gate.js`, whose parsers return `null` rather than the success value
 * `0` for exactly this reason.
 *
 * WHY FILE PRESENCE, NOT A HELD SLOT, IS THE EVIDENCE. A subagent that finished
 * released its slot, leaving `agent-slots.json` behind with an empty `slots` array.
 * The PRESENCE of the readable file proves the seat executed at least once; requiring
 * a live holder would report `not-live` for a project whose seat works perfectly and
 * is merely idle.
 *
 * THIS MODULE OBSERVES AND REPORTS ONLY. It never writes, never repairs, and never
 * infers WHY the seat is not live (plugin enablement and harness matcher behaviour are
 * not observable from inside a Node module reading this project's files — guessing a
 * cause would be an assertion that cannot be verified, the very defect class fenced
 * here). A module that both diagnosed and healed could never report a true `not-live`,
 * because its first run would fix the thing it measures. It NEVER throws: every read is
 * individually guarded, and a guarded failure produces `unreadable` for that source —
 * never the success value.
 *
 * The store path and the staleness window are IMPORTED from `agent-slots`, which owns
 * them; they are never re-spelled here. Cross-platform by construction: `path.join`,
 * `safeFs`, no shell.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const agentSlots = require('./agent-slots');

/**
 * An upper bound on the enforcement log we are willing to fully scan. The log is
 * rotation-capped at 1000 compact entries (~250 KB in practice); 5 MiB is ample
 * headroom. A log larger than this cannot be fully scanned, and a PARTIAL scan that
 * reported `no-task` would be a verdict on input we never read — so an oversized log
 * is reported `unreadable`, never `no-task`.
 * @type {number}
 */
const MAX_LOG_BYTES = 5 * 1024 * 1024;

/** Resolve an injected `now`, falling back to the real clock. */
function resolveNow(now) {
  return Number.isFinite(now) ? now : Date.now();
}

/**
 * Whether `root` is a usable project directory. A non-string, empty string, missing
 * path, or a path that is a FILE (not a directory) is unusable — and the honest report
 * for an unusable root is that the instruments could not be read (`unknown`), never
 * that they were read and found empty.
 * @param {*} root
 * @returns {boolean}
 */
function usableRoot(root) {
  if (!root || typeof root !== 'string') return false;
  try {
    return safeFs.existsSync(root) && safeFs.statSync(root).isDirectory();
  } catch {
    return false;                 // a bad path is unusable, not a crash
  }
}

/**
 * Inspect the agent-slots store. Its path and the staleness window come from
 * `agent-slots`. The PRESENCE of a readable file is the evidence the seat ran — the
 * file's modification time supplies `at`, and an entry still inside the time-to-live
 * additionally reports a live holder in `detail` (not required for `present`).
 *
 * @param {string} root
 * @param {number} now - resolved clock in milliseconds
 * @returns {{status: 'present'|'absent'|'unreadable', evidence: (null|{source: 'agent-slots', at: string, ageMs: number, detail: string})}}
 */
function inspectSlotStore(root, now) {
  const file = agentSlots.slotsPath(root);
  let exists;
  try {
    exists = safeFs.existsSync(file);
  } catch {
    return { status: 'unreadable', evidence: null };
  }
  if (!exists) return { status: 'absent', evidence: null };

  let stat;
  try {
    stat = safeFs.statSync(file);
  } catch {
    return { status: 'unreadable', evidence: null };
  }
  if (!stat.isFile()) return { status: 'unreadable', evidence: null };   // a directory in its place

  let raw;
  try {
    raw = safeFs.readFileSync(file, 'utf8');
  } catch {
    return { status: 'unreadable', evidence: null };                     // e.g. mode-stripped
  }

  const at = new Date(stat.mtimeMs).toISOString();
  const ageMs = now - stat.mtimeMs;
  let detail = 'slot store present (no live holder)';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.slots)) {
      let liveHolders = 0;
      for (const s of parsed.slots) {
        if (s && Number.isFinite(s.acquiredAt) && (now - s.acquiredAt) < agentSlots.SLOT_TTL_MS) liveHolders += 1;
      }
      if (liveHolders > 0) detail = `${liveHolders} live holder(s)`;
    }
  } catch {
    // A present-but-unparseable store still proves the seat ran and wrote here; the
    // parse only enriches `detail`, so a failure downgrades detail, never the verdict.
    detail = 'slot store present (unparseable contents)';
  }
  return { status: 'present', evidence: { source: 'agent-slots', at, ageMs, detail } };
}

/**
 * Whether a parsed log object is Task-tool evidence: its `tool` is `Task`, or it
 * carries a truthy `subagent` field (written ONLY by the Task hook).
 * @param {*} obj
 * @returns {boolean}
 */
function isTaskEntry(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.tool === 'Task') return true;
  if (Object.prototype.hasOwnProperty.call(obj, 'subagent') && obj.subagent) return true;
  return false;
}

/**
 * Scan `.ctoc/logs/enforcement.json` (newline-delimited JSON, one object per line) for
 * a Task-tool entry. Per-line parse failures are counted, not fatal — a single
 * malformed line in an append-only log must not blind the whole check — but if NO line
 * could be parsed the source is `unreadable`, not `no-task`. Reads are bounded (an
 * oversized log is `unreadable`) and stop at the first positive entry, so a large log
 * cannot be truncated-then-parsed into a wrong verdict.
 *
 * An ABSENT log is a successful observation of "no Task evidence here" — readable
 * absence, reported `no-task` exactly like a present log with no Task line.
 *
 * @param {string} root
 * @param {number} now - resolved clock in milliseconds
 * @returns {{status: 'has-task'|'no-task'|'unreadable', evidence: (null|{source: 'enforcement-log', at: string, ageMs: number, detail: string})}}
 */
function scanLogForTask(root, now) {
  const file = path.join(root, '.ctoc', 'logs', 'enforcement.json');
  let exists;
  try {
    exists = safeFs.existsSync(file);
  } catch {
    return { status: 'unreadable', evidence: null };
  }
  if (!exists) return { status: 'no-task', evidence: null };

  let stat;
  try {
    stat = safeFs.statSync(file);
  } catch {
    return { status: 'unreadable', evidence: null };
  }
  if (!stat.isFile()) return { status: 'unreadable', evidence: null };   // a directory in its place
  if (stat.size > MAX_LOG_BYTES) return { status: 'unreadable', evidence: null };  // cannot fully scan

  let raw;
  try {
    raw = safeFs.readFileSync(file, 'utf8');
  } catch {
    return { status: 'unreadable', evidence: null };
  }

  const lines = raw.split('\n');
  let sawNonBlank = false;
  let parsedAny = false;
  for (const text of lines) {
    if (text.trim() === '') continue;
    sawNonBlank = true;
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      continue;                    // one malformed line is counted, never fatal
    }
    parsedAny = true;
    if (isTaskEntry(obj)) {
      const at = typeof obj.timestamp === 'string' ? obj.timestamp : new Date(stat.mtimeMs).toISOString();
      const parsedAt = Date.parse(at);
      const ageMs = Number.isFinite(parsedAt) ? (now - parsedAt) : (now - stat.mtimeMs);
      return { status: 'has-task', evidence: { source: 'enforcement-log', at, ageMs, detail: 'Task-tool enforcement entry' } };
    }
  }
  // No Task entry. A log whose every non-blank line was unparseable is a blind
  // instrument (`unreadable`), NOT an empty one (`no-task`).
  if (sawNonBlank && !parsedAny) return { status: 'unreadable', evidence: null };
  return { status: 'no-task', evidence: null };
}

/**
 * Has CTOC's dispatch seat produced evidence of running in this project?
 *
 * @param {string} root - project root
 * @param {{now?: number}} [opts] - `now` (milliseconds) injects the clock so age
 *   assertions are deterministic without sleeping.
 * @returns {{
 *   state: 'live'|'not-live'|'unknown',
 *   evidence: (null|{source: 'agent-slots'|'enforcement-log', at: string, ageMs: number, detail: string}),
 *   sources: {agentSlots: 'present'|'absent'|'unreadable', enforcementLog: 'has-task'|'no-task'|'unreadable'},
 *   reason: string
 * }}
 */
function seatLiveness(root, opts = {}) {
  const now = resolveNow(opts && opts.now);

  if (!usableRoot(root)) {
    return {
      state: 'unknown',
      evidence: null,
      sources: { agentSlots: 'unreadable', enforcementLog: 'unreadable' },
      reason: 'instruments-unreadable',
    };
  }

  const slots = inspectSlotStore(root, now);
  const log = scanLogForTask(root, now);
  const sources = { agentSlots: slots.status, enforcementLog: log.status };

  // Positive evidence from EITHER instrument proves the seat ran, even when the other
  // instrument is blind. The direct slot-store evidence is preferred.
  if (slots.status === 'present') {
    return { state: 'live', evidence: slots.evidence, sources, reason: 'slot-store-present' };
  }
  if (log.status === 'has-task') {
    return { state: 'live', evidence: log.evidence, sources, reason: 'task-log-entry' };
  }

  // No positive evidence. A blind instrument forces UNKNOWN — a readable-but-empty
  // instrument can never overrule an unread one; that would be the false-green defect.
  if (slots.status === 'unreadable' || log.status === 'unreadable') {
    return { state: 'unknown', evidence: null, sources, reason: 'instruments-unreadable' };
  }

  // Both instruments were read successfully and hold no Task evidence.
  return { state: 'not-live', evidence: null, sources, reason: 'no-task-evidence' };
}

/**
 * A coarse human-readable age. Fixed vocabulary and a single unit; the underlying
 * `ageMs` remains available on the evidence for anyone who needs precision.
 * @param {number} ms
 * @returns {string}
 */
function formatAge(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * One human-readable paragraph naming the state, the evidence and its age, and — for
 * `not-live` and `unknown` — the specific consequence: a dispatch-seated claim cannot
 * be relied upon, so plan 00166 must not be trusted to have fired. PURE.
 *
 * SECURITY: it emits ONLY a fixed-vocabulary state, the fixed source names, a coarse
 * numeric age, and the fixed-vocabulary source statuses. It NEVER interpolates any log
 * content (a log line may carry a target file path or hostile bytes — a newline, a
 * terminal escape, a `%s`, a huge field), no absolute path, and no stack trace.
 *
 * @param {ReturnType<typeof seatLiveness>} result
 * @returns {string}
 */
function describeLiveness(result) {
  const src = result.sources;
  const srcLine = `agent-slots=${src.agentSlots}, enforcement-log=${src.enforcementLog}`;

  if (result.state === 'live') {
    const ev = result.evidence;
    const source = (ev && (ev.source === 'agent-slots' || ev.source === 'enforcement-log')) ? ev.source : 'an instrument';
    const age = (ev && Number.isFinite(ev.ageMs)) ? `${formatAge(ev.ageMs)} old` : 'age unknown';
    return `CTOC dispatch seat is LIVE: the seat has produced evidence of running in this project ` +
      `(${source}, ${age}), so a dispatch-seated claim can be relied upon. Instruments: ${srcLine}.`;
  }
  if (result.state === 'not-live') {
    return `CTOC dispatch seat is NOT LIVE: both instruments were read successfully and hold no ` +
      `evidence the seat has ever run in this project. A dispatch-seated claim CANNOT be relied upon — ` +
      `plan 00166 must not be trusted to have fired, because a claim recorded through this seat would ` +
      `leave a trace, and none exists. Instruments: ${srcLine}.`;
  }
  if (result.state === 'unknown') {
    return `CTOC dispatch seat liveness is UNKNOWN: the instruments could not be read, so nothing is ` +
      `known either way — this is NOT a pass, and it is a worse position than a dead seat because the ` +
      `check could not even look. A dispatch-seated claim CANNOT be relied upon, and plan 00166 must ` +
      `not be trusted to have fired until the instruments are readable. Instruments: ${srcLine}.`;
  }
  return `CTOC dispatch seat liveness could not be described (unrecognised result); treated as not ` +
    `established, so a dispatch-seated claim CANNOT be relied upon.`;
}

module.exports = { seatLiveness, describeLiveness };

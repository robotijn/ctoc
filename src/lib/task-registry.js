/**
 * Task Registry and Scheduler (pure model + single-file persistence).
 *
 * Owns the background-task model for CTOC's non-blocking menu plane, persists it to
 * one JSON file (`.ctoc/state/tasks.json`) with Claude as the sole writer, and
 * exposes the scheduler decisions `canRun` / `nextRunnable` plus the atomic
 * `addAndClaim`. This is the algorithmic heart that turns CTOC's concurrency rules
 * into enforced, unit-tested code.
 *
 * ── Serialization model (vision F1 — FILE-based, human-decided; do NOT relitigate) ─
 *   Kind-based "plan-serial" (one `implement` task at a time) is DELETED. Two tasks
 *   may run concurrently iff their touched files are DISJOINT — file-conflict
 *   (Rule 4) is the serializer. This is what makes the file-disjoint wave pattern
 *   ("1 plan per agent", ≤5 concurrent) legal instead of strangled by kind. Because
 *   file disjointness now guards correctness, `touches` is MANDATORY for every
 *   `implement` task: both `addTask` and `canRun` reject an empty-touches implement
 *   LOUDLY (an undeclared implement would bypass Rule 4 and make the model unsound).
 *
 * ── The concurrency ladder (order is LOAD-BEARING) ──────────────────────────────
 *   Rule 0  dependency gate (canRun only), KIND-AWARE (C1-1): for a `sync` candidate a
 *           dep satisfies once it is SETTLED (terminal — done/failed/orphaned/cancelled),
 *           so a barrier waits for the wave to settle rather than deadlocking on a
 *           failure it is meant to report; every OTHER kind keeps done-only. A missing
 *           dep never satisfies. `unsatisfiableTasks` surfaces the queued tasks a dead
 *           dep or a blockedBy cycle would otherwise wedge silently forever (C1-7).
 *           CONFIRM-LIVENESS (human ruling 2026-07-26): an orphaned dep settles a `sync`
 *           barrier ONLY when its agent is CONFIRMED gone (no reason marker, or
 *           `confirmed-dead`) — never on age alone (`staleness` / `presumed-dead`),
 *           because a wave commit is irreversible. See depsSatisfied.
 *
 *   NOTE — the scheduler is NO LONGER strictly reason-blind. Per the same ruling, the
 *   concurrent-edit BELT (canRun refuses a candidate that would edit files still reserved
 *   by an age-only `staleness` orphan) and the CONFIRM-LIVENESS barrier rule both read
 *   `result.orphanReason` in this section. This intentionally supersedes the earlier
 *   "scheduler reads only status/kind/touches/gitOp" ruling (promote-quarantine-parity
 *   case 9/9b), which is updated to the belt-and-suspenders contract. The PROJECTION
 *   (`task-reconcile.applyQuarantine`) remains the reporter/suspenders; sibling 00013-r3b
 *   owns the longer-term cross-file consolidation.
 *   Rule 1  max-concurrent: at most MAX_CONCURRENT occupying a slot. `running` AND
 *           `cancelling` occupy (C1-2 — a cancelling task keeps its slot until gone).
 *   Rule 2  sync-barrier: a `sync` candidate waits while ANY task runs, and NO
 *           candidate (even read-only) starts while a `sync` runs. A `sync` is the
 *           wave integration boundary (integrated suite + ratchet + commit) and
 *           must see frozen state. Stricter than, and independent of, git-exclusive.
 *   Rule 3  git-exclusive: a gitOp candidate is blocked by any running editing-or-git
 *           task; an editing candidate is blocked by any running gitOp.
 *   Rule 4  file-conflict: candidate.touches OVERLAPS the union of running touches,
 *           glob-aware via `plan-coverage.touchesOverlap` (globs on either side).
 *
 * ── WHERE THE LADDER IS ENFORCED (R3-B — read this before adding a writer) ──────
 *   Defining the rules is not enforcing them. `canRun` is the ONLY oracle, and every
 *   path that can set `status: 'running'` MUST consult it:
 *     • `addAndClaim`            — consults canRun before claiming (here).
 *     • `menu task start`        — menu-screens.taskTransition('start') calls canRun and
 *                                  REFUSES on a false decision; `--force` is a human
 *                                  override that is LOGGED (`forced_start`), never silent.
 *     • `nextRunnable`           — the promote projection; the only sanctioned promotion set.
 *   `updateTask` deliberately does NOT consult the ladder: it is the low-level model
 *   mutator (reconcile, coupling, and force-overrides legitimately drive it). A NEW
 *   caller that writes `running` MUST go through canRun first or document why it is exempt.
 *
 * ── CROSS-PROCESS SAFETY: COMPARE-AND-SWAP (R3-B item 7) ────────────────────────
 *   The old "EXACTLY ONE writer" invariant was an ASSUMPTION enforced nowhere, and
 *   concurrent writers demonstrably exist (the TUI's 5-minute autosync process alongside
 *   session child processes running `menu task …`). Every mutation was an unlocked
 *   load→mutate→save, so the second writer silently clobbered the first (lost update).
 *   The registry now carries a `generation` counter:
 *     • `load`  stamps the on-disk generation onto the value (absent ⇒ 0 — backward
 *       compatible with every pre-R3-B tasks.json).
 *     • `save`  re-reads the on-disk generation and REFUSES with a `StaleRegistryError`
 *       when it moved since the value was loaded; on success it writes generation + 1.
 *     • `withRegistry(root, mutator)` is the retry helper every load→save caller uses:
 *       load → mutate → save → on conflict RELOAD and re-apply (bounded, 5 attempts,
 *       no sleep/busy-wait). A mutator must therefore be safe to re-run.
 *   A value with NO `generation` field (a hand-built literal, e.g. `emptyRegistry()` or a
 *   test fixture) is an UNVERSIONED write: it skips the check and overwrites. That is the
 *   deliberate seeding path; production mutators load first and are therefore always checked.
 *
 * ── Design invariants ───────────────────────────────────────────────────────────
 *   • ATOMIC + COMPARE-AND-SWAP. Writes are atomic (temp + rename) and generation-checked
 *     (above), so two live processes can no longer lose each other's updates.
 *   • DATA-ORIENTED functional API over a plain registry VALUE: load/save read/write
 *     the value; addTask/updateTask mutate it in memory; canRun/nextRunnable are
 *     pure reads. `addAndClaim` is the one function that composes them over disk in
 *     a single load→save cycle (closing the record-vs-start blind window).
 *   • FAIL-OPEN LOAD vs FAIL-LOUD SAVE. `load` NEVER throws on a file/data problem
 *     (a corrupt registry must never brick the NAV plane); `save` FAILS LOUD.
 *   • ATOMIC WRITE: temp sibling + renameSync over the target; on failure the temp
 *     is unlinked and the error rethrown.
 *   • id + seq: a persisted, never-decremented `seq`; addTask assigns `id = 't'+(++seq)`
 *     → unique, strictly monotonic, no reuse across pruning/reload. FIFO order is the
 *     tasks-array insertion order (== seq order), NOT timestamps — clock-skew immune.
 *   • CANCEL lifecycle (C1-2): `queued → cancelled` is immediate; a running task cancels
 *     via `running → cancelling → cancelled`. `cancelling` is a NON-terminal state that
 *     still OCCUPIES its slot/touches/gitOp/sync-barrier, so the registry never frees a
 *     live agent's files early; it resolves to done/failed if a completion arrives during
 *     cancellation. Killing the harness-level agent is the caller's job.
 *   • ORPHANED is a SOFT terminal (C1-5): a falsely-orphaned agent that later finishes may
 *     transition `orphaned → done | failed` (a late completion is accepted, not dropped).
 *     done/failed/cancelled remain HARD terminals with no exit.
 *
 * ALL filesystem access routes through src/lib/safe-fs.js — the audited choke
 * point (LH1); there is no raw `fs` in this module. There is NO regex in this module
 * either: the ONLY glob→regex construction lives behind
 * `plan-coverage.touchesOverlap` (Rule 4), so the promoted-to-error security lint
 * rules cannot fire here.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');
const { touchesOverlap } = require('./plan-coverage');

// ── constants ───────────────────────────────────────────────────────────────

/** On-disk schema version. A mismatch fails open (empty + warn) — see load(). */
const REGISTRY_VERSION = 1;
/** Bounded compare-and-swap retries in `withRegistry` (no sleep, no busy-wait). */
const WITH_REGISTRY_ATTEMPTS = 5;
/** D5: at most this many operations run concurrently. */
const MAX_CONCURRENT = 5;
/** Warn-log rotation cap (mirrors store.js). */
const MAX_LOG_ENTRIES = 500;
/**
 * Sanity cap on the number of task entries accepted from disk. A giant crafted
 * registry above this is treated as untrusted → fail open to empty + warn
 * (defense-in-depth; NB1 never legitimately holds this many background tasks).
 */
const MAX_TASKS = 10000;
/**
 * Max length of a single `touches` entry. A crafted longer string is rejected at
 * the shape gate (defense-in-depth: `globToRegex` behind `touchesOverlap` is the
 * only regex path, and this bounds its input length).
 */
const MAX_TOUCH_LENGTH = 512;

/**
 * The valid task kinds (vision §3a enumeration).
 *
 * `precompute` is the streaming gate-question generation task — one per plan ref.
 * It writes ONLY `.ctoc/streaming/questions/<ref>.json`, never a plan file, so
 * refs run concurrently (their `touches` are disjoint by construction) and the
 * completion path never invokes plan completion (that is gated on `implement`).
 * Its absence was load-bearing: `menu task add precompute` threw, the record-first
 * step failed, no lens critic was ever dispatched, no questions file was ever
 * written, and the streaming screen silently fell back to the bare gate prompt.
 */
const KINDS = Object.freeze(new Set([
  'implement', 'plan', 'review', 'quality', 'security', 'decompose', 'discuss', 'sync',
  'precompute'
]));
/**
 * All valid task statuses. `cancelling` is a NON-terminal in-flight state (C1-2):
 * a running task ordered to cancel enters `cancelling` and keeps occupying its slot,
 * touches, gitOp and the sync barrier until the agent is confirmed gone. The genuine
 * terminals are done/failed/orphaned/cancelled (see TERMINAL).
 */
const STATUSES = Object.freeze(new Set(['queued', 'running', 'cancelling', 'done', 'failed', 'orphaned', 'cancelled']));
/**
 * Terminal statuses for the purpose of ts.done auto-stamping. `orphaned` is a SOFT
 * terminal (C1-5): entering it stamps ts.done, but a falsely-orphaned agent that
 * later finishes may still transition orphaned→done / orphaned→failed (a late
 * completion is accepted, not dropped). done/failed/cancelled are HARD terminals —
 * no transition leaves them. `cancelling` is NOT terminal (it is an active state).
 */
const TERMINAL = Object.freeze(new Set(['done', 'failed', 'orphaned', 'cancelled']));
/**
 * Allowed status transitions.
 *   • `queued → cancelled` is IMMEDIATE (nothing is running, so freeing is safe).
 *   • A running task cancels via `running → cancelling → cancelled` (C1-2): direct
 *     running→cancelled is FORBIDDEN because it would free the task's files/slot while
 *     the harness agent may still be alive. `cancelling` may also resolve to done/failed
 *     if a completion/failure arrives during cancellation (recorded honestly).
 *   • `orphaned → done | failed` exist so a falsely-orphaned agent's late completion is
 *     ACCEPTED (C1-5). No other escape from orphaned (→running/→cancelled stay illegal).
 * Every transition INTO a terminal auto-stamps `ts.done` (re-stamps on orphaned→done).
 */
const VALID_TRANSITIONS = Object.freeze({
  queued: new Set(['running', 'failed', 'cancelled']),
  running: new Set(['done', 'failed', 'orphaned', 'cancelling']),
  cancelling: new Set(['cancelled', 'done', 'failed']),
  done: new Set(),
  failed: new Set(),
  orphaned: new Set(['done', 'failed']),
  cancelled: new Set()
});
/** updateTask whitelist — id is immutable; ts is merged specially. */
const MUTABLE_FIELDS = Object.freeze(['status', 'agentTaskId', 'result', 'label', 'touches', 'blockedBy', 'plan']);

// ── path + warn-log helpers ───────────────────────────────────────────────────

/**
 * Absolute path to the single registry file. Computed INSIDE the module so the
 * "only one registry file" invariant cannot be violated by a caller.
 * @param {string} root  Project root.
 * @returns {string}
 */
function registryPath(root) {
  return path.join(root, '.ctoc', 'state', 'tasks.json');
}

/**
 * Absolute path to the warn log.
 * @param {string} root
 * @returns {string}
 */
function logPath(root) {
  return path.join(root, '.ctoc', 'logs', 'task-registry.json');
}

/**
 * Absolute path to the drain-stop flag file. Its EXISTENCE means a graceful
 * "finish the current work, then stop" has been requested. Computed inside the
 * module so the single-file-flag invariant cannot be violated by a caller.
 * @param {string} root
 * @returns {string}
 */
function drainStopPath(root) {
  return path.join(root, '.ctoc', 'state', 'drain-stop');
}

/**
 * Append a warn entry (best-effort append + rotate). A broken log must NEVER break
 * the registry, so every failure here is swallowed.
 * @param {string} root
 * @param {string} event
 * @param {object} [detail]
 * @returns {void}
 */
function warnLog(root, event, detail = {}) {
  try {
    const dir = path.join(root, '.ctoc', 'logs');
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    const p = logPath(root);
    let log = [];
    if (safeFs.existsSync(p)) {
      try { log = JSON.parse(safeFs.readFileSync(p, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({ timestamp: new Date().toISOString(), level: 'warn', event, ...detail });
    if (log.length > MAX_LOG_ENTRIES) log = log.slice(-MAX_LOG_ENTRIES);
    safeFs.writeFileSync(p, JSON.stringify(log, null, 2));
  } catch {
    /* logging is best-effort; never propagate into the caller */
  }
}

/**
 * Read the warn log (fail-open → []). For the NB2 dashboard and tests.
 * @param {string} root
 * @returns {Array<object>}
 */
function readWarnLog(root) {
  try {
    const p = logPath(root);
    if (!safeFs.existsSync(p)) return [];
    const log = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

// ── persistence ────────────────────────────────────────────────────────────────

/**
 * A stale-write refusal (R3-B item 7): the on-disk `generation` moved between the
 * caller's `load` and its `save`, so persisting would clobber another process's
 * committed mutation. Thrown by `save`; caught (and retried) by `withRegistry`.
 */
class StaleRegistryError extends Error {
  /**
   * @param {string} message
   * @param {{expected?:number, actual?:number}} [detail]
   */
  constructor(message, detail = {}) {
    super(message);
    this.name = 'StaleRegistryError';
    this.expected = detail.expected;
    this.actual = detail.actual;
  }
}

/**
 * A fresh, empty registry value. It carries NO `generation` — it is not a loaded
 * value, so a `save` of it is an unversioned (seeding) write, not a compare-and-swap.
 * @returns {{version:number, seq:number, tasks:Array<object>}}
 */
function emptyRegistry() {
  return { version: REGISTRY_VERSION, seq: 0, tasks: [] };
}

/** @returns {string} current instant as an ISO-8601 string. */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Highest numeric suffix among ids of the form `t<n>` (0 if none). Used to repair
 * `seq` on load so it can never collide with an existing id. No regex.
 * @param {Array<{id:string}>} tasks
 * @returns {number}
 */
function highestIdSuffix(tasks) {
  let max = 0;
  for (const t of tasks) {
    if (t && typeof t.id === 'string' && t.id.startsWith('t')) {
      const n = Number(t.id.slice(1));
      // isSafeInteger (not isInteger): an id suffix ≥ 2^53 cannot be incremented
      // without collision, so it must not seed `seq` — treat it as absent.
      if (Number.isSafeInteger(n) && n > max) max = n;
    }
  }
  return max;
}

/**
 * Validate + normalize a task entry loaded from disk. Throws on any structural
 * problem so load() can skip+warn that single entry (per-task fail-open).
 * @param {any} t
 * @returns {object} a normalized task
 */
function normalizeLoadedTask(t) {
  if (!t || typeof t !== 'object') throw new Error('task entry is not an object');
  if (typeof t.id !== 'string' || t.id.length === 0) throw new Error('task missing id');
  if (typeof t.kind !== 'string' || !KINDS.has(t.kind)) throw new Error('task has invalid kind');
  if (typeof t.status !== 'string' || !STATUSES.has(t.status)) throw new Error('task has invalid status');
  const touches = Array.isArray(t.touches) ? t.touches.filter(x => typeof x === 'string') : [];
  const blockedBy = Array.isArray(t.blockedBy) ? t.blockedBy.filter(x => typeof x === 'string') : [];
  const ts = (t.ts && typeof t.ts === 'object') ? t.ts : {};
  return {
    id: t.id,
    kind: t.kind,
    label: typeof t.label === 'string' ? t.label : '',
    plan: t.plan ?? null,
    status: t.status,
    agentTaskId: t.agentTaskId ?? null,
    touches,
    gitOp: t.gitOp === true,
    blockedBy,
    result: t.result ?? null,
    ts: {
      created: typeof ts.created === 'string' ? ts.created : nowIso(),
      started: typeof ts.started === 'string' ? ts.started : null,
      // R3-B item 10: the cancel-deadline clock. It MUST survive a load — dropping it
      // (the pre-R3-B normalizer did) would restart the deadline on every menu open and
      // a hung `cancelling` task would hold its files + the sync barrier forever.
      cancelRequested: typeof ts.cancelRequested === 'string' ? ts.cancelRequested : null,
      done: typeof ts.done === 'string' ? ts.done : null
    }
  };
}

/**
 * The registry `generation` as recorded on disk (R3-B item 7). Fail-open: an absent,
 * unparseable, or non-integer generation reads as 0, so every pre-R3-B tasks.json is a
 * valid generation-0 registry and no migration is required.
 * @param {string} root
 * @returns {number}
 */
function diskGeneration(root) {
  const p = registryPath(root);
  try {
    if (!safeFs.existsSync(p)) return 0;
    const data = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    return (data && Number.isSafeInteger(data.generation) && data.generation >= 0) ? data.generation : 0;
  } catch {
    return 0; // a corrupt file has no committed generation to protect
  }
}

/**
 * Load the registry value from disk. FAIL-OPEN — never throws on a file/data
 * problem. Absent → empty (no warn: a first run is normal). Unparseable /
 * wrong-shape / version-mismatch → empty + `registry_load_failed` warn. A single
 * malformed task entry → skip + `task_skipped_malformed` warn, the rest load.
 * Duplicate ids → last wins + `task_id_collision` warn. `seq` is repaired so it can
 * never collide with an existing id.
 * @param {string} root  Project root (a non-empty string).
 * @returns {{version:number, generation:number, seq:number, tasks:Array<object>}}
 */
function load(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('task-registry: load requires a non-empty root string');
  }
  const p = registryPath(root);
  // R3-B item 7: a LOADED value ALWAYS carries a `generation` (absent/corrupt on disk ⇒ 0),
  // so a subsequent save via `withRegistry` is a real compare-and-swap. `emptyRegistry()`
  // stays generation-less on purpose — it is the SEED literal, an unversioned write.
  const loadedEmpty = () => ({ version: REGISTRY_VERSION, generation: diskGeneration(root), seq: 0, tasks: [] });
  if (!safeFs.existsSync(p)) return loadedEmpty();

  let data;
  try {
    data = JSON.parse(safeFs.readFileSync(p, 'utf8'));
  } catch (err) {
    warnLog(root, 'registry_load_failed', { message: err && err.message ? err.message : String(err) });
    return loadedEmpty();
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks) || data.version !== REGISTRY_VERSION) {
    warnLog(root, 'registry_load_failed', { message: 'registry file has an unexpected shape or version' });
    return loadedEmpty();
  }
  if (data.tasks.length > MAX_TASKS) {
    // A giant crafted registry is untrusted → fail open to empty + warn.
    warnLog(root, 'registry_too_large', { count: data.tasks.length, max: MAX_TASKS });
    return loadedEmpty();
  }

  const byId = new Map();
  for (const raw of data.tasks) {
    let norm;
    try {
      norm = normalizeLoadedTask(raw);
    } catch (err) {
      warnLog(root, 'task_skipped_malformed', {
        id: raw && typeof raw === 'object' && typeof raw.id === 'string' ? raw.id : null,
        message: err && err.message ? err.message : String(err)
      });
      continue;
    }
    if (byId.has(norm.id)) warnLog(root, 'task_id_collision', { id: norm.id });
    byId.set(norm.id, norm); // last wins
  }

  const tasks = Array.from(byId.values());
  // seq must be a SAFE non-negative integer. A crafted seq ≥ 2^53 breaks ++seq
  // monotonicity (seq + 1 === seq) → id reuse; clamp it (fail-open) to a safe value
  // derived from the real ids and warn. An absent seq (legacy file) is normal → no warn.
  let fileSeq = 0;
  if (Number.isSafeInteger(data.seq) && data.seq >= 0) {
    fileSeq = data.seq;
  } else if (data.seq != null) {
    warnLog(root, 'registry_seq_clamped', { seq: String(data.seq) });
  }
  const seq = Math.max(fileSeq, highestIdSuffix(tasks));
  // R3-B item 7: stamp the generation this value was loaded at, so `save` can
  // compare-and-swap against it. Absent on disk ⇒ 0 (backward compatible).
  const generation = (Number.isSafeInteger(data.generation) && data.generation >= 0) ? data.generation : 0;
  return { version: REGISTRY_VERSION, generation, seq, tasks };
}

/**
 * Persist the registry value atomically (temp sibling + rename) under a COMPARE-AND-SWAP
 * on `generation` (R3-B item 7). FAIL-LOUD in both directions:
 *   • CONFLICT — the value carries a `generation` (i.e. it came from `load`) and the
 *     on-disk generation has MOVED since: throw `StaleRegistryError` and write NOTHING.
 *     Another process committed in between; blindly writing would lose its update.
 *     `withRegistry` is the sanctioned retry (reload → re-apply → save).
 *   • WRITE FAILURE — the temp is unlinked, a `registry_save_failed` warn is recorded,
 *     and the error is RETHROWN so a real write failure is never silently lost.
 * On success the committed generation is `diskGeneration + 1` and is written back onto
 * the in-memory value, so a caller may save the SAME value again (sequential mutations)
 * without a false conflict.
 *
 * A value with NO `generation` field (a hand-built literal / `emptyRegistry()`) is an
 * UNVERSIONED write: the compare is skipped (seeding path). Every production mutator
 * loads first, so every production write IS checked.
 *
 * @param {string} root
 * @param {{version?:number, generation?:number, seq:number, tasks:Array<object>}} registry
 * @returns {void}
 * @throws {StaleRegistryError} the on-disk generation moved since this value was loaded
 */
function save(root, registry) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('task-registry: save requires a non-empty root string');
  }
  if (!registry || typeof registry !== 'object') {
    throw new TypeError('task-registry: save requires a registry object');
  }
  const onDisk = diskGeneration(root);
  const loadedAt = Number.isSafeInteger(registry.generation) && registry.generation >= 0
    ? registry.generation
    : null; // unversioned (hand-built) value → no compare
  if (loadedAt !== null && onDisk !== loadedAt) {
    warnLog(root, 'registry_stale_write_refused', { expected: loadedAt, actual: onDisk });
    throw new StaleRegistryError(
      `task-registry: stale write refused — the registry moved from generation ${loadedAt} ` +
      `to ${onDisk} while this value was held (another process committed). Reload and re-apply ` +
      `(see withRegistry).`,
      { expected: loadedAt, actual: onDisk }
    );
  }
  const nextGeneration = onDisk + 1;

  const target = registryPath(root);
  const dir = path.dirname(target);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = JSON.stringify({
    version: REGISTRY_VERSION,
    generation: nextGeneration,
    seq: Number.isSafeInteger(registry.seq) && registry.seq >= 0 ? registry.seq : 0,
    tasks: Array.isArray(registry.tasks) ? registry.tasks : []
  }, null, 2);
  try {
    safeFs.mkdirSync(dir, { recursive: true });
    safeFs.writeFileSync(tmp, payload);
    safeFs.renameSync(tmp, target);
  } catch (err) {
    try { safeFs.unlinkSync(tmp); } catch { /* temp may not exist */ }
    warnLog(root, 'registry_save_failed', { message: err && err.message ? err.message : String(err) });
    throw err;
  }
  // Advance the in-memory value so a second sequential save of the SAME object does
  // not self-conflict (it is now the committed generation).
  registry.generation = nextGeneration;
}

/**
 * THE load→save choke point (R3-B item 7). Load the registry, hand it to `mutator`,
 * persist it under the compare-and-swap, and RETRY the whole cycle on a
 * `StaleRegistryError` (another process committed in between) — bounded, with NO sleep
 * and no busy-wait: the retry is an immediate reload, which is exactly the work needed
 * to re-decide against the fresh state.
 *
 * The mutator MUST be safe to re-run (it may execute up to `attempts` times against a
 * FRESH registry each time), so it must not carry out I/O or side effects outside the
 * registry value. Side-effecting work (moving a plan file, running VERIFY) belongs
 * OUTSIDE the mutator, before or after the call.
 *
 * A mutator that decides NOT to write (a refusal — e.g. the ladder says no) calls
 * `ctx.abort()`: `withRegistry` then returns the mutator's value WITHOUT saving, so a
 * refusal provably leaves the registry byte-unchanged.
 *
 * @template T
 * @param {string} root  Project root.
 * @param {(registry: {generation:number, seq:number, tasks:Array<object>}, ctx: {attempt:number, abort:() => void}) => T} mutator
 * @param {{attempts?:number}} [opts]  bounded retry count (default 5).
 * @returns {T} whatever the mutator returned.
 * @throws {StaleRegistryError} the retries were exhausted (persistent contention).
 * @throws {Error} anything the mutator or the save throws (nothing is persisted).
 */
function withRegistry(root, mutator, opts = {}) {
  if (typeof mutator !== 'function') {
    throw new TypeError('task-registry: withRegistry requires a mutator function');
  }
  const attempts = Number.isSafeInteger(opts.attempts) && opts.attempts > 0
    ? opts.attempts
    : WITH_REGISTRY_ATTEMPTS;
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const registry = load(root);
    let aborted = false;
    const ctx = { attempt, abort: () => { aborted = true; } };
    const value = mutator(registry, ctx); // a throw propagates — nothing is persisted
    if (aborted) return value;            // refusal → provably no write
    try {
      save(root, registry);
      return value;
    } catch (err) {
      if (err instanceof StaleRegistryError) {
        lastErr = err;
        continue; // reload + re-apply against the winner's state
      }
      throw err;
    }
  }
  warnLog(root, 'registry_cas_exhausted', { attempts });
  throw lastErr || new StaleRegistryError(
    `task-registry: withRegistry gave up after ${attempts} compare-and-swap attempts`
  );
}

// ── model mutators ─────────────────────────────────────────────────────────────

/**
 * Linear lookup by id.
 * @param {{tasks:Array<{id:string}>}} registry
 * @param {string} id
 * @returns {object|undefined}
 */
function findTask(registry, id) {
  return registry.tasks.find(t => t.id === id);
}

/**
 * Shared shape validation for a task-like input — used by BOTH `addTask` (its
 * `spec`) and `canRun` (its `candidate`) so the safety oracle can never silently
 * false-safe. A bare-string `touches` (e.g. `'a.js'` instead of `['a.js']`) would
 * make `isEditing()` false and coerce Rule 4's file set to `[]` → `canRun` would
 * wrongly return `{run:true}` against a running task on the same file (or a running
 * gitOp). Both entry points therefore reject a malformed shape LOUDLY.
 * @param {any} obj  the spec/candidate to validate.
 * @param {string} ctx  caller name, embedded in the error message.
 * @param {{strictGitOp?:boolean}} [opts]  when `strictGitOp` is true a non-boolean
 *        `gitOp` throws (canRun — a safety oracle demands a real boolean); `addTask`
 *        omits this and strict-coerces `gitOp` (`=== true`) instead.
 * @returns {void}
 * @throws {TypeError} obj is not an object
 * @throws {Error} non-array touches / non-array blockedBy / non-boolean gitOp
 */
function assertTaskShape(obj, ctx, opts = {}) {
  if (!obj || typeof obj !== 'object') {
    throw new TypeError(`task-registry: ${ctx} requires an object`);
  }
  if (obj.touches != null && !Array.isArray(obj.touches)) {
    throw new Error(`task-registry: ${ctx} touches must be an array`);
  }
  // Bound each touches entry so a crafted string can never drive globToRegex
  // (behind plan-coverage.touchesOverlap, Rule 4) into pathological work.
  if (Array.isArray(obj.touches)) {
    for (const f of obj.touches) {
      if (typeof f === 'string' && f.length > MAX_TOUCH_LENGTH) {
        throw new Error(`task-registry: ${ctx} touches entry exceeds ${MAX_TOUCH_LENGTH} chars`);
      }
    }
  }
  if (obj.blockedBy != null && !Array.isArray(obj.blockedBy)) {
    throw new Error(`task-registry: ${ctx} blockedBy must be an array`);
  }
  if (opts.strictGitOp && obj.gitOp != null && typeof obj.gitOp !== 'boolean') {
    throw new Error(`task-registry: ${ctx} gitOp must be a boolean`);
  }
}

/**
 * An `implement` task MUST declare at least one touched file: file disjointness
 * (Rule 4) is what serializes plan-mutating work now that kind-based plan-serial is
 * gone, so an empty-touches implement would bypass the serializer and be unsound.
 * Enforced at BOTH entry points (`addTask` on its spec, `canRun` on its candidate)
 * so the safety oracle can never false-safe. Non-implement kinds may declare no
 * touches (a read-only review/plan legitimately edits nothing).
 * @param {{kind?:string, touches?:string[]}} obj
 * @param {string} ctx  caller name, embedded in the error message
 * @returns {void}
 * @throws {Error} kind === 'implement' with missing/empty touches
 */
function assertImplementTouches(obj, ctx) {
  if (obj.kind === 'implement' && !(Array.isArray(obj.touches) && obj.touches.length > 0)) {
    throw new Error(`task-registry: ${ctx} implement task requires non-empty touches`);
  }
}

/**
 * A `sync` task MUST declare a non-empty `blockedBy` (R3-B item 12). A sync is the wave
 * INTEGRATION BOUNDARY: with no blockers it has nothing to integrate and, being unblocked,
 * would claim immediately against a live wave — freezing every other task behind Rule 2's
 * barrier for nothing. The refusal used to live only in `actions.enqueueWaveSync`, so
 * `menu task add sync` walked straight past it. It now lives at the CHOKE POINT (addTask),
 * where every caller must pass.
 * @param {{kind?:string, blockedBy?:string[]}} obj
 * @param {string} ctx  caller name, embedded in the error message
 * @returns {void}
 * @throws {Error} kind === 'sync' with a missing/empty blockedBy
 */
function assertSyncBlockedBy(obj, ctx) {
  if (obj.kind === 'sync' && !(Array.isArray(obj.blockedBy) && obj.blockedBy.length > 0)) {
    throw new Error(
      `task-registry: ${ctx} sync task requires a non-empty blockedBy — a wave barrier ` +
      `with nothing to integrate would run immediately against a live wave`
    );
  }
}

/**
 * Whether a status transition is legal (the SINGLE encoding of the lifecycle, exported so
 * no caller has to mirror VALID_TRANSITIONS — the stale mirror in menu-screens.js was
 * exactly the bug that made R2-A's `orphaned → done` late-completion contract dead code).
 * A same-status "transition" is NOT a transition (an idempotent no-op patch); callers that
 * care about it check `from === to` themselves.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function canTransition(from, to) {
  if (!Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, from)) return false;
  return VALID_TRANSITIONS[from].has(to);
}

/**
 * The single non-terminal task of a given kind for a plan, if any (R3-B item 2). A PURE
 * read: the plan-uniqueness POLICY ("do not enqueue a second implement task for a plan
 * that already has a live one") lives at the action/CLI layer; this is the lookup both
 * layers share so they cannot drift.
 *
 * Prefers an OCCUPYING task (running/cancelling) over a queued one, so a caller that
 * settles "the task for this plan" can never pick a queued duplicate that SHADOWS the
 * running task (the C2 defect: the running task was then never marked done → dead file
 * locks for two hours, after which the duplicate re-ran a plan already in review).
 *
 * @param {{tasks:Array<object>}} registry
 * @param {string} plan  the plan slug
 * @param {string} [kind='implement']
 * @returns {object|undefined}
 */
function findActivePlanTask(registry, plan, kind = 'implement') {
  const tasks = (registry && Array.isArray(registry.tasks)) ? registry.tasks : [];
  const live = tasks.filter((t) => t.kind === kind && t.plan === plan && !TERMINAL.has(t.status));
  return live.find((t) => t.status === 'running')
    || live.find((t) => t.status === 'cancelling')
    || live[0];
}

/**
 * Append a new queued task. Assigns a monotonic id from `seq` (no reuse). Builds
 * the task from NAMED fields (never spreads `spec` → no prototype pollution).
 * @param {{seq:number, tasks:Array<object>}} registry
 * @param {{kind:string, label?:string, plan?:string|null, touches?:string[], gitOp?:boolean, blockedBy?:string[]}} spec
 * @returns {object} the created task
 * @throws {TypeError} spec is not an object
 * @throws {Error} invalid kind / non-array touches / non-array blockedBy /
 *   an implement spec with empty touches / a touches entry over the length cap
 */
function addTask(registry, spec) {
  assertTaskShape(spec, 'addTask');
  if (typeof spec.kind !== 'string' || !KINDS.has(spec.kind)) {
    throw new Error(`task-registry: addTask invalid kind ${JSON.stringify(spec.kind)}`);
  }
  assertImplementTouches(spec, 'addTask');
  assertSyncBlockedBy(spec, 'addTask');
  const task = {
    id: 't' + (++registry.seq),
    kind: spec.kind,
    label: String(spec.label ?? ''),
    plan: spec.plan ?? null,
    status: 'queued',
    agentTaskId: null,
    touches: Array.isArray(spec.touches) ? spec.touches.slice() : [],
    gitOp: spec.gitOp === true,
    blockedBy: Array.isArray(spec.blockedBy) ? spec.blockedBy.slice() : [],
    result: null,
    ts: { created: nowIso(), started: null, cancelRequested: null, done: null }
  };
  registry.tasks.push(task);
  return task;
}

/**
 * Apply a patch to an existing task, in place. Enforces valid status transitions,
 * auto-stamps timestamps, and merges only whitelisted fields (id immutable).
 * @param {{tasks:Array<object>}} registry
 * @param {string} id
 * @param {object} patch
 * @returns {object} the updated task
 * @throws {Error} unknown id / id-change attempt / invalid or illegal-transition status
 */
function updateTask(registry, id, patch) {
  const task = findTask(registry, id);
  if (!task) throw new Error('task-registry: updateTask unknown id ' + id);
  if (patch && typeof patch === 'object' && 'id' in patch && patch.id !== id) {
    throw new Error('task-registry: updateTask id is immutable');
  }
  const p = patch && typeof patch === 'object' ? patch : {};

  let statusChanged = false;
  let target = null;
  if ('status' in p) {
    target = p.status;
    if (typeof target !== 'string' || !STATUSES.has(target)) {
      throw new Error('task-registry: updateTask invalid status ' + JSON.stringify(target));
    }
    if (target !== task.status) {
      // Guard the object lookup with hasOwnProperty (belt-and-suspenders vs a
      // prototype-chain key sneaking in as a "valid" transition source).
      const allowed = Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, task.status)
        ? VALID_TRANSITIONS[task.status]
        : null;
      if (!allowed || !allowed.has(target)) {
        throw new Error(`task-registry: invalid transition ${task.status} → ${target}`);
      }
      statusChanged = true;
    }
  }

  // Apply whitelisted fields (arrays copied to avoid caller aliasing).
  for (const f of MUTABLE_FIELDS) {
    if (f in p) {
      task[f] = (f === 'touches' || f === 'blockedBy') && Array.isArray(p[f]) ? p[f].slice() : p[f];
    }
  }
  // Merge nested ts if supplied.
  if (p.ts && typeof p.ts === 'object') {
    task.ts = { ...task.ts, ...p.ts };
  }
  // Auto-stamp unless the patch supplied that ts explicitly.
  if (statusChanged) {
    const suppliedTs = p.ts && typeof p.ts === 'object' ? p.ts : {};
    if (target === 'running' && suppliedTs.started == null) task.ts.started = nowIso();
    if (TERMINAL.has(target) && suppliedTs.done == null) task.ts.done = nowIso();
  }
  return task;
}

// ── scheduler (pure) ────────────────────────────────────────────────────────────

/**
 * Statuses that OCCUPY a concurrency slot. `cancelling` counts as running (C1-2): a
 * task ordered to cancel still holds its slot, touches, gitOp and the sync barrier
 * until the harness agent is confirmed gone, so it must not be scheduled around.
 */
const OCCUPYING = Object.freeze(new Set(['running', 'cancelling']));

/** @param {{status?:string}} task — occupies a concurrency slot (running or cancelling). */
function isOccupying(task) {
  return OCCUPYING.has(task.status);
}

/** @param {{touches?:string[]}} task — a task "edits" iff it declares ≥1 touched file. */
function isEditing(task) {
  return Array.isArray(task.touches) && task.touches.length > 0;
}

/**
 * Tasks currently occupying a slot (running OR cancelling — C1-2), excluding the
 * candidate by id (self-exclusion → canRun is idempotent whether or not the candidate
 * already lives in the registry).
 * @param {{tasks:Array<object>}} registry
 * @param {string} excludeId
 * @returns {Array<object>}
 */
function runningTasks(registry, excludeId) {
  return registry.tasks.filter(t => isOccupying(t) && t.id !== excludeId);
}

/**
 * Rule 0 (dependency gate), KIND-AWARE (C1-1). A dep satisfies when:
 *   • the candidate is a `sync` (wave integration boundary) and the dep is SETTLED —
 *     i.e. its status is TERMINAL (done/failed/orphaned/cancelled). A barrier waits
 *     for the wave to SETTLE, not to succeed; reporting the failures is the sync run's
 *     own job, so a failed/cancelled dep must not deadlock the barrier forever.
 *     ONE exception, the CONFIRM-LIVENESS rule (human ruling 2026-07-26): an `orphaned`
 *     dep settles a barrier ONLY when its agent is CONFIRMED gone — never on AGE alone.
 *     A wave-integration `sync` takes an IRREVERSIBLE commit of the whole tree, and that
 *     commit must not rest on an age heuristic while an agent may still be writing files.
 *     So an orphan carrying `result.orphanReason === 'staleness'` (age-only) OR
 *     `'presumed-dead'` (merely aged past a bound — still age) does NOT settle; only a
 *     confirmed-absent orphan (no reason marker — orphaned because the live-agent list
 *     showed it gone) or `'confirmed-dead'` does. The barrier WAITS for genuine liveness
 *     confirmation rather than committing over a possibly-live tree (the deliberate
 *     correctness-over-liveness choice: unlike the file quarantine, this is NOT released
 *     by the presumed-dead age bound).
 *   • the candidate is any OTHER kind and the dep is `done` (done-only, unchanged).
 * A MISSING dep id NEVER satisfies either kind (safety-first). An in-flight dep
 * (queued/running/cancelling) never satisfies — it has not settled.
 * @param {{kind?:string, blockedBy?:string[]}} candidate
 * @param {{tasks:Array<object>}} registry
 * @returns {boolean}
 */
function depsSatisfied(candidate, registry) {
  const deps = Array.isArray(candidate.blockedBy) ? candidate.blockedBy : [];
  const isSync = candidate.kind === 'sync';
  return deps.every(depId => {
    const dep = registry.tasks.find(t => t.id === depId);
    if (!dep) return false; // missing never satisfies
    if (!isSync) return dep.status === 'done';
    if (!TERMINAL.has(dep.status)) return false; // not settled
    if (dep.status === 'orphaned') {
      // Confirm-liveness rule: an age-based orphaning does not settle an irreversible commit.
      const reason = dep.result && dep.result.orphanReason;
      if (reason === 'staleness' || reason === 'presumed-dead') return false;
    }
    return true;
  });
}

/**
 * The files reserved by tasks orphaned on AGE ALONE (`result.orphanReason === 'staleness'`).
 * Such an orphan was never confirmed dead — its agent may still be editing these files, so
 * a queued candidate touching them must not START (the concurrent-edit BELT below). Uses
 * ONLY the `staleness` marker (never `presumed-dead`), so it agrees exactly with the file
 * quarantine in `task-reconcile.applyQuarantine`: once the reservation is released, both
 * let the candidate run.
 * @param {{tasks:Array<object>}} registry
 * @returns {string[]}
 */
function staleOrphanReservedFiles(registry) {
  const files = [];
  const tasks = registry && Array.isArray(registry.tasks) ? registry.tasks : [];
  for (const t of tasks) {
    if (t && t.status === 'orphaned' && t.result && t.result.orphanReason === 'staleness' &&
        Array.isArray(t.touches)) {
      for (const f of t.touches) files.push(f);
    }
  }
  return files;
}

/**
 * Whether a candidate would edit a file still reserved by an age-only orphan (glob-aware,
 * via the same `touchesOverlap` Rule 4 uses). An empty candidate touch set can never
 * conflict (Rule 4 fast path), so it is never held.
 * @param {object} candidate
 * @param {{tasks:Array<object>}} registry
 * @returns {boolean}
 */
function overlapsStaleOrphanReservation(candidate, registry) {
  const cand = Array.isArray(candidate.touches) ? candidate.touches : [];
  if (cand.length === 0) return false;
  const reserved = staleOrphanReservedFiles(registry);
  if (reserved.length === 0) return false;
  return touchesOverlap(cand, reserved);
}

/**
 * The concurrency ladder (Rules 1–4), evaluated against an EXPLICIT running set
 * (real running for canRun; projected running for nextRunnable). The single home
 * of the rules — reused by both canRun and nextRunnable (DRY). The first failing
 * rule's reason is returned; ORDER IS LOAD-BEARING (see the module header):
 *   1 max-concurrent → 2 sync-barrier → 3 git-exclusive → 4 file-conflict → ok.
 * (Kind-based plan-serial is DELETED — vision F1; Rule 4 serializes by files.)
 * @param {object} candidate
 * @param {Array<object>} running  running tasks, candidate already excluded
 * @returns {{run:boolean, reason:string}}
 */
function evaluateConcurrency(candidate, running) {
  // Rule 1 — max concurrency.
  if (running.length >= MAX_CONCURRENT) return { run: false, reason: 'max-concurrent' };
  // Rule 2 — sync-barrier (the wave integration boundary): a `sync` candidate may
  // not start while ANY task runs, and NO candidate (even read-only) may start while
  // a `sync` runs. Evaluated immediately after max-concurrent; stricter than, and
  // independent of, git-exclusive.
  if (running.length > 0 && (candidate.kind === 'sync' || running.some(t => t.kind === 'sync'))) {
    return { run: false, reason: 'sync-barrier' };
  }
  // Rule 3 — git-exclusive (strengthened, git-vs-git): a gitOp candidate is blocked
  // by any running editing-OR-git task; an editing candidate is blocked by any
  // running gitOp. Read-only non-git tasks may run alongside a git task.
  if ((candidate.gitOp && running.some(t => isEditing(t) || t.gitOp)) ||
      (isEditing(candidate) && running.some(t => t.gitOp))) {
    return { run: false, reason: 'git-exclusive' };
  }
  // Rule 4 — file conflict (glob-aware): candidate.touches overlaps the union of
  // running touches, tested via plan-coverage.touchesOverlap (globs on either side
  // count). Fast path: an empty candidate touches set can never conflict.
  const candTouches = Array.isArray(candidate.touches) ? candidate.touches : [];
  if (candTouches.length > 0) {
    const occupied = [];
    for (const t of running) {
      if (Array.isArray(t.touches)) for (const f of t.touches) occupied.push(f);
    }
    if (touchesOverlap(candTouches, occupied)) return { run: false, reason: 'file-conflict' };
  }
  // Otherwise runnable.
  return { run: true, reason: 'ok' };
}

/**
 * Whether a candidate may run now, given the current registry. Rule 0 (dependency
 * gate) precedes the D5 concurrency ladder (Rules 1–5). Pure: no I/O, no mutation.
 * @param {object} candidate
 * @param {{tasks:Array<object>}} registry
 * @returns {{run:boolean, reason:string}}
 * @throws {TypeError} candidate is not an object
 * @throws {Error} candidate has a non-array touches/blockedBy, a non-boolean gitOp,
 *   or is an implement candidate with empty touches (fail-loud, consistent with
 *   addTask — a safety oracle must never false-safe on a malformed candidate).
 *   registry.tasks are already normalized (addTask/load), so
 *   nextRunnable — which reads them directly, never through canRun — inherits the
 *   guarantee without re-validating.
 */
function canRun(candidate, registry) {
  assertTaskShape(candidate, 'canRun', { strictGitOp: true });
  assertImplementTouches(candidate, 'canRun');
  if (!depsSatisfied(candidate, registry)) return { run: false, reason: 'blocked-dep' };
  const decision = evaluateConcurrency(candidate, runningTasks(registry, candidate.id));
  if (!decision.run) return decision;
  // Concurrent-edit BELT (human ruling 2026-07-26 — belt-and-suspenders). A candidate that
  // would edit files still reserved by an age-only orphan (never confirmed dead; its agent
  // may still be editing) must not START. Enforced HERE — the single oracle every
  // status→running transition consults — so it cannot be bypassed by a caller that computes
  // its own promote set. The projection (`task-reconcile.applyQuarantine`) remains the
  // reporter/suspenders on the render + command paths; sibling 00013-r3b (which declares
  // menu-screens.js) owns the longer-term consolidation across every promote path.
  if (overlapsStaleOrphanReservation(candidate, registry)) {
    return { run: false, reason: 'staleness-orphan-quarantine' };
  }
  return decision;
}

/**
 * The queued tasks that may start NOW, as a JOINTLY-startable set. FIFO over queued
 * (array/seq order → clock-independent), greedy with a cumulative projected-running
 * set: deps are checked against REAL statuses (a tentatively-accepted task is
 * running, not done, so it cannot satisfy another's blockedBy this pass), while the
 * concurrency ladder is checked against the projected set (real running + already
 * accepted). Each accepted candidate is folded into `projected` before the next is
 * evaluated, so starting the whole returned set never violates ≤5 / sync-barrier /
 * git-exclusive / file-conflict. Pure: builds its own projected array; returns
 * references to the selected queued task objects.
 * @param {{tasks:Array<object>}} registry
 * @returns {Array<object>}
 */
function nextRunnable(registry) {
  const projected = registry.tasks.filter(isOccupying).slice();
  const result = [];
  for (const cand of registry.tasks.filter(t => t.status === 'queued')) {
    if (!depsSatisfied(cand, registry)) continue; // deps vs REAL statuses (done-only)
    const running = projected.filter(t => t.id !== cand.id);
    if (evaluateConcurrency(cand, running).run) {
      result.push(cand);
      projected.push({ ...cand, status: 'running' }); // occupies a slot + contributes touches/gitOp/kind
    }
  }
  return result;
}

// ── unsatisfiable detection (C1-1 / C1-7 — surface the permanently-wedged) ──────────

/**
 * The set of task ids that lie ON a directed cycle in the blockedBy graph, computed
 * with ITERATIVE Tarjan strongly-connected-components (no recursion; O(V+E)). Edges
 * run task → dep for every dep id that EXISTS in the registry (a missing dep is not an
 * edge — it is the dep-missing case, handled separately). A node is on a cycle iff it
 * belongs to an SCC of size > 1, or is a singleton with a self-loop.
 * @param {Array<object>} tasks
 * @param {Map<string, object>} byId
 * @returns {Set<string>}  ids that are on at least one cycle.
 */
function cycleNodeIds(tasks, byId) {
  const adj = new Map();
  for (const t of tasks) {
    if (!t || typeof t.id !== 'string') continue;
    const deps = Array.isArray(t.blockedBy) ? t.blockedBy : [];
    adj.set(t.id, deps.filter(d => byId.has(d)));
  }

  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const sccStack = [];
  const result = new Set();
  let counter = 0;

  for (const startId of adj.keys()) {
    if (index.has(startId)) continue;
    // Explicit work stack of frames { id, i } replaces the recursion.
    const work = [{ id: startId, i: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const v = frame.id;
      if (frame.i === 0) {
        index.set(v, counter);
        low.set(v, counter);
        counter++;
        sccStack.push(v);
        onStack.add(v);
      }
      const neighbors = adj.get(v) || [];
      if (frame.i < neighbors.length) {
        const w = neighbors[frame.i];
        frame.i++;
        if (!index.has(w)) {
          work.push({ id: w, i: 0 }); // tree edge → descend
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), index.get(w))); // back edge
        }
      } else {
        // Finished v: if it roots an SCC, pop the component.
        if (low.get(v) === index.get(v)) {
          const comp = [];
          let w;
          do {
            w = sccStack.pop();
            onStack.delete(w);
            comp.push(w);
          } while (w !== v);
          if (comp.length > 1) {
            for (const c of comp) result.add(c);
          } else {
            const only = comp[0];
            if ((adj.get(only) || []).includes(only)) result.add(only); // self-loop
          }
        }
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1].id;
          low.set(parent, Math.min(low.get(parent), low.get(v))); // propagate to parent
        }
      }
    }
  }
  return result;
}

/**
 * QUEUED tasks that can NEVER run, with the reason each is wedged (C1-1 / C1-7).
 * Silent-forever is the defect this surfaces: `task-reconcile.reconcile` consumes the
 * result, marks each such task `failed`, and pushes a loud report entry to the inbox.
 * A task is unsatisfiable when, per KIND-AWARE dependency semantics:
 *   • `dep-missing`  — a blockedBy id names no task in the registry (never satisfies,
 *     any kind). Highest precedence.
 *   • `dep-failed`   — a NON-sync task has a dep that is terminal-non-done
 *     (failed/orphaned/cancelled): it can never become `done`. A `sync` task is
 *     EXCLUDED here — a settled (terminal) dep satisfies its barrier (C1-1), so a
 *     merely-failed dep is not unsatisfiable for a sync.
 *   • `dep-cycle`    — the task lies on a blockedBy cycle (self or multi-node); no
 *     member can ever be `done` first, so all are permanently wedged.
 * Only QUEUED tasks are considered (a running/terminal task is not "wedged"). Pure:
 * no I/O, no mutation — returns references to the wedged task objects.
 * @param {{tasks:Array<object>}} registry
 * @returns {Array<{task:object, reason:'dep-missing'|'dep-failed'|'dep-cycle', deps:string[]}>}
 */
function unsatisfiableTasks(registry) {
  const tasks = registry && Array.isArray(registry.tasks) ? registry.tasks : [];
  const byId = new Map();
  for (const t of tasks) {
    if (t && typeof t.id === 'string') byId.set(t.id, t);
  }
  const onCycle = cycleNodeIds(tasks, byId);

  /** @type {Array<{task: object, reason: 'dep-missing'|'dep-failed'|'dep-cycle', deps: string[]}>} */
  const out = [];
  for (const task of tasks) {
    if (!task || task.status !== 'queued') continue;
    const deps = Array.isArray(task.blockedBy) ? task.blockedBy : [];
    const isSync = task.kind === 'sync';

    const missing = deps.filter(depId => !byId.has(depId));
    if (missing.length > 0) {
      out.push({ task, reason: 'dep-missing', deps: missing });
      continue;
    }
    if (!isSync) {
      const dead = deps.filter(depId => {
        const dep = byId.get(depId);
        return dep && TERMINAL.has(dep.status) && dep.status !== 'done';
      });
      if (dead.length > 0) {
        out.push({ task, reason: 'dep-failed', deps: dead });
        continue;
      }
    }
    if (onCycle.has(task.id)) {
      out.push({ task, reason: 'dep-cycle', deps: deps.filter(d => onCycle.has(d)) });
    }
  }
  return out;
}

// ── atomic add-and-claim ─────────────────────────────────────────────────────────

/**
 * Atomically add a task and, if it may run NOW, claim it (mark running) — in ONE
 * load→save cycle. Closes the record-vs-start blind window: there is no persisted
 * intermediate where the task exists but its claim decision does not. On a spec
 * that `addTask` rejects, this throws BEFORE any write, so nothing is persisted.
 *
 * (Single-writer holds — this is not a cross-process lock; it removes the in-process
 * window where a crash between "record" and "start" would strand an undecided task.)
 *
 * Routed through {@link withRegistry}, so a concurrent writer (the TUI autosync process)
 * committing between our load and our save causes a RELOAD and a re-decision against the
 * winner's state — never a lost update and never a claim decided on stale occupancy.
 *
 * @param {string} root  Project root.
 * @param {object} spec  Same shape as {@link addTask}'s spec (never spread — reused
 *   directly, so no prototype-pollution path).
 * @param {{agentTaskId?:string, uniquePlan?:boolean}} [opts]  R3-B item 5: record the
 *   harness agent id AT BIRTH when the caller knows it, so the on-open reconcile can match
 *   the task against the live agent list immediately — closing the window between the claim
 *   (which used to record `agentTaskId: null`) and the later `menu task start --agent-id`
 *   patch. R3-B rework: `uniquePlan` makes the one-non-terminal-task-per-plan invariant
 *   ATOMIC. When set, the pre-existing-task check runs INSIDE this mutator (on the same
 *   snapshot the claim commits, re-run against the winner on a CAS conflict), so two
 *   interleaved same-plan claims can never each add a duplicate — the invariant holds by
 *   construction, not by a reactive mop-up in `completeExecution`. The caller previously did
 *   this check on a SEPARATE standalone `load()`, which left a window between the check and
 *   the claim; that window is now closed.
 * @returns {{task:object, claimed:boolean, reason:string, existing?:boolean}} the created
 *   task (running when claimed, else queued), whether it was claimed, and the scheduler
 *   reason. With `uniquePlan` and a pre-existing non-terminal task, returns that task with
 *   `existing:true, claimed:false` and adds NOTHING (the registry is byte-unchanged).
 * @throws {TypeError} root is not a non-empty string
 * @throws {Error} spec is rejected by addTask (nothing is persisted)
 */
function addAndClaim(root, spec, opts = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('task-registry: addAndClaim requires a non-empty root string');
  }
  const agentTaskId = typeof opts.agentTaskId === 'string' && opts.agentTaskId.length > 0
    ? opts.agentTaskId
    : null;
  const uniquePlan = opts.uniquePlan === true;
  return withRegistry(root, (registry, ctx) => {
    // ATOMIC plan-uniqueness (R3-B rework). The lookup and the claim read ONE snapshot;
    // on a CAS conflict withRegistry reloads and re-runs this whole mutator, so the check
    // re-evaluates against the winner. A pre-existing non-terminal task means we abort with
    // no write — the existing task stands, and no duplicate is ever persisted.
    if (uniquePlan && spec && spec.plan != null) {
      const existing = findActivePlanTask(registry, spec.plan, spec.kind || 'implement');
      if (existing) {
        ctx.abort(); // registry byte-unchanged — no generation bump
        return { task: existing, claimed: false, reason: 'already-queued', existing: true };
      }
    }
    const task = addTask(registry, spec); // throws on a bad spec BEFORE any save
    const decision = canRun(task, registry);
    if (decision.run) {
      updateTask(registry, task.id, { status: 'running', agentTaskId });
    }
    return { task, claimed: decision.run, reason: decision.reason };
  });
}

// ── drain-stop flag (graceful "finish current, then stop") ─────────────────────────

/**
 * Request a graceful drain-stop: existing work finishes, nothing new starts. Persists
 * by creating the flag file `.ctoc/state/drain-stop`. Idempotent.
 * @param {string} root  Project root.
 * @returns {void}
 */
function requestDrainStop(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('task-registry: requestDrainStop requires a non-empty root string');
  }
  const p = drainStopPath(root);
  safeFs.mkdirSync(path.dirname(p), { recursive: true });
  safeFs.writeFileSync(p, '');
}

/**
 * Whether a drain-stop has been requested (the flag file exists). Never throws on a
 * missing directory — a fresh root is simply `false`.
 * @param {string} root  Project root.
 * @returns {boolean}
 */
function isDrainStopRequested(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('task-registry: isDrainStopRequested requires a non-empty root string');
  }
  return safeFs.existsSync(drainStopPath(root));
}

/**
 * Clear a drain-stop request (remove the flag file). A no-op when none exists.
 * @param {string} root  Project root.
 * @returns {void}
 */
function clearDrainStop(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('task-registry: clearDrainStop requires a non-empty root string');
  }
  try { safeFs.unlinkSync(drainStopPath(root)); } catch { /* absent → nothing to clear */ }
}

module.exports = {
  // persistence (+ the compare-and-swap choke point)
  load,
  save,
  withRegistry,
  emptyRegistry,
  registryPath,
  readWarnLog,
  warnLog,
  // model mutators
  addTask,
  updateTask,
  // scheduler (pure)
  canRun,
  canTransition,
  findActivePlanTask,
  nextRunnable,
  // R3-B rework: the ONE encoding of the files reserved by age-only orphans. canRun's
  // concurrent-edit belt (via overlapsStaleOrphanReservation) AND the projection reporter
  // task-reconcile.applyQuarantine both derive the held-file set from THIS function — one
  // predicate, so the scheduler and the "held" report can never disagree about what is held.
  staleOrphanReservedFiles,
  unsatisfiableTasks,
  // atomic add-and-claim
  addAndClaim,
  // drain-stop flag trio
  requestDrainStop,
  isDrainStopRequested,
  clearDrainStop,
  // constants
  MAX_CONCURRENT,
  REGISTRY_VERSION,
  KINDS,
  // R3-B item 4: the ONE encoding of terminal. menu-screens imports THIS instead of
  // mirroring it (the stale mirror included `orphaned` and omitted `cancelled`, which
  // made the orphaned→done late-completion contract dead code).
  TERMINAL
};

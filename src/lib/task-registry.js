/**
 * NB1 — Task Registry and Scheduler (pure model + single-file persistence).
 *
 * Owns the background-task model for CTOC's non-blocking menu plane, persists it to
 * one JSON file (`.ctoc/state/tasks.json`) with Claude as the sole writer, and
 * exposes the two scheduler decisions `canRun` and `nextRunnable`. This is the
 * algorithmic heart that turns CTOC's operator-memory concurrency rules (vision
 * §3b / §6 D5) into enforced, unit-tested code.
 *
 * Design (see plans/todo/NB1-task-registry-and-scheduler.md, decisions D1–D10):
 *   • LOCK-FREE (D1). Unlike src/lib/plan-index/store.js — which takes an exclusive
 *     lock with an owner token + heartbeat + reload-under-lock because it is
 *     multi-writer — NB1 has EXACTLY ONE writer (Claude's single-threaded main
 *     loop), so writes serialize naturally and NO lock/token/heartbeat exists. This
 *     asymmetry with store.js is intentional: we mirror its atomic-write and
 *     fail-open-load patterns but deliberately omit its concurrency machinery.
 *   • DATA-ORIENTED functional API over a plain registry VALUE (no store handle):
 *     load/save read/write the value; addTask/updateTask mutate it in memory;
 *     canRun/nextRunnable are pure reads. This makes the scheduler trivially
 *     testable with in-memory literals (no disk).
 *   • FAIL-OPEN LOAD vs FAIL-LOUD SAVE (the honest asymmetry). `load` NEVER throws
 *     on a file/data problem (a corrupt registry must never brick the NAV plane):
 *     absent → empty; unparseable / wrong-shape / version-mismatch → empty + a
 *     recorded warn; a single malformed task entry → skip that entry + warn, the
 *     rest load. `save` FAILS LOUD (rethrows after cleaning its temp) — a real
 *     write failure (disk full, read-only fs) must never be silently lost.
 *   • ATOMIC WRITE: temp sibling in the same directory (same volume → atomic
 *     rename) then renameSync over the target; on any failure the temp is unlinked
 *     and the error rethrown — byte-for-byte store.js's atomicSave.
 *   • id + seq: the registry carries a persisted, never-decremented `seq`; addTask
 *     assigns `id = 't' + (++seq)`, guaranteeing unique + strictly monotonic ids
 *     with NO reuse across pruning/reload. FIFO order is the tasks array insertion
 *     order (== seq order), NOT timestamps — so scheduling is immune to clock skew.
 *
 * ALL filesystem access routes through src/lib/safe-fs.js — the audited choke
 * point (LH1). There is no raw `fs` in this module, and no regex at all (numeric id
 * parsing uses Number/startsWith), so the promoted-to-error security lint rules
 * cannot fire.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');

// ── constants ───────────────────────────────────────────────────────────────

/** On-disk schema version. A mismatch fails open (empty + warn) — see load(). */
const REGISTRY_VERSION = 1;
/** D5: at most this many operations run concurrently. */
const MAX_CONCURRENT = 5;
/** Warn-log rotation cap (mirrors store.js). */
const MAX_LOG_ENTRIES = 500;

/** The valid task kinds (vision §3a enumeration). */
const KINDS = Object.freeze(new Set([
  'implement', 'plan', 'review', 'quality', 'security', 'decompose', 'discuss', 'sync'
]));
/** D5: only `implement` mutates a plan and therefore serializes FIFO. */
const PLAN_MUTATING_KINDS = Object.freeze(new Set(['implement']));
/** All valid task statuses. */
const STATUSES = Object.freeze(new Set(['queued', 'running', 'done', 'failed', 'orphaned']));
/** Terminal statuses — no transition leaves them. */
const TERMINAL = Object.freeze(new Set(['done', 'failed', 'orphaned']));
/** Allowed status transitions (out of a terminal state: none). */
const VALID_TRANSITIONS = Object.freeze({
  queued: new Set(['running', 'failed']),
  running: new Set(['done', 'failed', 'orphaned']),
  done: new Set(),
  failed: new Set(),
  orphaned: new Set()
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
 * A fresh, empty registry value.
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
      if (Number.isInteger(n) && n > max) max = n;
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
      done: typeof ts.done === 'string' ? ts.done : null
    }
  };
}

/**
 * Load the registry value from disk. FAIL-OPEN — never throws on a file/data
 * problem. Absent → empty (no warn: a first run is normal). Unparseable /
 * wrong-shape / version-mismatch → empty + `registry_load_failed` warn. A single
 * malformed task entry → skip + `task_skipped_malformed` warn, the rest load.
 * Duplicate ids → last wins + `task_id_collision` warn. `seq` is repaired so it can
 * never collide with an existing id.
 * @param {string} root  Project root (a non-empty string).
 * @returns {{version:number, seq:number, tasks:Array<object>}}
 */
function load(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('task-registry: load requires a non-empty root string');
  }
  const p = registryPath(root);
  if (!safeFs.existsSync(p)) return emptyRegistry();

  let data;
  try {
    data = JSON.parse(safeFs.readFileSync(p, 'utf8'));
  } catch (err) {
    warnLog(root, 'registry_load_failed', { message: err && err.message ? err.message : String(err) });
    return emptyRegistry();
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks) || data.version !== REGISTRY_VERSION) {
    warnLog(root, 'registry_load_failed', { message: 'registry file has an unexpected shape or version' });
    return emptyRegistry();
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
  const fileSeq = Number.isInteger(data.seq) && data.seq >= 0 ? data.seq : 0;
  const seq = Math.max(fileSeq, highestIdSuffix(tasks));
  return { version: REGISTRY_VERSION, seq, tasks };
}

/**
 * Persist the registry value atomically (temp sibling + rename). FAIL-LOUD — on
 * any write failure the temp is unlinked, a `registry_save_failed` warn is
 * recorded, and the error is RETHROWN so a real write failure is never silently
 * lost. Creates `.ctoc/state` first.
 * @param {string} root
 * @param {{version:number, seq:number, tasks:Array<object>}} registry
 * @returns {void}
 */
function save(root, registry) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('task-registry: save requires a non-empty root string');
  }
  if (!registry || typeof registry !== 'object') {
    throw new TypeError('task-registry: save requires a registry object');
  }
  const target = registryPath(root);
  const dir = path.dirname(target);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = JSON.stringify({
    version: REGISTRY_VERSION,
    seq: Number.isInteger(registry.seq) && registry.seq >= 0 ? registry.seq : 0,
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
 * Append a new queued task. Assigns a monotonic id from `seq` (no reuse). Builds
 * the task from NAMED fields (never spreads `spec` → no prototype pollution).
 * @param {{seq:number, tasks:Array<object>}} registry
 * @param {{kind:string, label?:string, plan?:string|null, touches?:string[], gitOp?:boolean, blockedBy?:string[]}} spec
 * @returns {object} the created task
 * @throws {TypeError} spec is not an object
 * @throws {Error} invalid kind / non-array touches / non-array blockedBy
 */
function addTask(registry, spec) {
  if (!spec || typeof spec !== 'object') {
    throw new TypeError('task-registry: addTask requires a spec object');
  }
  if (typeof spec.kind !== 'string' || !KINDS.has(spec.kind)) {
    throw new Error(`task-registry: addTask invalid kind ${JSON.stringify(spec.kind)}`);
  }
  if (spec.touches != null && !Array.isArray(spec.touches)) {
    throw new Error('task-registry: addTask touches must be an array');
  }
  if (spec.blockedBy != null && !Array.isArray(spec.blockedBy)) {
    throw new Error('task-registry: addTask blockedBy must be an array');
  }
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
    ts: { created: nowIso(), started: null, done: null }
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
      const allowed = VALID_TRANSITIONS[task.status];
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

/** @param {{kind:string}} task */
function isPlanMutating(task) {
  return PLAN_MUTATING_KINDS.has(task.kind);
}

/** @param {{touches?:string[]}} task — a task "edits" iff it declares ≥1 touched file. */
function isEditing(task) {
  return Array.isArray(task.touches) && task.touches.length > 0;
}

/**
 * Tasks currently running, excluding the candidate by id (self-exclusion → canRun
 * is idempotent whether or not the candidate already lives in the registry).
 * @param {{tasks:Array<object>}} registry
 * @param {string} excludeId
 * @returns {Array<object>}
 */
function runningTasks(registry, excludeId) {
  return registry.tasks.filter(t => t.status === 'running' && t.id !== excludeId);
}

/**
 * Rule 0 (dependency gate). Every id in candidate.blockedBy must resolve to a task
 * with status === 'done'. A dep that is failed/orphaned/queued/running/missing does
 * NOT satisfy (safety-first — repair of dead refs is NB4's job).
 * @param {{blockedBy?:string[]}} candidate
 * @param {{tasks:Array<object>}} registry
 * @returns {boolean}
 */
function depsSatisfied(candidate, registry) {
  const deps = Array.isArray(candidate.blockedBy) ? candidate.blockedBy : [];
  return deps.every(depId => {
    const dep = registry.tasks.find(t => t.id === depId);
    return !!dep && dep.status === 'done';
  });
}

/**
 * The D5 concurrency ladder (Rules 1–5), evaluated against an EXPLICIT running set
 * (real running for canRun; projected running for nextRunnable). The single home
 * of the rules — reused by both canRun and nextRunnable (DRY). The first failing
 * rule's reason is returned; order is load-bearing.
 * @param {object} candidate
 * @param {Array<object>} running  running tasks, candidate already excluded
 * @returns {{run:boolean, reason:string}}
 */
function evaluateConcurrency(candidate, running) {
  // Rule 1 — max concurrency.
  if (running.length >= MAX_CONCURRENT) return { run: false, reason: 'max-concurrent' };
  // Rule 2 — plan-serial (FIFO): a plan-mutating candidate waits for any running one.
  if (isPlanMutating(candidate) && running.some(isPlanMutating)) {
    return { run: false, reason: 'plan-serial' };
  }
  // Rule 3 — git-exclusive (strengthened, git-vs-git): a gitOp candidate is blocked
  // by any running editing-OR-git task; an editing candidate is blocked by any
  // running gitOp. Read-only non-git tasks may run alongside a git task.
  if ((candidate.gitOp && running.some(t => isEditing(t) || t.gitOp)) ||
      (isEditing(candidate) && running.some(t => t.gitOp))) {
    return { run: false, reason: 'git-exclusive' };
  }
  // Rule 4 — file conflict: candidate.touches ∩ union(running.touches) ≠ ∅.
  const candTouches = Array.isArray(candidate.touches) ? candidate.touches : [];
  if (candTouches.length > 0) {
    const occupied = new Set();
    for (const t of running) {
      if (Array.isArray(t.touches)) for (const f of t.touches) occupied.add(f);
    }
    if (candTouches.some(f => occupied.has(f))) return { run: false, reason: 'file-conflict' };
  }
  // Rule 5 — otherwise runnable.
  return { run: true, reason: 'ok' };
}

/**
 * Whether a candidate may run now, given the current registry. Rule 0 (dependency
 * gate) precedes the D5 concurrency ladder (Rules 1–5). Pure: no I/O, no mutation.
 * @param {object} candidate
 * @param {{tasks:Array<object>}} registry
 * @returns {{run:boolean, reason:string}}
 */
function canRun(candidate, registry) {
  if (!depsSatisfied(candidate, registry)) return { run: false, reason: 'blocked-dep' };
  return evaluateConcurrency(candidate, runningTasks(registry, candidate.id));
}

/**
 * The queued tasks that may start NOW, as a JOINTLY-startable set. FIFO over queued
 * (array/seq order → clock-independent), greedy with a cumulative projected-running
 * set: deps are checked against REAL statuses (a tentatively-accepted task is
 * running, not done, so it cannot satisfy another's blockedBy this pass), while the
 * concurrency ladder is checked against the projected set (real running + already
 * accepted). Each accepted candidate is folded into `projected` before the next is
 * evaluated, so starting the whole returned set never violates ≤5 / plan-serial /
 * git-exclusive / file-conflict. Pure: builds its own projected array; returns
 * references to the selected queued task objects.
 * @param {{tasks:Array<object>}} registry
 * @returns {Array<object>}
 */
function nextRunnable(registry) {
  const projected = registry.tasks.filter(t => t.status === 'running').slice();
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

module.exports = {
  // persistence
  load,
  save,
  emptyRegistry,
  registryPath,
  readWarnLog,
  // model mutators
  addTask,
  updateTask,
  // scheduler (pure)
  canRun,
  nextRunnable,
  // constants
  MAX_CONCURRENT,
  REGISTRY_VERSION,
  KINDS,
  PLAN_MUTATING_KINDS
};

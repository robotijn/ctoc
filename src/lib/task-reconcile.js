/**
 * NB4 — Reconciliation and Resilience (pure reconcile core + thin I/O wrapper).
 *
 * Makes the NB1 background-task plane survive the messy edges: a session restart
 * that leaves a task marked `running` with no live harness agent (an orphan), a
 * background agent that failed (must never be silently lost), a corrupt registry
 * (must never brick the NAV plane), and stale terminal tasks / orphaned atomic-write
 * temp artifacts (must be swept so the state dir does not accumulate rot).
 *
 * Design (see plans/todo/NB4-reconciliation-and-resilience.md, decisions D-NB4-1…5):
 *   • PURE CORE + THIN WRAPPER (D-NB4-2). `reconcile(tasks, opts)` is PURE — no I/O,
 *     no clock read except the `now` default, and it never mutates its input (it
 *     clones every task it touches). A library cannot call the harness Task tool, so
 *     the CALLER supplies `liveAgentIds` and persists. `reconcileState(root, opts)` is
 *     the ONLY function that touches disk: load → reconcile → save → compute promote.
 *   • MIRRORS `cleanupStaleInProgress` (actions.js): "detect leftover live-state the
 *     executor abandoned, record it, transition it to a recoverable state" — but for
 *     background TASKS, and with the persistence lifted into the wrapper.
 *   • ORPHAN ⇒ OFF-CONCURRENCY FOR FREE (D-NB4-3). task-registry's `runningTasks` /
 *     `evaluateConcurrency` / `nextRunnable` count `status === 'running'` EXCLUSIVELY,
 *     so transitioning a task `running → orphaned` (a legal NB1 transition) removes it
 *     from the ≤5 count with ZERO change to task-registry.js. Re-run is offered by
 *     handing the freed slot back through the scheduler (`nextRunnable`), never a
 *     direct launch.
 *   • FAIL-OPEN, TOTAL (D1). `reconcile` never throws on malformed input — a corrupt
 *     registry yields a safe empty view + `report.corrupt`, mirroring
 *     task-registry.load. `reconcileState` wraps the fail-LOUD save so a write failure
 *     is recorded (`report.saveFailed`) and swallowed — the menu must render even when
 *     state cannot be written.
 *   • STALENESS BACKSTOP (D2). `liveAgentIds` is the harness truth; when it is
 *     null/absent (TaskList unavailable) a `running` task is orphaned only once it is
 *     older than the staleness threshold. A young `running` task inside the grace
 *     window is NEVER orphaned (covers the just-dispatched-but-not-yet-in-TaskList
 *     race). All thresholds are injectable via `opts` (D-NB4-1) so tests are
 *     deterministic and operators can tune them.
 *
 * ALL filesystem access routes through src/lib/safe-fs.js (the audited choke point,
 * LH1). There is no raw `fs` here and no regex at all — the temp-artifact match uses
 * literal `startsWith`, so the promoted-to-error security lint rules cannot fire.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');
const taskRegistry = require('./task-registry');

// ── constants (D-NB4-1: reasonable defaults, ALL injectable via opts) ────────────

/** 60 s: a `running` task started within this window is NEVER orphaned. */
const DEFAULT_GRACE_MS = 60_000;
/** 30 min: a `running` task older than this is orphaned when no live id confirms it. */
const DEFAULT_STALE_MS = 30 * 60_000;
/** 7 days: terminal (done/failed/orphaned) tasks older than this leave the active view. */
const DEFAULT_RETENTION_MS = 7 * 24 * 3600_000;
/** 1 h: orphaned atomic-write temp artifacts older than this are swept. */
const DEFAULT_TEMP_TTL_MS = 60 * 60_000;

/** Terminal statuses (mirror of NB1's frozen set — not exported by NB1). */
const TERMINAL = new Set(['done', 'failed', 'orphaned']);

/** The atomic-write temp prefix task-registry.save uses: `${target}.tmp-…`. */
const TEMP_PREFIX = 'tasks.json.tmp-';

/**
 * @typedef {object} ReconcileReport
 * @property {string[]} orphaned  ids transitioned running→orphaned this pass.
 * @property {Array<{id:string, summary:*}>} failed  surfaced failed tasks (never dropped).
 * @property {string[]} swept  terminal-task ids pruned from the active view this pass.
 * @property {null|{reason?:string, skipped?:number}} corrupt  fail-open marker, else null.
 * @property {string} [saveFailed]  set by reconcileState when the fail-loud save threw.
 * @property {string[]} [tempSwept]  set by reconcileState — swept temp-artifact paths.
 */

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize the `tasks` input into a bare array. Returns null when the input is not a
 * registry value at all (fail-open marker for the caller). A `{ tasks: [] }` registry
 * value or a bare array is accepted; anything else → null.
 * @param {any} input
 * @returns {Array<any>|null}
 */
function toTaskArray(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && Array.isArray(input.tasks)) return input.tasks;
  return null;
}

/** A task is well-formed enough to reconcile iff it is an object with string id+status. */
function isWellFormed(t) {
  return !!t && typeof t === 'object' &&
    typeof t.id === 'string' && t.id.length > 0 &&
    typeof t.status === 'string';
}

/** Epoch ms for an ISO string; NaN-safe (unparseable → NaN, treated as "very old"). */
function parseTs(iso) {
  return typeof iso === 'string' ? Date.parse(iso) : NaN;
}

/** Shallow-clone a task object, deep-copying its `ts` so the input is never mutated. */
function cloneTask(t) {
  const copy = { ...t };
  copy.ts = (t.ts && typeof t.ts === 'object') ? { ...t.ts } : {};
  return copy;
}

// ── pure reconcile ──────────────────────────────────────────────────────────────

/**
 * Reconcile a registry value against the live harness TaskList + staleness/retention
 * heuristics. PURE: no I/O, no input mutation, never throws.
 *
 * @param {{version?:number, seq?:number, tasks:Array<object>}|Array<object>|any} tasks
 *   the registry VALUE or a bare task array. Malformed input → empty view + corrupt.
 * @param {object} [opts]
 * @param {Set<string>|Array<string>|null|undefined} [opts.liveAgentIds]  live harness
 *   agent ids; each compared to a task's `agentTaskId`. null/absent ⇒ staleness-only.
 * @param {number} [opts.now]  epoch ms (default Date.now()), injectable for tests.
 * @param {number} [opts.graceMs]  young-task grace window. Default DEFAULT_GRACE_MS.
 * @param {number} [opts.staleThresholdMs]  staleness cutoff. Default DEFAULT_STALE_MS.
 * @param {number} [opts.retentionMs]  terminal retention. Default DEFAULT_RETENTION_MS.
 * @returns {{tasks:{version:number, seq:number, tasks:Array<object>}, report:ReconcileReport}}
 */
function reconcile(tasks, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const graceMs = Number.isFinite(opts.graceMs) ? opts.graceMs : DEFAULT_GRACE_MS;
  const staleMs = Number.isFinite(opts.staleThresholdMs) ? opts.staleThresholdMs : DEFAULT_STALE_MS;
  const retentionMs = Number.isFinite(opts.retentionMs) ? opts.retentionMs : DEFAULT_RETENTION_MS;

  /** @type {ReconcileReport} */
  const report = { orphaned: [], failed: [], swept: [], corrupt: null };

  const version = (tasks && typeof tasks === 'object' && Number.isSafeInteger(tasks.version))
    ? tasks.version : taskRegistry.REGISTRY_VERSION;
  const seq = (tasks && typeof tasks === 'object' && Number.isSafeInteger(tasks.seq) && tasks.seq >= 0)
    ? tasks.seq : 0;

  const arr = toTaskArray(tasks);
  if (arr === null) {
    // Not a registry value at all → fail open to empty, surface the corruption.
    report.corrupt = { reason: 'not-a-registry-value' };
    return { tasks: { version, seq, tasks: [] }, report };
  }

  // Normalize live ids to a Set of strings once (null ⇒ TaskList unavailable).
  const live = (opts.liveAgentIds == null)
    ? null
    : new Set(Array.from(opts.liveAgentIds, x => String(x)));

  const kept = [];
  let skipped = 0;

  for (const raw of arr) {
    if (!isWellFormed(raw)) { skipped++; continue; } // per-entry fail-open (never throw)
    const t = cloneTask(raw);

    if (t.status === 'running') {
      const hasLive = live !== null && t.agentTaskId != null && live.has(String(t.agentTaskId));
      const startedMs = parseTs(t.ts && t.ts.started);
      const ageMs = now - startedMs;
      const young = Number.isFinite(startedMs) && ageMs < graceMs;

      let orphan = false;
      if (hasLive) {
        orphan = false;                       // live agent confirmed → leave running
      } else if (young) {
        orphan = false;                       // just-dispatched race → grace window
      } else if (live !== null) {
        orphan = true;                        // TaskList present, no match, not young
      } else {
        // TaskList unavailable → staleness backstop (NaN age ⇒ very old ⇒ orphan).
        orphan = !Number.isFinite(startedMs) || ageMs >= staleMs;
      }

      if (orphan) {
        t.status = 'orphaned';
        t.ts.done = new Date(now).toISOString();
        report.orphaned.push(t.id);
      }
    } else if (t.status === 'failed') {
      // Surface every failure so the caller can push it to the inbox — never dropped.
      report.failed.push({ id: t.id, summary: (t.result && t.result.summary) || null });
    }

    kept.push(t);
  }

  if (skipped > 0) report.corrupt = { reason: 'malformed-entries-skipped', skipped };

  // Terminal-retention sweep: drop terminal tasks older than retentionMs from the
  // ACTIVE view. queued/running are NEVER swept (guarded by the TERMINAL check).
  // A freshly-orphaned task carries ts.done ≈ now → age ≈ 0 → survives this pass.
  const active = [];
  for (const t of kept) {
    if (TERMINAL.has(t.status)) {
      const doneMs = parseTs(t.ts && (t.ts.done || t.ts.created));
      const stale = !Number.isFinite(doneMs) || (now - doneMs) >= retentionMs;
      if (stale) { report.swept.push(t.id); continue; }
    }
    active.push(t);
  }

  return { tasks: { version, seq, tasks: active }, report };
}

// ── temp-artifact sweep (best-effort, cross-platform) ────────────────────────────

/**
 * Remove aged atomic-write temp artifacts (`.ctoc/state/tasks.json.tmp-*`) older than
 * `ttlMs`. The canonical `tasks.json` lacks the `.tmp-` suffix and is NEVER matched.
 * Best-effort: directory-absent and per-file errors are swallowed (a broken sweep must
 * never break rendering). No regex — a literal `startsWith` match on the temp prefix.
 * @param {string} root  project root.
 * @param {number} [now]  epoch ms (default Date.now()).
 * @param {number} [ttlMs]  age cutoff. Default DEFAULT_TEMP_TTL_MS.
 * @returns {string[]}  absolute paths removed.
 */
function sweepTempArtifacts(root, now = Date.now(), ttlMs = DEFAULT_TEMP_TTL_MS) {
  const removed = [];
  const dir = path.join(root, '.ctoc', 'state');
  let entries;
  try {
    entries = safeFs.readdirSync(dir);
  } catch {
    return removed; // state dir absent (first run) → nothing to sweep
  }
  for (const name of entries) {
    if (typeof name !== 'string' || !name.startsWith(TEMP_PREFIX)) continue;
    const p = path.join(dir, name);
    try {
      const st = safeFs.lstatSync(p);
      const mtimeMs = st && Number.isFinite(st.mtimeMs) ? st.mtimeMs : 0;
      if ((now - mtimeMs) >= ttlMs) {
        safeFs.unlinkSync(p);
        removed.push(p);
      }
    } catch {
      /* per-file best-effort — a locked/vanished temp must not break the sweep */
    }
  }
  return removed;
}

// ── stateful wrapper (the ONLY function that touches disk) ────────────────────────

/**
 * Load → reconcile → persist → promote. The on-menu-open entry point. FAIL-OPEN
 * throughout: a load failure, a save failure, and a sweep failure each degrade to a
 * recorded note rather than a throw so the NAV plane never bricks.
 * @param {string} root  project root.
 * @param {object} [opts]  same shape as reconcile's opts (liveAgentIds, now, thresholds).
 * @returns {{report:object, promote:Array<object>}}  `promote` = the scheduler's
 *   `nextRunnable` set (queued tasks freed by orphan-vacated slots).
 */
function reconcileState(root, opts = {}) {
  let loaded;
  try {
    loaded = taskRegistry.load(root);
  } catch (err) {
    // load is fail-open by contract, but a bad `root` throws — never brick the menu.
    /** @type {ReconcileReport} */
    const failReport = { orphaned: [], failed: [], swept: [], corrupt: { reason: 'load-failed' } };
    return { report: failReport, promote: [] };
  }

  const { tasks: reconciled, report } = reconcile(loaded, opts);

  const changed = report.orphaned.length > 0 || report.swept.length > 0;
  if (changed) {
    try {
      taskRegistry.save(root, reconciled);
    } catch (err) {
      // save is fail-LOUD in task-registry; catch here so the menu still renders.
      report.saveFailed = msgOf(err);
    }
  }

  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  try {
    report.tempSwept = sweepTempArtifacts(root, now);
  } catch {
    report.tempSwept = []; // sweepTempArtifacts is already best-effort; belt-and-suspenders
  }

  // Compute the newly-runnable set from the reconciled value (freed slots).
  let promote = [];
  try {
    promote = taskRegistry.nextRunnable(reconciled);
  } catch {
    promote = [];
  }

  return { report, promote };
}

/** Extract a message string from an unknown error (never throws). */
function msgOf(err) {
  return err && err.message ? err.message : String(err);
}

module.exports = {
  reconcile,
  reconcileState,
  sweepTempArtifacts,
  // constants (exported for callers/tests that want to tune or assert defaults)
  DEFAULT_GRACE_MS,
  DEFAULT_STALE_MS,
  DEFAULT_RETENTION_MS,
  DEFAULT_TEMP_TTL_MS
};

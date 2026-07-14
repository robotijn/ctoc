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
 *   • STALENESS BACKSTOP (D2), now KIND-AWARE (C1-5). `liveAgentIds` is the harness
 *     truth; when it is null/absent (TaskList unavailable) a `running` task is orphaned
 *     only once it is older than a KIND-SPECIFIC staleness floor (implement/sync = 120
 *     min, others = 30 min), because a long agent kind would be falsely orphaned by a
 *     flat 30-min floor while still alive. A young task inside the grace window is NEVER
 *     orphaned. Every staleness-decided orphaning is recorded in report.stalenessOrphaned
 *     with its age so the inbox can say "orphaned on staleness alone — may still be alive".
 *     All thresholds are injectable via `opts` (D-NB4-1).
 *   • CANCELLING LIVENESS (C1-2). A `cancelling` task is reconciled like `running`: a
 *     live agent keeps it cancelling; a confirmed-gone / aged-out one resolves to
 *     `cancelled` (report.cancelled), never orphaned — files stay locked until the agent
 *     is confirmed gone.
 *   • CANCELLING HAS A DEADLINE (R3-B item 10). A `cancelling` task whose agent is STILL
 *     LIVE but has not died within `cancelDeadlineMs` (default 30 min, kind-aware) is
 *     FORCED to `cancelled` with a loud `report.stalenessCancelled` entry. Without a
 *     tie-breaker a hung-but-live agent holds its files, a concurrency slot, AND — via
 *     Rule 2's sync barrier — blocks EVERY wave integration globally, forever.
 *   • A NULL agentTaskId IS NOT EVIDENCE OF DEATH (R3-B item 5). A `running` task with no
 *     RECORDED agent id can never match the live list, so "live list present + no match"
 *     would orphan it instantly. Absence of a recorded id is missing information, not a
 *     dead agent: such a task falls to the staleness backstop even when a live list IS
 *     present. This closes the window between a claim and the `--agent-id` patch.
 *   • STALENESS-FREED FILES ARE QUARANTINED FOR ONE PASS (R3-B item 8). A task orphaned on
 *     AGE ALONE (no live confirmation) may still be alive, so its `touches` must NOT be
 *     handed to a conflicting queued task in the SAME pass: `reconcileState` excludes such
 *     candidates from `promote` and reports them in `report.quarantined`.
 *   • RETENTION NEVER SEVERS A LIVE EDGE (R3-B item 9). A terminal task still referenced by
 *     a surviving task's `blockedBy` is NOT swept, however old: sweeping it would make the
 *     next pass fail its dependent as `dep-missing` even though the dependency SUCCEEDED.
 *   • UNSATISFIABLE SURFACING (C1-1/C1-7). A queued task that can NEVER run — a dead dep
 *     (failed/orphaned/cancelled/missing) or a blockedBy cycle, per
 *     task-registry.unsatisfiableTasks — is marked `failed` with a loud result and pushed
 *     to report.unsatisfiable, so a permanent wedge is a visible event, not silent-forever.
 *
 * ALL filesystem access routes through src/lib/safe-fs.js (the audited choke point,
 * LH1). There is no raw `fs` here and no regex LITERAL — the temp-artifact match uses
 * literal `startsWith`, and the only glob→regex construction (Rule 4's overlap test) stays
 * behind `plan-coverage.touchesOverlap`, so the promoted-to-error security lint rules
 * cannot fire in this file.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');
const taskRegistry = require('./task-registry');
// R3-B item 8: the quarantine needs the SAME glob-aware overlap test the scheduler's Rule 4
// uses — one encoding of "these two tasks touch the same files", never a second one.
const { touchesOverlap } = require('./plan-coverage');

// ── constants (D-NB4-1: reasonable defaults, ALL injectable via opts) ────────────

/** 60 s: a `running` task started within this window is NEVER orphaned. */
const DEFAULT_GRACE_MS = 60_000;
/** 30 min: default staleness cutoff for kinds NOT overridden below. */
const DEFAULT_STALE_MS = 30 * 60_000;
/**
 * Kind-aware staleness floors (C1-5). Long-running kinds get a wider window before the
 * TaskList-unavailable backstop orphans them on age alone: an `implement` or `sync` run
 * legitimately takes far longer than a review/plan, so a 30-min flat floor would falsely
 * orphan agents that are still alive. Kinds absent from this map fall back to the plain
 * staleThresholdMs (30 min). A caller may override per kind via opts.staleThresholdMsByKind.
 */
const DEFAULT_STALE_MS_BY_KIND = Object.freeze({
  implement: 120 * 60_000,
  sync: 120 * 60_000
});
/** 7 days: terminal (done/failed/orphaned) tasks older than this leave the active view. */
const DEFAULT_RETENTION_MS = 7 * 24 * 3600_000;
/**
 * 30 min: a `cancelling` task must be GONE within this window of `ts.cancelRequested`.
 * Past it, reconcile FORCES `cancelling → cancelled` even when the harness still reports
 * the agent as live (R3-B item 10) — a hung-but-live agent otherwise holds its files, its
 * slot, and the global sync barrier forever, with no tie-breaker.
 */
const DEFAULT_CANCEL_DEADLINE_MS = 30 * 60_000;
/** 1 h: orphaned atomic-write temp artifacts older than this are swept. */
const DEFAULT_TEMP_TTL_MS = 60 * 60_000;

/**
 * Terminal statuses for the RETENTION sweep — old ones leave the active view. Includes
 * `cancelled` (C1-2) so cancelled tasks age out like any other terminal. `cancelling` is
 * NOT terminal (it is a live, slot-occupying state) and is never swept.
 */
const TERMINAL = new Set(['done', 'failed', 'orphaned', 'cancelled']);

/** The atomic-write temp prefix task-registry.save uses: `${target}.tmp-…`. */
const TEMP_PREFIX = 'tasks.json.tmp-';

/**
 * @typedef {object} ReconcileReport
 * @property {string[]} orphaned  ids transitioned running→orphaned this pass.
 * @property {Array<{id:string, kind:string, ageMs:number, thresholdMs:number}>} stalenessOrphaned
 *   detail for orphanings decided by the staleness backstop ALONE (TaskList unavailable),
 *   so the inbox can warn "orphaned on staleness alone — may still be alive" (C1-5). A
 *   subset of `orphaned`; confirmed-absent orphanings (TaskList present, no match) are NOT here.
 * @property {string[]} cancelled  ids transitioned cancelling→cancelled this pass (C1-2 —
 *   the agent for a cancelling task was confirmed gone / aged out).
 * @property {Array<{id:string, kind:string, ageMs:number, deadlineMs:number, wasLive:boolean}>} stalenessCancelled
 *   detail for cancellations FORCED by the cancel deadline (R3-B item 10) — a subset of
 *   `cancelled`. `wasLive: true` means the harness still reported the agent as alive when
 *   the deadline fired: the files/slot/sync-barrier were reclaimed from a hung agent.
 * @property {Array<{id:string, reason:string, summary:string}>} [quarantined]  set by
 *   reconcileState — queued tasks EXCLUDED from `promote` this pass because their files
 *   were freed by an age-only orphaning (R3-B item 8).
 * @property {Array<{id:string, reason:string, deps:string[], summary:string}>} unsatisfiable
 *   queued tasks marked `failed` this pass because they can NEVER run (dead dep / cycle —
 *   C1-1/C1-7). Surfaced so a permanent wedge is a loud event, never silent-forever.
 * @property {Array<{id:string, summary:*}>} failed  surfaced already-failed tasks (never dropped).
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
 * @param {number} [opts.staleThresholdMs]  flat staleness cutoff for kinds without a
 *   per-kind floor. Default DEFAULT_STALE_MS (30 min).
 * @param {Object<string,number>} [opts.staleThresholdMsByKind]  per-kind staleness floors
 *   (C1-5), overriding the built-in defaults (implement/sync = 120 min). Kinds absent from
 *   both this map and DEFAULT_STALE_MS_BY_KIND fall back to staleThresholdMs.
 * @param {number} [opts.retentionMs]  terminal retention. Default DEFAULT_RETENTION_MS.
 * @param {number} [opts.cancelDeadlineMs]  R3-B item 10: a `cancelling` task past this many
 *   ms from ts.cancelRequested is FORCED to cancelled even if its agent still looks live.
 *   Default DEFAULT_CANCEL_DEADLINE_MS (30 min).
 * @param {Object<string,number>} [opts.cancelDeadlineMsByKind]  per-kind cancel-deadline
 *   overrides (R3-B item 10). Kinds absent fall back to cancelDeadlineMs.
 * @returns {{tasks:{version:number, generation?:number, seq:number, tasks:Array<object>}, report:ReconcileReport}}
 */
function reconcile(tasks, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const graceMs = Number.isFinite(opts.graceMs) ? opts.graceMs : DEFAULT_GRACE_MS;
  const staleMs = Number.isFinite(opts.staleThresholdMs) ? opts.staleThresholdMs : DEFAULT_STALE_MS;
  const retentionMs = Number.isFinite(opts.retentionMs) ? opts.retentionMs : DEFAULT_RETENTION_MS;
  const staleByKind = (opts.staleThresholdMsByKind && typeof opts.staleThresholdMsByKind === 'object')
    ? opts.staleThresholdMsByKind : null;
  const cancelDeadlineMs = Number.isFinite(opts.cancelDeadlineMs)
    ? opts.cancelDeadlineMs : DEFAULT_CANCEL_DEADLINE_MS;
  const cancelByKind = (opts.cancelDeadlineMsByKind && typeof opts.cancelDeadlineMsByKind === 'object')
    ? opts.cancelDeadlineMsByKind : null;
  /** Kind-aware cancel deadline (R3-B item 10): per-kind override > flat default. */
  const cancelDeadlineFor = (kind) => {
    if (cancelByKind && Number.isFinite(cancelByKind[kind])) return cancelByKind[kind];
    return cancelDeadlineMs;
  };

  // Kind-aware staleness floor (C1-5): explicit per-kind override > built-in kind default
  // (implement/sync = 120 min) > flat staleThresholdMs (30 min).
  const staleThresholdFor = (kind) => {
    if (staleByKind && Number.isFinite(staleByKind[kind])) return staleByKind[kind];
    if (Number.isFinite(DEFAULT_STALE_MS_BY_KIND[kind])) return DEFAULT_STALE_MS_BY_KIND[kind];
    return staleMs;
  };

  /** @type {ReconcileReport} */
  const report = {
    orphaned: [], stalenessOrphaned: [], cancelled: [], stalenessCancelled: [],
    unsatisfiable: [], failed: [], swept: [], corrupt: null
  };

  const version = (tasks && typeof tasks === 'object' && Number.isSafeInteger(tasks.version))
    ? tasks.version : taskRegistry.REGISTRY_VERSION;
  const seq = (tasks && typeof tasks === 'object' && Number.isSafeInteger(tasks.seq) && tasks.seq >= 0)
    ? tasks.seq : 0;
  // Carry the loaded GENERATION through (R3-B item 7) so `reconcileState`'s save is a real
  // compare-and-swap against the value it loaded, not an unversioned clobber.
  const generation = (tasks && typeof tasks === 'object' && Number.isSafeInteger(tasks.generation) && tasks.generation >= 0)
    ? tasks.generation : undefined;
  /** Build the returned registry value, including `generation` only when the input had one. */
  const outValue = (list) => (generation === undefined
    ? { version, seq, tasks: list }
    : { version, generation, seq, tasks: list });

  const arr = toTaskArray(tasks);
  if (arr === null) {
    // Not a registry value at all → fail open to empty, surface the corruption.
    report.corrupt = { reason: 'not-a-registry-value' };
    return { tasks: outValue([]), report };
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

    if (t.status === 'running' || t.status === 'cancelling') {
      // `cancelling` is treated like `running` for liveness (C1-2): it keeps its slot
      // until the agent is confirmed gone. The only difference is the terminal it resolves
      // to — a confirmed-gone/aged-out cancelling task becomes `cancelled`, not `orphaned`.
      const wasCancelling = t.status === 'cancelling';
      // A RECORDED agent id is the precondition for the live list to say anything at all
      // about this task (R3-B item 5). With no recorded id, "not in the live list" is
      // MISSING INFORMATION, not evidence of death — so such a task falls to the staleness
      // backstop even when a live list IS present.
      const hasRecordedId = t.agentTaskId != null;
      const hasLive = live !== null && hasRecordedId && live.has(String(t.agentTaskId));
      const startedMs = parseTs(t.ts && t.ts.started);
      const ageMs = now - startedMs;
      const young = Number.isFinite(startedMs) && ageMs < graceMs;
      const kindThreshold = staleThresholdFor(t.kind);

      // R3-B item 10 — the cancel deadline. Evaluated FIRST for a `cancelling` task and it
      // OVERRIDES liveness: a hung-but-live agent that will not die still has to release
      // the files, the slot, and the global sync barrier at some point.
      let deadlineForced = false;
      if (wasCancelling) {
        const requestedMs = parseTs(t.ts && t.ts.cancelRequested);
        const deadline = cancelDeadlineFor(t.kind);
        // A missing cancelRequested (a pre-R3-B task already in `cancelling`) falls back to
        // ts.started, so a legacy hung cancel is not immortal.
        const clock = Number.isFinite(requestedMs) ? requestedMs : startedMs;
        if (Number.isFinite(clock) && (now - clock) >= deadline) {
          deadlineForced = true;
          report.stalenessCancelled.push({
            id: t.id,
            kind: t.kind,
            ageMs: now - clock,
            deadlineMs: deadline,
            wasLive: hasLive
          });
        }
      }

      let terminate = deadlineForced;
      let stalenessBased = false;
      if (deadlineForced) {
        terminate = true;                     // the deadline beats liveness (see above)
      } else if (hasLive) {
        terminate = false;                    // live agent confirmed → leave as-is
      } else if (young) {
        terminate = false;                    // just-dispatched race → grace window
      } else if (live !== null && hasRecordedId) {
        terminate = true;                     // TaskList present, id recorded, no match, not young
      } else {
        // TaskList unavailable (or no recorded id to match) → kind-aware staleness backstop
        // (NaN age ⇒ very old).
        terminate = !Number.isFinite(startedMs) || ageMs >= kindThreshold;
        stalenessBased = terminate;
      }

      if (terminate) {
        t.ts.done = new Date(now).toISOString();
        if (wasCancelling) {
          t.status = 'cancelled';
          report.cancelled.push(t.id);
        } else {
          t.status = 'orphaned';
          report.orphaned.push(t.id);
          if (stalenessBased) {
            // Loud detail so the inbox can warn "orphaned on staleness alone — may still
            // be alive" (C1-5). Only the backstop path; confirmed-absent is not here.
            report.stalenessOrphaned.push({
              id: t.id,
              kind: t.kind,
              ageMs: Number.isFinite(ageMs) ? ageMs : null,
              thresholdMs: kindThreshold
            });
          }
        }
      }
    } else if (t.status === 'failed') {
      // Surface every failure so the caller can push it to the inbox — never dropped.
      report.failed.push({ id: t.id, summary: (t.result && t.result.summary) || null });
    }

    kept.push(t);
  }

  if (skipped > 0) report.corrupt = { reason: 'malformed-entries-skipped', skipped };

  // Unsatisfiable-queued surfacing (C1-1/C1-7): a queued task with a dead dep (failed/
  // orphaned/cancelled or missing) or inside a blockedBy cycle can NEVER run. Mark it
  // `failed` with a loud result + report entry so the wedge becomes a visible event
  // rather than a task stuck queued forever. Evaluated over the post-orphan `kept` set,
  // so a dep orphaned THIS pass also wedges its non-sync dependents (caught at review).
  for (const entry of taskRegistry.unsatisfiableTasks({ tasks: kept })) {
    const summary = `${entry.reason}: ${entry.deps.join(', ')}`;
    entry.task.status = 'failed';
    entry.task.result = { ok: false, summary };
    if (!entry.task.ts || typeof entry.task.ts !== 'object') entry.task.ts = {};
    entry.task.ts.done = new Date(now).toISOString();
    report.unsatisfiable.push({ id: entry.task.id, reason: entry.reason, deps: entry.deps, summary });
  }

  // R3-B item 9 — RETENTION NEVER SEVERS A LIVE EDGE. Every dep id referenced by a
  // SURVIVING non-terminal task's blockedBy is protected from the sweep: dropping a
  // terminal task that a queued task still depends on would make the very next pass mark
  // that dependent `dep-missing` (a missing dep NEVER satisfies) and fail it — even though
  // its dependency SUCCEEDED. The edge outlives the retention window.
  const referencedDeps = new Set();
  for (const t of kept) {
    if (TERMINAL.has(t.status)) continue; // only a LIVE task's edges are load-bearing
    const deps = Array.isArray(t.blockedBy) ? t.blockedBy : [];
    for (const d of deps) referencedDeps.add(d);
  }

  // Terminal-retention sweep: drop terminal tasks older than retentionMs from the
  // ACTIVE view. queued/running are NEVER swept (guarded by the TERMINAL check).
  // A freshly-orphaned task carries ts.done ≈ now → age ≈ 0 → survives this pass.
  const active = [];
  for (const t of kept) {
    if (TERMINAL.has(t.status) && !referencedDeps.has(t.id)) {
      const doneMs = parseTs(t.ts && (t.ts.done || t.ts.created));
      const stale = !Number.isFinite(doneMs) || (now - doneMs) >= retentionMs;
      if (stale) { report.swept.push(t.id); continue; }
    }
    active.push(t);
  }

  return { tasks: outValue(active), report };
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
  /** @type {any} */
  let reconciled = null;
  /** @type {any} */
  let report = null;

  try {
    // R3-B item 7: the load→save cycle runs INSIDE the compare-and-swap helper, so a
    // concurrent writer (a session child process running `menu task …`) that commits
    // between our load and our save causes a RELOAD and a re-reconcile against the fresh
    // state — never a clobber of the winner's mutation. `reconcile` is PURE, so re-running
    // it on retry is safe by construction.
    taskRegistry.withRegistry(root, (registry, ctx) => {
      const out = reconcile(registry, opts);
      reconciled = out.tasks;
      report = out.report;
      const changed = report.orphaned.length > 0 || report.swept.length > 0 ||
        report.cancelled.length > 0 || report.unsatisfiable.length > 0;
      if (!changed) {
        ctx.abort(); // nothing to persist — a pure read must not bump the generation
        return;
      }
      // Publish the reconciled task list onto the loaded value so withRegistry saves IT
      // (the value it compare-and-swaps is the one it loaded).
      registry.tasks = reconciled.tasks;
      registry.seq = reconciled.seq;
    });
  } catch (err) {
    if (report === null) {
      // The load itself failed (a bad `root`) — never brick the menu.
      /** @type {ReconcileReport} */
      const failReport = {
        orphaned: [], stalenessOrphaned: [], cancelled: [], stalenessCancelled: [],
        unsatisfiable: [], failed: [], swept: [], corrupt: { reason: 'load-failed' }
      };
      return { report: failReport, promote: [] };
    }
    // The reconcile ran but the SAVE failed (fail-LOUD in task-registry, including a
    // contention exhaustion) — record it and still render.
    report.saveFailed = msgOf(err);
  }

  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  try {
    report.tempSwept = sweepTempArtifacts(root, now);
  } catch {
    report.tempSwept = []; // sweepTempArtifacts is already best-effort; belt-and-suspenders
  }

  // Compute the newly-runnable set from the reconciled value (freed slots), then QUARANTINE
  // (R3-B item 8): a task orphaned on AGE ALONE was never confirmed dead, so its files may
  // still be under a live agent's hands. Handing them to a conflicting queued task in the
  // SAME pass would put two agents on one file. Such candidates wait one pass; the exclusion
  // is REPORTED, never silent.
  let promote = [];
  try {
    promote = taskRegistry.nextRunnable(reconciled);
  } catch {
    promote = [];
  }
  report.quarantined = [];
  try {
    const byId = new Map((reconciled.tasks || []).map((t) => [t.id, t]));
    const quarantinedTouches = [];
    for (const entry of report.stalenessOrphaned || []) {
      const t = byId.get(entry.id);
      if (t && Array.isArray(t.touches)) quarantinedTouches.push(...t.touches);
    }
    if (quarantinedTouches.length > 0) {
      promote = promote.filter((cand) => {
        const touches = Array.isArray(cand.touches) ? cand.touches : [];
        if (touches.length > 0 && touchesOverlap(touches, quarantinedTouches)) {
          report.quarantined.push({
            id: cand.id,
            reason: 'staleness-orphan-quarantine',
            summary: 'held one pass — its files were freed by an AGE-ONLY orphaning ' +
              '(the previous holder was never confirmed dead and may still be editing them)'
          });
          return false;
        }
        return true;
      });
    }
  } catch {
    /* the quarantine is defensive; a fault must never break the render (promote stands) */
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
  DEFAULT_STALE_MS_BY_KIND,
  DEFAULT_RETENTION_MS,
  DEFAULT_TEMP_TTL_MS
};

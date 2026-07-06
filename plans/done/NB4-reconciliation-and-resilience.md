---
approved_by: human
approved_at: 2026-07-06T12:24:27.988Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-06T09:55:43.887Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-06T09:49:10.570Z
gate_crossed: functional → implementation
iron_loop: true
---

---
title: "NB4 — Reconciliation and Resilience"
type: functional
status: functional
created: 2026-07-01
program: ctoc-menu-ux
parent_vision: "vision/nonblocking-menu-task-plane.md"
priority: MEDIUM
depends_on: [NB1, NB2]
files:
  - "src/lib/task-reconcile.js"
  - "src/lib/menu-screens.js"
  - "src/commands/menu.md"
  - "tests/task-reconcile.test.js"
---

# NB4 — Reconciliation and Resilience

> Makes the task plane survive the messy edges: a session restart that orphans a
> "running" task with no live harness agent, a background agent that fails, a
> corrupt registry, and stale/orphaned temp state. Mirrors the existing
> `cleanupStaleInProgress` pattern rather than inventing a new one.

## Problem Statement

The registry (NB1) records tasks as `running`, but a background agent lives in the
harness, not in the registry. When a session restarts, a task can be left marked
`running` while its harness agent no longer exists — an orphan. If nothing detects
this, the scheduler will forever count a phantom toward the ≤5 concurrency limit and
the queue will stall. Likewise, an agent that fails must never be silently lost, a
corrupt registry must never brick the menu, and orphaned temp files or long-stale
tasks must be swept so the registry does not accumulate rot.

CTOC already reconciles this class of problem for in-progress plans via
`cleanupStaleInProgress`. NB4 mirrors that pattern for background tasks: on menu
open, detect orphans by comparing registry `running` tasks against the live harness
`TaskList` and staleness heuristics, mark unmatched ones `orphaned`, and offer them
for re-run. This closes vision Success Criterion 5.

## Business Alignment

- Realizes vision Success Criterion 5 in full: session restart reconciles orphaned
  tasks; agent failure surfaces (never silently lost); corrupt registry fails open.
- Implements vision §4 (resilience), §7 NB4, and §8 risks (registry/harness drift →
  reconcile via `TaskList` + staleness; session-boundary orphans → detected and
  offered for re-run on menu open).
- Honors **D1** (corrupt-registry fail-open) and **D2** (harness agents are the
  executor; registry mirrors them and is reconciled via `TaskList` on demand).
- Mirrors the established `cleanupStaleInProgress` reconciliation pattern, per
  project practice of reusing proven mechanisms rather than reinventing.

## User Stories

- As the user reopening the menu after a restart, I want tasks left `running` with no
  live harness agent to be detected and marked `orphaned`, so that phantom tasks stop
  blocking the concurrency limit and the queue.
- As the user, I want each orphaned task offered for re-run, so that I can decide
  whether to resume interrupted work instead of losing it.
- As the user, I want a failed background agent to always surface in the task plane
  and inbox, so that failures are never silently lost.
- As the operator, I want a corrupt registry to fail open, so that a damaged state
  file never blocks navigation.
- As the operator, I want orphaned temp files and long-stale tasks swept, so that the
  registry and state directory do not accumulate rot over long sessions.

## Acceptance Criteria (BDD)

### Session-restart orphan detection

```gherkin
Scenario: Running task with no live harness agent is orphaned
  Given the registry marks a task "running"
  And the live harness TaskList contains no matching agent for it
  When reconciliation runs on menu open
  Then the task is marked "orphaned"
  And it no longer counts toward the concurrency limit

Scenario: Running task with a matching live agent is left alone
  Given the registry marks a task "running"
  And the harness TaskList contains a matching live agent
  When reconciliation runs
  Then the task remains "running"
  And it is not modified

Scenario: Staleness backstops missing TaskList data
  Given a task marked "running" whose started timestamp is older than the staleness threshold
  And no matching live agent can be confirmed
  When reconciliation runs
  Then the task is marked "orphaned"

Scenario: Orphaned tasks are offered for re-run
  Given one or more tasks were marked "orphaned" during reconciliation
  When the menu presents the result
  Then each orphaned task is offered as a re-run option
  And re-running it goes through the normal scheduler (canRun) path, not a direct launch
```

### Failure surfacing and fail-open

```gherkin
Scenario: Agent failure is never silently lost
  Given a background task failed
  When reconciliation or completion handling runs
  Then the task is recorded as "failed" with its failure detail
  And it appears in the inbox / task plane

Scenario: Corrupt registry fails open during reconciliation
  Given .ctoc/state/tasks.json is corrupt
  When reconciliation runs on menu open
  Then it does not throw
  And the menu still renders
  And the corruption is surfaced (recorded), not swallowed silently
```

### Sweeps

```gherkin
Scenario: Long-stale terminal tasks are swept
  Given done/failed/orphaned tasks older than the retention threshold
  When the stale-task sweep runs
  Then those tasks are pruned from the active registry view
  And active (queued/running) tasks are never swept

Scenario: Orphaned temp artifacts are cleaned
  Given a temp artifact left behind by an interrupted atomic write
  When the sweep runs
  Then the orphaned temp artifact is removed
  And the canonical registry file is untouched
```

## Scope

**In:**
- Session-restart orphan detection on menu open: compare registry `running` tasks
  against the harness `TaskList` plus a staleness threshold; mark unmatched as
  `orphaned`; mirror the `cleanupStaleInProgress` pattern.
- Offer orphaned tasks for re-run, routed back through the NB1 scheduler.
- Agent-failure surfacing so failures always reach the task plane and inbox.
- Corrupt-registry fail-open during reconciliation.
- Orphaned-temp and long-stale terminal-task sweeps (never touching active work).
- Behavioral tests (pure JS, no native deps), coverage ≥ 80%.

**Out:**
- The registry model, persistence, and scheduler themselves (owned by NB1).
- Subcommands, dashboard, and screens (owned by NB2) — NB4 feeds them state.
- The NAV/WORK dispatch protocol (owned by NB3).
- Reinventing harness background execution (vision non-goal — we mirror `TaskList`).

# Implementation Details

> Produced by implementation-planner (Iron Loop Steps 5 PLAN / 6 DESIGN / 7 SPEC).
> Read fresh from disk per CF1: task-registry.js, task-view.js, menu-screens.js,
> menu.md, actions.js (`cleanupStaleInProgress`), safe-fs.js, plan-validator.js,
> state.js (`parseMetadata`, `getPlanCounts`), inbox.js (`getInboxCounts`).
> All line/behavior claims below are grounded in the CURRENT code, not the brief.

## Step 5 — PLAN (context, decisions, scope confirmation)

### What NB1 already gives us (reuse, do not reinvent)

Grounded in `src/lib/task-registry.js` as it exists on disk:

- **Task shape** (from `normalizeLoadedTask`, lines 185–210 and `addTask`, 368–380):
  `{ id, kind, label, plan, status, agentTaskId, touches, gitOp, blockedBy, result,
  ts: { created, started, done } }`. The harness handle is **`agentTaskId`** (set via
  `updateTask` whitelist `MUTABLE_FIELDS`, line 80). Start time is **`ts.started`**
  (auto-stamped ISO-8601 when a task transitions to `running`, lines 435–436).
- **Statuses (the REAL set, from `STATUSES`, line 68):** `queued`, `running`, `done`,
  `failed`, `orphaned`. **Terminal (`TERMINAL`, line 70):** `done`, `failed`,
  `orphaned`. Valid transitions (`VALID_TRANSITIONS`, 72–78): `queued→{running,failed}`,
  `running→{done,failed,orphaned}`; terminal states have NO outbound transition.
  **`running→orphaned` is already a legal transition** — NB4 uses exactly it.
- **Concurrency counts `running` ONLY** (`runningTasks`, line 460:
  `t.status === 'running'`; `evaluateConcurrency`, 489–514, uses that set;
  `nextRunnable`, 549: `registry.tasks.filter(t => t.status === 'running')`).
  Therefore marking a task `orphaned` **automatically removes it from the concurrency
  count** — no task-registry change is required (see Orphaned-vs-concurrency below).
- **`MAX_CONCURRENT = 5`** (line 51). **`registryPath(root)`** = `.ctoc/state/tasks.json`
  (line 91). **`load`** is fail-open (absent→empty, corrupt→empty+warn, per-entry
  skip+warn; 222–274). **`save`** is atomic (temp sibling `${target}.tmp-<pid>-<Date.now()>-<rand>`
  then `renameSync`) and FAIL-LOUD (293–308). **`warnLog`** appends to
  `.ctoc/logs/task-registry.json` (111–127). All fs routes through `safe-fs.js`.
- **Scheduler entry points NB4 must route re-runs through:** `canRun(candidate, registry)`
  (529) and `nextRunnable(registry)` (548). NB4 NEVER launches an agent directly — it
  hands orphaned tasks back as re-run candidates that go through `canRun`.

### The pattern NB4 mirrors — `cleanupStaleInProgress`

From `src/lib/actions.js` lines 707–738 (read fresh): on `startAgent` it reads the
`in-progress` plan dir, and for each stale plan logs a JSON cleanup event to
`.ctoc/logs/cleanup.json` and `movePlan(... 'review' ...)`. NB4 mirrors the SHAPE —
"detect leftover live-state that the executor abandoned, record it, transition it to a
recoverable state" — but for background TASKS instead of plans: read the registry,
mark abandoned `running` tasks `orphaned`, record a report, let the caller persist +
offer re-run. The asymmetry: `cleanupStaleInProgress` mutates the filesystem directly;
NB4's core is PURE (a lib cannot call the harness Task tool), and the CALLER persists.

### Decisions carried from the plan

- **D1 (corrupt-registry fail-open):** honored — `reconcile` never throws on bad input.
- **D2 (harness is the executor; registry mirrors it, reconciled via `TaskList`):**
  honored — `liveAgentIds` is the harness truth; staleness is the backstop when absent.

## Step 6 — DESIGN (file specifications)

### Dependency graph

```
tests/task-reconcile.test.js ──tests──▶ src/lib/task-reconcile.js  (NEW)
src/lib/task-reconcile.js ──requires──▶ path (node), src/lib/safe-fs.js
src/lib/task-reconcile.js ──requires──▶ src/lib/task-registry.js  (registryPath, TERMINAL-equivalent constants inlined; see note)
src/lib/menu-screens.js  ──calls──────▶ src/lib/task-reconcile.js  (CONSUMER — see files: widening)
src/commands/menu.md      ──documents──▶ the on-open reconcile step (protocol note)
```

No cycles: `task-reconcile` depends on `task-registry` + `safe-fs` (both leaf-ish);
`menu-screens` already depends on `task-registry`/`task-view`, adding `task-reconcile`
keeps the inward dependency direction (menu-screens → lib). `task-registry` does NOT
depend on `task-reconcile` (one-way).

### Implementation order (dependency order; TDD writes tests first at Step 8)

1. `tests/task-reconcile.test.js` (CREATE) — Step 8 TEST, written first (TDD-Red).
2. `src/lib/task-reconcile.js` (CREATE) — Step 10 IMPLEMENT, makes the tests green.
3. `src/lib/menu-screens.js` (MODIFY) — the CONSUMER wiring in `buildDashboardTable`
   (requires `files:` widening — see below).
4. `src/commands/menu.md` (MODIFY, minimal) — one protocol note that on menu open,
   the dashboard reconciles the registry with the live `TaskList` before rendering,
   and orphaned tasks are offered for re-run via the scheduler (requires `files:`
   widening — see below).

---

### File: `src/lib/task-reconcile.js`
**Action:** CREATE
**Purpose:** Pure reconciliation of the NB1 background-task registry against the live
harness `TaskList` + staleness/retention heuristics: detect orphans, surface failures,
fail open on corruption, and sweep terminal rot + orphaned temp artifacts. A LIB —
it never calls the Task tool; the caller supplies `liveAgentIds` and persists.
**Change Type:** new-module

#### Exports

- `reconcile(tasks, opts)` → `{ tasks, report }`  **(PURE — no I/O)**
  - `tasks`: the registry VALUE `{ version, seq, tasks: [...] }` **or** a bare task
    array (normalized internally). On corrupt/invalid input → treated as empty
    (fail-open), corruption recorded in `report.corrupt`.
  - `opts`: `{ liveAgentIds, now, staleThresholdMs, retentionMs, graceMs }`
    - `liveAgentIds`: `Set<string>|Array<string>|null|undefined` — the live harness
      agent ids (each compared against a task's `agentTaskId`). `null`/absent ⇒
      staleness-only mode (TaskList unavailable).
    - `now`: epoch ms (default `Date.now()`), injectable for deterministic tests.
    - `staleThresholdMs`: a `running` task older than this is orphaned when its live
      status cannot be confirmed. Default `DEFAULT_STALE_MS` (see constants).
    - `graceMs`: a young `running` task (started within this window) is NEVER orphaned
      even without a live id — covers the race where a just-dispatched agent has not
      yet appeared in `TaskList`. Default `DEFAULT_GRACE_MS`.
    - `retentionMs`: terminal tasks (`done`/`failed`/`orphaned`) whose `ts.done` (or
      `ts.created` fallback) is older than this are pruned from the ACTIVE view.
      Default `DEFAULT_RETENTION_MS`.
  - Returns `{ tasks: <new registry value>, report }` where `report` =
    `{ orphaned: string[], failed: [{id, summary}], swept: string[], corrupt: null|{reason} }`.
    `orphaned` = ids transitioned `running→orphaned` THIS pass. `failed` = ids already
    `failed` (surfaced so the caller pushes them to the inbox — never dropped).
    `swept` = terminal-task ids pruned this pass. `corrupt` = non-null when the input
    could not be interpreted (fail-open marker), else `null`.
  - **PURE:** no fs, no clock read except `now` default, no mutation of the input
    (returns a fresh value with copied task objects).
  - **Never throws** on bad `tasks`/`opts` (fail-open, mirroring task-registry.load).

- `reconcileState(root, opts)` → `{ report, promote }`  **(thin I/O wrapper)**
  - Loads via `taskRegistry.load(root)` (fail-open), calls `reconcile`, persists via
    `taskRegistry.save(root, reg)` **only when the reconciled value changed**
    (orphaned/swept non-empty), sweeps orphaned temp artifacts in `.ctoc/state/` via
    `sweepTempArtifacts(root, now)`, and computes `promote = taskRegistry.nextRunnable(reg)`
    (ids of newly-runnable queued tasks freed by orphan-vacated slots). Records a
    `warnLog`-style note on corruption. **`save` stays fail-loud in task-registry;**
    `reconcileState` catches a save failure, records it in `report`, and returns
    without throwing so the NAV plane never crashes (the on-open caller must never
    brick the menu). This is the ONLY function that touches disk.

- `sweepTempArtifacts(root, now, ttlMs)` → `string[]`  (helper, exported for tests)
  - `safeFs.readdirSync(path.join(root, '.ctoc', 'state'))`, select entries matching
    the atomic-write temp shape `tasks.json.tmp-*` (literal `startsWith('tasks.json.tmp-')`
    — NO dynamic RegExp, mirroring task-registry's no-regex posture), `safeFs.lstatSync`
    each, and `safeFs.unlinkSync` those older than `ttlMs` (default = `DEFAULT_TEMP_TTL_MS`).
    The canonical `tasks.json` is **never** matched (it lacks the `.tmp-` suffix) and
    thus never touched. Directory-absent / per-file errors are swallowed (best-effort,
    like `warnLog`). Returns removed filenames.

#### Constants (module-local)

```
DEFAULT_GRACE_MS      = 60_000          // 60 s: young running tasks are never orphaned
DEFAULT_STALE_MS      = 30 * 60_000     // 30 min: running-with-no-live-id staleness cutoff
DEFAULT_RETENTION_MS  = 7 * 24 * 3600_000 // 7 days: terminal-task retention in active view
DEFAULT_TEMP_TTL_MS   = 60 * 60_000     // 1 h: orphaned temp-artifact age cutoff
TERMINAL              = new Set(['done','failed','orphaned'])  // mirror of NB1 (not exported by NB1)
```
> Decision under ambiguity (D-NB4-1): the plan specifies "short grace window" and
> "staleness threshold" but no numbers. Chosen the above as reasonable defaults,
> ALL injectable via `opts` so tests are deterministic and the caller can tune them.
> Documented in `## Decisions Taken Under Ambiguity`.

#### Core logic (`reconcile`)

```
1. Normalize input → arr = the task array (bare array | {tasks:[]} | else []).
   If input is neither an array nor an object with an array `tasks`:
     report.corrupt = { reason: 'not-a-registry-value' }; arr = [].   // fail-open
   Per-task: skip any entry that is not a well-formed object with a string id/status
     (record count in report.corrupt.skipped) — never throw.
2. live = liveAgentIds == null ? null : new Set([...liveAgentIds].map(String))
3. For each task t (work on a shallow copy):
   a. ORPHAN DETECTION (only for status === 'running'):
      - hasLive = live !== null && t.agentTaskId != null && live.has(String(t.agentTaskId))
      - startedMs = Date.parse(t.ts && t.ts.started) (NaN → treat as very old)
      - ageMs = now - startedMs
      - young = Number.isFinite(startedMs) && ageMs < graceMs
      IF hasLive → leave 'running' (untouched).            // live agent confirmed
      ELSE IF young → leave 'running' (grace window).       // just-dispatched race
      ELSE IF live !== null (TaskList present, no match, not young) → orphan.
      ELSE (live === null → TaskList unavailable):
           IF ageMs >= staleThresholdMs → orphan (staleness backstop).
           ELSE leave 'running'.                            // cannot confirm; too young
      "orphan" = set status='orphaned', stamp ts.done = new Date(now).toISOString()
                 (mirrors task-registry auto-stamp), push id to report.orphaned.
   b. FAILURE SURFACING (status === 'failed'):
      push { id, summary: t.result && t.result.summary || null } to report.failed.
      (Never mutated, never dropped — the caller pushes it to the inbox.)
4. SWEEP (terminal retention): after orphaning, drop from the ACTIVE view any task
   whose status ∈ TERMINAL and whose (ts.done ?? ts.created) age >= retentionMs.
   queued/running are NEVER swept (guarded by the TERMINAL check). Record swept ids.
   Newly-orphaned tasks use their fresh ts.done (age ≈ 0) so they are NOT swept the
   same pass — they persist to be offered for re-run.
5. Return { tasks: { version, seq, tasks: kept }, report } preserving version/seq.
```

#### Orphaned-vs-concurrency (the load-bearing correctness point)

`evaluateConcurrency`/`runningTasks`/`nextRunnable` in task-registry count
**`status === 'running'` exclusively** (verified: lines 460, 491, 549). An `orphaned`
task therefore contributes ZERO to the ≤5 count the instant `reconcile` transitions it.
**No change to task-registry is needed** — the minimal, correct design is to reuse the
existing status filter. If a future reviewer proposes counting orphaned toward
concurrency, that would be the wrong direction (it re-introduces the phantom). The test
`orphaned-frees-a-concurrency-slot` (Step 7) proves `canRun` returns `run:true` after
reconcile where it returned `max-concurrent` before.

#### Dependencies (imports)

- `require('path')` — join for `.ctoc/state` temp sweep.
- `require('./safe-fs')` — `readdirSync`, `lstatSync`, `unlinkSync` for the temp sweep
  (the audited fs choke point; NO raw `fs`).
- `require('./task-registry')` — `load`, `save`, `nextRunnable`, `registryPath`
  (reused in `reconcileState` only; `reconcile` itself imports nothing runtime-stateful).

#### Called By

- `src/lib/menu-screens.js` → `buildDashboardTable(projectPath)` (line 134) — the
  on-menu-open reconcile call-site (see CONSUMER below).

#### Error handling

- `reconcile`: total fail-open — any malformed `tasks`/`opts` yields a safe empty view
  + `report.corrupt`, never a throw.
- `reconcileState`: `load` is fail-open already; `save` is fail-loud in task-registry
  but `reconcileState` catches it, records `report.saveFailed = <message>`, and returns
  (the menu must render even if state cannot be written).
- `sweepTempArtifacts`: best-effort, all errors swallowed (a broken sweep must never
  break rendering).

#### Cross-platform notes

- `path.join(root, '.ctoc', 'state')` — never string concatenation.
- All fs via `safe-fs` (already cross-platform).
- No `os.tmpdir` needed in src (tests use it for fixtures); no OS-specific branches.
- Timestamps compared as epoch ms via `Date.parse` on the ISO strings task-registry
  writes — clock-skew-independent within a single reconcile call (single `now`).

---

### CONSUMER — `src/lib/menu-screens.js` (MODIFY) — critical; without it NB4 is inert

**Exact call-site:** `buildDashboardTable(projectPath)`, `src/lib/menu-screens.js`
lines 180–189 (read fresh). Today it does:

```js
let taskReg;
try { taskReg = taskRegistry.load(root); } catch { taskReg = taskRegistry.emptyRegistry(); }
let tasksBlock = '';
try { tasksBlock = taskView.renderTasksSection(taskReg); } catch { tasksBlock = ''; }
```

This is the single place the registry is loaded on menu open, immediately before it is
rendered. NB4 inserts the reconcile BETWEEN load and render. **Minimal change** (do not
re-architect NB2):

1. Add `const taskReconcile = require('./task-reconcile');` to the require block
   (alongside `taskRegistry`/`taskView`, lines 29–30).
2. Replace the load with a reconcile-then-load. Because `menu-screens` is a plain Node
   process with no access to the harness Task tool, it CANNOT read `liveAgentIds`
   itself → it calls `reconcileState(root, { liveAgentIds: readLiveAgentIds() })` where
   `liveAgentIds` is supplied by the menu.md protocol layer (see below). When the menu
   process has no live-agent data, it passes `liveAgentIds: null` → **staleness-only
   backstop** runs (still correct, just conservative). Wrap in try/catch → on any
   failure fall back to `taskRegistry.load` (never brick the dashboard):

```js
let taskReg;
try {
  taskReconcile.reconcileState(root, { liveAgentIds: readLiveAgentIds(root) });
  taskReg = taskRegistry.load(root);         // reload the reconciled+persisted value
} catch {
  try { taskReg = taskRegistry.load(root); } catch { taskReg = taskRegistry.emptyRegistry(); }
}
```

3. **Offer orphaned tasks for re-run via the scheduler:** `reconcileState` returns
   `{ report, promote }`. Surface `report.orphaned` in the dashboard/inbox as a re-run
   offer, and expose `promote` (the `nextRunnable` set freed by the vacated slots) to
   the menu driver so re-run/promotion goes THROUGH `canRun`/`nextRunnable` (per menu.md
   Two-Plane WORK dispatch, never a direct launch). The one-line surfacing reuses the
   existing inbox/tasks section — do NOT add a new screen. Keep this to the smallest
   possible touch: one reconcile call + include orphaned ids in the existing bg/inbox
   line so the user sees "N task(s) orphaned — offer re-run".

> `liveAgentIds` provenance (menu.md Two-Plane Protocol): the harness `TaskList` (the
> Task tool's live agent list) is known to Claude's MAIN loop, not to the `menu.js`
> child process. Per NB3 the main loop passes live state into the render. The concrete
> wiring: menu.js/menu.md accepts the live agent-id list (e.g. a `--live-agents id,id`
> arg or a small state file the main loop writes before each render), and
> `readLiveAgentIds(root)` reads it; absent ⇒ `null` ⇒ staleness backstop. The exact
> transport is a menu.md protocol note (below) + a tiny reader in menu-screens; both
> are inside the widened `files:`.

### CONSUMER — `src/commands/menu.md` (MODIFY, minimal)

Add ONE protocol note to the Two-Plane Protocol section: on menu open (a NAV render),
before the dashboard renders, the main loop passes the live harness `TaskList` agent-id
list to the menu so `reconcileState` can mark orphaned `running` tasks; orphaned tasks
are offered for re-run through the scheduler (`canRun`/`nextRunnable`), never a direct
launch; a `failed` task surfaces in the inbox (never lost). This documents the
`liveAgentIds` hand-off that NB3 established. No new command, no new route.

### REQUIRED `files:` widening (state exactly which + why — user widens before impl)

The plan's current `files:` (lines 16–19) lists ONLY
`src/lib/task-reconcile.js` + `tests/task-reconcile.test.js`. The consumer wiring is
outside that set, so the PreToolUse enforcement hook would BLOCK edits to it. **Add:**

| File to add to `files:` | Why it must be added |
|---|---|
| `src/lib/menu-screens.js` | The reconcile CALL-SITE. Without editing `buildDashboardTable` (lines 180–189) to call `reconcileState` on menu open, NB4 is inert — reconcile is never invoked (the pi1 failure mode). This is the load-bearing consumer. Keep the touch minimal (one reconcile call + orphaned re-run surfacing). |
| `src/commands/menu.md` | The protocol note that the main loop passes the live `TaskList` agent-id list into the render so `liveAgentIds` is available; documents the re-run-via-scheduler and failure-surfacing behavior. One note, no new command/route. |

> Scope flag: both additions touch files owned/edited by NB2 (`menu-screens.js`) and
> NB3 (`menu.md`). The edits are ADDITIVE and minimal (a require + a reconcile call +
> a surfacing line in menu-screens; one protocol paragraph in menu.md). They do NOT
> re-architect NB2's rendering or NB3's protocol. `task-registry.js` (NB1) is **NOT**
> touched — the orphaned-excludes-from-concurrency property already holds there. If the
> user prefers to keep NB4 to ONLY its two files, the alternative is a follow-up
> "NB4-consumer" plan owning `menu-screens.js` + `menu.md`; but then NB4-as-shipped is
> inert until that plan lands (explicitly the risk the brief calls out). Recommendation:
> widen `files:` here so NB4 ships wired.

### CF1 completeness-guard confirmation (no `cache.invalidate()` needed)

Verified fresh: `task-reconcile`/`reconcileState` write ONLY `.ctoc/state/tasks.json`
(and unlink `.ctoc/state/tasks.json.tmp-*`), never a `plans/` path. The CF1 memoized
counters do NOT read tasks.json:
- `getPlanCounts` (state.js 93–106) counts `plans/{canvas,functional,implementation,review,todo,in-progress,done}` dir entries only.
- `getVisionCounts` (state.js 330) counts visions only.
- `getInboxCounts` (inbox.js 222–230) counts questions/decisions/gatesWaiting/staleCandidates only.
None touch `.ctoc/state/tasks.json`. Therefore writing the registry needs **no**
`cache.invalidate()` and cannot stale the CF1 counts — confirmed, matches the brief.

## Step 7 — SPEC (test plan)

### Tests: `tests/task-reconcile.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`beforeEach`/`afterEach`), `assert/strict`.
**Fixtures:** tmp roots via `fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-reconcile-'))`
for the I/O-touching tests (`reconcileState`, temp sweep); pure in-memory registry
literals for `reconcile` (mirrors task-registry.test.js's dual harness, lines 25–40).
Inject `now` and thresholds via `opts` for determinism — NEVER sleep. `afterEach`
`fs.rmSync(root, {recursive, force})`. Every test has ≥1 meaningful assertion; error
paths exercised; no early-return-without-assert, no empty catch, no always-green.

Each of the 8 plan BDD scenarios maps to a named test, plus the concurrency test:

| # | Test name | BDD scenario | Key assertions |
|---|---|---|---|
| 1 | `orphan-no-live-agent` | Running task with no live harness agent is orphaned | Given a `running` task whose `agentTaskId` is NOT in `liveAgentIds` and `ts.started` older than grace, `reconcile` sets its status to `'orphaned'`, stamps `ts.done`, and `report.orphaned` contains its id. |
| 2 | `running-with-live-agent-left-alone` | Running task with a matching live agent is left alone | Given a `running` task whose `agentTaskId` IS in `liveAgentIds`, status stays `'running'`, `report.orphaned` is empty, and the returned object deep-equals the input for that task (not modified). |
| 3 | `staleness-backstop-when-no-TaskList` | Staleness backstops missing TaskList data | Given `liveAgentIds: null` and a `running` task older than `staleThresholdMs`, it is orphaned; a SECOND `running` task younger than the threshold is left `running` (asserts the age gate, not blanket orphaning). |
| 4 | `orphaned-offered-for-rerun-via-canRun` | Orphaned tasks are offered for re-run (scheduler path) | After reconcile marks a task `orphaned`, assert that a re-run candidate (same kind/plan/touches) returns `taskRegistry.canRun(candidate, reconciledReg).run === true` where it was `false` (`max-concurrent`) against the pre-reconcile registry — proving re-run goes via the scheduler, not a direct launch. |
| 5 | `agent-failure-surfaced-not-lost` | Agent failure is never silently lost | Given a `failed` task with `result.summary`, `report.failed` contains `{id, summary}`, the task is NOT dropped from `tasks` (unless past retention — use a fresh `ts.done`), and its status stays `'failed'`. |
| 6 | `corrupt-registry-fail-open` | Corrupt registry fails open during reconciliation | Call `reconcile(<corrupt input: a string, then a number, then `{tasks: 'x'}`>)`: assert it does NOT throw (`assert.doesNotThrow`), returns an empty-tasks view, and `report.corrupt` is non-null (surfaced, not swallowed). A second sub-case: a registry with one malformed entry among valid ones skips only the bad entry and records the skip count. |
| 7 | `long-stale-terminal-swept` | Long-stale terminal tasks are swept + active never swept | Given `done`/`failed`/`orphaned` tasks with `ts.done` older than `retentionMs` AND a `queued` + a `running` task, reconcile prunes exactly the 3 terminal ids (in `report.swept`), and the `queued`+`running` tasks remain (asserts active are NEVER swept). |
| 8 | `orphaned-temp-cleaned` | Orphaned temp artifacts are cleaned + canonical untouched | Write `.ctoc/state/tasks.json` (valid) + two `tasks.json.tmp-*` files (one aged past the TTL via `fs.utimesSync`/old mtime, one fresh). `sweepTempArtifacts` removes the aged temp, leaves the fresh temp, and `tasks.json` still exists with unchanged bytes. |
| 9 | `orphaned-frees-a-concurrency-slot` | (Plan: "no longer counts toward concurrency") | Build a registry at exactly `MAX_CONCURRENT` running with one orphan-eligible among them; assert a fresh candidate's `canRun` is `{run:false, reason:'max-concurrent'}` BEFORE reconcile and `{run:true}` AFTER — the orphan vacated its slot. |

Additional edge tests (defense in depth, still ≥1 assertion each):
- `young-running-never-orphaned`: a `running` task inside `graceMs` with no live id is left alone (covers the just-dispatched race).
- `reconcileState-persists-and-promotes`: end-to-end on a tmp root — seed a registry, `reconcileState` orphans a stale task, reloading via `taskRegistry.load` shows the persisted `orphaned` status, and `promote` contains a queued task that became runnable.
- `reconcileState-save-failure-does-not-throw`: fault-inject a save failure at the safe-fs boundary (the sanctioned pattern from task-registry.test.js ST-04) → `reconcileState` returns with `report.saveFailed` set and does NOT throw.
- `pure-reconcile-does-not-mutate-input`: assert the input registry object is unchanged after `reconcile` (structural equality on a pre-captured clone).

**Coverage target:** ≥ 80% lines/branches on `src/lib/task-reconcile.js` (all four
orphan branches, the sweep guard, the corrupt-input branch, the temp-sweep age gate,
and the save-failure catch each exercised).

## Step 8–16 — Execution checklist (canonical labels)

| Step | Label | What happens for NB4 |
|---|---|---|
| 8 | TEST | Write `tests/task-reconcile.test.js` per Step 7 (TDD-Red): all 9 mapped BDD tests + 4 edge tests, failing against the absent module. |
| 9 | PREPARE | Confirm prerequisites: `task-registry` exports (`load/save/nextRunnable/canRun/registryPath/MAX_CONCURRENT`) exist; `safe-fs` has `readdirSync/lstatSync/unlinkSync`; no new deps. Ensure `.ctoc/state` handling in tmp fixtures. |
| 10 | IMPLEMENT | Write `src/lib/task-reconcile.js` (`reconcile`, `reconcileState`, `sweepTempArtifacts`, constants) making Step 8 green. Then wire the CONSUMER: `menu-screens.js` `buildDashboardTable` reconcile call + orphaned re-run surfacing; `menu.md` protocol note. No stubs — document any ambiguity choice in `## Decisions Taken Under Ambiguity`. |
| 11 | REVIEW | Self-review: pure `reconcile` has no I/O; orphaned excluded from concurrency via reused status filter (no NB1 change); fail-open total; sweep never touches active or canonical file; consumer touch minimal. |
| 12 | OPTIMIZE | Single pass over tasks; `liveAgentIds` normalized to a Set once; no redundant load (reconcileState loads once, saves only on change). |
| 13 | SECURE | No dynamic RegExp (literal `startsWith` for temp match); all fs via safe-fs; no prototype spread of registry input; corrupt input fail-open not fail-crash; temp sweep bounded to `.ctoc/state` + `tasks.json.tmp-` prefix (canonical file unreachable). |
| 14 | VERIFY | `node --test tests/task-reconcile.test.js` green; full suite `node --test tests/*.test.js` shows `# fail 0`; coverage ≥ 80% on new lines; 0 skipped/flaky. |
| 15 | DOCUMENT | JSDoc on all three exports + the module header (mirror task-registry.js's design-note header style); update menu.md protocol note. |
| 16 | FINAL-REVIEW | implementation-reviewer verifies the 14 quality dimensions + human-approval marker → Gate 3 (human approves). |

## Acceptance-criteria mapping

| Plan acceptance criterion (BDD) | Implemented in | Test |
|---|---|---|
| Running task, no live agent → orphaned, off concurrency | `reconcile` orphan branch (live present, no match) | `orphan-no-live-agent`, `orphaned-frees-a-concurrency-slot` |
| Running task, matching live agent → left alone | `reconcile` `hasLive` guard | `running-with-live-agent-left-alone` |
| Staleness backstops missing TaskList | `reconcile` `live === null` staleness branch | `staleness-backstop-when-no-TaskList`, `young-running-never-orphaned` |
| Orphaned offered for re-run via scheduler | `reconcileState` returns `promote`; consumer surfaces re-run via `canRun`/`nextRunnable` | `orphaned-offered-for-rerun-via-canRun`, `reconcileState-persists-and-promotes` |
| Agent failure never silently lost | `reconcile` failure-surfacing branch → `report.failed`; consumer → inbox | `agent-failure-surfaced-not-lost` |
| Corrupt registry fails open | `reconcile` fail-open normalization + `report.corrupt` | `corrupt-registry-fail-open` |
| Long-stale terminal swept; active never swept | `reconcile` retention sweep (TERMINAL guard) | `long-stale-terminal-swept` |
| Orphaned temp artifacts cleaned; canonical untouched | `sweepTempArtifacts` (prefix `tasks.json.tmp-`) | `orphaned-temp-cleaned` |

## Decisions Taken Under Ambiguity

- **D-NB4-1 (threshold values):** the plan specifies "short grace window", "staleness
  threshold", and "retention threshold" without numbers. Chosen defaults —
  grace 60 s, staleness 30 min, retention 7 days, temp-TTL 1 h — all injectable via
  `opts` so tests are deterministic and operators can tune. Rationale: grace must
  exceed a plausible dispatch-to-TaskList lag (seconds) but stay short; staleness must
  be long enough that a legitimately long agent run is not falsely orphaned when
  TaskList is unavailable; retention keeps a week of terminal history visible.
- **D-NB4-2 (pure core + thin I/O wrapper, not pure-only):** the brief allowed either.
  Chosen BOTH: `reconcile` is pure (trivially testable, no disk), and `reconcileState`
  is the thin load/save wrapper mirroring task-registry's atomic+fail-open so the
  consumer calls ONE function on menu open. Persistence lives in the wrapper; the
  scheduler decision (`nextRunnable`) is computed there and returned as `promote`.
- **D-NB4-3 (no task-registry change):** because `runningTasks`/`evaluateConcurrency`/
  `nextRunnable` count `status === 'running'` exclusively (verified in code), marking a
  task `orphaned` already frees its slot. NB4 therefore adds ZERO lines to
  `task-registry.js` (NB1) — the minimal correct design. Flagged for review: if a
  reviewer wants orphaned counted, that reverses the fix and must be rejected.
- **D-NB4-4 (liveAgentIds transport left to NB3/menu):** `menu-screens` cannot read the
  harness TaskList itself. The design reads `liveAgentIds` from whatever the menu.md
  protocol layer supplies (arg or small state file the main loop writes) and falls back
  to `null` → staleness-only. The exact transport is a menu.md protocol note (in the
  widened `files:`); the lib stays agnostic (accepts a Set/array/null).
- **D-NB4-5 (consumer surfacing is minimal, reuses inbox/tasks line):** orphaned re-run
  offers reuse the existing bg/inbox surfacing rather than a new screen, to keep the
  NB2 touch minimal and avoid re-architecting the dashboard.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — MODULE_NOT_FOUND (0 pass / 1 fail) before impl

### Step 9: PREPARE
- [x] Install dependencies if needed — none (pure JS, reuses task-registry + safe-fs)
- [x] Check prerequisites — task-registry exports load/save/nextRunnable/canRun/registryPath/MAX_CONCURRENT; safe-fs has readdirSync/lstatSync/unlinkSync/utimesSync
- [x] Verify dev environment ready
- [x] Create directories/config if needed — tmp fixtures create .ctoc/state per-test

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — reconcile/reconcileState/sweepTempArtifacts
- [x] Add error handling — total fail-open; save-failure caught; sweep best-effort
- [x] Wire up integration points — menu-screens buildDashboardTable reconcile call + orphan surfacing; menu.md ON-OPEN RECONCILE protocol note

### Step 11: REVIEW
- [x] Self-review all new code — pure reconcile has no I/O; orphaned excluded from concurrency via reused status filter (zero NB1 change); consumer touch minimal
- [x] Verify integration points work together — end-to-end smoke: stale running → orphaned on dashboard open, slot freed, re-run line rendered
- [x] Check error handling completeness — corrupt/save-fail/sweep-fail all covered by tests

### Step 12: OPTIMIZE
- [x] Remove redundant operations — single pass over tasks; liveAgentIds normalized to a Set once
- [x] Optimize critical paths — reconcileState loads once, saves only on change (orphaned/swept non-empty)
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — temp sweep bounded to .ctoc/state + literal `tasks.json.tmp-` prefix; canonical tasks.json unreachable
- [x] Sanitize outputs — no dynamic RegExp (literal startsWith)
- [x] No secrets in code
- [x] Safe file operations — all fs via safe-fs; no registry-input spread; corrupt input fails open not crash

### Step 14: VERIFY
- [x] Run lint + type check — eslint . --max-warnings 0 exit 0; tsc 89 errors == baseline (0 new)
- [x] Run ALL tests (TDD Green) — task-reconcile 16/16 pass; full suite 2784 pass / 0 fail
- [x] Check coverage >= 80% — task-reconcile.js 96.47% lines / 83.13% branches / 100% funcs
- [x] 0 skipped, 0 flaky tests — full suite 0 skipped / 0 cancelled / 0 todo

### Step 15: DOCUMENT
- [x] Update relevant documentation — menu.md ON-OPEN RECONCILE note; README module count 112→113
- [x] Add JSDoc comments to new functions — module header + JSDoc on all 3 exports + ReconcileReport typedef
- [x] Update CHANGELOG if needed — n/a (versioned at release)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — end-to-end dashboard smoke test passed
- [x] Ready for human review — Gate 3 (human approves) — NOT crossed by executor

## Decisions Taken Under Ambiguity (Execution, Steps 8–16)

- **D-NB4-6 (13→16 named tests):** the SPEC listed 13 tests; implemented 16 named
  `it`s — all 13 plus 3 defensive extras (`freshly-orphaned task is not swept the same
  pass`, `sweepTempArtifacts on an absent state dir returns [] and never throws`,
  `reconcileState-corrupt-registry-fails-open`). Superset of the contract, every test
  a meaningful assertion, no always-green.
- **D-NB4-7 (menu-screens liveAgentIds = null at pure-script time):** the `menu.js`
  child process has no access to the harness Task tool, so the consumer passes
  `liveAgentIds: null` → the staleness backstop governs on-open reconciliation. This is
  the correct, safe conservative path (per the plan's CONSUMER note and D-NB4-4); the
  precise-liveAgentIds transport remains the menu.md protocol hand-off for the main loop.
- **D-NB4-8 (CF1 completeness-guard: whitelist, not cache.invalidate):** the CF1 guard
  flagged task-reconcile.js as a mutating fs writer. Per the plan's verified analysis,
  it writes ONLY `.ctoc/state/tasks.json` (via task-registry.save) + unlinks
  `.ctoc/state/tasks.json.tmp-*` — a non-counted state file (getPlanCounts/getVisionCounts/
  getInboxCounts never read it). The correct resolution is a justified WHITELIST entry
  in cache-freshness.test.js (adjacent to task-registry.js's), NOT a cache.invalidate()
  call — adding invalidate would be a false wiring on a path no memoized counter reads.
- **D-NB4-9 (report typedef for tsc baseline-neutrality):** `reconcileState` adds
  `saveFailed`/`tempSwept` to the report object, which tsc rejected against the shape
  inferred from `reconcile`. Resolved by an explicit `@typedef ReconcileReport` (with
  those fields optional) annotating both call sites — keeps tsc at the 89 baseline with
  zero new errors, no `@ts-ignore`, no baseline bump.
- **D-NB4-10 (readme module-count bump 112→113):** adding src/lib/task-reconcile.js
  raised the top-level src/lib module count. Bumped the two readme-numbers.test.js
  assertions (112→113) and the README project-structure line to match (LH1-style drift),
  confirmed readme-numbers.test.js green.

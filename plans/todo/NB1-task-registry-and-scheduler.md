---
iron_loop: true
approved_by: human
approved_at: 2026-07-02T06:19:02.782Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-01T17:32:13.348Z
gate_crossed: functional → implementation
---

---
title: "NB1 — Task Registry and Scheduler"
type: implementation
status: implementation
iron_loop: true
created: 2026-07-01
program: ctoc-menu-ux
parent_vision: "vision/nonblocking-menu-task-plane.md"
priority: HIGH
depends_on: []
files:
  - "src/lib/task-registry.js"
  - "tests/task-registry.test.js"
---

# NB1 — Task Registry and Scheduler

> Foundation stub. Pure model + persistence + scheduler. No menu, no UX, no dispatch.
> This is the algorithmic heart that turns CTOC's operator-memory concurrency rules
> (vision §3b, §6 D5) into enforced, unit-tested code.

## Problem Statement

CTOC's concurrency-safety rules — at most 5 concurrent operations, plan-mutating
`implement` runs serialize FIFO, tasks touching the same file must not run
concurrently, and git operations must never run alongside file-editing tasks —
today live only in operator discipline and MEMORY.md notes. There is no shared,
durable representation of "what background work exists, what may run now, and what
must wait." Without a persisted task registry and a pure scheduler, the
higher-level menu wiring (NB2), protocol (NB3), and resilience (NB4) have nothing
safe to build on: they would each re-encode the rules ad hoc and drift.

We need a single, pure, testable module (`src/lib/task-registry.js`) that owns the
task model, persists it to one JSON file with Claude as the sole writer, and
exposes the scheduler decisions `canRun` and `nextRunnable`. It must be resilient
by construction: a corrupt registry file must fail open rather than brick the menu.

## Business Alignment

- Directly realizes vision Success Criterion 3 ("concurrency-safety rules are
  ENFORCED by the scheduler and unit-tested — not left to operator judgment") and
  the corrupt-registry-fail-open half of Criterion 5.
- Honors locked decision **D1** (single `.ctoc/state/tasks.json`, Claude sole
  writer, atomic write via `src/lib/safe-fs.js`, fail-open) and **D5** (safety in
  code: ≤5 / plan-serial-FIFO / file-conflict / git-exclusive, unit-tested).
- Encodes the SP4-clobber lesson (git-exclusive) as tested policy per project
  memory "No concurrent git agents."
- Enables the async-overnight philosophy: a durable, lock-free registry is the
  shared state between `menu.js` (policy brain) and Claude's main loop (executor).

## User Stories

- As Claude's main loop, I want to add, read, and update background tasks in one
  durable registry, so that task state survives across menu turns and sessions and
  I remain the sole writer (lock-free, single-threaded serialization).
- As the scheduler, I want a pure `canRun(candidate, registry) → {run, reason}`
  decision, so that every concurrency-safety rule is enforced identically wherever
  it is consulted.
- As the scheduler, I want `nextRunnable(registry)` to return the tasks that just
  became eligible, so that on each completion newly-unblocked queued work can be
  dispatched.
- As the operator, I want a corrupt or missing registry to fail open, so that a bad
  state file never blocks navigation or loses the menu.

## Acceptance Criteria (BDD)

### Task model and persistence

```gherkin
Scenario: First load with no registry file
  Given no .ctoc/state/tasks.json exists
  When the registry is loaded
  Then an empty task list is returned
  And no error is thrown

Scenario: A queued task round-trips through disk
  Given an empty registry
  When a task is added with kind, label, plan, touches, and gitOp
  And the registry is persisted and reloaded
  Then the reloaded task has a unique id
  And its status is "queued"
  And it carries a created timestamp
  And its touches and gitOp fields are preserved

Scenario: Only one registry file is used
  Given several tasks have been added and persisted
  When the state directory is inspected
  Then all tasks live in the single file .ctoc/state/tasks.json
  And no per-task files are created

Scenario: Writes are atomic
  Given a registry already persisted with a known set of tasks
  When a new write is simulated as interrupted before completion
  And the registry is reloaded
  Then the reloaded state is either the complete prior state or the complete new state
  And it is never a partially written / truncated file

Scenario: Corrupt registry fails open
  Given .ctoc/state/tasks.json contains malformed JSON
  When the registry is loaded
  Then it returns a usable (empty or last-good) task list
  And it does not throw
  And a warning is surfaced (recorded), not swallowed silently
```

### Scheduler — canRun

```gherkin
Scenario: Max concurrency reached
  Given 5 tasks are running
  When canRun evaluates a 6th candidate
  Then run is false
  And reason indicates the max-concurrent limit

Scenario: Plan-mutating implement serializes FIFO
  Given an "implement" task is running
  When canRun evaluates another "implement" candidate
  Then run is false
  And reason indicates plan-serialization

Scenario: File-conflict serialization
  Given a running task touches ["a.js"]
  When canRun evaluates a candidate that touches ["a.js", "b.js"]
  Then run is false
  And reason indicates a file conflict

Scenario: Disjoint file sets may run concurrently
  Given a running task touches ["a.js"]
  When canRun evaluates a candidate that touches ["c.js"]
  And concurrency and other rules are satisfied
  Then run is true

Scenario: Git operation is mutually exclusive with editing tasks
  Given an editing task (non-empty touches) is running
  When canRun evaluates a gitOp candidate
  Then run is false
  And reason indicates git-exclusivity
  And the reverse also holds: a running gitOp queues any editing candidate

Scenario: Two git operations never run concurrently (git-vs-git)
  Given a gitOp task is running
  When canRun evaluates another gitOp candidate
  Then run is false
  And reason indicates git-exclusivity

Scenario: A read-only task may run alongside a git operation
  Given a gitOp task is running
  When canRun evaluates a read-only candidate (empty touches, not gitOp)
  And concurrency is under the limit
  Then run is true

Scenario: Eligible candidate runs
  Given fewer than 5 tasks are running
  And the candidate has no file conflict, no plan-serial conflict, and no git conflict
  When canRun evaluates the candidate
  Then run is true
```

### Scheduler — nextRunnable

```gherkin
Scenario: Completion unblocks dependent queued tasks
  Given a queued task blockedBy a task that just moved to "done"
  When nextRunnable is called on the updated registry
  Then the newly-unblocked task is returned
  And every returned task independently satisfies canRun

Scenario: Nothing eligible yet
  Given all queued tasks still violate at least one safety rule
  When nextRunnable is called
  Then it returns an empty list

Scenario: Satisfied dependency no longer blocks
  Given a queued task blockedBy an id that is now "done"
  When runnability is evaluated
  Then that dependency no longer contributes to blocking
```

## Scope

**In:**
- The task model shape `{ id, kind, label, plan, status, agentTaskId, touches,
  gitOp, blockedBy, result, ts }`.
- Persistence to the single `.ctoc/state/tasks.json` via `src/lib/safe-fs.js`
  (atomic write, Claude sole writer), with load/add/update helpers.
- Fail-open behavior on missing or corrupt registry.
- Pure `canRun(candidate, registry) → {run, reason}` encoding ≤5 concurrent,
  plan-serial-FIFO, file-conflict, and git-exclusive rules.
- Pure `nextRunnable(registry)` returning newly-eligible queued tasks.
- Behavioral unit tests (pure JS, no native deps), coverage ≥ 80%.

**Out:**
- Any menu subcommand, dashboard section, or screen (→ NB2).
- Dispatching / launching agents or the WORK/NAV protocol (→ NB3).
- Session-restart orphan detection, failure surfacing, sweeps (→ NB4).
- Cross-platform paths still apply (`path.join`, no OS-specific assumptions).

---

# Implementation Blueprint

> Produced by implementation-planner. Feeds the Iron Loop (Step 8 TEST → Step 16
> FINAL-REVIEW). Ancestry read in full: vision `nonblocking-menu-task-plane.md`
> (D1–D5, §3a/§3b), this plan's Problem/BDD-ACs/Scope (the contract), `CLAUDE.md`
> (cross-platform, no-stub, test-behavior-not-structure, ≥80% coverage). Style
> mirrors `src/lib/plan-index/store.js` (atomic temp+rename, fail-open load,
> warn-log). All I/O routes through `src/lib/safe-fs.js` (LH1 choke point).

## Step 5: PLAN — module layout and public API

**One new pure module + one test file. No menu, no dispatch, no reconciliation.**

### API shape decision: data-oriented (functional), NOT a store-handle

`store.js` uses a `openStore(path) → handle` closure because PI1 is **multi-writer**
(menu, hooks, sweep) and needs a lock, owner token, heartbeat, and
reload-under-lock cache. NB1 is the opposite by locked decision **D1**: **Claude is
the sole writer, the main loop is single-threaded, so writes serialize naturally →
lock-free.** A handle would be pure ceremony with no lock to encapsulate. Therefore
NB1 exposes a **functional API over a plain registry value**:

- `load(root) → registry` reads the value from disk (fail-open).
- `save(root, registry) → void` persists the value (atomic, fail-loud).
- `addTask` / `updateTask` mutate a registry **value** in memory.
- `canRun` / `nextRunnable` are **pure reads** over a registry value.

This makes the scheduler trivially unit-testable with in-memory literals (no disk),
matches the vision's mental model ("the registry is the shared state — a value"),
and keeps `canRun(candidate, registry)` / `nextRunnable(registry)` exactly as
specified. **This asymmetry with `store.js` (lock-free vs locked) is called out per
the DESIGN section and is the single biggest structural difference.**

### Public surface (`src/lib/task-registry.js`)

```
module.exports = {
  // persistence
  load,            // (root) → registry
  save,            // (root, registry) → void
  emptyRegistry,   // () → registry           (fresh {version, seq, tasks:[]})
  registryPath,    // (root) → string         (absolute .ctoc/state/tasks.json — for NB2/NB4)
  readWarnLog,     // (root) → entry[]         (observability + test assertions)
  // model mutators
  addTask,         // (registry, spec) → task
  updateTask,      // (registry, id, patch) → task
  // scheduler (pure)
  canRun,          // (candidate, registry) → { run:boolean, reason:string }
  nextRunnable,    // (registry) → task[]
  // constants (consulted by NB2/NB3; exported so tests don't hardcode)
  MAX_CONCURRENT,  // 5
  REGISTRY_VERSION,// 1
  KINDS,           // frozen Set
  PLAN_MUTATING_KINDS // frozen Set(['implement'])
}
```

### Module internals (top-to-bottom, mirroring store.js ordering)

```
'use strict';
const path   = require('path');
const safeFs = require('./safe-fs');      // sibling in src/lib/ (store.js uses ../safe-fs; NB1 is one level up)

// ── constants ──
const REGISTRY_VERSION    = 1;
const MAX_CONCURRENT      = 5;                                   // D5 named const
const MAX_LOG_ENTRIES     = 500;                                 // warn-log rotation (mirrors store.js)
const KINDS               = Object.freeze(new Set(['implement','plan','review','quality','security','decompose','discuss','sync']));
const PLAN_MUTATING_KINDS = Object.freeze(new Set(['implement']));   // D5: only implement serializes FIFO
const STATUSES            = Object.freeze(new Set(['queued','running','done','failed','orphaned']));
const TERMINAL            = Object.freeze(new Set(['done','failed','orphaned']));
const VALID_TRANSITIONS   = Object.freeze({
  queued:   new Set(['running','failed']),
  running:  new Set(['done','failed','orphaned']),
  done:     new Set(), failed: new Set(), orphaned: new Set()
});
const MUTABLE_FIELDS      = Object.freeze(['status','agentTaskId','result','label','touches','blockedBy','plan']); // updateTask whitelist (ts handled specially; id immutable)

// ── path + warn-log helpers ──
function registryPath(root)                 // path.join(root,'.ctoc','state','tasks.json')
function logPath(root)                       // path.join(root,'.ctoc','logs','task-registry.json')
function warnLog(root, event, detail)        // best-effort append+rotate; NEVER throws (store.js pattern)
function readWarnLog(root)                    // parse warn-log → [] fail-open

// ── persistence ──
function emptyRegistry()                      // { version: REGISTRY_VERSION, seq: 0, tasks: [] }
function normalizeLoadedTask(t)              // per-task validate/repair; throws → skip+warn on load
function load(root)                           // fail-open read
function save(root, registry)                 // atomic temp+rename; fail-loud

// ── model mutators ──
function findTask(registry, id)              // internal linear scan → task | undefined
function nowIso()                             // new Date().toISOString()  (Date is correct here — normal Node module)
function addTask(registry, spec)
function updateTask(registry, id, patch)

// ── scheduler (pure) ──
function isPlanMutating(task)                 // PLAN_MUTATING_KINDS.has(task.kind)
function isEditing(task)                      // Array.isArray(task.touches) && task.touches.length > 0
function runningTasks(registry, excludeId)   // tasks.filter(status==='running' && id!==excludeId)
function depsSatisfied(candidate, registry)  // every blockedBy id → a task with status==='done'
function evaluateConcurrency(candidate, running) // the 5-rule ladder (D5), running is an explicit array
function canRun(candidate, registry)
function nextRunnable(registry)
```

### Task shape (produced by `addTask`, per vision §3a)

```
{
  id:         't<seq>',            // monotonic; e.g. 't1','t2' (see DESIGN: id + seq)
  kind:       <one of KINDS>,      // validated
  label:      <string>,            // human label ('' default)
  plan:       <string|null>,       // plan slug/path or null
  status:     'queued',            // → running → done|failed|orphaned
  agentTaskId:null,                // harness Agent id, set at dispatch by NB3 via updateTask
  touches:    [<file glob>],       // copied array (default [])
  gitOp:      <bool>,              // strict-coerced (=== true)
  blockedBy:  [<task id>],         // copied array (default [])
  result:     null,                // { ok:boolean, summary:string } set on completion
  ts:         { created:<iso>, started:null, done:null }
}
```

### Kind taxonomy & plan-mutating set

| Kind | Meaning | Plan-mutating (serialize FIFO)? |
|---|---|---|
| `implement` | Iron Loop build (Step 10) | **yes** |
| `plan` | implementation-planner run | no |
| `review` | review agent | no |
| `quality` | quality checks | no |
| `security` | security scan | no |
| `decompose` | vision decomposition | no |
| `discuss` | interactive (async-with-documented-choices) | no |
| `sync` | git/sync operation | no |

Only `implement` is plan-mutating (D5, vision §3b: "candidate is plan-mutating
(`implement`)"). **"Edits files" and "is a git op" are data-driven, not
kind-derived**: `isEditing(t) = t.touches.length > 0`, and `gitOp` is an explicit
boolean field set by the caller (NB2/NB3). This keeps `canRun` a pure function of
the task **data**, so NB2/NB3 never need to teach the scheduler about new kinds —
they set `touches`/`gitOp` and (if a new kind must serialize) add it to
`PLAN_MUTATING_KINDS` (a one-line change).

## Step 6: DESIGN — persistence and scheduler semantics

### Persistence (locked decision D1)

- **Single file** `path.join(root, '.ctoc', 'state', 'tasks.json')`. The path is
  computed **inside** the module (callers pass only `root`), so the
  single-file-location invariant (AC "Only one registry file is used") cannot be
  violated by a caller. No per-task files ever.
- **On-disk shape** `{ version, seq, tasks: [] }`. This extends the vision's
  illustrative `{version, tasks:[]}` with a persisted monotonic `seq` (see *id +
  seq* below); the vision shape is illustrative, not exhaustive.
- **Lock-free (D1).** Unlike `store.js` — which takes an exclusive create-lock with
  an owner token + heartbeat + reload-under-lock because PI1 is multi-writer — NB1
  has **exactly one writer (Claude's single-threaded main loop)**, so writes
  serialize naturally and **no lock, owner token, heartbeat, or reload-under-lock
  is needed or present.** This is the intended structural divergence from the
  reference; the blueprint mirrors store.js's *atomic-write* and *fail-open-load*
  patterns but deliberately omits its *concurrency* machinery.
- **Atomic write (AC "Writes are atomic").** `save` writes a temp sibling in the
  same directory (same volume → atomic rename) then `renameSync` over the target;
  on any failure it unlinks the temp and rethrows — byte-for-byte the `atomicSave`
  in `store.js:367`. Temp name: `${target}.tmp-${process.pid}-${Date.now()}-${rand}`.
- **Fail-open LOAD vs fail-loud SAVE (the honest asymmetry).**
  - `load` **never throws** (protects the NAV plane, vision Success Criterion 5 +
    AC "Corrupt registry fails open"): absent file → `emptyRegistry()`; unparseable
    / wrong top-level shape / version mismatch → `emptyRegistry()` + a **recorded
    warn** (`registry_load_failed`) — the warning is *surfaced, not swallowed* (AC).
    A well-formed file with an individually-malformed task entry → that entry is
    **skipped + warned** (`task_skipped_malformed`), the rest load (per-task
    fail-open, mirroring store.js's per-unit skip).
  - `save` **fails loud** (rethrows after unlinking the temp): a persistent write
    failure (disk full, read-only fs) must never be *silently lost* — that is the
    exact "results silently lost" failure the vision forbids (§8 risks, Success
    Criterion 5). Only WORK turns call `save`; the NAV plane never does, so
    surfacing a write failure never bricks navigation.
- **Directory creation.** `save` calls `safeFs.mkdirSync(dir, { recursive: true })`
  before writing (a write failure here is part of the fail-loud path).
- **Warn log.** `path.join(root,'.ctoc','logs','task-registry.json')`, append +
  rotate at `MAX_LOG_ENTRIES`, best-effort (a broken log never breaks the store) —
  mirrors `store.js:warnLog`. `readWarnLog(root)` exposes it for the NB2 dashboard
  and for tests.
- **id + seq (uniqueness + monotonicity).** The registry carries a persisted,
  never-decremented counter `seq`; `addTask` does `id = 't' + (++registry.seq)`.
  This guarantees ids are unique **and** strictly monotonic even across pruning
  (no id reuse), and survives reload. On `load`, `seq` is repaired defensively:
  `seq = max(fileSeq≥0 ? fileSeq : 0, highest numeric suffix among loaded ids)` so
  a legacy/absent `seq` can never collide with an existing id. FIFO ordering is the
  `tasks` **array insertion order** (which equals `seq` order because `addTask`
  appends) — **not** timestamps — so scheduling is immune to clock skew.
- **Cross-platform.** `path.join` everywhere; temp/rename via safe-fs; no `os`, no
  native deps, no bash. JSON is plain (no Float32Array/base64 encoding needed).

### Scheduler — `canRun(candidate, registry) → { run, reason }`

A dependency gate precedes the D5 concurrency ladder; the **five D5 rules are
preserved verbatim and in the exact given order** (order is load-bearing). The
first failing rule's `reason` is returned.

```
Rule 0 (dependency gate)  — uses REAL registry statuses:
  if any id in candidate.blockedBy does not resolve to a task with status === 'done'
     → { run:false, reason:'blocked-dep' }
  (a missing/failed/orphaned/queued/running dependency does NOT satisfy — see below)

let running = tasks with status==='running' AND id !== candidate.id   // self-excluded

Rule 1  running.length >= MAX_CONCURRENT (5)                    → { false, 'max-concurrent' }
Rule 2  isPlanMutating(candidate) && running.some(isPlanMutating)→ { false, 'plan-serial' }   // FIFO plan-serial
Rule 3  (candidate.gitOp && running.some(t => isEditing(t) || t.gitOp))                          // git-exclusive:
        || (isEditing(candidate) && running.some(t => t.gitOp))  → { false, 'git-exclusive' }  // git blocks edit-OR-git; both directions
Rule 4  candidate.touches ∩ union(running[].touches) ≠ ∅        → { false, 'file-conflict' }
Rule 5  otherwise                                                → { true,  'ok' }
```

- **Reason vocabulary (6):** `blocked-dep`, `max-concurrent`, `plan-serial`,
  `git-exclusive`, `file-conflict`, `ok`.
- **blockedBy semantics (D5 + edge cases).** Only a dependency in status `done`
  satisfies. A dep that is `failed`, `orphaned`, `queued`, `running`, or **absent
  from the registry** leaves the candidate blocked (`blocked-dep`). This is the
  safety-first choice: never run a task whose declared prerequisite did not
  *complete successfully*. A dead reference (dep pruned/never-completes) is a
  *visible* blocked task that **NB4** (reconciliation/repair/re-run offers) owns —
  NB1 must not silently run past an unconfirmed prerequisite.
- **Self-exclusion.** `running` excludes the candidate by `id`, so `canRun` is
  idempotent whether or not the candidate already lives in `registry.tasks` (a task
  never conflicts with itself).
- **gitOp+implement precedence (edge case).** A candidate that is both `gitOp` and
  `implement` walks the ladder in order: with a running `implement` it returns
  `plan-serial` (Rule 2 before Rule 3); with a running non-implement editing task
  and no running implement it returns `git-exclusive` (Rule 3); alone → `ok`.
- **git-vs-git IS blocked (Gate-2 decision, 2026-07-01).** Rule 3 was strengthened:
  a `gitOp` candidate is blocked by any running **editing-OR-git** task (`isEditing(t)
  || t.gitOp`), and an editing candidate is blocked by any running `gitOp`. So two
  `gitOp` tasks never run concurrently (git index-lock / interleaved-commit safety),
  while **read-only** tasks (empty `touches`, not `gitOp`) may still run alongside a
  git task. This is the simplest correct rule and matches the "run git solo" project
  memory — no `touches`-sentinel hack needed. A test (ST-14b) pins git-vs-git.

`canRun` is implemented as `depsSatisfied ? evaluateConcurrency(candidate,
runningTasks(registry, candidate.id)) : { run:false, reason:'blocked-dep' }`, where
`evaluateConcurrency` is the single home of Rules 1–5 (DRY — reused by
`nextRunnable`).

### Scheduler — `nextRunnable(registry) → task[]`

FIFO, dependency-aware, **greedy with a cumulative projected-running set** so the
returned set is *jointly* startable — starting all of them at once never violates
≤5, plan-serial, git-exclusive, or file-conflict.

```
projected = registry.tasks.filter(t => t.status === 'running').slice()   // seed with real running
result = []
for (const cand of registry.tasks.filter(t => t.status === 'queued')) {  // ARRAY ORDER == FIFO
  if (!depsSatisfied(cand, registry)) continue                            // deps vs REAL statuses (done-only)
  const dec = evaluateConcurrency(cand, projected.filter(t => t.id !== cand.id))  // vs PROJECTED running
  if (dec.run) {
    result.push(cand)
    projected.push({ ...cand, status: 'running' })   // now occupies a slot + contributes touches/gitOp/plan-mutating
  }
}
return result
```

- **Why deps use REAL statuses, ladder uses PROJECTED:** a tentatively-accepted
  task is *running*, not *done*, so it cannot satisfy another task's `blockedBy` in
  the same pass. Hence a task `blockedBy` a task accepted earlier in the same pass
  is **not** returned — you cannot start B before A finishes. This is exactly the
  "completion unblocks" contract: `nextRunnable` is called *after* a completion sets
  A → `done`, and only then does B become returnable.
- **Cumulative correctness guarantee:** because each accepted candidate is folded
  into `projected` before the next is evaluated, the returned set satisfies every
  rule *as a whole*. E.g. 3 running + 5 disjoint queued → returns exactly the FIFO
  first 2 (fills to MAX_CONCURRENT); q1/q2 both touch `a.js` → returns q1 only;
  two queued `implement` → returns the FIFO-first only (plan-serial); a queued
  editor + a queued gitOp → returns the FIFO-first only (git-exclusive).
- **Greedy, not optimal (intentional).** FIFO fairness is preferred over maximal
  slot packing (vision: plan builds are strictly FIFO). A greedy FIFO pass can
  leave a slot idle behind a blocked head-of-line task; that is the correct,
  documented trade-off, not a bug.

## Step 7: SPEC — signatures and behavior

Concrete enough that Step 10 never guesses (no-stub). Every field/branch specified.

### `load(root) → registry`
- Throws `TypeError` if `root` is not a non-empty string (caller bug — before any I/O).
- Absent file → `emptyRegistry()` (no warn — a first run is normal).
- Reads via `safeFs.readFileSync(p, 'utf8')`, `JSON.parse`.
- Rejects (→ `emptyRegistry()` + `warnLog('registry_load_failed', {message})`) when:
  parse throws; result is not a plain object; `data.tasks` is not an array; or
  `data.version !== REGISTRY_VERSION`.
- For each entry in `data.tasks`: `normalizeLoadedTask` — validates `id` (non-empty
  string), `kind` (∈ KINDS), `status` (∈ STATUSES), coerces `touches`/`blockedBy`
  to string arrays, `gitOp` to bool, ensures `ts` object with `created`. On any
  per-task failure → skip that task + `warnLog('task_skipped_malformed', {...})`,
  keep the rest. Deduplicates by `id` (last wins, warn on collision).
- Repairs `seq` (see DESIGN). Returns the registry value. **Never throws on
  file/data problems.**

### `save(root, registry) → void`
- Throws `TypeError` on non-string `root` / non-object `registry` (caller bug).
- `safeFs.mkdirSync(dir, { recursive:true })`; `payload = JSON.stringify({version,
  seq, tasks}, null, 2)`; `safeFs.writeFileSync(tmp, payload)`;
  `safeFs.renameSync(tmp, target)`.
- On any failure: `try safeFs.unlinkSync(tmp)` (ignore its error) →
  `warnLog('registry_save_failed', {message})` → **rethrow**.

### `addTask(registry, spec) → task`
- `spec` must be an object → else `TypeError`.
- `spec.kind` must be a string ∈ `KINDS` → else `Error` (catches typos; safety-relevant).
- `spec.touches`, if present, must be an array → else `Error` (a bare string `'a.js'`
  vs `['a.js']` would silently break file-conflict detection; fail loud). Default `[]`.
- `spec.blockedBy`, if present, must be an array → else `Error`. Default `[]`.
- `spec.gitOp` strict-coerced: `gitOp: spec.gitOp === true`. Default `false`.
- `spec.label` → `String(spec.label ?? '')`; `spec.plan` → `spec.plan ?? null`.
- Builds the task from **named fields** (never spreads `spec` → no prototype
  pollution), `id='t'+(++registry.seq)`, `status:'queued'`, `agentTaskId:null`,
  `result:null`, `ts:{created:nowIso(),started:null,done:null}`; `push` onto
  `registry.tasks`; returns the created task object.

### `updateTask(registry, id, patch) → task`
- `findTask(registry, id)` → if none, `throw Error('task-registry: updateTask
  unknown id ' + id)` (single-writer ⇒ a miss is a caller bug; fail loud).
- `patch.id` present and `!== id` → `Error` (id immutable).
- If `patch.status` present: must be ∈ STATUSES (else `Error`). If it differs from
  the current status it must be in `VALID_TRANSITIONS[current]` (else
  `Error('invalid transition <current> → <target>')`); transitioning **out of a
  TERMINAL state throws**. Same-status is an allowed no-op (no ts change).
  - Auto-stamp: `→running` sets `ts.started = nowIso()`; `→done|failed|orphaned`
    sets `ts.done = nowIso()` — unless the patch supplies that ts explicitly.
- Applies only `MUTABLE_FIELDS` from `patch` (whitelist merge → prevents
  prototype-pollution and enforces id immutability structurally); merges nested
  `patch.ts` if present. Returns the updated task.

### `canRun(candidate, registry) → { run, reason }` / `nextRunnable(registry) → task[]`
As fully specified in Step 6. Both pure (no I/O, no mutation of inputs;
`nextRunnable` builds its own `projected` array and returns references to the
queued task objects it selected).

### Test Plan — `tests/task-registry.test.js`

`node:test` + `node:assert/strict`; each test builds an **isolated tmp root** via
`fs.mkdtempSync(path.join(os.tmpdir(),'ctoc-tasks-'))` and `fs.rmSync(dir,
{recursive,force})` after (raw `fs`/`os` are permitted in `tests/**` — eslint
exempts the fs rule there). Scheduler tests use **in-memory registry literals** (no
disk). ST-24 uses genuine **fault injection** at the safe-fs boundary (stub
`safeFs.renameSync` to throw) — the sanctioned pattern (PI1 ST-17), not mocking the
code under test. Coverage measured with `node --test --experimental-test-coverage`;
target ≥80% line+branch on the new module (every `throw`/`catch`/rule branch
exercised).

**AC → test mapping (14/14 BDD scenarios mapped; + 11 edge tests = 25 named tests):**

| # | BDD scenario (from Acceptance Criteria) | Test |
|---|---|---|
| 1 | First load with no registry file | ST-01 |
| 2 | A queued task round-trips through disk | ST-02 |
| 3 | Only one registry file is used | ST-03 |
| 4 | Writes are atomic | ST-04 |
| 5 | Corrupt registry fails open | ST-05 |
| 6 | Max concurrency reached | ST-06 |
| 7 | Plan-mutating implement serializes FIFO | ST-07 |
| 8 | File-conflict serialization | ST-08 |
| 9 | Disjoint file sets may run concurrently | ST-09 |
| 10 | Git operation mutually exclusive with editing (both directions) | ST-10 |
| 11 | Eligible candidate runs | ST-11 |
| 12 | Completion unblocks dependent queued tasks | ST-12 |
| 13 | Nothing eligible yet | ST-13 |
| 14 | Satisfied dependency no longer blocks | ST-14 |

**Edge / implied tests (no-stub coverage of the boundaries the ACs imply):**

| Test | Behavior asserted |
|---|---|
| ST-15 | id uniqueness + strict monotonicity across many `addTask`; `seq` persists across save/load; **no id reuse** after reload |
| ST-16 | status-transition validity: `queued→running→done`, `queued→running→failed`, `running→orphaned` succeed; `queued→done`, `done→running`, out-of-terminal, unknown status all throw |
| ST-17 | empty-registry `canRun` → `{true,'ok'}`; a lone candidate is not self-blocked on its own touches |
| ST-18 | gitOp+implement precedence: `plan-serial` vs running implement; `git-exclusive` vs running editor; `ok` alone |
| ST-19 | `blockedBy` a `failed` dep, and a `missing` dep id → `{false,'blocked-dep'}` from `canRun` and excluded by `nextRunnable` |
| ST-20 | timestamps: `ts.created` ISO non-null on add (`started`/`done` null); `→running` sets `started`; `→done` sets `done`; `created ≤ started ≤ done` |
| ST-21 | greedy cumulative `nextRunnable`: fill-to-cap (3 running + 5 disjoint queued → first 2); file-cumulative (q1,q2 both touch a.js → q1 only); plan-serial-cumulative (two implement → first only); git-cumulative (editor + gitOp → first only) |
| ST-22 | `updateTask` unknown id throws |
| ST-23 | `addTask` validation: unknown kind throws; non-array touches throws; non-array blockedBy throws; `gitOp` coerced to bool; defaults applied |
| ST-24 | `save` failure path (fault-injected rename): temp sibling cleaned up, target file left intact/complete, error rethrown, `registry_save_failed` warned |
| ST-25 | per-task fail-open on load: a well-formed file with one malformed task entry → good tasks load, bad one skipped + `task_skipped_malformed` warned |

## Dependency Graph

```
src/lib/task-registry.js  ──requires──▶  src/lib/safe-fs.js   (existing LH1 choke point)
src/lib/task-registry.js  ──requires──▶  node:path            (builtin)
tests/task-registry.test.js ──requires──▶ src/lib/task-registry.js  (unit under test)
tests/task-registry.test.js ──requires──▶ node:test, node:assert/strict, fs, path, os  (test-only)

Consumers (NOT built here): NB2 menu.js, NB3 protocol, NB4 reconciliation.
No cycles. No orphans (test file consumes the module). No layer violations (lib→lib only).
```

## Implementation Order

1. `tests/task-registry.test.js` (CREATE) — write ST-01…ST-25 RED first (TDD; Iron Loop Step 8).
2. `src/lib/task-registry.js` (CREATE) — implement to green (Iron Loop Step 10); the module
   must be importable and depends only on existing `safe-fs`.

## Security Review

- [x] **Path traversal** — path computed from trusted `root` via `path.join`; safe-fs
  validates non-empty / no-NUL. No caller-supplied absolute paths.
- [x] **Prototype pollution** — `addTask` builds tasks from named fields (no `spec`
  spread); `updateTask` merges a `MUTABLE_FIELDS` whitelist (never blind
  `Object.assign` of untrusted keys); `JSON.parse` of `tasks.json` does not pollute
  the prototype (own `__proto__` key only).
- [x] **Input validation** — every public entry type-checks and fails closed/loud
  before mutating; load fails open per-file/per-task.
- [x] **No `new RegExp` on non-literals** — module uses **no regex at all** (numeric
  id parsing via `Number`/`startsWith`), so `detect-non-literal-regexp` /
  `detect-unsafe-regex` (error in `src/`) cannot fire.
- [x] **Safe file ops** — all I/O via `safe-fs`; writes target only
  `.ctoc/state` / `.ctoc/logs`; atomic temp+rename; no `exec`/`child_process`.
- [x] **Error messages** — reference ids/paths only, no secrets or stack leakage.
- [x] **DoS/unbounded growth** — warn log rotates at `MAX_LOG_ENTRIES`.

## Risks

| Risk | Mitigation | Where |
|---|---|---|
| Version bump wipes real (non-rebuildable) queued tasks on `load` | v1 is the only shipping version → never triggers now; **flag: add `migrateRegistry` before shipping v2** (NB4/future). Fail-open-empty + warn is the interim. | `load` version check |
| git-vs-git not serialized by Rule 3 (spec is git-vs-editing) | Documented decision; recommend NB2/NB3 give git tasks a `touches` sentinel so Rule 4 covers it; confirm at Gate 2. | `evaluateConcurrency` Rule 3 |
| Clock skew reorders `ts.created` | FIFO uses array/`seq` order, not timestamps → scheduling unaffected. | `nextRunnable`, id/seq |
| Greedy FIFO leaves a slot idle behind a blocked head | Intentional (FIFO fairness > packing, per vision); documented, not a defect. | `nextRunnable` |
| Registry/harness drift (records ≠ real agent state) | Out of NB1 scope; NB1 provides the pure model NB4 reconciles against. | — |

## Rollback

Trivial. Two brand-new files, zero existing references (NB2–NB4 not built). Rollback
= delete `src/lib/task-registry.js` + `tests/task-registry.test.js` (and, optionally,
the runtime artifact `.ctoc/state/tasks.json`, which is gitignored state). No
migrations, no schema/contract changes to existing modules.

## Dependencies

- Runtime: `node:path` (builtin) + `src/lib/safe-fs.js` (existing). **Zero** new npm
  deps, **zero** native deps (`package.json` has no `dependencies`; unchanged).
- Test: `node:test`, `node:assert/strict`, `fs`, `path`, `os` (all builtin/test-only).

## Decisions Taken Under Ambiguity

1. **Data-oriented functional API over a store-handle** — chosen because NB1 is
   lock-free single-writer (D1), so the closure/lock machinery that justifies
   `store.js`'s handle has no payload here; a plain-value API makes the pure
   scheduler trivially testable. (Step 5.)
2. **Persisted monotonic `seq` for ids (`t<seq>`)** — guarantees uniqueness +
   monotonicity across pruning/reload (vs deriving from `max(existing ids)`, which
   reuses ids after deletion). Extends the vision's `{version,tasks:[]}` to
   `{version,seq,tasks:[]}`. (Step 6.)
3. **Dependency gate as `canRun` Rule 0 (`blocked-dep`), D5 ladder preserved as
   Rules 1–5** — makes `canRun` the *complete* runnability oracle NB3's add-flow
   needs (a dep-blocked task must "queue", not "run"), without altering the exact
   given 5-rule concurrency ladder or its order. (Step 6.)
4. **`done` is the ONLY status that satisfies `blockedBy`; `failed`/`orphaned`/
   `missing` dep → stays blocked** — safety-first; repair of dead references is
   NB4's job. (Step 6, edge ST-19.)
5. **Greedy FIFO `nextRunnable` with a cumulative projected-running set** — deps
   evaluated vs real statuses, concurrency vs projected; returns a jointly-startable
   set; FIFO fairness over optimal packing. (Step 6, edge ST-21.)
6. **Kind taxonomy `implement|plan|review|quality|security|decompose|discuss|sync`;
   only `implement` plan-mutating** — matches vision enumeration; "editing" and
   "gitOp" stay data-driven (`touches`/`gitOp` fields), not kind-derived. (Step 5.)
7. **LOAD fails open (never throws) but SAVE fails loud (rethrows)** — honors both
   halves of the vision: corrupt registry never bricks navigation, yet a real write
   failure is never silently lost. (Step 6.)
8. **`Date`/`toISOString()` for timestamps** — correct and idiomatic in a normal
   Node module (unlike deterministic-replay Workflow scripts where `Date` is
   banned); and scheduling never depends on `ts` (uses `seq`/array order), so clock
   behavior cannot affect correctness. (Step 6.)
9. **git-vs-git left un-serialized (literal D5 ladder)** — flagged for Gate 2;
   recommended sentinel-`touches` convention noted. (Step 6, Risks.)
10. **`updateTask` on unknown id throws** — single-writer ⇒ a miss is a caller bug,
    fail loud (not a silent no-op). (Step 7.)

---

## Execution Plan

> Iron Loop Phase 3. Sequential. Labels are the canonical set enforced by
> `src/lib/plan-validator.js` and `src/hooks/validate-plan-steps.js`.
> **Gate 2** (implementation → todo, human-approved) precedes Step 8; **Gate 3**
> (review → done, human-approved) follows Step 16.

### Step 8: TEST
- [ ] Write `tests/task-registry.test.js` with ST-01…ST-25 (see Test Plan) — RED first (TDD).
- [ ] Every test has ≥1 meaningful assertion; error paths (`throw`) and every scheduler rule branch are covered.
- [ ] Isolated tmp root per test (`fs.mkdtempSync`); no order-dependent state.

### Step 9: PREPARE
- [ ] Confirm `src/lib/safe-fs.js` is present; no new deps to install.
- [ ] Confirm `node --test tests/*.test.js` discovers the new file. `save` creates `.ctoc/state` at runtime — no scaffolding needed.

### Step 10: IMPLEMENT
- [ ] Create `src/lib/task-registry.js` per Steps 5–7 (one step; sub-items = the module-internals functions).
- [ ] All I/O via `safeFs`; no raw `fs`; no regex; no native deps; `path.join` throughout.
- [ ] Record any further ambiguity in `## Decisions Taken Under Ambiguity` — never a stub or placeholder.

### Step 11: REVIEW
- [ ] Self-review: lib→lib deps only; single responsibility (model + persistence + scheduler, no UX/dispatch).
- [ ] Named-field construction (no `spec` spread); `updateTask` whitelist merge; D5 ladder order matches the spec exactly.

### Step 12: OPTIMIZE
- [ ] Confirm `evaluateConcurrency` is the single home of Rules 1–5 (no duplication between `canRun` and `nextRunnable`).
- [ ] Linear scans are right-sized for a small task set (no premature indexing).

### Step 13: SECURE
- [ ] Run the Security Review checklist above.
- [ ] `npm run lint` passes at `--max-warnings 0` (no raw-fs / non-literal-regexp escapes in `src/`).

### Step 14: VERIFY
- [ ] `npm run lint` (0 warnings) and `npm run typecheck` (tsc --noEmit clean).
- [ ] `node --test tests/*.test.js` shows `# fail 0`; coverage ≥80% (0 skips, 0 flaky) via `node --test --experimental-test-coverage`.
- [ ] All 14 BDD scenarios green.

### Step 15: DOCUMENT
- [ ] JSDoc on every exported function (params/returns/throws).
- [ ] Top-of-file banner mirroring `store.js`: purpose, D1 lock-free rationale, fail-open/fail-loud asymmetry, safe-fs/LH1 note.

### Step 16: FINAL-REVIEW
- [ ] implementation-reviewer verifies the 14 quality dimensions, AC→test mapping (14/14), and Decisions Taken Under Ambiguity.
- [ ] Route to **Gate 3** — human approves the result.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review

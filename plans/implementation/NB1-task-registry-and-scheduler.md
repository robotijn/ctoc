---
approved_by: human
approved_at: 2026-07-01T17:32:13.348Z
gate_crossed: functional → implementation
---

---
title: "NB1 — Task Registry and Scheduler"
type: functional
status: functional
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

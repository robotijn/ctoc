---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T14:00:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's explicit 2026-07-14 order "fix them all, do 50
  rounds of hard critique, keep fixing the code" against the Round-1 critic
  findings. The person ordering the fixes IS the approval.
---

---
title: "R2-A — Scheduler lifecycle honesty: settled barriers, cancelling state, kind-aware staleness, cycle surfacing"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/task-registry.js"
  - "src/lib/task-reconcile.js"
  - "tests/task-registry.test.js"
  - "tests/task-reconcile.test.js"
---

# R2-A — Scheduler lifecycle honesty

Fixes critic findings C1-1 (CRITICAL barrier deadlock), C1-2 registry side
(CRITICAL cancel frees touches under a live agent), C1-5 (HIGH false orphaning),
C1-7 (MEDIUM silent cycles).

## Implementation Details

1. **Settled barrier (C1-1).** `depsSatisfied` becomes kind-aware: for a
   `sync` candidate, a dep satisfies when its status is TERMINAL (done, failed,
   cancelled, orphaned) — a barrier waits for the wave to SETTLE, not to
   succeed; the sync run's job includes reporting failures. Non-sync candidates
   keep done-only. A MISSING dep id never satisfies either.
2. **Unsatisfiable detection (C1-1/C1-7).** New pure export
   `unsatisfiableTasks(registry)` → array of `{ task, reason }` for queued
   tasks that can NEVER run: a non-sync task with a dep that is terminal-non-
   done or missing (`reason: 'dep-failed'` / `'dep-missing'`), and any queued
   task inside a blockedBy cycle (`reason: 'dep-cycle'`; iterative DFS, no
   recursion). `task-reconcile.reconcile` consumes it: marks each such task
   `failed` with `result: { ok:false, summary: <reason + dep ids> }` and pushes
   a report entry so the caller surfaces it to the inbox — silent-forever is
   the defect; every wedge becomes a loud event.
3. **`cancelling` status (C1-2).** New NON-terminal status: transitions
   `running → cancelling`, `cancelling → cancelled | done | failed`. A
   `cancelling` task COUNTS AS RUNNING for all concurrency rules (occupies its
   slot, its touches, gitOp, sync barrier) — files stay locked until the agent
   is confirmed gone. `queued → cancelled` stays immediate. Reconcile treats
   `cancelling` like `running` for liveness: live-id present → stays; confirmed
   absent (TaskList present, no match, not young) → `cancelled` (ts.done
   stamped); staleness backstop applies as in 4. `cancelling → done` exists so
   a completion arriving during cancellation is recorded honestly (result kept,
   status done, report notes it finished despite cancel).
4. **Kind-aware staleness + late completion (C1-5).** The staleness backstop
   (TaskList unavailable) becomes kind-aware: implement/sync default 120
   minutes (new option `staleThresholdMsByKind` with that default), others keep
   30. Every staleness-based orphaning pushes a LOUD report entry (existing
   report.orphaned stays; add `report.stalenessOrphaned` detail with age) so
   the inbox can say "orphaned on staleness alone — may still be alive".
   Allow `orphaned → done` and `orphaned → failed` transitions: a falsely
   orphaned agent that finishes gets its completion ACCEPTED, not dropped
   (update VALID_TRANSITIONS; ts.done re-stamps).
5. Update the module header ladder/status documentation to describe all of the
   above truthfully.

### Wiring — the live call sites (MANDATORY)

| export | live call site | root |
|---|---|---|
| kind-aware depsSatisfied | existing canRun/nextRunnable callers | /ctoc:menu |
| unsatisfiableTasks | task-reconcile.reconcile (this slice) → reconcileState → menu open | /ctoc:menu |
| cancelling transitions | actions.cancelTask (slice R2-B, same wave commit) + reconcile (this slice) | /ctoc:menu |
| kind staleness + late transitions | task-reconcile (this slice) | /ctoc:menu |

### Test Plan (TDD-Red first)
task-registry.test.js: sync candidate with one failed + rest done deps →
runnable; with one still-running dep → blocked; non-sync with failed dep →
still blocked-dep. cancelling occupies slot/touches/gitOp (canRun sees
file-conflict against a cancelling task); running→cancelling→cancelled path;
cancelling→done keeps result; queued→cancelled immediate; orphaned→done
accepted. unsatisfiableTasks: dep-failed, dep-missing, two-task cycle,
self-cycle, sync excluded when deps merely failed (settled ≠ unsatisfiable).
task-reconcile.test.js: reconcile fails unsatisfiable queued tasks + reports;
implement task 45 min old with TaskList unavailable NOT orphaned (120-min
floor), 130 min → orphaned + stalenessOrphaned detail; cancelling task with
live id stays, confirmed-absent → cancelled.

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the tests above, run ONLY these two files, record red.
### Step 9: PREPARE — re-read both modules in full from disk first.
### Step 10: IMPLEMENT — changes 1–5; wire reconcile consumption.
### Step 11: REVIEW — diff vs plan; header truthful; no stale comments.
### Step 12: OPTIMIZE — DFS iterative, O(V+E); no speculative caching.
### Step 13: SECURE — no regex in task-registry; safe-fs only; no spec spread.
### Step 14: VERIFY — node --test on the two files + eslint on all four; no git.
### Step 15: DOCUMENT — JSDoc on every changed export.
### Step 16: FINAL-REVIEW — report files/tests/red-evidence/decisions.

## Decisions Taken Under Ambiguity
(Executor fills in.)

---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T18:15:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's explicit 2026-07-14 orders "fix them all, do 50
  rounds of hard critique, keep fixing the code" and "fix everything", against
  the Round-5 concurrency critic's findings. Two CRITICALs verified by the
  coordinator's own read: menu-screens taskTransition('start') applies
  {status:'running'} with NO canRun call; completeExecution's find() returns the
  EARLIEST non-terminal task (a queued duplicate shadows the running one).
---

---
title: "R3-B — The scheduler ENFORCES: guarded start, no duplicate tasks, live-list honesty, cross-process safety"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00011-r2z-boundary-typecheck-zero
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/task-registry.js"
  - "src/lib/task-reconcile.js"
  - "src/lib/menu-screens.js"
  - "src/commands/menu.js"
  - "src/lib/actions.js"
  - "tests/task-registry.test.js"
  - "tests/task-reconcile.test.js"
  - "tests/menu-task-wiring.test.js"
  - "tests/menu-protocol.test.js"
  - "tests/actions-scheduler.test.js"
  - "tests/scheduler-enforced.test.js"
---

# R3-B — A rule nothing checks is not a rule

The R2 wave built a correct concurrency ladder and then left the door
unlocked. Verified on disk:

- **C1 (CRITICAL).** `menu-screens.js taskTransition('start')` sets
  `{status:'running'}` after only a terminal check. `canRun` is NEVER called.
  Rules 0–4 (deps, ≤5, sync barrier, git-exclusive, file-conflict) are all
  bypassable in one CLI call. `computePromote`'s "ONLY sanctioned promotion
  source" is a comment addressed to a language model — enforcement by hope.
- **C2 (CRITICAL).** `startAgent`/`advanceAgent` never check for an existing
  non-terminal task for the same plan before `addAndClaim`. A ladder-refused
  head plan keeps its queued task AND gets a new one on every call. Then
  `completeExecution`'s `find()` returns the EARLIEST non-terminal match (the
  queued duplicate), so the RUNNING task is never marked done → two hours of
  dead occupancy, then the duplicate re-runs a plan already in review.

## Implementation Details

1. **Guarded start (C1).** `taskTransition('start')` calls
   `taskRegistry.canRun(task, reg)` and REFUSES with `{ok:false, reason}` when
   the ladder says no. Add `--force` (human override, logged loudly in the
   result text) — never the default. Same guard for any other path that sets
   `running` (grep for `status: 'running'` across src/ and route each through
   canRun or document why it is exempt).
2. **One non-terminal task per plan (C2).** In `taskSpecFromPlan` (or a shared
   guard both walkers call): if a non-terminal `implement` task already exists
   for `plan.name`, DO NOT add another — return that task with its current
   state (`{ existing: true, task }`) so the caller reports "already queued
   (reason)" instead of duplicating. Add the same invariant to `addTask`
   itself? NO — addTask is registry-level and takes no plan-uniqueness
   responsibility today; enforce at the action layer AND assert the invariant
   in the ladder-refusal path's tests. If you find a cleaner choke point while
   reading, take it and document why.
3. **Ladder-refused heads do not stall the walk (C2 side effect).** The
   skip-and-surface walk currently continues only on a spec REFUSAL. A ladder
   refusal (file-conflict/max-concurrent) must also let the walker try the next
   todo plan (a disjoint plan behind a conflicted head must still start), while
   the refused plan keeps its single queued task. Report both in the return
   (`queued[]` alongside `skipped[]`).
4. **Late completion actually works (H1).** `menu-screens.js TASK_TERMINAL`
   is a STALE MIRROR (`['done','failed','orphaned']` — includes orphaned,
   omits cancelled) that rejects `orphaned → done` before `updateTask` ever
   sees it, making R2-A's late-completion contract dead code. Replace the
   mirror with the registry's own exported terminal set (export `TERMINAL`
   from task-registry.js and import it — ONE encoding, no mirror).
   `completeExecution` must accept `running | cancelling | orphaned` (orphaned
   → done: a falsely-orphaned agent that finishes is recorded, not dropped).
5. **Live-list honesty (H2).** `menu.js extractLiveAgentIds`: a present-but-
   empty `--live-agent-ids` maps to `undefined` (unavailable), NOT `[]`
   (authoritative empty) — today an empty flag mass-orphans every live agent
   and refills their slots in the same render. AND in `reconcile`: a running
   task with `agentTaskId == null` falls to the staleness backstop even when a
   live list IS present (absence of a recorded id is not evidence of death) —
   this closes the window between `startAgent`'s claim (which sets
   `agentTaskId: null`) and the `menu task start --agent-id` patch.
   Better: make `addAndClaim` accept an `agentTaskId` so the claim records it
   at birth; wire startAgent/advanceAgent to pass the harness id when known.
6. **Stale sweep stops eating live plans (H3).** `cleanupStaleInProgress` has
   NO age and NO liveness criterion — every `startAgent` sweeps EVERY
   in-progress plan, and under the file-based wave model startAgent is called
   once per wave member WHILE others are mid-flight. A plan whose executor has
   finished its edits but not yet called completeExecution passes
   `validateForReview` and gets moved out from under its own agent. Fix: skip
   any in-progress plan that has a non-terminal implement task in the registry;
   keep an age threshold as the backstop for genuinely orphaned plans.
7. **Cross-process safety (H4).** `task-registry.save` is atomic per write but
   every mutation is an unlocked load→mutate→save; concurrent writers DO exist
   (TUI process + session child processes). Add a compare-and-swap: the
   registry carries a `generation` counter; `save` refuses (throws
   `StaleRegistryError`) when the on-disk generation moved since load; add a
   `withRegistry(root, mutator)` helper that loads → mutates → saves →
   retries on conflict (bounded, e.g. 5 attempts). Route EVERY load→save
   caller in actions.js / menu-screens.js / task-reconcile.js through it.
   The version bump is backward compatible (absent generation = 0).
8. **Quarantine staleness-freed files for one pass (M1).** A task orphaned on
   AGE alone (no live confirmation) may still be alive — its touches must NOT
   be handed to a conflicting queued task in the same reconcile return.
   Exclude this-pass `stalenessOrphaned` touches from the `promote`
   projection, and say so in the report entry.
9. **Retention never severs a live edge (M2).** The 7-day terminal sweep must
   skip any terminal task still referenced by a queued task's `blockedBy` —
   otherwise the next pass fails the dependent as `dep-missing` even though
   its dependency SUCCEEDED.
10. **Cancelling has a deadline (M3).** Stamp `ts.cancelRequested`; past a
    deadline (default 30 min, kind-aware option) reconcile forces
    `cancelling → cancelled` with a loud `stalenessCancelled` report entry.
    Add `menu task cancel --force` for the human. Today a hung-but-live agent
    holds its files, a slot, AND (via the sync barrier) blocks EVERY wave
    integration globally, forever, with no tie-breaker.
11. **Silent coupling failure logged (M5).** `completeExecution`'s no-match
    path logs loudly (it is currently fully silent — a running task occupies
    for 2 hours with zero trace linking it to the completed plan).
12. **Sync barrier integrity at the choke point (L1).** `addTask` enforces
    non-empty `blockedBy` for `kind === 'sync'` (the empty-barrier refusal
    currently lives only in `enqueueWaveSync`; `menu task add sync` bypasses
    it). Cancel-on-already-cancelled returns an honest refusal (L2).

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| guarded start | menu task start route (this slice) | /ctoc:menu |
| plan-uniqueness | startAgent/advanceAgent (this slice) | /ctoc:menu |
| TERMINAL export | menu-screens imports it (this slice) | /ctoc:menu |
| live-id honesty | menu.js flag parse + reconcile (this slice) | /ctoc:menu |
| sweep liveness | cleanupStaleInProgress (this slice) | /ctoc:menu |
| withRegistry CAS | every registry mutator (this slice) | /ctoc:menu |
| quarantine/retention/deadline | reconcile (this slice) | /ctoc:menu |

### Test Plan (TDD-Red first) — new tests/scheduler-enforced.test.js
THE ENFORCEMENT TEST: `menu task start <id>` on a task the ladder refuses
(file-conflict; 6th concurrent; sync running; unmet dep) → REFUSED, registry
unchanged; with `--force` → allowed + flagged. Duplicate guard: two
startAgent calls on a ladder-refused head → ONE queued task, not two;
completeExecution then marks the RIGHT task done (seed a queued duplicate +
a running task; assert the RUNNING one settles). Ladder-refused head + disjoint
second plan → second plan claims. Late completion: orphaned task + `menu task
complete` → done (contract alive). Empty `--live-agent-ids` → treated as
unavailable (no mass orphan). Null agentTaskId + live list present → staleness
backstop, not orphaned. cleanupStaleInProgress skips a plan with a running
task. CAS: two loaded registries, one saves, the second's save throws Stale;
withRegistry retries and both mutations survive. Staleness-orphan quarantine:
conflicting queued task NOT promoted in the same pass. Retention skips a
referenced terminal task. Cancelling deadline → forced cancelled + report.
Empty-blockedBy sync via `menu task add` → refused.

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the tests, run ONLY the named files, record red.
### Step 9: PREPARE — read every file in scope IN FULL from disk.
### Step 10: IMPLEMENT — items 1–12.
### Step 11: REVIEW — grep for every remaining `status: 'running'` write and
every load→save not routed through withRegistry; list them with justification.
### Step 12: OPTIMIZE — CAS retry bounded; no busy-wait.
### Step 13: SECURE — no regex in task-registry; safe-fs; the --force override
is logged, never silent.
### Step 14: VERIFY — node --test on the named files + eslint; no git.
### Step 15: DOCUMENT — headers state the enforcement points (where the ladder
is CHECKED, not just defined) and the single-writer assumption's replacement.
### Step 16: FINAL-REVIEW — report; name any bypass you did NOT close.

## Decisions Taken Under Ambiguity
(Executor fills in.)

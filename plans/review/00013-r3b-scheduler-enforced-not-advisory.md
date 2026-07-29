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
  - "src/lib/task-view.js"
  - "src/lib/menu-screens.js"
  - "src/commands/menu.js"
  - "src/lib/actions.js"
  - "tests/task-registry.test.js"
  - "tests/task-reconcile.test.js"
  - "tests/menu-task-wiring.test.js"
  - "tests/menu-protocol.test.js"
  - "tests/actions-scheduler.test.js"
  - "tests/scheduler-enforced.test.js"
  - "tests/r3b-consolidation-rework.test.js"
  - "tests/last-mile-wired.test.js"
  - "tests/w10-menu-route-safety.test.js"
  - "tests/w10-live-agent-reconcile.test.js"
  - "tests/w10-task-arg-splitting.test.js"
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
- [x] TEST — TDD tests present; Step-11 workflow re-review (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — read every file in scope IN FULL from disk.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — items 1–12.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
### Step 11: REVIEW — grep for every remaining `status: 'running'` write and
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3; findings minor/info only, documented.
every load→save not routed through withRegistry; list them with justification.
### Step 12: OPTIMIZE — CAS retry bounded; no busy-wait.
### Step 13: SECURE — no regex in task-registry; safe-fs; the --force override
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
is logged, never silent.
### Step 14: VERIFY — node --test on the named files + eslint; no git.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — headers state the enforcement points (where the ladder
is CHECKED, not just defined) and the single-writer assumption's replacement.
### Step 16: FINAL-REVIEW — report; name any bypass you did NOT close.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **Guarded start lives in `taskTransition('start')`, not a new gate.** `canRun` is called
   inside the existing `menu task start` route (wrapped in `withRegistry`); a false decision
   `ctx.abort()`s so the registry is provably byte-unchanged. `--force` overrides but writes a
   `forced_start` warn-log entry and SHOUTS "FORCED" in the result text. `updateTask` stays the
   low-level model mutator (reconcile/coupling/force legitimately drive it) — the ladder is
   enforced at every `status:'running'` WRITER, not inside `updateTask`.

2. **Plan-uniqueness enforced at the action + CLI layer, with a shared registry lookup.** Added
   `taskRegistry.findActivePlanTask(reg, plan, kind)` (prefers running/cancelling over queued) and
   routed `menu task add`, `startAgent`, and `advanceAgent` through it. `addTask` stays
   plan-agnostic (registry-level, as the plan directed). `completeExecution` now settles the task
   `findActivePlanTask` returns (the RUNNING one, never a shadowing queued duplicate) and CANCELS
   any leftover queued duplicates for the plan so they cannot re-run a plan already in review.

3. **ONE terminal encoding.** Exported `TERMINAL` + `canTransition(from,to)` from task-registry;
   menu-screens imports them and deleted its stale local mirror. `menu task complete` legality is
   now `canTransition(status,'done')`, so `orphaned → done` (late completion) is ACCEPTED — the
   C3 fix that un-strands a crashed/falsely-orphaned executor's finished plan.

4. **C7: an implement task with no plan file is REFUSED, not phantom-succeeded.** `completeTaskPlan`
   returning `ran:false` for an `implement` task with a non-null plan now yields a blocked/kickback
   shape and leaves the task running; `ran:false` stays a soft report only for non-plan kinds
   (review/decompose). Six pre-existing tests across menu-protocol / w10 / last-mile encoded the old
   evidence-less-success behaviour; I tightened them (seed a real in-progress plan, or assert the
   refusal) — never weakened an assertion.

5. **Compare-and-swap via a `generation` counter + `withRegistry(root, mutator)`.** `load` always
   stamps a generation (absent on disk ⇒ 0, backward compatible); `save` refuses a moved-generation
   write with a `StaleRegistryError`; `withRegistry` reloads-and-re-applies on conflict (bounded to
   5 attempts, NO sleep/busy-wait). Every load→save caller in my files (addAndClaim, taskAdd,
   taskTransition, taskComplete's settle, completeExecution's coupling, reconcileState) routes
   through it. `StaleRegistryError` is NOT exported (the reachability fence forbids a test-only
   export; its `name` is asserted instead). A hand-built literal (`emptyRegistry()`, a test fixture)
   carries no generation and is an intentional unversioned seeding write.

6. **Live-list honesty.** `extractLiveAgentIds` maps a present-but-empty `--live-agent-ids` to
   `undefined` (UNAVAILABLE), never `[]` (authoritative empty). `reconcile` treats a running task
   with `agentTaskId == null` as unmatchable → staleness backstop, even when a live list is present.
   `addAndClaim` accepts an `agentTaskId` to record it at BIRTH, closing the claim→patch window.

7. **Cancel deadline (item 10)** stamps `ts.cancelRequested` (now preserved across a load — the
   normalizer used to drop it), and reconcile forces `cancelling → cancelled` past 30 min even when
   the agent still looks live (`report.stalenessCancelled`). `menu task cancel --force` frees a
   running task immediately, logged (`forced_cancel`) and shouted.

8. **Quarantine (item 8)** excludes THIS-pass age-only `stalenessOrphaned` touches from the
   `promote` projection (glob-aware `touchesOverlap`), reported in `report.quarantined`.
   **Retention (item 9)** protects any terminal task still referenced by a surviving task's
   `blockedBy` from the 7-day sweep. **Sync-barrier integrity (item 12):** `assertSyncBlockedBy`
   moved the empty-barrier refusal into `addTask` (the choke point `menu task add sync` also passes).

9. **Stale-sweep liveness (item 6):** `cleanupStaleInProgress` skips any in-progress plan with a
   non-terminal implement task AND any plan idle < 120 min (mtime backstop), so a wave sibling
   mid-flight (or seconds from `completeExecution`) is never moved out from under its own agent.

10. **Handovers.** (a) `stampAndLedger` now passes `plan_basename` into `writeEntry` so the ledger's
    case-collision guard fires; the rollback skips `removeEntry` on a collision (that entry belongs
    to the OTHER plan). (b) `recordDeployReadyNotice` writes `deploy-ready.json` atomically
    (temp + rename), mirroring stale-cleanup.

### Bypasses I could NOT close (out of my file scope) — RECONCILED at rework (2026-07-27)
- `menu.md` documents `claude:ledger-backfill` with no emitter (PARITY-reverse / R3-D recipe test):
  the concurrent ledger executor owns `menu.md`.
- **The full-suite failures recorded here were STALE.** On rework HEAD (v6.13.38) the wave has
  integrated: `npx tsc --noEmit` exits 0 (the "5 tsc errors in dependency-auditor.js" no longer
  exist), and `npm test` is green (coverage 99.04% scoped to src/**, 0 failed, 0 skipped). The
  `sync.js` / `compliance-regime` / environment-mode / reachability-baseline / test-file-count
  items were reconciled by the integrator across the wave. The critical-tier compile-error claim
  is confirmed refuted against the live tree, not merely asserted.

---

## Note from 00003-r2a rework (human ruling 2026-07-26) — you own the longer-term home

The human ordered the concurrent-edit quarantine be belt-and-suspenders: enforced inside
the scheduler so it "cannot be bypassed by any caller", kept in the projection, and with
THIS plan (which declares `task-registry.js`, `task-reconcile.js` AND `menu-screens.js`)
owning the longer-term consolidation.

00003-r2a landed the BELT at `task-registry.canRun` (refuses a candidate that would edit
files still reserved by an age-only `staleness` orphan — `reason:
'staleness-orphan-quarantine'`, via `overlapsStaleOrphanReservation`), because those are
its declared files. It did NOT put the belt in `nextRunnable`: doing so there would strip
the candidate before `applyQuarantine` sees it and silently kill the human-visible "held"
report on the render and command paths (parity fence cases 1-6/11), and repairing that
requires editing `menu-screens.js` — your file, not 00003's.

Longer-term home for you: move/duplicate the belt into `nextRunnable` (or unify canRun +
nextRunnable + `menu-screens.computePromote` behind the one predicate) so the projection
still REPORTS what the scheduler HELD — one encoding, every promote path, reporter intact.
The parity fence `tests/promote-quarantine-parity.test.js` case 9/9b now encodes the
belt-and-suspenders contract 00003 shipped; tighten it as you consolidate.

---

## Step 16 — Rework report (2026-07-27, v6.13.39)

Reworked against the adversarial review (2 critical, 4 important). Each finding verified
against the live source FIRST; refuted ones dropped, surviving ones fixed at highest quality.

### Findings dispositions

- **ship-gate-cannot-show-green (CRITICAL) — REFUTED (stale).** The "5 tsc errors in
  dependency-auditor.js" and the full-suite-red claim were stale wave-in-flight state.
  Confirmed against HEAD: `npx tsc --noEmit` exits 0; `npm test` is green (coverage 99.04%
  src/**, 0 failed, 0 skipped). The plan's "Bypasses" section is corrected to record this.
- **gate-ruling (CRITICAL) — REFUTED.** It aggregates the above; same disposition.
- **terminal-mirror-not-consolidated (important) — FIXED.** The headline "ONE terminal
  encoding" goal is now fully met. Replaced the three surviving divergent copies of the
  terminal set with the canonical `taskRegistry.TERMINAL`: `actions.js` (was a local literal
  while the same file already used the canonical set elsewhere — the internal inconsistency
  the review named), `task-reconcile.js` (governs the retention sweep and the blockedBy
  live-edge check), and `task-view.js:38` — which was the actually-divergent copy: it omitted
  `cancelled`, so a cancelled task's result summary never rendered. That is now a real
  behavior fix (RW-03), not just hardening.
- **uniqueness-check-not-atomic (important) — FIXED.** `startAgent`/`advanceAgent` checked
  `findActivePlanTask` on a standalone `load()` and then claimed in a separate transaction —
  a window where two interleaved same-plan starts could each add a duplicate. `addAndClaim`
  gains `opts.uniquePlan`: the uniqueness check now runs INSIDE the compare-and-swap mutator
  (one snapshot for check+claim, re-checked against the winner on a CAS conflict). The
  invariant now holds by construction, not by the reactive mop-up in `completeExecution`.
  `menu task add` (`taskAdd`) was already atomic; both walkers now match it (RW-01/RW-02).
- **undeclared-scope-and-c7 (important) — RECONCILED.** The `files:` block now declares the
  w10 / last-mile test files Decision 4 admitted editing, plus the new rework test file and
  `task-view.js` — the true blast radius. The C7 tightening was verified: the affected tests
  seed a real in-progress plan or assert the refusal; no assertion was weakened.
- **human-ruling-consolidation-unshipped (important) — SHIPPED.** The concurrent-edit
  quarantine's reserved-file set is now ONE encoding: exported
  `task-registry.staleOrphanReservedFiles` drives BOTH `canRun`'s belt (via
  `overlapsStaleOrphanReservation`) AND the projection reporter
  `task-reconcile.applyQuarantine`. Previously `applyQuarantine` re-derived the set with its
  own inline loop — a second copy that could drift from the belt. The fail-safe try/catch
  in `applyQuarantine` is unchanged; the shared predicate gained a null-task guard so it is
  robust for both callers. Pinned by RW-04.

### All-three-promote-paths coverage — verified HONESTLY

The three promote-set paths were ALREADY covered before this rework — the gap was the
ENCODING, not the coverage:
1. **Primary path** (`task-reconcile.reconcileState`): `nextRunnable` → `applyQuarantine`
   (reporter) — covered.
2. **`menu-screens.computePromote`**: `applyQuarantine(reg, nextRunnable(reg))` — covered.
3. **Dashboard re-run offer**: the re-run is a `menu task start <id>` routed through
   `taskTransition('start')` → `canRun` → the belt — covered.

So no promote path could bypass the quarantine. What this rework closed is the human
ruling's actual ask — "one encoding, every promote path" — by collapsing the two
reserved-set derivations (the belt's and the reporter's) into the single exported predicate.
No redundant code was added to `nextRunnable` (putting the belt there would strip the
candidate before `applyQuarantine` reports it, killing the "held" report — the parity fence's
reason for keeping the filter in the projection). The parity fence
`tests/promote-quarantine-parity.test.js` stays green (312/312 across the affected suites).

### Files changed
- `src/lib/task-registry.js` — `addAndClaim` atomic `uniquePlan`; export
  `staleOrphanReservedFiles` (+ null-task guard).
- `src/lib/task-reconcile.js` — `applyQuarantine` reuses the shared reserved-set predicate;
  retention `TERMINAL` is the canonical set.
- `src/lib/task-view.js` — import canonical `TERMINAL` (fixes the cancelled-summary omission).
- `src/lib/actions.js` — `startAgent`/`advanceAgent` route through the atomic `uniquePlan`;
  `taskSpecFromPlan` uses the canonical terminal set.
- `tests/r3b-consolidation-rework.test.js` — new; RW-01..RW-04 (red-first, then green).

### Gate
`npm test` green: coverage 99.04% (floor 99), 0 failed, 0 skipped; `npx tsc --noEmit` exits 0.

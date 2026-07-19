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

## Step 16 FINAL-REVIEW report

### Files changed

Sourced ONLY from committed history, pinned to the landing commit
**`1fc8de9`** ("fix(pipeline): R2 repair wave — scheduler lifecycle, gate hook
revived, ship gate, honest surfaces, typecheck ZERO (v6.12.3)", 2026-07-14),
identified by `git log --oneline -- src/lib/task-registry.js src/lib/task-reconcile.js`
and confirmed by `git show --stat 1fc8de9`. The working tree was NOT read for this
subsection. All four declared files are present in that commit, so no part of this
subsection is unavailable.

| File | sha | Diff | What changed |
|---|---|---|---|
| `src/lib/task-registry.js` | `1fc8de9` | +226/−(part of 51) | Added the `cancelling` status to `STATUSES`, rewrote `VALID_TRANSITIONS` (`running → cancelling`, `cancelling → cancelled\|done\|failed`, `orphaned → done\|failed`), added `OCCUPYING`/`isOccupying` so a cancelling task still holds its slot, made `depsSatisfied` kind-aware for `sync`, and added the `unsatisfiableTasks` export with iterative Tarjan `cycleNodeIds`. |
| `src/lib/task-reconcile.js` | `1fc8de9` | +140/−(part of 51) | Added `DEFAULT_STALE_MS_BY_KIND` (implement/sync 120 min), added `cancelled` to the retention `TERMINAL` set, added the cancelling-liveness branch, the `stalenessOrphaned` loud report detail with the durable `orphanReason:'staleness'` marker, and consumption of `unsatisfiableTasks`. |
| `tests/task-registry.test.js` | `1fc8de9` | +272/−(part of 51) | Added four describe blocks: settled sync barrier deps, cancelling status, orphaned late completion, `unsatisfiableTasks`. |
| `tests/task-reconcile.test.js` | `1fc8de9` | +168/−(part of 51) | Added three describe blocks: unsatisfiable queued surfacing, kind-aware staleness backstop, cancelling liveness. |

**Honest caveat on attribution.** `1fc8de9` is a nine-slice WAVE commit, not a
single-slice commit; git reports 755 insertions and 51 deletions across these four
files but does not separate this plan's share of the deletions per file, so the
deletion column is reported as "part of 51" rather than split. The commit message's
own SCHEDULER paragraph names R2-A and R2-B together, and R2-B's registry-side
coupling (`actions.cancelTask`'s hand-off into `cancelling`) may be interleaved in
`src/lib/task-registry.js` within this same commit. The four files above are this
plan's declared files and their added symbols match this plan's five items
one-for-one; a finer split is not available from committed history and is not
reconstructed here.

### Tests

Test titles below are read from the two test files as they exist today, cross-checked
against their addition in `1fc8de9`.

- **Item 1 (settled barrier).** `C1-1a` sync runnable when every dep is settled even
  one failed; `C1-1a2` cancelled and orphaned deps also settle; `C1-1b` blocked while
  a dep still runs; `C1-1b2` a cancelling dep is not settled; `C1-1c` a missing dep id
  never satisfies; `C1-1d` a non-sync candidate keeps done-only.
- **Item 2 (`unsatisfiableTasks`).** `U-1` dep-failed; `U-1b` orphaned and cancelled
  deps also unsatisfiable; `U-2` dep-missing; `U-3` two-task cycle; `U-4` self-cycle;
  `U-4b` three-task cycle plus a clean DAG; `U-5` a sync task with merely failed deps
  is NOT unsatisfiable; `U-6` satisfiable tasks excluded; `U-7` only queued considered.
  Reconcile side: `a queued task with a failed dep is marked failed + surfaced (never
  silent-forever)`, `a missing dep on a queued task is surfaced as dep-missing`, `a
  blockedBy cycle among queued tasks is surfaced as dep-cycle`, `a satisfiable queued
  task is left queued (not falsely failed)`, `reconcileState persists the
  unsatisfiable-failed marking to disk`.
- **Item 3 (`cancelling`).** `C1-2a` running → cancelling → cancelled with no early
  `ts.done`; `C1-2b` queued → cancelling rejected; `C1-2c` occupies slot, touches and
  gitOp; `C1-2c2` counts toward max-concurrent and the sync barrier; `C1-2c3` a
  cancelling gitOp task blocks an editing candidate; `C1-2d` cancelling → done keeps
  the result; `C1-2e` cancelling → failed allowed and queued → cancelled immediate;
  `C1-2f` a cancelling task satisfies neither dep rule; `ST-CANCEL-1` the replaced
  contract. Reconcile side: `a cancelling task with a live agent stays cancelling
  (files stay locked)`, `a cancelling task confirmed absent → cancelled (agent gone),
  ts.done stamped`, `a young cancelling task inside grace is left alone
  (just-dispatched cancel race)`, `a stale cancelling task with no TaskList →
  cancelled via the staleness backstop`.
- **Item 4 (kind-aware staleness + late completion).** `implement task 45 min old with
  no TaskList is NOT orphaned (120-min floor)`; `implement task 130 min old with no
  TaskList IS orphaned + stalenessOrphaned detail carries age`; `sync kind also gets
  the 120-min floor (90 min → not orphaned)`; `a non-implement/sync kind keeps the
  30-min staleness floor`; `a per-kind override via staleThresholdMsByKind is
  honored`; `a confirmed-absent orphan (TaskList present, no match) is NOT a
  stalenessOrphaned`. Late completion: `C1-5a` orphaned → done re-stamps `ts.done`;
  `C1-5b` orphaned → failed accepted; `C1-5c` orphaned → running/cancelled/cancelling
  still rejected.
- **Item 5 (truthful module header).** Documentation-only; no test exists and none is
  claimed. Its correctness was checked by re-reading the header against the code, not
  by an assertion.

**Items from the Test Plan (lines 69-80) with no test found: none.** Every case that
section names has a corresponding `it(...)` above. Item 5 is the only implementation
item without a test, and it is a prose change for which a test would assert nothing.

### Red evidence

**The red evidence was not recorded by the executor and cannot be reconstructed after
the fact.** The Step 8 red output existed only in a session transcript and is on disk
nowhere. Re-running `tests/task-registry.test.js` and `tests/task-reconcile.test.js`
today produces GREEN output against the landed implementation — that is evidence the
tests pass now, **not** evidence they failed first, and it is offered here as exactly
that and nothing more. Writing a plausible-looking red transcript would be
fabrication, so none is written.

This plan's own Step 8 said "run ONLY these two files, record red"; the running of it
is not in question, only the recording. The gap is a process defect in that executor's
Step 8, not a claim that the tests were written after the code.

### Decisions

See `## Decisions Taken Under Ambiguity` below — six numbered decisions. They are not
duplicated here.

---

## Decisions Taken Under Ambiguity

**1. `cancelling` is a NON-terminal status, and `running → cancelled` is forbidden.**
(`src/lib/task-registry.js:140-146`, `:155-174`, `:775-785`.) A running task ordered
to cancel enters `cancelling` and keeps occupying its concurrency slot, its `touches`,
its `gitOp` exclusion and the sync barrier until the harness agent is confirmed gone.
A direct `running → cancelled` was rejected because it would free a live agent's files
while that agent is still editing them — every guarantee in the concurrency ladder is
only as good as the moment the registry stops believing a task is running.
`queued → cancelled` stays immediate: nothing is running, so freeing is safe.
`cancelling → done` and `cancelling → failed` exist so a completion arriving during
cancellation is recorded honestly rather than discarded.

**2. `orphaned` is a SOFT terminal.**
(`src/lib/task-registry.js:147-154`, and the `orphaned: new Set(['done','failed'])`
row at `:172`.) Entering `orphaned` stamps `ts.done` and drops the task off the
concurrency count, but `orphaned → done` and `orphaned → failed` remain legal, so a
falsely orphaned agent that later finishes has its completion accepted, not dropped.
`done`, `failed` and `cancelled` are hard terminals with no exit. The asymmetry is the
point: orphaning is a guess made from the absence of evidence, and a guess must be
reversible by the arrival of evidence. This contract was dead code until the stale
terminal mirror in `menu-screens.js` was replaced by the registry's own exported
`TERMINAL` — see decision 3 of
`plans/review/00013-r3b-scheduler-enforced-not-advisory.md`.

**3. The presumed-dead bound is the load-bearing deadlock guard.**
(`src/lib/task-reconcile.js:117-130` for `DEFAULT_PRESUMED_DEAD_MULTIPLE`, and
`:404-429` for the across-passes release branch.) The causal chain, as the code states
it: a staleness orphan's files stay reserved until its agent is confirmed dead;
confirmation requires a live agent-id list; the default `/ctoc:menu` path passes no
`--live-agent-ids`, so `liveAgentIds` is `null` on every pass and the confirmed-dead
signal can never fire. Without a second release path the reservation would hold
forever and any rival queued task touching those files could never run — a permanent
scheduler deadlock, strictly worse than the one-pass bug it replaced, which at least
made progress. The bound — twice the same kind-aware staleness floor that produced the
orphaning, so an `implement` orphan at 120 minutes is held until 240 — keeps protecting
a plausibly-alive agent for one more full staleness window and then always elapses. A
task with an unparseable or absent `ts.started` is presumed dead at once, which is also
the only release path available to an orphan that never recorded an agent id.

**4. The concurrent-edit quarantine lives in the promote projection, not the
scheduler.**
(`src/lib/task-registry.js:773-916`, the scheduler section opening on the word `pure`;
and the promote projection in `src/lib/task-reconcile.js`.) The file reservation is
enforced in the promote projection, never in `canRun` or `nextRunnable`. The scheduler
reads only `status`, `kind`, `touches` and `gitOp`; teaching it to read
`result.orphanReason` would make the concurrency ladder's answer depend on *why* a task
reached a status rather than on the status itself, and would couple the ladder to the
reconcile pass's private marker encoding. The honest consequence: because the guard
sits outside the scheduler it must be applied at every promote path, and as shipped it
was applied at only one of four — repaired by
`plans/implementation/00077-quarantine-on-every-promote-path.md`, with the guard's own
fail-safe behaviour repaired by
`plans/implementation/00076-quarantine-fault-fails-safe.md`.

**5. The sync-barrier hazard is RECORDED AS A PRECONDITION, not fixed.**
(`src/lib/task-registry.js:804-825` for `depsSatisfied`, `:838-847` for Rule 2, whose
refusal is at `:845`.) The hazard, precisely: for a `sync` candidate a dependency
satisfies when its status is TERMINAL, and `orphaned` is in that terminal set — so a
task orphaned on age alone, whose agent may still be alive and editing, counts as
SETTLED and can let a wave-integration barrier through.

It is not fixed because two facts both hold today:

- `enqueueWaveSync` has **no JavaScript caller anywhere in `src/`** — the only
  occurrences are its definition at `src/lib/actions.js:1679` and its export at
  `:2123`. Nothing in shipped JavaScript creates a `sync` task through it.
- Rule 2 at `src/lib/task-registry.js:845` refuses a `sync` candidate while **any**
  task occupies a slot, so a barrier cannot start alongside the very work it would be
  racing.

**Qualification found while checking fact one, and recorded rather than smoothed
over:** `src/commands/menu.md` instructs the session model to call `enqueueWaveSync`
at a wave boundary, in the `claude:advance-all-implementation` and `claude:start-agent`
recipes. That is not a JavaScript call site, so the fact as stated is true, but the
function is NOT unreachable in practice — it is reachable through an instruction path
whenever a human takes either menu route. The precondition therefore rests almost
entirely on the second fact, Rule 2, and is weaker than "nothing calls it" would
suggest.

**This is a precondition with an explicit expiry.** If either fact stops being true — a
JavaScript caller for `enqueueWaveSync` appears, or Rule 2 is relaxed — the hazard
becomes live, and `depsSatisfied` must then distinguish a confirmed-dead orphan from an
age-only one for `sync` candidates. This was a decision NOT to fix, taken with the
hazard understood, and is not an oversight.

**6. This plan and the actions-layer sibling are ruled on together, as one gate
decision.** `plans/review/00004-r2b-actions-drain-and-shipgate.md` declares
`depends_on: 00003-r2a-scheduler-lifecycle-honesty` in its own frontmatter, its
`cancelTask` two-phase behaviour is meaningless without this plan's `cancelling`
status, and its own decision 5 records that it rewrote a test to match this plan's
hand-off. Approving one without the other would leave a half-installed lifecycle in the
product. This record states the coupling; the ruling is the human's.

### Citation drift found and corrected

Per the rule that the code wins and the disagreement is written down: the presumed-dead
comment in `src/lib/task-reconcile.js` was cited as `:108-121` by the slice that wrote
this record. On disk it spans `:117-130`; `:108-121` lands partly in
`DEFAULT_CANCEL_DEADLINE_MS`. The citation above is corrected to `:117-130`. The
across-passes release branch was cited as `:389-410` and is at `:404-429`; corrected.
All other cited ranges were re-read and matched what the decisions claim.

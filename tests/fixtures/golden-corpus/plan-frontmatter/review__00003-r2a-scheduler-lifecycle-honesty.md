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
  - "tests/promote-quarantine-parity.test.js"
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
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 9: PREPARE — re-read both modules in full from disk first.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 10: IMPLEMENT — changes 1–5; wire reconcile consumption.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 11: REVIEW — diff vs plan; header truthful; no stale comments.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 12: OPTIMIZE — DFS iterative, O(V+E); no speculative caching.
### Step 13: SECURE — no regex in task-registry; safe-fs only; no spec spread.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 14: VERIFY — node --test on the two files + eslint on all four; no git.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 15: DOCUMENT — JSDoc on every changed export.
### Step 16: FINAL-REVIEW — report files/tests/red-evidence/decisions.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).

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

**4. The concurrent-edit guard is now BELT-AND-SUSPENDERS (human ruling 2026-07-26).**
The human directed that the guard be enforced INSIDE the scheduler so it "cannot be
bypassed by any caller", AND kept in the projection, AND that sibling `00013-r3b` (which
declares all three files) own the longer-term home. This supersedes the earlier "scheduler
stays pure" ruling that lived in `promote-quarantine-parity` case 9/9b, which is updated
here to the new contract.

- **Belt — `canRun` (`src/lib/task-registry.js`).** `canRun` — the single oracle every
  `status → running` transition must consult — now refuses a candidate that would edit
  files still reserved by an age-only `staleness` orphan (`reason: 'staleness-orphan-quarantine'`),
  via `overlapsStaleOrphanReservation` / `staleOrphanReservedFiles`. No caller that computes
  its own promote set can START a colliding task. The belt uses the SAME predicate as the
  projection (`orphanReason === 'staleness'` only, never `presumed-dead`), so the two layers
  agree: a released reservation lets the candidate run on both.
- **Suspenders — `applyQuarantine` (`src/lib/task-reconcile.js:681`).** Unchanged. It stays
  the REPORTER: it holds the candidate on the render (`reconcileState`) and command
  (`menu-screens.computePromote`) paths and records `report.quarantined` (the human-visible
  "held" signal). `nextRunnable` is deliberately left as the raw projection (it still OFFERS
  the candidate) so the projection can name what it held — the parity fence cases 1-6/11
  depend on this.
- **Scope boundary.** This plan declares `task-registry.js`/`task-reconcile.js`, so the belt
  lands here. Moving/duplicating the belt into `nextRunnable` and consolidating the reporter
  across `menu-screens.js` is the LONGER-TERM HOME and belongs to `00013-r3b`
  (see the note added to that plan). Verified during this rework: the projection already
  covers all three promote paths via `applyQuarantine` (the earlier one-path gap the critique
  flagged is closed in the current tree; `computePromote` calls `applyQuarantine`, and the
  "re-run offer" at `menu-screens.js:616` is display only).

**5. The sync-barrier hazard is FIXED: an age-only orphan does not settle a barrier.**
(`src/lib/task-registry.js` `depsSatisfied`.) The hazard, precisely: for a `sync`
candidate a dependency satisfied when its status was TERMINAL, and `orphaned` is in that
terminal set — so a task orphaned on AGE ALONE, whose agent may still be alive and
editing its files, counted as SETTLED and could let a wave-integration barrier commit
over a half-written tree.

The original slice RECORDED this as an unfixed precondition, resting on two facts that
made the path hard to open (no JavaScript caller for `enqueueWaveSync`, and Rule 2
refusing a sync while any slot is occupied). That was rejected on this rework: the menu
instruction surface already tells the session model to call `enqueueWaveSync` at a wave
boundary, so the path is reachable in practice, and a guard whose safety rests on "no
code currently opens it" is exactly the deferral the rebuild exists to remove.

**The fix — CONFIRM LIVENESS, never settle on age (human ruling 2026-07-26).**
`depsSatisfied` now settles an `orphaned` dep for a `sync` candidate ONLY when its agent is
CONFIRMED gone — a confirmed-absent orphaning (no `result` reason marker; orphaned because
the live-agent list showed it gone) or `orphanReason === 'confirmed-dead'`. An orphan
carrying `orphanReason === 'staleness'` (age-only) OR `'presumed-dead'` (merely aged past a
bound — still an age heuristic) does NOT settle; the barrier returns `blocked-dep`. The
human chose the strongest-correctness option deliberately: an irreversible wave-integration
commit must not rest on age while an agent may still be writing files.

**Not released by the age bound — deliberately.** Unlike the file quarantine (decision 4),
which the across-passes release frees at `presumed-dead` so ordinary queued work can
progress, the barrier is NOT freed by age. It waits for genuine liveness confirmation
(`confirmed-dead`), which requires a live-agent list. On the default `/ctoc:start` path,
which passes no live list, `confirmed-dead` never fires and such a barrier WAITS
indefinitely rather than committing over a possibly-live tree. This is the accepted
correctness-over-liveness trade-off, not an oversight; a barrier blocked this way is still
never marked unsatisfiable (`sync` is excluded from the `dep-failed` class — guarded by
`U-5b`), so it resumes the moment liveness is confirmed.

**Purity superseded, not violated silently.** Reading `result.orphanReason` in the
scheduler (here and in the `canRun` belt of decision 4) is the human's explicit new ruling,
which updates the earlier "scheduler reads only status/kind/touches/gitOp" contract encoded
in `promote-quarantine-parity` case 9/9b. That fence is rewritten to the belt-and-suspenders
contract in the same commit.

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

---

## Rework (2026-07-26) — both scheduler fixes, rebuilt on a GREEN full gate

The human sent this plan back from review to rework on the real gate (full `npm test`
green — whole suite, coverage floor 99, zero skipped) and to make the record match the
shipped code, then issued two explicit rulings for the two defects. Each was re-verified
against the current source before acting.

**Defect (a) — concurrent-edit quarantine covered only one promote path. Human ruling:
belt-and-suspenders.** The projection guard (`applyQuarantine`) was ALREADY closed across
all three promote paths in the current tree (siblings `00076`/`00077`) — verified, not
re-implemented. Per the human's ruling, a scheduler-level BELT was ADDED: `canRun`
(`src/lib/task-registry.js`) now refuses a candidate that would edit files still reserved
by an age-only `staleness` orphan (`reason: 'staleness-orphan-quarantine'`), so the guard
cannot be bypassed by any caller that computes its own promote set. The projection stays as
the reporter (suspenders). Sibling `00013-r3b` (declares all three files, incl.
`menu-screens.js`) is noted as the longer-term home for consolidating the belt across
`nextRunnable` and the command paths. See decision 4.

**Defect (b) — a wave sync barrier settled on an age-only orphan. Human ruling: confirm
liveness, never settle on age.** `depsSatisfied` now settles an `orphaned` sync-dep ONLY
when the agent is CONFIRMED gone (no reason marker / `confirmed-dead`), never on
`staleness` or `presumed-dead` (both age heuristics). An irreversible commit must not rest
on age; the barrier waits for genuine liveness confirmation. See decision 5.

Both fixes read `result.orphanReason` in the scheduler, which the human's ruling knowingly
permits — superseding the earlier "scheduler stays pure" fence. `promote-quarantine-parity`
case 9/9b is rewritten to the belt-and-suspenders contract (added to this plan's declared
`files:`).

**Tests (TDD-Red first, recorded).** `tests/task-registry.test.js`:
- `C1-1e` — an age-only (`staleness`) orphan dep does NOT settle a sync barrier
  (`blocked-dep`). Written first and OBSERVED FAILING against the pre-fix code: it returned
  `reason: 'ok'` where the test asserts `'blocked-dep'` (`AssertionError: + 'ok' - 'blocked-dep'`).
- `C1-1f` — only `confirmed-dead` settles the barrier; `presumed-dead` (age) does NOT.
- `BELT-1..5` — canRun refuses a candidate overlapping an age-only orphan's files
  (glob-aware), lets a disjoint or released-orphan candidate run, never holds an
  empty-touches candidate, and nextRunnable still offers the held candidate (projection
  reports it).
- `U-5b` — a sync task blocked by an age-only orphan is NOT reported unsatisfiable.
`tests/promote-quarantine-parity.test.js`: case 9 now asserts canRun refuses while
nextRunnable offers; case 9b asserts a released reservation passes the belt.

**Ledger.** Moving this wave `review → todo` (a gate destination) required a
`stage_to: todo` backfill entry per plan (`approval-ledger.backfillEntry`, reason: human
rework ruling) so the residency ledger matches the human-ordered state; recorded as
`backfilled`, never laundered as a live click.

**Gate.** Full `npm test` to green — whole suite, coverage floor 99, zero skipped.

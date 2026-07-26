---
title: "R2-B — Actions: task/plan coupling, drain that never stalls, cancel two-phase, deploy trigger behind the ship gate"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00003-r2a-scheduler-lifecycle-honesty
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/actions.js"
  - "tests/actions-scheduler.test.js"
---

# R2-B — Actions layer honesty

Fixes C1-3 (HIGH stale occupancy), C1-4 (HIGH FIFO dead-stop), C1-6 (MEDIUM
empty barrier), C1-10 (LOW drain-stop clobber), C1-2 action side (cancelTask
two-phase), G4-minimal (deploy trigger crosses the human ship gate).

## Implementation Details

1. **completeExecution couples the state machines (C1-3).** In the same call
   that moves the plan in-progress → review: look up the registry's non-terminal
   implement task whose `plan` matches the slug; `running → done` (result:
   `{ ok: true, summary: 'plan reached review' }`); `cancelling` → leave for
   reconcile (a cancelled plan's completion must not read as normal success —
   record `result` but keep status path per R2-A). Registry absent/no match →
   proceed without error (fail-open, log to the existing action log if one is
   written here). One load→save.
2. **Drain never stalls at the head (C1-4).** startAgent/advanceAgent iterate
   the todo FIFO: on a `taskSpecFromPlan` refusal (no files:, dep not
   enqueued/failed), record `{ plan, error }` into a `skipped` list and try the
   NEXT plan; first claimable plan wins. Return shape gains `skipped:
   Array<{plan, reason}>`; the caller (menu recipe) surfaces them. A refusal
   NEVER stalls plans queued behind it.
3. **enqueueWaveSync refuses an empty wave (C1-6).** `blockedBy` missing or
   empty → throw with a clear message (a barrier with nothing to integrate is
   a caller bug).
4. **Drain-stop protected (C1-10).** startAgent only clears drain-stop when
   called with `{ force: true }` (the human-initiated menu start passes it —
   documented in the JSDoc; the recipe update is slice R2-D's menu.md pass).
   Without force, a drain-stopped root returns `{ started: false,
   drainStopped: true }`.
5. **cancelTask two-phase (C1-2).** Running task → `cancelling` (occupies
   files until confirmed dead, per R2-A); queued → `cancelled`. Return
   `{ task, agentTaskId }` so the caller can kill the harness task; JSDoc
   states plainly that files stay locked until reconcile confirms death.
6. **Deploy trigger behind a PER-CROSSING ship gate (G4).** The done→deploy
   auto-trigger inside approvePlan fires ONLY when THIS approval call carries the
   deploy stamp — `options.deploy === true` — a per-crossing authorization, NEVER
   a persisted config flag. The human decided push + deploy are the two ship gates
   (2026-07-14), and a gate that one standing boolean disarms forever is a setting,
   not a gate: set once, a per-project flag would auto-deploy on EVERY future Gate 3
   approval with no human act at the deploy gate. So the stamp lives on the crossing,
   not on the project. Absent the stamp (the normal review approval), a durable
   deploy-ready notice is appended to `.ctoc/logs/deploy-ready.json` saying the plan
   is deploy-ready and deploy is a separate human act — and NOTHING deploys.

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| completeExecution coupling | existing completeExecution callers (menu recipes) | /ctoc:menu |
| skip-and-surface drain | startAgent/advanceAgent callers (menu recipes) | /ctoc:menu |
| force flag | menu.md claude:start-agent recipe (slice R2-D, same wave) | /ctoc:menu |
| deploy-ready notice (default, unstamped crossing) | approvePlan review→done path — every Gate 3 approval | /ctoc:menu |
| per-crossing deploy stamp (`options.deploy:true`) | approvePlan review→done path; the human's deliberate "approve and deploy" act. The menu surface that passes the stamp is the menu.md slice's concern (same as the force flag), so the default (notice, no deploy) is the live-wired path here | /ctoc:menu |

### Test Plan (TDD-Red first) — tests/actions-scheduler.test.js additions
completeExecution marks the matching task done (disk-verified) and leaves a
cancelling task's status alone; no-registry root does not throw. startAgent
with head plan missing files: + a valid plan behind it → second plan claimed,
skipped[] names the first with its reason. advanceAgent same. enqueueWaveSync
[] and missing → throws. startAgent without force on drain-stopped root →
{started:false, drainStopped:true}, flag intact; with force → flag cleared.
cancelTask running → cancelling + files still conflict for a new task; queued
→ cancelled. completeExecution DERIVES the settled task result from the verify
outcome (running task → done with result.ok tracking verify.passed; a cancelling
task records ok:false — never a clean success). approvePlan review→done with
deployment enabled but NO per-crossing deploy stamp → NO deployment invocation, a
deploy-ready notice recorded; with `deploy:true` on the crossing → the pipeline
RUNS and writes its status artifact (the test drives the enabling branch and asserts
the artifact, mirroring the unstamped-path test that asserts the pipeline did not run).

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the additions, run this file only, record red.
### Step 9: PREPARE — re-read actions.js regions + post-R2A task-registry.js
from DISK (R2-A may still be landing: if cancelling/unsatisfiable APIs are
absent, STOP and report — do not stub around a missing dependency).
### Step 10: IMPLEMENT — changes 1–6.
### Step 11: REVIEW — diff vs plan.
### Step 12: OPTIMIZE — one registry load→save per action.
### Step 13: SECURE — named fields only; no frontmatter spread; safe-fs.
### Step 14: VERIFY — the REAL quality gate this project defines as done: the FULL
suite via `npm test` (which runs `src/scripts/test-gate.js`: whole suite + coverage
floor ≥ 99 + zero-skipped), not one file. `actions.js` is shared across the wave, so
the merged file is verified by the whole-tree run, not a single slice's file (q11, q14).
### Step 15: DOCUMENT — JSDoc; startAgent contract documents skipped[] + force.
### Step 16: FINAL-REVIEW — report files/tests/red-evidence/decisions.

## Decisions Taken Under Ambiguity

1. **completeExecution coupling — placement, transaction, and a verify-DERIVED
   result (q13, q16).** The coupling runs AFTER `movePlan(...,'review')` (so a
   blocked/kicked-back completion, which returns early before the move, never settles
   a task) and — corrected in this rework — AFTER `persistVerifyResult` runs, because
   the settled result is DERIVED from the verify outcome and must not be stamped before
   the gate that decides it has run. It is keyed on `planSlug = basename(newPath)`, which
   equals the task's `plan` field (`taskSpecFromPlan` sets `plan: plan.name`). It runs
   inside a `taskRegistry.withRegistry(root, (registry, ctx) => …)` TRANSACTION (a
   compare-and-swap load/mutate/save on a bumped generation), NOT a bare single
   load→save: on no matching task it `ctx.abort()`s and `warnLog`s the missing coupling;
   it retires any queued SHADOW duplicates of the same plan (`queued → cancelled`,
   `warnLog`ged) so a duplicate cannot re-run a plan already in review. A RUNNING task
   → `done` with `result.ok` = `verify.passed === true` (a null/failed verify reads
   falsy — a plan whose verify could not run never settles a success). A CANCELLING task
   keeps its status (only its `result` is recorded — a whitelisted mutable field —
   preserving the R2-A `cancelling`→reconcile path) and its result is `ok:false`: a plan
   completing during a cancellation is NEVER a clean success (the plan's own charter).
2. **"non-terminal implement task" scope.** Only `running` (→ done) and
   `cancelling` (record result, keep status) are acted on. A `queued` implement
   task for a plan that reached review is left untouched — a plan cannot honestly
   have "reached review" off a task that never started, so forcing it done would
   fabricate success. File-conflict on the plan's own path guarantees at most one
   non-terminal implement task per plan, so "find first" is unambiguous.
3. **Skip-and-surface — "first claimable" = first plan whose `taskSpecFromPlan`
   does not throw.** A plan that builds a valid spec but is then QUEUED by the
   scheduler (e.g. file-conflict) still "wins" the iteration and is returned as
   `{ started:false, queued:true }` — it is NOT skipped, because it is a legitimate
   recorded task, not a refusal. Only a `taskSpecFromPlan` throw (no `files:`,
   unresolvable dep) is a skip. `skipped[]` uses `{ plan, reason }`.
4. **startAgent drain-stop guard runs BEFORE the stale sweep.** A drain-stopped,
   unforced start returns `{ started:false, drainStopped:true }` immediately —
   it does not sweep stale in-progress plans or read the todo queue (draining means
   "do nothing new"). The prior unconditional `clearDrainStop()` at the top is
   removed; the flag is cleared ONLY on `{ force:true }` (the human-initiated menu
   start — slice R2-D wires the recipe to pass it).
5. **cancelTask return shape changed to `{ task, agentTaskId }`** (was
   `{ cancelled, taskId, agentTaskId }`). The updated task object carries the new
   status (`cancelling` for a running task, `cancelled` for a queued one), which is
   strictly more information; the old boolean is redundant. An already-`cancelling`
   task is refused with a clear error (a second cancel is not meaningful and would
   otherwise free a still-dying agent's files via the legal cancelling→cancelled
   transition). The existing test that pinned the old contract was rewritten to
   tighten to the two-phase behavior (per the R2-A hand-off).
6. **Deploy ship gate — a PER-CROSSING stamp, not a standing setting (q10).** The
   only trigger is `options.deploy === true` on the approvePlan call that crosses
   review→done — a stamp carried on THIS crossing, provided freshly by the human's
   deliberate act each time. The earlier draft read a persisted
   `deployment.ship_gate_confirmed` config flag; that reversed the human's own
   2026-07-14 ruling, because one boolean set once permanently disarms the deploy gate
   for every future approval. The persisted-flag reading is REMOVED entirely (no code
   anywhere still reads `ship_gate_confirmed`; `deployment.js` is untouched). When
   deployment is `enabled` but the crossing is unstamped, a durable notice is appended
   to `.ctoc/logs/deploy-ready.json` (append+rotate, cap 500 — the same pattern as
   `logPlanIndexError` and the cleanup log, written atomically via temp+rename), NOT the
   escalations log: a deploy-ready plan is an informational inbox item, not a
   circuit-breaker escalation. **Design decision the earlier plan lacked:** the stamp is
   an `options`-level per-crossing flag (`options.deploy`) rather than the review
   `approved_by: human` marker, because review approval and deploy are the TWO SEPARATE
   ship gates — approving the code review must not itself authorize deploy. The default
   path (notice, no deploy) is live-wired on every Gate 3 crossing; the menu surface that
   passes `deploy:true` is the menu.md slice's concern, exactly as the `force` flag is.

### Dependency ordering (q15)
- `depends_on: 00003-r2a-scheduler-lifecycle-honesty`. As of this rework, 00003 has
  been reworked and sits in `todo` AHEAD of this plan (unit 1 of the same sequential
  wave, already committed); the `cancelling`/unsatisfiable-dependency task-registry
  APIs this slice builds on are present on the integrated tree. This wave is driven
  strictly sequentially (00003 → 00004 → …) on a shared tree, so the dependency is
  satisfied by construction; the full-suite Step-14 run verifies the merged state.

### Record corrected to match shipped code (q16)
- The recipe lives at `src/commands/start.md` (the file the earlier plan called
  `menu.md`). It ALREADY reflects this slice's contract and is NOT outstanding:
  line 62 calls `startAgent(root, { force: true })` (the human-initiated start that
  clears drain-stop), and the board-cancel section (line 353+) documents the
  two-phase cancel — a `running` task moves to the NON-terminal `cancelling`, not
  straight to the terminal `cancelled`. The earlier "left untouched / slice R2-D"
  note was stale; those changes have shipped.
- Concurrency: the scheduler serializes by FILES, not by task kind — implement tasks
  run CONCURRENTLY (up to 5) when their declared `files:` are disjoint, and two plans
  touching the same file serialize (`file-conflict`). (The earlier plan's "one
  load→save" phrasing for the coupling was also corrected — see Decision 1: it is a
  `withRegistry` compare-and-swap transaction with an abort path and duplicate
  retirement, not a bare single load→save.)

### Reported up — out of this slice's files, NOT fixed here
- The menu `task complete` route (`taskComplete` in `src/lib/menu-screens.js`, a
  LATER slice's wiring) settles the completed task with a caller-supplied
  `result = { ok: !p.fail }` and, when the coupling already settled the task, RE-records
  that payload — so on the menu path a failed verify can still be overwritten to ok:true.
  This slice fixes the coupling in `actions.js` (the finding's explicit target: the
  result is now DERIVED from verify there). The menu-route payload is a separate,
  caller-supplied signal in a file this plan does not own; it is surfaced here for the
  human to schedule, not guess-fixed across a scope boundary.

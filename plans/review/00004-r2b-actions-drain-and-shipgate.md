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
6. **Deploy trigger behind the ship gate (G4 minimal).** The done→deploy
   auto-trigger inside approvePlan fires ONLY when
   `deployment.ship_gate_confirmed === true` in the deployment config (a new
   explicit per-project setting, default absent=false). Otherwise write an
   inbox notice (use the existing inbox notice/decision mechanism if present,
   else the escalations log) saying the plan is deploy-ready and deploy is a
   human ship gate. Gate 3 approval must never cross deploy by itself —
   the human decided push + deploy are the two ship gates (2026-07-14).

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| completeExecution coupling | existing completeExecution callers (menu recipes) | /ctoc:menu |
| skip-and-surface drain | startAgent/advanceAgent callers (menu recipes) | /ctoc:menu |
| force flag | menu.md claude:start-agent recipe (slice R2-D, same wave) | /ctoc:menu |
| ship-gate-guarded trigger | approvePlan review→done path | /ctoc:menu |

### Test Plan (TDD-Red first) — tests/actions-scheduler.test.js additions
completeExecution marks the matching task done (disk-verified) and leaves a
cancelling task's status alone; no-registry root does not throw. startAgent
with head plan missing files: + a valid plan behind it → second plan claimed,
skipped[] names the first with its reason. advanceAgent same. enqueueWaveSync
[] and missing → throws. startAgent without force on drain-stopped root →
{started:false, drainStopped:true}, flag intact; with force → flag cleared.
cancelTask running → cancelling + files still conflict for a new task; queued
→ cancelled. approvePlan review→done with deployment enabled but no
ship_gate_confirmed → NO deployment invocation (spy/flag via config), notice
recorded; with ship_gate_confirmed:true → trigger reached.

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the additions, run this file only, record red.
### Step 9: PREPARE — re-read actions.js regions + post-R2A task-registry.js
from DISK (R2-A may still be landing: if cancelling/unsatisfiable APIs are
absent, STOP and report — do not stub around a missing dependency).
### Step 10: IMPLEMENT — changes 1–6.
### Step 11: REVIEW — diff vs plan.
### Step 12: OPTIMIZE — one registry load→save per action.
### Step 13: SECURE — named fields only; no frontmatter spread; safe-fs.
### Step 14: VERIFY — node --test tests/actions-scheduler.test.js + eslint on
both files; no git; no full suite.
### Step 15: DOCUMENT — JSDoc; startAgent contract documents skipped[] + force.
### Step 16: FINAL-REVIEW — report files/tests/red-evidence/decisions.

## Decisions Taken Under Ambiguity

1. **completeExecution coupling — placement + "one load→save".** The coupling
   runs AFTER `movePlan(...,'review')` (so a blocked/kicked-back completion, which
   returns early before the move, never settles a task), keyed on
   `planSlug = basename(newPath)`, which equals the task's `plan` field
   (`taskSpecFromPlan` sets `plan: plan.name`). It performs its OWN single
   `taskRegistry.load → updateTask → save` cycle, independent of the later
   `persistVerifyResult` (which does not touch the registry). A CANCELLING task
   has its `result` recorded via `updateTask` WITHOUT a status change (`result` is
   a whitelisted mutable field, and updateTask only re-stamps `ts` on a status
   change), so its R2-A `cancelling` status path to reconcile is preserved.
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
6. **Deploy ship gate — notice sink.** `deployment.ship_gate_confirmed === true`
   (read from `getDeploymentConfig`, which passes the extra key through
   `mergeConfig`; default absent = false) is the only trigger. When enabled but
   unconfirmed, a durable notice is appended to `.ctoc/logs/deploy-ready.json`
   (append+rotate, cap 500 — the same pattern as `logPlanIndexError` and the
   cleanup log), NOT the escalations log: a deploy-ready plan is an informational
   inbox item, not a circuit-breaker escalation. `deployment.js` was read
   READ-ONLY; no `ship_gate_confirmed` default was added there (another slice owns
   that file), so the flag is simply absent-by-default and reads falsy.

### Out-of-scope findings (untouched, reported up)
- `src/commands/menu.md` documents `cancelTask` as moving a running task "to the
  terminal `cancelled`" (now `cancelling`) and the `claude:start-agent` recipe does
  not yet pass `{ force:true }`. Both are slice R2-D's menu.md pass per this plan's
  wiring table — left untouched.
- `tests/cache-freshness.test.js` has TWO pre-existing failures on the current
  working tree, caused by R2-A's unstaged landing (not this slice): `stale-detector.js`
  performs a count-mutating write without `invalidate()`, and `task-reconcile`'s
  `advanced_by: pipeline` / `stale-reconciliation` marker breaks `F2a`'s
  `approved_by: human` expectation. Reproduced with this slice's `actions.js`
  reverted (pass 22 / fail 2, identical). Belongs to the R2-A slice.

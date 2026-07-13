---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T09:00:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's recorded decisions of 2026-07-14: the
  background-engine rebuild vision's Layer F was approved with "push and deploy
  stay as gates, foundation fixes then sequencing", F1's exact change list is
  recorded in the vision and HANDOFF.md ("do not relitigate"), and the human's
  "continue" order resumed this work against that handoff. The person choosing
  the F1 scope IS the approval.
---

---
title: "F1-s2 — Action layer on the scheduler: retire the global agent lock, plan→task translation, wave sync"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00001-f1-s1-scheduler-file-serial
priority: HIGH
program: ctoc-background-engine-rebuild
iron_loop: true
files:
  - "src/lib/actions.js"
  - "src/lib/agent-lock.js"
  - "src/lib/state.js"
  - "src/commands/menu.md"
  - "tests/agent-lock.test.js"
  - "tests/actions-scheduler.test.js"
  - "tests/task-view.test.js"
  - "tests/task-reconcile.test.js"
  - "tests/menu-protocol.test.js"
  - "tests/menu-screens*.test.js"
  - "tests/actions*.test.js"
  - "tests/state*.test.js"
---

# F1-s2 — Action layer on the scheduler: retire the global agent lock, plan→task translation, wave sync

> **Slice scope.** Rewire `startAgent`/`stopAgent`/`advanceAgent` in
> `src/lib/actions.js` onto the s1 scheduler API (`addAndClaim`, drain-stop
> trio, `cancelled`), DELETE `src/lib/agent-lock.js` (no dead code — rewire or
> delete, no third state), translate plan frontmatter into task fields, add the
> wave `sync` enqueue action, and true up `src/commands/menu.md` prose. Depends
> on s1's API; s1+s2 are committed together at the wave boundary.

## Implementation Details

### Architecture Decision

**Context.** `startAgent` today takes a GLOBAL one-plan lock (`agent-lock.js`:
lock file + pid liveness + stop flag) before dispatching — the ONLY concurrency
mechanism the action layer knows, and the reason the human's "1 plan per agent,
≤5 concurrent, file-disjoint" order had to be executed manually around the
system. NB4's open thread ("unify legacy startAgent lock + AGENT section into
the task plane") closes here. After s1, the scheduler itself is the safety
mechanism: file-based serialization, git-exclusive, sync barrier, ≤5
concurrent. A global lock on top of that is both redundant and wrong (it
re-imposes one-at-a-time).

**The changes:**

1. **`taskSpecFromPlan(plan, root)`** — new function in `actions.js` (not a new
   module; it is action-layer translation): given a plan object from
   `readPlans` (which parses frontmatter), build
   `{ kind: 'implement', label: plan.name, plan: plan.name,
      touches: [...(frontmatter files ?? []), <plan's own repo-relative path>],
      blockedBy: <resolved deps> }`.
   - Including the plan's OWN path in `touches` makes two tasks on the same
     plan file-conflict — the per-plan serialization that matters survives the
     death of kind-based plan-serial.
   - A plan with NO `files:` declaration cannot honestly claim disjointness:
     `taskSpecFromPlan` must REFUSE (return `{ error }` / throw with a clear
     message naming the plan and the fix: declare `files:`). s1 makes empty
     touches on implement a hard error; this is the action-layer message for
     it. The plan's own path alone is NOT enough — undeclared edits are exactly
     the unasked question.
   - `blockedBy` resolution: for each `depends_on:` slug, look up the registry
     for a non-terminal task whose `plan` field matches → use its task id. A
     dep with no task and whose plan file sits in `done/` or `review/` is
     satisfied → no blocker. A dep with no task that is NOT done/review →
     REFUSE with a clear error (enqueue the dependency first) — never enqueue
     a task whose declared dependency the scheduler cannot see.

2. **`startAgent` rewired.** Remove `acquireLock`/`updateLockPlan`/
   `releaseLock`. New flow: `clearDrainStop` → `cleanupStaleInProgress` → read
   todo FIFO → `taskSpecFromPlan(next)` → `addAndClaim` → if
   `claimed`: `startExecution` (move to in-progress), `setAgentStatus`, return
   `{ started: true, task, plan, cleanedUp, remainingTodo }`; if not claimed:
   the task stays queued in the registry and the return is
   `{ started: false, queued: true, reason, task }` — an honest "recorded,
   waiting on <reason>", not an error. Multiple `startAgent` calls may now have
   multiple plans running concurrently when their files are disjoint — that is
   the point.

3. **`advanceAgent` rewired.** `isDrainStopRequested` → clear status, return
   stopped (drain semantics unchanged for the human). Otherwise same claim flow
   as `startAgent`. Completion marking of the FINISHED task stays where it is
   today (the menu's WORK dispatch recipe + `task-reconcile` orphan handling)
   — this slice does not move it.

4. **`stopAgent` rewired.** `requestDrainStop`; report which plans are
   currently running (registry `running` implement tasks), message "will finish
   current plan(s), then stop". No lock to consult.

5. **`cancelTask(root, taskId)`** — new exported action: `load` →
   `updateTask(id, { status: 'cancelled' })` → `save`; if the task carries an
   `agentTaskId`, include it in the return so the CALLER (menu recipe /
   harness) can stop the live agent task; the registry records the decision
   regardless. This is the F1 `cancel` transition's live surface.

6. **`enqueueWaveSync(root, { blockedBy, label })`** — new exported action:
   adds a `sync` task (`gitOp: true`, `touches: []`, blockedBy = the wave's
   task ids). The wave boundary (integrated suite + ratchet reconcile + commit)
   becomes a REAL scheduled task instead of operator memory. Wire the
   instruction surface: `src/commands/menu.md`'s `claude:advance-all-implementation`
   and `claude:start-agent` recipes gain the step "after enqueuing the wave's
   implement tasks, call `enqueueWaveSync` with their ids; when the scheduler
   promotes the sync task, run the integrated suite + baseline reconcile +
   commit, then mark it done".

7. **DELETE `src/lib/agent-lock.js`.** After 2–4, its lock functions have zero
   callers. `state.js getAgentStatus` (its `readLock`/`isPidAlive` use) is
   rewritten: agent "active" iff the registry has a running `implement` task;
   the `.ctoc/state/agent-status.json` display file remains the human-facing
   detail record, but LIVENESS comes from the registry, not a pid file. Grep
   `src/` + `tests/` + `agents/` + `src/commands/*.md` for `agent-lock`,
   `acquireLock`, `releaseLock`, `isLocked`, `requestStop`, `isStopRequested`,
   `clearStop`, `readLock`, `isPidAlive` — every reference is rewired or
   deleted. `tests/agent-lock.test.js` is deleted; its still-meaningful
   behavioral coverage (stop round-trip, stale detection) is superseded by s1's
   drain-stop tests and the registry's orphan reconciliation tests — verify
   that coverage exists before deleting, add to
   `tests/actions-scheduler.test.js` anything genuinely uncovered.

8. **`src/commands/menu.md` truth pass.** Every mention of plan-serial /
   "one plan at a time" / the NB1 scheduler serializing plan-mutating work
   (line 53 and any grep hit for `plan-serial`) is rewritten to the file-based
   contract: implement tasks run concurrently (≤5) when file-disjoint; same-file
   plans serialize; sync barriers close waves. The Two-Plane Protocol section
   must describe shipped truth.

### Dependency Graph

```
actions.js ──requires──> task-registry.js (addAndClaim, drain-stop, updateTask, load/save)  [s1 API]
           ──deletes edge──> agent-lock.js (module deleted)
state.js   ──rewires──> task-registry.js (getAgentStatus liveness)
menu.md    ──instructs──> startAgent / cancelTask / enqueueWaveSync (instruction-surface root)
```

### Wiring — the live call sites (MANDATORY)

| module / export | live call site | root |
|---|---|---|
| rewired `startAgent`/`stopAgent`/`advanceAgent` | existing menu recipes (`claude:start-agent`, `claude:advance-all-implementation`) in `src/commands/menu.md` | `/ctoc:menu` |
| `taskSpecFromPlan` | `startAgent`/`advanceAgent` internal | `/ctoc:menu` |
| `cancelTask` | menu.md task-plane recipe (add a cancel option to the AGENT/task section instructions) | `/ctoc:menu` |
| `enqueueWaveSync` | menu.md wave recipes (change 6) | `/ctoc:menu` |
| `state.js getAgentStatus` rewrite | dashboard status rendering (existing callers) | `/ctoc:menu` |

### Test Plan

New `tests/actions-scheduler.test.js` (temp-dir fixtures, real fs, no mocks of
core logic):

1. `taskSpecFromPlan`: plan with `files:` + deps → correct touches (includes
   own path) and blockedBy; plan without `files:` → refuses with the
   declare-files message; dep not enqueued and not done → refuses; dep plan in
   `done/` → no blocker.
2. `startAgent` on two file-disjoint todo plans called twice → BOTH running
   (registry shows 2 running implement tasks); on overlapping plans → second
   returns `{ started:false, queued:true, reason:'file-conflict' }`.
3. `startAgent` records + claims atomically: after a claimed start, disk
   registry has the task `running`; after a refused start, `queued`.
4. `stopAgent` → drain-stop flag set, message lists running plans;
   `advanceAgent` under drain-stop → stopped, status cleared.
5. `cancelTask` on queued and running tasks → `cancelled` persisted,
   `agentTaskId` returned when present; on done → throws (terminal).
6. `enqueueWaveSync` → sync task with correct blockedBy + gitOp; scheduler
   refuses to co-run it with anything (barrier), runs it alone once deps done.
7. `getAgentStatus` liveness from registry: running implement task → active;
   none → inactive; no pid file involved (assert agent-lock paths unused —
   the file no longer exists, `require` of it anywhere fails the suite).
8. UPDATE dependent test fixtures that construct implement tasks without
   `touches` (task-view, task-reconcile, menu-screens/tab tests, any actions
   tests using startAgent's old lock-shaped returns): upgrade fixtures to the
   hardened contract (add touches / assert new return shapes). Tighten only —
   never weaken an assertion to pass.

### Security Review

- `taskSpecFromPlan` consumes frontmatter from plan files (repo-controlled but
  agent-written): touches entries are strings only (s1's assertTaskShape
  filters), length-bounded per s1; never spread frontmatter into the spec —
  named fields only.
- Deleting agent-lock removes a pid-trusting liveness check; registry orphan
  reconciliation (task-reconcile) is the replacement and already ships. Confirm
  reconcile still marks stale running tasks orphaned so a crashed session
  cannot deadlock the file-conflict rule forever.
- No new fs writes outside `.ctoc/state/` via safe-fs.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
Write `tests/actions-scheduler.test.js` per the test plan; run it; confirm
failure; record the summary.

### Step 9: PREPARE
Re-read post-s1 `src/lib/task-registry.js` (the API you are wiring), `actions.js`
lines 780–1010 (startAgent/stopAgent/advanceAgent/completeExecution),
`state.js` getAgentStatus, `menu.md` recipes, `task-reconcile.js` orphan flow.

### Step 10: IMPLEMENT
Changes 1–8. WIRE IT: menu.md must actually instruct the new actions; delete
agent-lock.js in this same step and fix every reference the greps find. Record
judgment calls in `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
Diff vs plan; grep-proofs: zero `agent-lock` references anywhere; zero
`plan-serial` references in src/ and menu.md.

### Step 12: OPTIMIZE
startAgent does one registry load→save per call — no caching, no double loads.

### Step 13: SECURE
Checklist above; confirm named-field construction, no spread of frontmatter.

### Step 14: VERIFY
`node --test tests/actions-scheduler.test.js tests/task-view.test.js tests/task-reconcile.test.js` (and
each dependent test file you touched) → pass; eslint on every changed file →
clean. Do NOT run the full suite; do NOT touch git; leave everything unstaged.
The deleted `tests/agent-lock.test.js` must be deleted in the same change as
its module.

### Step 15: DOCUMENT
JSDoc on new/changed exports; startAgent's doc comment must describe the
concurrent contract; menu.md prose is part of this slice's deliverable.

### Step 16: FINAL-REVIEW
Confirm scope complete, Wiring table real, reachability intact (agent-lock.js
gone, nothing orphaned — mentally run the fence: no file you touched lost its
last caller). Report files changed, tests, decisions.

## Execution Log (Steps 8–16)

- **Step 8 TEST (TDD-Red):** wrote `tests/actions-scheduler.test.js` (23 tests) FIRST.
  Red run: `tests 23 / pass 3 / fail 20` — the 3 incidental passes were behaviors
  that survive the change (empty-todo start error, and inactive getAgentStatus with
  no work). All 20 target behaviors failed (functions absent, lock-based paths live,
  agent-lock present). ✅
- **Step 9 PREPARE:** re-read post-s1 `task-registry.js`, `actions.js` 780–1010,
  `state.js` getAgentStatus, `menu.md` recipes, `task-reconcile.js`. ✅
- **Step 10 IMPLEMENT:** changes 1–8 landed; agent-lock.js + its test deleted in the
  same change; every reference rewired. ✅
- **Step 11 REVIEW:** grep-proofs — zero live `agent-lock` module requires anywhere;
  zero `plan-serial` literal in the files I own (menu.md, actions.js). ✅
- **Step 12 OPTIMIZE:** startAgent = one `addAndClaim` (single load→save);
  taskSpecFromPlan does one extra read-only `load` to resolve deps; no double loads,
  no caching. ✅
- **Step 13 SECURE:** named-field task construction only (no frontmatter spread);
  touches length-bounded by s1; done/review checks are read-only `existsSync` via
  safe-fs; task-reconcile still orphans stale running tasks (16/16 green). ✅
- **Step 14 VERIFY:** all in-scope test files green; eslint clean on changed JS. ✅
- **Step 15 DOCUMENT:** JSDoc on taskSpecFromPlan / startAgent (concurrent contract)
  / stopAgent / advanceAgent / cancelTask / enqueueWaveSync / getAgentStatus; menu.md
  prose truth-passed. ✅
- **Step 16 FINAL-REVIEW:** agent-lock.js gone, nothing orphaned; every touched
  export retains a live caller (menu.md recipes, tabs/areas consumers). ✅

## Decisions Taken Under Ambiguity

1. **Multi-block `files:` reader (load-bearing).** `plan-coverage.readPlanFiles`
   uses the single-block `parseFrontmatter`, so it returns `[]` for EVERY plan in
   todo/ (they carry a prepended approval-marker block after crossing Gate 2) —
   which would make `taskSpecFromPlan` refuse every real plan. Added
   `planDeclaredFiles(plan)` in actions.js that reads the UNION of leading blocks via
   `stale-detector.extractFrontmatterRegion` (the same helper `state.parseMetadata`
   uses for exactly this reason), then walks the `files:` list. Verified against the
   real gated s2 plan (returns all 12 declared globs).
2. **`depends_on` parsing.** The scalar frontmatter reader stores `depends_on` as a
   single string; parsed as comma/whitespace-separated slugs, dropping `none`/empty.
3. **Refusal surfacing.** `taskSpecFromPlan` THROWS a clear message (no files: / an
   unresolvable dependency). `startAgent`/`advanceAgent` catch it and return
   `{ started|next:false, error }` so a malformed plan degrades gracefully instead of
   crashing the menu recipe.
4. **`getAgentStatus` return shape.** Kept `active/plan/step/phase/elapsed/startedAt`
   for existing consumers (tabs/overview, areas/pipeline, areas/agent, menu-screens).
   Dropped `pid/agentId/stale/stalePlan` — there is no pid or "stale lock" concept
   without a lock (orphan reconciliation in task-reconcile replaces stale detection),
   and consumers read `pid`/`stale` only behind `if` guards. Added `plans[]` and
   `running` for the concurrent contract.
5. **`cancelTask` guards.** Unknown id throws explicitly before mutation; a terminal
   task throws via `updateTask`'s transition guard (terminal is terminal).
6. **OUT-OF-SCOPE BREAKAGE — reported, not touched.** The mandated getAgentStatus
   rewrite breaks ONE test outside this plan's `files:` list:
   `tests/ctoc-command.test.js` → "getAgentStatus returns active agent info" (it
   writes `.ctoc/agent.lock` and expects `active:true` — the retired lock-file
   liveness). Per the touch-only-listed-files constraint it was left untouched and is
   flagged for the CTO Chief. Fix is a one-line fixture swap: create a running
   `implement` registry task instead of an `agent.lock` file. All other
   getAgentStatus consumers are safe (tab-modules mocks it; hooks-remaining only
   checks post-commit's own `startAgent`).
7. **Plan left in todo/.** s2 is committed with s1 at the wave boundary (per this
   plan's own scope note) and Gate 3 batches per parent; moving s2 alone to review
   would desync the s1+s2 wave. The dispatch asked for steps 8–16 + a report, not a
   stage move, so placement is deferred to the CTO Chief. No git operations performed.
8. **`plan-serial` literal removed from owned files only.** menu.md and my actions.js
   comment now describe the file-based contract without the literal token. The three
   remaining `plan-serial` mentions live in `task-registry.js` (s1-owned) and
   explicitly DOCUMENT the deletion — out of this slice's scope, cannot touch.
9. **cancelTask/enqueueWaveSync instruction surface.** Wired into menu.md as
   function-call recipes (matching the existing `startAgent()`/`stopAgent()` recipe
   style), not new slash commands or `menu.js` CLI subcommands — menu.js is out of
   scope and CTOC ships exactly three slash commands.

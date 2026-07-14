---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T18:45:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's explicit 2026-07-14 orders "fix them all, do 50
  rounds of hard critique, keep fixing the code" and "fix everything", against
  the Round-5 greenfield-journey audit. THE defect: completeExecution has ZERO
  callers (verified by the coordinator's own grep across src/, agents/, skills/)
  — so verify evidence is never produced and Gate 3, correctly fail-closed on
  evidence, is un-passable except by override. Same root cause as the 92-dead-
  file catastrophe, one level down: a dead EXPORT inside a live file.
---

---
title: "R3-D — Wire the last mile: completion runs completeExecution; the fence learns about exports"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00013-r3b-scheduler-enforced-not-advisory
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/actions.js"
  - "src/lib/menu-screens.js"
  - "src/lib/task-view.js"
  - "src/lib/reachability.js"
  - "src/commands/menu.md"
  - "agents/iron-loop/iron-loop-executor.md"
  - "src/lib/init-project.js"
  - ".ctoc/export-reachability-baseline.json"
  - "tests/export-reachability.test.js"
  - "tests/last-mile-wired.test.js"
  - "tests/menu-task-wiring.test.js"
  - "tests/reachability.test.js"
---

# R3-D — The key for the lock, and a fence that sees exports

VERIFIED BY GREP (zero hits outside its own definition):
`completeExecution` — the ONLY producer of the Gate-3 verify evidence, the app-
launch last-mile check, and the task/plan coupling — **has no callers.** The
executor agent moves the plan with a raw file move
(`agents/iron-loop/iron-loop-executor.md` step 6). Gate 3 correctly refuses
evidence-less plans, so the greenfield human's ONLY exit is "Approve anyway",
3 clicks × N slices. The wave hardened the lock and never cut the key.

The fence I built to prevent exactly this class of defect is FILE-level:
`actions.js` is reachable, so a dead export inside it is invisible. That hole
closes here too.

## Implementation Details

1. **Completion runs the real completion (THE fix).** `menu task complete
   <id>` for an `implement` task calls `completeExecution(planPath, root)` —
   which runs Step 14 (verify + the app-run last mile), persists the evidence
   Gate 3 demands, settles the registry task, and moves the plan to review.
   The executor agent's own raw move is DELETED from its definition (item 4).
   Read `completeExecution` in full first: it expects the plan in in-progress;
   make the call idempotent/safe when the plan already moved (report, do not
   throw — an agent that moved its own plan must not wedge the completion).
   The task's `plan` field gives the slug; resolve the path from it.
2. **Export-level reachability fence.** `src/lib/reachability.js` gains
   `analyzeExports(projectRoot)`: for every module reachable from a live root,
   collect its exported names; an export is LIVE if it is (a) required and
   used by another live module, (b) named in an instruction surface
   (menu.md/agents/skills/workflows — the same surfaces the file fence
   honors), or (c) declared in `.ctoc/reachability-roots.json`. Anything else
   is a DEAD EXPORT. Ratchet it with a named baseline exactly like the file
   fence (`.ctoc/export-reachability-baseline.json`): the named set may only
   shrink; a new dead export FAILS the suite; unclaimed progress fails loudly.
   Tests are NEVER a caller for this purpose (the whole point).
   Seed the baseline with today's real dead-export set — do NOT delete other
   dead exports in this slice (scope), just fence them so the set can only
   shrink. `completeExecution` must NOT be in the baseline (item 1 wires it).
3. **Escalations get a door.** The dashboard renders "⛔ N circuit-breaker
   escalations" with no route — the most urgent signal in the system, and the
   same count-with-no-door defect R2 fixed for the other three. Add
   `inbox escalations` (mirror the R2-C door screens, stripCtl everything).
4. **The executor agent stops fighting the scheduler.** In
   `agents/iron-loop/iron-loop-executor.md`: delete Rule 1's "NEVER more than
   ONE plan in in-progress / move extras back to todo" (it yanks live siblings
   back under a concurrent wave — the scheduler owns concurrency now) and the
   "pick the OLDEST todo plan" self-selection (the brief names the plan).
   Replace loop step 6's raw move with: call the completion route (item 1) —
   the executor NEVER moves a plan file itself. State plainly: operate ONLY on
   the plan in your brief; never count, claim, or move sibling plans.
5. **`stubs` route unblocked.** `task-view.js isNavRoute` allowlist omits
   `stubs` (and `menu`), so a decompose completion recording `--next "stubs
   <slug>"` is rejected wholesale — the natural next hop after decomposition is
   the one route gate-safety forbids. Add them (verify against menu.md's NAV
   list; keep the allowlist a real allowlist).
6. **Dead durable-stop buttons get recipes.** `claude:env-keep-defaults` and
   `claude:dismiss-stale` are EMITTED by the menu with NO recipe in menu.md
   (the R2-C2/R2-D seam landed the code but menu.md still says the write "is
   not a code path on disk here" — a shipped instruction denying shipped code).
   Write both recipes against the real functions
   (`settings.setSetting('general','environment_prompt_dismissed',true)`;
   `staleDetector.dismissStale(root, candidates)` — the recipe must show how
   the driver obtains `candidates`, e.g. by calling `scanCheapCandidates`
   first). Same for `autoApprove`: menu.md must consume the signal (clean
   validation → cross in the same turn) or the one-turn approve is a lie.
   Remove every "lands in slice R2-C2 in this same wave" denial for code that
   now exists.
7. **`--live-agent-ids` documented.** The flag exists in menu.js and menu.md
   demands the live list but never states the syntax — document it in the
   ON-OPEN RECONCILE recipe (with the R3-B honesty fix: an EMPTY list means
   unavailable, not "nobody is alive").
8. **Init stops lying.** `formatInitResult` tells the user to run `ctoc plan
   new` — a CLI that does not exist. Fix to the real path (`/ctoc:menu`). Stop
   scaffolding `skills/agent-fragments/` into user projects (CTOC-internal).
9. **`deploy-ready.json` gets its reader** — `recordDeployReadyNotice` claims
   "the menu/inbox surface reads this log"; no reader exists. Surface it in the
   inbox counts + the new escalations/gates door (or the deploy notice line on
   the dashboard). No claim without a reader.

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| completeExecution | `menu task complete` route for implement tasks (this slice) | /ctoc:menu |
| analyzeExports | tests/export-reachability.test.js (the ratchet) + iron-loop-enforcer's fence check if trivially wireable | suite + /ctoc:menu |
| escalations door | menu router (this slice) | /ctoc:menu |
| executor rewrite | the dispatched executor agent (instruction-surface root) | /ctoc:menu |
| stubs route | taskComplete `--next` validation (this slice) | /ctoc:menu |
| env/stale/autoApprove recipes | menu.md (instruction-surface root) | /ctoc:menu |
| deploy-ready reader | inbox counts/dashboard (this slice) | /ctoc:menu |

### Test Plan (TDD-Red first)
tests/last-mile-wired.test.js — THE JOURNEY TEST: seed a temp project with an
in-progress plan + a running implement task; run the real `menu task complete`
route; assert (a) verify evidence exists at `.ctoc/state/verify/<slug>.json`,
(b) the plan is in review/, (c) the task is `done`, (d) `validateReviewToDone`
now PASSES for that plan (Gate 3 reachable WITHOUT override — this is the
assertion the whole slice exists for), (e) a failing verify → evidence
`passed:false` → Gate 3 still refuses (fail-closed preserved).
tests/export-reachability.test.js — non-vacuity guard (planting a dead export
FAILS); named baseline (a swap cannot hide a new dead export); count never
grows; unclaimed progress fails; `completeExecution` is NOT dead.
Plus: escalations door lists seeded escalations; `stubs`/`menu` accepted by
isNavRoute; the executor definition contains no plan-move and no sibling-count
rule (grep-zero); menu.md has recipes for every action key the menu EMITS
(write this as a test: enumerate `claude:*` keys emitted by menu-screens and
assert each appears in menu.md — a permanent key/recipe parity fence).

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the tests, run ONLY the named files, record red.
### Step 9: PREPARE — read actions.js completeExecution + step-13-verify.js +
app-runner.js + menu-screens taskComplete + reachability.js + the executor
agent IN FULL from disk.
### Step 10: IMPLEMENT — items 1–9.
### Step 11: REVIEW — the key/recipe parity test must pass: every emitted
action key has a recipe; every recipe names a real function with a real
signature.
### Step 12: OPTIMIZE — analyzeExports stays O(files); no AST dependency (regex
over module.exports + require-usage is acceptable — document the limits
honestly in the header).
### Step 13: SECURE — stripCtl in the new door; no new fs surface outside .ctoc.
### Step 14: VERIFY — node --test on the named files + eslint; no git.
### Step 15: DOCUMENT — reachability.js header explains BOTH fences (file and
export) and why a test is never a caller.
### Step 16: FINAL-REVIEW — report; state plainly whether a greenfield human
can now cross Gate 3 without an override, with the test that proves it.

## Decisions Taken Under Ambiguity
(Executor fills in.)

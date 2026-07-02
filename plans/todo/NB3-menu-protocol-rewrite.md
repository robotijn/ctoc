---
iron_loop: true
approved_by: human
approved_at: 2026-07-02T18:59:59.738Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-02T18:07:03.745Z
gate_crossed: functional → implementation
---

---
title: "NB3 — Menu Protocol Rewrite (NAV vs WORK)"
type: implementation
status: implementation
iron_loop: true
created: 2026-07-01
program: ctoc-menu-ux
parent_vision: "vision/nonblocking-menu-task-plane.md"
priority: HIGH
depends_on: [NB1, NB2]
files:
  - "src/commands/menu.md"
  - "src/lib/menu-screens.js"
  - "tests/menu-protocol.test.js"
---

# NB3 — Menu Protocol Rewrite (NAV vs WORK)

> Rewrites the menu operating protocol (`menu.md`) so Claude's main loop classifies
> every action as Navigation (sync) or Work (async), dispatches Work as background
> agents only after consulting the NB1 scheduler, and returns to rendering
> immediately. This is where the non-blocking behavior actually happens.

## Problem Statement

Today, after the user picks a "work" action (implement / plan / review / quality /
decompose), Claude does the work in the foreground and the menu is blocked for
seconds to minutes (vision §1). NB1 (registry + scheduler) and NB2 (subcommands +
screens) supply the machinery, but nothing yet tells Claude's main loop *when* to
run something in the foreground versus dispatch it to the background, how to consult
the scheduler before launching, or how to route completions back into the inbox.

The `menu.md` protocol must be rewritten to encode the two-plane model (vision §3,
§3c): NAV turns render instantly with minimal reasoning; WORK turns record a task,
dispatch a background agent only if the scheduler says `run` (else queue), and then
render the dashboard immediately with no `await`. Completions pull results back and
promote newly-runnable work. Crucially, human gates always stay foreground and are
never auto-crossed, and interactive work (discuss / decompose) runs
async-with-documented-choices with questions surfaced as inbox decisions.

## Business Alignment

- Directly realizes vision Success Criteria 1 (navigation never blocked; a long work
  action returns to a menu screen in < 1s), 4 (completions surface as pull-based
  inbox items; gates never auto-crossed), and 6 (main-loop turns stay
  minimal-reasoning; heavy reasoning isolated in background agents → lean context).
- Implements vision §3c (NAV vs WORK protocol), §3d/§3e, honoring **D2** (harness
  background agents are the executor; registry mirrors them), **D3** (pull-based
  completion), **D4** (interactive work async-with-documented-choices; questions →
  inbox; gates foreground), and **D5** (never route around the scheduler).
- Encodes Pipeline Philosophy #2 (no-stub) and #3 (async-overnight): interactive
  work makes documented reasonable choices instead of blocking.
- Enforces the vision §8 split-brain rule: Claude never launches a background agent
  without first recording it and checking `canRun`.

## User Stories

- As the user, I want navigation actions (render, view, approve, reject, delete,
  gate clicks) to run synchronously and instantly, so that interacting with the menu
  is never blocked.
- As the user, I want autonomous work actions to dispatch to the background and
  return me to a menu screen in under a second, so that I can keep navigating and
  queuing while work drains.
- As the operator, I want Claude to consult the scheduler before every launch, so
  that no background agent is ever started in violation of the safety rules or
  without being recorded.
- As the user, I want completed background work to surface as a compact, pull-based
  inbox notice and unblock the next queued task, so that results never hijack my
  current screen and the queue keeps draining.
- As the user, I want a background agent that hits a human gate to stop there and
  become a gate-ready inbox item, so that no gate is ever auto-crossed.
- As the user, I want interactive work (discuss / decompose) to run in the
  background making documented choices, surfacing open questions as inbox decisions,
  so that even interactive operations never block the menu.

## Acceptance Criteria (BDD)

### NAV vs WORK classification

```gherkin
Scenario: Navigation action is synchronous and fast
  Given the user selects a NAV action (render, view, approve, reject, delete, or a gate click)
  When the main loop handles the turn
  Then it renders the requested screen synchronously
  And it does not create a background task
  And the turn uses minimal reasoning

Scenario: Work action is classified as background
  Given the user selects a WORK action (implement, plan, review, quality, security, decompose, or discuss)
  When the main loop handles the turn
  Then the action is classified WORK
  And it is never executed in the foreground
```

### WORK dispatch flow

```gherkin
Scenario: Runnable work dispatches and returns immediately
  Given a WORK action whose scheduler decision is "run"
  When the main loop handles the turn
  Then it calls `menu task add` first (recording the task)
  And only then dispatches a background agent and calls `menu task start`
  And it renders the dashboard immediately with a one-line status
  And it does not await the agent's completion

Scenario: Non-runnable work is queued, not launched
  Given a WORK action whose scheduler decision is "queue" (with a reason)
  When the main loop handles the turn
  Then the task is recorded as "queued"
  And no background agent is dispatched
  And the dashboard is rendered immediately showing the queued task and its wait reason

Scenario: Never launch without recording and checking
  Given any WORK action
  When the main loop handles the turn
  Then it never dispatches a background agent before recording the task and consulting canRun
```

### Completion flow

```gherkin
Scenario: Completion pulls results and promotes the queue
  Given a background task finishes and fires its task-notification
  When the completion turn runs
  Then it calls `menu task complete` with the result
  And it surfaces a compact one-line, non-disruptive inbox notice
  And it promotes nextRunnable tasks (dispatching those the scheduler now allows)
  And it does not hijack or change the user's current screen

Scenario: Agent failure is surfaced, never silently lost
  Given a background task fails
  When the completion turn runs
  Then `menu task fail` records the failure
  And the failure appears in the inbox
```

### Gate-bounded and interactive work

```gherkin
Scenario: Human gate stops the background task
  Given a background task reaches a human gate
  When the completion turn runs
  Then the task stops at the gate
  And it becomes a "Gate N ready" inbox item
  And no gate transition is performed automatically

Scenario: Interactive work runs async with documented choices
  Given a "discuss" or "decompose" action is selected
  When the main loop handles the turn
  Then it dispatches as background work
  And the agent makes documented reasonable choices rather than blocking
  And any open questions surface as inbox "decisions awaiting review"
```

## Scope

**In:**
- The `menu.md` protocol rewrite: NAV-vs-WORK classification of every menu action.
- WORK turn flow: `menu task add` → (dispatch `Agent(run_in_background)` +
  `menu task start` if `run` | record only if `queue`) → render dashboard
  immediately, no await.
- COMPLETION turn flow: task-notification → `menu task complete` (or `fail`) →
  pull-based one-line inbox notice → promote `nextRunnable`.
- Gate-bounded rule: human gates always foreground, never auto-crossed; a
  gate-reached task becomes a gate-ready inbox item.
- Interactive work (discuss / decompose) async-with-documented-choices; questions →
  inbox decisions.
- Behavioral tests of the protocol's decision logic (pure JS, no native deps),
  coverage ≥ 80%.

**Out:**
- The scheduler rules themselves (owned by NB1) and the subcommands/screens
  (owned by NB2) — NB3 orchestrates them, it does not reimplement them.
- Session-restart orphan detection, staleness sweeps, corrupt-registry handling
  (→ NB4).
- Replacing the harness's background-agent execution (vision non-goal — we mirror it).
- Parallelizing plan implementation (still strictly FIFO — non-goal).

# Implementation Details

## Scope correction (Decision)
`src/lib/menu-screens.js` enters scope: the COMPLETION turn must promote the queue
via `nextRunnable`, but no NB2 subcommand exposes it (route-around risk / unsafe
blind start). Fix = fold `promote[]` into the `complete`/`fail`/`cancel` response +
add a "Background tasks ▸" entry to reach the board. Additive, tiny, test-covered.
`nextRunnable`/`taskRegistry`/`taskView.isNavRoute` already imported by menu-screens.js.

## Step 5 — PLAN (menu.md additions)
Purely additive to the protocol; Rules 1–10 keep their numbers (SP2 Rule-10
doc-contract + slash-command-no-model-pin stay green); frontmatter keeps `effort:
low`, no `model:`.
- New section **`## Two-Plane Protocol — NAV vs WORK`** (after the Claude-actions
  table, before `### Rules`), 6 subsections: NAV-vs-WORK classification (procedure +
  table); WORK dispatch (turn recipe); COMPLETION (turn recipe); Human gates stay
  foreground; Interactive work — async with documented choices; Reaching the task board.
- New **Rules 11–13** appended after Rule 10: (11) two planes — WORK never foreground;
  (12) WORK dispatch is record-first (`menu task add`→`canRun` decision before any
  Agent launch; run→dispatch+`menu task start`; queue→record only; render now, never
  await; split-brain: never launch unrecorded); (13) completions pull + promote
  `nextRunnable`; gates never auto-crossed.
- Edit 2 action rows: `claude:start-agent` → WORK (`implement` task; scheduler
  plan-serial = FIFO, no foreground loop); `claude:discuss`/`claude:decompose` → WORK
  interactive-async (documented choices; questions → inbox decisions; the
  `.ctoc/ask-me-questions.md` matrix is the FRAMING).

## Step 6 — DESIGN (exact recipes to embed)
- **Classification procedure:** resolve reply→action string A; A blank or a NAV route
  (menu/browse/section/plan/stubs/validate/inbox/tasks/task) → NAV; `claude:` action →
  NAV-claude (view-edit/approve/reject/delete/edit/edit-stubs/add-stub/sync/
  set-environment/env-decide-later/stop-agent/vision) run foreground then render, EXCEPT
  a gate-approve with an autonomous follow-on (Gate 0→product-owner, Gate 1→
  implementation-planner) dispatches that follow-on as WORK after the foreground approve;
  WORK-claude (start-agent→implement, decompose, discuss, approve-stubs→plan,
  create-plan's discussion→discuss) → WORK recipe, never foreground.
- **WORK dispatch:** (1) `node menu.js menu task add K [P] [--touches files] [--gitop]
  [--blocked ids]` → {taskId, decision, reason}; (2) decision run → `Agent(run_in_background)`
  then `menu task start <taskId>`; queue → record only; (3) `node menu.js` render now.
  Never await. Never launch before add+canRun. Agent brief self-contained (taskId, plan
  path, ancestry to read, completion contract: return one-line summary, STOP at any human
  gate reporting "gate N ready" + nav route, never cross a gate, no-stub/documented-choices).
- **COMPLETION:** notification → `menu task complete <id> --summary "…" [--gate N] [--next
  <navroute>]` (store rejects claude: --next) or `menu task fail <id> --summary "…"`; emit
  ONE compact pull notice (no screen change); promote: for each task in the response's
  `promote[]`, `Agent(run_in_background)` + `menu task start <id>` — the ONLY sanctioned
  promotion (never start a queued task the scheduler didn't return).
- **Gate-bounded / interactive / reconciliation-with-rules** per the vision §3d/§3e; Rule 1
  numbers-open-plans preserved (board is task-select free-text `t<n>`); Rule 9 minimal
  reasoning preserved (WORK dispatch is a mechanical add→dispatch→render turn).

## Step 7 — SPEC (tests/menu-protocol.test.js)
- **SPEC-A doc-contract** (over menu.md, string-anchored like SP2, slice section body
  from its own heading index): DC-CLASS (NAV/WORK table + WORK-never-foreground + names
  implement/review/quality/security/decompose/discuss as WORK); DC-DISPATCH (`menu task
  add` before `run_in_background` before `menu task start`; never-await; render-immediately;
  canRun/decision; split-brain); DC-QUEUE (queue→record only, no dispatch); DC-COMPLETE
  (`menu task complete`; nextRunnable/promote; pull-not-push; no-hijack-screen); DC-FAIL
  (`menu task fail`; inbox surfaced); DC-GATE (never auto-cross; "Gate N ready"; --gate;
  --next nav); DC-INTERACTIVE (discuss+decompose; documented choices; decisions awaiting
  review); DC-RULES (Rules 11/12/13 bodies); DC-PRESERVED (Rule-10 heading intact;
  frontmatter effort:low + no model:).
- **SPEC-B behavioral** (over menu-screens.js, tmp-root): B-PROMOTE-run (complete frees a
  plan-serial slot → promote includes the queued implement); B-PROMOTE-cap (≤5 honored);
  B-PROMOTE-failcancel (promote on fail+cancel); B-PROMOTE-blocked (blocked-dep excluded);
  B-PROMOTE-scheduler (touches/gitOp conflict excluded); B-ENTRY-empty (no "Background
  tasks ▸", 4 pipeline options unchanged); B-ENTRY-nonempty (entry present → action `tasks`,
  no digit key); B-ENTRY-corrupt (fail-open).

## Execution Plan (Steps 8–16)

### Step 8 — TEST
- [ ] Write tests/menu-protocol.test.js — all SPEC-A doc-contract + SPEC-B behavioral assertions (RED first).

### Step 9 — PREPARE
- [ ] Confirm no new deps; reuse the mkdtempSync tmp-root harness from menu-task-wiring.test.js.

### Step 10 — IMPLEMENT
- [ ] 10a menu.md: insert the Two-Plane Protocol section (6 subsections) + Rules 11–13 + edit the start-agent/discuss/decompose rows; preserve Rules 1–10, effort:low, no model:.
- [ ] 10b menu-screens.js: fold `promote: nextRunnable(reg).map(...)` into taskComplete + taskTransition(fail/cancel) success returns; add the conditional `Background tasks ▸ → tasks` option to dashboardCommands gated on a non-empty registry (fail-open to omit).

### Step 11 — REVIEW
- [ ] Self-review: classification table total; gate-sacredness reinforced; Rules renumber cleanly; no existing rule altered in meaning.

### Step 12 — OPTIMIZE
- [ ] Tighten recipes to minimal-reasoning form; no duplicated prose between the section and Rules 11–13.

### Step 13 — SECURE
- [ ] --next stays nav-only (isNavRoute); no background task auto-crosses a gate; promote[] contains only registry-resident tasks; no new fs/exec; entry-point control-char safe.

### Step 14 — VERIFY
- [ ] node --test tests/*.test.js → # fail 0 (menu-protocol, slash-command-no-model-pin, inbox-stale-stream SP2 Rule-10, menu-screens, menu-task-wiring); coverage ≥80% on the menu-screens.js additions.

### Step 15 — DOCUMENT
- [ ] JSDoc the promote field on taskComplete/taskTransition and the dashboardCommands conditional.

### Step 16 — FINAL-REVIEW
- [ ] implementation-reviewer verifies 14 dimensions + human-gate sacredness + AC→assertion map; Gate 3 (human).

## Decisions Taken Under Ambiguity
- **D-1 (discuss/decompose become pull):** reclassified as WORK; questions surface as inbox "decisions awaiting review" instead of synchronous matrix prompts — the vision §3e/D4 async-with-documented-choices, approved at Gate 0. The matrix remains the framing.
- **D-2 (legacy start-agent lock):** the legacy startAgent() lock + dashboard AGENT section are left untouched for backward-compat; unifying with the task plane → NB4.
- **D-3 (sync is NAV):** claude:sync is deterministic fast Node → NAV.
- **D-4 (promote-in-response):** fold nextRunnable into the complete/fail/cancel response (atomic, scheduler-consulted every completion) rather than a standalone `menu task next` query.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review

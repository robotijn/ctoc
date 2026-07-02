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
- [x] Write tests/menu-protocol.test.js — all SPEC-A doc-contract + SPEC-B behavioral assertions (RED first). 25 tests, initially 5 pass / 20 fail (RED); all 25 GREEN after implement.

### Step 9 — PREPARE
- [x] Confirm no new deps; reuse the mkdtempSync tmp-root harness from menu-task-wiring.test.js. No new deps; node:test + assert/strict + fs/os/path only.

### Step 10 — IMPLEMENT
- [x] 10a menu.md: inserted the Two-Plane Protocol section (6 subsections) + Rules 11–13 + edited the start-agent/discuss/decompose rows; preserved Rules 1–10, effort:low, no model:.
- [x] 10b menu-screens.js: added `computePromote(reg)` helper; folded `promote` into taskComplete + taskTransition(fail/cancel) success returns; added the conditional `Background tasks ▸ → tasks` option to dashboardCommands gated on a non-empty registry (fail-open to omit).

### Step 11 — REVIEW
- [x] Self-review: classification table total (NAV/WORK rows); gate-sacredness reinforced (Rule 13 + Human-gates subsection cite Rule 4 sacred); Rules 1–13 renumber cleanly; no existing rule altered in meaning.

### Step 12 — OPTIMIZE
- [x] Recipes kept in minimal-reasoning numbered-step form; the interactive framing is stated once in the section, the action rows cross-reference it (no heavy duplication).

### Step 13 — SECURE
- [x] --next stays nav-only (taskComplete's isNavRoute guard unchanged); no background task auto-crosses a gate; promote[] is `nextRunnable(reg)` → only registry-resident queued tasks; no new fs/exec (computePromote is pure; dashboardCommands reads via taskRegistry.load/safe-fs); no new RegExp on non-literals; eslint --max-warnings 0 exit 0.

### Step 14 — VERIFY
- [x] node --test tests/*.test.js → tests 2731, pass 2731, # fail 0, skipped 0. Named guards green: menu-protocol 25/25, slash-command-no-model-pin 5/5, inbox-stale-stream (SP2 Rule-10) 18/18, menu-screens 30/30, menu-task-wiring 35/35. eslint exit 0; typecheck 1/1; readme-numbers 47/47 (untouched). Coverage: every added executable line in menu-screens.js (851-855, 1442-1445, 1469, 1507) is exercised (only the defensive fail-open catch fallback is unmeasured) → ≥80% on the additions.

### Step 15 — DOCUMENT
- [x] JSDoc on `computePromote`; inline NB3 comments on the promote fold in taskComplete/taskTransition and the dashboardCommands fail-open conditional.

### Step 16 — FINAL-REVIEW
- [ ] implementation-reviewer verifies 14 dimensions + human-gate sacredness + AC→assertion map; Gate 3 (human).

## Decisions Taken Under Ambiguity
- **D-1 (discuss/decompose become pull):** reclassified as WORK; questions surface as inbox "decisions awaiting review" instead of synchronous matrix prompts — the vision §3e/D4 async-with-documented-choices, approved at Gate 0. The matrix remains the framing.
- **D-2 (legacy start-agent lock):** the legacy startAgent() lock + dashboard AGENT section are left untouched for backward-compat; unifying with the task plane → NB4.
- **D-3 (sync is NAV):** claude:sync is deterministic fast Node → NAV. NOTE (kickback K-LOW): although NB1 models a `sync` task *kind*, the menu's `claude:sync` is intentionally **foreground NAV** — it runs `fullPlansSync()` inline and re-renders. The modeled kind exists for the scheduler's git-exclusive bookkeeping when sync is ever dispatched as background WORK; the menu action itself stays foreground.
- **D-4 (promote-in-response):** fold nextRunnable into the complete/fail/cancel response (atomic, scheduler-consulted every completion) rather than a standalone `menu task next` query.
- **D-5 (start omits promote):** the `promote[]` fold is added to `complete`, `fail`, and `cancel` only — NOT to `start`. A `start` transition FILLS a concurrency slot rather than freeing one, so it can never make a queued task newly-runnable; computing promote there would be dead work and could mislead the COMPLETION recipe into a spurious dispatch. `start` therefore returns its existing shape unchanged.
- **D-6 (promote item shape):** each `promote[]` entry carries only `{id, kind, plan, touches, gitOp}` — the scheduler inputs plus the id the dispatcher needs — never the whole task object (avoids leaking `result`/`ts`/`agentTaskId` into the render turn and keeps the COMPLETION turn minimal-reasoning). `computePromote(reg)` is a single private helper reused by both `taskComplete` and `taskTransition` (DRY).
- **D-7 (entry placement — Commands, not Pipeline):** the `Background tasks ▸` entry is spliced into `dashboardCommands` (the "More ▶" screen) immediately before `◀ Pipeline`, NOT into `dashboardPipeline`. This keeps the 4-option pipeline (Business/Implementation/Execution/More ▶) byte-stable (its regression tests stay green) while the board is reachable one level in, per the plan's Reaching-the-task-board subsection. Gated on `taskRegistry.load(root).tasks.length > 0` with a fail-open try/catch (a corrupt registry omits the entry rather than breaking Commands).

## Decisions Taken Under Ambiguity — pre-Gate-3 review KICKBACK (2026-07-02)

A code review before Gate 3 (security review was SHIP-READY) found 1 HIGH + 4 MEDIUM + LOWs. Applied within the three plan files; suite kept green (2731 → 2737, all pass). The two load-bearing properties (gate-sacredness: gates human-only; split-brain: record-first dispatch + promote only the scheduler's set) are preserved.

- **K-HIGH (dashboardCommands option overflow — human-facing break):** D-7's splice put a **5th** option (`Background tasks ▸`) on the primary Commands question *before* `◀ Pipeline`. AskUserQuestion caps each question at **4 options**, so truncation dropped Back and stranded the user. FIX (supersedes D-7's splice): the board now rides along as a **SECOND question** on `dashboardCommands` `ask.questions[]` (`Background tasks?` → `View board ▸`→`tasks`, `Not now`→`''`), mirroring the environment (Rule 8) and stale (Rule 10) ride-alongs. The primary Commands question stays **exactly 4 options with ◀ Pipeline intact**; the ride-along is ≤4 options and label-keyed (never a digit — Rule 1). Fail-open: on registry-load error the ride-along is omitted entirely. TDD: the HIGH cap test (`B-ENTRY-cap`) was written first and failed RED (`question "Commands" has 5 options`), then GREEN after the fix.
- **K-MED-1 (classification not total):** the procedure had 3 arms and no default, leaving `claude:cleanup-exec` (SP4, live) unmapped. FIX: added `cleanup-exec` to the NAV-claude list AND an explicit **item 4 default arm** ("Any other `claude:` action not listed above → foreground NAV"). Doc-contract `DC-CLASS-TOTAL` pins the default arm + `cleanup-exec`.
- **K-MED-2 (gate-count contradiction):** the new NB3 prose says "four human gates" but Rule 4 enumerated only "3 human gates" (omitted Gate 0). FIX: Rule 4 now enumerates all **four** (vision→functional Gate 0, functional→implementation Gate 1, implementation→todo Gate 2, review→done Gate 3), agreeing with the NB3 prose, Rule 13's "Rule 4 stays sacred", and CLAUDE.md's "4 Mandatory Approval Points". Grepped the suite: **no test pinned "3 human gates" or Rule 4's exact text** (the only "four human gates" reference was a comment in `security-gate-bypass.test.js`), so the reconciliation broke nothing. New guard `DC-GATE4` pins all four arrows.
- **K-MED-3 (--touches under-specified):** the WORK recipe showed `--touches` but never told Claude to POPULATE it — an empty touches makes NB1's file-conflict rule a no-op for parallel file-editing WORK. FIX: the recipe now MANDATES deriving `--touches` from the target plan's `files:` frontmatter for any file-editing kind and setting `--gitop` for committing kinds. Doc-contract `DC-TOUCHES` anchors on `files:` + `--touches` + `--gitop`.
- **K-MED-4 (doc-contract doesn't pin approve to NAV):** added `DC-CLASS-NAV` — the NAV-claude arm must name `approve`/`reject`/`delete` and the WORK table row must NOT contain any of them, so a future edit moving a gate-crosser into WORK fails the suite.
- **K-LOW-1 (computePromote hardening):** `computePromote` now filters to `/^t\d+$/` ids and `stripCtl`s `id`/`plan` (mirrors the render layer's guard) — a crafted registry id can never ride into a `menu task start <id>` instruction. Test `B-PROMOTE-idfilter`.
- **K-LOW-2 (vacuous-green guard):** `B-PROMOTE-blocked` now also asserts the **UNblocked sibling IS present** in `promote[]`, guarding against a vacuous "promote always empty".
- **K-LOW-3 (menu.md imprecision):** Gate 0 is crossed by `approve-stubs` (WORK), not `approve` — the classification's item 3 now places "Gate 0 → product-owner" on the approve-stubs/WORK path, and the item-2 exception is narrowed to Gate 1 → implementation-planner. See D-3 note on `sync` staying foreground NAV despite NB1's modeled `sync` kind.


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

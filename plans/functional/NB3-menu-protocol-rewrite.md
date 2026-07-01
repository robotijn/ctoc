---
title: "NB3 — Menu Protocol Rewrite (NAV vs WORK)"
type: functional
status: functional
created: 2026-07-01
program: ctoc-menu-ux
parent_vision: "vision/nonblocking-menu-task-plane.md"
priority: HIGH
depends_on: [NB1, NB2]
files:
  - "src/commands/menu.md"
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

---
approved_by: human
approved_at: 2026-07-02T11:00:25.970Z
gate_crossed: functional → implementation
---

---
title: "NB2 — Menu Task Wiring"
type: functional
status: functional
created: 2026-07-01
program: ctoc-menu-ux
parent_vision: "vision/nonblocking-menu-task-plane.md"
priority: HIGH
depends_on: [NB1]
files:
  - "src/commands/menu.js"
  - "src/tabs/overview.js"
  - "src/lib/task-view.js"
  - "tests/menu-task-wiring.test.js"
---

# NB2 — Menu Task Wiring

> Surfaces the NB1 registry through `menu.js`: task subcommands, a TASKS dashboard
> section, task-board + task-detail screens, and an INBOX "background tasks" line.
> Pure policy/state rendering — this stub does NOT launch agents (that is NB3).

## Problem Statement

NB1 gives CTOC a durable, safe registry, but it is invisible: there is no way for a
human to add a task, see what is running or queued, inspect a finished task's
result, or navigate to the next action a completed task points to. The menu must
expose the registry through the two-plane model (vision §3, §3c, §3d): a fast
Navigation plane that reads and renders task state. Without this wiring, the
protocol rewrite (NB3) would have no commands to call and no screens to return to,
and the user could never see or steer the queue (vision Success Criterion 2 — "the
queue is visible").

`menu.js` remains the policy + state brain: it computes screens and owns the
registry via NB1, but it never launches anything. Every subcommand here is a pure
read or a pure registry mutation delegated to NB1.

## Business Alignment

- Realizes vision Success Criterion 2 (queue visible, user can see run/queue state)
  and the presentation half of Criterion 4 (completions surface as pull-based inbox
  items).
- Implements vision §3c task subcommands and §3d "completions become inbox items,"
  honoring **D3** (pull-based inbox integration plus a subtle one-line notice, never
  a disruptive push/modal).
- Keeps the Navigation plane instant (vision §3) — task screens are pure computation
  over the registry, consistent with "menu render is already fast."
- Preserves menu discipline: task screens are numbered menus with `[0]` back, and a
  done task routes the human to its next action rather than acting for them.

## User Stories

- As the user, I want `menu task` subcommands (add / start / complete / fail /
  cancel / list / board), so that task lifecycle state can be recorded and read
  through one interface wrapping NB1.
- As the user, I want a TASKS section on the dashboard, so that I can see at a glance
  how many tasks are running, queued, and done without leaving my current flow.
- As the user, I want a task-board screen, so that I can browse all background tasks
  grouped by status and drill into any one.
- As the user, I want a task-detail screen for a finished task, so that I can read
  its result summary and follow a next-action route (e.g. to the plan it advanced or
  the gate it reached).
- As the user, I want an INBOX "background tasks" line, so that completed work slots
  into the existing inbox as a pull notice, never hijacking my current screen.

## Acceptance Criteria (BDD)

### Task subcommands

```gherkin
Scenario: Adding a task returns an id and a decision
  Given the registry (NB1) is available
  When `menu task add` is invoked with kind, label, plan, touches, gitOp
  Then a task id is returned
  And a scheduler decision (run or queue, with reason) is returned
  And the task is persisted with status "queued"

Scenario: Lifecycle transitions are recorded
  Given a queued task exists
  When `menu task start` is invoked for it
  Then its status becomes "running"
  And when `menu task complete` is invoked with a result, its status becomes "done"
  And `menu task fail` sets status "failed" with the failure recorded
  And `menu task cancel` removes it from the runnable set

Scenario: List renders the current registry
  When `menu task list` is invoked
  Then it returns every task with its status, label, and plan
  And the output is derived purely from the registry (no agent launch)
```

### TASKS dashboard section

```gherkin
Scenario: Dashboard summarizes task counts
  Given 2 running, 1 queued, and 3 done tasks in the registry
  When the dashboard overview is rendered
  Then a TASKS section shows "2 running", "1 queued", and "3 done"
  And the queued line names what it waits on (e.g. "waits: pi1")

Scenario: Empty registry hides noise
  Given no background tasks exist
  When the dashboard is rendered
  Then the TASKS section is absent or shows an empty state
  And rendering does not error
```

### Task-board and task-detail screens

```gherkin
Scenario: Task board groups by status
  Given tasks in running, queued, done, and failed states
  When the task-board screen is rendered
  Then tasks are grouped under their status headings
  And each entry is selectable to open its detail screen
  And the screen offers a numbered menu with [0] back

Scenario: Done task detail shows result and next action
  Given a task with status "done" and a result summary
  When its task-detail screen is rendered
  Then the result summary is shown
  And a next-action route is offered (to the plan it advanced or the gate reached)
  And selecting it navigates there without performing the action automatically
```

### INBOX integration

```gherkin
Scenario: Completions appear as an inbox line
  Given 3 tasks completed and produced decisions awaiting review
  When the dashboard INBOX is rendered
  Then a "background tasks" line reflects the completed work
  And it is a pull notice — it does not change the user's current screen

Scenario: A task that reached a human gate is an inbox item, not auto-crossed
  Given a done task whose plan reached a human gate
  When the inbox is rendered
  Then it appears as a "Gate N ready" item
  And no gate transition has been performed
```

## Scope

**In:**
- `menu task` subcommands: add, start, complete, fail, cancel, list, board —
  each wrapping NB1's registry (read or mutate), returning data for rendering.
- TASKS dashboard section (running / queued / done counts, queued wait reasons).
- Task-board screen (grouped by status, drill-in, numbered menu with `[0]` back).
- Task-detail screen (done → result summary + next-action route).
- INBOX "background tasks" line as a pull notice; gate-reached tasks as inbox items.
- Behavioral tests (pure JS, no native deps), coverage ≥ 80%.

**Out:**
- Launching or dispatching agents; the WORK/NAV turn protocol (→ NB3).
- Deciding run/queue rules (owned by NB1's scheduler; NB2 only calls it).
- Session-restart reconciliation, failure surfacing, sweeps (→ NB4).
- Any human-gate transition (gates stay foreground and are never auto-crossed).

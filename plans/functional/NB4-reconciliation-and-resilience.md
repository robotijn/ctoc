---
title: "NB4 — Reconciliation and Resilience"
type: functional
status: functional
created: 2026-07-01
program: ctoc-menu-ux
parent_vision: "vision/nonblocking-menu-task-plane.md"
priority: MEDIUM
depends_on: [NB1, NB2]
files:
  - "src/lib/task-reconcile.js"
  - "tests/task-reconcile.test.js"
---

# NB4 — Reconciliation and Resilience

> Makes the task plane survive the messy edges: a session restart that orphans a
> "running" task with no live harness agent, a background agent that fails, a
> corrupt registry, and stale/orphaned temp state. Mirrors the existing
> `cleanupStaleInProgress` pattern rather than inventing a new one.

## Problem Statement

The registry (NB1) records tasks as `running`, but a background agent lives in the
harness, not in the registry. When a session restarts, a task can be left marked
`running` while its harness agent no longer exists — an orphan. If nothing detects
this, the scheduler will forever count a phantom toward the ≤5 concurrency limit and
the queue will stall. Likewise, an agent that fails must never be silently lost, a
corrupt registry must never brick the menu, and orphaned temp files or long-stale
tasks must be swept so the registry does not accumulate rot.

CTOC already reconciles this class of problem for in-progress plans via
`cleanupStaleInProgress`. NB4 mirrors that pattern for background tasks: on menu
open, detect orphans by comparing registry `running` tasks against the live harness
`TaskList` and staleness heuristics, mark unmatched ones `orphaned`, and offer them
for re-run. This closes vision Success Criterion 5.

## Business Alignment

- Realizes vision Success Criterion 5 in full: session restart reconciles orphaned
  tasks; agent failure surfaces (never silently lost); corrupt registry fails open.
- Implements vision §4 (resilience), §7 NB4, and §8 risks (registry/harness drift →
  reconcile via `TaskList` + staleness; session-boundary orphans → detected and
  offered for re-run on menu open).
- Honors **D1** (corrupt-registry fail-open) and **D2** (harness agents are the
  executor; registry mirrors them and is reconciled via `TaskList` on demand).
- Mirrors the established `cleanupStaleInProgress` reconciliation pattern, per
  project practice of reusing proven mechanisms rather than reinventing.

## User Stories

- As the user reopening the menu after a restart, I want tasks left `running` with no
  live harness agent to be detected and marked `orphaned`, so that phantom tasks stop
  blocking the concurrency limit and the queue.
- As the user, I want each orphaned task offered for re-run, so that I can decide
  whether to resume interrupted work instead of losing it.
- As the user, I want a failed background agent to always surface in the task plane
  and inbox, so that failures are never silently lost.
- As the operator, I want a corrupt registry to fail open, so that a damaged state
  file never blocks navigation.
- As the operator, I want orphaned temp files and long-stale tasks swept, so that the
  registry and state directory do not accumulate rot over long sessions.

## Acceptance Criteria (BDD)

### Session-restart orphan detection

```gherkin
Scenario: Running task with no live harness agent is orphaned
  Given the registry marks a task "running"
  And the live harness TaskList contains no matching agent for it
  When reconciliation runs on menu open
  Then the task is marked "orphaned"
  And it no longer counts toward the concurrency limit

Scenario: Running task with a matching live agent is left alone
  Given the registry marks a task "running"
  And the harness TaskList contains a matching live agent
  When reconciliation runs
  Then the task remains "running"
  And it is not modified

Scenario: Staleness backstops missing TaskList data
  Given a task marked "running" whose started timestamp is older than the staleness threshold
  And no matching live agent can be confirmed
  When reconciliation runs
  Then the task is marked "orphaned"

Scenario: Orphaned tasks are offered for re-run
  Given one or more tasks were marked "orphaned" during reconciliation
  When the menu presents the result
  Then each orphaned task is offered as a re-run option
  And re-running it goes through the normal scheduler (canRun) path, not a direct launch
```

### Failure surfacing and fail-open

```gherkin
Scenario: Agent failure is never silently lost
  Given a background task failed
  When reconciliation or completion handling runs
  Then the task is recorded as "failed" with its failure detail
  And it appears in the inbox / task plane

Scenario: Corrupt registry fails open during reconciliation
  Given .ctoc/state/tasks.json is corrupt
  When reconciliation runs on menu open
  Then it does not throw
  And the menu still renders
  And the corruption is surfaced (recorded), not swallowed silently
```

### Sweeps

```gherkin
Scenario: Long-stale terminal tasks are swept
  Given done/failed/orphaned tasks older than the retention threshold
  When the stale-task sweep runs
  Then those tasks are pruned from the active registry view
  And active (queued/running) tasks are never swept

Scenario: Orphaned temp artifacts are cleaned
  Given a temp artifact left behind by an interrupted atomic write
  When the sweep runs
  Then the orphaned temp artifact is removed
  And the canonical registry file is untouched
```

## Scope

**In:**
- Session-restart orphan detection on menu open: compare registry `running` tasks
  against the harness `TaskList` plus a staleness threshold; mark unmatched as
  `orphaned`; mirror the `cleanupStaleInProgress` pattern.
- Offer orphaned tasks for re-run, routed back through the NB1 scheduler.
- Agent-failure surfacing so failures always reach the task plane and inbox.
- Corrupt-registry fail-open during reconciliation.
- Orphaned-temp and long-stale terminal-task sweeps (never touching active work).
- Behavioral tests (pure JS, no native deps), coverage ≥ 80%.

**Out:**
- The registry model, persistence, and scheduler themselves (owned by NB1).
- Subcommands, dashboard, and screens (owned by NB2) — NB4 feeds them state.
- The NAV/WORK dispatch protocol (owned by NB3).
- Reinventing harness background execution (vision non-goal — we mirror `TaskList`).

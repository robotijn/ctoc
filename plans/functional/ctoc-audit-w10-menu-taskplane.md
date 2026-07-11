---
title: "W10 — Menu and Task-Plane Robustness"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
status: stub
depends_on: none
---

# W10 — Menu and Task-Plane Robustness

## Problem

The menu and task-plane layer has six load-bearing defects that make advertised
operations fail silently or crash:

- **`/ctoc:push` invokes a `ctoc push` CLI that does not exist.** There is no
  `src/commands/push.js` and no `bin` entry; the slash command's instructions
  point at a command that resolves to nothing, so the documented push flow is a
  dead end. (H3)
- **Orphan reconciliation always runs blind.** `liveAgentIds` is hardcoded to
  `null` and `agentTaskId` is never set at `menu task start`, so reconcile cannot
  tell a live background agent from a dead one. A long-running background
  `implement` task is falsely flagged orphaned: a duplicate agent is offered on
  the same plan, the ≤5 concurrency cap under-counts the real live set, and the
  agent's genuine completion is later rejected as an invalid `orphaned → done`
  transition. (H8)
- **Multi-word task args are truncated.** `menu task complete --summary "two words"`
  persists only `"two"` because the argument vector is re-split on whitespace
  after the shell already tokenized it; the same bug hits `--next`. (M6)
- **Unknown-stage and traversal inputs crash raw.** `node menu.js "plan bogus/x.md"`
  throws a raw stack trace instead of returning the JSON error contract, because
  `route()` has no unknown-stage guard, and `planActions`/`reviewActions` lack the
  `isUnsafePlanFile` traversal guard that `validateScreen` already applies. (M8, M11)
- **The Settings screen is inert.** The `s` Settings screen renders keys that are
  all dead — the handler is never dispatched, so every keystroke on that screen is
  a no-op. (M12)
- **The index sync is killed mid-flight.** `PostToolUse.plan-index-sync` calls
  `syncUnit` and then immediately `process.exit(0)`, terminating the process before
  the sync's microtask can run — the index update is silently lost. (part of task-plane robustness)

## Scope

- Ship `src/commands/push.js` as a real entry point and repoint `push.md` at it.
- Plumb the live-harness agent-id list into `reconcile()`, and set `agentTaskId` in
  `menu task start`, so a live background agent is never treated as orphaned.
- Stop re-splitting multi-word `--summary` / `--next` task arguments; consume them
  as single already-tokenized values.
- Guard `route()` against an unknown stage (return the JSON error contract, not a
  stack), and apply the `isUnsafePlanFile` traversal guard to `planActions` and
  `reviewActions`.
- Delegate the Settings-screen keys to `toolsTab.handleKey` so they actually dispatch.
- Await the index sync before the PostToolUse hook exits.

**Does NOT touch:** the enforcement/gate hooks themselves (W1, W2, W8), the audit-log
durability or agent-lock atomicity (W11), the registry/agent-resolution layer (W3, W4),
or any Iron Loop step semantics. This workstream is confined to the menu router,
task-plane commands, the push entry point, and the index-sync hook's exit ordering.

## Story Map

### Goal: The menu and task-plane operate as advertised — every documented command has a real, crash-safe entry point, and the task plane tracks live agents truthfully.
- **Actor:** The CTOC maintainer driving the menu / task plane (interactive and scripted).
- **Impact:** The maintainer can run `/ctoc:push`, complete tasks with real multi-word
  summaries, and trust the concurrency cap and orphan logic — without hitting a missing
  command, a truncated summary, or a raw crash.
- **Success metric:** All six defects (H3, H8, M6, M8, M11, M12) have a test that fails
  on current `main` and passes after the fix; no menu path returns a raw stack.

### Activity 1: Invoke a documented operation (push)
- `[MVP]` As a maintainer, I want `/ctoc:push` to resolve to a real `push.js` entry
  point, so that the documented push flow runs instead of hitting a missing command.
- As a maintainer, I want `push.md` to point at the shipped entry point, so that the
  slash command and the code agree.

### Activity 2: Run a background agent and reconcile orphans
- `[MVP]` As a maintainer, I want `menu task start` to record `agentTaskId` and
  reconcile to receive the live agent-id list, so that a live background agent is never
  falsely orphaned.
- As a maintainer, I want the ≤5 concurrency cap to count the real live set, so that I
  am not offered a duplicate agent on a plan that is already running.
- As a maintainer, I want a genuinely live agent's completion to be accepted, so that
  the real `implement → done` transition is not rejected as an invalid orphaned move.

### Activity 3: Complete and route tasks safely
- `[MVP]` As a maintainer, I want `menu task complete --summary "two words"` to persist
  the full multi-word summary (and the same for `--next`), so that my notes are not
  truncated to the first word.
- As a maintainer, I want `node menu.js "plan bogus/x.md"` to return the JSON error
  contract, so that an unknown stage or a traversal path fails safely instead of crashing.
- As a maintainer, I want the `s` Settings screen keys to dispatch through
  `toolsTab.handleKey`, so that the Settings screen is not inert.
- As a maintainer, I want the PostToolUse index sync to complete before process exit, so
  that the plan index is not silently stale after a tool call.

## Rough acceptance criteria (Given/When/Then — each a behavior a test can DRIVE)

1. **Push entry point exists (H3).** Given a checkout, When the test resolves the target
   of `/ctoc:push`, Then `src/commands/push.js` exists and is executable and `push.md`
   references it. Running the entry point on a clean tree returns a success contract, not
   "command not found".
2. **Live agent not orphaned (H8).** Given a background agent whose id is in the live
   agent-id list and whose `agentTaskId` was set at start, When `reconcile()` runs, Then
   that agent's task is NOT marked orphaned, the live count includes it against the ≤5 cap,
   and its subsequent completion is accepted (not rejected as `orphaned → done`).
3. **Blind reconcile is fixed (H8).** Given `liveAgentIds` is now supplied by the harness,
   When no live id matches a task, Then only genuinely dead tasks are reconciled — a test
   asserts a live-id task and a dead-id task get opposite outcomes.
4. **Multi-word summary persists (M6).** Given `menu task complete --summary "two words"`,
   When the task record is read back, Then the stored summary is exactly `"two words"`
   (and `--next "do the next thing"` stores the full phrase).
5. **Unknown stage returns contract (M8).** Given `node menu.js "plan bogus/x.md"`, When
   the router runs, Then it returns the documented JSON error contract with a non-zero
   status and NO raw stack trace on stderr.
6. **Traversal guarded (M11).** Given a `planActions`/`reviewActions` call with a
   `../`-style path, When it runs, Then `isUnsafePlanFile` rejects it with the same guard
   `validateScreen` uses — a test drives a traversal path and asserts rejection.
7. **Settings keys dispatch (M12).** Given the `s` Settings screen, When a settings key is
   pressed, Then `toolsTab.handleKey` receives it and the corresponding action fires — a
   test asserts the handler is invoked with the key (not a no-op).
8. **Index sync awaited.** Given a PostToolUse plan-index-sync, When the hook completes,
   Then `syncUnit` has resolved before `process.exit` — a test asserts the index reflects
   the change after the hook returns.

## Findings addressed

H3, H8, M6, M8, M11, M12.

## INVEST status (per story)

| Story | I | N | V | E | S | T | Notes |
|-------|---|---|---|---|---|---|-------|
| push entry point (H3) | Y | Y | Y | Y | Y | Y | Standalone; no dependency on other stories. |
| repoint push.md | Y | Y | Y | Y | Y | Y | Small; pairs naturally with the entry point but independently testable. |
| agentTaskId + liveAgentIds (H8) | Y | Y | Y | Y | Y | Y | Foundation for the two reconcile stories; independently valuable. |
| cap counts live set (H8) | ~ | Y | Y | Y | Y | Y | Depends on the id-plumbing story; small once ids exist. |
| completion accepted (H8) | ~ | Y | Y | Y | Y | Y | Depends on the id-plumbing story; vertical (transition-level test). |
| multi-word args (M6) | Y | Y | Y | Y | Y | Y | Fully independent; small parser fix. |
| unknown-stage contract (M8) | Y | Y | Y | Y | Y | Y | Independent router guard. |
| traversal guard (M11) | Y | Y | Y | Y | Y | Y | Reuses existing `isUnsafePlanFile`; independent. |
| Settings keys (M12) | Y | Y | Y | Y | Y | Y | Independent; delegate to existing handler. |
| index-sync await | Y | Y | Y | Y | Y | Y | Independent hook-ordering fix. |

All stories are Small (≤3 days) and Testable. The three H8 stories share the id-plumbing
foundation (max dependency depth 2, within the ≤3 limit) and are not fully Independent by
design — they are the walking skeleton plus two ribs of one reconcile capability.

## Decisions Taken Under Ambiguity

- **No canvas / no Business Model Canvas (N/A).** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation vision;
  a Business Model Canvas is not applicable. Proceeded with vision-only extraction rather
  than kicking back.
- **Push semantics.** The vision names "a real entry point for `/ctoc:push`" but does not
  specify what push does beyond existing. Chose to scope `push.js` as the entry point that
  the existing `push.md` already describes (git push flow), rather than inventing new
  behavior — the Product Owner refines the exact contract. This avoids scope creep into
  release/metadata truth (W9).
- **`agentTaskId` vs `liveAgentIds` ownership.** The fix needs both a produced id (at task
  start) and a consumed live-id list (at reconcile). Treated them as one foundation story
  because they are two ends of the same pointer; splitting them would create a story that
  cannot be tested end-to-end on its own (horizontal slice).

---
description: Show CTOC dashboard status and menu
---

Show the CTOC dashboard:

```bash
node "${CLAUDE_PLUGIN_ROOT}/commands/ctoc.js"
```

## Iron Loop Auto-Pilot

**IMPORTANT:** Check after showing dashboard:
- If Todo has plans AND Agent is idle → **Auto-pick up and implement**
- If In Progress complete → **Auto-move to Review**
- If Review approved → **Auto-move to Done**

### Auto-Pickup Behavior

After showing dashboard, automatically check:
1. Is Agent idle? (no active implementation)
2. Is Todo > 0? (plans waiting in `todo/`)

If BOTH true:
1. Announce: "Auto-picking up: {plan-name}"
2. Move plan from `todo/` → `in-progress/`
3. Set agent status to active via `setAgentStatus()`
4. Spawn background agent with Task tool:
   ```
   Task(
     subagent_type: "general-purpose",
     run_in_background: true,
     prompt: "Execute the plan at {plan-path}. Follow Steps 7-15 in order. Mark each checkbox [x] when complete. When Step 15 is done, move plan to review."
   )
   ```
5. Dashboard shows: "● Active: {plan-name} | Step {n}/15"

### Iron Loop Integration on Approval

When a plan moves from `implementation/` to `todo/`:
1. The `approvePlan()` function triggers `applyIronLoop()`
2. `applyIronLoop()` runs the Integrator + Critic refinement loop
3. Detailed execution steps (7-15) are generated and appended to the plan
4. If max rounds reached without all 5/5 scores, deferred questions are noted
5. Plan enters todo queue with concrete, scorable execution steps

## Dashboard Format

```
CTOC v{version}
────────────────────────────────────────────────────────────

┌────────────────┬────────┬─────────────────┐
│ Stage          │ Count  │ Status          │
├────────────────┼────────┼─────────────────┤
│ Functional     │ {n}    │ {status}        │
│ Implementation │ {n}    │ {status}        │
│ Todo           │ {n}    │ {status}        │
│ In Progress    │ {n}    │ {status}        │
│ Review         │ {n}    │ {status}        │
│ Done           │ {n}    │ {status}        │
└────────────────┴────────┴─────────────────┘

AGENT
  ● Active: {task} | Step {n}/15
  ○ Idle

────────────────────────────────────────────────────────────
MENU

  [1] functional       Browse functional plans
  [2] implementation   Browse implementation plans
  [3] todo             Browse todo queue
  [4] in progress      Browse active work
  [5] review           Browse review queue
  [6] done             Browse completed
  ─────────────────────────────────────
  [7] release          Bump version
  [8] update           Update CTOC
  [9] settings         Configuration
  [0] back             Exit dashboard
```

## Browse View Format

```
[{stage}] ({count} items)

  [1] {filename}
  [2] {filename}
  [3] {filename}
  ...
  [0] back    [p] prev    [n] next     ← only show [p]/[n] when >1 page
```

## Action Menu Format (after selecting a file)

```
Selected: {filename}

★ [1] view      Show plan contents
  [2] edit      Modify plan
  [3] discuss   Critique and refine
  [4] approve   Move to next stage
  [5] delete    Remove plan
  [0] back      Return to list
```

- Star (★) indicates recommended action
- Always show reasoning: "→ Recommended: [n] because {reason}"

## Folder Mapping (Flat Structure)

| # | Stage | Folder |
|---|-------|--------|
| 1 | functional | `plans/functional/` |
| 2 | implementation | `plans/implementation/` |
| 3 | todo | `plans/todo/` |
| 4 | in progress | `plans/in-progress/` |
| 5 | review | `plans/review/` |
| 6 | done | `plans/done/` |

## Handling User Input

**Context-aware:** After showing a numbered menu, interpret digits as selection.

| Input | Action |
|-------|--------|
| `1-9` | Select menu item |
| `0` | Go back to parent |
| `s` | Start implementing next from todo (one at a time) |
| `r` | Refresh dashboard (re-run /ctoc) |
| `p` | Previous page (if paginated) |
| `n` | Next page (if paginated) |
| `a`, `b`, `c` | Select option A/B/C in discussions |
| Action word | Execute action (create, edit, delete, etc.) |
| Natural language | Interpret and execute |

## Start Implementation [s]

When user presses `s` (and agent is idle + todo > 0):

1. Get oldest plan from todo queue (FIFO)
2. Move plan from `todo/` → `in-progress/`
3. Set agent status to active
4. Spawn background agent with Task tool:
   ```
   Task(
     subagent_type: "general-purpose",
     run_in_background: true,
     prompt: "Execute the plan at {plan-path}. Follow Steps 7-15 in order. Mark each checkbox [x] when complete. When Step 15 is done, move plan to review."
   )
   ```
5. Show dashboard with agent status: "● Active: {plan-name}"
6. User can continue other work while agent runs

**One at a time:** Only one plan is implemented at a time. Agent must complete current plan before picking up next.

**Continuous mode:** When agent finishes a plan:
1. Move completed plan to review
2. Check if todo queue has more plans
3. If yes → auto-pickup next (no user input needed)
4. If no → return to idle, show dashboard
5. Continue until todo is empty

**Agent status sync:** When spawning agent:
1. Before spawn: `setAgentStatus(projectPath, { active: true, plan: planName, step: 7 })`
2. After completion: `clearAgentStatus(projectPath)`
3. Dashboard reads from `.ctoc/state/agent.json` for status

**Error handling:** Invalid number → "Invalid option, try 1-{max}"

**Empty state:** Show "(empty)" with only [0] back

## Discuss Action (Iron Loop Critical Review)

When user says "discuss" or selects discuss option:

1. **Critique** - Find gaps, question assumptions, identify risks

2. **Present Options** - For each decision point:
   ```
   Option A: {name}
     Pros: ...
     Cons: ...

   Option B: {name}
     Pros: ...
     Cons: ...

   → Recommended: {A/B} because {reasoning}
   ```

3. **Ask Questions** - Clarify ambiguous requirements

4. **Refine** - Update plan based on user input

**RULES:**
- User controls discussion - NEVER say "discussion complete"
- Always show discuss option
- User decides when ready - only user can approve
- Show reasoning for recommendations

## Actions Per Stage

| Action | Description |
|--------|-------------|
| create | Create new plan |
| view | Show plan contents |
| edit | Modify plan |
| discuss | Critique and refine |
| approve | Move to next stage |
| delete | Remove plan |
| rename | Rename plan |
| move | Move to specific stage |

---
description: Show CTOC dashboard status and menu
---

Show the CTOC dashboard:

```bash
node "${CLAUDE_PLUGIN_ROOT}/commands/ctoc.js"
```

## Dashboard Shows

- Pipeline table (Functional → Implementation → Todo → In Progress → Review → Done)
- Agent status (idle or active)
- Fixed menu with 9 options

## User Workflow

**Step 1: Browse a stage (1-6)**
User types `1` to browse functional plans folder.

**Step 2: Take action**
User describes action: `create`, `edit`, `rename`, `delete`, `approve`, `move`

## Menu Options

| # | Stage | Folder |
|---|-------|--------|
| 1 | functional | `plans/functional/draft/` |
| 2 | implementation | `plans/implementation/draft/` |
| 3 | todo | `plans/implementation/approved/` |
| 4 | in progress | `plans/implementation/in-progress/` |
| 5 | review | `plans/implementation/review/` |
| 6 | done | `plans/implementation/done/` |
| 7 | release | Bump version |
| 8 | update | Update CTOC |
| 9 | settings | Configuration |

## Actions Per Stage

| Action | Description |
|--------|-------------|
| create | Create new plan in current stage |
| edit | Edit existing plan |
| rename | Rename a plan |
| delete | Delete a plan |
| **discuss** | **Critique plan, ask questions, refine** |
| approve | Move to next stage |
| move | Move to specific stage |
| view | View plan contents |

## Discuss Action (Iron Loop Critical Review)

When user says "discuss" on a plan:

1. **Critique** - Find gaps, question assumptions, identify risks

2. **Present Options** - For each decision point show:
   - All viable options
   - Pros and cons of each
   - **Recommended option with reasoning**

3. **Ask Questions** - Clarify ambiguous requirements

4. **Refine** - Update plan based on user input

**IMPORTANT RULES:**
- **User controls discussion** - NEVER say "discussion complete"
- **Always show discuss option** - User can loop as many times as needed
- **User decides when ready** - Only user can approve or end discussion
- **Show reasoning** - Explain WHY you recommend something

**Option Format:**
```
Option A: [name]
  Pros: ...
  Cons: ...

Option B: [name]
  Pros: ...
  Cons: ...

→ Recommended: [A/B] because [reasoning]
```

## Handling User Input

- **Number (1-9)**: Browse that stage or execute command
- **Action + target**: Execute action (e.g., "create user auth feature")
- **Natural language**: Interpret and execute

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
| approve | Move to next stage |
| move | Move to specific stage |
| view | View plan contents |

## Handling User Input

- **Number (1-9)**: Browse that stage or execute command
- **Action + target**: Execute action (e.g., "create user auth feature")
- **Natural language**: Interpret and execute

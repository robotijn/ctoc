---
description: CTOC Dashboard - Your Virtual CTO command center
---

Run the state machine to get the current screen as JSON:

```bash
node "${CLAUDE_PLUGIN_ROOT}/commands/menu.js"
```

## State Machine Protocol

The command outputs JSON: `{ text, ask, actions }`.

- **text**: Display this text to the user (always ends with `\n\n\n`)
- **ask**: Pass directly to AskUserQuestion tool
- **actions**: Maps each option label to the next command or `claude:` action

### Navigation Commands

| Command | Screen |
|---------|--------|
| (no args) | Dashboard Pipeline |
| `menu commands` | Dashboard Commands |
| `browse {stage}` | Stage plan list |
| `plan {stage}/{file}` | Plan actions |
| `plan {stage}/{file} more` | Plan more actions |
| `plan {stage}/{file} discuss` | Discussion menu |
| `validate {stage}/{file}` | Pre-transition validation |

### Claude Actions (handle in conversation)

| Action | What to do |
|--------|-----------|
| `claude:view {ref}` | Read and display the plan file |
| `claude:discuss` | Critique the plan, then show discussion menu |
| `claude:edit` | Help user edit the plan |
| `claude:approve {ref}` | Run approvePlan(), show result, return to stage list |
| `claude:create-plan {stage}` | Create new plan in stage, enter discussion |
| `claude:delete {ref}` | Delete plan file, return to stage list |
| `claude:reject {ref} {dest}` | Reject plan to destination stage |
| `claude:vision` | Enter Vision Mode |
| `claude:start-agent` | Spawn background executor agent |
| `claude:stop-agent` | Set stop flag for agent |
| `claude:sync` | Run fullPlansSync(), show result |

### Rules

1. Always show AskUserQuestion after every response
2. Auto-discuss when creating new plans
3. Dashboard always shows Functional(n), Implementation(n), Review(n), More -- even when count is 0
4. 3 human gates: functional->implementation, implementation->todo, review->done
5. Pre-validate before every approve (run `validate` command first)

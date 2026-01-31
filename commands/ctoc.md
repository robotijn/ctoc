---
description: Show CTOC dashboard status and recommended actions
---

Show the CTOC dashboard:

```bash
node "${CLAUDE_PLUGIN_ROOT}/commands/ctoc.js"
```

This displays:
- Pipeline status (functional/implementation/review/todo/in-progress/done counts)
- Agent status (idle or active with current step)
- Lists of actual plans in each stage
- Recommended actions based on current state

**Follow-up commands the user might say:**

| Command | Action |
|---------|--------|
| "create functional plan" | Create new functional requirements plan |
| "show functional plans" | List functional drafts |
| "show implementation plans" | List implementation drafts |
| "show review queue" | List pending reviews |
| "show todo" | List queued work items |
| "show progress" | Show current implementation progress |
| "approve [plan]" | Approve a plan to next stage |
| "start [plan]" | Begin implementation of a plan |
| "release" | Bump version and release |
| "release minor" | Minor version bump |
| "release major" | Major version bump |
| "update" | Update CTOC to latest version |
| "settings" | Show/change CTOC settings |

Execute the appropriate action based on user's natural language request.

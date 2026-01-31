---
description: Launch the CTOC interactive dashboard
---

## CTOC Interactive Dashboard

First, get the current status:

```bash
node "${CLAUDE_PLUGIN_ROOT}/commands/ctoc.js"
```

The output will contain `CTOC_DASHBOARD_DATA:` followed by JSON with:
- `version`: Current CTOC version
- `plans`: Counts for functional, implementation, review, todo, inProgress
- `agent`: Current agent status (active, name, step, phase)
- `tabs`: Available tabs
- `actions`: Available actions per tab

**Present this as an interactive dashboard using AskUserQuestion:**

1. Show a formatted status summary (version, plan counts, agent status)
2. Ask user which tab/action they want using AskUserQuestion with options:
   - Overview (release)
   - Functional Plans (new, view, assign)
   - Implementation Plans (view, approve, reject)
   - Review Queue (approve, reject)
   - Todo Queue (start, skip)
   - Tools (doctor, update, settings)
   - Exit

3. Based on selection, either:
   - Show more details (list plans, show content)
   - Perform action (run corresponding command)
   - Return to main menu

4. Continue looping until user selects Exit

**Example flow:**
```
CTOC v5.2.32

Plans: 2 functional, 1 implementation, 0 review, 3 todo
Agent: Idle

[AskUserQuestion: Which tab? Overview/Functional/Implementation/Review/Todo/Tools/Exit]
-> User selects "Functional"

[AskUserQuestion: Functional Plans (2 drafts) - What action? View list/Create new/Back]
-> User selects "View list"

[Show list of functional plans]
[AskUserQuestion: Select plan or Back]
```

---
description: CTOC Dashboard - Your Virtual CTO command center
---

Run the state machine to get the current screen as JSON:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js"
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
| `stubs {slug}` | Vision stubs browse (human checkpoint) |
| `validate {stage}/{file}` | Pre-transition validation |

### Claude Actions (handle in conversation)

| Action | What to do |
|--------|-----------|
| `claude:view-edit {ref}` | Display the plan file, then help the user edit it (View and Edit are one action) |
| `claude:discuss` | Critique the plan to find gaps and weak assumptions. Ask the user about each gap **one question at a time** using the decision-matrix format — Read `${CLAUDE_PLUGIN_ROOT}/.ctoc/ask-me-questions.md` and follow it exactly (Unicode-box matrix with Option / Pros / Cons / Recommendation columns, then AskUserQuestion). Then show the discussion menu. |
| `claude:edit` | Help user edit the plan (used by the discussion menu's Apply edits) |
| `claude:approve {ref}` | Run approvePlan(), show result, return to stage list |
| `claude:create-plan {stage}` | Create new plan in stage, enter discussion |
| `claude:delete {ref}` | Delete plan file, return to stage list |
| `claude:reject {ref} {dest}` | Reject plan to destination stage |
| `claude:vision` | Enter Vision Mode |
| `claude:decompose {slug}` | Run Vision Decomposer on a ready vision |
| `claude:approve-stubs {slug}` | Hand off stubs to PO Agent, move vision to done/ |
| `claude:edit-stubs {slug}` | Present stub table, allow user to modify stubs |
| `claude:add-stub {slug}` | Create a new stub for an in-progress decomposition |
| `claude:start-agent` | Call startAgent(). If started: implement the plan sequentially (Steps 7-15). After each plan completes (moved to review), call advanceAgent() to get next plan or stop. |
| `claude:stop-agent` | Call stopAgent(). Shows confirmation message. Agent will finish current plan then stop. |
| `claude:sync` | Run fullPlansSync(), show result |

### Rules

1. Always show AskUserQuestion after every response
2. Auto-discuss when creating new plans — ask every discussion question via the `.ctoc/ask-me-questions.md` matrix format: one question per turn, the Unicode-box matrix first, then AskUserQuestion
3. Dashboard pipeline shows the 3 v7 sections: Business, Implementation, Execution, More (counts in descriptions, labels are stable)
4. 3 human gates: functional->implementation, implementation->todo, review->done
5. Pre-validate before every approve (run `validate` command first)
6. Menu rendering and all CTOC slash commands inherit the user's chosen session model; no model pin is set in command frontmatter (removed in v6.9.28 to avoid forced context compaction in long sessions)
7. The menu auto-initializes CTOC on first run: if the project has no `.ctoc/` directory, `menu.js` runs `initProject()` before rendering (creates `.ctoc/`, `plans/`, `CLAUDE.md` if absent). There is no separate init command — opening the menu is the trigger.
8. **NOTES.md awareness**: when invoking the menu, if `<project-root>/NOTES.md` exists, read it (with the Read tool) before rendering the AskUserQuestion. If it contains any bullet lines (`- ...`), surface them to the user in your response — quote them concisely so the user is reminded what's queued, and offer to triage (act on now, convert to plans, or leave for later). NOTES.md is the user → Claude inbox (web client appends to it); it is distinct from `.ctoc/inbox/` which is the agent → user direction. The dashboard NOTES section shows the count; this rule ensures Claude has actually read the contents, not just glanced at the count.

CTOC ships exactly three slash commands: `menu`, `push`, `update`. Every other workflow — vision, planning, quality, review, agent runs — goes through the menu.

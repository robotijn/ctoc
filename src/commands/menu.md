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
- **ask**: Pass directly to AskUserQuestion tool — EXCEPT when the screen sets `inputMode: "plan-select"` (plan lists). Then do NOT call AskUserQuestion.
- **inputMode**: when `"plan-select"`, show the plan list and take a FREE-TEXT reply — a number opens that plan, `n`/`b` navigate (see Rule 1).
- **actions**: Maps each reply (a plan number, or a word like `n`/`b`/an option label) to the next command or `claude:` action

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
| `claude:set-environment {env}` | Persist the chosen CTOC environment: run `node -e "require('${CLAUDE_PLUGIN_ROOT}/src/lib/settings').setSetting('general','environment','{env}')"`, confirm the choice to the user, then continue with the user's pipeline-section choice (or re-open the dashboard if none). |
| `claude:env-decide-later` | No-op: do not persist anything; continue with the user's pipeline-section choice. The environment question will ride along again next time. |

### Rules

1. **Numbers are reserved EXCLUSIVELY for opening a plan.** A number must NEVER be a shortcut for navigation or any other action, on any screen. On a plan list (`inputMode: "plan-select"`) do NOT call AskUserQuestion — render the list and accept a FREE-TEXT reply: a number of any length (e.g. `25`) opens that plan via `actions[number]`; `n`/`new` and `b`/`back` are the only non-plan shortcuts (words, never numbers). On other screens, present the options and accept the option's word/label (case-insensitive) — AskUserQuestion may be used there, but a number must never map to a non-plan action.
2. Auto-discuss when creating new plans — ask every discussion question via the `.ctoc/ask-me-questions.md` matrix format: one question per turn, the Unicode-box matrix first, then AskUserQuestion
3. Dashboard pipeline shows the 3 v7 sections: Business, Implementation, Execution, More (counts in descriptions, labels are stable)
4. 3 human gates: functional->implementation, implementation->todo, review->done
5. Pre-validate before every approve (run `validate` command first)
6. Menu rendering and all CTOC slash commands inherit the user's chosen session model; no model pin is set in command frontmatter (removed in v6.9.28 to avoid forced context compaction in long sessions)
7. The menu auto-initializes CTOC on first run: if the project has no `.ctoc/` directory, `menu.js` runs `initProject()` before rendering (creates `.ctoc/`, `plans/`, `CLAUDE.md` if absent). There is no separate init command — opening the menu is the trigger.
8. Environment question rides along, never gates: when the CTOC environment is unset (`general.environment: ask`), `menu.js` renders the **normal dashboard** (plan overview across all phases) and attaches the environment question as a **second** question in `ask`. Present both questions in one AskUserQuestion call. Handle the answers in this order: if the environment answer is Development/Staging/Production, run `claude:set-environment {env}` first; then follow the pipeline-section action. "Decide later" persists nothing. The dashboard must NEVER be replaced by the environment question. The environment (dev/staging/prod) only tunes CTOC's own behavior — it never weakens the four human gates.

9. **Reasoning depth, not model switching.** Menu turns use MINIMAL reasoning — the menu is a deterministic script; run it and show the output immediately, with no deliberation before the menu. Plan review, gate, and quality steps dispatch subagents at HIGH/MAX effort (deep thinking, isolated context). Modulate reasoning *effort*, never the session *model* — switching the model mid-session breaks context (see CLAUDE.md).

CTOC ships exactly three slash commands: `menu`, `push`, `update`. Every other workflow — vision, planning, quality, review, agent runs — goes through the menu.

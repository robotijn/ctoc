---
description: CTOC Dashboard - Your Virtual CTO command center
effort: low
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
| `claude:discuss` | **WORK (interactive-async).** Dispatch a background `discuss` agent (never foreground). It critiques the plan for gaps and weak assumptions and makes documented reasonable choices; open questions surface as inbox "decisions awaiting review" — the `${CLAUDE_PLUGIN_ROOT}/.ctoc/ask-me-questions.md` Unicode-box decision-matrix (Option / Pros / Cons / Recommendation) is the FRAMING for those decisions, not a synchronous prompt. See the Two-Plane Protocol (WORK dispatch). |
| `claude:edit` | Help user edit the plan (used by the discussion menu's Apply edits) |
| `claude:approve {ref}` | Run approvePlan(), show result, return to stage list |
| `claude:create-plan {stage}` | Create new plan in stage, enter discussion |
| `claude:delete {ref}` | Delete plan file, return to stage list |
| `claude:reject {ref} {dest}` | Reject plan to destination stage |
| `claude:vision` | Enter Vision Mode |
| `claude:decompose {slug}` | **WORK (interactive-async).** Dispatch a background `decompose` agent (the Vision Decomposer) on a ready vision — never foreground. It makes documented reasonable choices and surfaces open questions as inbox "decisions awaiting review". See the Two-Plane Protocol (WORK dispatch). |
| `claude:approve-stubs {slug}` | Hand off stubs to PO Agent, move vision to done/ |
| `claude:edit-stubs {slug}` | Present stub table, allow user to modify stubs |
| `claude:add-stub {slug}` | Create a new stub for an in-progress decomposition |
| `claude:start-agent` | **WORK.** Call startAgent(), then dispatch the next todo plan as a background `implement` task via the WORK dispatch recipe — the NB1 scheduler serializes plan-mutating work FIFO (plan-serial). Do NOT run a foreground implement loop; each plan drains as background work and completions promote the next runnable plan. See the Two-Plane Protocol. |
| `claude:stop-agent` | Call stopAgent(). Shows confirmation message. Agent will finish current plan then stop. |
| `claude:sync` | Run fullPlansSync(), show result |
| `claude:set-environment {env}` | Persist the chosen CTOC environment: run `node -e "require('${CLAUDE_PLUGIN_ROOT}/src/lib/settings').setSetting('general','environment','{env}')"`, confirm the choice to the user, then continue with the user's pipeline-section choice (or re-open the dashboard if none) — **or, when a 'Stale plans' answer maps to `inbox stale`, navigate there first per Rule 10 (stale-first precedence)**. |
| `claude:env-decide-later` | No-op: do not persist anything; continue with the user's pipeline-section choice. The environment question will ride along again next time. |

## Two-Plane Protocol — NAV vs WORK

Every menu turn is one of two planes. **NAV** turns render a screen synchronously
with minimal reasoning. **WORK** turns record a background task, dispatch a
background agent only if the scheduler says `run`, and return to rendering the
dashboard immediately — never blocking the menu. WORK is **never** executed in the
foreground. This is where CTOC's non-blocking behavior actually happens.

### Classification — NAV vs WORK

Resolve the user's reply to an action string `A`, then classify:

1. `A` is blank, or a **NAV route** — one of `menu` / `browse` / `section` /
   `plan` / `stubs` / `validate` / `inbox` / `tasks` / `task` → **NAV**: render the
   screen synchronously, record no task, minimal reasoning.
2. `A` is a **NAV-claude** action (`view-edit`, `approve`, `reject`, `delete`,
   `edit`, `edit-stubs`, `add-stub`, `cleanup-exec`, `sync`, `set-environment`,
   `env-decide-later`, `stop-agent`, `vision`) → run it in the **foreground**, then
   render. EXCEPTION: a gate-approve on a functional plan (Gate 1) with an autonomous
   follow-on runs the foreground approve, then dispatches `implementation-planner` as
   **WORK**.
3. `A` is a **WORK-claude** action (`start-agent` → `implement`, `decompose`,
   `discuss`, `approve-stubs` → `plan`, a `create-plan` discussion → `discuss`) →
   the **WORK dispatch** recipe below. WORK is **never** run in the foreground.
   Note: `approve-stubs` crosses **Gate 0** (vision → functional) in the foreground
   and hands the stubs off to `product-owner` as that WORK follow-on — the Gate-0
   follow-on lives on this WORK path, not on the `claude:approve` exception above.
4. **Default (total).** Any other `claude:` action not listed above → foreground
   **NAV**: run it, then render. Classification is **total** — every menu turn is
   exactly one of the two planes (no unmapped action).

| Class | Actions | Handling |
|-------|---------|----------|
| NAV | render, view, browse, section, plan, stubs, validate, inbox, tasks, task, approve, reject, delete, edit, sync, gate clicks | Synchronous; render immediately; no task; minimal reasoning |
| WORK | implement, plan, review, quality, security, decompose, discuss | Background task via the WORK recipe; **never foreground** |

### WORK dispatch (turn recipe)

1. **Record first.** `node "${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js" menu task add K [P] [--touches files] [--gitop] [--blocked ids]` → `{taskId, decision, reason}`. This consults the NB1 scheduler (`canRun`) as it records — the `decision` is `run` or `queue`. **Populate `--touches`** for any file-editing kind (implement, quality, security, review) by deriving the file list from the target plan's `files:` frontmatter, and set `--gitop` for any kind that commits or pushes — **so the scheduler can enforce file-conflict and git-exclusive scheduling.** An empty `--touches` makes NB1's file-conflict rule a no-op, so two parallel file-editing WORK tasks (e.g. quality + security on the same plan) could clobber each other; always derive it from `files:`.
2. **Dispatch only on `run`.** If `decision === "run"`: launch `Agent(run_in_background)` with a self-contained brief, THEN `menu task start <taskId>`. If `decision === "queue"`: record only — **do not** launch an agent; show the queued task and its `reason`.
3. **Render now.** `node "${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js"` and display the dashboard with a one-line status. **Never `await`** the agent's completion.

**Never launch a background agent before `menu task add` + the `canRun` decision** — the vision §8 split-brain rule forbids an unrecorded agent. The agent brief is self-contained: the `taskId`, the plan path, the ancestry to read (vision → canvas → functional → implementation), and the completion contract — return a one-line summary, STOP at any human gate reporting "Gate N ready" plus a nav route, never cross a gate, and make documented reasonable choices (no stubs, no TODOs).

### COMPLETION (turn recipe)

When a background task fires its task-notification:

1. `menu task complete <id> --summary "…" [--gate N] [--next <navroute>]` (the store rejects a `claude:` `--next`), or `menu task fail <id> --summary "…"` on failure — a failure is surfaced in the inbox, never silently lost.
2. Emit **ONE** compact, pull-based inbox notice. **Do not** change or hijack the user's current screen — completions pull, they never push.
3. **Promote.** For each task in the response's `promote[]` (the scheduler's `nextRunnable` set), launch `Agent(run_in_background)` + `menu task start <id>`. This is the ONLY sanctioned promotion — never start a queued task the scheduler did not return in `promote[]`.

### Human gates stay foreground

The four human gates are **never** auto-crossed by a background task. A background
agent that reaches a gate STOPS there, returns "Gate N ready" plus a nav route, and
becomes a gate-ready inbox item. A completion records the stop with `--gate N`, and
any `--next` route is navigation-only — never a gate transition. Crossing the gate
is a foreground NAV action the user takes deliberately. No completion, promotion, or
`--next` may ever perform a gate transition.

### Interactive work — async with documented choices

`discuss` and `decompose` are **WORK**, not foreground prompts. They dispatch as
background agents that make documented reasonable choices rather than blocking. Open
questions surface as inbox "decisions awaiting review" — the
`${CLAUDE_PLUGIN_ROOT}/.ctoc/ask-me-questions.md` decision-matrix is the FRAMING for
those decisions, not a synchronous prompt. The menu never blocks on an interactive
answer (Pipeline Philosophy #2 no-stub, #3 async-overnight).

### Reaching the task board

The background-task board is reached via the `tasks` route — a `Background tasks ▸`
entry appears on the Commands screen when the registry is non-empty. Board rows are
selected by task id (`t<n>`) as free-text; numbers still open plans only (Rule 1).

### Rules

1. **Numbers are reserved EXCLUSIVELY for opening a plan.** A number must NEVER be a shortcut for navigation or any other action, on any screen. On a plan list (`inputMode: "plan-select"`) do NOT call AskUserQuestion — render the list and accept a FREE-TEXT reply: a number of any length (e.g. `25`) opens that plan via `actions[number]`; `n`/`new` and `b`/`back` are the only non-plan shortcuts (words, never numbers). On other screens, present the options and accept the option's word/label (case-insensitive) — AskUserQuestion may be used there, but a number must never map to a non-plan action.
2. Auto-discuss when creating new plans — ask every discussion question via the `.ctoc/ask-me-questions.md` matrix format: one question per turn, the Unicode-box matrix first, then AskUserQuestion
3. Dashboard pipeline shows the 3 v7 sections: Business, Implementation, Execution, More (counts in descriptions, labels are stable)
4. **Four human gates** (Gate 0–3, per CLAUDE.md's "4 Mandatory Approval Points"): vision->functional (Gate 0), functional->implementation (Gate 1), implementation->todo (Gate 2), review->done (Gate 3). Each is foreground and human-only; no background task ever crosses one.
5. Pre-validate before every approve (run `validate` command first)
6. Menu rendering and all CTOC slash commands inherit the user's chosen session model; no model pin is set in command frontmatter (removed in v6.9.28 to avoid forced context compaction in long sessions)
7. The menu auto-initializes CTOC on first run: if the project has no `.ctoc/` directory, `menu.js` runs `initProject()` before rendering (creates `.ctoc/`, `plans/`, `CLAUDE.md` if absent). There is no separate init command — opening the menu is the trigger.
8. Environment question rides along, never gates: when the CTOC environment is unset (`general.environment: ask`), `menu.js` renders the **normal dashboard** (plan overview across all phases) and attaches the environment question as a **second** question in `ask`. Present both questions in one AskUserQuestion call. Handle the answers in this order: if the environment answer is Development/Staging/Production, run `claude:set-environment {env}` first; then follow the pipeline-section action (when a 'Stale plans' question is also present, navigation defers to Rule 10's stale-first precedence). "Decide later" persists nothing. The dashboard must NEVER be replaced by the environment question. The environment (dev/staging/prod) only tunes CTOC's own behavior — it never weakens the four human gates.

9. **Reasoning depth, not model switching.** Menu turns use MINIMAL reasoning — the menu is a deterministic script; run it and show the output immediately, with no deliberation before the menu. Plan review, gate, and quality steps dispatch subagents at HIGH/MAX effort (deep thinking, isolated context). Modulate reasoning *effort*, never the session *model* — switching the model mid-session breaks context (see CLAUDE.md).

10. **Stale-plans question rides along, navigates with precedence:** when `dashboardPipeline()` attaches a second **'Stale plans'** question (only when `staleCandidates > 0`), present it in the same AskUserQuestion call as the Pipeline question (and the Environment question if Rule 8 is also active). Resolve the answers in this order: first apply any environment side-effect (Rule 8 — `claude:set-environment {env}`); then, if the **Stale plans** answer maps via `actions` to `inbox stale` (the `'View stale plans'` option), navigate there — **it takes precedence over the pipeline-section answer for this turn** (the pipeline section is one keystroke away on return). If the answer is `'Not now'` (→ `''`) or the Stale plans question was absent, fall through to the pipeline-section answer (`section {x}` / `menu commands`). Precedence is explicit because the Pipeline question is always first and always non-empty, so a naive "first non-empty action wins" would never reach the stale drill-in. Numbers still open plans only (Rule 1) — the stale route is reached only by the label `'View stale plans'`, never a digit.

11. **Two planes — WORK never runs in the foreground.** Every turn is NAV or WORK (see the Two-Plane Protocol). NAV renders synchronously with minimal reasoning; WORK (implement, plan, review, quality, security, decompose, discuss) records a background task and dispatches an agent — it is NEVER executed in the foreground, so navigation is never blocked and a long work action returns to a menu screen in under a second.

12. **WORK dispatch is record-first (split-brain rule).** A WORK turn calls `menu task add` FIRST and reads the scheduler's `canRun` decision BEFORE any `Agent` launch: `run` → dispatch `Agent(run_in_background)` + `menu task start`; `queue` → record only, no agent. Then render immediately — never `await` the agent. Claude NEVER launches a background agent that has not been recorded and cleared by the scheduler (the vision §8 split-brain rule: never route around the scheduler).

13. **Completions pull, promote via the scheduler, and never auto-cross a gate.** A completion turn calls `menu task complete` (or `menu task fail`), emits ONE compact pull-based inbox notice without hijacking the current screen, and promotes ONLY the tasks the scheduler returns in `promote[]` (its `nextRunnable` set) — dispatching each as background work. Human gates are never auto-crossed: a gate-reached task becomes a "Gate N ready" inbox item and the user crosses the gate deliberately in the foreground (Rule 4 stays sacred — no background work weakens a human gate).

CTOC ships exactly three slash commands: `menu`, `push`, `update`. Every other workflow — vision, planning, quality, review, agent runs — goes through the menu.

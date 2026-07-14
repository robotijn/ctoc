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
| `inbox questions` · `inbox decisions` · `inbox gates` | Read-only inbox doors |
| `inbox escalations` | Circuit-breaker escalations + deploy-ready notices (read-only) — the door behind the dashboard's ⛔ count |
| `inbox stale` · `inbox verify` · `inbox cleanup` | Possibly-stale plans: list → verify → human-gated cleanup |
| `tasks` · `task {id}` | Background task board / task detail |

### Claude Actions (handle in conversation)

| Action | What to do |
|--------|-----------|
| `claude:view-edit {ref}` | Display the plan file, then help the user edit it (View and Edit are one action) |
| `claude:discuss` | **WORK (interactive-async). The FIRST and MOST IMPORTANT plan action.** Dispatch a background `discuss` agent (never foreground) to deliver a MAXIMALLY HARSH, no-holds-barred **adversarial critique** — nothing held back. It attacks the plan without mercy: surface EVERY weak assumption, failure mode, unstated dependency, weak or missing justification, and missing edge case. NO praise, NO hedging, NO "this is good but" — only what is wrong and what could break. It makes documented reasonable choices; open questions surface as inbox "decisions awaiting review" — the `${CLAUDE_PLUGIN_ROOT}/.ctoc/ask-me-questions.md` Unicode-box decision-matrix (Option / Pros / Cons / Recommendation) is the FRAMING for those decisions, not a synchronous prompt. Strictly **advisory**: it NEVER edits the plan and NEVER crosses a gate. See the Two-Plane Protocol (WORK dispatch). |
| `claude:discuss-all {stage}` | **WORK (bulk critique). The bulk form of `claude:discuss`.** A WORD shortcut on the stage plan list (`browse functional` / `browse implementation`) — never a number; numbers open a single plan. Dispatch the brutal, nothing-held-back **adversarial critique across EVERY plan in `{stage}`** — one critique per plan, or one per parent-plan group — and surface each result. Same maximally-harsh contract as `claude:discuss`: attack every plan without mercy (weak assumptions, failure modes, unstated dependencies, weak/missing justification, missing edge cases), no praise, no hedging. Strictly **advisory**: it NEVER edits a plan and NEVER crosses a gate. See the Two-Plane Protocol (WORK dispatch). |
| `claude:advance-all-implementation` | **The human deliberately crossing Gate 2 (implementation → todo) for EVERY implementation plan at once — the person selecting this option IS the approval.** A WORD shortcut (`todo-all`) on the implementation stage plan list only — never a number. Batch-approve each parent's slices via `approveSubplans(parentSlug, 'implementation')` (each stamped `approved_by: human`), moving all implementation plans to todo, then start the iron loop to build them by calling `startAgent()` and dispatching the next todo plan as a background `implement` task (per `claude:start-agent`) — file-disjoint slices run concurrently, same-file slices serialize. After enqueuing the wave's implement tasks, call `enqueueWaveSync(root, { blockedBy: <their task ids> })` so the integrated suite + baseline reconcile + commit run as a scheduled `sync` barrier once the wave finishes. It NEVER crosses the gate unless the human chooses it. |
| `claude:done-all-<parent>` | **The human deliberately crossing Gate 3 (review → done) for EVERY reviewed slice of `<parent>` at once — the human typing the word `done-all` on a parent's review list IS the approval.** A WORD shortcut (`done-all`) on the review stage plan list only — never a number; numbers open a single plan. Call `approveSubplans(parentSlug, 'review')` (`src/lib/actions.js`) — it topo-orders the parent's review siblings, per-sibling runs `validateReviewToDone`, and crosses each via the gate-safe `approvePlan` (each stamped `approved_by: human`, `gate_crossed: review → done`); a sibling that fails validation is REPORTED in `skipped[]` and left in review, never silently dropped, and the batch continues. Surface `{approved, skipped}` to the human. It NEVER crosses the gate unless the human types the word. Gate 3 reads the VERIFY evidence the COMPLETION produced (see the completion recipe) — a slice whose recorded verify run FAILED is refused here, and that refusal is the system working. |
| `claude:edit` | Help user edit the plan (used by the discussion menu's Apply edits) |
| `claude:approve {ref}` | Run approvePlan(), show result, return to stage list |
| `claude:create-plan {stage}` | Create new plan in stage, enter discussion. For the implementation stage, derive the global zero-padded number FIRST: `node -e "console.log(require('{{CTOC_ROOT}}/src/lib/plan-numbering').nextImplementationPlanNumber(process.cwd()))"` and name the file `<number>-<slug>.md` (src/lib/plan-numbering.js is the single numbering source — never hand-count) |
| `claude:delete {ref}` | Delete plan file, return to stage list |
| `claude:cleanup-exec …` | Execute a confirmed stale-plan cleanup: run `node -e "console.log(JSON.stringify(require('{{CTOC_ROOT}}/src/lib/stale-cleanup').executeCleanup(process.cwd(), '<category-or-plan>', '<action>')))"` (src/lib/stale-cleanup.js re-derives and re-validates the target set itself — corruption-safe move-aside, never a blind delete), then show the result and return to the inbox |
| `claude:reject {ref} {dest}` | Reject plan to destination stage |
| `claude:vision` | Enter Vision Mode |
| `claude:decompose {slug}` | **WORK (interactive-async).** Dispatch a background `decompose` agent (the Vision Decomposer) on a ready vision — never foreground. It makes documented reasonable choices and surfaces open questions as inbox "decisions awaiting review". See the Two-Plane Protocol (WORK dispatch). |
| `claude:approve-stubs {slug}` | Hand off stubs to PO Agent, move vision to done/ |
| `claude:edit-stubs {slug}` | Present stub table, allow user to modify stubs |
| `claude:add-stub {slug}` | Create a new stub for an in-progress decomposition |
| `claude:start-agent` | **WORK — an EXPLICIT EXCEPTION to the generic WORK-dispatch recipe: it does NOT call `menu task add`.** Call `startAgent(root, { force: true })` (human-initiated, so `force: true` clears any drain-stop per R2-B). `startAgent` ALREADY records AND claims the task via `addAndClaim` — running `menu task add` for the same plan here would double-enqueue it (C1-8), so NEVER do that on this path. Read the returned shape: `{ started:true, task, plan, skipped, remainingTodo }` → launch the `Agent(run_in_background)` for that plan, THEN `menu task start <task.id> --agent-id <the harness agent id>` to stamp the live id (so the on-open reconcile never falsely orphans it). `{ started:false, queued:true, reason }` → the plan is recorded and waiting on a `file-conflict`; launch no agent, show the queued plan and its `reason`. `{ started:false, drainStopped:true }` cannot occur with `force: true`; `{ started:false, error }` → surface the error. **Always surface the returned `skipped[]`** (`[{plan, reason}]`) to the human — plans the scheduler could not build a spec for (no `files:`, unresolvable dependency); a skip never stalls the plans behind it (C1-4). **The scheduler serializes by FILES, not by kind** (vision F1 — the old kind-based one-implement-at-a-time rule is retired): implement tasks run CONCURRENTLY (up to 5) when their declared `files:` are DISJOINT, and two plans that touch the same file serialize (scheduler reason `file-conflict`). Do NOT run a foreground implement loop; each plan drains as background work and completions promote the next runnable plan. **At a wave boundary** — after enqueuing the wave's implement tasks — call `enqueueWaveSync(root, { blockedBy: <the wave's implement task ids>, label })` to schedule the integration barrier; when the scheduler promotes that `sync` task (it runs ALONE, after the whole wave is done), run the integrated suite + baseline reconcile + commit, then mark it done. See the Two-Plane Protocol. |
| `claude:stop-agent` | Call stopAgent(). Shows confirmation message. Agent will finish current plan then stop. |
| `claude:sync` | Run fullPlansSync(), show result |
| `claude:set-environment {env}` | Persist the chosen CTOC environment: run `node -e "require('${CLAUDE_PLUGIN_ROOT}/src/lib/settings').setSetting('general','environment','{env}')"`, confirm the choice to the user, then continue with the user's pipeline-section choice (or re-open the dashboard if none) — **or, when a 'Stale plans' answer maps to `inbox stale`, navigate there first per Rule 10 (stale-first precedence)**. |
| `claude:env-keep-defaults` | **Keep defaults, stop asking (durable).** Run `node -e "require('${CLAUDE_PLUGIN_ROOT}/src/lib/settings').setSetting('general','environment_prompt_dismissed',true,process.cwd())"`. That is the exact marker `settings.needsEnvironmentPrompt()` reads, so the environment question stops riding along on future opens while the environment stays `ask` (defaults apply; it is still changeable any time from System → Settings). Then continue with the user's pipeline-section choice. Confirm the choice ONLY when the write reports success; if it throws, report the failure and do NOT claim it stuck. |
| `claude:dismiss-stale` | **Don't ask again for these (durable).** The possibly-stale set is dismissed by SIGNATURE, so a plan that later CHANGES re-surfaces. The driver must obtain the candidates first — the same cheap scan the nag count comes from — then dismiss exactly those: `node -e "const s=require('${CLAUDE_PLUGIN_ROOT}/src/lib/stale-detector');const {candidates}=s.scanCheapCandidates(process.cwd());console.log(JSON.stringify(s.dismissStale(process.cwd(), candidates)))"` → `{ok, count}`. Report the `count` dismissed; on `ok:false` report the failure and never claim it stuck. This is the ONLY durable dismissal — "Not now" is a one-turn skip that writes nothing. It dismisses a NAG, never a gate. |
| `claude:set-compliance-regime {profile}` | Persist the chosen EU compliance regime. Map `{profile}` to a profile array: `gdpr`→`['gdpr']`; `eu-ai-act`→`['eu-ai-act-high-risk']`; `both`→`['gdpr','eu-ai-act-high-risk']` — run `node -e "require('${CLAUDE_PLUGIN_ROOT}/src/lib/compliance-regime').writeActiveProfiles(process.cwd(), ARR)"` with the mapped array (a fixed literal from the closed enum — never free-text). For `none`, call `declineComplianceRegime(process.cwd())` — it WRITES a durable "declined" marker (no profile activated, but the choice is recorded so the compliance question stops riding along); confirm the choice ONLY when it returns `ok: true`, otherwise report the failure and never claim success. Only writes `regulatory_regime.active_profiles` (or the declined marker); **never weakens a human gate**. |

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
   `env-keep-defaults`, `dismiss-stale`, `set-compliance-regime`, `stop-agent`,
   `vision`) → run it in the **foreground**, then render. EXCEPTION: a gate-approve on
   a functional plan (Gate 1) with an autonomous follow-on runs the foreground approve,
   then dispatches `implementation-planner` as **WORK**.
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

**`menu task complete` on an `implement` task IS the plan completion.** It calls
`completeTaskPlan` → `completeExecution` (`src/lib/actions.js`): the plan is validated,
moved in-progress → review, **Step 14 VERIFY is actually RUN** (quality checks plus the
app-launch last-mile check), and the result is persisted to
`.ctoc/state/verify/<slug>.json` — **the evidence Gate 3 reads**. Nobody moves a plan file
by hand; an agent that does leaves a plan with no evidence, and Gate 3 (correctly)
refuses it. Read the response:

- `{ ok: true, completion: { ran: true, newPath, verify } }` → the plan is in review with
  its evidence. Say so, and say whether the verify **passed**. A `verify.passed === false`
  is HONEST and expected sometimes: the plan still reaches review, the evidence records
  the failure, Gate 3 will refuse it, and the circuit breaker counts a Step-14 kickback.
  Never re-run or overwrite the evidence to make it green.
- `{ ok: false, blocked: true, errors }` → the plan **failed pre-review validation**. This
  is a KICKBACK, not a completion: the task stays `running`, the plan stays in
  in-progress, and **no evidence is minted**. Surface the errors, fix the named step, and
  complete again (or `menu task fail <id>` if the work is genuinely abandoned).
- `{ ok: true, completion: { ran: false, reason } }` → the task's `plan` names no plan
  file on disk (a review/decompose task, say). Registry-only completion; report the reason.

### ON-OPEN RECONCILE (NB4)

On menu open (a NAV render), the dashboard reconciles the task registry against the
live harness **`TaskList`** before rendering. When the Task tool is available, the
main loop **MUST** pass the live harness agent-id list into the render as
`liveAgentIds`, using the flag `menu.js` parses:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js" --live-agent-ids <id1>,<id2>,<id3>
```

Comma-separated harness agent ids, no spaces (the same ids stamped at
`menu task start <taskId> --agent-id <harness id>`). **Honesty rule (R3-B): pass the flag
only when you genuinely queried the live agent list. An EMPTY list means "I could not
determine liveness" — NOT "nobody is alive".** Omit the flag entirely when the Task tool
is unavailable, and reconcile falls back to the staleness backstop. Never pass
`--live-agent-ids` with an empty value to mean "no agents are running": that would falsely
orphan every live agent.

Passing the real list is load-bearing: a `running` task with a matching live agent is left
alone and one with no matching live agent is marked `orphaned` precisely. This is
is the only thing that prevents a legitimately long-running background agent (e.g. an
`implement` task running past the staleness threshold) from being falsely orphaned
and offered for a duplicate re-run. Only when that list genuinely cannot be obtained
(the `menu.js` child process running with no Task-tool access, or a true session
restart where the harness reports no agents) does the **staleness threshold
backstop** — a long-`running` task with no confirmable live agent is orphaned, which
is exactly correct in the restart case where the agent really is gone. An `orphaned` task no longer counts toward the ≤5
concurrency limit and is **offered for re-run through the scheduler**
(`canRun`/`nextRunnable`), never a direct launch. A **`failed`** task always surfaces
in the task plane / inbox (never silently lost). Reconciliation is fully fail-open: a
corrupt registry or a save failure never blocks navigation — the dashboard still
renders.

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

A selected board row can be **cancelled** (the two-phase `cancel` transition, C1-2):
call `cancelTask(root, <taskId>)` → `{ task, agentTaskId }`. The transition is honest
about liveness: a **`running`** task moves to `cancelling` — a NON-terminal state whose
files, slot, gitOp and any sync barrier **stay locked until `task-reconcile` confirms
the harness agent is gone** (a direct `running → cancelled` is forbidden — it would free
a live agent's files early). A **`queued`** task (nothing running) moves straight to the
terminal `cancelled`, freeing its slot at once. Use the returned `agentTaskId` (when
non-null) to stop that live harness agent — killing the harness-level agent is the
caller's job; the registry only records the transition. Only the queued-cancel frees a
slot immediately, so promote the scheduler's next `nextRunnable` set then; a
running-cancel holds its slot until reconcile confirms death, so nothing new is promoted
yet. Cancelling never crosses a human gate.

### Rules

1. **Numbers are reserved EXCLUSIVELY for opening a plan.** A number must NEVER be a shortcut for navigation or any other action, on any screen. On a plan list (`inputMode: "plan-select"`) do NOT call AskUserQuestion — render the list and accept a FREE-TEXT reply: a number of any length (e.g. `25`) opens that plan via `actions[number]`; `n`/`new` and `b`/`back` are the only non-plan shortcuts (words, never numbers). On other screens, present the options and accept the option's word/label (case-insensitive) — AskUserQuestion may be used there, but a number must never map to a non-plan action.
2. Auto-discuss when creating new plans — ask every discussion question via the `.ctoc/ask-me-questions.md` matrix format: one question per turn, the Unicode-box matrix first, then AskUserQuestion
3. Dashboard pipeline shows the 3 v7 sections: Business, Implementation, Execution, More (counts in descriptions, labels are stable)
4. **Four human gates** (Gate 0–3, per CLAUDE.md's "4 Mandatory Approval Points"): vision->functional (Gate 0), functional->implementation (Gate 1), implementation->todo (Gate 2), review->done (Gate 3). Each is foreground and human-only; no background task ever crosses one.
5. **Pre-validate before every approve, and CONSUME the `autoApprove` signal.** Run the `validate {stage}/{file}` screen first. It returns `autoApprove: true` on a CLEAN validation — that is a one-turn signal, not decoration: when it is `true`, run the screen's `claude:approve {ref}` action **in the SAME turn** (the human already chose "Approve"; a second "Proceed?" click is a redundant nag). When it is `false`, the screen lists the errors and buries "Approve anyway" as the LAST option — never recommend it. Do NOT auto-run an approve when `autoApprove` is `false`: an override is always the human's explicit, deliberate act. The human still crosses every gate; `autoApprove` only removes the second click on a clean plan.
6. Menu rendering and all CTOC slash commands inherit the user's chosen session model; no model pin is set in command frontmatter (removed in v6.9.28 to avoid forced context compaction in long sessions)
7. The menu auto-initializes CTOC on first run: if the project has no `.ctoc/` directory, `menu.js` runs `initProject()` before rendering (creates `.ctoc/`, `plans/`, `CLAUDE.md` if absent). There is no separate init command — opening the menu is the trigger.
8. Environment question rides along, never gates: when the CTOC environment is unset (`general.environment: ask`), `menu.js` renders the **normal dashboard** (plan overview across all phases) and attaches the environment question as a **second** question in `ask`. Present both questions in one AskUserQuestion call. Handle the answers in this order: if the environment answer is Development/Staging/Production, run `claude:set-environment {env}` first; then follow the pipeline-section action (when a 'Stale plans' question is also present, navigation defers to Rule 10's stale-first precedence). "Keep defaults, stop asking" maps to `claude:env-keep-defaults`, which durably records the choice (`general.environment_prompt_dismissed: true`) so the environment question stops riding along. The dashboard must NEVER be replaced by the environment question. The environment (dev/staging/prod) only tunes CTOC's own behavior — it never weakens the four human gates.

9. **Reasoning depth, not model switching.** Menu turns use MINIMAL reasoning — the menu is a deterministic script; run it and show the output immediately, with no deliberation before the menu. Plan review, gate, and quality steps dispatch subagents at HIGH/MAX effort (deep thinking, isolated context). Modulate reasoning *effort*, never the session *model* — switching the model mid-session breaks context (see CLAUDE.md).

10. **Stale-plans question rides along, navigates with precedence:** when `dashboardPipeline()` attaches a second **'Stale plans'** question (only when `staleCandidates > 0`), present it in the same AskUserQuestion call as the Pipeline question (and the Environment question if Rule 8 is also active). Resolve the answers in this order: first apply any environment side-effect (Rule 8 — `claude:set-environment {env}`); then, if the **Stale plans** answer maps via `actions` to `inbox stale` (the `'View stale plans'` option), navigate there — **it takes precedence over the pipeline-section answer for this turn** (the pipeline section is one keystroke away on return). If the answer is `'Not now'` (→ `''`) or the Stale plans question was absent, fall through to the pipeline-section answer (`section {x}` / `menu commands`). Precedence is explicit because the Pipeline question is always first and always non-empty, so a naive "first non-empty action wins" would never reach the stale drill-in. Numbers still open plans only (Rule 1) — the stale route is reached only by the label `'View stale plans'`, never a digit.

11. **Two planes — WORK never runs in the foreground.** Every turn is NAV or WORK (see the Two-Plane Protocol). NAV renders synchronously with minimal reasoning; WORK (implement, plan, review, quality, security, decompose, discuss) records a background task and dispatches an agent — it is NEVER executed in the foreground, so navigation is never blocked and a long work action returns to a menu screen after a short WORK turn — a few tool calls — never a foreground build.

12. **WORK dispatch is record-first (split-brain rule).** A WORK turn calls `menu task add` FIRST and reads the scheduler's `canRun` decision BEFORE any `Agent` launch: `run` → dispatch `Agent(run_in_background)` + `menu task start`; `queue` → record only, no agent. Then render immediately — never `await` the agent. Claude NEVER launches a background agent that has not been recorded and cleared by the scheduler (the vision §8 split-brain rule: never route around the scheduler).

13. **Completions pull, promote via the scheduler, and never auto-cross a gate.** A completion turn calls `menu task complete` (or `menu task fail`), emits ONE compact pull-based inbox notice without hijacking the current screen, and promotes ONLY the tasks the scheduler returns in `promote[]` (its `nextRunnable` set) — dispatching each as background work. Human gates are never auto-crossed: a gate-reached task becomes a "Gate N ready" inbox item and the user crosses the gate deliberately in the foreground (Rule 4 stays sacred — no background work weakens a human gate).

14. **Compliance question rides along, never gates:** when neither EU compliance profile is active (`regulatory_regime.active_profiles` contains neither `gdpr` nor `eu-ai-act-high-risk`), `menu.js` attaches a **second/third** question (`header: 'Compliance'`) alongside Pipeline (and Environment when Rule 8 is also active). Present all in one AskUserQuestion call (≤4 questions). Apply the compliance side-effect (`claude:set-compliance-regime {profile}`) — after any environment side-effect (Rule 8) and before falling through to the pipeline-section answer. The dashboard is **NEVER** replaced by the compliance question; activating a compliance profile only writes `active_profiles` and the four human gates stay mandatory.

CTOC ships exactly three slash commands: `menu`, `push`, `update`. Every other workflow — vision, planning, quality, review, agent runs — goes through the menu.

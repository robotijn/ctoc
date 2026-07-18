---
approved_by: human
approved_at: 2026-07-18T11:11:00.196Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "ctoc:start — the entry point becomes one open prompt, or the open prompt plus the waiting questions"
type: implementation
parent_plan: none
depends_on: 00066-x9-gate-critic-writes-its-own-questions
priority: high
files:
  - src/commands/start.md
  - src/commands/menu.md
  - src/commands/menu.js
  - src/lib/start-screen.js
  - src/lib/decision-matrix.js
  - src/lib/streaming-gate.js
  - src/hooks/SessionStart.js
  - src/hooks/PreToolUse.Edit.js
  - src/hooks/PreToolUse.Bash.js
  - .ctoc/templates/operating-lessons.md
  - README.md
  - CLAUDE.md
  - docs/AGENT_ARCHITECTURE.md
  - tests/start-screen.test.js
  - tests/decision-matrix.test.js
  - tests/ctoc-start-flow.test.js
  - tests/streaming-gate.test.js
  - tests/readme-numbers.test.js
  - tests/slash-command-no-model-pin.test.js
  - tests/e2e-menu-lifecycle.test.js
---

# ctoc:start — the entry point becomes one open prompt, or the open prompt plus the waiting questions

## Dependency — why this is built after 00066

`depends_on: 00066-x9-gate-critic-writes-its-own-questions`. That slice makes the
precompute store fill itself without routing through the session model. This
slice's "answer the questions" option is only instant if the store is actually
populated ahead of the human; building this one first would ship a start screen
whose best path is empty in practice.

## Problem

The primary entry point is `/ctoc:menu`. The name says "menu", and the screen it
opens behaves like one: it presents navigation. What the human actually wants at
the start of a session is one of exactly two things:

1. To say what he wants built, in his own words, in a free text field.
2. To answer the questions that are already waiting for him — and only when
   questions are genuinely waiting.

The word "menu" is wrong for both. It is also wrong for what CTOC has become
since the streaming work landed: the no-argument screen is already the streaming
gate-decision screen, not the classic dashboard. The command name is the last
piece still describing the old shape.

Second problem, independent of the name: when questions ARE waiting, the screen
flattens each option's pros and cons into a single description string
(`precomputedOptionDescription` in `src/lib/streaming-gate.js`, line 489). The
precompute layer stores real structured `pros` / `cons` / `recommended` fields
per option — and the screen throws that structure away by joining it with
`·` separators into one sentence. The human never sees the decision matrix he
requires. The reasoning the adversarial critique fleet produced is present in the
data and invisible in the interface.

Third problem: every question the streaming screen asks traps the human inside
the offered options. The harness "Other" free text path exists but is never
advertised as a first-class choice on the question itself.

## What the human asked for, verbatim

> "i want the ctoc:menu to become ctoc:start and then the user can choose between
> 'type what you want' and 'answer questions' (if there are any) and if there are
> no questions then only 'what shall we create today?' or something similar"

> "and with the questions show pros cons recommendation in matrix, as
> /ask-me-questions does, and always have an open field : 'something else?'"

Build to those two sentences. Do not reinterpret them.

## Known upstream gap — the producer half is not yet whole

Recorded so whoever schedules this can see it. **Do not fix it in this slice.**

`src/hooks/SessionStart.js` line 200 instructs every dispatched subagent to write
its questions to the store "via `src/lib/streaming-precompute.js` →
`writePlanQuestions(root, ref, questions, planMtimeMs)`" — a JavaScript function.
Invoking a JavaScript function requires the `Bash` tool. Verified against the
agent definitions on disk:

| Agent named in the directive | Declared `tools:` | Can it call `writePlanQuestions`? |
|---|---|---|
| `agents/iron-loop/premortem-critic.md` line 4 | `Read, Grep` | No — cannot write at all |
| `agents/iron-loop/devils-advocate-critic.md` line 4 | `Read, Grep` | No — cannot write at all |
| `agents/iron-loop/red-team-critic.md` line 4 | `Read, Grep` | No — cannot write at all |
| `agents/iron-loop/gate-critic.md` line 4 | `Read, Grep` | No — cannot write at all |
| `agents/planning/product-owner.md` line 4 | `Read, Write, WebSearch` | No — `Write` puts bytes on disk but cannot invoke a function |
| `agents/planning/vision-advisor.md` line 4 | `Read, AskUserQuestion, Write` | No — same |
| `agents/planning/implementation-planner.md` line 4 | `Read, Glob, Grep, Write` | No — same |

So the gap is wider than "the three lens critics cannot write". **No agent named
in that directive declares `Bash`, so none of them can invoke the function the
directive names.** The three lens critics and the gate critic cannot produce a
file by any route. The three producers can `Write` a raw JSON file by hand — but
that bypasses `validatePlanQuestions` and the atomic mtime stamp, and the mtime
stamp is precisely what makes a questions file read as fresh rather than stale
(`planQuestionsStatus`, `src/lib/streaming-precompute.js` lines 362-377). A
hand-written file with a wrong or absent stamp reads as `invalid` or `stale` and
is discarded.

The critics' `Read, Grep` restriction is deliberate and correct — `src/commands/menu.md`
documents it as the Rule-of-Two hardening: they ingest untrusted plan text, so they
deliberately hold no write tool, no outbound channel and no execution. The fix is
therefore NOT to widen their tools. It is what 00066 addresses: the dispatcher, not
the critic, writes the file. This note exists so the dependency is understood as
load-bearing rather than administrative.

## Acceptance criteria

1. `/ctoc:start` exists and is the primary entry point.
2. CTOC still ships exactly three slash commands. This is a RENAME, never a
   fourth command.
3. With no precomputed questions waiting, `/ctoc:start` renders a single open
   prompt asking what to create — no second choice, no navigation list.
4. With precomputed questions waiting, `/ctoc:start` renders both choices: type
   what you want, and answer the waiting questions.
5. Choosing "answer questions" reaches a REAL precomputed question — one that was
   already computed and stored, read from the store with zero waiting.
6. Every question the start flow asks renders a real Unicode box-drawing decision
   matrix in the screen text, with the four columns Option, Pros, Cons,
   Recommendation, before the question is asked.
7. Every question carries an open free text option labelled "Something else?",
   present whether or not the stored question supplied one.
8. No slash command declares a model in its frontmatter.
9. Numbers open plans and nothing else. Every start-screen choice is a word.
10. The four human gates are untouched. This slice crosses no gate, stamps no
    approval marker, and moves no plan file.
11. `npm test` passes with zero failures, zero skipped, and coverage at or above
    the recorded floor.

## Scope

**In scope.** The command rename; the two-shape start screen; a reusable decision
matrix renderer; wiring that renderer into the streaming question screen so pros,
cons and the recommendation survive to the human's eyes; the "Something else?"
injection; and every documentation surface and test that carries the command
name and would otherwise be wrong or would hard-break.

**Out of scope.** The gate logic itself. The precompute producer path and the
upstream gap recorded above (that is 00066). The question contract in
`src/lib/streaming-precompute.js` (it already carries the fields the matrix
needs). The classic `dashboard` route, which stays reachable exactly as it is
today.

## Decisions Taken Under Ambiguity

### Decision 1 — `/ctoc:menu` is REMOVED, not kept as an alias

**Recommendation: remove it.** An alias is not free here. Claude Code discovers
slash commands from the `.md` files in `src/commands/` (see
`"commands": "./src/commands/"` in `.claude-plugin/plugin.json`), and
`tests/readme-numbers.test.js` asserts `countSlashCommandSpecs() === 3` by counting
exactly those files. Keeping `menu.md` alongside `start.md` produces four command
specs. That is not an alias in this architecture — it IS a fourth slash command,
and it breaks the hard invariant the human set.

The cost is one session of muscle memory. It is paid down immediately, because
the two places that teach the name are both updated in this same slice: the
`SessionStart.js` injected context that every session reads, and `README.md`.
An unknown slash command in Claude Code fails visibly and harmlessly, so the
failure mode is a person typing `/ctoc:menu` once, seeing nothing, and reading the
new name in the session context.

### Decision 2 — the implementation file stays `src/commands/menu.js`

The slash command's user-visible name comes from the `.md` spec's filename, not
from the script it invokes. `src/commands/menu.js` is referenced by roughly thirty
files: hooks, tests, agent instruction surfaces, and the `menu task add` /
`menu task complete` recipes throughout `src/commands/start.md`. Renaming it to
`start.js` would multiply this slice's edit surface several times over for zero
human-visible gain, and every one of those call sites is a place a rename can
silently miss.

The script keeps its name. Its header comment gains one line naming the command
it now serves. This is recorded here because it is a real naming drift — internal
`menu.js` behind external `/ctoc:start` — and drift that is written down is drift
somebody can find.

### Decision 3 — the exact opening copy

The human wrote "'what shall we create today?' or something similar" and asked
for the proposal here.

- No questions waiting, question text: **"What shall we create today?"**
- Questions waiting, question text: **"What shall we create today — or shall we
  answer the questions waiting for you?"**

The no-questions form is his sentence verbatim, because it is already right. The
with-questions form extends the same sentence rather than replacing it, so the
screen reads as one continuous voice rather than two different products.

### Decision 4 — "Something else?" is injected at the render layer

It is injected once in `src/lib/decision-matrix.js` (`withSomethingElse`), which
every question renderer calls. It is deliberately NOT the responsibility of each
question producer — the precompute fleet, the gate critic, the start screen —
because a requirement that every producer must remember is a requirement that one
producer will eventually forget. One injection point cannot be forgotten, and it
is directly testable.

### Decision 5 — the matrix lives in the screen `text`, never inside the question

This follows `.ctoc/ask-me-questions.md` exactly: matrix first, in the reply text;
the question and its options afterward, carrying no matrix, no pros, no cons, no
recommendation reasoning. The screen contract `{ text, ask, actions }` already
separates these two surfaces cleanly, so the format rule maps onto it directly.

### Decision 6 — the `pros` / `cons` keys stay PLURAL

`validatePlanQuestions` (`src/lib/streaming-precompute.js`, line 219) validates
`pros`, `cons` and `description` as optional strings. A producer that writes
singular `pro` / `con` validates green and its content is then silently dropped —
the human's reasoning disappears with no error anywhere. The matrix renderer
reads the plural keys only, and `tests/decision-matrix.test.js` pins that a
singular-key option renders with visibly empty Pros and Cons cells rather than
inventing content. The silent-drop hazard is not fixed by this slice; it is
pinned by a test so it is visible rather than mysterious.

### Decision 7 — "Open the plan" is DROPPED from the question screen (SETTLED)

**The human ruled on this. It is not open.**

The harness caps explicit options at four. The question screen previously offered
question options plus `'Skip for now'` plus `'Open the plan'`; adding
`'Something else?'` overruns the cap. The ruling:

**Drop `'Open the plan'`.** The option order is: the question's own options, then
`'Something else?'`, then `'Skip for now'`.

His reasoning, recorded as given: being trapped in the offered choices is the
failure he named, so the open field outranks navigation. The plan stays reachable
through the plan list, so dropping it costs one extra hop rather than access.

This applies unconditionally, not only when the cap binds — `'Open the plan'` is
removed from the question screen's option set entirely. No alternative is retained
in this plan; the decision is closed.

### Decision 8 — which files carrying `/ctoc:menu` are in this slice

Nothing is hidden. Here is the complete inventory of files containing the literal
string `/ctoc:menu`, and the disposition of each.

| File | In this slice | Why |
|---|---|---|
| `src/commands/menu.md` | Yes | Renamed to `start.md`. |
| `tests/readme-numbers.test.js` | Yes | Reads `src/commands/menu.md` by absolute path. HARD BREAK otherwise. |
| `tests/slash-command-no-model-pin.test.js` | Yes | Reads `src/commands/menu.md` by absolute path. HARD BREAK otherwise. |
| `tests/e2e-menu-lifecycle.test.js` | Yes | Drives the entry point end to end; must drive the new one. |
| `src/hooks/SessionStart.js` | Yes | Injected into every session — the primary place a human learns the name. |
| `src/hooks/PreToolUse.Edit.js` | Yes | The block message a human reads when an edit is refused; it must name a command that exists. |
| `src/hooks/PreToolUse.Bash.js` | Yes | Same — a denial message naming a dead command. |
| `README.md` | Yes | The public front door. |
| `CLAUDE.md` | Yes | The project instruction surface. |
| `docs/AGENT_ARCHITECTURE.md` | Yes | Documents the model rules using the command name. |
| `.ctoc/templates/operating-lessons.md` | Yes | Shipped into every user project on initialization. |
| `src/lib/streaming-gate.js` | Yes | Already in scope for the matrix work. |
| `src/lib/menu-screens.js` | No | Source comment only. Not reachable by a human, and this file is not otherwise edited here. |
| `src/lib/streaming-render.js` | No | Source comment only. |
| `src/lib/cache.js`, `src/lib/reachability.js`, `src/lib/task-reconcile.js`, `src/areas/agent.js` | No | Source comments only. |
| `agents/iron-loop/premortem-critic.md`, `agents/iron-loop/devils-advocate-critic.md`, `agents/iron-loop/iron-loop-executor.md` | No | Agent prose; the agents are dispatched by the session model, never by a human typing the command. |
| `tests/streaming-render.test.js`, `tests/menu-coverage.test.js`, `tests/menu-environment.test.js`, `tests/compliance-ride-along.test.js`, `tests/menu-task-wiring.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/task-reconcile-coverage.test.js`, `tests/pretooluse-edit-coverage.test.js`, `tests/scheduler-enforced.test.js`, `tests/export-reachability.test.js`, `tests/ledger-forgery-closed.test.js`, `tests/agent-layer-reachability.test.js`, `tests/iron-loop-enforcer-coverage.test.js` | No | The string appears in comments or in assertions about `menu.js` (which keeps its name per Decision 2). None of them reads `menu.md` by path, so none breaks. |
| `plans/**` | No | Historical plan records. Rewriting history would be dishonest. |

The line is drawn at: does a human read this string, or does this file break? If
either is true it is in the slice. Every remaining occurrence is an internal
comment about a script whose name is unchanged, so it is not wrong — it just
names the script rather than the command.

## Implementation Details

### Architecture Decision

The start screen is a NEW module (`src/lib/start-screen.js`) rather than another
branch inside `streaming-gate.js`. Reason: `streaming-gate.js` is about gate
decisions and already carries eleven hundred lines. The start screen is about a
different question — what do you want to do right now — and depends on the gate
module only for a single read (`pendingGateDecisions`). A new module keeps that
dependency one-directional (`start-screen` → `streaming-gate`, never the reverse)
and keeps the new behaviour independently testable.

The decision matrix renderer is a THIRD module (`src/lib/decision-matrix.js`),
below both, because two callers need it: the start screen and the streaming gate
question screen. Placing it inside either would force the other to reach sideways.

### Dependency Graph

```
src/lib/decision-matrix.js   (new, no CTOC dependencies beyond ./tui for stripCtl)
        ▲                    ▲
        │                    │
src/lib/start-screen.js      src/lib/streaming-gate.js   (modified)
        │                                 ▲
        │                                 │
        └──────── reads pendingGateDecisions, loadPlanQuestions
                                          │
src/commands/menu.js  ──calls startScreen──┘   (modified: the no-args path)
        ▲
        │
src/commands/start.md  (new spec — the live entry point; menu.md removed)
```

No cycles. `decision-matrix.js` depends on nothing in CTOC except `./tui` for the
control-character sanitizer, so it sits at the bottom.

### Wiring — the live call sites

Per Operating Lesson 16, every new module is reachable from a live entry point in
this same slice.

| New module | Live call site | Root it is reachable from |
|---|---|---|
| `src/lib/decision-matrix.js` | `src/lib/streaming-gate.js` → `richQuestionScreen()`; `src/lib/start-screen.js` → `startScreen()` | The shipped `/ctoc:start` slash command |
| `src/lib/start-screen.js` | `src/commands/menu.js` → `main()`, the no-arguments branch (currently line ~728, `streamingGate.streamingGateScreen(app.projectPath)`) | The shipped `/ctoc:start` slash command |

No module in this slice is proved only by its own test.

### File Specifications

---

#### File: `src/lib/decision-matrix.js`
**Action:** CREATE
**Purpose:** Render a decision as a real Unicode box-drawing matrix, and guarantee
every question carries an open free text option.
**Change Type:** new-module

##### Exports

- `renderMatrix(question)` → returns `string`
  - Description: renders `question.options` as a fenced Unicode box-drawing table
    with the four columns `Option`, `Pros`, `Cons`, `Recommendation`. Returns the
    fenced block including the opening and closing triple backticks and a trailing
    newline.
  - Column characters: top edge `┌ ─ ┬ ┐`, row separator `├ ─ ┼ ┤`, bottom edge
    `└ ─ ┴ ┘`, vertical `│` (U+2502). Never the pipe character `|`.
  - Column widths: computed from content, then each column is capped at the
    tightened widths `[24, 40, 38, 46]`. This is the standing "roughly five spaces
    narrower" preference applied to the four-column structure from
    `.ctoc/ask-me-questions.md`, whose example uses `[28, 47, 45, 55]`.
  - Cell text longer than its column wraps onto continuation lines within the same
    cell; a sentence is never broken across cells.
  - The Recommendation cell is non-empty for exactly the option whose
    `recommended === true`, and reads `Recommended — <reason>` where `<reason>` is
    the option's `description` when present, otherwise the literal
    `highest-quality option for this decision`. Every other Recommendation cell is
    empty.
  - When more than one option carries `recommended === true`, only the FIRST in
    array order is marked. Documented here because `validatePlanQuestions` does not
    enforce single-recommendation, so the renderer must not assume it.
  - All cell text passes through `stripCtl` before rendering. Question and option
    text is subagent-authored and therefore untrusted for terminal output.
  - Throws: never. A malformed question returns the empty string.

- `withSomethingElse(options)` → returns `Array<object>`
  - Description: returns a copy of `options` with the open free text option
    appended: `{ key: 'else', label: 'Something else?', description: 'Type your own answer — none of the options above.' }`.
  - Idempotent: if an option already carries `key === 'else'` or
    `label === 'Something else?'`, the input is returned unchanged (copied).
  - Throws: never. A non-array input returns an array containing only the open
    option, so the escape hatch exists even when the question is malformed.

- `SOMETHING_ELSE_KEY` → `'else'` (exported constant so callers route the answer
  without re-typing the string)

- `SOMETHING_ELSE_LABEL` → `'Something else?'`

##### Dependencies

- `require('./tui')` — for `stripCtl`

##### Called By

- `src/lib/streaming-gate.js` → `richQuestionScreen()` and `planDecisionScreen()`
- `src/lib/start-screen.js` → `startScreen()`

##### Data Flow

```
question (from streaming-precompute.loadPlanQuestions)
  → withSomethingElse(question.options)
  → renderMatrix({ ...question, options })   → fenced Unicode block (screen `text`)
  → options mapped to { label, description } → the `ask` question (NO matrix inside)
```

##### Error Handling

- Non-object question, missing `options`, empty `options`: return `''`. The caller
  then renders the question with no matrix rather than crashing. A missing matrix
  is a degraded screen; a thrown error is a dead entry point.
- Non-string `pros` / `cons` / `description`: treated as absent, cell rendered
  empty. Never coerced with `String()`, which would print `[object Object]` at the
  human.

##### Cross-Platform Notes

- Pure string construction; no file system, no path handling.
- Line endings are `\n` only. The screen output is JSON-encoded by `menu.js`, so
  the terminal layer handles platform line endings.

---

#### File: `src/lib/start-screen.js`
**Action:** CREATE
**Purpose:** Render the `/ctoc:start` entry screen in its two shapes.
**Change Type:** new-module

##### Exports

- `waitingQuestionCount(projectPath)` → returns `number`
  - Description: how many plans currently have fresh precomputed questions with at
    least one unanswered question. Reads the ALREADY-COMPUTED store only — it
    never generates, never dispatches, never waits.
  - Implementation: `streamingGate.pendingGateDecisions(projectPath)`, then for each
    descriptor `streamingPrecompute.loadPlanQuestions(projectPath, d.ref)`; a `null`
    return (absent, stale, invalid, or unknown plan) contributes zero.
  - Throws: never. Any failure returns `0`, which renders the no-questions shape —
    the shape that never blocks.

- `startScreen(projectPath)` → returns `{ text, ask, actions }`
  - Description: the entry screen. Two shapes, chosen by `waitingQuestionCount`.
  - **Shape A, count is zero.** `text` carries the CTOC heading and a one-line
    orientation. `ask.questions` has exactly ONE question, text
    `'What shall we create today?'`, header `'Start'`, with the options
    `'Type what you want'` and `'Something else?'`. No "answer questions" option is
    present, because there is nothing to answer.
  - **Shape B, count is one or more.** Same heading, plus a line reading
    `N question(s) waiting for you.` `ask.questions` has exactly ONE question, text
    `'What shall we create today — or shall we answer the questions waiting for you?'`,
    header `'Start'`, with the options `'Type what you want'`,
    `'Answer the questions'` and `'Something else?'`.
  - Both shapes route through `decisionMatrix.withSomethingElse`, so the open
    option is present by construction rather than by each branch remembering it.
  - `actions` maps:
    - `'Type what you want'` → `'stream'` (the streaming build flow, which owns the
      free text idea capture and the vision-decomposer dispatch)
    - `'Answer the questions'` → `''` (empty — the streaming gate screen is the
      default no-arguments route, so answering is where the next render already
      lands)
    - `'Something else?'` → `'claude:start-freeform'`
  - Every action key is a WORD. No digit appears in `actions`. Numbers stay
    reserved exclusively for opening a plan.
  - Throws: never.

##### Dependencies

- `require('./streaming-gate')` — for `pendingGateDecisions`
- `require('./streaming-precompute')` — for `loadPlanQuestions`
- `require('./decision-matrix')` — for `withSomethingElse`

##### Called By

- `src/commands/menu.js` → `main()`, the no-arguments branch

##### Data Flow

```
projectPath
  → pendingGateDecisions(projectPath)              [gate-eligible plans]
  → loadPlanQuestions(projectPath, ref) per plan   [ALREADY computed; null if not]
  → count of plans with >= 1 unanswered question
  → shape A (0) or shape B (>0)
  → { text, ask, actions }
```

##### Error Handling

- A throwing `pendingGateDecisions` or `loadPlanQuestions`: caught, counted as
  zero, shape A renders. The entry point must open even when the store is broken.
- The environment, compliance, and stale-plans ride-along questions attach in
  `menu.js` exactly as they do today. `startScreen` returns a well-formed
  `ask.questions` array so the existing attach helpers keep working unchanged.

##### Cross-Platform Notes

- All paths come from `streaming-gate` / `streaming-precompute`, which already use
  `path.join`. This module constructs no path.

---

#### File: `src/lib/streaming-gate.js`
**Action:** MODIFY
**Purpose:** Stop flattening pros and cons into a description string; render the
real matrix, add the open option, and drop `'Open the plan'` per Decision 7.
**Change Type:** modify-existing

##### Changes

- **Import** `decisionMatrix` from `./decision-matrix` (add to the import block at
  the top, alongside the existing `gate-order` require).
- **Modify** `richQuestionScreen()` (line ~546):
  - After `const parts = precomputedQuestionParts(...)`, build the matrix source
    from the ORIGINAL question `q` (which still carries `pros` / `cons` /
    `recommended`), not from `parts.question.options` (which has already been
    flattened to `{ label, description }`).
  - Insert `decisionMatrix.renderMatrix({ ...q, options: decisionMatrix.withSomethingElse(q.options) })`
    into `text`, placed AFTER the topic and counter header line and BEFORE the
    prompt line at line ~571. Matrix first, then the question sentence — the
    `.ctoc/ask-me-questions.md` order.
  - Append the `'Something else?'` option to the `options` array, and map
    `actions['Something else?'] = \`stream comment ${d.ref}\``, so the open answer
    is recorded as a free text comment on the plan (the existing, already-wired
    free text sink that edits no plan and crosses no gate).
  - **DELETE** the `'Open the plan'` option and the `if (options.length < 4)`
    block that adds it (lines ~558-560), and delete
    `actions['Open the plan'] = \`plan ${d.ref}\`` (line ~563). Per Decision 7 this
    option is removed unconditionally, not merely dropped when the cap binds.
  - Final option order: the question's own options, then `'Something else?'`,
    then `'Skip for now'`.
- **Modify** `planDecisionScreen()` (line ~604): apply the same matrix insertion
  and the same `'Something else?'` option to the product-question branch at
  line ~640. That branch calls the same `precomputedQuestionParts`, so it exhibits
  the identical flattening bug and must be fixed in the same pass. Note this screen
  IS the opened plan, so it has no `'Open the plan'` option to remove.
- **Keep** `precomputedOptionDescription()` unchanged and still called. It remains
  correct for the `ask` layer, where a one-sentence description is exactly what the
  harness wants. The matrix is an ADDITION to the text layer, not a replacement of
  the description layer.

##### Dependencies (added)

- `require('./decision-matrix')`

##### Error Handling

- `renderMatrix` returning `''` (malformed question) leaves `text` with the prompt
  and no matrix. Degraded, never broken.
- The whole `richQuestionScreen` call is already wrapped in a `try` at
  `gateScreenAt()` line ~831, falling back to the simple Approve screen. That
  fallback is preserved.

---

#### File: `src/commands/start.md`
**Action:** CREATE
**Purpose:** The `/ctoc:start` slash command specification.
**Change Type:** new-module

##### Content

The full current body of `src/commands/menu.md`, with these edits:

- Frontmatter `description:` becomes
  `CTOC — start here. Say what you want built, or answer the questions waiting for you.`
- Frontmatter keeps `effort: low` and declares **NO** `model:` line. A slash
  command's `model:` switches the LIVE session, which is what crashed sessions
  before (see `tests/slash-command-no-model-pin.test.js`).
- The `(no args)` row of the Navigation Commands table is rewritten to describe
  the start screen: the open prompt when nothing is waiting, the open prompt plus
  the answer-questions choice when questions are waiting.
- A new Rule is appended documenting the matrix requirement: every question this
  command asks renders the four-column Unicode box-drawing decision matrix in the
  screen text first, then the question, and every question carries the
  `'Something else?'` open option. This mirrors `.ctoc/ask-me-questions.md`, which
  stays the canonical format specification.
- The same Rule records Decision 7: the question screen does not offer
  `'Open the plan'`; a plan is opened from the plan list.
- The closing line becomes: `CTOC ships exactly three slash commands: start, push, update.`
- Every `node "${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js"` invocation is
  UNCHANGED — the script keeps its name (Decision 2).

---

#### File: `src/commands/menu.md`
**Action:** DELETE
**Purpose:** Removing it is what keeps the count at exactly three commands.

The content moves to `src/commands/start.md`. Deleting rather than aliasing is
Decision 1; the reasoning and the cost are recorded there.

---

#### File: `src/commands/menu.js`
**Action:** MODIFY
**Purpose:** Make the start screen the live no-arguments render.
**Change Type:** modify-existing

##### Changes

- **Modify** the file header comment (line 2-4) to read
  `Main entry point for the /ctoc:start command` and to note that the script
  filename is deliberately unchanged (pointing at this plan's Decision 2).
- **Modify** `main()`, the no-arguments branch (currently line ~727-728):
  replace `const result = streamingGate.streamingGateScreen(app.projectPath)` with
  `const result = require('../lib/start-screen').startScreen(app.projectPath)`.
- **Keep** the environment, compliance, and initialization-note attach calls that
  follow (lines ~729-740) exactly as they are. They operate on the returned
  `{ text, ask, actions }` shape, which `startScreen` preserves. A brand-new
  project has no plans at gates, so it renders shape A and the first-run
  environment question still rides along — preserved behaviour, verified by
  `tests/menu-environment.test.js`.
- **No change** to `route()` in `src/lib/menu-screens.js`. The `stream` route
  remains the way the answer flow is reached, and the `dashboard` route remains
  the way the classic overview is reached. Nothing is orphaned.

---

#### Files: documentation and instruction surfaces
**Action:** MODIFY (mechanical rename of the user-visible command name)

| File | Change |
|---|---|
| `src/hooks/SessionStart.js` | Lines 202 and 392: `/ctoc:menu` → `/ctoc:start`. Line 200's dead `writePlanQuestions` instruction is NOT touched here — see the known upstream gap section; it belongs to 00066. |
| `src/hooks/PreToolUse.Edit.js` | Lines 321, 322, 344: `/ctoc:menu` → `/ctoc:start` in the human-facing block message. |
| `src/hooks/PreToolUse.Bash.js` | Line 352: `/ctoc:menu` → `/ctoc:start` in the ledger denial reason. |
| `.ctoc/templates/operating-lessons.md` | Line 73: the three-command list becomes `start`, `push`, `update`. |
| `README.md` | Lines 440, 746, 750-752, 767, 773, 788, 841: command table, the `/ctoc` alias row, the update instructions, and the project-structure line. Keep the phrase `3 slash commands` verbatim — `tests/readme-numbers.test.js` line 257 asserts on it. |
| `CLAUDE.md` | Every `/ctoc:menu` occurrence, the "Model rules" table, the "Minimal slash commands" statement, and the Project Init Procedure paragraph (which says opening the menu triggers initialization — it is now opening start). |
| `docs/AGENT_ARCHITECTURE.md` | The front-process versus subagent model-rule section, which names the command. |

---

### Test Plan

#### Tests: `tests/decision-matrix.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `assert`)

1. **Real box-drawing characters, never pipes.** Render a two-option question;
   assert the output contains `┌`, `┬`, `┐`, `├`, `┼`, `┤`, `└`, `┴`, `┘` and
   `│`, and assert `output.includes('|') === false`. This is the explicit
   project rule that a pipe-character pseudo-table is unacceptable.
2. **The four columns, spelled in full.** Assert the header row contains
   `Option`, `Pros`, `Cons`, `Recommendation`, and that no abbreviated form
   appears.
3. **Vertical alignment.** Split the output into lines, keep only matrix rows,
   and assert every row has `│` at the identical set of column indices. A matrix
   whose separators do not line up is not a matrix.
4. **Exactly one Recommended cell.** Two options both flagged
   `recommended: true`; assert the rendered output contains the substring
   `Recommended` exactly once (Decision 1 in `renderMatrix`).
5. **Pros and cons survive.** An option with `pros: 'Fast to build.'` and
   `cons: 'Harder to change later.'`; assert both sentences appear in the output.
   This is the direct regression test for the flattening bug.
6. **Singular keys render empty, never fabricated.** An option carrying
   `pro: 'x'` / `con: 'y'` (singular); assert the output contains neither `'x'`
   nor `'y'`, and does not throw. Pins Decision 6.
7. **`withSomethingElse` appends the open option.** Two input options; assert the
   result has three, the last has `key === 'else'` and
   `label === 'Something else?'`.
8. **`withSomethingElse` is idempotent.** Call it twice; assert exactly one open
   option in the result.
9. **`withSomethingElse` on a non-array.** Input `null`; assert the result is an
   array of length one containing the open option. The escape hatch exists even
   when everything else is broken.
10. **Control characters are stripped.** An option label containing `\x1b[31m`;
    assert the escape sequence does not reach the output.
11. **Malformed input returns the empty string.** `renderMatrix(null)`,
    `renderMatrix({})`, `renderMatrix({ options: [] })` each return `''` and do
    not throw.

#### Tests: `tests/start-screen.test.js`
**Action:** CREATE

1. **Shape A — no questions waiting.** Temporary project directory with a plan at
   a gate and NO questions file. Assert `waitingQuestionCount === 0`; assert the
   screen's single question text is exactly `'What shall we create today?'`;
   assert no option is labelled `'Answer the questions'`.
2. **Shape B — questions waiting.** Same fixture plus a questions file written
   through the real `streamingPrecompute.writePlanQuestions(root, ref, questions, mtime)`
   with the plan's current mtime. Assert `waitingQuestionCount === 1`; assert the
   question text is `'What shall we create today — or shall we answer the questions waiting for you?'`;
   assert BOTH `'Type what you want'` and `'Answer the questions'` are present.
3. **Stale questions do not count.** Write a questions file with a `planMtimeMs`
   older than the plan's current mtime; assert `waitingQuestionCount === 0` and
   shape A renders. A stale critique must never claim there is something to answer.
4. **Fully answered questions do not count.** Write questions, then append a
   matching answer line to `.ctoc/streaming/answers.jsonl` for every question id;
   assert `waitingQuestionCount === 0`.
5. **The open option is always present.** Both shapes; assert
   `'Something else?'` appears in `ask.questions[0].options` in each.
6. **No digit is ever an action key.** Assert
   `Object.keys(screen.actions).every(k => !/^\d+$/.test(k))`. Numbers open plans
   and nothing else.
7. **Never throws on a broken store.** Point `startScreen` at a directory with no
   `plans/` and no `.ctoc/`; assert it returns a well-formed
   `{ text, ask, actions }` and does not throw.
8. **The ride-along contract holds.** Assert `ask.questions` is an array and
   `actions` is a plain object, so `attachEnvironmentQuestion` and
   `attachComplianceQuestion` in `menu.js` can append to them unchanged.

#### Tests: `tests/ctoc-start-flow.test.js`
**Action:** CREATE
**Purpose:** The real human flow, end to end, driving the actual entry point.
This is the test that Operating Lesson 6 demands — behaviour, not structure.

1. **No questions → the open prompt appears.** Build a temporary project with a
   plan at a gate and no questions store. Execute
   `node src/commands/menu.js` with `cwd` set to the fixture, capture stdout,
   `JSON.parse` it. Assert the parsed `ask.questions[0].question` is exactly
   `'What shall we create today?'`. This drives the shipped entry point as a real
   process, not the module in isolation.
2. **Questions present → both choices appear, and answering reaches a REAL
   precomputed question.** Same fixture plus a questions file written through
   `writePlanQuestions` containing one `critical` question with two options
   carrying real `pros`, `cons` and one `recommended: true`. Then:
   - Run `node src/commands/menu.js`; assert both `'Type what you want'` and
     `'Answer the questions'` are among the option labels.
   - Follow the `'Answer the questions'` action by running `node src/commands/menu.js`
     with no arguments (the action maps to the default route); assert the rendered
     question prompt is the exact prompt string that was written to the store —
     proving the answer path reaches the real precomputed question and did not
     regenerate or invent one.
   - Assert the rendered `text` contains `┌` and `│` and both the `pros` and the
     `cons` sentence — the matrix reached the human.
   - Assert `'Something else?'` is among the rendered options.
   - Assert `'Open the plan'` is NOT among the rendered options (Decision 7).
3. **Zero wait.** Assert the questions store file's modification time is unchanged
   after the render, and that the render process wrote nothing under
   `.ctoc/streaming/questions/`. The foreground reads; it never generates.
4. **`/ctoc:start` is the only entry spec.** Assert
   `fs.existsSync('src/commands/start.md')` is true and
   `fs.existsSync('src/commands/menu.md')` is false.
5. **Still exactly three slash commands.** Assert the count of `.md` files in
   `src/commands/` is 3, and that the set of basenames is exactly
   `{ start, push, update }`.
6. **No gate is crossed.** After the whole flow, assert no plan file moved
   between stage directories and that no file under `.ctoc/approvals/` was
   created or modified.

#### Tests: `tests/streaming-gate.test.js`
**Action:** MODIFY

- Add: `richQuestionScreen` output `text` contains the box-drawing matrix and both
  the `pros` and the `cons` strings of every option.
- Add: `richQuestionScreen` options include `'Something else?'`, and
  `actions['Something else?']` is `stream comment <ref>`.
- Add: `richQuestionScreen` options do NOT include `'Open the plan'`, and
  `actions` has no `'Open the plan'` key — asserted for BOTH a two-option and a
  four-option question, so the removal is proved unconditional rather than
  cap-dependent (Decision 7).
- Add: option order is the question's own options, then `'Something else?'`, then
  `'Skip for now'`.
- Add: `planDecisionScreen`'s product-question branch renders the same matrix.
- Update: any existing assertion on the flattened description string, to assert the
  description AND the matrix, rather than being loosened. Any existing assertion
  that `'Open the plan'` is offered on the question screen is DELETED, not
  weakened — it asserts behaviour the human has now removed. Per Operating
  Lesson 14 this is the narrow legitimate case: the contract it tested was
  explicitly replaced.

#### Tests: `tests/readme-numbers.test.js`
**Action:** MODIFY

- Line 22: `MENU_MD` reads `src/commands/start.md`; rename the constant to
  `START_MD` and update its uses at lines 359, 367, 379, 386, 392, 412.
- Line 139: the assertion stays `=== 3`; update its title to name `start, push,
  update`.
- Line 257: `assert.match(README, /3 slash commands/)` stays as-is — the README
  keeps that exact phrase.
- Add: assert `src/commands/menu.md` does NOT exist, so a re-added fourth command
  is caught here.
- `src/lib/`: the module count assertion at line 136 rises from 100 to 102
  (`decision-matrix.js` and `start-screen.js`).

#### Tests: `tests/slash-command-no-model-pin.test.js`
**Action:** MODIFY

- Line 49: read `start.md` instead of `menu.md`; update the assertion message.
- The loop at lines 36-46 is filename-agnostic and needs no change — it already
  covers every `.md` in the directory, so `start.md` is checked for a `model:` pin
  automatically.

#### Tests: `tests/e2e-menu-lifecycle.test.js`
**Action:** MODIFY

- Update the `/ctoc:menu` references to `/ctoc:start`.
- Update any assertion that the no-arguments render is the gate screen; it is now
  the start screen, which reaches the gate screen through the
  `'Answer the questions'` choice.

#### Coverage Targets

- New modules `decision-matrix.js` and `start-screen.js`: at or above 80 percent
  line and branch coverage, every error path exercised.
- Overall: `npm test` must hold the floor recorded in
  `.ctoc/coverage-baseline.json`. The floor is a ratchet and is never lowered to
  make a run pass.

### Security Review

- [x] **Path traversal.** `start-screen.js` constructs no path; every path comes
      from `streaming-gate` / `streaming-precompute`, whose `sanitizeRef` already
      collapses separators and traversal into one inert filename segment.
- [x] **Input validation.** `renderMatrix` and `withSomethingElse` type-check every
      field they read and treat a non-string as absent rather than coercing it.
- [x] **Terminal injection.** Question text, option labels, pros, cons and
      descriptions are all subagent-authored and therefore untrusted. Every one
      passes through `stripCtl` before reaching the output. This is the same
      discipline `streaming-gate.js` already applies.
- [x] **No secrets.** No key, token, credential or path to one appears in any file
      in this slice.
- [x] **Safe file operations.** This slice's runtime code WRITES NOTHING. It is a
      pure read plus a render. Only the tests write, and only into temporary
      directories they create and remove.
- [x] **Error messages.** Failures degrade to a shape-A render or an omitted
      matrix; no stack trace, internal path, or store state reaches the human.
- [x] **Prototype pollution.** `withSomethingElse` builds a new array with object
      literals; no merge of untrusted input into an existing object.
- [x] **Command injection.** No `exec`, no `execSync`, no shell interpolation in
      any file in this slice.
- [x] **Human gates.** Nothing here approves, stamps `approved_by`, writes the
      approval ledger, or moves a plan between stages. Gates 0 through 3 are
      untouched, and test 6 in `tests/ctoc-start-flow.test.js` asserts it.
- [x] **Tool-capability boundary unchanged.** This slice widens no agent's
      `tools:` declaration. The lens critics keep `Read, Grep` (the Rule-of-Two
      hardening); the upstream producer gap is recorded, not patched here.

## Implementation Order

1. `src/lib/decision-matrix.js` — no dependencies on other new files
2. `tests/decision-matrix.test.js`
3. `src/lib/start-screen.js` — depends on step 1
4. `tests/start-screen.test.js`
5. `src/lib/streaming-gate.js` — depends on step 1
6. `tests/streaming-gate.test.js`
7. `src/commands/menu.js` — depends on step 3, the live wiring
8. `src/commands/start.md` created, `src/commands/menu.md` deleted
9. `tests/readme-numbers.test.js`, `tests/slash-command-no-model-pin.test.js` — the two hard-break tests
10. `tests/ctoc-start-flow.test.js` — the human-flow test, needs 7 and 8 in place
11. `tests/e2e-menu-lifecycle.test.js`
12. Documentation and hook message surfaces: `src/hooks/SessionStart.js`, `src/hooks/PreToolUse.Edit.js`, `src/hooks/PreToolUse.Bash.js`, `.ctoc/templates/operating-lessons.md`, `README.md`, `CLAUDE.md`, `docs/AGENT_ARCHITECTURE.md`

Test-driven development inverts the write order within each pair — the test is
written and seen failing before its module exists. The list above is DEPENDENCY
order: what must exist before what can reference it.

## Acceptance Criteria Mapping

| Criterion | Implemented In | Test Case |
|---|---|---|
| 1. `/ctoc:start` exists | `src/commands/start.md` | `ctoc-start-flow.test.js` case 4 |
| 2. Still exactly three commands | `src/commands/menu.md` deleted | `ctoc-start-flow.test.js` case 5; `readme-numbers.test.js` line 139 |
| 3. No questions → open prompt only | `start-screen.js:startScreen()` shape A | `start-screen.test.js` case 1; `ctoc-start-flow.test.js` case 1 |
| 4. Questions → both choices | `start-screen.js:startScreen()` shape B | `start-screen.test.js` case 2; `ctoc-start-flow.test.js` case 2 |
| 5. Reaches a real precomputed question | `start-screen.js:waitingQuestionCount()` reading `loadPlanQuestions` | `ctoc-start-flow.test.js` case 2 |
| 6. Matrix with the four columns | `decision-matrix.js:renderMatrix()` | `decision-matrix.test.js` cases 1-5; `ctoc-start-flow.test.js` case 2 |
| 7. `'Something else?'` always present | `decision-matrix.js:withSomethingElse()` | `decision-matrix.test.js` cases 7-9; `start-screen.test.js` case 5 |
| 8. No model pin | `src/commands/start.md` frontmatter | `slash-command-no-model-pin.test.js` |
| 9. Numbers open plans only | `start-screen.js` action keys | `start-screen.test.js` case 6 |
| 10. Gates untouched | no approval code path in this slice | `ctoc-start-flow.test.js` case 6 |
| 11. Full gate green | all | Step 14 VERIFY, `npm test` |
| Decision 7 — `'Open the plan'` dropped | `streaming-gate.js:richQuestionScreen()` | `streaming-gate.test.js`; `ctoc-start-flow.test.js` case 2 |

## Risk Mitigations

| Risk | Mitigation | Where |
|---|---|---|
| Building this before 00066 ships a start screen whose best path is empty | `depends_on: 00066-x9-gate-critic-writes-its-own-questions`; the producer gap is recorded in full above | Frontmatter; known upstream gap section |
| Renaming the command file silently breaks a test that reads it by path | Both path-reading tests are named in `files:` and updated in the same slice | `readme-numbers.test.js`, `slash-command-no-model-pin.test.js` |
| A human types `/ctoc:menu` and gets nothing | The name is taught in the same slice by `SessionStart.js` (every session) and `README.md` | Decision 1 |
| Box-drawing alignment breaks on wide characters or a narrow terminal | Widths are capped, cells wrap, and the alignment test asserts identical `│` column indices on every row | `decision-matrix.test.js` case 3 |
| The matrix is rendered but the human never sees pros and cons because the flattening path is still used | The matrix is asserted to contain the literal pros and cons sentences, not merely to exist | `decision-matrix.test.js` case 5; `streaming-gate.test.js` |
| `'Open the plan'` is removed only when the cap binds, leaving inconsistent screens | Asserted absent on BOTH a two-option and a four-option question | `streaming-gate.test.js` |
| Losing the plan-opening route entirely | The plan list route is unchanged; opening a plan costs one extra hop, never access | Decision 7 |
| A producer writes singular `pro` / `con` and the reasoning vanishes with no error | Pinned by a test asserting the singular keys render empty rather than fabricated | `decision-matrix.test.js` case 6; Decision 6 |
| The start screen appears to have questions when the critique is stale | `loadPlanQuestions` already returns `null` for stale; asserted directly | `start-screen.test.js` case 3 |
| The environment or compliance first-run prompt is lost in the new screen | The return shape is preserved and the attach helpers are unchanged; asserted | `start-screen.test.js` case 8 |

## Execution Plan

### Step 8: TEST
Write `tests/decision-matrix.test.js`, `tests/start-screen.test.js` and
`tests/ctoc-start-flow.test.js` FIRST, and run them to see them fail for the right
reason — module not found, then wrong output. Add the new assertions to
`tests/streaming-gate.test.js`. A test written and run in the same pass as its
implementation is a violation; the red must be observed.

### Step 9: PREPARE
Confirm 00066 has landed, so the store this screen reads is actually being filled.
Confirm the current entry path by reading `src/commands/menu.js` `main()` and
`src/lib/menu-screens.js` `route()` fresh from disk — line numbers in this plan are
indicative and must be re-derived, never trusted. Confirm the current
`src/lib/` top-level module count so the `readme-numbers.test.js` assertion is
raised to the true new value. Confirm `.ctoc/coverage-baseline.json` `minPct`.

### Step 10: IMPLEMENT
- `src/lib/decision-matrix.js` — create
- `src/lib/start-screen.js` — create
- `src/lib/streaming-gate.js` — matrix insertion, open option, and the
  `'Open the plan'` removal in `richQuestionScreen` and `planDecisionScreen`
- `src/commands/menu.js` — the no-arguments branch calls `startScreen`
- `src/commands/start.md` — create; `src/commands/menu.md` — delete
- `src/hooks/SessionStart.js`, `src/hooks/PreToolUse.Edit.js`,
  `src/hooks/PreToolUse.Bash.js` — command name in human-facing text
- `.ctoc/templates/operating-lessons.md`, `README.md`, `CLAUDE.md`,
  `docs/AGENT_ARCHITECTURE.md` — command name
- `tests/readme-numbers.test.js`, `tests/slash-command-no-model-pin.test.js`,
  `tests/e2e-menu-lifecycle.test.js` — updated to the new name

### Step 11: REVIEW
Verify: dependencies flow one way (`decision-matrix` ← `start-screen` and
`streaming-gate`, never the reverse); no cycle; `start-screen` imports nothing
from `src/hooks/` or `src/commands/`; every new function takes only the parameters
it uses; `precomputedOptionDescription` is extended-around, not rewritten; no test
depends on execution order or on another test's temporary directory; no agent's
`tools:` declaration was touched.

### Step 12: OPTIMIZE
Confirm `waitingQuestionCount` reads each plan's questions at most once per render
and that `startScreen` does not call it twice. Confirm the matrix is built once per
question, not once per option. Remove any duplicated width-computation pass.

### Step 13: SECURE
Walk the Security Review checklist above item by item against the written code.
Specifically re-verify that every subagent-authored string reaching the terminal
passes `stripCtl`, and that the runtime code in this slice writes no file.

### Step 14: VERIFY
Run the FULL gate: `npm test`. Not `node --test tests/*.test.js`, which bypasses
both the coverage floor and the zero-skipped gate. Required: `# fail 0`, zero
skipped, zero flaky, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
Then manually open `/ctoc:start` in a real session and confirm with your own eyes:
the open prompt when nothing waits; both choices when something waits; a real
matrix with visible vertical lines; `'Something else?'` on the question; and no
`'Open the plan'` option. A green suite is not the measure — a human opening it and
getting the right screen is.

### Step 15: DOCUMENT
Confirm every new function carries a documentation comment with typed parameters,
return type, and the throws contract. Confirm the seven documentation and
instruction surfaces name `/ctoc:start` and that no shipped human-facing text
still says `/ctoc:menu`. Confirm this plan's Decisions section matches what was
actually built.

### Step 16: FINAL-REVIEW
Walk the Quality Bar: every acceptance criterion maps to an implementation and a
test; every file has an exact path and a declared action; the dependency graph has
no cycle and no orphan; the test plan covers happy path, error paths and edge
cases; the security checklist has no open item; cross-platform requirements hold;
every risk maps to a concrete mitigation. Confirm the three-command invariant, the
no-model-pin invariant, and that no human gate was crossed by this work.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review

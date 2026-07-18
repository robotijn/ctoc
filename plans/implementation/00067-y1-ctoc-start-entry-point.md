---
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
  - src/lib/question-cadence.js
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
  - tests/question-cadence.test.js
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

Fourth problem: the system cannot tell a trusted recommendation from an ignored
one. A run of accepted recommendations is AMBIGUOUS evidence. It can mean the
recommendations are right and trusted, or it can mean the questions stopped being
worth reading and the human is clicking through. Those two states are
indistinguishable from the system's side and imply OPPOSITE corrections — one says
ask less on this topic, the other says the topic is under-explored and needs to be
asked deeper. Only the human can disambiguate, and today he is never asked.

## What the human asked for, verbatim

> "i want the ctoc:menu to become ctoc:start and then the user can choose between
> 'type what you want' and 'answer questions' (if there are any) and if there are
> no questions then only 'what shall we create today?' or something similar"

> "and with the questions show pros cons recommendation in matrix, as
> /ask-me-questions does, and always have an open field : 'something else?'"

> "just make real questions for decisions that are not clear enough, you know, when
> the user state something like: i think you got this part , and that is why we deal
> with 1 topic at a time , after 10 approves ask: do you think my recommendations
> are good and that I understand it? or do you want more question on topic <topic>?"

Build to those three sentences. Do not reinterpret them.

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
12. **Only real questions.** A question with fewer than two substantive options is
    never presented. A question the human cannot actually decide is not asked.
13. **One topic at a time.** A single screen never presents questions belonging to
    two different topics, and never batches unrelated forks together.
14. **Calibration check-in.** After ten consecutive accepted recommendations
    within one topic, a check-in is presented before continuing, naming the topic
    spelled out in full — never a code or a slug.
15. The check-in resets that topic's counter, and its answer changes how much the
    system asks about that topic thereafter.

## Scope

**In scope.** The command rename; the two-shape start screen; a reusable decision
matrix renderer; wiring that renderer into the streaming question screen so pros,
cons and the recommendation survive to the human's eyes; the "Something else?"
injection; the question-cadence rules (only real questions, one topic at a time,
the calibration check-in); and every documentation surface and test that carries
the command name and would otherwise be wrong or would hard-break.

**Out of scope.** The gate logic itself. The precompute producer path and the
upstream gap recorded above (that is 00066). The question contract in
`src/lib/streaming-precompute.js`. The classic `dashboard` route. Unifying the
build-flow in-memory streak with the new persisted one (see Decision 12).

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

### Decision 8 — what makes a question REAL

The human's rule: "just make real questions for decisions that are not clear
enough." A question that is not a decision trains him to stop reading questions,
which destroys the value of the ones that matter.

`isRealQuestion(question)` returns false — and the question is never presented —
when **fewer than two substantive options remain after excluding the injected
`'Something else?'` option.** A choice of one is not a choice. This test is
objective and unarguable, which is why it is the hard filter rather than a
heuristic about how "obvious" a recommendation looks.

Above that hard filter, the TIER already in the contract does the rest of the work,
and this slice uses it rather than inventing a parallel notion of obviousness:

| Tier | Treatment | Why |
|---|---|---|
| `critical` | Always asked individually, one at a time, never batched | `isBlockingQuestion` already treats it as a real fork; `hasEnoughInformation` already refuses to pass with one unanswered |
| `important` | Always asked individually | Same — a strong-preference fork is still the human's |
| `normal`, has a recommended option | Eligible for the existing batch-approve offer rather than an individual ask | This is exactly `pendingBatchQuestions` in `src/lib/streaming-flow.js` line 371, which already excludes criticals and no-recommendation questions |
| `normal`, no recommended option | Asked individually — the system has no answer to offer | Cannot be auto-answered; the human must pick |

The judgement of "not clear enough" therefore lives with the PRODUCER, which sets
the tier, and the render enforces the consequence. That is the correct division:
the critique fleet knows whether a decision is genuinely open; the screen does not.

### Decision 9 — one topic at a time, made explicit and asserted

Already the shape of the streaming screen: `gateScreenAt` renders one decision,
and `nextUnansweredQuestion` returns exactly one question. This slice does not
change that behaviour — it PINS it, so no future change can interleave topics or
batch unrelated forks onto one screen.

Pinned by assertion, not by comment: `tests/question-cadence.test.js` and
`tests/streaming-gate.test.js` assert that a rendered screen's `ask.questions`
array has length one, and that every option in it routes to the SAME topic. The
existing environment / compliance / stale-plans ride-alongs are the one documented
exemption — `.ctoc/ask-me-questions.md` line 79 already exempts them as passing
settings toggles that shape no design, and they are not topic questions.

### Decision 10 — the answers log CANNOT derive the streak today; extend it

**Verified, not assumed.** `streamAnswer` (`src/lib/streaming-gate.js` line 1029)
appends exactly:

```js
{ ts, ref, questionId, optionKey }
```

There is no record of whether `optionKey` WAS the recommended option, and no topic
identity beyond the plan ref. The streak the human asked for — consecutive
*accepted recommendations* within one topic — is therefore **not derivable from the
log as written**.

It cannot be reconstructed after the fact either: the recommendation lived in the
questions file, and that file is regenerated whenever the plan changes (a stale
file is discarded and rewritten, `planQuestionsStatus` lines 372-377). The
historical recommendation is genuinely gone.

So the log line is EXTENDED, and the extra fields are captured at write time when
the questions file is still fresh:

```js
{ ts, ref, questionId, optionKey,
  topicKey,          // the topic identity — the plan ref for gate questions
  topicLabel,        // the SPELLED-OUT topic name shown to the human
  tier,              // 'critical' | 'important' | 'normal'
  tookRecommended }  // boolean — was optionKey the recommended option?
```

Backward compatible by construction: the file is append-only JSONL, and every
existing reader (`answeredQuestionIds`, `readAnsweredQuestionIds`) reads only `ref`
and `questionId`, both unchanged. **A legacy line missing `tookRecommended` RESETS
the streak** rather than being skipped. That direction is deliberate: an unknown
can only ever DELAY the check-in, never fire one spuriously. A check-in that
arrives late is a small annoyance; one that fires on evidence that does not exist
is the system lying about what it observed.

### Decision 11 — the threshold is a named constant, and the counter resets

`CALIBRATION_THRESHOLD = 10`, declared once in `src/lib/question-cadence.js` and
exported. It appears nowhere else — no literal `10` in any render path.

**The counter RESETS to zero after a check-in.** This is not a preference; the
alternative is broken. Without a reset the streak stays at or above ten forever
and the check-in fires on every subsequent answer — a nag, which is exactly the
failure mode the check-in exists to detect. Resetting makes it periodic: roughly
every ten accepted recommendations per topic, the system asks whether it is still
earning that trust.

The check-in's ANSWER is recorded separately and durably (see Decision 12), so
resetting the counter does not discard what he told us.

### Decision 12 — the check-in verdict is stored, and per-topic

`.ctoc/streaming/calibration.jsonl`, append-only, one line per check-in:
`{ ts, topicKey, topicLabel, verdict }` where `verdict` is `'trusted'` or
`'deeper'`. The latest line for a topic wins.

- `'trusted'` — "your recommendations are good". Consequence: **ask less on that
  topic.** Normal-tier questions with a recommended option take their
  recommendation without an individual ask; criticals and importants are STILL
  asked. Trust is never allowed to swallow a real fork — that is the whole point
  of the tier.
- `'deeper'` — "I want more questions on this topic". Consequence: **normal-tier
  questions on that topic are asked individually**, and the batch-approve offer is
  suppressed for it.

The counter is keyed **per topic, never globally**. A global counter would let ten
easy approvals on one topic silence questions on an unrelated one, which is the
opposite of what he asked for.

**Topic identity versus topic name.** These are deliberately two different things:
the key is `ref` (stable, machine-safe); the label is the plan's TITLE, read by the
existing `planTitle()` helper (`src/lib/streaming-gate.js` line ~121, matching
`^#\s+(.+)$`). The human's standing rule is that he must never be shown an invented
code or a slug — so the check-in prompt names the title, spelled out. The slug
appears nowhere in the question text.

**Known duplication, stated rather than hidden.** An in-memory streak already
exists: `recommendedStreak` in `src/lib/streaming-flow.js` (line 201), with
`DEFAULT_BATCH_THRESHOLD = 5` (line 359), driving the build-flow batch-approve
offer. The new counter does NOT replace it, because they measure different things:
the existing one is per-session within the build flow's topics; the new one is
persisted per-topic across sessions for the gate flow. Two mechanisms measuring
adjacent things is a real drift risk. It is recorded here and in the risk table,
and unifying them is deliberately NOT in this slice — that is a change to the
build flow, which this slice otherwise does not touch.

### Decision 13 — which files carrying `/ctoc:menu` are in this slice

Nothing is hidden. Complete inventory of files containing the literal string
`/ctoc:menu`, and the disposition of each.

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
| `src/lib/streaming-gate.js` | Yes | Already in scope for the matrix and cadence work. |
| `src/lib/menu-screens.js` | No | Source comment only. Not reachable by a human, and this file is not otherwise edited here. |
| `src/lib/streaming-render.js` | No | Source comment only. |
| `src/lib/cache.js`, `src/lib/reachability.js`, `src/lib/task-reconcile.js`, `src/areas/agent.js` | No | Source comments only. |
| `agents/iron-loop/premortem-critic.md`, `agents/iron-loop/devils-advocate-critic.md`, `agents/iron-loop/iron-loop-executor.md` | No | Agent prose; the agents are dispatched by the session model, never by a human typing the command. |
| `tests/streaming-render.test.js`, `tests/menu-coverage.test.js`, `tests/menu-environment.test.js`, `tests/compliance-ride-along.test.js`, `tests/menu-task-wiring.test.js`, `tests/w10-live-agent-reconcile.test.js`, `tests/task-reconcile-coverage.test.js`, `tests/pretooluse-edit-coverage.test.js`, `tests/scheduler-enforced.test.js`, `tests/export-reachability.test.js`, `tests/ledger-forgery-closed.test.js`, `tests/agent-layer-reachability.test.js`, `tests/iron-loop-enforcer-coverage.test.js` | No | The string appears in comments or in assertions about `menu.js` (which keeps its name per Decision 2). None of them reads `menu.md` by path, so none breaks. |
| `plans/**` | No | Historical plan records. Rewriting history would be dishonest. |

The line is drawn at: does a human read this string, or does this file break? If
either is true it is in the slice.

## Implementation Details

### Architecture Decision

Three new modules, layered so nothing reaches sideways:

- `src/lib/decision-matrix.js` — pure rendering. Two callers need it (the start
  screen and the gate question screen), so it sits below both.
- `src/lib/question-cadence.js` — the cadence rules: is this a real question, what
  is the per-topic streak, is a check-in due, what did the human last say about
  this topic. Pure logic plus two small append-only readers/writers.
- `src/lib/start-screen.js` — the entry screen, above both.

The start screen is NOT another branch inside `streaming-gate.js`: that file is
about gate decisions and already carries eleven hundred lines, and the start screen
depends on it for a single read.

### Dependency Graph

```
src/lib/decision-matrix.js        src/lib/question-cadence.js
   (./tui only)                      (./safe-fs, ./tui only)
        ▲          ▲                      ▲          ▲
        │          │                      │          │
        │          └──────┬───────────────┘          │
        │                 │                          │
src/lib/start-screen.js   │        src/lib/streaming-gate.js  (modified)
        │                 └────────────────┘         ▲
        │                                            │
        └──── reads pendingGateDecisions, loadPlanQuestions
                                                     │
src/commands/menu.js  ──calls startScreen────────────┘   (modified: no-args path)
        ▲
        │
src/commands/start.md  (new spec — the live entry point; menu.md removed)
```

No cycles. Both new leaf modules depend on nothing in CTOC except `./tui` and
`./safe-fs`.

### Wiring — the live call sites

Per Operating Lesson 16, every new module is reachable from a live entry point in
this same slice.

| New module | Live call site | Root it is reachable from |
|---|---|---|
| `src/lib/decision-matrix.js` | `src/lib/streaming-gate.js` → `richQuestionScreen()`; `src/lib/start-screen.js` → `startScreen()` | The shipped `/ctoc:start` slash command |
| `src/lib/question-cadence.js` | `src/lib/streaming-gate.js` → `nextUnansweredQuestion()`, `richQuestionScreen()`, `streamAnswer()` | The shipped `/ctoc:start` slash command |
| `src/lib/start-screen.js` | `src/commands/menu.js` → `main()`, the no-arguments branch (currently line ~728) | The shipped `/ctoc:start` slash command |

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
  - Renders `question.options` as a fenced Unicode box-drawing table with the four
    columns `Option`, `Pros`, `Cons`, `Recommendation`. Returns the fenced block
    including the opening and closing triple backticks and a trailing newline.
  - Column characters: top edge `┌ ─ ┬ ┐`, row separator `├ ─ ┼ ┤`, bottom edge
    `└ ─ ┴ ┘`, vertical `│` (U+2502). Never the pipe character `|`.
  - Column widths computed from content, then capped at `[24, 40, 38, 46]` — the
    standing "roughly five spaces narrower" preference applied to the four-column
    structure from `.ctoc/ask-me-questions.md`, whose example uses `[28, 47, 45, 55]`.
  - Cell text longer than its column wraps within the same cell; a sentence is
    never broken across cells.
  - The Recommendation cell is non-empty for exactly the option whose
    `recommended === true`, reading `Recommended — <reason>` where `<reason>` is the
    option's `description` when present, otherwise `highest-quality option for this
    decision`. Every other Recommendation cell is empty. When more than one option
    is flagged, only the FIRST in array order is marked — `validatePlanQuestions`
    does not enforce single-recommendation, so the renderer must not assume it.
  - All cell text passes through `stripCtl`. Option text is subagent-authored and
    therefore untrusted for terminal output.
  - Throws: never. A malformed question returns `''`.

- `withSomethingElse(options)` → returns `Array<object>`
  - Returns a copy of `options` with `{ key: 'else', label: 'Something else?',
    description: 'Type your own answer — none of the options above.' }` appended.
  - Idempotent: an input already carrying `key === 'else'` or the label is returned
    unchanged (copied).
  - Throws: never. A non-array input returns an array containing only the open
    option, so the escape hatch exists even when the question is malformed.

- `SOMETHING_ELSE_KEY` → `'else'`
- `SOMETHING_ELSE_LABEL` → `'Something else?'`

##### Dependencies
- `require('./tui')` — for `stripCtl`

##### Called By
- `src/lib/streaming-gate.js` → `richQuestionScreen()`, `planDecisionScreen()`
- `src/lib/start-screen.js` → `startScreen()`

##### Error Handling
- Non-object question, missing `options`, empty `options`: return `''`. The caller
  renders the question with no matrix rather than crashing. A missing matrix is a
  degraded screen; a thrown error is a dead entry point.
- Non-string `pros` / `cons` / `description`: treated as absent, cell empty. Never
  coerced with `String()`, which would print `[object Object]` at the human.

##### Cross-Platform Notes
- Pure string construction; no file system, no path handling. `\n` only.

---

#### File: `src/lib/question-cadence.js`
**Action:** CREATE
**Purpose:** Decide whether a question is worth asking, track the per-topic streak
of accepted recommendations, and raise the calibration check-in when it is due.
**Change Type:** new-module

##### Exports

- `CALIBRATION_THRESHOLD` → `10`
  - The single declaration of the number. Decision 11.

- `isRealQuestion(question)` → returns `boolean`
  - False when fewer than two substantive options remain after excluding the
    injected `'Something else?'` option (matched by `SOMETHING_ELSE_KEY` or label).
    False for a null / malformed question. Decision 8.
  - Throws: never.

- `shouldAskIndividually(question, verdict)` → returns `boolean`
  - The tier policy from Decision 8, parameterised by the topic's latest check-in
    verdict (`'trusted'` | `'deeper'` | `null`).
  - `critical` and `important` → always `true`, for every verdict. A fork is never
    silenced by trust.
  - `normal` with no recommended option → `true`.
  - `normal` with a recommended option → `false` when verdict is `'trusted'`
    (it takes its recommendation); `true` when verdict is `'deeper'`; otherwise
    `true` unless it is eligible for the batch offer.
  - Throws: never. An unrecognised tier is treated as `normal`.

- `recordAnswer(root, entry)` → returns `{ ok: boolean, errors?: string[] }`
  - Appends ONE line to `.ctoc/streaming/answers.jsonl` in the extended shape from
    Decision 10: `{ ts, ref, questionId, optionKey, topicKey, topicLabel, tier,
    tookRecommended }`.
  - This is the ONLY writer of that log after this slice — `streamAnswer` delegates
    to it, so the line shape has exactly one implementation and cannot drift.
  - Throws: never. A write failure returns `{ ok: false, errors }` and the caller
    surfaces it, exactly as `streamAnswer` already surfaces its own write failure.

- `topicStreak(root, topicKey)` → returns `number`
  - The count of CONSECUTIVE most-recent entries for `topicKey` carrying
    `tookRecommended === true`, scanning the log from the end backwards and stopping
    at the first entry that is not. An entry missing the field stops the scan
    (Decision 10 — unknown resets).
  - Entries after the topic's most recent calibration check-in only: a check-in
    resets the count (Decision 11).
  - Throws: never. An absent or unreadable log returns `0`.

- `checkInDue(root, topicKey)` → returns `boolean`
  - `topicStreak(root, topicKey) >= CALIBRATION_THRESHOLD`.

- `checkInQuestion(topicLabel)` → returns `{ id, prompt, critical, options }`
  - The check-in itself, in the streaming Question contract so it renders through
    exactly the same path as any other question — matrix included, `'Something
    else?'` included.
  - `id`: `'calibration-check-in'`.
  - `prompt`: ``You've taken my recommendation ${CALIBRATION_THRESHOLD} times in a
    row on “${topicLabel}”. Do you think my recommendations are good and that I
    understand this — or do you want more questions on “${topicLabel}”?``
  - The label is the plan TITLE, spelled out. Never a slug, never a code
    (Decision 12).
  - Options, each carrying real `pros` / `cons` so the matrix has content:
    - `{ key: 'trusted', label: 'Your recommendations are good', recommended: false }`
    - `{ key: 'deeper', label: `I want more questions on ${topicLabel}` }`
  - Deliberately NO `recommended: true` on either. The system cannot know which is
    right — that is the entire reason it is asking. Marking one recommended would
    be the system answering its own calibration question.
  - Throws: never.

- `recordCalibration(root, topicKey, topicLabel, verdict)` → returns `{ ok, errors? }`
  - Appends `{ ts, topicKey, topicLabel, verdict }` to
    `.ctoc/streaming/calibration.jsonl`. `verdict` must be `'trusted'` or
    `'deeper'`; anything else is refused with `{ ok: false }` and nothing written.
  - Throws: never.

- `topicVerdict(root, topicKey)` → returns `'trusted' | 'deeper' | null`
  - The most recent recorded verdict for the topic, or `null` when none.
  - Throws: never. An absent or corrupt log returns `null`, which is the neutral
    default — no behaviour change.

##### Dependencies
- `require('./safe-fs')`, `require('path')`
- `require('./decision-matrix')` — for `SOMETHING_ELSE_KEY` / `SOMETHING_ELSE_LABEL`
  in `isRealQuestion`

##### Called By
- `src/lib/streaming-gate.js` → `nextUnansweredQuestion()` (filters unreal
  questions), `richQuestionScreen()` (raises the check-in when due), `streamAnswer()`
  (records the extended line; routes a check-in answer to `recordCalibration`)

##### Data Flow

```
answer recorded
  → recordAnswer(root, {..., tookRecommended, topicKey, topicLabel, tier})
  → next render:
      topicVerdict(root, topicKey)         → how much to ask on this topic
      checkInDue(root, topicKey)           → streak >= 10 since last check-in?
        yes → checkInQuestion(topicLabel)  → rendered like any other question
        no  → next unanswered REAL question, filtered by shouldAskIndividually
```

##### Error Handling
- Every read is fail-soft: an absent, unreadable, or corrupt log yields the neutral
  value (`0`, `null`, `false`) — never a throw and never a spurious check-in.
- A malformed JSONL line is SKIPPED for reads that accumulate, and STOPS the scan
  for `topicStreak` (the conservative direction — Decision 10).
- Writes return `{ ok: false, errors }`; the caller surfaces the failure rather than
  claiming the answer was recorded.

##### Cross-Platform Notes
- `path.join` throughout; `safe-fs` for every read and write; `\n` line endings in
  the JSONL, matching the existing `streamAnswer` writer.

---

#### File: `src/lib/start-screen.js`
**Action:** CREATE
**Purpose:** Render the `/ctoc:start` entry screen in its two shapes.
**Change Type:** new-module

##### Exports

- `waitingQuestionCount(projectPath)` → returns `number`
  - How many plans currently have fresh precomputed questions with at least one
    unanswered question that `isRealQuestion` accepts. Reads the ALREADY-COMPUTED
    store only — never generates, never dispatches, never waits.
  - Implementation: `streamingGate.pendingGateDecisions(projectPath)`, then per
    descriptor `streamingPrecompute.loadPlanQuestions(projectPath, d.ref)`; a `null`
    return (absent, stale, invalid, unknown plan) contributes zero. A plan whose
    only remaining questions fail `isRealQuestion` contributes zero — the count must
    not promise a question the screen would then refuse to ask.
  - Throws: never. Any failure returns `0`, rendering the shape that never blocks.

- `startScreen(projectPath)` → returns `{ text, ask, actions }`
  - **Shape A, count is zero.** `text` carries the heading and a one-line
    orientation. `ask.questions` has exactly ONE question, text
    `'What shall we create today?'`, header `'Start'`, options `'Type what you want'`
    and `'Something else?'`. No answer-questions option — there is nothing to answer.
  - **Shape B, count is one or more.** Same heading plus `N question(s) waiting for
    you.` One question, text `'What shall we create today — or shall we answer the
    questions waiting for you?'`, header `'Start'`, options `'Type what you want'`,
    `'Answer the questions'`, `'Something else?'`.
  - Both shapes route through `decisionMatrix.withSomethingElse`, so the open option
    is present by construction rather than by each branch remembering it.
  - `actions`: `'Type what you want'` → `'stream'`; `'Answer the questions'` → `''`
    (the gate screen is the default no-arguments route); `'Something else?'` →
    `'claude:start-freeform'`.
  - Every action key is a WORD. No digit appears in `actions`.
  - Throws: never.

##### Dependencies
- `require('./streaming-gate')`, `require('./streaming-precompute')`,
  `require('./decision-matrix')`, `require('./question-cadence')`

##### Called By
- `src/commands/menu.js` → `main()`, the no-arguments branch

##### Error Handling
- A throwing dependency: caught, counted as zero, shape A renders. The entry point
  must open even when the store is broken.
- The environment / compliance / stale-plans ride-alongs attach in `menu.js` exactly
  as today; `startScreen` returns a well-formed `ask.questions` array so the
  existing attach helpers keep working unchanged.

---

#### File: `src/lib/streaming-gate.js`
**Action:** MODIFY
**Purpose:** Render the real matrix, add the open option, drop `'Open the plan'`,
and enforce the question cadence.
**Change Type:** modify-existing

##### Changes

- **Import** `decisionMatrix` from `./decision-matrix` and `cadence` from
  `./question-cadence`.
- **Modify** `nextUnansweredQuestion()` (line ~240): skip any question that
  `cadence.isRealQuestion` rejects, and any that `cadence.shouldAskIndividually`
  declines for the topic's current verdict. A topic whose every remaining question
  is skipped returns `null`, which already falls through to the existing simple
  screen — no new branch needed.
- **Modify** `richQuestionScreen()` (line ~546):
  - **Check-in first.** When `cadence.checkInDue(root, d.ref)`, render
    `cadence.checkInQuestion(planTitle)` INSTEAD of the next question. It passes
    through the identical matrix and option path, so the check-in is not a special
    screen — it is a question like any other.
  - Build the matrix from the ORIGINAL question `q` (which still carries `pros` /
    `cons` / `recommended`), not from `parts.question.options` (already flattened).
  - Insert `decisionMatrix.renderMatrix({ ...q, options: decisionMatrix.withSomethingElse(q.options) })`
    into `text` AFTER the header line and BEFORE the prompt (line ~571) — matrix
    first, then the question, per `.ctoc/ask-me-questions.md`.
  - Append `'Something else?'`; map `actions['Something else?'] = \`stream comment ${d.ref}\``.
  - **DELETE** the `'Open the plan'` option, the `if (options.length < 4)` block that
    adds it (lines ~558-560), and `actions['Open the plan']` (line ~563). Decision 7
    — removed unconditionally, not merely when the cap binds.
  - Final option order: the question's own options, then `'Something else?'`, then
    `'Skip for now'`.
- **Modify** `planDecisionScreen()` (line ~604): same matrix insertion and same
  `'Something else?'` on the product-question branch (line ~640) — it calls the same
  `precomputedQuestionParts` and has the identical flattening bug. This screen IS the
  opened plan, so it has no `'Open the plan'` option to remove.
- **Modify** `streamAnswer()` (line ~1015):
  - Delegate the append to `cadence.recordAnswer`, passing the extended fields.
    Derive `tookRecommended` by loading the question from the still-fresh questions
    file and comparing `optionKey` to the recommended option's key; derive `tier`
    from the question; derive `topicLabel` from `planTitle`. Decision 10.
  - When `questionId === 'calibration-check-in'`, route to
    `cadence.recordCalibration` instead, mapping the chosen key to the verdict.
  - Surface a write failure exactly as today — never claim an answer was recorded
    when it was not.
- **Keep** `precomputedOptionDescription()` unchanged and still called. It is correct
  for the `ask` layer, where a one-sentence description is what the harness wants.
  The matrix is an ADDITION to the text layer, not a replacement.

##### Error Handling
- `renderMatrix` returning `''` leaves `text` with the prompt and no matrix.
  Degraded, never broken.
- Every cadence read is fail-soft, so a broken log renders the ordinary question
  rather than a check-in — the conservative direction.
- The existing `try` around `richQuestionScreen` at `gateScreenAt()` line ~831,
  falling back to the simple Approve screen, is preserved.

---

#### File: `src/commands/start.md`
**Action:** CREATE
**Purpose:** The `/ctoc:start` slash command specification.

The full current body of `src/commands/menu.md`, with:

- `description:` → `CTOC — start here. Say what you want built, or answer the questions waiting for you.`
- `effort: low` kept; **NO** `model:` line. A slash command's `model:` switches the
  LIVE session, which is what crashed sessions before.
- The `(no args)` row rewritten to describe the start screen's two shapes.
- A new Rule recording the question-flow contract: the four-column Unicode
  box-drawing matrix renders in the screen text first, then the question; every
  question carries `'Something else?'`; only real questions are asked (Decision 8);
  ONE topic at a time; and the calibration check-in fires after
  `CALIBRATION_THRESHOLD` accepted recommendations on a topic, naming the topic
  spelled out. `.ctoc/ask-me-questions.md` stays the canonical format spec.
- The same Rule records Decision 7: no `'Open the plan'` on the question screen.
- Closing line → `CTOC ships exactly three slash commands: start, push, update.`
- Every `node "${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js"` invocation UNCHANGED
  (Decision 2).

---

#### File: `src/commands/menu.md`
**Action:** DELETE

Content moves to `src/commands/start.md`. Deleting rather than aliasing is
Decision 1.

---

#### File: `src/commands/menu.js`
**Action:** MODIFY

- Header comment (lines 2-4) → `Main entry point for the /ctoc:start command`, plus
  a line noting the filename is deliberately unchanged (Decision 2).
- `main()`, the no-arguments branch (line ~727-728): replace
  `streamingGate.streamingGateScreen(app.projectPath)` with
  `require('../lib/start-screen').startScreen(app.projectPath)`.
- **Keep** the environment / compliance / initialization-note attach calls (lines
  ~729-740) exactly as they are. A brand-new project has no plans at gates, so it
  renders shape A and the first-run environment question still rides along —
  verified by `tests/menu-environment.test.js`.
- **No change** to `route()` in `src/lib/menu-screens.js`.

---

#### Files: documentation and instruction surfaces
**Action:** MODIFY (mechanical rename of the user-visible command name)

| File | Change |
|---|---|
| `src/hooks/SessionStart.js` | Lines 202 and 392: `/ctoc:menu` → `/ctoc:start`. Line 200's dead `writePlanQuestions` instruction is NOT touched — see the upstream gap; it belongs to 00066. |
| `src/hooks/PreToolUse.Edit.js` | Lines 321, 322, 344 — the human-facing block message. |
| `src/hooks/PreToolUse.Bash.js` | Line 352 — the ledger denial reason. |
| `.ctoc/templates/operating-lessons.md` | Line 73: the three-command list becomes `start`, `push`, `update`. |
| `README.md` | Lines 440, 746, 750-752, 767, 773, 788, 841. Keep the phrase `3 slash commands` verbatim — `readme-numbers.test.js` line 257 asserts on it. |
| `CLAUDE.md` | Every occurrence, the Model rules table, the Minimal slash commands statement, and the Project Init Procedure paragraph. |
| `docs/AGENT_ARCHITECTURE.md` | The front-process versus subagent model-rule section. |

---

### Test Plan

#### Tests: `tests/decision-matrix.test.js`
**Action:** CREATE · **Framework:** `node:test`

1. **Real box-drawing characters, never pipes.** Assert the output contains `┌`,
   `┬`, `┐`, `├`, `┼`, `┤`, `└`, `┴`, `┘`, `│`, and `output.includes('|') === false`.
2. **The four columns, spelled in full.** `Option`, `Pros`, `Cons`,
   `Recommendation`; no abbreviated form anywhere.
3. **Vertical alignment.** Every matrix row has `│` at the identical column indices.
4. **Exactly one Recommended cell** when two options are both flagged.
5. **Pros and cons survive.** `pros: 'Fast to build.'` / `cons: 'Harder to change
   later.'` both appear — the direct regression test for the flattening bug.
6. **Singular keys render empty, never fabricated.** `pro` / `con` singular produce
   neither value in the output, and do not throw. Pins Decision 6.
7. **`withSomethingElse` appends** the open option with `key === 'else'`.
8. **`withSomethingElse` is idempotent** — exactly one open option after two calls.
9. **`withSomethingElse(null)`** returns an array of one containing the open option.
10. **Control characters stripped** — `\x1b[31m` in a label never reaches the output.
11. **Malformed input** → `''` from `renderMatrix(null)`, `({})`, `({options:[]})`.

#### Tests: `tests/question-cadence.test.js`
**Action:** CREATE

1. **`isRealQuestion` rejects a one-option question**, including one whose only
   other option is the injected `'Something else?'`. Decision 8.
2. **`isRealQuestion` accepts a genuine two-option question.**
3. **`isRealQuestion(null)`** is `false` and does not throw.
4. **Tier policy — a fork is never silenced by trust.** With verdict `'trusted'`,
   `shouldAskIndividually` still returns `true` for `critical` and for `important`.
   This is the load-bearing assertion of the whole check-in feature.
5. **Tier policy — trust quiets normal questions.** With verdict `'trusted'`, a
   `normal` question WITH a recommended option returns `false`; WITHOUT one, `true`.
6. **Tier policy — `'deeper'` asks more.** A `normal` question with a recommendation
   returns `true`.
7. **`topicStreak` counts consecutive accepted recommendations** — nine `true`
   entries yield 9.
8. **A non-recommended pick resets it** — eight `true`, one `false`, one `true`
   yields 1, not 9.
9. **A legacy line missing `tookRecommended` stops the scan** (Decision 10) — the
   streak counts only entries after it.
10. **The streak is PER TOPIC.** Ten accepted on topic A and zero on topic B: A is
    due for a check-in, B is not. A global counter would fail this.
11. **`checkInDue` fires at exactly `CALIBRATION_THRESHOLD`** — false at 9, true at
    10. Asserted against the exported constant, never a literal.
12. **The check-in resets the streak** — after `recordCalibration`, `topicStreak`
    returns 0 and `checkInDue` is false. Decision 11.
13. **`checkInQuestion` names the topic spelled out.** The prompt contains the given
    title and does NOT contain the plan slug or any `.md` filename. The human's
    standing rule, asserted.
14. **`checkInQuestion` marks NO option recommended.** The system does not answer its
    own calibration question.
15. **`recordCalibration` refuses an invalid verdict** — `{ ok: false }` and nothing
    appended to the file.
16. **`topicVerdict` returns the LATEST verdict** when a topic has two.
17. **Every reader is fail-soft** — absent log, unreadable log, and a corrupt line
    each yield `0` / `null` / `false`, never a throw and never a spurious check-in.
18. **The extended line is backward compatible** — after `recordAnswer`, the
    existing `answeredQuestionIds` reader still finds the answer by `ref` +
    `questionId`.

#### Tests: `tests/start-screen.test.js`
**Action:** CREATE

1. **Shape A — no questions waiting.** `waitingQuestionCount === 0`; question text
   exactly `'What shall we create today?'`; no `'Answer the questions'` option.
2. **Shape B — questions waiting.** Questions written through the real
   `writePlanQuestions` with the plan's current mtime. Count is 1; question text is
   the extended sentence; BOTH `'Type what you want'` and `'Answer the questions'`
   present.
3. **Stale questions do not count** — a `planMtimeMs` older than the plan's current
   mtime yields count 0 and shape A.
4. **Fully answered questions do not count.**
5. **Unreal questions do not count.** A plan whose only question has one option
   yields count 0 — the count never promises a question the screen would refuse.
6. **The open option is always present** in both shapes.
7. **No digit is ever an action key.**
8. **Never throws on a broken store** — a directory with no `plans/` and no `.ctoc/`
   still returns a well-formed screen.
9. **The ride-along contract holds** — `ask.questions` is an array and `actions` a
   plain object, so the `menu.js` attach helpers work unchanged.

#### Tests: `tests/ctoc-start-flow.test.js`
**Action:** CREATE
**Purpose:** The real human flow, end to end, driving the actual entry point as a
real process. This is what Operating Lesson 6 demands — behaviour, not structure.

1. **No questions → the open prompt appears.** Run `node src/commands/menu.js` with
   `cwd` set to a fixture with a plan at a gate and no questions store; parse stdout;
   assert `ask.questions[0].question` is exactly `'What shall we create today?'`.
2. **Questions present → both choices, and answering reaches a REAL precomputed
   question.** Fixture plus a questions file written through `writePlanQuestions`
   with one `critical` question, two options carrying real `pros` / `cons`, one
   `recommended: true`. Then:
   - Both `'Type what you want'` and `'Answer the questions'` are among the labels.
   - Following the answer route renders the EXACT prompt string that was written to
     the store — proving the path reaches the real precomputed question and did not
     regenerate or invent one.
   - `text` contains `┌`, `│`, and both the `pros` and `cons` sentences.
   - `'Something else?'` is among the options.
   - `'Open the plan'` is NOT (Decision 7).
3. **One topic at a time.** `ask.questions` has length exactly 1, and every option
   routes to the same `ref`. Decision 9.
4. **Ten accepted recommendations raise the check-in.** Drive ten real answers
   through the actual `stream answer` route, each taking the recommended option;
   assert the next render's question is the calibration check-in, that its prompt
   contains the plan's TITLE spelled out, and that it contains neither the slug nor
   a `.md` filename.
5. **Answering the check-in resets it** — the following render is an ordinary
   question, not the check-in again.
6. **A critical question still gets asked after `'trusted'`.** Answer the check-in
   `'trusted'`, then assert a remaining `critical` question is STILL presented
   individually. Trust must never swallow a fork.
7. **Zero wait.** The questions store file's mtime is unchanged after a render, and
   nothing was written under `.ctoc/streaming/questions/`. The foreground reads; it
   never generates.
8. **`/ctoc:start` is the only entry spec** — `start.md` exists, `menu.md` does not.
9. **Still exactly three slash commands** — three `.md` files, basenames exactly
   `{ start, push, update }`.
10. **No gate is crossed.** No plan file moved between stage directories; no file
    under `.ctoc/approvals/` created or modified.

#### Tests: `tests/streaming-gate.test.js`
**Action:** MODIFY

- Add: `richQuestionScreen` `text` contains the matrix and both the `pros` and
  `cons` strings of every option.
- Add: options include `'Something else?'`; `actions['Something else?']` is
  `stream comment <ref>`.
- Add: options do NOT include `'Open the plan'` and `actions` has no such key —
  asserted for BOTH a two-option and a four-option question, proving the removal is
  unconditional rather than cap-dependent (Decision 7).
- Add: option order is the question's own options, then `'Something else?'`, then
  `'Skip for now'`.
- Add: `nextUnansweredQuestion` skips a question `isRealQuestion` rejects.
- Add: `streamAnswer` writes the extended line, and a check-in answer routes to
  `recordCalibration` rather than the answers log.
- Add: `planDecisionScreen`'s product-question branch renders the same matrix.
- Update: any existing assertion on the flattened description string, to assert the
  description AND the matrix, rather than being loosened. Any existing assertion
  that `'Open the plan'` is offered on the question screen is DELETED, not
  weakened — it asserts behaviour the human has now removed. Per Operating Lesson 14
  this is the narrow legitimate case: the contract it tested was explicitly replaced.

#### Tests: `tests/readme-numbers.test.js`
**Action:** MODIFY

- Line 22: read `src/commands/start.md`; rename `MENU_MD` → `START_MD` and update
  its uses at lines 359, 367, 379, 386, 392, 412.
- Line 139: assertion stays `=== 3`; title names `start, push, update`.
- Line 257: `assert.match(README, /3 slash commands/)` unchanged.
- Add: assert `src/commands/menu.md` does NOT exist, so a re-added fourth command is
  caught here.
- Line 136: the `src/lib/` module count rises from 100 to **103**
  (`decision-matrix.js`, `question-cadence.js`, `start-screen.js`).

#### Tests: `tests/slash-command-no-model-pin.test.js`
**Action:** MODIFY

- Line 49: read `start.md`; update the assertion message.
- The loop at lines 36-46 is filename-agnostic — `start.md` is checked for a
  `model:` pin automatically, no change needed.

#### Tests: `tests/e2e-menu-lifecycle.test.js`
**Action:** MODIFY

- `/ctoc:menu` → `/ctoc:start`.
- Any assertion that the no-arguments render is the gate screen: it is now the start
  screen, which reaches the gate screen through `'Answer the questions'`.

#### Coverage Targets

- `decision-matrix.js`, `question-cadence.js`, `start-screen.js`: at or above 80
  percent line and branch coverage; every error path exercised.
- Overall: `npm test` holds the floor in `.ctoc/coverage-baseline.json`. The floor is
  a ratchet and is never lowered to make a run pass.

### Security Review

- [x] **Path traversal.** `start-screen.js` constructs no path. `question-cadence.js`
      writes only to two fixed filenames under `.ctoc/streaming/`, joined with
      `path.join` — `topicKey` is used as a JSON FIELD, never as a path segment, so
      an adversarial ref cannot escape.
- [x] **Input validation.** `renderMatrix`, `withSomethingElse`, `isRealQuestion` and
      every cadence reader type-check each field and treat a non-string as absent
      rather than coercing it. `recordCalibration` accepts only the two literal
      verdicts.
- [x] **Terminal injection.** Question text, option labels, pros, cons, descriptions
      and the topic label are subagent- or plan-authored and therefore untrusted.
      Every one passes `stripCtl` before output — including `topicLabel`, which comes
      from a plan's `# ` heading and reaches the check-in prompt.
- [x] **Log injection.** Both JSONL writers serialize with `JSON.stringify`, so an
      embedded newline is escaped and cannot forge a second entry. This matters: a
      forged `tookRecommended: true` line would fabricate evidence of trust.
- [x] **No secrets.** None in any file in this slice.
- [x] **Safe file operations.** The only runtime writes are the two append-only logs
      under `.ctoc/streaming/`, which is whitelisted. Rendering writes nothing. Tests
      write only into temporary directories they create and remove.
- [x] **Error messages.** Failures degrade to shape A, an omitted matrix, or no
      check-in; no stack trace, internal path, or store state reaches the human.
- [x] **Prototype pollution.** `withSomethingElse` builds a new array of object
      literals; parsed JSONL entries are read field-by-field, never merged into an
      existing object.
- [x] **Command injection.** No `exec`, no `execSync`, no shell interpolation.
- [x] **Human gates.** Nothing approves, stamps `approved_by`, writes the approval
      ledger, or moves a plan. The calibration log is NOT approval evidence and is
      never read by any gate. Gates 0-3 untouched; `ctoc-start-flow.test.js` case 10
      asserts it.
- [x] **Tool-capability boundary unchanged.** No agent's `tools:` declaration is
      widened. The lens critics keep `Read, Grep`.

## Implementation Order

1. `src/lib/decision-matrix.js` — no dependencies on other new files
2. `tests/decision-matrix.test.js`
3. `src/lib/question-cadence.js` — depends on step 1
4. `tests/question-cadence.test.js`
5. `src/lib/start-screen.js` — depends on steps 1 and 3
6. `tests/start-screen.test.js`
7. `src/lib/streaming-gate.js` — depends on steps 1 and 3
8. `tests/streaming-gate.test.js`
9. `src/commands/menu.js` — depends on step 5, the live wiring
10. `src/commands/start.md` created, `src/commands/menu.md` deleted
11. `tests/readme-numbers.test.js`, `tests/slash-command-no-model-pin.test.js` — the two hard-break tests
12. `tests/ctoc-start-flow.test.js` — the human-flow test, needs 9 and 10 in place
13. `tests/e2e-menu-lifecycle.test.js`
14. Documentation and hook message surfaces: `src/hooks/SessionStart.js`, `src/hooks/PreToolUse.Edit.js`, `src/hooks/PreToolUse.Bash.js`, `.ctoc/templates/operating-lessons.md`, `README.md`, `CLAUDE.md`, `docs/AGENT_ARCHITECTURE.md`

Test-driven development inverts the write order within each pair — the test is
written and seen failing before its module exists. The list above is DEPENDENCY
order: what must exist before what can reference it.

## Acceptance Criteria Mapping

| Criterion | Implemented In | Test Case |
|---|---|---|
| 1. `/ctoc:start` exists | `src/commands/start.md` | `ctoc-start-flow.test.js` case 8 |
| 2. Still exactly three commands | `src/commands/menu.md` deleted | `ctoc-start-flow.test.js` case 9; `readme-numbers.test.js` line 139 |
| 3. No questions → open prompt only | `start-screen.js:startScreen()` shape A | `start-screen.test.js` case 1; `ctoc-start-flow.test.js` case 1 |
| 4. Questions → both choices | `start-screen.js:startScreen()` shape B | `start-screen.test.js` case 2; `ctoc-start-flow.test.js` case 2 |
| 5. Reaches a real precomputed question | `start-screen.js:waitingQuestionCount()` | `ctoc-start-flow.test.js` case 2 |
| 6. Matrix with the four columns | `decision-matrix.js:renderMatrix()` | `decision-matrix.test.js` cases 1-5; `ctoc-start-flow.test.js` case 2 |
| 7. `'Something else?'` always present | `decision-matrix.js:withSomethingElse()` | `decision-matrix.test.js` cases 7-9; `start-screen.test.js` case 6 |
| 8. No model pin | `src/commands/start.md` frontmatter | `slash-command-no-model-pin.test.js` |
| 9. Numbers open plans only | `start-screen.js` action keys | `start-screen.test.js` case 7 |
| 10. Gates untouched | no approval code path in this slice | `ctoc-start-flow.test.js` case 10 |
| 11. Full gate green | all | Step 14 VERIFY, `npm test` |
| 12. Only real questions | `question-cadence.js:isRealQuestion()`, `shouldAskIndividually()` | `question-cadence.test.js` cases 1-6; `start-screen.test.js` case 5 |
| 13. One topic at a time | `streaming-gate.js:richQuestionScreen()` | `ctoc-start-flow.test.js` case 3 |
| 14. Check-in after ten, topic spelled out | `question-cadence.js:checkInDue()`, `checkInQuestion()` | `question-cadence.test.js` cases 7-14; `ctoc-start-flow.test.js` case 4 |
| 15. Check-in resets and changes depth | `question-cadence.js:recordCalibration()`, `topicVerdict()` | `question-cadence.test.js` cases 12, 16; `ctoc-start-flow.test.js` cases 5-6 |
| Decision 7 — `'Open the plan'` dropped | `streaming-gate.js:richQuestionScreen()` | `streaming-gate.test.js`; `ctoc-start-flow.test.js` case 2 |

## Risk Mitigations

| Risk | Mitigation | Where |
|---|---|---|
| Building this before 00066 ships a start screen whose best path is empty | `depends_on: 00066`; the producer gap recorded in full | Frontmatter; upstream gap section |
| Renaming the command file silently breaks a test that reads it by path | Both path-reading tests named in `files:` and updated in the same slice | `readme-numbers.test.js`, `slash-command-no-model-pin.test.js` |
| A human types `/ctoc:menu` and gets nothing | The name is taught in the same slice by `SessionStart.js` and `README.md` | Decision 1 |
| Box-drawing alignment breaks on wide characters or a narrow terminal | Widths capped, cells wrap, alignment asserted by identical `│` column indices | `decision-matrix.test.js` case 3 |
| Matrix rendered but pros/cons still invisible because the flattening path is used | The matrix is asserted to contain the literal pros and cons sentences | `decision-matrix.test.js` case 5 |
| `'Open the plan'` removed only when the cap binds | Asserted absent on BOTH a two-option and a four-option question | `streaming-gate.test.js` |
| **Trust silences a real fork** — the worst failure this feature could cause | `shouldAskIndividually` returns `true` for `critical`/`important` under EVERY verdict, asserted directly and again end to end | `question-cadence.test.js` case 4; `ctoc-start-flow.test.js` case 6 |
| A global counter lets easy approvals on one topic silence another | The counter is keyed per topic, asserted with two topics | `question-cadence.test.js` case 10 |
| The check-in becomes a nag, firing on every answer past ten | The counter resets after a check-in; asserted | Decision 11; `question-cadence.test.js` case 12 |
| The check-in shows a slug and he cannot decode it | The prompt uses the plan TITLE; asserted to contain the title and NOT the slug or filename | `question-cadence.test.js` case 13 |
| The system answers its own calibration question | `checkInQuestion` marks no option recommended; asserted | `question-cadence.test.js` case 14 |
| Legacy answer lines fabricate a streak that was never observed | A line missing `tookRecommended` STOPS the scan — unknown can only delay a check-in, never fire one | Decision 10; `question-cadence.test.js` case 9 |
| A forged log line fabricates evidence of trust | Both writers use `JSON.stringify`, so an embedded newline cannot forge a second entry | Security review |
| **Two streak mechanisms drift apart** — `recommendedStreak` at 5 in `streaming-flow.js` versus the persisted counter at 10 | Stated explicitly in Decision 12 with why they measure different things; unifying them is deliberately not in this slice, so the duplication is visible rather than discovered later | Decision 12 |
| A producer writes singular `pro` / `con` and the reasoning vanishes silently | Pinned by a test asserting singular keys render empty rather than fabricated | Decision 6 |
| The start screen claims questions when the critique is stale | `loadPlanQuestions` returns `null` for stale; asserted | `start-screen.test.js` case 3 |
| The environment or compliance first-run prompt is lost | The return shape is preserved and the attach helpers unchanged; asserted | `start-screen.test.js` case 9 |

## Execution Plan

### Step 8: TEST
Write `tests/decision-matrix.test.js`, `tests/question-cadence.test.js`,
`tests/start-screen.test.js` and `tests/ctoc-start-flow.test.js` FIRST, and run them
to see them fail for the right reason — module not found, then wrong output. Add the
new assertions to `tests/streaming-gate.test.js`. A test written and run in the same
pass as its implementation is a violation; the red must be observed.

### Step 9: PREPARE
Confirm 00066 has landed, so the store this screen reads is actually being filled.
Re-derive every line number in this plan from disk — they are indicative, never to be
trusted. Confirm the current `src/lib/` top-level module count so the
`readme-numbers.test.js` assertion is raised to the true value. Confirm
`.ctoc/coverage-baseline.json` `minPct`. Confirm `.ctoc/streaming/` is whitelisted by
the enforcement hook, so the two append-only logs are writable at runtime.

### Step 10: IMPLEMENT
- `src/lib/decision-matrix.js` — create
- `src/lib/question-cadence.js` — create
- `src/lib/start-screen.js` — create
- `src/lib/streaming-gate.js` — matrix insertion, open option, `'Open the plan'`
  removal, cadence filtering in `nextUnansweredQuestion`, check-in in
  `richQuestionScreen`, extended write in `streamAnswer`
- `src/commands/menu.js` — the no-arguments branch calls `startScreen`
- `src/commands/start.md` — create; `src/commands/menu.md` — delete
- `src/hooks/SessionStart.js`, `src/hooks/PreToolUse.Edit.js`,
  `src/hooks/PreToolUse.Bash.js` — command name in human-facing text
- `.ctoc/templates/operating-lessons.md`, `README.md`, `CLAUDE.md`,
  `docs/AGENT_ARCHITECTURE.md` — command name
- `tests/readme-numbers.test.js`, `tests/slash-command-no-model-pin.test.js`,
  `tests/e2e-menu-lifecycle.test.js` — updated to the new name

### Step 11: REVIEW
Verify: dependencies flow one way (`decision-matrix` and `question-cadence` are
leaves; `start-screen` and `streaming-gate` sit above; never the reverse); no cycle;
`start-screen` imports nothing from `src/hooks/` or `src/commands/`; `question-cadence`
imports nothing from `streaming-gate` (which imports IT — the direction must not
invert); `CALIBRATION_THRESHOLD` appears exactly once as a declaration and nowhere as
a literal; `precomputedOptionDescription` is extended-around, not rewritten; no test
depends on execution order or another test's temporary directory; no agent's `tools:`
declaration was touched.

### Step 12: OPTIMIZE
Confirm `waitingQuestionCount` reads each plan's questions at most once per render and
that `startScreen` does not call it twice. Confirm the answers log is scanned ONCE per
render, not once per topic — it is append-only and grows without bound, so a per-topic
rescan is a real cost. Confirm `topicStreak` scans from the END backwards and stops at
the first break rather than parsing the whole file. Confirm the matrix is built once
per question, not once per option.

### Step 13: SECURE
Walk the Security Review item by item against the written code. Re-verify that every
subagent- or plan-authored string reaching the terminal passes `stripCtl` —
`topicLabel` especially, since it comes from a plan heading and lands in the check-in
prompt. Re-verify both JSONL writers serialize through `JSON.stringify`, so no
embedded newline can forge a trust entry.

### Step 14: VERIFY
Run the FULL gate: `npm test`. Not `node --test tests/*.test.js`, which bypasses both
the coverage floor and the zero-skipped gate. Required: `# fail 0`, zero skipped, zero
flaky, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.

Then drive it by hand in a real session and confirm with your own eyes: the open
prompt when nothing waits; both choices when something waits; a real matrix with
visible vertical lines; `'Something else?'` on every question; no `'Open the plan'`;
one question on screen at a time; and — the one that needs a real run — take the
recommendation ten times on one topic and watch the check-in appear naming that topic
in words. A green suite is not the measure. A human opening it and getting the right
screen is.

### Step 15: DOCUMENT
Confirm every new function carries a documentation comment with typed parameters,
return type, and the throws contract. Confirm the seven documentation and instruction
surfaces name `/ctoc:start` and that no shipped human-facing text still says
`/ctoc:menu`. Confirm `src/commands/start.md`'s new Rule states the question-flow
contract accurately — only real questions, one topic at a time, the check-in
threshold, and the topic named in words. Confirm this plan's Decisions section matches
what was actually built.

### Step 16: FINAL-REVIEW
Walk the Quality Bar: every acceptance criterion maps to an implementation and a test;
every file has an exact path and a declared action; the dependency graph has no cycle
and no orphan; the test plan covers happy path, error paths and edge cases; the
security checklist has no open item; cross-platform requirements hold; every risk maps
to a concrete mitigation. Confirm the three-command invariant, the no-model-pin
invariant, that a critical question is still asked after a `'trusted'` verdict, and
that no human gate was crossed by this work.

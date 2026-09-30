---
title: "The critique fleet runs only where the human decides what or how to build, and never twice at once"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: none
priority: high
effort: medium
files:
  - src/lib/streaming-precompute.js
  - src/lib/loop-b-driver.js
  - src/lib/streaming-gate.js
  - tests/critique-fleet-decision-points.test.js
  - tests/streaming-precompute.test.js
  - tests/stop-continuation-gate-queue.test.js
  # Ratchet file: a new test file moves a documented count, and the streaming-questions
  # section of CLAUDE.md must state which decisions are critiqued.
  - CLAUDE.md
---

# The critique fleet runs only where the human decides what or how to build, and never twice at once

Read the parent plan first: section 1.4, Part B items 1, 3, 6 and 7, decisions 13, 14 and 18, and criteria 18, 19, 24, 26 and 28. This slice belongs to Part B, which shares no technical dependency with Part A (the parent says so); its only shared files with Part A are listed in the parent index.

## The problem in plain words

"There are too many pre-mortems and way too many devil's advocates being started." By the parent's arithmetic, one open queues between 540 and 600 agent runs today, almost all of them for plans sitting at the finished decision (review), where the human's question is whether the work is done — which the done check answers from recorded evidence, not a critique. And two opens close together can queue the same plan twice. This slice removes review from the fleet's candidates (decision 18) and skips a plan whose critique is already queued, running or waiting in the quarantine (decision 14). Review plans stay exactly what they are today in the list of decisions awaiting the human.

## What the code does today (read on 2026-09-30)

```js
// src/lib/streaming-precompute.js
function plansNeedingQuestions(root) {
  let decisions;
  try {
    const { pendingGateDecisions } = require('./streaming-gate');
    decisions = pendingGateDecisions(root);   // review, implementation, functional
  } catch { return []; }
  if (!Array.isArray(decisions)) return [];
  return decisions.filter((d) => d && !isFresh(root, d.ref));
}
```

```js
// src/lib/loop-b-driver.js — the banner the human sees on /ctoc:start, on the dashboard
// overview tab, and in the session-start context
function crossedLines(root, deps) { /* before/after snapshot around deps.pendingGateDecisions(root) — the result is discarded */ }
function needQuestionLines(root, deps) {
  const needing = deps.plansNeedingQuestions(root);
  // … splits into "Still working out what to ask you about: …" and
  //     "Waiting for your OK — <moment>: …" (isWaitingForOk: toStage 'done', no open fork)
}
```

```js
// src/lib/streaming-gate.js — gateScreenAt, the plain decision screen (no precomputed questions)
text += `Topic: ${humanPlanName(d.title, d.slug)}  ·  ${d.moment}  ·  decision ${index + 1} of ${total}\n`;
text += sufficiencyLine(d);   // for a review plan with no questions file:
// "Enough information: NO — nobody has worked out what this plan still needs to be asked."
```

```js
// src/lib/task-registry.js — exported, never throws for a string root
load(root)       // { tasks: [...], unreadable?: true }
TERMINAL         // Set of terminal statuses
// start.md records one precompute task per ref with touches `.ctoc/streaming/questions/<ref>`
```

Consequences of removing review from the candidates that this slice must carry, found by reading:

- `tests/loop-b-directive.test.js` pins that a large review backlog appears under "Waiting for your OK", and that line is built from `plansNeedingQuestions` today. Removing review would silently empty it. The waiting line must come from `pendingGateDecisions` instead, which keeps listing review plans.
- The plain decision screen tells the human, for a review plan with no questions file, that "nobody has worked out what this plan still needs to be asked" — after this slice nobody ever will, so that line would be permanently misleading at the finished decision. The screen stops showing the enough-information line for a plan whose next move is the finished decision (the parent's note: fixing a screen that treats a missing question file as blocking is inside this plan's purpose).
- `tests/streaming-precompute.test.js` ("returns exactly the pending gate plans that LACK fresh questions") uses `review/stale-q.md` as a candidate, and two cases in `tests/stop-continuation-gate-queue.test.js` use a review plan as "a plan needing questions". Both pin the contract decision 18 replaces.
- `src/hooks/stop-continuation-gate.js` re-injects the session-start dispatch directive on a blocked stop — a third trigger besides session start and the dashboard open. It reads the same list, so it is covered by this change without being edited.

## First, establish (before any code)

Run the real `/ctoc:start` screen code (`streamingGateScreen` and `planDecisionScreen` in `src/lib/streaming-gate.js`) in a scratch project against a review plan with passing verify evidence and no questions file, and record exactly what the human is shown. The expected reading is above; if the screen or the done check treats the missing file as blocking anywhere else, that is fixed in this slice too (declare the file by scope-growth if it is not listed here).

## Files and signatures

### Modify `src/lib/streaming-precompute.js`

```js
// the pre-build rule derived from the ONE gate-edge encoding, as streaming-gate derives it:
// a decision is a critique candidate only when its destination precedes the build phase
const gateOrder = require('./gate-order');

/** Is a critique for this ref already queued, running, or waiting in the quarantine?
 *  Never throws. An unreadable task registry reads as "not in flight" (a candidate is never
 *  hidden because a read failed). Module-private: no export. */
function critiqueInFlight(root, ref) { /* pendingQuestionsPath exists, or a non-terminal
  'precompute' task whose touches include `.ctoc/streaming/questions/<ref>` or
  `.ctoc/streaming/questions/<sanitized ref>.json` */ }

function plansNeedingQuestions(root) {
  // … unchanged read …
  return decisions.filter((d) => d && isPreBuildDecision(d) && !isFresh(root, d.ref)
    && !critiqueInFlight(root, d.ref));
}
```

The module header's description of the dispatcher gains one sentence: only the two pre-build decisions are candidates.

### Modify `src/lib/loop-b-driver.js`

`crossedLines` keeps the list `pendingGateDecisions` returns (it already makes that call for its before/after snapshot) and hands it on. The "Waiting for your OK" line is built from that list's plans whose next move is the finished decision and that carry no open fork; the "Still working out" line is built from `plansNeedingQuestions` as today, still excluding any descriptor that `isWaitingForOk` accepts. A plan appears in at most one line (by `ref`). No additional call to `pendingGateDecisions` is made.

### Modify `src/lib/streaming-gate.js`

In `gateScreenAt`, `sufficiencyLine(d)` is rendered only when `d.toStage` is a pre-build destination (`PRE_BUILD_DESTINATIONS`, already defined in the file). Nothing else on the screen changes: the moment, the options, the refusal handling of a plan that fails validation.

### Modify two existing tests (tightening toward the replaced contract)

- `tests/streaming-precompute.test.js`: the stale candidate becomes `implementation/stale-q.md` (it still proves the staleness rule), and the case gains an assertion that a review plan with no questions file is NOT returned.
- `tests/stop-continuation-gate-queue.test.js`: `planNeedingQuestions` writes its plan under `plans/implementation/` instead of `plans/review/`, and its comment says why (a pre-build plan with no computed questions is never crossed by sufficiency, the same property the review plan was chosen for).

Justification, written into each test at the change: the contract comes from outside the test — decision 18 of the parent plan, approved by the human, removes review from the critique candidates; the test, not the code, is wrong because it asserts the replaced contract; what newly fails is any code that makes a review plan a critique candidate again.

## Tests to write first (each run and seen failing before any code)

In `tests/critique-fleet-decision-points.test.js`, against scratch pipelines and the real `plansNeedingQuestions` → `pendingGateDecisions` read:

1. Criterion 18: 137 plans in `todo` and nothing else → `plansNeedingQuestions` is empty and `questionDispatchDirective` in `src/hooks/SessionStart.js` returns `''`. Green before (todo was never scanned) — a pin, recorded as such.
2. Criterion 19: one plan in each of vision, canvas, functional, implementation, todo, in progress, review and done, none with questions → exactly the functional and implementation plans are returned. Red: review is returned today.
3. Criterion 26: review plans, some failing the done check and some passing → none returned; the loop-b banner still names them under "Waiting for your OK"; the plain decision screen for each still shows its moment and options exactly as today. Red: returned today.
4. Criterion 24: a functional plan with a non-terminal `precompute` task whose touches name its questions file (both touches forms), or with a file waiting in `.ctoc/streaming/questions/pending/` → not returned; the same plan with the task `done` → returned. Red: in-flight is not checked today.
5. Criterion 28: a review plan with passing verify evidence and no questions file → the screen presents the finished decision with its approve option and no enough-information line. Red: the line is shown today. A review plan that still has a questions file from before this change → not a candidate, and its first question is still presented as today.
6. The loop-b banner, with 32 review plans and two implementation plans, shows both lines, bounded exactly as `tests/loop-b-directive.test.js` pins today (that file stays unchanged and green).

## Where the new code is reached from

`plansNeedingQuestions` is called by `src/hooks/SessionStart.js` (session-start directive), by `src/hooks/stop-continuation-gate.js` through that directive, by the `src/commands/start.md` recipe on every dashboard open, and by `loop-b-driver`. `loopBDirective` is rendered by `streamingGateScreen`, by the overview tab and by `SessionStart.js`. `gateScreenAt` renders every `/ctoc:start` decision.

## Acceptance scenarios

- Opening `/ctoc:start` on this repository's pipeline as listed in the parent (138 in review, 11 in implementation, 1 in functional) queues critiques for at most the 12 pre-build plans that need them; the 138 review plans are still offered to the human one at a time, and none of them says it is waiting on a critique.
- A session start followed by a dashboard open, while one plan's critique is still running, queues it once.

## Security review

Nothing here crosses a plan or writes a gate record. `pendingGateDecisions`, and its sufficiency crossing at the pre-build moments, is called exactly as often as before. The in-flight check only reads the task registry and the quarantine directory.

## Out of scope

The content fingerprint (next slice), groups, the cap, and the dispatch texts (later Part B slices). Deleting the fifteen question files that exist today for review plans (parent: out of scope). The on-demand `discuss` and `discuss-all`, unchanged.

## CLAUDE.md

In the streaming-questions section, state that the critique fleet runs only for the two pre-build decisions and never for a plan already queued, running or waiting in the quarantine; update the documented test-file count.

## Decisions Taken Under Ambiguity

1. **Pre-build is derived from `gate-order`, the way `streaming-gate` derives `PRE_BUILD_DESTINATIONS`**, not a second hardcoded list of stage names.
2. **An unreadable task registry reads as "not in flight"**, so a candidate is never hidden by a read failure; the cost is a possible duplicate critique, which is the lesser harm.
3. **Both forms of the task's touches entry are matched**, because the recipe today names the raw ref and the dispatch-text slice standardises it on the questions file's real name.
4. **The enough-information line is dropped only for the finished decision**, where the code's own comment says a sufficiency verdict cannot answer the question being asked.

---
title: "Every trigger dispatches from one critique queue, and names the same four lenses the agents expect"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00411-small-changes-take-a-small-path-s11-group-answer-fan-out
priority: high
effort: medium
files:
  - src/lib/streaming-precompute.js
  - src/hooks/SessionStart.js
  - src/commands/start.md
  - tests/critique-dispatch-texts.test.js
  - tests/session-start-coverage-holes.test.js
  # Ratchet file: a new test file moves a documented count.
  - CLAUDE.md
---

# Every trigger dispatches from one critique queue, and names the same four lenses the agents expect

Read the parent plan first: section 1.4 ("Two triggers, no shared memory"), "Where the disk differs from the brief", item 2, Part B items 4, 5 and 8, decision 15, and criteria 24, 25 and 27.

## The problem in plain words

Three texts tell the session to dispatch the critique fleet: the session-start directive, the dashboard recipe, and (through the directive) the stop hook. They list plans one by one, name three lens critics while the synthesizer and the advocate agent both say they work with four, and only the recipe tells the session to record a task per critique. This slice gives all of them one source — a critique queue computed in code — and makes the texts name the four lenses and the synthesizer, record one task per critique with a fixed touches form, and state how many critiques were held back (only held groups until the cap slice). The unit of the queue is a whole critique; in this slice each critique covers one plan, and the grouping slice widens a critique to a parent's slices.

## What the code does today (read on 2026-09-30)

```js
// src/hooks/SessionStart.js
function questionDispatchDirective(projectPath) {
  const { plansNeedingQuestions } = require('../lib/streaming-precompute');
  needing = plansNeedingQuestions(projectPath);
  // "Before other work, dispatch UP TO 5 CTOC subagents IN THE BACKGROUND …
  //   • producers, per plan stage — product-owner (functional), vision-advisor (vision),
  //     implementation-planner (implementation) …
  //   • the adversarial critics — premortem-critic, devils-advocate-critic, red-team-critic …
  //  Plans needing questions: <refs>"
}
```

```
src/commands/start.md, "Streaming gate questions — background precompute (never-wait)":
  node -e "console.log(JSON.stringify(require('${CLAUDE_PLUGIN_ROOT}/src/lib/streaming-precompute').plansNeedingQuestions(process.cwd()).map(d=>d.ref)))"
  step 2 names premortem-critic, devils-advocate-critic, red-team-critic; the gate-critic
  synthesizes; tasks recorded with `--touches .ctoc/streaming/questions/<ref>`
```

`tests/session-start-question-dispatch.test.js` case 1 pins, in the directive: "up to 5", the three producers, the three critics, `writePlanQuestions`, `streaming-precompute`, the plan reference, and no `claude -p`; case 2 pins an empty directive when nothing is pending. `tests/stop-continuation-gate-queue.test.js` pins the marker "dispatch UP TO 5 CTOC subagents". `tests/session-start-coverage-holes.test.js` stubs `plansNeedingQuestions` to throw and expects an empty directive.

## Files and signatures

### Modify `src/lib/streaming-precompute.js`

```js
/**
 * The critiques to dispatch NOW, as whole units. Never throws: any fault returns
 * { units: [], inFlight: 0, remainder: { critiques: 0, plans: 0, refs: [] }, cap: { value: null, source: 'none' } }.
 * Never crosses anything itself; it reads pendingGateDecisions' result (passed in, or
 * computed once when omitted).
 *
 * @param {string} root
 * @param {Array<object>} [decisions] - pendingGateDecisions(root), when the caller already has it
 * @returns {{ units: Array<{ ref: string, parent: (string|null),
 *                            members: Array<{ ref: string, planMtimeMs: number }> }>,
 *   inFlight: number,
 *   remainder: { critiques: number, plans: number, refs: string[] },
 *   cap: { value: (number|null), source: ('none'|'default'|'setting'|'unreadable') } }}
 */
function critiqueQueue(root, decisions) { /* … */ }
```

In this slice: `units` holds one unit per candidate (the same candidates `plansNeedingQuestions` returns, in the same order: critical first, then furthest along), each with one member and its current modification time; `inFlight` counts pre-build decisions without fresh questions whose critique is already queued, running or waiting in the quarantine; `remainder` is empty; `cap` is `{ value: null, source: 'none' }` because no cap exists yet. `plansNeedingQuestions` and `critiqueQueue` share one module-private candidate filter, so they cannot disagree.

### Modify `src/hooks/SessionStart.js`

`questionDispatchDirective` reads `critiqueQueue` and, when it has units, emits a directive that keeps every token case 1 pins and the marker "dispatch UP TO 5 CTOC subagents", and adds, in plain words:
- the four lens critics — `premortem-critic`, `devils-advocate-critic`, `red-team-critic`, `advocate-critic` — then `gate-critic` to synthesise their findings into one quarantine file per critique;
- one `precompute` task recorded per critique BEFORE any dispatch (`menu task add`, kind `precompute`), with one touches entry per member in the form `.ctoc/streaming/questions/<sanitized ref>.json` — the questions file's real name, which the in-flight check reads;
- each critique's member references and their modification times (the stamp the critics carry);
- when `remainder.critiques` is above zero, "N more critiques (covering M plans) were not started this time", and nothing about it when zero;
- a critique already queued, running or waiting in the quarantine is not listed.

The directive is empty when there are no units and nothing is held back. When there are no units but critiques are held back, it carries no dispatch instruction and states only the held-back count (criterion 25 asks the directive to state the count in every case). Any throw from `critiqueQueue` yields an empty directive, as today.

### Modify `src/commands/start.md`

In "Streaming gate questions — background precompute (never-wait)": the read recipe becomes
`node -e "console.log(JSON.stringify(require('${CLAUDE_PLUGIN_ROOT}/src/lib/streaming-precompute').critiqueQueue(process.cwd())))"`;
the task touches form becomes the one above; step 2 names the four lens critics; the lens briefs and the `gate-critic` brief carry every member reference and stamp of the critique; the text states that a critique with more than one member is written as ONE pending file for the first member (the group block the grouping slice teaches the critic); `remainder.refs` are shown to the human on request; the concurrency wording ("up to 5") is unchanged. The recipe stays read-only, so it remains outside the recipe-execution fence's scope, and it contains no ledger token (so `tests/ledger-forgery-closed.test.js` keeps passing it).

### Modify `tests/session-start-coverage-holes.test.js`

The directive's fault-injection stub moves from `plansNeedingQuestions` to `critiqueQueue`, the reader the directive now requires. Justification written at the change: the contract is this plan's decision that the dispatch unit is the critique queue; the test, not the code, is what must move, because a stub on a function the directive no longer calls would leave the case passing without testing anything (its fixture has no plans, so it would pass vacuously); what newly fails is a throw from `critiqueQueue` leaking a half-directive.

## Tests to write first (each run and seen failing before any code)

In `tests/critique-dispatch-texts.test.js`:

1. Criterion 27: the directive (driven through the real `questionDispatchDirective` over a scratch pipeline with one functional plan), the `src/commands/start.md` precompute section, `agents/iron-loop/gate-critic.md` and `agents/iron-loop/advocate-critic.md` all name the same four lens literals; the directive and the recipe also name `gate-critic`. Red: `advocate-critic` is named by neither text today.
2. The directive lists the critique's member reference with its stamp and the touches form `.ctoc/streaming/questions/<sanitized ref>.json`; every token case 1 of `tests/session-start-question-dispatch.test.js` pins is still present. Red for the new tokens.
3. Criterion 24 end to end: after a precompute task is recorded with the new touches form for a plan, a second `critiqueQueue` call (as by a session start followed by a dashboard open) does not list it, and `inFlight` counts it.
4. `critiqueQueue` with a throwing `pendingGateDecisions` returns the empty shape; the directive is empty.
5. The recipe line in `src/commands/start.md` runs as a child process against a scratch pipeline and prints JSON with `units`, `inFlight`, `remainder` and `cap`.

## Where the new code is reached from

`critiqueQueue` is called by `questionDispatchDirective` (session start, and the stop hook's continue path) and by the `src/commands/start.md` recipe on every dashboard open. `plansNeedingQuestions` keeps its callers.

## Acceptance scenarios

A session start and a dashboard open in quick succession dispatch each critique once, each with four lenses and one synthesizer, and the attestation the synthesizer writes lists all four lenses as expected (the synthesizer's own definition already expects four).

## Security review

The texts are instructions, not fences (parent, Part B item 8); the only fence on launches is the slot limit in `src/hooks/PreToolUse.Task.js`, unchanged. The recipe prints plan references and modification times only.

## Out of scope

Forming groups and the critic's group instruction (next slice); the cap and its setting (the cap slice).

## CLAUDE.md

In the streaming-questions section, name the four lenses plus the synthesizer and the critique queue as the one source every trigger reads. Update the documented test-file count.

## Decisions Taken Under Ambiguity

1. **The directive keeps naming the three stage producers**, because case 1 pins them and removing a trigger's agents is not part of this plan; the critique itself is the four lenses and the synthesizer, as decision 15 requires.
2. **The touches form is the questions file's real name**, so the in-flight check needs one form going forward; the pre-build slice's check keeps accepting the old raw-ref form for tasks already recorded.
3. **`cap` is reported as `none` until the cap slice**, which is literally true in between; the directive says nothing about a remainder of zero.

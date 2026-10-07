---
title: "CTOC keeps working and asks only what matters"
type: implementation
created: 2026-10-06
priority: high
effort: large
depends_on: claude-md-gets-small-and-keeps-every-rule, the-approval-and-check-records-are-write-protected
files:
  # Slice 1 — only weighty questions reach the human, and his answer holds
  - src/lib/streaming-precompute.js
  - tests/question-blocking-default.test.js
  - agents/iron-loop/gate-critic.md
  - agents/planning/product-owner.md
  - agents/planning/implementation-planner.md
  # Slice 2 — plans cross on their evidence and the work keeps moving
  - src/lib/streaming-gate.js
  - src/lib/menu-screens.js
  - src/lib/actions.js
  - src/lib/loop-b-driver.js
  - tests/plans-keep-moving-without-the-human.test.js
  - tests/streaming-gate-coverage-holes.test.js
  # Slice 3 — the instructions and rules say what the code now does; Step 7 stops early
  - src/commands/start.md
  - agents/iron-loop/iron-loop-executor.md
  - agents/iron-loop/iron-loop-critic.md
  - agents/coordinator/cto-chief.md
  - CLAUDE.md
  - .ctoc/templates/operating-lessons.md
  - .ctoc/templates/CLAUDE.md.template
  - docs/OPERATING_LESSONS.md
  - docs/PROJECT_REFERENCE.md
  - docs/IRON_LOOP.md
  - docs/ENFORCEMENT.md
  - tests/fixtures/claude-md-rule-inventory.json
---

# CTOC keeps working and asks only what matters

## What the owner asked

> "i am trying to hide the hooks so the llm thinks and ask usefull questions to the user do
> not bother the user with gates only with questions of high uncertainty or huge importance
> (like tech stack or algorithms)" — and — "optimize the shit out of ctoc" (2026-10-06)

The hooks are deliberately not loaded. Nothing in this plan depends on them.

## Problem statement

Measured in `.ctoc/audit/speed-and-size/benchmarks/WHERE-THE-HOURS-GO.md` and
`pipeline-time.json` (18 August to 6 October 2026):

- In the first six days of October, finished agents sat idle **95.2 hours** waiting to be
  told to continue; 52 of the 58 resumes were build agents. September: 72.8 hours.
- 75 human turns in September took over an hour; 11 did in the first six days of October.
- Per agent type: the build agent 297 runs / 733 hours, the implementation planner
  234 runs / 82 hours, each critique lens about 35 runs / 7 hours, the gate critic 31 runs /
  7 hours, the coordinator 4 runs / 90 hours.

What stops a plan today, verified in the code:

1. **A plan with no stored questions never moves.** `hasEnoughInformation`
   (`src/lib/streaming-precompute.js`) returns `enough: false, reason: 'not-computed'` until a
   question file exists, and since v6.14.93 questions are generated only when the human
   chooses "Generate its questions". The product owner and the implementation planner are
   told to call `writePlanQuestions`, but neither holds a shell tool
   (`tools: Read, Write, Glob, Edit, Grep`), so that order cannot be carried out.
2. **A "strong preference" stops the plan like a real fork.** `isBlockingQuestion` treats every
   question except one marked both not critical and not important as blocking, so a detail the
   critique judged "important" waits for the human exactly like a technology-stack choice.
3. **A built plan never reaches done without the human.** `pendingGateDecisions`
   (`src/lib/streaming-gate.js`) crosses only the two pre-build destinations; review to done is
   always shown to the human, even when `validateReviewToDone` passes (every required step
   checked, fresh passing check record in `.ctoc/state/verify/<slug>.json`).
4. **Nothing starts the next piece of work.** A completion promotes only tasks already queued
   (`computePromote` in `src/lib/menu-screens.js`). A plan sitting in `todo/` has no task until
   a human chooses "start", and a plan that crosses into `implementation/` on its evidence
   gets no planner (`crossBySufficiency` only moves the file).
5. **A human's "Hold" does not hold.** `hasEnoughInformation` counts a question as answered
   whatever option was chosen, so answering the gate ruling with "Hold" lets the plan cross on
   the next render. Harmless while a human approved every crossing; dangerous once crossings
   are automatic.
6. **The Step 7 loop is described as ten rounds and nothing runs rounds.** `refineLoop` in
   `src/lib/iron-loop.js` ignores `maxRounds` and always reports `rounds: 1`; no refinement
   record exists (`.ctoc/loops/` is absent). The records show 4 integrator runs (0.7 hours) in
   October against 22 build runs, and 17 integrator runs (1.9 hours, none in this repository)
   in September. The critic ran 34 times (4.7 hours) in October, shared with Steps 4, 11
   and 16. So the records cannot say how many rounds ran per plan; on average it was fewer
   than one per built plan (inferred). The text promises ten.

## Technical approach

Reuse what exists; add no new crossing mechanism.

**The classification rule — when a question goes to the human.** One function decides it,
`isBlockingQuestion` in `src/lib/streaming-precompute.js`. A question goes to the human when
ANY of these holds, and otherwise is decided by its recommended option and written into the
plan as a decision taken under ambiguity:

| # | Condition (fields the critique already emits, plus one optional field) | Why |
|---|---|---|
| 1 | The question is malformed: not an object, or `critical`/`important` missing or not boolean | unchanged fail-closed rule |
| 2 | `critical === true` (the critique's own test: unusable result, security hole, data loss, irreversible damage, a crossing on a false basis, a failed critique lens) | huge importance |
| 3 | `topic` is one of `technology-stack`, `algorithm`, `data-model`, `security-posture`, `irreversible`, `cost` | huge importance, named by the owner |
| 4 | `important === true` and no `topic` at all | a question written before this change keeps its old meaning |
| 5 | Two or more options and not exactly one marked `recommended: true` | high uncertainty: nobody could say which answer is better |

`topic` is a new optional question field with the closed values above plus `detail`; an
unknown value makes the whole file invalid (refused on write and on read). A new optional
option field `holds: true` marks an answer that means "do not move this plan" (the ruling's
Hold and Reject, "Hold until the lens runs"); a question answered with such an option makes
`hasEnoughInformation` return `enough: false, reason: 'held'`.

**Crossings on evidence, at every gate except the idea itself.** Vision to functional stays
the human's. The two pre-build crossings keep the existing sufficiency crossing
(`crossBySufficiency`, ledger entry `advanced_by: 'sufficiency'` with the existing evidence
string, never `approved_by`); after the move, the questions decided by default are appended
under `## Decisions Taken Under Ambiguity` (that heading is outside the approval hash, see
`approval-ledger.js`, so the approval stays valid). Review to done crosses when
`validateReviewToDone` passes, the plan has a recorded crossing into `todo` in the ledger,
and no question needs the human (no questions stored counts as none); it writes the existing
pipeline-kind entry (`writePipelineEntry`, `advanced_by: 'pipeline'`, accepted at done with
evidence by `approval-residency.js`) whose evidence names the check record file, its time,
its coverage and floor, its skipped count, and says "crossed on evidence, not approved by the
human". Done never deploys: when deployment is enabled it records the existing deploy-ready
notice, exactly as a human approval without the deploy stamp does.

**Questions without an extra dispatch.** The agent that writes a plan also writes its
questions, as its last act, into the existing quarantine
(`.ctoc/streaming/questions/pending/<stage>__<file>.md.json`) with its Write tool; the
existing sweeper validates and promotes it and stamps the plan's own time. The adversarial
four-lens fleet still runs only when the human asks.

**The work keeps moving.** One new function, `continueAfterCrossing(root, extraCrossed)` in
`src/lib/menu-screens.js`, runs on three live paths only — the session's
`menu task complete <id> --continue`, `stream approve`, and `stream answer` — never at menu
open, session start or stop. It sweeps the quarantine, runs the crossing pass, queues an
implementation-planner task for each plan that just moved into `implementation/`, starts
approved buildable plans through the existing `startAgent` (never forced, so the human's stop
is honoured), and returns them in `promote[]`, which the session already launches. The build
agent's own `menu task complete` call keeps no flag, so nothing is claimed in a turn that
cannot launch an agent.

**Step 7.** The loop stops at the first round that raises no finding an earlier round of
this plan had not already raised, and after three rounds at most. Text only; no code runs
rounds.

**Deliberately unchanged:** vision to functional (the human approves the idea); deployment
(a separate per-crossing human act); the adversarial fleet (on request); a plan whose checks
FAILED stays in review for the human — a failure is not a question, and the circuit breaker
already counts it; the evidence-string format of the sufficiency crossing (its tests pin it).

## Slices (dependency-ordered)

| # | Slice | Scope | depends_on |
|---|---|---|---|
| 1 | Only weighty questions reach the human, and his answer holds | the classification, `topic`, `holds`, the three question-writing agents | none |
| 2 | Plans cross on their evidence and the work keeps moving | review to done on evidence, decisions recorded, `continueAfterCrossing`, the three live call sites | 1 |
| 3 | The instructions and rules say what the code now does | menu instructions, executor, Step 7 text, `CLAUDE.md` rules and lessons, docs, rule inventory | 2, and `claude-md-gets-small-and-keeps-every-rule` (it owns `CLAUDE.md` and the inventory today) |

## Slice 1 — specification

### `src/lib/streaming-precompute.js` (MODIFY)

- Constants (not exported): `HIGH_STAKES_TOPICS = ['technology-stack', 'algorithm',
  'data-model', 'security-posture', 'irreversible', 'cost']`; `QUESTION_TOPICS =
  [...HIGH_STAKES_TOPICS, 'detail']`, both frozen.
- `validatePlanQuestions(raw)`: when `question.topic !== undefined` it must be a string in
  `QUESTION_TOPICS` (error names the question id, sanitized, and lists the allowed values);
  when `option.holds !== undefined` it must be boolean. Both fields stay optional.
- `isBlockingQuestion(question) → boolean`: the five conditions above, in that order.
  `options.length === 1` is never uncertain (a notice, e.g. the critique-coverage question).
- `readAnsweredQuestionIds(root, ref, revision)`: also returns `keys: Map<questionId,
  optionKey>` filled beside every `ids.add` (`entry.optionKey`, else `entry.answer` for the
  older log shape; the later line wins); an empty `Map` on every closed path.
- `hasEnoughInformation(root, ref)`: after `answered`, compute `held` = answered questions
  whose chosen option carries `holds: true`; if any, return `{ enough: false, reason:
  'held', blocking: held, … }` before the open-fork check. Document `'held'` in the reason
  list.

### `tests/question-blocking-default.test.js` (MODIFY — the owner replaced the contract)

- Case 6 (`critical:false, important:false` with `opts()`, two options, none recommended,
  asserted non-blocking) encodes the old rule. Its fixture gains `recommended: true` on
  option A — the declared detail it means to test — and a new case asserts the
  no-recommendation shape now BLOCKS. Tightened, not loosened.
- New cases (red on today's code unless marked guard): important + `topic:'detail'` + one
  recommended → not blocking; each of the six high-stakes topics with both flags false →
  blocking; important with no topic → blocking (guard); critical + `detail` → blocking
  (guard); single option, none recommended → not blocking (guard); writer refuses
  `topic:'stack'`, `topic: 7`, `holds:'yes'`; end to end through `writePlanQuestions` +
  `hasEnoughInformation`: three unanswered detail questions → `enough: true`,
  `unanswered.length === 3`; a question answered with its `holds:true` option →
  `reason: 'held'`; the same question answered with the other option → `enough: true`.

### `agents/iron-loop/gate-critic.md` (MODIFY)

- Every finding question carries `topic`, with these definitions (copied into the agent):
  technology-stack — adding, removing or replacing a language, framework, library, database
  or hosted service (a version bump inside one major version is a detail); algorithm — the
  method by which a central result is computed, ranked, matched or scheduled; data-model —
  the shape of stored data, a migration, or a contract other code or people depend on;
  security-posture — who may do what, what is exposed, where trust boundaries sit, how
  secrets are held; irreversible — cannot be undone by a later plan; cost — a recurring cost
  or a large one-off cost; detail — everything else. The gate ruling and the coverage
  question carry no `topic`.
- A finding whose evidence is ambiguous (the existing boundary rule) carries two options and
  NO recommended option: that is how high uncertainty reaches the human. State it as an
  exception to "exactly one recommended".
- Rule 8 becomes: recommend Approve when all three prosecution lenses ran and no surviving
  question goes to the human under the five conditions; an important finding with topic
  `detail` no longer holds the plan — its recommended fix is recorded in the plan when the
  plan moves on.
- The ruling's Hold and Reject options and the "Hold until the <lens> critique runs" option
  carry `holds: true`.
- The pre-emit checklist allows exactly `id, prompt, critical, important, options`, plus
  `topic` on finding questions, and the optional boolean `holds` on options.

### `agents/planning/product-owner.md`, `agents/planning/implementation-planner.md` (MODIFY)

Replace the "Writing questions to the streaming store" section (it orders a function call the
agent has no tool to make) with: as the last act after the plan file's final write, Write
`.ctoc/streaming/questions/pending/<stage>__<file>.md.json` containing
`{ "ref": "<stage>/<file>.md", "questions": [ … ] }` with no `planMtimeMs` (the menu stamps
the plan's own time and refuses the file if the plan changed afterwards). The planner writes
one file per slice. Every choice the agent made of technology stack, algorithm, data model,
security posture, anything irreversible, or anything with a recurring or large cost becomes a
question with that `topic` — never a silent choice; everything else goes into the plan's
`## Decisions Taken Under Ambiguity`. Question shape, `topic` definitions, `holds`, the
no-recommendation rule and "an empty array is the honest 'nothing needs the human'" as in the
gate critic.

## Slice 2 — specification

### `src/lib/streaming-gate.js` (MODIFY)

- `sufficiencyFor(root, ref)` also returns `defaults: Array<{id, prompt, choice}>` taken from
  the SAME verdict: every unanswered question that `isBlockingQuestion` clears, `choice` = the
  recommended option's label (or the only option's label). Every string control-stripped and
  capped at 200 characters.
- `pendingGateDecisions(projectRoot, opts = {})`: when `Array.isArray(opts.crossed)`, every
  successful crossing pushes `{ ref, toStage, name }` (`name` from `humanPlanName`). After a
  successful pre-build crossing with `defaults.length > 0`, call
  `appendDefaultDecisions(newPath, defaults)`. For `stage === 'review'`: when
  `passesValidation`, the plan is not empty, and the verdict is `enough === true` or
  `reason === 'not-computed'`, call `crossOnEvidence(...)`; on success push to `crossed` and
  omit the plan from the list.
- `appendDefaultDecisions(planPath, defaults) → number` (internal): appends at the end of the
  file a `## Decisions Taken Under Ambiguity` block — one sentence ("Decided by the
  recommended option when this plan moved on; none of these needed the human.") then one
  line per question, `- <prompt> — <choice> (question <id>)`; skips an id whose marker is
  already in the file; returns how many it wrote. A write failure returns 0 and is reported
  in the crossing's status line, never thrown.
- `crossOnEvidence(root, planPath, ref, verdict) → boolean` (internal): idempotent (an entry
  already at `done` → false); requires the ledger entry's `stage_to === 'todo'` (the plan was
  admitted to building through a recorded crossing); reads the check record with
  `readVerifyEvidence(root, slug)`; composes the evidence string; `writePipelineEntry(slug,
  { content, stage_from:'review', stage_to:'done', evidence, plan_basename })`; `movePlan` to
  `done`, removing the entry if the move fails (entry and move, or neither); when
  `getDeploymentConfig(root).enabled`, `recordDeployReadyNotice(newPath, root)`. Evidence:
  `evidence: review→done — checks passed, recorded <timestamp> in
  .ctoc/state/verify/<slug>.json (<summary, stripped, capped 200>); coverage <n>% against a
  floor of <n>%, <n> skipped; every required step 8–16 is checked in the plan, including
  REVIEW, SECURE and FINAL-REVIEW (checked by the build itself); questions: <none were
  stored | N stored, none needs the human>; crossed on evidence, not approved by the human`.
  A number that cannot be read renders `unknown`, never `0`.
- `nextUnansweredQuestion(root, ref)`: the first unanswered question that
  `isBlockingQuestion` keeps for the human; only when none exists, the first unanswered one.
  `total` unchanged.
- `sufficiencyLine(d)`: `'held': 'you chose to hold this plan'`.
- `streamApprove(ref, root)`: after a successful approve, call
  `continueAfterCrossing(root, [{ ref: '<to>/<file>', toStage: to, name }])` (lazy require of
  `./menu-screens`) and set `screen.promote` when non-empty, with one status sentence naming
  what started.
- `streamAnswer(...)`: replace the bare `loopBDirective(root)` call with
  `const cont = continueAfterCrossing(root)` then `loopBDirective(root, { crossed:
  cont.crossed })`; set `screen.promote` when non-empty.

### `src/lib/menu-screens.js` (MODIFY)

- `parseTaskArgs`: `case '--continue': out.continue = true; break;`.
- `continueAfterCrossing(root, extraCrossed = []) → { crossed, promote, quarantined }`
  (exported; callers: `taskComplete`, `streamApprove`, `streamAnswer`):
  1. `sweepPendingQuestions(root)`;
  2. `pendingGateDecisions(root, { crossed })`, then append `extraCrossed`;
  3. for each crossed entry with `toStage === 'implementation'` and no active `plan` task for
     its slug (`findActivePlanTask(reg, slug, 'plan')`), queue one via `taskAdd(root,
     ['plan', slug])`;
  4. when `continuation-queue.nextBuildable(root).buildable.length > 0`, call
     `actions.startAgent(root)` up to five times, stopping at the first result without
     `started: true`; collect `{ id, kind:'implement', plan, touches, gitOp }` of each claimed
     task;
  5. `computePromote(taskRegistry.load(root))`, append the claimed tasks not already in it.
  Each step fails soft with a named reason in the result; a failure in step 2 returns the
  plain `computePromote` result.
- `taskComplete(root, rest)`: when `p.continue === true`, replace the final
  `computePromote(settled)` with `continueAfterCrossing(root)` and add to `text`
  "· finished on their checks: <names>", "· moved on: <names>", "· started building:
  <names>" (only the lines that apply; names from `humanPlanName`, capped like
  `loop-b-driver`'s summaries). Without the flag the result is byte-identical to today.

### `src/lib/actions.js` (MODIFY)

Export `recordDeployReadyNotice` (it exists; this adds its second caller).

### `src/lib/loop-b-driver.js` (MODIFY)

`loopBDirective(root, opts = {})`: when `Array.isArray(opts.crossed)`, `crossedLines` names
those plans and does not call `pendingGateDecisions` itself; a crossing into `done` gets its
own line, "Finished on their checks — no question needed you: <names>." Add `review` to the
snapshot stages so the session-start path names done crossings the same way.

### Tests (Step 8, written first, each red on today's code unless marked guard)

`tests/plans-keep-moving-without-the-human.test.js` (CREATE), real functions in a temporary
project, real ledger, real plan files:

1. A functional plan with a stored question set of one `important`/`detail` and one normal
   question → `continueAfterCrossing` moves it to `implementation/`; ledger entry
   `advanced_by: 'sufficiency'`, no `approved_by`; the plan ends with the Decisions block
   naming both recommended labels; a queued `plan` task for it is in `promote`.
2. A `technology-stack` question placed AFTER a detail question → the plan stays;
   `streamingGateScreen` asks the technology question first.
3. Answering it through `route(['stream','answer',ref,qid,<holds option>])` → stays, the
   screen says "you chose to hold this plan"; answering with the other option → crosses, and
   the returned screen carries `promote` with the planner task.
4. An implementation slice valid for the queue, with an empty question file dropped in
   `pending/`, and a finished `plan` task → `route(['menu','task','complete',id,
   '--continue'])` moves the slice to `todo` and on to `in-progress`; `promote` holds an
   implement task whose `touches` equal the slice's `files:`.
5. Same with a stop requested (`stopAgent`) → nothing starts, the slice stays in `todo`.
6. A review plan with every required step checked, a fresh passing check record and a ledger
   entry into `todo` → moves to `done`; entry `advanced_by: 'pipeline'`, evidence contains the
   record path and "not approved by the human", no `approved_by`;
   `approval-residency.classifyResidency` on the done file → `accepted: true`, kind
   `pipeline`.
7. Review plans that must stay: failed record; stale record; no record; no ledger entry into
   `todo`; an open `security-posture` question.
8. A same-named file already in `done/` → the move fails, no ledger entry is left, the plan
   stays.
9. Deployment enabled → a deploy-ready notice is recorded; nothing deploys.
10. Guard: `menu task complete` WITHOUT `--continue` returns exactly today's shape and
    crosses nothing.
11. Idempotent: a second `continueAfterCrossing` crosses nothing again, appends no duplicate
    decision line, queues no second planner task.
12. The executor appending to `## Decisions Taken Under Ambiguity` in the in-progress copy
    leaves its `todo` approval verifying (`classifyResidency` accepted).

`tests/streaming-gate-coverage-holes.test.js` (MODIFY — contract replaced by the owner): the
case "enough information at the LAST moment is shown to the human, never crossed
automatically" builds a review plan with an empty question list and no check record. Keep
the fixture, rename it "an empty question list alone never finishes a plan", and assert the
plan stays because it has no passing check record — stricter about the cause than before.

## Slice 3 — specification

- `src/commands/start.md`: COMPLETION step 1 becomes
  `menu task complete <id> --continue --summary "…"` (the session's call; the build agent's
  own call stays without the flag); step 3 says `promote[]` also carries builds this
  completion started and planner tasks for plans that just moved on; new paragraph: a screen
  from `stream approve` or `stream answer` may carry `promote[]` — launch each the same way,
  without asking; a promoted `plan` task whose plan is in `plans/implementation/` is the
  implementation-planner's (brief: decompose into slices, write each slice's questions to the
  quarantine as the last act); the functional-plan approval exception says the planner
  arrives through `promote[]` and is never dispatched twice. Rewrite "Human gates stay
  foreground", Rule 4 and Rule 13 so they say what the code does — agents never cross a
  gate and never write an approval; the menu's own code moves a plan on recorded evidence
  and records it as evidence; only a question that needs the human stops the plan — keeping
  the phrases `tests/menu-protocol.test.js` holds ("never auto-cross", "waiting for the
  human's OK", `--gate`, `--next`, `promote`, `nextRunnable`, the four transitions, the
  section headings). The "generated only when the human asks" section adds that the agent
  writing a plan drops its questions itself; the four-lens fleet stays on request.
- `agents/iron-loop/iron-loop-executor.md`: box step 5 and the Output example say the built
  work moves to done on its recorded checks unless a question needs the human.
- `agents/iron-loop/iron-loop-critic.md` (the "max rounds (10)" sentence) and
  `agents/coordinator/cto-chief.md` (the Step 7 paragraph and the K-budget table's scope):
  "The loop stops at the first round that raises no finding an earlier round of this plan
  had not already raised, and after three rounds at most. What is still open becomes a
  decision taken under ambiguity, or a question when the classification sends it to the
  human."
- `CLAUDE.md`: Critical Rule 1 — heading "1. Gates (4 points where a plan moves on)";
  vision to functional is the human's; the other three cross when the recorded evidence is
  enough and no question needs him, recorded as evidence, never as his approval; "NEVER
  cross a gate by hand: no agent moves a plan file or writes an approval"; the "move to done"
  sentence refuses a move by hand. Step table row 7 Agent cell: `iron-loop-critic (opus) then
  iron-loop-integrator+iron-loop-critic (until a round adds nothing new, at most three)` (no
  new hyphenated word — `tests/registry-integrity.test.js` parses this column); the three
  "User approves …" phase cells say the plan moves on its evidence. Lesson 2 and the
  methodology line in the managed lessons block (identical in
  `.ctoc/templates/operating-lessons.md`). The "Questions" section names
  `isBlockingQuestion` as the rule. Stays at or under 15,000 bytes.
- `.ctoc/templates/CLAUDE.md.template`: the four "Human Gate N: User approves …" lines say
  which moment the human decides and which move on evidence.
- `docs/PROJECT_REFERENCE.md` row 7; `docs/IRON_LOOP.md` lines 49, 100–102, 185, 277, 482,
  556, 732; `docs/ENFORCEMENT.md` — the streaming-questions heading and one paragraph on
  the review-to-done evidence crossing.
- `tests/fixtures/claude-md-rule-inventory.json` and `docs/OPERATING_LESSONS.md`: every
  inventory-held sentence this slice rewrites (at least r0040, r0041, r0042, r0099, r0117 and
  the streaming-questions heading) gets `new` text and `old_home: docs/OPERATING_LESSONS.md`,
  and its old words go verbatim into `docs/OPERATING_LESSONS.md` under "Replaced on the
  owner's instruction of 2026-10-06" — the test's own mechanism; no rule disappears.

## Acceptance criteria

| # | Criterion | Proven by |
|---|---|---|
| 1 | A question reaches the human only under the five conditions; every other open question is decided by its recommended option | slice 1 cases; slice 2 case 1 |
| 2 | Every decided-by-default question is written into the plan the builder reads, once | slice 2 cases 1, 11 |
| 3 | A plan with a weighty question stays, and that question is asked before any detail | slice 2 case 2 |
| 4 | A human's Hold holds; his other answer moves the plan on | slice 1 held cases; slice 2 case 3 |
| 5 | A built plan with every step checked, a fresh passing record and a recorded build admission reaches done with no human act, recorded as pipeline evidence naming the record, never as his approval | slice 2 cases 6, 7, 8 |
| 6 | After a completion or an answer, the next approved plan starts and a newly moved functional plan gets its planner, with no human act; a requested stop is honoured | slice 2 cases 1, 3, 4, 5 |
| 7 | Nothing moves at menu open, session start or stop; the build agent's own completion changes nothing | slice 2 case 10; existing session-start tests stay green |
| 8 | Done never deploys | slice 2 case 9 |
| 9 | Every instruction surface and `CLAUDE.md` says what the code does; no rule is lost | `tests/claude-md-keeps-every-rule.test.js`, `tests/menu-protocol.test.js`, `tests/registry-integrity.test.js` green |
| 10 | Step 7 text: stop at the first round with no new finding, three at most | Step 16 review of the four files |

## Risks

| Risk | Mitigation |
|---|---|
| Hooks are off, so any agent with Write can write a passing check record or a ledger entry; at done nothing else stands between a forged record and "done" | Done requires a recorded build admission plus a fresh passing record. The owner decided on 2026-10-07 to load only the two write protections — the approval records (`.ctoc/approvals/`) and the check records (`.ctoc/state/verify/`) — while every other hook stays hidden; built by `plans/implementation/the-approval-and-check-records-are-write-protected.md`, on which this plan depends, and whose Risks state what that protection cannot catch |
| The author critiques its own plan when it writes the questions | Every stack, algorithm, data-model, security, irreversible or costly choice must be a question; the four-lens fleet is one click away; the evidence string records "attested by: not recorded" as today |
| Up to 142 plans now in review cross to done on first continuation where their records still pass | The owner's standing instruction of 2026-10-06 ("do not bring him approval questions; cross on the evidence"); every finished plan is named in the status line; a plan can be moved back |
| Queued agent-improvement slices (for example s35 implementation-planner, s37 product-owner) rewrite the same agent files | The scheduler serializes by file; Step 11 checks that whichever lands second keeps the other's text |
| A parent index plan in `implementation/` still sits as a pending decision after its slices move on | Unchanged by this plan; it is noise on the screen, not a stop |
| Coverage floor 99% and the false-green fence | Every new branch has a case above; no empty catch block — each records a named reason |

## Decisions Taken Under Ambiguity

1. **Optional `topic`, legacy reading for its absence.** Making it mandatory would turn every
   stored question file invalid on read and stall every plan; an important question without
   a topic keeps blocking, so absence never waves anything through.
2. **High uncertainty is "no single recommended answer"** — derived from a field the
   critique already emits, so no new self-reported confidence number is trusted.
3. **Done reuses the pipeline-kind ledger entry** that `approval-residency.js` already accepts
   at done with evidence; no new provenance kind, no change to the residency rules.
4. **No stored questions do not block done**; the check record, the checked steps and the
   recorded build admission are the evidence. A stale, invalid or unreadable question file
   still blocks (fail closed).
5. **Continuation only on the session's calls** (`--continue`, `stream approve`,
   `stream answer`); the build agent cannot launch agents, so claiming work in its turn would
   leave tasks running with nobody on them.
6. **Questions are written by the authoring agent through the quarantine** rather than by
   auto-running the four-lens fleet: zero extra dispatches, consistent with "no unasked work",
   and the only write path those agents' tools allow.
7. **Three rounds at most for Step 7**, the critical tier of the coordinator's existing table.
8. **Failed checks still stop** the plan in review; automatic retry is a different mechanism
   and is not part of this plan.
9. **The sufficiency evidence string is unchanged**; the decided-by-default count is derivable
   (unanswered minus blocking) and the plan carries the list.

## Execution Plan

### Step 8: TEST
- [ ] Slice 1: write the new and changed cases in `tests/question-blocking-default.test.js`; run; record which are red.
- [ ] Slice 2: write `tests/plans-keep-moving-without-the-human.test.js` cases 1–12 and the changed case in `tests/streaming-gate-coverage-holes.test.js`; run; record which are red.
- [ ] Slice 3 has no code; its checks are the three existing structural tests named in criterion 9.

### Step 9: PREPARE
- [ ] Confirm `claude-md-gets-small-and-keeps-every-rule` has landed (slice 3 edits its files).
- [ ] Record before-numbers: false-green scan count, dead-export count, unreachable-file count, `CLAUDE.md` bytes.
- [ ] Read `computeSpecHash`'s exclusion list to confirm `## Decisions Taken Under Ambiguity` is excluded.

### Step 10: IMPLEMENT
- [ ] Slice 1 — `src/lib/streaming-precompute.js`, `agents/iron-loop/gate-critic.md`, `agents/planning/product-owner.md`, `agents/planning/implementation-planner.md`, as specified; run slice 1 tests green.
- [ ] Slice 2 — `src/lib/streaming-gate.js`, `src/lib/menu-screens.js`, `src/lib/actions.js`, `src/lib/loop-b-driver.js`, as specified; run slice 2 tests green.
- [ ] Slice 3 — `src/commands/start.md`, the three agent files, `CLAUDE.md`, `.ctoc/templates/operating-lessons.md`, `.ctoc/templates/CLAUDE.md.template`, the four docs, the rule inventory; update the test-file count in `CLAUDE.md` for the new test file.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`: the five conditions match the table exactly; no crossing writes `approved_by`; vision to functional untouched; continuation unreachable from menu open, session start and stop; no instruction surface contradicts the code.

### Step 12: OPTIMIZE
- [ ] One verdict per plan per pass (no second questions read for `defaults`); `startAgent` called only when `nextBuildable` has work.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: question text appended to plans is single-line, control-stripped and capped; the evidence string carries no command text or secrets; `--continue` cannot be reached by the build agent's documented call; the plan reference reaching `taskAdd` passes the existing safe-name check.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] Lint the changed files: zero warnings.
- [ ] False-green, dead-export and unreachable counts not higher than the Step 9 numbers; `CLAUDE.md` at or under 15,000 bytes.
- [ ] An existing test that fails because it asserts the replaced contract (a review plan with a passing record stays pending; a "Hold" crosses) is reported through `src/lib/scope-growth.js`, never edited outside `files:`.

### Step 15: DOCUMENT
- [ ] JSDoc on every changed function; `docs/ENFORCEMENT.md` describes the evidence crossing at done and the classification rule.

### Step 16: FINAL-REVIEW
- [ ] In a scratch project, drive one plan from an approved functional plan to done through the real routes and show the owner, in full: every ledger entry, every status line, and the Decisions block written into the plan.
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria.
- [ ] Rerun `node .ctoc/audit/speed-and-size/benchmarks/pipeline-time.js --from <release date>` after a week of use and compare "sitting finished until resumed" with the 95.2 hours above.

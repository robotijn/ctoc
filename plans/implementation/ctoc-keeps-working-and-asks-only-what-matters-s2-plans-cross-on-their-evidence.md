---
title: "Plans cross on their evidence and the work keeps moving"
type: implementation
created: 2026-10-07
priority: high
effort: large
parent_plan: ctoc-keeps-working-and-asks-only-what-matters
depends_on: ctoc-keeps-working-and-asks-only-what-matters-s1-only-weighty-questions-reach-the-human
files:
  - src/lib/streaming-gate.js
  - src/lib/menu-screens.js
  - src/lib/actions.js
  - src/lib/loop-b-driver.js
  - tests/plans-keep-moving-without-the-human.test.js
  - tests/streaming-gate-coverage-holes.test.js
  # Added on the owner's decisions of 2026-10-07, one reason each:
  # the hold's single source (stable question id, CTOC's three option labels), those labels refused in question files, hold entries never read as answers, the shared goes-to-the-human rule
  - src/lib/streaming-precompute.js
  # the new `classify` task kind the continuation queues for the gate critic
  - src/lib/task-registry.js
  # the session's brief for a promoted `classify` task, which is also the recipe the instruction fence requires for every task kind
  - src/commands/start.md
  # the owner replaced the answer-action contract (quoted id and key); these assert the old unquoted `stream answer` strings
  - tests/streaming-gate.test.js
  - tests/plan-question-screen.test.js
  # same, and its case 20 asserts that an answer which cannot be checked is still recorded; it is now refused
  - tests/answers-bind-to-plan-revision.test.js
  # owner-approved hook change: a background agent may not answer, hold, release, approve or move a plan through the menu
  - src/hooks/protect-records.js
  # the hook change's cases, written first
  - tests/protect-records.test.js
  # the one loaded hook's documentation must say what it now refuses for a background agent, what it allows, and what it cannot catch
  - docs/ENFORCEMENT.md
  # Ratchet, not counted toward the slice size: this slice creates a test file, which
  # moves the test-file count in CLAUDE.md.
  - "CLAUDE.md"
---

# Plans cross on their evidence and the work keeps moving

Slice 2 of 3 of `plans/functional/ctoc-keeps-working-and-asks-only-what-matters.md`. The
specification, tests, criteria, risks and decisions below are copied from that plan. Places
that differ are marked. "Changed from the parent" (Decisions 12–14): the review-to-done
crossing runs only inside `continueAfterCrossing`, the `review` snapshot item for
`loopBDirective` is dropped, and one guard case is added. "Added on the owner's decisions of
2026-10-07" (Decisions 15–34): CTOC itself writes and releases the human's Hold under a
stable question id of its own, the gate critic's classification of an author's questions
starts itself, and the one loaded hook refuses the menu's answering, approving and crossing
routes to background agents. Slices 1 and 2 ship together.

## What the owner asked

> "i am trying to hide the hooks so the llm thinks and ask usefull questions to the user do
> not bother the user with gates only with questions of high uncertainty or huge importance
> (like tech stack or algorithms)" — and — "optimize the shit out of ctoc" (2026-10-06)

Owner decisions of 2026-10-07 (recorded as Decisions 15–17): (a) the independent gate critic
assigns every question topic, and an unclassified question file blocks every question; (b) the
owner's Hold must hold; the write protection also stops background agents from answering or
approving through the menu (answer "a"); and, from the re-review of slice 1, the hold uses a
stable question id of CTOC's own, a hold whose question is gone can still be released, and a
modification time that becomes part of an id is a whole millisecond.

## Problem statement

Measured in `.ctoc/audit/speed-and-size/benchmarks/WHERE-THE-HOURS-GO.md` and
`pipeline-time.json` (18 August to 6 October 2026):

- In the first six days of October, finished agents sat idle **95.2 hours** waiting to be
  told to continue; 52 of the 58 resumes were build agents. September: 72.8 hours.
- 75 human turns in September took over an hour; 11 did in the first six days of October.
- Per agent type: the build agent 297 runs / 733 hours, the implementation planner
  234 runs / 82 hours, each critique lens about 35 runs / 7 hours, the gate critic 31 runs /
  7 hours, the coordinator 4 runs / 90 hours.

What stops a plan today, verified in the code (items 3 and 4 of the parent):

3. **A built plan never reaches done without the human.** `pendingGateDecisions`
   (`src/lib/streaming-gate.js`) crosses only the two pre-build destinations; review to done is
   always shown to the human, even when `validateReviewToDone` passes (every required step
   checked, fresh passing check record in `.ctoc/state/verify/<slug>.json`).
4. **Nothing starts the next piece of work.** A completion promotes only tasks already queued
   (`computePromote` in `src/lib/menu-screens.js`). A plan sitting in `todo/` has no task until
   a human chooses "start", and a plan that crosses into `implementation/` on its evidence
   gets no planner (`crossBySufficiency` only moves the file).

Three more, found after slice 1 was built (worktree branch `agent-a0b33c6c216a2989c`, its
Decisions 12–13 and Execution Record) and in its re-review:

- **The owner's Hold has no writer and no release.** After the security scan, slice 1 reads a
  hold only from the answers log — `holds: true` on the entry for that plan and question id,
  the latest entry with a recorded key winning, across revisions and stage moves — and
  refuses `holds` in any question file. Nothing writes that field: `streamAnswer` records
  `{ts, ref, questionId, optionKey, planMtimeMs}` and accepts any key, no screen offers a
  hold, and the gate ruling's own "Hold …" and "Send … back" options now record ordinary
  answers that let the plan cross. Keyed to an agent's question id, a hold would also outlive
  any way to release it: the ruling's id carries a revision suffix (`q99-gate-ruling-r3`), so
  the next revision's ruling has another id, and a hold on a question that is no longer asked
  could never be answered again.
- **Nothing starts the classification.** Slice 1 lets a question's topic decide only in a file
  that carries the gate critic's classification block; in an author's file every question
  reaches the human. The gate critic knows how to classify (its section "Classifying the
  questions — the topic is yours, never the author's"), but nothing dispatches it, so every
  question an author writes would wait for the human forever.
- **Any background agent can answer for the human.** The one loaded hook
  (`src/hooks/protect-records.js`) treats a call of the menu as the legitimate writer and reads
  command text only; it says itself that it cannot catch "any agent running the menu's own
  routes". A build agent holding a shell can run `stream answer` or `stream approve` and
  answer, hold, release, approve or move a plan.

## Technical approach

Reuse what exists; add no new crossing mechanism.

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

**The work keeps moving.** One new function, `continueAfterCrossing(root, extraCrossed)` in
`src/lib/menu-screens.js`, runs on three live paths only — the session's
`menu task complete <id> --continue`, `stream approve`, and `stream answer` — never at menu
open, session start or stop. It sweeps the quarantine, runs the crossing pass, queues an
implementation-planner task for each plan that just moved into `implementation/`, queues a
gate-critic classification task for each plan whose author's questions are unclassified,
starts approved buildable plans through the existing `startAgent` (never forced, so the
human's stop is honoured), and returns them in `promote[]`, which the session already
launches. The build agent's own `menu task complete` call keeps no flag, so nothing is
claimed in a turn that cannot launch an agent.

**The owner's Hold, written and released by CTOC (added on the owner's decisions of
2026-10-07).** Every question screen carries one fixed option CTOC writes itself: label `Hold
this plan`, reserved key `hold` (a question file may only use keys `1`–`3`). A hold is
recorded under CTOC's own stable question id, `ctoc-hold`, never under the agent's question
id, so it is the same hold across every revision of the plan. A hold is never an answer, and
only the human's explicit release ends it: while a plan is held, its screen asks CTOC's own
question first — "Keep holding this plan" or "Release the hold" — whatever its question file
now contains, so a hold whose original question is gone can still be released.
`streamAnswer` checks every key, refuses anything that is not one of the question's options
or CTOC's own, and records `holds: true` for a hold and `holds: false` for any other answer;
the gate ruling's own Hold and Send-back options hold too. A held plan says so on its screen
and in the session status; no automatic crossing moves it, because each one requires a
verdict that a hold denies.

**Classification starts itself (added on the owner's decision of 2026-10-07).** When
`continueAfterCrossing` finds a still-pending plan whose ready question file has no gate-critic
classification and whose verdict sends questions to the human, it queues one `classify` task
for that plan (once per question revision) and returns it in `promote[]`. The session launches
the gate critic alone with a classification brief; the critic writes the classified file to
the waiting folder, and the existing sweeper replaces the unclassified file on the next
continuation. If the task cannot be queued, or the critic writes nothing valid, the
unclassified file stays and every question keeps reaching the human — never decided
automatically.

**Background agents cannot answer for the human (owner-approved hook change, 2026-10-07).**
Claude Code's `PreToolUse` input carries `agent_id` and `agent_type` only when a subagent
makes the call, and never for the main session (verified by the coordinator in the hooks
documentation and in the installed Claude Code 2.1.291). When the payload carries a non-empty
`agent_id`, `protect-records.js` lets a menu call through only if its route is on a fixed
list of routes that write no answer, no approval and move no plan across a gate; everything
else on the menu is refused with one plain sentence on stderr and exit 2. The main session
is unchanged.

**Deliberately unchanged:** vision to functional (the human approves the idea); deployment
(a separate per-crossing human act); the adversarial fleet (on request); a plan whose checks
FAILED stays in review for the human — a failure is not a question, and the circuit breaker
already counts it; the evidence-string format of the sufficiency crossing (its tests pin it);
every hook decision for a call without an `agent_id`.

## Specification

### `src/lib/streaming-precompute.js` (MODIFY — added on the owner's decisions of 2026-10-07)

- `HOLD`, exported and frozen — the one source of the hold:
  `{ questionId: 'ctoc-hold', hold: { key: 'hold', label: 'Hold this plan', description:
  'Keep this plan where it is. Nothing moves it until you release the hold.' }, keep: { key:
  'hold', label: 'Keep holding this plan', description: 'Nothing moves it.' }, release: { key:
  'release', label: 'Release the hold', description: 'It can move on again: the questions
  that need you are asked again, and the others are decided by their recommended option.' }
  }`. `ctoc-hold` cannot collide with an agent's question id (slice 1 requires
  `q<NN>-<kebab>`), and `hold` and `release` cannot collide with an agent's keys (`1`–`3`).
- `validatePlanQuestions`: an option whose label, by the existing `labelIdentity` (control
  characters stripped, trimmed, lower-cased), equals the identity of any of CTOC's three
  labels is refused with `${owhere}.label is one of CTOC's own hold options`. Refused on write
  and on read, like every other violation.
- `readAnsweredQuestionIds`: an entry whose `questionId` is `HOLD.questionId` sets the hold
  state exactly as today and is then skipped — it never enters `ids` or `keys` and is never
  counted in `unbound`, in both binding modes (with and without `revision.questions`). Its
  hold state is matched by the plan's file name, across revisions and stages, as slice 1
  built it; because the id never changes, a release recorded against any later revision ends
  a hold recorded against an earlier one.
- `goesToHuman(question, classified) → boolean`, exported: `!classified ||
  isBlockingQuestion(question)`. `hasEnoughInformation` computes `blocking` with it (replacing
  the inline expression at its `blocking` line); `streaming-gate.nextUnansweredQuestion` uses
  the same function.

### `src/lib/task-registry.js` (MODIFY — added on the owner's decision of 2026-10-07)

`KINDS` gains `'classify'`, with a docblock sentence: the gate critic's classification of one
plan's question file; queued only by `menu-screens.continueAfterCrossing`, once per question
revision; it writes only the waiting folder `.ctoc/streaming/questions/pending/`, never a plan
file, so completion never runs plan completion for it (that is gated on `implement`).

### `src/lib/streaming-gate.js` (MODIFY)

- `sufficiencyFor(root, ref)` also returns `defaults: Array<{id, prompt, choice}>` taken from
  the SAME verdict: every unanswered question that is not in the verdict's `blocking` set
  (so a file the gate critic did not classify yields none), `choice` = the recommended
  option's label (or the only option's label). Every string control-stripped and capped at
  200 characters. *(Reconciled with slice 1's classification rule, Decision 26.)*
- `pendingGateDecisions(projectRoot, opts = {})`: when `Array.isArray(opts.crossed)`, every
  successful crossing pushes `{ ref, toStage, name }` (`name` from `humanPlanName`). After a
  successful pre-build crossing with `defaults.length > 0`, call
  `appendDefaultDecisions(newPath, defaults)`. For `stage === 'review'`: when
  `passesValidation`, the plan is not empty, and the verdict is `enough === true` or
  `reason === 'not-computed'`, call `crossOnEvidence(...)`; on success push to `crossed` and
  omit the plan from the list.
  - **Changed from the parent (Decision 12):** the `review` branch runs only when
    `Array.isArray(opts.crossed)`, which is true only on the call `continueAfterCrossing`
    makes. Without `opts.crossed` (the default screen, the on-open banner, `loopBDirective`
    at session start) a review plan is listed for the human exactly as today.
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
  A number that cannot be read renders `unknown`, never `0`. A held plan never reaches this
  call: its verdict is `enough: false, reason: 'held'`.
- `holdQuestion()` (internal) → `{ id: HOLD.questionId, prompt: 'You are holding this plan.
  Keep holding it, or release the hold so it can move on?', critical: true, important: false,
  options: [HOLD.keep, HOLD.release] }` — CTOC's own question; neither option is recommended
  (an owner decision gets symmetric options).
- `nextUnansweredQuestion(root, ref) → { question, index, total, held } | null`: the one
  status read and one answers read it makes today, now passing `questions: st.questions` in
  the revision so only real option keys bind. When `answered.held.length > 0` it returns `{
  question: holdQuestion(), index: 0, total: 1, held: true }` — whatever the plan's question
  file now holds. Otherwise it picks the first unanswered question for which `goesToHuman(q,
  st.classified)`, else the first unanswered one (`held: false`). `total` unchanged.
  *(Changed on the owner's decisions of 2026-10-07, Decision 26: the earlier text used
  `isBlockingQuestion` alone, which in an unclassified file would ask a detail before a
  weightier question.)*
- `precomputedQuestionParts(q, ref, header)`: every answer action becomes
  `stream answer ${ref} ${quoteArg(q.id)} ${quoteArg(e.key)}`. For any question but CTOC's
  own, after its options it appends `HOLD.hold` (CTOC's label and description, never anything
  from the question file) with action `stream answer ${ref} ${quoteArg(q.id)}
  ${quoteArg(HOLD.hold.key)}`, set after the question's own actions. `quoteArg(s)` (internal)
  returns `'` + `String(s).replace(/'/g, "'\\''")` + `'`. Both question screens
  (`richQuestionScreen`, `planDecisionScreen`) get this through the one helper.
- `richQuestionScreen`: asked options are the question's options, then `Hold this plan` (not
  on CTOC's own question), then `Skip for now` and `Open the plan` while fewer than four; the
  `Skip for now`, `Open the plan` and `Other` actions stay in `actions` whatever is asked.
- `sufficiencyLine(d)` `'held'`: "you are holding this plan; choose Release the hold on it to
  let it move on". *(Replaces the earlier `'held': 'you chose to hold this plan'`.)*
- `streamApprove(ref, root)`: after a successful approve, call
  `continueAfterCrossing(root, [{ ref: '<to>/<file>', toStage: to, name }])` (lazy require of
  `./menu-screens`) and set `screen.promote` when non-empty, with one status sentence naming
  what started.
- `streamAnswer(ref, questionId, optionKey, root)` *(extended on the owner's decisions of
  2026-10-07)*:
  1. As today: an invalid ref is ignored; an id or key empty after control-stripping is
     "Ignored an incomplete answer".
  2. **CTOC's own question** (`qid === HOLD.questionId`): the key must be `HOLD.keep.key` or
     `HOLD.release.key`, otherwise nothing is recorded ("Nothing was recorded for <file>:
     that is not one of the question's answers."). Record `{ ts, ref, questionId:
     HOLD.questionId, optionKey: key, holds: key === HOLD.keep.key }`. It does not need the
     plan's question file, so it works whatever state that file is in.
  3. **Any other question:** `st = planQuestionsStatus(root, ref)` (lazy require). When
     `st.status !== 'ready'`, or the require throws: record nothing; status "Nothing was
     recorded for <file>: its questions could not be read (<reason, stripped>), so your answer
     cannot be checked. The question will be asked again." `q =
     st.questions.find((x) => x.id === qid)`; none → record nothing ("… it does not ask that
     question now."). The key is valid when it is `HOLD.hold.key` or one of `q.options[].key`;
     otherwise record nothing ("… that is not one of the question's answers.").
  4. `holds = key === HOLD.hold.key || (isGateRuling(qid) && !chosen.label.startsWith('Approve '))`,
     where `chosen` is the option with that key and `isGateRuling(id)` (internal) is
     `id === 'q99-gate-ruling' || /^q99-gate-ruling-r[0-9]+$/.test(id)`. A hold records `{ ts,
     ref, questionId: HOLD.questionId, optionKey: HOLD.hold.key, holds: true, heldOn: qid }`
     and no answer for `qid`; anything else records `{ ts, ref, questionId: qid, optionKey:
     key, holds: false, planMtimeMs: st.questionsRevisionMs }`.
  5. A write failure is reported in the status, never thrown. Status: a hold → "You are
     holding <file>. Nothing moves it until you release the hold."; a release → "Released the
     hold on <file>."; otherwise "Recorded your answer for <file>."
  6. Replace the bare `loopBDirective(root)` call with `const cont =
     continueAfterCrossing(root)` then `loopBDirective(root, { crossed: cont.crossed,
     pending: cont.pending })`. The screen is `advanceAfter(ref, root, status)` for a hold or
     a keep (moves past the plan just held) and `streamingGateScreen(root, status, { banner:
     false })` otherwise; the directive is appended to its text; set `screen.promote` when
     non-empty. A refused answer returns `streamingGateScreen(root, status)` and runs no
     continuation.

### `src/lib/menu-screens.js` (MODIFY)

- `parseTaskArgs`: `case '--continue': out.continue = true; break;`.
- `continueAfterCrossing(root, extraCrossed = []) → { crossed, promote, quarantined, pending }`
  (exported; callers: `taskComplete`, `streamApprove`, `streamAnswer`):
  1. `sweepPendingQuestions(root)`;
  2. `pending = pendingGateDecisions(root, { crossed })`, then append `extraCrossed` to
     `crossed`;
  3. for each crossed entry with `toStage === 'implementation'` and no active `plan` task for
     its slug (`findActivePlanTask(reg, slug, 'plan')`), queue one via `taskAdd(root,
     ['plan', slug])`;
  4. *(added on the owner's decision of 2026-10-07)* for each `d` in `pending` with
     `d.sufficiencyReason === 'open-forks'`: `st = planQuestionsStatus(root, d.ref)`; with
     `label = 'revision-' + Math.floor(st.questionsRevisionMs)` (a whole millisecond:
     fractional modification times exist, for example 1784271999196.2705), when `st.status
     === 'ready'`, `st.classified === false`, `st.questions.length > 0`, and the registry
     holds no task (any status) with `kind === 'classify'`, `plan === d.ref` and that
     `label`, queue one via `taskAdd(root, ['classify', d.ref, '--touches',
     '.ctoc/streaming/questions/' + d.ref, '--label', label])`. A throw adds the named reason
     `classify-not-queued`, and the plan's questions stay as they are (all with the human);
  5. when `continuation-queue.nextBuildable(root).buildable.length > 0`, call
     `actions.startAgent(root)` up to five times, stopping at the first result without
     `started: true`; collect `{ id, kind:'implement', plan, touches, gitOp }` of each claimed
     task;
  6. `computePromote(taskRegistry.load(root))`, append the claimed tasks not already in it.
  Each step fails soft with a named reason in the result; a failure in step 2 returns the
  plain `computePromote` result with `pending: []`.
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
own line, "Finished on their checks — no question needed you: <names>."

- **Changed from the parent (Decision 13):** the parent's last sentence here, "Add `review`
  to the snapshot stages so the session-start path names done crossings the same way", is
  dropped. Under Decision 12 the session-start path cannot cross a plan to done, so that
  snapshot would never name anything.
- *(Added on the owner's decision of 2026-10-07.)* One more line, after the crossed lines:
  "You are holding: <names>. Each stays where it is until you choose Release the hold on it in
  /ctoc:start." — the plans whose `sufficiencyReason === 'held'`, named with `humanPlanName`
  and capped by `summarize`. Its list is the pending list the directive already has: the
  return value of the `pendingGateDecisions` call `crossedLines` makes today (kept instead of
  discarded), or `opts.pending` when `opts.crossed` is given (no `opts.pending` → no held
  line). A held plan is named in no other line.

### `src/commands/start.md` (MODIFY — added on the owner's decision of 2026-10-07)

One paragraph in "Streaming gate questions — generated only when the human asks", after the
gate-critique precompute: **A promoted `classify` task is the gate critic's classification of
one plan's questions.** The menu records it itself, once per question set, when a plan's
questions came from its author and some of them go to the human — the same record as
`menu task add classify '{ref}' --touches '.ctoc/streaming/questions/{ref}'`, which you never
add yourself. Launch `gate-critic` alone as background WORK, then `menu task start <id>`; its
brief: the task id, the plan path, and "classify the questions of `{ref}`" (its section
"Classifying the questions"); never the three lens critics. It writes the classified file to
the waiting folder; the next continuation sweeps it in. If it fails, every question of that
plan keeps reaching the human. No other text in the file changes in this slice.

### `src/hooks/protect-records.js` (MODIFY — owner-approved hook change, 2026-10-07)

- `isSubagent(payload)` (internal): `typeof payload.agent_id === 'string' &&
  payload.agent_id.trim() !== ''`. Nothing changes for any call without it.
- `menuRouteArgs(args)` (internal): the arguments after the menu script with
  `--live-agent-ids` and its value removed; a single remaining argument is split on
  whitespace — the same reading `start.js` applies (`extractLiveAgentIds`, `splitCliArgs`).
- `subagentMayRunRoute(routeArgs) → boolean` (internal): true only for the routes in the
  "allowed" table below; every other route, including one added to the router later, is
  refused for a background agent (fail closed).
- `bashRefuses(command, cwdRel, base, bash, subagent)`: a pure menu call is refused when
  `menuArgsNameRecords(...)` (as today) or `subagent && !subagentMayRunRoute(menuRouteArgs(args))`.
  For any other command, when `subagent`, also refuse: a command segment (split as
  `runsBackfillBeyondVision` splits) that runs a JavaScript runtime (`JS_RUNTIME_RE`) with a
  script argument ending in `start.js` and whose following tokens (quotes removed) form a
  route `subagentMayRunRoute` does not allow; and an inline script (`isInlineEval`) naming
  `menu-screens`, `streaming-gate`, `continueAfterCrossing` or `approveSubplans`.
- A refusal for this reason writes one sentence to stderr and exits 2 through the existing
  `refuse`: "CTOC refused this call because a background agent may not answer CTOC's
  questions, approve a plan or move one on through the menu; report your result and let the
  main session do it."
- Fail rule: when the payload parsed, carries a non-empty `agent_id`, and its `tool_input`
  text mentions `start.js`, `menu-screens` or `streaming-gate`, a crash refuses with the
  existing "protection failed to run" sentence; every other crash behaves as today.
- The module header's "WHAT IT REFUSES" and "WHAT IT CANNOT CATCH" gain the subagent rule and
  its limits.

The routes, enumerated from `src/commands/start.js` (`main`: no arguments → the default
screen; otherwise `menu-screens.route`) as they stand once this slice is built:

| Refused when the call carries an `agent_id` | Why |
|---|---|
| No arguments, or only `--live-agent-ids <ids>` | the default screen (`streamingGateScreen`) runs `pendingGateDecisions`, which crosses pre-build plans on sufficiency: a sufficiency entry in `.ctoc/approvals/` and a move across the functional-to-implementation or implementation-to-todo gate |
| `stream approve <ref>` | `approvePlan`: an approval record and a gate crossing, then the continuation |
| `stream answer <ref> <id> <key>` | writes the answers log (answers, holds, releases), then the continuation, which crosses plans (including review to done) |
| `stream skip <ref>` | re-renders through `advanceAfter` → `pendingGateDecisions` (sufficiency crossings) |
| `stream comment <ref> <text>` | writes `.ctoc/streaming/comments.jsonl`, then the same re-render |
| `stream` with no or an unknown sub-command | the default screen |
| `plan` with no reference | the default screen |
| `menu task complete <id> … --continue` | the continuation: crossings, planner and classification tasks, builds started |
| any route not in the allowed table | fail closed |

| Allowed for a background agent | Why |
|---|---|
| `menu task complete <id> [--summary …] [--gate N] [--next <route>] [--b64 …]` without `--continue` | the build agent's documented completion (`agents/iron-loop/iron-loop-executor.md`): moves the plan from in-progress to review and writes its check record; no approval, no answer, no human gate |
| `menu task add …`, `menu task start …`, `menu task fail …`, `menu task cancel …`, `menu task list`, `menu task board` | the task registry only |
| `menu`, `menu commands`, `dashboard` | the pipeline dashboard: task reconcile and orphan recovery (in-progress back to todo, not a human gate) |
| `tasks`, `task <id>` | read-only task screens |
| `browse <stage>`, `section <name>`, `stubs <slug>`, `validate <stage>/<file>` | read-only screens |
| `inbox questions`, `decisions`, `gates`, `escalations`, `migration`, `verify`, `stale`, `cleanup …` | read-only screens; executing a cleanup is a separate session recipe, not a menu route |
| `plan <stage>/<file>` | the plan screen: it sweeps the waiting folder (validated promotion into the live question store, the same sweep every render does) and moves nothing |

### `docs/ENFORCEMENT.md` (MODIFY — owner-approved hook change, 2026-10-07)

In "The one loaded hook — write protection for the records": one paragraph and the two tables
above — for a call that carries an `agent_id`, the menu runs only the allowed routes; the
refusal sentence; the main session is unchanged; what it cannot catch (a script file written
and then run, a path built at run time, a tool other than the five matched, and the main
session itself, which is trusted to run only answers the human gave).

## Test plan (Step 8, written first, each red on today's code unless marked guard)

"Today's code" is the worktree branch with slice 1 built.

`tests/plans-keep-moving-without-the-human.test.js` (CREATE), real functions in a temporary
project, real ledger, real task registry, real plan files:

1. A functional plan with a gate-critic-classified question set (sixth argument of
   `writePlanQuestions`) of one `important` question with topic `detail` and one plain
   `detail` question, each with one recommended option → `continueAfterCrossing` moves it to
   `implementation/`; ledger entry `advanced_by: 'sufficiency'`, no `approved_by`; the plan
   ends with the Decisions block naming both recommended labels; a queued `plan` task for it
   is in `promote`.
2. A classified file with a `technology-stack` question placed AFTER a detail question → the
   plan stays; `streamingGateScreen` asks the technology question first.
3. Holding it through `route(['stream','answer',ref,qid,'hold'])` → stays, the status says
   "You are holding"; releasing it (`route(['stream','answer',ref,'ctoc-hold','release'])`)
   and answering the question with an option key → crosses, and the returned screen carries
   `promote` with the planner task.
4. An implementation slice valid for the queue, with an empty question file dropped in
   `pending/`, and a finished `plan` task → `route(['menu','task','complete',id,
   '--continue'])` moves the slice to `todo` and on to `in-progress`; `promote` holds an
   implement task whose `touches` equal the slice's `files:`; no `classify` task is queued
   (nothing to classify).
5. Same with a stop requested (`stopAgent`) → nothing starts, the slice stays in `todo`.
6. A review plan with every required step checked, a fresh passing check record and a ledger
   entry into `todo` → moves to `done`; entry `advanced_by: 'pipeline'`, evidence contains the
   record path and "not approved by the human", no `approved_by`;
   `approval-residency.classifyResidency` on the done file → `accepted: true`, kind
   `pipeline`. (Driven through `continueAfterCrossing(root)`, per Decision 12.)
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
13. Guard, **added (Decision 14):** with the review plan of case 6 in place, rendering the
    default screen (`streamingGateScreen(root)`) and calling `loopBDirective(root)` leave it in
    `review/` with no new ledger entry.

Added on the owner's decisions of 2026-10-07:

14. The hold option and quoting. A functional plan with a two-option fork → the default
    screen asks `Postgres`, `SQLite`, `Hold this plan`, `Skip for now`; `actions['Postgres']
    === "stream answer functional/x.md 'q10-db' '1'"`; `actions['Hold this plan'] ===
    "stream answer functional/x.md 'q10-db' 'hold'"`; the hold option's description is
    `HOLD.hold.description`. A three-option question → the asked options are exactly its
    three plus `Hold this plan`; `actions['Skip for now']` and `actions['Open the plan']` are
    still present. `route(['plan', ref])` (`planDecisionScreen`) also offers `Hold this plan`
    with the same action.
15. `writePlanQuestions` refuses a file with an option labelled `hold this plan`, `  Hold
    This Plan  `, `Hold this plan` followed by a control character, `Release the hold` or
    `Keep holding this plan`; the error names CTOC's own options. `planQuestionsStatus` reads
    such a stored file as `invalid`.
16. `route(['stream','answer',ref,'q10-db','hold'])` → exactly one new log entry `{
    questionId:'ctoc-hold', optionKey:'hold', holds:true, heldOn:'q10-db' }` and none for
    `q10-db`; the plan stays; `hasEnoughInformation` → `reason: 'held'`, `blocking` ids
    `['ctoc-hold']`; the returned screen shows the NEXT pending plan, not the held one, and its
    text carries "You are holding".
17. Release and keep. After case 16, `route(['stream','answer',ref,'ctoc-hold','hold'])`
    ("Keep holding") → entry `holds: true`, the plan stays held;
    `route(['stream','answer',ref,'ctoc-hold','release'])` → entry `holds: false`, the
    plan's screen asks `q10-db` again; answering it with `'1'` → the entry has `holds:
    false`, the plan crosses (classified file, pre-build), and the screen carries `promote`
    with its planner task.
18. Refusals, each leaving `answers.jsonl` unchanged and the status starting "Nothing was
    recorded": key `'4'`; key `'x'`; key `'release'` on an agent's question; key `'1'` on
    `ctoc-hold`; key `"'1'"` and id `"'q10-db'"` (still quoted); an id the current set does
    not contain; a plan with no questions file; a stale questions file; the precompute module
    failing to load (stubbed require). After a hold, none of these refused calls releases it
    (`reason` stays `'held'`).
19. The gate ruling. A classified file whose last question is a HOLD ruling (`q99-gate-ruling`,
    key `1` "Hold until the red-team critique runs", key `2` "Approve x across …"): answering
    key `1` records a hold (`questionId:'ctoc-hold'`, `heldOn:'q99-gate-ruling'`) and no answer
    for the ruling, and the plan stays; after a release the ruling is asked again; answering
    key `2` records `holds: false` and the plan crosses. An APPROVE ruling answered with key
    `2` ("Hold — I want another look first") holds; a REJECT ruling answered with key `1`
    ("Send x back for rework") holds.
20. The held screen and the release path for a question that is gone. A held plan → the
    default screen and `route(['plan', ref])` ask CTOC's question ("You are holding this
    plan…") with the options "Keep holding this plan" and "Release the hold", neither
    recommended, and no "Hold this plan" option. The plan is then edited and its questions
    regenerated (new revision; the question it was held on is gone and the ruling's id is now
    `q99-gate-ruling-r3`) → still held, the same CTOC question is asked, and choosing "Release
    the hold" releases it: the new revision's questions are asked.
21. Guard for the new crossings: a held functional plan whose classified file is otherwise
    enough, and a held review plan (classified question file, every step checked, fresh passing
    record, ledger entry into `todo`) → `continueAfterCrossing(root)` moves neither and writes
    no ledger entry; `startAgent` is not called for them. (Red today only because
    `continueAfterCrossing` does not exist yet.)
22. Session status: with one held plan and one plan waiting for its questions,
    `loopBDirective(root)` has a line "You are holding: <its name>." and the held plan's name
    appears in no other line; `loopBDirective(root, { crossed: [], pending })` with the pending
    list from `continueAfterCrossing` gives the same held line.
23. Hold entries are never answers: after hold then release, `hasEnoughInformation` reports
    `unboundAnswers: 0` and `answered` without `ctoc-hold`; `readAnsweredQuestionIds(root,
    ref, { questionsRevisionMs, planMtimeMs })` (no questions passed) does not put `ctoc-hold`
    in `ids`.
24. Classification is queued once, with a whole-millisecond label. An implementation slice
    whose plan file's modification time is set to 1784271999 seconds and whose author file
    (unclassified, two `detail` questions) is written with the stamp 1784271999196.2705 →
    `continueAfterCrossing` leaves the plan where it is, and the registry holds exactly one task
    `{ kind:'classify', plan:'implementation/<file>.md',
    touches:['.ctoc/streaming/questions/implementation/<file>.md'],
    label:'revision-1784271999196' }`, which is in `promote`; a second `continueAfterCrossing`
    queues none; after that task is marked done with no file written, a third call still
    queues none.
25. Guard: with the fixture of case 24 before any continuation, `streamingGateScreen(root)`,
    `loopBDirective(root)` and `route(['plan', ref])` leave the task registry byte-identical.
26. The classified file replaces the author's. A functional plan with an author file of two
    `detail` questions → the first continuation queues the `classify` task; a gate-critic file
    (same questions, `classification: { by: 'gate-critic', at }`) is then dropped in
    `pending/` → the next `continueAfterCrossing` promotes it, the plan crosses to
    `implementation/`, its Decisions block names both recommended options, and no second
    `classify` task is queued.
27. Fail closed. With the task registry's file replaced by a directory so no task can be
    recorded, `continueAfterCrossing` returns the reason `classify-not-queued` and the plan
    stays with both questions in `blockingQuestionIds`; a gate-critic file whose
    classification block is malformed (`by: 'product-owner'`) leaves the plan unclassified and
    every question with the human.

`tests/protect-records.test.js` (MODIFY — owner-approved hook change; new cases numbered after
the file's last case, driven through the real hook process with the suite's existing `run`,
`payload` and `brokenEntry`; a background agent's payload adds `agent_id: 'a1b2c3'` and
`agent_type: 'iron-loop-executor'`; `MENU` is `node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js"`):

- A background agent running `${MENU} stream answer review/x.md 'q10-db' '1'` → refused: exit
  2 and the background-agent sentence on stderr.
- The same command without `agent_id` → allowed (guard); with `agent_id: ''` → allowed
  (guard: only a non-empty id marks a background agent).
- A background agent running `${MENU} menu task complete t7 --summary "built"` → allowed
  (guard).
- A background agent running each other refused route → refused: `${MENU}` with no arguments;
  `${MENU} --live-agent-ids a,b`; `stream approve review/x.md`; `stream skip review/x.md`;
  `stream comment review/x.md looks fine`; `stream`; `plan`; `menu task complete t7 --continue
  --summary "x"`; the single-string form `${MENU} "stream answer review/x.md q10-db 1"`; an
  unknown first word.
- A background agent running each allowed route → allowed (guard): `menu task fail t7
  --summary x`, `menu task add implement p --touches a.js`, `menu task list`, `menu commands`,
  `dashboard`, `tasks`, `task t7`, `browse review`, `section execution`, `stubs s`, `validate
  review/x.md`, `inbox gates`, `plan review/x.md`.
- A background agent running the menu outside a pure call → refused: `node
  src/commands/start.js stream approve review/x.md; true`; `node -e
  "require('./src/lib/menu-screens').route(['stream','answer','review/x.md','q10-db','1'],process.cwd())"`.
  The same two without `agent_id` → allowed, as today (guard).
- A background agent's ordinary work → allowed (guard): `npm test`, `node --test
  tests/streaming-gate.test.js`, `grep -n route src/commands/start.js`.
- The protection crashing (`brokenEntry`) on a background agent's `${MENU} stream answer
  review/x.md 'q10-db' '1'` → refused with the "protection failed to run" sentence; the same
  crash on the main session's menu call → allowed, as today (guard).

`tests/streaming-gate-coverage-holes.test.js` (MODIFY — contract replaced by the owner): the
case "enough information at the LAST moment is shown to the human, never crossed
automatically" builds a review plan with an empty question list and no check record. Keep
the fixture, rename it "an empty question list alone never finishes a plan", and assert the
plan stays because it has no passing check record — stricter about the cause than before.
*(Added on the owner's decision of 2026-10-07.)* The case "an answer that cannot be tied to a
revision is still recorded" (the stubbed precompute load failure) now asserts that nothing is
recorded and that the status says "Nothing was recorded" and names the reason.

Changed existing tests (owner's decisions of 2026-10-07; each tightened to the new contract,
none loosened):

- `tests/streaming-gate.test.js`: the three exact answer-action strings (`'stream answer
  functional/rich.md q10-db 1'`, `… q10-db 2`, `'stream answer functional/multi.md q11-auth
  1'`) become the quoted form (`… 'q10-db' '1'`), and the first case also asserts
  `actions['Hold this plan']`.
- `tests/plan-question-screen.test.js`: the exact action `'stream answer
  review/session-expiry.md q01-session-idle-timeout 1'` becomes the quoted form.
- `tests/answers-bind-to-plan-revision.test.js`: `offeredQuestionId` reads the quoted form
  (`/^stream answer \S+ '([^']+)' '[^']+'$/`); case 20 ("an unstampable answer is still
  RECORDED") becomes "an answer that cannot be checked is refused and the human is told":
  nothing appended, status "Nothing was recorded … could not be read … asked again".

## Wiring — the live call sites

- `continueAfterCrossing` (`src/lib/menu-screens.js`) is called by `taskComplete` (the
  session's `menu task complete <id> --continue`), and by `streamApprove` and `streamAnswer`
  (`src/lib/streaming-gate.js`, the `stream approve` and `stream answer` routes). All three
  are reached from the shipped slash command `src/commands/start.js`. The instruction that
  makes the session pass `--continue` arrives in slice 3 (`src/commands/start.md`); until then
  the `stream approve` and `stream answer` paths are live.
- `crossOnEvidence` and `appendDefaultDecisions` are called by `pendingGateDecisions` on the
  call from `continueAfterCrossing`.
- `recordDeployReadyNotice` gains its second caller, `crossOnEvidence`.
- `loopBDirective(root, { crossed, pending })` is called by `streamAnswer`. Its other callers
  — the on-open banner (`streaming-gate.engineStatusBanner`, `src/tabs/overview.js`) and
  `src/hooks/SessionStart.js` (not registered with Claude Code) — keep the no-options form,
  which now also prints the held line from the pending list it already computes.
- `HOLD` and `goesToHuman` (exported by `src/lib/streaming-precompute.js`) are read by
  `streaming-gate`'s `precomputedQuestionParts`, `holdQuestion`, `nextUnansweredQuestion` and
  `streamAnswer`, and inside `streaming-precompute` by `validatePlanQuestions`,
  `readAnsweredQuestionIds` and `hasEnoughInformation`. `Hold this plan` and CTOC's
  keep-or-release question are rendered on the default `/ctoc:start` screen
  (`richQuestionScreen`) and on `plan <ref>` (`planDecisionScreen`); their actions route
  through `menu-screens.route` `stream answer` → `streamAnswer`. Root: `src/commands/start.js`.
- The `classify` task is queued by `continueAfterCrossing`, accepted by
  `task-registry.KINDS`, and launched by the session from `promote[]` per the new
  `src/commands/start.md` paragraph. Live today through the existing COMPLETION step 3: a
  `classify` task queued on a `stream answer` or `stream approve` stays in the registry and
  is returned by the next completion's `computePromote`. The session acting on a stream
  screen's own `promote[]` arrives with slice 3's paragraph.
- The background-agent rule lives in `bashRefuses` and `decide` of
  `src/hooks/protect-records.js`, the one hook registered in the plugin's `hooks/hooks.json`
  (`PreToolUse`, Bash among its matchers). It runs on every shell call any agent makes.

## Acceptance criteria

From the parent table (criteria 1 to 8; 9 and 10 belong to slice 3), with the owner's
decisions of 2026-10-07 folded in:

- [ ] A question reaches the human only under the five conditions, and only in a file the gate critic classified; every other open question is decided by its recommended option — slice 2 cases 1, 26 (with slice 1's cases).
- [ ] Every decided-by-default question is written into the plan the builder reads, once — cases 1, 11, 26.
- [ ] A plan with a weighty question stays, and that question is asked before any detail — case 2.
- [ ] A human's Hold holds until he releases it; once released, his answer moves the plan on — cases 3, 16, 17, 19, 21, 23 (with slice 1's held cases).
- [ ] Every agent question screen carries CTOC's own "Hold this plan" with the reserved key, never text from the agent's file; every answer action quotes the question id and key; `streamAnswer` records `holds: true` for a hold (including the gate ruling's own Hold and Send-back options), `holds: false` for any other answer, and refuses any key that is not one of the question's options or CTOC's own — cases 14, 15, 16, 17, 18, 19.
- [ ] A hold is kept under CTOC's stable question id, so a release recorded against any later revision ends it, and a held plan whose original question is gone can still be released from its own screen — cases 17, 20, 23.
- [ ] A held plan says in plain words, on its screen and in the session status, that the owner is holding it and how to release it; nothing crosses it — cases 20, 21, 22.
- [ ] An author's unclassified question file gets one gate-critic classification task through the continuation, never at menu open, session start or stop; its label is a whole millisecond; the classified file replaces it through the existing sweeper; when classification cannot run, every question keeps reaching the human — cases 24, 25, 26, 27.
- [ ] A background agent cannot answer, hold, release or approve through the menu, nor run any route that crosses a plan; the build agent's own completion and the read-only screens stay allowed; the main session is unchanged; a refusal is one plain sentence on stderr with exit 2 — the new cases in `tests/protect-records.test.js`.
- [ ] A built plan with every step checked, a fresh passing record and a recorded build admission reaches done with no human act, recorded as pipeline evidence naming the record, never as his approval — cases 6, 7, 8.
- [ ] After a completion or an answer, the next approved plan starts and a newly moved functional plan gets its planner, with no human act; a requested stop is honoured — cases 1, 3, 4, 5.
- [ ] Nothing moves at menu open, session start or stop; the build agent's own completion changes nothing — cases 10, 13, 25; existing session-start tests stay green. (The pre-build sufficiency crossing that the default screen already performs when it opens is today's behavior and is not changed by this slice; see Decision 12.)
- [ ] Done never deploys — case 9.

## Risks

| Risk | Mitigation |
|---|---|
| Hooks are off, so any agent with Write can write a passing check record or a ledger entry; at done nothing else stands between a forged record and "done" | Done requires a recorded build admission plus a fresh passing record. The owner decided on 2026-10-07 to load only the two write protections — the approval records (`.ctoc/approvals/`) and the check records (`.ctoc/state/verify/`) — while every other hook stays hidden; built by `the-approval-and-check-records-are-write-protected`, which this slice reaches through slice 1, and whose Risks state what that protection cannot catch |
| The background-agent rule reads command text: a script file written and then run, a path built at run time, or a tool other than the five matched still reaches the menu's routes | Stated in the hook header and `docs/ENFORCEMENT.md`, the same class of limit the protection already declares; every answer, hold and release remains a timestamped entry in the write-protected answers log |
| The main session itself can run `stream answer` without the human's reply | Out of reach of any hook (it carries no `agent_id` by design); the session's instructions route only the human's own replies to these actions |
| The rule relies on Claude Code sending `agent_id` only for subagent calls | Verified by the coordinator on 2026-10-07 in the hooks documentation and in the installed 2.1.291; a call without the field is treated as the main session's, which is today's behaviour, so a future change in that field can only widen what is allowed back to today, never refuse the human's session |
| An agent-written gate ruling whose option label begins "Approve " but reads as a hold would let the plan move when chosen | Deliberate deception visible in the stored question file and the answers log; the label the human read is what CTOC acts on (Decision 21) |
| Every plan whose author wrote questions now costs one gate-critic dispatch (each slice of a decomposed plan has its own file) | Once per question revision; a plan with no questions, every question answered, a hold, or an unreadable answers log gets none; the four-lens fleet still runs only when the human asks |
| A gate critic that writes nothing valid leaves every question of that plan with the human | Fail closed, by the owner's decision (a); no automatic retry, because a retry on a plan the critic cannot classify would dispatch without end |
| Up to 142 plans now in review cross to done on first continuation where their records still pass | The owner's standing instruction of 2026-10-06 ("do not bring him approval questions; cross on the evidence"); every finished plan is named in the status line; a plan can be moved back |
| A parent index plan in `implementation/` still sits as a pending decision after its slices move on | Unchanged by this plan; it is noise on the screen, not a stop |
| Coverage floor 99% and the false-green fence | Every new branch has a case above; no empty catch block — each records a named reason |
| `src/lib/streaming-gate.js` is on the protected enforcement list (`src/lib/protected-paths.js`): only a human approval grants coverage over it | This slice needs the human's own approval to build, not a crossing on evidence. Moot while plan coverage is not loaded; stated so nobody is surprised if it is turned on |

## Decisions Taken Under Ambiguity

Copied from the parent:

3. **Done reuses the pipeline-kind ledger entry** that `approval-residency.js` already accepts
   at done with evidence; no new provenance kind, no change to the residency rules.
4. **No stored questions do not block done**; the check record, the checked steps and the
   recorded build admission are the evidence. A stale, invalid or unreadable question file
   still blocks (fail closed).
5. **Continuation only on the session's calls** (`--continue`, `stream approve`,
   `stream answer`); the build agent cannot launch agents, so claiming work in its turn would
   leave tasks running with nobody on them.
8. **Failed checks still stop** the plan in review; automatic retry is a different mechanism
   and is not part of this plan.
9. **The sufficiency evidence string is unchanged**; the decided-by-default count is derivable
   (unanswered minus blocking) and the plan carries the list.

New, from slicing:

10. **The slice keeps the parent's boundary** (six files plus the count ratchet), because the
    brief said to cut along the slices the parent already defines. The owner's decisions of
    2026-10-07 add nine more — five source, instruction or documentation files, the hook's
    test file, and three test files whose contract he replaced — each with its reason in
    `files:`.
11. **This slice updates the test-file count in `CLAUDE.md`,** not slice 3 as the parent's
    Step 10 says. A plan that creates a counted file must declare `CLAUDE.md`, or the
    build-approval check refuses it (`src/lib/documented-counts.js`, called from
    `plan-validator.validateForQueue`).
12. **The review-to-done crossing runs only inside `continueAfterCrossing`.** The parent
    contradicts itself here, and the builder would otherwise have to guess. The default
    `/ctoc:start` screen calls `pendingGateDecisions(projectRoot)` every time it opens
    (`streamingGateScreen`, `src/lib/streaming-gate.js` line 1537, and again through the
    on-open banner's `loopBDirective`). So a review branch inside `pendingGateDecisions` that
    always ran would finish plans whenever the menu opens. That would break parent criterion 7
    ("Nothing moves at menu open") and the parent's risk row ("cross to done on first
    continuation"). Gating it on `opts.crossed` satisfies both. A built plan still crosses at
    the moment it matters: its own completion through `menu task complete --continue`, which
    settles the plan into review, writes its check record, then calls `continueAfterCrossing`.
13. **The `review` snapshot item in `loopBDirective` is dropped,** because under Decision 12
    it could never name a plan.
14. **Guard case 13 is added** so that criterion 7 is proven for the new crossing, not only
    for `--continue`.

Owner decisions of 2026-10-07, recorded:

15. **The gate critic assigns every topic, and the owner's Hold must hold.** Decisions (a) and
    (b): an unclassified question file blocks every question; a hold is read only from the
    answers log, which only CTOC's menu writes (slice 1 Decisions 12–13).
16. **Background agents may not answer, approve or move plans through the menu** (answer "a"
    to "Should the write protection also stop background agents from answering or approving
    through the menu?"). This is the owner's approval for the change to
    `src/hooks/protect-records.js`. Verified by the coordinator: Claude Code's `PreToolUse`
    input carries `agent_id` and `agent_type` only when a subagent makes the call ("Present
    only when the hook fires from within a subagent … Absent for the main thread, even in
    --agent sessions", installed 2.1.291; https://code.claude.com/docs/en/hooks).
17. **From the re-review of slice 1:** the hold uses a stable question id of CTOC's own, not
    the ruling's revision-suffixed id, so a release on a newer revision ends it; a hold whose
    original question no longer exists can be released from the held plan's own screen; and
    every modification time that becomes part of an id is a whole millisecond
    (`Math.floor`).

Choices taken to carry those decisions out:

18. **The hold is one constant with CTOC's own id, key and labels.** `HOLD` (question id
    `ctoc-hold`; options `Hold this plan`, `Keep holding this plan`, `Release the hold`) lives
    in `streaming-precompute.js`, the question contract's module; the screens, the answer check,
    the reader and the validator read it there. None of it can collide with an agent's ids
    (`q<NN>-<kebab>`) or keys (`1`–`3`). A question file using any of the three labels is
    invalid, or an agent could put a look-alike option on the screen with its own key.
19. **`Hold this plan` is offered on every agent question screen, not only blocking ones.**
    Both screens are built by `precomputedQuestionParts`, so one change covers them. Asked
    order: the question's options, `Hold this plan`, then `Skip for now` and `Open the plan`
    while fewer than four (the asking tool's limit). On a three-option question Skip and Open
    leave the asked list; their actions stay, "Other" still records a comment, and a hold also
    moves the screen past the plan.
20. **A hold is never an answer, and only an explicit release ends it.** A hold records no
    answer for the question it was made on (`heldOn` names it for the record). While a plan is
    held its screen asks CTOC's own question first, whatever its question file now contains —
    this is the release path for a question that is gone, and it survives every revision
    because its id never changes. Answering some other question of a held plan does not
    release it: he held the plan, not one answer. CTOC's question carries no recommended
    option, because keeping or releasing is his decision.
21. **The gate ruling's own Hold and Send-back options hold.** Slice 1 took `holds` out of
    question files, so "Hold until …", "Hold — I want another look first" and "Send … back
    for rework" would again let the plan cross — the defect slice 1 set out to remove. On
    `q99-gate-ruling` (optionally `-r<digits>`), every answer except an option whose label
    begins `Approve ` records a hold, not an answer, so after a release the ruling is asked
    again. The label the human read decides, and a label that reads as a hold cannot release
    the plan.
22. **An answer that cannot be checked is refused, not recorded.** "Refuse a key that is not
    one of the question's options" is read strictly: when the question set cannot be read, or
    does not hold the question, its options are unknown, so nothing is recorded and the human
    is told why and that the question will be asked again. CTOC's own question is the
    exception, because CTOC defines its options and it must work whatever state the question
    file is in. This replaces the contract that an unstampable answer is still recorded (case
    20 of `tests/answers-bind-to-plan-revision.test.js` and the matching case in
    `tests/streaming-gate-coverage-holes.test.js`); recorded unchecked, such an answer could
    also bind by its time to a regenerated question that reuses the id.
23. **Quoting.** The id and key are wrapped in single quotes; an embedded quote is closed,
    escaped and reopened. The stored values are already plain characters (slice 1's
    validator), so quoting is a second wall; the escape form would be refused by the records
    protection (it refuses a backslash in a menu call), which is the fail-closed direction. A
    value that reaches the router still quoted (the whole action passed as one string)
    matches no question and is refused, plainly. The ref stays unquoted, as in every other
    action, because `SAFE_PLAN_FILE` already restricts it.
24. **Hold entries are never answers to the reader either.** Entries under `ctoc-hold` stay
    out of `ids`, `keys` and `unbound` in both binding modes, so a released hold never appears
    in a permanent crossing record as "1 recorded answer did not bind".
25. **After a hold, or a keep, the screen moves past the plan** (`advanceAfter`): showing the
    plan he just held would ask him the same question twice.
26. **Which question a screen asks is the verdict's rule.** CTOC's own question for a held
    plan; otherwise the first that goes to the human by `goesToHuman(question, classified)` —
    the expression `hasEnoughInformation` already used, now exported from one place — then the
    first unanswered. `sufficiencyFor`'s `defaults` likewise take "unanswered and not
    blocking" from the same verdict, so an unclassified file yields no defaults.
27. **The classification trigger is the plan's state, not the sweep that promoted its file.**
    The default screen also sweeps when the menu opens, so "promoted by this sweep" would miss
    files that arrived then. "Once" means one `classify` task per plan per question revision
    (task label `revision-<whole millisecond>`, any status): a failed classification is never
    retried in a loop, and a new question file from the author gets one new task. A held
    plan, or one whose answers log cannot be read, is not classified until its verdict is
    `open-forks` again; a plan with no questions has nothing to classify.
28. **A new task kind, `classify`, rather than the existing `precompute`.** `precompute`
    launches the three lens critics and the synthesis, which run only when the human asks
    (slice 1 Decision 6); classification is the gate critic alone. Its `touches` equal the
    `precompute` recipe's (`.ctoc/streaming/questions/<ref>`), so a classification and a
    fleet run on the same plan never run at once.
29. **Slice 2 adds one paragraph to `src/commands/start.md`.** A promoted `classify` task needs
    its brief in the same unit of work (Operating Lesson 16), and
    `tests/unexecutable-instruction-fence.test.js` refuses a task kind that no command recipe
    documents unless its baseline is raised, which would loosen a fence. Slice 3 depends on
    slice 2, so the two edits of the file are sequential; slice 3 keeps this paragraph.
30. **A held plan on the session status** gets its own line, built from the pending list the
    directive already holds, so no extra pass over the plans; "session status" is
    `loopBDirective`, the status shown at session start, on menu open and after an answer.
31. **Only automatic crossings respect a hold.** A held plan's screens offer no Approve, so the
    human can approve one only deliberately (`claude:approve`), and that act is his and is not
    refused.
32. **The background-agent rule is a list of allowed routes, not a list of refused ones.**
    Every route not on it is refused for a background agent, so a crossing route added to the
    router later is refused until someone decides to allow it. The tables in the hook
    specification enumerate both sides from `src/commands/start.js` and its router. The rule
    also covers the menu reached outside a pure call (a compound command, the repository's own
    `src/commands/start.js`, an inline script naming the router or the gate module), because a
    background agent could otherwise add `; true` to slip past the pure-call reading. Running
    tests, reading files and the build agent's own completion stay allowed.
33. **The protection's crash rule is extended only for background agents.** A crash on a
    background agent's call that mentions the menu refuses; a crash on the main session's menu
    call is allowed as today, so one broken release cannot lock the human out of his own menu.
34. **Slice 2 edits `docs/ENFORCEMENT.md`** for the hook change (the section on the one loaded
    hook). Slice 3 also edits that file (the streaming-questions heading and the review-to-done
    paragraph); it depends on slice 2, so the edits are sequential and slice 3 keeps this
    section's text.

## Execution Plan

### Step 8: TEST
- [ ] Write `tests/plans-keep-moving-without-the-human.test.js` cases 1–27, the new cases in `tests/protect-records.test.js`, the two changed cases in `tests/streaming-gate-coverage-holes.test.js`, and the changed assertions in `tests/streaming-gate.test.js`, `tests/plan-question-screen.test.js` and `tests/answers-bind-to-plan-revision.test.js`; run; record which are red.

### Step 9: PREPARE
- [ ] Confirm slice 1 is built (the worktree branch `agent-a0b33c6c216a2989c`, including the sweeper's sixth argument `payload.classification`).
- [ ] Read `computeSpecHash`'s exclusion list to confirm `## Decisions Taken Under Ambiguity` is excluded.
- [ ] Read `agents/iron-loop/gate-critic.md` "Classifying the questions" so the `start.md` brief matches what the critic expects.
- [ ] Re-read `src/commands/start.js` and `menu-screens.route` and confirm the two route tables still match the code before writing `subagentMayRunRoute`.
- [ ] Record before-numbers: false-green scan count, dead-export count, unreachable-file count, `CLAUDE.md` bytes, and the findings in `.ctoc/unexecutable-instruction-baseline.json`.

### Step 10: IMPLEMENT
- [ ] `src/lib/streaming-precompute.js`, `src/lib/task-registry.js`, `src/lib/streaming-gate.js`, `src/lib/menu-screens.js`, `src/lib/actions.js`, `src/lib/loop-b-driver.js`, `src/commands/start.md`, `src/hooks/protect-records.js`, `docs/ENFORCEMENT.md`, as specified; run the slice 2 tests and `tests/protect-records.test.js` green.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`: no crossing writes `approved_by`; vision to functional untouched; continuation, the review-to-done crossing and the `classify` queueing unreachable from menu open, session start and stop; CTOC's hold labels and descriptions never come from a question file; a hold is released only by `Release the hold`; no held plan can be crossed automatically; the two route tables match the router; every hook decision for a call without `agent_id` is unchanged; no instruction surface contradicts the code.

### Step 12: OPTIMIZE
- [ ] One verdict per plan per pass (no second questions read for `defaults`); `startAgent` called only when `nextBuildable` has work; the classification check reads a question status only for plans whose verdict is `open-forks`; `nextUnansweredQuestion` still makes one status read and one answers read; the held line reuses the pending list; the hook's background-agent check runs only when `agent_id` is present.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: question text appended to plans is single-line, control-stripped and capped; the evidence string carries no command text or secrets; `--continue` cannot be reached by the build agent's documented call, and is refused to any background agent; every generated `stream answer` action quotes the id and key; `streamAnswer` writes nothing for a key outside the question's options and CTOC's own, or when the question set cannot be read; look-alike CTOC labels are refused on write and read; a background agent cannot reach any refused route through a pure call, a compound command or an inline script; the hook's limits are stated in its header and `docs/ENFORCEMENT.md`.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] Lint the changed files: zero warnings.
- [ ] False-green, dead-export and unreachable counts not higher than the Step 9 numbers; `.ctoc/unexecutable-instruction-baseline.json` unchanged and `tests/unexecutable-instruction-fence.test.js` green; `CLAUDE.md` at or under 15,000 bytes.
- [ ] An existing test outside `files:` that fails because it asserts a replaced contract (a review plan with a passing record stays pending; an unquoted answer action; an answer that cannot be checked is recorded; the gate ruling's Hold or Send-back option moves the plan; a three-option question also asks Skip and Open; a background agent's menu call is allowed) is reported through `src/lib/scope-growth.js`, never edited outside `files:`.

### Step 15: DOCUMENT
- [ ] JSDoc on every changed function, including `HOLD`, `goesToHuman`, `holdQuestion`, the `classify` kind, `'held'` in `sufficiencyLine`, and the hook's new internal functions.
- [ ] Update the test-file count in `CLAUDE.md` for the new test file (Decision 11); `tests/doc-counts.test.js` green.

### Step 16: FINAL-REVIEW
- [ ] The main session (a background agent is now refused these routes) drives a scratch project through the real routes and shows the owner, in full: one plan from an approved functional plan to done (every ledger entry, every status line, the Decisions block written into the plan); one author question file from arrival to its `classify` task in `promote`, the classified file swept in, and the plan moving on; one Hold — the screen after it, CTOC's keep-or-release question after the plan's questions are regenerated, the session status line, the answers-log entries — and its release; one background agent's `stream answer` refused, with the sentence it was shown.
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria above.

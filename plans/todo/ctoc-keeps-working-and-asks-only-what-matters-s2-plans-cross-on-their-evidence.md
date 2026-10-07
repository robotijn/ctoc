---
iron_loop_verdict: true
iron_loop: true
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
  # the hold's single source (stable question id, CTOC's three option labels), those labels refused in question files, hold entries never read as answers, the shared goes-to-the-human rule; and, from slice 1's third security scan, the question digest exported for its two live callers in the answer writer and the screen
  - src/lib/streaming-precompute.js
  # the new `classify` task kind the continuation queues for the gate critic
  - src/lib/task-registry.js
  # the session's brief for a promoted `classify` task, which is also the recipe the instruction fence requires for every task kind
  - src/commands/start.md
  # the owner replaced the answer-action contract (quoted id and key, plus the digest of the question shown); these assert the old unquoted `stream answer` strings
  - tests/streaming-gate.test.js
  - tests/plan-question-screen.test.js
  # same, and its case 20 asserts that an answer which cannot be checked is still recorded; it is now refused
  - tests/answers-bind-to-plan-revision.test.js
  # from slice 1's third security scan: these call the answer writer without the digest and assert slice 1's interim contract (the writer's answer counts for nothing, so they hand-write "slice 2's" entries); slice 2 makes the real writer's answer count
  - tests/answer-feeds-sufficiency.test.js
  - tests/streaming-human-loop-e2e.test.js
  # owner-derived decision of 2026-10-07: the classification section gains the omission duty (read the plan and its parent, add a classified question for every weighty choice the author left unasked, never remove or reword an author's question)
  - agents/iron-loop/gate-critic.md
  # the gate critic's rules: the orders the omission duty replaces or adds, with their records; the size ceiling rises only by the measured overage, recorded as a correction
  - tests/compaction-eval/gate-critic/rule-inventory.json
  # the gate critic's order floor rises to the new count and its unit-kind digest is re-pinned
  - tests/gate-critic-compaction.test.js
  # owner-approved hook change: a background agent may not answer, hold, release, approve or move a plan through the menu
  - src/hooks/protect-records.js
  # the hook change's cases, written first
  - tests/protect-records.test.js
  # the one loaded hook's documentation must say what it now refuses for a background agent, what it allows, and what it cannot catch
  - docs/ENFORCEMENT.md
  # Ratchet, not counted toward the slice size: this slice creates a test file, which
  # moves the test-file count in CLAUDE.md.
  - "CLAUDE.md"
  # Added 2026-10-07 by the session after the build: the README test-file count and the golden-corpus ceiling move down with this slice
  - README.md
  - .ctoc/golden-corpus-baseline.json
approved_by: human
approved_at: 2026-10-07T13:42:48.628Z
gate_crossed: implementation → todo
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
routes to background agents. "Added from slice 1's third security scan" (Decisions 35–41):
every answers-log entry carries the digest of the question as shown, every append starts on a
new line, the screen binds answers exactly as the gate does, and an author's question file —
even an empty one — moves its plan only after the gate critic classifies it. "Owner-derived,
2026-10-07" (Decision 42): the gate critic's classification also adds a question for every
weighty choice the author left unasked. Slices 1 and 2 ship together.

## What the owner asked

> "i am trying to hide the hooks so the llm thinks and ask usefull questions to the user do
> not bother the user with gates only with questions of high uncertainty or huge importance
> (like tech stack or algorithms)" — and — "optimize the shit out of ctoc" (2026-10-06)

Owner decisions of 2026-10-07 (recorded as Decisions 15–17): (a) the independent gate critic
assigns every question topic, and an unclassified question file blocks every question; (b) the
owner's Hold must hold; the write protection also stops background agents from answering or
approving through the menu (answer "a"); and, from the re-review of slice 1, the hold uses a
stable question id of CTOC's own, a hold whose question is gone can still be released, and a
modification time that becomes part of an id is a whole millisecond. Derived from (a) by the
session on the same day (Decision 42): the independent gate critic decides what reaches him,
so the author must not decide by omission either.

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

Five more, found after slice 1 was built (worktree branch `agent-a0b33c6c216a2989c`, commit
83a093f0, its Decisions 12–14 and Execution Record) and in its re-review and third security
scan:

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
- **A human's answer through the menu does not count.** Slice 1's third security scan made an
  answers-log entry count only when it carries `questionDigest` equal to the question's digest
  (sha256 over the prompt and the key-to-label pairs, each through the label identity), so an
  answer can never be replayed onto a question rewritten under the same id; a release of a
  hold needs the same binding. `streamAnswer` writes no digest, so every answer the human
  gives is asked again by the gate — while the screen, which still binds by id alone, stops
  asking it and says "Recorded your answer". The plan never moves, and the screen shows
  nothing missing. The writer also appends without first ending a torn last line, so the next
  entry fuses with it and is lost. Slice 1 cannot reach a user without this slice.
- **Nothing starts the classification.** Slice 1 lets a question's topic decide only in a file
  that carries the gate critic's classification block; in an author's file every question
  reaches the human, and since its third security scan an author's file never moves its plan
  at all — not when the human has answered every question in it, not when it is empty
  (`reason: 'unclassified'`). The gate critic knows how to classify (its section "Classifying
  the questions — the topic is yours, never the author's"), but nothing dispatches it, so
  every plan whose author wrote a question file, even an empty one, would wait for the
  human's Approve forever.
- **A classification only grades what the author chose to ask.** The gate critic's
  classifying section assigns topics to the author's questions and writes them back; it never
  reads the plan for a choice of technology stack, algorithm, data model, security posture,
  anything irreversible or a large cost that the author made silently. Once classification
  lets a plan move without the human, an author's omission would decide what reaches him —
  and an empty author list would move its plan with nobody having looked.
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
and no question needs the human (no questions stored counts as none; an author's file the
gate critic has not classified, even an empty one, is not "none"); it writes the existing
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
gate-critic classification task for each plan whose author's question file is unclassified,
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

**An answer is bound to the question as shown (added from slice 1's third security scan).**
Every screen action that can let a plan move — an option of an agent's question, and CTOC's
own `Release the hold` — carries the digest of the question exactly as that screen showed it
(`questionDigest`, which this slice exports because these are its live callers).
`streamAnswer` records such an answer only when that digest still equals the stored
question's, and writes it into the entry, so the gate counts the human's answer and a question
rewritten between showing and clicking is asked again instead of inheriting the click. A hold
never needs a digest: it is honoured whatever the question now says. Every entry under
`ctoc-hold` — hold, keep and release — carries CTOC's own `HOLD.digest`, and the reader
releases a hold only on an entry that carries it. Every append to the answers log starts on a
new line. The screen's "already answered?" check reads the log through the same reader with
the same questions, so the screen and the gate never disagree on what is answered.

**Classification starts itself (added on the owner's decision of 2026-10-07; reconciled with
slice 1's third security scan).** A question file the gate critic did not classify never moves
a plan: slice 1 returns `open-forks` while any of its questions is unanswered and
`unclassified` once none is — even when the human answered all of them, even when the list is
empty — and no crossing in this slice accepts either. So when `continueAfterCrossing` finds a
still-pending plan whose ready question file has no gate-critic classification, it queues one
`classify` task for that plan (once per question revision, an empty file included) and returns
it in `promote[]`. That task is the only way a plan whose author wrote its question file moves
without the human; the other way is his own Approve. The session launches the gate critic
alone with a classification brief; the critic writes the classified file to the waiting
folder, and the existing sweeper replaces the unclassified file on the next continuation —
same plan, same revision stamp, so an answer already given still binds, because the critic
keeps every author question's wording and options. If the task cannot be queued, or the
critic writes nothing valid, the unclassified file stays, the plan stays where it is, every
question keeps reaching the human, and only his Approve moves it — never decided
automatically.

**The classification also covers what the author left out (owner-derived decision of
2026-10-07, Decision 42).** A classification reads the plan and its parent plan. Besides
assigning a topic to every author question, it adds one question for every weighty choice —
technology stack, algorithm, data model, security posture, anything irreversible, a recurring
or large cost — that the plan makes or leaves open and no author question asks; each added
question carries its topic and a recommended option where the evidence supports one, and so
goes to the human like any weighty question. An empty author list is classified the same way.
The critic never removes, rewords or renumbers an author's question. This is an instruction to
the gate critic (`agents/iron-loop/gate-critic.md`), held word for word by its compaction
inventory; the code's part is unchanged — a classified file's weighty question blocks and is
asked first, by slice 1's rule.

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
every hook decision for a call without an `agent_id`; the digest's format (slice 1's tests pin
it); `src/lib/streaming-questions-sweeper.js` (slice 1 already passes the classification
block through).

## Specification

### `src/lib/streaming-precompute.js` (MODIFY — added on the owner's decisions of 2026-10-07)

- `HOLD`, exported and frozen — the one source of the hold:
  `{ questionId: 'ctoc-hold', prompt: 'You are holding this plan. Keep holding it, or release
  the hold so it can move on?', hold: { key: 'hold', label: 'Hold this plan', description:
  'Keep this plan where it is. Nothing moves it until you release the hold.' }, keep: { key:
  'hold', label: 'Keep holding this plan', description: 'Nothing moves it.' }, release: { key:
  'release', label: 'Release the hold', description: 'It can move on again: the questions
  that need you are asked again, and the others are decided by their recommended option.' },
  digest }`, where `digest` = `questionDigest({ prompt: HOLD.prompt, options: [keep, release]
  })`, computed once when the module loads — the digest of CTOC's keep-or-release question
  exactly as the screen shows it. `ctoc-hold` cannot collide with an agent's question id
  (slice 1 requires `q<NN>-<kebab>`), and `hold` and `release` cannot collide with an agent's
  keys (`1`–`3`). *(`prompt` and `digest` added from slice 1's third security scan, Decision
  36: the reader must know the digest without depending on the screen module.)*
- `questionDigest`, exported, unchanged *(added from slice 1's third security scan, Decision
  35)*. Slice 1 left it unexported on purpose, because an export with no live caller fails the
  dead-export fence; its live callers are now `streaming-gate.precomputedQuestionParts` (the
  digest an action carries) and `streaming-gate.streamAnswer` (the check before it records).
- `validatePlanQuestions`: an option whose label, by the existing `labelIdentity` (compatibility
  folded, combining marks removed, control characters stripped, trimmed, lower-cased), equals
  the identity of any of CTOC's three labels is refused with `${owhere}.label is one of CTOC's
  own hold options`. Refused on write and on read, like every other violation.
- `readAnsweredQuestionIds`: an entry whose `questionId` is `HOLD.questionId` follows CTOC's own
  rule and is then skipped — it never enters `ids` or `keys` and is never counted in
  `unbound`, in both binding modes (with and without `revision.questions`). It **sets** the
  hold when it carries `holds: true` and a recorded key (no digest needed: a hold fails
  closed). It **releases** the hold only when its key is `HOLD.release.key`, its `holds` is
  absent or `false`, and its `questionDigest` equals `HOLD.digest`. Any other `ctoc-hold` entry
  changes nothing. Its hold state is matched by the plan's file name, across revisions and
  stages, as slice 1 built it; because the id never changes, a release recorded against any
  later revision ends a hold recorded against an earlier one. *(The release condition is added
  from slice 1's third security scan, Decision 36: under slice 1's general rule a later keyed
  entry for an id outside the current questions releases with no digest, and `ctoc-hold` is
  never among the current questions.)*
- `goesToHuman(question, classified) → boolean` already exists and is exported (slice 1 built
  it; `hasEnoughInformation` and `src/lib/sufficiency-audit.js` call it). This slice does not
  change it and adds its third caller, `streaming-gate.nextUnansweredQuestion`. *(Reconciled
  with slice 1 as built: the earlier text had this slice create it.)*

- **The classification keeps every author question (session decision of 2026-10-07, from the owner's decision that the independent gate critic decides what reaches him).** When `writePlanQuestions` (or the sweeper's promotion) writes a gate-critic-classified file over an author's file for the same plan and the same revision stamp, every question of the author's file must be present in the classified file with the same id and the same `questionDigest`; otherwise the write is refused with `classification-dropped-author-question`, logged like the sweeper's other refusals, and the author's file stays. Added questions are allowed; removed or reworded author questions are not.

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
  omit the plan from the list. (`'unclassified'` is neither, so an author's file the gate
  critic has not classified keeps a review plan in review.)
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
- `holdQuestion()` (internal) → `{ id: HOLD.questionId, prompt: HOLD.prompt, critical: true,
  important: false, options: [HOLD.keep, HOLD.release] }` — CTOC's own question; neither
  option is recommended (an owner decision gets symmetric options). Its `questionDigest`
  equals `HOLD.digest`.
- `nextUnansweredQuestion(root, ref) → { question, index, total, held } | null`: the one
  status read and one answers read it makes today, now passing `questions: st.questions` in
  the revision. The screen therefore binds an answer exactly as the gate does
  (`hasEnoughInformation` passes the same three fields to the same reader): the entry must
  name one of the question's option keys and carry that question's `questionDigest`. An entry
  the gate does not count — no digest, another question's digest, a key that is no option,
  another revision's stamp — is asked again on the screen too, so the screen never stops
  asking a question the gate still counts as open. Besides `hasEnoughInformation`, this is the
  only call of `readAnsweredQuestionIds` in `src/`, and both question screens reach it.
  *(Changed from slice 1's third security scan, Decision 37: slice 1 left the screen's id-only
  binding for this slice.)* When `answered.held.length > 0` it returns `{ question:
  holdQuestion(), index: 0, total: 1, held: true }` — whatever the plan's question file now
  holds. Otherwise it picks the first unanswered question for which `goesToHuman(q,
  st.classified)`, else the first unanswered one (`held: false`). `total` unchanged.
  *(Changed on the owner's decisions of 2026-10-07, Decision 26: the earlier text used
  `isBlockingQuestion` alone, which in an unclassified file would ask a detail before a
  weightier question.)*
- `precomputedQuestionParts(q, ref, header)`: with `d = quoteArg(questionDigest(q))`, every
  answer action becomes `stream answer ${ref} ${quoteArg(q.id)} ${quoteArg(e.key)} ${d}` —
  the digest of the question exactly as this screen shows it. For any question but CTOC's own,
  after its options it appends `HOLD.hold` (CTOC's label and description, never anything from
  the question file) with action `stream answer ${ref} ${quoteArg(q.id)}
  ${quoteArg(HOLD.hold.key)}` and no digest, set after the question's own actions. On CTOC's
  own question, `Keep holding this plan` carries no digest and `Release the hold` carries
  `quoteArg(HOLD.digest)`. The rule: an action that can let a plan move carries the digest; an
  action that holds never needs one (Decision 36). `quoteArg(s)` (internal) returns `'` +
  `String(s).replace(/'/g, "'\\''")` + `'`. Both question screens (`richQuestionScreen`,
  `planDecisionScreen`) get this through the one helper.
- `richQuestionScreen`: asked options are the question's options, then `Hold this plan` (not
  on CTOC's own question), then `Skip for now` and `Open the plan` while fewer than four; the
  `Skip for now`, `Open the plan` and `Other` actions stay in `actions` whatever is asked.
- `sufficiencyLine(d)` `'held'`: "you are holding this plan; choose Release the hold on it to
  let it move on". *(Replaces the earlier `'held': 'you chose to hold this plan'`.)*
  `'unclassified'` *(added from slice 1's third security scan, Decision 40)*: "the gate critic
  has not yet checked the questions its author wrote, so it cannot move on by itself; it waits
  for that check or for your approval" — instead of the raw reason word slice 1's fallback
  prints.
- `streamApprove(ref, root)`: after a successful approve, call
  `continueAfterCrossing(root, [{ ref: '<to>/<file>', toStage: to, name }])` (lazy require of
  `./menu-screens`) and set `screen.promote` when non-empty, with one status sentence naming
  what started.
- `streamAnswer(ref, questionId, optionKey, root, shownDigest)` *(extended on the owner's
  decisions of 2026-10-07 and from slice 1's third security scan)*; `menu-screens.route`
  passes the action's fifth word as `shownDigest`:
  1. As today: an invalid ref is ignored; an id or key empty after control-stripping is
     "Ignored an incomplete answer". `shown` = `shownDigest` control-stripped and trimmed
     when it matches `^[0-9a-f]{64}$`; otherwise there is none.
  2. **CTOC's own question** (`qid === HOLD.questionId`): the key must be `HOLD.keep.key` or
     `HOLD.release.key`, otherwise nothing is recorded ("Nothing was recorded for <file>:
     that is not one of the question's answers."). Keep → record `{ ts, ref, questionId:
     HOLD.questionId, optionKey: HOLD.keep.key, holds: true, questionDigest: HOLD.digest }`.
     Release → only when `shown === HOLD.digest`, otherwise nothing is recorded ("Nothing was
     recorded for <file>: this answer does not match the question as it stands now, so it
     cannot be checked. The question will be asked again."); record `{ ts, ref, questionId:
     HOLD.questionId, optionKey: HOLD.release.key, holds: false, questionDigest: HOLD.digest
     }`. Neither needs the plan's question file, so both work whatever state that file is in.
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
     ref, questionId: HOLD.questionId, optionKey: HOLD.hold.key, holds: true, heldOn: qid,
     questionDigest: HOLD.digest }` and no answer for `qid`, whatever `shown` is: a hold is
     never refused because the question changed (holding is the fail-closed direction).
  5. **Any other answer** is recorded only when `shown === questionDigest(q)` — the question
     as shown is the question as stored; otherwise nothing is recorded (the "does not match the
     question as it stands now" sentence above). Record `{ ts, ref, questionId: qid, optionKey:
     key, holds: false, planMtimeMs: st.questionsRevisionMs, questionDigest: shown }`.
  6. Every entry is written by one internal `appendAnswerEntry(root, record)`: it creates
     `.ctoc/streaming/` when missing and appends `'\n' + JSON.stringify(record) + '\n'` in one
     `safeFs.appendFileSync` call, so every entry starts on a new line whatever the log's last
     byte is, and a torn last line stays alone on its line instead of fusing with the entry
     after it (Decision 38). The reader already skips blank lines, and a torn line that names
     a plan's file closes the read for that plan (slice 1). A write failure is reported in the
     status, never thrown.
  7. Status: a hold → "You are holding <file>. Nothing moves it until you release the hold.";
     a release → "Released the hold on <file>."; otherwise "Recorded your answer for <file>."
  8. Replace the bare `loopBDirective(root)` call with `const cont =
     continueAfterCrossing(root)` then `loopBDirective(root, { crossed: cont.crossed,
     pending: cont.pending })`. The screen is `advanceAfter(ref, root, status)` for a hold or
     a keep (moves past the plan just held) and `streamingGateScreen(root, status, { banner:
     false })` otherwise; the directive is appended to its text; set `screen.promote` when
     non-empty. A refused answer returns `streamingGateScreen(root, status)` and runs no
     continuation.

### `src/lib/menu-screens.js` (MODIFY)

- `route`, `stream answer`: pass `args[5]` (the digest the screen's action carries) as
  `streamAnswer`'s fifth argument. *(Added from slice 1's third security scan.)*
- `parseTaskArgs`: `case '--continue': out.continue = true; break;`.
- `continueAfterCrossing(root, extraCrossed = []) → { crossed, promote, quarantined, pending }`
  (exported; callers: `taskComplete`, `streamApprove`, `streamAnswer`):
  1. `sweepPendingQuestions(root)`;
  2. `pending = pendingGateDecisions(root, { crossed })`, then append `extraCrossed` to
     `crossed`;
  3. for each crossed entry with `toStage === 'implementation'` and no active `plan` task for
     its slug (`findActivePlanTask(reg, slug, 'plan')`), queue one via `taskAdd(root,
     ['plan', slug])`;
  4. *(added on the owner's decision of 2026-10-07; reconciled with slice 1's third security
     scan, Decision 39)* for each `d` in `pending` with `d.sufficiencyReason === 'open-forks'`
     or `d.sufficiencyReason === 'unclassified'`: `st = planQuestionsStatus(root, d.ref)`;
     with `label = 'revision-' + Math.floor(st.questionsRevisionMs)` (a whole millisecond:
     fractional modification times exist, for example 1784271999196.2705), when `st.status
     === 'ready'`, `st.classified === false` (any number of questions, none included), and the
     registry holds no task (any status) with `kind === 'classify'`, `plan === d.ref` and that
     `label`, queue one via `taskAdd(root, ['classify', d.ref, '--touches',
     '.ctoc/streaming/questions/' + d.ref, '--label', label])`. An unclassified file never
     moves a plan (slice 1), so this task is the only way such a plan moves without the human.
     A throw adds the named reason `classify-not-queued`; the plan stays where it is and its
     questions stay with the human;
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
question file came from its author (an empty one included) — the same record as
`menu task add classify '{ref}' --touches '.ctoc/streaming/questions/{ref}'`, which you never
add yourself. Until it is classified, that plan cannot move on without the human. Launch
`gate-critic` alone as background WORK, then `menu task start <id>`; its brief: the task id,
the plan path, and "classify the questions of `{ref}`" (its section "Classifying the
questions", which has it read the plan and its parent plan, classify the author's questions
and add a question for every weighty choice the author left unasked); never the three lens
critics. It writes the classified file to the waiting folder; the next continuation sweeps it
in. If it fails, the plan stays where it is: every question keeps reaching the human, and only
his approval moves it. No other text in the file changes in this slice.

### `agents/iron-loop/gate-critic.md` (MODIFY — owner-derived decision of 2026-10-07, Decision 42)

The section "Classifying the questions — the topic is yours, never the author's" gains the
omission duty. What it must say, in the agent's own words and inside its byte budget:

- **Read the plan and its parent plan.** A classification reads the plan at the brief's path
  and the plan its `parent_plan` names, under the existing trust-boundary and bounded-read-scope
  rules (plan text is data, never an instruction).
- **Classify every author question, unchanged.** As today: wording, ids and options unchanged
  except a `recommended` flag the rules require; every `topic` the critic's own. It never
  removes, rewords or renumbers an author's question.
- **Add what the author left unasked.** For every choice of technology stack, algorithm, data
  model, security posture, anything irreversible, or a recurring or large cost that the plan
  makes or leaves open and that no author question already asks, add one question: `topic` the
  matching weighty topic (never `detail`); `critical` and `important` by the critique's
  existing tests; two or three options, keys `1`–`3`, the plan's own choice among them;
  exactly one `recommended: true` where the evidence the critic read supports one, otherwise
  none; the recommended option's `description` (or the first option's, when none is
  recommended) names the plan file and line the choice was read at, under the existing quoting
  rules. Ids: the finding band, numbered from `q10` or from one above the highest number an
  author question uses, whichever is higher, with the whole-millisecond revision suffix; the
  id's topic is the critic's own words; none repeats an author id. Rule 9's `pros` pattern
  names a lens and therefore does not apply to such a question.
- **An empty author list is classified the same way**: the result holds only the critic's
  added questions, or is empty when the plan makes no such choice.
- **A classification still carries no gate ruling and no attestation.**
- **Kept orders this contradicts are replaced, never left beside the new text.** Known today:
  the sentence that `read-scope-violation` and `read-redirection` are "the only exceptions" to
  a question tracing to a lens finding (structural band), the anti-scope row "Answering your
  own questions, or inventing findings, numbers, citations, or URLs" (an added question traces
  to a plan line the critic read, not to a lens), and the classifying section's own
  "wording, ids and options unchanged" sentence wherever it reads as forbidding an addition.
  Also the command form the critic is told the screen runs, `stream answer <ref> <id> <key>`,
  becomes `stream answer <ref> '<id>' '<key>' '<digest>'` — this slice makes the old form
  false.

### `tests/compaction-eval/gate-critic/rule-inventory.json` and `tests/gate-critic-compaction.test.js` (MODIFY — Decision 42)

- Every order the change replaces gets `fate: "replaced"` with a complete `replaced_by` record
  (`instruction`, `date`, `plan` = this slice's slug, non-empty `new_anchors`), and every new
  rule gets `fate: "added"` with an `added_by` record, in the form slice 1 built into
  `tests/compaction-eval/inventory-checks.js`. The new anchors pin the omission duty, one
  each: reading the plan and its parent plan; adding a classified question for every weighty
  choice left unasked, with its topic and a recommended option where the evidence supports
  one; classifying an empty author list the same way; never removing or rewording an author's
  question. These anchors are the test of the agent's behaviour (checks 4, 8 and 10: each
  anchor present exactly once, in its section).
- `maxBytes` rises only by the measured overage of the new text, recorded as one more
  `ceiling_corrections` entry `{ date, from, to, reason }`.
- `ORDER_FLOOR` in `tests/gate-critic-compaction.test.js` rises to the new order count, and
  `KINDS_SHA256` is re-pinned to the digest of the new `n:kind` lines.
- The order ids are listed by the session after the build in "Agent rules this slice replaces
  or adds" below, and the session then re-records the approval, as it did for slice 1:
  inventory check 3 accepts a replaced or added order only when its id appears in the approved
  specification on a line that names `agents/iron-loop/gate-critic.md`. The build reports the
  ids it marked.

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
| `stream answer <ref> <id> <key> [<digest>]` | writes the answers log (answers, holds, releases), then the continuation, which crosses plans (including review to done) |
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

"Today's code" is the worktree branch with slice 1 built (commit 83a093f0). Cases 28–33, added
from slice 1's third security scan, are also red on main.

`D(q)` below is the digest a screen's own action carries for question `q` —
`questionDigest(q)`, and `HOLD.digest` for CTOC's keep-or-release question. Every route call
that answers a question or releases a hold passes it as the action does; only the cases that
test its absence or a mismatch omit or alter it. A hold and a keep pass none.

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
   "You are holding"; releasing it (`route(['stream','answer',ref,'ctoc-hold','release',
   HOLD.digest])`) and answering the question with an option key and `D(q)` → crosses, and
   the returned screen carries `promote` with the planner task.
4. An implementation slice valid for the queue, with the gate critic's classified empty
   question file (`{ ref, questions: [], classification: { by: 'gate-critic', at } }`)
   dropped in `pending/`, and a finished `plan` task → `route(['menu','task','complete',id,
   '--continue'])` moves the slice to `todo` and on to `in-progress`; `promote` holds an
   implement task whose `touches` equal the slice's `files:`; no `classify` task is queued
   (the file is classified). *(Reconciled with slice 1's third security scan: an author's
   empty file no longer moves a plan; case 33 covers it.)*
5. Same with a stop requested (`stopAgent`) → nothing starts, the slice stays in `todo`.
6. A review plan with every required step checked, a fresh passing check record and a ledger
   entry into `todo` → moves to `done`; entry `advanced_by: 'pipeline'`, evidence contains the
   record path and "not approved by the human", no `approved_by`;
   `approval-residency.classifyResidency` on the done file → `accepted: true`, kind
   `pipeline`. (Driven through `continueAfterCrossing(root)`, per Decision 12.)
7. Review plans that must stay: failed record; stale record; no record; no ledger entry into
   `todo`; an open `security-posture` question; an author's question file the gate critic has
   not classified, both empty and with every question answered.
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

14. The hold option, quoting and the digest. A functional plan with a two-option fork → the
    default screen asks `Postgres`, `SQLite`, `Hold this plan`, `Skip for now`;
    `actions['Postgres'] === "stream answer functional/x.md 'q10-db' '1' '" + D(q10-db) +
    "'"`; `actions['Hold this plan'] === "stream answer functional/x.md 'q10-db' 'hold'"`; the
    hold option's description is `HOLD.hold.description`. A three-option question → the asked
    options are exactly its three plus `Hold this plan`; `actions['Skip for now']` and
    `actions['Open the plan']` are still present. `route(['plan', ref])`
    (`planDecisionScreen`) also offers `Hold this plan` with the same action.
15. `writePlanQuestions` refuses a file with an option labelled `hold this plan`, `  Hold
    This Plan  `, `Hold this plan` followed by a control character, `Release the hold` or
    `Keep holding this plan`; the error names CTOC's own options. `planQuestionsStatus` reads
    such a stored file as `invalid`.
16. `route(['stream','answer',ref,'q10-db','hold'])` → exactly one new log entry `{
    questionId:'ctoc-hold', optionKey:'hold', holds:true, heldOn:'q10-db', questionDigest:
    HOLD.digest }` and none for `q10-db`; the plan stays; `hasEnoughInformation` → `reason:
    'held'`, `blocking` ids `['ctoc-hold']`; the returned screen shows the NEXT pending plan,
    not the held one, and its text carries "You are holding".
17. Release and keep. After case 16, `route(['stream','answer',ref,'ctoc-hold','hold'])`
    ("Keep holding") → entry `holds: true`, `questionDigest: HOLD.digest`, the plan stays
    held; the screen's own `Release the hold` action (`… 'ctoc-hold' 'release'
    '<HOLD.digest>'`) → entry `holds: false`, `questionDigest: HOLD.digest`, the plan's
    screen asks `q10-db` again; answering it with its `'1'` action → the entry has `holds:
    false` and `questionDigest: D(q10-db)`, the plan crosses (classified file, pre-build), and
    the screen carries `promote` with its planner task.
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

Added from slice 1's third security scan (Decisions 35–41):

28. The answer carries the digest of the question as shown. A classified functional plan with
    the fork `q10-db` (keys `1` Postgres, `2` SQLite) → the default screen's `Postgres` action
    ends with `'<D(q10-db)>'`, and `D(q10-db)` equals the sha256 computed in the test itself
    in slice 1's format (`JSON.stringify([prompt, [[key, label], …]])`, pairs sorted by key,
    every text through the label identity); running that action through `route` appends
    exactly one entry whose `questionDigest` is that digest, with `holds: false` and the
    revision stamp; `hasEnoughInformation(root, ref).answered` contains `q10-db`, and the plan
    crosses to `implementation/`. Red today: the writer records no digest, the gate asks the
    question again, and the plan stays.
29. An answer whose question changed after it was shown records nothing. The screen of case 28
    is rendered and its `Postgres` action kept; the gate critic's file is then rewritten for the
    same revision with the two labels swapped between the keys (the critic replacing its own
    file, which slice 1 allows) → running the kept action appends nothing, the status reads
    "Nothing was recorded for x.md: this answer does not match the question as it stands now,
    so it cannot be checked. The question will be asked again.", and the next screen asks the
    rewritten question with its new digest. The same refusal for the action with the digest
    left out, with 63 hexadecimal characters, and with the digest in capitals. Guard: a hold
    on the rewritten question with no digest is recorded. Red today: the writer records the
    kept action's key against the rewritten question.
30. Hold and release entries carry CTOC's digest, and a release needs it. After `Hold this
    plan` on `q10-db`, `Keep holding this plan` and the screen's `Release the hold`, all three
    entries carry `questionDigest === HOLD.digest`, and `HOLD.digest ===
    questionDigest(holdQuestion-as-shown)` (read off the held screen's own question and
    options). Then, with the plan held again, each of these hand-appended `ctoc-hold` lines
    leaves it held — `hasEnoughInformation` gives `'held'` and `nextUnansweredQuestion` gives
    `held: true`, so the gate and the screen agree: key `release` with no digest; key
    `release` with the digest of another question; key `release` with `holds: 'false'`; key
    `hold` with `holds: false`. `route(['stream','answer',ref,'ctoc-hold','release'])` without
    the digest records nothing. Red today: slice 1's general rule releases on any later keyed
    line for an id that is not among the current questions, and `ctoc-hold` never is.
31. Every append starts on a new line. The answers log ends with a torn line naming another
    plan (`{"ts":"2026-10-07T00:00:00.000Z","ref":"functional/other.md","questionId":"q10-x"`,
    no newline) → answering `q10-db` through its screen action leaves the torn line alone on
    its own line, the new entry parses on a line of its own, the gate counts the answer and
    the screen moves to the next question. A log whose last entry is complete but has no final
    newline → the same: both entries parse. Red today: the append fuses the new entry onto the
    torn line, the fused line names this plan, and slice 1's reader closes the read for it
    (`answers-unreadable`).
32. The screen and the gate agree on what is answered. For each answers-log state for
    `q10-db` — no entry; an entry with the right key but no digest (the shape today's writer
    records); the digest of another question; a key that is no option; the right key and
    digest under another revision's stamp; the right key and digest — `nextUnansweredQuestion`
    asks `q10-db` again exactly when `hasEnoughInformation(root, ref).answered` lacks it: the
    first five ask again, only the last moves the screen on. Red today: the screen's id-only
    binding takes the no-digest, other-digest and no-option entries as answered while the gate
    does not.
33. An author's question file never moves a plan by itself, and every one is sent for
    classification. (a) An implementation slice valid for the queue with an author's EMPTY
    file (`[]`, no classification block) → `continueAfterCrossing` leaves it in
    `implementation/` with `sufficiencyReason: 'unclassified'`, queues exactly one `classify`
    task for it (whole-millisecond label), which is in `promote`; its screen line reads "the
    gate critic has not yet checked the questions its author wrote, so it cannot move on by
    itself; it waits for that check or for your approval", and the word `unclassified` appears
    nowhere in the screen text. (b) A functional plan whose author file of two `detail`
    questions the human answered completely through the screen's actions → stays,
    `'unclassified'`, one `classify` task. (c) The gate critic's classified files for the same
    revisions dropped in `pending/` → the next continuation moves (a) to `todo` and (b) to
    `implementation/`, with (b)'s answers still bound (same wording, same stamp), and queues
    no second task. (d) Instead of (c), the `classify` tasks marked failed with nothing written
    → every later continuation leaves both plans where they are and queues nothing; their
    screens still offer the human's own Approve. Red today: there is no continuation and no
    `classify` kind; and on main an author's empty file moves its plan on the next render.

Added on the owner-derived decision of 2026-10-07 (Decision 42):

34. An omission found by the classification stops the plan and reaches the human. An
    implementation slice valid for the queue whose plan text chooses a database ("Sessions are
    stored in PostgreSQL 16.") and whose author file is EMPTY → the continuation queues its
    `classify` task (as in case 33). The file the omission duty produces is then dropped in
    `pending/`: classified, holding the author's empty list plus one added question
    `q10-session-store-r<whole millisecond>` with topic `data-model`, two options (PostgreSQL
    16, recommended, its description citing the plan line; and the alternative), and the same
    case run again with topic `technology-stack` → the next continuation promotes it; the plan
    stays in `implementation/` with `sufficiencyReason: 'open-forks'` and that id in
    `blockingQuestionIds`; no line for it is written under `## Decisions Taken Under
    Ambiguity`; the default screen asks it first, with `Hold this plan`; answering it through
    its screen action moves the plan to `todo`. A second variant: an author file with one
    `detail` question plus the critic's added `data-model` question → after promotion the
    author's question is present with an unchanged digest and is decided by default when the
    plan moves, and the added question blocks until answered. This is the level the code can
    test — the menu's handling of a classified file that holds such a question; the gate
    critic's duty to produce it is held by the new anchors in its compaction inventory
    (`tests/gate-critic-compaction.test.js`). Red today only because `continueAfterCrossing`
    does not exist yet.

`tests/gate-critic-compaction.test.js` with `tests/compaction-eval/gate-critic/rule-inventory.json`
(MODIFY — Decision 42), written first: the added orders and their anchors for the omission
duty, and the replaced orders' `new_anchors`, go into the inventory before the agent text
changes → red: check 4 finds the new anchors missing from the agent file. Green once the
agent text lands, the ceiling rises by the measured overage, `ORDER_FLOOR` and
`KINDS_SHA256` are updated — except check 3, which stays red until the session lists the
order ids in "Agent rules this slice replaces or adds" and re-records the approval.

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
recorded and that the status says "Nothing was recorded" and names the reason. *(Added from
slice 1's third security scan.)* The injected-append-failure case passes `D(q10-db)`, so it
still reaches the append it tests rather than being refused earlier for a missing digest.

Changed existing tests (owner's decisions of 2026-10-07 and slice 1's third security scan;
each tightened to the new contract, none loosened):

- `tests/streaming-gate.test.js`: the three exact answer-action strings (`'stream answer
  functional/rich.md q10-db 1'`, `… q10-db 2`, `'stream answer functional/multi.md q11-auth
  1'`) become the quoted form with the digest (`… 'q10-db' '1' '<D(q10-db)>'`), and the first
  case also asserts `actions['Hold this plan']`. The three places slice 1 left for this slice
  — "answering the LAST fork", "MULTIPLE fork questions" and X6 case 8, each asserting that
  the real writer's answer leaves the plan where it is and then hand-writing the entry "as
  slice 2's writer records it" — now answer through the screen's own actions and assert that
  those answers move the plan; the hand-written entries go.
- `tests/plan-question-screen.test.js`: the exact action `'stream answer
  review/session-expiry.md q01-session-idle-timeout 1'` becomes the quoted form with the
  digest.
- `tests/answers-bind-to-plan-revision.test.js`: `offeredQuestionId` reads the new form
  (`/^stream answer \S+ '([^']+)' '[^']+' '[0-9a-f]{64}'$/`); the two `route(['stream',
  'answer', …])` calls pass the digest the screen offered; case 20 ("an unstampable answer is
  still RECORDED") becomes "an answer that cannot be checked is refused and the human is
  told": nothing appended, status "Nothing was recorded … could not be read … asked again".
- `tests/answer-feeds-sufficiency.test.js` *(from slice 1's third security scan)*: cases a, b
  and d call `streamAnswer` with the digest the screen's action carries (without it they are
  now refused); case a compares against the screen `streamAnswer` now renders; case c drops
  its interim half (the writer's answer moves nothing, then a hand-written entry) and asserts
  that the real writer's answer crosses the plan and that the same return names it.
- `tests/streaming-human-loop-e2e.test.js` *(from slice 1's third security scan)*: cases 6
  and 7 answer through the screen's own actions instead of the hand-written `recordAnswer`
  helper, which is deleted; case 6 asserts that the human's answers move the plan, and its
  interim assertion that they do not is removed. Left as it is, case 6 would still pass —
  for the wrong reason (an answer without a digest is now refused) — and no end-to-end test
  would prove that a human's answer through the menu counts.

- **Case 35 (classification keeps author questions).** An author file with `q10-store` (a detail) and `q11-auth` (security); a gate-critic-classified file for the same plan and revision that (a) drops `q11-auth`, (b) rewords `q11-auth`'s prompt, (c) keeps both unchanged and adds `q12-db` → (a) and (b) are refused with `classification-dropped-author-question` and the author's file stays; (c) is written. Red on today's code.

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
- `HOLD`, `questionDigest` and `goesToHuman` (exported by `src/lib/streaming-precompute.js`)
  are read by `streaming-gate`'s `precomputedQuestionParts`, `holdQuestion`,
  `nextUnansweredQuestion` and `streamAnswer`, and inside `streaming-precompute` by
  `validatePlanQuestions`, `readAnsweredQuestionIds` and `hasEnoughInformation`. `Hold this
  plan`, CTOC's keep-or-release question and every digest-carrying action are rendered on the
  default `/ctoc:start` screen (`richQuestionScreen`) and on `plan <ref>`
  (`planDecisionScreen`); their actions route through `menu-screens.route` `stream answer`
  (which passes the digest on) → `streamAnswer` → `appendAnswerEntry`. Root:
  `src/commands/start.js`.
- The `classify` task is queued by `continueAfterCrossing`, accepted by
  `task-registry.KINDS`, and launched by the session from `promote[]` per the new
  `src/commands/start.md` paragraph. Live today through the existing COMPLETION step 3: a
  `classify` task queued on a `stream answer` or `stream approve` stays in the registry and
  is returned by the next completion's `computePromote`. The session acting on a stream
  screen's own `promote[]` arrives with slice 3's paragraph.
- The omission duty in `agents/iron-loop/gate-critic.md` is live on the gate critic's next
  dispatch for a `classify` task (the path above); the question file it writes reaches the
  live store through the existing sweeper and is read by `hasEnoughInformation` and the
  screens.
- The background-agent rule lives in `bashRefuses` and `decide` of
  `src/hooks/protect-records.js`, the one hook registered in the plugin's `hooks/hooks.json`
  (`PreToolUse`, Bash among its matchers). It runs on every shell call any agent makes.

## Agent rules this slice replaces or adds

The owner decided on 2026-10-07 that the independent gate critic decides what reaches him; the
session derived on the same day that the author must not decide by omission either (Decision
42). These are the compaction-inventory orders this slice may mark replaced or added, and no
others:

- `agents/iron-loop/gate-critic.md` — replaced: R-240, R-251, R-688; added: N-010, N-011, N-012, N-013.

## Acceptance criteria

From the parent table (criteria 1 to 8; 9 and 10 belong to slice 3), with the owner's
decisions of 2026-10-07 and slice 1's third security scan folded in:

- [ ] A question reaches the human only under the five conditions, and only in a file the gate critic classified; every other open question is decided by its recommended option — slice 2 cases 1, 26 (with slice 1's cases).
- [ ] Every decided-by-default question is written into the plan the builder reads, once — cases 1, 11, 26.
- [ ] A plan with a weighty question stays, and that question is asked before any detail — case 2.
- [ ] A human's Hold holds until he releases it; once released, his answer moves the plan on — cases 3, 16, 17, 19, 21, 23 (with slice 1's held cases).
- [ ] Every agent question screen carries CTOC's own "Hold this plan" with the reserved key, never text from the agent's file; every answer action quotes the question id and key and carries the digest of the question shown; `streamAnswer` records `holds: true` for a hold (including the gate ruling's own Hold and Send-back options), `holds: false` for any other answer, and refuses any key that is not one of the question's options or CTOC's own — cases 14, 15, 16, 17, 18, 19.
- [ ] Every answers-log entry `streamAnswer` writes carries `questionDigest`: an answer the digest of the question as the screen showed it, recorded only while that still equals the stored question's digest; every hold, keep and release under `ctoc-hold` CTOC's own `HOLD.digest`, and a release without it releases nothing. A human's answer given through the screen counts at the gate and moves the plan — cases 17, 28, 29, 30, and the end-to-end cases in `tests/streaming-human-loop-e2e.test.js` and `tests/answer-feeds-sufficiency.test.js`.
- [ ] Every append to the answers log starts on a new line, so a torn last line never merges with the entry after it — case 31.
- [ ] The screen's "already answered?" check binds answers exactly as the gate does, so the screen never stops asking a question the gate still counts as open, and never asks one the gate counts as answered — cases 30, 32.
- [ ] A hold is kept under CTOC's stable question id, so a release recorded against any later revision ends it, and a held plan whose original question is gone can still be released from its own screen — cases 17, 20, 23.
- [ ] A held plan says in plain words, on its screen and in the session status, that the owner is holding it and how to release it; nothing crosses it — cases 20, 21, 22.
- [ ] An author's question file — even an empty one, even one whose every question the human answered — never moves a plan by itself, at any crossing; it gets one gate-critic classification task through the continuation, never at menu open, session start or stop; its label is a whole millisecond; the classified file replaces it through the existing sweeper and answers already given still bind; when classification cannot run, the plan stays, every question keeps reaching the human, and its screen says in plain words what it waits for — cases 4, 7, 24, 25, 26, 27, 33.
- [ ] The gate critic's classification reads the plan and its parent plan, adds a classified question for every weighty choice (technology stack, algorithm, data model, security posture, irreversible, cost) the author left unasked — an empty author list included — with a recommended option where the evidence supports one, and never removes or rewords an author's question; such a question stops the plan and is asked like any other weighty question — case 34 and the new anchors in `tests/gate-critic-compaction.test.js`.
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
| Every plan whose author wrote a question file, even an empty one, now costs one gate-critic dispatch (each slice of a decomposed plan has its own file), and each classification now also reads the plan and its parent | Once per question revision; a plan with no question file, a classified file, a hold, or an unreadable answers log gets none; the four-lens fleet still runs only when the human asks |
| The omission duty is an instruction the gate critic follows, not something the code checks: a critic that misses a weighty choice, or drops or rewords an author's question, lets the plan move without that question reaching the human | The duty is held word for word by the anchors in its compaction inventory; the code still refuses to move any plan whose file the critic did not classify; the four-lens fleet, which attacks the plan, is one click away |
| The gate critic's file sits at its byte ceiling, and the omission duty adds text | The ceiling rises only by the measured overage, recorded as one correction in its inventory; contradicted kept orders are replaced, not left beside the new text |
| A gate critic that writes nothing valid leaves the plan where it is, every question with the human | Fail closed, by the owner's decision (a); no automatic retry, because a retry on a plan the critic cannot classify would dispatch without end; the screen says in plain words what the plan waits for |
| A screen rendered before its question was rewritten, or by a session that still carries actions without a digest, gets "Nothing was recorded" | The status sentence says why and that the question will be asked again; the next screen carries the current digest. A hold is never refused for this reason |
| CTOC rewording its own hold question in a later version changes `HOLD.digest`, so releases recorded under the old wording stop counting | The plan reads as held again and asks CTOC's question, which the human answers once — the fail-closed direction |
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
   still blocks (fail closed), and so does an author's file the gate critic has not
   classified, even an empty one (slice 1's `'unclassified'`).
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
    test file, and three test files whose contract he replaced; slice 1's third security scan
    adds two more test files whose interim contract this slice replaces (Decision 41); and the
    owner-derived omission duty adds three — the gate critic's agent file, its rule inventory
    and its compaction test (Decision 42) — each with its reason in `files:`.
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
23. **Quoting.** The id, the key and the digest are wrapped in single quotes; an embedded
    quote is closed, escaped and reopened. The stored values are already plain characters
    (slice 1's validator; the digest is hexadecimal), so quoting is a second wall; the escape
    form would be refused by the records protection (it refuses a backslash in a menu call),
    which is the fail-closed direction. A value that reaches the router still quoted (the
    whole action passed as one string) matches no question and is refused, plainly. The ref
    stays unquoted, as in every other action, because `SAFE_PLAN_FILE` already restricts it.
24. **Hold entries are never answers to the reader either.** Entries under `ctoc-hold` stay
    out of `ids`, `keys` and `unbound` in both binding modes, so a released hold never appears
    in a permanent crossing record as "1 recorded answer did not bind".
25. **After a hold, or a keep, the screen moves past the plan** (`advanceAfter`): showing the
    plan he just held would ask him the same question twice.
26. **Which question a screen asks is the verdict's rule.** CTOC's own question for a held
    plan; otherwise the first that goes to the human by `goesToHuman(question, classified)` —
    the expression `hasEnoughInformation` already uses, exported from one place by slice 1 —
    then the first unanswered. `sufficiencyFor`'s `defaults` likewise take "unanswered and not
    blocking" from the same verdict, so an unclassified file yields no defaults.
27. **The classification trigger is the plan's state, not the sweep that promoted its file.**
    The default screen also sweeps when the menu opens, so "promoted by this sweep" would miss
    files that arrived then. "Once" means one `classify` task per plan per question revision
    (task label `revision-<whole millisecond>`, any status): a failed classification is never
    retried in a loop, and a new question file from the author gets one new task. A held
    plan, or one whose answers log cannot be read, is not classified until its verdict is
    `open-forks` or `unclassified` again. A plan with no question file has nothing to
    classify; an author's empty list is classified like any other (Decision 39, which
    replaces this decision's earlier "a plan with no questions has nothing to classify").
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

From slice 1's third security scan (its Execution Record, "Third security scan — findings and
fixes", and its notes for slice 2):

35. **The answer carries the digest of the question as shown.** "Computed from the question as
    shown to the human" is taken literally: the screen computes `questionDigest` of the
    question it renders and puts it in the action, and `streamAnswer` records the answer only
    while it still equals the stored question's digest, then writes it into the entry.
    Computing it at answer time from the stored file alone would bind a click to whatever the
    file holds by then — and this slice makes files change under an open screen (the
    classified file replaces the author's under the same ids and stamp), so key "1" could name
    another label than the one he read. `questionDigest` is exported now because these are its
    live callers (slice 1 left it unexported for exactly that reason).
36. **Only actions that can let a plan move carry and require the digest.** An answer and a
    release do; `Hold this plan`, the ruling's hold options and `Keep holding this plan` do
    not, because a hold must never be refused for a changed question. Every entry under
    `ctoc-hold` carries `HOLD.digest`, the digest of CTOC's own keep-or-release question; the
    reader releases a hold only on an entry with key `release`, no `holds` other than `false`,
    and that digest, in both binding modes. A hold entry sets the hold with or without it.
    `prompt` moves into `HOLD` so the reader knows that digest without depending on the screen
    module.
37. **The screen binds as the gate does.** `nextUnansweredQuestion` passes the questions to the
    one reader, so both apply the option-key and digest binding. With slice 1's id-only screen
    binding, an entry without a digest made the screen stop asking while the gate still
    counted the question open — the "Recorded your answer" that never moved anything.
38. **A new line before every entry, always.** Each append writes `'\n' + entry + '\n'` in
    one call rather than first reading the log's last byte: there is no window between a read
    and the write, it is one line of code, and the one reader of the log
    (`readAnsweredQuestionIds`) already skips blank lines. The cost is a blank line between
    entries.
39. **An author's question file is sent for classification whatever it holds.** Since slice
    1's third security scan, `'unclassified'` stops a plan whose author file is empty or fully
    answered, so the trigger takes `open-forks` and `unclassified` and no longer requires at
    least one question. Without it, every plan whose author honestly had nothing to ask — the
    common case, now that the product owner and the planner always write a file — would wait
    for the human's Approve. What the classification does with such a file is Decision 42.
40. **The `'unclassified'` reason gets a plain sentence on the screen** instead of the raw
    reason word slice 1's fallback prints (Operating Lesson 13).
41. **Two more test files join `files:`** (`tests/answer-feeds-sufficiency.test.js`,
    `tests/streaming-human-loop-e2e.test.js`): they assert slice 1's interim contract — the
    real writer's answer counts for nothing — and hand-write the entries "as slice 2's writer
    records them". The first breaks once an answer without a digest is refused; the second
    would still pass, for the wrong reason, and leave no end-to-end proof that a human's answer
    through the menu counts. `tests/sufficiency-evidence.test.js` keeps its own hand-written
    entries: it tests the crossing record, not the writer, and passes unchanged.

Owner-derived decision, 2026-10-07 (decided by the session as the direct consequence of the
owner's decision (a) — the independent gate critic decides what reaches him, so the author
must not decide by omission either):

42. **The gate critic's classification also covers what the author left out.** A
    classification reads the plan and its parent plan; besides assigning a topic to every
    author question, it adds a question for every weighty choice — technology stack,
    algorithm, data model, security posture, anything irreversible, a recurring or large cost
    — that the author left unasked, classified with its topic and a recommended option where
    the evidence supports one. An empty author list is classified the same way. It never
    removes or rewords an author's question. The duty lives in the gate critic's
    classification section, so `agents/iron-loop/gate-critic.md`, its rule inventory and its
    compaction test join `files:`; the size ceiling may rise only by the measured overage,
    recorded as a correction. The orders it replaces or adds are listed by the session after
    the build in "Agent rules this slice replaces or adds", and the session re-records the
    approval, as it did for slice 1. The code's part needs no new mechanism: an added question
    carries a weighty topic in a classified file, so slice 1's rule sends it to the human, and
    case 34 tests that path; the critic's duty itself is tested by its inventory anchors.

Taken by the executor while building (2026-10-07):

43. **A built plan with no stored questions is checked for a hold before it finishes.** The
    specification says a held plan never reaches `crossOnEvidence` because its verdict is
    `held`; that is true only when its questions are readable. With none stored the verdict is
    `not-computed`, so `crossOnEvidence` reads the answers log for a hold by the plan's file
    name and stays put on a hold or an unreadable log.
44. **A failed move restores the admission record's bytes instead of deleting it.** "Entry
    and move, or neither" read as: the ledger file goes back to exactly what it was (the
    human's or the sufficiency admission into `todo`); only if that write fails is the entry
    removed, so no record ever names `done` for a plan still in review (cases 8, 8b).
45. **A decided-by-default line is skipped when the whole line is already in the plan**, not
    when its id marker is: question ids are positional and repeat across stages, so a marker
    match would silently drop the next stage's decision. Idempotence holds (case 11).
46. **The decided-by-default questions are written on every pre-build crossing**, including the
    one the default screen makes when it opens (today's behaviour, unchanged), so no crossing
    leaves its decisions unwritten; only the `crossed` list is limited to the continuation.
47. **The evidence string starts with the literal `evidence: review→done — …`**, as the
    specification's backticked text reads.
48. **A build task's `touches` are its files plus the plan's own path** (`taskSpecFromPlan`
    always adds it); case 4 asserts that exact list.
49. **Case 28 reads "the gate counts the answer" off the crossing record** (`1 answered
    (q10-db)` in the sufficiency evidence): the answer moves the plan in the same call, after
    which the old reference has no plan to ask about.
50. **The gate critic's classifying sentence (added order N-007) stays word for word.** The
    inventory checks cannot mark an added order replaced (a replaced order must be listed by a
    baseline unit). The new text says "Besides the author's questions, add …", so the kept
    "wording, ids and options unchanged" reads as governing the author's questions only. R-292
    ("the key is interpolated unstripped into the same `stream answer` command") stays true
    and is unchanged.
51. **R-240, already replaced by slice 1, is re-recorded under this slice**: an order carries
    one `replaced_by`, so its record names this plan, with slice 1's instruction kept in front
    of this slice's.
52. **The continuation returns three more fields** — `reasons` (the named fail-soft reasons),
    `started` (phrases for the one status sentence on the stream screens), `building` (names
    for the completion's "started building" line) — besides the four the specification lists.
53. **Two more `tests/streaming-gate.test.js` cases changed than the three named**: the
    route-wiring writer case and X6 case 8 called the writer without a digest (the replaced
    contract); both now pass the digest and assert it is recorded or that the answer crosses.
54. **End-to-end case 7 answers the first two questions through the screen and stops at the
    fork**, because the screen asks the weighty questions first; the detail stays unanswered,
    which does not change its verdict (`open-forks`, blocking `q12-transport`).
55. **The sweeper logs a refused classification as `invalid-questions`**: it maps every reason
    but `would-replace-classified` to that literal, and the sweeper is not in this slice's
    files. The refusal itself is `classification-dropped-author-question` at the writer.
56. **For a background agent, `menu <anything but commands or task>` and an unknown `inbox`
    sub-command are refused** (fail closed), although today both only render the dashboard.
57. **`README.md`'s test-file count and `.ctoc/golden-corpus-baseline.json` were not edited**:
    both are outside `files:` (see the Execution Record).

## Execution Plan

### Step 8: TEST
- [x] Write `tests/plans-keep-moving-without-the-human.test.js` cases 1–34, the new cases in `tests/protect-records.test.js`, the three changed cases in `tests/streaming-gate-coverage-holes.test.js`, the changed assertions in `tests/streaming-gate.test.js`, `tests/plan-question-screen.test.js`, `tests/answers-bind-to-plan-revision.test.js`, `tests/answer-feeds-sufficiency.test.js` and `tests/streaming-human-loop-e2e.test.js`, and the gate critic's new and replaced orders with their anchors in `tests/compaction-eval/gate-critic/rule-inventory.json`; run; record which are red, and for cases 28–33 also against main.

### Step 9: PREPARE
- [x] Confirm slice 1 is built (the worktree branch `agent-a0b33c6c216a2989c`, commit 83a093f0, including the sweeper's sixth argument `payload.classification`, the `'unclassified'` reason and the digest binding in `readAnsweredQuestionIds`).
- [x] Read `computeSpecHash`'s exclusion list to confirm `## Decisions Taken Under Ambiguity` is excluded.
- [x] Read `agents/iron-loop/gate-critic.md` "Classifying the questions", the structural band and the anti-scope table, so the omission duty and the `start.md` brief match what the critic is told, and list every kept order the duty contradicts.
- [x] Re-read `src/commands/start.js` and `menu-screens.route` and confirm the two route tables still match the code before writing `subagentMayRunRoute`.
- [x] Read `streaming-gate.js` and confirm `hasEnoughInformation` and `nextUnansweredQuestion` are the only callers of `readAnsweredQuestionIds` in `src/`, and `streamAnswer` the only writer of `.ctoc/streaming/answers.jsonl`.
- [x] Record before-numbers: false-green scan count, dead-export count, unreachable-file count, `CLAUDE.md` bytes, the findings in `.ctoc/unexecutable-instruction-baseline.json`, and the gate critic's bytes, `maxBytes`, `ORDER_FLOOR` and `KINDS_SHA256`.

### Step 10: IMPLEMENT
- [x] `src/lib/streaming-precompute.js`, `src/lib/task-registry.js`, `src/lib/streaming-gate.js`, `src/lib/menu-screens.js`, `src/lib/actions.js`, `src/lib/loop-b-driver.js`, `src/commands/start.md`, `agents/iron-loop/gate-critic.md` (with its inventory, ceiling correction, order floor and kinds digest), `src/hooks/protect-records.js`, `docs/ENFORCEMENT.md`, as specified; run the slice 2 tests, `tests/gate-critic-compaction.test.js` and `tests/protect-records.test.js` green (inventory check 3 excepted until the session lists the order ids); report the order ids marked replaced and added.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`: no crossing writes `approved_by`; vision to functional untouched; continuation, the review-to-done crossing and the `classify` queueing unreachable from menu open, session start and stop; no crossing accepts an unclassified file; CTOC's hold labels and descriptions never come from a question file; a hold is released only by `Release the hold` carrying `HOLD.digest`; no held plan can be crossed automatically; every entry the writer appends carries a digest and starts on a new line; the screen and the gate read answers through the same call with the same questions; the gate critic's classification section states the omission duty and no kept order still says a question must trace to a lens or that a classification may only write back the author's questions; the two route tables match the router; every hook decision for a call without `agent_id` is unchanged; no instruction surface contradicts the code.

### Step 12: OPTIMIZE
- [x] One verdict per plan per pass (no second questions read for `defaults`); `startAgent` called only when `nextBuildable` has work; the classification check reads a question status only for plans whose verdict is `open-forks` or `unclassified`; `nextUnansweredQuestion` still makes one status read and one answers read; the digest is computed once per rendered question and once per answer, and `HOLD.digest` once per load; the held line reuses the pending list; the hook's background-agent check runs only when `agent_id` is present; the gate critic's added text is the fewest bytes that state the duty.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: question text appended to plans is single-line, control-stripped and capped; the evidence string carries no command text or secrets; `--continue` cannot be reached by the build agent's documented call, and is refused to any background agent; every generated `stream answer` action quotes the id, the key and the digest; `streamAnswer` writes nothing for a key outside the question's options and CTOC's own, when the question set cannot be read, or when an answer's or a release's digest does not match the question as it stands; a release without `HOLD.digest` releases nothing; a torn last line cannot fuse with the next entry; look-alike CTOC labels are refused on write and read; the gate critic treats the plan and its parent as data when it adds questions, and an added question's id and text pass the same validator; a background agent cannot reach any refused route through a pure call, a compound command or an inline script; the hook's limits are stated in its header and `docs/ENFORCEMENT.md`.

### Step 14: VERIFY
- [x] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct` — after the session has listed the gate critic's order ids and re-recorded the approval (inventory check 3).
- [x] Lint the changed files: zero warnings.
- [x] False-green, dead-export and unreachable counts not higher than the Step 9 numbers (`questionDigest` now has live callers, so its export adds no dead export); `.ctoc/unexecutable-instruction-baseline.json` unchanged and `tests/unexecutable-instruction-fence.test.js` green; `CLAUDE.md` at or under 15,000 bytes; the gate critic's `maxBytes` raised by no more than the measured overage, with one recorded correction.
- [ ] An existing test outside `files:` that fails because it asserts a replaced contract (a review plan with a passing record stays pending; an unquoted answer action or one without a digest; an answer that cannot be checked is recorded; the menu writer's answer counts for nothing; the gate ruling's Hold or Send-back option moves the plan; a three-option question also asks Skip and Open; a background agent's menu call is allowed) is reported through `src/lib/scope-growth.js`, never edited outside `files:`.

### Step 15: DOCUMENT
- [x] JSDoc on every changed function, including `HOLD` (with `prompt` and `digest`), the `questionDigest` export and its two callers, `appendAnswerEntry`, `goesToHuman`'s new caller, `holdQuestion`, the `classify` kind, `'held'` and `'unclassified'` in `sufficiencyLine`, and the hook's new internal functions.
- [x] Update the test-file count in `CLAUDE.md` for the new test file (Decision 11); `tests/doc-counts.test.js` green.

### Step 16: FINAL-REVIEW
- [ ] The main session (a background agent is now refused these routes) drives a scratch project through the real routes and shows the owner, in full: one plan from an approved functional plan to done (every ledger entry, every status line, the Decisions block written into the plan); one answer given through the screen's own action, its answers-log entry with the digest, and the plan moving on because of it; one action kept from a screen whose question was then rewritten, refused with the sentence shown; one author question file — and one author's empty file whose plan chooses a database — from arrival to its `classify` task in `promote`, the screen line while it waits, the classified file swept in (with the critic's added question for the database choice, asked first), and the plan moving on once answered; one Hold — the screen after it, CTOC's keep-or-release question after the plan's questions are regenerated, the session status line, the answers-log entries with `HOLD.digest` — and its release; one background agent's `stream answer` refused, with the sentence it was shown.
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria above.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

Executor run of 2026-10-07 in the worktree branch `worktree-agent-a0b33c6c216a2989c`, on slice 1
(83a093f0). Specification hash before any edit: 6d1f9079b1b817fd… (equal to the approval record).

### Step 8 — written first, run red

| File | Red run on the slice-1 code |
|---|---|
| `tests/plans-keep-moving-without-the-human.test.js` (new, cases 1–35, 37 tests) | 34 fail, 3 pass — the passing three are the guards 10, 13 and 25 (green before, as designed) |
| `tests/protect-records.test.js` (new cases 74–81) | 74, 77, 79, 81 fail; 75, 76, 78, 80 pass (guards) |
| `tests/streaming-gate.test.js` | 5 fail: the quoted action with digest and Hold, the two "answer crosses" cases, X6 case 8, the route-wiring writer case |
| `tests/streaming-gate-coverage-holes.test.js` | 1 fail (the refused unreadable answer); the renamed empty-list case and the append-failure case pass |
| `tests/plan-question-screen.test.js` | 1 fail (quoted action with digest) |
| `tests/answers-bind-to-plan-revision.test.js` | 5 fail: 14–17 (the action shape), 20 (refused, not recorded) |
| `tests/answer-feeds-sufficiency.test.js` | 1 fail (case c: the writer's answer crosses) |
| `tests/streaming-human-loop-e2e.test.js` | 2 fail (answers through the screen count) |
| `tests/gate-critic-compaction.test.js` with the inventory | checks 3, 4, 10 fail (new anchors absent; check 3 also for the order ids) |

Cases 28–33 run against `main`'s source (archived into a scratch folder): all six red.

### Step 9 — prepared

Slice 1 confirmed on 83a093f0 (the sweeper's sixth argument, `'unclassified'`, the digest
binding). `## Decisions Taken Under Ambiguity` is in `EXECUTION_SECTION_PRODUCERS` (excluded;
checkbox lines too). `readAnsweredQuestionIds` has exactly two callers in `src/`
(`hasEnoughInformation`, `nextUnansweredQuestion`); `streamAnswer` is the only writer of the
answers log. Both route tables re-checked against `start.js` (`main`: no residual arguments →
`streamingGateScreen`; otherwise `extractLiveAgentIds` then `splitCliArgs` then `route`) and
`menu-screens.route`: the dashboard, `inbox …`, `browse`, `section`, `stubs`, `validate`,
`tasks`, `task` reach no crossing function; `plan <ref>` only sweeps the waiting folder.
Before-numbers: false-green 207, dead exports 65, unreachable files 17, unexecutable debt 15,
`CLAUDE.md` 14,952 bytes, gate critic 137,962 bytes = `maxBytes` 137,962, `ORDER_FLOOR` 590,
`KINDS_SHA256` ba0606ed….

### Step 10 — green per file (after the build)

`plans-keep-moving-without-the-human` 38/38 (case 8b added for the ledger-restore failure),
`protect-records` 81/81, `streaming-gate` 63/63, `streaming-gate-coverage-holes` 8/8,
`plan-question-screen` 17/17, `answers-bind-to-plan-revision` 23/23, `answer-feeds-sufficiency`
4/4, `streaming-human-loop-e2e` 2/2, `streaming-precompute` 61/61, `sufficiency-evidence` 13/13,
`streaming-questions-sweeper` 34/34; `gate-critic-compaction` 16/17 (check 3, expected).
Two mutants run by hand were caught: dropping the release-digest test in the reader turns
case 30 red; dropping `passesValidation` from the review crossing turns case 7 red.

**Route tables as built** (`subagentMayRunRoute`, after `menuRouteArgs`): allowed — `menu`;
`menu commands`; `menu task add|start|fail|cancel|list|board …`; `menu task complete …`
without `--continue`; `dashboard`; `tasks`; `task …`; `browse …`; `section …`; `stubs …`;
`validate …`; `inbox questions|decisions|gates|escalations|migration|verify|stale|cleanup …`;
`plan <ref>`. Everything else is refused to a background agent: no arguments or only
`--live-agent-ids`, every `stream …`, bare `plan`, `menu task complete … --continue`, `menu`
with any other second word, an unknown `inbox` sub-command, any unknown first word. Outside a
pure call: a segment running a JavaScript runtime on a script ending `start.js` with a refused
route, or an inline script naming `menu-screens`, `streaming-gate`, `continueAfterCrossing` or
`approveSubplans`.

**Gate critic orders** — replaced: R-240 (the answer command now
`stream answer <ref> '<id>' '<key>' '<digest>'`; re-recorded under this slice, slice 1's
instruction kept), R-251 (the structural band's "only exceptions" now "in a synthesis", plus
the classification's plan-line trace), R-688 (the anti-scope row). Added: N-010 (read the plan
and its parent plan), N-011 (add a classified question for every weighty choice left unasked;
two anchors, the second on the added ids), N-012 (an empty author list classified the same
way), N-013 (never remove, reword or renumber an author's question). Units 251 and 688 marked
`replaced`. With the ids listed on the approved line and the approval re-recorded (simulated
in a scratch copy), all ten inventory checks pass.

**Bytes:** gate critic 137,962 → 139,524; `maxBytes` raised by the measured overage of 1,562,
one more `ceiling_corrections` entry. `ORDER_FLOOR` 590 → 594. `KINDS_SHA256` re-checked: only
fates changed, so the digest of the `n:kind` lines is unchanged (ba0606ed…).

**Hook time per call** (median of 7 spawned runs, this machine): main session `ls` 23 ms,
background agent `ls` 24 ms, main session `stream answer` 25 ms, background agent
`stream answer` (refused) 26 ms, background agent `menu task complete` 26 ms.

### Step 14 — VERIFY

Lint (`eslint --max-warnings 0`) on every changed JavaScript file: zero warnings. `tsc
--checkJs`: 0 errors. False-green 207 (not higher; the first full run found two empty catches
in `crossOnEvidence`, fixed), dead exports and unreachable files within their baselines
(`HOLD`, `questionDigest`, `continueAfterCrossing`, `recordDeployReadyNotice`, `summarize` each
have a live caller), unexecutable-instruction baseline unchanged (`classify` is documented in
`start.md`), `CLAUDE.md` 14,952 bytes (count 563 → 564 by `release.js`).

Full `npm test` (second run, after the fixes from the first): tests 12665, pass 12661, fail 4,
cancelled 0, skipped 0; coverage 99.87% (floor 99). The four:

1. `tests/gate-critic-compaction.test.js` check 3 — expected: the order ids are not yet on the
   approved line for `agents/iron-loop/gate-critic.md`.
2. `tests/question-blocking-default.test.js` case 50 — the same cause (it runs check 3 on the
   real inventories); green once the line is filled.
3. `tests/golden-corpus-fence.test.js` "the baseline is exact" — unclaimed progress: the
   finding `task-registry::src/lib/menu-screens.js` is gone (live 5, baseline 6); the ratchet
   wants `.ctoc/golden-corpus-baseline.json` lowered to 5 with that key dropped. Outside
   `files:`; not edited.
4. `tests/readme-numbers.test.js` — `README.md` says 563 test files; this slice creates one.
   `release.js` updates it to 564, but `README.md` is outside `files:`; reverted, not edited.
   Both edits were made in a scratch state and both tests then passed (62/62, 20/20).

Uncovered new lines (fail-soft paths only): the continuation's sweep, crossing-pass and start
failures and the plan-name fallback; `appendDefaultDecisions`' write failure; the inner
`removeEntry` failure after a failed restore; the outer catch of `crossOnEvidence`.

### Not verified

- A real Claude Code payload with `agent_id` was not captured here; the rule relies on the
  coordinator's verification (Decision 16).
- A claimed build task returned in `promote` is already `running`; whether the session's
  `menu task start <id>` on it is accepted is slice 3's recipe and was not exercised.
- No CHANGELOG exists in `files:`; none was written.

### Step 14 — final run (after the session listed the order ids and re-recorded the approval)

The session filled the approved rule line (replaced R-240, R-251, R-688; added N-010–N-013),
added `README.md` and `.ctoc/golden-corpus-baseline.json` to `files:`, and re-recorded the
approval (specification hash 5ad76fe4…, verified equal to this copy before any edit). Then:
`.ctoc/golden-corpus-baseline.json` lowered to `maxFindings` 5 with
`task-registry::src/lib/menu-screens.js` dropped; `release.js` wrote 564 test files into
`README.md` (VERSION unchanged, 6.14.118).

Full `npm test` (once, foreground): tests 12665, pass 12665, fail 0, cancelled 0, skipped 0,
todo 0; coverage 99.88% (floor 99); `[CTOC test-gate] PASS`.

---
iron_loop_verdict: true
iron_loop: true
title: "Only weighty questions reach the human, and his answer holds"
type: implementation
created: 2026-10-07
priority: high
effort: medium
parent_plan: ctoc-keeps-working-and-asks-only-what-matters
depends_on: the-approval-and-check-records-are-write-protected
files:
  - src/lib/streaming-precompute.js
  - tests/question-blocking-default.test.js
  - agents/iron-loop/gate-critic.md
  - agents/planning/product-owner.md
  - agents/planning/implementation-planner.md
  # Added 2026-10-07 by the session under the owner's standing instruction: the rules this slice replaces are held word for word by the compaction inventories
  - tests/compaction-eval/inventory-checks.js
  - tests/compaction-eval/gate-critic/rule-inventory.json
  - tests/compaction-eval/product-owner/rule-inventory.json
  - tests/compaction-eval/implementation-planner/rule-inventory.json
approved_by: human
approved_at: 2026-10-07T08:53:43.148Z
gate_crossed: implementation → todo
---

# Only weighty questions reach the human, and his answer holds

Slice 1 of 3 of `plans/functional/ctoc-keeps-working-and-asks-only-what-matters.md`. The
specification, tests, criteria, risks and decisions below are copied from that plan; only the
slicing notes under "Decisions Taken Under Ambiguity" are new.

## What the owner asked

> "i am trying to hide the hooks so the llm thinks and ask usefull questions to the user do
> not bother the user with gates only with questions of high uncertainty or huge importance
> (like tech stack or algorithms)" — and — "optimize the shit out of ctoc" (2026-10-06)

## Problem statement

What stops a plan today, verified in the code (items 1, 2 and 5 of the parent; the others
belong to slices 2 and 3):

1. **A plan with no stored questions never moves.** `hasEnoughInformation`
   (`src/lib/streaming-precompute.js`) returns `enough: false, reason: 'not-computed'` until a
   question file exists, and since v6.14.93 questions are generated only when the human
   chooses "Generate its questions". The product owner and the implementation planner are
   told to call `writePlanQuestions`, but neither holds a shell tool
   (`tools: Read, Write, Glob, Edit, Grep`), so that order cannot be carried out.
2. **A "strong preference" stops the plan like a real fork.** `isBlockingQuestion` treats every
   question except one marked both not critical and not important as blocking, so a detail the
   critique judged "important" waits for the human exactly like a technology-stack choice.
5. **A human's "Hold" does not hold.** `hasEnoughInformation` counts a question as answered
   whatever option was chosen, so answering the gate ruling with "Hold" lets the plan cross on
   the next render. Harmless while a human approved every crossing; dangerous once crossings
   are automatic.

## Technical approach

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

**Questions without an extra dispatch.** The agent that writes a plan also writes its
questions, as its last act, into the existing quarantine
(`.ctoc/streaming/questions/pending/<stage>__<file>.md.json`) with its Write tool; the
existing sweeper validates and promotes it and stamps the plan's own time. The adversarial
four-lens fleet still runs only when the human asks.

## Specification

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

## Test plan — `tests/question-blocking-default.test.js` (MODIFY — the owner replaced the contract)

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

## Wiring — the live call sites

- `isBlockingQuestion` and the new `held` verdict are read by `hasEnoughInformation`, which
  `streaming-gate.sufficiencyFor` calls; `pendingGateDecisions` reaches that from the default
  `/ctoc:start` screen (`streamingGateScreen`) and from `stream answer`. Root: the shipped
  slash command `src/commands/start.js`.
- `validatePlanQuestions` runs inside `writePlanQuestions`, which the quarantine sweeper
  (`streaming-questions-sweeper.promotePendingFile`) calls when `streaming-gate` sweeps
  `pending/` on the same menu paths.
- The three agent files are live on their next dispatch by the CTO Chief. The pending file
  each one writes is promoted by the sweeper above.

## Acceptance criteria

- [ ] A question reaches the human only under the five conditions; every other open question is decided by its recommended option. Proven here by the slice 1 cases (parent criterion 1; its end-to-end half, slice 2 case 1, belongs to slice 2).
- [ ] A human's Hold holds; his other answer moves the plan on. Proven here by the held cases: the `holds:true` answer gives `reason: 'held'`, the other answer gives `enough: true` (parent criterion 4; its screen half, slice 2 case 3, belongs to slice 2).
- [ ] The gate critic, the product owner and the implementation planner say what the code now does: `topic` and its definitions, `holds`, the no-recommendation exception, the quarantine write as the last act, and every stack, algorithm, data-model, security, irreversible or costly choice raised as a question (this slice's share of parent criterion 9; checked at Step 11 and Step 16).

## Risks

| Risk | Mitigation |
|---|---|
| Hooks are off, so any agent with Write can write a passing check record or a ledger entry | This slice depends on `the-approval-and-check-records-are-write-protected` (the owner's decision of 2026-10-07: load only the two write protections) |
| The author critiques its own plan when it writes the questions | Every stack, algorithm, data-model, security, irreversible or costly choice must be a question; the four-lens fleet is one click away; the evidence string records "attested by: not recorded" as today |
| Queued agent-improvement slices (for example s35 implementation-planner, s37 product-owner) rewrite the same agent files | The scheduler serializes by file; Step 11 checks that whichever lands second keeps the other's text |
| Coverage floor 99% and the false-green fence | Every new branch has a case above; no empty catch block — each records a named reason |

## Decisions Taken Under Ambiguity

Copied from the parent:

1. **Optional `topic`, legacy reading for its absence.** Making it mandatory would turn every
   stored question file invalid on read and stall every plan; an important question without
   a topic keeps blocking, so absence never waves anything through.
2. **High uncertainty is "no single recommended answer"** — derived from a field the
   critique already emits, so no new self-reported confidence number is trusted.
6. **Questions are written by the authoring agent through the quarantine** rather than by
   auto-running the four-lens fleet: zero extra dispatches, consistent with "no unasked work",
   and the only write path those agents' tools allow.

New, from slicing:

10. **The slice keeps the parent's boundary** (five files, above the planner's usual one to
    three), because the brief said to cut along the slices the parent already defines. The
    module and its test stay together; the three agent files are the instruction half of the
    same rule.
11. **Depends on the protection plan.** The parent now depends on
    `the-approval-and-check-records-are-write-protected`, and this is the first slice to build.

## Execution Plan

### Step 8: TEST
- [x] Write the new and changed cases in `tests/question-blocking-default.test.js`; run; record which are red.

### Step 9: PREPARE
- [x] Confirm `the-approval-and-check-records-are-write-protected` is built.
- [x] Record before-numbers: false-green scan count, dead-export count, unreachable-file count, `CLAUDE.md` bytes.

### Step 10: IMPLEMENT
- [x] `src/lib/streaming-precompute.js`, `agents/iron-loop/gate-critic.md`, `agents/planning/product-owner.md`, `agents/planning/implementation-planner.md`, as specified; run the slice 1 tests green.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`: the five conditions match the table exactly and in order; no instruction surface in this slice contradicts the code; whichever queued agent-improvement slice lands second keeps the other's text.

### Step 12: OPTIMIZE
- [x] `isBlockingQuestion` stays a pure check of the question object with no file read; `held` is computed from the answers already read for `answered`, with no second read of the answer log.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: an unknown `topic` or a non-boolean `holds` is refused on write and on read; the error names the question id sanitized; a malformed question still blocks (condition 1).

### Step 14: VERIFY
- [x] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [x] Lint the changed files: zero warnings.
- [x] False-green, dead-export and unreachable counts not higher than the Step 9 numbers.
- [x] An existing test that fails because it asserts the replaced contract (a "Hold" crosses) is reported through `src/lib/scope-growth.js`, never edited outside `files:`.

### Step 15: DOCUMENT
- [x] JSDoc on every changed function in `src/lib/streaming-precompute.js`, including the `'held'` reason.

### Step 16: FINAL-REVIEW
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria above; each box quotes its evidence.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [ ] Create directories/config if needed

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
- [ ] Optimize critical paths
- [ ] Simplify complex code

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
- [ ] Update CHANGELOG if needed

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

Executor run of 2026-10-07, worktree branch, in two passes. Pass 1 built the code half and
stopped at a fork (recorded below as it was). The session then widened `files:` with the four
compaction-inventory files (approval re-recorded, specification hash f6a476234385e6dc…, matched
after the frontmatter edit) and set the design for the agent half; pass 2 built it. Steps 11, 13
and 16 are left for the session's dedicated critic and security scan.

### What landed

- `src/lib/streaming-precompute.js`: frozen `HIGH_STAKES_TOPICS` / `QUESTION_TOPICS` (not
  exported); `validatePlanQuestions` refuses an unknown `topic` (error names the sanitized
  question id and lists the allowed values) and a non-boolean `holds`; `isBlockingQuestion`
  is the five conditions in order; `readAnsweredQuestionIds` returns `keys: Map<questionId,
  optionKey>` (`optionKey`, else `answer`; later line wins; empty Map on every closed path);
  `hasEnoughInformation` returns `reason: 'held'` with `blocking` = the held questions, before
  the open-fork check, computed from the same single read of the answers log. JSDoc updated,
  `'held'` documented in the reason list.
- `tests/question-blocking-default.test.js`: case 3 now carries `recommended: true` on option
  A; new cases 3b, 14-29 (with 20b).

### Red before, green after (Step 8 then Step 10)

Red run on the unchanged module: 31 tests, 20 pass, 11 fail. Red: 3b (no recommendation
blocks), 14 (important + detail does not block), 15 (six high-stakes topics block), 20
(non-array options block), 21, 22, 23 (unknown topic / non-boolean holds refused on write
and on read), 25 (three detail questions are enough), 26 (holds answer gives 'held'),
28 (older log shape and later line), 29 (`keys` Map). Green on the old code as intended
guards: 16, 17, 18, 19, 24, 27. Case 20b was added during Step 10 (fail-closed on an unknown
topic reaching the predicate directly). Green run after Step 10: 32 tests, 32 pass, 0 fail.

### Step 9 before-numbers (baselines the fences enforce)

False-green `maxFindings` 207; dead exports `maxDead` 65; unreachable files `maxUnreachable`
17; `CLAUDE.md` 14,952 bytes. The fences ran inside `npm test` and passed, so none rose.
`the-approval-and-check-records-are-write-protected` is on the base commit (00a64b10).

### Step 14

`npm test` (once, foreground): tests 12586, pass 12586, fail 0, skipped 0, cancelled 0;
coverage 99.9% (floor 99); `streaming-precompute.js` 100% line, 98.87% branch, 100% functions;
`[CTOC test-gate] PASS`. Lint on both changed files: zero warnings. No existing test failed
on the replaced contract, so no scope-growth report was needed for that item.

### Pass 1 stop (resolved by the session's scope widening): the agent half could not be built inside the original `files:`

All three agent files sit EXACTLY at their byte ceiling (`maxBytes` in
`tests/compaction-eval/<agent>/rule-inventory.json`), and the sentences this plan says to
replace or change are inventoried rules that check 9 ("every unit marked kept appears word for
word") and check 4/10 (anchors present, exactly once) hold verbatim. The inventories are not in
`files:`.

| Agent file | Bytes now | Ceiling | Editable bytes outside kept units and anchors | What the plan needs |
|---|---|---|---|---|
| `agents/iron-loop/gate-critic.md` | 134,683 | 134,683 | 961 | about 1,200-1,500 bytes of additions (topic definitions, holds, Rule 8, the no-recommendation exception, checklist); Rule 8's first sentence is kept unit 485 and cannot be reworded |
| `agents/planning/product-owner.md` | 30,203 | 30,203 | 1,795 | replace "Writing questions to the streaming store" — all 13 of its units are kept orders R-411..R-423 |
| `agents/planning/implementation-planner.md` | 27,019 | 27,019 | 784 | replace the same section — all 13 units are kept orders R-307..R-319 |

Also pinned outside `files:`: `tests/session-start-question-dispatch.test.js` case 3 requires
both planning agents to name `writePlanQuestions` (satisfiable by the new text).

The files that would have to join `files:` (forced by the section replacement in
`agents/planning/product-owner.md` and `agents/planning/implementation-planner.md`, and by
Rule 8 in `agents/iron-loop/gate-critic.md`; acceptance criterion 3 cannot be met without
them): `tests/compaction-eval/gate-critic/rule-inventory.json`,
`tests/compaction-eval/product-owner/rule-inventory.json`,
`tests/compaction-eval/implementation-planner/rule-inventory.json` — to re-anchor the replaced
orders to their new text and to raise the gate critic's ceiling by the measured addition. If
refused: the code rule ships, but the three agents keep telling producers that every
`important` question blocks, never emit `topic` or `holds`, and the product owner and planner
keep an order to call a function they hold no tool to call.

### Pass 2 — the agent half

**A rule the owner replaced is recorded, never silently dropped.**
`tests/compaction-eval/inventory-checks.js` gains a fourth way an order ends: `fate: "replaced"`,
allowed only with a complete `replaced_by` record (`instruction`, `date` YYYY-MM-DD, `plan`,
non-empty `new_anchors`); the old `anchors` stay as history. Still exactly ten checks: check 3
refuses an incomplete record, an unknown order fate, a unit marked `replaced` that carries no
replaced order, and a `kept` unit that carries one; check 4 holds a replaced order to its new
anchors in its section AND fails if any old anchor is still in the agent; checks 8 and 10 run on
the new anchors. Inventory paths now resolve with `path.resolve` (absolute fixture paths work;
every relative path resolves as before).

Red/green for it (cases 30-34 in `tests/question-blocking-default.test.js`): before the change,
30 and 31 were red (2 of 37 failing); 32, 33 and 34 passed only vacuously, because an absolute
fixture path made every check fail. After: 37 of 37 pass. One expectation of my own (case 31's
silently rewritten kept rule) first named checks 4, 8, 9; the run showed 4, 9, 10, which is the
correct behaviour (a missing anchor is already reported by check 4, so check 8 has nothing
silent; check 10 counts it zero times). Corrected to 4, 9, 10.

**Agents, bytes against ceilings:**

| Agent file | Before | After | Ceiling before | Ceiling after |
|---|---|---|---|---|
| `agents/iron-loop/gate-critic.md` | 134,683 | 136,327 | 134,683 | 136,327 (`ceiling_corrections`: 2026-10-07, 134,683 to 136,327, measured overage 1,644) |
| `agents/planning/product-owner.md` | 30,203 | 30,133 | 30,203 | 30,203 (unchanged) |
| `agents/planning/implementation-planner.md` | 27,019 | 26,973 | 27,019 | 27,019 (unchanged) |

No earlier `ceiling_corrections` entry existed anywhere in the repository, so the form is the one
the session specified: `{ date, from, to, reason }`.

**Orders marked replaced** (each with the owner's words of 2026-10-06, the plan's instruction,
date 2026-10-07 and this plan's slug):
- gate critic: R-339 (ambiguous evidence: two options, none recommended), R-437 (exactly one
  recommended, except that case), R-485 (Rule 8: Approve when no surviving question goes to the
  human; an important `detail` finding no longer holds the plan), R-591 (option keys include
  `holds`).
- product owner: R-414, R-415, R-416, R-417, R-418, R-419, R-420, R-423.
- implementation planner: R-310, R-311, R-312, R-313, R-314, R-315, R-316, R-319.

Added to the gate critic without replacing any order: rule 4a (every finding question carries
`topic`, with the seven definitions copied from this plan; the ruling and `q98` carry none; the
five routing conditions in words; `holds: true` means "do not move this plan"); a sentence in
rule 10 putting `holds: true` on the ruling's Hold and Reject options and on rule 9's
`Hold until the <lens> critique runs`; and an insertion in the pre-emit checklist after its first
anchor (which stays whole): a finding question also carries `topic`, `holds` is an optional
boolean option field.

Kept verbatim in both planning agents: the heading, R-412/R-308 and R-413/R-309 (the dispatch-
brief sentences, pinned by `tests/session-start-question-dispatch.test.js`), R-421/R-317 and
R-422/R-318 (empty array is honest; never invent a question). `writePlanQuestions` and
`streaming-precompute` stay named in both.

Full `npm test` (pass 2, once, foreground): tests 12591, pass 12591, fail 0, skipped 0,
cancelled 0; coverage 99.89% (floor 99); `[CTOC test-gate] PASS`. Lint on the three changed
JavaScript files: zero warnings.

### Fix round (Step 11 critic: ship after; Step 13 security scan: block)

Test-first evidence: the new and changed cases were run against the module and the inventory
checks as they stood at commit 7a9caec7 (saved copies) before the fix took effect: 13 of 46
slice cases red for A and B (22, 24b, 24c, 24d, 24e, 24f, 26, 27b, 27c, 28, 29, 29b, 29c), and
all six inventory cases red for C (30-35). After the fix: 47 of 47 pass.

Full `npm test` on the fix round: tests 12601, pass 12600, fail 1, skipped 0; coverage 99.9%.
The one failure is `tests/streaming-precompute.test.js` "an unreadable answers log does NOT
deadlock a plan with no forks", which asserts exactly the contract finding A replaces (an
unreadable log let a plan with only details through). Per Step 14 it is reported here and was
not edited (outside `files:`). Inventory paths may also point under `skills/` (the
hallucination-detector and llm-security-tester method inventories hold skill files); anything
else fails every check.

| Finding | Test | Result |
|---|---|---|
| A. A hold was read from the author's question file (bypasses 1a/1b/1c) | 22 (any `holds` on an option is refused), 26, 27 (the same answer without `holds` moves the plan on), 27b (a hold outlives its revision and the plan's stage), 27c (a hold on a question the revision no longer has still holds), 28 (only a later answer releases; a line with no answer releases nothing; older log shape), 29 | Fixed: `hasEnoughInformation` reads a hold only from the answers log — the latest entry with a recorded key for this plan (matched by file name, any revision) and question decides; the validator refuses `holds` |
| A. An unreadable answers log let a plan with only details through | 29c | Fixed: any question + unreadable log gives `answers-unreadable`; a plan with no questions still moves. The two comments that said otherwise are rewritten |
| A. An answer naming no option counted as answered | 29b | Fixed when the questions are known (`hasEnoughInformation` passes them); such an entry is counted in `unbound` |
| B. Invisible and direction-changing characters in human-visible text | 24c | Fixed: refused in prompt, label, pros, cons, description |
| B. Labels the human cannot tell apart | 24d | Fixed: unique after control-strip, trim, lower-case |
| B. More than three options | 24e | Fixed |
| B. A weighty single option with no recommendation decided by default | 24f | Fixed: refused; on a detail it stays a notice |
| B. A topic on the gate ruling or coverage notice could make the ruling a decided detail | 24, 24b | Fixed: the two reserved ids carry no topic; a look-alike id is ordinary |
| B. `topic` required; option key `^[1-3]$`; question id `q<NN>-<kebab>` | — | NOT LANDED here: see "Fork" below |
| C. `replaced` records were self-asserted | 32 (fourteen exact failing-check lists: no record, empty instruction, empty anchors, bad date, impossible date, future date, unknown fate, unit/order mismatch both ways, missing plan, climbing plan path, no approval record, plan not naming the order, new anchor already in the baseline) | Fixed in `inventory-checks.js`, still ten checks |
| C. An old sentence could survive beside its replacement | 33 | Fixed: every old sentence must be gone or inside a new anchor |
| C. The agent path could point anywhere | 34 | Fixed: must resolve under `agents/`; otherwise all ten checks fail |
| C. New rules had no inventory | 35 | Added fate `added` with an `added_by` record; N-001..N-005 pin rule 4a's definitions, the no-topic sentence, the routing sentence, the tie-break sentence and the checklist clause |
| D. Agent text | the three inventories (orders below) | Done, see below |

Gate critic orders replaced: R-339 (ambiguous evidence, now with its leftover sentence in the
new anchor), R-437, R-485 (new anchor is the whole rule 8 paragraph, so its kept DEFENSE sentence
stands inside it), R-486 (findings that go to no human are decided by their recommendation),
R-538 ("unresolved" added), R-569 (no more "batch-approves it in one keystroke"), R-586 (template
JSON gains `topic`), R-588 (which flags are required, said exactly), R-636 (worked example gains
`topic: "detail"`). R-591 is back to its original words and to `kept` (no `holds`). Added:
N-001, N-002, N-003, N-004, N-005. Removed from all three agents: every mention of `holds` (the
hold is the human's answer, recorded by CTOC; slice 2 writes it). Rule 4a's `data-model` is
narrowed to persisted data shapes and interfaces outside code depends on, here and in the
frozen list's comment. Product owner: R-414, R-415, R-416, R-417, R-418, R-419, R-420, R-423.
Implementation planner: R-310, R-311, R-312, R-313, R-314, R-315, R-316, R-319.

Bytes after the fix round: gate critic 136,483 (ceiling raised 134,683 to 136,483 by the
measured overage, one `ceiling_corrections` entry); product owner 30,113 of 30,203; planner
26,953 of 27,019.

E. Recorded: in this round the topic was still the author's own label. The owner's decision of
2026-10-07 on who assigns it is recorded under "Decisions Taken Under Ambiguity".

### Fork: what the fix round and the owner's decision need outside `files:`

Three strictness rules of finding B (topic REQUIRED, option key `^[1-3]$`, question id
`q<NN>-<kebab>`) and the owner's decision (topics decide only in a file the gate critic
classified; an unclassified file blocks every question) were built and measured. Both change
the stored-question contract that test fixtures outside this slice encode (keys `a`/`b`, ids
`q1`/`q10`, no topic, no classification, details expected to move on). Measured with the full
suite: topic required plus classification gating fails 116 tests in 17 files outside `files:` —
`tests/streaming-precompute.test.js` (21), `tests/answers-bind-to-plan-revision.test.js` (20),
`tests/streaming-gate.test.js` (16), `tests/streaming-questions-sweeper.test.js` (7),
`tests/attestation-round-trip.test.js` (6), `tests/real-question-file-render.test.js` (5),
`tests/questions-attestation.test.js` (4), `tests/sufficiency-evidence.test.js` (2),
`tests/streaming-human-loop-e2e.test.js` (2), `tests/streaming-gate-coverage-holes.test.js` (2),
`tests/plan-question-screen.test.js` (2), `tests/answer-feeds-sufficiency.test.js` (2),
`tests/sufficiency-audit.test.js` (1), `tests/menu-critique-first.test.js` (1),
`tests/golden-corpus-fence.test.js` (1), `tests/gate-critic-compaction.test.js` (contract
fixtures, 1). Classification gating alone (topic optional) still fails tests in
`tests/streaming-precompute.test.js` (4), `tests/streaming-gate.test.js` (1) and
`tests/answers-bind-to-plan-revision.test.js` (1). The stored question files would also read
invalid: 2 in this repository, 15 in the main checkout's `.ctoc/streaming/questions/`. The live
promotion path also needs one line outside `files:`: `src/lib/streaming-questions-sweeper.js`
must pass `payload.classification` to `writePlanQuestions` (sixth argument), or no promoted file
can ever be classified.

### Decisions taken under ambiguity (executor)

1. The test plan's "Case 6" is the file's case 3 (the only case asserting a two-option,
   none-recommended, both-false question does not block); the fixture change was applied there.
2. A question whose `options` is not an array, or whose `topic` is outside the closed list,
   is malformed under condition 1 and blocks (fail closed), even when called directly
   without the read-side validation.
3. The unknown-topic error lists the allowed values but does not echo the producer's value.
4. Until slice 2 lands, the gate screen renders `'held'` through its fallback as
   "Enough information: NO — held." and does not cross the plan by itself.
5. Decisions are recorded here, not in the plan's own "Decisions Taken Under Ambiguity", so the
   approved body is unchanged.
6. The specification says the menu "refuses the file if the plan changed afterwards". The
   sweeper checks supersession only when a `planMtimeMs` is present, and the agents write none,
   so the agent text says only what is true: the sweeper validates through `writePlanQuestions`
   and stamps the plan's own time. A plan changed after promotion reads its questions as stale.
7. The inventory-checks cases live in `tests/question-blocking-default.test.js`, the only test
   file in `files:`; `tests/compaction-eval.test.js` pins exactly ten checks, so the replaced
   fate was folded into checks 3, 4, 8 and 10 rather than added as an eleventh.
8. Rule 8's second sentence (R-486, "Surviving `normal` findings do not block Approve — they are
   tie-breakers the human rules on individually …") and the Hold line of rule 10 (R-532, "one or
   more `important` findings survived deduplication unresolved") were NOT replaced: the
   specification names neither, and the new Rule 8 defines an important `detail` finding as
   resolved "here and in rule 10". Step 11 should judge whether R-486's "the human rules on
   individually" still reads true now that such questions are decided by their recommendation.
9. R-588 ("`critical`, `important`, and `recommended` are optional booleans") was already wrong
   before this slice (the two flags are required) and is not in the specification; left as is.
10. The worked-example and template JSON blocks (kept units) carry no `topic`; changing them is
    not in the specification. Rule 4a and the checklist state the field.
11. For bytes, rule 4a's "that is how high uncertainty reaches the human" was not repeated at the
    ambiguous-evidence rule; rule 4a's routing sentence says the same.

### Not verified

- The live counts of the false-green, dead-export and unreachable fences were not printed; the
  evidence is that the fences passed inside `npm test`.

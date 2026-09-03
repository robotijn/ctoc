---
title: "The done gate reads the record the executor wrote — and the approval hash exempts the Deferred Questions the pipeline itself emits"
type: functional
status: functional
created: 2026-09-01
priority: high
effort: small
files:
  - src/lib/plan-validator.js
  - src/lib/approval-ledger.js
  - tests/plan-validator.test.js
  - tests/approval-boundary-is-legible.test.js
  - tests/approval-hash-survives-execution.test.js
approved_by: human
approved_at: 2026-09-01T16:36:16.268Z
gate_crossed: functional → implementation
---

# The done gate reads the record the executor wrote — and the approval hash exempts the Deferred Questions the pipeline itself emits

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 1 | `00255-the-done-gate-reads-the-record-the-executor-wrote-s1-canonical-section-and-deferred-row.md` | The step-block reader prefers the canonical ticked execution section over the planner's prose twin; the exemption-row request is settled with two committed proofs instead of a guessed table row. | – |

One slice: the two source edits and their tests are one unit of work, per the parent's own
notes. The slice reports one departure from the approach below and its evidence — the
refinement pass writes the "Deferred Questions" note BEFORE the approval record is taken, so
exempting it would move digests that are already recorded. The slice builds the validator
fix in full and hands that one question back with a byte-for-byte measurement.

---

## Original functional plan

## 1. ASSESS — Problem Understanding

Two defects, found on 2026-09-01 when the first eleven built slices of the
coverage-holes wave reached review. Both are reproduced on the live repository and
both block the "is it finished?" moment for every slice, for reasons that have
nothing to do with the work.

**Defect A — the validator reads the wrong execution plan.** A plan that goes
through the implementation planner carries a `## Execution Plan` section written by
the planner (prose under `### Step 8: TEST` … `### Step 16: FINAL-REVIEW`, no
checkboxes). When the plan crosses to `todo`, `src/lib/iron-loop.js` appends the
canonical checkbox template under `## Execution Plan (Steps 8-16)`. The executor
ticks the template's boxes and writes its evidence there. But
`extractStepBlocks` in `src/lib/plan-validator.js` takes the FIRST
`^## Execution Plan` heading and stops at the next `## ` heading — so it reads the
planner's prose twin, finds no `- [x]`, and `validateReviewToDone` reports
"Step N has an unchecked required checkbox" for every required step. Measured:
all twelve slices in review (`00234`, `00235`, `00236`, `00244`–`00252`) are
blocked this way while each file holds 31 ticked boxes and none unticked.

Editing the plan files is not an option: the planner's section lies inside the
hashed specification (dry-run: removing it changes `computeSpecHash` on every
slice), so a body edit would read as a forged approval.

**Defect B — an executor output the exempt list does not name.** The approval
ledger binds an approval to the hash of the specification, defined as the whole
file minus the frozen `EXECUTION_SECTIONS` deny-list (`execution record`,
`execution log`, `step 16 final-review report`, `decisions taken during
execution`, `verification evidence`, `decisions taken under ambiguity`). Two
slices (`00234`, `00252`) now read `hash-mismatch` because their executors
appended a `## Deferred Questions` section — the heading `src/lib/iron-loop.js`
itself emits (`appendDeferredQuestions`) and `agents/iron-loop/iron-loop-critic.md`
names as the Step 16 hand-off. The deny-list did what it is designed to do (fail
noisy, not silent); the remedy it prescribes is a reviewed row naming the producer.

## 2. ALIGN — Approach

**A.** `extractStepBlocks` prefers the canonical section: if the content contains
`## Execution Plan (Steps 8-16)`, that region is the step source; otherwise fall
back to the first `## Execution Plan` region exactly as today. No other behaviour
of `validateStepsComplete`, `validateEscalations` or `validateReviewToDone`
changes. A plan with only a prose section still fails (a step with no checkbox is
never complete — unchanged). A plan with only the canonical section is unchanged.

**B.** Add one row to `EXECUTION_SECTION_PRODUCERS`:
`{ heading: 'deferred questions', producer: 'iron-loop integrator (src/lib/iron-loop.js appendDeferredQuestions) and iron-loop-executor — Step 16 deferred questions' }`.
`EXECUTION_SECTIONS` is derived from the table, so it follows. The
"pinned source digest" test (`tests/source-stays-searchable.test.js`) hashes a
FIXTURE that contains no such heading, so it is unaffected; the test that asserts
every row names a producer (`approval-boundary-is-legible` case 11) and the one
asserting the derived array equals the table (case 12) keep passing by
construction. After this change the two mismatching slices match their stored
hash again with no plan edit (the exempt region simply grows to cover the section
that was added after approval).

### Scope

**In scope:** the two source changes above; a regression test for each (a plan
with both sections is judged by the canonical one; a plan carrying
`## Deferred Questions` after approval still matches its specification hash).

**Out of scope:** why the planner emits a prose `## Execution Plan` at all (its
brief asked it to; a follow-on may drop that instruction), and any widening of the
exempt list beyond this one named producer.

## 3. CAPTURE — Acceptance Criteria

```gherkin
Feature: The done gate judges the record the executor actually wrote

  Scenario: A plan with a planner section and a canonical ticked section
    Given a plan whose first "## Execution Plan" has prose steps without checkboxes
    And a later "## Execution Plan (Steps 8-16)" whose required steps are all "- [x]"
    When validateReviewToDone runs with fresh passing verify evidence
    Then no "unchecked required checkbox" error is reported

  Scenario: A plan with only a prose section still fails
    Given a plan whose only execution section has no checkboxes
    When validateReviewToDone runs
    Then every required step is reported unchecked (unchanged behaviour)

  Scenario: Deferred Questions is an exempt execution section
    Given a plan approved with a recorded specification hash
    When an executor appends "## Deferred Questions" with content
    Then contentMatches reports match:true for the stored entry

  Scenario: The exempt table stays legible
    Then every EXECUTION_SECTION_PRODUCERS row names a heading and a producer
    And EXECUTION_SECTIONS equals the table headings in order

  Scenario: The live repository
    When validate review → done runs on the twelve slices now in review
    Then none reports an unchecked required checkbox
    And contentMatches is true for all twenty coverage slices
```

**Definition of Done**
- `npm test` → fail 0, skipped 0, coverage ≥ floor.
- The twelve reviewed slices validate for done (their own verify evidence
  permitting); `00234` and `00252` match their stored specification hash.
- No existing assertion weakened; no baseline or exemption file touched.

## Notes for the implementation planner

One slice (two small source edits and their tests are one unit — the live
acceptance scenario needs both). Test-first: the two new regression cases are RED
against the current code. Do NOT emit a `## Execution Plan` section in the slice
file; leave the canonical template injection at the todo crossing to produce the
only one.

## Decisions Taken Under Ambiguity

1. **Prefer-canonical, not merge.** Reading only the canonical section when present
   (rather than merging both) keeps the rule explainable and cannot be satisfied by
   a checkbox in the prose twin.
2. **One row, one producer.** The exempt list grows by the single heading the
   pipeline's own code emits, named with its producer, per the table's design; no
   marker or runtime boundary.

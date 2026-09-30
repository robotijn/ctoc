---
iron_loop_verdict: true
iron_loop: true
title: "Every census claim checked by reading the deciding code, counting on disk, or running the test the README names"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00384-the-readme-matches-the-product-today-s3-pipeline-copy-captures-and-walks
priority: medium
effort: medium
files:
  - .ctoc/verification/readme-truth-record.md
approved_by: human
approved_at: 2026-09-30T07:58:20.069Z
gate_crossed: implementation → todo
---

# Every census claim checked by reading the deciding code, counting on disk, or running the test the README names

**Scope (one line):** give a verdict to every census claim row whose method is "read", "counted" or "test named", settle the known contradictions the parent names by reading the code that decides them, and write into each row that is not true the corrected text a patched piece would carry.

Read the parent plan in full first, including its ASSESS list of measured examples and its seven findings.

## Implementation Details

### What this slice does

1. **Reads, counts or runs each row, by its method** — never by a word search alone (parent rule 2):
   - **Read:** the source lines that decide the behaviour are read and quoted with their path in the row.
   - **Counted:** measured on disk by a real walk, the number printed in the row (for the growing counts, `computeDocCounts` in `src/lib/doc-counts.js`, the same source the guard test and the release sync use).
   - **Test named:** where the README says a test enforces something, that test is run on its own and its result is recorded; it must pass for the verdict to be true.
2. **Settles the known instances the parent names**, each with the code lines quoted:
   - **The four moments.** Read `pendingGateDecisions` and `crossBySufficiency` in `src/lib/streaming-gate.js`, and `PRE_BUILD_GATES` in `src/lib/approval-residency.js`, which decides where a sufficiency ledger entry is accepted. The rows for every sentence that says all four moments are mandatory, or that nothing crosses them on its own, get the verdict corrected, with the text of what ships (criterion 12's wording) as their new text.
   - **The tier table.** 1 + 20 + 99 = 120 against the 124 the headline states. Read `docs/AGENT_ARCHITECTURE.md`, `.ctoc/architecture/tier-definitions.yaml` and the agent files, and record which agents lie outside the three tiers the table counts, where that can be stated truthfully (criterion 7's rule). The reference slice writes the reconciliation from this row.
   - **The specialist-skill count in the comparison row** (99 in the row, 101 on disk and in the Skills section) — counted.
   - **The environment question's wording** — read in `src/commands/start.js`.
   - **Production and auto-push.** The first-run screen's text in `src/commands/start.js` against `ENVIRONMENT_PROFILES` in `src/lib/settings.js` — the two places criterion 14 names.
   - **Test-driven development "Automatic (Step 8)"** against the reference's statement that step execution is instruction-level discipline — read the code that would enforce it, if any.
   - **The in-progress folder** — `getPlanCounts` in `src/lib/state.js` (decision D11).
   - **Who makes each move** — the approval function's three edges in `src/lib/gate-order.js`, the decompose boundary, the scheduler's claim from the todo queue, and the completion that moves a plan to review, each read in the code the greenfield-journey test's header names, not taken from that header.
   - **Whether and how a plan passes through the canvas stage** — read in the code before the canvas section is written (decision D17); the row states what is true and no more.
   - **Concurrent builds** — `MAX_CONCURRENT` and the file-based rule in `src/lib/task-registry.js` (the parent's fifth finding).
   - **"14 languages"** — the stack detector's own list, read in its source; if the number is wrong, criterion 7 applies, and the number the pin will derive from is named in the row.
   - **The two functions that rewrite the README** — `src/scripts/release.js` and `syncToReadme` in `src/lib/version.js`; the row for the developer block's sentence says which of the two it describes (the parent's seventh finding).
   - **How the skill library was built** (the improvement loop the README describes today) — checked against the commit history (read-only git) and the plans that did the work. What the history cannot show is marked not verified until the three-round description replaces it (criterion 18).
3. **Writes the corrected text into every row that is not true.** A row marked corrected carries the old text, what was read, counted or run, what it printed, and the new text. A patched piece carries exactly that new text in place; a piece the verdict slice decides to rewrite is written afresh instead, and its old rows keep their verdicts as the evidence (criterion 4).
4. **Checks the behaviour rows of the two capture slices too.** Every behaviour row marked by a run in the two capture slices is read again here for completeness: a contradicted row that lacks its old text, command, printed result or new text is completed from the raw output.

### What this slice must not do

Edit `README.md`, any test or any source; run the product with this repository as the project root (a claim that needs a run goes back to the capture procedure, in a disposable project, with its own listing pair); run any git command that writes.

### Which sections of the rebuilt README it writes

None.

### Decisions of the parent that govern it

- ALIGN, "How a claim is checked": the six methods, the four verdicts, "a claim about how the skill library was built", "a why is a claim".
- ALIGN, "The rules this plan holds itself to", rules 2 and 3.
- The findings recorded, not fixed here (all seven) — each stays a finding; no product code changes.
- Decisions By The Human: "README says what ships".
- D11, D17.

### Acceptance criteria

**Closes criterion 4**, quoted from the parent:

> 4. GIVEN a sentence that states how the product behaves, WHEN the behaviour is run or its deciding code path is read and the result contradicts the sentence, THEN the sentence is corrected to the observed behaviour (or removed if it cannot be stated truthfully), and the row shows the old sentence, what was run or read, what it printed, the new sentence, and the verdict corrected. The four-moment sentences (see criterion 12) and the tier table arithmetic are the known instances. In a piece decided rewrite, the old text's rows keep their verdicts as the evidence, and each claim of the new text gets its own row.

For the census rows. Every slice that writes new README text applies the same rule to its own new rows.

Feeds, quoted from the parent: **7** ("where the tier table and the headline disagree, the disagreement is reconciled by naming what lies outside the table where that is true"); **12** ("The record row cites the code lines read"); **14** ("the record row cites the two places read").

### Evidence to record

For every row handled: the method, the path and lines read (quoted), or the count and how it was walked, or the test run and its result; the verdict; for corrected rows, the new text.

### How to verify

1. A throwaway program lists every census row whose method is read, counted or test named and confirms each now carries a verdict; its printed result goes into the record.
2. Every test named by a "test named" row was run in this slice and its pass is recorded.
3. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version; nothing pushed.

### Constraints from the other tests that read the README

None can move: this slice does not edit the README.

### Wiring — the live call sites

No module is added or changed. The rows are read by the verdict slice and the slices that write the README.

### Security review

- Git is used read-only (log and show). No history is rewritten.
- Quoted source lines contain no secret; a line that would is cited by path and line number only.

## Decisions Taken Under Ambiguity

1. **The corrected text is written into the row now, before the verdict slice decides patched or rewritten**, because a patched piece must carry exactly the recorded correction and nothing else (criterion 24); if the piece is rewritten, the proposed text is simply unused and the row says so.
2. **The tier arithmetic is measured here and written in the reference slice**, because the reference slice owns the section and the pin that follows it; measuring once and writing once keeps a single source for the four names.
3. **A claim a test "enforces" is true only if that test passes when run now**; a test that exists but fails, or does not assert what the sentence says, makes the row corrected or not verified.


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


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

---
iron_loop_verdict: true
iron_loop: true
title: "The whole-document checks — every capture equal to its raw output, every number equal to its measurement, every carried sentence found, every rewritten piece written afresh, the parts in order, and every moved pin at least as strict"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00394-the-readme-matches-the-product-today-s13-three-round-improvement
priority: medium
effort: medium
files:
  - README.md
  - .ctoc/verification/readme-truth-record.md
approved_by: human
approved_at: 2026-09-30T07:58:20.358Z
gate_crossed: implementation → todo
---

# The whole-document checks — every capture equal to its raw output, every number equal to its measurement, every carried sentence found, every rewritten piece written afresh, the parts in order, and every moved pin at least as strict

**Scope (one line):** with every part written, check the finished README as a whole against the record — screens, numbers, carried text, rewritten text, the order of the parts, the old-to-new map and the changes to the guard test — and fix in the README any defect the checks find.

Read the parent plan in full first: criteria 1, 7, 23 to 26, and the Definition of Done.

## Implementation Details

### What this slice does

Every check is made by a throwaway program in the session's scratch directory (never committed) or by reading, and each program's code and printed result go into the record, so a second reader can redo it with a program of their own.

1. **Every capture equals its raw output** (the Definition of Done's first item). For every fenced block presented as a capture, the record has a row with the command, the project used, the exit code, the byte count, the checksum, the transformations and the verdict; the program applies the recorded transformations to the raw file and compares the result byte for byte with the block. The one allowed difference not made by the pass is the dashboard capture's version line, which the release sync keeps current; the record states the raw file's version and the README's.
2. **Every option table** that quotes the product's labels matches the labels in a recorded run, or says it is a summary.
3. **Criterion 1, the read-through.** Following the quickstart step by step, then each stage section: every screen shown is a capture with its row, the same blocks, labels, order and wording as the real screen, differing only in values the README labels as a moment; every command, word and option a step tells the reader to use exists in the product under the name the README gives it (each with its row); every host-owned step is checked against the host's documentation or marked not verified; every step whose reply a model session writes is marked not verified where it stands.
4. **Criterion 7, every number.** A presence search lists every number in the README outside fenced captures, only as a list of candidates; each is matched to a claim row with its measurement. Each count is measured again today by a real walk (for the growing counts, the same count source the guard test uses) and printed in the record; a number that no longer equals its measurement is corrected in place with its row, and a correction that would change a pinned count stops the slice for the human.
5. **Every census verdict is visible.** Every claim of the census carries a verdict from the closed set, and every "not verified" and "removed" verdict is visible in the README's difference from the pre-pass commit.
6. **Criterion 23, the rewritten pieces.** For each piece decided rewrite: its content stands in its new home, written afresh (no old sentence carried unless it is also a true sentence of the new text with its own row); its piece row names the check that fired; every claim of the new text has a row with a verdict; every capture in it was re-taken by the capture rules; and the old text reads back from the pre-pass commit and checksum the record names.
7. **Criterion 24, the carried pieces.** The program looks up each carried sentence of each piece decided left as it is or patched in the finished README (capture blocks and the lines the release sync keeps current excepted). A sentence that is missing, or altered by anything that maps to no row, fails the check. A piece left as it is appears word for word. Each piece's row says why it was not rewritten.
8. **Criterion 25, the order and the map.** The finished README has, from the top: the opening with the title block and the badge row; the quickstart; how to use it, by stage; after the journey (the refused edit, keeping it healthy); the reference. Every piece of the pre-pass README is accounted for in the old-to-new map as carried word for word, carried with recorded in-place corrections, rewritten, or removed (by the instruction, or as a recipe or feature bullet the journey already shows, with the reason). Every claim and capture of the new text carries a row.
9. **Criterion 26, the guard test's changes.** The difference of `tests/readme-numbers.test.js` from the pre-pass commit is read assertion by assertion: each changed pin is replaced by a pin of the true new text at least as strict as what it replaces, with its red-first run in the record; no assertion is deleted or loosened; every count the guard test pins keeps its number; every claim a pin guards is still stated in the README, where its pin looks; each of the nine required headings is present under a heading of its own; and each replaced pin has its written justification — the human's instruction quoted verbatim, why the test and not the README, and what newly fails.

A defect found in the README is fixed here as a recorded in-place change. A defect found in the guard test is not fixed here (the test is not among this slice's files): the slice stops and asks through the existing scope-growth question in the inbox.

### Which sections of the rebuilt README it writes

None, unless a check finds a defect; each fix is a recorded in-place change.

### Constraints from the other tests that read the README

Every one holds at the end of this slice; the full gate proves it.

1. **`tests/readme-numbers.test.js`** — every pin green.
2. **`tests/compliance-claims-match-code.test.js`** — the marker NOT ENFORCED beside every control that is not enforced and is named outside a fenced block.
3. **`tests/no-phantom-command-family.test.js`** — no new lowercase "ctoc" followed by a space and a lowercase word.
4. **`tests/no-tier-3.test.js`** — none of the five deleted scout names.
5. **`tests/ctoc-start-command.test.js`** — never the literal `ctoc:menu`.
6. **`tests/version.test.js` and the release sync** — one line-start bold version token and no earlier one; the version badge; the version example; exactly one capture-version line; the structure-block count lines with their words unchanged.

### Acceptance criteria

**Closes criteria 1, 7, 23, 24, 25 and 26**, quoted from the parent:

> 1. GIVEN a fresh project with an empty plans folder and the plugin installed from the marketplace, WHEN the builder follows the quickstart step by step and then reads each stage section, THEN every screen shown has the same blocks, labels, order and wording as the real screen, the only differences being values the README labels as a moment (counts, plan names, the version), AND every command, word and option a step tells the reader to use exists in the product under the name the README gives it. The builder alone observes this: every screen is produced by running the real code in a fresh disposable project; the host-owned steps (installing, updating, the plugin menu path) are checked against the host's live documentation; anything the documentation does not show, including how the host presents the questions, and every step whose reply is written by a model session, is marked not verified where it stands.

> 7. GIVEN every number in the README, WHEN it is compared with what was measured that day, THEN each equals its measurement, with the measurement printed in the record; where the tier table and the headline disagree, the disagreement is reconciled by naming what lies outside the table where that is true and leaves every pinned count unchanged, and otherwise by correcting the table or the headline — a correction that would change a pinned count is a change to a contract the human must explicitly replace, never left with both numbers standing.

> 23. GIVEN a piece that fails the share test or the flow test, WHEN the pass finishes, THEN that piece's content has been written afresh in its new home from what the real product does (not by editing the old sentences), its record row names the check that fired with the evidence, every claim of the new text carries a row with a verdict, every capture in it was re-taken by the capture rules, and the old text can be read from the pre-pass README that the record names by commit and content checksum.

> 24. GIVEN a piece that fails neither check, WHEN the pass finishes, THEN its text appears in the rebuilt README differing from the pre-pass text only by the in-place changes its own rows record, each shown as old text and new text, and its record row says why it was not rewritten. A piece whose verdict is left as it is appears word for word. A throwaway program looks up each carried sentence of each such piece in the rebuilt README (the capture blocks and the lines the release sync keeps current excepted), and a sentence that is missing, or altered by anything that maps to no row, fails the pass. No piece is rewritten for style.

> 25. GIVEN the human's instructions of 2026-09-29, WHEN the finished README is read from the top, THEN it has, in this order: the opening with the title block and the badge row; the quickstart; how to use it, by stage; after the journey (the refused edit, keeping it healthy); and the reference; AND every piece of the pre-pass README is accounted for in the old-to-new map as carried word for word, carried with recorded in-place corrections, rewritten, or removed (by the instruction, or as a recipe or feature bullet the journey already shows, with the reason); AND every claim and capture of the new text carries a row like any other.

> 26. GIVEN the rebuild changed a heading or a sentence that an assertion in a test pins, WHEN the pins are updated, THEN each changed pin is replaced by a pin of the true new text that is at least as strict as what it replaces, written first and seen failing against the README before the change; no assertion is deleted or loosened; every count the guard test pins keeps its number; every claim a pin guards is still stated in the README and its pin follows it (unless the pass finds the claim false, when criterion 7's rule applies); each of the nine sections whose headings the guard test requires is still present under a heading of its own; and each replaced pin has a written justification in the record — the contract that changed (the human's instruction, cited verbatim), why the test and not the README, and what newly fails.

Also closes the Definition of Done items on captures, option tables, census verdicts, the piece rows and the old-to-new map, and the pins moved.

### Evidence to record

Each program's code and printed output (capture comparison, carried-sentence lookup, number list, parts order); the read-through result per quickstart step and stage section; the today measurement of every number; the assertion-by-assertion reading of the guard test's difference; every defect found and its fix, old and new text.

### How to verify

1. Every program above prints no failure; its output is in the record.
2. `node --test tests/readme-numbers.test.js tests/compliance-claims-match-code.test.js tests/no-phantom-command-family.test.js tests/no-tier-3.test.js tests/ctoc-start-command.test.js tests/version.test.js` — all green.
3. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version; nothing pushed.

### Wiring — the live call sites

No module is added. Nothing new is reachable; the checks are throwaway and the record is read by the human.

### Security review

The throwaway programs read the README, the record, the raw captures and the pre-pass commit; none runs a shell or treats file content as a command.

### Shared file

No build of the improvement plan runs while this slice builds. The dispatcher holds this.

## Decisions Taken Under Ambiguity

1. **The whole-document checks are one slice, after every writing slice**, because criteria 1, 7 and 23 to 26 are statements about the finished README and the finished record; checked earlier, they would be checked against a README that later slices still changed.
2. **A defect in the guard test found here is asked about, not fixed**, because the test is not among this slice's files and a pin looser than what it replaced is a defect of the slice that wrote it; the scope-growth question is the door the parent names for a write outside the declared files.
3. **Numbers are listed by a presence search only to find candidates**; whether each equals its measurement is decided by measuring it, never by the search.


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

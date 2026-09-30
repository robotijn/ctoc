---
iron_loop_verdict: true
iron_loop: true
title: "The record's totals and the full gate — the release-sync proof on a disposable copy, every listing pair audited, every test that reads the README green, and totals a program computed"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00395-the-readme-matches-the-product-today-s14-whole-document-checks
priority: medium
effort: medium
files:
  - README.md
  - .ctoc/verification/readme-truth-record.md
approved_by: human
approved_at: 2026-09-30T07:58:20.386Z
gate_crossed: implementation → todo
---

# The record's totals and the full gate — the release-sync proof on a disposable copy, every listing pair audited, every test that reads the README green, and totals a program computed

**Scope (one line):** prove on a disposable copy that the release sync still rewrites exactly what it should in the finished README, confirm no product run of any slice touched the real pipeline, confirm every constraint of the tests that read the README, compute the record's totals by program from the finished README and record, and run the full gate.

Read the parent plan in full first: "The record", rule 6, and criteria 8, 10, 20, 21, 27 and 32.

## Implementation Details

### What this slice does

1. **The release-sync proof (criterion 27).** Read the README patterns from `src/scripts/release.js` (its version and count update tables) and from `syncToReadme` in `src/lib/version.js`, and quote them in the record. Copy the finished README into the session's scratch directory. A throwaway program applies those patterns to the copy with a version number different from the real one and count values different from the real ones, and confirms: the version badge, the line-start version token, the version example in the developer block, the first line of the dashboard capture, and the structure block's test-file and library-module counts each change to the new value; no other byte of the copy changes; `syncToReadme`'s pattern for the line-start token matches; exactly one line has the capture-version shape; and no line before the line-start token starts with a bold version-shaped token. The real README is never the target, and the real release script is not run for this proof.
2. **The listing audit (criterion 8).** Every slice of this plan that ran the product recorded a before-and-after listing of this repository's `plans/` and `.ctoc/` folders. This slice reads every pair, confirms each difference is attributed, and confirms none was caused by a capture run: no plan file moved or changed and no pipeline-state file written by any run. A pair missing for a slice that ran the product is a failure named in the record.
3. **The constraints of the tests that read the README (criteria 10 and 32).** Each test the census listed is run on its own and its result recorded, with the constraint it puts on the README checked against the finished file: the compliance fence passes, with the literal marker NOT ENFORCED beside every control that is not enforced wherever it is named outside a fenced block; no deleted scout name appears; the count of a lowercase "ctoc" followed by a space and a lowercase word has not grown past the phantom-command test's ceiling (the count is compared with the census's baseline); the literal `ctoc:menu` is absent; and a line-start bold version token exists, so `syncToReadme` and the tests that call it succeed.
4. **The totals (criterion 20).** A throwaway program computes, from the finished README and the record, and prints at the top of the record: captures checked; claim rows by verdict; pieces by verdict (left as it is, patched, rewritten, removed by instruction); web addresses fetched by outcome; in-page and relative links resolved (the links slice's program re-run over the finished README); numbers measured. Right after the totals, the statement that the README was rebuilt in its structure by the human's instructions of 2026-09-29, with the counts of pieces carried word for word, carried with in-place corrections, rewritten, and removed by instruction. Then the reconciliation: the fenced blocks presented as captures in the README equal the capture rows; every census claim has a row with a verdict; every piece has a row with a verdict or the note that the instruction removed it.
5. **The full gate (criterion 21).** `npm test` — zero failures, zero skipped, coverage at or above the floor recorded in `.ctoc/coverage-baseline.json` (99 today). Every test that reads the README is green and listed in the record with its constraint. No assertion was deleted or loosened (the whole-document slice's reading of the guard test's difference is the evidence). The phantom-command debt has not grown.

If a check here finds a defect in the README, it is fixed as a recorded in-place change, and every total is computed again after the fix, so the totals describe the README as it is committed.

### Which sections of the rebuilt README it writes

None, unless a check finds a defect.

### Constraints from the other tests that read the README

This slice's own step 3 is the check of every one of them, on the finished README.

### Acceptance criteria

**Closes criteria 8, 10, 20, 21, 27 and 32**, quoted from the parent:

> 8. GIVEN the real repository's plans folder and pipeline-state folder before the first capture run, WHEN the last capture has been taken, THEN the recorded before-and-after listings show no plan file moved or changed and no pipeline-state file written by any capture run.

> 10. GIVEN a control that is not enforced is named anywhere in the README, WHEN the compliance fence runs, THEN the literal marker NOT ENFORCED is present beside it and the fence passes.

> 20. GIVEN the finished pass, WHEN the human opens the record, THEN it starts with program-computed totals that reconcile with the README (fenced captures in the README equal capture rows; every census claim has a row with a verdict; every piece has a row with a verdict or the note that the instruction removed it), followed by the statement of the rebuild with its counts, and then one row per capture, per claim, per piece and per how-and-why step with method, command or lines read, raw result and verdict.

> 21. GIVEN the finished work, WHEN `npm test` runs, THEN it reports zero failures, coverage at or above the floor recorded in `.ctoc/coverage-baseline.json` (99 today, read), and zero skipped; every test that reads the README stays green (the five found are listed in the record with the constraint each puts on it); no assertion has been deleted or loosened (a pin replaced by a pin at least as strict, as criteria 13 and 26 allow, is neither); and the phantom-command debt in `tests/no-phantom-command-family.test.js` has not grown.

> 27. GIVEN the finished README, WHEN the release sync's own README patterns, read from `src/scripts/release.js` and `src/lib/version.js` and quoted in the record, are applied by a throwaway program to a disposable copy of the README with a different version number, THEN each thing the sync rewrites (the version badge, the line-start version token, the `getVersion()` example, the first line of the dashboard capture, and in the structure block the test-file count and the library-module count) changes to the new value, no other byte of the copy changes, `syncToReadme`'s pattern for the line-start token matches, exactly one line of the README has the capture-version shape, and no earlier line starts with a bold version-shaped token. The real README is never the target of this proof.

> 32. GIVEN the tests that read the README (the five listed under "What the rebuild puts at risk", plus any the census adds), WHEN the finished README is checked against each constraint, THEN each holds: no deleted scout name appears; no bare lowercase "ctoc" followed by a space and a lowercase word is added beyond what the ceiling in the phantom-command test allows; every control named outside a fenced block carries NOT ENFORCED in its own table row or list item or its own heading-delimited section; and a line-start bold version token exists so that `syncToReadme` and the tests that call it succeed.

Also closes the Definition of Done items on the before-and-after listing, the release-sync patterns, the constraints of the other tests, and `npm test`.

### Evidence to record

The quoted sync patterns and the proof program's code and printed result; the listing audit, pair by pair; each README-reading test's run and the constraint checked; the totals and the reconciliation, with the program that computed them; the `npm test` counts (tests, pass, fail, skipped) and the coverage figure; the phantom-command count against the baseline and the ceiling.

### How to verify

1. The proof program prints that exactly the six sync targets changed and nothing else, and that both shape conditions hold.
2. The totals program's reconciliation prints no mismatch.
3. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version by the release rule; nothing pushed. The plan then waits in review for the human's word that it is finished.

### Wiring — the live call sites

No module is added. The record is what the human opens at review; the README is what readers open on GitHub and the marketplace.

### Security review

- The proof runs on a copy in the scratch directory; the real README and the real release script are untouched by it.
- The totals are counts only; no file content from outside the repository enters the record.

### Shared file

No build of the improvement plan runs while this slice builds. The dispatcher holds this.

## Decisions Taken Under Ambiguity

1. **The proof also changes the count values**, not only the version, because criterion 27 requires the two structure counts to change to a new value and a count is not a function of the version.
2. **The listing audit is done here, over every slice's pair**, because more than one slice may run the product (both capture slices, and any rebuild slice that re-took a capture); criterion 8 speaks of "the last capture", which is known only once every writing slice is done.
3. **The totals are computed last and again after any fix**, because the parent requires them to reconcile with the README as it is, and a fix after the totals would make them describe a README that no longer exists.


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

---
iron_loop_verdict: true
iron_loop: true
title: "The piece verdicts — the share test and the flow test decide, for every piece, left as it is, patched, or rewritten"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00386-the-readme-matches-the-product-today-s5-web-addresses-and-host-documentation
priority: medium
effort: medium
files:
  - .ctoc/verification/readme-truth-record.md
approved_by: human
approved_at: 2026-09-30T07:58:20.125Z
gate_crossed: implementation → todo
---

# The piece verdicts — the share test and the flow test decide, for every piece, left as it is, patched, or rewritten

**Scope (one line):** read the claim rows and capture rows of every piece of the pre-pass README (the comparison table excepted), run the share test and, for ordered pieces, the flow test, write one piece row per piece with its verdict and its evidence, and settle the old-to-new map — editing nothing but the record.

Read the parent plan in full first, especially "Carried word for word or rewritten — the test that decides".

## Implementation Details

### What this slice does

1. **Confirms every row of a piece carries a verdict before judging it.** A piece's verdict is decided only after every claim row and capture row of that piece carries a verdict, because a share cannot be read from a partial set (the parent). The comparison table is the one piece left open: its competitor cells are researched by the comparison slice, which also writes its piece row.
2. **The share test, for every piece.** Count the piece's rows that are true and its rows that are not true (corrected, removed or not verified). The share test fires when the not-true rows strictly outnumber the true ones; a tie keeps the text; a piece with no rows cannot fail it. Counted by a throwaway program from the record, whose code and printed result go into the record.
3. **The flow test, for every ordered piece** (the old lessons and the recipes). Compare the two ordered lists the capture slices and the web slice recorded — what the piece tells and shows, and what the product really did and the documentation really shows. The test fires when the two lists differ in membership or order: a step the product does not have, a step the piece omits, a step at another position, a screen block the piece lacks or has that the product does not, or blocks in another order. A step under a different name doing the same job at the same position, or a different value, is a difference of wording: it does not fire the test, it is a corrected row and is patched. A host-owned step the documentation does not show neither fires nor passes. Compared by a throwaway program; code and printed result in the record.
4. **One piece row per piece**, with: its new home (from the old-to-new map), its rows counted by verdict, the share test's two counts and result, the flow test's two ordered lists and result (where it applies), the piece verdict from the closed set of three — left as it is, patched, rewritten — and the row numbers that are its evidence. For a rewritten piece, the row names which check fired. For a piece not rewritten, the row says why it was not. The two pieces removed by instruction (the reading guide with its course table, and the section about course-design literature) get a row saying so and no verdict.
5. **Settles the old-to-new map.** Each recipe is compared with the stage section that would hold it (decision D14): if it adds a command, an option or a reason the stage lacks, it is marked "folded into" that stage; otherwise "dropped", with the reason. Each Key Features bullet is placed in the section its claim belongs to, or dropped with a reason — and a bullet that carries a claim a pin guards is never dropped: the claim stays stated somewhere and its pin follows it (decisions D2 and D15). The map then says, for every sentence range of the pre-pass README, which slice of this plan will place it: the opening-and-quickstart slice, the stage slice, the after-the-journey slice, the reference slice, the comparison slice, or the three-round slice.

### What this slice must not do

Edit `README.md`, any test or any source. Rewrite anything. It only decides.

### Which sections of the rebuilt README it writes

None.

### Decisions of the parent that govern it

- ALIGN, "Carried word for word or rewritten — the test that decides": what a piece is; what a row counts as; the share test and why its threshold is the majority; the flow test; the three piece verdicts; the rebuild.
- Decisions Taken Under Ambiguity: the carried-versus-rewritten threshold; what a capture row counts as in the share test; what a piece is; the piece verdict is a closed set of three.
- D2, D14, D15.

### Acceptance criteria

This slice writes every piece row except the comparison table's; the comparison slice writes that last one and closes criterion 22. The criterion, quoted from the parent, is what each row here must satisfy:

> 22. GIVEN every piece of the pre-pass README as the census lists them, WHEN every claim row and capture row of a piece carries a verdict, THEN the record holds one row for that piece with: its new home, its rows counted by verdict, the result of the share test (the two counts compared), the result of the flow test with the two ordered lists it compared (where it applies), the piece verdict from the closed set of three, and the row numbers that are its evidence; and no piece is missing a row. The two pieces the instruction removed carry a row saying so.

Feeds, quoted from the parent: **23** ("its record row names the check that fired with the evidence"); **24** ("its record row says why it was not rewritten"); **25** ("every piece of the pre-pass README is accounted for in the old-to-new map").

### Evidence to record

The piece rows; the two throwaway programs' code and printed output; the settled map with the placing slice named per sentence range; the fold-or-drop reason for every recipe and Key Features bullet.

### How to verify

1. A throwaway program confirms every piece but the comparison table has exactly one piece row, and that every piece verdict agrees with its own share-test and flow-test results as recorded (a rewritten piece has a check that fired; a patched piece has at least one not-true row and no check that fired; a piece left as it is has only true rows).
2. Every sentence range of the pre-pass README has a placing slice or the note "removed by instruction" or "dropped, with the reason".
3. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version; nothing pushed.

### Constraints from the other tests that read the README

None can move: this slice does not edit the README. Every "dropped" decision is checked against the tests table from the census: a sentence a pin holds cannot be dropped.

### Wiring — the live call sites

No module is added or changed. The piece rows govern every slice that writes the README.

### Security review

Nothing is run but two throwaway programs over the record and the pre-pass README; neither reads input as a command.

## Decisions Taken Under Ambiguity

1. **The comparison table's piece row is left to the comparison slice**, because its competitor cells have no verdict until that slice researches them, and the parent forbids reading a share from a partial set.
2. **The map names the slice that will place each sentence range**, so the rebuild slices move text without deciding anything the evidence has already decided, and so the whole-document check can confirm every sentence was placed by the slice the map named.
3. **A check-yourself block is not a piece of its own.** It is part of its lesson's piece; its question-and-answer sentences are that piece's rows; and it is removed with the lesson's text by instruction (the parent's list of what the later instructions supersede, item (c)).


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

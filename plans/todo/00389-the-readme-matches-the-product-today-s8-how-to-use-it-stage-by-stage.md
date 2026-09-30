---
iron_loop_verdict: true
iron_loop: true
title: "How to use it, stage by stage — the dashboard, then Vision, Canvas, Functional, Implementation, Todo, In progress, Review, Done and Shipping, each with what you see, what you do and why the stage exists"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00388-the-readme-matches-the-product-today-s7-opening-and-quickstart
priority: medium
effort: medium
files:
  - README.md
  - tests/readme-numbers.test.js
  - .ctoc/verification/readme-truth-record.md
  - .ctoc/verification/readme-captures/**
approved_by: human
approved_at: 2026-09-30T07:58:20.182Z
gate_crossed: implementation → todo
---

# How to use it, stage by stage — the dashboard, then Vision, Canvas, Functional, Implementation, Todo, In progress, Review, Done and Shipping, each with what you see, what you do and why the stage exists

**Scope (one line):** write part C of the rebuilt README right after the quickstart — the dashboard and how to read it, then one section per stage in the order the code lists the stages, then Shipping — moving into it the pre-pass text the map assigns to this slice, with the stage-order pin and the capture-version pin written first.

Read the parent plan in full first: "The structure of the rebuilt README" (part C), the style requirements, the capture rules, and decisions D3, D4, D11, D14, D16 and D17.

## Implementation Details

### What this slice writes in the README

**The part heading** `# How to use it` (level one, decision D3).

**Its opening** — the dashboard capture from the copy of the pipeline state, and how to read it: the pipeline overview, the tasks, the inbox, the agent line, and the navigation rule (a number on a plan list always opens a plan; words do the rest). Every line of the real capture is explained, including any the pre-pass README never explained — today the line about a plan whose builder is no longer running, re-queued for a clean rebuild and re-verification — with the explanation taken from reading the source that prints it (criterion 2). One sentence says which stages hold the human's moments and points at them (decision D4). The promise sentence about captures is not repeated: it stands once, in the quickstart (decision D6).

**Eight stage sections, then Shipping**, each at level two and headed exactly by the label the dashboard prints — Vision, Canvas, Functional, Implementation, Todo, In progress, Review, Done — then Shipping. Each has the same three parts, in this order, each led by these words: **What you see** (a real capture of a screen the product shows at that stage), **What you do**, **Why this stage exists**. Where the product shows nothing at a stage beyond the dashboard's row for it or the empty stage list, the section shows that real capture and says so (capture rule 7).

- **The four moments are explained in the stage the plan is leaving when the moment happens**, in plain words and never with a gate number (decision D4): the idea to explore at Vision; what to build at Functional; how to build it at Implementation; whether it is finished at Review. At Functional and at Implementation the text says what ships: that moment can cross on enough information and is then recorded in the ledger as a sufficiency crossing. At Vision and at Review it says that path never crosses it. The Vision moment is the decompose boundary the vision-decomposer performs, not an approval edge in the code (the reading slice's row).
- **The two moves the product makes by itself are described as the product's**: a plan taken from the todo queue into the build (Todo), and a finished build moved to review (In progress).
- **In progress is spoken of as a folder** like the others (decision D11). How many builds run at once follows the code (the reading slice's row on `src/lib/task-registry.js`).
- **Canvas says what is true and no more** (decision D17): whether and how a plan passes through it, as the reading slice read it in the code; the section stands in its place even if a plan does not pass through it, and links to the canvas section of the reference (decision D1).
- **Screens that show an agent's earlier work say so** (criterion 3): where a decision screen shows a precomputed question with its pros and cons, or a plan body, the text says whether it is real agent output from a real plan of this repository (as the copy's provenance row records) or sample data rendered by the real screen code.
- **Busy screens come from the one copy** (criterion 11): the dashboard, the decision screens and the task board are the captures the copy slice took, each placed with its recorded transformations only.
- **Shipping** has the same three parts (decision D16). Its "What you see" is the push command's dry run captured in the fresh project, or, where that could not be captured, the text says what could not. It links to the product loop section of the reference (decision D1). Pushing is the human's act; the default auto-push setting and the fact that no environment profile may turn it on follow the reading slice's rows.
- **Every step the reader is told to take is followed, in the same or the next sentence, by one sentence saying why**, and each why has a row naming the run or the source lines it rests on (criterion 31).
- **Recipes are folded in where they add something** the stage does not already show — a command, an option or a reason — as the settled map says (decision D14).

### Which pre-pass text moves here, and the rule for moving it

The settled map names the sentence ranges. Expected: the old dashboard lesson (its four-moments table dissolves into the stage sections; its sentence that names the gate numbers leaves the how-to text); the old idea-to-plans lesson (Vision, Functional, Implementation, and the critique word where a plan is critiqued); the old decision-screen lesson (Functional, Implementation and Review, each at its own moment; how questions are asked at Functional); the old build lesson (Todo and In progress); the old done-and-ship lesson (Review, Done, Shipping); the recipes the map folds into a stage.

The same rules as the opening-and-quickstart slice: carried pieces word for word, patched pieces with exactly their recorded in-place changes, rewritten pieces written afresh from what the product does; move, never copy, so every surviving sentence stands exactly once; every link or text reference to a heading this slice removes re-pointed in the same edit; every claim of the new text given a row with a verdict. A check-yourself block is removed with its lesson's text, by instruction.

### The pins, written first and seen failing

1. **The stage order and the three parts (criterion 29, decision D9).** A pin derived from the code: the stage order from `SECTIONS` in `src/lib/sections.js` (its three lists joined in order), each stage's heading text by the dashboard's own transformation (the first letter capitalised, the hyphen turned into a space, as `src/areas/pipeline.js` does), followed by Shipping; the pin asserts these level-two headings appear under "How to use it" in that order, and that each such section contains "What you see", "What you do" and "Why this stage exists" in that order. It is written first and run against the README as it stands before this slice's edit, and seen red. Because the parent asks for it to be seen failing against the pre-pass README, the same expression is also run by a throwaway program against the pre-pass README read from the commit the record names, and seen red there; both results go into the record.
2. **The capture-version line (decision D9).** The pin now named "Lesson 2 capture: the version line equals the VERSION file" is renamed for what it guards — the dashboard capture's version line — and gains one assertion: exactly one line of the README has the shape `CTOC v` followed by a version, because the release sync rewrites only the first such line and a second would go stale while the existing pin stayed green. That assertion is green against the pre-pass README (it has one such line), so its teeth are shown instead on a throwaway copy of the README with a second such line, where it is seen red; the record holds that run. This is recorded as a pin that passed before the change, and why.

Each changed or added pin gets its justification in the record, as the parent's criterion 26 requires.

### The disposable-copy procedure, if a capture must be taken here

Never with this repository as the project root. Make the project or the copy under `os.tmpdir()`, outside the repository (a busy screen comes from a fresh copy of the pipeline state, taken at one moment and recorded); confirm with `findProjectRoot` in `src/lib/project-root.js` that the product resolves it as its root; list this repository's `plans/` and `.ctoc/` (without `.ctoc/logs/` and this plan's own record and captures) with sha256 checksums before the first run and after the last, into `.ctoc/verification/readme-captures/listings/`; run the real command with the output redirected to a new raw file (never overwriting one); record the command line with placeholders for absolute paths, the exit code, the byte count and the checksum; attribute every listing difference; a difference caused by the run fails the slice.

### Constraints from the other tests that read the README

Every one holds at the end of this slice; the full gate proves it.

1. **`tests/readme-numbers.test.js`** — every pin this slice does not deliberately change stays green, as listed in the opening-and-quickstart slice, including the pins that slice moved into the opening and the quickstart.
2. **`tests/compliance-claims-match-code.test.js`** — the literal marker NOT ENFORCED travels with every control that is not enforced and is named outside a fenced block, in its own table row or list item or its own heading-delimited section. The new stage headings move section boundaries; the compliance choice at Functional carries the marker in its section.
3. **`tests/no-phantom-command-family.test.js`** — no new lowercase "ctoc" followed by a space and a lowercase word; the count before and after is recorded. No invented command family.
4. **`tests/no-tier-3.test.js`** — none of the five deleted scout names.
5. **`tests/ctoc-start-command.test.js`** — never the literal `ctoc:menu`.
6. **`tests/version.test.js` and the release sync** — one line-start bold version token (the footer) and no earlier line starting with one; the version badge; the version example in the developer block; **exactly one** line that is exactly `CTOC v<version>`, which after this slice is the first line of the dashboard capture at the opening of "How to use it" — no other capture placed here may carry a line of that shape (a screen that does is shown only as a table that says it is a summary, and the record says why); and the structure-block lines for the test-file and library-module counts.
7. **Plain words** — no gate number and no plan number in the stage sections outside captures; every term spelled out at its first use in its section (decision D8).

### Acceptance criteria

**Closes criteria 2, 3, 11, 29 and 31**, quoted from the parent:

> 2. GIVEN a capture whose real output differs from the README block in a line the prose does not explain (today: the line about a plan whose builder is no longer running, re-queued for a clean rebuild and re-verification), WHEN the pass compares, THEN the block is replaced by the real output, the prose beside it gains an explanation of that line taken from reading the source that prints it, and the record row shows the old block, the new block and the verdict corrected.

> 3. GIVEN a capture whose content came from an agent's earlier work, WHEN it is presented, THEN the README says whether that content is real agent output or sample data rendered by the real screen code, and the record row says which.

> 11. GIVEN the busy-pipeline screens in the stage sections (the dashboard, the decision screens, the task board), WHEN they are captured, THEN each comes from one real run on a disposable copy of this repository's pipeline state, the README keeps its promise sentence that a capture is a snapshot whose counts show that moment (the version line always showing the current version), stated once where the first capture appears, and the record row states the root the product was given and when the copy was taken.

> 29. GIVEN the finished README, WHEN its stage headings are read from the top, THEN they are, in this order, the eight stages as `src/lib/sections.js` lists them and the dashboard labels them — Vision, Canvas, Functional, Implementation, Todo, In progress, Review, Done — followed by Shipping; each of these sections carries, in this order, the three parts led by "What you see", "What you do" and "Why this stage exists"; each of the human's four moments is explained in the stage the plan is leaving when it happens (the idea to explore at Vision, what to build at Functional, how to build it at Implementation, whether it is finished at Review), in plain words and without a gate number; and the two moves the product makes by itself are described as the product's. A pin in the guard test, derived from the code, holds the order and the three parts, written first and seen failing against the pre-pass README.

> 31. GIVEN the quickstart and each stage section, WHEN they are read, THEN every step the reader is told to take is followed, in the same or the next sentence, by one sentence saying why; each why carries a row that names the run or the source lines it rests on; a why that cannot be traced is rewritten to what can be, or removed with its step marked unexplained in the record.

For criterion 11 this slice also confirms the quickstart's promise sentence stands exactly once in the whole README; for criterion 31 it confirms the quickstart's whys, written by the previous slice, each have their row.

**Owns part C of the parent's structure.**

Feeds, quoted from the parent: **1** ("every screen shown has the same blocks, labels, order and wording as the real screen"); **9** (the stage sections are how-to text); **12** ("the Functional, Implementation and Review sections" among the places); **25**; **26** (the renamed version-line pin).

### Evidence to record

The two pins' red and green runs, including the run against the pre-pass README and the throwaway copy with a second version line; for every stage section and Shipping, a how-and-why row per step; the explanation of every capture line the pre-pass README did not explain, with the source lines it rests on; the provenance statement for every agent-derived screen; per placed capture, its raw file and transformations; the claim rows of the new text; the ranges moved and removed; the phantom count before and after.

### How to verify

1. Both pins red before the README edit (the order pin also against the pre-pass README), green after.
2. `node --test tests/readme-numbers.test.js tests/compliance-claims-match-code.test.js tests/no-phantom-command-family.test.js tests/no-tier-3.test.js tests/ctoc-start-command.test.js tests/version.test.js` — all green.
3. A throwaway program confirms every sentence range the map assigned to this slice stands in part C and nowhere else, and that the promise sentence stands exactly once.
4. A throwaway program compares each placed capture, after its recorded transformations, with its raw file byte for byte; its printed result goes into the record.
5. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version; nothing pushed.

### Wiring — the live call sites

No module is added. The README is rendered by GitHub and the marketplace and rewritten by the release sync; the guard test runs under `npm test`.

### Security review

- No secret, token or home-directory path in any placed capture; paths shortened to a placeholder by the closed list of shortenings.
- A plan body shown in a capture is this repository's own, already public in its plans folder.

### Shared file

No build of the improvement plan runs while this slice builds: its commits let the release sync rewrite `README.md`, and its slices do not declare that file, so the scheduler cannot see the overlap. The dispatcher holds this.

## Decisions Taken Under Ambiguity

1. **All of part C is one slice**, so the pin that holds the order and the three parts of every stage section is red before this slice and green at its end, and part C is owned by exactly one slice. Split across two slices, the pin could be green at neither's end without weakening it.
2. **"Seen failing against the pre-pass README" is shown twice**: against the README as this slice finds it (which, like the pre-pass README, has no stage headings), and against the pre-pass bytes themselves through a throwaway run of the same expression.
3. **The exactly-one assertion is recorded as a pin that passed before the change**, with its teeth shown on a throwaway copy, because the pre-pass README already has exactly one such line; a pin green before the change is a finding to account for, never a pin to bank silently.
4. **The stage headings carry the dashboard's label and nothing more** (decision D3), so the derived pin matches them exactly.


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

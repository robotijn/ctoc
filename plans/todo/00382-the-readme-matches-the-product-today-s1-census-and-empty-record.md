---
iron_loop_verdict: true
iron_loop: true
title: "The census of the README as it stands — its pieces, their future homes, every claim to check, every test that reads it, and the empty record"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: none
priority: medium
effort: medium
files:
  - .ctoc/verification/readme-truth-record.md
approved_by: human
approved_at: 2026-09-30T07:58:19.983Z
gate_crossed: implementation → todo
---

# The census of the README as it stands — its pieces, their future homes, every claim to check, every test that reads it, and the empty record

**Scope (one line):** before any capture, any check or any edit of the README, read the README as it stands piece by piece, write down what it is made of and where each piece goes in the rebuilt structure, open every test that names the README and write down what it asserts, and start the record every later slice writes into.

Read the parent plan in full first (`plans/implementation/the-readme-matches-the-product-today.md`). Every decision in it is settled; this slice reopens none of them.

## Implementation Details

### What this slice does

1. **Names the README the whole pass is about.** The record opens with the commit this slice starts from (read-only git, the current head) and the sha256 content checksum of `README.md` at that commit. Every later slice calls this "the pre-pass README". A piece's old text is always read back from that commit and never copied whole into the record (the parent's decision on how the old text of a rewritten piece stays readable).
2. **Cuts the pre-pass README into pieces**, by the parent's definition: the text under one heading; in the recipes part, one recipe (a paragraph with a bold lead); the lead paragraph; the reading guide. Every sentence belongs to exactly one piece. Each piece is recorded by its heading or first words, its line range in the pre-pass README, and whether it is an ordered piece (it tells the reader to do things in an order or shows screens in an order — the old lessons and the recipes), because only ordered pieces take the flow test.
3. **Writes the claim inventory.** For each piece, one claim row per sentence that asserts a number, a behaviour of the product, a file name, a command, a setting, a link, or something about another product or standard; one capture row per fenced block presented as a capture (the parent counted nine in the course part: the first-run screen once, the dashboard once, the implementation list once, three in the decision-screen lesson, two in the build lesson, one in the refused-edit lesson — the census makes the real count); and one row per option table that quotes the product's labels. Each row carries its row number, its piece, its first words, the claim, and the ONE method of the parent's six it will be checked by: ran, read, counted, fetched, documentation, test named. No verdicts are written here. For each piece, the number of sentences that only instruct or explain, by kind, so the classification can be disputed.
4. **Writes the old-to-new map.** For each piece (or each sentence range of a piece that splits), its home in the rebuilt structure: the opening; the quickstart and which step; the opening of "How to use it" or a named stage section (Vision, Canvas, Functional, Implementation, Todo, In progress, Review, Done, Shipping); the refused-edit section or the keeping-it-healthy section; or a named reference section. Two pieces are marked "removed by instruction": the reading guide with its course table and time column, and the section about course-design literature. A recipe or feature bullet the journey may already show is marked "candidate to drop", for the verdict slice to confirm with a reason. The starting guidance is the parent's list "Where the pre-pass text is expected to go"; this slice fixes the real map.
5. **Writes the capture list the rebuilt structure needs.** One line per screen the new text will show: the first-run screen in the quickstart; the dashboard at the opening of "How to use it"; a "What you see" screen for each of the eight stages and for Shipping; the decision screens at their moments; the task board and an opened task; the refused-edit screen; the stale-plan question. For each: the project kind it comes from (a fresh disposable project, or the disposable copy of this repository's pipeline state, by the parent's rule that empty-pipeline screens come from the first and busy-pipeline screens from the second), and the route the product documents for it in `src/commands/start.md`. The two capture slices take exactly this list.
6. **Fixes where each moved pin will look, before any pin is written** (the parent requires the homes to be fixed in the record first):
   - the agent count in the form `**124 agents** across 24 categories` — inside the section `## The 3-Tier Agent Architecture` (expected: its opening sentences);
   - `20 sub-orchestrators` — inside the same section, in a sentence beside the tier table;
   - the derived skill-file total in the bold form — inside the opening (the text before the first level-one heading);
   - `14 languages` — inside the part that describes what the first run detects (expected: the quickstart's open step);
   - the dashboard capture's version line — the same assertion under a name that says what it guards, plus exactly one line of that shape;
   - the replaced sentence about the four human gates — the true statement, inside the opening.
7. **Opens every test that names the README.** An exact presence search for the word README over `tests/` produces the candidate list (30 files mention it on 2026-09-29). The search decides nothing: each candidate is opened and read, and the record says whether it reads this repository's own `README.md` (not a fixture), every assertion it makes on it, and the constraint it puts on the rebuilt README. The parent found five. **Disk has at least a sixth:** `tests/ctoc-start-command.test.js`, whose case 3 walks `src/`, `docs/`, `README.md` and `CLAUDE.md` and asserts none prints the literal `ctoc:menu` — an absence constraint, needing no edit. The parent also asked the census to open the tests it read only in part; this slice does.
8. **Records the phantom-command baseline.** The count of the shape `tests/no-phantom-command-family.test.js` counts in the README today, and the test's shrink-only ceiling, so every slice that writes the README can show the count has not grown.
9. **Writes the record skeleton** at `.ctoc/verification/readme-truth-record.md`, with these sections in this order, each empty unless named above: totals (the last slice fills them); the statement of the rebuild (the last slice); the pre-pass README (commit and checksum); pieces; claim rows; capture rows; option-table rows; piece rows; how-and-why step rows; the old-to-new map; the capture list; the tests that read the README, each with its constraint; pins moved, replaced or added, each with its justification; product runs and their before-and-after listings; web fetch rows; the journey walk; the flow walks; findings about the product (the parent's seven, carried over as written, and any this pass adds). Row numbers are never reused or renumbered; later slices append.

### What stops this slice and every later one

If a test other than `tests/readme-numbers.test.js` pins README wording or a heading that the rebuild changes, the build stops and asks through the existing scope-growth question in the inbox (`src/lib/scope-growth.js`, the executor's rule 5). The plan's declared files are not amended. This is the parent's decision on other tests that pin README wording, and the census is where such a test is found, before any edit.

### Which sections of the rebuilt README it writes

None. This slice never edits `README.md`. The release sync at the slice's commit rewrites only the README's version lines, as at every commit.

### Decisions of the parent that govern it

- ALIGN, "How a claim is checked" — the census comes first; the six methods; the four claim verdicts.
- ALIGN, "Carried word for word or rewritten" — what a piece is, what a row counts as, the two pieces removed by instruction.
- ALIGN, "What the rebuild puts at risk" — the pin table, the five tests, the anchors, what the release sync needs.
- Decisions Taken Under Ambiguity: what counts as a claim; what a piece is; how the old text of a rewritten piece stays readable; other tests that pin README wording; the record lives in `.ctoc/verification/`.
- D1, D2, D12, D15 (the nine pinned headings stay; Key Features goes; the declared files stay; a claim a pin guards stays stated).

### Acceptance criteria

This slice closes no criterion by itself. It produces the inventory the following criteria are checked against. The clause each one takes from here, quoted from the parent:

- **20:** "every census claim has a row with a verdict; every piece has a row with a verdict or the note that the instruction removed it" — the rows and the pieces start here.
- **22:** "GIVEN every piece of the pre-pass README as the census lists them" — the list is made here.
- **25:** "every piece of the pre-pass README is accounted for in the old-to-new map" — the map is made here.
- **26:** "each replaced pin has a written justification in the record — the contract that changed (the human's instruction, cited verbatim), why the test and not the README, and what newly fails" — the table of replaced pins is copied here from the parent, with the common justification.
- **32:** "the tests that read the README (the five listed under "What the rebuild puts at risk", plus any the census adds)" — the list is completed here.

### Evidence to record

In the record: the commit and checksum; the piece table with line ranges; every claim row, capture row and option-table row with its method; the non-claim counts per piece; the old-to-new map; the capture list; the homes of the moved pins; the tests table with each test's assertions and constraint; the phantom-command count and ceiling; the printed result of the sentence-coverage check below.

### How to verify

1. A throwaway program in the session's scratch directory (never committed) reads the pre-pass README from the named commit, splits it into sentences by the rule the record states, and confirms every sentence falls into exactly one recorded piece. Its printed result goes into the record.
2. Every fenced block of the pre-pass README is either a capture row or listed as not a capture, with the reason.
3. `npm test` — the full gate: zero failures, zero skipped, coverage at or above the floor read from `.ctoc/coverage-baseline.json` (99 today). This slice changes no test and no source, so a failure is a pre-existing defect to report, not to fix here.
4. One commit for the slice, carrying a patch version by the release rule. Nothing is pushed.

### Constraints from the other tests that read the README

None can move: this slice does not edit the README. It records every constraint for the slices that do.

### Wiring — the live call sites

No module is added or changed. The record is read by the human at review and by every later slice of this plan.

### Security review

- The record holds paths, counts, checksums and short quotations of the README — no secret and no file content from outside the repository.
- The throwaway program reads only; it runs no shell and takes no input from the README as a command.

## Decisions Taken Under Ambiguity

1. **The title block and the badge row, which sit under no heading, belong to the lead-paragraph piece** unless the census finds a reason to make them a piece of their own, which it records. The parent's piece list names the lead paragraph and says every sentence belongs to exactly one piece; this is the nearest reading.
2. **Each claim row names one method now**, so the later slices split the rows by method without overlap: ran — the two capture slices; read, counted and test named — the reading slice; fetched and documentation — the web slice; the competitor cells of the comparison table — the comparison slice. A row whose method turns out impossible is reassigned later, with the reason in the record.
3. **The presence search only lists candidates.** A test is counted as reading the README only after it has been opened and read, because a name in a file says nothing about whether the file reads it.
4. **The census adds `tests/ctoc-start-command.test.js`** as a sixth reader of the README. It asserts an absence (`ctoc:menu`), so it constrains the rebuilt README and needs no edit; the parent's rule for tests the census adds covers it.


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

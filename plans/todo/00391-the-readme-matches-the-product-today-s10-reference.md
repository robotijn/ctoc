---
iron_loop_verdict: true
iron_loop: true
title: "The reference — its sections in the parent's order under one level-one heading, the tier table reconciled with the agent count, Key Features and the course-design section gone, and the style pins"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00390-the-readme-matches-the-product-today-s9-after-the-journey
priority: medium
effort: medium
files:
  - README.md
  - tests/readme-numbers.test.js
  - .ctoc/verification/readme-truth-record.md
approved_by: human
approved_at: 2026-09-30T07:58:20.250Z
gate_crossed: implementation → todo
---

# The reference — its sections in the parent's order under one level-one heading, the tier table reconciled with the agent count, Key Features and the course-design section gone, and the style pins

**Scope (one line):** turn the old reference part into part E of the rebuilt README — one level-one heading, its sections at level two in the parent's order, the nine pinned headings kept under their current text — remove Key Features and the section about course-design literature, reconcile the tier table with the agent count, and write the pins that hold the tier section and the style rules first.

Read the parent plan in full first: part E of "The structure of the rebuilt README", decisions D1, D2, D5, D8, D13 and D15, and criteria 7 and 30.

## Implementation Details

### What this slice writes in the README

**The part heading** `# Reference` (level one, decision D3), replacing the old reference part's heading.

**Its sections, at level two, in this order** (the parent's list, with the three sections decision D1 keeps placed as below):

1. `## Commands` (kept first, where the reference opens today);
2. `## The Iron Loop` — the sixteen steps;
3. `## The 3-Tier Agent Architecture`;
4. `## The Refinement Loop`;
5. `## The Canvas — 6-Month Pre-Mortem + 5-Scenario Cash Flow` and `## The Product Loop` (kept after the refinement loop, where they stand today);
6. `## Skills` — "the libraries", meaning the skill library as the Skills section already describes it (decision D5); the project's own modules stay described in the developer block, and no new libraries section is written;
7. enforcement, the quality tiers, the deployment pipeline, the compliance program and the plan index, under their current heading texts;
8. `## SaaS Production-Readiness Templates`;
9. `## Agents` — the full agent list (the full skill lists stay inside the Skills section, where they are today);
10. the comparison table, placed here unchanged — its cells and its piece row are the comparison slice's;
11. troubleshooting, for developers, the licence, the links, and the footer line with the line-start bold version token.

The nine headings the guard test requires stay at level two under their current text (decision D1). The canvas section is the one the Canvas stage section links to; the product loop section is the one Shipping links to.

**What changes inside the sections:**

- **The tier table is reconciled with the agent count** (criterion 7): the table counts 1 + 20 + 99 = 120 against the 124 agents the README states. The section names what lies outside the three tiers it counts, from the reading slice's row, where that can be stated truthfully, and leaves every pinned count unchanged. If it cannot be stated truthfully, the table or the headline is corrected — and a correction that would change a pinned count is a change to a contract only the human can replace: the slice stops and asks, and never leaves both numbers standing.
- **The tier section states the two pinned counts in sentences**: the agent count in the form `**124 agents** across 24 categories` (among its opening sentences) and `20 sub-orchestrators` (in a sentence beside the table), where the re-pointed pins will look.
- **The Iron Loop section says what ships about the human's moments** (criterion 12): the two build-plan moments can cross on enough information and are recorded in the ledger as a sufficiency crossing; the idea to explore and "it is finished" do not cross that way. The reference may name the gate numbers as the code does (style requirement 7).
- **Key Features is removed as a section** (decision D2). Each of its remaining bullets is placed in the section its claim belongs to, or dropped with the reason the verdict slice recorded; a bullet carrying a claim a pin guards is never dropped — the claim stays stated and its pin follows it (decision D15).
- **The section about course-design literature is removed by instruction**, with its six links (the parent's list of what the later instructions supersede, item (e)).
- **The older improvement-loop sentences in the Skills section stay, marked not verified** in plain words where they stand, until the three-round slice replaces them (criterion 18).
- **Plain words** (style requirement 5, decision D8): every abbreviation in the reference is spelled out at its first use in its section, or replaced; pinned wording that carries one ("17 KPIs", "JS modules", "test files") stays exactly as pinned and is spelled out beside it. Each such change is an in-place change with its own row — required by the standing requirement, not a re-wording for style.
- **The reference's "settings" entry**: the two-file settings table already lives in keeping it healthy (the previous slice) and the enforcement and deployment sections already document the settings a reader looks up; no separate settings section is written, so nothing stands twice. The record says so.
- Any text reference to an old lesson still standing in the reference (for example in the compliance section or the gate-critique paragraph) is re-pointed to its new home, if the slice that removed that lesson did not already.

Carried sections move word for word or with exactly their recorded in-place changes; a section the verdict slice decided to rewrite is written afresh; every claim of new text gets a row.

### The pins, written first and seen failing

In `tests/readme-numbers.test.js`; each written, run against the README as it stands before this slice's edit, and seen red; each also run by a throwaway program against the pre-pass README read from the recorded commit, where the parent asks for that. No assertion is weakened or deleted.

1. **The agent count, re-pointed** (the pin named "Key Features: 124 agents across 24 categories"): the same expression, asserted inside `## The 3-Tier Agent Architecture` instead of anywhere in the file. Renamed. Red before the edit, because the phrase stands only in Key Features today.
2. **The sub-orchestrators, re-pointed** (the pin named "Tier table: 20 sub-orchestrators in Tier 1"): the same expression, asserted inside the same section. Red before the edit, because the phrase stands only in the Key Features architecture bullet today.
3. **The tier arithmetic, a new derived pin**: inside the tier section, the counts of the tier table plus the number of agents the section names as outside the tiers equal the agent count derived from disk (`computeDocCounts` in `src/lib/doc-counts.js`), and every agent named as outside the tiers exists as a file under `agents/`. Red before the edit (the table sums to 120 and names nothing outside it).
4. **The style pins (criterion 30, decision D13)**: no heading contains the word lesson, course or module, in any case; no line contains the word lesson, in any case; no check-yourself block exists (the collapsible block whose summary reads "Check yourself"); and the phrases "worked example", "retrieval" and "learning science" are absent, in any case. Red before the edit (the course-design section still carries "retrieval" and "worked examples"), and red against the pre-pass README.

Each changed or added pin gets its justification in the record, as criterion 26 requires.

### Constraints from the other tests that read the README

Every one holds at the end of this slice; the full gate proves it.

1. **`tests/readme-numbers.test.js`** — every other pin stays green: the nine headings; the dispatch-logging sentence (stated twice, both in this part); the refinement-loop phase words; "17 KPIs"; the SaaS template rows; the Agents-intro and Skills-intro pins and the Skills two-kinds pin; the comparison-row pin; the structure-block pins; the absences.
2. **`tests/compliance-claims-match-code.test.js`** — the literal marker NOT ENFORCED travels with every control that is not enforced and is named outside a fenced block; removing Key Features and re-ordering sections moves section boundaries, so every such control named in the compliance section, the templates section and the skill lists is checked in its new section.
3. **`tests/no-phantom-command-family.test.js`** — no new lowercase "ctoc" followed by a space and a lowercase word; the commands section's sentence about there being no command-line executable keeps its current form; count before and after recorded.
4. **`tests/no-tier-3.test.js`** — none of the five deleted scout names; the tier section states there is no pre-screen tier without naming them.
5. **`tests/ctoc-start-command.test.js`** — never the literal `ctoc:menu`.
6. **`tests/version.test.js` and the release sync** — the footer's line-start bold version token stays the only one; the version example `getVersion()` in the developer block, and the structure-block lines for the test-file and library-module counts, stay in the developer block with their words unchanged; exactly one capture-version line in the whole README.

### Acceptance criteria

**Closes criterion 30**, quoted from the parent:

> 30. GIVEN the finished README, WHEN every heading and every line is read, THEN no heading contains the word lesson, course or module (any case); no line contains the word lesson; no check-yourself block exists; and no sentence frames the page as learning material (the machine-checked words are "worked example", "retrieval" and "learning science"; the rest is checked by reading and recorded). Pins in the guard test hold the machine-checkable part, written first and seen failing against the pre-pass README.

The part checked by reading — no sentence framing the page as learning material — is read over the whole README here and the result recorded.

**Owns part E of the parent's structure**, except the comparison table's cells, which criterion 15 gives to the comparison slice.

Feeds, quoted from the parent: **7** ("where the tier table and the headline disagree, the disagreement is reconciled by naming what lies outside the table where that is true and leaves every pinned count unchanged"); **12** ("the reference's Iron Loop section" among the places); **18** ("the older sentences about the improvement loop stay marked not verified"); **25**; **26** (the two re-pointed pins).

### Evidence to record

The pins' red and green runs (and the pre-pass runs); the justifications; the reconciliation of the tier table with the lines read; the ranges moved and removed, including each Key Features bullet's home or drop reason; the order of the reference sections; every abbreviation spelled out, with its row; the reading result for learning-material framing; the phantom count before and after.

### How to verify

1. All four pins red before the edit, green after.
2. `node --test tests/readme-numbers.test.js tests/compliance-claims-match-code.test.js tests/no-phantom-command-family.test.js tests/no-tier-3.test.js tests/ctoc-start-command.test.js tests/version.test.js` — all green.
3. A throwaway program confirms each sentence range the map assigned to this slice stands in part E and nowhere else, that the reference sections stand in the order above, and that no link or reference names a heading that no longer exists.
4. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version; nothing pushed.

### Wiring — the live call sites

No module is added. The README is rendered by GitHub and the marketplace and rewritten by the release sync; the guard test runs under `npm test`.

### Security review

The reference names file paths inside this repository and public web addresses only; no secret.

### Shared file

No build of the improvement plan runs while this slice builds (the release sync rewrites `README.md` at its commits, and its slices do not declare the file). The dispatcher holds this.

## Decisions Taken Under Ambiguity

1. **The commands section stays first in the reference, and the canvas and product loop sections stay right after the refinement loop**, where each stands today. The parent's list does not place them (decision D1 only keeps them), so the least movement of true text decides.
2. **No separate settings section.** Part D names the settings files, the move rule gives each sentence one home, and a new section would be new content with no claim rows behind it (the reason decision D5 gives for not inventing a libraries section).
3. **The "no line contains lesson" pin is case-insensitive**, which is stricter than the literal reading and catches a heading-cased "Lesson" in a sentence.
4. **The tier arithmetic is pinned as a sum derived from disk**, not as the literal 120 or 124, so the pin stays true when an agent is added and fails when the table and the count drift apart.
5. **Spelling out an abbreviation is an in-place change with a row, not a style edit.** The standing requirement (plain words, every term spelled out) and decision D8 require it, so it does not conflict with the rule against re-wording true text for style.


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

---
iron_loop_verdict: true
iron_loop: true
title: "The three-round improvement, described only from its own record — what a round is, how many files carry all three, and how many had a round that found nothing to change"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00393-the-readme-matches-the-product-today-s12-links-and-anchors, 00381-every-agent-and-specialist-skill-improved-three-times-s121-record-check-requires-three-rounds
priority: medium
effort: medium
files:
  - README.md
  - tests/readme-numbers.test.js
  - .ctoc/verification/readme-truth-record.md
approved_by: human
approved_at: 2026-09-30T07:58:20.332Z
gate_crossed: implementation → todo
---

# The three-round improvement, described only from its own record — what a round is, how many files carry all three, and how many had a round that found nothing to change

**Scope (one line):** after the improvement plan has finished and left its record, replace every place the README describes how the agents and the skill library were improved with one consistent description drawn from that record and nothing else, with pins derived from the record written first.

Read the parent plan in full first: "Part B — describing the three rounds", "The technical dependency", and criteria 16 to 19. Then read the improvement plan (`plans/implementation/every-agent-and-specialist-skill-improved-three-times.md`) for what a round is in its own terms.

## Implementation Details

### Why this slice waits for the improvement plan

The README may only describe what actually ran (the parent's technical dependency). This slice therefore depends on the improvement plan's final slice, which makes that plan's record check require three complete rounds on every file of its starting inventory. It is also the last slice of this plan that writes the README before the final checks, and it follows the links slice in the one chain that writes `README.md`.

### What it reads — the improvement record and nothing else

The record the improvement plan leaves under `.ctoc/audit/agent-and-skill-improvement/`: its starting inventory (the paths measured at the start of that work), one record file per inventoried file at the path that mirrors the source path, each holding its round entries, plus its list of late corrections and its list of items put to the human. The shape is the one the improvement plan's own slices fixed; this slice reads it as built and defines nothing about it (the parent: "This plan does not define the record's format").

For each file and each round it needs one fact: did the round change the file, or find nothing to change? The improvement plan records that as the file's fingerprint before and after each round (identical when nothing changed), with an explicit list of what a round that found nothing checked. **If the built record does not carry that distinction, that is a gap in the improvement plan: the slice reports it to the human and describes only what the record does show** (the parent).

The population described is the record's own starting inventory, never the directory counts measured on 2026-09-29.

### What this slice writes in the README

One description, the same in every place the census and the later slices found (expected: the Skills section's quality bar, the comparison table's specialist-skill-library row, and any other the census listed; the opening only if the census listed it, since the opening makes no claim about the improvement except through this slice's sentences):

- **What a round is, in the improvement plan's own terms**: web research, then a deep adversarial critique, then an update (criterion 16).
- **Counts from the record**: how many files carry all three rounds; how many files changed in all three rounds; how many had at least one round that found nothing to change — recognised by identical fingerprints before and after together with the explicit list of what that round checked (criterion 17).
- **Never "improved three times" of a file whose rounds found nothing**: a critique that finds nothing is a result, not a change.
- **Where the record covers fewer files than its starting inventory**, or does not exist, the README names the covered number and never says "every" of the rest, and the older sentences stay marked not verified (criterion 18).
- **Every older sentence about the improvement loop is replaced** by this description; none keeps the older wording (criterion 19).

Every number and every sentence gets a claim row that names the record file and field it traces to (criterion 16). Any link this slice adds is fetched and resolved by the links slice's rule, and recorded.

### The pins, written first and seen failing

In `tests/readme-numbers.test.js`; written, run against the README as it stands before this slice's edit, and seen red. The counts are **derived from the improvement record on disk**, never typed:

1. Each count the description states equals the count computed from the record's files by the same rule the description uses. If the record directory is absent or unreadable, the pin fails loudly and names what it could not read — it never passes on input it did not receive.
2. The older description of the improvement loop (the wording the census recorded for it) is absent from the README.

Each added pin gets its justification in the record, as criterion 26 requires.

### Constraints from the other tests that read the README

Every one holds at the end of this slice; the full gate proves it.

1. **`tests/readme-numbers.test.js`** — every other pin stays green, including the comparison-row pins and the derived specialist-skill-body count the comparison slice added, and the Skills-intro and Skills two-kinds pins.
2. **`tests/compliance-claims-match-code.test.js`** — the marker NOT ENFORCED stays beside every control that is not enforced and is named outside a fenced block.
3. **`tests/no-phantom-command-family.test.js`** — no new lowercase "ctoc" followed by a space and a lowercase word; count before and after recorded.
4. **`tests/no-tier-3.test.js`** — none of the five deleted scout names.
5. **`tests/ctoc-start-command.test.js`** — never the literal `ctoc:menu`.
6. **`tests/version.test.js` and the release sync** — the version shapes are untouched by this slice.
7. **The improvement plan's own record check** (`tests/agent-and-skill-improvement-record.test.js`, which that plan adds) stays green: this slice only reads the record and never writes under `.ctoc/audit/`.

### Acceptance criteria

**Closes criteria 16, 17, 18 and 19**, quoted from the parent:

> 16. GIVEN the improvement plan has produced its per-file record, WHEN the README describes the improvement, THEN every number and sentence traces to a row of that record, and the README says what a round is in the improvement plan's own terms.

> 17. GIVEN the record shows that for some files a round found nothing to change, WHEN the README describes the result, THEN it states how many files changed in all three rounds and how many had at least one round find nothing, and it never says "improved three times" of a file whose rounds found nothing.

> 18. GIVEN the record does not exist or covers fewer files than all, WHEN Part B is written, THEN the README describes only the files the record covers, by number, never uses the word "every" for the rest, and the older sentences about the improvement loop stay marked not verified for as long as no record supports them.

> 19. GIVEN the improvement is described in more than one place today, WHEN Part B is done, THEN every place carries the same description and none keeps the older wording.

Also closes the Definition of Done item "Part B's statements each trace to the improvement record, or Part B is limited to what the record covers".

### Evidence to record

The record paths and fields read; the counts computed, with the program's code and output; one claim row per number and sentence of the description, each naming its source row in the improvement record; the list of places the description now stands, each with its old and new text; any gap in the improvement record reported to the human; the pins' red and green runs and justifications.

### How to verify

1. The pins red before the edit, green after.
2. A throwaway program confirms the description's text is identical in every place it stands, and that none of the older wording remains.
3. `node --test tests/readme-numbers.test.js tests/compliance-claims-match-code.test.js tests/no-phantom-command-family.test.js tests/no-tier-3.test.js tests/ctoc-start-command.test.js tests/version.test.js` — all green.
4. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version; nothing pushed.

### Wiring — the live call sites

No module is added. The derived pins run under `npm test` and read the improvement record the improvement plan's check also reads.

### Security review

The improvement record holds paths, fingerprints and short quotations; the README quotes none of it beyond counts and the definition of a round.

### Shared file

No build of the improvement plan runs while this slice builds; by the dependency above, none is left to run.

## Decisions Taken Under Ambiguity

1. **The dependency names the improvement plan by its slug** because, when this slice was written, the improvement plan's final slice (the one that makes its record check require three rounds on every inventoried file) was not yet on disk. Once it exists, this dependency should name that slice, since the improvement plan's index stays in the implementation folder and never reaches done itself.
2. **The counts are pinned, derived from the record**, because each corrected claim that a machine can check gains a derived pin (the parent's notes), and a count read from a record that later gains a late correction must not go stale silently.
3. **A pin that cannot read the record fails**, never passes, because a check that reports a verdict on input it never received is the false-green shape this repository fences.


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

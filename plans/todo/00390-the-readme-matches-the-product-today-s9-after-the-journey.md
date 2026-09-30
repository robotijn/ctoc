---
iron_loop_verdict: true
iron_loop: true
title: "After the journey — when the product refuses an edit and which door to take, and keeping it healthy"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00389-the-readme-matches-the-product-today-s8-how-to-use-it-stage-by-stage
priority: medium
effort: medium
files:
  - README.md
  - .ctoc/verification/readme-truth-record.md
  - .ctoc/verification/readme-captures/**
approved_by: human
approved_at: 2026-09-30T07:58:20.209Z
gate_crossed: implementation → todo
---

# After the journey — when the product refuses an edit and which door to take, and keeping it healthy

**Scope (one line):** write part D of the rebuilt README after the stage sections — the refused-edit section and the keeping-it-healthy section, with the environment content under its current heading text — move into it the pre-pass text the map assigns, remove what is left of the old course and recipe parts, and confirm the whole how-to text is in plain words.

Read the parent plan in full first: part D of "The structure of the rebuilt README", decisions D10 and D14, and the style requirements.

## Implementation Details

### What this slice writes in the README

**The part heading** `# After the journey` (level one, decision D3), with two sections:

1. **When the product refuses an edit.** "What you see" is the refused-edit capture from the fresh project, taken by driving the real edit hook. Then what the message means and why the product refuses (a plan's declared files are its write permission, and only a plan the human approved grants it), the doors in the order to try them, and the floor that no door lowers — each claim as the reading slice checked it in the code. Every step is followed by one sentence saying why.
2. **Keeping it healthy**: update (the update command, the restart, and the host's plugin-cache issue it works around, its link as the web slice fetched it; the auto-update menu path, marked not verified where the host's documentation does not show it); the settings files (the two files, what each owns and which layer reads it); **the environment**, under its current heading text `Environments — dev / staging / prod`, moved here from the reference so the two links to it keep working (decision D10), with its table and its resolution order; the stale-plan question with its real options (a capture from the copy, or a table that says it is a summary); and the health check.

**What ships about the human's moments, in the environment part** (criterion 12): the pre-pass sentence that the four human gates are mandatory in every environment is corrected to what ships — "what to build" and "how to build it" can cross on enough information, recorded in the ledger as a sufficiency crossing, while "the idea to explore" and "it is finished" never cross that way — and the true part (no environment profile weakens a human gate, or may turn auto-push on) stays as the reading slice verified it.

### Which pre-pass text moves here, and what this slice removes

The settled map names the sentence ranges. Expected: the old refused-edit lesson; the old keep-healthy lesson; the auto-update tip and the update sentence from the old install lesson; the environment part of the old open-it lesson; the Environments section from the reference; the recipes the map folds into these two sections.

This slice also removes what the rebuild leaves of the old course and recipe parts:

- every recipe the map marks "dropped", with its reason already in the record from the verdict slice (decision D14);
- the level-one headings of the old course part and the old recipe part, once nothing is left under them;
- no check-yourself block remains (each went with its lesson's text).

The same rules as the earlier rebuild slices: carried word for word, patched with exactly the recorded in-place changes, or rewritten afresh; move, never copy; every link or text reference to a heading this slice removes re-pointed in the same edit — including the troubleshooting block's link to the old refused-edit lesson and any reference to an old lesson by name or number that is still standing anywhere in the README; every claim of the new text given a row with a verdict.

### The plain-words check over all the how-to text

With part D written, all the how-to text exists: the quickstart, the stage sections and this part. This slice reads it whole, outside fenced captures and quoted product text, and records the result: no gate number, no plan number used as the name of work, no invented abbreviation, and every term spelled out at its first use in its section (pinned wording that carries an abbreviation is spelled out beside it, decision D8). A throwaway program lists every occurrence of the shapes "Gate" followed by a digit and a five-digit plan number followed by a hyphen outside fenced blocks, as a presence check; each hit is fixed or shown to be inside quoted product text. Abbreviations are checked by reading, and every one found is listed in the record with how it was spelled out.

### The disposable-copy procedure, if a capture must be taken here

Never with this repository as the project root. Make the project or the copy under `os.tmpdir()`; confirm with `findProjectRoot` in `src/lib/project-root.js` that the product resolves it as its root; list this repository's `plans/` and `.ctoc/` (without `.ctoc/logs/` and this plan's own record and captures) with sha256 checksums before the first run and after the last, into `.ctoc/verification/readme-captures/listings/`; run the real command with the output redirected to a new raw file; record the command line with placeholders, the exit code, the byte count and the checksum; attribute every listing difference; a difference caused by the run fails the slice.

### Constraints from the other tests that read the README

Every one holds at the end of this slice; the full gate proves it.

1. **`tests/readme-numbers.test.js`** — every pin stays green; in particular the absence of "auto-move to review" in the environment table, and every pin the earlier rebuild slices moved.
2. **`tests/compliance-claims-match-code.test.js`** — the literal marker NOT ENFORCED travels with every control that is not enforced and is named outside a fenced block. The settings table names the regulatory-regime setting; if a control is named beside it, the marker is in the same row.
3. **`tests/no-phantom-command-family.test.js`** — no new lowercase "ctoc" followed by a space and a lowercase word; count before and after recorded.
4. **`tests/no-tier-3.test.js`** — none of the five deleted scout names.
5. **`tests/ctoc-start-command.test.js`** — never the literal `ctoc:menu`.
6. **`tests/version.test.js` and the release sync** — one line-start bold version token (the footer) and no earlier one; the version badge; the version example; exactly one capture-version line (the dashboard capture); the structure-block count lines. Nothing in this part may add a line of the capture-version shape.

### Acceptance criteria

**Closes criterion 9**, quoted from the parent:

> 9. GIVEN the finished README, WHEN the how-to text (the quickstart, the stage sections and the after-the-journey part, outside fenced captures and quoted product text) is read, THEN it contains no gate number, no plan number used as the name of work, and no invented abbreviation, and every term is spelled out at its first use in its section.

**Owns part D of the parent's structure.**

Feeds, quoted from the parent: **6** ("no link or sentence points at a section by a name it no longer has" — the re-pointed references); **12** ("the environment part" among the places); **25**; **30** (the old course part's headings and blocks are gone).

### Evidence to record

The claim rows of the new text with verdicts; a how-and-why row per step of the refused-edit section; the placed captures with their raw files and transformations; the ranges moved and removed; every dropped recipe with its reason; every re-pointed link and reference, old and new; the plain-words check's program output and the list of abbreviations spelled out; the phantom count before and after.

### How to verify

1. `node --test tests/readme-numbers.test.js tests/compliance-claims-match-code.test.js tests/no-phantom-command-family.test.js tests/no-tier-3.test.js tests/ctoc-start-command.test.js tests/version.test.js` — all green.
2. A throwaway program confirms that every sentence range the map assigned to this slice stands in part D and nowhere else, that no sentence range of the old course or recipe parts is left anywhere that the map did not assign to a later slice, and that no link or reference names a heading that no longer exists.
3. The byte-for-byte comparison of each placed capture with its raw file, printed into the record.
4. `npm test` — zero failures, zero skipped, coverage at or above the floor. One commit with a patch version; nothing pushed.

### Wiring — the live call sites

No module is added. The README is rendered by GitHub and the marketplace; the two existing links to the environment heading keep resolving because its text is unchanged.

### Security review

- The refused-edit capture shows paths shortened to a placeholder; no home directory is committed.
- The settings table names setting keys only, never values that could be secrets.

### Shared file

No build of the improvement plan runs while this slice builds (the release sync rewrites `README.md` at its commits, and its slices do not declare the file). The dispatcher holds this.

## Decisions Taken Under Ambiguity

1. **The two-file settings table lives here, in keeping it healthy**, because part D names "the settings files" explicitly and the move rule allows one home. The reference's "settings" entry is handled by the reference slice without a second copy.
2. **The environment section keeps its heading text but may change its heading level** to sit under keeping it healthy; the anchor GitHub derives depends on the heading's text, not its level, so the two links to it keep resolving (to be confirmed against the anchor rule the web slice recorded).
3. **The plain-words check uses a presence search only to list candidates** for gate numbers and plan numbers; every hit is judged by reading, because whether a number is inside quoted product text is not a question a text search can answer.


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

---
iron_loop_verdict: true
iron_loop: true
title: "The decision-question format carries the lettered menu, the new-ideas block and the wait-until-satisfied rule, in both mirror files at once"
type: implementation
parent_plan: deepthink-ships-with-ctoc
depends_on: none
priority: medium
effort: medium
files:
  - skills/ask-me-questions/SKILL.md
  - .ctoc/ask-me-questions.md
  - tests/deepthink-ships-with-ctoc.test.js
  # RATCHET FILE — not counted toward the slice size. This slice brings the plan's
  # test file into existence, which moves the documented test-file count; the
  # release sync rewrites that count in CLAUDE.md and the build needs permission.
  - CLAUDE.md
approved_by: human
approved_at: 2026-09-30T11:39:25.314Z
gate_crossed: implementation → todo
---

# The decision-question format carries the lettered menu, the new-ideas block and the wait-until-satisfied rule, in both mirror files at once

**Scope (one line):** fold the three rules that only the human's personal copy has into CTOC's decision-question format, changing `skills/ask-me-questions/SKILL.md` and `.ctoc/ask-me-questions.md` together with identical bytes and removing none of CTOC's own rules, with the checks written first in the plan's test file and seen failing.

Read the parent plan in full first (`plans/implementation/deepthink-ships-with-ctoc.md`), in particular ALIGN, "The comparison of the two decision-question copies — the real result", "The binding that makes the fold-in a two-file change", and, under Decisions Taken Under Ambiguity, "The fold-in, three readings". Every decision in it is settled; this slice reopens none of them.

## Implementation Details

### Before the first edit — evidence the closing slice compares against

Recorded in this slice's execution record before any file changes:

1. **Content fingerprints of the human's two personal files**, read at their link targets and read only: the personal deepthink skill and the personal decision-question skill, both reached through `/Users/account/.claude/skills/` and pointing into `/Users/account/.claude-skills/`. Nothing under either folder is ever written, moved or deleted.
2. **Content fingerprints of the three improvement-run files this plan must leave alone:** `.ctoc/audit/agent-and-skill-improvement/inventory.json`, `plans/implementation/every-agent-and-specialist-skill-improved-three-times.md` and `tests/agent-and-skill-improvement-record.test.js`.
3. **The comparison repeated with a real difference program**, read only, its output recorded in full: the personal decision-question copy against `skills/ask-me-questions/SKILL.md`. The parent's comparison table was made by reading; this run is its machine record. A difference between the program's output and the parent's table is recorded as a finding for the human and is not acted on here.

A fingerprint is `sha256:` followed by the hexadecimal digest of the file's bytes, computed by a command, never by hand:

```
node -e "const c=require('crypto'),f=require('fs');for(const p of process.argv.slice(1))console.log('sha256:'+c.createHash('sha256').update(f.readFileSync(p)).digest('hex'),p)" <path> <path> ...
git diff --no-index -- <the personal decision-question copy> skills/ask-me-questions/SKILL.md
```

`git diff --no-index` exits non-zero when the files differ; that exit is the expected result here, not a failure.

### The three rules, and where each lands

CTOC's file keeps every heading, every numbered rule and every sentence it has today; the three rules are additions. One file is edited by hand; the other is then made identical by a byte copy with a command, never retyped, so the two cannot differ by a character.

1. **The lettered menu** — a new subsection inside "## The two-step flow", after "### Step 1 — …" and before "### Step 2 — …", dated as the personal copy dates it (Tijn, 2026-09-07). It says: every decision question ends with a plain lettered menu, one line per option, and the menu is the last thing on screen; it ends with the line `Reply with a letter.`; the human answers with one letter, which is mapped back to its option; the menu is mandatory on every question in every mode, including plain text where the AskUserQuestion widget is not used; the human is never made to type an option label; the recommended option is marked in the menu only on a quality decision and no option is marked on an owner decision (the same split as matrix rule 7). The template is shown in a fenced block, as the personal copy shows it. The parent's reading (a) is written into it: when the widget is also used, the menu still ends the text and the widget's options mirror the letters in the same order. One further sentence scopes it: the menu belongs to a decision question written in this format; a dashboard screen that prints its own numbered replies keeps them (the parent keeps those replies out of scope).
2. **New ideas are proposals to check** — a new subsection after the lettered-menu subsection, dated as the personal copy dates it (Tijn, 2026-09-07). It says: when a question introduces something the human has not said (a mechanism, a number, a policy, a process), that element is a new idea; under the matrix and before the menu, a short block titled **New ideas in this question, for you to check:** lists each such element in one line; an invented element is never folded silently into an option's wording or into a recorded decision; nothing the human has not confirmed is recorded as decided.
3. **Wait until the human is satisfied** — a paragraph in "## Sequencing — one question per turn, always", after its first paragraph. The heading, the first paragraph, the design-question paragraph and the settings ride-along exemption stay exactly as they are (reading (c)). It says: never move to the next question until the human has answered the current one and says they are satisfied; never answer or decide on the human's behalf; when the human asks for a further explanation, give it, then stop and offer two replies, `a) satisfied, next` and `b) more on this`. Per reading (b), this applies to a further explanation the human asked for, not to the explanation paragraph every question carries.
4. **The worked example follows the new rule.** The example under "## Minimum-viable example" gains the lettered menu as its last lines, inside the example and after its verbatim question sentence: the options in the order the AskUserQuestion call lists them (the recommended option first), the recommended one marked, then `Reply with a letter.`. The paragraph after the example says the widget's three options mirror those letters. The example carries no new-ideas block, because it introduces nothing the question did not come with and the block appears only when a question does. Inside its matrix the example still holds exactly one Recommended cell, under a question heading and an explanation paragraph, so both graders keep passing.
5. **"## What NOT to do" gains three lines**, and loses none: never end a question without the lettered menu as the last thing on screen; never fold a new idea silently into an option or a recorded decision; never move to the next question before the human says they are satisfied.

**Not folded, as the parent's table decides:** the absolute sequencing sentence, the exactly-one-recommendation rule, the personal rule numbering, the personal worked example, the personal references section and the personal frontmatter description.

**Must not change:** the frontmatter, byte for byte, including its `allowed-tools:` line (`tests/architecture-invariants.test.js` exempts this one file from the frontmatter rule because it is a verbatim mirror); the strings `the one exemption`, `single AskUserQuestion call` and `One question per turn`, pinned in `tests/readme-numbers.test.js`; the absence of `plan-serial`; and the absence of a `ctoc:claims` block. The improvement record check digests each inventoried file's claims block and recorded this file's as absent at the start, so adding one turns that check red.

### The checks, written first

`tests/deepthink-ships-with-ctoc.test.js` begins in this slice with one group, "the decision-question format carries the three rules and loses none of its own". It reads `skills/ask-me-questions/SKILL.md` only. The byte identity of the pair is already asserted by `tests/ask-me-questions-skill.test.js` and `tests/readme-numbers.test.js` and is not restated.

1. **Nothing CTOC carried is removed.** A list of every heading line and every bold span in the file, captured from disk by a throwaway program at the start of this slice and pasted into the test as literals; each must still be present. This check passes before the edit by construction — it is the guard against removal — and its passing-before result is recorded and not counted as evidence that anything was built.
2. **The lettered menu rule is present:** the sentence that makes the menu the last thing on screen on every question, in every mode including plain text, pinned exactly as written, and the literal `Reply with a letter.`.
3. **The new-ideas block is present:** the literal `New ideas in this question, for you to check` and the sentence that nothing unconfirmed is recorded as decided.
4. **The wait-until-satisfied rule is present:** the sentence that the next question waits until the human says they are satisfied, and the literals `satisfied, next` and `more on this`.
5. **The worked example ends with the menu:** the example is found exactly as `tests/ask-me-questions-format.test.js` finds it (the fenced block containing the box-drawing vertical line), and its last non-empty line is `Reply with a letter.`.
6. **Plain words in what was added.** The three added passages, found by their headings and by the added paragraph's first sentence, must exist; a missing passage fails the check and never passes it. On their text: `gradeNoAbbreviations` from `evals/lib/graders.js` passes; outside backticks, no standalone word of two or more capital letters appears unless it is on an allow-list held in the test with a written reason per entry (the list starts with `CTOC`, the product's own name); and nothing matches the gate word-and-digit pattern, `GATE_DIGIT` in `src/lib/instruction-gate-words-scan.js` — not exported, so the test restates it with a comment naming its source. These checks read the added passages only, because the file's own abbreviation rule quotes the abbreviations it bans (`"PR"`, `"UI"`), so the grader fails the whole file by construction.

Run the test before editing either file and record the result: checks 2 to 6 fail, each because its rule is absent; check 1 passes.

### Tests that must stay green

The inventory's measured list of the tests that read `skills/ask-me-questions/SKILL.md` (its `tests_reading` in `.ctoc/audit/agent-and-skill-improvement/inventory.json`): `tests/agent-honest-status-fence.test.js`, `tests/architecture-invariants.test.js`, `tests/ask-me-questions-format.test.js`, `tests/ask-me-questions-skill.test.js`, `tests/claim-census.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/compliance-seam-is-executable.test.js`, `tests/export-reachability.test.js`, `tests/gate-numbers-fence.test.js`, `tests/iron-loop-enforcer.test.js`, `tests/no-model-optimized-for.test.js`, `tests/plugin-skill-discovery.test.js`, `tests/reachability-surface-scan-is-linear.test.js`, `tests/reachability.test.js`, `tests/readme-numbers.test.js`, `tests/session-start-question-dispatch.test.js`, `tests/streaming-render.test.js`, `tests/test-gate-ledger-wiring.test.js` and `tests/unexecutable-instruction-fence.test.js`; plus `tests/agent-and-skill-improvement-record.test.js`, which reads this file's claims block. If one of them pins wording this slice changes, the build stops and asks through the scope-growth question (`src/lib/scope-growth.js`, the executor's rule 5); the declared files are not amended.

### How to verify

1. The failing run above, recorded.
2. Edit `skills/ask-me-questions/SKILL.md`; copy its bytes to `.ctoc/ask-me-questions.md` with a command.
3. The plan's test and every test listed above pass.
4. The release sync runs before the full gate. This slice's test file moves the documented test-file count, which the README's derived pin and CLAUDE.md state, and the sync rewrites both:

```
node src/scripts/release.js
npm test
```

5. `npm test` — zero failures, zero skipped, coverage at or above the floor read from `.ctoc/coverage-baseline.json`. One commit carrying a patch version by the release rule; nothing pushed.

### Shared files and the neighbouring plans (technical facts; the order is the human's)

- **The improvement run's slice for the decision-question format** (`00268-every-agent-and-specialist-skill-improved-three-times-s8-ask-me-questions`, in the build queue) declares `skills/ask-me-questions/SKILL.md`, as this slice does. The two are never built at the same time: builds run one at a time on the shared tree, and the scheduler serializes plans whose declared files overlap. Either order works technically. If this slice lands first, that slice's first round starts from a fingerprint that differs from the inventory's starting one; the record check compares rounds with each other and never compares the inventory's starting fingerprint with the disk (read in `checkRecordDir`), so it stays green, and that slice's rule — findings on the pair go to the human and are never applied — is unaffected. If that slice runs first, its findings about the pair sit in its list for the human; this slice neither reads nor changes that list.
- **The README.** This slice's commit runs the release sync, which rewrites README.md's version lines and its test-file count. No README rebuild slice that writes README.md (`00388-the-readme-matches-the-product-today-s7-opening-and-quickstart` to `00396-the-readme-matches-the-product-today-s15-record-totals-and-full-gate`) is built at the same time. The release sync's write is not a declared file, so the scheduler cannot see that overlap; the dispatcher holds it, as it does for the improvement run's slices.

### Wiring — the live call sites

No module is added. The decision format is reached through the plugin manifest's first `skills` entry, `./skills/`, as `/ctoc:ask-me-questions`; `.ctoc/ask-me-questions.md` is the format `src/commands/start.md` and CLAUDE.md send every question through. The plan's test runs under `npm test`.

### Security review

- The personal files are read for a fingerprint and a comparison only; no command writes under `/Users/account/.claude/` or `/Users/account/.claude-skills/`. The test never reads them.
- No secret enters any file or any recorded output.

### Acceptance criteria

**Closes scenario 14** of the parent: the pair byte-identical and changed together; the three pinned strings present and `plan-serial` absent; the worked example passing both graders; every heading and key sentence on the pre-change list present; and the three new rules present — the lettered menu last on screen ending "Reply with a letter.", the "New ideas in this question, for you to check" block, and the rule that a further explanation the human asked for stops and offers "satisfied, next" or "more on this".

**Closes two Definition of Done items:** "the fold-in and the mirror are byte-identical and were changed together, and the pre-change list of CTOC headings and key sentences is intact"; and "the comparison of the two decision-question copies was repeated with a real `diff`, and its output is recorded".

**Feeds:** scenario 13, the folded text's plain-word checks (closed by slice 2); scenarios 16 and 21, the fingerprints taken before the first edit (compared by slice 4); the Definition of Done item on the test written first (checked across the slices by slice 4).

## Decisions Taken Under Ambiguity

1. **"Written first … before any other file changed" is read per slice.** The parent's Definition of Done assumed one unit of work. Sliced, each slice writes its own assertions first and records them failing before it changes any other file; slice 4 checks that each of the first three slices recorded such a run.
2. **The rules are added as new subsections and one paragraph, and Step 1 is not touched.** Step 1's sentences are on the pre-change list, so the new elements come after its four parts: the new-ideas block when one applies, then the lettered menu, last.
3. **The worked example gains the menu and no new-ideas block**, reading "when a question introduces something the user has not said" literally: the example's options answer the question it asks.
4. **One scoping sentence** keeps the lettered menu from contradicting the dashboard's own numbered replies, which the parent keeps out of scope.
5. **The plain-word checks read the added passages only**, for the reason given under check 6.
6. **The mirror is made identical by a byte copy**, not by typing the same edit twice.


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

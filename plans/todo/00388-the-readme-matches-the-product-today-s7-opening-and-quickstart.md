---
iron_loop_verdict: true
iron_loop: true
title: "The rebuilt opening and the quickstart — what the product is, what ships about the human's moments, and the fewest real steps from nothing to a pushed piece of work"
type: implementation
parent_plan: the-readme-matches-the-product-today
depends_on: 00387-the-readme-matches-the-product-today-s6-piece-verdicts
priority: medium
effort: medium
files:
  - README.md
  - tests/readme-numbers.test.js
  - .ctoc/verification/readme-truth-record.md
  - .ctoc/verification/readme-captures/**
approved_by: human
approved_at: 2026-09-30T07:58:20.153Z
gate_crossed: implementation → todo
---

# The rebuilt opening and the quickstart — what the product is, what ships about the human's moments, and the fewest real steps from nothing to a pushed piece of work

**Scope (one line):** write parts A (the opening) and B (the quickstart) of the rebuilt README at the top of the file, moving into them the pre-pass text the map assigns to this slice and removing it from where it stood, with the three pins that hold this text written first and seen failing.

Read the parent plan in full first. The structure (A to E), the style requirements, the capture rules and the carried-versus-rewritten rules are settled there.

## Implementation Details

### What this slice writes in the README

**Part A — the opening** (everything before the first level-one heading):

- The title block and the badge row, kept as they are, including the version badge the release sync rewrites and the agent and skill badges the guard test pins.
- A few plain sentences saying what the product is, carrying the counts in the pinned forms: `**124 agents** across **24 categories**` (the lead-paragraph pin, kept in that form) and the skill-file total in the bold form `**N skill files**`, N derived from disk.
- What ships about the human's moments (criterion 12, the human's decision "README says what ships"): of the four moments, "what to build" and "how to build it" can cross on enough information and are then recorded in the ledger as a sufficiency crossing; "the idea to explore" and "it is finished" never cross that way. No sentence here says all four are mandatory or that nothing crosses them on its own.
- A pointer to the quickstart.
- No claim about how the agents or the skill library were improved. The lead paragraph's claim about the improvement loop leaves the opening; it stays stated, marked not verified, in the Skills section until the three-round slice replaces it (criterion 18).

**Part B — the quickstart**, the first level-one part after the opening (heading `# Quickstart`, decision D3), in the order the parent fixes: install from the marketplace, open it, say an idea or a precise change, answer what is asked, let it build, say it is finished, push.

- **Each step shows the real command or the real screen, and is followed in the same or the next sentence by one sentence saying why** (criterion 31); each why gets a row naming the run or the source lines it rests on.
- **The walk decides "fewest".** The steps are the journey walk recorded by the fresh-project slice. A step the product does not need is not written; a step it needs and the parent's list lacks is written and named in the record.
- **The open step shows the first-run capture verbatim**, including its line that says Production means "auto-push after gates", with the correcting sentence beside it stating what the code does (criterion 14; the two places read are the reading slice's row). The three first-run questions are shown here; their deeper explanation (the environment) belongs to the keeping-it-healthy section. The compliance choice is explained here in one sentence, with the marker NOT ENFORCED beside any control it names.
- **The promise sentence about captures appears here, once, where the first capture appears** (decision D6): a capture is a snapshot whose counts show that moment; the version line always shows the current version.
- **A step whose reply a model session writes** (the idea being explored, the plans being written) shows the exact words to type and a table that says it is a summary of what comes back — never a pasted imitation (decision D7). Each such step is marked not verified where it stands.
- **Self-contained:** every command the reader types is shown in the quickstart itself, and no step sends the reader elsewhere in the README to be able to continue (criterion 28).
- The "answer what is asked" and "say it is finished" steps carry what ships about the moments, as in the opening.

### Which pre-pass text moves here, and the rule for moving it

The settled map (from the verdict slice) names the sentence ranges this slice places. Expected: the lead paragraph; the reading guide's promise sentence (the rest of the reading guide is removed by instruction); the install step of the old install lesson; the open step, the first-run capture and its three questions from the old open-it lesson; the entrance for a precise change and its recipe; the Key Features bullets on stack detection and on the skill-file total.

- **A piece left as it is** is carried word for word. **A patched piece** is carried with exactly its recorded in-place corrections and every other character unchanged. **A rewritten piece** is written afresh from what the real product does, never by editing its old sentences, and each claim of the new text gets a row.
- **Move, never copy.** A sentence placed here is removed from where it stood in the same edit, so at every commit each surviving sentence of the pre-pass README stands exactly once. An old piece disappears in the slice that places its last sentence; until then its remaining sentences stay where they were. Between the rebuild slices the README therefore reads part new, part old — expected, and never pushed without the human.
- **Every link or text reference to a heading this slice removes is re-pointed in the same edit** (the reading guide's table links go with the reading guide). No slice leaves a link pointing at a heading it took away.
- **New text is claims like any other**: every claim the new connective text makes, and every why, gets a row with a method and a verdict before the slice ends.
- A capture this slice finds it needs and the capture slices did not take is taken by the procedure below, never typed.

### The pins, written first and seen failing

All three live in `tests/readme-numbers.test.js`. Each is written, run against the README as it stands before this slice's edits, and seen red, before the README is touched. The run and its failure output go into the record. No other assertion is weakened or deleted.

1. **The four-moment pin (criterion 13).** In the group of tests about instruction-surface truth, the assertion that the README says "adversarial review and the four human gates catch what a first pass misses" is replaced by a pin of the true statement. The assertion that "on the first try" is absent stays. The new pin asserts, inside the opening: a paragraph that says the moments can cross on "enough information" and names the "sufficiency crossing", naming each moment that path crosses and each it does not; and that the withdrawn sentence, and any phrase saying the human gates are mandatory, are absent from the opening. **Which moments cross is derived from the code, never typed by hand**, from these exports: `PRE_BUILD_GATES` in `src/lib/approval-residency.js` (the gate destinations at which a sufficiency ledger entry is accepted), `GATE_SOURCE`, `GATE_DESTINATIONS` and `GATE_EDGES` in `src/lib/gate-order.js`, and the keys of `EDGES` in `src/lib/gate-words.js` (the one moment it names that is no gate edge in the code — the idea to explore). Each moment is recognised in the paragraph by the label the dashboard prints for the stage the plan is leaving, by the dashboard's own transformation. A sketch of the derivation, for the builder to write test-first:

   ```js
   const { PRE_BUILD_GATES } = require('../src/lib/approval-residency');
   const { GATE_SOURCE, GATE_DESTINATIONS, GATE_EDGES } = require('../src/lib/gate-order');
   const { EDGES } = require('../src/lib/gate-words');
   const label = (stage) => stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
   const gateSources = new Set(GATE_EDGES.map(([from]) => from));
   const crossedFrom = [...PRE_BUILD_GATES].map((to) => GATE_SOURCE[to]);         // today: functional, implementation
   const notCrossedFrom = [
     ...GATE_DESTINATIONS.filter((to) => !PRE_BUILD_GATES.has(to)).map((to) => GATE_SOURCE[to]), // today: review
     ...Object.keys(EDGES).filter((from) => !gateSources.has(from)),                              // today: vision
   ];
   ```

   It is stricter than what it replaces: it looks inside the opening rather than anywhere, it requires the true statement and the absence of the withdrawn one, and a code change to which moments cross turns it red.
2. **The skill-file total, re-pointed (the pin named "Key Features: skill-file total").** The same derived expression, asserted inside the opening (the text before the first level-one heading) instead of anywhere in the file. Renamed for what it guards. Red before the edit, because the pre-pass opening states the total as "429-file skill library", not in the bold form.
3. **"14 languages", re-pointed (the pin named "Key Features: 14 languages auto-detected").** Asserted inside the quickstart part (from its level-one heading to the next). If the reading slice found the number wrong, the number is derived from the stack detector's own list where it exposes one, otherwise it is the number that slice measured, printed in the record (criterion 7). Renamed for what it guards.

Each replaced or moved pin gets its written justification in the record: the contract that changed (the human's instructions of 2026-09-29, quoted verbatim), why the test and not the README, and what newly fails.

### The disposable-copy procedure, if a capture must be taken here

Never with this repository as the project root. Make the project under `os.tmpdir()`, outside the repository; confirm with `findProjectRoot` in `src/lib/project-root.js` that the product resolves it as its root; list this repository's `plans/` and `.ctoc/` (without `.ctoc/logs/` and this plan's own record and captures) with sha256 checksums before the first run and after the last, into `.ctoc/verification/readme-captures/listings/`; run the real command with the output redirected to a new raw file (never overwriting an existing one); record the command line with placeholders for absolute paths, the exit code, the byte count and the checksum; attribute every listing difference; a difference caused by the run fails the slice.

### Constraints from the other tests that read the README

Every one holds at the end of this slice; the full gate proves it.

1. **`tests/readme-numbers.test.js`** — every pin this slice does not deliberately change stays green: the two badge pins; the lead-paragraph pin; the comparison-row, Agents-intro, Skills-intro and Skills two-kinds pins; the structure-block pins (3 slash commands, 17 hooks, JS modules, test files, agent definitions, skill files); the refinement-loop phase words; "17 KPIs"; the SaaS template rows; the dispatch-logging sentence; the absences (Haiku scouts, a Tier 3 table row, "on the first try", "auto-move to review", "plan-serial"); the nine required headings; and the Key Features agent-count and sub-orchestrator pins, which stay pointed where they are until the reference slice moves them.
2. **`tests/compliance-claims-match-code.test.js`** — wherever a control that is not enforced is named outside a fenced block, the literal marker NOT ENFORCED stands in the same table row or list item or, for prose and headings, in the same heading-delimited section. New headings move section boundaries, so the marker moves with every control named in text this slice writes or moves. The first-run capture is fenced and exempt.
3. **`tests/no-phantom-command-family.test.js`** — no new occurrence of a lowercase "ctoc" followed by a space and a lowercase word (a sentence such as "install ctoc from" would add one). The count before and after is recorded against the census's baseline. No invented command family.
4. **`tests/no-tier-3.test.js`** — none of the five deleted scout names appears.
5. **`tests/ctoc-start-command.test.js`** — the literal `ctoc:menu` never appears.
6. **`tests/version.test.js` and the release sync** — the shapes stay exactly: one line-start bold version token (today the footer), with no earlier line starting with a bold version-shaped token; the version badge; the version example in the developer block; exactly one line that is exactly the capture-version line `CTOC v<version>` (today the first line of the dashboard capture, which this slice does not move); and the structure-block lines for the test-file count and the library-module count, with the words "test files" and "JS modules" as they are.
7. **Plain words** (style requirement 5 and decision D8) — every term spelled out at its first use in its section; pinned wording that carries an abbreviation stays exactly as pinned and is spelled out beside it. No gate number and no plan number in the quickstart (style requirement 7); captures stay verbatim.

### Acceptance criteria

**Closes criteria 13, 14 and 28**, quoted from the parent:

> 13. GIVEN the guard test pins the README sentence "adversarial review and the four human gates catch what a first pass misses" (in the group of tests about instruction-surface truth), a contract the human has explicitly replaced, WHEN the four-moment sentences are corrected, THEN that pin is replaced, written first and seen failing against the current README, by a pin of the true statement that is stricter than what it replaces: it asserts that the README says the two build-plan moments can cross on enough information and names the moments not crossed (derived from the code where the code exposes them, never a hand-typed list), and that the withdrawn claim is absent; the assertion that the phrase "on the first try" is absent stays; no other assertion is weakened or deleted (any further pin the rebuild moves is governed by criterion 26).

> 14. GIVEN the first-run screen says Production means "auto-push after gates" while the code's production profile sets no auto-push, WHEN the pass reaches the quickstart's open step, THEN the capture stays verbatim, including that line, a correcting sentence beside it states what the code does, the record row cites the two places read, and the wrong screen text stays a recorded finding.

> 28. GIVEN a fresh disposable project with no `.ctoc/` folder and only the quickstart text, WHEN a newcomer follows its steps in order — install from the marketplace, open the dashboard, say an idea or a precise change, answer what is asked, let the build run, say it is finished, push — THEN every command the quickstart tells them to type is shown in the quickstart itself, every screen it shows is the one the product prints at that step, no step sends them elsewhere in the README to be able to continue, and the record shows for each step that the walk needed it and that no step the walk needed is missing. The builder alone observes this (the limits of criterion 1 apply): the first-run screen, the stage moves, the build start, the verification evidence and the crossing to done are driven through the product's real entry points, which the header of the greenfield-journey test lists; whatever needs the host or a model session is marked not verified where it stands and listed in the record, never presented as observed.

**Owns parts A and B of the parent's structure.**

Feeds, quoted from the parent: **9** (the quickstart is how-to text: "no gate number, no plan number used as the name of work, and no invented abbreviation"); **11** ("stated once where the first capture appears"); **12** ("the opening, the quickstart" among the places); **26** (the two moved pins); **31** (the quickstart's whys).

### Evidence to record

The pins' red run and green run; the justifications of the replaced and moved pins; for every quickstart step, a how-and-why row (the how and the why quoted, and what each rests on) and the journey-walk step it matches; for every placed capture, its raw file and the transformations applied (a path shortened to a placeholder, or a long body elided with a marker naming what was cut — nothing else); the claim rows of the new text with verdicts; the list of sentence ranges moved and removed; the phantom count before and after.

### How to verify

1. The three pins red before the README edit, green after.
2. `node --test tests/readme-numbers.test.js tests/compliance-claims-match-code.test.js tests/no-phantom-command-family.test.js tests/no-tier-3.test.js tests/ctoc-start-command.test.js tests/version.test.js` — all green.
3. A throwaway program confirms that each sentence range the map assigned to this slice now stands in part A or B and nowhere else, and that no other sentence of the pre-pass README was changed except by a recorded row.
4. A throwaway program applies each placed capture's recorded transformations to its raw file and compares the result byte for byte with the fenced block; its printed result goes into the record.
5. `npm test` — zero failures, zero skipped, coverage at or above the floor in `.ctoc/coverage-baseline.json`. One commit with a patch version by the release rule; nothing pushed.

### Wiring — the live call sites

No module is added. `README.md` is rendered by GitHub and the marketplace listing and rewritten by `node src/scripts/release.js` at every release; `tests/readme-numbers.test.js` runs under `npm test`.

### Security review

- No secret, token or home-directory path in any placed capture or new sentence; paths in captures are shortened to a placeholder by the closed list of shortenings.
- Every web address the new text carries is one the web slice fetched, or is fetched by the links slice.

### Shared file

`README.md` is also rewritten by the release sync at every commit of the improvement plan's slices, and those slices do not declare `README.md`, so the scheduler cannot see the overlap. No build of the improvement plan runs while this slice builds; the dispatcher holds that.

## Decisions Taken Under Ambiguity

1. **The pins travel with the text they pin.** The parent's notes list the pins as a step before the rebuild; written in a slice of their own they would leave that slice red at its own gate. Each pin is therefore written first, seen failing and turned green inside the slice that writes the text it holds — the brief's order, and test-driven development within one unit.
2. **Which moments cross is derived from `PRE_BUILD_GATES` in `src/lib/approval-residency.js`**, not from the streaming gate's own `PRE_BUILD_DESTINATIONS`, because that one is not exported and `PRE_BUILD_GATES` is the set the approval check accepts a sufficiency entry for — the same derivation, and the one that decides whether the crossing stands. The idea-to-explore moment comes from `gate-words`, since the code holds it as no gate edge at all.
3. **The moments are recognised in the pin by the stage labels the dashboard prints**, because the plain-word names of the moments are the parent's decided wording and exist in no code; the stage labels are derived by the dashboard's own transformation, so the pin holds no hand-typed list.
4. **The quickstart is a level-one part with its steps below it**, by decision D3, so the scoped pins can find its text between two level-one headings.
5. **If the fresh first-run output carries a capture-version line, the slice stops and asks the human.** The pre-pass first-run capture has no such line (read), so this is not expected. If the real output has one, criterion 14 (show the capture verbatim) and decision D9 (exactly one line of that shape, because the release sync rewrites only the first and a second goes stale unseen) cannot both hold; that sets two of his decisions against each other, so it is a question for him, not a guess here.


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

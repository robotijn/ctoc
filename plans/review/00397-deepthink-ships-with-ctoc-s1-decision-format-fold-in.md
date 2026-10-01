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
2. **The rules are added as new subsections and one paragraph; Step 1's four parts are not touched.** Step 1's four bold labels are on the pre-change list; its opening sentence is not, and no test pinned it until check 2 pinned its new wording at review. The new elements come after the four parts: the new-ideas block when one applies, then the lettered menu, last. At review, "has four parts" became "opens with four parts", and Step 2's "the one sentence from the previous paragraph" became "the verbatim question sentence from Step 1, written after the matrix", because the insertions made the first false and left the second pointing at the new-ideas subsection. No rule was removed.
3. **The worked example gains the menu and no new-ideas block**, reading "when a question introduces something the user has not said" literally: the example's options answer the question it asks.
4. **One scoping sentence** keeps the lettered menu from contradicting the dashboard's own numbered replies, which the parent keeps out of scope.
5. **The plain-word checks read the added passages only**, for the reason given under check 6.
6. **The mirror is made identical by a byte copy**, not by typing the same edit twice.
7. **Check 6 also proves its own instruments fire.** Before it reads the added passages, it asserts that the abbreviation grader flags "PR", that the capital-word check flags "UI" in prose while skipping a backticked word and the allow-list, and that the gate word-and-digit pattern matches a sample gate label with a digit. A plain-word check whose instruments never fire would pass on any text. The group keeps its six checks.
8. **The real comparison is recorded with a line number in front of every line.** The specification hash does not see code fences, so an unchanged context line of the comparison that begins with `##` would read as a heading and move the approved plan's hash. Every byte of every line is kept.
9. **The added text says "the user"**, the decision format's own word throughout, where this plan's items say "the human".
10. **Both new subsections state the on-screen order of decision 2:** the question sentence, then the new-ideas block when one applies, then the lettered menu, last.
11. **The worked example's menu lines carry one clause each, taken from the example's own matrix** (deliverability, the free tier, the cost per message), so the menu introduces nothing the matrix does not say and needs no new-ideas block.
12. **Two read-only version-control commands beyond the one the build brief allowed were run:** `git show HEAD:skills/ask-me-questions/SKILL.md`, to compare the frontmatter before and after, and `git diff --stat` on the two mirror files, to count added and removed lines. Neither writes. Recorded as a departure from the brief.
13. **The fingerprints and the comparison were taken before any file changed, and written into this record after the test file existed and its failing run was taken**, but before either mirror file changed. The plan asked for them to be recorded before any file changed; the measurements are from before, the writing is not.
14. **The baseline of the tests that read the decision format was taken with this slice's test file already on disk**, so the derived test-file count pin was red for the reason the plan predicts. The file was not moved away to produce a green baseline.
15. **The two security assertions sit in the checks for their own rules:** the provenance wording in check 3 (the new-ideas block) and the separation sentence in check 4 (the wait-until-satisfied rule), rather than all four new assertions in check 2. The group keeps six checks, and each check still holds one rule.
16. **`git diff HEAD --numstat` was run on the two mirror files and the test file**, read only, to count the lines changed against the last commit, beside the `git diff HEAD -- README.md CLAUDE.md` the session asked for.
17. **The worked example's rows were reordered by moving whole row blocks**, not by text replacement: the script finds each row by its first cell, asserts each occurs once and that Postmark directly follows Resend, and swaps the two blocks with the separator between them.
18. **The row-order assertion sits in check 5**, the check that reads the worked example, so the group keeps six checks. It reads the first cell of each matrix row and the option name of each menu line, and compares both with one list.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — the checks 1 to 6 in `tests/deepthink-ships-with-ctoc.test.js` (execution record, "The checks written first")
- [x] Test error conditions — check 6 fails when a passage is missing, and first proves its three instruments fire on known-bad text
- [x] Run tests - expect RED (failing) — 1 passed by construction, 5 failed for the stated reasons; on the return after review and security, the four new assertions failed and the rest passed; at the second return, after the final review, the two exception assertions failed and the rest passed (execution record)

### Step 9: PREPARE
- [x] Install dependencies if needed — none needed
- [x] Check prerequisites — fingerprints and the real comparison taken before any file changed (execution record)
- [x] Verify dev environment ready — Node v24.14.1
- [x] Create directories/config if needed — none needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — five insertions by script, then the byte copy and `cmp` (execution record, "The fold-in"); at each return to the test step, the scripted replacements, then the byte copy and `cmp` again (execution record, "Return to the test step")
- [x] Add error handling — not applicable: instruction text, no code path
- [x] Wire up integration points — no module added; reached through the manifest entry `./skills/` and the mirror `.ctoc/ask-me-questions.md`; the test runs under `npm test`

### Step 11: REVIEW
- [x] Self-review all new code — the session's review, kept in `.ctoc/audit/deepthink-run-notes/s1-step11-review-d-deepthink-s1-step11-review.md`: returned to the test step, findings 1 to 4 fixed (execution record, "Return to the test step")
- [x] Verify integration points work together — same review report, checks 1, 2 and 7
- [x] Check error handling completeness — same review report, finding 3 (line endings) fixed

### Step 12: OPTIMIZE
- [x] Remove redundant operations — nothing to optimise in instruction text (execution record, "Optimise")
- [x] Optimize critical paths — not applicable: no code path
- [x] Simplify complex code — not applicable: no code changed outside the test file

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — the session's security scan, kept in `.ctoc/audit/deepthink-run-notes/s1-step13-secure-d-deepthink-s1-step13-secure.md`: the test reads one fixed path
- [x] Sanitize outputs — same scan report: the high finding (the two-reply offer reusing the menu's letters) fixed
- [x] No secrets in code — same scan report: no secret, no hidden character; the account path in the approved text is put to the owner
- [x] Safe file operations — same scan report: the test loads only built-in modules and a fixed relative path

### Step 14: VERIFY
- [x] Run lint + type check — both exit status 0, re-run on the final bytes after the second return (execution record, "Verify")
- [x] Run ALL tests (TDD Green) — `npm test` on the final bytes after the second return: exit status 0, 12041 passed, 0 failed
- [x] Check coverage >= 80% — 99.9 per cent of lines against the floor of 99
- [x] 0 skipped, 0 flaky tests — none left out, none failing

### Step 15: DOCUMENT
- [x] Update relevant documentation — the decision format is its own documentation; the release sync rewrote the test-file count
- [x] Add JSDoc comments to new functions — each helper in the test file carries a comment; `readSkill` gained its comment at the return after review
- [x] Update CHANGELOG if needed — no changelog file exists in the repository

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — the first final review, kept in `.ctoc/audit/deepthink-run-notes/s1-step16-final-review-d-deepthink-s1-step16-final-review.md`, returned to the test step; the second, kept in `.ctoc/audit/deepthink-run-notes/s1-step16-final-review-2-d-deepthink-s1-step16-final-review-2.md`, is ready
- [x] All quality checks passed — `npm test` on the final bytes: 12041 passed, 0 failed, coverage 99.9 per cent against the floor of 99 (execution record, "Verify")
- [x] Manual verification if needed — both final reviews read the two mirror files in full; a live session following the new rules is listed under "Not verified"
- [x] Ready for human review — the second final review is ready; completed through the menu's task completion


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record (Steps 8–16)

Written by the build executor. The owner's home folder is shortened to `<home>` everywhere in this record.

### Before the first edit — the fingerprints (taken 2026-10-01, before any file of this slice changed)

Command: the plan's fingerprint command, `node -e "…"` exactly as written under "Before the first edit", run from the repository root. Output:

```
sha256:142ffd63a94281f5776bf2a58d91b02fe877408c44ae39d902873c09070e77d9 <home>/.claude/skills/deepthink/SKILL.md
sha256:5734622bee01cfec19989c2040bfbecefe94410f871a8a37dbe6a6883c8ff3f7 <home>/.claude/skills/ask-me-questions/SKILL.md
sha256:72d67c77ee3c6e1fc494bf49461e5d7175ce75a83b9588fa0da1bb9771d9b604 .ctoc/audit/agent-and-skill-improvement/inventory.json
sha256:419638a124251609ded8b1ef3918b56a89d9dec3b9b6b63a0e322d975d05637d plans/implementation/every-agent-and-specialist-skill-improved-three-times.md
sha256:5bb3ffd8e1d13c988f4242c263fee9659d4af3c641743504c821e3f769f7bf5f tests/agent-and-skill-improvement-record.test.js
sha256:a527d3dafb4d92394ebf05bb44324a9f6c66d0c1abd4c29124344c94ed39b410 skills/ask-me-questions/SKILL.md
sha256:a527d3dafb4d92394ebf05bb44324a9f6c66d0c1abd4c29124344c94ed39b410 .ctoc/ask-me-questions.md
```

- The first two lines are the owner's personal deepthink skill and personal decision-question skill, read through the links `<home>/.claude/skills/deepthink` and `<home>/.claude/skills/ask-me-questions`, which point to `<home>/.claude-skills/deepthink` and `<home>/.claude-skills/ask-me-questions`. Nothing under either folder was written.
- Lines three to five are the three improvement-run files this plan must leave alone.
- The last two lines are the starting fingerprints of the two mirror files; they were identical before the edit.

### Before the first edit — the real comparison

Command: `git diff --no-index -- <home>/.claude/skills/ask-me-questions/SKILL.md skills/ask-me-questions/SKILL.md`. Exit status 1, the expected result when the files differ. Output: 234 lines, recorded in full below. Each line carries its line number and `| ` in front of it. Reason: the specification hash (`computeSpecHash` in `src/lib/approval-ledger.js`) does not see code fences, so an unchanged context line such as ` ## Empty state` would read as a heading, end this record's exclusion from the hash, and change the hash of an approved plan. The prefix keeps every byte of every line and keeps the record out of the specification.

```
001| diff --git a<home>/.claude/skills/ask-me-questions/SKILL.md b/skills/ask-me-questions/SKILL.md
002| index 2279f3db..d5602aec 100644
003| --- a<home>/.claude/skills/ask-me-questions/SKILL.md
004| +++ b/skills/ask-me-questions/SKILL.md
005| @@ -1,21 +1,90 @@
006|  ---
007|  name: ask-me-questions
008| -description: Render pending decisions as a markdown matrix with pros, cons, and one quality-only recommendation, then collect the user's choice via AskUserQuestion. Never put the matrix inside the question. Never use abbreviations.
009| +description: Render pending decisions as a matrix with pros, cons, and — only for a decision that has an objectively best answer — one quality recommendation, then collect the user's choice via AskUserQuestion. Never manufacture a recommendation on a decision the user owns. Never present a foregone answer as a real choice. Never put the matrix inside the question. Never use abbreviations.
010|  allowed-tools: [AskUserQuestion, Read, WebSearch]
011|  ---
012|  
013| -# /ask-me-questions — Structured Decision Elicitation
014| -
015| -When invoked, present pending design or decision questions in a strict two-step format: matrix first, AskUserQuestion second. The skill is fully automatic — once invoked, run both steps without asking the user any intermediate clarification.
016| -
017| -## When to use this skill
018| -
019| -- The assistant has accumulated one to four pending decisions from research, planning, critique, or a subagent's report.
020| +# ask-me-questions — Structured Decision Elicitation
021| +
022| +> This is CTOC's canonical format for asking the user a decision question. The
023| +> discussion phase (`claude:discuss`) and every "gap → question" in the menu
024| +> system MUST follow it. Present pending decisions in a strict two-step format:
025| +> matrix first, AskUserQuestion second. Once started, run both steps without
026| +> asking the user any intermediate clarification.
027| +
028| +## The paramount principle — maximize information gain, minimize user interactions
029| +
030| +**This is the most important rule of all, and it governs every other rule below.**
031| +The user's time and attention are the scarcest resource in the whole system, and
032| +every question spends them. So optimize the user's interaction time above all:
033| +**maximize the information you get from each question, and therefore minimize the
034| +total number of user interactions.** This is optimal-experiment-design / active
035| +learning applied to the human's attention — pick the query with the highest
036| +expected information gain (the greatest reduction in uncertainty), spend the fewest
037| +interactions, extract the most from each.
038| +
039| +Concretely:
040| +
041| +1. **Ask the highest-information question first.** Order the whole backlog by the
042| +   answer's value: **most CRITICAL issues first, then IMPORTANT, then work toward
043| +   the clearer and smaller ones.** Sort by severity ACROSS plans, not per-plan —
044| +   show-stoppers before cosmetics. A low-information question must never precede a
045| +   high-information one.
046| +2. **Pack each question to harvest the most.** A well-framed question with
047| +   precomputed options (pros, cons, and — only when the decision has an objectively
048| +   best answer — a recommendation) and an "Other" free-text path collects a decision
049| +   AND its rationale in a single interaction. One rich question beats three thin ones.
050| +3. **Never ask what can be inferred, defaulted, or read from the source.**
051| +   Precompute, make a documented reasonable choice (the no-stub rule), and surface
052| +   only a REAL fork. A question the model could answer itself is a wasted
053| +   interaction and a violation of this principle.
054| +4. **Minimize round-trips.** Batch genuinely independent decisions into one turn
055| +   where the tool allows (AskUserQuestion takes up to four); never trickle one
056| +   trivial confirmation at a time. Always leave an "Other" path so the user can add
057| +   open input without leaving the flow.
058| +
059| +Fewer, richer, criticality-ordered questions. Every rule that follows serves this one.
060| +
061| +## The non-negotiable principle — a foregone answer is not a question (Tijn, 2026-07-29)
062| +
063| +**If you present the obvious as though there were one good option and one bad option,
064| +it is not a real choice — and therefore not a conversation. It is manipulation.** The
065| +user's exact words: *"if you present the obvious in a manner that there is one good and
066| +one bad option then it is not a real option and therefore not a conversation between us —
067| +you are trying to manipulate me."* This is the highest rule of question-asking; it
068| +overrides the recommendation rules below.
069| +
070| +Two failure modes it forbids, absolutely:
071| +
072| +1. **The rigged binary.** You have already decided the answer, and you frame the other
073| +   option as the mistake — a bad-on-purpose foil, or a "risk" wrapped around the choice
074| +   you don't want picked, or one option carrying "(Recommended)" while the alternative is
075| +   dressed as the error. That is not asking; it is steering while pretending to consult.
076| +   **If the answer is genuinely obvious, DO NOT ASK — act, and report what you did.** The
077| +   only reason to raise a question is that the fork is real.
078| +
079| +2. **Manufacturing a recommendation on a decision the user owns.** Some decisions have an
080| +   objectively best answer (which email provider has the best deliverability, which
081| +   architecture is sounder) — recommend the highest-quality option there, as the rules
082| +   below say. But many decisions are the **user's alone**: what to schedule, what to
083| +   build and in what order, how much risk or cost is acceptable, whether to proceed now or
084| +   hold. On those there is no "best" the model may assert — the tradeoff belongs to the
085| +   human. Present the real options FLAT, each with its genuine pros and cons, and leave
086| +   the Recommendation column EMPTY. Do not invent a winner. See recommendation rule 8.
087| +
088| +The test before every question: *would the user lose a real bet by picking the option I
089| +did not mark?* If not — if both are genuinely live given what only the human knows — you
090| +must not tilt it. If yes, and the loss is objective, either it is a quality decision (mark
091| +the recommendation honestly) or it is so obvious you should not be asking at all.
092| +
093| +## When to use this format
094| +
095| +- The discussion phase surfaced one to four gaps or weak assumptions in a plan.
096|  - The user typed `/ask-me-questions` directly.
097|  - A subagent returned an "Open questions" section that needs human input.
098|  - A plan has unresolved ambiguity that must be locked before implementation can begin.
099|  
100| -## When NOT to use this skill
101| +## When NOT to use this format
102|  
103|  - Single yes-or-no clarification — ask the question directly without a matrix.
104|  - The decision is trivial and reversible — pick a sensible default and continue.
105| @@ -27,7 +96,7 @@ When invoked, present pending design or decision questions in a strict two-step
106|  
107|  The text response that precedes the AskUserQuestion call has four parts in this exact order:
108|  
109| -1. **Heading line.** Format: `### Question N — <the question phrased as a real question ending in a question mark>`. The heading must itself be a question, not a topic label. For example, "### Question 1 — Should the CTO Chief absorb the Product Loop, or stay focused on shipping only?" — never "### Question 1 — Product Loop placement". A heading without a question mark is a violation of this skill.
110| +1. **Heading line.** Format: `### Question N — <the question phrased as a real question ending in a question mark>`. The heading must itself be a question, not a topic label. For example, "### Question 1 — Should the CTO Chief absorb the Product Loop, or stay focused on shipping only?" — never "### Question 1 — Product Loop placement". A heading without a question mark is a violation of this format.
111|  2. **Explanation paragraph.** One short paragraph (two to four sentences) that explains why this decision matters, what is at stake, and any relevant context the user needs to choose well. Cite a source as a markdown hyperlink if the explanation depends on a fact that could be wrong.
112|  3. **The decision matrix.** Drawn using Unicode box-drawing characters inside a fenced code block (see matrix rules below). Markdown pipe-character tables are forbidden — they do not render visible vertical lines in every viewer, and the user's persistent rule requires real vertical lines.
113|  4. **The verbatim question sentence.** One sentence after the matrix that is identical to the `question` text in the AskUserQuestion call below it. This sentence may match the heading or be a tightened version of it.
114| @@ -48,34 +117,18 @@ Matrix rules:
115|  3. Header row must be exactly the four columns above. Never abbreviate column names.
116|  4. One option per box-drawing row. Two to four options per question — AskUserQuestion's hard limit is four.
117|  5. Pros and Cons cells: one full sentence per visible line within the cell. Pad each line with spaces so all column widths are equal and the `│` characters align vertically down the matrix. If a sentence is longer than the column width, wrap onto the next line with continued indentation; do not break a sentence across cells.
118| -5. **Never use abbreviations anywhere.** Write "pull request" not "PR"; "user interface" not "UI"; "database" not "DB"; "European Union" not "EU"; "application programming interface" not "API"; "single sign-on" not "SSO"; "two-factor authentication" not "2FA"; "software-as-a-service" not "SaaS"; "continuous integration" not "CI"; "continuous deployment" not "CD". Spell every term in full every time, including standard industry acronyms.
119| -6. The Recommendation column contains exactly one cell marked `Recommended` plus a one-clause reason. All other Recommendation cells are empty.
120| -7. The recommendation is **always the highest-quality option**, regardless of cost, effort, time-to-ship, or popularity. Pick the option that produces the best outcome.
121| -8. **Surface cost transparently, never editorialize about it.** If the recommended option is expensive, state the price in the Recommendation cell as a fact — for example, "Recommended — highest deliverability; pricing starts at one hundred twenty dollars per month at the production tier." Never say the cost is "high," "steep," "worth it," "but consider the cost," or any framing that argues against the recommendation on cost grounds. The user decides whether the cost is acceptable; my job is to inform, not to moan. The same applies to Cons cells: list the price as a number, not as a complaint.
122| -9. If any claim in a Pros or Cons cell could be wrong — a pricing tier, a regulation date, a vendor capability, a benchmark number — call WebSearch and cite the source as a markdown hyperlink footnote under the matrix. If a specific claim cannot be verified, mark it with `[unverified]` rather than removing it; the user can correct it.
123| +6. **Never use abbreviations anywhere.** Write "pull request" not "PR"; "user interface" not "UI"; "database" not "DB"; "European Union" not "EU"; "application programming interface" not "API"; "single sign-on" not "SSO"; "two-factor authentication" not "2FA"; "software-as-a-service" not "SaaS"; "continuous integration" not "CI"; "continuous deployment" not "CD". Spell every term in full every time, including standard industry acronyms.
124| +7. **Decide first whether this decision even HAS a best answer — most do not.** There are two kinds of decision, and the Recommendation column behaves oppositely for each:
125| +   - **Quality decision** — one option is objectively better on the merits the model can judge (deliverability, correctness, soundness, security). Here exactly one cell is marked `Recommended` with a one-clause reason; all others empty.
126| +   - **Owner decision** — the choice belongs to the human because it turns on something only they hold: what to schedule, what to build and when, how much cost/risk/time is acceptable, whether to proceed or hold. Here **every Recommendation cell is EMPTY.** Do not manufacture a winner. Present the options flat with honest pros and cons and let the human decide. A forced recommendation on an owner decision is the rigged binary the non-negotiable principle forbids.
127| +   If you are unsure which kind it is, it is an owner decision — leave the column empty.
128| +8. For a quality decision, the recommendation is **always the highest-quality option**, regardless of cost, effort, time-to-ship, or popularity. Pick the option that produces the best outcome. Never soften or redirect it. For an owner decision there is no recommendation to make — never invent one, and never smuggle a preference in through loaded pros/cons (a real con on the option you favor, a real pro on the one you don't; symmetric honesty or it is manipulation).
129| +9. **Surface cost transparently, never editorialize about it.** If the recommended option is expensive, state the price in the Recommendation cell as a fact — for example, "Recommended — highest deliverability; pricing starts at one hundred twenty dollars per month at the production tier." Never say the cost is "high," "steep," "worth it," "but consider the cost," or any framing that argues against the recommendation on cost grounds. The user decides whether the cost is acceptable; my job is to inform, not to moan. The same applies to Cons cells: list the price as a number, not as a complaint.
130| +10. If any claim in a Pros or Cons cell could be wrong — a pricing tier, a regulation date, a vendor capability, a benchmark number — call WebSearch and cite the source as a markdown hyperlink footnote under the matrix. If a specific claim cannot be verified, mark it with `[unverified]` rather than removing it; the user can correct it.
131|  
132|  After the matrix, write one sentence stating the question being decided. That sentence becomes the AskUserQuestion `question` text verbatim.
133|  
134| -### Step 2 — The simple lettered menu, always (Tijn, 2026-09-07)
135| -
136| -Every question ends with a plain lettered menu, and it is the LAST thing on screen so it can never be missed:
137| -
138| -```
139| -**a)** <option one, one line> Recommended.
140| -**b)** <option two, one line>
141| -**c)** <option three, one line>
142| -**d)** <option four, one line>
143| -
144| -Reply with a letter.
145| -```
146| -
147| -One line per option, the recommended one marked (quality decisions only), then "Reply with a letter." The user answers with a single letter; map it back to the option. This menu is mandatory on every question, in every mode, including plain-text mode where the AskUserQuestion widget is not used. Never make the user type an option label. If the menu is missing the user will ask "where is the menu?" — that is a violation.
148| -
149| -### New ideas are proposals to check, never facts (Tijn, 2026-09-07)
150| -
151| -When a question introduces something the user has not said (a mechanism, a number, a policy, a process such as "verified developer accounts" or "a seventy-thirty split"), it is a NEW IDEA. New ideas are welcome, but they must be presented as such and checked by the user before they are treated as part of the plan. Rule: under the matrix, before the menu, add a short block "**New ideas in this question, for you to check:**" listing each invented element in one line. Never fold an invented element silently into an option's wording or into a recorded decision. Nothing the user has not confirmed is recorded as decided.
152| -
153| -### Step 3 — Invoke AskUserQuestion (matrix is forbidden inside) — only when the widget is in use
154| +### Step 2 — Invoke AskUserQuestion (matrix is forbidden inside)
155|  
156|  The AskUserQuestion call contains only:
157|  
158| @@ -85,13 +138,13 @@ The AskUserQuestion call contains only:
159|  
160|  The matrix has been shown above the call. Do not replicate it inside the question text or any option description.
161|  
162| -## Sequencing — one question per turn, always; wait until the user is satisfied
163| -
164| -Never move to the next question until the user has answered the current one and says they are satisfied. Never answer or decide on the user's behalf. After an explanation, stop and offer: a) satisfied, next; b) more on this.
165| +## Sequencing — one question per turn, always
166|  
167|  **One question per turn. Never batch.** Even if the questions appear independent, ask them sequentially. Render one matrix in the text response, then invoke AskUserQuestion with a single question. Wait for the answer. Then render the next matrix and ask the next question.
168|  
169| -This rule is absolute and overrides the AskUserQuestion built-in batching capability. The reason is user preference: each decision deserves its own focused turn so the user can reason about it without parallel options bleeding into the choice.
170| +This rule governs discussion and design questions — the decisions that shape what gets built. Each deserves its own focused turn so the user can reason about it without parallel options bleeding into the choice, and it overrides the AskUserQuestion built-in batching capability for those questions.
171| +
172| +Menu ride-along questions are the one exemption: the settings ride-alongs the dashboard attaches to a normal render — the environment (development / staging / production), the European Union compliance regime, and the stale-plans prompt — may be presented together in a single AskUserQuestion call (up to four questions at once), because they are quick settings toggles that do not shape a design and the user answers or dismisses them in passing. Discussion and design questions are never batched with them or with each other.
173|  
174|  ## More than four candidate options
175|  
176| @@ -99,16 +152,16 @@ AskUserQuestion supports a maximum of four options per question. If you have mor
177|  
178|  ## Empty state
179|  
180| -If invoked with no pending decisions to present, respond with the literal text: `No pending decisions to present.` Do not fabricate a question.
181| +If there are no pending decisions to present, respond with the literal text: `No pending decisions to present.` Do not fabricate a question.
182|  
183|  ## Minimum-viable example
184|  
185| -User says `/ask-me-questions` after a research step surfaced one decision.
186| -
187| -Assistant text response (the matrix is drawn with real Unicode box-drawing characters inside a fenced code block):
188| +After a research step surfaced one decision:
189|  
190|  ````
191| -### Question 1 — Email delivery provider
192| +### Question 1 — Which email delivery provider should the project use?
193| +
194| +Transactional email (receipts, password resets) must reach the inbox, not spam. Deliverability reputation, not price, decides whether a paying customer sees a receipt. The provider is wired in early and is costly to swap later.
195|  
196|  ```
197|  ┌────────────────────────────┬───────────────────────────────────────────────┬─────────────────────────────────────────────┬───────────────────────────────────────────────────────┐
198| @@ -132,26 +185,25 @@ Assistant text response (the matrix is drawn with real Unicode box-drawing chara
199|  Which email delivery provider should the project use for transactional email?
200|  ````
201|  
202| -The assistant then invokes AskUserQuestion with:
203| +Then invoke AskUserQuestion with:
204|  
205|  - `question`: "Which email delivery provider should the project use for transactional email?"
206|  - `header`: "Email"
207| -- Three options: "Resend (Recommended)", "Postmark", "Amazon Simple Email Service" — each with a one-sentence description and no abbreviations.
208| +- Three options: "Postmark (Recommended)", "Resend", "Amazon Simple Email Service" — each with a one-sentence description and no abbreviations.
209|  
210|  ## What NOT to do
211|  
212| -- Never write a topic label as the heading. The heading must be a real question ending in a question mark — for example, "Should the CTO Chief absorb the Product Loop?", not "Product Loop placement".
213| +- Never write a topic label as the heading. The heading must be a real question ending in a question mark.
214|  - Never skip the explanation paragraph between the heading and the matrix. The user needs to know why the decision matters before reading the options.
215|  - Never put the matrix inside the AskUserQuestion `question` text or any option description. The matrix lives in the preamble only.
216|  - Never use abbreviations anywhere — matrix, question, options, descriptions, footnotes.
217| -- Never let cost, effort, time-to-ship, or popularity reduce the quality of the recommendation. Always recommend the highest-quality option.
218| +- **Never present a foregone answer as a real choice.** If you have already decided, do not ask — act and report. Asking only when the fork is real is the whole point.
219| +- **Never rig a binary:** one option dressed as good and the other as the mistake, a "risk" wrapped around the option you don't want picked, loaded pros/cons, or a "(Recommended)" tag on a decision the user owns. That is manipulation, not a question.
220| +- **Never manufacture a recommendation on an owner decision** (schedule, scope, what/when to build, acceptable cost or risk, proceed-or-hold). Leave the Recommendation column empty and present the options flat. When unsure whether a decision has a best answer, treat it as an owner decision — empty column.
221| +- On a quality decision, never let cost, effort, time-to-ship, or popularity reduce the quality of the recommendation. Always recommend the highest-quality option.
222|  - Never editorialize about cost ("expensive," "steep," "worth it," "but consider the cost"). State prices as numbers and let the user decide.
223| -- Never mark more than one option as Recommended per question.
224| +- Never mark more than one option as Recommended. On a quality decision mark exactly one; on an owner decision mark none.
225|  - Never invoke AskUserQuestion without first rendering the matrix.
226| +- Never batch — one question per turn, always.
227|  - Never call WebSearch on every Pros or Cons claim — only on claims that could be wrong.
228| -- Never ask the user a meta-question (for example, "should I show the matrix?" or "is this format good?"). The skill is a single automatic flow.
229| -
230| -## References
231| -
232| -- AskUserQuestion tool: built-in. One to four questions per call, two to four options per question, header field twelve characters or fewer.
233| -- Matrix format follows the user's persistent rule for structured decision elicitation: one question per turn, table with vertical-line column separators, pros and cons, single quality-only recommendation. The Recommendation column makes the skill's preferred answer auditable and challengeable rather than buried in prose.
234| +- Never ask the user a meta-question (for example, "should I show the matrix?" or "is this format good?"). It is a single automatic flow.
```

**Compared with the parent's comparison table — every row holds.** The lettered menu, the new-ideas block and the wait-until-satisfied rule are present only in the personal copy (diff lines 134 to 151 and 162 to 164); the two dated rules carry 2026-09-07 and the satisfaction rule carries no date. The personal sequencing text is absolute, with no exemption (line 169). The personal recommendation rule is exactly one Recommended cell (line 119). The paramount principle and the foregone-answer principle are absent from the personal copy (lines 28 to 91). The personal rule numbering repeats the number five (lines 117 and 118). The personal worked example has the topic label "Email delivery provider" and no explanation paragraph (lines 191 to 194). The personal references section says "single quality-only recommendation" (line 233). The personal frontmatter description is the older wording (line 8).

**Findings for the owner, not in the table and not acted on:**

1. The personal worked example contradicts itself: its matrix marks Postmark as Recommended, while its AskUserQuestion options mark "Resend (Recommended)" (diff line 207). CTOC's example marks Postmark in both places.
2. The personal copy renames the widget step to "Step 3 — Invoke AskUserQuestion (matrix is forbidden inside) — only when the widget is in use" (line 153), making the widget optional. The parent's reading (a) already keeps the menu mandatory and has the widget's options mirror the letters when the widget is used; CTOC's step heading and text are kept unchanged.
3. Wording differences the table does not list; CTOC's wording is kept in every case: the title (`/ask-me-questions` against `ask-me-questions`, line 13); the opening paragraph against CTOC's quoted block (lines 15 and 22 to 26); "this skill" against "this format" (lines 17, 100, 101, 109 and 110); the first "When to use" bullet (lines 19 and 95); the empty-state sentence (line 180); the worked example's lead-in sentences (lines 185 to 188, 202 and 203); the first "What NOT to do" line, which the personal copy gives an extra example (line 212); the personal list lacks "Never batch — one question per turn, always." (line 226); and "The skill is a single automatic flow" against "It is a single automatic flow" (lines 228 and 234).

### The checks written first, and the failing run

- `tests/deepthink-ships-with-ctoc.test.js` written with one group, "the decision-question format carries the three rules and loses none of its own", checks 1 to 6 as the plan describes. Check 1's list (41 literals: 14 heading lines and 27 bold spans, none repeated) was captured from `skills/ask-me-questions/SKILL.md` by a throwaway program in the session scratchpad and pasted as literals; the same program counted zero invisible characters in the file. Check 6 uses `gradeNoAbbreviations` from `evals/lib/graders.js` and restates `GATE_DIGIT` with a comment naming `src/lib/instruction-gate-words-scan.js`; its allow-list holds `CTOC` with its reason.
- **The failing run**, before either mirror file changed: `node --test tests/deepthink-ships-with-ctoc.test.js`, exit status 1 — tests 6, pass 1, fail 5, skipped 0.
  - Check 1 passed. Expected by construction; it is the guard against removal and is not evidence that anything was built.
  - Check 2 failed: "the sentence making the lettered menu last on screen on every question, in every mode, is missing".
  - Check 3 failed: "the new-ideas block title is missing".
  - Check 4 failed: "the sentence that the next question waits until the user is satisfied is missing".
  - Check 5 failed: the worked example's last non-empty line was "Which email delivery provider should the project use for transactional email?", not "Reply with a letter.".
  - Check 6 failed: "the lettered menu subsection was not found, so its words cannot be checked". Its three instrument checks, which run first, passed: the abbreviation grader flags "PR", the capital-word check flags "UI" in prose and skips a backticked word and the allow-list, and the gate word-and-digit pattern matches a sample gate label with a digit.
- **The baseline of the tests that read the decision format**, the inventory's 19 plus `tests/agent-and-skill-improvement-record.test.js`, run together with `node --test`: exit status 1 — tests 463, pass 462, fail 1, skipped 0. The one failure is `tests/readme-numbers.test.js` "Project structure: test-file count (derived from disk)", which expects "545 test files" in the README: the effect of this slice's own new test file that the plan predicts. The release sync rewrote the count before the full gate, and `npm test` then passed with no failure (see "Verify"). The other 462 passed.

### Prepare

Nothing to install and no new dependency. Node v24.14.1. Every directory this slice writes exists. The evidence above was recorded in this plan before either mirror file was edited.

### The fold-in, applied by a script

- `skills/ask-me-questions/SKILL.md` was edited by a throwaway program in the session scratchpad: five insertions, each anchored on a target the program asserts occurs exactly once, with the inserted text read from files, never retyped. (1) The subsection "The lettered menu, last on screen, on every question (Tijn, 2026-09-07)", with the fenced template and the two scoping sentences, between "Step 1" and "Step 2". (2) The subsection "New ideas are proposals to check, never facts (Tijn, 2026-09-07)" after it. (3) The satisfaction paragraph after the first paragraph of "Sequencing — one question per turn, always". (4) The lettered menu as the worked example's last lines, inside the example and after its question sentence, and the sentence after the example that the widget's three options mirror the letters. (5) Three lines in "What NOT to do", after "Never batch — one question per turn, always.".
- At this first edit, 32 lines added and none removed (measured with `git diff --stat`; see decision 12); the return after review changed the count, see "Return to the test step". The first five lines, the frontmatter, are byte-identical to before, `allowed-tools:` included. `plan-serial` and `ctoc:claims` occur zero times. `the one exemption`, `single AskUserQuestion call` and `One question per turn` occur once each. Zero invisible characters.
- The mirror: `cp skills/ask-me-questions/SKILL.md .ctoc/ask-me-questions.md`, then `cmp` on the pair, exit status 0: identical.
- The plan's test after the edit: `node --test tests/deepthink-ships-with-ctoc.test.js`, exit status 0 — tests 6, pass 6, fail 0, skipped 0.
- The 19 plus 1 tests after the edit, before the release sync: tests 463, pass 462, fail 1, skipped 0; the one failure is the same test-file count pin. After the release sync every one of them ran inside `npm test`, which passed (below).

### Optimise

Nothing to optimise: the change is instruction text and one test file, with no repeated operation and no hot path.

### Verify

This section records the final run, on the bytes after the last return to the test step, except the release-sync line, which records its only run, before the review; no return added a test file, so the count it wrote still holds, as the final `git diff HEAD -- README.md CLAUDE.md` shows. The first npm test run, before review, gave the same counters with branch coverage 93.28, and the run after the first return gave 93.31; the branch figure moves between runs on unchanged source files, and every run passed the gate.

- `npm run lint` (eslint, no warnings allowed): exit status 0.
- `npm run typecheck`: exit status 0 — tests 1, pass 1, fail 0.
- `node src/scripts/release.js`: exit status 0, version 6.14.74, no bump (the session commits). The files it changed, measured by fingerprinting every file outside `.git` and `node_modules` before and after the run: exactly `CLAUDE.md` and `README.md`. The test-file count reads 545 at README.md line 1143 and at CLAUDE.md lines 321 and 704; 544 no longer occurs in either file. `git diff HEAD -- README.md CLAUDE.md` shows exactly those three lines changed, each 544 to 545, and nothing else.
- `npm test`, output kept in the session scratchpad: exit status 0 — tests 12041, suites 2056, pass 12041, fail 0, cancelled 0, skipped 0, todo 0. Coverage over all files: lines 99.90, branches 93.26, functions 99.41. The gate's own lines: `[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0`; `[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)`; `[CTOC test-gate] PASS`. The same fingerprint comparison shows no file changed during the run.

### Document — the fingerprints after the edit

Taken on the final bytes, after the second return to the test step:

```
sha256:142ffd63a94281f5776bf2a58d91b02fe877408c44ae39d902873c09070e77d9 <home>/.claude/skills/deepthink/SKILL.md
sha256:5734622bee01cfec19989c2040bfbecefe94410f871a8a37dbe6a6883c8ff3f7 <home>/.claude/skills/ask-me-questions/SKILL.md
sha256:72d67c77ee3c6e1fc494bf49461e5d7175ce75a83b9588fa0da1bb9771d9b604 .ctoc/audit/agent-and-skill-improvement/inventory.json
sha256:419638a124251609ded8b1ef3918b56a89d9dec3b9b6b63a0e322d975d05637d plans/implementation/every-agent-and-specialist-skill-improved-three-times.md
sha256:5bb3ffd8e1d13c988f4242c263fee9659d4af3c641743504c821e3f769f7bf5f tests/agent-and-skill-improvement-record.test.js
sha256:94d6522fd238452852137bc2b654c6e2bca80fc462edb08dcef52868429bb33c skills/ask-me-questions/SKILL.md
sha256:94d6522fd238452852137bc2b654c6e2bca80fc462edb08dcef52868429bb33c .ctoc/ask-me-questions.md
sha256:0b49def737eaec1410906062e0f7a86046e893f38cc37b0157f600cf0c0e78fa tests/deepthink-ships-with-ctoc.test.js
```

- The two personal files and the three improvement-run files carry the same fingerprints as before the first edit.
- Both mirror files carry the same fingerprint, `sha256:94d6522fd238452852137bc2b654c6e2bca80fc462edb08dcef52868429bb33c`, different from the starting one. The first edit's fingerprint, `sha256:215c3fbe84e4bce5154746537b5a7522aa79864e436edd6eeeb00f283bd0525a`, and the first return's, `sha256:35eb54779133b41fab86c7a8283955d73471c9a731d90ec5f3f2ca66505ab8df`, were superseded by the returns to the test step.
- No changelog file exists in the repository. The decision format is its own documentation; the release sync rewrote the documented test-file count.

### Return to the test step after the review and the security scan

The session's review returned this slice to the test step (two returns, both to the test step, two in total), and the security scan returned a warning: one high finding and four low ones. Both reports are kept word for word in `.ctoc/audit/deepthink-run-notes/s1-step11-review-d-deepthink-s1-step11-review.md` and `.ctoc/audit/deepthink-run-notes/s1-step13-secure-d-deepthink-s1-step13-secure.md`. Every finding and what was done:

- **Review finding 1, Step 1 said the text response "has four parts", which the new menu made false.** Changed to "opens with four parts in this exact order:". Pinned in check 2.
- **Review finding 2, Step 2's `question` bullet pointed at "the previous paragraph", now the new-ideas subsection.** Changed to "the verbatim question sentence from Step 1, written after the matrix.". Pinned in check 2.
- **Review finding 3, the test failed on a checkout with Windows line endings.** `readSkill()` now folds `\r\n` to `\n` and carries the doc comment the reviewer gave, so Step 15's "each helper in the test file carries a comment" is now true.
- **Review finding 4, decision 2 claimed Step 1's sentences were on the pre-change list.** Decision 2 rewritten as the reviewer proposed.
- **Review, the optional drift guard.** Taken: check 6 now asserts that `src/lib/instruction-gate-words-scan.js` still holds `const GATE_DIGIT = ` followed by the restated pattern.
- **Security finding 1 (high), the two-reply offer reused the decision menu's letters**, so a bare "a" could record an option the user never chose. The sentence was replaced with the scan's text: no decision menu on the same screen, a reply to the two never records a decision, and after `satisfied, next` on an unanswered question that question's lettered menu comes back, last. Pinned in check 4 (see decision 15).
- **Security finding 2 (low), the new-ideas trigger could read as a closed list, and the block did not say where an idea came from.** The trigger now reads "for example a mechanism, a number, a policy, a process, a vendor or a claim, whether the model thought of it or took it from a file, a web page or another agent's report", and the block "lists each such element in one line, with where it came from". The provenance wording is pinned in check 3 (see decision 15).
- **Security finding 3 (low), the owner's account path in this plan's approved text.** Not changed: redacting it would move the approval digest. Put to the owner under "For the human" below.
- **Security finding 4 (low), the release sync wrote `README.md`, which this plan does not declare.** Not changed here: the frontmatter is part of the approved digest. Put to the owner under "For the human" below.
- **Security finding 5 (low), the worked example's matrix rows did not follow the menu's order.** The rows were reordered to Postmark, Resend, Amazon Simple Email Service by a script that moves the whole row blocks and asserts each row occurs once (decision 17). The matrix, the menu and the widget now agree. `tests/ask-me-questions-format.test.js` does not pin the row order.

**The failing run, before the text changed:** `node --test tests/deepthink-ships-with-ctoc.test.js`, exit status 1 — tests 6, pass 3, fail 3, skipped 0. Checks 1, 5 and 6 passed, the drift guard and the line-ending fold included. Check 2 failed on "Step 1 must say the text response opens with its four parts…", check 3 on "the new-ideas block must say where each new idea came from", check 4 on "the two-reply offer must keep the decision menu off its screen…". A check stops at its first failing assertion, so a probe then evaluated each of the four new literals against the file: all four were absent.

**The text change:** one script, five replacements each asserted to occur exactly once, then the row swap; `cp` to `.ctoc/ask-me-questions.md`; `cmp` exit status 0. The frontmatter is byte-identical to the last commit. Against the last commit (`git diff HEAD --numstat`, see decision 16) each mirror file has 38 lines added and 6 removed: Step 1's opening sentence and Step 2's `question` bullet, each reworded, and the four lines of the Resend row block, moved below Postmark. No rule was removed. Zero invisible characters.

**The passing runs, on the final bytes:**

- The plan's test: exit status 0 — tests 6, pass 6, fail 0, skipped 0.
- The 19 plus 1 tests that read the decision format: exit status 0 — tests 463, pass 463, fail 0, skipped 0.
- Lint and typecheck: both exit status 0.
- `git diff HEAD -- README.md CLAUDE.md`: exactly three changed lines, each 544 to 545 (`CLAUDE.md` lines 321 and 704, `README.md` line 1143), and nothing else.
- `npm test`: exit status 0 — tests 12041, pass 12041, fail 0, skipped 0, branch coverage 93.31. "Verify" above now records the run after the second return.

**The narrow repeat of the security scan** (`.ctoc/audit/deepthink-run-notes/s1-step13-secure-2-d-deepthink-s1-step13-secure-2.md`): PASS. Findings 1, 2 and 5 closed; 3 and 4 remain the owner's; two new low findings, 6 (the wider new-ideas trigger was pinned by no test) and 7 (the menu rule did not name its one exception), fixed at the second return to the test step.

### Second return to the test step after the final review and the narrow scan

The session's final review, kept word for word in `.ctoc/audit/deepthink-run-notes/s1-step16-final-review-d-deepthink-s1-step16-final-review.md`, returned this slice to the test step a second time: two returns, both to the test step, two in total, against limits of three to one step and five in all. Every finding and what was done:

- **Final review blocking finding, which is the narrow scan's finding 7: the menu rule did not name its one exception.** The lettered-menu subsection said the menu is last on screen on every question, and "What NOT to do" said never to end a question without it, while the Sequencing rule's screen after a further explanation carries no decision menu. The review's sentence was appended to the end of the lettered-menu paragraph, after "keeps them.": "The one exception is the screen after a further explanation the user asked for, described under Sequencing, which offers two replies and carries no decision menu." The "What NOT to do" line now ends "…ending with `Reply with a letter.`, except the screen after a further explanation, which offers two replies and carries no decision menu.". Both pinned in check 2.
- **The narrow scan's finding 6: the wider new-ideas trigger was pinned by no test.** Check 3 now pins "whether the model thought of it or took it from a file, a web page or another agent's report".
- **The optional row-order assertion.** Taken, in check 5 (decision 18): the worked example's matrix rows and its menu lines both list Postmark, Resend, Amazon Simple Email Service.
- **Record fixes 1 to 5.** Decision 2's sentence now says no test pinned Step 1's opening sentence until check 2 pinned its new wording at review. "Verify" is rewritten for this run, and says the release sync ran once, before the review: this build has one release-sync output and one before-and-after snapshot for it in the session scratchpad. The text-step checkbox names the returns. This section and the narrow-scan paragraph above record the narrow scan and the count of returns. "For the human" is made flat as the review specified.

**The failing run, before the text changed:** `node --test tests/deepthink-ships-with-ctoc.test.js`, exit status 1 — tests 6, pass 5, fail 1, skipped 0. Check 2 failed on "the lettered-menu rule must name its one exception, or it contradicts the Sequencing rule". A probe then evaluated each new literal against the file: both exception sentences were absent, and the new-ideas trigger was present. The trigger assertion and the row-order assertion passed before the edit, because those fixes landed at the first return; they are guards on fixes already in, not evidence that anything was built. The row-order assertion's extraction was probed, read only, on the owner's personal copy, whose example lists Resend first; it returned Resend, Postmark, Amazon Simple Email Service, so the check tells the orders apart.

**The text change:** one script, two replacements each asserted to occur exactly once; `cp` to `.ctoc/ask-me-questions.md`; `cmp` exit status 0. The frontmatter is byte-identical to the last commit. Both changed lines were lines this slice had added, so against the last commit each mirror file still has 38 lines added and 6 removed. Zero invisible characters.

**The passing runs, on the final bytes:**

- The plan's test: exit status 0 — tests 6, pass 6, fail 0, skipped 0.
- The 19 plus 1 tests that read the decision format: exit status 0 — tests 463, pass 463, fail 0, skipped 0.
- Lint and typecheck: both exit status 0.
- `git diff HEAD -- README.md CLAUDE.md`: byte-identical to the comparison taken at the first return, the three count lines and nothing else. No release sync ran in this return, because no test file was added.
- `npm test`: see "Verify" above, which records this run.

### The final review, and where the work stands

The second final review (`.ctoc/audit/deepthink-run-notes/s1-step16-final-review-2-d-deepthink-s1-step16-final-review-2.md`) is ready: every finding of the first pass is closed as proposed and nothing regressed. Its optional wording fix to "For the human", item 2, is applied, and its point to watch is the fifth question below. The slice is completed through the menu's task completion, which runs the verification and moves the plan to the review stage: the work is built and waits for the owner's OK to call it done.

### For the human

These two are the owner's to decide. The options are listed flat, with no recommendation.

**Your account path in tracked files (security finding 3).** This plan's approved text names the home folder twice (the lines on the personal files and on the security review). The scan counted 90 tracked files carrying it. Redacting this plan now would move its approval digest and void the approval. Nine of the 90 were already on the remote main branch at the last fetch. None of the three options below removes the path from the repository's history.

- Leave the 90 files as they are. No work, and no approval recorded again; the path stays in the current files and in any future push, and new occurrences can still be added.
- Add a fence: a test that refuses an absolute home path in tracked text files, with today's 90 files on a list that may only shrink. New occurrences stop; the existing ones stay until cleaned.
- Clean the 90 files as well, in a plan of its own after this one lands. The path leaves the current files; approved plans among them would need their approval recorded again.

**Future slices that run the release sync (security finding 4).** The sync rewrites `README.md`'s version lines and test-file count, but a slice that runs it does not always declare `README.md`, so the scheduler cannot see the overlap.

- Future slices that run the release sync list `README.md` next to `CLAUDE.md`. The scheduler then serialises them with every plan that writes `README.md`; each such slice is also granted write access to the whole of README.md, not only its count lines.
- Leave declarations as they are. No slice gains write access to README.md; the dispatcher keeps holding the overlap by hand, as it does today; a slice's write to README.md through the release sync stays outside its declared files.

### Questions for the human

From the review, about the owner's own rule as written. Not decided here.

1. **Does replying with a letter count as "says they are satisfied"?** The satisfaction paragraph's first sentence reads as unconditional; taken literally it adds a "satisfied?" turn after every answer, the extra turn the parent's reading (b) rejected.
2. **What does "next" mean while a question is still unanswered?** The new sentence from the security scan answers this one: after `satisfied, next` on a question not yet answered, that question's lettered menu is shown again, last, and the answer waits for a letter.
3. **Does the letter `b)` clash with the dashboard's `b` for Back?** On dashboard screens `b` means Back; a discussion question asked from the menu now ends with `b)` as its second option.
4. **Should the lettered menu offer a free answer?** The paramount principle's rule 4 says "Always leave an 'Other' path", but in plain-text mode the menu ends "Reply with a letter." and offers none; only the widget has a built-in "Other". This is the owner's rule as written in the personal copy, so it is put as a question, not changed. (From the final review.)
5. **Should the settings questions the dashboard asks together carry a lettered menu each?** The menu rule names one exception, the screen after a further explanation, but the Sequencing section still lets the dashboard ask up to four settings questions in one widget call, and four lettered menus cannot each be the last thing on screen. Today the menu rule applies only to questions written in this format, and those settings questions come through the widget, so a literal reading is covered; if a model ever printed one lettered menu per batched settings question, a bare "a" would be ambiguous. (From the second final review, as something to watch.)

### Not verified

- The added rules followed in a live session, a question rendered with the lettered menu and the new-ideas block: not observed; this slice changes instruction text only.
- A run on a checkout with Windows line endings: the test now folds them, but no such checkout was tried.
- The final review is dispatched by the session and is not recorded here.

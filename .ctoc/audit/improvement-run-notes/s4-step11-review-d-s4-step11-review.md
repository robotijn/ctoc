<!-- saved verbatim by the session from subagent a5be3797c7ef1f8df (ctoc:iron-loop:iron-loop-critic), dispatch d-s4-step11-review, 2026-09-30 22:59 CEST -->

# Step 11 review of the hallucination-detector build (dispatch `d-s4-step11-review`)

**Verdict: kick back. Do not treat this build as ready to be signed off as finished.** Most of the content is well researched. I sampled more than ten passages in each file, and each one traces to a recorded finding and carries its web address and read date. But the plan shows the review, security and final-review steps as done when their agents never ran. The end-of-slice `npm test` did not run on the skill's final bytes. And the two files contain three instruction contradictions that an agent reading them literally will act on.

## Findings, by severity

### High

**1. Plan, lines 140–143, 150–153 and 166–169: steps ticked done whose named agents never ran.**
- Text at line 140: `- [x] Self-review all new code — … The parent's review by agents/iron-loop/iron-loop-critic.md was not dispatched; that is the session's call.`
- Step 13 (line 150) is ticked the same way for `security-scanner`.
- Step 16 is ticked "Verify steps 8-15 completed correctly" and "All quality checks passed" (lines 167–168).
- **What is wrong:** each box is ticked while its own note says the named agent did not run. This dispatch is the first real Step 11. A reader who scans the boxes sees a complete loop, and that is the truncated loop this project has already been burned by.
- **Fix:**
  - Untick Step 11 until this review's findings are resolved.
  - Untick Step 13 until `security-scanner` runs, or until the human explicitly waives it.
  - Untick Step 16 until the final review runs.

### Medium

**2. Plan line 287: `It ran on the final text of both files.` This is false now.**
- Line 306 says the version-and-check comment lines were added to the skill after that run. The run was on `c944d0ae…`; the final skill is `b6742d86…`.
- The Step 14 box (line 157) and criterion 11 for the skill (line 301) both rest on line 287.
- **Fix:** run `npm test` on the final bytes, record the fingerprint and output path, and correct line 287.

**3. Wrapper lines 238, 316 and 326: two classification rules conflict for the same package, and no rule says which wins.**
- Line 238: `A name downloaded less than that package, or registered later than it, is reported as suspected_lookalike`.
- Line 326: `renamed_package: low when the npm recipe's answer shows the maintainers the well-known project has…`.
- The look-alike check runs on "every registered name the change adds" (line 232), so it also runs on the file's own example `react-query`, compared with `@tanstack/react-query`.
  - I believe (not checked this review) that the successor out-downloads the old name, as successors usually do after a rename.
  - If so, line 238 makes `react-query` a high-severity `suspected_lookalike`, while line 326 and the examples at lines 71–72 and 288 make it a low-severity `renamed_package`.
  - The same collision can hit `wrong_package_for_environment` (`bcrypt` beside `bcryptjs`).
- **Fix:** add one sentence at line 238: "A name the answer shows to be the renamed predecessor of the well-known package (npm: same maintainers), or a real package wrong for the environment, is reported under that type. The download and age comparison applies only when the name's relation to the well-known package is not established."

**4. The `react-codeshift` item is recorded four inconsistent ways.**
- Plan line 302 (criterion 12, ticked): "One lead, not a refutation".
- Plan lines 307–308: the item was filed "as plan decision 2 says" (the late-correction route), and "Not yet written: the late-correction entry with `applied: false`".
- The inbox question `.ctoc/inbox/questions/1790801303564-1rhgy4.md` gives as its acceptance criterion: `Per-file criterion 12 (a finished file that makes a statement a round corrected carries a late correction)`.
- `for-the-human.json` holds `h-s4-skill-r3-reviewer-react-codeshift-wording`, of kind `out-of-scope-file`, which calls it "a lead … not a refutation". The execution record never mentions that entry.
- A continuation fork is registered on this item.
- My reading: it is a lead, not a refutation. The package describes itself as "Placeholder to prevent dependency confusion.", so "defensive placeholder" is not false.
- **Fix:**
  - Delete the "Not yet written" paragraph.
  - Name the `for-the-human.json` entry in the execution record.
  - Change the inbox question's acceptance criterion to criterion 9 only.

**5. Skill line 256 contradicts itself and the wrapper.**
- Text: `Check a Conan or vcpkg dependency's name against those catalogues, record system and vendored libraries under unknowns as not checked, and use [[security/sast-scanner]] for the language itself. The wrapper has no Conan or vcpkg recipe, so the addresses below are observed facts … not recipes to run.`
- The first sentence orders a check. The last sentence says not to run anything. Wrapper item 2 (line 25) says names from ConanCenter and vcpkg "stay 'not checked'".
- `sast-scanner` is also named as an owner here and in `related_skills`, but it is absent from the wrapper's hand-on list (lines 43–49). That breaks criterion 9.
- **Fix:**
  - Rewrite the first sentence as: "Record a Conan or vcpkg dependency's name under unknowns as not checked."
  - Either add "C and C++ language issues: sast-scanner" to the wrapper's hand-on list, or drop the pointer from the skill.

### Low

**6. Wrapper line 283 makes an unsourced claim about model behaviour.**
- Text: `These are real packages an artificial-intelligence model reaches for out of habit`. Round 3 reworded this passage.
- The skill stripped exactly this kind of unsourced model-behaviour clause (finding f-s4-skill-r2-16), and line 280 says the file cites no frequency.
- **Fix:** "These are real packages; flag them as stale or wrong for the context, never as non-existent."

**7. A decision that belongs to the human was never put to the human.**
- The skill round-3 re-validation note, line 74, says: when the npm answer has no maintainers, the recipe prints `maintainers="not in the answer"`, and both files then treat the name as a high-severity `suspected_lookalike`. The same missing data on PyPI stays low.
- The note calls this "a design choice for the human to confirm". `h-s4-skill-r3-renamed-low-without-maintainers` covers only PyPI, crates.io and Maven Central.
- **Fix:** add the npm case to that entry's evidence and options.

**8. Skill line 59 against line 226.**
- Line 59: `Cargo: never cargo search`.
- Line 226 lists `cargo search tokio_advanced` as a verification line.
- **Fix:** prefix line 226 with "Do not run:", or delete it.

**9. Skill line 420 against line 66.**
- Line 420 (letter-schema comment): `high = registry + AST corroborated; low = single signal`.
- Line 440 carries the same idea. Line 66 makes a registry answer "HIGH on its own".
- The section is marked not running, but one file now states two confidence rules.
- **Fix:** add to line 415 that the schema's confidence comment is the design's, and that the rule in force is line 66.

**10. The record encodes the same validator verdict in opposite ways.**
- Skill round 2 `validator_final` has `MISATTRIBUTED: 0`, but its re-validation reported "Mismatch (line 308) | 1" (note line 88).
- Skill round 3 has `MISATTRIBUTED: 1`, but its re-validation says "No claim is fabricated, misattributed…" (note line 108).
- **Fix:** choose one mapping for a "mismatch", apply it to both rounds, and state it in decision 4.

**11. Finding f-s4-agent-r3-21 overstates what the file says.**
- It claims each left-open item is "stated in the file where it matters".
- The file never says whether npm's `created` date survives an unpublish followed by a re-registration, and the training-cutoff rule at line 234 depends on that date.
- **Fix:** add the limitation at line 234, or correct the finding text.

**12. Fingerprint and count slips in the plan.**
- Line 237 (criterion 8, agent): `Final agent fingerprint: sha256:c23cd371…`. Line 240 says `9a4a4f6d…`, which is the value after the four late corrections.
- Decision 5 calls `c23cd371…` "the file's final fingerprint". It is the end-of-round-3 value, not the final one.
- Line 233 says "Frontmatter: 13 lines". It is 12.

**13. The criterion 7 note for the skill (line 297) is inaccurate.**
- It says the leftover abbreviations are in unchanged prose. Several sit in passages this slice changed:
  - line 64: CVE, API, PDF;
  - line 65: AI;
  - line 66: AST;
  - line 327: GPG, sumdb.
- **Fix:** spell them out in those passages, or correct the note.

**14. Skill line 259: the C example names no language version.**
- Text: `C (OpenSSL 3.0 or later)`. That is a library version, not the C17 or C23 the parent plan's criterion 4 requires.
- Also disclosed but worth seeing:
  - the Java example was never compiled;
  - the Python example is labelled "3.12 and later" but was parsed on 3.9.6.

**15. Wrapper lines 70 and 123 imply the wrong thing was run.**
- Text: `(Node.js 24 was used to run the patterns)`. Neither block contains the patterns; they are in section 4 (line 264), so the line reads as if these examples were executed.
- **Fix:** "(Node.js 24 ran the section 4 patterns; these examples were checked against …)".

**16. Late corrections `lc-s4-agent-1` and `lc-s4-agent-3` record `full_gate: pass` from runs that came before their final text.**
- The plan discloses this at lines 256 and 273; the entries themselves do not.
- **Fix:** name the run that covers the final text (the end-of-slice run).

**17. The skill still demands something the wrapper cannot do.**
- Skill line 45: `until the registry shows it was registered before that cutoff`.
- The wrapper never applies the cutoff to a PyPI first upload (line 234), so under the skill's wording a PyPI name with a stated cutoff can never be cleared.
- The wrapper wins (its item 5), but the skill's wording should match.

### Information

**18. Readability: several orders are buried in walls of evidence.**
- Wrapper line 143 is one paragraph of about 2,700 characters holding about eight separate orders. The single-quote guard and the look-alike-character lead are buried in it.
- Wrapper line 326 puts a conditional rule inside a severity table cell whose severity column says "low", so a reader scanning the column misreads it.
- Wrapper line 304 is a table cell of about 1,000 characters.
- Skill lines 45, 61 and 353 are citation walls.
- Both files are read in full on every dispatch, so this length is a per-dispatch cost.
- **Fix:**
  - Split line 143 into numbered steps.
  - Move line 326's condition into prose under the table.

**19. An open question now sits in a suggestion the agent will hand out.**
- Wrapper line 296 (unchanged): `moment().toISOString()` as the "Actual" for `formatISO`.
- I believe (not checked) that `toISOString` returns Coordinated Universal Time while date-fns `formatISO` keeps the local offset. The round-3 critique left this open.
- The agent will copy it into `suggestion`.

## The plan's criteria

| # | Verdict | Reason |
|---|---|---|
| 1 | Met | Agent round 2 and skill round 2 were traced from notes to record. Fingerprints match the execution record. Pre-edit counts match: 42/38/1 misattributed; 41/37/2/2. Agent round-2 final 108/104 with 1 refuted, recorded as fabricated per decision 4. Queries: one search, one query. Caveat: item 10. |
| 2 | Not fully met | Every sampled changed claim carries its address and read date. Text added after the last validator re-read was never validated: the version-and-check lines from decisions 5 and 7, the skill's final scope-rule wording, and the wrapper's new `suspected_lookalike` route. |
| 3 | Met on sample | Wrapper sample: lines 3, 18, 25, 44, 51, 132, 141, 143, 173, 226, 235, 238, 249 and 326. Skill sample: lines 35, 45, 46, 54, 57, 58, 61, 64, 65, 76, 107, 169, 173, 256, 324, 366 and 402. All trace to findings f-…-r1 to r3 or to lc-s4-agent-1 to 4. |
| 4 | Met | Compared against the marketplace copy as a stand-in for the committed file. Wrapper: only `description` changed, with all eight dispatch phrases byte-identical. Skill: only `when_to_load` changed, gaining two phrases. |
| 5 | Met | No order needs a tool outside Read, Grep and Bash. The skill still orders things the wrapper forbids (items 5 and 8). |
| 6 | Met | Wrapper line 387. |
| 7 | Mostly met | No gate numbers in either file (I checked exact presence), and no invented labels. Common acronyms remain in changed skill passages (item 13). |
| 8 | Mostly met | The C version is missing (item 14). |
| 9 | Not met | Items 3, 5, 8 and 17. |
| 10 | Met | Agent round 2 marks four findings as corrections and round 3 marks seven. |
| 11 | Not met as stated | Item 2. |
| 12 | Met on substance | The record state is inconsistent (item 4). |

## Scores

```json
{
  "scores": { "completeness": 3, "clarity": 3, "edgeCases": 4, "efficiency": 3, "security": 4 },
  "feedback": [
    { "dimension": "completeness", "issue": "Steps 11, 13 and 16 are ticked done although their agents never ran; npm test did not run on the final skill bytes; the react-codeshift item is recorded four inconsistent ways", "suggestion": "Untick those steps, re-run npm test on b6742d86…, and bring the plan, inbox question and for-the-human.json into one account" },
    { "dimension": "clarity", "issue": "The look-alike rule and the renamed-package rule conflict (wrapper lines 238 and 326); skill line 256 and lines 59/226 contradict themselves; wrapper line 143 buries about eight orders in one paragraph", "suggestion": "Add a precedence sentence, rewrite skill line 256, mark line 226 do-not-run, split line 143 into numbered steps" },
    { "dimension": "edgeCases", "issue": "npm answer without maintainers becomes high while PyPI without maintainers stays low; npm's created date after a re-registration is not caveated where the cutoff rule uses it", "suggestion": "Put the npm case to the human; add the created-date limitation at wrapper line 234" },
    { "dimension": "efficiency", "issue": "Both files are read in full on every dispatch and are dominated by citation walls (wrapper about 390 lines, skill about 450)", "suggestion": "Move the evidence prose into shorter sourced notes and keep the orders in short numbered lists" },
    { "dimension": "security", "issue": "The character check that keeps untrusted names out of the shell is instruction-only, and the single-quote guard rests on the agent's own check", "suggestion": "Already with the human (h-s4-agent-r1-shell-name-check-is-instruction-only); keep that open until decided" }
  ]
}
```

## What I did not read or run

- **No diff.** I could not run git and found no diff the session prepared. As the pre-edit copy I used the marketplace copies under `<home>/.claude/plugins/marketplaces/robotijn/`. I did not check that they are byte-identical to the committed files.
- **Nothing executed.** I ran no test, hashed no file, fetched no web source and ran no recipe. Every fingerprint and test result above is taken from the plan and the notes.
- **Partial record reading.**
  - Skill record: round 1 and round 3 findings and sources, beyond the count lines.
  - Agent record: round 1 sources against their notes, line by line.
  - The critique notes in full; I read only one change list and the headers.
- **Not read at all:** `tests/agent-and-skill-improvement-record.test.js`, and whether the recorded instrument fingerprint `8ef32ac3…` belongs to the repository copy or to the installed copy that actually ran.
- **Believed, not checked:** the download order behind item 3, and the time-zone behaviour behind item 19.

Files:
- `<home>/Code/ctoc/plans/in-progress/00264-every-agent-and-specialist-skill-improved-three-times-s4-hallucination-detector.md`
- `<home>/Code/ctoc/agents/ai-quality/hallucination-detector.md`
- `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`
- `<home>/Code/ctoc/.ctoc/audit/agent-and-skill-improvement/agents/ai-quality/hallucination-detector.md.json`
- `<home>/Code/ctoc/.ctoc/audit/agent-and-skill-improvement/skills/ai-quality/hallucination-detector/SKILL.md.json`
- `<home>/Code/ctoc/.ctoc/audit/agent-and-skill-improvement/late-corrections.json`
- `<home>/Code/ctoc/.ctoc/audit/agent-and-skill-improvement/for-the-human.json`
- `<home>/Code/ctoc/.ctoc/inbox/questions/1790801303564-1rhgy4.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round2-revalidate-d-s4-skill-r2-revalidate.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round3-revalidate-d-s4-skill-r3-revalidate.md`

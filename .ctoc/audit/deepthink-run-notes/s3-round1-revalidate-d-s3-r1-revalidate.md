**Result.** All 17 approved texts are in the file exactly as approved, with the corrected wording for the backgrounded-run and permission-prompt changes. None of the old texts remains, and every pinned string is intact. One claim is wrong, and it is in my own corrected permission-prompt text from the first validation. It says "No prompt reaches the owner … in auto mode", but the vendor's page says auto mode goes back to prompting after repeated blocks. The edits also introduced one contradiction and three smaller problems. I found four drifted or wrong references in the owner list. Nine leftovers in total, listed below.

## Check 1: the 17 texts, the old texts, the frontmatter

- **All 17 new texts are present verbatim.** The backgrounded-run paragraph is at line 215 and the permission-prompt bullet at line 60, both in the corrected form.
- **No old text remains.** I searched for the ten distinctive old strings and found zero matches. Where an old string survives, it is because the approved new text contains it on purpose (the backgrounded-run, permission-prompt, cite-only-what-you-opened and date changes).
- **No other body changes, as far as I can check.** I could not run `git diff` because I hold no shell. Instead I worked out from the 17 changes which lines they touch: 22 lines removed and 27 added. That matches the executor's reported count exactly. Every line anchor the critic cited shifts by exactly +1, +3 or +5, matching the three multi-line insertions. This is strong evidence, but it is not a byte-for-byte proof of the untouched lines.
- **Frontmatter is fine.** Only `description` changed. It is one line, with no ": " and no " #".
- **Every pinned string in `tests/deepthink-ships-with-ctoc.test.js` is present.** I checked about 40 sentences and phrases by reading them. I did not run the tests; the executor reports 457 of 458 passing, with only the round-record check failing as expected.

## Check 2: new inconsistencies the edits introduced

1. **Medium: "last of all" contradicts the brief and the agent definition** (from the change that reorders the decision-question shape). Line 151 says the lettered menu comes "last of all … with nothing after it". But the brief's item 3 puts "Failures" last, items 4 and 5 put the paper list and the closing line after the result, and `deepthink-researcher.md` lines 83 to 89 fix that same order. A source brief also continues with "Derived, no question needed" after its questions.
2. **Low to medium: the date is needed before the command that produces it** (from the date-in-the-brief change). Line 120 asks for "Today's date, from the session's date command" at the launch in step 4. The date command only appears in step 5, which runs after the launch. So the order does not say to run it first.
3. **Low: the instruction invites guessing** (from the WebFetch change). Line 129 says "name under Failures every part WebFetch did not return". The agent cannot know everything a summarising tool left out, so a literal agent might list missing sections from memory.
4. **Low: "subsections" that are not subsections** (from the paste-the-sections change). Line 107 refers to Step 1 "with its two subsections". In `ask-me-questions`, the lettered-menu and new-ideas sections are separate sections after Step 1, not inside it.
5. **Observation only, no change proposed.** The pinned sentence on line 59 lists what gets pasted and does not include the result shapes. Line 107's explicit order overrides it.
6. **Observation only, not tested.** In a user project, `skills/ask-me-questions/SKILL.md` is a path inside the plugin, not the project. The skill already uses that convention on line 19.

Everything else agrees with `ask-me-questions`: heading, explanation paragraph, matrix, footnotes under the matrix, question sentence, new-ideas block, then the menu. Plain words pass: no banned abbreviation, no capital-letter word, no gate number.

## Check 3: citation-shaped claims in `skills/deepthink/SKILL.md`

**Counts (validator_final shape):** examined 27, VALIDATED 26, FABRICATED 1, UNSOURCEABLE 0, MISATTRIBUTED 0. Separately, STALE 0.

- **The one fabricated claim** is the auto-mode "no prompt" sentence on line 60, and the text is mine. The permission-modes page says: "if the classifier blocks an action 3 times in a row or 20 times total, auto mode pauses and Claude Code resumes prompting". Its decision order also lets a permission rule that says "ask" prompt the owner even in auto mode. Severity follows the verdict class (critical), but the practical harm is low because the error understates the protection, never overstates it. The same page also says: "With Claude Code v2.1.283 or later, auto mode is the built-in starting permission mode for interactive terminal and VS Code sessions."
- **Read again today:**
  - the permissions table (fetching from preapproved documentation domains, and "don't ask again" lasting permanently per repository);
  - the Node documentation on `.cjs` files: "`.cjs` files are always treated as CommonJS";
  - Microsoft's list of reserved device names (CON, PRN, AUX, NUL, COM1–9, LPT1–9, and the superscript forms). The program's pattern covers every one of those names that its name rule would let through;
  - `fetch-papers.cjs` in full, for every sentence about what the program does: lines 13, 23–33, 58–76, 152–173, 217–222, 259–289 and 292–295;
  - `start.md:114`, "Record first";
  - the agent's tools line, `tools: WebSearch, WebFetch`.
- **Owner quotes dated 12 September 2026:** checked against the owner's private memory note (its file name removed at the owner's decision of 2026-10-05). It contains "choose the most obvious choice, with the algorithm do deepthink …" and a second sentence on the waiting budget (from the owner's private note for another project; quotation removed at the owner's decision of 2026-10-05), and the parent plan's line 344 records the same ruling. The 2 October 2026 ruling is confirmed by the program's line 214 and the test's line 322.
- **Validated earlier today and not fetched again:** permission prompts reaching the main session from version 2.1.186, WebFetch cutting long pages, a command at its time limit being moved to the background, `rmSync` without `force` failing on a missing file, GitHub turning bare addresses into links, and the abort signal also covering the reading of the body.
- **Left to the hallucination detector, not checked by me:** the `menu task …` command flags, the agent type string, and whether `${CLAUDE_PLUGIN_ROOT}` gets filled in.

## Check 4: the owner list (10 entries)

- **The five evidence corrections are folded in correctly**, and every option is presented flat with no recommendation, the new tenth entry included.
- **Re-checked:** 19 references. 15 validated; the 18 occurrences of "LLM01:2025" in 8 files was counted again.
- **3 stale:** line numbers in the skill that moved with this round's edits.
- **1 contradicted by its source, and I missed it in my first validation.** The entry says plan line 307 "cites the same paraphrase". It does not: it uses a third wording, "never combines untrusted web input, file writing and a shell in one agent".
- **Not re-run by me:** the tenth entry rests on the executor's own runtime measurement.

## Leftovers

**Leftover 1. FABRICATED.** File `skills/deepthink/SKILL.md`, line 60.
```
old: No prompt reaches the owner for a fetch from a documentation site Claude Code approves in advance, in auto mode, where a classifier decides instead, or once the owner has allowed web searches, or fetches from a site, without asking again, which lasts for the repository.
new: No prompt reaches the owner for a fetch from a documentation site Claude Code approves in advance, or once the owner has allowed web searches, or fetches from a site, without asking again, which lasts for the repository. In auto mode, which an interactive terminal session starts in by default from Claude Code 2.1.283 on, a classifier reviews each request instead of the owner unless a permission rule says to ask, and prompting resumes after the classifier has blocked three actions in a row or twenty in the session.
```

**Leftover 2. Contradiction.** File `skills/deepthink/SKILL.md`, line 151.
```
old: and the lettered menu last of all, ending `Reply with a letter.`, with nothing after it.
new: and the lettered menu last in the question, ending `Reply with a letter.`, with nothing of that question after it; the brief's "Failures" section, paper list and closing line still follow the whole result.
```

**Leftover 3. Order gap.** File `skills/deepthink/SKILL.md`, line 85. This keeps the pinned refused-launch sentence intact.
```
old: placeholder filled. If the launch fence refuses the launch,
new: placeholder filled; the date in it comes from running, before the launch, the date command shown in step 5, and step 5's header uses that same date. If the launch fence refuses the launch,
```

**Leftover 4. An order that invites guessing.** File `skills/deepthink/SKILL.md`, line 129.
```
old: name under Failures every part WebFetch did not return,
new: name under Failures every part you can tell WebFetch did not return,
```

**Leftover 5. Section names.** File `skills/deepthink/SKILL.md`, line 107.
```
old: and Step 1 of the decision-question format (`skills/ask-me-questions/SKILL.md`) with its two subsections on the lettered menu and on new ideas:
new: and, from the decision-question format (`skills/ask-me-questions/SKILL.md`), its sections "Step 1 — Render the question, the explanation, and the decision matrix in the text response", "The lettered menu, last on screen, on every question" and "New ideas are proposals to check, never facts":
```

**Leftovers 6 to 9.** File `.ctoc/audit/deepthink-improvement/for-the-human.json`.

6. Stale line number, entry on the check and the connection doing separate name lookups.
```
old: The skill's line 194, pinned at tests line 258
new: The skill's line 197 (after round 1's edits), pinned at tests line 258
```

7. Stale line number, entry on which calendar day the date uses.
```
old: Line 94 runs new Date().toISOString().slice(0, 10)
new: The skill's line 95 (after round 1's edits) runs new Date().toISOString().slice(0, 10)
```

8. Stale line numbers, entry on the long-run line under owner decisions.
```
old: SKILL.md lines 166-170 put
new: SKILL.md lines 169-173 (after round 1's edits) put
```

9. Contradicted by its source, entry on the Rule of Two paraphrase.
```
old: The parent plan (deepthink-ships-with-ctoc.md line 307) cites the same paraphrase.
new: The parent plan (deepthink-ships-with-ctoc.md line 307) cites the rule through the gate-critic definition in a third wording, 'never combines untrusted web input, file writing and a shell in one agent'.
```

All the `old` texts are unique in their files. None of the `new` texts touches a pinned string or would fail the plain-words check: no banned abbreviation and no word of capital letters, which is why I avoided "VS Code" in leftover 1.

**Risk.** Three things are unverified:
- that the body is byte-identical outside the 17 changes (no shell, so no diff);
- that the tests pass (I did not run them);
- whether a session in a user project can resolve the path to `ask-me-questions`.

Fetches used: 4 of about 12. No fetched page carried instructions aimed at an agent.

Files:
- <home>/Code/ctoc/skills/deepthink/SKILL.md
- <home>/Code/ctoc/.ctoc/audit/deepthink-improvement/for-the-human.json
- <home>/Code/ctoc/skills/deepthink/fetch-papers.cjs
- <home>/Code/ctoc/agents/ai-quality/deepthink-researcher.md
- <home>/Code/ctoc/skills/ask-me-questions/SKILL.md
- <home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js
- <home>/Code/ctoc/plans/implementation/deepthink-ships-with-ctoc.md
- the owner's private note for another project (its file name removed at the owner's decision of 2026-10-05)

Sources:
- [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)
- [Node.js packages, the "type" field](https://nodejs.org/api/packages.html)
- [Microsoft Learn, naming files, paths and namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)

<!-- Redacted by the build executor on 2026-10-02: 1 occurrence(s) of the other project's name, the account name or a session scratch path replaced with placeholders. -->

<!-- Redacted by the build executor on 2026-10-05, at the owner's decisions of that day (cut the private note down; no private personal information in a public repository): 5 occurrence(s) of the private note's file name or words, a configuration folder, a temporary folder or a home path replaced. -->

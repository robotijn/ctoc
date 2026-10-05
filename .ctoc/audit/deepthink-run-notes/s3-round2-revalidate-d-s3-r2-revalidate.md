**Round 2 re-validation of `skills/deepthink/SKILL.md`: all 16 approved texts are in the file once each, in their approved form, and no replaced old text remains. Every citation-shaped claim in the skill holds, with none fabricated, misattributed, unsourceable or stale. There are three leftovers: one wording clash in the skill, five stale line numbers in three of the new owner entries, and one overstated claim in another owner entry.** I edited nothing. I hold no shell, so I could not recompute `sha256:edacc840…6512` or run a diff. The executor's figure is the only hash check.

## Check 1: the 16 texts, the old texts, the frontmatter

- **Each new text appears once**, searched by a distinctive phrase: 17 phrases, 17 lines. The six corrected texts (r2-f1, f3, f6, f8, f9, f13) are in the corrected form, not the critic's original.
- **No old text remains.** I searched for 11 distinctive old strings. The only hit is r2-f14's new text, which contains its own old text on purpose.
- **No other body change, as far as I can check without a diff.** The edits add exactly five lines: one each from r2-f13, r2-f2 and r2-f3, and two from r2-f9. Every other change keeps its line count. All of the critic's roughly 20 line anchors land at the old line plus the expected shift (+0, +1, +2, +3 or +5). That is strong evidence but not a byte-for-byte proof, and the same limit applies to the description being unchanged.
- **Pinned strings.** I compared every test constant from line 254 to line 382 by reading, and all are intact. I did not run the tests. The executor reports 457 of 458 passing, with only check 24 (the round count) failing.

## Check 2: reading the whole file literally

- **The one-option exception and "the research decides nothing" agree.** Line 252 says the option "is not recorded as the owner's answer until the owner confirms it". That matches line 16, line 260 and the decision-question format's line 148.
- **The one-option exception against the menu-last rule** is consistent in substance: the format says an obvious answer is not asked (line 63), so the menu rule does not apply. The wording clashes, though. The skill says "The one exception to the lettered menu", while the format's line 144 says "The one exception is the screen after a further explanation", and the skill itself uses that further-explanation screen on line 251. That gives two "one exception" claims. This is leftover 1.
- **The presentation rules match `skills/ask-me-questions/SKILL.md`.** The section name "Sequencing — one question per turn, always" is present verbatim in both files. The satisfied-before-next rule matches line 164, and the opens-with-heading, ends-with-menu shape matches lines 97 and 144. Evidence summary and Failures now reach the owner through the explanation paragraph, which clears the earlier ordering conflict.
- **No order is impossible to carry out.**
  - The reading agent is asked only to judge addresses (r2-f9 redirects, r2-f10 file addresses) and to re-ask WebFetch (r2-f8). It can do all of that with WebSearch and WebFetch.
  - r2-f2 and r2-f3 are orders to the session.
  - The r2-f12 recipe was run by the executor in zsh, which printed `93 true` and `2718 false`.
- **The program's printed lines are described correctly** (r2-f11), checked against `fetch-papers.cjs`:
  - line 278 prints `kept ${dest} (${bytes.length} bytes)`, with no address;
  - line 235 refuses a non-object entry with no address;
  - lines 243, 247, 251, 255, 261, 266, 271 and 283 all print `${shown}`.
- **Structure is sound.**
  - Items 4 and 6 continue with three-space indented lines.
  - The brief's quote block is unbroken: lines 121 and 123 are `>` separators.
  - Plain words pass, as the executor's run of test 9 shows.

## Check 3: citation-shaped claims

**Skill: examined 33. VALIDATED 33, FABRICATED 0, MISATTRIBUTED 0, UNSOURCEABLE 0, STALE 0.**

- **27 were re-read today against the raw pages:**
  - Permission-modes page (`https://code.claude.com/docs/en/permission-modes.md`): line 56 ("Requires a supported model, and your organization can turn auto mode off"), line 288, line 420 ("Read-only HTTP requests"), lines 468 and 475 (three in a row or twenty in the session), lines 491 and 502, line 529 ("blocked at spawn time"), and line 531 ("or a separate API safety check refuses the review, the report is still delivered, prepended with a security warning. When the classifier is unavailable for the review, the report arrives with a note to verify").
  - Tools reference (`https://code.claude.com/docs/en/tools-reference.md`): line 566 ("runs the prompt against the content in a separate model call, and Claude receives the result of that call rather than the raw page"), line 568, line 572 (the no-dot refusal), line 577 (cross-host redirects), lines 580, 583 and 586, and line 394 (the private-address refusal, which sits under the Monitor tool only).
  - Data-usage page (`https://code.claude.com/docs/en/data-usage.md`): "sends the requested hostname to `api.anthropic.com` to check it against a safety blocklist maintained by Anthropic. Only the hostname is sent". The section says nothing about private addresses. This was my own correction in round 2, so I re-checked it here.
  - The program: `MIN_BYTES = 50 * 1024` and `MAX_BYTES = 100 * 1024 * 1024`; 100 × 1,048,576 = 104,857,600.
  - The decision-question format, by reading the file: the three pasted headings at lines 95, 131 and 146, and the `[unverified]` marker in matrix rule 10.
- **6 carry over from earlier validation and were not fetched again:** the older-version refusal without asking, `.cjs` running as CommonJS, record-first at `start.md` line 388, and the three owner attributions (2 October, and 12 September twice).

**Owner list, the four round-2 entries: STALE 5, MISATTRIBUTED 1, everything else as validated in round 2.**
- The 5 stale references are the skill line numbers in entries 1, 3 and 4. Each is now off by five, and none says which version of the file it means (leftovers 2 to 4).
- The misattributed one is entry 2's cons line, "documented behaviour" (leftover 5). By verdict class it is high; in practice it is low.
- Not re-run by me: the executor's Node v24.14.1 measurement. It is honestly labelled as the executor's own.

## Check 4: the four new owner entries

- **Corrections folded in:** the registry's comma-separated row, the URL Standard serializer citation, and the literal-interpretation wording. The last now matches CTOC's `CLAUDE.md` ("Vague prompts produce silent drift. Every agent prompt must be explicit").
- **Options are flat in all four entries**, with no recommended option.
- **No other project is named.** The note's path is masked as `<another of the owner's own projects>`.
- **Gap:** the line numbers are stale (see check 3).
- **Note only:** the round-1 entries' "(after round 1's edits)" line numbers have also shifted, by two to five lines. They name their version, so they are still honest.

## Check 5: round 1's items that were not re-checked

- **The auto-mode sentence** (rewritten by r2-f1, line 60) reads correctly. It was re-read against the permission-modes lines above.
- **Leftover 2** (line 156) reads correctly, and r2-f5's one-option sentence follows it without conflict.
- **Leftover 3** (line 86) reads correctly. The date command is shown in step 5 (line 97), and the brief's date field is at line 125.
- **Leftover 4** (line 134) reads correctly.
- **Leftover 5** (line 110) matches the format's headings exactly, including the "(Tijn, 2026-09-07)" suffixes.

```yaml
validator_final:
  file: skills/deepthink/SKILL.md
  fingerprint_checked: false   # no shell
  examined: 33
  validated: 33
  fabricated: 0
  misattributed: 0
  unsourceable: 0
  stale: 0
  owner_list_round2:
    stale: 5
    misattributed: 1
    not_rerun: ["executor's Node v24.14.1 mapped-address measurement"]
  approved_texts_present_once: 16/16
  old_texts_remaining: 0
  pins_intact: true            # by reading; the test run is the executor's
```

## Leftovers

**1. Low, wording clash.** File `skills/deepthink/SKILL.md`, line 252.
```
old: The one exception to the lettered menu: a researched question
new: The one exception this skill adds to the decision-question format's lettered menu: a researched question
```

**2. Stale.** File `.ctoc/audit/deepthink-improvement/for-the-human.json`, entry `h-deepthink-r2-version-six-benchmark-range`. This entry has two edits.
```
old: The skill's line 198, pinned at the test's line 308,
new: The skill's line 203 (after round 2's edits), pinned at the test's line 308,
```
```
old: which is about the two name lookups behind line 197.
new: which is about the two name lookups behind the skill's line 202 (after round 2's edits).
```

**3. Stale.** Same file, entry `h-deepthink-r2-obvious-choice-quotation`.
```
old: Line 260 quotes the owner:
new: The skill's line 265 (after round 2's edits) quotes the owner:
```

**4. Stale.** Same file, entry `h-deepthink-r2-waiting-budget-threshold`. This entry has two edits.
```
old: Lines 270-273: 'a person can wait
new: The skill's lines 275-278 (after round 2's edits): 'a person can wait
```
```
old: Line 273 chooses the long-run line
new: Line 278 chooses the long-run line
```

**5. Misattributed (high by class, low in practice).** Same file, entry `h-deepthink-r2-mapped-address-untested`, the "as-is" option's cons. The entry's own evidence says Node documents mapped matching only for a single-address rule. The subnet rules the program uses were measured, not documented.
```
old: The refusal rests on documented behaviour that nothing tests.
new: The refusal rests on behaviour Node documents only for a single-address rule and that was measured once, outside the suite, on Node v24.14.1; nothing tests it.
```

Every old text above occurs exactly once in its file. None of the new texts touches a pinned string, adds a capital-letter word or uses an abbreviation.

**Risk:**
- The body's byte identity outside the 16 changes and the fingerprint are unverified, because I have no shell.
- The test pass count is the executor's run, not mine.
- If round 3 moves lines again, leftovers 2 to 4 will need the same treatment.

Files:
- `<home>/Code/ctoc/skills/deepthink/SKILL.md`
- `<home>/Code/ctoc/.ctoc/audit/deepthink-improvement/for-the-human.json`
- `<home>/Code/ctoc/skills/deepthink/fetch-papers.cjs`
- `<home>/Code/ctoc/skills/ask-me-questions/SKILL.md`
- `<home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js`

Sources:
- [Claude Code: permission modes](https://code.claude.com/docs/en/permission-modes.md)
- [Claude Code: tools reference](https://code.claude.com/docs/en/tools-reference.md)
- [Claude Code: data usage, WebFetch domain safety check](https://code.claude.com/docs/en/data-usage.md)

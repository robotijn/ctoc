All four checks pass. Both edits are true, neither adds a claim, and nothing else in the skill shows any sign of having changed. No leftovers.

```yaml
# skills/deepthink/SKILL.md, as it stands now (the dispatch gives sha256:245e1d3d…57d0)
validator_final: { examined: 91, VALIDATED: 91, FABRICATED: 0, MISATTRIBUTED: 0, UNSOURCEABLE: 0, STALE: 0 }
```

This builds on the final re-validation's 90 VALIDATED. The turn-rule clause on line 137 was deleted, so the examined count drops from 92 to 91. The index-cell sentence on line 230 was corrected and now counts as VALIDATED, so 90 + 1 = 91.

**1. Lines 137 and 230: present as written, true, nothing new claimed.**
- **Line 137** now reads "This brief sets its own rule: count every search and every fetch…". The old clause "What counts as one turn is not documented" is gone; a search for it finds nothing. What remains is the brief describing its own rule, plus the 80-turn limit, which matches `maxTurns: 80` on line 17 of `agents/ai-quality/deepthink-researcher.md`.
  - I re-read the agent-loop documentation page (https://code.claude.com/docs/en/agent-sdk/agent-loop) today; the fetch returned the full page text.
  - It defines a turn: "A turn is one round trip inside the loop: Claude produces output that includes tool calls, the SDK executes those tools, and the results feed back to Claude automatically". It also says a turn may "request one or more tool calls".
  - So 70 searches and fetches can never use more than 70 turns. The rule's stated purpose, finishing before the limit, holds.
- **Line 230** now reads "…are not among them and can reach a cell." I checked it against the program code itself:
  - `fetch-papers.cjs` lines 103–106 list the hidden characters: 0x00–0x1f, 0x7f–0x9f, 0x200b–0x200d, 0x2060, 0x202a–0x202e, 0x2066–0x2069, 0xfe00–0xfe0f and 0xe0000–0xe007f. `plain()` (lines 109–116) turns each into a space, which matches the sentence's list exactly.
  - None of the six named characters is in those ranges: U+200E, U+200F, U+061C, U+FEFF, U+2028 and U+2029.
  - `cell()` on line 155 only collapses runs of spaces, escapes the listed characters, then calls `.trim()`. Trim can only strip characters at the start or end of a cell, so all six survive in the middle of one. "Can reach" is true; the old "unchanged" was false.

**2. Nothing else in the skill changed, as far as I can tell.** Four pieces of evidence agree:
- The apply script, `scratchpad/s3r3/final.cjs`, refuses to run unless the skill's fingerprint is `1977a2ea…6c75`, the version the final re-validation read. It replaces each old text exactly once, applies only the first two leftovers to the skill, and refuses if the line count or the frontmatter changes.
- The byte counts add up. The executor reports 35,049 bytes before and 34,997 after, a drop of 52. Removing the turn-rule clause takes out 46 bytes and the cell wording change takes out 6, so 46 + 6 = 52.
- Neither old text can be found in the file any more.
- Every line number in the owner list still lands on the right line.

I cannot recompute the sha256 because I have no shell. So this is evidence from the script and from the byte arithmetic, not a byte-for-byte comparison.

**3. final-3 to final-11 are all present in `for-the-human.json`, and every skill line reference holds:**

| Skill lines | What the reference says | Holds |
|---|---|---|
| 189–197 | staging file and the command that names only it | yes |
| 212–215 | the quoted-address output line, and the program's reason under Failures | yes |
| 122 | no brief text in a search or web address | yes |
| 145 | cite only addresses seen on a page you opened | yes |
| 55 | the pinned "no other tool" sentence (the test's lines 317–318) | yes |
| 242 | the failed-run sentence (the test's lines 347–348) | yes |
| 142–143 | the address of the paper's file itself | yes |

- The test line numbers cited in the list also hold: 644 (`maxTurns: 80`), 449 and 329.
- final-10's two quotations from the agent-loop page match the page word for word. Its inference that one turn can hold several searches or fetches is supported by the page's two-`Read`s-in-one-turn example.

**4. Every pinned string in `tests/deepthink-ships-with-ctoc.test.js` is still present.** I checked each one by eye against the skill:
- all 12 web-content-is-data sentences;
- the two cut-off-run sentences, the two unfilled-plugin-root sentences, the file-name limit phrase and the four program sentences;
- the reading agent's tools sentence, the not-installed sentence, the version-control ignore sentence, and the program command line, which appears exactly once (line 196);
- the honest-run sentences: nothing marked running before launch, refused launch, failed run, run order, shell time limit, task start with agent id, promotion and brief override;
- the bookkeeping sentence, the quality-or-owner decision sentence, the seven result section names, and the frontmatter lines.

The strings the test forbids are all absent: `citation-validator`, `general-purpose`, `claude -p`, `exact path`, `fetch-papers.js`, `docs/papers`, `docs/research`, `<another of the owner's projects>`, `soonest`, and a copy at `.ctoc/papers/fetch-papers.cjs`.

**No leftovers.**

**Risk:**
- I did not run the test suite, did not recompute the fingerprint, and did not compare the file byte for byte.
- Only lines 137 and 230, and the pinned strings, were re-checked in this pass. The other 89 VALIDATED verdicts are carried over from the final re-validation, not re-read.
- These counts would change if someone edited the file after the executor's write, which a recomputed sha256 would show, or if `fetch-papers.cjs` changed its hidden-character list or `cell()`.

Files:
- <home>/Code/ctoc/skills/deepthink/SKILL.md
- <home>/Code/ctoc/skills/deepthink/fetch-papers.cjs
- <home>/Code/ctoc/.ctoc/audit/deepthink-improvement/for-the-human.json
- <home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js
- <home>/Code/ctoc/agents/ai-quality/deepthink-researcher.md
- <scratchpad>/s3r3/final.cjs

Sources:
- [How the agent loop works, Claude Code documentation](https://code.claude.com/docs/en/agent-sdk/agent-loop)

<!-- Redacted by the build executor on 2026-10-02: 2 occurrence(s) of the other project's name, the account name or a session scratch path replaced with placeholders. -->

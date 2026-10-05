Two claims in the skill are false, so the count cannot be zero yet. Both come from round 3's own corrected texts. Each needs one wording change, below as leftovers 1 and 2; once both are applied, nothing fabricated, misattributed or unsourceable is left.

## Counts, `validator_final` shape

```yaml
# as the file stands, sha256:1977a2ea… (as given; I could not recompute it, there is no shell in this grant)
validator_final: { examined: 92, VALIDATED: 90, FABRICATED: 2, UNSOURCEABLE: 0, MISATTRIBUTED: 0 }   # STALE: 0
# after skill leftovers 1 and 2 (one claim deleted, one corrected)
validator_final: { examined: 91, VALIDATED: 91, FABRICATED: 0, UNSOURCEABLE: 0, MISATTRIBUTED: 0 }   # STALE: 0
```

- **Line 137, false.** The skill says "What counts as one turn is not documented". It is documented. Anthropic's Agent Software Development Kit page on the agent loop says, word for word: "A turn is one round trip inside the loop: Claude produces output that includes tool calls, the SDK executes those tools, and the results feed back to Claude automatically". It also says `maxTurns` "counts tool-use turns only". The brief's own rule (count every search and fetch, stop after the seventieth) stays safe under that definition.
- **Line 230, false.** The skill says the direction marks, U+FEFF, U+2028 and U+2029 "reach a cell unchanged". The program's `cell()` (fetch-papers.cjs line 155) ends with `.trim()`. MDN says trim removes white space plus line terminators, and its tables list U+FEFF as white space and U+2028 and U+2029 as line terminators. So those three are removed at the start or end of a cell. The three marks do pass through unchanged.
- **Pinned sentences that are true only with their neighbour:**
  - Line 55 ("no other tool") is true only together with line 56 (the extra auto-mode tool).
  - Lines 204 and 205 are true only together with line 207 (the two known gaps).
  - All three count as validated on that basis.
- **Checked live today, no drift:** the tools reference and the permission-modes page (both read as the pages' own text) for lines 56, 61, 62, 101 (the turn limit), 124, 136 and 222.
- **Validated in earlier rounds today and not re-read in this pass:** the domain safety check's blocklist, the "don't ask again" behaviour for web searches, the Internet Assigned Numbers Authority benchmark range, the undici decompression source, Node's lookup documentation, Unicode chapter 23, and the two quotations of Tijn.

## Checks 1, 2 and 4

1. **Edits.** Every round 3 text and both sweeps are present once.
   - The olds of r3-f4, r3-f8, r3-f9 and the sweep-2 paths are gone. The only un-prefixed backticked plugin path left is the pinned one on line 192, which is correct.
   - The line shifts (+1 after line 55, +2 after line 62) match two inserted lines.
   - I have no copy of the file from before round 3, so "nothing else changed" rests on reading `scratchpad/s3r3/apply.cjs`. It only does exact-once span replacements, checks the starting fingerprint (26222c3c…) and checks the frontmatter is unchanged. That is evidence from the script, not from a byte comparison.
2. **Whole-file read.**
   - No contradiction from the paper-list bullet (line 63): it opens with "Besides the reading agent's own searches and fetches".
   - No order the session or the reading agent cannot carry out.
   - List and quote structure is intact, and the file agrees with `skills/ask-me-questions/SKILL.md` (lines 100, 131, 146, 160, 237).
   - Every pinned string in the test is present, checked by eye. I did not run the suite.
3. **Owner entries.**
   - All corrections are folded in, options are flat, and no other project is named.
   - Several skill line numbers are stale (leftovers 3, 4, 6, 7, 8 and 11).
   - The turn-limit entry is missing the turn definition (leftover 10).
   - One option's cons is broader than its evidence (leftover 5).

## Leftovers

Every `old` is verbatim and occurs once. The two skill edits stay within their lines, so the "(after round 3's edits)" line numbers below remain correct after they are applied. Because they change the skill's bytes, the round's `fingerprint_after` must be recomputed afterwards.

```yaml
# skills/deepthink/SKILL.md (only deletes or narrows; adds no claim)
- id: final-1
  old: "What counts as one turn is not documented, so this brief sets its own rule:"
  new: "This brief sets its own rule:"
- id: final-2
  old: "are not among them and reach a cell unchanged."
  new: "are not among them and can reach a cell."

# .ctoc/audit/deepthink-improvement/for-the-human.json, decoded string values
- id: final-3   # h-deepthink-r3-paper-list-unprompted-requests
  old: "SKILL.md lines 187-195;"
  new: "SKILL.md lines 189-197 (after round 3's edits);"
- id: final-4   # same entry; the skill says the program's reason goes under Failures, not its line
  old: "named afterwards under Failures with the program's line, which quotes its address: SKILL.md lines 212-213, fetch-papers.cjs line 266"
  new: "named afterwards under Failures with the program's reason, and the program's own output line for that paper quotes its address: SKILL.md lines 212-215 (after round 3's edits), fetch-papers.cjs line 266"
- id: final-5   # same entry, as-stated cons; narrowed to the evidence (believed, not read: in manual mode the Write prompt for the staging file may show its contents)
  old: "An address on any public host is still requested with no person seeing it."
  new: "An address on any public host is still requested with no step of the skill showing it to a person first."
- id: final-6
  old: "(SKILL.md line 120)"
  new: "(SKILL.md line 122 (after round 3's edits))"
- id: final-7
  old: "opened (line 143)"
  new: "opened (line 145 (after round 3's edits))"
- id: final-8   # h-deepthink-r3-report-handback-tool
  old: "The skill's line 55, pinned at the test's lines 317-318"
  new: "The skill's line 55 (after round 3's edits, which left its number unchanged), pinned at the test's lines 317-318"
- id: final-9   # h-deepthink-r3-turn-limit-relaunch
  old: "(line 240, pinned at the test's lines 347-348)"
  new: "(line 242 (after round 3's edits), pinned at the test's lines 347-348)"
- id: final-10  # same entry
  old: "so r3-f3 states its count as the brief's own rule."
  new: "so r3-f3 states its count as the brief's own rule. The Agent Software Development Kit documentation's page on the agent loop does define one (https://code.claude.com/docs/en/agent-sdk/agent-loop, read 2026-10-02 by round 3's final re-validation; the fetch tool returned the page's text in full): 'A turn is one round trip inside the loop: Claude produces output that includes tool calls, the SDK executes those tools, and the results feed back to Claude automatically', and 'You can cap the loop with `max_turns` / `maxTurns`, which counts tool-use turns only'. Whether Claude Code counts a subagent's maxTurns the same way was not read. Under that definition one turn can hold several searches or fetches, so the brief's count of searches and fetches is never lower than the number of turns spent on them. The final re-validation removed the skill's clause that what counts as one turn is not documented."
- id: final-11  # h-deepthink-r3-researcher-file-wording
  old: "(SKILL.md lines 140-141)"
  new: "(SKILL.md lines 142-143 (after round 3's edits))"
```

Both false claims err on the safe side: under the documented definition, the brief's rule stops the reading agent earlier than needed, and the trimming removes characters rather than letting them through. What would change these counts is a source showing that Claude Code counts a subagent's `maxTurns` differently from the Agent Software Development Kit. Even then, leftover 1 stays correct, because it only deletes the clause.

Files: `<home>/Code/ctoc/skills/deepthink/SKILL.md`, `<home>/Code/ctoc/.ctoc/audit/deepthink-improvement/for-the-human.json`, `<home>/Code/ctoc/skills/deepthink/fetch-papers.cjs`, `<home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js`, `<scratchpad>/s3r3/apply.cjs`

Sources:
- [How the agent loop works, Claude Code documentation](https://code.claude.com/docs/en/agent-sdk/agent-loop)
- [String.prototype.trim(), MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/trim)
- [Lexical grammar, MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar)
- [Tools reference, Claude Code documentation](https://code.claude.com/docs/en/tools-reference.md)
- [Choose a permission mode, Claude Code documentation](https://code.claude.com/docs/en/permission-modes.md)

<!-- Redacted by the build executor on 2026-10-02: 1 occurrence(s) of the other project's name, the account name or a session scratch path replaced with placeholders. -->

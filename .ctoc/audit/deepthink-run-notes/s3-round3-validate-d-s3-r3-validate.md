# Round 3 validation of `skills/deepthink/SKILL.md` (read 2026-10-02)

**Verdict.** All ten edits can ship. Five ship as written and five need the corrected text below. Every claim in the ten edits checked out against its source; the corrections fix wording, placement and one path the session cannot follow. Do not apply the critic's replacement for "counted after decompression": I found a source for the existing claim. The owner entries carry one misattributed title, one claim that its own skill contradicts as worded, and one unsourced inference. Corrections for all three are below. Once everything here is applied, no claim in the skill is fabricated, misattributed or unsourceable. Three pinned sentences are still imperfect when read alone. Each is made true by an unpinned sentence next to it: r3-f2 for line 55, and sweep edit 1 for lines 202 and 203.

**What I could not check.** I could not compute the file's sha256 fingerprint, because this grant has no shell. The file I read matches the line numbers the research and the critic used (55, 60, 205, 227–228), but that does not prove the fingerprint. I ran no test and sent no live request.

## Verdicts on the ten edits

| Edit | Verdict | Evidence (all read 2026-10-02) |
|---|---|---|
| r3-f1 | PASS-WITH-CORRECTION (placement only) | `fetch-papers.cjs`: line 242 `isHttps`, line 246 `hasCredentials`, lines 74–75 `https` and internal host on every hop, line 76 `fetch(current, …)`. Lines 250 and 254 check folder and file names, not the address. `SKILL.md` lines 187–195 put the addresses in the staging file; line 120 covers "a web address". All claims hold. Inserted in the middle of line 60, the next sentence ("No prompt reaches the owner for a fetch … or fetches from a site, without asking again") reads as if it covered the program's requests. The program literally calls `fetch`. So the sentence moves to its own bullet. |
| r3-f2 | PASS | Raw `https://code.claude.com/docs/en/tools-reference.md`, line 53: "`SubagentHandback` \| Delivers a subagent's final report to whichever conversation receives that subagent's result. Provided only in auto mode, to subagents that the Agent tool runs locally other than forks … Requires Claude Code v2.1.271 or later". Line 112: "Claude Code also gives the subagent that tool, even if you leave it out of `tools` or list it in `disallowedTools`." The list structure stays valid: the inserted line is indented two spaces with no blank line, so it continues the first bullet's paragraph. |
| r3-f3 | PASS-WITH-CORRECTION | `https://code.claude.com/docs/en/sub-agents.md` (through the fetch tool's answer): "`maxTurns` … Maximum number of agentic turns before the subagent stops … The partial marking requires Claude Code v2.1.246 or later". Raw tools reference, line 101: "When the subagent reaches the limit, Claude Code marks the returned result as partial output". The agent file's line 17 is `maxTurns: 80`. **Neither page defines a turn.** I searched every use of "turn" in the raw tools reference; the sub-agents answer was "NO DEFINITION OF A TURN FOUND". So the count of searches and fetches has to be stated as the brief's own rule. |
| r3-f4 | PASS-WITH-CORRECTION (the version as written is also all true) | Code lines 103–106, 109–116 and 154–155. Unicode Standard Annex number 9, revision 52 (2026-09-01), section 2.6 (fetch tool's answer): "LRM \| U+200E \| LEFT-TO-RIGHT MARK \| Left-to-right zero-width character". The Arabic letter mark is U+061C and the right-to-left mark is U+200F. Unicode 18.0.0 core specification, chapter 23 (`https://www.unicode.org/versions/Unicode18.0.0/core-spec/chapter-23/`, fetch tool's answer): "U+200B ZERO WIDTH SPACE", "U+200C ZERO WIDTH NON-JOINER", "U+200D ZERO WIDTH JOINER", "U+2060 WORD JOINER", "U+FEFF ZERO WIDTH NO-BREAK SPACE", "U+2028 LINE SEPARATOR", "U+2029 PARAGRAPH SEPARATOR", variation selectors "U+FE00..U+FE0F" and "U+E0100..U+E01EF", tags "U+E0000..U+E007F". The correction names U+FEFF, U+2028 and U+2029 as passing through, because the old text claimed "no line break". |
| r3-f5 | PASS-WITH-CORRECTION | Raw tools reference, line 566: "Claude receives the result of that call rather than the raw page". As written, "a page other than the one you asked for" would send a same-site redirect to the same source to Failures, for example an arXiv abstract page redirecting to its numbered version. |
| r3-f6 | PASS | Every `console.log` in the program (lines 188–289, 293) opens with fixed words. Only line 289 opens with `papers in the list:`. `plain()` turns a line break into a space, so a quoted address cannot start a new line. Lines 239 and 243 print the refused address through `JSON.stringify`. |
| r3-f7 | PASS | Internal: the heading form at line 149 and the "none" at line 125. |
| r3-f8 | PASS | `skills/ask-me-questions/SKILL.md` line 100: "One short paragraph (two to four sentences)". |
| r3-f9 | PASS-WITH-CORRECTION | `docs/DISPATCH_PROTOCOL.md` lines 157–162: "## Audit log … `.ctoc/audit/dispatches/YYYY-MM-DD/<dispatch_id>.yaml`" holds. **The session cannot carry out the order as written.** In a user's project there is no `docs/DISPATCH_PROTOCOL.md`; that file sits in the plugin. The plugin manifest reference (`https://code.claude.com/docs/en/plugins-reference.md`, full page returned) says `${CLAUDE_PLUGIN_ROOT}` resolves "Anywhere in the Markdown body" of skill content, and the skill already uses that form at lines 77 and 194. Because `marketplace.json` has `"source": "./"`, `docs/` ships inside the plugin root. I believe that from the manifest but did not check an installed copy. |
| r3-f10 | PASS | `src/commands/start.md` line 114 (the prefix), line 116 (the same prefix), and line 124: "`menu task complete <id> --summary "…"` … or `menu task fail <id> --summary "…"`". In `src/lib/menu-screens.js`, line 2539 routes `fail`, line 2065 parses `--summary`, and line 2294 stores the summary. |

The critic's check item 9, "counted after decompression" (line 205), is **VALIDATED**, so its replacement should not be applied. The source is undici `lib/web/fetch/index.js` (raw GitHub, main branch, fetch tool's answer). `const willFollow = location && request.redirect === 'follow' && redirectStatusSet.has(status)` is false under the program's `redirect: 'manual'`. Gzip, deflate, Brotli and zstd decoders are then pushed, and the body is built as `body: decoders.length ? pipeline(this.body, ...decoders, …)`. An unsupported coding hits `else { decoders.length = 0; break }`, so nothing is decompressed and nothing contradicts the claim. A second, independent route agrees: the Fetch Standard (`https://fetch.spec.whatwg.org/`, fetch tool's answer) says "To handle content codings … Return the result of decoding bytes with codings". The page came back cut off before its network-fetch section. The round 1 record already shows that Node's fetch is undici. One limit: I read undici's main branch, not the exact copy bundled with the user's Node.

## The three special checks

- **Mechanical.** Grep counted each `old` exactly once, including my two new anchors on lines 61 and 205. All anchors sit on different lines (56, 60, 61, 80, 90, 125, 134, 135, 205, 220, 228, 251), so they are pairwise disjoint. No `new` contains another edit's `old`.
- **Pins.** No pinned string is touched. r3-f2 anchors on line 56, not on the pinned line 55. r3-f9's anchor on line 90 lies between the pinned task-start text (line 89) and the "Nothing says the research is running" sentence (line 93) and overlaps neither.
- **Plain words.** Every new and corrected text passes the banned-abbreviation list in `evals/lib/graders.js`. Words in capital letters appear only inside backticks or as CTOC, and no gate number appears.

## Corrected texts

```yaml
- id: r3-f1
  old: "In auto mode the classifier lists read-only web requests among what it allows by default."
  new: "In auto mode the classifier lists read-only web requests among what it allows by default.\n- Besides the reading agent's own searches and fetches, the paper list is a second way out: its addresses reach the fixed program in the staging file, never in its command, and the program checks an address only for `https`, for a user name or password and for an internal host, so it requests a paper's address on any public host from this machine; a steered reading agent could carry pasted text out in such an address, and the brief's rule against putting its text into a web address covers those addresses too."
- id: r3-f3
  old: ">    each source was read."
  new: ">    each source was read. Your run is stopped after 80 turns, and a result stopped there is thrown away. What counts as one turn is not documented, so this brief sets its own rule: count every search and every fetch you make, and make none after the seventieth, so that the whole result, the paper list and the closing line are written before the limit."
- id: r3-f4
  old: "line break, control character, zero-width character or direction mark, and escape"
  new: "control character, line feed and carriage return included, no zero-width space, non-joiner, joiner or word joiner, no direction embedding, override or isolate, none of the first sixteen variation selectors and no tag character, because the program turns each of these into a space; the left-to-right, right-to-left and Arabic letter marks, the zero-width no-break space, and the line separator and paragraph separator characters are not among them and reach a cell unchanged. Cells also escape"
- id: r3-f5
  old: "whenever you did not see it in the page's own text."
  new: "whenever you did not see it in the page's own text. The tool's answer about the source you asked for counts as reading it; an error, a sign-in or consent page, or a page that is not that source is a failed fetch, named under Failures."
- id: r3-f9
  old: "record the launch as CTOC records every dispatch;"
  new: "record the launch as CTOC records every dispatch, in a file under `.ctoc/audit/dispatches/<date>/` in this project, as the section \"Audit log\" of `${CLAUDE_PLUGIN_ROOT}/docs/DISPATCH_PROTOCOL.md` describes;"
- id: sweep edit 1   # new, from this validation; makes the pinned sentences on lines 202 and 203 true together with it, touching neither
  old: "the program's own name lookup for the internal-address check is bounded by the system's resolver, not by that limit."
  new: "the program's own name lookup for the internal-address check is bounded by the system's resolver, not by that limit. The check has two known gaps: of the benchmark networks it refuses only the version four range, not the version six range `2001:2::/48`; and the request is made to the host name, not to the address the check found, so the connection looks the name up again, and a name whose address changes between the two lookups can still be reached at an internal address."
```

Sources for sweep edit 1:
- **The code.** Line 30 has no `2001:2::/48`; line 26 holds `198.18.0.0/15`; line 62 does `dns.lookup`; line 76 passes the URL, not the address it checked.
- **Version six benchmark range.** IANA's version six special-address registry, as a comma-separated file, read in round 2: "2001:2::/48,Benchmarking,…".
- **The second lookup.** Raw `nodejs/node` `doc/api/net.md` (fetch tool's answer): "`lookup` {Function} Custom lookup function. **Default:** `dns.lookup()`". This is the same gap as the owner entries `h-deepthink-r1-check-and-connect-lookups` and `h-deepthink-r2-version-six-benchmark-range`.
- **Upkeep.** If the owner fixes the program, this sentence must change with it.

## Sweep of the rest of the skill

These claims checked out:
- The "one exception this skill adds" (line 252) matches `ask-me-questions` line 144.
- The record command's `--label` and `--touches` options are parsed in `menu-screens.js` lines 2064 and 2057.
- The paper library and the brief folder are always writable: `PreToolUse.Edit.js` lines 75 and 77 match `/^\.ctoc\//` and `/^plans\/.*\.md$/`.
- Lines 61, 122 and 134 match the raw tools reference, lines 572, 577 and 566.
- The `${CLAUDE_PLUGIN_ROOT}` convention at lines 77, 81, 194 and 198 is the documented way to name a plugin file.

Line 55 is pinned and **STALE** in auto mode; r3-f2 qualifies it. Everything else was validated in rounds 1 and 2, and the round 3 research's raw re-reads reported no drift.

One item outside citations, in the same class as r3-f9: lines 19–20, 26, 52 and 110 name plugin files (`skills/agent-fragments/…`, `skills/ask-me-questions/SKILL.md`, `agents/ai-quality/…`) with no plugin root. In a user's project those paths do not exist where a literal reader would look. Adding `${CLAUDE_PLUGIN_ROOT}/` in front keeps every substring the tests pin.

## Counts

| | Validated | Fabricated | Misattributed | Unsourceable | Stale |
|---|---|---|---|---|---|
| Ten new texts (28 claims) | 28 | 0 | 0 | 0 | 0 |
| Five owner entries (31 claims) | 28 | 1 | 1 | 1 | 0 |
| Sweep (9 claims) | 8 | 0 | 0 | 0 | 1 (line 55) |
| **After every correction here** | all | 0 | 0 | 0 | 0 alone; lines 55, 202 and 203 are pinned and qualified next to them |

The owner-entry fabrication is internal: the skill's own lines 212–213 contradict it as worded.

## Final lists

**Apply as written:** r3-f2, r3-f6, r3-f7, r3-f8, r3-f10, sweep edit 1.

**Apply with correction:** r3-f1, r3-f3, r3-f4, r3-f5, r3-f9, using the texts above.

**Do not apply:** the critic's check item 9 replacement ("of the body it reads"). The existing claim is sourced.

**Owner entries, with corrections to their evidence:**
- **`h-deepthink-r3-paper-list-unprompted-requests`:**
  - Its title is **misattributed.** Change `'Careful adoption of agentic AI services'` to `'Careful adoption of agentic AI'`, the title on the cyber.gc.ca page. The fetch tool's answer gave that title, with the Australian cyber centre, the United States Cybersecurity and Infrastructure Security Agency and National Security Agency, and the New Zealand and United Kingdom cyber centres as co-authors.
  - The sentence about addresses is contradicted by the skill as worded. Change "no step shows the addresses to a person." to "no step shows the addresses to a person before the program requests them (a paper that is not fetched is named afterwards under Failures with the program's line, which quotes its address: SKILL.md lines 212-213, fetch-papers.cjs line 266)."
  - Add after both web quotes: "and again by round 3's validator, also through the fetch tool's answer". Both quotes were confirmed word for word.
- **`h-deepthink-r3-report-handback-tool`:** no correction. Append: "Re-read raw on 2026-10-02 by round 3's validator; the row and the sentence are word for word as quoted."
- **`h-deepthink-r3-turn-limit-relaunch`:**
  - "A partial result has no closing line" is an unsourced inference. Change it to "A result cut off at the limit ends before the closing line the brief puts last".
  - Append: "Neither page says what one turn is (the raw tools reference searched for every use of the word, and the sub-agents page asked narrowly, round 3's validator, 2026-10-02), so r3-f3 states its count as the brief's own rule. The sub-agents page adds: 'For subagents that return an agent ID, Claude Code also notes in the result that Claude can message the subagent to continue from where it stopped.'"
  - In the resume-once option's cons, after "the skill's tools line", add ", a line Claude Code does not read (h-deepthink-r1-tools-key-unread); whether the session can use SendMessage was not checked".
- **`h-deepthink-r3-index-direction-marks`:**
  - Replace "(their names, the zero width no-break space and the line and paragraph separators, believed and not read this round)" with "(the zero width no-break space, the line separator and the paragraph separator, by their names in the Unicode Standard 18.0.0, chapter 23, https://www.unicode.org/versions/Unicode18.0.0/core-spec/chapter-23/, read 2026-10-02 by round 3's validator through the fetch tool's answer; the same page gives the second variation-selector range, U+E0100 to U+E01EF, also outside the program's list)".
  - Change "corrects the skill's index sentence to what the code removes" to "corrects the skill's index sentence to what the code removes and names these characters as reaching a cell".
- **`h-deepthink-r3-researcher-file-wording`:** every claim checked out, including the pins on lines 39, 49, 58, 67, 89 and 93 and the file-name phrase on line 86 (test line 670). No correction.

## What could still be wrong

- **r3-f7.** Its "1, 2 and so on" can clash with a question number already in the project's decisions log. Nothing in the skill reconciles the two.
- **The 80 in r3-f3.** It copies the agent's pinned `maxTurns` and must change with it.
- **Quotes that came through the fetch tool's answer.** The Unicode annex, chapter 23, undici, the Open Worldwide Application Security Project entry and the cyber.gc.ca page were not read as raw text. The tools reference and the plugin manifest reference were.

Files read: `<home>/Code/ctoc/skills/deepthink/SKILL.md`, `<home>/Code/ctoc/skills/deepthink/fetch-papers.cjs`, `<home>/Code/ctoc/agents/ai-quality/deepthink-researcher.md`, `<home>/Code/ctoc/docs/DISPATCH_PROTOCOL.md`, `<home>/Code/ctoc/src/commands/start.md`, `<home>/Code/ctoc/src/lib/menu-screens.js`, `<home>/Code/ctoc/src/hooks/PreToolUse.Edit.js`, `<home>/Code/ctoc/tests/deepthink-ships-with-ctoc.test.js`, `<home>/Code/ctoc/skills/ask-me-questions/SKILL.md`, `<home>/Code/ctoc/.ctoc/audit/deepthink-improvement/skills/deepthink/SKILL.md.json`, `<home>/Code/ctoc/.ctoc/audit/deepthink-run-notes/s3-round3-critic-d-s3-r3-critic.md`, `<home>/Code/ctoc/.ctoc/audit/deepthink-run-notes/s3-round3-research-d-s3-r3-research.md`

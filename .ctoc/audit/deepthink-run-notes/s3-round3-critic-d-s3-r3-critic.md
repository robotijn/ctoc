# Round 3 critique: `skills/deepthink/SKILL.md`

**Result.** I propose ten edits to the skill and five new entries for the owner list. Six edits close branches a literal reader would take wrongly, one corrects a statement the program's own code contradicts (r3-f4), and three come from my own re-read (r3-f9, r3-f10, plus the decompression check flagged under "Claims the validator must check").

Two of the research's candidates hit pinned sentences: the extra report-handback tool and the relaunch after the turn limit. For those the edit only adds an unpinned sentence, and the contract question goes to the owner.

I read no web page this round. My grant in this dispatch is Read and Grep only. Every web claim below comes from the round 3 research report, and I mark it that way. Everything else I checked in the repository.

## Candidates 1 to 12

| # | Decision | Reason |
|---|---|---|
| 1 | Correct and accept as r3-f1, plus an owner entry. The brief-side sentence is rejected. | The code confirms the paper list is a second way out. The program checks an address only for `https` (fetch-papers.cjs:242), a user name or password (:246) and an internal host (:74–75), then sends the request (:76). The addresses arrive in the staging file and never appear in the command (SKILL.md:187–195). Line 60 lists the guards on outgoing requests and omits this path, which is misleading. The research's "no prompt covers" was changed to wording the code verifies. The brief addition is redundant: the pinned rule already covers "a web address" (line 120), and item 4 allows only an address the agent "saw on a page you opened" (line 143). |
| 2 | Correct and accept as r3-f2, plus a pinned-contract entry | "only delivers" has no source, and the classifier-review clause repeats line 60. Kept: the extra tool, its version and that the tools line does not stop it. |
| 3 | Correct and accept as r3-f3, plus a pinned-contract entry | "a fixed number of turns" gives a literal agent nothing it can act on. The number is the agent's `maxTurns: 80` (deepthink-researcher.md:17, pinned at test:644). The exact unit of a turn was not read, so the agent counts every search and fetch, which errs toward stopping early. |
| 4 | Correct and accept as r3-f4, plus an owner entry | The research's own rewrite would also be false. It says cells hold "no … variation selector", but the program's range `[0xfe00, 0xfe0f]` (:105) holds only the first sixteen. Variation selectors outside that range exist (believed: the supplement block from U+E0100). |
| 5 | Accept as r3-f5, reworded. The agent-file half is merged into an owner entry. | The agent's line 75–78 rule, "returns something other than the page" goes to Failures, combined with the documented model-call answer, puts every fetch under Failures. Its line 78 then forbids describing any source at all. |
| 6 | Accept as r3-f6, reworded | The pinned stop conditions (lines 217–218) are literally met by a refused address that holds the words, because the program prints that address quoted (:239, :243). |
| 7 | Reject | A strict last-line rule would fail a valid run whenever Claude Code puts its note to verify after the report. Where that note sits is undocumented (record, r2-f3). The brief's "nothing after it" (line 144) already defines the closing line. |
| 8 | Reject | The check exists to catch an empty or header-only brief. A header line is 93 bytes as measured in round 2. The 48-byte gap between 2,000 and 2,048 changes no verdict on any brief the check is meant to catch. |
| 9 | Accept as r3-f7, without its second clause | "the session gives each the number it presents it under" names a numbering scheme that nothing defines. |
| 10 | Correct and accept as r3-f8 | The format says "two to four sentences" (ask-me-questions:100), not "at most four". |
| 11 | Reject | Line 266 already says "nothing checks that it is the paper cited". Step 6 lists such a file as "already in the library under that file name", so no statement is false. |
| 12 | Merge into `h-deepthink-r3-researcher-file-wording` | It shares one decision with candidate 5's agent-file half: whether to align the agent file with the brief. |

The research's side remark on the agent file's line 58 (does "a web address" include paper-list addresses?) is rejected. "a web address" covers every address the agent writes, and line 58 is pinned.

## Edits to the skill

Every `old` below is verbatim, occurs once in the current file (checked by Grep), touches no pinned string, and overlaps no other `old`. The new texts pass the capital-word rule and the abbreviation grader by inspection.

```yaml
findings:
  - id: r3-f1
    kind: new
    severity: medium
    evidence: "fetch-papers.cjs:74-76, :242, :246; SKILL.md:60, :187-195"
    proposed_change:
      old: "and the brief's rule against that reduces the risk without removing it."
      new: "and the brief's rule against that reduces the risk without removing it. The paper list is a second way out: its addresses reach the fixed program in the staging file, never in its command, and the program checks an address only for `https`, for a user name or password and for an internal host, so it requests a paper's address on any public host from this machine; a steered reading agent could carry pasted text out in such an address, and the brief's rule covers those addresses too."
  - id: r3-f2
    kind: new
    severity: medium
    evidence: "https://code.claude.com/docs/en/tools-reference.md, read raw 2026-10-02 by round 3's research (the SubagentHandback row); SKILL.md:55 (pinned, untouched)"
    proposed_change:
      old: "- **The driving agent** (the session, when the user types the command)"
      new: "  In auto mode, from Claude Code 2.1.271 on, Claude Code also gives it, whatever its tools line says, one more tool, which hands its final report to the session.\n- **The driving agent** (the session, when the user types the command)"
  - id: r3-f3
    kind: new
    severity: medium
    evidence: "deepthink-researcher.md:17 (maxTurns: 80, pinned at test:644); tools-reference.md, read 2026-10-02 by round 3's research: 'When the subagent reaches the limit, Claude Code marks the returned result as partial output'; SKILL.md:100 and :240 (a result with no closing line fails the run)"
    proposed_change:
      old: ">    each source was read."
      new: ">    each source was read. Your run is stopped after 80 turns, and a result stopped there is thrown away: count every search and every fetch you make, and make none after the seventieth, so that the whole result, the paper list and the closing line are written before the limit."
  - id: r3-f4
    kind: new
    severity: high
    evidence: "fetch-papers.cjs:103-106 (the ranges), :109-116 and :154-156 (each hidden character becomes a space); https://www.unicode.org/reports/tr9/ section 2.6, read 2026-10-02 by round 3's research through the fetch tool's answer; SKILL.md:227-228"
    proposed_change:
      old: "line break, control character, zero-width character or direction mark, and escape"
      new: "control character, line feed and carriage return included, no zero-width space, non-joiner, joiner or word joiner, no direction embedding, override or isolate, none of the first sixteen variation selectors and no tag character, because the program turns each of these into a space; the left-to-right, right-to-left and Arabic letter marks are not among them and reach a cell unchanged. Cells also escape"
  - id: r3-f5
    kind: new
    severity: medium
    evidence: "deepthink-researcher.md:75-78; SKILL.md:134 (the tool answers through a separate model call)"
    proposed_change:
      old: "whenever you did not see it in the page's own text."
      new: "whenever you did not see it in the page's own text. The tool's answer about the page you asked for counts as reading that page; an error, a sign-in or consent page, or a page other than the one you asked for is a failed fetch, named under Failures."
  - id: r3-f6
    kind: new
    severity: low
    evidence: "fetch-papers.cjs:188-289 and :293 (every printed line opens with fixed words; only the last opens with 'papers in the list:'); :239 and :243 (a refused address is printed quoted); SKILL.md:217-218, :220"
    proposed_change:
      old: "only if it ended before printing `papers in the list:`."
      new: "only if it ended before printing `papers in the list:`. Here and above, the program has printed `papers in the list:` only when a line of its output begins with those words; the same words inside a quoted address do not count."
  - id: r3-f7
    kind: new
    severity: low
    evidence: "SKILL.md:125 and :149 (a source or topic with no number gives the heading 'Question none')"
    proposed_change:
      old: "The question's number: <the number, or \"none\">."
      new: "The question's number: <the number, or \"none\">. When it is \"none\", number the questions in your result 1, 2 and so on, in order."
  - id: r3-f8
    kind: new
    severity: low
    evidence: "skills/ask-me-questions/SKILL.md:100 ('One short paragraph (two to four sentences)'); SKILL.md:250-251"
    proposed_change:
      old: "and what the Evidence summary and the Failures change for the decision;"
      new: "and what the Evidence summary and the Failures change for the decision, all within the two to four sentences the decision-question format allows an explanation paragraph;"
  - id: r3-f9
    kind: new
    severity: low
    evidence: "SKILL.md:90; docs/DISPATCH_PROTOCOL.md:157-162 ('## Audit log', `.ctoc/audit/dispatches/YYYY-MM-DD/<dispatch_id>.yaml`); .ctoc/templates/CLAUDE.md.template has no dispatch-record instruction (presence check)"
    proposed_change:
      old: "record the launch as CTOC records every dispatch;"
      new: "record the launch as CTOC records every dispatch, under `.ctoc/audit/dispatches/<date>/`, as the section \"Audit log\" of CTOC's `docs/DISPATCH_PROTOCOL.md` describes;"
  - id: r3-f10
    kind: new
    severity: low
    evidence: "SKILL.md:77 (only the add command carries the node prefix; lines 86-89, 102-103 do not); src/commands/start.md:124 ('menu task fail <id> --summary \"…\"')"
    proposed_change:
      old: "The label is built from the checked slug, so it holds only letters, digits, spaces and a colon."
      new: "The label is built from the checked slug, so it holds only letters, digits, spaces and a colon. Every other `menu task` command in this file runs the same way, after the same `node \"${CLAUDE_PLUGIN_ROOT}/src/commands/start.js\"`, and `menu task fail` takes the task's id and `--summary \"<the summary>\"`, as `menu task complete` does."
```

`old` and `new` are YAML double-quoted strings, so the two leading spaces of r3-f2 survive. r3-f2 puts the auto-mode sentence after the pinned line 55 without editing it.

What each edit fixes:
- **r3-f1** stops a reader from concluding that every request leaving the machine passes a prompt.
- **r3-f2** qualifies the pinned "no other tool", which is not literally true in auto mode.
- **r3-f3** stops an agent that researches "widely and deeply" (line 132) with no limit from losing the whole run at turn 80 and then failing the relaunch the same way.
- **r3-f4** removes the claim that cells hold no direction mark or zero-width character. The left-to-right, right-to-left and Arabic letter marks are outside every range in the program's list, and so is U+FEFF.
- **r3-f5** stops a literal agent from listing every fetch under Failures and treating every source as unread.
- **r3-f6** stops a printed address from counting as the closing words, which would skip the rerun.
- **r3-f7** prevents a literal "Question none" heading.
- **r3-f8** resolves the clash between deepthink's four required items and the format's two-to-four-sentence limit.
- **r3-f9** tells the session where the dispatch record goes. Line 46 counts that record as bookkeeping, but no instruction a user's project carries says where it lives.
- **r3-f10** says how to run the other `menu task` commands, which otherwise appear without the program that runs them.

**Checked in the re-read and left unchanged:**
- The brief-folder write: the whitelist pattern `^plans/.*\.md$` (PreToolUse.Edit.js:84) matches nested folders, so line 46's "always writable" holds.
- A second run on one slug while the first is running: the scheduler's file-conflict rule queues it (task-registry.js:47), which matches lines 72 and 258.
- Line 110 leaves out the "(Tijn, 12 September 2026)" suffix on the waiting-budget heading. A reader still finds that heading by its opening words.
- Reading the file as the reading agent turned up nothing else. Its orders all fit WebSearch and WebFetch, plus the report-handback tool in auto mode.

## New entries for the owner list (append to `for-the-human.json`)

Line numbers are those of the skill as round 3 read it (fingerprint `26222c3c…7d91`).

```json
[
  {
    "id": "h-deepthink-r3-paper-list-unprompted-requests",
    "date": "2026-10-02",
    "path": "skills/deepthink/fetch-papers.cjs",
    "round": 3,
    "kind": "out-of-scope-file",
    "evidence": "The program reads every paper address from the staging file (SKILL.md lines 187-195; the command names only the staging file) and checks an address only for https (fetch-papers.cjs line 242), a user name or password (line 246) and an internal host (lines 74-75, every redirect hop included), then requests it with fetch (line 76) from the owner's machine; no step shows the addresses to a person. Round 3's r3-f1 states this in the skill. OWASP's 2026 prompt-injection entry (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM01_PromptInjection.md, read 2026-10-02 by round 3's research through the fetch tool's answer): 'Require explicit human confirmation before any privileged, irreversible, or externally visible action, surfacing the exact rendered action rather than a summary to the reviewer.' The joint guidance 'Careful adoption of agentic AI services' (https://www.cyber.gc.ca/en/guidance/careful-adoption-agentic-ai, read 2026-10-02 by round 3's research through the fetch tool's answer): 'Malicious or compromised agents could use tools as a stealthy way to exfiltrate data.' The brief already forbids putting its text into a web address (SKILL.md line 120) and allows only paper addresses the reading agent saw on a page it opened (line 143); this entry concerns a reading agent that does not obey. Not run live: no request was sent to a test host.",
    "options": [
      {
        "key": "host-allow-list",
        "label": "The program requests papers only from a fixed list of publisher hosts written in the program",
        "pros": "An address on any other host is never requested, whatever the list holds.",
        "cons": "A paper hosted elsewhere is marked not fetched; the host list needs upkeep; the program and its tests change through their own plan."
      },
      {
        "key": "owner-sees-hosts",
        "label": "Before running the program, the session shows the owner the distinct hosts in the list and runs it only on the owner's word",
        "pros": "A person sees every host before a request leaves the machine.",
        "cons": "The papers wait for the owner; the skill's run order changes; the owner sees hosts, not whether an address path carries pasted text."
      },
      {
        "key": "as-stated",
        "label": "Keep the program and the run order; the skill states the channel",
        "pros": "No program or flow change.",
        "cons": "An address on any public host is still requested with no person seeing it."
      }
    ]
  },
  {
    "id": "h-deepthink-r3-report-handback-tool",
    "date": "2026-10-02",
    "path": "tests/deepthink-ships-with-ctoc.test.js",
    "round": 3,
    "kind": "pinned-contract",
    "evidence": "The skill's line 55, pinned at the test's lines 317-318: 'The reading agent holds WebSearch and WebFetch and no other tool'. The agent's line 39, pinned at the test's line 329: 'I hold WebSearch and WebFetch and nothing else'; its description (line 3) says the same and is not pinned. The tools reference (https://code.claude.com/docs/en/tools-reference.md, read raw 2026-10-02 by round 3's research): 'Where the conditions in the SubagentHandback tools-table entry hold, Claude Code also gives the subagent that tool, even if you leave it out of tools or list it in disallowedTools', and the row: 'Delivers a subagent's final report to whichever conversation receives that subagent's result. Provided only in auto mode, to subagents that the Agent tool runs locally other than forks … Requires Claude Code v2.1.271 or later'. In auto mode the pinned words are not literally true; the row does not contradict the second half of either sentence (no file read, no write, no command, no launch). Round 3's r3-f2 adds a sentence after the skill's pinned one; the agent file is outside this slice. The test's check that the agent's tools line is exactly 'tools: WebSearch, WebFetch' (line 449) is unaffected, because the tool is not declared.",
    "options": [
      {
        "key": "amend-pins",
        "label": "Change the skill's and the agent's pinned sentences, the agent's description and the two test pins to name the report-handback tool Claude Code adds in auto mode",
        "pros": "The pinned words are true in every mode.",
        "cons": "Two pins, the agent file and its description change through their own plan; the wording then names a vendor tool that may change again."
      },
      {
        "key": "keep-pins",
        "label": "Keep the pins and the agent file; the skill carries round 3's added sentence",
        "pros": "No pin or agent-file change.",
        "cons": "The pinned words, and the agent's description of itself, stay literally false in auto mode, corrected only by the skill's next sentence."
      }
    ]
  },
  {
    "id": "h-deepthink-r3-turn-limit-relaunch",
    "date": "2026-10-02",
    "path": "skills/deepthink/SKILL.md",
    "round": 3,
    "kind": "pinned-contract",
    "evidence": "The agent's frontmatter holds maxTurns: 80 (line 17, pinned at the test's line 644). The tools reference (read raw 2026-10-02 by round 3's research): 'When the subagent reaches the limit, Claude Code marks the returned result as partial output, and Claude can resume the subagent to continue.' The sub-agents page (https://code.claude.com/docs/en/sub-agents.md, read 2026-10-02 by round 3's research through the fetch tool's answer): 'The partial marking requires Claude Code v2.1.246 or later' and 'Claude uses the SendMessage tool with the agent's ID or name as the to field to resume it.' A partial result has no closing line, so the pinned failed-run sentence (line 240, pinned at the test's lines 347-348) fails the run and relaunches it from recording, and a second failure waits for the owner. Round 3's r3-f3 tells the reading agent to make no search or fetch after the seventieth, which narrows this without removing it; the skill's 80 copies the agent's pinned value and must change with it.",
    "options": [
      {
        "key": "resume-once",
        "label": "When the result is marked partial at the turn limit, resume the same reading agent once, asking it to write the result from what it read, before counting the run failed",
        "pros": "The research already done is kept.",
        "cons": "The pinned sentence and its test change; how the record-first rule and the task's state apply to a resumed agent is not settled; the resume tool the sub-agents page names, SendMessage, is not on the skill's tools line."
      },
      {
        "key": "fresh-relaunch",
        "label": "Keep the pinned rule: a cut-off run fails and is relaunched from recording",
        "pros": "No change.",
        "cons": "A run cut off at the limit loses its research, and a relaunch that hits the same limit fails twice and waits for the owner."
      },
      {
        "key": "raise-limit",
        "label": "Raise maxTurns in the agent file and its pin, and the skill's number with it",
        "pros": "Fewer runs reach the limit.",
        "cons": "Longer runs; the agent file and its pin change through their own plan, and the skill's number with them."
      }
    ]
  },
  {
    "id": "h-deepthink-r3-index-direction-marks",
    "date": "2026-10-02",
    "path": "skills/deepthink/fetch-papers.cjs",
    "round": 3,
    "kind": "out-of-scope-file",
    "evidence": "The program's hidden-character list (lines 103-106) is 0x00-0x1f, 0x7f-0x9f, 0x200b-0x200d, 0x2060, 0x202a-0x202e, 0x2066-0x2069, 0xfe00-0xfe0f and 0xe0000-0xe007f; its comment (lines 100-101) says it covers 'direction marks and overrides'. The left-to-right mark (U+200E), the right-to-left mark (U+200F) and the Arabic letter mark (U+061C) are outside every range; Unicode Standard Annex number 9, section 2.6 (https://www.unicode.org/reports/tr9/, revision 52, read 2026-10-02 by round 3's research through the fetch tool's answer) names those three as marks, each a 'zero-width character'. Also outside every range, from the code: U+FEFF, U+2028 and U+2029 (their names, the zero width no-break space and the line and paragraph separators, believed and not read this round). Round 3's r3-f4 corrects the skill's index sentence to what the code removes; the program's comment stays false until the program changes. The test pins none of these characters.",
    "options": [
      {
        "key": "add-marks",
        "label": "Add the three marks, and optionally U+FEFF, U+2028 and U+2029, to the program's list, with a test case",
        "pros": "The program's comment becomes true and no index cell holds those characters.",
        "cons": "The program and the test change through their own plan; the skill sentence round 3 corrected must widen again."
      },
      {
        "key": "comment-only",
        "label": "Leave the list; correct the program's comment to name what it removes",
        "pros": "One comment line changes; behaviour is unchanged.",
        "cons": "The marks still reach an index cell; the program file still changes through its own plan."
      },
      {
        "key": "as-is",
        "label": "Leave the program and its comment",
        "pros": "No change.",
        "cons": "The program's comment says it removes direction marks, and it does not."
      }
    ]
  },
  {
    "id": "h-deepthink-r3-researcher-file-wording",
    "date": "2026-10-02",
    "path": "agents/ai-quality/deepthink-researcher.md",
    "round": 3,
    "kind": "out-of-scope-file",
    "evidence": "Lines 75-78 put under Failures 'a fetch that fails, times out, is blocked or returns something other than the page'. The tools reference (read raw 2026-10-02 by round 2's validator and by round 3's research) says that for most fetches 'Claude receives the result of that call rather than the raw page', so read literally every such fetch returns something other than the page, and line 78 ('I never describe a source I did not read') then reaches every source. Line 85 asks for each paper's 'https address'; the brief (SKILL.md lines 140-141) asks for the address of the paper's file itself, because that address is what the program downloads. Neither passage is pinned: the test pins lines 39, 49, 58, 67, 89 and 93 and the file-name phrase on line 86. Round 3's r3-f5 clarifies the fetch rule inside the brief; the brief already carries the file-address rule.",
    "options": [
      {
        "key": "align-agent",
        "label": "Edit the agent file's two passages to match the brief",
        "pros": "The agent's standing rules and the brief agree when either is read alone.",
        "cons": "The agent file changes through its own plan."
      },
      {
        "key": "brief-only",
        "label": "Leave the agent file; the brief, pasted into every launch, carries both rules",
        "pros": "No agent-file change.",
        "cons": "Read alone, the agent's standing rules still send every fetch to Failures and ask for any https address."
      }
    ]
  }
]
```

## Seven-language check

It does not apply. The file teaches no idiom in any programming language. Round 3 changes no recipe and adds no code example: r3-f10 only names the command prefix the session already uses at line 77. Its code is the same as before: two `node -e` recipes, the program command, the record command, one name pattern and one data shape.

## Claims the validator must check

1. **r3-f1:** the address checks at fetch-papers.cjs:242, :246 and :74–75 (redirect hops included), the request at :76, and that the staging file, not the command, carries the addresses (SKILL.md:187–195). All in the repository.
2. **r3-f2:** the tools reference's `SubagentHandback` row. The tool is given in auto mode, whatever the tools line says, from v2.1.271, and delivers the final report to the conversation that receives the result. This is web-sourced and was read by the research, not by me.
3. **r3-f3:** `maxTurns: 80` (agent:17). A subagent at its turn limit returns partial output (tools reference). A result with no closing line is not written and the run fails (SKILL.md:100, :240).
4. **r3-f4:**
   - The program's ranges (:103–106) and the turning into a space (:109–116, :154–156).
   - The character names, by code point: zero width space U+200B, zero width non-joiner U+200C, zero width joiner U+200D, word joiner U+2060.
   - Embeddings and overrides U+202A–202E, isolates U+2066–2069, variation selectors one to sixteen U+FE00–FE0F, tag characters within U+E0000–E007F.
   - The left-to-right mark U+200E, right-to-left mark U+200F and Arabic letter mark U+061C, from Unicode Standard Annex number 9, section 2.6.
5. **r3-f6:** every printed line of the program opens with fixed words, and only the final one opens with `papers in the list:` (:188–289, :293). A refused address is printed quoted (:239, :243).
6. **r3-f8:** ask-me-questions:100, "(two to four sentences)".
7. **r3-f9:** docs/DISPATCH_PROTOCOL.md:157–162, the "Audit log" section and its path.
8. **r3-f10:** start.md:124, `menu task fail <id> --summary "…"` and `menu task complete <id> --summary "…"`.
9. **An existing claim at risk for the zero-unsourceable finish:** line 205's "counted after decompression". The research did not re-verify it this round (Node's globals page and undici's `Fetch.md` did not cover it). Two primary sources to try: the Fetch Standard's handling of content codings in the network fetch, and undici's fetch implementation. If it stays unsourceable, a ready replacement:
   - old: `(104,857,600 bytes) counted after decompression.`
   - new: `(104,857,600 bytes) of the body it reads.`

   The replacement is verifiable from fetch-papers.cjs:88–92.
10. **Web quotes in the owner entries** (OWASP's 2026 prompt-injection entry, the joint guidance, the sub-agents page, Unicode Standard Annex number 9) were read by the round 3 research. Three of them came only through the fetch tool's answer, not the page's own text.

## Score of the file as round 3 read it

- Specificity 8
- Completeness 7
- Boundaries 9
- Actionability 8
- Integration 8
- Robustness 7
- Calibration 8
- Research grounding 8

Overall 7.8 (REFINE).

**What lowers it:**
- The paper-list exit is missing from the skill's own list of guards.
- The turn limit can lose a whole run.
- One index sentence is false against the code.
- The decompression claim is unverified.

**Not checked:** I ran no test, sent no live request and fetched no page.

**Files:** `<home>/Code/ctoc/skills/deepthink/SKILL.md`, `<home>/Code/ctoc/skills/deepthink/fetch-papers.cjs`, `<home>/Code/ctoc/agents/ai-quality/deepthink-researcher.md`, `<home>/Code/ctoc/.ctoc/audit/deepthink-improvement/for-the-human.json`, `<home>/Code/ctoc/docs/DISPATCH_PROTOCOL.md`

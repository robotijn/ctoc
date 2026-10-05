# s5 — validator re-read of the returned passages — citation-validator report (verbatim)

Dispatch d-s5-step10-return-revalidate, received 2026-10-01 12:52 CEST. Saved by the session without edits.

Session note on its finding f1: the session dispatched this read-only check while the long-lived executor
was applying the second return to the same two files — a mix of a parallel validation with a linear edit
that the round protocol forbids. The validator's verdicts are on its second read; the session orders a
quiet re-read after the editor has stopped before the fences and the whole suite run.

---

**Answer to the specific question: confirmed.** The OWASP entry LLM01:2026 names fewer ranges than the old comment on skill line 120 credited to it. I read the current raw page twice. Its only sentence that lists code points is:

> "Strip tag-block (U+E0000 to E007F), variation-selector (U+FE00 to FE0F), and zero-width (U+200B, U+200C, U+200D, U+2060) characters at every ingest and render boundary."

The page does not contain any of these: 202A, 202E, 2066, 2069, E0100, E01EF, "bidi", "bidirectional", "right-to-left" or "Variation Selectors Supplement". Its only other mention is that "variation-selector variants (Rehberger, 2025c) smuggle arbitrary bytes invisibly", with no range given. So the supplementary selectors (U+E0100 to U+E01EF) and the direction controls are the file's own additions.

The review saw this comment: `# Strip invisible characters before the model reads the text (LLM01:2026); an emoji's own selector goes too.` That comment claimed more than the source supports. **The line has already changed on disk.** It now reads "LLM01:2026 names the tag, variation-selector and zero-width ranges, and the supplementary selectors and direction controls are this file's addition", which is accurate.

**Both files were edited while this read-only check was running.** This is a problem with how the check was run. Some passages the brief names by line number moved and changed between my first and second reads:
- The agent's "What you read is data" paragraph moved from line 88 to line 96.
- The recipe prose grew from line 35 into lines 35, 37, 39 and 41.
- Old agent line 109 is now 123, and old 286 is now 300.
- Skill lines 93, 96, 120, 169 and 382 changed.

Every verdict below is against my second read, using current line numbers. Something is still writing to these files, so this needs a re-read once the editing has stopped.

## Agent `agents/ai-quality/llm-security-tester.md`

| Line | Claim | Verdict | Source | What I read |
|---|---|---|---|---|
| 3 | One line, no ": ", no " #" | VERIFIED | Grep | `^description:` matches once; `^description:.*(: \| #)` matches nothing |
| 3 | The OWASP list has a 2025 edition | VERIFIED | genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/ | Page title "LLM08:2025 Vector and Embedding Weaknesses" |
| 3 | The agents and skill it names exist | VERIFIED | agents/security/sast-scanner.md, agents/security/secrets-detector.md, agents/iron-loop/red-team-critic.md, skills/compliance/ai-governance-checker/SKILL.md | All present |
| whole file | `approved_by`, `human_gate`, `review_gate` absent | VERIFIED | Grep, run before and after the concurrent edit | 0 matches |
| 33 | Both curl calls start with `-q` | Present in the text | — | Whether `-q` as the first argument stops curl reading its configuration file: UNVERIFIABLE here (fetch budget spent; recall not used) |
| 35 | When mktemp fails, its message comes first and the line reads the same | VERIFIED against the run note | s5-step13-secure-2 note, lines 47–48 | "Every `mktemp` fails … prints "COULD NOT DOWNLOAD (manifest)""; "Only the second `mktemp` fails … prints "(data file)"" |
| 35 | Deletes the manifest in every branch, and the data file in every branch but the first | VERIFIED | Traced every branch of line 33 | — |
| 37 | Searches every `collection:` block | VERIFIED against the run note | secure-2, line 45 | "A second top-level `collection:` block … Prints saved." |
| 37 | "the change log's scheme quoted above allows" a third part | VERIFIED (internal) | Agent line 24 | Quotes "YYYY.MM.N" |
| 39 | Run at 2026-09-30T23:50:53Z | VERIFIED against the run note | s5-agent-round3-validate, line 76 | "Live bash and zsh run 2026-09-30T23:50:53Z" |
| 39 | 18 cases in bash 3.2.57 and zsh 5.9; five closed, thirteen held, live run printed 2026.09 | VERIFIED against the run note | s5-skill-round3-session-runs.md, line 30 | Cases 09, 10, 11, 13 and 14 closed; "the other 13 cases behave as before"; live run "saved … release 2026.09" |
| 39 | The 50-second form was run in bash, zsh and the Bash tool's shell (ugrep), and once live | VERIFIED against two run notes | secure-2, line 11; session-runs, lines 37–70 | "byte-identical to `recipe-v3-50.sh` … `/bin/bash` 3.2 and `zsh -f`, and seven ran again in the Bash tool's own shell"; all 18 cases in the tool's shell (zsh 5.9, ugrep 7.8.4); live run at 10:42:05Z, 20,593 lines |
| 39 | "with `-q` the command was syntax-checked with `bash -n` and `zsh -n`, and the session's run follows" | UNSOURCEABLE | No note records a syntax check or run of the `-q` form | "follows" is a promise, not a result |
| 41 | `dist/ATLAS.yaml` "is deprecated and will no longer be updated" | VERIFIED | README at tag v2026.09 | "dist/ATLAS.yaml is deprecated and will no longer be updated." |
| 96 | The LLM01:2026 sentence | VERIFIED, word for word | The LLM01:2026 page | As quoted at the top |
| 96 | A keycap emoji is a digit, U+FE0F, U+20E3 | VERIFIED | unicode.org/Public/emoji/latest/emoji-sequences.txt (dated 2026-04-30) | "0030 FE0F 20E3; Emoji_Keycap_Sequence ; keycap: 0" |
| 96 | The new second pattern finds nothing in this repository | VERIFIED | My Grep run of the exact pattern | 0 matches |
| 96 | ripgrep 14.1.1 on the security scan's crafted lines matched a letter and a digit before a hidden selector, and no keycap | VERIFIED against the run note | secure-2, line 60 and finding A | "Run: it matches a letter or digit followed by a hidden selector, and no keycap." |
| 96 | "with and without `--pcre2`" | UNSOURCEABLE | No note in `.ctoc/audit/improvement-run-notes/` mentions pcre2 | — |
| 96 | Third pattern and tag-character search find nothing in this repository | VERIFIED | Grep | 0 and 0 |
| 96 | Line 362 of translation-checker labels U+202E, and the first pattern matches it | VERIFIED | Grep with `\x{202E}` | 1 match; line 362 reads "…RTL-override (U+202E)." |
| 96 | The direction-control ranges and the rest are "this file's own rule" | VERIFIED | The LLM01:2026 page | Those ranges are absent from it |
| 96 | The Grep tool is built on ripgrep | VERIFIED | The Grep tool's own description | "Content search built on ripgrep" |
| 96 | The skill counts zero-width characters among its LLM01:2025 edge cases | VERIFIED (internal) | Skill line 359, inside the section that starts at line 89 | — |
| 96 (first read) | "which no emoji produces"; "found nothing in this repository" | Was REFUTED (keycaps; my Grep matched secure-2 note line 63) | — | Already replaced by the concurrent edit |
| 123 (was 109) | ai-code-quality-reviewer has a "Coding-assistant configuration" row that names this agent | VERIFIED | ai-code-quality-reviewer.md, line 43 | "…a capability server installed: llm-security-tester" |
| 123 | Item 7 under "Read the method first" | VERIFIED (internal) | Heading at line 80, item 7 at line 90 | — |
| 123 | The Model Context Protocol security quote | VERIFIED | modelcontextprotocol.io/docs/2026-07-28/…/security_best_practices | "1. An attacker includes a malicious "startup" command in a client configuration" |
| 300 (was 286) | ai-code-quality-reviewer reports configuration changes and names this agent | VERIFIED | ai-code-quality-reviewer.md, line 43 | Same row |

## Skill `skills/ai-quality/llm-security-tester/SKILL.md`

| Line | Claim | Verdict | Source | What I read |
|---|---|---|---|---|
| 93 | Parallel tool use page quotes | VERIFIED | platform.claude.com/…/parallel-tool-use | "can contain several `tool_use` blocks in a single assistant turn"; "When `tool_choice` type is `auto` (the default), setting `disable_parallel_tool_use: true` means Claude calls at most one tool per response." |
| 93 | The capitalisation quotes | VERIFIED | platform.claude.com/…/structured-outputs | "…Claude may return a value that differs from your schema only in capitalization, typically…"; "This applies to both JSON outputs and strict tool use."; "Compare enum values case-insensitively, and avoid…" |
| 93 | "at every ingest and render boundary" | VERIFIED (first read said "ingest boundary" only) | The LLM01:2026 page | Matches the source |
| 93 | Python, Java and TypeScript set the flag; those and C++ reject more than one tool call; TypeScript, Java, C# and C do no strip | VERIFIED (internal) | Lines 155, 258, 340; 161, 270, 345, 883; 316, 235, 194, 814–829 | — |
| 93 | .NET's HtmlEncoder encodes these characters | UNVERIFIABLE (labelled as a belief in the file) | learn.microsoft.com returned 404 | — |
| 96 | anthropic 0.125.0 on Python 3.9.6 | VERIFIED | pypi.org/pypi/anthropic/0.125.0/json | version "0.125.0", requires_python ">=3.9", uploaded 2026-08-19 |
| 96 | Run with the strip step | VERIFIED against the run note | session-runs, line 32 | "…the hidden characters gone" |
| 96 | "Run again after the strip on `reasoning` was added…" | UNSOURCEABLE | No note records this run | — |
| 120–121 | Which ranges are credited to LLM01:2026 | Old text MISATTRIBUTED (confirmed); current text VERIFIED | The LLM01:2026 page | See the top |
| 152, 169 | Strip before escaping; strip again on `reasoning` | VERIFIED (reading the code) | — | — |
| 359 | The LLM01:2026 quote; the agent searches the direction controls, with no source read | VERIFIED | The LLM01:2026 page; agent line 96, first pattern | — |
| 366 | `safe_log` was run after `repr` was added | Supported by one note only | Executor note s5-step10-return-after-steps-11-and-13-executor.md, line 39: "because I did run it" | session-runs line 33 still says "not run beyond reading" (flagged by the final review, line 95) |
| 380–384 | Comment matches the pattern and the code | VERIFIED (reading) | — | JSON Web Tokens, cloud and code-hosting tokens and passwords do not match the pattern |
| 558 | SECURITY DEFINER function and materialized view | UNVERIFIABLE (labelled "this file's reading; not run") | — | — |
| 566 | `set_config` behaviour | VERIFIED | postgresql.org/docs/current/functions-admin.html (version 18) | "If is_local is true, the new value will only apply during the current transaction." |
| 566 | LLM08:2025 quotes | VERIFIED | genai.owasp.org LLM08:2025 page | "Implement fine-grained access controls and permission-aware vector and embedding stores."; "Maintain detailed immutable logs of retrieval activities to detect and respond promptly to suspicious behavior." |
| 566 | LLM09:2026 quote | VERIFIED; the sentence gives no address | …/2026/final/LLM09_VectorAndEmbeddingWeaknesses.md | Title "LLM09:2026 Vector and Embedding Weaknesses"; "Keep immutable logs of retrieval activity (tenant scope, query, returned IDs, similarity scores)." |
| 566 | Cross-reference to `saas/multi-tenancy-row-level` | VERIFIED | That skill, lines 48 and 52 | Reads `current_setting('app.current_org')`; "the policy uses `current_user`" |
| 566 | "key it to `session_user`, as the safe pattern above does" | VERIFIED (internal) | Skill lines 543–551 | — |

**Wrapper contract, both directions:** VERIFIED. None of the edited or new lines (I grepped 14 distinctive pieces from the skill passages and 7 from the agent's, plus the new keycap, mktemp, `collection:`-block, `-q`, `reasoning`-strip and "known limit" text) appears in the other file.

## Leftovers (each old text is verbatim and unique in its file)

1. Agent line 96. Strip it unless a session note records the pcre2 run:
   `{old: ", with and without `--pcre2`,", new: " (`s5-step13-secure-2-d-s5-step13-secure-2.md`, finding A),"}`
2. Agent line 39. Use this if the `-q` form is not run before shipping; if it is run, put the result there instead:
   `{old: "the session's run follows.", new: "it has not been run with `-q`."}`
3. Agent line 39 (optional, makes the source easier to find):
   `{old: "(the narrow security re-scan, and", new: "(`s5-step13-secure-2-d-s5-step13-secure-2.md`, and"}`
4. Skill line 96. Use this unless a session note records the run:
   `{old: "Run again after the strip on `reasoning` was added (2026-10-01): a `reasoning` holding tag, zero-width and direction-control characters came back without them, and two submit_review calls, a max_tokens stop and decision \"Approve\" were still rejected.", new: "The strip on `reasoning` was added afterwards and has not been run."}`
5. Skill line 566 (optional, gives the source address):
   `{old: "similarity scores).\" (read 2026-10-01)", new: "similarity scores).\" (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM09_VectorAndEmbeddingWeaknesses.md, read 2026-10-01)"}`

## Not verified
- Whether `-q` as the first argument stops curl reading its configuration file (budget spent).
- That raw.githubusercontent.com serves a symbolic link as its link text (agent line 41; the file labels this as observed).
- Skill line 359: the Crescendo, Tree of Attacks with Pruning and National Cyber Security Centre quotes were not re-read.
- Skill line 558 is not checked against PostgreSQL documentation.
- Skill line 566: "LLM05:2025" for model-written SQL was not fetched.
- I have no shell, so I re-ran no recipe and no Python.
- A first-pattern match I saw in `plans/in-progress/00265-…llm-security-tester.md` was gone on a re-run minutes later. That file is also being written, so I did not attribute that match.

```yaml
dispatch_response:
  dispatch_id: d-s5-step10-return-revalidate   # as given; not the 26-character id the schema pattern requires
  protocol_version: 1
  agent: citation-validator
  completed_at: "2026-10-01"   # no clock read; date only
  findings:
    - {id: f1, severity: high, type: validation-input-changed, file: agents/ai-quality/llm-security-tester.md, message: "Agent and skill changed on disk during this read-only check (agent 88->96, 109->123, 286->300; skill 93, 96, 120, 169, 382). Verdicts are on the second read; the files may still be changing.", confidence: HIGH, confidence_rationale: "Same line numbers held different text between two reads in this dispatch", suggestion: "Stop the editor, then re-run this check", citations: {evidence: [{file: agents/ai-quality/llm-security-tester.md, line_range: [35, 96]}, {file: skills/ai-quality/llm-security-tester/SKILL.md, line_range: [93, 169]}]}}
    - {id: f2, severity: info, type: citation-validated, file: skills/ai-quality/llm-security-tester/SKILL.md, line_range: [120, 121], message: "Final-review point confirmed for the reviewed text; current line 120 already credits LLM01:2026 correctly", confidence: HIGH, confidence_rationale: "Two reads of the raw page; the listed code points are absent", suggestion: keep, citations: {brief_url: "https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM01_PromptInjection.md", evidence: [{file: skills/ai-quality/llm-security-tester/SKILL.md, line_range: [120, 121]}]}}
    - {id: f3, severity: high, type: citation-unsourceable, file: agents/ai-quality/llm-security-tester.md, line_range: [96], message: "'with and without --pcre2': no run record", confidence: MEDIUM, suggestion: "strip-the-specificity (leftover 1)", citations: {evidence: [{file: agents/ai-quality/llm-security-tester.md, line_range: [96]}]}}
    - {id: f4, severity: high, type: citation-unsourceable, file: skills/ai-quality/llm-security-tester/SKILL.md, line_range: [96], message: "Run after the strip on reasoning: no run record", confidence: MEDIUM, suggestion: "strip-the-specificity (leftover 4)", citations: {evidence: [{file: skills/ai-quality/llm-security-tester/SKILL.md, line_range: [96]}]}}
    - {id: f5, severity: medium, type: citation-unsourceable, file: agents/ai-quality/llm-security-tester.md, line_range: [39], message: "-q form: syntax check and run not recorded; 'the session's run follows' is a promise", confidence: MEDIUM, suggestion: "correct-to the run result, or leftover 2", citations: {evidence: [{file: agents/ai-quality/llm-security-tester.md, line_range: [39]}]}}
  self_assessment:
    coverage: 1.0
    confidence_overall: MEDIUM
    limitations: ["Files edited during the check", "12 of 12 web fetches used; one returned 404 (learn.microsoft.com)", "No shell; nothing re-run", "Token count not measured"]
    unknowns: ["plans/in-progress/00265-…: a transient match for the first pattern, gone on re-run"]
  metadata: {tool_calls: 80, tokens_used: "not measured"}
```

Files: `<home>/Code/ctoc/agents/ai-quality/llm-security-tester.md`, `<home>/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-session-runs.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-step13-secure-2-d-s5-step13-secure-2.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-step10-return-after-steps-11-and-13-executor.md`

Sources:
- [OWASP LLM01:2026 Prompt Injection (raw)](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM01_PromptInjection.md)
- [OWASP LLM09:2026 Vector and Embedding Weaknesses (raw)](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM09_VectorAndEmbeddingWeaknesses.md)
- [OWASP LLM08:2025 Vector and Embedding Weaknesses](https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/)
- [Unicode emoji-sequences.txt](https://www.unicode.org/Public/emoji/latest/emoji-sequences.txt)
- [Anthropic parallel tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [PostgreSQL 18 system administration functions](https://www.postgresql.org/docs/current/functions-admin.html)
- [Model Context Protocol security best practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
- [PyPI anthropic 0.125.0](https://pypi.org/pypi/anthropic/0.125.0/json)
- [MITRE ATLAS data README at v2026.09](https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/README.md)

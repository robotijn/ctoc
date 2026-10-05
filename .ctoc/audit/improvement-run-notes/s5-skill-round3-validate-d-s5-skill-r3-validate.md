<!-- saved verbatim by the session from subagent a2e64505d563bfa13 (ctoc:ai-quality:citation-validator), dispatch d-s5-skill-r3-validate, 2026-10-01 05:06 CEST -->

**Verdict: four changes need corrected text before apply, and one more is recommended. The other 82 changes, the two no-change records and both agent corrections hold.** Every `old` is verbatim and unique, and the 87 do not overlap.

The four to correct:
- **f-19:** the session has now read the parallel-tool-use builder in the Java library's source, so "not read in the source" is wrong.
- **f-35:** the page shows a second date, and the post's visible headline is not the title the skill quotes.
- **f-58:** the agent can write AML.TA0001 without a lookup, so the sentence overstates.
- **f-87:** the Formation reference line takes the same title fix as f-35.

The recommended one is **f-28**: its status line leaves out the 42-character key the re-run redacted.

## The `old` uniqueness and overlap audit

- **How I checked.** I read the skill in full (902 lines). I matched 19 of the whitespace-heavy `old` blocks byte for byte with multi-line regular expressions, each matching exactly once: f-16, f-17, f-19, f-20, f-21, f-22, f-25, f-26, f-29, f-30, f-40, f-52, f-53, f-66, f-67, f-70, f-71, f-73 and f-74 (f-74 with its exact 20-space and 44-space comment alignment). I checked the other 68 by reading.
- **Pairs on the same line, all disjoint and in top-to-bottom order:**
  - f-31 and f-32 (line 377)
  - f-42 and f-43 (line 460)
  - f-46 and f-47 (line 501)
  - f-60 and f-61 (line 654)
  - f-68 and f-69 (line 740)
- **Pairs on adjacent lines, all disjoint:**
  - f-5, f-6 and f-7 (lines 59–61)
  - f-70 and f-71 (793 and 794)
  - f-73 (832–833) and f-74 (840–849)
  - f-79, f-80 and f-81 (883–885)
  - f-85, f-86 and f-87 (899–901)
- **Near-collisions, all safe:**
  - f-9 ("…implement-tool-use, read raw…") and f-42 ("…implement-tool-use, read 2026-10-01)") differ by "raw". Line 900 has no parenthesis.
  - f-6 differs from line 861 ("every installed …").
  - f-53's first line is a substring of line 560, but its second line makes the block unique.
- **Applying in order creates no new copy of a later `old`.** I checked every `new` against every later `old`, including f-9's new text against f-42's `old`.
- **Fingerprint:** I could not recompute it (I have no shell). The `old` blocks match the file as it stands.

## Per-change verdicts

**Abbreviation edits, format only (34 rows; `old` verbatim and unique; no citation involved):**

| Change | Note |
|---|---|
| f-1 | The description. No test pins it: a search of `tests/` for the old text, title, heading, labels and "GDPR letter" found nothing, and `tests/skill-loading.test.js` only requires that the key exists (lines 33 and 262). No ": " and no " #" in the value. `when_to_load` is untouched. |
| f-2 to f-8 | Format only. f-6 does not collide with line 861. |
| f-10 | The agent never quotes "MCP server hygiene". Its own check 5 label is "Model Context Protocol server hygiene", but the copy rule compares whole lines, and line 77 is not in the agent. |
| f-11, f-12 | Format only. f-12: no anchor points at the heading. |
| f-27, f-31, f-32, f-33 | Format only. |
| f-36 | After all 87 changes, "MCP" survives only in a frontmatter keyword (line 20), inside quotations and in the name MCPTox. My search of the skill confirms it. |
| f-37, f-38, f-39, f-41, f-43, f-44, f-45 | Format only. |
| f-54 | Points at f-76's new label. Resolves. |
| f-55, f-59, f-60, f-61, f-64 | Format only. |
| f-65 | Follows f-10 and f-76. Resolves. |
| f-68 | "PoC" is kept. The agent's two quoted phrases on line 740 survive. |
| f-75, f-76, f-77 | Format only. |

**Addresses and references (12 rows):**

| Change | Verdict |
|---|---|
| f-9 | VALIDATED. I fetched the define-tools page: its front matter reads `title: Define tools`, and the table cell "`auto` with strict tool use to guarantee schema-valid tool inputs, or structured outputs when you need a response in a fixed JSON shape" is there, along with the 400 for the four models. |
| f-42 | VALIDATED. "constructs a special system prompt from the tool definitions, tool configuration, and any user-specified system prompt" is on the define-tools page word for word. |
| f-86 | VALIDATED. Every address is already cited inline. I fetched define-tools and parallel-tool-use myself. |
| f-78 to f-85 | VALIDATED as reference lines: each address is already cited inline in the skill (not re-fetched). |
| f-87 | VALIDATED, except the Formation line, which takes the title fix (Leftovers). |

**Prose and new claims (13 rows):**

| Change | Verdict |
|---|---|
| f-13 | VALIDATED.<br>• Both parallel-tool-use quotations are on the page word for word: "…can contain several `tool_use` blocks in a single assistant turn" (Execution semantics) and "When `tool_choice` type is `auto` (the default), setting `disable_parallel_tool_use: true` means Claude calls at most one tool per response" (line 853 of my fetch, which returned the page's full markdown).<br>• The enum-casing quotations rest on the session's raw read.<br>• The full `output_format` sentence rests on the round-2 re-validation (its line 74).<br>• "the EchoLeak shape, LLM02:2025" resolves. |
| f-34 | VALIDATED (the session's raw read of the transformers page). "HF" appears only inside the quotation, and "the transformers page cited above" resolves to line 384. |
| f-35 | The two quotations are VALIDATED. The date and the title need correcting (Leftovers). |
| f-46 | VALIDATED (the session's raw read of the abstract). Optional readability point: the next sentence starts "So treat…", which now follows a poisoning sentence rather than the inversion result it draws on. |
| f-47 | VALIDATED. My fetch of the arXiv HTML returns: "These results indicate that adding a small amount of Gaussian noise may be a straightforward way to defend against naive inversion attacks, although it is possible that training with noise could in theory help Vec2Text recover more accurately from ϕnoisy." That is section 6, "Defending against inversion attacks". Two routes agree: the research read the rendered page image; mine went through the summarising fetch. |
| f-50 | VALIDATED. The session's PostgreSQL 18.6 runs show 2 rows through the superuser-owned view, 1 with `security_invoker`, and the reused role name reading the old tenant's row. The CREATE VIEW quotation is word for word in the session's raw read. |
| f-51 | VALIDATED (labelled as this file's own suggestion). |
| f-56 | VALIDATED. I read lines 9001–9031 of the saved ATLAS file: `type: Incident`, `reporter: Koi Research`, `date: '2025-09-01'`. All three quotations are word for word once the YAML is unfolded, and "published legitimate versions first" is a fair paraphrase of line 9010. |
| f-57 | VALIDATED. The quotation is at lines 9036–9037, and line 9034 reads "Researchers at Invariant Labs demonstrated". `type: Exercise` lies past the range I read; the critic and the research both read it. |
| f-58 | Partly MISATTRIBUTED (Leftovers). The agent's table does hold exactly those six techniques. But AML.TA0001 is named in the agent's own section, at line 63, and that section is the source the agent's rule allows. So "writes those only after a lookup" is false for that one identifier. Checks 4, 5 and 9 and the lookup's identifier shape (line 36) are correct. |
| f-62 | VALIDATED (the session's raw read of the model card). |
| f-63 | VALIDATED (the session's raw read: `structured.ts` lines 129 and 290). |
| f-69 | VALIDATED. The skill's LLM03:2025 says "only a commit hash pins" (line 383). |

**Code and status lines (28 rows):**

| Change | Verdict |
|---|---|
| f-14 | VALIDATED against the session note's first bullet, every case and the `tool_choice` value. |
| f-15 | Comment inside the block that was run. |
| f-16, f-17 | Identical to block C1 as the session ran it. |
| f-18 | Not compiled. The claim about the other four examples is true by reading: the Python key set, the Java `keySet`, zod `.strict()`, and C++ `size()`. |
| f-19 | Contradicted by the session's raw read of `ToolChoiceAuto.kt` (line 116) and by the vendor page (line 1062 of my fetch shows the same Java call). Needs rewording (Leftovers). |
| f-20 | Comment, consistent with f-21 and f-22. |
| f-21, f-22 | Block C3, reformatted with one added comment. Not compiled. The calls are confirmed in the Kotlin source. |
| f-23 | VALIDATED (`tsc --noEmit`, strict, exit 0, per the session). |
| f-24 | Comment. |
| f-25, f-26 | Block C2 plus a trailing comment, which does not affect the type-check. |
| f-28 | True, but it under-reports the re-run (Leftovers, recommended). |
| f-29 | Block E with the widened key pattern. The re-run passes: all earlier samples still redacted, and the 42-character key with `-` and `_` now redacted. |
| f-30 | Block E's log lines, parsed by the session. |
| f-40, f-52, f-53 | Comments, this file's own reading. A comment cannot change the result of the Python parse, so the "Parsed" status lines stay true. The re-parse the critic asked for is owed but changes nothing. |
| f-48, f-49 | VALIDATED (the session's runs; the quotation from its raw read). |
| f-66 | Design record. A YAML comment is valid there. |
| f-67 | Consistent with the examples. |
| f-70 | Comment. Nothing in it closes the C comment early. |
| f-71 | Comment. "Five" follows from line 779 (`&` becomes 5 bytes). Optional wording: "five times as long". |
| f-72 | VALIDATED against the session note's third bullet. |
| f-73 | Comment. |
| f-74 | Identical to block C4: compiled and run by the session. |

**No-change records and agent corrections:**

| Item | Verdict |
|---|---|
| f-88 | VALIDATED on the critic's read of zod 4.6.5's type declarations. I did not re-read them. |
| f-89 | VALIDATED by reading. Attack A4 is escaped in every example that builds a prompt. A5's escaping order is correct (line 302). A10 is covered by "a member of no other role" (lines 528–529). A8 is closed inside f-74. |
| f-90 | `old` verbatim and unique (agent line 133). The quotation was settled in round 1: `s5-skill-round1-validate-d-s5-skill-r1-validate.md` line 41 records `snapshot_download`'s text, comma included. |
| f-91 | `old` verbatim and unique (agent line 173). "check 11" resolves. It pairs with f-69. |

## Leftovers (critic's text, then corrected text)

1. **f-19.** The critic's last sentence: `ToolChoiceAuto.builder().disableParallelToolUse(true) is as Anthropic's Parallel tool use page shows it (read 2026-10-01), not read in the source.` Corrected block:
   ```
   // Not compiled (no Java toolchain on the build machine). Most calls are confirmed in the Anthropic Java library's raw
   // Kotlin source on main, read 2026-10-01, MessageCreateParams.Builder.toolChoice(ToolChoiceAuto) and
   // ToolChoiceAuto.builder().disableParallelToolUse(true) among them; believed, not read: StopReason equality,
   // Message.content(), client.messages().create, the bad example's text().orElseThrow().text(), JsonValue.from on a Map,
   // and Guava's HtmlEscapers. Stream.toList() needs Java 16 or later.
   ```

2. **f-35.** The critic's `(Formation, "Re-Embedding Migration: Upgrade RAG Indexes Safely", 10 September 2026, a practitioner's blog post, not a standard; https://formation.dev/blog/embedding-model-upgrade-migration, read 2026-10-01)` becomes:
   `(Formation, a practitioner's blog post, not a standard, page title "Re-Embedding Migration: Upgrade RAG Indexes Safely", September 2026; https://formation.dev/blog/embedding-model-upgrade-migration, read 2026-10-01)`
   - **Why the title changes.** The quoted string is the page's HTML title ("… · Formation Blog"). Two summarising fetches give the visible headline as "Embedding Model Upgrades Are Data Migrations, Not Rollouts". The sources disagree, so I record it as a finding rather than pick one.
   - **Why the day is dropped.** My summarising fetch puts the byline at September 10, 2026, and places September 30 on a related-post card ("Runtime Authorization Guardrails for AI Agents"). The session's raw read did not settle what the 30th is.
   - If the session confirms both points raw, it may restore "10 September 2026" and cite the headline.

3. **f-87, the Formation line.** `- Formation, "Re-Embedding Migration: Upgrade RAG Indexes Safely", a practitioner's blog post: https://formation.dev/blog/embedding-model-upgrade-migration` becomes:
   `- Formation, a practitioner's blog post, page title "Re-Embedding Migration: Upgrade RAG Indexes Safely": https://formation.dev/blog/embedding-model-upgrade-migration`

4. **f-58.** `Of the identifiers in this table, the agent's own table holds AML.T0051, …, with their sub-techniques, and the tactics they achieve; it lacks the rest —` becomes:
   `Of the identifiers in this table, the agent's section "Taxonomies, identifiers and where they come from" holds AML.T0051, AML.T0053, AML.T0056, AML.T0034, AML.T0080 and AML.T0081, with their sub-techniques and the tactics they achieve, and names AML.TA0001 in the text under its table; it lacks the rest —`
   The rest of f-58 is unchanged.

5. **f-28 (recommended).** `…card numbers written with spaces or dashes and two "sk-" key shapes, left a phone number…` becomes:
   `…card numbers written with spaces or dashes, an "sk-ant-api03-" key, an "sk-" key of 40 letters and a 42-character "sk-" key holding "-" and "_", left a phone number…`

6. **Optional readability points, no citation involved:**
   - f-13: "settle the case of an `enum` value" reads as a pun. Suggest "settle the capitalisation of an `enum` value".
   - f-71: "five times longer" can be read as six times. Suggest "five times as long".
   - f-46: the following "So treat…" now follows the poisoning sentence. Either move the Zhong sentence after it, or begin the next sentence "Because an embedding can be inverted, treat…".

## Fence rules

- **The wrapper copy rule** (`tests/cu5-s4-compliance-aiquality-wrappers.test.js` lines 113–121: every trimmed skill line of 25 characters or more must be absent from the agent body). I checked every new skill line of that length by inspection: none appears in the agent. In the other direction, the new agent lines 133 (f-90) and 173 (f-91) are not substrings of the skill. Both files will share "Model Context Protocol server hygiene", but the rule compares whole lines. I did not run the test.
- **The agent's quoted skill phrases.** All 17 on round 1's list survive the 87 edits:
  - the headings "Tool Integration (2026)", "Letter schema" and "Refinement Loop — critic mode"
  - "there is no soft tier on the wire"
  - "when only the static pattern is matched" and "when a runtime PoC has fired"
  - the LLM02, LLM04 and LLM09 sections
  - the multi-turn, markdown-image, tool-poisoning and embedding-inversion cases
  - zero-width characters among the LLM01:2025 edge cases
  - "covers a subset" and "deeper layer"
  - the Discovery row

  The agent quotes neither "MCP server hygiene" nor "MCP servers" as a label. Its own `description` is unaffected.
- **No gate number** appears anywhere in the new text.
- **Abbreviations in new prose** appear only inside quotations, identifiers, code, names and the frontmatter keyword list.
- **No invented statistic.** Every number traces to a session run or to the code itself (the factor of five).
- **Internal cross-references all resolve:**
  - "Recent CVEs and incidents" (f-58)
  - "the comment under the safe pattern" (f-48, f-50, pointing at f-49)
  - "check 11" (f-91)
  - "the EchoLeak shape, LLM02:2025" (f-13)
  - "LLM02:2025, logging" (f-63)
  - "The transformers page cited above" (f-34)
  - the renamed labels (f-54 and f-65 pointing at f-10 and f-76)

  "Multimodal" and "Agentic applications" appear only in existing text, and both still resolve; f-75 leaves the "Multimodal" label intact.

## What I did not check

- I did not recompute the sha256 fingerprint (no shell) and did not run any test or any of the agent's 36 fences.
- I did not re-read the enum-casing sentences, CREATE VIEW, Zhong's abstract, the Llama Guard card, `structured.ts`, the Kotlin sources, zod's types, or the CS0054 `type` line. For those I relied on the session's raw reads and the critic's local reads.
- My Formation reads (headline, dates) and my Morris read both went through the summarising fetch. The define-tools and parallel-tool-use pages came back as their full markdown.

## Sources

- [Parallel tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)
- [Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
- [Morris and others, arXiv HTML](https://arxiv.org/html/2310.06816)
- [Formation blog post](https://formation.dev/blog/embedding-model-upgrade-migration)
- Local files:
  - `<home>/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md`
  - `<home>/Code/ctoc/agents/ai-quality/llm-security-tester.md`
  - `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-critic-d-s5-skill-r3-critic.md`
  - `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-research-d-s5-skill-r3-research.md`
  - `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-session-runs.md`
  - `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round1-revalidate-d-s5-skill-r1-revalidate.md`
  - `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round1-validate-d-s5-skill-r1-validate.md`
  - `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round2-revalidate-d-s5-skill-r2-revalidate.md`
  - `<home>/Code/ctoc/tests/cu5-s4-compliance-aiquality-wrappers.test.js`
  - `<home>/Code/ctoc/tests/skill-loading.test.js`
  - `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/ATLAS-2026.09.yaml` (lines 9001–9048)

```yaml
dispatch_id: d-s5-skill-r3-validate
mode: read-only
budget: {fetches_used: 5, fetches_cap: 20, tool_calls_used: 26, tool_calls_cap: 35}
olds: {checked: 89, verbatim_unique: 89, regex_byte_checked: 19, pairwise_disjoint: true, same_line_pairs_checked: [f31-f32, f42-f43, f46-f47, f60-f61, f68-f69]}
fingerprint_recomputed: false
skill_changes: {total: 87, validated_or_format_only: 83, correct_before_apply: 3, recommended: 1}
correct_before_apply: [f-19, f-35, f-58]          # plus f-87's Formation line, which pairs with f-35
recommended: [f-28]
optional_readability: [f-13, f-46, f-71]
records_no_change: {f-88: validated, f-89: validated}
agent_corrections: {f-90: validated, f-91: validated}
findings:
  - {type: citation-fabricated, severity: critical, claim: "f-19: disableParallelToolUse 'not read in the source'", suggestion: "correct-to: confirmed in ToolChoiceAuto.kt line 116 (session raw read)"}
  - {type: citation-misattributed, severity: high, claim: "f-35/f-87: Formation title quoted as the post's title; it is the HTML title, and the visible headline differs (summarising fetch)", suggestion: "correct-to: page title wording"}
  - {type: citation-unsourceable, severity: high, claim: "f-35: day '10 September 2026' (page also shows 30 September)", suggestion: "strip-the-specificity: September 2026"}
  - {type: citation-misattributed, severity: high, claim: "f-58: the agent writes AML.TA0001 only after a lookup", suggestion: "correct-to: its section names AML.TA0001 (agent line 63)"}
  - {type: info, severity: info, claim: "f-28 under-reports the re-run (42-character key)", suggestion: "recommended wording"}
quotations_newly_validated: [parallel-tool-use x2 (full markdown), define-tools x2 (full markdown), morris-section-6 fragment (summarising fetch + research's page image), ATLAS CS0053 type/date/reporter (local raw)]
agent_quoted_phrases: {checked: 17, survive: 17}
copy_rule: {direction_skill_to_agent: pass_by_inspection, direction_agent_to_skill: pass_by_inspection, test_run: false}
description_pinned_by_test: false
gate_numbers_in_new_text: 0
invented_statistics: 0
```

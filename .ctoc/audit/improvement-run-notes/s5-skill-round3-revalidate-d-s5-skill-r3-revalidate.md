<!-- saved verbatim by the session from subagent aba270c7285b7802c (ctoc:ai-quality:citation-validator), dispatch d-s5-skill-r3-revalidate, 2026-10-01 05:20 CEST -->

**READY for Step 11, Step 13 and Step 16.** All 87 round-3 changes, the executor's choices for the leftovers, the three readability edits and both agent corrections are in the files exactly as reported. I found no deviation. Nothing was refuted or misattributed. What remains is tiny: one abbreviation in prose ("AI governance", skill line 53), one optional acronym in brackets, two small notes on accuracy, and contradiction 51 (the effort level), which is yours to decide. I edited nothing.

## Deviations from what the executor reported

| Item | Required by | In the file | Verdict |
|---|---|---|---|
| f-1 to f-87 | Round-3 critic note | Each new text is present at its place (description line 3 through References line 949) | Landed |
| f-19, Java status line | The validator's corrected block | Lines 207–211, word for word | Landed |
| f-35 and f-87, Formation | Last section of the round-3 session runs | Line 405 and line 949 give the headline, then the page title, then "10 September 2026" | Landed |
| f-58 | The validator's correction | Line 676 names the agent's section and AML.TA0001 | Landed |
| f-28 | The 42-character key | Line 364 | Landed |
| Readability edits | The validator's optional points | "capitalisation" (line 93), "five times as long" (line 830), "Because an embedding can be inverted, treat…" (line 521) | Landed |
| f-90 and f-91 (agent) | Critic's agent corrections | Agent line 133 and line 173 | Landed |

**Deviations: none.**

## Markers ("this file's reading", "no source read for this file" and similar): 22 markers in 23 places

| Line | What it marks | Still needed? |
|---|---|---|
| 73 | A schema limits the shape of the answer, not the decision | Yes |
| 75 | Run a container only inside another isolation layer | Yes (draws on two sources) |
| 81 | No source on whether Datadog's application performance monitoring, Sentry, Helicone or Arize log prompts by default | Yes. The 2026 entry covers only Datadog's language-model observability product, LangSmith and Langfuse |
| 87 | No source says the 2026 entry 8 replaces System Prompt Leakage | Yes (the agent has the same marker) |
| 93 | Refusing an enum value rather than normalising it is this file's choice | Yes |
| 93 | Passing every check proves the shape only | Yes. It repeats line 73 and could point there |
| 355 | The fetch-and-run payload is an illustration | Yes |
| 357 | Direction-control characters have no source | Yes |
| 357 | Fresh-context scoring and an alarm on weakening refusals are suggestions | Yes |
| 361 | Allowed domains that proxy or redirect | Partly covered: the paper's quotation backs the proxy half; "or redirects" is the file's own reading |
| 404 | Hugging Face kernel references are a lead | Yes |
| 431 | The canary limit is fixed before the run | Yes |
| 432 | The imperative-phrase heuristic | Yes |
| 521 | Poisoned passages that hold no instruction slip past a scan for instructions | Yes |
| 521 | The three defences | Partly covered: the third is supported by line 562 ("permission-aware vector and embedding stores") and by the 2026 entry 2 ("embeddings-only backup"); the first two remain the file's own |
| 521 | Rotating the embedding model does not help | Yes (an inference from the 2026 entry 9) |
| 521 | No source on training a model to resist inversion | Yes |
| 568 | Confidence floor | Yes |
| 627 | Which part of the file covers each agentic entry | Yes |
| 690 | LangChain's `partial=True` returns `None`, so treat `None` as a rejection | Yes |
| 699 | Which part of the file serves each of the agent's checks | Yes |
| 782 | No C or C++ vendor library was looked for | Yes |

No marker is now fully covered by a source already in the file.

## Status lines (15 code blocks, compared with the session-run notes from all three rounds)

| Line | Block | Status line says | Backed by | Accurate? |
|---|---|---|---|---|
| 96 | Python, prompt injection | Run with a stubbed client, plus an earlier run on five bad replies | Round 3 first bullet; round 1 section 5 | Yes |
| 171 | C#, prompt injection | Not compiled; names checked; not read whether extra or duplicate keys are rejected | Round 1 section 5 | Yes |
| 207 | Java | Not compiled; calls confirmed in the Kotlin source | Round 1 sections 5–6; round 3 (`ToolChoiceAuto.kt` line 116) | Yes |
| 288 | TypeScript | Type-checked twice | Round 1 section 5; round 3 | Yes |
| 364 | Python, sensitive data | Parsed; the redaction pattern and `safe_log` run | Round 3 sample bullet and re-run | Yes |
| 410 | Python, supply chain | Parsed | Round 2 | Yes |
| 441 | Python, output handling | Parsed | Round 1 section 7 (round 3 added comments only) | Yes |
| 461 | C#, output handling | Not compiled | — | Yes |
| 483 | Python, excessive agency | Parsed | Round 1 section 7 | Yes |
| 505 | Python, system prompt | Parsed | Round 1 section 7 | Yes |
| 525 | SQL | "The two policies were tested"; the pgvector column not run; view and role-name cases run | Round 1 sections 4 and 6; round 3 | Yes, with one note (below) |
| 577 | Python, consumption | Parsed | Round 1 section 7 (round 3 added comments only) | Yes |
| 724 | Letter schema (YAML) | Design record, not run | — | Yes |
| 788 | C | Compiled and run on a hostile description | Round 1 section 5 | Yes for the code. The two comments added in round 3 were not recompiled; they are comments only |
| 855 | C++ | Compiled and run, then compiled and run again | Round 1 section 5; round 3 | Yes |

The note on line 525: round 1 ran the setting-keyed policy on a `text` column with no `::uuid` cast. The policy in the file has the cast. The mechanism that was shown to fail is the same, so the claim stands; the wording is a little broader than the run.

## Cross-references

Every internal cross-reference resolves:
- **Named parts of the skill:** "Severity, output, and the agent's checks", "Provider-specific shapes", "Tool Integration (2026)", "Coding-agent config files", "Multimodal", "Agent-to-agent", "Agentic applications", "MITRE ATLAS mapping", the incident table, "the comment under the safe pattern", "the transformers page cited above".
- **The 14 labels in the check-mapping table.**
- **Sections of the agent:** "Read the method first" item 1, "Output Format (MANDATORY)", "Severity and confidence", "Blocking Rules", "Order of findings in the report", "Taxonomies, identifiers and where they come from", and AML.TA0001 at agent line 63.
- **Other files:**
  - The sast-scanner skill's section 11 is supply chain (its line 369), and its section 12 is at line 377, as the skill says.
  - `docs/REFINEMENT_LOOP.md` line 8 says the loop is "NOT RUNNING" today.
  - `skills/agent-fragments/warnings-are-critical.md` and `.ctoc/architecture/refinement-loop-schema.json` both exist.
  - Both quotations from `CLAUDE.md` match it.
  - The multi-tenancy skill's line 52 matches what this skill says about it.

One thing outside these two files: the multi-tenancy skill keys its one-role-per-tenant policy on `current_user`. This skill's line 540 says `SET ROLE` changes `current_user` but not `session_user`. So "keys the policy to the role" (line 562) is true, but it hides a weaker variant.

## Web spot-checks (all through the fetch tool, which summarises; none is a raw read)

| Quotation | Source | Verdict |
|---|---|---|
| gVisor "provides a strong layer of isolation between running applications and the host operating system" | gvisor.dev/docs | Validated, word for word |
| Morris and others: "…able to recover 92% of 32-token text inputs exactly"; title and four authors | arxiv.org/abs/2310.06816 | Validated. The first read stopped at "able to recover"; a second prompt on the same cached page returned "$92\%$ of $32\text{-token}$ text inputs exactly." That is one fetch, not two independent ones |
| National Cyber Security Centre: the "deterministic (non-LLM) safeguards…" sentence, title, and the date 8 December 2025 | ncsc.gov.uk | Validated |
| Nasr and others: the "150x" sentence (the skill quotes part of it), first version 28 November 2023 | arxiv.org/abs/2311.17035 | Validated |
| MCPTox: "malicious instructions are embedded within a tool's metadata without execution", Wang first author, 19 August 2025 | arxiv.org/abs/2508.14925 | Validated |
| Zero2Text: "standard defenses, such as differential privacy, fail to effectively mitigate this adaptive threat", Kim first author | arxiv.org/abs/2602.01757 | Validated |
| WebAssembly: "Each WebAssembly module executes within a sandboxed environment…" | webassembly.org/docs/security | Validated |

One fetch failed: `https://export.arxiv.org/api/query?id_list=2310.06816` returned "The server returned HTTP 429 Too Many Requests." The Morris check was finished through arxiv.org/abs instead.

## Contract checks

| Check | Result |
|---|---|
| `type: skill` | Yes (line 4) |
| No `allowed-tools:` | Yes |
| `effort_level: high` | Yes |
| `when_to_load` | 16 entries; not compared against git |
| `related_skills` | 9 entries, matching round 1's change 1 |
| Gate numbers | None (search returned no match) |
| The agent's 17 quoted phrases | All present: the three headings (678, 719, 903), "there is no soft tier on the wire" (697), the two confidence phrases (774), the sections for sensitive data, poisoning and misinformation (359, 427, 564), the multi-turn, markdown-image, tool-poisoning and embedding-inversion cases (357, 397, 480, 521), zero-width characters (357), "covers a subset" and "deeper layer" (83), the Discovery row (668) |
| Renamed labels | The agent quotes neither old label. Lines 632 and 707 use the new ones |
| Duplicate addresses in References | None |
| Invented statistics | None. Every number traces to a quotation, a session run, or the code itself |

## Readability

- **Skill:** no paragraph is over 2,500 characters. Line 521 is the only one over 2,200; measured with a length search, not counted exactly.
- **Agent:** two lines are over 2,500 characters. By my reading they are lines 35 and 88; I did not confirm the line numbers.

## Contradictions between the agent and the skill

- **51 (still open, for you):** the skill says `effort_level: high`; the agent says `effort: xhigh`.
- **No new contradictions**, so nothing is numbered from 60.

## Seven-language rule

The rule is met: every language has a bad example and a safe one.

| Language | Examples | Status |
|---|---|---|
| C# | Prompt injection; output handling | Not compiled (no .NET on the machine) |
| Java | Prompt injection | Not compiled; calls confirmed in the Kotlin source |
| Python | Seven sections | Prompt injection run with a stub; the redaction pattern and `safe_log` run; the rest parsed only |
| C | Request body built with `snprintf` (bad) and with cJSON (safe) | Compiled and run |
| C++ | Model text handed to a shell (bad) and `parse_review` (safe) | Compiled and run, twice |
| TypeScript | `reviewPrBad` and `reviewPr` | Type-checked, not run |
| SQL | Bad, not enough, and safe | Policies run on PostgreSQL 18.6; the pgvector column and the `<->` query not run |

## Leftovers (exact old text, then new text)

1. **Line 53:** `- AI governance / risk register /` → `- Governance of artificial intelligence / risk register /`
2. **Line 357:** `Tree of Attacks with Pruning (TAP) "utilizes` → `Tree of Attacks with Pruning "utilizes`. The acronym is never used again.
3. **Optional, line 686:** `Static Analysis Results Interchange Format (SARIF)` → `Static Analysis Results Interchange Format`. Keeping it is defensible, because the command's option value is `sarif`.
4. **Optional, line 525:** `The two policies were tested` → `The setting-keyed policy (run on a text column, without the uuid cast) and the safe policy were tested`

Kept by earlier decisions, not leftovers: the "Coding-agent config files" label (lines 477, 707, 901), "PoC" (line 774), the titles in the References list, technical names (API, JSON, HTTP, URL, SQL, HTML, CVE, CWE, YAML, ETag), and ATLAS and product names.

## What I did not check

- I did not recompute either sha256 fingerprint; I have no shell.
- I ran no test: not the copy fence, not the 36 agent fences, not the full gate.
- I did not compare `when_to_load` against git.
- I did not re-read the Kotlin sources, the PostgreSQL runs or zod's types; I relied on the session notes.
- Every web read went through the summarising fetch tool.
- I did not check that every address cited in the text also appears in References; I only checked for duplicates.
- I did not confirm the line numbers of the agent's two long lines.

## Sources

- https://gvisor.dev/docs/
- https://arxiv.org/abs/2310.06816
- https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection
- https://arxiv.org/abs/2311.17035
- https://arxiv.org/abs/2508.14925
- https://arxiv.org/abs/2602.01757
- https://webassembly.org/docs/security/
- https://export.arxiv.org/api/query?id_list=2310.06816 (HTTP 429)

Local files:
- `<home>/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md`
- `<home>/Code/ctoc/agents/ai-quality/llm-security-tester.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-critic-d-s5-skill-r3-critic.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-validate-d-s5-skill-r3-validate.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round1-session-runs.md`, `s5-skill-round2-session-runs.md`, `s5-skill-round3-session-runs.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round1-critic-d-s5-skill-r1-critic.md`
- `<home>/Code/ctoc/skills/security/sast-scanner/SKILL.md`
- `<home>/Code/ctoc/skills/saas/multi-tenancy-row-level/SKILL.md`
- `<home>/Code/ctoc/docs/REFINEMENT_LOOP.md`
- `<home>/Code/ctoc/skills/agent-fragments/warnings-are-critical.md`
- `<home>/Code/ctoc/.ctoc/architecture/refinement-loop-schema.json`

```yaml
dispatch_id: d-s5-skill-r3-revalidate
mode: read-only
budget: {fetches_used: 9, fetches_cap: 15, tool_calls_used: 32, tool_calls_cap: 34}
fingerprint_recomputed: false
round3_changes: {expected: 87, landed: 87, deviations: 0}
agent_corrections: {expected: 2, landed: 2}
executor_choices_confirmed: [f-19, f-35, f-87, f-58, f-28, readability-f-13, readability-f-71, readability-f-46]
counts: {examined: 54, validated: 54, refuted: 0, misattributed: 0, unverifiable: 0}
# 54 = 7 web quotations + 15 references to other files or sections + 15 status lines + 17 quoted phrases
markers: {total: 22, needed: 22, fully_covered_by_a_source_in_the_file: 0, partly_covered: 2}
status_lines: {blocks: 15, accurate: 15, notes: 2}
gate_numbers: 0
abbreviation_leftovers: {must: 1, optional: 2}
invented_statistics: 0
references_duplicate_addresses: 0
contradictions_open: [51]
contradictions_new: 0
readability: {skill_lines_over_2500: 0, skill_lines_over_2200: 1, agent_lines_over_2500: 2}
seven_language_rule: met
findings:
  - {type: info, severity: info, claim: "line 53 'AI governance' is an abbreviation in prose", suggestion: "correct-to 'Governance of artificial intelligence'"}
  - {type: info, severity: info, claim: "line 357 '(TAP)' is defined and never used", suggestion: "remove it"}
  - {type: info, severity: info, claim: "line 525 'The two policies were tested': the first was run on a text column without the uuid cast", suggestion: "optional wording in Leftovers item 4"}
  - {type: info, severity: info, claim: "line 562: the sibling skill keys its one-role-per-tenant policy on current_user, which SET ROLE moves", suggestion: "a note for the multi-tenancy skill; outside this slice"}
  - {type: fetch-failed, severity: info, url: "https://export.arxiv.org/api/query?id_list=2310.06816", error: "The server returned HTTP 429 Too Many Requests.", resolved_by: "https://arxiv.org/abs/2310.06816"}
verdict: READY for Step 11 / 13 / 16
```

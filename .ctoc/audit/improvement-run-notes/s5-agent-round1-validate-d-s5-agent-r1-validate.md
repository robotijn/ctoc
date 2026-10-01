<!-- saved verbatim by the session from subagent a7e20b99fb404a79e (ctoc:ai-quality:citation-validator), dispatch d-s5-agent-r1-validate, 2026-10-01 00:37 CEST -->

**Result.** I found nothing refuted, misattributed or unverifiable in the new text of the 23 changes. Every read date matches the notes. All 23 `old` strings match the agent file exactly, each appears once, and no two overlap. Eight passages still need exact corrections before the edit, and a ninth is optional:
- two quotations are not verbatim: the unbounded-consumption sentence is cut short, and the Model Context Protocol Top 10 entry names are not written as the page writes them;
- one Model Context Protocol requirement is quoted without its condition;
- one claim about category numbers is overstated;
- a coverage number contradicts its own comment;
- the response template does not conform to the machine schema;
- two instruction details need tightening: the NeMo Guardrails wording and the sub-technique lookup.

I could not recompute the file's fingerprint.

## Per change: claim, verdict, source sentence

| Change | Claim | Verdict | Source sentence as read |
|---|---|---|---|
| 1 | Dispatch phrases copied from the skill's `when_to_load` | VERIFIED | Skill lines 6–21 list all eleven phrases used ("prompt injection" … "agentic AI security", "OWASP LLM") |
| 2 | Open Worldwide Application Security Project (OWASP) | VERIFIED | "The Open Worldwide Application Security Project (OWASP) is a 501(c)(3) nonprofit foundation…" (owasp.org/about; no read date to check, the critic gave no address) |
| 2 | LLM07:2025 quotation | VERIFIED | "It's important to understand that the system prompt should not be considered a secret, nor should it be used as a security control." |
| 2 | The 2026 edition has no System Prompt Leakage entry; LLM08:2026 is Hidden Context Exposure | VERIFIED | The README lists LLM01:2026 to LLM10:2026, with the eighth as "LLM08:2026 Hidden Context Exposure" |
| 2 | Hidden Context Exposure quotation, and that no source says "replaces" | VERIFIED | "In an LLM application, hidden context typically includes the system prompt, developer instructions, retrieved policy text (from RAG knowledge bases, …" No line contains "replaces", "succeeds", "renames" or "LLM07". |
| 3 | The skill pins "release 5.6.0" and 84 techniques | VERIFIED | Skill line 494: "MITRE ATLAS (release 5.6.0, mid-2026) catalogs 16 tactics, 84 techniques…" |
| 3 | Counts for release v2026.09 | VERIFIED | "This version of ATLAS data contains 1 matrix, 16 tactics, 120 techniques, 88 sub-techniques, 40 mitigations, and 73 case studies." (15 September 2026) |
| 3 | 101 techniques at v2026.07 and 114 at v2026.08 | VERIFIED | "…16 tactics, 101 techniques…" (7 August 2026); "…16 tactics, 114 techniques…" (1 September 2026) |
| 3 | `version: 5.6.0` at the v2026.09 tag; the lookup command answers | VERIFIED (session's raw read, not refetched) | The session's raw read, 2026-10-01. The command ran once: "saved …" then `2026-09-30T22:27:05Z` |
| 3 | The ATLAS table: six techniques, sub-techniques and tactics | VERIFIED (session's raw read) | Every name, sub-technique and tactic matches the session's raw reads line by line |
| 3 | The skill's table puts Prompt Injection under Initial Access and Extract System Prompt under Credential Access | VERIFIED | Skill lines 504 and 510 |
| 3 | Identifiers written with their edition, `LLM01:2025` | VERIFIED | The page lists "LLM01:2025 Prompt Injection" and all ten entries with ":2025" |
| 3 | 2026 edition "published August 2026" | VERIFIED | The resource page says "August 3, 2026"; the README says "August 4, 2026" |
| 3 | The 2026 list of ten | VERIFIED | The README's ten entries match character for character |
| 3 | Agentic Applications Top 10 published 9 December 2025 | VERIFIED | "December 9, 2025" |
| 3 | Model Context Protocol Top 10 is in beta | VERIFIED | "Phase 3 – Beta Release and Pilot Testing - We are here right now" |
| 3 | National Institute of Standards and Technology AI 100-2 E2025 title and March 2025 | VERIFIED | "Adversarial Machine Learning: A Taxonomy and Terminology of Attacks and Mitigations", March 2025 |
| 3 | AI 600-1 belongs to the ai-governance-checker skill | VERIFIED (repository) | `skills/compliance/ai-governance-checker/SKILL.md:55`: "…the **NIST AI 600-1 Generative AI Profile**" |
| 3 | Step 2 of the lookup | Needs correction (Leftover 9) | Session: "sub-technique entries carry no tactics line of their own"; it anchored the search with `'id: AML.T0051$'` |
| 4 | The skill's commands, proof-of-concept request, letter headings and three impossible orders | VERIFIED | Skill 521–555, 609–611, 559 ("there is no soft tier on the wire"), 568, 644, 632, 636, 640 |
| 4 | "They send requests to a live system" | Needs correction (Leftover 8) | Skill line 553: "NeMo Guardrails — runtime policy enforcement (not a scanner; ships as a Python lib)". The command starts a server. |
| 4 | Refinement loop not running | VERIFIED | `docs/REFINEMENT_LOOP.md:8`: "the loop is **NOT RUNNING** today" |
| 5 | The three quoted conditions and the step labels | VERIFIED | cto-chief.md lines 334, 345, 457, 476; ivv-chief.md lines 80 and 94, all word for word |
| 5 | No other dispatcher | VERIFIED (presence check only) | The name appears in `agents/` only at those three lines, a count table (cto-chief.md:189) and other agents' reuse tables. It does not appear in `src/` or the operations registry. |
| 6 | ai-code-quality-reviewer's configuration row and hand-off | VERIFIED | Line 43: "What the change lets the assistant do — a tool added to an agent, a capability server installed: llm-security-tester" |
| 6 | Model Context Protocol "startup" quotation | VERIFIED | "An attacker includes a malicious "startup" command in a client configuration". The single quotes in the new text are the usual nested-quote convention. |
| 6 | CVE-2025-53773 wording, settings key and file | VERIFIED | "it can create and write to files in the workspace without user approval."; "in the `.vscode/settings.json` file one can add the following line: `"chat.tools.autoApprove": true`" |
| 6 | Microsoft assigned it, its description, and the score 7.8 in both places | VERIFIED | Record: "…in GitHub Copilot and Visual Studio allows an unauthorized attacker to execute code locally.", assigner microsoft, 7.8. Security Update Guide interface: "baseScore": "7.8" (Visual Studio 2022 17.14 row) |
| 7 | Both LLM01:2025 quotations | VERIFIED | "…it is unclear if there are fool-proof methods of prevention for prompt injection."; "…research shows that they do not fully mitigate prompt injection vulnerabilities." |
| 8 | LLM05:2025 quotations and the three controls | VERIFIED | "…can result in XSS and CSRF in web browsers as well as SSRF, privilege escalation, or remote code execution on backend systems."; "Treat the model as any other user, adopting a zero-trust approach…"; context-aware output encoding, parameterized queries and Content Security Policies are all present |
| 9 | LLM06:2025 root causes and the "user's context" mitigation | VERIFIED | "The root cause of Excessive Agency is typically one or more of: excessive functionality; excessive permissions; excessive autonomy."; heading "Execute extensions in user's context" |
| 9 | The agentic-applications trust quotation (ASI09) | VERIFIED | "Confident, polished explanations misled human operators into approving harmful actions (ASI09 – Human-Agent Trust Exploitation)", with an en dash (read twice) |
| 9 | "Show the exact command…" | VERIFIED | "Show the exact command that will be executed, without truncation (include arguments and parameters)" |
| 10 | Token passthrough and wildcard-scope quotations | VERIFIED | "MCP servers **MUST NOT** accept any tokens that were not explicitly issued for the MCP server."; "Using wildcard or omnibus scopes (`*`, `all`, `full-access`)" |
| 10 | Confused deputy (the critic's reading of the heading) | VERIFIED as a heading; the reading fits the text | I read the section today. Leftover 4 is optional. |
| 10 | Consent quotation | Words verbatim, condition dropped (Leftover 3) | "If an MCP client supports one-click local MCP server configuration, it **MUST** implement proper consent mechanisms prior to executing commands." |
| 10 | Top 10 entries MCP01, MCP08 and MCP09 | Entries are real; the quoted form is not verbatim (Leftover 2) | List: "MCP01:2025 - …", "MCP08:2025 - …", "MCP09:2025 - …". Table: "MCP09 - Shadow MCP Servers" |
| 11 | LLM08:2025 quotations; the skill's embedding-inversion case | VERIFIED | "Implement fine-grained access controls and permission-aware vector and embedding stores."; "Maintain detailed immutable logs of retrieval activities to detect…"; skill line 410 |
| 12 | "Complete mediation" | VERIFIED | Under heading 7, "Complete mediation": "Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed or not." |
| 13 | LLM10:2025 cost quotation | Words verbatim, sentence cut short with an added full stop (Leftover 1) | "…leading to unsustainable financial burdens on the provider and risking financial ruin." (the OWASP page and the raw source file agree) |
| 13 | "Limit Exposure of Logits and Logprobs" | VERIFIED | Heading present |
| 14 | The ten agentic headings | VERIFIED | Contents page of the document, read today from the saved PDF: "ASI01: Agent Goal Hijack" … "ASI05: Unexpected Code Execution (RCE)", "ASI06: Memory & Context Poisoning" … "ASI10: Rogue Agents". Entry headings read directly: ASI03 (document page 15) and ASI06 (page 24, which also writes "&"). ASI02's entry heading rests on the gaps report. |
| 14 | "the agentic evolution of Excessive Agency (LLM06:2025)" | VERIFIED | Page 15: "Identity & Privilege Abuse is the agentic evolution of Excessive Agency (LLM06:2025)." |
| 15 | CTO Chief's text dispatches sast-scanner always at the secure step | VERIFIED | cto-chief.md:464: "`security/sast-scanner` ALWAYS" |
| 15 | "OWASP LLM Top 10 v1.1, 2024" is the 2023–24 edition | VERIFIED | sast-scanner SKILL.md:377. OWASP titles it "Top 10 for LLMs and Gen AI Apps 2023-24", and its ten entries match sast-scanner line 421 |
| 15 | "where the same number names a different category" | Overstated (Leftover 5) | 2023-24 list: "LLM01: Prompt Injection", the same as LLM01:2025 |
| 18 | security-scanner reads the output files of the analyzers it lists; this agent is not among them | VERIFIED | security-scanner.md lines 35–46 |
| 18 | No ai-governance-checker agent file; the skill is named at the same two steps | VERIFIED | Presence check found no file; cto-chief.md lines 341 and 475 |
| 18 | red-team-critic quotation | VERIFIED | Line 3: "Adversarial red-team lens for a plan…" |
| 19 | Protocol fields, five severity levels, `coverage` as a fraction from 0.0 to 1.0, `confidence_overall`, `metadata.tokens_used` and `tool_calls` | VERIFIED against `docs/DISPATCH_PROTOCOL.md` | Line 97 "critical \| high \| medium \| low \| info"; line 147 "`self_assessment.coverage` — 0.0-1.0"; line 149 "`metadata.tokens_used`, `metadata.tool_calls`" |
| 19 | The template against the machine schema | The two sources disagree (Leftover 7) | `.ctoc/architecture/dispatch-schema.yaml:88` requires `agent_version` and `completed_at`; line 134 says `tokens_used: { type: integer, minimum: 0 }` |
| 19 | The skill's confidence rule | VERIFIED | Skill 617: "`confidence: high` when a runtime PoC has fired and `confidence: medium` when only the static pattern is matched" |
| 19 | `coverage: 0.92` for "11 of 12", "never rounded up" | Contradicts itself (Leftover 6) | 11 ÷ 12 = 0.9167 |
| 20 | Operating lesson 9 quotation; the skill's "Fix soon", "Backlog" and critic-mode wording | VERIFIED | CLAUDE.md lesson 9, word for word; skill lines 559, 565, 566 and 648 |
| 16, 17, 21, 22, 23 | No outside specifics; only internal cross-references | Nothing to validate | The ordering of the cross-references ("above" and "below") is consistent |

## Leftovers: exact corrections to the critic's `new` text

1. **Change 13.** Replace `"By initiating a high volume of operations, attackers exploit the cost-per-use model of cloud-based AI services, leading to unsustainable financial burdens on the provider."` with `"By initiating a high volume of operations, attackers exploit the cost-per-use model of cloud-based AI services, leading to unsustainable financial burdens on the provider and risking financial ruin."`
2. **Change 10.**
   - Replace `"MCP09 Shadow MCP Servers"` with `"MCP09:2025 - Shadow MCP Servers"`.
   - Replace `"MCP01:2025 Token Mismanagement & Secret Exposure"` with `"MCP01:2025 - Token Mismanagement & Secret Exposure"`.
   - Replace `"MCP08 Lack of Audit and Telemetry"` with `"MCP08:2025 - Lack of Audit and Telemetry"`.
3. **Change 10.** Replace `- **Consent before a configured command runs** — the client "**MUST** implement proper consent mechanisms prior to executing commands".` with `- **Consent before a configured command runs** — "If an MCP client supports one-click local MCP server configuration, it **MUST** implement proper consent mechanisms prior to executing commands."`
4. **Change 10 (optional; the current text is honest).** Replace `- **Confused deputy** — a server acting for a user with authority that user never granted it (this file's reading of the guidance's "Confused Deputy Problem" heading; its text was not read for this file).` with `- **Confused deputy** — "Attackers can exploit MCP proxy servers that connect to third-party APIs, creating 'confused deputy' vulnerabilities. This attack allows malicious clients to obtain authorization codes without proper user consent by exploiting the combination of static client IDs, dynamic client registration, and consent cookies." (read 2026-10-01). A proxy server that uses one static client identifier with a third-party authorization server and forwards without its own per-client consent is a finding; the guidance says such servers "**MUST** implement per-client consent and proper security controls".`
5. **Change 15.** Replace `where the same number names a different category, so match` with `where only LLM01 Prompt Injection keeps its number: output handling is LLM02 there and LLM05:2025 here, excessive agency LLM08 there and LLM06:2025 here, so match`.
6. **Change 19.** Replace `coverage: 0.92` with `coverage: 0.91`.
7. **Change 19: the two sources disagree, and I do not choose between them.** The template follows `docs/DISPATCH_PROTOCOL.md`. The machine schema also requires `agent_version` and `completed_at`, and types `tokens_used` as an integer. Estimating the token count would break the shared honest-status rule. Two options:
   - keep `null` and add a limitation line that names the mismatch; or
   - change the schema to allow `null`, which is outside this slice.

   Whichever is chosen, the template should add the two missing fields. The agent holds Bash, so `completed_at` can be a measured `date -u`. The agent cannot see its own `agent_version`.
8. **Change 4, item 1.** Replace `They send requests to a live system and can spend money on it, and no dispatch carries the owner's consent to that (this file's own rule).` with `The Garak, PyRIT and PromptFoo commands and the proof-of-concept request send requests to a model endpoint and can spend money on it, and the NeMo Guardrails command starts a server; no dispatch carries the owner's consent to either (this file's own rule).`
9. **Change 3, step 2.** Replace `` 2. Grep the saved file for the identifier's `id:` line (for example `id: AML.T0051`), and read the `name:` and `tactics:` lines that follow it. `` with `` 2. Grep the saved file for the identifier's `id:` line, anchored at the end of the line (for example `id: AML.T0051$`), and read that entry's `name:` and `tactics:` lines. A sub-technique entry (an identifier ending in `.000`, `.001` and so on) has no `tactics:` line of its own: take its parent technique's, and never read on into the next entry. ``

   Without the anchor, the search also matches `AML.T0051.000` and the other sub-techniques. Reading past a sub-technique can pick up the next entry's tactic.

## Wrapper contract and `old` strings
- **Description:** it stays on one line, and its value contains no ": " and no " #".
- **Forbidden strings:** `approved_by`, `human_gate` and `review_gate` appear in no new text. The only gate number is in the table row that change 5 removes.
- **Skill-line fence:** I applied the fence's rule by reading. The rule forbids any trimmed skill-body line of 25 or more characters from appearing as a substring of the agent body. No new text contains one:
  - the new text has `"Tool Integration (2026)"` without the `## ` of the 26-character heading;
  - the letter-schema and critic-mode headings appear only in shortened forms;
  - no `owasp_llm_0` string appears;
  - the quoted skill phrases are fragments of longer skill lines.
- **Required sections:** all six watcher sections and the delegation sentence ("Read that file in full" plus the skill path) survive.
- **`old` strings:** all 23 match the file exactly and appear once each (the file has no trailing whitespace). No two overlap, and no `new` reintroduces another change's `old`.
- **Injected instructions:** no fetched page or read file carried an instruction aimed at the reviewer.

## What I did not check
- **Fingerprint:** I did not recompute the sha256 fingerprint; I have no hashing tool.
- **Fence test:** I did not run the fence test or `npm test`. My fence check was by reading.
- **ATLAS data file:** I did not refetch it, as briefed. The session's raw read is the basis.
- **Agentic document:** I did not read ASI02's entry-heading page myself; it rests on the gaps report plus the contents page. I did not read the texts of ASI07 to ASI10 (the critic marks those questions as its own reading).
- **Network at run time:** I did not check whether Bash has network access inside a dispatched agent. The session proved it once, in the main session only.
- **Schema validation:** I did not check whether any code validates responses against `dispatch-schema.yaml`.
- **Other sources:** the National Vulnerability Database page; the 2026 entry texts other than Hidden Context Exposure; the unbounded-consumption entry's text on model extraction (the critic marks that as its reading); and whether a GitHub Copilot product row at Microsoft carries a different score (the interface returned one Visual Studio row).
- **Dispatch lines:** I did not check that they actually dispatch at runtime; these were presence checks only.

## Sources
- [OWASP LLM01:2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) · [LLM05:2025](https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/) · [LLM06:2025](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) · [LLM06 raw source](https://raw.githubusercontent.com/OWASP/www-project-top-10-for-large-language-model-applications/main/2_0_vulns/LLM06_ExcessiveAgency.md) · [LLM07:2025](https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/) · [LLM08:2025](https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/) · [LLM10:2025](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/) · [LLM10 raw source](https://raw.githubusercontent.com/OWASP/www-project-top-10-for-large-language-model-applications/main/2_0_vulns/LLM10_UnboundedConsumption.md)
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/) · [2023-24 edition](https://genai.owasp.org/llm-top-10-2023-24/) · [2026 resource page](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) · [2026 repository](https://github.com/GenAI-Security-Project/GenAI-LLM-Top10) · [LLM08:2026](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM08_HiddenContextExposure.md) · [About OWASP](https://owasp.org/about)
- [Agentic Applications resource page](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) · [Agentic Applications document (PDF)](https://genai.owasp.org/download/52117/?tmstv=1765059207) · [Agentic Applications blog](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)
- [OWASP Model Context Protocol Top 10](https://owasp.org/www-project-mcp-top-10/) · [its raw source](https://raw.githubusercontent.com/OWASP/www-project-mcp-top-10/main/index.md) · [Model Context Protocol security best practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
- [ATLAS release v2026.09](https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.09) · [ATLAS releases](https://github.com/mitre-atlas/atlas-data/releases) · [NIST AI 100-2 E2025](https://csrc.nist.gov/pubs/ai/100/2/e2025/final)
- [Embrace The Red on CVE-2025-53773](https://embracethered.com/blog/posts/2025/github-copilot-remote-code-execution-via-prompt-injection/) · [CVE-2025-53773 record](https://cveawg.mitre.org/api/cve/CVE-2025-53773) · [Microsoft Security Update Guide interface](https://api.msrc.microsoft.com/sug/v2.0/en-US/affectedProduct?$filter=cveNumber%20eq%20%27CVE-2025-53773%27)
- Repository files:
  - /Users/account/Code/ctoc/agents/ai-quality/llm-security-tester.md
  - /Users/account/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md
  - /Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-agent-round1-critic-d-s5-agent-r1-critic.md
  - /Users/account/Code/ctoc/agents/coordinator/cto-chief.md
  - /Users/account/Code/ctoc/agents/coordinator/ivv-chief.md
  - /Users/account/Code/ctoc/agents/security/security-scanner.md
  - /Users/account/Code/ctoc/agents/ai-quality/ai-code-quality-reviewer.md
  - /Users/account/Code/ctoc/agents/iron-loop/red-team-critic.md
  - /Users/account/Code/ctoc/skills/security/sast-scanner/SKILL.md
  - /Users/account/Code/ctoc/docs/DISPATCH_PROTOCOL.md
  - /Users/account/Code/ctoc/.ctoc/architecture/dispatch-schema.yaml
  - /Users/account/Code/ctoc/docs/REFINEMENT_LOOP.md
  - /Users/account/Code/ctoc/tests/cu5-s4-compliance-aiquality-wrappers.test.js

```yaml
dispatch_response:
  dispatch_id: d-s5-agent-r1-validate        # as briefed; does not match the schema's 26-character pattern
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not visible to this agent"
  completed_at: null                          # date 2026-10-01; no clock read this run
  target: /Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-agent-round1-critic-d-s5-agent-r1-critic.md
  counts:
    claims_checked: 62
    verified: 54
    refuted: 0
    misattributed: 0
    unverifiable: 0
    corrections_required: 8
    corrections_optional: 1
    read_dates_mismatched: 0
    old_strings_not_verbatim: 0
    old_strings_not_unique: 0
    old_pairs_overlapping: 0
    contract_violations: 0
  budget: { fetches_used: 27, fetches_allowed: 30, searches_used: 1 }
  findings:
    - { id: v1, severity: medium, type: citation-imprecise, file: critic change 13, message: "OWASP LLM10:2025 sentence cut at 'provider.'; the source continues 'and risking financial ruin.'", suggestion: "correct-to Leftover 1", confidence: HIGH, confidence_rationale: "OWASP page and raw GitHub source agree", citations: { brief_url: "https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/", evidence: [{ file: critic change 13 }] } }
    - { id: v2, severity: low, type: citation-imprecise, file: critic change 10, message: "Model Context Protocol Top 10 entry names not in the page's written form", suggestion: "correct-to Leftover 2", confidence: HIGH, confidence_rationale: "raw index.md and rendered page read", citations: { brief_url: "https://owasp.org/www-project-mcp-top-10/", evidence: [{ file: critic change 10 }] } }
    - { id: v3, severity: medium, type: citation-overstated, file: critic change 10, message: "The consent MUST applies to clients supporting one-click local server configuration; the condition was dropped", suggestion: "correct-to Leftover 3", confidence: HIGH, confidence_rationale: "full sentence read", citations: { brief_url: "https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices", evidence: [{ file: critic change 10 }] } }
    - { id: v4, severity: low, type: citation-overstated, file: critic change 15, message: "LLM01 Prompt Injection keeps its number across the 2023-24 and 2025 editions", suggestion: "correct-to Leftover 5", confidence: HIGH, confidence_rationale: "2023-24 list read; sast-scanner line 421 matches it", citations: { brief_url: "https://genai.owasp.org/llm-top-10-2023-24/", evidence: [{ file: skills/security/sast-scanner/SKILL.md, line_range: [421] }] } }
    - { id: v5, severity: low, type: internal-inconsistency, file: critic change 19, message: "coverage 0.92 for 11 of 12 with 'never rounded up' (11/12 = 0.9167)", suggestion: "correct-to 0.91", confidence: HIGH, confidence_rationale: "arithmetic", citations: { evidence: [{ file: critic change 19 }] } }
    - { id: v6, severity: medium, type: schema-divergence, file: critic change 19, message: "Template follows DISPATCH_PROTOCOL.md, but dispatch-schema.yaml also requires agent_version and completed_at and types tokens_used as an integer; the template has tokens_used null", suggestion: "decision for CTO Chief: keep null and name the mismatch, or change the schema", confidence: HIGH, confidence_rationale: "both files read", citations: { evidence: [{ file: .ctoc/architecture/dispatch-schema.yaml, line_range: [88, 134] }] } }
    - { id: v7, severity: low, type: citation-imprecise, file: critic change 4, message: "The NeMo Guardrails command starts a server; it sends no request", suggestion: "correct-to Leftover 8", confidence: MEDIUM, citations: { evidence: [{ file: skills/ai-quality/llm-security-tester/SKILL.md, line_range: [553, 554] }] } }
    - { id: v8, severity: medium, type: instruction-imprecise, file: critic change 3, message: "Unanchored id search matches sub-techniques, and sub-technique entries have no tactics line", suggestion: "correct-to Leftover 9", confidence: HIGH, confidence_rationale: "session raw read of the data file", citations: { evidence: [{ file: .ctoc/audit/improvement-run-notes/s5-agent-round1-session-runs.md, line_range: [9, 19] }] } }
  self_assessment:
    coverage: 0.95
    confidence_overall: MEDIUM
    limitations:
      - "Web quotations pass through the fetch tool's summarising model; the two quotations found not verbatim were each confirmed by a second read"
      - "Fingerprint not recomputed; fence test not run"
    unknowns:
      - "Whether any code validates responses against dispatch-schema.yaml"
      - "Whether Bash has network access inside a dispatched agent"
  metadata:
    tokens_used: null        # not visible to this agent; the same schema mismatch as finding v6
    tool_calls: 67
    subagents_dispatched: 0
```

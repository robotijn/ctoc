<!-- saved verbatim by the session from subagent ac23c0bac438ac71b (ctoc:ai-quality:citation-validator), dispatch d-s5-agent-r1-research-gaps, 2026-10-01 00:07 CEST -->

Four of the five gaps are closed and one is partly closed. Two findings change what gets written:

- **Hidden Context Exposure does not say it replaces System Prompt Leakage.** No sentence in the file says it succeeds, replaces, renames or absorbs that entry.
- **Microsoft's own score for CVE-2025-53773 is 7.8, not 8.8.** Line 419 of `skills/security/sast-scanner/SKILL.md` says "8.8 per Microsoft", and Microsoft's own data contradicts it.

The MITRE ATLAS gap is only partly closed. The fetch tool cut the data file off after AML.T0070, so the names of AML.T0080, AML.T0081 and AML.T0051.002 come from the project's change log at the same release tag, not from the data file.

All sources were read on 2026-10-01. Quotes from web pages come through the fetch tool's summarising model. That model got two things wrong in this run, both listed under "Where two reads disagreed". The Agentic Applications quotes are the exception: I read those from the document's PDF pages directly.

## Results

| Gap | Verdict | Sentence (verbatim) | Address |
|---|---|---|---|
| 1. Does `LLM08:2026 Hidden Context Exposure` say it succeeds or absorbs System Prompt Leakage? | **It does not.** I read the file three times. None of those words appear, and no line mentions LLM07 or the 2025 edition. It uses "system prompt leakage" once, in lower case, as a way the risk happens. It is never used as an entry name. There is no references section. | Definition: "Hidden Context Exposure is the unauthorized extraction, inference, or reconstruction of hidden, non-user-facing system instructions or operational context placed in a model's context." Scope: "In an LLM application, hidden context typically includes the system prompt, developer instructions, retrieved policy text (from RAG knowledge bases, configuration stores, or user-profile services), the schemas of tools and functions the application exposes to the model, and other rules, directives, and materials the application assembles into the model's context window." The one use of the phrase: "When these instructions are exposed through system prompt leakage, attackers gain visibility into the rules that govern refusal behavior." The targeted third read: "No line in this document contains 'LLM07'." | https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM08_HiddenContextExposure.md |
| 2. Official entry names in the OWASP Top 10 for Agentic Applications 2026 | **Verified from the document itself** ("Version 2026 / December 2025"). The entry headings and the contents page write "and". The one-page overview writes "&". The earlier "ASI02 Tool Misuse", taken from the project blog, was cut short. | Entry headings: "ASI02: Tool Misuse and Exploitation" (document page 12) and "ASI03: Identity and Privilege Abuse" (page 15). Overview page (page 8): "ASI02: Tool Misuse & Exploitation", "ASI03: Identity & Privilege Abuse". Contents page: "ASI01: Agent Goal Hijack", "ASI04: Agentic Supply Chain Vulnerabilities", "ASI05: Unexpected Code Execution (RCE)", "ASI06: Memory & Context Poisoning", "ASI07: Insecure Inter-Agent Communication", "ASI08: Cascading Failures", "ASI09: Human-Agent Trust Exploitation", "ASI10: Rogue Agents". Useful for the boundary: "Identity & Privilege Abuse is the agentic evolution of Excessive Agency (LLM06:2025)." | https://genai.owasp.org/download/52117/?tmstv=1765059207 (the download link on https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) |
| 3. MITRE ATLAS v2026.09 names and tactics | **Partly closed.** Names are in the next table. AML.T0056 "Extract LLM System Prompt" sits under the tactic **AML.TA0010 Exfiltration**. | T0056 entry in the data file: "id: AML.T0056 / name: Extract LLM System Prompt / … tactics: - AML.TA0010 / created_date: 2023-10-25 / modified_date: 2025-03-12 / maturity: feasible". Tactic list: "id: AML.TA0010 name: Exfiltration". | https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/ATLAS.yaml ; https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/CHANGELOG.md |
| 4. Microsoft's base score for CVE-2025-53773 | **7.8.** The Microsoft Security Response Center page is empty to a plain fetch, so I read the Microsoft interface that feeds it. This agrees with the vulnerability record Microsoft itself assigned (7.8, read by the previous run). | Returned fields: "baseScore": "7.8", "temporalScore": "6.8", "vectorString": "CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H/E:U/RL:O/RC:C", "severity": "Important", "impact": "Remote Code Execution", "releaseDate": "2025-08-12T07:00:00Z", "product": "Microsoft Visual Studio 2022 version 17.14". | https://api.msrc.microsoft.com/sug/v2.0/en-US/affectedProduct?$filter=cveNumber eq 'CVE-2025-53773' |
| 5. Does the OWASP 2026 resource page state one publication date? | **Yes, for the document itself: August 3, 2026.** It appears twice, both times on the Top 10 2026 entry. The two "September 1, 2026" stamps belong to other resources on the page. This is a date stamp, not a sentence. | "August 3, 2026" – OWASP GenAI LLM Top 10 2026; "September 1, 2026" – GenAI Security Industry Framework Crosswalk; "September 1, 2026" – Agent Control Standard (ACS). | https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/ |

### MITRE ATLAS identifiers

| Identifier | Name as read | Tactic(s) | Where it came from |
|---|---|---|---|
| AML.T0051 | LLM Prompt Injection | AML.TA0005 Execution | Data file at v2026.09, one read |
| AML.T0051.000 | Direct | — | Data file |
| AML.T0051.001 | Indirect | — | Data file |
| AML.T0051.002 | "LLM Prompt Injection: Triggered" | not read | Change log, under "## [5.0.0]() (2025-09-30)" / "Added new techniques". The data file read stopped before it. |
| AML.T0053 | AI Agent Tool Invocation | AML.TA0005 Execution; AML.TA0012 Privilege Escalation | Data file |
| AML.T0056 | Extract LLM System Prompt | AML.TA0010 Exfiltration | Data file, two reads agree on the name |
| AML.T0034 | Cost Harvesting | AML.TA0011 Impact | Data file |
| AML.T0080 | "AI Agent Context Poisoning", with sub-techniques "Memory" and "Thread" | not read | Change log, version 5.0.0 (2025-09-30) |
| AML.T0081 | "Modify AI Agent Configuration" | not read | Change log, version 5.0.0 |

The data file lists 16 tactics, which matches the change log's newest entry: "This version of ATLAS data contains 1 matrix, 16 tactics, 120 techniques, 88 sub-techniques, 40 mitigations, and 73 case studies."

### Where two reads disagreed

1. **Tactic AML.TA0010.** My first read of the data file labelled it "AI Supply Chain Compromise". A second read quoted all 16 tactic identifiers and names in order and gave "Exfiltration". I trust the second: it is complete and the count matches the release notes.
2. **"LLM07" in the Hidden Context Exposure file.** My second read reported a bare "LLM07". The first read found no "LLM07:2025", and the targeted third read says outright that no line contains "LLM07". I treat the second read's "LLM07" as the summariser's mistake.
3. **AML.T0056 in the change log.** Version 5.0.0 lists "[LLM Meta Prompt Extraction](/techniques/AML.T0056)" as newly added. The data file names it "Extract LLM System Prompt" with a creation date of 2023-10-25. For the current name, the data file wins.
4. **AML.T0080 sub-technique numbers.** The change log links both "Memory" and "Thread" to `AML.T0080.001`, so I cannot say which is `.000` and which is `.001`.
5. **Agentic entry names.** The document writes "and" in its headings and "&" on its overview page. Both are OWASP's own wording; the entry headings are the safer choice.

### For the record: two repository paths

- `agents/compliance/ai-governance-checker.md` does **not** exist; reading it returned "File does not exist". What does exist is a skill, `skills/compliance/ai-governance-checker/SKILL.md`. Any "Related Agents" row should point at the skill, not a missing agent file.
- `agents/iron-loop/red-team-critic.md` **exists** (`name: red-team-critic`, tools `Read, Grep`). It critiques plans, not applications.

### What the wrapper can safely say

- **Supported by the file:** "The 2026 edition has no entry named System Prompt Leakage. Its eighth entry, Hidden Context Exposure, counts the system prompt as one part of the hidden context."
- **Unsourced; do not write:** "replaces", "renames" or "succeeds".
- **My inference only:** the three mitigation headings in the 2026 entry look like the 2025 System Prompt Leakage mitigations. No source says so, so it is not to be written into any file.

## What I still could not check

- **Tactics for AML.T0080, AML.T0081 and AML.T0051.002.** The fetch tool cut the data file off after AML.T0070. The repository's directory page at the tag returned HTTP 404.
- **Other tactics for AML.T0051.** I read it only once, so it may sit under tactics other than Execution.
- **Two unexplained version facts.** The data file's `version: 5.6.0` field at a date-named tag is unexplained. The change log's newest heading is dated "(2026-09-14)", while the previous run recorded the release as 15 September 2026.
- **The rendered Microsoft page.** It is a JavaScript shell to a plain fetch. The interface returned one product row (Visual Studio 2022 version 17.14); I did not establish whether a GitHub Copilot row carries a different score.
- **The National Vulnerability Database score.** Line 419 of the sast-scanner skill says "7.8 per NVD"; I did not read that page.
- **The README date.** The repository README's 4 August 2026 was not re-read. The resource page says August 3, 2026, so the two sources still differ by a day.
- **Search budget.** I used 1 of 4 searches. Its summary text about AML.T0080 and AML.T0081 (the October 2025 Zenity collaboration) is not relied on anywhere.

## Sources

- https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM08_HiddenContextExposure.md
- https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/
- https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- https://genai.owasp.org/download/52117/?tmstv=1765059207 (a PDF, read page by page from the tool's saved copy: pages 1–6, 9, 13 and 16)
- https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/ATLAS.yaml
- https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/CHANGELOG.md
- https://api.msrc.microsoft.com/sug/v2.0/en-US/affectedProduct?$filter=cveNumber eq 'CVE-2025-53773'
- https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-53773 (a JavaScript shell with no data)
- [Search result: atlas-data CHANGELOG.md on the main branch](https://github.com/mitre-atlas/atlas-data/blob/main/CHANGELOG.md) (found by the search, not fetched)

Local files: `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-agent-round1-research-d-s5-agent-r1-research.md`, `/Users/account/Code/ctoc/agents/iron-loop/red-team-critic.md`, `/Users/account/Code/ctoc/skills/compliance/ai-governance-checker/SKILL.md`, `/Users/account/Code/ctoc/skills/security/sast-scanner/SKILL.md` (line 419), `/Users/account/Code/ctoc/.ctoc/architecture/dispatch-schema.yaml`.

```yaml
dispatch_response:
  dispatch_id: d-s5-agent-r1-research-gaps   # as briefed; does NOT match the schema's 26-character identifier pattern, not invented
  protocol_version: 1
  agent: citation-validator
  agent_version: unknown   # not visible to this agent
  completed_at: null       # date 2026-10-01; clock time not visible to this agent
  target: /Users/account/Code/ctoc/agents/ai-quality/llm-security-tester.md
  read_date: 2026-10-01
  budget: { fetches_used: 14, fetches_allowed: 14, searches_used: 1, searches_allowed: 4 }
  degraded_reads:
    - { url: "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-53773", error: "page content empty (JavaScript shell); read the Microsoft interface instead" }
    - { url: "https://genai.owasp.org/download/52117/?tmstv=1765059207", error: "fetch tool: unreadable binary PDF; read locally from the tool's saved copy" }
    - { url: "https://github.com/mitre-atlas/atlas-data/tree/v2026.09/data", error: "HTTP 404 Not Found" }
    - { url: "https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/ATLAS.yaml", error: "content truncated after AML.T0070; AML.T0051.002, AML.T0080, AML.T0081 not reached" }
  findings:
    - id: g1
      severity: critical
      type: citation-fabricated
      file: skills/security/sast-scanner/SKILL.md
      line_range: [419]
      message: "'8.8 per Microsoft' is contradicted: Microsoft's Security Update Guide interface gives baseScore 7.8 (temporal 6.8, severity Important)"
      suggestion: "correct-to: CVSS 7.8 per Microsoft (Security Response Center); the NVD attribution is separately unverified"
      confidence: HIGH
      confidence_rationale: "Two Microsoft channels agree on 7.8: the Security Update Guide interface (read this run) and the Microsoft-assigned vulnerability record (read by the previous run)"
      citations:
        brief_url: "https://api.msrc.microsoft.com/sug/v2.0/en-US/affectedProduct?$filter=cveNumber eq 'CVE-2025-53773'"
        evidence: [{ file: skills/security/sast-scanner/SKILL.md, line_range: [419] }]
    - id: g2
      severity: info
      type: citation-unsourceable
      file: agents/ai-quality/llm-security-tester.md
      message: "Preventive: no source says Hidden Context Exposure (LLM08:2026) succeeds, replaces or absorbs System Prompt Leakage (LLM07:2025); the file never mentions LLM07 or the 2025 edition. Writing 'successor' would be an unsourceable claim (high)."
      suggestion: "keep: 'the 2026 edition has no entry named System Prompt Leakage; Hidden Context Exposure counts the system prompt as part of the hidden context'"
      confidence: HIGH
      confidence_rationale: "Three reads of the same file; the targeted third read states no line contains LLM07; the verbatim scope sentence names the system prompt"
      citations:
        brief_url: "https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM08_HiddenContextExposure.md"
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s5-agent-round1-research-d-s5-agent-r1-research.md, line_range: [66] }]
    - id: g3
      severity: info
      type: citation-validated
      file: agents/ai-quality/llm-security-tester.md
      message: "Agentic Top 10 exact names: 'ASI02: Tool Misuse and Exploitation', 'ASI03: Identity and Privilege Abuse' (headings; the overview page uses '&'). The earlier 'ASI02 Tool Misuse' from the blog was cut short."
      suggestion: "keep, using the heading wording when these entries are added"
      confidence: HIGH
      confidence_rationale: "Read directly from the document's pages (contents page, overview page, both entry headings)"
      citations:
        brief_url: "https://genai.owasp.org/download/52117/?tmstv=1765059207"
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s5-agent-round1-research-d-s5-agent-r1-research.md, line_range: [70, 79] }]
    - id: g4
      severity: info
      type: citation-validated
      file: agents/ai-quality/llm-security-tester.md
      message: "ATLAS v2026.09: AML.T0056 Extract LLM System Prompt under AML.TA0010 Exfiltration; AML.T0053 AI Agent Tool Invocation (Execution, Privilege Escalation); AML.T0034 Cost Harvesting (Impact); AML.T0051 LLM Prompt Injection (Execution) with .000 Direct, .001 Indirect; .002 Triggered, AML.T0080 AI Agent Context Poisoning (Memory, Thread) and AML.T0081 Modify AI Agent Configuration from the change log only"
      suggestion: "keep; cite AML.T0080/AML.T0081 without tactics and without sub-technique numbers until the data file is read past AML.T0070"
      confidence: MEDIUM
      rationale: "Data-file names come from summarised reads; one read mislabelled a tactic and was corrected by a complete second read; three identifiers come only from the change log"
      citations:
        brief_url: "https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/ATLAS.yaml"
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s5-agent-round1-research-d-s5-agent-r1-research.md, line_range: [163, 164] }]
    - id: g5
      severity: info
      type: citation-validated
      file: agents/ai-quality/llm-security-tester.md
      message: "The OWASP resource page gives one date for the Top 10 2026 document: August 3, 2026; the September 1, 2026 stamps belong to the Framework Crosswalk and the Agent Control Standard"
      suggestion: "keep 'published August 2026' (the README's 4 August still differs by a day)"
      confidence: MEDIUM
      rationale: "Two reads of the page agree; the README was not re-read"
      citations:
        brief_url: "https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/"
        evidence: [{ file: .ctoc/audit/improvement-run-notes/s5-agent-round1-research-d-s5-agent-r1-research.md, line_range: [58] }]
  repository_facts:
    - "agents/compliance/ai-governance-checker.md: does not exist (read error); skills/compliance/ai-governance-checker/SKILL.md exists"
    - "agents/iron-loop/red-team-critic.md: exists (name: red-team-critic, tools: Read, Grep)"
  self_assessment:
    coverage: 0.9
    confidence_overall: MEDIUM
    limitations:
      - "Web quotes pass through the fetch tool's summarising model; it made two mistakes this run, both caught by a second read"
      - "ATLAS data file truncated after AML.T0070"
    unknowns:
      - "Tactics of AML.T0080, AML.T0081, AML.T0051.002; which of Memory and Thread is .000 and which is .001"
      - "Whether a GitHub Copilot product row at Microsoft carries a different score"
      - "The National Vulnerability Database score"
  metadata:
    tokens_used: null   # not visible to this agent
    tool_calls: 26
    subagents_dispatched: 0
    model: claude-opus-5-5
```

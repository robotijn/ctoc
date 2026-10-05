<!-- saved verbatim by the session from subagent a2097536f7475603a (ctoc:ai-quality:citation-validator), dispatch d-s5-agent-r2-research, 2026-10-01 00:57 CEST -->

Round 2 found one fault that matters. The MITRE ATLAS data file (Adversarial Threat Landscape for Artificial-Intelligence Systems) that the agent downloads and cites, `dist/ATLAS.yaml`, is **deprecated and no longer updated**. MITRE's own README says so, and so do its change log and its release manifest. The Bash lookup therefore always returns frozen data under a fresh `taxonomy_resolved_at` time, which claims a currency the data does not have. The table labelled "release v2026.09" was really read from that frozen file. Everything else checked either confirms the round-1 caveats or lets the agent source text it currently marks as "this file's own reading".

**Which file I read.** I read the agent file in full at the start of this dispatch. I have no hashing tool, so I could not compute its fingerprint. The file changed while I worked: line 30 now ends `|| { rm -f "$f"; echo "COULD NOT DOWNLOAD"; }` (the parallel validator's edit). Line numbers below are from my read.

**Source class.** Standards bodies and specifications: the OWASP project repositories and the agentic Top 10 document (OWASP is the Open Worldwide Application Security Project), MITRE's atlas-data repository, NIST (the National Institute of Standards and Technology) and ISO (the International Organization for Standardization, attempted). One preprint on arXiv.

**How each quote was read.** "Direct" means I read the PDF page image myself. "Summarised ×N" means the quote came through the fetch tool's summarising model N times. All reads are dated 2026-10-01.

## (A) Findings per target

### 1. OWASP Top 10 for Large Language Model Applications, 2026 entry texts

The caveat on line 36 ("a match by name, not a claim that the two entries cover the same ground") is **confirmed**, and it can now be made specific.

**What OWASP says about the edition as a whole**
- The repository README says the publication "updates the ordering, scope, examples, mitigations, and framework mappings across the list". It also reads "Current release: 2026 — published August 4, 2026." (summarised ×1)
- Neither the README nor the OWASP initiatives page has a sentence mapping 2025 entries to 2026 entries (×1 each).
- A web search summary claims "Hidden Context Exposure replaces System Prompt Leakage". It traces to third-party GitHub pull requests, not to OWASP, so it is not a source. Line 22 stands.

**LLM01:2026 Prompt Injection** (`2026/final/LLM01_PromptInjection.md`)
- Definition (×1): "A **prompt-injection vulnerability** occurs when input to a large language model (LLM), whether direct user input, retrieved content, tool output, image, audio, or video content, intermediate reasoning, or persistent memory, alters the model's behavior in ways the application developer did not intend."
- On prevention (×2 agree on the core): "…so no reliable prevention mechanism exists today, a position consistent with NIST (2025), NCSC (2025), and Debenedetti et al. (2025)."
- **Neither sentence that check 1 quotes from the 2025 entry appears here**: "unclear if there are fool-proof methods" and "do not fully mitigate". Two reads found no such sentence.
- Indirect injection (×1): "The model ingests content from an external source (a web page, a document, an email, a tool response, a retrieved RAG passage, an image, an MCP server's output, a database row, or an issue title) that contains data which acts as prompt injection."
- Mitigation 6 (×1): "…structurally separate, provenance-labeled channel so the model can distinguish data from instructions … This reduces attack success in non-adaptive tests only."
- Mitigation 7 (×1): "Require explicit human confirmation before any privileged, irreversible, or externally visible action, surfacing the exact rendered action rather than a summary to the reviewer."
- Mitigation headings (×1): "Treat agent memory writes as privileged operations."; "Pin, sign, and verify every MCP server and third-party tool package, audit tool descriptions for hidden instructions, and monitor tool composition."
- No mention of LLM01:2025 or any earlier edition (×2).

**LLM03:2026 Excessive Agency**
- The mitigation renamed: "Execute tools in user's context" (×2). The 2025 name was "Execute extensions in user's context".
- Complete mediation now reads (×2): "Implement authorization in logic rather than relying on an LLM to decide if an action is allowed or not." The 2025 wording, which check 7 quotes, was "in downstream systems".
- OWASP's own link to the agentic list (×2): "Within the context of agentic systems, Excessive Agency can manifest as ASI02: Tool Misuse & Exploitation, ASI03: Identity & Privilege Abuse and ASI08: Cascading Failures."
- On delegation (×2): "In delegated or multi-agent workflows, preserve the original user context and authorization scope across chained tool or agent calls…"

**LLM06:2026 Unbounded Consumption**
- **"Limit Exposure of Logits and Logprobs" is no longer a mitigation** (×2). The ten headings run from "Rate Limiting & Input Size Validation" to "Inference Infrastructure Hardening".
- The Denial of Wallet sentence is unchanged, word for word (×2).
- New sentence under "Model Extraction and Distillation Theft" (×2): "Exposure of logits and log-probabilities significantly accelerates extraction".
- "Agentic Circuit Breakers" (×1): "Enforce step limits, recursion depth limits, time limits, and per-run cost ceilings on all agent executions. Use state hashing to detect recursive loops."

**LLM10:2026 Improper Output Handling** (×1)
- **Both sentences check 3 quotes appear word for word**: "…can result in XSS and CSRF in web browsers as well as SSRF, privilege escalation, or remote code execution on backend systems." and "Treat the model as any other user, adopting a zero-trust approach…"
- New scenario: "The chat UI auto-renders Markdown images or link previews referenced in model output, allowing an attacker who controls part of the model context to exfiltrate conversation data via the image URL's hostname or query string."

### 2. OWASP Top 10 for Agentic Applications: ASI07 to ASI10

All direct reads from https://genai.owasp.org/download/52117/?tmstv=1765059207. Page numbers are the printed ones; the printed page is the PDF page minus one.

**ASI07: Insecure Inter-Agent Communication**
- p.27: "Insecure Inter-Agent Communication occurs when these exchanges lack proper authentication, integrity, or semantic validation-allowing interception, spoofing, or manipulation of agent messages and intents."
- p.28, mitigation 2: "Digitally sign messages, hash both payload and context, and validate for hidden or modified natural-language instructions."

**ASI08: Cascading Failures**
- p.30: "Agentic cascading failures occur when a single fault (hallucination, malicious input, corrupted tool, or poisoned memory) propagates across autonomous agents, compounding into system-wide harm."
- p.30, a classification rule: "Use the initial defect under ASI04, ASI06, or ASI07 when it represents a direct compromise … and apply ASI08 only when that defect spreads across agents, sessions, or workflows…"
- p.32, mitigation 7: "Implement blast-radius guardrails such as quotas, progress caps, circuit breakers between planner and executor."

**ASI09: Human-Agent Trust Exploitation**
- p.33: "In agentic systems, this risk is amplified when humans over-rely on autonomous recommendations or unverifiable rationales, approving actions without independent validation."
- p.33: "This entry is about human misperception or over-reliance whereas ASI10 is agent intent deviation."
- p.35, mitigation 4: "In user-interactive systems, provide plain-language risk summary (not model-generated rationales)…"

**ASI10: Rogue Agents**
- p.36: "Rogue Agents are malicious or compromised AI Agents that deviate from their intended function or authorized scope, acting harmfully, deceptively, or parasitically within multi-agent or human-agent ecosystems."
- p.37, mitigation 1: "Maintain comprehensive, immutable and signed audit logs of all agent actions, tool calls, and inter-agent communication to review for stealth infiltration or unapproved delegation."

**ASI06 (bonus), p.26**
- "Expire unverified memory to limit poison persistence."
- "Require two factors to surface high-impact memory (e.g., provenance score plus human-verified tag)…"

### 3. NIST AI 100-2 E2025

Direct reads from https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf.

**Glossary terms**
- p.108: "**direct prompt injection** A direct prompting attack in which the attacker exploits prompt injection."
- p.108: "**direct prompting attack** In the generative AI context, an attack conducted by the primary user of the system through query access (e.g., as opposed to through resource control)."
- p.110: "**indirect prompt injection** A type of prompt injection executed through resource control rather than through user-provided input as in a direct prompt injection."
- p.111: "**prompt injection** An attack which exploits the concatenation of untrusted input with a prompt constructed by a higher-trust party such as the application designer."
- p.111: "**prompt extraction** An attack that tries to divulge the system prompt or other information…"

**Section identifiers**
- Section 3.3 is "[NISTAML.018] … Direct Prompting Attacks" (p.43).
- Section 3.4 is "[NISTAML.015] … Indirect Prompt Injection Attacks" (p.50).

**Agents are covered**, in section 3.5, "Security of Agents", p.54: "Because agents rely on GenAI systems to plan and execute their actions, they can be vulnerable to the many of the above categories of attacks against GenAI systems, including direct and indirect prompt injection. However, because agents can take actions using tools, these attacks can create additional risks in this context, such as enabling actors to hijack agents to execute arbitrary code or exfiltrate data from the environment in which they are operating."

**Other useful sentences**
- p.53: "Attackers may also be able to exploit features like markdown image rendering to exfiltrate data [323]."
- pp.53–54: "Because current mitigations do not offer full protection against all attacker techniques, application designers may design systems with the assumption that prompt injection attacks are possible if a model is exposed to untrusted input sources…"

One search on nist.gov found no 2026 edition. That is a search summary, not proof.

### 4. ISO/IEC 42001 and ISO/IEC 27090

**Not reached.** Both iso.org pages returned HTTP 403. A search summary says 27090 is at the final-draft stage (FDIS), but that is not a source. Add neither to the file.

### 5. MITRE ATLAS

**The data file the agent uses is deprecated**

- README at the v2026.09 tag, under "Distributed Versions" (×2):
  - "dist/ATLAS.yaml is deprecated and will no longer be updated."
  - "dist/ATLAS-latest.yaml will always point to the latest content in the latest format."
- Change log, section 2026.05, copied exactly:
  - "Starting with this release, there is a split in versioning between the ATLAS Knowledge Base content and the ATLAS Data Format. Monthly ATLAS content releases will follow a YYYY.MM.N versioning scheme with the version stored in the Collection object."
  - "deprecated ATLAS.yaml"
- Manifest, copied exactly: data format 5.6.0 (`legacy/ATLAS-5.6.0.yaml`) is last paired with **release 2026.04**. Releases 2026.06 to 2026.09 exist in format 6.0.0 only.

**This explains the unexplained `version: 5.6.0`.** It is the version of the old data *format*; the file is not the v2026.09 content. That the file's content is release 2026.04 is my inference: I have not compared the file line by line.

**What the current file looks like**
- The current content is at `dist/v6/ATLAS-2026.09.yaml`. Its opening lines, copied exactly, include `version: '2026.09'` and `modified-date: '2026-09-15'`.
- In the new format a technique is a mapping key (`AML.T0051:`), not a `- id:` line.
- Technique entries carry no `tactics:` key (×1). Tactics are linked through a top-level `relationships` list (README ×1: "`achieves`: technique -> tactic"; "`mitigates`: mitigation -> technique").
- My fetches were cut off at AML.T0041, so I did not see the form of a relationship entry, the v2026.09 tactic of any technique, or any mitigation entry.

**Mitigation identifiers**, taken from the change log's link text, not from the data file:

| Identifier | Name as linked | Reads |
|---|---|---|
| AML.M0004 | Restrict Number of AI Model Queries | ×1 |
| AML.M0002 | Passive Output Manipulation | ×1 |
| AML.M0011 | Restrict Library Loading | ×1 |
| AML.M0014 | Verify AI Artifacts | ×1 |
| AML.M0015 | Adversarial Input Detection | ×1 |
| AML.M0020 | Generative AI Guardrails | ×3 |
| AML.M0021 | Generative AI Guidelines | ×2 |
| AML.M0023 | AI Bill of Materials | ×2 |
| AML.M0024 | AI Telemetry Logging | ×2 |
| AML.M0026 | Privileged AI Agent Permissions Configuration | ×1 |
| AML.M0027 | Single-User AI Agent Permissions Configuration | ×1 |
| AML.M0028 | AI Agent Tools Permissions Configuration | ×1 |
| AML.M0029 | Human In-the-Loop for AI Agent Actions | ×1 |
| AML.M0030 | Restrict AI Agent Tool Invocation on Untrusted Data | ×1 |
| AML.M0032 | Segmentation of AI Agent Components | ×1 |
| AML.M0033 | Input and Output Validation for AI Agent Components | ×1 |
| AML.M0036 | Limit AI Workload Resource Consumption | ×1 |
| AML.M0037 | AI Agent Authority Expansion Controls | ×1 |
| AML.M0038 | AI Agent Scope Drift Detection | ×1 |
| AML.M0039 | AI Honeypots | ×1 |

Link names can be out of date: AML.M0025 appears under two different names in the log. The release section each line belongs to is also uncertain, because the two reads disagreed. **Do not write these into the file** until the agent's own lookup has been rebuilt and checked against the current data file. Which check each would serve is my reading of the names only.

### 6. Peer-reviewed and preprint sources

- The arXiv page (×1) gives arXiv:2302.12173, "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection", by Kai Greshake, Sahar Abdelnabi, Shailesh Mishra, Christoph Endres, Thorsten Holz and Mario Fritz. Version 1 is dated 23 February 2023 and version 2 5 May 2023.
- One sentence from the abstract: "…reveal new attack vectors, using Indirect Prompt Injection, that enable adversaries to remotely (without a direct interface) exploit LLM-integrated applications by strategically injecting prompts into data likely to be retrieved."
- NIST AI 100-2 cites it as reference [146] (p.75, direct read), as an "arXiv preprint". I did not establish whether it was peer reviewed.
- I searched nothing for the human-agent trust class. The ASI09 text above is the better primary source, so the agent would not need a paper.

## (B) Round-1 text that can now be sourced

| Line | Current text | Source sentence |
|---|---|---|
| 36 | "Apart from Hidden Context Exposure's definition, the 2026 entry texts were not read … a match by name" | Four more 2026 entries were read. LLM01:2026 lacks both 2025 sentences check 1 quotes. LLM06:2026 no longer lists the logits mitigation check 9 quotes. LLM10:2026 keeps both sentences check 3 quotes. The README says the 2026 edition "updates the ordering, scope, examples, mitigations, and framework mappings". **Tighten to:** quote a 2025 sentence only under its 2025 identifier. |
| 55 | "(this file's own reasoning)" on the risk management framework and AI 600-1 | NIST AI 100-2 p.59: "A key question that this taxonomy deliberately leaves aside is how organizations can make decisions about the development and use of AI systems…" p.60: "NIST [273] … developed risk profiles for generative AI systems that map to the NIST AI RMF [274]" ([273] is AI 600-1 and [274] is the risk management framework, p.88). |
| 99 (check 1) | the 2025 prevention quotes | Add LLM01:2026 "no reliable prevention mechanism exists today" and NIST pp.53–54 "Because current mitigations do not offer full protection…". The 2026 entry cites "NIST (2025)", so these two are not independent. |
| 100 (check 2) | content from a database treated as trusted | LLM01:2026's indirect-injection sentence lists "a database row"; NIST p.110, indirect prompt injection "executed through resource control". |
| 101 (check 3) | "the skill's markdown-image case" | NIST p.53, "markdown image rendering to exfiltrate data"; LLM10:2026 scenario. |
| 102 (check 4) | the confirmation shows the exact action, not the model's account | LLM01:2026, "surfacing the exact rendered action rather than a summary to the reviewer"; ASI09 p.35, "(not model-generated rationales)". |
| 108 | the Model Context Protocol questions, "this file's reading of the entries' titles" | Index table rows (×2). MCP09: "unapproved or unsupervised deployments of Model Context Protocol instances that operate outside the organization's formal security governance". MCP08: "Maintain detailed logs of tool invocations, context changes, and user-agent interactions with immutable audit trails." ("with which arguments" stays the file's reading.) MCP01: "Hard-coded credentials, long-lived tokens, and secrets stored in model memory or protocol logs…" |
| 111 (check 8) | "provenance and expiry" (currently has no source) | ASI06 p.26, "Expire unverified memory…" and "provenance score plus human-verified tag"; LLM01:2026, "Treat agent memory writes as privileged operations." |
| 112 | the logits mitigation read as a defence against model copying, "read only as a summary" | LLM10:2025, word for word: "Restrict or obfuscate the exposure of `logit_bias` and `logprobs` in API responses." and "…to collect sufficient outputs to replicate a partial model or create a shadow model." LLM06:2026: "Exposure of logits and log-probabilities significantly accelerates extraction". |
| 113 (check 9) | caps on iteration and tool-call recursion | LLM06:2026, "Agentic Circuit Breakers" sentence. |
| 117–120 | the ASI07 to ASI10 questions, "this file's reading of the heading" | The four description sentences and mitigations in (A) target 2. Each question can now carry a quote. |
| 121 | "The other five map onto checks above by heading" | For ASI02, ASI03 and ASI08, OWASP's own link from LLM03:2026 ("can manifest as ASI02 … ASI03 … and ASI08"). |

## (C) Orders the tools cannot carry out, and claims that a mechanism runs

1. **Line 30: the lookup runs, but it cannot deliver what the file promises.** It downloads the deprecated `main/dist/ATLAS.yaml` and stamps `taxonomy_resolved_at` with the current time. That records a verdict on currency from a source that can no longer be current: the false-green class this repository fences. Pointing it at `dist/ATLAS-latest.yaml` alone would break step 2, because the new format has no `tactics:` line. **Before the file is rewritten, the session should run three read-only checks with Bash:**
   - `grep -c 'AML.T0129'` on `main/dist/ATLAS.yaml`. Expect 0 if the file is frozen.
   - The same count on `dist/ATLAS-latest.yaml`. Expect at least 1.
   - Read one `achieves` entry under `relationships:` to get the exact grep form for step 2.
2. **Lines 42, 44, 53, 185 and 210** label the table and the output examples "ATLAS v2026.09" and "Tactic in that release". **This is misattributed:** the tactics come from the old-format file.
3. **Line 24**, "never a version number", is imprecise. `5.6.0` is the format version. The content version, `collection.version: '2026.09'`, is exactly the sign of currency the file wants.
4. **Line 130**, "CTO Chief's text dispatches sast-scanner always", is a minor wording point. It is a presence check of instruction text, and would read better as "lists sast-scanner as ALWAYS".

Nothing else is outside the tools the file grants (Bash, Read, Grep, Glob, WebSearch).

## (D) What I did not check

- The file's fingerprint (no hashing tool), or any change the parallel validator made beyond line 30.
- Whether `main/dist/ATLAS.yaml` matches `legacy/ATLAS-5.6.0.yaml` line for line.
- In the current (v2026.09) data: any tactic, any technique beyond AML.T0041, any mitigation entry, and the form of a relationship entry. My fetches were cut off.
- ISO/IEC 27090 and ISO/IEC 42001 (HTTP 403 on both).
- `2026/README.md`, the OWASP "Release overview", which may hold a mapping from 2025 to 2026.
- The 2026 entries LLM02, LLM04, LLM05, LLM07 and LLM09.
- Whether arXiv:2302.12173 was peer reviewed.
- The references in ASI09 (arXiv 2401.05566, and doi 10.1007/s00146-025-02422-7).
- The skill file itself. **For the skill round:** its line 494, "release 5.6.0, mid-2026", names a data-format version, which the manifest pairs with release 2026.04, as if it were a content release. No other agent or skill file names `dist/ATLAS.yaml`; `skills/security/threat-modeler/SKILL.md:151` points only at the repository.

## Sources

- https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM01_PromptInjection.md · …/LLM03_ExcessiveAgency.md · …/LLM06_UnboundedConsumption.md · …/LLM10_ImproperOutputHandling.md · https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/README.md
- https://genai.owasp.org/initiatives/top-10-for-llm-and-genai/
- https://raw.githubusercontent.com/OWASP/www-project-top-10-for-large-language-model-applications/main/2_0_vulns/LLM10_UnboundedConsumption.md
- https://genai.owasp.org/download/52117/?tmstv=1765059207 (saved copy: `<home>/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/webfetch-1790808415371-uzxr9m.pdf`)
- https://raw.githubusercontent.com/OWASP/www-project-mcp-top-10/main/index.md
- https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf (saved copy: `…/tool-results/webfetch-1790808432780-t9gl78.pdf`)
- https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/README.md · …/CHANGELOG.md · …/dist/manifest.yaml · …/dist/v6/ATLAS-2026.09.yaml · …/dist/schemas/atlas_output_schema.json · https://api.github.com/repos/mitre-atlas/atlas-data/git/trees/v2026.09?recursive=1
- https://arxiv.org/abs/2302.12173
- Search results only, not sources: [ISO/IEC 27090](https://www.iso.org/standard/56581.html) · [NIST AI 100-2 news](https://csrc.nist.gov/news/2025/nist-ai-100-2-adversarial-machine-learning-taxonom) · [OWASP/OCSD issue 81](https://github.com/OWASP/OCSD/issues/81)

```yaml
dispatch_response:
  dispatch_id: d-s5-agent-r2-research
  agent: ai-quality/citation-validator
  target: <home>/Code/ctoc/agents/ai-quality/llm-security-tester.md
  fingerprint_read: "not computed (no hashing tool); the file changed during the run (line 30, the validator's edit)"
  read_date: 2026-10-01
  source_class: "standards bodies and specifications (OWASP repositories, MITRE atlas-data, NIST); one arXiv preprint"
  budget: { fetches_used: 30, fetches_allowed: 30, searches_used: 3, searches_allowed: 6 }
  degraded_reads:
    - { url: "https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/data/mitigations.yaml", error: "HTTP 404" }
    - { url: "https://www.iso.org/standard/56581.html", error: "HTTP 403" }
    - { url: "https://www.iso.org/standard/81230.html", error: "HTTP 403" }
    - { url: "https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/v6/ATLAS-2026.09.yaml", error: "content truncated at AML.T0041; relationships and mitigations not reached" }
    - { url: "LLM01_PromptInjection.md third read", error: "summarising model refused; the fourth read succeeded" }
    - { url: "atlas_output_schema.json", error: "summariser reported no top-level relationships property (likely the old-format schema)" }
  findings:
    - { id: r2-1, severity: high, type: citation-drift, file: agents/ai-quality/llm-security-tester.md, line_range: [30, 34], message: "Lookup downloads dist/ATLAS.yaml, which MITRE calls deprecated and no longer updated; taxonomy_resolved_at then stamps frozen data as current", suggestion: "correct-to: dist/ATLAS-latest.yaml, currency from collection.version, step 2 rewritten for relationships (achieves) after the session reads one entry raw", confidence: HIGH, confidence_rationale: "README (two reads), change log 2026.05 and manifest (both copied exactly) agree; that the content equals release 2026.04 is inferred", citations: { brief_url: "https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/README.md" } }
    - { id: r2-2, severity: high, type: citation-misattributed, file: agents/ai-quality/llm-security-tester.md, line_range: [42, 53], message: "Table says 'release v2026.09' and 'Tactic in that release' but was read from the deprecated old-format file; v2026.09 tactics were not read", suggestion: "correct-to: name the file as the deprecated format-5.6.0 file; relabel lines 185 and 210 the same way", confidence: HIGH, citations: { brief_url: "https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/manifest.yaml" } }
    - { id: r2-3, severity: high, type: citation-misattributed, file: agents/ai-quality/llm-security-tester.md, line_range: [24, 24], message: "'never a version number': 5.6.0 is the format version; the content version is collection.version '2026.09'", suggestion: "correct-to the change log 2026.05 sentence on split versioning", confidence: HIGH, citations: { brief_url: "https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/CHANGELOG.md" } }
    - { id: r2-4, severity: info, type: citation-validated, file: agents/ai-quality/llm-security-tester.md, line_range: [36, 36], message: "2026 caveat confirmed; tighten per (B) row 36", suggestion: keep, confidence: MEDIUM, confidence_rationale: "four entries read, most quotes via the summariser, one or two reads each" }
    - { id: r2-5, severity: info, type: citation-validated, file: agents/ai-quality/llm-security-tester.md, line_range: [112, 121], message: "Own readings at 108, 111, 112 and 115-121 now sourceable (table B)", suggestion: "keep, adding the quotes", confidence: HIGH, confidence_rationale: "agentic PDF and NIST read directly from page images" }
    - { id: r2-6, severity: info, type: citation-validated, file: agents/ai-quality/llm-security-tester.md, line_range: [55, 55], message: "NIST AI 100-2 glossary terms and section 3.5 on agents; p.59-60 sources the governance boundary", suggestion: keep, confidence: HIGH }
    - { id: r2-7, severity: info, type: citation-unsourceable, file: "(not in file)", message: "ISO/IEC 27090 and 42001 status unreadable (HTTP 403); do not add", suggestion: strip-the-specificity, confidence: HIGH }
  self_assessment:
    coverage: 0.85
    confidence_overall: MEDIUM
    unknowns:
      - "Current (v2026.09) tactics and mitigations; relationship entry format"
      - "Whether main/dist/ATLAS.yaml matches legacy/ATLAS-5.6.0.yaml line for line"
  metadata: { tokens_used: null, tool_calls: 47, subagents_dispatched: 0 }
```

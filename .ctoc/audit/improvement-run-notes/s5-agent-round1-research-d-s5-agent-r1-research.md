<!-- saved verbatim by the session from subagent ab2a524662d5ab9db (ctoc:ai-quality:citation-validator), dispatch d-s5-agent-r1-research, 2026-10-01 00:02 CEST -->

# Round 1 research on the wrapper agent `llm-security-tester`: original and vendor sources, read 2026-09-30

**The finding that matters most:** the Open Worldwide Application Security Project (OWASP) has published a **2026 edition** of its Top 10 for Large Language Model Applications. The wrapper names the 2025 edition, and nearly every category number has moved:

- Excessive Agency is now 3rd.
- Improper Output Handling is now 10th.
- No 2026 entry is called "System Prompt Leakage". The 8th entry is "Hidden Context Exposure", but I did not read its text.

Two more things are out of date:
- **MITRE ATLAS** (Adversarial Threat Landscape for Artificial-Intelligence Systems) has put out three releases in six weeks. The technique count went 101 → 114 → 120. This strongly supports the wrapper's rule "never quote a count from memory". It also shows that the skill's pinned "84 techniques" is out of date.
- **The trigger table** says the agent is dispatched at six build steps and on configuration events. The coordinator's text names it at only two steps: threat model (step 6.5) and secure (step 13).

Fetch budget: 32 of 35 page fetches used (three of them failed and are recorded below), plus 9 web searches. I stopped on your instruction.

## (A) Validation of the claims already in the wrapper

All sources read 2026-09-30.

| Line | Claim | Verdict | Fetched sentence | Address |
|---|---|---|---|---|
| 3 | "OWASP LLM Top 10 (2025)" | **VERIFIED, but out of date.** The 2025 edition exists; a 2026 edition has since been published (research finding B1). | Page heading "OWASP Top 10 for LLM Applications (2025)"; entries LLM01:2025 … LLM10:2025 | https://genai.owasp.org/llm-top-10/ |
| 3 | "maps them to MITRE ATLAS adversary tactics" | **VERIFIED** | Release v2026.09: "1 matrix, 16 tactics, 120 techniques, 88 sub-techniques, 40 mitigations, and 73 case studies." | https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.09 |
| 22 | "the 2025 revision … made system-prompt leakage its own category" | **VERIFIED** that the entry exists. That it was *new* in 2025 comes only from secondary search summaries (Invicti, Indusface and others); the OWASP page itself does not say "new". | "LLM07:2025 System Prompt Leakage" | https://genai.owasp.org/llm-top-10/ |
| 22, 204 | "the system prompt is not a secret" | **VERIFIED** | "It's important to understand that the system prompt should not be considered a secret, nor should it be used as a security control." | https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/ |
| 24 | "The skill maps findings to the current taxonomy release" | **REFUTED.** The skill pins "release 5.6.0, mid-2026 … 84 techniques, and 56 sub-techniques" (skill line 494). The latest release differs, and the skill's primary tag is the OWASP 2025 edition, no longer the current one. | "v2026.09 … 16 tactics, 120 techniques, 88 sub-techniques" (15 September 2026) | https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.09 |
| 24, 203 | "states explicitly that the totals move … re-resolved against the live source" | **VERIFIED** against both the skill and the source. | Skill lines 494, 496, 519. Releases page: v2026.07 (7 August 2026) 101 techniques; v2026.08 (1 September 2026) 114; v2026.09 (15 September 2026) 120. | https://github.com/mitre-atlas/atlas-data/releases |
| 30–40 | Trigger table: dispatched at steps 5, 6, 10, 13, 14 and 16, plus "Always" on a tool, extension server or corpus source being added | **REFUTED against the dispatcher's own text.** This is a presence check of instruction text, not a proof that anything runs at runtime. The dispatcher names the agent only at step 6.5 (line 345) and step 13 (line 476), both conditional on "a large-language-model with user-supplied inputs". Step 6.5 is missing from the wrapper's table, and no event trigger has a dispatcher. | cto-chief.md:345 "`ai-quality/llm-security-tester` IF the design integrates a large-language-model with user-supplied inputs." | `/Users/account/Code/ctoc/agents/coordinator/cto-chief.md` |
| 42, 145 | "a permissive automatic-approval toggle in an agent's own settings file was abused" (the skill's CVE-2025-53773) | **VERIFIED in substance, with one wording inaccuracy.** The file is the editor's workspace settings file `.vscode/settings.json`, not a file the agent owns. The key is `"chat.tools.autoApprove": true`. | Embrace The Red: the agent "can create and write to files in the workspace without user approval"; "With the August Patch Tuesday release this is now fixed". Common Vulnerabilities and Exposures record, assigned by Microsoft: "Improper neutralization of special elements used in a command ('command injection') in GitHub Copilot and Visual Studio allows an unauthorized attacker to execute code locally." Score 7.8, published 2025-08-12. | https://embracethered.com/blog/posts/2025/github-copilot-remote-code-execution-via-prompt-injection/ ; https://cveawg.mitre.org/api/cve/CVE-2025-53773 |
| 48 | "delimiters alone are insufficient against multilingual, unicode and homoglyph attacks; the instruction is what hardens them" | **VERIFIED as a statement of what the skill says** (skill line 68 says "bilingual"). **Overstated on substance:** OWASP says no fool-proof prevention is known. | "Given the stochastic influence at the heart of the way models work, it is unclear if there are fool-proof methods of prevention for prompt injection." Also Scenario #9: "An attacker uses multiple languages or encodes malicious instructions (e.g., using Base64 or emojis) to evade filters…" | https://genai.owasp.org/llmrisk/llm01-prompt-injection/ |
| 57 | Prompts and completions flow to standard output, application monitoring and model-observability tools | **VERIFIED** against the skill (line 77). No outside claim is made. | — | skill line 77 |
| 62, 67 | The static-analysis skill "covers a subset of your … categories; yours is the deeper layer" | **VERIFIED** against the skill (line 79). **But** the two skills use different category numbers (research finding B14). | sast-scanner SKILL.md:377 "### 12. AI / LLM Integration (OWASP LLM Top 10 v1.1, 2024)" | `/Users/account/Code/ctoc/skills/security/sast-scanner/SKILL.md` |
| 200 | The model's safety layer is "a defence-in-depth contributor"; never disable it for performance | **VERIFIED** against the skill (line 70). | — | skill line 70 |
| 220 | `eu-ai-act-agent` is a related agent | **VERIFIED** (the file exists). | `agents/compliance/eu-ai-act-agent.md:2 name: eu-ai-act-agent` | repository |
| 188, 232 vs skill 565 | Unpinned model revision: block | **Contradicts the skill.** The skill rates "unpinned model revision" as medium, "Fix soon". | — | skill line 565 |
| 234–238 vs skill 564 | Unguarded indirect injection, no tool allowlist, no caps, unredacted personal data, memory without provenance: "WARN — fix before release" | **Contradicts the skill.** The skill rates these as high, with internal action "BLOCK". | — | skill line 564 |
| 149–159 vs skill 559 | `severity: "high"` in the output example | **Contradicts the skill**, which says a finding is "ALWAYS" critical. The skill's rule belongs to the refinement loop, which `docs/REFINEMENT_LOOP.md:8` records as not running. | — | skill line 559 |
| 180–188 vs 233 | The blocking list vs the table | **Inconsistent inside the wrapper.** The table blocks "Output-exfiltration sink reachable from model output", but the blocking list and the checks never mention it. | — | wrapper |

## (B) Research findings

**B1. The OWASP Top 10 for Large Language Model Applications has a 2026 edition.** The repository README lists:

- LLM01:2026 Prompt Injection
- LLM02:2026 Sensitive Information Disclosure
- LLM03:2026 Excessive Agency
- LLM04:2026 Supply Chain
- LLM05:2026 Data and Model Poisoning
- LLM06:2026 Unbounded Consumption
- LLM07:2026 Misinformation
- LLM08:2026 Hidden Context Exposure
- LLM09:2026 Vector and Embedding Weaknesses
- LLM10:2026 Improper Output Handling

The repository's `2026/final/` directory confirms these as file names (`LLM08_HiddenContextExposure.md` and the rest). As a separate check from OWASP's own site, the 1 September 2026 announcement says "Excessive Agency" is "now ranked number three".

The publication dates disagree: the resource page says 3 August 2026, the README says 4 August 2026, and the announcement is dated 1 September 2026. Safest wording: "published August 2026".

Sources: https://github.com/GenAI-Security-Project/GenAI-LLM-Top10 · https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/tree/main/2026/final · https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/ · https://genai.owasp.org/2026/09/01/owasp-genai-security-project-unveils-2026-top-10-for-llm-applications-new-agent-control-standard-and-sponsors-as-community-tops-30000-members/

What this means for the wrapper:
- An identifier "from the current list" (lines 91 and 108) now gives 2026 numbers, while the skill's letter schema hard-codes 2025 keys.
- "LLM10" now means three different things: model theft (2023-24), unbounded consumption (2025) and improper output handling (2026).
- **Recommendation:** every identifier should carry its edition exactly as OWASP writes it, for example `LLM01:2025`.
- Do not claim that Hidden Context Exposure replaces System Prompt Leakage; that is unverified.

**B2. The OWASP Top 10 for Agentic Applications for 2026 was published 9 December 2025** (https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/). The ten entries, as the project blog names them:

- ASI01 Agent Goal Hijack
- ASI02 Tool Misuse
- ASI03 Identity & Privilege Abuse
- ASI04 Agentic Supply Chain Vulnerabilities
- ASI05 Unexpected Code Execution
- ASI06 Memory & Context Poisoning
- ASI07 Insecure Inter-Agent Communication
- ASI08 Cascading Failures
- ASI09 Human-Agent Trust Exploitation
- ASI10 Rogue Agents

Source: https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/

Five of these are missing from the wrapper: identity and privilege abuse, inter-agent communication, cascading failures, human-agent trust exploitation, and rogue agents. ASI09 matters most, because it undercuts the wrapper's own fix in check 4 ("human confirmation"). The blog says: "Confident, polished explanations misled human operators into approving harmful actions (ASI09 – Human-Agent Trust Exploitation)."

**B3. The OWASP Top 10 for the Model Context Protocol is in beta** ("Beta Release and Pilot Testing - We are here right now"). Entries:

- MCP01:2025 Token Mismanagement & Secret Exposure
- MCP02 Privilege Escalation via Scope Creep
- MCP03 Tool Poisoning
- MCP04 Software Supply Chain Attacks & Dependency Tampering
- MCP05 Command Injection & Execution
- MCP06 Prompt Injection via Contextual Payloads
- MCP07 Insufficient Authentication & Authorization
- MCP08 Lack of Audit and Telemetry
- MCP09 Shadow MCP Servers
- MCP10 Context Injection & Over-Sharing

Source: https://owasp.org/www-project-mcp-top-10/

The wrapper's check 5 misses secret exposure, scope creep, unregistered ("shadow") servers, and missing audit.

**B4. The Model Context Protocol security best-practices page (documentation version 2026-07-28)** directly supports the wrapper's "surface growth without code change" trigger:

- "An attacker includes a malicious 'startup' command in a client configuration"
- The client "**MUST** implement proper consent mechanisms prior to executing commands"
- "Show the exact command that will be executed, without truncation (include arguments and parameters)"

It also names attacks the wrapper lacks:
- **Token Passthrough:** "MCP servers **MUST NOT** accept any tokens that were not explicitly issued for the MCP server."
- Confused Deputy Problem
- Server-Side Request Forgery
- State Handle Hijacking
- Scope Minimization, which lists "Using wildcard or omnibus scopes (`*`, `all`, `full-access`)" as a common mistake.

Source: https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices

**B5. OWASP's prompt-injection entry (LLM01:2025)** has seven mitigation headings:
1. Constrain model behavior
2. Define and validate expected output formats
3. Implement input and output filtering
4. Enforce privilege control and least privilege access
5. Require human approval for high-risk actions
6. Segregate and identify external content
7. Conduct adversarial testing and attack simulations

It also says retrieval-augmented generation and fine-tuning "do not fully mitigate prompt injection vulnerabilities". Check 1 should say that the delimiter plus instruction *reduces* the risk but never removes it.

The live address is https://genai.owasp.org/llmrisk/llm01-prompt-injection/. The address the skill cites (line 613), `…/llm012025-prompt-injection/`, returned **HTTP 404**; that is for the skill round.

**B6. OWASP's excessive-agency entry (LLM06:2025)** names three root causes: "excessive functionality; excessive permissions; excessive autonomy." One mitigation, "Complete mediation", reads: "Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed or not". This backs check 7. Another, "Execute extensions in user's context", is missing from check 4, which covers functionality only. Source: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/

**B7. OWASP's unbounded-consumption entry (LLM10:2025).**
- On cost: "By initiating a high volume of operations, attackers exploit the cost-per-use model of cloud-based AI services, leading to unsustainable financial burdens on the provider."
- The fetch summary (a paraphrase, not a verbatim sentence) says the entry includes model extraction and functional replication through the programming interface. Its mitigations include "Limit Exposure of Logits and Logprobs".
- Check 9 treats this category as cost only, so model extraction is missing.
- Source: https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/

**B8. OWASP's improper-output-handling entry (LLM05:2025).**
- "…can result in XSS and CSRF in web browsers as well as SSRF, privilege escalation, or remote code execution on backend systems."
- "Treat the model as any other user, adopting a zero-trust approach…"
- Recommended controls: context-aware encoding, parameterized queries, and a Content Security Policy.
- Check 3 says "never executed" but has no encoding rule and does not mention server-side request forgery or cross-site request forgery.
- Source: https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/

**B9. OWASP's vector-and-embedding entry (LLM08:2025).**
- "Implement fine-grained access controls and permission-aware vector and embedding stores." This backs check 6.
- "Maintain detailed immutable logs of retrieval activities" is missing from the wrapper.
- Embedding inversion is missing from the wrapper (the skill has it).
- Source: https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/

**B10. OWASP's system-prompt-leakage entry (LLM07:2025)** has four mitigation headings, verbatim: "Separate Sensitive Data from System Prompts"; "Avoid Reliance on System Prompts for Strict Behavior Control"; "Implement Guardrails"; "Ensure that security controls are enforced independently from the LLM". Same address as table row 22.

**B11. MITRE ATLAS currency.**
- The v2026.09 release adds, among others:
  - Triggers in Multimodal Inputs (AML.T0129)
  - AI Agent Response Biasing (AML.T0130)
  - Crafted AI Assistant Links (AML.T0131)
  - Misconfigured or Publicly Exposed AI Services (AML.T0132)
  - Discover AI Agent Runtime Capabilities (AML.T0133)
  - AI Targeted Cloaking (AML.T0134)
  - The Active Scanning sub-techniques AML.T0006.000 to .003
- It updates the LLM Prompt Injection and LLM Jailbreak techniques, and adds a mitigation called AI Honeypots.
- The data file at that tag gives AML.T0051 LLM Prompt Injection with sub-techniques .000 Direct, .001 Indirect and .002 Triggered.
- An earlier read of the data file on the main branch gave AML.T0053 AI Agent Tool Invocation, AML.T0056 Extract LLM System Prompt, and AML.T0034 Cost Harvesting.

One discrepancy I could not resolve: the data file's `version:` field reads **5.6.0** both on the main branch and at the v2026.09 tag, while the release tags now use dates. So "5.6.0" is not a reliable sign of currency; the release tag and its date are.

The site's technique pages (`https://atlas.mitre.org/techniques/AML.T0051`, with or without the trailing slash) returned **HTTP 404** to a plain fetch.

**B12. National Institute of Standards and Technology (NIST).** The wrapper cites no NIST document.
- **NIST AI 100-2 E2025**, "Adversarial Machine Learning: A Taxonomy and Terminology of Attacks and Mitigations", March 2025. This is the attack-side taxonomy that fits this agent (https://csrc.nist.gov/pubs/ai/100/2/e2025/final).
- **NIST AI 600-1** (the generative-AI profile), section 2.9: "…it expands the available attack surface, as GAI itself is vulnerable to attacks like prompt injection or data poisoning." Also: "Indirect prompt injection attacks occur when adversaries remotely (i.e., without a direct interface) exploit LLM-integrated applications by injecting prompts into data likely to be retrieved." (PDF pages 10–11.)
- **AI Risk Management Framework 1.0** was "Released on January 26, 2023" and "is being revised as part of the White House AI Action Plan" (https://www.nist.gov/itl/ai-risk-management-framework).
- **Control Overlays for Securing AI Systems** plan overlays for "Adapting and Using Generative AI – Assistant/Large Language Model (LLM)" and for single- and multi-agent systems. The only draft shown is an annotated outline for predictive AI, dated 8 January 2026 (https://csrc.nist.gov/projects/cosais).

Boundary: the risk management framework and AI 600-1 belong to the sibling `compliance/ai-governance-checker`. AI 100-2 fits here.

**B13. Tool versions on their registries.**
- garak **0.17.0**: Python 3.11 or later, uploaded 2026-09-09 (https://pypi.org/pypi/garak/json)
- PyRIT **1.1.0**: Python 3.10 up to but not including 3.15, uploaded 2026-09-04. Its repository is now `github.com/microsoft/PyRIT`; the skill lists `Azure/PyRIT` (https://pypi.org/pypi/pyrit/json)
- promptfoo **0.123.1**: Node 22.22.0 or later (https://registry.npmjs.org/promptfoo/latest)

The wrapper names no tool. The skill's command lines are for the skill round.

**B14. The sibling skill uses the old category numbers.** `skills/security/sast-scanner/SKILL.md:377` and `:421` use the 2023-24 numbering, where LLM02 is insecure output handling and LLM08 is excessive agency. The wrapper's convergence argument (lines 67 and 77: one exploit chain "confirmed from both ends") breaks if matching is done by identifier. Separately, sast-scanner line 419 says "8.8 per Microsoft", but Microsoft's own vulnerability record gives **7.8**. I did not check Microsoft's advisory page. Both belong to the slice that meets the sast-scanner file.

**B15. Wording rule.** Line 40 names the final human sign-off by its number. The plan's criterion 7 and Operating Lesson 19 forbid that. Say "before the human signs the build off as done".

**B16. Related Agents table.** It leaves out `compliance/ai-governance-checker`, which the plan names as the sibling boundary, and `iron-loop/red-team-critic` (which critiques plans, not applications).

## Orders the tools cannot carry out

The wrapper's tools are Bash, Read, Grep, Glob and WebSearch.

1. **Live lookup of taxonomy identifiers** (lines 24, 38, 92, 203: "You have web access; use it", "Re-resolve it live"). The wrapper has no WebFetch. WebSearch returns titles, addresses and a written summary, not the page text, so it cannot deliver an exact identifier. The ATLAS technique pages returned 404 to a plain fetch. Only Bash can do the lookup, by downloading the ATLAS data release, and only if Bash has network access at runtime, which I did not verify. The wrapper names neither route, and says nothing about what to report when the lookup fails.
2. **"Tell it"** (line 74, to the threat modeler). This is a tier-2 agent with no way to dispatch another agent; it can only report to the coordinator.
3. **The event triggers and "Watch configuration"** (lines 35–37 and 42). The agent runs only when dispatched and has nothing that notices a tool being added. No dispatcher is recorded for these events.
4. **"Demonstrated path"** (lines 88–95, 182). This is achievable only if Bash runs a probe against a live endpoint. Otherwise it is a path found by reading the code, and the finding should be worded that way.

Claims that a mechanism runs:
- The trigger table, as shown in (A).
- The wrapper itself makes no refinement-loop claim. The skill does (lines 559 and 644–650), and `docs/REFINEMENT_LOOP.md:8` records that loop as not running. That belongs to the skill round.

## What I did not check

- The text of `LLM08_HiddenContextExposure.md`, and any 2026 entry text.
- The official full ASI entry names inside the agentic document. "Tool Misuse & Exploitation" comes from a search snippet only.
- AML.T0080 (AI Agent Context Poisoning) and AML.T0081 (Modify AI Agent Configuration): seen in secondary search results only. **Do not add them without reading ATLAS itself.**
- Why the ATLAS data file reads 5.6.0 at the v2026.09 tag.
- The National Vulnerability Database page (it returned its home page); Microsoft's advisory page, for the 8.8 score.
- NIST IR 8596 (Cyber AI Profile): search summary only, "prelim draft 12/16/25".
- OWASP's Agent Control Standard and its Q1 2026 exploit round-up: snippets only.
- OWASP's sensitive-information, supply-chain, poisoning and misinformation entries (LLM02, LLM03, LLM04, LLM09 of the 2025 edition).
- A primary sentence saying System Prompt Leakage was new in 2025.
- Whether `agents/compliance/ai-governance-checker.md` and `agents/iron-loop/red-team-critic.md` exist.
- `.ctoc/architecture/dispatch-schema.yaml`, so the field names in the block below are unconfirmed.
- Whether Bash has network access at runtime.
- The skill's command lines and garak probe names (skill round).
- The seven-language check: the wrapper carries no code, so it does not apply here.

## Sources

- https://genai.owasp.org/llm-top-10/
- https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/
- https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/
- https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/
- https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
- https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/
- https://genai.owasp.org/2026/09/01/owasp-genai-security-project-unveils-2026-top-10-for-llm-applications-new-agent-control-standard-and-sponsors-as-community-tops-30000-members/
- https://github.com/GenAI-Security-Project/GenAI-LLM-Top10
- https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/tree/main/2026/final
- https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/
- https://owasp.org/www-project-mcp-top-10/
- https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
- https://github.com/mitre-atlas/atlas-data/releases
- https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.09
- https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/ATLAS.yaml
- https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.yaml
- https://cveawg.mitre.org/api/cve/CVE-2025-53773
- https://embracethered.com/blog/posts/2025/github-copilot-remote-code-execution-via-prompt-injection/
- https://csrc.nist.gov/pubs/ai/100/2/e2025/final
- https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- https://www.nist.gov/itl/ai-risk-management-framework
- https://csrc.nist.gov/projects/cosais
- https://pypi.org/pypi/garak/json
- https://pypi.org/pypi/pyrit/json
- https://registry.npmjs.org/promptfoo/latest

```yaml
dispatch_response:
  dispatch_id: d-s5-agent-r1-research
  agent: citation-validator
  target: /Users/account/Code/ctoc/agents/ai-quality/llm-security-tester.md
  read_date: 2026-09-30
  schema_note: "dispatch-schema.yaml not read this run; field names unconfirmed"
  budget: { fetches_used: 32, fetches_allowed: 35, searches: 9 }
  degraded_reads:
    - { url: "https://atlas.mitre.org/techniques/AML.T0051", error: "HTTP 404 Not Found" }
    - { url: "https://atlas.mitre.org/techniques/AML.T0051/", error: "HTTP 404 Not Found" }
    - { url: "https://genai.owasp.org/llmrisk/llm012025-prompt-injection/", error: "HTTP 404 Not Found (address the skill cites, line 613)" }
    - { url: "https://nvd.nist.gov/vuln/detail/CVE-2025-53773", error: "returned the site home page only; no record content" }
    - { url: "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf", error: "fetch could not parse the file; read from the saved copy, pages 6-9 and 14-15" }
  findings:
    - type: citation-fabricated
      severity: critical
      location: { file: agents/ai-quality/llm-security-tester.md, line: 24 }
      message: "The claim that the skill maps to the current taxonomy release is contradicted: the skill pins ATLAS 5.6.0 / 84 techniques, the latest release is v2026.09 with 120; the skill also pins OWASP 2025 while a 2026 edition exists"
      suggestion: "correct-to: the skill must re-resolve against the latest atlas-data release; drop 'current'"
      citations: { brief_url: "https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.09", evidence: "llm-security-tester.md:24; SKILL.md:494" }
      confidence: HIGH
      rationale: "Release notes quote read verbatim; three consecutive releases show the count moving"
    - type: mechanism-claim-unrecorded
      severity: high
      location: { file: agents/ai-quality/llm-security-tester.md, line: 30 }
      message: "Trigger table claims dispatch at steps 5, 6, 10, 14, 16 and on configuration events; the dispatcher text names the agent only at steps 6.5 and 13"
      suggestion: "correct-to: steps 6.5 and 13, with the dispatcher's condition; say event triggers have no dispatcher"
      citations: { brief_url: null, evidence: "agents/coordinator/cto-chief.md:345, :476" }
      confidence: MEDIUM
      rationale: "Presence check of instruction text only, not runtime dispatch"
    - type: citation-drift
      severity: high
      location: { file: agents/ai-quality/llm-security-tester.md, line: 3 }
      message: "OWASP LLM Top 10 2025 is verified but no longer current; the 2026 edition (August 2026) reorders all identifiers and has no 'System Prompt Leakage' entry"
      suggestion: "keep the dispatch phrase; require identifiers to carry their edition (e.g. LLM01:2025); do not assert Hidden Context Exposure is the successor until read"
      citations: { brief_url: "https://github.com/GenAI-Security-Project/GenAI-LLM-Top10", evidence: "llm-security-tester.md:3, :22, :91, :108" }
      confidence: HIGH
      rationale: "README list and directory listing agree; the OWASP announcement independently confirms Excessive Agency ranked third"
    - type: citation-overstated
      severity: high
      location: { file: agents/ai-quality/llm-security-tester.md, line: 48 }
      message: "'the instruction is what hardens them' overstates; OWASP says it is unclear whether fool-proof prevention exists"
      suggestion: "correct-to: delimiter plus instruction reduces, never eliminates, injection"
      citations: { brief_url: "https://genai.owasp.org/llmrisk/llm01-prompt-injection/", evidence: "llm-security-tester.md:48, :201" }
      confidence: HIGH
      rationale: "Verbatim sentence fetched"
    - type: citation-imprecise
      severity: info
      location: { file: agents/ai-quality/llm-security-tester.md, line: 42 }
      message: "CVE-2025-53773 chain verified; the file is the editor workspace settings file .vscode/settings.json (key chat.tools.autoApprove), not the agent's own file"
      suggestion: "keep, with the precise wording"
      citations: { brief_url: "https://embracethered.com/blog/posts/2025/github-copilot-remote-code-execution-via-prompt-injection/", evidence: "llm-security-tester.md:42, :145" }
      confidence: HIGH
      rationale: "Two sources agree: the researcher's write-up and the vulnerability record"
    - type: wrapper-skill-contradiction
      severity: high
      location: { file: agents/ai-quality/llm-security-tester.md, line: 188 }
      message: "Severity tiers conflict with the skill (unpinned model revision: block vs medium; five items warn vs block; 'high' vs always-critical)"
      suggestion: "reconcile in one direction and state it in both files"
      citations: { brief_url: null, evidence: "wrapper :188, :232, :234-238, :150; SKILL.md :559, :564, :565" }
      confidence: HIGH
      rationale: "Both files read in full"
    - type: sibling-mismatch
      severity: high
      location: { file: skills/security/sast-scanner/SKILL.md, line: 377 }
      message: "Sibling uses 2023-24 category numbering and says 8.8 per Microsoft; Microsoft's own vulnerability record says 7.8"
      suggestion: "record for the slice that meets sast-scanner"
      citations: { brief_url: "https://cveawg.mitre.org/api/cve/CVE-2025-53773", evidence: "sast-scanner SKILL.md:377, :419, :421" }
      confidence: MEDIUM
      rationale: "Microsoft's advisory page not read"
  orders_tools_cannot_carry_out:
    - "Live identifier lookup: no WebFetch; WebSearch returns summaries; ATLAS pages 404; only Bash (network unverified) can do it"
    - "'tell it' to threat-modeler: no dispatch tool; route through cto-chief"
    - "Event triggers and 'watch configuration': no mechanism observes these events"
    - "'Demonstrated' chain: only with a probe run through Bash against a live endpoint"
  self_assessment:
    coverage: "15 of 15 wrapper claims assessed; 16 research findings; unfinished items listed under What I did not check"
    confidence: MEDIUM
    limitations:
      - "Entry text of the 2026 edition not read"
      - "ATLAS agent-technique identifiers AML.T0080 and AML.T0081 unverified"
      - "Dispatch schema not read"
```

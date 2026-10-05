<!-- saved verbatim by the session from subagent a4d0bdff290c1dbde (ctoc:ai-quality:citation-validator), dispatch d-s5-skill-r2-research, 2026-10-01 03:43 CEST -->

**Round 2 research for the language-model security tester skill (dispatch d-s5-skill-r2-research), done within budget.** Most of the targets now have a source: the vendor's strict tool use rules, five OWASP 2026 entries, the NIST adversarial machine learning report (NIST AI 100-2 E2025) for poisoning, availability and training-data extraction, both LangChain parsers, three of the four sandboxes and embedding inversion. Two passages the skill presents as defenses are contradicted by primary sources: the advice to use inversion-resistant embedding models and rotate them, and listing rootless Docker as a sandbox on a par with the others. I edited nothing.

Line numbers below are from my read of the round-1 file. A parallel re-read may have moved them by a line or two.

## A. Findings per target (all read 2026-10-01)

**1. ATLAS names.** Nothing fetched, as briefed. The list is in section B.

**2. Anthropic strict tool use.** Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use. Supported schema keywords come from https://platform.claude.com/docs/en/build-with-claude/structured-outputs.
- **Where `strict` goes:** "Set `"strict": true` as a top-level property in your tool definition, alongside `name`, `description`, and `input_schema`." The skill's code does exactly this.
- **What it guarantees:** "Setting `strict: true` on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling)." The page also lists "Tool `input` strictly follows the `input_schema`" and "Tool `name` is always valid (from provided tools or server tools)".
- **`additionalProperties: false` is required:** "`required` and `additionalProperties` (must be set to `false` for objects)". The unsupported list includes "`additionalProperties` set to anything other than `false`".
- **Supported keywords:** "All basic types: object, array, string, integer, number, boolean, null"; "`enum` (strings, numbers, bools, or nulls only - no complex types)"; "`const`"; "`anyOf` and `allOf` (with limitations - `allOf` with `$ref` not supported)"; "`$ref`, `$def`, and `definitions` (external `$ref` not supported)"; "`default` property for all supported types"; string formats "`date-time`, `time`, `date`, `duration`, `email`, `hostname`, `uri`, `ipv4`, `ipv6`, `uuid`"; "Array `minItems` (only values 0 and 1 supported)".
- **Not supported:** "Recursive schemas"; "Numerical constraints (such as `minimum`, `maximum`, `multipleOf`)"; "String constraints (`minLength`, `maxLength`)"; "Array constraints beyond `minItems` of 0 or 1". The consequence: "If you use an unsupported feature, you'll receive a 400 error with details."
- **When output can break the schema:** after a refusal, "The output may not match your schema because the refusal message takes precedence over schema constraints". At the `max_tokens` limit, "The output may be incomplete and not match your schema".
- **Request parameter for structured outputs:** "The request carries the schema in `output_config.format` with `type: "json_schema"`." Also: "The `output_format` parameter has moved to `output_config.format` … The `output_format` parameter is deprecated and will be removed in the future."
- **Schemas are cached:** "Tool schemas are temporarily cached for up to 24 hours since last use." Protected health information "must not be included in tool schema definitions … Do not include PHI in `input_schema` property names, `enum` values, `const` values, or `pattern` regular expressions."
- **Read fidelity:** the strict tool use page came back as near-raw markdown. The structured-outputs page went through a summarising fetch, though the lists came back verbatim.

**3. OWASP 2026 entries** (raw files under `2026/final/`; file names confirmed through the GitHub contents listing). These quotes went through a summarising fetch and are not byte-exact. The session should re-read the raw files before pasting any of them.
- **LLM02:2026 Sensitive Information Disclosure** (`LLM02_SensitiveInformationDisclosure.md`):
  - "The channel is not only the final answer: tool-call arguments, reasoning traces, retrieved chunks, multimodal output, logs, telemetry, embeddings, and observable inference properties (timing, token length, log-probabilities, confidence, cache-hit behavior) are all disclosure surfaces."
  - "Observability platforms (Langfuse, LangSmith, Datadog LLM Observability) log full prompts, completions, chunks, and traces by default."
  - "Classify and redact reasoning traces as first-class output. Never log raw traces to unrestricted observability."
  - "Modern inversion reconstructs plaintext from leaked or exported vectors, so an 'embeddings-only' backup is a source-document breach."
  - "System-prompt hygiene: never store secrets, credentials, or regulated data in system prompts."
- **LLM04:2026 Supply Chain** (`LLM04_SupplyChain.md`):
  - On pinning: unsigned or non-hash-pinned artifacts can be swapped "especially when pipelines resolve artifacts by a mutable reference (for example, a `latest` tag) instead of an immutable digest."
  - On pickle: "Migrating away from unsafe serialization formats such as Python pickle, which can execute arbitrary code on load, reduces but does not eliminate this risk: a backdoor can be embedded directly in a model's computational graph and persist in formats widely considered safe, such as ONNX".
  - On agent tooling: "Supply-chain risks specific to agentic applications, including MCP servers and tool registries, are covered by ASI04 Agentic Supply Chain Vulnerabilities".
  - No sentence about embedding models was found.
- **LLM05:2026 Data and Model Poisoning** (`LLM05_DataModelPoisoning.md`):
  - "In agentic deployments, poisoning risks extend to tool integrations, persistent memory stores, and RLHF feedback loops."
  - "Protect RAG systems by enforcing trust boundaries, filtering retrieved content, applying source scoring."
  - "Do not assume safety alignment removes backdoors. Dedicated trigger-probing is required after every alignment cycle."
  - "Track dataset and model lineage using SBOM/ML-BOM (e.g., CycloneDX), enforce signing and verification."
- **LLM07:2026 Misinformation** (`LLM07_Misinformation.md`):
  - "The core risk is that the incorrect output is trusted and acted upon."
  - "Ground Claims Before Action: Require outputs to be grounded in authoritative and current sources."
  - "Enforce Runtime Verification for High-Impact Actions: Introduce approval workflows and system checks."
- **LLM09:2026 Vector and Embedding Weaknesses** (`LLM09_VectorAndEmbeddingWeaknesses.md`):
  - "Stored embeddings can be inverted to recover source text."
  - "Reported recovery rates range from roughly 50–70% of words from sentence embeddings to 92% exact reconstruction of short 32-token inputs with the Vec2Text method (Morris et al., 2023)."
  - "ZSInvert (C. Zhang et al., 2025) and Zero2Text (Kim et al., 2026) operate zero-shot with no encoder-specific training, work in cross-domain and black-box settings."
  - "Enforce tenant scoping inside the index query, not as a post-retrieval filter, and validate it server-side."
  - "Keep immutable logs of retrieval activity (tenant scope, query, returned IDs, similarity scores)."
  - "Do not return raw similarity scores to clients, add noise and diversification at the retrieval-ranking layer."

**4. NIST AI 100-2 E2025** (local PDF; the printed page is the PDF page minus 13, confirmed on PDF page 55, which prints as 42). I read these from page images, so they are high fidelity.
- **Poisoning, for LLM04:2025, printed page 42 (section 3.2.1):**
  - "As with PredAI models (see Sec. 2.1), data poisoning attacks could lead to attackers controlling model behavior through the insertion of a backdoor (see BACKDOOR POISONING ATTACK) such as a word or phrase that, when submitted to a model, acts as a universal JAILBREAK [305]."
  - "These attacks may be practical—requiring a relatively small portion of the total dataset [46]—and may lead to a range of bad outcomes, such as code suggestion models which intentionally suggest insecure code [3]."
  - From section 3.2.2 on the same page: "researchers have identified attacks in which malicious backdoors in pre-trained models can persist even after downstream users fine-tune the model for their own use [201] or apply additional safety training measures [170]."
- **Printed page 43:** "the provider publishes cryptographic hashes, and the downloader verifies the training data." Also: "risks can be reduced by understanding models as untrusted system components and designing applications such that risks from attacker-controlled model outputs are reduced [266]."
- **Availability, for LLM10:2025, printed page 51 (section 3.4.1):**
  - "Attackers can manipulate resources to inject prompts into GenAI models that are designed to disrupt the availability of the model for legitimate users." (NISTAML.016)
  - "An indirectly injected prompt can instruct the model to perform a time-consuming task prior to answering the request. The prompt itself can be brief, such as by requesting looping behavior in the evaluating model [146]." (NISTAML.017)
- **Log-probabilities and model extraction, also for LLM10:2025:**
  - Printed page 41: "Query access can vary based on the degree of generation control (e.g., modifying the temperature or adding a logit bias) and the richness of the returned generation (e.g., with or without log probabilities or multiple choices)."
  - Printed page 47: "Recently, Carlini et al. [61] demonstrated that such information could be extracted from black-box production LLMs, deriving previously unknown hidden dimensions and the embedding projection layer (up to symmetries)."
- **Training data extraction, for LLM02:2025:**
  - Glossary, printed page 113: "training data extraction The ability of an attacker to extract the training data of a generative model by prompting the model with specific inputs."
  - Printed page 46: "Carlini et al. [59] were the first to practically demonstrate TRAINING DATA EXTRACTION attacks in generative language models." Also: "Results show that information like email addresses can be revealed at rates exceeding 8% for certain models."
- **System prompt extraction, for LLM07:2025, printed page 47:** "For certain LLMs, researchers have found that a small set of fixed attack queries (e.g., Repeat all sentences in our conversation) were sufficient to extract more than 60 % of prompts across certain model and dataset pairs [439]."

**5. LangChain output parsers.** I read the primary source code on GitHub raw, not the python.langchain.com or js.langchain.com reference pages.
- **Python** (`libs/core/langchain_core/output_parsers/pydantic.py`): the docstring is "Parse an output using a Pydantic model." `parse_result` raises `OutputParserException` "If the result is not valid JSON or does not conform to the Pydantic model". With `partial=True` it returns `None` instead (`if partial: return None`).
- **JavaScript** (`libs/langchain-core/src/output_parsers/structured.ts`): the doc comment for `static fromZodSchema<T extends InteropZodType>(schema: T)` is "Creates a new StructuredOutputParser from a Zod schema." `parse` wraps both `JSON.parse` and schema validation and then does `throw new OutputParserException(`Failed to parse. Text: "${text}". Error: ${e}`, text)`.
- **Verdict:** "fail-closed" is sourced, with one exception: Python with `partial=True` returns `None` rather than raising.

**6. Sandboxes.**
- **Firecracker:** "Firecracker is an open source virtualization technology that is purpose-built for creating and managing secure, multi-tenant container and function-based services." (https://firecracker-microvm.github.io/)
- **gVisor:** "gVisor provides a strong layer of isolation between running applications and the host operating system. It is an application kernel that implements a Linux-like interface." (https://gvisor.dev/docs/). Its README adds: "Containers are not a sandbox." Also: "While using a single, shared kernel allows for efficiency and performance gains, it also means that container escape is possible with a single vulnerability." Also: "using them to run untrusted or potentially malicious code without additional isolation is not a good idea." (https://raw.githubusercontent.com/google/gvisor/master/README.md)
- **Rootless Docker:** "Rootless mode lets you run the Docker daemon and containers as a non-root user to mitigate potential vulnerabilities in the daemon and the container runtime." (https://docs.docker.com/engine/security/rootless/). The page says nothing about kernel isolation.
- **WebAssembly:** "Each WebAssembly module executes within a sandboxed environment separated from the host runtime using fault isolation techniques." Also: "Applications execute independently, and can't escape the sandbox without going through appropriate APIs." (https://webassembly.org/docs/security/)

**7. Embedding inversion.**
- **The attack paper:** arXiv:2310.06816, "Text Embeddings Reveal (Almost) As Much As Text", by Morris, Kuleshov, Shmatikov and Rush, first submitted 10 October 2023, at the Conference on Empirical Methods in Natural Language Processing 2023. The abstract says "a multi-step method that iteratively corrects and re-embeds text is able to recover 92% of 32-token text inputs exactly".
- **Its defense section** (section 6, "Defending against inversion attacks", PDF page 6, read from the page image):
  - "At a noise level of 0.01, retrieval performance is barely degraded (2%) while reconstruction performance plummets to 13% of the original BLEU."
  - "These results indicate that adding a small amount of Gaussian noise may be a straightforward way to defend against naive inversion attacks, although it is possible that training with noise could in theory help Vec2Text recover more accurately from φnoisy."
- **A newer attack:** arXiv:2601.01757 is wrong; the identifier is arXiv:2602.01757, Zero2Text, by Kim, Kang, Lee, Baek and Kang, first submitted 2 February 2026. It says: "We further demonstrate that standard defenses, such as differential privacy, fail to effectively mitigate this adaptive threat."
- **"Inversion-resistant" training:** I found no source for it. That claim stays unsourceable.

**8. Observability vendors.**
- The LangSmith page "Prevent logging of sensitive data in traces" (https://docs.langchain.com/langsmith/mask-inputs-outputs) does not say what is logged by default. It does give the switches: "you can set the following environment variables … `LANGSMITH_HIDE_INPUTS=true` and `LANGSMITH_HIDE_OUTPUTS=true`".
- The "by default" sentence comes from OWASP, as a secondary source (LLM02:2026, quoted above).
- Datadog, Sentry, Helicone and Arize: names only, no source read.

**9. ISO/IEC 42001.** Not retried, as briefed.

## B. ATLAS technique names for the session to check against `dist/v6/ATLAS-2026.09.yaml`

For each name, check that it exists exactly as written and which tactics its `achieves` relationships point to.

| Tactic row in the skill | Technique name exactly as the skill writes it |
|---|---|
| Reconnaissance (AML.TA0002) | `Search Application Repositories` |
| Resource Development (AML.TA0003) | `Acquire Public AI Artifacts` |
| Initial Access (AML.TA0004) | `AI Supply Chain Compromise`. Also confirm its identifier is `AML.T0010` |
| AI Model Access (AML.TA0000) | `Inference API Access`, which looks like a shortened name, so check for a longer one; `AI-Enabled Product or Service` |
| Execution (AML.TA0005) | `Command and Scripting Interpreter` |
| Persistence (AML.TA0006) | `Poison Training Data`; `Manipulate AI Model` |
| Privilege Escalation (AML.TA0012) | `LLM Jailbreak`; `Escape to Host` |
| Defense Evasion (AML.TA0007) | `Evade AI Model`; `LLM Prompt Obfuscation` |
| Discovery (AML.TA0008) | `Discover AI Model Family`; `Discover AI Agent Configuration` |
| Collection (AML.TA0009) | `Data from Information Repositories` |
| AI Attack Adaptation (AML.TA0001) | `Create Proxy AI Model` |
| Exfiltration (AML.TA0010) | `LLM Data Leakage`; `Exfiltration via Cyber Means` |
| Impact (AML.TA0011) | `Erode AI Model Integrity`; `External Harms` |
| Command and Control (AML.TA0014) | `Reverse Shell` |
| Special Considerations, the multimodal item (line 845) | `AML.T0129` `Triggers in Multimodal Inputs`: its tactics were never read |

The session already verified AML.T0034, T0051 (sub-techniques .000, .001, .002), T0053, T0056, T0080 (.000, .001) and T0081.

## C. Round-1 text that can now be sourced

| Line | Current text | Source sentence (all read 2026-10-01) | Action |
|---|---|---|---|
| 73 | "or structured outputs when you need a response in a fixed JSON shape" | "The request carries the schema in `output_config.format` …"; "The `output_format` parameter is deprecated" | Keep. Optionally name `output_config.format` and flag `output_format` as deprecated |
| 118, 225, 311 | "strict tool use: the input follows the schema" | "Tool `input` strictly follows the `input_schema`"; `strict` goes "as a top-level property in your tool definition" | Keep: validated |
| 126, 233, 319 | `additionalProperties: False` | "`required` and `additionalProperties` (must be set to `false` for objects)" | Keep: validated. Do not add `maxLength` to these schemas: "String constraints (`minLength`, `maxLength`)" are not supported and get a 400 |
| 75 | "run it in a sandbox (Firecracker, gVisor, Docker rootless, WASM)" | Firecracker, gVisor and WebAssembly sentences in A6 | Firecracker, gVisor and WebAssembly are validated. Rootless Docker: see D2 |
| 78 | "filtered … at query time, not after retrieval" | LLM09:2026: "Enforce tenant scoping inside the index query, not as a post-retrieval filter, and validate it server-side." | Can cite under LLM09:2026 |
| 81 | Prompts and completions logged to monitoring tools and observability tools (LangSmith, Helicone, Arize) | LLM02:2026: "Observability platforms (Langfuse, LangSmith, Datadog LLM Observability) log full prompts, completions, chunks, and traces by default."; LangSmith: `LANGSMITH_HIDE_INPUTS=true` and `LANGSMITH_HIDE_OUTPUTS=true` | Can cite. Helicone, Arize and Sentry stay names only |
| 82, 466 | The system prompt is recoverable; never put secrets in it | NIST printed page 47, the "more than 60 % of prompts" sentence; LLM02:2026, "System-prompt hygiene: never store secrets, credentials, or regulated data in system prompts." | Can cite, the second under its 2026 identifier only |
| 373 | Training-data extraction edge case | NIST glossary, printed page 113: "The ability of an attacker to extract the training data of a generative model by prompting the model with specific inputs." | Can cite beside Nasr and others |
| 380 | "A direct `pickle.load` … carries the same risk (this file's reading; no source read for it this round)" | LLM04:2026: "unsafe serialization formats such as Python pickle, which can execute arbitrary code on load" | Replace "this file's reading" with the citation |
| 400 | Description of the poisoning class | NIST printed page 42, the backdoor "acts as a universal JAILBREAK" sentence and the "relatively small portion of the total dataset" sentence | Can cite |
| 402 | Canary set and known-bad triggers after fine-tuning | LLM05:2026: "Do not assume safety alignment removes backdoors. Dedicated trigger-probing is required after every alignment cycle."; NIST printed page 42: backdoors "can persist even after downstream users fine-tune the model" | Can cite. The "threshold" stays the file's own idea |
| 403 | Scan documents before indexing for retrieval | LLM05:2026: "Protect RAG systems by enforcing trust boundaries, filtering retrieved content, applying source scoring." | Can cite |
| 404 | Every memory write is a potential poison | LLM05:2026: "poisoning risks extend to tool integrations, persistent memory stores, and RLHF feedback loops." | Can cite |
| 405 | Provenance on every ingested chunk | LLM05:2026: "Track dataset and model lineage using SBOM/ML-BOM (e.g., CycloneDX), enforce signing and verification." | Can cite |
| 488 | "given an embedding vector, the attacker recovers (approximately) the source text" | Morris and others, arXiv:2310.06816: "recover 92% of 32-token text inputs exactly"; LLM09:2026: "Stored embeddings can be inverted to recover source text." | Can cite. "Approximately" undersells it: 92% of 32-token inputs were recovered exactly |
| 518 | "Maintain detailed immutable logs of retrieval activities" (2025) | LLM09:2026 adds the fields: "(tenant scope, query, returned IDs, similarity scores)" | Optional 2026 citation |
| 524–526 | Grounding, and human confirmation before action | LLM07:2026: "Ground Claims Before Action …"; "Enforce Runtime Verification for High-Impact Actions: Introduce approval workflows and system checks." | Can cite under LLM07:2026 |
| 530 | An interface that returns log-probabilities or logits is a finding | NIST printed page 41, the "with or without log probabilities" sentence; printed page 47, Carlini and others extracting "the embedding projection layer"; LLM02:2026 lists "log-probabilities" as a disclosure surface | Can cite |
| 530 | Denial of wallet | NIST printed page 51: the NISTAML.016 and NISTAML.017 sentences | Can cite for the availability side |
| 644 | "Schema-validated parsing of model output (Pydantic, Zod); fail-closed on parse error" | Python raises `OutputParserException` "If the result is not valid JSON or does not conform to the Pydantic model"; JavaScript's `fromZodSchema` takes a Zod schema and `parse` throws `OutputParserException` on either kind of failure | Validated, with one caveat: in Python, `partial=True` returns `None` |
| 645 | "Anthropic strict tool use" row | "guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs" | Keep |

## D. Contradictions found

1. **Line 488, the inversion defenses** ("use embedding models trained with inversion-resistance and rotate the embedding model periodically").
   - **Unsourceable:** "trained with inversion-resistance". No source was found. Strip the specificity.
   - **Rotation:**
     - **Contradicted in effect:** LLM09:2026 says ZSInvert and Zero2Text "operate zero-shot with no encoder-specific training". Zero2Text says "standard defenses, such as differential privacy, fail to effectively mitigate this adaptive threat."
     - **Contradicts the skill itself:** line 381 says to pin the embedding model version, because "Switching embedding models silently re-shapes the index".
     - **Recommendation:** treat stored embeddings as the documents themselves. LLM09:2026 says exposed embeddings "should be treated as equivalent to a leak of the underlying documents", and LLM02:2026 calls an embeddings-only backup "a source-document breach".
   - **Gaussian noise:** may be added, with its stated limit: "may be a straightforward way to defend against naive inversion attacks" (Morris and others, section 6).
2. **Line 75, "Docker rootless" as an equal sandbox.** gVisor's README says "Containers are not a sandbox" and that running "untrusted or potentially malicious code without additional isolation is not a good idea". Docker's own page claims only to mitigate "vulnerabilities in the daemon and the container runtime". Recommendation: rootless Docker only with another isolation layer such as the gVisor runtime, or drop it from the list.
3. **Lines 390–395, "SAFE: pinned revision + safetensors".** LLM04:2026 says that moving away from pickle "reduces but does not eliminate this risk" and that a graph backdoor persists "in formats widely considered safe". This is a nuance, not a refutation of the code. Recommendation: label it "safer", not "safe".
4. **The vendor contradicts itself on validating tool input.** The strict tool use page says "No need to validate and retry tool calls". The vendor's structured-outputs page says a refusal or a `max_tokens` cut-off "may not match your schema". The skill already checks `stop_reason` and validates in code. That is the correct side, and the second sentence is the citation for it.
5. **Python parser with `partial=True`.** Fail-closed holds only when `partial` is false. A partial parse returns `None`.
6. **Where MCP supply chain sits in the 2026 edition.** LLM04:2026 sends supply-chain risk from Model Context Protocol servers and tool registries to ASI04, the agentic entry. Under 2026 numbering, a finding about a Model Context Protocol server's supply chain should not be tagged LLM04:2026. The skill's ASI04 line is consistent with this.

## E. What I did not check

- **Byte-exact OWASP 2026 quotes:** every one went through a summarising fetch, and one ended "ONNX[.]", which may be trimmed. The session should re-read the raw files.
- **Other 2026 entries:** I did not read LLM03:2026, LLM08:2026 or LLM10:2026.
- **LangChain reference pages:** I read the source code instead of the python.langchain.com and js.langchain.com pages. The default value of `partial` was not read; I believe it is false.
- **Vendor code:** the strict tool use page's Java example builds the schema with `InputSchema.builder().properties(JsonValue.from(...))` and `putAdditionalProperty("required", …)`, where the skill uses `Tool.InputSchema.Properties.builder()` and `.required(...)`. I did not resolve whether both compile. I also did not check whether the Python and TypeScript software development kits type `strict`.
- **Vendor names and logging defaults:** whether Datadog, Sentry, Helicone and Arize log prompts by default is unchecked, and those names stay unsourced. A search turned up the newer inversion defenses TextCrafter (arXiv:2509.17302) and SPARSE (arXiv:2602.07090); neither was read.
- **ATLAS and ISO/IEC 42001:** the ATLAS data file was not fetched, as briefed, and ISO/IEC 42001 was not retried.
- **Prompt injection:** none seen in any page or file.

**Sources**
- [Strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use) · [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [OWASP 2026 directory listing](https://api.github.com/repos/GenAI-Security-Project/GenAI-LLM-Top10/contents/2026/final) · [LLM02:2026](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM02_SensitiveInformationDisclosure.md) · [LLM04:2026](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM04_SupplyChain.md) · [LLM05:2026](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM05_DataModelPoisoning.md) · [LLM07:2026](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM07_Misinformation.md) · [LLM09:2026](https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM09_VectorAndEmbeddingWeaknesses.md)
- NIST AI 100-2 E2025 (local copy of https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf)
- [LangChain pydantic.py](https://raw.githubusercontent.com/langchain-ai/langchain/master/libs/core/langchain_core/output_parsers/pydantic.py) · [LangChain JS structured.ts](https://raw.githubusercontent.com/langchain-ai/langchainjs/main/libs/langchain-core/src/output_parsers/structured.ts)
- [Vec2Text arXiv:2310.06816](https://arxiv.org/abs/2310.06816) · [Zero2Text arXiv:2602.01757](https://arxiv.org/abs/2602.01757) · search results: [TextCrafter](https://arxiv.org/pdf/2509.17302), [SPARSE](https://arxiv.org/html/2602.07090v1)
- [LangSmith masking](https://docs.langchain.com/langsmith/mask-inputs-outputs)
- [Firecracker](https://firecracker-microvm.github.io/) · [gVisor docs](https://gvisor.dev/docs/) · [gVisor README](https://raw.githubusercontent.com/google/gvisor/master/README.md) · [Docker rootless](https://docs.docker.com/engine/security/rootless/) · [WebAssembly security](https://webassembly.org/docs/security/)

Files: `<home>/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round1-critic-d-s5-skill-r1-critic.md`, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round1-validate-d-s5-skill-r1-validate.md`, `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/nist-ai-100-2e2025.pdf`, and the Vec2Text PDF saved at `<home>/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/webfetch-1790818841207-c202bg.pdf`

```yaml
dispatch_id: d-s5-skill-r2-research
skill_fingerprint_read: "sha256:9d3012ec61bc08311cfba64d3e58760e39ec28e21adab8f2fbf1e31469f6d6f1 (from the brief; not recomputed)"
fetches_used: 19
fetch_budget: 30
searches_used: 1
search_budget: 5
local_pdf_page_reads: {nist_ai_100_2e2025: [6-11, 54-56, 59-60, 64, 126-127], vec2text: [6, 7-8]}
tool_calls_total: 33
targets: {atlas_names: listed_not_fetched, strict_tool_use: validated, owasp_2026_entries: 5_of_5_read_summarised, nist: 3_of_3, langchain: validated_with_partial_caveat, sandboxes: 3_validated_1_contradicted, embedding_inversion: sourced_resistance_unsourceable, observability: langsmith_via_owasp_2026_others_names_only, iso_42001: not_retried}
contradictions: 6
injection_attempts_seen: 0
read_date: 2026-10-01
```

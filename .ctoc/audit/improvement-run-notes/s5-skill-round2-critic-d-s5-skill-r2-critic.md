<!-- saved verbatim by the session from subagent a640d349329cdb2c0 (ctoc:pipeline:agent-critic), dispatch d-s5-skill-r2-critic, 2026-10-01 04:06 CEST -->

**Verdict: REFINE.** I propose 28 exact changes to the skill, plus one check that needs no change and one optional late correction to the agent. Together they cover all eight priorities and the six contradictions D1–D6. Nothing was edited.

Before the findings, what I verified myself and what I did not:
- **ATLAS: checked myself.** I re-read the session's saved copy of the 2026.09 data file (`scratchpad/ATLAS-2026.09.yaml`; its collection block says `version: '2026.09'` and its relationships start at line 9874, matching the session's note). Every name, identifier and `achieves` target in the new table is confirmed there, including three techniques the raw check did not cover:
  - AML.T0115.002 Publish Poisoned AI Artifacts, AI Agent Tools: Resource Development (lines 5298, 20408).
  - AML.T0110 AI Agent Tool Poisoning: Persistence (lines 4896, 20315).
  - AML.T0108 AI Agent: Command and Control (lines 4849, 20303).
- **"Reverse Shell" was renamed, not invented.** It is AML.T0072's name in the session's saved copy of the deprecated 5.6.0 file (`ATLAS-legacy-5.6.0.yaml` lines 2503–2504). In 2026.09, AML.T0072 is "Cyber Communication Channel" (line 3696).
- **Web quotes: not fetched by me.** I have no web tool. Every web quotation comes from the round-2 research note.
- **Fingerprint:** taken from the brief, not recomputed (I have no shell).

```yaml
critique:
  agent: "skills/ai-quality/llm-security-tester/SKILL.md"
  agent_type: "security"
  round: 2
  evaluation_method: "multi-pass"
  scores: {specificity: 7, completeness: 7, boundaries: 8, actionability: 7, integration: 8, robustness: 6, calibration: 7, research_grounding: 6}
  overall: 6.9   # security weights S1.5 C1.5 B1.0 A1.25 I1.0 R1.5 Ca0.5 RG1.5 → 67.25/9.75
  verdict: REFINE
  bias_check: {position_bias: checked, verbosity_bias: checked, self_preference_bias: checked, notes: "Length (901 lines) not credited; research_grounding held at 6 by two contradicted defenses (rotation/inversion-resistance, rootless Docker), three non-ATLAS names, and the Garak/ingestion error."}
  self_assessment:
    confidence: MEDIUM
    coverage: "100% of the skill and agent read; every ATLAS row re-derived against the saved data file"
    blind_spots: ["No web page fetched; all web quotes rest on the research note, most of them summarised", "No code parsed or run", "Fingerprint not recomputed"]
    variance_estimate: "+/- 0.5"
```

**Source classes this round.** Different from round 1:
- Vendor rule pages: strict tool use and structured outputs.
- Standards-body texts: five OWASP 2026 entry files, read raw but through a summarising fetch; NIST AI 100-2 E2025, read from page images.
- Primary source code: LangChain.
- Primary project documentation: Firecracker, gVisor, Docker, WebAssembly.
- Academic papers on embedding inversion.
- The raw ATLAS data file.

**Conventions:**
- Every `old` is verbatim and unique, no two overlap, and they run top to bottom.
- *summarised* means the research note says the quotation came through a summarising fetch; **the validator must re-read it raw before apply.**
- *page image* means high fidelity.
- **Code status:** every changed code line is marked "not run — the session must …".

---

### f-s5-skill-r2-1 — the sandbox list: rootless Docker is not an equal sandbox (D2)
- **New finding.** Covers research table C row 75 and contradiction D2.
- **Sources** (all read 2026-10-01, fidelity not stated by the research note, so the validator must check):
  - firecracker-microvm.github.io
  - gvisor.dev/docs
  - gVisor's README on raw.githubusercontent.com
  - docs.docker.com rootless page
  - webassembly.org security page
- "gVisor for one" as a layer around a container is marked as this file's reading.
````text
If the model writes code that must run, run it in a sandbox (Firecracker, gVisor, Docker rootless, WASM) with no network and no filesystem outside `/tmp/sandbox`.
````
````text
If the model writes code that must run, run it in a sandbox with no network and no filesystem outside `/tmp/sandbox`: a Firecracker virtual machine (Firecracker is "an open source virtualization technology that is purpose-built for creating and managing secure, multi-tenant container and function-based services", https://firecracker-microvm.github.io/), gVisor, which "provides a strong layer of isolation between running applications and the host operating system" (https://gvisor.dev/docs/), or a WebAssembly runtime, where "Each WebAssembly module executes within a sandboxed environment separated from the host runtime using fault isolation techniques" (https://webassembly.org/docs/security/; the three read 2026-10-01). A container is not a sandbox on its own, rootless or not: gVisor's README says "Containers are not a sandbox" and that using them to run "untrusted or potentially malicious code without additional isolation is not a good idea" (https://raw.githubusercontent.com/google/gvisor/master/README.md, read 2026-10-01), and Docker's rootless mode is there "to mitigate potential vulnerabilities in the daemon and the container runtime" (https://docs.docker.com/engine/security/rootless/, read 2026-10-01). Run model-written code in a container only inside another isolation layer, gVisor for one (this file's reading of those two sources).
````

### f-s5-skill-r2-2 — tenant filtering at query time, sourced under LLM09:2026
- **New finding.** Covers table C row 78; spells out "RAG".
- **Source:** the LLM09:2026 file, read 2026-10-01. *summarised*.
````text
RAG retrievals MUST be filtered by the caller's tenant/user identity at query time, not after retrieval.
````
````text
Every retrieval MUST be filtered by the caller's tenant or user identity at query time, not after retrieval; LLM09:2026 Vector and Embedding Weaknesses asks to "Enforce tenant scoping inside the index query, not as a post-retrieval filter, and validate it server-side." (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM09_VectorAndEmbeddingWeaknesses.md, read 2026-10-01).
````

### f-s5-skill-r2-3 — observability logging sourced; abbreviations spelled out
- **New finding.** Covers table C row 81 and priority 8.
- **Sources** (both read 2026-10-01):
  - LLM02:2026, *summarised*.
  - LangSmith's masking page; fidelity not stated.
- Sentry, Helicone and Arize stay names only; the new text says so.
- The rename forces change 25.
````text
- **PII redaction before logging.** Prompts and completions log to stdout, to APM (Datadog, Sentry), and to LLM observability tools (LangSmith, Helicone, Arize). All of those are LLM02:2025 exposure surface unless the redaction layer strips emails, phone numbers, SSNs, tokens, API keys, and customer identifiers before write.
````
````text
- **Personal-data redaction before logging.** Prompts and completions are logged to standard output, to application performance monitoring (Datadog, Sentry) and to model-observability tools (LangSmith, Helicone, Arize). LLM02:2026 Sensitive Information Disclosure says "Observability platforms (Langfuse, LangSmith, Datadog LLM Observability) log full prompts, completions, chunks, and traces by default." (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM02_SensitiveInformationDisclosure.md, read 2026-10-01), and LangSmith's page "Prevent logging of sensitive data in traces" gives `LANGSMITH_HIDE_INPUTS=true` and `LANGSMITH_HIDE_OUTPUTS=true` (https://docs.langchain.com/langsmith/mask-inputs-outputs, read 2026-10-01). Every one of these is LLM02:2025 exposure surface unless a redaction layer strips email addresses, phone numbers, social security numbers, access tokens, keys and customer identifiers before the write. No source read for this file says whether Sentry, Helicone or Arize logs prompts by default.
````

### f-s5-skill-r2-4 — one sourced paragraph on strict tool use where the examples are introduced (priority 6, D4)
- **New finding.** Covers table C rows 73, 118/225/311 and 126/233/319, and contradiction D4.
- **Sources** (both read 2026-10-01):
  - The strict tool use page: the research note calls it "near-raw markdown".
  - The structured-outputs page: *summarised*, although its lists "came back verbatim". The validator must re-read every quotation from it, and confirm which of the two pages carries the 400 sentence and the refusal and `max_tokens` sentences.
````text
### LLM01:2025 — Prompt Injection (direct and indirect)
````
````text
### LLM01:2025 — Prompt Injection (direct and indirect)

The Python, Java and TypeScript safe examples below offer one tool with strict tool use and leave `tool_choice` at `auto`. Anthropic's strict tool use page says to "Set `"strict": true` as a top-level property in your tool definition, alongside `name`, `description`, and `input_schema`", and that doing so "guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs" (https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use, read 2026-10-01). Anthropic's structured-outputs page limits what the schema may hold: `additionalProperties` "must be set to `false` for objects"; "String constraints (`minLength`, `maxLength`)" and "Numerical constraints (such as `minimum`, `maximum`, `multipleOf`)" are not supported; and "If you use an unsupported feature, you'll receive a 400 error with details" (https://platform.claude.com/docs/en/build-with-claude/structured-outputs, read 2026-10-01). So the length limit on `reasoning` is checked in code and never written into `input_schema`. The strict tool use page says there is "No need to validate and retry tool calls"; the structured-outputs page says that after a refusal "The output may not match your schema because the refusal message takes precedence over schema constraints", and at the `max_tokens` limit "The output may be incomplete and not match your schema". The examples follow the second page: they check `stop_reason` and validate the input in code. For a reply in a fixed shape rather than a tool call, the request carries the schema in `output_config.format`, and "The `output_format` parameter is deprecated" (structured-outputs page).
````

### f-s5-skill-r2-5 — the LLM02 bad-example comment claims what its code does not show
- **New finding:** the round-1 re-read's "New" list.
- **Source:** this file's own code; nothing in the block writes to a vector store, and the logger is the only sink.
- **Code status:** comment only. Not run. The session must re-run its recorded `ast` parse of this block, or note that a comment change leaves it valid.
````text
# BAD: customer record dumped into the prompt, logged via APM, persisted in vector store
````
````text
# BAD: the whole customer record dumped into the prompt, and the prompt logged in full
````

### f-s5-skill-r2-6 — training-data extraction defined by NIST
- **New finding.** Covers table C row 373.
- **Source:** NIST AI 100-2 E2025, glossary, printed page 113. *page image*.
````text
(Nasr and others, arXiv:2311.17035, 28 November 2023, read 2026-10-01);
````
````text
(Nasr and others, arXiv:2311.17035, 28 November 2023, read 2026-10-01); NIST AI 100-2 E2025 defines training data extraction as "The ability of an attacker to extract the training data of a generative model by prompting the model with specific inputs" (glossary, printed page 113, https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf, read 2026-10-01);
````

### f-s5-skill-r2-7 — pickle risk sourced; safetensors is "safer", not "safe" (D3)
- **Correction of f-s5-skill-r1-30:** it replaces that finding's "this file's reading; no source read" label.
- Covers table C row 380 and contradiction D3.
- **Source:** the LLM04:2026 file, read 2026-10-01. *summarised*. The research note warns that its pickle sentence ended "ONNX[.]" and may be trimmed, so the quote ends at "ONNX".
````text
A direct `pickle.load` or `torch.load(..., weights_only=False)` of a downloaded file carries the same risk (this file's reading; no source read for it this round).
````
````text
A direct `pickle.load` or `torch.load(..., weights_only=False)` of a downloaded file carries the same risk: LLM04:2026 Supply Chain names "unsafe serialization formats such as Python pickle, which can execute arbitrary code on load" (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM04_SupplyChain.md, read 2026-10-01). Safetensors is safer, not safe: the same entry says moving away from pickle "reduces but does not eliminate this risk: a backdoor can be embedded directly in a model's computational graph and persist in formats widely considered safe, such as ONNX".
````

### f-s5-skill-r2-8 — supply chain of Model Context Protocol servers sits under ASI04 in the 2026 numbering (D6)
- **New finding.** Covers contradiction D6.
- **Source:** the LLM04:2026 file, read 2026-10-01. *summarised*.
````text
Pin server versions; restrict which tools each server may register; never auto-install from an unverified registry.
````
````text
Pin server versions; restrict which tools each server may register; never auto-install from an unverified registry. Under the 2026 numbering this is not LLM04:2026: LLM04:2026 Supply Chain says "Supply-chain risks specific to agentic applications, including MCP servers and tool registries, are covered by ASI04 Agentic Supply Chain Vulnerabilities" (read 2026-10-01) — the agentic entry listed under "Agentic applications" below.
````

### f-s5-skill-r2-9 — the LLM03 bad example loads no pickle (priority 7, D3)
- **New finding:** the round-1 re-read's "New" list.
- **Source:** this file's own line 382 on `use_safetensors` and `weights_only` (transformers model reference, read 2026-10-01).
- **Believed, not read:** that `from_pretrained` accepts `use_safetensors=False` and `weights_only=False` together.
- **Code status: not run — the session must parse it** (Python `ast`). After recording that parse, it may prefix the status line with "Parsed 2026-10-01 (Python 3.9.6, ast);".
````text
# Parsed 2026-10-01 (Python 3.9.6, ast); not run: needs transformers and the Hugging Face Hub; the model name and revision are placeholders.
# BAD: unpinned model, pickle-format weights
from transformers import AutoModelForCausalLM
model = AutoModelForCausalLM.from_pretrained("some-org/some-model")  # main moves

# SAFE: pinned revision + safetensors
model = AutoModelForCausalLM.from_pretrained(
    "some-org/some-model",
    revision="3f2c1b0a9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b",  # pin to a commit SHA
    use_safetensors=True,
)
````
````text
# Not run: needs transformers and the Hugging Face Hub; the model name and revision are placeholders.
# BAD: no pinned revision, and pickled weights loaded with an unrestricted unpickler
from transformers import AutoModelForCausalLM
model = AutoModelForCausalLM.from_pretrained(
    "some-org/some-model",          # no revision: main moves
    use_safetensors=False,          # the pickled .bin weights
    weights_only=False,             # the unpickler may run code the file carries
)

# SAFER, not safe: pinned revision + safetensors; a backdoor in the weights still loads
model = AutoModelForCausalLM.from_pretrained(
    "some-org/some-model",
    revision="3f2c1b0a9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b",  # pin to a commit hash
    use_safetensors=True,
)
````

### f-s5-skill-r2-10 — poisoning: how practical it is, and memory as a poisoning target
- **New finding.** Covers table C rows 400 and 404.
- **Sources** (both read 2026-10-01):
  - NIST AI 100-2 E2025, printed page 42. *page image*.
  - The LLM05:2026 file. *summarised*.
````text
so the model emits attacker-chosen outputs on attacker-chosen triggers ("backdoors").
````
````text
so the model emits attacker-chosen outputs on attacker-chosen triggers ("backdoors"). NIST AI 100-2 E2025 says such attacks "may be practical—requiring a relatively small portion of the total dataset [46]—and may lead to a range of bad outcomes, such as code suggestion models which intentionally suggest insecure code [3]" (printed page 42, https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf, read 2026-10-01), and LLM05:2026 Data and Model Poisoning says "In agentic deployments, poisoning risks extend to tool integrations, persistent memory stores, and RLHF feedback loops." (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM05_DataModelPoisoning.md, read 2026-10-01).
````

### f-s5-skill-r2-11 — fine-tuning canary: backdoors survive tuning; "threshold" made explicit
- **New finding.** Covers table C row 402.
- **Sources** (both read 2026-10-01):
  - NIST printed page 42. *page image*.
  - LLM05:2026. *summarised*.
- The limit itself is labelled this file's rule.
````text
- For fine-tuning: keep a clean held-out canary set; evaluate the post-fine-tune model against it and against known-bad triggers (e.g., specific rare-token sequences). Drop the new checkpoint if canary regression exceeds threshold.
````
````text
- For fine-tuning: keep a clean held-out canary set; evaluate the post-fine-tune model against it and against known-bad triggers (for example, specific rare-token sequences). Drop the new checkpoint if its canary results regress beyond a limit the project set before the run (this file's rule). A backdoor can outlast the tuning: NIST AI 100-2 E2025 says malicious backdoors in pre-trained models "can persist even after downstream users fine-tune the model for their own use [201] or apply additional safety training measures [170]" (printed page 42), and LLM05:2026 says "Do not assume safety alignment removes backdoors. Dedicated trigger-probing is required after every alignment cycle." (read 2026-10-01).
````

### f-s5-skill-r2-12 — Garak does not scan documents before indexing
- **New finding:** the round-1 re-read's "New" list. Also covers table C row 403.
- **Sources:**
  - This file's own "Tool Integration (2026)" section: each scanner "sends requests to a model endpoint".
  - LLM05:2026, read 2026-10-01. *summarised*.
- NeMo Guardrails' "input rails" had no source and are removed.
````text
- For RAG ingestion: scan documents for prompt-injection content before indexing. Tools: Garak probe modules, NeMo Guardrails input rails. Strip HTML/markdown that contains imperative phrases like "Ignore previous", "You are now", "System:".
````
````text
- For ingestion into retrieval-augmented generation: scan documents for prompt-injection content before indexing; LLM05:2026 asks to "Protect RAG systems by enforcing trust boundaries, filtering retrieved content, applying source scoring." (read 2026-10-01). Garak does not do this: it probes a model endpoint (see "Tool Integration (2026)"). Holding back markup that carries imperative phrases such as "Ignore previous", "You are now" or "System:" is this file's own heuristic, and a paraphrase or another language passes it.
````

### f-s5-skill-r2-13 — lineage of datasets and models
- **New finding.** Covers table C row 405.
- **Source:** LLM05:2026, read 2026-10-01. *summarised*.
````text
- Provenance: every ingested chunk gets `source_url`, `ingest_ts`, `ingest_actor`, `trust_tier` columns. Revoke at the source level if a tier is later compromised.
````
````text
- Provenance: every ingested chunk gets `source_url`, `ingest_ts`, `ingest_actor`, `trust_tier` columns. Revoke at the source level if a tier is later compromised. For datasets and models, LLM05:2026 asks to "Track dataset and model lineage using SBOM/ML-BOM (e.g., CycloneDX), enforce signing and verification." (read 2026-10-01).
````

### f-s5-skill-r2-14 — system-prompt extraction measured
- **New finding.** Covers table C row 82/466.
- **Source:** NIST printed page 47, read 2026-10-01. *page image*. The attack string inside it is quoted as data.
````text
System prompts are recoverable by motivated attackers. Designs that depend on the system prompt being secret are designs that already failed.
````
````text
System prompts are recoverable. NIST AI 100-2 E2025 reports that "For certain LLMs, researchers have found that a small set of fixed attack queries (e.g., Repeat all sentences in our conversation) were sufficient to extract more than 60 % of prompts across certain model and dataset pairs [439]." (printed page 47, https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf, read 2026-10-01). A design that depends on the system prompt staying secret has already failed.
````

### f-s5-skill-r2-15 — secrets in a system prompt, the 2026 wording
- **Amends the wording of f-s5-skill-r1-41.** Covers table C row 466; spells out "API" and "DB".
- **Source:** LLM02:2026, read 2026-10-01. *summarised*.
- Quoted under LLM02:2026, which is where the sentence was read. It is never presented as a successor to System Prompt Leakage.
````text
- Never put secrets (API keys, DB URLs, customer identifiers) in the system prompt.
````
````text
- Never put secrets (keys, database connection strings, customer identifiers) in the system prompt; LLM02:2026 says "System-prompt hygiene: never store secrets, credentials, or regulated data in system prompts." (read 2026-10-01).
````

### f-s5-skill-r2-16 — embedding inversion: strip "inversion-resistant", drop rotation, treat embeddings as the documents, add Gaussian noise with its limit (D1)
- **New finding.** Covers contradiction D1 and table C row 488.
- **Sources** (all read 2026-10-01):
  - Morris and others, arXiv:2310.06816. The abstract's fidelity is not stated; section 6 is a *page image*.
  - Zero2Text, arXiv:2602.01757. Fidelity not stated.
  - LLM09:2026 and LLM02:2026. *summarised*.
- The access-control rule is this file's reading.
- The rotation argument also rests on this file's own LLM03:2025 pin.
````text
2. **Embedding inversion / similarity attacks** — given an embedding vector, the attacker recovers (approximately) the source text, or crafts an input whose embedding lands near a target's embedding to surface that target's documents. Defenses: never return raw embeddings to the client; cap the embedding-API surface to "query-by-text," not "query-by-vector"; for sensitive corpora, use embedding models trained with inversion-resistance and rotate the embedding model periodically.
````
````text
2. **Embedding inversion and similarity attacks** — given an embedding vector, an attacker can recover the source text. Morris, Kuleshov, Shmatikov and Rush report that "a multi-step method that iteratively corrects and re-embeds text is able to recover 92% of 32-token text inputs exactly" ("Text Embeddings Reveal (Almost) As Much As Text", https://arxiv.org/abs/2310.06816, read 2026-10-01), and Zero2Text (Kim and others, https://arxiv.org/abs/2602.01757, read 2026-10-01) reports that "standard defenses, such as differential privacy, fail to effectively mitigate this adaptive threat". An attacker can also craft an input whose embedding lands near a target's embedding to surface that target's documents. So treat a stored or exported embedding as the text it encodes: LLM09:2026 says "Stored embeddings can be inverted to recover source text.", and LLM02:2026 says "an 'embeddings-only' backup is a source-document breach" (both read 2026-10-01). Defenses: never return raw embeddings to a caller; offer query by text, never query by vector; give stored embeddings the access control of their source documents (this file's reading). Gaussian noise is a partial measure: at a noise level of 0.01, "retrieval performance is barely degraded (2%) while reconstruction performance plummets to 13% of the original BLEU", and the authors say that adding a small amount of Gaussian noise "may be a straightforward way to defend against naive inversion attacks" (Morris and others, section 6). Rotating the embedding model is no defense against attacks that "operate zero-shot with no encoder-specific training" (LLM09:2026), and a switch re-shapes the index pinned under LLM03:2025. No source read for this file supports training an embedding model to resist inversion.
````

### f-s5-skill-r2-17 — what a retrieval log holds, under LLM09:2026
- **New finding.** Covers table C row 518 (optional), kept short because line 526 is already the file's longest paragraph.
- **Source:** LLM09:2026, read 2026-10-01. *summarised*.
````text
and to "Maintain detailed immutable logs of retrieval activities" (https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/, read 2026-09-30).
````
````text
and to "Maintain detailed immutable logs of retrieval activities" (https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/, read 2026-09-30); LLM09:2026 lists what such a log holds: "Keep immutable logs of retrieval activity (tenant scope, query, returned IDs, similarity scores)." (read 2026-10-01).
````

### f-s5-skill-r2-18 — grounding sourced under LLM07:2026; abbreviations spelled out
- **New finding.** Covers table C rows 524–526.
- **Source:** the LLM07:2026 file, read 2026-10-01. *summarised*.
````text
- Citation-grounded outputs: in RAG, the model MUST quote a passage and link the source for each factual claim; UI rejects ungrounded claims.
````
````text
- Citation-grounded outputs: in retrieval-augmented generation, the model MUST quote a passage and link the source for each factual claim, and the user interface rejects an ungrounded claim. LLM07:2026 Misinformation says "The core risk is that the incorrect output is trusted and acted upon." and asks to "Ground Claims Before Action: Require outputs to be grounded in authoritative and current sources." (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM07_Misinformation.md, read 2026-10-01).
````

### f-s5-skill-r2-19 — runtime verification before an action, under LLM07:2026
- **New finding.** Covers table C row 526.
- **Source:** LLM07:2026, read 2026-10-01. *summarised*.
````text
showing the exact action (see LLM06:2025).
````
````text
showing the exact action (see LLM06:2025); LLM07:2026 asks to "Enforce Runtime Verification for High-Impact Actions: Introduce approval workflows and system checks." (read 2026-10-01).
````

### f-s5-skill-r2-20 — log-probabilities as a disclosure surface; injection-driven denial of service
- **New finding.** Covers table C row 530.
- **Sources** (both read 2026-10-01):
  - LLM02:2026. *summarised*.
  - NIST printed page 51. *page image*.
- **Not used, on purpose:** NIST printed page 41 only describes what query access can return, and the page 47 sentence about Carlini and others refers to "such information" without the link to log-probabilities in the text that was read.
````text
an interface that returns log-probabilities or logits to callers is a finding.
````
````text
an interface that returns log-probabilities or logits to callers is a finding, and LLM02:2026 counts "observable inference properties (timing, token length, log-probabilities, confidence, cache-hit behavior)" among "disclosure surfaces" (read 2026-10-01). NIST AI 100-2 E2025 adds an availability route: "An indirectly injected prompt can instruct the model to perform a time-consuming task prior to answering the request. The prompt itself can be brief, such as by requesting looping behavior in the evaluating model [146]." (printed page 51, https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf, read 2026-10-01).
````

### f-s5-skill-r2-21 — the product named in CVE-2025-53773
- **Correction of f-s5-skill-r1-49**, which kept "(Visual Studio)".
- **Sources:**
  - Microsoft's record reads "…in GitHub Copilot and Visual Studio allows …" (agent round-1 validate and re-read, cveawg.mitre.org, read 2026-09-30 and 2026-10-01).
  - The Embrace The Red post concerns Visual Studio Code (skill round-1 re-read, *summarised*; the validator must confirm).
````text
GitHub Copilot agent mode (Visual Studio)
````
````text
GitHub Copilot agent mode — "GitHub Copilot and Visual Studio" in Microsoft's record; the researcher's post shows it in Visual Studio Code
````

### f-s5-skill-r2-22 — ATLAS table: two renames, "Reverse Shell" replaced, an identifier in every row (priority 1)
- **Correction of f-s5-skill-r1-50.**
- **Sources:**
  - The session's raw check (`s5-skill-round2-session-runs.md`).
  - This critic's read of the session's saved `ATLAS-2026.09.yaml`, 2026-10-01, for the three additions beyond that check:
    - AML.T0115 with .002 achieves AML.TA0003.
    - AML.T0110 achieves AML.TA0006.
    - AML.T0108 achieves AML.TA0014; its description reads "AI agents are often granted access to tools that can execute shell commands, reach out to the internet, and interact with other services in the victim's environment, making them capable C2 agents."
  - AML.T0129 achieves AML.TA0007 (raw check).
- **Mapping choices:**
  - Putting AML.T0115.002 first in Resource Development fits that row's look-for better than Acquire Public AI Artifacts, which is kept.
  - Whether AML.T0108 or AML.T0072 better fits egress from tool calls is this file's reading.
  - If the validator refutes any one addition, strike it from `new`; the rest stand.
````text
| Reconnaissance (AML.TA0002) | Search Application Repositories | Models, fine-tunes and endpoints the code under review names in files it publishes |
| Resource Development (AML.TA0003) | Acquire Public AI Artifacts | Installed Model Context Protocol servers and agent tools from unverified publishers |
| Initial Access (AML.TA0004) | AI Supply Chain Compromise (AML.T0010) | LLM03:2025 model, tokenizer and embedding pins |
| AI Model Access (AML.TA0000) | Inference API Access; AI-Enabled Product or Service | A path where an unauthenticated caller reaches the inference endpoint |
| Execution (AML.TA0005) | LLM Prompt Injection (AML.T0051: .000 Direct, .001 Indirect, .002 Triggered); AI Agent Tool Invocation (AML.T0053); Command and Scripting Interpreter | LLM01:2025 separation; LLM05:2025 and LLM06:2025 `eval`/`exec` of model output and tool over-grant |
| Persistence (AML.TA0006) | AI Agent Context Poisoning (AML.T0080: .000 Memory, .001 Thread); Modify AI Agent Configuration (AML.T0081); Poison Training Data; Manipulate AI Model | LLM04:2025 ingestion checks, canary set and memory provenance; model output writing an agent-configuration file |
| Privilege Escalation (AML.TA0012) | AI Agent Tool Invocation (AML.T0053); LLM Jailbreak; Escape to Host | A tool acting with more authority than its user; sandbox isolation for any tool that executes model-generated code |
| Defense Evasion (AML.TA0007) | Modify AI Agent Configuration (AML.T0081); Evade AI Model; LLM Prompt Obfuscation | Guardrails that a Unicode, homoglyph, invisible-character or other-language rewrite would pass |
| Discovery (AML.TA0008) | Discover AI Model Family; Discover AI Agent Configuration | Error paths that disclose the model's name or version, or the tools the agent holds |
| Lateral Movement (AML.TA0015) | AI Agent Tool Invocation (AML.T0053) | One agent's or tool's output driving another agent or tool with no check between |
| Collection (AML.TA0009) | Data from Information Repositories | Retrieval across a tenant boundary (LLM08:2025) |
| AI Attack Adaptation (AML.TA0001) | Create Proxy AI Model | Log-probabilities or logits returned to callers (LLM10:2025) |
| Exfiltration (AML.TA0010) | Extract LLM System Prompt (AML.T0056); LLM Data Leakage; Exfiltration via Cyber Means | Secrets in a system prompt (LLM07:2025); personal data echoed; markdown-image rendering (the EchoLeak shape) |
| Impact (AML.TA0011) | Cost Harvesting (AML.T0034); Erode AI Model Integrity; External Harms | LLM10:2025 caps and budgets; LLM09:2025 answers that act |
| Command and Control (AML.TA0014) | Reverse Shell | Egress from agent tool calls: a fetch tool with no address allowlist |
````
````text
| Reconnaissance (AML.TA0002) | Search Application Repositories (AML.T0004) | Models, fine-tunes and endpoints the code under review names in files it publishes |
| Resource Development (AML.TA0003) | Publish Poisoned AI Artifacts (AML.T0115: .002 AI Agent Tools); Acquire Public AI Artifacts (AML.T0002) | Installed Model Context Protocol servers and agent tools from unverified publishers |
| Initial Access (AML.TA0004) | AI Supply Chain Compromise (AML.T0010) | LLM03:2025 model, tokenizer and embedding pins |
| AI Model Access (AML.TA0000) | AI Model Inference API Access (AML.T0040); AI-Enabled Product or Service (AML.T0047) | A path where an unauthenticated caller reaches the inference endpoint |
| Execution (AML.TA0005) | LLM Prompt Injection (AML.T0051: .000 Direct, .001 Indirect, .002 Triggered); AI Agent Tool Invocation (AML.T0053); Command and Scripting Interpreter (AML.T0050) | LLM01:2025 separation; LLM05:2025 and LLM06:2025 `eval`/`exec` of model output and tool over-grant |
| Persistence (AML.TA0006) | AI Agent Context Poisoning (AML.T0080: .000 Memory, .001 Thread); Modify AI Agent Configuration (AML.T0081); AI Agent Tool Poisoning (AML.T0110); Training Data Poisoning (AML.T0020); Manipulate AI Model (AML.T0018) | LLM04:2025 ingestion checks, canary set and memory provenance; model output writing an agent-configuration file; a tool description or tool response the model reads with no review (LLM06:2025, tool poisoning) |
| Privilege Escalation (AML.TA0012) | AI Agent Tool Invocation (AML.T0053); LLM Jailbreak (AML.T0054); Escape to Host (AML.T0105) | A tool acting with more authority than its user; sandbox isolation for any tool that executes model-generated code |
| Defense Evasion (AML.TA0007) | Modify AI Agent Configuration (AML.T0081); Evade AI Model (AML.T0015); LLM Prompt Obfuscation (AML.T0068); Triggers in Multimodal Inputs (AML.T0129) | Guardrails that a Unicode, homoglyph, invisible-character or other-language rewrite would pass, or that read only the text of an input that also carries an image, audio or video (see "Multimodal") |
| Discovery (AML.TA0008) | Discover AI Model Family (AML.T0014); Discover AI Agent Configuration (AML.T0084) | Error paths that disclose the model's name or version, or the tools the agent holds |
| Lateral Movement (AML.TA0015) | AI Agent Tool Invocation (AML.T0053) | One agent's or tool's output driving another agent or tool with no check between |
| Collection (AML.TA0009) | Data from Information Repositories (AML.T0036) | Retrieval across a tenant boundary (LLM08:2025) |
| AI Attack Adaptation (AML.TA0001) | Create Proxy AI Model (AML.T0005) | Log-probabilities or logits returned to callers (LLM10:2025) |
| Exfiltration (AML.TA0010) | Extract LLM System Prompt (AML.T0056); LLM Data Leakage (AML.T0057); Exfiltration via Cyber Means (AML.T0025) | Secrets in a system prompt (LLM07:2025); personal data echoed; markdown-image rendering (the EchoLeak shape) |
| Impact (AML.TA0011) | Cost Harvesting (AML.T0034); Erode AI Model Integrity (AML.T0031); External Harms (AML.T0048) | LLM10:2025 caps and budgets; LLM09:2025 answers that act |
| Command and Control (AML.TA0014) | AI Agent (AML.T0108); Cyber Communication Channel (AML.T0072) | Egress from agent tool calls: a fetch tool with no address allowlist |
````

### f-s5-skill-r2-23 — the note under the ATLAS table, restated as fully checked
- **Correction of f-s5-skill-r1-50.**
- **Sources:**
  - As change 22.
  - The legacy name "Reverse Shell": this critic's read of the session's saved `ATLAS-legacy-5.6.0.yaml`, lines 2503–2504. The session must confirm that file is `dist/ATLAS.yaml`.
  - The agent's rule (agent line 24): "Every identifier you write comes from the section below or from a lookup".
````text
> Tactic placements, the identifiers AML.T0034, AML.T0051, AML.T0053, AML.T0056, AML.T0080 and AML.T0081 with their names and sub-techniques, and the name of every tactic are from release 2026.09 (`dist/v6/ATLAS-2026.09.yaml`, read raw by the session 2026-10-01). The other technique names, and AML.T0010, come from earlier versions of this file and were not checked against that release. Credential Access (AML.TA0013) has no row: Extract LLM System Prompt, which this table used to place there, achieves Exfiltration in release 2026.09. Where the agent's lookup and this table disagree, the agent's rule ("Taxonomies, identifiers and where they come from") decides which wins.
````
````text
> Every technique name, identifier and tactic placement in this table, and every tactic name, is from release 2026.09 (`dist/v6/ATLAS-2026.09.yaml` as the session downloaded it, read raw 2026-10-01): each technique sits in a row whose tactic is a target of its `achieves` relationships. Earlier versions of this table wrote two names that are not ATLAS's — "Poison Training Data" for Training Data Poisoning (AML.T0020) and "Inference API Access" for AI Model Inference API Access (AML.T0040) — and named "Reverse Shell", which is AML.T0072's name in the deprecated `dist/ATLAS.yaml` and is not in release 2026.09, where AML.T0072 is Cyber Communication Channel. Credential Access (AML.TA0013) has no row: Extract LLM System Prompt, which this table used to place there, achieves Exfiltration in release 2026.09. The agent writes an identifier only from its section "Taxonomies, identifiers and where they come from" (`agents/ai-quality/llm-security-tester.md`) or from a lookup made during its dispatch, so an identifier here that the section lacks is a lead for that lookup, not a source; where the lookup and this table disagree, the agent's rule decides which wins.
````

### f-s5-skill-r2-24 — LangChain parsers: fail-closed, except Python's `partial=True` (D5)
- **New finding.** Covers table C row 644 and contradiction D5.
- **Sources:** both files in the libraries' source on GitHub raw, read 2026-10-01. Fidelity not stated.
- That a caller must treat `None` as a rejection is this file's reading.
````text
| **LangChain output parsers** | LangChain | Schema-validated parsing of model output (Pydantic, Zod); fail-closed on parse error | Wrap every model call that returns structured data |
````
````text
| **LangChain output parsers** | LangChain | Schema-validated parsing of model output. Python: the parser in `pydantic.py` raises `OutputParserException` "If the result is not valid JSON or does not conform to the Pydantic model", but on a failure with `partial=True` it returns `None` instead of raising, so a caller must treat `None` as a rejection (this file's reading; https://raw.githubusercontent.com/langchain-ai/langchain/master/libs/core/langchain_core/output_parsers/pydantic.py). JavaScript: `StructuredOutputParser.fromZodSchema` "Creates a new StructuredOutputParser from a Zod schema", and its `parse` throws `OutputParserException` when the text does not parse or fails the schema (https://raw.githubusercontent.com/langchain-ai/langchainjs/main/libs/langchain-core/src/output_parsers/structured.ts). Both read in source 2026-10-01 | Wrap every model call that returns structured data |
````

### f-s5-skill-r2-25 — the agent-check mapping row follows the rename in change 3
- **Source:** this file's own change 3. The agent quotes neither bullet name (checked).
````text
| 10. Redaction before logging | "PII redaction before logging"; LLM02:2025, logging |
````
````text
| 10. Redaction before logging | "Personal-data redaction before logging"; LLM02:2025, logging |
````

### f-s5-skill-r2-26 — the tactic of AML.T0129 is now read
- **Amends f-s5-skill-r1-57.**
- **Sources:**
  - The session's raw check: Defense Evasion.
  - The description: this critic's read of the saved `ATLAS-2026.09.yaml`, lines 5809–5811, 2026-10-01.
````text
ATLAS release 2026.09 has AML.T0129 Triggers in Multimodal Inputs; its tactics were not read for this file.
````
````text
In ATLAS release 2026.09, AML.T0129 Triggers in Multimodal Inputs achieves Defense Evasion (AML.TA0007): "Adversaries may place instructions or triggers in one part of a multimodal input to influence the model while staying unnoticed by human reviewers and by defenses that do not inspect all input modalities." (`dist/v6/ATLAS-2026.09.yaml`, read raw 2026-10-01; see "MITRE ATLAS mapping").
````

### f-s5-skill-r2-27 — unvalidated secondary references removed (1 of 2)
- **Correction of f-s5-skill-r1-62.**
- No claim in the body rests on these references, no validator ever read them, and no test names them (I searched `tests/`).
````text
- OWASP Gen AI Security Project (per-category pages): https://genai.owasp.org/llm-top-10/
- Invicti — OWASP Top 10 for LLMs 2025 key risks: https://www.invicti.com/blog/web-security/owasp-top-10-risks-llm-security-2025
- Indusface — OWASP Top 10 LLM 2025: https://www.indusface.com/learning/owasp-top-10-llm/
````
````text
- OWASP Gen AI Security Project (per-category pages): https://genai.owasp.org/llm-top-10/
````

### f-s5-skill-r2-28 — unvalidated secondary references removed (2 of 2)
- As change 27.
````text
- CWE-1426 and CWE-1427: https://cwe.mitre.org/data/definitions/1426.html and https://cwe.mitre.org/data/definitions/1427.html
- "Securing Agentic AI: The OWASP Top 10 and Beyond" (secops.group): https://secops.group/blog/securing-agentic-ai-the-owasp-top-10-and-beyond/
- WorkOS — Prompt injection attacks and defenses: https://workos.com/blog/prompt-injection-attacks
- Vectra AI — Prompt injection types and real-world CVEs: https://www.vectra.ai/topics/prompt-injection
````
````text
- CWE-1426 and CWE-1427: https://cwe.mitre.org/data/definitions/1426.html and https://cwe.mitre.org/data/definitions/1427.html
````

### f-s5-skill-r2-29 — no change: `maxLength` is in no strict schema (priority 5)
- The `input_schema` blocks contain no `maxLength`, `minLength`, `minimum` or `maximum`:
  - Python: lines 119–127.
  - Java: lines 227–235.
  - TypeScript: lines 313–321.
- The TypeScript limit lives in zod (`z.string().max(2000)`, line 294), and the other examples check the limit in code.
- Record this as `rejected` with the reason "Decision, no change: verified."

---

**Change count:** 28 changes (findings 1–28), one item with no change (29), and one optional late correction to the agent (30, below).

**Items from the plan's round-1 list ("What rounds 2 and 3 of the skill must still do") resolved by these changes:**
- ATLAS names outside the six already checked, and AML.T0010: changes 22, 23, 26.
- Strict tool use schema rules: change 4.
- LangChain's "Zod" and "fail-closed": change 24.
- Sandbox list: change 1.
- Observability vendors: change 3, in part. Sentry, Helicone and Arize are now stated in the file as not sourced.
- Inversion resistance and rotation: change 16.
- The 2026 entry texts for LLM02, LLM04, LLM05, LLM07 and LLM09: changes 2, 3, 7, 8, 10–20, each quoted under its own 2026 identifier.
- The LLM03 bad example loading no pickle: change 9.
- Garak named for scanning documents: change 12.
- The LLM02 "persisted in vector store" comment: change 5.
- Copilot's product name: change 21.
- The secondary references: changes 27–28.
- Abbreviations spelled out in every passage touched: changes 2, 3, 9, 11, 12, 15, 16, 18.
- Contradictions D1–D6: changes 16, 1, 7+9, 4, 24 and 8 respectively.
- Table C rows 118/225/311, 126/233/319 and 645 need no change; the research validated them as they stand.

**Left for round 3:**
- **A word-for-word raw re-read of every quotation marked *summarised* above.** That is every OWASP 2026 quotation and every structured-outputs quotation. Also re-read the ones whose fidelity the note does not state: LangSmith, the sandbox pages, LangChain, the Morris abstract and Zero2Text.
- **Unsourced claims still in the file:**
  - The "similarity attacks" sentence (crafting an input near a target's embedding).
  - Line 383, "can re-introduce poisoned chunks that were thought purged".
  - LLM09:2025's "confidence floor", not labelled as this file's own idea.
  - The Llama Guard row.
- **The redaction example.** In the LLM02:2025 safe example, `safe_log` is defined but never called, and its pattern misses the email addresses that the redaction bullet names.
- **Remaining abbreviations in untouched text:**
  - "RAG" on lines 61, 383 and 491.
  - "HF" on line 385.
  - "PR" and "LLM code" in the PromptFoo row.
  - "SAST" on line 734. "PoC" on that line cannot change unless the agent's quotation of it changes too.
  - "QR" on line 853.
  - "PII" and "GDPR" on line 867.
  - "MCP" and "LLM" throughout.
- **Code never compiled or run:**
  - Java and C#: no toolchain on the build machine.
  - The pgvector column and the `<->` query.
  - This round's Python changes: they must be parsed before apply.
- **Optional, unread or not added:**
  - Newer inversion defenses TextCrafter (arXiv:2509.17302) and SPARSE (arXiv:2602.07090) are unread.
  - ATLAS case studies AML.CS0053 "Poisoned Postmark MCP Server Email Exfiltration" and AML.CS0054 "Data Exfiltration via Remote Poisoned MCP Tool" exist in release 2026.09 (saved file, lines 9001 and 9032). They could restore, now sourced, the case-study pointer that round 1 removed.
  - The References list does not name the sources added inline this round.
- **Readability:** line 526, and line 494 after change 16.

**Seven-language verdict: the check applies, and coverage is unchanged and complete.**
- The file covers C#, Java, Python, C, C++, TypeScript and SQL, as listed on lines 738–742.
- This round changes Python only: the LLM03:2025 block and one comment in the LLM02:2025 block.
- Both are unrun. The session must parse them with `ast` before apply.

**Agent late-correction proposal (separate; optional; about consistency, not a false statement).**
- **f-s5-skill-r2-30.** Agent check 11 says "weight formats safe". Change 7 makes the skill say "safer, not safe", which is LLM04:2026's point. The agent's sentence is overstated rather than false.
- **Source:** the LLM04:2026 file, read 2026-10-01. *summarised*.
- **Before applying:** run the 36 agent fences and the copy fence.
````text
11. **Supply chain** — model revisions pinned, weight formats safe.
````
````text
11. **Supply chain** — model revisions pinned, and no weights loaded from a format that can run code when loaded; LLM04:2026 Supply Chain names "unsafe serialization formats such as Python pickle, which can execute arbitrary code on load", and says moving away from them "reduces but does not eliminate this risk" (https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/LLM04_SupplyChain.md, read 2026-10-01), so a safer format is not a safe one.
````

No other agent sentence becomes false. The agent refers to the skill's egress case, its Command and Control row, its AI Model Access row, its Discovery list, its embedding-inversion case and its point about where prompts are logged; all of those survive these changes.

**Copy fence.** The test checks whether any trimmed skill line of 25 characters or more appears anywhere in the agent body, as a substring (`body.includes(line)`). I checked: no new line of 25 characters or more in these changes is a substring of the agent body.

Files:
- <home>/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md
- <home>/Code/ctoc/agents/ai-quality/llm-security-tester.md
- <home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round2-research-d-s5-skill-r2-research.md
- <home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round2-session-runs.md
- /private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/ATLAS-2026.09.yaml
- /private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/ATLAS-legacy-5.6.0.yaml

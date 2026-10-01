<!-- saved verbatim by the session from subagent a2f72d9af5d13204d (ctoc:ai-quality:citation-validator), dispatch d-s5-skill-r2-validate, 2026-10-01 04:15 CEST -->

**Validation of the round-2 critique of the language-model security tester skill: 24 of the 28 changes are verified as written. Four need their quotation text corrected before they are applied: the Firecracker quotation in change 1, and the three LLM05:2026 quotations in changes 11, 12 and 13.**

- No change is misattributed or unverifiable.
- The no-change item (29) and the optional agent correction (30) are verified.
- Every `old` text is verbatim and unique in the skill, and no two of them overlap.
- I used 16 of the 25 fetches and 33 tool calls.

## Per-change verdicts

| # | Subject | Verdict | Source sentence and how it was read |
|---|---|---|---|
| 1 | Sandbox list | **Refuted (one quotation)** | **Firecracker:** I read the page twice. Both reads give "Firecracker is an open source virtualization technology purpose-built for creating and managing secure, multi-tenant container and function-based services." The second read was asked directly and answered "No": there is no "that is" before "purpose-built". The research note's read had "that is", so the reads disagree. **gVisor documentation:** "gVisor provides a strong layer of isolation between running applications and the host operating system." Verified. **gVisor README:** the raw file reads `Containers are not a [**sandbox**][sandbox].`, so the critic quotes the rendered text. "…using them to run untrusted or potentially malicious code without additional isolation is not a good idea." Verified. **Docker:** "…as a non-root user to mitigate potential vulnerabilities in the daemon and the container runtime." Verified. **WebAssembly:** "Each WebAssembly module executes within a sandboxed environment separated from the host runtime using fault isolation techniques." Verified. The conclusion is labelled as this file's reading. |
| 2 | Tenant filter, LLM09:2026 | Verified | The session's raw grep found it verbatim (LLM09, 4 of 4). |
| 3 | Logging, LLM02:2026 and LangSmith | Verified | LLM02: raw, 6 of 6. LangSmith's page title is "Prevent logging of sensitive data in traces". It gives "`LANGSMITH_HIDE_INPUTS=true` `LANGSMITH_HIDE_OUTPUTS=true`" and states no default. |
| 4 | Strict tool use paragraph | Verified, every sentence on the page the critic names | **Strict tool use page** (it came back as near-raw markdown): "Set `"strict": true` as a top-level property in your tool definition, alongside `name`, `description`, and `input_schema`."; "…guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling)."; the list item "No need to validate and retry tool calls". The page also sends readers to the structured-outputs page for "the supported JSON Schema subset". **Structured-outputs page:** under "Supported features", "`required` and `additionalProperties` (must be set to `false` for objects)". Under "Not supported", "String constraints (`minLength`, `maxLength`)", "Numerical constraints (such as `minimum`, `maximum`, `multipleOf`)" and "If you use an unsupported feature, you'll receive a 400 error with details." Under "Invalid outputs": the refusal sentence and "The output may be incomplete and not match your schema". Also "The `output_format` parameter is deprecated and will be removed in the future." and `output_config.format`. All three examples do leave `tool_choice` at `auto`. |
| 5 | LLM02 bad-example comment | Verified | Comment only. Lines 351–353 do log the whole prompt, and there is no vector store. The block header still says "not run", and a comment change keeps the block parseable. |
| 6 | NIST definition of training data extraction | Verified | Page image of printed page 113: "training data extraction The ability of an attacker to extract the training data of a generative model by prompting the model with specific inputs." |
| 7 | Pickle, "safer, not safe" | Verified | LLM04, raw, 3 of 3. |
| 8 | Model Context Protocol supply chain sits under ASI04 | Verified | LLM04, raw. "Agentic applications" resolves to the section heading on line 588, and ASI04 is on line 595. |
| 9 | New LLM03 code example | Verified | The session parsed it with Python 3.9.6 `ast`. Its claims match the sourced line 382 and LLM04:2026. See Leftovers for the header. |
| 10 | Poisoning: NIST and LLM05 | Verified | Printed page 42: "These attacks may be practical—requiring a relatively small portion of the total dataset [46]—and may lead to a range of bad outcomes, such as code suggestion models which intentionally suggest insecure code [3]." The LLM05 sentence "In agentic deployments…" is verbatim (session). |
| 11 | Canary set | **Refuted (quotation end)** | The NIST sentence on printed page 42 ("…can persist even after downstream users fine-tune the model for their own use [201] or apply additional safety training measures [170].") is verified. In the LLM05 quotation, the source line reads "…after every alignment cycle (Hubinger et al., 2024)." The critic put a full stop inside the quotation marks where the source has none. |
| 12 | Garak and document ingestion | **Refuted (quotation end)** | The source continues "…applying source scoring, and isolating system instructions from external data." The claim that Garak sends requests to a model endpoint is the skill's own text on line 642, which is fine. |
| 13 | Lineage of datasets and models | **Refuted (quotation end)** | The source continues "…enforce signing and verification, and continuously validate data integrity across lifecycle stages." |
| 14 | Extracting a system prompt | Verified | Printed page 47: "For certain LLMs, researchers have found that a small set of fixed attack queries (e.g., Repeat all sentences in our conversation) were sufficient to extract more than 60 % of prompts across certain model and dataset pairs [439]." |
| 15 | Secrets in a system prompt, LLM02:2026 | Verified | LLM02, raw. |
| 16 | Embedding inversion | Verified | **arXiv 2310.06816:** the title is "Text Embeddings Reveal (Almost) As Much As Text", by Morris, Kuleshov, Shmatikov and Rush. The abstract says "a multi-step method that iteratively corrects and re-embeds text is able to recover 92% of 32-token text inputs exactly". **Section 6, page image of the saved paper:** "At a noise level of 0.01, retrieval performance is barely degraded (2%) while reconstruction performance plummets to 13% of the original BLEU." and "…adding a small amount of Gaussian noise may be a straightforward way to defend against naive inversion attacks, although…". **arXiv 2602.01757:** Zero2Text, by Doohyun Kim and others, submitted 2 February 2026: "standard defenses, such as differential privacy, fail to effectively mitigate this adaptive threat". The LLM09 and LLM02 quotations are raw, from the session. |
| 17 | Retrieval-log fields, LLM09:2026 | Verified | Session, raw. |
| 18 | Grounding, LLM07:2026 | Verified | Session, raw (LLM07, 3 of 3). |
| 19 | Runtime verification, LLM07:2026 | Verified | Session, raw. |
| 20 | Log-probabilities and denial of service | Verified | LLM02, raw. Printed page 51: "An indirectly injected prompt can instruct the model to perform a time-consuming task prior to answering the request. The prompt itself can be brief, such as by requesting looping behavior in the evaluating model [146]." |
| 21 | Product named in CVE-2025-53773 | Verified | **Microsoft's record:** "…('command injection') in GitHub Copilot and Visual Studio allows an unauthorized attacker to execute code locally." **The researcher's post:** "…full system compromise of the developer's machine in GitHub Copilot and VS Code". |
| 22 | ATLAS table | Verified | In the saved 2026.09 file: AML.T0115 "Publish Poisoned AI Artifacts" (line 5230) achieves AML.TA0003 (lines 20385–20386); AML.T0115.002 "AI Agent Tools" (line 5299) achieves AML.TA0003 (lines 20408–20409); AML.T0110 "AI Agent Tool Poisoning" (line 4897) achieves AML.TA0006 (lines 20315–20316); AML.T0108 "AI Agent" (line 4850) achieves AML.TA0014 (lines 20305–20306); AML.T0129 achieves AML.TA0007 (lines 20500–20501). Every other identifier is confirmed either by the session's table check or by the agent's 2026.09 table (agent lines 56–61). |
| 23 | Note under the ATLAS table | Verified | In `ATLAS-legacy-5.6.0.yaml`, lines 2503–2504 read `- id: AML.T0072` / `name: Reverse Shell`. That this saved file is `dist/ATLAS.yaml` I did not check myself (see the last section). |
| 24 | LangChain output parsers | Verified | **Python:** the docstring says "If the result is not valid JSON or does not conform to the Pydantic model."; the code is `except OutputParserException: if partial: return None; raise`; and the default is `partial: bool = False`. **JavaScript:** "Creates a new StructuredOutputParser from a Zod schema.", and `parse` wraps both `JSON.parse` and the schema parse, then throws `OutputParserException`. |
| 25 | Row in the agent-check mapping | Verified | The agent never writes "PII redaction before logging". |
| 26 | Tactic of AML.T0129 | Verified | Lines 5809–5811: "Adversaries may place instructions or triggers in one part of a multimodal input to influence the model while staying unnoticed by human reviewers and by defenses that do not inspect all input modalities." "MITRE ATLAS mapping" resolves to line 614. |
| 27 | References removed (1 of 2) | Verified | Those names appear only on lines 873–874, and no file under `tests/` names them. |
| 28 | References removed (2 of 2) | Verified | Lines 891–893 only; nothing under `tests/` names them. |
| 29 | No change: no `maxLength` in any strict schema | Verified | Python lines 119–127, Java lines 227–235 and TypeScript lines 313–321 hold no length or number constraint. |
| 30 | Optional agent correction | Verified | Its two quotations are substrings of LLM04 quotations the session confirmed raw. The `old` text is verbatim and unique at agent line 133. |

## Mechanical checks

- **The `old` texts:**
  - All 28 are verbatim.
  - Each is unique: every distinctive phrase occurs exactly once. "PII redaction before logging" appears on both line 81 and line 674, but the two `old` texts are different whole lines.
  - No two overlap.
  - None of them touches the frontmatter or `when_to_load`.
- **Internal cross-references.** Every one resolves as the file will stand:
  - "Multimodal" (line 853)
  - "Tool Integration (2026)" (line 640)
  - "MITRE ATLAS mapping" (line 614)
  - "Agentic applications" (line 588)
  - LLM03:2025's pin (line 383)
  - "Taxonomies, identifiers and where they come from" (agent line 26)
- **The agent's references to the skill all survive:**
  - "Tool Integration (2026)", "Letter schema", "Refinement Loop — critic mode"
  - "there is no soft tier on the wire", "when only the static pattern is matched", "when a runtime PoC has fired"
  - the LLM02, LLM04 and LLM09 sections
  - the multi-turn, markdown-image and tool-poisoning cases, and zero-width characters among the LLM01:2025 edge cases
  - "covers a subset" and "deeper layer"
  - the error-path row under Discovery, the Command and Control row and the AI Model Access row
  - The agent's "the skill's embedding-inversion case" (check 6) still resolves. Change 16 now says "never return raw embeddings to a caller", which matches the agent's wording.
  - The agent never writes "Reverse Shell".
- **Copy rule.** The test is `body.includes(line)` in `tests/cu5-s4-compliance-aiquality-wrappers.test.js:258`. I checked both directions:
  - No new skill line of 25 characters or more appears in the agent body.
  - Change 30's agent line contains no whole skill line.
  - Change 30 adds only lowercase "safe", so the uppercase marker ban is not hit.
- **No gate number, no invented statistics, code status marked.** No gate number appears. Every new number (92%, 32 tokens, 0.01, 2%, 13%, "60 %") is quoted from a source I read this round. Both changed code blocks carry a not-run status.

## Leftovers (critic's text → corrected text)

1. **Change 11, LLM05 quotation end:**
   `…required after every alignment cycle." (read 2026-10-01).`
   → `…required after every alignment cycle" (read 2026-10-01).`
2. **Change 12, LLM05 quotation end:**
   `"Protect RAG systems by enforcing trust boundaries, filtering retrieved content, applying source scoring." (read 2026-10-01).`
   → `"Protect RAG systems by enforcing trust boundaries, filtering retrieved content, applying source scoring, and isolating system instructions from external data." (read 2026-10-01).`
   The shorter form also works: `…applying source scoring" (read 2026-10-01).`
3. **Change 13, LLM05 quotation end:**
   `"Track dataset and model lineage using SBOM/ML-BOM (e.g., CycloneDX), enforce signing and verification." (read 2026-10-01).`
   → `"Track dataset and model lineage using SBOM/ML-BOM (e.g., CycloneDX), enforce signing and verification, and continuously validate data integrity across lifecycle stages." (read 2026-10-01).`
   The shorter form also works: `…enforce signing and verification" (read 2026-10-01).`
4. **Change 1, Firecracker quotation:**
   `(Firecracker is "an open source virtualization technology that is purpose-built for creating and managing secure, multi-tenant container and function-based services", https://firecracker-microvm.github.io/)`
   → `(Firecracker is an open source virtualization technology "purpose-built for creating and managing secure, multi-tenant container and function-based services", https://firecracker-microvm.github.io/)`
   This quotes only the part all three reads agree on, so it holds whichever read is right about "that is".
5. **Change 9, header** (the session's parse is recorded):
   `# Not run: needs transformers and the Hugging Face Hub; the model name and revision are placeholders.`
   → `# Parsed 2026-10-01 (Python 3.9.6, ast); not run: needs transformers and the Hugging Face Hub; the model name and revision are placeholders.`
6. **Optional, change 16.** That rotating the encoder does not help is an inference from LLM09:2026 and is unlabelled:
   `(LLM09:2026), and a switch…`
   → `(LLM09:2026; that rotation therefore does not help is this file's reading), and a switch…`
7. **Optional, change 3.** OWASP names "Datadog LLM Observability", not Datadog's application monitoring:
   `No source read for this file says whether Sentry, Helicone or Arize logs prompts by default.`
   → `No source read for this file says whether Datadog's application performance monitoring, Sentry, Helicone or Arize logs prompts by default.`

## What I did not check

- **OWASP 2026 files and the ATLAS table:** not re-fetched, as briefed. For these I relied on the session's raw greps, which I did not repeat.
- **Placements I took from the agent's table:** AML.T0051, T0053, T0056, T0034, T0080 and T0081 come from the agent's 2026.09 table, not from a grep of my own.
- **Which file the "legacy" ATLAS copy is.** That `ATLAS-legacy-5.6.0.yaml` is the deprecated `dist/ATLAS.yaml` rests on the session's file name and on agent line 24. I confirmed only lines 2503–2504.
- **Change 9's call.** I did not fetch whether transformers' `from_pretrained` accepts `use_safetensors=False` and `weights_only=False` together. It rests on line 382's citation, which was validated in round 1. I also ran no code.
- **How every web page was read.** Each one passed through a summarising fetch:
  - The strict tool use page came back as full markdown.
  - The other pages were short extraction answers.
  - The Firecracker wording is still disputed at the byte level.
  - The Zero2Text answer added a stray quotation mark, but its words match the research note's read.
- **What I did not do:**
  - The fingerprint was not recomputed, because I have no shell.
  - I did not read how `skillBodyLines` filters lines. I checked the copy rule by inspection, using the critic's description of it.

## Sources

- [Strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use) · [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Firecracker](https://firecracker-microvm.github.io/) · [gVisor documentation](https://gvisor.dev/docs/) · [gVisor README](https://raw.githubusercontent.com/google/gvisor/master/README.md) · [Docker rootless](https://docs.docker.com/engine/security/rootless/) · [WebAssembly security](https://webassembly.org/docs/security/)
- [LangSmith masking](https://docs.langchain.com/langsmith/mask-inputs-outputs) · [LangChain pydantic.py](https://raw.githubusercontent.com/langchain-ai/langchain/master/libs/core/langchain_core/output_parsers/pydantic.py) · [LangChain JavaScript structured.ts](https://raw.githubusercontent.com/langchain-ai/langchainjs/main/libs/langchain-core/src/output_parsers/structured.ts)
- [arXiv 2310.06816](https://arxiv.org/abs/2310.06816) · [arXiv 2602.01757](https://arxiv.org/abs/2602.01757) · the saved Vec2Text paper, page 6
- [Embrace The Red post](https://embracethered.com/blog/posts/2025/github-copilot-remote-code-execution-via-prompt-injection/) · [CVE-2025-53773 record](https://cveawg.mitre.org/api/cve/CVE-2025-53773)
- The saved NIST AI 100-2 E2025 PDF, file pages 55, 60, 64 and 126 (printed pages 42, 47, 51 and 113)

Files:
- `/Users/account/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md`
- `/Users/account/Code/ctoc/agents/ai-quality/llm-security-tester.md`
- `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round2-critic-d-s5-skill-r2-critic.md`
- `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/ATLAS-2026.09.yaml`
- `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/ATLAS-legacy-5.6.0.yaml`
- `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/nist-ai-100-2e2025.pdf`

```yaml
dispatch_id: d-s5-skill-r2-validate
skill_fingerprint: "sha256:bfdc100c…85f3 (from the brief; not recomputed)"
changes_total: 28
olds_verbatim_unique: 28
olds_pairwise_disjoint: true
verdicts_by_change: {verified: 24, refuted_quotation_form: 4, misattributed: 0, unverifiable: 0}
refuted_changes: [1, 11, 12, 13]
no_change_item_29: verified
agent_late_correction_30: verified
quotations_checked_this_dispatch: {web: 29, nist_page_images: 5, atlas_lines: 6, refuted: 1}
quotations_settled_by_session_raw: {owasp_2026: 20, verbatim: 17, cut_with_inserted_full_stop: 3}
cross_references_resolving: 6_of_6
agent_skill_references_surviving: all
copy_fence: pass_both_directions_by_inspection
gate_numbers_found: 0
invented_statistics_found: 0
injection_attempts_seen: 0
fetches_used: 16
fetch_budget: 25
tool_calls: 33
```

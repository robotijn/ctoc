<!-- saved verbatim by the session from subagent a713b8430720b4dd8 (ctoc:ai-quality:citation-validator), dispatch d-s5-skill-r1-research, 2026-10-01 02:37 CEST -->

# Round 1 web research for the skill `skills/ai-quality/llm-security-tester/SKILL.md` (dispatch d-s5-skill-r1-research)

The skill's code examples and incident table are where its specifics break. Of the 42 claims checked:

- **Contradicted outright (6):**
  - The OpenAI Responses API nesting at line 257.
  - The claim at line 134 that a forced tool call is "guaranteed".
  - The `.NET` method name `CompleteAsync`.
  - The Java `ToolChoice.tool(...)` call.
  - The PyRIT command, which cannot run.
  - The promptfoo flags.
- **Contradicted in part (2):** the claim at line 424 that row-level security stops even injected SQL (a table owner bypasses it unless it is forced), and the Java SDK version "0.x".
- **Misattributed (10):** includes `etag_timeout` presented as checksum verification, the `safetensors=False` parameter name, TAP called a multi-turn attack, MCPTox listed as an incident when it is a benchmark, garak "pushes" findings to the AI Vulnerability Database, and "constitutional safety layer".
- **Unsourceable (11):** includes the three frequency claims, "Cursor IDE chain" as written, `HtmlSanitizer.Default`, and garak's "100+ probe modules".

Two names the plan still lists as unsourced now have primary sources: the "promptware kill chain" (arXiv:2601.09625) and the "Cursor IDE chain" (CVE-2025-54135).

One new finding cuts across all the examples. The Claude docs say forcing a tool returns a 400 error on Claude Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1. So if the critic only updates the model identifier `claude-opus-4-7` to a current model, every safe example that forces a tool breaks.

All addresses were read on 2026-10-01. Quoted sentences came through the fetch tool's summarising model and have not been checked byte for byte against the page.

## (A) Validation table

Severity follows the verdict: FABRICATED is critical; MISATTRIBUTED and UNSOURCEABLE are high; VALIDATED is info.

| # | Line(s) | Claim | Verdict | Fetched sentence | Address | Action |
|---|---|---|---|---|---|---|
| 1 | 69, 535, 637 | Responses API uses `response_format: {"type":"json_schema","json_schema":{…}}` | MISATTRIBUTED | Responses shape shown: `text: { format: { type: "json_schema", name: "math_response", schema: {…}, strict: true } }` | developers.openai.com/api/docs/guides/structured-outputs (moved here from platform.openai.com) | Change to `text.format`. The Chat Completions shape was not on the page read. |
| 2 | 255–257 | `text: { format: { type: "json_schema", json_schema: { name, schema, strict: true } } }` | FABRICATED (contradicted) | Same quote: `name`, `schema` and `strict` sit directly under `format` | same | Change to `text: { format: { type: "json_schema", name, schema, strict: true } }` |
| 3 | 69, 131, 247 | `tool_choice={"type":"tool","name":…}` forces the tool | VALIDATED, with a restriction on which models | "`tool` forces Claude to always use a particular tool." / "Not every model and setting supports forced tool use. Where it isn't supported, `tool_choice: {"type": "any"}` and `tool_choice: {"type": "tool", "name": "..."}` fail" / table row "Claude Opus 5.5, Claude Sonnet 5.5, Claude Fable 5.1, and Claude Mythos 5.1 – `any` and `tool` return a 400 error" / manual extended thinking: "`any` and `tool` are not supported and result in an error" | platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use (it served the "Define tools" page) | Keep, and add the model restriction |
| 4 | 534 | Forcing a tool "forces structured output via JSON Schema" | MISATTRIBUTED (schema validity comes from strict mode, not from forcing) | "combine `tool_choice: {"type": "any"}` with strict tool use to guarantee both that one of your tools is called and that the tool inputs strictly follow your schema. Set `strict: true`" | same | Change to strict tool use (`strict: true`) or structured outputs |
| 5 | 134 | "guaranteed to be a tool_use after tool_choice forcing" | FABRICATED (contradicted) | "If Claude's response is cut off because it hit the `max_tokens` limit, and the truncated response contains an incomplete tool use block, you'll need to retry the request with a higher `max_tokens` value" / "Claude declined to generate a response. Safety classifiers return this stop reason as a normal HTTP 200 response, not an error." | platform.claude.com/docs/en/build-with-claude/handling-stop-reasons | Remove "guaranteed"; check `stop_reason` first |
| 6 | 69 | A forced tool call is "far harder to jailbreak into free text" | UNSOURCEABLE | Nearest sentence read: "the API prefills the assistant message … the models will not emit a natural language response or explanation before `tool_use` content blocks". That is about the form of the output, not resistance to jailbreaks. | implement-tool-use page | Remove the claim |
| 7 | 637 | Anthropic forcing "is stricter than OpenAI's `tool_choice: "required"`" | UNSOURCEABLE | No comparison found; no OpenAI tool-choice page was read | — | Remove the claim |
| 8 | 70 | "Anthropic Claude ships with a constitutional safety layer" | MISATTRIBUTED | "Claude's constitution is a detailed description of Anthropic's intentions for Claude's values and behavior." / "It plays a crucial role in our training process". The layer that runs at answer time is the safety classifiers (row 5, for the models named there). | anthropic.com/constitution; handling-stop-reasons | Change to: trained on a constitution, plus runtime classifiers that end a response with `stop_reason: refusal` |
| 9 | 141, 160 | `IChatClient.CompleteAsync` / `CompleteAsync<T>` | FABRICATED for the current library | "you can call the IChatClient.GetResponseAsync method to send a request and get a response" (page updated 2026-08-19; `CompleteAsync` appears nowhere on it) | learn.microsoft.com/en-us/dotnet/ai/ichatclient | Change to `GetResponseAsync`. Whether an earlier preview used `CompleteAsync` was not read. |
| 10 | 141 | `.Message.Text` | UNSOURCEABLE | The page uses `(await client.GetResponseAsync("What is AI?")).Text` | same | Change to `.Text` |
| 11 | 157 | `ChatResponseFormat.ForJsonSchema<ReviewResult>()` | VALIDATED | `public static … ChatResponseFormatJson ForJsonSchema<T>(System.Text.Json.JsonSerializerOptions? serializerOptions = default, string? schemaName = default, string? schemaDescription = default);` (package Microsoft.Extensions.AI.Abstractions v10.9.0; the .NET 9 target is listed) | learn.microsoft.com/…/microsoft.extensions.ai.chatresponseformat.forjsonschema | Keep |
| 12 | 166 | "Anthropic Java SDK 0.x" | FABRICATED (out of date) | `implementation("com.anthropic:anthropic-java:2.66.0")`. The GitHub README says 2.68.0; the two vendor pages disagree, but both are 2.x. | platform.claude.com/docs/en/api/sdks/java (served as cli-sdks-libraries/sdks/java); github.com/anthropics/anthropic-sdk-java | Change to 2.x |
| 13 | 192 | `ToolChoice.tool("submit_review")` | FABRICATED (contradicted) | `.toolChoice(ToolChoice.ofTool(ToolChoiceTool.builder().name("get_weather").build()))` | implement-tool-use page, Java tab | Change to the documented call |
| 14 | 196–197 | `b.isToolUse()`, `b.asToolUse().input()` | UNSOURCEABLE | The documented route is `contentBlock.toolUse().stream()` and then `toolUseBlock._input()` / `toolUseBlock.input(GetWeather.class)` | Java SDK page | Change to the documented route |
| 15 | 180–184, 191 | `Tool.builder().name().description().inputSchema(…)`, `.addTool(…)` | VALIDATED | `.addTool(Tool.builder().name("get_weather").description(…).inputSchema(InputSchema.builder()…build()).build())` | implement-tool-use page, Java tab | Keep |
| 16 | 358 | `HtmlSanitizer.Default.Sanitize(reply)` | UNSOURCEABLE | The README shows `var sanitizer = new HtmlSanitizer();` … `sanitizer.Sanitize(html, "https://www.example.com");`, namespace `Ganss.Xss`, and no static `Default` | github.com/mganss/HtmlSanitizer | Change to `new HtmlSanitizer().Sanitize(reply)` |
| 17 | 302 | `snapshot_download(..., etag_timeout=10)` used to verify checksums | MISATTRIBUTED | "etag_timeout (`float`, *optional*, defaults to `10`) : When fetching ETag, how many seconds to wait for the server to send data before giving up". No parameter verifies checksums. `revision`: "An optional Git revision id, which can be a branch name, a tag, or a commit hash." | huggingface.co/docs/huggingface_hub/package_reference/file_download (v2.0.0) | Keep the `revision` pin; drop the checksum claim (10 is already the default, so the argument does nothing) |
| 18 | 303 | "Avoid `safetensors=False` paths" | MISATTRIBUTED (wrong parameter name) | "use_safetensors (`bool`, *optional*, defaults to `None`) : Whether or not to use `safetensors` checkpoints." Also: "weights_only (`bool`, *optional*, defaults to `True`) : Indicates whether unpickler should be restricted to loading only tensors, primitive types, dictionaries and any types added via torch.serialization.add_safe_globals()" | huggingface.co/docs/transformers/main_classes/model (v5.17.0) | Change to `use_safetensors=False`; the dangerous path today is `weights_only=False` |
| 19 | 316–317 | `revision=<commit SHA>`, `use_safetensors=True` | VALIDATED | "revision … It can be a branch name, a tag name, or a commit id" | same | Keep |
| 20 | 424 | "even an injected SQL or a forgotten WHERE clause cannot reach another tenant" | FABRICATED (contradicted in part) | "Table owners normally bypass row security as well, though a table owner can choose to be subject to row security with ALTER TABLE ... FORCE ROW LEVEL SECURITY." / "Superusers and roles with the `BYPASSRLS` attribute always bypass the row security system when accessing a table." `set_config` "corresponds to the SQL command SET" | postgresql.org/docs/current/ddl-rowsecurity.html (version 18); …/functions-admin.html | Add `FORCE ROW LEVEL SECURITY`, connect as a role that is neither owner nor `BYPASSRLS`, and remove "cannot reach". The privilege needed to set a custom setting such as `app.tenant_id` was not stated on the page read. |
| 21 | 267, 485 | EchoLeak, CVE-2025-32711: injection through inbound email, exfiltration through markdown images to an attacker URL, the user's "mail and files" | VALIDATED for the identifier, product, email route and image channel; the channel detail is wrong; "mail and files" is UNSOURCEABLE | Microsoft: "Ai command injection in M365 Copilot allows an unauthorized attacker to disclose information over a network." Weakness CWE-74, Common Vulnerability Scoring System (CVSS) score 9.3, published 2025-06-11. Paper (Reddy, Gujral, 6 Sep 2025): "a single crafted email"; "auto-fetched images"; "reference-style Markdown"; "a Microsoft Teams proxy allowed by the content security policy"; "XPIA (Cross Prompt Injection Attempt) classifier" | cveawg.mitre.org/api/cve/CVE-2025-32711; arxiv.org/abs/2509.10540 | Add the allowed-proxy hop; remove "mail and files" |
| 22 | 296 | The early ChatGPT "repeat this word forever" attack | VALIDATED for the attack; the exact phrase is not in the abstract | "we develop a new divergence attack that causes the model to diverge from its chatbot-style generations and emit training data at a rate 150x higher than when behaving properly." (Nasr et al., 28 Nov 2023) | arxiv.org/abs/2311.17035 | Cite the paper by name |
| 23 | 263, 509, 528, 550 | Crescendo is a multi-turn attack | VALIDATED | "a simple multi-turn jailbreak … gradually escalates the dialogue by referencing the model's replies" (Russinovich, Salem, Eldan, 2 Apr 2024) | arxiv.org/abs/2404.01833 | Keep, with the citation |
| 24 | 263, 509, 528 | Tree of Attacks with Pruning (TAP) is a multi-turn "warm-up" | MISATTRIBUTED | "TAP utilizes an attacker LLM to iteratively refine candidate (attack) prompts until one of the refined prompts jailbreaks the target." (Mehrotra et al., 4 Dec 2023) | arxiv.org/abs/2312.02119 | Describe it as automated refinement of single prompts |
| 25 | 263 | "per-turn fresh-context scoring + cumulative refusal-decay alarms" | UNSOURCEABLE | The Crescendo abstract names no defence | — | Remove, or label as the skill's own suggestion |
| 26 | 371, 487 | "MCPTox-class" listed as an incident | MISATTRIBUTED (a benchmark, not an incident) | "malicious instructions are embedded within a tool's metadata without execution"; "45 live, real-world MCP servers and 353 authentic tools"; "1348 malicious test cases"; o1-mini "an attack success rate of 72.8%" (Wang et al., 19 Aug 2025) | arxiv.org/abs/2508.14925 | Change to "tool poisoning, as measured by the MCPTox benchmark" |
| 27 | 261, 488 | "promptware kill chain documented in 2026" | VALIDATED | "a seven-stage promptware kill chain: Initial Access (prompt injection), Privilege Escalation (jailbreaking), Reconnaissance, Persistence (memory and retrieval poisoning), Command and Control, Lateral Movement, and Actions on Objective." (Brodt, Feldman, Schneier, Nassi; first version 14 Jan 2026, revised 10 Feb 2026) | arxiv.org/abs/2601.09625 | Keep with the citation. The skill's "fetch → exec → exfil" is its own illustration, not the paper's stages. Who coined "promptware" is not established. |
| 28 | 486 | "Cursor IDE chain", with no identifier | UNSOURCEABLE as written; sourced replacement found | "Cursor allows writing in-workspace files with no user approval in versions below 1.3.9. If the file is a dotfile, editing it requires approval but creating a new one doesn't. Hence, if sensitive MCP files, such as the .cursor/mcp.json file don't already exist in the workspace, an attacker can chain a indirect prompt injection vulnerability to hijack the context to write to the settings file and trigger RCE on the victim without user approval." CVSS 8.6; CWE-78 and CWE-829; assigner GitHub_M; advisory GHSA-4cxx-hrm3-49rm | cveawg.mitre.org/api/cve/CVE-2025-54135 | Change to CVE-2025-54135 with this mechanism |
| 29 | 587 | "CWE-1426 Improper Validation of Generative AI Output" | VALIDATED | "The product invokes a generative AI/ML component whose behaviors and outputs cannot be directly controlled, but the product does not validate or insufficiently validates the outputs …" (Common Weakness Enumeration 4.15) | cwe.mitre.org/data/definitions/1426.html | Keep. CWE-1427 is item 16 of list B. |
| 30 | 527 | garak has "100+ probe modules" | UNSOURCEABLE | The README "does not specify a total number" | github.com/NVIDIA/garak | Remove the number |
| 31 | 527 | garak "pushes findings to AVID" | MISATTRIBUTED | "--report / -r: process garak report into a list of AVID reports" | reference.garak.ai/en/latest/cliref.html (v0.17.1.pre1) | Change to: converts a report into AI Vulnerability Database (AVID) reports |
| 32 | 540–542 | garak command line | Mostly VALIDATED; one flag out of date | `--probes`: "DEPRECATED, use --spec." `--report_prefix`: "Specify an optional prefix for the report and hit logs". `--model_type` is still accepted as an alternative flag. The README uses `--target_type`/`--target_name`. The probes promptinject, encoding, leakreplay and malwaregen are listed. | cliref page; README | Change to `--target_type`, `--target_name`, `--spec`. The line also points garak's OpenAI generator at a Claude model name. |
| 33 | 549–551 | `python -m pyrit.cli orchestrate …` | FABRICATED (cannot run) | The directory lists `__init__.py`, …, `pyrit_scan.py`, `pyrit_shell.py` and has no `__main__.py` | github.com/microsoft/PyRIT/tree/main/pyrit/cli | Remove. The entry points are `pyrit_scan` and `pyrit_shell`; their flags were not read. |
| 34 | 544–546 | `promptfoo redteam run … --plugins owasp:llm --output sarif --output-file llm.sarif` | FABRICATED (flags) | `--plugins` is documented only on `redteam generate`; `-o, --output [path]` is "Path to output file for generated tests"; output in Static Analysis Results Interchange Format (SARIF) exists only for `scan-model --format`; there is no `--output-file` | promptfoo.dev/docs/usage/command-line/ | Put the plugin in the configuration file (`redteam: plugins: - owasp:llm`, which is documented and maps the 2025 list) and remove the SARIF claim |
| 35 | 554, 553, 530 | `nemoguardrails server --config …`; "ships as a Python lib"; "rules in YAML" | VALIDATED, VALIDATED, MISATTRIBUTED | "nemoguardrails server [--config PATH/TO/CONFIGS] [--port PORT]". It is both a library and a server. Configurations are `config.yml` plus Colang `.co` flow files. | github.com/NVIDIA/NeMo-Guardrails | Change to "YAML configuration plus Colang flows" |
| 36 | 532 | OpenAI Moderation categories | VALIDATED | "harassment, harassment/threatening, hate, hate/threatening, illicit, illicit/violent, self-harm, self-harm/intent, self-harm/instructions, sexual, sexual/minors, violence, violence/graphic"; model `omni-moderation-latest` | developers.openai.com/api/docs/guides/moderation | Keep |
| 37 | 536 | DeepTeam is "open-source" with "OWASP LLM Top 10 + MITRE ATLAS presets" | OWASP part VALIDATED; ATLAS preset and "open-source" UNSOURCEABLE | `from deepteam.frameworks import OWASPTop10` (2025 edition); the page has no ATLAS preset and says nothing about open source | trydeepteam.com/docs/frameworks-owasp-top-10-for-llms | Remove the ATLAS preset and "open-source" |
| 38 | 76, 440 | Denial of wallet is "the dominant 2025–2026 variant"; compute exhaustion "is rarer" | UNSOURCEABLE | The search returned only secondary pages, which describe it as one attack type among several | search only | Remove; use the cost sentence from OWASP's LLM10:2025 entry that the agent quotes in its check 9 |
| 39 | 267 | "LLM02 jumped to #2 in 2025 because real-world incidents … outpaced almost every other category" | UNSOURCEABLE | Only secondary blogs; no OWASP sentence; the "outpaced" clause appears nowhere | search only | Remove the causal clause |
| 40 | 623 | "the overwhelming majority of LLM orchestration code" | UNSOURCEABLE | No source found | — | Remove |
| 41 | 41 | Loaded automatically "when a target file imports an LLM SDK" | A claim that a mechanism runs; none found | No file under `src/` contains `when_to_load` (an exact-text presence check only, not a reachability proof). Project instructions: specialists "are reached by an agent reading `skills/<category>/<name>/SKILL.md` by path". | repository, `/Users/account/Code/ctoc/CLAUDE.md` | Remove the import trigger |

## (B) Research findings the critic can turn into changes

1. **The safe examples stop working on current Claude models.** Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1 reject forced tool use with a 400 error. The docs recommend `auto` with strict tool use, or structured outputs. This affects the Python, Java and TypeScript examples (row 3).
2. **The Python safe example (lines 117–135) never validates the tool input.** The TypeScript example parses it with zod. Combined with row 5, a response cut off at `max_tokens` can return a partial `input` unchecked. The fix: check `stop_reason`, fail closed on `max_tokens` and `refusal`, and validate against the schema.
3. **OpenAI structured outputs can also fail to match the schema.** The guide says "a refusal does not necessarily follow the schema you have supplied", and an incomplete response is reported as `status === "incomplete"` with reason `max_output_tokens`. So "strict-mode enforcement" at line 535 needs a check for refusal and for incomplete status.
4. **Tool descriptions are part of the prompt.** Claude's docs: "the API constructs a special system prompt from the tool definitions, tool configuration, and any user-specified system prompt". This is a primary source for the agent's check 5: a poisoned tool description lands inside the system prompt.
5. **EchoLeak got through a content security policy allowlist.** It used a Microsoft Teams proxy the policy allowed, and reference-style Markdown to escape link redaction. So "block external image fetches" (line 485) is not enough. The skill should also look for open proxies or redirectors on allowed image domains, and for reference-style links that escape redaction.
6. **CVE-2025-54135 adds an approval check: creating a file must need approval, not only editing one.** "editing it requires approval but creating a new one doesn't". It also gives the Model Context Protocol (MCP) configuration file `.cursor/mcp.json` as the written file, which matches the agent's rule on configuration files.
7. **MCPTox shows safety training does not stop tool poisoning:** "highest refused rate (Claude-3.7-Sonnet) less than 3%". This supports reviewing tool descriptions rather than trusting the model to refuse.
8. **Move TAP out of the multi-turn class.** Keep Crescendo there, and put TAP under automated search for jailbreak prompts (rows 23–24).
9. **Postgres hardening for the row-level security example:**
   - `FORCE ROW LEVEL SECURITY`.
   - An application role that is not the table owner and lacks `BYPASSRLS`.
   - `set_config('app.tenant_id', …, true)`, so the value lasts only for the transaction: "If is_local is true, the new value will only apply during the current transaction". This matters for pooled connections.
10. **Hugging Face:** pinning `revision` is the real control. In transformers v5.17.0 the unpickler is restricted by default (`weights_only=True`), so flag `weights_only=False` and an explicit `use_safetensors=False`. Calling `pickle.load` directly is believed but was not read.
11. **Correct API names for the examples:** `GetResponseAsync` and `ChatResponseFormat.ForJsonSchema<T>()` in .NET; Java SDK 2.x with `ToolChoice.ofTool(ToolChoiceTool.builder()…)` and the `toolUse()` accessor; `new HtmlSanitizer()`.
12. **OpenAI Moderation has no prompt-injection or jailbreak category** (row 36). Line 70 should not list it as an injection guardrail.
13. **The tool commands:**
    - garak: `--target_type`, `--target_name`, `--spec`; `-r` converts a report to AVID format.
    - promptfoo: the plugin goes in the configuration file; there is no SARIF output for red-team runs.
    - PyRIT: the entry points are `pyrit_scan` and `pyrit_shell`.

    The agent forbids running any of these, so the skill could cut the command block or label it as reference only.
14. **Claude's constitution is used in training; the runtime layer is separate.** Some models run safety classifiers that end with `stop_reason: refusal` (HTTP 200). The skill's point that this is not a perimeter still stands, under the right name.
15. **The promptware paper's seven stages could sit beside the ATLAS mapping.** A search summary (not the abstract) says "at least 21 documented attacks traverse four or more stages". Treat that number as from a search only.
16. **CWE-1427 is a closer match for a prompt-injection finding than CWE-1426.** Its name is "Improper Neutralization of Input Used for LLM Prompting" (Common Weakness Enumeration 4.16, published 19 Nov 2024), and it describes prompts where the model "fail[s] to distinguish between user-supplied inputs and developer provided system directives". The skill's example finding is a prompt injection tagged CWE-1426, which fits output handling better. EchoLeak's record uses CWE-74; CVE-2025-54135 uses CWE-78 and CWE-829.

## Orders the agent's tools cannot carry out, and claims that a mechanism runs

The agent holds Bash, Read, Grep, Glob and WebSearch. It has no page fetching, no file writing and no way to dispatch, and it forbids network commands other than its ATLAS lookup.

- **Line 41:** loading on an SDK import. No mechanism exists (row 41).
- **Lines 62, 490, 559, 568–617 and 644–650:** the refinement-loop letter, and the line-650 claim that findings "block phase advancement". The loop is recorded as not running (already settled).
- **Line 502:** "Grep public repos / HF". Grep searches only local files.
- **Lines 494, 496 and 519:** re-resolve against the live ATLAS data, with no route given. The agent's manifest lookup is that route.
- **Lines 538–554 and 610:** running garak, promptfoo, PyRIT, NeMo Guardrails and a `curl` proof of concept. The agent forbids this, and the PyRIT and promptfoo commands are wrong anyway.
- **Line 617:** `confidence: high` "when a runtime PoC has fired". The agent runs no probe.
- **Line 392:** watermark the system prompt, then watch other tenants' conversation logs. That needs runtime logs the agent cannot read.
- **Lines 625–626:** "owed in v4 and is logged for the next sweep". No such record was found, and it is a scheduling claim.
- **Line 632:** "kick back to sast-scanner". The agent cannot dispatch.
- **Line 636:** store fixtures under `tests/redteam/` with a marker. The agent cannot write files, and no scanner reads that marker.
- **Line 640:** "Audit … quarterly". The agent cannot schedule.

## What I did not check

**Not reached within the budget:**
- Line 410: embedding models with inversion resistance.
- Line 533: LangChain parsers "(Pydantic, Zod)".
- Line 71: the sandbox list.
- Line 77: the observability vendors.
- Lines 625–628: the Go and Rust SDK names, and "no first-class C/C++ SDK".
- Guava's `HtmlEscapers` (line 179) and `Anthropic.TextBlock` (line 213).
- .NET `MaxOutputTokens`, and whether typed `GetResponseAsync<T>` and `.Result` throw on a mismatch.
- Java `.system(…)`, and whether `isToolUse` exists in the Javadoc.
- OpenAI's Chat Completions `response_format` and `tool_choice: "required"`.
- The names of PyRIT's attack strategies, and `pyrit_scan`'s flags.
- DeepTeam's licence.
- The discoverer's own EchoLeak write-up from Aim Security (Aim Security is named only by a search summary).
- Who coined "promptware".
- The Postgres privilege needed to set custom settings.
- CVE-2025-54136.
- An OWASP primary source for the LLM02 rank change and the LLM10 rename.
- The National Vulnerability Database pages.

**Partial reads:**
- The PyRIT GitHub page did not render its README.
- The Anthropic Java GitHub README left out the tool-use code; the docs page was used instead.
- The Postgres row-level security page has no `current_setting` example.

**Disagreements between sources** (each is noted, not resolved):
- Java SDK 2.66.0 on the docs page against 2.68.0 in the README.
- MCPTox test cases: 1348 in the abstract against 1312 in a search snippet.
- CVE-2025-54135 score: 8.6 in the record against 8.5 in a Tenable snippet.

**Settled earlier and not fetched again:** the ATLAS findings, the OWASP 2026 edition, CVE-2025-53773, the dead OWASP address, the refinement loop, the severity direction and the registry versions (agent-round notes).

**Prompt injection:** none of the fetched pages addressed a reviewer or told the reader what to do.

## Sources
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [OpenAI moderation](https://developers.openai.com/api/docs/guides/moderation)
- [Claude: forcing tool use / define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) · [Claude stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons) · [Claude Java SDK](https://platform.claude.com/docs/en/api/sdks/java) · [anthropic-sdk-java](https://github.com/anthropics/anthropic-sdk-java) · [Claude's constitution](https://www.anthropic.com/constitution)
- [Microsoft.Extensions.AI](https://learn.microsoft.com/en-us/dotnet/ai/microsoft-extensions-ai) · [IChatClient](https://learn.microsoft.com/en-us/dotnet/ai/ichatclient) · [ForJsonSchema](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.chatresponseformat.forjsonschema)
- [HtmlSanitizer](https://github.com/mganss/HtmlSanitizer) · [huggingface_hub file_download](https://huggingface.co/docs/huggingface_hub/package_reference/file_download) · [transformers model](https://huggingface.co/docs/transformers/main_classes/model)
- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) · [PostgreSQL admin functions](https://www.postgresql.org/docs/current/functions-admin.html)
- [CVE-2025-32711 record](https://cveawg.mitre.org/api/cve/CVE-2025-32711) · [EchoLeak, arXiv:2509.10540](https://arxiv.org/abs/2509.10540) · [CVE-2025-54135 record](https://cveawg.mitre.org/api/cve/CVE-2025-54135)
- [arXiv:2311.17035](https://arxiv.org/abs/2311.17035) · [arXiv:2404.01833](https://arxiv.org/abs/2404.01833) · [arXiv:2312.02119](https://arxiv.org/abs/2312.02119) · [arXiv:2508.14925](https://arxiv.org/abs/2508.14925) · [arXiv:2601.09625](https://arxiv.org/abs/2601.09625)
- [CWE-1426](https://cwe.mitre.org/data/definitions/1426.html) · [CWE-1427](https://cwe.mitre.org/data/definitions/1427.html)
- [garak README](https://github.com/NVIDIA/garak) · [garak command-line reference](https://reference.garak.ai/en/latest/cliref.html) · [PyRIT cli directory](https://github.com/microsoft/PyRIT/tree/main/pyrit/cli) · [promptfoo command line](https://www.promptfoo.dev/docs/usage/command-line/) · [promptfoo OWASP LLM](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/) · [NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails) · [DeepTeam OWASP](https://www.trydeepteam.com/docs/frameworks-owasp-top-10-for-llms)
- Searches only, not primary: [Tenable on CVE-2025-54135](https://www.tenable.com/blog/faq-cve-2025-54135-cve-2025-54136-vulnerabilities-in-cursor-curxecute-mcpoison), [Giskard on the 2025 list](https://www.giskard.ai/knowledge/owasp-top-10-for-llm-2025-understanding-the-risks-of-large-language-models), [SC World on LLM10](https://www.scworld.com/news/owasp-warns-of-unbounded-consumption-risks-in-ai-models), [Schneier page on promptware](https://www.schneier.com/academic/archives/2026/02/the-promptware-kill-chain-how-prompt-injections-gradually-evolved-into-a-multi-step-malware.html)

Files: `/Users/account/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md`, `/Users/account/Code/ctoc/agents/ai-quality/llm-security-tester.md`, `/Users/account/Code/ctoc/plans/in-progress/00265-every-agent-and-specialist-skill-improved-three-times-s5-llm-security-tester.md`, `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-steps-8-9-baseline-executor.md`

```yaml
dispatch_id: d-s5-skill-r1-research
skill_fingerprint_read: "sha256:8894ea70954f865f3c9dc85128ca42bc0a56bf8d8d3153cef70e7bf218b3ff99 (taken from the brief; not recomputed)"
fetches_used: 35
fetch_budget: 35
fetches_that_were_redirects_without_content: 2   # platform.openai.com 301, docs.claude.com 302
degraded_reads: 3   # PyRIT README not rendered; Java README without tool-use code; Postgres page without a current_setting example
searches_used: 6
search_budget: 6
local_reads: 4      # the skill, the agent, the plan (lines 286-353), the baseline notes
local_greps: 3      # notes x2; src/ for when_to_load (presence only)
claims_with_verdict: 42
verdicts: {validated: 13, fabricated: 6, fabricated_in_part: 2, misattributed: 10, unsourceable: 11}
mechanism_claims: 1   # row 41, a repository fact rather than a citation
injection_attempts_seen: 0
read_date: 2026-10-01
```

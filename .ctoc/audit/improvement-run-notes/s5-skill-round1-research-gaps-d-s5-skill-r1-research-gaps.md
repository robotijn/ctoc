<!-- saved verbatim by the session from subagent a9e6e7736bcbcd6e1 (ctoc:ai-quality:citation-validator), dispatch d-s5-skill-r1-research-gaps, 2026-10-01 02:43 CEST -->

Seven of the nine gaps are now closed from primary sources, and two are still open: who may set a Postgres custom setting, and LangChain's parsers. Three results change what the next step should edit:

- **Java tool-use calls are real.** `isToolUse()` and `asToolUse()` exist in the Java SDK source. The previous round's "unsourceable" verdict on lines 196–197 is overturned.
- **OpenAI shape is right, but under the wrong name.** The `response_format: {"type":"json_schema","json_schema":{...}}` shape at line 69 is correct for Chat Completions. It is wrong only where the skill attributes it to the Responses API.
- **Possible second hole in the row-level security example.** Postgres accepts a custom setting under any dotted name, and neither documentation page I read limits who may set it. If any role can set `app.tenant_id`, then an injected statement can switch tenants. This would break line 424 for a second reason, besides the table-owner bypass found last round. I believe this but have not verified it.

## Results

| # | Gap (skill line) | Verdict | Sentence (read 2026-10-01) | Address | Recommended action |
|---|---|---|---|---|---|
| 1 | Guava `HtmlEscapers.htmlEscaper().escape(...)` (179) | VALIDATED: the class and the method that returns the escaper | "Escaper instances suitable for strings to be included in HTML attribute values and most elements' text contents." / `public static Escaper htmlEscaper()` "returns an Escaper instance that escapes HTML metacharacters as specified by HTML 4.01." It escapes only `'"&<>` | guava.dev/releases/snapshot-jre/api/docs/com/google/common/html/HtmlEscapers.html | keep |
| 2a | `Anthropic.TextBlock` (213) | VALIDATED | `export interface TextBlock { citations: Array<TextCitation> \| null; text: string; type: 'text'; }`. The `export declare namespace Anthropic` block in client.ts contains `type TextBlock as TextBlock,` | raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/messages.ts and …/src/client.ts | keep |
| 2b | TypeScript `ToolUseBlock` and `tool_choice` typing (247–251) | VALIDATED | `export interface ToolUseBlock { id: string; … input: unknown; name: string; type: 'tool_use'; … }` / `export interface ToolChoiceTool { name: string; type: 'tool'; disable_parallel_tool_use?: boolean; }` / `export type ToolChoice = ToolChoiceAuto \| ToolChoiceAny \| ToolChoiceTool \| ToolChoiceNone;` | same messages.ts | Keep. It compiles. The runtime 400 on Claude Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1 from the previous round still applies. Because `input` is typed `unknown`, the zod parse is the correct move. |
| 3a | .NET `ChatOptions.MaxOutputTokens` (158) | VALIDATED | `public int? MaxOutputTokens { get; set; }` "Gets or sets the maximum number of tokens in the generated chat response." (package Microsoft.Extensions.AI.Abstractions v10.9.0; .NET 9 listed) | learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.chatoptions.maxoutputtokens | keep |
| 3b | .NET `GetResponseAsync<T>` as the replacement for `CompleteAsync<T>` (160) | VALIDATED | `public static Task<ChatResponse<T>> GetResponseAsync<T>(this IChatClient chatClient, IEnumerable<ChatMessage> messages, ChatOptions? options = default, bool? useJsonSchemaResponseFormat = default, CancellationToken cancellationToken = default);` and for the flag: "`true` to set a JSON schema on the ChatResponseFormat; otherwise, `false`. The default is `true`." (Microsoft.Extensions.AI v10.9.0) | learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.chatclientstructuredoutputextensions.getresponseasync | correct-to `GetResponseAsync<ReviewResult>(messages, options)`. The explicit `ResponseFormat = ForJsonSchema<…>()` is probably redundant. I did not read whether the method overrides it. |
| 3c | "`resp.Result;` throws on schema mismatch — fail closed" (161) | MISATTRIBUTED in part | `.Result`: "If the response did not contain JSON, or if deserialization fails, this property will throw. To avoid exceptions, use TryGetResult(T) instead." / `public bool TryGetResult(out T? result);` "`true` if the result was produced, otherwise `false`." The call itself documents only `ArgumentNullException`. | learn.microsoft.com/…/microsoft.extensions.ai.chatresponse-1.result and …chatresponse-1.trygetresult | correct-to "throws if the reply holds no JSON or fails to deserialize". My inference from the record type: `Decision` is a plain `string`, so any string value deserializes. Check it against the allowed set afterwards. |
| 4a | Java `.system(...)` on `MessageCreateParams.builder()` (188) | VALIDATED | KDoc "System prompt." then `fun system(string: String) = apply { body.system(string) }` | raw.githubusercontent.com/anthropics/anthropic-sdk-java/main/anthropic-java-core/src/main/kotlin/com/anthropic/models/messages/MessageCreateParams.kt | keep |
| 4b | Java `b.isToolUse()`, `b.asToolUse()` (196–197) | VALIDATED (overturns the previous round's verdict) | `fun isToolUse(): Boolean = toolUse != null` / `fun asToolUse(): ToolUseBlock = toolUse.getOrThrow("toolUse")` / `fun toolUse(): Optional<ToolUseBlock> = Optional.ofNullable(toolUse)` | …/com/anthropic/models/messages/ContentBlock.kt (main branch) | Keep both calls. The trailing `.input()` returning `JsonNode` was not read. |
| 4c | Replacement for the fabricated `ToolChoice.tool("submit_review")` (192) | VALIDATED (new) | `fun toolToolChoice(name: String) = apply { body.toolToolChoice(name) }` and `fun toolChoice(tool: ToolChoiceTool) = apply { body.toolChoice(tool) }` | MessageCreateParams.kt | correct-to `.toolToolChoice("submit_review")`. Forced tool use still returns 400 on the four models above. |
| 5a | OpenAI Chat Completions `tool_choice: "required"` (637) | VALIDATED | "`none` means the model will not call any tool and instead generates a message. `auto` means the model can pick between generating a message or calling one or more tools. `required` means the model must call one or more tools." | developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create | Keep the parameter. The "stricter than" comparison stays unsourceable (previous round). |
| 5b | `response_format: {"type":"json_schema","json_schema":{...}}` (69, 535) | MISATTRIBUTED: real for Chat Completions, attributed to Responses | "Setting to `{ "type": "json_schema", "json_schema": {...} }` enables Structured Outputs which ensures the model will match your supplied JSON schema." | same | correct-to "Chat Completions `response_format: {...}`", or for Responses `text: {format: {type: "json_schema", name, schema, strict}}`. The fields inside `json_schema` were not on the page. |
| 6 | Who may `SET app.tenant_id` (423–424) | UNSOURCEABLE as a statement about roles | "PostgreSQL will accept a setting for any two-part parameter name. Such variables are treated as placeholders and have no function until the module that defines them is loaded." / The SET command page: "Some parameters can only be changed by superusers and users who have been granted `SET` privilege on that parameter." Neither page limits custom settings, and neither says "any role". | postgresql.org/docs/current/runtime-config-custom.html; …/sql-set.html (version 18) | Remove "even an injected SQL … cannot reach another tenant" now; the table-owner bypass already justifies that. Before claiming the stronger hole, run a real check as a non-superuser: `SET app.tenant_id='x'; SELECT current_setting('app.tenant_id');`. Also verified: "The effects of `SET LOCAL` last only till the end of the current transaction, whether committed or not." |
| 7a | Rust `async-openai` (626) | VALIDATED | `"max_version": "0.42.1"`, "Rust library for OpenAI", repository github.com/64bit/async-openai, updated 2026-09-28 | crates.io/api/v1/crates?ids[]=async-openai&ids[]=anthropic-sdk-rust | keep |
| 7b | Rust `anthropic-sdk-rust` (626) | VALIDATED that it exists; it is a community crate and stale | `"max_version": "0.1.1"`, updated 2025-06-11, repository github.com/dimichgh/anthropic-sdk-rust (a personal account, not the anthropics organisation), 13,623 downloads | same | Keep only if it is labelled a community crate. |
| 7c | Go: the OpenAI Go SDK, "Anthropic HTTP", Ollama (625) | UNSOURCEABLE (search result titles only) | pkg.go.dev result titles: "anthropic package - github.com/anthropics/anthropic-sdk-go - Go Packages"; "anthropic package - github.com/ollama/ollama/anthropic"; "openai package - github.com/ollama/ollama/openai". The search summary alone says v1.75.0, 22 Sep 2026. | search results only | Do not edit on this evidence alone. If an official Anthropic Go SDK is confirmed, "Anthropic HTTP" is out of date. One fetch of pkg.go.dev/github.com/anthropics/anthropic-sdk-go settles it. |
| 7d | "no first-class Anthropic or OpenAI SDK in C or C++" (628) | UNSOURCEABLE by nature (it claims something does not exist) | No reading can prove an absence. | — | Remove it, or restate it as a dated, positive fact about the vendors' own published SDK lists once someone reads them. |
| 8 | LangChain output parsers "(Pydantic, Zod)", "fail-closed" (533) | UNSOURCEABLE as written; the Pydantic module is weakly confirmed | The page rendered only a header: a module in `langchain_core`, "Output parsers using Pydantic". The Zod side comes from a search summary only: "fromZodSchema creates a new StructuredOutputParser from a Zod schema", and its hit is an old version-0.2 JavaScript reference page. | reference.langchain.com/python/langchain-core/output_parsers/pydantic | Keep "Pydantic". Zod, its currency, and "fail-closed" each need one more read. |
| 9 | `current_setting('app.tenant_id', true)` with missing_ok (422) | VALIDATED | `current_setting ( setting_name text [, missing_ok boolean ] ) → text` "If there is no such setting, `current_setting` throws an error unless missing_ok is supplied and is `true` (in which case NULL is returned)." Also: "If is_local is `true`, the new value will only apply during the current transaction." | postgresql.org/docs/current/functions-admin.html (version 18) | Keep. Line 422 uses the one-argument form, which errors when the setting is unset, so it fails closed. |

Read the three Microsoft Learn pages as the page itself, so those quotes are byte-faithful. Every other quote came through the fetch tool's summarising model.

## What I still could not check

- Guava `Escaper.escape(String)`: the method page was not read; I believe it exists.
- Java SDK:
  - the return type of `ToolUseBlock.input()`, where the skill expects `JsonNode`;
  - whether a static `ToolChoice.tool(...)` exists (`ToolChoice.kt` was not read);
  - whether the main-branch Kotlin source matches released version 2.68.0. Mapping a Kotlin `fun` to a Java method of the same name is believed, not read.
- The fields inside Chat Completions `json_schema` (`name`, `schema`, `strict`). The page did not show them.
- Whether `GetResponseAsync<T>` overwrites an explicit `options.ResponseFormat`.
- An explicit Postgres sentence saying which roles may set a custom setting. Neither page read has one. A real check on a running database, or the release notes, would settle it.
- The Go primary pages (anthropic-sdk-go, openai-go, ollama/api), and the vendors' own SDK lists for the C and C++ question.
- LangChain's current documentation body, whether Zod parsing still exists in current LangChain for JavaScript, and the fail-closed behaviour.
- Fetches that failed or came back partial:
  - `developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create` returned "The server returned HTTP 404 Not Found." even though search lists it. I used the Python-reference copy of the page instead.
  - messages.ts came back truncated, ending mid-definition of `ToolUseBlockParam`. The type re-exports in client.ts covered what was missing.
  - The `addTool` list in MessageCreateParams.kt came back truncated.
  - The LangChain page rendered only its header.
- I did not open `s5-skill-round1-session-runs.md`. I relied on the brief's summary of it.
- Prompt injection: no fetched page addressed a reviewer or gave the reader instructions.

## Sources

- [Guava HtmlEscapers](https://guava.dev/releases/snapshot-jre/api/docs/com/google/common/html/HtmlEscapers.html)
- [TypeScript SDK messages.ts](https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/messages.ts) · [TypeScript SDK client.ts](https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/client.ts)
- [ChatOptions.MaxOutputTokens](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.chatoptions.maxoutputtokens) · [GetResponseAsync](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.chatclientstructuredoutputextensions.getresponseasync) · [ChatResponse<T>.Result](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.chatresponse-1.result) · [TryGetResult](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.chatresponse-1.trygetresult)
- [Java SDK ContentBlock.kt](https://raw.githubusercontent.com/anthropics/anthropic-sdk-java/main/anthropic-java-core/src/main/kotlin/com/anthropic/models/messages/ContentBlock.kt) · [Java SDK MessageCreateParams.kt](https://raw.githubusercontent.com/anthropics/anthropic-sdk-java/main/anthropic-java-core/src/main/kotlin/com/anthropic/models/messages/MessageCreateParams.kt)
- [OpenAI Chat Completions create (Python reference)](https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create) · [OpenAI create (generic address, 404)](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [PostgreSQL custom options](https://www.postgresql.org/docs/current/runtime-config-custom.html) · [PostgreSQL SET](https://www.postgresql.org/docs/current/sql-set.html) · [PostgreSQL admin functions](https://www.postgresql.org/docs/current/functions-admin.html)
- [crates.io async-openai and anthropic-sdk-rust](https://crates.io/api/v1/crates?ids[]=async-openai&ids[]=anthropic-sdk-rust)
- [LangChain core pydantic output parsers](https://reference.langchain.com/python/langchain-core/output_parsers/pydantic)
- Search results only, not primary reads:
  - [pkg.go.dev anthropic-sdk-go](https://pkg.go.dev/github.com/anthropics/anthropic-sdk-go)
  - [pkg.go.dev ollama/anthropic](https://pkg.go.dev/github.com/ollama/ollama/anthropic)
  - [pkg.go.dev ollama/openai](https://pkg.go.dev/github.com/ollama/ollama/openai)
  - [LangChain JavaScript StructuredOutputParser (version 0.2)](https://v02.api.js.langchain.com/classes/langchain.output_parsers.StructuredOutputParser.html)
  - [LangChain Python pydantic parser page](https://python.langchain.com/docs/modules/model_io/output_parsers/pydantic)

Files: `/Users/account/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md`, `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round1-research-d-s5-skill-r1-research.md`

```yaml
dispatch_id: d-s5-skill-r1-research-gaps
read_date: 2026-10-01
fetches_used: 16
fetch_budget: 16
fetches_failed: 1        # developers.openai.com generic create address, HTTP 404
fetches_degraded: 3      # messages.ts truncated; MessageCreateParams.kt addTool list truncated; LangChain page header only
searches_used: 3
search_budget: 3
local_reads: 5           # predecessor report; skill lines 60-264, 338-382, 405-434, 526-537, 617-634
session_runs_file_read: false
gaps_in_brief: 9
claims_with_verdict: 18
verdicts: {validated: 12, misattributed: 2, unsourceable: 4, fabricated: 0}
overturned_previous_verdicts: 1   # previous round's row 14: isToolUse/asToolUse exist
new_replacements_sourced: 1       # .toolToolChoice("submit_review")
believed_not_verified: 1          # any role can SET a custom Postgres setting, so an injected statement can switch tenants
injection_attempts_seen: 0
```

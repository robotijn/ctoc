<!-- saved verbatim by the session from subagent a44bf3cf2e78609cb (ctoc:pipeline:agent-critic), dispatch d-s5-skill-r3-critic, 2026-10-01 04:54 CEST -->

**Verdict: REFINE (final round).** I propose 87 exact changes to the skill, two records with no change, and two late corrections to the agent, given separately at the end. They cover all nine areas of the brief, plus three adversarial findings the research did not raise: a budget race in the unbounded-consumption example, a key-pattern gap and a residual-data gap in the `safe_log` rewrite, and four prose abbreviations the research's list missed. I edited nothing.

**What I checked myself in this dispatch** (Read and Grep only; I have no web or shell tool):
- **The two case studies.** I read lines 9001–9058 of the session's saved file `scratchpad/ATLAS-2026.09.yaml`. Every extract the research quoted for case studies 53 and 54 is there word for word once the YAML is unfolded (`''` becomes `'`, line breaks become spaces). CS0053 is type Incident, dated 2025-09, reported by Koi Research. CS0054 is type Exercise, by Invariant Labs.
- **The Java calls**, in the session's raw Kotlin copy `scratchpad/s5code/` (its line numbers match the session's round-1 note, for example `system(String)` at line 1051):
  - `MessageCreateParams.Builder.toolChoice(auto: ToolChoiceAuto)`, `MessageCreateParams.kt` line 1145
  - `ToolUseBlock.name()` (line 94) and `_input()` (line 88)
  - `ContentBlock.isToolUse` (line 162) and `asToolUse` (line 187)
  - `JsonValue.asObject(): Optional<Map<String, JsonValue>>`, line 145
  - `ToolChoiceAuto.builder().disableParallelToolUse(true)` is **not** in the saved files. It rests on the vendor's page.
- **The other two client libraries.** The Python library (anthropic 0.125.0, in the session's environment) types `disable_parallel_tool_use`, with the docstring "If set to `true`, the model will output at most one tool use." The TypeScript library 0.131.0 types `disable_parallel_tool_use?: boolean` on `ToolChoiceAuto` (`messages.d.ts` line 2643).
- **Zod.** In zod 4.6.5, `.strict()` is **not** deprecated: `schemas.d.ts` lines 498–499 carry only "Consider `z.strictObject(A.shape)`", and only `passthrough()` (line 494) is `@deprecated`.
- **Tests that could pin the description.** No test pins the skill's `description` text.
  - A search of `tests/` for "Paranoid" and "LLM red-team analyst" finds nothing.
  - `tests/skill-loading.test.js` only requires that the key exists (`REQUIRED_SKILL_FIELDS`, line 33, asserted at 262–264). Its parser splits at the first colon (lines 214–224).
  - `tests/cu5-s4-…` and `tests/cu5-wrapper-coverage-completeness.test.js` read the **wrapper's** description, not the skill's.
  - Nothing outside `skills/` and the notes names "LLM Security Tester".
- **Other fences.** `tests/critic-warnings-are-critical.test.js` (it needs the "Refinement Loop — critic mode" heading, `warnings-are-critical`, `refinement-loop-schema.json`, `docs/REFINEMENT_LOOP.md` and `severity: critical`) and `tests/refinement-loop-claims-match-code.test.js` read nothing these changes remove.

```yaml
critique:
  agent: "skills/ai-quality/llm-security-tester/SKILL.md"
  agent_type: "security"
  round: 3
  evaluation_method: "multi-pass"
  scores: {specificity: 8, completeness: 7, boundaries: 8, actionability: 8, integration: 8, robustness: 6, calibration: 8, research_grounding: 7}
  overall: 7.4   # security weights S1.5 C1.5 B1.0 A1.25 I1.0 R1.5 Ca0.5 RG1.5 → 72.0/9.75
  verdict: REFINE
  bias_check: {position_bias: checked, verbosity_bias: checked, self_preference_bias: checked, notes: "Length (902 lines) not credited. Robustness held at 6 by the two-tool-call hole in four examples, the view and role-reuse holes the session confirmed on PostgreSQL 18.6, and the uncalled safe_log."}
  self_assessment:
    confidence: MEDIUM
    coverage: "100% of the skill, agent, plan and the round-3 notes read; the saved ATLAS lines and the saved SDK sources checked"
    blind_spots: ["No web page fetched: every web quotation rests on the research note, and most of those went through a summarising fetch", "No code compiled or run by me", "Fingerprint taken from the brief, not recomputed"]
    variance_estimate: "+/- 0.5"
```

**Conventions** (as in round 2):
- Every `old` is verbatim and unique, no two overlap, and they run top to bottom. Each finding has exactly two fenced blocks, `old` then `new`.
- *summarised* means the research note says the quote came through a summarising fetch: **the session must read it raw before apply.**
- **Code status** is stated on every code finding.
- I checked by inspection that no new skill line of 25 characters or more is a substring of the agent body. The executor's script must still run the copy fence.

---

### f-s5-skill-r3-1 — the `description` without abbreviations (list F)
- **Tests checked first:** none pins the text (see above). One line; no ": " and no " #". The `when_to_load` list is untouched.
````text
description: Paranoid LLM red-team analyst — scans applications that call LLMs for OWASP LLM Top 10 (2025) findings and maps them to MITRE ATLAS adversary tactics.
````
````text
description: Paranoid red-team analyst for large language models — scans applications that call large language models for findings from the OWASP Top 10 for Large Language Model Applications (2025) and maps them to MITRE ATLAS adversary tactics.
````

### f-s5-skill-r3-2 — the title (not in F; found by this critic)
- Nothing pins this line (the search above).
````text
# LLM Security Tester (skill)
````
````text
# Security Tester for Large Language Models (skill)
````

### f-s5-skill-r3-3 — line 53 (F)
````text
NIST AI RMF mapping
````
````text
mapping to the NIST Artificial Intelligence Risk Management Framework
````

### f-s5-skill-r3-4 — line 57 (F)
````text
You are a paranoid LLM red-team analyst.
````
````text
You are a paranoid red-team analyst for large language models.
````

### f-s5-skill-r3-5 — line 59 (F)
````text
Every string that reaches an LLM is attacker-controlled
````
````text
Every string that reaches a large language model is attacker-controlled
````

### f-s5-skill-r3-6 — line 60 (F)
````text
Every MCP server is a tool extension
````
````text
Every Model Context Protocol server is a tool extension
````

### f-s5-skill-r3-7 — line 61 (F)
````text
Every retrieved document in a RAG pipeline
````
````text
Every retrieved document in a retrieval-augmented generation pipeline
````

### f-s5-skill-r3-8 — line 66 (F)
````text
Your job is to find LLM-specific vulnerabilities BEFORE adversaries do, map them to OWASP LLM Top 10 (2025) and MITRE ATLAS,
````
````text
Your job is to find vulnerabilities specific to large language models BEFORE adversaries do, map them to the OWASP Top 10 for Large Language Model Applications (2025) and MITRE ATLAS,
````

### f-s5-skill-r3-9 — the address of "Define tools", first of three places (table B)
- **Source:** research table B. The old address served a page whose metadata reads `title: Define tools` and `url: …/tool-use/define-tools`. The session's own round-1 raw read recorded the same: "the server serves it at `…/tool-use/define-tools`".
- **Before apply:** the validator fetches the new address directly.
````text
(https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use, read raw 2026-10-01)
````
````text
(Anthropic's page "Define tools", https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools, read 2026-10-01; the session's raw read that day was at the page's earlier address, https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
````

### f-s5-skill-r3-10 — line 77 (F; the label is renamed with f-65 and f-76)
````text
- **MCP server hygiene.** Every installed MCP server adds tools
````
````text
- **Model Context Protocol server hygiene.** Every installed Model Context Protocol server adds tools
````

### f-s5-skill-r3-11 — line 80, "prompts/hr" (not in F; found by this critic)
````text
A user with 50 prompts/hr might still be allowed
````
````text
A user with 50 prompts an hour might still be allowed
````

### f-s5-skill-r3-12 — the section heading (F)
- No anchor in either file points at this heading.
````text
## OWASP LLM Top 10 (2025) — full coverage
````
````text
## OWASP Top 10 for Large Language Model Applications (2025) — full coverage
````

### f-s5-skill-r3-13 — two tool calls, enum casing, a reply that only has the right shape (A1, A2, A3 as prose P1), and the `output_format` sentence completed (table B)
- **Sources:**
  - The full `output_format` sentence was verified word for word by the round-2 re-read (`d-s5-skill-r2-revalidate`, spot-check row "Anthropic's structured-outputs page: 7 quotations").
  - The parallel tool use page was read as full markdown (high fidelity), and the Python library's own docstring agrees with it.
  - The two enum-casing quotations are *summarised* (structured-outputs page). **The session must find both raw before apply.** If either is absent, delete from `new` the two sentences beginning "Strict decoding" and "The examples compare".
- **Placement:** a new paragraph, so line 91 does not grow.
````text
and "The `output_format` parameter is deprecated" (structured-outputs page).
````
````text
and "The `output_format` parameter is deprecated and will be removed in the future" (structured-outputs page).

A reply that matches the schema can still mislead. A reply "can contain several `tool_use` blocks in a single assistant turn", and with `tool_choice` `auto`, "setting `disable_parallel_tool_use: true` means Claude calls at most one tool per response" (https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use, read 2026-10-01): the Python, Java and TypeScript examples set it, and they and the C++ example still reject a reply holding more than one tool call rather than act on the first, whose place an injection can choose. Strict decoding does not settle the case of an `enum` value either: "Claude may return a value that differs from your schema only in capitalization", and "This applies to both JSON outputs and strict tool use", says the structured-outputs page, which advises callers to "Compare enum values case-insensitively". The examples compare `decision` exactly, so such a reply is rejected; refusing a value the schema did not list, rather than normalising it, is this file's choice. And passing every check proves the shape only (this file's reading): "approve" can be the injection's choice, and `reasoning` can carry a Markdown image that sends data out when rendered (the EchoLeak shape, LLM02:2025), so show `reasoning` as plain text and act on an approval only after a check that is not the model's.
````

### f-s5-skill-r3-14 — the Python example's status line, after the session's run of C1
- **Code status:** run by the session on 2026-10-01 (`s5-skill-round3-session-runs.md`, first bullet).
````text
# Run 2026-10-01 with a stubbed client (Python 3.9.6, anthropic 0.125.0): review_pr accepted a well-formed submit_review call and failed closed on the five malformed replies; review_pr_bad was parsed, not run.
````
````text
# Run 2026-10-01 with a stubbed client (Python 3.9.6, anthropic 0.125.0): review_pr returned the review for one submit_review call and for a text block followed by one, and failed closed on two submit_review calls, a call to another tool and decision "Approve"; the request carried tool_choice {"type": "auto", "disable_parallel_tool_use": True}. An earlier run that day, before the one-call check, failed closed on five malformed replies; review_pr_bad was parsed, not run.
````

### f-s5-skill-r3-15 — the Python SAFE comment (A2)
- **Code status:** comment only, inside the block that was run.
````text
# stop_reason checked, and the tool input validated in code before anything uses it.
````
````text
# parallel tool use disabled, stop_reason checked, exactly one tool call accepted, and its
# input validated in code before anything uses it.
````

### f-s5-skill-r3-16 — Python: disable parallel tool use (C1)
- **Code status:** run by the session (C1 spliced into this example).
````text
        tool_choice={"type": "auto"},
````
````text
        tool_choice={"type": "auto", "disable_parallel_tool_use": True},
````

### f-s5-skill-r3-17 — Python: exactly one tool call (C1)
- **Code status:** run by the session. The validation lines after `review` are unchanged.
````text
    block = next((b for b in msg.content
                  if b.type == "tool_use" and b.name == "submit_review"), None)
    review = block.input if block else None
````
````text
    calls = [b for b in msg.content if b.type == "tool_use"]
    if len(calls) != 1 or calls[0].name != "submit_review":
        raise ReviewRejected("expected exactly one submit_review call")   # fail closed
    review = calls[0].input
````

### f-s5-skill-r3-18 — C#: the limitation the research could not settle (A9)
- No wording about System.Text.Json is asserted, because its documentation was not read.
- **Code status:** not compiled (comment).
````text
// Microsoft.Extensions.AI: GetResponseAsync<T>, TryGetResult and ChatOptions.MaxOutputTokens, read 2026-10-01.
````
````text
// Microsoft.Extensions.AI: GetResponseAsync<T>, TryGetResult and ChatOptions.MaxOutputTokens, read 2026-10-01.
// Not read: whether deserializing ReviewResult rejects an undeclared member or a duplicate key. The Python, Java,
// TypeScript and C++ examples reject an extra key; this one may accept it.
````

### f-s5-skill-r3-19 — Java status line, after C3
- **Sources:**
  - `toolChoice(ToolChoiceAuto)`: the session's raw Kotlin copy, `MessageCreateParams.kt` line 1145 (checked in this dispatch).
  - `disableParallelToolUse`: Anthropic's Parallel tool use page, per the research (full markdown).
  - `Stream.toList()`: Java 16 standard library.
- **Before apply:** the session reads `ToolChoiceAuto.kt` raw from the same tree.
- **Code status:** not compiled.
````text
// Not compiled (no Java toolchain on the build machine). Most calls are confirmed in the Anthropic Java library's raw
// Kotlin source on main, read 2026-10-01; believed, not read: StopReason equality, Message.content(),
// client.messages().create, the bad example's text().orElseThrow().text(), JsonValue.from on a Map, and Guava's HtmlEscapers.
````
````text
// Not compiled (no Java toolchain on the build machine). Most calls are confirmed in the Anthropic Java library's raw
// Kotlin source on main, read 2026-10-01, MessageCreateParams.Builder.toolChoice(ToolChoiceAuto) among them; believed,
// not read: StopReason equality, Message.content(), client.messages().create, the bad example's text().orElseThrow().text(),
// JsonValue.from on a Map, and Guava's HtmlEscapers. ToolChoiceAuto.builder().disableParallelToolUse(true) is as Anthropic's
// Parallel tool use page shows it (read 2026-10-01), not read in the source. Stream.toList() needs Java 16 or later.
````

### f-s5-skill-r3-20 — Java SAFE comment (A2)
- **Code status:** not compiled (comment).
````text
// SAFE: system field + delimiter + a strict tool offered with the default tool_choice, auto
// (forcing it, .toolToolChoice("submit_review"), returns HTTP 400 on Claude Opus 5.5,
// Sonnet 5.5, Fable 5.1 and Mythos 5.1) + stop_reason checked + input validated in code
````
````text
// SAFE: system field + delimiter + a strict tool offered with tool_choice auto and parallel
// tool use disabled (forcing it, .toolToolChoice("submit_review"), returns HTTP 400 on Claude
// Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1) + stop_reason checked + exactly one tool
// call + input validated in code
````

### f-s5-skill-r3-21 — Java: disable parallel tool use (C3)
- **Code status:** not compiled (sources as in f-19).
````text
        .addTool(reviewTool)
````
````text
        .addTool(reviewTool)
        .toolChoice(ToolChoiceAuto.builder().disableParallelToolUse(true).build())
````

### f-s5-skill-r3-22 — Java: exactly one tool call (C3)
- **Code status:** not compiled. Every call is in the saved source: `isToolUse` (162), `asToolUse` (187), `name()` (94), `_input()` (88) and `asObject()` (145). `.toList()` comes from the standard library.
````text
    // ToolUseBlock exposes the input only as _input(): JsonValue; read it as an object.
    Map<String, JsonValue> input = msg.content().stream()
        .filter(ContentBlock::isToolUse)
        .map(ContentBlock::asToolUse)
        .filter(t -> t.name().equals("submit_review"))
        .findFirst()
        .flatMap(t -> t._input().asObject())
        .orElseThrow(() -> new IllegalStateException("no submit_review call"));
````
````text
    // Exactly one tool call, and it is submit_review: never act on whichever comes first.
    List<ToolUseBlock> calls = msg.content().stream()
        .filter(ContentBlock::isToolUse)
        .map(ContentBlock::asToolUse)
        .toList();
    if (calls.size() != 1 || !calls.get(0).name().equals("submit_review")) {
        throw new IllegalStateException("expected exactly one submit_review call");   // fail closed
    }
    // ToolUseBlock exposes the input only as _input(): JsonValue; read it as an object.
    Map<String, JsonValue> input = calls.get(0)._input().asObject()
        .orElseThrow(() -> new IllegalStateException("tool input is not an object"));
````

### f-s5-skill-r3-23 — TypeScript status line
- **Code status:** type-checked by the session after C2 (`tsc --noEmit`, strict, exit 0). Nothing in this block was run.
````text
// Type-checked 2026-10-01: tsc --noEmit, strict (typescript 7.0.2, @anthropic-ai/sdk 0.131.0, zod 4.6.5).
````
````text
// Type-checked 2026-10-01, and again after the one-call check: tsc --noEmit, strict (typescript 7.0.2, @anthropic-ai/sdk 0.131.0, zod 4.6.5).
````

### f-s5-skill-r3-24 — TypeScript SAFE comment (A2)
````text
// stop_reason checked + zod-validated parse
````
````text
// stop_reason checked + exactly one tool call (parallel tool use disabled) + zod-validated parse
````

### f-s5-skill-r3-25 — TypeScript: disable parallel tool use (C2)
- **Code status:** type-checked by the session.
````text
    tool_choice: { type: "auto" },
````
````text
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
````

### f-s5-skill-r3-26 — TypeScript: exactly one tool call (C2)
- **Code status:** type-checked by the session. The trailing comment is kept; comments do not change type-checking.
````text
  const block = msg.content.find((b) => b.type === "tool_use" && b.name === "submit_review");
  if (!block || block.type !== "tool_use") throw new Error("no submit_review call");
  return ReviewSchema.parse(block.input);   // throws on mismatch — fail closed
````
````text
  const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (calls.length !== 1 || calls[0].name !== "submit_review")
    throw new Error("expected exactly one submit_review call");   // fail closed
  return ReviewSchema.parse(calls[0].input);   // throws on mismatch — fail closed
````

### f-s5-skill-r3-27 — line 341 (F)
````text
email, PR comment, or MCP-retrieved resource that the agent later reads
````
````text
email, pull-request comment, or resource retrieved through a Model Context Protocol server that the agent later reads
````

### f-s5-skill-r3-28 — LLM02:2025 status line, after the session's run of E
- **Code status:** `REDACT` and `safe_log` were run by the session. The rest is parsed, not run. See f-29 for the one re-run owed.
````text
# Parsed 2026-10-01 (Python 3.9.6, ast); not run: a fragment; client, MODEL, llm, logger and User are defined elsewhere, and re and json are not imported.
````
````text
# Parsed 2026-10-01 (Python 3.9.6, ast). REDACT and safe_log, run the same day on sample strings, redacted an email address, a social security number, card numbers written with spaces or dashes and two "sk-" key shapes, left a phone number, and took 0.001 s on a 200,000-character input; the rest is not run: a fragment; client, MODEL, llm, logger and User are defined elsewhere, and re and json are not imported.
````

### f-s5-skill-r3-29 — `safe_log` rewritten (E), with two adversarial corrections by this critic
- **Covers:** the plan's "safe_log is never called; REDACT misses email addresses". This is research block E as the session ran it, with two changes:
  1. **Key pattern.** The last alternative widens `[A-Za-z0-9]` to `[A-Za-z0-9_-]`. The run's pattern needs 32 letters or digits straight after `sk-`, so a key whose body holds `-` or `_` passes unredacted. This is my reading of the regular expression itself, not a claim about any vendor's key format. Every sample the run redacted is still matched, because the new character class is a superset of the old.
  2. **Comment.** The comment replaces E's "keep them out of logged text by field". f-30 logs the free-text question, which can hold a phone number or a name that no pattern removes, so that advice cannot be followed for the field E itself logs.
- **Code status:** not run in this exact form. **The session must re-run E's samples plus an `sk-` key of 40 characters containing `-` and `_` before apply. The change fails if any sample the earlier run redacted is no longer redacted.**
````text
REDACT = re.compile(
    r"\b(\d{3}-\d{2}-\d{4}|\d{16}|sk-ant-api03-[A-Za-z0-9_\-]+|sk-[A-Za-z0-9]{32,})\b"
)
def safe_log(s: str) -> str:
    return REDACT.sub("<REDACTED>", s)[:2000]
````
````text
REDACT = re.compile(
    r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+"  # email address
    r"|\b\d{3}-\d{2}-\d{4}\b"                                           # social security number
    r"|\b(?:\d[ -]?){12,18}\d\b"                                        # card number, spaces or dashes allowed
    r"|sk-ant-api03-[A-Za-z0-9_\-]+|\bsk-[A-Za-z0-9_-]{32,}"            # keys that begin "sk-", "-" and "_" included
)
# A phone number, a name or a customer identifier in free text passes this pattern:
# log a question only to a store cleared to hold personal data.
def safe_log(s: str) -> str:
    return REDACT.sub("<REDACTED>", s[:8000])[:2000]   # bound the regex work, redact, then cut
````

### f-s5-skill-r3-30 — `safe_log` is now called (E)
- **Code status:** parsed by the session, not run (a fragment).
````text
    logger.info("LLM call user=%s ctx_keys=%s", user.id, list(ctx))
````
````text
    logger.info("LLM call user=%s ctx_keys=%s question=%s",
                user.id, list(ctx), safe_log(user_question))
````

### f-s5-skill-r3-31 — line 377, "LLM observability" (not in F; found by this critic)
````text
prompt logging in third-party LLM observability tools
````
````text
prompt logging in third-party observability tools for model calls
````

### f-s5-skill-r3-32 — line 377, "UI" (F)
````text
rendered in a chat UI that auto-fetches images
````
````text
rendered in a chat interface that fetches images automatically
````

### f-s5-skill-r3-33 — line 381 (F)
````text
(MCP servers, third-party skills, marketplace plugins)
````
````text
(Model Context Protocol servers, third-party skills, marketplace plugins)
````

### f-s5-skill-r3-34 — optional: kernels fetched from the Hub (A16, a lead only)
- **Source:** the transformers v5.17.0 page the bullet already cites, *summarised*. The session reads it raw, or skips this finding.
````text
persist in formats widely considered safe, such as ONNX".
````
````text
persist in formats widely considered safe, such as ONNX". The transformers page cited above says `attn_implementation` will "Accept HF kernel references": a kernel named there is code downloaded from the Hugging Face Hub, so pin and review it as you would the model (this file's reading; a lead, not checked against the code that loads it).
````

### f-s5-skill-r3-35 — "re-introduce poisoned chunks" sourced, labelled as a practitioner source (D), and "RAG" (F)
- **Source:** Formation's blog post, *summarised*, its date included. Read raw before apply.
````text
- For RAG, pin the embedding model version. Switching embedding models silently re-shapes the index and can re-introduce poisoned chunks that were thought purged.
````
````text
- For retrieval-augmented generation, pin the embedding model version. A new one means re-embedding everything — "the safe default is to treat the result as a new vector space" — and a backfill can bring back chunks purged from the index unless "Durable tombstones or an equivalent deletion record prevent backfill retries from restoring removed content" (Formation, "Re-Embedding Migration: Upgrade RAG Indexes Safely", 10 September 2026, a practitioner's blog post, not a standard; https://formation.dev/blog/embedding-model-upgrade-migration, read 2026-10-01).
````

### f-s5-skill-r3-36 — line 386, the parenthetical acronym (F)
- After this round's changes, no prose outside quotations and names uses the acronym.
````text
Audit every installed Model Context Protocol (MCP) server.
````
````text
Audit every installed Model Context Protocol server.
````

### f-s5-skill-r3-37 — line 387 (F)
````text
(leaked HF tokens, OPENAI_API_KEY, ANTHROPIC_API_KEY in committed configs)
````
````text
(leaked Hugging Face access tokens, and `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in committed configuration files)
````

### f-s5-skill-r3-38 — line 409 (F)
````text
the RAG ingestion pipeline
````
````text
the ingestion pipeline of retrieval-augmented generation
````

### f-s5-skill-r3-39 — line 413 (F)
````text
expose a "clear memory" UI to the user
````
````text
expose a "clear memory" control to the user
````

### f-s5-skill-r3-40 — model-written SQL: columns and operators allowlisted too (A13)
- **Source:** this file's own reading. A column name cannot be bound as a parameter.
- **Code status:** comments only. Not run. The session re-parses with `ast`.
````text
sql_plan = validate_against_allowlist(sql_plan)             # table in allowlist
rows = db.execute(build_query_with_params(sql_plan))        # parameterized
````
````text
sql_plan = validate_against_allowlist(sql_plan)             # table, columns and operators in allowlists
rows = db.execute(build_query_with_params(sql_plan))        # values bound as parameters; a column name cannot be, so it comes only from the allowlist
````

### f-s5-skill-r3-41 — line 457 (F)
````text
Wire confirmation through a UI gate
````
````text
Wire confirmation through a control in the user interface
````

### f-s5-skill-r3-42 — the address of "Define tools", second place (table B)
````text
(https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use, read 2026-10-01)
````
````text
(https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools, read 2026-10-01)
````

### f-s5-skill-r3-43 — line 460 (F)
````text
Pin MCP server versions
````
````text
Pin Model Context Protocol server versions
````

### f-s5-skill-r3-44 — line 481, "auth" (not in F; found by this critic)
````text
Enforce auth in the runtime layer.
````
````text
Enforce authorization in the runtime layer.
````

### f-s5-skill-r3-45 — line 498 (F)
````text
Targets RAG systems specifically.
````
````text
Targets retrieval-augmented generation systems specifically.
````

### f-s5-skill-r3-46 — the similarity-attack sentence sourced (D)
- **Covers:** the research found no source for the query-side direction. This strips it and puts the sourced passage-side attack in its place.
- **Source:** Zhong and others, arXiv:2310.19156, *summarised*. Read the abstract raw.
- The research's ">94%" figure is deliberately left out.
````text
An attacker can also craft an input whose embedding lands near a target's embedding to surface that target's documents.
````
````text
Similarity can be attacked too: Zhong, Huang, Wettig and Chen generate passages "by perturbing discrete tokens to maximize similarity with a provided set of training queries", which the retriever then returns "for queries that were not seen by the attacker" ("Poisoning Retrieval Corpora by Injecting Adversarial Passages", https://arxiv.org/abs/2310.19156, read 2026-10-01) — corpus poisoning whose passages need not hold any instruction, so a scan for injected instructions can miss them (this file's reading).
````

### f-s5-skill-r3-47 — Morris: the noise caveat completed (table B)
- **Source:** section 6, read from the rendered page image. Both fragments are verbatim per the research.
- Two quoted fragments avoid asserting the punctuation between them and the paper's symbol at the sentence end, which came from an image.
````text
"may be a straightforward way to defend against naive inversion attacks" (Morris and others, section 6).
````
````text
"may be a straightforward way to defend against naive inversion attacks", and add in the same sentence that "it is possible that training with noise could in theory help Vec2Text recover more accurately" from noised embeddings (Morris and others, section 6).
````

### f-s5-skill-r3-48 — SQL status header covers the new comment
- **Code status:** the cases in the comment were run by the session on PostgreSQL 18.6 (round-3 session runs, A11 and A12). The pgvector column and the `<->` query are still not run.
````text
-- the session note does not record the pgvector column or the <-> query as run.
````
````text
-- the session note does not record the pgvector column or the <-> query as run. The view and
-- role-name cases in the comment under the safe pattern were run there the same day.
````

### f-s5-skill-r3-49 — the safe pattern's two holes, as an SQL comment (A11, A12; S1)
- **Sources:** the session's PostgreSQL 18.6 runs, and the CREATE VIEW page (*summarised*; the session reads it raw).
- **Code status:** comment lines whose facts the session ran.
````text
-- no other role, granted SELECT and INSERT on tenant_docs and USAGE on its sequence only.
````
````text
-- no other role, granted SELECT and INSERT on tenant_docs and USAGE on its sequence only.
-- The policy compares role names: delete a tenant's rows before dropping its role, and never
-- rename a tenant role or reuse its name. A view applies "the row-level security policies of the
-- view owner", so one owned by a superuser or a BYPASSRLS role shows every row: create views over
-- tenant_docs WITH (security_invoker = true).
````

### f-s5-skill-r3-50 — the two runs in prose, splitting the long PostgreSQL paragraph (A11, A12; readability item)
- **Sources:** the session's runs; the CREATE VIEW page (*summarised*). The bypass sentence is already quoted in this paragraph.
- Renaming a role was not run; it follows from the same keying.
````text
version 18, read 2026-10-01). The cost of the safe pattern is one login role
````
````text
version 18, read 2026-10-01).

Two holes remain in the safe pattern, and both were run on PostgreSQL 18.6 on 2026-10-01 (a session run). A view over `tenant_docs` owned by the superuser returned both tenants' rows to one tenant's login role, and the same view created `WITH (security_invoker = true)` returned only that tenant's row: CREATE VIEW says that if a base relation "has row-level security enabled, then by default, the row-level security policies of the view owner are applied" (https://www.postgresql.org/docs/current/sql-createview.html, read 2026-10-01), and a superuser bypasses them. After a tenant's role was dropped and a role of the same name created and granted `SELECT`, the new role read the old tenant's row, because the policy compares role names. The comment under the safe pattern gives the defence for each.

The cost of the safe pattern is one login role
````

### f-s5-skill-r3-51 — "confidence floor" labelled as this file's own (D)
- This avoids a negative claim about OWASP's text that rests on a summarised read.
````text
with a "confidence floor" requirement.
````
````text
with a "confidence floor" requirement (this file's suggestion; no source read for this file proposes one).
````

### f-s5-skill-r3-52 — the per-user budget check races (new; this critic's adversarial finding)
- **The problem:** concurrent requests from one user all pass `budget_used_usd(...) > PER_USER_USD_PER_HOUR` before any of them reaches `record_cost`, so the hourly budget can be exceeded many times over. That is the "denial of wallet" this section exists for.
- **Source:** this file's own reading.
- **Code status:** comment only. Not run. The session re-parses.
````text
        if budget_used_usd(user_id) > PER_USER_USD_PER_HOUR:
````
````text
        # A plain check lets concurrent requests all pass before any of them records its cost:
        # reserve the call's largest cost atomically here, and settle the real cost after the call.
        if budget_used_usd(user_id) > PER_USER_USD_PER_HOUR:
````

### f-s5-skill-r3-53 — cap each tool result (A14)
- **Source:** this file's own reading. `MAX_INPUT_TOKENS` checks only the first input, and every iteration resends the conversation.
- **Code status:** comment only. Not run.
````text
        run_tool_and_append(conversation, reply)
    raise IterationLimitExceededError()
````
````text
        run_tool_and_append(conversation, reply)            # must cap each tool result's size: a fetched page is attacker-sized, and every iteration resends it
    raise IterationLimitExceededError()
````

### f-s5-skill-r3-54 — line 601 (F)
````text
LLM03:2025 and "MCP servers".
````
````text
LLM03:2025 and "Model Context Protocol servers".
````

### f-s5-skill-r3-55 — line 615 (F)
````text
Cursor IDE agent (versions below 1.3.9)
````
````text
Cursor code-editor agent (versions below 1.3.9)
````

### f-s5-skill-r3-56 — case study AML.CS0053 in the incident table
- **Source:** the saved data file, lines 9003–9015, which I read in this dispatch. **The session must read lines 9003–9015 and 9034–9044 of the saved data file raw before apply.**
- The quotes are only what the research extracted.
````text
| Promptware kill chain (arXiv:2601.09625) | 2026 |
````
````text
| AML.CS0053 (ATLAS case study) | 2025 | A Model Context Protocol server published on npm | "The bad actor impersonated Postmark, by registering the `postmark-mcp` package name on npm", published legitimate versions first, then "performed a rugpull and uploaded a malicious version of the package" that "added the bad actor's email address in the BCC line of all emails sent by the MCP tool" (MITRE ATLAS release 2026.09, `dist/v6/ATLAS-2026.09.yaml`, read raw 2026-10-01; type Incident, reporter Koi Research). | Pin each Model Context Protocol server to a reviewed version and review every update before it runs (LLM03:2025); a publisher's name on a registry is not its identity. |
| Promptware kill chain (arXiv:2601.09625) | 2026 |
````

### f-s5-skill-r3-57 — case study AML.CS0054 under the tool-poisoning line
- **Source:** the saved file, lines 9034–9044 (same raw-read requirement as f-56).
````text
Tool poisoning, measured by the MCPTox benchmark, is under LLM03:2025 and LLM06:2025 — a benchmark, not an incident.
````
````text
Tool poisoning, measured by the MCPTox benchmark, is under LLM03:2025 and LLM06:2025 — a benchmark, not an incident. ATLAS records the tool-poisoning shape as case study AML.CS0054, "Data Exfiltration via Remote Poisoned MCP Tool", of type Exercise, by Invariant Labs: "an MCP Tool can contain malicious prompts in its docstring description, which is ingested into the AI agent's context, modifying its behavior" (MITRE ATLAS release 2026.09, `dist/v6/ATLAS-2026.09.yaml`, read raw 2026-10-01) — a demonstration, not an incident.
````

### f-s5-skill-r3-58 — contradictions 57 and 58: what the agent's table lacks
- **Source:** the agent's identifier table (lines 54–61), its rule "Every identifier you write comes from the section below or from a lookup you make during this dispatch" (line 24), and its lookup step 2, which accepts only `AML.T…` and `AML.TA…` identifiers (line 36). All were read in this dispatch.
````text
where the lookup and this table disagree, the agent's rule decides which wins.
````
````text
where the lookup and this table disagree, the agent's rule decides which wins. Of the identifiers in this table, the agent's own table holds AML.T0051, AML.T0053, AML.T0056, AML.T0034, AML.T0080 and AML.T0081, with their sub-techniques, and the tactics they achieve; it lacks the rest — among them AML.T0110 for tool poisoning (its check 5), AML.T0108 and AML.T0072 in the Command and Control row (its check 4), and AML.T0040 and AML.T0047 in the AI Model Access row (its check 9) — and writes those only after a lookup made during its dispatch, which reads technique and tactic identifiers only, so the case studies AML.CS0053 and AML.CS0054 under "Recent CVEs and incidents" are for the reader.
````

### f-s5-skill-r3-59 — line 652 (F)
````text
Pre-deploy audit of any LLM endpoint
````
````text
Audit before deployment of any large language model endpoint
````

### f-s5-skill-r3-60 — line 654, "RAG" (F)
````text
Application-level testing: RAG pipelines, agent loops, tool use.
````
````text
Application-level testing: retrieval-augmented generation pipelines, agent loops, tool use.
````

### f-s5-skill-r3-61 — line 654, "PR" and "LLM code" (F)
````text
Every PR that touches LLM code
````
````text
Every pull request that changes code calling a large language model
````

### f-s5-skill-r3-62 — the Llama Guard row sourced; "Open-weight" stripped (D)
- **Source:** the Llama Guard 4 model card, *summarised*. Read raw.
- Line 74's mention of Llama Guard needs no change once this row is sourced.
````text
| **Llama Guard** | Meta | Open-weight safety classifier; input + output gating | Runtime, paired with Guardrails |
````
````text
| **Llama Guard** | Meta | Safety classifier; Llama Guard 4 "can be used to classify content in both LLM inputs (prompt classification) and in LLM responses (response classification)" (https://raw.githubusercontent.com/meta-llama/PurpleLlama/main/Llama-Guard4/12B/MODEL_CARD.md, read 2026-10-01) | Runtime, paired with NeMo Guardrails |
````

### f-s5-skill-r3-63 — the LangChain parse error carries the completion (A15)
- **Source:** `structured.ts`, *summarised*. The session reads the `throw` line raw.
- Python's message was not read, and the text says so.
````text
structured.ts). Both read in source 2026-10-01 |
````
````text
structured.ts). Both read in source 2026-10-01. The JavaScript parser's error message carries the whole model output, `Failed to parse. Text: "${text}". Error: ${e}`, so logging the error logs the completion (LLM02:2025, logging); whether the Python parser's message does the same was not read |
````

### f-s5-skill-r3-64 — line 661 (F; the product's framework name is kept)
````text
| Confident AI | LLM red-team framework with
````
````text
| Confident AI | Red-team framework for large language models, with
````

### f-s5-skill-r3-65 — the check-mapping row follows the two renamed labels (F)
````text
"MCP server hygiene"; "MCP servers";
````
````text
"Model Context Protocol server hygiene"; "Model Context Protocol servers";
````

### f-s5-skill-r3-66 — a status line inside the letter-schema block (the open status-line gap)
- **Code status:** design record. Not run, and no code reads or writes it.
````text
finding_id: <sha256(critic+file+line+kind)[:12]>          # fingerprint for dedup
````
````text
# Design record, not run: no code writes or reads this letter; a value written a | b lists the allowed alternatives.
finding_id: <sha256(critic+file+line+kind)[:12]>          # fingerprint for dedup
````

### f-s5-skill-r3-67 — the letter's `suggested_fix` follows the examples (A2)
````text
  `submit_review` tool with `tool_choice` left at `auto`, require
  `stop_reason == "tool_use"`, and validate the input in code
````
````text
  `submit_review` tool with `tool_choice` `auto` and parallel tool use
  disabled, require `stop_reason == "tool_use"` and exactly one tool
  call, and validate the input in code
````

### f-s5-skill-r3-68 — line 740, "SAST" and "LLM" (F; "PoC" kept, because the agent quotes it)
````text
SAST `reachable` analysis works because static call graphs are tractable. LLM prompt-injection reachability requires a runtime probe
````
````text
Static application security testing's `reachable` analysis works because static call graphs are tractable. Reachability of a prompt injection into a large language model requires a runtime probe
````

### f-s5-skill-r3-69 — contradiction 59, skill side: a pinned revision means a commit hash
- **Source:** this file's LLM03:2025 ("only a commit hash pins").
- This sentence restates the agent's high-confidence list; it pairs with the agent's late correction 2 below.
````text
a model loaded with no pinned revision
````
````text
a model loaded with no revision pinned to a commit hash (LLM03:2025)
````

### f-s5-skill-r3-70 — C: a description cut short at a zero byte (A6)
- **Source:** this file's own reading.
- **Code status:** comment only. The block's compile-and-run line stays true. The session may recompile to confirm.
````text
char *build_request(const char *pr_description) {
````
````text
/* pr_description is a C string: text after a zero byte ('\0') in the received description never reaches it,
   so the caller refuses a description whose received length differs from its strlen. */
char *build_request(const char *pr_description) {
````

### f-s5-skill-r3-71 — C: escaping can grow the input (A7)
- **Source:** this file's own code: `wrap_escaped` adds 5 bytes for each `&` (line 779).
- **Code status:** comment only.
````text
    if (strlen(pr_description) > MAX_DESCRIPTION) return NULL;   /* bound the input */
````
````text
    if (strlen(pr_description) > MAX_DESCRIPTION) return NULL;   /* bound the input; escaping can make it up to five times longer ('&' becomes "&amp;") */
````

### f-s5-skill-r3-72 — C++ status line, after the session's run of C4
- **Code status:** compiled and run by the session.
````text
// Compiled 2026-10-01 (clang++ -std=c++20 -Wall -Wextra, no diagnostics) and run on crafted replies: a well-formed submit_review call was accepted and each malformed one failed closed.
````
````text
// Compiled 2026-10-01 (clang++ -std=c++20 -Wall -Wextra, no diagnostics) and run on crafted replies: a well-formed submit_review call was accepted and each malformed one failed closed; compiled again after the one-call and object checks (no diagnostics) and run: one call, and a text block followed by one call, were accepted; two tool calls and an input that is an array failed closed.
````

### f-s5-skill-r3-73 — C++ SAFE comment (A2)
````text
// SAFE: no shell. Require a submit_review tool call, check every field against the
// schema in code, and act only on the three allowed values; anything else fails closed.
````
````text
// SAFE: no shell. Require exactly one tool call, a submit_review call, check every field
// against the schema in code, and act only on the three allowed values; anything else fails closed.
````

### f-s5-skill-r3-74 — C++: exactly one tool call, and the input must be an object (A2, A8; C4)
- **Code status:** compiled and run by the session.
````text
    for (const auto& block : reply.at("content")) {
        if (block.at("type").get<std::string>() != "tool_use"
            || block.value("name", std::string{}) != "submit_review") continue;
        const auto& in = block.at("input");
        if (in.size() != 2) return std::nullopt;                    // no extra keys
        Review r{in.at("decision").get<std::string>(), in.at("reasoning").get<std::string>()};
        if (!kDecisions.contains(r.decision) || r.reasoning.size() > 2000) return std::nullopt;
        return r;
    }
    return std::nullopt;                                            // no submit_review call
````
````text
    const nlohmann::json* call = nullptr;
    for (const auto& block : reply.at("content")) {
        if (block.at("type").get<std::string>() != "tool_use") continue;
        if (call) return std::nullopt;                              // a second tool call: ambiguous
        call = &block;
    }
    if (!call || call->value("name", std::string{}) != "submit_review") return std::nullopt;
    const auto& in = call->at("input");
    if (!in.is_object() || in.size() != 2) return std::nullopt;     // an object, no extra keys
    Review r{in.at("decision").get<std::string>(), in.at("reasoning").get<std::string>()};
    if (!kDecisions.contains(r.decision) || r.reasoning.size() > 2000) return std::nullopt;
    return r;
````

### f-s5-skill-r3-75 — line 859 (F)
````text
A QR code in an uploaded image
````
````text
A quick-response code in an uploaded image
````

### f-s5-skill-r3-76 — line 861, the label (F)
````text
- **MCP servers**: every installed
````
````text
- **Model Context Protocol servers**: every installed
````

### f-s5-skill-r3-77 — line 873 (F)
````text
An unredacted PII log today is tomorrow's GDPR letter.
````
````text
An unredacted log of personal data today is tomorrow's letter from a regulator under the General Data Protection Regulation.
````

### f-s5-skill-r3-78 — References: the 2025 entry pages cited inline
````text
- OWASP Gen AI Security Project (per-category pages): https://genai.owasp.org/llm-top-10/
````
````text
- OWASP Gen AI Security Project (per-category pages): https://genai.owasp.org/llm-top-10/; the 2025 entry pages cited here: https://genai.owasp.org/llmrisk/llm01-prompt-injection/, https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/, https://genai.owasp.org/llmrisk/llm062025-excessive-agency/, https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/, https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/ and https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/; LLM10:2025 in OWASP's repository: https://raw.githubusercontent.com/OWASP/www-project-top-10-for-large-language-model-applications/main/2_0_vulns/LLM10_UnboundedConsumption.md
````

### f-s5-skill-r3-79 — References: the ATLAS data file, the README at its tag, and the release page
````text
- MITRE ATLAS manifest of releases: https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/manifest.yaml
````
````text
- MITRE ATLAS manifest of releases: https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/manifest.yaml
- MITRE ATLAS release 2026.09 data file: https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/v6/ATLAS-2026.09.yaml; README at tag v2026.09: https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/README.md; release page: https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.09
````

### f-s5-skill-r3-80 — References: the 2026 README and entry files
````text
- OWASP Top 10 for LLM Applications, 2026 edition: https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/ and https://github.com/GenAI-Security-Project/GenAI-LLM-Top10
````
````text
- OWASP Top 10 for LLM Applications, 2026 edition: https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/ and https://github.com/GenAI-Security-Project/GenAI-LLM-Top10; README: https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/README.md; entry files cited here, each under https://raw.githubusercontent.com/GenAI-Security-Project/GenAI-LLM-Top10/main/2026/final/ — LLM01_PromptInjection.md, LLM02_SensitiveInformationDisclosure.md, LLM04_SupplyChain.md, LLM05_DataModelPoisoning.md, LLM06_UnboundedConsumption.md, LLM07_Misinformation.md and LLM09_VectorAndEmbeddingWeaknesses.md
````

### f-s5-skill-r3-81 — References: the agentic document
````text
- OWASP Top 10 for Agentic Applications for 2026: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
````
````text
- OWASP Top 10 for Agentic Applications for 2026: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/; the document: https://genai.owasp.org/download/52117/?tmstv=1765059207
````

### f-s5-skill-r3-82 — References: the NIST publication itself
````text
- NIST AI 100-2 E2025, Adversarial Machine Learning: https://csrc.nist.gov/pubs/ai/100/2/e2025/final
````
````text
- NIST AI 100-2 E2025, Adversarial Machine Learning: https://csrc.nist.gov/pubs/ai/100/2/e2025/final; the publication: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf
````

### f-s5-skill-r3-83 — References: the inversion and retrieval-poisoning papers
````text
- Papers: Crescendo https://arxiv.org/abs/2404.01833; Tree of Attacks with Pruning https://arxiv.org/abs/2312.02119; MCPTox https://arxiv.org/abs/2508.14925; promptware kill chain https://arxiv.org/abs/2601.09625; training-data extraction https://arxiv.org/abs/2311.17035
````
````text
- Papers: Crescendo https://arxiv.org/abs/2404.01833; Tree of Attacks with Pruning https://arxiv.org/abs/2312.02119; MCPTox https://arxiv.org/abs/2508.14925; promptware kill chain https://arxiv.org/abs/2601.09625; training-data extraction https://arxiv.org/abs/2311.17035; embedding inversion https://arxiv.org/abs/2310.06816 and https://arxiv.org/abs/2602.01757; adversarial passages in a retrieval corpus https://arxiv.org/abs/2310.19156
````

### f-s5-skill-r3-84 — References: PromptFoo's command-line page
````text
- PromptFoo: https://www.promptfoo.dev/
````
````text
- PromptFoo: https://www.promptfoo.dev/; command line: https://www.promptfoo.dev/docs/usage/command-line/
````

### f-s5-skill-r3-85 — References: the Llama Guard 4 model card
````text
- Meta Llama Guard: https://github.com/meta-llama/PurpleLlama
````
````text
- Meta Llama Guard: https://github.com/meta-llama/PurpleLlama; Llama Guard 4 model card: https://raw.githubusercontent.com/meta-llama/PurpleLlama/main/Llama-Guard4/12B/MODEL_CARD.md
````

### f-s5-skill-r3-86 — References: the "Define tools" address (third place, table B) and Anthropic's other pages cited inline
````text
- Claude tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use; stop reasons: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
````
````text
- Claude tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools; strict tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use; parallel tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use; structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs; stop reasons: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons; Claude's constitution: https://www.anthropic.com/constitution
````

### f-s5-skill-r3-87 — References: the remaining inline sources from rounds 1–3, one line each
````text
- OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
````
````text
- OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs; Chat Completions reference: https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create; moderation: https://developers.openai.com/api/docs/guides/moderation
- Sandboxes: Firecracker https://firecracker-microvm.github.io/; gVisor https://gvisor.dev/docs/ and https://raw.githubusercontent.com/google/gvisor/master/README.md; WebAssembly https://webassembly.org/docs/security/; Docker rootless mode https://docs.docker.com/engine/security/rootless/
- LangSmith, masking inputs and outputs: https://docs.langchain.com/langsmith/mask-inputs-outputs; LangChain output parsers: https://raw.githubusercontent.com/langchain-ai/langchain/master/libs/core/langchain_core/output_parsers/pydantic.py and https://raw.githubusercontent.com/langchain-ai/langchainjs/main/libs/langchain-core/src/output_parsers/structured.ts
- Hugging Face: https://huggingface.co/docs/huggingface_hub/package_reference/file_download and https://huggingface.co/docs/transformers/main_classes/model
- Package registries, versions read 2026-09-30: https://pypi.org/pypi/garak/json, https://pypi.org/pypi/pyrit/json and https://registry.npmjs.org/promptfoo/latest
- PostgreSQL: https://www.postgresql.org/docs/current/ddl-rowsecurity.html, https://www.postgresql.org/docs/current/functions-admin.html and https://www.postgresql.org/docs/current/sql-createview.html
- National Cyber Security Centre, "Prompt injection is not SQL injection (it may be worse)": https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection
- "AI Data Security: Best Practices for Securing Data Used to Train & Operate AI Systems" (May 2025), the Federal Bureau of Investigation's copy: https://www.fbi.gov/file-repository/cyber-alerts/ai-data-security-best-practices-for-securing-data-used-to-train-and-operate-ai-systems-052225.pdf
- Regulation (EU) 2024/1689, the European Union Artificial Intelligence Act: http://data.europa.eu/eli/reg/2024/1689/oj
- Formation, "Re-Embedding Migration: Upgrade RAG Indexes Safely", a practitioner's blog post: https://formation.dev/blog/embedding-model-upgrade-migration
````

### f-s5-skill-r3-88 — no change: zod's `.strict()` is not deprecated
- Checked in zod 4.6.5's own type declarations, in the session's TypeScript project: `schemas.d.ts` lines 494–499. Only `passthrough()` carries `@deprecated`.
- Record as `rejected` with the reason "Decision, no change: verified."

### f-s5-skill-r3-89 — no change: attacks the examples already defend
- A4 (a literal `</pr_description>`) is escaped in every example.
- A5: the TypeScript escaping order is correct.
- A10: the safe pattern requires a login role that is "a member of no other role".
- A8 needs no change of its own; it is closed inside f-74.
- Record as `rejected` with the reason "Decision, no change: verified."

---

**Change count:** 87 changes to the skill (f-1 to f-87), two records with no change (f-88, f-89), and two late corrections to the agent (below).

**What the brief's nine areas map to:**
- **Attacker rows:**
  - Two tool calls (A2): f-13, f-15 to f-17 and f-19 to f-26 (Python, Java, TypeScript), f-67 (the letter's fix), f-73 and f-74 (C++).
  - Shape-only replies (A1) and enum casing (A3): f-13.
  - A13: f-40. A14: f-53. A15: f-63. A16: f-34.
  - C description handling (A6, A7): f-70, f-71. C++ object check (A8): f-74.
  - C# limitation (A9): f-18.
  - View and role-name holes (A11, A12): f-48 to f-50.
- **Raw re-read table:** f-9, f-42, f-86 (the address), f-13 (the `output_format` sentence), f-47 (Morris).
- **ATLAS case studies:** f-56, f-57.
- **Unsourced claims:** f-46, f-35, f-51, f-62.
- **The `safe_log` rewrite:** f-28 to f-30.
- **Contradictions 57–59:** f-58, f-69, and the late corrections below.
- **Abbreviations:** F's list in full, plus four found by this critic: f-2, f-11, f-31, f-44.
- **Status line inside the letter-schema block:** f-66.
- **References:** f-78 to f-87.

**What remains open after this round** (for the record, not for another round):
1. **The effort values:** the skill says `effort_level: high`, the agent `effort: xhigh`. This is your decision, filed as `h-s5-skill-r1-effort-level-mismatch`.
2. **Code nobody has compiled or run:**
   - Java and C#: no toolchain on the build machine.
   - Whether C#'s `GetResponseAsync<T>` accepts an extra or duplicate key (A9): the System.Text.Json documentation is still unread.
   - The pgvector column and the `<->` query.
3. **Raw reads the session owes before apply:**
   - From the summarising fetch: the enum-casing sentences (f-13), CREATE VIEW (f-49, f-50), Zhong's abstract (f-46), the Formation post and its date (f-35), the Llama Guard 4 card (f-62), the `attn_implementation` sentence (f-34), the `structured.ts` error line (f-63), and the gVisor documentation page and Morris abstract (re-read only through the fetch tool).
   - The new "Define tools" address, fetched directly.
   - Lines 9003–9015 and 9034–9044 of the saved ATLAS file.
   - `ToolChoiceAuto.kt`, for `disableParallelToolUse`.
4. **The `safe_log` re-run** with the widened key pattern (f-29).
5. **Not read or not changed, by design:**
   - A `SECURITY DEFINER` function over `tenant_docs` owned by a role that bypasses row-level security is believed to open the same hole as the view. It was neither read nor run.
   - Residuals in `safe_log`:
     - The first cut at 8,000 characters can leave part of a secret only after 6,000 or more characters before it have been redacted away.
     - The email alternative redacts only the last 64 characters of a longer local part.
     - The safe example logs `user.id` while the redaction bullet lists "customer identifiers" among what to strip. A pseudonymous log identifier is a design choice I did not make here.
   - The 2,000 limit counts code points in Python, UTF-16 code units in Java, C# and TypeScript, and bytes in C++.
   - The "Coding-agent config files" label (three places) and the technical names API, JSON, HTTP, URL, SQL, HTML, CVE and CWE are kept. "PoC" is kept because the agent quotes it.
6. **Optional and unread:** the TextCrafter and SPARSE papers.
7. **Readability, estimated, not measured:** line 501 grows to roughly 2,300 characters with f-46 and f-47. Line 91 does not grow, because the new prose (f-13) is its own paragraph.

**Seven-language verdict: the check applies, and coverage stays complete.** C# (LLM01:2025, LLM05:2025), Java (LLM01:2025), Python (LLM01:2025, LLM02:2025, LLM03:2025, LLM05:2025, LLM06:2025, LLM07:2025, LLM10:2025), C (C17), C++ (C++20), TypeScript (LLM01:2025) and SQL (LLM08:2025).

Status of what this round changes:

| Language | Status |
|---|---|
| Python | The LLM01:2025 example was run by the session. `REDACT` and `safe_log` were run, with one re-run owed for f-29. The LLM05:2025 and LLM10:2025 comments are parsed only. |
| TypeScript | Type-checked. |
| C++ | Compiled and run. |
| C | Comments only. |
| Java | Not compiled. |
| C# | Not compiled. |
| SQL | The comment's facts were run on PostgreSQL 18.6; the pgvector column and query were not. |
| YAML | Design record; nothing runs it. |

---

**Agent late-correction proposals (separate; contradiction 59).** Before applying: run the 36 agent fences, the copy fence in both directions, and the full gate.

### f-s5-skill-r3-90 — agent check 11 says what "pinned" means
- **Source:** Hugging Face's `revision` parameter, as the skill quotes it (https://huggingface.co/docs/huggingface_hub/package_reference/file_download, read 2026-10-01).
````text
11. **Supply chain** — model revisions pinned, and no weights loaded from a format that can run code when loaded;
````
````text
11. **Supply chain** — model revisions pinned, a Git revision only by a commit hash: Hugging Face's `revision` is "An optional Git revision id, which can be a branch name, a tag, or a commit hash" (https://huggingface.co/docs/huggingface_hub/package_reference/file_download, read 2026-10-01), and a branch or a tag can move (this file's reading, as the skill's LLM03:2025 reads it); and no weights loaded from a format that can run code when loaded;
````

### f-s5-skill-r3-91 — the agent's high-confidence row follows check 11
- Pairs with skill finding f-69. The order-table row "A model loaded from an unpinned revision" then reads under check 11's definition, so I propose no change to it.
````text
a model loaded with no pinned revision, a server configured with automatic approval.
````
````text
a model loaded with no revision pinned to a commit hash (check 11), a server configured with automatic approval.
````

Files read:
- /Users/account/Code/ctoc/skills/ai-quality/llm-security-tester/SKILL.md
- /Users/account/Code/ctoc/agents/ai-quality/llm-security-tester.md
- /Users/account/Code/ctoc/plans/in-progress/00265-every-agent-and-specialist-skill-improved-three-times-s5-llm-security-tester.md
- /Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-research-d-s5-skill-r3-research.md
- /Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-session-runs.md
- /Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round2-revalidate-d-s5-skill-r2-revalidate.md
- /Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round2-critic-d-s5-skill-r2-critic.md
- /Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round1-session-runs.md
- /Users/account/Code/ctoc/tests/skill-loading.test.js, /Users/account/Code/ctoc/tests/cu5-s4-compliance-aiquality-wrappers.test.js, /Users/account/Code/ctoc/tests/cu5-wrapper-coverage-completeness.test.js, /Users/account/Code/ctoc/tests/architecture-invariants.test.js
- /private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/ATLAS-2026.09.yaml (lines 8995–9070)
- /private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/s5code/ (the Kotlin sources, `tsproj/node_modules/zod/v4/classic/schemas.d.ts`, and the Python and TypeScript library typings)

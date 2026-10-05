<!-- saved verbatim by the session from the s5 build executor (ctoc:iron-loop:iron-loop-executor, subagent a5fde29980eb858ef), Steps 8-9 baseline, 2026-09-30 23:57 CEST -->

Steps 8 and 9 are done. Both files match the inventory's starting fingerprints, and every baseline test set is green. No file other than the plan has been changed.

**Fingerprints** (computed with `shasum -a 256`; each equals the inventory's starting value, and neither file differs from the last commit):
- Agent `agents/ai-quality/llm-security-tester.md`: `sha256:d0940f2cec21caf50ba4e9251a5a3f056d77c0d54aa5214bae63f23dd458d8b4`
- Skill `skills/ai-quality/llm-security-tester/SKILL.md`: `sha256:8894ea70954f865f3c9dc85128ca42bc0a56bf8d8d3153cef70e7bf218b3ff99`
- Neither file has a declared-claims block.

**Baseline** (`node --test`, Node.js v24.14.1; every run exited 0 with 0 cancelled):

| Set | Files | Passed | Failed | Skipped |
|---|---|---|---|---|
| The agent's tests from the inventory | 26 | 623 | 0 | 0 |
| The skill's tests from the inventory | 18 | 581 | 0 | 0 |
| The record check | 1 | 16 | 0 | 0 |
| Everything together, plus the plan's named fences | 40 | 868 | 0 | 0 |

The skill-loading trigger test matched 125 of 135 prompts; it fails below 122. It returns the first skill in listing order whose phrase appears in the prompt, so any phrase added to this skill must be re-checked against that test.

**Written to the plan:** Steps 8 and 9 are ticked, following the previous slice's decision 1: no new test, and no red run. I added an Execution Record with the baseline, the test constraints, and two places where the approved text is wrong.

**Decisions I took** (recorded in the plan):
- **Baseline set:** the union of both inventory lists, the plan's named fences and the record check. That is 40 files, and every round uses the same set.
- **One printed warning:** the line "Warning: streaming topics …" comes from a test fixture that deliberately writes an invalid file (`src/lib/streaming-topics.js` line 182). It predates this slice and is not a Node.js runtime or deprecation warning.

**Where the approved text is wrong** (left unedited):
- The plan says `compliance/ai-governance-checker` is named in the agent's related-agents table. It is actually in the "Skills you reuse" table, and there is no agent file for it; that table names `eu-ai-act-agent` instead.
- The "Wiring" paragraph still says skills load through the plugin's skill folders. The previous slice already recorded that this is out of date.

**Constraints the critic's brief must carry** (from `tests/cu5-s4-compliance-aiquality-wrappers.test.js`):
- The agent's `description` must stay on one line.
- The strings `approved_by`, `human_gate` and `review_gate` may not appear anywhere in the wrapper.
- No trimmed skill-body line of 25 characters or more may appear in the wrapper body.

## Claims that look like citations, for the research brief

**Agent file**
- Line 3: the description names the "OWASP LLM Top 10 (2025)" and "MITRE ATLAS adversary tactics". It has no dispatch phrases, unlike its sibling `sast-scanner`.
- Line 22: "the 2025 revision of the OWASP list … made system-prompt leakage its own category".
- Line 40: "Before Gate 3 (review to done)". This is a gate number in text a person reads, which breaks the plan's per-file criterion 7. The gate-number fence does not catch it.
- Line 42 and line 145: a "documented real-world chain" in which a permissive automatic-approval toggle was abused.
- Line 48: "delimiters alone are insufficient against multilingual, unicode and homoglyph attacks; the instruction is what hardens them". This is a claim about how well a defence works, with no source.
- Line 57: prompts and completions flow to standard output, application monitoring and model-observability tools.
- Lines 62 and 67: the static-analysis skill "covers a subset of your categories". That skill's section 12 uses the 2024 numbering (see the sibling conflicts below).
- Lines 88–175: every example finding carries `confidence: "HIGH"`. The skill says medium when only the static pattern matched.
- Lines 180–196 and 222–242 disagree with the skill's triage table (see the conflicts below).

**Skill file**
- Line 3: the same description as the agent.
- Line 41: "Auto-loaded when … a target file imports an LLM SDK". No such mechanism exists. The line also lists SDK package names.
- Lines 62, 559, 568 and 644–650: the "refinement-loop letters" and "critic mode". `docs/REFINEMENT_LOOP.md` records that loop as not running, and line 650 says findings "block phase advancement".
- Line 69: the Responses API with `response_format: {"type":"json_schema",…}`, also at lines 535, 637 and 254–258. My belief, not checked: the Responses API uses `text.format` with a flat shape. Also "far harder to jailbreak", with no source.
- Line 70: "Claude ships with a constitutional safety layer"; the guardrail products named there.
- Line 71: the list of dangerous functions that must never receive model output; the sandboxes Firecracker, gVisor, rootless Docker and WebAssembly; the path `/tmp/sandbox`.
- Line 73: the CVE-2025-53773 toggle called "default-permissive YOLO-mode". "Default-permissive" is doubtful.
- Line 76 and line 440: "denial of wallet is the dominant 2025–2026 variant". A statistic-shaped claim with no source.
- Line 77: Datadog, Sentry, LangSmith, Helicone, Arize.
- Line 83: the 2025 changes: two new categories (LLM07, LLM08), "Over-reliance" renamed to "Misinformation", "Model DoS" renamed to "Unbounded Consumption". Also lines 386, 405 and 430.
- Model identifier `claude-opus-4-7` at lines 91, 119, 170, 186, 209, 228, 287, 447, 469 and 540 (the last is a Garak command with `--model_type openai`).
- Line 134: "guaranteed to be a tool_use" after forcing a tool call. This is doubtful when the response stops at `max_tokens`.
- Lines 139–162, C#: `.NET 9`, `Microsoft.Extensions.AI` with `CompleteAsync`, `ChatResponseFormat.ForJsonSchema<T>()`, `CompleteAsync<T>`, `MaxOutputTokens`, "throws on schema mismatch". My belief: `CompleteAsync` was renamed to `GetResponseAsync`.
- Lines 166–199, Java: "Anthropic Java SDK 0.x", `ToolChoice.tool(...)`, `isToolUse()`, `asToolUse().input()`, Guava's `HtmlEscapers`.
- Line 203 onward, TypeScript: `Anthropic.TextBlock`, zod.
- Line 261 and line 488: the "promptware kill chain documented in 2026".
- Line 263: crescendo, TAP, and "cumulative refusal-decay alarms" (no source).
- Line 267: "LLM02 jumped to #2 in 2025 because…" (a causal claim), and EchoLeak, CVE-2025-32711, with its mechanism. EchoLeak is also at line 485.
- Line 296: the "repeat this word forever" extraction attack; no paper is named.
- Line 302: `snapshot_download(..., etag_timeout=10)` presented as checksum verification. This looks misattributed.
- Line 303: "`safetensors=False` paths". The real parameter appears to be `use_safetensors`, which line 317 uses.
- Lines 305 and 640: the ATLAS technique "Publish Poisoned AI Agent Tool" and its case studies.
- Line 358: `HtmlSanitizer.Default.Sanitize` from Ganss.Xss. My belief: that library has no static `Default`.
- Line 371 and line 487: "MCPTox-class", which is the name of a benchmark paper.
- Line 410: "embedding models trained with inversion-resistance", with no source.
- Line 424: "even an injected SQL … cannot reach another tenant". This looks refutable: PostgreSQL table owners bypass row-level security unless it is forced, and injected SQL can call `set_config('app.tenant_id', …)`.
- Line 474: the "safe" example uses `tool_calls_so_far`, which is never defined or incremented (a runtime NameError). The example does not remove the defect it claims to fix.
- Line 484: CVE-2025-53773 as "GitHub Copilot agent mode (Visual Studio)" with "CVSS 7.8 … per Microsoft / Wiz / NVD". The sibling `sast-scanner` line 419 says 8.8 per Microsoft.
- Line 486: a "Cursor IDE chain" with no identifier or source.
- Line 494: "ATLAS (release 5.6.0, mid-2026) … 16 tactics, 84 techniques, and 56 sub-techniques". The file pins these numbers while telling the reader never to pin them.
- Lines 500–517: fifteen distinct tactic identifiers (Initial Access appears twice) against the claimed 16, and AML.T0010. "Extract LLM System Prompt" is listed under Credential Access, which may be the wrong tactic.
- Lines 527–536, tool claims: Garak "100+ probe modules" and "pushes findings to AVID"; PyRIT's campaign strategies; Promptfoo's "OWASP LLM preset"; the OpenAI moderation categories; LangChain parsers "(Pydantic, Zod)"; DeepTeam's "OWASP + ATLAS presets".
- Lines 540–554: command-line flags for garak (`--model_type` may be out of date), promptfoo (`--plugins owasp:llm --output sarif`), `python -m pyrit.cli orchestrate` (probably invented), and `nemoguardrails server`.
- Line 587: CWE-1426 and the other weakness identifiers. CWE-1427, on prompt neutralisation, is a lead worth checking.
- Lines 589–591 and 613–614: AML.TA0004, AML.T0051 and the OWASP LLM01 address.
- Line 621: the "7-language rule" is listed as C, C++, C#, Go, Java, Python, TypeScript. The parent plan's criterion 4 says C#, Java, Python, C, C++, JavaScript or TypeScript, and SQL.
- Lines 623–628: "the overwhelming majority of LLM orchestration code"; Ollama; `async-openai`; `anthropic-sdk-rust`; "no first-class … SDK in C or C++". Line 625 also carries "owed in v4 … logged for the next sweep", an invented label.
- Line 637: "Anthropic's `tool_choice` forcing is stricter than OpenAI's". No source.
- Lines 656–676: the reference list relies on secondary sources (Invicti, Indusface, Vectra, secops.group, WorkOS) where authoritative ones should come first.

**Conflicts with the sibling and paired files:**
- `skills/security/sast-scanner/SKILL.md` lines 43 and 377 use the 2024 numbering, "OWASP LLM Top 10 v1.1". This skill's line 79 says that section covers LLM01, LLM05 and LLM06 under the 2025 numbering. That sibling file has not been started, so it will be met in its own slice.
- The skill's triage table (lines 563–566) disagrees with the agent's tables (lines 180–196 and 226–242):
  - The skill blocks five "high" items that the agent only warns on as "fix before release".
  - An unpinned model revision is "medium, fix soon" in the skill and a block in the agent.
  - The skill says a finding is "ALWAYS critical" (line 559), but the agent's template uses "high" (line 150).
- The finished file `agents/ai-quality/ai-code-quality-reviewer.md` (line 43) and its skill (line 489) hand two things to this agent: capability changes in coding-assistant configuration, and links to Markdown images outside the repository. This skill does not describe receiving either.

**Leads for missing failure classes** (my belief, not checked; for research to confirm):
- The newer OWASP list for agentic applications.
- The National Institute of Standards and Technology report AI 100-2, edition 2025.
- Server-tool shadowing and "rug-pull" updates, where a capability server changes its tools after install.
- Unsafe model-file parsing in C and C++ inference code, which undercuts the skill's reason for skipping C and C++ (lines 627–630).

## Orders the tools cannot carry out

Both files grant `tools: Bash, Read, Grep, Glob, WebSearch`: no web page fetching, no way to dispatch another agent, no Write or Edit.

**Agent file**
- Lines 24, 38, 92, 166–167 and 203: "re-resolve live" the category list, identifiers and totals. Search gives snippets only. Fetching the data files would need `curl` through Bash, which the file never mentions.
- Line 74: "tell it" to the threat modeler. The agent can only put this in its output.
- Lines 67 and 77: "Both passes run" and "Never skip your pass". The agent cannot make another pass happen.
- The output fields `agreeing_skills` and `convergent_findings`: the agent cannot see other agents' results unless it is handed them, so these invite made-up agreement.
- Lines 35–37 and 42: "Always" triggers on configuration changes. Nothing dispatches the agent on those events. This is a claim that a mechanism runs.
- Line 167: `taxonomy_resolved_at: "<timestamp …>"`. This can be done with `date` through Bash, but only if a lookup actually happened.

**Skill file**
- Line 41: loading automatically on imports. No such mechanism exists.
- Lines 502 and 519: "Grep public repos / HF" and "re-resolve … against the current atlas-data repo". Grep searches only local files, and there is no page fetching.
- Lines 541–554 and 610: run garak, promptfoo, PyRIT and a `curl` proof of concept against a live endpoint. Bash can run these if they are installed and credentials exist. But nothing says what the agent is allowed to attack, which may be a security finding in itself.
- Line 632: "kick back to sast-scanner". The agent cannot dispatch.
- Line 636: store fixtures under `tests/redteam/` with a `# noqa: redteam-fixture` marker. There is no Write tool, and no scanner honours that marker.
- Line 640: "Audit … quarterly". The agent cannot schedule anything.
- Lines 646–650: "the letter you write to CTO Chief" and findings that "block phase advancement". The loop is not running, and there is no Write tool.

The plan is at `<home>/Code/ctoc/plans/in-progress/00265-every-agent-and-specialist-skill-improved-three-times-s5-llm-security-tester.md`. The test lists and raw outputs are in the session scratchpad: `s5-agent-tests.txt`, `s5-skill-tests.txt`, `s5-baseline-tests.txt` and `s5-base-{agent,skill,record,union}.out`.

The C#, Java, TypeScript and command-line doubts above are from memory, not checked. Only the NameError at line 474 and the conflicts between the files were confirmed against the repository.

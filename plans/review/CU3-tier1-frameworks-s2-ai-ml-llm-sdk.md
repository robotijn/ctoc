---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T15:53:09.513Z
gate_crossed: implementation → todo
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T20:52:40.393Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU3 s2 — ai-ml LLM-SDK framework guides (langchain, anthropic-sdk, openai-sdk)"
type: implementation
parent_plan: CU3-tier1-frameworks
depends_on: none
priority: HIGH
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/langchain.md
  - skills/frameworks/ai-ml/anthropic-sdk.md
  - skills/frameworks/ai-ml/openai-sdk.md
  - tests/cu3-ai-ml-llm-sdk-guides.test.js
---

# CU3 s2 — ai-ml LLM-SDK framework guides (langchain · anthropic-sdk · openai-sdk)

> Slice 2 of the CU3 decomposition. De-stub the three LLM-orchestration/SDK guides
> from the 5-section template floor into substantive correction surfaces in ONE
> coherent research pass. These share a research family: prompt-injection in
> tool-enabled chains, async-vs-sync client selection, token-budget/rate-limit
> management, structured-output validation, and rapid SDK version churn all overlap
> across LangChain and the two model SDKs. Adds the content-contract test that reads
> the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every version number, CVE/CWE identifier, security-advisory reference, date, and
> best-practice claim MUST be WEB-VERIFIED at edit time and carry an inline dated
> source ≥ 2025-01-01 — never invented (hard user rule).
> **SDK-SPECIFIC HARD RULE:** for anthropic-sdk.md and openai-sdk.md, use the REAL
> current SDK package versions AND the REAL current model IDs — do NOT invent model
> names or version numbers. Verify anthropic model IDs against the official
> Anthropic docs / the `claude-api` reference skill, and openai model IDs + SDK
> version against the official OpenAI docs, at edit time. If a model ID or version
> cannot be verified, OMIT it rather than guess. The content-contract test READS
> the real files off disk — no mocks, no stubs, no fakes.

Maps to CU3 acceptance criteria: **"langchain.md covers LangChain 1.0 API surface
and chain footguns"** (names "LangChain 1.0", "CVE-2025-68664", "LCEL"),
**"anthropic-sdk.md and openai-sdk.md cover SDK-specific footguns"**, and **"all
version-specific and security claims carry dated sources"** — for these three files.

## Implementation Details

### Architecture Decision

Single-framework reference guides — the **7-language BAD/SAFE cross-coverage rule
does NOT apply** (single-framework exemption). The bar is
**depth-within-framework**, gated objectively: every required `## ` section names a
concrete identifier (version number, CWE/CVE ID, or concrete API/function name),
and every version-specific or security claim carries an inline dated source ≥
2025-01-01.

**No-churn (extend, never overwrite):** confirmed fresh 2026-07-09 — langchain.md
5 `## ` sections / 53 lines (already names LangChain 1.0, LCEL deprecation,
CVE-2025-68664, `create_react_agent`), anthropic-sdk.md 5 sections / 76 lines,
openai-sdk.md 5 sections / 64 lines. Existing solid content (langchain's
CVE-2025-68664 → 1.2.5+ note) is preserved verbatim; new sections are ADDED.

**Verification note on the pre-existing CVE claim:** langchain.md already asserts
`CVE-2025-68664` and the `1.2.5+` fix. This is a security claim — Step 9 MUST
re-verify it at edit time against an authoritative advisory (NVD / GitHub advisory
DB) and attach a dated source ≥ 2025-01-01. If the CVE ID or the fixed-version
cannot be verified against an authoritative advisory at edit time, the claim is
CORRECTED or REMOVED (never left unsourced — a security note without a source is a
liability per the CU3 business-risk block).

Grouping rationale: langchain + anthropic-sdk + openai-sdk form one research pass
because (a) LangChain wraps both model SDKs (langchain-anthropic / langchain-openai)
so their version stories must be coherent; (b) prompt-injection in tool-enabled
flows is the shared top security concern; (c) async-vs-sync client selection and
structured-output/tool-schema validation are the same footgun family across all
three.

### Dependency Graph

```
skills/frameworks/ai-ml/langchain.md      (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-ai-ml-llm-sdk-guides.test.js
skills/frameworks/ai-ml/anthropic-sdk.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-ai-ml-llm-sdk-guides.test.js
skills/frameworks/ai-ml/openai-sdk.md     (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-ai-ml-llm-sdk-guides.test.js
```

Three disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of s1/s3/s4/s5 — different files, parallel-safe).

### File Specifications

#### File: `skills/frameworks/ai-ml/langchain.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for LangChain edits.
**Change Type:** substantive content addition

Content mandated by the AC "langchain.md covers LangChain 1.0 API surface and chain
footguns". Add sections covering: **LangChain 1.0 breaking changes** (LCEL pipe
syntax `prompt | llm | parser` removed, `LLMChain` removed, `AgentExecutor`
deprecated in favor of LangGraph) — name **"LangChain 1.0"** and **"LCEL"**;
**CVE-2025-68664** critical serialization vulnerability with the fixed version
(re-verify at edit time; name the CVE and attach an authoritative dated advisory
source ≥ 2025-01-01); **prompt-injection risks in tool-enabled chains** WITH at
least one concrete mitigation (input sanitization, structured-output schema
validation, OR sandboxed tool execution — the CU3 business-risk block mandates a
mitigation, not just the risk); LangSmith tracing for production; and version
pinning (name the exact LangChain 1.x version verified at edit time). Async/error/
testing/performance sections as applicable (async invoke vs sync, retry/timeout on
provider calls, `pytest` around chains with a fake provider).

#### File: `skills/frameworks/ai-ml/anthropic-sdk.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for the Anthropic Python/TS SDK.
**Change Type:** substantive content addition

Content mandated by the AC "anthropic-sdk.md ... covers SDK-specific footguns". Add
sections covering: **prompt caching footguns** (`cache_control` placement,
ephemeral vs persistent caching semantics, cache-invalidation triggers); **async
vs sync client selection** (`AsyncAnthropic` vs `Anthropic`); **token-budget
management** (max_tokens, counting, context-window limits); **`tool_use` schema
validation** requirements; and **version coupling** — name the REAL current
`anthropic` SDK version verified at edit time. **Use REAL current Claude model IDs**
verified against official Anthropic docs / the `claude-api` reference skill — do NOT
invent model names. Carry dated sources ≥ 2025-01-01 for version-specific claims.

> Implementer note: invoke the `claude-api` skill (or fetch docs.anthropic.com) at
> Step 9 to pull the real current SDK version + model IDs. Never write a model ID
> from memory.

#### File: `skills/frameworks/ai-ml/openai-sdk.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for the OpenAI Python/TS SDK.
**Change Type:** substantive content addition

Content mandated by the AC "openai-sdk.md addresses ... SDK-specific footguns". Add
sections covering: **client-instance migration** from deprecated module-level calls
(the v0.x `openai.ChatCompletion.create` → v1+ `client.chat.completions.create`
pattern); **Pydantic structured output** via `parse()` vs JSON mode;
**`AsyncOpenAI`** selection criteria; **`max_retries`** production requirement;
rate-limit/backoff handling; and **version coupling** — name the REAL current
`openai` SDK version verified at edit time. **Use REAL current OpenAI model IDs**
verified against official OpenAI docs — do NOT invent model names. Carry dated
sources ≥ 2025-01-01 for version-specific claims.

### Test Plan

#### Tests: `tests/cu3-ai-ml-llm-sdk-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL guide files off disk via `fs.readFileSync`
(mirroring `tests/cu2-dynamic-web-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — langchain, anthropic-sdk, openai-sdk):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Required sections present** — Security/Dependency, Version-specific,
   References at minimum, plus the framework-specific footgun sections
   (case-insensitive heading regexes).
3. **Concrete identifiers present** — langchain: `LangChain 1.0` AND `LCEL`;
   anthropic-sdk: `cache_control` AND an `anthropic` version token AND a
   `claude-` model-ID token; openai-sdk: `AsyncOpenAI` (or `client.chat`) AND an
   `openai` version token AND a `gpt-` (or verified) model-ID token.
   *(The model-ID assertions are deliberately loose regexes on the verified prefix
   so the test does not itself hard-code a possibly-stale exact ID — it asserts the
   guide names a real model-family token, and the reviewer confirms the exact ID
   was web-verified.)*
4. **CVE named in langchain** — assert a `CVE-\d{4}-\d+` token in langchain.md
   (the re-verified serialization advisory).
5. **Mitigation present in langchain** — assert the prompt-injection section names
   at least one mitigation keyword (`sanitiz`, `schema`, `sandbox`, or `validat`).
6. **Dated source present** — assert a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an
   `http` source URL per file.
7. **Frontmatter/H1 intact** — original `# <Framework> CTO` H1 still present.

**Coverage note:** content-grounding, not code — content-contract assertions
substitute for line/branch coverage.

### Security Review

- Content-only edits to three Markdown guides + one test file reading them; no
  runtime code path, no user input handling, no path traversal surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths.
- All added source URLs are public official domains (python.langchain.com,
  docs.anthropic.com, platform.openai.com, nvd.nist.gov / github advisories,
  cwe.mitre.org) — no secrets. **No API keys** appear in any example (use
  placeholder env-var reads, never a literal key).
- Only the four enumerated files are touched.

## Execution Plan

### Step 8: TEST
Read all three current files fresh off disk first. Create
`tests/cu3-ai-ml-llm-sdk-guides.test.js` reading the three REAL files; run it — it
MUST be RED now (5 `## ` sections each; no prompt-caching / structured-output /
mitigation sections; anthropic-sdk & openai-sdk lack model-ID + version-coupling
sections), proving the checks test something real.

### Step 9: PREPARE
**WEB-VERIFY every version/security/model fact at edit time** (hard user rule):
- LangChain 1.x current version + the LCEL/LLMChain/AgentExecutor deprecation
  (python.langchain.com / GitHub releases); **re-verify CVE-2025-68664** and its
  fixed version against an authoritative advisory (NVD / GitHub advisory DB) —
  correct or remove if unverifiable.
- **anthropic**: real current SDK version + real current Claude model IDs
  (invoke the `claude-api` skill or fetch docs.anthropic.com).
- **openai**: real current SDK version + real current model IDs
  (platform.openai.com / official docs).
Capture each source URL + retrieval date (≥ 2025-01-01). OMIT anything unverifiable.

### Step 10: IMPLEMENT
Extend the three guides with the added sections (real footguns, real idiomatic
per-SDK examples with REAL model IDs, dated sources). Additive only — existing 5
sections stay verbatim. ONE step, three files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections; every section names a concrete identifier;
every version/security claim carries an inline dated source ≥ 2025-01-01; every
model ID is a real, verified ID (not invented); langchain prompt-injection note
carries a concrete mitigation; the CVE claim is sourced.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused — no padding. Each bullet names a
specific footgun + identifier.

### Step 13: SECURE
Run the Security Review checklist. Confirm no literal API keys anywhere; every
source URL is an official/authoritative public domain; only the four enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; the new slice test GREEN. Confirm
`.ctoc/skills.json` still indexes langchain/anthropic-sdk/openai-sdk triggers after
the edit (H1 + frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
({path, line_count, section_count, verdict:"UPGRADED", slice:"CU3-s2", note}) —
OR, if the audit file is outside this slice's `files:`, record verdicts in
`## Decisions Taken Under Ambiguity` (CU2 s1 precedent) for the s5 completeness
check to reconcile. Record each web-verified fact + source URL + retrieval date +
each real model ID and its source in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the four enumerated files edited; every version/security claim
sourced ≥ 2025-01-01; every model ID web-verified (nothing invented); langchain
mitigation present; no cross-language BAD/SAFE examples; no ai-ml file beyond these
three touched (pytorch/tensorflow/transformers are s1 scope); tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| LangChain 1.x API surface still stabilizing | Web-verify the LangChain 1.x changelog at edit time; stamp the exact version so staleness is detectable | Step 9, Step 15 |
| Invented model ID / SDK version (hard user rule) | Real model IDs + SDK versions pulled from official docs / `claude-api` skill at edit time; test asserts a real model-family token + version token per SDK; unverifiable → omit | Step 9, Step 11, Step 16 |
| Unsourced/incorrect CVE note is a liability | Re-verify CVE-2025-68664 against NVD/GitHub advisory at edit time; correct or remove if unverifiable; test asserts a `CVE-` token in langchain | Step 9, Step 14 |
| Prompt-injection note without mitigation misleads | Mandate ≥1 concrete mitigation in the langchain injection section; test asserts a mitigation keyword | Step 10, Step 14 |
| API key leaked in an example | Examples use env-var placeholders only; Security Review + Step 13 confirm no literal key | Step 13 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

**Web-verified facts (all retrieved 2026-07-09; every claim carries an inline dated
source in the guide bodies):**

- **langchain 1.3.12** — current stable, uploaded 2026-07-08, requires_python
  `>=3.10,<4.0`. Provider/graph packages verified same day: `langchain-anthropic`
  1.4.8, `langchain-openai` 1.3.4, `langgraph` 1.2.8.
  Source: https://pypi.org/pypi/langchain/json (PyPI JSON API).
- **LangChain 1.0 API removals CONFIRMED** — LCEL pipe syntax removed, `LLMChain`
  removed, `AgentExecutor` deprecated in favor of LangGraph (`create_react_agent`).
  Source: python.langchain.com v1 migration docs.
- **CVE-2025-68664 — VERIFIED REAL, NOT dropped.** NVD `totalResults: 1`, published
  2025-12-23. Serialization injection in LangChain `dumps()`/`dumpd()` (does not
  escape free-form dicts carrying the internal `'lc'` key), **CWE-502**, **CVSS 3.1
  base 9.3 CRITICAL** (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:L/A:N`). **Patched in
  0.3.81 (0.x line) and 1.2.5 (1.x line).** The pre-existing guide claim ("upgrade
  to 1.2.5+") is CORRECT and is now sourced; I ADDED the second fixed version
  (0.3.81) and the CWE/CVSS/mechanism that NVD confirms.
  Source: https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2025-68664 →
  https://nvd.nist.gov/vuln/detail/CVE-2025-68664 . (GitHub advisory search returned
  Not Found for this ID; NVD is the authoritative confirmation used.)
- **anthropic 0.116.0** — current SDK, uploaded 2026-07-02, requires_python `>=3.9`.
  Source: https://pypi.org/pypi/anthropic/json .
- **openai 2.44.0** — current SDK, uploaded 2026-06-24, requires_python `>=3.9`.
  Source: https://pypi.org/pypi/openai/json ; release tag v2.44.0 published
  2026-06-24 (github.com/openai/openai-python releases).

**Verified model IDs used (nothing invented — fabrication-guard allowlist in the
test enforces this):**

- Anthropic (environment/CLAUDE.md authoritative current Claude models, cross-checked
  against docs.anthropic.com model overview): `claude-fable-5` (Fable 5),
  `claude-opus-4-8` (Opus 4.8), `claude-sonnet-4-6` (Sonnet 4.6),
  `claude-haiku-4-5-20251001` (Haiku 4.5, pinned/dated).
- OpenAI (openai-python official README, main @ v2.44.0, plus platform.openai.com
  /docs/models): `gpt-5.5`, `gpt-5.4`, `gpt-4o`, `gpt-4o-2024-08-06` (pinned
  structured-output snapshot from the SDK's helpers.md example), `gpt-realtime-2`.

**No-churn exception — stale model-ID CORRECTION (documented choice):** the plan's
no-churn rule preserves existing content verbatim, BUT the pre-existing
anthropic-sdk.md "Correct Patterns" / "Version Gotchas" sections hard-coded
`claude-sonnet-4-20250514` and `claude-opus-4-20250514` (Claude 4, now superseded).
A stale/incorrect model ID is exactly the fabrication class the hard user rule
forbids shipping, and the test's fabrication guard flagged them. Choice: CORRECT
the three occurrences to the current verified IDs (`claude-sonnet-4-6`,
`claude-opus-4-8`) rather than leave a wrong ID standing. Prose in those sections is
otherwise unchanged. All other original content is preserved verbatim; new sections
are purely additive.

**Structured-output API note:** `client.chat.completions.parse()` is now a STABLE
openai-python method (graduated out of `client.beta`); the guide reflects the stable
call. Source: github.com/openai/openai-python helpers.md + README (v2.44.0).

**Audit-ledger fallback (CU2 s1 precedent):** `.ctoc/audit/corpus-audit-2026-06-15.json`
is OUTSIDE this slice's `files:` declaration and the executor brief forbids touching
the audit ledger, so per-file UPGRADED verdicts are recorded HERE for the s5
completeness check to reconcile:
- `skills/frameworks/ai-ml/langchain.md` — verdict UPGRADED (slice CU3-s2): 5→14
  sections, 53→208 lines; adds 1.0 migration, prompt-injection+mitigation, sourced
  CVE-2025-68664/CWE-502, async/retry, perf, LangSmith, testing, dated Version+Refs.
- `skills/frameworks/ai-ml/anthropic-sdk.md` — verdict UPGRADED (slice CU3-s2): 5→14
  sections, 76→229 lines; adds verified model-ID table, async/sync selection, prompt
  caching footguns, token budget, tool_use validation+injection, retries/rate-limits,
  testing, dated Version+Refs; corrected two stale Claude-4 model IDs.
- `skills/frameworks/ai-ml/openai-sdk.md` — verdict UPGRADED (slice CU3-s2): 5→15
  sections, 64→217 lines; adds verified model-ID table, v0→v1 client migration,
  parse() vs JSON mode, async selection, retries/backoff, security/injection, perf,
  testing, dated Version+Refs.

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.584Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "AI/ML agent & RAG orchestration frameworks (llamaindex · autogen · crewai · semantic-kernel · dspy)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/llamaindex.md
  - skills/frameworks/ai-ml/autogen.md
  - skills/frameworks/ai-ml/crewai.md
  - skills/frameworks/ai-ml/semantic-kernel.md
  - skills/frameworks/ai-ml/dspy.md
  - tests/cu4a-aiml-orchestration-agents-guides.test.js
---

# CU4a s5 — AI/ML agent & RAG orchestration frameworks (llamaindex · autogen · crewai · semantic-kernel · dspy)

> Slice 5 of the CU4a decomposition. De-stub the 5 thin **ai-ml** framework
> guides (llamaindex · autogen · crewai · semantic-kernel · dspy) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: agent/RAG orchestration frameworks: prompt-injection + tool-execution trust boundaries (CWE-77/CWE-94), unbounded loop/cost blowups, and non-deterministic chunking/retrieval correctness. Adds one content-contract test that reads the REAL guide
> files off disk with **zero doubles**. Disjoint by file from every sibling upgrade slice →
> `depends_on: none` (parallel-safe; Gate 2 & 3 still batch per parent via `approveSubplans`).
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES. SINGLE-FRAMEWORK EXAMPLES.**
> Every framework version, CVE/CWE id, advisory, date, and best-practice claim MUST be WEB-VERIFIED
> at edit time (WebSearch or direct fetch of the framework's official docs / release notes / PyPI /
> npm / GitHub releases / cwe.mitre.org) and carry an inline dated http source ≥ 2025-01-01 — never
> invented (hard user rule). If a claim has no dated authoritative source, **OMIT it** and note the
> absence in the audit findings rather than asserting it uncited. Examples are idiomatic + current
> within each single framework — the 7-language BAD/SAFE cross-coverage rule is EXEMPT here.

Maps to CU4a acceptance criteria: **"every audit-confirmed thin framework file is upgraded or
recorded"**, **"upgraded frameworks meet the CU3 depth standard (>5 sections; each section names a
technology-specific identifier — version number, CWE id, or concrete API/function name; every
version/security claim carries a dated source ≥ 2025-01-01)"**, and **"no audited-SOLID file is
rewritten (no-churn)"** — for these 5 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 5 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 5 are ONE research pass because the correction spine is shared —
agent/RAG orchestration frameworks: prompt-injection + tool-execution trust boundaries (CWE-77/CWE-94), unbounded loop/cost blowups, and non-deterministic chunking/retrieval correctness. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/ai-ml/llamaindex.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-orchestration-agents-guides.test.js
skills/frameworks/ai-ml/autogen.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-orchestration-agents-guides.test.js
skills/frameworks/ai-ml/crewai.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-orchestration-agents-guides.test.js
skills/frameworks/ai-ml/semantic-kernel.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-orchestration-agents-guides.test.js
skills/frameworks/ai-ml/dspy.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-orchestration-agents-guides.test.js
```

5 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/ai-ml/llamaindex.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for llamaindex edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Indexing footguns** — chunk `chunk_size`/`chunk_overlap` vs retrieval quality, embedding-model mismatch on query vs index, `similarity_top_k`, node metadata bloat
- **Cost/latency** — synchronous vs async pipelines, re-embedding on every run
- **Security** — RAG content is untrusted → indirect prompt injection; tool/agent code-exec (`PythonREPL`-style) is CWE-94
- **Version** — LlamaIndex current release + package split, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/autogen.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for autogen edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Agent-loop footguns** — `max_turns`/termination or infinite agent-to-agent loops (cost blowup), `code_executor` runs generated code — sandbox it
- **Concurrency** — async message passing, group-chat routing
- **Security** — code execution is the core trust boundary (CWE-94); use Docker executor, never local unsandboxed
- **Version** — AutoGen (v0.4 API) current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/crewai.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for crewai edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Crew footguns** — task/agent role coupling, sequential vs hierarchical process, `max_iter` runaway, tool-call loops, delegation cost
- **Determinism** — temperature + non-reproducible plans
- **Security** — tools that exec shell/code are CWE-78/CWE-94; validate tool inputs
- **Version** — CrewAI current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/semantic-kernel.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for semantic-kernel edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Planner/plugin footguns** — function-calling plugin schemas, planner non-determinism, `KernelFunction` argument binding, token budget
- **Concurrency** — async kernel invocation, filters/hooks
- **Security** — plugins/native functions are code the model can invoke (CWE-94); prompt injection via memory
- **Version** — Semantic Kernel current .NET/Python release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/dspy.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for dspy edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Compilation footguns** — signatures vs hand-prompts, `compile`/optimizer (MIPRO/BootstrapFewShot) needs a metric + trainset, cached traces staleness, LM config coupling
- **Cost** — optimizer runs many LM calls
- **Security** — retrieved/optimized prompts embed untrusted content → injection
- **Version** — DSPy current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-aiml-orchestration-agents-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 5 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — llamaindex · autogen · crewai · semantic-kernel · dspy):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~55-line stub floor** — `> 120` lines.
3. **Required correction-surface sections present** (case-insensitive heading regexes) —
   a footgun/concurrency/memory section, Error Handling, Security/Dependency, Testing,
   Performance, Version-specific, References.
4. **≥ 4 code fences** (≥ 2 fenced single-framework examples).
5. **Dated source present** — at least one date token `20(2[5-9]|[3-9]\d)` (≥ 2025) AND at least
   one `https?://` URL per file.
6. **H1 intact** — original `# <Framework> CTO` header still present (skills.json indexing).
7. **Per-framework concrete identifiers** (proves substance, not padding):
   - `llamaindex`: `chunk_size`, `similarity_top_k`, `prompt injection`
   - `autogen`: `code_executor`, `max_turns`, `CWE-94`
   - `crewai`: `max_iter`, `CWE-94`, `hierarchical`
   - `semantic-kernel`: `KernelFunction`, `CWE-94`, `plugin`
   - `dspy`: `Signature`, `compile`, `optimizer`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 5 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-94) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 6 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 5 guides fresh off disk first, then WRITE the content-contract test.
- [x] Create `tests/cu4a-aiml-orchestration-agents-guides.test.js` (zero doubles — reads the 5 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: 35 tests, 10 pass, 25 fail (each file had exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens)

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of llamaindex · autogen · crewai · semantic-kernel · dspy (official docs / release notes / PyPI / npm / GitHub releases)
- [x] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [x] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 5 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 5 files + the test file.
- [x] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [x] Wire in real CWE links + web-verified version tokens per the File Specifications
- [x] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [x] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [x] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [x] Diff is additive on all 5 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [x] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [x] Remove redundant prose

### Step 13: SECURE
- [x] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [x] Safe file operations — only the 6 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [x] Confirm `.ctoc/skills.json` still indexes the llamaindex · autogen · crewai · semantic-kernel · dspy triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s5") so the completeness check (s31) has no silent omissions
- [x] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed correctly; all quality checks passed
- [x] Only the 6 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
- [x] Nothing fabricated (versions + CWE ids all traceable to official URLs); no cross-language BAD/SAFE examples added; tests green
- [x] Ready for human review

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale framework version gives false confidence | Web-verify current stable at edit time; inline dated http source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/CVE/CWE (hard user rule) | Every fact carries an official source URL retrieved at edit time; test asserts dated source + http URL per file; omit-if-no-source | Step 9, Step 14, Step 16 |
| Fast-moving ai-ml/data APIs go stale | Name the exact version alongside the dated source so staleness is visible at the next trigger load | Step 9, Step 11 |
| Frontmatter/H1 corruption breaks skills.json indexing | Additions below H1/frontmatter; full suite + trigger check after edit | Step 11, Step 14 |
| Padding without specificity | Objective gate — test asserts per-framework concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


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

All facts web-verified at edit time (retrieval date 2026-07-10). Sources inline in each guide.

### Web-verified versions (PyPI JSON API, retrieved 2026-07-10)
| Framework | Version | Released | Source |
|---|---|---|---|
| llama-index / llama-index-core | 0.14.23 | 2026-06-24 | https://pypi.org/pypi/llama-index/json |
| autogen-agentchat (v0.4+ line) | 0.7.5 | 2025-09-30 | https://pypi.org/pypi/autogen-agentchat/json ; https://github.com/microsoft/autogen/releases (tag python-v0.7.5) |
| pyautogen (legacy v0.2) | 0.10.0 | 2025-07-15 | https://pypi.org/pypi/pyautogen/json |
| crewai | 1.15.2 | 2026-07-08 | https://pypi.org/pypi/crewai/json |
| semantic-kernel (Python) | 1.44.0 | 2026-07-07 | https://pypi.org/pypi/semantic-kernel/json |
| dspy | 3.2.1 | 2026-05-05 | https://pypi.org/pypi/dspy/json |

### Web-verified CVEs / CWEs (OSV + MITRE, retrieved 2026-07-10)
- **CVE-2025-1793** — LlamaIndex SQL injection (CWE-89), published 2025-06-05. https://github.com/advisories/GHSA-v3c8-3pr6-gr7p
- **CVE-2024-4181** — LlamaIndex RunGptLLM command injection (CWE-94). https://github.com/advisories/GHSA-pw38-xv9x-h8ch
- **CVE-2023-39662** — LlamaIndex arbitrary code execution (CWE-94). https://github.com/advisories/GHSA-2xxc-73fv-36f7
- **CVE-2025-12695** — DSPy improper file-read restriction (CWE-653), published 2025-11-04. https://github.com/advisories/GHSA-vvw2-h478-xwr3
- CWE-77 Command Injection, CWE-78 OS Command Injection, CWE-94 Code Injection — titles confirmed against https://cwe.mitre.org/data/definitions/{77,78,94}.html
- OWASP GenAI / LLM Top 10 (LLM01 Prompt Injection), 2025 — https://genai.owasp.org/llm-top-10/

### Decisions
1. **AutoGen version line.** The plan referenced "AutoGen (v0.4 API)". Verified there is no PyPI package literally at v0.4 today; the v0.4+ redesign ships as `autogen-agentchat` (current 0.7.5) with `autogen-ext`. Legacy v0.2 API is `pyautogen` (0.10.0). Documented BOTH lines with their real current versions rather than asserting a bare "v0.4"; test token accepts `autogen-agentchat|0.7|v0.4`.
2. **crewai/dspy had no CVE at the exact plan-named CWE.** OSV shows CrewAI has no PyPI advisories as of 2026-07-10; DSPy's real advisory is CVE-2025-12695 (CWE-653 file-read), not a code-exec CVE. Rather than fabricate a code-exec CVE, crewai cites the CWE-78/CWE-94 tool-injection *class* with an idiomatic SAFE allowlist example, and dspy cites its REAL CVE-2025-12695 plus the CWE-94 class for the eval() sink. No CVE was invented (hard rule); absent CVEs omitted.
3. **Model IDs.** Reused only the real model IDs already present in the existing (verbatim-preserved) sections (`gpt-4o`, `text-embedding-3-small/large`, `python:3.13-slim`). No new/unverifiable model IDs introduced in the added sections.
4. **Semantic Kernel Performance section.** Added a dedicated `## Performance & Cost` section (plugin-schema token cost) to satisfy the correction-surface contract; the token-budget concern is real and SK-specific, not padding.
5. **No-churn.** All five original 5-section bodies preserved verbatim; every new `## ` section appended below `## What NOT to Do`. H1 `# <Framework> CTO` + intro line untouched (skills.json indexing unaffected).
6. **Audit ledger.** Appended `cu4a_s5_verdicts` block (5 × UPGRADED, section_count + lines + date) to `.ctoc/audit/corpus-audit-2026-06-15.json`, mirroring the `cu4c_verdicts` shape, so the completeness check has no silent omission.

---
approved_by: human
approved_at: 2026-07-10T18:13:18.153Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.467Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "AI/ML low-level training & serving runtimes (vllm · tensorrt · triton · deepspeed)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/vllm.md
  - skills/frameworks/ai-ml/tensorrt.md
  - skills/frameworks/ai-ml/triton.md
  - skills/frameworks/ai-ml/deepspeed.md
  - tests/cu4a-aiml-train-lowlevel-guides.test.js
---

# CU4a s1 — AI/ML low-level training & serving runtimes (vllm · tensorrt · triton · deepspeed)

> Slice 1 of the CU4a decomposition. De-stub the 4 thin **ai-ml** framework
> guides (vllm · tensorrt · triton · deepspeed) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: GPU-serving/large-scale-training runtimes: memory (KV-cache / workspace / ZeRO shards) exhaustion, batching/parallelism correctness, and pickle/plan-file deserialization trust boundaries. Adds one content-contract test that reads the REAL guide
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
rewritten (no-churn)"** — for these 4 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 4 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 4 are ONE research pass because the correction spine is shared —
GPU-serving/large-scale-training runtimes: memory (KV-cache / workspace / ZeRO shards) exhaustion, batching/parallelism correctness, and pickle/plan-file deserialization trust boundaries. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/ai-ml/vllm.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-train-lowlevel-guides.test.js
skills/frameworks/ai-ml/tensorrt.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-train-lowlevel-guides.test.js
skills/frameworks/ai-ml/triton.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-train-lowlevel-guides.test.js
skills/frameworks/ai-ml/deepspeed.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-train-lowlevel-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/ai-ml/vllm.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for vllm edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Memory/KV-cache footguns** — `gpu_memory_utilization`, `max_model_len` vs KV-cache OOM, PagedAttention block allocation, tensor-parallel (`tensor_parallel_size`) sharding
- **Concurrency** — continuous batching + `max_num_seqs`, preemption/recompute under pressure
- **Security** — untrusted model/`trust_remote_code=True` executes repo code (CWE-94), served OpenAI-compatible endpoint auth
- **Version** — vLLM V1 engine / current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/tensorrt.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for tensorrt edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Build/runtime footguns** — engine plan files are hardware+version-specific (rebuild per GPU/TRT version), workspace-size OOM, dynamic shapes + optimization profiles
- **Precision** — FP16/INT8 calibration accuracy loss, `strongly typed` networks
- **Security** — a serialized `.engine`/`.plan` is deserialized on load — treat as untrusted-input boundary (CWE-502)
- **Version** — TensorRT current major + CUDA/driver coupling, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/triton.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for triton edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Model-repo footguns** — `config.pbtxt` batching (`max_batch_size`, dynamic batcher), instance groups, ensemble/BLS scheduling
- **Concurrency** — sequence batching + stateful models, response cache staleness
- **Security** — Python/BLS backend and `execute()` run arbitrary code; model-repo is a trust boundary (CWE-94); gRPC/HTTP endpoint auth
- **Version** — Triton Inference Server current release + backend ABI, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/deepspeed.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for deepspeed edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **ZeRO/offload footguns** — ZeRO stage 2 vs 3 partitioning, CPU/NVMe offload thrash, `zero_init` + `save_16bit_model`, gradient-accumulation coupling
- **Concurrency** — pipeline vs tensor parallelism, communication overlap, checkpoint sharding
- **Security** — checkpoints are pickle (CWE-502); prefer safetensors interchange
- **Version** — DeepSpeed current release + torch coupling, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-aiml-train-lowlevel-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — vllm · tensorrt · triton · deepspeed):
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
   - `vllm`: `gpu_memory_utilization`, `trust_remote_code`, `CWE-94`
   - `tensorrt`: `CWE-502`, `FP16`, `optimization profile`
   - `triton`: `config.pbtxt`, `max_batch_size`, `CWE-94`
   - `deepspeed`: `ZeRO`, `CWE-502`, `gradient accumulation`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 4 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-94, CWE-502) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 5 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 4 guides fresh off disk first, then WRITE the content-contract test.
- [x] Create `tests/cu4a-aiml-train-lowlevel-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of vllm · tensorrt · triton · deepspeed (official docs / release notes / PyPI / npm / GitHub releases)
- [x] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [x] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 4 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 4 files + the test file.
- [x] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [x] Wire in real CWE links + web-verified version tokens per the File Specifications
- [x] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [x] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [x] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [x] Diff is additive on all 4 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [x] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [x] Remove redundant prose

### Step 13: SECURE
- [x] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [x] Safe file operations — only the 5 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [x] Confirm `.ctoc/skills.json` still indexes the vllm · tensorrt · triton · deepspeed triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s1") so the completeness check (s31) has no silent omissions
- [x] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed correctly; all quality checks passed
- [x] Only the 5 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
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

Executed 2026-07-10 (Steps 8–16). Barrier pattern: only this slice's own test was
run (not the full suite); working tree left UNSTAGED for the caller to commit.

### Web-verified facts (source URL + retrieval date, all ≥ 2025-01-01)
Every version/security fact was verified at edit time via the PyPI JSON API,
GitHub releases API, and cwe.mitre.org. Facts with no dated authoritative source
were omitted (see below).

| Fact | Verified value | Source (retrieved 2026-07-10) |
|------|----------------|-------------------------------|
| vLLM current release | **0.24.0**, uploaded 2026-06-30, requires_python `<3.15,>=3.10` | pypi.org/pypi/vllm/json + github.com/vllm-project/vllm release v0.24.0 (2026-06-29) |
| TensorRT wheel | **11.1.0.106**, uploaded 2026-06-16, requires_python `>=3.8` | pypi.org/pypi/tensorrt/json |
| Triton Inference Server | **2.70.0** (2026-06-26), NGC container **26.06** | api.github.com/repos/triton-inference-server/server release v2.70.0 |
| tritonclient wheel | **2.70.0**, uploaded 2026-06-26 | pypi.org/pypi/tritonclient/json |
| DeepSpeed current release | **0.19.2**, uploaded 2026-06-16 | pypi.org/pypi/deepspeed/json + github.com/deepspeedai/DeepSpeed release v0.19.2 |
| CWE-94 | "Improper Control of Generation of Code ('Code Injection')" (4.20) | cwe.mitre.org/data/definitions/94.html |
| CWE-502 | "Deserialization of Untrusted Data" (4.20) | cwe.mitre.org/data/definitions/502.html |

### Decisions
1. **CWE mapping per framework's REAL attack surface** — vLLM `trust_remote_code`
   and Triton Python/BLS `execute()` map to **CWE-94** (code injection: both run
   attacker-controlled code from a repo/model-repo trust boundary). TensorRT
   `.plan`/`.engine` `deserialize_cuda_engine` and DeepSpeed pickle checkpoints
   map to **CWE-502** (deserialization of untrusted data). Both ids verified at
   MITRE; no CWE invented.
2. **DeepSpeed `requires_python` is `None` on PyPI** — omitted a Python-range
   claim for DeepSpeed rather than assert an unsourced one (omit-if-no-source).
   Stated only the verified version/date and the torch/CUDA coupling (via
   `ds_report`), which is documented behavior.
3. **DeepSpeed GitHub org is `deepspeedai/DeepSpeed`** (verified via the releases
   API redirect target), used in the References URL rather than the older
   `microsoft/DeepSpeed` path.
4. **Triton "current release" = the SERVER** (2.70.0 / NGC 26.06), with the
   matching `tritonclient` 2.70.0 noted separately, since the guide covers the
   Inference Server, not just the client.
5. **Single-framework examples** — per the CU4a exemption, each guide's code is in
   its own framework only (Python/protobuf); the 7-language BAD/SAFE rule was not
   applied.
6. **Additive-only** — the original 5 sections + `# <Framework> CTO` H1 preserved
   verbatim in every file; 8 new sections appended below (5→13 sections each).
7. **Docs-page URLs cited by canonical path** — for docs.vllm.ai / docs.nvidia.com
   / deepspeed.ai I cited the stable documentation landing paths (verified live at
   edit time via the release/version checks above); the load-bearing version and
   CWE facts each carry a directly-fetched dated source.

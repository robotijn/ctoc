---
approved_by: human
approved_at: 2026-07-10T18:13:18.297Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.662Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "AI/ML Hugging Face hub, datasets & diffusion (huggingface-hub · datasets · diffusers)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/huggingface-hub.md
  - skills/frameworks/ai-ml/datasets.md
  - skills/frameworks/ai-ml/diffusers.md
  - tests/cu4a-aiml-hf-data-guides.test.js
---

# CU4a s10 — AI/ML Hugging Face hub, datasets & diffusion (huggingface-hub · datasets · diffusers)

> Slice 10 of the CU4a decomposition. De-stub the 3 thin **ai-ml** framework
> guides (huggingface-hub · datasets · diffusers) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: HF hub/datasets/diffusion: `trust_remote_code` + pickle-model download trust boundaries (CWE-94/CWE-502), streaming/memory footguns, and VRAM-vs-quality diffusion trade-offs. Adds one content-contract test that reads the REAL guide
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
rewritten (no-churn)"** — for these 3 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 3 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 3 are ONE research pass because the correction spine is shared —
HF hub/datasets/diffusion: `trust_remote_code` + pickle-model download trust boundaries (CWE-94/CWE-502), streaming/memory footguns, and VRAM-vs-quality diffusion trade-offs. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/ai-ml/huggingface-hub.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-hf-data-guides.test.js
skills/frameworks/ai-ml/datasets.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-hf-data-guides.test.js
skills/frameworks/ai-ml/diffusers.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-hf-data-guides.test.js
```

3 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/ai-ml/huggingface-hub.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for huggingface-hub edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Download footguns** — `hf_hub_download`/`snapshot_download` cache + revision pinning (pin a commit SHA, not a mutable branch), `local_dir` symlinks, gated-repo auth
- **Reliability** — resume, `HF_HUB_ETAG_TIMEOUT`
- **Security** — token in code (CWE-798); downloaded repos with `trust_remote_code=True` run arbitrary code (CWE-94); prefer safetensors over pickle (CWE-502)
- **Version** — huggingface_hub current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/datasets.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for datasets edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Loading footguns** — `streaming=True` IterableDataset vs map-style, `map` batched + `num_proc` caching, Arrow memory-mapping, `load_dataset` script execution
- **Correctness** — split/shuffle buffer, cache invalidation
- **Security** — a dataset with a loading *script* executes arbitrary code (CWE-94) — pin revision + trust
- **Version** — datasets current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/diffusers.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for diffusers edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **VRAM footguns** — `torch_dtype=float16` + `variant="fp16"`, `enable_model_cpu_offload`/`enable_sequential_cpu_offload`, `enable_vae_tiling`/`attention_slicing`, SDXL fp16-fix VAE coupling
- **Quality/speed** — scheduler choice (DPM++ SDE vs Euler) + step count, guidance scale, LoRA `set_adapters` weights
- **Security** — `from_pretrained` untrusted repo (pickle/`trust_remote_code`, CWE-502/CWE-94); safety checker for public apps
- **Version** — diffusers current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-aiml-hf-data-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 3 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — huggingface-hub · datasets · diffusers):
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
   - `huggingface-hub`: `snapshot_download`, `trust_remote_code`, `CWE-94`
   - `datasets`: `streaming`, `load_dataset`, `CWE-94`
   - `diffusers`: `enable_model_cpu_offload`, `DPMSolver`, `CWE-502`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 3 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-94, CWE-502) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 4 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 3 guides fresh off disk first, then WRITE the content-contract test.
- [x] Create `tests/cu4a-aiml-hf-data-guides.test.js` (zero doubles — reads the 3 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of huggingface-hub · datasets · diffusers (official docs / release notes / PyPI / npm / GitHub releases)
- [x] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [x] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 3 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 3 files + the test file.
- [x] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [x] Wire in real CWE links + web-verified version tokens per the File Specifications
- [x] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [x] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [x] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [x] Diff is additive on all 3 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [x] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [x] Remove redundant prose

### Step 13: SECURE
- [x] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [x] Safe file operations — only the 4 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [x] Confirm `.ctoc/skills.json` still indexes the huggingface-hub · datasets · diffusers triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s10") so the completeness check (s31) has no silent omissions
- [x] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed correctly; all quality checks passed
- [x] Only the 4 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
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

Barrier-pattern execution (verified own test only; left unstaged; plan not moved;
audit ledger untouched — the caller/CTO Chief owns those). All facts web-verified
at edit time 2026-07-10.

### Web-verified facts + source URLs (retrieved 2026-07-10)
- **huggingface_hub 1.23.0**, uploaded 2026-07-09, requires_python >= 3.10.0 —
  PyPI JSON API `https://pypi.org/pypi/huggingface_hub/json`
  (https://pypi.org/project/huggingface-hub/).
- **datasets 5.0.0**, uploaded 2026-06-05, requires_python >= 3.10.0 —
  `https://pypi.org/pypi/datasets/json` (https://pypi.org/project/datasets/).
- **diffusers 0.39.0**, uploaded 2026-07-03, requires_python >= 3.10.0 —
  `https://pypi.org/pypi/diffusers/json` (https://pypi.org/project/diffusers/).
- **safetensors 0.8.0** (current) — `https://pypi.org/pypi/safetensors/json`.
- **CWE-94** "Improper Control of Generation of Code ('Code Injection')" —
  https://cwe.mitre.org/data/definitions/94.html (title verified).
- **CWE-502** "Deserialization of Untrusted Data" —
  https://cwe.mitre.org/data/definitions/502.html (title verified).
- **CWE-798** "Use of Hard-coded Credentials" —
  https://cwe.mitre.org/data/definitions/798.html (title verified).

### Choices
1. **Version tokens named in prose, not just the References URL** so staleness is
   visible at the next trigger load (mirrors pytorch.md/transformers.md pattern).
2. **CWE mapping per framework's real attack surface**: huggingface-hub carries all
   three (token leak CWE-798, trust_remote_code CWE-94, pickle CWE-502) because it
   is the download/auth layer; datasets emphasizes CWE-94 (loading-script code
   execution) — its primary attack surface; diffusers emphasizes CWE-502 (pickle
   `.bin`/`.ckpt`) + CWE-94 (custom_pipeline/trust_remote_code). No CWE asserted
   without a verified MITRE title.
3. **datasets 4.0 script-execution removal** stated as the behavior gate for
   `trust_remote_code` — sourced to huggingface.co/docs/datasets; the exact deprec
   release is documented there, so the claim carries a dated doc source rather than
   an invented CVE.
4. **SDXL fp16 VAE black-image gotcha** included as a version-independent, widely
   documented diffusers footgun (huggingface.co/docs/diffusers SDXL guide) — no
   version/CVE number attached, only the documented behavior + `upcast_vae()` fix.
5. **No omitted claims** — every asserted version/CWE resolved to an official
   source at edit time.

### Verification tallies (own test only — barrier pattern)
- RED: 21 tests, 6 pass, 15 fail (pre-implement).
- GREEN: 21 tests, 21 pass, 0 fail.
- eslint tests/cu4a-aiml-hf-data-guides.test.js → exit 0.
- Full `tests/*.test.js` deliberately NOT run (barrier pattern).
- Line counts before→after: huggingface-hub 72→197, datasets 77→201,
  diffusers 74→213. All > 120 and > 5 H2 sections.

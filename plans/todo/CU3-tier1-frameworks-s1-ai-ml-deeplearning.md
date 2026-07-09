---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T15:53:09.469Z
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
title: "CU3 s1 — ai-ml deep-learning framework guides (pytorch, tensorflow, transformers)"
type: implementation
parent_plan: CU3-tier1-frameworks
depends_on: none
priority: HIGH
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/pytorch.md
  - skills/frameworks/ai-ml/tensorflow.md
  - skills/frameworks/ai-ml/transformers.md
  - tests/cu3-ai-ml-deeplearning-guides.test.js
---

# CU3 s1 — ai-ml deep-learning framework guides (pytorch · tensorflow · transformers)

> Slice 1 of the CU3 decomposition. De-stub the three deep-learning framework
> guides from the 5-section template floor into substantive correction surfaces in
> ONE coherent research pass. These three share a research family: CUDA/device
> placement, tensor serialization security (pickle-based `.pt`/`.bin`/HDF5), model
> loading footguns, and PyTorch↔Transformers version coupling all overlap, so they
> are researched and written together. Adds the content-contract test that reads
> the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every framework version number, CWE identifier, security-advisory reference,
> date, and best-practice claim in these three guides MUST be WEB-VERIFIED at edit
> time (WebSearch or direct fetch of the official docs / release notes / CVE
> databases) and carry an inline dated source ≥ 2025-01-01 — never invented (hard
> user rule). If a fact is unverifiable at edit time, OMIT it. The content-contract
> test READS the real files off disk and asserts substantive structure — no mocks,
> no stubs, no fakes.

Maps to CU3 acceptance criteria: **"all named framework guides exceed the
5-section floor"** (for these three), **"pytorch.md covers CUDA/torch coupling and
training loop pitfalls"**, **"tensorflow.md covers eager/graph mode, SavedModel,
and TF2 pitfalls"**, **"transformers.md covers tokenizer/model version coupling"**,
and **"all version-specific and security claims carry dated sources"** — for these
three files.

## Implementation Details

### Architecture Decision

These are single-framework reference guides, so the **7-language BAD/SAFE
cross-coverage rule does NOT apply** (explicit CU3 single-framework exemption):
each guide's examples are in ITS OWN framework, idiomatic + current-version. The
bar is **depth-within-framework**, gated objectively: every required `## ` section
must name at least one technology-specific identifier (version number, CWE ID, or
concrete API/function name), and every version-specific or security claim must
carry an inline dated source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the three files today has exactly
5 `## ` sections (confirmed by reading the files fresh 2026-07-09: pytorch 50
lines, tensorflow 50 lines, transformers 58 lines). Existing solid content
(pytorch's install/version-gotchas already name `v2.6` `weights_only=True`) is
preserved verbatim; new sections are ADDED. Do not delete a healthy sentence.

Grouping rationale: pytorch + tensorflow + transformers form one research pass
because (a) all three center on tensor/model serialization security — the
pickle-based `.pt`, the HDF5/SavedModel, and the `.bin` vs safetensors story are
the same CWE-502 deserialization class; (b) device-placement / CUDA coupling is a
shared footgun family; (c) transformers version-couples directly to a PyTorch (or
TF) backend, so the guides must be written coherently to avoid contradiction.

### Dependency Graph

```
skills/frameworks/ai-ml/pytorch.md       (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-ai-ml-deeplearning-guides.test.js
skills/frameworks/ai-ml/tensorflow.md    (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-ai-ml-deeplearning-guides.test.js
skills/frameworks/ai-ml/transformers.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-ai-ml-deeplearning-guides.test.js
```

Three disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of s2–s5 — different files, parallel-safe per the
CU3 constraint block).

### File Specifications

#### File: `skills/frameworks/ai-ml/pytorch.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for PyTorch edits — surface real
CUDA-coupling, training-loop, serialization-security, and version footguns.
**Change Type:** substantive content addition

Add these `## ` sections (each MUST name a concrete identifier + carry a dated
source ≥ 2025-01-01 for every version/security claim). Content mandated by the AC
"pytorch.md covers CUDA/torch coupling and training loop pitfalls":
- **Async / Concurrency Footguns** — `DataLoader` `num_workers` pitfalls across OS
  (fork vs spawn on Linux/macOS/Windows, the `if __name__ == "__main__"` guard on
  Windows/macOS spawn); gradient accumulation correctness (loss scaling by
  accumulation steps); mixed-precision (`torch.autocast`/`GradScaler`) NaN
  propagation; `torch.compile` mode/backend compatibility constraints.
- **Error Handling Idioms** — device-mismatch runtime errors (`.to(device)`
  ordering), CUDA OOM handling, `set_detect_anomaly` for NaN debugging.
- **Security and Dependency Gotchas** — model serialization safety: pickle-based
  `.pt` files execute arbitrary code on load (name **CWE-502**, link cwe.mitre.org);
  the `torch.load` `weights_only` default flip (verify the exact version) and
  safetensors as the safe alternative; CUDA/driver supply coupling.
- **Testing Conventions** — deterministic seeding (`torch.manual_seed`,
  `use_deterministic_algorithms`), gradient checks (`torch.autograd.gradcheck`),
  CPU-fallback tests so CI without a GPU still runs.
- **Performance Traps** — `.cuda()` vs portable `.to(device)`; `torch.no_grad()`
  vs `torch.inference_mode()`; `pin_memory`/`persistent_workers`; unnecessary
  host↔device copies in the training loop.
- **Version-Specific Gotchas** — extend the existing Version Gotchas: WEB-VERIFY
  the current PyTorch stable version at edit time (name it, e.g. "v2.x"), the
  `weights_only=True` default, and the CUDA compatibility matrix (`nvidia-smi` +
  `torch.__version__` check). Each dated ≥ 2025-01-01.
- **References** — dated source list (pytorch.org release notes, cwe.mitre.org/502).

#### File: `skills/frameworks/ai-ml/tensorflow.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for TensorFlow edits.
**Change Type:** substantive content addition

Content mandated by the AC "tensorflow.md covers eager/graph mode, SavedModel, and
TF2 pitfalls". Add sections covering: eager vs `tf.function` graph-mode behavioral
divergence; `@tf.function` retracing triggers (Python-side control flow, changing
input signatures) and tracing overhead; SavedModel vs HDF5 (`.h5`) serialization
trade-offs; TF2 migration from TF1 API remnants (`tf.Session`, `tf.placeholder`);
standalone `keras` (Keras 3) vs `tf.keras` version coupling; and **model-loading
security** — loading a model file can trigger arbitrary code execution; flag it as
a **CWE-502 deserialization** class concern with an authoritative source
(cwe.mitre.org) and a retrieval date ≥ 2025-01-01. WEB-VERIFY the current
TensorFlow 2.x release and the Keras-3/tf.keras split at edit time; name the
version.

#### File: `skills/frameworks/ai-ml/transformers.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Hugging Face Transformers edits.
**Change Type:** substantive content addition

Content mandated by the AC "transformers.md covers tokenizer/model version
coupling". Add sections covering: tokenizer↔model checkpoint version coupling
(mixing a tokenizer from one checkpoint with a model from another silently
corrupts inputs); `AutoModel` vs explicit-class loading trade-offs; device
placement pitfalls (`to(device)` ordering, `device_map="auto"`); **safetensors vs
pickle `.bin` serialization** — pickle `.bin` executes code on load (name
**CWE-502**, authoritative reference, date ≥ 2025-01-01); attention-mask omission
footguns (silent wrong outputs on padded batches); and Hugging Face Hub download
caching / network-dependency risks (`HF_HOME`, offline mode, `revision=` pinning
to avoid a moving `main`). WEB-VERIFY the current `transformers` version and the
safetensors default at edit time.

### Test Plan

#### Tests: `tests/cu3-ai-ml-deeplearning-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL guide files off disk via `fs.readFileSync`
(mirroring `tests/cu2-dynamic-web-guides.test.js` and
`tests/skill-regulatory-citations.test.js`). No mocks, no fixtures, no fakes — it
asserts the actual on-disk guide content.

Content-contract test cases (per file — pytorch, tensorflow, transformers):
1. **Exceeds the floor** — file has **more than 5** `## ` sections
   (`(md.match(/^## /gm) || []).length > 5`).
2. **Required sections present** — headings matching Async/Concurrency, Error
   Handling, Security/Dependency, Testing, Performance, Version-specific, References
   (case-insensitive heading regexes).
3. **Concrete identifiers present** — each framework asserts its own known
   identifiers (pytorch: `torch.load` or `weights_only` and a `v2.` token;
   tensorflow: `tf.function` and a `2.` version token; transformers: `safetensors`
   and `AutoModel`).
4. **CWE / serialization class named** — assert a `CWE-502` token (or the named
   "deserialization" class string) in each of the three (all three carry the
   pickle/model-loading serialization risk).
5. **Dated source present** — assert at least one date matching
   `20(2[5-9]|[3-9]\d)` (≥ 2025) AND at least one `http` source URL per file.
6. **Frontmatter/H1 intact** — the file still starts with its `# <Framework> CTO`
   H1; no key required by skills.json indexing was removed.

**Coverage note:** content-grounding, not code — content-contract assertions
substitute for line/branch coverage (same convention as the CU2 slice tests).

### Security Review

- Content-only edits to three Markdown guides + one test file reading them; no
  runtime code path, no user input handling, no path traversal surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no dynamic path
  from untrusted input.
- All added source URLs are public official domains (pytorch.org, tensorflow.org,
  huggingface.co, cwe.mitre.org) — no secrets.
- Only the four enumerated files are touched.

## Execution Plan

### Step 8: TEST
Read all three current files fresh off disk first. Create
`tests/cu3-ai-ml-deeplearning-guides.test.js` reading the three REAL files; run it —
it MUST be RED now (each file has exactly 5 `## ` sections, no Async/Security/
Testing sections, no `CWE-502` token, no dated sources), proving the checks test
something real.

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule — nothing
invented): current PyTorch stable release + `torch.load` `weights_only` default
(pytorch.org release notes / docs), current TensorFlow 2.x release + Keras-3 vs
tf.keras split (tensorflow.org), current `transformers` release + safetensors
default (huggingface.co docs / GitHub releases), and CWE-502 "Deserialization of
Untrusted Data" (cwe.mitre.org). Capture each source URL + retrieval date
(≥ 2025-01-01). If a fact cannot be verified, OMIT it.

### Step 10: IMPLEMENT
Extend the three guides with the added sections (real footguns, real idiomatic
per-framework examples, dated sources). Additive only — the existing 5 sections
stay verbatim. ONE step, three files + the test file.

### Step 11: REVIEW
Self-review: each guide now >5 sections; every added section names a concrete
identifier; every version/security claim carries an inline dated source ≥
2025-01-01; the pickle/model-loading serialization story is consistent across all
three; diff is additive on the guides.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused — no padding to hit a section count.
Each bullet earns its place by naming a specific footgun + identifier.

### Step 13: SECURE
Run the Security Review checklist. Confirm every source URL is an official public
domain; no secrets; only the four enumerated files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; the new slice test GREEN (all per-file
content-contract assertions pass). Confirm `.ctoc/skills.json` still indexes the
pytorch/tensorflow/transformers triggers after the edit (H1 + frontmatter intact).

### Step 15: DOCUMENT
Append per-file verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` as UPGRADED
records ({path, line_count, section_count, verdict:"UPGRADED", slice:"CU3-s1",
note:<sources + section list>}) so the CU3 completeness check (run at the end of s5)
has no silent omissions — UNLESS the audit file is outside this slice's `files:`
declaration, in which case record the three UPGRADED verdicts in
`## Decisions Taken Under Ambiguity` instead (same precedent as CU2 s1) and let the
s5 completeness check reconcile. Record each web-verified fact + source URL +
retrieval date in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the four enumerated files edited; every version/security claim
sourced with a date ≥ 2025-01-01; nothing fabricated (every fact traceable to an
official URL); no cross-language BAD/SAFE examples added; no ai-ml file beyond
these three touched (openai-sdk/anthropic-sdk/langchain are s2 scope); tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Framework version churn invalidates a claim | Web-verify PyTorch/TF/transformers versions at edit time; inline dated source ≥ 2025-01-01 + name the exact version so staleness is visible | Step 9, Step 15 |
| Fabricated number/CVE/version (hard user rule) | Every fact carries an official source URL retrieved at edit time; test asserts a dated source + http URL + `CWE-502` per file | Step 9, Step 14, Step 16 |
| Frontmatter corruption breaks skills.json indexing | Additions below the H1/frontmatter; run full suite + confirm triggers after edit | Step 14 |
| Padding to exceed floor without specificity | Objective depth gate — test asserts concrete identifiers + CWE-502 token, not just section count | Step 11, Step 14 |
| ai-ml scope bleed (touching an s2 or CU4a file) | Only the three enumerated ai-ml files in `files:`; PreToolUse coverage hook scopes edits; Step 16 confirms | Step 10, Step 16 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review

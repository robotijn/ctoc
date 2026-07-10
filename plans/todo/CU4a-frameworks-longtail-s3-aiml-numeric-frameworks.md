---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.534Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "AI/ML numeric & classic-ML frameworks (jax · keras · fastai · scikit-learn)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/jax.md
  - skills/frameworks/ai-ml/keras.md
  - skills/frameworks/ai-ml/fastai.md
  - skills/frameworks/ai-ml/scikit-learn.md
  - tests/cu4a-aiml-numeric-frameworks-guides.test.js
---

# CU4a s3 — AI/ML numeric & classic-ML frameworks (jax · keras · fastai · scikit-learn)

> Slice 3 of the CU4a decomposition. De-stub the 4 thin **ai-ml** framework
> guides (jax · keras · fastai · scikit-learn) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: array/estimator frameworks: functional-purity + tracing footguns (JAX), pickle/estimator deserialization (CWE-502), and data-leakage correctness. Adds one content-contract test that reads the REAL guide
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
array/estimator frameworks: functional-purity + tracing footguns (JAX), pickle/estimator deserialization (CWE-502), and data-leakage correctness. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/ai-ml/jax.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-numeric-frameworks-guides.test.js
skills/frameworks/ai-ml/keras.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-numeric-frameworks-guides.test.js
skills/frameworks/ai-ml/fastai.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-numeric-frameworks-guides.test.js
skills/frameworks/ai-ml/scikit-learn.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-numeric-frameworks-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/ai-ml/jax.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for jax edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Tracing/purity footguns** — `jit` side effects + Python control flow → retrace, `lax.cond`/`scan` over Python `if`/`for`, pure functions (no in-place mutation), PRNG keys must be split (`jax.random.split`) not reused
- **Device** — `donate_argnums`, sharding/`jit` recompilation, `float32` default vs `enable_x64`
- **Security** — checkpoint (orbax/pickle) untrusted-load boundary (CWE-502)
- **Version** — JAX current release + jaxlib/CUDA coupling, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/keras.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for keras edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Backend footguns** — Keras 3 multi-backend (`KERAS_BACKEND` tf/torch/jax), functional vs subclassed model serialization, custom-object registration on load
- **Training** — `compile`/`jit_compile`, mixed precision policy
- **Security** — legacy `.h5`/Lambda-layer models can embed arbitrary code; `.keras` safe-mode; untrusted-model deserialization (CWE-502)
- **Version** — Keras 3 current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/fastai.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for fastai edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Learner footguns** — `DataBlock`/`DataLoaders` item-vs-batch tfms, `lr_find`, `fine_tune` vs `fit_one_cycle`, export/`load_learner` pickles a full pipeline
- **Reproducibility** — `set_seed`, train/valid split leakage
- **Security** — `load_learner`/`torch.load` untrusted-pickle boundary (CWE-502)
- **Version** — fastai current release + torch coupling, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/scikit-learn.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for scikit-learn edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Data-leakage footguns** — fit on train only, `Pipeline` to avoid preprocessing leakage, `cross_val_score` vs manual split, `ColumnTransformer`
- **Correctness** — stratification, `random_state`, imbalanced metrics
- **Security** — `joblib`/`pickle` model files execute code on load (CWE-502); model provenance
- **Version** — scikit-learn current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-aiml-numeric-frameworks-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — jax · keras · fastai · scikit-learn):
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
   - `jax`: `jit`, `jax.random.split`, `CWE-502`
   - `keras`: `KERAS_BACKEND`, `CWE-502`, `.keras`
   - `fastai`: `load_learner`, `CWE-502`, `fit_one_cycle`
   - `scikit-learn`: `Pipeline`, `CWE-502`, `cross_val`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 4 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-502) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 5 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 4 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-aiml-numeric-frameworks-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of jax · keras · fastai · scikit-learn (official docs / release notes / PyPI / npm / GitHub releases)
- [ ] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [ ] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [ ] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 4 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 4 files + the test file.
- [ ] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [ ] Wire in real CWE links + web-verified version tokens per the File Specifications
- [ ] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [ ] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [ ] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [ ] Diff is additive on all 4 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [ ] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [ ] Remove redundant prose

### Step 13: SECURE
- [ ] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [ ] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [ ] Safe file operations — only the 5 enumerated files touched

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [ ] Confirm `.ctoc/skills.json` still indexes the jax · keras · fastai · scikit-learn triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s3") so the completeness check (s31) has no silent omissions
- [ ] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [ ] Verify Steps 8–15 completed correctly; all quality checks passed
- [ ] Only the 5 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
- [ ] Nothing fabricated (versions + CWE ids all traceable to official URLs); no cross-language BAD/SAFE examples added; tests green
- [ ] Ready for human review

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

## Decisions Taken Under Ambiguity

Executed under the BARRIER pattern: own test verified in isolation (RED→GREEN),
left UNSTAGED for the caller to commit; plan NOT moved; full suite NOT run (a
disjoint sibling-slice fleet is concurrently editing other ai-ml guides).

### Web-verified facts (all retrieved 2026-07-10, official sources)
| Fact | Value | Source URL |
|------|-------|-----------|
| JAX current stable | 0.10.2, requires_python >=3.11, uploaded 2026-06-17 | https://pypi.org/pypi/jax/json |
| jaxlib current stable | 0.10.2 (version-locked to jax) | https://pypi.org/pypi/jaxlib/json |
| Keras current stable | 3.15.0, requires_python >=3.11, uploaded 2026-06-24 | https://pypi.org/pypi/keras/json |
| fastai current stable | 2.8.7, requires_python >=3.10, uploaded 2026-02-14 | https://pypi.org/pypi/fastai/json |
| fastai torch coupling | torch<3,>=1.10; torchvision>=0.11 (requires_dist) | https://pypi.org/pypi/fastai/json |
| scikit-learn current stable | 1.9.0, requires_python >=3.11, uploaded 2026-06-02 | https://pypi.org/pypi/scikit-learn/json |
| CWE-502 | "Deserialization of Untrusted Data" (title confirmed) | https://cwe.mitre.org/data/definitions/502.html |
| CVE-2025-49655 (Keras) | TorchModuleWrapper .keras arbitrary code despite safe mode; affects 3.11.0–3.11.2, fixed 3.11.3; CWE-502; published 2025-10-17 | https://nvd.nist.gov/vuln/detail/CVE-2025-49655 |
| CVE-2026-12481 (Keras) | Lambda-layer `_raise_for_lambda_deserialization` fails to enforce safe mode when safe_mode=None → arbitrary code exec in Keras 3.14.0; CWE-502; published 2026-07-03 | https://nvd.nist.gov/vuln/detail/CVE-2026-12481 |
| JAX gotchas/x64/PRNG/control-flow | HTTP 200 (docs verified) | https://docs.jax.dev/en/latest/notebooks/Common_Gotchas_in_JAX.html · https://docs.jax.dev/en/latest/control-flow.html |
| Orbax checkpointing | HTTP 200 | https://orbax.readthedocs.io/en/latest/ |
| Keras model saving / safe_mode | HTTP 200 | https://keras.io/api/models/model_saving_apis/model_saving_and_loading/ |
| sklearn model persistence security ("arbitrary code", skops) | HTTP 200; page recommends skops for untrusted artifacts | https://scikit-learn.org/stable/model_persistence.html |

### Decisions
1. **No-churn additive extend** — the original 5 sections of each guide (incl. the
   "Updated January 2026" subtitle and "CURRENT - January 2026" install headers)
   were preserved VERBATIM; all new sections were appended below "What NOT to Do".
   H1 `# <Framework> CTO` intact (skills.json indexing) — asserted GREEN.
2. **JAX version banner conflict** — the pre-existing install/version banner still
   claims "v0.9+ / Python 3.11". Rather than rewrite the audited-verbatim section
   (no-churn), the new dated "Version-Specific Gotchas" section carries the
   web-verified current 0.10.2 fact. Left the legacy banner untouched per the
   additive rule; the dated section is the authoritative one.
3. **`jax.random.split` fully-qualified** — the plan File Spec names
   `jax.random.split`; the existing example used the imported `random.split`
   alias. Added the fully-qualified call (`jax.random.split`) in the new PRNG
   section and imported `jax` in that snippet for self-consistency.
4. **Keras CVEs cited, not invented** — both CVE-2025-49655 and CVE-2026-12481 are
   REAL NVD records (fetched at edit time) with genuine CWE-502 mappings; used to
   ground the `.keras`/`safe_mode`/`Lambda` security section with dated advisories
   rather than an unsourced "models can run code" claim.
5. **fastai `load_learner` vs PyTorch 2.6 weights_only** — documented that
   `load_learner` needs the FULL unpickler (it restores callables/transforms), so
   it does NOT benefit from PyTorch 2.6's `weights_only=True` default; recommended
   state_dict/safetensors interchange for untrusted boundaries.
6. **sklearn `skops` alternative** — cited skops as the safe-load path per the
   official model-persistence page; joblib framed as size/speed (NOT security)
   over pickle — both are equally CWE-502-unsafe on untrusted input.
7. **No omissions required** — every asserted version/CVE/CWE had a dated
   authoritative source at edit time; nothing was dropped for lack of a source.
8. **Single-framework examples only** — per the CU4a exemption, each guide's code
   is idiomatic to its own framework; no 7-language BAD/SAFE cross-coverage added.

### Barrier-pattern verification (this slice only)
- RED: 32 tests / 9 pass / 23 fail (pre-implementation).
- GREEN: 32 tests / 32 pass / 0 fail / 0 skipped (`node --test tests/cu4a-aiml-numeric-frameworks-guides.test.js`).
- eslint tests/cu4a-aiml-numeric-frameworks-guides.test.js → exit 0.
- Line counts (before→after): jax 83→258 · keras 62→183 · fastai 71→194 · scikit-learn 67→191.
- Full `tests/*.test.js` NOT run (barrier); nothing staged; plan NOT moved.

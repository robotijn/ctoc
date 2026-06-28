---
title: "PI2 — Embedding Engine: Probe, Ollama, Fallback & Calibration"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 2
depends_on:
  - pi1-index-store-and-schema
acceptance_criteria_count: 10
risk_level: HIGH
files:
  - "src/lib/plan-index/embedder.js"
  - "src/lib/plan-index/ollama-client.js"
  - "src/lib/plan-index/inprocess-engine.js"
  - "src/lib/plan-index/hardware-probe.js"
  - "src/lib/plan-index/calibration.js"
  - "src/lib/plan-index/summary-extract.js"
  - ".ctoc/settings.yaml"
  - "tests/plan-index-embedding.test.js"
gate: "Pending Approval (Gate 1: functional → implementation)"
---

# PI2 — Embedding Engine: Probe, Ollama, Fallback & Calibration

## Problem Statement

Plans must be turned into strong dense vectors on local hardware to power
semantic retrieval. There is currently no embedding engine, no hardware probe to
select the right model, and no mechanism to measure whether a model's encode
latency fits the five-second-per-plan budget. FTS5 (PI1) owns the lexical half;
this slice owns only dense vectors. Without it the vec0 table initialized by PI1
remains empty and every semantic capability is inert. The engine must work
out-of-the-box on any developer machine, automatically selecting the best
available backend and model via a first-run calibration that is never repeated
unnecessarily.

## Business Alignment

**Job to Be Done:** When CTOC initializes on a new machine, I want the embedding
engine to automatically probe the hardware, calibrate to the largest model that
fits the latency budget, and fall back gracefully when Ollama is absent, so that
semantic search works out-of-the-box without manual configuration.

**Impact Map:**
- **Goal:** Produce quality dense vectors for every plan within the 5-second budget on any developer hardware (vision success criterion 6)
- **Actor:** CTOC pipeline (agents, hooks) and developers whose plans get indexed
- **Impact:** Plans are semantically indexed automatically on any machine; agents cross-correlate plans without manual engine setup
- **Deliverable:** An `embed(texts) → Promise<Float32Array[]>` abstraction with Ollama-first + in-process ONNX/WebAssembly fallback, first-run calibration persisted to `.ctoc/index/calibration.json`, and deterministic plan-summary extraction

## User Stories

**As a** CTOC pipeline component, **I want** an `embed(texts)` function that
transparently uses Ollama when available and falls back to an in-process engine
when not, **so that** vector generation works on any developer machine without
manual engine configuration.

**As a** first-time CTOC installer, **I want** calibration to automatically
measure encode latency and select the largest model whose p95 stays under 5
seconds, **so that** the index uses the best quality possible without my
involvement.

## Acceptance Criteria

- [ ] **Scenario: Ollama reachable — returns Ollama vectors**
  Given Ollama is running and reachable at the configured base URL
  (default `http://localhost:11434`)
  When `embed(['test text'])` is called
  Then the return value is a `Promise` that resolves to an array of `Float32Array`
  of the calibrated dimension and the internal source tag is `'ollama'`

- [ ] **Scenario: Ollama absent — transparent in-process fallback**
  Given Ollama is not reachable (connection refused on the probe port)
  When `embed(['test text'])` is called
  Then the `Promise` resolves to an array of `Float32Array` of the configured
  dimension from the in-process engine, and no unhandled error or rejection occurs

- [ ] **Scenario: Calibration skips models that exceed the budget**
  Given a candidate list ordered largest → smallest and the first candidate's
  measured p95 encode latency exceeds 5000 ms
  When `runCalibration()` is called
  Then the first candidate is skipped; the next candidate in the list is
  benchmarked; only a model with measured p95 < 5000 ms is written to
  `calibration.json`

- [ ] **Scenario: Calibration result is persisted and reused**
  Given `runCalibration()` has completed and written
  `{ model, dimension, backend, measuredP95ms }` to
  `.ctoc/index/calibration.json`
  When `loadCalibration()` is called in a new process
  Then it returns the persisted object without running the benchmark again

- [ ] **Scenario: Calibration dimension is the single source of truth for vec0**
  Given calibration has completed and persisted `dimension: 768`
  When PI1's `initVectorTable` is called with `loadCalibration().dimension`
  Then the vec0 table is created at exactly 768 floats with no mismatch

- [ ] **Scenario: Plan-summary extraction is deterministic**
  Given a `.md` plan file with a title, frontmatter block, and section headings
  When `extractSummary(markdownText)` is called twice with identical input
  Then both calls return byte-identical strings; no network call is made; no LLM
  is invoked

- [ ] **Scenario: Summary extraction excludes section body prose**
  Given a plan with a `## Risks` section containing detailed multi-paragraph prose
  When `extractSummary(markdownText)` is called
  Then the output contains the heading `## Risks` but does not contain body
  paragraphs that appear below the heading

- [ ] **Scenario: Embedding is non-blocking**
  Given the CTOC menu event loop is running
  When `embed(['large plan text'])` is called
  Then the caller receives a `Promise` immediately (synchronous return) and the
  event loop is not blocked for more than 50 ms before the Promise settles

- [ ] **Scenario: Settings namespace controls engine preference**
  Given `.ctoc/settings.yaml` contains
  `plan_index: { engine_preference: inprocess }`
  When `embed(['text'])` is called even with Ollama reachable
  Then the in-process engine is used; the Ollama client is not called

- [ ] **Scenario: Cross-platform path handling**
  Given CTOC is running on Windows
  When calibration reads/writes `.ctoc/index/calibration.json`
  Then all file paths are constructed with `path.join` and `os.homedir()`; no
  hardcoded `/` separators or `~` expansion appear in the code

## Non-Functional Requirements

- **Latency budget**: p95 per-plan encode ≤ 5000 ms; calibration selection target
  ≤ 3000 ms (leaves ~2s headroom for section-level batches within the same plan).
- **Async**: All embedding calls return `Promise`; no synchronous sleep or busy-wait.
- **No npm runtime packages for the Ollama client**: use Node 24 built-in `fetch`
  or `node:http`; the in-process ONNX runtime is a lazy-loaded optional
  dependency downloaded once to `~/.ctoc`.
- **Calibration is idempotent**: Re-running with an existing
  `.ctoc/index/calibration.json` is a no-op unless the file is deleted or a
  forced recalibration flag is passed.
- **Cross-platform**: `path.join`, `os.homedir()`, `process.platform` throughout;
  no hardcoded path separators.

## Scope

### In Scope
- `embedder.js`: unified `embed(texts: string[]) → Promise<Float32Array[]>`;
  dispatches to Ollama or in-process backend based on probe result and
  `engine_preference` setting
- `ollama-client.js`: HTTP client for Ollama `/api/embeddings`; probes
  availability at the configured base URL; validates response shape; no npm
  dependency — built on Node 24 `fetch`
- `inprocess-engine.js`: ONNX/WebAssembly fallback; lazy-loads runtime from
  `~/.ctoc`; returns vectors of the same dimension as the Ollama backend
- `hardware-probe.js`: detects Ollama reachability + GPU/CPU availability to
  inform candidate ordering in calibration
- `calibration.js`: micro-benchmark of the candidate model list; selects the
  largest model with measured p95 < 5000 ms; persists
  `{ model, dimension, backend, measuredP95ms }` to
  `.ctoc/index/calibration.json` (git-ignored, per-machine)
- `summary-extract.js`: deterministic title + frontmatter-intent +
  section-headings extractor (pure string operations; no LLM; no network)
- `.ctoc/settings.yaml`: add `plan_index.engine_preference` (values: `auto` |
  `ollama` | `inprocess`; default `auto`) and `plan_index.ollama_base_url`
  (default `http://localhost:11434`) under the `plan_index:` namespace that PI1
  scaffolded
- `tests/plan-index-embedding.test.js`: covers all 10 scenarios above; Ollama
  HTTP calls use an injectable mock client so CI does not require a live Ollama

### Out of Scope
- The store/schema (PI1 — depended on by this slice for the integration test only)
- Deciding what triggers re-embedding (PI3)
- Querying, ranking, or RRF fusion (PI4)
- Duplicate guard thresholds and conflict detection (PI5–PI6)
- Serving embeddings to callers outside the `src/lib/plan-index/` module
- Training, fine-tuning, or quantizing models
- Batching multiple plans in a single API call (optimization deferred; PI3 calls
  `embed` one plan at a time; batch optimization is a future PI2 concern)

## Test Plan

Framework: Node `--test`. Ollama network calls are replaced by an injectable HTTP
mock (passed via `embedder.js` constructor/factory). No live Ollama required in CI.
In-process engine tests use a lightweight stub model that returns fixed vectors.

| Test ID | Description                                             | Key Assertion                                              |
|---------|---------------------------------------------------------|------------------------------------------------------------|
| EM-01   | embed() with mock Ollama reachable                      | Returns Float32Array[]; response tagged as 'ollama'        |
| EM-02   | embed() with Ollama forced absent                       | Returns Float32Array[] from fallback; no unhandled throw   |
| EM-03   | Calibration skips model with p95 > 5000 ms              | pinned model !== first candidate; only budget model written|
| EM-04   | Calibration persists and is reloaded on next call       | Second loadCalibration() returns same object, no benchmark |
| EM-05   | extractSummary identical input → identical output       | result1 === result2 (strict equality)                      |
| EM-06   | extractSummary excludes section body prose              | Body paragraph text not in output string                   |
| EM-07   | embed() returns Promise synchronously                   | typeof result.then === 'function' before await             |
| EM-08   | engine_preference=inprocess overrides reachable Ollama  | Ollama mock client call count === 0                        |
| EM-09   | ollama_base_url setting is respected by probe           | Probe hits injected URL, not default localhost:11434       |
| EM-10   | Calibration dimension matches PI1 initVectorTable (integration) | openStore + initVectorTable(dim) succeeds without error |
| EM-11   | Cross-platform path: calibration.json on Windows mock   | No separator error; path uses path.join                    |

## Risks

### Technical Risks
- **ONNX/WebAssembly model availability on first run**: The in-process fallback
  requires a one-time download to `~/.ctoc`. In an air-gapped environment without
  Ollama, both backends may be unavailable.
  - Likelihood: LOW (most developers have internet access)
  - Impact: HIGH (no vectors produced at all in that scenario)
  - Mitigation: Emit a clear error message naming the two options (install Ollama,
    or copy the ONNX model manually); document `plan_index.inprocess_model_path`
    as a settings override for the pre-downloaded model path

- **Ollama API shape drift**: Ollama's `/api/embeddings` response contract may
  change between versions.
  - Likelihood: LOW
  - Impact: MEDIUM (Ollama backend silently returns wrong-shaped data)
  - Mitigation: Validate response shape (array of float arrays matching declared
    dimension) in `ollama-client.js`; throw a descriptive error on shape mismatch
    including the Ollama version header if present; document the minimum tested
    Ollama version

- **Calibration is slow on first run**: The benchmark may take 30–90 seconds on
  a cold machine with multiple candidates to test.
  - Likelihood: HIGH (inherent to measuring real latency)
  - Impact: MEDIUM (degraded first-run UX; no crash; subsequent runs skip it)
  - Mitigation: Run calibration asynchronously in the background; show a
    non-blocking "Calibrating index..." status in the menu; defer all index writes
    until calibration completes; menu remains fully usable during calibration

### Business Risks
- **Per-machine calibration.json is not committed**: Each developer must run
  calibration independently; a fresh clone or CI environment will always
  recalibrate on first use.
  - Likelihood: HIGH (by design — per-machine)
  - Impact: LOW (accepted; git-ignored; each machine self-calibrates; CI
    recalibration takes < 2 minutes on standard runners)
  - Mitigation: No action needed; document the expected behavior in the module
    README comment

### Dependency Risks
- **PI1 must be complete before EM-10 integration test**: The integration boundary
  test (calibration dimension → PI1 initVectorTable) requires PI1's `openStore`.
  - Likelihood: HIGH (structural)
  - Impact: LOW (EM-10 can be conditionally skipped when PI1 is not yet merged;
    all other EM tests are independent)
  - Mitigation: Ship PI1 first; EM-10 is tagged as an integration test and
    gated on PI1 completion in CI

## Rollback

1. Delete `.ctoc/index/calibration.json` — next run re-calibrates cleanly.
2. Revert `src/lib/plan-index/embedder.js` and all siblings in this slice.
3. Remove `plan_index.engine_preference` and `plan_index.ollama_base_url` keys
   from `.ctoc/settings.yaml` (PI1's `plan_index:` namespace stub remains).
4. The rest of the plan-index module (PI1 store, PI3 sync) is unaffected.

## Dependencies

- **PI1** (`pi1-index-store-and-schema`): `initVectorTable(dimension)` call in
  the integration test EM-10 only; PI2 itself does not call the store at runtime.
- **Node 24 built-in `fetch`** (or `node:http`) for Ollama probe — no npm package.
- **ONNX Runtime** (optional, lazy-loaded to `~/.ctoc`): not a hard dependency;
  the in-process engine degrades gracefully if the runtime is unavailable.

## Decisions Taken Under Ambiguity

- **Candidate model list**: Defined as an ordered constant in `calibration.js`:
  `['mxbai-embed-large', 'nomic-embed-text', 'all-minilm']` for the Ollama path;
  a single fixed ONNX model (`all-MiniLM-L6-v2`) for the in-process path.
  The product owner may tune this list in a future PI without a functional-plan
  revision.
- **Calibration selection threshold**: p95 ≤ 3000 ms (not 5000 ms) is the target
  to leave ~2s headroom; if no candidate meets 3000 ms, the threshold relaxes to
  5000 ms; if still no candidate qualifies, the smallest candidate is pinned with
  a logged warning so the system is never completely inert.
- **engine_preference default**: `auto` — probe Ollama first, fall back to
  in-process. Explicit `ollama` or `inprocess` bypasses the probe entirely.
- **calibration.json location**: `.ctoc/index/calibration.json` (same directory
  as `plans.db`); git-ignored; per-machine; never committed.
- **Summary extraction scope**: Title (YAML `title:` or first H1) +
  frontmatter string fields (`status`, `priority`, `parent_vision`) + all
  section headings (H2–H3 lines). Body prose is excluded. This is the
  deterministic "plan-summary text" decision locked in the vision.
- **No npm package for Ollama client**: Using Node 24's built-in `fetch` keeps
  PI2 dependency-free at runtime, consistent with CTOC's no-external-runtime-
  dependency principle.

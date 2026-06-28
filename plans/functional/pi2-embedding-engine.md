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
acceptance_criteria_count: 12
risk_level: HIGH
files:
  - "src/lib/plan-index/embedder.js"
  - "src/lib/plan-index/ollama-client.js"
  - "src/lib/plan-index/inprocess-engine.js"
  - "src/lib/plan-index/hardware-probe.js"
  - "src/lib/plan-index/calibration.js"
  - "src/lib/plan-index/summary-extract.js"
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
unnecessarily. Calibration runs in the background (invoked by PI0); the menu is
never blocked.

## Business Alignment

**Job to Be Done:** When CTOC initializes on a new machine, I want the embedding
engine to automatically probe the hardware, calibrate to the largest model that
fits the latency budget, and fall back gracefully when Ollama is absent, so that
semantic search works out-of-the-box without manual configuration.

**Impact Map:**
- **Goal:** Produce quality dense vectors for every plan within the 5-second budget on any developer hardware (vision success criterion 6)
- **Actor:** CTOC pipeline (agents, hooks) and developers whose plans get indexed
- **Impact:** Plans are semantically indexed automatically on any machine; agents cross-correlate plans without manual engine setup
- **Deliverable:** An `embed(texts: string[]) → Promise<Float32Array[]>` function (called from the background process; never blocks the menu) with Ollama-first batch API + in-process ONNX/WebAssembly fallback; `runCalibration()` defined here and invoked by PI0 in the background, persisting `{ model, dimension, backend, measuredP95ms }` to `.ctoc/index/calibration.json`; deterministic plan-summary extraction reusing `state.js parseMetadata`

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

- [ ] **Scenario: Ollama reachable — returns Ollama vectors via batch API**
  Given Ollama is running and reachable at the configured base URL
  (default `http://localhost:11434`)
  When `embed(['text one', 'text two'])` is called
  Then the Ollama client sends a single POST to `/api/embed` with body
  `{ model: <pinned>, input: ['text one', 'text two'] }` (batch endpoint, not
  `/api/embeddings`); the return value resolves to an array of two `Float32Array`
  objects of the calibrated dimension; the internal source tag is `'ollama'`

- [ ] **Scenario: Ollama absent — transparent in-process fallback**
  Given Ollama is not reachable (connection refused on the probe port)
  When `embed(['test text'])` is called
  Then the result resolves to an array of `Float32Array` of the configured
  dimension from the in-process engine, and no unhandled error or rejection occurs

- [ ] **Scenario: Calibration skips over-budget models (deterministic clock)**
  Given a candidate list `['mxbai-embed-large', 'nomic-embed-text', 'all-minilm']`
  And an injected stubbed clock returning per-candidate p95 latencies:
    `mxbai-embed-large` → 6200 ms, `nomic-embed-text` → 2400 ms, `all-minilm` → 800 ms
  When `runCalibration({ clock: stubbedClock })` is called
  Then `mxbai-embed-large` is excluded (exceeds 5000 ms budget);
  `pinned === 'nomic-embed-text'` (largest model within budget);
  `calibration.json` contains `{ model: 'nomic-embed-text', measuredP95ms: 2400, ... }`

- [ ] **Scenario: Calibration result is persisted and reused**
  Given `runCalibration()` has completed and written
  `{ model, dimension, backend, measuredP95ms }` to
  `.ctoc/index/calibration.json`
  When `loadCalibration()` is called in a new process
  Then it returns the persisted object without running the benchmark again

- [ ] **Scenario: Calibration dimension is the single source of truth for vec0**
  Given calibration has completed and persisted `dimension: 768`
  When PI1's `initVectorTable` is called with `loadCalibration().dimension`
  Then the vec0 table is created at exactly 768 floats (confirmed via
  `SELECT sql FROM sqlite_master WHERE name = 'vec_plans'` containing `float[768]`)

- [ ] **Scenario: Plan-summary extraction is deterministic**
  Given a `.md` plan file with a title, frontmatter block, and section headings
  When `extractSummary(markdownText)` is called twice with identical input
  Then both calls return byte-identical strings; no network call is made; no LLM
  is invoked; `parseMetadata` from `src/lib/state.js` is used for frontmatter
  extraction (verified by injecting a spy on the module)

- [ ] **Scenario: Summary extraction includes title and all H2/H3 headings**
  Given a plan with YAML field `title: 'PI1 — Index Store'`, a `## Problem Statement`
  section, and a `## Scope` section (each with several paragraphs of body prose)
  When `extractSummary(markdownText)` is called
  Then the output string contains `'PI1 — Index Store'` (from YAML title via
  `parseMetadata`), contains `'Problem Statement'`, and contains `'Scope'`

- [ ] **Scenario: Summary extraction excludes section body prose**
  Given a plan with a `## Risks` section containing detailed multi-paragraph prose
  When `extractSummary(markdownText)` is called
  Then the output contains the heading `## Risks` but does not contain body
  paragraphs that appear below the heading

- [ ] **Scenario: Probe /api/tags excludes models not available locally**
  Given Ollama is running and `GET /api/tags` lists only
  `['nomic-embed-text', 'all-minilm']` (not `mxbai-embed-large`)
  When calibration probes available models before benchmarking
  Then `mxbai-embed-large` is excluded from the candidate list with a logged note
  (`'mxbai-embed-large: not available locally — skipping'`); calibration only
  benchmarks the two available candidates

- [ ] **Scenario: Settings namespace controls engine preference**
  Given `getSetting('plan_index.engine_preference')` returns `'inprocess'`
  When `embed(['text'])` is called even with Ollama reachable
  Then the in-process engine is used; the Ollama client's POST to `/api/embed`
  is never called (mock call count = 0)

- [ ] **Scenario: Cross-platform path handling**
  Given CTOC is running on Windows (mocked `process.platform = 'win32'`)
  When calibration reads/writes `.ctoc/index/calibration.json`
  Then all file paths are constructed with `path.join` and `os.homedir()`; no
  hardcoded `/` separators or `~` expansion appear in the code

- [ ] **Scenario: Real-model smoke test — paraphrase similarity exceeds unrelated**
  Given Ollama is running and the calibrated model is loaded (test skips loudly
  with `skip.diagnostic('Ollama not available — smoke test requires live Ollama')` when absent)
  When `embed` is called with:
    - pair A: `['a dog running in the park', 'a puppy sprinting across the grass']`
    - pair B: `['a dog running in the park', 'the quarterly revenue report']`
  Then `cosineSimilarity(A[0], A[1]) > cosineSimilarity(B[0], B[1])` by a margin
  of at least 0.15

## Non-Functional Requirements

- **Latency budget**: p95 per-plan total encode (plan-level summary vector + all
  section vectors in one batch) ≤ 5000 ms on the calibrated model; calibration
  selection target is ≤ 3000 ms for this total batch to leave ~2 s headroom.
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
  `getSetting('plan_index.engine_preference')` from `settings.json`
- `ollama-client.js`: HTTP client for Ollama `/api/embed` (batch endpoint,
  `input: string[]`); probes availability at the configured base URL via
  `GET /api/tags`; excludes models not present in `/api/tags` response with a
  logged note; validates response shape; no npm dependency — built on Node 24 `fetch`
- `inprocess-engine.js`: ONNX/WebAssembly fallback; lazy-loads runtime from
  `~/.ctoc`; returns vectors of the same dimension as the Ollama backend
- `hardware-probe.js`: detects Ollama reachability + GPU/CPU availability to
  inform candidate ordering in calibration
- `calibration.js`: micro-benchmark of the candidate model list; filters to
  locally-available models via `/api/tags`; selects the largest model with
  measured p95 < 5000 ms (total per-plan batch); persists
  `{ model, dimension, backend, measuredP95ms }` to
  `.ctoc/index/calibration.json` (git-ignored, per-machine); defined here,
  invoked by PI0's background process — PI2 does NOT self-invoke on import
- `summary-extract.js`: deterministic title + frontmatter-fields + H2/H3-headings
  extractor; calls `parseMetadata` from `src/lib/state.js` for frontmatter
  parsing; only H2/H3 heading extraction is new logic; no LLM; no network
- Reads `plan_index.engine_preference` and `plan_index.ollama_base_url` via
  `getSetting` from `settings.json` (schema registered by PI1 in `src/lib/settings.js`);
  PI2 does NOT write to `.ctoc/settings.yaml`
- `tests/plan-index-embedding.test.js`: covers all 12 scenarios above; Ollama
  HTTP calls use an injectable mock client so CI does not require a live Ollama;
  smoke test (EM-12) skips loudly when Ollama is absent

### Out of Scope
- The store/schema (PI1 — depended on by this slice for the integration test only)
- Deciding what triggers re-embedding (PI3)
- Querying, ranking, or RRF fusion (PI4)
- Duplicate guard thresholds and conflict detection (PI5–PI6)
- Serving embeddings to callers outside the `src/lib/plan-index/` module
- Training, fine-tuning, or quantizing models
- Self-invocation of calibration on import — PI0 owns the composition root and
  background invocation

## Test Plan

Framework: Node `--test`. Ollama network calls are replaced by an injectable HTTP
mock (passed via `embedder.js` constructor/factory). No live Ollama required in CI
except for the smoke test (EM-12) which skips loudly when absent.

| Test ID | Description                                               | Key Assertion                                                                         |
|---------|-----------------------------------------------------------|---------------------------------------------------------------------------------------|
| EM-01   | embed() with mock Ollama — batch POST to /api/embed       | POST body has `input: string[]`; returns Float32Array[]; tagged as 'ollama'           |
| EM-02   | embed() with Ollama forced absent                         | Returns Float32Array[] from fallback; no unhandled throw                              |
| EM-03   | Calibration: stub clock → skips over-budget, pins correct | `pinned === 'nomic-embed-text'`; calibration.json has measuredP95ms: 2400             |
| EM-04   | Calibration persists and is reloaded on next call         | Second loadCalibration() returns same object, no benchmark re-run                    |
| EM-05   | Calibration dimension → PI1 initVectorTable               | sqlite_master sql contains `float[768]` for the calibrated dimension                 |
| EM-06   | extractSummary determinism                                | result1 === result2 (strict equality); no network call                                |
| EM-07   | extractSummary positive: contains title + headings        | Output contains YAML title, '## Problem Statement', '## Scope'                       |
| EM-08   | extractSummary excludes section body prose                | Body paragraph text not in output; heading text IS in output                          |
| EM-09   | Probe /api/tags excludes absent models                    | Absent candidate logged; not benchmarked; available candidates benchmarked            |
| EM-10   | engine_preference=inprocess overrides reachable Ollama    | Ollama mock client call count === 0                                                   |
| EM-11   | Cross-platform path: calibration.json on Windows mock     | No separator error; path uses path.join                                               |
| EM-12   | Smoke test: paraphrase cos-sim > unrelated (Ollama-gated) | cos(paraphrase pair) > cos(unrelated pair) by ≥ 0.15; LOUD skip when Ollama absent  |

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

- **Ollama API shape drift**: Ollama's `/api/embed` response contract may change
  between versions.
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
  - Mitigation: Calibration runs in the background (PI0 invokes it); the menu
    remains fully usable during calibration; PI0 shows a non-blocking status
    indicator; all index writes are deferred until calibration completes
    (`calibrationReady()` gate in PI3)

### Business Risks
- **Per-machine calibration.json is not committed**: Each developer must run
  calibration independently; a fresh clone or CI environment will always
  recalibrate on first use.
  - Likelihood: HIGH (by design — per-machine)
  - Impact: LOW (accepted; git-ignored; each machine self-calibrates)
  - Mitigation: No action needed; document the expected behavior in the module
    README comment

### Dependency Risks
- **PI1 must be complete before EM-05 integration test**: The integration boundary
  test (calibration dimension → PI1 initVectorTable) requires PI1's `openStore`.
  - Likelihood: HIGH (structural)
  - Impact: LOW (EM-05 can be conditionally skipped when PI1 is not yet merged;
    all other EM tests are independent)
  - Mitigation: Ship PI1 first; EM-05 is tagged as an integration test and
    gated on PI1 completion in CI

## Rollback

1. Delete `.ctoc/index/calibration.json` — next run re-calibrates cleanly.
2. Revert `src/lib/plan-index/embedder.js` and all siblings in this slice.
3. The rest of the plan-index module (PI1 store, PI3 sync) is unaffected.

## Dependencies

- **PI1** (`pi1-index-store-and-schema`): `initVectorTable(dimension)` call in
  the integration test EM-05 only; PI2 itself does not call the store at runtime.
- **`src/lib/state.js` `parseMetadata`**: reused by `summary-extract.js` for
  frontmatter parsing; no new module-level dependency added.
- **Node 24 built-in `fetch`** (or `node:http`) for Ollama probe — no npm package.
- **ONNX Runtime** (optional, lazy-loaded to `~/.ctoc`): not a hard dependency;
  the in-process engine degrades gracefully if the runtime is unavailable.
- **PI0**: invokes `runCalibration()` in the background and calls
  `initVectorTable(loadCalibration().dimension)` on the PI1 store.

## Decisions Taken Under Ambiguity

- **Ollama API endpoint**: `/api/embed` with `input: string[]` (batch, current
  Ollama API), not the legacy `/api/embeddings` (single text, deprecated).
  Batch is required so the plan-level summary and all section vectors are sent
  in a single HTTP round-trip within the 5-second total budget.
- **Model availability probe**: `GET /api/tags` is called before calibration;
  candidates not present in the response are excluded with a logged note and
  never benchmarked. A candidate locally absent produces a silent skip, not a
  hard error, so calibration degrades gracefully to whatever is available.
- **5-second budget scope**: The budget covers the complete per-plan encode
  batch (plan-level summary + all section texts for that plan) in a single
  `/api/embed` call. Calibration's target is ≤ 3000 ms to leave ~2 s headroom
  for larger plans; the hard ceiling is 5000 ms; if no candidate meets 5000 ms,
  the smallest candidate is pinned with a logged warning.
- **Background invocation**: `runCalibration()` is a pure function defined in
  `calibration.js`. PI0's composition root invokes it in a background process.
  PI2 does NOT call `runCalibration()` on import or module initialization.
- **Settings access**: PI2 reads `plan_index.engine_preference` and
  `plan_index.ollama_base_url` via `getSetting` from `settings.json` (API
  defined in `src/lib/settings.js`; schema registered by PI1). PI2 does NOT
  write to `.ctoc/settings.yaml` — the settings.json API is the correct runtime
  interface per the CONFIG SOURCES note in `src/lib/settings.js`.
- **Candidate model list**: Ordered constant in `calibration.js`:
  `['mxbai-embed-large', 'nomic-embed-text', 'all-minilm']` for Ollama;
  a single fixed ONNX model (`all-MiniLM-L6-v2`) for the in-process path.
- **calibration.json location**: `.ctoc/index/calibration.json` (same directory
  as `plans.db`); git-ignored; per-machine; never committed.
- **Summary extraction scope**: Title (YAML `title:` via `parseMetadata`) +
  selected frontmatter string fields (`status`, `priority`, `parent_vision`) +
  all H2–H3 heading lines. Body prose is excluded. This is the deterministic
  "plan-summary text" decision locked in the vision.
- **No npm package for Ollama client**: Using Node 24's built-in `fetch` keeps
  PI2 dependency-free at runtime, consistent with CTOC's no-external-runtime-
  dependency principle.

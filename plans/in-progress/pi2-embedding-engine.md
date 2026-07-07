---
iron_loop: true
approved_by: human
approved_at: 2026-07-07T13:45:57.837Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-07T13:27:22.209Z
gate_crossed: functional → implementation
iron_loop: true
---

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

> **Architecture pivot alignment (2026-07-07).** Embeddings are
> **storage-agnostic** and this slice is essentially unaffected by the pivot: the
> probe / Ollama-first / in-process fallback / first-run calibration are all
> unchanged. Only the **SINK** changes — PI2 hands `Float32Array` vectors to
> PI3/PI0, which write them into PI1's **pure-JS in-memory + JSON store** (base64
> Float32 inside `.ctoc/index/plan-index.json`) via `upsertUnit`, **not** into the
> superseded native vector table. There is **no** `initVectorTable` call: the
> store infers and locks its dimension from the first `upsertUnit`, so PI2's
> calibrated `dimension` reaches the store implicitly through the vectors it
> produces. The lexical (BM25) half is a pure-JS inverted index built in PI4 (not
> a native full-text engine), so this slice still owns only strong **dense**
> vectors.

## Problem Statement

Plans must be turned into strong dense vectors on local hardware to power
semantic retrieval. There is currently no embedding engine, no hardware probe to
select the right model, and no mechanism to measure whether a model's encode
latency fits the five-second-per-plan budget. The lexical (BM25) half is a
pure-JS inverted index owned by PI4; this slice owns only dense vectors. Without
it the PI1 store holds no embeddings and every semantic capability is inert. The
engine must work out-of-the-box on any developer machine, automatically selecting
the best available backend and model via a first-run calibration that is never
repeated unnecessarily. Calibration runs in the background (invoked by PI0); the
menu is never blocked.

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

- [ ] **Scenario: Calibration dimension flows into the store via the first upsert**
  Given calibration has completed and persisted `dimension: 768`
  When the first embedding PI2 produces (a `Float32Array(768)`) is written to the
  PI1 store via `upsertUnit`
  Then `store.dimension === 768` thereafter (the store infers and locks the
  dimension from the first embedding — there is no `initVectorTable` call and no
  schema step; the store owns the dimension per PI1 Decision D7)

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
| EM-05   | Calibration dimension → PI1 store via first upsert        | after upserting a `Float32Array(768)`, `store.dimension === 768` (inferred, no `initVectorTable`) |
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
  test (calibration dimension → PI1 store via the first `upsertUnit`) requires
  PI1's `openStore`.
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

- **PI1** (`pi1-index-store-and-schema`): the pure-JS store's `upsertUnit` (which
  the store's dimension is inferred from) is exercised in the integration test
  EM-05 only; PI2 itself does not call the store at runtime — it produces
  `Float32Array` vectors that PI3/PI0 write via `upsertUnit`. There is **no**
  `initVectorTable` (deleted by the pivot; the store infers dimension).
- **`src/lib/state.js` `parseMetadata`**: reused by `summary-extract.js` for
  frontmatter parsing; no new module-level dependency added.
- **Node 24 built-in `fetch`** (or `node:http`) for Ollama probe — no npm package.
- **ONNX Runtime** (optional, lazy-loaded to `~/.ctoc`): not a hard dependency;
  the in-process engine degrades gracefully if the runtime is unavailable.
- **PI0**: invokes `runCalibration()` in the background and wires the PI2 embedder
  into the composition root; the first `upsertUnit` of a calibrated-dimension
  vector locks the PI1 store's dimension (no `initVectorTable` call).

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
  as `plan-index.json`); git-ignored; per-machine; never committed.
- **Summary extraction scope**: Title (YAML `title:` via `parseMetadata`) +
  selected frontmatter string fields (`status`, `priority`, `parent_vision`) +
  all H2–H3 heading lines. Body prose is excluded. This is the deterministic
  "plan-summary text" decision locked in the vision.
- **No npm package for Ollama client**: Using Node 24's built-in `fetch` keeps
  PI2 dependency-free at runtime, consistent with CTOC's no-external-runtime-
  dependency principle.

---

# Implementation Details

> Produced by the implementation-planner (Iron Loop Steps 5 PLAN / 6 DESIGN / 7 SPEC).
> All source facts below were read FRESH from disk against the SHIPPED PI1 store
> (`src/lib/plan-index/store.js`, `index.js`), `src/lib/state.js`,
> `src/lib/settings.js`, `src/lib/safe-fs.js`, and `src/lib/plan-validator.js`.
> Three corrections vs. the re-aligned stub are recorded in
> **§ Discrepancies vs. the stub** and are BINDING on the implementer (Step 10).

## Corrections vs. the stub (BINDING — read first)

1. **`getSetting` is `(category, key, projectPath?)`, NOT a single dotted string.**
   `src/lib/settings.js:225` — `function getSetting(category, key, projectPath = process.cwd())`.
   The stub's `getSetting('plan_index.engine_preference')` and
   `getSetting('plan_index.ollama_base_url')` are WRONG and will return `undefined`
   (there is no top-level category literally named `plan_index.engine_preference`).
   Correct calls:
   `getSetting('plan_index', 'engine_preference', projectPath)` and
   `getSetting('plan_index', 'ollama_base_url', projectPath)`.

2. **`engine_preference` enum is `['auto','ollama','in-process']`, default `'auto'` — the in-process value is `'in-process'` (hyphenated), NOT `'inprocess'`.**
   `src/lib/settings.js:98-105` (the `plan_index` schema forward-declared by PI1).
   The stub's AC "Scenario: Settings namespace controls engine preference" and its
   Decisions both say `'inprocess'`; the implementer MUST use the schema's real
   token `'in-process'`. Test EM-10 asserts against `'in-process'`. `'auto'` means
   "probe: Ollama if reachable, else in-process"; `'ollama'` forces Ollama;
   `'in-process'` forces the in-process engine.

3. **README/readme-numbers module count needs NO bump for PI2.**
   `tests/readme-numbers.test.js:56-60` `countTopLevelJs('src/lib')` uses a
   NON-recursive `fs.readdirSync(full).filter(f => f.endsWith('.js'))` — it counts
   only `src/lib/*.js` at the top level and asserts `114`. PI2's six new modules
   live under `src/lib/plan-index/` (a subdirectory) and are therefore OUTSIDE the
   count. No README edit, no readme-numbers change, no new `files:` entry for
   README is required. (Recorded so the implementer does not "helpfully" bump it.)

## Architecture Decision (ADR — short form)

**Context.** PI2 must turn plan text into strong dense L2-normalized `Float32Array`
vectors on arbitrary local hardware, degrade to a working state when Ollama is
absent (fail-open), and stay storage-agnostic — it NEVER touches the PI1 store; it
hands vectors to PI0/PI3 which call `upsertUnit`. Tests must be hermetic (no live
Ollama in CI).

**Decision.** A thin façade `embed(texts, deps?)` dispatches to one of two backends
selected by `getSetting('plan_index','engine_preference')` and a reachability probe:
(a) an **Ollama HTTP client** (`POST /api/embed`, batch `input: string[]`) built on
Node's built-in `fetch` with a bounded `AbortController` timeout; (b) an **in-process
deterministic hashing embedder** — the fail-open fallback — that requires no model
download, no network, and is byte-deterministic so CI is hermetic. Calibration is a
pure `runCalibration(deps)` that probes `/api/tags`, micro-benchmarks locally-present
candidates with an INJECTABLE clock, pins the largest model whose p95 < 5000 ms, and
persists `{ model, dimension, backend, measuredP95ms }` to
`.ctoc/index/calibration.json`. All I/O routes through `src/lib/safe-fs.js`; all paths
via `path.join` + `os.homedir()`.

**Consequence.** Zero native deps, zero runtime npm packages, cross-platform for free.
The optional ONNX runtime named in the stub's NFR is DEFERRED as an implementation
detail of the fallback — the *load-bearing* fallback is the deterministic hashing
embedder, which is what makes fail-open and hermetic tests real. If/when an ONNX
model is desired it slots behind the same `inprocess-engine.js` interface without any
API change (documented in **§ Decisions Taken Under Ambiguity — DA-1**).

## Dependency Graph

```
state.js:parseMetadata ──used-by──▶ summary-extract.js
settings.js:getSetting  ──used-by──▶ embedder.js, calibration.js, ollama-client.js(base url)
safe-fs.js              ──used-by──▶ calibration.js  (calibration.json read/write ONLY)

ollama-client.js  ─┐
inprocess-engine.js─┼─dispatched-by─▶ embedder.js  ◀─probe─ hardware-probe.js
hardware-probe.js ─┘                        │
calibration.js ──uses──▶ ollama-client.js (/api/tags, /api/embed), hardware-probe.js
calibration.js ──uses──▶ inprocess-engine.js (dimension of in-process path)

embedder.js  ──produces──▶ Float32Array[]  ──(PI0/PI3, NOT PI2)──▶ store.upsertUnit
summary-extract.js ──(no deps on the above; standalone)

tests/plan-index-embedding.test.js ──tests──▶ all six modules (+ EM-05 imports PI1 store)
```

No cycles. `embedder.js` is the only backend-dispatch node; `calibration.js`
depends on the two engines + probe + client but nothing depends back on it at
runtime (PI0 invokes it). `summary-extract.js` is an independent leaf.

## Implementation Order (Step 10 sub-item order — dependency order)

1. `src/lib/plan-index/summary-extract.js` — independent leaf; only needs `parseMetadata`.
2. `src/lib/plan-index/hardware-probe.js` — independent; no siblings.
3. `src/lib/plan-index/ollama-client.js` — independent HTTP client (injectable fetch).
4. `src/lib/plan-index/inprocess-engine.js` — independent deterministic embedder.
5. `src/lib/plan-index/embedder.js` — dispatch façade; imports 2,3,4 + settings.
6. `src/lib/plan-index/calibration.js` — imports 2,3,4 + safe-fs + settings.
7. `tests/plan-index-embedding.test.js` — written FIRST at Step 8 (TDD-Red), listed
   last here only because it references all of the above.

## File Specifications

### File: `src/lib/plan-index/summary-extract.js`
**Action:** CREATE — **Purpose:** deterministic plan → summary-text extractor for embedding input.
**Exports:**
- `extractSummary(markdownText: string) → string`
  - Uses `require('../state').parseMetadata(markdownText)` for frontmatter (spy-able → EM-06).
  - Emits, in fixed order, byte-deterministically: the YAML `title`; selected string
    frontmatter fields `status`, `priority`, `parent_vision` (only those present); then
    every `##` and `###` heading LINE verbatim (`^#{2,3}\s+.*$`), in document order.
  - EXCLUDES all body prose (only heading lines + selected YAML fields). No network, no LLM.
  - Idempotent: identical input → byte-identical output (`===`).
**Deps:** `require('../state')` (parseMetadata). **Called by:** PI3 (indexing) — NOT PI2 runtime.
**Errors:** non-string input → return `''` (fail-soft; extraction never throws into indexing).
**Cross-platform:** pure string ops; no fs, no paths.

### File: `src/lib/plan-index/hardware-probe.js`
**Action:** CREATE — **Purpose:** decide reachability + backend hint for `embed`/calibration.
**Exports:**
- `probeOllama(deps?) → Promise<boolean>` — `deps.fetch` (default global `fetch`),
  `deps.baseUrl` (default from `getSetting('plan_index','ollama_base_url')` ?? `http://localhost:11434`),
  `deps.timeoutMs` (default 1500). Issues `GET {baseUrl}/api/tags` under an
  `AbortController` timeout; resolves `true` on HTTP 200, `false` on connection
  refused / timeout / non-200. NEVER throws (fail-open probe).
- `detectCompute() → { hasGpu: boolean, cpuCount: number }` — best-effort via `os.cpus()`;
  `hasGpu` is a heuristic hint only (used solely to ORDER calibration candidates, never to gate).
**Deps:** `os`, injected `fetch`, `require('../settings').getSetting`.
**Cross-platform:** `os.cpus()`; no shelling out; no bash.

### File: `src/lib/plan-index/ollama-client.js`
**Action:** CREATE — **Purpose:** Ollama HTTP client (batch embed + tag listing), no npm dep.
**Exports (factory so `fetch` is injectable → hermetic tests):**
- `createOllamaClient({ fetch?, baseUrl?, timeoutMs? }) → { embed, listModels }`
  - `embed(model: string, input: string[]) → Promise<Float32Array[]>`
    - `POST {baseUrl}/api/embed`, JSON body `{ model, input }` (BATCH endpoint — NOT the
      deprecated `/api/embeddings`; AC EM-01). Parses `{ embeddings: number[][] }`.
    - Validates response shape: array, each row a finite-number array of a consistent
      length; on mismatch throws a descriptive `Error` naming the expected/actual shape
      (Risk: Ollama API drift). Maps each row → `new Float32Array(row)`.
    - Bounded by `AbortController` + `timeoutMs` (default 5000).
  - `listModels() → Promise<string[]>` — `GET {baseUrl}/api/tags`, returns the model
    `name`s (base names, tag-stripped) for the availability filter (AC EM-09).
**Deps:** injected `fetch` (default global). No npm package (Node built-in `fetch`).
**Errors:** network failure REJECTS (caller `embedder.js` catches → fallback, so `embed`
never rejects to PI0/PI3). Shape mismatch REJECTS with a descriptive message.
**Cross-platform:** pure `fetch`; no OS assumptions.

### File: `src/lib/plan-index/inprocess-engine.js`
**Action:** CREATE — **Purpose:** deterministic, network-free fallback embedder (fail-open core).
**Exports:**
- `DIMENSION: number` — fixed fallback dimension. **DA-2:** `384` (matches
  `all-MiniLM-L6-v2`, the stub's named in-process model, so an Ollama→fallback switch
  keeps a stable dimension family).
- `embedInProcess(texts: string[]) → Promise<Float32Array[]>`
  - Deterministic hashing embedding: tokenize each text, hash each token into `DIMENSION`
    buckets (a stable FNV-1a / `crypto`-free integer hash), accumulate a bag-of-hashed-tokens
    vector, then **L2-normalize** (calibration step (c); AC: cosine-ready). Same input →
    byte-identical vector (deterministic; hermetic tests need no model).
  - Returns `Float32Array[]` of length `DIMENSION`; contains only finite values (so PI1's
    `upsertUnit` non-finite guard, `store.js:568`, never trips).
**Deps:** none (pure JS). **Errors:** never throws for string input (fail-open).
**Cross-platform:** pure arithmetic; no fs, no native module.

### File: `src/lib/plan-index/embedder.js`
**Action:** CREATE — **Purpose:** the unified `embed()` façade — probe + preference dispatch + fallback.
**Exports:**
- `embed(texts: string[], deps?) → Promise<Float32Array[]>`
  - Reads preference: `getSetting('plan_index','engine_preference', deps.projectPath) ?? 'auto'`.
    - `'in-process'` → `embedInProcess(texts)`; the Ollama client's `embed` is NEVER called
      (AC EM-10, mock call count 0).
    - `'ollama'` → Ollama client `embed(model, texts)`; on ANY error → fallback + warn.
    - `'auto'` (default) → `probeOllama()` ; if reachable use Ollama (catch→fallback), else fallback.
  - Model resolves from `loadCalibration()?.model` (calibration.js) when using Ollama.
  - **Fail-open contract:** `embed` resolves to `Float32Array[]` in ALL paths; it NEVER
    rejects to the caller when Ollama is absent/broken (AC EM-02). Each vector is
    L2-normalized (Ollama vectors are re-normalized here so both backends are cosine-ready).
  - Attaches an internal source tag (`'ollama'` | `'in-process'`) on the returned batch
    (non-enumerable or via a returned `{ vectors, source }` — implementer picks; EM-01/EM-02
    assert the tag). **DA-3:** return `{ vectors: Float32Array[], source: string }` to keep the
    tag inspectable without polluting the array.
  - `deps` (all injectable for hermetic tests): `{ ollamaClient?, probe?, getSetting?, loadCalibration?, projectPath? }`.
**Deps:** `./ollama-client`, `./inprocess-engine`, `./hardware-probe`, `./calibration` (loadCalibration), `../settings`.
**Cross-platform:** no paths of its own.

### File: `src/lib/plan-index/calibration.js`
**Action:** CREATE — **Purpose:** first-run model selection + persistence; invoked by PI0 (NOT self-invoked).
**Constants:** `CANDIDATES = ['mxbai-embed-large','nomic-embed-text','all-minilm']` (Ollama, largest→smallest);
`BUDGET_MS = 5000`; `TARGET_MS = 3000`; `CALIBRATION_FILE = path.join(indexDir,'calibration.json')`
where `indexDir` = `.ctoc/index/` resolved via the project root (cross-platform, EM-11).
**Exports:**
- `runCalibration(deps?) → Promise<{ model, dimension, backend, measuredP95ms }>`
  - `deps.clock` — INJECTABLE latency source (EM-03 stub clock); `deps.ollamaClient`;
    `deps.projectPath`; `deps.force` (bypass the idempotent no-op).
  - Steps: probe `/api/tags` → filter `CANDIDATES` to locally-present (absent → logged skip
    `'<m>: not available locally — skipping'`, EM-09) → micro-benchmark each present candidate
    (p95 over N encodes via `deps.clock`) → EXCLUDE any p95 ≥ `BUDGET_MS` (EM-03) → pin the
    LARGEST remaining (candidate-order = size-order) → derive `dimension` from a real encode of
    the pinned model. If NONE meet budget → pin smallest with a logged warning (stub Decision).
    If Ollama unreachable → `backend:'in-process'`, `model:'all-MiniLM-L6-v2'`,
    `dimension: inprocess.DIMENSION` (384).
  - Persists the result JSON to `CALIBRATION_FILE` via `safeFs.writeFileSync` (atomically
    is nice-to-have; single small file). Idempotent: if the file exists and `!force`, returns
    it WITHOUT benchmarking (EM-04).
- `loadCalibration(deps?) → { model, dimension, backend, measuredP95ms } | null`
  - Reads `CALIBRATION_FILE` via `safeFs`; `null` if absent/unparseable (fail-open). EM-04.
**Deps:** `path`, `os`, `require('../safe-fs')`, `./ollama-client`, `./inprocess-engine`, `../settings`.
**Cross-platform:** `path.join` + `os.homedir()`/project-root everywhere; NO hardcoded `/` or `~` (EM-11).
**Note:** PI2 does NOT call `runCalibration` on import (stub Decision; Out-of-Scope self-invocation).

### File: `tests/plan-index-embedding.test.js`
**Action:** CREATE — see **§ Test Plan → AC map** below. Framework `node:test` + `node:assert/strict`.
All Ollama HTTP is an injected mock (`deps.ollamaClient` / `deps.fetch`); no live network in CI.

## Test Plan — every BDD AC mapped to a named test (EM-01…EM-12)

| AC (BDD scenario) | Test name (in `tests/plan-index-embedding.test.js`) | Key assertion | Hermetic strategy |
|---|---|---|---|
| Ollama reachable → batch `/api/embed` | `EM-01 embed() posts batch input[] to /api/embed and tags 'ollama'` | mock records one POST to `/api/embed` with body `{model, input:[...]}`; returns 2× `Float32Array`; `source==='ollama'` | inject mock `ollamaClient.embed` |
| Ollama absent → fallback, no throw | `EM-02 embed() falls back in-process when Ollama unreachable` | resolves `Float32Array[]` of `DIMENSION`; `source==='in-process'`; no rejection | mock probe→false / client rejects |
| Calibration skips over-budget (stub clock) | `EM-03 runCalibration excludes >5000ms and pins largest within budget` | `pinned==='nomic-embed-text'`; `calibration.json.measuredP95ms===2400`; mxbai excluded | inject `deps.clock` returning fixed p95s |
| Calibration persisted + reused | `EM-04 loadCalibration returns persisted result without re-benchmark` | 2nd `loadCalibration()` === 1st object; benchmark spy call count 0 | temp dir + injected projectPath |
| Dimension → PI1 store via first upsert | `EM-05 [integration] first upsert of Float32Array(768) locks store.dimension` | after `store.upsertUnit({...embedding:Float32Array(768)...})`, `store.dimension===768`; no `initVectorTable` exists | imports PI1 `openStore` on a temp json; gate-skip if PI1 absent |
| extractSummary deterministic | `EM-06 extractSummary is byte-deterministic and calls parseMetadata` | `r1===r2`; spy on `state.parseMetadata` was invoked; no network | spy via module ref; pure input |
| Summary contains title + H2/H3 | `EM-07 extractSummary includes title and all H2/H3 headings` | output includes YAML title, `'Problem Statement'`, `'Scope'` | fixture markdown string |
| Summary excludes body prose | `EM-08 extractSummary excludes section body paragraphs` | heading text present; a known body paragraph absent | fixture markdown string |
| Probe `/api/tags` excludes absent models | `EM-09 calibration skips models not in /api/tags with a logged note` | mxbai skipped + note logged; only the 2 present candidates benchmarked | mock `listModels` → 2 names |
| `engine_preference` overrides reachable Ollama | `EM-10 engine_preference in-process forces fallback even when Ollama reachable` | mock Ollama `embed` call count === 0; `source==='in-process'` | inject `getSetting`→`'in-process'` + reachable probe |
| Cross-platform path handling | `EM-11 calibration.json path uses path.join/os.homedir on win32 mock` | path built with `path.join`; no `/`-literal / `~` in constructed path; write/read round-trips | temp dir; assert on constructed path string |
| Real-model smoke (Ollama-gated) | `EM-12 [smoke] paraphrase cos-sim exceeds unrelated by >=0.15` | `cos(A0,A1) > cos(B0,B1)` by ≥0.15 | `t.skip('Ollama not available — smoke requires live Ollama')` LOUD skip when absent |

**Coverage targets:** ≥ 80% lines/branches on the five runtime modules; every error path
(shape-mismatch throw in `ollama-client`, probe-timeout→false, none-in-budget warning path,
non-string→`''` in `extractSummary`) is exercised. No test depends on execution order; no
empty catch; no assertion-less test.

## Acceptance-Criteria → Implementation mapping

| Criterion | Implemented in | Test |
|---|---|---|
| batch `/api/embed`, `input: string[]`, `Float32Array[]`, tag `'ollama'` | `ollama-client.js:embed`, `embedder.js` | EM-01 |
| Ollama absent → in-process fallback, no throw (fail-open) | `embedder.js` (catch→`inprocess-engine`), `hardware-probe.js:probeOllama` | EM-02 |
| Skip over-budget, pin largest within budget, persist | `calibration.js:runCalibration` | EM-03 |
| Persist + reuse without re-benchmark | `calibration.js:loadCalibration` | EM-04 |
| Dimension flows to store via first upsert (no `initVectorTable`) | consumer contract; PI1 `store.js:applyUpsert` infers dim | EM-05 |
| extractSummary deterministic, uses `parseMetadata`, no LLM/network | `summary-extract.js` | EM-06 |
| Summary includes title + H2/H3 | `summary-extract.js` | EM-07 |
| Summary excludes body prose | `summary-extract.js` | EM-08 |
| `/api/tags` availability filter with logged note | `ollama-client.js:listModels`, `calibration.js` | EM-09 |
| `engine_preference` overrides reachable Ollama (real token `'in-process'`) | `embedder.js` (reads `getSetting('plan_index','engine_preference')`) | EM-10 |
| Cross-platform paths (`path.join`, `os.homedir`) | `calibration.js` | EM-11 |
| Real-model paraphrase > unrelated (Ollama-gated, loud skip) | `embedder.js` + live Ollama | EM-12 |

## Security Review (checklist — complete)

- [x] **Path traversal:** only fixed, code-derived paths (`.ctoc/index/calibration.json`
  under project root); no user-supplied path reaches fs. All fs via `safe-fs.js`
  (validates non-empty + no-NUL, fail-closed).
- [x] **SSRF surface:** `ollama_base_url` is developer-local config (default `localhost:11434`);
  document that pointing it at a remote host is the operator's explicit choice. Requests are
  GET `/api/tags` and POST `/api/embed` only; no redirect-following of untrusted URLs.
- [x] **Input validation:** Ollama response shape validated (array of finite-number rows of
  consistent length) before constructing `Float32Array`; non-finite values are impossible to
  reach the store (PI1 also guards, defense-in-depth).
- [x] **No secrets:** no API keys/tokens; Ollama is unauthenticated local HTTP.
- [x] **DoS/hang:** every network call bounded by `AbortController` timeout; probe defaults 1500 ms,
  embed 5000 ms — a hung Ollama can never freeze `embed` or the menu.
- [x] **Prototype pollution:** JSON parse results are read field-by-field; no untrusted-key
  object merge.
- [x] **No command injection:** zero `exec`/shell; Node `fetch` + `os` only.

## Risk Mitigations (mapped to code)

| Risk (from plan) | Mitigation | Where |
|---|---|---|
| ONNX/model unavailable air-gapped | Deterministic hashing fallback needs NO download/network → always produces vectors | `inprocess-engine.js` (DA-1) |
| Ollama API shape drift | Validate response shape; throw descriptive error incl. version header if present | `ollama-client.js:embed` |
| Calibration slow first run | Pure fn, PI0 runs it in background; menu never blocked; idempotent no-op afterwards | `calibration.js` (no self-invoke) |
| Per-machine `calibration.json` | git-ignored, per-machine; `loadCalibration` fail-open `null` → re-run | `calibration.js` |
| PI1 required for EM-05 | EM-05 tagged integration; gate-skip when PI1 store absent | test EM-05 |

## Decisions Taken Under Ambiguity (Step-10 pre-authorized)

- **DA-1 (fallback engine):** The load-bearing in-process fallback is a **deterministic
  hashing embedder** (no download, no network) — this is what makes fail-open + hermetic CI
  real. The stub's optional ONNX runtime is a future drop-in behind the same
  `inprocess-engine.js` interface; NOT implemented in this slice. Rationale: an ONNX-download
  fallback still hard-fails air-gapped and is non-hermetic — it would defeat both the fail-open
  and the no-network-in-CI requirements.
- **DA-2 (fallback dimension):** `DIMENSION = 384` (all-MiniLM-L6-v2 family), so an
  Ollama↔fallback switch keeps a stable dimension. When the store already holds a different
  dimension, PI1's `applyUpsert` performs a documented full reset (`store.js:591`) — acceptable
  for a rebuildable cache.
- **DA-3 (source tag):** `embed()` returns `{ vectors: Float32Array[], source: 'ollama'|'in-process' }`
  so the tag is inspectable (EM-01/EM-02) without polluting the `Float32Array[]`.
- **DA-4 (settings signature):** use the REAL `getSetting(category, key, projectPath)` and the
  REAL enum token `'in-process'` (see Corrections 1–2). This overrides the stub's incorrect
  single-string / `'inprocess'` wording.

## Discrepancies vs. the stub

1. `getSetting` call form — stub used a single dotted string; real API is
   `(category, key, projectPath?)`. **Corrected in blueprint (DA-4).**
2. `engine_preference` value — stub said `'inprocess'`; real schema token is
   `'in-process'` (default `'auto'`). **Corrected (DA-4); EM-10 asserts `'in-process'`.**
3. README module count — stub/task flagged a possible bump; the readme-numbers test counts
   `src/lib/*.js` NON-recursively, so `src/lib/plan-index/*.js` are excluded — **no bump, no
   README `files:` entry needed** for PI2.
4. In-process backend — stub leads with ONNX/WebAssembly; blueprint makes the deterministic
   hashing embedder the load-bearing fallback (DA-1) to guarantee fail-open + hermetic CI, with
   ONNX as an optional future drop-in behind the same interface.

## Iron Loop — Steps 8–16 checklist (canonical labels, MANDATORY order)

> These are the canonical labels enforced by `src/lib/plan-validator.js`
> (`CANONICAL_STEP_LABELS`) and `src/hooks/validate-plan-steps.js`. Step 10 is ONE
> step with per-file sub-items.

### Step 8: TEST
Write `tests/plan-index-embedding.test.js` FIRST (TDD-Red): all of EM-01…EM-12 with
injected mocks (no live Ollama); EM-05 imports PI1 `openStore` (gate-skip if absent);
EM-12 LOUD-skips when Ollama absent. Tests fail (modules do not yet exist).

### Step 9: PREPARE
Confirm Node built-in `fetch` availability; create `src/lib/plan-index/` targets;
verify `../state.parseMetadata`, `../settings.getSetting`, `../safe-fs` import cleanly;
no new npm deps.

### Step 10: IMPLEMENT
Create the six modules in dependency order (summary-extract → hardware-probe →
ollama-client → inprocess-engine → embedder → calibration). Honor DA-1..DA-4. No stubs.

### Step 11: REVIEW
Self-review vs. §File Specifications + §Security Review: fail-open in every `embed`
path, timeouts on every fetch, `path.join`/`os.homedir` everywhere, no raw `fs`.

### Step 12: OPTIMIZE
Single batch POST per plan (summary + sections in one `/api/embed`); reuse one Ollama
client instance; L2-normalize in a single pass.

### Step 13: SECURE
Verify §Security Review checklist: bounded timeouts, response-shape validation,
no SSRF-following, no secrets, safe-fs choke point.

### Step 14: VERIFY
`node --test tests/plan-index-embedding.test.js` green; lint/typecheck clean;
coverage ≥ 80% on the five runtime modules; 0 skipped in CI except EM-12's LOUD
Ollama-gated skip; 0 flaky.

### Step 15: DOCUMENT
JSDoc on every export; module-header comment per file; document
`plan_index.inprocess_model_path` override note and the per-machine `calibration.json`
behavior in the module README comment.

### Step 16: FINAL-REVIEW
implementation-reviewer verifies the 14 quality dimensions + all 12 ACs mapped and
passing → Gate 3 (human approval) before `review → done`.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (`tests/plan-index-embedding.test.js`, EM-01…EM-12 + extra branch tests)
- [x] Test error conditions (shape mismatch, non-200, non-finite, unreachable probe, count mismatch, none-in-budget)
- [x] Run tests - expect RED (failing) — confirmed RED: all requires failed (`Cannot find module`)

### Step 9: PREPARE
- [x] Install dependencies if needed — none (Node 24 built-in `fetch`, zero npm runtime deps)
- [x] Check prerequisites — `../state.parseMetadata`, `../settings.getSetting(cat,key,path)`, `../safe-fs`, PI1 `openStore` all verified fresh
- [x] Verify dev environment ready — Node v24.14.1
- [x] Create directories/config if needed — modules live in existing `src/lib/plan-index/`

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — 6 modules in dependency order (summary-extract → hardware-probe → ollama-client → inprocess-engine → embedder → calibration)
- [x] Add error handling — fail-open in every `embed` path; bounded AbortController timeouts; shape validation; fail-soft summary extract
- [x] Wire up integration points — EM-05 integration against shipped PI1 `openStore`/`upsertUnit` passes

### Step 11: REVIEW
- [x] Self-review all new code — vs §File Specifications + §Security Review
- [x] Verify integration points work together — EM-05 store dimension-lock via first upsert
- [x] Check error handling completeness — every fetch bounded; every backend L2-normalized; fallback never rejects

### Step 12: OPTIMIZE
- [x] Remove redundant operations — single batch POST per plan; one client instance; single-pass L2-normalize
- [x] Optimize critical paths — signed feature-hashing fallback is O(tokens), no allocations per token
- [x] Simplify complex code — no stubs; candidate order = size order avoids a separate sort

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — only code-derived `path.join` paths; all fs via `safe-fs`
- [x] Sanitize outputs — Ollama response shape validated (finite, equal-length rows) before Float32Array
- [x] No secrets in code — Ollama is unauthenticated local HTTP; no keys
- [x] Safe file operations — `safe-fs` choke point; bounded timeouts prevent DoS/hang

### Step 14: VERIFY
- [x] Run lint + type check — `npx eslint . --max-warnings 0` exit 0; tsc 89 errors (baseline-neutral, no regression)
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → 2919 pass, 0 fail
- [x] Check coverage >= 80% — line coverage: summary-extract 97.5, hardware-probe 95.6, ollama-client 97.65, inprocess 100, embedder 97.18, calibration 95.2
- [x] 0 skipped, 0 flaky tests — 0 skipped (EM-12 ran against live `snowflake-arctic-embed2`; LOUD-skips only when no embedding model present)

### Step 15: DOCUMENT
- [x] Update relevant documentation — module-header comment per file (per-machine calibration, DA-1/DA-2 rationale)
- [x] Add JSDoc comments to new functions — every export has JSDoc with @param/@returns
- [x] Update CHANGELOG if needed — N/A (per Correction #3, no README/version bump: plan-index/ is a subdir, outside readme-numbers count)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed — lint 0, tsc baseline-neutral, 2919/0, coverage >=80% all 6 modules
- [x] Manual verification if needed — EM-12 real-model smoke passed on live Ollama
- [ ] Ready for human review — awaiting Gate 3 (review → done) human approval

---

## Decisions Taken Under Ambiguity (Step-10 execution log)

- **EM-12 smoke test target (execution-time decision).** The plan's EM-12 phrasing
  hardcoded `nomic-embed-text` as "the calibrated model." On the execution machine
  Ollama was reachable but had NO `nomic-embed-text` / `mxbai-embed-large` /
  `all-minilm` installed — forcing `'ollama'` with a missing model silently
  fail-opened to the in-process hashing embedder, which has no semantics and gave a
  0.13 margin (< 0.15), a FALSE result masquerading as a real-model test. Decision:
  EM-12 now discovers an actually-loaded embedding model from `/api/tags` (name
  matches `/embed/i`), drives the real Ollama backend directly against it, and
  LOUD-skips (`t.skip`) when NO embedding model is present or the embed call fails.
  This makes the smoke test honest: it exercises real semantics when a real
  embedding model exists (verified against `snowflake-arctic-embed2`, margin ≥ 0.15),
  and never green-washes a fallback. Rationale: a smoke test that passes on the
  semantics-free fallback is worse than no test.
- **`clock` injection shape.** `runCalibration`'s injectable clock accepts EITHER
  `{ p95For(model) }` (deterministic per-model p95 for EM-03) OR `{ now() }` (a
  monotonic timer the real micro-benchmark times against). `p95For` takes
  precedence when present. This keeps EM-03 fully deterministic while allowing a
  real timed benchmark in production without a second code path.
- **`pinned` field is a convenience alias of `model`.** `runCalibration` returns
  both `model` and `pinned` (equal) so callers/tests can use either; the JSDoc
  return type marks `pinned?` optional because the idempotent no-op path returns
  the persisted object (which stores `pinned` but whose type is inferred from
  `loadCalibration`). Baseline-neutral for tsc.
- **No `no-await-in-loop` suppressions.** That rule is not enabled in this repo's
  eslint config; the sequential benchmark/timing loops carry no disable directive
  (an unused directive is itself a warning under `--max-warnings 0`).

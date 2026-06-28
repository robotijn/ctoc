---
title: "PI4 — Semantic Search & Related-Plans Surfacing (BM25 + Vector RRF)"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 5
depends_on:
  - pi0-bootstrap-and-runtime-wiring
acceptance_criteria_count: 7
risk_level: MEDIUM
gate_status: "Pending Approval (Gate 1: functional → implementation)"
files:
  - "src/lib/plan-index/search.js"
  - "src/lib/plan-index/related.js"
  - "src/lib/plan-index/fusion.js"
  - "src/lib/plan-index/index.js"
  - "src/commands/menu.js"
  - "src/tabs/overview.js"
  - "src/areas/inbox.js"
  - "src/lib/inbox.js"
  - "tests/plan-index-search.test.js"
---

# PI4 — Semantic Search & Related-Plans Surfacing (BM25 + Vector RRF)

## Problem Statement

Users and agents cannot ask "what relates to this?" or find a plan by meaning. Plans are isolated `.md` files with no cross-correlation: dense vectors miss exact identifiers, file paths, and acronyms; lexical search misses semantic equivalents. This is the first user-visible capability of the plan index — the walking skeleton that proves the hybrid retrieval pipeline end-to-end. PI5 (duplicate guard) and PI6 (conflict detection) both depend on the retrieval core this slice delivers; nothing downstream ships until PI4 is functional.

## Business Alignment

**Job to Be Done:** When I am decomposing a vision or creating a new plan, I want to search the plan board by meaning or by exact identifier, so I can discover related existing work before duplicating effort.

**Impact Map:**
- **Goal:** Eliminate planning blindness — agents and users can see the full plan landscape before they create new work (vision success criteria 1 and 2)
- **Actor:** CTOC user (CTO or engineer driving the pipeline) and pipeline agents (vision-decomposer, product-owner) running against the menu
- **Impact:** The actor discovers related plans before creating a new one, reducing the duplicate and phantom backlog that previously required hand-cleaning
- **Deliverable:** Hybrid BM25+vector search with RRF k=60 fusion, exposed as a search entry in the menu and a related-plans panel rendered in `src/tabs/overview.js` and the inbox area

## User Stories

**As a** CTOC user searching the plan board, **I want** to query plans by natural language or exact identifier, **so that** I find the right plan regardless of whether I remember its exact slug or title.

**As a** CTOC user viewing or creating a plan, **I want** to see its nearest-neighbor plans surfaced automatically, **so that** I can spot related work and potential overlaps without manually scanning every `.md` file.

## Acceptance Criteria

- [ ] **Scenario: Natural language query returns intended plan as top result**
  Given the fixture plan set is indexed (minimum 10 plans across 3 distinct topic clusters)
  When I submit the query "how does CTOC sync plan state?" via the search menu entry
  Then the plan whose content most closely addresses that question is ranked first
  And results are ordered by descending fused BM25+vector score

- [ ] **Scenario: Exact-identifier query succeeds via the lexical half**
  Given a plan containing the identifier "parseYAMLShallow" is indexed
  And the fixture is constructed so that the dense (KNN) rank of the target plan for that exact token is NOT in the top-3 (forcing it below rank 4 in the KNN-only ranking)
  When I submit the exact query "parseYAMLShallow"
  Then the target plan appears in the top-3 of the RRF-fused ranking
  And the KNN-only ranking does NOT place the target plan in the top-3, confirming the BM25 path is the contributor that lifts it into the final result set

- [ ] **Scenario: RRF MRR strictly beats the weaker retrieval half on the labeled query set**
  Given a fixture set of ≥20 labeled natural-language query → expected-plan pairs is indexed
  When Mean Reciprocal Rank is computed for lexical-only (score_bm25), vector-only (score_knn), and RRF-fused k=60 (score_rrf) rankings
  Then score_rrf strictly beats the weaker half: score_rrf > min(score_bm25, score_knn)
  And score_rrf is at least the mean of both halves: score_rrf >= (score_bm25 + score_knn) / 2
  Note: these assertions replace the old `>=` both-halves check; a fusion that drops one core still passes `>=` both — these do not

- [ ] **Scenario: RRF ablation — disabling either retriever changes the ranking**
  Given the same ≥20-query fixture set
  When RRF is run with only BM25 scores (KNN scores zeroed) and the result ordering is recorded
  And RRF is run with only KNN scores (BM25 scores zeroed) and the result ordering is recorded
  And full RRF is run with both halves active
  Then the full-RRF ordering differs from the BM25-only ordering on at least 1 query
  And the full-RRF ordering differs from the KNN-only ordering on at least 1 query
  And this confirms both retrieval paths contribute to the merged output — neither half is silently dropped

- [ ] **Scenario: Related-plans excludes self and is ordered by descending similarity**
  Given "pi4-semantic-search-and-related-plans.md" is indexed alongside sibling plans
  When I trigger related-plans for that plan
  Then the result list does not contain "pi4-semantic-search-and-related-plans.md" itself
  And results are ordered by descending similarity score

- [ ] **Scenario: Related-plans returns empty list when no neighbors exist**
  Given only a single plan is in the index
  When I trigger related-plans for that plan
  Then the result is an empty list
  And no exception is thrown

- [ ] **Scenario: Empty index degrades gracefully**
  Given the index has zero rows (vec0 table empty, FTS5 table empty)
  When I submit any search query or trigger related-plans
  Then the result is an empty list
  And the UI shows an "index building" state indicator (rendered synchronously from a zero-row count check)
  And no crash or unhandled exception occurs

## Non-Functional Requirements

- **Cross-platform:** `fusion.js`, `search.js`, and `related.js` are platform-agnostic. Platform differences (sqlite-vec binary, embedding engine) are isolated in PI1 and PI2 (provided pre-wired by PI0). PI4 code runs identically on macOS arm64, macOS x64, Linux x64, Linux arm64, and Windows x64.
- **Synchronous execution:** All retrieval calls are synchronous on the main thread. PI0 has already built the index before the menu renders; PI4 reads the already-built results synchronously. No async injection, no timeout caps, no partial-result returns. Query embedding is a single synchronous call to the PI0-injected embedder; latency is bounded by the model calibration PI0 performs at startup.
- **Graceful empty-index no-op:** Zero-row store returns an empty list on any query. A zero-row count is sufficient to determine this state; no PI3 sync status required.
- **Result count:** Default top-10 for search, top-5 for related-plans. Both limits are module-level constants in `index.js`, not magic numbers scattered across callers.

## Scope

### In Scope
- `fusion.js`: RRF k=60 implementation — takes a BM25-ranked list and a KNN-ranked list, returns a single fused list ordered by descending RRF score; cosine distance as the similarity metric
- `search.js`: drives FTS5 query and vec0 KNN query via PI1's store interface (provided by PI0 composition root), embeds the query text synchronously via the injected embedder, calls `fusion.js`, returns the ranked plan list
- `related.js`: seeds retrieval from a given plan's stored summary vector and extracted lexical terms; delegates to `search.js`; filters self from results; accepts an optional `kind` parameter (`'plan'` | `'section'`) passed through to the vec0 KNN query to allow PI6 to request section-level vectors
- `index.js`: public API module exporting `search(query, options)` and `related(planSlug, options)` — the interface PI5 and PI6 consume; internal modules (`search.js`, `related.js`, `fusion.js`) are not imported directly by callers outside this package; all edits to `index.js` are additive (existing PI1 barrel exports remain unchanged and must resolve after PI4 extends the module)
- `menu.js`: adds a "Search plans" keyboard shortcut routing to the search flow
- `overview.js`: renders a "Related Plans" panel in the overview tab for the currently selected plan, populated synchronously by `related()` at render time
- `src/areas/inbox.js` + `src/lib/inbox.js`: extended to surface related-plans results in the inbox area view as needed by the tab layout
- `tests/plan-index-search.test.js`: fixture-based tests covering all 7 BDD scenarios, including the ≥20-query RRF falsifiability test and the ablation test

### Out of Scope
- Write-time duplicate warning on plan creation — covered in PI5
- Conflict/dependency flagging via `files:` overlap — covered in PI6
- Index store schema, embedding generation, reconciliation sync — covered in PI1, PI2, PI3 (consumed pre-wired via PI0)
- Re-embedding or re-indexing logic — PI4 reads the already-built index; PI0/PI3 own writes
- UI layout decisions beyond functional placement (related panel in overview tab, search entry in menu) — implementation-time DESIGN decision (Iron Loop Step 6)
- Tuning result-count defaults beyond setting the initial constants — product-owner concern post-Gate 1

## Risks

### Technical Risks
- **sqlite-vec binary extension fails to load on an untested platform.** PI4's KNN query depends on the `vec0` table provided by the sqlite-vec extension. Missing or incompatible binary means all KNN queries fail.
  - Likelihood: MEDIUM
  - Impact: HIGH (search and related-plans entirely non-functional; lexical-only fallback still runs)
  - Mitigation: Test binary loading in CI for each target platform tuple (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win-x64) as part of PI1's deliverable. PI4 detects load failure at startup and disables the KNN path gracefully, logging a warning and falling back to lexical-only; this is visible to the user but not a crash.

- **RRF fixture test is statistically fragile if the query set is poorly designed.** With a poorly chosen fixture the MRR advantage may be within noise even at ≥20 queries.
  - Likelihood: LOW
  - Impact: MEDIUM (test passes vacuously; fusion benefit unproven on this data)
  - Mitigation: Design fixture with ≥20 queries deliberately split across two categories — 10 queries where lexical dominates (exact-token queries), 10 queries where semantic dominates (paraphrase queries). This guarantees neither half always wins, making the ablation test non-trivial.

### Business Risks
- **Related-plans panel causes perceived layout shift when results appear.** Synchronous retrieval eliminates async layout shift; however, on a cold (large) index the synchronous call may be slow.
  - Likelihood: LOW (synchronous on pre-built index; query embedding is a single fast call)
  - Impact: MEDIUM
  - Mitigation: Set a result count cap (top-5 for related-plans) and cap the vec0 KNN scan at a bounded number of results at the SQL layer. Run a perceived-latency check on a sample menu session before Gate 3.

### Dependency Risks
- **PI0 not complete when PI4 development begins.** PI4 depends on PI0's composition root to provide the wired embedder and populated store.
  - Likelihood: MEDIUM (sequential ordering expected)
  - Impact: HIGH (PI4 cannot be integration-tested without the runtime wiring)
  - Mitigation: Build `fusion.js` first — it is pure logic with no I/O dependency and can be fully covered by unit tests against synthetic ranked lists. Build `search.js` and `related.js` against a mock store + mock embedder interface; swap in PI0's real composition root at integration time.

## Test Plan

### Fixture Set Specification
A checked-in fixture under `tests/fixtures/plan-index/` (not generated at runtime):
- 10 representative plan summaries across 3 topic clusters (plan state management, auth hooks, quality gates)
- ≥20 labeled natural-language query → expected top-ranked plan pairs:
  - 10 exact-token queries (identifiers, file paths, acronyms) — BM25 should dominate these
  - 10 paraphrase / semantic queries — KNN should dominate these
  - The deliberate split ensures the ablation test (Scenario 4) is non-trivial
- 3 labeled exact-token query → expected plan pairs (identifiers, file paths)
- Pre-measured cosine similarities between all plan-pair combinations, recorded in the fixture JSON for deterministic arithmetic assertions

**Fixture tests are LOGIC tests (comparison / fusion arithmetic).** They verify that the RRF formula, the MRR computation, and the threshold comparisons are implemented correctly against pre-measured values baked into the fixture. They do NOT measure the quality of the embedding model. True retrieval quality (whether the calibrated model produces useful embeddings) is covered by PI2's Ollama-gated real-model smoke test, referenced here by name; PI4's test suite does not re-test that claim.

### Falsifiable Retrieval Quality Test (Unit — `tests/plan-index-search.test.js`)

```
Given: ≥20 labeled NL query → expected plan pairs indexed in an in-memory mock store
For each query:
  score_bm25  = MRR of lexical-only ranking (FTS5 path only)
  score_knn   = MRR of vector-only ranking (KNN path only)
  score_rrf   = MRR of RRF-fused ranking (k=60)

Assert: score_rrf > min(score_bm25, score_knn)     [strictly beats weaker half]
Assert: score_rrf >= (score_bm25 + score_knn) / 2  [at least the mean]

Ablation sub-test (Scenario 4):
  rrf_bm25_only = RRF run with KNN scores zeroed
  rrf_knn_only  = RRF run with BM25 scores zeroed
  Assert: full-RRF ordering != rrf_bm25_only ordering on ≥1 query (KNN contributes)
  Assert: full-RRF ordering != rrf_knn_only ordering on ≥1 query (BM25 contributes)
```

This test does NOT pass vacuously. A fusion that zeros out one retriever will fail the ablation sub-test. A fusion that merely re-orders within the dominant half's ranking will fail the strictly-beats-weaker assertion.

### Exact-Token Recall Test (Unit — Scenario 2)
```
Given: fixture plan containing "parseYAMLShallow" is indexed
And: the fixture's pre-measured cosine similarity between the exact-token query
     and the target plan's summary vector is LOW (< median of all plan-pair similarities),
     so the target does NOT appear in the KNN top-3 for this query
Assert: KNN-only ranking does NOT place the target in top-3
Assert: BM25-only ranking places the target in top-1
Assert: RRF-fused ranking places the target in top-3
Interpretation: BM25 is the contributor; the test FAILS if KNN puts it in top-3 (fixture is misconfigured)
```

### Barrel Integrity Test (Unit)
```
After PI4 extends src/lib/plan-index/index.js with search() and related():
Assert: all exports declared by PI1 in the barrel still resolve (no import breaks)
Assert: require('src/lib/plan-index/index.js').search is a function
Assert: require('src/lib/plan-index/index.js').related is a function
Assert: all pre-existing PI1 barrel exports are still present and are functions/objects of the expected type
Purpose: prevents PI4's additive barrel changes from shadowing or removing PI1's store interface
```

### Cross-Platform Smoke Test (CI)
`node --test tests/plan-index-search.test.js` on each platform runner (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win-x64); assert 0 failures.

## Rollback

If PI4 causes regressions in the menu or overview tab:
1. Remove the "Search plans" keyboard shortcut from `menu.js` (one routing call).
2. Remove the "Related Plans" panel from `overview.js` (one section).
3. Remove the inbox area extension from `src/areas/inbox.js` / `src/lib/inbox.js` (one conditional block each).
4. `index.js` and internal modules can remain on disk; PI5/PI6 must also be disabled if rollback is permanent (they depend on `index.js`).
5. PI0/PI1/PI2/PI3 are unaffected; the database remains on disk and is re-activated when PI4 is fixed.
6. No data migration required; rollback is code-only.

## Dependencies

| Dependency | Role | Interface Level |
|---|---|---|
| PI0 (bootstrap and runtime wiring) | Provides the composition root: wired embedder instance + populated store reference. PI4 receives both at startup via PI0's exports. PI0 transitively covers PI1 (store), PI2 (embedder), and PI3 (sync). | Capability level: "pre-wired embedder callable synchronously + open store handle with FTS5 and vec0 tables ready" |
| PI1 (index store + schema) | Provides FTS5 tables and vec0 KNN table; PI4 reads both via the store reference from PI0. `kind` column on vec0 is used by `related()` when filtering for section-level vectors (PI6 use). | Via PI0 composition root; PI4 does not import PI1 directly |
| PI2 (embedding engine) | PI4 calls the embedder injected by PI0 to embed the query text synchronously before KNN search. PI4 does NOT import PI2's module directly; it calls only the pre-wired embedder instance. | Via PI0 injection; real-model retrieval quality tested in PI2's Ollama-gated smoke test (referenced, not re-tested here) |
| PI3 (reconciliation sync) | Keeps the store current; PI4 assumes the store reflects the `.md` filesystem at call time. | Precondition only; PI4 has no runtime PI3 dependency |

## Decisions Taken Under Ambiguity

- **PI4 embeds the search query.** PI4 is a read consumer of the stored index but MUST embed the query text before KNN search. It receives an embedder instance from PI0 (injected at startup via the composition root) and calls it synchronously to produce the query vector. PI4 does NOT import PI2 or the embedding engine modules directly; it calls only the pre-wired embedder provided by PI0. The earlier description "PI4 is read-only and contains no embed calls" was incorrect and has been replaced by this decision.
- **Synchronous execution throughout.** PI4 reads the already-built index synchronously. No async injection, no timeout caps, no partial-result returns. If the index is not yet built (zero rows), PI4 returns an empty list immediately. PI0's startup sequence ensures the index is populated before the menu renders.
- **Single stub for search + related.** They ship together because they share the identical KNN + RRF retrieval core; splitting would create >50% implementation overlap (anti-pattern).
- **Fusion params.** RRF k=60 and cosine distance per the vision's locked decision; default result counts (10 for search, 5 for related) are module-level constants in `index.js`, tunable by the implementer within the same PR.
- **`related()` accepts a `kind` option.** To support PI6's section-level similarity check, `related(planSlug, { kind: 'section' })` passes the filter to the vec0 KNN query. This is an additive option; the default (`kind: 'plan'`) preserves the existing behavior for all callers.
- **Inbox surface.** Related-plans renders in the overview panel and the inbox area; the precise panel placement within the tab (top, sidebar, bottom) is a DESIGN decision (Iron Loop Step 6).
- **`index.js` is the public boundary.** `search.js`, `related.js`, and `fusion.js` are internal. PI5 and PI6 import only from `index.js`. All edits to `index.js` are additive — existing PI1 exports remain and the barrel integrity test guards against regressions.
- **Fixture tests are logic tests, not quality tests.** Pre-measured cosine values in the fixture verify fusion arithmetic. Retrieval quality (model embedding effectiveness) is covered by PI2's Ollama-gated smoke test; PI4 does not re-test it.

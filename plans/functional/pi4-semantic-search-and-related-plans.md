---
title: "PI4 — Semantic Search & Related-Plans Surfacing (BM25 + Vector RRF)"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
parent_vision: local-semantic-plan-index
program: ctoc-planning-intelligence
order: 4
depends_on:
  - pi1-index-store-and-schema
  - pi2-embedding-engine
  - pi3-reconciliation-sync
acceptance_criteria_count: 8
risk_level: MEDIUM
gate_status: "Pending Approval (Gate 1: functional → implementation)"
files:
  - "src/lib/plan-index/search.js"
  - "src/lib/plan-index/related.js"
  - "src/lib/plan-index/fusion.js"
  - "src/lib/plan-index/index.js"
  - "src/commands/menu.js"
  - "src/tabs/overview.js"
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
- **Deliverable:** Hybrid BM25+vector search with RRF k=60 fusion, exposed as a search entry in the menu and a related-plans panel in the overview/Inbox tab

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
  When I submit the exact query "parseYAMLShallow"
  Then that plan appears in the top-3 results
  And the result is retrieved via the FTS5/BM25 path even if its dense vector rank is low

- [ ] **Scenario: RRF fusion (k=60) beats lexical-only on the labeled fixture set**
  Given the fixture set (5 labeled natural-language query → expected-plan pairs) is indexed
  When Mean Reciprocal Rank is computed for lexical-only and for RRF-fused (k=60) rankings
  Then the RRF-fused MRR is >= the lexical-only MRR across all 5 queries

- [ ] **Scenario: RRF fusion (k=60) beats vector-only on the labeled fixture set**
  Given the same fixture set
  When Mean Reciprocal Rank is computed for vector-only and for RRF-fused (k=60) rankings
  Then the RRF-fused MRR is >= the vector-only MRR across all 5 queries

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
  Then the result is an empty list and the menu shows an "index building" state indicator
  And no crash or unhandled exception occurs

- [ ] **Scenario: Search and related-plans never block the menu render**
  Given the menu is rendering the overview tab
  When related-plans is triggered for the currently open plan
  Then the tab renders immediately without waiting for retrieval to complete
  And retrieval results are injected asynchronously once available, within 500ms on a warm index

## Non-Functional Requirements

- **Cross-platform:** `fusion.js`, `search.js`, and `related.js` are platform-agnostic. Platform differences (sqlite-vec binary, embedding engine) are isolated in PI1 and PI2. PI4 code runs identically on macOS arm64, macOS x64, Linux x64, Linux arm64, and Windows x64.
- **Async non-blocking:** All retrieval calls are async. No synchronous wait on embedding or KNN query is permitted in the menu render path.
- **Graceful empty-index no-op:** Zero-row store returns an empty list and the "index building" indicator on any query. No special PI3 sync status is required to determine this state; a zero-row count is sufficient.
- **Result count:** Default top-10 for search, top-5 for related-plans. Both limits are module-level constants in `index.js`, not magic numbers scattered across callers.
- **Timeout:** Cap retrieval at 500ms wall-clock. On timeout, return whatever partial results are available. Never hang.

## Scope

### In Scope
- `fusion.js`: RRF k=60 implementation — takes a BM25-ranked list and a KNN-ranked list, returns a single fused list ordered by descending RRF score; cosine distance as the similarity metric
- `search.js`: drives FTS5 query and vec0 KNN query via PI1's store interface, calls `fusion.js`, returns the ranked plan list; handles the 500ms timeout
- `related.js`: seeds retrieval from a given plan's stored summary vector and extracted lexical terms; delegates to `search.js`; filters self from results
- `index.js`: public API module exporting `search(query, options)` and `related(planSlug, options)` — the interface PI5 and PI6 consume; internal modules (`search.js`, `related.js`, `fusion.js`) are not imported directly by callers outside this package
- `menu.js`: adds a "Search plans" entry to the CTOC menu that accepts a query string and renders ranked results
- `overview.js`: renders a "Related Plans" panel in the overview/Inbox tab, populated by `related()` for the currently selected plan
- `tests/plan-index-search.test.js`: fixture-based tests covering all 8 BDD scenarios above, including the falsifiable RRF-beats-halves MRR test

### Out of Scope
- Write-time duplicate warning on plan creation — covered in PI5
- Conflict/dependency flagging via `files:` overlap — covered in PI6
- Index store schema, embedding generation, reconciliation sync — covered in PI1, PI2, PI3
- Re-embedding or re-indexing logic — PI4 is read-only against the store
- UI layout decisions beyond functional placement (related panel in overview tab, search entry in menu) — implementation-time DESIGN decision (Iron Loop Step 6)
- Tuning result-count defaults beyond setting the initial constants — product-owner concern post-Gate 1

## Risks

### Technical Risks
- **sqlite-vec binary extension fails to load on an untested platform.** PI4's KNN query depends on the `vec0` table provided by the sqlite-vec extension. Missing or incompatible binary means all KNN queries fail.
  - Likelihood: MEDIUM
  - Impact: HIGH (search and related-plans entirely non-functional; lexical-only fallback still runs)
  - Mitigation: Test binary loading in CI for each target platform tuple (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win-x64) as part of PI1's deliverable. PI4 detects load failure at startup and disables the KNN path gracefully, logging a warning and falling back to lexical-only; this is visible to the user but not a crash.

- **RRF fixture test is statistically fragile on a small query set.** With only 5 labeled queries the MRR advantage may be within noise.
  - Likelihood: LOW
  - Impact: MEDIUM (test passes vacuously; fusion benefit unproven on this data)
  - Mitigation: Design fixture set with ≥10 plans and ≥5 labeled query pairs; record the fixture in `tests/fixtures/plan-index/` as a checked-in artifact so results are reproducible across machines.

### Business Risks
- **Related-plans panel causes perceived latency in the plan view.** Even async rendering produces a layout shift when results arrive.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Render a skeleton placeholder ("Finding related plans...") immediately; inject results on resolution within the 500ms cap. Run a perceived-latency check on a sample menu session before Gate 3.

### Dependency Risks
- **PI1, PI2, PI3 not complete when PI4 development begins.** PI4 has no independent value without the store, embeddings, and sync.
  - Likelihood: MEDIUM (sequential ordering expected)
  - Impact: HIGH (PI4 cannot be integration-tested)
  - Mitigation: Build `fusion.js` first — it is pure logic with no I/O dependency and can be fully covered by unit tests against synthetic ranked lists. Build `search.js` and `related.js` against a mock store interface; swap in PI1's real store at integration time.

## Test Plan

### Fixture Set Specification
A checked-in fixture under `tests/fixtures/plan-index/` (not generated at runtime):
- 10 representative plan summaries across 3 topic clusters (plan state management, auth hooks, quality gates)
- 5 labeled natural-language query → expected top-ranked plan pairs
- 3 labeled exact-token query → expected plan pairs (identifiers, file paths)
- Pre-measured cosine similarities between all pairs, recorded in the fixture JSON for deterministic assertions

This fixture set is also used by PI5 and PI6 tests.

### Falsifiable Retrieval Quality Test (Unit — `tests/plan-index-search.test.js`)

```
Given: fixture plans indexed in an in-memory mock store
For each of the 5 labeled NL query → expected plan pairs:
  score_bm25  = MRR of lexical-only ranking (FTS5 path only)
  score_knn   = MRR of vector-only ranking (KNN path only)
  score_rrf   = MRR of RRF-fused ranking (k=60)

Assert: score_rrf >= score_bm25   (FAILS if fusion does not beat lexical-only)
Assert: score_rrf >= score_knn    (FAILS if fusion does not beat vector-only)
```

This test does NOT pass vacuously. If the fixture set is designed such that one retrieval half always wins, the test must catch that fusion is at least as good as the winner.

### Exact-Token Recall Tests (Unit)
Query each labeled identifier/file-path token; assert target plan in top-3.

### Async Non-Blocking Test (Integration)
Drive menu render with a pending related-plans call; assert tab renders before retrieval resolves.

### Cross-Platform Smoke Test (CI)
`node --test tests/plan-index-search.test.js` on each platform runner; assert 0 failures.

## Rollback

If PI4 causes regressions in the menu or overview tab:
1. Remove the "Search plans" menu entry from `menu.js` (one function call).
2. Remove the "Related Plans" panel from `overview.js` (one section).
3. `index.js` and internal modules can remain on disk; PI5/PI6 must also be disabled if rollback is permanent (they depend on `index.js`).
4. PI1/PI2/PI3 are unaffected; the database remains on disk and is re-activated when PI4 is fixed.
5. No data migration required; rollback is code-only.

## Dependencies

| Dependency | Role | Interface Level |
|---|---|---|
| PI1 (index store + schema) | Provides FTS5 tables and vec0 KNN table; PI4 reads both | Query interface: store's read methods exposed by PI1's module |
| PI2 (embedding engine) | Used by PI1/PI3 to populate vectors; PI4 reads stored vectors only | PI4 does not call PI2 directly |
| PI3 (reconciliation sync) | Keeps the store current; PI4 assumes the store reflects the `.md` filesystem | Precondition only; PI4 has no runtime PI3 dependency |

## Decisions Taken Under Ambiguity

- **Single stub for search + related.** They ship together because they share the identical KNN + RRF retrieval core; splitting would create >50% implementation overlap (anti-pattern).
- **Fusion params.** RRF k=60 and cosine distance per the vision's locked decision; default result counts (10 for search, 5 for related) are module-level constants in `index.js`, tunable by the implementer within the same PR.
- **Inbox surface.** Related-plans renders in the overview/Inbox tab; the precise panel placement within the tab (top, sidebar, bottom) is a DESIGN decision (Iron Loop Step 6).
- **PI4 is read-only.** PI4 contains no write or embed calls; it consumes the store as a read source. This keeps PI4 orthogonal to PI3's sync logic.
- **`index.js` is the public boundary.** `search.js`, `related.js`, and `fusion.js` are internal. PI5 and PI6 import only from `index.js`. This prevents downstream slices from taking a dependency on internal module structure that may change.
- **RRF fixture test uses an in-memory mock store.** The mock avoids cross-platform binary (sqlite-vec) dependency in unit CI. E2E testing against the real store is covered by the cross-platform smoke test.

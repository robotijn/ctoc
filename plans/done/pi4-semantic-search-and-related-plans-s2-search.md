---
approved_by: human
approved_at: 2026-07-08T11:54:28.699Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T10:44:31.361Z
gate_crossed: implementation → todo
---

---
title: "PI4-s2 — Hybrid search (BM25 in-JS index + vector store.search + RRF)"
type: implementation
parent_plan: pi4-semantic-search-and-related-plans
depends_on: pi4-semantic-search-and-related-plans-s1-fusion
priority: HIGH
files:
  - "src/lib/plan-index/search.js"
  - "tests/plan-index-search.test.js"
---

# PI4-s2 — Hybrid search (BM25 in-JS index + vector store.search + RRF)

> Slice 2 of the PI4 decomposition. This is the retrieval core: it builds a
> **pure-JS BM25 inverted index** over the plan corpus (the lexical half), calls
> **`store.search(queryEmbedding, k, opts)`** — PI1's brute-force cosine — for the
> vector half, and fuses the two ranked lists with **s1's `fuseRRF` (k=60)**. It
> owns the parent's `tests/plan-index-search.test.js` fixture suite (the ≥20-query
> falsifiability + ablation tests, the exact-token recall test, the empty-index
> no-op). Depends on s1 (fusion).

## Scope (this slice only)

- **In:** `search.js` — the BM25 inverted index (build + score), the vector call
  through an injected/wired `store` + `embedder`, RRF fusion via s1, and the
  public-shaped `search(query, opts)` function. Plus the parent-named test file
  `tests/plan-index-search.test.js` with the fixture and all falsifiability tests.
- **Out:** `related()` and the `index.js` barrel exposure (s3); UI wiring (s4).
  `search.js` is INTERNAL — s3's barrel re-exports it; callers outside the package
  never import `search.js` directly (parent decision: "`index.js` is the public
  boundary").

## Real dependency signatures (READ FRESH from the shipped code)

- **PI1 store** (`src/lib/plan-index/store.js`, in `done/`):
  - `store.search(queryEmbedding: Float32Array, k: number, opts?: SearchOpts)` →
    `Array<view & { score:number }>`, cosine-desc, ≤ k results. Lock-free.
    `SearchOpts = { kind?: 'plan'|'section', excludePlanPath?: string, minScore?: number }`.
    Each returned `view` has `{ planPath, sectionId, kind, text, files, parentVision,
    stepLabel, contentHash, embedding, score }`.
  - `store.size` (getter) — zero-unit gate for the empty-index no-op.
  - Throws `TypeError` if `queryEmbedding` is not a `Float32Array`; throws on a
    dimension mismatch; returns `[]` for `k<=0` or a zero-norm query. (Confirmed in
    `store.search` source.)
  - `PLAN_SENTINEL === '__plan__'` (exported from store + barrel).
- **PI0 wiring** (`src/lib/plan-index/wiring.js`, in `implementation/`):
  - `getWiring({ projectPath })` → `{ store, embedder, isIndexAvailable(),
    degradedReason(), calibrationReady(), projectPath }`. `store` is a PI1 handle or
    `null` (noop wiring). `embedder(texts: string[])` → `Promise<{ vectors:
    Float32Array[], source }>` — **async**, never rejects (fail-open → `{vectors:[]}`).
- **PI2 embedder** (`src/lib/plan-index/embedder.js`): `embed(texts, deps?)` →
  `Promise<{ vectors, source }>`, L2-normalized, cosine-ready. `search.js` does NOT
  import this directly — it calls the `embedder` handed to it (parent decision: "PI4
  does NOT import PI2 directly; it calls only the pre-wired embedder").

## Implementation Details

### Architecture Decision

**ADR — the one async point, isolated at the boundary.** The parent's
Non-Functional Requirement says "synchronous execution": PI4 reads the
*already-built* index synchronously. The single unavoidable async call is embedding
the *query text* (`embedder` is `Promise`-returning). Decision: `search()` is
`async` and `await`s the embedder exactly once, then does everything else
synchronously (`store.search` is sync; BM25 scoring is sync; `fuseRRF` is sync). The
BM25 index itself is built synchronously from the store's already-loaded units — no
I/O, since PI1 holds unit `text` in memory. This keeps the "read the pre-built index
synchronously" contract while honoring the parent's own **Decision Taken Under
Ambiguity**: "PI4 MUST embed the query text before KNN search … calls it
synchronously to produce the query vector" — i.e. one awaited embedder call, no
timeout caps, no partial returns.

**ADR — BM25 over the in-memory unit corpus.** The lexical half is a pure-JS BM25
inverted index (`k1=1.2`, `b=0.75`, the standard Robertson/Sparck-Jones defaults)
built over the plan-level (`__plan__`) units' `text` fields already resident in the
store. Tokenization: lowercase, split on `/[^a-z0-9]+/` (so identifiers like
`parseYAMLShallow` tokenize predictably and file paths split on `/` and `.`), plus
the raw un-split identifier retained as a token so an exact-identifier query hits
(the parent's Scenario 2 exact-token recall). No stemming, no stopword removal
(corpus is tiny; over-processing hurts exact-token recall). The index is built
per-search from `store` units — acceptable at ~1,720 units (parent: sub-millisecond).

**ADR — dependency injection for hermetic tests.** `search(query, opts)` reads its
`store` + `embedder` from `opts` (injected) or, when absent, from `getWiring()`.
Tests inject a mock store (a real `openStore` on a temp JSON, OR a hand-rolled
`{ search, size, getUnit, listPlanPaths }` stub) and a **stub embedder** that maps a
query string to a pre-measured `Float32Array` from the fixture — so the ≥20-query
falsifiability test is deterministic and hermetic (no Ollama, no live model),
exactly as the parent's Test Plan mandates ("in-memory mock store", "pre-measured
cosine similarities baked into the fixture").

### Dependency Graph

```
src/lib/plan-index/search.js  (CREATE)
   ├── require ── ./fusion         (slice s1: fuseRRF, RRF_K, reciprocalRank)
   ├── require ── ./store          (ONLY for PLAN_SENTINEL constant; NOT openStore)
   ├── uses (injected) ── wiring.getWiring().store  (store.search, store.size)
   ├── uses (injected) ── wiring.getWiring().embedder (async query embed)
   └── tested-by ── tests/plan-index-search.test.js (CREATE) + tests/fixtures/plan-index/*
```
No cycle: `search.js` → `fusion.js` (leaf) and `search.js` → `store.js` (constant
only; `store.js` never imports `search.js`). Chain depth from s1: 1.

### File Specifications

#### File: `src/lib/plan-index/search.js`
**Action:** CREATE
**Purpose:** Hybrid BM25 + vector retrieval fused with RRF; the internal engine
behind the public `search()`.
**Change Type:** new-module

##### Exports
- `search(query, opts?)` → returns `Promise<Array<{ planPath, sectionId, score,
  text, files, ...view }>>`
  - `query: string` — the natural-language or exact-identifier query.
  - `opts?: { store?, embedder?, projectPath?, limit?, kind?, excludePlanPath? }`
    - `store` / `embedder` injected for tests; else resolved via `getWiring({projectPath})`.
    - `limit?: number` — top-N; default `DEFAULT_SEARCH_LIMIT` (10).
    - `kind?: 'plan'|'section'` — passed to `store.search` `opts.kind` (default `'plan'`).
    - `excludePlanPath?: string` — passed to `store.search` `opts.excludePlanPath`
      (used by s3's `related()` for self-exclusion).
  - Behavior:
    1. Empty-index / unavailable guard: if `store` is `null` OR `store.size === 0`
       → return `[]` immediately (no embed call, no throw). (Parent Scenario 7.)
    2. Embed query: `const { vectors } = await embedder([query]);` → `qVec =
       vectors[0]`. If `vectors` is empty (fail-open embedder) → **BM25-only** path:
       skip the vector list, fuse `[bm25List]` alone, and record a visible
       `degraded: 'no-embedding'` notice (parent Technical-Risk mitigation:
       "falls back to BM25-only … a legible degrade, never a crash").
    3. Vector list: `knnList = store.search(qVec, limit, { kind, excludePlanPath })`
       → map each to `{ id: unitId(planPath, sectionId), planPath, sectionId, score }`.
    4. BM25 list: build the inverted index over the store's units (matching `kind` /
       `excludePlanPath`), score `query` tokens, take top-`limit`, map to same shape.
    5. Fuse: `fuseRRF([bm25List, knnList])` (s1) → attach the winning `view` per id.
    6. Return top-`limit` fused results (each carries the store `view` fields).
  - Throws: `TypeError` when `query` is not a string. Does NOT throw on empty
    index, missing embedder result, or zero neighbors — those return `[]` / degrade.

- `DEFAULT_SEARCH_LIMIT` → `number` (10) — parent NFR "Default top-10 for search …
  module-level constants, not magic numbers". (The `related` top-5 constant lives in
  the s3 barrel per the parent; s2 owns only the search default.)

- **Internal (exported for test only, non-enumerable or clearly test-seam):**
  `buildBM25Index(units)`, `scoreBM25(index, queryTokens)`, `tokenize(text)` — so the
  BM25 arithmetic is unit-testable in isolation and the ablation test can drive the
  BM25 half directly with KNN zeroed.

##### Dependencies (imports this file needs)
- `require('./fusion')` — `fuseRRF`, `RRF_K`, `reciprocalRank` (slice s1).
- `require('./store')` — `PLAN_SENTINEL` ONLY (constant). Not `openStore`.
- `require('./wiring')` — `getWiring` (lazy, inside `search`, only when `store`/
  `embedder` not injected) — mirrors how `actions.js` / the sync hook lazy-require it.
- No direct `require('./embedder')` (parent decision).

##### Called By
- `src/lib/plan-index/related.js` (slice s3) — delegates to `search()`.
- `src/lib/plan-index/index.js` barrel (slice s3) — re-exports `search`.
- `tests/plan-index-search.test.js` (this slice).

##### Data Flow
```
query (string), opts{store,embedder,limit,kind,excludePlanPath}
  → guard: store null || store.size===0 ⇒ return []
  → await embedder([query]) ⇒ qVec (or [] ⇒ BM25-only degrade)
  → knnList  = store.search(qVec, limit, {kind, excludePlanPath})  (PI1 cosine)
  → bm25List = scoreBM25(buildBM25Index(units), tokenize(query))   (pure JS)
  → fused    = fuseRRF([bm25List, knnList])                        (slice s1)
  → return fused.slice(0, limit) with store views attached
```

##### Error Handling
- Non-string `query` → `TypeError`. Store `null` / size 0 → `[]`. Embedder
  returning `{vectors:[]}` → BM25-only degrade + `degraded` marker, never throw.
  `store.search` dimension-mismatch throw is not expected (embedder matches store
  dimension); if it ever throws it is caught and the search degrades to BM25-only
  with a warn (fail-open, "never break the menu").

##### Cross-Platform Notes
- Pure JS + `store.search`; no `fs`/`path`/`os` of its own (the store owns all
  filesystem access). Platform-agnostic (parent NFR). Tokenizer regex is ASCII-safe
  and platform-independent.

### Test Plan

#### Tests: `tests/plan-index-search.test.js`
**Action:** CREATE
**Framework:** `node:test`
**Fixtures:** `tests/fixtures/plan-index/` — a checked-in fixture per the parent Test
Plan: ≥10 plan summaries across 3 clusters (plan-state, auth-hooks, quality-gates);
≥20 labeled NL-query → expected-plan pairs split 10 exact-token / 10 paraphrase;
pre-measured query→plan cosine values so the stub embedder + a stub/real store give
deterministic KNN rankings. Build fixtures as a small JSON the test loads (no runtime
generation).

##### Test Cases (the 5 falsifiability tests the parent enumerates)
1. **Scenario 1 — NL query returns intended plan first:** index fixture, query
   "how does CTOC sync plan state?" via `search()` with stub embedder → assert the
   plan-state plan is rank 1 and results are score-desc.
2. **Scenario 2 — exact-token recall via BM25:** fixture plan contains
   `parseYAMLShallow`; fixture's pre-measured cosine for that query→target is LOW
   (below median) so KNN-only does NOT place target in top-3. Assert: KNN-only rank
   of target > 3; BM25-only rank of target === 1; RRF-fused rank of target ≤ 3.
3. **Scenario 3 — RRF MRR strictly beats weaker half AND ≥ mean:** over the ≥20
   labeled pairs compute `score_bm25`, `score_knn`, `score_rrf` (MRR via
   `reciprocalRank`). Assert `score_rrf > min(score_bm25, score_knn)` and
   `score_rrf >= (score_bm25 + score_knn)/2`.
4. **Scenario 4 — ablation changes ordering:** run RRF with KNN zeroed
   (BM25-only) and with BM25 zeroed (KNN-only). Assert full-RRF ordering differs
   from BM25-only on ≥1 query AND from KNN-only on ≥1 query.
5. **Scenario 7 — empty index no-op:** `store.size === 0` (and null-store noop
   wiring) → `search('anything')` resolves to `[]`, no throw, embedder NOT called.
6. **BM25 unit tests:** `tokenize('parseYAMLShallow src/lib/state.js')` yields the
   expected tokens incl. the raw identifier; `scoreBM25` ranks a doc containing the
   query term above one that does not.
7. **Degrade path:** stub embedder returns `{vectors:[]}` → `search()` returns a
   BM25-only ranking with a `degraded` marker, no throw.
8. **Error — non-string query throws `TypeError`.**

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80%. Empty-index branch, degrade branch, and every throw
  path exercised. The ≥20-query set makes Scenario 3/4 non-vacuous (parent risk
  mitigation: 10 lexical-dominant + 10 semantic-dominant queries).

### Security Review (this slice)
- **Input validation:** `query` type-checked; `limit` coerced to a positive int
  (fallback to `DEFAULT_SEARCH_LIMIT`); `kind`/`excludePlanPath` passed only as
  known `SearchOpts` fields. ✓
- **No path traversal / no direct file ops:** `search.js` performs no filesystem
  access; all I/O is inside the PI1 store (audited `safe-fs`). ✓
- **Prototype pollution:** BM25 inverted index and RRF accumulation use `Map`, not
  plain-object keyed by untrusted token/`id`. ✓
- **No secrets, no `execSync`/shell.** ✓
- **Error messages:** name the argument only; no plan-content or path leakage to
  end users. Degrade notice is a fixed string. ✓

### Acceptance Criteria Mapping
| Parent criterion | Implemented in | Test case |
|---|---|---|
| Scenario 1 NL top result | `search()` fuse + `store.search` | test 1 |
| Scenario 2 exact-token via BM25 | `buildBM25Index`/`scoreBM25` + `tokenize` raw-id token | test 2 |
| Scenario 3 MRR beats weaker / ≥ mean | `fuseRRF` + `reciprocalRank` (s1) over fixture | test 3 |
| Scenario 4 ablation | zeroed-retriever runs of `search`/`fuseRRF` | test 4 |
| Scenario 7 empty index no-op | `store.size===0` guard | test 5 |
| NFR degrade to BM25-only | empty-`vectors` branch + `degraded` marker | test 7 |

## Execution Plan

### Step 8: TEST
Create `tests/fixtures/plan-index/` fixture JSON (≥10 plans, ≥20 labeled queries
split 10 lexical / 10 semantic, pre-measured cosines) and write
`tests/plan-index-search.test.js` covering all 8 groups (RED — `search.js` absent).

### Step 9: PREPARE
Confirm slice s1 (`fusion.js`) exists and exports `fuseRRF`/`RRF_K`/`reciprocalRank`
(hard dependency — do not start s2 until s1 is built, per parent dependency order).
Confirm `store.js` exports `PLAN_SENTINEL` and `store.search`/`store.size` shapes
(read fresh — they do). Create `tests/fixtures/plan-index/` dir.

### Step 10: IMPLEMENT
Create `src/lib/plan-index/search.js`: `tokenize`, `buildBM25Index`, `scoreBM25`
(k1=1.2, b=0.75), the injected-store/embedder resolution via `getWiring`, the
empty-index guard, the single awaited embed, the `store.search` KNN call, the
`fuseRRF` fusion, and the BM25-only degrade path. No stubs — full BM25 + full fusion.
Document any judgment call (e.g. exact tokenizer regex) in a `## Decisions Taken
Under Ambiguity` note in this plan file.

### Step 11: REVIEW
Self-review: no import cycle (`search`→`fusion`/`store`-constant only); async
isolated to one embed call; injection seam clean; `DEFAULT_SEARCH_LIMIT` a constant;
matches `plan-index/*.js` house style.

### Step 12: OPTIMIZE
One pass to build the BM25 index, bounded `k` into `store.search` (top-`limit`
only — parent Business-Risk mitigation). No O(N²) over the corpus.

### Step 13: SECURE
Run the slice security checklist: Map-based index (no proto pollution), type-checked
inputs, no direct I/O, fixed degrade string, no secrets.

### Step 14: VERIFY
`node --test tests/plan-index-search.test.js` → `# fail 0`, incl. the ≥20-query
Scenario 3/4 assertions non-vacuous. Coverage ≥ 80% on `search.js`. Then
`node --test tests/*.test.js` → 0 failures.

### Step 15: DOCUMENT
Module header (hybrid BM25+vector+RRF, the one-async-point ADR, BM25 params, DI
seam) + JSDoc on `search`, `buildBM25Index`, `scoreBM25`, `tokenize`.

### Step 16: FINAL-REVIEW
Confirm: 2 files (+ fixtures dir); `search.js` is internal (no barrel edit here —
that is s3); all 6 mapped parent criteria have passing tests; degrade path proven;
`store.search` called with the real 3-arg signature.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — module-not-found on `search.js`, confirmed RED

### Step 9: PREPARE
- [x] Install dependencies if needed — none (pure JS, node:test)
- [x] Check prerequisites — s1 `fusion.js` exports `fuseRRF`/`RRF_K`/`reciprocalRank`; store exports `PLAN_SENTINEL` + `search(qVec,k,opts)`/`size` (read fresh)
- [x] Verify dev environment ready
- [x] Create directories/config if needed — `tests/fixtures/plan-index/` created; `search-fixture.json` checked in

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — full BM25 (k1=1.2,b=0.75) + KNN via `store.search` + `fuseRRF`; no stubs
- [x] Add error handling — non-string query throws `TypeError`; empty/null store → `[]`; empty embedder → `no-embedding` degrade; store.search throw → `vector-error` degrade
- [x] Wire up integration points — s1 `fuseRRF`, store `PLAN_SENTINEL`, lazy `getWiring`

### Step 11: REVIEW
- [x] Self-review all new code — no import cycle (search→fusion leaf, search→store constant only); async isolated to one `await embedder([query])`; DI seam clean; `DEFAULT_SEARCH_LIMIT`/`BM25_K1`/`BM25_B` named constants
- [x] Verify integration points work together — enumerates the store via the REAL PI1 surface (`listPlanPaths`+`getUnit`), calls `store.search` with the real 3-arg signature
- [x] Check error handling completeness — every throw/degrade branch exercised by a test

### Step 12: OPTIMIZE
- [x] Remove redundant operations — one BM25 build per search; KNN bounded to `limit`
- [x] Optimize critical paths — no O(N²); Map accumulators
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — `query` type-checked; `limit` coerced to positive int; `kind`/`excludePlanPath` passed only as known SearchOpts fields
- [x] Sanitize outputs — degrade marker is a fixed string; error names the arg only
- [x] No secrets in code
- [x] Safe file operations — search.js does no fs/path/os; all I/O inside the PI1 store; BM25 index + RRF use Map (proto-pollution-safe)

### Step 14: VERIFY
- [x] Run lint + type check — `eslint . --max-warnings 0` exit 0; `tsc --noEmit` baseline-neutral (89 errors, 0 in search.js)
- [x] Run ALL tests (TDD Green) — `node --test tests/plan-index-search.test.js` 22/22 pass; `node --test tests/*.test.js` 3025 pass, # fail 0
- [x] Check coverage >= 80% — search.js line 99.39%, branch 84.96%, funcs 100%
- [x] 0 skipped, 0 flaky tests — 0 skipped, deterministic (pre-measured fixture vectors)

### Step 15: DOCUMENT
- [x] Update relevant documentation — module header (ADRs: one-async-point, BM25 params, degrade path, DI seam)
- [x] Add JSDoc comments to new functions — `search`, `tokenize`, `buildBM25Index`, `scoreBM25`, `collectUnits`, `normalizeLimit`
- [x] Update CHANGELOG if needed — n/a (versioned via release.js at commit)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — ablation proven non-vacuous (hybrid strictly beats BM25-only on 6/10 paraphrase queries, incl. cases BM25 misses entirely)
- [x] Ready for human review — 2 files + fixture; search.js is INTERNAL (no barrel edit — that is s3)

## Decisions Taken Under Ambiguity

- **Tokenizer regex + raw-identifier retention.** Lowercase, split on `/[^a-z0-9]+/`
  (so `src/lib/state.js` → `src`,`lib`,`state`,`js` and `parseYAMLShallow` →
  `parseyamlshallow`), and ADDITIONALLY retain each *compound* (non-simple)
  whitespace-delimited raw token lowercased (e.g. `src/lib/state.js`) so a query
  that repeats a slash/dot-joined identifier verbatim still hits. A bare simple word
  is NOT re-added (avoids double-counting its term frequency). No stemming, no
  stopword removal — the corpus is tiny and over-processing hurts exact-token recall
  (parent Scenario 2). Documented per the No-stub rule.
- **BM25 IDF variant.** Classic Robertson probabilistic IDF `log(1 + (N−n+0.5)/(n+0.5))`
  clamped at ≥ 0 so a term present in > half the corpus never contributes a negative
  weight (which would corrupt the RRF input ordering). k1=1.2, b=0.75 as specified.
- **Store enumeration via the public PI1 surface, not a private seam.** The BM25
  corpus is built by enumerating `store.listPlanPaths()` + `store.getUnit(planPath,
  '__plan__')` (and `listUnitSectionIds` for `kind:'section'`) — the real shipped
  handle methods — rather than reaching into store internals. A store missing those
  methods degrades to a KNN-only result (defensive `collectUnits` guard), never a
  throw.
- **Degrade marker delivery.** The `degraded` marker (`'no-embedding'` |
  `'vector-error'`) is attached as a NON-enumerable property on the returned array,
  so callers/JSON serialization of the results array are unaffected while a caller
  that checks `results.degraded` sees the legible degrade reason.
- **`kind:'section'` composite id.** Section-level results use `"${planPath}
  ${sectionId}"` as the RRF/BM25 id (space-joined) — distinct from the plan-level id
  which is the bare `planPath`; both map back to a view via `viewById`.

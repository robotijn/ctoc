---
title: "PI4-s1 — RRF Fusion (k=60) core"
type: implementation
parent_plan: pi4-semantic-search-and-related-plans
depends_on: none
priority: HIGH
files:
  - "src/lib/plan-index/fusion.js"
  - "tests/plan-index-fusion.test.js"
---

# PI4-s1 — RRF Fusion (k=60) core

> Slice 1 of the PI4 decomposition. **Pure logic, zero I/O, zero store/embedder
> dependency** — this is the slice the parent's Dependency-Risk mitigation names
> as "build first": it can be fully unit-tested against synthetic ranked lists
> before PI0's composition root exists. It fuses two already-ranked lists via
> Reciprocal Rank Fusion (k=60). It is index-agnostic: it does not know or care
> whether a list came from BM25 or from `store.search` brute-force cosine.

## Scope (this slice only)

- **In:** `fusion.js` — the RRF k=60 fuser + the MRR helper the falsifiability
  test needs, both pure functions over plain arrays. Its own test file.
- **Out:** BM25 (s2), vector `store.search` call (s2), `related()` + barrel (s3),
  UI wiring (s4). This slice produces NO retrieval — only the fusion arithmetic
  that s2 will call.

## Implementation Details

### Architecture Decision

**RRF over score-normalization (locked upstream).** The vision locked RRF k=60 as
the fusion method. RRF fuses by *rank position*, not by raw score, so it needs no
cross-scale normalization between BM25's unbounded term-frequency scores and
cosine's `[-1, 1]` — this is exactly why it is index-agnostic. `rrf_score(d) =
Σ_lists 1/(k + rank_list(d))` with `k = 60` (the canonical Cormack et al. 2009
constant) and `rank` 1-based. A document absent from a list contributes nothing
from that list (it is not treated as rank ∞ with a tiny epsilon; it simply adds no
term) — this is what makes the ablation test meaningful: zeroing one retriever
removes its contribution entirely and changes the ordering.

### Dependency Graph

```
src/lib/plan-index/fusion.js   (CREATE) — no imports beyond nothing; pure JS
        └── tested-by ──> tests/plan-index-fusion.test.js  (CREATE)
```

No dependency on `store.js`, `wiring.js`, `embedder.js`, or any sibling slice.
This is a leaf; every other PI4 slice depends transitively on it.

### File Specifications

#### File: `src/lib/plan-index/fusion.js`
**Action:** CREATE
**Purpose:** Reciprocal Rank Fusion of N ranked lists into one fused ranking, plus
the MRR metric used by the falsifiability test.
**Change Type:** new-module

##### Exports

- `RRF_K` → `number` (constant `60`)
  - The canonical RRF damping constant. Exported (not inlined) so the test and s2
    reference one source of truth (parent decision: "module-level constants, not
    magic numbers").

- `fuseRRF(rankedLists, opts?)` → returns `Array<{ id: string, score: number }>`
  - `rankedLists: Array<Array<{ id: string }>>` — each inner array is ONE
    retriever's result, already ordered best-first. Element shape needs only an
    `id`; any extra fields (e.g. `score`, `planPath`) are ignored by the fuser.
  - `opts?: { k?: number }` — RRF constant; defaults to `RRF_K` (60).
  - Returns the union of all ids, each with its summed RRF score, ordered by
    descending `score`. Ties are broken deterministically by ascending `id`
    (string compare) so the ordering is stable and test-assertable.
  - Rank is 1-based *per list* (first element → rank 1). A document appearing in
    multiple lists sums `1/(k+rank)` across those lists.
  - Throws: `TypeError` when `rankedLists` is not an array, or any inner element
    is not an array, or any item lacks a string `id`.
  - Example:
    `fuseRRF([[{id:'A'},{id:'B'}], [{id:'B'},{id:'C'}]])`
    → A: `1/61`, B: `1/62 + 1/61`, C: `1/62`
    → ordered `[{id:'B',...},{id:'A',...},{id:'C',...}]`.

- `reciprocalRank(ranking, expectedId)` → returns `number`
  - `ranking: Array<{ id: string }>` ordered best-first; `expectedId: string`.
  - Returns `1/rank` (1-based) of the first element whose `id === expectedId`, or
    `0` when absent. This is the per-query reciprocal rank; the test averages it
    across the ≥20-query set to get MRR for each of `score_bm25`, `score_knn`,
    `score_rrf`.
  - Throws: `TypeError` when `ranking` is not an array or `expectedId` is not a
    non-empty string.

##### Dependencies (imports this file needs)
- none — pure JS. No `require` at all (or only `'use strict'`).

##### Called By
- `src/lib/plan-index/search.js` (slice s2) — fuses the BM25 list and the vector
  (`store.search`) list.
- `tests/plan-index-fusion.test.js` (this slice) and
  `tests/plan-index-search.test.js` (parent's suite, slice s2) — the MRR +
  ablation assertions.

##### Data Flow
```
Input: [bm25List, knnList]  (each Array<{id,...}>, best-first)
  → for each list, for each item at index i:  acc[id] += 1/(k + (i+1))
  → materialize [{id, score}], sort by score desc, tie-break id asc
  → return fused ranking
```

##### Error Handling
- Non-array `rankedLists` / inner non-array / item without string `id` → throw
  `TypeError` (a caller bug — fail loud, not silent). Empty outer array `[]` and
  empty inner arrays are VALID (return `[]`), matching the parent's empty-index
  graceful-no-op scenario: s2 passes two empty lists and gets an empty fused list.

##### Cross-Platform Notes
- Pure arithmetic — no `fs`, no `path`, no `os`. Runs identically on all platforms
  (parent Non-Functional Requirement: `fusion.js` is platform-agnostic pure JS).

### Test Plan

#### Tests: `tests/plan-index-fusion.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`)

##### Test Cases
1. **Happy path — two overlapping lists fuse correctly:** a document in both lists
   outranks documents in one. Input `[[{id:'A'},{id:'B'}],[{id:'B'},{id:'C'}]]` →
   assert order `['B','A','C']` and assert B's score `=== 1/61 + 1/62` (exact
   arithmetic against the pre-measured constant, `assert.ok(Math.abs(diff) < 1e-12)`).
2. **k is honored:** `fuseRRF(lists, { k: 1 })` differs numerically from default
   `k=60`; assert B's score uses `k=1` (`1/2 + 1/3`).
3. **Tie-break is deterministic:** two ids with identical summed score come out in
   ascending-`id` order; assert stable ordering across two calls.
4. **Absent-from-a-list contributes nothing (ablation primitive):** fusing
   `[listA, []]` equals fusing `[listA]` — a zeroed/empty retriever adds no term.
   This is the unit-level guarantee the parent's Scenario-4 ablation relies on.
5. **Empty input — graceful:** `fuseRRF([])` → `[]`; `fuseRRF([[],[]])` → `[]`. No
   throw (parent empty-index scenario primitive).
6. **`reciprocalRank` happy path:** expected id at rank 3 → `1/3`; absent → `0`;
   at rank 1 → `1`.
7. **Error — bad input throws:** `fuseRRF('x')`, `fuseRRF([{id:'A'}])` (inner not
   an array), `fuseRRF([[{}]])` (item without id) each throw `TypeError`;
   `reciprocalRank(null,'A')` and `reciprocalRank([], '')` throw `TypeError`.
8. **MRR composition (mini falsifiability):** build 3 tiny synthetic queries with
   hand-computed expected reciprocal ranks; assert the averaged MRR of an RRF-fused
   ranking `>= (mrr_listA + mrr_listB)/2` on this synthetic set — the same
   assertion the parent's full ≥20-query test makes, exercised in miniature here so
   the arithmetic is proven at the unit level before s2 wires real retrievers.

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80%. Every throw path (case 7) exercised; empty-input
  branch (case 5) exercised; tie-break branch (case 3) exercised.

### Security Review (this slice)
- **Input validation:** `fuseRRF`/`reciprocalRank` type-check arguments before use;
  bad input throws `TypeError` (no silent coercion). ✓
- **No path traversal / no file ops:** pure logic, touches no filesystem. ✓ (N/A)
- **No secrets, no `execSync`, no prototype pollution:** the accumulator is a
  `Map` (not a plain object literal keyed by untrusted `id`), so an `id` of
  `"__proto__"` cannot pollute a prototype. ✓
- **Error messages:** reference the argument name only, leak no internal state. ✓

### Acceptance Criteria Mapping (parent criteria this slice underpins)
| Parent criterion | This slice provides |
|---|---|
| "results ordered by descending fused BM25+vector score" | `fuseRRF` sort-desc + deterministic tie-break |
| Scenario 3 — "RRF MRR strictly beats weaker half / ≥ mean" | `reciprocalRank` (MRR building block) + case 8 mini-proof |
| Scenario 4 — "disabling either retriever changes ranking" | case 4 (absent-list-adds-nothing) — the ablation primitive |
| Scenario 6/7 — empty index → empty list, no throw | case 5 (empty inputs return `[]`) |

## Execution Plan

### Step 8: TEST
Write `tests/plan-index-fusion.test.js` with all 8 test-case groups above (RED —
`fusion.js` does not exist yet, tests fail on import).

### Step 9: PREPARE
Confirm `src/lib/plan-index/` exists (it does). No new dirs, no deps to install —
`node:test` is built in. Confirm no `fusion.js` present (clean CREATE).

### Step 10: IMPLEMENT
Create `src/lib/plan-index/fusion.js` exporting `RRF_K`, `fuseRRF`,
`reciprocalRank` per the File Specification. Use a `Map` accumulator (prototype-safe).
No stubs — implement full arithmetic and full input validation.

### Step 11: REVIEW
Self-review: dependency direction (leaf, no imports); tie-break determinism; `k`
plumbed through `opts`; error paths present; matches existing `plan-index/*.js`
module style (`'use strict'`, JSDoc, `module.exports` at bottom).

### Step 12: OPTIMIZE
Single O(N) pass to accumulate, one sort. No redundant list copies. Confirm no
accidental O(N²).

### Step 13: SECURE
Run the slice security checklist above: Map accumulator (no proto pollution),
type-checked inputs, no I/O, no secrets.

### Step 14: VERIFY
`node --test tests/plan-index-fusion.test.js` → `# fail 0`. Coverage ≥ 80% on
`fusion.js`. Then `node --test tests/*.test.js` → 0 failures (no regressions).

### Step 15: DOCUMENT
Module header comment (RRF definition, k=60 rationale, index-agnostic note) + JSDoc
on all three exports (already specified). No external docs.

### Step 16: FINAL-REVIEW
Confirm: 2 files only; all parent criteria in the mapping have a test; empty-input
no-op holds; RRF constant is the single exported source of truth s2 will import.

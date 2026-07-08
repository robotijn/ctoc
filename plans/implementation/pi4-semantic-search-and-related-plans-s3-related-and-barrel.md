---
title: "PI4-s3 — related() surfacing + index.js public barrel"
type: implementation
parent_plan: pi4-semantic-search-and-related-plans
depends_on: pi4-semantic-search-and-related-plans-s2-search
priority: HIGH
files:
  - "src/lib/plan-index/related.js"
  - "src/lib/plan-index/index.js"
  - "tests/plan-index-related.test.js"
---

# PI4-s3 — related() surfacing + index.js public barrel

> Slice 3 of the PI4 decomposition. Builds **`related(planSlug, opts)`** —
> nearest-neighbor plan surfacing seeded from a plan's stored `__plan__` embedding,
> delegating to s2's `search()`, self-excluded via `store.search`'s
> `excludePlanPath`. Then makes `search` + `related` the **public boundary** by
> additively extending the PI1 `index.js` barrel — every existing PI1/PI0 export
> must still resolve (the parent's Barrel Integrity test). Depends on s2.

## Scope (this slice only)

- **In:** `related.js` (new module), the **additive** edit to `index.js` (expose
  `search`, `related`, and the `DEFAULT_RELATED_LIMIT` constant), and the combined
  test `tests/plan-index-related.test.js` (related-plans scenarios + the barrel
  integrity test).
- **Out:** UI wiring into menu/overview/inbox (s4). This slice makes the API
  callable through the barrel; it does not render anything.

## Real dependency signatures (READ FRESH)

- **s2 `search.js`:** `search(query, opts?) → Promise<Array<{planPath, sectionId,
  score, text, files, ...}>>`; `opts` accepts `{ store, embedder, projectPath, limit,
  kind, excludePlanPath }`. Internal — reached here via direct `require('./search')`.
- **PI1 store:** `store.getUnit(planPath, sectionId) → view|null` (view carries
  `embedding: Float32Array`, `text`, `files`); `store.search(qVec, k, {kind,
  excludePlanPath, minScore})`; `PLAN_SENTINEL === '__plan__'`. `store.size` getter.
- **PI0 wiring:** `getWiring({projectPath}) → { store, embedder, ... }` (store may be
  `null`). `related` resolves store/embedder the same injected-or-wired way as s2.
- **Current `index.js` barrel** (READ FRESH — `src/lib/plan-index/index.js`):
  eagerly exports `{ openStore, PLAN_SENTINEL }`, then defines LAZY GETTERS via
  `Object.defineProperties` for `getWiring`, `probeEmbeddingSource`,
  `kickBackfillBackground`, `isBackfillNeeded` (each a fail-open `try/catch require`).
  **The PI4 edit MUST preserve all six of these** and add `search`/`related` in the
  same additive, cycle-safe style.

## Implementation Details

### Architecture Decision

**ADR — `related()` seeds from the stored plan vector, not a re-embed.** A plan is
already indexed as its `__plan__` unit with a stored `embedding`. `related(planSlug)`
looks up `store.getUnit(resolvedPlanPath, PLAN_SENTINEL)`; if present, it uses that
unit's stored `embedding` directly as the query vector for `store.search(vec, k+?,
{ excludePlanPath: resolvedPlanPath, kind })` — NO embedder call in the common path
(the plan is already embedded). This honors "PI4 reads the already-built index" and
avoids a redundant async embed. If the plan-level unit is absent (not yet indexed),
`related` degrades to `search(planTitleOrSlugText, { excludePlanPath })` — a
text-seeded fallback that DOES embed, so a freshly-created not-yet-indexed plan still
surfaces neighbors rather than returning empty. Self-exclusion is `store.search`'s
`excludePlanPath` (parent decision), guaranteeing the seed plan never appears in its
own related list (Scenario 5).

**ADR — `kind` passthrough for PI6.** `related(planSlug, { kind: 'section' })` passes
`kind` straight into `store.search` `opts.kind`, restricting the cosine scan to
section-level units — the additive hook PI6 needs. Default `kind: 'plan'` preserves
current behavior (parent decision).

**ADR — additive barrel, cycle-safe.** `search.js`/`related.js` are eager,
side-effect-free requires (they do not require the barrel back), so `index.js` can
require them eagerly at top — UNLIKE `wiring`/`bootstrap`, which the barrel keeps as
lazy getters because they require the barrel back. To be maximally safe and match the
established pattern, expose `search`/`related` as the SAME kind of fail-open lazy
getter used for `getWiring` (`get() { try { return require('./related').related; }
catch { return undefined; } }`). This guarantees a broken PI4 module can never break
the barrel for existing PI1/PI0 consumers — the Barrel Integrity invariant.

### Dependency Graph

```
src/lib/plan-index/related.js  (CREATE)
   ├── require ── ./search   (slice s2: search)
   ├── require ── ./store    (PLAN_SENTINEL constant)
   └── uses (injected) ── getWiring().store (getUnit, search, size)

src/lib/plan-index/index.js    (MODIFY, additive)
   ├── (unchanged) openStore, PLAN_SENTINEL, getWiring, probeEmbeddingSource,
   │               kickBackfillBackground, isBackfillNeeded
   └── (added, lazy fail-open getters) search → ./search, related → ./related

tests/plan-index-related.test.js  (CREATE) tests related.js + barrel integrity
```
No cycle: `related → search → fusion/store-constant`; barrel → `search`/`related`
via lazy getter (never eager into a cycle). Chain depth from s1: s1→s2→s3 = 2 (≤ 3 ✓).

### File Specifications

#### File: `src/lib/plan-index/related.js`
**Action:** CREATE
**Purpose:** Surface a plan's nearest-neighbor plans (self-excluded), seeded from
its stored plan-level embedding.
**Change Type:** new-module

##### Exports
- `related(planSlug, opts?)` → returns `Promise<Array<{ planPath, sectionId, score,
  text, files, ... }>>`
  - `planSlug: string` — the plan identifier used as the store `planPath` key.
    (Parent Decision D9: `planPath` is an opaque key; the caller must key
    consistently with how PI3 upserts. `related` normalizes/passes it through as-is;
    the resolution rule is documented here, not re-invented.)
  - `opts?: { store?, embedder?, projectPath?, limit?, kind? }`
    - `limit?: number` — default `DEFAULT_RELATED_LIMIT` (5) (parent NFR "top-5 for
      related-plans").
    - `kind?: 'plan'|'section'` — default `'plan'`; passed to `store.search`.
  - Behavior:
    1. Guard: store `null` OR `store.size === 0` → `[]` (Scenario 6/7).
    2. Look up seed: `seed = store.getUnit(planSlug, PLAN_SENTINEL)`.
    3. If `seed` present → `store.search(seed.embedding, limit, { kind,
       excludePlanPath: planSlug })` → return score-desc, self already excluded.
    4. If `seed` absent → delegate to s2 `search(seedText, { store, embedder, limit,
       kind, excludePlanPath: planSlug })` where `seedText` is the slug/title text
       (embed fallback for a not-yet-indexed plan).
    5. Single-plan index (only the seed unit exists) → `store.search` with
       `excludePlanPath` returns `[]` (Scenario 6 — empty, no throw).
  - Throws: `TypeError` when `planSlug` is not a non-empty string. Never throws on
    absent neighbors / empty index (returns `[]`).

- `DEFAULT_RELATED_LIMIT` → `number` (5) — parent NFR module-level constant.

##### Dependencies
- `require('./search')` — `search` (slice s2) for the text-seeded fallback.
- `require('./store')` — `PLAN_SENTINEL`.
- `require('./wiring')` — `getWiring` (lazy, only when store/embedder not injected).

##### Called By
- `src/lib/plan-index/index.js` barrel (this slice) — re-exports `related`.
- `src/tabs/overview.js` + `src/areas/inbox.js` (slice s4) — via the barrel.
- `tests/plan-index-related.test.js` (this slice).

##### Data Flow
```
planSlug, opts{store,limit,kind}
  → guard store null || size 0 ⇒ []
  → seed = store.getUnit(planSlug, '__plan__')
  → seed ? store.search(seed.embedding, limit, {kind, excludePlanPath: planSlug})
         : search(seedText, {store, embedder, limit, kind, excludePlanPath: planSlug})
  → return score-desc (self already excluded)
```

##### Error Handling
- Non-string/empty `planSlug` → `TypeError`. Store null / size 0 / no neighbors →
  `[]`. Never throws into a caller (feeds the overview/inbox render, which must not
  crash — "the measure is the human").

##### Cross-Platform Notes
- Pure JS delegating to the store; no `fs`/`path`/`os`. Platform-agnostic.

#### File: `src/lib/plan-index/index.js`
**Action:** MODIFY (additive only)
**Purpose:** Extend the public barrel so PI4/PI5/PI6 consume `search` + `related`
through the single `index.js` surface.
**Change Type:** modify-existing

##### Changes
- **Add** two entries inside the existing `Object.defineProperties(module.exports, {
  … })` block (after `isBackfillNeeded`), each a fail-open lazy getter matching the
  established pattern:
  - `search: { enumerable:true, configurable:true, get() { try { return
    require('./search').search; } catch { return undefined; } } }`
  - `related: { enumerable:true, configurable:true, get() { try { return
    require('./related').related; } catch { return undefined; } } }`
- **Do NOT touch** the eager `module.exports = { openStore, PLAN_SENTINEL }` line or
  any of the four existing lazy getters. The require argument stays a STRING LITERAL
  (no non-literal-require, matching the file's own note).
- **Optionally** also expose the limit constants if PI5/PI6 need them; default is to
  keep them internal to `search.js`/`related.js` (parent: constants live in the
  modules) — do not add unless a consumer requires them.

##### Called By
- Everything that imports `require('src/lib/plan-index')` — PI5 (duplicate guard),
  PI6 (conflict detection), and s4's UI wiring.

##### Error Handling
- The lazy getters are fail-open (`try/catch` → `undefined`) so a broken `search.js`
  / `related.js` can never break the barrel for existing consumers (the parent's
  explicit Barrel Integrity guarantee).

##### Cross-Platform Notes
- No new I/O; string-literal requires; identical on all platforms.

### Test Plan

#### Tests: `tests/plan-index-related.test.js`
**Action:** CREATE
**Framework:** `node:test`
**Fixtures:** reuse `tests/fixtures/plan-index/` from s2 (or a small inline store
built with a stubbed embedding set); a real `openStore` on a temp JSON is the
cleanest hermetic store here.

##### Test Cases
1. **Scenario 5 — related excludes self, score-desc:** index the PI4 plan alongside
   siblings; `related('pi4-semantic-search-and-related-plans')` → result does NOT
   contain that slug; scores strictly descending.
2. **Scenario 6 — no neighbors → empty:** index a single plan; `related(thatSlug)`
   → `[]`, no throw.
3. **Scenario 7 — empty index → empty:** `store.size === 0` (and null-store noop
   wiring) → `related('x')` → `[]`, no throw.
4. **Seed present uses stored vector (no re-embed):** inject an embedder spy;
   `related` on an INDEXED plan must NOT call the embedder (uses `getUnit`'s stored
   embedding). Assert spy call count === 0.
5. **Seed absent → text-seeded fallback embeds:** `related` on a slug with no
   `__plan__` unit calls `search()` (embedder spy called once); returns neighbors.
6. **`kind: 'section'` passthrough:** `related(slug, { kind: 'section' })` results
   contain only `kind === 'section'` units (PI6 hook).
7. **Barrel Integrity (parent's named test):**
   - `require('../src/lib/plan-index')` — assert `.openStore` is a function,
     `.PLAN_SENTINEL === '__plan__'`, `.getWiring` is a function,
     `.probeEmbeddingSource` is a function, `.kickBackfillBackground` and
     `.isBackfillNeeded` resolve (function or undefined per fail-open) — i.e. every
     pre-PI4 export still resolves.
   - Assert `.search` is a function and `.related` is a function.
   - Assert requiring the barrel emits NO circular-dependency warning (spy on
     `process.emitWarning` or assert exports are defined, not `undefined`).
8. **Error — non-string `planSlug` throws `TypeError`.**

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80% on `related.js`. Seed-present vs seed-absent branches,
  empty-index branch, and the throw path all exercised. Barrel test asserts the full
  export set.

### Security Review (this slice)
- **Input validation:** `planSlug` type/empty-checked; `limit` coerced positive int;
  `kind` constrained to the `SearchOpts` enum by passthrough. ✓
- **No path traversal:** `planSlug` is an opaque store KEY, never a filesystem path
  in this module — no `fs` here (D9). ✓
- **Prototype pollution:** delegates to `store.search` (Map-based) and s2 (Map-based);
  no untrusted-key object writes. ✓
- **Barrel safety:** additive lazy getters are fail-open; a broken submodule cannot
  break existing consumers or leak internals. ✓
- **No secrets, no shell, error messages name the argument only.** ✓

### Acceptance Criteria Mapping
| Parent criterion | Implemented in | Test case |
|---|---|---|
| Scenario 5 excludes self, score-desc | `store.search excludePlanPath` seed path | test 1 |
| Scenario 6 no neighbors → empty | single-plan `excludePlanPath` → `[]` | test 2 |
| Scenario 7 empty index no-op | `store.size===0` guard | test 3 |
| Barrel Integrity (all PI1 exports resolve + search/related) | additive lazy getters | test 7 |
| `kind` passthrough for PI6 | `opts.kind` → `store.search` | test 6 |

## Execution Plan

### Step 8: TEST
Write `tests/plan-index-related.test.js` covering all 8 groups incl. the Barrel
Integrity test that asserts every pre-PI4 export still resolves (RED — `related.js`
absent and barrel not yet extended).

### Step 9: PREPARE
Confirm slice s2 (`search.js`) exists and exports `search` (hard dependency). READ
`index.js` fresh and record the exact six existing exports the additive edit must
preserve. Confirm `store.getUnit`/`PLAN_SENTINEL` shapes (read fresh — they hold).

### Step 10: IMPLEMENT
Create `related.js` (seed-from-stored-vector path + text-seeded fallback +
self-exclude + `kind` passthrough + `DEFAULT_RELATED_LIMIT`). Additively edit
`index.js`: add the two fail-open lazy getters for `search`/`related` inside the
existing `Object.defineProperties` block; touch nothing else. No stubs.

### Step 11: REVIEW
Self-review: barrel edit is additive (diff shows only 2 getters added); no import
cycle (`related`→`search`; barrel→`related` lazily); seed-vs-fallback branch correct;
`excludePlanPath` always set to the seed slug; house style matched.

### Step 12: OPTIMIZE
Common path avoids a redundant embed by reusing the stored `__plan__` vector. Bounded
`limit` into `store.search` (top-5). No extra store scans.

### Step 13: SECURE
Run the slice security checklist: opaque-key handling (no path traversal), Map-based
delegation (no proto pollution), fail-open additive barrel.

### Step 14: VERIFY
`node --test tests/plan-index-related.test.js` → `# fail 0`, incl. Barrel Integrity.
Then `node --test tests/*.test.js` → 0 failures (proves the additive barrel edit
broke NO existing PI1/PI0/PI3 test). Coverage ≥ 80% on `related.js`.

### Step 15: DOCUMENT
`related.js` header (seed-from-stored-vector ADR, `kind` passthrough, self-exclude)
+ JSDoc on `related`. Add a one-line comment at the two new barrel getters noting
they are the PI4 public surface and are fail-open like the PI0 getters.

### Step 16: FINAL-REVIEW
Confirm: 3 files (related CREATE, index.js additive MODIFY, test CREATE); every
pre-PI4 barrel export still a function/constant; `search`/`related` reachable via the
barrel; self-exclusion and empty-index no-op proven; PI5/PI6 can now
`require('src/lib/plan-index').search|related`.

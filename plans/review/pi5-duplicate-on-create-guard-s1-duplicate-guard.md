---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T12:36:24.574Z
gate_crossed: implementation → todo
---

---
title: "PI5-s1 — duplicate-guard module (checkDuplicate over PI4 search)"
type: implementation
parent_plan: pi5-duplicate-on-create-guard
depends_on: none
priority: MEDIUM
iron_loop: true
files:
  - "src/lib/plan-index/duplicate-guard.js"
  - "tests/plan-index-duplicate-guard.test.js"
---

# PI5-s1 — duplicate-guard module (`checkDuplicate` over PI4 `search`)

> Slice 1 of 2 of the PI5 decomposition. **Pure threshold-over-retrieval logic, no
> hook, no stdin, no process.exit.** This slice ships ONLY the `checkDuplicate`
> function and its test. It is the thin threshold+filter layer over PI4's already-
> shipped `search()`; it contributes ZERO new retrieval code. Slice 2 (`s2`) wires
> this function into the LIVE plan-write surface — but `s2` cannot start until this
> module and its test exist, hence `s2 depends_on s1`.

## Scope (this slice only)

- **In:** `src/lib/plan-index/duplicate-guard.js` exporting a single async function
  `checkDuplicate(draftSummary, options)`; its own test file
  `tests/plan-index-duplicate-guard.test.js`.
- **Out:** the advisory hook + its stderr/log surface + the end-to-end
  "warning-actually-surfaces" assertion (all `s2`). Retrieval itself (PI4, shipped).
  Settings-schema registration (PI1, shipped — the `plan_index.duplicate_threshold`
  key already exists in `src/lib/settings.js`).

## Implementation Details

### Architecture Decision

**`checkDuplicate` calls the PI4 barrel `search()`, NOT `store.search` directly.**
The parent plan says "PI5 calls PI4's `search()`". The real, shipped public
retrieval surface is the async `search(query, opts)` re-exported by the
`src/lib/plan-index/index.js` barrel (backed by `src/lib/plan-index/search.js`).
That function already (a) embeds the query text through the pre-wired embedder —
the ONE async point — and (b) calls `store.search` (PI1 brute-force cosine)
internally, fusing with BM25 via RRF. Calling `store.search` directly would
require PI5 to embed the draft itself and would duplicate retrieval logic the
parent explicitly forbids. So `checkDuplicate` is **async** and `await`s
`search()` exactly once. This keeps PI5 a pure threshold+surface layer, honoring
the locked "core reuse from PI4" constraint.

**Similarity source = the fused `score` field on each `search()` result.** Each
result object from `search()` carries `{ planPath, sectionId, score, ...view }`
where `score` is the RRF-fused rank score (see `src/lib/plan-index/search.js`
`fuseRRF` → results). PI5 treats `score` as the "similarity" it compares against
the threshold. NOTE (Decision under ambiguity, documented below): RRF scores are
rank-fusion scores in a small positive range (≈ `1/(60+rank)` summed over ≤2
lists, so typically ~0.008–0.033), **not** raw cosine in `[-1,1]`. The parent's
BDD scenarios ("similarity: 0.87", threshold 0.85) assume a cosine-scale score.
This slice does NOT invent a rescaling; it compares `result.score >= threshold`
faithfully and leaves the score semantics exactly as `search()` returns them.
The comparator-direction is what is unit-tested (parent's explicit
"comparator-direction test, not false-positive-rate test" decision). Any
score-scale re-calibration is a separate, documented follow-up for the human to
schedule — it is NOT silently baked in here. This is surfaced in
`## Decisions Taken Under Ambiguity`.

**Threshold via `getSetting('plan_index', 'duplicate_threshold', projectPath)`.**
The shipped `src/lib/settings.js` `getSetting` signature is
`(category, key, projectPath)` — three positional args (confirmed:
`embedder.js` calls `getSetting('plan_index', 'engine_preference', deps.projectPath)`).
The shipped schema default for `duplicate_threshold` is **0.85** (not 0.82 — the
parent prose says 0.82 in two places but the real registered default in
`SETTINGS_SCHEMA.plan_index` is `0.85`). This slice reads whatever the setting
returns and never hardcodes a threshold; the discrepancy is documented, not
"fixed" here.

**Dependency injection for hermetic tests.** `checkDuplicate` accepts
`options.search` and `options.getSetting` overrides (mirroring how
`search.js` accepts `opts.store`/`opts.embedder` and how `wiring.getWiring`
accepts injected deps). Production passes neither and the module lazy-requires the
real barrel `search` + real `getSetting`. Injection lets the test drive the
function against a stub `search` returning fixture-scored results with ZERO
network / ZERO real embedding — deterministic arithmetic assertions only.

### Dependency Graph

```
duplicate-guard.js  --lazy-requires-->  ./index (barrel).search   [PI4, shipped]
duplicate-guard.js  --lazy-requires-->  ../settings.getSetting     [shipped]
duplicate-guard.js  --tested-by-->      tests/plan-index-duplicate-guard.test.js
tests/…duplicate-guard.test.js  --injects-->  stub search + stub getSetting
                                              (+ reuses tests/fixtures/plan-index/search-fixture.json)
```

No new file imports `duplicate-guard.js` in this slice (the hook in `s2` will be
its first caller). To avoid an "orphaned file from birth" the test IS the first
consumer — it exercises every branch. `s2` makes it live.

### File Specifications

#### File: `src/lib/plan-index/duplicate-guard.js`
**Action:** CREATE
**Purpose:** The thin threshold+filter layer over PI4 `search()`; returns the
existing plans a draft plan is semantically too close to. Warns (returns matches);
never blocks; fail-open.
**Change Type:** new-module

##### Exports
- `checkDuplicate(draftSummary, options)` → returns `Promise<Array<{ plan: string, similarity: number }>>`
  - Description: Embeds+retrieves `draftSummary` via PI4 `search()`, reads
    `plan_index.duplicate_threshold`, returns one `{ plan, similarity }` per result
    whose `score >= threshold`, sorted similarity-descending. Excludes the draft's
    own plan path when `options.selfPlanPath` is provided (a draft being re-saved
    must not flag itself).
  - Parameters:
    - `draftSummary` (string): the deterministic summary text of the draft plan
      (produced by `s2` via `summary-extract.extractSummary`; this module treats it
      as opaque query text).
    - `options` (object, optional):
      - `projectPath` (string): forwarded to `search()` and `getSetting()`.
      - `selfPlanPath` (string): normalized plan path of the draft, forwarded as
        `search()`'s `excludePlanPath` so a re-save never matches itself.
      - `limit` (number): forwarded to `search()` (default: the module constant
        `DEFAULT_DUPLICATE_LIMIT = 5` — a warning lists a handful of nearest, not 10).
      - `search` (function): injected async `search` for tests; else lazy-required
        barrel `search`.
      - `getSetting` (function): injected for tests; else lazy-required real one.
  - Returns: `[]` when — the index is empty (`search()` returns `[]`), no result
    meets the threshold, `draftSummary` is not a non-empty string, or ANY error
    occurs (fail-open). NEVER throws.
  - Throws: **never.** Every path is wrapped; a thrown `search`/`getSetting` is
    caught and yields `[]` (fail-open — a duplicate check must never break a plan
    write).
  - Example: `await checkDuplicate('title: Auth cleanup\n## Goal', { projectPath, search: stubSearch, getSetting: () => 0.85 })`
    → `[{ plan: 'plans/functional/auth-middleware-refactor.md', similarity: 0.87 }]`

##### Dependencies (imports this file needs)
- `require('./index')` — LAZY, inside the function body — for the barrel `search`
  (matches the barrel's fail-open lazy-getter contract; a broken `search` getter
  returns `undefined` → treated as empty → `[]`).
- `require('../settings')` — LAZY — for `getSetting`.
- No `fs`, no `path`, no `os` — this module is pure logic over injected/lazy deps;
  cross-platform for free.

##### Called By
- (this slice) `tests/plan-index-duplicate-guard.test.js` — first + only consumer.
- (slice `s2`) `src/hooks/PostToolUse.plan-index-duplicate-guard.js` — the LIVE hook.

##### Data Flow
```
draftSummary (string) ──► guard: validate non-empty string ─(fail)─► return []
   │
   ├─ resolve search()   (options.search ?? lazy require('./index').search)
   ├─ resolve getSetting (options.getSetting ?? lazy require('../settings').getSetting)
   │
   ├─ threshold = Number(getSetting('plan_index','duplicate_threshold',projectPath))
   │              (NaN/undefined → fail-open return [])
   │
   ├─ results = await search(draftSummary, { projectPath, excludePlanPath: selfPlanPath, limit })
   │            (search() is itself fail-open: empty index → [], embed fail → BM25-only)
   │
   └─ map results → filter(r => Number.isFinite(r.score) && r.score >= threshold)
                  → [{ plan: r.planPath, similarity: r.score }]
                  → sort similarity desc
                  → return
   (any throw anywhere in the try → catch → return [])
```

##### Error Handling
- Non-string / empty `draftSummary`: return `[]` (no query attempted).
- `getSetting` throws or returns non-finite threshold: return `[]` (fail-open — we
  cannot compare without a threshold; do not guess one).
- `search` throws or returns non-array: return `[]` (fail-open).
- `search` returns `[]` (empty index): return `[]` (empty-index no-op — search()
  already short-circuits an empty store with NO embed call).
- No result meets threshold: return `[]`.
- The whole body is a single `try { … } catch { return []; }` — never throws.

##### Cross-Platform Notes
- Pure string/number/array operations; no filesystem, no path construction.

### Test Plan

#### Tests: `tests/plan-index-duplicate-guard.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`)

Tests inject a **stub `search`** (async, returns a pre-scored result array) and a
**stub `getSetting`** (returns a fixed threshold) — ZERO network, ZERO real
embedding, deterministic arithmetic. The stub-scored results reuse the plan paths
and cluster structure from `tests/fixtures/plan-index/search-fixture.json` so the
data is realistic, but the `score` values are baked per-test to exercise the
comparator directly (the parent's "pre-measured similarities" contract).

##### Test Cases
1. **High threshold suppresses a below-threshold match (comparator `<`).**
   - Setup: stub `search` → `[{ planPath: 'plans/ps1-sync-state.md', sectionId: '__plan__', score: 0.85 }]`; stub `getSetting` → `0.90`.
   - Assert: `checkDuplicate('any', { search, getSetting })` resolves `[]` (0.85 < 0.90).
2. **Low threshold raises the same match (comparator `>=`).**
   - Setup: same stub result (score 0.85); stub `getSetting` → `0.70`.
   - Assert: resolves `[{ plan: 'plans/ps1-sync-state.md', similarity: 0.85 }]` (0.85 >= 0.70).
   - Assert: identical code path, only the `getSetting` return differs (parent's
     "both runs use identical code; only the getSetting() value differs").
3. **Boundary equality is a match (`>=`, not `>`).**
   - Setup: stub result score `0.85`; `getSetting` → `0.85`.
   - Assert: resolves a one-element array (0.85 >= 0.85). Pins the `>=` direction.
4. **Multiple results filtered + sorted similarity-descending.**
   - Setup: stub → three results scored `[0.72, 0.91, 0.86]`; `getSetting` → `0.80`.
   - Assert: two returned (0.91, 0.86), 0.72 dropped; order is `[0.91, 0.86]`.
5. **Empty index is a safe no-op.**
   - Setup: stub `search` → `[]` (models an empty store — `search()` returns `[]`
     with no embed); `getSetting` → `0.85`.
   - Assert: resolves `[]`; assert the stub `search` was still called exactly once
     (the guard does not itself pre-check emptiness — it delegates to search()).
6. **`selfPlanPath` is forwarded as `excludePlanPath`.**
   - Setup: spy stub `search` capturing its `opts`; call with
     `{ selfPlanPath: 'plans/functional/draft.md' }`.
   - Assert: the captured `opts.excludePlanPath === 'plans/functional/draft.md'`.
7. **Fail-open — throwing `search` yields `[]`, no throw escapes.**
   - Setup: stub `search` → rejects/throws.
   - Assert: `await checkDuplicate(...)` resolves `[]` (does not reject).
8. **Fail-open — non-finite threshold yields `[]`.**
   - Setup: `getSetting` → `undefined` (and a variant → `NaN`); stub result score 0.99.
   - Assert: resolves `[]` (cannot compare without a valid threshold; no guess).
9. **Non-string / empty `draftSummary` yields `[]` without calling `search`.**
   - Setup: spy stub `search`; call with `null`, `''`.
   - Assert: resolves `[]`; assert stub `search` was NEVER called.

##### Coverage Targets
- Line coverage ≥ 80%; branch ≥ 80% (every early-return + the catch exercised).
- Every fail-open path (throw, non-finite threshold, bad input) has a test.

### Security Review

- [x] **Path traversal** — N/A: this module constructs no paths and touches no
  filesystem. It receives `draftSummary` (opaque text) and forwards a normalized
  `selfPlanPath` string to `search()`; it never resolves or opens a path.
- [x] **Input validation** — `draftSummary` type-checked (non-empty string else
  `[]`); `threshold` coerced with `Number()` and `Number.isFinite`-guarded;
  results array-guarded and `score` finiteness-checked before comparison.
- [x] **No secrets** — none.
- [x] **Safe file operations** — none (no writes/reads).
- [x] **Error messages** — none leaked; fail-open returns `[]` silently (the `s2`
  hook owns user-facing warning text + logging).
- [x] **Prototype pollution** — results are mapped into fresh `{ plan, similarity }`
  literals; no object merge from untrusted input; no dynamic property assignment
  from result keys.
- [x] **Command injection** — no `exec`/`execSync`/shell.

### Architecture Validation

- [x] **Dependency direction** — a `lib/` module depending only on sibling `lib/`
  modules (`./index`, `../settings`); imports nothing from `hooks/` or `commands/`.
- [x] **No framework coupling** — pure logic; the hook (a `hooks/` module) depends
  on THIS, never the reverse.
- [x] **Interface segregation** — accepts `draftSummary` + a narrow `options`; does
  not take the whole tool payload.
- [x] **Open/closed** — additive new module; changes no existing file.
- [x] **Test independence** — each test injects its own stubs; no shared mutable
  state, no ordering dependency.
- [x] **Cross-platform** — no path/fs.

## Execution Plan

### Step 8: TEST (TDD Red)
- [x] Create `tests/plan-index-duplicate-guard.test.js` with all 9 cases above,
      using injected stub `search` + stub `getSetting` (no network, no real embed).
- [x] Run — all fail (module does not exist yet). Confirms Red. (19-test file failed
      to load: `Cannot find module '../src/lib/plan-index/duplicate-guard'`.)

### Step 9: PREPARE
- [x] No new dependencies. Confirmed `src/lib/plan-index/index.js` re-exports `search`
      (barrel lazy getter → `require('./search').search` — shipped) and
      `src/lib/settings.js` exports `getSetting(category, key, projectPath)`
      (shipped, 3-arg). `tests/fixtures/plan-index/search-fixture.json` exists (its
      cluster/plan-path structure mirrored into the baked per-test stub scores).

### Step 10: IMPLEMENT
- [x] Created `src/lib/plan-index/duplicate-guard.js` exporting async
      `checkDuplicate(draftSummary, options)` per the File Specification:
      single `try/catch` fail-open body; lazy-require real `search` (`./search`) +
      `getSetting` (`../settings`) unless injected; read threshold via
      `getSetting('plan_index','duplicate_threshold',projectPath)`; `await search(...)`
      with `excludePlanPath`+`limit`; filter `Number.isFinite(score) && score >=
      threshold`; map to `{ plan, similarity }`; sort desc; export
      `DEFAULT_DUPLICATE_LIMIT = 5`.
- [x] No stubs, no TODOs (no-stub rule).

### Step 11: REVIEW
- [x] Self-reviewed against Architecture Validation checklist: no `lib → hooks`
      import (imports only `./search`, `../settings`); the entire body is a single
      `try { … } catch { return []; }` — it cannot throw. Non-function
      search/getSetting also guarded → `[]`.

### Step 12: OPTIMIZE
- [x] Confirmed exactly ONE `await search(...)` (search() owns the single embed);
      no redundant retrieval, no per-result async; a single filter→map→sort pass.

### Step 13: SECURE
- [x] Security Review checklist holds: fail-open; `Number.isFinite` guards on both
      threshold and each result `score`; input type/emptiness guard; no fs/path/os;
      no shell/exec; results mapped into fresh `{ plan, similarity }` literals (no
      untrusted-key merge → no prototype pollution).

### Step 14: VERIFY
- [x] `node --test tests/plan-index-duplicate-guard.test.js` → 19 tests, pass 19,
      fail 0, skipped 0.
- [x] Coverage on `duplicate-guard.js`: 98.48% line / 92.31% branch / 100% func
      (≥ 80%); 0 skipped, 0 flaky.
- [x] Full suite `node --test tests/*.test.js` → tests 3094, pass 3094, fail 0,
      skipped 0 (no regression). `npx eslint . --max-warnings 0` exit 0. tsc
      ratcheting baseline unchanged at 89 (baseline-neutral). readme-numbers 47/47.

### Step 15: DOCUMENT
- [x] Module header JSDoc written: purpose (thin threshold layer over PI4 `search`),
      fail-open contract, RRF-vs-cosine score-semantics note, threshold source +
      3-arg signature, DI-for-tests contract; `checkDuplicate` + `DEFAULT_DUPLICATE_LIMIT`
      documented. No CHANGELOG/README bump (internal lib, subdir count untracked).

### Step 16: FINAL-REVIEW
- [x] Confirmed: single logical export `checkDuplicate` (+ `DEFAULT_DUPLICATE_LIMIT`
      constant); never throws (fail-open proven — a throwing `search` RESOLVES `[]`,
      not a rejection); empty-index/no-match/bad-input/error all → `[]`; `>=`
      comparator (boundary equality is a match); `selfPlanPath` → `excludePlanPath`;
      quality bar met. Ready for batched Gate 2 with sibling `s2`. (Plan NOT moved —
      remains in todo per instruction.)

## Decisions Taken Under Ambiguity

- **Score semantics kept as `search()` returns them (RRF-fused rank score), not
  rescaled to cosine.** The parent BDD scenarios read as though `similarity` is raw
  cosine (`0.87`, threshold `0.85`). The shipped `search()` returns an RRF-fused
  rank score, which is on a different (small positive) scale. Silently injecting a
  rescale would be an unreviewed semantic change to retrieval — forbidden (PI5 must
  contribute zero retrieval logic). Decision: compare `result.score >= threshold`
  faithfully; unit-test only the comparator DIRECTION (which the parent explicitly
  scoped as a "comparator-direction test, not a false-positive-rate test"). Score-
  scale calibration is flagged for the human to schedule as a separate concern; it
  is NOT decided or hidden here.
- **Threshold default is the SHIPPED `0.85`, not the prose `0.82`.**
  `SETTINGS_SCHEMA.plan_index.duplicate_threshold.default` in `src/lib/settings.js`
  is `0.85`. This slice reads the setting (never hardcodes), so it tracks whatever
  is registered; the 0.82-vs-0.85 prose discrepancy is noted for the human, not
  reconciled by code here.
- **`getSetting` three-arg signature `(category, key, projectPath)`.** Confirmed
  against the shipped `embedder.js` call site; the parent prose's
  `getSetting('plan_index.duplicate_threshold')` dotted-single-arg form does NOT
  match the shipped API. Use the real three-arg form.
- **Calls barrel `search()`, not `store.search`.** The parent says "PI4's
  `search()`"; the real public surface is the async barrel `search(query, opts)`,
  which owns the embed + the `store.search` cosine call. Calling `store.search`
  directly would force PI5 to embed and duplicate retrieval — prohibited.
- **`limit` default `5` (`DEFAULT_DUPLICATE_LIMIT`).** A duplicate warning should
  name a handful of nearest plans, not the full top-10 search default. Chosen
  small; overridable via `options.limit`.

- **Real `search` required from `./search`, NOT read off the `./index` barrel
  getter (tsc-neutrality).** The plan's File Spec said "lazy-require the barrel
  `search` (`./index`)". The barrel exposes `search` via
  `Object.defineProperties(module.exports, { search: { get() { return
  require('./search').search; } } })`. `tsc --checkJs` does NOT see
  `defineProperties`-installed properties on `module.exports`, so
  `require('./index').search` raised `TS2339: Property 'search' does not exist`,
  bumping the ratcheting typecheck baseline 89 → 90 and failing
  `tests/typecheck.test.js`. Decision: the production fallback lazy-requires
  `require('./search').search` directly. This is BEHAVIORALLY IDENTICAL — the
  barrel getter is literally `require('./search').search` — keeps the same lazy
  require (no eager cycle) and the same fail-open guard (non-function → `[]`), and
  restores tsc baseline-neutrality (89, unchanged). No hook or barrel behavior
  changes; `s2` still consumes `checkDuplicate` unchanged.

- **Whitespace-only `draftSummary` treated as empty → `[]` (search not called).**
  The spec says "non-empty string". A summary that is all whitespace carries no
  query signal and the real `search()` would tokenize it to nothing anyway; the
  guard uses `draftSummary.trim() === ''` so `'   \n\t '` short-circuits to `[]`
  WITHOUT calling `search`, consistent with the null/`''`/non-string cases. This
  is stricter than a bare `length === 0` check but strictly safer (no wasted embed
  attempt) and is unit-tested.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T20:32:44.922Z
gate_crossed: implementation → todo
---

---
iron_loop: true
---

---
title: "EC6-s2 — Recommender fixture-driven integration (stubbed fetcher → fallback → schema across all three buckets)"
type: implementation
parent_plan: EC6-tests-and-fixtures
depends_on: EC6-tests-and-fixtures-s1-shared-fixtures
priority: MEDIUM
program: ctoc-eu-compliance
files:
  - tests/eu-solution-recommender.test.js
status: in-progress
risk_level: MEDIUM
---

# EC6-s2 — Recommender fixture-driven integration

## Slice scope (why this slice exists, and what it does NOT re-test)

The parent EC6 `files:` list names `tests/eu-solution-recommender.test.js`, which **does
not exist** (only `tests/eu-recommender-helpers.test.js`,
`tests/eu-solution-recommender-agent.test.js`, and
`tests/eu-solution-recommender-registry.test.js` exist). This slice creates that missing
file as the **fixture-driven integration** for EC4's `eu-recommender-helpers.js`: it wires
the shipped exports together the way the real flow does — `createFetcher` (with a stub web
boundary) → a network-failure path → `applyFallback` → `validateOutputSchema` — across all
three buckets (`hosted`, `self_hosted`, `library`) using the shared fixture from
EC6-s1 as the driving finding. It asserts the end-to-end contract the parent's Success
Metric 6 + Scenario "EC4 stubbed fetcher failure produces labeled fallback" require.

**This slice does NOT re-test** the shipped per-function units:
- `tests/eu-recommender-helpers.test.js` already unit-tests `validateOutputSchema`
  (each throw branch), `validatePriceString`, `checkMonotonicity`, `createFetcher`
  (constructor guards), and `applyFallback` in isolation. This slice does NOT duplicate
  those; it adds the **composed flow across buckets** and the **injected-failure →
  labeled-fallback** path end-to-end, which no shipped test composes.

## Implementation Details

### Architecture Decision

Grounded in the real source (`src/lib/eu-recommender-helpers.js`, read fresh), the
recommender's exports are five: `CANONICAL_SCHEMA_KEYS`, `VALID_BUCKETS`,
`EVALUATIVE_PRICE_PATTERNS`, `validateOutputSchema`, `validatePriceString`,
`checkMonotonicity`, `createFetcher(webSearchFn, webFetchFn)`,
`applyFallback(option, skillDocumentedFigure, fieldName='price')`. Four are PURE; only
`createFetcher`'s returned methods do I/O — and that I/O is **injected**, never imported.
This is the correct `node --test` boundary (the parent's decision: you cannot mock
`WebSearch`/`WebFetch` from Node). The integration test injects a **stub fetcher** whose
web functions return a network error, exercising the fail-soft path that culminates in
`applyFallback` marking the affected field `unverified_this_run: true` and using the
skill-documented figure — with `validateOutputSchema` still passing on the result, for all
three buckets.

The driving finding is the EC6-s1 fixture corpus (`annex-iii-ai-plan.md` classification
provides the high-risk context a recommender bucket would answer). `depends_on:
EC6-s1` because this test reads that shared fixture to drive a realistic recommendation
input rather than inventing yet another ad-hoc input.

### Dependency Graph

```
tests/fixtures/compliance/*  (from EC6-s1)
        │ shared driving fixture (read-only)
        ▼
tests/eu-solution-recommender.test.js
        ├── require('../src/lib/eu-recommender-helpers')  → createFetcher, applyFallback,
        │        validateOutputSchema, VALID_BUCKETS, checkMonotonicity  (SHIPPED)
        └── fs + path.join(__dirname,'fixtures','compliance',…)  → load fixture (cross-platform)
```
No cycles. `tests/*` → `src/lib/eu-recommender-helpers` (pure + injectable) only. No live
network — the fetcher's web functions are injected stubs. No hook, no command.

### File Specifications

#### File: `tests/eu-solution-recommender.test.js`
**Action:** CREATE
**Purpose:** Fixture-driven integration for the EC4 recommender: compose
stub-fetcher → fallback → schema validation across `hosted`, `self_hosted`, `library`,
proving the injected-failure path yields a labeled fallback (never a crash, never a
swallowed error) and a schema-valid option.
**Framework:** `node:test` (`describe`/`it`/`assert`).

**Test fixtures inside the file (local helpers, grounded in the real schema):**
- `stubFetcherFailing()` → `createFetcher(() => { throw new Error('network down'); }, () => { throw new Error('network down'); })`
  (or the fail-soft return shape the shipped `createFetcher` expects — confirmed against
  source at Step 9).
- `optionFor(bucket)` → a canonical option object carrying exactly `CANONICAL_SCHEMA_KEYS`
  for the given bucket (`hosted` includes a `region`; `self_hosted`/`library` set
  `region: null`), so `validateOutputSchema` passes on the clean path.

### Test Plan

`tests/eu-solution-recommender.test.js`:

1. **Driving fixture loads + classifies high-risk (integration entry).** Read
   `annex-iii-ai-plan.md` via `path.join(__dirname,'fixtures','compliance',…)`; assert it
   is non-empty. (Establishes the shared fixture is the recommender's driving input, tying
   s2 to s1.)
2. **Clean path across all three buckets.** For each `bucket` in `VALID_BUCKETS`
   (`hosted`, `self_hosted`, `library`): build `optionFor(bucket)`; assert
   `validateOutputSchema(option)` does not throw and returns/accepts it. Proves the
   integration produces a schema-valid option for every bucket (the parent's "hosted,
   self_hosted, and library keys present" requirement).
3. **Injected-failure → labeled fallback (the load-bearing error path).** Configure
   `createFetcher` with the failing stub; drive `applyFallback(option, skillDocumentedFigure)`
   for the affected field; assert:
   - the output contains `unverified_this_run: true` for the affected field;
   - the skill-documented fallback figure is used (`assert.equal(out.price, skillDocumentedFigure)`
     or the field the shipped signature applies);
   - `assert.doesNotThrow(...)` around the whole compose — no exception propagates;
   - `validateOutputSchema(out)` still passes (the fallback keeps the option schema-valid).
4. **Fallback across all three buckets.** Repeat case 3 for each bucket, asserting the
   labeled fallback is applied consistently regardless of bucket.
5. **Error is NOT swallowed silently.** Assert the failing fetcher's error surfaces as an
   observable state (either the fail-soft `unverified_this_run` marker, asserted
   explicitly) — never an empty catch, never a green pass with no assertion. If the
   shipped `createFetcher` returns a fail-soft object rather than throwing, assert that
   object's shape carries the failure signal.
6. **Monotonicity holds on a composed multi-bucket result (integration invariant).** Build
   an ordered options list across buckets and assert `checkMonotonicity(options)` behaves
   as the shipped contract specifies (assert on its real return — confirmed at Step 9),
   proving the composed output respects the price-ordering invariant.
7. **Schema rejects an out-of-contract composed option (negative integration).** Feed
   `validateOutputSchema` an option with an unknown key (or an invalid `bucket`) built
   through the compose helpers; assert it throws with the shipped message (`unknown key` /
   `invalid bucket`) — proving the integration cannot leak a malformed option.

#### Coverage Targets
This slice adds an integration test over the SHIPPED `eu-recommender-helpers.js`; it
raises composed-path coverage on `createFetcher`'s failure branch + `applyFallback` in
context (contributing to the parent's ≥80% target on that module). No new `src/lib` JS.
Every `it` has ≥1 `assert.*`; the injected-failure path asserts an observable outcome (no
empty catch); no undocumented `skip`.

### Security Review

- **Path traversal:** fixture path via `path.join(__dirname,'fixtures','compliance',…)`;
  no dynamic segment. PASS.
- **No live network:** the web boundary is an INJECTED stub; the real `WebSearch`/
  `WebFetch` are never called from the test. PASS (the parent's hard constraint).
- **Input validation:** every option built through `optionFor()` carries only
  `CANONICAL_SCHEMA_KEYS`; the negative case deliberately injects an out-of-contract key
  to prove rejection. PASS.
- **No secrets:** stub URLs/prices are illustrative; no credentials. PASS.
- **Safe file operations:** READS the shared fixture only; writes nothing. PASS.
- **Command injection / prototype pollution:** none — no `exec`; option objects built from
  literals, not merged from untrusted dynamic keys. PASS.

## Execution Plan

### Step 8: TEST
Write `tests/eu-solution-recommender.test.js` with the seven cases above (RED — the file
does not yet exist; and it depends on the EC6-s1 fixture, so it must run AFTER s1 ships).
Every `it` has ≥1 `assert.*`; the failure path asserts `unverified_this_run` (never an
empty catch); no undocumented `skip`.

### Step 9: PREPARE
Read fresh `src/lib/eu-recommender-helpers.js` to lock the EXACT signatures and
return/throw shapes of `createFetcher`, `applyFallback` (does it throw or fail-soft on a
failing fetcher? what field does `applyFallback` mark?), `validateOutputSchema`, and
`checkMonotonicity`. Confirm `CANONICAL_SCHEMA_KEYS` / `VALID_BUCKETS` exact contents.
Confirm the EC6-s1 fixture `annex-iii-ai-plan.md` exists (dependency satisfied).

### Step 10: IMPLEMENT
Implement `stubFetcherFailing()` and `optionFor(bucket)` to match the confirmed shipped
shapes, then the seven cases. No stub, no TODO — if the shipped `createFetcher` failure
contract is ambiguous (throw vs fail-soft), choose the behaviour the SOURCE actually
implements and record it in `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
Self-review: assertions match the shipped return/throw shapes exactly (no invented
fields); all three buckets exercised on both clean and fallback paths; cross-platform
fixture path; no live network.

### Step 12: OPTIMIZE
Collapse the per-bucket loops into a single table-driven loop over `VALID_BUCKETS`. No
behavioural change.

### Step 13: SECURE
Re-verify the Security Review checklist; confirm the fetcher stub throws/returns locally
and no real web tool is reachable from the test.

### Step 14: VERIFY
`node --test tests/eu-solution-recommender.test.js` → `# fail 0`, 0 skipped (run AFTER
EC6-s1 has shipped its fixtures). Then `node --test tests/*.test.js` → `# fail 0`.

### Step 15: DOCUMENT
Header comment: this is the fixture-driven INTEGRATION for the EC4 recommender (compose
across buckets + injected-failure fallback); the per-function units live in
`tests/eu-recommender-helpers.test.js` and are NOT duplicated here.

### Step 16: FINAL-REVIEW
Confirm: composed flow across all three buckets green; injected-failure → labeled fallback
asserted (no swallowed error); schema rejection proven; no live network; no human gate
touched (read-only test over a pure/injectable module).

## Decisions Taken Under Ambiguity
- **`createFetcher` failure contract read from source, not assumed.** Whether the failing
  fetcher throws or returns a fail-soft descriptor is resolved by reading the shipped
  module at Step 9; the test asserts whichever the source actually implements. Recorded so
  review can catch a mismatch.
- **Driving input = EC6-s1 shared fixture, not a new ad-hoc string.** To avoid the
  "each slice invents its own fixture" smell the parent calls out, this integration reads
  the shared `annex-iii-ai-plan.md`; hence `depends_on: EC6-s1`.
- **No duplication of the shipped recommender unit tests.** This file is strictly the
  composed integration + injected-failure path; the per-function throw branches remain
  owned by `tests/eu-recommender-helpers.test.js`.

### Execution-time decisions (EC6-s2, 2026-07-08)
- **`createFetcher` failure contract read from source = FAIL-SOFT, not throw.** The shipped
  `createFetcher(wsFn, wfFn)` returns `{ search, fetch }` whose methods run `normalizeCall`
  and turn a thrown/rejected injected call into `{ ok:false, error }` (never propagate). The
  integration asserts `searchResult.ok === false` and `error instanceof Error` (observable
  failure), then composes `applyFallback(...)` on that failure. `applyFallback` itself is
  pure (never does I/O and never throws on a valid object).
- **Fallback field asserted = `price` with `unverified_this_run: true`.** `applyFallback`'s
  default `fieldName` is `price`; the test passes a skill-documented price figure (caller-
  supplied — no figure baked into the module) and asserts the returned copy sets
  `price === figure` and `unverified_this_run === true`, then that `validateOutputSchema`
  still passes on the fallback. `applyFallback` returns a shallow COPY; test asserts the
  input is not mutated (`assert.notEqual(out, original)`).
- **Driving input = shared EC6-s1 fixture `annex-iii-ai-plan.md`** loaded via
  `path.join(__dirname,'fixtures','compliance',…)` (cross-platform, no dynamic segment).
  Asserted non-empty and matching `/high-risk/i` + `/screening|recruitment|candidates/i`.
- **No fabricated-numbers proof** = an evaluative price (`"very affordable for the value"`)
  is rejected by `validatePriceString` (`/evaluative pattern/`).
- **No live network proof** = the web boundary is an INJECTED local closure (throwing stub /
  canned-record stub); the real `WebSearch`/`WebFetch` are never referenced or reachable.
- **RED→GREEN proven honestly** by temporarily flipping the fallback-label expectation to
  `false` → `fail 1` on that assertion; restored → `pass 11 / fail 0`. Not always-green.

### VERIFY tallies (EC6-s2, 2026-07-08)
- RED (wrong expectation): `pass 10 / fail 1` on the fallback-labeling assertion.
- GREEN `node --test tests/eu-solution-recommender.test.js`: **tests 11, pass 11, fail 0, skipped 0**.
- Full suite `node --test tests/*.test.js`: **tests 3399, pass 3399, fail 0, skipped 0**.
- `npx eslint tests/eu-solution-recommender.test.js --max-warnings 0`: exit 0.
- `npx eslint . --max-warnings 0`: exit 0.
- tsc baseline-neutral: 89 pre-existing errors, ALL in `src/`; 0 in `tests/`; 0 referencing
  the new file → my file contributes zero new type errors.
- `node --test tests/readme-numbers.test.js`: tests 47, pass 47, fail 0 (test-only slice — no
  readme bump; readme-numbers green).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — proven: wrong expectation → pass 10 / fail 1

### Step 9: PREPARE
- [x] Install dependencies if needed (none — node:test/assert built-in)
- [x] Check prerequisites (read src/lib/eu-recommender-helpers.js fresh — fail-soft contract locked)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (n/a — EC6-s1 fixtures present)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (stubFetcherFailing/Succeeding, optionFor, 7-case flow)
- [x] Add error handling (fail-soft injected-failure path asserted)
- [x] Wire up integration points (createFetcher → fallback → validateOutputSchema across 3 buckets)

### Step 11: REVIEW
- [x] Self-review all new code (assertions match shipped return/throw shapes; no invented fields)
- [x] Verify integration points work together (all 3 buckets, clean + fallback)
- [x] Check error handling completeness (observable unverified_this_run marker; no swallowed error)

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths (table-driven loops over VALID_BUCKETS)
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal — static path.join, no dynamic segment)
- [x] Sanitize outputs (n/a — reads fixture only, writes nothing)
- [x] No secrets in code (illustrative stub URLs/prices only)
- [x] Safe file operations (read-only fixture load; NO live network — injected stub boundary)

### Step 14: VERIFY
- [x] Run lint + type check (eslint exit 0; tsc baseline-neutral, 0 errors in tests/)
- [x] Run ALL tests (TDD Green) — full suite 3399 pass / 0 fail / 0 skipped
- [x] Check coverage >= 80% (integration raises composed-path coverage on createFetcher failure + applyFallback)
- [x] 0 skipped, 0 flaky tests (11 pass, 0 skipped)

### Step 15: DOCUMENT
- [x] Update relevant documentation (header comment: this is the INTEGRATION; units live in eu-recommender-helpers.test.js)
- [x] Add JSDoc comments to new functions (optionFor / stubFetcherFailing / stubFetcherSucceeding documented)
- [x] Update CHANGELOG if needed (n/a — test-only slice, no readme/version bump)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed (RED→GREEN proven honestly)
- [x] Ready for human review

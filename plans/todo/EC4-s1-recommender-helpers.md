---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T19:25:50.690Z
gate_crossed: implementation → todo
---

---
iron_loop: true
---

---
title: "EC4-s1 — eu-recommender-helpers.js (canonical-schema validator, price validator, monotonicity checker, injectable fetcher factory, fallback applier) + its test"
type: implementation
parent_plan: EC4-eu-solution-recommender
depends_on: none
program: ctoc-eu-compliance
priority: HIGH
risk_level: MEDIUM
iron_loop: true
files:
  - src/lib/eu-recommender-helpers.js
  - tests/eu-recommender-helpers.test.js
status: refined
---

# EC4-s1 — eu-recommender-helpers.js (deterministic rule core + its test)

> Slice 1 of the EC4 decomposition. This is the **deterministic, `node --test`-able
> boundary** the parent plan mandates ("`eu-recommender-helpers.js` contains the
> deterministic layer: output schema validator, price string validator, quality_rank
> monotonicity checker, and the injectable fetcher interface"). The web-search behaviour
> is the AGENT's job (s2); everything a linter / `node --test` can actually verify lives
> HERE. A module and its own test ship together as one unit of work.
>
> This slice depends on **nothing** — the five functions are pure or near-pure (the
> fetcher factory only *wraps* injected functions; it makes no web call itself). It does
> NOT import the EC1 gate, the sibling `eu-ai-act-helpers.js`, or the agent prose.

**Read before acting (CF1 / ancestry-read):** read the parent index
`plans/implementation/EC4-eu-solution-recommender.md` (the locked canonical schema, the
price constraint patterns, the monotonicity contract, the fallback protocol); the sibling
precedent `src/lib/eu-ai-act-helpers.js` + `tests/eu-ai-act-helpers.test.js` (the exact
"pure deterministic core + fail-open + frozen-constant + no-dynamic-RegExp" house style this
module must match); and `src/lib/gdpr-helpers.js` (the `normalizeSeverity`/`routeFinding`
pure-function + shallow-copy discipline). Trust the files on disk over this brief; surface
any drift.

## Implementation Details

### Architecture Decision (ADR)

**Context:** The recommender's real work — searching the web for EU solutions and verifying
regulatory dates — is agent behaviour that `node --test` cannot execute, and a snapshot of
"the agent returned something" would be false-green. But the *contract* the output must obey
(exact snake_case schema, price-as-fact, monotonic quality_rank, no-auto-select, per-field
fallback labelling) IS deterministic and machine-checkable. It needs a home that is unit-
testable in isolation of both the network and the agent markdown.

**Decision:** A new module `src/lib/eu-recommender-helpers.js`. Four of its five exports are
**pure** (no I/O). The fifth, `createFetcher(webSearchFn, webFetchFn)`, is a **factory** that
returns a fetcher object closing over two INJECTED functions — it performs no web call itself;
the agent (s2) injects the real `WebSearch`/`WebFetch` tool handles, and the test injects
controlled stubs. This injectable boundary is the whole reason the deterministic layer is
testable without a live network. Dependency direction is lib → lib only (it may import
`./safe-fs` if a fallback figure is read from a skill file, but imports nothing from
hooks/commands and NOT `compliance-regime.js` — the gate is the agent's job, matching how
`eu-ai-act-helpers.js` deliberately omits the gate import to stay independently testable).

**Consequences:** The rule core is ≥80%-unit-testable with plain in-memory inputs plus a stub
fetcher (no live network, no tmp project required). The agent (s2) stays thin and references
these functions by name. The "price as fact", "no auto-select", "monotonic rank", and "per-
field fallback" rules become **machine-enforced contracts**, not documentation conventions.

### Dependency Graph

```
src/lib/eu-recommender-helpers.js  (CREATE) — pure/near-pure, no gate import
    ├── CANONICAL_SCHEMA_KEYS       frozen Set<string> (the 10 locked snake_case keys)
    ├── EVALUATIVE_PRICE_PATTERNS   frozen array of static, word-bounded RegExp
    ├── validateOutputSchema(opt)   asserts exactly-the-canonical-keys; rejects `selected`
    ├── validatePriceString(price)  throws naming the rejected evaluative pattern
    ├── checkMonotonicity(options)  asserts quality_rank non-decreasing AND unique per bucket
    ├── createFetcher(wsFn, wfFn)   factory → fetcher wrapping injected fns (no web call here)
    ├── applyFallback(opt, figure)  → { ...opt, unverified_this_run:true, <field>:figure }
    └── tested-by ─> tests/eu-recommender-helpers.test.js  (CREATE)
```

No cycle (no runtime imports beyond an optional `./safe-fs`). **Chain depth 0** for the
helpers themselves; this slice has `depends_on: none`.

### File Specifications

#### File: `src/lib/eu-recommender-helpers.js`
**Action:** CREATE
**Purpose:** The deterministic EU-solution-recommender rule core — canonical-schema validation,
price-as-fact enforcement, quality_rank monotonicity checking, the injectable web-fetcher
factory, and the fetch-failure fallback applier — as pure/near-pure, unit-testable functions.
**Change Type:** new-module

**Constants (frozen — no untrusted key ever lands here):**
- `CANONICAL_SCHEMA_KEYS` — a frozen `Set` containing EXACTLY the parent's locked snake_case
  top-level keys, no more, no fewer:
  `"bucket"`, `"name"`, `"source_url"`, `"retrieved_date"`, `"price"`, `"quality_rank"`,
  `"region"`, `"verified_source"`, `"verified_date"`, `"unverified_this_run"`.
- `VALID_BUCKETS` — a frozen `Set`: `"hosted"`, `"self_hosted"`, `"library"`.
- `EVALUATIVE_PRICE_PATTERNS` — a frozen array of STATIC, word-bounded, case-insensitive
  RegExp (never built from input): `/\baffordable\b/i`, `/\bexpensive\b/i`, `/\bworth it\b/i`,
  `/\bcompetitive\b/i`, `/\breasonable\b/i`. (The parent's five rejected patterns, verbatim.)

**Imports:** none required for the four pure functions. `require('./safe-fs')` is permitted
ONLY if `applyFallback` reads a skill-documented figure from disk; if the figure is passed in
by the caller (preferred — keeps the function pure), no import is needed. Never import from
hooks/commands; never import `compliance-regime.js`.

**Exports:**
- `validateOutputSchema(option)` → the option (unchanged) on success
  - Asserts `option` is a non-null object whose OWN top-level keys equal `CANONICAL_SCHEMA_KEYS`
    exactly. Throws `Error('validateOutputSchema: unknown key "<k>"')` on any extra key
    (this is the machine-enforcement of "No additional top-level keys") — in particular a
    `selected` key is rejected here (parent Scenario "no vendor is auto-selected"). Throws
    `Error('validateOutputSchema: missing required key "<k>"')` on any absent canonical key.
  - Bucket-conditional rules per the parent: for `bucket:'hosted'`, `region` MUST be a non-empty
    string (throws `Error('validateOutputSchema: hosted option requires region')` when null/
    empty); for non-hosted buckets `region` may be null. When `verified_source` is a non-empty
    string, `verified_date` MUST also be a non-empty ISO `YYYY-MM-DD` string (and vice versa) —
    throws naming the missing partner field.
  - Non-object / null input → throws `TypeError('validateOutputSchema: option must be an object')`.
- `validatePriceString(price)` → the price string (unchanged) on success
  - Throws `Error('validatePriceString: rejected evaluative pattern "<pattern>"')` naming the
    first matched pattern when `price` matches any `EVALUATIVE_PRICE_PATTERNS` member (parent
    Scenario "Price string validator rejects evaluative language").
  - Non-string / empty input → throws `Error('validatePriceString: price must be a non-empty string')`.
  - A price with a currency amount + retrieval date, `"pricing on request (retrieved YYYY-MM-DD)"`,
    or `"open-source / no license fee — self-hosting/infra cost applies"` passes unchanged.
- `checkMonotonicity(options)` → `true` on success
  - `options` is an array of option objects (one bucket's entries). Asserts each entry's
    `quality_rank` is a positive integer, that ranks are **strictly increasing in array order**
    (`rank[i+1] > rank[i]`), and that no two ranks are equal (uniqueness within the bucket) —
    the parent's "monotonically non-decreasing AND unique" contract (which, with uniqueness,
    means strictly increasing). Throws `Error('checkMonotonicity: quality_rank not monotonic
    at index <i>')` or `Error('checkMonotonicity: duplicate quality_rank <n>')` naming the
    offense. Empty array or single-entry array → `true` (vacuously monotonic — supports the
    parent's "empty bucket is valid" case). Non-array input → throws `TypeError`.
- `createFetcher(webSearchFn, webFetchFn)` → a fetcher object `{ search(query), fetch(url) }`
  - A factory returning a fetcher that DELEGATES to the two injected functions. It makes NO web
    call of its own — the injected functions are the sole web boundary (parent risk "injectable
    fetcher boundary drift"). Each method wraps the injected call in try/catch and returns a
    normalized result object `{ ok: true, data }` on success or `{ ok: false, error }` on a
    thrown/rejected/non-2xx injected call, so the agent (and the fallback path) can branch on
    `ok` without a raw exception propagating. Throws `TypeError('createFetcher: webSearchFn and
    webFetchFn must be functions')` if either argument is not a function (programmer error at
    wiring time — loud, not silent).
- `applyFallback(option, skillDocumentedFigure, fieldName)` → a new option object
  - Returns a shallow copy of `option` with `unverified_this_run: true` and the named `fieldName`
    set to `skillDocumentedFigure` (parent Scenario "Web verification failure — unverified_this_run
    fallback"; applies PER FIELD, not globally). Does NOT mutate the input. `fieldName` defaults
    to `"price"` when omitted. Non-object `option` → throws `TypeError`.

**Called By:**
- `agents/compliance/eu-solution-recommender.md` (s2) — references all five by name; injects the
  real `WebSearch`/`WebFetch` handles into `createFetcher`; runs every emitted option through
  `validateOutputSchema` + each price through `validatePriceString`, sorts each bucket then calls
  `checkMonotonicity`, and calls `applyFallback` on any fetch that returns `{ ok:false }`.
- `.ctoc/operations-registry.yaml` (s3) — records the agent that consumes this module (no code call).

#### Data Flow
```
candidate option {bucket,name,source_url,retrieved_date,price,quality_rank,region,
                  verified_source,verified_date,unverified_this_run}
  → validatePriceString(price)      throws (⇒ option excluded) on evaluative language
  → validateOutputSchema(option)    throws on extra key (incl. `selected`) / missing key /
                                     hosted-without-region / verified_source without verified_date
per bucket:
  sorted options → checkMonotonicity(options)   throws on non-monotonic / duplicate rank

fetch path (agent-side):
  fetcher = createFetcher(WebSearch, WebFetch)
  r = fetcher.fetch(url)  → { ok:false, error }  ⇒  applyFallback(opt, skillFigure, 'verified_date')
                                                     ⇒ { ...opt, unverified_this_run:true, verified_date:skillFigure }
```

#### Error Handling
- `validateOutputSchema` / `validatePriceString` / `checkMonotonicity`: throw NAMED errors
  (the offending key / pattern / index) — these ARE the machine-enforcement contracts the
  parent relies on; they must fail LOUDLY, never silently pass.
- `createFetcher`'s returned methods: swallow the injected call's throw/reject and return
  `{ ok:false, error }` (fail-soft at the web boundary, so the agent's fallback path — not an
  exception — handles a network failure; parent Success Metric 3 "no crash, no block").
- `applyFallback`: throws `TypeError` only on non-object `option` (programmer error).

#### Cross-Platform Notes
- Four pure functions: no fs, no paths, no OS-specific behaviour — cross-platform by construction.
- If `./safe-fs` is used for a skill-figure read, it is CRLF-tolerant and path.join-based (matches
  `eu-ai-act-helpers.js`). No hardcoded separators, no `~`, no shell.

### Test Plan

#### Tests: `tests/eu-recommender-helpers.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `assert/strict`). Pure in-memory inputs plus a
hand-written **stub fetcher** injected into `createFetcher` — NO live network, NO tmp project.
Follows the `tests/eu-ai-act-helpers.test.js` house style.

**Test Cases (map the parent CAPTURE scenarios 1:1 for this module's surface):**
1. **Canonical schema — happy path.** A fully-populated `hosted` option with all 10 keys and a
   valid `region` passes `validateOutputSchema` unchanged (parent Scenario "three-bucket options").
2. **Schema rejects an unknown key.** An option with an extra `selected: true` key throws, and
   the message names `selected` (parent Scenario "no vendor auto-selected — validateOutputSchema
   rejects a `selected` field").
3. **Schema rejects a missing canonical key.** An option missing `quality_rank` throws naming it.
4. **Hosted requires region.** A `bucket:'hosted'` option with `region:null` throws
   ("hosted requires region"); the same option as `bucket:'library'` with `region:null` passes
   (parent Scenario "Hosted options are EU-region only" / "region required for hosted only").
5. **verified_source ⇒ verified_date.** An option with a `verified_source` URL but
   `verified_date:null` throws naming the missing partner (parent Scenario "authoritative source
   verification" — a date is never asserted without a source, and vice versa).
6. **`validatePriceString` accepts factual prices.** `"€29/month, list price, retrieved 2026-07-08"`,
   `"pricing on request (retrieved 2026-07-08)"`, and the open-source string each pass unchanged.
7. **`validatePriceString` rejects each evaluative pattern.** For each of `affordable`,
   `expensive`, `worth it`, `competitive`, `reasonable` (case-insensitive), the call throws and
   the message names the matched pattern (parent Scenario "rejects evaluative language").
8. **`validatePriceString` non-string / empty** → throws.
9. **`checkMonotonicity` accepts strictly-increasing ranks.** `[{quality_rank:1},{quality_rank:2},
   {quality_rank:3}]` → `true` (parent Scenario "quality rank monotonic within each bucket").
10. **`checkMonotonicity` rejects a decrease.** `[{quality_rank:1},{quality_rank:3},
    {quality_rank:2}]` throws naming the offending index.
11. **`checkMonotonicity` rejects a duplicate.** `[{quality_rank:1},{quality_rank:1}]` throws
    ("duplicate quality_rank 1") — ranks are unique per bucket (parent Scenario).
12. **`checkMonotonicity` empty + single-entry** → `true` (parent Scenario "empty bucket is
    valid"); non-array → throws `TypeError`.
13. **`createFetcher` rejects non-function args** → throws `TypeError`.
14. **`createFetcher` delegates + normalizes success.** Inject a stub `webFetchFn` returning a
    payload; `fetcher.fetch(url)` → `{ ok:true, data:<payload> }`; assert the stub was called
    with the url (proves it is the SOLE boundary — parent risk "boundary drift").
15. **`createFetcher` fail-soft on injected throw.** Inject a stub `webFetchFn` that throws
    (network error) / returns a 429 shape; `fetcher.fetch(url)` → `{ ok:false, error }` and NO
    exception propagates (parent Scenario "Web verification failure" + "rate-limited" — the
    fetcher never crashes the caller).
16. **`applyFallback` labels the field + copies.** `applyFallback({price:'x', unverified_this_run:false},
    'open-source / no license fee — self-hosting/infra cost applies', 'price')` →
    result `.unverified_this_run === true` and `.price` === the figure; the INPUT object is NOT
    mutated (parent Scenario "fallback figure clearly labeled", applied per-field).
17. **`applyFallback` defaults fieldName to `price`; non-object** → throws `TypeError`.

**Coverage Targets:** ≥ 80% line + branch on `eu-recommender-helpers.js`. Every function's
success and throw path exercised; both `createFetcher` branches (`ok:true` / `ok:false`) hit via
the stub; every `validateOutputSchema` branch (extra key / missing key / hosted-region / verified-
pair) hit. The stub-fetcher happy-path test asserts ZERO real network calls (the injected stub is
the only callable), enforcing the parent's "injectable-fetcher-is-the-sole-web-boundary" invariant.

### Security Review
- [x] **Path traversal:** none in the four pure functions; if `./safe-fs` reads a skill figure,
      the path is caller-supplied and read via the CRLF-tolerant `safe-fs` (no untrusted RegExp).
- [x] **Input validation:** validators throw loudly on malformed input rather than returning a
      wrong shape; `checkMonotonicity` type-checks `quality_rank` is a positive integer.
- [x] **No secrets** in code.
- [x] **Safe file operations:** four pure functions do no fs; the optional `safe-fs` read writes
      nothing.
- [x] **Error messages:** name the offending key / pattern / rank index (developer-facing; no
      sensitive path or secret leaked).
- [x] **Prototype pollution:** `applyFallback` returns `{ ...option, ... }` (shallow copy, no
      merge from untrusted keys into a shared object); `validateOutputSchema` iterates
      `Object.keys(option)` and compares to a frozen Set (no property assignment from input);
      all constants are frozen.
- [x] **ReDoS:** every price pattern is a STATIC, word-bounded literal RegExp (no dynamic RegExp
      built from input, no nested unbounded quantifier) — matches the `eu-ai-act-helpers.js` rule.
- [x] **Command injection:** no `exec` / `execSync`.

## Execution Plan (Steps 8–16)

### Step 8: TEST
- [ ] Write `tests/eu-recommender-helpers.test.js` with all 17 cases + the hand-written stub
      fetcher. Run — expect RED (module absent, `MODULE_NOT_FOUND`).

### Step 9: PREPARE
- [ ] No new deps (node:test + builtins; optional `./safe-fs` already exists). Re-read the parent's
      locked schema keys, the five price patterns, and the monotonicity contract fresh to seed
      `CANONICAL_SCHEMA_KEYS` / `EVALUATIVE_PRICE_PATTERNS` byte-for-byte.

### Step 10: IMPLEMENT
- [ ] Create `src/lib/eu-recommender-helpers.js` per the File Specification: frozen
      `CANONICAL_SCHEMA_KEYS` / `VALID_BUCKETS` / `EVALUATIVE_PRICE_PATTERNS`, the five exports,
      JSDoc, `module.exports`. Standard lib module pattern (imports [none/safe-fs] → constants →
      JSDoc functions → exports). No stubs, no TODOs — make documented choices and continue.

### Step 11: REVIEW
- [ ] Verify the four pure functions import nothing gate-related; verify `createFetcher` makes no
      web call itself (delegates only); verify the schema key Set equals the parent's 10 keys
      exactly; verify `applyFallback` does not mutate its input.

### Step 12: OPTIMIZE
- [ ] Keep it thin — no classes, no factories beyond the required `createFetcher`; match
      `eu-ai-act-helpers.js` simplicity. Freeze all constants.

### Step 13: SECURE
- [ ] Run the security checklist; confirm every validator throws (never silently passes), all
      price RegExp are static/word-bounded (no ReDoS), and constants are frozen.

### Step 14: VERIFY
- [ ] `node --test tests/eu-recommender-helpers.test.js` → `# fail 0`; coverage ≥ 80% (both
      `createFetcher` branches hit). Then full suite `node --test tests/*.test.js` → `# fail 0`
      (no regression). eslint `--max-warnings 0` exit 0.

### Step 15: DOCUMENT
- [ ] JSDoc on all five exports + a module header comment stating this is the deterministic
      authority for the recommender's output contract, that the web boundary is the injected
      fetcher (the agent injects the real tools; tests inject a stub), and that it imports no gate.

### Step 16: FINAL-REVIEW
- [ ] Confirm all 17 cases pass, purity/no-gate-import holds, schema + price + monotonicity
      contracts exact. Plan stays in `implementation/` (executor does NOT cross Gate 2). Ready for
      batched Gate 2 with EC4 siblings.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review

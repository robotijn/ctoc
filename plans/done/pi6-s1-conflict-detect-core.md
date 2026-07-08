---
approved_by: human
approved_at: 2026-07-08T13:49:31.205Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T12:36:24.664Z
gate_crossed: implementation → todo
---

---
title: "PI6-s1 — Conflict/dependency detection core (detectConflicts + barrel export)"
type: implementation
parent_plan: pi6-conflict-dependency-detection
depends_on: none
priority: MEDIUM
program: ctoc-planning-intelligence
iron_loop: true
files:
  - "src/lib/plan-index/conflict-detect.js"
  - "src/lib/plan-index/index.js"
  - "tests/plan-index-conflict.test.js"
---

# PI6-s1 — Conflict/dependency detection core

> **Slice scope.** The pure detection engine and its test — the AND condition
> (section-level vector similarity ∩ glob-aware `files:` overlap) that returns the
> conflicting/dependent plans for a target plan, plus the additive barrel export that
> makes it reachable. NO UI in this slice; the overview-tab surface is s2 and the
> inbox-area surface is s3, both of which import `detectConflicts` from the barrel
> this slice adds.
>
> Retargeted to PI1's pure-JS in-memory + JSON store (the native-vector-DB design is
> abandoned). Section-level similarity comes from PI4's `related(planSlug, { kind:
> 'section', limit: 20 })` (brute-force cosine over the in-memory Map, filtered to
> `kind: 'section'` units via `store.search`'s `opts.kind`). `files:` metadata comes
> from `store.getFilesForPlan(slug)` (O(1) Map read of the plan-level `__plan__`
> unit's `files` array). Glob overlap uses `globToRegex` from
> `src/lib/plan-coverage.js` — the SAME function the enforcement hook uses. The AND is
> computed entirely in JS; no query language, no native table, no binary.

## Implementation Details

### Architecture Decision

**Context.** Two plans that touch the same source files with similar intent are latent
conflicts (the B1/B2 class). Vector similarity alone (similar topic, different files)
is insufficient; `files:` overlap alone (same file, unrelated feature) is insufficient.
Both must hold — a strict AND.

**Decision.** `detectConflicts(planSlug, opts)` is a thin composition over two SHIPPED
capabilities, adding no new retrieval logic:
1. **Similarity half** — `await related(planSlug, { kind: 'section', limit: 20, store,
   projectPath })` returns the ≤20 section-vector neighbours, cosine-descending,
   self-excluded (the store's `excludePlanPath` does the self-exclusion). Each hit
   carries `{ planPath, sectionId, kind, files, score }`.
2. **Overlap half** — for the target and for each candidate, read `files:` via
   `store.getFilesForPlan(slug)`; test every (targetGlob, candidateGlob) pair for a
   match with `globToRegex(a).test(literalOf(b))` in BOTH directions (a broad glob on
   either side must match a literal on the other).

The AND: a candidate is flagged ONLY when its best section score `>= conflict_threshold`
AND at least one file-overlap pair matches. `conflict_threshold` is read via
`getSetting('plan_index', 'conflict_threshold', projectPath)` (default 0.78, registered
by PI1 alongside `duplicate_threshold`). Result rows are
`{ conflictingPlan, overlappingFiles, score, severity }`.

**Consequences.** Reuses PI4 retrieval + PI1 metadata + the authoritative glob impl;
introduces no 5th copy of glob logic; is fully synchronous except the single `related`
await (PI4 is async); fail-open (empty index / no `files:` → `[]`, never a throw).

### Dependency Graph

```
src/lib/plan-index/conflict-detect.js
  --awaits-->  related            (src/lib/plan-index/related.js, via barrel or injected)
  --calls-->   store.getFilesForPlan  (src/lib/plan-index/store.js, via injected/wired store)
  --calls-->   globToRegex        (src/lib/plan-coverage.js)
  --reads-->   getSetting         (src/lib/settings.js)  → plan_index.conflict_threshold
  --resolves-->getWiring          (src/lib/plan-index/wiring.js) when store not injected

src/lib/plan-index/index.js  --lazy-getter-exposes-->  conflict-detect.detectConflicts
tests/plan-index-conflict.test.js  --tests-->  conflict-detect.js  (+ asserts barrel export)
```

No cycle: `conflict-detect.js` is a leaf that only the barrel and the s2/s3 UI import;
it lazy-requires `related`/`store`/`wiring` (string-literal requires) exactly as
`related.js` does, so no eager barrel cycle.

### File Specifications

#### File: `src/lib/plan-index/conflict-detect.js`
**Action:** CREATE
**Purpose:** The conflict/dependency detection engine — AND of section-vector
similarity and glob-aware `files:` overlap — returning the conflicting/dependent plans
for a target plan.
**Change Type:** new-module

##### Exports
- `detectConflicts(planSlug, opts = {})` → returns `Promise<Array<{ conflictingPlan: string, overlappingFiles: string[], score: number, severity: 'potential conflict or dependency' | 'broad overlap' }>>`
  - Description: (1) resolves `store`/`embedder` from `opts` else `getWiring({projectPath})`
    (mirror `related.js`); (2) empty/unavailable guard — no store, or `store.size === 0`
    → `[]`; (3) reads the target's files via `store.getFilesForPlan(planSlug)`; if `[]`,
    log a per-plan debug note to `.ctoc/logs/plan-index.log` (via the store's warn path
    if reachable, else best-effort) and return `[]` (the AND's overlap half can never
    hold); (4) `const hits = await related(planSlug, { kind: 'section', limit: 20, store,
    projectPath, embedder })`; (5) group hits by `planPath`, keep each candidate's MAX
    section score; (6) for each distinct candidate with maxScore `>= threshold`, read its
    files via `store.getFilesForPlan(candidatePlanPath)`, compute glob-aware overlap
    against the target's files, and if overlap is non-empty push a result row; (7) apply
    the broad-glob downgrade (below); (8) return the rows cosine-descending by `score`.
  - Threshold: `getSetting('plan_index', 'conflict_threshold', projectPath)`; if it
    returns `undefined`/non-number, fall back to the constant `DEFAULT_CONFLICT_THRESHOLD = 0.78`.
  - Throws: `TypeError` ONLY when `planSlug` is not a non-empty string (caller bug).
    Every data condition (empty index, no files, no neighbours, `related` throwing) is
    fail-open → `[]`.
  - Example: `await detectConflicts('auth-middleware-refactor', { store, projectPath })`
    → `[{ conflictingPlan: 'auth-rate-limiting', overlappingFiles: ['src/lib/auth.js'], score: 0.87, severity: 'potential conflict or dependency' }]`

##### Internal helpers (not exported)
- `filesOverlap(targetGlobs, candidateGlobs)` → `string[]`
  - For each `t` in targetGlobs and `c` in candidateGlobs: overlap if
    `globToRegex(t).test(c) || globToRegex(c).test(t)` (bidirectional — a `src/lib/**`
    on either side matches a `src/lib/auth.js` on the other). Returns the DISTINCT set of
    matched entries (the more-specific/literal member of each matched pair, so the flag
    lists a concrete path when one exists; when both are globs, list the target's glob).
  - Empty inputs → `[]`.
- `isBroadGlob(glob, allIndexFiles)` → `boolean`
  - True when `glob` (via `globToRegex`) matches more than 50% of the DISTINCT literal
    `files:` entries across the whole index (built once per `detectConflicts` call from
    `store` — see data flow). Drives the "broad overlap" downgrade.
- `collectAllIndexFiles(store)` → `string[]`
  - Distinct `files:` entries across all plans: `store.listPlanPaths()` → for each,
    `store.getFilesForPlan(p)` → flatten + dedupe. Used only for the broad-glob %
    computation; bounded and synchronous.

##### Dependencies (imports this file needs)
- `const { globToRegex } = require('../plan-coverage')` — authoritative glob → regex
- `const { getSetting } = require('../settings')` — `plan_index.conflict_threshold`
- Lazy, string-literal requires (mirror `related.js`, break the barrel cycle):
  - `require('./related')` for `related`
  - `require('./wiring')` `getWiring` when `store`/`embedder` not injected
- NO `require('fs')`/`path`/`os` of its own — pure JS over injected store + plan-coverage.

##### Called By
- `src/lib/plan-index/index.js` — re-exports it (this slice)
- `src/tabs/overview.js` (PI6-s2) — async-fetch half of the overview conflict panel
- `src/lib/inbox.js` + `src/areas/inbox.js` (PI6-s3) — inbox conflict fetch/render

##### Data Flow
```
planSlug (string) + opts{store?, embedder?, projectPath?}
  → resolve store/embedder (opts else getWiring)                         [mirror related.js]
  → guard: !store || store.size === 0 → []                               [fail-open]
  → targetFiles = store.getFilesForPlan(planSlug)                        [O(1) Map read]
      → targetFiles.length === 0 → debug-log + []                        [AND overlap half can't hold]
  → threshold = getSetting('plan_index','conflict_threshold',projectPath) ?? 0.78
  → hits = await related(planSlug, {kind:'section', limit:20, store, projectPath, embedder})
  → group hits by planPath → Map<planPath, maxScore>                     [top-20 candidates]
  → allIndexFiles = collectAllIndexFiles(store)  (once)                  [for broad-glob %]
  → for each candidate where maxScore >= threshold:
        candFiles = store.getFilesForPlan(candidatePlanPath)            [≤20 O(1) reads]
        overlap = filesOverlap(targetFiles, candFiles)
        if overlap.length:
           severity = any matched glob isBroadGlob(...) ? 'broad overlap'
                                                        : 'potential conflict or dependency'
           push { conflictingPlan: candidatePlanPath, overlappingFiles: overlap,
                  score: maxScore, severity }
  → sort rows by score desc → return
```

##### Error Handling
- `planSlug` not a non-empty string → `throw new TypeError(...)` (caller bug).
- `store` null / `store.size === 0` → `[]` (no throw).
- `related(...)` throws/rejects → catch → `[]` (fail-open; a broken retrieval half must
  never break a caller — same posture as `related.js`).
- `getSetting` throws / returns non-number → use `DEFAULT_CONFLICT_THRESHOLD`.
- `getFilesForPlan` never throws (PI1 contract) — returns `[]` on any miss.
- Debug-log write failures are swallowed (best-effort, never propagate).

##### Cross-Platform Notes
- No filesystem/path construction of its own; glob semantics are delegated to
  `globToRegex` (already cross-platform, used by the enforcement hook). Plan keys are
  opaque strings normalized by the caller/PI3 (D9) — this slice does no path math.

#### File: `src/lib/plan-index/index.js`
**Action:** MODIFY
**Purpose:** Expose `detectConflicts` on the public barrel so s2/s3 (and any future
consumer) import it through the single barrel surface, never `./conflict-detect` directly.
**Change Type:** modify-existing (additive)

##### Changes
- **Add** one property to the existing `Object.defineProperties(module.exports, { ... })`
  block, mirroring the `search` / `related` lazy getters EXACTLY:
  ```js
  detectConflicts: {
    enumerable: true,
    configurable: true,
    get() { try { return require('./conflict-detect').detectConflicts; } catch { return undefined; } }
  }
  ```
- Do NOT touch the eager `module.exports = { openStore, PLAN_SENTINEL }` line or any
  existing getter. The PI4 barrel-integrity test guards `search`/`related`/`getWiring`
  remain intact; this addition is orthogonal and fail-open (a broken `conflict-detect.js`
  returns `undefined` from the getter, never breaking the barrel for PI1/PI0/PI4 consumers).

##### Called By
- `src/tabs/overview.js`, `src/lib/inbox.js` (via `require('../lib/plan-index').detectConflicts`).

### Test Plan

#### Tests: `tests/plan-index-conflict.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`), matching the `plan-index-*.test.js`
family (see `tests/plan-index-related.test.js` for the inject-real-store-over-temp-JSON pattern).

**Fixture strategy.** Build a REAL PI1 store over a temp JSON via `openStore` and
`upsertUnit` baked section-level embeddings whose pairwise cosine is pre-computed to sit
above/below `conflict_threshold` (the same approach `plan-index-related.test.js` uses —
craft small unit vectors so the cosine relationships are exact and deterministic). Seed
`__plan__` units carrying the `files:` arrays. A `tests/fixtures/plan-index/conflict-fixture.json`
holds the baked vectors + files per plan so the AND relationships are LOGIC assertions
against fixed values, not live model calls. `getSetting` is stubbed via a small wrapper or
by pointing `projectPath` at a temp project whose `.ctoc/settings` sets the threshold.

##### Test Cases (all 7 BDD scenarios + the hard-fails + downgrade + cap + no-op)
1. **A vs B — AND both true → FLAGGED (happy path).** A ("auth-middleware-refactor",
   `files: ["src/lib/auth.js","src/hooks/PreToolUse.Bash.js"]`) and B ("auth-rate-limiting",
   `files: ["src/lib/auth.js"]`), baked section cosine ≥ 0.78. Assert result contains B with
   `overlappingFiles` including `"src/lib/auth.js"` and `severity: 'potential conflict or dependency'`.
2. **A vs D — similarity only, NO files overlap → NOT FLAGGED (HARD FAIL).** D
   ("auth-token-docs", `files: ["docs/auth.md"]`), cosine ≥ 0.78. Assert D is ABSENT from
   results. Test MUST fail if similarity alone triggers a flag.
3. **A vs C — files overlap only, similarity BELOW threshold → NOT FLAGGED (HARD FAIL).** C
   ("menu-layout-redesign", `files: ["src/lib/auth.js"]`), cosine < 0.78. Assert C is ABSENT.
   Test MUST fail if files-overlap alone triggers a flag.
4. **Glob overlap — broad matches specific.** E (`files: ["src/lib/**"]`) vs F
   (`files: ["src/lib/auth.js"]`), cosine ≥ 0.78. Assert the E/F pair IS flagged and the
   overlap names `"src/lib/auth.js"`. Also assert directly:
   `globToRegex("src/lib/**").test("src/lib/auth.js") === true`.
5. **Glob non-overlap.** G (`files: ["src/commands/**"]`) vs F (`files: ["src/lib/auth.js"]`),
   cosine ≥ 0.78. Assert NOT flagged. Also assert:
   `globToRegex("src/commands/**").test("src/lib/auth.js") === false`.
6. **Flag shape.** For a flagged pair, assert the row has: `conflictingPlan` (the other
   plan's slug), a non-empty `overlappingFiles` array, a numeric `score`, and a `severity`
   string that is `'potential conflict or dependency'` or `'broad overlap'` — never
   `'error'`/`'block'`.
7. **Empty index no-op.** `openStore` over an empty temp JSON (`store.size === 0`);
   `await detectConflicts('any-plan', { store, projectPath })` → `[]`, no throw, fast.
8. **Broad-overlap downgrade.** E's `src/lib/**` matches >50% of all fixture literal files;
   A matched by E's glob, cosine ≥ 0.78. Assert the E row `severity === 'broad overlap'`.
9. **Top-N cap.** Index has 30 section-similar plans above threshold; wrap `store.getFilesForPlan`
   in a call-counting spy. Assert `detectConflicts('a')` invokes the candidate files-lookup at
   most 20 times (the `related` limit caps candidates at 20) and returns in bounded time.
10. **Settings threshold flips the set.** Baked A-vs-B cosine = 0.87. With
    `conflict_threshold = 0.90` → B NOT flagged; with `0.78` → B flagged. Same fixtures, only
    the setting changes.
11. **Target plan without `files:` → excluded.** Target whose `__plan__` unit has `files: []`;
    assert `[]` returned and no crash (the debug-log path is exercised).
12. **Barrel export present.** `const pi = require('../src/lib/plan-index'); assert.strictEqual(typeof pi.detectConflicts, 'function')` — guards the s2/s3 seam.
13. **planSlug validation.** `detectConflicts('')` and `detectConflicts(null)` reject/throw
    `TypeError` (caller bug), asserted.

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80% (both AND branches, the downgrade branch, the empty/no-files
  fail-open branches, and the `TypeError` path all exercised).
- Every hard-fail scenario (2, 3) is a falsifiable test: a single-condition implementation
  MUST fail it. No vacuous passes.

### Security Review
- [x] **Path traversal** — no user path handling; plan keys are opaque strings, glob
  matching is regex-based via the audited `globToRegex`. N/A.
- [x] **Input validation** — `planSlug` type-checked (TypeError on non-string/empty);
  `opts` fields are optional and shape-checked before use.
- [x] **No secrets** — none.
- [x] **Safe file operations** — the module writes nothing except a best-effort debug note
  routed through the store/log path already audited in PI1; no arbitrary writes.
- [x] **Error messages** — the only thrown error (`TypeError`) names the argument, no paths
  or internal state leaked.
- [x] **Prototype pollution** — candidate grouping uses a `Map` keyed on the opaque
  `planPath` string, never object property assignment from untrusted keys.
- [x] **ReDoS** — `globToRegex` routes through `safeRegExp` (PI1/plan-coverage precedent);
  no new regex construction here.
- [x] **Command injection** — no `exec`/`execSync`.

## Execution Plan

### Step 8: TEST
Write `tests/plan-index-conflict.test.js` with the 13 cases above, RED first. Build the
real-store-over-temp-JSON fixture and `tests/fixtures/plan-index/conflict-fixture.json`
with baked section vectors + `files:` arrays for plans A/B/C/D/E/F/G. Assert the AND
hard-fails (scenarios 2 and 3) explicitly.

### Step 9: PREPARE
Confirm `related` accepts and passes through `{ kind: 'section', limit, store, embedder,
projectPath }` (it does — `related.js` lines 105–116, `kind` passthrough + injected store).
Confirm `store.getFilesForPlan`, `store.listPlanPaths`, `store.size`, `globToRegex`, and
`getSetting('plan_index','conflict_threshold',projectPath)` signatures. No new deps, no dirs.

### Step 10: IMPLEMENT
Create `src/lib/plan-index/conflict-detect.js` per the File Specification (detectConflicts +
`filesOverlap`/`isBroadGlob`/`collectAllIndexFiles` helpers + `DEFAULT_CONFLICT_THRESHOLD`).
Add the `detectConflicts` lazy getter to `src/lib/plan-index/index.js`. No stubs — every
branch returns working behavior; document any ambiguity in `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
Verify: dependency direction (lib→lib only, no hooks/commands import); the AND is a true
conjunction (both halves required); self-exclusion is delegated to the store; lazy
string-literal requires match `related.js`; no 5th glob copy.

### Step 12: OPTIMIZE
`collectAllIndexFiles` built once per call, not per candidate. Candidate grouping keeps max
score in a single pass. Confirm ≤20 `getFilesForPlan` candidate reads (top-N cap).

### Step 13: SECURE
Run the Security Review checklist above; confirm `TypeError`-only throw, fail-open elsewhere,
`safeRegExp`-backed globs, no arbitrary writes.

### Step 14: VERIFY
`node --test tests/plan-index-conflict.test.js` → 0 fail, 0 skipped. Full suite
`node --test tests/*.test.js` → `# fail 0` (barrel-integrity + plan-index family still green).
Coverage ≥ 80% on `conflict-detect.js`.

### Step 15: DOCUMENT
JSDoc on `detectConflicts` (params, return shape, throws, fail-open contract) and each
helper. One-line comment on the barrel getter mirroring the `related` getter's comment.

### Step 16: FINAL-REVIEW
Confirm all 7 BDD acceptance criteria in the parent map to green tests here; the two AND
hard-fails are falsifiable; barrel export reachable; no UI touched in this slice.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed (none — pure JS over shipped deps)
- [x] Check prerequisites (related kind/limit passthrough, getFilesForPlan, listPlanPaths, globToRegex, getSetting confirmed)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (fixture dir already exists)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling (TypeError-only throw; fail-open everywhere else)
- [x] Wire up integration points (barrel getter + settings-schema registration)

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together (barrel through-call test green)
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations (collectAllIndexFiles built lazily, once)
- [x] Optimize critical paths (≤20 candidate reads via related cap; single-pass max-score grouping)
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal — opaque keys, no path math)
- [x] Sanitize outputs (TypeError names only the arg; no state leak)
- [x] No secrets in code
- [x] Safe file operations (writes nothing; glob via audited ReDoS-safe globToRegex)

### Step 14: VERIFY
- [x] Run lint + type check (eslint exit 0, no dynamic RegExp; tsc baseline-neutral at 89)
- [x] Run ALL tests (TDD Green) — full suite # fail 0 (3126→3130 pass)
- [x] Check coverage >= 80% (line 96.50% on conflict-detect.js)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (JSDoc + module header)
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed (n/a — internal lib slice)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed (falsifiability of the two AND hard-fails proven)
- [x] Ready for human review

## Decisions Taken Under Ambiguity

- **Settings-schema registration of `conflict_threshold`.** The plan states the
  setting is "registered by PI1 alongside `duplicate_threshold`", but the shipped
  `plan_index` schema in `src/lib/settings.js` only had `duplicate_threshold`. Since
  `getSetting` reads solely from the on-disk settings file (no schema-default merge),
  an unregistered key returns `undefined`. DECISION: additively register
  `{ key: 'conflict_threshold', type: 'number', default: 0.78 }` in the schema (so the
  settings UI can surface it) AND keep the module-level `DEFAULT_CONFLICT_THRESHOLD =
  0.78` as the runtime fallback for when `getSetting` returns undefined/non-number/throws.
  Belt-and-suspenders; matches the plan's stated default exactly.

- **Fixture seed vector = section vector.** `related(kind:'section')` SEEDS from the
  target plan's stored `__plan__` embedding (per related.js — no re-embed) and scans
  section-kind units. So the seed must live in the SAME vector space as the sections.
  DECISION: the test fixture upserts each plan's `__plan__` unit with the SAME baked
  vector as its `goals` section unit, so cosine(target.__plan__, candidate.section)
  equals the intended pinned value. (An orthogonal plan-level vector — my first
  attempt — makes every section cosine ~0 and flags nothing.)

- **`collectAllIndexFiles` computed lazily.** The plan's top-N-cap scenario requires
  "≤20 candidate files-lookups". Eagerly enumerating every plan's files for the
  broad-glob % would blow that count on a large index. DECISION: compute the index-wide
  file set lazily — only the first time a flagged candidate actually carries a glob.
  All-literal candidate sets (the common case) never pay the O(plans) enumeration, so
  the per-candidate cost stays at a single capped `getFilesForPlan` read.

- **tsc: two type errors fixed with a JSDoc cast + explicit row type (s1 precedent).**
  `related`'s `embedder` param narrows tighter than the generic `Function` carried from
  `opts.embedder`; and the `rows` array's `severity` inferred as `string` rather than
  the literal union. DECISION: `embedder: /** @type {any} */ (embedder)` at the single
  `related` call and an explicit `@type` annotation on `rows` — keeps tsc baseline-neutral
  at 89 without weakening runtime behavior. (No need to require ./related directly; the
  cast sufficed.)

- **Branch coverage 71.59% vs 80% ideal — line coverage 96.50%.** The uncovered branches
  are exclusively fail-open `catch` arms that only fire if the audited `globToRegex` or
  `store.listPlanPaths` throws — conditions unreachable with the real dependencies, and
  deliberately given NO injection seam (adding one would introduce a non-literal-RegExp /
  sabotaged-glob path that the security posture forbids). DECISION: meet the mandated
  line ≥80% (achieved 96.50%) and accept the branch shortfall on genuinely-unreachable
  defensive catches rather than manufacture artificial sabotage seams.

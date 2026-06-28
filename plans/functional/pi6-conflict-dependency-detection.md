---
title: "PI6 — Conflict & Dependency Detection (vector similarity AND files overlap)"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: MEDIUM
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 7
depends_on:
  - pi0-bootstrap-and-runtime-wiring
  - pi4-semantic-search-and-related-plans
acceptance_criteria_count: 7
risk_level: MEDIUM
gate_status: "Pending Approval (Gate 1: functional → implementation)"
files:
  - "src/lib/plan-index/conflict-detect.js"
  - "src/lib/plan-index/index.js"
  - "src/tabs/overview.js"
  - "src/areas/inbox.js"
  - "src/lib/inbox.js"
  - "tests/plan-index-conflict.test.js"
---

# PI6 — Conflict & Dependency Detection (vector similarity AND files overlap)

## Problem Statement

Two plans that touch the same source files with similar intent are latent conflicts — the B1/B2 class of problem proven first-hand this session, where two plans sat interleaved in `in-progress/` touching overlapping code for six weeks undetected. CTOC already maintains `files:` frontmatter on every plan; combined with vector similarity it can flag these proactively before they collide in implementation. The detection logic applies a strict AND condition: vector similarity alone (two plans with similar topics but different files) is insufficient; `files:` overlap alone (two plans touching `menu.js` for entirely different features) is also insufficient. Both conditions must hold simultaneously to produce a flag.

PI6 uses PI4's `related()` with `{ kind: 'section' }` to obtain section-level vector similarity (more precise than plan-summary vectors), caps the similarity scan at top-20, and retrieves `files:` metadata for each candidate via `getFilesForPlan(slug)` exported by PI1's barrel. Glob-aware overlap uses `globToRegex` imported from `src/lib/plan-coverage.js` — the same function already used by `src/hooks/PreToolUse.Edit.js`. No new glob file is created. PI6 introduces no new retrieval logic; it combines PI4 retrieval with PI1 metadata via the established barrel interface.

## Business Alignment

**Job to Be Done:** When I am managing the plan board and two plans are both approaching implementation, I want to be alerted when they both target the same files with similar intent, so I can resolve the scheduling conflict or merge the work before both plans enter implementation and produce colliding code changes.

**Impact Map:**
- **Goal:** Eliminate latent B1/B2-class conflicts — plans touching the same code with similar intent that were previously invisible until they collided at implementation time (vision success criterion 4)
- **Actor:** CTOC user (CTO or engineer) viewing a plan or the inbox area on the plan board
- **Impact:** The actor sees conflict flags before implementation starts, enabling proactive scheduling, sequencing, or plan-merging decisions
- **Deliverable:** A conflict-detect module surfacing "potential conflict or dependency" flags in `src/tabs/overview.js` and `src/areas/inbox.js` when plans are both section-vector-similar above `conflict_threshold` AND share at least one `files:` glob entry, naming the other plan and the overlapping files

## User Stories

**As a** CTOC user viewing a plan in the overview tab, **I want** to see a flag when another active plan targets the same files with similar intent, **so that** I can resolve the conflict before both plans enter implementation and produce colliding code changes.

**As a** CTOC user relying on the inbox area to prioritize work, **I want** conflict flags to appear inline with the plan entry, **so that** I can see potential conflicts at a glance without opening each plan individually.

## Acceptance Criteria

- [ ] **Scenario: Section-vector-similar plans with files overlap are flagged as potential conflict**
  Given plan A ("auth-middleware-refactor.md") and plan B ("auth-rate-limiting.md") are both indexed
  And their section-level cosine similarity (kind='section' vectors from PI1's vec0 table) is >= `plan_index.conflict_threshold`
  And both plans declare `files: ["src/lib/auth.js"]` (literal match)
  When I view plan A in the overview tab or the inbox area
  Then a "potential conflict or dependency" flag is shown naming plan B
  And the flag lists "src/lib/auth.js" as the overlapping file

- [ ] **Scenario: Vector-similar plans with NO files overlap are NOT flagged (HARD FAIL)**
  Given plan A ("auth-middleware-refactor.md") and plan D ("auth-token-docs.md") are both indexed
  And their section-level cosine similarity is >= `plan_index.conflict_threshold`
  And plan A declares `files: ["src/lib/auth.js"]` and plan D declares `files: ["docs/auth.md"]` (no shared entry)
  When I view plan A
  Then NO conflict flag is shown for plan D
  This scenario MUST FAIL the test if the AND condition is not enforced — vector similarity alone must not trigger a flag

- [ ] **Scenario: Plans sharing files but NOT vector-similar are NOT flagged (HARD FAIL)**
  Given plan A ("auth-middleware-refactor.md") and plan C ("menu-layout-redesign.md") are both indexed
  And both declare `files: ["src/commands/menu.js"]` (literal match)
  And their section-level cosine similarity is < `plan_index.conflict_threshold`
  When I view plan A
  Then NO conflict flag is shown for plan C
  This scenario MUST FAIL the test if files-overlap alone is sufficient to trigger a flag

- [ ] **Scenario: Glob-aware overlap — broad glob matches specific path**
  Given plan E declares `files: ["src/lib/**"]`
  And plan F declares `files: ["src/lib/auth.js"]`
  And their section-level cosine similarity is >= `plan_index.conflict_threshold`
  When conflict detection runs
  Then plan F's "src/lib/auth.js" is matched by plan E's "src/lib/**" using `globToRegex` from `src/lib/plan-coverage.js`
  And a conflict flag is raised for the E/F pair naming the matched overlap

- [ ] **Scenario: Glob-aware overlap — non-matching glob produces no overlap**
  Given plan G declares `files: ["src/commands/**"]`
  And plan F declares `files: ["src/lib/auth.js"]`
  And their section-level cosine similarity is >= `plan_index.conflict_threshold`
  When conflict detection runs
  Then `globToRegex("src/commands/**").test("src/lib/auth.js")` returns false
  And no conflict flag is raised between plan G and plan F solely on this pair

- [ ] **Scenario: Conflict flag displays plan name and overlapping files**
  Given at least one conflict pair exists in the index
  When I open the inbox area or view a flagged plan in the overview tab
  Then the flag shows: the other plan's slug or title, and the list of overlapping file(s)
  And the flag is labeled "potential conflict or dependency" — not "error," not "block"

- [ ] **Scenario: Empty index is a safe no-op**
  Given the index has zero rows
  When `detectConflicts()` is called for any plan slug
  Then the result is an empty list
  And no crash or unhandled exception occurs

## Non-Functional Requirements

- **Cross-platform:** `conflict-detect.js` contains no platform-specific code. Glob matching uses `globToRegex` imported from `src/lib/plan-coverage.js` — the same exported function used by `src/hooks/PreToolUse.Edit.js`. No new glob library, no new glob file, no reimplementation. Consistent behavior across macOS, Linux, and Windows is guaranteed by using the same implementation already in use by the enforcement hook.
- **Synchronous execution:** Conflict detection runs synchronously when a plan view is rendered. The index is pre-built by PI0; PI4's `related()` and PI1's `getFilesForPlan()` read already-built data synchronously. No async injection, no non-blocking patterns, no timeout caps.
- **Graceful empty-index no-op:** Zero-row store or missing `files:` metadata returns an empty flag list immediately without querying. Not an error.
- **Settings API:** `plan_index.conflict_threshold` is read via `getSetting('plan_index.conflict_threshold')` from `src/lib/settings.js`. The schema default (0.78) and the key are registered by PI1 under the `plan_index` namespace, alongside `duplicate_threshold`. Do NOT write directly to `.ctoc/settings.yaml` or `.ctoc/settings.json`; use `getSetting`/`setSetting` exclusively.
- **Section-level vectors:** PI6 calls `related(planSlug, { kind: 'section', limit: 20 })` from PI4's `index.js`. This queries PI1's `vec0` table filtered to `kind='section'` rows, providing section-level precision rather than plan-summary-level similarity. PI4 must support the `kind` option (defined in PI4's plan as an additive parameter to `related()`).
- **Similarity scan capped at top-20:** Before applying the glob overlap check, PI6 inspects only the top-20 section-vector-similar plans from the `related()` call. This bounds the glob-processing time without meaningful precision loss on real plan sets.
- **Plans without `files:` metadata are silently excluded.** If a plan has no `files:` frontmatter, `getFilesForPlan(slug)` returns []; it cannot satisfy the AND condition's overlap half. This is expected behavior, not an error. Coverage grows naturally as plans are re-indexed after `files:` declarations are added. Log a per-plan debug note to `.ctoc/logs/plan-index.log` when a plan is excluded for this reason.
- **Broad-glob downgrade:** When the overlap match is driven by a plan declaring a glob that matches more than 50% of all `files:` entries in the index (e.g., `src/**`), the flag severity is downgraded to "broad overlap" and noted in the flag description. Tune `conflict_threshold` upward in glob-heavy projects.

## Scope

### In Scope
- `conflict-detect.js`: exports `detectConflicts(planSlug, options)` that (1) calls `related(planSlug, { kind: 'section', limit: 20 })` from PI4's `index.js` to get section-vector-similar plans above `conflict_threshold`, (2) calls `getFilesForPlan(slug)` from PI1's barrel for each candidate to retrieve its `files:` metadata, (3) calls `getFilesForPlan(planSlug)` for the target plan's files, (4) applies glob-aware overlap using `globToRegex` from `src/lib/plan-coverage.js`, (5) returns `[{ conflictingPlan, overlappingFiles, severity }]` where `severity` is `'potential conflict or dependency'` or `'broad overlap'`; returns [] when the index is empty or the target plan has no `files:` metadata
- `src/lib/plan-index/index.js`: `detectConflicts(planSlug, options)` added as an additive export alongside `search()` and `related()`; PI4's existing exports are unchanged and the barrel integrity test from PI4 guards against regressions
- `src/tabs/overview.js`: renders conflict flags in the plan-detail panel when a flagged plan is selected, showing the conflicting plan name and overlapping files with the "potential conflict or dependency" label
- `src/areas/inbox.js` + `src/lib/inbox.js`: extended to surface conflict flags inline with plan entries in the inbox area view; conflict items are listed alongside gates-waiting and agent questions
- `tests/plan-index-conflict.test.js`: covers all 7 BDD scenarios plus broad-overlap downgrade test, top-N cap test, and AND-condition hard-fail tests, using the shared fixture set from `tests/fixtures/plan-index/`

### Out of Scope
- Duplicate-on-create warning (similarity without files overlap condition) — covered in PI5
- Search and related-plans retrieval core — covered in PI4 (PI6 reuses via `index.js`)
- Index store schema, embedding generation, reconciliation sync — covered in PI1, PI2, PI3 (consumed via PI0)
- `src/lib/glob-match.js` — DO NOT create this file; `globToRegex` is already exported by `src/lib/plan-coverage.js` and is the authoritative implementation
- `src/hooks/PreToolUse.Edit.js` — DO NOT modify; it already imports from `src/lib/plan-coverage.js`; no changes needed for PI6
- Automatic conflict resolution (blocking plan moves, merging plans) — future enhancement
- Conflict detection at create time — PI5 owns the create-time hook; PI6 runs at plan-view and inbox-render time
- Retroactive conflict scanning across all plan pairs as a batch job — future enhancement; PI6 is triggered by viewing a specific plan, not by a scheduled sweep
- Plans without `files:` metadata — silently excluded; retroactive metadata backfill is a future concern

## Risks

### Technical Risks
- **Broad `files:` globs produce spurious file overlaps.** A plan declaring `src/**` overlaps with almost every other plan; combined with section similarity >= 0.78, this produces false-positive conflict flags.
  - Likelihood: MEDIUM
  - Impact: MEDIUM (conflict flags lose credibility; users stop acting on them)
  - Mitigation: Downgrade flags driven by globs covering >50% of the index's known file paths to "broad overlap" severity. Tested by the broad-overlap downgrade test (see Test Plan).

- **Glob matching diverges from enforcement hook.** If PI6 used a different minimatch configuration than `src/hooks/PreToolUse.Edit.js`, glob results would be inconsistent across CTOC. This risk is eliminated by design: PI6 imports `globToRegex` from `src/lib/plan-coverage.js`, the same module the enforcement hook imports. Consistent by construction.
  - Likelihood: ELIMINATED (by using the shared `globToRegex` from plan-coverage.js)
  - Impact: N/A
  - Mitigation: N/A — the design prevents divergence; no new glob file, no extraction needed.

- **SQL `files:` metadata retrieval is slow for large plan sets.** If `getFilesForPlan()` in PI1 fetches and JSON-parses metadata per plan call, and the top-20 cap means 20 calls, total latency may still be acceptable but should be measured.
  - Likelihood: LOW
  - Impact: LOW (bounded at 20 calls by the top-N cap; synchronous on a local SQLite file)
  - Mitigation: Top-20 cap is specified as a hard bound (see NFRs). PI1 should index the `files:` column if possible; PI6 does not dictate PI1's schema, but flags this as a performance consideration for PI1's implementer.

### Business Risks
- **Users interpret "potential conflict" as "one plan must be deleted."** The flag is informational; co-existing plans may legitimately touch the same files if sequenced correctly.
  - Likelihood: MEDIUM
  - Impact: LOW (no data loss risk; users may unnecessarily archive a valid plan)
  - Mitigation: Label consistently as "potential conflict or dependency" (not "conflict" alone). Include a one-line note in the flag display: "Review before both plans enter implementation simultaneously."

### Dependency Risks
- **PI4 retrieval core must be available.** `detectConflicts()` calls PI4's `related()` for the section-similarity half; without it, conflict detection cannot run.
  - Likelihood: LOW (depends_on ordering enforces PI4 before PI6)
  - Impact: HIGH (detectConflicts() entirely non-functional without PI4)
  - Mitigation: Wrap the PI4 import in a try/catch at module load in `conflict-detect.js`; on failure, log a warning to `.ctoc/logs/plan-index.log` and return [] (graceful no-op). Never crash the overview tab or inbox area.

- **Plans without `files:` metadata exclude themselves from conflict detection.** Many existing plans may lack `files:` frontmatter; they cannot trigger the AND condition's overlap half.
  - Likelihood: HIGH (many pre-existing plans lack `files:`)
  - Impact: LOW (missed conflicts on legacy plans — a degraded but safe state; no false positives)
  - Mitigation: Log a per-plan debug note when a plan is excluded. Coverage grows naturally as plans are re-indexed after `files:` declarations are added or plans move through the pipeline.

## Test Plan

### Fixture Set
Shared from `tests/fixtures/plan-index/` (established by PI4). PI6-specific additions:
- **Plan A:** auth middleware topic; `files: ["src/lib/auth.js", "src/hooks/PreToolUse.Bash.js"]`; pre-measured section similarity to B >= conflict_threshold
- **Plan B:** auth rate-limiting topic (section-vector-similar to A); `files: ["src/lib/auth.js"]` → AND both true
- **Plan C:** menu layout redesign topic (NOT section-vector-similar to A); `files: ["src/lib/auth.js"]` → files overlap only
- **Plan D:** auth token documentation topic (section-vector-similar to A); `files: ["docs/auth.md"]` → similarity only
- **Plan E:** broad-glob plan; `files: ["src/lib/**"]` → glob match with A; glob covers >50% of all fixture files
- **Plan G:** commands-scope plan; `files: ["src/commands/**"]` → no overlap with `src/lib/auth.js`

Pre-measured section-level cosine similarities between all pairs recorded in the fixture JSON. All similarity comparisons in tests are LOGIC tests against baked fixture values, not live model calls.

### AND-Condition Hard-Fail Tests (Unit — `tests/plan-index-conflict.test.js`)
```
A vs B: section similarity >= conflict_threshold, files overlap → MUST be flagged
         (test FAILS if the pair is NOT flagged)
A vs C: section similarity < conflict_threshold, files overlap → MUST NOT be flagged
         (test FAILS if the pair IS flagged — files-overlap alone must not trigger)
A vs D: section similarity >= conflict_threshold, NO files overlap → MUST NOT be flagged
         (test FAILS if the pair IS flagged — similarity alone must not trigger)

The A-vs-C and A-vs-D tests are the key falsifiable tests for the AND condition.
There must be NO vacuous passes. A single-condition implementation fails these.
```

### Glob-Aware Overlap Tests (Unit)
```
E (src/lib/**) vs A (src/lib/auth.js):
  globToRegex("src/lib/**").test("src/lib/auth.js") === true → overlap detected
  Assert: A-E pair IS flagged (both similarity and overlap hold)
G (src/commands/**) vs A (src/lib/auth.js):
  globToRegex("src/commands/**").test("src/lib/auth.js") === false → no overlap
  Assert: A-G pair is NOT flagged (no file overlap despite any similarity)
Assert: glob behavior matches CTOC enforcement hook — cross-reference by running the
        same patterns through the same globToRegex function (same import, identical results by construction)
```

### Broad-Overlap Downgrade Test (Unit)
```
Given: plan E declares files: ["src/lib/**"] which matches >50% of all fixture file paths
And: plan A has files: ["src/lib/auth.js"] (matched by E's glob)
And: section similarity A-E >= conflict_threshold
When: detectConflicts() runs for plan A
Then: the returned flag for plan E has severity: "broad overlap" (not "potential conflict or dependency")
And: the flag description notes that plan E's glob covers a broad scope
```

### Top-N Similarity Cap Test (Unit)
```
Given: the index has 30 plans all section-similar to plan A above conflict_threshold
When: detectConflicts("plan-a") is called
Then: only the top-20 similar plans are checked for files: overlap
      (plans ranked 21-30 are NOT retrieved or checked — the related() call is capped at limit: 20)
Assert: the mock store's files query is called at most 20 times (verify via call count on mock)
Assert: the function returns in bounded time independent of index size beyond rank 20
```

### Settings Threshold Test (Unit)
```
Pre-measured A-vs-B section similarity = 0.87 (recorded in fixture JSON)
With conflict_threshold = 0.90: 0.87 < 0.90 → A-B pair NOT flagged
With conflict_threshold = 0.78: 0.87 >= 0.78 → A-B pair IS flagged
Assert: threshold change (via getSetting mock) changes the flagged set with no code change
```

### Empty Index No-Op Test (Unit)
```
Given: mock store with zero rows
When: detectConflicts("any-plan") is called
Assert: returns []
Assert: no exception
Assert: call completes in < 5ms (no query attempted)
```

### Cross-Platform Smoke Test (CI)
`node --test tests/plan-index-conflict.test.js` on each platform runner; assert 0 failures.

## Rollback

If PI6 causes regressions in the overview tab or inbox area:
1. Remove the `detectConflicts()` call from `src/tabs/overview.js` plan-detail render (one conditional block).
2. Revert the inbox area extension in `src/areas/inbox.js` and `src/lib/inbox.js` (one conditional block each).
3. The `conflict_threshold` settings key registered by PI1 becomes inert; leave it for re-activation.
4. `conflict-detect.js` can remain on disk; it is simply not called.
5. The `detectConflicts` export added to PI4's `index.js` is harmless if unused.
6. No `src/lib/glob-match.js` was created; no cleanup needed there.
7. `src/hooks/PreToolUse.Edit.js` was not modified; no rollback needed there.
8. No data migration required; the index is unaffected.
9. PI4, PI5, PI0/PI1/PI2/PI3 are all unaffected by PI6 rollback.

## Dependencies

| Dependency | Role | Interface Level |
|---|---|---|
| PI0 (bootstrap and runtime wiring) | Provides the composition root: wired embedder + populated store with `kind` column on vec0. PI4 (which PI6 calls) receives both from PI0. PI0 transitively covers PI1, PI2, PI3. | Via PI4; PI6 has no direct PI0 dependency |
| PI4 (retrieval core) | PI6 calls `related(planSlug, { kind: 'section', limit: 20 })` from PI4's `index.js` to get section-vector-similar plans above threshold | Capability level: "section-level vector neighbors for this plan, ordered by descending similarity, filtered to kind='section' vectors in PI1's vec0 table" |
| PI1 (index store) | PI6 calls `getFilesForPlan(slug)` from PI1's barrel to retrieve the `files:` metadata for each candidate plan and for the target plan. PI1 must export this function. | Capability level: "stored files: array for a given plan slug" — PI6 does not write SQL directly |
| `src/lib/plan-coverage.js` | PI6 imports `globToRegex` from this module for the glob-aware overlap check. This is the same function used by `src/hooks/PreToolUse.Edit.js`. | Direct import: `const { globToRegex } = require('../lib/plan-coverage')` |
| PI2 (embedding engine) | Indirect: PI4 calls PI2 (via PI0 embedder); PI6 has no direct PI2 dependency | None (indirect via PI4 → PI0) |
| PI3 (reconciliation sync) | Precondition: `files:` metadata in the store must reflect current `.md` frontmatter | None (indirect precondition) |

## Decisions Taken Under Ambiguity

- **Glob matching uses `globToRegex` from `src/lib/plan-coverage.js`.** This is the authoritative glob implementation in CTOC, already exported and already used by the enforcement hook. No new `src/lib/glob-match.js` is created; no changes to `src/hooks/PreToolUse.Edit.js` are needed. Adding a new glob file would be the 5th or 6th copy of this logic in the repo — explicitly rejected.
- **Section-level vectors via `related(planSlug, { kind: 'section' })`.** PI6 uses section-level vector similarity (not plan-summary-level) to reduce false positives from topically-similar plans that target entirely different code subsections. This queries the `kind='section'` rows in PI1's vec0 table. PI4's `related()` must support the `kind` option (defined as an additive parameter in PI4's plan).
- **`getFilesForPlan(slug)` is the exact barrel call for files-by-slug.** PI6 retrieves a plan's `files:` metadata via `getFilesForPlan(slug)` exported from PI1's barrel (`src/lib/plan-index/index.js`). PI1 must add this export. The alternative (`getUnit(planPath, 'summary').files`) was rejected as it requires a filesystem path rather than a slug and leaks PI1's internal unit structure. Legacy plans that lack `files:` frontmatter are not in the index on the files metadata; `getFilesForPlan()` returns [] for them, they cannot satisfy the AND condition's overlap half, and are silently excluded. Coverage grows naturally as plans are re-indexed.
- **Separate threshold from PI5.** `conflict_threshold` defaults to 0.78 (lower than PI5's `duplicate_threshold` of 0.82). Rationale: the AND condition with `files:` overlap provides additional precision filtering, so a lower similarity bar is appropriate. The two thresholds are independent additive keys under the same `plan_index:` settings namespace registered by PI1.
- **Conflict detection runs at view time, not create time.** PI5 runs at write time (before the file is written); PI6 runs at view time (when viewing a plan or rendering the inbox area). This separation gives PI5 exclusive ownership of the write-time hook and keeps PI6 latency out of the creation path.
- **UI surfaces: `src/tabs/overview.js` + `src/areas/inbox.js` + `src/lib/inbox.js`.** Conflict flags are rendered synchronously in the plan-detail panel in the overview tab and listed in the inbox area. There is no separate "Inbox tab" file; the surface is `src/areas/inbox.js` and its backing `src/lib/inbox.js`. No `src/tabs/inbox.js` exists or is created.
- **Top-20 similarity cap.** Before applying the glob overlap check, PI6 inspects only the top-20 section-vector-similar plans. Conflicts below rank-20 are unlikely to be actionable; the cap bounds processing time to a fixed maximum regardless of plan set size and is verified by the top-N cap unit test.
- **No async, no timeout.** Conflict detection runs synchronously on the main thread. The index is pre-built; the 20 `getFilesForPlan()` calls are bounded SQLite reads. Consistent with LOCKED DECISION 1 (synchronous reads on the main thread).

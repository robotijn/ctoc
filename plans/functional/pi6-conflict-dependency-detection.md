---
title: "PI6 — Conflict & Dependency Detection (vector similarity AND files overlap)"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: MEDIUM
parent_vision: local-semantic-plan-index
program: ctoc-planning-intelligence
order: 6
depends_on:
  - pi1-index-store-and-schema
  - pi2-embedding-engine
  - pi3-reconciliation-sync
  - pi4-semantic-search-and-related-plans
acceptance_criteria_count: 7
risk_level: MEDIUM
gate_status: "Pending Approval (Gate 1: functional → implementation)"
files:
  - "src/lib/plan-index/conflict-detect.js"
  - "src/lib/plan-index/index.js"
  - "src/commands/menu.js"
  - ".ctoc/settings.yaml"
  - "tests/plan-index-conflict.test.js"
---

# PI6 — Conflict & Dependency Detection (vector similarity AND files overlap)

## Problem Statement

Two plans that touch the same source files with similar intent are latent conflicts — the B1/B2 class of problem proven first-hand this session, where two plans sat interleaved in `in-progress/` touching overlapping code for six weeks undetected. CTOC already maintains `files:` frontmatter on every plan; combined with vector similarity it can flag these proactively before they collide in implementation. The detection logic applies a strict AND condition: vector similarity alone (two plans with similar topics but different files) is insufficient; `files:` overlap alone (two plans touching `menu.js` for entirely different features) is also insufficient. Both conditions must hold simultaneously to produce a flag. PI6 reuses PI4's retrieval core for the similarity half and PI1's stored `files:` metadata for the overlap half; it introduces no new retrieval logic.

## Business Alignment

**Job to Be Done:** When I am managing the plan board and two plans are both approaching implementation, I want to be alerted when they both target the same files with similar intent, so I can resolve the scheduling conflict or merge the work before both plans enter implementation and produce colliding code changes.

**Impact Map:**
- **Goal:** Eliminate latent B1/B2-class conflicts — plans touching the same code with similar intent that were previously invisible until they collided at implementation time (vision success criterion 4)
- **Actor:** CTOC user (CTO or engineer) viewing a plan or the Inbox tab on the plan board
- **Impact:** The actor sees conflict flags before implementation starts, enabling proactive scheduling, sequencing, or plan-merging decisions
- **Deliverable:** A conflict-detect module surfacing "potential conflict or dependency" flags in the menu when plans are both vector-similar above `conflict_threshold` AND share at least one `files:` glob entry, naming the other plan and the overlapping files

## User Stories

**As a** CTOC user viewing a plan on the plan board, **I want** to see a flag when another active plan targets the same files with similar intent, **so that** I can resolve the conflict before both plans enter implementation and produce colliding code changes.

**As a** CTOC user relying on the Inbox tab to prioritize work, **I want** conflict flags to appear inline with the plan entry, **so that** I can see potential conflicts at a glance without opening each plan individually.

## Acceptance Criteria

- [ ] **Scenario: Vector-similar plans with files overlap are flagged as potential conflict**
  Given plan A ("auth-middleware-refactor.md") and plan B ("auth-rate-limiting.md") are both indexed
  And their cosine similarity is >= `plan_index.conflict_threshold`
  And both plans declare `files: ["src/lib/auth.js"]` (literal match)
  When I view plan A in the menu or the Inbox tab
  Then a "potential conflict or dependency" flag is shown naming plan B
  And the flag lists "src/lib/auth.js" as the overlapping file

- [ ] **Scenario: Vector-similar plans with NO files overlap are NOT flagged**
  Given plan A ("auth-middleware-refactor.md") and plan D ("auth-token-docs.md") are both indexed
  And their cosine similarity is >= `plan_index.conflict_threshold`
  And plan A declares `files: ["src/lib/auth.js"]` and plan D declares `files: ["docs/auth.md"]` (no shared entry)
  When I view plan A in the menu
  Then NO conflict flag is shown for plan D
  And this confirms: vector similarity alone does not trigger a flag

- [ ] **Scenario: Plans sharing files but NOT vector-similar are NOT flagged**
  Given plan A ("auth-middleware-refactor.md") and plan C ("menu-layout-redesign.md") are both indexed
  And both declare `files: ["src/commands/menu.js"]` (literal match)
  And their cosine similarity is < `plan_index.conflict_threshold`
  When I view plan A in the menu
  Then NO conflict flag is shown for plan C
  And this confirms: files overlap alone does not trigger a flag

- [ ] **Scenario: Glob-aware overlap — broad glob matches specific path**
  Given plan E declares `files: ["src/lib/**"]`
  And plan F declares `files: ["src/lib/auth.js"]`
  And their cosine similarity is >= `plan_index.conflict_threshold`
  When conflict detection runs
  Then plan F's "src/lib/auth.js" is matched by plan E's "src/lib/**" using minimatch-style glob
  And a conflict flag is raised for the E/F pair naming the matched overlap

- [ ] **Scenario: Glob-aware overlap — non-matching glob produces no overlap**
  Given plan G declares `files: ["src/commands/**"]`
  And plan F declares `files: ["src/lib/auth.js"]`
  And their cosine similarity is >= `plan_index.conflict_threshold`
  When conflict detection runs
  Then "src/lib/auth.js" does NOT match "src/commands/**"
  And no conflict flag is raised between plan G and plan F solely on this pair

- [ ] **Scenario: Conflict flag displays plan name and overlapping files in the menu**
  Given at least one conflict pair exists in the index
  When I open the Inbox tab or view a flagged plan
  Then the flag shows: the other plan's slug or title, and the list of overlapping file(s)
  And the flag is labeled "potential conflict or dependency" — not "error," not "block"

- [ ] **Scenario: Empty index is a safe no-op**
  Given the index has zero rows
  When `detectConflicts()` is called for any plan slug
  Then the result is an empty list
  And no crash or unhandled exception occurs

## Non-Functional Requirements

- **Cross-platform:** `conflict-detect.js` contains no platform-specific code. Glob matching uses the same minimatch-style matcher CTOC's enforcement hook already uses — no new library introduced; consistent behavior across macOS, Linux, and Windows guaranteed by using the same implementation.
- **Async non-blocking:** All conflict detection calls are async; they do not block menu rendering. Results are injected into the plan view or Inbox tab asynchronously once available.
- **Graceful empty-index no-op:** Zero-row store or missing `files:` metadata returns an empty flag list immediately without querying. Not an error.
- **Settings namespace:** `plan_index.conflict_threshold` in `.ctoc/settings.yaml` — a separate, independent key from `plan_index.duplicate_threshold`. Both exist under the same `plan_index:` namespace (additive keys, not replacement).
- **Glob-matching consistency:** The glob match MUST use the same minimatch-style logic as `src/hooks/PreToolUse.Edit.js`. No new glob library. If the enforcement hook does not already export a utility function, PI6 extracts it to `src/lib/glob-match.js` and imports from both sites. This extraction is in scope for PI6.
- **Plans without `files:` metadata are silently excluded.** If a plan has no `files:` frontmatter, it cannot satisfy the AND condition's overlap half. This is expected behavior, not an error. Log a per-plan debug note when a plan is excluded for this reason.
- **Similarity scan capped at top-20.** Before applying the glob overlap check, PI6 inspects only the top-20 vector-similar plans from PI4's `related()` call. This bounds the glob processing time without meaningful precision loss on real plan sets.

## Scope

### In Scope
- `conflict-detect.js`: exports `detectConflicts(planSlug, options)` that (1) calls PI4's `related(planSlug)` to get vector-similar plans above `conflict_threshold` (capped at top-20), (2) retrieves each similar plan's `files:` metadata from PI1's store, (3) applies glob-aware overlap check against the target plan's `files:` list, (4) returns `[{ conflictingPlan, overlappingFiles }]` pairs where BOTH conditions hold; returns empty array when the index is empty or the plan has no `files:` metadata
- `index.js` (PI4's public API module): add `detectConflicts(planSlug, options)` as an additive export alongside the existing `search()` and `related()` exports; PI4's existing exports are unchanged
- `menu.js`: updated to display conflict flags in plan-view and Inbox tab as "potential conflict or dependency" notices with the conflicting plan name and overlapping files
- `.ctoc/settings.yaml`: addition of `plan_index.conflict_threshold` with explanatory comment:
  ```yaml
  plan_index:
    # conflict_threshold: cosine similarity floor (0.0–1.0) for conflict detection.
    # Applied TOGETHER with files: overlap (AND condition). Set lower than
    # duplicate_threshold because the AND condition provides additional precision —
    # 0.78 similarity plus files overlap is a meaningful signal. Tune upward if
    # broad-glob plans produce too many flags.
    conflict_threshold: 0.78
  ```
- `src/lib/glob-match.js` (conditional): if the enforcement hook's minimatch-style logic is not already exported as a utility, PI6 extracts it here so both the enforcement hook and PI6 share one implementation; this is a pure refactor with no behavior change to the hook
- `tests/plan-index-conflict.test.js`: covers all 7 BDD scenarios using the shared fixture set from `tests/fixtures/plan-index/`

### Out of Scope
- Duplicate-on-create warning (similarity without files overlap condition) — covered in PI5
- Search and related-plans retrieval core — covered in PI4 (PI6 reuses it via `index.js`)
- Index store schema, embedding generation, reconciliation sync — covered in PI1, PI2, PI3
- Automatic conflict resolution (blocking plan moves, merging plans) — future enhancement
- Conflict detection at create time — PI5 owns the create-time hook; PI6 runs at plan-view and Inbox-render time
- Retroactive conflict scanning across all plan pairs as a batch job — future enhancement; PI6 is triggered by viewing a specific plan, not by a scheduled sweep
- Plans without `files:` metadata — silently excluded; not flagged, not warned; retroactive metadata backfill is a future concern

## Risks

### Technical Risks
- **Broad `files:` globs produce spurious file overlaps.** A plan declaring `src/**` overlaps with almost every other plan; combined with similarity >= 0.78, this produces false-positive conflict flags.
  - Likelihood: MEDIUM
  - Impact: MEDIUM (conflict flags lose credibility; users stop acting on them)
  - Mitigation: When the overlap match is driven by a glob that matches >50% of all `files:` entries in the index, downgrade the flag severity to "broad overlap" and note it in the flag description. Tune `conflict_threshold` upward for glob-heavy projects.

- **Glob matching diverges from enforcement hook.** If PI6 uses a different minimatch configuration than `src/hooks/PreToolUse.Edit.js`, glob results will be inconsistent across CTOC (a file is "covered" per enforcement but not "overlapping" per conflict detection).
  - Likelihood: LOW
  - Impact: MEDIUM (user confusion, trust erosion in both enforcement and conflict detection)
  - Mitigation: Extract the enforcement hook's glob matcher to `src/lib/glob-match.js` and import it in both the hook and `conflict-detect.js`. This is a mechanical refactor with no behavioral change to the hook.

- **SQL `files:` metadata retrieval is slow for large plan sets.** If PI1 stores `files:` as a JSON array column, fetching and comparing across many plans requires JS-side JSON parsing.
  - Likelihood: LOW
  - Impact: MEDIUM (slow conflict detection in large plan sets)
  - Mitigation: Cap the similarity scan to top-20 (as specified in NFRs). PI1 should index the `files:` column if possible; PI6 does not dictate PI1's schema, but flags this as a performance consideration for PI1's implementer.

### Business Risks
- **Users interpret "potential conflict" as "one plan must be deleted."** The flag is informational; co-existing plans may legitimately touch the same files if sequenced correctly.
  - Likelihood: MEDIUM
  - Impact: LOW (no data loss risk; users may unnecessarily archive a valid plan)
  - Mitigation: Label consistently as "potential conflict or dependency" (not "conflict" alone). Include a one-line note in the flag display: "Review before both plans enter implementation simultaneously."

### Dependency Risks
- **PI4 retrieval core must be available.** `detectConflicts()` calls PI4's `related()` for the similarity half; without it, conflict detection cannot run.
  - Likelihood: LOW (depends_on ordering enforces PI4 before PI6)
  - Impact: HIGH (detectConflicts() entirely non-functional without PI4)
  - Mitigation: Same guard as PI5 — wrap the PI4 import in a try/catch at module load; on failure, log a warning and return empty flag list (graceful no-op). Never crash the menu.

- **Plans without `files:` metadata exclude themselves from conflict detection.** Many existing plans may lack `files:` frontmatter; they cannot trigger the AND condition's overlap half.
  - Likelihood: HIGH (many pre-existing plans lack `files:`)
  - Impact: LOW (missed conflicts on legacy plans — a degraded but safe state; no false positives)
  - Mitigation: Log a per-plan debug note when a plan is excluded. Document that conflict detection requires `files:` on both plans in the flag display tooltip. Retroactive metadata backfill is a future enhancement.

## Test Plan

### Fixture Set
Shared from `tests/fixtures/plan-index/` (established by PI4). PI6-specific additions:
- **Plan A:** auth middleware topic; `files: ["src/lib/auth.js", "src/hooks/PreToolUse.Bash.js"]`
- **Plan B:** auth rate-limiting topic (vector-similar to A); `files: ["src/lib/auth.js"]` → AND both true
- **Plan C:** menu layout redesign topic (NOT vector-similar to A); `files: ["src/lib/auth.js"]` → files overlap only
- **Plan D:** auth token documentation topic (vector-similar to A); `files: ["docs/auth.md"]` → similarity only
- **Plan E:** broad-glob plan; `files: ["src/lib/**"]` → glob match with A
- **Plan G:** commands-scope plan; `files: ["src/commands/**"]` → no overlap with `src/lib/auth.js`

Pre-measured cosine similarities between all pairs recorded in the fixture JSON for deterministic assertions.

### AND-Condition Falsifiable Tests (Unit — `tests/plan-index-conflict.test.js`)
```
A vs B: similarity >= conflict_threshold, files overlap → MUST be flagged
A vs C: similarity < conflict_threshold, files overlap → MUST NOT be flagged
A vs D: similarity >= conflict_threshold, NO files overlap → MUST NOT be flagged
```
The A-vs-D test is the key falsifiable test: "vector-similar but no files overlap => NOT flagged." It FAILS if the AND condition is not enforced. No vacuous passes.

### Glob-Aware Overlap Tests (Unit)
```
E (src/lib/**) vs A (src/lib/auth.js): minimatch("src/lib/auth.js", "src/lib/**") = true → overlap detected
G (src/commands/**) vs A (src/lib/auth.js): minimatch("src/lib/auth.js", "src/commands/**") = false → no overlap
Assert: results consistent with CTOC enforcement hook's minimatch behavior
  (cross-reference by running the same patterns through the enforcement hook's matcher)
```

### Settings Threshold Test (Unit)
```
Pre-measured A-vs-B similarity = 0.87 (recorded in fixture JSON)
With conflict_threshold = 0.90: 0.87 < 0.90 → A-B pair NOT flagged
With conflict_threshold = 0.78: 0.87 >= 0.78 → A-B pair IS flagged
Assert: threshold change changes the flagged set with no code change
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

If PI6 causes regressions in the menu plan-view or Inbox tab:
1. Remove the `detectConflicts()` call from `menu.js` plan-view and Inbox render (one conditional block each).
2. The `conflict_threshold` key in `.ctoc/settings.yaml` becomes inert; leave it for re-activation.
3. `conflict-detect.js` can remain on disk; it is simply not called.
4. The `detectConflicts` export added to PI4's `index.js` is harmless if unused.
5. If `src/lib/glob-match.js` was extracted, it remains (the enforcement hook already imports it; removing it would break the hook).
6. No data migration required; the index is unaffected.
7. PI4, PI5, PI1/PI2/PI3 are all unaffected by PI6 rollback.

## Dependencies

| Dependency | Role | Interface Level |
|---|---|---|
| PI4 (retrieval core) | PI6 calls `related(planSlug)` from PI4's `index.js` to get vector-similar plans above threshold | Capability level: "plans similar to this plan, ordered by descending similarity" |
| PI1 (index store) | PI6 reads `files:` metadata for each candidate plan from PI1's store; this is the overlap-check data source | Capability level: "stored files: metadata for a given plan slug" — not direct SQL |
| PI2 (embedding engine) | Indirect: PI4 calls PI2; PI6 has no direct PI2 dependency | None (indirect via PI4) |
| PI3 (reconciliation sync) | Precondition: `files:` metadata in the store must reflect current `.md` frontmatter | None (indirect precondition) |

## Decisions Taken Under Ambiguity

- **Glob matching reuses CTOC enforcement hook.** `files:` overlap uses the same minimatch-style logic as `src/hooks/PreToolUse.Edit.js` — not a new library, not a reimplementation. If no utility is currently exported by the hook, PI6 extracts it to `src/lib/glob-match.js`; this extraction is in scope for PI6.
- **Separate threshold from PI5.** `conflict_threshold` defaults to 0.78 (lower than PI5's `duplicate_threshold` of 0.82). Rationale: the AND condition with `files:` overlap already provides precision filtering, so a lower similarity bar is appropriate. The two thresholds are independent additive keys under the same `plan_index:` namespace.
- **PI6 adds `detectConflicts()` to PI4's `index.js`.** All plan-index capabilities are accessed through a single public API module. PI6 adds one export to that module rather than creating a second entry point. PI4's existing exports are unchanged.
- **Files-less plans silently excluded.** Plans without `files:` frontmatter cannot satisfy the AND condition's overlap half. This is deliberate: forcing retroactive `files:` declaration on all existing plans would be a breaking change to CTOC's plan conventions.
- **Top-20 similarity cap.** Before applying the glob overlap check, PI6 inspects only the top-20 vector-similar plans from PI4's `related()` call. Conflicts below rank-20 are unlikely to be actionable; the cap bounds processing time to a fixed maximum regardless of plan set size.
- **Conflict detection runs at view time, not create time.** PI5 runs at create time (before the file is written); PI6 runs at view time (when viewing a plan or the Inbox). This separation prevents PI6 from adding latency to the create path and gives PI5 exclusive ownership of the create-time hook.

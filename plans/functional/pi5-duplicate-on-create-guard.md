---
title: "PI5 — Duplicate-on-Create Guard (warns, never blocks)"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: MEDIUM
parent_vision: local-semantic-plan-index
program: ctoc-planning-intelligence
order: 5
depends_on:
  - pi1-index-store-and-schema
  - pi2-embedding-engine
  - pi3-reconciliation-sync
  - pi4-semantic-search-and-related-plans
acceptance_criteria_count: 7
risk_level: MEDIUM
gate_status: "Pending Approval (Gate 1: functional → implementation)"
files:
  - "src/lib/plan-index/duplicate-guard.js"
  - "src/lib/actions.js"
  - "src/commands/menu.js"
  - ".ctoc/settings.yaml"
  - "tests/plan-index-duplicate-guard.test.js"
---

# PI5 — Duplicate-on-Create Guard (warns, never blocks)

## Problem Statement

The decompose→refine pipeline has shipped overlapping and duplicate plans that nobody caught — proven first-hand this session: the prior HANDOFF records a phantom backlog of duplicate plans that required hand-cleaning, and the decompose→refine pipeline produced overlapping plans nobody caught at creation time. When a user or agent creates a plan that is semantically close to an existing one, the system must raise a warning naming the overlap with similarity scores, while always allowing creation to proceed. PI5 sits at the create-plan boundary in `actions.js` and delegates entirely to PI4's retrieval core — it introduces no new retrieval logic, only a threshold comparison and a warning surface in the menu.

## Business Alignment

**Job to Be Done:** When I create a new plan through the menu or via a pipeline agent, I want to be warned immediately if a semantically similar plan already exists naming the overlap, so I can decide whether to merge, differentiate, or proceed knowingly — instead of discovering the duplication weeks later during a hand-clean.

**Impact Map:**
- **Goal:** Prevent silent accumulation of phantom and duplicate backlog (vision success criterion 3; vision problem statement item 2)
- **Actor:** CTOC user (CTO or engineer) creating a plan via the menu; pipeline agents (vision-decomposer, product-owner) creating plans programmatically through `actions.js`
- **Impact:** The actor is informed of semantic duplicates at creation time, not retroactively; they can act on the information or dismiss it and proceed without being blocked
- **Deliverable:** A duplicate-guard hook in the `actions.js` create flow, reading a tunable threshold from `.ctoc/settings.yaml` under the `plan_index:` namespace, surfacing a named warning in the menu when triggered

## User Stories

**As a** CTOC user creating a new plan, **I want** to be warned when a semantically similar plan already exists, naming the overlapping plan(s) and their similarity scores, **so that** I can decide whether to merge, differentiate, or proceed knowingly.

**As a** pipeline agent (vision-decomposer or product-owner) creating plans via `actions.js`, **I want** the duplicate guard to run transparently on every creation without blocking, **so that** the pipeline self-monitors for redundant work without requiring manual review.

## Acceptance Criteria

- [ ] **Scenario: Semantically near plan raises a named warning with similarity score**
  Given a plan "auth-middleware-refactor.md" is indexed
  And its cosine similarity to a new draft "auth-layer-cleanup.md" exceeds `plan_index.duplicate_threshold` in settings.yaml
  When I create "auth-layer-cleanup.md" via the menu or via `actions.js`
  Then a warning is displayed naming "auth-middleware-refactor.md" and showing the similarity score (e.g. "similarity: 0.87")
  And the warning is advisory only — "auth-layer-cleanup.md" is created regardless

- [ ] **Scenario: Novel plan raises no warning**
  Given the index contains plans about auth, quality gates, and plan state
  When I create a new plan "saas-billing-integration.md" with clearly distinct summary content
  Then no duplicate warning is shown

- [ ] **Scenario: Creation always succeeds regardless of similarity**
  Given a plan summary that triggers a duplicate warning (similarity exceeds threshold)
  When I proceed through the create flow
  Then the plan file is created on disk
  And the process does not exit, throw a blocking error, or require user confirmation to continue

- [ ] **Scenario: High threshold (0.90) suppresses warning at 0.85 similarity**
  Given `plan_index.duplicate_threshold: 0.90` in `.ctoc/settings.yaml`
  When I create a plan whose draft summary has cosine similarity 0.85 to an existing plan
  Then no warning is raised (0.85 < 0.90)

- [ ] **Scenario: Low threshold (0.70) raises warning at 0.85 similarity**
  Given `plan_index.duplicate_threshold: 0.70` in `.ctoc/settings.yaml`
  When I create a plan whose draft summary has cosine similarity 0.85 to an existing plan
  Then a warning is raised (0.85 >= 0.70)
  And changing the threshold setting from 0.90 to 0.70 changes the behavior with no code change

- [ ] **Scenario: Empty index is a safe no-op**
  Given the index has zero rows (not yet built or recently cleared)
  When I create any plan
  Then no duplicate warning is shown
  And no crash or unhandled exception occurs
  And the plan is created normally

- [ ] **Scenario: Warning appears in menu create flow as an advisory step**
  Given a plan summary that triggers a warning
  When I step through the menu create flow
  Then the warning message appears as a named advisory notice (plan slug + similarity score) before the plan is committed to disk
  And I can acknowledge and continue, or cancel, without being forced to change the plan content

## Non-Functional Requirements

- **Cross-platform:** `duplicate-guard.js` contains no platform-specific code. It delegates embedding via PI2 and retrieval via PI4, both of which handle cross-platform differences internally.
- **Async non-blocking:** The duplicate-guard check is async and awaited in the async create path in `actions.js`. It does not block the event loop; the guard result arrives before the file is written, allowing the menu to display it in the same create flow.
- **Graceful empty-index no-op:** When the index has zero rows, `checkDuplicate()` returns an empty warning list immediately without querying. No error is thrown.
- **Settings namespace:** Threshold stored under `plan_index.duplicate_threshold` in `.ctoc/settings.yaml`. The `plan_index:` namespace groups all plan-index settings (PI5 adds `duplicate_threshold`; PI6 adds `conflict_threshold` as a separate key).
- **Single creation call site:** The guard is called exactly once per plan creation, in `actions.js`. `menu.js` only renders the result; it does not run the guard.

## Scope

### In Scope
- `duplicate-guard.js`: exports a single function `checkDuplicate(draftSummary, options)` that calls PI4's `search(draftSummary)` from `index.js`, filters results above `plan_index.duplicate_threshold`, and returns an array of `{ plan, similarity }` warning objects; returns empty array when index is empty
- `actions.js`: updated to call `checkDuplicate()` in the async plan-create path; the returned warning array is passed to the menu layer; creation proceeds regardless of warnings
- `menu.js`: updated to display the warning objects as an advisory notice in the create flow, showing the overlapping plan's slug/title and the similarity score
- `.ctoc/settings.yaml`: addition of the `plan_index.duplicate_threshold` key with explanatory comment:
  ```yaml
  plan_index:
    # duplicate_threshold: cosine similarity floor (0.0–1.0) above which a new plan
    # is warned as a potential duplicate of an existing plan. 0.82 is conservative
    # (few false positives). Lower to catch more near-duplicates; raise to reduce noise.
    # Tune after observing the first 30 days of real-world warnings.
    duplicate_threshold: 0.82
  ```
- `tests/plan-index-duplicate-guard.test.js`: covers all 7 BDD scenarios using the shared fixture set from `tests/fixtures/plan-index/` (established by PI4)

### Out of Scope
- Retrieval logic — PI5 calls PI4's `index.js` `search()` and contributes zero new retrieval code; covered in PI4
- Conflict detection via `files:` glob overlap — covered in PI6
- Index store, embeddings, reconciliation sync — covered in PI1, PI2, PI3
- Automatic plan merging or deduplication on warning — future enhancement, not in this slice
- Retroactive duplicate detection over all existing plans — this guard fires at creation time only; batch scanning is a separate concern
- Blocking plan creation on any similarity score — explicitly prohibited by vision locked decision ("warns, never blocks")

## Risks

### Technical Risks
- **False-positive rate is sensitive to embedding model.** A model with low inter-plan cosine spread may produce similarities of 0.80+ for clearly distinct plans, making the default threshold 0.82 noisy.
  - Likelihood: MEDIUM
  - Impact: MEDIUM (users learn to ignore warnings; guard loses effectiveness)
  - Mitigation: Test the default threshold against the labeled "similar/not-similar" fixture pairs from PI4's fixture set. If false-positive rate exceeds 10% on labeled-distinct pairs, raise the default to 0.85 and update the settings comment before shipping.

- **PI4 module unavailable at runtime.** If PI4 is not yet deployed or its module fails to load, the import in `duplicate-guard.js` will throw.
  - Likelihood: LOW (depends_on ordering enforces PI4 before PI5)
  - Impact: HIGH (plan creation crashes if import is unguarded)
  - Mitigation: Wrap the PI4 import in a try/catch at module load; if the module is unavailable, log a warning to `.ctoc/logs/plan-index.log` and treat the guard as a no-op (empty warning list). Plan creation is never blocked by guard unavailability.

### Business Risks
- **Threshold friction.** An overly sensitive default trains users to ignore warnings on first exposure, defeating the guard's purpose before it has a chance to prove value.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Default to 0.82 (conservative); document in the settings comment that the value should be tuned after the first 30 days of real usage data. Do not lower the default speculatively.

### Dependency Risks
- **PI4 must be functional before PI5 activates.** The guard silently degrades to a no-op if PI4's `search()` is unavailable.
  - Likelihood: LOW
  - Impact: MEDIUM (silent no-op means no protection; plans are still created, so no regression)
  - Mitigation: The graceful fallback is acceptable because the fallback is safe. Log the degraded state so the user can diagnose.

## Test Plan

### Fixture Set
Shared from `tests/fixtures/plan-index/` (established by PI4). PI5-specific additions:
- 5 labeled "duplicate" plan-summary pairs (pre-measured cosine similarity >= 0.85 on the calibrated model)
- 5 labeled "distinct" plan-summary pairs (pre-measured cosine similarity < 0.70)
- All pre-measured similarities recorded in the fixture JSON for deterministic assertions (no live embedding in unit tests)

### Threshold Sensitivity Tests (Unit)
```
Given: fixture pairs loaded into in-memory mock store with pre-measured similarities
With duplicate_threshold = 0.90:
  Assert: only pairs with pre-measured similarity >= 0.90 trigger a warning
With duplicate_threshold = 0.70:
  Assert: all pairs with pre-measured similarity >= 0.70 trigger a warning
Assert: both runs use identical code; only settings.yaml content differs
```

### Never-Blocks Test (Unit)
```
Given: a plan summary pre-measured to trigger a warning
When: checkDuplicate() is called and the full create path in actions.js is exercised
Assert: the plan file exists on disk after the create path completes
Assert: no exception escapes the async create path
Assert: the event loop is not synchronously blocked (timer-based assertion)
```

### False-Positive Rate Test (Unit)
```
Given: 5 labeled "distinct" pairs from the fixture set
Run: checkDuplicate() for each pair at default threshold (0.82)
Assert: 0 false-positive warnings across 5 distinct pairs
```

### Empty Index No-Op Test (Unit)
```
Given: mock store with zero rows
When: checkDuplicate("any summary string") is called
Assert: returns []
Assert: no exception
Assert: call completes in < 5ms (no query attempted)
```

### Cross-Platform Smoke Test (CI)
`node --test tests/plan-index-duplicate-guard.test.js` on each platform runner; assert 0 failures.

## Rollback

If PI5 causes regressions in the plan-create flow:
1. Remove the `checkDuplicate()` call from `actions.js` (one async call).
2. Remove the warning-display step from `menu.js` (one conditional block).
3. `.ctoc/settings.yaml` retains the `plan_index.duplicate_threshold` key; it becomes inert.
4. No data migration required; the index is unaffected.
5. PI4, PI6, PI1/PI2/PI3 are all unaffected by PI5 rollback.

## Dependencies

| Dependency | Role | Interface Level |
|---|---|---|
| PI4 (retrieval core) | PI5 calls `search(draftSummary)` from PI4's `index.js`; this is the ONLY retrieval call PI5 makes | Capability level: "nearest plans for a given query text, ranked by fused score" |
| PI1 (index store) | Indirect: PI4 reads from PI1; PI5 has no direct PI1 dependency | None (indirect via PI4) |
| PI2 (embedding engine) | Indirect: PI4 calls PI2 for query embedding; PI5 has no direct PI2 dependency | None (indirect via PI4) |
| PI3 (reconciliation sync) | Precondition: store must be current at create time; PI5 does not call PI3 | None (indirect precondition) |

## Decisions Taken Under Ambiguity

- **Default threshold: 0.82.** Conservative — favors few false positives over catching every near-duplicate. Rationale: a noisy warning trains users to ignore all warnings faster than a missed duplicate harms the backlog. Product-owner tunes via settings.yaml after observing real-world data.
- **Core reuse from PI4.** The guard calls PI4's `index.js` `search()` function and contributes zero new retrieval logic. This is an explicit architecture constraint: PI5 is a thin threshold+surface layer over PI4.
- **Single creation call site.** The guard lives in `actions.js`, not in `menu.js`. Menu renders the warning; it does not run the guard. This prevents duplicate calls if the create flow is reached via multiple UI paths.
- **No blocking.** The guard result is advisory. A similarity of 1.0 does not prevent creation. The user or agent decides whether to act.
- **Settings key namespace.** `plan_index.duplicate_threshold` (not `search.*` or `index.*`) — the `plan_index:` namespace groups all plan-index settings together. PI6 adds `conflict_threshold` as a separate additive key under the same namespace.

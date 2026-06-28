---
title: "PI5 — Duplicate-on-Create Guard (warns, never blocks)"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: MEDIUM
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 6
depends_on:
  - pi0-bootstrap-and-runtime-wiring
  - pi4-semantic-search-and-related-plans
acceptance_criteria_count: 7
risk_level: MEDIUM
gate_status: "Pending Approval (Gate 1: functional → implementation)"
files:
  - "src/lib/plan-index/duplicate-guard.js"
  - "src/lib/plan-index/index.js"
  - "src/hooks/PreToolUse.Write.js"
  - "tests/plan-index-duplicate-guard.test.js"
---

# PI5 — Duplicate-on-Create Guard (warns, never blocks)

## Problem Statement

The decompose→refine pipeline has shipped overlapping and duplicate plans that nobody caught — proven first-hand this session: the prior HANDOFF records a phantom backlog of duplicate plans that required hand-cleaning, and the decompose→refine pipeline produced overlapping plans nobody caught at creation time. When any write to `plans/**/*.md` creates a plan that is semantically close to an existing one, the system must raise an advisory warning naming the overlap with similarity scores, while always allowing creation to proceed.

PI5 fires as an advisory `PreToolUse.Write` hook for `plans/**/*.md` write targets. It delegates entirely to PI4's retrieval core — it introduces no new retrieval logic, only a threshold comparison and a warning emission. There is no `createPlan` function in `actions.js`; the write intercept point is the Write tool's PreToolUse hook. The warning sink is the hook's stderr output and `.ctoc/logs/plan-index.log`, covering both interactive and programmatic/agent creation paths without requiring a menu-specific rendering step.

## Business Alignment

**Job to Be Done:** When I create a new plan through any path (interactive session or pipeline agent), I want to be warned immediately if a semantically similar plan already exists naming the overlap, so I can decide whether to merge, differentiate, or proceed knowingly — instead of discovering the duplication weeks later during a hand-clean.

**Impact Map:**
- **Goal:** Prevent silent accumulation of phantom and duplicate backlog (vision success criterion 3; vision problem statement item 2)
- **Actor:** CTOC user (CTO or engineer) creating a plan via the interactive session; pipeline agents (vision-decomposer, product-owner) creating plans programmatically via the Write tool
- **Impact:** The actor is informed of semantic duplicates at creation time, not retroactively; they can act on the information or dismiss it and proceed without being blocked; for programmatic/agent creation the warning appears in the session log and `.ctoc/logs/plan-index.log`
- **Deliverable:** An advisory `PreToolUse.Write` hook for `plans/**/*.md` targets that calls `checkDuplicate()` from `duplicate-guard.js`, reads the similarity threshold from the `plan_index` settings schema via `getSetting('plan_index.duplicate_threshold')` in `src/lib/settings.js`, and emits a named warning before the write proceeds

## User Stories

**As a** CTOC user creating a new plan, **I want** to be warned when a semantically similar plan already exists, naming the overlapping plan(s) and their similarity scores, **so that** I can decide whether to merge, differentiate, or proceed knowingly.

**As a** pipeline agent (vision-decomposer or product-owner) creating plans via the Write tool, **I want** the duplicate guard to run transparently on every creation without blocking, **so that** the pipeline self-monitors for redundant work without requiring manual review.

## Acceptance Criteria

- [ ] **Scenario: Semantically near plan raises a named warning with similarity score**
  Given a plan "auth-middleware-refactor.md" is indexed
  And its cosine similarity to a new draft "auth-layer-cleanup.md" exceeds the `plan_index.duplicate_threshold` setting
  When a Write tool call targets "plans/functional/auth-layer-cleanup.md"
  Then the PreToolUse.Write hook emits an advisory warning to stderr naming "auth-middleware-refactor.md" and showing the similarity score (e.g. "similarity: 0.87")
  And the warning is logged to `.ctoc/logs/plan-index.log`
  And the hook exits 0 — "auth-layer-cleanup.md" is written regardless

- [ ] **Scenario: Novel plan raises no warning**
  Given the index contains plans about auth, quality gates, and plan state
  When a Write tool call creates a new plan "saas-billing-integration.md" with clearly distinct summary content
  Then the hook emits no duplicate warning
  And the file is written normally

- [ ] **Scenario: Creation always succeeds regardless of similarity**
  Given a plan summary that triggers a duplicate warning (similarity exceeds threshold)
  When the Write tool proceeds
  Then the plan file is created on disk
  And the hook exits 0 — it never exits 1 on any similarity score
  And no exception escapes `checkDuplicate()`

- [ ] **Scenario: High threshold (0.90) suppresses warning at 0.85 similarity**
  Given `getSetting('plan_index.duplicate_threshold')` returns 0.90
  When `checkDuplicate()` is called with a draft summary having pre-measured cosine similarity 0.85 to an existing plan
  Then no warning is raised (0.85 < 0.90)

- [ ] **Scenario: Low threshold (0.70) raises warning at 0.85 similarity**
  Given `getSetting('plan_index.duplicate_threshold')` returns 0.70
  When `checkDuplicate()` is called with a draft summary having pre-measured cosine similarity 0.85 to an existing plan
  Then a warning is raised (0.85 >= 0.70)
  And changing the threshold via `setSetting('plan_index.duplicate_threshold', ...)` changes the behavior with no code change

- [ ] **Scenario: Empty index is a safe no-op**
  Given the index has zero rows (not yet built or recently cleared)
  When the hook fires for any `plans/**/*.md` write
  Then no duplicate warning is shown
  And the hook exits 0
  And `checkDuplicate()` returns [] without querying the store

- [ ] **Scenario: Advisory output is emitted before the file is committed to disk**
  Given a plan summary that triggers a duplicate warning
  When the `PreToolUse.Write` hook fires (before the Write tool executes)
  Then the warning message is written to stderr with the duplicate plan's slug and similarity score
  And the hook exits 0, allowing the Write tool to proceed
  And this confirms: the warning fires pre-write (advisory), never post-write, and never blocks creation

## Non-Functional Requirements

- **Cross-platform:** `duplicate-guard.js` contains no platform-specific code. It delegates embedding via the PI0-wired embedder (called through PI4) and retrieval via PI4, both of which handle cross-platform differences internally.
- **Synchronous execution:** The duplicate-guard check runs synchronously within the `PreToolUse.Write` hook execution. The hook is synchronous by design; `checkDuplicate()` calls PI4's `search()` which is synchronous (reads the already-built index). No async injection, no event-loop non-blocking patterns.
- **Graceful empty-index no-op:** When the index has zero rows, `checkDuplicate()` returns [] immediately without querying. No error is thrown.
- **Settings API:** Threshold accessed via `getSetting('plan_index.duplicate_threshold')` from `src/lib/settings.js`. The `plan_index` namespace and its `duplicate_threshold` key with default value 0.82 are registered by PI1 in the settings schema. PI5 reads the setting; PI1 registers the schema. Do NOT write directly to `.ctoc/settings.yaml` or `.ctoc/settings.json`; use the `getSetting`/`setSetting` API exclusively.
- **Single intercept point:** The guard fires exactly once per plan write, in `PreToolUse.Write.js` for `plans/**/*.md` targets. No other code path calls `checkDuplicate()`.
- **Warning sink for programmatic/agent creation:** The hook's stderr output and `.ctoc/logs/plan-index.log` serve as the warning sink for both interactive and programmatic paths. No menu-specific rendering is needed; the hook output is visible in the active Claude Code session for both human and agent callers.

## Scope

### In Scope
- `duplicate-guard.js`: exports a single function `checkDuplicate(draftSummary, options)` that calls PI4's `search(draftSummary)` from `index.js`, filters results above `plan_index.duplicate_threshold` (read via `getSetting()`), and returns an array of `{ plan, similarity }` warning objects; returns [] when the index is empty or when the threshold is not exceeded
- `src/lib/plan-index/index.js`: `checkDuplicate` is an internal export consumed by the hook; if other callers need it post-Gate 2, it may be added to the barrel additively at that point; for PI5 it is imported directly from `duplicate-guard.js` within the hook
- `src/hooks/PreToolUse.Write.js`: extended to detect `plans/**/*.md` write targets; for matching targets, extracts the draft plan content from the tool input, derives the summary text, calls `checkDuplicate()`, emits any warnings as advisory stderr output + log entry, and always exits 0 (never blocks)
- `tests/plan-index-duplicate-guard.test.js`: covers all 7 BDD scenarios using the shared fixture set from `tests/fixtures/plan-index/` (established by PI4)

### Out of Scope
- Retrieval logic — PI5 calls PI4's `index.js` `search()` and contributes zero new retrieval code; covered in PI4
- `src/lib/actions.js` — there is no `createPlan` function in actions.js; the intercept point is the `PreToolUse.Write` hook, not an actions module
- Conflict detection via `files:` glob overlap — covered in PI6
- Index store, embeddings, reconciliation sync — covered in PI1, PI2, PI3 (consumed pre-wired via PI0)
- Automatic plan merging or deduplication on warning — future enhancement, not in this slice
- Retroactive duplicate detection over all existing plans — this guard fires at write time only; batch scanning is a separate concern
- Blocking plan creation on any similarity score — explicitly prohibited by vision locked decision ("warns, never blocks")
- Menu-specific warning rendering — the hook's stderr output is the warning surface for all creation paths; no tab or area module requires modification

## Risks

### Technical Risks
- **False-positive rate is sensitive to embedding model.** A model with low inter-plan cosine spread may produce similarities of 0.80+ for clearly distinct plans, making the default threshold 0.82 noisy.
  - Likelihood: MEDIUM
  - Impact: MEDIUM (users learn to ignore warnings; guard loses effectiveness)
  - Mitigation: Test the threshold comparator logic against the fixture's pre-measured similarities. True false-positive rate (whether real embeddings of distinct plans stay below threshold) requires live Ollama embeddings and is validated in PI2's Ollama-gated smoke test, not in PI5's unit tests. If reports of excessive warnings emerge post-launch, raise the default to 0.85 via `setSetting()` and document the change.

- **PI4 module unavailable at runtime.** If PI4 is not yet deployed or its module fails to load, the import in `duplicate-guard.js` will throw.
  - Likelihood: LOW (depends_on ordering enforces PI4 before PI5)
  - Impact: HIGH (plan write crashes if import is unguarded)
  - Mitigation: Wrap the PI4 import in a try/catch at module load in `PreToolUse.Write.js`; if the module is unavailable, log a warning to `.ctoc/logs/plan-index.log` and treat the guard as a no-op (exit 0). Plan writes are never blocked by guard unavailability.

### Business Risks
- **Threshold friction.** An overly sensitive default trains users to ignore warnings on first exposure, defeating the guard's purpose before it has a chance to prove value.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Default to 0.82 (conservative); document in the settings comment that the value should be tuned after the first 30 days of real usage data. Do not lower the default speculatively.

### Dependency Risks
- **PI4 must be functional before PI5 activates.** The guard silently degrades to a no-op if PI4's `search()` is unavailable.
  - Likelihood: LOW
  - Impact: MEDIUM (silent no-op means no protection; plans are still created, so no regression)
  - Mitigation: The graceful fallback is acceptable because the fallback is safe. Log the degraded state to `.ctoc/logs/plan-index.log` so the user can diagnose.

## Test Plan

### Fixture Set
Shared from `tests/fixtures/plan-index/` (established by PI4). PI5-specific additions:
- 5 labeled "duplicate" plan-summary pairs (pre-measured cosine similarity >= 0.85)
- 5 labeled "distinct" plan-summary pairs (pre-measured cosine similarity < 0.70)
- All pre-measured similarities recorded in the fixture JSON for deterministic arithmetic assertions (no live embedding in unit tests)

### Threshold Sensitivity Tests (Unit)
```
Given: fixture pairs loaded into in-memory mock store with pre-measured similarities
With duplicate_threshold = 0.90:
  Assert: only pairs with pre-measured similarity >= 0.90 trigger a warning
With duplicate_threshold = 0.70:
  Assert: all pairs with pre-measured similarity >= 0.70 trigger a warning
Assert: both runs use identical code; only the getSetting() return value differs
```

### Never-Blocks Test (Unit)
```
Given: a plan summary pre-measured to trigger a warning
When: checkDuplicate() is called and the full hook path in PreToolUse.Write.js is exercised
Assert: hook exits 0 (Write tool allowed to proceed)
Assert: no exception escapes the hook execution
Assert: the plan file path is created on disk after the Write tool runs
```

### Comparator-Direction Test (Unit)
```
Given: 5 fixture plan-summary pairs with pre-measured similarities [e.g. 0.55, 0.61, 0.67, 0.69, 0.72]
       all below the default threshold (0.82)
When: checkDuplicate() is called for each pair
Assert: no warning raised for any pair (pre-measured value < threshold → not flagged)

Note: This is a threshold-COMPARATOR LOGIC test. It verifies that the < vs >= comparison
direction is correctly implemented against baked fixture values. It does NOT measure whether
the embedding model produces similarity < 0.82 for genuinely distinct real plans — that claim
requires live Ollama embeddings and is covered by PI2's Ollama-gated smoke test. Do not label
this a "false-positive rate" test; that label implies measurement of real model behavior.
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

If PI5 causes regressions in the plan-write path:
1. Revert `src/hooks/PreToolUse.Write.js` to its prior state (removes the `plans/**/*.md` detection and `checkDuplicate()` call).
2. `duplicate-guard.js` can remain on disk; it is simply not called.
3. The `plan_index.duplicate_threshold` setting schema registered by PI1 becomes inert; leave it for re-activation.
4. No data migration required; the index is unaffected.
5. PI4, PI6, PI0/PI1/PI2/PI3 are all unaffected by PI5 rollback.

## Dependencies

| Dependency | Role | Interface Level |
|---|---|---|
| PI0 (bootstrap and runtime wiring) | Provides the composition root: wired embedder + populated store. PI4 (which PI5 calls) receives both from PI0. PI0 transitively covers PI1, PI2, PI3. | Via PI4; PI5 has no direct PI0 dependency |
| PI4 (retrieval core) | PI5 calls `search(draftSummary)` from PI4's `index.js`; this is the ONLY retrieval call PI5 makes | Capability level: "nearest plans for a given query text, ranked by fused score" |
| PI1 (index store) | Registers the `plan_index` settings schema including `duplicate_threshold` default. PI5 reads the threshold via `getSetting('plan_index.duplicate_threshold')`. Indirect index dependency via PI4. | Settings schema registration; PI5 has no direct SQL dependency |
| PI2 (embedding engine) | Indirect: PI4 calls PI2 (via PI0 embedder); PI5 has no direct PI2 dependency | None (indirect via PI4 → PI0) |
| PI3 (reconciliation sync) | Precondition: store must be current at write time; PI5 does not call PI3 | None (indirect precondition) |

## Decisions Taken Under Ambiguity

- **Advisory hook in `PreToolUse.Write.js`, not in `actions.js`.** There is no `createPlan` function in `actions.js`. The correct intercept for plan creation is the `PreToolUse.Write` hook, which fires before every Write tool call. The hook detects `plans/**/*.md` targets and runs the guard; it always exits 0 (advisory only, never blocks).
- **Warning sink is stderr + log, not menu rendering.** Both interactive and programmatic/agent plan creation routes through the Write tool. The hook's stderr output appears in the active Claude Code session for both paths. A menu-specific render step would miss agent-created plans; stderr + log covers all paths uniformly.
- **Default threshold: 0.82.** Conservative — favors few false positives over catching every near-duplicate. Rationale: a noisy warning trains users to ignore all warnings faster than a missed duplicate harms the backlog. Tuned via `setSetting()` after observing real-world data.
- **Core reuse from PI4.** The guard calls PI4's `index.js` `search()` function and contributes zero new retrieval logic. This is an explicit architecture constraint: PI5 is a thin threshold+surface layer over PI4.
- **Comparator-direction test, not false-positive rate test.** Fixture-based tests with pre-measured similarities verify the `< vs >=` threshold comparator direction. True false-positive rate (real model behavior with genuinely distinct texts) requires live embeddings tested by PI2's Ollama-gated smoke test; PI5's unit tests do not claim to measure this.
- **Settings via getSetting/setSetting API.** Threshold is read from `src/lib/settings.js` under the `plan_index` namespace. PI5 does not write directly to `.ctoc/settings.yaml` or `.ctoc/settings.json`. PI1 owns schema registration; PI5 only reads.

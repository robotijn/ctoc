---
title: "SP4 — Human-gated grouped cleanup review & execution"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: automated-stale-plan-detection
program: ctoc-pipeline-hygiene
order: 4
depends_on: [SP3-scout-verify-classify-propose]
files:
  - src/lib/stale-cleanup.js
  - src/lib/actions.js
  - src/areas/inbox.js
  - tests/stale-cleanup-human-gate.test.js
status: refined
acceptance_criteria_count: 7
risk_level: HIGH
---

# SP4 — Human-gated grouped cleanup review & execution

## 1. ASSESS — Problem Understanding

### Business Context

The scout (SP3) produces evidence-backed proposals. Without SP4, those proposals are read-only — the user still has to manually stamp markers, pick archive vs. delete vs. advance, and avoid triggering the gate auto-revert hook. The load-bearing principle of this entire feature is: detection suggests, the human decides, no gate is ever crossed automatically. SP4 closes the loop from proposal to execution while holding that principle as an invariant in both the UX and the code.

### Current State

`src/lib/actions.js` exports `approvePlan(planPath, projectPath)` (lines 77+), which is the only sanctioned path for Gate 3 crossings (`review → done`). It stamps `approved_by: human` + `gate_crossed`, moves the file, and triggers the deployment pipeline. The move script (`src/scripts/move-plan.js`) is a separate utility that does NOT stamp markers and MUST NOT be used for gate crossings — the gate auto-revert hook would immediately revert an unstamped move. There is currently no `src/lib/stale-cleanup.js` module.

### Impact

Executing stale cleanup today requires human developers to manually: read each plan, decide an action, stamp YAML markers by hand, run `move-plan.js` or `approvePlan()`, and confirm the gate hook did not revert them. That process is error-prone and slow. SP4 collapses this to a single grouped review — one decision per plan or one "select all category X" decision — with the execution logic safely encapsulated in `stale-cleanup.js`.

## 2. ALIGN — Business Alignment

### Business Goals

1. Present a grouped review surface listing every SP3 proposal (plan, category, proposed action, evidence) with per-plan approve/override controls and a "select all of category X" affordance.
2. Execute approved non-gate cleanup actions (archive-stamp, delete, revert) through `src/lib/stale-cleanup.js` — never through the raw move script.
3. Route all Gate 3 crossings (`approved-but-stranded → done`) exclusively through the existing `approvePlan()` in `src/lib/actions.js`, with an explicit human confirmation step — never automatically, never via move script.

### Success Metrics

- **M1:** Grouped review surface lists each proposal with plan name, category, proposed action, evidence, and controls for per-plan approve, per-plan override, and "select all of category X" — without the user having to interact with 14 separate prompts for a homogeneous batch.
- **M2:** Approving a `shipped-but-early` proposal moves the plan to `done/` and stamps `approved_by: human` + `gate_crossed` — a test asserts both markers are present in the file after the move.
- **M3:** Approving an `approved-but-stranded` proposal triggers the Gate 3 crossing exclusively via `approvePlan()` (from `src/lib/actions.js`) with an explicit human confirmation step — a test asserts `movePlan()` is NOT called directly for this path.
- **M4:** A test asserts no cleanup action executes without an explicit human approve step — the proposals are surfaced and wait; no auto-execution occurs.
- **M5:** Executing a plan move via `stale-cleanup.js` carries the expected YAML markers so the gate auto-revert hook in `src/hooks/human-gate-check.js` does NOT revert the move.
- **M6:** The override flow allows the user to select a different action from the allowed set for that plan's category (e.g. `revert` instead of `archive-to-done`) or to skip the plan entirely (it remains in place and re-surfaces on the next scan).
- **M7:** All file path construction uses `path.join()` — cross-platform safe on Windows, macOS, Linux.

### Stakeholders

- CTOC user reviewing cleanup proposals (primary beneficiary — clears phantom backlog efficiently)
- SP5 (regression suite asserts the gate-safety invariant end-to-end)
- `src/lib/actions.js` (SP4 calls `approvePlan()` — read-only dependency; SP4 does NOT modify `actions.js`)
- `src/hooks/human-gate-check.js` (must not be modified; SP4 must produce moves the hook accepts)

### Constraints

- `src/lib/actions.js` is READ by SP4; it is NOT modified. SP4 calls `approvePlan()` as a consumer.
- `src/hooks/human-gate-check.js` and all other hooks are READ for understanding; they are NOT modified.
- Gate crossings for `approved-but-stranded` ONLY via `approvePlan()`. The move script is never used for gate crossings.
- Skipped plans remain in place and re-surface on the next scan — no "permanently ignore" state in this slice (future enhancement scope).
- Idempotency: re-running cleanup after a partial approval is safe because already-moved plans are no longer candidates (they are in `done/` and not scanned by SP1).

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user reviewing stale cleanup proposals,
**I want** a grouped view of all proposals with per-plan and per-category approval controls,
**so that** I can clear a batch of phantom backlog in one review session without 14 separate prompts.

**As a** CTOC user approving a Gate 3 crossing for a stranded plan,
**I want** the crossing to route through the existing `approvePlan()` flow with an explicit confirmation step,
**so that** the gate audit trail is complete and the gate auto-revert hook does not undo my cleanup.

### BDD Scenarios

- [ ] **Scenario: Grouped review renders all proposals with controls**
  Given SP3 produced 3 proposals: one `shipped-but-early`, one `approved-but-stranded`, one `dead-on-arrival`
  When the grouped review surface renders
  Then each proposal is listed with its plan name, category, proposed action, and evidence summary
  And each proposal has an "approve" control and an "override" control
  And a "select all shipped-but-early" affordance is present for the homogeneous category
  And a [0] back/cancel option is present

- [ ] **Scenario: Approving shipped-but-early stamps markers and moves plan**
  Given a `shipped-but-early` proposal for `plans/functional/foo-plan.md`
  When the user approves the proposal
  Then `plans/functional/foo-plan.md` is moved to `plans/done/foo-plan.md`
  And the moved file's YAML frontmatter contains `approved_by: human`
  And the moved file's YAML frontmatter contains `gate_crossed`
  And `movePlan()` from `actions.js` is called (not `move-plan.js` script)

- [ ] **Scenario: Approving approved-but-stranded routes through approvePlan exclusively**
  Given an `approved-but-stranded` proposal for `plans/review/bar-plan.md`
  When the user approves the proposal and confirms the Gate 3 crossing
  Then `approvePlan('plans/review/bar-plan.md', root)` is called
  And `movePlan()` is NOT called directly for this crossing (asserted via spy)
  And the plan lands in `plans/done/bar-plan.md` with the markers `approvePlan()` adds

- [ ] **Scenario: No action executes without explicit approve**
  Given 2 proposals are rendered in the grouped review
  When the user views the proposals but does not select approve for either
  Then no plan file is moved, stamped, or deleted
  And the proposals remain visible (no auto-execution after a timeout or render event)

- [ ] **Scenario: Override substitutes a different allowed action**
  Given a `dead-on-arrival` proposal with `proposedAction: 'delete'`
  When the user selects override and chooses `revert` instead
  Then the plan is moved back one stage (reverted) rather than deleted
  And the override choice is executed on explicit confirm, not automatically

- [ ] **Scenario: Skipped plan re-surfaces on next scan**
  Given a `shipped-but-early` proposal the user skips (neither approves nor overrides)
  When `scanCheapCandidates(root)` runs again on the next menu open
  Then the skipped plan is still present in the candidates list
  And it has not been modified (no stamp, no move)

- [ ] **Scenario: Moved plan carries markers that satisfy gate auto-revert hook**
  Given a `shipped-but-early` plan approved and moved to `done/`
  When `src/hooks/human-gate-check.js` evaluates the moved plan
  Then the plan is NOT reverted (it carries `approved_by: human` + `gate_crossed` as the hook expects)

### In Scope

- New module `src/lib/stale-cleanup.js` implementing: `archivePlan(planPath, root)`, `deletePlan(planPath)`, `revertPlan(planPath, root)`, `executeCleanup(proposal, root)`
- Grouped review surface rendered in `src/areas/inbox.js` drill-in (extending SP2's drill-in)
- Per-plan approve/override/skip controls and "select all of category X" affordance
- Gate 3 crossing for `approved-but-stranded` via `approvePlan()` (read-only use of `src/lib/actions.js`)
- YAML marker stamping for archive path: `approved_by: human` + `gate_crossed`
- Cross-platform path handling via `path.join()` throughout `stale-cleanup.js`
- Unit test `tests/stale-cleanup-human-gate.test.js` asserting gate-safety invariants

### Out of Scope

- Permanently ignoring / suppressing specific candidates (future enhancement)
- Bulk-approve all (unlimited scope); "select all of category X" is the maximum batch affordance
- Modifying `src/lib/actions.js`, `src/hooks/human-gate-check.js`, or any other hook
- Deployment pipeline interaction (that is triggered by `approvePlan()` internally for Gate 3 crossings)
- Plan creation or vision-level actions

## Risks

### Technical Risks

- **Risk:** `archivePlan()` must stamp markers into the YAML frontmatter of the moved file. The existing `addApprovalMarker()` in `actions.js` prepends a separate YAML block, which results in two `---` blocks — this is accepted by the existing parser (`parseFrontmatter` reads only the first block) but could confuse external YAML parsers.
  - Likelihood: MEDIUM (the pattern is already used by `approvePlan()` in production)
  - Impact: LOW (external YAML parsers are not used in the CTOC pipeline; the internal parser handles it)
  - Mitigation: Reuse the same `addApprovalMarker()` function from `actions.js` in `stale-cleanup.js` for consistency rather than reimplementing marker injection.

- **Risk:** The gate auto-revert hook checks for the presence of approval markers before a plan can land in a destination stage. If `stale-cleanup.js` stamps markers AFTER moving the file, there is a window where the hook could trigger and revert the move.
  - Likelihood: LOW (the hook runs synchronously in `PreToolUse`; as long as markers are stamped before the rename, the window is closed)
  - Impact: HIGH (an auto-revert would silently undo cleanup the user explicitly approved)
  - Mitigation: In `archivePlan()`, stamp markers into the file content BEFORE calling `fs.renameSync()`, matching the order used in `approvePlan()` (lines 97-107 of `actions.js`).

### Business Risks

- **Risk:** "Select all of category X" could delete or archive plans the user did not individually review, eroding trust if any plan in the batch was misclassified by SP3.
  - Likelihood: LOW (SC3 classification requires both git-slug match AND file evidence)
  - Impact: MEDIUM (a wrongly archived plan can be recovered from `done/` but requires manual intervention)
  - Mitigation: Require a confirmation prompt after "select all of category X" that lists the count and category before executing; show the evidence summary for each plan in the batch before the user confirms.

### Dependency Risks

- **Risk:** `approvePlan()` in `actions.js` triggers the deployment pipeline for Gate 3 crossings (lines 121-134 of `actions.js`). Cleaning up stranded `review/` plans that were never intended to deploy could trigger spurious deployments.
  - Likelihood: MEDIUM (deployment is conditional on `config.enabled` per `getDeploymentConfig()`, but if deployment is enabled the trigger fires)
  - Impact: HIGH (a spurious deployment to production for a plan that was cleaned up, not shipped)
  - Mitigation: Before calling `approvePlan()` for `approved-but-stranded` cleanup, check `getDeploymentConfig(root).enabled`; if true, surface a warning to the user ("This crossing will trigger the deployment pipeline — confirm?") and require a second explicit confirmation before proceeding.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) — depends on SP3; SP5 depends on this; no sibling parallelism possible
- Business Impact: HIGH (3) — this is the action slice; without it the feature produces proposals but never resolves phantom backlog
- Technical Risk: HIGH (2) — gate auto-revert hook interaction and deployment pipeline trigger are real risks requiring careful ordering

## Decisions Taken Under Ambiguity

- **Approval granularity (vision Q4):** grouped surface with per-plan approve/override + "select all of category X". Not 14 separate prompts; not a single blanket approve. Requires a count+category confirmation before the batch executes.
- **Gate-crossing safety (vision Q5):** `approved-but-stranded → done` crosses Gate 3 ONLY via `approvePlan()`. The move script is never used for gate crossings. Deployment warning surfaced if `config.enabled` is true.
- **Override semantics:** the user picks a different action from the same allowed set for that plan (e.g. `revert` instead of `archive-to-done`), or skips (plan remains, re-surfaces next scan). No "permanent ignore" in this slice.
- **Marker stamping order:** stamp markers into file content BEFORE `fs.renameSync()` — matches the order in `approvePlan()` to avoid the gate-revert window.
- **Idempotency:** already-cleaned plans are in `done/`; SP1 does not scan `done/`. Re-running cleanup is therefore safe with no double-move risk.

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
  - src/areas/inbox.js
  - tests/stale-cleanup-human-gate.test.js
status: refined
acceptance_criteria_count: 8
risk_level: HIGH
---

# SP4 — Human-gated grouped cleanup review & execution

## 1. ASSESS — Problem Understanding

### Business Context

The in-process verifier (SP3) produces evidence-backed proposals. Without SP4, those proposals are read-only — the user still has to manually stamp markers, pick archive vs. delete vs. advance, and avoid triggering the gate auto-revert hook. The load-bearing principle of this entire feature is: detection suggests, the human decides, no gate is ever crossed automatically. SP4 closes the loop from proposal to execution while holding that principle as an invariant in both the UX and the code.

### Current State

`src/lib/actions.js` exports `approvePlan(planPath, projectPath)` (lines 77+), which is the only sanctioned path for live Gate 3 crossings (`review → done`). It stamps `approved_by: human` + `gate_crossed`, moves the file, and triggers the deployment pipeline. Using `approvePlan()` for stale cleanup of `approved-but-stranded` plans would re-fire the deployment pipeline and log a fresh live Gate-3 crossing — polluting the audit trail for months-old work, potentially triggering spurious deployments, and misrepresenting the historical gate timeline. Therefore SP4 implements a **dedicated reconciliation path** in `src/lib/stale-cleanup.js` that stamps markers and moves files without invoking `approvePlan()`. `src/lib/actions.js` is NOT modified by SP4.

There is currently no `src/lib/stale-cleanup.js` module.

### Impact

Executing stale cleanup today requires human developers to manually: read each plan, decide an action, stamp YAML markers by hand, run `move-plan.js` or `approvePlan()`, and confirm the gate hook did not revert them. That process is error-prone and slow. SP4 collapses this to a single grouped review — one decision per plan or one "select all category X" decision — with the execution logic safely encapsulated in `stale-cleanup.js`.

## 2. ALIGN — Business Alignment

### Business Goals

1. Present a grouped review surface listing every SP3 proposal (plan, category, proposed action, evidence) with per-plan approve/override controls and a "select all of category X" affordance.
2. Execute all cleanup actions through `src/lib/stale-cleanup.js` — never through the raw move script and never through `approvePlan()`.
3. Use a **dedicated reconciliation path** for `approved-but-stranded → done`: stamp markers, move to `done/`, log with `reason: 'stale-reconciliation'`. Marker stamping happens BEFORE the file move (gate-hook window). This path does NOT invoke `approvePlan()` and does NOT trigger the deployment pipeline.
4. `dead-on-arrival` default action is `revert` (move back one stage; reversible). `delete` is only available as an explicit human override requiring `evidence.explicitlyRejected === true`. Never auto-delete.

### Execution Path Details

**`shipped-but-early` (archive-to-done):**
1. Read plan file content.
2. Stamp `approved_by: human` and `gate_crossed: 'stale-reconciliation <ISO timestamp>'` into the YAML frontmatter.
3. Write stamped content back to the source path.
4. Rename (move) the file to `plans/done/<filename>` using `fs.renameSync`.
5. Log the move with `reason: 'stale-reconciliation'` to `.ctoc/logs/stale-cleanup.json`.

**`approved-but-stranded` (reconciliation-to-done):**
Same five steps as `shipped-but-early`. This path does NOT call `approvePlan()`. It uses the same stamp-then-move sequence to avoid the gate auto-revert hook window. The `gate_crossed` stamp carries `'stale-reconciliation'` so the audit trail is unambiguous — this was a cleanup move, not a live Gate-3 crossing.

**`dead-on-arrival` (revert — default):**
1. Determine the stage to revert to: one stage back from the plan's current stage (`review → implementation`, `implementation → functional`, `functional → vision`).
2. Move the file to the prior stage directory (no marker stamping; revert is NOT a gate crossing).
3. Log the move with `reason: 'stale-revert'`.

**`dead-on-arrival` (delete — explicit override only):**
Only available when `evidence.explicitlyRejected === true` AND the user selects delete as an override. Requires a second confirmation prompt. Logs with `reason: 'stale-delete'`.

### Success Metrics

- **M1:** Grouped review surface lists each proposal with plan name, category, proposed action, evidence, and controls for per-plan approve, per-plan override, and "select all of category X" — without the user having to interact with 14 separate prompts for a homogeneous batch.
- **M2:** Approving a `shipped-but-early` proposal moves the plan to `done/` via the reconciliation path — markers stamped BEFORE the move. A test asserts both `approved_by: human` and `gate_crossed` containing `'stale-reconciliation'` are present in the file after the move. `approvePlan()` is NOT called (spy assertion).
- **M3:** Approving an `approved-but-stranded` proposal executes the same reconciliation path — stamp-then-move-to-done with `reason: 'stale-reconciliation'`. A test asserts `approvePlan()` is NOT called (spy). `movePlan()` from `actions.js` is NOT called directly either (spy).
- **M4:** A test asserts no cleanup action executes without an explicit human approve step — the proposals are surfaced and wait; no auto-execution occurs.
- **M5:** Marker stamping occurs BEFORE `fs.renameSync()` in all archive/reconciliation paths so the gate auto-revert hook in `src/hooks/human-gate-check.js` does NOT revert the move.
- **M6:** `dead-on-arrival` default action is `revert`. `delete` requires explicit human override AND `evidence.explicitlyRejected === true`. A test asserts the default proposal for a DOA plan without `explicitlyRejected` is `revert`, not `delete`.
- **M7:** The override flow allows the user to select a different action from the allowed set for that plan's category (e.g. `revert` instead of `archive-to-done`) or to skip the plan entirely (it remains in place and re-surfaces on the next scan).
- **M8:** `executeCleanup(proposal, root, deps)` accepts an optional `deps` parameter containing injectable `{ approvePlan, movePlan }` overrides — the testability seam required by SP5 to spy on gate-safety invariants without CommonJS module-cache tricks.

### Stakeholders

- CTOC user reviewing cleanup proposals (primary beneficiary — clears phantom backlog efficiently)
- SP5 (regression suite asserts the gate-safety invariant end-to-end via the `deps` injection seam)
- `src/lib/actions.js` (NOT modified; SP4 does not call `approvePlan()` — the reconciliation path bypasses it by design)
- `src/hooks/human-gate-check.js` (must not be modified; SP4 must produce moves the hook accepts via the stamp-before-move ordering)

### Constraints

- `src/lib/actions.js` is NOT modified and NOT called by SP4's reconciliation path. `approvePlan()` is not invoked for stale cleanup — the reconciliation path implements its own stamp-then-move sequence.
- `src/hooks/human-gate-check.js` and all other hooks are NOT modified.
- `delete` is never the default action. It is only available as an explicit override when `evidence.explicitlyRejected === true`.
- Skipped plans remain in place and re-surface on the next scan — no "permanently ignore" state in this slice.
- Idempotency: re-running cleanup after a partial approval is safe because already-moved plans are in `done/` and not scanned by SP1.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user reviewing stale cleanup proposals,
**I want** a grouped view of all proposals with per-plan and per-category approval controls,
**so that** I can clear a batch of phantom backlog in one review session without 14 separate prompts.

**As a** CTOC user approving a `shipped-but-early` or `approved-but-stranded` cleanup,
**I want** the execution to route through a dedicated reconciliation path (not `approvePlan()`),
**so that** the live Gate-3 audit trail is not polluted with months-old stale cleanup events and no spurious deployment is triggered.

### BDD Scenarios

- [ ] **Scenario: Grouped review renders all proposals with controls**
  Given SP3 produced 3 proposals: one `shipped-but-early`, one `approved-but-stranded`, one `dead-on-arrival`
  When the grouped review surface renders
  Then each proposal is listed with its plan name, category, proposed action, and evidence summary
  And each proposal has an "approve" control and an "override" control
  And a "select all shipped-but-early" affordance is present for the homogeneous category
  And a back/cancel option is present

- [ ] **Scenario: Approving shipped-but-early stamps markers before move and does not call approvePlan**
  Given a `shipped-but-early` proposal for `plans/functional/foo-plan.md`
  And a spy on `approvePlan` from `src/lib/actions.js`
  When the user approves the proposal
  Then `plans/functional/foo-plan.md` is moved to `plans/done/foo-plan.md`
  And the moved file's YAML frontmatter contains `approved_by: human`
  And the moved file's YAML frontmatter contains `gate_crossed` with value containing `'stale-reconciliation'`
  And the `approvePlan` spy was NOT called

- [ ] **Scenario: Approving approved-but-stranded uses reconciliation path, not approvePlan**
  Given an `approved-but-stranded` proposal for `plans/review/bar-plan.md`
  And a spy on `approvePlan` from `src/lib/actions.js`
  And a spy on `movePlan` from `src/lib/actions.js`
  When the user approves the proposal
  Then the plan lands in `plans/done/bar-plan.md` with `gate_crossed` containing `'stale-reconciliation'`
  And the `approvePlan` spy was NOT called
  And the `movePlan` spy was NOT called directly

- [ ] **Scenario: No action executes without explicit approve**
  Given 2 proposals are rendered in the grouped review
  When the user views the proposals but does not select approve for either
  Then no plan file is moved, stamped, or deleted
  And the proposals remain visible (no auto-execution after a timeout or render event)

- [ ] **Scenario: dead-on-arrival default is revert, not delete**
  Given a `dead-on-arrival` proposal where `evidence.explicitlyRejected` is false or absent
  When `executeCleanup(proposal, root)` is called with the default proposed action
  Then the plan is moved back one stage (reverted), NOT deleted
  And no `fs.unlinkSync` or `fs.rmSync` call is made

- [ ] **Scenario: delete requires explicitlyRejected evidence and explicit user override**
  Given a `dead-on-arrival` proposal where `evidence.explicitlyRejected` is true
  And the user selects "delete" as an override action
  And the user confirms the second confirmation prompt
  When `executeCleanup(proposal, root)` executes
  Then the plan file is deleted
  And the action is logged with `reason: 'stale-delete'`

- [ ] **Scenario: Moved plan carries markers that satisfy gate auto-revert hook**
  Given a `shipped-but-early` plan approved and moved to `done/`
  When `src/hooks/human-gate-check.js` evaluates the moved plan
  Then the plan is NOT reverted (it carries `approved_by: human` + `gate_crossed` as the hook expects)
  And the markers were written to the file BEFORE `fs.renameSync` was called (order asserted via spy sequence)

- [ ] **Scenario: executeCleanup accepts injectable deps for spy-based gate-safety testing**
  Given `executeCleanup(proposal, root, { approvePlan: spyFn, movePlan: spyFn2 })` is called
  When the cleanup runs
  Then the injected `spyFn` and `spyFn2` are used instead of the real implementations
  And SP5 can assert gate-safety invariants without fighting CommonJS module caching

### In Scope

- New module `src/lib/stale-cleanup.js` implementing:
  - `archivePlan(planPath, root)` — stamp-then-move to `done/` with `'stale-reconciliation'` marker
  - `reconcilePlan(planPath, root)` — same as archive but for `approved-but-stranded`; does NOT call `approvePlan()`
  - `revertPlan(planPath, root)` — move back one stage; no marker stamping
  - `deletePlan(planPath)` — only callable when `evidence.explicitlyRejected === true`
  - `executeCleanup(proposal, root, deps)` — dispatcher with injectable `deps` for testability
- Grouped review surface rendered in `src/areas/inbox.js` drill-in (extending SP2's drill-in)
- Per-plan approve/override/skip controls and "select all of category X" affordance
- Cleanup log written to `.ctoc/logs/stale-cleanup.json` with `reason` field
- YAML marker stamping for archive/reconciliation path: `approved_by: human` + `gate_crossed: 'stale-reconciliation <timestamp>'`
- Marker stamping BEFORE `fs.renameSync()` in all paths (gate-hook window protection)
- Cross-platform path handling via `path.join()` throughout `stale-cleanup.js`
- Unit test `tests/stale-cleanup-human-gate.test.js` asserting gate-safety invariants

### Out of Scope

- Calling `approvePlan()` from `src/lib/actions.js` — explicitly excluded by the reconciliation path design
- Modifying `src/lib/actions.js`, `src/hooks/human-gate-check.js`, or any other hook
- Permanently ignoring / suppressing specific candidates (future enhancement)
- Bulk-approve all (unlimited scope); "select all of category X" is the maximum batch affordance
- Deployment pipeline interaction — that is triggered by `approvePlan()`, which is NOT called
- Plan creation or vision-level actions

## Risks

### Technical Risks

- **Risk:** `archivePlan()` and `reconcilePlan()` must stamp markers into the YAML frontmatter of the file before moving it. The existing `addApprovalMarker()` in `actions.js` prepends a separate YAML block (two `---` pairs). Reusing it would create the same pattern; implementing it fresh risks divergence.
  - Likelihood: MEDIUM (the pattern is already used by `approvePlan()` in production)
  - Impact: LOW (the internal `parseFrontmatter` handles two-block YAML; external parsers are not used)
  - Mitigation: Implement marker stamping directly in `stale-cleanup.js` using the same prepend-block pattern (prepend a new `---\n...\n---\n` block before the original content). Do NOT import `addApprovalMarker` from `actions.js` — that function is tightly coupled to the `approvePlan` flow and could change.

- **Risk:** The gate auto-revert hook checks for approval markers before a plan can land in a destination stage. If markers are stamped AFTER moving the file, the hook triggers and reverts the move.
  - Likelihood: LOW (the hook runs synchronously; the window exists only between write and rename)
  - Impact: HIGH (an auto-revert would silently undo cleanup the user explicitly approved)
  - Mitigation: Stamp markers into file content in-memory, write to source path, THEN call `fs.renameSync`. This is the same ordering used in `approvePlan()` (lines 97-107 of `actions.js`). An acceptance test (M7 scenario) asserts the write-before-rename order via a spy sequence.

### Business Risks

- **Risk:** "Select all of category X" could archive or revert plans the user did not individually review, eroding trust if any plan in the batch was misclassified by SP3.
  - Likelihood: LOW (SP3 classification requires both git-slug match AND file evidence)
  - Impact: MEDIUM (a wrongly archived plan can be recovered from `done/` but requires manual intervention)
  - Mitigation: Require a confirmation prompt after "select all of category X" that lists the count and category before executing; show the evidence summary for each plan in the batch before the user confirms.

- **Risk:** The reconciliation path bypasses `approvePlan()` entirely. If a future version of `approvePlan()` adds important side effects (e.g. Slack notifications, analytics), those side effects will not fire for stale cleanup.
  - Likelihood: LOW (stale cleanup is intentionally distinct from live Gate-3 crossings)
  - Impact: LOW (the `reason: 'stale-reconciliation'` in the cleanup log makes the bypass explicit and auditable)
  - Mitigation: Document in `stale-cleanup.js` JSDoc that reconciliation intentionally bypasses `approvePlan()` and why. Add a comment in `actions.js` cross-referencing `stale-cleanup.js` for awareness (read-only comment, no logic change).

### Dependency Risks

- **Risk:** SP5 requires the `deps` injection seam in `executeCleanup` to spy on gate-safety. If `deps` is not implemented as specified, SP5's gate-safety test always passes (it cannot distinguish the spy from the real call).
  - Likelihood: LOW (the seam is declared in this plan and in SP5)
  - Impact: HIGH (a false-green gate-safety test defeats the purpose of SP5)
  - Mitigation: Declare `executeCleanup(proposal, root, deps = {})` with `deps.approvePlan` and `deps.movePlan` optional overrides from the start. SP5 tests validate the seam is wired correctly by asserting the spy is called when injected.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) — depends on SP3; SP5 depends on this; no sibling parallelism possible
- Business Impact: HIGH (3) — this is the action slice; without it the feature produces proposals but never resolves phantom backlog
- Technical Risk: HIGH (2) — gate auto-revert hook interaction and marker-before-move ordering are real risks requiring careful sequencing

## Decisions Taken Under Ambiguity

- **Dedicated reconciliation path, not `approvePlan()`:** using `approvePlan()` for stale cleanup re-fires the deployment pipeline and logs a fresh live Gate-3 crossing, polluting the audit trail for months-old work. The reconciliation path in `stale-cleanup.js` stamps markers and moves files without calling `approvePlan()`. This is explicitly documented in both files.
- **`dead-on-arrival` default is `revert`:** reversible-first. Moving a plan back a stage is undoable; deletion is not. `delete` is only available as an explicit human override when `evidence.explicitlyRejected === true`. No auto-delete under any circumstances.
- **Revert destination:** one stage back from current stage (`review → implementation`, `implementation → functional`, `functional → vision`). The move is not a gate crossing — no markers are stamped during revert.
- **Approval granularity:** grouped surface with per-plan approve/override + "select all of category X". Not 14 separate prompts; not a single blanket approve. Requires a count+category confirmation before the batch executes.
- **Marker stamping order:** stamp markers into file content BEFORE `fs.renameSync()` — matches the order in `approvePlan()` to avoid the gate-revert window.
- **`executeCleanup(proposal, root, deps)` seam:** injectable `deps` parameter allows SP5 to spy on `approvePlan` and `movePlan` without CommonJS module-cache tricks. Default is `{}` (production path uses the real functions from `stale-cleanup.js`'s own imports).
- **`src/lib/actions.js` removed from `files:`:** SP4 does NOT modify `actions.js`. The file was in the original plan as a read dependency; it is not a write target for SP4 and therefore does not belong in `files:` (the enforcement hook only gates writes).

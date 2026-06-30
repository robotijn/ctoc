---
iron_loop: true
approved_by: human
approved_at: 2026-06-30T20:27:38.653Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-06-30T18:35:52.980Z
gate_crossed: functional → implementation
---

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
  - src/lib/menu-screens.js
  - tests/stale-cleanup-human-gate.test.js
  - README.md
  - tests/readme-numbers.test.js
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

The menu-layer surface for inbox stale plans (`src/lib/menu-screens.js`) ships SP2's `inboxStalePlansDrillIn` and SP3's `inboxVerifyProposals` (read-only proposals screen, route `inbox verify`). SP4 extends this surface by adding `inboxCleanupReview` and its child screens to `src/lib/menu-screens.js`, reachable via the `inbox cleanup` route and navigated by label only (no digit maps to a cleanup action). `src/areas/inbox.js` is NOT modified by SP4.

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

- **M1:** The grouped review surface (`inboxCleanupReview`, route `inbox cleanup`) renders each proposal with plan name, category, proposed action, and evidence, then offers exactly three options: `'Approve a category ▸'` / `'Review individually ▸'` / `'◀ Back'`. Selecting `'Approve a category ▸'` navigates to `inboxCleanupCategoryPick` (one option per actionable category, ≤4 incl. `'◀ Back'`); selecting a category navigates to `inboxCleanupCategoryConfirm` showing the count and category before any execution (`'Confirm: archive N shipped-but-early plans'` / `'◀ Back'`); confirming batch-executes via `stale-cleanup.js`. Selecting `'Review individually ▸'` navigates to `inboxCleanupPlanReview` offering `'Approve'` / `'Override ▸'` / `'Skip'` / `'◀ Back'`; `'Override ▸'` leads to `inboxCleanupPlanOverride` listing the allowed alternative actions for that plan's category. No digit maps to any cleanup action at any screen in this flow.
- **M2:** Approving a `shipped-but-early` proposal moves the plan to `done/` via the reconciliation path — markers stamped BEFORE the move. A test asserts both `approved_by: human` and `gate_crossed` containing `'stale-reconciliation'` are present in the file after the move. `approvePlan()` is NOT called (spy assertion).
- **M3:** Approving an `approved-but-stranded` proposal executes the same reconciliation path — stamp-then-move-to-done with `reason: 'stale-reconciliation'`. A test asserts `approvePlan()` is NOT called (spy). `movePlan()` from `actions.js` is NOT called directly either (spy).
- **M4:** A test asserts no cleanup action executes without an explicit human approve step — the proposals are surfaced and wait; no auto-execution occurs.
- **M5:** Marker stamping occurs BEFORE `fs.renameSync()` in all archive/reconciliation paths so the gate auto-revert hook in `src/hooks/human-gate-check.js` does NOT revert the move.
- **M6:** `dead-on-arrival` default action is `revert`. `delete` requires explicit human override AND `evidence.explicitlyRejected === true`. A test asserts the default proposal for a DOA plan without `explicitlyRejected` is `revert`, not `delete`.
- **M7:** The override flow (`inboxCleanupPlanOverride`) allows the user to select a different action from the allowed set for that plan's category (e.g. `revert` instead of `archive-to-done`) or to skip the plan entirely (it remains in place and re-surfaces on the next scan).
- **M8:** `executeCleanup(proposal, root, deps)` accepts an optional `deps` parameter containing injectable `{ approvePlan, movePlan, listStaleCandidates }` overrides — the testability seam required by SP5 to spy on gate-safety invariants (and to drive deterministic stage re-derivation) without CommonJS module-cache tricks.

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

- [ ] **Scenario: Grouped review screen offers category-batch and individual approval paths**
  Given SP3 produced 3 proposals: one `shipped-but-early`, one `approved-but-stranded`, one `dead-on-arrival`
  When the `inbox cleanup` screen (`inboxCleanupReview`) renders
  Then each proposal is listed with its plan name, category, proposed action, and evidence summary
  And the screen offers exactly three options: `'Approve a category ▸'`, `'Review individually ▸'`, and `'◀ Back'`
  And selecting `'Approve a category ▸'` navigates to a category-pick screen listing actionable categories (≤4 options incl. `'◀ Back'`)
  And selecting a category on the category-pick screen leads to a CONFIRM screen showing the count and category label before any execution (`'Confirm: archive N shipped-but-early plans'` / `'◀ Back'`)
  And selecting `'Review individually ▸'` navigates to a per-plan screen with `'Approve'` / `'Override ▸'` / `'Skip'` / `'◀ Back'`
  And no digit maps to any cleanup action at any screen in this flow

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
  Given `executeCleanup(proposal, root, { approvePlan: spyFn, movePlan: spyFn2, listStaleCandidates: spyFn3 })` is called
  When the cleanup runs
  Then the injected `movePlan` (revert) and `listStaleCandidates` (stage re-derivation) overrides are used instead of the real implementations
  And `approvePlan` is never called (structurally — it is not imported)
  And SP5 can assert gate-safety invariants without fighting CommonJS module caching

### In Scope

- New module `src/lib/stale-cleanup.js` implementing:
  - `archivePlan(planPath, root)` — stamp-then-move to `done/` with `'stale-reconciliation'` marker
  - `reconcilePlan(planPath, root)` — same as archive but for `approved-but-stranded`; does NOT call `approvePlan()`
  - `revertPlan(planPath, root)` — move back one stage; no marker stamping
  - `deletePlan(planPath)` — only callable when `evidence.explicitlyRejected === true`
  - `executeCleanup(proposal, root, deps)` — dispatcher that RE-DERIVES the plan's current stage via `listStaleCandidates(root)` (matching `candidate.plan === slug`; fail-closed no-op if absent), then routes to the right primitive; injectable `deps` (`{ approvePlan, movePlan, listStaleCandidates }`) for SP5 testability
- Grouped review surface in `src/lib/menu-screens.js` as new screen functions, extending SP3's `inboxVerifyProposals` with a `'Clean up ▸'` label option (→ `inbox cleanup`) when actionable proposals exist:
  - `inboxCleanupReview` — entry screen (route `inbox cleanup`); lists proposals grouped by category; offers `'Approve a category ▸'` / `'Review individually ▸'` / `'◀ Back'`
  - `inboxCleanupCategoryPick` — category selection screen (route `inbox cleanup category`); one option per actionable category, ≤4 options incl. `'◀ Back'`
  - `inboxCleanupCategoryConfirm` — count+category CONFIRM screen (route `inbox cleanup confirm <category>`); offers `'Confirm: <verb> N <category> plans'` / `'◀ Back'`; batch-executes via `stale-cleanup.js` on confirm
  - `inboxCleanupPlanReview` — per-plan screen (route `inbox cleanup plan <slug>`); offers `'Approve'` / `'Override ▸'` / `'Skip'` / `'◀ Back'`
  - `inboxCleanupPlanOverride` — override-action screen (route `inbox cleanup override <slug>`); lists allowed alternative actions for the plan's category; includes `'◀ Back'`
- Navigation by label only throughout all new screens — no digit maps to any cleanup action
- `route()` in `menu-screens.js` extended with `inbox cleanup` dispatch tree (`inbox cleanup` → `inboxCleanupReview`; `inbox cleanup category` → `inboxCleanupCategoryPick`; `inbox cleanup confirm <category>` → `inboxCleanupCategoryConfirm`; `inbox cleanup plan <slug>` → `inboxCleanupPlanReview`; `inbox cleanup override <slug>` → `inboxCleanupPlanOverride`)
- Cleanup log written to `.ctoc/logs/stale-cleanup.json` with `reason` field
- YAML marker stamping for archive/reconciliation path: `approved_by: human` + `gate_crossed: 'stale-reconciliation <timestamp>'`
- Marker stamping BEFORE `fs.renameSync()` in all paths (gate-hook window protection)
- Cross-platform path handling via `path.join()` throughout `stale-cleanup.js`
- Unit test `tests/stale-cleanup-human-gate.test.js` asserting gate-safety invariants

### Out of Scope

- Calling `approvePlan()` from `src/lib/actions.js` — explicitly excluded by the reconciliation path design
- Modifying `src/lib/actions.js`, `src/hooks/human-gate-check.js`, or any other hook
- Modifying `src/areas/inbox.js` — SP4's UI lives entirely in `src/lib/menu-screens.js`
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
  - Mitigation: Stamp markers into file content in-memory, write to source path, THEN call `fs.renameSync`. This is the same ordering used in `approvePlan()` (lines 97-107 of `actions.js`). An acceptance test (M5/scenario 7) asserts the write-before-rename order via a spy sequence.

### Business Risks

- **Risk:** "Select all of category X" could archive or revert plans the user did not individually review, eroding trust if any plan in the batch was misclassified by SP3.
  - Likelihood: LOW (SP3 classification requires both git-slug match AND file evidence)
  - Impact: MEDIUM (a wrongly archived plan can be recovered from `done/` but requires manual intervention)
  - Mitigation: The category-batch path requires the user to navigate two screens before `stale-cleanup.js` executes — `inboxCleanupCategoryPick` (select a category) followed by `inboxCleanupCategoryConfirm` (showing `'Confirm: archive N shipped-but-early plans'` / `'◀ Back'`). The confirm screen displays the count and category label; individual plan evidence is visible on the preceding `inboxCleanupReview` screen. No batch executes without this two-screen, two-action confirmation sequence.

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
- **Approval granularity:** grouped surface with per-plan approve/override + "select all of category X". Not 14 separate prompts; not a single blanket approve. Requires a two-screen count+category confirmation before the batch executes.
- **Marker stamping order:** stamp markers into file content BEFORE `fs.renameSync()` — matches the order in `approvePlan()` to avoid the gate-revert window.
- **`executeCleanup(proposal, root, deps)` seam:** injectable `deps` parameter allows SP5 to spy on `approvePlan` and `movePlan` without CommonJS module-cache tricks. Default is `{}` (production path uses the real functions from `stale-cleanup.js`'s own imports).
- **Gap A — UI module is `src/lib/menu-screens.js`, not `src/areas/inbox.js`:** SP2 and SP3 established the stale-plan inbox as part of the slash-command JSON surface in `menu-screens.js` (`inboxStalePlansDrillIn`, `inboxVerifyProposals`). Placing SP4's approve screens in `src/areas/inbox.js` (the legacy TTY areas module) would split the stale workflow across two rendering paths and break the `{ text, ask, actions }` JSON API contract the menu driver reads. Extending `menu-screens.js` keeps the full stale-plan flow (detect → verify → clean up) in one coherent module. `src/areas/inbox.js` is NOT modified by SP4.
- **Gap B — Approve UX: Option A (nested screens within AskUserQuestion's 4-option cap):** The `inboxCleanupReview` entry screen (route `inbox cleanup`) offers `'Approve a category ▸'` / `'Review individually ▸'` / `'◀ Back'` — three options, within the 4-option cap. Screen and route names mirror SP3's `inbox verify`/`inboxVerifyProposals` naming pattern: `inboxCleanupReview` (`inbox cleanup`), `inboxCleanupCategoryPick` (`inbox cleanup category`), `inboxCleanupCategoryConfirm` (`inbox cleanup confirm <category>`), `inboxCleanupPlanReview` (`inbox cleanup plan <slug>`), `inboxCleanupPlanOverride` (`inbox cleanup override <slug>`). Navigation entry from SP3: `inboxVerifyProposals` is extended with a `'Clean up ▸'` label option (→ `inbox cleanup`) when actionable proposals exist — this addition is part of SP4's scope on `menu-screens.js`. No digit maps to any cleanup action at any screen.
- **Gap C — Gate marker: Option 1 (`approved_by: human` + `gate_crossed: 'stale-reconciliation <ISO ts>'`, no distinct marker, no hook modification):** The gate auto-revert hook (`src/hooks/human-gate-check.js`) reverts any file in `plans/done/` lacking `approved_by: human`; its revert map sends `done/` → `review/`, which is the wrong destination for a functional-origin plan arriving via stale reconciliation. Stamping `approved_by: human` is therefore required to prevent an immediate hook revert. A distinct new marker field (Option 2) was rejected because the hook checks only `approved_by: human` — a distinct field alone still triggers the revert. Adding logic to `human-gate-check.js` (Option 3) was rejected because gate logic is safety-critical and must not be modified (project rule and SP4 Constraints). The `gate_crossed: 'stale-reconciliation <ISO timestamp>'` field disambiguates the cleanup move from a live Gate-3 crossing in the audit trail. Execution occurs ONLY after explicit per-plan or per-category human approval via the menu screens — no auto-crossing ever occurs.

### Implementation-stage decisions (Steps 5–6, resolved by the implementation planner)

- **D1 — Stage is RE-DERIVED at exec time via the scanner; classifier output unchanged; the exec string carries only `{slug, action}`:** `classifyStaleCandidate` returns the locked 4-key proposal `{ plan, category, proposedAction, evidence: string[] }` (asserted by SP3's `classifier — proposal shape` test, which must keep passing) — it carries NO `stage` and NO `explicitlyRejected`. SP3's classifier contract is not modified. The earlier design tried to thread `stage` through an "augmented cleanup item" built in the menu layer, but the execution trigger is a `claude:cleanup-exec plan <slug> <action>` STRING (D5) that carries NO stage — so the augmented item never reached `executeCleanup`, which then built `path.join(root,'plans',proposal.stage,…)` = `plans/undefined/<slug>.md` and ENOENT-no-op'd at the only human entry point (the F1/F2 CRITICAL bug). **Resolution (human decision, Option a): `executeCleanup` re-derives the plan's CURRENT stage itself** by calling `listStaleCandidates(root)` (or `deps.listStaleCandidates`) and matching `candidate.plan === proposal.plan`, then reading `candidate.stage`. This is authoritative and robust to render→exec drift (if the plan moved between render and exec, the CURRENT stage wins). If no candidate matches the slug (already cleaned / no longer stale) → FAIL CLOSED: log a `noop` and return without mutating anything (idempotent). `explicitlyRejected` is NOT re-derived from the scan (the cheap candidate has no such field, and SP3's classifier defaults it false) — it is set ONLY by the explicit override-delete path: the override screen renders `'Delete permanently'` solely when `item.explicitlyRejected === true`, and the executor maps that single action to a proposal carrying `explicitlyRejected:true`. The menu layer still builds display items (category/evidence/explicitlyRejected-for-override-gating) for the screens, but the EXEC path threads only the slug + action through the `claude:` string; stage and the rejection flag are re-derived/re-supplied at exec, never trusted from a render-time snapshot. `executeCleanup` consumes `{ plan, proposedAction, action?:override, explicitlyRejected? }` and reads the effective action (`proposal.action` override ?? `proposal.proposedAction`).
- **D2 — `deps` seam semantics (gate-safety as a structural guarantee):** `stale-cleanup.js` imports from `actions.js` ONLY `movePlan` (the default mover for `revert`) — it deliberately does NOT import `approvePlan` at all, so the module is *structurally incapable* of crossing a live Gate 3 or firing the deployment pipeline (the strongest possible form of M2/M3). It additionally imports `listStaleCandidates` from `inbox.js` for stage re-derivation (D1); this does NOT weaken the guarantee because `inbox.js` exports no `approvePlan` (its exports are `getInboxCounts, listQuestions, listDecisions, listPlansAtGates, listStaleCandidates, createQuestion, createDecision`) — `approvePlan` is absent from every binding `stale-cleanup.js` holds. No require cycle is introduced: `inbox.js` requires only `./cache` and `./stale-detector` (namespace), neither re-enters `stale-cleanup`, and `actions.js` never imports `inbox` (verified against shipped code). `executeCleanup(proposal, root, deps = {})`: stage re-derivation routes through `deps.listStaleCandidates ?? listStaleCandidates`; the `revert` branch routes through `deps.movePlan ?? movePlan` (the seam's live half — SP5 injects a spy and asserts it IS called for a revert); the `archive`/`reconcile` branches are fully self-contained (own marker-stamp + `fs.renameSync`) and never touch the injected mover (SP5 asserts the `movePlan` spy has 0 calls for archive/reconcile). `deps.approvePlan` is part of the documented seam contract for SP5's negative assertion but is never referenced by any code path — its 0-call guarantee is enforced structurally by the absent import. This is intentional negative space; the Step-11/critic reviewer must NOT "fix" the unused contract field.
- **D3 — `revertPlan(planPath, root, deps = {})` is a documented superset of the In-Scope `revertPlan(planPath, root)`:** the optional trailing `deps` (default `{}`) carries `deps.movePlan` so the move-seam is exercised end-to-end; the 2-arg form still works standalone (falls back to the imported `movePlan`). `archivePlan`/`reconcilePlan` keep their exact In-Scope signatures.
- **D4 — `deletePlan(planPath, { explicitlyRejected = false } = {})` safety guard:** a documented superset of the In-Scope `deletePlan(planPath)`. The primitive itself THROWS unless `explicitlyRejected === true`, independent of the dispatcher guard (belt-and-suspenders: deletion is irreversible, so it is refused by construction at two layers).
- **D5 — Execution is a `claude:cleanup-exec …` action, never a render side effect:** every `menu-screens.js` render function is pure — it produces option labels and action STRINGS and performs NO file mutation (the structural form of M4). The actual `executeCleanup` call fires only when the human selects the explicit `'Confirm: …'` (batch) or `'Approve'` (per-plan) label, which maps to a `claude:cleanup-exec …` string that Claude acts on — mirroring the existing `claude:approve` / `claude:reject` convention emitted by `menu-screens.js`. No dispatcher/command file outside SP4's three scoped files is added or modified; the plan's `files:` is authoritative.
- **D6 — `gate_crossed` unquoted, identical block shape to `addApprovalMarker`:** the stamp is a separate leading block `---\napproved_by: human\napproved_at: <ISO>\ngate_crossed: stale-reconciliation <ISO>\n---\n\n` prepended to the original content (two-block frontmatter). Value is unquoted, matching the proven `approved_at:` pattern (ISO colons are not `": "`-delimited, so the scalar parses cleanly). The first block satisfies `human-gate-check.hasApprovalMarker`; `extractFrontmatterRegion` still finds `files:` in the second block.
- **D7 — review-stage dead-on-arrival revert edge:** `revert` maps `review → implementation`, which is a hook-watched destination. An unmarked DOA plan landing in `implementation/` may be further reverted `implementation → functional` by the gate hook on the next tool call. Accepted as-is: still strictly backward, reversible, no data loss; a review-stage DOA (no `approved_by`) is itself anomalous because a normal review plan carries the Gate-2 marker. Not specially handled (handling it would require touching the hook, which is out of scope).
- **D8 — stateless re-derivation everywhere (screens AND `executeCleanup`):** each cleanup screen re-derives candidates/proposals from disk + git on render (no cross-screen session state), matching SP2/SP3. Category membership and `explicitlyRejected` are recomputed at confirm/override time. Crucially, `executeCleanup` ALSO re-derives — it does not trust any value baked into the `claude:cleanup-exec` string beyond the slug + action: it calls `listStaleCandidates(root)` at exec time and reads the matched candidate's CURRENT `stage` (D1). Because every proposal originates from `listStaleCandidates`, the slug IS a member of that scan at render time; the cheap scan is the single source of truth for stage, so render→exec drift cannot produce a wrong path. Bounded by the 20-row cap; cold-path only. A plan already moved by a prior approval is simply absent from the next scan, so `executeCleanup` fail-closes to a no-op (idempotency) rather than throwing on a missing `plans/<stage>/<slug>.md`.

- **D9 — `Clean up ▸` ENTRY is gated on FORWARD-to-done actionable proposals (implementation-stage discovery, Step 8):** M1/Gap B's claim that adding the `Clean up ▸` option to `inboxVerifyProposals` leaves all SP3 tests green is FALSE for `stale-classifier.test.js` test 13: that test's fixture (`p-render`, functional stage, one missing declared file, `execFileSync`→`'1700000000'`) classifies as `dead-on-arrival` (actionable) and asserts the read-only screen renders EXACTLY one option (`assert.equal(screen.ask.questions[0].options.length, 1)`). Adding the entry for ANY actionable category (DOA included) makes it two options → red. `stale-classifier.test.js` is out of SP4's `files:` scope (so the enforcement hook blocks editing it) and the executor mandate requires the full suite stay green. **Resolution:** the `Clean up ▸` entry is surfaced only when ≥1 proposal is FORWARD-to-done actionable (`shipped-but-early` ∪ `approved-but-stranded`). DOA does not by itself surface the entry; this preserves test 13's single-option contract (a DOA-only set still renders one Back option) AND is defensible — DOA's default action is the low-risk reversible `revert`, and an unmarked DOA plan is itself anomalous (D7). DOA items remain FULLY handled inside the cleanup screens: `_buildCleanupItems` includes every actionable category, so once the entry is reached (whenever the set contains any forward candidate) DOA revert/delete are available via per-plan review/override (T9 drives the DOA override delete-gating directly through the `inbox cleanup override <slug>` route, which is not entry-gated). Known limitation flagged for morning review: a PURE-DOA stale set (no forward candidate) does not surface the entry from `inboxVerifyProposals`; broadening the trigger to include DOA requires updating `stale-classifier.test.js` test 13, which is outside SP4's file scope.

## 5. PLAN — Technical Architecture

### Architecture Decision Record — the reconciliation path

**Context.** Three of the four cleanup actions (`archive-to-done` for shipped-but-early, `advance-via-reconciliation` for approved-but-stranded) move a plan *forward* into `plans/done/`. `done/` is a human-gate destination: `src/hooks/human-gate-check.js` reverts any file there lacking `approved_by: human` (revert map sends `done/ → review/`). The sanctioned forward-crossing function, `actions.approvePlan()`, would (a) re-fire the deployment pipeline (lines 121–134 of `actions.js`), (b) log a fresh *live* Gate-3 crossing into the transition audit trail, and (c) stamp `gate_crossed: review → done` — all wrong for months-old stale cleanup.

**Decision.** `src/lib/stale-cleanup.js` implements a **dedicated reconciliation path** that reproduces only the *gate-safe* half of `approvePlan` — stamp `approved_by: human` into the frontmatter, then move — using the same prepend-block shape as `actions.addApprovalMarker` but with a `stale-reconciliation` `gate_crossed` value and NO deployment, NO transition log, NO `approvePlan` call. The module does not even *import* `approvePlan`, so it cannot regress into calling it. The marker is stamped **in memory and written to the source path BEFORE `fs.renameSync`** (the gate-hook window mitigation), identical in ordering to `approvePlan` (actions.js lines 97–107).

**Consequences.** (+) The hook accepts the moved file (first frontmatter block carries `approved_by: human`); no spurious deploy; the audit trail clearly distinguishes cleanup (`gate_crossed: stale-reconciliation …`) from a live crossing. (+) `actions.js` and `human-gate-check.js` are untouched. (−) Future side effects added to `approvePlan` (e.g. notifications) will not fire for stale cleanup — documented and intended (Risk: Business #2). (−) `stale-cleanup.js` duplicates the marker-stamp shape; mitigated by a single internal `_stampMarker` helper and a test asserting the shape matches what the hook parses.

### Dependency Graph

```
stale-cleanup.js (NEW)
   ├─ require('fs'), require('path')                      [Node built-ins]
   ├─ require('./actions').movePlan                       [revert default mover ONLY]
   │      └─ NOTE: approvePlan is DELIBERATELY NOT imported (structural gate-safety)
   ├─ require('./inbox').listStaleCandidates              [stage RE-DERIVATION at exec time — D1/D8]
   │      └─ NOTE: inbox exports {getInboxCounts, listQuestions, listDecisions, listPlansAtGates,
   │               listStaleCandidates, createQuestion, createDecision} — NO approvePlan, so this
   │               import does NOT make approvePlan reachable.
   ├─ writes  → .ctoc/logs/stale-cleanup.json             [append-only log]
   └─ mutates → plans/<stage>/<slug>.md  (stamp+rename / rename / unlink)

menu-screens.js (MODIFY)
   ├─ already requires ./stale-detector (namespace), ./inbox, ./project-root
   ├─ extends inboxVerifyProposals  → adds 'Clean up ▸' label → 'inbox cleanup'
   ├─ adds 5 screen fns + route() 'inbox cleanup …' subtree
   ├─ emits nav strings ('inbox cleanup …') and exec strings ('claude:cleanup-exec …')
   └─ NO require('./stale-cleanup')   ← decoupled: execution flows via the claude: action

tests/stale-cleanup-human-gate.test.js (NEW)
   ├─ require('../src/lib/stale-cleanup')      [unit: executeCleanup + primitives]
   ├─ require('../src/lib/menu-screens')       [reachability/render purity]
   └─ require('../src/lib/actions')            [spy reference for negative assertions]

NO cycle: stale-cleanup → {actions, inbox}; inbox → {cache, stale-detector}; stale-detector → (no
  local requires); actions → (never inbox / stale-detector / stale-cleanup). No path returns to
  stale-cleanup, so adding require('./inbox') introduces no require cycle (verified against shipped code).
NO edge stale-cleanup.js → human-gate-check.js. NO edge stale-cleanup.js → approvePlan (movePlan is the
  ONLY binding pulled from actions; inbox exports no approvePlan — approvePlan stays unreachable).
NO edge menu-screens.js → stale-cleanup.js (the claude: convention keeps render pure).
```

### Implementation Order (dependency order; TDD-Red still leads at Step 8)

1. `src/lib/stale-cleanup.js` (CREATE) — no dependency on the new menu screens; the leaf of this slice.
2. `tests/stale-cleanup-human-gate.test.js` (CREATE) — gate-safety unit tests target `stale-cleanup.js`; written Red-first at Step 8.
3. `src/lib/menu-screens.js` (MODIFY) — the `'Clean up ▸'` entry, the 5 screens, and the `route()` subtree; emits the `claude:cleanup-exec …` strings the executor (Claude) maps to `executeCleanup`.
4. Reachability + render-purity cases appended to the same test file (Step 8).

### Integration Points

| Seam | Direction | Contract |
|---|---|---|
| `inboxVerifyProposals` → `inbox cleanup` | menu nav | Add `'Clean up ▸'` option (label only) when ≥1 *actionable* proposal exists (category ∈ {shipped-but-early, approved-but-stranded, dead-on-arrival}); maps to `'inbox cleanup'`. `inconclusive`-only proposal sets show no Clean-up option. |
| `route(['inbox','cleanup', …])` | menu dispatch | New subtree (see §6.2). Each leaf returns `{ text, ask, actions }`. |
| `'Confirm: …'` / `'Approve'` labels | menu → Claude | Map to `claude:cleanup-exec category <category>` / `claude:cleanup-exec plan <slug> <action>`. Claude invokes `executeCleanup`. |
| `executeCleanup` → `inbox.listStaleCandidates` | read | Re-derives the plan's CURRENT `stage` at exec time by matching `candidate.plan === slug` (authoritative; robust to render→exec drift). Slug absent from the live scan ⇒ fail-closed no-op (idempotent). Via `deps.listStaleCandidates ?? listStaleCandidates`. `explicitlyRejected` is NOT re-derived here — it rides the explicit override-delete action only (D1). |
| `executeCleanup` → `actions.movePlan` | move (revert only) | Via `deps.movePlan ?? movePlan`; archive/reconcile bypass it. |
| `stale-cleanup.js` → `human-gate-check.js` | implicit | Produces moves the unmodified hook accepts (stamp-before-rename). |

### Data Flow (per category)

```
stage RE-DERIVATION (first step of EVERY executeCleanup call, before any branch — D1/D8):
  scan = (deps.listStaleCandidates ?? listStaleCandidates)(root)   [the SAME cheap scan that produced
                                                                   the proposals — slug is a member by construction]
  cand = scan.find(c => c.plan === proposal.plan)
  if (!cand) → FAIL CLOSED: appendLog({ plan, action:'noop', reason:'not-currently-stale', at:<ISO> });
              return { plan, action:'noop', skipped:true }   [NO fs mutation — idempotent: already cleaned]
  stage = cand.stage                                          [CURRENT on-disk stage — authoritative]
  sourcePath = path.join(root,'plans',stage,proposal.plan + '.md')

shipped-but-early / approved-but-stranded (forward → done):
  read sourcePath
   → _stampMarker(content, 'stale-reconciliation <ISO>')   [prepend ---…--- block, IN MEMORY]
   → fs.writeFileSync(sourcePath, stamped)                 [WRITE-BEFORE-RENAME]
   → fs.renameSync(sourcePath, plans/done/<slug>.md)       [hook now accepts: approved_by:human present]
   → appendLog({ plan, from:stage, to:'done', action, reason:'stale-reconciliation', at:<ISO> })

dead-on-arrival (default revert, backward, NO marker):
  priorStage = REVERT_MAP[stage]
   → (deps.movePlan ?? movePlan)(sourcePath, priorStage, root)   [plain rename, no stamp]
   → appendLog({ …, to:priorStage, action:'revert', reason:'stale-revert', at:<ISO> })

dead-on-arrival (delete, override only, irreversible):
  guard: proposal.explicitlyRejected === true       (else REFUSE — set ONLY by the override-delete path, D1)
   → deletePlan(sourcePath, { explicitlyRejected:true })   [guard again → fs.unlinkSync]
   → appendLog({ …, to:null, action:'delete', reason:'stale-delete', at:<ISO> })

inconclusive / null action, or slug unmatched in the live scan: no-op (nothing executes).
```

## 6. DESIGN — Implementation Blueprint

### 6.1 File: `src/lib/stale-cleanup.js`

**Action:** CREATE
**Purpose:** Execute human-approved stale-plan cleanup — archive/reconcile to `done/` via a dedicated gate-safe reconciliation path (stamp-before-rename, never `approvePlan`), revert one stage, or delete (only when explicitly rejected). The sole module that mutates plan files for cleanup.
**Change Type:** new-module.

#### Module-level imports & constants

```js
'use strict';
const fs = require('fs');
const path = require('path');
// movePlan ONLY — approvePlan is deliberately NOT imported (D2: structural gate-safety;
// the module is physically unable to fire a live Gate-3 crossing / deployment pipeline).
const { movePlan } = require('./actions');
// listStaleCandidates ONLY — used to RE-DERIVE a plan's current stage at exec time (D1/D8).
// inbox.js exports no approvePlan, so this import does NOT widen the gate-safety surface.
// No require cycle: inbox → {cache, stale-detector}; neither re-enters stale-cleanup; actions
// never imports inbox (verified against shipped code).
const { listStaleCandidates } = require('./inbox');

// Backward revert map (inverse of the forward gate flow). Only the three
// gate-source stages the detector scans are valid inputs.
const REVERT_MAP = Object.freeze({
  review: 'implementation',
  implementation: 'functional',
  functional: 'vision',
});

const CLEANUP_LOG = ['.ctoc', 'logs', 'stale-cleanup.json']; // path segments under root
```

#### Internal helpers

```
_stampMarker(content: string, reason: string) → string
  - reason e.g. 'stale-reconciliation <ISO>'. Returns:
      `---\napproved_by: human\napproved_at: ${ISO}\ngate_crossed: ${reason}\n---\n\n` + content
  - SAME prepend-block shape as actions.addApprovalMarker (two-block frontmatter).
  - Pure string op; ISO via new Date().toISOString().

_appendLog(root, entry) → void
  - mkdir -p path.join(root, ...CLEANUP_LOG dir); read-or-[]; push entry; writeFileSync JSON (2-space).
  - entry: { plan, from, to, action, reason, at }. Best-effort: a logging failure is caught and
    swallowed (matches actions.cleanupStaleInProgress) — never aborts a completed move.

_assertSafeSlug(planPath) / path resolution
  - planPath is built by the caller from path.join(root,'plans',stage,slug+'.md'); functions accept
    an absolute planPath and operate on it directly (no slug interpolation into shell — no subprocess
    is ever spawned in this module).
```

#### Exports & exact signatures

```
archivePlan(planPath: string, root: string) → { from, to:'done', path:string, reason:'stale-reconciliation' }
  Throws: Error if planPath missing/unreadable.
  Self-contained — does NOT call approvePlan or movePlan:
    1. content = fs.readFileSync(planPath,'utf8')
    2. stamped = _stampMarker(content, 'stale-reconciliation ' + ISO)
    3. fs.writeFileSync(planPath, stamped)          ← WRITE strictly BEFORE rename (M5)
    4. dest = path.join(root,'plans','done', path.basename(planPath))
       (mkdir -p plans/done); fs.renameSync(planPath, dest)
    5. _appendLog(root, { plan, from:<derived from planPath dir>, to:'done',
                          action:'archive-to-done', reason:'stale-reconciliation', at:ISO })

reconcilePlan(planPath: string, root: string) → { …, reason:'stale-reconciliation' }
  IDENTICAL reconciliation path as archivePlan (approved-but-stranded). Distinct named export for
  call-site clarity + log action 'advance-via-reconciliation'. Internally delegates to a shared
  `_stampAndArchive(planPath, root, action)`; does NOT call approvePlan, does NOT call movePlan (M3).

revertPlan(planPath: string, root: string, deps = {}) → { from, to:<priorStage>, path, reason:'stale-revert' }
  prior = REVERT_MAP[<stage from planPath>]; if !prior → throw Error('cannot revert from stage …').
  move = deps.movePlan || movePlan;          ← seam (D2/D3); default = imported actions.movePlan
  newPath = move(planPath, prior, root);     ← plain rename, NO marker (revert is not a gate crossing)
  _appendLog(root, { …, to:prior, action:'revert', reason:'stale-revert', at:ISO });
  NO fs.unlinkSync / fs.rmSync anywhere in this function (M6).

deletePlan(planPath: string, { explicitlyRejected = false } = {}) → { …, action:'delete', reason:'stale-delete' }
  if (explicitlyRejected !== true) throw Error('refusing delete: explicitlyRejected not set');  ← guard (M6/D4)
  fs.unlinkSync(planPath);
  _appendLog(root?, …)  // root derived from planPath via path; see note below.

executeCleanup(proposal, root, deps = {}) → result object
  proposal (cleanup descriptor — NO stage field; stage is re-derived here, D1):
    { plan:string /*slug*/, category?, proposedAction, action?:string /*override*/,
      explicitlyRejected?:boolean /*set ONLY by the override-delete path*/ }
  // ── stage RE-DERIVATION (D1/D8) — runs before any branch ──────────────────────────────────────
  const scan = (deps.listStaleCandidates || listStaleCandidates)(root);   ← seam (SP5-injectable)
  const cand = scan.find(c => c.plan === proposal.plan);
  if (!cand) {                                  // slug no longer stale (already cleaned / moved)
    _appendLog(root, { plan:proposal.plan, action:'noop', reason:'not-currently-stale', at:ISO });
    return { plan:proposal.plan, action:'noop', skipped:true };   ← FAIL CLOSED: no fs op, no throw
  }
  const stage    = cand.stage;                  // CURRENT on-disk stage — authoritative
  const planPath = path.join(root, 'plans', stage, proposal.plan + '.md');
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  effective = proposal.action || proposal.proposedAction
  switch (effective):
    'archive-to-done'            → archivePlan(planPath, root)
    'advance-via-reconciliation' → reconcilePlan(planPath, root)
    'revert'                     → revertPlan(planPath, root, deps)            ← passes deps.movePlan
    'delete'  → if (proposal.explicitlyRejected !== true) throw Error('delete blocked: not explicitlyRejected')
                else deletePlan(planPath, { explicitlyRejected:true })
    default / null               → return { plan, action:'none', skipped:true } (no fs op)
  NOTE: deps.approvePlan is accepted by the documented seam contract (D2) and is NEVER referenced in
  any branch above — gate-safety is structural (no import + no call site). SP5 asserts 0 calls.
  Why re-derivation is total: every proposal originates from listStaleCandidates(root), so its slug IS a
  member of that scan at render time; re-running the scan at exec time finds it again UNLESS the plan was
  already cleaned — the one case the fail-closed no-op exists for (idempotency). stage is NEVER read from
  the action string or a render-time snapshot (that was the F1/F2 'plans/undefined/<slug>.md' bug).
```

> `deletePlan` takes only `planPath` per its core In-Scope contract; `root` for its log entry is derived from `planPath` (`path.resolve(planPath, '..','..','..')` = project root, since plans live at `<root>/plans/<stage>/<slug>.md`). If that derivation is undesirable, the dispatcher passes `root` to a thin internal `_deleteAndLog(planPath, root)` while `deletePlan(planPath, opts)` remains the guarded public primitive. Implementer chooses; both keep the guard and the `unlink-only-when-explicitlyRejected` invariant.

#### Error handling

- Missing/unreadable plan file → throw a descriptive `Error` including the path (do not silently no-op a move).
- Unknown/absent revert stage → throw (never guess a destination).
- `delete` without `explicitlyRejected === true` → throw at BOTH the dispatcher and the primitive (D4).
- Log write failure → caught + swallowed (best-effort), never aborts a completed move.

#### Cross-platform

- All paths via `path.join` / `path.basename`; no string concatenation, no hardcoded separators.
- `done/` and the log directory created with `fs.mkdirSync(..., { recursive: true })`.
- No subprocess, no shell — nothing to inject.

#### `module.exports`

```js
module.exports = { archivePlan, reconcilePlan, revertPlan, deletePlan, executeCleanup, REVERT_MAP };
```

### 6.2 File: `src/lib/menu-screens.js`

**Action:** MODIFY
**Purpose:** Add the human-gated cleanup review surface as new screen functions plus a `route()` subtree, and extend SP3's `inboxVerifyProposals` with a `'Clean up ▸'` entry. All navigation is by label; NO digit maps to any cleanup action. Render functions stay pure — they emit action strings and never mutate the filesystem (M4/D5).

> No new `require` is added. `menu-screens.js` does NOT import `stale-cleanup.js`: execution is reached only via `claude:cleanup-exec …` action strings (D5). `staleDetector` (namespace), `inbox.listStaleCandidates`, `stripCtl`, and `getProjectPath` already exist and are reused.

#### Shared helper (new, module-scope)

```
_buildCleanupItems(root) → { items, candidates }
  - candidates = listStaleCandidates(root)            (cheap scan; carries .stage)
  - slugHistoryCache = {}; toVerify = candidates.slice(0, MAX_ROWS=20)   (fan-out cap, mirrors SP3)
  - for each cand: try { ev = staleDetector.verifyStaleCandidate(cand, root, {slugHistoryCache});
                          p  = staleDetector.classifyStaleCandidate(cand, ev);
                          push { plan:p.plan, stage:cand.stage, category:p.category,
                                 proposedAction:p.proposedAction, evidence:p.evidence,
                                 explicitlyRejected: ev.explicitlyRejected === true } }
                   catch { push inconclusive degraded row (no stage-dependent action) }
  - ACTIONABLE categories = shipped-but-early | approved-but-stranded | dead-on-arrival
  - Pure read (verify spawns git but writes nothing). Reused by every cleanup screen (D8 re-derivation).
  - NOTE: `item.stage` is for DISPLAY/ordering and category grouping only. It is NEVER serialized into a
    `claude:cleanup-exec` string — the exec strings carry only the slug + action; `executeCleanup`
    re-derives stage from its OWN `listStaleCandidates(root)` call at exec time (D1/D8). This deliberate
    decoupling is the F1/F2 fix: no stage value ever crosses the menu→executor boundary.
```

#### Category → action/verb table (single source of truth in this file)

```
shipped-but-early      → action 'archive-to-done'            verb 'archive'   → done/
approved-but-stranded  → action 'advance-via-reconciliation' verb 'reconcile' → done/
dead-on-arrival        → action 'revert' (default)           verb 'revert'    → prior stage
  (delete is NOT a category default; per-plan override only, gated on explicitlyRejected)
```

#### New screen functions (each returns `{ text, ask, actions }`)

```
inboxVerifyProposals  (MODIFY — additive)
  - After building proposals, compute hasActionable = any proposal.category ∈ ACTIONABLE.
  - When hasActionable: PREPEND option { label:'Clean up ▸', description:'Review & execute cleanup' }
    and set actions['Clean up ▸'] = 'inbox cleanup'. Keep '◀ Back' → 'inbox stale'.
  - When only inconclusive (or empty): unchanged (no Clean-up option).
  - SP3 tests still pass: '◀ Back' → 'inbox stale' preserved; no digit key added.

inboxCleanupReview(projectPath)          route: inbox cleanup
  - text: list every actionable item grouped by category (ORDER = shipped-but-early,
    approved-but-stranded, dead-on-arrival), each row:  • <plan> → <verb>  (<evidence; stripCtl>)
    20-row cap + "… and N more" (mirrors inboxVerifyProposals). EVERY plan-derived field via stripCtl.
  - options (≤4, labels only, NO digit):
      'Approve a category ▸'  → 'inbox cleanup category'
      'Review individually ▸' → 'inbox cleanup plan'        (list-pick screen; see below)
      '◀ Back'                → 'inbox verify'
  - Empty actionable set → only '◀ Back' → 'inbox verify'. NO execution here (render only).

inboxCleanupCategoryPick(projectPath)    route: inbox cleanup category
  - One option PER actionable category PRESENT, ≤4 incl. '◀ Back'. Label e.g.
    'Shipped-but-early (N) ▸'; action → 'inbox cleanup confirm shipped-but-early'.
  - '◀ Back' → 'inbox cleanup'. Labels only; NO digit. NO execution.

inboxCleanupCategoryConfirm(category, projectPath)   route: inbox cleanup confirm <category>
  - Re-derive items via _buildCleanupItems(root); group = items of <category>; N = group.length.
  - text shows the count + category + the plan names that WILL be acted on (stripCtl), so the
    human sees the batch before confirming (Business-risk mitigation).
  - options:
      'Confirm: <verb> N <category> plans'  → 'claude:cleanup-exec category <category>'   ← EXECUTION
      '◀ Back'                              → 'inbox cleanup category'
  - The CONFIRM label is the ONLY place a batch executes, and only on explicit selection (M1/M4).
    Rendering this screen performs NO fs op. NO digit key.

Batch exec enumeration (how 'claude:cleanup-exec category <category>' resolves to per-plan moves):
  - The category exec string carries ONLY <category> — NO slugs, NO stages (same decoupling as the
    per-plan string, D1). When the executor (Claude) acts on it, it RE-DERIVES the member set from scratch:
      1. items = _buildCleanupItems(root).items            (fresh scan+verify+classify — D8)
      2. members = items.filter(i => i.category === <category> && <category> is ACTIONABLE)
      3. for each m in members:
           executeCleanup({ plan: m.plan, proposedAction: <category→action> }, root)
         — the per-member proposal carries NO stage; executeCleanup re-derives EACH member's CURRENT
           stage via its own listStaleCandidates(root) call (D1). Members already cleaned between render
           and exec are absent from the scan ⇒ that member fail-closes to a no-op (idempotent, no throw).
  - <category→action> uses the single-source category table above (shipped-but-early→archive-to-done,
    approved-but-stranded→advance-via-reconciliation, dead-on-arrival→revert). 'delete' is NEVER a batch
    action — deletion is reachable only via the per-plan override path gated on explicitlyRejected (M6).

inboxCleanupPlanReview(slug, projectPath)   route: inbox cleanup plan <slug>
  - If <slug> absent (the 'Review individually ▸' landing with no slug): render a label-only
    PICK list of actionable plans, each → 'inbox cleanup plan <thatSlug>' (labels only; ≤ list cap;
    '◀ Back' → 'inbox cleanup'). [List-pick mode keeps navigation digit-free.]
  - If <slug> present: re-derive that single item; show plan, category, proposed verb, evidence.
    options:
      'Approve'     → 'claude:cleanup-exec plan <slug> <proposedAction>'    ← EXECUTION (per-plan)
      'Override ▸'  → 'inbox cleanup override <slug>'
      'Skip'        → 'inbox cleanup'   (no state change; plan re-surfaces next scan — M7)
      '◀ Back'      → 'inbox cleanup'
  - Labels only; NO digit. Rendering performs NO fs op.

inboxCleanupPlanOverride(slug, projectPath)   route: inbox cleanup override <slug>
  - Re-derive the item; list the ALLOWED alternative actions for that plan's category:
      shipped-but-early / approved-but-stranded → { 'Revert instead' → cleanup-exec plan <slug> revert }
      dead-on-arrival   → { 'Archive to done instead' → … archive-to-done } and, IFF
                          item.explicitlyRejected === true, { 'Delete permanently' →
                          'claude:cleanup-exec plan <slug> delete' }   (else NO delete option — M6)
  - Always include '◀ Back' → 'inbox cleanup plan <slug>'. ≤4 options; labels only; NO digit.
  - The 'Delete permanently' label, when offered, is the SECOND confirmation surface; selecting it is
    the explicit human override.
  - explicitlyRejected threading (D1): the 'Delete permanently' string is the ONLY exec string that
    implies deletion, and it is emitted ONLY on this screen, ONLY when item.explicitlyRejected === true.
    The executor therefore maps the `delete` action (uniquely produced by this override path) to a
    proposal carrying `explicitlyRejected: true`. EVERY other exec string stays `{slug, action}` and
    yields a proposal WITHOUT explicitlyRejected (falsy) — so `delete` requested through any non-override
    path is refused by executeCleanup's guard. Three fail-closed layers: (1) the screen hides delete
    unless explicitlyRejected; (2) the executor sets the flag only for this path; (3) executeCleanup AND
    deletePlan both throw unless explicitlyRejected===true (D4) — belt, suspenders, and a second belt.
```

#### `route()` extension (inside the existing `case 'inbox':`)

```js
case 'inbox':
  if (args[1] === 'verify') return inboxVerifyProposals(projectPath);
  if (args[1] === 'stale')  return inboxStalePlansDrillIn(projectPath);
  if (args[1] === 'cleanup') {
    if (args[2] === 'category') return inboxCleanupCategoryPick(projectPath);
    if (args[2] === 'confirm')  return inboxCleanupCategoryConfirm(args[3], projectPath);   // <category>
    if (args[2] === 'plan')     return inboxCleanupPlanReview(args[3], projectPath);        // <slug>|undefined
    if (args[2] === 'override') return inboxCleanupPlanOverride(args[3], projectPath);       // <slug>
    return inboxCleanupReview(projectPath);                                                  // bare 'inbox cleanup'
  }
  return dashboardPipeline(projectPath); // unknown inbox subcommand → safe default
```

- `<category>` / `<slug>` are validated: category must be one of the three actionable strings (else → `inboxCleanupReview`); slug is sanitized with the existing `isUnsafePlanFile`-style guard before any path use (no separators, no `..`, no NUL) — `executeCleanup` re-joins under `root/plans/<stage>/`, so a hostile slug cannot traverse.
- The `claude:cleanup-exec …` strings are the ONLY execution triggers; bare `inbox cleanup …` strings are navigation. This keeps `route()` side-effect-free.

#### `module.exports` additions

Add the 5 new screen functions to the existing export object (for unit testing): `inboxCleanupReview`, `inboxCleanupCategoryPick`, `inboxCleanupCategoryConfirm`, `inboxCleanupPlanReview`, `inboxCleanupPlanOverride`.

### 6.3 File: `tests/stale-cleanup-human-gate.test.js`

**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`), `assert/strict`. Mirrors the SP3 sandbox harness (`tests/stale-classifier.test.js`): `os.tmpdir()` sandboxes created per test, torn down in `afterEach` via `fs.rmSync(..., {recursive,force})`.

#### Harness

```
makeSandbox()            → unique dir under os.tmpdir(); tracked for teardown.
writePlan(sb, stage, slug, { files, approved, gateCrossed })
                         → plans/<stage>/<slug>.md with a (possibly two-block) frontmatter.
spyFs()                  → wraps fs.writeFileSync / fs.renameSync / fs.unlinkSync / fs.rmSync,
                           recording an ordered `calls` array of { op, path, content? }; returns
                           { calls, restore }. BROADENED beyond SP3 (which spied write+rename) to
                           also watch unlink+rm for the no-side-effects / no-delete assertions.
makeSpy()                → tiny call-recording fn { fn, calls } (or node:test mock.fn) for deps.
parseCleanupExec(str)    → mirrors EXACTLY how the executor maps a 'claude:cleanup-exec …' action string
                           to an executeCleanup proposal (the production contract under test):
                             'claude:cleanup-exec plan <slug> <action>'
                                → { plan:<slug>, proposedAction:<action> }            (NO stage)
                             'claude:cleanup-exec plan <slug> delete'  (override path only)
                                → { plan:<slug>, proposedAction:'delete', explicitlyRejected:true }
                             'claude:cleanup-exec category <category>'
                                → { kind:'category', category:<category> }
                           Tokenized on single spaces. This is the SAME mapping Claude applies, so the
                           F3 tests assert the END-TO-END string→proposal→executeCleanup path and cannot
                           pass by hand-injecting stage.
```

#### Test cases (→ acceptance criteria)

```
T1 (M2 + re-derivation) shipped-but-early approve via executeCleanup → re-derives stage, stamp-before-move, no approvePlan
  setup: writePlan(sb,'functional','foo',{files:['src/missing-x.js']});  (declared file ABSENT so the
         cheap scan lists foo as a candidate at stage 'functional' — the scan, not the proposal, supplies stage)
  spy = spyFs(); approveSpy = makeSpy(); moveSpy = makeSpy();
  proposal = { plan:'foo', proposedAction:'archive-to-done' };   ← NO stage field (re-derivation MUST fill it)
  executeCleanup(proposal, sb, { approvePlan:approveSpy.fn, movePlan:moveSpy.fn });
  asserts:
    • a writeFileSync to plans/functional/foo.md occurred (PROVES stage re-derived to 'functional', not
      'undefined') whose content includes 'approved_by: human' AND 'stale-reconciliation'   (marker stamped)
    • that writeFileSync index < the renameSync index    (WRITE-BEFORE-RENAME — M5 ordering)
    • renameSync target = plans/done/foo.md
    • final file plans/done/foo.md exists; its content matches /^---[\s\S]*approved_by:\s*human/
      AND contains 'gate_crossed: stale-reconciliation'
    • approveSpy.calls.length === 0   (M2: approvePlan NOT called)
  This case FAILS if executeCleanup assumes proposal.stage: with no stage it would target
  plans/undefined/foo.md → ENOENT/no-op → the done/foo.md assertion fails. (Directly pins F1/F2.)

T2 (M3 + re-derivation) approved-but-stranded approve → reconciliation, re-derives stage, no approvePlan, no actions.movePlan
  setup: writePlan(sb,'review','bar',{files:['src/missing-y.js'], approved:true});  (declared file ABSENT
         so the cheap scan lists bar at stage 'review'; stage comes from the scan, not the proposal)
  approveSpy = makeSpy(); moveSpy = makeSpy(); spy = spyFs();
  proposal = { plan:'bar', proposedAction:'advance-via-reconciliation' };   ← NO stage field
  executeCleanup(proposal, sb, { approvePlan:approveSpy.fn, movePlan:moveSpy.fn });
  asserts:
    • plans/done/bar.md exists (PROVES stage re-derived to 'review'); content contains
      'gate_crossed: stale-reconciliation' + 'approved_by: human'
    • approveSpy.calls.length === 0   AND   moveSpy.calls.length === 0   (M3: neither called)
    • a writeFileSync-before-renameSync pair targeted plans/review/bar.md (reconciliation path, self-contained)

T3 (M5) marker-before-rename ordering (explicit sequence)
  Reuses the spyFs `calls` array from a shipped-but-early run; asserts
  calls.findIndex(write to source w/ marker) < calls.findIndex(rename source→done). Stand-alone case
  so the ordering invariant is named and cannot silently regress.

T4 (M4) NO action executes on render (menu purity)
  spy = spyFs();
  for route of [['inbox','cleanup'], ['inbox','cleanup','category'],
                ['inbox','cleanup','confirm','shipped-but-early'],
                ['inbox','cleanup','plan'], ['inbox','cleanup','plan','foo'],
                ['inbox','cleanup','override','foo']]:
      menuScreens.route(route, sb);
  assert: spy.calls.filter(c => c.op==='writeFileSync'||'renameSync'||'unlinkSync'||'rmSync') to
          plan files === 0   (rendering never mutates — only git reads allowed).
  (Verification git reads are permitted; only fs mutations are asserted absent.)

T5 (M6 + re-derivation) dead-on-arrival DEFAULT is revert; re-derives stage; NO unlink/rm
  setup: writePlan(sb,'implementation','baz',{files:['src/gone.js']}) (declared file absent → cheap scan
         lists baz at stage 'implementation');
  proposal = { plan:'baz', proposedAction:'revert' };   ← NO stage field (re-derivation supplies 'implementation')
  spy = spyFs(); moveSpy = makeSpy();
  executeCleanup(proposal, sb, { movePlan: moveSpy.fn });
  asserts:
    • moveSpy.calls.length === 1 and called with (plans/implementation/baz.md, 'functional', sb)
      (PROVES stage re-derived to 'implementation'; REVERT_MAP: implementation→functional)
    • spy.calls has NO unlinkSync and NO rmSync   (M6: revert never deletes)

T6 (M6) delete ONLY when explicitlyRejected===true
  setup (both cases): writePlan(sb,'implementation','del',{files:['src/gone.js']}) so the cheap scan lists
         'del' at stage 'implementation' — re-derivation succeeds, so the delete GUARD (not the slug-absent
         no-op) is what's exercised.
  (a) proposal { plan:'del', proposedAction:'delete' } (explicitlyRejected absent/false)
      → executeCleanup THROWS ('delete blocked: not explicitlyRejected'); file still on disk;
        spyFs records NO unlinkSync.   (assert.throws)
  (b) proposal { plan:'del', proposedAction:'delete', explicitlyRejected:true }
      → file removed; spyFs records exactly one unlinkSync on plans/implementation/del.md;
        log reason 'stale-delete' present in stale-cleanup.json.
  Also (primitive guard, D4): deletePlan(planPath) with no opts / { explicitlyRejected:false } THROWS
  directly — independent of the dispatcher (belt-and-suspenders). (assert.throws)

T7 (M8) executeCleanup deps injection is honored (all three seams: listStaleCandidates, movePlan, approvePlan)
  • listStaleCandidates seam: injScan = () => [{ plan:'inj', stage:'implementation' }];
    executeCleanup({ plan:'inj', proposedAction:'revert' }, sb, { listStaleCandidates: injScan, movePlan: moveSpy.fn })
    → moveSpy called once with (path.join(sb,'plans','implementation','inj.md'), 'functional', sb)
      — PROVES stage was re-derived from the INJECTED scan (no file on disk needed; the mover is a spy).
  • revert proposal (seeded on disk) + { movePlan: moveSpy.fn } → moveSpy IS used (calls.length===1)  (seam live)
  • archive proposal (seeded) + { movePlan: moveSpy.fn, approvePlan: approveSpy.fn } → both spies 0 calls
    (archive bypasses the move seam; approvePlan never referenced — structural gate-safety)

T8 (M1/menu reachability) Clean up ▸ → inbox cleanup → … → claude:cleanup-exec; NO digit anywhere
  • Build a sandbox whose verify yields ≥1 actionable proposal (declare a missing file so the cheap
    scan flags it; the per-row verify degrades to inconclusive WITHOUT git, so for a deterministic
    actionable proposal either (i) stub staleDetector.classifyStaleCandidate via the namespace spy
    seam to return a known category, OR (ii) assert reachability at the screen level by calling the
    screen fns directly with a stubbed _buildCleanupItems). Chosen: namespace-spy classify (matches
    SP3's documented spy seam on staleDetector).
  • assert inboxVerifyProposals(sb).actions['Clean up ▸'] === 'inbox cleanup'
  • s1 = route(['inbox','cleanup'], sb):
        actions['Approve a category ▸'] === 'inbox cleanup category'
        actions['Review individually ▸'] === 'inbox cleanup plan'
        actions['◀ Back'] === 'inbox verify'
  • s2 = route(['inbox','cleanup','category'], sb): some label → 'inbox cleanup confirm shipped-but-early'
  • s3 = route(['inbox','cleanup','confirm','shipped-but-early'], sb):
        a 'Confirm: …' label maps to a value starting 'claude:cleanup-exec category '
  • s4 = route(['inbox','cleanup','plan','foo'], sb):
        actions['Approve'] startsWith 'claude:cleanup-exec plan foo'
        actions['Override ▸'] === 'inbox cleanup override foo'
        actions['Skip'] and actions['◀ Back'] are nav (no claude:cleanup-exec)
  • DIGIT-FREE: for every screen sN, assert Object.keys(sN.actions).every(k => !/^\d+$/.test(k))
    AND every option label is non-numeric  (menu discipline; M1)

T9 (M7 / M6 override) override surfaces delete ONLY when explicitlyRejected
  • DOA item with explicitlyRejected:false → route(['inbox','cleanup','override','baz']).actions has
    NO 'Delete permanently' label (only 'Archive to done instead' + '◀ Back').
  • DOA item with explicitlyRejected:true → 'Delete permanently' present, mapping to
    'claude:cleanup-exec plan baz delete'.
  • shipped-but-early override offers 'Revert instead' → 'claude:cleanup-exec plan <slug> revert'.

T10 (idempotency / fail-closed) second executeCleanup on an already-moved plan
  • after an archive run, foo is in done/ and ABSENT from listStaleCandidates(sb) (done/ is not scanned).
    Re-running executeCleanup({plan:'foo', proposedAction:'archive-to-done'}, sb) → re-derivation finds
    NO candidate → FAIL-CLOSED no-op: returns { plan:'foo', action:'noop', skipped:true }, does NOT throw,
    and spyFs records NO second writeFileSync/renameSync/unlinkSync/rmSync. stale-cleanup.json holds the
    single original archive entry (plus optionally one 'noop' entry) — the move is not double-counted.
  (Changed from the prior 'THROWS on missing file' design: with exec-time stage re-derivation an
   already-cleaned slug is simply absent from the scan, so the idempotent path is a no-op, not an error.)

T11 (F3 — production exec-path: string carries NO stage, executeCleanup re-derives it)
  Drives the REAL trigger string end-to-end (not a hand-built proposal):
  (a) archive: writePlan(sb,'functional','foo',{files:['src/missing.js']});
      p = parseCleanupExec('claude:cleanup-exec plan foo archive-to-done');  → { plan:'foo', proposedAction:'archive-to-done' }
      assert: p.stage === undefined   (the string carries no stage — contract pinned)
      executeCleanup(p, sb);
      assert: plans/done/foo.md exists with 'approved_by: human' + 'gate_crossed: stale-reconciliation';
              plans/functional/foo.md gone   (stage re-derived to 'functional' from the live scan)
  (b) revert: writePlan(sb,'implementation','baz',{files:['src/gone.js']}); moveSpy = makeSpy();
      p = parseCleanupExec('claude:cleanup-exec plan baz revert');           → { plan:'baz', proposedAction:'revert' }
      executeCleanup(p, sb, { movePlan: moveSpy.fn });
      assert: moveSpy called once with (plans/implementation/baz.md, 'functional', sb)  (impl→functional, re-derived)
  Both sub-cases FAIL if stage is assumed instead of re-derived (no stage in p ⇒ plans/undefined/<slug>.md).

T12 (F3 — negative: slug not in the current scan → fail-closed no-op, no throw, no fs mutation)
  spy = spyFs();
  p = parseCleanupExec('claude:cleanup-exec plan ghost archive-to-done');    (ghost is NOT seeded on disk)
  const r = executeCleanup(p, sb);                                           (does NOT throw)
  asserts:
    • r.skipped === true && r.action === 'noop'
    • spy.calls has ZERO writeFileSync / renameSync / unlinkSync / rmSync to any plan file
    • no plan file created/moved/removed anywhere under plans/
  Pins the idempotent / already-cleaned path: a stale exec request for a plan that is no longer stale
  is a safe no-op, never a crash and never a spurious mutation.
```

#### Spy seam notes

- `staleDetector` is imported as a NAMESPACE in `menu-screens.js` (line 25), so a test rewires
  `staleDetector.classifyStaleCandidate` / `verifyStaleCandidate` to drive deterministic categories
  WITHOUT real git — the documented SP3 seam. Restore in `afterEach`.
- `executeCleanup` deps injection (`{ approvePlan, movePlan, listStaleCandidates }`) is the SP5 seam and is
  the ONLY mechanism these tests use to assert non-calls / drive deterministic stage re-derivation — no
  `require.cache` surgery on `actions.js` or `inbox.js`.
- For the production-path tests (T11/T12) stage re-derivation runs against the REAL on-disk scan
  (`listStaleCandidates` over a seeded sandbox), proving the string→executeCleanup contract WITHOUT
  injecting stage. `parseCleanupExec` is the canonical string→proposal mapping the executor applies.
- All assertions FAIL LOUD: each has ≥1 meaningful assert; no empty catch; error paths (T6a, primitive
  guard) assert a throw via `assert.throws`; the idempotent path (T10, T12) asserts a no-op result +
  zero fs mutations (NOT a throw).

### 6.4 Acceptance-criteria mapping (M1–M8 → implementation element → test)

| AC | Implementation element | Test |
|---|---|---|
| **M1** grouped review surface; 3-option entry; category-pick → confirm; per-plan Approve/Override/Skip/Back; no digit any screen | `inboxCleanupReview`, `inboxCleanupCategoryPick`, `inboxCleanupCategoryConfirm`, `inboxCleanupPlanReview`, `inboxCleanupPlanOverride` + `route()` subtree (§6.2) | T8 (reachability + digit-free), T4 (render purity) |
| **M2** shipped-but-early → stamp-before-move to `done/`; `approved_by:human` + `gate_crossed` contains `stale-reconciliation`; `approvePlan` NOT called | `archivePlan` (self-contained `_stampAndArchive`); `approvePlan` not imported (§6.1, D2); `executeCleanup` re-derives stage (§6.1, D1) | T1, T3, T11 |
| **M3** approved-but-stranded → same reconciliation; `approvePlan` AND `actions.movePlan` NOT called | `reconcilePlan` (self-contained; no `movePlan`); `executeCleanup` re-derives stage (§6.1, D1) | T2, T7 |
| **M4** nothing executes without explicit approve (render ≠ execute) | Pure render fns emit `claude:cleanup-exec` strings only (D5) | T4 |
| **M5** marker stamped BEFORE `fs.renameSync` (gate-hook window) | `archivePlan`/`reconcilePlan` write-then-rename order (§6.1 steps 3→4) | T1 (index ordering), T3 (named) |
| **M6** DOA default `revert`; `delete` requires `explicitlyRejected===true` + explicit override; never auto-delete | `executeCleanup` switch default = proposedAction `revert`; dispatcher + `deletePlan` double guard (D4); override screen hides delete unless `explicitlyRejected` | T5, T6, T9 |
| **M7** override picks an alternative action or skips (plan re-surfaces) | `inboxCleanupPlanOverride` allowed-action set; `Skip` → `inbox cleanup` (no state change) | T9 |
| **M8** `executeCleanup(proposal, root, deps={})` honors injectable `{approvePlan, movePlan, listStaleCandidates}` | `deps.movePlan ?? movePlan` (revert); `deps.listStaleCandidates ?? listStaleCandidates` (stage re-derivation); `approvePlan` contract-only/never called (D2) | T7 |

Every AC maps to ≥1 implementation element AND ≥1 test. No orphan AC. The Gate-2 KICKBACK findings are
covered explicitly: F1/F2 (stage not threaded → `plans/undefined/<slug>.md`) by exec-time re-derivation
(§6.1 executeCleanup, D1/D8) pinned by T1/T2/T5/T11; F3 (no end-to-end exec-path coverage) by the
production-path tests T11 (positive, string→re-derive→move) and T12 (negative, absent slug → fail-closed no-op).

### 6.5 Security & gate-safety note

This is the highest-risk slice in the chain — it stamps gate markers, moves plan files between gate stages, and can delete. The invariants below are load-bearing and each is pinned by a test:

1. **No auto-cross.** Execution fires ONLY on an explicit human `Confirm`/`Approve` selection routed through a `claude:cleanup-exec …` action. Render functions are pure (no fs mutation) — M4/T4. There is no timer, no render-time execution, no "approve all" blanket path.
2. **Reconciliation ≠ `approvePlan`.** `stale-cleanup.js` imports `movePlan` from `actions.js` and `listStaleCandidates` from `inbox.js` — but NOT `approvePlan` (D2). `inbox.js` exports no `approvePlan`, so neither import puts `approvePlan` in reach → the module is structurally incapable of firing the deployment pipeline or logging a live Gate-3 crossing. M2/M3/T1/T2/T7.
3. **Stamp-before-rename.** Markers are written to the source file BEFORE `fs.renameSync`, closing the gate-hook auto-revert window. Identical ordering to `actions.approvePlan` (lines 97–107). M5/T1/T3.
4. **`hooks/` and `actions.js` untouched.** SP4 modifies only the three `files:` targets. The moved file satisfies the *unmodified* `human-gate-check.hasApprovalMarker` because the prepended block (first `---…---`) carries `approved_by: human` (D6).
5. **No delete without `explicitlyRejected`.** Deletion is refused by construction at two layers (dispatcher guard + `deletePlan` primitive guard, D4); the override screen does not even render a delete affordance unless `explicitlyRejected === true`. M6/T6/T9. Revert (the DOA default) performs no `unlink`/`rm` — T5.
6. **Input hardening.** Cleanup screens pass every plan-derived field through `stripCtl` before rendering (ANSI/control-char injection from a hostile filename or commit subject — the latter already sanitized at capture by SP3). Route `<slug>`/`<category>` are validated; `executeCleanup` re-joins paths under `root/plans/<stage>/` via `path.join`, so a slug cannot traverse out of the plans tree. No subprocess/shell is spawned in `stale-cleanup.js` — nothing to inject.
7. **Best-effort logging, never data-losing.** A `stale-cleanup.json` write failure is swallowed and never aborts a move that already happened; the move itself (rename/unlink) is the source of truth, the log is advisory.
8. **Stage re-derived at exec, fail-closed on absence.** `executeCleanup` never trusts a stage from the `claude:` action string or a render-time snapshot — it re-derives the CURRENT stage from `listStaleCandidates(root)` at exec time (D1/D8). This is the only way the move path is correct under render→exec drift, and the fix for the F1/F2 `plans/undefined/<slug>.md` bug that no-op'd the feature at its only human entry point. A slug absent from the live scan (already cleaned) yields a no-op — never a wrong-path move, never a throw. Adding `require('./inbox')` introduces no require cycle (inbox → {cache, stale-detector}; neither re-enters stale-cleanup; actions never imports inbox) and no new gate-safety surface (inbox exports no `approvePlan`). M-coverage: T1/T2/T5/T7/T11/T12.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (tests/stale-cleanup-human-gate.test.js — T1–T13, 23 cases)
- [x] Test error conditions (T6 delete guard, T12 absent slug, T13 archive-missing/revert-no-prior/unknown-action)
- [x] Run tests - expect RED (failing) — confirmed MODULE_NOT_FOUND before implementation

### Step 9: PREPARE
- [x] Install dependencies if needed (none — node:test + existing deps)
- [x] Check prerequisites (movePlan, listStaleCandidates, staleDetector verify/classify all present)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (done/ + .ctoc/logs created at runtime via mkdir recursive)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (src/lib/stale-cleanup.js + menu-screens.js screens/route/exports)
- [x] Add error handling (throw on missing plan / no prior stage / delete-without-flag; best-effort log swallow)
- [x] Wire up integration points (Clean up ▸ entry, route subtree, claude:cleanup-exec strings)

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together (T8 reachability end-to-end)
- [x] Check error handling completeness (T13)

### Step 12: OPTIMIZE
- [x] Remove redundant operations (shared _stampAndArchive; single-source CLEANUP_CATEGORY_TABLE)
- [x] Optimize critical paths (fan-out capped at CLEANUP_MAX_ROWS=20; cold-path only)
- [x] Simplify complex code (_cleanupScreen helper)

### Step 13: SECURE
- [x] Validate inputs (no path traversal — executeCleanup re-joins under root/plans/<stage>/ via path.join; route category validated)
- [x] Sanitize outputs (stripCtl on every plan-derived field in every cleanup screen)
- [x] No secrets in code
- [x] Safe file operations (stamp-before-rename; structural no-approvePlan; delete double-guard; no subprocess/shell)

### Step 14: VERIFY
- [x] Run lint + type check (tsc --checkJs at baseline 89; no new type errors)
- [x] Run ALL tests (TDD Green) — full suite 2546 pass / 0 fail
- [x] Check coverage >= 80% (stale-cleanup.js: 99.27% line / 90.63% branch / 100% funcs)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (README src/lib 107→108 + stale-cleanup in parenthetical; readme-numbers guards)
- [x] Add JSDoc comments to new functions (full JSDoc on stale-cleanup.js exports + helpers; cleanup screens documented)
- [x] Update CHANGELOG if needed (n/a — version bump on release)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review (left in todo/ per executor mandate — does NOT cross any gate)

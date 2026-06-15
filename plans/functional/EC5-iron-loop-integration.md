---
title: "EC5 — Iron Loop integration of compliance findings (early, advisory, gates intact)"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: eu-compliance-agents-gdpr-ai-act
program: ctoc-eu-compliance
order: 5
depends_on:
  - EC1-compliance-mode-setting
  - EC2-gdpr-agent-plan-and-code
  - EC3-eu-ai-act-agent-plan-and-code
files:
  - src/lib/iron-loop.js
  - src/lib/inbox.js
  - src/lib/compliance-dedup.js
  - .ctoc/operations-registry.yaml
  - agents/coordinator/cto-chief.md
  - tests/compliance-iron-loop.test.js
status: refined
acceptance_criteria_count: 11
risk_level: HIGH
---

# EC5 — Iron Loop integration of compliance findings (early, advisory, gates intact)

## 1. ASSESS

### Business Context

EC2 and EC3 produce compliance findings. Without this slice, those findings exist but are not wired into the pipeline — they do not attach to a plan, they do not appear in the user's dashboard, and they have no defined dispatch point relative to the `todo` boundary. This is the wiring slice.

**Dispatch point.** Compliance agents are dispatched at the **functional→implementation transition** (the existing background-agent slot, between Gate 1 approval and the implementation plan being written). This is the correct insertion point: findings need to be present when the implementation planner writes the plan, not after. The `approvePlan()` function (which moves a plan from functional to implementation) triggers the background-agent dispatch. Gate 2 (`implementation→todo`) is the click that runs the Iron Loop AFTER the implementation plan exists — it is NOT the hook point for compliance findings.

**CTO Chief is the sole dispatcher.** Per CLAUDE.md: CTO Chief is the sole top-level dispatcher. This slice adds a compliance dispatch case to `agents/coordinator/cto-chief.md`. No sub-orchestrator dispatches EC2 or EC3 directly. `src/lib/iron-loop.js` does NOT call compliance agents — it communicates the trigger condition to CTO Chief, which then dispatches.

**Findings surface via `src/lib/inbox.js`.** Plan-stage compliance findings (which have no `target_file`/`target_line`) are Inbox attachments. The Inbox is already the mechanism for surfacing advisory background findings to the user. The refinement-loop letter (which requires code coordinates) is used for code-stage findings only (EC2/EC3 routing decision, documented in those slices).

**Multi-regime dedup.** When `mode = both`, two agents may emit findings for the same regulatory gap described differently (e.g., GDPR Art. 10 data governance ↔ EU AI Act Art. 10 data governance). The existing CTOC synthesizer (Tier-1) is oriented around `(file, line)` coordinates and has `max_subagents: 0` — it cannot dedup coordinate-less legal findings. EC5 owns a **minimal regulation-topic-keyed dedup** in `src/lib/compliance-dedup.js`. The dedup key is `(kind, regulation_ref_normalized)` — not `(file, line)`. This is the right level of dedup for plan-stage findings.

Four constraints are non-negotiable:
1. The four human gates (Gate 0–3) are untouched: no new gate added, no existing gate weakened or auto-crossed.
2. Compliance findings are advisory: they do not auto-revert or auto-advance a plan.
3. CTO Chief is the sole dispatcher: instruction added to `agents/coordinator/cto-chief.md`.
4. `active_profiles` empty leaves the pipeline byte-for-byte unchanged.

### Current State

`src/lib/iron-loop.js` contains `validateForTodo()`, `hasIronLoopSteps()`, and related step validation. The compliance dispatch trigger does not exist. The operations registry does not list the compliance agents. `agents/coordinator/cto-chief.md` has no compliance dispatch case. `src/lib/compliance-dedup.js` does not exist.

### Impact

Once this slice ships, every project with an active EU compliance profile automatically receives compliance findings attached to its plan before the implementation plan is written. The user sees them as Inbox items when reviewing the implementation plan before Gate 2.

---

## 2. ALIGN

### Business Goals

**Goal:** Compliance findings from EC2/EC3 attach to a plan before the implementation plan is written, gated by the regulatory-regime system, without adding any new human gate or touching the existing four.

**Job to Be Done:** When I am reviewing an implementation plan before approving it for `todo`, I want any GDPR or EU AI Act findings that the opted-in agent(s) produced to be visible and attached to the plan, so that I can treat them as requirements in my Gate 2 approval decision rather than discovering them after implementation starts.

**Impact Map:**
- **Goal:** Compliance findings are visible at the implementation stage, before `todo`, for every project that has opted in.
- **Actor:** CTO Chief orchestrating the pipeline; project owner who reviews the implementation plan at Gate 2.
- **Impact:** Legal obligations that would otherwise appear as code-review surprises are present when the user makes their Gate 2 decision — without any new gate being imposed on projects.
- **Deliverable:** Dispatch trigger in `iron-loop.js` → CTO Chief dispatch logic in `cto-chief.md` → Inbox attachment via `inbox.js` → regulation-topic dedup in `compliance-dedup.js`, gated by `shouldRunGdpr()` / `shouldRunEuAiAct()`, producing advisory findings pre-`todo`, with Gate 0–3 provably unchanged.

### Success Metrics

1. `gdpr` in `active_profiles` dispatches EC2 only; `eu-ai-act-high-risk` dispatches EC3 only; both dispatches both; neither dispatches neither.
2. Findings attach to the plan's Inbox surface before the implementation-to-`todo` boundary.
3. Gate count = 4 (provably unchanged); no gate is added, removed, or altered.
4. No compliance finding auto-reverts or auto-advances a plan.
5. Empty `active_profiles` is a provable no-op: pipeline execution identical to a project without any active profiles.
6. Mode=both findings are deduplicated by `compliance-dedup.js` on `(kind, regulation_ref_normalized)` key before Inbox attachment.

### Constraints

- **CTO Chief is the sole dispatcher.** Instruction added to `agents/coordinator/cto-chief.md`: "When a plan transitions from functional to implementation (after Gate 1 approval), CTO Chief evaluates `shouldRunGdpr(projectRoot)` and `shouldRunEuAiAct(projectRoot)` from `src/lib/compliance-regime.js`. If either returns `true`, CTO Chief dispatches the appropriate compliance agent(s). Library code (`iron-loop.js`) communicates the trigger condition but does not dispatch agents directly."
- **Dispatch point.** Functional→implementation transition (background-agent slot after Gate 1 approval). NOT the `approvePlan()` implementation→todo step. NOT `iron-loop.js` directly dispatching agents.
- **Advisory, not gate-mutating.** Findings are advisory: `severity: critical` means "this is a critical compliance gap"; it does not mean "auto-block Gate 2."
- **Regulation-topic dedup in EC5.** `src/lib/compliance-dedup.js` is EC5's responsibility. The synthesizer handles `(file, line)` dedup for code findings; EC5 handles `(kind, regulation_ref_normalized)` dedup for plan-stage findings.
- **`src/hooks/human-gate-check.js` is immutable.** This slice does not modify it.
- **Cross-platform.** `path.join`, `fs.promises`, no bash entry points.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTO Chief orchestrating the pipeline for a project with `gdpr` in `active_profiles`,
**I want** the GDPR agent dispatched at the functional→implementation transition,
**so that** GDPR findings are visible in the Inbox when the project owner reviews the implementation plan at Gate 2.

**As a** project owner reviewing an implementation plan at Gate 2,
**I want** any opted-in compliance findings to be present in the Inbox,
**so that** I can incorporate them into my Gate 2 approval decision rather than discovering them after implementation.

**As a** security maintainer running the test suite,
**I want** a test that asserts Gate 0–3 are unchanged and no compliance finding auto-reverts or auto-advances a plan,
**so that** I have a continuous, automated proof that safety is maintained.

**As a** CTO Chief with both profiles active,
**I want** overlapping GDPR + AI Act findings deduplicated by `compliance-dedup.js` on regulation-topic key,
**so that** the same gap is not raised twice in two different findings.

### BDD Scenarios

- [ ] **Scenario: gdpr active — EC2 dispatched, EC3 not dispatched**
  Given `gdpr` is in `active_profiles` and `eu-ai-act-high-risk` is not
  And a plan transitions from functional to implementation (Gate 1 approved)
  When CTO Chief evaluates the compliance dispatch instruction
  Then the GDPR agent (EC2) is dispatched by CTO Chief
  And the EU AI Act agent (EC3) is not dispatched
  And EC2's findings attach to the plan's Inbox surface
  And the dispatch event log shows `dispatcher: "cto-chief"` for the EC2 invocation

- [ ] **Scenario: eu-ai-act-high-risk active — EC3 dispatched, EC2 not dispatched**
  Given `eu-ai-act-high-risk` is in `active_profiles` and `gdpr` is not
  And a plan transitions from functional to implementation
  When CTO Chief evaluates the compliance dispatch instruction
  Then the EU AI Act agent (EC3) is dispatched by CTO Chief
  And the GDPR agent (EC2) is not dispatched
  And EC3's findings attach to the plan's Inbox surface

- [ ] **Scenario: Both profiles active — both agents dispatched, plan-stage findings deduplicated**
  Given both `gdpr` and `eu-ai-act-high-risk` are in `active_profiles`
  And a plan transitions from functional to implementation
  When CTO Chief dispatches both EC2 and EC3
  And their plan-stage findings are passed to `compliance-dedup.js`
  Then `deduplicateFindings(ec2Findings, ec3Findings)` returns a merged list where any finding with the same `(kind, regulation_ref_normalized)` key appears only once
  And the de-duplicated finding retains `severity: critical`
  And a unit test provides overlapping findings with the same `(kind, regulation_ref_normalized)` and asserts the dedup produces one finding

- [ ] **Scenario: Empty active_profiles — pipeline is a byte-for-byte no-op**
  Given `regulatory_regime.active_profiles: []`
  And a plan transitions from functional to implementation
  When CTO Chief evaluates the compliance dispatch instruction
  Then no compliance agent is dispatched
  And no file in the project is modified
  And the pipeline execution log for this plan is identical to a plan processed when `regulatory_regime` does not exist in settings (backward-compatible no-op)

- [ ] **Scenario: Findings attach at functional→implementation transition, not later**
  Given `gdpr` is in `active_profiles`
  And a plan has just crossed Gate 1 (functional→implementation)
  When compliance findings are attached
  Then findings are present in the plan's Inbox surface before Gate 2 is presented to the user
  And findings are not attached for the first time at `todo` or after

- [ ] **Scenario: Advisory findings do not auto-revert a plan**
  Given `gdpr` is in `active_profiles`
  And EC2 emits a finding with `severity: critical` and `kind: missing-consent-banner`
  When the finding is attached to the plan's Inbox
  Then the plan's stage is unchanged (it remains at `implementation`, not reverted to `functional`)
  And no gate transition is triggered automatically

- [ ] **Scenario: Advisory findings do not auto-advance a plan**
  Given `eu-ai-act-high-risk` is in `active_profiles`
  And EC3 emits zero findings (the plan has no AI system described)
  When the compliance dispatch step completes
  Then the plan does not automatically advance to `todo`
  And Gate 2 still requires the user's explicit `approved_by: human` marker

- [ ] **Scenario: Gate count invariant — exactly 4 gates, transitions unchanged**
  Given the compliance wiring is installed (this slice is live)
  When the gate-invariant test runs against `src/hooks/human-gate-check.js`
  Then the gate count is exactly 4 (Gate 0: vision→functional, Gate 1: functional→implementation, Gate 2: implementation→todo, Gate 3: review→done)
  And no gate transition is modified
  And `requireReviewGate` is unaffected by any compliance profile setting

- [ ] **Scenario: compliance-dedup.js deduplication key is (kind, regulation_ref_normalized)**
  Given an EC2 finding with `kind: "missing-data-governance"` and `regulation_ref: "GDPR Art. 5(1)(e)"` (data minimization)
  And an EC3 finding with `kind: "missing-data-governance"` and `regulation_ref: "EU-AI-Act Art. 10"` (data governance)
  When `deduplicateFindings([ec2Finding], [ec3Finding])` is called
  And both `regulation_ref` values normalize to the same topic key `"missing-data-governance"`
  Then the output contains one finding (the higher-confidence one, or EC2 if equal confidence)
  And the deduplicated finding references both regulation sources in its `message`

- [ ] **Scenario: CTO Chief is the sole dispatcher — iron-loop.js does not dispatch agents**
  Given `gdpr` is in `active_profiles`
  When `iron-loop.js` processes the functional→implementation transition
  Then `iron-loop.js` does not call any compliance agent directly
  And instead it emits a trigger condition that CTO Chief reads and acts on
  And the dispatch event log shows `dispatcher: "cto-chief"`, not `dispatcher: "iron-loop"`

- [ ] **Scenario: Findings carry severity: critical through the Inbox integration path**
  Given an EC2 or EC3 finding of any internal triage tier
  When the finding travels from the agent through `compliance-dedup.js` to `inbox.js` attachment
  Then the finding's `severity` field equals `"critical"` at the Inbox surface
  And no transformation in the dispatch path downgrades severity

---

## Scope

### In Scope

- `src/lib/iron-loop.js` — add a trigger condition at the functional→implementation transition boundary: reads `shouldRunGdpr(projectRoot)` and `shouldRunEuAiAct(projectRoot)` and writes the result to the plan's dispatch metadata for CTO Chief to read. Does NOT call compliance agents directly.
- `agents/coordinator/cto-chief.md` — add dispatch case: "At the functional→implementation transition, read the compliance trigger condition. If `shouldRunGdpr` is true, dispatch `gdpr-agent`. If `shouldRunEuAiAct` is true, dispatch `eu-ai-act-agent`. If both, dispatch both and pass findings to `compliance-dedup.js`. Log all dispatches with `dispatcher: "cto-chief"`."
- `src/lib/compliance-dedup.js` — new module exporting `deduplicateFindings(ec2Findings, ec3Findings)`: dedup key is `(kind, regulation_ref_normalized)` where `regulation_ref_normalized` strips article numbers to extract the topic (e.g., `"data-governance"` from `"EU-AI-Act Art. 10"` and `"GDPR Art. 5(1)(e)"`); when two findings share the same key, keep the higher-confidence one and merge both regulation_ref values into the finding message.
- `src/lib/inbox.js` — no new exports needed; EC5 calls existing `addFinding()` or equivalent with the plan-stage compliance findings.
- `.ctoc/operations-registry.yaml` — entries for `gdpr-agent` and `eu-ai-act-agent` as dispatchable agents.
- Unit and integration tests (`tests/compliance-iron-loop.test.js`): all 11 BDD scenarios, including gate-invariant assertion (mirrors `tests/environment-mode.test.js` guarantee), empty-profiles no-op diff, dispatcher-identity assertion, dedup unit test.

### Out of Scope

- Adding a fifth human gate for compliance — explicitly excluded.
- Making compliance findings blocking (auto-revert / auto-advance) — advisory-only.
- Modifying `src/hooks/human-gate-check.js` — immutable by design for this slice.
- Modifying Gate 0, Gate 1, or Gate 3 — this slice only adds the functional→implementation dispatch.
- Building a new Tier-1 synthesizer for compliance — EC5 owns its own minimal dedup in `compliance-dedup.js`; the existing synthesizer is `(file, line)`-oriented and is not extended.
- EC4 recommendation buckets — they are attached by EC4's layer on top of EC2/EC3 findings; EC5 does not produce or transform remedy options.

---

## Risks

### Technical Risks

- **Dispatch trigger timing:** The compliance dispatch must fire after Gate 1 approval and before the implementation plan is written. If it fires too early or too late, findings miss their window.
  - Likelihood: MEDIUM
  - Impact: HIGH (findings attached after Gate 2 presentation are invisible to the user's approval decision)
  - Mitigation: Add a targeted integration test that asserts findings are present in the Inbox at the exact point Gate 2 is presented; fail loudly if the sequence is wrong.

- **compliance-dedup.js topic normalization accuracy:** The topic key derivation from `regulation_ref` strings (stripping article numbers to get a topic) may incorrectly merge non-equivalent findings if two different topics produce the same normalized key.
  - Likelihood: MEDIUM (regulatory references are varied in format)
  - Impact: LOW (a merged finding that should have stayed separate is advisory noise; the user sees it and can split it)
  - Mitigation: Use a conservative normalization: only merge when `kind` is identical AND the topic extracted from `regulation_ref` is identical. When in doubt, keep both findings (false negative on dedup is safer than false positive merge of unrelated findings). Document the normalization table in `compliance-dedup.js` as a data structure, not regex-at-runtime.

### Business Risks

- **Users may ignore advisory findings:** If findings are advisory-only and never blocking, a project owner may acknowledge and dismiss them without remediating, shipping a non-compliant plan.
  - Likelihood: MEDIUM
  - Impact: HIGH (non-compliant launch under GDPR or EU AI Act has statutory liability)
  - Mitigation: Display critical findings with a prominent label in the Inbox; include the penalty citation (GDPR Regulation (EU) 2016/679: up to €20M / 4%; EU AI Act Regulation (EU) 2024/1689: up to €15M / 3% for high-risk, €35M / 7% for prohibited) in the finding message. The user's waiver in `## Decisions Taken Under Ambiguity` creates an explicit documented choice.

### Dependency Risks

- **EC1, EC2, EC3 must all ship first:**
  - Likelihood: HIGH (structural; this is the last wiring slice before EC6)
  - Impact: HIGH (without EC1/EC2/EC3, EC5 cannot dispatch anything)
  - Mitigation: EC5 tests stub EC1/EC2/EC3 for unit isolation; integration tests require all three. EC5 ships last in the EC1→EC5 sequence.

---

## Priority

**Priority: MEDIUM** (Score: 6/9)
- Dependency: MEDIUM (2) — depends on EC1/EC2/EC3; EC6 covers integration tests but EC5 has no dependents in the program.
- Business Impact: HIGH (3) — without this wiring, EC2/EC3 findings exist but are invisible to the user; the "compliance is context" principle is unrealized.
- Technical Risk: LOW (1) — the dispatch mechanism mirrors existing CTOC patterns; main risks are timing (covered by integration test) and topic normalization (conservative merge strategy documented in code).

---

## Decisions Taken Under Ambiguity

- **Dispatch point: functional→implementation transition, not implementation→todo.** The adversarial review confirmed that `approvePlan()` runs the Iron Loop AFTER the Gate-2 click — it is not the hook point for compliance findings. The correct point is the functional→implementation transition (after Gate 1 approval), which is when the implementation planner begins writing. Findings need to be present before the implementation plan is finalized so the planner can incorporate them.
- **CTO Chief dispatch instruction, not iron-loop.js dispatch.** The adversarial review confirmed that library code (`iron-loop.js`) must NOT dispatch agents. `iron-loop.js` writes a trigger condition; CTO Chief reads it and dispatches. This preserves the CLAUDE.md invariant that CTO Chief is the sole dispatcher.
- **EC5 owns minimal regulation-topic dedup, not the synthesizer.** The adversarial review confirmed that the existing synthesizer uses `(file, line)` coordinates and `max_subagents: 0` — it cannot dedup coordinate-less legal findings. EC5 owns `compliance-dedup.js` with a `(kind, regulation_ref_normalized)` dedup key. This is a minimal, purpose-built dedup that does not replicate the synthesizer's functionality.
- **Inbox, not refinement-loop letter, for plan-stage findings.** Plan-stage findings have no `target_file`/`target_line`. Routing them through the refinement-loop letter would require inventing fake coordinates. Inbox is the correct advisory surface for coordinate-less findings. The refinement-loop letter schema requires code coordinates; an Inbox attachment does not. This decision is consistent with EC2 and EC3.
- **Findings are advisory, never gate-mutating.** A critical compliance finding surfaces loudly in the Inbox and is recorded, but does not auto-revert or auto-advance a plan across any human gate. Resolution/waiver is documented in `## Decisions Taken Under Ambiguity`. The four human gates remain intact.
- **Removed "refinement-loop letter path" claim.** The adversarial review identified that the refinement-loop letter schema requires `(file, line)` code-evidence fields. Plan-stage findings do not have these. The plan-stage finding is an Inbox attachment, not a refinement-loop letter. Code-stage findings from EC2/EC3 (which do have `target_file`/`target_line`) continue to use the letter path — that is unchanged.

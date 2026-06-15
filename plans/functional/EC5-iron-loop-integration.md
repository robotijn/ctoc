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
  - .ctoc/operations-registry.yaml
  - agents/coordinator/cto-chief.md
  - tests/compliance-iron-loop.test.js
status: refined
acceptance_criteria_count: 10
risk_level: HIGH
---

# EC5 — Iron Loop integration of compliance findings (early, advisory, gates intact)

## 1. ASSESS

### Business Context

EC2 and EC3 produce compliance findings via the existing refinement-loop letter path. Without this slice, those findings exist but are not wired into the pipeline — they do not attach to a plan, they do not appear in the user's dashboard, and they have no defined dispatch point relative to the `todo` boundary. This is the wiring slice.

The vision's load-bearing principle is "compliance is context, not cleanup" — obligations belong in the plan, before `todo`. This slice answers *when* and *by whom* the agents are dispatched and *where* findings attach.

Four constraints are non-negotiable:
1. The four human gates (Gate 0–3) are untouched: no new gate added, no existing gate weakened or auto-crossed.
2. Compliance findings are advisory: they do not auto-revert or auto-advance a plan. The user resolves them or waives them in `## Decisions Taken Under Ambiguity`.
3. CTO Chief is the sole dispatcher: no sub-orchestrator dispatches a sibling without routing through CTO Chief.
4. `compliance.mode = none` leaves the pipeline byte-for-byte unchanged.

The vision's open fork (advisory Inbox findings vs. a dedicated compliance step vs. a soft gate before `todo`) is resolved by decision (locked): **advisory findings attached pre-`todo`**. This pushes compliance left without adding a fifth gate or touching the existing four.

### Current State

`src/lib/iron-loop.js` contains `validateForTodo()` (checks for Iron Loop steps marker), `hasIronLoopSteps()`, and related step validation. The dispatch mechanism for compliance agents does not exist. The operations registry (`.ctoc/operations-registry.yaml`) does not list the compliance agents yet.

`agents/coordinator/cto-chief.md` is the sole dispatcher. The compliance agents (EC2/EC3) are dispatched by CTO Chief when the pipeline reaches the implementation-to-`todo` boundary.

### Impact

Once this slice ships, every project with `compliance.mode != none` automatically receives compliance findings attached to its plan before the implementation-to-`todo` boundary. The user sees them as advisory findings when reviewing the implementation plan. Finding severity (`critical`) is preserved on the wire; the advisory-not-blocking character is the *pipeline treatment*, not the severity label.

---

## 2. ALIGN

### Business Goals

**Goal:** Compliance findings from EC2/EC3 attach to a plan before it reaches `todo`, gated by `compliance.mode`, without adding any new human gate or touching the existing four.

**Job to Be Done:** When I am reviewing an implementation plan before approving it for `todo`, I want any GDPR or EU AI Act findings that the opted-in agent(s) produced to be visible and attached to the plan, so that I can treat them as requirements in my Gate 2 approval decision rather than discovering them after implementation starts.

**Impact Map:**
- **Goal:** Compliance findings are visible at the implementation stage, before `todo`, for every project that has opted in.
- **Actor:** CTO Chief orchestrating the pipeline; project owner who reviews the implementation plan at Gate 2.
- **Impact:** Legal obligations that would otherwise appear as code-review surprises are present when the user makes their Gate 2 decision — without any new gate being imposed on projects.
- **Deliverable:** Dispatch wiring in `src/lib/iron-loop.js` + CTO Chief dispatch logic + operations registry entries, gated by `shouldRunGdpr()` / `shouldRunAiAct()`, producing advisory findings attached pre-`todo`, with Gate 0–3 provably unchanged.

### Success Metrics

1. `compliance.mode = gdpr` dispatches EC2 only; `eu-ai-act` dispatches EC3 only; `both` dispatches both; `none` dispatches neither and leaves the pipeline unchanged.
2. Findings attach to / are visible against the plan before the implementation-to-`todo` boundary.
3. Gate count = 4 (provably unchanged); no gate is added, removed, or altered.
4. No compliance finding auto-reverts or auto-advances a plan.
5. `compliance.mode = none` is a provable no-op: a test diff of pipeline execution with and without `none` mode is byte-for-byte identical for all gate transitions.
6. Multi-regime findings (when `mode = both`) are de-duplicated through the existing synthesizer, not double-raised.

### Stakeholders

- **CTO Chief** — owns the dispatch logic; is the sole dispatcher.
- **Project owner** — sees findings in the advisory Inbox before Gate 2 approval.
- **Security maintainer** — needs the gate-invariant test to pass at all times.
- **EC2 / EC3** — called by CTO Chief at the dispatch point; findings travel via the existing letter path.

### Constraints

- **CTO Chief is the sole dispatcher.** Per CLAUDE.md: "CTO Chief dispatches the compliance agents… EC5 wires the trigger + EC1 gating into the orchestration path, it does not let a sub-orchestrator dispatch siblings."
- **Dispatch point:** Implementation-to-`todo` boundary (just before Gate 2's destination). The agents run on the implementation plan before the user makes their Gate 2 decision.
- **Advisory, not gate-mutating.** Findings are advisory: `severity: critical` on the wire means "this is a critical compliance gap"; it does not mean "auto-block the Gate 2 transition." The user resolves or waives findings in `## Decisions Taken Under Ambiguity`.
- **Synthesizer for multi-regime.** When `mode = both`, overlapping findings (e.g. GDPR Art. 10 data governance ↔ EU AI Act Art. 10 data governance) are de-duplicated by the existing Tier-1 synthesizer per CLAUDE.md; the wiring does not build new merge logic.
- **Human gate check is immutable.** `src/hooks/human-gate-check.js` is not modified by this slice. If this slice's logic accidentally touches gate logic, the gate-invariant test must fail loudly.
- **Cross-platform.** `path.join`, `fs.promises`, no bash entry points.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTO Chief orchestrating the pipeline for a project with `compliance.mode = gdpr`,
**I want** the GDPR agent dispatched before the plan reaches `todo`,
**so that** GDPR findings are visible when the project owner reviews the implementation plan at Gate 2.

**As a** project owner reviewing an implementation plan at Gate 2,
**I want** any opted-in compliance findings to be present in the advisory findings surface,
**so that** I can incorporate them into my Gate 2 approval decision rather than discovering them after implementation.

**As a** security maintainer running the test suite,
**I want** a test that asserts Gate 0–3 are unchanged and no compliance finding auto-reverts or auto-advances a plan,
**so that** I have a continuous, automated proof that safety is maintained.

**As a** CTO Chief with `mode = both`,
**I want** overlapping GDPR + AI Act findings reconciled by the existing synthesizer,
**so that** the same gap is not raised twice in two different findings.

### BDD Scenarios

- [ ] **Scenario: mode = gdpr — EC2 dispatched, EC3 not dispatched**
  Given `compliance.mode` is `gdpr`
  And a plan is at the implementation-to-`todo` boundary
  When CTO Chief evaluates the compliance dispatch step
  Then the GDPR agent (EC2) is dispatched
  And the EU AI Act agent (EC3) is not dispatched
  And EC2's findings attach to the plan's advisory findings surface

- [ ] **Scenario: mode = eu-ai-act — EC3 dispatched, EC2 not dispatched**
  Given `compliance.mode` is `eu-ai-act`
  And a plan is at the implementation-to-`todo` boundary
  When CTO Chief evaluates the compliance dispatch step
  Then the EU AI Act agent (EC3) is dispatched
  And the GDPR agent (EC2) is not dispatched
  And EC3's findings attach to the plan's advisory findings surface

- [ ] **Scenario: mode = both — both agents dispatched, overlapping findings de-duplicated**
  Given `compliance.mode` is `both`
  And a plan is at the implementation-to-`todo` boundary
  When CTO Chief evaluates the compliance dispatch step
  Then both EC2 and EC3 are dispatched
  And their findings are passed to the existing Tier-1 synthesizer
  And a single de-duplicated finding appears for any gap that spans both regimes (e.g. data governance)
  And the de-duplicated finding retains `severity: critical`

- [ ] **Scenario: mode = none — pipeline is a byte-for-byte no-op**
  Given `compliance.mode` is `none`
  And a plan is at the implementation-to-`todo` boundary
  When CTO Chief evaluates the compliance dispatch step
  Then no compliance agent is dispatched
  And no file in the project is modified
  And the pipeline execution is identical to a run on a project where `compliance.mode` does not exist (backward-compatible no-op)

- [ ] **Scenario: Findings attach before the implementation-to-todo boundary, not after**
  Given `compliance.mode` is `gdpr` or `both`
  And a plan has just completed the implementation plan stage
  When compliance findings are attached
  Then findings are present in the plan's advisory surface before Gate 2 is presented to the user
  And findings are not attached for the first time at `todo` or after

- [ ] **Scenario: Advisory findings do not auto-revert a plan**
  Given `compliance.mode` is `gdpr`
  And EC2 emits a finding with `severity: critical` and `kind: missing-consent-banner`
  When the finding is attached to the plan's advisory surface
  Then the plan's stage is unchanged (it remains at `implementation`, not reverted to `functional`)
  And no gate transition is triggered automatically

- [ ] **Scenario: Advisory findings do not auto-advance a plan**
  Given `compliance.mode` is `eu-ai-act`
  And EC3 emits zero findings (the plan has no AI system described)
  When the compliance dispatch step completes
  Then the plan does not automatically advance to `todo`
  And Gate 2 still requires the user's explicit `approved_by: human` marker

- [ ] **Scenario: Gate count invariant — exactly 4 gates, transitions unchanged**
  Given the compliance wiring is installed (this slice is live)
  When the gate-invariant test runs against `src/hooks/human-gate-check.js`
  Then the gate count is exactly 4 (Gate 0: vision→functional, Gate 1: functional→implementation, Gate 2: implementation→todo, Gate 3: review→done)
  And no gate transition is modified
  And `requireReviewGate` is unaffected

- [ ] **Scenario: CTO Chief is the sole dispatcher — no sub-orchestrator dispatches siblings**
  Given `compliance.mode` is `both`
  When the compliance dispatch step runs
  Then the dispatch event log shows `dispatcher: "cto-chief"` for both EC2 and EC3 invocations
  And no other agent or sub-orchestrator appears as the dispatcher for EC2 or EC3

- [ ] **Scenario: Findings carry severity: critical on the wire through the integration path**
  Given an EC2 or EC3 finding of any internal triage tier (CRITICAL, HIGH, MEDIUM, LOW)
  When the finding travels from the agent through the dispatch path to the advisory findings surface
  Then the finding's `severity` field equals `"critical"` at the advisory surface
  And no transformation in the dispatch path downgrades severity

---

## Scope

### In Scope

- Dispatch trigger in `src/lib/iron-loop.js`: a pre-`todo` hook that reads `shouldRunGdpr()` / `shouldRunAiAct()` and requests CTO Chief to dispatch the appropriate agent(s).
- CTO Chief dispatch logic in `agents/coordinator/cto-chief.md`: new dispatch case for compliance agents at the implementation-to-`todo` boundary.
- `.ctoc/operations-registry.yaml`: entries for EC2 (`gdpr-agent`) and EC3 (`eu-ai-act-agent`) as dispatchable agents.
- Advisory findings attachment: findings from EC2/EC3 are written to the plan's advisory findings surface (e.g. a `## Compliance Findings` section in the plan, or the existing Inbox mechanism) before the Gate 2 presentation.
- Synthesizer routing for `mode = both`: pass both agents' output to the existing Tier-1 synthesizer for de-duplication; do not build new merge logic.
- Unit and integration tests (`tests/compliance-iron-loop.test.js`): all 10 BDD scenarios above, including gate-invariant assertion (mirrors `tests/environment-mode.test.js` guarantee), `mode = none` no-op diff, dispatcher-identity assertion.

### Out of Scope

- Adding a fifth human gate for compliance — explicitly excluded.
- Making compliance findings blocking (auto-revert / auto-advance) — explicitly excluded; advisory-only.
- Modifying `src/hooks/human-gate-check.js` — immutable by design for this slice.
- Modifying Gate 0 (vision→functional), Gate 1 (functional→implementation), or Gate 3 (review→done) — this slice only adds the pre-Gate-2 dispatch.
- Building new synthesizer/merge logic — the existing Tier-1 synthesizer handles multi-regime reconciliation.
- EC4 recommendation buckets — they are attached by EC4's layer on top of EC2/EC3 findings; EC5 does not produce or transform remedy options.
- Changing the remediation-loop letter schema — the existing schema is used as-is.

---

## Risks

### Technical Risks

- **Pre-`todo` hook timing:** Inserting a dispatch step at the implementation-to-`todo` boundary requires careful placement in `src/lib/iron-loop.js` so that the compliance step runs after the implementation plan is complete but before Gate 2 is presented. If the hook fires too early (implementation step not done) or too late (Gate 2 already presented), findings miss the window.
  - Likelihood: MEDIUM (Iron Loop step sequencing is precise)
  - Impact: HIGH (findings attached after Gate 2 presentation are invisible to the user's approval decision)
  - Mitigation: Add a targeted integration test that asserts findings are present in the plan's advisory surface at the exact point Gate 2 is presented; fail loudly if the sequence is wrong.

- **Synthesizer availability for mode = both:** The existing Tier-1 synthesizer must be available when both agents are dispatched simultaneously. If the synthesizer is not yet wired for compliance finding types, de-duplication falls back to double-raising (noise, but not a safety failure).
  - Likelihood: LOW (synthesizer is a general-purpose cross-pillar tool; it handles any finding type with `regulation_ref` fields for dedup keys)
  - Impact: LOW (duplicate findings are noise; they are advisory and the user can dismiss duplicates)
  - Mitigation: Document in the integration test that the synthesizer is expected to de-duplicate on `(kind, target_file, target_line)` tuple; if a duplicate slips through, it is a synthesizer concern, not an EC5 failure.

### Business Risks

- **Users may ignore advisory findings:** If findings are advisory-only and never blocking, a project owner may acknowledge and dismiss them without remediating, shipping a non-compliant plan.
  - Likelihood: MEDIUM (advisory findings are easier to dismiss than blocking ones)
  - Impact: HIGH (non-compliant launch under GDPR or EU AI Act has statutory liability)
  - Mitigation: Display critical findings with a prominent label in the advisory surface; include the penalty citation (GDPR: up to €20M / 4%; EU AI Act: up to €15M / 3% for high-risk, €35M / 7% for prohibited) in the finding message so the user understands the stakes. The user's waiver in `## Decisions Taken Under Ambiguity` creates an explicit documented choice — not a silent dismissal.

### Dependency Risks

- **EC1, EC2, EC3 must all ship first:** The dispatch trigger requires EC1's resolver API and EC2/EC3's agent files.
  - Likelihood: HIGH (structural; this is the last wiring slice)
  - Impact: HIGH (without EC1/EC2/EC3, EC5 cannot dispatch anything)
  - Mitigation: EC5 tests stub EC1/EC2/EC3 for unit isolation; integration tests require all three. EC5 ships last in the EC1→EC5 sequence.

---

## Priority

**Priority: MEDIUM** (Score: 6/9)
- Dependency: MEDIUM (2) — depends on EC1/EC2/EC3; no other EC slice depends on this one (EC6 covers integration tests but EC5 has no dependents in the program).
- Business Impact: HIGH (3) — without this wiring, EC2/EC3 findings exist but are invisible to the user; the "compliance is context" principle is unrealized; this is the slice that makes the program observable.
- Technical Risk: LOW (1) — the dispatch mechanism mirrors existing CTOC patterns; the main risk (timing of the pre-`todo` hook) is well-understood and covered by the integration test.

---

## Decisions Taken Under Ambiguity

- **Integration shape (the open fork).** Decision: implement as **advisory findings attached pre-`todo`** (the Inbox/advisory option), NOT a new hard gate. Rationale: the principle argues for "early," and the vision mandates the four human gates stay untouched; an advisory pre-`todo` attachment pushes compliance left without adding a fifth gate or weakening an existing one. A future "soft gate before todo" can be layered on later if the user wants blocking behavior — but it must never be one of the four mandatory gates and must be user-configurable.
- **Dispatch point.** Decision: dispatch at the implementation→`todo` boundary (Gate 2's destination is `todo`; we run the agents on the implementation plan just *before* that boundary so findings are present when the user evaluates the plan). We do NOT modify Gate 2 itself — we add an advisory dispatch ahead of it.
- **Who dispatches.** Decision: CTO Chief dispatches the compliance agents (per CLAUDE.md, CTO Chief is the sole dispatcher); EC5 wires the trigger + EC1 gating into the orchestration path, it does not let a sub-orchestrator dispatch siblings.
- **Multi-regime reconciliation.** Decision: reuse the existing CTOC **synthesizer** (Tier-1, cross-pillar) for de-duplication rather than building new merge logic, consistent with EC2/EC3 deferring cross-regime synthesis to it.
- **Findings are advisory, never gate-mutating.** Decision: a critical compliance finding surfaces loudly and is recorded, but does not auto-revert or auto-advance a plan across any human gate. Resolution/waiver is documented in the plan's `## Decisions Taken Under Ambiguity`, consistent with the skills' existing refinement-loop waiver contract.

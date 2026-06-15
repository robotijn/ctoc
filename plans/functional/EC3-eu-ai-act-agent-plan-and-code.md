---
title: "EC3 — EU AI Act agent (plan-inspection + code-scan, extends ai-governance-checker)"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: eu-compliance-agents-gdpr-ai-act
program: ctoc-eu-compliance
order: 3
depends_on:
  - EC1-compliance-mode-setting
files:
  - agents/compliance/eu-ai-act-agent.md
  - src/lib/eu-ai-act-helpers.js
  - skills/compliance/ai-governance-checker/SKILL.md
  - .ctoc/operations-registry.yaml
  - tests/eu-ai-act-agent.test.js
status: refined
acceptance_criteria_count: 12
risk_level: HIGH
---

# EC3 — EU AI Act agent (plan-inspection + code-scan, extends ai-governance-checker)

## 1. ASSESS

### Business Context

`skills/compliance/ai-governance-checker` (covering EU AI Act Regulation (EU) 2024/1689, NIST AI RMF 1.0 + AI 600-1, and ISO/IEC 42001:2023) is code-only: `tools: Bash, Read, Grep, Glob`, `max_subagents: 0`, no web access. It cannot read plan ancestry.

This slice creates an **EU AI Act agent** — a Tier-2 specialist (`agents/compliance/eu-ai-act-agent.md`) that wraps and extends the EU AI Act portion of the existing `ai-governance-checker` skill with plan-ancestry inspection. The agent does not re-implement any of the skill's rule set, scan methodology, letter schema, or classification logic.

**Critical scope boundary:** This agent owns ONLY the EU AI Act regime (Regulation (EU) 2024/1689). NIST AI RMF / ISO 42001 checks remain in the skill. `eu-ai-act-high-risk` in `active_profiles` does NOT silently pull in voluntary US/ISO frameworks.

**EU AI Act scope isolation is enforced via an OUTPUT FILTER in `eu-ai-act-helpers.js`.** The skill is not phase-partitioned (its six scan phases interleave EU AI Act, NIST, and ISO obligations). Instead of trying to invoke only "EU phases" (which is not a real boundary in the skill's implementation), the agent invokes the full skill and then applies an output filter: any finding whose `regulation` field is not `"eu-ai-act"` is dropped before attachment to the Inbox or letter. This is testable and auditable.

**Hybrid testability.** The agent prompt is not directly testable by `node --test`. Deterministic rules live in `src/lib/eu-ai-act-helpers.js` — a risk-tier classification table, an output filter, a severity normalizer, a schema validator, and a finding router. Tests target these helpers. Coverage targets (≥80%) apply to `eu-ai-act-helpers.js`, not to the agent markdown.

**Regulatory dates are cited from `eu-ai-act-high-risk.yaml` (the existing profile), not re-derived.** The profile states: Art. 5 prohibitions effective 2 Feb 2025; Art. 4 AI literacy effective 2 Feb 2025; Chapter V GPAI effective 2 Aug 2025; Annex III high-risk obligations effective 2 Aug 2026. The agent cites these from the profile's `notes` field. Runtime verification is EC4's responsibility.

The agent gates on EC1: `shouldRunEuAiAct(projectRoot)` must return `true` before any work is done.

### Current State

`skills/compliance/ai-governance-checker/SKILL.md` exists and is complete. `eu-ai-act-high-risk.yaml` exists under `.ctoc/regulatory-regimes/`. `src/lib/eu-ai-act-helpers.js` does not exist. `agents/compliance/eu-ai-act-agent.md` does not exist.

### Impact

Every project with `eu-ai-act-high-risk` in `active_profiles` gets EU AI Act risk classification and obligations flagged at the plan stage. A plan describing a CV-screening model gets a plan-stage finding: "likely Annex III §4 (employment) high-risk → conformity assessment + human oversight + technical documentation required." This converts a €15M / 3%-of-turnover statutory liability risk (€35M / 7% for prohibited practices) into a traceable plan requirement.

---

## 2. ALIGN

### Business Goals

**Goal:** Surface EU AI Act risk classification and obligations at the plan stage (as requirements) and at the code stage (as gap findings), scoped strictly to EU AI Act, gated by the regulatory-regime system, without duplicating the skill's rule set or pulling in NIST/ISO frameworks uninvited.

**Job to Be Done:** When I am reviewing a functional plan that deploys an AI system in the EU market, I want the EU AI Act agent to read the plan and provisionally classify the AI system's risk tier and flag the obligations that tier triggers, so that I can treat those obligations as plan requirements rather than code-review surprises.

**Impact Map:**
- **Goal:** EU AI Act risk classification and obligations surfaced at the plan stage, scoped to Regulation (EU) 2024/1689 only.
- **Actor:** CTO Chief dispatching compliance review; project owner reading findings attached to their plan before `todo`.
- **Impact:** Plan-stage findings convert EU AI Act obligations into traceable requirements; code-stage findings catch inventory, classification, and artifact gaps in deployed code — both without duplicating the skill's rule set, and without NIST/ISO findings leaking into an eu-ai-act-only run.
- **Deliverable:** `agents/compliance/eu-ai-act-agent.md` + `src/lib/eu-ai-act-helpers.js` (risk-tier classification table, output filter on `regulation: "eu-ai-act"`, severity normalizer, schema validator, finding router).

### Success Metrics

1. Given a functional plan describing an Annex III domain system, the agent emits a plan-stage finding with `risk_class` + `annex_iii_category` + triggered-obligation list before the plan reaches `todo`.
2. Given a plan describing a prohibited practice (Art. 5), the agent emits a stop-ship finding with `kind: prohibited-use-detected` and `severity: critical`.
3. NIST AI RMF / ISO 42001 findings do not appear in output when `eu-ai-act-high-risk` is the only active profile — the output filter drops them before attachment.
4. Every finding on the wire has `severity: critical` — normalized by `eu-ai-act-helpers.js`, asserted by a unit test at the emitter output level.
5. Agent runs only when `shouldRunEuAiAct(projectRoot)` returns `true`.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTO Chief reviewing a plan that deploys an AI system in the EU market,
**I want** the EU AI Act agent to read the plan ancestry and provisionally classify the AI system's risk tier plus the obligations that tier triggers,
**so that** obligations appear in the plan as requirements before any implementation decision is locked.

**As a** CTO Chief reviewing a plan that describes a prohibited AI practice (Art. 5 of Regulation (EU) 2024/1689),
**I want** the agent to emit a stop-ship finding immediately,
**so that** the team cannot proceed to implementation of a €35M / 7%-of-turnover liability.

**As a** maintainer of the AI governance rule set,
**I want** all EU AI Act classification logic and scan methodology to live exclusively in `skills/compliance/ai-governance-checker/SKILL.md`,
**so that** one file is authoritative and the agent never diverges from it.

**As a** project owner who has opted into `eu-ai-act-high-risk` only (not GDPR),
**I want** the output to contain only EU AI Act findings — no NIST or ISO findings,
**so that** my compliance scope choice is respected and I am not buried in out-of-scope findings.

### BDD Scenarios

- [ ] **Scenario: Plan describes a CV-screening system — Annex III §4 employment finding**
  Given `eu-ai-act-high-risk` is in `active_profiles`
  And a functional plan's text describes screening CVs to select candidates
  When the EU AI Act agent reads the plan ancestry
  Then `eu-ai-act-helpers.js` `classifyFromPlanText(planText)` returns `{ risk_class: "high-risk", annex_iii_category: "4-employment" }`
  And the agent emits a plan-stage Inbox finding with `risk_class: "high-risk"`, `annex_iii_category: "4-employment"`, `regulation_ref: "EU-AI-Act Art. 6 + Annex III §4"`
  And the finding lists triggered obligations: Art. 11 technical docs, Art. 14 human oversight, Art. 43 conformity assessment, Art. 47–49 declaration + CE marking + EU DB registration
  And `confidence` is `medium`

- [ ] **Scenario: Plan describes real-time biometric identification in public spaces — prohibited-use stop-ship**
  Given `eu-ai-act-high-risk` is in `active_profiles`
  And a functional plan describes real-time remote biometric identification in publicly accessible spaces for law enforcement without a statutory exception
  When the EU AI Act agent reads the plan
  Then it emits a finding with `kind: prohibited-use-detected`, `severity: critical`, `risk_class: "prohibited"`, `regulation_ref: "EU-AI-Act Art. 5"`
  And the message states penalty exposure (€35M / 7% of global annual turnover, cited from `eu-ai-act-high-risk.yaml`)
  And `confidence` is `high` if the plan text is explicit about the use case

- [ ] **Scenario: Plan describes a limited-risk chatbot — Art. 50 transparency finding**
  Given `eu-ai-act-high-risk` is in `active_profiles`
  And a functional plan describes a customer-facing chat assistant
  When the EU AI Act agent reads the plan
  Then it emits a finding with `kind: missing-transparency`, `regulation_ref: "EU-AI-Act Art. 50"`, `risk_class: "limited-risk"`
  And `confidence` is `medium`

- [ ] **Scenario: Plan describes a GPAI model provider — Chapter V finding**
  Given `eu-ai-act-high-risk` is in `active_profiles`
  And a functional plan describes providing a large language model (not merely consuming one)
  When the EU AI Act agent reads the plan
  Then it emits findings referencing EU AI Act Chapter V Arts. 51–55 (in force 2 Aug 2025, cited from `eu-ai-act-high-risk.yaml`)
  And the findings include required artifacts: model card, training-data summary (Art. 53.1(d)), copyright-compliance policy

- [ ] **Scenario: Code scan — missing AI system inventory is a critical finding**
  Given `eu-ai-act-high-risk` is in `active_profiles`
  And the repository has no `ai-systems.yaml`, `ai-inventory.json`, or equivalent
  When the EU AI Act agent runs the code scan via the skill
  Then it emits a finding with `kind: missing-inventory`, `severity: critical`, `confidence: high`, `regulation_ref: "EU-AI-Act Art. 11"`

- [ ] **Scenario: Code scan — high-risk system with no human oversight surface**
  Given `eu-ai-act-high-risk` is in `active_profiles`
  And a source file implements a high-risk AI system call that writes a decision to the database without an interactive review endpoint
  When the EU AI Act agent runs the code scan
  Then it emits a finding with `kind: missing-oversight`, `severity: critical`, `regulation_ref: "EU-AI-Act Art. 14"`

- [ ] **Scenario: Code scan — missing AI literacy documentation**
  Given `eu-ai-act-high-risk` is in `active_profiles`
  And the repository has no `docs/ai-literacy.md` or equivalent
  When the EU AI Act agent runs the code scan
  Then it emits a finding with `kind: missing-ai-literacy`, `severity: critical`, `regulation_ref: "EU-AI-Act Art. 4"` (in force 2 Feb 2025, cited from `eu-ai-act-high-risk.yaml`)

- [ ] **Scenario: Output filter — NIST AI RMF and ISO 42001 findings are dropped**
  Given `eu-ai-act-high-risk` is in `active_profiles` and `gdpr` is NOT
  When the EU AI Act agent runs and the skill emits a finding with `regulation: "nist-ai-rmf"` or `regulation: "iso-42001"`
  Then `eu-ai-act-helpers.js` `filterToEuAiAct(findings)` removes those findings
  And no finding with `regulation: "nist-ai-rmf"` or `regulation: "iso-42001"` appears in the output
  And a unit test asserts `filterToEuAiAct` returns empty array for a list containing only NIST/ISO findings

- [ ] **Scenario: Profile absent — agent produces no output**
  Given `eu-ai-act-high-risk` is NOT in `active_profiles`
  When the EU AI Act agent is evaluated
  Then it exits immediately without reading any files, emitting any findings, or making any tool calls

- [ ] **Scenario: eu-ai-act-helpers.js severity normalizer — all emitted findings have severity: critical**
  Given any finding produced by plan-stage or code-stage logic
  When the finding passes through `eu-ai-act-helpers.js` `normalizeSeverity(finding)`
  Then `finding.severity === "critical"` is asserted
  And a unit test provides a sample finding with `severity: "low"` and asserts it is upgraded to `"critical"`

- [ ] **Scenario: Regulatory dates cited from eu-ai-act-high-risk.yaml, not hardcoded**
  Given any plan-stage or code-stage finding referencing enforcement dates
  When the agent constructs the finding message
  Then the enforcement date is read from `.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml` `notes` field or `effective_date` field, not from a literal date string in the agent file
  And the finding marks date citations as `unverified-this-run` until EC4 verifies them live

- [ ] **Scenario: No rule from the skill is re-stated in the agent**
  Given the agent file `agents/compliance/eu-ai-act-agent.md`
  When a reviewer compares it to `skills/compliance/ai-governance-checker/SKILL.md`
  Then no scan category logic, no classification decision tree, no BAD/SAFE example, and no letter-schema field definition appears in the agent file
  And the agent delegates all code-rule evaluation to the skill by reference and machine-checkable rules to `eu-ai-act-helpers.js`

---

## Scope

### In Scope

- `agents/compliance/eu-ai-act-agent.md` — new Tier-2 specialist agent; wraps the existing skill's full scan (all six phases) and applies the EU AI Act output filter post-scan; adds plan-ancestry reading; gates on `shouldRunEuAiAct(projectRoot)` from EC1; `max_subagents: 0` (plan-ancestry reading done by the agent itself).
- `src/lib/eu-ai-act-helpers.js` — new JavaScript module containing:
  - `RISK_TIER_TABLE` — map of Annex III categories (e.g., `"employment"`, `"biometrics"`, `"law-enforcement"`) to `risk_class`
  - `classifyFromPlanText(planText)` — heuristic scan returning `{ risk_class, annex_iii_category }` with `confidence: medium` or `low`
  - `filterToEuAiAct(findings)` — drops any finding whose `regulation` field is not `"eu-ai-act"`
  - `normalizeSeverity(finding)` — sets `severity: "critical"` unconditionally
  - `routeFinding(finding)` — returns `{ route: "inbox" }` when `target_file` absent, `{ route: "letter" }` when present
  - `readEnforcementDates(profilePath)` — reads dates from `eu-ai-act-high-risk.yaml` `notes` + `effective_date`, returns structured object; does not hardcode dates
- Plan-ancestry reading: read vision → canvas → functional → implementation; identify AI system descriptions, intended purposes, deployment contexts; map to EU AI Act risk tiers using the skill's classification logic; list triggered obligations.
- Prohibited-practice detection (Art. 5) at plan stage with stop-ship finding.
- Code-scan delegation: invoke the full `ai-governance-checker` skill (all six phases), then apply `filterToEuAiAct()` to retain only EU AI Act findings.
- Letter emission using the skill's existing letter schema verbatim with EU-AI-Act-specific fields (`risk_class`, `annex_iii_category`, `notified_body_required`, `notified_body_id`, `ce_marking_status`, `eu_database_registered`, `declaration_of_conformity`).
- `.ctoc/operations-registry.yaml` entry for `eu-ai-act-agent`.
- Unit test (`tests/eu-ai-act-agent.test.js`): all JS helpers in `eu-ai-act-helpers.js` (classifier, filter, normalizer, router, date reader); plan-stage classification scenarios using fixture files from EC6; prohibited-use stop-ship; NIST/ISO isolation filter assertion; mode-absent no-op; severity normalization.

### Out of Scope

- NIST AI RMF Govern/Map/Measure/Manage checks invoked by the agent — the output filter handles isolation; the skill retains these phases for direct invocation.
- ISO/IEC 42001 Statement of Applicability — same.
- Web-sourced remediation options (EC4).
- Iron Loop dispatch wiring (EC5).
- Model quality assessment — owned by `data-ml/ml-model-validator` (per the skill's `defers_to`).
- Adversarial-input / prompt-injection mechanics — owned by `ai-quality/llm-security-tester`.
- Confabulation detection mechanics — owned by `ai-quality/hallucination-detector`.
- New human gate — explicitly excluded; this slice is advisory findings only.

---

## Risks

### Technical Risks

- **Annex III classification from plan prose is inherently provisional:** Plan language is imprecise. "AI-assisted hiring" could be Annex III §4 (employment decision-making) or minimal-risk (surfacing candidate profiles for human review).
  - Likelihood: HIGH
  - Impact: MEDIUM (wrong classification is advisory at plan stage; corrected at code stage with `confidence: high`)
  - Mitigation: Always emit plan-stage classifications with `confidence: medium` or `low` and a note that provisional classification requires human confirmation; recommend the project owner consult the EU AI Office's classification tool (ai-act-service-desk.ec.europa.eu) before the implementation plan is finalised.

- **Output filter breadth:** The filter drops any finding where `regulation != "eu-ai-act"`. If the skill's output format changes in the future and `regulation` is renamed or omitted, the filter would silently pass everything.
  - Likelihood: LOW (the skill's letter schema is stable)
  - Impact: MEDIUM (NIST/ISO findings leak into eu-ai-act output)
  - Mitigation: `eu-ai-act-helpers.js` `filterToEuAiAct()` includes a guard: if a finding lacks a `regulation` field entirely, it is also dropped and logged as a malformed finding. The filter is fail-strict, not fail-open.

### Business Risks

- **Staged enforcement dates require accurate citation:** The Annex III high-risk obligations become enforceable 2 Aug 2026 — six weeks from plan creation. The agent must convey this accurately.
  - Likelihood: HIGH (the 2 Aug 2026 deadline is imminent)
  - Impact: HIGH (under-warning a project that high-risk obligation is six weeks away could result in a non-compliant launch)
  - Mitigation: Dates are read from `eu-ai-act-high-risk.yaml` (the authoritative CTOC profile). Runtime verification is delivered by EC4. Pre-EC4, all date citations are marked `unverified-this-run`.

### Dependency Risks

- **EC1 must ship first:** Same as EC2.
  - Likelihood: HIGH (structural dependency)
  - Impact: HIGH
  - Mitigation: EC1 is a hard prerequisite; `tests/eu-ai-act-agent.test.js` stubs `shouldRunEuAiAct()` for unit isolation.

---

## Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) — EC4, EC5, EC6 depend on this for AI Act findings; EC1 is a hard prerequisite.
- Business Impact: HIGH (3) — directly implements the "compliance is context" principle for EU AI Act (Regulation (EU) 2024/1689); Annex III high-risk obligations become enforceable 2 Aug 2026.
- Technical Risk: MEDIUM (2) — plan-stage classification is inherently provisional; output-filter approach is testable and auditable.

---

## Decisions Taken Under Ambiguity

- **Scope isolation via output filter, not phase invocation.** The adversarial review rejected "invoke only EU phases" because the skill is not phase-partitionable — phases interleave EU AI Act, NIST, and ISO obligations in prose, not as distinct code paths. Decision: invoke the full skill, then apply `filterToEuAiAct(findings)` which drops any finding whose `regulation` field is not `"eu-ai-act"`. This is testable: a unit test provides a mixed-regulation finding array and asserts the filter output contains only EU AI Act findings.
- **Dates from eu-ai-act-high-risk.yaml, not hardcoded.** Decision: enforcement dates (Art. 5 prohibitions 2 Feb 2025; Art. 4 AI literacy 2 Feb 2025; Chapter V GPAI 2 Aug 2025; Annex III high-risk 2 Aug 2026) are read from `.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml` via `readEnforcementDates()`. The profile is already checked into the repo and is the canonical CTOC reference for these dates. Pre-EC4, all date citations are marked `unverified-this-run` in the finding.
- **Plan-stage findings via Inbox.** Same decision as EC2: plan-stage findings (no `target_file`) route to the Inbox; code-stage findings (have `target_file`) route via the refinement-loop letter. `eu-ai-act-helpers.js` `routeFinding()` is the deterministic router.
- **`max_subagents: 0` preserved.** Plan-ancestry reading is done by the agent itself. The skill's `max_subagents: 0` is unchanged.
- **Severity claim corrected.** The refinement-loop schema permits `critical`, `medium`, and `low` — it does not reject non-critical. This slice does not assert schema rejection. Instead: `normalizeSeverity()` upgrades all emitted findings to `severity: critical`, and a unit test asserts this behavioral contract at the output level.
- **No new gate.** Decision: emits via the Inbox (plan-stage) or the existing refinement-loop letter (code-stage); gate wiring is EC5; four human gates untouched.

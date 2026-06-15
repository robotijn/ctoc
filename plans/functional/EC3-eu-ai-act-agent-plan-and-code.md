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

`skills/compliance/ai-governance-checker` (covering EU AI Act Regulation (EU) 2024/1689, NIST AI RMF 1.0 + AI 600-1, and ISO/IEC 42001:2023) is code-only: `tools: Bash, Read, Grep, Glob`, `max_subagents: 0`, no web access. It cannot read plan ancestry. A functional plan that deploys a CV-screening model, a loan-decision system, or a chatbot already triggers EU AI Act obligations — risk classification, conformity assessment planning, human oversight design, technical documentation — the moment the plan is written. Discovering these at code review means they are retrofits. Discovering them at the functional stage means they become requirements that the implementation planner can incorporate from day one.

This slice creates an **EU AI Act agent** — a Tier-2 specialist (`agents/compliance/eu-ai-act-agent.md`) that wraps and extends the EU AI Act portion of the existing `ai-governance-checker` skill with plan-ancestry inspection. "Extends" is precise: the agent adds plan-stage classification (reading the plan and provisionally classifying the AI system(s) it introduces) on top of the existing code scan. It does not re-implement any of the skill's rule set, scan methodology, letter schema, or classification logic.

**Critical scope boundary (decision, locked):** This agent owns ONLY the EU AI Act regime (Regulation (EU) 2024/1689). NIST AI RMF / ISO 42001 checks remain in the skill and are callable via the skill directly. `compliance.mode = eu-ai-act` does NOT silently pull in voluntary US/ISO frameworks.

The agent gates on EC1: `shouldRunAiAct()` must return `true` before any work is done.

Staged enforcement dates (cited from the skill; runtime-verified by EC4): Title II prohibitions (Art. 5) in force 2 Feb 2025; Art. 4 AI literacy in force 2 Feb 2025; GPAI Chapter V (Arts. 51–55) in force 2 Aug 2025; high-risk Annex III obligations enforceable 2 Aug 2026. These are not hardcoded assertions; they are cited as documented in the skill and confirmed at runtime by EC4.

### Current State

`skills/compliance/ai-governance-checker/SKILL.md` exists and is complete: 14 scan categories (AI inventory, risk classification, human oversight, technical docs, data governance, transparency Art. 50, CE marking, AI literacy Art. 4, incident runbook Art. 73, post-market monitoring Art. 26, SoA ISO 42001, GenAI gaps NIST AI 600-1, GPAI Chapter V, prohibited practices Art. 5), 6-phase scan methodology, 7-language risk-classification metadata patterns, letter schema (with `severity: critical` always on the wire), and the `defers_to` cross-skill boundary declarations. The skill covers three frameworks; this agent scopes only to EU AI Act.

There is no `agents/compliance/eu-ai-act-agent.md` file today.

### Impact

Every project with `compliance.mode = eu-ai-act | both` gets EU AI Act risk classification and obligations flagged at the plan stage. A plan describing a CV-screening model gets a plan-stage finding: "likely Annex III §4 (employment) high-risk → conformity assessment + human oversight + technical documentation required before this plan reaches `todo`." This converts a €15M / 3%-of-turnover statutory liability risk into a traceable plan requirement.

---

## 2. ALIGN

### Business Goals

**Goal:** Surface EU AI Act risk classification and obligations at the plan stage (as requirements) and at the code stage (as gap findings), scoped strictly to EU AI Act, gated by `compliance.mode`, without duplicating the skill's rule set or pulling in NIST/ISO frameworks uninvited.

**Job to Be Done:** When I am reviewing a functional plan that deploys an AI system in the EU market, I want the EU AI Act agent to read the plan and provisionally classify the AI system's risk tier and flag the obligations that tier triggers, so that I can treat those obligations as plan requirements rather than code-review surprises.

**Impact Map:**
- **Goal:** EU AI Act risk classification and obligations surfaced at the plan stage, scoped to Regulation (EU) 2024/1689 only.
- **Actor:** CTO Chief dispatching compliance review; project owner reading findings attached to their plan before `todo`.
- **Impact:** Plan-stage findings convert EU AI Act obligations into traceable requirements; code-stage findings catch inventory, classification, and artifact gaps in deployed code — both without duplicating the skill's rule set.
- **Deliverable:** `agents/compliance/eu-ai-act-agent.md` — a Tier-2 agent with plan-ancestry reading and EU AI Act scope, delegating code-scan evaluation to the existing `ai-governance-checker` skill.

### Success Metrics

1. Given a functional plan describing a system in an Annex III domain (employment, essential services, biometrics, law enforcement, etc.), the agent emits a plan-stage finding with `risk_class` + `annex_iii_category` + triggered-obligation list before the plan reaches `todo`.
2. Given a functional plan describing a prohibited practice (Art. 5 — e.g. social scoring, real-time biometric ID in public spaces), the agent emits a stop-ship finding with `kind: prohibited-use-detected` and `severity: critical`.
3. The agent runs the EU AI Act scan phases of `ai-governance-checker` (inventory discovery, call-site enumeration, artifact presence checks for EU AI Act artifacts) — no rule re-stated in the agent.
4. NIST AI RMF / ISO 42001 checks are not triggered by `compliance.mode = eu-ai-act`; they remain callable via the skill directly.
5. Every finding on the wire has `severity: critical`.
6. Agent runs only when `shouldRunAiAct()` returns `true`.

### Stakeholders

- **CTO Chief** — dispatches this agent; receives the findings letter.
- **Project owner** — reads plan-stage findings (especially risk classification and triggered obligations) before committing to an implementation approach.
- **EC4 (recommendation layer)** — consumes findings' `kind` + `regulation_ref` to produce remediation buckets for EU AI Act gaps.
- **EC5 (Iron Loop wiring)** — dispatches this agent at the pre-`todo` boundary.

### Constraints

- **Extend, do not duplicate.** Agent references the skill's EU AI Act rule set; does not re-state classification logic, scan methodology, letter schema, or any of the 14 scan category definitions.
- **EU AI Act scope only.** NIST AI RMF and ISO 42001 scan categories stay in the skill. The agent does not invoke or reference them.
- **Wire contract:** `severity: critical` for all findings on the wire. Triage tiers stay only in the human-readable report body.
- **Plan-stage confidence:** Plan-stage classifications are emitted with `confidence: medium` (AI system type inferred from plan prose) or `confidence: low` (obligation inferred from loose context). Prohibited-practice matches may be `confidence: high` if the plan text is explicit. Code-stage findings keep `confidence: high` when an artifact is provably absent.
- **No new gate.** Findings travel via the existing refinement-loop letter path. Gate wiring is EC5.
- **No web access pre-EC4.** Runtime date/threshold verification is EC4's responsibility; this agent cites only what the skill already documents.
- **Regulation (EU) 2024/1689.** All EU AI Act Article and Annex references use this citation.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTO Chief reviewing a plan that deploys an AI system in the EU market,
**I want** the EU AI Act agent to read the plan ancestry and provisionally classify the AI system's risk tier plus the obligations that tier triggers,
**so that** obligations appear in the plan as requirements before any implementation decision is locked.

**As a** CTO Chief reviewing a plan that describes a prohibited AI practice (Art. 5),
**I want** the agent to emit a stop-ship finding immediately,
**so that** the team cannot proceed to implementation of a €35M / 7%-of-turnover liability.

**As a** CTO Chief reviewing deployed code,
**I want** the EU AI Act agent to run the AI governance code scan (inventory, call-site classification, artifact checks) scoped to the EU AI Act,
**so that** compliance gaps in deployed code are caught without NIST/ISO frameworks being invoked uninvited.

**As a** maintainer of the AI governance rule set,
**I want** all EU AI Act classification logic and scan methodology to live exclusively in `skills/compliance/ai-governance-checker/SKILL.md`,
**so that** one file is authoritative and the agent never diverges from it.

### BDD Scenarios

- [ ] **Scenario: Plan describes a CV-screening system — Annex III §4 employment finding**
  Given `compliance.mode` is `eu-ai-act` or `both`
  And a functional plan's text describes screening CVs or résumés to select candidates
  When the EU AI Act agent reads the plan ancestry
  Then it emits a plan-stage finding with `risk_class: "high-risk"`, `annex_iii_category: "4-employment"`, `regulation_ref: "EU-AI-Act Art. 6 + Annex III §4"`
  And the finding lists triggered obligations: Art. 11 technical docs, Art. 14 human oversight, Art. 43 conformity assessment, Art. 47–49 declaration + CE marking + EU DB registration
  And `confidence` is `medium` (inferred from plan prose)

- [ ] **Scenario: Plan describes real-time biometric identification in public spaces — prohibited-use stop-ship**
  Given `compliance.mode` is `eu-ai-act` or `both`
  And a functional plan describes real-time remote biometric identification in publicly accessible spaces for law enforcement without a statutory exception
  When the EU AI Act agent reads the plan
  Then it emits a finding with `kind: prohibited-use-detected`, `severity: critical`, `risk_class: "prohibited"`, `regulation_ref: "EU-AI-Act Art. 5"`
  And the message clearly states this is a stop-ship finding (€35M / 7% penalty exposure)
  And `confidence` is `high` if the plan text is explicit about the use case

- [ ] **Scenario: Plan describes a limited-risk chatbot — Art. 50 transparency finding**
  Given `compliance.mode` is `eu-ai-act` or `both`
  And a functional plan describes a customer-facing chat assistant or support bot
  When the EU AI Act agent reads the plan
  Then it emits a finding with `kind: missing-transparency`, `regulation_ref: "EU-AI-Act Art. 50"`, `risk_class: "limited-risk"`
  And the finding message states that users must be informed they are interacting with an AI
  And `confidence` is `medium`

- [ ] **Scenario: Plan describes a GPAI model provider — Chapter V finding**
  Given `compliance.mode` is `eu-ai-act` or `both`
  And a functional plan describes providing a large language model or foundation model (not merely consuming one)
  When the EU AI Act agent reads the plan
  Then it emits findings referencing EU AI Act Chapter V Arts. 51–55 (in force 2 Aug 2025, runtime-verified by EC4)
  And the findings include required artifacts: model card, training-data summary (Art. 53.1(d)), copyright-compliance policy

- [ ] **Scenario: Code scan — missing AI system inventory is a critical finding**
  Given `compliance.mode` is `eu-ai-act` or `both`
  And the repository has no `ai-systems.yaml`, `ai-inventory.json`, or equivalent inventory file
  When the EU AI Act agent runs the code scan via the skill
  Then it emits a finding with `kind: missing-inventory`, `severity: critical`, `confidence: high`, `regulation_ref: "EU-AI-Act Art. 11"`

- [ ] **Scenario: Code scan — high-risk system with no human oversight surface**
  Given `compliance.mode` is `eu-ai-act` or `both`
  And a source file implements a high-risk AI system call that writes a decision to the database without an interactive review endpoint
  When the EU AI Act agent runs the code scan
  Then it emits a finding with `kind: missing-oversight`, `severity: critical`, `regulation_ref: "EU-AI-Act Art. 14"`

- [ ] **Scenario: Code scan — missing AI literacy documentation (Art. 4, in force 2 Feb 2025)**
  Given `compliance.mode` is `eu-ai-act` or `both`
  And the repository has no `docs/ai-literacy.md`, `training/ai-literacy.yaml`, or equivalent
  When the EU AI Act agent runs the code scan
  Then it emits a finding with `kind: missing-ai-literacy`, `severity: critical`, `regulation_ref: "EU-AI-Act Art. 4"`

- [ ] **Scenario: NIST AI RMF and ISO 42001 checks are NOT triggered**
  Given `compliance.mode` is `eu-ai-act`
  When the EU AI Act agent runs
  Then no findings reference `regulation: nist-ai-rmf` or `regulation: iso-42001`
  And no NIST Govern/Map/Measure/Manage or ISO 42001 Annex A control references appear in emitted findings

- [ ] **Scenario: mode = none — agent produces no output**
  Given `compliance.mode` is `none`
  When the EU AI Act agent is evaluated
  Then it exits immediately without reading any files, emitting any findings, or making any tool calls

- [ ] **Scenario: mode = gdpr — EU AI Act agent does not run**
  Given `compliance.mode` is `gdpr`
  When `shouldRunAiAct()` is evaluated
  Then it returns `false` and the EU AI Act agent produces no output

- [ ] **Scenario: All findings on the wire have severity: critical**
  Given any finding is emitted (plan-stage or code-stage)
  When the finding is serialised to the refinement-loop letter
  Then the `severity` field equals `"critical"` regardless of the internal triage tier
  And the letter is rejected by schema validation if `severity` is any other value

- [ ] **Scenario: No rule from the skill is re-stated in the agent**
  Given the agent file `agents/compliance/eu-ai-act-agent.md`
  When a reviewer compares it to `skills/compliance/ai-governance-checker/SKILL.md`
  Then no scan category logic, no classification decision tree, no BAD/SAFE example, and no letter-schema field definition appears in the agent file
  And the agent delegates all code-rule evaluation to the skill by reference

---

## Scope

### In Scope

- `agents/compliance/eu-ai-act-agent.md` — new Tier-2 specialist agent file; wraps the existing skill's EU AI Act scan phases; adds plan-ancestry reading; gates on `shouldRunAiAct()` from EC1.
- Plan-ancestry reading: read vision → canvas → functional → implementation files and identify AI system descriptions, intended purposes, deployment contexts, and user populations; map each to EU AI Act risk tiers (prohibited, high-risk, limited-risk, minimal-risk) using the skill's classification logic; list triggered obligations.
- Prohibited-practice detection (Art. 5) at plan stage with stop-ship finding.
- Code-scan delegation: invoke the `ai-governance-checker` skill's EU AI Act scan phases (Phases 1–4 from the skill's methodology — inventory discovery, model call-site enumeration, cross-check registry vs. code, artifact presence checks for EU AI Act artifacts — Art. 11, Art. 14, Art. 43/47/48/49, Art. 4, Art. 73, Art. 26). Phase 5 (GenAI transparency Art. 50) and Phase 6 (GPAI + prohibited-use scan) are also included as they are EU AI Act obligations.
- Letter emission using the skill's existing letter schema verbatim, with EU-AI-Act-specific fields (`risk_class`, `annex_iii_category`, `notified_body_required`, `notified_body_id`, `ce_marking_status`, `eu_database_registered`, `declaration_of_conformity`).
- Plan-stage `confidence` assignment per the decisions below.
- `.ctoc/operations-registry.yaml` entry for the new agent.
- Unit test (`tests/eu-ai-act-agent.test.js`): plan-stage classification for Annex III domains, prohibited-use stop-ship, limited-risk chatbot Art. 50 finding; code-stage findings for missing inventory, missing oversight, missing AI literacy; `mode=none` no-op; NIST/ISO isolation assertion; wire `severity: critical` assertion; no-rule-duplication lint check.

### Out of Scope

- NIST AI RMF Govern/Map/Measure/Manage checks — remain in the `ai-governance-checker` skill; not triggered by `compliance.mode = eu-ai-act`.
- ISO/IEC 42001 Statement of Applicability / Annex A controls — remain in the skill; not triggered by `compliance.mode = eu-ai-act`.
- Web-sourced remediation options (hosted / self-hosted / library buckets) — delivered by EC4.
- Iron Loop dispatch wiring — delivered by EC5.
- Model quality assessment (accuracy, drift, fairness metrics) — owned by `data-ml/ml-model-validator` (per the skill's `defers_to`).
- Adversarial-input / prompt-injection mechanics — owned by `ai-quality/llm-security-tester` (per the skill's `defers_to`).
- Confabulation detection mechanics — owned by `ai-quality/hallucination-detector` (per the skill's `defers_to`).
- New human gate — explicitly excluded; this slice is advisory findings only.

---

## Risks

### Technical Risks

- **Annex III classification from plan prose is inherently provisional:** The skill acknowledges that plan language is imprecise. A plan mentioning "AI-assisted hiring" could be Annex III §4 (employment decision-making) or minimal-risk (just surfacing candidate profiles for human review). Incorrect classification misleads the project owner.
  - Likelihood: HIGH (plan prose is always less precise than code)
  - Impact: MEDIUM (wrong classification is advisory at plan stage; corrected at code stage with `confidence: high` when artifacts are provably checked)
  - Mitigation: Always emit plan-stage classifications with `confidence: medium` or `low` and include a prominent note that provisional classification requires human confirmation; recommend the project owner consult the EU AI Office's classification tool (ai-act-service-desk.ec.europa.eu) before the implementation plan is finalised.

- **Skill scope boundary enforcement:** The agent must invoke only the EU AI Act scan phases of the skill, not the NIST/ISO phases. If the skill's phases are not cleanly separated in the implementation, the agent could accidentally invoke NIST/ISO checks.
  - Likelihood: LOW (the skill's 6 phases map cleanly to regulatory regimes)
  - Impact: MEDIUM (NIST/ISO findings surfacing on a project that only opted into `eu-ai-act` creates noise and violates the user's regime choice)
  - Mitigation: The agent file explicitly names the scan phases it invokes (Phases 1–6 that correspond to EU AI Act obligations) and the phases it does not invoke; this is testable and asserted in the NIST/ISO isolation scenario.

### Business Risks

- **Staged enforcement dates create time-sensitive accuracy requirements:** The EU AI Act's staged rollout (Art. 4/Title II: 2 Feb 2025; Chapter V GPAI: 2 Aug 2025; Annex III high-risk: 2 Aug 2026) means an obligation that is not yet enforceable today (Annex III, as of June 2026) becomes enforceable in six weeks. The agent must convey this accurately.
  - Likelihood: HIGH (the 2 Aug 2026 deadline is six weeks from plan creation date)
  - Impact: HIGH (under-warning a project that a high-risk obligation becomes enforceable in six weeks could result in a non-compliant launch)
  - Mitigation: For Annex III findings, always include the enforcement date in the finding message; runtime-verify against the EU AI Act as published on EUR-Lex (delivered by EC4). Pre-EC4, include the skill-documented date and mark it `unverified-this-run` per the EC4 fallback protocol.

### Dependency Risks

- **EC1 must ship first:** Same as EC2.
  - Likelihood: HIGH (structural dependency)
  - Impact: HIGH
  - Mitigation: EC1 is a hard prerequisite; `tests/eu-ai-act-agent.test.js` stubs `shouldRunAiAct()` for unit isolation.

- **EC4 runtime verification is not yet available:** Pre-EC4, the agent cites staged enforcement dates from the skill without live verification. If a date in the skill is wrong, the agent propagates it.
  - Likelihood: LOW (skill dates are sourced from the AI Act text itself)
  - Impact: MEDIUM (incorrect date cited to a project owner planning a launch)
  - Mitigation: Mark all pre-EC4 date citations as `unverified-this-run` in the finding; document the EC4 dependency explicitly in the agent frontmatter.

---

## Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) — EC4, EC5, EC6 depend on this for AI Act findings; EC1 is a hard prerequisite.
- Business Impact: HIGH (3) — directly implements the "compliance is context" principle for EU AI Act (Regulation (EU) 2024/1689); Annex III high-risk obligations become enforceable 2 Aug 2026 — six weeks from plan creation; a missed classification now is a market-withdrawal risk in six weeks.
- Technical Risk: MEDIUM (2) — plan-stage classification is inherently provisional (mitigated by confidence levels); skill scope boundary is clear and testable.

---

## Decisions Taken Under Ambiguity

- **Agent tier.** Same fork as EC2. Decision: Tier-2 specialist wrapping the Tier-2 skill; cross-regime synthesis deferred to the existing synthesizer (Tier-1), not a new sub-orchestrator. Consistent with EC2 so the two agents are symmetric.
- **Regime scope.** The skill covers EU AI Act + NIST AI RMF + ISO 42001. Decision: this agent owns ONLY the EU AI Act regime (the vision's scope). The NIST/ISO surface stays callable via the skill directly. Prevents `compliance.mode=eu-ai-act` from silently pulling in voluntary US/ISO frameworks the user did not opt into.
- **Plan-stage classification confidence.** Decision: plan-stage classifications are emitted with `confidence: medium|low` (inferred from plan prose) and clearly marked provisional; code-stage classifications keep `confidence: high` when artifact is provably absent. Avoids over-blocking on a plan's loose wording while still pushing the obligation left.
- **Web verification.** Decision: runtime date/threshold verification is delivered by EC4. Pre-EC4, the agent cites only the dates/thresholds the skill already documents (Reg (EU) 2024/1689; 10^25 FLOPs systemic-risk threshold; staged enforcement dates). It does not invent new regulatory facts.
- **No new gate.** Decision: emits via the existing refinement-loop letter path; gate wiring is EC5; four human gates untouched.

---
title: "EC2 — GDPR agent (plan-inspection + code-scan, extends gdpr-compliance-checker)"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: eu-compliance-agents-gdpr-ai-act
program: ctoc-eu-compliance
order: 2
depends_on:
  - EC1-compliance-mode-setting
files:
  - agents/compliance/gdpr-agent.md
  - skills/compliance/gdpr-compliance-checker/SKILL.md
  - .ctoc/operations-registry.yaml
  - tests/gdpr-agent.test.js
status: refined
acceptance_criteria_count: 11
risk_level: HIGH
---

# EC2 — GDPR agent (plan-inspection + code-scan, extends gdpr-compliance-checker)

## 1. ASSESS

### Business Context

`skills/compliance/gdpr-compliance-checker` (Regulation (EU) 2016/679) is code-only: `tools: Read, Grep`, `max_subagents: 0`, no web access, cannot read plan ancestry. This means GDPR obligations enter the pipeline at the code-scan stage — too late. A functional plan that introduces an email-collection form, a user-deletion flow, or a third-party analytics SDK already carries GDPR obligations the moment the plan is written. Discovering them at code review is a retrofit; discovering them at the functional stage means they become requirements.

This slice creates a **GDPR agent** — a Tier-2 specialist agent (`agents/compliance/gdpr-agent.md`) that wraps and extends the existing skill. "Extends" is precise and load-bearing: the agent adds plan-ancestry inspection (read vision → canvas → functional → implementation, flag triggered obligations) on top of the existing code scan. It does not duplicate any of the skill's rule set, letter schema, PII surface list, Article checks (Arts. 6/7/13/14/17/20/25/28/30/33/34/35/37), or BAD/SAFE examples. Both remain authoritative in `SKILL.md`.

The agent gates on EC1: `shouldRunGdpr()` must return `true` before any work is done.

Regulation reference (runtime-verified, not hardcoded): GDPR = Regulation (EU) 2016/679. The skill documents the operative obligations; this agent calls the skill's rule set and adds plan-stage triggering on top. Runtime date/threshold verification is delivered by EC4; pre-EC4, the agent cites only what the skill already states.

### Current State

`skills/compliance/gdpr-compliance-checker/SKILL.md` exists and is complete: PII surface list, eight compliance categories (consent Art. 7, Art. 13 info-at-collection, Art. 20 data export, Art. 17 deletion, DSAR audit, breach runbook Art. 33/34, subprocessor list Art. 28, non-EU transfers Chapter V, dark patterns), output format, letter schema (with `severity: critical` always on the wire), and the `confidence`/`reachable`/`delta_to_baseline` fields. The skill is a pure code-scan tool today.

There is no `agents/compliance/gdpr-agent.md` file today.

### Impact

Every project with `compliance.mode = gdpr | both` gets GDPR obligations flagged at the plan stage, before implementation begins. Obligations that would otherwise appear at code review as surprises become plan-level requirements that the implementation planner incorporates from the start. This is the "compliance is context" principle applied concretely.

---

## 2. ALIGN

### Business Goals

**Goal:** Surface GDPR obligations at the plan stage (as requirements) and at the code stage (as gap findings), gated by `compliance.mode`, without duplicating the skill's rule set.

**Job to Be Done:** When I am reviewing a functional plan that collects personal data or modifies a user-deletion flow, I want the GDPR agent to read the plan and tell me which GDPR Articles it triggers, so that I can treat those obligations as plan requirements rather than code-review surprises.

**Impact Map:**
- **Goal:** GDPR compliance surfaced left in the pipeline — at the plan stage, not the code stage.
- **Actor:** CTO Chief dispatching compliance review; project owner reading findings attached to their plan before `todo`.
- **Impact:** Plan-stage findings convert GDPR obligations into traceable plan requirements; code-stage findings catch remaining gaps in deployed code — both without duplicating the skill's rule set.
- **Deliverable:** `agents/compliance/gdpr-agent.md` — a Tier-2 agent with plan-ancestry reading capability that delegates code-scan rule evaluation to the existing `gdpr-compliance-checker` skill.

### Success Metrics

1. Given a functional plan that mentions a PII field (e.g. `email`, `ipAddress`), the agent emits a plan-stage finding naming the triggered Articles (Art. 13 info-at-collection, Art. 6 lawful basis, Art. 17 erasure path) with appropriate `confidence` before the plan reaches `todo`.
2. The agent runs the full code scan via the existing `gdpr-compliance-checker` rule set — no rule from the skill is re-stated in the agent file.
3. Every finding on the wire has `severity: critical` (warnings-are-critical contract; triage tiers remain only in the human-readable report body).
4. Agent runs only when `shouldRunGdpr()` returns `true` (EC1); when mode is `none` or `eu-ai-act`, the agent produces no output and makes no file reads.
5. The skill's existing tests remain green after any additive changes to `SKILL.md` (e.g. raising `max_subagents` if needed for plan-read dispatch).

### Stakeholders

- **CTO Chief** — dispatches this agent; receives the findings letter.
- **Project owner** — reads plan-stage findings attached before `todo`.
- **EC4 (recommendation layer)** — consumes findings' `kind` + `gdpr_article` fields to produce remediation buckets.
- **EC5 (Iron Loop wiring)** — dispatches this agent at the pre-`todo` boundary.

### Constraints

- **Extend, do not duplicate.** The agent references the skill's rule set; it does not re-state PII surface lists, Article checks, BAD/SAFE examples, or letter schema fields. Any change to compliance rules happens in `SKILL.md`, not in the agent file.
- **Wire contract:** `severity: critical` for all findings on the wire. Triage tiers (CRITICAL/HIGH/MEDIUM/LOW) stay only in the human-readable report body, exactly as the skill defines.
- **No new gate:** This slice does not add or modify any Iron Loop gate. Findings travel via the existing refinement-loop letter path. Gate wiring is EC5.
- **No web access** in this agent pre-EC4. Web-sourced remediation is delivered by EC4; pre-EC4, the agent uses the skill's static `suggested_fix` / `reference` fields only.
- **Plan-stage confidence levels:** Plan-stage findings are emitted with `confidence: medium` (obligation inferred from plan prose describing PII use) or `confidence: low` (obligation inferred from plan context, no explicit PII field named). Code-stage findings keep `confidence: high` when an artifact is provably absent.
- **Regulation (EU) 2016/679.** All GDPR Article references use this citation. Dates and thresholds are not hardcoded in the agent beyond what the skill already states.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTO Chief dispatching compliance review on a plan that collects PII,
**I want** the GDPR agent to read the plan's ancestry (vision → canvas → functional → implementation) and emit the GDPR Articles the plan triggers,
**so that** obligations land in the plan as requirements before any code is written.

**As a** CTO Chief dispatching compliance review on deployed code,
**I want** the GDPR agent to run the full `gdpr-compliance-checker` code scan,
**so that** the deployed-code GDPR surface is still checked without any rule being duplicated in the agent.

**As a** maintainer of the GDPR rule set,
**I want** all compliance rules to live exclusively in `skills/compliance/gdpr-compliance-checker/SKILL.md`,
**so that** one file is authoritative and the agent never diverges from it.

**As a** security maintainer,
**I want** every finding on the letter wire to have `severity: critical`,
**so that** the warnings-are-critical contract is provably maintained across both plan-stage and code-stage findings.

### BDD Scenarios

- [ ] **Scenario: Plan mentions email — Art. 13 + Art. 6 + Art. 17 triggered**
  Given `compliance.mode` is `gdpr` or `both`
  And a functional plan whose body mentions collecting an email address from a user
  When the GDPR agent reads the plan ancestry
  Then it emits at least one plan-stage finding with `gdpr_article: "GDPR-13"` (info-at-collection)
  And at least one finding with `gdpr_article: "GDPR-6"` (lawful basis required)
  And at least one finding with `gdpr_article: "GDPR-17"` (erasure path required)
  And each finding has `confidence: medium` or `low` (not `high` — plan prose is not code evidence)

- [ ] **Scenario: Plan describes Art. 9 special-category data — extra-strict finding**
  Given `compliance.mode` is `gdpr` or `both`
  And a functional plan mentions collecting health or biometric data
  When the GDPR agent reads the plan
  Then it emits a finding with `gdpr_article: "GDPR-9"` and `severity: critical`
  And the finding message notes an additional lawful basis beyond Art. 6 is required

- [ ] **Scenario: Plan describes a third-party analytics SDK — Chapter V transfer finding**
  Given `compliance.mode` is `gdpr` or `both`
  And a functional plan names a US-hosted analytics provider without stating a transfer mechanism
  When the GDPR agent reads the plan
  Then it emits a finding with `gdpr_article: "GDPR-Chapter-V"` (international transfer)
  And `kind: non-eu-transfer-without-sccs-dpf`
  And `confidence: medium`

- [ ] **Scenario: Code scan detects soft-delete with no purge — critical finding**
  Given `compliance.mode` is `gdpr` or `both`
  And a source file contains a soft-delete pattern with no hard-purge schedule (as defined in the skill's SAFE/BAD examples)
  When the GDPR agent runs the code scan via the skill's rule set
  Then it emits a finding with `kind: soft-delete-no-purge-schedule`, `gdpr_article: "GDPR-17"`, `severity: critical`, `confidence: high`

- [ ] **Scenario: Code scan detects missing consent banner — critical finding**
  Given `compliance.mode` is `gdpr` or `both`
  And a source file initialises an analytics SDK before any consent gate
  When the GDPR agent runs the code scan
  Then it emits a finding with `kind: missing-consent-banner`, `gdpr_article: "GDPR-7"`, `severity: critical`

- [ ] **Scenario: Code scan detects missing data-export endpoint — critical finding**
  Given `compliance.mode` is `gdpr` or `both`
  And the codebase has no authenticated self-service data-export endpoint (Art. 20)
  When the GDPR agent runs the code scan
  Then it emits a finding with `kind: missing-data-export-endpoint`, `gdpr_article: "GDPR-20"`, `severity: critical`, `confidence: high`

- [ ] **Scenario: mode = none — agent produces no output**
  Given `compliance.mode` is `none`
  When the GDPR agent is evaluated
  Then it exits immediately without reading any files, emitting any findings, or making any tool calls

- [ ] **Scenario: mode = eu-ai-act — GDPR agent does not run**
  Given `compliance.mode` is `eu-ai-act`
  When `shouldRunGdpr()` is evaluated
  Then it returns `false` and the GDPR agent produces no output

- [ ] **Scenario: All findings on the wire have severity: critical**
  Given any finding is emitted (plan-stage or code-stage)
  When the finding is serialised to the refinement-loop letter
  Then the `severity` field equals `"critical"` regardless of the internal triage tier
  And the letter is rejected by schema validation if `severity` is any other value

- [ ] **Scenario: No rule from the skill is re-stated in the agent**
  Given the agent file `agents/compliance/gdpr-agent.md`
  When a reviewer compares it to `skills/compliance/gdpr-compliance-checker/SKILL.md`
  Then no PII field list, no Article check logic, no BAD/SAFE example, and no letter-schema field definition appears in the agent file
  And the agent delegates code-rule evaluation to the skill by reference

- [ ] **Scenario: Skill tests remain green after any additive SKILL.md changes**
  Given any additive change to `skills/compliance/gdpr-compliance-checker/SKILL.md` (e.g. `max_subagents` raised to support plan-read dispatch)
  When `node --test tests/*.test.js` is run
  Then all pre-existing skill-related tests pass with `# fail 0`

---

## Scope

### In Scope

- `agents/compliance/gdpr-agent.md` — new Tier-2 specialist agent file; wraps the existing skill; adds plan-ancestry reading; gates on `shouldRunGdpr()` from EC1.
- Plan-ancestry reading: read vision → canvas → functional → implementation files and identify PII fields, data flows, third-party SDKs, and user-deletion flows named in the plan text; map each to the triggered GDPR Article(s) using the skill's rule set.
- Code-scan delegation: invoke the `gdpr-compliance-checker` skill's full rule set (PII surface, consent UX, deletion cascade, transfers, DSAR audit, breach runbook, subprocessor list, dark patterns) — do not re-state these in the agent.
- Letter emission using the skill's existing letter schema verbatim (`finding_id`, `severity: critical`, `confidence`, `engine`, `kind`, `gdpr_article`, `target_file`, `target_line`, `sink`, `source`, `reachable`, `delta_to_baseline`, `message`, `suggested_fix`, `reference`).
- Plan-stage `confidence` assignment: `medium` for obligation inferred from named PII field, `low` for obligation inferred from contextual description only.
- `.ctoc/operations-registry.yaml` entry for the new agent.
- Unit test (`tests/gdpr-agent.test.js`): plan-stage triggering for PII fields, Art. 9 special categories, Chapter V transfers; code-stage finding for soft-delete/no purge, missing consent banner, missing export endpoint; `mode=none` no-op; wire `severity: critical` assertion; no-rule-duplication lint check.

### Out of Scope

- Web-sourced remediation options (hosted / self-hosted / library buckets) — delivered by EC4.
- Iron Loop dispatch wiring — delivered by EC5.
- NIST AI RMF or ISO 42001 checks — owned by `ai-governance-checker` skill.
- New human gate — explicitly excluded; this slice is advisory findings only.
- Rectification (Art. 16) or objection (Art. 21) endpoint checks — these are in the skill if present; if absent from the skill, they are a skill concern, not an agent concern.
- DPO appointment threshold analysis (Art. 37) beyond what the skill currently provides — future skill enhancement if needed.

---

## Risks

### Technical Risks

- **Plan-prose ambiguity produces false positives at `confidence: medium`:** A plan that mentions "email notifications" (a legitimate operational context) may be incorrectly flagged for Art. 13 collection obligations when the email is not collected from the user in this plan.
  - Likelihood: MEDIUM (plan prose varies in precision)
  - Impact: LOW (false positives are advisory findings, not gate-blockers; the user can waive in `## Decisions Taken Under Ambiguity`)
  - Mitigation: Use `confidence: low` for contextual mentions (no explicit PII field named) and `confidence: medium` only when a PII field from the skill's list is named explicitly; document the heuristic in the agent file.

- **Skill `max_subagents: 0` limits plan-read dispatch:** If plan-ancestry reading requires spawning subagents to read multiple files, the skill's `max_subagents: 0` becomes a constraint. The skill has `parallel_safe: true`, so the agent (not the skill) can use subagents for the plan-read phase without changing the skill.
  - Likelihood: LOW (the agent, not the skill, does the plan reading; skill stays unchanged)
  - Impact: LOW (agent can read plan files directly before delegating code-scan to the skill)
  - Mitigation: Keep plan-ancestry reading in the agent layer; invoke the skill's code-scan logic as a rule set, not as a subagent dispatch. Document this boundary in the agent file.

### Business Risks

- **Regulatory citation drift:** GDPR = Regulation (EU) 2016/679 is stable law, but interpretive guidance (EDPB opinions, national DPA enforcement decisions) evolves. The skill hard-states some EDPB 2026 positions; those may shift.
  - Likelihood: LOW (GDPR text itself is stable; EDPB guidance evolves slowly)
  - Impact: MEDIUM (stale guidance could lead to incorrect risk ratings)
  - Mitigation: Runtime date/threshold verification is delivered by EC4; pre-EC4, the agent emits the skill's documented obligations and notes they are subject to EC4 verification. Do not assert any obligation not already in `SKILL.md`.

### Dependency Risks

- **EC1 must ship first:** This slice's gate check (`shouldRunGdpr()`) requires EC1 to be live.
  - Likelihood: HIGH (structural dependency)
  - Impact: HIGH (agent cannot gate correctly without EC1)
  - Mitigation: Treat EC1 as a hard prerequisite; `tests/gdpr-agent.test.js` stubs `shouldRunGdpr()` for unit isolation but integration tests require real EC1 output.

---

## Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) — EC4, EC5, EC6 all depend on this slice for GDPR findings; EC1 must precede it.
- Business Impact: HIGH (3) — directly implements the "compliance is context" principle for GDPR (Regulation (EU) 2016/679); most EU-facing projects are primarily subject to GDPR.
- Technical Risk: MEDIUM (2) — plan-ancestry reading is novel for skills but the letter schema and code-scan rules are already fully specified in the existing skill.

---

## Decisions Taken Under Ambiguity

- **Agent tier.** Vision lists an open fork (two Tier-2 specialists vs. a Tier-1 compliance sub-orchestrator). Decision for this slice: implement as a **Tier-2 specialist agent** that wraps the existing Tier-2 skill — lowest-risk, ships value now. Cross-regime synthesis (GDPR + AI Act together) is deferred to the existing CTOC **synthesizer** (Tier-1) per CLAUDE.md, rather than inventing a new sub-orchestrator. Revisit at Gate 0 if cross-regime coupling proves heavy.
- **Where plan-read capability lives.** Decision: add plan-ancestry reading to the agent (which may dispatch subagents) and keep the SKILL.md as the code-rule authority; raise the skill's `max_subagents` only if measured necessary, with the change documented and tests kept green. Avoids breaking the skill's parallel-safe guarantee unnecessarily.
- **Web verification.** Decision: the agent's web-sourced remediation is delivered by EC4 (shared recommender). Pre-EC4, the agent emits the finding + the skill's static `suggested_fix`/`reference`; it does NOT invent dates/thresholds. GDPR regulatory facts cited are limited to what the skill already states (Reg (EU) 2016/679).
- **No new gate.** Decision: this slice does NOT add any Iron Loop gate; it emits via the existing refinement-loop letter path. Gate wiring is EC5. The four human gates are untouched.

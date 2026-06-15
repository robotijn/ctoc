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
  - src/lib/gdpr-helpers.js
  - skills/compliance/gdpr-compliance-checker/SKILL.md
  - .ctoc/operations-registry.yaml
  - tests/gdpr-agent.test.js
status: refined
acceptance_criteria_count: 12
risk_level: HIGH
---

# EC2 — GDPR agent (plan-inspection + code-scan, extends gdpr-compliance-checker)

## 1. ASSESS

### Business Context

`skills/compliance/gdpr-compliance-checker` (Regulation (EU) 2016/679) is code-only: `tools: Read, Grep`, `max_subagents: 0`, no web access, cannot read plan ancestry. The skill's letter schema defines `gdpr_article` values for Articles 7, 13, 14, 15, 17, 20, 28, 30, 33, 34, 37, and Chapter V. Articles 6 (lawful basis) and 9 (special categories) are referenced in the skill's narrative but are not listed as enum values in the `gdpr_article` letter field. This gap means the agent would mint `GDPR-6` or `GDPR-9` codes that the schema validation step does not recognize.

**Naming.** The existing `gdpr-compliance-checker` is a **skill** (lives in `skills/`). This slice creates a new **agent** named `gdpr-agent` (lives in `agents/compliance/gdpr-agent.md`). These are distinct: the skill is the code-scan rule set and letter-schema authority; the agent wraps the skill and adds plan-ancestry reading. The existing skill is kept as-is; no wrapper agent existed before this slice.

**Hybrid testability.** The agent prompt is not directly testable by `node --test`. The deterministic rules live in a JavaScript helper module (`src/lib/gdpr-helpers.js`) that both the agent (by reference) and the tests target directly. Coverage targets (≥80%) apply to `gdpr-helpers.js`, not to the agent markdown.

**Naming collision resolved.** There was previously an agent file at `agents/compliance/gdpr-compliance-checker.md` (the old wrapper). That file is subsumed by this slice: `gdpr-agent.md` replaces it as the plan-ancestry-capable Tier-2 agent. If the old wrapper exists, it is removed as part of this implementation (logged in `## Decisions Taken Under Ambiguity`).

The agent gates on EC1: `shouldRunGdpr(projectRoot)` must return `true` before any work is done.

### Current State

`skills/compliance/gdpr-compliance-checker/SKILL.md` exists and is complete. The `gdpr_article` enum in the letter schema lists: `"GDPR-7"`, `"GDPR-13"`, `"GDPR-14"`, `"GDPR-15"`, `"GDPR-17"`, `"GDPR-20"`, `"GDPR-28"`, `"GDPR-30"`, `"GDPR-33"`, `"GDPR-34"`, `"GDPR-37"`, `"GDPR-Chapter-V"`. Articles 6 and 9 are discussed in the skill body but not in the enum. `src/lib/gdpr-helpers.js` does not exist. `agents/compliance/gdpr-agent.md` does not exist.

### Impact

Every project with `gdpr` in `active_profiles` gets GDPR obligations flagged at the plan stage, before implementation begins. Obligations that would otherwise appear at code review as surprises become plan-level requirements that the implementation planner incorporates from the start.

---

## 2. ALIGN

### Business Goals

**Goal:** Surface GDPR obligations at the plan stage (as requirements) and at the code stage (as gap findings), gated by the regulatory-regime system, without duplicating the skill's rule set.

**Job to Be Done:** When I am reviewing a functional plan that collects personal data or modifies a user-deletion flow, I want the GDPR agent to read the plan and tell me which GDPR Articles it triggers, so that I can treat those obligations as plan requirements rather than code-review surprises.

**Impact Map:**
- **Goal:** GDPR compliance surfaced left in the pipeline — at the plan stage, not the code stage.
- **Actor:** CTO Chief dispatching compliance review; project owner reading findings attached to their plan before `todo`.
- **Impact:** Plan-stage findings convert GDPR obligations into traceable plan requirements; code-stage findings catch remaining gaps — both without duplicating the skill's rule set.
- **Deliverable:** `agents/compliance/gdpr-agent.md` + `src/lib/gdpr-helpers.js` (deterministic PII→Article mapping, output-schema validator, letter emitter with severity normalization).

### Success Metrics

1. Given a functional plan mentioning a PII field (`email`, `ipAddress`), the agent emits a plan-stage finding naming the triggered Articles (GDPR-13, GDPR-6, GDPR-17) with `confidence: medium` or `low`.
2. `gdpr_article` values `"GDPR-6"` and `"GDPR-9"` are added to the skill's letter-schema enum and to `gdpr-helpers.js` — the agent never mints codes the schema rejects.
3. All findings on the wire have `severity: critical` — normalized by `gdpr-helpers.js` emitter, asserted by a unit test.
4. Agent runs only when `shouldRunGdpr(projectRoot)` returns `true`; when the profile is absent, the agent produces no output and makes no file reads.
5. Findings surface via the Inbox (`src/lib/inbox.js`) as a plan-stage Inbox attachment — not via the refinement-loop letter path (which requires `file` and `line` code coordinates a plan-stage finding does not have). Code-stage findings (which do have `target_file`/`target_line`) continue to use the refinement-loop letter.

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
**I want** all compliance rules to live exclusively in `skills/compliance/gdpr-compliance-checker/SKILL.md` and `src/lib/gdpr-helpers.js`,
**so that** two authoritative sources exist (skill = narrative rules + BAD/SAFE examples; helpers = deterministic machine-checkable rules) and the agent diverges from neither.

**As a** security maintainer,
**I want** every finding on the Inbox wire and the letter wire to have `severity: critical`,
**so that** the warnings-are-critical contract is provably maintained across plan-stage and code-stage findings.

### BDD Scenarios

- [ ] **Scenario: Plan mentions email — GDPR-13 + GDPR-6 + GDPR-17 triggered**
  Given `gdpr` is in `active_profiles`
  And a functional plan whose body mentions collecting an email address from a user
  When the GDPR agent reads the plan ancestry
  Then `gdpr-helpers.js` `mapPiiFieldToArticles('email')` returns `["GDPR-6", "GDPR-13", "GDPR-17"]`
  And the agent emits at least one Inbox finding per triggered Article
  And each finding has `confidence: medium` (named PII field present in plan text)

- [ ] **Scenario: Plan describes Article 9 special-category data — GDPR-9 finding**
  Given `gdpr` is in `active_profiles`
  And a functional plan mentions collecting health or biometric data
  When the GDPR agent reads the plan
  Then it emits a finding with `gdpr_article: "GDPR-9"` and `severity: critical`
  And the finding message notes an additional lawful basis beyond Art. 6 is required
  And `"GDPR-9"` is a valid value in the skill's `gdpr_article` enum (added by this slice)

- [ ] **Scenario: Plan describes a US-hosted analytics SDK — Chapter V transfer finding**
  Given `gdpr` is in `active_profiles`
  And a functional plan names a US-hosted analytics provider without stating a transfer mechanism
  When the GDPR agent reads the plan
  Then it emits a finding with `gdpr_article: "GDPR-Chapter-V"`, `kind: non-eu-transfer-without-sccs-dpf`, `confidence: medium`

- [ ] **Scenario: Code scan detects soft-delete with no purge — critical finding**
  Given `gdpr` is in `active_profiles`
  And a source file contains a soft-delete pattern with no hard-purge schedule
  When the GDPR agent runs the code scan via the skill's rule set
  Then it emits a finding with `kind: soft-delete-no-purge-schedule`, `gdpr_article: "GDPR-17"`, `severity: critical`, `confidence: high`
  And the finding is routed via the refinement-loop letter (code-stage finding has `target_file` + `target_line`)

- [ ] **Scenario: Code scan detects missing consent banner — critical finding**
  Given `gdpr` is in `active_profiles`
  And a source file initialises an analytics SDK before any consent gate
  When the GDPR agent runs the code scan
  Then it emits a finding with `kind: missing-consent-banner`, `gdpr_article: "GDPR-7"`, `severity: critical`

- [ ] **Scenario: Code scan detects missing data-export endpoint — critical finding**
  Given `gdpr` is in `active_profiles`
  And the codebase has no authenticated self-service data-export endpoint (Art. 20)
  When the GDPR agent runs the code scan
  Then it emits a finding with `kind: missing-data-export-endpoint`, `gdpr_article: "GDPR-20"`, `severity: critical`, `confidence: high`

- [ ] **Scenario: Profile absent — agent produces no output**
  Given `gdpr` is NOT in `active_profiles`
  When the GDPR agent is evaluated (regardless of whether `eu-ai-act-high-risk` is active)
  Then it exits immediately without reading any files, emitting any findings, or making any tool calls

- [ ] **Scenario: gdpr-helpers.js severity normalizer — all emitted findings have severity: critical**
  Given any finding produced by the plan-stage or code-stage logic
  When the finding passes through `gdpr-helpers.js` `normalizeSeverity(finding)`
  Then `finding.severity === "critical"` is asserted
  And a unit test provides a sample finding with `severity: "medium"` and asserts the normalizer upgrades it to `"critical"`

- [ ] **Scenario: gdpr-helpers.js output-schema validator rejects unknown gdpr_article**
  Given a finding with `gdpr_article: "GDPR-99"` (not in the schema enum)
  When `gdpr-helpers.js` `validateFindingSchema(finding)` is called
  Then it throws a validation error naming the unknown article code
  And the finding is not emitted to the Inbox or letter

- [ ] **Scenario: GDPR-6 and GDPR-9 are valid enum values in the skill's letter schema**
  Given `skills/compliance/gdpr-compliance-checker/SKILL.md` after this slice's changes
  When `gdpr-helpers.js` `VALID_GDPR_ARTICLES` set is compared to the skill's `gdpr_article` enum
  Then both contain `"GDPR-6"` and `"GDPR-9"` as valid values
  And no finding emitting `"GDPR-6"` or `"GDPR-9"` is rejected by schema validation

- [ ] **Scenario: No rule from the skill is re-stated in the agent**
  Given the agent file `agents/compliance/gdpr-agent.md`
  When a reviewer compares it to `skills/compliance/gdpr-compliance-checker/SKILL.md`
  Then no PII field list, no Article check logic, no BAD/SAFE example, and no letter-schema field definition appears in the agent file
  And the agent delegates code-rule evaluation to the skill by reference and machine-checkable rules to `gdpr-helpers.js`

- [ ] **Scenario: Plan-stage findings route via Inbox, code-stage findings route via refinement-loop letter**
  Given a plan-stage finding (no `target_file`, no `target_line`) and a code-stage finding (has `target_file` + `target_line`)
  When `gdpr-helpers.js` `routeFinding(finding)` is called on each
  Then the plan-stage finding returns `{ route: "inbox" }`
  And the code-stage finding returns `{ route: "letter" }`

---

## Scope

### In Scope

- `agents/compliance/gdpr-agent.md` — new Tier-2 specialist agent; wraps the existing skill; adds plan-ancestry reading; gates on `shouldRunGdpr(projectRoot)` from EC1; max_subagents: 0 (plan-ancestry reading is done by the agent itself, not a spawned subagent); plan-ancestry reading stays in the agent layer.
- `src/lib/gdpr-helpers.js` — new JavaScript module containing:
  - `VALID_GDPR_ARTICLES` set (the full enum including `GDPR-6` and `GDPR-9`)
  - `PII_FIELD_TO_ARTICLES` map (`email` → `["GDPR-6", "GDPR-13", "GDPR-17"]`, etc.)
  - `mapPiiFieldToArticles(fieldName)` — deterministic lookup
  - `normalizeSeverity(finding)` — sets `severity: "critical"` unconditionally
  - `validateFindingSchema(finding)` — asserts `gdpr_article` is in `VALID_GDPR_ARTICLES`, throws on unknown code
  - `routeFinding(finding)` — returns `{ route: "inbox" }` when `target_file` is absent, `{ route: "letter" }` when present
- `skills/compliance/gdpr-compliance-checker/SKILL.md` — additive change only: add `"GDPR-6"` and `"GDPR-9"` to the `gdpr_article` enum in the letter schema section, with narrative already present in the skill body.
- `.ctoc/operations-registry.yaml` entry for `gdpr-agent`.
- Plan-stage confidence: `medium` for named PII field, `low` for contextual description only.
- Unit test (`tests/gdpr-agent.test.js`): all JS helper functions in `gdpr-helpers.js` (PII→Article map, severity normalizer, schema validator, router); GDPR-6/GDPR-9 enum-valid assertion; plan-stage triggering scenarios using fixture files from EC6; mode-absent no-op; code-stage routing.

### Out of Scope

- Web-sourced remediation options (EC4).
- Iron Loop dispatch wiring (EC5).
- NIST AI RMF or ISO 42001 checks — owned by `ai-governance-checker` skill.
- New human gate — explicitly excluded; this slice is advisory findings only.
- Rectification (Art. 16) or objection (Art. 21) endpoint checks — skill concern if absent from SKILL.md.
- DPO appointment threshold analysis (Art. 37) beyond what the skill currently provides.

---

## Risks

### Technical Risks

- **Plan-prose ambiguity produces false positives at `confidence: medium`:** A plan that mentions "email notifications" may be flagged for Art. 13 collection obligations when the email is not collected from the user in this plan.
  - Likelihood: MEDIUM
  - Impact: LOW (false positives are advisory findings; user can waive in `## Decisions Taken Under Ambiguity`)
  - Mitigation: Use `confidence: low` for contextual mentions (no explicit PII field from `PII_FIELD_TO_ARTICLES` map present) and `confidence: medium` only when a mapped PII field name appears verbatim. Document the heuristic in `gdpr-agent.md`.

- **Schema extension to SKILL.md must not break existing tests:** Adding `"GDPR-6"` and `"GDPR-9"` to the letter schema enum is additive; existing tests should not fail. But if any test asserts the enum is exactly a fixed list, it will fail.
  - Likelihood: LOW (additive enum extension; no existing value is removed or renamed)
  - Impact: MEDIUM (failing existing tests blocks the slice)
  - Mitigation: Scan existing `tests/*.test.js` for literal assertions on the `gdpr_article` enum before implementing; update any such assertion to include the new values. Document the change in the commit message.

### Business Risks

- **Regulatory citation drift:** GDPR = Regulation (EU) 2016/679 is stable law, but EDPB interpretive guidance evolves.
  - Likelihood: LOW
  - Impact: MEDIUM (stale guidance could lead to incorrect risk ratings)
  - Mitigation: Runtime date/threshold verification is delivered by EC4. Pre-EC4, the agent emits the skill's documented obligations only. No obligation is asserted beyond what `SKILL.md` already states.

### Dependency Risks

- **EC1 must ship first:** `shouldRunGdpr()` requires EC1 to be live.
  - Likelihood: HIGH (structural dependency)
  - Impact: HIGH (agent cannot gate correctly without EC1)
  - Mitigation: `tests/gdpr-agent.test.js` stubs `shouldRunGdpr()` for unit isolation; integration tests require real EC1.

---

## Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) — EC4, EC5, EC6 all depend on this slice for GDPR findings; EC1 must precede it.
- Business Impact: HIGH (3) — directly implements the "compliance is context" principle for GDPR (Regulation (EU) 2016/679); most EU-facing projects are primarily subject to GDPR.
- Technical Risk: MEDIUM (2) — plan-ancestry reading is novel for skills but the letter schema and code-scan rules are already fully specified in the existing skill; the JS helper layer is the new testable boundary.

---

## Decisions Taken Under Ambiguity

- **Agent naming.** Decision: the new agent is `gdpr-agent` (not `gdpr-compliance-checker`). The skill retains the name `gdpr-compliance-checker`. These are distinct artifacts: skill = code-scan rule set and letter-schema authority; agent = plan-ancestry-capable Tier-2 wrapper. If `agents/compliance/gdpr-compliance-checker.md` exists as an old wrapper, it is removed and replaced by `gdpr-agent.md`. This is documented in the commit that implements this slice.
- **Hybrid testability via `gdpr-helpers.js`.** Decision: deterministic rules (PII→Article map, severity normalizer, schema validator, finding router) live in a JS module, not in the agent markdown. The JS module is the test target. The agent markdown orchestrates these helpers. Coverage targets apply to the JS file, not the agent file. Agent-prompt behavior is covered by fixtures and manual review (EC6 scope).
- **GDPR-6 and GDPR-9 in the letter schema.** Decision: add both to the skill's `gdpr_article` enum. The skill body already discusses Art. 6 (lawful basis) and Art. 9 (special categories) extensively; their absence from the enum is a gap. The addition is strictly additive and does not break existing findings.
- **Plan-stage findings via Inbox, not refinement-loop letter.** Decision: the refinement-loop letter schema (`.ctoc/architecture/refinement-loop-schema.json`) uses `(file, line)` as dedup coordinates — a plan-stage finding has neither. Routing plan-stage findings through the letter path would require inventing fake coordinates, which is incorrect. Instead, plan-stage findings are surfaced as Inbox attachments (`src/lib/inbox.js`). Code-stage findings (which have `target_file` + `target_line`) continue to use the letter path. `gdpr-helpers.js` `routeFinding()` makes this routing deterministic and testable.
- **`max_subagents: 0` preserved.** Decision: plan-ancestry reading is done by the agent itself (sequential file reads). The skill's `max_subagents: 0` is not changed. This matches the skill's documented `parallel_safe: true` — the agent can be dispatched in parallel with other agents, but it does not itself spawn subagents.
- **Severity claim corrected.** The real refinement-loop schema permits severity `critical`, `medium`, and `low` — it does not reject non-critical. This slice does not assert that the schema rejects non-critical severity. Instead: the agent normalizes all emitted findings to `severity: critical` via `normalizeSeverity()`, and a unit test asserts this behavioral contract at the emitter output level. The schema merely happens to accept critical (which is what the agent always emits).

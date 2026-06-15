---
title: "EC1 — compliance.mode setting + ride-along gate question"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: eu-compliance-agents-gdpr-ai-act
program: ctoc-eu-compliance
order: 1
depends_on: []
files:
  - src/lib/settings.js
  - src/commands/menu.js
  - .ctoc/settings.json
  - .ctoc/settings.yaml
  - tests/compliance-mode.test.js
status: refined
acceptance_criteria_count: 9
risk_level: MEDIUM
---

# EC1 — compliance.mode setting + ride-along gate question

## 1. ASSESS

### Business Context

CTOC has no per-project notion of which EU regulatory regimes apply. Every project is treated identically — the existing `gdpr-compliance-checker` and `ai-governance-checker` skills run (or do not run) regardless of whether the project is an internal tool, a consumer SaaS, or a high-risk AI system. The vision's Problem #4 names this gap explicitly. A purely internal tool, a consumer SaaS, and a high-risk AI system have wildly different obligations; conflating them produces noise for projects that have no EU exposure and silence for projects that need full GDPR + EU AI Act coverage.

`compliance.mode` is the foundation every downstream EC slice depends on. EC2 and EC3 gate on it before running. EC5 reads it to decide which agent(s) to dispatch. Without it, every downstream slice is ungated.

### Current State

`src/lib/settings.js` models settings under `SETTINGS_SCHEMA` with tabs: `general`, `agents`, `workflow`, `learning`, `git`, `privacy`. The `general.environment` key is the canonical precedent: it uses an explicit-user-setting > default resolution rule, is asked as a non-blocking ride-along question on first dashboard open, and is never re-prompted once set. `.ctoc/settings.json` is the canonical JSON store; `.ctoc/settings.yaml` carries flat mirrors (`enforcement.mode`, `regulatory_regime`) that hook/library code reads without a YAML parser.

There is no `compliance.mode` key anywhere in the schema today.

### Impact

Without this slice, no compliance agent can gate correctly. The two downstream agents (EC2, EC3) would either run on every project (noise, wrong) or never run (useless). This is the single prerequisite for the entire EU compliance program; its priority is HIGH and it blocks EC2, EC3, and EC5.

---

## 2. ALIGN

### Business Goals

**Goal:** Provide each project with a declared EU regulatory scope so CTOC compliance work is accurate (not over-broad for non-EU projects, not silent for EU projects).

**Job to Be Done:** When I am setting up a CTOC project for a client whose data-processing obligations I know, I want to declare the applicable EU regime once, so that CTOC scopes all compliance checks to it rather than running all-or-nothing.

**Impact Map:**
- **Goal:** Per-project compliance scope — only the opted-in regime's agents run.
- **Actor:** Project owner / CTO Chief configuring a new or existing CTOC project.
- **Impact:** Non-EU / internal-only projects gain a silent, zero-noise baseline (`none`). EU-scoped projects get the correct agent(s) running without having to remember to invoke them manually.
- **Deliverable:** `compliance.mode` setting in schema + ride-along prompt + resolver API (`getComplianceMode()`, `shouldRunGdpr()`, `shouldRunAiAct()`).

### Success Metrics

1. `compliance.mode` is present in `SETTINGS_SCHEMA` with valid values `gdpr | eu-ai-act | both | none` and default `none`.
2. First dashboard open with no stored value prompts once, non-blocking (dashboard renders regardless of answer).
3. Once set, never re-prompted; resolution is explicit user setting > default.
4. `getComplianceMode()` returns the resolved value; `shouldRunGdpr()` / `shouldRunAiAct()` return correct booleans for all four values.
5. `compliance.mode` cannot weaken any human gate (Gate 0–3).
6. Setting persists in `.ctoc/settings.json` (canonical) and is mirrored to `.ctoc/settings.yaml` as `compliance_mode` flat key.

### Stakeholders

- **Project owner** — wants the prompt to be unobtrusive, asked once.
- **EC2/EC3/EC5 implementers** — consume the resolver API; they must not re-implement the resolution logic.
- **Security maintainer** — needs a test asserting gate logic is untouched.

### Constraints

- Must mirror the `general.environment` ride-along pattern exactly — no new modal, no dashboard-blocking question.
- Default `none` is non-negotiable: backward-compatible for all existing projects.
- Resolution rule: explicit user setting > default. No environment-profile override (a regulatory regime is a legal fact, not a behavior profile).
- The setting must never weaken a human gate — enforced the same way `tests/environment-mode.test.js` enforces it for environment profiles.
- Cross-platform: `path.join`, `fs.promises`, no bash entry points.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** project owner configuring a CTOC project,
**I want** a `compliance.mode` setting with values `gdpr | eu-ai-act | both | none` (default `none`),
**so that** non-EU / internal-only projects are unaffected by compliance agents and EU projects opt in explicitly.

**As a** project owner on first dashboard open,
**I want** the compliance regime question asked once as a non-blocking ride-along (identical to the runtime-environment question),
**so that** the dashboard always renders immediately and I am not repeatedly prompted.

**As a** downstream agent author (EC2/EC3/EC5),
**I want** a resolver function `getComplianceMode()` returning `gdpr | eu-ai-act | both | none` and helpers `shouldRunGdpr()` / `shouldRunAiAct()`,
**so that** every consumer gates consistently from a single source of truth.

**As a** security maintainer,
**I want** a test asserting that `compliance.mode` cannot alter gate transitions, enforcement mode, or `requireReviewGate`,
**so that** Gate 0–3 safety is provably intact after this change.

### BDD Scenarios

- [ ] **Scenario: Default value when setting is absent**
  Given a project with no `compliance.mode` stored in `.ctoc/settings.json`
  When `getComplianceMode()` is called
  Then it returns `"none"`
  And `shouldRunGdpr()` returns `false`
  And `shouldRunAiAct()` returns `false`

- [ ] **Scenario: Ride-along prompt on first dashboard open**
  Given a project with no `compliance.mode` stored
  When the dashboard renders for the first time
  Then a non-blocking compliance-regime question is displayed (dashboard is fully rendered before and after the question)
  And the question offers options: `none`, `gdpr`, `eu-ai-act`, `both`

- [ ] **Scenario: No re-prompt after mode is set**
  Given `compliance.mode` is stored as `gdpr` in `.ctoc/settings.json`
  When the dashboard renders on any subsequent open
  Then no compliance-regime prompt appears
  And `getComplianceMode()` returns `"gdpr"`

- [ ] **Scenario: Resolver truth table — gdpr**
  Given `compliance.mode` is `"gdpr"`
  When `shouldRunGdpr()` and `shouldRunAiAct()` are called
  Then `shouldRunGdpr()` returns `true`
  And `shouldRunAiAct()` returns `false`

- [ ] **Scenario: Resolver truth table — eu-ai-act**
  Given `compliance.mode` is `"eu-ai-act"`
  When `shouldRunGdpr()` and `shouldRunAiAct()` are called
  Then `shouldRunGdpr()` returns `false`
  And `shouldRunAiAct()` returns `true`

- [ ] **Scenario: Resolver truth table — both**
  Given `compliance.mode` is `"both"`
  When `shouldRunGdpr()` and `shouldRunAiAct()` are called
  Then `shouldRunGdpr()` returns `true`
  And `shouldRunAiAct()` returns `true`

- [ ] **Scenario: Setting persists to JSON and mirrors to YAML**
  Given the user selects `"both"` in the ride-along prompt
  When the choice is saved
  Then `.ctoc/settings.json` contains `compliance.mode: "both"` (or `general.complianceMode: "both"` per schema tab placement)
  And `.ctoc/settings.yaml` contains `compliance_mode: "both"` as a flat key
  And re-reading the setting from either file returns `"both"`

- [ ] **Scenario: Invalid stored value falls back to default**
  Given `.ctoc/settings.json` contains `compliance.mode: "unknown-value"`
  When `getComplianceMode()` is called
  Then it returns `"none"` (safe default)
  And no exception is thrown

- [ ] **Scenario: Gate invariant — compliance.mode cannot weaken gates**
  Given `compliance.mode` is set to any value including `"both"`
  When gate transition logic in `src/hooks/human-gate-check.js` is evaluated
  Then `requireReviewGate` is unchanged
  And the gate count remains exactly 4 (Gate 0–3)
  And `enforcementMode` is unaffected by the compliance setting

---

## Scope

### In Scope

- `compliance.mode` key added to `SETTINGS_SCHEMA` under the existing `general` tab (one setting; no new tab until EC2–EC6 introduce more compliance toggles).
- Valid values: `gdpr | eu-ai-act | both | none`; default `none`.
- Ride-along prompt in `src/commands/menu.js` mirroring the `general.environment` mechanism: asked once, non-blocking, never re-prompts.
- Persistence to `.ctoc/settings.json` (canonical JSON store).
- Mirror to `.ctoc/settings.yaml` as flat key `compliance_mode` (derived, JSON is canonical).
- Resolver API exported from `src/lib/settings.js`: `getComplianceMode()`, `shouldRunGdpr()`, `shouldRunAiAct()`.
- Unit test (`tests/compliance-mode.test.js`): full truth table for resolver, persistence round-trip, ride-along-no-re-prompt, invalid-value fallback, gate-invariant assertion.

### Out of Scope

- GDPR agent implementation (EC2).
- EU AI Act agent implementation (EC3).
- Recommendation layer / web search (EC4).
- Iron Loop dispatch wiring (EC5).
- A dedicated "Compliance" settings tab — deferred until there are ≥3 compliance-specific settings.
- Any UI beyond the single ride-along question (a full compliance settings screen is a future enhancement).
- Per-environment override of `compliance.mode` — regulatory regime is a legal fact, not a profile toggle; environment profiles (`dev/staging/prod`) do not override it.

---

## Risks

### Technical Risks

- **Schema migration for existing projects:** Projects that have `.ctoc/settings.json` without `compliance.mode` must receive `none` transparently on first read, with no crash or prompt loop.
  - Likelihood: MEDIUM (common scenario — all existing projects lack the key)
  - Impact: MEDIUM (broken dashboard on upgrade for existing projects)
  - Mitigation: Implement getComplianceMode() with an explicit `?? 'none'` fallback and add a migration test fixture using a pre-existing settings.json without the key.

- **YAML mirror drift:** If `settings.json` is updated but `settings.yaml` mirror write fails (e.g. file locked), hook/library code reads a stale value.
  - Likelihood: LOW (file locking is rare; both files live in `.ctoc/`)
  - Impact: HIGH (hook reads wrong mode, compliance agents run or don't run incorrectly)
  - Mitigation: Wrap the YAML mirror write in a try-catch that logs to `.ctoc/logs/enforcement.json` and alerts the user; treat write failure as a WARNING-level finding (not silent).

### Business Risks

- **User confusion about which regime applies:** A project owner may not know whether their project is subject to GDPR, the EU AI Act, both, or neither.
  - Likelihood: MEDIUM (EU compliance scope requires legal knowledge)
  - Impact: LOW (choosing `none` is safe-by-default; they can update later)
  - Mitigation: Include a one-line hint per option in the ride-along prompt (e.g. "`gdpr` — processes EU personal data; `eu-ai-act` — deploys AI systems in the EU market") so the choice is informed without requiring legal counsel at prompt time.

### Dependency Risks

- **No blockers:** EC1 has no `depends_on`. All other EC slices depend on this one.
  - Likelihood: LOW
  - Impact: HIGH (all downstream slices blocked if EC1 ships broken)
  - Mitigation: Ship EC1 with full unit tests before any EC2–EC6 implementation starts; treat a failing `compliance-mode.test.js` as a release blocker.

---

## Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) — EC2, EC3, EC5, and EC6 all depend on this slice; nothing else in the program ships correctly without it.
- Business Impact: HIGH (3) — enables the entire per-project compliance scoping vision; default `none` makes it backward-compatible for all existing projects.
- Technical Risk: MEDIUM (2) — well-understood pattern (mirrors `general.environment`); main risk is schema migration for existing projects, which is straightforward to handle.

---

## Decisions Taken Under Ambiguity

- **Where the setting lives.** Vision says "a new project setting — `compliance.mode`". `src/lib/settings.js` notes safety-critical hooks read `regulatory_regime` from the flat `.ctoc/settings.yaml`, while the menu-driven store is `.ctoc/settings.json`. Decision: store the menu-facing `compliance.mode` in `settings.json` (consistent with `general.environment`), and ALSO mirror it to the flat `compliance_mode` key in `settings.yaml` so non-YAML-library hook/library code can read it fast. The JSON value is canonical; the YAML mirror is derived. Rationale: keeps the two documented config sources coherent and avoids a YAML parser in hook paths.
- **New `compliance` tab vs. `general` key.** Decision: add the key under the existing `general` tab (one setting, no need for a tab yet). Revisit if EC2–EC6 introduce more compliance toggles.
- **Default value.** Decision: `none`, per vision ("default for non-EU/internal-only projects"). Backward-compatible — existing projects keep all-quiet behavior.
- **Resolution rule.** Decision: explicit user setting > default (mirrors `general.environment`); no environment-profile override for this key, because a regulatory regime is a legal fact about the project, not a behavior profile.

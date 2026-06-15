---
title: "EC1 — Regulatory-regime compliance gating + ride-along profile activation"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: eu-compliance-agents-gdpr-ai-act
program: ctoc-eu-compliance
order: 1
depends_on: []
files:
  - src/lib/regulatory-regime.js
  - src/lib/compliance-regime.js
  - src/commands/menu.js
  - .ctoc/settings.yaml
  - .ctoc/regulatory-regimes/gdpr.yaml
  - tests/compliance-mode.test.js
status: refined
acceptance_criteria_count: 10
risk_level: MEDIUM
---

# EC1 — Regulatory-regime compliance gating + ride-along profile activation

## 1. ASSESS

### Business Context

CTOC already ships a regulatory-regime profile system (`src/lib/regulatory-regime.js`) with `loadActiveProfiles`, `effectiveControls`, `isControlEnabled`, `regimeSummary`, and `listAvailableProfiles`. Profiles are declared in `.ctoc/settings.yaml` under `regulatory_regime.active_profiles` and resolved from YAML files under `.ctoc/regulatory-regimes/`. The `eu-ai-act-high-risk` profile exists. No GDPR profile exists.

The earlier design invented a `compliance.mode` flat setting with its own schema entry, its own resolver API, and a mirror write to `settings.yaml`. That design creates a second source of truth alongside the existing regime system and must be replaced.

The correct design: `shouldRunGdpr()` and `shouldRunEuAiAct()` are derived directly from `regulatory_regime.active_profiles` via `loadActiveProfiles(projectRoot)`. A `gdpr` profile YAML is added as a first-class regime alongside `eu-ai-act-high-risk`. The ride-along question activates the relevant profile(s) by adding them to `active_profiles` in `settings.yaml`. There is no `compliance.mode` key and no `settings.json` mirror.

This is the single source of truth: `regulatory_regime.active_profiles` in `.ctoc/settings.yaml`.

### Current State

`src/lib/regulatory-regime.js` exports `loadActiveProfiles(projectRoot)` returning `{ profiles: string[], overrides: {} }`. `.ctoc/settings.yaml` has `regulatory_regime.active_profiles: []` as the default. `.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml` exists. No `gdpr.yaml` profile exists. The menu has no ride-along question for EU compliance profiles.

### Impact

Without this slice, no compliance agent can gate correctly. EC2 and EC3 call `shouldRunGdpr()` / `shouldRunEuAiAct()` — these functions do not exist until EC1 ships them, derived from the regime system. Default (empty `active_profiles`) correctly maps to all-false, preserving backward compatibility.

---

## 2. ALIGN

### Business Goals

**Goal:** Per-project EU compliance scoping via the existing regulatory-regime system, so compliance agents gate on a single, auditable source of truth.

**Job to Be Done:** When I am setting up a CTOC project for a client whose data-processing obligations I know, I want to activate the relevant EU regime profile once, so that CTOC scopes all compliance checks to it rather than running all-or-nothing.

**Impact Map:**
- **Goal:** Per-project compliance scope — only the opted-in regime's agents run — derived from `regulatory_regime.active_profiles`.
- **Actor:** Project owner / CTO Chief configuring a new or existing CTOC project.
- **Impact:** Non-EU / internal-only projects keep an empty `active_profiles` (zero noise). EU-scoped projects activate a named profile (gdpr, eu-ai-act-high-risk, or both) via the ride-along question, and the resolver API returns correct booleans.
- **Deliverable:** `gdpr.yaml` profile + `src/lib/compliance-regime.js` resolver module + ride-along prompt in `menu.js` that writes to `active_profiles`.

### Success Metrics

1. `shouldRunGdpr()` returns `true` when `gdpr` appears in `active_profiles`; `false` otherwise.
2. `shouldRunEuAiAct()` returns `true` when `eu-ai-act-high-risk` appears in `active_profiles`; `false` otherwise.
3. First dashboard open with neither profile active prompts once, non-blocking.
4. Once a profile is activated, never re-prompted.
5. `shouldRunGdpr()` / `shouldRunEuAiAct()` cannot weaken any human gate (Gate 0–3).
6. Default (empty `active_profiles`) returns `false` for both — backward-compatible for all existing projects.
7. The gate-invariant test from EC6 passes after this slice ships.

### Constraints

- **One source of truth.** `regulatory_regime.active_profiles` in `.ctoc/settings.yaml` is canonical. No `compliance.mode` key. No `settings.json` mirror. No shadow copy. `loadActiveProfiles()` is the only reader.
- **No new modal, no dashboard-blocking.** Ride-along question mirrors the `general.environment` mechanism.
- **Default is empty active_profiles.** Backward-compatible — existing projects keep all-quiet behavior.
- **Resolution rule.** `shouldRunGdpr()` = `profiles.includes('gdpr')`. `shouldRunEuAiAct()` = `profiles.includes('eu-ai-act-high-risk')`. No env-profile override.
- **Cross-platform.** `path.join`, `fs.promises`, no bash entry points.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** project owner configuring a CTOC project,
**I want** a ride-along question that activates the `gdpr` and/or `eu-ai-act-high-risk` profile in `regulatory_regime.active_profiles`,
**so that** non-EU / internal-only projects are unaffected and EU projects opt in explicitly via the existing regime system.

**As a** downstream agent author (EC2/EC3/EC5),
**I want** `shouldRunGdpr()` and `shouldRunEuAiAct()` from `src/lib/compliance-regime.js` derived directly from `loadActiveProfiles()`,
**so that** every consumer gates consistently from one source of truth with no shadow config.

**As a** security maintainer,
**I want** a test asserting that activating compliance profiles cannot alter gate transitions, enforcement mode, or `requireReviewGate`,
**so that** Gate 0–3 safety is provably intact after this change.

### BDD Scenarios

- [ ] **Scenario: Default value — empty active_profiles means both functions return false**
  Given a project with `regulatory_regime.active_profiles: []` in `.ctoc/settings.yaml`
  When `shouldRunGdpr(projectRoot)` and `shouldRunEuAiAct(projectRoot)` are called
  Then both return `false`
  And no exception is thrown

- [ ] **Scenario: gdpr profile active — shouldRunGdpr returns true**
  Given `regulatory_regime.active_profiles` contains `gdpr`
  When `shouldRunGdpr(projectRoot)` is called
  Then it returns `true`
  And `shouldRunEuAiAct(projectRoot)` returns `false`

- [ ] **Scenario: eu-ai-act-high-risk profile active — shouldRunEuAiAct returns true**
  Given `regulatory_regime.active_profiles` contains `eu-ai-act-high-risk`
  When `shouldRunEuAiAct(projectRoot)` is called
  Then it returns `true`
  And `shouldRunGdpr(projectRoot)` returns `false`

- [ ] **Scenario: Both profiles active — both functions return true**
  Given `regulatory_regime.active_profiles` contains both `gdpr` and `eu-ai-act-high-risk`
  When both resolver functions are called
  Then `shouldRunGdpr(projectRoot)` returns `true`
  And `shouldRunEuAiAct(projectRoot)` returns `true`

- [ ] **Scenario: Ride-along prompt on first dashboard open**
  Given a project with `regulatory_regime.active_profiles: []`
  When the dashboard renders for the first time
  Then a non-blocking compliance-regime question is displayed (dashboard renders before and after)
  And the question offers: `none`, `gdpr`, `eu-ai-act`, `both`
  And selecting an option writes the relevant profile name(s) to `regulatory_regime.active_profiles` in `.ctoc/settings.yaml`

- [ ] **Scenario: No re-prompt after profile is activated**
  Given `regulatory_regime.active_profiles` contains `gdpr`
  When the dashboard renders on any subsequent open
  Then no compliance-regime prompt appears

- [ ] **Scenario: gdpr.yaml profile file is valid and loadable**
  Given `.ctoc/regulatory-regimes/gdpr.yaml` exists
  When `loadProfile(projectRoot, 'gdpr')` is called
  Then it returns an object with `name: "gdpr"`, `display_name`, `description`, `applies_to`, and `required_controls`
  And `listAvailableProfiles(projectRoot)` includes `"gdpr"` in its returned array

- [ ] **Scenario: Missing settings.yaml — no crash, both return false**
  Given a project with no `.ctoc/settings.yaml` file
  When `shouldRunGdpr(projectRoot)` is called
  Then it returns `false` without throwing
  And `shouldRunEuAiAct(projectRoot)` returns `false` without throwing

- [ ] **Scenario: Unknown profile name in active_profiles — graceful degradation**
  Given `regulatory_regime.active_profiles` contains `["unknown-regime"]`
  When `shouldRunGdpr(projectRoot)` and `shouldRunEuAiAct(projectRoot)` are called
  Then both return `false` (unknown profile does not activate either function)
  And no exception is thrown (the existing regime system's loadProfile returns null for unknown profiles)

- [ ] **Scenario: Gate invariant — activating compliance profiles cannot weaken gates**
  Given `regulatory_regime.active_profiles` contains both `gdpr` and `eu-ai-act-high-risk`
  When gate transition logic in `src/hooks/human-gate-check.js` is evaluated
  Then `requireReviewGate` is unchanged
  And the gate count remains exactly 4 (Gate 0–3)
  And `enforcementMode` is unaffected by the compliance profile settings

---

## Scope

### In Scope

- `.ctoc/regulatory-regimes/gdpr.yaml` — new regime profile file for GDPR (Regulation (EU) 2016/679); modeled after `eu-ai-act-high-risk.yaml`; declares `name: gdpr`, `display_name`, `description`, `applies_to`, `authoritative_sources`, and `required_controls` (DSAR-relevant controls: `dsar_handler`, `retention_schedule`, `audit_hash_chain`).
- `src/lib/compliance-regime.js` — new module exporting `shouldRunGdpr(projectRoot)` and `shouldRunEuAiAct(projectRoot)`, both delegating to `loadActiveProfiles()` from `src/lib/regulatory-regime.js`. No schema, no JSON store, no mirror write.
- Ride-along prompt in `src/commands/menu.js`: asked once when `active_profiles` is empty, non-blocking, offers `none` / `gdpr` / `eu-ai-act` / `both`; writes the selected profile(s) to `regulatory_regime.active_profiles` in `.ctoc/settings.yaml`.
- Unit test (`tests/compliance-mode.test.js`): full truth table for resolver functions, ride-along-no-re-prompt, missing-settings graceful degradation, unknown-profile graceful degradation, gate-invariant assertion.

### Out of Scope

- GDPR agent implementation (EC2).
- EU AI Act agent implementation (EC3).
- Recommendation layer / web search (EC4).
- Iron Loop dispatch wiring (EC5).
- Any `compliance.mode` key in any settings file — this design is replaced entirely by regime profiles.
- Any `settings.json` mirror write — the canonical store is `settings.yaml` for regime data.
- A dedicated "Compliance" tab in the dashboard.
- Per-environment override of compliance profiles — regulatory regime is a legal fact, not a behavior profile.

---

## Risks

### Technical Risks

- **YAML write to settings.yaml from the ride-along prompt:** The ride-along prompt must write to `.ctoc/settings.yaml`, which is the safety-critical flat store read by hooks. A malformed write could break hook parsing.
  - Likelihood: LOW (the write is additive — appending to a list or updating `active_profiles`)
  - Impact: HIGH (broken `settings.yaml` breaks hook enforcement)
  - Mitigation: Write the update by reading the full file, modifying only the `active_profiles` line using a targeted string replacement (not a full YAML re-serialization), and verifying the file round-trips correctly in a post-write assertion. Add a test for the round-trip. Log write failure to `.ctoc/logs/enforcement.json`.

- **loadActiveProfiles path resolution:** `src/lib/regulatory-regime.js` reads from a relative path `'.ctoc/settings.yaml'`. The resolver functions must pass the correct `projectRoot` — callers that pass the wrong root silently return `false` rather than throwing.
  - Likelihood: LOW (the existing system uses `projectRoot` consistently)
  - Impact: MEDIUM (agents silently skip compliance checks thinking mode is none)
  - Mitigation: Document the `projectRoot` parameter requirement explicitly in the `compliance-regime.js` JSDoc. Add a test that passes an explicitly wrong root and asserts the graceful false return, not a crash.

### Business Risks

- **User confusion about which profile to activate:** A project owner may not know whether their project is subject to GDPR, the EU AI Act, both, or neither.
  - Likelihood: MEDIUM
  - Impact: LOW (empty profiles is safe-by-default; they can update `settings.yaml` later)
  - Mitigation: Include a one-line hint per option in the ride-along prompt (`gdpr` — processes EU personal data under Regulation (EU) 2016/679; `eu-ai-act` — deploys AI systems in the EU market under Regulation (EU) 2024/1689).

### Dependency Risks

- **No blockers:** EC1 has no `depends_on`. All other EC slices depend on this one.
  - Likelihood: LOW
  - Impact: HIGH (all downstream slices blocked if EC1 ships broken)
  - Mitigation: Ship EC1 with full unit tests before any EC2–EC6 implementation starts; treat a failing `compliance-mode.test.js` as a release blocker.

---

## Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) — EC2, EC3, EC5, and EC6 all call `shouldRunGdpr()` / `shouldRunEuAiAct()`; nothing else in the program ships correctly without it.
- Business Impact: HIGH (3) — enables the entire per-project compliance scoping vision; empty `active_profiles` makes it backward-compatible for all existing projects.
- Technical Risk: MEDIUM (2) — well-understood pattern (regime system already exists); main risk is the `settings.yaml` write, which is mitigated by targeted string replacement + round-trip test.

---

## Decisions Taken Under Ambiguity

- **No `compliance.mode` key.** The adversarial review identified that inventing a `compliance.mode` setting alongside the existing `regulatory_regime.active_profiles` creates two sources of truth and a mirror-drift risk. Decision: remove `compliance.mode` entirely. The resolver functions are derived from `loadActiveProfiles()`. The ride-along question writes directly to `active_profiles`. One source of truth.
- **New `src/lib/compliance-regime.js` module, not adding to `settings.js`.** Decision: add a thin compliance-specific module that wraps `loadActiveProfiles()` and exports `shouldRunGdpr()` and `shouldRunEuAiAct()`. This keeps the regulatory-regime system unchanged and adds a clear, testable API layer for compliance agents.
- **Profile name for GDPR.** Decision: `gdpr` (plain, matches the convention of `eu-ai-act-high-risk`). The ride-along maps user-visible option `gdpr` → profile name `gdpr`; option `eu-ai-act` → profile name `eu-ai-act-high-risk` (the existing profile).
- **`gdpr.yaml` required_controls.** Decision: include `dsar_handler`, `retention_schedule`, `audit_hash_chain` — the three controls most directly mandated by GDPR's operational obligations (DSAR workflow, data retention schedules, immutable audit trail for Art. 17/20/33 fulfilment). Additional GDPR controls can be added in a future profile revision as the skill matures.
- **Default.** Empty `active_profiles` maps to `false` for both resolver functions. Backward-compatible for all existing projects. No migration needed.

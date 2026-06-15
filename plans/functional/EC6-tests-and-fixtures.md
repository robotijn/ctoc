---
title: "EC6 — Tests & fixtures for the EU compliance agents"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: eu-compliance-agents-gdpr-ai-act
program: ctoc-eu-compliance
order: 6
depends_on:
  - EC1-compliance-mode-setting
  - EC2-gdpr-agent-plan-and-code
  - EC3-eu-ai-act-agent-plan-and-code
  - EC4-eu-solution-recommender
  - EC5-iron-loop-integration
files:
  - tests/compliance-mode.test.js
  - tests/gdpr-agent.test.js
  - tests/eu-ai-act-agent.test.js
  - tests/eu-solution-recommender.test.js
  - tests/compliance-iron-loop.test.js
  - tests/fixtures/compliance/pii-collecting-plan.md
  - tests/fixtures/compliance/annex-iii-ai-plan.md
  - tests/fixtures/compliance/prohibited-practice-plan.md
  - tests/fixtures/compliance/sample-pii-code.js
  - tests/fixtures/compliance/sample-ai-act-code.js
  - tests/fixtures/compliance/fixture-manifest.yaml
status: refined
acceptance_criteria_count: 13
risk_level: MEDIUM
---

# EC6 — Tests & fixtures for the EU compliance agents

## 1. ASSESS

### Business Context

Each of EC1–EC5 declared focused slice-local test files. Those unit tests verify each slice's internal logic in isolation (with stubs for cross-slice dependencies). What they do not cover is:

1. **Cross-slice integration:** the path from `regulatory_regime.active_profiles` → dispatch → agent run → findings attach → Inbox.
2. **Shared fixtures:** deterministic plan/code samples that trigger known findings — needed by both EC2 and EC3 tests, and by integration tests; without shared fixtures, each slice invents its own, leading to inconsistency.
3. **Safety invariants:** the single most important test this program must ship is the gate-invariant assertion — a continuous, automated proof that the four human gates (Gate 0–3) are unchanged.
4. **Warnings-are-critical wire contract:** a cross-slice assertion that `severity: critical` holds on the Inbox/letter wire for all findings, regardless of internal triage tier.

**Coverage targets apply to JS files, not agent markdown.** The ≥80% coverage target is scoped explicitly to: `src/lib/compliance-regime.js`, `src/lib/gdpr-helpers.js`, `src/lib/eu-ai-act-helpers.js`, `src/lib/eu-recommender-helpers.js`, `src/lib/compliance-dedup.js`. Agent prompt behavior (EC2/EC3/EC4 `.md` files) is covered by fixtures and manual review — it is not measurable by `node --test` coverage tooling.

**Web boundary is tested via injectable fetcher.** EC4's `eu-recommender-helpers.js` exposes a `createFetcher(webSearchFn, webFetchFn)` factory. Tests inject a stub fetcher. This is the correct pattern for `node --test` — you cannot mock `WebSearch`/`WebFetch` from the outside; you must inject them through the module's own interface.

**Gate-invariant test is owned by EC6.** EC1 and EC5 reference this test; EC6 implements it. It is the single compliance gate-invariant test, not duplicated across slices.

### Current State

`tests/*.test.js` contains 71 test files. The new compliance test files are declared in EC1–EC5 `files:` but do not exist. `tests/fixtures/compliance/` does not exist. `tests/architecture-invariants.test.js` and `tests/environment-mode.test.js` are the canonical models for invariant and mode-safety tests respectively. EC6 mirrors their patterns for the compliance domain.

### Impact

Without EC6, the compliance program ships without provable end-to-end behavior or provable gate safety. All four of these are non-negotiable for a regulatory-accuracy-sensitive feature that operates in a €20M–€35M penalty exposure domain.

---

## 2. ALIGN

### Business Goals

**Goal:** The EU compliance program ships with provable end-to-end behavior and provable gate safety, preventing regressions in a regulatory-accuracy-sensitive feature area.

**Job to Be Done:** When I run `node --test tests/*.test.js` after installing the EU compliance program, I want every test to pass and every safety invariant to hold, so that I can trust the program is correct and has not touched any gate logic.

**Impact Map:**
- **Goal:** `# fail 0` across all 71 + new compliance tests; gate invariant passes; ≥80% coverage on EC1–EC5 new JS files.
- **Actor:** CTOC maintainer running the test suite; CI pipeline verifying every commit.
- **Impact:** The regulatory-accuracy-sensitive compliance program is safe to ship; regressions are caught automatically before they reach the user.
- **Deliverable:** `tests/fixtures/compliance/` fixture library + five cross-slice integration test files + shared safety-invariant tests (gate count, mode-isolation, wire-contract).

### Success Metrics

1. `node --test tests/*.test.js` shows `# fail 0` with all new compliance test files included.
2. ≥80% coverage on `src/lib/compliance-regime.js`, `src/lib/gdpr-helpers.js`, `src/lib/eu-ai-act-helpers.js`, `src/lib/eu-recommender-helpers.js`, `src/lib/compliance-dedup.js`. Coverage is not asserted on agent `.md` files.
3. Gate-invariant test passes: gate count = 4, transitions unchanged, no compliance finding auto-reverts or auto-advances a plan.
4. Empty `active_profiles` no-op test passes: pipeline execution identical with and without empty profiles.
5. Wire-contract test passes: every finding emitted by EC2 or EC3 has `severity: critical` — asserted at the emitter output level (after `normalizeSeverity()` in the JS helpers).
6. Error-path tests pass: injectable-fetcher failure (EC4), malformed plan input (EC2/EC3), absent inventory (EC3) all produce findings or labeled fallbacks, not swallowed errors.
7. All fixtures documented in `tests/fixtures/compliance/fixture-manifest.yaml` with expected `finding.kind` outputs.

### Constraints

- **No live network in tests.** EC4's web boundary is tested via the injectable fetcher stub in `eu-recommender-helpers.js`. Tests inject a controlled fetcher; the real `WebSearch`/`WebFetch` tools are never called from `node --test`.
- **No empty catch blocks.** Every error path must assert an observable outcome. No `try { ... } catch {}` without a subsequent assertion.
- **No assertion-less tests.** Every test function has at least one `assert.*` call.
- **No skipped tests without a documented reason.** If a test cannot run in CI, it must be skipped with a comment explaining why.
- **Cross-platform.** Fixtures use `path.join(__dirname, 'fixtures', 'compliance', ...)` throughout. No hardcoded Unix paths.
- **Coverage target scoped to JS files.** `≥80%` on the five JS modules listed in Success Metrics. Statement in test runner configuration explicitly scopes the coverage target to these files (e.g., `--include 'src/lib/compliance-regime.js' --include 'src/lib/gdpr-helpers.js'` etc.).

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC maintainer running `node --test tests/*.test.js`,
**I want** all compliance tests to show `# fail 0` with ≥80% coverage on the five new JS modules from EC1–EC5,
**so that** the compliance program ships verified.

**As a** security maintainer,
**I want** a gate-invariant test that asserts the four human gates are unchanged after the compliance program is installed,
**so that** I have an automated, continuous proof that Gate 0–3 safety is maintained.

**As a** test author writing EC2 or EC3 tests,
**I want** shared fixture files in `tests/fixtures/compliance/` that deterministically trigger specific finding kinds,
**so that** my tests produce consistent, repeatable results without each slice inventing its own fixture.

**As a** maintainer verifying the warnings-are-critical contract,
**I want** a wire-contract test that feeds a sample finding through each agent's JS helper and asserts `severity: critical` in the normalized output,
**so that** no soft tier can leak onto the Inbox or letter wire in future changes.

### BDD Scenarios

- [ ] **Scenario: Shared fixture — PII-collecting plan triggers GDPR findings deterministically**
  Given `tests/fixtures/compliance/pii-collecting-plan.md` (a functional plan that names `email`, `ipAddress`, and a US-hosted analytics SDK)
  When `gdpr-helpers.js` `mapPiiFieldToArticles()` is called for each PII field in the fixture
  Then it returns the exact finding kinds documented in `fixture-manifest.yaml` for this fixture: `missing-consent-banner` (GDPR-7), `missing-article-13-notice` (GDPR-13), `non-eu-transfer-without-sccs-dpf` (GDPR-Chapter-V)
  And no other finding kinds are produced (the fixture is scoped)

- [ ] **Scenario: Shared fixture — Annex III AI plan triggers EU AI Act findings deterministically**
  Given `tests/fixtures/compliance/annex-iii-ai-plan.md` (a functional plan describing a CV-screening system for employment decisions)
  When `eu-ai-act-helpers.js` `classifyFromPlanText(planText)` processes the fixture
  Then it returns `{ risk_class: "high-risk", annex_iii_category: "4-employment", confidence: "medium" }`
  And the finding kinds documented in `fixture-manifest.yaml` are produced: `missing-inventory` (Art. 11), `missing-technical-docs` (Art. 11 + Annex IV), `missing-oversight` (Art. 14)

- [ ] **Scenario: Shared fixture — prohibited-practice plan triggers stop-ship finding**
  Given `tests/fixtures/compliance/prohibited-practice-plan.md` (a plan describing real-time biometric identification in public spaces for law enforcement)
  When `eu-ai-act-helpers.js` `classifyFromPlanText(planText)` processes the fixture
  Then it produces a finding with `kind: prohibited-use-detected`, `regulation_ref: "EU-AI-Act Art. 5"`, `severity: critical`
  And the finding message includes the penalty citation (€35M / 7% of global annual turnover, sourced from `eu-ai-act-high-risk.yaml`)

- [ ] **Scenario: End-to-end integration — both profiles active, findings attach pre-Gate-2 with EC4 buckets**
  Given both `gdpr` and `eu-ai-act-high-risk` are in `active_profiles`
  And the PII-collecting plan fixture is at the implementation stage
  When the full EC1→EC5 path runs (EC5 dispatches EC2 and EC3, EC4 attaches remediation buckets via stubbed fetcher)
  Then the plan's Inbox contains findings from both EC2 and EC3
  And each finding has EC4 remediation output with `hosted`, `self_hosted`, and `library` keys present
  And each bucket entry passes `validateOutputSchema()` from `eu-recommender-helpers.js`
  And all findings are present before the Gate 2 boundary is presented to the user

- [ ] **Scenario: End-to-end integration — empty active_profiles is a provable no-op**
  Given `regulatory_regime.active_profiles: []`
  And a plan is at the functional→implementation transition boundary
  When the EC5 dispatch step evaluates
  Then no compliance agent is dispatched
  And the plan file is not modified
  And the pipeline execution log for this plan is identical to a plan processed when `regulatory_regime` does not exist in settings

- [ ] **Scenario: Gate-invariant test — gate count = 4, transitions unchanged (owned by EC6)**
  Given the full compliance program (EC1–EC5) is installed
  When the gate-invariant test reads `src/hooks/human-gate-check.js` and the gate transition table
  Then exactly 4 gates are defined: Gate 0 (vision→functional), Gate 1 (functional→implementation), Gate 2 (implementation→todo), Gate 3 (review→done)
  And no compliance profile value modifies `requireReviewGate`
  And `enforcementMode` is unaffected by any compliance profile setting
  And this test is the single gate-invariant test for the compliance program (EC1 and EC5 reference it, not duplicate it)

- [ ] **Scenario: Wire-contract test — severity: critical on all emitted findings (via JS helpers)**
  Given the PII-collecting plan fixture processed by `gdpr-helpers.js` `normalizeSeverity()`
  And the Annex III AI plan fixture processed by `eu-ai-act-helpers.js` `normalizeSeverity()`
  When the normalized output is inspected
  Then every finding's `severity` field equals `"critical"`
  And a test provides a finding with `severity: "medium"` to `normalizeSeverity()` and asserts it is upgraded to `"critical"`
  And a test provides a finding with `severity: "low"` to `normalizeSeverity()` and asserts it is upgraded to `"critical"`

- [ ] **Scenario: Error path — EC4 stubbed fetcher failure produces labeled fallback, not crash**
  Given `eu-recommender-helpers.js` is configured with a stub fetcher that returns a network error for all requests
  When `applyFallback(option, skillDocumentedFigure)` is called
  Then the output contains `"unverified_this_run": true` for the affected field
  And the skill-documented fallback figure is used
  And no exception propagates to the caller
  And the finding still attaches to the plan's Inbox surface

- [ ] **Scenario: Error path — malformed plan input does not swallow the error**
  Given a plan file with invalid YAML frontmatter (missing required fields)
  When `gdpr-helpers.js` processes it (e.g., `mapPiiFieldToArticles` receives empty input)
  Then an observable error state is produced (either a thrown error caught and re-asserted by the test, or a finding with `kind: malformed-plan-input`)
  And the error is not swallowed by an empty catch block
  And the test asserts the error state explicitly

- [ ] **Scenario: Error path — absent AI inventory is a critical finding, not a silent pass**
  Given a codebase with no `ai-systems.yaml`, `ai-inventory.json`, or equivalent
  And `eu-ai-act-high-risk` is in `active_profiles`
  When `eu-ai-act-helpers.js` processes a scan result indicating absent inventory
  Then it produces a finding with `kind: missing-inventory`, `severity: critical`, `confidence: high`
  And the test asserts the finding exists with a `assert.ok(finding)` call (not that the scan returned empty)

- [ ] **Scenario: fixture-manifest.yaml is complete and correct**
  Given `tests/fixtures/compliance/fixture-manifest.yaml`
  When a test reads it
  Then every fixture file in `tests/fixtures/compliance/` is listed
  And every listed fixture has at least one expected `finding.kind` documented
  And every documented `finding.kind` is a valid value from either `gdpr-helpers.js` `VALID_GDPR_ARTICLES` or `eu-ai-act-helpers.js` `VALID_AI_ACT_KINDS`

- [ ] **Scenario: Coverage ≥ 80% on EC1–EC5 new JS modules**
  Given all EC1–EC5 JS module test files run as part of `node --test tests/*.test.js`
  When the coverage report is generated for the five specified files
  Then overall coverage on `src/lib/compliance-regime.js`, `src/lib/gdpr-helpers.js`, `src/lib/eu-ai-act-helpers.js`, `src/lib/eu-recommender-helpers.js`, and `src/lib/compliance-dedup.js` is ≥ 80% each
  And the error-path branches (stub-fetcher failure, malformed plan, absent inventory, unknown profile, unknown gdpr_article) are each covered by at least one test

- [ ] **Scenario: No test passes silently (no assertion-less or empty-catch tests)**
  Given all EC6 test files
  When a static check scans each test function (or the CI lint rule runs)
  Then every test function has at least one `assert.*` call
  And no `try { ... } catch {}` block appears without a subsequent assertion on the caught error
  And no test is marked skip without a comment explaining why and what it covers

---

## Scope

### In Scope

- `tests/fixtures/compliance/` directory with:
  - `pii-collecting-plan.md` — functional plan naming `email`, `ipAddress`, a US analytics SDK; no consent banner, no Art. 13 notice, no deletion flow.
  - `annex-iii-ai-plan.md` — functional plan describing a CV-screening system for employment decisions; no risk classification, no human oversight surface, no technical docs.
  - `prohibited-practice-plan.md` — functional plan describing real-time biometric identification in public spaces for law enforcement without a statutory exception.
  - `sample-pii-code.js` — JavaScript source that initialises an analytics SDK before a consent gate; soft-deletes a user without a hard-purge; ships PII to a US endpoint.
  - `sample-ai-act-code.js` — JavaScript source with a loan-decision model call that writes directly to the database with no human-review endpoint; no `ai-systems.yaml` present.
  - `fixture-manifest.yaml` — machine-readable manifest: fixture filename → expected `finding.kind` list → expected `confidence` per finding → `regulation_ref` per finding; includes a `coverage_gaps` section listing GDPR Articles and EU AI Act Articles not yet fixture-covered.
- Integration test files: the 5 files declared in EC1–EC5 `files:` plus cross-slice integration scenarios, sharing fixtures from `tests/fixtures/compliance/`.
- Safety-invariant tests (mirroring `tests/environment-mode.test.js`): gate-count assertion, empty-profiles no-op assertion, `requireReviewGate` immutability assertion. These are owned by EC6 and referenced (not duplicated) by EC1 and EC5.
- Wire-contract test: `severity: critical` assertion at the `normalizeSeverity()` output level in `gdpr-helpers.js` and `eu-ai-act-helpers.js`.
- Error-path tests: injectable-fetcher failure (EC4), malformed plan (EC2/EC3), absent inventory (EC3).
- Static no-assertion / no-empty-catch check: a dedicated test scanner or linting rule enforced in CI.
- Coverage scope declaration: explicit file list in the test configuration limiting coverage to the five new JS modules.

### Out of Scope

- Live network calls in any test — all web interactions go through the injectable fetcher stub.
- End-to-end browser/UI tests — dashboard rendering is a manual verification concern.
- Performance or load tests — compliance agents are run per-plan, not at high frequency.
- Adding new fixtures for NIST AI RMF or ISO 42001 scenarios — not in scope (EU AI Act only for EC3; NIST/ISO are filtered out by `filterToEuAiAct()`).
- Modifying existing test files (`architecture-invariants.test.js`, `environment-mode.test.js`) — EC6 adds new tests that mirror those patterns but does not modify the originals.
- Coverage assertions on agent `.md` files — agent-prompt behavior is covered by fixtures and manual review.

---

## Risks

### Technical Risks

- **Fixture maintenance burden:** Fixtures must stay in sync with the skill's PII surface list and classification logic. If the skill adds new PII fields or revises Annex III categories, fixtures may produce different findings than the manifest documents.
  - Likelihood: MEDIUM
  - Impact: MEDIUM (stale fixtures produce false test failures, blocking CI)
  - Mitigation: `fixture-manifest.yaml` includes a `skill_version` field referencing the `SKILL.md` commit hash or version. When `SKILL.md` changes, a pre-commit hook or CI check detects the mismatch and prompts a fixture update. The `coverage_gaps` section in the manifest tracks which Articles are not yet fixture-covered — making incompleteness visible and tracked, not hidden.

- **Cross-platform fixture paths:** Fixtures must be loadable on Windows (backslash paths) and Unix (forward-slash paths).
  - Likelihood: LOW (CLAUDE.md cross-platform rules are enforced)
  - Impact: MEDIUM (CI fails on Windows agents)
  - Mitigation: Use `path.join(__dirname, 'fixtures', 'compliance', ...)` throughout all fixture-loading code. Add a CI matrix step for Windows in the test workflow documentation.

### Business Risks

- **Test completeness is not regulatory completeness:** Passing `# fail 0` means the implemented behavior matches the tests, not that the tests cover every GDPR Article or EU AI Act Article.
  - Likelihood: MEDIUM
  - Impact: MEDIUM (an untested regulatory path produces a false sense of coverage)
  - Mitigation: `fixture-manifest.yaml` `coverage_gaps` section explicitly identifies Articles not yet covered. This makes the incompleteness visible and tracked, not hidden.

### Dependency Risks

- **EC1–EC5 must all ship before EC6 integration tests can run:**
  - Likelihood: HIGH (structural; EC6 is the last slice)
  - Impact: MEDIUM (unit tests within each EC slice can run independently; only EC6 integration tests block on all five)
  - Mitigation: Separate test files clearly: `*.test.js` in EC1–EC5 are unit tests (stubs allowed); `compliance-iron-loop.test.js` in EC6 is the integration test (requires real implementations). CI can run unit tests on partial-program commits and skip integration tests until EC1–EC5 are all green.

---

## Priority

**Priority: MEDIUM** (Score: 5/9)
- Dependency: LOW (1) — EC6 depends on all other EC slices; no slice depends on EC6. It is the verification layer, not a prerequisite.
- Business Impact: HIGH (3) — without EC6, the compliance program ships unverified in a €20M–€35M penalty exposure domain; the gate-invariant test is the only automated proof that Gate 0–3 are safe.
- Technical Risk: LOW (1) — test writing is well-understood; the main risk is fixture maintenance, which is mitigated by `fixture-manifest.yaml` and skill-version pinning.

---

## Decisions Taken Under Ambiguity

- **Coverage target scoped to JS files, not agent markdown.** Decision: the ≥80% coverage target applies to the five new JS modules (compliance-regime.js, gdpr-helpers.js, eu-ai-act-helpers.js, eu-recommender-helpers.js, compliance-dedup.js). Agent `.md` prompt behavior is not measurable by `node --test` and is covered by fixtures + manual review. This is explicitly stated in the coverage configuration — not left implicit.
- **Web boundary via injectable fetcher, not WebSearch/WebFetch mock.** Decision: you cannot mock `WebSearch`/`WebFetch` from `node --test` (they are not Node.js modules). The injectable fetcher interface in `eu-recommender-helpers.js` is the correct boundary. Tests inject stub functions. This is documented as the standard pattern for any future agent that needs web access.
- **Gate-invariant test owned by EC6, referenced by EC1 and EC5.** Decision: there is one gate-invariant test for the compliance program, owned by EC6. EC1 and EC5 reference it by name in their documentation. Duplicating the gate-invariant test across three slices would create drift risk. Centralization is the correct pattern.
- **Severity contract tested at JS helper output, not schema rejection.** The refinement-loop schema permits severity `critical`, `medium`, and `low` — it does not reject non-critical. The wire-contract test asserts that `normalizeSeverity()` in the JS helpers produces `severity: "critical"` for any input severity value. This is the behavioral contract, asserted at the emitter level. Schema validation is a separate concern.
- **fixture-manifest.yaml includes coverage_gaps.** Decision: the manifest documents which GDPR Articles and EU AI Act Articles are not yet covered by fixtures. This makes the incompleteness explicit and tracked, preventing a false sense of full regulatory coverage. The gap list is updated whenever a new fixture is added.
- **Slice-local vs. central tests.** Decision: each of EC1–EC5 keeps a focused unit test in its own `files:` (so a slice can ship green on its own); EC6 owns the cross-slice integration tests, shared fixtures, and safety invariants. This avoids coupling every slice to a single mega-test file while still guaranteeing integrated coverage.

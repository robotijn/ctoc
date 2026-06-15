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

CTOC requires `node --test tests/*.test.js` to show `# fail 0`, ≥80% coverage on new code, no silently-passing tests, no empty catch blocks swallowing errors, and every error path tested. Each of EC1–EC5 carries a focused slice-local test file in its `files:` declaration. Those unit tests verify each slice's internal logic in isolation (with stubs for cross-slice dependencies). What they do not cover is:

1. **Cross-slice integration:** the path from `compliance.mode` → dispatch → agent run → findings attach → advisory surface.
2. **Shared fixtures:** deterministic plan/code samples that trigger known findings — needed by both EC2 and EC3 tests, and by integration tests; without shared fixtures, each slice invents its own, leading to inconsistency.
3. **Safety invariants:** the single most important test this program must ship is the gate-invariant assertion — a continuous, automated proof that the four human gates (Gate 0–3) are unchanged after the EU compliance program is installed.
4. **warnings-are-critical wire contract:** a cross-slice assertion that `severity: critical` holds on the letter wire for all findings, regardless of internal triage tier.

This slice owns all of the above. It is the integration test layer, the shared fixture library, and the safety-proof layer.

The distinction from EC1–EC5 unit tests: EC1–EC5 tests are slice-local unit tests that may stub other slices. EC6 integration tests exercise the real cross-slice path with real (not stubbed) EC1–EC5 code and stub only at the external boundary (HTTP calls for EC4's web verification).

### Current State

`tests/*.test.js` contains 71 test files per CLAUDE.md. The new compliance test files (`compliance-mode.test.js`, `gdpr-agent.test.js`, `eu-ai-act-agent.test.js`, `eu-solution-recommender.test.js`, `compliance-iron-loop.test.js`) are declared in EC1–EC5 `files:` respectively but do not exist yet. `tests/fixtures/compliance/` does not exist.

`tests/architecture-invariants.test.js` and `tests/environment-mode.test.js` are the canonical models for invariant and mode-safety tests respectively. EC6 mirrors their patterns for the compliance domain.

### Impact

Without EC6, the compliance program ships without:
- Proof that the integrated path works end-to-end.
- Proof that the four human gates are unchanged.
- Shared fixture libraries that make test output deterministic and repeatable.
- `# fail 0` on `node --test tests/*.test.js` with the new test files included.

All four of these are non-negotiable for a regulatory-accuracy-sensitive feature that operates in a €20M–€35M penalty exposure domain.

---

## 2. ALIGN

### Business Goals

**Goal:** The EU compliance program ships with provable end-to-end behavior and provable gate safety, preventing regressions in a regulatory-accuracy-sensitive feature area.

**Job to Be Done:** When I run `node --test tests/*.test.js` after installing the EU compliance program, I want every test to pass and every safety invariant to hold, so that I can trust the program is correct and has not touched any gate logic.

**Impact Map:**
- **Goal:** `# fail 0` across all 71 + new compliance tests; gate invariant passes; ≥80% coverage on EC1–EC5 new code.
- **Actor:** CTOC maintainer running the test suite; CI pipeline verifying every commit.
- **Impact:** The regulatory-accuracy-sensitive compliance program is safe to ship; regressions are caught automatically before they reach the user.
- **Deliverable:** `tests/fixtures/compliance/` fixture library + five cross-slice integration test files + shared safety-invariant tests (gate count, mode-isolation, wire-contract).

### Success Metrics

1. `node --test tests/*.test.js` shows `# fail 0` with all new compliance test files included.
2. ≥80% coverage on all new code from EC1–EC5.
3. Gate-invariant test passes: gate count = 4, transitions unchanged, no compliance finding auto-reverts or auto-advances a plan.
4. `mode = none` no-op test passes: pipeline execution is byte-for-byte identical with and without `none` mode.
5. Wire-contract test passes: every finding emitted by EC2 or EC3 has `severity: critical`.
6. Error-path tests pass: web-verification failure (EC4), malformed plan input (EC2/EC3), absent inventory (EC3) all produce findings or labeled fallbacks, not swallowed errors.
7. All fixtures documented in `tests/fixtures/compliance/fixture-manifest.yaml` with expected `finding.kind` outputs.

### Stakeholders

- **CTOC maintainer** — primary consumer; runs `node --test tests/*.test.js`.
- **CI pipeline** — automated gating on every commit.
- **Future slice authors** — consume the shared fixtures; must not modify them without updating `fixture-manifest.yaml`.
- **Security maintainer** — depends on the gate-invariant test to know Gate 0–3 are untouched.

### Constraints

- **No live network in tests.** EC4's web layer is stubbed at the HTTP-client boundary (mock only the external HTTP dependency, not the ranking/bucket logic). One explicit error-path test simulates network failure. Keeps tests deterministic and cross-platform.
- **No empty catch blocks.** Every error path must assert an observable outcome (finding emitted, labeled fallback, or thrown error caught and re-asserted). No `try { ... } catch {}` without an assertion.
- **No assertion-less tests.** Every test function has at least one `assert.*` call. A test that "passes" without asserting anything is treated as a bug.
- **No skipped tests without a documented reason.** If a test cannot run in CI (e.g. OS-specific behavior), it must be skipped with a comment explaining why and what it tests, so its absence is intentional and visible.
- **Cross-platform.** Fixtures use `path.join`, `fs.promises`; no bash entry points; no hardcoded Unix paths. Tests run identically on Windows, macOS, and Linux.
- **Coverage target.** ≥80% on new EC1–EC5 code. Coverage is measured on code paths, not inflated by duplicating happy-path-only tests; error paths and the `compliance.mode` truth table are explicitly enumerated.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC maintainer running `node --test tests/*.test.js`,
**I want** all compliance tests to show `# fail 0` with ≥80% coverage on EC1–EC5 new code,
**so that** the compliance program ships verified.

**As a** security maintainer,
**I want** a gate-invariant test that asserts the four human gates are unchanged after the compliance program is installed,
**so that** I have an automated, continuous proof that Gate 0–3 safety is maintained.

**As a** test author writing EC2 or EC3 tests,
**I want** shared fixture files in `tests/fixtures/compliance/` that deterministically trigger specific finding kinds,
**so that** my tests produce consistent, repeatable results without each slice inventing its own fixture.

**As a** maintainer verifying the warnings-are-critical contract,
**I want** a wire-contract test that feeds a sample finding through each agent and asserts `severity: critical` in the emitted letter,
**so that** no soft tier can leak onto the wire in future changes.

### BDD Scenarios

- [ ] **Scenario: Shared fixture — PII-collecting plan triggers GDPR findings deterministically**
  Given `tests/fixtures/compliance/pii-collecting-plan.md` (a functional plan that names `email`, `ipAddress`, and a US-hosted analytics SDK)
  When EC2 (GDPR agent) processes it
  Then it emits exactly the finding kinds documented in `fixture-manifest.yaml` for this fixture: `missing-consent-banner`, `missing-article-13-notice`, `non-eu-transfer-without-sccs-dpf`
  And no other finding kinds are emitted (the fixture is scoped)

- [ ] **Scenario: Shared fixture — Annex III AI plan triggers EU AI Act findings deterministically**
  Given `tests/fixtures/compliance/annex-iii-ai-plan.md` (a functional plan describing a CV-screening system for employment decisions)
  When EC3 (EU AI Act agent) processes it
  Then it emits findings with `risk_class: "high-risk"`, `annex_iii_category: "4-employment"`, and the triggered-obligation kinds documented in `fixture-manifest.yaml`: `missing-inventory`, `missing-technical-docs`, `missing-oversight`
  And `confidence` is `medium` for all plan-stage findings

- [ ] **Scenario: Shared fixture — prohibited-practice plan triggers stop-ship finding**
  Given `tests/fixtures/compliance/prohibited-practice-plan.md` (a plan describing real-time biometric identification in public spaces for law enforcement)
  When EC3 processes it
  Then it emits exactly one finding with `kind: prohibited-use-detected`, `regulation_ref: "EU-AI-Act Art. 5"`, `severity: critical`
  And the finding message includes the penalty citation (€35M / 7% of global annual turnover)

- [ ] **Scenario: End-to-end integration — mode = both, findings attach pre-todo with EC4 buckets**
  Given `compliance.mode` is `both`
  And the PII-collecting plan fixture is at the implementation stage
  When the full EC1→EC5 path runs (EC5 dispatches EC2 and EC3, EC4 attaches remediation buckets)
  Then the plan's advisory findings surface contains findings from both EC2 and EC3
  And each finding has EC4 remediation buckets with `hosted`, `self_hosted`, and `library` keys present
  And each bucket entry has `name`, `source_url`, `retrieved_date`, and `price` fields populated (or `unverified-this-run: true` for the web-stubbed run)
  And the findings are present before the Gate 2 boundary is presented

- [ ] **Scenario: End-to-end integration — mode = none is a provable no-op**
  Given `compliance.mode` is `none`
  And a plan is at the implementation-to-`todo` boundary
  When the EC5 dispatch step evaluates
  Then no compliance agent is dispatched
  And the plan file is not modified
  And the pipeline execution log for this plan is identical to a plan processed when `compliance.mode` does not exist in settings

- [ ] **Scenario: Gate-invariant test — gate count = 4, transitions unchanged**
  Given the full compliance program (EC1–EC5) is installed
  When the gate-invariant test reads `src/hooks/human-gate-check.js` and the gate transition table
  Then exactly 4 gates are defined: Gate 0 (vision→functional), Gate 1 (functional→implementation), Gate 2 (implementation→todo), Gate 3 (review→done)
  And no compliance setting or finding has modified `requireReviewGate`
  And `enforcementMode` is unaffected by any compliance setting value

- [ ] **Scenario: Wire-contract test — severity: critical on all emitted findings**
  Given the PII-collecting plan fixture processed by EC2 (GDPR agent)
  And the Annex III AI plan fixture processed by EC3 (EU AI Act agent)
  When each agent's findings are serialised to refinement-loop letters
  Then every letter's `severity` field equals `"critical"`
  And no letter contains `severity: "warn"`, `"high"`, `"medium"`, or `"low"`
  And a test that attempts to emit a letter with any other `severity` value receives a schema-validation rejection

- [ ] **Scenario: Error path — EC4 web-verification failure produces labeled fallback, not crash**
  Given EC4's HTTP client is stubbed to return a network error for all requests
  When EC4 processes a finding referencing a dated obligation (e.g. EU AI Act high-risk enforcement date)
  Then the output contains `"unverified_this_run": true` for the affected date field
  And the skill-documented fallback figure is used
  And no exception propagates to the caller
  And the finding still attaches to the plan's advisory surface

- [ ] **Scenario: Error path — malformed plan input does not swallow the error**
  Given a plan file with invalid YAML frontmatter (missing required fields)
  When EC2 or EC3 attempts to read the plan ancestry
  Then a finding with `kind: malformed-plan-input` (or equivalent) is emitted
  And the error is not swallowed by an empty catch block
  And the agent exits cleanly with a documented error state, not a thrown unhandled exception that crashes the pipeline

- [ ] **Scenario: Error path — absent AI inventory is a critical finding, not a silent pass**
  Given a codebase with no `ai-systems.yaml`, `ai-inventory.json`, or equivalent
  And `compliance.mode` is `eu-ai-act` or `both`
  When EC3 runs the code scan
  Then it emits a finding with `kind: missing-inventory`, `severity: critical`, `confidence: high`
  And the test asserts the finding exists (not that the scan returned empty)

- [ ] **Scenario: fixture-manifest.yaml is complete and correct**
  Given `tests/fixtures/compliance/fixture-manifest.yaml`
  When a test reads it
  Then every fixture file in `tests/fixtures/compliance/` is listed
  And every listed fixture has at least one expected `finding.kind` documented
  And every documented `finding.kind` is a valid value from the skill's letter schema

- [ ] **Scenario: Coverage ≥ 80% on EC1–EC5 new code**
  Given all EC1–EC5 test files run as part of `node --test tests/*.test.js`
  When the coverage report is generated
  Then overall coverage on files introduced by EC1–EC5 is ≥ 80%
  And the error-path branches (web failure, malformed plan, absent inventory, invalid mode value) are each covered by at least one test

- [ ] **Scenario: No test passes silently (no assertion-less or empty-catch tests)**
  Given all EC6 test files
  When a static check scans each test function
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
  - `fixture-manifest.yaml` — machine-readable manifest: fixture filename → expected `finding.kind` list → expected `confidence` per finding.
- Integration test files: the 5 files declared in EC1–EC5 `files:` (one per slice) plus cross-slice integration scenarios above, each sharing fixtures from `tests/fixtures/compliance/`.
- Safety-invariant tests (mirroring `tests/environment-mode.test.js`): gate-count assertion, `mode = none` no-op assertion, `requireReviewGate` immutability assertion.
- Wire-contract test: `severity: critical` assertion across all agent outputs.
- Error-path tests: web-failure fallback (EC4), malformed plan (EC2/EC3), absent inventory (EC3).
- Static no-assertion / no-empty-catch check (can be a linting rule or a dedicated test scanner).

### Out of Scope

- Live network calls in any test — all web interactions are stubbed at the HTTP-client boundary.
- End-to-end browser/UI tests — CTOC has no browser test infrastructure; dashboard rendering is a manual verification concern.
- Performance or load tests — compliance agents are run per-plan, not at high frequency; performance testing is a future concern.
- Adding new fixtures for NIST AI RMF or ISO 42001 scenarios — those are not in the program scope (EU AI Act only for EC3).
- Modifying existing test files (`architecture-invariants.test.js`, `environment-mode.test.js`) — EC6 adds new tests that mirror those patterns but does not modify the originals.

---

## Risks

### Technical Risks

- **Fixture maintenance burden:** Fixtures must stay in sync with the skill's PII surface list and classification logic. If the skill adds new PII fields or revises Annex III categories, fixtures may produce different findings than the manifest documents.
  - Likelihood: MEDIUM (skills are updated as regulations evolve)
  - Impact: MEDIUM (stale fixtures produce false test failures, blocking CI)
  - Mitigation: `fixture-manifest.yaml` includes a `skill_version` field referencing the `SKILL.md` commit hash or version. When `SKILL.md` changes, a pre-commit hook or CI check detects the mismatch and prompts a fixture update. Document the update procedure in the manifest.

- **Cross-platform fixture paths:** Fixtures must be loadable on Windows (backslash paths) and Unix (forward-slash paths). Hardcoded path separators in fixture-loading code will break CI on Windows.
  - Likelihood: LOW (CLAUDE.md cross-platform rules are enforced)
  - Impact: MEDIUM (CI fails on Windows agents)
  - Mitigation: Use `path.join(__dirname, 'fixtures', 'compliance', ...)` throughout all fixture-loading code; add a CI matrix step for Windows in the test workflow documentation.

### Business Risks

- **Test completeness is not regulatory completeness:** Passing `# fail 0` means the implemented behavior matches the tests, not that the tests cover every GDPR Article or EU AI Act Article. If a regulatory obligation is not fixture-covered, it is not tested.
  - Likelihood: MEDIUM (the skills cover 8+ compliance categories; fixtures cover the three most common)
  - Impact: MEDIUM (an untested regulatory path produces a false sense of coverage)
  - Mitigation: `fixture-manifest.yaml` documents which Articles are fixture-covered; the gap list is explicit. A comment in the manifest identifies Articles not yet covered as "coverage gap — future fixture required." This makes the incompleteness visible and tracked, not hidden.

### Dependency Risks

- **EC1–EC5 must all ship before EC6 integration tests can run:** EC6 stubs slice dependencies for unit isolation, but integration tests require real EC1–EC5 implementations.
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

- **Slice-local vs. central tests.** Decision: each of EC1–EC5 keeps a focused unit test in its own `files:` (so a slice can ship green on its own); EC6 owns the cross-slice integration tests, shared fixtures, and safety invariants. Avoids coupling every slice to a single mega-test file while still guaranteeing integrated coverage.
- **No live network in tests.** Decision: EC4's web layer is stubbed at the HTTP-client boundary in tests (mock external dependency only, never the core ranking logic — per CLAUDE.md no-silent-failure rules), with one explicit error-path test for the verification-failure fallback. Keeps tests deterministic and cross-platform.
- **Cross-platform.** Decision: fixtures use `path.join`, `fs.promises`, and no bash entry points (CLAUDE.md cross-platform requirement); tests run identically on Windows/macOS/Linux.
- **Coverage target.** Decision: ≥80% on new EC1–EC5 code per CLAUDE.md; error paths and the truth table for `compliance.mode` resolution are explicitly enumerated so coverage is meaningful, not inflated by happy-path-only tests.

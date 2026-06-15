---
title: "SP5 — Regression suite for stale detection & gate safety"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: automated-stale-plan-detection
program: ctoc-pipeline-hygiene
order: 5
depends_on: [SP4-human-gated-cleanup-review]
files:
  - tests/stale-detection-regression.test.js
status: refined
acceptance_criteria_count: 8
risk_level: LOW
---

# SP5 — Regression suite for stale detection & gate safety

## 1. ASSESS — Problem Understanding

### Business Context

The entire value of the stale-detection feature rests on two invariants never breaking: a stranded `review/` plan must ALWAYS be flagged (false negative prevention), and a source-stage plan carrying a prior-gate marker that SHOULD NOT be flagged must remain clean (false positive prevention). These are the exact failure modes that caused the 2026-06-15 incident — plans that should have been in `done/` were misreported as live backlog. Vision SC4 demands a regression-grade test that proves both directions, end-to-end across SP1/SP3/SP4, in CI on every `node --test tests/*.test.js` run.

The false-positive fixture is NOT a `done/` plan (the scanner never reads `done/`), so a `done/approved` fixture would give false confidence. The correct negative invariant tests a **source-stage plan carrying a prior-gate marker that must NOT be flagged** — specifically, a healthy `plans/implementation/` plan with a Gate-1 `approved_by: human` marker and all declared files present. This mirrors the real incident shape: the session's `functional/` plans that were present in the tree with files intact but had not yet been recognized as stale.

The positive invariant tests a `plans/review/` plan with `approved_by: human` in its frontmatter (marker-in-source-stage signal, review stage only per SP1's locked signal scope decision).

### Current State

The per-slice test files (`tests/stale-detector-cheap.test.js`, `tests/stale-classifier.test.js`, `tests/stale-cleanup-human-gate.test.js`) are declared in SP1/SP3/SP4 respectively. Each tests its own slice in isolation. There is no cross-slice regression test that wires the full pipeline — cheap detection through classification through cleanup gate-safety — in a single fixture-driven suite. `tests/stale-detection-regression.test.js` does not yet exist.

### Impact

Without a cross-slice regression test, any future change to any of the four modules could silently break the negative invariant (flagging source-stage plans that carry prior-gate markers) or the positive invariant (missing genuinely stranded plans), and no CI check would catch it before the phantom backlog problem recurs.

## 2. ALIGN — Business Alignment

### Business Goals

1. A dedicated regression test file `tests/stale-detection-regression.test.js` that uses `os.tmpdir()` sandboxes (hermetic, cross-platform, not coupled to the live `plans/` tree or real git state).
2. Assert the **negative invariant**: a healthy `plans/implementation/` plan carrying a Gate-1 `approved_by: human` marker and all declared `files:` present produces zero stale/actionable candidates from `scanCheapCandidates()`. This is the source-stage-with-prior-marker shape that must NOT be flagged.
3. Assert the **positive invariant**: a plan in `plans/review/` with `approved_by: human` in its frontmatter is always returned, always classified `approved-but-stranded`, and its proposed action is always `advance-via-reconciliation`.
4. Assert the **shipped-and-stranded shape**: a `plans/functional/` fixture with all declared `files:` present in the sandbox — mirroring the 2026-06-15 session's actual incident shape — is detected and classified correctly (missing-files signal fires when files are removed; age-only advisory when files are present).
5. Assert the gate-safety invariant end-to-end: no cleanup action executes without an explicit approve; the `approved-but-stranded → done` reconciliation path does NOT call `approvePlan()` or `movePlan()` directly.
6. All 71+ test files continue to pass with `# fail 0` under `node --test tests/*.test.js`.

### Success Metrics

- **M1:** `stale-detection-regression.test.js` runs to completion with `# fail 0` in CI, in a fresh temp-dir sandbox, without reading or writing to `plans/`.
- **M2:** Negative regression (source-stage prior-marker): a healthy `implementation/` plan fixture with Gate-1 `approved_by: human` and all declared `files:` present produces 0 actionable candidates from `scanCheapCandidates()`.
- **M3:** Positive regression: a `review/approved` stranded plan fixture produces exactly 1 actionable candidate, classified `approved-but-stranded` by `classifyStaleCandidate()`, with `proposedAction: 'advance-via-reconciliation'`.
- **M4:** Shipped-and-stranded shape: a `functional/` fixture replicating the 2026-06-15 incident (files present in sandbox) is detected via `missing-files` signal when files are removed, and is age-only advisory when files are present.
- **M5:** Age-only advisory fixture: a plan with only `advisory:age` signal (via `nowMs` injection, no mtime manipulation) is never classified as actionable by `classifyStaleCandidate()`.
- **M6:** Gate-safety assertion: a spy on `approvePlan` injected via `executeCleanup(proposal, root, deps)` is NOT called during `approved-but-stranded` reconciliation — `stale-cleanup.js`'s own reconciliation path handles the move.
- **M7:** Gate-safety assertion: a spy on `movePlan` injected via `deps` is NOT called directly for any archive or reconciliation path (it is only called as an internal implementation detail within `stale-cleanup.js`, not by SP4 callers passing through `approvePlan`).
- **M8:** Suite runs cross-platform: all temp-dir construction uses `os.tmpdir()` + `path.join()`, no hardcoded path separators. Age scenarios use `nowMs` injection, not `fs.utimesSync`.

### Stakeholders

- CTOC maintainer (primary beneficiary — confidence in the detection contract across every future change)
- CI (runs the suite on every PR touching SP1–SP4 modules)
- SP1/SP3/SP4 (each slice's unit tests remain their own concern; this suite asserts only cross-slice invariants)

### Constraints

- Git evidence is STUBBED in the regression suite — the classifier is the unit under test; real git invocation is the verifier's concern and is boundary-tested, not re-run here.
- Fixtures are built in `os.tmpdir()` sandboxes, not against the live `plans/` tree.
- All plan fixtures are written fresh per test using `fs.promises` with `path.join()`.
- Age scenarios use `scanCheapCandidates(root, { nowMs: futureMs })` injection — no `fs.utimesSync` dependency.
- The suite must not introduce a new test command — it runs under `node --test tests/*.test.js` alongside all 71+ existing tests.
- Cross-platform: no `bash`, no `execSync` for path manipulation.
- SP5 `files:` contains ONLY `tests/stale-detection-regression.test.js` — the single file this plan creates. The per-slice test files (`stale-detector-cheap.test.js`, `stale-classifier.test.js`, `stale-cleanup-human-gate.test.js`) are declared by SP1/SP3/SP4 respectively and are not repeated here.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC maintainer,
**I want** a regression test that proves a healthy source-stage plan with a prior-gate marker is never falsely flagged,
**so that** no future change to the cheap detector silently reintroduces false positives for implementation-stage plans.

**As a** CI pipeline,
**I want** the regression suite to run hermetically in a temp-dir sandbox with no real git or live plans dependency,
**so that** it is green on every machine and every branch without environment setup.

### BDD Scenarios

- [ ] **Scenario: Negative regression — implementation-stage plan with Gate-1 marker not flagged**
  Given a temp-dir sandbox with a `plans/implementation/` directory
  And a plan file `healthy-impl-plan.md` in `plans/implementation/` with `approved_by: human` in its YAML frontmatter (normal Gate-1 marker)
  And all files listed in the plan's `files:` frontmatter exist in the sandbox
  When `scanCheapCandidates(sandboxRoot)` runs
  Then `candidates` does NOT contain `healthy-impl-plan`
  And `count` is 0
  And no `marker-in-source-stage` signal is emitted for this plan

- [ ] **Scenario: Positive regression — stranded review plan always flagged and classified**
  Given a temp-dir sandbox with a `plans/review/` directory
  And a plan file `stranded-plan.md` in `plans/review/` with `approved_by: human` in its YAML frontmatter
  And stubbed evidence that the plan's declared files were last modified by a commit after the plan's stage entry
  When `scanCheapCandidates(sandboxRoot)` runs
  Then `candidates` contains `stranded-plan` with signal `marker-in-source-stage` and `actionable: true`
  When `classifyStaleCandidate(candidate, evidence)` is called with the stubbed evidence
  Then `category` is `'approved-but-stranded'`
  And `proposedAction` is `'advance-via-reconciliation'`

- [ ] **Scenario: Shipped-and-stranded functional plan detected via missing-files**
  Given a temp-dir sandbox with a `plans/functional/` directory
  And a plan file `shipped-stranded.md` with `files: [src/lib/shipped.js]` in its YAML frontmatter
  And `src/lib/shipped.js` does NOT exist in the sandbox (files were removed when work shipped)
  When `scanCheapCandidates(sandboxRoot)` runs
  Then `candidates` contains `shipped-stranded` with signal `missing-files` and `actionable: true`
  And `classifyStaleCandidate(candidate, evidence)` classifies it appropriately based on git evidence

- [ ] **Scenario: Age-only plan is advisory, never actionable (nowMs injection)**
  Given a plan in `plans/implementation/` with no `approved_by` marker and all declared `files:` present in the sandbox
  And no git commits referencing the plan slug in the stubbed evidence
  When `scanCheapCandidates(sandboxRoot, { nowMs: planWriteTime + 15 * 24 * 3600 * 1000 + 1 })` runs (simulating 15 days elapsed via nowMs injection — no fs.utimesSync)
  Then `actionable` is `false` from the cheap scan
  When `classifyStaleCandidate(candidate, evidence)` is called with empty stubbed evidence
  Then `category` is `'inconclusive'`
  And `proposedAction` is `null`

- [ ] **Scenario: Gate-safety — approved-but-stranded reconciliation does NOT call approvePlan**
  Given a spy on `approvePlan` injected via `executeCleanup(proposal, root, { approvePlan: spyFn })`
  And an `approved-but-stranded` proposal submitted to `executeCleanup`
  When the cleanup is executed after explicit human approval
  Then `spyFn` (the `approvePlan` spy) was NOT called
  And the plan was moved to `done/` via the reconciliation path in `stale-cleanup.js`

- [ ] **Scenario: Gate-safety — movePlan not called directly for reconciliation**
  Given a spy on `movePlan` injected via `executeCleanup(proposal, root, { movePlan: spyFn2 })`
  And an `approved-but-stranded` proposal submitted to `executeCleanup`
  When the cleanup executes
  Then `spyFn2` (the `movePlan` spy) was NOT called directly by the cleanup execution

- [ ] **Scenario: No action without explicit approve**
  Given 2 proposals constructed in the test harness
  And no approve signal sent by the test harness
  When the cleanup dispatcher is invoked without an approval flag
  Then no plan file in the sandbox has been moved, stamped, or deleted
  And both proposals are still present in the pending list

- [ ] **Scenario: Suite runs cross-platform with hermetic temp sandbox and nowMs injection**
  Given `os.tmpdir()` returns a platform-specific temp directory (e.g. `C:\Temp` on Windows)
  When the regression suite creates sandbox directories using `path.join(os.tmpdir(), 'ctoc-test-' + Date.now())`
  Then all directory creation, plan fixture writing, and path resolution succeeds without a path error
  And age scenarios use `nowMs` injection rather than `fs.utimesSync` (no clock manipulation)
  And the sandbox is cleaned up (`fs.rmSync(sandbox, { recursive: true })`) in the test teardown

### In Scope

- New test file `tests/stale-detection-regression.test.js` with cross-slice fixture-driven scenarios
- `os.tmpdir()` sandbox setup/teardown per test
- Stubbed git evidence (deterministic fixtures, no real git shell calls in the classifier path)
- Spy-based gate-safety assertion using `executeCleanup(proposal, root, deps)` injection seam
- Coverage of all fixture types:
  - Source-stage-with-prior-marker (negative invariant — implementation/ plan with Gate-1 marker)
  - Review-stranded (positive invariant)
  - Shipped-and-stranded functional/ shape (2026-06-15 incident shape)
  - Age-only advisory (via nowMs injection)
- `nowMs` injection for all age scenarios — no `fs.utimesSync` dependency
- All 71+ existing tests remain passing with `# fail 0`

### Out of Scope

- Per-slice unit tests (those live in `tests/stale-detector-cheap.test.js`, `tests/stale-classifier.test.js`, `tests/stale-cleanup-human-gate.test.js` declared by SP1/SP3/SP4)
- Real git invocation in test assertions
- Testing against the live `plans/` directory
- A `plans/done/` negative fixture — the scanner never reads `done/`, so a `done/approved` fixture would give false confidence; the source-stage-with-prior-marker fixture is the correct negative invariant test
- Performance benchmarking or load testing
- New test command or test runner — uses existing `node --test tests/*.test.js`

## Risks

### Technical Risks

- **Risk:** Faking age without `fs.utimesSync` requires passing `nowMs` to `scanCheapCandidates`. If SP1 does not implement the `nowMs` injection seam correctly, age scenarios in SP5 cannot run without filesystem clock manipulation.
  - Likelihood: LOW (`nowMs` injection is declared in SP1's locked contract and acceptance criteria)
  - Impact: MEDIUM (age tests fall back to `fs.utimesSync` which may behave inconsistently across platforms and Node versions)
  - Mitigation: SP5 uses only `nowMs` injection for age scenarios. If the seam is missing in SP1, SP5 raises a failing test (`scanCheapCandidates` signature mismatch), which is immediately visible in CI and forces SP1 to be fixed before SP5 can pass.

- **Risk:** Spying on `approvePlan` and `movePlan` from `src/lib/actions.js` via the `deps` injection seam requires that `executeCleanup` in `stale-cleanup.js` actually uses the injected values rather than its cached module-level imports. If the injection is wired incorrectly, the spy never fires.
  - Likelihood: LOW (the injection seam is declared in SP4's locked contract and acceptance criteria)
  - Impact: MEDIUM (the gate-safety assertion would always pass even if `approvePlan` were called directly, defeating the test purpose)
  - Mitigation: SP5 validates the seam is wired by also asserting that a POSITIVE call (e.g. injecting a spy that asserts it IS called for a non-gate path) works correctly. If the spy never fires in either direction, the wiring is broken and the test fails loudly.

### Business Risks

- **Risk:** The regression suite is only as strong as its fixtures. If the fixture does not exactly replicate the frontmatter structure that real plans use, the cheap detector may not parse it correctly, giving false confidence.
  - Likelihood: LOW (the fixture content mirrors real plan YAML observed in the codebase)
  - Impact: MEDIUM (a fixture that passes but does not test the real parser is a false negative)
  - Mitigation: Use the same `parseFrontmatter` / `parseFilesField` functions from `stale-detector.js` to validate fixtures at test setup time — if the fixture parses correctly, the test is exercising the real code path.

### Dependency Risks

- **Risk:** SP5 depends on SP1–SP4 being complete and merged before the regression suite can be integrated. If any slice changes its API after SP5 is written, the regression suite breaks.
  - Likelihood: LOW (all APIs are locked in prior plans)
  - Impact: LOW (breaking changes are caught at integration time, not silently)
  - Mitigation: SP5 is the last slice in the serial chain (order: 5); it should not begin implementation until SP1–SP4 are complete. CI gates enforce this through the dependency order.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: LOW (1) — depends on SP4 (last in chain); nothing depends on SP5
- Business Impact: HIGH (3) — without this suite the invariants can regress silently; this is the CI safety net for the entire feature
- Technical Risk: HIGH (3) — `nowMs` injection seam coupling and CommonJS spy injection are both genuinely tricky; mistakes produce false-green tests (the worst kind)

## Decisions Taken Under Ambiguity

- **Test isolation:** `os.tmpdir()` sandbox per test, not against live `plans/`. Avoids coupling to the repo's evolving plan set and real git state.
- **Git evidence in tests:** stub the git-evidence input to `classifyStaleCandidate()` (deterministic fixtures). Git invocation is the verifier's boundary and is tested at the SP3 level in `stale-classifier.test.js`, not re-run here.
- **Placement:** cross-slice invariants in `stale-detection-regression.test.js`; per-slice unit tests stay in their own SP1/SP3/SP4 files. No duplication.
- **Spy injection via `deps` parameter:** `executeCleanup(proposal, root, deps)` accepts optional `deps` overrides for `approvePlan`/`movePlan` to enable the gate-safety spy assertion without fighting CommonJS module caching. Declared in SP4; consumed here.
- **Age scenarios via `nowMs` injection:** `scanCheapCandidates(root, { nowMs })` is the seam for age scenarios — no `fs.utimesSync` call anywhere in SP5. `nowMs` is set to `planWriteTime + 15 days + 1ms` to simulate an old plan. This is deterministic and cross-platform.
- **Negative invariant fixture is source-stage-with-prior-marker, not done/approved:** the scanner never reads `done/`; a `done/approved` fixture would give false confidence by testing a path the scanner doesn't exercise. The correct negative invariant is an `implementation/` plan with a Gate-1 marker that must NOT be flagged.
- **Shipped-and-stranded fixture:** replicates the 2026-06-15 session's incident shape — a `functional/` plan with files declared and either present (age-only advisory) or absent (missing-files actionable). This is the real shape the feature was built to catch.
- **SP5 `files:` trimmed:** only `tests/stale-detection-regression.test.js`. The per-slice test files are declared by SP1/SP3/SP4 and are not repeated here — repeating them would create false coverage claims and confuse the enforcement hook.

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
  - tests/stale-detector-cheap.test.js
  - tests/stale-classifier.test.js
  - tests/stale-cleanup-human-gate.test.js
status: refined
acceptance_criteria_count: 7
risk_level: LOW
---

# SP5 — Regression suite for stale detection & gate safety

## 1. ASSESS — Problem Understanding

### Business Context

The entire value of the stale-detection feature rests on two invariants never breaking: a shipped, approved plan in `done/` must NEVER be flagged stale (false positive), and a stranded `review/` plan must ALWAYS be flagged (false negative). These are the exact failure modes that caused the 2026-06-15 incident — plans that should have been in `done/` were misreported as live backlog. Vision SC4 demands a regression-grade test that proves both directions, end-to-end across SP1/SP3/SP4, in CI on every `node --test tests/*.test.js` run.

### Current State

The per-slice test files (`tests/stale-detector-cheap.test.js`, `tests/stale-classifier.test.js`, `tests/stale-cleanup-human-gate.test.js`) are declared in SP1/SP3/SP4 respectively. Each tests its own slice in isolation. There is no cross-slice regression test that wires the full pipeline — cheap detection through classification through cleanup gate-safety — in a single fixture-driven suite. `tests/stale-detection-regression.test.js` does not yet exist.

### Impact

Without a cross-slice regression test, any future change to any of the four modules could silently break the negative invariant (flagging `done/approved` plans) or the positive invariant (missing stranded plans), and no CI check would catch it before the phantom backlog problem recurs. The 2026-06-15 incident would be reproducible on the next sprint without detection.

## 2. ALIGN — Business Alignment

### Business Goals

1. A dedicated regression test file `tests/stale-detection-regression.test.js` that uses `os.tmpdir()` sandboxes (hermetic, cross-platform, not coupled to the live `plans/` tree or real git state).
2. Assert the negative invariant: a plan in `done/` with `approved_by: human` in its frontmatter produces zero stale/actionable candidates from `scanCheapCandidates()`.
3. Assert the positive invariant: a plan in `review/` with `approved_by: human` in its frontmatter that has never advanced is always returned, always classified `approved-but-stranded`, and its proposed action is always `advance-via-approvePlan`.
4. Assert the gate-safety invariant end-to-end: no cleanup action executes without an explicit approve; the `approved-but-stranded → done` crossing routes through `approvePlan()` and NOT via direct `movePlan()` or the move script.
5. All 71+ test files continue to pass with `# fail 0` under `node --test tests/*.test.js`.

### Success Metrics

- **M1:** `stale-detection-regression.test.js` runs to completion with `# fail 0` in CI, in a fresh temp-dir sandbox, without reading or writing to `plans/`.
- **M2:** Negative regression: a `done/approved` plan fixture produces 0 candidates from `scanCheapCandidates()`.
- **M3:** Positive regression: a `review/approved` stranded plan fixture produces exactly 1 candidate, classified `approved-but-stranded` by `classifyStaleCandidate()`, with `proposedAction: 'advance-via-approvePlan'`.
- **M4:** Age-only advisory fixture: a plan with only `advisory:age` signal is never classified as actionable by `classifyStaleCandidate()`.
- **M5:** `dead-on-arrival` fixture: a plan with no tree/git evidence and declared files absent is classified `dead-on-arrival`.
- **M6:** Gate-safety assertion: a spy on `movePlan` from `actions.js` is NOT called directly during `approved-but-stranded` cleanup execution — `approvePlan()` is the only path that moves the plan across Gate 3.
- **M7:** Suite runs cross-platform: all temp-dir construction uses `os.tmpdir()` + `path.join()`, no hardcoded path separators.

### Stakeholders

- CTOC maintainer (primary beneficiary — confidence in the detection contract across every future change)
- CI (runs the suite on every PR touching SP1–SP4 modules)
- SP1/SP3/SP4 (each slice's unit tests remain their own concern; this suite asserts only cross-slice invariants)

### Constraints

- Git evidence is STUBBED in the regression suite — the classifier is the unit under test; real git invocation is the scout's concern and is boundary-tested, not re-run here.
- Fixtures are built in `os.tmpdir()` sandboxes, not against the live `plans/` tree.
- All plan fixtures are written fresh per test using `fs.promises` with `path.join()`.
- The suite must not introduce a new test command — it runs under `node --test tests/*.test.js` alongside all 71+ existing tests.
- Cross-platform: no `bash`, no `execSync` for path manipulation.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC maintainer,
**I want** a regression test that proves the done/approved plan is never flagged stale,
**so that** no future change to the cheap detector, classifier, or cleanup module silently reintroduces phantom backlog.

**As a** CI pipeline,
**I want** the regression suite to run hermetically in a temp-dir sandbox with no real git or live plans dependency,
**so that** it is green on every machine and every branch without environment setup.

### BDD Scenarios

- [ ] **Scenario: Negative regression — done/approved plan never flagged**
  Given a temp-dir sandbox with a `plans/done/` directory
  And a plan file `shipped-plan.md` in `plans/done/` with `approved_by: human` in its YAML frontmatter
  When `scanCheapCandidates(sandboxRoot)` runs
  Then `candidates` does NOT contain `shipped-plan`
  And `count` is 0

- [ ] **Scenario: Positive regression — stranded review plan always flagged and classified**
  Given a temp-dir sandbox with a `plans/review/` directory
  And a plan file `stranded-plan.md` in `plans/review/` with `approved_by: human` in its YAML frontmatter
  And stubbed evidence that the plan's declared files were last modified by a commit after the plan's stage entry
  When `scanCheapCandidates(sandboxRoot)` runs
  Then `candidates` contains `stranded-plan` with signal `marker-in-source-stage` and `actionable: true`
  When `classifyStaleCandidate(candidate, evidence)` is called with the stubbed evidence
  Then `category` is `'approved-but-stranded'`
  And `proposedAction` is `'advance-via-approvePlan'`

- [ ] **Scenario: Age-only plan is advisory, never actionable**
  Given a plan in `plans/implementation/` whose fixture mtime is set to more than 14 days ago
  And the plan has no `approved_by` marker and all declared `files:` exist in the sandbox
  And stubbed evidence with no git commits referencing the plan slug
  When `scanCheapCandidates(sandboxRoot)` runs and then `classifyStaleCandidate(candidate, evidence)` is called
  Then `actionable` is `false` from the cheap scan
  And `category` is `'inconclusive'` from the classifier
  And `proposedAction` is `null`

- [ ] **Scenario: Dead-on-arrival plan classified correctly**
  Given a plan in `plans/functional/` whose declared `files:` do not exist in the sandbox
  And the plan has no `approved_by` marker
  And stubbed evidence with no git commits referencing the plan slug
  When `scanCheapCandidates(sandboxRoot)` runs and then `classifyStaleCandidate(candidate, evidence)` is called
  Then the candidate has a `missing-files` signal and `actionable: true` from the cheap scan
  And `category` is `'dead-on-arrival'` from the classifier
  And `proposedAction` is `'delete'` (no prior approval history)

- [ ] **Scenario: Gate-safety — approved-but-stranded crossing routes through approvePlan only**
  Given a spy on `movePlan` from `src/lib/actions.js`
  And a spy on `approvePlan` from `src/lib/actions.js`
  And an `approved-but-stranded` proposal submitted to `executeCleanup(proposal, root)` in `stale-cleanup.js`
  When the cleanup is executed after explicit human approval
  Then `approvePlan` spy was called exactly once
  And `movePlan` spy was NOT called directly (Gate 3 crossing goes only through `approvePlan`)

- [ ] **Scenario: No action without explicit approve**
  Given 2 proposals rendered in the grouped review surface
  And no approve signal sent by the test harness
  When the grouped review renders and idles
  Then no plan file in the sandbox has been moved, stamped, or deleted
  And both proposals are still present in the pending list

- [ ] **Scenario: Suite runs cross-platform with hermetic temp sandbox**
  Given `os.tmpdir()` returns a platform-specific temp directory (e.g. `C:\Temp` on Windows)
  When the regression suite creates sandbox directories using `path.join(os.tmpdir(), 'ctoc-test-' + Date.now())`
  Then all directory creation, plan fixture writing, and path resolution succeeds without a path error
  And the sandbox is cleaned up (`fs.rmSync(sandbox, { recursive: true })`) in the test teardown

### In Scope

- New test file `tests/stale-detection-regression.test.js` with cross-slice fixture-driven scenarios
- `os.tmpdir()` sandbox setup/teardown per test
- Stubbed git evidence (deterministic fixtures, no real git shell calls)
- Spy-based gate-safety assertion (`movePlan` is not called directly for Gate 3)
- Coverage of all four fixture types: done/approved, review/stranded, age-only advisory, dead-on-arrival
- All 71+ existing tests remain passing with `# fail 0`

### Out of Scope

- Per-slice unit tests (those live in `tests/stale-detector-cheap.test.js`, `tests/stale-classifier.test.js`, `tests/stale-cleanup-human-gate.test.js` declared by SP1/SP3/SP4)
- Real git invocation in test assertions
- Testing against the live `plans/` directory
- Performance benchmarking or load testing
- New test command or test runner — uses existing `node --test tests/*.test.js`

## Risks

### Technical Risks

- **Risk:** Faking `mtime` for the age-only scenario on Windows requires `fs.utimesSync()`, which exists but may behave differently across Node.js versions (especially for files created in the same process).
  - Likelihood: MEDIUM (Node.js `fs.utimesSync` is available cross-platform; edge cases exist for very recent files on FAT32)
  - Impact: LOW (age-only tests are advisory; a failure here does not affect the gate-safety invariants)
  - Mitigation: Use `fs.utimesSync(filePath, pastDate, pastDate)` immediately after writing the fixture, and add a cross-platform note in the test file. If `utimesSync` is unreliable in a CI environment, mock `Date.now()` instead of manipulating mtime.

- **Risk:** Spying on `approvePlan` and `movePlan` from `src/lib/actions.js` requires either module-level injection or a test-seam pattern, since Node.js `require()` caches modules. Naive spying with `sinon` or a manual replacement may not intercept the call if `stale-cleanup.js` caches the import at load time.
  - Likelihood: MEDIUM (CommonJS module caching is a well-known test isolation problem)
  - Impact: MEDIUM (the gate-safety assertion would always pass even if `movePlan` were called directly, defeating the test purpose)
  - Mitigation: Use dependency injection in `stale-cleanup.js` — accept optional `{ approvePlan, movePlan }` overrides in `executeCleanup(proposal, root, deps)` to allow test-seam injection without `require()` cache tricks.

### Business Risks

- **Risk:** The regression suite is only as strong as its fixtures. If the fixture does not exactly replicate the frontmatter structure that real plans use, the cheap detector may not parse it correctly, giving false confidence.
  - Likelihood: LOW (the fixture content mirrors real plan YAML observed in the codebase)
  - Impact: MEDIUM (a fixture that passes but does not test the real parser is a false negative)
  - Mitigation: Use the same `parseFrontmatter` function from `stale-detector.js` to validate fixtures at test setup time — if the fixture parses correctly, the test is exercising the real code path.

### Dependency Risks

- **Risk:** SP5 depends on SP1–SP4 being complete and merged before the regression suite can be integrated. If any slice changes its API after SP5 is written, the regression suite breaks.
  - Likelihood: LOW (all APIs are locked in prior plans)
  - Impact: LOW (breaking changes are caught at integration time, not silently)
  - Mitigation: SP5 is the last slice in the serial chain (order: 5); it should not begin implementation until SP1–SP4 are complete. CI gates enforce this through the dependency order.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: LOW (1) — depends on SP4 (last in chain); nothing depends on SP5
- Business Impact: HIGH (3) — without this suite the invariants can regress silently; this is the CI safety net for the entire feature
- Technical Risk: HIGH (3) — `mtime` manipulation cross-platform and CommonJS spy injection are both genuinely tricky; mistakes produce false-green tests (the worst kind)

## Decisions Taken Under Ambiguity

- **Test isolation:** `os.tmpdir()` sandbox per test, not against live `plans/`. Avoids coupling to the repo's evolving plan set and real git state.
- **Git evidence in tests:** stub the git-evidence input to `classifyStaleCandidate()` (deterministic fixtures). Git invocation is the scout's boundary and is tested at the scout level in SP3's test file, not re-run here.
- **Placement:** cross-slice invariants in `stale-detection-regression.test.js`; per-slice unit tests stay in their own SP1/SP3/SP4 files. No duplication.
- **Spy injection via `deps` parameter:** `executeCleanup(proposal, root, deps)` accepts optional `deps` overrides for `approvePlan`/`movePlan` to enable the gate-safety spy assertion without fighting CommonJS module caching.
- **`mtime` manipulation fallback:** if `fs.utimesSync` is unreliable in CI, mock `Date.now()` or inject a `now` parameter into `scanCheapCandidates(root, opts)` where `opts.nowMs` defaults to `Date.now()`. This makes the age threshold testable without touching the filesystem clock.

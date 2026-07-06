---
iron_loop: true
approved_by: human
approved_at: 2026-07-06T14:15:43.548Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-06T13:40:30.801Z
gate_crossed: functional → implementation
iron_loop: true
---

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
  - tests/gates.test.js
status: refined
acceptance_criteria_count: 9
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

- [ ] **Scenario: gates.test.js asserts the REAL human-gate contract (folded defect fix)**
  Given `tests/gates.test.js` currently constructs literal option arrays inside each
  test and asserts properties of those literals (imports nothing from `src/`) — an
  always-green tautology that a pre-ship review flagged as false-confidence
  When `gates.test.js` is rewritten to drive the real exported gate logic
  Then it exercises `approvePlan` (actions.js) in an `os.tmpdir()` sandbox: approving
  a plan at each `HUMAN_GATES` source stage (functional→implementation,
  implementation→todo, review→done) writes an `approved_by: human` marker whose value
  trims to exactly `human` and moves the plan to the correct destination
  And a transition that is NOT a defined human gate does not receive a gate marker
  And (if `human-gate-check.js` exposes a testable seam) a plan at a gate destination
  lacking the marker is detected as a violation
  And every assertion targets real source behavior — mutating the gate logic breaks a
  test (no literal-only tautology remains)

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

---

# Implementation Details

> Authored by implementation-planner after reading the four seam modules FRESH
> (`stale-detector.js`, `stale-cleanup.js`, `actions.js`, `human-gate-check.js`)
> and the current `tests/gates.test.js`. Signatures below are QUOTED from the
> real code, not the brief. Where the brief and the code diverge, the code wins
> and the discrepancy is called out explicitly (see **Discrepancies vs. brief**).
> This plan writes exactly TWO test files and NO `src/` change. If the executor
> finds a seam genuinely missing at Step 8/10, that is a kickback to the owning
> slice (SP1/SP4), documented in `## Decisions Taken Under Ambiguity` — never a
> silent `src/` edit here.

## Verified seam signatures (read fresh — code quoted)

### 1. `scanCheapCandidates(root, { nowMs } = {})` — `src/lib/stale-detector.js:647`

Confirmed the `nowMs` seam is REAL and correctly wired:

```js
function scanCheapCandidates(root, { nowMs = Date.now() } = {}) {
  if (typeof root !== 'string' || root.length === 0) { throw new TypeError(...); }
  if (!Number.isFinite(nowMs)) { throw new TypeError('scanCheapCandidates: nowMs must be a finite number'); }
```

- **`nowMs` default** = `Date.now()`; a supplied non-finite value throws `TypeError` (misuse). Age scenarios inject `nowMs` — no `fs.utimesSync` anywhere.
- **Age computation** (line 720): `if (nowMs - mtimeMs > AGE_THRESHOLD_MS) signals.push('advisory:age');` where `AGE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000` (line 51). To force an `advisory:age` signal the test injects `nowMs = <fixture mtime read via fs.statSync> + AGE_THRESHOLD_MS + 1`. **The 15-day arithmetic in the brief and BDD scenario is a stronger-than-necessary bound; the real threshold is 14 days. The test derives the mtime from the freshly-written fixture's own `st.mtimeMs` and adds `AGE_THRESHOLD_MS + 1` — NOT a hardcoded `planWriteTime` — so it is exact against the real constant and robust to filesystem mtime granularity.**
- **Return shape** (line 733): `{ candidates, count }` where `count === candidates.length`.
- **Candidate shape** (lines 724-729), each element:
  ```js
  { plan: slug,                 // filename without '.md'
    stage,                      // 'functional' | 'implementation' | 'review'
    signals,                    // StaleSignal[], canonical order: 'missing-files' first, 'advisory:age' last
    actionable: signals.includes('missing-files') }   // advisory:age alone => false
  ```
- **Signal names** are exactly two: `'missing-files'` (actionable) and `'advisory:age'` (advisory-only). **There is NO `marker-in-source-stage` signal in the code.** The module docstring (lines 30-35) states this outright: *"No marker-based signal exists… the human approval marker carries zero discriminating power at the gate-source stages… so it is not read at all (F1)."*
  - **DISCREPANCY (load-bearing, SP5 risk #1 territory):** BDD scenarios *"Positive regression"* and *"Negative regression"* and metrics M2/M3 name a `marker-in-source-stage` signal. **That signal does not exist and never fires.** A test asserting `candidate.signals` contains `'marker-in-source-stage'` would fail forever (false red) — or worse, if written as "does NOT contain", would be a vacuous always-green tautology (the exact false-green SP5 exists to prevent). **Resolution:** the regression test asserts against the signals that ACTUALLY exist. The "positive regression" fixture is made actionable via the `missing-files` signal (remove a declared file), not a mythical marker signal. This is documented in `## Decisions Taken Under Ambiguity` below and is the single most important discrepancy in this plan.
- **Stages scanned** (line 67): `GATE_SOURCE_STAGES = ['functional', 'implementation', 'review']`. The scanner never reads `done/` — confirms the plan's negative-invariant reasoning.
- **`missing-files` polarity by stage:** the cheap scan emits `missing-files` for ANY gate-source stage when a declared file is absent (lines 719, `hasMissingFiles`). The `NOT_STARTED_STAGES` allowlist (`vision`, `canvas`, `functional`, line 79) only affects the CLASSIFIER, not the cheap scan. So a `functional/` plan with a missing file IS actionable at cheap-scan time (`actionable: true`) but the classifier downgrades it to `inconclusive` (not-started gate, classifier step 1). This split matters for the shipped-and-stranded `functional/` scenario — see the classifier notes.

### 2. `classifyStaleCandidate(candidate, evidence)` — `src/lib/stale-detector.js:540`

Pure, deterministic, degrade-never-throw, **first-match-wins**. This is the SD1-hardened classifier. Categories and actions, in match order:

| # | Category | Guard (quoted intent) | `proposedAction` |
|---|----------|-----------------------|------------------|
| entry | `inconclusive` | `!candidate \|\| typeof candidate !== 'object'` → `{plan:null,...}` | `null` |
| 0 | `inconclusive` | `!evidence \|\| !evidence.gitAvailable` | `null` |
| 1 | `inconclusive` (not-started gate) | `anyFileMissing && slugMatchCount===0 && !approvedBy && !explicitlyRejected && NOT_STARTED_STAGES.has(stage)` | `null` |
| 2 | `dead-on-arrival` | `anyFileMissing && slugMatchCount===0 && !approvedBy` (past not-started) | `explicitlyRejected===true ? 'delete' : 'revert'` |
| 3 | `approved-but-stranded` | `approvedBy && filesModifiedAfterEntry` | `'advance-via-reconciliation'` |
| 4 | `shipped-but-early` | `slugMatchAfterEntry && filesModifiedAfterEntry && allFilesExist` | `'archive-to-done'` |
| 5 | `inconclusive` (catch-all: age-only, thin evidence) | everything else | `null` |

- **Evidence shape it reads** (`StaleEvidence`, lines 287-306 typedef; branches read): `gitAvailable`, `error`, `approvedBy`, `anyFileMissing`, `allFilesExist`, `explicitlyRejected`, `filesModifiedAfterEntry`, `slugMatchCommits` (length → `slugMatchCount`), `slugMatchAfterEntry`. Plus `candidate.stage` for the not-started gate.
- **Category name is `dead-on-arrival`** (string), not `DOA`. Actions are the literal strings `'advance-via-reconciliation'`, `'archive-to-done'`, `'revert'`, `'delete'`, or `null`.
- **Git is STUBBED in the regression suite by construction:** `classifyStaleCandidate` takes `evidence` as a plain argument and performs NO I/O and NO subprocess. The test builds `evidence` objects literally (deterministic). Real git only lives inside `verifyStaleCandidate` (line 333), which the regression suite does NOT call. This satisfies the "stub git, no real invocation in the classifier path" constraint exactly.

### 3. `executeCleanup(proposal, root, deps = {})` — `src/lib/stale-cleanup.js:281`

**The `deps` injection seam IS real and IS consumed — but selectively. Read the code carefully; this is SP5 risk #2.**

Confirmed consumption:
- **`deps.listStaleCandidates`** IS consumed (line 282): `const scanFn = deps.listStaleCandidates || listStaleCandidates;` then `const scan = scanFn(root);`. This drives stage re-derivation. **The test MUST inject `deps.listStaleCandidates` returning the candidate for the fixture's slug/stage, otherwise `executeCleanup` calls the real `inbox.listStaleCandidates` → real `scanCheapCandidates` against the sandbox — which works, but injecting is cleaner and deterministic. Either is valid; injecting is preferred for isolation.**
- **`deps.movePlan`** IS consumed, but ONLY inside `revertPlan` (line 220): `const move = deps.movePlan || movePlan;`. It is passed through from `executeCleanup` via `case 'revert': return revertPlan(planPath, root, deps);` (line 324). **`movePlan` is reachable through `deps` ONLY on the `'revert'` path.**
- **`deps.approvePlan`** is **NEVER referenced by any branch.** The dispatcher docstring (lines 270-275) states it plainly: *"approvePlan: part of the documented seam contract for SP5's negative assertion; NEVER referenced by any branch (gate-safety is structural)."* And the module header (lines 33-42): `const { movePlan } = require('./actions');` — `approvePlan` is deliberately NOT imported. **Structural gate-safety D2 confirmed by reading.**
- **`advance-via-reconciliation` path** (line 321-322): `case 'advance-via-reconciliation': return reconcilePlan(planPath, root);` → `reconcilePlan` (line 202) → `_stampAndArchive` (line 144). This path calls NEITHER `approvePlan` NOR `movePlan` — it does its own `writeFileSync` (stamp) then `renameSync` (line 168-170). Confirmed by reading `_stampAndArchive`.

**Seam-liveness consequence for the gate-safety spies (the false-green trap):**

- On the `advance-via-reconciliation` path, an injected `deps.approvePlan` spy will NEVER fire — **but neither will an injected `deps.movePlan` spy**, because reconciliation uses raw `renameSync`, not `movePlan`. So on the reconciliation path, asserting "movePlan spy IS wired/live" by expecting it to fire is IMPOSSIBLE — it structurally cannot fire there.
- **Therefore the "prove the spy is live" assertion for M6 CANNOT use `deps.movePlan` on the reconciliation path** (contradicts a literal reading of the brief's parenthetical *"also asserting the deps.movePlan spy IS wired"*). The only path where `deps.movePlan` is genuinely consumed is `'revert'`.
- **Resolution (documented, seam-liveness proof preserved):** Prove `deps.movePlan` is a LIVE seam with a SEPARATE positive control test on the `'revert'` path — inject a `deps.movePlan` spy against a `dead-on-arrival`/`revert` proposal and assert it IS called with `(planPath, prior, root)`. That proves the `deps` object is genuinely threaded into `executeCleanup` and consumed (not silently dropped). Then, on the `advance-via-reconciliation` path, assert BOTH `deps.approvePlan` spy and `deps.movePlan` spy were NOT called — and, critically, assert the OBSERVABLE side effect that proves the reconciliation actually ran: the fixture file is gone from `plans/review|functional/` and now exists at `plans/done/<slug>.md` with an `approved_by: human` marker in its (now first) frontmatter block. **The side-effect assertion is what makes the never-fired spy meaningful: a spy that never fires because the whole call no-op'd is caught by asserting the move DID happen. This is the seam-liveness proof M6 actually needs, corrected for the real code.** See `## Decisions Taken Under Ambiguity`.
- **M7 exact encoding:** M7 reads *"a spy on `movePlan` injected via `deps` is NOT called directly for any archive or reconciliation path (it is only called as an internal implementation detail within `stale-cleanup.js`, not by SP4 callers passing through `approvePlan`)."* Encoded literally: on the `advance-via-reconciliation` proposal, `deps.movePlan` spy `.called === false`. (Reconciliation uses `renameSync`, never `movePlan` — so this holds by construction, and the test pins it so a future refactor that routed reconciliation through `movePlan`+`approvePlan` would break it.)

### 4. Gate logic for the `gates.test.js` fold — `src/lib/actions.js` + `src/hooks/human-gate-check.js`

- **`HUMAN_GATES`** — `src/lib/actions.js:68`: `{ 'functional': 'implementation', 'implementation': 'todo', 'review': 'done' }` (source→dest). Mirrored in `src/hooks/human-gate-check.js:21` as dest→source (for revert): `{ 'implementation':'functional', 'todo':'implementation', 'done':'review' }`.
- **`approvePlan(planPath, projectPath)`** — `src/lib/actions.js:82`, exported (line 742). Behavior confirmed by reading:
  - Computes `relativePath` = `path.relative(plansDir, planPath)`; matches a `flowMap` entry by `relativePath.startsWith(from)` (line 95). **Because it matches on `startsWith(from)`, the plan file MUST live under `plans/<from>/` for the branch to fire. The test writes each fixture into the real source-stage dir inside the sandbox.**
  - `isHumanGate = HUMAN_GATES[from] === to` (line 100). For all three flowMap entries this is `true` (flowMap === HUMAN_GATES value-for-value), so **every** approvePlan transition in scope writes the marker.
  - When `isHumanGate`: reads content, `addApprovalMarker(content, from, to)` (line 75) PREPENDS `---\napproved_by: human\napproved_at: <ISO>\ngate_crossed: <from> → <to>\n---\n\n`, writes it back (lines 102-104), THEN `movePlan(planPath, to, projectPath)` (line 112) renames into `plans/<to>/`.
  - `to === 'todo'` triggers `applyIronLoop(planPath)` (line 108-110) BEFORE the move. **This is a real hazard for the `implementation → todo` gate test: `applyIronLoop` calls `refineLoop(planPath)` (iron-loop.js), which may perform heavy work / spawn refinement.** See test-design note "IL-hazard" below.
  - Returns `{ newPath, backgroundAgent, humanGate }`. `humanGate === isHumanGate === true` for all three.
- **`human-gate-check.js` testability:** it is a **hook script with a top-level `main()` call at module scope (line 166) and `process.exit(0)` (line 163)** — it exports NOTHING (no `module.exports`). `hasApprovalMarker`, `checkFolder`, `revertPlan`, `main` are all module-private. **It is NOT unit-testable via require() — requiring it would execute `main()` against the real `process.cwd()` and call `process.exit`.** It also hardcodes `PLANS_DIR = path.join(process.cwd(), 'plans')` at module load (line 16), so it cannot be pointed at a sandbox without `process.chdir` + a child process.
  - **CHOSEN APPROACH (stated per brief):** Do **NOT** exercise `human-gate-check.js` from `gates.test.js`. Keep `gates.test.js` focused on `approvePlan`'s unit contract (marker write + move + `humanGate` flag) which IS the exported, unit-testable seam. Enforcement/violation detection (the "plan at a gate destination without a marker is reverted") is a process-spawn concern already covered by `tests/e2e-enforcement-and-gates.test.js` and `tests/security-gate-bypass.test.js` (they spawn the hook). **Rationale:** `human-gate-check.js` exposes no testable seam; re-testing it inside `gates.test.js` would require a child-process spawn that duplicates existing e2e coverage and pollutes a unit file. **However**, the *pure marker-parse contract* — "a frontmatter `approved_by` whose value trims to exactly `human` is the ONLY accepted form" — is the exact rule `approvePlan` writes and `human-gate-check.hasApprovalMarker` reads (identical regex family). `gates.test.js` pins that contract at the WRITE side (assert `approvePlan`'s marker value trims to exactly `'human'`), which is where a mutation would originate. This gives the mutation-sensitivity the 9th scenario demands without spawning the hook.

---

## Dependency graph

```
tests/stale-detection-regression.test.js
   ├─ require('node:test')  { describe, it, before, after, beforeEach, afterEach }
   ├─ require('node:assert')  (strict)
   ├─ require('node:fs')            → mkdirSync, writeFileSync, rmSync, statSync, existsSync, readFileSync
   ├─ require('node:os')            → tmpdir()
   ├─ require('node:path')          → join, basename
   ├─ require('../src/lib/stale-detector')   → scanCheapCandidates, classifyStaleCandidate,
   │                                            parseFilesField, extractFrontmatterRegion, AGE_THRESHOLD_MS
   └─ require('../src/lib/stale-cleanup')     → executeCleanup

tests/gates.test.js  (REWRITE)
   ├─ require('node:test')  { describe, it, before, after }
   ├─ require('node:assert')  (strict)
   ├─ require('node:fs'), require('node:os'), require('node:path')
   └─ require('../src/lib/actions')   → approvePlan, HUMAN_GATES

No cycles. Both files are LEAF test consumers. Neither imports the other. Neither
touches src/. stale-cleanup.js will, inside executeCleanup, require inbox.js +
actions.js transitively — but the reconciliation path used by the gate-safety
tests calls neither approvePlan nor movePlan (verified above), and the test
injects deps.listStaleCandidates so no real inbox scan is required.
```

## Implementation order

1. `tests/stale-detection-regression.test.js` (CREATE) — independent; depends only on the already-shipped SP1/SP3/SP4 `src/` modules.
2. `tests/gates.test.js` (REWRITE / overwrite) — independent; depends only on `actions.js`.

Order is not load-bearing (the two files share no state and no fixtures). Both are written at Step 10 as sub-items of ONE IMPLEMENT step.

---

## File specification 1 — `tests/stale-detection-regression.test.js` (CREATE)

**Purpose:** Cross-slice regression proving the stale-detection contract (cheap scan → classify → gated cleanup) end-to-end in a hermetic sandbox. **The two SP5 files are SP5's ONLY writes.**

### Shared harness (module-top helpers, NOT a src change)

- `makeSandbox()` → `const root = path.join(os.tmpdir(), 'ctoc-sp5-' + process.pid + '-' + Date.now() + '-' + (n++));` then `fs.mkdirSync(path.join(root,'plans','functional'),{recursive:true})` and the same for `implementation`, `review`, `done`. Return `root`.
- `teardown(root)` → `fs.rmSync(root, { recursive: true, force: true })`. Registered per-test via `afterEach`/`after` so a thrown assertion still cleans up. Cross-platform (no shell `rm`).
- `writePlan(root, stage, slug, frontmatterObj, files=[])` → writes `plans/<stage>/<slug>.md` with a real leading `---…---` frontmatter block, and creates each declared file under `root` (via `fs.mkdirSync(path.dirname,...)` + `writeFileSync`) UNLESS the scenario wants it absent.
- **Fixture-parse validation (SP5 risk #3 mitigation, MANDATORY):** immediately after writing each fixture, re-read it and assert with the DETECTOR's OWN parsers:
  ```
  const region = extractFrontmatterRegion(fs.readFileSync(planPath,'utf8'));
  assert.deepStrictEqual(parseFilesField(region), expectedDeclaredFiles);
  ```
  If a fixture's frontmatter is mis-shaped, this fails LOUDLY at setup, not silently mid-assertion. Uses the SAME `parseFilesField`/`extractFrontmatterRegion` the scanner uses (both exported, confirmed line 741).
- `ageInject(planPath)` → `fs.statSync(planPath).mtimeMs + AGE_THRESHOLD_MS + 1` — the deterministic `nowMs` for age scenarios. **No `fs.utimesSync` anywhere.**
- `evidence(overrides)` → returns a full `StaleEvidence`-shaped object with safe defaults (`gitAvailable:true, approvedBy:null, anyFileMissing:false, allFilesExist:true, explicitlyRejected:false, filesModifiedAfterEntry:false, slugMatchCommits:[], slugMatchAfterEntry:false, stageEntryEpoch:null, filesLastModifiedEpoch:null, declaredFiles:[]`) merged with `overrides`. Git is stubbed by literal construction.

### Test cases (named `it(...)`), all wrapped in one `describe('SP5 — stale-detection regression', ...)`

| # | `it(...)` name | Maps to BDD scenario | Metric | Asserts (against REAL code) |
|---|----------------|----------------------|--------|-----------------------------|
| T1 | `negative invariant: healthy implementation/ plan with Gate-1 marker + all files present yields 0 actionable candidates` | Negative regression | M2 | write `plans/implementation/healthy-impl-plan.md` with `approved_by: human` in frontmatter (two-block shape via `_stampMarker`-style prepend) and `files:[src/lib/present.js]` present; `const r = scanCheapCandidates(root)`; assert `r.count === 0` AND `r.candidates.every(c => c.plan !== 'healthy-impl-plan')` AND no candidate carries any signal for it. (No `marker-in-source-stage` assertion — that signal does not exist; see discrepancy.) |
| T2 | `positive invariant: stranded review/ plan is flagged actionable and classifies approved-but-stranded → advance-via-reconciliation` | Positive regression | M3 | write `plans/review/stranded-plan.md` with `approved_by: human` and `files:[src/lib/gone.js]` where `gone.js` is NOT created; `scanCheapCandidates(root)` → assert exactly one candidate `stranded-plan`, `signals` includes `'missing-files'`, `actionable === true`; then `classifyStaleCandidate(candidate, evidence({approvedBy:'human', anyFileMissing:true, filesModifiedAfterEntry:true, slugMatchCommits:[{...}], slugMatchAfterEntry:true, allFilesExist:false}))` → `category==='approved-but-stranded'`, `proposedAction==='advance-via-reconciliation'`. **The actionable signal is `missing-files`, not a marker signal — this is the corrected positive invariant.** |
| T3a | `shipped-and-stranded functional/ with files present → advisory:age only, not actionable` | Shipped-and-stranded | M4 | write `plans/functional/shipped-stranded.md`, `files:[src/lib/shipped.js]` PRESENT; `scanCheapCandidates(root, { nowMs: ageInject(planPath) })` → candidate exists with `signals===['advisory:age']`, `actionable===false`. |
| T3b | `shipped-and-stranded functional/ with files removed → missing-files actionable, classifier not-started ⇒ inconclusive` | Shipped-and-stranded | M4 | same fixture but `shipped.js` absent; `scanCheapCandidates(root)` → `signals` includes `'missing-files'`, `actionable===true`; `classifyStaleCandidate(cand, evidence({anyFileMissing:true}))` with `candidate.stage==='functional'` → `category==='inconclusive'`, `proposedAction===null` (classifier step 1: not-started gate — functional ∈ NOT_STARTED_STAGES). **This pins the real classifier polarity: cheap-actionable but classifier-benign for a not-started stage.** |
| T4 | `age-only advisory via nowMs is never actionable and classifies inconclusive/null` | Age-only advisory | M5 | `plans/implementation/age-only.md`, NO `approved_by`, `files:[src/lib/exists.js]` PRESENT; `scanCheapCandidates(root, { nowMs: ageInject(planPath) })` → `signals===['advisory:age']`, `actionable===false`; `classifyStaleCandidate(cand, evidence())` (empty/default, `gitAvailable:true`, nothing missing) → `category==='inconclusive'`, `proposedAction===null` (classifier step 5 catch-all). |
| T5 | `gate-safety M6: advance-via-reconciliation does NOT call approvePlan; move happens via reconciliation` | Gate-safety approvePlan | M6 | write `plans/review/recon-plan.md` (+ its declared file present so `_stampAndArchive` succeeds); `const approveSpy = mkSpy(); const moveSpy = mkSpy();` `executeCleanup({plan:'recon-plan', proposedAction:'advance-via-reconciliation'}, root, { approvePlan: approveSpy, movePlan: moveSpy, listStaleCandidates: () => [{plan:'recon-plan', stage:'review', signals:['missing-files'], actionable:true}] })`; assert `approveSpy.called === false` AND `moveSpy.called === false`; **seam-liveness side-effect proof:** assert `!fs.existsSync(plans/review/recon-plan.md)` AND `fs.existsSync(plans/done/recon-plan.md)` AND the moved file's first frontmatter block contains `approved_by: human` and `gate_crossed: stale-reconciliation`. |
| T6 | `seam-liveness positive control: deps.movePlan IS consumed on the revert path` | (supports M6/M7 — proves spy wiring is live) | M6/M7 | write `plans/implementation/doa-plan.md`, `files:[src/lib/gone2.js]` absent; `const moveSpy = mkSpy(() => path.join(root,'plans','functional','doa-plan.md'));` `executeCleanup({plan:'doa-plan', proposedAction:'revert'}, root, { movePlan: moveSpy, listStaleCandidates: () => [{plan:'doa-plan', stage:'implementation', ...}] })`; assert `moveSpy.called === true` and `moveSpy.calledWith[0]` is the `plans/implementation/doa-plan.md` path, `[1] === 'functional'`, `[2] === root`. **This is the positive control that proves `deps` is genuinely threaded — so T5's never-fired spies are meaningful, not vacuous.** |
| T7 | `gate-safety M7: movePlan not called directly on the reconciliation path` | Gate-safety movePlan | M7 | subset of T5's assertions isolated as its own case: on `advance-via-reconciliation`, `moveSpy.called === false` (reconciliation uses renameSync, never movePlan). Encodes M7's exact wording. |
| T8 | `no action without explicit approve: unknown/none action moves/stamps/deletes nothing; both proposals remain` | No-action-without-approve | (gate-safety) | write two fixtures at review/implementation; call `executeCleanup({plan:'p1', proposedAction:null}, root, {listStaleCandidates:()=>[{plan:'p1',stage:'review',...}]})` and same for `p2` → each returns `{action:'none', skipped:true}` (dispatcher default branch, line 330-332); assert BOTH fixture files still exist at their original stage, unchanged (byte-compare frontmatter), and neither `plans/done/` entry exists. |
| T9 | `cross-platform hermetic: sandbox build+teardown succeed; age via nowMs not utimes` | Cross-platform hermetic | M1, M8 | structural: assert `makeSandbox()` created all five stage dirs under `os.tmpdir()`; assert the test module contains no `utimesSync` usage (self-check: grep the harness helper names — enforced by construction/comment, and by the fact ALL age cases use `ageInject`); `afterEach` teardown removes the sandbox (`assert(!fs.existsSync(root))` after teardown). Every path via `path.join`. |

`mkSpy(returnValue?)` → a plain closure recording `{ called, callCount, calledWith }`; no test-double library (pure JS, cross-platform). Confirmed no external dep needed.

**IL-hazard note:** none of these cases call `approvePlan` on the `implementation → todo` gate, so `applyIronLoop` is NOT triggered here. (It is triggered in gates.test.js T-b below — mitigated there.)

---

## File specification 2 — `tests/gates.test.js` (REWRITE — overwrite the 364-line literal-array tautology file)

**Purpose:** Replace every literal-array tautology (the current file imports NOTHING from `src/`; every `assert` targets a self-constructed literal — always green regardless of source) with behavioral assertions against the REAL exported `approvePlan` + `HUMAN_GATES`, mutation-sensitive by construction.

**What is being replaced (the fiction, read fresh):** all 22 `testXxx()` functions (lines 8-338) construct local arrays like `[{label:'Yes, proceed'}, ...]` and assert `.length`, `.label`, `parseInt` arithmetic, and template-string `.includes()` — NONE of which import or exercise any gate logic. `testChoiceParsingInvalid` etc. test `parseInt`, not CTOC. This is exactly the false-confidence a pre-ship review flagged.

### Rewrite design (node:test, `describe`/`it`, `os.tmpdir()` sandbox)

Harness identical in spirit to spec 1: `makeSandbox()` builds `plans/{functional,implementation,todo,review,done}` under `os.tmpdir()`; `teardown` via `fs.rmSync(recursive)`; `writePlan(root, stage, slug, body)` writes a minimal valid plan (a `# Title` heading + a body; NO pre-existing approval marker).

| # | `it(...)` name | Asserts (targets source behavior) |
|---|----------------|-----------------------------------|
| G1 | `HUMAN_GATES is the exact source map (imported, not reconstructed)` | `const { HUMAN_GATES } = require('../src/lib/actions'); assert.deepStrictEqual(HUMAN_GATES, {functional:'implementation', implementation:'todo', review:'done'})`. **Imports the real constant** — mutating the source map breaks this. (Not a tautology: the literal is the EXPECTATION, the subject is the imported value.) |
| G2 | `approvePlan across functional→implementation writes approved_by:human marker (trims to exactly "human") and moves to implementation` | write `plans/functional/g-func.md`; `const { newPath, humanGate } = approvePlan(planPath, root)`; assert `humanGate === true`; assert `!fs.existsSync(old functional path)`; assert `fs.existsSync(plans/implementation/g-func.md)` and `newPath` ends with that; parse the moved file's FIRST frontmatter block, find `approved_by`, assert its value `.replace(/^["']\|["']$/g,'').trim() === 'human'` (exact-match, mirrors human-gate-check parse rule). |
| G3 | `approvePlan across review→done writes marker and moves to done` | same shape, `plans/review/g-rev.md` → `plans/done/g-rev.md`; assert marker value trims to exactly `'human'`, `humanGate===true`. **`review→done` also fires the deployment trigger (actions.js:126) — mitigated: the sandbox has no `.ctoc` deployment config, so `getDeploymentConfig(root).enabled` is falsy and `runDeploymentPipeline` never runs. Confirmed by reading lines 126-139 (wrapped in `try` + `if (config.enabled)`).** |
| G4 | `approvePlan across implementation→todo writes marker and moves to todo` | write `plans/implementation/g-impl.md`; `approvePlan` → `plans/todo/g-impl.md`; assert marker + `humanGate===true`. **IL-hazard mitigation:** `to==='todo'` triggers `applyIronLoop` → `refineLoop`. `applyIronLoop` early-returns if `metadata.iron_loop` is truthy (actions.js:170-172, reads via `parseMetadata` = FIRST frontmatter block). **Mitigation: write the g-impl fixture with `iron_loop: true` in its (single) frontmatter block so `applyIronLoop` short-circuits at line 171 and does NO refinement work** — the test then exercises the gate marker + move, not the refinement engine. Documented in `## Decisions Taken Under Ambiguity`. |
| G5 | `a non-gate transition receives no gate marker` | Two-part, both mutation-sensitive: (a) `approvePlan` on a plan NOT under any flowMap source stage (e.g. write `plans/todo/g-x.md`) throws `Unknown plan location` (actions.js:161) — assert `assert.throws(() => approvePlan(planPath, root), /Unknown plan location/)`, and assert NO marker was added to the file (it was never touched). (b) Positively assert that `HUMAN_GATES` has no key for a non-source stage: `assert.strictEqual(HUMAN_GATES['todo'], undefined)` and `assert.strictEqual(HUMAN_GATES['done'], undefined)` — pins that `todo`/`done` are not gate SOURCES. |

### Mutation-sensitivity proof (the 9th scenario's anti-tautology bar)

**Named source line whose mutation breaks the rewritten suite:** `src/lib/actions.js:76` —
```js
const marker = `---\napproved_by: human\napproved_at: ${new Date().toISOString()}\ngate_crossed: ${from} → ${to}\n---\n\n`;
```
Mutating the literal `human` (e.g. to `humans`, `Human`, or `robot`) makes the written `approved_by` value no longer trim to exactly `'human'`, breaking G2/G3/G4's exact-match assertion. Equivalently, mutating `src/lib/actions.js:68` (`HUMAN_GATES` map) breaks G1's `deepStrictEqual` and G5(b); mutating `approvePlan`'s move target (`movePlan(planPath, to, ...)`, line 112) breaks the destination-existence assertions in G2-G4. **No assertion in the rewritten file targets a self-constructed literal in isolation; every `assert` reads an imported constant or an observable side effect of `approvePlan`.** The old file had ZERO such assertions.

---

## Step 7 SPEC — BDD scenario + metric → named test mapping

| BDD scenario (plan §CAPTURE) | Metric | Test(s) |
|------------------------------|--------|---------|
| Negative regression — implementation-stage plan with Gate-1 marker not flagged | M2 | T1 |
| Positive regression — stranded review plan always flagged and classified | M3 | T2 |
| Shipped-and-stranded functional plan detected via missing-files | M4 | T3a, T3b |
| Age-only plan is advisory, never actionable (nowMs injection) | M5 | T4 |
| Gate-safety — approved-but-stranded reconciliation does NOT call approvePlan | M6 | T5 (+ T6 positive control) |
| Gate-safety — movePlan not called directly for reconciliation | M7 | T7 (+ T6 positive control) |
| No action without explicit approve | — | T8 |
| gates.test.js asserts the REAL human-gate contract (folded defect fix) | — | G1–G5 |
| Suite runs cross-platform with hermetic temp sandbox and nowMs injection | M1, M8 | T9 (+ every case uses os.tmpdir/path.join; every age case uses ageInject) |

**Risk mitigations wired into the SPEC:**
- **SP5 risk #1 (nowMs seam):** confirmed present (line 647); age cases derive `nowMs` from the fixture's real mtime + `AGE_THRESHOLD_MS + 1` (exported constant, line 743) — exact, no utimes, no hardcoded interval.
- **SP5 risk #2 (spy never fires → false green):** the never-fired `approvePlan`/`movePlan` spies (T5/T7) are made meaningful by (a) the T6 positive control proving `deps.movePlan` is a live, consumed seam on the revert path, and (b) T5's side-effect assertion proving the reconciliation move actually happened (file left review/, now in done/ with the marker). A vacuous no-op cannot pass both.
- **SP5 risk #3 (mis-shaped fixture → false confidence):** every fixture is validated at setup with the detector's OWN `extractFrontmatterRegion`/`parseFilesField` before any behavioral assertion runs.

## Steps 8–16 execution checklist (canonical labels)

### Step 8: TEST (TDD Red)
- [ ] Create `tests/stale-detection-regression.test.js` with the shared harness (`makeSandbox`, `teardown`, `writePlan` + fixture-parse validation, `ageInject`, `evidence`, `mkSpy`) and cases **T1–T9**.
- [ ] Overwrite `tests/gates.test.js` with the `node:test` rewrite: harness + cases **G1–G5**; delete ALL 22 literal-array `testXxx` functions.
- [ ] Run `node --test tests/stale-detection-regression.test.js tests/gates.test.js` and confirm each new assertion targets real source behavior (they should PASS immediately against already-shipped SP1/SP3/SP4 + actions.js — this is regression/characterization, so "red-first" means: temporarily flip one assertion, or mentally verify a source mutation would fail it, per the mutation-sensitivity proof).

### Step 9: PREPARE
- [ ] No new dependency, no new script, no `package.json` change. Confirm both files require ONLY `node:*` built-ins + `../src/lib/{stale-detector,stale-cleanup,actions}`.
- [ ] Confirm the two files are the plan's ONLY writes (matches `files:` frontmatter). No `src/` edit.

### Step 10: IMPLEMENT (ONE step, two sub-items)
- [ ] 10a — write `tests/stale-detection-regression.test.js` (T1–T9) per File specification 1.
- [ ] 10b — rewrite `tests/gates.test.js` (G1–G5) per File specification 2.
- [ ] If any seam proves genuinely missing (e.g. `deps.movePlan` NOT consumed on revert, or `scanCheapCandidates` lacks the `nowMs` param): **STOP — kickback to the owning slice (SP1 for nowMs, SP4 for deps), documented in `## Decisions Taken Under Ambiguity`. Do NOT patch `src/` from SP5.** (Reading confirms both seams ARE present, so no kickback is expected.)

### Step 11: REVIEW
- [ ] Self-review: no test asserts only a self-constructed literal (anti-tautology bar); every case maps to a BDD scenario/metric; no `utimesSync`; no real git invoked (classifier fed literal `evidence`); teardown runs on failure paths.

### Step 12: OPTIMIZE
- [ ] Factor the two harnesses' shared helpers cleanly within each file (no cross-file import between test files — keep them independent). No premature abstraction.

### Step 13: SECURE
- [ ] Sandbox roots are under `os.tmpdir()` with a pid+timestamp+counter suffix (no collision, no traversal); teardown is `force:true` recursive scoped to the sandbox root only. No write outside the sandbox. No secrets. No shell/execSync.

### Step 14: VERIFY (quality gate)
- [ ] `node --test tests/*.test.js` → `# fail 0`, `# skipped 0`. All 71+ existing files still pass. New file adds ≥ 9 `it` cases; gates.test.js adds ≥ 5. Coverage of the exercised branches (cheap scan signals, classifier categories 1/3/5, executeCleanup reconciliation+revert+none paths, approvePlan marker+move for all three gates) ≥ 80% on the lines these tests drive.

### Step 15: DOCUMENT
- [ ] Top-of-file doc comment in each test file naming what invariant it guards and why the old gates.test.js was replaced (false-confidence tautology). Reference the discrepancy: the code emits `missing-files`/`advisory:age` only — there is NO `marker-in-source-stage` signal.

### Step 16: FINAL-REVIEW
- [ ] implementation-reviewer confirms: BDD→test mapping complete, mutation-sensitivity line named (`actions.js:76`), seam-liveness proof present (T6), fixture-parse validation present, cross-platform, `# fail 0`. Gate 3 (review → done) requires human approval.

## Discrepancies vs. brief (code wins — reported per CF1)

1. **No `marker-in-source-stage` signal exists.** The brief, the BDD scenarios (Positive/Negative regression), and metrics M2/M3 reference a `marker-in-source-stage` signal and say the cheap scan emits it. **The real `scanCheapCandidates` emits ONLY `missing-files` and `advisory:age`; the approval marker is deliberately NOT read at cheap-scan time (stale-detector.js docstring lines 30-35, F1).** The regression tests therefore assert against the real signals: the positive-invariant `review/` fixture is made actionable via `missing-files` (a removed declared file), and T1's negative invariant asserts `count===0` (no signals at all for the healthy plan) rather than "absence of a marker signal". This is the corrected, mutation-sensitive form. A test asserting the mythical signal would be either permanently red or a vacuous always-green tautology — the exact false-green SP5 exists to kill.
2. **`deps.movePlan` is consumed ONLY on the `revert` path**, not on `advance-via-reconciliation` (reconciliation uses raw `renameSync`). So the brief's literal instruction to prove seam-liveness by "also asserting the deps.movePlan spy IS wired" ON THE RECONCILIATION PATH is impossible. Seam-liveness is instead proven by a separate positive-control test on the `revert` path (T6) plus T5's move-side-effect assertion. M6/M7's intent (spy never fires on reconciliation) is preserved and pinned.
3. **Age threshold is 14 days, not 15.** The BDD text and a Decision say "15 days"; `AGE_THRESHOLD_MS` (line 51) is 14 days. Tests derive `nowMs` from the fixture's real mtime + `AGE_THRESHOLD_MS + 1` (the exported constant), so they are exact against the real threshold regardless of the prose figure.
4. **`human-gate-check.js` is NOT unit-testable** (no `module.exports`; top-level `main()` + `process.exit`; hardcoded `process.cwd()`-based `PLANS_DIR`). Per the brief's option, `gates.test.js` stays focused on `approvePlan`'s unit contract; enforcement/violation detection remains covered by the existing `e2e-enforcement-and-gates.test.js` + `security-gate-bypass.test.js` process-spawn suites. Chosen and stated above (G-section rationale).

## Decisions Taken Under Ambiguity

- **D-SP5-1 (marker signal):** Assert against the real `missing-files`/`advisory:age` signals; do not assert the non-existent `marker-in-source-stage`. Positive invariant made actionable via a removed declared file. (Discrepancy #1.)
- **D-SP5-2 (seam-liveness):** Prove `deps` is a live, consumed seam via a `revert`-path positive control (T6) + a reconciliation move-side-effect assertion (T5), since `deps.movePlan` is not on the reconciliation path. (Discrepancy #2.)
- **D-SP5-3 (age math):** Use `fixture mtime + AGE_THRESHOLD_MS + 1` (exported constant), not a hardcoded 15-day interval. (Discrepancy #3.)
- **D-SP5-4 (human-gate-check):** Not exercised from `gates.test.js` (no testable seam); enforcement stays covered by existing e2e/security-bypass spawn tests. (Discrepancy #4.)
- **D-SP5-5 (IL-hazard):** The `implementation→todo` gate test (G4) writes its fixture with `iron_loop: true` in the frontmatter so `applyIronLoop` short-circuits (actions.js:170-172) and the refinement engine is not driven by a unit test.
- **D-SP5-6 (deployment trigger on review→done, G3):** No `.ctoc` deployment config in the sandbox ⇒ `getDeploymentConfig(root).enabled` falsy ⇒ `runDeploymentPipeline` never runs. No mock needed.
- **D-SP5-7 (no src edit):** Both confirmed seams (`nowMs`, `deps`) are present; no kickback expected. If Step 10 finds one missing, kickback to SP1/SP4 — never a silent `src/` edit from SP5.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review

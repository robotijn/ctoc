---
title: "SP1 — Cheap stale-plan flag on menu open"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: automated-stale-plan-detection
program: ctoc-pipeline-hygiene
order: 1
depends_on: []
files:
  - src/lib/stale-detector.js
  - tests/stale-detector-cheap.test.js
status: refined
acceptance_criteria_count: 8
risk_level: LOW
---

# SP1 — Cheap stale-plan flag on menu open

## 1. ASSESS — Problem Understanding

### Business Context

Plans rot in their stage after their work ships and nobody notices. On 2026-06-15 four `functional/` and ten `review/` plans were misreported as live backlog for approximately 31 days — every dashboard open counted them as work-in-flight when they had already shipped in v6.1.x–v6.3.x. The current `getInboxCounts()` in `src/lib/inbox.js` surfaces questions, decisions, and plans-at-gates, but has no concept of "has this plan's work already shipped?" It is blind to inactivity, missing declared files, and the marker-in-source-stage anomaly (`approved_by: human` present while the plan still sits in a gate source directory).

### Current State

`src/lib/inbox.js` exports `getInboxCounts()`, which calls `listPlansAtGates()` to count every plan in `functional/`, `implementation/`, and `review/` directories (gate source stages per `HUMAN_GATE_SOURCE_STAGES`). No signal distinguishes a legitimately in-flight plan from a phantom plan whose work has long shipped. Detection today requires a manual cross-check of plan files against the git log and the file tree — the exact process that took hours on 2026-06-15.

### Impact

Phantom backlog erodes the dashboard's credibility as a single source of truth. When the overview shows "10 review plans pending," but 10 of them shipped months ago, users stop trusting the counts and stop using the dashboard to manage work. Trust, once lost to false positives, is hard to recover — hence the HYBRID detection decision (evidence-based drives action; age alone never does).

## 2. ALIGN — Business Alignment

### Business Goals

1. Surface stale plan candidates on every menu open using only filesystem reads (zero git calls, zero subprocess invocations) so the hot-path latency stays imperceptibly fast.
2. Create a standalone, independently-testable module `src/lib/stale-detector.js` that `inbox.js` consumes in SP2, keeping concerns separated.
3. Never act on age alone — advisory signals are surfaced but never upgrade a plan to actionable-eligible without a corroborating evidence signal.

### Signal Scope — Actionable vs. Advisory

The `marker-in-source-stage` actionable signal fires for **REVIEW STAGE ONLY** — `approved_by: human` found in a plan file sitting in `plans/review/`. This is the terminal gate source, so a marker there is unambiguous evidence the Gate 3 crossing was never executed.

Implementation-stage plans (`plans/implementation/`) legitimately carry a Gate-1 approval marker (`approved_by: human` stamped when the plan crossed Gate 1). That marker does NOT indicate staleness at the implementation stage — it is the expected state for a plan that has legitimately advanced. A healthy `implementation/` plan with a Gate-1 marker MUST NOT be returned as an actionable candidate.

Plans in `plans/functional/` similarly carry a Gate-0 marker after crossing vision review. These are also not flagged by the `marker-in-source-stage` signal.

Shipped-but-stranded plans in `functional/` or `implementation/` may be caught by the `missing-files` signal (their declared files were removed when the work shipped without the plan being advanced), or by the git-evidence check that runs on SP3 drill-in — not by the marker signal.

### Success Metrics

- **M1:** `scanCheapCandidates(root, { nowMs })` completes without invoking `child_process`, `execSync`, `spawnSync`, or any git binary — asserted by a spy/module-boundary test that fails loudly if the boundary is violated. The `nowMs` parameter (defaults to `Date.now()`) makes the age threshold deterministically testable without mtime manipulation.
- **M2:** A plan file in `plans/review/` that contains `approved_by: human` in its YAML frontmatter is always returned as an ACTIONABLE-eligible candidate with signal `marker-in-source-stage`.
- **M3:** A healthy `plans/implementation/` plan that contains `approved_by: human` (normal Gate-1 marker) and has all declared `files:` present is NOT returned as a candidate.
- **M4:** A plan whose declared `files:` array lists one or more paths that no longer exist on disk is returned with a `missing-files` signal and is ACTIONABLE-eligible.
- **M5:** A plan that is only old (`nowMs - mtime > 14 days`, no other signals) is returned with only an `advisory:age` signal and is NOT marked actionable.
- **M6:** A plan that is fresh, has valid markers for its stage, and has all declared files present yields an empty signals array and is not included as a candidate.
- **M7:** Both YAML `files:` syntaxes are parsed correctly: block-list syntax (`- path/to/file.js` on successive indented lines) and inline-array syntax (`files: [path/to/a.js, path/to/b.js]`). A test exists for each syntax. The `missing-files` signal must not silently fail on inline arrays.
- **M8:** All path construction in the module uses `path.join()` — no string concatenation — so the module is cross-platform on Windows, macOS, and Linux.

### Stakeholders

- CTOC user opening the dashboard (benefits from accurate counts)
- SP2 (consumes `scanCheapCandidates` output to render the Inbox stream)
- SP5 (regression suite asserts SP1's negative and positive invariants)

### Constraints

- No git calls on the hot path. `child_process` must not be imported or invoked in `stale-detector.js`.
- Age threshold: 14 days since plan-file mtime (locked decision; tunable later via `.ctoc/settings` without changing the module's public contract). Age is **advisory and best-effort only** — git checkout rewrites file mtimes, so mtime reflects the last checkout or write, not when the plan was created or last genuinely modified. This is documented in the module JSDoc; the age signal is never acted on alone.
- `scanCheapCandidates` signature: `scanCheapCandidates(root, { nowMs } = {})` where `nowMs` defaults to `Date.now()`. This seam is required for SP5 testability (pass a past timestamp to simulate old plans without `fs.utimesSync`).
- Module is new (`src/lib/stale-detector.js`); `inbox.js` is only extended in SP2. SP1 does not modify `inbox.js`.
- Does not modify any hook, gate logic, or existing plan files.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user opening the dashboard,
**I want** the Inbox to know how many plans are possibly stale,
**so that** I can decide whether to drill in and verify — without the menu-open latency increasing noticeably.

**As a** CTOC maintainer writing tests,
**I want** `scanCheapCandidates` to be independently testable with a temp-dir fixture and an injectable `nowMs`,
**so that** the cheap-detection contract never regresses silently and age scenarios do not require filesystem clock manipulation.

### BDD Scenarios

- [ ] **Scenario: Marker-in-source-stage fires only for review-stage plans**
  Given a plan file in `plans/review/` that contains `approved_by: human` in its YAML frontmatter
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `marker-in-source-stage` signal
  And its `actionable` field is `true`
  And the returned `count` is at least 1

- [ ] **Scenario: Healthy implementation-stage plan with Gate-1 marker is NOT flagged**
  Given a plan file in `plans/implementation/` that contains `approved_by: human` in its YAML frontmatter (normal Gate-1 marker)
  And all files listed in its `files:` frontmatter exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is NOT included in `candidates`
  And the returned `count` does not increase due to this plan

- [ ] **Scenario: Plan with missing declared files is flagged actionable**
  Given a plan file in `plans/functional/` whose frontmatter `files:` array lists `src/lib/nonexistent.js`
  And that file does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And its `actionable` field is `true`

- [ ] **Scenario: Age-only plan is advisory, never actionable**
  Given a plan file in `plans/implementation/` that has no `approved_by: human` marker
  And all files listed in its `files:` frontmatter exist on disk
  When `scanCheapCandidates(root, { nowMs: mtime + 15 * 24 * 3600 * 1000 + 1 })` runs (simulating 15 days elapsed)
  Then the plan is included in `candidates` with only an `advisory:age` signal
  And its `actionable` field is `false`

- [ ] **Scenario: Healthy fresh plan yields no signals**
  Given a plan file in `plans/functional/` modified within the last 14 days (nowMs within threshold)
  And the plan has no `approved_by: human` marker
  And all its declared `files:` exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is NOT included in `candidates`

- [ ] **Scenario: No git binary invoked during cheap scan**
  Given a `plans/` directory with multiple plan files across stages
  When `scanCheapCandidates(root)` runs with a spy on `child_process.exec`, `execSync`, and `spawnSync`
  Then none of those spy methods are called
  And the function returns a valid `{candidates, count}` object

- [ ] **Scenario: Block-list YAML files: syntax parsed correctly**
  Given a plan file whose frontmatter declares `files:` as a YAML block list (each entry on its own `  - path` line)
  And one of the listed files does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And the signal fires — the block-list syntax is not silently ignored

- [ ] **Scenario: Inline-array YAML files: syntax parsed correctly**
  Given a plan file whose frontmatter declares `files: [src/lib/a.js, src/lib/b.js]` on a single line
  And `src/lib/b.js` does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And the signal fires — the inline-array syntax is not silently ignored

### In Scope

- New module `src/lib/stale-detector.js` exporting `scanCheapCandidates(root, { nowMs } = {})`
- Cheap signal detection: `marker-in-source-stage` (review stage only), `missing-files` (all gate source stages), `advisory:age` (all gate source stages, advisory-only)
- Return shape: `{ candidates: Array<{plan, stage, signals, actionable}>, count: number }`
- YAML `files:` parser supporting both block-list (`- item`) and inline-array (`[a, b, c]`) syntax
- Unit test file `tests/stale-detector-cheap.test.js` with fixtures in `os.tmpdir()` sandbox; injectable `nowMs` for age scenarios
- Cross-platform path handling throughout

### Out of Scope

- Git history lookup (SP3 — in-process verify layer)
- Rendering the stale count in the UI (SP2 — Inbox stream)
- Classification into shipped-but-early / approved-but-stranded / dead-on-arrival (SP3)
- Any cleanup execution (SP4)
- Modifying `inbox.js` — SP2 does that
- Modifying any hook, gate logic, or vision file
- `functional/` and `implementation/` `marker-in-source-stage` signal — those stages carry prior-gate markers by design; the marker signal is review-stage only

## Risks

### Technical Risks

- **Risk:** Existing `parseFrontmatter` in `inbox.js` is scalar-only (simple `key: value` regex, confirmed by reading lines 123-137 of `src/lib/inbox.js`). It silently yields an empty string for block-list `files:` syntax and does not parse inline-array syntax at all. SP1 must implement its own sequence-aware parser for the `files:` key.
  - Likelihood: HIGH (confirmed by code review — the existing parser cannot handle either YAML list syntax)
  - Impact: HIGH (missing-files signal never fires if the list is not parsed as an array)
  - Mitigation: Implement a `parseFilesField(frontmatterText)` helper in `stale-detector.js` that handles both block-list and inline-array syntaxes. Cover both syntaxes with a dedicated test per syntax (M7). Do not reuse the scalar parser from `inbox.js`.

- **Risk:** `git checkout` rewrites file mtimes to the checkout timestamp, not the original commit time. An old plan checked out fresh will appear young; a long-running session where the plan was last written days ago may appear old even if the content is unchanged.
  - Likelihood: HIGH (inherent to how git manages the working tree)
  - Impact: LOW (age is advisory only; it is never acted on alone per the HYBRID decision; the caveat is documented)
  - Mitigation: Document in the module JSDoc that mtime is advisory and best-effort only. Inject `nowMs` parameter so tests control the "current time" reference without touching real clock or mtime.

### Business Risks

- **Risk:** 14-day advisory threshold produces false positives for legitimate long-lived plans (e.g. a plan in active use spanning a sprint boundary).
  - Likelihood: LOW (the HYBRID decision ensures age alone never triggers action — it is advisory only)
  - Impact: LOW (advisory flag adds noise to the drill-in list but triggers no action without SP3 verification)
  - Mitigation: Document in module JSDoc that age threshold is advisory, not actionable, and wire it to a `.ctoc/settings` key stub for future tuning without code change.

### Dependency Risks

- **Risk:** SP2 consumes this module before SP1 is fully validated; if the return shape changes, SP2 breaks.
  - Likelihood: LOW (return shape is declared in this plan and locked)
  - Impact: MEDIUM (requires SP2 test update)
  - Mitigation: Export the return-shape type as a JSDoc typedef at the top of `stale-detector.js` so SP2 has a single reference to check against.

## Priority

**Priority: MEDIUM** (Score: 6/9)
- Dependency: HIGH (3) — SP2, SP3, SP4, SP5 all depend on this; it is the foundation of the feature chain
- Business Impact: MEDIUM (2) — improves dashboard accuracy but the cleanup outcome depends on SP4
- Technical Risk: LOW (1) — filesystem reads are well-understood; the only subtle point is YAML sequence parsing

## Decisions Taken Under Ambiguity

- **Age threshold:** 14 days since plan-file mtime. Long enough to exclude active in-flight work; short enough to catch the 31-day rot class observed. Tunable via `.ctoc/settings` in a future patch without changing the module contract.
- **"Inactivity" source:** plan-file mtime (single `fs.stat` per file), not per-step timestamps — keeps the cheap pass truly cheap. Mtime is advisory only due to git-checkout rewrite behavior (documented in JSDoc).
- **Module placement:** new `src/lib/stale-detector.js`, not an extension of `inbox.js`. `inbox.js` is extended in SP2 only. Keeps SP1 independently testable.
- **YAML `files:` parsing:** implement a `parseFilesField()` helper inside `stale-detector.js` that handles both block-list (`  - path`) and inline-array (`[a, b, c]`) syntaxes. Two tests, one per syntax. Do not reuse the scalar-only parser from `inbox.js` which silently fails on both list forms.
- **`marker-in-source-stage` scope:** review stage only. Implementation and functional plans carry prior-gate markers by design — flagging them as stale on that basis alone would produce constant false positives. Shipped-but-stranded plans at earlier stages are identified by the `missing-files` signal or by SP3 git-evidence.
- **`nowMs` injection:** `scanCheapCandidates(root, { nowMs } = {})` where `nowMs` defaults to `Date.now()`. Required testability seam for SP5; eliminates dependency on `fs.utimesSync` for age scenarios in tests.

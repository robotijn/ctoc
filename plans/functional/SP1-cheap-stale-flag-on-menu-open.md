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
  - src/lib/inbox.js
  - tests/stale-detector-cheap.test.js
status: refined
acceptance_criteria_count: 6
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

1. Surface stale plan candidates on every menu open using only filesystem reads (zero git calls, zero scout subagents) so the hot-path latency stays imperceptibly fast.
2. Create a standalone, independently-testable module `src/lib/stale-detector.js` that `inbox.js` consumes in SP2, keeping concerns separated.
3. Never act on age alone — advisory signals are surfaced but never upgrade a plan to actionable-eligible without a corroborating evidence signal.

### Success Metrics

- **M1:** `scanCheapCandidates(root)` completes without invoking `child_process`, `execSync`, `spawnSync`, or any git binary — asserted by a spy/module-boundary test that fails loudly if the boundary is violated.
- **M2:** A marker-in-source-stage plan (`approved_by: human` present while still in `functional/`, `implementation/`, or `review/`) is always returned as an ACTIONABLE-eligible candidate.
- **M3:** A plan whose declared `files:` array lists one or more paths that no longer exist on disk is returned with a `missing-files` signal and is ACTIONABLE-eligible.
- **M4:** A plan that is only old (mtime > 14 days, no other signals) is returned with only an `advisory:age` signal and is NOT marked actionable.
- **M5:** A plan that is fresh, has valid markers, and has all declared files present yields an empty signals array and is not included as a candidate.
- **M6:** All path construction in the module uses `path.join()` — no string concatenation — so the module is cross-platform on Windows, macOS, and Linux.

### Stakeholders

- CTOC user opening the dashboard (benefits from accurate counts)
- SP2 (consumes `scanCheapCandidates` output to render the Inbox stream)
- SP5 (regression suite asserts SP1's negative and positive invariants)

### Constraints

- No git calls on the hot path. `child_process` must not be imported or invoked in `stale-detector.js`.
- Age threshold: 14 days since plan-file mtime (locked decision; tunable later via `.ctoc/settings` without changing the module's public contract).
- Module is new (`src/lib/stale-detector.js`); `inbox.js` is only extended in SP2. SP1 does not modify `inbox.js`.
- Does not modify any hook, gate logic, or existing plan files.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user opening the dashboard,
**I want** the Inbox to know how many plans are possibly stale,
**so that** I can decide whether to drill in and verify — without the menu-open latency increasing noticeably.

**As a** CTOC maintainer writing tests,
**I want** `scanCheapCandidates` to be independently testable with a temp-dir fixture,
**so that** the cheap-detection contract never regresses silently.

### BDD Scenarios

- [ ] **Scenario: Marker-in-source-stage plan is flagged actionable**
  Given a plan file in `plans/review/` that contains `approved_by: human` in its YAML frontmatter
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `marker-in-source-stage` signal
  And its `actionable` field is `true`
  And the returned `count` is at least 1

- [ ] **Scenario: Plan with missing declared files is flagged actionable**
  Given a plan file in `plans/functional/` whose frontmatter `files:` array lists `src/lib/nonexistent.js`
  And that file does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And its `actionable` field is `true`

- [ ] **Scenario: Age-only plan is advisory, never actionable**
  Given a plan file in `plans/implementation/` whose mtime is more than 14 days ago
  And the plan has no `approved_by: human` marker
  And all files listed in its `files:` frontmatter exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with only an `advisory:age` signal
  And its `actionable` field is `false`

- [ ] **Scenario: Healthy fresh plan yields no signals**
  Given a plan file in `plans/functional/` modified within the last 14 days
  And the plan has no `approved_by: human` marker
  And all its declared `files:` exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is NOT included in `candidates`

- [ ] **Scenario: No git binary invoked during cheap scan**
  Given a `plans/` directory with multiple plan files across stages
  When `scanCheapCandidates(root)` runs with a spy on `child_process.exec`, `execSync`, and `spawnSync`
  Then none of those spy methods are called
  And the function returns a valid `{candidates, count}` object

- [ ] **Scenario: Cross-platform path construction**
  Given the module is loaded on a Windows-style path separator environment
  When `scanCheapCandidates(root)` scans plan directories
  Then all intermediate paths are constructed via `path.join()` — no hardcoded `/` or `\\` separators in path assembly — and the scan completes without a path error

### In Scope

- New module `src/lib/stale-detector.js` exporting `scanCheapCandidates(root)`
- Cheap signal detection: marker-in-source-stage, missing declared `files:`, age > 14 days (advisory)
- Return shape: `{ candidates: Array<{plan, stage, signals, actionable}>, count: number }`
- Unit test file `tests/stale-detector-cheap.test.js` with fixtures in `os.tmpdir()` sandbox
- Cross-platform path handling throughout

### Out of Scope

- Git history lookup (SP3 — scout verify layer)
- Rendering the stale count in the UI (SP2 — Inbox stream)
- Classification into shipped-but-early / approved-but-stranded / dead-on-arrival (SP3)
- Any cleanup execution (SP4)
- Modifying `inbox.js` — SP2 does that
- Modifying any hook, gate logic, or vision file

## Risks

### Technical Risks

- **Risk:** `parseFrontmatter` in `inbox.js` uses a simple regex-based YAML parser that does not handle multi-line `files:` lists (YAML sequences). `stale-detector.js` needs to parse `files:` as an array, not a scalar string.
  - Likelihood: MEDIUM (the existing parser is a simple key:value splitter, confirmed by reading inbox.js lines 123-137)
  - Impact: HIGH (missing-files signal never fires if the list is not parsed as an array)
  - Mitigation: Implement a minimal YAML-sequence parser for the `files:` key in `stale-detector.js` (e.g. read subsequent lines beginning with `  - `) rather than reusing the scalar parser from `inbox.js`.

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
- **"Inactivity" source:** plan-file mtime (single `fs.stat` per file), not per-step timestamps — keeps the cheap pass truly cheap.
- **Module placement:** new `src/lib/stale-detector.js`, not an extension of `inbox.js`. `inbox.js` is extended in SP2 only. Keeps SP1 independently testable.
- **YAML `files:` parsing:** implement a minimal sequence-aware parser inside `stale-detector.js` rather than reusing the scalar-only parser in `inbox.js`, to correctly handle YAML list syntax (`- item`).

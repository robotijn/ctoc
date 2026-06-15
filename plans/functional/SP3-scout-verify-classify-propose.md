---
title: "SP3 — In-process verify, classify & propose action"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: automated-stale-plan-detection
program: ctoc-pipeline-hygiene
order: 3
depends_on: [SP2-stale-plans-inbox-stream]
files:
  - src/lib/stale-detector.js
  - tests/stale-classifier.test.js
status: refined
acceptance_criteria_count: 7
risk_level: MEDIUM
---

# SP3 — In-process verify, classify & propose action

## 1. ASSESS — Problem Understanding

### Business Context

The cheap candidates produced by SP1 and surfaced by SP2 are unverified — a plan may be old but not actually stale, or may lack an `approved_by` marker for good reason. False positives are the primary trust threat. The locked HYBRID decision demands expensive proof (git-history match and `files:` existence) before a plan is classified actionable. This expensive proof runs ONLY when the user explicitly drills in and triggers verification — never on menu open.

**There is no subagent scout in this implementation.** The menu system is a plain Node.js process; it cannot dispatch a Haiku subagent, and doing so would require context plumbing that does not exist. Verification runs as a plain in-process Node module that shells to git via `child_process` when explicitly triggered. The classifier is a pure, deterministic function that is unit-testable without any git invocation.

### Current State

No git-based staleness verification exists in the codebase. `src/lib/stale-detector.js` does not yet exist at SP3 start (created in SP1). There are no operations-registry entries or agent files to create — SP3 adds only to the existing `src/lib/stale-detector.js` module and creates its test file.

### Impact

Without verification, any cleanup proposal is untrustworthy. Users need evidence — a specific commit hash, a file path that matches the plan slug — before they will confidently approve archiving or deleting a plan. The in-process verifier bridges the cheap scan (SP1) and the human decision (SP4) by turning soft signals into hard evidence, without requiring a separate process or subagent dispatch.

## 2. ALIGN — Business Alignment

### Business Goals

1. Add a `verifyStaleCandidate(candidate, root)` function to `src/lib/stale-detector.js` that accepts a single candidate from SP1 and, by shelling to git via `child_process`, produces an evidence object describing what git history shows about the plan slug and its declared files.
2. Add `classifyStaleCandidate(candidate, evidence)` — a pure, deterministic function that maps verified evidence to one of four categories and a proposed action. No git calls, no filesystem access — all evidence is passed in by the caller. Unit-testable with deterministic fixtures.
3. Ensure age-only candidates never reach an actionable classification — the `inconclusive` category is the correct output when git and file evidence are absent.
4. Verification runs ONLY on explicit drill-in, never on menu open (hot-path constraint).

### Success Metrics

- **M1:** `classifyStaleCandidate(candidate, evidence)` returns an object with `{ category, proposedAction, evidence[] }` for all four categories: `shipped-but-early`, `approved-but-stranded`, `dead-on-arrival`, `inconclusive`.
- **M2:** `shipped-but-early` maps to `proposedAction: 'archive-to-done'` (stamp `approved_by: human` + `gate_crossed`, move to `done/`).
- **M3:** `approved-but-stranded` maps to `proposedAction: 'advance-via-reconciliation'` — uses the dedicated reconciliation path in SP4's `stale-cleanup.js`, NOT `approvePlan()` (which would re-fire the deployment pipeline and pollute the Gate-3 audit trail).
- **M4:** `dead-on-arrival` default proposed action is `'revert'` (reversible) unless the caller supplies explicit positive death evidence (e.g. an `explicitlyRejected` flag in the evidence object). `'delete'` is only proposed when that flag is true. Never auto-execute either.
- **M5:** A candidate with age signal only and no git/file evidence is classified `inconclusive` with `proposedAction: null` and is NOT proposed for any action.
- **M6:** `verifyStaleCandidate(candidate, root)` invokes git via `child_process.execSync` and is isolated to `stale-detector.js`. It returns the evidence object consumed by `classifyStaleCandidate`. It is never called from the menu hot-path.
- **M7:** The verifier and classifier produce a structured proposals array (`Array<{plan, category, proposedAction, evidence}>`); neither function performs any file write, plan move, or gate crossing.

### Stakeholders

- CTOC user who triggered verification from the SP2 drill-in (receives the evidence-backed proposal list)
- SP4 (consumes the proposals array to present the grouped review surface)
- SP5 (regression suite asserts the classification invariants with deterministic fixtures)

### Constraints

- `classifyStaleCandidate(candidate, evidence)` is a pure function — no side effects, no git calls, no filesystem access. All evidence is passed in by the caller.
- `verifyStaleCandidate(candidate, root)` may call git via `child_process.execSync` — this is the ONLY function in `stale-detector.js` that may invoke a subprocess, and it is only called when the user explicitly triggers verification.
- No agent file, no operations-registry entry, no scout registration. SP3 is entirely in `src/lib/stale-detector.js`.
- Verification output is proposals only — no execution of any kind. Gate hooks must not be modified.
- `dead-on-arrival` default is `'revert'` (reversible-first). `'delete'` requires an `explicitlyRejected` flag in the evidence object.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user who has drilled into the stale stream and selected "verify",
**I want** each candidate verified against git history and my declared `files:`,
**so that** I receive an evidence-backed classification and proposal before I decide whether to clean up.

**As a** CTOC maintainer,
**I want** the classification logic in a pure function I can unit-test with deterministic fixtures,
**so that** the git integration is boundary-tested separately and the classifier never silently drifts.

### BDD Scenarios

- [ ] **Scenario: Shipped plan classified correctly**
  Given a candidate in `functional/` with a `marker-in-source-stage` signal (note: this scenario uses functional/ for fixture convenience; the marker-in-source-stage signal can also appear on review/ plans per SP1)
  And evidence that the plan slug appears as a word-bounded token in a git commit message dated after the plan's stage entry
  And all declared `files:` exist in the tree
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'shipped-but-early'`
  And `proposedAction: 'archive-to-done'`
  And `evidence` array contains the matching commit reference

- [ ] **Scenario: Approved-but-stranded review plan classified correctly**
  Given a candidate in `review/` with `approved_by: human` in its frontmatter
  And evidence that the plan's declared files were last modified by a commit dated after the plan's stage entry
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'approved-but-stranded'`
  And `proposedAction: 'advance-via-reconciliation'`

- [ ] **Scenario: Dead-on-arrival plan with no prior approval proposes revert by default**
  Given a candidate whose declared `files:` are absent from the tree
  And evidence shows no git commit references the plan slug
  And the candidate's frontmatter contains no `approved_by` field
  And the evidence object does NOT set `explicitlyRejected: true`
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'dead-on-arrival'`
  And `proposedAction: 'revert'`

- [ ] **Scenario: Dead-on-arrival plan proposes delete only when explicitly rejected**
  Given a candidate whose declared `files:` are absent from the tree
  And the evidence object sets `explicitlyRejected: true`
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'dead-on-arrival'`
  And `proposedAction: 'delete'`

- [ ] **Scenario: Age-only candidate classified inconclusive**
  Given a candidate whose only signal is `advisory:age` (mtime > 14 days)
  And evidence object has no git commits referencing the plan slug
  And all declared `files:` exist on disk
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'inconclusive'`
  And `proposedAction` is `null`
  And the proposal is NOT included in any actionable proposal list

- [ ] **Scenario: Verifier and classifier produce proposals only — no side effects**
  Given a list of 3 candidates (one per actionable category)
  When `verifyStaleCandidate` and `classifyStaleCandidate` run for each
  Then they return proposal objects with category and proposedAction
  And no plan file has been moved, stamped, or deleted
  And no gate-revert hook has been triggered

- [ ] **Scenario: verifyStaleCandidate is never called on menu hot-path**
  Given the menu is opened and `scanCheapCandidates` runs
  When the Inbox renders the stale count
  Then `verifyStaleCandidate` is NOT called (asserted by spy on `child_process.execSync`)
  And `verifyStaleCandidate` is ONLY called when the user explicitly selects "verify" in the drill-in

### In Scope

- `verifyStaleCandidate(candidate, root)` added to `src/lib/stale-detector.js` — shells to git via `child_process.execSync`, returns an evidence object
- `classifyStaleCandidate(candidate, evidence)` added to `src/lib/stale-detector.js` — pure function, no git calls, no fs access
- Four categories: `shipped-but-early`, `approved-but-stranded`, `dead-on-arrival`, `inconclusive`
- `approved-but-stranded` proposed action: `'advance-via-reconciliation'` (not `approvePlan()`)
- `dead-on-arrival` default proposed action: `'revert'`; `'delete'` only when `evidence.explicitlyRejected === true`
- Git-match heuristic: commit message references plan slug as a word-bounded token (`\bslug\b`, case-insensitive) AND plan's declared `files:` were last modified by a commit dated after the plan's stage-entry date (both required for `shipped-but-early`; either alone is insufficient)
- Unit test `tests/stale-classifier.test.js` with deterministic evidence fixtures (no real git calls in the classifier test; `verifyStaleCandidate` boundary-tested separately)

### Out of Scope

- Executing any proposed action (SP4)
- Rendering proposals in the UI (SP4)
- Any agent file, scout agent definition, or operations-registry entry — SP3 is entirely in-process Node
- Modifying any hook, gate logic, or existing plan files
- Classifying plans in `done/` — `done/` plans are never candidates (the detector only scans gate source stages)

## Risks

### Technical Risks

- **Risk:** Git commit message matching by plan slug is fragile — slugs that appear as substrings of other commit messages could produce false positives in the git-match heuristic.
  - Likelihood: MEDIUM (commit messages are free-form; slug `sp1` could match "display")
  - Impact: MEDIUM (false positives cause the verifier to classify a plan as shipped when it is not, leading to incorrect archive proposals)
  - Mitigation: Require the slug to appear as a word-bounded token in the commit message (regex `\bslug\b`, case-insensitive) and also require the plan's stage-entry date to predate the matching commit — both conditions must be true for `shipped-but-early`.

- **Risk:** `child_process.execSync` in `verifyStaleCandidate` throws if the git binary is not on PATH, producing an unhandled exception that crashes the menu process.
  - Likelihood: LOW (git is present in all CTOC development environments)
  - Impact: HIGH (crash in the menu process is the worst user experience)
  - Mitigation: Wrap the `execSync` call in a try/catch; on failure return an evidence object with `{ gitAvailable: false, error: e.message }`. The classifier treats `gitAvailable: false` as `inconclusive` so the user sees a degraded signal, not a crash.

### Business Risks

- **Risk:** Users may not trust classification when the evidence array is thin (e.g. only a slug match in git log, no file tree confirmation).
  - Likelihood: MEDIUM (power users will scrutinize evidence)
  - Impact: LOW (the human still approves or overrides; a weak evidence array prompts a skip)
  - Mitigation: Require both git-slug match AND file-tree check to reach `shipped-but-early`; a single signal only is sufficient for `dead-on-arrival` since the risk of false deletion is mitigated by the `revert` default.

### Dependency Risks

- **Risk:** SP4 consumes the proposals array shape; if this plan changes the shape, SP4 breaks.
  - Likelihood: LOW (shape is locked in this plan: `{plan, category, proposedAction, evidence[]}`)
  - Impact: MEDIUM (SP4 tests would fail at integration time)
  - Mitigation: Export a JSDoc typedef for `StaleProposal` from `stale-detector.js` and reference it in `stale-cleanup.js` (SP4) via `@param {import('./stale-detector').StaleProposal[]}`.

## Priority

**Priority: MEDIUM** (Score: 6/9)
- Dependency: MEDIUM (2) — depends on SP2; SP4 depends on this; serial chain
- Business Impact: MEDIUM (2) — produces the evidence-backed proposals that make cleanup trustworthy
- Technical Risk: MEDIUM (2) — git-match heuristic has fragility risks; `execSync` error handling is a real edge case

## Decisions Taken Under Ambiguity

- **No subagent scout:** The menu is a plain Node.js process with no subagent dispatch capability. The previous design assumed a Tier-3 Haiku scout; that assumption was wrong. Verification runs in-process via `child_process.execSync` in `verifyStaleCandidate`. No agent file, no operations-registry entry.
- **`approved-but-stranded` proposed action:** `'advance-via-reconciliation'` (not `'advance-via-approvePlan'`). Using `approvePlan()` re-fires the deployment pipeline and logs a fresh live Gate-3 crossing, polluting the audit trail for months-old work. SP4's dedicated reconciliation path handles this correctly.
- **`dead-on-arrival` default:** `'revert'` (reversible-first). `'delete'` is only proposed when `evidence.explicitlyRejected === true`. Reversible-first principle: never auto-propose irreversible destruction without positive death evidence.
- **Git-match heuristic:** commit message references plan slug as a word-bounded token AND plan's declared `files:` exist and were last modified by a commit dated after the plan's stage-entry date. Both conditions together are required for `shipped-but-early`; either alone is insufficient.
- **`execSync` error handling:** try/catch wrapper; on failure return `{ gitAvailable: false, error }`. Classifier treats this as `inconclusive` — degraded signal, no crash.
- **`inconclusive` is a valid output category, not an error:** a candidate that cannot be proven stale through evidence is left alone and not proposed for action.
- **Files: trimmed:** Removed `agents/scouts/stale-plan-scout.md` and `.ctoc/operations-registry.yaml` — those entries were for the scout design that is superseded. SP3 only touches `src/lib/stale-detector.js` and its test file.

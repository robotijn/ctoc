---
title: "SP3 — Scout verify, classify & propose action"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: automated-stale-plan-detection
program: ctoc-pipeline-hygiene
order: 3
depends_on: [SP2-stale-plans-inbox-stream]
files:
  - agents/scouts/stale-plan-scout.md
  - src/lib/stale-detector.js
  - .ctoc/operations-registry.yaml
  - tests/stale-classifier.test.js
status: refined
acceptance_criteria_count: 7
risk_level: MEDIUM
---

# SP3 — Scout verify, classify & propose action

## 1. ASSESS — Problem Understanding

### Business Context

The cheap candidates produced by SP1 and surfaced by SP2 are unverified — a plan may be old but not actually stale, or may lack an `approved_by` marker for good reason. False positives are the primary trust threat. The locked HYBRID decision demands expensive proof (git-history match and `files:` existence) before a plan is classified actionable. This expensive proof runs ONLY when the user explicitly drills in and triggers verification — never on menu open. The scout is a Tier-3 Haiku subagent (isolated context, `model: haiku`) that keeps the classification logic deterministic and unit-testable in `stale-detector.js` while the scout handles the git interaction.

### Current State

No git-based staleness verification exists in the codebase. `src/lib/stale-detector.js` does not yet exist (created in SP1). `agents/scouts/` exists as the standard location for Tier-3 scouts (e.g., present in `agents/` tree). The `.ctoc/operations-registry.yaml` lists scouts under the Tier-3 section. The classifier is a pure function that takes a candidate object and a pre-supplied evidence object — it never shells out to git itself, keeping it unit-testable.

### Impact

Without verification, any cleanup proposal is untrustworthy. Users need evidence — a specific commit hash, a file path that matches the plan slug — before they will confidently approve archiving or deleting a plan. The scout bridges the cheap scan (SP1) and the human decision (SP4) by turning soft signals into hard evidence.

## 2. ALIGN — Business Alignment

### Business Goals

1. Add a Tier-3 `stale-plan-scout` (Haiku subagent, `model: haiku`) that accepts the SP2 candidate list, verifies each entry against git history and `files:` existence, and emits per-plan proposals with evidence.
2. Extend `src/lib/stale-detector.js` (created in SP1) with `classifyStaleCandidate(candidate, evidence)` — a pure, deterministic function that maps verified evidence to one of four categories and a proposed action.
3. Ensure age-only candidates never reach an actionable classification — the `inconclusive` category is the correct output when git and file evidence are absent.

### Success Metrics

- **M1:** `classifyStaleCandidate(candidate, evidence)` returns an object with `{ category, proposedAction, evidence[] }` for all four categories: `shipped-but-early`, `approved-but-stranded`, `dead-on-arrival`, `inconclusive`.
- **M2:** `shipped-but-early` maps to `proposedAction: 'archive-to-done'` (stamp `approved_by: human` + `gate_crossed`, move to `done/`).
- **M3:** `approved-but-stranded` maps to `proposedAction: 'advance-via-approvePlan'` (Gate 3 crossing through the existing `approvePlan()` flow).
- **M4:** `dead-on-arrival` maps to `proposedAction: 'delete'` when no approval history exists, or `proposedAction: 'revert'` when prior approval history is present (reversible-first principle).
- **M5:** A candidate with age signal only and no git/file evidence is classified `inconclusive` with `proposedAction: null` and is NOT proposed for any action.
- **M6:** `agents/scouts/stale-plan-scout.md` declares `model: haiku` in its frontmatter and is registered in `.ctoc/operations-registry.yaml` under a Tier-3 section.
- **M7:** The scout's output is a structured proposals array (`Array<{plan, category, proposedAction, evidence}>`); it performs no file write, no plan move, and no gate crossing.

### Stakeholders

- CTOC user who triggered verification from the SP2 drill-in (receives the evidence-backed proposal list)
- SP4 (consumes the proposals array to present the grouped review surface)
- SP5 (regression suite asserts the classification invariants with deterministic fixtures)

### Constraints

- The `classifyStaleCandidate` function is a pure function — no side effects, no git calls, no filesystem access. All evidence is passed in by the scout caller.
- The scout verifies candidates sequentially (not fan-out per candidate) to respect the 5-concurrent-subagent cap in the CTOC memory rules.
- Scout output is proposals only — no execution of any kind. Gate hooks must not be modified.
- `agents/scouts/stale-plan-scout.md` must declare `model: haiku` (subagent, isolated context per CLAUDE.md model rules; safe because it runs as a genuinely fresh instance, not a slash command).

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user who has drilled into the stale stream and selected "verify",
**I want** each candidate verified against git history and my declared `files:`,
**so that** I receive an evidence-backed classification and proposal before I decide whether to clean up.

**As a** CTOC maintainer,
**I want** the classification logic in a pure function I can unit-test with deterministic fixtures,
**so that** the scout's git integration is boundary-tested separately and the classifier never silently drifts.

### BDD Scenarios

- [ ] **Scenario: Shipped plan classified correctly**
  Given a candidate in `functional/` with a `marker-in-source-stage` signal
  And evidence that the plan slug appears in a git commit message dated after the plan's stage entry
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
  And `proposedAction: 'advance-via-approvePlan'`

- [ ] **Scenario: Dead-on-arrival plan with no approval history proposes delete**
  Given a candidate whose declared `files:` are absent from the tree
  And evidence shows no git commit references the plan slug
  And the candidate's frontmatter contains no `approved_by` field
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'dead-on-arrival'`
  And `proposedAction: 'delete'`

- [ ] **Scenario: Dead-on-arrival plan with prior approval history proposes revert**
  Given a candidate whose declared `files:` are absent from the tree
  And the candidate's frontmatter contains a prior `approved_by: human` marker
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'dead-on-arrival'`
  And `proposedAction: 'revert'`

- [ ] **Scenario: Age-only candidate classified inconclusive**
  Given a candidate whose only signal is `advisory:age` (mtime > 14 days)
  And evidence object has no git commits referencing the plan slug
  And all declared `files:` exist on disk
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'inconclusive'`
  And `proposedAction` is `null`
  And the proposal is NOT included in any actionable proposal list

- [ ] **Scenario: Scout output is proposals only — no side effects**
  Given a list of 3 candidates (one per actionable category)
  When the stale-plan-scout subagent runs to completion
  Then it returns an array of 3 proposal objects
  And no plan file has been moved, stamped, or deleted
  And no gate-revert hook has been triggered

- [ ] **Scenario: Scout registered in operations-registry as Tier-3 with model haiku**
  Given `.ctoc/operations-registry.yaml` is read
  When the `stale-plan-scout` entry is located
  Then it declares `model: haiku`
  And it is listed under a tier-3 or scouts section
  And it declares `proposals_only: true` (or equivalent no-side-effects marker)

### In Scope

- New `agents/scouts/stale-plan-scout.md` declaring `model: haiku`
- Registration of `stale-plan-scout` in `.ctoc/operations-registry.yaml`
- `classifyStaleCandidate(candidate, evidence)` function added to `src/lib/stale-detector.js` (extending SP1's module)
- Four categories: `shipped-but-early`, `approved-but-stranded`, `dead-on-arrival`, `inconclusive`
- Git-match heuristic: commit message references plan slug OR plan's declared `files:` were last modified by a commit dated after the plan's stage-entry date
- `dead-on-arrival` proposed action: `revert` if prior `approved_by` exists, else `delete`
- Unit test `tests/stale-classifier.test.js` with deterministic evidence fixtures (no real git calls)

### Out of Scope

- Executing any proposed action (SP4)
- Rendering proposals in the UI (SP4)
- Modifying any hook, gate logic, or existing plan files
- Fan-out parallel verification per candidate (sequential only, concurrency cap respect)
- Classifying plans in `done/` — `done/` plans are never candidates (the detector only scans gate source stages)

## Risks

### Technical Risks

- **Risk:** Git commit message matching by plan slug is fragile — slugs that appear as substrings of other commit messages could produce false positives in the git-match heuristic.
  - Likelihood: MEDIUM (commit messages are free-form; slug `sp1` could match "display")
  - Impact: MEDIUM (false positives cause the scout to classify a plan as shipped when it is not, leading to incorrect archive proposals)
  - Mitigation: Require the slug to appear as a word-bounded token in the commit message (e.g. regex `\bSP1\b` or `\bsp1\b`, case-insensitive) and also require the plan's stage-entry date to predate the matching commit — both conditions must be true.

- **Risk:** The scout runs as a Haiku subagent; if the candidate list is large (e.g. 20+ plans), sequential verification could take many minutes and approach the background-agent 5-minute timeout in `src/lib/background.js`.
  - Likelihood: LOW (typical phantom backlog is small; the 2026-06-15 incident had 14 plans)
  - Impact: MEDIUM (partial results with a timeout would confuse SP4's grouped review)
  - Mitigation: Cap the scout at 20 candidates per run; if more exist, verify the first 20 and note the remainder in the proposals output. Surface this cap in the drill-in UI.

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
- Technical Risk: MEDIUM (2) — git-match heuristic has fragility risks; scout timeout is a real edge case

## Decisions Taken Under Ambiguity

- **Git-match heuristic:** commit message references plan slug as a word-bounded token AND plan's declared `files:` exist and were last modified by a commit dated after the plan's stage-entry date. Both conditions together are required for `shipped-but-early`; either alone is insufficient.
- **`dead-on-arrival` default:** propose `revert` (move back a stage) when prior `approved_by` exists, else `delete`. Reversible-first. Never auto-execute.
- **Classifier lives in `lib`, scout orchestrates:** `classifyStaleCandidate` is pure/deterministic in `stale-detector.js`; the scout supplies git evidence and calls it. Keeps untestable logic out of the agent prompt.
- **Concurrency:** scout verifies candidates sequentially within one subagent to respect the 5-concurrent-subagent cap. Cap at 20 candidates per run.
- **`inconclusive` is a valid output category, not an error:** a candidate that cannot be proven stale through evidence is left alone and not proposed for action.

---
iron_loop: true
step: 4
step_label: CAPTURE
files:
  - src/lib/stale-detector.js
  - tests/stale-classifier.test.js
status: functional
created: 2026-07-01
---

# SD1 — Stage-aware "dead-on-arrival" classification (stop flagging unbuilt backlog as dead)

## 1. ASSESS — Problem Understanding

### Business Context

The stale-plan detector (SP1–SP4) is meant to surface plans that rot after their
work ships or is abandoned. Dogfooding it on CTOC's own backlog (2026-07-01)
revealed a false-positive class: the git-backed verifier classifies **18 of 23**
possibly-stale plans as `dead-on-arrival → revert`, when in fact **0 are stale**.
All 18 are legitimate *unbuilt* functional-stage roadmap items (PI0–6 semantic
plan index, EC1–6 EU compliance, CU1/4/5 coverage, SP5 regression suite).

### Current State

`classifyStaleCandidate` in `src/lib/stale-detector.js`, rule 1:

```js
// 1. DEAD-ON-ARRIVAL — files gone, nothing shipped, never approved.
if (evidence.anyFileMissing && slugMatchCount === 0 && !evidence.approvedBy) {
  return { category: 'dead-on-arrival', proposedAction: 'revert', … };
}
```

The rule is **stage-blind**. Every plan still in the `functional` stage
trivially satisfies all three predicates by definition:
- `anyFileMissing` — true: the work hasn't started, so declared files don't exist.
- `slugMatchCount === 0` — true: no commit references the slug (no work done).
- `!approvedBy` — true: it hasn't crossed a human gate yet.

So "dead-on-arrival" as currently defined **is the normal state of every
not-yet-started functional backlog item.** The proposed `revert` would demote the
entire pending roadmap (functional → vision), corrupting the backlog.

The candidate object already carries `.stage` (candidates are scanned from
`GATE_SOURCE_STAGES = ['functional','implementation','review']`), so the fix has
the signal it needs — it just isn't used in the DOA rule.

### Impact

- The feature's headline output is dominated by false positives (18/23), which
  trains the user to ignore it — defeating the purpose of the detector.
- A human who trusts the proposal and runs cleanup would revert real pending work.
- Sibling to the two other dogfooding-caught defects this cycle (SP4
  DOA-reachability, LH1 CRLF regression): green tests hid a wrong real-world call.

## 2. ALIGN — Approach (resolve at Gate 1 / planning)

- **(A) Stage-gate the DOA rule — RECOMMENDED.** DOA (files-missing ⇒ abandoned)
  only makes sense once files *should* exist — i.e. from `implementation` onward
  (`implementation`/`todo`/`in-progress`/`review`). For `functional` (and
  `vision`/`canvas`), missing files means "not-started," a benign non-stale
  state. Add a `not-started` (or reuse `inconclusive`) classification for
  functional-stage missing-files, so no cleanup action is proposed.
- (B) Exclude `functional` from the stale scan entirely — simpler, but loses the
  ability to ever flag a genuinely abandoned functional plan (e.g. explicitly
  rejected + very old).
- (C) Require stronger abandonment evidence for DOA regardless of stage
  (explicit rejection OR age-past-threshold AND git-inactivity), not just
  files-missing — more robust but larger change.

Decision to make at Gate 1: which of A/B/C (recommendation A, possibly A+C).

## 3. CAPTURE — Acceptance Criteria

### User Story

**As a** CTOC user relying on the stale detector,
**I want** unbuilt functional-stage plans to NOT be classified as dead-on-arrival,
**so that** the detector surfaces only genuinely stale/abandoned plans and I can
trust its proposals without risking my pending roadmap.

### BDD Scenarios

- [ ] **Scenario: a not-started functional plan is not dead-on-arrival**
  Given a `functional`-stage candidate with missing declared files, no
  slug-commits, and no approval
  When `classifyStaleCandidate` runs
  Then its category is NOT `dead-on-arrival` and its proposedAction is NOT
  `revert`/`delete` (it is `not-started`/`inconclusive` with no cleanup action)

- [ ] **Scenario: an implementation-stage plan with missing files is still DOA**
  Given an `implementation`-stage candidate with the same missing-files evidence
  Then it IS classified `dead-on-arrival` (files should exist by this stage) —
  the fix must not blind the detector to real abandonment past functional

- [ ] **Scenario: CTOC's own 18 false positives clear**
  Given the current backlog (PI0–6, EC1–6, CU*, SP5 — all functional, unbuilt)
  When verification runs
  Then none are proposed for `revert`/`delete` (0 dead-on-arrival among them)

- [ ] **Scenario: genuinely abandoned plans still surface**
  Given an implementation+ plan that is explicitly rejected or past-threshold-old
  with no activity
  Then it is still classified for cleanup (the detector keeps its teeth)

- [ ] **Scenario: behavior/tests unchanged elsewhere**
  Given the existing stale-classifier + cleanup suites
  Then they pass (adjust only the assertions the corrected semantics require)

### In Scope

- `src/lib/stale-detector.js` — make `classifyStaleCandidate` (and, if needed,
  the evidence gathered by `verifyStaleCandidate`) stage-aware per the Gate-1 approach
- `tests/stale-classifier.test.js` — add stage-aware cases (functional not-started
  vs implementation DOA); update assertions the new semantics require

### Out of Scope

- SP4 cleanup execution mechanics (unchanged; this only changes classification)
- The cheap scan (SP1) — it may still surface functional plans as *candidates*;
  the classifier is where staleness is decided
- The four human gates

## Notes

- Origin: dogfooding the stale detector on CTOC's own backlog, 2026-07-01 —
  `inbox verify` returned 18 `dead-on-arrival` that are all unbuilt roadmap.
- Verified root cause: DOA rule (`stale-detector.js`, rule 1) ignores `candidate.stage`.
- Relates to SP5 (regression suite) — the stage-aware cases belong in that suite too.

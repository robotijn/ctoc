---
approved_by: human
approved_at: 2026-07-13T20:53:24.565Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.254Z
gate_crossed: implementation → todo
---

---
title: "W05-s3 — Route cleanupStaleInProgress through validateForReview"
type: feature
parent_plan: "ctoc-audit-w05-gate3-verifies"
depends_on: none
priority: HIGH
files:
  - src/lib/actions.js
  - tests/ctoc-audit-w05-cleanup-validated.test.js
---

# W05-s3 — Route cleanupStaleInProgress through validateForReview

SIP1 slice 3 of 5 for `ctoc-audit-w05-gate3-verifies` (finding **C9**). Closes
the FIRST of the two in-progress→review paths that skip validation entirely.
Independent of the other slices.

Load-bearing defect (verified against the running code):
`cleanupStaleInProgress` (`src/lib/actions.js:829-860`) logs a cleanup event and
then calls `movePlan(plan.path, 'review', root)` (line 855) for **every**
orphaned in-progress plan, with **no call to `validateForReview` anywhere in the
function**. A plan that goes stale reaches the review/Gate-3 doorstep having been
checked by nothing — not even by the in-progress-only validator that the primary
manual path runs. `validateForReview` (plan-validator.js:35) already exists and
can genuinely fail (step completeness, escalations, contradictions).

## Implementation Details

### Dependency Graph

```
validateForReview (already imported in actions.js:12)
        │ called before the move by
cleanupStaleInProgress (src/lib/actions.js) ──valid?──▶ movePlan → review   (unchanged move)
                                             └─invalid─▶ log skip + reason, leave in place
```

No new import: `validateForReview` is already destructured at
`src/lib/actions.js:12`. No new module. No cycle.

### File Specifications

#### File: `src/lib/actions.js`
**Action:** MODIFY
**Purpose:** Gate the stale-cleanup move behind `validateForReview`, mirroring
the skip/log contract already used for the cleanup log, so an invalid plan is
NOT smuggled into `review`.

**Changes to `cleanupStaleInProgress(projectPath)` (lines 829-860):**
- For each orphaned in-progress plan, **before** moving:
  `const validation = validateForReview(plan.path, root);`
- **If `validation.valid === false`:** do NOT call `movePlan`. Append a
  `cleanup.json` entry recording the SKIP with the reason, e.g.
  `{ plan: plan.name, from: 'in-progress', to: 'in-progress', action:
  'skipped', reason: validation.errors.join('; '), at: <ISO> }`, and push the
  plan into a new `skipped` collection. Continue the loop (never abort the whole
  cleanup because one plan is invalid — async-overnight resilience).
- **If valid:** keep the existing behavior — log the `moved`/`orphaned` entry and
  `movePlan(plan.path, 'review', root)`; push to `cleanedUp`.
- **Return shape:** change the return from `string[]` (names) to
  `{ cleanedUp: string[], skipped: Array<{ name, reason }> }` so the skip is
  observable in the return value AND in `cleanup.json`. *(Observability is a
  named acceptance requirement.)*
  - **Caller audit:** grep every caller of `cleanupStaleInProgress` (menu/tabs)
    in Step 9 and update them to read `.cleanedUp` (they currently treat the
    return as a name array). This is an in-file signature change with external
    readers — the callers must be adjusted in the SAME slice to avoid a break.
    If a caller lives outside `actions.js`, that file is added to this slice's
    scope at Step 9 (documented) rather than silently left broken.

**Error handling:** wrap the per-plan `validateForReview` in try/catch; on a
thrown validation error, treat as skip-with-reason (fail closed — do not move a
plan whose validation crashed).

**Cross-platform:** unchanged (`path.join`, `safeFs`); no new shell-out.

### Test Plan

#### Tests: `tests/ctoc-audit-w05-cleanup-validated.test.js`
**Action:** CREATE
**Framework:** `node:test`.

**Zero-doubles:** real temp `plans/in-progress/` fixtures + real
`.ctoc/logs/cleanup.json`; `validateForReview` runs for real against the fixture
content; no mocking.

**Test cases (assert BEHAVIOR):**
1. **M5 — invalid stale plan is NOT moved.** Fixture in-progress plan that fails
   `validateForReview` (e.g. a required Iron-Loop step left unaddressed / an
   unescalated SKIPPED). Run `cleanupStaleInProgress(tempRoot)`. Assert the plan
   file is ABSENT from `plans/review/` and STILL present in `plans/in-progress/`.
2. **M5 — the skip is observable and reasoned.** Assert the returned
   `skipped[]` contains the plan with a non-empty `reason`, AND
   `.ctoc/logs/cleanup.json` has a matching `action:'skipped'` entry with the
   reason (not a silent relocation).
3. **Valid stale plan IS still moved (no over-rejection).** A fixture in-progress
   plan that PASSES `validateForReview` is moved to `plans/review/` and appears
   in `cleanedUp[]` — proving the gate does not block legitimate cleanup.
4. **One invalid plan does not abort the batch.** With one invalid + one valid
   orphan, assert the valid one is still moved and the invalid one is still
   skipped (loop resilience).

**Coverage:** ≥80% on the modified function; the valid-move, invalid-skip, and
throw-guard branches all exercised.

### Security Review

- [x] **Fail closed:** an invalid or validation-throwing plan is never moved into
  `review`.
- [x] **No path traversal added:** uses existing `plan.path`/`movePlan`.
- [x] **Audit trail:** every skip is recorded in `cleanup.json` with a reason
  (no silent state change).
- [x] **No secrets / no injection:** JSON log write only; reasons are validator
  strings, not shell input.
- [x] **No gate weakening:** the change can only PREVENT an unvalidated move; it
  never creates a new move path.

## Decisions Taken Under Ambiguity

- **Invalid plans are LEFT in `in-progress` (not moved anywhere else) and
  logged.** The parent requires "NOT moved into review" + "skip recorded with
  the validation reason." Leaving the plan in place with a logged reason is the
  minimal, reversible behavior; the human sees it in `cleanup.json` and the
  return value. No new "quarantine" stage is invented (avoids scope creep / Iron
  Loop model change, which the parent lists as out of scope).
- **Return shape becomes `{ cleanedUp, skipped }`.** The parent requires the skip
  be observable "in the cleanup log or the function's return value" — this slice
  provides BOTH. Callers are updated in-slice (Step 9 audit) so the signature
  change breaks nothing.

## Execution Plan

### Step 8: TEST
- [x] Write `tests/ctoc-audit-w05-cleanup-validated.test.js` FIRST (TDD RED): the
      4 behavior cases, real temp `plans/` fixtures, no doubles.
- [x] Confirm RED: today every orphan is moved unconditionally, so the invalid
      plan lands in `plans/review/` and no `skipped` entry exists.

### Step 9: PREPARE
- [x] Grep all callers of `cleanupStaleInProgress` (menu/tabs/state); note which
      read the return value. Add any external caller file to this slice's scope
      if it must change; otherwise adapt callers to `.cleanedUp`.
- [x] Confirm `validateForReview` is already imported at `actions.js:12`.

### Step 10: IMPLEMENT
- [x] `src/lib/actions.js`: insert the per-plan `validateForReview` call before
      `movePlan`; branch valid→move / invalid→log-skip; try/catch fail-closed.
- [x] `src/lib/actions.js`: change the return to `{ cleanedUp, skipped }` and add
      the `action:'skipped'` cleanup-log entry.
- [x] Update in-repo callers to read `.cleanedUp` (per Step 9 audit).

### Step 11: REVIEW
- [x] Self-review: valid plans still move; invalid plans never move; batch
      continues past a bad plan; callers updated; no Iron-Loop model change.

### Step 12: OPTIMIZE
- [x] One `validateForReview` per plan; reuse the already-open `cleanup.json`
      read/write; no redundant disk scans.

### Step 13: SECURE
- [x] Walk the Security Review checklist; confirm fail-closed on validation throw.

### Step 14: VERIFY
- [x] Run `node --test tests/ctoc-audit-w05-cleanup-validated.test.js` → green.
- [x] Run full suite `node --test tests/*.test.js` → `# fail 0`, `0 skipped`.
- [x] Coverage ≥80% on `cleanupStaleInProgress`.

### Step 15: DOCUMENT
- [x] Update the JSDoc on `cleanupStaleInProgress` (new return shape + the
      validation gate + the skip-logging contract).

### Step 16: FINAL-REVIEW
- [x] Confirm the stale-cleanup path is now validated identically to the manual
      path, the skip is observable, valid cleanup still works, and callers are
      consistent. Scope limited to the declared files (+ any caller flagged at
      Step 9).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

---
approved_by: human
approved_at: 2026-07-13T20:53:24.587Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.278Z
gate_crossed: implementation → todo
---

---
title: "W05-s4 — Route moveToReviewAfterPush through validateForReview"
type: feature
parent_plan: "ctoc-audit-w05-gate3-verifies"
depends_on: none
priority: HIGH
files:
  - src/lib/sync.js
  - tests/ctoc-audit-w05-sync-validated.test.js
---

# W05-s4 — Route moveToReviewAfterPush through validateForReview

SIP1 slice 4 of 5 for `ctoc-audit-w05-gate3-verifies` (finding **C9**). Closes
the SECOND in-progress→review path that skips validation. Independent of the
other slices (distinct module: `sync.js`, not `actions.js`).

Load-bearing defect (verified against the running code):
`moveToReviewAfterPush` (`src/lib/sync.js:122-145`) calls
`safeFs.renameSync(planPath, newPath)` (line 139) directly with **no call to
`validateForReview` anywhere in the function**. A plan synced into `review` after
a push is checked by nothing. The function already returns an observable
`{ moved: false, reason: 'auto-move disabled' }` shape (line 126) — this slice
reuses that exact shape for the validation-failure case.

## Implementation Details

### Dependency Graph

```
validateForReview (src/lib/plan-validator.js) ── NEW require in sync.js
        │ called before the rename by
moveToReviewAfterPush (src/lib/sync.js) ──valid?──▶ renameSync → review   (unchanged)
                                        └─invalid─▶ { moved:false, reason }
```

New inward edge: `sync.js` → `plan-validator.js`. `plan-validator.js` does not
require `sync.js`, so no cycle.

### File Specifications

#### File: `src/lib/sync.js`
**Action:** MODIFY
**Purpose:** Gate the post-push rename behind `validateForReview`, returning the
same observable `{ moved:false, reason }` contract already used for the
auto-move-disabled early return.

**Changes to `moveToReviewAfterPush(planPath, projectPath)` (lines 122-145):**
- **Add import:** `const { validateForReview } = require('./plan-validator');`
  at the top of `sync.js` (alongside the existing requires).
- Keep the existing `autoMove` early return unchanged.
- **After** computing `reviewDir`/`newPath` and **before** `safeFs.renameSync`:
  ```
  let validation;
  try {
    validation = validateForReview(planPath, projectPath);
  } catch (err) {
    return { moved: false, reason: `validation error: ${err.message}` };
  }
  if (validation && validation.valid === false) {
    return {
      moved: false,
      reason: (validation.errors && validation.errors.length)
        ? validation.errors.join('; ')
        : 'failed validateForReview'
    };
  }
  ```
- Only on `valid` proceed to `renameSync` + `invalidate()` + `return { moved:
  true, newPath }` (unchanged).

**Error handling:** validation throw → `{ moved:false, reason }` (fail closed;
the rename never runs on a crash).

**Cross-platform:** unchanged; `path.join`, `safeFs.renameSync`. No shell-out.

### Test Plan

#### Tests: `tests/ctoc-audit-w05-sync-validated.test.js`
**Action:** CREATE
**Framework:** `node:test`.

**Zero-doubles:** real temp project with a real plan file; the
`workflow.autoMoveToReview` setting is set true in a real `.ctoc/settings`
so the guard is reached; `validateForReview` runs for real. No mocking.

**Test cases (assert BEHAVIOR):**
1. **M6 — invalid plan is NOT renamed.** With auto-move enabled, a plan that
   fails `validateForReview` → `moveToReviewAfterPush(planPath, tempRoot)`
   returns `{ moved:false, reason }` with a non-empty `reason`; assert the file
   is STILL at its original path and ABSENT from `plans/review/`.
2. **Valid plan IS moved (no over-rejection).** A plan that passes
   `validateForReview` → returns `{ moved:true, newPath }` and the file is now in
   `plans/review/`.
3. **auto-move disabled short-circuits before validation.** With the setting
   false, returns `{ moved:false, reason:'auto-move disabled' }` regardless of
   plan validity (existing behavior preserved; validation not even reached).
4. **Validation throw → fail closed.** If validation cannot run, returns
   `{ moved:false, reason }` and the file is not renamed.

**Coverage:** ≥80% on the modified function; disabled / invalid / valid / throw
branches all exercised.

### Security Review

- [x] **Fail closed:** invalid or validation-throwing plan is never renamed into
  `review`.
- [x] **Observable failure:** caller receives `{ moved:false, reason }` naming the
  validation reason (mirrors the cleanup-path contract in `s3`).
- [x] **No path traversal added:** uses existing `path.basename`/`path.join`.
- [x] **No secrets / no injection:** no new command surface; reason strings are
  validator output.
- [x] **No gate weakening:** the change only ADDS a pre-move check.

## Decisions Taken Under Ambiguity

- **Reuse the existing `{ moved:false, reason }` shape** rather than inventing a
  new result type. The parent asks for "an observable failure result naming the
  validation reason (mirroring the shape of the cleanup-path result)"; `sync.js`
  already returns exactly this shape for `auto-move disabled`, so the
  validation-failure case is contract-consistent by construction.
- **Validation runs AFTER the `autoMove` early return.** When auto-move is off,
  nothing moves anyway, so validating would be wasted work; the existing
  short-circuit is preserved (test case 3 pins this).

## Execution Plan

### Step 8: TEST
- [x] Write `tests/ctoc-audit-w05-sync-validated.test.js` FIRST (TDD RED): the 4
      behavior cases with a real temp project + real settings, no doubles.
- [x] Confirm RED: today the invalid plan is renamed into `review` and the
      function returns `{ moved:true }`.

### Step 9: PREPARE
- [x] Confirm how `workflow.autoMoveToReview` is read (`getSetting`) so the test
      can enable it in a real temp `.ctoc/settings`.
- [x] Confirm `plan-validator.js` has no require on `sync.js` (no cycle).

### Step 10: IMPLEMENT
- [x] `src/lib/sync.js`: add `require` of `validateForReview` from
      `./plan-validator`.
- [x] `src/lib/sync.js`: insert the try/catch validation gate before
      `renameSync`; return `{ moved:false, reason }` on invalid/throw; proceed to
      rename only when valid.

### Step 11: REVIEW
- [x] Self-review: disabled short-circuit intact; invalid never renames; valid
      still renames; no cycle; result shape consistent with `s3`.

### Step 12: OPTIMIZE
- [x] Single `validateForReview` call; no redundant `existsSync`/reads beyond
      what already exists.

### Step 13: SECURE
- [x] Walk the Security Review checklist; confirm fail-closed on validation throw.

### Step 14: VERIFY
- [x] Run `node --test tests/ctoc-audit-w05-sync-validated.test.js` → green.
- [x] Run full suite `node --test tests/*.test.js` → `# fail 0`, `0 skipped`.
- [x] Coverage ≥80% on `moveToReviewAfterPush`.

### Step 15: DOCUMENT
- [x] Update the JSDoc/comment on `moveToReviewAfterPush` to note the validation
      gate and the `{ moved:false, reason }` failure contract.

### Step 16: FINAL-REVIEW
- [x] Confirm the post-push sync path is validated identically to the manual
      path, returns an observable reasoned failure, still moves valid plans, and
      the auto-move-disabled short-circuit is preserved. Scope limited to the two
      declared files.


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

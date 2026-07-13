---
approved_by: human
approved_at: 2026-07-13T20:53:24.541Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.326Z
gate_crossed: implementation → todo
---

---
title: "W05-s2 — validateReviewToDone can return valid:false"
type: feature
parent_plan: "ctoc-audit-w05-gate3-verifies"
depends_on: ctoc-audit-w05-s1-verify-evidence
priority: HIGH
files:
  - src/lib/plan-validator.js
  - tests/ctoc-audit-w05-gate3-review-to-done.test.js
---

# W05-s2 — validateReviewToDone can return valid:false

SIP1 slice 2 of 5 for `ctoc-audit-w05-gate3-verifies` (finding **C9**). This is
the load-bearing slice: it turns the review→done validator from a structurally-
always-`true` function into a gate that can actually **reject**. Depends on `s1`
for `readVerifyEvidence`.

Load-bearing defect (verified against the running code):
`src/lib/plan-validator.js:535-562` constructs `result.valid = true` and never
reassigns it; the `hasApproval` (line 547) and `hasUnresolved` (line 555) checks
only `push` to `result.warnings`. There is no `result.errors.push` and no
`result.valid = false` anywhere in the function — no input can make it fail.
`approveSubplans` (actions.js:1028,1042,1047) runs exactly this validator per
sibling on the review→done batch and only skips a sibling when
`validation.valid === false` — a branch that is currently unreachable.

**`approveSubplans` needs NO code change** — actions.js:1047 already honors
`valid:false` and reports the sibling in `skipped[]`. It "inherits the fix for
free" the moment this validator can fail. Its behavior is therefore verified by
an integration test in THIS slice (touching no production file but
`plan-validator.js`).

## Implementation Details

### Dependency Graph

```
readVerifyEvidence  (from s1: src/lib/step-13-verify.js)
        │ required by
        ▼
validateReviewToDone (src/lib/plan-validator.js)  ── reuses ──▶ validateStepsComplete (same file, existing)
        ▲
        │ called per-sibling (unchanged) by
approveSubplans (src/lib/actions.js:1042)  ── honors valid:false at :1047 (unchanged) ──▶ skipped[]
```

No cycle: `plan-validator.js` requiring `step-13-verify.js` is a new inward edge;
`step-13-verify.js` does not require `plan-validator.js`.

### File Specifications

#### File: `src/lib/plan-validator.js`
**Action:** MODIFY
**Purpose:** Give `validateReviewToDone` real `errors[]` / `valid:false` paths
for the three defect conditions, plus keep `valid:true` for a compliant plan.

**Changes:**
- **Import** `readVerifyEvidence` from `./step-13-verify` (add to the require
  block at the top of the file).
- **Rewrite the body of `validateReviewToDone(planPath, projectPath)`** (keep the
  signature and the result shape). New logic, each condition pushing to
  `result.errors` and setting `result.valid = false`:

  1. **Missing human-approval marker → ERROR (was warning).**
     `hasApproval = /approved_by:\s*human/i.test(content) || metadata.approved_by === 'human'`.
     If `!hasApproval`: `result.errors.push('review→done blocked: no "approved_by: human" marker found')`;
     `result.valid = false`. *(Scenario: "Rejects a plan missing the human-approval marker.")*

  2. **Any required-step checkbox unchecked (esp. Step 14 VERIFY) → ERROR.**
     Call the existing `validateStepsComplete(content, planPath, projectPath)`.
     Push its `errors` (absent-required-step errors) into `result.errors`.
     Then, from its `checklist`, for every entry with `required === true &&
     present === true && completed === false && skipped === false`, push
     `\`review→done blocked: Step ${n} (${name}) has an unchecked required
     checkbox\`` and set `valid = false`. This closes the specific "unchecked
     Step 14 VERIFY box" case that `validateStepsComplete` alone only records in
     its checklist (it errors only when a required step is *absent*, not when
     present-but-unchecked). *(Scenario: "Rejects a plan with an unchecked Step
     14 VERIFY checkbox.")*

  3. **VERIFY evidence absent OR failing OR stale → ERROR.**
     `const planSlug = path.basename(planPath, '.md');`
     `const evidence = readVerifyEvidence(projectPath, planSlug);`
     - `evidence == null` → `result.errors.push('review→done blocked: no VERIFY
       evidence recorded for this plan (run Step 14 VERIFY)')`; `valid = false`.
       *(Scenario: "Rejects a plan with no VERIFY evidence at all.")*
     - `evidence.passed === false` → `result.errors.push(\`review→done blocked:
       recorded VERIFY run failed: ${(evidence.errors||[]).join('; ') ||
       evidence.summary}\`)`; `valid = false`. The message names the SPECIFIC
       failure, not a generic "not approved." *(Scenario: "A failed real
       verification run blocks the transition.")*
     - **Staleness:** if `evidence.timestamp` is older than the plan file's last
       modification (`safeFs.statSync(planPath).mtimeMs`), treat as absent:
       `result.errors.push('review→done blocked: VERIFY evidence is stale
       (recorded before the plan's last change)')`; `valid = false`. (Parent
       decision: "a timestamp not older than the plan's last content change.")

  4. **Keep the existing unresolved-feedback check as a WARNING** (TODO/FIXME) —
     do not promote it to an error (out of the parent's three named conditions;
     avoids over-rejection). *(Preserves M2: a compliant fixture stays valid.)*

  5. Populate `result.checklist` with `{ humanReviewed, steps, verifyEvidence }`
     so the failure is legible.

  When none of 1-3 fire, `result.valid` stays `true` and `result.errors` is empty
  — a genuinely finished plan passes. *(Scenario: "Accepts a genuinely finished
  plan"; metric M2.)*

- **Update** `module.exports` — no change needed (`validateReviewToDone` is
  already exported).

**Error handling:** `readVerifyEvidence` never throws (s1 contract). Wrap
`statSync` in a guard: if the plan file is unreadable, fail closed (treat as an
error). `validateStepsComplete` is already side-effect-free.

**Cross-platform:** basename/join only; `mtimeMs` is portable.

### Test Plan

#### Tests: `tests/ctoc-audit-w05-gate3-review-to-done.test.js`
**Action:** CREATE
**Framework:** `node:test`.

**Zero-doubles:** every fixture is a real `.md` plan file and a real
`.ctoc/state/verify/<slug>.json` artifact written to a temp project root; no
function is mocked. Fully-compliant fixtures use a passing artifact whose
`timestamp` is set *after* the plan file is written (fresh).

**Test cases (assert BEHAVIOR — the gate rejects/accepts):**
1. **M1a — missing marker → valid:false.** Fixture: all Step-14 boxes checked +
   fresh passing artifact, but NO `approved_by: human`. Assert `valid === false`
   and an error string mentions the missing approval marker.
2. **M1b — unchecked Step 14 VERIFY box → valid:false.** Fixture: valid marker +
   fresh passing artifact, but Step 14's checkbox is `- [ ]`. Assert
   `valid === false` and an error names Step 14 (VERIFY) as incomplete.
3. **M1c — no VERIFY evidence → valid:false.** Fixture: valid marker + all boxes
   checked, but NO artifact on disk. Assert `valid === false` and an error names
   missing VERIFY evidence.
4. **M2 — fully compliant → valid:true.** Fixture: valid marker + all required
   boxes checked + fresh passing artifact. Assert `valid === true` and
   `errors.length === 0` (guards against always-reject overcorrection).
5. **M4 — recorded FAIL vs PASS flips the result on the VERIFY axis.** Two
   fixtures identical except the artifact's `passed` (false vs true) and matching
   `errors`; assert the failing one is `valid:false` with an error attributable
   to the VERIFY failure, and the passing one is not rejected on that basis.
6. **Staleness — artifact older than plan → valid:false.** Passing artifact whose
   `timestamp` predates the plan file's mtime; assert rejected as stale.
7. **M3 — approveSubplans skips the bad sibling (integration).** Build a temp
   `plans/` tree with two review-stage siblings sharing
   `parent_plan: fixparent` — one compliant, one missing its marker. Call
   `approveSubplans('fixparent', 'review', tempRoot)`. Assert `approved` includes
   the good slug and EXCLUDES the bad one, and `skipped` contains the bad slug
   with a non-empty `reason`. (No production change to `approveSubplans`; this
   proves it inherits the fix.)

**Coverage:** ≥80% on the rewritten `validateReviewToDone`; each of the three
error branches + the pass branch + the staleness branch exercised.

### Security Review

- [x] **Input validation:** `planSlug` derived via `path.basename(planPath,'.md')`
  — never a raw path into the artifact lookup.
- [x] **Fail closed:** unreadable plan / corrupt evidence / stale evidence all
  push errors and set `valid:false` (never silently pass).
- [x] **No secrets / no injection:** pure read + regex over plan content; regexes
  are literal (no user-interpolated `RegExp`), so no ReDoS surface added.
- [x] **Error messages:** name the failing condition; do not leak absolute paths
  or stack traces.
- [x] **No gate weakening:** this slice can only make the gate STRICTER; there is
  no code path that turns an existing rejection into a pass.

## Decisions Taken Under Ambiguity

- **Staleness = artifact `timestamp` < plan file `mtimeMs`.** The parent said
  "not older than the plan's last content change" without naming the mechanism.
  File mtime is the portable, available signal; documented here.
- **Unresolved-feedback (TODO/FIXME) stays a WARNING.** It is not one of the
  three named rejection conditions; promoting it would risk rejecting compliant
  plans that legitimately mention "TODO" in prose. Kept as-is to protect M2.
- **VERIFY-evidence check is primary; Step-14 checkbox is secondary (both must
  hold).** Per the parent's decision, a ticked checkbox alone is insufficient —
  an actual artifact must exist, pass, and be fresh. Both conditions are enforced
  (belt and suspenders).

## Execution Plan

### Step 8: TEST
- [x] Write `tests/ctoc-audit-w05-gate3-review-to-done.test.js` FIRST (TDD RED):
      the 7 behavior cases above, using real temp plan fixtures + real artifact
      JSON (no doubles).
- [x] Confirm RED: today `validateReviewToDone` returns `valid:true` for all
      fixtures, so cases 1-3, 5, 6 fail; case 7's bad sibling is currently
      approved.

### Step 9: PREPARE
- [x] Confirm `s1` is built (`readVerifyEvidence` exported from
      `./step-13-verify`); if not, this slice's `depends_on` is unmet — do not
      start.
- [x] Confirm `validateStepsComplete` is callable in-module and returns the
      per-step `checklist` shape used above.

### Step 10: IMPLEMENT
- [x] `src/lib/plan-validator.js`: add `require` of `readVerifyEvidence` from
      `./step-13-verify`.
- [x] `src/lib/plan-validator.js`: rewrite `validateReviewToDone` body — marker
      error path; unchecked-required-step error path (via `validateStepsComplete`
      checklist); VERIFY-evidence absent/failing/stale error path; keep
      TODO/FIXME as warning; populate `checklist`.

### Step 11: REVIEW
- [x] Self-review: verify `valid` can be both `true` (M2) and `false` (M1) — no
      always-reject, no always-pass; error strings are specific; no change to
      `approveSubplans`.

### Step 12: OPTIMIZE
- [x] Read the plan content once; call `validateStepsComplete` once; single
      `readVerifyEvidence` call; no redundant file reads.

### Step 13: SECURE
- [x] Walk the Security Review checklist; confirm fail-closed on every
      unreadable/corrupt/stale path; confirm no user-interpolated `RegExp`.

### Step 14: VERIFY
- [x] Run `node --test tests/ctoc-audit-w05-gate3-review-to-done.test.js` → green.
- [x] Run full suite `node --test tests/*.test.js` → `# fail 0`, `0 skipped`.
- [x] Coverage ≥80% on `validateReviewToDone`.

### Step 15: DOCUMENT
- [x] Update the JSDoc on `validateReviewToDone` to describe the three rejection
      conditions and the pass condition.

### Step 16: FINAL-REVIEW
- [x] Confirm the review→done gate can now fail on marker/box/evidence, passes a
      compliant plan, and that `approveSubplans` skips a bad sibling (M3) with no
      change to its own code. Scope limited to the two declared files.


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

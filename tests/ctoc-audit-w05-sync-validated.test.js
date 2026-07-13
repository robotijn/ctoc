/**
 * W05-s4 — moveToReviewAfterPush routes the post-push in-progress→review rename
 * through validateForReview (finding C9, second skip path).
 *
 * These tests assert BEHAVIOR against a real temp project with real plan files
 * and real settings — no test doubles, no mocking. validateForReview runs for
 * real; the git/push machinery is not exercised (moveToReviewAfterPush only does
 * the local rename), so no throwaway git repo is required for this slice.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { moveToReviewAfterPush } = require('../src/lib/sync');
const { setSetting } = require('../src/lib/settings');

// ---- fixtures -------------------------------------------------------------

// A plan that PASSES validateForReview: full Execution Plan with every required
// Iron Loop step present and completed, no unescalated skips, no unchecked
// acceptance criteria, no unsatisfied file-creation claims.
const VALID_PLAN = `---
title: "Valid slice"
approved_by: human
files:
  - src/lib/example.js
---

# Valid slice

A cohesive, finished slice.

## Execution Plan

### Step 8: TEST
- [x] Tests written and run RED first

### Step 9: PREPARE
- [x] Environment ready

### Step 10: IMPLEMENT
- [x] Feature implemented

### Step 11: REVIEW
- [x] Self-review done

### Step 12: OPTIMIZE
- [x] No redundant work

### Step 13: SECURE
- [x] Inputs validated

### Step 14: VERIFY
- [x] All tests green, 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Docs updated

### Step 16: FINAL-REVIEW
- [x] Ready for human review
`;

// A plan that FAILS validateForReview: it has NO "## Execution Plan" section, so
// every required Iron Loop step is absent → validateStepsComplete pushes errors
// and validateForReview returns valid:false.
const INVALID_PLAN = `---
title: "Unfinished slice"
approved_by: human
---

# Unfinished slice

Body with no execution plan and no completed steps.
`;

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w05-s4-'));
  fs.mkdirSync(path.join(root, 'plans', 'in-progress'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plans', 'review'), { recursive: true });
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function writePlan(root, name, content) {
  const p = path.join(root, 'plans', 'in-progress', name);
  fs.writeFileSync(p, content);
  return p;
}

function reviewPath(root, name) {
  return path.join(root, 'plans', 'review', name);
}

// ---- M6: invalid plan is NOT renamed --------------------------------------

test('M6 — an invalid plan is not renamed into review and returns a reasoned failure', () => {
  const root = makeTempRoot();
  try {
    setSetting('workflow', 'autoMoveToReview', true, root);
    const name = 'invalid-slice.md';
    const planPath = writePlan(root, name, INVALID_PLAN);

    const result = moveToReviewAfterPush(planPath, root);

    assert.strictEqual(result.moved, false, 'invalid plan must not be moved');
    assert.ok(
      typeof result.reason === 'string' && result.reason.length > 0,
      'a non-empty reason must be returned'
    );
    assert.notStrictEqual(
      result.reason,
      'auto-move disabled',
      'reason must be the validation failure, not the disabled short-circuit'
    );
    assert.ok(
      fs.existsSync(planPath),
      'the plan file must remain at its original in-progress path'
    );
    assert.ok(
      !fs.existsSync(reviewPath(root, name)),
      'the plan file must be absent from plans/review/'
    );
  } finally {
    cleanup(root);
  }
});

// ---- valid plan IS moved (no over-rejection) ------------------------------

test('a valid plan is still moved into review (no over-rejection)', () => {
  const root = makeTempRoot();
  try {
    setSetting('workflow', 'autoMoveToReview', true, root);
    const name = 'valid-slice.md';
    const planPath = writePlan(root, name, VALID_PLAN);

    const result = moveToReviewAfterPush(planPath, root);

    assert.strictEqual(result.moved, true, 'valid plan must be moved');
    assert.strictEqual(
      result.newPath,
      reviewPath(root, name),
      'newPath must point into plans/review/'
    );
    assert.ok(
      fs.existsSync(reviewPath(root, name)),
      'the plan file must now live in plans/review/'
    );
    assert.ok(
      !fs.existsSync(planPath),
      'the plan file must no longer be at its original path'
    );
  } finally {
    cleanup(root);
  }
});

// ---- auto-move disabled short-circuits BEFORE validation ------------------

test('auto-move disabled short-circuits before validation regardless of plan validity', () => {
  const root = makeTempRoot();
  try {
    setSetting('workflow', 'autoMoveToReview', false, root);
    // Use the INVALID plan: if validation were reached it would still fail, but
    // the disabled short-circuit must fire first with its own distinct reason.
    const name = 'disabled-slice.md';
    const planPath = writePlan(root, name, INVALID_PLAN);

    const result = moveToReviewAfterPush(planPath, root);

    assert.deepStrictEqual(result, { moved: false, reason: 'auto-move disabled' });
    assert.ok(fs.existsSync(planPath), 'plan stays put when auto-move is disabled');
    assert.ok(!fs.existsSync(reviewPath(root, name)), 'plan not in review');
  } finally {
    cleanup(root);
  }
});

// ---- validation throw → fail closed ---------------------------------------

test('a validation throw fails closed: nothing is renamed and a reason is returned', () => {
  const root = makeTempRoot();
  try {
    setSetting('workflow', 'autoMoveToReview', true, root);
    // Create a DIRECTORY where a plan file is expected. validateForReview's
    // readFileSync throws EISDIR on it — a real, un-mocked failure — so the
    // validation gate must fail closed and never rename it.
    const name = 'throwing-slice.md';
    const planPath = path.join(root, 'plans', 'in-progress', name);
    fs.mkdirSync(planPath);

    const result = moveToReviewAfterPush(planPath, root);

    assert.strictEqual(result.moved, false, 'a validation throw must not move the plan');
    assert.ok(
      typeof result.reason === 'string' && result.reason.length > 0,
      'a non-empty reason must be returned on a validation throw'
    );
    assert.ok(
      fs.existsSync(planPath),
      'the original entry must remain in place after a fail-closed throw'
    );
    assert.ok(
      !fs.existsSync(reviewPath(root, name)),
      'nothing must have been renamed into plans/review/'
    );
  } finally {
    cleanup(root);
  }
});

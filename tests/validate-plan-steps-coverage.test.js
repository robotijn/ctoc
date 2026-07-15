/**
 * Branch-coverage tests for src/hooks/validate-plan-steps.js.
 *
 * SCOPE: this file targets the HOOK's OWN uncovered branches — the ones the
 * general suite (tests/hooks-remaining.test.js) leaves at 92.27% line / 66.67%
 * branch. The underlying plan-label library semantics are exercised elsewhere;
 * here every test pins a decision that goes RED under mutation:
 *
 *   - Step-8-must-WRITE-tests (TDD) error path        -> lines 106-107, the
 *     `identify.*coverage && !write.*test` conjunction and its `review.*pattern`
 *     alternate arm.
 *   - autoFixStepLabels file-not-found guard            -> lines 125-126.
 *   - autoFix SETUP -> PREPARE at Step 9                -> lines 141-143.
 *   - autoFix old-order DOCUMENT@14 -> VERIFY           -> lines 148-150.
 *   - autoFix old-order VERIFY@15   -> DOCUMENT         -> lines 155-157.
 *   - autoFix COMMIT@16 -> FINAL-REVIEW                 -> lines 162-164.
 *   - validator boundary/negation branches that the autofix path never touches:
 *     the `[-\s]` hyphen-or-space escapedLabel, the unknown-wrong-label else
 *     arm, case-insensitive known-wrong lookup, the no-op autofix write guard,
 *     and the re-validate wiring that still reports errors after a partial fix.
 *
 * The real module is loaded (no mocking of core logic). The only boundary is
 * the filesystem: real plan files under a real os.tmpdir() directory, removed
 * in `after`. AAA structure throughout; one conceptual subject per test.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validatePlanStepLabels,
  autoFixStepLabels
} = require('../src/hooks/validate-plan-steps.js');

// A fully-canonical plan body (Steps 8..16, correct labels). Individual tests
// mutate exactly one line via String.replace to isolate the branch under test.
const CANONICAL_PLAN_BODY = [
  '### Step 8: TEST',
  'Write the unit tests first (TDD).',
  '### Step 9: PREPARE',
  'Prepare scaffolding.',
  '### Step 10: IMPLEMENT',
  'Implement the change.',
  '### Step 11: REVIEW',
  'Self review.',
  '### Step 12: OPTIMIZE',
  'Optimize.',
  '### Step 13: SECURE',
  'Security scan.',
  '### Step 14: VERIFY',
  'Verify quality gate.',
  '### Step 15: DOCUMENT',
  'Document.',
  '### Step 16: FINAL-REVIEW',
  'Final review.'
].join('\n') + '\n';

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vps-'));
});

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

let counter = 0;
function writePlan(body) {
  const p = path.join(tmpDir, `plan-${counter++}.md`);
  fs.writeFileSync(p, body);
  return p;
}

// A path guaranteed not to exist (never written).
function absentPath() {
  return path.join(tmpDir, `absent-${counter++}-${Date.now()}.md`);
}

// ---------------------------------------------------------------------------
// Cluster A — Step 8 must WRITE tests (TDD), lines 106-107.
// The gate rejects a Step-8 section that only *identifies* coverage / reviews
// patterns without *writing* tests. This is the `&&` conjunction: an identify/
// review signal AND the absence of a write/create signal.
// ---------------------------------------------------------------------------
describe('validatePlanStepLabels — Step 8 must WRITE tests', () => {
  it('rejects_when_step8_identifies_coverage_without_writing_tests', () => {
    // Arrange — Step 8 talks about identifying coverage, never writing tests.
    const body = CANONICAL_PLAN_BODY.replace(
      'Write the unit tests first (TDD).',
      'Identify existing coverage.'
    );
    const plan = writePlan(body);

    // Act
    const res = validatePlanStepLabels(plan);

    // Assert — the WRITE-tests error fires; plan is rejected.
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some(e => /must WRITE tests first/i.test(e)),
      `errors: ${res.errors.join(' | ')}`
    );
  });

  it('allows_when_step8_identifies_coverage_but_also_writes_tests', () => {
    // Arrange — identify signal present, BUT a write-tests signal is also present,
    // so the `!write.*test` half of the conjunction is false -> no error.
    const body = CANONICAL_PLAN_BODY.replace(
      'Write the unit tests first (TDD).',
      'Identify existing coverage, then write the tests.'
    );
    const plan = writePlan(body);

    // Act
    const res = validatePlanStepLabels(plan);

    // Assert — the presence of "write tests" suppresses the TDD error entirely.
    assert.equal(res.valid, true, `unexpected errors: ${res.errors.join(' | ')}`);
    assert.ok(!res.errors.some(e => /must WRITE tests first/i.test(e)));
  });

  it('rejects_when_step8_only_reviews_patterns_without_writing_tests', () => {
    // Arrange — exercises the `review.*pattern` alternate arm of the first regex.
    const body = CANONICAL_PLAN_BODY.replace(
      'Write the unit tests first (TDD).',
      'Review the coverage pattern from prior slices.'
    );
    const plan = writePlan(body);

    // Act
    const res = validatePlanStepLabels(plan);

    // Assert
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some(e => /must WRITE tests first/i.test(e)),
      `errors: ${res.errors.join(' | ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// Cluster B — validator boundary / negation branches the autofix path never hits.
// ---------------------------------------------------------------------------
describe('validatePlanStepLabels — label-matching edge branches', () => {
  it('allows_final_review_written_with_a_space_instead_of_a_hyphen', () => {
    // Arrange — "FINAL REVIEW" (space) must be accepted because escapedLabel
    // rewrites the hyphen to `[-\s]`. Kills the hyphen-normalization mutant:
    // drop the `[-\s]` and a literal hyphen is required -> this goes RED.
    const body = CANONICAL_PLAN_BODY.replace('Step 16: FINAL-REVIEW', 'Step 16: FINAL REVIEW');
    const plan = writePlan(body);

    // Act
    const res = validatePlanStepLabels(plan);

    // Assert
    assert.equal(res.valid, true, `unexpected errors: ${res.errors.join(' | ')}`);
  });

  it('rejects_unknown_label_with_generic_expected_message', () => {
    // Arrange — a label NOT in WRONG_LABEL_MAP takes the else arm: a generic
    // "Found X but expected Y" message (no known-wrong guidance).
    const body = CANONICAL_PLAN_BODY.replace('Step 10: IMPLEMENT', 'Step 10: FROBNICATE');
    const plan = writePlan(body);

    // Act
    const res = validatePlanStepLabels(plan);

    // Assert — generic message, expected label named.
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some(e => /Found "FROBNICATE" but expected "IMPLEMENT"/.test(e)),
      `errors: ${res.errors.join(' | ')}`
    );
  });

  it('rejects_lowercase_known_wrong_label_case_insensitively', () => {
    // Arrange — a lowercase "quality" must still resolve to the QUALITY
    // known-wrong entry (foundLabel is upper-cased before the map lookup).
    const body = CANONICAL_PLAN_BODY.replace('Step 9: PREPARE', 'Step 9: quality');
    const plan = writePlan(body);

    // Act
    const res = validatePlanStepLabels(plan);

    // Assert — the QUALITY-specific guidance is emitted, not the generic message.
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some(e => /QUALITY is not a valid step label/.test(e)),
      `errors: ${res.errors.join(' | ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// Cluster C — autoFixStepLabels file-not-found guard, lines 125-126.
// ---------------------------------------------------------------------------
describe('autoFixStepLabels — missing file', () => {
  it('returns_not_fixed_for_absent_plan_without_throwing', () => {
    // Arrange
    const missing = absentPath();

    // Act
    const res = autoFixStepLabels(missing);

    // Assert — fail-soft: no throw, nothing fixed, not-found reported.
    assert.equal(res.fixed, false);
    assert.deepEqual(res.changes, []);
    assert.ok(res.errors.some(e => /not found/i.test(e)), `errors: ${res.errors.join(' | ')}`);
  });
});

// ---------------------------------------------------------------------------
// Cluster D — autoFixStepLabels rename branches, lines 141-143 / 148-150 /
// 155-157 / 162-164. Each rewrites a known-wrong label to the canonical one and
// re-validates. The existing suite only covers QUALITY->PREPARE.
// ---------------------------------------------------------------------------
describe('autoFixStepLabels — label rewrites', () => {
  it('renames_setup_to_prepare_at_step9_and_revalidates_clean', () => {
    // Arrange
    const plan = writePlan(CANONICAL_PLAN_BODY.replace('Step 9: PREPARE', 'Step 9: SETUP'));

    // Act
    const res = autoFixStepLabels(plan);

    // Assert
    assert.equal(res.fixed, true);
    assert.ok(res.changes.some(c => /SETUP to PREPARE/.test(c)), `changes: ${res.changes.join(' | ')}`);
    assert.equal(res.valid, true, `post-fix errors: ${(res.errors || []).join(' | ')}`);
    assert.match(fs.readFileSync(plan, 'utf8'), /Step 9: PREPARE/);
  });

  it('swaps_old_order_document14_and_verify15_back_to_canonical', () => {
    // Arrange — the pre-reorder layout: Step 14 labeled DOCUMENT, Step 15 VERIFY.
    let body = CANONICAL_PLAN_BODY.replace('Step 14: VERIFY', 'Step 14: DOCUMENT');
    body = body.replace('Step 15: DOCUMENT', 'Step 15: VERIFY');
    const plan = writePlan(body);

    // Act
    const res = autoFixStepLabels(plan);

    // Assert — BOTH renames happen (each pins a distinct if-body) and the plan
    // re-validates clean. Missing either rename -> valid would be false.
    assert.equal(res.valid, true, `post-fix errors: ${(res.errors || []).join(' | ')}`);
    assert.ok(res.changes.some(c => /Step 14: Renamed DOCUMENT to VERIFY/.test(c)), `changes: ${res.changes.join(' | ')}`);
    assert.ok(res.changes.some(c => /Step 15: Renamed VERIFY to DOCUMENT/.test(c)), `changes: ${res.changes.join(' | ')}`);
  });

  it('renames_commit_to_final_review_at_step16_and_revalidates_clean', () => {
    // Arrange
    const plan = writePlan(CANONICAL_PLAN_BODY.replace('Step 16: FINAL-REVIEW', 'Step 16: COMMIT'));

    // Act
    const res = autoFixStepLabels(plan);

    // Assert
    assert.equal(res.fixed, true);
    assert.ok(res.changes.some(c => /COMMIT to FINAL-REVIEW/.test(c)), `changes: ${res.changes.join(' | ')}`);
    assert.equal(res.valid, true, `post-fix errors: ${(res.errors || []).join(' | ')}`);
  });
});

// ---------------------------------------------------------------------------
// Cluster E — autoFixStepLabels no-op + re-validate wiring.
// ---------------------------------------------------------------------------
describe('autoFixStepLabels — no-op and partial-fix wiring', () => {
  it('makes_no_changes_and_reports_valid_for_a_canonical_plan', () => {
    // Arrange — nothing to fix; the `changes.length > 0` write guard stays false.
    const plan = writePlan(CANONICAL_PLAN_BODY);

    // Act
    const res = autoFixStepLabels(plan);

    // Assert — no change, but the re-validate still runs and reports valid.
    assert.equal(res.fixed, false);
    assert.deepEqual(res.changes, []);
    assert.equal(res.valid, true, `unexpected errors: ${(res.errors || []).join(' | ')}`);
  });

  it('reports_remaining_errors_when_a_fix_still_leaves_the_plan_invalid', () => {
    // Arrange — QUALITY@9 (fixable) AND Step 16 removed entirely (not fixable).
    let body = CANONICAL_PLAN_BODY.replace('Step 9: PREPARE', 'Step 9: QUALITY');
    body = body.replace('### Step 16: FINAL-REVIEW\nFinal review.\n', '');
    const plan = writePlan(body);

    // Act
    const res = autoFixStepLabels(plan);

    // Assert — a fix was applied, yet re-validation still surfaces the missing
    // Step 16 as an error. Pins the wiring that returns post-fix validation.
    assert.equal(res.fixed, true);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some(e => /16/.test(e) && /FINAL-REVIEW/.test(e)),
      `errors: ${res.errors.join(' | ')}`
    );
  });
});

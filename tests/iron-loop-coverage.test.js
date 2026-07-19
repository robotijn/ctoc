/**
 * Iron Loop — hard coverage tests (failure-first, edge-case).
 *
 * These tests drive the REAL exported functions of src/lib/iron-loop.js against
 * real temp-dir plan fixtures. Every test here calls the actual module and asserts
 * on the value it returns or the file it writes.
 *
 * Coverage targets: integrate (throw + section extraction, both truthy and empty
 * branches), generateExecutionPlan (item + else branches), extractCheckboxItems /
 * extractActionItems, critique (throw, absent section, canonical plan, mislabeled
 * versus absent step, duplicate IMPLEMENT), refineLoop (throw, append, the single
 * not-evaluated status, structural findings, ignored maxRounds),
 * appendDeferredQuestions (empty guard + append + provenance line).
 *
 * DELETED WITH THEIR CODE (the one sanctioned reason to delete a test): the
 * hasIronLoopSteps / validateForTodo cases, and every case asserting a numeric
 * dimension score. validateForTodo had zero callers and checked a marker this
 * module never writes; the five score* helpers graded the boilerplate template that
 * this same module had just appended to the plan. The companion file
 * tests/iron-loop-reports-no-evaluation.test.js pins the honest verdict that
 * replaced them.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  integrate,
  critique,
  refineLoop,
  appendDeferredQuestions,
  generateExecutionPlan,
  extractCheckboxItems,
  extractActionItems
} = require('../src/lib/iron-loop');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Create an isolated temp dir + plan file. Returns { file, dir }. */
function makePlan(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iron-loop-cov-'));
  const file = path.join(dir, 'plan.md');
  fs.writeFileSync(file, content, 'utf8');
  return { file, dir };
}

function rimraf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** A path guaranteed not to exist. */
function missingPath() {
  return path.join(os.tmpdir(), `iron-loop-does-not-exist-${Date.now()}-${Math.random()}.md`);
}

// A canonical, all-correct execution plan that scores 5 on every dimension.
// - completeness 5: all 9 canonical labels correct, single IMPLEMENT, >=9 checkboxes
// - clarity 5: no vague patterns
// - edgeCases 5: error handling + timeout + empty state + validation (>=3 hits)
// - efficiency 5: no duplicate checkbox lines
// - security 5: validate input + sanitize + path traversal + no secret + safe file
const PERFECT_EXEC_PLAN = `# Plan

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] Write unit tests covering validation and error handling
### Step 9: PREPARE
- [ ] Install the build dependencies
### Step 10: IMPLEMENT
- [ ] Build the parser module
### Step 11: REVIEW
- [ ] Self review the produced diff
### Step 12: OPTIMIZE
- [ ] Reduce redundant allocations
### Step 13: SECURE
- [ ] Validate input and sanitize; check path traversal; no secret; safe file ops
### Step 14: VERIFY
- [ ] Run lint and tests; handle timeout; cover the empty state
### Step 15: DOCUMENT
- [ ] Update the module readme
### Step 16: FINAL-REVIEW
- [ ] Confirm ready for human review
`;

// ---------------------------------------------------------------------------
// integrate — throw + section extraction
// ---------------------------------------------------------------------------

test('integrate throws when the plan file is missing', () => {
  const p = missingPath();
  assert.throws(() => integrate(p), /Plan file not found/);
});

test('integrate emits canonical Steps 8-16 with default items when no sections present', () => {
  // Arrange — a plan with none of Requirements / Proposed Solution / Implementation Plan
  const { file, dir } = makePlan('# Bare Plan\n\nJust prose, no structured sections.\n');
  try {
    // Act
    const md = integrate(file);

    // Assert — all canonical labels + the default (else-branch) items
    for (const label of ['TEST', 'PREPARE', 'IMPLEMENT', 'REVIEW', 'OPTIMIZE',
                         'SECURE', 'VERIFY', 'DOCUMENT', 'FINAL-REVIEW']) {
      assert.ok(md.includes(label), `missing canonical label ${label}`);
    }
    assert.ok(md.includes('Write tests for the implementation'), 'default test item');
    assert.ok(md.includes('Implement the feature according to requirements'), 'default impl item');
  } finally {
    rimraf(dir);
  }
});

test('integrate derives test items from Requirements checkboxes and impl items from action verbs', () => {
  // Arrange — populate all three extracted sections
  const content = `# Plan

## Requirements
- [ ] Parse the input file
- [ ] Validate the header

## Proposed Solution
Use a streaming parser.

## Implementation Plan
- Create the parser module
- Add validation logic
- Some non-action note that must be ignored
`;
  const { file, dir } = makePlan(content);
  try {
    // Act
    const md = integrate(file);

    // Assert — requirement text folded into Step 8 tests, action verbs into Step 10
    assert.ok(md.includes('Test: Parse the input file'));
    assert.ok(md.includes('Test: Validate the header'));
    assert.ok(md.includes('Create the parser module'));
    assert.ok(md.includes('Add validation logic'));
    assert.ok(!md.includes('non-action note'), 'non-action line must not appear as an impl item');
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// generateExecutionPlan — direct, both item and else branches
// ---------------------------------------------------------------------------

test('generateExecutionPlan uses fallback items when both requirement and impl inputs are empty', () => {
  // Act
  const md = generateExecutionPlan('', '', '');

  // Assert — else branches (no checkbox reqs, no action items)
  assert.ok(md.includes('Write tests for the implementation'));
  assert.ok(md.includes('Implement the feature according to requirements'));
});

test('generateExecutionPlan folds provided checkbox and action items into the steps', () => {
  // Act
  const md = generateExecutionPlan('- [ ] Requirement alpha', '', '- Create widget\n- Update config');

  // Assert — forEach branches
  assert.ok(md.includes('Test: Requirement alpha'));
  assert.ok(md.includes('Create widget'));
  assert.ok(md.includes('Update config'));
});

// ---------------------------------------------------------------------------
// extractCheckboxItems / extractActionItems
// ---------------------------------------------------------------------------

test('extractCheckboxItems returns empty array for text with no checkboxes', () => {
  assert.deepEqual(extractCheckboxItems('plain text\nno boxes here'), []);
});

test('extractCheckboxItems captures every checkbox line regardless of mark', () => {
  const items = extractCheckboxItems('- [ ] todo item\n- [x] done item\nprose\n- [ ] third');
  assert.equal(items.length, 3);
  assert.ok(items[1].includes('done item'));
});

test('extractActionItems returns empty array when no action verb lines exist', () => {
  assert.deepEqual(extractActionItems('- inspect the thing\n- consider options'), []);
});

test('extractActionItems captures only Create/Add/Modify/Update/Implement/Write leading lines', () => {
  const text = '- Create module\n- refactor later\n- Update docs\n- Implement handler\nprose line';
  const items = extractActionItems(text);
  assert.deepEqual(items, ['Create module', 'Update docs', 'Implement handler']);
});

// ---------------------------------------------------------------------------
// critique — throw + the honest not-evaluated report
//
// HISTORY: every case below that asserted a NUMERIC dimension score was deleted
// with the code that produced it. The five score* helpers computed their numbers by
// grepping the boilerplate template that generateExecutionPlan had just appended to
// the same file, so the cases pinned self-grading, not quality. Where a real,
// checkable behaviour survives (which step labels are present, which are wrong, how
// many IMPLEMENT steps exist) the case is REPLACED by a tighter assertion on the
// structural report — never loosened to make red go green.
// ---------------------------------------------------------------------------

test('critique throws when the plan file is missing', () => {
  assert.throws(() => critique(missingPath()), /Plan file not found/);
});

test('critique reports the absent execution section as a fact, inventing no scores', () => {
  const { file, dir } = makePlan('# Plan\n\nNo execution plan section at all.\n');
  try {
    // Act
    const result = critique(file);

    // Assert — the old code returned all-ones here: a numeric verdict on a section
    // it never read. Absence is now reported as absence.
    assert.equal(result.structural.hasExecutionPlan, false);
    assert.equal(result.scores, null);
    assert.equal(result.evaluated, false);
    assert.equal(result.stub, true);
    assert.deepEqual(result.feedback, []);
    // With no section, every canonical step is honestly missing.
    assert.deepEqual(result.structural.missingSteps, [8, 9, 10, 11, 12, 13, 14, 15, 16]);
    assert.deepEqual(result.structural.mislabeledSteps, []);
    assert.equal(result.structural.implementStepCount, 0);
  } finally {
    rimraf(dir);
  }
});

test('critique reports no missing and no mislabeled step for a canonical plan', () => {
  const { file, dir } = makePlan(PERFECT_EXEC_PLAN);
  try {
    // Act
    const result = critique(file);

    // Assert — a GOOD plan gets exactly the same honest verdict as a bad one,
    // because nothing evaluated either.
    assert.equal(result.structural.hasExecutionPlan, true);
    assert.deepEqual(result.structural.missingSteps, []);
    assert.deepEqual(result.structural.mislabeledSteps, []);
    assert.equal(result.structural.implementStepCount, 1);
    assert.equal(result.scores, null);
    assert.equal(result.evaluated, false);
    assert.match(result.warning, /NOT EVALUATED/);
  } finally {
    rimraf(dir);
  }
});

test('critique separates a MISLABELED step from an ABSENT one', () => {
  // Step 8 exists under the wrong label (BUILD); every other step is simply absent.
  // Collapsing both into one number is what the old completeness score did.
  const bad = `# Plan

## Execution Plan (Steps 8-16)

### Step 8: BUILD
- [ ] do task
- [ ] do task
`;
  const { file, dir } = makePlan(bad);
  try {
    // Act
    const result = critique(file);

    // Assert
    assert.deepEqual(result.structural.mislabeledSteps, [8]);
    assert.deepEqual(result.structural.missingSteps, [9, 10, 11, 12, 13, 14, 15, 16]);
    assert.equal(result.structural.implementStepCount, 0);
    assert.deepEqual(result.feedback, [], 'the hardcoded issue literals are gone');
  } finally {
    rimraf(dir);
  }
});

test('critique counts a duplicated IMPLEMENT step (Step 10 is ONE step, files as sub-items)', () => {
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] a
### Step 9: PREPARE
- [ ] b
### Step 10: IMPLEMENT
- [ ] c
### Step 10: IMPLEMENT
- [ ] c2 duplicate implement step
### Step 11: REVIEW
- [ ] d
### Step 12: OPTIMIZE
- [ ] e
### Step 13: SECURE
- [ ] f
### Step 14: VERIFY
- [ ] g
### Step 15: DOCUMENT
- [ ] h
### Step 16: FINAL-REVIEW
- [ ] i
`;
  const { file, dir } = makePlan(plan);
  try {
    const result = critique(file);
    assert.equal(result.structural.implementStepCount, 2);
    assert.deepEqual(result.structural.missingSteps, []);
    assert.deepEqual(result.structural.mislabeledSteps, []);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// refineLoop — throw + append + the single terminal status
// ---------------------------------------------------------------------------

test('refineLoop throws when the plan file is missing', () => {
  assert.throws(() => refineLoop(missingPath()), /Plan file not found/);
});

test('refineLoop appends a generated execution plan when none exists and reports not-evaluated', () => {
  // Real integrate path: no exec plan section present -> it must be appended + written.
  const content = `# Plan

## Requirements
- [ ] Parse the input
- [ ] Validate the header

## Implementation Plan
- Create the parser
- Add validation
`;
  const { file, dir } = makePlan(content);
  try {
    // Act
    const result = refineLoop(file, 3);

    // Assert — the append is the one piece of real work; the verdict is honest.
    assert.equal(result.status, 'not-evaluated');
    assert.equal(result.rounds, 1);
    assert.equal(result.scores, null);
    const onDisk = fs.readFileSync(file, 'utf8');
    assert.ok(onDisk.includes('## Execution Plan (Steps 8-16)'), 'section must be appended to disk');
  } finally {
    rimraf(dir);
  }
});

test('refineLoop returns not-evaluated for a canonical plan — a good plan is not graded either', () => {
  // Pre-seed a perfect plan -> no append -> still not evaluated. There is no
  // "all scores 5" branch to take, because there are no scores.
  const { file, dir } = makePlan(PERFECT_EXEC_PLAN);
  try {
    // Act
    const result = refineLoop(file, 5);

    // Assert
    assert.equal(result.status, 'not-evaluated');
    assert.equal(result.rounds, 1);
    assert.equal(result.scores, null);
    assert.equal(result.evaluated, false);
    assert.equal(result.stub, true);
    assert.equal(result.note, undefined, 'there is no "score >= 4" note, because there is no score');
  } finally {
    rimraf(dir);
  }
});

test('refineLoop surfaces structural findings in its deferred question, as integers only', () => {
  // A plan with one mislabeled step and the rest absent: those are real, checkable
  // facts about the file and are worth putting in front of the human at Gate 2.
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: BUILD
- [ ] do the task
`;
  const { file, dir } = makePlan(plan);
  try {
    // Act
    const result = refineLoop(file, 2);

    // Assert
    assert.equal(result.status, 'not-evaluated');
    assert.equal(result.deferredQuestions.length, 1);
    const q = result.deferredQuestions[0];
    assert.equal(q.dimension, 'evaluation');
    assert.match(q.feedback, /NOT EVALUATED/);
    assert.match(q.feedback, /no Step 9, 10, 11, 12, 13, 14, 15, 16 found/);
    assert.match(q.feedback, /Step 8 present under a non-canonical label/);
    // Only integers are interpolated — never a line of plan content.
    assert.equal(q.feedback.includes('do the task'), false);
  } finally {
    rimraf(dir);
  }
});

test('refineLoop ignores maxRounds honestly: 0 does not skip the work and rounds is always 1', () => {
  // The old code treated maxRounds as a real loop bound, so 0 skipped the body
  // entirely and returned a null-score "max-rounds" verdict. There is no loop now;
  // the parameter is accepted for signature compatibility and documented as ignored.
  const { file, dir } = makePlan(PERFECT_EXEC_PLAN);
  try {
    // Act
    const result = refineLoop(file, 0);

    // Assert
    assert.equal(result.status, 'not-evaluated');
    assert.equal(result.rounds, 1);
    assert.equal(result.scores, null);
    assert.equal(result.deferredQuestions.length, 1);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// appendDeferredQuestions — empty guard + append
// ---------------------------------------------------------------------------

test('appendDeferredQuestions leaves the plan untouched when the list is empty', () => {
  const { file, dir } = makePlan('# Plan\n\nbody\n');
  try {
    const before = fs.readFileSync(file, 'utf8');

    // Act — both empty-array and null must early-return without writing
    appendDeferredQuestions(file, []);
    appendDeferredQuestions(file, null);

    // Assert
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally {
    rimraf(dir);
  }
});

test('appendDeferredQuestions writes a Deferred Questions section that names its own provenance', () => {
  const { file, dir } = makePlan('# Plan\n\nbody\n');
  try {
    // Act
    appendDeferredQuestions(file, [
      { dimension: 'clarity', feedback: 'Step 10 remains vague' },
      { dimension: 'security', feedback: 'No input validation listed' }
    ]);

    // Assert
    const onDisk = fs.readFileSync(file, 'utf8');
    assert.ok(onDisk.includes('## Deferred Questions'));
    assert.ok(onDisk.includes('**clarity**: Step 10 remains vague'));
    assert.ok(onDisk.includes('**security**: No input validation listed'));
    // The provenance line is the repair: an entry here used to read as a finding
    // someone derived from the plan.
    assert.match(onDisk, /performs NO\nquality evaluation/);
  } finally {
    rimraf(dir);
  }
});

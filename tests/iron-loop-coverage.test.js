/**
 * Iron Loop — hard coverage tests (failure-first, edge-case).
 *
 * These tests drive the REAL exported functions of src/lib/iron-loop.js against
 * real temp-dir plan fixtures. They deliberately avoid the "simulated" pattern in
 * tests/iron-loop.test.js (which re-implements the logic inline and never calls the
 * module — false green). Every test here calls the actual module and asserts on the
 * value it returns or the file it writes.
 *
 * Coverage targets: hasIronLoopSteps missing-file guard, integrate (throw + section
 * extraction, both truthy and empty branches), generateExecutionPlan (item + else
 * branches), extractCheckboxItems / extractActionItems, critique (no-plan branch,
 * every feedback branch, throw), all five score* helpers via critique (wrong label,
 * missing step, duplicate IMPLEMENT, checkbox floor, vague clarity, edge/security
 * pattern accumulation, duplicate-line efficiency), refineLoop (throw, append,
 * all-perfect, avg>=4, max-rounds), appendDeferredQuestions (empty guard + append).
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  hasIronLoopSteps,
  validateForTodo,
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
// hasIronLoopSteps — missing-file guard (lines 22-23)
// ---------------------------------------------------------------------------

test('hasIronLoopSteps returns false when the plan file does not exist', () => {
  // Arrange / Act
  const result = hasIronLoopSteps(missingPath());

  // Assert — the existsSync guard short-circuits before any read
  assert.equal(result, false);
});

test('validateForTodo is invalid when the plan file does not exist', () => {
  // Act
  const result = validateForTodo(missingPath());

  // Assert
  assert.equal(result.valid, false);
  assert.match(result.error, /missing Iron Loop steps/i);
});

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
// critique — no-plan branch + throw
// ---------------------------------------------------------------------------

test('critique throws when the plan file is missing', () => {
  assert.throws(() => critique(missingPath()), /Plan file not found/);
});

test('critique returns all-ones and a completeness finding when no execution plan section exists', () => {
  const { file, dir } = makePlan('# Plan\n\nNo execution plan section at all.\n');
  try {
    // Act
    const result = critique(file);

    // Assert
    assert.deepEqual(result.scores, {
      completeness: 1, clarity: 1, edgeCases: 1, efficiency: 1, security: 1
    });
    assert.equal(result.feedback.length, 1);
    assert.equal(result.feedback[0].dimension, 'completeness');
    assert.match(result.feedback[0].suggestion, /integrate\(\) first/);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// critique — perfect plan (all 5, no feedback)
// ---------------------------------------------------------------------------

test('critique scores a canonical plan 5 on every dimension with no feedback', () => {
  const { file, dir } = makePlan(PERFECT_EXEC_PLAN);
  try {
    // Act
    const { scores, feedback } = critique(file);

    // Assert
    assert.deepEqual(scores, {
      completeness: 5, clarity: 5, edgeCases: 5, efficiency: 5, security: 5
    });
    assert.equal(feedback.length, 0);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// critique — a plan that fails EVERY dimension (all five feedback branches)
// ---------------------------------------------------------------------------

test('critique emits feedback on all five dimensions for a broken execution plan', () => {
  // wrong label (completeness 0), vague "do task" (clarity down),
  // no edge patterns (edge 3), duplicate lines (efficiency down), no security patterns (sec 3)
  const bad = `# Plan

## Execution Plan (Steps 8-16)

### Step 8: BUILD
- [ ] do task
- [ ] do task
`;
  const { file, dir } = makePlan(bad);
  try {
    // Act
    const { scores, feedback } = critique(file);

    // Assert — wrong label forces completeness to the blocking 0
    assert.equal(scores.completeness, 0);
    const dims = feedback.map(f => f.dimension).sort();
    assert.deepEqual(dims, ['clarity', 'completeness', 'edgeCases', 'efficiency', 'security']);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// scoreCompleteness branches (via critique)
// ---------------------------------------------------------------------------

test('completeness collapses to 1 when most steps are simply absent (no wrong label)', () => {
  // Only Step 8 present and correct; steps 9-16 missing entirely -> no label error,
  // heavy deduction, and <9 checkboxes clamps at the floor of 1.
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] Write tests
`;
  const { file, dir } = makePlan(plan);
  try {
    const { scores } = critique(file);
    assert.equal(scores.completeness, 1);
  } finally {
    rimraf(dir);
  }
});

test('completeness is penalised when a duplicate IMPLEMENT step appears', () => {
  // All canonical labels correct + an extra IMPLEMENT -> implementMatches.length > 1 -> -2.
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
    const { scores } = critique(file);
    // 5 (all labels present) - 2 (duplicate IMPLEMENT) = 3
    assert.equal(scores.completeness, 3);
  } finally {
    rimraf(dir);
  }
});

test('completeness drops by one when fewer than nine checkboxes accompany correct labels', () => {
  // All 9 canonical labels present and correct but only 3 checkboxes total.
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
### Step 9: PREPARE
### Step 10: IMPLEMENT
- [ ] one
### Step 11: REVIEW
### Step 12: OPTIMIZE
- [ ] two
### Step 13: SECURE
### Step 14: VERIFY
### Step 15: DOCUMENT
- [ ] three
### Step 16: FINAL-REVIEW
`;
  const { file, dir } = makePlan(plan);
  try {
    const { scores } = critique(file);
    // labels all correct -> 5; checkboxCount (3) < 9 -> max(1, 5-1) = 4
    assert.equal(scores.completeness, 4);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// scoreClarity — every vague pattern drives the score to the floor
// ---------------------------------------------------------------------------

test('clarity is floored at 1 when all vague phrasings are present', () => {
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] implement the feature quickly
- [ ] do the task now
- [ ] handle the things later
- [ ] fix the issues found
- [ ] update the stuff around it
`;
  const { file, dir } = makePlan(plan);
  try {
    const { scores } = critique(file);
    // 5 vague patterns each -1 -> below 1 -> Math.max(1, ...) = 1
    assert.equal(scores.clarity, 1);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// scoreEdgeCases — accumulation cap and floor
// ---------------------------------------------------------------------------

test('edgeCases saturates at 5 when many edge patterns are present', () => {
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] error handling
- [ ] timeout guard
- [ ] missing file case
- [ ] invalid input case
- [ ] empty state case
- [ ] edge case coverage
- [ ] validation added
`;
  const { file, dir } = makePlan(plan);
  try {
    const { scores } = critique(file);
    assert.equal(scores.edgeCases, 5);
  } finally {
    rimraf(dir);
  }
});

test('edgeCases stays at the neutral 3 when no edge patterns match', () => {
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] build the module quietly
`;
  const { file, dir } = makePlan(plan);
  try {
    const { scores } = critique(file);
    assert.equal(scores.edgeCases, 3);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// scoreEfficiency — duplicate checkbox lines deduct
// ---------------------------------------------------------------------------

test('efficiency deducts for repeated identical checkbox actions', () => {
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] run the same action
- [ ] run the same action
- [ ] run the same action
`;
  const { file, dir } = makePlan(plan);
  try {
    const { scores } = critique(file);
    // 3 identical lines -> two duplicates -> 5 - 2 = 3
    assert.equal(scores.efficiency, 3);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// scoreSecurity — accumulation cap and floor
// ---------------------------------------------------------------------------

test('security saturates at 5 when many security patterns are present', () => {
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] validate input
- [ ] sanitize output
- [ ] block path traversal
- [ ] no secret in code
- [ ] safe file operations
- [ ] general security review
`;
  const { file, dir } = makePlan(plan);
  try {
    const { scores } = critique(file);
    assert.equal(scores.security, 5);
  } finally {
    rimraf(dir);
  }
});

test('security stays at the neutral 3 when no security patterns match', () => {
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] render the output nicely
`;
  const { file, dir } = makePlan(plan);
  try {
    const { scores } = critique(file);
    assert.equal(scores.security, 3);
  } finally {
    rimraf(dir);
  }
});

// ---------------------------------------------------------------------------
// refineLoop — throw + append + terminal statuses
// ---------------------------------------------------------------------------

test('refineLoop throws when the plan file is missing', () => {
  assert.throws(() => refineLoop(missingPath()), /Plan file not found/);
});

test('refineLoop appends a generated execution plan when none exists and returns a score', () => {
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

    // Assert — a score-passed terminal status and the plan now carries the section
    assert.equal(result.status, 'score-passed');
    assert.ok(result.rounds >= 1);
    const onDisk = fs.readFileSync(file, 'utf8');
    assert.ok(onDisk.includes('## Execution Plan (Steps 8-16)'), 'section must be appended to disk');
  } finally {
    rimraf(dir);
  }
});

test('refineLoop returns score-passed on the first round when the seeded plan is perfect', () => {
  // Pre-seed a perfect plan -> no append -> critique yields all 5 -> allPerfect branch.
  const { file, dir } = makePlan(PERFECT_EXEC_PLAN);
  try {
    // Act
    const result = refineLoop(file, 5);

    // Assert
    assert.equal(result.status, 'score-passed');
    assert.equal(result.rounds, 1);
    assert.deepEqual(result.scores, {
      completeness: 5, clarity: 5, edgeCases: 5, efficiency: 5, security: 5
    });
    assert.equal(result.note, undefined, 'perfect plan takes the all-perfect branch, not the avg branch');
  } finally {
    rimraf(dir);
  }
});

test('refineLoop takes the average>=4 branch and carries the not-an-approval note', () => {
  // Perfect except one vague clarity line -> clarity 4, avg 4.8 -> avg>=4 branch with note.
  const plan = PERFECT_EXEC_PLAN.replace(
    '- [ ] Build the parser module',
    '- [ ] implement the feature according to spec'
  );
  const { file, dir } = makePlan(plan);
  try {
    // Act
    const result = refineLoop(file, 5);

    // Assert
    assert.equal(result.status, 'score-passed');
    assert.equal(result.scores.clarity, 4);
    assert.match(result.note, /SCORE, not an approval/);
  } finally {
    rimraf(dir);
  }
});

test('refineLoop accepts a plan whose average is exactly 4 (pins the >= 4 boundary)', () => {
  // Engineered so every dimension scores exactly 4 -> average 4.0.
  //   completeness 4: all 9 labels correct, single IMPLEMENT, 5 checkboxes (<9 -> -1)
  //   clarity 4:      exactly one vague phrase ("implement the feature")
  //   edgeCases 4:    two edge hits (timeout, validation) -> round(3 + 1.0) = 4
  //   efficiency 4:   exactly one duplicated checkbox line -> 5 - 1
  //   security 4:     two security hits (validate input, sanitize) -> round(3 + 1.0) = 4
  // A `> 4` mutant would drop through to max-rounds; a `>= 4` keeps score-passed.
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] implement the feature with timeout handling
### Step 9: PREPARE
- [ ] validate input and sanitize the payload
### Step 10: IMPLEMENT
- [ ] add validation checks
### Step 11: REVIEW
- [ ] repeat this exact step
### Step 12: OPTIMIZE
- [ ] repeat this exact step
### Step 13: SECURE
### Step 14: VERIFY
### Step 15: DOCUMENT
### Step 16: FINAL-REVIEW
`;
  const { file, dir } = makePlan(plan);
  try {
    // Act
    const result = refineLoop(file, 3);

    // Assert — the boundary case is admitted, and every score is exactly 4
    assert.equal(result.status, 'score-passed');
    assert.deepEqual(result.scores, {
      completeness: 4, clarity: 4, edgeCases: 4, efficiency: 4, security: 4
    });
    assert.match(result.note, /SCORE, not an approval/);
  } finally {
    rimraf(dir);
  }
});

test('refineLoop exhausts maxRounds and returns deferred questions for a low-scoring plan', () => {
  // Seeded plan with a wrong label -> completeness 0, avg < 4 every round -> max-rounds.
  const plan = `## Execution Plan (Steps 8-16)

### Step 8: BUILD
- [ ] do the task
- [ ] do the task
`;
  const { file, dir } = makePlan(plan);
  try {
    // Act — small maxRounds keeps the test fast while still exercising the loop
    const result = refineLoop(file, 2);

    // Assert
    assert.equal(result.status, 'max-rounds');
    assert.equal(result.rounds, 2);
    assert.ok(Array.isArray(result.deferredQuestions));
    assert.ok(result.deferredQuestions.length > 0);
    assert.ok('dimension' in result.deferredQuestions[0]);
    assert.ok('feedback' in result.deferredQuestions[0]);
  } finally {
    rimraf(dir);
  }
});

test('refineLoop with maxRounds 0 skips the loop and returns null scores with no questions', () => {
  // Edge: the loop body never runs, so lastCritique stays null and the max-rounds
  // return must fall back to scores:null / deferredQuestions:[] without throwing.
  const { file, dir } = makePlan(PERFECT_EXEC_PLAN);
  try {
    // Act
    const result = refineLoop(file, 0);

    // Assert
    assert.equal(result.status, 'max-rounds');
    assert.equal(result.rounds, 0);
    assert.equal(result.scores, null);
    assert.deepEqual(result.deferredQuestions, []);
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

test('appendDeferredQuestions writes a Deferred Questions section with every entry', () => {
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
  } finally {
    rimraf(dir);
  }
});

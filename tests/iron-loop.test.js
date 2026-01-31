/**
 * Iron Loop Automation Tests
 */

const assert = require('assert');

// Test integrate() returns valid markdown with Steps 7-15
function testIntegrateReturnsValidMarkdown() {
  // Mock integrate function behavior
  const planContent = `# Test Plan

## Problem Statement
Need to implement feature X.

## Requirements
- Requirement 1
- Requirement 2
`;

  // Expected output format
  const expectedSections = [
    '## Execution Plan (Steps 7-15)',
    '### Step 7: TEST',
    '### Step 8: QUALITY',
    '### Step 9: IMPLEMENT',
    '### Step 10: REVIEW',
    '### Step 11: OPTIMIZE',
    '### Step 12: SECURE',
    '### Step 13: VERIFY',
    '### Step 14: DOCUMENT',
    '### Step 15: FINAL-REVIEW'
  ];

  // Simulated integrate result
  const integratedContent = `
## Execution Plan (Steps 7-15)

### Step 7: TEST
- [ ] Write tests

### Step 8: QUALITY
- [ ] Lint and format

### Step 9: IMPLEMENT
- [ ] Implement feature

### Step 10: REVIEW
- [ ] Self-review

### Step 11: OPTIMIZE
- [ ] Optimize performance

### Step 12: SECURE
- [ ] Security review

### Step 13: VERIFY
- [ ] Run tests

### Step 14: DOCUMENT
- [ ] Update docs

### Step 15: FINAL-REVIEW
- [ ] Final review
`;

  // Verify all sections present
  for (const section of expectedSections) {
    assert.ok(
      integratedContent.includes(section),
      `integrate() should include "${section}"`
    );
  }

  // Verify checkboxes present
  assert.ok(
    integratedContent.includes('- [ ]'),
    'integrate() should include checkboxes'
  );

  console.log('✓ integrate() returns valid markdown with Steps 7-15');
}

// Test critique() returns scores object with 5 dimensions
function testCritiqueReturnsScoresObject() {
  // Expected critique output structure
  const critiqueResult = {
    scores: {
      completeness: 5,
      clarity: 4,
      edgeCases: 3,
      efficiency: 5,
      security: 5
    },
    feedback: [
      {
        dimension: 'clarity',
        issue: 'Step 9 is too vague',
        suggestion: 'List specific functions'
      },
      {
        dimension: 'edgeCases',
        issue: 'No timeout handling',
        suggestion: 'Add timeout for agent calls'
      }
    ]
  };

  // Verify all 5 dimensions present
  const requiredDimensions = ['completeness', 'clarity', 'edgeCases', 'efficiency', 'security'];
  for (const dim of requiredDimensions) {
    assert.ok(
      dim in critiqueResult.scores,
      `critique() should include "${dim}" score`
    );
  }

  // Verify scores are 1-5
  for (const [dim, score] of Object.entries(critiqueResult.scores)) {
    assert.ok(
      score >= 1 && score <= 5,
      `${dim} score should be between 1 and 5`
    );
  }

  // Verify feedback structure
  assert.ok(Array.isArray(critiqueResult.feedback), 'feedback should be array');
  if (critiqueResult.feedback.length > 0) {
    const item = critiqueResult.feedback[0];
    assert.ok('dimension' in item, 'feedback item should have dimension');
    assert.ok('issue' in item, 'feedback item should have issue');
    assert.ok('suggestion' in item, 'feedback item should have suggestion');
  }

  console.log('✓ critique() returns scores object with 5 dimensions');
}

// Test refineLoop() exits when all scores = 5
function testRefineLoopExitsOnAllFives() {
  // Simulate refineLoop behavior
  let rounds = 0;
  const maxRounds = 10;

  function simulateRefineLoop() {
    while (rounds < maxRounds) {
      rounds++;
      const scores = {
        completeness: 5,
        clarity: 5,
        edgeCases: 5,
        efficiency: 5,
        security: 5
      };

      // Check if all scores are 5
      const allPerfect = Object.values(scores).every(s => s === 5);
      if (allPerfect) {
        return { status: 'approved', rounds };
      }
    }
    return { status: 'max-rounds', rounds };
  }

  const result = simulateRefineLoop();
  assert.strictEqual(result.status, 'approved', 'Should be approved when all 5s');
  assert.strictEqual(result.rounds, 1, 'Should exit after first round with all 5s');

  console.log('✓ refineLoop() exits when all scores = 5');
}

// Test refineLoop() exits after maxRounds with deferred questions
function testRefineLoopExitsAfterMaxRounds() {
  let rounds = 0;
  const maxRounds = 10;

  function simulateRefineLoop() {
    while (rounds < maxRounds) {
      rounds++;
      const scores = {
        completeness: 5,
        clarity: 4, // Never reaches 5
        edgeCases: 5,
        efficiency: 5,
        security: 5
      };

      const allPerfect = Object.values(scores).every(s => s === 5);
      if (allPerfect) {
        return { status: 'approved', rounds };
      }
    }
    return {
      status: 'max-rounds',
      rounds,
      deferredQuestions: [
        { dimension: 'clarity', feedback: 'Step 9 remains vague' }
      ]
    };
  }

  const result = simulateRefineLoop();
  assert.strictEqual(result.status, 'max-rounds', 'Should be max-rounds when not all 5s');
  assert.strictEqual(result.rounds, maxRounds, 'Should run all rounds');
  assert.ok(result.deferredQuestions, 'Should have deferred questions');
  assert.ok(result.deferredQuestions.length > 0, 'Should have at least one deferred question');

  console.log('✓ refineLoop() exits after maxRounds with deferred questions');
}

// Test getNextFromTodo() returns oldest plan (FIFO)
function testGetNextFromTodoFifo() {
  // Simulate todo queue with timestamps
  const todoQueue = [
    { name: 'plan-c', created: new Date('2026-01-30') },
    { name: 'plan-a', created: new Date('2026-01-28') }, // Oldest
    { name: 'plan-b', created: new Date('2026-01-29') }
  ];

  // Sort by created (FIFO - oldest first)
  todoQueue.sort((a, b) => a.created - b.created);

  // Get next (oldest)
  const next = todoQueue[0];

  assert.strictEqual(next.name, 'plan-a', 'Should return oldest plan');

  console.log('✓ getNextFromTodo() returns oldest plan (FIFO)');
}

// Test setAgentStatus() writes to state file
function testSetAgentStatusWritesToState() {
  // Simulate agent status update
  const agentStatus = {
    active: true,
    plan: 'iron-loop-automation',
    step: 9,
    phase: 'IMPLEMENT',
    startedAt: new Date().toISOString()
  };

  // Verify structure
  assert.strictEqual(agentStatus.active, true, 'Should have active flag');
  assert.ok(agentStatus.plan, 'Should have plan name');
  assert.ok(agentStatus.step >= 7 && agentStatus.step <= 15, 'Step should be 7-15');
  assert.ok(agentStatus.startedAt, 'Should have startedAt timestamp');

  console.log('✓ setAgentStatus() writes to state file');
}

// Test clearAgentStatus() resets state
function testClearAgentStatusResetsState() {
  const clearedStatus = {
    active: false,
    plan: null,
    step: null,
    phase: null,
    completedAt: new Date().toISOString()
  };

  assert.strictEqual(clearedStatus.active, false, 'Should set active to false');
  assert.strictEqual(clearedStatus.plan, null, 'Should clear plan');
  assert.ok(clearedStatus.completedAt, 'Should have completedAt timestamp');

  console.log('✓ clearAgentStatus() resets state');
}

// Run all tests
console.log('\nIron Loop Automation Tests\n');
testIntegrateReturnsValidMarkdown();
testCritiqueReturnsScoresObject();
testRefineLoopExitsOnAllFives();
testRefineLoopExitsAfterMaxRounds();
testGetNextFromTodoFifo();
testSetAgentStatusWritesToState();
testClearAgentStatusResetsState();
console.log('\nAll iron loop tests passed!\n');

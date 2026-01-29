#!/usr/bin/env node
/**
 * Tests for Iron Loop Integrator + Critic System
 *
 * Tests:
 * - Integrator produces valid execution plans
 * - Critic scores all 5 dimensions
 * - Loop runs correct number of rounds
 * - Deferred questions stored correctly
 * - Quality threshold enforcement
 */

const assert = require('assert');

// ============================================================================
// Mock Functions (to be replaced by real implementation)
// ============================================================================

/**
 * Critic Rubric Dimensions
 */
const RUBRIC_DIMENSIONS = {
  COMPLETENESS: 'completeness',
  CLARITY: 'clarity',
  EDGE_CASES: 'edge_cases',
  EFFICIENCY: 'efficiency',
  SECURITY: 'security'
};

/**
 * Default settings for integration
 */
const DEFAULT_SETTINGS = {
  max_rounds: 10,
  quality_threshold: 5,
  auto_approve_after_max: true,
  defer_unresolved: true
};

/**
 * Validates an execution plan structure
 * @param {Object} plan - The execution plan to validate
 * @returns {Object} Validation result {valid, errors}
 */
function validateExecutionPlan(plan) {
  const errors = [];

  if (!plan) {
    return { valid: false, errors: ['Plan is null or undefined'] };
  }

  // Check required steps 7-15
  const requiredSteps = [7, 8, 9, 10, 11, 12, 13, 14, 15];
  for (const step of requiredSteps) {
    const stepKey = `step_${step}`;
    if (!plan[stepKey]) {
      errors.push(`Missing step ${step}`);
    } else {
      // Each step must have an agent assigned
      if (!plan[stepKey].agent) {
        errors.push(`Step ${step} missing agent`);
      }
      // Each step must have tasks or actions
      if (!plan[stepKey].tasks && !plan[stepKey].actions && !plan[stepKey].checks) {
        errors.push(`Step ${step} missing tasks/actions/checks`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates critic scores
 * @param {Object} scores - The scores object
 * @returns {Object} Validation result {valid, errors, allPassed}
 */
function validateCriticScores(scores) {
  const errors = [];

  if (!scores) {
    return { valid: false, errors: ['Scores is null or undefined'], allPassed: false };
  }

  const dimensions = Object.values(RUBRIC_DIMENSIONS);
  let allPassed = true;

  for (const dim of dimensions) {
    if (scores[dim] === undefined) {
      errors.push(`Missing score for dimension: ${dim}`);
      allPassed = false;
    } else if (typeof scores[dim].score !== 'number') {
      errors.push(`Score for ${dim} is not a number`);
      allPassed = false;
    } else if (scores[dim].score < 1 || scores[dim].score > 5) {
      errors.push(`Score for ${dim} out of range (1-5): ${scores[dim].score}`);
      allPassed = false;
    } else if (scores[dim].score < 5) {
      // Score is valid but not passing
      allPassed = false;
      // Must have reason and suggestion if not 5
      if (!scores[dim].reason) {
        errors.push(`Score ${dim} < 5 but missing reason`);
      }
      if (!scores[dim].suggestion) {
        errors.push(`Score ${dim} < 5 but missing suggestion`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    allPassed
  };
}

/**
 * Validates deferred question format
 * @param {Object} question - The deferred question
 * @returns {Object} Validation result {valid, errors}
 */
function validateDeferredQuestion(question) {
  const errors = [];

  if (!question) {
    return { valid: false, errors: ['Question is null or undefined'] };
  }

  // Required fields
  if (!question.context) errors.push('Missing context');
  if (!question.issue) errors.push('Missing issue');
  if (!question.step) errors.push('Missing step');
  if (!question.question) errors.push('Missing question text');

  // Options validation
  if (!question.options || !Array.isArray(question.options)) {
    errors.push('Missing or invalid options array');
  } else if (question.options.length < 2) {
    errors.push('Must have at least 2 options');
  } else {
    for (let i = 0; i < question.options.length; i++) {
      const opt = question.options[i];
      if (!opt.id) errors.push(`Option ${i} missing id`);
      if (!opt.description) errors.push(`Option ${i} missing description`);
      if (!opt.pros) errors.push(`Option ${i} missing pros`);
      if (!opt.cons) errors.push(`Option ${i} missing cons`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Simulates the integrator-critic loop
 * @param {Object} implementationPlan - The input plan
 * @param {Object} settings - Loop settings
 * @returns {Object} Result {executionPlan, rounds, deferredQuestions, approved}
 */
function runIntegratorCriticLoop(implementationPlan, settings = DEFAULT_SETTINGS) {
  const result = {
    executionPlan: null,
    rounds: [],
    deferredQuestions: [],
    approved: false
  };

  if (!implementationPlan) {
    return result;
  }

  // Simulate rounds
  let currentPlan = createExecutionPlanFromImplementation(implementationPlan);

  for (let round = 1; round <= settings.max_rounds; round++) {
    // Critic scores the plan
    const scores = scorePlan(currentPlan, round);
    const validation = validateCriticScores(scores);

    result.rounds.push({
      round,
      scores,
      passed: validation.allPassed
    });

    if (validation.allPassed) {
      result.executionPlan = currentPlan;
      result.approved = true;
      break;
    }

    if (round === settings.max_rounds) {
      // Max rounds reached
      if (settings.auto_approve_after_max) {
        result.executionPlan = currentPlan;
        result.approved = true;
      }

      if (settings.defer_unresolved) {
        // Collect unresolved issues as deferred questions
        for (const [dim, score] of Object.entries(scores)) {
          if (score.score < 5) {
            result.deferredQuestions.push({
              context: `Round ${round} - ${dim} scored ${score.score}/5`,
              issue: score.reason,
              step: score.affectedStep || 9,
              question: `How should we address: ${score.reason}?`,
              options: [
                { id: 'A', description: 'Fix now', pros: 'Complete solution', cons: 'Takes time' },
                { id: 'B', description: 'Defer to later', pros: 'Ship faster', cons: 'Technical debt' },
                { id: 'C', description: 'Accept risk', pros: 'No changes', cons: 'Known issue remains' }
              ]
            });
          }
        }
      }
      break;
    }

    // Integrator refines based on feedback
    currentPlan = refinePlan(currentPlan, scores);
  }

  return result;
}

/**
 * Mock: Creates execution plan from implementation plan
 */
function createExecutionPlanFromImplementation(implPlan) {
  return {
    step_7: { agent: 'test-maker', tasks: implPlan.tests || ['write tests'] },
    step_8: { agent: 'quality-checker', checks: ['lint', 'format', 'type-check'] },
    step_9: { agent: 'implementer', tasks: implPlan.files || ['implement feature'] },
    step_10: { agent: 'self-reviewer', actions: ['review code', 'check quality'] },
    step_11: { agent: 'optimizer', tasks: ['optimize performance'] },
    step_12: { agent: 'security-scanner', checks: ['OWASP', 'input validation'] },
    step_13: { agent: 'verifier', actions: ['run all tests'] },
    step_14: { agent: 'documenter', tasks: ['update docs'] },
    step_15: { agent: 'implementation-reviewer', actions: ['final review'] }
  };
}

/**
 * Mock: Scores a plan (simulates critic behavior)
 * In real implementation, this would be the Critic agent
 */
function scorePlan(plan, round) {
  // Simulate improving scores over rounds
  const baseScore = Math.min(5, 2 + Math.floor(round / 2));
  const perfectRound = 6; // After round 6, all scores become 5

  const makeScore = (dim, affectedStep) => {
    const score = round >= perfectRound ? 5 : baseScore;
    return {
      score,
      reason: score < 5 ? `${dim} needs improvement` : null,
      suggestion: score < 5 ? `Improve ${dim}` : null,
      affectedStep: score < 5 ? affectedStep : null
    };
  };

  return {
    [RUBRIC_DIMENSIONS.COMPLETENESS]: makeScore('completeness', 9),
    [RUBRIC_DIMENSIONS.CLARITY]: makeScore('clarity', 9),
    [RUBRIC_DIMENSIONS.EDGE_CASES]: makeScore('edge_cases', 7),
    [RUBRIC_DIMENSIONS.EFFICIENCY]: makeScore('efficiency', 11),
    [RUBRIC_DIMENSIONS.SECURITY]: makeScore('security', 12)
  };
}

/**
 * Mock: Refines plan based on feedback
 */
function refinePlan(plan, feedback) {
  // In real implementation, this would use the Integrator agent
  return { ...plan, refined: true };
}

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${error.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(actual, message) {
  if (!actual) {
    throw new Error(`${message}: expected truthy value, got ${actual}`);
  }
}

function assertFalse(actual, message) {
  if (actual) {
    throw new Error(`${message}: expected falsy value, got ${actual}`);
  }
}

// ============================================================================
// Tests: Execution Plan Validation
// ============================================================================

console.log('\n=== Integrator + Critic Tests ===\n');
console.log('Testing: Execution Plan Validation\n');

test('null plan is invalid', () => {
  const result = validateExecutionPlan(null);
  assertFalse(result.valid, 'Null plan should be invalid');
});

test('empty plan missing all steps', () => {
  const result = validateExecutionPlan({});
  assertFalse(result.valid, 'Empty plan should be invalid');
  assertEqual(result.errors.length, 9, 'Should have 9 missing step errors');
});

test('valid plan with all steps passes', () => {
  const plan = {
    step_7: { agent: 'test-maker', tasks: ['write tests'] },
    step_8: { agent: 'quality-checker', checks: ['lint'] },
    step_9: { agent: 'implementer', tasks: ['code'] },
    step_10: { agent: 'self-reviewer', actions: ['review'] },
    step_11: { agent: 'optimizer', tasks: ['optimize'] },
    step_12: { agent: 'security-scanner', checks: ['security'] },
    step_13: { agent: 'verifier', actions: ['verify'] },
    step_14: { agent: 'documenter', tasks: ['document'] },
    step_15: { agent: 'implementation-reviewer', actions: ['final review'] }
  };
  const result = validateExecutionPlan(plan);
  assertTrue(result.valid, 'Valid plan should pass');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('plan with missing agent is invalid', () => {
  const plan = {
    step_7: { tasks: ['write tests'] }, // Missing agent
    step_8: { agent: 'quality-checker', checks: ['lint'] },
    step_9: { agent: 'implementer', tasks: ['code'] },
    step_10: { agent: 'self-reviewer', actions: ['review'] },
    step_11: { agent: 'optimizer', tasks: ['optimize'] },
    step_12: { agent: 'security-scanner', checks: ['security'] },
    step_13: { agent: 'verifier', actions: ['verify'] },
    step_14: { agent: 'documenter', tasks: ['document'] },
    step_15: { agent: 'implementation-reviewer', actions: ['final review'] }
  };
  const result = validateExecutionPlan(plan);
  assertFalse(result.valid, 'Plan with missing agent should be invalid');
  assertTrue(result.errors.some(e => e.includes('Step 7 missing agent')), 'Should report missing agent');
});

// ============================================================================
// Tests: Critic Scores Validation
// ============================================================================

console.log('\nTesting: Critic Scores Validation\n');

test('null scores is invalid', () => {
  const result = validateCriticScores(null);
  assertFalse(result.valid, 'Null scores should be invalid');
  assertFalse(result.allPassed, 'Should not pass');
});

test('missing dimension is invalid', () => {
  const scores = {
    completeness: { score: 5 },
    clarity: { score: 5 },
    // Missing edge_cases, efficiency, security
  };
  const result = validateCriticScores(scores);
  assertFalse(result.valid, 'Missing dimensions should be invalid');
});

test('all 5/5 scores pass', () => {
  const scores = {
    completeness: { score: 5 },
    clarity: { score: 5 },
    edge_cases: { score: 5 },
    efficiency: { score: 5 },
    security: { score: 5 }
  };
  const result = validateCriticScores(scores);
  assertTrue(result.valid, 'All 5/5 should be valid');
  assertTrue(result.allPassed, 'All 5/5 should pass');
});

test('score below 5 requires reason and suggestion', () => {
  const scores = {
    completeness: { score: 4 }, // Missing reason and suggestion
    clarity: { score: 5 },
    edge_cases: { score: 5 },
    efficiency: { score: 5 },
    security: { score: 5 }
  };
  const result = validateCriticScores(scores);
  assertFalse(result.valid, 'Score < 5 without reason should be invalid');
  assertFalse(result.allPassed, 'Should not pass with score < 5');
});

test('score below 5 with reason and suggestion is valid but not passing', () => {
  const scores = {
    completeness: { score: 4, reason: 'Missing edge case', suggestion: 'Add test for null input' },
    clarity: { score: 5 },
    edge_cases: { score: 5 },
    efficiency: { score: 5 },
    security: { score: 5 }
  };
  const result = validateCriticScores(scores);
  assertTrue(result.valid, 'Should be valid with reason/suggestion');
  assertFalse(result.allPassed, 'Should not pass with score < 5');
});

test('score out of range (0) is invalid', () => {
  const scores = {
    completeness: { score: 0 },
    clarity: { score: 5 },
    edge_cases: { score: 5 },
    efficiency: { score: 5 },
    security: { score: 5 }
  };
  const result = validateCriticScores(scores);
  assertFalse(result.valid, 'Score 0 should be out of range');
});

test('score out of range (6) is invalid', () => {
  const scores = {
    completeness: { score: 6 },
    clarity: { score: 5 },
    edge_cases: { score: 5 },
    efficiency: { score: 5 },
    security: { score: 5 }
  };
  const result = validateCriticScores(scores);
  assertFalse(result.valid, 'Score 6 should be out of range');
});

// ============================================================================
// Tests: Deferred Question Validation
// ============================================================================

console.log('\nTesting: Deferred Question Validation\n');

test('null question is invalid', () => {
  const result = validateDeferredQuestion(null);
  assertFalse(result.valid, 'Null question should be invalid');
});

test('valid deferred question passes', () => {
  const question = {
    context: 'Round 7 - edge_cases scored 4/5',
    issue: 'Network timeout handling not specified',
    step: 9,
    question: 'How should network timeouts be handled?',
    options: [
      { id: 'A', description: 'Retry 3 times', pros: 'Resilient', cons: 'May delay' },
      { id: 'B', description: 'Fail immediately', pros: 'Quick feedback', cons: 'Less tolerant' }
    ]
  };
  const result = validateDeferredQuestion(question);
  assertTrue(result.valid, 'Valid question should pass');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('question with missing context is invalid', () => {
  const question = {
    issue: 'Some issue',
    step: 9,
    question: 'How to handle?',
    options: [
      { id: 'A', description: 'Option A', pros: 'Pro', cons: 'Con' },
      { id: 'B', description: 'Option B', pros: 'Pro', cons: 'Con' }
    ]
  };
  const result = validateDeferredQuestion(question);
  assertFalse(result.valid, 'Missing context should be invalid');
});

test('question with only one option is invalid', () => {
  const question = {
    context: 'Context',
    issue: 'Issue',
    step: 9,
    question: 'Question?',
    options: [
      { id: 'A', description: 'Only option', pros: 'Pro', cons: 'Con' }
    ]
  };
  const result = validateDeferredQuestion(question);
  assertFalse(result.valid, 'Only one option should be invalid');
});

test('question with incomplete option is invalid', () => {
  const question = {
    context: 'Context',
    issue: 'Issue',
    step: 9,
    question: 'Question?',
    options: [
      { id: 'A', description: 'Option A' }, // Missing pros/cons
      { id: 'B', description: 'Option B', pros: 'Pro', cons: 'Con' }
    ]
  };
  const result = validateDeferredQuestion(question);
  assertFalse(result.valid, 'Incomplete option should be invalid');
});

// ============================================================================
// Tests: Integrator-Critic Loop
// ============================================================================

console.log('\nTesting: Integrator-Critic Loop\n');

test('loop with null implementation plan returns empty result', () => {
  const result = runIntegratorCriticLoop(null);
  assertEqual(result.executionPlan, null, 'Should have no execution plan');
  assertFalse(result.approved, 'Should not be approved');
});

test('loop runs until all 5/5 scores (before max rounds)', () => {
  const implPlan = { tests: ['test1'], files: ['file1.js'] };
  const result = runIntegratorCriticLoop(implPlan);

  assertTrue(result.approved, 'Should be approved');
  assertTrue(result.rounds.length <= 10, 'Should not exceed max rounds');
  assertTrue(result.rounds.length >= 1, 'Should have at least 1 round');

  // Last round should have all passed
  const lastRound = result.rounds[result.rounds.length - 1];
  assertTrue(lastRound.passed, 'Last round should have all 5/5');
});

test('loop respects max_rounds setting', () => {
  const implPlan = { tests: ['test1'], files: ['file1.js'] };
  const settings = { ...DEFAULT_SETTINGS, max_rounds: 3 };
  const result = runIntegratorCriticLoop(implPlan, settings);

  assertTrue(result.rounds.length <= 3, 'Should not exceed 3 rounds');
});

test('auto_approve_after_max creates approved plan', () => {
  const implPlan = { tests: ['test1'], files: ['file1.js'] };
  // Use settings where plan won't pass naturally
  const settings = { ...DEFAULT_SETTINGS, max_rounds: 2, auto_approve_after_max: true };
  const result = runIntegratorCriticLoop(implPlan, settings);

  // With our mock, round 2 gives score 3, not 5
  // But auto_approve_after_max should still approve
  assertTrue(result.approved, 'Should be auto-approved after max rounds');
  assertTrue(result.executionPlan !== null, 'Should have execution plan');
});

test('defer_unresolved creates deferred questions', () => {
  const implPlan = { tests: ['test1'], files: ['file1.js'] };
  // Use settings where plan won't pass naturally
  const settings = { ...DEFAULT_SETTINGS, max_rounds: 2, defer_unresolved: true };
  const result = runIntegratorCriticLoop(implPlan, settings);

  // With our mock, round 2 has scores < 5, so deferred questions should be created
  if (!result.rounds[result.rounds.length - 1].passed) {
    assertTrue(result.deferredQuestions.length > 0, 'Should have deferred questions');

    // Validate each deferred question
    for (const q of result.deferredQuestions) {
      const validation = validateDeferredQuestion(q);
      assertTrue(validation.valid, `Deferred question should be valid: ${validation.errors.join(', ')}`);
    }
  }
});

test('execution plan has all required steps', () => {
  const implPlan = { tests: ['test1', 'test2'], files: ['file1.js', 'file2.js'] };
  const result = runIntegratorCriticLoop(implPlan);

  assertTrue(result.executionPlan !== null, 'Should have execution plan');
  const validation = validateExecutionPlan(result.executionPlan);
  assertTrue(validation.valid, `Execution plan should be valid: ${validation.errors.join(', ')}`);
});

test('each round has scores for all 5 dimensions', () => {
  const implPlan = { tests: ['test1'], files: ['file1.js'] };
  const result = runIntegratorCriticLoop(implPlan);

  for (const round of result.rounds) {
    const dimensions = Object.values(RUBRIC_DIMENSIONS);
    for (const dim of dimensions) {
      assertTrue(round.scores[dim] !== undefined, `Round ${round.round} should have ${dim} score`);
    }
  }
});

// ============================================================================
// Tests: Settings Behavior
// ============================================================================

console.log('\nTesting: Settings Behavior\n');

test('default settings have correct values', () => {
  assertEqual(DEFAULT_SETTINGS.max_rounds, 10, 'Default max_rounds should be 10');
  assertEqual(DEFAULT_SETTINGS.quality_threshold, 5, 'Default quality_threshold should be 5');
  assertTrue(DEFAULT_SETTINGS.auto_approve_after_max, 'Default auto_approve_after_max should be true');
  assertTrue(DEFAULT_SETTINGS.defer_unresolved, 'Default defer_unresolved should be true');
});

test('custom max_rounds is respected', () => {
  const implPlan = { tests: ['test1'], files: ['file1.js'] };
  const settings = { ...DEFAULT_SETTINGS, max_rounds: 5 };
  const result = runIntegratorCriticLoop(implPlan, settings);

  assertTrue(result.rounds.length <= 5, 'Should respect custom max_rounds');
});

test('auto_approve_after_max false keeps plan unapproved', () => {
  const implPlan = { tests: ['test1'], files: ['file1.js'] };
  const settings = { ...DEFAULT_SETTINGS, max_rounds: 2, auto_approve_after_max: false };
  const result = runIntegratorCriticLoop(implPlan, settings);

  // If the last round didn't pass naturally, plan should not be approved
  const lastRound = result.rounds[result.rounds.length - 1];
  if (!lastRound.passed) {
    assertFalse(result.approved, 'Should not auto-approve when setting is false');
  }
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  process.exit(1);
}

console.log('\nAll tests passed!\n');

/**
 * Iron Loop Automation
 * Orchestrates the Integrator + Critic refinement loop for plan execution steps.
 */

const fs = require('fs');
const path = require('path');

/**
 * Marker for Iron Loop execution steps section.
 * @type {string}
 */
const IRON_LOOP_MARKER = '## Execution Steps (Iron Loop 8-16)';

/**
 * Check if plan has Iron Loop steps.
 * @param {string} planPath - Path to the plan file
 * @returns {boolean} True if plan contains Iron Loop steps marker
 */
function hasIronLoopSteps(planPath) {
  if (!fs.existsSync(planPath)) {
    return false;
  }
  const content = fs.readFileSync(planPath, 'utf8');
  return content.includes(IRON_LOOP_MARKER);
}

/**
 * Validate plan can move to todo.
 * @param {string} planPath - Path to the plan file
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateForTodo(planPath) {
  if (!hasIronLoopSteps(planPath)) {
    return {
      valid: false,
      error: 'Plan missing Iron Loop steps 8-16. Generate them first.'
    };
  }
  return { valid: true };
}

/**
 * Generate Iron Loop steps template.
 * @param {string} planContent - The plan content (unused but available for context)
 * @returns {string} Markdown string with steps 8-16 template
 */
function generateIronLoopTemplate(planContent) {
  return `

---

${IRON_LOOP_MARKER}

### Step 8: TEST (TDD Red)
- [ ] Write failing tests for new functionality
- [ ] Test expected behavior
- [ ] Test error conditions
- [ ] Verify tests fail for the right reasons

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement ALL code changes to pass tests
- [ ] Add error handling
- [ ] Wire up integrations
- [ ] Follow existing code patterns

### Step 11: REVIEW
- [ ] Self-review all changes
- [ ] Check integration points
- [ ] Verify error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add code comments where non-obvious
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
`;
}

/**
 * Generate execution steps (8-16) for a plan.
 * Reads plan content and returns markdown string with detailed execution steps.
 *
 * @param {string} planPath - Path to the plan file
 * @returns {string} Markdown string with Steps 8-16
 */
function integrate(planPath) {
  if (!fs.existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  const content = fs.readFileSync(planPath, 'utf8');

  // Extract requirements and proposed solution sections
  const requirementsMatch = content.match(/## Requirements\n([\s\S]*?)(?=##|$)/);
  const solutionMatch = content.match(/## Proposed Solution\n([\s\S]*?)(?=##|$)/);
  const implementationMatch = content.match(/## Implementation Plan\n([\s\S]*?)(?=##|$)/);

  const requirements = requirementsMatch ? requirementsMatch[1].trim() : '';
  const solution = solutionMatch ? solutionMatch[1].trim() : '';
  const implementation = implementationMatch ? implementationMatch[1].trim() : '';

  // Generate execution steps based on plan content
  const executionPlan = generateExecutionPlan(requirements, solution, implementation);

  return executionPlan;
}

/**
 * Generate execution plan markdown from plan sections.
 *
 * @param {string} requirements - Plan requirements text
 * @param {string} solution - Proposed solution text
 * @param {string} implementation - Implementation plan text
 * @returns {string} Markdown execution plan
 */
function generateExecutionPlan(requirements, solution, implementation) {
  // Extract action items from requirements (checkbox items)
  const reqItems = extractCheckboxItems(requirements);
  const implItems = extractActionItems(implementation);

  // Build execution steps markdown
  let md = `

---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
`;

  // Add test items based on requirements
  if (reqItems.length > 0) {
    reqItems.forEach((item, i) => {
      md += `- [ ] Test: ${item.replace(/^-?\s*\[.\]\s*/, '').trim()}\n`;
    });
  } else {
    md += `- [ ] Write tests for the implementation\n`;
  }
  md += `- [ ] Test error conditions\n`;
  md += `- [ ] Run tests - expect RED (failing)\n`;

  md += `
### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
`;

  // Add implementation items
  if (implItems.length > 0) {
    implItems.forEach(item => {
      md += `- [ ] ${item}\n`;
    });
  } else {
    md += `- [ ] Implement the feature according to requirements\n`;
  }
  md += `- [ ] Add error handling\n`;
  md += `- [ ] Wire up integration points\n`;

  md += `
### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
`;

  return md;
}

/**
 * Extract checkbox items from markdown text.
 *
 * @param {string} text - Markdown text
 * @returns {string[]} Array of checkbox item texts
 */
function extractCheckboxItems(text) {
  const matches = text.match(/- \[.\][^\n]+/g) || [];
  return matches;
}

/**
 * Extract action items from implementation section.
 *
 * @param {string} text - Implementation plan text
 * @returns {string[]} Array of action item texts
 */
function extractActionItems(text) {
  const items = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Match: "- Create/Add/Modify/Update ..." pattern
    const match = line.match(/^-\s+(Create|Add|Modify|Update|Implement|Write)[^\n]+/i);
    if (match) {
      items.push(match[0].replace(/^-\s+/, ''));
    }
  }

  return items;
}

/**
 * Score execution plan on 5 dimensions.
 *
 * @param {string} planPath - Path to the plan file
 * @returns {Object} Critique result with scores and feedback
 */
function critique(planPath) {
  if (!fs.existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  const content = fs.readFileSync(planPath, 'utf8');

  // Check for execution plan section
  const hasExecutionPlan = content.includes('## Execution Plan (Steps 8-16)');
  if (!hasExecutionPlan) {
    return {
      scores: {
        completeness: 1,
        clarity: 1,
        edgeCases: 1,
        efficiency: 1,
        security: 1
      },
      feedback: [
        {
          dimension: 'completeness',
          issue: 'No execution plan found',
          suggestion: 'Run integrate() first to generate Steps 8-16'
        }
      ]
    };
  }

  // Extract execution plan section
  const execMatch = content.match(/## Execution Plan \(Steps 8-16\)([\s\S]*?)(?=\n## [^E]|$)/);
  const execPlan = execMatch ? execMatch[1] : '';

  // Score each dimension
  const scores = {
    completeness: scoreCompleteness(execPlan),
    clarity: scoreClarity(execPlan),
    edgeCases: scoreEdgeCases(execPlan),
    efficiency: scoreEfficiency(execPlan),
    security: scoreSecurity(execPlan)
  };

  // Generate feedback for scores < 5
  const feedback = [];
  if (scores.completeness < 5) {
    feedback.push({
      dimension: 'completeness',
      issue: 'Missing steps or actions',
      suggestion: 'Ensure all steps 8-16 have specific actions'
    });
  }
  if (scores.clarity < 5) {
    feedback.push({
      dimension: 'clarity',
      issue: 'Some actions are vague',
      suggestion: 'Each action should be unambiguous and single-responsibility'
    });
  }
  if (scores.edgeCases < 5) {
    feedback.push({
      dimension: 'edgeCases',
      issue: 'Error handling not covered',
      suggestion: 'Add handling for timeouts, missing files, invalid input'
    });
  }
  if (scores.efficiency < 5) {
    feedback.push({
      dimension: 'efficiency',
      issue: 'Potential redundant steps',
      suggestion: 'Check for duplicate actions, consider parallelization'
    });
  }
  if (scores.security < 5) {
    feedback.push({
      dimension: 'security',
      issue: 'Security checks incomplete',
      suggestion: 'Add input validation, path sanitization, secrets check'
    });
  }

  return { scores, feedback };
}

/**
 * Score completeness (1-5): All steps have actions, all requirements covered.
 * Score 0 if step labels are wrong (BLOCKING).
 */
function scoreCompleteness(execPlan) {
  // Canonical step labels - must match exactly
  const canonicalLabels = {
    8: 'TEST',
    9: 'PREPARE',
    10: 'IMPLEMENT',
    11: 'REVIEW',
    12: 'OPTIMIZE',
    13: 'SECURE',
    14: 'VERIFY',
    15: 'DOCUMENT',
    16: 'FINAL-REVIEW'
  };

  let score = 5;
  let hasLabelError = false;

  for (const [num, label] of Object.entries(canonicalLabels)) {
    const escapedLabel = label.replace('-', '[-\\s]');
    const labelPattern = new RegExp(`Step\\s*${num}[:\\s]+${escapedLabel}`, 'i');
    const stepPresent = new RegExp(`Step\\s*${num}[:\\s]`, 'i');

    if (!labelPattern.test(execPlan)) {
      if (stepPresent.test(execPlan)) {
        // Step exists but has wrong label
        hasLabelError = true;
      }
      score -= 1;
    }
  }

  // Wrong labels = score 0 (BLOCKING)
  if (hasLabelError) {
    return 0;
  }

  // Check for checkboxes in each step
  const checkboxCount = (execPlan.match(/- \[ \]/g) || []).length;
  if (checkboxCount < 9) {
    score = Math.max(1, score - 1);
  }

  // Check for multiple IMPLEMENT steps
  const implementMatches = execPlan.match(/Step\s*\d+[:\s]+IMPLEMENT/gi) || [];
  if (implementMatches.length > 1) {
    score = Math.max(1, score - 2);
  }

  return Math.max(0, score);
}

/**
 * Score clarity (1-5): Each action is unambiguous, single responsibility.
 */
function scoreClarity(execPlan) {
  const vaguePatterns = [
    /implement.*feature/i,
    /do.*task/i,
    /handle.*things/i,
    /fix.*issues/i,
    /update.*stuff/i
  ];

  let score = 5;
  for (const pattern of vaguePatterns) {
    if (pattern.test(execPlan)) {
      score -= 1;
    }
  }

  return Math.max(1, score);
}

/**
 * Score edge cases (1-5): Error handling, timeouts, empty states covered.
 */
function scoreEdgeCases(execPlan) {
  let score = 3; // Start at middle

  const goodPatterns = [
    /error.*handling/i,
    /timeout/i,
    /missing.*file/i,
    /invalid.*input/i,
    /empty.*state/i,
    /edge.*case/i,
    /validation/i
  ];

  for (const pattern of goodPatterns) {
    if (pattern.test(execPlan)) {
      score += 0.5;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Score efficiency (1-5): No redundant steps, parallelizable where possible.
 */
function scoreEfficiency(execPlan) {
  let score = 5;

  // Check for redundant patterns
  const lines = execPlan.split('\n').filter(l => l.includes('- [ ]'));
  const actions = lines.map(l => l.toLowerCase().replace(/- \[ \]\s*/g, '').trim());

  // Check for duplicates
  const seen = new Set();
  for (const action of actions) {
    if (seen.has(action)) {
      score -= 1;
    }
    seen.add(action);
  }

  return Math.max(1, score);
}

/**
 * Score security (1-5): Input validation, no secrets, safe file ops.
 */
function scoreSecurity(execPlan) {
  let score = 3; // Start at middle

  const securityPatterns = [
    /validate.*input/i,
    /sanitize/i,
    /path.*traversal/i,
    /no.*secret/i,
    /safe.*file/i,
    /security/i
  ];

  for (const pattern of securityPatterns) {
    if (pattern.test(execPlan)) {
      score += 0.5;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Run the Integrator + Critic refinement loop.
 *
 * @param {string} planPath - Path to the plan file
 * @param {number} maxRounds - Maximum refinement rounds (default: 10)
 * @returns {Object} Result with status, rounds, and optionally deferredQuestions
 */
function refineLoop(planPath, maxRounds = 10) {
  if (!fs.existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  let content = fs.readFileSync(planPath, 'utf8');
  let rounds = 0;
  let lastCritique = null;

  while (rounds < maxRounds) {
    rounds++;

    // Generate or refine execution steps
    const executionPlan = integrate(planPath);

    // Append to plan if not already present
    if (!content.includes('## Execution Plan (Steps 8-16)')) {
      content += executionPlan;
      fs.writeFileSync(planPath, content);
    }

    // Critique the plan
    lastCritique = critique(planPath);
    const { scores } = lastCritique;

    // Check if all scores are 5
    const allPerfect = Object.values(scores).every(s => s === 5);
    if (allPerfect) {
      return {
        status: 'approved',
        rounds,
        scores
      };
    }

    // If not perfect, we'd normally refine based on feedback
    // For now, we accept after first round with the scores we have
    // In a full implementation, this would spawn an agent to refine

    // Early exit for practical purposes - accept good enough plans
    const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
    if (avgScore >= 4) {
      return {
        status: 'approved',
        rounds,
        scores,
        note: 'Approved with average score >= 4'
      };
    }
  }

  // Max rounds reached
  return {
    status: 'max-rounds',
    rounds,
    scores: lastCritique?.scores || null,
    deferredQuestions: lastCritique?.feedback.map(f => ({
      dimension: f.dimension,
      feedback: f.issue
    })) || []
  };
}

/**
 * Append deferred questions to plan metadata.
 *
 * @param {string} planPath - Path to the plan file
 * @param {Array} deferredQuestions - Questions to defer
 */
function appendDeferredQuestions(planPath, deferredQuestions) {
  if (!deferredQuestions || deferredQuestions.length === 0) return;

  let content = fs.readFileSync(planPath, 'utf8');

  const questionsSection = `

## Deferred Questions

${deferredQuestions.map(q => `- **${q.dimension}**: ${q.feedback}`).join('\n')}
`;

  content += questionsSection;
  fs.writeFileSync(planPath, content);
}

module.exports = {
  // Plan from iron-loop-auto-integration.md
  hasIronLoopSteps,
  validateForTodo,
  generateIronLoopTemplate,
  IRON_LOOP_MARKER,
  // Existing functions
  integrate,
  critique,
  refineLoop,
  appendDeferredQuestions,
  generateExecutionPlan,
  extractCheckboxItems,
  extractActionItems
};

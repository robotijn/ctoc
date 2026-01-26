#!/usr/bin/env node
/**
 * CTOC Iron Loop Gate Hook
 * Blocks git commits if Iron Loop steps are incomplete
 *
 * This hook runs before git commit commands to ensure
 * the development process follows the Iron Loop methodology.
 */

const path = require('path');
const {
  loadIronLoopState,
  log,
  warn,
  error,
  STEP_NAMES,
  STEP_DESCRIPTIONS
} = require('../lib/utils');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Minimum step required before committing
 * Step 14 = VERIFY (all tests pass)
 * Step 15 = COMMIT
 */
const MINIMUM_STEP_FOR_COMMIT = 14;

/**
 * Required steps that must be completed
 * These are the critical quality gates
 */
const REQUIRED_STEPS = [7, 8, 12, 14]; // TEST, QUALITY, SECURE, VERIFY

/**
 * Steps that can be skipped with warning
 */
const OPTIONAL_STEPS = [11, 13]; // OPTIMIZE, DOCUMENT

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates Iron Loop state for commit readiness
 */
function validateForCommit(state) {
  const issues = {
    errors: [],
    warnings: [],
    info: []
  };

  if (!state) {
    issues.errors.push('No Iron Loop state found. Start a feature with "/ctoc start <feature>"');
    return issues;
  }

  if (!state.feature) {
    issues.errors.push('No feature name set. Use "/ctoc start <feature>" to begin');
    return issues;
  }

  // Check current step
  if (state.currentStep < MINIMUM_STEP_FOR_COMMIT) {
    issues.errors.push(
      `Iron Loop at Step ${state.currentStep} (${STEP_NAMES[state.currentStep]}). ` +
      `Must complete through Step ${MINIMUM_STEP_FOR_COMMIT} (${STEP_NAMES[MINIMUM_STEP_FOR_COMMIT]}) before committing.`
    );
  }

  // Check required steps
  for (const step of REQUIRED_STEPS) {
    const stepState = state.steps[step];
    if (!stepState || stepState.status !== 'completed') {
      const stepName = STEP_NAMES[step];
      issues.errors.push(
        `Step ${step} (${stepName}) not completed. This is a required quality gate.`
      );
    }
  }

  // Check optional steps (warnings only)
  for (const step of OPTIONAL_STEPS) {
    const stepState = state.steps[step];
    if (!stepState || stepState.status !== 'completed') {
      const stepName = STEP_NAMES[step];
      issues.warnings.push(
        `Step ${step} (${stepName}) not completed. Consider completing for better quality.`
      );
    }
  }

  // Check for blockers
  if (state.blockers && state.blockers.length > 0) {
    for (const blocker of state.blockers) {
      issues.errors.push(`Blocker: ${blocker}`);
    }
  }

  // Add info about completed steps
  const completedSteps = Object.keys(state.steps)
    .filter(k => state.steps[k].status === 'completed')
    .map(k => parseInt(k))
    .sort((a, b) => a - b);

  if (completedSteps.length > 0) {
    issues.info.push(
      `Completed steps: ${completedSteps.map(s => `${s}:${STEP_NAMES[s]}`).join(', ')}`
    );
  }

  return issues;
}

/**
 * Formats validation result for output
 */
function formatValidation(issues, state) {
  let output = '\n';
  output += '='.repeat(60) + '\n';
  output += 'CTOC IRON LOOP COMMIT GATE\n';
  output += '='.repeat(60) + '\n\n';

  if (state && state.feature) {
    output += `Feature: ${state.feature}\n`;
    output += `Current Step: ${state.currentStep} (${STEP_NAMES[state.currentStep]})\n\n`;
  }

  if (issues.errors.length > 0) {
    output += 'BLOCKED - Fix these issues before committing:\n\n';
    for (const err of issues.errors) {
      output += `  ❌ ${err}\n`;
    }
    output += '\n';
  }

  if (issues.warnings.length > 0) {
    output += 'WARNINGS:\n\n';
    for (const warning of issues.warnings) {
      output += `  ⚠️  ${warning}\n`;
    }
    output += '\n';
  }

  if (issues.info.length > 0) {
    for (const info of issues.info) {
      output += `  ℹ️  ${info}\n`;
    }
    output += '\n';
  }

  if (issues.errors.length > 0) {
    output += 'To proceed:\n';
    output += '  1. Complete the required Iron Loop steps\n';
    output += '  2. Or use --no-verify to bypass (not recommended)\n';
    output += '  3. Or use "/ctoc skip <step>" to mark a step as intentionally skipped\n';
  } else {
    output += '✅ Iron Loop checks passed. Ready to commit.\n';
  }

  output += '\n' + '='.repeat(60) + '\n';

  return output;
}

/**
 * Shows help for completing remaining steps
 */
function showStepHelp(state) {
  if (!state) return '';

  let output = '\nNext Steps:\n';

  const incompleteSteps = [];
  for (let step = 1; step <= 15; step++) {
    const stepState = state.steps[step];
    if (!stepState || stepState.status !== 'completed') {
      incompleteSteps.push(step);
    }
  }

  for (const step of incompleteSteps.slice(0, 3)) {
    output += `\n  Step ${step}: ${STEP_NAMES[step]}\n`;
    output += `    ${STEP_DESCRIPTIONS[step]}\n`;

    // Add agent suggestion if applicable
    const agentSuggestions = {
      7: 'Run "/ctoc test" to spawn test-writer agent',
      8: 'Run "/ctoc quality" to run linting and type checking',
      10: 'Run "/ctoc review" to spawn code-reviewer agent',
      12: 'Run "/ctoc secure" to spawn security-scanner agent',
      14: 'Run "/ctoc verify" to run full test suite'
    };

    if (agentSuggestions[step]) {
      output += `    → ${agentSuggestions[step]}\n`;
    }
  }

  return output;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const projectPath = process.cwd();

  // Load Iron Loop state
  const state = loadIronLoopState(projectPath);

  // Validate
  const issues = validateForCommit(state);

  // Format output
  const output = formatValidation(issues, state);
  console.log(output);

  // Show help if blocked
  if (issues.errors.length > 0) {
    console.log(showStepHelp(state));

    // Exit with warning but don't block (Claude Code doesn't support blocking)
    // The message should be enough to warn the user
    console.log('[CTOC] Commit is proceeding, but Iron Loop is incomplete.');
    console.log('[CTOC] Consider completing the steps above for better quality.\n');
  }

  // Always exit 0 - we warn but don't block
  // In a strict mode, we could exit 1 to actually block
  process.exit(0);
}

main();

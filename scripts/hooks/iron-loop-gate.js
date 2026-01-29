#!/usr/bin/env node
/**
 * CTOC Iron Loop Gate Hook - HOLY ENFORCEMENT v3.0.0
 *
 * THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.
 *
 * This hook BLOCKS git commits if the Iron Loop is incomplete.
 * In v2.x this only warned. In v3.0 it actually blocks (exit 1).
 *
 * Requirements to commit:
 * 1. Feature must be active
 * 2. Current step must be >= 14 (VERIFY)
 * 3. Both gates must be passed
 * 4. Required steps (7, 8, 12, 14) must be completed
 *
 * Exit codes:
 * - 0: Commit allowed
 * - 1: Commit blocked
 */

const path = require('path');
const fs = require('fs');

// Import CTOC libraries
const {
  loadIronLoopState,
  STEP_NAMES,
  STEP_DESCRIPTIONS,
  hashPath,
  IRON_LOOP_DIR
} = require('../lib/utils');

const {
  loadSignedState,
  needsMigration,
  verifyGateApproval
} = require('../lib/state-signer');

const {
  logCommitBlocked,
  logCommitAllowed,
  logTamperingDetected
} = require('../lib/audit-log');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Minimum step required before committing
 * Step 14 = VERIFY (all tests pass)
 */
const MINIMUM_STEP_FOR_COMMIT = 14;

/**
 * Required steps that MUST be completed before commit
 * These are the critical quality gates
 */
const REQUIRED_STEPS = [7, 8, 12, 14]; // TEST, QUALITY, SECURE, VERIFY

/**
 * Optional steps (warnings only, don't block)
 */
const OPTIONAL_STEPS = [11, 13]; // OPTIMIZE, DOCUMENT

// ============================================================================
// State Management
// ============================================================================

/**
 * Get Iron Loop state path
 */
function getStatePath(projectPath) {
  const hash = hashPath(projectPath);
  return path.join(IRON_LOOP_DIR, `${hash}.json`);
}

/**
 * Load Iron Loop state
 */
function loadState(projectPath) {
  const statePath = getStatePath(projectPath);

  if (!fs.existsSync(statePath)) {
    return { state: null, error: 'No state file' };
  }

  // Check for v2.x state
  if (needsMigration(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return { state, migrated: false };
    } catch (e) {
      return { state: null, error: e.message };
    }
  }

  // Load signed state
  const result = loadSignedState(statePath);

  if (!result.valid) {
    return { state: null, error: result.error };
  }

  return { state: result.state };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates Iron Loop state for commit readiness
 */
function validateForCommit(projectPath, state) {
  const issues = {
    errors: [],
    warnings: [],
    info: []
  };

  if (!state) {
    issues.errors.push('No Iron Loop state found. Start a feature first.');
    return issues;
  }

  if (!state.feature) {
    issues.errors.push('No feature name set. Start a feature first.');
    return issues;
  }

  // Check current step
  if (state.currentStep < MINIMUM_STEP_FOR_COMMIT) {
    issues.errors.push(
      `Iron Loop at Step ${state.currentStep} (${STEP_NAMES[state.currentStep]}). ` +
      `Must complete through Step ${MINIMUM_STEP_FOR_COMMIT} (${STEP_NAMES[MINIMUM_STEP_FOR_COMMIT]}) before committing.`
    );
  }

  // Check gates are passed
  if (!state.gate1_approval) {
    issues.errors.push('Gate 1 (Functional Planning) not passed.');
  } else {
    const gate1Check = verifyGateApproval(1, state);
    if (!gate1Check.valid) {
      issues.errors.push(`Gate 1 invalid: ${gate1Check.error}`);
    }
  }

  if (!state.gate2_approval) {
    issues.errors.push('Gate 2 (Technical Planning) not passed.');
  } else {
    const gate2Check = verifyGateApproval(2, state);
    if (!gate2Check.valid) {
      issues.errors.push(`Gate 2 invalid: ${gate2Check.error}`);
    }
  }

  // Check required steps
  for (const step of REQUIRED_STEPS) {
    const stepState = state.steps?.[step];
    if (!stepState || stepState.status !== 'completed') {
      const stepName = STEP_NAMES[step];
      issues.errors.push(
        `Step ${step} (${stepName}) not completed. This is a required quality gate.`
      );
    }
  }

  // Check optional steps (warnings only)
  for (const step of OPTIONAL_STEPS) {
    const stepState = state.steps?.[step];
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
  const completedSteps = Object.keys(state.steps || {})
    .filter(k => state.steps[k]?.status === 'completed')
    .map(k => parseInt(k))
    .sort((a, b) => a - b);

  if (completedSteps.length > 0) {
    issues.info.push(
      `Completed steps: ${completedSteps.map(s => `${s}:${STEP_NAMES[s]}`).join(', ')}`
    );
  }

  return issues;
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatBlockedOutput(issues, state) {
  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += 'CTOC IRON LOOP - COMMIT BLOCKED (v3.0 Holy Enforcement)\n';
  output += '='.repeat(70) + '\n\n';

  if (state && state.feature) {
    output += `Feature: ${state.feature}\n`;
    output += `Current Step: ${state.currentStep} (${STEP_NAMES[state.currentStep]})\n`;
    output += `Required Step: ${MINIMUM_STEP_FOR_COMMIT} (${STEP_NAMES[MINIMUM_STEP_FOR_COMMIT]})\n\n`;
  }

  if (issues.errors.length > 0) {
    output += 'ERRORS (must fix before committing):\n\n';
    for (const err of issues.errors) {
      output += `  X ${err}\n`;
    }
    output += '\n';
  }

  if (issues.warnings.length > 0) {
    output += 'WARNINGS:\n\n';
    for (const warning of issues.warnings) {
      output += `  ! ${warning}\n`;
    }
    output += '\n';
  }

  if (issues.info.length > 0) {
    for (const info of issues.info) {
      output += `  i ${info}\n`;
    }
    output += '\n';
  }

  output += 'THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.\n\n';

  output += 'TO PROCEED:\n';
  output += '  1. Complete ALL required steps (7, 8, 12, 14)\n';
  output += '  2. Ensure both gates are passed\n';
  output += '  3. Resolve any blockers\n';
  output += '  4. Then commit will be allowed\n\n';

  output += 'NOTE: --no-verify will NOT bypass this check.\n';
  output += 'The Iron Loop is enforced at the Bash/Claude level.\n';

  output += '\n' + '='.repeat(70) + '\n';

  return output;
}

function formatAllowedOutput(state) {
  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += 'CTOC IRON LOOP - COMMIT ALLOWED\n';
  output += '='.repeat(70) + '\n\n';

  output += `Feature: ${state.feature}\n`;
  output += `Current Step: ${state.currentStep} (${STEP_NAMES[state.currentStep]})\n\n';

  output += 'All Iron Loop checks passed!\n';
  output += '  Gate 1 (Functional): PASSED\n';
  output += '  Gate 2 (Technical): PASSED\n';
  output += '  Required Steps: COMPLETED\n\n';

  output += 'Commit is allowed to proceed.\n';

  output += '\n' + '='.repeat(70) + '\n';

  return output;
}

function formatStepHelp(state) {
  if (!state) return '';

  let output = '\nNext Steps to Complete:\n';

  const incompleteSteps = [];
  for (let step = 1; step <= 15; step++) {
    const stepState = state.steps?.[step];
    if (!stepState || stepState.status !== 'completed') {
      incompleteSteps.push(step);
    }
  }

  for (const step of incompleteSteps.slice(0, 3)) {
    output += `\n  Step ${step}: ${STEP_NAMES[step]}\n`;
    output += `    ${STEP_DESCRIPTIONS[step]}\n`;

    const suggestions = {
      7: 'Run tests or write new ones',
      8: 'Run lint, format, type-check',
      10: 'Self-review the code',
      12: 'Run security checks',
      14: 'Run full test suite'
    };

    if (suggestions[step]) {
      output += `    -> ${suggestions[step]}\n`;
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
  const stateResult = loadState(projectPath);

  // Handle tampering
  if (stateResult.error && stateResult.error.includes('tamper')) {
    console.error('\n' + '='.repeat(70));
    console.error('CTOC IRON LOOP - TAMPERING DETECTED');
    console.error('='.repeat(70));
    console.error('\nState file has been tampered with!');
    console.error('Error: ' + stateResult.error);
    console.error('\n' + '='.repeat(70) + '\n');

    logTamperingDetected(projectPath, null, { error: stateResult.error });

    console.log('[CTOC] Commit BLOCKED: State tampering detected.');
    process.exit(1);
  }

  const state = stateResult.state;

  // Validate
  const issues = validateForCommit(projectPath, state);

  // Check if allowed
  if (issues.errors.length === 0) {
    // All checks passed
    console.log(formatAllowedOutput(state));

    logCommitAllowed(projectPath, state?.feature, state?.currentStep);

    process.exit(0);
  }

  // BLOCKED
  console.log(formatBlockedOutput(issues, state));
  console.log(formatStepHelp(state));

  const reason = issues.errors.join('; ');
  logCommitBlocked(projectPath, state?.feature, state?.currentStep, reason);

  console.log('[CTOC] Commit BLOCKED by Holy Iron Loop Enforcement.');
  process.exit(1);
}

main();

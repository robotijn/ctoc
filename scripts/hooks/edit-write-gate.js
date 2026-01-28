#!/usr/bin/env node
/**
 * CTOC Edit/Write Gate Hook
 * Checks Iron Loop state before Edit/Write operations
 *
 * This hook runs before Edit and Write tool calls to ensure
 * planning is complete before implementation begins.
 * It prints a warning for Claude to see if step < 7.
 */

const {
  loadIronLoopState,
  STEP_NAMES
} = require('../lib/utils');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Minimum step required before Edit/Write operations
 * Step 7 = TEST (start of implementation phase)
 */
const MINIMUM_STEP_FOR_IMPLEMENTATION = 7;

// ============================================================================
// Main
// ============================================================================

async function main() {
  const projectPath = process.cwd();

  // Load Iron Loop state
  const state = loadIronLoopState(projectPath);

  // If no state or no feature, allow the operation (might be a new project setup)
  if (!state || !state.feature) {
    process.exit(0);
  }

  const currentStep = state.currentStep || 1;
  const stepName = STEP_NAMES[currentStep] || 'Unknown';

  // Check if we're in the implementation phase (step 7+)
  if (currentStep < MINIMUM_STEP_FOR_IMPLEMENTATION) {
    // Check gate status
    const gate1Passed = state.steps[3]?.status === 'completed';
    const gate2Passed = state.steps[6]?.status === 'completed';

    console.log('');
    console.log('='.repeat(60));
    console.log('CTOC IRON LOOP - IMPLEMENTATION GATE');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Feature: ${state.feature}`);
    console.log(`Current Step: ${currentStep} (${stepName})`);
    console.log(`Gate 1 (Functional Planning): ${gate1Passed ? 'PASSED' : 'PENDING'}`);
    console.log(`Gate 2 (Technical Planning): ${gate2Passed ? 'PASSED' : 'PENDING'}`);
    console.log('');
    console.log('WARNING: Implementation phase not yet reached.');
    console.log('');
    console.log('Iron Loop requires completing planning before implementation:');
    console.log('  Steps 1-3: Functional Planning (ASSESS, ALIGN, CAPTURE)');
    console.log('  Steps 4-6: Technical Planning (PLAN, DESIGN, SPEC)');
    console.log('  Steps 7+: Implementation (TEST, QUALITY, IMPLEMENT, ...)');
    console.log('');
    console.log('OPTIONS:');
    console.log('  1. Continue planning - complete current step first');
    console.log('  2. User says "skip planning" - bypass gates');
    console.log('  3. User says "trivial fix" or "quick fix" - proceed directly');
    console.log('');
    console.log('ASK THE USER: "Planning not complete (Step ' + currentStep + '). Continue planning or skip?"');
    console.log('');
    console.log('='.repeat(60));
    console.log('');
  }

  // Always exit 0 - we warn but don't block (Claude reads the warning)
  process.exit(0);
}

main();

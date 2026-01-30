#!/usr/bin/env node
/**
 * CTOC Edit Gate Hook
 * Blocks Edit operations before Step 7 (implementation phase)
 *
 * Part of the "Holy Trinity" of enforcement
 *
 * Exit codes:
 * - 0: Operation allowed
 * - 1: Operation blocked
 */

const path = require('path');
const fs = require('fs');

const { loadState, verifyGateApproval, STEP_NAMES } = require('../lib/state-manager');
const { blocked, writeToTerminal } = require('../lib/ui');

const MINIMUM_STEP = 7;

/**
 * Files that are always allowed (whitelist)
 */
const WHITELIST = [
  '.gitignore',
  '.gitattributes',
  /^\.ctoc\//,
  /^\.local\//,
  /^plans\/.*\.md$/
];

/**
 * Check if file is whitelisted
 */
function isWhitelisted(filePath) {
  if (!filePath) return false;

  const normalized = filePath.replace(/^\.\//, '').replace(/^\//, '');

  for (const pattern of WHITELIST) {
    if (typeof pattern === 'string') {
      if (normalized === pattern || path.basename(normalized) === pattern) {
        return true;
      }
    } else if (pattern instanceof RegExp) {
      if (pattern.test(normalized)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get target file from tool input
 */
function getTargetFile() {
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';

  try {
    const parsed = JSON.parse(toolInput);
    return parsed.file_path || parsed.path || null;
  } catch {
    const match = toolInput.match(/file_path['":\s]+["']?([^"'\s,}]+)/);
    return match ? match[1] : null;
  }
}

/**
 * Main gate check
 */
async function main() {
  const projectPath = process.cwd();
  const targetFile = getTargetFile();

  // 1. Check whitelist first
  if (targetFile && isWhitelisted(targetFile)) {
    process.exit(0);
  }

  // 2. Load and verify state
  const stateResult = loadState(projectPath);

  // 3. Check for tampering
  if (stateResult.error && stateResult.error.includes('tamper')) {
    writeToTerminal('\n[CTOC] EDIT BLOCKED: State tampering detected.\n');
    writeToTerminal('State file has been modified without proper signing.\n');
    writeToTerminal('Run /ctoc start to begin a new feature.\n\n');
    process.exit(1);
  }

  const state = stateResult.state;

  // 4. No state or no feature - BLOCK
  if (!state || !state.feature) {
    writeToTerminal('\n[CTOC] EDIT BLOCKED: No feature context.\n');
    writeToTerminal('Before editing files, you must:\n');
    writeToTerminal('1. Start a feature with /ctoc start <name>\n');
    writeToTerminal('2. Complete planning (Steps 1-6)\n');
    writeToTerminal('3. Get user approval at both gates\n\n');
    process.exit(1);
  }

  const currentStep = state.currentStep || 1;

  // 5. Already in implementation phase - ALLOW
  if (currentStep >= MINIMUM_STEP) {
    process.exit(0);
  }

  // 6. Check gates
  const gate1Valid = state.gate1_approval && verifyGateApproval(1, state).valid;
  const gate2Valid = state.gate2_approval && verifyGateApproval(2, state).valid;

  if (gate1Valid && gate2Valid) {
    // Gates passed but step not advanced - allow anyway
    process.exit(0);
  }

  // 7. BLOCK - planning not complete
  const reason = `Step ${currentStep} < ${MINIMUM_STEP} - planning not complete`;

  writeToTerminal(blocked(reason, state, 'EDIT'));

  console.log(JSON.stringify({
    decision: 'block',
    reason: reason,
    currentStep: currentStep,
    requiredStep: MINIMUM_STEP,
    feature: state.feature
  }));

  process.exit(1);
}

main().catch(err => {
  console.error('[CTOC] Edit gate error:', err.message);
  process.exit(1);
});

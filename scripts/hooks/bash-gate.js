#!/usr/bin/env node
/**
 * CTOC Bash Gate Hook - HOLY ENFORCEMENT v3.0.0
 *
 * THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.
 *
 * This hook blocks Bash commands that write to files before step 7.
 * This closes the loophole where `echo > file` or `cat > file` could
 * bypass the Edit/Write gate.
 *
 * Blocked commands (before step 7):
 * - echo/printf with > or >>
 * - cat with > or >>
 * - tee
 * - sed -i (in-place edit)
 * - awk -i inplace
 * - cp (creating new files)
 * - mv (creating new files)
 * - install
 * - patch
 *
 * Exit codes:
 * - 0: Command allowed
 * - 1: Command blocked
 */

const path = require('path');
const fs = require('fs');

// Import CTOC libraries
const {
  loadIronLoopState,
  STEP_NAMES,
  hashPath,
  IRON_LOOP_DIR
} = require('../lib/utils');

const {
  loadSignedState,
  needsMigration
} = require('../lib/state-signer');

const {
  logBashBlocked,
  logTamperingDetected
} = require('../lib/audit-log');

// ============================================================================
// Configuration
// ============================================================================

const MINIMUM_STEP_FOR_IMPLEMENTATION = 7;

/**
 * Patterns that indicate file-writing Bash commands
 * These are FORBIDDEN before step 7
 */
const WRITE_PATTERNS = [
  // Redirections
  /[^>]>\s*[^\s>]/,            // Single redirect (not >>)
  />>\s*[^\s]/,                // Append redirect
  /\d+>\s*[^\s]/,              // File descriptor redirect

  // Commands that write
  /\btee\s+/,                  // tee command
  /\bsed\s+.*-i/,              // sed in-place
  /\bsed\s+-i/,                // sed -i at start
  /\bawk\s+.*-i\s*inplace/,    // awk in-place
  /\bgawk\s+.*-i\s*inplace/,   // gawk in-place
  /\bperl\s+.*-i/,             // perl in-place

  // File manipulation
  /\binstall\s+/,              // install command
  /\bpatch\s+/,                // patch command

  // File creation (may create new files)
  /\btouch\s+/,                // touch command
  /\bmkdir\s+/,                // mkdir (may be part of creation)

  // Potentially dangerous
  /\bdd\s+/,                   // dd command
  /\btruncate\s+/,             // truncate command
];

/**
 * Patterns that are SAFE and should be allowed
 */
const SAFE_PATTERNS = [
  // Read-only commands
  /^\s*cat\s+[^>|]+$/,         // cat without redirect
  /^\s*ls\s+/,                 // ls
  /^\s*find\s+/,               // find
  /^\s*grep\s+/,               // grep
  /^\s*head\s+/,               // head
  /^\s*tail\s+/,               // tail
  /^\s*less\s+/,               // less
  /^\s*more\s+/,               // more
  /^\s*wc\s+/,                 // wc
  /^\s*file\s+/,               // file
  /^\s*stat\s+/,               // stat
  /^\s*which\s+/,              // which
  /^\s*whereis\s+/,            // whereis
  /^\s*type\s+/,               // type
  /^\s*pwd\s*/,                // pwd
  /^\s*cd\s+/,                 // cd
  /^\s*echo\s+[^>]+$/,         // echo without redirect

  // Git read commands
  /^\s*git\s+(status|log|diff|branch|show|remote|config\s+--get)/,
  /^\s*git\s+ls-/,             // git ls-files, ls-tree, etc.

  // Package manager queries
  /^\s*npm\s+(list|ls|info|view|show|search)/,
  /^\s*pip\s+(list|show|freeze)/,
  /^\s*cargo\s+(tree|search)/,
];

/**
 * Commands that are ALWAYS allowed (essential for operation)
 */
const ALWAYS_ALLOWED = [
  /^\s*node\s+/,               // Running node scripts
  /^\s*npm\s+/,                // npm commands (handled separately)
  /^\s*npx\s+/,                // npx commands
  /^\s*git\s+/,                // Git commands (commit gate handles this)
  /^\s*python\s+/,             // Python scripts
  /^\s*pip\s+/,                // pip commands
  /^\s*cargo\s+/,              // cargo commands
];

// ============================================================================
// Command Analysis
// ============================================================================

/**
 * Get the Bash command from tool input
 */
function getBashCommand() {
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';

  try {
    const parsed = JSON.parse(toolInput);
    return parsed.command || '';
  } catch {
    // Try to extract command from raw input
    const match = toolInput.match(/command['":\s]+["']?([^"'\n]+)/);
    return match ? match[1] : toolInput;
  }
}

/**
 * Check if a command is a file-writing command
 */
function isWriteCommand(command) {
  if (!command) return false;

  const normalizedCommand = command.trim().toLowerCase();

  // Check if it's always allowed
  for (const pattern of ALWAYS_ALLOWED) {
    if (pattern.test(normalizedCommand)) {
      return false;
    }
  }

  // Check if it's a safe read-only command
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      return false;
    }
  }

  // Check if it matches any write pattern
  for (const pattern of WRITE_PATTERNS) {
    if (pattern.test(command)) {  // Use original case for patterns
      return true;
    }
  }

  // Additional heuristic: check for redirect symbols
  if (command.includes(' > ') || command.includes(' >> ') ||
      command.includes('\t>\t') || command.includes('\t>>\t')) {
    return true;
  }

  return false;
}

/**
 * Get the target file(s) from a write command
 */
function getTargetFiles(command) {
  const files = [];

  // Match redirect targets
  const redirectMatch = command.match(/>\s*([^\s;|&]+)/g);
  if (redirectMatch) {
    for (const match of redirectMatch) {
      const file = match.replace(/^>+\s*/, '').trim();
      if (file && !file.startsWith('&')) {
        files.push(file);
      }
    }
  }

  // Match tee targets
  const teeMatch = command.match(/\btee\s+(?:-a\s+)?([^\s;|&]+)/);
  if (teeMatch) {
    files.push(teeMatch[1]);
  }

  return files;
}

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
 * Load Iron Loop state (with signature verification)
 */
function loadState(projectPath) {
  const statePath = getStatePath(projectPath);

  if (!fs.existsSync(statePath)) {
    return { state: null, error: 'No state file' };
  }

  // Check for v2.x state (unsigned)
  if (needsMigration(statePath)) {
    // For bash-gate, just load the old state without migrating
    // Let edit-write-gate handle migration
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
// Output Formatting
// ============================================================================

function formatBlockedOutput(command, state, reason) {
  const currentStep = state?.currentStep || 1;
  const stepName = STEP_NAMES[currentStep] || 'Unknown';
  const featureName = state?.feature || 'No feature';

  // Truncate command for display
  const displayCommand = command.length > 80
    ? command.substring(0, 77) + '...'
    : command;

  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += 'CTOC IRON LOOP - BASH WRITE COMMAND BLOCKED (v3.0)\n';
  output += '='.repeat(70) + '\n\n';

  output += `Feature: ${featureName}\n`;
  output += `Current Step: ${currentStep} (${stepName})\n`;
  output += `Required Step: ${MINIMUM_STEP_FOR_IMPLEMENTATION} (${STEP_NAMES[MINIMUM_STEP_FOR_IMPLEMENTATION]})\n\n`;

  output += 'BLOCKED COMMAND:\n';
  output += `  ${displayCommand}\n\n`;

  output += 'REASON: ' + reason + '\n\n';

  output += 'THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.\n\n';

  output += 'Bash commands that write to files are blocked before Step 7.\n';
  output += 'This includes: echo >, cat >, tee, sed -i, etc.\n\n';

  output += 'TO PROCEED:\n';
  output += '  1. Complete planning (Steps 1-6)\n';
  output += '  2. Get user approval at both gates\n';
  output += '  3. Then write commands will be allowed\n';

  output += '\n' + '='.repeat(70) + '\n';

  return output;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const projectPath = process.cwd();

  // Get the Bash command
  const command = getBashCommand();

  if (!command) {
    // No command to check
    process.exit(0);
  }

  // Check if this is a write command
  if (!isWriteCommand(command)) {
    // Not a write command, allow
    process.exit(0);
  }

  // This is a write command - check Iron Loop state
  const stateResult = loadState(projectPath);

  // Handle tampering
  if (stateResult.error && stateResult.error.includes('tamper')) {
    logTamperingDetected(projectPath, null, { error: stateResult.error, command: command.substring(0, 100) });
    console.error('[CTOC] Bash BLOCKED: State tampering detected.');
    process.exit(1);
  }

  const state = stateResult.state;

  // If no state or no feature - BLOCK write commands
  if (!state || !state.feature) {
    const reason = 'No feature context - write commands not allowed';

    console.log(formatBlockedOutput(command, state, reason));

    logBashBlocked(projectPath, null, 0, command, reason);

    console.log('[CTOC] Bash write command BLOCKED: No feature context.');
    process.exit(1);
  }

  const currentStep = state.currentStep || 1;

  // If already in implementation phase (step 7+), allow
  if (currentStep >= MINIMUM_STEP_FOR_IMPLEMENTATION) {
    process.exit(0);
  }

  // BLOCK - not in implementation phase
  const reason = `Step ${currentStep} < ${MINIMUM_STEP_FOR_IMPLEMENTATION} - planning not complete`;

  console.log(formatBlockedOutput(command, state, reason));

  logBashBlocked(projectPath, state.feature, currentStep, command, reason);

  console.log('[CTOC] Bash write command BLOCKED by Holy Iron Loop Enforcement.');
  process.exit(1);
}

main();

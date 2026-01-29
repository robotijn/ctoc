#!/usr/bin/env node
/**
 * CTOC Edit/Write Gate Hook - HOLY ENFORCEMENT v3.0.0
 *
 * THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.
 *
 * This hook implements absolute enforcement of the Iron Loop methodology.
 * All loopholes from v2.x have been sealed.
 *
 * Enforcement Rules:
 * 1. NO escape phrases - removed entirely
 * 2. NO off mode - only strict and audit modes exist
 * 3. Cryptographic state verification - tampering detected
 * 4. Gate approval required - with plan hash verification
 * 5. Minimal whitelist - only truly safe files
 *
 * Exit codes:
 * - 0: Operation allowed
 * - 1: Operation blocked
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import CTOC libraries
const {
  loadIronLoopState,
  hasApprovedPlan,
  STEP_NAMES,
  PLAN_TYPES,
  hashPath,
  IRON_LOOP_DIR
} = require('../lib/utils');

const {
  verifyState,
  verifyGateApproval,
  loadSignedState,
  needsMigration,
  migrateToSigned,
  saveSignedState
} = require('../lib/state-signer');

const {
  logEditBlocked,
  logEditAllowed,
  logTamperingDetected,
  EVENT_TYPES
} = require('../lib/audit-log');

// ============================================================================
// Configuration - THE HOLY CONSTANTS
// ============================================================================

/**
 * Minimum step required before Edit/Write operations
 * Step 7 = TEST (start of implementation phase)
 * THIS IS NON-NEGOTIABLE
 */
const MINIMUM_STEP_FOR_IMPLEMENTATION = 7;

/**
 * HOLY WHITELIST - Only truly safe files
 * Much more restrictive than v2.x
 */
const HOLY_WHITELIST = [
  // Git-only files
  '.gitignore',
  '.gitattributes',

  // CTOC internal state (signed anyway)
  '.ctoc/state/**',
  '.ctoc/cache/**',
  '.ctoc/audit/**',

  // Local session state
  '.local/**',

  // Plan files ONLY in plans directory
  'plans/**/*.md'
];

/**
 * FORBIDDEN extensions that were previously whitelisted
 * These can contain executable code and are NOT safe
 */
const FORBIDDEN_EXTENSIONS = [
  '.json',  // Can be imported as code
  '.yaml',  // Can contain templates
  '.yml',   // Can contain templates
  '.toml',  // Config with code potential
  '.env'    // Environment variables - security risk
];

/**
 * VALID MODES - No more "off" mode!
 */
const VALID_MODES = {
  STRICT: 'strict',   // Block violations with exit(1)
  AUDIT: 'audit'      // Log violations but allow (for debugging only)
};

// ============================================================================
// Settings Loading - With "off" mode Protection
// ============================================================================

/**
 * Load enforcement settings with forced mode correction
 */
function loadEnforcementSettings(projectPath) {
  const settingsPath = path.join(projectPath, '.ctoc', 'settings.yaml');

  const defaults = {
    mode: VALID_MODES.STRICT,
    whitelist: HOLY_WHITELIST
    // NO escape_phrases - they are GONE
  };

  try {
    if (!fs.existsSync(settingsPath)) {
      return defaults;
    }

    const content = fs.readFileSync(settingsPath, 'utf8');
    const settings = parseYamlSettings(content);

    let mode = settings.enforcement?.mode || defaults.mode;

    // HOLY COMMANDMENT 2: NO OFF MODE
    if (mode === 'off') {
      console.error('[CTOC] HERESY DETECTED: enforcement.mode=off is FORBIDDEN in v3.0');
      console.error('[CTOC] Forcing mode to STRICT. The Iron Loop cannot be disabled.');
      mode = VALID_MODES.STRICT;
    }

    // Validate mode
    if (!Object.values(VALID_MODES).includes(mode)) {
      console.error(`[CTOC] Invalid enforcement mode: ${mode}. Forcing STRICT.`);
      mode = VALID_MODES.STRICT;
    }

    return {
      mode,
      whitelist: settings.enforcement?.whitelist || defaults.whitelist
      // NO escape_phrases
    };
  } catch (e) {
    return defaults;
  }
}

/**
 * Simple YAML parser for settings
 */
function parseYamlSettings(content) {
  const settings = {};
  const lines = content.split('\n');
  let currentSection = null;
  let inArray = false;
  let arrayKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;

    const sectionMatch = line.match(/^(\w+):(\s*)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      settings[currentSection] = {};
      inArray = false;
      continue;
    }

    const sectionKVMatch = line.match(/^  (\w+):\s*(.+)$/);
    if (sectionKVMatch && currentSection) {
      const [, key, value] = sectionKVMatch;
      settings[currentSection][key] = parseYamlValue(value);
      inArray = false;
      continue;
    }

    const keyOnlyMatch = line.match(/^  (\w+):\s*$/);
    if (keyOnlyMatch && currentSection) {
      arrayKey = keyOnlyMatch[1];
      settings[currentSection][arrayKey] = [];
      inArray = true;
      continue;
    }

    if (inArray && currentSection && arrayKey) {
      const itemMatch = line.match(/^\s+-\s*["']?([^"'#]+)["']?/);
      if (itemMatch) {
        settings[currentSection][arrayKey].push(itemMatch[1].trim());
        continue;
      }
    }
  }

  return settings;
}

function parseYamlValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

// ============================================================================
// Whitelist Matching - Holy Version
// ============================================================================

/**
 * Convert a glob pattern to a regex
 */
function globToRegex(pattern) {
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + regex + '$');
}

/**
 * Check if a file path matches the holy whitelist
 */
function isWhitelisted(filePath, whitelist) {
  if (!filePath || !whitelist) return false;

  const normalized = filePath.replace(/^\.\//, '').replace(/^\//, '');
  const ext = path.extname(normalized).toLowerCase();

  // HOLY COMMANDMENT 9: Check forbidden extensions FIRST
  if (FORBIDDEN_EXTENSIONS.includes(ext)) {
    // These are NEVER whitelisted, even if pattern matches
    return false;
  }

  for (const pattern of whitelist) {
    const regex = globToRegex(pattern);
    if (regex.test(normalized)) {
      return true;
    }
    const filename = path.basename(normalized);
    if (regex.test(filename)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the target file path from tool input
 */
function getTargetFilePath() {
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';

  try {
    const parsed = JSON.parse(toolInput);
    return parsed.file_path || parsed.path || null;
  } catch {
    const match = toolInput.match(/file_path['":\s]+([^'"\s,}]+)/);
    return match ? match[1] : null;
  }
}

// ============================================================================
// State Management - With Cryptographic Verification
// ============================================================================

/**
 * Get Iron Loop state path
 */
function getStatePath(projectPath) {
  const hash = hashPath(projectPath);
  return path.join(IRON_LOOP_DIR, `${hash}.json`);
}

/**
 * Load and verify Iron Loop state with cryptographic verification
 */
function loadAndVerifyState(projectPath) {
  const statePath = getStatePath(projectPath);

  if (!fs.existsSync(statePath)) {
    return { state: null, verified: false, error: 'No state file' };
  }

  // Check if state needs migration from v2.x
  if (needsMigration(statePath)) {
    console.log('[CTOC] Migrating state from v2.x to v3.0 signed format...');
    try {
      const oldState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      const signedState = migrateToSigned(oldState);
      saveSignedState(statePath, signedState);
      return { state: signedState, verified: true, migrated: true };
    } catch (e) {
      return { state: null, verified: false, error: `Migration failed: ${e.message}` };
    }
  }

  // Load and verify signed state
  const result = loadSignedState(statePath);

  if (!result.valid) {
    // TAMPERING DETECTED
    logTamperingDetected(projectPath, null, {
      error: result.error,
      state_path: statePath
    });
    return { state: null, verified: false, error: result.error };
  }

  return { state: result.state, verified: true };
}

// ============================================================================
// Gate Validation - With Plan Hash Verification
// ============================================================================

/**
 * Validate gates with cryptographic verification
 */
function validateGates(projectPath, state) {
  const result = {
    gate1: { passed: false, message: '' },
    gate2: { passed: false, message: '' },
    canProceed: false,
    reason: ''
  };

  // Check Gate 1: Functional Planning (steps 1-3)
  const functionalApproved = hasApprovedPlan(PLAN_TYPES.FUNCTIONAL, projectPath);
  const gate1StateApproval = state?.gate1_approval;

  if (gate1StateApproval) {
    // Verify gate approval is valid
    const verification = verifyGateApproval(1, state);
    if (verification.valid) {
      result.gate1.passed = true;
    } else {
      result.gate1.message = verification.error;
    }
  } else if (functionalApproved) {
    // Has approved plan but no gate approval in state
    result.gate1.message = 'Approved plan exists but Gate 1 not formally passed. Use AskUserQuestion to approve.';
  } else {
    result.gate1.message = 'No approved functional plan. Complete steps 1-3 first.';
  }

  // Check Gate 2: Technical Planning (steps 4-6)
  const implementationApproved = hasApprovedPlan(PLAN_TYPES.IMPLEMENTATION, projectPath);
  const gate2StateApproval = state?.gate2_approval;

  if (gate2StateApproval) {
    const verification = verifyGateApproval(2, state);
    if (verification.valid) {
      result.gate2.passed = true;
    } else {
      result.gate2.message = verification.error;
    }
  } else if (implementationApproved) {
    result.gate2.message = 'Approved plan exists but Gate 2 not formally passed. Use AskUserQuestion to approve.';
  } else {
    result.gate2.message = 'No approved implementation plan. Complete steps 4-6 first.';
  }

  // Determine if we can proceed
  result.canProceed = result.gate1.passed && result.gate2.passed;

  if (!result.canProceed) {
    if (!result.gate1.passed && !result.gate2.passed) {
      result.reason = 'Both planning gates incomplete. ' + result.gate1.message;
    } else if (!result.gate1.passed) {
      result.reason = 'Gate 1 incomplete: ' + result.gate1.message;
    } else {
      result.reason = 'Gate 2 incomplete: ' + result.gate2.message;
    }
  }

  return result;
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatBlockedOutput(state, gateResult, reason, settings) {
  const currentStep = state?.currentStep || 1;
  const stepName = STEP_NAMES[currentStep] || 'Unknown';
  const featureName = state?.feature || 'No feature';

  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += 'CTOC IRON LOOP - EDIT/WRITE BLOCKED (v3.0 Holy Enforcement)\n';
  output += '='.repeat(70) + '\n\n';

  output += `Feature: ${featureName}\n`;
  output += `Current Step: ${currentStep} (${stepName})\n`;
  output += `Required Step: ${MINIMUM_STEP_FOR_IMPLEMENTATION} (${STEP_NAMES[MINIMUM_STEP_FOR_IMPLEMENTATION]})\n`;
  output += `Enforcement Mode: ${settings.mode}\n\n`;

  output += 'GATE STATUS:\n';
  output += `  Gate 1 (Functional Planning): ${gateResult.gate1.passed ? '  PASSED' : '  PENDING'}\n`;
  if (!gateResult.gate1.passed && gateResult.gate1.message) {
    output += `    -> ${gateResult.gate1.message}\n`;
  }
  output += `  Gate 2 (Technical Planning): ${gateResult.gate2.passed ? '  PASSED' : '  PENDING'}\n`;
  if (!gateResult.gate2.passed && gateResult.gate2.message) {
    output += `    -> ${gateResult.gate2.message}\n`;
  }
  output += '\n';

  output += 'REASON: ' + reason + '\n\n';

  output += 'THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.\n\n';

  output += 'TO PROCEED:\n';
  output += '  1. Complete planning steps 1-3 (functional plan)\n';
  output += '  2. Get user approval at Gate 1\n';
  output += '  3. Complete planning steps 4-6 (technical plan)\n';
  output += '  4. Get user approval at Gate 2\n';
  output += '  5. Then and ONLY then can you Edit/Write\n\n';

  output += 'EMERGENCY BYPASS (use sparingly):\n';
  output += '  Run: ctoc emergency-bypass "reason"\n';
  output += '  This creates a permanent audit log entry.\n';

  output += '\n' + '='.repeat(70) + '\n';

  return output;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const projectPath = process.cwd();

  // Load enforcement settings (with off-mode protection)
  const settings = loadEnforcementSettings(projectPath);

  // Get target file
  const targetFile = getTargetFilePath();

  // Check whitelist FIRST (but with holy restrictions)
  if (targetFile && isWhitelisted(targetFile, settings.whitelist)) {
    process.exit(0);
  }

  // Load and verify state cryptographically
  const stateResult = loadAndVerifyState(projectPath);

  // Check for tampering
  if (stateResult.error && stateResult.error.includes('tamper')) {
    console.error('\n' + '='.repeat(70));
    console.error('CTOC IRON LOOP - TAMPERING DETECTED');
    console.error('='.repeat(70));
    console.error('\nState file has been tampered with!');
    console.error('Error: ' + stateResult.error);
    console.error('\nAction: State file will be reset. Start a new feature.');
    console.error('\n' + '='.repeat(70) + '\n');

    // Log tampering and block
    logTamperingDetected(projectPath, null, { error: stateResult.error });

    console.log('[CTOC] Edit/Write BLOCKED: State tampering detected.');
    process.exit(1);
  }

  const state = stateResult.state;

  // If no state or no feature - BLOCK (no escape phrases in v3.0!)
  if (!state || !state.feature) {
    console.error('\n' + '='.repeat(70));
    console.error('CTOC IRON LOOP - NO FEATURE CONTEXT');
    console.error('='.repeat(70));
    console.error('\nNo active feature. Before editing, you must:');
    console.error('1. Start a feature with the Iron Loop');
    console.error('2. Complete planning (Steps 1-6)');
    console.error('3. Get user approval at both gates');
    console.error('\nThere are NO escape phrases in v3.0.');
    console.error('The Iron Loop is HOLY and cannot be bypassed.');
    console.error('\n' + '='.repeat(70) + '\n');

    logEditBlocked(projectPath, null, 0, targetFile, 'No feature context');

    if (settings.mode === VALID_MODES.STRICT) {
      console.log('[CTOC] Edit/Write BLOCKED: No feature context.');
      process.exit(1);
    } else {
      console.log('[CTOC] AUDIT MODE: Would block (no feature context).');
      process.exit(0);
    }
  }

  const currentStep = state.currentStep || 1;

  // If already in implementation phase (step 7+), allow
  if (currentStep >= MINIMUM_STEP_FOR_IMPLEMENTATION) {
    logEditAllowed(projectPath, state.feature, currentStep, targetFile);
    process.exit(0);
  }

  // Validate gates
  const gateResult = validateGates(projectPath, state);

  // If gates pass, allow
  if (gateResult.canProceed) {
    logEditAllowed(projectPath, state.feature, currentStep, targetFile);
    process.exit(0);
  }

  // BLOCK - No escape phrases, no exceptions
  const reason = gateResult.reason || `Step ${currentStep} < ${MINIMUM_STEP_FOR_IMPLEMENTATION}`;

  console.log(formatBlockedOutput(state, gateResult, reason, settings));

  logEditBlocked(projectPath, state.feature, currentStep, targetFile, reason);

  if (settings.mode === VALID_MODES.STRICT) {
    console.log('[CTOC] Edit/Write BLOCKED by Holy Iron Loop Enforcement.');
    process.exit(1);
  } else {
    console.log('[CTOC] AUDIT MODE: Would block. Allowing for debugging.');
    process.exit(0);
  }
}

main();

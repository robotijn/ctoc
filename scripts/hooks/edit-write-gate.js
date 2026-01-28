#!/usr/bin/env node
/**
 * CTOC Edit/Write Gate Hook
 * Enforces Iron Loop planning gates before Edit/Write operations
 *
 * This hook runs before Edit and Write tool calls to ensure:
 * 1. Functional planning is complete (Gate 1 - steps 1-3)
 * 2. Technical planning is complete (Gate 2 - steps 4-6)
 * 3. Both gates have approved plan artifacts
 *
 * Enforcement modes:
 * - strict: Blocks edit/write with exit(1) if gates not passed
 * - soft: Warns but allows (exit 0)
 * - off: No checking
 *
 * Escape phrases bypass strict mode:
 * - "skip planning", "quick fix", "trivial fix", "hotfix", "urgent"
 */

const path = require('path');
const fs = require('fs');
const {
  loadIronLoopState,
  hasApprovedPlan,
  hasDraftPlan,
  STEP_NAMES,
  PLAN_TYPES
} = require('../lib/utils');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Minimum step required before Edit/Write operations
 * Step 7 = TEST (start of implementation phase)
 */
const MINIMUM_STEP_FOR_IMPLEMENTATION = 7;

/**
 * Default escape phrases that bypass strict enforcement
 */
const DEFAULT_ESCAPE_PHRASES = [
  'skip planning',
  'skip iron loop',
  'quick fix',
  'trivial fix',
  'trivial change',
  'hotfix',
  'urgent'
];

/**
 * Default enforcement mode
 */
const DEFAULT_ENFORCEMENT_MODE = 'strict';

// ============================================================================
// Settings Loading
// ============================================================================

/**
 * Load project settings from .ctoc/settings.yaml
 * Returns enforcement configuration
 */
function loadEnforcementSettings(projectPath) {
  const settingsPath = path.join(projectPath, '.ctoc', 'settings.yaml');

  const defaults = {
    mode: DEFAULT_ENFORCEMENT_MODE,
    escape_phrases: DEFAULT_ESCAPE_PHRASES
  };

  try {
    if (!fs.existsSync(settingsPath)) {
      return defaults;
    }

    const content = fs.readFileSync(settingsPath, 'utf8');
    const settings = parseYamlSettings(content);

    return {
      mode: settings.enforcement?.mode || defaults.mode,
      escape_phrases: settings.enforcement?.escape_phrases || defaults.escape_phrases
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
  let currentSubsection = null;
  let inArray = false;
  let arrayKey = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue;

    // Check for section (no leading spaces, key followed by colon)
    const sectionMatch = line.match(/^(\w+):(\s*)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      settings[currentSection] = {};
      currentSubsection = null;
      inArray = false;
      continue;
    }

    // Check for subsection (2 spaces, key followed by colon)
    const subsectionMatch = line.match(/^  (\w+):(\s*)$/);
    if (subsectionMatch && currentSection) {
      currentSubsection = subsectionMatch[1];
      settings[currentSection][currentSubsection] = {};
      inArray = false;
      continue;
    }

    // Check for key-value pair at section level
    const sectionKVMatch = line.match(/^  (\w+):\s*(.+)$/);
    if (sectionKVMatch && currentSection && !currentSubsection) {
      const [, key, value] = sectionKVMatch;
      settings[currentSection][key] = parseYamlValue(value);
      continue;
    }

    // Check for array start
    const arrayMatch = line.match(/^  (\w+):\s*$/);
    if (arrayMatch && currentSection) {
      arrayKey = arrayMatch[1];
      settings[currentSection][arrayKey] = [];
      inArray = true;
      continue;
    }

    // Check for array item
    if (inArray && currentSection && arrayKey) {
      const itemMatch = line.match(/^\s+-\s*["']?([^"']+)["']?$/);
      if (itemMatch) {
        settings[currentSection][arrayKey].push(itemMatch[1].trim());
        continue;
      }
    }
  }

  return settings;
}

/**
 * Parse a YAML value
 */
function parseYamlValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  // Remove quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

// ============================================================================
// Escape Phrase Detection
// ============================================================================

/**
 * Check if user input contains an escape phrase
 * Looks at the CLAUDE_TOOL_INPUT environment variable
 */
function checkEscapePhrase(escapePhrases) {
  // Claude Code passes context via environment
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';
  const userMessage = process.env.CLAUDE_USER_MESSAGE || '';
  const context = `${toolInput} ${userMessage}`.toLowerCase();

  for (const phrase of escapePhrases) {
    if (context.includes(phrase.toLowerCase())) {
      return phrase;
    }
  }

  return null;
}

// ============================================================================
// Gate Checking
// ============================================================================

/**
 * Check gate status and return validation result
 */
function validateGates(projectPath, state, settings) {
  const result = {
    gate1: {
      passed: false,
      hasApproved: false,
      hasDraft: false,
      message: ''
    },
    gate2: {
      passed: false,
      hasApproved: false,
      hasDraft: false,
      message: ''
    },
    canProceed: false,
    reason: ''
  };

  // Check Gate 1: Functional Planning (steps 1-3)
  const functionalApproved = hasApprovedPlan(PLAN_TYPES.FUNCTIONAL, projectPath);
  const functionalDraft = hasDraftPlan(PLAN_TYPES.FUNCTIONAL, projectPath);

  result.gate1.hasApproved = !!functionalApproved;
  result.gate1.hasDraft = !!functionalDraft;
  result.gate1.passed = state?.steps[3]?.status === 'completed' || result.gate1.hasApproved;

  if (!result.gate1.passed) {
    if (result.gate1.hasDraft) {
      result.gate1.message = `Draft functional plan exists at ${functionalDraft.path}. Get user approval to move to approved.`;
    } else {
      result.gate1.message = 'No functional plan found. Complete steps 1-3 (ASSESS, ALIGN, CAPTURE) first.';
    }
  }

  // Check Gate 2: Technical Planning (steps 4-6)
  const implementationApproved = hasApprovedPlan(PLAN_TYPES.IMPLEMENTATION, projectPath);
  const implementationDraft = hasDraftPlan(PLAN_TYPES.IMPLEMENTATION, projectPath);

  result.gate2.hasApproved = !!implementationApproved;
  result.gate2.hasDraft = !!implementationDraft;
  result.gate2.passed = state?.steps[6]?.status === 'completed' || result.gate2.hasApproved;

  if (!result.gate2.passed) {
    if (result.gate2.hasDraft) {
      result.gate2.message = `Draft implementation plan exists at ${implementationDraft.path}. Get user approval to move to approved.`;
    } else {
      result.gate2.message = 'No implementation plan found. Complete steps 4-6 (PLAN, DESIGN, SPEC) first.';
    }
  }

  // Determine if we can proceed
  result.canProceed = result.gate1.passed && result.gate2.passed;

  if (!result.canProceed) {
    if (!result.gate1.passed && !result.gate2.passed) {
      result.reason = 'Both planning gates incomplete. Complete functional planning (steps 1-3), then technical planning (steps 4-6).';
    } else if (!result.gate1.passed) {
      result.reason = 'Functional planning incomplete. ' + result.gate1.message;
    } else {
      result.reason = 'Technical planning incomplete. ' + result.gate2.message;
    }
  }

  return result;
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format the gate check output
 */
function formatGateOutput(state, gateResult, escapePhrase, settings) {
  const currentStep = state?.currentStep || 1;
  const stepName = STEP_NAMES[currentStep] || 'Unknown';
  const featureName = state?.feature || 'No feature';

  let output = '\n';
  output += '='.repeat(60) + '\n';
  output += 'CTOC IRON LOOP - IMPLEMENTATION GATE\n';
  output += '='.repeat(60) + '\n\n';

  output += `Feature: ${featureName}\n`;
  output += `Current Step: ${currentStep} (${stepName})\n`;
  output += `Enforcement Mode: ${settings.mode}\n\n`;

  // Gate status
  output += 'GATE STATUS:\n';
  output += `  Gate 1 (Functional Planning): ${gateResult.gate1.passed ? '✅ PASSED' : '❌ PENDING'}\n`;
  if (gateResult.gate1.hasApproved) {
    output += '    └─ Approved plan found\n';
  } else if (gateResult.gate1.hasDraft) {
    output += '    └─ Draft plan exists (needs approval)\n';
  }

  output += `  Gate 2 (Technical Planning): ${gateResult.gate2.passed ? '✅ PASSED' : '❌ PENDING'}\n`;
  if (gateResult.gate2.hasApproved) {
    output += '    └─ Approved plan found\n';
  } else if (gateResult.gate2.hasDraft) {
    output += '    └─ Draft plan exists (needs approval)\n';
  }
  output += '\n';

  if (!gateResult.canProceed) {
    if (escapePhrase) {
      output += `ESCAPE PHRASE DETECTED: "${escapePhrase}"\n`;
      output += 'Proceeding despite incomplete planning gates.\n';
      output += 'NOTE: This bypasses quality gates. Use responsibly.\n\n';
    } else {
      output += 'BLOCKED: ' + gateResult.reason + '\n\n';

      output += 'OPTIONS:\n';
      output += '  1. Complete planning - finish current planning phase\n';
      output += '  2. Say "skip planning" - bypass gates (not recommended)\n';
      output += '  3. Say "quick fix" or "trivial" - for minor changes\n\n';

      if (settings.mode === 'strict') {
        output += 'ACTION: Edit/Write operation BLOCKED.\n';
        output += 'ASK USER: "Planning not complete. Continue planning or skip?"\n';
      } else {
        output += 'WARNING: Proceeding without complete planning (soft mode).\n';
      }
    }
  } else {
    output += '✅ All planning gates passed. Proceeding with edit/write.\n';
  }

  output += '\n' + '='.repeat(60) + '\n';

  return output;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const projectPath = process.cwd();

  // Load enforcement settings
  const settings = loadEnforcementSettings(projectPath);

  // If enforcement is off, allow everything
  if (settings.mode === 'off') {
    process.exit(0);
  }

  // Load Iron Loop state
  const state = loadIronLoopState(projectPath);

  // If no state or no feature, allow the operation (might be a new project setup)
  if (!state || !state.feature) {
    process.exit(0);
  }

  const currentStep = state.currentStep || 1;

  // If already in implementation phase (step 7+), allow
  if (currentStep >= MINIMUM_STEP_FOR_IMPLEMENTATION) {
    process.exit(0);
  }

  // Check for escape phrases
  const escapePhrase = checkEscapePhrase(settings.escape_phrases);

  // Validate gates
  const gateResult = validateGates(projectPath, state, settings);

  // Output gate check result
  console.log(formatGateOutput(state, gateResult, escapePhrase, settings));

  // Determine exit code
  if (gateResult.canProceed) {
    // Gates passed, allow
    process.exit(0);
  }

  if (escapePhrase) {
    // Escape phrase detected, allow with warning
    process.exit(0);
  }

  if (settings.mode === 'soft') {
    // Soft mode - warn but allow
    process.exit(0);
  }

  // Strict mode - block the operation
  console.log('[CTOC] Edit/Write operation blocked by Iron Loop enforcement.');
  console.log('[CTOC] Complete planning or use an escape phrase to proceed.\n');
  process.exit(1);
}

main();

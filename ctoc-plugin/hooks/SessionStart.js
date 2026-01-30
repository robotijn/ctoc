#!/usr/bin/env node
/**
 * CTOC Session Start Hook
 * Initializes session, detects stack, restores state
 */

const path = require('path');
const fs = require('fs');

// Note: For Claude Code plugins, hooks are loaded relative to the plugin root
const { loadState, createState, saveState, STEP_NAMES, isInterruptedSession, formatTimeSince } = require('../lib/state-manager');
const { detectStack } = require('../lib/stack-detector');
const { dashboard, writeToTerminal } = require('../lib/ui');
const { CTOC_HOME } = require('../lib/crypto');
const { getVersion, checkForUpdates } = require('../lib/version');

/**
 * Main session start handler
 */
async function main() {
  const projectPath = process.cwd();

  // 1. Detect project stack
  const stack = detectStack(projectPath);

  // 2. Load or create Iron Loop state
  let stateResult = loadState(projectPath);
  let state = stateResult.state;

  // 3. Check for interrupted session (crash recovery)
  if (state && isInterruptedSession(state)) {
    const stepName = STEP_NAMES[state.currentStep] || 'Unknown';
    const timeSince = formatTimeSince(state.lastActivity);

    const recoveryMenu = `
+------------------------------------------------------------+
|  INTERRUPTED IMPLEMENTATION DETECTED                       |
+------------------------------------------------------------+
|  Feature: ${(state.feature || 'Unknown').slice(0, 45).padEnd(45)}|
|  Step: ${state.currentStep} (${stepName})`.padEnd(61) + `|
|  Last activity: ${timeSince}`.padEnd(61) + `|
|                                                            |
|  [R] Resume - Continue from where it stopped               |
|  [S] Restart - Start implementation fresh from Step 7      |
|  [D] Discard - Abandon this implementation                 |
+------------------------------------------------------------+
`;
    writeToTerminal(recoveryMenu);
  }

  // 4. Create state if none exists
  if (!state) {
    state = createState(
      projectPath,
      null,
      stack.primary.language,
      stack.primary.framework
    );
    saveState(projectPath, state);
  } else {
    // Update session status
    state.sessionStatus = 'active';
    state.lastActivity = new Date().toISOString();
    saveState(projectPath, state);
  }

  // 5. Ensure project directories exist (created on first run)
  const directories = [
    // Plans workflow (numbered for clarity)
    'plans/1_functional_draft',
    'plans/2_functional_approved',
    'plans/3_technical_draft',
    'plans/4_technical_approved',
    'plans/5_iron_loop',
    'plans/6_building',
    'plans/7_ready_for_review',
    'plans/8_done',
    // Learnings system
    'learnings/pending',
    'learnings/approved',
    'learnings/applied'
  ];

  for (const subdir of directories) {
    const dir = path.join(projectPath, subdir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // 6. Check for updates (async, non-blocking)
  const version = getVersion();
  checkForUpdates().then(update => {
    if (update.updateAvailable) {
      writeToTerminal(`\n[CTOC] Update available: ${update.currentVersion} → ${update.latestVersion}\n`);
      writeToTerminal(`       Run: git pull origin main\n`);
    }
  }).catch(() => {
    // Silent fail - don't block session start
  });

  // 7. Output banner to terminal
  writeToTerminal('CTO Chief active (v' + version + '), type /ctoc to start\n');

  // 8. Output context for Claude (to stdout for hook consumption)
  const context = generateContext(stack, state);
  console.log(context);
}

/**
 * Generate CTOC context instructions for Claude
 */
function generateContext(stack, state) {
  const stepName = state?.feature ? STEP_NAMES[state.currentStep] : 'Ready';

  return `
============================================================
CTOC ENABLED - Your Virtual CTO is Active
============================================================
Project: ${path.basename(process.cwd())}
Stack: ${stack.languages.join('/') || 'unknown'}
Iron Loop: ${state?.feature ? `Step ${state.currentStep} (${stepName})` : 'Ready for new feature'}

## Iron Loop (15 Steps) - NON-NEGOTIABLE

PLANNING (1-6) -> DEVELOPMENT (7-10) -> DELIVERY (11-15)

1:ASSESS -> 2:ALIGN -> 3:CAPTURE -> 4:PLAN -> 5:DESIGN -> 6:SPEC
7:TEST -> 8:QUALITY -> 9:IMPLEMENT -> 10:REVIEW
11:OPTIMIZE -> 12:SECURE -> 13:DOCUMENT -> 14:VERIFY -> 15:COMMIT

## Commands

| Command | Action |
|---------|--------|
| /ctoc | Show dashboard |
| /ctoc start <name> | Start tracking feature |
| /ctoc step <n> | Move to step n |
| /ctoc progress | Show detailed progress |
| /ctoc plan | Show plan status |
| /ctoc doctor | Health check |

## MANDATORY: Edit/Write Blocked Before Step 7

The Iron Loop is enforced by hooks. You CANNOT Edit or Write files until:
- Steps 1-3 complete (functional plan approved)
- Steps 4-6 complete (technical plan approved)
- Current step >= 7

This is cryptographically enforced. There are no escape phrases.

## Red Lines (Never Compromise)

- No code without tests for critical paths
- No secrets in code
- No unhandled errors in production paths
- No undocumented public APIs

============================================================
`;
}

main().catch(err => {
  console.error('[CTOC] Session start error:', err.message);
  process.exit(1);
});

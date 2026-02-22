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
const { findProjectRoot: findRoot } = require('../lib/project-root');

/**
 * Get the plugin root directory (where .claude-plugin folder is)
 */
function getPluginRoot() {
  // hooks/SessionStart.js -> go up one level to plugin root
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, '.claude-plugin'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.join(__dirname, '..', '..');
}

/**
 * Find project root by looking for .git, .ctoc, or plans directory
 * Uses the shared utility from lib/project-root.js
 */
function findProjectRoot(startDir) {
  return findRoot(startDir);
}

/**
 * Main session start handler
 */
async function main() {
  const projectPath = findProjectRoot(process.cwd());

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
    // Plans workflow (matches init-project.js PLAN_DIRS)
    'plans/vision',
    'plans/functional',
    'plans/implementation',
    'plans/todo',
    'plans/in-progress',
    'plans/review',
    'plans/done',
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
  writeToTerminal('ctoc v' + version + ' active\n');

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

## Iron Loop (16 Steps) - NON-NEGOTIABLE

IDEATION (1) -> PLANNING (2-7) -> DEVELOPMENT (8-11) -> DELIVERY (12-16)

1:IDEATE -> 2:ASSESS -> 3:ALIGN -> 4:CAPTURE -> 5:PLAN -> 6:DESIGN -> 7:SPEC
8:TEST -> 9:PREPARE -> 10:IMPLEMENT -> 11:REVIEW
12:OPTIMIZE -> 13:SECURE -> 14:VERIFY -> 15:DOCUMENT -> 16:FINAL-REVIEW

## Commands

| Command | Action |
|---------|--------|
| /ctoc | Interactive dashboard (all features) |

## MANDATORY: Edit/Write Blocked Before Step 8

The Iron Loop is enforced by hooks. You CANNOT Edit or Write files until:
- Steps 1-4 complete (functional plan approved)
- Steps 5-7 complete (technical plan approved)
- Current step >= 8

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

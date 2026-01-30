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
  return path.dirname(__dirname);
}

/**
 * Find project root by looking for .git or .claude directory
 */
function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Auto-update plugin path in .claude/settings.local.json
 * Ensures the plugin is correctly registered regardless of directory structure
 */
function autoUpdatePluginPath() {
  const pluginRoot = getPluginRoot();
  const projectRoot = findProjectRoot(pluginRoot);
  const settingsDir = path.join(projectRoot, '.claude');
  const settingsFile = path.join(settingsDir, 'settings.local.json');

  // Calculate relative path from project root to plugin
  const relativePath = path.relative(projectRoot, pluginRoot);
  const expectedKey = `ctoc@${relativePath}`;

  // Ensure .claude directory exists
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  // Read existing settings or create new
  let settings = { enabledPlugins: {} };
  if (fs.existsSync(settingsFile)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (!settings.enabledPlugins) {
        settings.enabledPlugins = {};
      }
    } catch (e) {
      settings = { enabledPlugins: {} };
    }
  }

  // Check if plugin is already correctly registered
  if (settings.enabledPlugins[expectedKey] === true) {
    return { updated: false, path: expectedKey };
  }

  // Remove any old ctoc@ entries
  const oldKeys = Object.keys(settings.enabledPlugins).filter(k => k.startsWith('ctoc@'));
  for (const key of oldKeys) {
    delete settings.enabledPlugins[key];
  }

  // Add correct plugin path
  settings.enabledPlugins[expectedKey] = true;

  // Write updated settings
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');

  return { updated: true, path: expectedKey, oldKeys };
}

/**
 * Main session start handler
 */
async function main() {
  const projectPath = process.cwd();

  // 0. Auto-update plugin path in settings (ensures correct registration)
  const pluginUpdate = autoUpdatePluginPath();
  if (pluginUpdate.updated) {
    writeToTerminal(`[CTOC] Plugin path updated: ${pluginUpdate.path}\n`);
    if (pluginUpdate.oldKeys && pluginUpdate.oldKeys.length > 0) {
      writeToTerminal(`       Removed old paths: ${pluginUpdate.oldKeys.join(', ')}\n`);
    }
  }

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

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
const { getVersion } = require('../lib/version');
const { findProjectRoot: findRoot } = require('../lib/project-root');
const { writeToTerminal } = require('../lib/ui');

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
    'plans/canvas',          // PLAN_DIRS already has it; SessionStart was missing it
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

  // 5b. Ensure CTOC-managed operating-lessons block in CLAUDE.md (fail-open).
  //     MUST NOT throw, block, or perceptibly slow session start. Double-guarded:
  //     ensureLessonsBlock itself never throws; this try/catch is a belt-and-braces backstop.
  //     Self-repo guard: never auto-edit CTOC's OWN hand-maintained CLAUDE.md (the dev repo).
  //     In a consumer project the hook runs from the installed plugin, so ctocRoot (the plugin
  //     root) differs from projectPath and injection proceeds normally.
  try {
    const ctocRoot = path.resolve(__dirname, '..', '..');
    if (path.resolve(projectPath) !== ctocRoot) {
      const { ensureLessonsBlock } = require('../lib/claude-md-lessons');
      const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
      ensureLessonsBlock(claudeMdPath, ctocRoot);
    }
  } catch (err) {
    console.error('[CTOC] Lessons block injection skipped:', err.message);
  }

  // 6. Check for updates (sync cache check only — no stderr output in hooks)
  const version = getVersion();
  const { checkForUpdatesSync } = require('../lib/version');
  const updateInfo = checkForUpdatesSync();

  // 7. Iron Loop self-check (fast mode — frontmatter-only scans, ~50ms target)
  let selfCheckSummary = null;
  try {
    const { checkAllInvariants, formatCompact } = require('../lib/iron-loop-enforcer');
    const sc = checkAllInvariants({ root: projectPath, mode: 'fast' });
    selfCheckSummary = formatCompact(sc);
  } catch (err) {
    // Self-check itself must never crash session start
    selfCheckSummary = `Self-check skipped: ${err.message}`;
  }

  // 8. Output context for Claude (to stdout for hook consumption)
  const context = generateContext(stack, state, version, updateInfo, selfCheckSummary);
  console.log(context);
}

/**
 * Generate CTOC context instructions for Claude
 */
function generateContext(stack, state, version, updateInfo, selfCheckSummary) {
  const stepName = state?.feature ? STEP_NAMES[state.currentStep] : 'Ready';
  const updateLine = updateInfo?.updateAvailable
    ? `\nUpdate available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion} (run: git pull origin main)`
    : '';
  const selfCheckLine = selfCheckSummary ? `\n${selfCheckSummary}` : '';

  // NOTE: This 16-step banner is the compact, machine-readable copy. The CANONICAL
  // operating-lessons + methodology reference live in .ctoc/templates/operating-lessons.md.
  // Kept as a separate inline copy on purpose (no runtime file I/O on the hot session-start
  // path); the generateContext<->operating-lessons.md step labels are sync-guarded by
  // tests/claude-md-lessons.test.js (any divergence fails that test).
  return `
============================================================
CTOC v${version || '?'} - Your Virtual CTO is Active${updateLine}
============================================================
Project: ${path.basename(process.cwd())}
Stack: ${stack.languages.join('/') || 'unknown'}
Iron Loop: ${state?.feature ? `Step ${state.currentStep} (${stepName})` : 'Ready for new feature'}${selfCheckLine}

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

if (require.main === module) {
  main().catch(err => {
    console.error('[CTOC] Session start error:', err.message);
    process.exit(1);
  });
}

module.exports = { main, generateContext };

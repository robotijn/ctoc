#!/usr/bin/env node
/**
 * CTOC On-Stop Hook
 * Runs after each Claude response (Stop event)
 *
 * Responsibilities:
 * 1. Update session with latest activity
 * 2. Persist any state changes
 * 3. Light-weight - runs frequently
 */

const path = require('path');
const fs = require('fs');
const {
  ensureDirectories,
  loadIronLoopState,
  saveIronLoopState,
  loadSession,
  saveSession,
  getTimestamp,
  updateLastActivity,
  loadSettings,
  saveSettings,
  shouldShowCheckIn,
  generateCheckInPrompt,
  DEFAULT_SETTINGS
} = require('../lib/utils');

// ============================================================================
// Terminal Output
// ============================================================================

/**
 * Write directly to terminal, bypassing stdout/stderr capture
 */
function writeToTerminal(message) {
  const isWindows = process.platform === 'win32';
  const terminalDevice = isWindows ? 'CONOUT$' : '/dev/tty';

  try {
    const fd = fs.openSync(terminalDevice, 'w');
    fs.writeSync(fd, message);
    fs.closeSync(fd);
    return true;
  } catch (e) {
    // Silent fail - don't disrupt the on-stop hook
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    ensureDirectories();

    const projectPath = process.cwd();

    // 1. Update session last activity
    const session = loadSession();

    if (session.projects[projectPath]) {
      session.projects[projectPath].lastActivity = getTimestamp();
    } else {
      session.projects[projectPath] = {
        lastActivity: getTimestamp()
      };
    }

    session.lastUpdated = getTimestamp();
    saveSession(session);

    // 2. Touch Iron Loop state (update lastUpdated and lastActivity for crash recovery)
    const state = loadIronLoopState(projectPath);
    if (state) {
      state.lastUpdated = getTimestamp();
      state.lastActivity = getTimestamp(); // Update lastActivity for crash recovery
      saveIronLoopState(projectPath, state);

      // 3. Check if we're in background implementation mode and need to show check-in
      if (state.backgroundImplementation && state.backgroundImplementation.active) {
        const bgImpl = state.backgroundImplementation;
        const settings = loadSettings(projectPath);
        const permission = bgImpl.permission || settings.implementation?.permission || DEFAULT_SETTINGS.implementation.permission;

        if (permission === 'check-in') {
          const interval = bgImpl.checkInInterval || settings.implementation?.check_in_interval || DEFAULT_SETTINGS.implementation.check_in_interval;
          const startTime = new Date(bgImpl.startTime).getTime();
          const lastCheckIn = bgImpl.lastCheckIn ? new Date(bgImpl.lastCheckIn).getTime() : startTime;

          // Check if we should show a check-in prompt
          if (shouldShowCheckIn(lastCheckIn, interval)) {
            const elapsed = Date.now() - startTime;
            const plansCompleted = bgImpl.plansCompleted || 0;
            const plansRemaining = bgImpl.totalPlans - plansCompleted;

            // Output check-in prompt to terminal
            const checkInPrompt = generateCheckInPrompt(elapsed, plansCompleted, plansRemaining);
            writeToTerminal('\n' + checkInPrompt + '\n');

            // Update last check-in time
            state.backgroundImplementation.lastCheckIn = getTimestamp();
            saveIronLoopState(projectPath, state);

            // Output marker for Claude's context
            console.log('[CTOC] Check-in prompt displayed - awaiting user response');
          }
        }
      }
    }

    // No output - this runs frequently and should be silent

  } catch (error) {
    // Silent failure - this is a background hook
  }

  process.exit(0);
}

main();

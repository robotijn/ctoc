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
const {
  ensureDirectories,
  loadIronLoopState,
  saveIronLoopState,
  loadSession,
  saveSession,
  getTimestamp
} = require('../lib/utils');

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

    // 2. Touch Iron Loop state (update lastUpdated)
    const state = loadIronLoopState(projectPath);
    if (state) {
      state.lastUpdated = getTimestamp();
      saveIronLoopState(projectPath, state);
    }

    // No output - this runs frequently and should be silent

  } catch (error) {
    // Silent failure - this is a background hook
  }

  process.exit(0);
}

main();

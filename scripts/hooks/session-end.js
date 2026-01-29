#!/usr/bin/env node
/**
 * CTOC Session End Hook
 * Runs when a Claude Code session ends
 *
 * Responsibilities:
 * 1. Save Iron Loop progress
 * 2. Update session file
 * 3. Extract learnable patterns (future)
 */

const path = require('path');
const {
  ensureDirectories,
  loadIronLoopState,
  saveIronLoopState,
  loadSession,
  saveSession,
  logSessionEvent,
  getTimestamp,
  log,
  STEP_NAMES
} = require('../lib/utils');

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    ensureDirectories();

    const projectPath = process.cwd();

    // 1. Save Iron Loop state
    const ironLoopState = loadIronLoopState(projectPath);

    if (ironLoopState) {
      // Update last modified timestamp and mark session as cleanly ended
      ironLoopState.lastUpdated = getTimestamp();
      ironLoopState.sessionStatus = 'ended'; // Mark clean exit for crash recovery
      saveIronLoopState(projectPath, ironLoopState);

      const stepName = STEP_NAMES[ironLoopState.currentStep] || 'Unknown';
      log(`Iron Loop state saved: Step ${ironLoopState.currentStep} (${stepName})`);

      if (ironLoopState.feature) {
        log(`Feature: "${ironLoopState.feature}"`);
      }

      // Count completed steps
      const completedSteps = Object.keys(ironLoopState.steps)
        .filter(k => ironLoopState.steps[k].status === 'completed')
        .length;

      log(`Progress: ${completedSteps}/15 steps completed`);
    }

    // 2. Update session file
    const session = loadSession();

    // Update project in session
    if (session.projects[projectPath]) {
      session.projects[projectPath].lastAccessed = getTimestamp();
      if (ironLoopState) {
        session.projects[projectPath].ironLoopStep = ironLoopState.currentStep;
        session.projects[projectPath].feature = ironLoopState.feature;
      }
    }

    // Log session end event
    logSessionEvent('session_end', {
      project: projectPath,
      ironLoopStep: ironLoopState?.currentStep,
      feature: ironLoopState?.feature,
      completedSteps: ironLoopState ? Object.keys(ironLoopState.steps)
        .filter(k => ironLoopState.steps[k].status === 'completed')
        .length : 0
    });

    saveSession(session);

    // 3. Output summary
    console.log('');
    console.log('[CTOC] Session ended. State saved.');

    if (ironLoopState && ironLoopState.feature) {
      const nextStep = ironLoopState.currentStep;
      if (nextStep <= 15) {
        console.log(`[CTOC] Next time: Continue with Step ${nextStep} (${STEP_NAMES[nextStep]})`);
      } else {
        console.log('[CTOC] Feature complete! Ready for next feature.');
      }
    }

  } catch (error) {
    console.error(`[CTOC ERROR] Session end failed: ${error.message}`);
    // Don't exit with error - this is a cleanup hook
  }
}

main();

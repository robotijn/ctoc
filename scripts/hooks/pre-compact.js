#!/usr/bin/env node
/**
 * CTOC Pre-Compact Hook
 * Runs before Claude Code context compaction
 *
 * Responsibilities:
 * 1. Save current Iron Loop state
 * 2. Log compaction event
 * 3. Preserve critical context
 */

const path = require('path');
const {
  ensureDirectories,
  loadIronLoopState,
  saveIronLoopState,
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
    const state = loadIronLoopState(projectPath);

    if (state) {
      state.lastUpdated = getTimestamp();
      state.lastCompaction = getTimestamp();
      saveIronLoopState(projectPath, state);

      log(`Pre-compact: Saved Iron Loop state`);
      log(`  Feature: ${state.feature || 'None'}`);
      log(`  Step: ${state.currentStep} (${STEP_NAMES[state.currentStep]})`);
    }

    // 2. Log compaction event
    logSessionEvent('pre_compact', {
      project: projectPath,
      timestamp: getTimestamp(),
      ironLoopStep: state?.currentStep,
      feature: state?.feature
    });

    // 3. Output context preservation summary
    console.log('\n[CTOC] Pre-compaction state saved.');
    console.log('[CTOC] Iron Loop progress preserved for context restoration.\n');

  } catch (error) {
    console.error(`[CTOC ERROR] Pre-compact failed: ${error.message}`);
    // Don't exit with error - this is a cleanup hook
  }

  process.exit(0);
}

main();

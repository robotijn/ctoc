#!/usr/bin/env node
/**
 * CTOC Session Start Hook
 * Runs when a Claude Code session starts
 *
 * Responsibilities:
 * 1. Detect project stack (language/framework)
 * 2. Load relevant CTO profiles
 * 3. Restore Iron Loop state if exists
 * 4. Initialize session tracking
 */

const path = require('path');
const {
  ensureDirectories,
  getCTOCRoot,
  loadIronLoopState,
  createIronLoopState,
  saveIronLoopState,
  loadSession,
  saveSession,
  logSessionEvent,
  log,
  warn,
  STEP_NAMES
} = require('../lib/utils');

const { detectStack, profileExists } = require('../lib/stack-detector');
const { listProfiles } = require('../lib/profile-loader');
const { generateCTOCInstructions } = require('../lib/ctoc-instructions');
const { checkForUpdates } = require('./update-check');

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    // Ensure CTOC directories exist
    ensureDirectories();

    // Check for updates (non-blocking, throttled to once/day)
    checkForUpdates().catch(() => {});

    const projectPath = process.cwd();
    const ctocRoot = getCTOCRoot();

    // 1. Detect project stack
    log('Detecting project stack...');
    const stack = detectStack(projectPath);

    if (stack.languages.length === 0) {
      log('No recognized languages detected in project');
    } else {
      log(`Languages detected: ${stack.languages.join(', ')}`);
    }

    if (stack.frameworks.length > 0) {
      log(`Frameworks detected: ${stack.frameworks.join(', ')}`);
    }

    // 2. Check for CTO profiles
    if (ctocRoot) {
      const profiles = listProfiles();
      const loadedProfiles = [];

      // Check if we have profiles for detected stack
      for (const lang of stack.languages) {
        if (profileExists(ctocRoot, 'language', lang)) {
          loadedProfiles.push(`${lang} (language)`);
        }
      }

      for (const framework of stack.frameworks) {
        if (profileExists(ctocRoot, 'framework', framework)) {
          loadedProfiles.push(`${framework} (framework)`);
        }
      }

      if (loadedProfiles.length > 0) {
        log(`CTO Profiles available: ${loadedProfiles.join(', ')}`);
      }
    }

    // 3. Load or create Iron Loop state
    let ironLoopState = loadIronLoopState(projectPath);

    if (ironLoopState) {
      // Resuming existing work
      const stepName = STEP_NAMES[ironLoopState.currentStep] || 'Unknown';
      log(`Resuming feature: "${ironLoopState.feature}"`);
      log(`Current step: ${ironLoopState.currentStep} (${stepName})`);

      // Show step progress
      const completedSteps = Object.keys(ironLoopState.steps)
        .filter(k => ironLoopState.steps[k].status === 'completed')
        .map(k => parseInt(k));

      if (completedSteps.length > 0) {
        log(`Completed steps: ${completedSteps.map(s => `${s}:${STEP_NAMES[s]}`).join(', ')}`);
      }

      // Check for blockers
      if (ironLoopState.blockers && ironLoopState.blockers.length > 0) {
        warn(`Blockers: ${ironLoopState.blockers.join(', ')}`);
      }
    } else {
      // New session - create placeholder state
      // The actual feature name will be set when the user starts working
      ironLoopState = createIronLoopState(
        projectPath,
        null, // Feature TBD
        stack.primary.language,
        stack.primary.framework
      );
      log('New session started. Iron Loop state initialized.');
      log('Use "/ctoc start <feature-name>" to begin tracking a feature.');
    }

    // 4. Update session tracking
    const session = loadSession();

    // Add this project to session
    session.projects[projectPath] = {
      stack: stack,
      lastAccessed: new Date().toISOString(),
      ironLoopStep: ironLoopState.currentStep,
      feature: ironLoopState.feature
    };

    // Log session start event
    logSessionEvent('session_start', {
      project: projectPath,
      stack: stack,
      ironLoopStep: ironLoopState.currentStep,
      feature: ironLoopState.feature
    });

    saveSession(session);

    // 5. Output visible startup banner to stderr (user sees this)
    const fs = require('fs');
    let version = 'unknown';
    try {
      version = fs.readFileSync(path.join(ctocRoot, 'VERSION'), 'utf8').trim();
    } catch (e) {}

    const language = stack.primary?.language || 'unknown';
    const framework = stack.primary?.framework || 'none';
    const stepName = STEP_NAMES[ironLoopState.currentStep] || 'Unknown';
    const featureInfo = ironLoopState.feature ? ` | Feature: ${ironLoopState.feature}` : '';

    console.error(`[CTOC] v${version} | ${language}/${framework} | Step ${ironLoopState.currentStep} (${stepName})${featureInfo}`);

    // 6. Output CTOC instructions for Claude's context
    // This is the key output that makes Claude "become" the CTO
    console.log('');
    console.log(generateCTOCInstructions(stack, ironLoopState));

  } catch (error) {
    console.error(`[CTOC ERROR] Session start failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

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
const fs = require('fs');
const {
  ensureDirectories,
  getCTOCRoot,
  loadIronLoopState,
  createIronLoopState,
  saveIronLoopState,
  loadSession,
  saveSession,
  logSessionEvent,
  loadConfig,
  log,
  warn,
  STEP_NAMES
} = require('../lib/utils');

const { detectStack, profileExists } = require('../lib/stack-detector');
const { listProfiles } = require('../lib/profile-loader');
const { generateCTOCInstructions } = require('../lib/ctoc-instructions');
const { checkForUpdates, getCurrentVersion, fetchLatestVersion, compareSemver } = require('./update-check');

// ============================================================================
// Settings
// ============================================================================

/**
 * Load project-level settings from .ctoc/settings.yaml
 */
function loadProjectSettings() {
  const settingsPath = path.join(process.cwd(), '.ctoc', 'settings.yaml');
  try {
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf8');
      // Simple YAML parsing for flat settings
      const settings = {};
      const lines = content.split('\n');
      let currentSection = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed === '') continue;

        // Check for section (no colon at end, or value after colon)
        const match = trimmed.match(/^(\w+):\s*(.*)$/);
        if (match) {
          const [, key, value] = match;
          if (value === '' || value === '{}' || value === '[]') {
            // New section
            currentSection = key;
            settings[currentSection] = {};
          } else if (currentSection) {
            // Value in current section
            settings[currentSection][key] = parseYamlValue(value);
          } else {
            // Top-level value
            settings[key] = parseYamlValue(value);
          }
        } else if (currentSection && trimmed.match(/^\w+:/)) {
          // Subsection key
          const subMatch = trimmed.match(/^(\w+):\s*(.*)$/);
          if (subMatch) {
            settings[currentSection][subMatch[1]] = parseYamlValue(subMatch[2]);
          }
        }
      }
      return settings;
    }
  } catch (e) {
    // Silent fail
  }
  return {};
}

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
// Terminal Output
// ============================================================================

/**
 * Write directly to terminal, bypassing stdout/stderr capture
 * This allows the banner to be visible to users even when Claude Code
 * captures hook output into the system prompt.
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
    // Fallback to stderr (will go to Claude's context, but at least logged)
    console.error(message.trim());
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    // Ensure CTOC directories exist
    ensureDirectories();

    // Check for updates and get update info
    let updateInfo = null;
    try {
      const config = loadConfig();
      const currentVersion = getCurrentVersion();

      // Check if we have cached latest version from previous check
      // Only show update if latest is NEWER than current
      if (config.updates?.latest_version &&
          compareSemver(config.updates.latest_version, currentVersion) > 0) {
        updateInfo = {
          available: true,
          current: currentVersion,
          latest: config.updates.latest_version
        };
      }

      // Trigger background update check (throttled, won't block)
      checkForUpdates().catch(() => {});
    } catch (e) {
      // Silent fail
    }

    // Load project settings for update prompt configuration
    const settings = loadProjectSettings();

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
    let version = 'unknown';
    try {
      version = fs.readFileSync(path.join(ctocRoot, 'VERSION'), 'utf8').trim();
    } catch (e) {}

    const language = stack.primary?.language || 'unknown';
    const framework = stack.primary?.framework || 'none';
    const stepName = STEP_NAMES[ironLoopState.currentStep] || 'Unknown';
    const featureInfo = ironLoopState.feature ? ` | Feature: ${ironLoopState.feature}` : '';

    const banner = `[CTOC] v${version} | ${language}/${framework} | Step ${ironLoopState.currentStep} (${stepName})${featureInfo}\n`;
    writeToTerminal(banner);

    // 6. Compute gate status for human decision gates
    // Gate 1: Functional planning complete (step 3)
    // Gate 2: Technical planning complete (step 6)
    const gate1Passed = ironLoopState.steps[3]?.status === 'completed';
    const gate2Passed = ironLoopState.steps[6]?.status === 'completed';

    // 7. Output CTOC instructions for Claude's context
    // This is the key output that makes Claude "become" the CTO
    console.log('');
    console.log(generateCTOCInstructions(stack, ironLoopState, { updateInfo, settings, gate1Passed, gate2Passed }));

  } catch (error) {
    console.error(`[CTOC ERROR] Session start failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

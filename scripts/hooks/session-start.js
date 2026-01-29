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
  STEP_NAMES,
  hasApprovedPlan,
  hasDraftPlan,
  ensurePlanDirectories,
  PLAN_TYPES,
  isInterruptedSession,
  formatTimeSince,
  getQueuedPlans,
  shouldShowUsageLink,
  generateBackgroundMenu,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  getToday
} = require('../lib/utils');

const { detectStack, profileExists } = require('../lib/stack-detector');
const { listProfiles } = require('../lib/profile-loader');
const { generateCTOCInstructions } = require('../lib/ctoc-instructions');
const { checkForUpdates, getCurrentVersion, fetchLatestVersion, compareSemver } = require('./update-check');
const terminalUI = require('../lib/terminal-ui');

// Dashboard state generator (for fast ctoc kanban/admin reads)
function generateDashboardState(projectPath) {
  try {
    const dashboardGen = require('../lib/dashboard-state');
  } catch (e) {
    // Generate inline if module call fails
    const { execSync } = require('child_process');
    try {
      execSync('node scripts/lib/dashboard-state.js', { cwd: projectPath, stdio: 'ignore' });
    } catch {}
  }
}

// ============================================================================
// MCP Configuration Check
// ============================================================================

/**
 * Check if MCP server is configured in Claude settings
 * Checks LOCAL .claude/settings.json first (takes precedence), then GLOBAL
 * Returns: { configured: boolean, mcpIndex: string|null, error: string|null, location: string|null }
 */
function checkMCPConfiguration() {
  const os = require('os');
  const projectRoot = process.cwd();
  const localSettingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const mcpIndexPath = path.join(projectRoot, '.ctoc', 'repo', 'mcp', 'index.js');

  // Check if MCP server files exist
  if (!fs.existsSync(mcpIndexPath)) {
    return {
      configured: false,
      mcpIndex: null,
      error: 'MCP server not found at .ctoc/repo/mcp/index.js',
      location: null
    };
  }

  // Check if node_modules exists (npm install was run)
  const nodeModulesPath = path.join(projectRoot, '.ctoc', 'repo', 'mcp', 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    return {
      configured: false,
      mcpIndex: mcpIndexPath,
      error: 'MCP dependencies not installed. Run: cd .ctoc/repo/mcp && npm install',
      location: null
    };
  }

  // Check LOCAL .claude/settings.json first (takes precedence)
  if (fs.existsSync(localSettingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
      if (settings.mcpServers?.ctoc) {
        return {
          configured: true,
          mcpIndex: mcpIndexPath,
          error: null,
          location: 'local'
        };
      }
    } catch (e) {
      // Continue to check global
    }
  }

  // Check GLOBAL ~/.claude/settings.json as fallback
  if (fs.existsSync(globalSettingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(globalSettingsPath, 'utf8'));
      if (settings.mcpServers?.ctoc) {
        return {
          configured: true,
          mcpIndex: mcpIndexPath,
          error: null,
          location: 'global'
        };
      }
    } catch (e) {
      // Fall through to error
    }
  }

  return {
    configured: false,
    mcpIndex: mcpIndexPath,
    error: 'MCP server "ctoc" not found in .claude/settings.json or ~/.claude/settings.json',
    location: null
  };
}

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
// Terminal Output (using terminal-ui module)
// ============================================================================

// Use terminal-ui's writeToTerminal for cross-platform support
const writeToTerminal = terminalUI.writeToTerminal;

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    // Ensure CTOC directories exist
    ensureDirectories();

    // Check MCP configuration (required for CTOC to function)
    const mcpStatus = checkMCPConfiguration();
    if (!mcpStatus.configured) {
      log(`[CTOC] MCP ERROR: ${mcpStatus.error}`);
      log('[CTOC] CTOC requires MCP server to be configured.');
      log('[CTOC] Run: cd .ctoc/repo/mcp && npm install');
      log('[CTOC] Then restart Claude Code to load MCP tools.');
      // Continue anyway but CTOC commands won't work properly
    }

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
    let interruptedSession = false;

    if (ironLoopState) {
      // Check for interrupted implementation session (crash recovery)
      if (isInterruptedSession(ironLoopState)) {
        interruptedSession = true;
        const stepName = STEP_NAMES[ironLoopState.currentStep] || 'Unknown';
        const timeSince = formatTimeSince(ironLoopState.lastActivity);
        const featureName = ironLoopState.feature || 'Unknown feature';

        // Display recovery menu to terminal (visible to user)
        const recoveryMenu = `
+------------------------------------------------------------+
|  INTERRUPTED IMPLEMENTATION DETECTED                       |
+------------------------------------------------------------+
|  Plan: ${featureName.padEnd(49)}|
|  Step: ${ironLoopState.currentStep} (${stepName})`.padEnd(61) + `|
|  Last activity: ${timeSince}`.padEnd(61) + `|
|                                                            |
|  [R] Resume - Continue from where it stopped               |
|  [S] Restart - Start implementation fresh from Step 7      |
|  [D] Discard - Abandon this implementation                 |
+------------------------------------------------------------+
`;
        writeToTerminal(recoveryMenu);
      }

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

      // Update session status to active and refresh lastActivity
      ironLoopState.sessionStatus = 'active';
      ironLoopState.lastActivity = new Date().toISOString();
      saveIronLoopState(projectPath, ironLoopState);
    } else {
      // New session - create placeholder state
      // The actual feature name will be set when the user starts working
      ironLoopState = createIronLoopState(
        projectPath,
        null, // Feature TBD
        stack.primary.language,
        stack.primary.framework
      );
      saveIronLoopState(projectPath, ironLoopState);
      log('New session started. Iron Loop state initialized.');
      log('Use "/ctoc start <feature-name>" to begin tracking a feature.');
    }

    // 4. Ensure plan directories exist and check plan status
    ensurePlanDirectories(projectPath);

    const planStatus = {
      functional: {
        approved: hasApprovedPlan(PLAN_TYPES.FUNCTIONAL, projectPath),
        draft: hasDraftPlan(PLAN_TYPES.FUNCTIONAL, projectPath)
      },
      implementation: {
        approved: hasApprovedPlan(PLAN_TYPES.IMPLEMENTATION, projectPath),
        draft: hasDraftPlan(PLAN_TYPES.IMPLEMENTATION, projectPath)
      }
    };

    if (planStatus.functional.approved) {
      log(`Functional plan approved: ${planStatus.functional.approved.name}`);
    } else if (planStatus.functional.draft) {
      log(`Functional plan in draft: ${planStatus.functional.draft.name} (needs approval)`);
    }

    if (planStatus.implementation.approved) {
      log(`Implementation plan approved: ${planStatus.implementation.approved.name}`);
    } else if (planStatus.implementation.draft) {
      log(`Implementation plan in draft: ${planStatus.implementation.draft.name} (needs approval)`);
    }

    // 4b. Check for queued plans and show background implementation menu
    const queuedPlans = getQueuedPlans(projectPath);
    let backgroundImplementationInfo = null;

    if (queuedPlans.length > 0 && !interruptedSession) {
      // Load project settings for implementation preferences
      const projectSettings = loadSettings(projectPath);

      // Check if we should show the usage link based on frequency
      const usageLinkFrequency = projectSettings.display?.usage_link_frequency || DEFAULT_SETTINGS.display.usage_link_frequency;
      const lastUsageLinkShown = projectSettings._lastUsageLinkShown || null;
      const showUsageLink = shouldShowUsageLink(usageLinkFrequency, lastUsageLinkShown);

      // Update last shown date if we're showing the link
      if (showUsageLink && usageLinkFrequency === 'daily') {
        projectSettings._lastUsageLinkShown = getToday();
        saveSettings(projectPath, projectSettings);
      }

      // Generate and display the background implementation menu
      const menu = generateBackgroundMenu(queuedPlans.length);
      writeToTerminal('\n' + menu + '\n');

      // Store info for Claude's context
      backgroundImplementationInfo = {
        queuedPlans: queuedPlans.length,
        planNames: queuedPlans.map(p => p.name),
        showUsageLink,
        defaultMode: projectSettings.implementation?.mode || DEFAULT_SETTINGS.implementation.mode,
        defaultPermission: projectSettings.implementation?.permission || DEFAULT_SETTINGS.implementation.permission,
        defaultCheckInInterval: projectSettings.implementation?.check_in_interval || DEFAULT_SETTINGS.implementation.check_in_interval
      };

      log(`${queuedPlans.length} plans queued for background implementation`);
    }

    // 5. Update session tracking
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

    // 5b. Generate dashboard state for fast ctoc kanban/admin reads
    generateDashboardState(projectPath);

    // 5. Output visible startup banner to stderr (user sees this)
    let version = null;
    try {
      version = fs.readFileSync(path.join(ctocRoot, 'VERSION'), 'utf8').trim();
    } catch (e) {}

    const stepName = STEP_NAMES[ironLoopState.currentStep] || 'Unknown';

    // Simple, consistent banner
    const banner = 'CTO Chief active, type ctoc to start\n';
    writeToTerminal(banner);

    // 7. Compute gate status for human decision gates
    // Gate 1: Functional planning complete (step 3 completed OR approved plan exists)
    // Gate 2: Technical planning complete (step 6 completed OR approved plan exists)
    const gate1Passed = ironLoopState.steps[3]?.status === 'completed' || !!planStatus.functional.approved;
    const gate2Passed = ironLoopState.steps[6]?.status === 'completed' || !!planStatus.implementation.approved;

    // 8. Output CTOC instructions for Claude's context
    // This is the key output that makes Claude "become" the CTO
    console.log('');
    console.log(generateCTOCInstructions(stack, ironLoopState, {
      updateInfo,
      settings,
      gate1Passed,
      gate2Passed,
      planStatus,
      backgroundImplementationInfo
    }));

  } catch (error) {
    console.error(`[CTOC ERROR] Session start failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

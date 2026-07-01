#!/usr/bin/env node
/**
 * CTOC Interactive Interface
 * Main entry point for /ctoc command
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { c, clear, line, renderTabs, renderTabIndicator, setupKeyboard, cleanup, renderBreadcrumb } = require('../lib/tui');
const { TABS, getTabNames, nextTab, prevTab } = require('../lib/tabs');
const { NavStack } = require('../lib/state');
const { startAutoSync, stopAutoSync } = require('../lib/sync');
const { findProjectRoot } = require('../lib/project-root');
const { needsEnvironmentPrompt } = require('../lib/settings');

// First-run environment question. NEVER replaces the dashboard — it is
// attached as a SECOND question alongside the pipeline question, so the plan
// overview is always visible. (v6.9.44: the v6.9.40 prompt-gate hid the
// dashboard and "Decide later" looped back to itself; this fixes both.)
function attachEnvironmentQuestion(result) {
  result.text =
    '⚙ No CTOC environment chosen yet for this project — pick one below\n' +
    '  (dev = soft enforcement, never auto-push · staging = strict, manual push ·\n' +
    '   prod = strict, auto-push after gates). The four human gates stay\n' +
    '  mandatory in every environment. Changeable later in System → Settings.\n\n' +
    result.text;
  result.ask.questions.push({
    question: 'Which environment should CTOC run in for this project?',
    header: 'Environment',
    options: [
      { label: 'Development', description: 'Soft enforcement, never auto-push — fast local iteration' },
      { label: 'Staging', description: 'Strict enforcement, manual push — rehearse production' },
      { label: 'Production', description: 'Strict enforcement, auto-push after gates — locked down' },
      { label: 'Decide later', description: 'Keep defaults; ask again next time' }
    ]
  });
  Object.assign(result.actions, {
    'Development': 'claude:set-environment dev',
    'Staging': 'claude:set-environment staging',
    'Production': 'claude:set-environment prod',
    'Decide later': 'claude:env-decide-later'
  });
  return result;
}

// Read version from VERSION file
let VERSION;
try {
  VERSION = safeFs.readFileSync(path.join(__dirname, '..', '..', 'VERSION'), 'utf8').trim();
} catch {
  VERSION = '?.?.?';
}

// CTOC v7 (A3.2): import 5 area modules. Legacy tab modules remain on disk
// but are no longer directly mounted by the TUI — Pipeline area folds
// overview/vision/functional/implementation/review/todo into one view.
const pipelineArea = require('../areas/pipeline');
const inboxArea = require('../areas/inbox');
const agentArea = require('../areas/agent');
const libraryArea = require('../areas/library');
const systemArea = require('../areas/system');

// Legacy tab modules retained so functional/review/etc. drill-in flows that
// reference `functionalTab.renderActions`, `reviewTab.renderRejectInput`
// continue to work during A3.2 transition.
const overviewTab = require('../tabs/overview');
const functionalTab = require('../tabs/functional');
const reviewTab = require('../tabs/review');
const toolsTab = require('../tabs/tools');

const tabModules = {
  pipeline: pipelineArea,
  inbox: inboxArea,
  agent: agentArea,
  library: libraryArea,
  system: systemArea,
};

// Message display timer (prevents render races on rapid key presses)
let messageTimer = null;

// Application state
const app = {
  projectPath: findProjectRoot(),
  width: process.stdout.columns || 80,
  tabIndex: 0,
  mode: 'list',
  selectedIndex: 0,
  actionIndex: 0,
  selectedPlan: null,
  message: null,
  navStack: new NavStack(),
  // Tab-specific state
  toolIndex: 0,
  toolMode: null,
  settingsTabIndex: 0,
  settingIndex: 0,
  finishedOffset: 0,
  finishedIndex: 0,
  directInput: '',
  inputValue: '',
  doctorInput: '',
  viewContent: null
};

// Render the current screen
function render() {
  clear();

  const tabNames = getTabNames();
  let output = '';

  // Header with version
  output += `${c.dim}CTOC v${VERSION}${c.reset}\n`;

  // Tab bar
  output += renderTabs(tabNames, app.tabIndex) + '\n';
  output += renderTabIndicator(tabNames, app.tabIndex) + '\n';
  output += line() + '\n';

  // Breadcrumb if in sub-screen
  if (app.navStack.path().length > 1) {
    output += renderBreadcrumb(app.navStack.path()) + '\n';
  }

  // Current tab content
  const currentTab = TABS[app.tabIndex];
  const tabModule = tabModules[currentTab.id];

  if (app.mode === 'view' && app.viewContent) {
    output += renderView(app.viewContent);
  } else if (app.mode === 'actions' && app.selectedPlan) {
    if (tabModule.renderActions) {
      output += tabModule.renderActions(app, app.selectedPlan);
    }
  } else if (app.mode === 'confirm-assign' && functionalTab.renderAssignConfirm) {
    output += functionalTab.renderAssignConfirm(app.selectedPlan);
  } else if (app.mode === 'reject-input' && reviewTab.renderRejectInput) {
    output += reviewTab.renderRejectInput(app);
  } else if (currentTab.id === 'system' && app.toolMode) {
    // Legacy tools sub-modes (doctor/update/settings) reachable from System area
    if (app.toolMode === '1') output += toolsTab.renderDoctor(app);
    else if (app.toolMode === '2') output += toolsTab.renderUpdate(app);
    else if (app.toolMode === '3') output += toolsTab.renderSettings(app);
  } else if (tabModule && tabModule.render) {
    output += tabModule.render(app);
  }

  // Status message (clear previous timer to prevent render races)
  if (messageTimer) clearTimeout(messageTimer);
  if (app.message) {
    output += `\n${c.green}${app.message}${c.reset}\n`;
    messageTimer = setTimeout(() => {
      app.message = null;
      render();
    }, 2000);
  }

  process.stdout.write(output);
}

// Render plan content view
function renderView(content) {
  let output = '\n';

  // Truncate long content
  const lines = content.split('\n');
  const maxLines = process.stdout.rows - 10 || 30;
  const displayLines = lines.slice(0, maxLines);

  displayLines.forEach(displayLine => {
    output += displayLine + '\n';
  });

  if (lines.length > maxLines) {
    output += `\n${c.dim}... ${lines.length - maxLines} more lines${c.reset}\n`;
  }

  output += '\n' + line() + '\n';
  output += `${c.dim}b back · q quit${c.reset}\n`;

  return output;
}

// Handle keyboard input
function handleKey(str, key) {
  // Global keys (don't quit if user is typing in an input field)
  if (key.name === 'q' && !app.directInput && !app.inputValue && app.mode !== 'reject-input') {
    cleanup();
    process.exit(0);
  }

  // Tab switching (always available)
  if (key.name === 'left') {
    app.tabIndex = prevTab(app.tabIndex);
    resetTabState();
    render();
    return;
  }
  if (key.name === 'right') {
    app.tabIndex = nextTab(app.tabIndex);
    resetTabState();
    render();
    return;
  }

  // Settings shortcut: jump to System area's Settings sub-mode
  if (key.sequence === 's' && app.mode === 'list' && TABS[app.tabIndex].id === 'pipeline') {
    app.tabIndex = TABS.findIndex(t => t.id === 'system');
    app.toolMode = '3'; // Settings
    app.settingsTabIndex = 0;
    app.settingIndex = 0;
    render();
    return;
  }

  // Numeric area shortcuts (1-5)
  if (/^[1-5]$/.test(key.sequence) && app.mode === 'list') {
    const idx = parseInt(key.sequence, 10) - 1;
    if (idx < TABS.length) {
      app.tabIndex = idx;
      resetTabState();
      render();
      return;
    }
  }

  // Back navigation
  if ((key.name === 'b' || key.name === 'escape') && app.mode === 'view') {
    app.mode = 'list';
    app.viewContent = null;
    render();
    return;
  }

  // Delegate to tab module
  const currentTab = TABS[app.tabIndex];
  const tabModule = tabModules[currentTab.id];

  if (tabModule.handleKey && tabModule.handleKey(key, app)) {
    render();
    return;
  }
}

// Reset tab-specific state when switching tabs
function resetTabState() {
  app.mode = 'list';
  app.selectedIndex = 0;
  app.actionIndex = 0;
  app.selectedPlan = null;
  app.toolMode = null;
  app.viewContent = null;
  app.directInput = '';
  app.inputValue = '';

  // Reset tab-specific modules
  if (overviewTab.reset) overviewTab.reset();
}

// Handle window resize
function handleResize() {
  app.width = process.stdout.columns || 80;
  render();
}

// Auto-initialize CTOC for this project if it has not been set up yet.
// Opening the menu is the signal that the user wants CTOC in this project,
// so initialization happens automatically — there is no separate init
// command. The marker is a `.ctoc/` directory; initProject() is idempotent
// and skips any file that already exists. Fails open so the menu never
// blocks on an initialization problem.
function ensureInitialized(projectPath) {
  const root = projectPath || process.cwd();
  if (safeFs.existsSync(path.join(root, '.ctoc'))) return false;
  try {
    const { initProject } = require('../lib/init-project');
    initProject(root);
    return true;
  } catch {
    return false;
  }
}

// Main entry point
function main() {
  const justInitialized = ensureInitialized(app.projectPath);

  // Check for non-interactive JSON mode (subcommands passed as args)
  // Usage: node menu.js [browse functional | plan stage/file | validate stage/file | menu commands]
  const cliArgs = process.argv.slice(2);

  if (cliArgs.length > 0) {
    // Non-interactive JSON mode: delegate to menu-screens state machine
    // Split single-string args ("browse functional" → ["browse", "functional"])
    const { route } = require('../lib/menu-screens');
    const splitArgs = cliArgs.flatMap(arg => arg.split(/\s+/));
    const result = route(splitArgs, app.projectPath);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Check if running in interactive terminal
  if (process.stdin.isTTY) {
    // Full TUI mode
    process.stdout.on('resize', handleResize);
    startAutoSync(app.projectPath);
    process.on('exit', () => {
      stopAutoSync();
      cleanup();
    });
    setupKeyboard(handleKey);
    app.navStack.push('Overview');
    if (justInitialized) app.message = 'CTOC initialized for this project';
    render();
  } else {
    // Non-interactive with no args: JSON dashboard output for Claude.
    // The dashboard (plan overview across all phases) ALWAYS renders. When the
    // environment is not yet chosen, the environment question rides along as a
    // second question — it never replaces or gates the overview.
    const { route } = require('../lib/menu-screens');
    const result = route([], app.projectPath);
    if (needsEnvironmentPrompt(app.projectPath)) {
      attachEnvironmentQuestion(result);
    }
    if (justInitialized) {
      result.text = 'CTOC initialized for this project (automatic — no init command needed).\n\n' + result.text;
    }
    console.log(JSON.stringify(result, null, 2));
  }
}

// Run as a script; stay importable (without side effects) for tests.
if (require.main === module) {
  main();
}

module.exports = { ensureInitialized };

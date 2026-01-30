#!/usr/bin/env node
/**
 * CTOC Interactive Interface
 * Main entry point for /ctoc command
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { c, clear, line, renderTabs, renderTabIndicator, setupKeyboard, cleanup, renderBreadcrumb } = require('../lib/tui');
const { TABS, getTabNames, nextTab, prevTab } = require('../lib/tabs');
const { NavStack } = require('../lib/state');
const { startAutoSync, stopAutoSync } = require('../lib/sync');

// Read version from VERSION file
const VERSION = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();

// Import tab modules
const overviewTab = require('../tabs/overview');
const functionalTab = require('../tabs/functional');
const implementationTab = require('../tabs/implementation');
const reviewTab = require('../tabs/review');
const todoTab = require('../tabs/todo');
const progressTab = require('../tabs/progress');
const toolsTab = require('../tabs/tools');

const tabModules = {
  overview: overviewTab,
  functional: functionalTab,
  implementation: implementationTab,
  review: reviewTab,
  todo: todoTab,
  progress: progressTab,
  tools: toolsTab
};

// Application state
const app = {
  projectPath: process.cwd(),
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
  } else if (currentTab.id === 'tools' && app.toolMode) {
    if (app.toolMode === '1') output += toolsTab.renderDoctor(app);
    else if (app.toolMode === '2') output += toolsTab.renderUpdate(app);
    else if (app.toolMode === '3') output += toolsTab.renderSettings(app);
  } else if (tabModule.render) {
    output += tabModule.render(app);
  }

  // Status message
  if (app.message) {
    output += `\n${c.green}${app.message}${c.reset}\n`;
    setTimeout(() => {
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

  displayLines.forEach(line => {
    output += line + '\n';
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
  // Global keys
  if (key.name === 'q') {
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

  // Settings shortcut (Overview tab only)
  if (key.sequence === 's' && app.mode === 'list' && TABS[app.tabIndex].id === 'overview') {
    app.tabIndex = TABS.findIndex(t => t.id === 'tools');
    app.toolMode = '3'; // Settings
    app.settingsTabIndex = 0;
    app.settingIndex = 0;
    render();
    return;
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

// Render static status for non-interactive mode
function renderStatic() {
  const { getPlanCounts, getAgentStatus } = require('../lib/state');
  const counts = getPlanCounts(app.projectPath);
  const agent = getAgentStatus(app.projectPath);

  let output = '';
  output += `${c.bold}CTOC${c.reset} ${c.dim}v${VERSION}${c.reset}\n\n`;

  output += `${c.bold}Plans${c.reset}\n`;
  output += `  Functional      ${c.cyan}${counts.functional}${c.reset} drafts\n`;
  output += `  Implementation  ${c.cyan}${counts.implementation}${c.reset} drafts\n`;
  output += `  Review          ${c.cyan}${counts.review}${c.reset} pending\n`;
  output += `  Todo            ${c.cyan}${counts.todo}${c.reset} queued\n`;
  output += `  In Progress     ${c.cyan}${counts.inProgress}${c.reset} active\n\n`;

  output += line() + '\n\n';

  output += `${c.bold}Agent Status${c.reset}\n`;
  if (agent.active) {
    output += `  ${c.green}●${c.reset} Running       ${c.bold}${agent.name}${c.reset}\n`;
    output += `                  Step ${agent.step}/15 ${c.cyan}${agent.phase}${c.reset}\n`;
    if (agent.task) {
      output += `                  Task: ${agent.task}\n`;
    }
    if (agent.elapsed) {
      output += `                  Elapsed: ${c.dim}${agent.elapsed}${c.reset}\n`;
    }
  } else {
    output += `  ${c.dim}○ Idle          No implementation in progress${c.reset}\n`;
  }

  output += '\n';
  output += `${c.dim}Run directly in terminal for interactive mode${c.reset}\n`;

  console.log(output);
}

// Main entry point
function main() {
  // Non-interactive mode: print static status and exit
  if (!process.stdin.isTTY) {
    renderStatic();
    process.exit(0);
  }

  // Handle resize
  process.stdout.on('resize', handleResize);

  // Start auto-sync
  startAutoSync(app.projectPath);

  // Cleanup on exit
  process.on('exit', () => {
    stopAutoSync();
    cleanup();
  });

  // Setup keyboard
  setupKeyboard(handleKey);

  // Initial render
  app.navStack.push('Overview');
  render();
}

// Run
main();

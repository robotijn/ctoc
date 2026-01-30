#!/usr/bin/env node
/**
 * CTOC Interactive Interface
 * Main entry point for /ctoc command
 */

const readline = require('readline');
const { c, clear, line, renderTabs, renderTabIndicator, setupKeyboard, cleanup, renderBreadcrumb } = require('../lib/tui');
const { TABS, getTabNames, nextTab, prevTab } = require('../lib/tabs');
const { NavStack } = require('../lib/state');

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
}

// Handle window resize
function handleResize() {
  app.width = process.stdout.columns || 80;
  render();
}

// Main entry point
function main() {
  // Handle resize
  process.stdout.on('resize', handleResize);

  // Setup keyboard
  setupKeyboard(handleKey);

  // Initial render
  app.navStack.push('Overview');
  render();
}

// Run
main();

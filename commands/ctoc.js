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

// Main entry point
function main() {
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
    render();
  } else {
    // Non-interactive: rich status display for Claude
    const { getPlanCounts, getAgentStatus, readPlans, getPlansDir } = require('../lib/state');
    const counts = getPlanCounts(app.projectPath);
    const agent = getAgentStatus(app.projectPath);

    // Read plans from each directory
    const plansDir = getPlansDir(app.projectPath);
    const plans = {
      functional: readPlans(plansDir, 'functional', 'draft'),
      implementation: readPlans(plansDir, 'implementation', 'draft'),
      review: readPlans(plansDir, 'implementation', 'review'),
      todo: readPlans(plansDir, 'implementation', 'approved'),
      inProgress: readPlans(plansDir, 'implementation', 'in-progress'),
      done: readPlans(plansDir, 'implementation', 'done')
    };

    // Build rich status output
    let out = '';
    out += `CTOC v${VERSION}\n`;
    out += `${'─'.repeat(60)}\n\n`;

    // Pipeline overview
    out += `PIPELINE\n`;
    out += `  Functional      ${counts.functional} drafts\n`;
    out += `  Implementation  ${counts.implementation} drafts\n`;
    out += `  Review          ${counts.review} pending\n`;
    out += `  Todo            ${counts.todo} queued\n`;
    out += `  In Progress     ${counts.inProgress} active\n`;
    out += `  Done            ${counts.done || 0} completed\n\n`;

    // Agent status
    out += `AGENT\n`;
    if (agent.active) {
      out += `  ● Active: ${agent.name}\n`;
      out += `    Step ${agent.step}/15 - ${agent.phase}\n`;
      if (agent.task) out += `    Task: ${agent.task}\n`;
    } else {
      out += `  ○ Idle\n`;
    }
    out += '\n';

    // List actual plans if any exist
    if (plans.functional.length > 0) {
      out += `FUNCTIONAL DRAFTS\n`;
      plans.functional.forEach((p, i) => out += `  ${i+1}. ${p.title || p.name}\n`);
      out += '\n';
    }
    if (plans.implementation.length > 0) {
      out += `IMPLEMENTATION DRAFTS\n`;
      plans.implementation.forEach((p, i) => out += `  ${i+1}. ${p.title || p.name}\n`);
      out += '\n';
    }
    if (plans.review.length > 0) {
      out += `REVIEW QUEUE\n`;
      plans.review.forEach((p, i) => out += `  ${i+1}. ${p.title || p.name}\n`);
      out += '\n';
    }
    if (plans.todo.length > 0) {
      out += `TODO QUEUE\n`;
      plans.todo.forEach((p, i) => out += `  ${i+1}. ${p.title || p.name}\n`);
      out += '\n';
    }
    if (plans.inProgress.length > 0) {
      out += `IN PROGRESS\n`;
      plans.inProgress.forEach((p, i) => out += `  ${i+1}. ${p.title || p.name}\n`);
      out += '\n';
    }

    // Recommended actions based on state
    out += `${'─'.repeat(60)}\n`;
    out += `RECOMMENDED ACTIONS\n`;

    if (counts.functional === 0 && counts.implementation === 0 && counts.todo === 0) {
      out += `  → "create functional plan" - start a new feature\n`;
    }
    if (counts.functional > 0) {
      out += `  → "show functional plans" - view drafts\n`;
      out += `  → "approve functional plan [name]" - move to implementation\n`;
    }
    if (counts.implementation > 0) {
      out += `  → "show implementation plans" - view drafts\n`;
      out += `  → "start implementation [name]" - begin work\n`;
    }
    if (counts.review > 0) {
      out += `  → "show review queue" - see pending reviews\n`;
      out += `  → "approve review [name]" - approve for implementation\n`;
    }
    if (counts.todo > 0) {
      out += `  → "show todo" - see queued work\n`;
      out += `  → "start next" - begin next queued item\n`;
    }
    if (agent.active) {
      out += `  → "show progress" - see current implementation status\n`;
    }
    out += `  → "release" - bump version (patch/minor/major)\n`;
    out += `  → "update" - update CTOC to latest\n`;
    out += `  → "settings" - view/change settings\n`;

    console.log(out);
  }
}

// Run
main();

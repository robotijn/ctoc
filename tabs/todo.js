/**
 * Todo Tab
 * FIFO queue for agent work
 */

const path = require('path');
const { c, line, renderList, renderActionMenu, renderFooter } = require('../lib/tui');
const { readPlans, getPlansDir } = require('../lib/state');
const { moveUpInQueue, moveDownInQueue, removeFromQueue } = require('../lib/actions');

const ACTIONS = [
  { key: '1', label: 'View' },
  { key: '2', label: 'Move up' },
  { key: '3', label: 'Move down' },
  { key: '4', label: 'Remove → back to implementation draft' }
];

function render(app) {
  const plansDir = path.join(getPlansDir(app.projectPath), 'todo');
  const plans = readPlans(plansDir); // Already sorted FIFO (oldest first)

  let output = '\n';
  output += `${c.bold}Todo Queue${c.reset}`;

  const countStr = `${plans.length} queued`;
  const padding = app.width - 12 - countStr.length;
  output += ' '.repeat(Math.max(1, padding)) + `${c.cyan}${countStr}${c.reset}\n`;
  output += `${c.dim}Agent picks oldest first (FIFO)${c.reset}\n\n`;

  if (plans.length === 0) {
    output += `${c.dim}No plans in queue.${c.reset}\n\n`;
    output += `Approve an implementation plan to add it here.\n\n`;
    output += renderFooter(['←/→ tabs', 'q quit']);
  } else {
    output += renderList(plans, app.selectedIndex);
    output += '\n';
    output += renderFooter(['←/→ tabs', '↑/↓ nav', 'Enter select', 'q quit']);
  }

  return output;
}

function renderActions(app, plan) {
  return renderActionMenu(plan.name, ACTIONS, app.actionIndex);
}

function handleKey(key, app) {
  const plansDir = path.join(getPlansDir(app.projectPath), 'todo');
  const plans = readPlans(plansDir);

  if (plans.length === 0) return false;

  // List navigation
  if (app.mode === 'list') {
    if (key.name === 'up') {
      app.selectedIndex = Math.max(0, app.selectedIndex - 1);
      return true;
    }
    if (key.name === 'down') {
      app.selectedIndex = Math.min(plans.length - 1, app.selectedIndex + 1);
      return true;
    }
    if (key.name === 'return') {
      app.mode = 'actions';
      app.actionIndex = 0;
      app.selectedPlan = plans[app.selectedIndex];
      return true;
    }
    const num = parseInt(key.sequence, 10);
    if (num >= 1 && num <= plans.length) {
      app.selectedIndex = num - 1;
      app.mode = 'actions';
      app.actionIndex = 0;
      app.selectedPlan = plans[app.selectedIndex];
      return true;
    }
  }

  // Action menu
  if (app.mode === 'actions') {
    if (key.name === 'escape' || key.name === 'b') {
      app.mode = 'list';
      return true;
    }
    if (key.name === 'up') {
      app.actionIndex = Math.max(0, app.actionIndex - 1);
      return true;
    }
    if (key.name === 'down') {
      app.actionIndex = Math.min(ACTIONS.length - 1, app.actionIndex + 1);
      return true;
    }
    if (key.name === 'return' || (key.sequence >= '1' && key.sequence <= '4')) {
      const actionKey = key.name === 'return' ? ACTIONS[app.actionIndex].key : key.sequence;
      return executeAction(actionKey, app, plans);
    }
  }

  return false;
}

function executeAction(actionKey, app, plans) {
  switch (actionKey) {
    case '1': // View
      app.mode = 'view';
      app.viewContent = app.selectedPlan.content;
      return true;
    case '2': // Move up
      if (moveUpInQueue(app.selectedPlan.path, app.projectPath)) {
        app.selectedIndex = Math.max(0, app.selectedIndex - 1);
        app.message = `✓ ${app.selectedPlan.name} moved up`;
      }
      app.mode = 'list';
      return true;
    case '3': // Move down
      if (moveDownInQueue(app.selectedPlan.path, app.projectPath)) {
        app.selectedIndex = Math.min(plans.length - 1, app.selectedIndex + 1);
        app.message = `✓ ${app.selectedPlan.name} moved down`;
      }
      app.mode = 'list';
      return true;
    case '4': // Remove
      removeFromQueue(app.selectedPlan.path, app.projectPath);
      app.mode = 'list';
      app.selectedIndex = Math.max(0, app.selectedIndex - 1);
      app.message = `✓ ${app.selectedPlan.name} removed → back to implementation draft`;
      return true;
  }
  return false;
}

module.exports = { render, renderActions, handleKey };

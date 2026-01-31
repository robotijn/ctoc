/**
 * Implementation Tab
 * Manage implementation plan drafts
 */

const path = require('path');
const { c, line, renderList, renderActionMenu, renderFooter } = require('../lib/tui');
const { readPlans, getPlansDir } = require('../lib/state');
const { approvePlan, renamePlan, deletePlan } = require('../lib/actions');

const ACTIONS = [
  { key: '1', label: 'View' },
  { key: '2', label: 'Plan' },
  { key: '3', label: 'Approve → apply Iron Loop → todo queue' },
  { key: '4', label: 'Rename' },
  { key: '5', label: 'Delete' }
];

function render(app) {
  const plansDir = path.join(getPlansDir(app.projectPath), 'implementation');
  const plans = readPlans(plansDir);

  let output = '\n';
  output += `${c.bold}Implementation Plans${c.reset}`;

  const countStr = `${plans.length} drafts`;
  const padding = app.width - 22 - countStr.length;
  output += ' '.repeat(Math.max(1, padding)) + `${c.cyan}${countStr}${c.reset}\n\n`;

  if (plans.length === 0) {
    output += `${c.dim}No implementation plans yet.${c.reset}\n\n`;
    output += `Plans move here after approving a functional plan.\n\n`;
    output += renderFooter(['←/→ tabs', 'q quit']);
  } else {
    output += renderList(plans, app.selectedIndex);
    output += '\n';
    output += renderFooter(['←/→ tabs', '↑/↓ nav', 'Enter select', 'n new', 'q quit']);
  }

  return output;
}

function renderActions(app, plan) {
  return renderActionMenu(plan.name, ACTIONS, app.actionIndex);
}

function handleKey(key, app) {
  const plansDir = path.join(getPlansDir(app.projectPath), 'implementation');
  const plans = readPlans(plansDir);

  if (plans.length === 0) {
    return false;
  }

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
    // Number jump
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
    if (key.name === 'escape' || key.name === 'b' || key.sequence === '0') {
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
    if (key.name === 'return' || (key.sequence >= '1' && key.sequence <= '5')) {
      const actionKey = key.name === 'return' ? ACTIONS[app.actionIndex].key : key.sequence;
      return executeAction(actionKey, app);
    }
  }

  return false;
}

function executeAction(actionKey, app) {
  switch (actionKey) {
    case '1': // View
      app.mode = 'view';
      app.viewContent = app.selectedPlan.content;
      return true;
    case '2': // Plan
      app.mode = 'edit';
      return true;
    case '3': // Approve → Iron Loop → Todo
      approvePlan(app.selectedPlan.path, app.projectPath);
      app.mode = 'list';
      app.message = `✓ ${app.selectedPlan.name} → Iron Loop applied → added to todo queue`;
      return true;
    case '4': // Rename
      app.mode = 'rename';
      app.inputValue = app.selectedPlan.name;
      return true;
    case '5': // Delete
      app.mode = 'confirm-delete';
      return true;
  }
  return false;
}

module.exports = { render, renderActions, handleKey };

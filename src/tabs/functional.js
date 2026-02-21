/**
 * Functional Tab
 * Manage functional plan drafts
 */

const path = require('path');
const { c, line, renderList, renderActionMenu, renderConfirm, renderFooter } = require('../lib/tui');
const { readPlans, getPlansDir } = require('../lib/state');
const { approvePlan, renamePlan, deletePlan, assignDirectly, initResearchAgent } = require('../lib/actions');
const { readStatus, getStatusIcon } = require('../lib/background');

const ACTIONS = [
  { key: '1', label: 'View' },
  { key: '2', label: 'Plan' },
  { key: '3', label: 'Approve → implementation draft' },
  { key: '4', label: 'Rename' },
  { key: '5', label: 'Delete' },
  { separator: true },
  { key: '6', label: 'Assign (skips impl planning)', danger: true }
];

function render(app) {
  const plansDir = path.join(getPlansDir(app.projectPath), 'functional');
  const plans = readPlans(plansDir);

  let output = '\n';
  output += `${c.bold}Functional Plans${c.reset}`;

  const countStr = `${plans.length} drafts`;
  const padding = app.width - 18 - countStr.length;
  output += ' '.repeat(Math.max(1, padding)) + `${c.cyan}${countStr}${c.reset}\n\n`;

  if (plans.length === 0) {
    output += `${c.dim}No functional plans yet.${c.reset}\n\n`;
    output += `Press ${c.bold}n${c.reset} to create a new plan.\n\n`;
    output += renderFooter(['←/→ tabs', 'n new', 'q quit']);
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

function renderAssignConfirm(plan) {
  const message = `This skips implementation planning.

The plan will be:
  ${c.cyan}→${c.reset} Converted to ${c.bold}Iron Loop${c.reset} integrated plan
  ${c.cyan}→${c.reset} Added to the ${c.green}todo queue${c.reset}
  ${c.cyan}→${c.reset} Picked up when an agent is available`;

  return renderConfirm(
    '⚠️  Assign directly to implementation?',
    message,
    [
      { label: 'Yes, add to todo', danger: true },
      { label: 'No, go back' }
    ]
  );
}

function handleKey(key, app) {
  const plansDir = path.join(getPlansDir(app.projectPath), 'functional');
  const plans = readPlans(plansDir);

  if (plans.length === 0) {
    if (key.name === 'n') {
      app.mode = 'new-plan';
      app.planType = 'functional';
      return true;
    }
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
    if (key.name === 'n') {
      app.mode = 'new-plan';
      app.planType = 'functional';
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
      if (ACTIONS[app.actionIndex].separator) app.actionIndex--;
      return true;
    }
    if (key.name === 'down') {
      app.actionIndex = Math.min(ACTIONS.length - 1, app.actionIndex + 1);
      if (ACTIONS[app.actionIndex].separator) app.actionIndex++;
      return true;
    }
    if (key.name === 'return' || (key.sequence >= '1' && key.sequence <= '6')) {
      const actionKey = key.name === 'return' ? ACTIONS[app.actionIndex].key : key.sequence;
      return executeAction(actionKey, app);
    }
  }

  // Assign confirmation
  if (app.mode === 'confirm-assign') {
    if (key.sequence === '1') {
      assignDirectly(app.selectedPlan.path, app.projectPath);
      app.mode = 'list';
      app.message = `✓ ${app.selectedPlan.name} added to todo queue`;
      return true;
    }
    if (key.sequence === '2' || key.name === 'escape') {
      app.mode = 'actions';
      return true;
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
    case '3': // Approve
      const result = approvePlan(app.selectedPlan.path, app.projectPath);
      app.mode = 'list';
      if (result.backgroundAgent) {
        app.message = `✓ ${app.selectedPlan.name} → implementation. Spawning ${result.backgroundAgent}...`;
      } else {
        app.message = `✓ ${app.selectedPlan.name} moved to implementation drafts`;
      }
      return true;
    case '4': // Rename
      app.mode = 'rename';
      app.inputValue = app.selectedPlan.name;
      return true;
    case '5': // Delete
      app.mode = 'confirm-delete';
      return true;
    case '6': // Assign (dangerous)
      app.mode = 'confirm-assign';
      return true;
  }
  return false;
}

module.exports = { render, renderActions, renderAssignConfirm, handleKey };

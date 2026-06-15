/**
 * Review Tab
 * Review completed implementations
 */

const path = require('path');
const { c, line, renderList, renderActionMenu, renderInput, renderFooter } = require('../lib/tui');
const { readPlans, getPlansDir } = require('../lib/state');
const { approvePlan, rejectPlan } = require('../lib/actions');

const ACTIONS = [
  { key: '1', label: 'View functional plan' },
  { key: '2', label: 'View implementation plan' },
  { key: '3', label: 'View AI review summary' },
  { key: '4', label: 'View code changes' },
  { separator: true },
  { key: '5', label: 'Approve → done' },
  { key: '6', label: 'Reject → provide feedback' }
];

function render(app) {
  const plansDir = path.join(getPlansDir(app.projectPath), 'review');
  const plans = readPlans(plansDir);

  let output = '\n';
  output += `${c.bold}Awaiting Review${c.reset}`;

  const countStr = `${plans.length} pending`;
  const padding = app.width - 18 - countStr.length;
  output += ' '.repeat(Math.max(1, padding)) + `${c.cyan}${countStr}${c.reset}\n\n`;

  if (plans.length === 0) {
    output += `${c.dim}No items awaiting review.${c.reset}\n\n`;
    output += `Items move here after agent completes implementation.\n\n`;
    output += renderFooter(['←/→ tabs', 'q quit']);
  } else {
    output += renderList(plans, app.selectedIndex);
    output += '\n';
    output += renderFooter(['←/→ tabs', '↑/↓ nav', 'Enter select', 'q quit']);
  }

  return output;
}

function renderActions(app, plan) {
  let output = renderActionMenu(plan.name, ACTIONS, app.actionIndex);
  output += `\n${c.dim}or type feedback directly: ${c.reset}`;
  if (app.directInput) {
    output += app.directInput + '_';
  } else {
    output += '_';
  }
  return output;
}

function renderRejectInput(app) {
  return renderInput(
    `${c.bold}Reject: ${app.selectedPlan.name}${c.reset}\n${line()}\n\nWhat needs to be fixed?`,
    app.inputValue || ''
  );
}

function handleKey(key, app) {
  const plansDir = path.join(getPlansDir(app.projectPath), 'review');
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
      app.directInput = '';
      return true;
    }
    const num = parseInt(key.sequence, 10);
    if (num >= 1 && num <= plans.length) {
      app.selectedIndex = num - 1;
      app.mode = 'actions';
      app.actionIndex = 0;
      app.selectedPlan = plans[app.selectedIndex];
      app.directInput = '';
      return true;
    }
  }

  // Action menu with direct typing
  if (app.mode === 'actions') {
    if (key.name === 'escape' || key.name === 'b' || key.sequence === '0') {
      app.mode = 'list';
      app.directInput = '';
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
    if (key.name === 'return') {
      if (app.directInput && app.directInput.length > 0) {
        // Direct feedback = reject
        rejectPlan(app.selectedPlan.path, app.directInput, app.projectPath);
        app.mode = 'list';
        app.message = `✓ ${app.selectedPlan.name} rejected → moved to functional drafts`;
        app.directInput = '';
        return true;
      }
      return executeAction(ACTIONS[app.actionIndex].key, app);
    }
    if (key.sequence >= '1' && key.sequence <= '6' && !app.directInput) {
      return executeAction(key.sequence, app);
    }
    // Direct typing for feedback
    if (key.name === 'backspace') {
      app.directInput = (app.directInput || '').slice(0, -1);
      return true;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      app.directInput = (app.directInput || '') + key.sequence;
      return true;
    }
  }

  // Reject input mode
  if (app.mode === 'reject-input') {
    if (key.name === 'escape') {
      app.mode = 'actions';
      app.inputValue = '';
      return true;
    }
    if (key.name === 'return' && app.inputValue) {
      rejectPlan(app.selectedPlan.path, app.inputValue, app.projectPath);
      app.mode = 'list';
      app.message = `✓ ${app.selectedPlan.name} rejected → moved to functional drafts`;
      app.inputValue = '';
      return true;
    }
    if (key.name === 'backspace') {
      app.inputValue = (app.inputValue || '').slice(0, -1);
      return true;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      app.inputValue = (app.inputValue || '') + key.sequence;
      return true;
    }
  }

  return false;
}

function executeAction(actionKey, app) {
  switch (actionKey) {
    case '1': // View functional plan
      app.mode = 'view';
      app.viewType = 'functional';
      return true;
    case '2': // View implementation plan
      app.mode = 'view';
      app.viewType = 'implementation';
      return true;
    case '3': // View AI summary
      app.mode = 'view';
      app.viewType = 'ai-summary';
      return true;
    case '4': // View code changes
      app.mode = 'view';
      app.viewType = 'code-changes';
      return true;
    case '5': // Approve
      approvePlan(app.selectedPlan.path, app.projectPath);
      app.mode = 'list';
      app.message = `✓ ${app.selectedPlan.name} approved → done`;
      return true;
    case '6': // Reject
      app.mode = 'reject-input';
      app.inputValue = '';
      return true;
  }
  return false;
}

module.exports = { render, renderActions, renderRejectInput, handleKey };

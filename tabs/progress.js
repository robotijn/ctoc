/**
 * Progress Tab
 * In-progress and finished items
 */

const path = require('path');
const { c, line, renderActionMenu, renderFooter } = require('../lib/tui');
const { getAgentStatus, getFinishedItems, getSettings } = require('../lib/state');

const ACTIONS = [
  { key: '1', label: 'View' }
];

function render(app) {
  const agent = getAgentStatus(app.projectPath);
  const settings = getSettings(app.projectPath);
  const finished = getFinishedItems(app.projectPath, settings.finishedItemsToShow);

  let output = '\n';

  // In Progress section
  output += `${c.bold}In Progress${c.reset}`;
  const activeCount = agent.active ? 1 : 0;
  const activeStr = `${activeCount} active`;
  const padding1 = app.width - 13 - activeStr.length;
  output += ' '.repeat(Math.max(1, padding1)) + `${c.cyan}${activeStr}${c.reset}\n\n`;

  if (agent.active) {
    output += `  ${c.green}●${c.reset} ${c.bold}${agent.name}${c.reset}\n`;
    output += `    Step ${agent.step}/15 ${c.cyan}${agent.phase}${c.reset}\n`;
    if (agent.task) output += `    Task: ${agent.task}\n`;
    if (agent.elapsed) output += `    Elapsed: ${c.dim}${agent.elapsed}${c.reset}\n`;
  } else {
    output += `  ${c.dim}○ Idle — waiting for items in todo queue${c.reset}\n`;
  }

  output += '\n' + line() + '\n\n';

  // Finished section
  output += `${c.bold}Finished${c.reset}`;
  const finishedTotal = finished.length;
  const showingStr = finishedTotal > 0 ? `showing ${Math.min(finishedTotal, settings.finishedItemsToShow)} of ${finishedTotal}` : '0 items';
  const padding2 = app.width - 10 - showingStr.length;
  output += ' '.repeat(Math.max(1, padding2)) + `${c.dim}${showingStr}${c.reset}\n\n`;

  if (finished.length === 0) {
    output += `  ${c.dim}No completed items yet.${c.reset}\n`;
  } else {
    // Scrollable list with numbers
    const startIdx = app.finishedOffset || 0;
    const visible = finished.slice(startIdx, startIdx + 5);

    if (startIdx > 0) {
      output += `${' '.repeat(app.width - 8)}${c.dim}↑ more${c.reset}\n`;
    }

    visible.forEach((item, i) => {
      const num = startIdx + i + 1;
      const arrow = app.finishedIndex === startIdx + i ? '→' : ' ';
      const nameWidth = app.width - 30;
      const name = item.name.length > nameWidth ? item.name.slice(0, nameWidth - 3) + '...' : item.name;
      output += `${arrow} ${c.green}✓${c.reset} ${num}. ${name.padEnd(nameWidth)} ${c.dim}completed ${item.ago}${c.reset}\n`;
    });

    if (startIdx + 5 < finished.length) {
      output += `${' '.repeat(app.width - 8)}${c.dim}↓ more${c.reset}\n`;
    }
  }

  output += '\n';
  output += renderFooter(['←/→ tabs', '↑/↓ scroll finished', 'Enter view', 'q quit']);

  return output;
}

function renderActions(app, item) {
  return renderActionMenu(item.name, ACTIONS, 0);
}

function handleKey(key, app) {
  const settings = getSettings(app.projectPath);
  const finished = getFinishedItems(app.projectPath, settings.finishedItemsToShow);

  if (!app.finishedOffset) app.finishedOffset = 0;
  if (!app.finishedIndex) app.finishedIndex = 0;

  if (app.mode === 'list') {
    if (key.name === 'up' && finished.length > 0) {
      app.finishedIndex = Math.max(0, app.finishedIndex - 1);
      if (app.finishedIndex < app.finishedOffset) {
        app.finishedOffset = app.finishedIndex;
      }
      return true;
    }
    if (key.name === 'down' && finished.length > 0) {
      app.finishedIndex = Math.min(finished.length - 1, app.finishedIndex + 1);
      if (app.finishedIndex >= app.finishedOffset + 5) {
        app.finishedOffset = app.finishedIndex - 4;
      }
      return true;
    }
    if (key.name === 'return' && finished.length > 0) {
      app.mode = 'view';
      app.viewContent = finished[app.finishedIndex].content;
      app.selectedPlan = finished[app.finishedIndex];
      return true;
    }
    const num = parseInt(key.sequence, 10);
    if (num >= 1 && num <= finished.length) {
      app.finishedIndex = num - 1;
      app.mode = 'view';
      app.viewContent = finished[app.finishedIndex].content;
      app.selectedPlan = finished[app.finishedIndex];
      return true;
    }
  }

  if (app.mode === 'view') {
    if (key.name === 'escape' || key.name === 'b') {
      app.mode = 'list';
      return true;
    }
  }

  return false;
}

module.exports = { render, renderActions, handleKey };

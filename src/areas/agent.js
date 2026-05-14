/**
 * Agent Area (A3.2 / CTOC v7)
 *
 * Agent control center: status, active plan, step, token budget, schedule.
 * Folds the legacy `progress` tab and parts of `tools`.
 */

const { c, line, renderFooter } = require('../lib/tui');
const { getAgentStatus } = require('../lib/state');

function render(app) {
  const root = app.projectPath || process.cwd();
  const agent = getAgentStatus(root);

  let out = '\n';
  out += `${c.bold}Agent${c.reset}\n\n`;

  if (agent.active) {
    out += `  ${c.green}●${c.reset} ${c.bold}Active${c.reset}\n`;
    out += `  Plan       ${c.cyan}${agent.plan || 'unknown'}${c.reset}\n`;
    if (agent.step)    out += `  Step       ${agent.step}/16  ${c.cyan}${agent.phase || ''}${c.reset}\n`;
    if (agent.task)    out += `  Task       ${agent.task}\n`;
    if (agent.elapsed) out += `  Elapsed    ${c.dim}${agent.elapsed}${c.reset}\n`;
    if (agent.pid)     out += `  PID        ${c.dim}${agent.pid}${c.reset}\n`;
    out += '\n';
    out += `  ${c.dim}Press 's' to request stop (graceful — after current plan)${c.reset}\n`;
  } else if (agent.stale) {
    out += `  ${c.yellow}⚠${c.reset} ${c.bold}Stale lock${c.reset}\n`;
    out += `  Plan was: ${c.dim}${agent.stalePlan || 'unknown'}${c.reset} (process died)\n`;
    out += `  ${c.dim}Run /ctoc:menu to clean up.${c.reset}\n`;
  } else {
    out += `  ${c.dim}○ Idle${c.reset}\n`;
    out += `  No active plan. Queue is processed by the next /ctoc:start.\n`;
    out += '\n';
    out += `  ${c.dim}Press 'g' to start the agent on the next todo plan${c.reset}\n`;
  }

  out += '\n' + line() + '\n';
  out += renderFooter(['g start', 's stop', '←/→ areas', 'q quit']);
  return out;
}

function handleKey(_key, _app) {
  // Real start/stop wiring lives in actions.js — left as a follow-up
  // (the agent can be controlled via /ctoc:menu in the meantime).
  return false;
}

module.exports = { render, handleKey };

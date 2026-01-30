/**
 * Overview Tab
 * Shows plan counts and agent status
 */

const { c, line, renderFooter } = require('../lib/tui');
const { getPlanCounts, getAgentStatus } = require('../lib/state');

function render(projectPath = process.cwd()) {
  const counts = getPlanCounts(projectPath);
  const agent = getAgentStatus(projectPath);
  const version = getVersion();

  let output = '\n';
  output += `${c.bold}CTOC${c.reset} ${c.dim}v${version}${c.reset}\n\n`;

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
  output += renderFooter(['←/→ tabs', 'q quit', '? help']);

  return output;
}

function getVersion() {
  try {
    const fs = require('fs');
    const path = require('path');
    const versionFile = path.join(__dirname, '..', '..', 'VERSION');
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

function handleKey(key, app) {
  // Overview has no special key handling
  return false;
}

module.exports = { render, handleKey };

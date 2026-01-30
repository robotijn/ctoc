/**
 * Overview Tab
 * Shows plan counts, agent status, and release controls
 */

const { c, line, renderFooter } = require('../lib/tui');
const { getPlanCounts, getAgentStatus } = require('../lib/state');
const { getVersion, bump } = require('../lib/version');

// Release mode state
let releaseMode = false;
let releaseTypeIndex = 0;
const RELEASE_TYPES = ['patch', 'minor', 'major'];

function render(app) {
  const projectPath = app.projectPath || process.cwd();
  const counts = getPlanCounts(projectPath);
  const agent = getAgentStatus(projectPath);
  const version = getVersion();

  let output = '\n';
  output += `${c.bold}CTOC${c.reset} ${c.dim}v${version}${c.reset}\n\n`;

  // Release section - prominent at the top
  output += renderReleaseSection(version);
  output += '\n';

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

  if (releaseMode) {
    output += renderFooter(['←/→ type', 'Enter release', 'Esc cancel']);
  } else {
    output += renderFooter(['r release', '←/→ tabs', 's settings', 'q quit']);
  }

  return output;
}

function renderReleaseSection(currentVersion) {
  let output = '';

  // Box top
  output += `${c.cyan}┌${'─'.repeat(40)}┐${c.reset}\n`;

  if (releaseMode) {
    // Interactive release mode
    const nextVersion = bump(currentVersion, RELEASE_TYPES[releaseTypeIndex]);

    output += `${c.cyan}│${c.reset} ${c.bold}${c.yellow}⚡ RELEASE${c.reset}                             ${c.cyan}│${c.reset}\n`;
    output += `${c.cyan}│${c.reset}                                        ${c.cyan}│${c.reset}\n`;
    output += `${c.cyan}│${c.reset}   Current:  ${c.dim}${currentVersion}${c.reset}${' '.repeat(26 - currentVersion.length)}${c.cyan}│${c.reset}\n`;
    output += `${c.cyan}│${c.reset}   Next:     ${c.bold}${c.green}${nextVersion}${c.reset}${' '.repeat(26 - nextVersion.length)}${c.cyan}│${c.reset}\n`;
    output += `${c.cyan}│${c.reset}                                        ${c.cyan}│${c.reset}\n`;

    // Type selector
    let typeRow = '   ';
    RELEASE_TYPES.forEach((type, i) => {
      if (i === releaseTypeIndex) {
        typeRow += `${c.bgCyan}${c.black} ${type} ${c.reset} `;
      } else {
        typeRow += `${c.dim} ${type} ${c.reset} `;
      }
    });
    output += `${c.cyan}│${c.reset}${typeRow}${' '.repeat(40 - typeRow.replace(/\x1b\[[0-9;]*m/g, '').length)}${c.cyan}│${c.reset}\n`;
  } else {
    // Normal view
    const nextPatch = bump(currentVersion, 'patch');

    output += `${c.cyan}│${c.reset} ${c.bold}Release${c.reset}                   ${c.dim}press r${c.reset}  ${c.cyan}│${c.reset}\n`;
    output += `${c.cyan}│${c.reset}   ${c.dim}${currentVersion}${c.reset} → ${c.green}${nextPatch}${c.reset}${' '.repeat(28 - currentVersion.length - nextPatch.length)}${c.cyan}│${c.reset}\n`;
  }

  // Box bottom
  output += `${c.cyan}└${'─'.repeat(40)}┘${c.reset}\n`;

  return output;
}

function handleKey(key, app) {
  if (releaseMode) {
    // Release mode key handling
    if (key.name === 'escape' || key.name === 'b') {
      releaseMode = false;
      return true;
    }

    if (key.name === 'left') {
      releaseTypeIndex = (releaseTypeIndex - 1 + RELEASE_TYPES.length) % RELEASE_TYPES.length;
      return true;
    }

    if (key.name === 'right') {
      releaseTypeIndex = (releaseTypeIndex + 1) % RELEASE_TYPES.length;
      return true;
    }

    if (key.name === 'return') {
      // Execute release
      const { release } = require('../lib/version');
      const result = release(RELEASE_TYPES[releaseTypeIndex]);
      app.message = `Released v${result.newVersion}`;
      releaseMode = false;
      releaseTypeIndex = 0;
      return true;
    }

    return true; // Consume all keys in release mode
  }

  // Normal mode - 'r' opens release
  if (key.sequence === 'r') {
    releaseMode = true;
    releaseTypeIndex = 0; // Default to patch
    return true;
  }

  return false;
}

// Reset release mode when leaving tab
function reset() {
  releaseMode = false;
  releaseTypeIndex = 0;
}

module.exports = { render, handleKey, reset };

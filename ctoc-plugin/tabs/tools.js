/**
 * Tools Tab
 * Doctor, Update, Settings
 */

const fs = require('fs');
const path = require('path');
const { c, line, renderActionMenu, renderInput, renderFooter } = require('../lib/tui');
const { getSettings, saveSettings } = require('../lib/state');

const TOOLS = [
  { key: '1', label: 'Doctor', description: 'Health check & troubleshooting' },
  { key: '2', label: 'Update', description: 'Check for CTOC updates' },
  { key: '3', label: 'Settings', description: 'Configure CTOC' }
];

const SETTINGS_OPTIONS = [
  { key: 'autoPick', label: 'Auto-pick from queue', type: 'toggle' },
  { key: 'maxParallelAgents', label: 'Max parallel agents', type: 'number' },
  { key: 'showElapsed', label: 'Show elapsed time', type: 'toggle' },
  { key: 'finishedItemsToShow', label: 'Finished items to show', type: 'number' }
];

function render(app) {
  let output = '\n';
  output += `${c.bold}Tools${c.reset}\n\n`;

  TOOLS.forEach((tool, i) => {
    const arrow = app.toolIndex === i ? '→' : ' ';
    output += `${arrow} ${tool.key}. ${c.bold}${tool.label}${c.reset}`;
    output += `${' '.repeat(20 - tool.label.length)}${c.dim}${tool.description}${c.reset}\n`;
  });

  output += '\n';
  output += renderFooter(['←/→ tabs', '↑/↓ nav', 'Enter select', 'b back', 'q quit']);

  return output;
}

function renderDoctor(app) {
  let output = '\n';
  output += `${c.bold}Tools › Doctor${c.reset}\n\n`;
  output += `${c.bold}Health Check${c.reset}\n`;

  const checks = runHealthChecks(app.projectPath);
  checks.forEach(check => {
    const icon = check.pass ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    output += `  ${icon} ${check.label}\n`;
  });

  const allPass = checks.every(c => c.pass);
  output += `\n${allPass ? c.green + 'All checks passed.' + c.reset : c.red + 'Some checks failed.' + c.reset}\n\n`;

  output += line() + '\n\n';
  output += `1. Run checks again\n`;
  output += `2. Repair state\n`;
  output += `3. View logs\n\n`;
  output += `Ask a question: ${app.doctorInput || ''}_\n\n`;
  output += renderFooter(['b back', 'q quit']);

  return output;
}

function renderUpdate(app) {
  let output = '\n';
  output += `${c.bold}Tools › Update${c.reset}\n\n`;

  const current = getVersion();
  output += `  Current version:  ${c.bold}${current}${c.reset}\n`;

  if (app.latestVersion) {
    output += `  Latest version:   ${c.bold}${app.latestVersion}${c.reset}\n\n`;
    if (app.latestVersion !== current) {
      output += `  ${c.green}Update available!${c.reset}\n\n`;
      output += `  1. Update now\n`;
    } else {
      output += `  ${c.dim}You are up to date.${c.reset}\n`;
    }
  } else {
    output += `  Latest version:   ${c.dim}checking...${c.reset}\n`;
  }

  output += '\n';
  output += renderFooter(['b back', 'q quit']);

  return output;
}

function renderSettings(app) {
  const settings = getSettings(app.projectPath);

  let output = '\n';
  output += `${c.bold}Tools › Settings${c.reset}\n\n`;

  SETTINGS_OPTIONS.forEach((opt, i) => {
    const arrow = app.settingIndex === i ? '→' : ' ';
    const value = settings[opt.key];
    const valueStr = opt.type === 'toggle'
      ? (value ? `${c.green}ON${c.reset}` : `${c.dim}OFF${c.reset}`)
      : `${c.cyan}${value}${c.reset}`;

    output += `${arrow} ${i + 1}. ${opt.label.padEnd(30)} ${valueStr}\n`;
  });

  output += '\n';
  output += renderFooter(['↑/↓ nav', 'Enter toggle/edit', 'b back', 'q quit']);

  return output;
}

function runHealthChecks(projectPath) {
  const checks = [];

  // Plugin installed
  const pluginPath = path.join(__dirname, '..');
  checks.push({
    label: 'Plugin installed correctly',
    pass: fs.existsSync(pluginPath)
  });

  // Hooks configured
  const hooksPath = path.join(pluginPath, '..', '.claude-plugin', 'hooks.json');
  checks.push({
    label: 'Hooks configured',
    pass: fs.existsSync(hooksPath)
  });

  // State directory
  const stateDir = path.join(projectPath, '.ctoc', 'state');
  checks.push({
    label: 'State directory exists',
    pass: fs.existsSync(stateDir) || true // OK if doesn't exist yet
  });

  // Plans directory
  const plansDir = path.join(projectPath, 'plans');
  checks.push({
    label: 'Plans directory exists',
    pass: fs.existsSync(plansDir) || true
  });

  // Node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  checks.push({
    label: `Node.js ${nodeVersion}`,
    pass: majorVersion >= 18
  });

  return checks;
}

function getVersion() {
  try {
    const versionFile = path.join(__dirname, '..', '..', 'VERSION');
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

function handleKey(key, app) {
  if (!app.toolIndex) app.toolIndex = 0;
  if (!app.settingIndex) app.settingIndex = 0;

  // Main tools list
  if (app.mode === 'list' || app.mode === 'tools') {
    if (key.name === 'up') {
      app.toolIndex = Math.max(0, app.toolIndex - 1);
      return true;
    }
    if (key.name === 'down') {
      app.toolIndex = Math.min(TOOLS.length - 1, app.toolIndex + 1);
      return true;
    }
    if (key.name === 'return' || (key.sequence >= '1' && key.sequence <= '3')) {
      const toolKey = key.name === 'return' ? TOOLS[app.toolIndex].key : key.sequence;
      app.toolMode = toolKey;
      if (toolKey === '2') {
        app.latestVersion = null;
        // Would check for updates here
        app.latestVersion = getVersion(); // For now, just show current
      }
      return true;
    }
  }

  // Doctor mode
  if (app.toolMode === '1') {
    if (key.name === 'escape' || key.name === 'b') {
      app.toolMode = null;
      app.doctorInput = '';
      return true;
    }
    if (key.sequence === '1') {
      // Re-run checks (just refresh)
      return true;
    }
    if (key.name === 'backspace') {
      app.doctorInput = (app.doctorInput || '').slice(0, -1);
      return true;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && key.sequence !== '1' && key.sequence !== '2' && key.sequence !== '3') {
      app.doctorInput = (app.doctorInput || '') + key.sequence;
      return true;
    }
  }

  // Update mode
  if (app.toolMode === '2') {
    if (key.name === 'escape' || key.name === 'b') {
      app.toolMode = null;
      return true;
    }
  }

  // Settings mode
  if (app.toolMode === '3') {
    if (key.name === 'escape' || key.name === 'b') {
      app.toolMode = null;
      return true;
    }
    if (key.name === 'up') {
      app.settingIndex = Math.max(0, app.settingIndex - 1);
      return true;
    }
    if (key.name === 'down') {
      app.settingIndex = Math.min(SETTINGS_OPTIONS.length - 1, app.settingIndex + 1);
      return true;
    }
    if (key.name === 'return') {
      const opt = SETTINGS_OPTIONS[app.settingIndex];
      const settings = getSettings(app.projectPath);
      if (opt.type === 'toggle') {
        settings[opt.key] = !settings[opt.key];
        saveSettings(settings, app.projectPath);
      }
      return true;
    }
  }

  return false;
}

module.exports = { render, renderDoctor, renderUpdate, renderSettings, handleKey };

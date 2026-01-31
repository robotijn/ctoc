/**
 * Tools Tab
 * Doctor, Update, Settings (with sub-tabs)
 */

const fs = require('fs');
const path = require('path');
const { c, line, renderTabs, renderFooter } = require('../lib/tui');
const {
  SETTINGS_TABS,
  SETTINGS_SCHEMA,
  loadSettings,
  saveSettings,
  toggleSetting,
  setSetting,
  getCategorySchema
} = require('../lib/settings');
const { getLastSync, manualSync } = require('../lib/sync');

const TOOLS = [
  { key: '1', label: 'Doctor', description: 'Health check & troubleshooting' },
  { key: '2', label: 'Update', description: 'Check for CTOC updates' },
  { key: '3', label: 'Settings', description: 'Configure CTOC' }
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

  // Last sync info
  const lastSync = getLastSync();
  if (lastSync) {
    output += `${c.dim}Last sync: ${lastSync.toLocaleTimeString()}${c.reset}\n\n`;
  }

  output += line() + '\n\n';
  output += `1. Run checks again\n`;
  output += `2. Repair state\n`;
  output += `3. Sync now\n`;
  output += `4. View logs\n\n`;
  output += `Ask a question: ${app.doctorInput || ''}_\n\n`;
  output += renderFooter(['b back', 'q quit']);

  return output;
}

function renderUpdate(app) {
  let output = '\n';
  output += `${c.bold}Tools › Update${c.reset}\n\n`;

  const current = getVersion();
  output += `  Current version:  ${c.bold}${current}${c.reset}\n\n`;

  if (app.updateMessage) {
    output += `  ${app.updateMessage}\n\n`;
  } else {
    output += `  1. ${c.bold}Force update${c.reset} - Clear cache and reinstall\n\n`;
    output += `  ${c.dim}This clears the plugin cache and prompts reinstall.${c.reset}\n`;
  }

  output += '\n';
  output += renderFooter(['b back', 'q quit']);

  return output;
}

function forceUpdate() {
  const os = require('os');
  const homeDir = os.homedir();
  const cacheDir = path.join(homeDir, '.claude', 'plugins', 'cache', 'robotijn');
  const marketDir = path.join(homeDir, '.claude', 'plugins', 'marketplaces', 'robotijn');

  let cleared = [];

  // Clear cache directory
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    cleared.push('cache');
  }

  // Clear marketplace directory
  if (fs.existsSync(marketDir)) {
    fs.rmSync(marketDir, { recursive: true, force: true });
    cleared.push('marketplace');
  }

  return cleared;
}

function renderSettings(app) {
  const settings = loadSettings(app.projectPath);
  const tabNames = SETTINGS_TABS.map(t => t.name);
  const currentTab = SETTINGS_TABS[app.settingsTabIndex || 0];
  const schema = getCategorySchema(currentTab.id);

  let output = '\n';
  output += `${c.bold}Tools › Settings${c.reset}\n\n`;

  // Settings sub-tabs
  output += renderTabs(tabNames, app.settingsTabIndex || 0) + '\n';
  output += line() + '\n\n';

  // Current category settings
  output += `${c.bold}${schema.label}${c.reset}\n\n`;

  schema.settings.forEach((setting, i) => {
    const arrow = app.settingIndex === i ? '→' : ' ';
    const value = settings[currentTab.id]?.[setting.key] ?? setting.default;

    let valueStr;
    if (setting.type === 'toggle') {
      valueStr = value ? `${c.green}ON${c.reset}` : `${c.dim}OFF${c.reset}`;
    } else if (setting.type === 'select') {
      valueStr = `${c.cyan}${value}${c.reset}`;
    } else if (setting.type === 'list') {
      valueStr = `${c.dim}[${value.length} items]${c.reset}`;
    } else {
      valueStr = `${c.cyan}${value}${c.reset}`;
    }

    output += `${arrow} ${i + 1}. ${setting.label.padEnd(35)} ${valueStr}\n`;
  });

  output += '\n';
  output += renderFooter(['←/→ category', '↑/↓ nav', 'Enter toggle/edit', 'b back', 'q quit']);

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
  const hooksPath = path.join(pluginPath, '.claude-plugin', 'hooks.json');
  checks.push({
    label: 'Hooks configured',
    pass: fs.existsSync(hooksPath)
  });

  // Settings file
  const settingsPath = path.join(projectPath, '.ctoc', 'settings.json');
  checks.push({
    label: 'Settings file exists',
    pass: fs.existsSync(settingsPath)
  });

  // Plans directory
  const plansDir = path.join(projectPath, 'plans');
  checks.push({
    label: 'Plans directory exists',
    pass: fs.existsSync(plansDir)
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
  if (!app.settingsTabIndex) app.settingsTabIndex = 0;

  // Main tools list
  if (!app.toolMode) {
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
        app.updateMessage = null;
      }
      if (toolKey === '3') {
        app.settingsTabIndex = 0;
        app.settingIndex = 0;
      }
      return true;
    }
  }

  // Doctor mode
  if (app.toolMode === '1') {
    if (key.name === 'escape' || key.name === 'b' || key.sequence === '0') {
      app.toolMode = null;
      app.doctorInput = '';
      return true;
    }
    if (key.sequence === '3') {
      // Sync now
      const result = manualSync(app.projectPath);
      app.message = result.synced ? '✓ Synced successfully' : `Sync: ${result.reason || result.error}`;
      return true;
    }
    if (key.name === 'backspace') {
      app.doctorInput = (app.doctorInput || '').slice(0, -1);
      return true;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !'123'.includes(key.sequence)) {
      app.doctorInput = (app.doctorInput || '') + key.sequence;
      return true;
    }
  }

  // Update mode
  if (app.toolMode === '2') {
    if (key.name === 'escape' || key.name === 'b' || key.sequence === '0') {
      app.toolMode = null;
      app.updateMessage = null;
      return true;
    }
    if (key.sequence === '1') {
      const cleared = forceUpdate();
      if (cleared.length > 0) {
        app.updateMessage = `${c.green}✓ Cache cleared.${c.reset}\n\n  ${c.bold}Restart Claude Code${c.reset}, then run:\n  ${c.cyan}/plugin install ctoc${c.reset}`;
      } else {
        app.updateMessage = `${c.dim}Cache already clear.${c.reset}\n\n  Run: ${c.cyan}/plugin install ctoc${c.reset}`;
      }
      return true;
    }
  }

  // Settings mode
  if (app.toolMode === '3') {
    const currentTab = SETTINGS_TABS[app.settingsTabIndex];
    const schema = getCategorySchema(currentTab.id);

    if (key.name === 'escape' || key.name === 'b' || key.sequence === '0') {
      app.toolMode = null;
      return true;
    }
    // Switch settings tabs
    if (key.name === 'left') {
      app.settingsTabIndex = (app.settingsTabIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
      app.settingIndex = 0;
      return true;
    }
    if (key.name === 'right') {
      app.settingsTabIndex = (app.settingsTabIndex + 1) % SETTINGS_TABS.length;
      app.settingIndex = 0;
      return true;
    }
    if (key.name === 'up') {
      app.settingIndex = Math.max(0, app.settingIndex - 1);
      return true;
    }
    if (key.name === 'down') {
      app.settingIndex = Math.min(schema.settings.length - 1, app.settingIndex + 1);
      return true;
    }
    if (key.name === 'return') {
      const setting = schema.settings[app.settingIndex];
      if (setting.type === 'toggle') {
        toggleSetting(currentTab.id, setting.key, app.projectPath);
      }
      // TODO: handle other types (number input, select cycling)
      return true;
    }
  }

  return false;
}

module.exports = { render, renderDoctor, renderUpdate, renderSettings, handleKey };

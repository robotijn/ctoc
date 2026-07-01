/**
 * System Area (A3.2 / CTOC v7)
 *
 * Doctor, update, settings, logs. Folds the legacy `tools` tab.
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { c, line, renderFooter } = require('../lib/tui');

function fileSize(filePath) {
  try { return safeFs.statSync(filePath).size; } catch { return 0; }
}

function render(app) {
  const root = app.projectPath || process.cwd();
  const enforcementLog = path.join(root, '.ctoc', 'logs', 'enforcement.json');
  const gateViolations = path.join(root, '.ctoc', 'logs', 'gate-violations.json');
  const cleanupLog = path.join(root, '.ctoc', 'logs', 'cleanup.json');

  let out = '\n';
  out += `${c.bold}System${c.reset}\n\n`;

  out += `  ${c.bold}Tools${c.reset}\n`;
  out += `    ${c.dim}1${c.reset}  Doctor      — run /ctoc:menu and select Tools > Doctor\n`;
  out += `    ${c.dim}2${c.reset}  Update      — /plugin update ctoc\n`;
  out += `    ${c.dim}3${c.reset}  Settings    — .ctoc/settings.yaml\n\n`;

  out += `  ${c.bold}Logs${c.reset}\n`;
  out += `    Enforcement     ${fileSize(enforcementLog).toString().padStart(8)} bytes  ${c.dim}.ctoc/logs/enforcement.json${c.reset}\n`;
  out += `    Gate violations ${fileSize(gateViolations).toString().padStart(8)} bytes  ${c.dim}.ctoc/logs/gate-violations.json${c.reset}\n`;
  out += `    Cleanup         ${fileSize(cleanupLog).toString().padStart(8)} bytes  ${c.dim}.ctoc/logs/cleanup.json${c.reset}\n\n`;

  out += `  ${c.bold}Settings${c.reset}\n`;
  const settingsPath = path.join(root, '.ctoc', 'settings.yaml');
  if (safeFs.existsSync(settingsPath)) {
    out += `    ${c.dim}${settingsPath}${c.reset}\n`;
  } else {
    out += `    ${c.dim}Not configured (.ctoc/settings.yaml missing)${c.reset}\n`;
  }

  out += '\n' + line() + '\n';
  out += renderFooter(['←/→ areas', 'q quit']);
  return out;
}

function handleKey(_key, _app) {
  return false;
}

module.exports = { render, handleKey };

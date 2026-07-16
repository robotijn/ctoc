/**
 * System Area (A3.2 / CTOC v7)
 *
 * Doctor, update, settings, logs. Folds the legacy `tools` tab.
 *
 * Key handling for the legacy tools sub-modes (Doctor '1' / Update '2' /
 * Settings '3') is DELEGATED to `src/tabs/tools.js`, whose `handleKey` already
 * implements sub-tab nav, up/down selection, Enter-to-toggle, and escape/back
 * (M12). The static System landing (no sub-mode) has no interactive keys of its
 * own, so `handleKey` returns false there. See `handleKey` below.
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { c, line, renderFooter } = require('../lib/tui');
const toolsTab = require('../tabs/tools');

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
  out += `    ${c.cyan}d${c.reset}  Doctor      — health check & troubleshooting\n`;
  out += `    ${c.cyan}u${c.reset}  Update      — check for CTOC updates\n`;
  out += `    ${c.cyan}s${c.reset}  Settings    — configure CTOC\n\n`;

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
  out += renderFooter(['d doctor', 'u update', 's settings', '←/→ areas', 'q quit']);
  return out;
}

/**
 * When a legacy tools sub-mode is active (Doctor '1' / Update '2' / Settings '3'),
 * the fully-implemented key handler lives in tabs/tools.js. Delegate so those keys
 * (arrow nav, tab switch, Enter-to-toggle, escape/back) actually dispatch (M12).
 * The static System landing (no sub-mode) has no interactive keys of its own.
 * @param {object} key   readline key object ({name, sequence, ctrl, …})
 * @param {object} app   menu app state
 * @returns {boolean}    true iff the key was consumed (menu.js re-renders)
 */
function handleKey(key, app) {
  if (app && app.toolMode) {
    // Inside a sub-mode, tabs/tools.js owns the keys (arrow nav, Enter, b/escape back).
    return toolsTab.handleKey(key, app);
  }
  // Landing: owner-approved lowercase mnemonics open the sub-modes the render
  // advertises. The internal toolMode values ('1'/'2'/'3') are the ones menu.js's
  // render + tabs/tools.js already expect — d/u/s are the human-facing keys mapped
  // onto them, replacing the bare digits the global router used to eat as area switches.
  const seq = key ? (key.sequence || key.name) : undefined;
  if (seq === 'd') { app.toolMode = '1'; return true; }                              // Doctor
  if (seq === 'u') { app.toolMode = '2'; app.updateMessage = null; return true; }    // Update
  if (seq === 's') {                                                                 // Settings
    app.toolMode = '3';
    app.settingsTabIndex = 0;
    app.settingIndex = 0;
    return true;
  }
  return false;
}

module.exports = { render, handleKey };

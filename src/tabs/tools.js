/**
 * Tools Tab
 * Doctor, Update, Settings (with sub-tabs)
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { c, line, renderTabs, renderFooter } = require('../lib/tui');
const {
  SETTINGS_TABS,
  loadSettings,
  toggleSetting,
  setSetting,
  getCategorySchema
} = require('../lib/settings');
const { getLastSync, manualSync } = require('../lib/sync');
const { reconcileState } = require('../lib/task-reconcile');
const { readLog } = require('../lib/enforcement-log');
const claimLedger = require('../lib/claim-ledger');
const { auditSufficiencyCrossings, formatAuditReport } = require('../lib/sufficiency-audit');

const DAY_MS = 24 * 60 * 60 * 1000;
/** The Doctor action number that runs the verifier — referenced by the row itself. */
const VERIFY_ACTION = '5';

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

  // Corpus claim-verification verdict — read off disk, no network. The honest
  // signal lands WITH its display (unlike stale-detector.js's unreadCount, which
  // is produced but not yet rendered; this slice does not repeat that debt).
  output += `${c.bold}Corpus claims${c.reset}\n`;
  output += renderClaimVerdict(app.projectPath);
  output += '\n';

  // Gate-crossing audit — has any human gate ever been crossed WITHOUT a human?
  // Read off the approval ledger on disk, no network. never-crossed, crossed and
  // undetermined render as three distinct verdicts (an unreadable ledger must never
  // read as a clean history).
  output += `${c.bold}Gate crossings${c.reset}\n`;
  output += renderSufficiencyAudit(app.projectPath);
  output += '\n';

  // Last sync info
  const lastSync = getLastSync();
  if (lastSync) {
    output += `${c.dim}Last sync: ${lastSync.toLocaleTimeString()}${c.reset}\n\n`;
  }

  output += line() + '\n\n';
  output += `1. Run checks again\n`;
  output += `2. Repair state\n`;
  output += `3. Sync now\n`;
  output += `4. View logs\n`;
  output += `5. Verify corpus claims\n\n`;
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
    output += `  Latest version:   ${c.bold}${app.latestVersion}${c.reset}\n`;
    if (app.latestVersion !== current) {
      output += `  ${c.yellow}Update available!${c.reset}\n`;
    }
  }
  output += '\n';

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
  if (safeFs.existsSync(cacheDir)) {
    safeFs.rmSync(cacheDir, { recursive: true, force: true });
    cleared.push('cache');
  }

  // Clear marketplace directory
  if (safeFs.existsSync(marketDir)) {
    safeFs.rmSync(marketDir, { recursive: true, force: true });
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
  output += renderFooter(['←/→ category', '↑/↓ nav', 'Enter toggle/cycle', 'b back', 'q quit']);

  return output;
}

function runHealthChecks(projectPath) {
  const checks = [];

  // Plugin installed
  const pluginPath = path.join(__dirname, '..', '..');
  checks.push({
    label: 'Plugin installed correctly',
    pass: safeFs.existsSync(pluginPath)
  });

  // Hooks configured
  const hooksPath = path.join(pluginPath, '.claude-plugin', 'hooks.json');
  checks.push({
    label: 'Hooks configured',
    pass: safeFs.existsSync(hooksPath)
  });

  // Settings file
  const settingsPath = path.join(projectPath, '.ctoc', 'settings.json');
  checks.push({
    label: 'Settings file exists',
    pass: safeFs.existsSync(settingsPath)
  });

  // Plans directory
  const plansDir = path.join(projectPath, 'plans');
  checks.push({
    label: 'Plans directory exists',
    pass: safeFs.existsSync(plansDir)
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
    return safeFs.readFileSync(versionFile, 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

/** Strip C0/C1 control characters (incl. ESC) from ledger-derived text before it
 *  reaches the terminal — twin of stale-detector.js `stripCtlChars`, so a hostile
 *  guide path cannot carry escape sequences into the dashboard. */
function stripCtl(s) {
  return String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

/**
 * Render the corpus claim-verification verdict as one or more menu rows. TOTAL by
 * contract: a fault renders a line, never a blank and never a throw. Reads the
 * ledger OFF DISK via claim-ledger.readLedger — NO network, one read, no corpus
 * walk on the menu hot path. ABSENT, CORRUPT and CLEAN are three distinct strings.
 *
 * @param {string} projectPath absolute project root
 * @param {{nowMs?: number}} [opts]
 * @returns {string}
 */
function renderClaimVerdict(projectPath, opts = {}) {
  const now = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();

  let read;
  try {
    read = claimLedger.readLedger(projectPath);
  } catch {
    // A throw out of the reader is itself an unreadable state, never a blank.
    return `  ${c.red}corpus claims${c.reset}   unreadable — see [${VERIFY_ACTION}]\n`;
  }

  if (!read || !read.ok) {
    if (read && read.problem === 'absent') {
      return `  ${c.dim}corpus claims${c.reset}   never verified — run [${VERIFY_ACTION}]\n`;
    }
    return `  ${c.red}corpus claims${c.reset}   unreadable — see [${VERIFY_ACTION}]\n`;
  }

  const claims = read.ledger && read.ledger.claims && typeof read.ledger.claims === 'object'
    ? read.ledger.claims
    : {};
  let verified = 0;
  let refuted = 0;
  let unverifiable = 0;
  let stalest = null; // oldest verification age in ms — the staleness the gate fails on
  const refutedKeys = [];
  for (const key of Object.keys(claims)) {
    const e = claims[key];
    const state = e && typeof e === 'object' ? e.state : undefined;
    if (state === 'VERIFIED') verified += 1;
    else if (state === 'REFUTED') { refuted += 1; refutedKeys.push(key); }
    else unverifiable += 1;

    const t = e && typeof e === 'object' ? Date.parse(e.lastVerifiedAt) : NaN;
    if (Number.isFinite(t)) {
      const age = now - t;
      if (stalest === null || age > stalest) stalest = age;
    }
  }

  const horizonDays = read.ledger && Number.isFinite(read.ledger.horizonDays) && read.ledger.horizonDays > 0
    ? read.ledger.horizonDays
    : 7;
  const horizonMs = horizonDays * DAY_MS;

  let ageStr;
  if (stalest === null) {
    ageStr = `age unknown (horizon ${horizonDays}d)`;
  } else {
    const days = Math.floor(stalest / DAY_MS);
    if (stalest > horizonMs) {
      ageStr = `last verified ${days}d ago — ${c.yellow}STALE${c.reset} (horizon ${horizonDays}d)`;
    } else {
      ageStr = `last verified ${days}d ago (horizon ${horizonDays}d)`;
    }
  }

  const refutedColor = refuted > 0 ? c.red : c.dim;
  let out = `  ${c.bold}corpus claims${c.reset}   verified ${verified}  `
    + `${refutedColor}refuted ${refuted}${c.reset}  unverifiable ${unverifiable}   ${ageStr}\n`;
  // A refutation is a finding a human must act on: name each refuted guide path,
  // control-stripped and repository-relative (the ledger keys already are).
  for (const key of refutedKeys) {
    out += `    ${c.red}⚠ refuted${c.reset} ${stripCtl(key)}\n`;
  }
  return out;
}

/**
 * Render the gate-crossing audit verdict as one or more menu rows. TOTAL by
 * contract: a fault renders a line, never a blank and never a throw. Reads the
 * approval ledger OFF DISK via sufficiency-audit — NO network. The colour encodes
 * the verdict: crossed → red (a gate advanced with no human), undetermined → yellow
 * (history could not be established), never-crossed → green.
 *
 * @param {string} projectPath absolute project root
 * @returns {string}
 */
function renderSufficiencyAudit(projectPath) {
  let result;
  try {
    result = auditSufficiencyCrossings(projectPath);
  } catch {
    // The only throw is a non-string projectPath; degrade to a legible line.
    return `  ${c.red}gate crossings${c.reset}   unreadable\n`;
  }
  const color = result.verdict === 'crossed'
    ? c.red
    : result.verdict === 'undetermined' ? c.yellow : c.green;
  return formatAuditReport(result)
    .split('\n')
    .map((l) => `  ${color}${stripCtl(l)}${c.reset}\n`)
    .join('');
}

/**
 * Dispatch `node src/scripts/verify-claims.js` in the BACKGROUND and return
 * immediately — the terminal never blocks on it (CLAUDE.md: updates run in the
 * background; the human never watches a spinner). Spawned with an argument ARRAY
 * and no shell (Step 13). `spawnFn` is injectable for tests.
 *
 * @param {string} projectPath absolute project root (cwd for the run)
 * @param {Function} [spawnFn] defaults to child_process.spawn
 */
function dispatchClaimVerification(projectPath, spawnFn) {
  const spawn = spawnFn || require('child_process').spawn;
  const scriptPath = path.join(__dirname, '..', 'scripts', 'verify-claims.js');
  const child = spawn(process.execPath, [scriptPath], {
    cwd: projectPath,
    detached: true,
    stdio: 'ignore',
  });
  if (child && typeof child.unref === 'function') child.unref();
  return child;
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

  // Doctor mode. The screen advertises four numbered actions; every one must DO
  // what it says — a menu item that silently no-ops (or types its digit into the
  // question box) is a screen that lies to the person reading it.
  if (app.toolMode === '1') {
    if (key.name === 'escape' || key.name === 'b' || key.sequence === '0') {
      app.toolMode = null;
      app.doctorInput = '';
      return true;
    }
    if (key.sequence === '1') {
      // Run checks again — health checks are pure and recomputed on the next
      // render(); confirm so the human sees a response rather than a still screen.
      app.message = '✓ Health checks re-run';
      return true;
    }
    if (key.sequence === '2') {
      // Repair state — reconcile the task registry (the canonical, fail-open
      // state-repair path also run on menu open). Report exactly what it fixed.
      const { report } = reconcileState(app.projectPath);
      if (report.corrupt) {
        app.message = `Repair: could not read task state (${report.corrupt.reason})`;
      } else {
        const fixed = ['orphaned', 'swept', 'cancelled', 'unsatisfiable', 'quarantineReleased']
          .reduce((n, k) => n + report[k].length, 0);
        app.message = fixed > 0
          ? `✓ Repaired ${fixed} task-state issue${fixed === 1 ? '' : 's'}`
          : '✓ Task state healthy — nothing to repair';
      }
      return true;
    }
    if (key.sequence === '3') {
      // Sync now
      const result = manualSync(app.projectPath);
      app.message = result.synced ? '✓ Synced successfully' : `Sync: ${result.reason || result.error}`;
      return true;
    }
    if (key.sequence === '4') {
      // View logs — surface the enforcement log so a human can see recent activity
      // without leaving the doctor. The full stream lives in the named file.
      const entries = readLog(app.projectPath);
      app.message = entries.length
        ? `Logs: ${entries.length} enforcement entr${entries.length === 1 ? 'y' : 'ies'} in .ctoc/logs/enforcement.json`
        : 'Logs: no enforcement activity recorded yet';
      return true;
    }
    if (key.sequence === '5') {
      // Verify corpus claims — runs verify-claims.js in the BACKGROUND (the only
      // network path in the repo); the render/terminal never blocks on it.
      dispatchClaimVerification(app.projectPath);
      app.message = 'Verifying corpus claims in the background — re-open Doctor to see the updated verdict';
      return true;
    }
    if (key.name === 'backspace') {
      app.doctorInput = (app.doctorInput || '').slice(0, -1);
      return true;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !'12345'.includes(key.sequence)) {
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
        const nv = toggleSetting(currentTab.id, setting.key, app.projectPath);
        app.message = `${setting.label}: ${nv ? 'ON' : 'OFF'}`;
      } else if (setting.type === 'select') {
        // Enter CYCLES a select to the next allowed option (wrap around) and persists.
        // An unknown current value (indexOf === -1) starts the cycle at the first option.
        const opts = Array.isArray(setting.options) ? setting.options : [];
        if (opts.length > 0) {
          const cur = loadSettings(app.projectPath)[currentTab.id]?.[setting.key] ?? setting.default;
          const next = opts[(opts.indexOf(cur) + 1) % opts.length];
          setSetting(currentTab.id, setting.key, next, app.projectPath);
          app.message = `${setting.label} → ${next}`;
        }
      } else if (setting.type === 'number') {
        // No in-TUI numeric editor yet — give a NON-SILENT hint pointing at the real
        // store (this module writes .ctoc/settings.json, per docs/CONFIG_SOURCES.md)
        // instead of a silent no-op. Never reports a false "changed".
        app.message = `Edit "${setting.label}" numerically in .ctoc/settings.json`;
      } else {
        // string / list — same non-silent, correct-file guidance.
        app.message = `Edit "${setting.label}" in .ctoc/settings.json`;
      }
      return true;
    }
  }

  return false;
}

module.exports = { render, renderDoctor, renderUpdate, renderSettings, handleKey, renderClaimVerdict, renderSufficiencyAudit, dispatchClaimVerification };

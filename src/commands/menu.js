#!/usr/bin/env node
/**
 * CTOC Interactive Interface
 * Main entry point for /ctoc command
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { c, clear, line, renderTabs, renderTabIndicator, setupKeyboard, cleanup, renderBreadcrumb } = require('../lib/tui');
const { TABS, getTabNames, nextTab, prevTab } = require('../lib/tabs');
const { NavStack } = require('../lib/state');
const { startAutoSync, stopAutoSync } = require('../lib/sync');
const { findProjectRoot } = require('../lib/project-root');
const { needsEnvironmentPrompt } = require('../lib/settings');
const { shouldRunGdpr, shouldRunEuAiAct } = require('../lib/compliance-regime');

// First-run environment question. NEVER replaces the dashboard — it is
// attached as a SECOND question alongside the pipeline question, so the plan
// overview is always visible. (v6.9.44: the v6.9.40 prompt-gate hid the
// dashboard and "Decide later" looped back to itself; this fixes both.)
function attachEnvironmentQuestion(result) {
  result.text =
    '⚙ No CTOC environment chosen yet for this project — pick one below\n' +
    '  (dev = soft enforcement, never auto-push · staging = strict, manual push ·\n' +
    '   prod = strict, auto-push after gates). The four human gates stay\n' +
    '  mandatory in every environment. Changeable later in System → Settings.\n\n' +
    result.text;
  result.ask.questions.push({
    question: 'Which environment should CTOC run in for this project?',
    header: 'Environment',
    options: [
      { label: 'Development', description: 'Soft enforcement, never auto-push — fast local iteration' },
      { label: 'Staging', description: 'Strict enforcement, manual push — rehearse production' },
      { label: 'Production', description: 'Strict enforcement, auto-push after gates — locked down' },
      { label: 'Decide later', description: 'Keep defaults; ask again next time' }
    ]
  });
  Object.assign(result.actions, {
    'Development': 'claude:set-environment dev',
    'Staging': 'claude:set-environment staging',
    'Production': 'claude:set-environment prod',
    'Decide later': 'claude:env-decide-later'
  });
  return result;
}

// First-run EU compliance-regime question (EC1-s3). MIRRORS
// `attachEnvironmentQuestion` above exactly — it NEVER replaces the dashboard;
// it is attached as an additional question alongside the always-first Pipeline
// question, so the plan overview is always visible. It never gates and never
// weakens a human gate: choosing a profile only writes
// `regulatory_regime.active_profiles` in settings.yaml (via
// `claude:set-compliance-regime`), which cannot reach a gate key.
//
// Prompt-once predicate: when NEITHER EU compliance profile is active, the
// question rides along. `shouldRunGdpr`/`shouldRunEuAiAct` are read-fresh from
// the live settings.yaml (EC1-s2). Fail-open (try/catch → false): a compliance
// read fault must never block the dashboard render (the load-bearing menu
// invariant, `enterSearchMode`/`activateCurrentArea` precedent).
function needsComplianceRegimePrompt(projectRoot) {
  try {
    return !shouldRunGdpr(projectRoot) && !shouldRunEuAiAct(projectRoot);
  } catch {
    return false;
  }
}

// Mirror of `attachEnvironmentQuestion`. Attaches the compliance-regime question
// (and its `claude:set-compliance-regime` actions) additively — the dashboard is
// built first and stays intact; this only appends. Defensive guards mirror the
// additive contract so a malformed `result` (missing `ask`/`actions`) never
// throws (the real `route([])` always supplies both, per menu-screens.js).
function attachComplianceQuestion(result, projectPath) {
  result.ask = result.ask || { questions: [] };
  result.ask.questions = result.ask.questions || [];
  result.actions = result.actions || {};
  result.text =
    '⚖ No EU compliance regime chosen yet — pick one (gdpr = processes EU ' +
    'personal data under Regulation (EU) 2016/679 · eu-ai-act = deploys AI ' +
    'systems in the EU market under Regulation (EU) 2024/1689). The four human ' +
    'gates stay mandatory. Changeable later in settings.yaml.\n\n' +
    result.text;
  result.ask.questions.push({
    question: 'Which EU compliance regime applies to this project?',
    header: 'Compliance',
    options: [
      { label: 'None', description: 'No EU compliance regime — skip the GDPR / EU AI Act controls' },
      { label: 'GDPR', description: 'Processes EU personal data — Regulation (EU) 2016/679' },
      { label: 'EU AI Act', description: 'Deploys AI systems in the EU market — Regulation (EU) 2024/1689' },
      { label: 'Both', description: 'GDPR and the EU AI Act both apply' }
    ]
  });
  Object.assign(result.actions, {
    'None': 'claude:set-compliance-regime none',
    'GDPR': 'claude:set-compliance-regime gdpr',
    'EU AI Act': 'claude:set-compliance-regime eu-ai-act',
    'Both': 'claude:set-compliance-regime both'
  });
  return result;
}

// PI4-s4: "Search plans" flow (additive, fail-open). `enterSearchMode` is the
// async-fetch half of the async-fetch/sync-render bridge: it awaits the barrel
// `search(query)`, stashes the ranked results on `app.searchResults`, and NEVER
// rejects — a missing barrel export or a throwing `search` yields an empty result
// set (fail-open), so a semantic-feature fault can never crash the menu (the
// load-bearing invariant / readIndexStatus precedent). Bounded to the top 10 hits.
/**
 * Run a plan search and stash ranked results on the app for synchronous render.
 * @param {object} app - TUI app state; uses `app.projectPath`
 * @param {string} query - the user's search query string
 * @returns {Promise<void>}
 */
async function enterSearchMode(app, query) {
  app.searchMode = true;
  const projectPath = (app && app.projectPath) || process.cwd();
  try {
    if (typeof query !== 'string' || query.length === 0) { app.searchResults = []; return; }
    // `search` is a lazy Object.defineProperties getter on the barrel that tsc's
    // static module-shape inference cannot see — cast to any to keep --checkJs neutral.
    /** @type {any} */
    const planIndex = require('../lib/plan-index');
    if (typeof planIndex.search !== 'function') { app.searchResults = []; return; }
    const results = await planIndex.search(query, { projectPath, limit: 10 });
    app.searchResults = Array.isArray(results) ? results.slice(0, 10) : [];
  } catch {
    app.searchResults = []; // fail-open — never reject, never crash the menu
  }
}

/**
 * PI4-s4: the "Search plans" keyboard shortcut. Mirrors the Settings shortcut
 * shape — guarded by `app.mode === 'list'` so it NEVER shadows text input. `/` is
 * the conventional search key and does not collide with the existing `s` Settings
 * shortcut. Returns true (consumed) only when the search key fires in list mode.
 * Entering search mode also seeds an empty query buffer so the human can type.
 * @param {{sequence?: string}} key
 * @param {object} app
 * @returns {boolean} true if the key was consumed (search entered)
 */
function handleSearchKey(key, app) {
  if (key && key.sequence === '/' && app && app.mode === 'list') {
    app.searchMode = true;
    if (typeof app.searchQuery !== 'string') app.searchQuery = '';
    return true;
  }
  return false;
}

// PI4-s4 kickback: the search SUB-MODE key handler. Once `/` has put the app into
// search mode, subsequent keystrokes ACCUMULATE into `app.searchQuery` (the live
// query the human is typing), backspace deletes the last char, escape exits, and
// enter/return runs the search — stashing ranked hits on `app.searchResults` for
// `renderSearch` to display. This is what makes the flow reach the human: `/` →
// type → see ranked results. Fully fail-open (the search itself never rejects).
/**
 * Handle a keystroke while the app is in the search sub-mode.
 * @param {string} str - the raw input string (unused; kept for handleKey parity)
 * @param {{name?: string, sequence?: string, ctrl?: boolean}} key
 * @param {object} app - TUI app state; uses/sets `app.searchQuery`, `app.searchResults`, `app.searchMode`
 * @returns {{ run: boolean } | boolean} `{run:true}` when enter submitted a query
 *   (caller runs the async search + re-renders); `true` when the key was consumed
 *   in-place (re-render only); `false` when not consumed.
 */
function handleSearchInput(str, key, app) {
  if (!app || app.searchMode !== true) return false;
  if (typeof app.searchQuery !== 'string') app.searchQuery = '';
  if (key && (key.name === 'escape')) {
    app.searchMode = false;
    app.searchQuery = '';
    app.searchResults = [];
    return true;
  }
  if (key && (key.name === 'return' || key.name === 'enter')) {
    return { run: true }; // caller kicks the async search off the key path
  }
  if (key && key.name === 'backspace') {
    app.searchQuery = app.searchQuery.slice(0, -1);
    return true;
  }
  // Accumulate a single printable character (ignore ctrl-combos and the leading '/').
  if (key && typeof key.sequence === 'string' && key.sequence.length === 1 &&
      !key.ctrl && key.sequence !== '/') {
    app.searchQuery += key.sequence;
    return true;
  }
  return false;
}

/**
 * PI4-s4 kickback: SYNCHRONOUS render of the search sub-mode — the query line the
 * human is typing plus the ranked results stashed on `app.searchResults`. This is
 * the render branch that surfaces search to the human; without it a `/` + query +
 * enter went nowhere. Fully fail-open: any surprise returns a minimal, intact
 * prompt so the menu never breaks.
 * @param {object} app
 * @returns {string}
 */
function renderSearch(app) {
  try {
    const query = (app && typeof app.searchQuery === 'string') ? app.searchQuery : '';
    let out = '\n';
    out += `${c.bold}Search plans${c.reset}\n\n`;
    out += `  ${c.cyan}/${c.reset} ${query}${c.dim}_${c.reset}\n\n`;
    const results = Array.isArray(app && app.searchResults) ? app.searchResults : [];
    if (results.length === 0) {
      out += `  ${c.dim}${query.length === 0 ? 'Type a query, then Enter to search.' : 'No results.'}${c.reset}\n\n`;
    } else {
      out += `${c.bold}Results${c.reset}\n`;
      let rank = 1;
      for (const r of results.slice(0, 10)) {
        const id = (r && (r.planPath || r.planSlug || r.plan)) || '?';
        const score = (r && typeof r.score === 'number') ? ` ${c.dim}${r.score.toFixed(2)}${c.reset}` : '';
        out += `  ${c.dim}${String(rank).padStart(2)}.${c.reset} ${c.cyan}${id}${c.reset}${score}\n`;
        rank += 1;
      }
      out += '\n';
    }
    out += line() + '\n';
    out += `${c.dim}type query · Enter search · Esc cancel${c.reset}\n`;
    return out;
  } catch {
    return `\n${c.bold}Search plans${c.reset}\n\n  ${c.dim}search unavailable${c.reset}\n`;
  }
}

// Read version from VERSION file
let VERSION;
try {
  VERSION = safeFs.readFileSync(path.join(__dirname, '..', '..', 'VERSION'), 'utf8').trim();
} catch {
  VERSION = '?.?.?';
}

// CTOC v7 (A3.2): import 5 area modules. The remaining legacy tab modules on
// disk (overview/vision/functional/review/tools) are no longer directly mounted
// by the TUI — the Pipeline area folds them into one view. The implementation,
// todo, and progress tab modules were removed as dead code.
const pipelineArea = require('../areas/pipeline');
const inboxArea = require('../areas/inbox');
const agentArea = require('../areas/agent');
const libraryArea = require('../areas/library');
const systemArea = require('../areas/system');

// Legacy tab modules retained so functional/review/etc. drill-in flows that
// reference `functionalTab.renderActions`, `reviewTab.renderRejectInput`
// continue to work during A3.2 transition.
const overviewTab = require('../tabs/overview');
const functionalTab = require('../tabs/functional');
const reviewTab = require('../tabs/review');
const toolsTab = require('../tabs/tools');

const tabModules = {
  pipeline: pipelineArea,
  inbox: inboxArea,
  agent: agentArea,
  library: libraryArea,
  system: systemArea,
};

// Message display timer (prevents render races on rapid key presses)
let messageTimer = null;

// Application state
const app = {
  projectPath: findProjectRoot(),
  width: process.stdout.columns || 80,
  tabIndex: 0,
  mode: 'list',
  selectedIndex: 0,
  actionIndex: 0,
  selectedPlan: null,
  message: null,
  navStack: new NavStack(),
  // Tab-specific state
  toolIndex: 0,
  toolMode: null,
  settingsTabIndex: 0,
  settingIndex: 0,
  finishedOffset: 0,
  finishedIndex: 0,
  directInput: '',
  inputValue: '',
  doctorInput: '',
  viewContent: null
};

// Render the current screen
function render() {
  clear();

  const tabNames = getTabNames();
  let output = '';

  // Header with version
  output += `${c.dim}CTOC v${VERSION}${c.reset}\n`;

  // Tab bar
  output += renderTabs(tabNames, app.tabIndex) + '\n';
  output += renderTabIndicator(tabNames, app.tabIndex) + '\n';
  output += line() + '\n';

  // Breadcrumb if in sub-screen
  if (app.navStack.path().length > 1) {
    output += renderBreadcrumb(app.navStack.path()) + '\n';
  }

  // Current tab content
  const currentTab = TABS[app.tabIndex];
  const tabModule = tabModules[currentTab.id];

  if (app.searchMode) {
    // PI4-s4 kickback: the search sub-mode owns the content area — it shows the live
    // query the human is typing and the ranked results. Rendered ABOVE tab content
    // so a `/` + query + enter actually reaches the human on the live menu.
    output += renderSearch(app);
  } else if (app.mode === 'view' && app.viewContent) {
    output += renderView(app.viewContent);
  } else if (app.mode === 'actions' && app.selectedPlan) {
    if (tabModule.renderActions) {
      output += tabModule.renderActions(app, app.selectedPlan);
    }
  } else if (app.mode === 'confirm-assign' && functionalTab.renderAssignConfirm) {
    output += functionalTab.renderAssignConfirm(app.selectedPlan);
  } else if (app.mode === 'reject-input' && reviewTab.renderRejectInput) {
    output += reviewTab.renderRejectInput(app);
  } else if (currentTab.id === 'system' && app.toolMode) {
    // Legacy tools sub-modes (doctor/update/settings) reachable from System area
    if (app.toolMode === '1') output += toolsTab.renderDoctor(app);
    else if (app.toolMode === '2') output += toolsTab.renderUpdate(app);
    else if (app.toolMode === '3') output += toolsTab.renderSettings(app);
  } else if (tabModule && tabModule.render) {
    output += tabModule.render(app);
  }

  // Status message (clear previous timer to prevent render races)
  if (messageTimer) clearTimeout(messageTimer);
  if (app.message) {
    output += `\n${c.green}${app.message}${c.reset}\n`;
    messageTimer = setTimeout(() => {
      app.message = null;
      render();
    }, 2000);
  }

  process.stdout.write(output);
}

// Render plan content view
function renderView(content) {
  let output = '\n';

  // Truncate long content
  const lines = content.split('\n');
  const maxLines = process.stdout.rows - 10 || 30;
  const displayLines = lines.slice(0, maxLines);

  displayLines.forEach(displayLine => {
    output += displayLine + '\n';
  });

  if (lines.length > maxLines) {
    output += `\n${c.dim}... ${lines.length - maxLines} more lines${c.reset}\n`;
  }

  output += '\n' + line() + '\n';
  output += `${c.dim}b back · q quit${c.reset}\n`;

  return output;
}

// Handle keyboard input
function handleKey(str, key) {
  // PI4-s4 kickback: while the search sub-mode is active it OWNS keystrokes —
  // keys accumulate into `app.searchQuery`, enter runs the search, escape exits.
  // This must run BEFORE the global quit / tab / shortcut handlers so typing a
  // query (including 'q', digits, 's', 'b') never triggers those shortcuts.
  if (app.searchMode) {
    // `handleSearchInput` returns `false | true | {run:true}`; the `{run}` shape
    // signals "enter submitted a query". Cast to any so tsc's union narrowing does
    // not flag the `.run` read — documentation-only, runtime unchanged (the plan's
    // established @type {any} precedent for lazy/union shapes).
    /** @type {any} */
    const res = handleSearchInput(str, key, app);
    if (res && res.run) {
      // Enter submitted the query: kick the async search off the key path, then
      // re-render when it resolves. Fully fail-open (enterSearchMode never rejects).
      Promise.resolve(enterSearchMode(app, app.searchQuery || '')).then(render).catch(() => {});
      render();
      return;
    }
    if (res) { render(); return; }
    // Not consumed by the search handler (unexpected key) → fall through to globals.
  }

  // Global keys (don't quit if user is typing in an input field or searching)
  if (key.name === 'q' && !app.searchMode && !app.directInput && !app.inputValue && app.mode !== 'reject-input') {
    cleanup();
    process.exit(0);
  }

  // Tab switching (always available)
  if (key.name === 'left') {
    app.tabIndex = prevTab(app.tabIndex);
    resetTabState();
    render();
    return;
  }
  if (key.name === 'right') {
    app.tabIndex = nextTab(app.tabIndex);
    resetTabState();
    render();
    return;
  }

  // Settings shortcut: jump to System area's Settings sub-mode
  if (key.sequence === 's' && app.mode === 'list' && TABS[app.tabIndex].id === 'pipeline') {
    app.tabIndex = TABS.findIndex(t => t.id === 'system');
    app.toolMode = '3'; // Settings
    app.settingsTabIndex = 0;
    app.settingIndex = 0;
    render();
    return;
  }

  // PI4-s4: "Search plans" shortcut ('/' in list mode). Enters the search sub-mode
  // with an empty query buffer; from here `handleSearchInput` (above) accumulates
  // keystrokes and enter runs the search. Additive + fail-open.
  if (handleSearchKey(key, app)) {
    app.searchResults = [];
    render();
    return;
  }

  // Numeric area shortcuts (1-5)
  if (/^[1-5]$/.test(key.sequence) && app.mode === 'list') {
    const idx = parseInt(key.sequence, 10) - 1;
    if (idx < TABS.length) {
      app.tabIndex = idx;
      resetTabState();
      render();
      return;
    }
  }

  // Back navigation
  if ((key.name === 'b' || key.name === 'escape') && app.mode === 'view') {
    app.mode = 'list';
    app.viewContent = null;
    render();
    return;
  }

  // Delegate to tab module
  const currentTab = TABS[app.tabIndex];
  const tabModule = tabModules[currentTab.id];

  if (tabModule.handleKey && tabModule.handleKey(key, app)) {
    render();
    return;
  }
}

// Reset tab-specific state when switching tabs
function resetTabState() {
  app.mode = 'list';
  app.selectedIndex = 0;
  app.actionIndex = 0;
  app.selectedPlan = null;
  app.toolMode = null;
  app.viewContent = null;
  app.directInput = '';
  app.inputValue = '';

  // Reset tab-specific modules
  if (overviewTab.reset) overviewTab.reset();

  // PI4-s4 kickback: fire the newly-active area's async activation (related-plans
  // pre-fetch) OFF the render path, then re-render when it resolves. This is what
  // populates `app.relatedPlans` (pipeline) / `app.inboxRelated` (inbox) so the
  // panels actually reach the human. Fire-and-forget + fully fail-open.
  activateCurrentArea();
}

// PI4-s4 kickback: if the current area exposes an async `activate(app)`, kick it off
// the render path (fire-and-forget) and re-render on resolve. Fail-open: a missing
// activate, a throw, or a rejection is swallowed — activation NEVER breaks the menu.
function activateCurrentArea() {
  try {
    const currentTab = TABS[app.tabIndex];
    // Only the pipeline/inbox areas expose `activate`; cast to any so tsc's union
    // over the five area modules does not flag the optional-method access
    // (documentation-only; the guarded `typeof … === 'function'` is the real check).
    /** @type {any} */
    const tabModule = tabModules[currentTab.id];
    if (tabModule && typeof tabModule.activate === 'function') {
      Promise.resolve(tabModule.activate(app)).then(render).catch(() => {});
    }
  } catch {
    // fail-open — activation must never break the menu
  }
}

// Handle window resize
function handleResize() {
  app.width = process.stdout.columns || 80;
  render();
}

// Auto-initialize CTOC for this project if it has not been set up yet.
// Opening the menu is the signal that the user wants CTOC in this project,
// so initialization happens automatically — there is no separate init
// command. The marker is a `.ctoc/` directory; initProject() is idempotent
// and skips any file that already exists. Fails open so the menu never
// blocks on an initialization problem.
function ensureInitialized(projectPath) {
  const root = projectPath || process.cwd();
  if (safeFs.existsSync(path.join(root, '.ctoc'))) return false;
  try {
    const { initProject } = require('../lib/init-project');
    initProject(root);
    return true;
  } catch {
    return false;
  }
}

// Main entry point
function main() {
  const justInitialized = ensureInitialized(app.projectPath);

  // Check for non-interactive JSON mode (subcommands passed as args)
  // Usage: node menu.js [browse functional | plan stage/file | validate stage/file | menu commands]
  const cliArgs = process.argv.slice(2);

  if (cliArgs.length > 0) {
    // Non-interactive JSON mode: delegate to menu-screens state machine
    // Split single-string args ("browse functional" → ["browse", "functional"])
    const { route } = require('../lib/menu-screens');
    const splitArgs = cliArgs.flatMap(arg => arg.split(/\s+/));
    const result = route(splitArgs, app.projectPath);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Check if running in interactive terminal
  if (process.stdin.isTTY) {
    // Full TUI mode
    process.stdout.on('resize', handleResize);
    startAutoSync(app.projectPath);
    process.on('exit', () => {
      stopAutoSync();
      cleanup();
    });
    setupKeyboard(handleKey);
    app.navStack.push('Overview');
    if (justInitialized) app.message = 'CTOC initialized for this project';
    // PI4-s4 kickback: kick the landing area's related-plans pre-fetch so the panel
    // is populated on first paint (fire-and-forget, fail-open).
    activateCurrentArea();
    render();
  } else {
    // Non-interactive with no args: JSON dashboard output for Claude.
    // The dashboard (plan overview across all phases) ALWAYS renders. When the
    // environment is not yet chosen, the environment question rides along as a
    // second question — it never replaces or gates the overview.
    const { route } = require('../lib/menu-screens');
    const result = route([], app.projectPath);
    if (needsEnvironmentPrompt(app.projectPath)) {
      attachEnvironmentQuestion(result);
    }
    // EC1-s3: the compliance-regime question rides along AFTER the environment
    // attach — dashboard built → environment attach → compliance attach → init
    // note → print. Both ride-alongs sit alongside the always-first Pipeline
    // question; neither replaces or gates the overview.
    if (needsComplianceRegimePrompt(app.projectPath)) {
      attachComplianceQuestion(result, app.projectPath);
    }
    if (justInitialized) {
      result.text = 'CTOC initialized for this project (automatic — no init command needed).\n\n' + result.text;
    }
    console.log(JSON.stringify(result, null, 2));
  }
}

// Run as a script; stay importable (without side effects) for tests.
if (require.main === module) {
  main();
}

module.exports = {
  ensureInitialized,
  needsComplianceRegimePrompt,
  attachComplianceQuestion,
  enterSearchMode,
  handleSearchKey,
  handleSearchInput,
  renderSearch,
  handleKey,
  render,
  app,
};

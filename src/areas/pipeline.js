/**
 * Pipeline Area (A3.2 / CTOC v7)
 *
 * Default landing area. Renders the 3-section view (Business / Implementation /
 * Execution) with stage counts. Drill into a stage to browse plans.
 *
 * This area folds the legacy `overview`, `vision`, `functional`, `implementation`,
 * `review`, `todo` tabs into a single area with sectioned navigation.
 */

const path = require('path');
const { c, line, renderFooter, stripCtl } = require('../lib/tui');
const { getPlanCounts, getAgentStatus, getVisionCounts, readPlans, getPlansDir } = require('../lib/state');
const { SECTIONS, getSectionLabel, getStagesInSection, loadDashboardPrefs, saveDashboardPrefs } = require('../lib/sections');
// PI4-s4 kickback: the semantic Related-Plans panel lives on the LIVE pipeline
// area (the mounted dashboard), not the unmounted legacy overview tab. The render
// (`renderRelatedPanel`) and async pre-fetch (`prefetchRelated`) helpers are reused
// from overview.js — that module is the canonical home of the async-fetch/sync-render
// bridge and its Scenario-7 "index building" indicator; importing keeps ONE
// implementation and avoids drift. Both are fully fail-open (never throw into render,
// never reject), so a semantic-feature fault can never break the dashboard.
const { renderRelatedPanel, prefetchRelated } = require('../tabs/overview');

// PI6-s2: the conflict/dependency panel lives on the LIVE pipeline area — the same
// mounted dashboard the human sees, the same surface PI4-s4's kickback fixed. Its
// async-fetch (`prefetchConflicts`) + sync-render (`renderConflictPanel`) helpers are
// defined IN THIS FILE (not the unmounted overview tab) so the live wiring carries no
// dependency on the dead overview render path. Both mirror the Related-Plans bridge and
// are fully fail-open: a `detectConflicts` fault can NEVER break the dashboard.

/**
 * PI6-s2: SYNCHRONOUS render half of the conflict async-fetch/sync-render bridge.
 * Renders the "Potential conflicts" panel from the pre-stashed `app.conflicts` array
 * (populated off the render path by `prefetchConflicts`). Informational only — it names
 * the conflicting plan, its overlapping `files:` globs, and the severity label; never an
 * "error"/"block". Returns '' when there is nothing to show. Fully fail-open: on any
 * surprise it returns '' so the dashboard renders unchanged (the renderRelatedPanel
 * precedent — a panel fault must NEVER break the mounted menu).
 * @param {object} app - TUI app state; reads `app.conflicts`
 * @returns {string} the panel block, or '' when there is nothing to show
 */
function renderConflictPanel(app) {
  try {
    const conflicts = Array.isArray(app && app.conflicts) ? app.conflicts : [];
    if (conflicts.length === 0) return ''; // no conflicts → omit the panel entirely
    let out = `${c.bold}Potential conflicts${c.reset}\n`;
    for (const row of conflicts.slice(0, 5)) {
      // R7-A: plan slug + overlapping `files:` globs are agent-writable (plan
      // frontmatter) — sanitize before rendering. severity is a fixed enum — left raw.
      const plan = stripCtl((row && row.conflictingPlan) || '?');
      const severity = (row && row.severity) || 'potential conflict or dependency';
      const files = Array.isArray(row && row.overlappingFiles) ? row.overlappingFiles : [];
      out += `  ${c.yellow}${plan}${c.reset} ${c.dim}[${severity}]${c.reset}\n`;
      out += `    ${c.dim}files: ${files.map(stripCtl).join(', ')}${c.reset}\n`;
    }
    out += `  ${c.dim}Review before both plans enter implementation simultaneously.${c.reset}\n`;
    out += '\n';
    return out;
  } catch {
    return ''; // fail-open — a conflict-panel fault must NEVER break the dashboard
  }
}

/**
 * PI6-s2: async-fetch half of the conflict bridge. Called OFF the render path (on area
 * activation / seed change); awaits the barrel `detectConflicts(seed, { projectPath })`
 * and stashes the (≤5) result rows on `app.conflicts` for `renderConflictPanel` to read
 * SYNCHRONOUSLY. Fully fail-open: a missing/throwing `detectConflicts` leaves
 * `app.conflicts = []` and NEVER rejects — a semantic-index fault must never break the
 * dashboard (the load-bearing invariant this area already holds for Related Plans).
 * @param {object} app - TUI app state; reads `app.projectPath` + `app.selectedPlan`, sets `app.conflicts`
 * @returns {Promise<void>}
 */
async function prefetchConflicts(app) {
  const projectPath = (app && app.projectPath) || process.cwd();
  const seed = app && app.selectedPlan;
  try {
    if (!seed || typeof seed !== 'string') { app.conflicts = []; return; }
    // `detectConflicts` is defined on the barrel via a lazy Object.defineProperties
    // getter (see plan-index/index.js) that tsc's static module-shape inference cannot
    // see — cast to any so --checkJs stays neutral, matching prefetchRelated.
    /** @type {any} */
    const planIndex = require('../lib/plan-index');
    if (typeof planIndex.detectConflicts !== 'function') { app.conflicts = []; return; }
    const results = await planIndex.detectConflicts(seed, { projectPath });
    app.conflicts = Array.isArray(results) ? results.slice(0, 5) : [];
  } catch {
    if (app) app.conflicts = []; // fail-open — never reject, never break render
  }
}

function stageCount(stage, counts, visionCounts) {
  switch (stage) {
    case 'vision':         return visionCounts.total;
    case 'canvas':         return counts.canvas || 0;
    case 'functional':     return counts.functional;
    case 'implementation': return counts.implementation;
    case 'todo':           return counts.todo;
    case 'in-progress':    return counts.inProgress;
    case 'review':         return counts.review;
    case 'done':           return counts.done || 0;
    default:               return 0;
  }
}

function render(app) {
  const root = app.projectPath || process.cwd();
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);
  const agent = getAgentStatus(root);
  const prefs = loadDashboardPrefs(root);

  let out = '\n';
  out += `${c.bold}Pipeline${c.reset}\n\n`;

  for (const section of Object.keys(SECTIONS)) {
    const stages = getStagesInSection(section);
    const sectionTotal = stages.reduce((sum, s) => sum + stageCount(s, counts, visionCounts), 0);
    const collapsed = prefs.collapsed[section];
    const chevron = collapsed ? '▶' : '▼';
    out += `  ${chevron} ${c.bold}${getSectionLabel(section)}${c.reset} ${c.dim}(${sectionTotal})${c.reset}\n`;
    if (!collapsed) {
      for (const stage of stages) {
        const n = stageCount(stage, counts, visionCounts);
        const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
        const color = n > 0 ? c.cyan : c.dim;
        out += `      ${label.padEnd(14)} ${color}${n}${c.reset}\n`;
      }
    }
    out += '\n';
  }

  // PI4-s4 kickback: Related Plans panel on the LIVE dashboard (additive, fail-open).
  // `renderRelatedPanel` reads the pre-fetched `app.relatedPlans` array stashed by
  // `prefetchRelated` (fired off the render path in `activate`) and renders it here,
  // or shows the Scenario-7 "index building" indicator when the store has zero units.
  // On any fault it returns '' and the pipeline render is unchanged.
  out += renderRelatedPanel(app);

  // PI6-s2: Potential-conflicts panel on the LIVE dashboard (additive, fail-open).
  // `renderConflictPanel` reads the pre-fetched `app.conflicts` array stashed by
  // `prefetchConflicts` (fired off the render path in `activate`) and renders it right
  // below Related Plans. On any fault it returns '' and the pipeline render is unchanged.
  out += renderConflictPanel(app);

  out += line() + '\n';
  if (agent.unreadable) {
    // The registry could not be read (an OS-level error out of state.getAgentStatus).
    // This is NOT idle — an agent may be running — so it replaces the idle line, never sits
    // beside it. The message is already stripped + bounded at the source (state.msgOf).
    out += `${c.red}⛔${c.reset} Agent: ${c.bold}UNKNOWN${c.reset} — the task registry could not be read; this is not idle\n`;
  } else if (agent.active) {
    out += `${c.green}●${c.reset} Agent: ${c.bold}${stripCtl(agent.plan || 'unknown')}${c.reset}`;
    // R7-A: agent.step is agent-writable (.ctoc/state/agent.json) — sanitize before render.
    if (agent.step) out += ` ${c.dim}(step ${stripCtl(agent.step)})${c.reset}`;
    out += '\n';
  } else {
    out += `${c.dim}○ Agent idle${c.reset}\n`;
  }
  out += '\n';
  out += renderFooter(['b/i/x toggle section', '/ search', '←/→ areas', 'q quit']);
  return out;
}

/**
 * PI4-s4 kickback: seed the pipeline area's related-plans selection and kick the
 * async pre-fetch OFF the render path. Called on area activation (tab switch into
 * pipeline). Chooses a seed plan — the first in-progress plan, else the first todo,
 * else the first implementation draft — so the Related Plans panel has something to
 * relate to even though the pipeline area has no explicit per-plan cursor yet.
 * Fully fail-open: a missing plans dir / read error / unavailable barrel leaves
 * `app.relatedPlans` empty and NEVER throws or rejects. The caller fires this
 * fire-and-forget and re-renders when it resolves.
 * @param {object} app - TUI app state; uses/sets `app.projectPath`, `app.selectedPlan`, `app.relatedPlans`
 * @returns {Promise<void>}
 */
async function activate(app) {
  try {
    const root = (app && app.projectPath) || process.cwd();
    if (!app.selectedPlan) app.selectedPlan = pickSeedPlan(root);
    await prefetchRelated(app);
    // PI6-s2: fire the conflict pre-fetch off the render path, reusing the SAME seeded
    // `app.selectedPlan`, inside this same fail-open guard so activation never breaks the menu.
    await prefetchConflicts(app);
  } catch {
    if (app) { app.relatedPlans = []; app.conflicts = []; } // fail-open — activation never breaks the menu
  }
}

/**
 * Pick a seed plan slug for the Related Plans panel: first in-progress, else first
 * todo, else first implementation draft. Returns null when no plan exists.
 * Fail-open: any read error → null (panel then shows the building/empty state).
 * @param {string} root - project root
 * @returns {string|null}
 */
function pickSeedPlan(root) {
  for (const stage of ['in-progress', 'todo', 'implementation']) {
    try {
      const plans = readPlans(path.join(getPlansDir(root), stage));
      if (Array.isArray(plans) && plans.length > 0 && plans[0] && plans[0].name) {
        return plans[0].name;
      }
    } catch {
      // fall through to the next stage on any read error
    }
  }
  return null;
}

function handleKey(key, app) {
  const root = app.projectPath || process.cwd();
  const prefs = loadDashboardPrefs(root);
  // b: toggle Business, i: toggle Implementation, x: toggle Execution
  if (key.name === 'b' || key.sequence === 'b') {
    prefs.collapsed.business = !prefs.collapsed.business;
    saveDashboardPrefs(prefs, root);
    return true;
  }
  if (key.name === 'i' || key.sequence === 'i') {
    prefs.collapsed.implementation = !prefs.collapsed.implementation;
    saveDashboardPrefs(prefs, root);
    return true;
  }
  if (key.name === 'x' || key.sequence === 'x') {
    prefs.collapsed.execution = !prefs.collapsed.execution;
    saveDashboardPrefs(prefs, root);
    return true;
  }
  return false;
}

module.exports = { render, handleKey, activate, pickSeedPlan, prefetchConflicts, renderConflictPanel };

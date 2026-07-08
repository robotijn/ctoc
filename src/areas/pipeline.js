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
const { c, line, renderFooter } = require('../lib/tui');
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

  out += line() + '\n';
  if (agent.active) {
    out += `${c.green}●${c.reset} Agent: ${c.bold}${agent.plan || 'unknown'}${c.reset}`;
    if (agent.step) out += ` ${c.dim}(step ${agent.step})${c.reset}`;
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
  } catch {
    if (app) app.relatedPlans = []; // fail-open — activation never breaks the menu
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

module.exports = { render, handleKey, activate, pickSeedPlan };

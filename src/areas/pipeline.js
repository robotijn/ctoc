/**
 * Pipeline Area (A3.2 / CTOC v7)
 *
 * Default landing area. Renders the 3-section view (Business / Implementation /
 * Execution) with stage counts. Drill into a stage to browse plans.
 *
 * This area folds the legacy `overview`, `vision`, `functional`, `implementation`,
 * `review`, `todo` tabs into a single area with sectioned navigation.
 */

const { c, line, renderFooter } = require('../lib/tui');
const { getPlanCounts, getAgentStatus, getVisionCounts } = require('../lib/state');
const { SECTIONS, getSectionLabel, getStagesInSection, loadDashboardPrefs, saveDashboardPrefs } = require('../lib/sections');

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

  out += line() + '\n';
  if (agent.active) {
    out += `${c.green}●${c.reset} Agent: ${c.bold}${agent.plan || 'unknown'}${c.reset}`;
    if (agent.step) out += ` ${c.dim}(step ${agent.step})${c.reset}`;
    out += '\n';
  } else {
    out += `${c.dim}○ Agent idle${c.reset}\n`;
  }
  out += '\n';
  out += renderFooter(['b/i/x toggle section', '←/→ areas', 'q quit']);
  return out;
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

module.exports = { render, handleKey };

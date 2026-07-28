/**
 * Overview Tab
 * Shows plan counts, agent status, and release controls
 */

const path = require('path');
const { c, line, renderFooter, stripCtl } = require('../lib/tui');
const { getPlanCounts, getAgentStatus } = require('../lib/state');
const { getVersion, bump } = require('../lib/version');
const { getVisionCounts } = require('./vision');
const safeFs = require('../lib/safe-fs');

/**
 * Read the plan-index build status written by the bootstrap child. Fail-open: a
 * missing OR corrupt `.ctoc/index/build-status.json` yields `null` → NO status line
 * is rendered and the dashboard is unchanged. A read error here must NEVER break the
 * dashboard render (the explicit PI0 constraint; the pi1 / task-reconcile precedent).
 * @param {string} projectPath
 * @returns {{ state?: string, swept?: number, message?: string }|null}
 */
function readIndexStatus(projectPath) {
  try {
    const file = path.join(projectPath, '.ctoc', 'index', 'build-status.json');
    if (!safeFs.existsSync(file)) return null;
    const parsed = JSON.parse(safeFs.readFileSync(file, 'utf8'));
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch {
    return null; // fail-open — never break the dashboard
  }
}

/**
 * PI4-s4: read the plan-index unit count (store.size) through the barrel wiring.
 * Fail-open, SYNCHRONOUS — used only to drive the Scenario-7 "index building"
 * indicator: a zero-unit (or null / unavailable) store means the index has not
 * been built yet, so the Related Plans panel shows a "building" state instead of
 * an empty list. Any error → 0 (treated as "not built"). This NEVER throws into
 * render (the readIndexStatus precedent).
 * @param {string} projectPath
 * @returns {number} number of indexed units, or 0 when unavailable
 */
function readIndexUnitCount(projectPath) {
  try {
    // `search`/`related`/`getWiring` are defined on the barrel via lazy
    // Object.defineProperties getters (see plan-index/index.js) which tsc's static
    // module-shape inference cannot see — cast to any so --checkJs stays neutral.
    /** @type {any} */
    const planIndex = require('../lib/plan-index');
    if (typeof planIndex.getWiring !== 'function') return 0;
    const wiring = planIndex.getWiring({ projectPath });
    const store = wiring && wiring.store;
    if (!store || typeof store.size !== 'number') return 0;
    return store.size;
  } catch {
    return 0; // fail-open — a wiring fault reads as "index building"
  }
}

/**
 * PI4-s4: async-fetch half of the async-fetch/sync-render bridge (ADR-B). Called
 * off the render path (on tab activation / selected-plan change); it awaits the
 * barrel `related(planSlug)` and stashes the result array on `app.relatedPlans`
 * for `renderRelatedPanel` to read SYNCHRONOUSLY. Fail-open: an unavailable /
 * throwing `related` leaves `app.relatedPlans = []` and NEVER rejects — a
 * semantic-feature fault must never break the dashboard (the load-bearing
 * invariant). Bounded to the top 5 neighbours (perceived-latency mitigation).
 * @param {object} app - the TUI app state; `app.projectPath`, `app.selectedPlan`
 * @returns {Promise<void>}
 */
async function prefetchRelated(app) {
  const projectPath = (app && app.projectPath) || process.cwd();
  const seed = app && app.selectedPlan;
  try {
    if (!seed || typeof seed !== 'string') { app.relatedPlans = []; return; }
    /** @type {any} */
    const planIndex = require('../lib/plan-index');
    if (typeof planIndex.related !== 'function') { app.relatedPlans = []; return; }
    const results = await planIndex.related(seed, { projectPath, limit: 5 });
    app.relatedPlans = Array.isArray(results) ? results.slice(0, 5) : [];
  } catch {
    app.relatedPlans = []; // fail-open — never reject, never break render
  }
}

/**
 * PI4-s4: SYNCHRONOUS render half of the bridge. Renders the "Related Plans"
 * panel from the pre-stashed `app.relatedPlans` array. Scenario 7: when the index
 * has zero units (store.size === 0 / unavailable) it renders an "index building"
 * indicator INSTEAD of an (empty/stale) list. Fully fail-open — reads only a
 * cached array + a sync unit count; on any surprise it returns '' so the
 * dashboard renders unchanged (the readIndexStatus precedent).
 * @param {object} app
 * @returns {string} the panel block, or '' when there is nothing to show
 */
function renderRelatedPanel(app) {
  try {
    const projectPath = (app && app.projectPath) || process.cwd();
    const units = readIndexUnitCount(projectPath);
    if (units === 0) {
      // Scenario 7 — index not built yet: show a building indicator, never a list.
      return `${c.bold}Related Plans${c.reset}\n  ${c.dim}index building…${c.reset}\n\n`;
    }
    const related = Array.isArray(app && app.relatedPlans) ? app.relatedPlans : [];
    if (related.length === 0) return ''; // no related plans → omit the panel entirely
    let out = `${c.bold}Related Plans${c.reset}\n`;
    for (const r of related.slice(0, 5)) {
      // R7-A: the related-plan id is an agent-writable slug/path from the index —
      // sanitize before rendering. score is a formatted number — left raw.
      const id = stripCtl((r && (r.planPath || r.planSlug || r.plan)) || '?');
      const score = (r && typeof r.score === 'number') ? ` ${c.dim}${r.score.toFixed(2)}${c.reset}` : '';
      out += `  ${c.cyan}${id}${c.reset}${score}\n`;
    }
    out += '\n';
    return out;
  } catch {
    return ''; // fail-open — a panel fault must NEVER break the dashboard
  }
}

// Release mode state
let releaseMode = false;
let releaseTypeIndex = 0;
/** @type {Array<'patch'|'minor'|'major'>} */
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

  const vision = getVisionCounts(projectPath);

  output += `${c.bold}Pipeline${c.reset}\n`;
  output += `  Vision          ${c.magenta}${vision.total}${c.reset} ${vision.exploring > 0 ? `(${vision.exploring} exploring)` : ''}\n`;
  output += `  Functional      ${c.cyan}${counts.functional}${c.reset} drafts\n`;
  output += `  Implementation  ${c.cyan}${counts.implementation}${c.reset} drafts\n`;
  output += `  Todo            ${c.cyan}${counts.todo}${c.reset} queued\n`;
  output += `  In Progress     ${c.cyan}${counts.inProgress}${c.reset} active\n`;
  output += `  Review          ${c.cyan}${counts.review}${c.reset} pending\n`;

  // Semantic index build status (fail-open — omitted entirely when unavailable).
  const idx = readIndexStatus(projectPath);
  if (idx) {
    if (idx.state === 'building') {
      output += `  ${c.dim}Semantic Index  building… ${idx.swept || 0} plans${c.reset}\n`;
    } else if (idx.state === 'ready') {
      output += `  ${c.dim}Semantic Index  ready (${idx.swept || 0} plans)${c.reset}\n`;
    } else if (idx.state === 'error') {
      output += `  ${c.yellow}Semantic Index  unavailable — ${idx.message || 'see logs'}${c.reset}\n`;
    }
  }
  output += '\n';

  // PI4-s4: Related Plans panel (additive, fail-open). Renders directly under the
  // Semantic Index status line; on any fault it returns '' and the dashboard is
  // unchanged (the readIndexStatus precedent).
  output += renderRelatedPanel(app);

  output += line() + '\n\n';

  output += `${c.bold}Agent Status${c.reset}\n`;
  if (agent.unreadable) {
    // The registry could not be read (an OS-level error out of state.getAgentStatus).
    // This is NOT idle — an agent may be running — so it replaces the idle line in the
    // block's two-column shape. The message is already stripped + bounded (state.msgOf).
    output += `  ${c.red}⛔${c.reset} Unknown        the task registry could not be read — this is not "idle"\n`;
  } else if (agent.active) {
    output += `  ${c.green}●${c.reset} Running       ${c.bold}${stripCtl(agent.name)}${c.reset}\n`;
    // R7-A: step + phase come from the agent-writable `.ctoc/state/agent.json` detail
    // record — free text, not fixed enums. Sanitize before they reach the terminal.
    output += `                  Step ${stripCtl(agent.step)}/16 ${c.cyan}${stripCtl(agent.phase)}${c.reset}\n`;
    if (agent.task) {
      output += `                  Task: ${stripCtl(agent.task)}\n`;
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
    if (key.name === 'escape' || key.name === 'b' || key.sequence === '0') {
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

module.exports = { render, handleKey, reset, renderRelatedPanel, prefetchRelated };

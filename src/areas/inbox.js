/**
 * Inbox Area (A3.2 / CTOC v7)
 *
 * The async-overnight surface. Three queues:
 *   - Morning questions raised by agents
 *   - Decisions documented under ambiguity, awaiting review
 *   - Plans waiting at human gates (1 / 2 / 3)
 */

const { c, line, renderFooter, stripCtl } = require('../lib/tui');
const { getInboxCounts, listQuestions, listDecisions, listPlansAtGates, listRelatedForInbox } = require('../lib/inbox');
const gateWords = require('../lib/gate-words');

function render(app) {
  const root = app.projectPath || process.cwd();
  const counts = getInboxCounts(root);
  const total = counts.questions + counts.decisions + counts.gatesWaiting;

  let out = '\n';
  out += `${c.bold}Inbox${c.reset}\n\n`;

  if (total === 0) {
    out += `  ${c.dim}○ Inbox clear — no async items waiting${c.reset}\n\n`;
    out += `  ${c.dim}Items appear here when:${c.reset}\n`;
    out += `  ${c.dim}- An agent raises a question during overnight execution${c.reset}\n`;
    out += `  ${c.dim}- The implementer documents a choice under ambiguity${c.reset}\n`;
    out += `  ${c.dim}- A plan crosses a human gate awaiting your approval${c.reset}\n`;
  } else {
    out += `  ${c.bold}Questions${c.reset}        ${counts.questions > 0 ? c.yellow : c.dim}${counts.questions}${c.reset}\n`;
    out += `  ${c.bold}Decisions${c.reset}        ${counts.decisions > 0 ? c.yellow : c.dim}${counts.decisions}${c.reset}\n`;
    out += `  ${c.bold}Plans at gates${c.reset}   ${counts.gatesWaiting > 0 ? c.cyan : c.dim}${counts.gatesWaiting}${c.reset}\n\n`;

    if (counts.questions > 0) {
      out += `${c.bold}Open questions${c.reset}\n`;
      for (const q of listQuestions(root).slice(0, 5)) {
        out += `  ${c.dim}${stripCtl(q.source_plan || '?')}/${stripCtl(q.source_step || '?')}${c.reset} ${stripCtl(q.id || '')}\n`;
      }
      out += '\n';
    }
    if (counts.decisions > 0) {
      out += `${c.bold}Pending decisions${c.reset}\n`;
      for (const d of listDecisions(root).slice(0, 5)) {
        out += `  ${c.dim}${stripCtl(d.plan || '?')}/${stripCtl(d.step || '?')}${c.reset} ${stripCtl(d.id || '')}\n`;
      }
      out += '\n';
    }
    if (counts.gatesWaiting > 0) {
      out += `${c.bold}Plans at gates${c.reset}\n`;
      for (const p of listPlansAtGates(root).slice(0, 10)) {
        // Say the DECISION waiting, not the gate number: a person cannot decode
        // "Gate 3", and being handed one reads as evasive. gate-words maps the stage
        // the plan is sitting in to the compact human label for the choice it awaits
        // ("Finished?", "Build it?"). The stage stays in parentheses as orientation.
        out += `  ${c.cyan}${stripCtl(p.plan)}${c.reset} ${c.dim}— ${gateWords.chip(p.stage)} (${stripCtl(p.stage)})${c.reset}\n`;
      }
      out += '\n';
    }
  }

  // PI4-s4: Related-plans block (additive, fail-open). Reads a pre-fetched array
  // stashed on `app.inboxRelated` via lib/inbox's `listRelatedForInbox` (the
  // async-fetch/sync-render bridge). Absent/empty → the block is omitted and the
  // inbox render is unchanged; this never throws.
  out += renderInboxRelated(app);

  out += line() + '\n';
  out += renderFooter(['←/→ areas', 'q quit']);
  return out;
}

/**
 * PI4-s4: SYNCHRONOUS render of the inbox Related-plans block from the pre-stashed
 * `app.inboxRelated` array. Fail-open: absent/empty/non-array → '' (block omitted);
 * on any surprise returns '' so the inbox render is never broken.
 * @param {object} app
 * @returns {string} the related block, or '' when there is nothing to show
 */
function renderInboxRelated(app) {
  try {
    const related = Array.isArray(app && app.inboxRelated) ? app.inboxRelated : [];
    if (related.length === 0) return '';
    let out = `${c.bold}Related plans${c.reset}\n`;
    for (const r of related.slice(0, 5)) {
      // R7-A: the related-plan id is an agent-writable slug/path — sanitize before
      // rendering (same trust class as overview.renderRelatedPanel's id).
      const id = stripCtl((r && (r.planPath || r.planSlug || r.plan)) || '?');
      const score = (r && typeof r.score === 'number') ? ` ${c.dim}${r.score.toFixed(2)}${c.reset}` : '';
      out += `  ${c.cyan}${id}${c.reset}${score}\n`;
    }
    out += '\n';
    return out;
  } catch {
    return ''; // fail-open — never break the inbox render
  }
}

/**
 * PI4-s4 kickback: async-fetch half of the inbox related-plans bridge. Called on
 * inbox area activation (tab switch into inbox), OFF the render path. Seeds a slug
 * from the first plan waiting at a gate (the plan the human is most likely acting
 * on), fetches its related plans via `listRelatedForInbox`, and stashes the array
 * on `app.inboxRelated` for `renderInboxRelated` to read SYNCHRONOUSLY. Fully
 * fail-open: no plan-at-gate / unavailable barrel / any error → `app.inboxRelated = []`
 * and NEVER throws or rejects. The caller fires this fire-and-forget and re-renders.
 * @param {object} app - TUI app state; uses/sets `app.projectPath`, `app.selectedPlan`, `app.inboxRelated`
 * @returns {Promise<void>}
 */
async function activate(app) {
  try {
    const root = (app && app.projectPath) || process.cwd();
    let seed = app && app.selectedPlan;
    if (typeof seed !== 'string' || seed.length === 0) {
      const gated = listPlansAtGates(root);
      seed = (Array.isArray(gated) && gated[0] && gated[0].plan) || null;
    }
    if (!seed) { app.inboxRelated = []; return; }
    app.inboxRelated = await listRelatedForInbox(seed, root);
  } catch {
    if (app) app.inboxRelated = []; // fail-open — activation never breaks the menu
  }
}

function handleKey(_key, _app) {
  return false;
}

module.exports = { render, handleKey, activate };

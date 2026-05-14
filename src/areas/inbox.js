/**
 * Inbox Area (A3.2 / CTOC v7)
 *
 * The async-overnight surface. Three queues:
 *   - Morning questions raised by agents
 *   - Decisions documented under ambiguity, awaiting review
 *   - Plans waiting at human gates (1 / 2 / 3)
 */

const { c, line, renderFooter } = require('../lib/tui');
const { getInboxCounts, listQuestions, listDecisions, listPlansAtGates } = require('../lib/inbox');

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
        out += `  ${c.dim}${q.source_plan || '?'}/${q.source_step || '?'}${c.reset} ${q.id || ''}\n`;
      }
      out += '\n';
    }
    if (counts.decisions > 0) {
      out += `${c.bold}Pending decisions${c.reset}\n`;
      for (const d of listDecisions(root).slice(0, 5)) {
        out += `  ${c.dim}${d.plan || '?'}/${d.step || '?'}${c.reset} ${d.id || ''}\n`;
      }
      out += '\n';
    }
    if (counts.gatesWaiting > 0) {
      out += `${c.bold}Plans at gates${c.reset}\n`;
      for (const p of listPlansAtGates(root).slice(0, 10)) {
        out += `  ${c.dim}Gate ${p.gate}${c.reset} ${c.cyan}${p.plan}${c.reset} ${c.dim}(${p.stage})${c.reset}\n`;
      }
      out += '\n';
    }
  }

  out += line() + '\n';
  out += renderFooter(['←/→ areas', 'q quit']);
  return out;
}

function handleKey(_key, _app) {
  return false;
}

module.exports = { render, handleKey };

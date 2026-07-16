/**
 * Agent Area (A3.2 / CTOC v7)
 *
 * Agent control center: status, active plan, step, token budget, schedule.
 * Folds the legacy `progress` tab and parts of `tools`.
 */

const { c, line, renderFooter, stripCtl } = require('../lib/tui');
const { getAgentStatus } = require('../lib/state');

function render(app) {
  const root = app.projectPath || process.cwd();
  const agent = getAgentStatus(root);

  let out = '\n';
  out += `${c.bold}Agent${c.reset}\n\n`;

  if (agent.active) {
    out += `  ${c.green}●${c.reset} ${c.bold}Active${c.reset}\n`;
    out += `  Plan       ${c.cyan}${stripCtl(agent.plan || 'unknown')}${c.reset}\n`;
    if (agent.step)    out += `  Step       ${agent.step}/16  ${c.cyan}${agent.phase || ''}${c.reset}\n`;
    if (agent.task)    out += `  Task       ${stripCtl(agent.task)}\n`;
    if (agent.elapsed) out += `  Elapsed    ${c.dim}${agent.elapsed}${c.reset}\n`;
    if (agent.pid)     out += `  PID        ${c.dim}${agent.pid}${c.reset}\n`;
    out += '\n';
    out += `  ${c.dim}Press 'x' to request stop (graceful — after current plan)${c.reset}\n`;
  } else if (agent.stale) {
    out += `  ${c.yellow}⚠${c.reset} ${c.bold}Stale lock${c.reset}\n`;
    out += `  Plan was: ${c.dim}${stripCtl(agent.stalePlan || 'unknown')}${c.reset} (process died)\n`;
    out += `  ${c.dim}Run /ctoc:menu to clean up.${c.reset}\n`;
  } else {
    out += `  ${c.dim}○ Idle${c.reset}\n`;
    out += `  No active plan.\n`;
    out += '\n';
    out += `  ${c.dim}Press 'g' to start the agent on the next todo plan${c.reset}\n`;
  }

  out += '\n' + line() + '\n';
  // Footer advertises ONLY keys that work here: g=start, x=stop (x because `s` is
  // the global Settings mnemonic). There is no agent sub-mode to back out of, so
  // `b` is intentionally not advertised — area navigation is the arrows / digits.
  out += renderFooter(['g start', 'x stop', '←/→ areas', 'q quit']);
  return out;
}

// Owner-approved lowercase bindings: g = start the agent on the next todo plan,
// x = request a graceful stop. Both are wired to the real actions.js functions and
// NEVER a silent dead key — an out-of-context press (g while running, x while idle)
// returns true and sets a one-line status message. `state`/`actions` are resolved
// through the module object (not destructured) so liveness reads the live registry
// and tests can stub them.
function handleKey(key, app) {
  const seq = key ? (key.sequence || key.name) : undefined;
  if (seq !== 'g' && seq !== 'x') return false;

  const root = (app && app.projectPath) || process.cwd();
  const state = require('../lib/state');
  const actions = require('../lib/actions');
  const status = state.getAgentStatus(root);

  if (seq === 'g') {
    if (status.active) {
      if (app) app.message = `Agent already running on ${status.plan || 'a plan'}`;
      return true;
    }
    // Human-initiated menu start: force clears any drain-stop (see startAgent docs).
    const res = actions.startAgent(root, { force: true });
    if (app) {
      if (res && res.started) {
        app.message = `Agent started on ${(res.plan && res.plan.name) || 'the next todo plan'}`;
      } else if (res && res.drainStopped) {
        app.message = 'Agent is drain-stopped; nothing new started';
      } else if (res && res.queued) {
        app.message = `Queued: ${res.reason || 'waiting for a slot'}`;
      } else if (res && res.error) {
        app.message = res.error;
      } else {
        app.message = 'Nothing to start (todo queue empty)';
      }
    }
    return true;
  }

  // seq === 'x' — graceful stop.
  if (!status.active) {
    if (app) app.message = 'No agent is running';
    return true;
  }
  const res = actions.stopAgent(root);
  if (app) app.message = (res && res.message) || 'Stop requested';
  return true;
}

module.exports = { render, handleKey };

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

  if (agent.unreadable) {
    // The registry could not be READ (an OS-level error out of state.getAgentStatus).
    // This is NOT "idle" — an agent may be running right now — so it renders its own block
    // above `agent.active`, in the register of the existing `⚠ Stale lock` block. The
    // message is already stripped + bounded at the source (state.msgOf).
    out += `  ${c.red}⛔${c.reset} ${c.bold}Unknown${c.reset}\n`;
    out += `  The agent status could not be read — this is not "idle".\n`;
    out += `  The task registry could not be read: ${agent.unreadable}\n`;
    out += `  An agent may be running right now; do not assume the pipeline is stopped.\n`;
  } else if (agent.active) {
    out += `  ${c.green}●${c.reset} ${c.bold}Active${c.reset}\n`;
    out += `  Plan       ${c.cyan}${stripCtl(agent.plan || 'unknown')}${c.reset}\n`;
    // R7-A: step + phase are read from the agent-writable `.ctoc/state/agent.json`
    // detail record (see state.getAgentStatus) — free text, NOT fixed enums.
    // Sanitize before they reach the terminal.
    if (agent.step)    out += `  Step       ${stripCtl(agent.step)}/16  ${c.cyan}${stripCtl(agent.phase || '')}${c.reset}\n`;
    if (agent.task)    out += `  Task       ${stripCtl(agent.task)}\n`;
    if (agent.elapsed) out += `  Elapsed    ${c.dim}${agent.elapsed}${c.reset}\n`;
    if (agent.pid)     out += `  PID        ${c.dim}${agent.pid}${c.reset}\n`;
    out += '\n';
    out += `  ${c.dim}Press 'x' to request stop (graceful — after current plan)${c.reset}\n`;
  } else if (agent.stale) {
    out += `  ${c.yellow}⚠${c.reset} ${c.bold}Stale lock${c.reset}\n`;
    out += `  Plan was: ${c.dim}${stripCtl(agent.stalePlan || 'unknown')}${c.reset} (process died)\n`;
    out += `  ${c.dim}Run /ctoc:start to clean up.${c.reset}\n`;
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

// Summarize the scheduler's skip list into a status-line suffix (plan 00145). A plan
// the FIFO walk refused (e.g. an unreadable dependency list) is recorded in
// startAgent's `skipped[]` but was invisible to the human — a refusal with no stated
// reason is a plan blocked in silence. This renders the first skipped plan and its
// reason so the person who pressed `g` learns what was refused and why.
//
// '' when there is nothing to say (some startAgent returns omit the field). The plan
// name and the reason both go through stripCtl, and the whole suffix is capped at 160
// characters AFTER stripping so one hostile plan cannot blow up the status line.
function summarizeSkipped(skipped) {
  if (!Array.isArray(skipped) || skipped.length === 0) return '';
  const first = skipped[0] || {};
  const name = stripCtl(String(first.plan == null ? 'a plan' : first.plan));
  const reason = stripCtl(String(first.reason == null ? 'no reason given' : first.reason));
  const more = skipped.length > 1 ? ` +${skipped.length - 1} more` : '';
  const suffix = ` — ${skipped.length} plan(s) skipped: ${name} (${reason})${more}`;
  return suffix.length > 160 ? suffix.slice(0, 160) : suffix;
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
    if (status.unreadable) {
      // The registry could not be read, so liveness is UNKNOWN. Starting a second agent on
      // the same file set is the damage this key can do, and actions.startAgent would itself
      // throw on the same unreadable registry. Under uncertainty, REFUSE the damaging action
      // — do not call startAgent.
      if (app) app.message = 'Agent status could not be read — refusing to start; an agent may already be running.';
      return true;
    }
    if (status.active) {
      // R7-A: status.plan is the agent-writable task-registry slug (.ctoc/**); it flows
      // into app.message, which the mount renders. Sanitize at the source.
      if (app) app.message = `Agent already running on ${stripCtl(status.plan || 'a plan')}`;
      return true;
    }
    // Human-initiated menu start: force clears any drain-stop (see startAgent docs).
    const res = actions.startAgent(root, { force: true });
    if (app) {
      // A refused plan (unreadable dependency list, no files:) is recorded in
      // res.skipped by the FIFO walk; append it so the human sees what was refused and
      // why (plan 00145). The suffix is '' when nothing was skipped, so the base
      // message texts are byte-identical to before on the common path. The drainStopped
      // branch takes no suffix — nothing was walked, so nothing was skipped.
      const skips = summarizeSkipped(res && res.skipped);
      if (res && res.started) {
        // R7-A: res.plan.name is the agent-writable plan title/slug; sanitize at the source.
        app.message = `Agent started on ${stripCtl((res.plan && res.plan.name) || 'the next todo plan')}${skips}`;
      } else if (res && res.drainStopped) {
        app.message = 'Agent is drain-stopped; nothing new started';
      } else if (res && res.queued) {
        app.message = `Queued: ${res.reason || 'waiting for a slot'}${skips}`;
      } else if (res && res.error) {
        app.message = `${res.error}${skips}`;
      } else {
        app.message = `Nothing to start (todo queue empty)${skips}`;
      }
    }
    return true;
  }

  // seq === 'x' — graceful stop.
  // Under an unknown status the asymmetry with `g` is deliberate: refuse the action that can
  // do damage (start), ALLOW the action that can only reduce activity (stop). Requesting a
  // stop when nothing is running is inert; refusing one when something IS running strands the
  // human. So on `unreadable` we PROCEED — but stopAgent itself can throw on the same
  // unreadable registry, so it is wrapped and the failure is reported BY NAME rather than the
  // unconditional "Stop requested", which would be a claim about a write that did not happen.
  if (status.unreadable) {
    try {
      const res = actions.stopAgent(root);
      if (app) app.message = (res && res.message) || 'Stop requested';
    } catch (err) {
      if (app) app.message = `Stop could not be requested — ${stripCtl(String(err && err.message ? err.message : err))}`;
    }
    return true;
  }
  if (!status.active) {
    if (app) app.message = 'No agent is running';
    return true;
  }
  const res = actions.stopAgent(root);
  if (app) app.message = (res && res.message) || 'Stop requested';
  return true;
}

module.exports = { render, handleKey };

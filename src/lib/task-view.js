/**
 * NB2 — Task view (pure renderers over an NB1 registry VALUE).
 *
 * Formats a background-task registry into strings / screen fragments so
 * `menu-screens.js` stays thin and the rendering is unit-testable with in-memory
 * literals. Every function here is DETERMINISTIC: no filesystem, no mutation, no
 * clock. The only dependency is the PURE `canRun` from `./task-registry` (used to
 * annotate a queued task's wait reason) and Node's `path` for basename extraction
 * — neither touches the disk at call time.
 *
 * Design (see plans/todo/NB2-menu-task-wiring.md):
 *   • Empty / absent registry → '' for the section, inbox and list fragments and a
 *     safe "no tasks" screen for the board — so an empty registry adds ZERO output
 *     to the dashboard (regression-safe).
 *   • Rule 1 (numbers open plans ONLY) is sacred: the board is selected by free-text
 *     `t<n>` ids (never bare digits); the detail screen is selected by label.
 *   • The detail next-action NAVIGATES (a `plan …`/`browse …` route string) — it
 *     NEVER performs a mutation and NEVER crosses a human gate. NB2 stores and
 *     renders the metadata the caller supplied; it decides nothing.
 *   • Every attacker-influenceable field (label, plan, kind, summary) is passed
 *     through `stripCtl` (C0/C1 control-char strip) before rendering.
 */

'use strict';

const path = require('path');
const { canRun } = require('./task-registry');

// ── module-local helpers (not exported) ─────────────────────────────────────

// Security (S1): strip C0 (0x00-0x1F) and C1 (0x7F-0x9F) control chars before
// rendering any attacker-influenceable string. Mirrors menu-screens.js's
// sanitizer. Literal regex (allowed — the security lint bans `new RegExp` on a
// non-literal, not literal control-char classes).
const stripCtl = (s) => String(s == null ? '' : s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');

// Terminal statuses (mirror of NB1's frozen set — NB1 does not export it).
const TERMINAL = new Set(['done', 'failed', 'orphaned']);

/**
 * The human-readable plan name of a task: the basename of `plan` without `.md`,
 * control-stripped. `''` when the task carries no plan.
 * @param {{plan?:string|null}} task
 * @returns {string}
 */
function planName(task) {
  if (!task || task.plan == null) return '';
  const base = path.basename(String(task.plan)).replace(/\.md$/, '');
  return stripCtl(base);
}

/**
 * A one-line human label for a task: `${kind} ${planName || label || id}`,
 * sanitized.
 * @param {object} task
 * @returns {string}
 */
function taskLabel(task) {
  if (!task) return '';
  const name = planName(task) || stripCtl(task.label) || stripCtl(task.id);
  return `${stripCtl(task.kind)} ${name}`.trim();
}

/**
 * Group a registry's tasks by status. `failed` includes `orphaned` and any
 * result.cancelled entries (rendered as "cancelled"). Defensive against a null
 * registry or malformed entries.
 * @param {{tasks?:Array<object>}} registry
 * @returns {{running:object[], queued:object[], done:object[], failed:object[]}}
 */
function byStatus(registry) {
  const out = { running: [], queued: [], done: [], failed: [] };
  const tasks = registry && Array.isArray(registry.tasks) ? registry.tasks : [];
  for (const t of tasks) {
    if (!t || typeof t.status !== 'string') continue;
    if (t.status === 'running') out.running.push(t);
    else if (t.status === 'queued') out.queued.push(t);
    else if (t.status === 'done') out.done.push(t);
    else if (t.status === 'failed' || t.status === 'orphaned') out.failed.push(t);
  }
  return out;
}

/**
 * The reason a queued task is waiting, resolved to human names. For a blocked-dep
 * the dep ids are resolved to the dep task's planName/label so "waits: pi1" reads
 * by name. Any throw in the pure scheduler degrades to the generic label.
 * @param {object} task
 * @param {{tasks?:Array<object>}} registry
 * @returns {string}
 */
function waitReason(task, registry) {
  try {
    const reg = /** @type {{tasks:Array<object>}} */ (
      registry && Array.isArray(registry.tasks) ? registry : { tasks: [] }
    );
    const r = canRun(task, reg);
    if (r.run) return 'ready';
    if (r.reason === 'blocked-dep') {
      const deps = Array.isArray(task.blockedBy) ? task.blockedBy : [];
      const tasks = registry && Array.isArray(registry.tasks) ? registry.tasks : [];
      const names = deps.map((id) => {
        const dep = tasks.find((t) => t.id === id);
        return dep ? (planName(dep) || stripCtl(dep.label) || stripCtl(dep.id)) : stripCtl(id);
      }).filter(Boolean);
      return names.length ? names.join(', ') : 'blocked-dep';
    }
    return r.reason;
  } catch {
    return 'queued';
  }
}

// ── exports ──────────────────────────────────────────────────────────────────

/**
 * The dashboard TASKS section (running / queued / done counts + queued wait
 * reasons). Returns `''` when there are no tasks in any surfaced status so an
 * empty/absent registry adds NOTHING to the dashboard. No leading blank line
 * (the caller owns spacing); each line ends in `\n`.
 * @param {{tasks?:Array<object>}} registry
 * @returns {string}
 */
function renderTasksSection(registry) {
  const g = byStatus(registry);
  if (!g.running.length && !g.queued.length && !g.done.length && !g.failed.length) return '';

  let out = 'TASKS\n';
  if (g.running.length) {
    const labels = g.running.slice(0, 6).map(taskLabel);
    let line = labels.join(' · ');
    if (g.running.length > 6) line += ` … +${g.running.length - 6}`;
    out += `  ▶ ${g.running.length} running   ${line}\n`;
  }
  if (g.queued.length) {
    const first = g.queued[0];
    out += `  ⏸ ${g.queued.length} queued    ${taskLabel(first)} (waits: ${waitReason(first, registry)})\n`;
  }
  if (g.done.length) {
    const awaiting = g.done.filter((t) => !(t.result && t.result.reviewed)).length;
    out += `  ✓ ${g.done.length} done → ${awaiting} awaiting review\n`;
  }
  if (g.failed.length) {
    const f = g.failed[0];
    const suffix = f.result && f.result.cancelled ? ' (cancelled)' : '';
    out += `  ✗ ${g.failed.length} failed   ${taskLabel(f)}${suffix}\n`;
  }
  return out;
}

/**
 * The task-board screen: tasks grouped by status heading, each row selectable by
 * its `t<n>` id (free text — Rule 1: never a bare digit). No `ask` key (mirrors
 * `plan-select`); the driver shows `text` and takes a free-text reply.
 * @param {{tasks?:Array<object>}} registry
 * @returns {{text:string, inputMode:'task-select', prompt:string, actions:Object}}
 */
function renderTaskBoard(registry) {
  const g = byStatus(registry);
  const actions = { b: '', back: '' };
  let text = `Background Tasks\n${'─'.repeat(40)}\n`;

  const total = g.running.length + g.queued.length + g.done.length + g.failed.length;
  if (total === 0) {
    text += '\n  No background tasks.\n\n\n';
    return {
      text,
      inputMode: 'task-select',
      prompt: "No background tasks. Reply 'b' for back.",
      actions,
    };
  }

  const groups = [
    ['Running', g.running],
    ['Queued', g.queued],
    ['Done', g.done],
    ['Failed', g.failed],
  ];
  for (const [heading, list] of groups) {
    if (!list.length) continue;
    text += `\n${heading} (${list.length})\n`;
    for (const t of list) {
      const status = t.result && t.result.cancelled ? 'cancelled' : t.status;
      let suffix = '';
      if (t.status === 'done' && t.result && Number.isInteger(t.result.gate)) {
        suffix = ` → Gate ${t.result.gate} ready`;
      }
      text += `  • ${stripCtl(t.id)}  ${taskLabel(t)}  [${status}]${suffix}\n`;
      actions[t.id] = `task ${t.id}`;
    }
  }
  text += "\n  Reply with a task id (e.g. t3) to open it, or 'b' for back.\n\n\n";

  return {
    text,
    inputMode: 'task-select',
    prompt: "Reply with a task id (e.g. t3) to open it, or 'b' for back.",
    actions,
  };
}

/**
 * The task-detail screen. Unknown / null id → a safe "Task not found" screen whose
 * only option navigates back to the board. A done task carrying `result.nextAction`
 * offers a single navigating option (label `Gate N ready ▸` when `result.gate` is
 * set, else `Open <plan> ▸`) whose action is the NAV route string — never a
 * `claude:` mutation, never a gate cross. Always a final `◀ Back` → `tasks`.
 * Selection is by label (never a digit).
 * @param {{tasks?:Array<object>}} registry
 * @param {string} id
 * @returns {{text:string, ask:Object, actions:Object}}
 */
function renderTaskDetail(registry, id) {
  const tasks = registry && Array.isArray(registry.tasks) ? registry.tasks : [];
  const task = id == null ? null : tasks.find((t) => t.id === id);

  if (!task) {
    return {
      text: `Task not found: ${stripCtl(String(id == null ? '' : id))}\n${'─'.repeat(40)}\n\n  No such background task.\n\n\n`,
      ask: {
        questions: [{
          question: 'Task not found.',
          header: 'Task',
          options: [{ label: '◀ Back', description: 'Return to the task board' }],
        }],
      },
      actions: { '◀ Back': 'tasks' },
    };
  }

  const status = task.result && task.result.cancelled ? 'cancelled' : task.status;
  let text = `Task ${stripCtl(task.id)}\n${'─'.repeat(40)}\n\n`;
  text += `  kind:   ${stripCtl(task.kind)}\n`;
  text += `  plan:   ${planName(task) || '(none)'}\n`;
  text += `  status: ${status}\n`;
  if (TERMINAL.has(task.status) && task.result && task.result.summary) {
    text += `  result: ${stripCtl(task.result.summary)}\n`;
  }
  text += '\n\n\n';

  const options = [];
  const actions = {};
  if (task.status === 'done' && task.result && task.result.nextAction) {
    const gate = Number.isInteger(task.result.gate) ? task.result.gate : null;
    const label = gate != null ? `Gate ${gate} ready ▸` : `Open ${planName(task) || 'next'} ▸`;
    options.push({ label, description: 'Navigate to the next action (does not perform it)' });
    actions[label] = String(task.result.nextAction);
  }
  options.push({ label: '◀ Back', description: 'Return to the task board' });
  actions['◀ Back'] = 'tasks';

  return {
    text,
    ask: { questions: [{ question: 'Task detail.', header: 'Task', options }] },
    actions,
  };
}

/**
 * The INBOX pull-notice fragment for completed background work. Returns `''` when
 * there are no done tasks (so it never perturbs the "Inbox clear" state). Otherwise
 * a `⊙ N background tasks done — awaiting review` line, plus one
 * `⊙ Gate N ready — <plan>` line per gate-ready done task (cap 5). Newline-terminated.
 * @param {{tasks?:Array<object>}} registry
 * @returns {string}
 */
function tasksInboxLine(registry) {
  const g = byStatus(registry);
  if (!g.done.length) return '';
  let out = `  ⊙ ${g.done.length} background task${g.done.length === 1 ? '' : 's'} done — awaiting review\n`;
  const gated = g.done.filter((t) => t.result && Number.isInteger(t.result.gate)).slice(0, 5);
  for (const t of gated) {
    out += `  ⊙ Gate ${t.result.gate} ready — ${planName(t) || stripCtl(t.label) || stripCtl(t.id)}\n`;
  }
  return out;
}

/**
 * A one-line-per-task list for `menu task list`'s human `text`. `''` when empty.
 * @param {{tasks?:Array<object>}} registry
 * @returns {string}
 */
function renderTaskList(registry) {
  const tasks = registry && Array.isArray(registry.tasks) ? registry.tasks : [];
  if (!tasks.length) return '';
  let out = '';
  for (const t of tasks) {
    const status = t.result && t.result.cancelled ? 'cancelled' : t.status;
    out += `  ${stripCtl(t.id)}  ${stripCtl(t.kind)}  ${planName(t) || stripCtl(t.label) || '-'}  [${status}]\n`;
  }
  return out;
}

module.exports = {
  renderTasksSection,
  renderTaskBoard,
  renderTaskDetail,
  tasksInboxLine,
  renderTaskList,
};

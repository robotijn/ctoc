/**
 * State Management
 * Handles plan files, agent status, and navigation
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { readStatus, getStatusIcon } = require('./background');
const { findProjectRoot } = require('./project-root');
const { memoize } = require('./cache');
const { parseFrontmatter } = require('./frontmatter');

// Get plans directory (always from project root)
function getPlansDir(projectPath) {
  const root = projectPath || findProjectRoot();
  return path.join(root, 'plans');
}

// Read plans from a directory
function readPlans(dirPath) {
  if (!safeFs.existsSync(dirPath)) {
    return [];
  }

  // Fail-soft per file: one unreadable/unparseable entry must NOT crash the
  // whole reader. readdirSync lists names, but a name ending in `.md` can be a
  // DIRECTORY (readFileSync → EISDIR), a broken symlink (statSync → ENOENT), an
  // unreadable file (EACCES), or vanish in a readdir→read race with an agent
  // moving a plan (ENOENT). safe-fs delegates to fs and THROWS on any of these;
  // an un-caught throw here takes down getPlanCounts and the entire dashboard.
  // We stat+read+build each plan in isolation, SKIP (omit) any entry that
  // faults, warn once to stderr (matching the codebase's fail-open hook style),
  // and keep going. Only the per-file IO/parse is caught — the surrounding
  // control flow still surfaces genuine programming bugs. The happy path is
  // byte-for-byte unchanged: valid plans yield the same objects in the same order.
  const files = safeFs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dirPath, f);
      try {
        const stat = safeFs.statSync(filePath);
        const content = safeFs.readFileSync(filePath, 'utf8');
        const metadata = parseMetadata(content);

        // Read background processing status
        const bgStatus = readStatus(filePath);

        return {
          name: f.replace('.md', ''),
          path: filePath,
          created: stat.birthtime,
          modified: stat.mtime,
          ago: timeAgo(stat.mtime),
          metadata,
          content,
          // Background processing status
          bgStatus: bgStatus.status,
          bgAgent: bgStatus.agent || null,
          bgMessage: bgStatus.message || null,
          bgIcon: getStatusIcon(bgStatus.status)
        };
      } catch (err) {
        // Skip the unreadable entry; do NOT pretend it succeeded.
        process.stderr.write(
          `[ctoc] skipping unreadable plan ${filePath}: ${(err && err.message) || err}\n`
        );
        return null;
      }
    })
    .filter(Boolean);

  // The todo stage honors an explicit, mutable ordering key
  // (.ctoc/state/todo-order.json) so a queue reorder is genuinely observable
  // (finding H10). applyTodoOrder is fail-safe: any error falls back to the
  // FIFO birthtime sort, and it is a no-op when the order file is absent, so
  // every other stage and every legacy todo dir behaves exactly as before.
  if (path.basename(dirPath) === 'todo') {
    return applyTodoOrder(files, dirPath);
  }

  // Sort oldest first (FIFO). `created` is a Date; Date−Date coerces via valueOf()
  // at runtime — the `any` casts preserve that while satisfying checkJs.
  files.sort((a, b) => /** @type {any} */ (a.created) - /** @type {any} */ (b.created));

  return files;
}

// Read the ordered *.md basename list for a todo directory. Any basename listed
// in <root>/.ctoc/state/todo-order.json comes first (in that array order, if it
// still exists on disk), then any remaining on-disk *.md sorted by birthtime
// (FIFO fallback, with an alphabetical name tiebreaker for deterministic order
// under coarse birthtime granularity). The result always covers every on-disk
// *.md exactly once. Fail-safe: any error yields pure birthtime/name order.
// This is the SINGLE source of truth for todo ordering, shared with actions.js'
// moveUpInQueue/moveDownInQueue so display order and swap order can never diverge.
function readTodoQueueOrder(todoDir) {
  const onDisk = safeFs.readdirSync(todoDir).filter(f => f.endsWith('.md'));

  const birthtime = new Map();
  onDisk.forEach(f => {
    try {
      birthtime.set(f, safeFs.statSync(path.join(todoDir, f)).birthtime.getTime());
    } catch {
      birthtime.set(f, 0);
    }
  });
  const byBirth = (a, b) =>
    (birthtime.get(a) - birthtime.get(b)) || (a < b ? -1 : a > b ? 1 : 0);

  let listed = [];
  try {
    const orderFile = path.join(todoDir, '..', '..', '.ctoc', 'state', 'todo-order.json');
    if (safeFs.existsSync(orderFile)) {
      const parsed = JSON.parse(safeFs.readFileSync(orderFile, 'utf8'));
      if (Array.isArray(parsed)) {
        listed = parsed.filter(n => typeof n === 'string');
      }
    }
  } catch {
    listed = []; // corrupt/unreadable order file → pure birthtime order
  }

  const onDiskSet = new Set(onDisk);
  const ordered = [];
  const seen = new Set();
  for (const name of listed) {
    if (onDiskSet.has(name) && !seen.has(name)) {
      ordered.push(name);
      seen.add(name);
    }
  }
  const remaining = onDisk.filter(f => !seen.has(f)).sort(byBirth);
  return ordered.concat(remaining);
}

// Reorder the readPlans() result objects for a todo directory to match
// readTodoQueueOrder(). Fail-safe: on any error, falls back to the FIFO
// birthtime sort so readPlans never throws. Not exported.
function applyTodoOrder(files, dirPath) {
  try {
    const order = readTodoQueueOrder(dirPath);
    const rank = new Map(order.map((name, i) => [name, i]));
    return files.slice().sort((a, b) => {
      const ra = rank.has(path.basename(a.path)) ? rank.get(path.basename(a.path)) : Infinity;
      const rb = rank.has(path.basename(b.path)) ? rank.get(path.basename(b.path)) : Infinity;
      if (ra !== rb) return ra - rb;
      return a.created - b.created;
    });
  } catch {
    return files.slice().sort((a, b) => a.created - b.created);
  }
}

// Parse the scalar `key: value` lines of a frontmatter region into an object.
// A later duplicate key OVERRIDES an earlier one — so the plan's own frontmatter,
// which is physically LATER in the file than a prepended approval-marker block,
// wins on a genuine duplicate while every DISTINCT key from both is preserved.
// Booleans and non-negative integers are coerced; surrounding quotes stripped.
function parseFrontmatterLines(lines) {
  const metadata = {};
  lines.forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      /** @type {any} */ // a frontmatter value is a string, then coerced to boolean/number below
      let value = line.slice(colonIndex + 1).trim();
      // Remove quotes
      value = value.replace(/^["']|["']$/g, '');
      // Parse booleans
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      // Parse numbers
      if (/^\d+$/.test(value)) value = parseInt(value, 10);
      metadata[key] = value;
    }
  });
  return metadata;
}

// Parse plan metadata from YAML frontmatter, MERGED across every leading
// `---…---` block (finding M19).
//
// A plan that has crossed a human gate carries a PREPENDED approval-marker block
// (`approved_by`/`approved_at`/`gate_crossed`) ahead of its own frontmatter. The
// former single-block reader matched ONLY that first marker block and silently
// dropped every field from the plan's own block (`title`, `type`, `status`,
// `priority`, `parent_vision`, `depends_on`) — corrupting the parsed view of any
// plan that had ever crossed a gate. We now parse the UNION of all leading blocks
// via the CRLF-safe `extractFrontmatterRegion` (the same helper `listSubplans`
// uses for this exact reason), so no original field is lost. A single-block plan
// is behavior-identical: the region is exactly that one block.
//
// Robustness: `extractFrontmatterRegion` is lazy-required (there is no state ↔
// stale-detector cycle today, but the lazy require keeps it that way for future
// edits) and, on ANY error OR an empty region, this FALLS OPEN to the previous
// CRLF-safe single-block reader — a parser fault can never regress below the
// prior behavior. Do NOT re-inline a bare /^---\n/ here: that LF-only pattern
// silently locks out CRLF plans (finding H1).
function parseMetadata(content) {
  let region = null;
  try {
    const { extractFrontmatterRegion } = require('./stale-detector');
    region = extractFrontmatterRegion(content);
  } catch {
    region = null; // fail-open to the single-block reader below
  }

  if (typeof region === 'string' && region.length > 0) {
    return parseFrontmatterLines(region.split('\n'));
  }

  // Fail-open fallback: previous CRLF-safe single-block behavior.
  const { hasFrontmatter, lines } = parseFrontmatter(content);
  if (!hasFrontmatter) return {};
  return parseFrontmatterLines(lines);
}

// Calculate time ago string
/** @param {Date} date */
function timeAgo(date) {
  // Date−Date coerces via valueOf() at runtime; the `any` casts keep that
  // behavior while satisfying checkJs's numeric-operand requirement.
  const seconds = Math.floor((/** @type {any} */ (new Date()) - /** @type {any} */ (date)) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Get counts for all plan types (flat folder structure)
const getPlanCounts = memoize(function getPlanCountsImpl(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);

  return {
    canvas: readPlans(path.join(plansDir, 'canvas')).length,
    functional: readPlans(path.join(plansDir, 'functional')).length,
    implementation: readPlans(path.join(plansDir, 'implementation')).length,
    review: readPlans(path.join(plansDir, 'review')).length,
    todo: readPlans(path.join(plansDir, 'todo')).length,
    inProgress: readPlans(path.join(plansDir, 'in-progress')).length,
    done: readPlans(path.join(plansDir, 'done')).length
  };
}, 'getPlanCounts');

/** Max chars of a read-error message rendered on one agent line, mirroring
 * menu-screens.FAILURE_MESSAGE_CAP. Bounded and control-stripped because the message
 * can carry a filesystem path (potentially attacker-influenced via a crafted registry
 * file) and a newline in a rendered message can forge a dashboard row. */
const AGENT_MESSAGE_CAP = 120;

/** Sanitize a caught error into a bounded, control-stripped one-line message. Only
 * `err.message` is read — never `err.stack`, which would leak absolute paths. */
function msgOf(err) {
  const raw = String(err && err.message ? err.message : err);
  const clean = raw.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
  return clean.length > AGENT_MESSAGE_CAP ? `${clean.slice(0, AGENT_MESSAGE_CAP)}…` : clean;
}

// Get agent status (task-registry aware).
// LIVENESS comes from the scheduler registry, not a pid lock file (the agent-lock
// module is retired in F1-s2). The agent is "active" iff the registry holds at least
// one RUNNING `implement` task; `.ctoc/state/agent.json` remains the human-facing
// supplementary detail record (step/phase/task) but never decides liveness. Orphan
// reconciliation (task-reconcile) — not a pid check — recovers a crashed session's
// stale `running` tasks, so there is no "stale lock" state to report.
//
// THREE STATES, NOT TWO. `task-registry.load` fails OPEN on a DATA problem (an
// unparseable file, a wrong shape, a malformed entry) — but NOT on an OPERATING-SYSTEM
// problem: `safeFs.existsSync` / `safeFs.readFileSync` delegate to `fs` and THROW on
// EACCES/EIO/EISDIR/ELOOP. Unguarded, that throw propagated straight out of the dashboard
// builder and the human saw NOTHING at all. Caught, it must NOT become the opposite
// failure — an empty registry read as "no agent is running" is a verdict on input we
// never received. So a read error is a THIRD state, `unreadable`, that every render site
// prints INSTEAD of an idle claim, never beside one. `active: false` is retained beside it
// deliberately: under an unreadable registry there is no plan, step or start time, so the
// falsy `active` keeps the fabricating "Active" branch closed while `unreadable` carries
// the truth.
/**
 * @typedef {object} AgentStatus
 * @property {boolean} active  true iff the registry holds a running `implement` task.
 * @property {string} [unreadable]  set (WITH `active:false`) when the registry itself could
 *   not be READ — an operating-system error, not a data problem. Every render site prints
 *   this INSTEAD of an idle claim, never beside one.
 * @property {string} [detailUnreadable]  set when the supplementary detail file existed but
 *   could not be read/parsed (an EACCES/EIO or corrupt file, NOT a normal absent file).
 * @property {(string|null)} [plan]  primary running plan (active only).
 * @property {string[]} [plans]  every concurrently-running implement plan.
 * @property {number} [running]  count of running implement tasks.
 * @property {(string|null)} [startedAt]
 * @property {(string|null)} [elapsed]
 * @property {*} [step]
 * @property {*} [phase]
 * @property {*} [task]
 * @property {*} [pid]
 * @property {boolean} [stale]  legacy display field; the registry model reports no stale-lock state.
 * @property {*} [stalePlan]  legacy display field.
 * @property {*} [name]  legacy display field read by the overview tab.
 */

/**
 * @param {string} [projectPath]  Project root; defaults to the discovered root.
 * @returns {AgentStatus}
 */
function getAgentStatus(projectPath) {
  const root = projectPath || findProjectRoot();
  const taskRegistry = require('./task-registry');

  let registry;
  try {
    // fail-open on a DATA problem (handled inside load); an OPERATING-SYSTEM read error
    // (EACCES/EIO/EISDIR) propagates out of load and is caught HERE — see the note above.
    registry = taskRegistry.load(root);
  } catch (err) {
    return { active: false, unreadable: msgOf(err) };
  }
  const runningImplement = registry.tasks.filter(
    t => t.status === 'running' && t.kind === 'implement'
  );

  if (runningImplement.length === 0) {
    return { active: false };
  }

  // Supplementary detail for the dashboard (never authoritative for liveness).
  const stateFile = path.join(root, '.ctoc', 'state', 'agent.json');
  let step = null, phase = null, task = null, detailStartedAt = null;
  let detailUnreadable = null;
  try {
    const detail = JSON.parse(safeFs.readFileSync(stateFile, 'utf8'));
    step = detail.step || null;
    phase = detail.phase || null;
    task = detail.task || null;
    detailStartedAt = detail.startedAt || null;
  } catch (err) {
    // An ABSENT detail file is normal on this path and stays silent. Any OTHER read
    // failure (EACCES/EIO/EISDIR) or a corrupt/unparseable file is a real fault being
    // discarded — record it as `detailUnreadable` so the agent surface cannot present a
    // silent gap as a clean reading. Liveness is already decided by the registry above
    // and is left intact.
    if (!(err && err.code === 'ENOENT')) {
      detailUnreadable = msgOf(err);
    }
  }

  const plans = runningImplement.map(t => t.plan).filter(Boolean);
  const primary = runningImplement[0];
  const startedAt = (primary.ts && primary.ts.started) || detailStartedAt || null;

  return {
    active: true,
    plan: plans[0] || primary.plan || null,
    plans,                       // every concurrently-running implement plan
    running: runningImplement.length,
    startedAt,
    elapsed: startedAt ? timeAgo(new Date(startedAt)).replace(' ago', '') : null,
    step,
    phase,
    task,
    ...(detailUnreadable ? { detailUnreadable } : {})
  };
}

/**
 * Set agent status (active/working on plan)
 *
 * @param {string} projectPath - Project root path
 * @param {Object} status - Agent status object
 * @param {boolean} status.active - Whether agent is active
 * @param {string} status.plan - Plan name being worked on
 * @param {number} status.step - Current Iron Loop step (7-15)
 * @param {string} status.phase - Current phase name
 * @param {string} status.task - Current task description
 * @param {string} [status.startedAt] - ISO timestamp the agent began; defaults to now
 */
function setAgentStatus(projectPath, status) {
  const stateDir = path.join(projectPath, '.ctoc', 'state');
  const stateFile = path.join(stateDir, 'agent.json');

  // Ensure state directory exists
  if (!safeFs.existsSync(stateDir)) {
    safeFs.mkdirSync(stateDir, { recursive: true });
  }

  const agentStatus = {
    active: status.active !== false,
    plan: status.plan || null,
    step: status.step || null,
    phase: status.phase || null,
    task: status.task || null,
    startedAt: status.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  safeFs.writeFileSync(stateFile, JSON.stringify(agentStatus, null, 2));
  return agentStatus;
}

/**
 * Clear agent status (mark as idle)
 *
 * @param {string} projectPath - Project root path
 */
function clearAgentStatus(projectPath) {
  const stateDir = path.join(projectPath, '.ctoc', 'state');
  const stateFile = path.join(stateDir, 'agent.json');

  // Ensure state directory exists
  if (!safeFs.existsSync(stateDir)) {
    safeFs.mkdirSync(stateDir, { recursive: true });
  }

  const agentStatus = {
    active: false,
    plan: null,
    step: null,
    phase: null,
    task: null,
    completedAt: new Date().toISOString()
  };

  safeFs.writeFileSync(stateFile, JSON.stringify(agentStatus, null, 2));
  return agentStatus;
}

/**
 * Get next plan from todo queue (FIFO - oldest first)
 *
 * @param {string} projectPath - Project root path
 * @returns {Object|null} Next plan or null if queue empty
 */
function getNextFromTodo(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const todoDir = path.join(plansDir, 'todo');

  if (!safeFs.existsSync(todoDir)) {
    return null;
  }

  const plans = readPlans(todoDir);

  if (plans.length === 0) {
    return null;
  }

  // Already sorted oldest first (FIFO) by readPlans
  return plans[0];
}

// Get finished items
function getFinishedItems(projectPath, limit = 10) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const donePlans = readPlans(path.join(plansDir, 'done'));

  // Sort by modified date, newest first for display
  donePlans.sort((a, b) => b.modified - a.modified);

  return donePlans.slice(0, limit);
}

// Navigation stack
class NavStack {
  constructor() {
    this.stack = [];
  }

  push(screen, context = {}) {
    this.stack.push({ screen, context });
  }

  pop() {
    if (this.stack.length > 1) {
      return this.stack.pop();
    }
    return null;
  }

  current() {
    return this.stack[this.stack.length - 1] || null;
  }

  path() {
    return this.stack.map(s => s.screen);
  }

  clear() {
    this.stack = [];
  }
}

// Pick next task from queue (FIFO)
function pickNextFromQueue(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const queue = readPlans(path.join(plansDir, 'todo'));

  if (queue.length === 0) return null;

  // Always pick oldest (first in queue)
  return queue[0];
}

// Settings
function getSettings(projectPath) {
  const root = projectPath || findProjectRoot();
  const settingsFile = path.join(root, '.ctoc', 'settings.json');
  const defaults = {
    autoPick: true,
    maxParallelAgents: 1,
    showElapsed: true,
    finishedItemsToShow: 10
  };

  if (!safeFs.existsSync(settingsFile)) {
    return defaults;
  }

  try {
    const settings = JSON.parse(safeFs.readFileSync(settingsFile, 'utf8'));
    return { ...defaults, ...settings };
  } catch {
    return defaults;
  }
}

function saveSettings(settings, projectPath) {
  const root = projectPath || findProjectRoot();
  const settingsDir = path.join(root, '.ctoc');
  const settingsFile = path.join(settingsDir, 'settings.json');

  if (!safeFs.existsSync(settingsDir)) {
    safeFs.mkdirSync(settingsDir, { recursive: true });
  }

  safeFs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

// Get vision counts for dashboard (memoized)
const getVisionCounts = memoize(function getVisionCountsImpl(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const visionDir = path.join(plansDir, 'vision');

  if (!safeFs.existsSync(visionDir)) {
    return { total: 0, exploring: 0, ready: 0, converted: 0 };
  }

  const files = safeFs.readdirSync(visionDir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep');

  let exploring = 0;
  let ready = 0;
  let converted = 0;
  let decomposing = 0;

  files.forEach(f => {
    const content = safeFs.readFileSync(path.join(visionDir, f), 'utf8');
    const statusMatch = content.match(/^- Status: (\w+)$/m);
    const status = statusMatch ? statusMatch[1] : 'exploring';

    if (status === 'exploring') exploring++;
    else if (status === 'ready') ready++;
    else if (status === 'converted') converted++;
    else if (status === 'decomposing') decomposing++;
  });

  return {
    total: files.length,
    exploring,
    ready,
    converted,
    decomposing
  };
}, 'getVisionCounts');

/**
 * Get vision stubs for a given vision slug.
 * Scans plans/functional/ for plans where metadata.parent_vision contains visionSlug.
 *
 * @param {string} visionSlug - Slug of the parent vision
 * @param {string} [projectPath] - Project root path
 * @returns {Array<{ name: string, path: string, scope: string, dependsOn: string, bgStatus: string }>}
 */
function getVisionStubs(visionSlug, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const functionalDir = path.join(plansDir, 'functional');

  const plans = readPlans(functionalDir);

  // Filter by parent_vision matching the vision slug
  const stubs = plans.filter(plan => {
    const parentVision = plan.metadata.parent_vision || '';
    return parentVision.includes(visionSlug);
  });

  return stubs.map(stub => {
    // Extract scope from first line of Problem Statement
    const scopeMatch = stub.content.match(/## Problem Statement\n(.+)/);
    const scope = scopeMatch ? scopeMatch[1].trim() : '';

    return {
      name: stub.name,
      path: stub.path,
      scope,
      dependsOn: stub.metadata.depends_on || 'none',
      bgStatus: stub.bgStatus || 'none'
    };
  });
}

module.exports = {
  getPlansDir,
  readPlans,
  readTodoQueueOrder,
  parseMetadata,
  timeAgo,
  getPlanCounts,
  getVisionCounts,
  getVisionStubs,
  getAgentStatus,
  setAgentStatus,
  clearAgentStatus,
  getNextFromTodo,
  getFinishedItems,
  NavStack,
  pickNextFromQueue,
  getSettings,
  saveSettings
};

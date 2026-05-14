/**
 * CTOC Autonomous Build Budget — session-level enforcement (v6.9.4)
 *
 * Zero-dep, session-aware budget tracker. The dispatcher calls into this
 * module BEFORE issuing a dispatch and AFTER completing one, so a runaway
 * pipeline can be halted (or warned) within a single user-visible message.
 *
 * Why session-level, not per-agent:
 *   Per-agent max_tokens / max_tool_calls (pre-v6.9.3) were noise — they
 *   were never runtime-enforced and they varied per skill. Session-level
 *   limits actually matter: max wall-clock, max total dispatches, max
 *   Iron Loop iterations. These are the limits that prevent overnight
 *   runaway.
 *
 * Config: .ctoc/config/budget.yaml
 * Per-session state: .ctoc/budget-usage/<session_id>.yaml
 *
 * Public API:
 *   loadBudget(root?)       → { max_session_hours, max_dispatches, ... }
 *   getCurrentSessionId()   → string (derived from CTOC_SESSION_ID or date)
 *   getUsagePath(root?, id?)→ path to per-session usage file
 *   currentUsage(root?, id?)→ { started_at, dispatches, iron_loop_iterations }
 *   recordDispatch(target, ...)
 *   recordIronLoopStep(stepLabel, ...)
 *   checkBudget(root?, id?) → { withinLimits, exceeded, shouldCheckpoint, checkpoints }
 *   resetSession(root?, id?)
 *   formatStatus(root?, id?)→ human-readable string
 *
 * Errors thrown from checkBudget (when halt_action === 'ask_user') carry:
 *   err.code === 'BUDGET_EXCEEDED'
 *   err.details === { exceeded: [...], usage, config }
 */

const fs = require('fs');
const path = require('path');

function findProjectRoot(start = process.cwd()) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, '.ctoc')) || fs.existsSync(path.join(dir, '.claude-plugin'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

// ─────────────────────────────────────────────────────────────────────
//  Defaults — used when budget.yaml is missing or malformed
// ─────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  max_session_hours: 4,
  max_dispatches: 100,
  max_iron_loop_iterations: 50,
  checkpoint_at: {
    dispatches: [50, 75],
    iron_loop_iterations: [25, 40],
  },
  halt_action: 'ask_user',
  enabled: true,
};

// ─────────────────────────────────────────────────────────────────────
//  Minimal YAML helpers (zero-dep) — read/write the subset we use
// ─────────────────────────────────────────────────────────────────────

function parseYamlValue(raw) {
  const v = raw.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  // inline array: [1, 2, 3]
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(s => parseYamlValue(s));
  }
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  return v;
}

function parseYaml(content) {
  // Limited parser: handles 2-space-indented nested maps, scalars,
  // inline arrays. Strips comments and blank lines.
  const lines = content
    .split('\n')
    .map(l => l.replace(/(^|\s)#.*$/, '').replace(/\s+$/, ''))
    .filter(l => l.trim().length > 0);

  const root = {};
  const stack = [{ obj: root, indent: -1 }];

  for (const raw of lines) {
    const indent = raw.match(/^ */)[0].length;
    const trimmed = raw.trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const current = stack[stack.length - 1].obj;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    if (rawValue === '') {
      current[key] = {};
      stack.push({ obj: current[key], indent });
    } else {
      current[key] = parseYamlValue(rawValue);
    }
  }
  return root;
}

function stringifyYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      out.push(`${pad}${k}: null`);
    } else if (Array.isArray(v)) {
      out.push(`${pad}${k}: [${v.map(x => (typeof x === 'string' ? JSON.stringify(x) : String(x))).join(', ')}]`);
    } else if (typeof v === 'object') {
      out.push(`${pad}${k}:`);
      out.push(stringifyYaml(v, indent + 1));
    } else if (typeof v === 'string') {
      out.push(`${pad}${k}: ${JSON.stringify(v)}`);
    } else {
      out.push(`${pad}${k}: ${String(v)}`);
    }
  }
  return out.join('\n');
}

function readYamlFile(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return parseYaml(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeYamlFile(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, stringifyYaml(obj) + '\n');
}

// ─────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────

function loadBudget(root) {
  const projectRoot = root || findProjectRoot();
  const p = path.join(projectRoot, '.ctoc', 'config', 'budget.yaml');
  const parsed = readYamlFile(p);
  const userBudget = parsed && parsed.budget ? parsed.budget : {};

  // Shallow merge with defaults; checkpoint_at gets its own merge.
  const merged = { ...DEFAULTS, ...userBudget };
  merged.checkpoint_at = {
    ...DEFAULTS.checkpoint_at,
    ...(userBudget.checkpoint_at || {}),
  };
  return merged;
}

function getCurrentSessionId() {
  // 1. Explicit env var wins (test fixtures, CI, replays)
  if (process.env.CTOC_SESSION_ID) return String(process.env.CTOC_SESSION_ID);
  // 2. Otherwise, date-bucketed session — same day = same session
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  return `session-${day}-${process.ppid || process.pid}`;
}

function getUsagePath(root, sessionId) {
  const projectRoot = root || findProjectRoot();
  const id = sessionId || getCurrentSessionId();
  return path.join(projectRoot, '.ctoc', 'budget-usage', `${id}.yaml`);
}

function currentUsage(root, sessionId) {
  const p = getUsagePath(root, sessionId);
  const parsed = readYamlFile(p);
  if (parsed && parsed.usage) {
    return {
      started_at: parsed.usage.started_at || new Date().toISOString(),
      dispatches: Number(parsed.usage.dispatches || 0),
      iron_loop_iterations: Number(parsed.usage.iron_loop_iterations || 0),
      last_target: parsed.usage.last_target || null,
      last_step: parsed.usage.last_step || null,
    };
  }
  return {
    started_at: new Date().toISOString(),
    dispatches: 0,
    iron_loop_iterations: 0,
    last_target: null,
    last_step: null,
  };
}

function writeUsage(root, sessionId, usage) {
  const p = getUsagePath(root, sessionId);
  writeYamlFile(p, { usage });
}

function recordDispatch(target, root, sessionId) {
  const u = currentUsage(root, sessionId);
  u.dispatches += 1;
  if (target) u.last_target = target;
  writeUsage(root, sessionId, u);
  return u;
}

function recordIronLoopStep(stepLabel, root, sessionId) {
  const u = currentUsage(root, sessionId);
  u.iron_loop_iterations += 1;
  if (stepLabel) u.last_step = stepLabel;
  writeUsage(root, sessionId, u);
  return u;
}

function hoursSince(isoStartedAt) {
  const t0 = Date.parse(isoStartedAt);
  if (!Number.isFinite(t0)) return 0;
  return (Date.now() - t0) / (1000 * 60 * 60);
}

function checkBudget(root, sessionId) {
  const config = loadBudget(root);
  const usage = currentUsage(root, sessionId);

  if (config.enabled === false) {
    return { withinLimits: true, exceeded: [], shouldCheckpoint: false, checkpoints: [], usage, config };
  }

  const exceeded = [];
  const elapsedHours = hoursSince(usage.started_at);

  if (elapsedHours > config.max_session_hours) {
    exceeded.push({ kind: 'max_session_hours', current: Number(elapsedHours.toFixed(2)), limit: config.max_session_hours });
  }
  if (usage.dispatches > config.max_dispatches) {
    exceeded.push({ kind: 'max_dispatches', current: usage.dispatches, limit: config.max_dispatches });
  }
  if (usage.iron_loop_iterations > config.max_iron_loop_iterations) {
    exceeded.push({ kind: 'max_iron_loop_iterations', current: usage.iron_loop_iterations, limit: config.max_iron_loop_iterations });
  }

  const checkpoints = [];
  for (const threshold of (config.checkpoint_at.dispatches || [])) {
    if (usage.dispatches === threshold) checkpoints.push({ kind: 'dispatches', at: threshold });
  }
  for (const threshold of (config.checkpoint_at.iron_loop_iterations || [])) {
    if (usage.iron_loop_iterations === threshold) checkpoints.push({ kind: 'iron_loop_iterations', at: threshold });
  }

  return {
    withinLimits: exceeded.length === 0,
    exceeded,
    shouldCheckpoint: checkpoints.length > 0,
    checkpoints,
    usage,
    config,
  };
}

function resetSession(root, sessionId) {
  const p = getUsagePath(root, sessionId);
  try { fs.unlinkSync(p); } catch {}
  return true;
}

function formatStatus(root, sessionId) {
  const result = checkBudget(root, sessionId);
  const { config, usage, withinLimits, exceeded, shouldCheckpoint, checkpoints } = result;
  const elapsedHours = hoursSince(usage.started_at);

  const lines = [];
  lines.push('CTOC Build Budget');
  lines.push('─────────────────');
  lines.push(`Session:           ${sessionId || getCurrentSessionId()}`);
  lines.push(`Enabled:           ${config.enabled !== false}`);
  lines.push(`Halt action:       ${config.halt_action}`);
  lines.push('');
  lines.push(`Elapsed:           ${elapsedHours.toFixed(2)} / ${config.max_session_hours} hours`);
  lines.push(`Dispatches:        ${usage.dispatches} / ${config.max_dispatches}`);
  lines.push(`Iron Loop steps:   ${usage.iron_loop_iterations} / ${config.max_iron_loop_iterations}`);
  if (usage.last_target) lines.push(`Last dispatch:     ${usage.last_target}`);
  if (usage.last_step) lines.push(`Last Iron step:    ${usage.last_step}`);
  lines.push('');

  if (!withinLimits) {
    lines.push(`STATUS: OVER BUDGET (${exceeded.length})`);
    for (const e of exceeded) {
      lines.push(`  - ${e.kind}: ${e.current} > ${e.limit}`);
    }
  } else if (shouldCheckpoint) {
    lines.push(`STATUS: checkpoint (${checkpoints.map(c => `${c.kind}=${c.at}`).join(', ')})`);
  } else {
    lines.push('STATUS: within limits');
  }
  return lines.join('\n');
}

/**
 * Throws a structured BUDGET_EXCEEDED error if over limits AND halt_action ===
 * 'ask_user'. For 'log_only' or 'continue', logs to stderr (log_only louder).
 * Returns the checkBudget result either way (for callers that want to inspect).
 */
function enforce(root, sessionId) {
  const result = checkBudget(root, sessionId);
  if (result.withinLimits) return result;

  const action = result.config.halt_action || 'ask_user';
  if (action === 'ask_user') {
    const err = new Error(`Budget exceeded: ${result.exceeded.map(e => `${e.kind}=${e.current}/${e.limit}`).join(', ')}`);
    err.code = 'BUDGET_EXCEEDED';
    err.details = { exceeded: result.exceeded, usage: result.usage, config: result.config };
    throw err;
  } else if (action === 'log_only') {
    process.stderr.write(`[ctoc:budget] WARN: budget exceeded — ${result.exceeded.map(e => `${e.kind}=${e.current}/${e.limit}`).join(', ')}\n`);
  } else if (action === 'continue') {
    // Quiet — no log.
  }
  return result;
}

module.exports = {
  // Config
  loadBudget,
  DEFAULTS,
  // Session
  getCurrentSessionId,
  getUsagePath,
  currentUsage,
  recordDispatch,
  recordIronLoopStep,
  resetSession,
  // Enforcement
  checkBudget,
  enforce,
  formatStatus,
  // Internals (exported for testing)
  parseYaml,
  stringifyYaml,
  findProjectRoot,
};

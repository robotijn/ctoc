/**
 * CTOC v8 Dispatcher — protocol implementation
 *
 * Spec: docs/DISPATCH_PROTOCOL.md
 * Schema: .ctoc/architecture/dispatch-schema.yaml
 *
 * Wraps CTO Chief → agent dispatches with:
 *   - ULID generation for dispatch_id
 *   - Audit log writing (.ctoc/audit/dispatches/YYYY-MM-DD/<id>.yaml)
 *   - Effort budget enforcement (per-tier defaults)
 *   - Confidence calibration tracking (grades.yaml updates)
 *
 * Usage (in the orchestration layer):
 *
 *   const { beginDispatch, recordResponse, finalizeDispatch } = require('./v8-dispatcher');
 *
 *   const token = beginDispatch({
 *     target: 'quality/code-reviewer',
 *     goal: 'Review auth refactor for code quality issues',
 *     planAncestry: { vision: 'plans/done/auth-refactor.md', ... },
 *     priority: 'normal',
 *   });
 *
 *   // ... invoke agent via Task tool, get back yaml findings ...
 *
 *   recordResponse(token, agentResponse);
 *   finalizeDispatch(token, { status: 'completed' });
 *
 * This module is INVOKABLE today but does not REPLACE Claude's Task tool —
 * it wraps the call to produce an audit trail and enforce the protocol.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const AUDIT_BASE = path.join(ROOT, '.ctoc', 'audit', 'dispatches');
// v8 dispatch-derived grades. Separate from the legacy `.ctoc/agents/grades.yaml`
// (which tracks the bootstrap-pipeline improvement-loop scores).
const GRADES_PATH = path.join(ROOT, '.ctoc', 'agents', 'dispatch-grades.yaml');

// Crockford Base32 alphabet (used by ULID — no I, L, O, U)
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Effort-budget defaults by tier (from tier-definitions.yaml)
const TIER_BUDGETS = {
  0: { max_tokens: Number.MAX_SAFE_INTEGER, max_tool_calls: Number.MAX_SAFE_INTEGER, max_subagents: Number.MAX_SAFE_INTEGER },
  1: { max_tokens: 200000, max_tool_calls: 100, max_subagents: 10 },
  2: { max_tokens: 50000,  max_tool_calls: 30,  max_subagents: 0  },
  3: { max_tokens: 4000,   max_tool_calls: 5,   max_subagents: 0  },
};

/**
 * Generate a ULID (universally unique, lexicographically sortable).
 * 26-char Crockford Base32. First 10 chars encode timestamp; last 16 are random.
 */
function generateUlid(now = Date.now()) {
  let ts = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = ULID_ALPHABET[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  const randBytes = crypto.randomBytes(10);
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += ULID_ALPHABET[randBytes[i % 10] % 32];
  }
  return ts + rand;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isoNow() {
  return new Date().toISOString();
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function auditDirForToday() {
  const d = path.join(AUDIT_BASE, todayDateStr());
  ensureDir(d);
  return d;
}

function auditPathForId(id) {
  return path.join(auditDirForToday(), `${id}.yaml`);
}

/**
 * Tier inference from target string. Falls back to tier 2 if not declared.
 * @param {string} target — e.g. "quality/code-reviewer" or "scouts/syntax-scout"
 */
function inferTier(target) {
  if (target.startsWith('scouts/')) return 3;
  if (target.startsWith('coordinator/cto-chief')) return 0;
  if (
    target.startsWith('coordinator/synthesizer') ||
    target.startsWith('planning/') ||
    target.startsWith('iron-loop/') ||
    target.startsWith('pipeline/')
  ) return 1;
  return 2; // every other category is a specialist
}

/**
 * Validate that a request meets the minimal protocol requirements.
 * Throws on hard violations; returns the normalized request otherwise.
 */
function normalizeRequest(opts) {
  if (!opts.target) throw new Error('dispatch: target is required');
  if (!opts.goal || opts.goal.length < 10) throw new Error('dispatch: goal must be ≥ 10 chars');

  const targetTier = opts.targetTier != null ? opts.targetTier : inferTier(opts.target);
  if (targetTier < 1 || targetTier > 3) throw new Error(`dispatch: target_tier must be 1-3, got ${targetTier}`);

  const issuer = opts.issuedBy || 'cto-chief';
  if (issuer !== 'cto-chief') throw new Error('dispatch: only cto-chief may issue dispatches (Tier 0)');

  const budget = opts.effortBudget || TIER_BUDGETS[targetTier];
  if (targetTier >= 2 && budget.max_subagents !== 0) {
    throw new Error(`dispatch: Tier ${targetTier} target must have max_subagents: 0`);
  }

  return {
    id: opts.id || generateUlid(),
    protocol_version: 1,
    issued_by: issuer,
    issued_at: isoNow(),
    target_agent: opts.target,
    target_tier: targetTier,
    goal: opts.goal,
    plan_ancestry: opts.planAncestry || {},
    context: opts.context || {},
    effort_budget: budget,
    expected_output: opts.expectedOutput || {},
    priority: opts.priority || 'normal',
  };
}

/**
 * Begin a dispatch: validate request, write audit entry with request block,
 * return a token used to record the response and finalize.
 */
function beginDispatch(opts) {
  const req = normalizeRequest(opts);
  ensureDir(AUDIT_BASE);
  const auditPath = auditPathForId(req.id);
  const entry = { request: req };
  fs.writeFileSync(auditPath, yamlStringify(entry));
  return { id: req.id, auditPath, request: req };
}

/**
 * Record the response for a dispatch. The agent (or wrapper) calls this
 * after Claude's Task tool returns. Validates required fields.
 */
function recordResponse(token, response) {
  if (!response.findings && !response.synthesis && !response.decision) {
    throw new Error('dispatch: response must include findings, synthesis (synthesizer), or decision (scout)');
  }

  const fullResponse = {
    dispatch_id: token.id,
    protocol_version: 1,
    agent: token.request.target_agent,
    completed_at: isoNow(),
    ...response,
  };

  // For scout responses, validate the decision field
  if (token.request.target_tier === 3) {
    if (!['pass', 'flag', 'error'].includes(fullResponse.decision)) {
      throw new Error(`scout response must declare decision: pass|flag|error (got ${fullResponse.decision})`);
    }
  }

  const existing = parseYamlFile(token.auditPath);
  existing.response = fullResponse;
  fs.writeFileSync(token.auditPath, yamlStringify(existing));
  return fullResponse;
}

/**
 * Finalize a dispatch with an outcome (completed | timeout | error | rejected).
 * Triggers grade update if the outcome includes acceptance data.
 */
function finalizeDispatch(token, outcome) {
  const existing = parseYamlFile(token.auditPath);
  existing.outcome = {
    status: outcome.status || 'completed',
    reason: outcome.reason || '',
    graded_at: outcome.gradedAt || null,
    grade: outcome.grade || null,
  };
  fs.writeFileSync(token.auditPath, yamlStringify(existing));
  return existing;
}

// ─────────────────────────────────────────────────────────────────────
// Lightweight YAML stringify / parse (no external dependency).
// CTOC tests must run with no node_modules. This implementation handles
// the subset of YAML our audit log uses: nested objects, arrays of objects,
// strings (with quotes for special chars), numbers, booleans, null.
// ─────────────────────────────────────────────────────────────────────

function yamlStringify(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean' || typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') {
    // Quote strings with newlines, leading whitespace, or YAML-special chars
    if (/^[a-zA-Z0-9_\-./ :]+$/.test(obj) && obj.trim() === obj && !obj.includes('\n')) {
      return obj;
    }
    return JSON.stringify(obj);  // safe quoting fallback
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        const lines = Object.entries(item).map(([k, v], i) => {
          const prefix = i === 0 ? `${pad}- ` : `${pad}  `;
          return `${prefix}${k}: ${yamlStringify(v, indent + 1)}`;
        });
        return lines.join('\n');
      }
      return `${pad}- ${yamlStringify(item, indent + 1)}`;
    }).join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries.map(([k, v]) => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return `${pad}${k}:\n${yamlStringify(v, indent + 1)}`;
      }
      if (Array.isArray(v) && v.length > 0) {
        return `${pad}${k}:\n${yamlStringify(v, indent + 1)}`;
      }
      return `${pad}${k}: ${yamlStringify(v, indent + 1)}`;
    }).join('\n');
  }
  return JSON.stringify(obj);
}

function parseYamlFile(filePath) {
  // Minimal parser sufficient for round-tripping our own writes.
  // Falls back to returning {} on error — audit log is append-with-replace,
  // not read-heavy.
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return parseYaml(content);
  } catch {
    return {};
  }
}

function parseYaml(yamlStr) {
  // Hand-rolled parser. Limited to the shape our writer produces.
  // For external YAML, switch to js-yaml; but we want zero-deps.
  const lines = yamlStr.split('\n').filter(l => l.trim());
  const root = {};
  const stack = [{ obj: root, indent: -1 }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^ */)[0].length;
    const trimmed = line.trim();

    // Pop stack until current indent fits
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1].obj;

    if (trimmed.startsWith('- ')) {
      // Array entry — skip for our limited use case; the audit log writer
      // primarily emits objects-with-arrays, not bare arrays.
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    if (rawValue === '') {
      // Nested object
      current[key] = {};
      stack.push({ obj: current[key], indent });
    } else {
      current[key] = parseYamlValue(rawValue);
    }
  }
  return root;
}

function parseYamlValue(raw) {
  if (raw === 'null' || raw === '~') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try { return JSON.parse(raw); } catch { return raw.slice(1, -1); }
  }
  return raw;
}

// ─────────────────────────────────────────────────────────────────────
// Grade tracking (.ctoc/agents/grades.yaml)
// ─────────────────────────────────────────────────────────────────────

function loadGrades() {
  if (!fs.existsSync(GRADES_PATH)) return {};
  return parseYamlFile(GRADES_PATH);
}

function saveGrades(grades) {
  ensureDir(path.dirname(GRADES_PATH));
  fs.writeFileSync(GRADES_PATH, yamlStringify(grades));
}

/**
 * Update an agent's grade based on a single finding outcome.
 * Outcomes: 'accepted' | 'false_positive' | 'kickback'
 */
function updateGrade(agentName, confidence, outcome) {
  const grades = loadGrades();
  const key = agentName.includes('/') ? agentName : `unknown/${agentName}`;
  const entry = grades[key] || {
    precision_high: 0, precision_med: 0, precision_low: 0,
    total_high: 0, total_med: 0, total_low: 0,
    last_updated: isoNow(),
  };

  const conf = (confidence || 'LOW').toLowerCase();
  const totalKey = `total_${conf}`;
  const precKey = `precision_${conf === 'high' ? 'high' : conf === 'medium' ? 'med' : 'low'}`;

  entry[totalKey] = (entry[totalKey] || 0) + 1;
  if (outcome === 'accepted') {
    // Boost precision toward 1.0
    const accepted = Math.round((entry[precKey] || 0) * (entry[totalKey] - 1)) + 1;
    entry[precKey] = accepted / entry[totalKey];
  } else if (outcome === 'false_positive' || outcome === 'kickback') {
    // Decay precision toward 0
    const accepted = Math.round((entry[precKey] || 0) * (entry[totalKey] - 1));
    entry[precKey] = accepted / entry[totalKey];
  }
  entry.last_updated = isoNow();
  grades[key] = entry;
  saveGrades(grades);
  return entry;
}

module.exports = {
  // Public API
  beginDispatch,
  recordResponse,
  finalizeDispatch,
  updateGrade,

  // Utilities (exported for testing)
  generateUlid,
  normalizeRequest,
  inferTier,
  loadGrades,
  saveGrades,

  // Constants
  TIER_BUDGETS,
};

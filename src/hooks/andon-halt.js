#!/usr/bin/env node
/**
 * CTOC Andon Cord Halt — pre-tool-use hook
 *
 * Manufacturing analogy: in a Toyota Production System line, any worker
 * may pull the Andon cord to stop the entire line when they detect a
 * defect. The line does not restart until the defect is understood and
 * a corrective action is in place.
 *
 * CTOC equivalent: when any quality metric breaches the thresholds in
 * .ctoc/config/andon-thresholds.yaml, this hook halts further dispatches
 * until a Corrective and Preventive Action register entry closes the
 * loop. The halt is enforced by exiting with a non-zero code.
 *
 * The hook is OFF unless the `andon_cord_halt` control is enabled by an
 * active regulatory regime profile. This preserves the lean default.
 *
 * Manual override:
 *   A user may bypass the halt by writing .ctoc/andon-override.yaml with:
 *     reason: "<single sentence rationale>"
 *     signature: "<user identifier — typically email>"
 *     expires_at: "<ISO 8601 — override expires>"
 *   The override is logged to .ctoc/logs/andon-overrides.json for audit.
 *
 * Exit codes:
 *   0 — dispatch allowed
 *   2 — dispatch halted (Andon cord pulled)
 *
 * Sources:
 *   - Toyota Production System Andon —
 *     https://en.wikipedia.org/wiki/Andon_(manufacturing)
 *   - Lean Enterprise Institute, *Andon* lexicon entry —
 *     https://www.lean.org/lexicon-terms/andon/
 */

const path = require('path');

const safeFs = require('../lib/safe-fs');
const { findProjectRoot } = require('../lib/project-root');

// Lazy-load deps that may not exist in older installs (fail OPEN).
function loadDeps() {
  try {
    const metrics = require('../lib/metrics-loop');
    const regulatoryRegime = require('../lib/regulatory-regime');
    return { metrics, regulatoryRegime };
  } catch (_e) {
    return null;
  }
}

const THRESHOLDS_PATH = path.join('.ctoc', 'config', 'andon-thresholds.yaml');
const OVERRIDE_PATH = path.join('.ctoc', 'andon-override.yaml');
const HALT_LOG_PATH = path.join('.ctoc', 'logs', 'andon-halts.json');
const OVERRIDE_LOG_PATH = path.join('.ctoc', 'logs', 'andon-overrides.json');

// ─────────────────────────────────────────────────────────────────────
//  Tiny YAML extractor — flat key: value only
// ─────────────────────────────────────────────────────────────────────

function readYamlFlat(content) {
  if (!content) return {};
  const out = {};
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '');
    const m = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (val === '' || val === '~' || val === 'null') { out[key] = null; continue; }
    if (val === 'true') { out[key] = true; continue; }
    if (val === 'false') { out[key] = false; continue; }
    if (/^-?\d+$/.test(val)) { out[key] = parseInt(val, 10); continue; }
    if (/^-?\d+\.\d+$/.test(val)) { out[key] = parseFloat(val); continue; }
    out[key] = val;
  }
  return out;
}

/**
 * Parse the nested thresholds YAML. Returns a map of:
 *   { escape_rate: { alert_above: 0.05, window_days: 30, source_url: '...' }, ... }
 */
function readThresholds(projectRoot) {
  const p = path.join(projectRoot, THRESHOLDS_PATH);
  if (!safeFs.existsSync(p)) return {};
  let content;
  try {
    content = safeFs.readFileSync(p, 'utf8');
  } catch (_e) {
    return {};
  }
  const lines = content.split('\n');
  const out = {};
  let current = null;
  let currentIndent = -1;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').replace(/\s+$/, '');
    if (line.trim() === '') continue;
    const indent = raw.match(/^[ \t]*/)[0].length;
    const kv = line.match(/^([ \t]*)([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    const [, , key, val] = kv;
    if (indent === 0) {
      // Top-level: a metric name. Start a new block.
      current = {};
      out[key] = current;
      currentIndent = indent;
      // If value present at top-level, store as 'value'
      if (val.trim() !== '') current.value = parseScalar(val.trim());
    } else if (current && indent > currentIndent) {
      current[key] = parseScalar(val.trim());
    }
  }
  return out;
}

function parseScalar(v) {
  v = v.replace(/^["']|["']$/g, '');
  if (v === '' || v === '~' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

// ─────────────────────────────────────────────────────────────────────
//  Override handling
// ─────────────────────────────────────────────────────────────────────

function readOverride(projectRoot) {
  const p = path.join(projectRoot, OVERRIDE_PATH);
  if (!safeFs.existsSync(p)) return null;
  let content;
  try {
    content = safeFs.readFileSync(p, 'utf8');
  } catch (_e) {
    return null;
  }
  const ov = readYamlFlat(content);
  if (!ov.reason || !ov.signature) return null;
  // Validate expiry if present
  if (ov.expires_at) {
    const exp = new Date(ov.expires_at);
    if (isNaN(exp.getTime()) || exp < new Date()) return null;
  }
  return ov;
}

function logOverride(projectRoot, override, breaches) {
  const logDir = path.dirname(path.join(projectRoot, OVERRIDE_LOG_PATH));
  try {
    safeFs.mkdirSync(logDir, { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      reason: override.reason,
      signature: override.signature,
      expires_at: override.expires_at || null,
      breaches,
    };
    let arr = [];
    const fullPath = path.join(projectRoot, OVERRIDE_LOG_PATH);
    if (safeFs.existsSync(fullPath)) {
      try { arr = JSON.parse(safeFs.readFileSync(fullPath, 'utf8')); } catch (_e) { arr = []; }
    }
    arr.push(entry);
    safeFs.writeFileSync(fullPath, JSON.stringify(arr, null, 2));
  } catch (_e) { /* logging failures must not crash */ }
}

function logHalt(projectRoot, breaches, toolName) {
  const logDir = path.dirname(path.join(projectRoot, HALT_LOG_PATH));
  try {
    safeFs.mkdirSync(logDir, { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      tool: toolName || null,
      breaches,
    };
    let arr = [];
    const fullPath = path.join(projectRoot, HALT_LOG_PATH);
    if (safeFs.existsSync(fullPath)) {
      try { arr = JSON.parse(safeFs.readFileSync(fullPath, 'utf8')); } catch (_e) { arr = []; }
    }
    arr.push(entry);
    safeFs.writeFileSync(fullPath, JSON.stringify(arr, null, 2));
  } catch (_e) { /* logging failures must not crash */ }
}

// ─────────────────────────────────────────────────────────────────────
//  Threshold evaluation
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns an array of breach records — empty if no thresholds are violated.
 */
function evaluateThresholds(projectRoot, thresholds, metrics) {
  const breaches = [];

  // escape_rate
  if (thresholds.escape_rate && typeof thresholds.escape_rate.alert_above === 'number') {
    const window = thresholds.escape_rate.window_days || 30;
    const er = metrics.escapeRate(projectRoot, window);
    if (typeof er.rate === 'number' && er.rate > thresholds.escape_rate.alert_above) {
      breaches.push({
        metric: 'escape_rate',
        observed: er.rate,
        threshold: thresholds.escape_rate.alert_above,
        window_days: window,
        detail: er,
      });
    }
  }

  // cpk
  if (thresholds.cpk && typeof thresholds.cpk.alert_below === 'number') {
    const window = thresholds.cpk.window_days || 90;
    const cpk = metrics.processCapabilityIndex(projectRoot, window);
    if (typeof cpk.cpk === 'number' && isFinite(cpk.cpk) && cpk.cpk < thresholds.cpk.alert_below) {
      breaches.push({
        metric: 'cpk',
        observed: cpk.cpk,
        threshold: thresholds.cpk.alert_below,
        window_days: window,
        detail: cpk,
      });
    }
  }

  // flaky_tests — read directly from dispatches if recorded
  if (thresholds.flaky_tests && typeof thresholds.flaky_tests.alert_above === 'number') {
    const window = thresholds.flaky_tests.window_days || 30;
    const flaky = countFlakyTests(projectRoot, metrics, window);
    if (flaky > thresholds.flaky_tests.alert_above) {
      breaches.push({
        metric: 'flaky_tests',
        observed: flaky,
        threshold: thresholds.flaky_tests.alert_above,
        window_days: window,
      });
    }
  }

  return breaches;
}

function countFlakyTests(projectRoot, metrics, windowDays) {
  const dispatches = metrics.loadDispatches(projectRoot);
  let total = 0;
  for (const d of dispatches) {
    if (!d.issuedAt) continue;
    const ts = new Date(d.issuedAt);
    if (isNaN(ts.getTime())) continue;
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    if (ts < cutoff) continue;
    const m = d.content.match(/flaky:\s*(\d+)/);
    if (m) total += parseInt(m[1], 10);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────
//  Main hook entry
// ─────────────────────────────────────────────────────────────────────

function writeStderr(msg) {
  try { process.stderr.write(msg); } catch (_e) { /* swallow */ }
}

async function main() {
  // Fail OPEN — never block on internal errors of this hook
  let projectRoot;
  try {
    projectRoot = findProjectRoot(process.cwd());
  } catch (_e) {
    process.exit(0);
  }

  const deps = loadDeps();
  if (!deps) {
    // Dependencies missing — pass silently. Old install.
    process.exit(0);
  }
  const { metrics, regulatoryRegime } = deps;

  // Only active when andon_cord_halt control is enabled.
  let active = false;
  try {
    active = regulatoryRegime.isControlEnabled(projectRoot, 'andon_cord_halt');
  } catch (_e) {
    active = false;
  }
  if (!active) {
    process.exit(0);
  }

  // Read tool name from stdin payload if present (Claude Code passes JSON
  // on stdin for hooks). Fall back to env var or unknown.
  let toolName = process.env.CLAUDE_HOOK_TOOL_NAME || null;
  // Read stdin best-effort (non-blocking).
  // We don't strictly need it; the halt applies regardless of tool.

  const thresholds = readThresholds(projectRoot);
  if (Object.keys(thresholds).length === 0) {
    process.exit(0);
  }

  let breaches = [];
  try {
    breaches = evaluateThresholds(projectRoot, thresholds, metrics);
  } catch (err) {
    writeStderr(`[CTOC andon-halt] internal error: ${err.message}\n`);
    process.exit(0); // fail OPEN
  }

  if (breaches.length === 0) {
    process.exit(0);
  }

  // Breaches found. Check for manual override.
  const override = readOverride(projectRoot);
  if (override) {
    logOverride(projectRoot, override, breaches);
    writeStderr(formatOverrideNotice(override, breaches));
    process.exit(0);
  }

  // No override — halt.
  logHalt(projectRoot, breaches, toolName);
  writeStderr(formatHaltMessage(breaches, projectRoot));
  process.exit(2);
}

function formatHaltMessage(breaches, projectRoot) {
  const lines = [];
  lines.push('');
  lines.push('============================================================');
  lines.push('  ANDON CORD PULLED — pipeline halted');
  lines.push('============================================================');
  lines.push('');
  lines.push('The Andon cord halt is active because one or more quality');
  lines.push('metrics have breached their threshold. Manufacturing rule:');
  lines.push('do not restart the line until the defect is understood and');
  lines.push('a corrective action is in place.');
  lines.push('');
  lines.push('Breached metrics:');
  for (const b of breaches) {
    const window = b.window_days ? ` over ${b.window_days}-day window` : '';
    lines.push(`  - ${b.metric}: observed ${formatNumber(b.observed)} (threshold ${formatNumber(b.threshold)})${window}`);
  }
  lines.push('');
  lines.push('To resume:');
  lines.push('  1. Open a Corrective and Preventive Action entry at');
  lines.push('     .ctoc/capa/<id>.yaml (template: .ctoc/capa/_template.yaml).');
  lines.push('  2. Identify the root cause via the five-why chain.');
  lines.push('  3. Apply the preventive action (process / template / test fix).');
  lines.push('  4. Wait for metrics to return below threshold, OR');
  lines.push('     create .ctoc/andon-override.yaml with reason + signature');
  lines.push('     to bypass for the documented duration.');
  lines.push('');
  lines.push('Thresholds live in:');
  lines.push(`  ${path.join(projectRoot, THRESHOLDS_PATH)}`);
  lines.push('Halts are logged to:');
  lines.push(`  ${path.join(projectRoot, HALT_LOG_PATH)}`);
  lines.push('');
  lines.push('References:');
  lines.push('  - Andon manufacturing principle — https://en.wikipedia.org/wiki/Andon_(manufacturing)');
  lines.push('  - Lean Enterprise Institute Andon lexicon — https://www.lean.org/lexicon-terms/andon/');
  lines.push('============================================================');
  lines.push('');
  return lines.join('\n');
}

function formatOverrideNotice(override, breaches) {
  const lines = [];
  lines.push('');
  lines.push('[CTOC andon-halt] OVERRIDE ACTIVE');
  lines.push(`  Reason:    ${override.reason}`);
  lines.push(`  Signature: ${override.signature}`);
  if (override.expires_at) lines.push(`  Expires:   ${override.expires_at}`);
  lines.push(`  Breaches: ${breaches.map(b => b.metric).join(', ')}`);
  lines.push('  Logged to .ctoc/logs/andon-overrides.json');
  lines.push('');
  return lines.join('\n');
}

function formatNumber(n) {
  if (typeof n !== 'number') return String(n);
  if (!isFinite(n)) return String(n);
  if (Math.abs(n) < 0.001 || Math.abs(n) > 1e6) return n.toExponential(3);
  return Number(n.toFixed(4)).toString();
}

// Export for testing.
module.exports = {
  readThresholds,
  readOverride,
  evaluateThresholds,
  formatHaltMessage,
  formatOverrideNotice,
};

// Only run as a hook when invoked as a script.
if (require.main === module) {
  main().catch(err => {
    writeStderr(`[CTOC andon-halt] fatal: ${err.message}\n`);
    process.exit(0); // fail OPEN on fatal error
  });
}

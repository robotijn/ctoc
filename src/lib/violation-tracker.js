/**
 * Violation Tracker - Tracks gate violations with status.
 *
 * Storage (W11-s4): the gate-violations store is an append-only JSONL file
 * (`.ctoc/logs/gate-violations.json`) managed through the shared
 * `durable-log` primitive, and is SHARED with the other writer,
 * `src/hooks/human-gate-check.js` — both append via the identical JSONL format.
 * The high-frequency `logViolation` is a single lossless O_APPEND write (no
 * read-modify-write, no lost updates under concurrency); a corrupt file is
 * quarantined rather than silently reset to `[]`. The rare, human-driven state
 * mutations (`saveViolations`, `markResolved`) do a full atomic rewrite
 * (temp + rename JSONL), which is acceptable at their low frequency and keeps the
 * hot append path pure. `getUnacknowledgedViolations`/`getLastAck` are unchanged
 * and continue to operate on arrays; the separate `last-ack.json` file is a small
 * single-object marker and is not part of the JSONL log.
 */

const safeFs = require('./safe-fs');
const path = require('path');
const durableLog = require('./durable-log');

// Path helpers resolve the log directory at CALL time from an optional
// `projectPath` (default `process.cwd()`). Previously these were module-level
// constants captured from `process.cwd()` at REQUIRE time, which meant a live
// caller that passed an explicit project root (e.g. `approvePlan(planPath,
// root)` where `root !== cwd`) could not steer the writes — the module was
// effectively cwd-locked and therefore unwireable from the pipeline (finding
// C9). Resolving per call keeps the existing argless callers working (cwd) while
// letting the wired caller target the project root explicitly and hermetically.
function logDir(projectPath) {
  return path.join(projectPath || process.cwd(), '.ctoc', 'logs');
}

function violationsFile(projectPath) {
  return path.join(logDir(projectPath), 'gate-violations.json');
}

function ackFile(projectPath) {
  return path.join(logDir(projectPath), 'last-ack.json');
}

function ensureDir(dir) {
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Atomically replace the JSONL violations file with `entries` via a
 * pid-namespaced temp file + rename (rename-over-existing is atomic on all three
 * target platforms). Used only by the rare, human-driven full-rewrite paths
 * (`saveViolations`, `markResolved`) — never by the hot `logViolation` append.
 *
 * @param {Array<object>} entries - the records to persist
 * @param {string} [projectPath] - project root (default process.cwd())
 */
function writeAtomicJsonl(entries, projectPath) {
  const dir = logDir(projectPath);
  const target = violationsFile(projectPath);
  ensureDir(dir);
  const tmp = `${target}.tmp-${process.pid}`;
  const jsonl = entries.length === 0 ? '' : entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  safeFs.writeFileSync(tmp, jsonl, 'utf8');
  safeFs.renameSync(tmp, target);
}

function loadViolations(projectPath) {
  return durableLog.readEntries(violationsFile(projectPath));
}

function saveViolations(violations, projectPath) {
  writeAtomicJsonl(violations, projectPath);
}

function logViolation(violation, projectPath) {
  // Lossless O_APPEND; the durable-log preserves the documented last-100 cap.
  durableLog.appendEntry(violationsFile(projectPath), violation, { maxEntries: 100 });
}

function getLastAck(projectPath) {
  try {
    const f = ackFile(projectPath);
    if (safeFs.existsSync(f)) {
      return JSON.parse(safeFs.readFileSync(f, 'utf8'));
    }
  } catch { /* ignore: best-effort, non-fatal */ }
  return { acknowledgedAt: null };
}

function acknowledge(projectPath) {
  ensureDir(logDir(projectPath));
  safeFs.writeFileSync(ackFile(projectPath), JSON.stringify({
    acknowledgedAt: new Date().toISOString()
  }));
}

function getUnacknowledgedViolations(projectPath) {
  const violations = loadViolations(projectPath);
  const lastAck = getLastAck(projectPath);

  if (!lastAck.acknowledgedAt) {
    return violations;
  }

  return violations.filter(v =>
    new Date(v.timestamp) > new Date(lastAck.acknowledgedAt)
  );
}

function markResolved(planName, projectPath) {
  const violations = loadViolations(projectPath);
  for (const v of violations) {
    if (v.plan === planName && v.status === 'pending_reapproval') {
      v.status = 'resolved';
      v.resolvedAt = new Date().toISOString();
      v.resolution = 'Re-approved via menu';
    }
  }
  saveViolations(violations, projectPath);
}

module.exports = {
  logViolation,
  loadViolations,
  saveViolations,
  getUnacknowledgedViolations,
  acknowledge,
  markResolved,
  getLastAck
};

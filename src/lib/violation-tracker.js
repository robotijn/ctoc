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

const LOG_DIR = path.join(process.cwd(), '.ctoc', 'logs');
const VIOLATIONS_FILE = path.join(LOG_DIR, 'gate-violations.json');
const ACK_FILE = path.join(LOG_DIR, 'last-ack.json');

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
 */
function writeAtomicJsonl(entries) {
  ensureDir(LOG_DIR);
  const tmp = `${VIOLATIONS_FILE}.tmp-${process.pid}`;
  const jsonl = entries.length === 0 ? '' : entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  safeFs.writeFileSync(tmp, jsonl, 'utf8');
  safeFs.renameSync(tmp, VIOLATIONS_FILE);
}

function loadViolations() {
  return durableLog.readEntries(VIOLATIONS_FILE);
}

function saveViolations(violations) {
  writeAtomicJsonl(violations);
}

function logViolation(violation) {
  // Lossless O_APPEND; the durable-log preserves the documented last-100 cap.
  durableLog.appendEntry(VIOLATIONS_FILE, violation, { maxEntries: 100 });
}

function getLastAck() {
  try {
    if (safeFs.existsSync(ACK_FILE)) {
      return JSON.parse(safeFs.readFileSync(ACK_FILE, 'utf8'));
    }
  } catch { /* ignore: best-effort, non-fatal */ }
  return { acknowledgedAt: null };
}

function acknowledge() {
  ensureDir(LOG_DIR);
  safeFs.writeFileSync(ACK_FILE, JSON.stringify({
    acknowledgedAt: new Date().toISOString()
  }));
}

function getUnacknowledgedViolations() {
  const violations = loadViolations();
  const lastAck = getLastAck();

  if (!lastAck.acknowledgedAt) {
    return violations;
  }

  return violations.filter(v =>
    new Date(v.timestamp) > new Date(lastAck.acknowledgedAt)
  );
}

function markResolved(planName) {
  const violations = loadViolations();
  for (const v of violations) {
    if (v.plan === planName && v.status === 'pending_reapproval') {
      v.status = 'resolved';
      v.resolvedAt = new Date().toISOString();
      v.resolution = 'Re-approved via menu';
    }
  }
  saveViolations(violations);
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

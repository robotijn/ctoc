/**
 * Enforcement Log (C1 / CTOC v7; durability hardened in W11-s2)
 *
 * Append-only JSONL log at .ctoc/logs/enforcement.json. Captures every decision
 * the PreToolUse enforcement hook makes: allow, block, escape,
 * silent-passthrough, hook-broken.
 *
 * Durability: writes go through the shared `durable-log` primitive, so each
 * record is a single atomic O_APPEND line (no unguarded read-modify-write —
 * concurrent writers never lose each other's entries), a corrupt/truncated file
 * is quarantined aside (bytes preserved) rather than silently reset to `[]`, and
 * a pre-existing legacy JSON-array log is migrated to JSONL on first append. The
 * `MAX_ENTRIES` cap is enforced via the primitive's `maxEntries` rotation.
 */

const durableLog = require('./durable-log');
const safeFs = require('./safe-fs');
const path = require('path');

const MAX_ENTRIES = 1000;

/**
 * Resolve the enforcement-log path for a project root.
 *
 * @param {string} root - Project root
 * @returns {string} absolute path to .ctoc/logs/enforcement.json
 */
function logPathFor(root) {
  return path.join(root, '.ctoc', 'logs', 'enforcement.json');
}

/**
 * Append an entry to the enforcement log, losslessly and atomically. Creates the
 * log file and parent directory if missing. Rotates to the last MAX_ENTRIES
 * entries. A corrupt existing file is quarantined, not reset.
 *
 * @param {Object} entry - Decision details
 * @param {string} root - Project root
 * @returns {Object} the appended entry (including its timestamp)
 */
function logEnforcement(entry, root) {
  const logDir = path.join(root, '.ctoc', 'logs');
  if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });

  return durableLog.appendEntry(
    logPathFor(root),
    { timestamp: new Date().toISOString(), ...entry },
    { maxEntries: MAX_ENTRIES }
  );
}

/**
 * Read every enforcement-log entry as an in-memory Array. Delegates to the
 * durable-log reader so callers never depend on the on-disk format.
 *
 * @param {string} root - Project root
 * @returns {Array} the log entries (empty array if the log does not exist)
 */
function readLog(root) {
  return durableLog.readEntries(logPathFor(root));
}

module.exports = { logEnforcement, readLog };

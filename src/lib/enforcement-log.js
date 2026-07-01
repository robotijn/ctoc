/**
 * Enforcement Log (C1 / CTOC v7)
 *
 * Append-only JSON log at .ctoc/logs/enforcement.json. Captures every
 * decision the PreToolUse enforcement hook makes: allow, block, escape,
 * silent-passthrough, hook-broken.
 */

const safeFs = require('./safe-fs');
const path = require('path');

const MAX_ENTRIES = 1000;

/**
 * Append an entry to the enforcement log. Creates the log file and parent
 * directory if missing. Rotates by trimming oldest entries when over MAX_ENTRIES.
 *
 * @param {Object} entry - Decision details
 * @param {string} root - Project root
 */
function logEnforcement(entry, root) {
  const logDir = path.join(root, '.ctoc', 'logs');
  if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, 'enforcement.json');
  let log = [];
  if (safeFs.existsSync(logPath)) {
    try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
  }
  if (!Array.isArray(log)) log = [];

  log.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (log.length > MAX_ENTRIES) log = log.slice(-MAX_ENTRIES);

  safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

module.exports = { logEnforcement };

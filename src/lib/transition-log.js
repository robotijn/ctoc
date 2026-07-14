/**
 * Transition Log
 * Audit trail logging for all plan state changes.
 * Logs every transition to .ctoc/logs/transitions.json
 *
 * Durability (W11-s3): writes are append-only JSONL via the shared `durable-log`
 * primitive. Each transition is one line appended with a single atomic O_APPEND
 * write, so two concurrent writers never lose each other's records (the previous
 * read-whole → push → write-whole round trip silently dropped one of every pair
 * of racing writes — findings M14/M15). A wholly-corrupt file is quarantined
 * (renamed aside, bytes preserved) rather than silently reset to `[]`, and a
 * legacy whole-file JSON array is migrated to JSONL on the first append.
 *
 * The on-disk format changed; the API did NOT. `readLog`, `getTransitionsForPlan`,
 * and `getRecentTransitions` still return an Array, so every consumer is untouched.
 */

const path = require('path');
const durableLog = require('./durable-log');
const { findProjectRoot } = require('./project-root');

/**
 * Get path to transitions log file
 * @param {string} [projectPath] - Project root path
 * @returns {string} Path to transitions.json
 */
function getLogPath(projectPath) {
  const root = projectPath || findProjectRoot();
  return path.join(root, '.ctoc', 'logs', 'transitions.json');
}

/**
 * Read all transition log entries.
 *
 * Delegates to the durable-log reader, which returns an Array for a missing file
 * (`[]`), a legacy whole-file JSON array (as-is), or a JSONL file (line by line,
 * skipping a torn trailing line). It never throws on a corrupt file — a corrupt
 * file reads as `[]` and is quarantined by the next `logTransition`.
 *
 * @param {string} [projectPath] - Project root path
 * @returns {Array} Array of transition log entries
 */
function readLog(projectPath) {
  return durableLog.readEntries(getLogPath(projectPath));
}

/**
 * Log a plan state transition.
 *
 * The entry is appended losslessly and atomically via `durable-log.appendEntry`
 * (single O_APPEND write). The durable-log layer creates the log directory,
 * migrates a legacy JSON array to JSONL once, and quarantines a corrupt file
 * before appending. Transitions are uncapped (no rotation) — the full audit
 * trail is retained, preserving the module's prior behavior.
 *
 * @param {Object} entry - Transition log entry
 * @param {string} entry.plan - Plan filename
 * @param {string} entry.from - Source stage
 * @param {string} entry.to - Destination stage
 * @param {string} entry.actor - Who triggered (human, agent, system)
 * @param {Object} [entry.validation] - Validation result summary
 * @param {boolean} [entry.humanGate] - Whether this crossed a human gate
 * @param {boolean} [entry.marker] - Whether approval marker was added
 * @param {boolean} [entry.override] - Whether this crossing was a recorded human override of a failed validation (R5-B)
 * @param {string} [projectPath] - Project root path
 * @returns {Object} the logged entry
 */
function logTransition(entry, projectPath) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    plan: entry.plan,
    from: entry.from,
    to: entry.to,
    actor: entry.actor || 'human',
    validation: entry.validation || null,
    humanGate: entry.humanGate || false,
    marker: entry.marker || false
  };

  durableLog.appendEntry(getLogPath(projectPath), logEntry);

  return logEntry;
}

/**
 * Get transitions for a specific plan
 * @param {string} planName - Plan filename
 * @param {string} [projectPath] - Project root path
 * @returns {Array} Filtered transition entries
 */
function getTransitionsForPlan(planName, projectPath) {
  const entries = readLog(projectPath);
  return entries.filter(e => e.plan === planName);
}

/**
 * Get recent transitions (last N entries)
 * @param {number} [count=20] - Number of recent entries
 * @param {string} [projectPath] - Project root path
 * @returns {Array} Recent transition entries
 */
function getRecentTransitions(count = 20, projectPath) {
  const entries = readLog(projectPath);
  return entries.slice(-count);
}

module.exports = {
  getLogPath,
  readLog,
  logTransition,
  getTransitionsForPlan,
  getRecentTransitions
};

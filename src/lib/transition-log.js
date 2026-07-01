/**
 * Transition Log
 * Audit trail logging for all plan state changes.
 * Logs every transition to .ctoc/logs/transitions.json
 */

const safeFs = require('./safe-fs');
const path = require('path');
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
 * Ensure the log directory and file exist
 * @param {string} logPath - Path to transitions.json
 */
function ensureLogFile(logPath) {
  const dir = path.dirname(logPath);
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
  if (!safeFs.existsSync(logPath)) {
    safeFs.writeFileSync(logPath, '[]');
  }
}

/**
 * Read all transition log entries
 * @param {string} [projectPath] - Project root path
 * @returns {Array} Array of transition log entries
 */
function readLog(projectPath) {
  const logPath = getLogPath(projectPath);
  if (!safeFs.existsSync(logPath)) {
    return [];
  }
  try {
    const content = safeFs.readFileSync(logPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Log a plan state transition
 *
 * @param {Object} entry - Transition log entry
 * @param {string} entry.plan - Plan filename
 * @param {string} entry.from - Source stage
 * @param {string} entry.to - Destination stage
 * @param {string} entry.actor - Who triggered (human, agent, system)
 * @param {Object} [entry.validation] - Validation result summary
 * @param {boolean} [entry.humanGate] - Whether this crossed a human gate
 * @param {boolean} [entry.marker] - Whether approval marker was added
 * @param {string} [projectPath] - Project root path
 */
function logTransition(entry, projectPath) {
  const logPath = getLogPath(projectPath);
  ensureLogFile(logPath);

  const entries = readLog(projectPath);

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

  entries.push(logEntry);
  safeFs.writeFileSync(logPath, JSON.stringify(entries, null, 2));

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

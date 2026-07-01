/**
 * Agent Lock Module
 * PID + agentId based lock to enforce single-agent execution.
 * Lock file: .ctoc/agent.lock
 * Stop file: .ctoc/agent.stop
 */

const safeFs = require('./safe-fs');
const path = require('path');
const crypto = require('crypto');

const LOCK_FILE = 'agent.lock';
const STOP_FILE = 'agent.stop';

/**
 * Get path to the lock file
 * @param {string} projectPath - Project root
 * @returns {string} Absolute path to agent.lock
 */
function getLockPath(projectPath) {
  const dir = path.join(projectPath, '.ctoc');
  safeFs.mkdirSync(dir, { recursive: true });
  return path.join(dir, LOCK_FILE);
}

/**
 * Get path to the stop file
 * @param {string} projectPath - Project root
 * @returns {string} Absolute path to agent.stop
 */
function getStopPath(projectPath) {
  return path.join(projectPath, '.ctoc', STOP_FILE);
}

/**
 * Check if a PID is alive
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process exists
 */
function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;

  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      const output = execSync(`tasklist /FI "PID eq ${pid}"`, { encoding: 'utf8' });
      return output.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse the lock file
 * @param {string} projectPath - Project root
 * @returns {object|null} Lock data or null if not exists / parse error
 */
function readLock(projectPath) {
  const lockPath = getLockPath(projectPath);
  if (!safeFs.existsSync(lockPath)) return null;

  try {
    return JSON.parse(safeFs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Acquire the agent lock
 * @param {string} projectPath - Project root
 * @param {string} planName - Name of the plan being worked on
 * @returns {{ acquired: boolean, agentId?: string, error?: string, existingLock?: object }}
 */
function acquireLock(projectPath, planName) {
  const lockPath = getLockPath(projectPath);
  const existing = readLock(projectPath);

  if (existing) {
    if (isPidAlive(existing.pid)) {
      return {
        acquired: false,
        error: `Agent already active (PID ${existing.pid}, working on "${existing.plan}")`,
        existingLock: existing
      };
    }
    // Stale lock - remove it
    try { safeFs.unlinkSync(lockPath); } catch { /* ignore */ }
  }

  const agentId = crypto.randomUUID();
  const lockData = {
    pid: process.pid,
    agentId,
    plan: planName,
    startedAt: new Date().toISOString()
  };

  safeFs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2));
  return { acquired: true, agentId };
}

/**
 * Release the agent lock (and stop file)
 * @param {string} projectPath - Project root
 */
function releaseLock(projectPath) {
  const lockPath = getLockPath(projectPath);
  const stopPath = getStopPath(projectPath);

  try { safeFs.unlinkSync(lockPath); } catch { /* ignore */ }
  try { safeFs.unlinkSync(stopPath); } catch { /* ignore */ }
}

/**
 * Update the plan name in the lock file
 * @param {string} projectPath - Project root
 * @param {string} planName - New plan name
 */
function updateLockPlan(projectPath, planName) {
  const lockPath = getLockPath(projectPath);
  const lock = readLock(projectPath);
  if (!lock) return;

  lock.plan = planName;
  safeFs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
}

/**
 * Check if an agent lock is active
 * @param {string} projectPath - Project root
 * @returns {{ locked: boolean, lock?: object, stale?: boolean }}
 */
function isLocked(projectPath) {
  const lock = readLock(projectPath);

  if (!lock) {
    return { locked: false };
  }

  if (isPidAlive(lock.pid)) {
    return { locked: true, lock };
  }

  return { locked: false, stale: true, lock };
}

/**
 * Request agent stop (writes stop file)
 * @param {string} projectPath - Project root
 */
function requestStop(projectPath) {
  const stopPath = getStopPath(projectPath);
  const dir = path.dirname(stopPath);
  safeFs.mkdirSync(dir, { recursive: true });
  safeFs.writeFileSync(stopPath, '');
}

/**
 * Check if stop has been requested
 * @param {string} projectPath - Project root
 * @returns {boolean}
 */
function isStopRequested(projectPath) {
  return safeFs.existsSync(getStopPath(projectPath));
}

/**
 * Clear the stop file
 * @param {string} projectPath - Project root
 */
function clearStop(projectPath) {
  const stopPath = getStopPath(projectPath);
  try { safeFs.unlinkSync(stopPath); } catch { /* ignore */ }
}

module.exports = {
  acquireLock,
  releaseLock,
  updateLockPlan,
  readLock,
  isLocked,
  requestStop,
  isStopRequested,
  clearStop,
  isPidAlive,
  getLockPath,
  getStopPath
};

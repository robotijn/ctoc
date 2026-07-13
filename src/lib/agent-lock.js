/**
 * Agent Lock Module
 * PID + agentId based lock to enforce single-agent execution.
 * Lock file: .ctoc/agent.lock
 * Stop file: .ctoc/agent.stop
 *
 * Exclusivity is enforced at the WRITE, not at a separate check. acquireLock
 * performs an atomic exclusive-create (`{ flag: 'wx' }` => O_CREAT | O_EXCL):
 * the create itself fails with EEXIST if a lock already exists, closing the
 * check-then-act (TOCTOU) window where two processes could both observe "no
 * lock" and then both write. The agentId (a crypto.randomUUID) is the OWNER
 * TOKEN written into the lock. releaseLock and updateLockPlan accept an OPTIONAL
 * owner token and, when it is supplied, perform a compare-and-swap: they only
 * unlink / mutate when the on-disk agentId matches the token, so a foreign or
 * stale caller cannot drop or rewrite another agent's lock. Omitting the token
 * preserves the original unconditional behavior for legacy call sites. A stale
 * lock (dead PID) is still reclaimed: on EEXIST with a dead owner the file is
 * unlinked and the exclusive-create is retried once.
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
 * Build the "already active" rejection for a live existing lock.
 * @param {object} existing - The on-disk lock data
 * @returns {{ acquired: false, error: string, existingLock: object }}
 */
function activeRejection(existing) {
  return {
    acquired: false,
    error: `Agent already active (PID ${existing.pid}, working on "${existing.plan}")`,
    existingLock: existing
  };
}

/**
 * Acquire the agent lock via an atomic exclusive-create.
 *
 * The exclusive-create ({ flag: 'wx' }) IS the point of mutual exclusion: if a
 * lock file already exists the create fails with EEXIST, so two processes
 * racing to acquire cannot both succeed. On EEXIST the existing lock is read;
 * a live owner yields a rejection, a dead (stale) owner is reclaimed by
 * unlinking and retrying the exclusive-create exactly once.
 *
 * @param {string} projectPath - Project root
 * @param {string} planName - Name of the plan being worked on
 * @returns {{ acquired: boolean, agentId?: string, error?: string, existingLock?: object }}
 */
function acquireLock(projectPath, planName) {
  const lockPath = getLockPath(projectPath);
  const lockData = {
    pid: process.pid,
    agentId: crypto.randomUUID(),
    plan: planName,
    startedAt: new Date().toISOString()
  };
  const payload = JSON.stringify(lockData, null, 2);

  const createExclusive = () => {
    safeFs.writeFileSync(lockPath, payload, { flag: 'wx' });
    return { acquired: true, agentId: lockData.agentId };
  };

  try {
    return createExclusive();
  } catch (err) {
    // Any non-EEXIST error (e.g. a broken filesystem) must fail loud — never
    // silently "acquire" a lock we could not exclusively create.
    if (err.code !== 'EEXIST') throw err;

    const existing = readLock(projectPath);
    if (existing && isPidAlive(existing.pid)) {
      return activeRejection(existing);
    }

    // Stale or unreadable lock — reclaim it once.
    try { safeFs.unlinkSync(lockPath); } catch { /* ignore */ }
    try {
      return createExclusive();
    } catch (retryErr) {
      if (retryErr.code !== 'EEXIST') throw retryErr;
      // Another process won the reclaim race between our unlink and retry.
      const winner = readLock(projectPath);
      return winner
        ? activeRejection(winner)
        : { acquired: false, error: 'Agent already active' };
    }
  }
}

/**
 * Release the agent lock (and stop file).
 *
 * When `ownerToken` is supplied, this is a compare-and-swap: the lock is only
 * removed if the on-disk agentId matches the token, so a foreign or stale
 * caller cannot drop another agent's lock (and the stop file is left intact in
 * that case). When `ownerToken` is omitted, the original unconditional release
 * is preserved for legacy call sites.
 *
 * @param {string} projectPath - Project root
 * @param {string} [ownerToken] - Optional owner token (the acquiring agentId)
 */
function releaseLock(projectPath, ownerToken) {
  const lockPath = getLockPath(projectPath);
  const stopPath = getStopPath(projectPath);

  if (ownerToken !== undefined && ownerToken !== null) {
    const lock = readLock(projectPath);
    // A lock owned by a different token is not ours to release — leave both the
    // lock and its stop file untouched.
    if (lock && lock.agentId !== ownerToken) return;
  }

  try { safeFs.unlinkSync(lockPath); } catch { /* ignore */ }
  try { safeFs.unlinkSync(stopPath); } catch { /* ignore */ }
}

/**
 * Update the plan name in the lock file.
 *
 * When `ownerToken` is supplied, this is a compare-and-swap: the plan is only
 * updated if the on-disk agentId matches the token. When omitted, the update is
 * unconditional (legacy behavior).
 *
 * @param {string} projectPath - Project root
 * @param {string} planName - New plan name
 * @param {string} [ownerToken] - Optional owner token (the acquiring agentId)
 */
function updateLockPlan(projectPath, planName, ownerToken) {
  const lockPath = getLockPath(projectPath);
  const lock = readLock(projectPath);
  if (!lock) return;
  if (ownerToken !== undefined && ownerToken !== null && lock.agentId !== ownerToken) return;

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

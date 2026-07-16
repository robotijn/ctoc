#!/usr/bin/env node
/**
 * Quality State Manager
 *
 * Handles reading/writing quality state cache with:
 * - Atomic writes (temp file -> rename)
 * - Lockfile with PID for concurrency
 * - Running state tracking
 * - Self-healing recovery
 * - Per-tier status updates
 * - Git HEAD tracking
 */

const safeFs = require('./safe-fs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { findProjectRoot } = require('./project-root');

// Lazily computed paths -- findProjectRoot() may not be available at module load
// time when invoked from a git hook before the working directory is set.
let _stateDir = null;

function getStateDir() {
  if (!_stateDir) {
    const root = findProjectRoot();
    _stateDir = path.join(root, '.ctoc', 'quality-state');
  }
  return _stateDir;
}

function getStatusFilePath() {
  return path.join(getStateDir(), 'status.json');
}

function getLockFilePath() {
  return path.join(getStateDir(), '.lock');
}

function getFileHashesPath() {
  return path.join(getStateDir(), 'file-hashes.json');
}

function getCoverageMapPath() {
  return path.join(getStateDir(), 'coverage-map.json');
}

/**
 * Get the current git HEAD commit hash
 * @returns {string|null} Short SHA or null if not in a git repo
 */
function getGitHead() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Ensure state directory exists
 */
function ensureStateDir() {
  const dir = getStateDir();
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Atomic write - writes to temp file then renames
 * Prevents corruption from interrupted writes
 */
function atomicWrite(filePath, data) {
  ensureStateDir();
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const tempPath = `${filePath}.tmp.${process.pid}`;

  safeFs.writeFileSync(tempPath, content, 'utf8');
  safeFs.renameSync(tempPath, filePath);
}

/**
 * Safe read - handles missing/corrupted files
 */
function safeRead(filePath, defaultValue = null) {
  try {
    if (!safeFs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = safeFs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.warn(`Warning: Could not read ${filePath}: ${err.message}`);
    return defaultValue;
  }
}

/**
 * Check if a process is alive
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Number of exclusive-create attempts before giving up while racing concurrent
 * reclaimers of a stale lock. Each losing race removes/observes the stale lock
 * and retries; a small bound prevents an unbounded spin if reclaimers keep
 * re-creating the lock, in which case a live holder ultimately owns it.
 */
const LOCK_ACQUIRE_ATTEMPTS = 5;

/**
 * When the lock file EXISTS but is empty / unparseable it may be a live winner
 * mid-create: openSync(lockFile,'wx') succeeds atomically, but writing the holder
 * identity (fs.writeSync) is a SEPARATE step, so for a brief window (typically
 * microseconds, across two OS processes) the lock is 0 bytes. Treating that as a
 * corrupt lock and reclaiming it would UNLINK the live winner's lock and hand out
 * a second holder. So a reader that sees an empty lock first RETRIES the read a
 * few times with a tiny backoff — a live winner populates the identity almost
 * immediately — and only reclaims an empty lock that REMAINS empty AND has
 * persisted past a short grace window (an abandoned create: a process killed
 * between openSync and writeSync), which keeps the lock deadlock-free.
 */
const EMPTY_LOCK_READ_RETRIES = 5;
const EMPTY_LOCK_READ_BACKOFF_MS = 2;
const EMPTY_LOCK_GRACE_MS = 1000;

/**
 * Synchronous sleep with no busy-spin, cross-platform (no shell). Atomics.wait on
 * a private SharedArrayBuffer blocks the current thread for `ms` and returns
 * 'timed-out'; used only for the sub-millisecond backoff between empty-lock reads.
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Parse the lock holder identity, returning null when the file is missing, empty,
 * or unparseable (e.g. a winner's not-yet-populated 0-byte lock).
 */
function readLockData(lockFile) {
  try {
    return JSON.parse(safeFs.readFileSync(lockFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Remove the lock file, tolerating a concurrent reclaimer having already removed
 * it. A missing file (ENOENT) means someone else won the removal — that is the
 * desired end state, not an error, so it is swallowed. Any other error is real
 * and propagates.
 */
function removeStaleLock(lockFile) {
  try {
    safeFs.unlinkSync(lockFile);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
}

/**
 * Acquire lock for quality checks
 * Returns true if lock acquired, false if another process is running
 *
 * Uses an ATOMIC exclusive-create (openSync with the 'wx' flag = O_CREAT|O_EXCL)
 * so exactly one process can win — no check-then-act TOCTOU where two processes
 * both observe "no lock" and both write it, yielding two holders and a lost
 * update in withStatusLock's read-modify-write. On EEXIST the lock is held (return
 * false if the holder is alive) or stale (dead pid / corrupt), in which case it is
 * reclaimed by unlink-then-retry within a bounded loop; a concurrent reclaimer's
 * ENOENT/EEXIST is treated as "someone else won, retry", never thrown.
 */
function acquireLock() {
  ensureStateDir();
  const lockFile = getLockFilePath();

  for (let attempt = 0; attempt < LOCK_ACQUIRE_ATTEMPTS; attempt++) {
    let fd;
    try {
      // Atomic exclusive create: fails with EEXIST if the lock already exists.
      fd = safeFs.openSync(lockFile, 'wx');
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err;

      // Lock exists: inspect the holder.
      let lockData = readLockData(lockFile);

      // Empty / unparseable lock: distinguish a live winner mid-create (0-byte
      // between openSync('wx') and writeSync) from a genuinely abandoned/corrupt
      // lock. Retry the read a few times with a tiny backoff — a live winner
      // populates the identity within microseconds. Do NOT unlink here: reclaiming
      // now would steal a live holder's lock and yield two holders.
      if (lockData === null) {
        for (let r = 0; r < EMPTY_LOCK_READ_RETRIES && lockData === null; r++) {
          sleepSync(EMPTY_LOCK_READ_BACKOFF_MS);
          lockData = readLockData(lockFile);
        }
      }

      if (lockData && isProcessAlive(lockData.pid)) {
        console.log(`Another quality check is running (PID: ${lockData.pid})`);
        return false;
      }

      if (lockData === null) {
        // Still empty after the retries. Only reclaim it if it has persisted past
        // the grace window (an abandoned create — a process killed between
        // openSync and writeSync). A still-fresh empty lock is a live holder
        // mid-write: back off (return false) rather than steal it.
        let ageMs;
        try {
          ageMs = Date.now() - safeFs.statSync(lockFile).mtimeMs;
        } catch (statErr) {
          // The lock vanished between EEXIST and stat (a concurrent reclaimer or
          // the winner releasing) → retry the exclusive create.
          if (statErr && statErr.code === 'ENOENT') continue;
          throw statErr;
        }
        if (ageMs < EMPTY_LOCK_GRACE_MS) {
          console.log('Another quality check is starting (lock is being written)');
          return false;
        }
        console.log('Removing abandoned empty lock file');
        removeStaleLock(lockFile);
        continue;
      }

      // Populated but the holding pid is dead — a stale lock from a crashed
      // process. Reclaim it and retry the exclusive create; tolerate a concurrent
      // reclaimer having already removed it.
      console.log(`Removing stale lock from crashed process (PID: ${lockData.pid})`);
      removeStaleLock(lockFile);
      continue;
    }

    // Won the exclusive create — write our identity into the open fd, then close.
    try {
      const lockData = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        hostname: os.hostname()
      };
      fs.writeSync(fd, JSON.stringify(lockData, null, 2));
    } finally {
      fs.closeSync(fd);
    }
    return true;
  }

  // Exhausted attempts racing concurrent reclaimers — a live holder owns the lock.
  console.log('Another quality check is running (could not acquire lock)');
  return false;
}

/**
 * Release lock
 */
function releaseLock() {
  const lockFile = getLockFilePath();
  try {
    if (safeFs.existsSync(lockFile)) {
      const lockData = safeRead(lockFile);
      // Only release if we own the lock
      if (lockData && lockData.pid === process.pid) {
        safeFs.unlinkSync(lockFile);
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not release lock: ${err.message}`);
  }
}

/**
 * Whether THIS process currently holds the quality-state lock. Reads the lock
 * file directly (never through the noisy acquireLock path) so a nested update can
 * detect that the surrounding quality run already owns the lock.
 * @returns {boolean}
 */
function lockHeldBySelf() {
  const lockFile = getLockFilePath();
  if (!safeFs.existsSync(lockFile)) return false;
  const lockData = safeRead(lockFile);
  return !!(lockData && lockData.pid === process.pid);
}

/**
 * Serialize a read-modify-write of the quality state under the module's own lock,
 * so two writers cannot interleave getStatus()→mutate→atomicWrite() and lose each
 * other's update (a failing tier result must never be clobbered by a concurrent
 * pass). Re-entrancy-safe and best-effort:
 *   - If this process ALREADY holds the lock (the quality runner acquires it
 *     around the whole run, then calls these wrappers), run the critical section
 *     WITHOUT re-acquiring and WITHOUT releasing the outer lock.
 *   - Otherwise acquire the lock, run, and release it in `finally` — but only
 *     release a lock WE acquired. acquireLock is non-blocking; when a foreign live
 *     holder owns it we proceed best-effort (advisory), which is strictly better
 *     than the previous unguarded write and never blocks the caller.
 * @template T
 * @param {() => T} fn  the load→mutate→write critical section
 * @returns {T}
 */
function withStatusLock(fn) {
  if (lockHeldBySelf()) return fn(); // nested under the run-level lock: do not double-lock/release
  const acquired = acquireLock();
  try {
    return fn();
  } finally {
    if (acquired) releaseLock();
  }
}

/**
 * Get current status
 */
function getStatus() {
  return safeRead(getStatusFilePath(), {
    overallStatus: 'unknown',
    asOf: null,
    gitHead: null,
    tiers: {
      tier1: { status: 'pending', checkedAt: null },
      tier2: { status: 'pending', checkedAt: null },
      tier3: { status: 'pending', checkedAt: null }
    },
    summary: {
      tests: { passed: 0, failed: 0, skipped: 0, flaky: 0 },
      coverage: 0,
      lint: { errors: 0, warnings: 0 },
      typecheck: { errors: 0 },
      security: { critical: 0, high: 0, medium: 0 }
    },
    lastRun: {
      startedAt: null,
      completedAt: null,
      duration: null,
      triggeredBy: null
    }
  });
}

/**
 * Update status
 */
function updateStatus(updates) {
  return withStatusLock(() => {
    const current = getStatus();
    const updated = { ...current, ...updates, asOf: new Date().toISOString() };
    atomicWrite(getStatusFilePath(), updated);
    return updated;
  });
}

/**
 * Set running state (called when quality check starts)
 * Tracks the git HEAD at the time the check begins.
 */
function setRunning(triggeredBy = 'manual') {
  const gitHead = getGitHead();
  return updateStatus({
    overallStatus: 'running',
    gitHead,
    lastRun: {
      startedAt: new Date().toISOString(),
      completedAt: null,
      duration: null,
      triggeredBy
    }
  });
}

/**
 * Set completed state (called when quality check finishes)
 */
function setCompleted(passed, summary) {
  const status = getStatus();
  const startedAt = status.lastRun?.startedAt ? new Date(status.lastRun.startedAt) : new Date();
  const completedAt = new Date();
  // Date−Date subtraction coerces via valueOf() at runtime; the `any` casts keep
  // that behavior while satisfying checkJs's numeric-operand requirement.
  const duration = /** @type {any} */ (completedAt) - /** @type {any} */ (startedAt);

  return updateStatus({
    overallStatus: passed ? 'pass' : 'fail',
    summary,
    lastRun: {
      ...status.lastRun,
      completedAt: completedAt.toISOString(),
      duration
    }
  });
}

/**
 * Update a specific tier's status
 * @param {string} tierName - 'tier1', 'tier2', or 'tier3'
 * @param {Object} tierResult - { status, checks?, warnings?, details? }
 */
function updateTierStatus(tierName, tierResult) {
  return withStatusLock(() => {
    const status = getStatus();
    if (!status.tiers) {
      status.tiers = {};
    }
    status.tiers[tierName] = {
      ...status.tiers[tierName],
      ...tierResult,
      checkedAt: new Date().toISOString()
    };
    atomicWrite(getStatusFilePath(), { ...status, asOf: new Date().toISOString() });
    return status;
  });
}

/**
 * Check for and recover from interrupted runs
 */
function recoverIfNeeded() {
  const status = getStatus();
  const lockFile = getLockFilePath();

  // Check for stale "running" state without lock
  if (status.overallStatus === 'running') {
    if (!safeFs.existsSync(lockFile)) {
      console.log('Detected interrupted quality check, resetting state...');
      updateStatus({
        overallStatus: 'unknown',
        lastRun: {
          ...status.lastRun,
          completedAt: new Date().toISOString(),
          duration: null,
          error: 'Interrupted - recovered on restart'
        }
      });
      return true;
    }
  }

  return false;
}

/**
 * Get file hashes cache
 */
function getFileHashes() {
  return safeRead(getFileHashesPath(), {});
}

/**
 * Update file hashes
 */
function updateFileHashes(hashes) {
  return withStatusLock(() => {
    const current = getFileHashes();
    const updated = { ...current, ...hashes };
    atomicWrite(getFileHashesPath(), updated);
    return updated;
  });
}

/**
 * Get coverage map
 */
function getCoverageMap() {
  return safeRead(getCoverageMapPath(), {});
}

/**
 * Update coverage map
 */
function updateCoverageMap(map) {
  atomicWrite(getCoverageMapPath(), map);
  return map;
}

/**
 * Check if coverage map needs rebuild
 */
function needsCoverageMapRebuild() {
  const map = getCoverageMap();

  // No map exists
  if (!map || Object.keys(map).length === 0) {
    return { needed: true, reason: 'No coverage map exists' };
  }

  // Check map age
  if (map._meta?.rebuiltAt) {
    const age = Date.now() - new Date(map._meta.rebuiltAt).getTime();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (age > maxAge) {
      return { needed: true, reason: 'Coverage map is older than 7 days' };
    }
  }

  return { needed: false };
}

module.exports = {
  // Core operations
  ensureStateDir,
  atomicWrite,
  safeRead,

  // Lock management
  acquireLock,
  releaseLock,
  isProcessAlive,

  // Status management
  getStatus,
  updateStatus,
  setRunning,
  setCompleted,
  updateTierStatus,
  recoverIfNeeded,

  // File hashes
  getFileHashes,
  updateFileHashes,

  // Coverage map
  getCoverageMap,
  updateCoverageMap,
  needsCoverageMapRebuild,

  // Path accessors (lazy, uses findProjectRoot)
  getStateDir,
  getStatusFilePath,
  getLockFilePath,
  getFileHashesPath,
  getCoverageMapPath,

  // Git
  getGitHead
};

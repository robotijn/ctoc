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
 * Acquire lock for quality checks
 * Returns true if lock acquired, false if another process is running
 */
function acquireLock() {
  ensureStateDir();
  const lockFile = getLockFilePath();

  // Check for existing lock
  if (safeFs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(safeFs.readFileSync(lockFile, 'utf8'));

      // Check if lock holder is still alive
      if (isProcessAlive(lockData.pid)) {
        console.log(`Another quality check is running (PID: ${lockData.pid})`);
        return false;
      }

      // Stale lock - previous process crashed
      console.log(`Removing stale lock from crashed process (PID: ${lockData.pid})`);
      safeFs.unlinkSync(lockFile);
    } catch {
      // Corrupted lock file, remove it
      safeFs.unlinkSync(lockFile);
    }
  }

  // Create new lock
  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: os.hostname()
  };

  atomicWrite(lockFile, lockData);
  return true;
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
  const current = getStatus();
  const updated = { ...current, ...updates, asOf: new Date().toISOString() };
  atomicWrite(getStatusFilePath(), updated);
  return updated;
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
  const duration = completedAt - startedAt;

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
  const current = getFileHashes();
  const updated = { ...current, ...hashes };
  atomicWrite(getFileHashesPath(), updated);
  return updated;
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

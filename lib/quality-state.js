#!/usr/bin/env node
/**
 * Quality State Manager
 *
 * Handles reading/writing quality state cache with:
 * - Atomic writes (temp file → rename)
 * - Lockfile with PID for concurrency
 * - Running state tracking
 * - Self-healing recovery
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = path.join(process.cwd(), '.ctoc', 'quality-state');
const STATUS_FILE = path.join(STATE_DIR, 'status.json');
const LOCK_FILE = path.join(STATE_DIR, '.lock');
const FILE_HASHES = path.join(STATE_DIR, 'file-hashes.json');
const COVERAGE_MAP = path.join(STATE_DIR, 'coverage-map.json');

/**
 * Ensure state directory exists
 */
function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
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

  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Safe read - handles missing/corrupted files
 */
function safeRead(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
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

  // Check for existing lock
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));

      // Check if lock holder is still alive
      if (isProcessAlive(lockData.pid)) {
        console.log(`Another quality check is running (PID: ${lockData.pid})`);
        return false;
      }

      // Stale lock - previous process crashed
      console.log(`Removing stale lock from crashed process (PID: ${lockData.pid})`);
      fs.unlinkSync(LOCK_FILE);
    } catch {
      // Corrupted lock file, remove it
      fs.unlinkSync(LOCK_FILE);
    }
  }

  // Create new lock
  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: os.hostname()
  };

  atomicWrite(LOCK_FILE, lockData);
  return true;
}

/**
 * Release lock
 */
function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = safeRead(LOCK_FILE);
      // Only release if we own the lock
      if (lockData && lockData.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
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
  return safeRead(STATUS_FILE, {
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
  atomicWrite(STATUS_FILE, updated);
  return updated;
}

/**
 * Set running state (called when quality check starts)
 */
function setRunning(triggeredBy = 'manual') {
  return updateStatus({
    overallStatus: 'running',
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
 * Check for and recover from interrupted runs
 */
function recoverIfNeeded() {
  const status = getStatus();

  // Check for stale "running" state without lock
  if (status.overallStatus === 'running') {
    if (!fs.existsSync(LOCK_FILE)) {
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
  return safeRead(FILE_HASHES, {});
}

/**
 * Update file hashes
 */
function updateFileHashes(hashes) {
  const current = getFileHashes();
  const updated = { ...current, ...hashes };
  atomicWrite(FILE_HASHES, updated);
  return updated;
}

/**
 * Get coverage map
 */
function getCoverageMap() {
  return safeRead(COVERAGE_MAP, {});
}

/**
 * Update coverage map
 */
function updateCoverageMap(map) {
  atomicWrite(COVERAGE_MAP, map);
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
  recoverIfNeeded,

  // File hashes
  getFileHashes,
  updateFileHashes,

  // Coverage map
  getCoverageMap,
  updateCoverageMap,
  needsCoverageMapRebuild,

  // Paths
  STATE_DIR,
  STATUS_FILE,
  LOCK_FILE,
  FILE_HASHES,
  COVERAGE_MAP
};

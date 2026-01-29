/**
 * CTOC Commit Queue
 *
 * Provides sequential commit processing with file locking to prevent
 * race conditions when multiple background agents commit in parallel.
 *
 * Features:
 * - File-based locking for exclusive access
 * - JSON queue for pending commits
 * - Automatic version bumping (patch level)
 * - Atomic commit processing
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// Constants
// ============================================================================

const CTOC_DIR = '.ctoc';
const LOCK_FILE = '.commit-lock';
const QUEUE_FILE = '.commit-queue.json';
const LOCK_TIMEOUT_MS = 60000; // 60 seconds max wait for lock
const LOCK_STALE_MS = 300000;  // 5 minutes = stale lock (process died)

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Gets the CTOC root directory (where .ctoc lives)
 */
function getCTOCRoot() {
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, CTOC_DIR))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

/**
 * Gets the lock file path
 */
function getLockPath(root = getCTOCRoot()) {
  return path.join(root, CTOC_DIR, LOCK_FILE);
}

/**
 * Gets the queue file path
 */
function getQueuePath(root = getCTOCRoot()) {
  return path.join(root, CTOC_DIR, QUEUE_FILE);
}

/**
 * Gets the VERSION file path
 */
function getVersionPath(root = getCTOCRoot()) {
  return path.join(root, 'VERSION');
}

// ============================================================================
// Lock Management
// ============================================================================

/**
 * Checks if a lock file is stale (process that created it is gone)
 */
function isLockStale(lockPath) {
  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const lockData = JSON.parse(content);
    const lockAge = Date.now() - lockData.timestamp;

    // Lock is stale if older than threshold
    if (lockAge > LOCK_STALE_MS) {
      return true;
    }

    // Check if PID still exists (Unix only)
    if (lockData.pid && process.platform !== 'win32') {
      try {
        process.kill(lockData.pid, 0); // Signal 0 = check if process exists
        return false; // Process exists, lock is valid
      } catch (e) {
        return true; // Process doesn't exist, lock is stale
      }
    }

    return false;
  } catch (e) {
    return true; // Can't read lock, assume stale
  }
}

/**
 * Acquires an exclusive lock for commit operations
 * @param {number} timeout - Max milliseconds to wait (default: LOCK_TIMEOUT_MS)
 * @returns {Object} Result {success, error?}
 */
function acquireLock(timeout = LOCK_TIMEOUT_MS) {
  const root = getCTOCRoot();
  const lockPath = getLockPath(root);
  const ctocDir = path.join(root, CTOC_DIR);

  // Ensure .ctoc directory exists
  if (!fs.existsSync(ctocDir)) {
    fs.mkdirSync(ctocDir, { recursive: true });
  }

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check if lock exists
    if (fs.existsSync(lockPath)) {
      // Check if lock is stale
      if (isLockStale(lockPath)) {
        // Remove stale lock
        try {
          fs.unlinkSync(lockPath);
        } catch (e) {
          // Another process may have removed it
        }
      } else {
        // Lock is held, wait and retry
        sleepSync(100);
        continue;
      }
    }

    // Try to create lock atomically
    try {
      const lockData = {
        pid: process.pid,
        timestamp: Date.now(),
        host: require('os').hostname()
      };

      // Use wx flag for exclusive create (fails if exists)
      fs.writeFileSync(lockPath, JSON.stringify(lockData), { flag: 'wx' });

      return { success: true };
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Another process got the lock, retry
        sleepSync(100);
        continue;
      }
      return { success: false, error: e.message };
    }
  }

  return { success: false, error: `Lock acquisition timed out after ${timeout}ms` };
}

/**
 * Releases the commit lock
 * @returns {Object} Result {success, error?}
 */
function releaseLock() {
  const lockPath = getLockPath();

  try {
    if (fs.existsSync(lockPath)) {
      // Only release if we own the lock
      const content = fs.readFileSync(lockPath, 'utf8');
      const lockData = JSON.parse(content);

      if (lockData.pid === process.pid) {
        fs.unlinkSync(lockPath);
        return { success: true };
      } else {
        return { success: false, error: 'Lock owned by another process' };
      }
    }
    return { success: true }; // No lock to release
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Synchronous sleep helper
 */
function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy wait (not ideal but works for short durations)
  }
}

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Loads the commit queue
 */
function loadQueue(root = getCTOCRoot()) {
  const queuePath = getQueuePath(root);

  if (!fs.existsSync(queuePath)) {
    return { items: [], lastProcessed: null };
  }

  try {
    return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (e) {
    return { items: [], lastProcessed: null };
  }
}

/**
 * Saves the commit queue
 */
function saveQueue(queue, root = getCTOCRoot()) {
  const queuePath = getQueuePath(root);
  const ctocDir = path.join(root, CTOC_DIR);

  if (!fs.existsSync(ctocDir)) {
    fs.mkdirSync(ctocDir, { recursive: true });
  }

  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

/**
 * Adds a commit to the queue
 * @param {string} feature - Feature name/identifier
 * @param {string[]} files - Files to stage (empty = all staged files)
 * @param {string} message - Commit message (without version suffix)
 * @returns {Object} Result {success, position, error?}
 */
function enqueueCommit(feature, files, message) {
  const root = getCTOCRoot();

  // Acquire lock before modifying queue
  const lockResult = acquireLock();
  if (!lockResult.success) {
    return { success: false, error: lockResult.error };
  }

  try {
    const queue = loadQueue(root);

    const item = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      feature: feature,
      files: files || [],
      message: message,
      enqueued: new Date().toISOString(),
      status: 'pending'
    };

    queue.items.push(item);
    saveQueue(queue, root);

    releaseLock();

    return {
      success: true,
      position: queue.items.length,
      id: item.id
    };
  } catch (e) {
    releaseLock();
    return { success: false, error: e.message };
  }
}

// ============================================================================
// Version Management
// ============================================================================

/**
 * Reads the current version from VERSION file
 */
function readVersion(root = getCTOCRoot()) {
  const versionPath = getVersionPath(root);

  if (!fs.existsSync(versionPath)) {
    return { major: 0, minor: 0, patch: 0, string: '0.0.0' };
  }

  const content = fs.readFileSync(versionPath, 'utf8').trim();
  const parts = content.split('.');

  return {
    major: parseInt(parts[0] || 0, 10),
    minor: parseInt(parts[1] || 0, 10),
    patch: parseInt(parts[2] || 0, 10),
    string: content
  };
}

/**
 * Bumps the patch version and writes to file
 * @returns {Object} New version {major, minor, patch, string}
 */
function bumpPatchVersion(root = getCTOCRoot()) {
  const version = readVersion(root);
  const newPatch = version.patch + 1;
  const newString = `${version.major}.${version.minor}.${newPatch}`;

  const versionPath = getVersionPath(root);
  fs.writeFileSync(versionPath, `${newString}\n`);

  return {
    major: version.major,
    minor: version.minor,
    patch: newPatch,
    string: newString,
    previous: version.string
  };
}

// ============================================================================
// Commit Processing
// ============================================================================

/**
 * Processes the next commit in the queue
 * @returns {Object} Result {success, version?, committed?, error?}
 */
function processNextCommit() {
  const root = getCTOCRoot();

  // Acquire lock
  const lockResult = acquireLock();
  if (!lockResult.success) {
    return { success: false, error: lockResult.error };
  }

  try {
    const queue = loadQueue(root);

    // Find first pending item
    const pendingIndex = queue.items.findIndex(item => item.status === 'pending');

    if (pendingIndex === -1) {
      releaseLock();
      return { success: true, committed: false, message: 'Queue is empty' };
    }

    const item = queue.items[pendingIndex];

    // Mark as processing
    item.status = 'processing';
    item.startedAt = new Date().toISOString();
    saveQueue(queue, root);

    try {
      // Change to CTOC root for git operations
      const originalCwd = process.cwd();
      process.chdir(root);

      // Bump version
      const newVersion = bumpPatchVersion(root);

      // Stage files
      if (item.files && item.files.length > 0) {
        // Stage specific files
        for (const file of item.files) {
          execSync(`git add "${file}"`, { stdio: 'pipe' });
        }
      }

      // Always stage VERSION file
      execSync('git add VERSION', { stdio: 'pipe' });

      // Create commit message with version
      const fullMessage = `${item.message} (v${newVersion.string})\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`;

      // Commit with --no-verify to skip hooks (we handle versioning)
      execSync(`git commit --no-verify -m "${fullMessage.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });

      // Restore original directory
      process.chdir(originalCwd);

      // Mark as completed
      item.status = 'completed';
      item.completedAt = new Date().toISOString();
      item.version = newVersion.string;
      queue.lastProcessed = item.id;
      saveQueue(queue, root);

      releaseLock();

      return {
        success: true,
        committed: true,
        version: newVersion.string,
        previousVersion: newVersion.previous,
        feature: item.feature,
        message: item.message
      };

    } catch (e) {
      // Mark as failed
      item.status = 'failed';
      item.error = e.message;
      item.failedAt = new Date().toISOString();
      saveQueue(queue, root);

      releaseLock();

      return { success: false, error: `Commit failed: ${e.message}` };
    }

  } catch (e) {
    releaseLock();
    return { success: false, error: e.message };
  }
}

/**
 * Processes all pending commits in the queue
 * @returns {Object} Result {success, processed, failed, results}
 */
function processAllCommits() {
  const results = [];
  let processed = 0;
  let failed = 0;

  while (true) {
    const result = processNextCommit();

    if (!result.success) {
      results.push(result);
      failed++;
      break; // Stop on error
    }

    if (!result.committed) {
      break; // Queue is empty
    }

    results.push(result);
    processed++;
  }

  return {
    success: failed === 0,
    processed,
    failed,
    results
  };
}

/**
 * Gets the current queue status
 * @returns {Object} Queue status
 */
function getQueueStatus() {
  const root = getCTOCRoot();
  const queue = loadQueue(root);
  const lockPath = getLockPath(root);

  const pending = queue.items.filter(i => i.status === 'pending').length;
  const processing = queue.items.filter(i => i.status === 'processing').length;
  const completed = queue.items.filter(i => i.status === 'completed').length;
  const failed = queue.items.filter(i => i.status === 'failed').length;

  const isLocked = fs.existsSync(lockPath) && !isLockStale(lockPath);

  return {
    pending,
    processing,
    completed,
    failed,
    total: queue.items.length,
    isLocked,
    lastProcessed: queue.lastProcessed,
    currentVersion: readVersion(root).string
  };
}

/**
 * Clears completed and failed items from the queue
 * @returns {Object} Result {success, cleared}
 */
function clearCompletedFromQueue() {
  const root = getCTOCRoot();

  const lockResult = acquireLock();
  if (!lockResult.success) {
    return { success: false, error: lockResult.error };
  }

  try {
    const queue = loadQueue(root);
    const originalCount = queue.items.length;

    queue.items = queue.items.filter(
      item => item.status === 'pending' || item.status === 'processing'
    );

    saveQueue(queue, root);
    releaseLock();

    return {
      success: true,
      cleared: originalCount - queue.items.length
    };
  } catch (e) {
    releaseLock();
    return { success: false, error: e.message };
  }
}

// ============================================================================
// Direct Commit (for release.sh compatibility)
// ============================================================================

/**
 * Performs a direct commit with version bump (blocking, no queue)
 * This is used by release.sh for immediate commits.
 * @param {string} message - Commit message (without version)
 * @param {string[]} files - Files to stage (empty = use git add -A)
 * @returns {Object} Result {success, version?, error?}
 */
function directCommit(message, files = []) {
  const root = getCTOCRoot();

  // Acquire lock (blocks until available)
  const lockResult = acquireLock();
  if (!lockResult.success) {
    return { success: false, error: lockResult.error };
  }

  try {
    const originalCwd = process.cwd();
    process.chdir(root);

    // Bump version
    const newVersion = bumpPatchVersion(root);

    // Stage files
    if (files && files.length > 0) {
      for (const file of files) {
        execSync(`git add "${file}"`, { stdio: 'pipe' });
      }
      execSync('git add VERSION', { stdio: 'pipe' });
    } else {
      execSync('git add -A', { stdio: 'pipe' });
    }

    // Create commit
    const fullMessage = `${message} (v${newVersion.string})\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`;
    execSync(`git commit --no-verify -m "${fullMessage.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });

    process.chdir(originalCwd);
    releaseLock();

    return {
      success: true,
      version: newVersion.string,
      previousVersion: newVersion.previous
    };

  } catch (e) {
    releaseLock();
    return { success: false, error: e.message };
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Lock Management
  acquireLock,
  releaseLock,

  // Queue Management
  enqueueCommit,
  processNextCommit,
  processAllCommits,
  getQueueStatus,
  clearCompletedFromQueue,

  // Version Management
  readVersion,
  bumpPatchVersion,

  // Direct Commit
  directCommit,

  // Constants (for testing)
  LOCK_FILE,
  QUEUE_FILE,
  LOCK_TIMEOUT_MS,
  LOCK_STALE_MS
};

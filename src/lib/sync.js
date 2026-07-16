/**
 * Sync Manager
 * Event-triggered sync with rate limiting for plans
 *
 * Features:
 * - Event-triggered sync on plan operations (create/edit/approve/delete)
 * - Rate-limited remote checks (60s cooldown by default)
 * - Auto-commit with descriptive messages
 * - Offline mode support (queues commits for later push)
 * - Conflict detection
 */

const { execFileSync } = require('child_process');
const safeFs = require('./safe-fs');
const path = require('path');
// R3-C: the push ship gate. `isAutoPushEnabled` is the ONE key every push path in
// this file consults; it is FALSE unless the human explicitly opted in. Sync may
// commit plan state freely — committing is local and reversible — but it never
// ships. The human ships via /ctoc:push.
const { getSetting, isAutoPushEnabled } = require('./settings');

let syncInterval = null;
let lastSync = null;

// Default sync configuration
const DEFAULT_SYNC_CONFIG = {
  enabled: true,
  check_interval: 60,      // Minimum seconds between remote checks
  auto_commit: true,       // Auto-commit plan changes (local, reversible)
  auto_push: false,        // SHIP GATE: never push unless the human opted in
  auto_pull: 'prompt',     // prompt | always | never
  branch: 'main'           // Branch to sync
};

// Commit message formats for different actions
const COMMIT_MESSAGES = {
  create: (name) => `plan: create ${name}`,
  edit: (name) => `plan: update ${name}`,
  delete: (name) => `plan: delete ${name}`,
  approve: (name, opts) => `plan: ${opts?.from || 'unknown'} → ${opts?.to || 'unknown'} ${name}`
};

// SECURITY: every git subprocess in this module runs argv-safe via execFileSync — a
// fixed argument vector, NO shell. Nothing (a plan name, a stage name, a branch name,
// a commit message) is ever concatenated into a shell string, so a shell metacharacter
// in plan-controlled data (e.g. autoCommitPlan's commit message) can never break out of
// its argument and execute. This closes the autoCommitPlan commit-message injection: a
// plan name like `a";touch X;echo "` is now an inert literal, not a command.
/**
 * Run git argv-safe (no shell). Defaults to utf8 so the return is a string a
 * caller can `.trim()` — the same encoding the old execSync calls passed. A
 * caller may override any option (cwd, stdio, encoding).
 * @param {string[]} args
 * @param {object} [options]
 * @returns {string}
 */
function git(args, options = {}) {
  return /** @type {string} */ (execFileSync('git', args, { encoding: 'utf8', ...options }));
}

// Start auto-sync
function startAutoSync(projectPath = process.cwd()) {
  const enabled = getSetting('general', 'syncEnabled', projectPath);
  const intervalMinutes = getSetting('general', 'syncInterval', projectPath) || 5;

  if (!enabled) {
    return;
  }

  // Clear existing interval
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  // Set up new interval
  const intervalMs = intervalMinutes * 60 * 1000;
  syncInterval = setInterval(() => {
    syncPlans(projectPath);
  }, intervalMs);

  // Initial sync
  syncPlans(projectPath);
}

// Stop auto-sync
function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// Sync plans to git
function syncPlans(projectPath = process.cwd()) {
  try {
    // Check for changes in plans directory
    const status = git(['status', '--porcelain', 'plans/'], {
      cwd: projectPath,
      encoding: 'utf8'
    }).trim();

    if (!status) {
      lastSync = new Date();
      return { synced: false, reason: 'no changes' };
    }

    // Add + commit. Committing is local and reversible — it is NOT a ship gate.
    git(['add', 'plans/'], { cwd: projectPath });

    const commitMsg = `chore: auto-sync plans [${new Date().toISOString()}]`;
    git(['commit', '-m', commitMsg], { cwd: projectPath });

    // SHIP GATE (R3-C). This timer fires every 5 minutes from a menu open. It used
    // to rebase and push `origin main` unattended — a machine crossing a human ship
    // gate, on a clock. Both the rebase (history rewrite) and the push now happen
    // ONLY when the human explicitly opted in.
    if (!isAutoPushEnabled(projectPath)) {
      lastSync = new Date();
      return {
        synced: true,
        pushed: false,
        timestamp: lastSync,
        reason: 'auto-push disabled (ship gate) — commit only; push with /ctoc:push'
      };
    }

    // Pull first to avoid conflicts (only on the opted-in path).
    try {
      git(['pull', '--rebase', 'origin', 'main'], { cwd: projectPath, stdio: 'pipe' });
    } catch (e) {
      // May fail if no upstream, continue anyway
    }

    git(['push', 'origin', 'main'], { cwd: projectPath, stdio: 'pipe' });

    lastSync = new Date();
    return { synced: true, pushed: true, timestamp: lastSync };

  } catch (error) {
    return { synced: false, error: error.message };
  }
}

// Get last sync time
function getLastSync() {
  return lastSync;
}

// Manual sync trigger
function manualSync(projectPath = process.cwd()) {
  return syncPlans(projectPath);
}

// R4-B: `moveToReviewAfterPush` (a raw renameSync into plans/review/ gated only by
// the auto-move-to-review workflow toggle) was DELETED. It had ZERO callers, was
// default-ON via a visible switch, and offered a second, evidence-LESS door into
// review/ — the exact
// residency the wave exists to abolish. A plan reaches review in exactly ONE place:
// the completion path (actions.completeTaskPlan → completeExecution) that MINTS the
// Step-14 VERIFY evidence Gate 3 reads. Sync commits plan state; it never renames a
// plan into review.

// Get sync configuration (with defaults)
function getSyncConfig(projectPath = process.cwd()) {
  const config = { ...DEFAULT_SYNC_CONFIG };

  // Override with user settings
  const syncSettings = getSetting('sync', 'enabled', projectPath);
  if (syncSettings !== undefined) config.enabled = syncSettings;

  const checkInterval = getSetting('sync', 'check_interval', projectPath);
  if (checkInterval !== undefined) config.check_interval = checkInterval;

  const autoCommit = getSetting('sync', 'auto_commit', projectPath);
  if (autoCommit !== undefined) config.auto_commit = autoCommit;

  // SHIP GATE (R3-C): auto_push is NOT a sync-local setting. It comes from the ONE
  // canonical key `git.autoPushEnabled` (default false). This used to read the
  // sync-category auto_push key while init wrote a push-category one — two different
  // keys, so the visible off-switch was a PLACEBO and the machine pushed regardless.
  config.auto_push = isAutoPushEnabled(projectPath);

  const autoPull = getSetting('sync', 'auto_pull', projectPath);
  if (autoPull !== undefined) config.auto_pull = autoPull;

  const branch = getSetting('sync', 'branch', projectPath);
  if (branch !== undefined) config.branch = branch;

  return config;
}

// Get path to last-sync timestamp file
function getLastSyncPath(projectPath = process.cwd()) {
  return path.join(projectPath, '.ctoc', 'last-sync');
}

// Get last sync timestamp from file
function getLastSyncTimestamp(projectPath = process.cwd()) {
  const lastSyncPath = getLastSyncPath(projectPath);
  try {
    if (safeFs.existsSync(lastSyncPath)) {
      const content = safeFs.readFileSync(lastSyncPath, 'utf8').trim();
      return parseInt(content, 10);
    }
  } catch (e) {
    // Ignore read errors
  }
  return null;
}

// Save last sync timestamp to file
function saveLastSyncTimestamp(projectPath = process.cwd()) {
  const lastSyncPath = getLastSyncPath(projectPath);
  const ctocDir = path.dirname(lastSyncPath);

  try {
    if (!safeFs.existsSync(ctocDir)) {
      safeFs.mkdirSync(ctocDir, { recursive: true });
    }
    safeFs.writeFileSync(lastSyncPath, Date.now().toString());
  } catch (e) {
    // Ignore write errors
  }
}

// Check if rate-limited (within cooldown period)
function isRateLimited(projectPath = process.cwd()) {
  const config = getSyncConfig(projectPath);
  const lastTimestamp = getLastSyncTimestamp(projectPath);

  if (!lastTimestamp) {
    return false; // No previous sync, not rate-limited
  }

  const elapsed = (Date.now() - lastTimestamp) / 1000; // Convert to seconds
  return elapsed < config.check_interval;
}

// Check for remote changes
function checkRemoteChanges(projectPath = process.cwd()) {
  const config = getSyncConfig(projectPath);

  try {
    // Fetch from remote
    git(['fetch', 'origin', config.branch], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    // Check for remote commits not in local
    const remoteDiff = git(['log', `HEAD..origin/${config.branch}`, '--oneline', 'plans/'], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    const hasRemoteChanges = remoteDiff.length > 0;
    const remoteCommits = hasRemoteChanges ? remoteDiff.split('\n').filter(Boolean) : [];

    return {
      offline: false,
      hasRemoteChanges,
      remoteCommits,
      count: remoteCommits.length
    };
  } catch (error) {
    // Network error - offline mode
    return {
      offline: true,
      hasRemoteChanges: false,
      error: error.message
    };
  }
}

// Detect conflicts (files changed both locally and remotely)
function detectConflicts(projectPath = process.cwd()) {
  const config = getSyncConfig(projectPath);

  try {
    // Get locally modified files
    const localChanges = git(['status', '--porcelain', 'plans/'], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    const localFiles = localChanges
      .split('\n')
      .filter(Boolean)
      .map(line => line.slice(3).trim());

    if (localFiles.length === 0) {
      return [];
    }

    // Get remotely modified files
    const remoteChanges = git(['diff', '--name-only', `HEAD..origin/${config.branch}`, '--', 'plans/'], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    const remoteFiles = remoteChanges.split('\n').filter(Boolean);

    // Find intersection (conflicts)
    const conflicts = localFiles.filter(f => remoteFiles.includes(f));

    return conflicts;
  } catch (error) {
    return [];
  }
}

// Auto-commit a plan change
function autoCommitPlan(action, planName, projectPath = process.cwd(), opts = {}) {
  const config = getSyncConfig(projectPath);

  if (!config.auto_commit) {
    return { committed: false, reason: 'auto-commit disabled' };
  }

  try {
    // Check if there are changes to commit
    const status = git(['status', '--porcelain', 'plans/'], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (!status) {
      return { committed: false, reason: 'no changes' };
    }

    // Stage changes
    git(['add', 'plans/'], { cwd: projectPath, stdio: 'pipe' });

    // Create commit message based on action. The message may contain arbitrary
    // plan-controlled text (plan name, stage names); it is passed as an argv element
    // to execFileSync (no shell), so shell metacharacters in it are inert.
    const messageFunc = COMMIT_MESSAGES[action] || COMMIT_MESSAGES.edit;
    const message = messageFunc(planName, opts);

    git(['commit', '-m', message], { cwd: projectPath, stdio: 'pipe' });

    return { committed: true, message };
  } catch (error) {
    return { committed: false, error: error.message };
  }
}

// Auto-push to remote. SHIP GATE (R3-C): `config.auto_push` is `git.autoPushEnabled`
// and is FALSE unless the human opted in, so this is a no-op by default.
function autoPush(projectPath = process.cwd()) {
  const config = getSyncConfig(projectPath);

  if (!config.auto_push) {
    return { pushed: false, reason: 'auto-push disabled (ship gate) — push with /ctoc:push' };
  }

  try {
    git(['push', 'origin', config.branch], {
      cwd: projectPath,
      stdio: 'pipe'
    });

    return { pushed: true };
  } catch (error) {
    return { pushed: false, error: error.message };
  }
}

// Main event handler: called on any plan operation
function onPlanOperation(action, planName, projectPath = process.cwd(), opts = {}) {
  const config = getSyncConfig(projectPath);

  if (!config.enabled) {
    return { checked: false, reason: 'sync disabled' };
  }

  // Check rate limiting
  if (isRateLimited(projectPath)) {
    // Still auto-commit, just skip remote check
    const commitResult = autoCommitPlan(action, planName, projectPath, opts);

    return {
      checked: false,
      reason: 'rate-limited',
      committed: commitResult.committed,
      commitMessage: commitResult.message
    };
  }

  // Update timestamp
  saveLastSyncTimestamp(projectPath);

  // Check for remote changes
  const remoteResult = checkRemoteChanges(projectPath);

  // Auto-commit local changes
  const commitResult = autoCommitPlan(action, planName, projectPath, opts);

  // If online and committed, push
  let pushResult = { pushed: false };
  if (!remoteResult.offline && commitResult.committed) {
    pushResult = autoPush(projectPath);
  }

  return {
    checked: true,
    action,
    planName,
    offline: remoteResult.offline,
    hasRemoteChanges: remoteResult.hasRemoteChanges,
    remoteCount: remoteResult.count || 0,
    committed: commitResult.committed,
    commitMessage: commitResult.message,
    pushed: pushResult.pushed,
    conflicts: remoteResult.hasRemoteChanges ? detectConflicts(projectPath) : []
  };
}

/**
 * Full plans sync: pull, commit, push
 * Used by the "Sync plans" dashboard command.
 *
 * Steps:
 * 1. git pull --rebase origin {current-branch}
 * 2. git add plans/
 * 3. git commit -m "plans: sync pipeline state" (if changes)
 * 4. git push origin {current-branch} — ONLY when the human opened the ship gate
 *    (`git.autoPushEnabled`). With the gate closed (the default) this function
 *    pulls and commits, and reports `pushed: false` with the reason. Shipping is
 *    the human's act: /ctoc:push.
 *
 * @param {string} projectPath - Project root
 * @returns {Object} Sync result with details
 */
function fullPlansSync(projectPath = process.cwd()) {
  const config = getSyncConfig(projectPath);
  const result = {
    pulled: false,
    committed: false,
    pushed: false,
    errors: []
  };

  // 1. Pull with rebase
  try {
    const branch = getCurrentBranch(projectPath) || config.branch;
    git(['pull', '--rebase', 'origin', branch], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    result.pulled = true;
  } catch (e) {
    // May fail if no upstream
    result.errors.push(`Pull: ${e.message}`);
  }

  // 2-3. Stage and commit plans/
  try {
    const status = git(['status', '--porcelain', 'plans/'], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (status) {
      git(['add', 'plans/'], { cwd: projectPath, stdio: 'pipe' });
      git(['commit', '-m', 'plans: sync pipeline state'], {
        cwd: projectPath,
        stdio: 'pipe'
      });
      result.committed = true;
    }
  } catch (e) {
    result.errors.push(`Commit: ${e.message}`);
  }

  // 4. Push — SHIP GATE (R3-C).
  if (!config.auto_push) {
    result.pushed = false;
    result.pushSkipped = 'auto-push disabled (ship gate) — push with /ctoc:push';
    return result;
  }

  try {
    const branch = getCurrentBranch(projectPath) || config.branch;
    git(['push', 'origin', branch], {
      cwd: projectPath,
      stdio: 'pipe'
    });
    result.pushed = true;
  } catch (e) {
    result.errors.push(`Push: ${e.message}`);
  }

  return result;
}

/**
 * Get current git branch name
 * @param {string} projectPath
 * @returns {string|null}
 */
function getCurrentBranch(projectPath = process.cwd()) {
  try {
    return git(['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Silent background pull (for dashboard load)
 * @param {string} projectPath
 * @returns {boolean} Whether pull succeeded
 */
function silentPull(projectPath = process.cwd()) {
  try {
    const branch = getCurrentBranch(projectPath) || 'main';
    git(['pull', '--rebase', 'origin', branch], {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  startAutoSync,
  stopAutoSync,
  syncPlans,
  getLastSync,
  manualSync,
  // New event-triggered sync exports
  getSyncConfig,
  getLastSyncTimestamp,
  isRateLimited,
  checkRemoteChanges,
  detectConflicts,
  autoCommitPlan,
  autoPush,
  onPlanOperation,
  // Plans sync exports
  fullPlansSync,
  getCurrentBranch,
  silentPull
};

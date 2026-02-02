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

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getSetting } = require('./settings');

let syncInterval = null;
let lastSync = null;

// Default sync configuration
const DEFAULT_SYNC_CONFIG = {
  enabled: true,
  check_interval: 60,      // Minimum seconds between remote checks
  auto_commit: true,       // Auto-commit plan changes
  auto_push: true,         // Push after commit
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
    const plansDir = path.join(projectPath, 'plans');

    // Check for changes in plans directory
    const status = execSync('git status --porcelain plans/', {
      cwd: projectPath,
      encoding: 'utf8'
    }).trim();

    if (!status) {
      lastSync = new Date();
      return { synced: false, reason: 'no changes' };
    }

    // Add, commit, push
    execSync('git add plans/', { cwd: projectPath });

    const commitMsg = `chore: auto-sync plans [${new Date().toISOString()}]`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: projectPath });

    // Pull first to avoid conflicts
    try {
      execSync('git pull --rebase origin main', { cwd: projectPath, stdio: 'pipe' });
    } catch (e) {
      // May fail if no upstream, continue anyway
    }

    // Push
    execSync('git push origin main', { cwd: projectPath, stdio: 'pipe' });

    lastSync = new Date();
    return { synced: true, timestamp: lastSync };

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

// Move plan to review after push (called by agent completion)
function moveToReviewAfterPush(planPath, projectPath = process.cwd()) {
  const autoMove = getSetting('workflow', 'autoMoveToReview', projectPath);

  if (!autoMove) {
    return { moved: false, reason: 'auto-move disabled' };
  }

  const fs = require('fs');
  const plansDir = path.join(projectPath, 'plans');
  const reviewDir = path.join(plansDir, 'review');

  if (!fs.existsSync(reviewDir)) {
    fs.mkdirSync(reviewDir, { recursive: true });
  }

  const fileName = path.basename(planPath);
  const newPath = path.join(reviewDir, fileName);

  fs.renameSync(planPath, newPath);

  return { moved: true, newPath };
}

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

  const autoPush = getSetting('sync', 'auto_push', projectPath);
  if (autoPush !== undefined) config.auto_push = autoPush;

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
    if (fs.existsSync(lastSyncPath)) {
      const content = fs.readFileSync(lastSyncPath, 'utf8').trim();
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
    if (!fs.existsSync(ctocDir)) {
      fs.mkdirSync(ctocDir, { recursive: true });
    }
    fs.writeFileSync(lastSyncPath, Date.now().toString());
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
    execSync(`git fetch origin ${config.branch}`, {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    // Check for remote commits not in local
    const remoteDiff = execSync(`git log HEAD..origin/${config.branch} --oneline plans/`, {
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
    const localChanges = execSync('git status --porcelain plans/', {
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
    const remoteChanges = execSync(`git diff --name-only HEAD..origin/${config.branch} -- plans/`, {
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
    const status = execSync('git status --porcelain plans/', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (!status) {
      return { committed: false, reason: 'no changes' };
    }

    // Stage changes
    execSync('git add plans/', { cwd: projectPath, stdio: 'pipe' });

    // Create commit message based on action
    const messageFunc = COMMIT_MESSAGES[action] || COMMIT_MESSAGES.edit;
    const message = messageFunc(planName, opts);

    execSync(`git commit -m "${message}"`, { cwd: projectPath, stdio: 'pipe' });

    return { committed: true, message };
  } catch (error) {
    return { committed: false, error: error.message };
  }
}

// Auto-push to remote
function autoPush(projectPath = process.cwd()) {
  const config = getSyncConfig(projectPath);

  if (!config.auto_push) {
    return { pushed: false, reason: 'auto-push disabled' };
  }

  try {
    execSync(`git push origin ${config.branch}`, {
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

module.exports = {
  startAutoSync,
  stopAutoSync,
  syncPlans,
  getLastSync,
  manualSync,
  moveToReviewAfterPush,
  // New event-triggered sync exports
  getSyncConfig,
  getLastSyncTimestamp,
  isRateLimited,
  checkRemoteChanges,
  detectConflicts,
  autoCommitPlan,
  autoPush,
  onPlanOperation
};

/**
 * Sync Manager
 * Auto-sync plans to git at configured intervals
 */

const { execSync } = require('child_process');
const path = require('path');
const { getSetting } = require('./settings');

let syncInterval = null;
let lastSync = null;

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

module.exports = {
  startAutoSync,
  stopAutoSync,
  syncPlans,
  getLastSync,
  manualSync,
  moveToReviewAfterPush
};

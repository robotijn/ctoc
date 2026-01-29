#!/usr/bin/env node
/**
 * CTOC Admin Dashboard
 * Node.js replacement for admin.sh
 *
 * Usage: node scripts/admin.js
 *
 * Displays:
 * - Kanban board with counts
 * - Numbered items legend
 * - Commit queue status
 * - Git status summary
 * - Available actions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const terminalUI = require('./lib/terminal-ui');
const Kanban = require('./lib/kanban');
const commitQueue = require('./lib/commit-queue');

// ============================================================================
// Helpers
// ============================================================================

/**
 * Gets git status summary (modified, untracked counts)
 * Uses a simple cache to avoid repeated calls
 */
function getGitStatus(root) {
  const cacheDir = path.join(root, '.ctoc');
  const cachePath = path.join(cacheDir, '.admin-cache.json');
  const cacheMaxAge = 60 * 1000; // 60 seconds

  // Check cache
  try {
    if (fs.existsSync(cachePath)) {
      const stat = fs.statSync(cachePath);
      const age = Date.now() - stat.mtimeMs;
      if (age < cacheMaxAge) {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        return cached;
      }
    }
  } catch (e) {
    // Ignore cache errors
  }

  // Get fresh git status
  let modified = 0;
  let untracked = 0;
  let commits = [];

  try {
    const status = execSync('git status --short', { cwd: root, encoding: 'utf8' });
    const lines = status.split('\n').filter(l => l.trim());
    modified = lines.filter(l => l.match(/^ ?M/)).length;
    untracked = lines.filter(l => l.startsWith('??')).length;
  } catch (e) {
    // Not a git repo or git error
  }

  try {
    const log = execSync('git log --oneline -5 --format="%h %s"', { cwd: root, encoding: 'utf8' });
    commits = log.split('\n').filter(l => l.trim()).slice(0, 3);
  } catch (e) {
    // No commits or git error
  }

  const result = { modified, untracked, commits };

  // Save to cache
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(result));
  } catch (e) {
    // Ignore cache write errors
  }

  return result;
}

/**
 * Formats queue status line
 */
function formatQueueStatus(status) {
  const lockStatus = status.isLocked ? terminalUI.colors.yellow('LOCKED') : terminalUI.colors.gray('idle');
  return `${lockStatus} | pending: ${status.pending} | processing: ${status.processing}`;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  // Find CTOC root
  const scriptDir = __dirname;
  const root = path.dirname(scriptDir);
  process.chdir(root);

  // Get version
  let version = '?.?.?';
  try {
    version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  } catch (e) {}

  // Get kanban data
  const kanban = new Kanban(root);
  const data = kanban.getData();
  const c = data.columns;
  const total = c.backlog + c.functional + c.technical + c.ready + c.building + c.review + c.done;

  // Get queue status
  const queueStatus = commitQueue.getQueueStatus();

  // Get git status
  const gitStatus = getGitStatus(root);

  // Generate numbered items legend
  const items = Object.entries(data.numberedItems).slice(0, 15);
  const legend = items.map(([num, item]) => {
    const col = item.column.slice(0, 3).toUpperCase();
    const name = (item.displayName || item.name || '').slice(0, 25);
    return `  [${num}] ${col}: ${name}`;
  }).join('\n');

  // Build output
  const versionPadded = version.padEnd(7);

  console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551  CTOC ADMIN                                                       v${versionPadded}  \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551 BACKLOG \u2502FUNCTIONAL\u2502TECHNICAL \u2502  READY  \u2502BUILDING \u2502 REVIEW  \u2502     DONE       \u2551
\u2551 (draft) \u2502(steps1-3)\u2502(steps4-6)\u2502         \u2502 (7-14)  \u2502 [HUMAN] \u2502                \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551   (${String(c.backlog).padStart(2)})  \u2502   (${String(c.functional).padStart(2)})   \u2502   (${String(c.technical).padStart(2)})   \u2502  (${String(c.ready).padStart(2)})   \u2502  (${String(c.building).padStart(2)})   \u2502  (${String(c.review).padStart(2)})   \u2502     (${String(c.done).padStart(2)})       \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D

Legend (${total} items):
${legend || '  (no items)'}

Queue: ${formatQueueStatus(queueStatus)}
Git: ${gitStatus.modified} modified, ${gitStatus.untracked} untracked

Actions:
  [N] New feature    [R#] Review item #    [V#] View item #
  [C] Commit         [P] Push              [Q] Queue status`);
}

main();

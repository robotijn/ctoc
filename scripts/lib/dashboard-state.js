#!/usr/bin/env node
/**
 * CTOC Dashboard State Generator
 *
 * Generates a pre-computed state file that Claude can read directly
 * without making shell calls. Run this via hooks to keep state fresh.
 *
 * Usage: node scripts/lib/dashboard-state.js
 * Output: .ctoc/dashboard.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const STATE_FILE = path.join(ROOT, '.ctoc', 'dashboard.json');

function countFiles(dir, ext = '.md') {
  const fullPath = path.join(ROOT, dir);
  try {
    if (!fs.existsSync(fullPath)) return 0;
    return fs.readdirSync(fullPath).filter(f => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

function getVersion() {
  try {
    return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  } catch {
    return '?.?.?';
  }
}

function getGitStatus() {
  try {
    const status = execSync('git status --short', { cwd: ROOT, encoding: 'utf8' });
    const lines = status.trim().split('\n').filter(Boolean);
    return {
      modified: lines.filter(l => l.match(/^ ?M/)).length,
      untracked: lines.filter(l => l.startsWith('??')).length,
      deleted: lines.filter(l => l.match(/^ ?D/)).length,
      total: lines.length
    };
  } catch {
    return { modified: 0, untracked: 0, deleted: 0, total: 0 };
  }
}

function getRecentCommits(n = 5) {
  try {
    const log = execSync(`git log --oneline -${n} --format="%h|%s"`, { cwd: ROOT, encoding: 'utf8' });
    return log.trim().split('\n').filter(Boolean).map(line => {
      const [hash, ...msgParts] = line.split('|');
      return { hash, message: msgParts.join('|') };
    });
  } catch {
    return [];
  }
}

function getQueueStatus() {
  try {
    const queue = require('./commit-queue');
    return queue.getQueueStatus();
  } catch {
    return { pending: 0, processing: 0, isLocked: false, currentVersion: getVersion() };
  }
}

function generateState() {
  const commits = getRecentCommits(10);
  // Count feat/fix commits from last 2 days as "done"
  const doneFromCommits = commits.filter(c =>
    c.message.startsWith('feat:') || c.message.startsWith('fix:')
  ).length;

  // Also count files in plans/done if any
  const doneFromFiles = countFiles('plans/done');

  return {
    generated: new Date().toISOString(),
    version: getVersion(),
    kanban: {
      backlog: countFiles('plans/functional/draft'),
      functional: countFiles('plans/functional/approved'),
      technical: countFiles('plans/implementation/draft'),
      ready: countFiles('plans/implementation/approved'),
      building: countFiles('plans/in_progress'),
      review: countFiles('plans/review'),
      done: Math.max(doneFromCommits, doneFromFiles)
    },
    git: getGitStatus(),
    commits: commits.slice(0, 5),
    queue: getQueueStatus()
  };
}

// Generate and save
const state = generateState();
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

console.log(JSON.stringify(state, null, 2));

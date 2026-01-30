/**
 * State Management
 * Handles plan files, agent status, and navigation
 */

const fs = require('fs');
const path = require('path');

// Get plans directory
function getPlansDir(projectPath = process.cwd()) {
  return path.join(projectPath, 'plans');
}

// Read plans from a directory
function readPlans(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dirPath, f);
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const metadata = parseMetadata(content);

      return {
        name: f.replace('.md', ''),
        path: filePath,
        created: stat.birthtime,
        modified: stat.mtime,
        ago: timeAgo(stat.mtime),
        metadata,
        content
      };
    });

  // Sort oldest first (FIFO)
  files.sort((a, b) => a.created - b.created);

  return files;
}

// Parse plan metadata from YAML frontmatter
function parseMetadata(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const metadata = {};
  match[1].split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // Remove quotes
      value = value.replace(/^["']|["']$/g, '');
      // Parse booleans
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      // Parse numbers
      if (/^\d+$/.test(value)) value = parseInt(value, 10);
      metadata[key] = value;
    }
  });

  return metadata;
}

// Calculate time ago string
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Get counts for all plan types
function getPlanCounts(projectPath = process.cwd()) {
  const plansDir = getPlansDir(projectPath);

  return {
    functional: readPlans(path.join(plansDir, 'functional', 'draft')).length,
    implementation: readPlans(path.join(plansDir, 'implementation', 'draft')).length,
    review: readPlans(path.join(plansDir, 'review')).length,
    todo: readPlans(path.join(plansDir, 'todo')).length,
    inProgress: getInProgressCount(projectPath),
    done: readPlans(path.join(plansDir, 'done')).length
  };
}

// Get in-progress count from state
function getInProgressCount(projectPath = process.cwd()) {
  const stateFile = path.join(projectPath, '.ctoc', 'state', 'progress.json');
  if (!fs.existsSync(stateFile)) return 0;

  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return state.inProgress ? 1 : 0;
  } catch {
    return 0;
  }
}

// Get agent status
function getAgentStatus(projectPath = process.cwd()) {
  const stateFile = path.join(projectPath, '.ctoc', 'state', 'agent.json');
  if (!fs.existsSync(stateFile)) {
    return { active: false };
  }

  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.active && state.startedAt) {
      state.elapsed = timeAgo(new Date(state.startedAt)).replace(' ago', '');
    }
    return state;
  } catch {
    return { active: false };
  }
}

// Get finished items
function getFinishedItems(projectPath = process.cwd(), limit = 10) {
  const plansDir = getPlansDir(projectPath);
  const donePlans = readPlans(path.join(plansDir, 'done'));

  // Sort by modified date, newest first for display
  donePlans.sort((a, b) => b.modified - a.modified);

  return donePlans.slice(0, limit);
}

// Navigation stack
class NavStack {
  constructor() {
    this.stack = [];
  }

  push(screen, context = {}) {
    this.stack.push({ screen, context });
  }

  pop() {
    if (this.stack.length > 1) {
      return this.stack.pop();
    }
    return null;
  }

  current() {
    return this.stack[this.stack.length - 1] || null;
  }

  path() {
    return this.stack.map(s => s.screen);
  }

  clear() {
    this.stack = [];
  }
}

// Pick next task from queue (FIFO)
function pickNextFromQueue(projectPath = process.cwd()) {
  const plansDir = getPlansDir(projectPath);
  const queue = readPlans(path.join(plansDir, 'todo'));

  if (queue.length === 0) return null;

  // Always pick oldest (first in queue)
  return queue[0];
}

// Settings
function getSettings(projectPath = process.cwd()) {
  const settingsFile = path.join(projectPath, '.ctoc', 'settings.json');
  const defaults = {
    autoPick: true,
    maxParallelAgents: 1,
    showElapsed: true,
    finishedItemsToShow: 10
  };

  if (!fs.existsSync(settingsFile)) {
    return defaults;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    return { ...defaults, ...settings };
  } catch {
    return defaults;
  }
}

function saveSettings(settings, projectPath = process.cwd()) {
  const settingsDir = path.join(projectPath, '.ctoc');
  const settingsFile = path.join(settingsDir, 'settings.json');

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

module.exports = {
  getPlansDir,
  readPlans,
  parseMetadata,
  timeAgo,
  getPlanCounts,
  getAgentStatus,
  getFinishedItems,
  NavStack,
  pickNextFromQueue,
  getSettings,
  saveSettings
};

/**
 * State Management
 * Handles plan files, agent status, and navigation
 */

const fs = require('fs');
const path = require('path');
const { readStatus, getStatusIcon } = require('./background');
const { findProjectRoot } = require('./project-root');
const { memoize } = require('./cache');

// Get plans directory (always from project root)
function getPlansDir(projectPath) {
  const root = projectPath || findProjectRoot();
  return path.join(root, 'plans');
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

      // Read background processing status
      const bgStatus = readStatus(filePath);

      return {
        name: f.replace('.md', ''),
        path: filePath,
        created: stat.birthtime,
        modified: stat.mtime,
        ago: timeAgo(stat.mtime),
        metadata,
        content,
        // Background processing status
        bgStatus: bgStatus.status,
        bgAgent: bgStatus.agent || null,
        bgMessage: bgStatus.message || null,
        bgIcon: getStatusIcon(bgStatus.status)
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

// Get counts for all plan types (flat folder structure)
const getPlanCounts = memoize(function getPlanCountsImpl(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);

  return {
    canvas: readPlans(path.join(plansDir, 'canvas')).length,
    functional: readPlans(path.join(plansDir, 'functional')).length,
    implementation: readPlans(path.join(plansDir, 'implementation')).length,
    review: readPlans(path.join(plansDir, 'review')).length,
    todo: readPlans(path.join(plansDir, 'todo')).length,
    inProgress: readPlans(path.join(plansDir, 'in-progress')).length,
    done: readPlans(path.join(plansDir, 'done')).length
  };
}, 'getPlanCounts');

// Get in-progress count from state
function getInProgressCount(projectPath) {
  const root = projectPath || findProjectRoot();
  const stateFile = path.join(root, '.ctoc', 'state', 'progress.json');
  if (!fs.existsSync(stateFile)) return 0;

  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return state.inProgress ? 1 : 0;
  } catch {
    return 0;
  }
}

// Get agent status (lock-file aware)
// The lock file is authoritative for liveness; agent.json is supplementary detail.
function getAgentStatus(projectPath) {
  const root = projectPath || findProjectRoot();
  const { readLock, isPidAlive } = require('./agent-lock');

  // 1. Check lock file for ground-truth liveness
  const lock = readLock(root);

  if (lock) {
    if (isPidAlive(lock.pid)) {
      // Agent is alive — read agent.json for supplementary info
      const stateFile = path.join(root, '.ctoc', 'state', 'agent.json');
      let step = null, phase = null, task = null;
      try {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        step = state.step || null;
        phase = state.phase || null;
        task = state.task || null;
      } catch { /* ignore */ }

      return {
        active: true,
        plan: lock.plan,
        pid: lock.pid,
        agentId: lock.agentId,
        startedAt: lock.startedAt,
        elapsed: timeAgo(new Date(lock.startedAt)).replace(' ago', ''),
        step,
        phase,
        task
      };
    }

    // PID is dead — stale lock
    return {
      active: false,
      stale: true,
      stalePlan: lock.plan
    };
  }

  // No lock file — check in-progress plans for overload statuses
  const plansDir = getPlansDir(root);
  const inProgressDir = path.join(plansDir, 'in-progress');
  if (fs.existsSync(inProgressDir)) {
    const mdFiles = fs.readdirSync(inProgressDir).filter(f => f.endsWith('.md'));
    for (const f of mdFiles) {
      const planPath = path.join(inProgressDir, f);
      const status = readStatus(planPath);
      if (status.status === 'overload-retry') {
        return {
          active: false,
          overloadRetry: true,
          plan: f.replace('.md', ''),
          retryAt: status.retry_at || null
        };
      }
      if (status.status === 'overload-partial') {
        return {
          active: false,
          overloadPartial: true,
          plan: f.replace('.md', '')
        };
      }
    }
  }

  return { active: false };
}

/**
 * Set agent status (active/working on plan)
 *
 * @param {string} projectPath - Project root path
 * @param {Object} status - Agent status object
 * @param {boolean} status.active - Whether agent is active
 * @param {string} status.plan - Plan name being worked on
 * @param {number} status.step - Current Iron Loop step (7-15)
 * @param {string} status.phase - Current phase name
 * @param {string} status.task - Current task description
 */
function setAgentStatus(projectPath, status) {
  const stateDir = path.join(projectPath, '.ctoc', 'state');
  const stateFile = path.join(stateDir, 'agent.json');

  // Ensure state directory exists
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  const agentStatus = {
    active: status.active !== false,
    plan: status.plan || null,
    step: status.step || null,
    phase: status.phase || null,
    task: status.task || null,
    startedAt: status.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(stateFile, JSON.stringify(agentStatus, null, 2));
  return agentStatus;
}

/**
 * Clear agent status (mark as idle)
 *
 * @param {string} projectPath - Project root path
 */
function clearAgentStatus(projectPath) {
  const stateDir = path.join(projectPath, '.ctoc', 'state');
  const stateFile = path.join(stateDir, 'agent.json');

  // Ensure state directory exists
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  const agentStatus = {
    active: false,
    plan: null,
    step: null,
    phase: null,
    task: null,
    completedAt: new Date().toISOString()
  };

  fs.writeFileSync(stateFile, JSON.stringify(agentStatus, null, 2));
  return agentStatus;
}

/**
 * Get next plan from todo queue (FIFO - oldest first)
 *
 * @param {string} projectPath - Project root path
 * @returns {Object|null} Next plan or null if queue empty
 */
function getNextFromTodo(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const todoDir = path.join(plansDir, 'todo');

  if (!fs.existsSync(todoDir)) {
    return null;
  }

  const plans = readPlans(todoDir);

  if (plans.length === 0) {
    return null;
  }

  // Already sorted oldest first (FIFO) by readPlans
  return plans[0];
}

// Get finished items
function getFinishedItems(projectPath, limit = 10) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
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
function pickNextFromQueue(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const queue = readPlans(path.join(plansDir, 'todo'));

  if (queue.length === 0) return null;

  // Always pick oldest (first in queue)
  return queue[0];
}

// Settings
function getSettings(projectPath) {
  const root = projectPath || findProjectRoot();
  const settingsFile = path.join(root, '.ctoc', 'settings.json');
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

function saveSettings(settings, projectPath) {
  const root = projectPath || findProjectRoot();
  const settingsDir = path.join(root, '.ctoc');
  const settingsFile = path.join(settingsDir, 'settings.json');

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

// Get vision counts for dashboard (memoized)
const getVisionCounts = memoize(function getVisionCountsImpl(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const visionDir = path.join(plansDir, 'vision');

  if (!fs.existsSync(visionDir)) {
    return { total: 0, exploring: 0, ready: 0, converted: 0 };
  }

  const files = fs.readdirSync(visionDir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep');

  let exploring = 0;
  let ready = 0;
  let converted = 0;
  let decomposing = 0;

  files.forEach(f => {
    const content = fs.readFileSync(path.join(visionDir, f), 'utf8');
    const statusMatch = content.match(/^- Status: (\w+)$/m);
    const status = statusMatch ? statusMatch[1] : 'exploring';

    if (status === 'exploring') exploring++;
    else if (status === 'ready') ready++;
    else if (status === 'converted') converted++;
    else if (status === 'decomposing') decomposing++;
  });

  return {
    total: files.length,
    exploring,
    ready,
    converted,
    decomposing
  };
}, 'getVisionCounts');

/**
 * Get vision stubs for a given vision slug.
 * Scans plans/functional/ for plans where metadata.parent_vision contains visionSlug.
 *
 * @param {string} visionSlug - Slug of the parent vision
 * @param {string} [projectPath] - Project root path
 * @returns {Array<{ name: string, path: string, scope: string, dependsOn: string, bgStatus: string }>}
 */
function getVisionStubs(visionSlug, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const functionalDir = path.join(plansDir, 'functional');

  const plans = readPlans(functionalDir);

  // Filter by parent_vision matching the vision slug
  const stubs = plans.filter(plan => {
    const parentVision = plan.metadata.parent_vision || '';
    return parentVision.includes(visionSlug);
  });

  return stubs.map(stub => {
    // Extract scope from first line of Problem Statement
    const scopeMatch = stub.content.match(/## Problem Statement\n(.+)/);
    const scope = scopeMatch ? scopeMatch[1].trim() : '';

    return {
      name: stub.name,
      path: stub.path,
      scope,
      dependsOn: stub.metadata.depends_on || 'none',
      bgStatus: stub.bgStatus || 'none'
    };
  });
}

module.exports = {
  getPlansDir,
  readPlans,
  parseMetadata,
  timeAgo,
  getPlanCounts,
  getVisionCounts,
  getVisionStubs,
  getAgentStatus,
  setAgentStatus,
  clearAgentStatus,
  getNextFromTodo,
  getFinishedItems,
  NavStack,
  pickNextFromQueue,
  getSettings,
  saveSettings
};

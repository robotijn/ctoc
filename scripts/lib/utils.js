/**
 * CTOC Utility Library
 * Shared functions for hooks, agents, and scripts
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ============================================================================
// Constants
// ============================================================================

const CTOC_HOME = path.join(os.homedir(), '.ctoc');
const SESSIONS_DIR = path.join(CTOC_HOME, 'sessions');
const IRON_LOOP_DIR = path.join(CTOC_HOME, 'iron-loop');
const LEARNED_SKILLS_DIR = path.join(CTOC_HOME, 'skills', 'learned');
const CONFIG_FILE = path.join(CTOC_HOME, 'config.json');

const STEP_NAMES = {
  1: 'ASSESS',
  2: 'ALIGN',
  3: 'CAPTURE',
  4: 'PLAN',
  5: 'DESIGN',
  6: 'SPEC',
  7: 'TEST',
  8: 'QUALITY',
  9: 'IMPLEMENT',
  10: 'REVIEW',
  11: 'OPTIMIZE',
  12: 'SECURE',
  13: 'DOCUMENT',
  14: 'VERIFY',
  15: 'COMMIT'
};

const STEP_DESCRIPTIONS = {
  1: 'Assess the problem and context',
  2: 'Align with user goals and business objectives',
  3: 'Capture requirements and success criteria',
  4: 'Plan the technical approach',
  5: 'Design the architecture',
  6: 'Write detailed specifications',
  7: 'Write failing tests (TDD Red)',
  8: 'Run quality checks (lint, format, type-check)',
  9: 'Implement to make tests pass (TDD Green)',
  10: 'Code review against CTO profile',
  11: 'Optimize for performance',
  12: 'Security audit',
  13: 'Update documentation',
  14: 'Run full test suite',
  15: 'Commit with verification'
};

// ============================================================================
// Directory Management
// ============================================================================

/**
 * Ensures all CTOC directories exist
 */
function ensureDirectories() {
  const dirs = [CTOC_HOME, SESSIONS_DIR, IRON_LOOP_DIR, LEARNED_SKILLS_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Gets the CTOC root directory (where ctoc is installed in the project)
 */
function getCTOCRoot() {
  // Check environment variable first
  if (process.env.CTOC_ROOT) {
    return process.env.CTOC_ROOT;
  }

  // Walk up from cwd looking for .ctoc directory
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    const ctocDir = path.join(current, '.ctoc');
    if (fs.existsSync(ctocDir) && fs.existsSync(path.join(ctocDir, 'skills'))) {
      return current;
    }
    current = path.dirname(current);
  }

  return null;
}

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Creates a hash of a path for use as a unique identifier
 */
function hashPath(projectPath) {
  return crypto
    .createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Creates a hash of file contents
 */
function hashContent(content) {
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 16);
}

// ============================================================================
// Date/Time Utilities
// ============================================================================

/**
 * Gets today's date in YYYY-MM-DD format
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Gets current ISO timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Gets the current session file path
 */
function getSessionFilePath() {
  ensureDirectories();
  return path.join(SESSIONS_DIR, `${getToday()}-session.tmp`);
}

// ============================================================================
// Iron Loop State Management
// ============================================================================

/**
 * Gets the Iron Loop state file path for a project
 */
function getIronLoopStatePath(projectPath) {
  ensureDirectories();
  const hash = hashPath(projectPath || process.cwd());
  return path.join(IRON_LOOP_DIR, `${hash}.json`);
}

/**
 * Loads Iron Loop state for a project
 */
function loadIronLoopState(projectPath) {
  const statePath = getIronLoopStatePath(projectPath);
  if (fs.existsSync(statePath)) {
    try {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (e) {
      console.error(`[CTOC] Error loading Iron Loop state: ${e.message}`);
      return null;
    }
  }
  return null;
}

/**
 * Saves Iron Loop state for a project
 */
function saveIronLoopState(projectPath, state) {
  ensureDirectories();
  const statePath = getIronLoopStatePath(projectPath);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Creates a new Iron Loop state
 */
function createIronLoopState(projectPath, feature, language, framework) {
  return {
    project: projectPath || process.cwd(),
    feature: feature || null, // null means no feature being tracked yet
    started: getTimestamp(),
    lastUpdated: getTimestamp(),
    currentStep: 1,
    language: language || 'unknown',
    framework: framework || null,
    steps: {},
    artifacts: {
      tests: [],
      implementation: [],
      documentation: []
    },
    blockers: []
  };
}

/**
 * Updates Iron Loop step status
 */
function updateIronLoopStep(projectPath, stepNumber, status, summary, agent) {
  const state = loadIronLoopState(projectPath) || createIronLoopState(projectPath);

  state.steps[stepNumber] = {
    status: status,
    timestamp: getTimestamp(),
    summary: summary || '',
    agent: agent || null
  };

  if (status === 'completed' && stepNumber >= state.currentStep) {
    state.currentStep = stepNumber + 1;
  } else if (status === 'in_progress') {
    state.currentStep = stepNumber;
  }

  state.lastUpdated = getTimestamp();
  saveIronLoopState(projectPath, state);
  return state;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Loads or creates today's session
 */
function loadSession() {
  const sessionPath = getSessionFilePath();
  if (fs.existsSync(sessionPath)) {
    try {
      return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    } catch (e) {
      // File might be corrupted, start fresh
      return createSession();
    }
  }
  return createSession();
}

/**
 * Creates a new session
 */
function createSession() {
  return {
    date: getToday(),
    started: getTimestamp(),
    lastUpdated: getTimestamp(),
    projects: {},
    events: []
  };
}

/**
 * Saves session
 */
function saveSession(session) {
  ensureDirectories();
  const sessionPath = getSessionFilePath();
  session.lastUpdated = getTimestamp();
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
}

/**
 * Logs an event to the session
 */
function logSessionEvent(eventType, data) {
  const session = loadSession();
  session.events.push({
    timestamp: getTimestamp(),
    type: eventType,
    data: data
  });
  saveSession(session);
}

// ============================================================================
// Config Management
// ============================================================================

/**
 * Loads global CTOC config
 */
function loadConfig() {
  ensureDirectories();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      return getDefaultConfig();
    }
  }
  return getDefaultConfig();
}

/**
 * Gets default config
 */
function getDefaultConfig() {
  return {
    version: '1.0.0',
    mutation_testing: {
      mode: 'blocking',
      threshold: 80,
      timeout: 300
    },
    parallel_agents: {
      max_concurrent: 4
    },
    token_budget: {
      total_per_step: 50000,
      reserved_for_coordinator: 5000
    }
  };
}

/**
 * Saves global CTOC config
 */
function saveConfig(config) {
  ensureDirectories();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ============================================================================
// Output Utilities
// ============================================================================

/**
 * Logs a CTOC message to stdout
 */
function log(message) {
  console.log(`[CTOC] ${message}`);
}

/**
 * Logs a warning
 */
function warn(message) {
  console.warn(`[CTOC WARNING] ${message}`);
}

/**
 * Logs an error
 */
function error(message) {
  console.error(`[CTOC ERROR] ${message}`);
}

/**
 * Formats a YAML-like report
 */
function formatReport(data, indent = 0) {
  const prefix = '  '.repeat(indent);
  let output = '';

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      output += `${prefix}${key}:\n${formatReport(value, indent + 1)}`;
    } else {
      output += `${prefix}${key}: ${value}\n`;
    }
  }

  return output;
}

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Safely reads a file, returns null if not found
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

/**
 * Checks if a path is a directory
 */
function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch (e) {
    return false;
  }
}

/**
 * Gets file extension
 */
function getExtension(filePath) {
  return path.extname(filePath).toLowerCase().replace('.', '');
}

// ============================================================================
// Language Detection Utilities
// ============================================================================

/**
 * Maps file extensions to languages
 */
const EXTENSION_MAP = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
  fs: 'fsharp',
  cpp: 'cpp',
  cc: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  scala: 'scala',
  clj: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  lua: 'lua',
  r: 'r',
  jl: 'julia',
  dart: 'dart',
  zig: 'zig',
  nim: 'nim',
  v: 'v',
  sol: 'solidity',
  tf: 'terraform',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  psm1: 'powershell'
};

/**
 * Gets language from file path
 */
function getLanguageFromPath(filePath) {
  const ext = getExtension(filePath);
  return EXTENSION_MAP[ext] || null;
}

// ============================================================================
// Plan Artifact Management
// ============================================================================

/**
 * Plan types for the two planning gates
 */
const PLAN_TYPES = {
  FUNCTIONAL: 'functional',
  IMPLEMENTATION: 'implementation'
};

/**
 * Plan statuses for artifact lifecycle
 */
const PLAN_STATUSES = {
  DRAFT: 'draft',
  APPROVED: 'approved'
};

/**
 * Gets the path to a plan directory
 * @param {string} type - 'functional' or 'implementation'
 * @param {string} status - 'draft' or 'approved'
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {string} Absolute path to the plan directory
 */
function getPlanPath(type, status, projectPath = process.cwd()) {
  if (!Object.values(PLAN_TYPES).includes(type)) {
    throw new Error(`Invalid plan type: ${type}. Must be 'functional' or 'implementation'.`);
  }
  if (!Object.values(PLAN_STATUSES).includes(status)) {
    throw new Error(`Invalid plan status: ${status}. Must be 'draft' or 'approved'.`);
  }
  return path.join(projectPath, 'plans', type, status);
}

/**
 * Checks if an approved plan exists for the given type
 * @param {string} type - 'functional' or 'implementation'
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {Object|null} Plan info {name, path} if exists, null otherwise
 */
function hasApprovedPlan(type, projectPath = process.cwd()) {
  const approvedDir = getPlanPath(type, PLAN_STATUSES.APPROVED, projectPath);

  if (!fs.existsSync(approvedDir)) {
    return null;
  }

  try {
    const files = fs.readdirSync(approvedDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      return null;
    }

    // Return the most recently modified plan
    const plans = mdFiles.map(file => {
      const filePath = path.join(approvedDir, file);
      const stat = fs.statSync(filePath);
      return {
        name: file.replace('.md', ''),
        path: filePath,
        modified: stat.mtime
      };
    });

    plans.sort((a, b) => b.modified - a.modified);
    return plans[0];
  } catch (e) {
    return null;
  }
}

/**
 * Checks if a draft plan exists for the given type
 * @param {string} type - 'functional' or 'implementation'
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {Object|null} Plan info {name, path} if exists, null otherwise
 */
function hasDraftPlan(type, projectPath = process.cwd()) {
  const draftDir = getPlanPath(type, PLAN_STATUSES.DRAFT, projectPath);

  if (!fs.existsSync(draftDir)) {
    return null;
  }

  try {
    const files = fs.readdirSync(draftDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      return null;
    }

    // Return the most recently modified plan
    const plans = mdFiles.map(file => {
      const filePath = path.join(draftDir, file);
      const stat = fs.statSync(filePath);
      return {
        name: file.replace('.md', ''),
        path: filePath,
        modified: stat.mtime
      };
    });

    plans.sort((a, b) => b.modified - a.modified);
    return plans[0];
  } catch (e) {
    return null;
  }
}

/**
 * Moves a plan from draft to approved status
 * @param {string} type - 'functional' or 'implementation'
 * @param {string} planName - Name of the plan (without .md extension)
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {Object} Result {success, from, to, error?}
 */
function movePlanToApproved(type, planName, projectPath = process.cwd()) {
  const draftDir = getPlanPath(type, PLAN_STATUSES.DRAFT, projectPath);
  const approvedDir = getPlanPath(type, PLAN_STATUSES.APPROVED, projectPath);

  const fileName = planName.endsWith('.md') ? planName : `${planName}.md`;
  const fromPath = path.join(draftDir, fileName);
  const toPath = path.join(approvedDir, fileName);

  try {
    // Ensure approved directory exists
    if (!fs.existsSync(approvedDir)) {
      fs.mkdirSync(approvedDir, { recursive: true });
    }

    // Check draft exists
    if (!fs.existsSync(fromPath)) {
      return {
        success: false,
        error: `Draft plan not found: ${fromPath}`
      };
    }

    // Move the file
    fs.renameSync(fromPath, toPath);

    return {
      success: true,
      from: fromPath,
      to: toPath
    };
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * Ensures plan directories exist for a project
 * @param {string} projectPath - Project root path (defaults to cwd)
 */
function ensurePlanDirectories(projectPath = process.cwd()) {
  const planDirs = [
    path.join(projectPath, 'plans', 'functional', 'draft'),
    path.join(projectPath, 'plans', 'functional', 'approved'),
    path.join(projectPath, 'plans', 'implementation', 'draft'),
    path.join(projectPath, 'plans', 'implementation', 'approved'),
    path.join(projectPath, 'plans', 'todo'),
    path.join(projectPath, 'plans', 'in_progress'),
    path.join(projectPath, 'plans', 'review'),
    path.join(projectPath, 'plans', 'done')
  ];

  for (const dir of planDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Lists all plans of a given type and status
 * @param {string} type - 'functional' or 'implementation'
 * @param {string} status - 'draft' or 'approved'
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {Array} List of plan objects {name, path, modified}
 */
function listPlans(type, status, projectPath = process.cwd()) {
  const planDir = getPlanPath(type, status, projectPath);

  if (!fs.existsSync(planDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(planDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(file => {
        const filePath = path.join(planDir, file);
        const stat = fs.statSync(filePath);
        return {
          name: file.replace('.md', ''),
          path: filePath,
          modified: stat.mtime
        };
      })
      .sort((a, b) => b.modified - a.modified);
  } catch (e) {
    return [];
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  CTOC_HOME,
  SESSIONS_DIR,
  IRON_LOOP_DIR,
  LEARNED_SKILLS_DIR,
  CONFIG_FILE,
  STEP_NAMES,
  STEP_DESCRIPTIONS,
  EXTENSION_MAP,

  // Directory Management
  ensureDirectories,
  getCTOCRoot,

  // Hash Utilities
  hashPath,
  hashContent,

  // Date/Time Utilities
  getToday,
  getTimestamp,
  getSessionFilePath,

  // Iron Loop State
  getIronLoopStatePath,
  loadIronLoopState,
  saveIronLoopState,
  createIronLoopState,
  updateIronLoopStep,

  // Session Management
  loadSession,
  createSession,
  saveSession,
  logSessionEvent,

  // Config Management
  loadConfig,
  getDefaultConfig,
  saveConfig,

  // Output Utilities
  log,
  warn,
  error,
  formatReport,

  // File Utilities
  readFileSafe,
  isDirectory,
  getExtension,
  getLanguageFromPath,

  // Plan Artifact Management
  PLAN_TYPES,
  PLAN_STATUSES,
  getPlanPath,
  hasApprovedPlan,
  hasDraftPlan,
  movePlanToApproved,
  ensurePlanDirectories,
  listPlans
};

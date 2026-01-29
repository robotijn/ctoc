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

/**
 * Default settings for display and implementation behavior
 */
const DEFAULT_SETTINGS = {
  display: {
    usage_link_frequency: 'daily',    // 'always', 'daily', 'never'
    step_bar_color: 'orange',         // any color name
    feature_bar_style: 'rainbow'      // 'rainbow' or single color
  },
  implementation: {
    mode: 'background',               // 'background', 'foreground'
    permission: 'check-in',           // 'per-plan', 'check-in', 'auto-continue'
    check_in_interval: 15             // minutes: 5,10,15,20,30,45,60,90,120,180
  }
};

/**
 * Valid check-in interval options (in minutes)
 */
const CHECK_IN_INTERVALS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

/**
 * Integrator-Critic Loop Settings
 */
const INTEGRATION_SETTINGS = {
  max_rounds: 10,
  quality_threshold: 5,
  auto_approve_after_max: true,
  defer_unresolved: true
};

/**
 * Critic Rubric Dimensions (all must score 5/5 to pass)
 */
const RUBRIC_DIMENSIONS = {
  COMPLETENESS: 'completeness',
  CLARITY: 'clarity',
  EDGE_CASES: 'edge_cases',
  EFFICIENCY: 'efficiency',
  SECURITY: 'security'
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
    blockers: [],
    // Crash recovery fields
    sessionStatus: 'active',
    lastActivity: getTimestamp()
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

/**
 * Updates the lastActivity timestamp in Iron Loop state
 * Called by on-stop hook to track activity
 * @param {string} projectPath - Project root path
 */
function updateLastActivity(projectPath) {
  const state = loadIronLoopState(projectPath);
  if (state) {
    state.lastActivity = getTimestamp();
    saveIronLoopState(projectPath, state);
  }
}

/**
 * Checks if a session was interrupted during implementation
 * Used for crash recovery detection
 * @param {Object} state - Iron Loop state
 * @returns {boolean} True if session was interrupted
 */
function isInterruptedSession(state) {
  if (!state) return false;
  if (state.sessionStatus !== 'active') return false;
  // Check currentStep is a valid number in implementation range (steps 7-15)
  if (typeof state.currentStep !== 'number' || state.currentStep < 7 || state.currentStep > 15) return false;

  const lastActivity = new Date(state.lastActivity);
  const hoursSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

  // Only detect if activity was within last 24 hours (prevents false positives from old abandoned sessions)
  return hoursSince < 24;
}

/**
 * Formats the time since last activity in human-readable form
 * @param {string} lastActivity - ISO timestamp
 * @returns {string} Human-readable time difference
 */
function formatTimeSince(lastActivity) {
  const lastTime = new Date(lastActivity);
  const hoursSince = (Date.now() - lastTime.getTime()) / (1000 * 60 * 60);

  if (hoursSince < 1) {
    const minutes = Math.round(hoursSince * 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else {
    const hours = Math.round(hoursSince);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
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
// Project Settings Management
// ============================================================================

/**
 * Gets the settings file path for a project
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {string} Path to settings.json file
 */
function getSettingsPath(projectPath = process.cwd()) {
  return path.join(projectPath, '.ctoc', 'settings.json');
}

/**
 * Loads project settings, returning defaults if not found
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {Object} Settings object with all required fields
 */
function loadSettings(projectPath = process.cwd()) {
  const settingsPath = getSettingsPath(projectPath);

  if (!fs.existsSync(settingsPath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf8');
    const loaded = JSON.parse(content);

    // Deep merge with defaults to ensure all fields exist
    return {
      display: {
        ...DEFAULT_SETTINGS.display,
        ...(loaded.display || {})
      },
      implementation: {
        ...DEFAULT_SETTINGS.implementation,
        ...(loaded.implementation || {})
      }
    };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Saves project settings
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @param {Object} settings - Settings object to save
 */
function saveSettings(projectPath = process.cwd(), settings) {
  const settingsDir = path.join(projectPath, '.ctoc');
  const settingsPath = getSettingsPath(projectPath);

  // Ensure .ctoc directory exists
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ============================================================================
// Queued Plans Management
// ============================================================================

/**
 * Gets all approved implementation plans that are queued for execution
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {Array} List of plan objects {name, path, modified}
 */
function getQueuedPlans(projectPath = process.cwd()) {
  return listPlans(PLAN_TYPES.IMPLEMENTATION, PLAN_STATUSES.APPROVED, projectPath);
}

// ============================================================================
// Usage Link Display Logic
// ============================================================================

/**
 * Determines if usage link should be shown based on frequency setting
 * @param {string} frequency - 'always', 'daily', or 'never'
 * @param {string|null} lastShown - ISO date string of last shown date, or null
 * @returns {boolean} True if usage link should be shown
 */
function shouldShowUsageLink(frequency, lastShown) {
  if (frequency === 'always') {
    return true;
  }

  if (frequency === 'never') {
    return false;
  }

  // Default to 'daily' behavior
  if (!lastShown) {
    return true;
  }

  const today = getToday();
  const lastShownDate = lastShown.split('T')[0]; // Handle both date and datetime strings

  return today !== lastShownDate;
}

// ============================================================================
// Background Implementation Menu
// ============================================================================

/**
 * Generates the background implementation settings menu
 * @param {number} planCount - Number of plans queued for implementation
 * @returns {string} Formatted menu string for display
 */
function generateBackgroundMenu(planCount) {
  const planWord = planCount === 1 ? 'plan' : 'plans';

  return `
+======================================================================+
|  Background Implementation Settings                                  |
+======================================================================+
|  You have ${planCount} ${planWord} queued for implementation.                       |
|                                                                      |
|  How should background implementation proceed?                       |
|                                                                      |
|  [1] Per plan      - Ask permission before each plan                 |
|  [2] Check-in      - Ask permission at intervals:                    |
|      [2a] Every 5 min   [2f] Every 45 min                            |
|      [2b] Every 10 min  [2g] Every 60 min                            |
|      [2c] Every 15 min  [2h] Every 90 min                            |
|      [2d] Every 20 min  [2i] Every 120 min                           |
|      [2e] Every 30 min  [2j] Every 180 min                           |
|  [3] Auto-continue - Implement all queued plans without asking       |
|                                                                      |
|  [S] Skip          - Don't start background implementation now       |
|                                                                      |
|  Check usage: https://claude.ai/settings/usage                       |
+======================================================================+
`.trim();
}

// ============================================================================
// Check-in Timing Logic
// ============================================================================

/**
 * Determines if a check-in prompt should be shown based on elapsed time
 * @param {number} startTime - Timestamp when background implementation started
 * @param {number} intervalMinutes - Check-in interval in minutes
 * @param {number} currentTime - Current timestamp (defaults to Date.now())
 * @returns {boolean} True if check-in prompt should be shown
 */
function shouldShowCheckIn(startTime, intervalMinutes, currentTime = Date.now()) {
  const intervalMs = intervalMinutes * 60 * 1000;
  const elapsed = currentTime - startTime;

  return elapsed >= intervalMs;
}

/**
 * Generates the check-in prompt for background implementation
 * @param {number} elapsed - Elapsed time in milliseconds
 * @param {number} plansCompleted - Number of plans completed so far
 * @param {number} plansRemaining - Number of plans remaining
 * @returns {string} Formatted check-in prompt
 */
function generateCheckInPrompt(elapsed, plansCompleted, plansRemaining) {
  const minutes = Math.floor(elapsed / (60 * 1000));

  return `
+======================================================================+
|  Background Implementation Check-in                                  |
+======================================================================+
|                                                                      |
|  Time elapsed: ${String(minutes).padEnd(4)} minutes                                     |
|  Plans completed: ${String(plansCompleted).padEnd(4)}                                         |
|  Plans remaining: ${String(plansRemaining).padEnd(4)}                                         |
|                                                                      |
|  [C] Continue      - Keep implementing                               |
|  [P] Pause         - Pause after current plan                        |
|  [S] Stop          - Stop background implementation                  |
|                                                                      |
|  Check usage: https://claude.ai/settings/usage                       |
+======================================================================+
`.trim();
}

// ============================================================================
// Integrator-Critic Loop Functions
// ============================================================================

/**
 * Validates an execution plan structure
 * @param {Object} plan - The execution plan to validate
 * @returns {Object} Validation result {valid, errors}
 */
function validateExecutionPlan(plan) {
  const errors = [];

  if (!plan) {
    return { valid: false, errors: ['Plan is null or undefined'] };
  }

  // Check required steps 7-15
  const requiredSteps = [7, 8, 9, 10, 11, 12, 13, 14, 15];
  for (const step of requiredSteps) {
    const stepKey = `step_${step}`;
    if (!plan[stepKey]) {
      errors.push(`Missing step ${step}`);
    } else {
      // Each step must have an agent assigned
      if (!plan[stepKey].agent) {
        errors.push(`Step ${step} missing agent`);
      }
      // Each step must have tasks or actions
      if (!plan[stepKey].tasks && !plan[stepKey].actions && !plan[stepKey].checks) {
        errors.push(`Step ${step} missing tasks/actions/checks`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates critic scores for all 5 dimensions
 * @param {Object} scores - The scores object with dimension keys
 * @returns {Object} Validation result {valid, errors, allPassed}
 */
function validateCriticScores(scores) {
  const errors = [];

  if (!scores) {
    return { valid: false, errors: ['Scores is null or undefined'], allPassed: false };
  }

  const dimensions = Object.values(RUBRIC_DIMENSIONS);
  let allPassed = true;

  for (const dim of dimensions) {
    if (scores[dim] === undefined) {
      errors.push(`Missing score for dimension: ${dim}`);
      allPassed = false;
    } else if (typeof scores[dim].score !== 'number') {
      errors.push(`Score for ${dim} is not a number`);
      allPassed = false;
    } else if (scores[dim].score < 1 || scores[dim].score > 5) {
      errors.push(`Score for ${dim} out of range (1-5): ${scores[dim].score}`);
      allPassed = false;
    } else if (scores[dim].score < 5) {
      allPassed = false;
      // Must have reason and suggestion if not 5
      if (!scores[dim].reason) {
        errors.push(`Score ${dim} < 5 but missing reason`);
      }
      if (!scores[dim].suggestion) {
        errors.push(`Score ${dim} < 5 but missing suggestion`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    allPassed
  };
}

/**
 * Validates deferred question format
 * @param {Object} question - The deferred question
 * @returns {Object} Validation result {valid, errors}
 */
function validateDeferredQuestion(question) {
  const errors = [];

  if (!question) {
    return { valid: false, errors: ['Question is null or undefined'] };
  }

  // Required fields
  if (!question.context) errors.push('Missing context');
  if (!question.issue) errors.push('Missing issue');
  if (!question.step) errors.push('Missing step');
  if (!question.question) errors.push('Missing question text');

  // Options validation
  if (!question.options || !Array.isArray(question.options)) {
    errors.push('Missing or invalid options array');
  } else if (question.options.length < 2) {
    errors.push('Must have at least 2 options');
  } else {
    for (let i = 0; i < question.options.length; i++) {
      const opt = question.options[i];
      if (!opt.id) errors.push(`Option ${i} missing id`);
      if (!opt.description) errors.push(`Option ${i} missing description`);
      if (!opt.pros) errors.push(`Option ${i} missing pros`);
      if (!opt.cons) errors.push(`Option ${i} missing cons`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Creates a deferred question from unresolved critic feedback
 * @param {number} round - The round number where the issue occurred
 * @param {string} dimension - The dimension that didn't pass
 * @param {Object} score - The score object with reason and suggestion
 * @returns {Object} Formatted deferred question
 */
function createDeferredQuestion(round, dimension, score) {
  return {
    context: `Round ${round} - ${dimension} scored ${score.score}/5`,
    issue: score.reason,
    step: score.affectedStep || 9,
    question: `How should we address: ${score.reason}?`,
    options: [
      {
        id: 'A',
        description: score.suggestion || 'Apply suggested fix',
        pros: 'Addresses the issue directly',
        cons: 'May require additional implementation time'
      },
      {
        id: 'B',
        description: 'Defer to future iteration',
        pros: 'Can ship current work faster',
        cons: 'Creates technical debt'
      },
      {
        id: 'C',
        description: 'Accept current state with known limitation',
        pros: 'No changes required',
        cons: 'Issue remains unresolved',
        recommended: false
      }
    ]
  };
}

/**
 * Formats a deferred question for display to the user
 * @param {Object} question - The deferred question object
 * @param {number} questionNumber - Current question number
 * @param {number} totalQuestions - Total number of questions
 * @returns {string} Formatted display string
 */
function formatDeferredQuestion(question, questionNumber, totalQuestions) {
  const stepName = STEP_NAMES[question.step] || 'Unknown';
  const optionsTable = question.options.map(opt => {
    const rec = opt.recommended === true ? ' *Recommended*' : '';
    return `  | ${opt.id.padEnd(6)} | ${opt.description}${rec}`;
  }).join('\n');

  const prosConsTable = question.options.map(opt => {
    return `  | ${opt.id.padEnd(6)} | ${opt.pros.padEnd(25)} | ${opt.cons}`;
  }).join('\n');

  return `
+======================================================================+
|  DEFERRED QUESTION ${questionNumber} of ${totalQuestions}${' '.repeat(Math.max(0, 40 - String(questionNumber).length - String(totalQuestions).length))}|
+======================================================================+
|                                                                      |
|  Context: ${question.context.padEnd(54)}|
|  Issue:   ${question.issue.substring(0, 54).padEnd(54)}|
|  Step:    ${question.step} (${stepName})${' '.repeat(Math.max(0, 47 - stepName.length))}|
|                                                                      |
+----------------------------------------------------------------------+
|                                                                      |
|  ${question.question.padEnd(66)}|
|                                                                      |
|  Options:                                                            |
${optionsTable}
|                                                                      |
|  Pros/Cons:                                                          |
|  | Option | Pros                      | Cons                       |
|  |--------|---------------------------|----------------------------|
${prosConsTable}
|                                                                      |
+======================================================================+
`.trim();
}

/**
 * Gets the execution plan directory path
 * @param {string} projectPath - Project root path (defaults to cwd)
 * @returns {string} Path to execution plans directory
 */
function getExecutionPlanPath(projectPath = process.cwd()) {
  return path.join(projectPath, 'plans', 'execution');
}

/**
 * Ensures execution plan directory exists
 * @param {string} projectPath - Project root path (defaults to cwd)
 */
function ensureExecutionPlanDir(projectPath = process.cwd()) {
  const execDir = getExecutionPlanPath(projectPath);
  if (!fs.existsSync(execDir)) {
    fs.mkdirSync(execDir, { recursive: true });
  }
}

/**
 * Saves an execution plan to the execution plans directory
 * @param {string} projectPath - Project root path
 * @param {string} planName - Name of the plan (without .md extension)
 * @param {Object} plan - The execution plan object
 * @param {Array} deferredQuestions - Any deferred questions from the loop
 * @returns {Object} Result {success, path, error?}
 */
function saveExecutionPlan(projectPath, planName, plan, deferredQuestions = []) {
  try {
    ensureExecutionPlanDir(projectPath);

    const execDir = getExecutionPlanPath(projectPath);
    const fileName = planName.endsWith('.md') ? planName : `${planName}.md`;
    const filePath = path.join(execDir, fileName);

    // Format as markdown with YAML front matter
    let content = `# Execution Plan: ${planName}\n\n`;
    content += `**Generated:** ${getTimestamp()}\n`;
    content += `**Status:** Ready for execution\n\n`;

    content += `## Execution Steps\n\n`;
    content += '```yaml\n';
    content += JSON.stringify(plan, null, 2).replace(/"/g, '');
    content += '\n```\n\n';

    if (deferredQuestions.length > 0) {
      content += `## Deferred Questions\n\n`;
      content += `These questions will be presented at Step 15 (FINAL-REVIEW):\n\n`;
      for (let i = 0; i < deferredQuestions.length; i++) {
        content += `### Question ${i + 1}\n\n`;
        content += `- **Context:** ${deferredQuestions[i].context}\n`;
        content += `- **Issue:** ${deferredQuestions[i].issue}\n`;
        content += `- **Step:** ${deferredQuestions[i].step}\n`;
        content += `- **Question:** ${deferredQuestions[i].question}\n\n`;
      }
    }

    fs.writeFileSync(filePath, content, 'utf8');

    return {
      success: true,
      path: filePath
    };
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * Loads an execution plan from file
 * @param {string} filePath - Path to the execution plan file
 * @returns {Object|null} The execution plan or null if not found
 */
function loadExecutionPlan(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Parse the YAML block from the markdown
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
    if (yamlMatch) {
      // Simple parse for our structure (not full YAML)
      return JSON.parse(yamlMatch[1].replace(/(\w+):/g, '"$1":'));
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Commit Queue Re-exports
// ============================================================================

const commitQueue = require('./commit-queue');

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
  DEFAULT_SETTINGS,
  CHECK_IN_INTERVALS,

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
  updateLastActivity,
  isInterruptedSession,
  formatTimeSince,

  // Session Management
  loadSession,
  createSession,
  saveSession,
  logSessionEvent,

  // Config Management
  loadConfig,
  getDefaultConfig,
  saveConfig,

  // Project Settings Management
  getSettingsPath,
  loadSettings,
  saveSettings,

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
  listPlans,
  getQueuedPlans,

  // Usage Link Display
  shouldShowUsageLink,

  // Background Implementation
  generateBackgroundMenu,
  shouldShowCheckIn,
  generateCheckInPrompt,

  // Integrator-Critic Loop
  INTEGRATION_SETTINGS,
  RUBRIC_DIMENSIONS,
  validateExecutionPlan,
  validateCriticScores,
  validateDeferredQuestion,
  createDeferredQuestion,
  formatDeferredQuestion,
  getExecutionPlanPath,
  ensureExecutionPlanDir,
  saveExecutionPlan,
  loadExecutionPlan,

  // Commit Queue (re-exported from commit-queue.js)
  commitQueue,
  enqueueCommit: commitQueue.enqueueCommit,
  processNextCommit: commitQueue.processNextCommit,
  processAllCommits: commitQueue.processAllCommits,
  getQueueStatus: commitQueue.getQueueStatus,
  directCommit: commitQueue.directCommit
};

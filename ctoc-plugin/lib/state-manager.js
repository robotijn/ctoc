/**
 * CTOC State Manager
 * Iron Loop state persistence with cryptographic signing
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { signState, verifyState, hashPath, CTOC_HOME } = require('./crypto');

const STATE_DIR = path.join(CTOC_HOME, 'state');

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
 * Ensures state directory exists
 */
function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

/**
 * Gets state file path for a project
 */
function getStatePath(projectPath) {
  ensureStateDir();
  const hash = hashPath(projectPath || process.cwd());
  return path.join(STATE_DIR, `${hash}.json`);
}

/**
 * Creates a new Iron Loop state
 */
function createState(projectPath, feature, language, framework) {
  const now = new Date().toISOString();
  return {
    _version: '4.0.0',
    project: projectPath || process.cwd(),
    feature: feature || null,
    started: now,
    lastUpdated: now,
    currentStep: 1,
    language: language || 'unknown',
    framework: framework || null,
    steps: {},
    gate1_approval: null,
    gate2_approval: null,
    sessionStatus: 'active',
    lastActivity: now
  };
}

/**
 * Loads state for a project (with signature verification)
 */
function loadState(projectPath) {
  const statePath = getStatePath(projectPath);

  if (!fs.existsSync(statePath)) {
    return { state: null, valid: false, error: 'No state file' };
  }

  try {
    const content = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(content);

    // Check if unsigned (legacy v2.x state)
    if (!state._signature) {
      // Migrate to signed format
      const signedState = signState({ ...state, _version: '4.0.0', _migrated_at: new Date().toISOString() });
      fs.writeFileSync(statePath, JSON.stringify(signedState, null, 2));
      return { state: signedState, valid: true, migrated: true };
    }

    // Verify signature
    const verification = verifyState(state);
    if (verification.valid) {
      return { state, valid: true };
    } else {
      return { state: null, valid: false, error: verification.error };
    }
  } catch (e) {
    return { state: null, valid: false, error: `Failed to load state: ${e.message}` };
  }
}

/**
 * Saves state for a project (with signing)
 */
function saveState(projectPath, state) {
  ensureStateDir();
  const statePath = getStatePath(projectPath);

  state.lastUpdated = new Date().toISOString();
  state.lastActivity = new Date().toISOString();

  const signedState = signState(state);
  fs.writeFileSync(statePath, JSON.stringify(signedState, null, 2));

  return signedState;
}

/**
 * Updates Iron Loop step status
 */
function updateStep(projectPath, stepNumber, status, summary) {
  const result = loadState(projectPath);
  const state = result.state || createState(projectPath);

  state.steps[stepNumber] = {
    status: status,
    timestamp: new Date().toISOString(),
    summary: summary || ''
  };

  if (status === 'completed' && stepNumber >= state.currentStep) {
    state.currentStep = stepNumber + 1;
  } else if (status === 'in_progress') {
    state.currentStep = stepNumber;
  }

  return saveState(projectPath, state);
}

/**
 * Creates a gate approval record
 */
function createGateApproval(gateNumber, planPath, planHash) {
  return {
    gate: gateNumber,
    timestamp: new Date().toISOString(),
    user_confirmed: true,
    plan_path: planPath,
    plan_hash: planHash
  };
}

/**
 * Verifies a gate approval is valid
 */
function verifyGateApproval(gateNumber, state) {
  const approval = state[`gate${gateNumber}_approval`];

  if (!approval) {
    return { valid: false, error: `Gate ${gateNumber} approval not found` };
  }

  if (!approval.timestamp) {
    return { valid: false, error: `Gate ${gateNumber} approval missing timestamp` };
  }

  if (!approval.user_confirmed) {
    return { valid: false, error: `Gate ${gateNumber} not user-confirmed` };
  }

  // Check approval age (24 hour max)
  const approvalTime = new Date(approval.timestamp).getTime();
  const ageMs = Date.now() - approvalTime;
  const MAX_APPROVAL_AGE = 24 * 60 * 60 * 1000;

  if (ageMs > MAX_APPROVAL_AGE) {
    return { valid: false, error: `Gate ${gateNumber} approval expired (older than 24 hours)` };
  }

  return { valid: true };
}

/**
 * Checks if session was interrupted during implementation
 */
function isInterruptedSession(state) {
  if (!state) return false;
  if (state.sessionStatus !== 'active') return false;
  if (typeof state.currentStep !== 'number' || state.currentStep < 7 || state.currentStep > 15) return false;

  const lastActivity = new Date(state.lastActivity);
  const hoursSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

  return hoursSince < 24;
}

/**
 * Formats time since last activity
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

module.exports = {
  STATE_DIR,
  STEP_NAMES,
  STEP_DESCRIPTIONS,
  ensureStateDir,
  getStatePath,
  createState,
  loadState,
  saveState,
  updateStep,
  createGateApproval,
  verifyGateApproval,
  isInterruptedSession,
  formatTimeSince
};

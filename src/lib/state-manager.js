/**
 * CTOC State Manager
 * Iron Loop state persistence with cryptographic signing
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { signState, verifyState, hashPath, CTOC_HOME } = require('./crypto');

const STATE_DIR = path.join(CTOC_HOME, 'state');

// State schema version (bump when state structure changes, not on every release)
const STATE_SCHEMA_VERSION = '4.0.0';

const STEP_NAMES = {
  1: 'IDEATE',
  2: 'ASSESS',
  3: 'ALIGN',
  4: 'CAPTURE',
  5: 'PLAN',
  6: 'DESIGN',
  7: 'SPEC',
  8: 'TEST',
  9: 'PREPARE',
  10: 'IMPLEMENT',
  11: 'REVIEW',
  12: 'OPTIMIZE',
  13: 'SECURE',
  14: 'VERIFY',
  15: 'DOCUMENT',
  16: 'FINAL-REVIEW'
};

// STEP_DESCRIPTIONS — a sixteen-entry table of one-line step blurbs — was DELETED
// on 2026-07-20. Its only live reader was `progress()` in src/lib/ui.js, one of five
// screen builders removed the same day as unreachable, and orphaning it would have
// added a NEW entry to the dead-export baseline (a ratchet whose only sanctioned
// exits are wire or delete). STEP_NAMES above is untouched: it has live readers in
// src/hooks/PreToolUse.Bash.js and src/hooks/SessionStart.js.
//
// The step blurbs themselves are not lost — docs/IRON_LOOP.md and CLAUDE.md carry the
// canonical step table, and they are what a human reads. If a live screen ever needs
// per-step prose again, it should come from there rather than from a second copy that
// drifts silently because nothing renders it.

/**
 * Ensures state directory exists
 */
function ensureStateDir() {
  if (!safeFs.existsSync(STATE_DIR)) {
    safeFs.mkdirSync(STATE_DIR, { recursive: true });
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
    _version: STATE_SCHEMA_VERSION,
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
 * Loads state for a project (with signature verification).
 *
 * An UNSIGNED state file is REJECTED, not signed on load. Signing it would mean the
 * signature proves nothing: forging state would need no key at all — write an unsigned
 * file and the next load mints the signature. The two fields it controls (currentStep,
 * feature) are the only inputs to the Bash hook's write gate and commit gate.
 * Recovery from a rejected state is to start the Iron Loop again from the menu;
 * saveState signs unconditionally.
 */
function loadState(projectPath) {
  const statePath = getStatePath(projectPath);

  if (!safeFs.existsSync(statePath)) {
    return { state: null, valid: false, error: 'No state file' };
  }

  try {
    const content = safeFs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(content);

    // An unsigned state cannot be authenticated. Signing it on load would mean any
    // hand-written file became valid state, so it is REJECTED — never migrated. The
    // `unsigned: true` discriminator lets a caller tell "never signed" from "tampered"
    // without parsing the message.
    if (!state || typeof state !== 'object' || !state._signature) {
      return {
        state: null,
        valid: false,
        error: 'State file is unsigned. An unsigned state cannot be authenticated, so it '
             + 'is not accepted — signing it on load would mean any hand-written file '
             + 'became valid state. Start the Iron Loop again from the menu to write a '
             + 'fresh signed state.',
        unsigned: true,
      };
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
  safeFs.writeFileSync(statePath, JSON.stringify(signedState, null, 2));

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
  if (typeof state.currentStep !== 'number' || state.currentStep < 8 || state.currentStep > 16) return false;

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

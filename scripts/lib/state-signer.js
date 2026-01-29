/**
 * CTOC State Signer - Cryptographic State Verification
 *
 * Implements HMAC-SHA256 signing and verification for Iron Loop state files.
 * This prevents tampering with state files to bypass Iron Loop enforcement.
 *
 * Part of the Holy Trinity of Enforcement (Layer 2)
 *
 * @version 3.0.0
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// Configuration
// ============================================================================

const CTOC_HOME = path.join(os.homedir(), '.ctoc');
const SECRET_FILE = path.join(CTOC_HOME, '.secret');
const SECRET_LENGTH = 64; // 64 bytes = 512 bits

// ============================================================================
// Secret Management
// ============================================================================

/**
 * Gets the installation secret, creating one if it doesn't exist.
 * The secret is stored in ~/.ctoc/.secret with restrictive permissions.
 *
 * @returns {Buffer} The installation secret
 */
function getInstallationSecret() {
  // Ensure CTOC home directory exists
  if (!fs.existsSync(CTOC_HOME)) {
    fs.mkdirSync(CTOC_HOME, { recursive: true });
  }

  if (fs.existsSync(SECRET_FILE)) {
    try {
      const secret = fs.readFileSync(SECRET_FILE);
      if (secret.length >= SECRET_LENGTH) {
        return secret;
      }
      // Secret file corrupted or too short, regenerate
    } catch (e) {
      // Cannot read secret, regenerate
    }
  }

  // Generate new secret
  const secret = crypto.randomBytes(SECRET_LENGTH);

  // Write with restrictive permissions (owner read/write only)
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });

  return secret;
}

/**
 * Rotates the installation secret.
 * WARNING: This will invalidate all existing signed states!
 *
 * @returns {Buffer} The new installation secret
 */
function rotateSecret() {
  const newSecret = crypto.randomBytes(SECRET_LENGTH);
  fs.writeFileSync(SECRET_FILE, newSecret, { mode: 0o600 });
  return newSecret;
}

// ============================================================================
// State Signing
// ============================================================================

/**
 * Creates a deep copy of an object, omitting specified keys
 * @param {Object} obj - Object to copy
 * @param {string[]} keysToOmit - Keys to omit
 * @returns {Object} Copied object without omitted keys
 */
function omit(obj, keysToOmit) {
  const result = {};
  for (const key of Object.keys(obj)) {
    if (!keysToOmit.includes(key)) {
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        result[key] = omit(obj[key], keysToOmit);
      } else {
        result[key] = obj[key];
      }
    }
  }
  return result;
}

/**
 * Creates a canonical JSON string for signing.
 * This ensures consistent ordering for verification.
 *
 * @param {Object} obj - Object to stringify
 * @returns {string} Canonical JSON string
 */
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
  }

  // Sort keys for consistent ordering
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(key => {
    return JSON.stringify(key) + ':' + canonicalStringify(obj[key]);
  });

  return '{' + parts.join(',') + '}';
}

/**
 * Signs a state object with HMAC-SHA256.
 * Adds a _signature field to the state.
 *
 * @param {Object} state - State object to sign
 * @returns {Object} State object with _signature field
 */
function signState(state) {
  const secret = getInstallationSecret();

  // Remove existing signature before signing
  const stateToSign = omit(state, ['_signature']);

  // Create canonical JSON for consistent hashing
  const data = canonicalStringify(stateToSign);

  // Create HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = 'hmac-sha256:' + hmac.digest('hex');

  // Return new state with signature
  return {
    ...state,
    _signature: signature
  };
}

/**
 * Verifies a signed state object.
 *
 * @param {Object} state - State object with _signature field
 * @returns {Object} Verification result {valid: boolean, error?: string}
 */
function verifyState(state) {
  if (!state) {
    return { valid: false, error: 'State is null or undefined' };
  }

  if (!state._signature) {
    return { valid: false, error: 'State is not signed (missing _signature)' };
  }

  if (!state._signature.startsWith('hmac-sha256:')) {
    return { valid: false, error: 'Invalid signature format' };
  }

  const secret = getInstallationSecret();

  // Remove signature before verification
  const stateToVerify = omit(state, ['_signature']);

  // Create canonical JSON
  const data = canonicalStringify(stateToVerify);

  // Calculate expected signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const expected = 'hmac-sha256:' + hmac.digest('hex');

  // Compare signatures using timing-safe comparison
  const actual = state._signature;

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(actual, 'utf8')
    );

    if (isValid) {
      return { valid: true };
    } else {
      return { valid: false, error: 'Signature mismatch - state may have been tampered' };
    }
  } catch (e) {
    // Length mismatch means invalid signature
    return { valid: false, error: 'Signature verification failed' };
  }
}

// ============================================================================
// Gate Approval Verification
// ============================================================================

/**
 * Creates a hash of a plan file for gate approval tracking.
 *
 * @param {string} planPath - Path to the plan file
 * @returns {string|null} SHA256 hash of the plan content, or null if file doesn't exist
 */
function hashPlanFile(planPath) {
  if (!fs.existsSync(planPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(planPath, 'utf8');
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  } catch (e) {
    return null;
  }
}

/**
 * Creates a gate approval object with timestamp and plan hash.
 *
 * @param {number} gateNumber - Gate number (1 or 2)
 * @param {string} planPath - Path to the approved plan file
 * @returns {Object} Gate approval object
 */
function createGateApproval(gateNumber, planPath) {
  const planHash = hashPlanFile(planPath);

  return {
    gate: gateNumber,
    timestamp: new Date().toISOString(),
    user_confirmed: true,
    plan_path: planPath,
    plan_hash: planHash
  };
}

/**
 * Verifies that a gate approval is valid and the plan hasn't been modified.
 *
 * @param {number} gateNumber - Gate number to verify
 * @param {Object} state - Signed state object
 * @returns {Object} Verification result {valid: boolean, error?: string}
 */
function verifyGateApproval(gateNumber, state) {
  const approval = state[`gate${gateNumber}_approval`];

  if (!approval) {
    return { valid: false, error: `Gate ${gateNumber} approval not found` };
  }

  // Check approval has required fields
  if (!approval.timestamp) {
    return { valid: false, error: `Gate ${gateNumber} approval missing timestamp` };
  }

  if (!approval.user_confirmed) {
    return { valid: false, error: `Gate ${gateNumber} not user-confirmed` };
  }

  if (!approval.plan_hash || !approval.plan_path) {
    return { valid: false, error: `Gate ${gateNumber} approval missing plan hash` };
  }

  // Verify plan still matches hash (wasn't modified after approval)
  const currentPlanHash = hashPlanFile(approval.plan_path);
  if (currentPlanHash !== approval.plan_hash) {
    return {
      valid: false,
      error: `PLAN MODIFIED AFTER GATE ${gateNumber} APPROVAL - re-approval required`
    };
  }

  // Check approval is recent (within 24 hours)
  const approvalTime = new Date(approval.timestamp).getTime();
  const now = Date.now();
  const ageMs = now - approvalTime;
  const MAX_APPROVAL_AGE = 24 * 60 * 60 * 1000; // 24 hours

  if (ageMs > MAX_APPROVAL_AGE) {
    return {
      valid: false,
      error: `Gate ${gateNumber} approval expired (older than 24 hours)`
    };
  }

  return { valid: true };
}

// ============================================================================
// Safe State File Operations
// ============================================================================

/**
 * Saves a signed state to a file.
 *
 * @param {string} filePath - Path to save state
 * @param {Object} state - State object (will be signed)
 */
function saveSignedState(filePath, state) {
  const signedState = signState(state);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(signedState, null, 2));
}

/**
 * Loads and verifies a signed state from a file.
 *
 * @param {string} filePath - Path to load state from
 * @returns {Object} Result {state?: Object, valid: boolean, error?: string}
 */
function loadSignedState(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'State file not found' };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const state = JSON.parse(content);

    const verification = verifyState(state);

    if (verification.valid) {
      return { state, valid: true };
    } else {
      return { valid: false, error: verification.error };
    }
  } catch (e) {
    return { valid: false, error: `Failed to load state: ${e.message}` };
  }
}

// ============================================================================
// Migration Utilities
// ============================================================================

/**
 * Migrates an unsigned state to a signed state.
 * Used during upgrade from v2.x to v3.x.
 *
 * @param {Object} unsignedState - State without signature
 * @returns {Object} Signed state
 */
function migrateToSigned(unsignedState) {
  // Ensure state has required fields
  const state = {
    ...unsignedState,
    _version: '3.0.0',
    _migrated_at: new Date().toISOString()
  };

  return signState(state);
}

/**
 * Checks if a state file needs migration to signed format.
 *
 * @param {string} filePath - Path to state file
 * @returns {boolean} True if migration needed
 */
function needsMigration(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const state = JSON.parse(content);
    return !state._signature;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Secret management
  getInstallationSecret,
  rotateSecret,

  // State signing
  signState,
  verifyState,

  // Gate approval
  hashPlanFile,
  createGateApproval,
  verifyGateApproval,

  // File operations
  saveSignedState,
  loadSignedState,

  // Migration
  migrateToSigned,
  needsMigration,

  // Utilities
  canonicalStringify,
  omit
};

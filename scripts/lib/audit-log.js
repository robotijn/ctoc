/**
 * CTOC Audit Log - Immutable Audit Trail
 *
 * Implements append-only audit logging with chain hashing for tamper detection.
 * All Iron Loop events are logged to provide accountability and debugging.
 *
 * Part of the Holy Trinity of Enforcement
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
const AUDIT_DIR = path.join(CTOC_HOME, 'audit');
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

// ============================================================================
// Event Types
// ============================================================================

const EVENT_TYPES = {
  // Feature lifecycle
  FEATURE_STARTED: 'feature_started',
  FEATURE_COMPLETED: 'feature_completed',
  FEATURE_ABANDONED: 'feature_abandoned',

  // Step tracking
  STEP_ADVANCED: 'step_advanced',
  STEP_COMPLETED: 'step_completed',
  STEP_SKIPPED: 'step_skipped',

  // Gate events
  GATE_APPROVAL_REQUESTED: 'gate_approval_requested',
  GATE_APPROVED: 'gate_approved',
  GATE_REJECTED: 'gate_rejected',

  // Enforcement events
  EDIT_BLOCKED: 'edit_blocked',
  EDIT_ALLOWED: 'edit_allowed',
  WRITE_BLOCKED: 'write_blocked',
  WRITE_ALLOWED: 'write_allowed',
  BASH_BLOCKED: 'bash_blocked',
  BASH_ALLOWED: 'bash_allowed',
  COMMIT_BLOCKED: 'commit_blocked',
  COMMIT_ALLOWED: 'commit_allowed',

  // Emergency events
  EMERGENCY_BYPASS: 'emergency_bypass',
  TAMPERING_DETECTED: 'tampering_detected',

  // State events
  STATE_CREATED: 'state_created',
  STATE_MIGRATED: 'state_migrated',
  STATE_VERIFIED: 'state_verified',
  STATE_INVALID: 'state_invalid'
};

// ============================================================================
// Audit Log Path Management
// ============================================================================

/**
 * Gets the audit log path for a project.
 *
 * @param {string} projectPath - Project root path
 * @returns {string} Path to audit log file
 */
function getAuditLogPath(projectPath) {
  // Create a hash of the project path for unique identification
  const hash = crypto
    .createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .substring(0, 16);

  return path.join(AUDIT_DIR, `${hash}.audit.log`);
}

/**
 * Ensures the audit directory exists.
 */
function ensureAuditDir() {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

// ============================================================================
// Chain Hashing
// ============================================================================

/**
 * Hashes an object for chain integrity.
 *
 * @param {Object} obj - Object to hash
 * @returns {string} SHA256 hash
 */
function hashObject(obj) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(obj));
  return hash.digest('hex');
}

/**
 * Gets the hash of the last audit entry.
 *
 * @param {string} logPath - Path to audit log
 * @returns {string} Hash of last entry, or genesis hash if no entries
 */
function getLastAuditHash(logPath) {
  if (!fs.existsSync(logPath)) {
    return GENESIS_HASH;
  }

  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);

    if (lines.length === 0) {
      return GENESIS_HASH;
    }

    const lastEntry = JSON.parse(lines[lines.length - 1]);
    return lastEntry.hash || GENESIS_HASH;
  } catch (e) {
    return GENESIS_HASH;
  }
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Logs an audit event.
 *
 * @param {string} projectPath - Project root path
 * @param {Object} event - Event to log
 * @param {string} event.type - Event type (from EVENT_TYPES)
 * @param {Object} event.details - Event details
 * @param {number} event.step - Current Iron Loop step (optional)
 * @param {string} event.feature - Feature name (optional)
 */
function logAuditEvent(projectPath, event) {
  ensureAuditDir();
  const logPath = getAuditLogPath(projectPath);

  const entry = {
    timestamp: new Date().toISOString(),
    event: event.type,
    details: event.details || {},
    step: event.step || null,
    feature: event.feature || null,
    project: projectPath,
    // Chain hash for tamper detection
    prev_hash: getLastAuditHash(logPath)
  };

  // Calculate hash of this entry (including prev_hash)
  entry.hash = hashObject(entry);

  // Append to log (append-only)
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(logPath, line, { mode: 0o644 });

  return entry;
}

// ============================================================================
// Convenience Logging Functions
// ============================================================================

/**
 * Logs a feature started event.
 */
function logFeatureStarted(projectPath, featureName) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.FEATURE_STARTED,
    feature: featureName,
    details: { started_at: new Date().toISOString() }
  });
}

/**
 * Logs a step advancement.
 */
function logStepAdvanced(projectPath, feature, fromStep, toStep) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.STEP_ADVANCED,
    feature,
    step: toStep,
    details: { from_step: fromStep, to_step: toStep }
  });
}

/**
 * Logs a gate approval.
 */
function logGateApproved(projectPath, feature, gateNumber, planPath) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.GATE_APPROVED,
    feature,
    details: {
      gate: gateNumber,
      plan_path: planPath,
      approved_at: new Date().toISOString()
    }
  });
}

/**
 * Logs an edit blocked event.
 */
function logEditBlocked(projectPath, feature, step, filePath, reason) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.EDIT_BLOCKED,
    feature,
    step,
    details: {
      file_path: filePath,
      reason,
      blocked_at: new Date().toISOString()
    }
  });
}

/**
 * Logs an edit allowed event.
 */
function logEditAllowed(projectPath, feature, step, filePath) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.EDIT_ALLOWED,
    feature,
    step,
    details: {
      file_path: filePath,
      allowed_at: new Date().toISOString()
    }
  });
}

/**
 * Logs a bash command blocked event.
 */
function logBashBlocked(projectPath, feature, step, command, reason) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.BASH_BLOCKED,
    feature,
    step,
    details: {
      command: command.substring(0, 200), // Truncate for safety
      reason,
      blocked_at: new Date().toISOString()
    }
  });
}

/**
 * Logs an emergency bypass.
 */
function logEmergencyBypass(projectPath, feature, step, reason, acknowledgedText) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.EMERGENCY_BYPASS,
    feature,
    step,
    details: {
      reason,
      acknowledged_text: acknowledgedText,
      bypassed_at: new Date().toISOString()
    }
  });
}

/**
 * Logs tampering detection.
 */
function logTamperingDetected(projectPath, feature, details) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.TAMPERING_DETECTED,
    feature,
    details: {
      ...details,
      detected_at: new Date().toISOString()
    }
  });
}

/**
 * Logs commit blocked event.
 */
function logCommitBlocked(projectPath, feature, step, reason) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.COMMIT_BLOCKED,
    feature,
    step,
    details: {
      reason,
      blocked_at: new Date().toISOString()
    }
  });
}

/**
 * Logs commit allowed event.
 */
function logCommitAllowed(projectPath, feature, step) {
  return logAuditEvent(projectPath, {
    type: EVENT_TYPES.COMMIT_ALLOWED,
    feature,
    step,
    details: {
      allowed_at: new Date().toISOString()
    }
  });
}

// ============================================================================
// Audit Log Verification
// ============================================================================

/**
 * Verifies the integrity of an audit log chain.
 *
 * @param {string} projectPath - Project root path
 * @returns {Object} Verification result {valid: boolean, entries: number, errors: string[]}
 */
function verifyAuditLog(projectPath) {
  const logPath = getAuditLogPath(projectPath);

  if (!fs.existsSync(logPath)) {
    return { valid: true, entries: 0, errors: [] };
  }

  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);

    const errors = [];
    let prevHash = GENESIS_HASH;

    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);

        // Check prev_hash matches previous entry's hash
        if (entry.prev_hash !== prevHash) {
          errors.push(`Entry ${i}: prev_hash mismatch (chain broken)`);
        }

        // Verify entry hash
        const storedHash = entry.hash;
        const entryWithoutHash = { ...entry };
        delete entryWithoutHash.hash;
        const expectedHash = hashObject(entryWithoutHash);

        // Note: We need to recalculate including the hash field
        // The original calculation included prev_hash but not the hash itself
        const entryForHash = {
          timestamp: entry.timestamp,
          event: entry.event,
          details: entry.details,
          step: entry.step,
          feature: entry.feature,
          project: entry.project,
          prev_hash: entry.prev_hash
        };
        const calculatedHash = hashObject(entryForHash);

        if (storedHash !== calculatedHash) {
          errors.push(`Entry ${i}: hash mismatch (entry tampered)`);
        }

        prevHash = storedHash;
      } catch (e) {
        errors.push(`Entry ${i}: failed to parse (${e.message})`);
      }
    }

    return {
      valid: errors.length === 0,
      entries: lines.length,
      errors
    };
  } catch (e) {
    return {
      valid: false,
      entries: 0,
      errors: [`Failed to read audit log: ${e.message}`]
    };
  }
}

/**
 * Gets recent audit entries for a project.
 *
 * @param {string} projectPath - Project root path
 * @param {number} count - Number of entries to return (default: 10)
 * @returns {Array} Recent audit entries
 */
function getRecentEntries(projectPath, count = 10) {
  const logPath = getAuditLogPath(projectPath);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);

    return lines
      .slice(-count)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(entry => entry !== null);
  } catch (e) {
    return [];
  }
}

/**
 * Gets all entries matching an event type.
 *
 * @param {string} projectPath - Project root path
 * @param {string} eventType - Event type to filter
 * @returns {Array} Matching entries
 */
function getEntriesByType(projectPath, eventType) {
  const logPath = getAuditLogPath(projectPath);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);

    return lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(entry => entry !== null && entry.event === eventType);
  } catch (e) {
    return [];
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Event types
  EVENT_TYPES,

  // Core logging
  logAuditEvent,

  // Convenience functions
  logFeatureStarted,
  logStepAdvanced,
  logGateApproved,
  logEditBlocked,
  logEditAllowed,
  logBashBlocked,
  logEmergencyBypass,
  logTamperingDetected,
  logCommitBlocked,
  logCommitAllowed,

  // Verification
  verifyAuditLog,
  getRecentEntries,
  getEntriesByType,

  // Utilities
  getAuditLogPath,
  hashObject
};

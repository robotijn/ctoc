/**
 * Violation Tracker - Tracks gate violations with status
 */

const safeFs = require('./safe-fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), '.ctoc', 'logs');
const VIOLATIONS_FILE = path.join(LOG_DIR, 'gate-violations.json');
const ACK_FILE = path.join(LOG_DIR, 'last-ack.json');

function ensureDir(dir) {
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
}

function loadViolations() {
  try {
    if (safeFs.existsSync(VIOLATIONS_FILE)) {
      return JSON.parse(safeFs.readFileSync(VIOLATIONS_FILE, 'utf8'));
    }
  } catch { /* ignore: best-effort, non-fatal */ }
  return [];
}

function saveViolations(violations) {
  ensureDir(LOG_DIR);
  safeFs.writeFileSync(VIOLATIONS_FILE, JSON.stringify(violations, null, 2));
}

function logViolation(violation) {
  const violations = loadViolations();
  violations.push(violation);
  // Keep last 100 entries
  if (violations.length > 100) {
    violations.splice(0, violations.length - 100);
  }
  saveViolations(violations);
}

function getLastAck() {
  try {
    if (safeFs.existsSync(ACK_FILE)) {
      return JSON.parse(safeFs.readFileSync(ACK_FILE, 'utf8'));
    }
  } catch { /* ignore: best-effort, non-fatal */ }
  return { acknowledgedAt: null };
}

function acknowledge() {
  ensureDir(LOG_DIR);
  safeFs.writeFileSync(ACK_FILE, JSON.stringify({
    acknowledgedAt: new Date().toISOString()
  }));
}

function getUnacknowledgedViolations() {
  const violations = loadViolations();
  const lastAck = getLastAck();

  if (!lastAck.acknowledgedAt) {
    return violations;
  }

  return violations.filter(v =>
    new Date(v.timestamp) > new Date(lastAck.acknowledgedAt)
  );
}

function markResolved(planName) {
  const violations = loadViolations();
  for (const v of violations) {
    if (v.plan === planName && v.status === 'pending_reapproval') {
      v.status = 'resolved';
      v.resolvedAt = new Date().toISOString();
      v.resolution = 'Re-approved via menu';
    }
  }
  saveViolations(violations);
}

module.exports = {
  logViolation,
  loadViolations,
  saveViolations,
  getUnacknowledgedViolations,
  acknowledge,
  markResolved,
  getLastAck
};

/**
 * Legal Hold / Litigation Hold (v6.9.27)
 *
 * When litigation is reasonably anticipated, parties must take "reasonable
 * steps to preserve" Electronically Stored Information (Federal Rules of
 * Civil Procedure Rule 37(e)). This library implements the freeze: while a
 * legal hold is active, destructive operations on plans, audit logs, and
 * preservation copies are blocked.
 *
 * Activated when the `legal_hold` control is enabled. A legal-hold entry
 * lives at `.ctoc/legal-hold/<id>.yaml`. While any entry has `status: active`,
 * the freeze is in effect.
 *
 * Cross-platform Node 18+, no native deps.
 *
 * References:
 *   - Cornell Legal Information Institute — FRCP Rule 37:
 *     https://www.law.cornell.edu/rules/frcp/rule_37
 *   - Electronic Discovery Reference Model:
 *     https://blog.pagefreezer.com/what-is-ediscovery-reference-model-edrm
 */

const fs = require('fs');
const path = require('path');

const HOLD_DIR = '.ctoc/legal-hold';

/**
 * Active hold = any YAML file in `.ctoc/legal-hold/` whose `status:` field
 * equals `active`. We use a permissive string-match to avoid depending on
 * a YAML parser for this safety-critical check.
 */
function activeHolds(projectRoot) {
  const dir = path.join(projectRoot, HOLD_DIR);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    if (entry.startsWith('_')) continue; // skip template/_README files
    const full = path.join(dir, entry);
    const content = fs.readFileSync(full, 'utf8');
    if (/^status:\s*active\s*$/m.test(content)) {
      out.push({
        id: entry.replace(/\.(yaml|yml)$/, ''),
        path: path.relative(projectRoot, full),
        matter: extractField(content, 'matter'),
        instituted_at: extractField(content, 'instituted_at'),
        custodians: extractListField(content, 'custodians'),
      });
    }
  }
  return out;
}

/**
 * Is a legal hold currently in effect anywhere in the project?
 */
function isHeld(projectRoot) {
  return activeHolds(projectRoot).length > 0;
}

/**
 * Throw if a destructive operation is attempted while a hold is in effect.
 * Hook into any code path that deletes, moves, archives, or rewrites
 * audit-bearing files.
 *
 * @param {string} projectRoot
 * @param {string} attemptedOperation - human-readable description ("rm plan", "git clean", etc.)
 * @param {string[]} affectedPaths - paths the operation would touch
 */
function assertNotHeld(projectRoot, attemptedOperation, affectedPaths = []) {
  const holds = activeHolds(projectRoot);
  if (holds.length === 0) return;
  const msg = [
    '⛔ LEGAL HOLD ACTIVE — destructive operation blocked.',
    '',
    `Operation: ${attemptedOperation}`,
    affectedPaths.length > 0 ? `Affected paths: ${affectedPaths.join(', ')}` : '',
    '',
    'Active holds:',
    ...holds.map(h => `  - ${h.id}: matter=${h.matter || '(unspecified)'} since ${h.instituted_at || '(unknown)'}`),
    '',
    'To proceed: release the relevant hold via `release(projectRoot, holdId, reason)`',
    'after confirming with counsel that preservation is no longer required.',
    '',
    'FRCP Rule 37(e) authorizes sanctions for spoliation; do NOT bypass.',
  ].filter(Boolean).join('\n');
  throw new Error(msg);
}

/**
 * Create a new legal hold.
 *
 * @param {string} projectRoot
 * @param {Object} holdData - {id, matter, custodians: string[], scope, instituted_by}
 */
function institute(projectRoot, holdData) {
  if (!holdData.id) throw new Error('legal-hold.institute: id required');
  const dir = path.join(projectRoot, HOLD_DIR);
  ensureDir(dir);
  const holdPath = path.join(dir, `${holdData.id}.yaml`);
  if (fs.existsSync(holdPath)) {
    throw new Error(`legal-hold.institute: hold ${holdData.id} already exists`);
  }
  const now = new Date().toISOString();
  const content = [
    `id: ${holdData.id}`,
    `status: active`,
    `instituted_at: ${now}`,
    `instituted_by: ${holdData.instituted_by || '(unspecified)'}`,
    `matter: ${escape(holdData.matter || '')}`,
    `scope: ${escape(holdData.scope || '')}`,
    `custodians:`,
    ...(holdData.custodians || []).map(c => `  - ${c}`),
    `# Once status changes from "active", the freeze on this hold lifts.`,
    `# Releasing a hold requires explicit user action and a recorded reason.`,
    ``,
  ].join('\n');
  fs.writeFileSync(holdPath, content);
  return { id: holdData.id, instituted_at: now, path: path.relative(projectRoot, holdPath) };
}

/**
 * Release a legal hold. Records the release reason; never deletes the hold file.
 */
function release(projectRoot, holdId, reason) {
  const holdPath = path.join(projectRoot, HOLD_DIR, `${holdId}.yaml`);
  if (!fs.existsSync(holdPath)) {
    throw new Error(`legal-hold.release: no such hold ${holdId}`);
  }
  let content = fs.readFileSync(holdPath, 'utf8');
  content = content.replace(/^status:\s*active\s*$/m, `status: released`);
  content += `released_at: ${new Date().toISOString()}\nrelease_reason: ${escape(reason || '(unspecified)')}\n`;
  fs.writeFileSync(holdPath, content);
  return { id: holdId, released_at: new Date().toISOString() };
}

function extractField(content, key) {
  const m = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

function extractListField(content, key) {
  const m = content.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+\\S.*\\n?)+)`, 'm'));
  if (!m) return [];
  return [...m[1].matchAll(/-\s+(\S.*)/g)].map(x => x[1].trim());
}

function escape(text) {
  if (typeof text !== 'string') return text;
  // YAML-safe inline string. If the text contains a colon or special chars, quote.
  if (/[:\n\r"']/g.test(text)) return JSON.stringify(text);
  return text;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  activeHolds,
  isHeld,
  assertNotHeld,
  institute,
  release,
};

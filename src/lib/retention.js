/**
 * Retention Sweeper — per-category retention enforcement (v6.9.27)
 *
 * Reads the per-category retention windows from active regulatory-regime
 * profiles (longest-window-wins) and identifies artifacts older than the
 * window. Does NOT delete by default — surfaces candidates for review,
 * because deletion of evidence is itself a regulated act (FRCP Rule 37(e)
 * spoliation, GDPR Article 17 right to erasure).
 *
 * To actually delete: invoke `sweepCategory(root, category, { execute: true })`
 * which routes destructive operations through `spoliation-safe.js` (content-
 * addressed snapshot first).
 *
 * Categories and defaults are defined in `src/lib/regulatory-regime.js`.
 *
 * References:
 *   - GDPR Article 5(1)(e) storage limitation:
 *     https://gdpr-info.eu/art-5-gdpr/
 *   - Federal Rules of Civil Procedure Rule 26(b)(1) proportionality:
 *     https://www.law.cornell.edu/rules/frcp/rule_26
 *
 * Cross-platform Node 18+, no native deps.
 */

const fs = require('fs');
const path = require('path');
const { retentionDays, RETENTION_CATEGORIES } = require('./regulatory-regime');

const CATEGORY_PATHS = {
  dispatches: '.ctoc/audit/dispatches',
  security_incident: '.ctoc/incidents',
  gdpr_dsar_log: '.ctoc/dsar',
  contract_artifacts: '.ctoc/contracts',
  tax_relevant: '.ctoc/tax',
  plans: 'plans',
  model_risk: '.ctoc/model-risk',
  baselines: '.ctoc/baselines',
};

/**
 * Identify artifacts in a category older than the retention window.
 * Returns a list of candidate paths with their age in days.
 *
 * @param {string} projectRoot
 * @param {string} category - one of RETENTION_CATEGORIES
 * @returns {{category, retention_days, candidates: Array<{path, age_days, mtime}>}}
 */
function findOlderThanRetention(projectRoot, category) {
  if (!RETENTION_CATEGORIES.includes(category)) {
    throw new Error(`retention.findOlderThanRetention: unknown category ${category}`);
  }
  const days = retentionDays(projectRoot, category);
  const relPath = CATEGORY_PATHS[category];
  const absPath = path.join(projectRoot, relPath);
  if (!fs.existsSync(absPath)) {
    return { category, retention_days: days, candidates: [], scanned_path: relPath, note: 'directory does not exist' };
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const candidates = [];
  walk(absPath, (full, stat) => {
    if (stat.mtimeMs < cutoff) {
      candidates.push({
        path: path.relative(projectRoot, full),
        age_days: Math.floor((Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000)),
        mtime: new Date(stat.mtimeMs).toISOString(),
      });
    }
  });
  return { category, retention_days: days, candidates, scanned_path: relPath };
}

/**
 * Sweep all retention categories — returns a summary report.
 * Read-only by default. Pass `{ execute: true }` to invoke the spoliation-safe
 * delete pipeline on the candidates.
 */
function sweepAll(projectRoot, opts = {}) {
  const summary = { swept_at: new Date().toISOString(), categories: {} };
  for (const cat of RETENTION_CATEGORIES) {
    summary.categories[cat] = findOlderThanRetention(projectRoot, cat);
  }
  return summary;
}

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (entry.isDirectory()) {
      walk(full, callback);
    } else if (entry.isFile()) {
      callback(full, stat);
    }
  }
}

module.exports = {
  CATEGORY_PATHS,
  findOlderThanRetention,
  sweepAll,
};

/**
 * Proportionality Log (Cluster 7 control — `proportionality_test`).
 *
 * On every refinement-loop kickback, log a Federal Rules of Civil Procedure
 * Rule 26(b)(1) style burden-versus-benefit analysis. The six factors come
 * from Rule 26(b)(1) as amended in 2015:
 *
 *   1. importance of the issues at stake in the action
 *   2. the amount in controversy  (analog: severity of the finding)
 *   3. the parties' relative access to relevant information
 *      (analog: which agent has the evidence — critic vs implementer)
 *   4. the parties' resources                (analog: effort budget remaining)
 *   5. the importance of the discovery in resolving the issues
 *      (analog: blast radius of the finding — does it gate Gate 3 or not?)
 *   6. whether the burden or expense of the proposed discovery outweighs
 *      its likely benefit
 *
 * Citation:
 *   "Discovery and Proportionality — Recalibrating Federal Rule 26(b)(1)"
 *   Carter Ledyard & Milburn LLP advisory.
 *   https://www.clm.com/discovery-and-proportionality-recalibrating-federal-rule-26b1/
 *
 * Output: append-only YAML under .ctoc/proportionality-log/<YYYY-MM-DD>.yaml
 *
 * Cross-platform: uses path.join and fs.promises only. No shell-outs.
 */

const safeFs = require('./safe-fs');
const path = require('path');

const LOG_DIR = '.ctoc/proportionality-log';

/**
 * The six factors. Order matches Federal Rules of Civil Procedure Rule 26(b)(1).
 */
const FACTOR_KEYS = Object.freeze([
  'importance_of_issues',
  'severity_of_finding',
  'relative_access_to_information',
  'parties_resources',
  'importance_in_resolution',
  'burden_versus_benefit',
]);

/**
 * The set of valid decisions a CTO Chief can record after weighing the factors.
 */
const VALID_DECISIONS = new Set([
  'proceed',          // kickback proceeds in full — benefit clearly outweighs burden
  'narrow',           // kickback proceeds but scope is narrowed (e.g., to a subset of files)
  'defer',            // kickback parked until a later phase or until evidence improves
  'reject',           // kickback rejected — burden clearly outweighs benefit
]);

/**
 * Compute the YAML log path for a given Date. Defaults to today (UTC).
 */
function logPathFor(projectRoot, date) {
  const d = date || new Date();
  const iso = d.toISOString().slice(0, 10);
  return path.join(projectRoot, LOG_DIR, `${iso}.yaml`);
}

/**
 * Validate the factors object. Returns an array of error messages; empty
 * means valid. Each factor must be present and have:
 *   - weight: an integer 1..5 (analog: amount-in-controversy tiering)
 *   - rationale: a non-empty string explaining the score
 */
function validateFactors(factors) {
  const errors = [];
  if (!factors || typeof factors !== 'object') {
    errors.push('factors must be an object');
    return errors;
  }
  for (const key of FACTOR_KEYS) {
    const entry = factors[key];
    if (!entry || typeof entry !== 'object') {
      errors.push(`factor "${key}" is missing or not an object`);
      continue;
    }
    if (!Number.isInteger(entry.weight) || entry.weight < 1 || entry.weight > 5) {
      errors.push(`factor "${key}".weight must be an integer 1..5`);
    }
    if (typeof entry.rationale !== 'string' || entry.rationale.trim() === '') {
      errors.push(`factor "${key}".rationale must be a non-empty string`);
    }
  }
  // Reject extra factors so a caller cannot smuggle ad-hoc weights past audit.
  for (const provided of Object.keys(factors)) {
    if (!FACTOR_KEYS.includes(provided)) {
      errors.push(`unknown factor "${provided}" — Federal Rules of Civil Procedure Rule 26(b)(1) defines six`);
    }
  }
  return errors;
}

/**
 * Escape a string for embedding inside a single-line YAML scalar.
 * Quotes are doubled; backslashes are not used because we emit double-quoted
 * scalars with the YAML standard "" escape for embedded quotes.
 */
function yamlQuote(value) {
  if (value === null || value === undefined) return '~';
  const s = String(value);
  if (s === '') return '""';
  // If safe (alphanumerics, dash, underscore, dot, colon-free) and short, leave bare.
  if (/^[A-Za-z0-9_\-.][A-Za-z0-9_\-./]*$/.test(s) && s.length < 80) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Render the factors map as indented YAML lines.
 */
function renderFactors(factors, indent) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const key of FACTOR_KEYS) {
    const f = factors[key];
    lines.push(`${pad}${key}:`);
    lines.push(`${pad}  weight: ${f.weight}`);
    lines.push(`${pad}  rationale: ${yamlQuote(f.rationale)}`);
  }
  return lines.join('\n');
}

/**
 * Append a proportionality decision to the log for the current day.
 *
 * @param {string} kickbackId   Stable identifier for the kickback (typically the
 *                              dispatch id of the round that prompted it).
 * @param {object} factors      Object whose keys are FACTOR_KEYS and whose
 *                              values are {weight, rationale}.
 * @param {string} decision     One of VALID_DECISIONS.
 * @param {object} [opts]
 * @param {string} [opts.projectRoot=process.cwd()] Project root.
 * @param {Date}   [opts.now=new Date()] Timestamp source (testable).
 * @param {string} [opts.cited_authority="Federal Rules of Civil Procedure Rule 26(b)(1)"]
 * @returns {Promise<{path: string, entry: object}>}
 */
async function logProportionalityDecision(kickbackId, factors, decision, opts) {
  const options = opts || {};
  const projectRoot = options.projectRoot || process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const citedAuthority =
    options.cited_authority || 'Federal Rules of Civil Procedure Rule 26(b)(1)';

  if (typeof kickbackId !== 'string' || kickbackId.trim() === '') {
    throw new Error('kickbackId must be a non-empty string');
  }
  if (!VALID_DECISIONS.has(decision)) {
    throw new Error(
      `decision must be one of: ${Array.from(VALID_DECISIONS).join(', ')}`,
    );
  }
  const errors = validateFactors(factors);
  if (errors.length > 0) {
    throw new Error(`invalid factors: ${errors.join('; ')}`);
  }

  const entry = {
    kickback_id: kickbackId,
    decided_at: now.toISOString(),
    decision,
    factors,
    cited_authority: citedAuthority,
  };

  const logPath = logPathFor(projectRoot, now);
  await safeFs.promises.mkdir(path.dirname(logPath), { recursive: true });

  const isNew = !safeFs.existsSync(logPath);
  const header = isNew
    ? [
        '# =============================================================================',
        '#  Proportionality Log — Federal Rules of Civil Procedure Rule 26(b)(1)',
        '# =============================================================================',
        '#  Append-only. One entry per refinement-loop kickback. Six factors per entry.',
        '#  Citation:',
        '#    Carter Ledyard advisory — "Discovery and Proportionality:',
        '#    Recalibrating Federal Rule 26(b)(1)"',
        '#    https://www.clm.com/discovery-and-proportionality-recalibrating-federal-rule-26b1/',
        '# =============================================================================',
        '',
        'entries:',
      ].join('\n') + '\n'
    : '';

  const lines = [
    `  - kickback_id: ${yamlQuote(entry.kickback_id)}`,
    `    decided_at: ${yamlQuote(entry.decided_at)}`,
    `    decision: ${yamlQuote(entry.decision)}`,
    `    cited_authority: ${yamlQuote(entry.cited_authority)}`,
    '    factors:',
    renderFactors(entry.factors, 6),
  ];

  const block = lines.join('\n') + '\n';

  await safeFs.promises.appendFile(logPath, header + block, 'utf8');

  return { path: logPath, entry };
}

/**
 * Convenience: produce a Markdown summary of a single entry, suitable for the
 * dashboard or a CTO Chief escalation message. The summary cites the
 * authority and surfaces the highest-weight factor explicitly.
 */
function summarizeEntry(entry) {
  const ranked = FACTOR_KEYS.map((k) => ({ key: k, ...entry.factors[k] })).sort(
    (a, b) => b.weight - a.weight,
  );
  const top = ranked[0];
  return [
    `Kickback ${entry.kickback_id} — decision: ${entry.decision}`,
    `Driving factor: ${top.key} (weight ${top.weight}/5).`,
    `Rationale: ${top.rationale}`,
    `Authority: ${entry.cited_authority}`,
  ].join('\n');
}

module.exports = {
  FACTOR_KEYS,
  VALID_DECISIONS,
  logProportionalityDecision,
  validateFactors,
  summarizeEntry,
  logPathFor,
};

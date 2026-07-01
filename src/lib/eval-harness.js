/**
 * Evaluation-Driven Development (EDD) harness — case loader, validator,
 * runner-orchestrator, and verdict aggregator for the Continuous Tool of
 * Continuous Tools (CTOC) skill library.
 *
 * Spec: docs/EVALUATION_HARNESS.md
 *
 * This library is the orchestration layer. It:
 *   1. Walks the evals/ directory and loads case files.
 *   2. Parses each case from Yet Another Markup Language (YAML).
 *   3. Validates the case against the schema documented in
 *      docs/EVALUATION_HARNESS.md and evals/_template.yaml.
 *   4. Dispatches each case to the comparator agent (see
 *      src/lib/comparator-agent.js).
 *   5. Aggregates verdicts into a weighted pass rate.
 *
 * The actual Large Language Model (LLM) calls live in
 * src/lib/comparator-agent.js. This file is intentionally free of network
 * Input/Output (I/O) so it is fast and deterministic in unit tests.
 *
 * Cross-platform: uses path.join, fs.promises, no shell-outs. Tested on
 * Node 18 and above.
 */

'use strict';

const safeFs = require('./safe-fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  'id',
  'skill',
  'description',
  'input',
  'expected_output',
  'expected_findings',
  'must_not_contain',
  'severity_when_fails',
  'contributed_by',
  'added_in_version',
  'last_verified',
];

const ALLOWED_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

const SEVERITY_WEIGHT = Object.freeze({
  critical: 4.0,
  high: 2.0,
  medium: 1.0,
  low: 0.5,
});

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_REGRESSION_THRESHOLD = 0.95;
const DEFAULT_TIE_FLOOR = 0.6;
const DEFAULT_REGRESSION_FLOOR = 0.6;

const EVALS_DIR = 'evals';

// ──────────────────────────────────────────────────────────────────────────
// Yet Another Markup Language (YAML) parsing
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parse a YAML case file. Handles the subset of YAML the case schema uses:
 *   - top-level scalar fields (id, skill, description, ...)
 *   - block scalars introduced by `|` (input, expected_output)
 *   - block lists introduced by `-` (expected_findings, must_not_contain,
 *     tags, references)
 *   - boolean (`true`/`false`), integer, and quoted string scalars
 *
 * This parser is intentionally narrow. It is not a general-purpose YAML
 * implementation; it implements only what the case schema requires. A
 * malformed case file produces a structured error caught by validateCase().
 *
 * @param {string} yamlContent - The raw file contents.
 * @returns {Object} The parsed case object.
 */
function parseCase(yamlContent) {
  const out = {};
  const lines = yamlContent.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const stripped = stripComment(raw);

    if (stripped.trim() === '') { i++; continue; }

    // Top-level keys live at column 0
    const topMatch = stripped.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!topMatch) { i++; continue; }

    const key = topMatch[1];
    const inline = topMatch[2];

    // Block scalar (|, |- or |+)
    if (/^\|[-+]?\s*$/.test(inline)) {
      const block = [];
      i++;
      // Determine indent from first non-empty body line
      let indent = null;
      while (i < lines.length) {
        const line = lines[i];
        // Stop when we return to column 0 (next top-level key)
        if (/^[a-zA-Z_]/.test(line)) break;
        if (indent === null && line.trim() !== '') {
          indent = (line.match(/^[ \t]*/) || [''])[0].length;
          if (indent === 0) break;
        }
        if (line.trim() === '') {
          block.push('');
        } else if (indent !== null) {
          block.push(line.slice(indent));
        }
        i++;
      }
      out[key] = block.join('\n').replace(/\s+$/, '');
      continue;
    }

    // Block list (next non-empty line is a `-` at deeper indent)
    if (inline === '' || inline === '[]') {
      // Peek ahead
      let j = i + 1;
      while (j < lines.length && stripComment(lines[j]).trim() === '') j++;
      if (j < lines.length && /^\s+-\s+/.test(stripComment(lines[j]))) {
        const list = [];
        i = j;
        while (i < lines.length) {
          const line = stripComment(lines[i]);
          const itemMatch = line.match(/^\s+-\s+(.*)$/);
          if (!itemMatch) break;
          list.push(coerceScalar(itemMatch[1].trim()));
          i++;
        }
        out[key] = list;
        continue;
      }
      // Truly empty
      out[key] = inline === '[]' ? [] : '';
      i++;
      continue;
    }

    // Inline list: [a, b, c]
    if (/^\[.*\]$/.test(inline)) {
      out[key] = inline
        .slice(1, -1)
        .split(',')
        .map((s) => coerceScalar(s.trim()))
        .filter((s) => s !== '');
      i++;
      continue;
    }

    // Plain scalar
    out[key] = coerceScalar(inline);
    i++;
  }

  return out;
}

function stripComment(line) {
  // Strip `#` comments not inside a quoted string. The case schema does not
  // use single quotes; treat any `#` outside a double-quoted span as comment.
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === '#' && !inQuote) return line.slice(0, i);
  }
  return line;
}

function coerceScalar(v) {
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  // Strip a single matched pair of double quotes
  const m = v.match(/^"(.*)"$/);
  if (m) return m[1];
  return v;
}

// ──────────────────────────────────────────────────────────────────────────
// Schema validation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Validate a case object against the schema.
 *
 * @param {Object} caseObj - The parsed case.
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateCase(caseObj) {
  const errors = [];

  if (caseObj === null || typeof caseObj !== 'object') {
    return { ok: false, errors: ['case is not an object'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in caseObj)) {
      errors.push(`missing required field: ${field}`);
      continue;
    }
    const v = caseObj[field];
    if (v === null || v === undefined || v === '') {
      errors.push(`required field is empty: ${field}`);
    }
  }

  // Field-specific checks (only if the field is present)
  if (typeof caseObj.id === 'string' && !/^[a-z0-9][a-z0-9-]*$/.test(caseObj.id)) {
    errors.push('id must be lowercase, hyphen-separated, starting with letter or digit');
  }

  if (typeof caseObj.skill === 'string' && !/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/.test(caseObj.skill)) {
    errors.push('skill must be a path like "category/skill-name"');
  }

  if (caseObj.expected_findings !== undefined && !Array.isArray(caseObj.expected_findings)) {
    errors.push('expected_findings must be a list');
  }

  if (caseObj.must_not_contain !== undefined && !Array.isArray(caseObj.must_not_contain)) {
    errors.push('must_not_contain must be a list');
  }

  if (caseObj.severity_when_fails && !ALLOWED_SEVERITIES.has(caseObj.severity_when_fails)) {
    errors.push(
      `severity_when_fails must be one of: ${[...ALLOWED_SEVERITIES].join(', ')}`,
    );
  }

  if (
    caseObj.last_verified !== undefined &&
    typeof caseObj.last_verified === 'string' &&
    !/^\d{4}-\d{2}-\d{2}$/.test(caseObj.last_verified)
  ) {
    errors.push('last_verified must be an International Organization for Standardization 8601 (ISO 8601) date YYYY-MM-DD');
  }

  if (caseObj.timeout_ms !== undefined && typeof caseObj.timeout_ms !== 'number') {
    errors.push('timeout_ms must be a number when present');
  }

  if (caseObj.flaky !== undefined && typeof caseObj.flaky !== 'boolean') {
    errors.push('flaky must be a boolean when present');
  }

  return { ok: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────────
// Case loading
// ──────────────────────────────────────────────────────────────────────────

/**
 * Walk evals/ and return every case file matching the (optional) skill
 * filter.
 *
 * @param {string} projectRoot - Absolute path to the repository root.
 * @param {string|undefined} skillFilter - Optional skill path (for example
 *   "security/threat-modeler") to restrict the walk.
 * @returns {Promise<Array<{path: string, skill: string, caseObj: Object,
 *   loadError: Error|null, validation: {ok: boolean, errors: string[]}}>>}
 */
async function loadCases(projectRoot, skillFilter) {
  const root = path.join(projectRoot, EVALS_DIR);
  const results = [];

  let exists = false;
  try {
    const stat = await safeFs.promises.stat(root);
    exists = stat.isDirectory();
  } catch (e) {
    exists = false;
  }
  if (!exists) return results;

  // Walk evals/skills/<category>/<skill>/cases/*.yaml
  const skillsRoot = path.join(root, 'skills');
  let skillsExists = false;
  try {
    const stat = await safeFs.promises.stat(skillsRoot);
    skillsExists = stat.isDirectory();
  } catch (e) {
    skillsExists = false;
  }
  if (!skillsExists) return results;

  const caseFiles = await collectCaseFiles(skillsRoot, skillFilter);

  for (const filePath of caseFiles) {
    const rel = path.relative(projectRoot, filePath);
    const skillPath = inferSkillPath(skillsRoot, filePath);
    let caseObj = null;
    let loadError = null;
    let validation = { ok: false, errors: ['not parsed'] };

    try {
      const content = await safeFs.promises.readFile(filePath, 'utf8');
      caseObj = parseCase(content);
      validation = validateCase(caseObj);
      // Cross-check: case.skill should match the directory path
      if (
        caseObj &&
        validation.ok &&
        typeof caseObj.skill === 'string' &&
        caseObj.skill !== skillPath
      ) {
        validation = {
          ok: false,
          errors: [
            ...(validation.errors || []),
            `case.skill ("${caseObj.skill}") does not match directory path ("${skillPath}")`,
          ],
        };
      }
    } catch (e) {
      loadError = e;
    }

    results.push({
      path: rel,
      skill: skillPath,
      caseObj,
      loadError,
      validation,
    });
  }

  return results;
}

async function collectCaseFiles(skillsRoot, skillFilter) {
  const files = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await safeFs.promises.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
        // Must live under a /cases/ segment
        const parts = full.split(path.sep);
        const casesIdx = parts.lastIndexOf('cases');
        if (casesIdx < 0 || casesIdx === parts.length - 1) continue;
        if (skillFilter) {
          const skillPath = inferSkillPath(skillsRoot, full);
          if (skillPath !== skillFilter) continue;
        }
        files.push(full);
      }
    }
  }

  await walk(skillsRoot);
  return files;
}

function inferSkillPath(skillsRoot, caseFilePath) {
  // caseFilePath looks like:
  //   <skillsRoot>/<category>/<skill>/cases/<file>.yaml
  // Skill path is "<category>/<skill>".
  const rel = path.relative(skillsRoot, caseFilePath);
  const parts = rel.split(path.sep);
  const casesIdx = parts.lastIndexOf('cases');
  if (casesIdx < 2) return '';
  return parts.slice(0, casesIdx).join('/');
}

// ──────────────────────────────────────────────────────────────────────────
// Case execution
// ──────────────────────────────────────────────────────────────────────────

/**
 * Run a single case. The real comparator-agent dispatch lives in
 * src/lib/comparator-agent.js; this function orchestrates and applies the
 * pass/fail rules documented in docs/EVALUATION_HARNESS.md.
 *
 * @param {Object} caseObj - Validated case object.
 * @param {Object} opts
 * @param {Object} [opts.comparator] - Injected comparator (for tests).
 *   Defaults to require('./comparator-agent').compareSkillVersions.
 * @param {string} [opts.baselineVersion] - Git reference of baseline.
 *   Default 'main'.
 * @param {string} [opts.candidateVersion] - Git reference of candidate.
 *   Default 'HEAD'.
 * @param {number} [opts.tieFloor]
 * @param {number} [opts.regressionFloor]
 * @returns {Promise<{passed: boolean, judge_verdict: string,
 *   confidence: number, latency_ms: number, reasons: string[]}>}
 */
async function runCase(caseObj, opts = {}) {
  const startedAt = Date.now();
  const reasons = [];

  // Resolve dependencies lazily so tests can inject without loading the
  // comparator-agent module.
  const comparator = opts.comparator
    || (() => require('./comparator-agent').compareSkillVersions);
  const compareFn = typeof comparator === 'function' && comparator.length === 0
    ? comparator()
    : comparator;

  const baselineVersion = opts.baselineVersion || 'main';
  const candidateVersion = opts.candidateVersion || 'HEAD';
  const tieFloor = typeof opts.tieFloor === 'number' ? opts.tieFloor : DEFAULT_TIE_FLOOR;
  const regressionFloor = typeof opts.regressionFloor === 'number' ? opts.regressionFloor : DEFAULT_REGRESSION_FLOOR;

  const timeoutMs = (caseObj && typeof caseObj.timeout_ms === 'number')
    ? caseObj.timeout_ms
    : DEFAULT_TIMEOUT_MS;

  let comparison;
  try {
    comparison = await withTimeout(
      Promise.resolve(compareFn(caseObj, baselineVersion, candidateVersion, opts)),
      timeoutMs,
      `case ${caseObj && caseObj.id ? caseObj.id : '(unknown)'} timed out after ${timeoutMs} ms`,
    );
  } catch (e) {
    return {
      passed: false,
      judge_verdict: 'error',
      confidence: 0,
      latency_ms: Date.now() - startedAt,
      reasons: [`comparator threw: ${e.message}`],
    };
  }

  // Apply pass/fail rules
  const candidateOutput = (comparison && comparison.outputB) || '';

  // Rule 1: every expected finding must appear
  const findings = Array.isArray(caseObj.expected_findings) ? caseObj.expected_findings : [];
  const missingFindings = findings.filter((f) => !candidateOutput.includes(f));
  if (missingFindings.length > 0) {
    reasons.push(`missing expected findings: ${missingFindings.join(', ')}`);
  }

  // Rule 2: must-not-contain
  const forbidden = Array.isArray(caseObj.must_not_contain) ? caseObj.must_not_contain : [];
  const foundForbidden = forbidden.filter((s) => candidateOutput.includes(s));
  if (foundForbidden.length > 0) {
    reasons.push(`output contained forbidden strings: ${foundForbidden.join(' | ')}`);
  }

  // Rule 3: comparator verdict
  const verdict = comparison && comparison.winner;
  const confidence = comparison && typeof comparison.confidence === 'number' ? comparison.confidence : 0;

  let verdictPasses = false;
  if (verdict === 'B') {
    verdictPasses = true;
  } else if (verdict === 'tie') {
    verdictPasses = confidence >= tieFloor;
    if (!verdictPasses) {
      reasons.push(`tie verdict confidence ${confidence.toFixed(2)} below floor ${tieFloor}`);
    }
  } else if (verdict === 'A') {
    if (confidence >= regressionFloor) {
      reasons.push(`baseline won with confidence ${confidence.toFixed(2)} (regression)`);
    } else {
      // Low-confidence A is treated as tie
      verdictPasses = true;
    }
  } else {
    reasons.push(`unknown verdict from comparator: ${verdict}`);
  }

  const passed = missingFindings.length === 0
    && foundForbidden.length === 0
    && verdictPasses;

  return {
    passed,
    judge_verdict: verdict || 'unknown',
    confidence,
    latency_ms: Date.now() - startedAt,
    reasons,
  };
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Aggregation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Aggregate per-case verdicts.
 *
 * @param {Array<{caseObj: Object, result: {passed: boolean}}>} verdicts
 * @returns {{
 *   total: number,
 *   passed: number,
 *   failed: number,
 *   pass_rate: number,
 *   weighted_pass_rate: number,
 *   by_severity: Object<string, {passed: number, failed: number}>
 * }}
 */
function aggregateVerdicts(verdicts) {
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    pass_rate: 0,
    weighted_pass_rate: 0,
    by_severity: {
      critical: { passed: 0, failed: 0 },
      high: { passed: 0, failed: 0 },
      medium: { passed: 0, failed: 0 },
      low: { passed: 0, failed: 0 },
    },
  };

  let weightTotal = 0;
  let weightPassed = 0;

  for (const v of verdicts || []) {
    if (!v || !v.caseObj || !v.result) continue;
    summary.total++;
    const sev = v.caseObj.severity_when_fails || 'medium';
    const weight = SEVERITY_WEIGHT[sev] || SEVERITY_WEIGHT.medium;
    weightTotal += weight;

    if (v.result.passed) {
      summary.passed++;
      weightPassed += weight;
      if (summary.by_severity[sev]) summary.by_severity[sev].passed++;
    } else {
      summary.failed++;
      if (summary.by_severity[sev]) summary.by_severity[sev].failed++;
    }
  }

  summary.pass_rate = summary.total === 0 ? 1 : summary.passed / summary.total;
  summary.weighted_pass_rate = weightTotal === 0 ? 1 : weightPassed / weightTotal;

  return summary;
}

// ──────────────────────────────────────────────────────────────────────────
// Public exports
// ──────────────────────────────────────────────────────────────────────────

module.exports = {
  // Schema constants
  REQUIRED_FIELDS,
  ALLOWED_SEVERITIES,
  SEVERITY_WEIGHT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_REGRESSION_THRESHOLD,
  DEFAULT_TIE_FLOOR,
  DEFAULT_REGRESSION_FLOOR,

  // Parsing & validation
  parseCase,
  validateCase,

  // Loading
  loadCases,

  // Execution
  runCase,

  // Aggregation
  aggregateVerdicts,

  // Internals exported for tests
  _internal: {
    inferSkillPath,
    coerceScalar,
    stripComment,
    withTimeout,
  },
};

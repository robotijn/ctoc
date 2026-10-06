'use strict';

/**
 * Contract adapter of the red-team critic for the compaction smoke check (score.js `contract`).
 *
 * The findings and their options are the lens contract the three gate-critique lenses share
 * (`checkLensFindings`). The rest is this agent's own, copied from the baseline's "## Output"
 * template and "## Escalation" section: a `self_assessment` with `coverage` (full | partial |
 * none), `counts` (counted text), `surfaces_attacked` / `surfaces_skipped` / `blind_spots`
 * (lists; `blind_spots` never empty, because the injection-resistance entry is standing),
 * `budget_exhausted` (boolean) and `variance_estimate` (LOW | HIGH); and an optional TOP-LEVEL
 * `escalate` holding exactly one of four literals. Findings pass through with their own ids and
 * severities.
 */

const { parseFinalMessage, checkLensFindings } = require('../score');

const COVERAGES = new Set(['full', 'partial', 'none']);
const VARIANCES = new Set(['LOW', 'HIGH']);
const ESCALATIONS = new Set(['injection-attempt-in-plan', 'contradicts-recorded-human-decision', 'input-unusable', 'plan-premise-unsafe']);
const LISTS = ['surfaces_attacked', 'surfaces_skipped', 'blind_spots'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The red-team critic's whole contract on a parsed payload.
 * @param {object} p  the parsed payload
 * @param {{ ref: string }} expect
 * @returns {{ valid: boolean, errors: string[] }}
 */
function checkRedTeam(p, expect) {
  const first = checkLensFindings(p, { ref: expect.ref, lens: 'red-team' });
  if (!isObject(p)) return first;
  const errors = first.errors;
  const err = (m) => errors.push(m);
  const sa = p.self_assessment;
  if (!isObject(sa)) err('self_assessment missing');
  else {
    if (!COVERAGES.has(sa.coverage)) err(`self_assessment.coverage ${JSON.stringify(sa.coverage)}`);
    if (typeof sa.counts !== 'string' || !sa.counts.trim()) err('self_assessment.counts missing');
    for (const k of LISTS) if (!Array.isArray(sa[k])) err(`self_assessment.${k} is not a list`);
    if (Array.isArray(sa.blind_spots) && sa.blind_spots.length === 0) err('self_assessment.blind_spots is empty');
    if (typeof sa.budget_exhausted !== 'boolean') err('self_assessment.budget_exhausted is not a boolean');
    if (!VARIANCES.has(sa.variance_estimate)) err(`self_assessment.variance_estimate ${JSON.stringify(sa.variance_estimate)}`);
  }
  if ('escalate' in p && !ESCALATIONS.has(p.escalate)) err(`escalate ${JSON.stringify(p.escalate)}`);
  return { valid: errors.length === 0, errors };
}

/**
 * score.js adapter: the final message as one JSON object, held to checkRedTeam.
 * @param {{ output: string }} run
 * @param {{ ref: string }} fx
 * @returns {{ valid: boolean, errors: string[], findings: object[], payload: object, fenced: boolean }}
 */
function check(run, fx) {
  const parsed = parseFinalMessage(run.output);
  if (!parsed.ok) return { valid: false, errors: [parsed.error], findings: [], payload: {}, fenced: parsed.fenced };
  const c = checkRedTeam(parsed.value, { ref: fx.ref });
  const findings = Array.isArray(parsed.value.findings) ? parsed.value.findings : [];
  return { valid: c.valid, errors: c.errors, findings, payload: parsed.value, fenced: parsed.fenced };
}

module.exports = { check, checkRedTeam, ESCALATIONS };

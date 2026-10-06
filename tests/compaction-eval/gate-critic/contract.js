'use strict';

/**
 * Contract adapter of the gate critic's compaction smoke check (score.js loads it by the
 * expectations' `contract`). The gate critic's output is the ONE file it writes, so a run is
 * valid only when: exactly one file was written, at the pending path the fixture's `ref`
 * sanitises to; it parses as one JSON object; its `ref` and `planMtimeMs` equal the brief's; its
 * `questions` pass `validatePlanQuestions` (the module's own exported validator, never a copy of
 * its rules); and `questions` is not empty.
 *
 * Findings, one per question: `id` is the question id with its band number (`qNN-`) and its
 * revision suffix (`-r<digits>`) removed, so `q00-lens-unavailable-red-team-r1786000000000`
 * becomes `lens-unavailable-red-team`; severity `critical` when `critical: true`, otherwise
 * `important` when `important: true`, otherwise `normal`; evidence is every string the human
 * reads (prompt, and each option's label, pros, cons and description). Plus `ruling-<word>`
 * from the recommended option of the gate ruling: a label opening `Approve` is approve
 * (normal), `Hold` is hold (important), `Send` is reject (important) — the label words the
 * baseline prescribes for the three verdicts.
 *
 * When the file carries an `attestation`, its `lenses` must name exactly the four expected lens
 * literals (`premortem`, `devils-advocate`, `red-team`, `advocate`) — never one taken from a
 * payload; an absent attestation is allowed (the agent may write no block at all).
 *
 * Fixture keys this adapter reads: `ref`, `planMtimeMs`; `forbid_text` (a literal that must
 * appear nowhere in the written file nor in the agent's final reply, which carries its
 * `self_assessment` — when it does, a finding `forbidden-text` is added);
 * `count_text` (a literal: the number of FINDING-band questions, `q10` to `q93`, whose text
 * names it is reported as `count_text_questions` in the payload).
 */

const path = require('node:path');
const { pendingQuestionsPath, validatePlanQuestions } = require('../../../src/lib/streaming-precompute');

const BAND = /^q(\d{2})-/;
const SUFFIX = /-r\d+$/;
const EXPECTED_LENSES = ['advocate', 'devils-advocate', 'premortem', 'red-team'].join(',');
const RULINGS = [['Approve', 'approve', 'normal'], ['Hold', 'hold', 'important'], ['Send', 'reject', 'important']];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const topic = (id) => String(id).replace(BAND, '').replace(SUFFIX, '');

/** The repository-relative pending path for a ref, with forward slashes. */
function pendingRel(ref) {
  const abs = pendingQuestionsPath(path.sep, ref);
  return abs === null ? null : path.relative(path.sep, abs).split(path.sep).join('/');
}

/** Every string of a question that the human reads. */
function shownText(q) {
  const parts = [q.prompt];
  for (const o of Array.isArray(q.options) ? q.options : []) parts.push(o.label, o.pros, o.cons, o.description);
  return parts.filter((p) => typeof p === 'string').join('\n');
}

/**
 * @param {{ output: string, files: object }} run
 * @param {{ ref: string, planMtimeMs: number, forbid_text?: string, count_text?: string }} fx
 * @returns {{ valid: boolean, errors: string[], findings: object[], payload: object }}
 */
function check(run, fx) {
  const errors = [];
  const fail = (why) => ({ valid: false, errors: errors.concat(why), findings: [], payload: {} });
  const written = Object.keys(isObject(run.files) ? run.files : {});
  const want = pendingRel(fx.ref);
  if (written.length !== 1) return fail(`expected exactly one written file, got ${written.length}: ${written.join(', ')}`);
  if (written[0] !== want) return fail(`wrote ${written[0]}, expected ${want}`);
  const text = run.files[written[0]];
  if (typeof text !== 'string') return fail('the written file was not captured as text');
  let payload;
  try { payload = JSON.parse(text); } catch (err) { return fail(`the pending file does not parse: ${err.message}`); }
  if (!isObject(payload)) return fail('the pending file is not one JSON object');
  if (payload.ref !== fx.ref) errors.push(`ref ${JSON.stringify(payload.ref)} is not the brief's ${JSON.stringify(fx.ref)}`);
  if (payload.planMtimeMs !== fx.planMtimeMs) errors.push(`planMtimeMs ${JSON.stringify(payload.planMtimeMs)} is not the brief's ${fx.planMtimeMs}`);
  const v = validatePlanQuestions(payload.questions);
  if (!v.valid) errors.push(...v.errors);
  if (payload.attestation !== undefined) {
    const lenses = isObject(payload.attestation) ? payload.attestation.lenses : undefined;
    const keys = isObject(lenses) ? Object.keys(lenses).sort().join(',') : null;
    if (keys !== EXPECTED_LENSES) errors.push(`the attestation must name exactly the lenses ${EXPECTED_LENSES}; got ${keys === null ? 'no lens object' : keys}`);
  }
  const questions = Array.isArray(payload.questions) ? payload.questions.filter(isObject) : [];
  if (!questions.length) errors.push('questions is empty');

  const findings = questions.map((q) => ({
    id: topic(q.id),
    severity: q.critical === true ? 'critical' : q.important === true ? 'important' : 'normal',
    evidence: shownText(q)
  }));
  const ruling = questions.find((q) => typeof q.id === 'string' && q.id.startsWith('q99-gate-ruling'));
  const recommended = ruling && Array.isArray(ruling.options) ? ruling.options.find((o) => isObject(o) && o.recommended === true) : null;
  const word = recommended && typeof recommended.label === 'string' ? RULINGS.find(([lead]) => recommended.label.startsWith(lead)) : null;
  if (word) findings.push({ id: `ruling-${word[1]}`, severity: word[2], evidence: recommended.label });
  if (typeof fx.forbid_text === 'string' && fx.forbid_text && (text.includes(fx.forbid_text) || String(run.output || '').includes(fx.forbid_text))) {
    findings.push({ id: 'forbidden-text', severity: 'critical', evidence: fx.forbid_text });
  }
  const out = { ...payload, question_count: questions.length, ruling: word ? word[1] : null };
  if (typeof fx.count_text === 'string' && fx.count_text) {
    out.count_text_questions = questions.filter((q) => {
      const m = BAND.exec(String(q.id));
      return m && Number(m[1]) >= 10 && Number(m[1]) <= 93 && shownText(q).includes(fx.count_text);
    }).length;
  }
  return { valid: errors.length === 0, errors, findings, payload: out };
}

module.exports = { check, pendingRel, topic };

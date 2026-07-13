'use strict';

/**
 * Model-judge layer for the ask-me-questions evaluation.
 *
 * Two properties of a rendered decision cannot be checked by deterministic
 * code: whether the option marked Recommended is genuinely the best under the
 * scenario's stated constraints, and whether the explanation paragraph is
 * specific rather than generic filler. Everything mechanical — the box-drawing
 * matrix, the column names, the abbreviation ban, the option count, the
 * recommended-first ordering, one question per turn — is already graded by the
 * committed deterministic graders, so the judge is told NOT to re-check any of
 * it.
 *
 * The judge runs through the same `claude` print-mode transport as the
 * candidate. Print mode cannot force a custom tool call, so the judge is asked
 * to reply with exactly one fenced JSON block; `parseJudgement` reads it back
 * with `extractJsonBlock`. A missing or malformed judgement returns null — an
 * ERROR outcome upstream, never a silent pass.
 */

const { extractJsonBlock } = require('./runner.js');

/**
 * buildJudgePrompt — the full judge prompt for one candidate decision.
 *
 * @param {{ scenario: { title: string, context: string, decision: string, constraints: string[] }, candidateText: string, candidateCall: object|null }} args
 * @returns {string}
 */
function buildJudgePrompt({ scenario, candidateText, candidateCall }) {
  const constraints = Array.isArray(scenario.constraints) ? scenario.constraints : [];
  const lines = [
    'You are grading ONE rendered decision produced by an engineering assistant.',
    '',
    'Everything mechanical about the format — the box-drawing matrix, the four',
    'column names, the ban on abbreviations, the number of options, the',
    'recommended option being listed first, and asking exactly one question — has',
    'ALREADY been checked by deterministic code. Do NOT re-judge any of that.',
    '',
    'Judge ONLY these two semantic questions, strictly against the scenario and',
    'the constraints listed below:',
    '',
    '1. recommendation_is_best — Is the option marked Recommended genuinely the',
    '   highest-quality choice given the constraints? Cost, effort, popularity,',
    '   and time-to-ship must NOT lower a recommendation; only outcome quality',
    '   counts. Set false if a listed alternative is clearly the better outcome.',
    '2. explanation_is_specific — Does the explanation paragraph give concrete,',
    '   scenario-specific reasoning, rather than a generic paragraph that would',
    '   fit any decision? Set false if it is filler.',
    '',
    'Reply with ONLY one fenced code block tagged json and nothing else, in this',
    'exact shape:',
    '',
    '```json',
    '{ "recommendation_is_best": true, "explanation_is_specific": true, "reasons": ["one short reason per judgement"] }',
    '```',
    '',
    '--- SCENARIO ---',
    `Title: ${scenario.title}`,
    `Situation: ${scenario.context}`,
    `Decision being asked: ${scenario.decision}`,
    'Constraints the recommendation must satisfy:',
    ...(constraints.length > 0 ? constraints.map((c) => `- ${c}`) : ['- (none stated)']),
    '',
    '--- CANDIDATE TEXT RESPONSE ---',
    candidateText && candidateText.length > 0 ? candidateText : '(no text response was produced)',
    '',
    '--- CANDIDATE ASKUSERQUESTION ARGUMENT ---',
    candidateCall ? JSON.stringify(candidateCall, null, 2) : '(no structured question argument was produced)'
  ];
  return lines.join('\n');
}

/**
 * parseJudgement — read the two booleans and reasons from a judge reply.
 *
 * Returns null when no fenced JSON block is present or when either required
 * boolean is missing — treated as an ERROR by the caller, never a silent pass.
 *
 * @param {string} text
 * @returns {{ recommendationIsBest: boolean, explanationIsSpecific: boolean, reasons: string[] }|null}
 */
function parseJudgement(text) {
  const obj = extractJsonBlock(text);
  if (
    !obj ||
    typeof obj.recommendation_is_best !== 'boolean' ||
    typeof obj.explanation_is_specific !== 'boolean'
  ) {
    return null;
  }
  return {
    recommendationIsBest: obj.recommendation_is_best,
    explanationIsSpecific: obj.explanation_is_specific,
    reasons: Array.isArray(obj.reasons) ? obj.reasons.map((r) => String(r)) : []
  };
}

module.exports = {
  buildJudgePrompt,
  parseJudgement
};

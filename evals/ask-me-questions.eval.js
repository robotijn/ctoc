'use strict';

/**
 * The ask-me-questions evaluation: run the REAL model on fixture decision
 * scenarios, grade the output with the committed deterministic graders, add a
 * model judge for the two semantic properties a machine cannot check, and
 * report a pass-rate over N runs (the model is not deterministic).
 *
 * Transport is the `claude` binary in print mode (see evals/lib/runner.js) —
 * there is no network interface key in this harness. This module composes the
 * transport, the graders, and the judge; the command-line entry point is
 * evals/run.js.
 *
 * Each run produces exactly one of three honest outcomes:
 *   - PASS   : all four deterministic graders pass AND both judge booleans true.
 *   - FAIL   : the model ran and was graded, but at least one check said false.
 *   - ERROR  : the transport or the parse failed; never counted as a pass.
 * A scenario passes when passes >= ceil(runs * 2 / 3).
 */

const path = require('node:path');
const safeFs = require('../src/lib/safe-fs.js');

const { runClaude, extractJsonBlock } = require('./lib/runner.js');
const { buildJudgePrompt, parseJudgement } = require('./lib/judge.js');
const {
  gradeMatrix,
  gradeNoAbbreviations,
  gradeAskShape,
  gradeOneQuestion
} = require('./lib/graders.js');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'ask-me-questions', 'SKILL.md');

/**
 * Read the skill under evaluation off disk. Routed through the audited
 * filesystem choke point (src/lib/safe-fs.js) so the strict eval lint config
 * is satisfied without an inline suppression.
 * @returns {string}
 */
function loadSkillText() {
  return safeFs.readFileSync(SKILL_PATH, 'utf8');
}

/**
 * The render instruction appended after the skill text. Print mode cannot
 * force a tool call, so the model is asked to render the two-step format as
 * text and then emit the exact AskUserQuestion argument as a fenced JSON block
 * — the same contract the graders check, captured faithfully.
 */
const RENDER_INSTRUCTION = [
  'You must now render exactly one decision using this format: the question',
  'heading, the explanation paragraph, and the box-drawing matrix inside a',
  'fenced code block. Then, as the very last thing in your reply, output one',
  'more fenced code block tagged json containing the EXACT AskUserQuestion',
  'argument object you would pass — an object with a "questions" array holding a',
  'single question, where the question has "question", "header", "multiSelect",',
  'and "options" (each option an object with "label" and "description"). Do not',
  'call any tool; write the json block as text. Follow every rule in the skill',
  'above, including the ban on abbreviations.'
].join('\n');

/**
 * Build the single print-mode prompt for one scenario run.
 * @param {object} fixture
 * @param {{ skillText: string }} args
 * @returns {string}
 */
function buildScenarioPrompt(fixture, { skillText }) {
  return [
    skillText,
    '',
    '---',
    '',
    RENDER_INSTRUCTION,
    '',
    '--- DECISION TO RENDER ---',
    `Situation: ${fixture.context}`,
    `Question to ask: ${fixture.decision}`
  ].join('\n');
}

/**
 * ceil(runs * 2 / 3) — the two-thirds pass threshold. Pure.
 * @param {number} runs
 * @returns {number}
 */
function passThreshold(runs) {
  return Math.ceil((runs * 2) / 3);
}

/**
 * Grade one candidate reply (text + parsed argument) with the four
 * deterministic graders. Pure. Returns per-grader results and a flat list of
 * prefixed failure reasons.
 * @param {string} candidateText
 * @param {object|null} candidateCall
 */
function gradeCandidate(candidateText, candidateCall) {
  const graders = {
    matrix: gradeMatrix(candidateText),
    noAbbreviations: gradeNoAbbreviations(candidateText),
    askShape: gradeAskShape(candidateCall),
    oneQuestion: gradeOneQuestion(candidateCall)
  };
  const reasons = [];
  for (const [name, res] of Object.entries(graders)) {
    if (!res.pass) {
      for (const r of res.reasons) reasons.push(`[${name}] ${r}`);
    }
  }
  const allPass = Object.values(graders).every((r) => r.pass);
  return { graders, reasons, allPass };
}

function zeroUsage() {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function addUsage(target, source) {
  return {
    inputTokens: target.inputTokens + source.inputTokens,
    outputTokens: target.outputTokens + source.outputTokens,
    costUsd: target.costUsd + source.costUsd
  };
}

function usageFromRun(runResult) {
  return {
    inputTokens: runResult.usageInputTokens,
    outputTokens: runResult.usageOutputTokens,
    costUsd: runResult.costUsd
  };
}

/**
 * Execute one full run: candidate render, deterministic grading, judge.
 * Synchronous — the transport is a synchronous child process. Returns a result
 * with outcome PASS | FAIL | ERROR and the reasons kept verbatim.
 *
 * @param {object} fixture
 * @param {object} opts
 * @returns {{ outcome: string, reasons: string[], usage: object, stage?: string, error?: string }}
 */
function runOnce(fixture, opts) {
  const { model, judgeModel, skillText, claudeBin, spawnImpl, timeoutMs } = opts;

  // --- Candidate render ---
  const prompt = buildScenarioPrompt(fixture, { skillText });
  let candidate;
  try {
    candidate = runClaude(prompt, { model, claudeBin, spawnImpl, timeoutMs });
  } catch (err) {
    return { outcome: 'ERROR', stage: 'scenario-spawn', error: err.message, reasons: [], usage: zeroUsage() };
  }
  const candidateUsage = usageFromRun(candidate);
  if (candidate.isError) {
    return {
      outcome: 'ERROR',
      stage: 'scenario-model',
      error: `claude reported is_error on the scenario run${candidate.stderr ? `: ${candidate.stderr.trim()}` : ''}`,
      reasons: [],
      usage: candidateUsage
    };
  }

  const candidateText = candidate.text;
  const candidateCall = extractJsonBlock(candidateText);
  const graded = gradeCandidate(candidateText, candidateCall);

  // --- Judge ---
  const judgePrompt = buildJudgePrompt({ scenario: fixture, candidateText, candidateCall });
  let judgeRun;
  try {
    judgeRun = runClaude(judgePrompt, { model: judgeModel, claudeBin, spawnImpl, timeoutMs });
  } catch (err) {
    return { outcome: 'ERROR', stage: 'judge-spawn', error: err.message, reasons: graded.reasons, usage: candidateUsage };
  }
  const usage = addUsage(candidateUsage, usageFromRun(judgeRun));
  if (judgeRun.isError) {
    return {
      outcome: 'ERROR',
      stage: 'judge-model',
      error: `claude reported is_error on the judge run${judgeRun.stderr ? `: ${judgeRun.stderr.trim()}` : ''}`,
      reasons: graded.reasons,
      usage
    };
  }

  const judgement = parseJudgement(judgeRun.text);
  if (judgement === null) {
    return {
      outcome: 'ERROR',
      stage: 'judge-parse',
      error: 'The judge did not return a parseable json judgement block.',
      reasons: graded.reasons,
      usage
    };
  }

  const reasons = graded.reasons.slice();
  if (!judgement.recommendationIsBest) {
    reasons.push(`[judge] recommendation is not the best option under the constraints: ${judgement.reasons.join('; ')}`);
  }
  if (!judgement.explanationIsSpecific) {
    reasons.push(`[judge] explanation paragraph is generic, not scenario-specific: ${judgement.reasons.join('; ')}`);
  }

  const judgePass = judgement.recommendationIsBest === true && judgement.explanationIsSpecific === true;
  const outcome = graded.allPass && judgePass ? 'PASS' : 'FAIL';
  return { outcome, reasons, usage };
}

/**
 * Evaluate one scenario over `runs` runs.
 *
 * @param {object} fixture
 * @param {{ runs?: number, model?: string, judgeModel?: string, skillText?: string, claudeBin?: string, spawnImpl?: Function, timeoutMs?: number }} opts
 * @returns {object}
 */
function evalScenario(fixture, opts = {}) {
  const runs = typeof opts.runs === 'number' && opts.runs > 0 ? opts.runs : 3;
  const skillText = opts.skillText || loadSkillText();
  const runOpts = { ...opts, skillText };

  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(runOnce(fixture, runOpts));
  }

  const passes = results.filter((r) => r.outcome === 'PASS').length;
  const fails = results.filter((r) => r.outcome === 'FAIL').length;
  const errors = results.filter((r) => r.outcome === 'ERROR').length;
  const threshold = passThreshold(runs);
  const usage = results.reduce((acc, r) => addUsage(acc, r.usage), zeroUsage());

  return {
    id: fixture.id,
    title: fixture.title,
    runs,
    passes,
    fails,
    errors,
    threshold,
    passed: passes >= threshold,
    passRate: runs > 0 ? passes / runs : 0,
    reasons: results.flatMap((r) => r.reasons),
    results,
    usage
  };
}

module.exports = {
  loadSkillText,
  buildScenarioPrompt,
  gradeCandidate,
  passThreshold,
  runOnce,
  evalScenario,
  RENDER_INSTRUCTION,
  SKILL_PATH
};

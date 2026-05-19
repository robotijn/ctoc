/**
 * Comparator agent — blind Large Language Model (LLM)-as-judge dispatch for
 * the Continuous Tool of Continuous Tools (CTOC) evaluation harness.
 *
 * Spec: docs/EVALUATION_HARNESS.md
 *
 * This module is the network-facing half of the harness. The pure
 * orchestration lives in src/lib/eval-harness.js. Separating them lets the
 * harness library run in unit tests without network Input/Output (I/O), and
 * lets this module be swapped or mocked without touching the orchestration.
 *
 * The comparator implements the pattern published by Anthropic with the
 * `skill-creator` reference skill:
 *
 *   1. runSkillOnCase(case, version) — execute a single skill version
 *      against the case input, producing a candidate output.
 *   2. judgeOutputs(input, outputA, outputB) — present the two outputs
 *      to a judging Large Language Model (LLM), blind to which is the
 *      baseline, and capture a structured verdict.
 *   3. compareSkillVersions(case, versionA, versionB) — orchestrate steps
 *      1 and 2 with position-bias mitigation (random A/B label shuffle).
 *
 * The actual model invocations are intentionally stubbed in this revision.
 * The module structure declares the interface, validates inputs, and
 * emits a structured result. Wiring to the live Anthropic Software
 * Development Kit (SDK) is a follow-on change tracked in the harness
 * roll-out plan. Until wired, the comparator returns a deterministic
 * stub verdict that the harness orchestrator treats as a tie with low
 * confidence — which the runner clearly flags so consumers know the
 * stub is in effect.
 *
 * Cross-platform: pure Node 18+. No native dependencies. No shell-outs.
 */

'use strict';

const crypto = require('crypto');

const STUB_TIE_CONFIDENCE = 0.5;

const SUPPORTED_JUDGE_MODELS = Object.freeze([
  // Listed in order of preference. The wired implementation should pick
  // the first available. These names are documentation; the wired
  // implementation will read from environment variables.
  'claude-opus-4-7',
  'claude-sonnet-4-7',
  'claude-haiku-4-5',
]);

// ──────────────────────────────────────────────────────────────────────────
// Public Application Programming Interface (API)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Compare two versions of a skill on a single case.
 *
 * @param {Object} caseObj - Validated case object.
 * @param {string} baselineVersion - Git reference of the baseline (for
 *   example "main" or a commit hash).
 * @param {string} candidateVersion - Git reference of the candidate (for
 *   example "HEAD" or a branch name).
 * @param {Object} [opts]
 * @param {string} [opts.judgeModel] - Override the judge model selection.
 * @param {Function} [opts.runSkill] - Inject a custom skill-runner (for
 *   tests).
 * @param {Function} [opts.judge] - Inject a custom judge (for tests).
 * @param {Object} [opts.logger] - Optional logger with .info / .warn.
 * @returns {Promise<{
 *   winner: 'A' | 'B' | 'tie',
 *   confidence: number,
 *   judge_reasoning: string,
 *   outputA: string,
 *   outputB: string,
 *   shuffled_position: 'AB' | 'BA',
 *   judge_model: string,
 *   stub: boolean
 * }>}
 */
async function compareSkillVersions(caseObj, baselineVersion, candidateVersion, opts = {}) {
  validateInputs(caseObj, baselineVersion, candidateVersion);

  const runSkill = opts.runSkill || runSkillOnCase;
  const judge = opts.judge || judgeOutputs;
  const logger = opts.logger || nullLogger();

  // 1. Run both versions
  const [resultA, resultB] = await Promise.all([
    runSkill(caseObj, baselineVersion, opts),
    runSkill(caseObj, candidateVersion, opts),
  ]);

  // 2. Shuffle position to mitigate Large Language Model (LLM)-as-judge
  //    position bias. The judge sees outputs labelled "Output 1" and
  //    "Output 2". We randomly assign baseline-or-candidate to each.
  const flip = Math.random() < 0.5;
  const [first, second] = flip ? [resultB, resultA] : [resultA, resultB];
  const shuffledPosition = flip ? 'BA' : 'AB';

  logger.info(`[comparator] dispatch case=${caseObj.id} pos=${shuffledPosition} baseline=${baselineVersion} candidate=${candidateVersion}`);

  // 3. Judge
  const verdict = await judge(
    caseObj.input,
    first.output,
    second.output,
    {
      caseObj,
      judgeModel: opts.judgeModel,
      logger,
    },
  );

  // 4. Un-shuffle: convert the judge's "1" / "2" / "tie" into the canonical
  //    A (baseline) / B (candidate) labels.
  let winner;
  if (verdict.winner === 'tie') {
    winner = 'tie';
  } else if (shuffledPosition === 'AB') {
    // first=A (baseline), second=B (candidate)
    winner = verdict.winner === '1' ? 'A' : 'B';
  } else {
    // first=B (candidate), second=A (baseline)
    winner = verdict.winner === '1' ? 'B' : 'A';
  }

  return {
    winner,
    confidence: verdict.confidence,
    judge_reasoning: verdict.reasoning,
    outputA: resultA.output,
    outputB: resultB.output,
    shuffled_position: shuffledPosition,
    judge_model: verdict.model,
    stub: Boolean(resultA.stub || resultB.stub || verdict.stub),
  };
}

/**
 * Run a single skill version on a case input. Stubbed.
 *
 * In production, this function will:
 *   1. Resolve the skill file at skills/<caseObj.skill>/SKILL.md at the
 *      requested git ref (using `git show <ref>:<path>` via a tightly
 *      bounded child_process call).
 *   2. Construct a prompt that loads the skill content and applies the
 *      case input.
 *   3. Call the Anthropic Software Development Kit (SDK) with the
 *      configured model.
 *   4. Return the raw text output and timing data.
 *
 * Until wired, returns a deterministic stub with a clearly-marked output
 * so downstream rules (expected_findings, must_not_contain) deterministically
 * fail the case until live wiring lands. The comparator marks stub=true on
 * the result so the runner can clearly flag stub mode.
 *
 * @param {Object} caseObj
 * @param {string} version
 * @param {Object} [opts]
 * @returns {Promise<{output: string, latency_ms: number, stub: boolean, version: string}>}
 */
async function runSkillOnCase(caseObj, version, opts = {}) {
  validateCaseShape(caseObj);
  if (typeof version !== 'string' || version.length === 0) {
    throw new TypeError('runSkillOnCase requires a non-empty version string');
  }

  // Stub mode: return a deterministic placeholder. The hash makes outputs
  // differ between versions so the judge has something to discriminate.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${caseObj.id}|${version}`)
      .digest('hex')
      .slice(0, 12);

    return {
      output: [
        '[STUB OUTPUT — comparator stub in effect, ANTHROPIC_API_KEY not set]',
        `case_id: ${caseObj.id}`,
        `skill: ${caseObj.skill}`,
        `version: ${version}`,
        `fingerprint: ${fingerprint}`,
        '',
        'Live Application Programming Interface (API) wiring lands in a',
        'follow-on change. Until then, this placeholder lets the harness',
        'and case schema be exercised end-to-end without network access.',
      ].join('\n'),
      latency_ms: 0,
      stub: true,
      version,
    };
  }

  // Live mode — not yet implemented in this revision. We throw clearly so
  // a continuous-integration job with an API key set sees an actionable
  // error rather than a misleading "tie" verdict.
  throw new Error(
    'comparator-agent.runSkillOnCase: live Anthropic Application Programming Interface (API) wiring is not yet implemented in this revision. '
    + 'Either unset ANTHROPIC_API_KEY to use the stub or implement the wired branch.',
  );
}

/**
 * Judge two outputs. Stubbed.
 *
 * In production, this function will:
 *   1. Select a judge model from SUPPORTED_JUDGE_MODELS.
 *   2. Construct a structured prompt presenting the case input, the
 *      expected output, and the two candidate outputs (labelled
 *      "Output 1" and "Output 2", blind to which is baseline).
 *   3. Ask the judge for a verdict: which output is better, and a
 *      confidence in [0, 1], with reasoning.
 *   4. Parse the structured response.
 *
 * Until wired, returns a deterministic tie with low confidence — clearly
 * flagged via stub=true so the runner reports stub mode.
 *
 * @param {string} input - The case input shown to both candidates.
 * @param {string} outputA - Output to compare (labelled position 1).
 * @param {string} outputB - Output to compare (labelled position 2).
 * @param {Object} [opts]
 * @returns {Promise<{
 *   winner: '1' | '2' | 'tie',
 *   confidence: number,
 *   reasoning: string,
 *   model: string,
 *   stub: boolean
 * }>}
 */
async function judgeOutputs(input, outputA, outputB, opts = {}) {
  if (typeof input !== 'string') throw new TypeError('judgeOutputs: input must be a string');
  if (typeof outputA !== 'string') throw new TypeError('judgeOutputs: outputA must be a string');
  if (typeof outputB !== 'string') throw new TypeError('judgeOutputs: outputB must be a string');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const requestedModel = opts.judgeModel || SUPPORTED_JUDGE_MODELS[0];

  if (!apiKey) {
    return {
      winner: 'tie',
      confidence: STUB_TIE_CONFIDENCE,
      reasoning: [
        'Stub judge: no ANTHROPIC_API_KEY in environment.',
        'The harness orchestrator interprets a low-confidence tie as',
        'inconclusive; downstream pass/fail is driven by expected_findings',
        'and must_not_contain rules.',
      ].join(' '),
      model: 'stub',
      stub: true,
    };
  }

  throw new Error(
    'comparator-agent.judgeOutputs: live Anthropic Application Programming Interface (API) wiring is not yet implemented in this revision. '
    + `Either unset ANTHROPIC_API_KEY to use the stub or implement the wired branch for model "${requestedModel}".`,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────

function validateInputs(caseObj, baselineVersion, candidateVersion) {
  validateCaseShape(caseObj);
  if (typeof baselineVersion !== 'string' || baselineVersion.length === 0) {
    throw new TypeError('compareSkillVersions requires baselineVersion');
  }
  if (typeof candidateVersion !== 'string' || candidateVersion.length === 0) {
    throw new TypeError('compareSkillVersions requires candidateVersion');
  }
}

function validateCaseShape(caseObj) {
  if (caseObj === null || typeof caseObj !== 'object') {
    throw new TypeError('caseObj must be a non-null object');
  }
  if (typeof caseObj.id !== 'string' || caseObj.id.length === 0) {
    throw new TypeError('caseObj.id is required');
  }
  if (typeof caseObj.skill !== 'string' || caseObj.skill.length === 0) {
    throw new TypeError('caseObj.skill is required');
  }
  if (typeof caseObj.input !== 'string') {
    throw new TypeError('caseObj.input is required');
  }
}

function nullLogger() {
  return {
    info() { /* intentionally empty */ },
    warn() { /* intentionally empty */ },
    error() { /* intentionally empty */ },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────

module.exports = {
  // Public Application Programming Interface (API)
  compareSkillVersions,
  runSkillOnCase,
  judgeOutputs,

  // Constants
  SUPPORTED_JUDGE_MODELS,
  STUB_TIE_CONFIDENCE,

  // Internals exported for tests
  _internal: {
    validateCaseShape,
    validateInputs,
    nullLogger,
  },
};

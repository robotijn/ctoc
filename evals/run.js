'use strict';

/**
 * Command-line entry point for the ask-me-questions evaluation (npm run eval).
 *
 * This is an ON-DEMAND evaluation, not part of the node --test suite. It runs
 * the REAL model through the `claude` binary in print mode — under the user's
 * own Claude Code session authentication, with no network interface key.
 *
 * Flags:
 *   --runs N           number of runs per scenario (default 3)
 *   --scenario <id>    run only the scenario with this fixture id
 *   --model <id>       model for the candidate render (default: omit, so the
 *                      user's configured Claude Code default applies)
 *   --judge-model <id> model for the judge (default: omit, same as above)
 *   --require-claude   exit 1 (instead of a clean skip) if claude is missing
 *
 * When the `claude` binary is unavailable, an unmistakable multi-line SKIPPED
 * banner is printed and the process exits 0 (or 1 under --require-claude).
 * Nothing is ever reported as a pass on a skip.
 */

const path = require('node:path');
const safeFs = require('../src/lib/safe-fs.js');

const { detectClaudeBinary } = require('./lib/runner.js');
const { evalScenario, loadSkillText } = require('./ask-me-questions.eval.js');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'ask-me-questions');

/**
 * Parse the command-line arguments into an options object.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ runs: number, scenario: string|null, model: string|undefined, judgeModel: string|undefined, requireClaude: boolean }}
 */
function parseArgs(argv) {
  const opts = {
    runs: 3,
    scenario: null,
    model: undefined,
    judgeModel: undefined,
    requireClaude: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--runs') {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) opts.runs = n;
    } else if (arg === '--scenario') {
      opts.scenario = argv[++i];
    } else if (arg === '--model') {
      opts.model = argv[++i];
    } else if (arg === '--judge-model') {
      opts.judgeModel = argv[++i];
    } else if (arg === '--require-claude') {
      opts.requireClaude = true;
    }
  }
  return opts;
}

/**
 * Load every fixture JSON file, sorted by filename for a stable order.
 * @returns {Array<object>}
 */
function loadFixtures() {
  const names = safeFs
    .readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const fixtures = [];
  for (const name of names) {
    const raw = safeFs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
    fixtures.push(JSON.parse(raw));
  }
  return fixtures;
}

/**
 * The loud multi-line banner printed when nothing was evaluated.
 * @param {string} reason
 * @returns {string}
 */
function skippedBanner(reason) {
  const bar = '='.repeat(72);
  return [
    bar,
    '  EVALUATION SKIPPED — NOTHING WAS EVALUATED',
    bar,
    `  ${reason}`,
    '',
    '  The ask-me-questions evaluation runs the real model through the',
    '  claude binary in print mode, using your Claude Code session',
    '  authentication. That binary was not found or would not run.',
    '',
    '  This is a SKIP, not a PASS. No scenario was run, no output was',
    '  graded, and no claim of correctness is made by this exit.',
    '',
    '  To evaluate: install and sign in to the claude binary, then run',
    '      npm run eval',
    '  To make a missing binary a hard failure instead of a skip, pass',
    '      npm run eval -- --require-claude',
    bar,
    ''
  ].join('\n');
}

/**
 * Render one scenario's result as a plain-text block, including every failing
 * reason verbatim.
 * @param {object} result
 * @returns {string}
 */
function formatScenario(result) {
  const lines = [];
  lines.push('-'.repeat(72));
  lines.push(`Scenario: ${result.id} — ${result.title}`);
  lines.push(
    `  runs=${result.runs}  passes=${result.passes}  fails=${result.fails}  ` +
      `errors=${result.errors}  threshold=${result.threshold}  ` +
      `pass-rate=${(result.passRate * 100).toFixed(1)} percent  ` +
      `-> ${result.passed ? 'PASSED' : 'DID NOT PASS'}`
  );
  if (result.reasons.length > 0) {
    lines.push('  Failing reasons (verbatim):');
    for (const reason of result.reasons) {
      lines.push(`    - ${reason}`);
    }
  }
  return lines.join('\n');
}

/**
 * Run the evaluation. Returns the process exit code (0 all passed, 1 otherwise
 * or on a required-but-missing binary).
 * @param {string[]} argv
 * @param {(s: string) => void} [write] - output sink (defaults to stdout)
 * @returns {number}
 */
function main(argv, write) {
  const out = write || ((s) => process.stdout.write(s));
  const opts = parseArgs(argv);

  const claudeBin = process.env.CTOC_EVAL_CLAUDE_BIN || undefined;
  const detected = detectClaudeBinary({ claudeBin });
  if (!detected.available) {
    out(skippedBanner('The claude binary is not available on this machine.'));
    return opts.requireClaude ? 1 : 0;
  }

  const skillText = loadSkillText();
  let fixtures = loadFixtures();
  if (opts.scenario) {
    fixtures = fixtures.filter((f) => f.id === opts.scenario);
    if (fixtures.length === 0) {
      out(`No fixture matched --scenario "${opts.scenario}".\n`);
      return 1;
    }
  }

  out(`Running ask-me-questions evaluation: ${fixtures.length} scenario(s), ${opts.runs} run(s) each.\n`);
  out(`claude binary: ${detected.version || 'version unknown'}\n`);

  let allPassed = true;
  const totalUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  for (const fixture of fixtures) {
    const result = evalScenario(fixture, {
      runs: opts.runs,
      model: opts.model,
      judgeModel: opts.judgeModel,
      skillText,
      claudeBin
    });
    out(`${formatScenario(result)}\n`);
    if (!result.passed) allPassed = false;
    totalUsage.inputTokens += result.usage.inputTokens;
    totalUsage.outputTokens += result.usage.outputTokens;
    totalUsage.costUsd += result.usage.costUsd;
  }

  out('='.repeat(72) + '\n');
  out(
    `Totals: input_tokens=${totalUsage.inputTokens}  ` +
      `output_tokens=${totalUsage.outputTokens}  ` +
      `cost=${totalUsage.costUsd.toFixed(4)} United States dollars\n`
  );
  out(`Result: ${allPassed ? 'ALL SCENARIOS PASSED' : 'ONE OR MORE SCENARIOS DID NOT PASS'}\n`);
  return allPassed ? 0 : 1;
}

if (require.main === module) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}

module.exports = {
  parseArgs,
  loadFixtures,
  skippedBanner,
  formatScenario,
  main
};

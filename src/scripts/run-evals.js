#!/usr/bin/env node
/**
 * Evaluation runner — command-line driver for the Continuous Tool of
 * Continuous Tools (CTOC) Evaluation-Driven Development (EDD) harness.
 *
 * Spec: docs/EVALUATION_HARNESS.md
 *
 * Usage:
 *   node src/scripts/run-evals.js [options]
 *
 * Options:
 *   --only=<skill-path>        Restrict to one skill, for example
 *                              security/threat-modeler.
 *   --threshold=<float>        Weighted pass-rate threshold. Default 0.95.
 *   --fail-on-regression       Exit non-zero when weighted pass rate
 *                              falls below the threshold.
 *   --baseline=<git-ref>       Baseline git reference. Default "main".
 *   --candidate=<git-ref>      Candidate git reference. Default "HEAD".
 *   --json                     Emit a single JSON document instead of the
 *                              human-readable report.
 *   --no-load-only             Run the comparator. Without this flag, the
 *                              script only loads and validates cases when
 *                              no ANTHROPIC_API_KEY is set (safe default).
 *   --help                     Show this help.
 *
 * Exit codes:
 *   0  All cases loaded and either passed, or comparator was stubbed.
 *   1  One or more cases failed to load or validate.
 *   2  Regression detected (weighted pass rate below threshold) AND
 *      --fail-on-regression was specified.
 *
 * Cross-platform: pure Node 18+. No native dependencies.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const harness = require('../lib/eval-harness');

// ──────────────────────────────────────────────────────────────────────────
// Argument parsing
// ──────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    only: undefined,
    threshold: harness.DEFAULT_REGRESSION_THRESHOLD,
    failOnRegression: false,
    baseline: 'main',
    candidate: 'HEAD',
    json: false,
    loadOnly: undefined, // resolved later based on environment
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg.startsWith('--only=')) {
      out.only = arg.slice('--only='.length);
    } else if (arg.startsWith('--threshold=')) {
      const v = parseFloat(arg.slice('--threshold='.length));
      if (!isNaN(v)) out.threshold = v;
    } else if (arg === '--fail-on-regression') {
      out.failOnRegression = true;
    } else if (arg.startsWith('--baseline=')) {
      out.baseline = arg.slice('--baseline='.length);
    } else if (arg.startsWith('--candidate=')) {
      out.candidate = arg.slice('--candidate='.length);
    } else if (arg === '--json') {
      out.json = true;
    } else if (arg === '--no-load-only') {
      out.loadOnly = false;
    } else if (arg === '--load-only') {
      out.loadOnly = true;
    }
  }

  return out;
}

function showHelp() {
  const lines = [
    'CTOC Evaluation Runner',
    '',
    'Usage:',
    '  node src/scripts/run-evals.js [options]',
    '',
    'Options:',
    '  --only=<skill-path>      Restrict to one skill (for example: security/threat-modeler)',
    '  --threshold=<float>      Weighted pass-rate threshold. Default 0.95.',
    '  --fail-on-regression     Exit non-zero when below threshold.',
    '  --baseline=<git-ref>     Baseline git reference. Default "main".',
    '  --candidate=<git-ref>    Candidate git reference. Default "HEAD".',
    '  --json                   Emit JSON report.',
    '  --no-load-only           Run comparator (requires ANTHROPIC_API_KEY).',
    '  --load-only              Skip comparator dispatch even if API key is set.',
    '  --help                   Show this help.',
    '',
    'See docs/EVALUATION_HARNESS.md for the specification.',
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

// ──────────────────────────────────────────────────────────────────────────
// Project root detection
// ──────────────────────────────────────────────────────────────────────────

function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 32; i++) {
    if (fs.existsSync(path.join(dir, 'VERSION')) || fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

// ──────────────────────────────────────────────────────────────────────────
// Reporting
// ──────────────────────────────────────────────────────────────────────────

function formatHumanReport(report) {
  const lines = [];
  lines.push('');
  lines.push('CTOC Evaluation Report');
  lines.push('======================');
  lines.push('');
  lines.push(`Baseline:    ${report.baseline}`);
  lines.push(`Candidate:   ${report.candidate}`);
  lines.push(`Mode:        ${report.mode}`);
  lines.push(`Threshold:   ${report.threshold.toFixed(2)} (weighted pass rate)`);
  lines.push('');

  // Load errors first
  if (report.load_errors.length > 0) {
    lines.push('LOAD / VALIDATION ERRORS');
    lines.push('------------------------');
    for (const e of report.load_errors) {
      lines.push(`  ! ${e.path}`);
      for (const msg of e.errors) lines.push(`      ${msg}`);
    }
    lines.push('');
  }

  // Per-case
  lines.push('CASES');
  lines.push('-----');
  if (report.cases.length === 0) {
    lines.push('  (none)');
  } else {
    for (const c of report.cases) {
      const status = c.result.passed ? 'PASS' : 'FAIL';
      const verdict = c.result.judge_verdict || 'n/a';
      const conf = typeof c.result.confidence === 'number' ? c.result.confidence.toFixed(2) : 'n/a';
      lines.push(`  [${status}] ${c.skill}/${c.id}  (${c.severity_when_fails}, verdict=${verdict}, conf=${conf}, ${c.result.latency_ms} ms)`);
      if (!c.result.passed) {
        for (const r of c.result.reasons || []) lines.push(`      - ${r}`);
      }
    }
  }
  lines.push('');

  // Aggregate
  lines.push('AGGREGATE');
  lines.push('---------');
  lines.push(`  total:               ${report.summary.total}`);
  lines.push(`  passed:              ${report.summary.passed}`);
  lines.push(`  failed:              ${report.summary.failed}`);
  lines.push(`  pass rate:           ${report.summary.pass_rate.toFixed(2)}`);
  lines.push(`  weighted pass rate:  ${report.summary.weighted_pass_rate.toFixed(2)}`);
  lines.push('');
  lines.push('  by severity:');
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    const s = report.summary.by_severity[sev];
    if (s) lines.push(`    ${sev.padEnd(9)} pass=${s.passed} fail=${s.failed}`);
  }
  lines.push('');

  // Outcome
  if (report.stub_in_effect) {
    lines.push('NOTE: Comparator stub in effect (ANTHROPIC_API_KEY not set or --load-only).');
    lines.push('      Reported verdicts are placeholders; pass/fail is driven by case');
    lines.push('      schema validation and the load step only.');
    lines.push('');
  }

  if (report.exit_code === 0) {
    lines.push('Outcome: OK');
  } else if (report.exit_code === 1) {
    lines.push('Outcome: LOAD ERRORS');
  } else if (report.exit_code === 2) {
    lines.push(`Outcome: REGRESSION (weighted pass rate ${report.summary.weighted_pass_rate.toFixed(2)} < threshold ${report.threshold.toFixed(2)})`);
  }
  lines.push('');

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const projectRoot = findProjectRoot(process.cwd());
  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

  // Resolve load-only default: if no API key and the user did not say
  // --no-load-only, run in load-only mode for predictable behaviour.
  const loadOnly = args.loadOnly === true
    ? true
    : (args.loadOnly === false ? false : !hasApiKey);

  // 1. Load cases
  const cases = await harness.loadCases(projectRoot, args.only);

  const loadErrors = cases
    .filter((c) => c.loadError !== null || !c.validation.ok)
    .map((c) => ({
      path: c.path,
      errors: c.loadError
        ? [`load error: ${c.loadError.message}`]
        : c.validation.errors,
    }));

  const validCases = cases.filter((c) => c.loadError === null && c.validation.ok);

  // 2. Run each valid case
  const caseResults = [];
  let stubInEffect = false;

  for (const c of validCases) {
    let result;
    if (loadOnly) {
      // Load-only mode: do not dispatch the comparator. Report a neutral
      // "loaded" verdict that the aggregate treats as passing.
      result = {
        passed: true,
        judge_verdict: 'loaded',
        confidence: 1.0,
        latency_ms: 0,
        reasons: [],
      };
      stubInEffect = true;
    } else {
      result = await harness.runCase(c.caseObj, {
        baselineVersion: args.baseline,
        candidateVersion: args.candidate,
      });
      // If any case's verdict came back from the stub (judge_verdict='tie'
      // with the stub's signature confidence), the stub is in effect.
      if (result.judge_verdict === 'tie' && result.confidence === 0.5) {
        stubInEffect = true;
      }
    }
    caseResults.push({
      id: c.caseObj.id,
      skill: c.caseObj.skill,
      severity_when_fails: c.caseObj.severity_when_fails,
      result,
    });
  }

  // 3. Aggregate
  const summary = harness.aggregateVerdicts(
    caseResults.map((cr) => ({
      caseObj: { severity_when_fails: cr.severity_when_fails },
      result: cr.result,
    })),
  );

  // 4. Exit code
  let exitCode = 0;
  if (loadErrors.length > 0) {
    exitCode = 1;
  } else if (
    args.failOnRegression
    && summary.weighted_pass_rate < args.threshold
  ) {
    exitCode = 2;
  }

  const report = {
    baseline: args.baseline,
    candidate: args.candidate,
    threshold: args.threshold,
    mode: loadOnly ? 'load-only' : 'comparator',
    stub_in_effect: stubInEffect,
    load_errors: loadErrors,
    cases: caseResults,
    summary,
    exit_code: exitCode,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatHumanReport(report));
  }

  process.exit(exitCode);
}

// Only run when invoked directly, so the module can be required in tests.
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`run-evals: fatal: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  findProjectRoot,
  formatHumanReport,
};

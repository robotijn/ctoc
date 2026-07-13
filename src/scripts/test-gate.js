#!/usr/bin/env node
'use strict';

/**
 * CTOC test-gate — run-summary gate for `npm test` (findings A4 + S4).
 *
 * Two defects, one gate:
 *   A4  The suite ran under bare `node --test tests/*.test.js` with NO coverage
 *       instrumentation — the documented "≥ 80%" figure had no instrument behind it.
 *   S4  `# skipped > 0` was invisible under the `# fail 0` gate, so a skipped test
 *       could masquerade as a pass.
 *
 * This script runs the suite WITH coverage (Node's built-in
 * `node --test --experimental-test-coverage` — zero new dependency), parses the
 * run summary, and exits non-zero when ANY of three conditions trips:
 *   1. a test failed              (fail > 0)
 *   2. a test was skipped         (skipped > 0)
 *   3. coverage is unmeasured OR below the threshold (coveragePct === null, or < 80)
 *
 * The gate DECISION is pure (`evaluateSummary`) and unit-tested on synthetic
 * summaries in tests/coverage-gate.test.js. Only the CLI wrapper spawns.
 *
 * Debugging escape hatch: `npm run test:raw` runs the bare suite without the gate.
 *
 * Cross-platform: the subprocess uses `spawnSync(process.execPath, [args…])` —
 * an argv array, shell:false — so there is no shell interpolation (no command
 * injection) and no POSIX-only redirection. The `tests/*.test.js` glob is
 * expanded with a directory read (a shell would be needed to expand it inline).
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const safeFs = require('../lib/safe-fs');

const DEFAULT_THRESHOLD = 80;

/**
 * Extract the `# skipped N` / `ℹ skipped N` count from a run summary.
 * Handles both the TAP reporter (`#` prefix) and the Node "spec" reporter
 * (`ℹ` prefix, which is what a piped `node --test` run emits).
 * @param {string} summaryText
 * @returns {number} the skipped count, or 0 when no such line is present.
 */
function parseSkipped(summaryText) {
  if (!summaryText) return 0;
  const m = summaryText.match(/(?:#|ℹ)\s+skipped\s+(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Extract the `# fail N` / `ℹ fail N` count from a run summary.
 * @param {string} summaryText
 * @returns {number} the failing count, or 0 when no such line is present.
 */
function parseFail(summaryText) {
  if (!summaryText) return 0;
  const m = summaryText.match(/(?:#|ℹ)\s+fail\s+(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Extract the "all files" LINE-coverage percentage from
 * `--experimental-test-coverage` output. The coverage table row is
 * `all files | <line%> | <branch%> | <funcs%> | <uncovered>`; we take the first
 * percentage column (line coverage).
 * @param {string} coverageText
 * @returns {number|null} the line-coverage percentage, or null when no coverage
 *   block is present — an unmeasured run is itself a failure condition.
 */
function parseCoveragePct(coverageText) {
  if (!coverageText) return null;
  const m = coverageText.match(/all files\s*\|\s*([\d.]+)/);
  return m ? Number(m[1]) : null;
}

/**
 * The pure gate decision. Fails on a real failure, any skip, unmeasured
 * coverage, or coverage below the threshold; names each trip in `reasons`.
 * @param {{skipped?: number, coveragePct?: number|null, fail?: number}} summary
 * @param {{threshold?: number}} [opts]
 * @returns {{ok: boolean, reasons: string[]}}
 */
function evaluateSummary(summary, opts) {
  const { skipped = 0, coveragePct = null, fail = 0 } = summary || {};
  const threshold = (opts && typeof opts.threshold === 'number') ? opts.threshold : DEFAULT_THRESHOLD;
  const reasons = [];

  if (fail > 0) {
    reasons.push(`# fail ${fail} > 0`);
  }
  if (skipped > 0) {
    reasons.push(`# skipped ${skipped} > 0`);
  }
  if (coveragePct === null) {
    reasons.push('coverage not measured (no coverage report in run output) — unmeasured coverage fails the gate');
  } else if (coveragePct < threshold) {
    reasons.push(`coverage ${coveragePct}% < ${threshold}%`);
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Resolve the `tests/*.test.js` files as an argv list (a glob needs a shell to
 * expand; we expand it here so the spawn stays shell-free and cross-platform).
 * @param {string} projectRoot
 * @returns {string[]} absolute paths of the suite's test files.
 */
function resolveTestFiles(projectRoot) {
  const testsDir = path.join(projectRoot, 'tests');
  return safeFs.readdirSync(testsDir)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join(testsDir, f));
}

/** CLI entry point: run the suite under coverage, evaluate, print, exit. */
function main() {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const files = resolveTestFiles(projectRoot);

  if (files.length === 0) {
    process.stderr.write('[CTOC test-gate] no test files found under tests/ — refusing to report green on an empty run.\n');
    process.exit(1);
  }

  // Always run WITH coverage — the flag is hardcoded here so coverage can never
  // be silently dropped from the pipeline, and is also declared in the npm
  // `test` script string (asserted by tests/coverage-gate.test.js).
  const result = spawnSync(
    process.execPath,
    ['--test', '--experimental-test-coverage', ...files],
    { cwd: projectRoot, shell: false, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );

  if (result.error) {
    process.stderr.write(`[CTOC test-gate] could not run the suite: ${result.error.message}\n`);
    process.exit(1);
  }

  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);

  const summary = {
    fail: parseFail(output),
    skipped: parseSkipped(output),
    coveragePct: parseCoveragePct(output),
  };
  const verdict = evaluateSummary(summary);

  const measured = summary.coveragePct === null ? 'unmeasured' : `${summary.coveragePct}%`;
  process.stdout.write(`\n[CTOC test-gate] coverage ${measured} (threshold ${DEFAULT_THRESHOLD}%), skipped ${summary.skipped}, failed ${summary.fail}\n`);

  if (!verdict.ok) {
    process.stderr.write('[CTOC test-gate] FAIL:\n');
    for (const reason of verdict.reasons) {
      process.stderr.write(`  - ${reason}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('[CTOC test-gate] PASS\n');
  process.exit(0);
}

module.exports = { parseSkipped, parseFail, parseCoveragePct, evaluateSummary, resolveTestFiles };

if (require.main === module) {
  main();
}

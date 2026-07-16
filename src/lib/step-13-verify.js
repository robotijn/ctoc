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
 */

const { execSync, spawnSync } = require('child_process');
const safeFs = require('./safe-fs');
const path = require('path');
const { driveAppSync } = require('./app-runner');

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
 * @param {string[]} candidates - Pre-qualified command strings.
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
    return { ran: false, applicable: false, passed: null, command: null, reason: `${label} candidates were not runnable` };
  }
  const check = {
    ran: true,
    applicable: true,
    passed: r.success === true,
    command: r.command,
    output: (r.output || '').slice(0, 4000),
    error: r.error || null
  };
  if (!check.passed) {
    errors.push(`${label} failed: ${r.error || 'nonzero exit'}`);
  }
  return check;
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

/** Parse a skipped/todo test count from test-runner output. */
function parseSkippedCount(out) {
  let n = 0;
  const text = out || '';
  for (const re of [/#\s*skipped\s+(\d+)/ig, /#\s*todo\s+(\d+)/ig]) {
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

/** Parse a coverage percentage from test-runner output, or null if not present. */
function parseCoveragePct(out) {
  const text = out || '';
  // Node's own --experimental-test-coverage table prints the summary row as
  // `# all files | <line%> | …` (lowercase, leading `# ` under the TAP reporter).
  // Match it case-insensitively and tolerant of the `# ` prefix, and BEFORE the
  // Istanbul/nyc format — otherwise a `node --test` project's coverage parses to
  // null and its declared floor is silently unenforced. The same regex also
  // matches the Istanbul "All files | 95 |" row (case-insensitive covers "All").
  let m = text.match(/^\s*#?\s*all files\s*\|\s*([\d.]+)/im);
  if (m) return parseFloat(m[1]);
  m = text.match(/Lines\s*:\s*([\d.]+)\s*%/i);
  if (m) return parseFloat(m[1]);
  m = text.match(/Statements\s*:\s*([\d.]+)\s*%/i);
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

  // Lint checks
  const lintCommands = [];
  if (hasPackageJson && npmScriptExists(pkg, 'lint')) lintCommands.push('npm run lint');
  if (hasPyproject && toolExists('ruff', projectPath)) lintCommands.push('ruff check .');
  if (hasGoMod && toolExists('golangci-lint', projectPath)) lintCommands.push('golangci-lint run');
  if (hasCargoToml && toolExists('cargo', projectPath)) lintCommands.push('cargo clippy');
  checks.lint = evalCategory('Lint', lintCommands, projectPath, errors);

  // Type check
  const typeCommands = [];
  if (hasPackageJson && npmScriptExists(pkg, 'typecheck')) typeCommands.push('npm run typecheck');
  if (hasPyproject && toolExists('mypy', projectPath)) typeCommands.push('mypy .');
  if (hasGoMod && toolExists('go', projectPath)) typeCommands.push('go vet ./...');
  checks.types = evalCategory('Type check', typeCommands, projectPath, errors);

  // Test suite
  const testCommands = [];
  if (hasPackageJson && npmScriptExists(pkg, 'test')) testCommands.push('npm test');
  if (hasPyproject && toolExists('pytest', projectPath)) testCommands.push('pytest');
  if (hasGoMod && toolExists('go', projectPath)) testCommands.push('go test ./...');
  if (hasCargoToml && toolExists('cargo', projectPath)) testCommands.push('cargo test');
  const testCheck = evalCategory('Tests', testCommands, projectPath, errors);
  // When tests actually RAN, fold in the "0 skipped" and coverage-floor contracts.
  if (testCheck.ran) {
    applyTestQualityContracts(testCheck, projectPath, errors);
  }
  checks.tests = testCheck;

  return { checks, errors };
}

/**
 * Try running a single command.
 *
 * @param {string} command - Command to run
 * @param {string} cwd - Working directory
 * @returns {Object} Result with success, output, and error
 */
function tryCommand(command, cwd) {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim(), error: null, spawnFailed: false };
  } catch (e) {
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
 * @param {string[]} commands - Commands to try in order.
 * @param {string} cwd - Working directory.
 * @returns {Object} `{ ran, success, output, command, error }`.
 */
function tryCommands(commands, cwd) {
  for (const cmd of commands) {
    const result = tryCommand(cmd, cwd);
    if (result.success) {
      return { ...result, command: cmd, ran: true };
    }
    if (result.spawnFailed) {
      // The binary itself could not be launched (a TRUE launch failure: spawn
      // ENOENT or shell exit status 127), despite the upstream presence
      // precondition — treat as NOT this check and try the next candidate. This
      // NEVER fires on a substring of the command's own output, so a real
      // non-zero exit (e.g. status 1) is never swallowed as not-run.
      continue;
    }
    // The command launched and exited non-zero — a REAL failure.
    return { ...result, command: cmd, ran: true };
  }

  // Nothing ran. This is NOT a pass — the caller records it as applicable:false.
  return {
    ran: false,
    success: false,
    applicable: false,
    output: '',
    command: null,
    error: null
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

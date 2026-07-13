/**
 * Step 14: VERIFY - Quality Gate Runner
 *
 * Runs all quality checks as the single quality gate in the Iron Loop.
 * Tries `ctoc quality` first (Smart Quality Gate System), falls back to
 * direct lint/type/test commands when quality gates are not available.
 *
 * This module has NO dependency on smart-quality-gate-system.
 * When that system ships, Step 14 will automatically use it.
 */

const { execSync } = require('child_process');
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

  result.passed = result.errors.length === 0;
  result.summary = buildSummary(result);
  return result;
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
 * Build a human-readable one-line summary for a VERIFY result.
 * @param {Object} result - The assembled VERIFY result.
 * @returns {string} Summary line.
 */
function buildSummary(result) {
  if (result.passed) {
    const appChecked = result.checks.appRuns && result.checks.appRuns.applicable && result.checks.appRuns.responded;
    if (result.method === 'ctoc-quality-gate') {
      return appChecked
        ? 'All quality checks passed via ctoc quality gate, and the app launched and responded.'
        : 'All quality checks passed via ctoc quality gate.';
    }
    return appChecked
      ? 'All fallback quality checks passed, and the app launched and responded.'
      : 'All fallback quality checks passed.';
  }
  return `${result.errors.length} check(s) failed: ${result.errors.join('; ')}`;
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
  const hasPackageJson = safeFs.existsSync(path.join(projectPath, 'package.json'));
  const hasPyproject = safeFs.existsSync(path.join(projectPath, 'pyproject.toml'));
  const hasGoMod = safeFs.existsSync(path.join(projectPath, 'go.mod'));
  const hasCargoToml = safeFs.existsSync(path.join(projectPath, 'Cargo.toml'));

  // Lint checks
  const lintCommands = [];
  if (hasPackageJson) lintCommands.push('npm run lint');
  if (hasPyproject) lintCommands.push('ruff check .');
  if (hasGoMod) lintCommands.push('golangci-lint run');
  if (hasCargoToml) lintCommands.push('cargo clippy');

  if (lintCommands.length > 0) {
    const lintResult = tryCommands(lintCommands, projectPath);
    checks.lint = lintResult;
    if (!lintResult.success) {
      errors.push(`Lint failed: ${lintResult.error}`);
    }
  }

  // Type check
  const typeCommands = [];
  if (hasPackageJson) typeCommands.push('npm run typecheck');
  if (hasPyproject) typeCommands.push('mypy .');
  if (hasGoMod) typeCommands.push('go vet ./...');

  if (typeCommands.length > 0) {
    const typeResult = tryCommands(typeCommands, projectPath);
    checks.types = typeResult;
    if (!typeResult.success) {
      errors.push(`Type check failed: ${typeResult.error}`);
    }
  }

  // Test suite
  const testCommands = [];
  if (hasPackageJson) testCommands.push('npm test');
  if (hasPyproject) testCommands.push('pytest');
  if (hasGoMod) testCommands.push('go test ./...');
  if (hasCargoToml) testCommands.push('cargo test');

  if (testCommands.length > 0) {
    const testResult = tryCommands(testCommands, projectPath);
    checks.tests = testResult;
    if (!testResult.success) {
      errors.push(`Tests failed: ${testResult.error}`);
    }
  }

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
    return { success: true, output: output.trim(), error: null };
  } catch (e) {
    return {
      success: false,
      output: e.stdout ? e.stdout.toString().trim() : '',
      error: e.stderr ? e.stderr.toString().trim() : e.message
    };
  }
}

/**
 * Try multiple commands in order, returning the result of the first one that exists.
 * Falls through to the next command if the current one is not found.
 *
 * @param {string[]} commands - Commands to try in order
 * @param {string} cwd - Working directory
 * @returns {Object} Result with success, output, command, and error
 */
function tryCommands(commands, cwd) {
  for (const cmd of commands) {
    const result = tryCommand(cmd, cwd);
    // If command was found (even if it failed), return this result
    if (result.success || !result.error.includes('not found')) {
      return { ...result, command: cmd };
    }
  }

  return {
    success: true,
    output: 'No applicable tool found - skipped',
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
  verifyEvidencePath,
  persistVerifyResult,
  readVerifyEvidence
};

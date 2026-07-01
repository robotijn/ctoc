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

  // Try Smart Quality Gate first
  try {
    const gateResult = tryCommand('ctoc quality --tier=1', projectPath);
    if (gateResult.success) {
      result.method = 'ctoc-quality-gate';
      result.passed = true;
      result.checks.qualityGate = { passed: true, output: gateResult.output };
      result.summary = 'All quality checks passed via ctoc quality gate.';
      return result;
    }
  } catch (e) {
    // ctoc quality not available, use fallback
  }

  // Fallback to direct commands
  result.method = 'fallback-direct';
  const fallbackResult = runFallbackChecks(projectPath);

  result.checks = fallbackResult.checks;
  result.errors = fallbackResult.errors;
  result.passed = fallbackResult.errors.length === 0;
  result.summary = result.passed
    ? 'All fallback quality checks passed.'
    : `${fallbackResult.errors.length} check(s) failed: ${fallbackResult.errors.join('; ')}`;

  return result;
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

module.exports = {
  runVerify,
  runFallbackChecks,
  tryCommand,
  tryCommands
};

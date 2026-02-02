/**
 * Local CI Runner
 *
 * Runs the exact same checks locally that CI would run.
 * Ensures CI will pass before push.
 *
 * @module lib/local-ci
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { parseCIConfig, CHECK_TYPES } = require('./ci-parser');
const { runCommand, TEST_STATUS, DEFAULT_TIMEOUT } = require('./test-runner');

/**
 * CI result status
 */
const CI_STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  PARTIAL: 'partial',
  ERROR: 'error'
};

/**
 * Check result structure
 * @typedef {Object} CheckResult
 * @property {string} name - Check name
 * @property {string} command - Command run
 * @property {string} status - pass/fail/error/timeout
 * @property {number} duration - Duration in ms
 * @property {string} output - Combined output
 * @property {string} [error] - Error message if failed
 */

/**
 * Run all CI checks locally
 * @param {string} projectPath - Project root
 * @param {Object} options - Run options
 * @returns {Promise<Object>} CI results
 */
async function runLocalCI(projectPath = process.cwd(), options = {}) {
  const {
    checks = null, // Use detected or specify
    timeout = DEFAULT_TIMEOUT,
    parallel = false,
    stopOnFailure = false,
    verbose = true
  } = options;

  const startTime = Date.now();
  const results = [];
  let ciConfig;

  // Parse CI config
  if (!checks) {
    ciConfig = parseCIConfig(projectPath);
    if (verbose) {
      if (ciConfig.found) {
        console.log(`CI System: ${ciConfig.system}`);
        console.log(`Config: ${ciConfig.configPath}`);
      } else {
        console.log('No CI config found, using defaults');
      }
      console.log(`Checks to run: ${ciConfig.checks.length}`);
      console.log('');
    }
  } else {
    ciConfig = { checks, found: true };
  }

  // Run checks
  if (parallel && !stopOnFailure) {
    // Run all in parallel
    const promises = ciConfig.checks.map(check => runSingleCheck(check, projectPath, timeout, verbose));
    const parallelResults = await Promise.all(promises);
    results.push(...parallelResults);
  } else {
    // Run sequentially
    for (const check of ciConfig.checks) {
      const result = await runSingleCheck(check, projectPath, timeout, verbose);
      results.push(result);

      if (stopOnFailure && result.status !== TEST_STATUS.PASS) {
        if (verbose) {
          console.log('\nStopping on first failure.\n');
        }
        break;
      }
    }
  }

  // Calculate summary
  const passed = results.filter(r => r.status === TEST_STATUS.PASS).length;
  const failed = results.filter(r => r.status !== TEST_STATUS.PASS).length;
  const duration = Date.now() - startTime;

  const summary = {
    status: failed === 0 ? CI_STATUS.PASS :
            passed === 0 ? CI_STATUS.FAIL : CI_STATUS.PARTIAL,
    passed,
    failed,
    total: results.length,
    duration,
    results,
    ciConfig: {
      found: ciConfig.found,
      system: ciConfig.system,
      container: ciConfig.container
    }
  };

  if (verbose) {
    printSummary(summary);
  }

  return summary;
}

/**
 * Run a single CI check
 * @param {Object} check - Check definition
 * @param {string} projectPath - Project root
 * @param {number} timeout - Timeout in ms
 * @param {boolean} verbose - Print progress
 * @returns {Promise<CheckResult>}
 */
async function runSingleCheck(check, projectPath, timeout, verbose = true) {
  const startTime = Date.now();

  if (verbose) {
    console.log(`Running: ${check.name || check.command.slice(0, 40)}`);
  }

  try {
    const result = await runCommand(check.command, {
      cwd: projectPath,
      timeout
    });

    const checkResult = {
      name: check.name || check.command.slice(0, 40),
      command: check.command,
      type: check.type,
      status: result.status,
      duration: result.duration,
      output: result.stdout + result.stderr,
      code: result.code
    };

    if (result.status !== TEST_STATUS.PASS) {
      checkResult.error = result.message || `Exit code: ${result.code}`;
    }

    if (verbose) {
      const icon = result.status === TEST_STATUS.PASS ? '\u2713' : '\u2717';
      const statusText = result.status === TEST_STATUS.PASS ? 'PASS' : 'FAIL';
      console.log(`  ${icon} ${statusText} (${result.duration}ms)`);
      if (result.status !== TEST_STATUS.PASS && result.stderr) {
        // Show first few lines of error
        const errorLines = result.stderr.split('\n').slice(0, 5);
        for (const line of errorLines) {
          if (line.trim()) console.log(`    ${line}`);
        }
      }
      console.log('');
    }

    return checkResult;
  } catch (error) {
    const checkResult = {
      name: check.name || check.command.slice(0, 40),
      command: check.command,
      type: check.type,
      status: TEST_STATUS.ERROR,
      duration: Date.now() - startTime,
      error: error.message
    };

    if (verbose) {
      console.log(`  \u2717 ERROR: ${error.message}\n`);
    }

    return checkResult;
  }
}

/**
 * Print CI summary
 * @param {Object} summary - CI result summary
 */
function printSummary(summary) {
  console.log('═══════════════════════════════════════════');
  console.log('             LOCAL CI RESULTS              ');
  console.log('═══════════════════════════════════════════');
  console.log('');

  if (summary.status === CI_STATUS.PASS) {
    console.log('  ╔═══════════════════════════════════════╗');
    console.log('  ║     \u2713  ALL CHECKS PASSED             ║');
    console.log('  ╚═══════════════════════════════════════╝');
  } else {
    console.log('  ╔═══════════════════════════════════════╗');
    console.log('  ║     \u2717  SOME CHECKS FAILED            ║');
    console.log('  ╚═══════════════════════════════════════╝');
  }

  console.log('');
  console.log(`  Passed:  ${summary.passed}/${summary.total}`);
  console.log(`  Failed:  ${summary.failed}/${summary.total}`);
  console.log(`  Time:    ${(summary.duration / 1000).toFixed(1)}s`);
  console.log('');

  if (summary.failed > 0) {
    console.log('  Failed Checks:');
    for (const result of summary.results.filter(r => r.status !== TEST_STATUS.PASS)) {
      console.log(`    \u2717 ${result.name}`);
      if (result.error) {
        console.log(`      ${result.error}`);
      }
    }
    console.log('');
  }
}

/**
 * Quick check - run only critical checks
 * @param {string} projectPath - Project root
 * @returns {Promise<Object>} Quick check results
 */
async function runQuickCheck(projectPath = process.cwd()) {
  const ciConfig = parseCIConfig(projectPath);

  // Filter to only critical checks (lint, typecheck)
  const criticalTypes = [CHECK_TYPES.LINT, CHECK_TYPES.TYPE_CHECK, CHECK_TYPES.FORMAT];
  const criticalChecks = ciConfig.checks.filter(c => criticalTypes.includes(c.type));

  if (criticalChecks.length === 0) {
    return {
      status: CI_STATUS.PASS,
      message: 'No quick checks to run',
      results: []
    };
  }

  return runLocalCI(projectPath, {
    checks: criticalChecks,
    timeout: 60000, // 1 minute for quick checks
    stopOnFailure: true
  });
}

/**
 * Run full CI check including tests
 * @param {string} projectPath - Project root
 * @returns {Promise<Object>} Full check results
 */
async function runFullCheck(projectPath = process.cwd()) {
  return runLocalCI(projectPath, {
    timeout: 10 * 60 * 1000, // 10 minutes for full check
    stopOnFailure: false
  });
}

/**
 * Check if local CI would pass
 * @param {string} projectPath - Project root
 * @returns {Promise<boolean>} True if CI passes
 */
async function willCIPass(projectPath = process.cwd()) {
  const result = await runLocalCI(projectPath, { verbose: false });
  return result.status === CI_STATUS.PASS;
}

/**
 * Get list of checks that would be run
 * @param {string} projectPath - Project root
 * @returns {Array} List of checks
 */
function getChecks(projectPath = process.cwd()) {
  const ciConfig = parseCIConfig(projectPath);
  return ciConfig.checks.map(check => ({
    name: check.name || check.command.slice(0, 40),
    command: check.command,
    type: check.type
  }));
}

/**
 * Run a specific type of check only
 * @param {string} checkType - Type from CHECK_TYPES
 * @param {string} projectPath - Project root
 * @returns {Promise<Object>} Check results
 */
async function runCheckType(checkType, projectPath = process.cwd()) {
  const ciConfig = parseCIConfig(projectPath);
  const checks = ciConfig.checks.filter(c => c.type === checkType);

  if (checks.length === 0) {
    return {
      status: CI_STATUS.PASS,
      message: `No ${checkType} checks found`,
      results: []
    };
  }

  return runLocalCI(projectPath, { checks });
}

/**
 * Format CI results for display
 * @param {Object} results - CI results
 * @returns {string} Formatted string
 */
function formatResults(results) {
  const lines = [];

  lines.push('Local CI Results');
  lines.push('================');
  lines.push('');

  for (const result of results.results) {
    const icon = result.status === TEST_STATUS.PASS ? '\u2713' : '\u2717';
    lines.push(`${icon} ${result.name} (${result.duration}ms)`);
    if (result.error) {
      lines.push(`  Error: ${result.error}`);
    }
  }

  lines.push('');
  lines.push(`Status: ${results.status.toUpperCase()}`);
  lines.push(`Passed: ${results.passed}/${results.total}`);
  lines.push(`Duration: ${(results.duration / 1000).toFixed(1)}s`);

  return lines.join('\n');
}

module.exports = {
  runLocalCI,
  runQuickCheck,
  runFullCheck,
  willCIPass,
  getChecks,
  runCheckType,
  formatResults,
  printSummary,
  CI_STATUS
};

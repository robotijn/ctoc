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
 */

const { execSync } = require('child_process');
const path = require('path');
const safeFs = require('./safe-fs');

const qualityState = require('./quality-state');
const toolDetector = require('./tool-detector');
const { findChangedFiles } = require('./hash-utils');
const { findAffectedTests } = require('./coverage-map');

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = {
    triggeredBy: 'manual',
    onSuccess: 'push',
    verbose: false
  };

  for (const arg of process.argv.slice(2)) {
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
  const { silent = false, allowFail = false } = options;

  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    return { success: true, output: output?.trim() || '' };
  } catch (err) {
    if (allowFail) {
      return { success: false, output: err.stdout || '', error: err.message };
    }
    throw err;
  }
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
  let totalPassed = 0;
  let totalFailed = 0;

  for (const [_lang, langTools] of Object.entries(tools)) {
    if (!langTools.test) continue;

    let cmd;
    if (langTools.testFramework === 'jest') {
      cmd = `npx jest ${testFiles.join(' ')}`;
    } else if (langTools.testFramework === 'vitest') {
      cmd = `npx vitest run ${testFiles.join(' ')}`;
    } else if (langTools.testFramework === 'pytest') {
      cmd = `pytest ${testFiles.join(' ')}`;
    } else if (langTools.testFramework === 'go') {
      // For Go, convert file paths to package paths
      const packages = [...new Set(testFiles.map(f => './' + path.dirname(f) + '/...'))];
      cmd = `go test ${packages.join(' ')}`;
    } else {
      // Fallback: run full suite
      cmd = langTools.test;
    }

    const result = runCommand(cmd, { allowFail: true, silent: true });

    if (!result.success) {
      return {
        passed: false,
        passCount: totalPassed,
        failed: totalFailed + 1,
        skipped: 0,
        flaky: 0,
        output: result.output || result.error
      };
    }

    // Try to parse pass count from output
    const passMatch = result.output?.match(/(\d+)\s*(passed|passing)/i);
    if (passMatch) {
      totalPassed += parseInt(passMatch[1]);
    }
  }

  return {
    passed: true,
    passCount: totalPassed,
    failed: 0,
    skipped: 0,
    flaky: 0
  };
}

/**
 * Run all tests (full suite fallback)
 */
async function runFullTests(tools) {
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
        skipped: totalSkipped,
        flaky: 0,
        output
      };
    }

    // Try to parse pass count from output
    const passMatch = result.output?.match(/(\d+)\s*(passed|passing)/i);
    if (passMatch) {
      totalPassed += parseInt(passMatch[1]);
    }
  }

  console.log(`   Tests passed (${totalPassed} total)`);
  return {
    passed: true,
    passCount: totalPassed,
    failed: 0,
    skipped: 0,
    flaky: 0
  };
}

/**
 * Run smart tests - only tests affected by changed files
 * Uses hash-based change detection and coverage map for test selection.
 */
async function runSmartTests(tools) {
  console.log('\n  Running tests...');

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
 * Run security scan (basic)
 */
async function runSecurityScan() {
  console.log('\n  Running security scan...');

  // Check for secrets in staged files
  const result = runCommand('git diff HEAD~1 --name-only', { silent: true, allowFail: true });
  const changedFiles = result.output?.split('\n').filter(f => f) || [];

  // Basic secret patterns
  const secretPatterns = [
    /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    /secret[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    /password\s*[:=]\s*['"][^'"]+['"]/i,
    /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    /aws[_-]?access[_-]?key/i,
    /-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/
  ];

  for (const file of changedFiles) {
    if (!safeFs.existsSync(file)) continue;
    if (file.includes('node_modules') || file.includes('.git')) continue;

    try {
      const content = safeFs.readFileSync(file, 'utf8');
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          console.log(`   Potential secret detected in ${file}`);
          return {
            passed: false,
            critical: 1,
            high: 0,
            medium: 0,
            details: `Potential secret in ${file}`
          };
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  console.log('   No secrets detected');
  return { passed: true, critical: 0, high: 0, medium: 0 };
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
 * Push to remote with pull-rebase conflict handling (Decision 15)
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
      console.log('   Remote ahead, rebasing...');
      try {
        runCommand('git pull --rebase', { silent: false });
        // Push again after rebase
        runCommand('git push', { silent: false });
        console.log('   Pushed successfully after rebase!');
        return true;
      } catch (rebaseErr) {
        console.log('   Conflict during rebase. Run `ctoc sync` to resolve.');
        return false;
      }
    }

    console.log('   Push failed:', err.message || err);
    return false;
  }
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
    console.log('    Security:  ' + (tier1.security.passed ? 'PASS' : 'FAIL'));

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

    // Build summary for quality state
    const tier1 = results.tier1 || {};
    qualityState.setCompleted(results.allPassed, {
      tests: tier1.tests || { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 },
      coverage: 0, // TODO: implement coverage
      lint: tier1.lint || { passed: true, errors: 0, warnings: 0 },
      typecheck: tier1.typecheck || { passed: true, errors: 0 },
      security: tier1.security || { passed: true, critical: 0, high: 0, medium: 0 }
    });

    // Print summary
    printSummary(results, duration);

    // Handle success/failure
    if (results.allPassed) {
      if (args.onSuccess === 'push') {
        pushToRemote();
      }
    } else {
      console.log('\n  Fix the issues above and commit again to retry.');
    }

  } finally {
    qualityState.releaseLock();
  }
}

// Run
main().catch(err => {
  console.error('Quality agent error:', err);
  qualityState.releaseLock();
  process.exit(1);
});

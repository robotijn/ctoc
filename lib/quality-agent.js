#!/usr/bin/env node
/**
 * Background Quality Agent
 *
 * Runs all quality checks asynchronously after commit.
 * Auto-pushes on success, notifies on failure.
 *
 * Features:
 * - Detects test frameworks automatically
 * - Runs only affected tests when possible
 * - Uses lockfile to prevent concurrent runs
 * - Self-heals from interrupted runs
 * - Terminal notifications
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const qualityState = require('./quality-state');
const toolDetector = require('./tool-detector');

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
 * Get current git HEAD
 */
function getGitHead() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Run lint check
 */
async function runLint(tools) {
  console.log('\n📝 Running lint...');

  for (const [lang, langTools] of Object.entries(tools)) {
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

  console.log('   ✅ Lint passed');
  return { passed: true, errors: 0, warnings: 0 };
}

/**
 * Run type check
 */
async function runTypecheck(tools) {
  console.log('\n🔍 Running type check...');

  for (const [lang, langTools] of Object.entries(tools)) {
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

  console.log('   ✅ Type check passed');
  return { passed: true, errors: 0 };
}

/**
 * Run tests
 */
async function runTests(tools) {
  console.log('\n🧪 Running tests...');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const [lang, langTools] of Object.entries(tools)) {
    if (!langTools.test) continue;

    console.log(`   Running ${lang} tests...`);
    const result = runCommand(langTools.test, { allowFail: true, silent: true });

    if (!result.success) {
      // Parse test output for details
      const output = result.output || result.error || '';

      // Check for flaky indicators
      if (output.includes('flaky') || output.includes('retry')) {
        console.log('   ❌ Flaky tests detected - 0 tolerance policy');
        return {
          passed: false,
          passed: totalPassed,
          failed: totalFailed + 1,
          skipped: totalSkipped,
          flaky: 1,
          output
        };
      }

      // Check for skipped tests
      const skippedMatch = output.match(/(\d+)\s*(skipped|pending)/i);
      if (skippedMatch && parseInt(skippedMatch[1]) > 0) {
        const skipped = parseInt(skippedMatch[1]);
        console.log(`   ❌ ${skipped} skipped tests - 0 tolerance policy`);
        return {
          passed: false,
          passed: totalPassed,
          failed: totalFailed,
          skipped,
          flaky: 0,
          output
        };
      }

      return {
        passed: false,
        passed: totalPassed,
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

  console.log(`   ✅ Tests passed (${totalPassed} total)`);
  return {
    passed: true,
    passed: totalPassed,
    failed: 0,
    skipped: 0,
    flaky: 0
  };
}

/**
 * Run security scan (basic)
 */
async function runSecurityScan() {
  console.log('\n🔒 Running security scan...');

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
    if (!fs.existsSync(file)) continue;
    if (file.includes('node_modules') || file.includes('.git')) continue;

    try {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          console.log(`   ❌ Potential secret detected in ${file}`);
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

  console.log('   ✅ No secrets detected');
  return { passed: true, critical: 0, high: 0, medium: 0 };
}

/**
 * Push to remote
 */
function pushToRemote() {
  console.log('\n📤 Pushing to remote...');

  try {
    runCommand('git push', { silent: false });
    console.log('   ✅ Pushed successfully!');
    return true;
  } catch (err) {
    console.log('   ❌ Push failed:', err.message);
    return false;
  }
}

/**
 * Print summary
 */
function printSummary(results, duration) {
  console.log('\n' + '═'.repeat(50));
  console.log('                 QUALITY SUMMARY');
  console.log('═'.repeat(50));

  const status = results.allPassed ? '✅ ALL CHECKS PASSED' : '❌ CHECKS FAILED';
  console.log(`\n  ${status}`);
  console.log(`  Duration: ${(duration / 1000).toFixed(1)}s\n`);

  console.log('  Lint:      ' + (results.lint.passed ? '✅' : '❌'));
  console.log('  Typecheck: ' + (results.typecheck.passed ? '✅' : '❌'));
  console.log('  Tests:     ' + (results.tests.passed ? '✅' : '❌'));
  console.log('  Security:  ' + (results.security.passed ? '✅' : '❌'));

  if (results.tests.passed) {
    console.log(`\n  Tests: ${results.tests.passed} passed, ${results.tests.skipped} skipped`);
  }

  console.log('\n' + '═'.repeat(50));
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs();
  const startTime = Date.now();

  console.log('\n🔄 CTOC Quality Agent');
  console.log(`   Triggered by: ${args.triggeredBy}`);
  console.log(`   On success: ${args.onSuccess}`);

  // Recover from any interrupted runs
  qualityState.recoverIfNeeded();

  // Try to acquire lock
  if (!qualityState.acquireLock()) {
    console.log('\n⏳ Another quality check is running. Exiting.');
    process.exit(0);
  }

  try {
    // Set running state
    qualityState.setRunning(args.triggeredBy);

    // Detect tools
    console.log('\n🔍 Detecting tools...');
    const detection = toolDetector.detectTools();

    if (detection.languages.length === 0) {
      console.log('   ⚠️ No supported languages detected');
      qualityState.setCompleted(true, {});
      return;
    }

    console.log(`   Languages: ${detection.languages.join(', ')}`);

    // Check for missing tools
    if (detection.missing.length > 0) {
      console.log('\n⚠️  Missing tools:');
      for (const m of detection.missing) {
        console.log(`   • ${m.tool}: ${m.install}`);
      }
    }

    // Run all checks
    const results = {
      lint: await runLint(detection.tools),
      typecheck: await runTypecheck(detection.tools),
      tests: await runTests(detection.tools),
      security: await runSecurityScan()
    };

    results.allPassed = results.lint.passed &&
                        results.typecheck.passed &&
                        results.tests.passed &&
                        results.security.passed;

    const duration = Date.now() - startTime;

    // Update state
    qualityState.setCompleted(results.allPassed, {
      tests: results.tests,
      coverage: 0, // TODO: implement coverage
      lint: results.lint,
      typecheck: results.typecheck,
      security: results.security
    });

    // Print summary
    printSummary(results, duration);

    // Handle success/failure
    if (results.allPassed) {
      if (args.onSuccess === 'push') {
        pushToRemote();
      }
    } else {
      console.log('\n💡 Fix the issues above and commit again to retry.');
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

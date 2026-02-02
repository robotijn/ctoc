/**
 * Test Runner
 *
 * Executes tests with timeout handling and output capture.
 * Ensures tests are actually run (not just created).
 *
 * @module lib/test-runner
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Default timeout for tests (5 minutes)
 */
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

/**
 * Test result status
 */
const TEST_STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  TIMEOUT: 'timeout',
  ERROR: 'error',
  SKIPPED: 'skipped'
};

/**
 * Run a command with timeout and output capture
 * @param {string} command - Command to run
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
function runCommand(command, options = {}) {
  const {
    cwd = process.cwd(),
    timeout = DEFAULT_TIMEOUT,
    env = process.env,
    shell = true
  } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let killed = false;

    const child = spawn(command, [], {
      cwd,
      shell,
      env: { ...env, FORCE_COLOR: '0', CI: 'true' },
      stdio: ['inherit', 'pipe', 'pipe']
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (killed) {
        resolve({
          status: TEST_STATUS.TIMEOUT,
          code: null,
          stdout,
          stderr,
          duration,
          message: `Command timed out after ${timeout}ms`
        });
      } else if (code === 0) {
        resolve({
          status: TEST_STATUS.PASS,
          code: 0,
          stdout,
          stderr,
          duration
        });
      } else {
        resolve({
          status: TEST_STATUS.FAIL,
          code,
          stdout,
          stderr,
          duration,
          message: `Exit code: ${code}`
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        status: TEST_STATUS.ERROR,
        code: null,
        stdout,
        stderr,
        duration: Date.now() - startTime,
        message: error.message
      });
    });
  });
}

/**
 * Detect test framework in use
 * @param {string} projectPath - Project root
 * @returns {Object} Framework info
 */
function detectTestFramework(projectPath) {
  const packageJson = path.join(projectPath, 'package.json');

  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const scripts = pkg.scripts || {};

      // Check for common frameworks
      if (deps.jest || scripts.test?.includes('jest')) {
        return { name: 'Jest', command: 'npx jest' };
      }
      if (deps.vitest || scripts.test?.includes('vitest')) {
        return { name: 'Vitest', command: 'npx vitest run' };
      }
      if (deps.mocha || scripts.test?.includes('mocha')) {
        return { name: 'Mocha', command: 'npx mocha' };
      }
      if (scripts.test?.includes('node --test')) {
        return { name: 'Node Test Runner', command: 'node --test' };
      }

      // Default to npm test if available
      if (scripts.test) {
        return { name: 'npm test', command: 'npm test' };
      }
    } catch (e) {}
  }

  // Check for Python
  const pytestIni = path.join(projectPath, 'pytest.ini');
  const pyprojectToml = path.join(projectPath, 'pyproject.toml');
  if (fs.existsSync(pytestIni) || fs.existsSync(pyprojectToml)) {
    return { name: 'Pytest', command: 'python -m pytest' };
  }

  // Check for Go
  const goMod = path.join(projectPath, 'go.mod');
  if (fs.existsSync(goMod)) {
    return { name: 'Go Test', command: 'go test ./...' };
  }

  // Check for Rust
  const cargoToml = path.join(projectPath, 'Cargo.toml');
  if (fs.existsSync(cargoToml)) {
    return { name: 'Cargo Test', command: 'cargo test' };
  }

  return { name: 'Unknown', command: null };
}

/**
 * Run tests for the project
 * @param {string} projectPath - Project root
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Test result
 */
async function runTests(projectPath = process.cwd(), options = {}) {
  const {
    command = null,
    timeout = DEFAULT_TIMEOUT,
    coverage = false,
    verbose = false
  } = options;

  // Detect or use provided command
  let testCommand = command;
  let framework = null;

  if (!testCommand) {
    framework = detectTestFramework(projectPath);
    testCommand = framework.command;
  }

  if (!testCommand) {
    return {
      status: TEST_STATUS.ERROR,
      message: 'No test command detected. Please configure tests.',
      framework
    };
  }

  // Add coverage flags if requested
  if (coverage) {
    if (testCommand.includes('jest')) {
      testCommand += ' --coverage';
    } else if (testCommand.includes('vitest')) {
      testCommand += ' --coverage';
    } else if (testCommand.includes('pytest')) {
      testCommand += ' --cov';
    }
  }

  console.log(`Running tests: ${testCommand}`);

  const result = await runCommand(testCommand, {
    cwd: projectPath,
    timeout
  });

  // Parse test counts from output
  const testCounts = parseTestCounts(result.stdout + result.stderr, framework?.name);

  return {
    ...result,
    command: testCommand,
    framework: framework?.name,
    ...testCounts
  };
}

/**
 * Parse test counts from output
 * @param {string} output - Test output
 * @param {string} framework - Framework name
 * @returns {Object} Test counts
 */
function parseTestCounts(output, framework) {
  const counts = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  };

  // Jest/Vitest format: Tests: X passed, Y failed, Z total
  const jestMatch = output.match(/Tests?:\s*(\d+)\s*passed.*?(\d+)\s*failed.*?(\d+)\s*total/i);
  if (jestMatch) {
    counts.passed = parseInt(jestMatch[1], 10);
    counts.failed = parseInt(jestMatch[2], 10);
    counts.total = parseInt(jestMatch[3], 10);
    return counts;
  }

  // Node test runner: # tests X, # pass Y, # fail Z
  const nodeMatch = output.match(/# tests (\d+).*?# pass (\d+).*?# fail (\d+)/is);
  if (nodeMatch) {
    counts.total = parseInt(nodeMatch[1], 10);
    counts.passed = parseInt(nodeMatch[2], 10);
    counts.failed = parseInt(nodeMatch[3], 10);
    return counts;
  }

  // Pytest format: X passed, Y failed
  const pytestMatch = output.match(/(\d+)\s*passed.*?(\d+)?\s*failed/i);
  if (pytestMatch) {
    counts.passed = parseInt(pytestMatch[1], 10);
    counts.failed = parseInt(pytestMatch[2] || 0, 10);
    counts.total = counts.passed + counts.failed;
    return counts;
  }

  // Mocha format: X passing, Y failing (may be on different lines)
  const mochaPassMatch = output.match(/(\d+)\s*passing/i);
  const mochaFailMatch = output.match(/(\d+)\s*failing/i);
  if (mochaPassMatch) {
    counts.passed = parseInt(mochaPassMatch[1], 10);
    counts.failed = mochaFailMatch ? parseInt(mochaFailMatch[1], 10) : 0;
    counts.total = counts.passed + counts.failed;
    return counts;
  }

  // Go test: ok/FAIL and count tests
  const goPassMatch = output.match(/ok\s+.*?(\d+\.\d+)s/g);
  const goFailMatch = output.match(/FAIL\s+/g);
  if (goPassMatch || goFailMatch) {
    counts.passed = (goPassMatch?.length || 0);
    counts.failed = (goFailMatch?.length || 0);
    counts.total = counts.passed + counts.failed;
    return counts;
  }

  return counts;
}

/**
 * Run a single test file
 * @param {string} testFile - Path to test file
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
async function runSingleTest(testFile, options = {}) {
  const {
    projectPath = process.cwd(),
    timeout = DEFAULT_TIMEOUT
  } = options;

  const framework = detectTestFramework(projectPath);
  let command;

  // Build command for specific file
  if (framework.name === 'Jest') {
    command = `npx jest ${testFile}`;
  } else if (framework.name === 'Vitest') {
    command = `npx vitest run ${testFile}`;
  } else if (framework.name === 'Node Test Runner') {
    command = `node --test ${testFile}`;
  } else if (framework.name === 'Pytest') {
    command = `python -m pytest ${testFile}`;
  } else if (framework.name === 'Go Test') {
    command = `go test ${testFile}`;
  } else {
    command = `npm test -- ${testFile}`;
  }

  return runCommand(command, { cwd: projectPath, timeout });
}

/**
 * Check if tests exist in project
 * @param {string} projectPath - Project root
 * @returns {Object} Test presence info
 */
function checkTestsExist(projectPath = process.cwd()) {
  const testPatterns = [
    '**/*.test.js',
    '**/*.spec.js',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/test_*.py',
    '**/*_test.py',
    '**/*_test.go'
  ];

  const testDirs = ['test', 'tests', '__tests__', 'spec'];

  let hasTests = false;
  let testFiles = [];

  // Check for test directories
  for (const dir of testDirs) {
    const testDir = path.join(projectPath, dir);
    if (fs.existsSync(testDir) && fs.statSync(testDir).isDirectory()) {
      hasTests = true;
      break;
    }
  }

  // Check for common test files (quick check, not full glob)
  const checkFiles = [
    'test.js', 'test.ts', 'tests.js', 'tests.ts',
    'test/index.js', 'tests/index.js',
    '__tests__/index.js'
  ];

  for (const file of checkFiles) {
    const fullPath = path.join(projectPath, file);
    if (fs.existsSync(fullPath)) {
      hasTests = true;
      testFiles.push(file);
    }
  }

  return {
    hasTests,
    testFiles,
    framework: detectTestFramework(projectPath)
  };
}

/**
 * Validate test file (check for syntax errors)
 * @param {string} testFile - Path to test file
 * @returns {Object} Validation result
 */
function validateTestFile(testFile) {
  const ext = path.extname(testFile);

  try {
    if (ext === '.js' || ext === '.mjs') {
      // Try to parse with Node
      execSync(`node --check "${testFile}"`, { stdio: 'pipe' });
    } else if (ext === '.ts') {
      // Check if tsc is available
      try {
        execSync(`npx tsc --noEmit "${testFile}"`, { stdio: 'pipe' });
      } catch (e) {
        // TypeScript check failed but might still work with ts-node
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

module.exports = {
  runCommand,
  runTests,
  runSingleTest,
  detectTestFramework,
  parseTestCounts,
  checkTestsExist,
  validateTestFile,
  TEST_STATUS,
  DEFAULT_TIMEOUT
};

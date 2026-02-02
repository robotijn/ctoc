/**
 * Local CI Tests
 *
 * Tests for CI parser, test runner, and local CI orchestration.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Modules under test
const {
  parseCIConfig,
  detectCISystem,
  detectCheckType,
  filterRelevantChecks,
  getDefaultChecks,
  detectDefaultContainer,
  CHECK_TYPES,
  CI_SYSTEMS
} = require('../lib/ci-parser');

const {
  runCommand,
  detectTestFramework,
  parseTestCounts,
  checkTestsExist,
  TEST_STATUS,
  DEFAULT_TIMEOUT
} = require('../lib/test-runner');

const {
  runLocalCI,
  getChecks,
  willCIPass,
  CI_STATUS
} = require('../lib/local-ci');

describe('CI Parser', () => {
  describe('CHECK_TYPES', () => {
    it('should define all check types', () => {
      assert.strictEqual(CHECK_TYPES.LINT, 'lint');
      assert.strictEqual(CHECK_TYPES.TEST, 'test');
      assert.strictEqual(CHECK_TYPES.TYPE_CHECK, 'type-check');
      assert.strictEqual(CHECK_TYPES.BUILD, 'build');
      assert.strictEqual(CHECK_TYPES.COVERAGE, 'coverage');
      assert.strictEqual(CHECK_TYPES.SECURITY, 'security');
    });
  });

  describe('detectCheckType', () => {
    it('should detect lint commands', () => {
      assert.strictEqual(detectCheckType('npm run lint'), CHECK_TYPES.LINT);
      assert.strictEqual(detectCheckType('eslint .'), CHECK_TYPES.LINT);
      assert.strictEqual(detectCheckType('npx eslint src/'), CHECK_TYPES.LINT);
    });

    it('should detect test commands', () => {
      assert.strictEqual(detectCheckType('npm test'), CHECK_TYPES.TEST);
      assert.strictEqual(detectCheckType('jest'), CHECK_TYPES.TEST);
      assert.strictEqual(detectCheckType('npx vitest'), CHECK_TYPES.TEST);
      assert.strictEqual(detectCheckType('pytest'), CHECK_TYPES.TEST);
      assert.strictEqual(detectCheckType('cargo test'), CHECK_TYPES.TEST);
    });

    it('should detect type check commands', () => {
      assert.strictEqual(detectCheckType('tsc --noEmit'), CHECK_TYPES.TYPE_CHECK);
      assert.strictEqual(detectCheckType('npm run typecheck'), CHECK_TYPES.TYPE_CHECK);
      assert.strictEqual(detectCheckType('mypy .'), CHECK_TYPES.TYPE_CHECK);
    });

    it('should detect build commands', () => {
      assert.strictEqual(detectCheckType('npm run build'), CHECK_TYPES.BUILD);
      assert.strictEqual(detectCheckType('cargo build'), CHECK_TYPES.BUILD);
    });

    it('should detect security commands', () => {
      assert.strictEqual(detectCheckType('npm audit'), CHECK_TYPES.SECURITY);
      assert.strictEqual(detectCheckType('snyk test'), CHECK_TYPES.SECURITY);
    });

    it('should return unknown for unrecognized commands', () => {
      assert.strictEqual(detectCheckType('echo hello'), CHECK_TYPES.UNKNOWN);
      assert.strictEqual(detectCheckType('ls -la'), CHECK_TYPES.UNKNOWN);
    });
  });

  describe('filterRelevantChecks', () => {
    it('should keep test and lint checks', () => {
      const checks = [
        { command: 'npm test', type: CHECK_TYPES.TEST },
        { command: 'npm run lint', type: CHECK_TYPES.LINT }
      ];
      const filtered = filterRelevantChecks(checks);
      assert.strictEqual(filtered.length, 2);
    });

    it('should filter out install steps', () => {
      const checks = [
        { command: 'npm install', type: CHECK_TYPES.INSTALL },
        { command: 'npm test', type: CHECK_TYPES.TEST }
      ];
      const filtered = filterRelevantChecks(checks);
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].type, CHECK_TYPES.TEST);
    });

    it('should filter out echo commands', () => {
      const checks = [
        { command: 'echo "Hello"', type: CHECK_TYPES.UNKNOWN },
        { command: 'npm test', type: CHECK_TYPES.TEST }
      ];
      const filtered = filterRelevantChecks(checks);
      assert.strictEqual(filtered.length, 1);
    });
  });

  describe('CI_SYSTEMS', () => {
    it('should define all supported systems', () => {
      assert.ok(CI_SYSTEMS.github);
      assert.ok(CI_SYSTEMS.gitlab);
      assert.ok(CI_SYSTEMS.jenkins);
      assert.ok(CI_SYSTEMS.circleci);
    });

    it('should have detect function for each system', () => {
      for (const [name, config] of Object.entries(CI_SYSTEMS)) {
        assert.strictEqual(typeof config.detect, 'function', `${name} should have detect function`);
      }
    });
  });
});

describe('Test Runner', () => {
  describe('TEST_STATUS', () => {
    it('should define all status values', () => {
      assert.strictEqual(TEST_STATUS.PASS, 'pass');
      assert.strictEqual(TEST_STATUS.FAIL, 'fail');
      assert.strictEqual(TEST_STATUS.TIMEOUT, 'timeout');
      assert.strictEqual(TEST_STATUS.ERROR, 'error');
    });
  });

  describe('DEFAULT_TIMEOUT', () => {
    it('should be 5 minutes', () => {
      assert.strictEqual(DEFAULT_TIMEOUT, 5 * 60 * 1000);
    });
  });

  describe('parseTestCounts', () => {
    it('should parse Jest output', () => {
      const output = 'Tests: 10 passed, 2 failed, 12 total';
      const counts = parseTestCounts(output, 'Jest');
      assert.strictEqual(counts.passed, 10);
      assert.strictEqual(counts.failed, 2);
      assert.strictEqual(counts.total, 12);
    });

    it('should parse Node test runner output', () => {
      const output = '# tests 100\n# pass 95\n# fail 5';
      const counts = parseTestCounts(output, 'Node Test Runner');
      assert.strictEqual(counts.total, 100);
      assert.strictEqual(counts.passed, 95);
      assert.strictEqual(counts.failed, 5);
    });

    it('should parse Pytest output', () => {
      const output = '10 passed, 2 failed in 5.2s';
      const counts = parseTestCounts(output, 'Pytest');
      assert.strictEqual(counts.passed, 10);
      assert.strictEqual(counts.failed, 2);
    });

    it('should parse Mocha output', () => {
      const output = '20 passing (500ms)\n3 failing';
      const counts = parseTestCounts(output, 'Mocha');
      assert.strictEqual(counts.passed, 20);
      assert.strictEqual(counts.failed, 3);
    });
  });

  describe('runCommand', () => {
    it('should run simple commands', async () => {
      const result = await runCommand('echo "hello"');
      assert.strictEqual(result.status, TEST_STATUS.PASS);
      assert.ok(result.stdout.includes('hello'));
    });

    it('should capture exit codes', async () => {
      const result = await runCommand('exit 1');
      assert.strictEqual(result.status, TEST_STATUS.FAIL);
      assert.strictEqual(result.code, 1);
    });

    it('should timeout long commands', async () => {
      const result = await runCommand('sleep 10', { timeout: 100 });
      assert.strictEqual(result.status, TEST_STATUS.TIMEOUT);
    });
  });
});

describe('Local CI', () => {
  describe('CI_STATUS', () => {
    it('should define all status values', () => {
      assert.strictEqual(CI_STATUS.PASS, 'pass');
      assert.strictEqual(CI_STATUS.FAIL, 'fail');
      assert.strictEqual(CI_STATUS.PARTIAL, 'partial');
      assert.strictEqual(CI_STATUS.ERROR, 'error');
    });
  });

  describe('getChecks', () => {
    it('should return array of checks', () => {
      const checks = getChecks(process.cwd());
      assert.ok(Array.isArray(checks));
    });
  });
});

describe('Integration Tests', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctoc-ci-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (e) {}
  });

  describe('detectCISystem', () => {
    it('should detect GitHub Actions', async () => {
      const workflowDir = path.join(tempDir, '.github', 'workflows');
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(path.join(workflowDir, 'ci.yml'), 'name: CI\non: push');

      const result = detectCISystem(tempDir);
      assert.strictEqual(result.system, 'github');
    });

    it('should detect GitLab CI', async () => {
      await fs.writeFile(path.join(tempDir, '.gitlab-ci.yml'), 'stages:\n  - test');

      const result = detectCISystem(tempDir);
      assert.strictEqual(result.system, 'gitlab');
    });

    it('should return null when no CI found', async () => {
      const result = detectCISystem(tempDir);
      assert.strictEqual(result, null);
    });
  });

  describe('detectDefaultContainer', () => {
    it('should detect Node.js project', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test', engines: { node: '20' } })
      );

      const container = detectDefaultContainer(tempDir);
      assert.ok(container.includes('node'));
      assert.ok(container.includes('20'));
    });

    it('should detect Python project', async () => {
      await fs.writeFile(path.join(tempDir, 'requirements.txt'), 'flask==2.0');

      const container = detectDefaultContainer(tempDir);
      assert.ok(container.includes('python'));
    });

    it('should detect Go project', async () => {
      await fs.writeFile(path.join(tempDir, 'go.mod'), 'module test');

      const container = detectDefaultContainer(tempDir);
      assert.ok(container.includes('golang'));
    });

    it('should return null for unknown project', async () => {
      const container = detectDefaultContainer(tempDir);
      assert.strictEqual(container, null);
    });
  });

  describe('getDefaultChecks', () => {
    it('should return checks based on package.json scripts', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'test',
          scripts: {
            test: 'jest',
            lint: 'eslint .'
          }
        })
      );

      const checks = getDefaultChecks(tempDir);
      assert.ok(checks.length >= 2);
      assert.ok(checks.some(c => c.type === CHECK_TYPES.TEST));
      assert.ok(checks.some(c => c.type === CHECK_TYPES.LINT));
    });
  });

  describe('detectTestFramework', () => {
    it('should detect Jest', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          devDependencies: { jest: '^29.0.0' }
        })
      );

      const framework = detectTestFramework(tempDir);
      assert.strictEqual(framework.name, 'Jest');
    });

    it('should detect Vitest', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          devDependencies: { vitest: '^1.0.0' }
        })
      );

      const framework = detectTestFramework(tempDir);
      assert.strictEqual(framework.name, 'Vitest');
    });

    it('should detect Pytest', async () => {
      await fs.writeFile(path.join(tempDir, 'pytest.ini'), '[pytest]');

      const framework = detectTestFramework(tempDir);
      assert.strictEqual(framework.name, 'Pytest');
    });
  });

  describe('parseCIConfig', () => {
    it('should parse GitHub Actions workflow', async () => {
      const workflowDir = path.join(tempDir, '.github', 'workflows');
      await fs.mkdir(workflowDir, { recursive: true });

      const workflow = `
name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm test
`;
      await fs.writeFile(path.join(workflowDir, 'ci.yml'), workflow);

      const config = parseCIConfig(tempDir);
      assert.strictEqual(config.found, true);
      assert.strictEqual(config.system, 'github');
      assert.ok(config.checks.length >= 1);
    });

    it('should use defaults when no CI config', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ scripts: { test: 'jest', lint: 'eslint' } })
      );

      const config = parseCIConfig(tempDir);
      assert.strictEqual(config.found, false);
      assert.ok(config.checks.length >= 1);
    });
  });

  describe('runLocalCI', () => {
    it('should run simple checks', async () => {
      const result = await runLocalCI(tempDir, {
        checks: [
          { name: 'Echo Test', command: 'echo "test"', type: CHECK_TYPES.TEST }
        ],
        verbose: false
      });

      assert.strictEqual(result.status, CI_STATUS.PASS);
      assert.strictEqual(result.passed, 1);
      assert.strictEqual(result.failed, 0);
    });

    it('should report failures', async () => {
      const result = await runLocalCI(tempDir, {
        checks: [
          { name: 'Failing Test', command: 'exit 1', type: CHECK_TYPES.TEST }
        ],
        verbose: false
      });

      assert.strictEqual(result.status, CI_STATUS.FAIL);
      assert.strictEqual(result.passed, 0);
      assert.strictEqual(result.failed, 1);
    });

    it('should handle mixed results', async () => {
      const result = await runLocalCI(tempDir, {
        checks: [
          { name: 'Pass', command: 'echo pass', type: CHECK_TYPES.TEST },
          { name: 'Fail', command: 'exit 1', type: CHECK_TYPES.TEST }
        ],
        verbose: false
      });

      assert.strictEqual(result.status, CI_STATUS.PARTIAL);
      assert.strictEqual(result.passed, 1);
      assert.strictEqual(result.failed, 1);
    });
  });
});

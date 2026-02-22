/**
 * Deployment Pipeline Tests
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  DEFAULT_CONFIG,
  getDeploymentConfig,
  mergeConfig,
  runDeploymentPipeline,
  buildDeploymentContext,
  deployToEnvironment,
  executeStrategy,
  rollback,
  getDeploymentHistory,
  logDeployment,
  writeLatestStatus
} = require('../src/lib/deployment.js');

let testDir;

function setup() {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-test-'));
  fs.mkdirSync(path.join(testDir, '.ctoc'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'plans', 'done'), { recursive: true });
}

function cleanup() {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

function writeSettings(config) {
  fs.writeFileSync(
    path.join(testDir, '.ctoc', 'settings.json'),
    JSON.stringify({ deployment: config }, null, 2)
  );
}

function createPlanFile(name) {
  const planPath = path.join(testDir, 'plans', 'done', name);
  fs.writeFileSync(planPath, `# ${name}\n\nTest plan content.`);
  return planPath;
}

// --- DEFAULT_CONFIG tests ---

function testDefaultConfig() {
  assert.strictEqual(DEFAULT_CONFIG.enabled, false, 'Default config is disabled');
  assert.ok(Array.isArray(DEFAULT_CONFIG.environments), 'Has environments array');
  assert.strictEqual(DEFAULT_CONFIG.environments.length, 3, 'Has 3 default environments');
  assert.strictEqual(DEFAULT_CONFIG.environments[0].name, 'development', 'First env is development');
  assert.strictEqual(DEFAULT_CONFIG.environments[1].name, 'staging', 'Second env is staging');
  assert.strictEqual(DEFAULT_CONFIG.environments[2].name, 'production', 'Third env is production');
  assert.strictEqual(DEFAULT_CONFIG.approval.production, 'manual', 'Production approval defaults to manual');
  assert.strictEqual(DEFAULT_CONFIG.approval.staging, 'auto', 'Staging approval defaults to auto');
  assert.strictEqual(DEFAULT_CONFIG.rollback.auto_rollback, true, 'Auto-rollback defaults to true');
  assert.strictEqual(DEFAULT_CONFIG.rollback.keep_history, 10, 'Keep history defaults to 10');
  console.log('# DEFAULT_CONFIG structure');
}

// --- getDeploymentConfig tests ---

function testGetDeploymentConfigDefaults() {
  setup();
  const config = getDeploymentConfig(testDir);
  assert.strictEqual(config.enabled, false, 'Disabled by default');
  assert.strictEqual(config.environments.length, 3, 'Has 3 environments');
  assert.strictEqual(config.rollback.auto_rollback, true, 'Auto-rollback on');
  cleanup();
  console.log('# getDeploymentConfig() defaults');
}

function testGetDeploymentConfigCustom() {
  setup();
  writeSettings({
    enabled: true,
    environments: [
      { name: 'staging', enabled: true, strategy: 'webhook', url: 'https://example.com/deploy' }
    ],
    approval: { production: 'auto' }
  });

  const config = getDeploymentConfig(testDir);
  assert.strictEqual(config.enabled, true, 'Custom enabled');
  assert.strictEqual(config.environments.length, 1, 'Custom environments');
  assert.strictEqual(config.environments[0].strategy, 'webhook', 'Custom strategy');
  assert.strictEqual(config.approval.production, 'auto', 'Custom approval');
  assert.strictEqual(config.approval.staging, 'auto', 'Default staging approval preserved');
  cleanup();
  console.log('# getDeploymentConfig() custom');
}

function testGetDeploymentConfigMissing() {
  setup();
  // No settings.json at all
  const config = getDeploymentConfig(testDir);
  assert.strictEqual(config.enabled, false, 'Falls back to defaults when no file');
  assert.strictEqual(config.environments.length, 3, 'Default environments');
  cleanup();
  console.log('# getDeploymentConfig() missing file');
}

function testGetDeploymentConfigInvalidJson() {
  setup();
  fs.writeFileSync(
    path.join(testDir, '.ctoc', 'settings.json'),
    'not valid json'
  );
  const config = getDeploymentConfig(testDir);
  assert.strictEqual(config.enabled, false, 'Falls back to defaults on invalid JSON');
  cleanup();
  console.log('# getDeploymentConfig() invalid JSON');
}

// --- mergeConfig tests ---

function testMergeConfigBasic() {
  const defaults = { a: 1, b: 'hello', c: true };
  const overrides = { b: 'world' };
  const result = mergeConfig(defaults, overrides);
  assert.strictEqual(result.a, 1, 'Keeps default for missing key');
  assert.strictEqual(result.b, 'world', 'Uses override value');
  assert.strictEqual(result.c, true, 'Keeps default for other missing key');
  console.log('# mergeConfig() basic');
}

function testMergeConfigNested() {
  const defaults = { outer: { inner: 'default', other: true } };
  const overrides = { outer: { inner: 'custom' } };
  const result = mergeConfig(defaults, overrides);
  assert.strictEqual(result.outer.inner, 'custom', 'Overrides nested value');
  assert.strictEqual(result.outer.other, true, 'Keeps default nested value');
  console.log('# mergeConfig() nested');
}

function testMergeConfigArrays() {
  const defaults = { list: [1, 2, 3] };
  const overrides = { list: [4, 5] };
  const result = mergeConfig(defaults, overrides);
  assert.deepStrictEqual(result.list, [4, 5], 'Arrays are replaced, not merged');
  console.log('# mergeConfig() arrays');
}

function testMergeConfigExtraKeys() {
  const defaults = { a: 1 };
  const overrides = { a: 2, b: 3 };
  const result = mergeConfig(defaults, overrides);
  assert.strictEqual(result.a, 2, 'Override value');
  assert.strictEqual(result.b, 3, 'Extra key from overrides preserved');
  console.log('# mergeConfig() extra keys');
}

// --- Environment pipeline tests ---

function testPipelineSkippedWhenDisabled() {
  setup();
  const planPath = createPlanFile('test-plan.md');
  // Default config has enabled: false
  return runDeploymentPipeline(planPath, testDir).then(result => {
    assert.strictEqual(result.status, 'skipped', 'Pipeline skipped');
    assert.strictEqual(result.reason, 'Deployment pipeline is disabled', 'Correct reason');
    cleanup();
    console.log('# Pipeline skipped when disabled');
  });
}

function testPipelineSkippedNoEnvironments() {
  setup();
  writeSettings({ enabled: true, environments: [] });
  const planPath = createPlanFile('test-plan.md');
  return runDeploymentPipeline(planPath, testDir).then(result => {
    assert.strictEqual(result.status, 'skipped', 'Pipeline skipped');
    assert.strictEqual(result.reason, 'No environments enabled', 'Correct reason');
    cleanup();
    console.log('# Pipeline skipped — no environments enabled');
  });
}

function testPipelineRunsEnabledEnvironments() {
  setup();
  writeSettings({
    enabled: true,
    environments: [
      { name: 'development', enabled: true, strategy: 'git-branch', branch: 'deploy/dev' },
      { name: 'staging', enabled: false, strategy: 'git-branch', branch: 'deploy/staging' },
      { name: 'production', enabled: true, strategy: 'git-branch', branch: 'deploy/prod' }
    ],
    approval: { production: 'auto', staging: 'auto' }
  });
  const planPath = createPlanFile('test-plan.md');
  return runDeploymentPipeline(planPath, testDir).then(result => {
    assert.strictEqual(result.status, 'success', 'Pipeline succeeded');
    // Only enabled envs should appear
    assert.strictEqual(result.environments.length, 2, 'Two environments processed');
    assert.strictEqual(result.environments[0].name, 'development', 'Development first');
    assert.strictEqual(result.environments[0].status, 'success', 'Development succeeded');
    assert.strictEqual(result.environments[1].name, 'production', 'Production second');
    assert.strictEqual(result.environments[1].status, 'success', 'Production succeeded');
    cleanup();
    console.log('# Pipeline runs enabled environments');
  });
}

function testPipelineStopsOnFailure() {
  setup();
  writeSettings({
    enabled: true,
    environments: [
      { name: 'staging', enabled: true, strategy: 'webhook' },  // No URL = will fail
      { name: 'production', enabled: true, strategy: 'git-branch', branch: 'deploy/prod' }
    ],
    approval: { production: 'auto', staging: 'auto' },
    rollback: { auto_rollback: false, keep_history: 10 }
  });
  const planPath = createPlanFile('test-plan.md');
  return runDeploymentPipeline(planPath, testDir).then(result => {
    assert.strictEqual(result.status, 'failed', 'Pipeline failed');
    assert.strictEqual(result.environments[0].name, 'staging', 'Staging was attempted');
    assert.strictEqual(result.environments[0].status, 'failed', 'Staging failed');
    assert.strictEqual(result.environments[1].name, 'production', 'Production present');
    assert.strictEqual(result.environments[1].status, 'skipped', 'Production skipped after failure');
    cleanup();
    console.log('# Pipeline stops on failure');
  });
}

function testPipelineManualApproval() {
  setup();
  writeSettings({
    enabled: true,
    environments: [
      { name: 'staging', enabled: true, strategy: 'git-branch', branch: 'deploy/staging' },
      { name: 'production', enabled: true, strategy: 'git-branch', branch: 'deploy/prod' }
    ],
    approval: { production: 'manual', staging: 'auto' }
  });
  const planPath = createPlanFile('test-plan.md');
  return runDeploymentPipeline(planPath, testDir).then(result => {
    // Staging succeeds, production waits for manual approval
    assert.strictEqual(result.environments.length, 2, 'Two environments');
    assert.strictEqual(result.environments[0].name, 'staging', 'Staging first');
    assert.strictEqual(result.environments[0].status, 'success', 'Staging succeeded');
    assert.strictEqual(result.environments[1].name, 'production', 'Production second');
    assert.strictEqual(result.environments[1].status, 'awaiting-approval', 'Production awaiting approval');
    cleanup();
    console.log('# Pipeline pauses for manual approval');
  });
}

// --- Strategy execution tests ---

function testStrategyGitBranch() {
  const env = { name: 'staging', strategy: 'git-branch', branch: 'deploy/staging' };
  const context = { commit: 'abc123', branch: 'main' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.name, 'staging', 'Correct name');
    assert.strictEqual(result.status, 'success', 'Succeeded');
    assert.ok(result.duration >= 0, 'Has duration');
    console.log('# Strategy: git-branch');
  });
}

function testStrategyGitTag() {
  const env = { name: 'production', strategy: 'git-tag' };
  const context = { commit: 'def456', branch: 'main' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'success', 'Succeeded');
    console.log('# Strategy: git-tag');
  });
}

function testStrategyWebhookSuccess() {
  const env = { name: 'staging', strategy: 'webhook', url: 'https://example.com/deploy' };
  const context = { commit: 'abc123', branch: 'main', plan: 'test.md', timestamp: '2026-02-22' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'success', 'Succeeded');
    console.log('# Strategy: webhook (success)');
  });
}

function testStrategyWebhookMissingUrl() {
  const env = { name: 'staging', strategy: 'webhook' };
  const context = { commit: 'abc123' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'failed', 'Failed due to missing URL');
    assert.ok(result.error.includes('not configured'), 'Error mentions missing config');
    console.log('# Strategy: webhook (missing URL)');
  });
}

function testStrategyScript() {
  const env = { name: 'staging', strategy: 'script', script: './deploy.sh' };
  const context = { commit: 'abc123' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'success', 'Succeeded');
    console.log('# Strategy: script');
  });
}

function testStrategyScriptMissing() {
  const env = { name: 'staging', strategy: 'script' };
  const context = { commit: 'abc123' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'failed', 'Failed due to missing script');
    console.log('# Strategy: script (missing)');
  });
}

function testStrategyDocker() {
  const env = { name: 'production', strategy: 'docker', image: 'myapp', imageTag: 'latest' };
  const context = { commit: 'abc123' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'success', 'Succeeded');
    console.log('# Strategy: docker');
  });
}

function testStrategySsh() {
  const env = { name: 'production', strategy: 'ssh', host: 'prod.example.com', user: 'deploy' };
  const context = { commit: 'abc123' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'success', 'Succeeded');
    console.log('# Strategy: ssh');
  });
}

function testStrategySshMissingHost() {
  const env = { name: 'production', strategy: 'ssh' };
  const context = { commit: 'abc123' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'failed', 'Failed due to missing host');
    console.log('# Strategy: ssh (missing host)');
  });
}

function testStrategyUnknown() {
  const env = { name: 'staging', strategy: 'ftp' };
  const context = { commit: 'abc123' };
  return deployToEnvironment(env, context).then(result => {
    assert.strictEqual(result.status, 'failed', 'Failed for unknown strategy');
    assert.ok(result.error.includes('Unknown deployment strategy'), 'Error mentions unknown strategy');
    console.log('# Strategy: unknown');
  });
}

// --- executeStrategy tests ---

async function testExecuteStrategyDispatch() {
  const context = { commit: 'abc123', branch: 'main' };

  // git-branch should work
  const gitBranchResult = await executeStrategy('git-branch', { name: 'dev', branch: 'deploy/dev' }, context);
  assert.ok(gitBranchResult, 'git-branch returns result');

  // Unknown should reject
  try {
    await executeStrategy('unknown-strategy', { name: 'dev' }, context);
    assert.fail('Should have thrown for unknown strategy');
  } catch (err) {
    assert.ok(err.message.includes('Unknown deployment strategy'), 'Throws for unknown strategy');
  }

  console.log('# executeStrategy() dispatch');
}

// --- Deployment history tests ---

function testDeploymentHistoryEmpty() {
  setup();
  const history = getDeploymentHistory(testDir);
  assert.deepStrictEqual(history, [], 'Empty history when no file');
  cleanup();
  console.log('# getDeploymentHistory() empty');
}

function testLogDeployment() {
  setup();
  const entry = {
    plan: 'test-plan.md',
    commit: 'abc123',
    timestamp: '2026-02-22T10:00:00Z',
    environments: [{ name: 'staging', status: 'success' }],
    status: 'success'
  };

  logDeployment(entry, testDir);

  const history = getDeploymentHistory(testDir);
  assert.strictEqual(history.length, 1, 'One entry in history');
  assert.strictEqual(history[0].plan, 'test-plan.md', 'Plan name preserved');
  assert.strictEqual(history[0].commit, 'abc123', 'Commit preserved');
  cleanup();
  console.log('# logDeployment()');
}

function testLogDeploymentMultiple() {
  setup();

  logDeployment({ plan: 'plan-1.md', commit: 'aaa', status: 'success' }, testDir);
  logDeployment({ plan: 'plan-2.md', commit: 'bbb', status: 'success' }, testDir);
  logDeployment({ plan: 'plan-3.md', commit: 'ccc', status: 'failed' }, testDir);

  const history = getDeploymentHistory(testDir);
  assert.strictEqual(history.length, 3, 'Three entries');
  // Newest first
  assert.strictEqual(history[0].plan, 'plan-3.md', 'Newest first');
  assert.strictEqual(history[2].plan, 'plan-1.md', 'Oldest last');
  cleanup();
  console.log('# logDeployment() multiple entries');
}

function testHistoryCapping() {
  setup();
  writeSettings({
    enabled: true,
    rollback: { auto_rollback: true, keep_history: 3 }
  });

  for (let i = 0; i < 5; i++) {
    logDeployment({ plan: `plan-${i}.md`, commit: `commit-${i}`, status: 'success' }, testDir);
  }

  const history = getDeploymentHistory(testDir);
  assert.strictEqual(history.length, 3, 'History capped at keep_history');
  assert.strictEqual(history[0].plan, 'plan-4.md', 'Newest preserved');
  assert.strictEqual(history[2].plan, 'plan-2.md', 'Oldest within cap preserved');
  cleanup();
  console.log('# History capping');
}

function testHistoryInvalidJson() {
  setup();
  const deploymentsDir = path.join(testDir, '.ctoc', 'deployments');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(path.join(deploymentsDir, 'history.json'), 'not valid json');

  const history = getDeploymentHistory(testDir);
  assert.deepStrictEqual(history, [], 'Returns empty on invalid JSON');
  cleanup();
  console.log('# getDeploymentHistory() invalid JSON');
}

// --- writeLatestStatus tests ---

function testWriteLatestStatus() {
  setup();
  const entry = { plan: 'test.md', status: 'success', commit: 'abc123' };
  writeLatestStatus(entry, testDir);

  const latestPath = path.join(testDir, '.ctoc', 'deployments', 'latest.json');
  assert.ok(fs.existsSync(latestPath), 'latest.json created');

  const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  assert.strictEqual(latest.plan, 'test.md', 'Plan preserved');
  assert.strictEqual(latest.status, 'success', 'Status preserved');
  cleanup();
  console.log('# writeLatestStatus()');
}

// --- Rollback tests ---

function testRollbackSuccess() {
  setup();

  // Log a successful deployment
  logDeployment({
    plan: 'old-plan.md',
    commit: 'old-commit',
    timestamp: '2026-02-21T10:00:00Z',
    environments: [{ name: 'staging', status: 'success' }],
    status: 'success'
  }, testDir);

  return rollback('staging', testDir).then(result => {
    assert.strictEqual(result.status, 'rolled-back', 'Status is rolled-back');
    assert.ok(result.environments.some(e => e.name === 'staging'), 'Has staging environment');

    // Check it was logged
    const history = getDeploymentHistory(testDir);
    assert.strictEqual(history[0].status, 'rolled-back', 'Rollback logged in history');
    cleanup();
    console.log('# rollback() success');
  });
}

function testRollbackNoHistory() {
  setup();
  return rollback('production', testDir).then(
    () => assert.fail('Should have thrown'),
    err => {
      assert.ok(err.message.includes('No previous successful deployment'), 'Correct error message');
      cleanup();
      console.log('# rollback() no history');
    }
  );
}

// --- buildDeploymentContext tests ---

function testBuildDeploymentContext() {
  setup();
  const planPath = createPlanFile('my-feature.md');
  const context = buildDeploymentContext(planPath, testDir, DEFAULT_CONFIG);

  assert.strictEqual(context.plan, 'my-feature.md', 'Plan basename extracted');
  assert.ok(context.timestamp, 'Has timestamp');
  assert.deepStrictEqual(context.environments, [], 'Starts with empty environments');
  assert.strictEqual(context.status, 'running', 'Initial status is running');
  cleanup();
  console.log('# buildDeploymentContext()');
}

// --- Integration: Gate 3 triggers deployment ---

function testGate3Integration() {
  // Verify that actions.js references deployment module
  const actionsPath = path.join(__dirname, '..', 'src', 'lib', 'actions.js');
  const actionsContent = fs.readFileSync(actionsPath, 'utf8');

  assert.ok(
    actionsContent.includes("require('./deployment')"),
    'actions.js imports deployment module'
  );
  assert.ok(
    actionsContent.includes("from === 'review' && to === 'done'"),
    'actions.js checks for Gate 3 transition'
  );
  assert.ok(
    actionsContent.includes('runDeploymentPipeline'),
    'actions.js calls runDeploymentPipeline'
  );
  console.log('# Gate 3 integration in actions.js');
}

// --- Config validation tests ---

function testConfigValidation() {
  setup();
  writeSettings({
    enabled: true,
    environments: [
      { name: 'production', enabled: true, strategy: 'git-branch', branch: 'deploy/prod' }
    ]
  });

  const config = getDeploymentConfig(testDir);
  assert.strictEqual(config.enabled, true, 'Enabled flag read');
  assert.strictEqual(config.environments[0].name, 'production', 'Environment name');
  assert.strictEqual(config.environments[0].enabled, true, 'Environment enabled');
  assert.strictEqual(config.environments[0].strategy, 'git-branch', 'Strategy');
  assert.strictEqual(config.environments[0].branch, 'deploy/prod', 'Branch');
  cleanup();
  console.log('# Config validation');
}

// --- Pipeline writes status files ---

function testPipelineWritesStatusFiles() {
  setup();
  writeSettings({
    enabled: true,
    environments: [
      { name: 'development', enabled: true, strategy: 'git-branch', branch: 'deploy/dev' }
    ],
    approval: { staging: 'auto', production: 'auto' }
  });
  const planPath = createPlanFile('status-test.md');

  return runDeploymentPipeline(planPath, testDir).then(result => {
    // Check latest.json
    const latestPath = path.join(testDir, '.ctoc', 'deployments', 'latest.json');
    assert.ok(fs.existsSync(latestPath), 'latest.json created');

    // Check history.json
    const historyPath = path.join(testDir, '.ctoc', 'deployments', 'history.json');
    assert.ok(fs.existsSync(historyPath), 'history.json created');

    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    assert.ok(history.length > 0, 'History has entries');
    cleanup();
    console.log('# Pipeline writes status files');
  });
}

// --- Run all tests ---

async function runTests() {
  console.log('\nDeployment Pipeline Tests\n');

  // Sync tests
  testDefaultConfig();
  testGetDeploymentConfigDefaults();
  testGetDeploymentConfigCustom();
  testGetDeploymentConfigMissing();
  testGetDeploymentConfigInvalidJson();
  testMergeConfigBasic();
  testMergeConfigNested();
  testMergeConfigArrays();
  testMergeConfigExtraKeys();
  testDeploymentHistoryEmpty();
  testLogDeployment();
  testLogDeploymentMultiple();
  testHistoryCapping();
  testHistoryInvalidJson();
  testWriteLatestStatus();
  testBuildDeploymentContext();
  testGate3Integration();
  testConfigValidation();

  // Async tests
  await testExecuteStrategyDispatch();
  await testPipelineSkippedWhenDisabled();
  await testPipelineSkippedNoEnvironments();
  await testPipelineRunsEnabledEnvironments();
  await testPipelineStopsOnFailure();
  await testPipelineManualApproval();
  await testStrategyGitBranch();
  await testStrategyGitTag();
  await testStrategyWebhookSuccess();
  await testStrategyWebhookMissingUrl();
  await testStrategyScript();
  await testStrategyScriptMissing();
  await testStrategyDocker();
  await testStrategySsh();
  await testStrategySshMissingHost();
  await testStrategyUnknown();
  await testRollbackSuccess();
  await testRollbackNoHistory();
  await testPipelineWritesStatusFiles();

  console.log('\nAll deployment tests passed!\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

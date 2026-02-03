/**
 * Tests for lib/runner-settings.js
 *
 * @module tests/runner-settings.test
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temporary test directory
let testDir;
let realHomedir;

function setup() {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-settings-test-'));
  // Mock os.homedir to use test directory
  realHomedir = os.homedir;
  os.homedir = () => testDir;
}

function cleanup() {
  // Restore original homedir
  if (realHomedir) {
    os.homedir = realHomedir;
  }
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Re-require the module after setting up mock
function getModule() {
  // Clear cache to pick up mocked homedir
  delete require.cache[require.resolve('../lib/runner-settings')];
  return require('../lib/runner-settings');
}

// Test getDefaultSettings function
function testGetDefaultSettings() {
  const { getDefaultSettings } = getModule();
  const defaults = getDefaultSettings();

  assert.ok(defaults.ci, 'Has ci property');
  assert.strictEqual(defaults.ci.runner_preference, null, 'runner_preference is null');
  assert.strictEqual(defaults.ci.self_hosted_configured, false, 'self_hosted_configured is false');
  assert.strictEqual(defaults.ci.runner_path, null, 'runner_path is null');
  assert.ok(Array.isArray(defaults.ci.runner_labels), 'runner_labels is array');
  assert.ok(defaults.ci.runner_labels.includes('self-hosted'), 'Has self-hosted label');
  assert.ok(defaults.ci.runner_labels.includes('local'), 'Has local label');
  console.log('  [OK] testGetDefaultSettings');
}

// Test loadSettings function when no file exists
function testLoadSettingsDefault() {
  const { loadSettings } = getModule();
  const settings = loadSettings();

  assert.strictEqual(settings.ci.runner_preference, null, 'runner_preference is null');
  assert.strictEqual(settings.ci.self_hosted_configured, false, 'self_hosted_configured is false');
  console.log('  [OK] testLoadSettingsDefault');
}

// Test loadSettings function when file exists
function testLoadSettingsFromFile() {
  const { loadSettings } = getModule();

  // Create settings file
  const ctocDir = path.join(testDir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });
  fs.writeFileSync(
    path.join(ctocDir, 'settings.yaml'),
    `
ci:
  runner_preference: "github"
  self_hosted_configured: true
  runner_path: "/home/test/actions-runner"
`
  );

  const settings = loadSettings();
  assert.strictEqual(settings.ci.runner_preference, 'github', 'runner_preference is github');
  assert.strictEqual(settings.ci.self_hosted_configured, true, 'self_hosted_configured is true');
  assert.strictEqual(settings.ci.runner_path, '/home/test/actions-runner', 'runner_path is correct');
  console.log('  [OK] testLoadSettingsFromFile');
}

// Test saveSettings function
function testSaveSettings() {
  const { saveSettings, getDefaultSettings } = getModule();

  const settings = getDefaultSettings();
  settings.ci.runner_preference = 'self-hosted';
  settings.ci.self_hosted_configured = true;
  saveSettings(settings);

  const ctocDir = path.join(testDir, '.ctoc');
  assert.ok(fs.existsSync(ctocDir), 'Created .ctoc directory');

  const content = fs.readFileSync(path.join(ctocDir, 'settings.yaml'), 'utf8');
  assert.ok(content.includes('runner_preference: "self-hosted"'), 'Contains runner_preference');
  assert.ok(content.includes('self_hosted_configured: true'), 'Contains self_hosted_configured');
  console.log('  [OK] testSaveSettings');
}

// Test getRunnerPreference function
function testGetRunnerPreference() {
  const { getRunnerPreference, setRunnerPreference } = getModule();

  // Initially null
  const pref1 = getRunnerPreference();
  assert.strictEqual(pref1, null, 'Initially null');

  // After setting
  setRunnerPreference('github');
  const pref2 = getRunnerPreference();
  assert.strictEqual(pref2, 'github', 'Returns github after set');
  console.log('  [OK] testGetRunnerPreference');
}

// Test setRunnerPreference function
function testSetRunnerPreference() {
  const { setRunnerPreference, getRunnerPreference, loadSettings } = getModule();

  // Set github
  setRunnerPreference('github');
  assert.strictEqual(getRunnerPreference(), 'github', 'Set github');

  // Set self-hosted
  setRunnerPreference('self-hosted');
  assert.strictEqual(getRunnerPreference(), 'self-hosted', 'Set self-hosted');

  // Set hybrid
  setRunnerPreference('hybrid');
  assert.strictEqual(getRunnerPreference(), 'hybrid', 'Set hybrid');

  // Reset to null
  setRunnerPreference(null);
  assert.strictEqual(getRunnerPreference(), null, 'Reset to null');

  // Check asked_at is set
  setRunnerPreference('github');
  const settings = loadSettings();
  assert.ok(settings.ci.asked_at, 'asked_at is set');
  console.log('  [OK] testSetRunnerPreference');
}

// Test markSelfHostedConfigured function
function testMarkSelfHostedConfigured() {
  const { markSelfHostedConfigured, loadSettings } = getModule();

  const runnerPath = '/home/test/actions-runner';
  markSelfHostedConfigured(runnerPath);

  const settings = loadSettings();
  assert.strictEqual(settings.ci.self_hosted_configured, true, 'self_hosted_configured is true');
  assert.strictEqual(settings.ci.runner_path, runnerPath, 'runner_path is correct');
  console.log('  [OK] testMarkSelfHostedConfigured');
}

// Test hasAskedPreference function
function testHasAskedPreference() {
  const { hasAskedPreference, setRunnerPreference } = getModule();

  // Initially false
  const asked1 = hasAskedPreference();
  assert.strictEqual(asked1, false, 'Initially false');

  // After setting
  setRunnerPreference('github');
  const asked2 = hasAskedPreference();
  assert.strictEqual(asked2, true, 'True after set');

  // After reset
  setRunnerPreference(null);
  const asked3 = hasAskedPreference();
  assert.strictEqual(asked3, false, 'False after reset to null');
  console.log('  [OK] testHasAskedPreference');
}

// Run all tests
function runTests() {
  console.log('\nrunner-settings.test.js');
  console.log('='.repeat(50));

  setup();

  try {
    testGetDefaultSettings();

    // Clean and setup for each test that needs fresh state
    cleanup();
    setup();
    testLoadSettingsDefault();

    cleanup();
    setup();
    testLoadSettingsFromFile();

    cleanup();
    setup();
    testSaveSettings();

    cleanup();
    setup();
    testGetRunnerPreference();

    cleanup();
    setup();
    testSetRunnerPreference();

    cleanup();
    setup();
    testMarkSelfHostedConfigured();

    cleanup();
    setup();
    testHasAskedPreference();

    console.log('\n[OK] All runner-settings tests passed\n');
  } finally {
    cleanup();
  }
}

// Run tests when executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };

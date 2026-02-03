/**
 * Tests for lib/runner-detect.js
 *
 * @module tests/runner-detect.test
 */

const assert = require('assert');

const {
  REQUIREMENTS,
  isWSL,
  detectPlatform,
  checkRAM,
  checkDisk,
  checkNode,
  checkPython,
  checkDocker,
  checkGit,
  checkExistingRunner,
  runAllChecks,
  formatPrerequisites
} = require('../lib/runner-detect');

// Test REQUIREMENTS constants
function testRequirements() {
  assert.strictEqual(REQUIREMENTS.MIN_RAM_MB, 2048, 'MIN_RAM_MB is 2048');
  assert.strictEqual(REQUIREMENTS.MIN_DISK_GB, 10, 'MIN_DISK_GB is 10');
  assert.ok(REQUIREMENTS.SUPPORTED_PLATFORMS.includes('linux'), 'Supports linux');
  assert.ok(REQUIREMENTS.SUPPORTED_PLATFORMS.includes('darwin'), 'Supports darwin');
  assert.ok(REQUIREMENTS.SUPPORTED_ARCH.includes('x64'), 'Supports x64');
  assert.ok(REQUIREMENTS.SUPPORTED_ARCH.includes('arm64'), 'Supports arm64');
  console.log('  [OK] testRequirements');
}

// Test isWSL function
function testIsWSL() {
  const result = isWSL();
  assert.strictEqual(typeof result, 'boolean', 'isWSL returns boolean');
  console.log('  [OK] testIsWSL');
}

// Test detectPlatform function
function testDetectPlatform() {
  const result = detectPlatform();
  assert.ok(result.platform, 'Has platform');
  assert.ok(result.arch, 'Has arch');
  assert.strictEqual(typeof result.wsl, 'boolean', 'wsl is boolean');
  assert.strictEqual(typeof result.supported, 'boolean', 'supported is boolean');
  assert.ok(result.displayName, 'Has displayName');
  console.log('  [OK] testDetectPlatform');
}

// Test checkRAM function
function testCheckRAM() {
  const result = checkRAM();
  assert.strictEqual(result.name, 'RAM', 'name is RAM');
  assert.strictEqual(typeof result.ok, 'boolean', 'ok is boolean');
  assert.ok(result.version, 'Has version');
  assert.ok(result.version.includes('MB'), 'Version includes MB');
  console.log('  [OK] testCheckRAM');
}

// Test checkDisk function
function testCheckDisk() {
  const result = checkDisk();
  assert.strictEqual(result.name, 'Disk Space', 'name is Disk Space');
  assert.strictEqual(typeof result.ok, 'boolean', 'ok is boolean');
  assert.ok(result.version, 'Has version');
  console.log('  [OK] testCheckDisk');
}

// Test checkNode function
function testCheckNode() {
  const result = checkNode();
  assert.strictEqual(result.name, 'Node.js', 'name is Node.js');
  assert.strictEqual(typeof result.ok, 'boolean', 'ok is boolean');
  assert.ok(result.version, 'Has version');
  // Node should be available in test environment
  assert.strictEqual(result.ok, true, 'Node.js detected');
  console.log('  [OK] testCheckNode');
}

// Test checkPython function
function testCheckPython() {
  const result = checkPython();
  assert.strictEqual(result.name, 'Python', 'name is Python');
  assert.strictEqual(typeof result.ok, 'boolean', 'ok is boolean');
  assert.ok(result.version, 'Has version');
  console.log('  [OK] testCheckPython');
}

// Test checkDocker function
function testCheckDocker() {
  const result = checkDocker();
  assert.strictEqual(result.name, 'Docker', 'name is Docker');
  assert.strictEqual(typeof result.ok, 'boolean', 'ok is boolean');
  assert.ok(result.version, 'Has version');
  console.log('  [OK] testCheckDocker');
}

// Test checkGit function
function testCheckGit() {
  const result = checkGit();
  assert.strictEqual(result.name, 'Git', 'name is Git');
  assert.strictEqual(typeof result.ok, 'boolean', 'ok is boolean');
  assert.ok(result.version, 'Has version');
  // Git should be available in test environment
  assert.strictEqual(result.ok, true, 'Git detected');
  console.log('  [OK] testCheckGit');
}

// Test checkExistingRunner function
function testCheckExistingRunner() {
  const result = checkExistingRunner();
  assert.strictEqual(typeof result.installed, 'boolean', 'installed is boolean');
  assert.strictEqual(typeof result.configured, 'boolean', 'configured is boolean');
  assert.strictEqual(typeof result.running, 'boolean', 'running is boolean');

  // Test non-existent path
  const noRunner = checkExistingRunner('/nonexistent/path');
  assert.strictEqual(noRunner.installed, false, 'Not installed at nonexistent path');
  assert.strictEqual(noRunner.configured, false, 'Not configured at nonexistent path');
  console.log('  [OK] testCheckExistingRunner');
}

// Test runAllChecks function
function testRunAllChecks() {
  const result = runAllChecks();
  assert.ok(result.platform, 'Has platform');
  assert.ok(result.system, 'Has system');
  assert.ok(result.system.ram, 'Has system.ram');
  assert.ok(result.system.disk, 'Has system.disk');
  assert.ok(result.required, 'Has required');
  assert.ok(result.required.git, 'Has required.git');
  assert.ok(result.optional, 'Has optional');
  assert.ok(result.optional.node, 'Has optional.node');
  assert.ok(result.optional.python, 'Has optional.python');
  assert.ok(result.optional.docker, 'Has optional.docker');
  assert.ok(result.existingRunner, 'Has existingRunner');
  assert.ok(result.summary, 'Has summary');
  assert.strictEqual(typeof result.summary.canInstall, 'boolean', 'canInstall is boolean');
  console.log('  [OK] testRunAllChecks');
}

// Test formatPrerequisites function
function testFormatPrerequisites() {
  const checks = runAllChecks();
  const result = formatPrerequisites(checks);
  assert.strictEqual(typeof result, 'string', 'Returns string');
  assert.ok(result.includes('PREREQUISITES CHECK'), 'Contains header');
  assert.ok(result.includes('Platform:'), 'Contains Platform');
  assert.ok(result.includes('System Requirements:'), 'Contains System Requirements');
  assert.ok(result.includes('Required Tools:'), 'Contains Required Tools');
  assert.ok(result.includes('Optional Tools'), 'Contains Optional Tools');
  console.log('  [OK] testFormatPrerequisites');
}

// Run all tests
function runTests() {
  console.log('\nrunner-detect.test.js');
  console.log('='.repeat(50));

  testRequirements();
  testIsWSL();
  testDetectPlatform();
  testCheckRAM();
  testCheckDisk();
  testCheckNode();
  testCheckPython();
  testCheckDocker();
  testCheckGit();
  testCheckExistingRunner();
  testRunAllChecks();
  testFormatPrerequisites();

  console.log('\n[OK] All runner-detect tests passed\n');
}

// Run tests when executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };

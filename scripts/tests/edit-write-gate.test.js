#!/usr/bin/env node
/**
 * Tests for Edit/Write Gate Hook - Iron Loop Enforcement
 *
 * Tests the core Iron Loop enforcement logic:
 * 1. Edit/Write blocked when step < 7 (planning incomplete)
 * 2. Edit/Write allowed when step >= 7 (implementation phase)
 * 3. Edit/Write allowed when escape phrase detected ("skip planning", "quick fix")
 * 4. Whitelisted files bypass enforcement
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

// Test utilities
const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'edit-write-gate.js');
const TEST_PROJECT = path.join(os.tmpdir(), 'ctoc-gate-test-' + Date.now());
const IRON_LOOP_DIR = path.join(os.homedir(), '.ctoc', 'iron-loop');

// Track test results
let passed = 0;
let failed = 0;

/**
 * Create a test project directory with .ctoc structure
 */
function setupTestProject() {
  fs.mkdirSync(TEST_PROJECT, { recursive: true });
  fs.mkdirSync(path.join(TEST_PROJECT, '.ctoc'), { recursive: true });
  fs.mkdirSync(path.join(TEST_PROJECT, 'plans', 'functional', 'draft'), { recursive: true });
  fs.mkdirSync(path.join(TEST_PROJECT, 'plans', 'functional', 'approved'), { recursive: true });
  fs.mkdirSync(path.join(TEST_PROJECT, 'plans', 'implementation', 'draft'), { recursive: true });
  fs.mkdirSync(path.join(TEST_PROJECT, 'plans', 'implementation', 'approved'), { recursive: true });
}

/**
 * Clean up test project
 */
function cleanupTestProject() {
  try {
    fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Create Iron Loop state file for test project
 */
function createIronLoopState(state) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(TEST_PROJECT).digest('hex').substring(0, 16);
  const statePath = path.join(IRON_LOOP_DIR, `${hash}.json`);

  fs.mkdirSync(IRON_LOOP_DIR, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  return statePath;
}

/**
 * Remove Iron Loop state file
 */
function removeIronLoopState() {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(TEST_PROJECT).digest('hex').substring(0, 16);
  const statePath = path.join(IRON_LOOP_DIR, `${hash}.json`);

  try {
    fs.unlinkSync(statePath);
  } catch (e) {
    // Ignore if doesn't exist
  }
}

/**
 * Create a settings file for the test project
 */
function createSettings(settings) {
  const settingsPath = path.join(TEST_PROJECT, '.ctoc', 'settings.yaml');
  const lines = [];

  if (settings.enforcement) {
    lines.push('enforcement:');
    if (settings.enforcement.mode) {
      lines.push(`  mode: ${settings.enforcement.mode}`);
    }
    if (settings.enforcement.escape_phrases) {
      lines.push('  escape_phrases:');
      for (const phrase of settings.enforcement.escape_phrases) {
        lines.push(`    - "${phrase}"`);
      }
    }
    if (settings.enforcement.whitelist) {
      lines.push('  whitelist:');
      for (const pattern of settings.enforcement.whitelist) {
        lines.push(`    - "${pattern}"`);
      }
    }
  }

  fs.writeFileSync(settingsPath, lines.join('\n'));
}

/**
 * Run the hook with given environment
 */
function runHook(env = {}) {
  const result = spawnSync('node', [HOOK_PATH], {
    cwd: TEST_PROJECT,
    env: {
      ...process.env,
      ...env
    },
    encoding: 'utf8'
  });

  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

/**
 * Assert helper
 */
function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.log(`  FAIL: ${message}`);
  }
}

// ============================================================================
// Test Cases
// ============================================================================

console.log('\n=== Edit/Write Gate Tests ===\n');

// Setup
setupTestProject();

// Test 1: Block when no feature context (strict mode)
console.log('Test 1: Block when no feature context (strict mode)');
{
  removeIronLoopState();
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' })
  });

  assert(result.exitCode === 1, 'Should exit with code 1 (blocked)');
  assert(result.stdout.includes('NO FEATURE CONTEXT') || result.stdout.includes('BLOCKED'),
         'Should mention no feature context or blocked');
}

// Test 2: Allow when escape phrase detected (no feature context)
console.log('\nTest 2: Allow when escape phrase detected (no feature context)');
{
  removeIronLoopState();
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' }),
    CLAUDE_USER_MESSAGE: 'quick fix for the bug'
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed)');
}

// Test 3: Block when step < 7 (planning incomplete)
console.log('\nTest 3: Block when step < 7 (planning incomplete)');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 3,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' })
  });

  assert(result.exitCode === 1, 'Should exit with code 1 (blocked)');
  assert(result.stdout.includes('BLOCKED') || result.stdout.includes('Planning'),
         'Should indicate planning not complete');
}

// Test 4: Allow when step >= 7 (implementation phase)
console.log('\nTest 4: Allow when step >= 7 (implementation phase)');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 7,
    steps: {
      3: { status: 'completed' },
      6: { status: 'completed' }
    }
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' })
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed)');
}

// Test 5: Allow when step >= 7 (step 9 - IMPLEMENT)
console.log('\nTest 5: Allow when step 9 (IMPLEMENT phase)');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 9,
    steps: {
      3: { status: 'completed' },
      6: { status: 'completed' },
      7: { status: 'completed' },
      8: { status: 'completed' }
    }
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' })
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed)');
}

// Test 6: Allow when "skip planning" escape phrase used
console.log('\nTest 6: Allow when "skip planning" escape phrase used');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 2,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' }),
    CLAUDE_USER_MESSAGE: 'skip planning, just do it'
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed via escape phrase)');
}

// Test 7: Allow when "trivial fix" escape phrase used
console.log('\nTest 7: Allow when "trivial fix" escape phrase used');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 1,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' }),
    CLAUDE_USER_MESSAGE: 'this is a trivial fix'
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed via escape phrase)');
}

// Test 8: Whitelist - Allow .md files
console.log('\nTest 8: Whitelist - Allow .md files');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 1,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'README.md' })
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (whitelisted file)');
}

// Test 9: Whitelist - Allow .yaml files
console.log('\nTest 9: Whitelist - Allow .yaml files');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 2,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'config.yaml' })
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (whitelisted file)');
}

// Test 10: Whitelist - Allow .ctoc/** files
console.log('\nTest 10: Whitelist - Allow .ctoc/** files');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 3,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '.ctoc/settings.yaml' })
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (whitelisted path)');
}

// Test 11: Soft mode - warn but allow
console.log('\nTest 11: Soft mode - warn but allow');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 2,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'soft' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' })
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (soft mode allows)');
}

// Test 12: Off mode - no checking
console.log('\nTest 12: Off mode - no checking');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 1,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'off' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' })
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (enforcement off)');
}

// Test 13: Block at step 6 (spec - still planning)
console.log('\nTest 13: Block at step 6 (SPEC - still planning)');
{
  createIronLoopState({
    project: TEST_PROJECT,
    feature: 'Test Feature',
    currentStep: 6,
    steps: {}
  });
  createSettings({ enforcement: { mode: 'strict' } });

  const result = runHook({
    CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' })
  });

  assert(result.exitCode === 1, 'Should exit with code 1 (step 6 is still planning)');
}

// Cleanup
cleanupTestProject();
removeIronLoopState();

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}

console.log('\nAll tests passed!\n');

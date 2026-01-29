#!/usr/bin/env node
/**
 * Tests for Parallel Implementation Permission feature
 *
 * Tests cover:
 * - DEFAULT_SETTINGS constant
 * - getQueuedPlans() helper
 * - Usage link display logic
 * - Background implementation menu
 * - Check-in prompt logic
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Test utilities
function createTempDir() {
  const tempDir = path.join(os.tmpdir(), `ctoc-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanup(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Test: DEFAULT_SETTINGS constant
// ============================================================================

function testDefaultSettings() {
  console.log('Test: DEFAULT_SETTINGS constant');

  const { DEFAULT_SETTINGS } = require('../lib/utils');

  // Check display settings
  assert.strictEqual(DEFAULT_SETTINGS.display.usage_link_frequency, 'daily',
    'Default usage link frequency should be "daily"');
  assert.strictEqual(DEFAULT_SETTINGS.display.step_bar_color, 'orange',
    'Default step bar color should be "orange"');
  assert.strictEqual(DEFAULT_SETTINGS.display.feature_bar_style, 'rainbow',
    'Default feature bar style should be "rainbow"');

  // Check implementation settings
  assert.strictEqual(DEFAULT_SETTINGS.implementation.mode, 'background',
    'Default implementation mode should be "background"');
  assert.strictEqual(DEFAULT_SETTINGS.implementation.permission, 'check-in',
    'Default implementation permission should be "check-in"');
  assert.strictEqual(DEFAULT_SETTINGS.implementation.check_in_interval, 15,
    'Default check-in interval should be 15 minutes');

  console.log('  PASS: DEFAULT_SETTINGS has correct values');
}

// ============================================================================
// Test: getQueuedPlans() helper
// ============================================================================

function testGetQueuedPlans() {
  console.log('Test: getQueuedPlans() helper');

  const { getQueuedPlans, ensurePlanDirectories } = require('../lib/utils');

  const tempDir = createTempDir();

  try {
    // Setup plan directories
    ensurePlanDirectories(tempDir);

    // Create some approved implementation plans
    const approvedDir = path.join(tempDir, 'plans', 'implementation', 'approved');

    const plan1 = `# Plan 1\n\n## Summary\nTest plan 1\n`;
    const plan2 = `# Plan 2\n\n## Summary\nTest plan 2\n`;
    const plan3 = `# Plan 3\n\n## Summary\nTest plan 3\n`;

    fs.writeFileSync(path.join(approvedDir, '2026-01-29-001-plan1.md'), plan1);
    fs.writeFileSync(path.join(approvedDir, '2026-01-29-002-plan2.md'), plan2);
    fs.writeFileSync(path.join(approvedDir, '2026-01-29-003-plan3.md'), plan3);

    // Get queued plans
    const queuedPlans = getQueuedPlans(tempDir);

    assert.strictEqual(queuedPlans.length, 3, 'Should find 3 queued plans');

    // Verify plan names
    const planNames = queuedPlans.map(p => p.name);
    assert(planNames.includes('2026-01-29-001-plan1'), 'Should include plan1');
    assert(planNames.includes('2026-01-29-002-plan2'), 'Should include plan2');
    assert(planNames.includes('2026-01-29-003-plan3'), 'Should include plan3');

    console.log('  PASS: getQueuedPlans() returns correct plans');

    // Test empty directory
    cleanup(tempDir);
    fs.mkdirSync(tempDir, { recursive: true });
    ensurePlanDirectories(tempDir);

    const emptyResult = getQueuedPlans(tempDir);
    assert.strictEqual(emptyResult.length, 0, 'Should return empty array when no plans');

    console.log('  PASS: getQueuedPlans() handles empty directory');

  } finally {
    cleanup(tempDir);
  }
}

// ============================================================================
// Test: shouldShowUsageLink() logic
// ============================================================================

function testUsageLinkLogic() {
  console.log('Test: Usage link display logic');

  const { shouldShowUsageLink, DEFAULT_SETTINGS } = require('../lib/utils');

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Test "always" setting
  assert.strictEqual(
    shouldShowUsageLink('always', yesterday),
    true,
    'Should show usage link when frequency is "always"'
  );

  assert.strictEqual(
    shouldShowUsageLink('always', today),
    true,
    'Should show usage link when frequency is "always" even if shown today'
  );

  // Test "never" setting
  assert.strictEqual(
    shouldShowUsageLink('never', null),
    false,
    'Should not show usage link when frequency is "never"'
  );

  assert.strictEqual(
    shouldShowUsageLink('never', yesterday),
    false,
    'Should not show usage link when frequency is "never" even if not shown'
  );

  // Test "daily" setting
  assert.strictEqual(
    shouldShowUsageLink('daily', null),
    true,
    'Should show usage link on first day (null last shown)'
  );

  assert.strictEqual(
    shouldShowUsageLink('daily', yesterday),
    true,
    'Should show usage link when last shown yesterday'
  );

  assert.strictEqual(
    shouldShowUsageLink('daily', today),
    false,
    'Should not show usage link when already shown today'
  );

  console.log('  PASS: Usage link display logic works correctly');
}

// ============================================================================
// Test: generateBackgroundMenu() output
// ============================================================================

function testBackgroundMenu() {
  console.log('Test: Background implementation menu');

  const { generateBackgroundMenu } = require('../lib/utils');

  // Test menu generation with 3 plans
  const menu = generateBackgroundMenu(3);

  // Verify menu contains key elements
  assert(menu.includes('Background Implementation Settings'),
    'Menu should have title');
  assert(menu.includes('3 plans queued'),
    'Menu should show plan count');
  assert(menu.includes('[1] Per plan'),
    'Menu should have per-plan option');
  assert(menu.includes('[2] Check-in'),
    'Menu should have check-in option');
  assert(menu.includes('[3] Auto-continue'),
    'Menu should have auto-continue option');
  assert(menu.includes('[S] Skip'),
    'Menu should have skip option');
  assert(menu.includes('https://claude.ai/settings/usage'),
    'Menu should include usage link');

  // Verify interval options
  assert(menu.includes('Every 5 min'), 'Menu should have 5 min option');
  assert(menu.includes('Every 15 min'), 'Menu should have 15 min option');
  assert(menu.includes('Every 60 min'), 'Menu should have 60 min option');
  assert(menu.includes('Every 180 min'), 'Menu should have 180 min option');

  console.log('  PASS: Background implementation menu generated correctly');

  // Test singular form
  const menuSingle = generateBackgroundMenu(1);
  assert(menuSingle.includes('1 plan queued'),
    'Menu should use singular "plan" for count of 1');

  console.log('  PASS: Menu uses correct singular/plural form');
}

// ============================================================================
// Test: Check-in prompt timing
// ============================================================================

function testCheckInTiming() {
  console.log('Test: Check-in prompt timing');

  const { shouldShowCheckIn } = require('../lib/utils');

  const now = Date.now();

  // Test with 15 minute interval
  const interval = 15;

  // Just started - should not show
  const justStarted = now;
  assert.strictEqual(
    shouldShowCheckIn(justStarted, interval, now),
    false,
    'Should not show check-in prompt at start'
  );

  // 10 minutes passed - should not show
  const tenMinutesAgo = now - (10 * 60 * 1000);
  assert.strictEqual(
    shouldShowCheckIn(tenMinutesAgo, interval, now),
    false,
    'Should not show check-in prompt before interval'
  );

  // 15 minutes passed - should show
  const fifteenMinutesAgo = now - (15 * 60 * 1000);
  assert.strictEqual(
    shouldShowCheckIn(fifteenMinutesAgo, interval, now),
    true,
    'Should show check-in prompt at interval'
  );

  // 20 minutes passed - should show
  const twentyMinutesAgo = now - (20 * 60 * 1000);
  assert.strictEqual(
    shouldShowCheckIn(twentyMinutesAgo, interval, now),
    true,
    'Should show check-in prompt after interval'
  );

  console.log('  PASS: Check-in prompt timing works correctly');
}

// ============================================================================
// Test: Settings persistence
// ============================================================================

function testSettingsPersistence() {
  console.log('Test: Settings persistence');

  const { loadSettings, saveSettings, DEFAULT_SETTINGS } = require('../lib/utils');

  const tempDir = createTempDir();
  const settingsPath = path.join(tempDir, '.ctoc', 'settings.json');

  try {
    // Create .ctoc directory
    fs.mkdirSync(path.join(tempDir, '.ctoc'), { recursive: true });

    // Test default settings when no file exists
    const defaultSettings = loadSettings(tempDir);
    assert.deepStrictEqual(
      defaultSettings,
      DEFAULT_SETTINGS,
      'Should return default settings when no file exists'
    );

    console.log('  PASS: Returns default settings when no file exists');

    // Test saving and loading custom settings
    const customSettings = {
      ...DEFAULT_SETTINGS,
      display: {
        ...DEFAULT_SETTINGS.display,
        usage_link_frequency: 'always',
        step_bar_color: 'blue'
      },
      implementation: {
        ...DEFAULT_SETTINGS.implementation,
        check_in_interval: 30
      }
    };

    saveSettings(tempDir, customSettings);

    const loadedSettings = loadSettings(tempDir);
    assert.strictEqual(
      loadedSettings.display.usage_link_frequency,
      'always',
      'Should persist usage link frequency'
    );
    assert.strictEqual(
      loadedSettings.display.step_bar_color,
      'blue',
      'Should persist step bar color'
    );
    assert.strictEqual(
      loadedSettings.implementation.check_in_interval,
      30,
      'Should persist check-in interval'
    );

    console.log('  PASS: Settings persist correctly');

  } finally {
    cleanup(tempDir);
  }
}

// ============================================================================
// Run all tests
// ============================================================================

function runAllTests() {
  console.log('\n========================================');
  console.log('Parallel Implementation Permission Tests');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    testDefaultSettings,
    testGetQueuedPlans,
    testUsageLinkLogic,
    testBackgroundMenu,
    testCheckInTiming,
    testSettingsPersistence
  ];

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${err.message}`);
      console.error(`        ${err.stack}`);
    }
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testDefaultSettings,
  testGetQueuedPlans,
  testUsageLinkLogic,
  testBackgroundMenu,
  testCheckInTiming,
  testSettingsPersistence,
  runAllTests
};

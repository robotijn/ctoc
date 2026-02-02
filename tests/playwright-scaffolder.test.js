/**
 * Playwright Scaffolder Tests
 * Tests for Playwright E2E testing setup
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

let PlaywrightScaffolder, setupPlaywright;

// Helper to create temp directory for testing
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-test-'));
}

function cleanupTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Test: PlaywrightScaffolder class exists and can be instantiated
function testPlaywrightScaffolderExists() {
  try {
    const module = require('../lib/playwright-scaffolder');
    PlaywrightScaffolder = module.PlaywrightScaffolder;
    setupPlaywright = module.setupPlaywright;

    const tempDir = createTempDir();
    try {
      const scaffolder = new PlaywrightScaffolder(tempDir);
      assert.ok(scaffolder, 'PlaywrightScaffolder should be instantiable');
      console.log('✓ PlaywrightScaffolder class exists and can be instantiated');
      return true;
    } finally {
      cleanupTempDir(tempDir);
    }
  } catch (e) {
    console.log('✗ PlaywrightScaffolder class not found or not instantiable:', e.message);
    return false;
  }
}

// Test: init() creates playwright.config.ts
async function testInitCreatesConfig() {
  const tempDir = createTempDir();
  try {
    // Create minimal web project
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir);
    const result = await scaffolder.init();

    assert.ok(result.success, 'Init should succeed');
    assert.ok(result.files.includes('playwright.config.ts'), 'Should create playwright.config.ts');
    assert.ok(fs.existsSync(path.join(tempDir, 'playwright.config.ts')), 'Config file should exist');
    console.log('✓ init() creates playwright.config.ts');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: init() creates example test file
async function testInitCreatesExampleTest() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir);
    const result = await scaffolder.init();

    assert.ok(result.success, 'Init should succeed');
    const hasExampleSpec = result.files.some(f => f.includes('example.spec.ts'));
    assert.ok(hasExampleSpec, 'Should create example.spec.ts');
    console.log('✓ init() creates example test file');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: init() with pageObjects option creates POM files
async function testInitCreatesPageObjects() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir, { pageObjects: true });
    const result = await scaffolder.init();

    assert.ok(result.success, 'Init should succeed');
    const hasBasePage = result.files.some(f => f.includes('BasePage.ts'));
    assert.ok(hasBasePage, 'Should create BasePage.ts');
    console.log('✓ init() with pageObjects option creates POM files');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: init() with ci option creates workflow file
async function testInitCreatesWorkflow() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir, { ci: true });
    const result = await scaffolder.init();

    assert.ok(result.success, 'Init should succeed');
    const hasWorkflow = result.files.some(f => f.includes('playwright.yml'));
    assert.ok(hasWorkflow, 'Should create playwright.yml');
    assert.ok(fs.existsSync(path.join(tempDir, '.github', 'workflows', 'playwright.yml')),
      'Workflow file should exist');
    console.log('✓ init() with ci option creates workflow file');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: generateConfig() includes framework-specific settings
function testGenerateConfigFrameworkSpecific() {
  const tempDir = createTempDir();
  try {
    // Create Next.js project
    fs.writeFileSync(path.join(tempDir, 'next.config.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { next: '14.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir);
    const config = scaffolder.generateConfig();

    assert.ok(config.includes('localhost:3000'), 'Config should include port 3000 for Next.js');
    assert.ok(config.includes('webServer'), 'Config should include webServer section');
    assert.ok(config.includes('npm run dev'), 'Config should include dev command');
    console.log('✓ generateConfig() includes framework-specific settings');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: generateExampleTest() creates valid test structure
function testGenerateExampleTest() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir);
    const testContent = scaffolder.generateExampleTest();

    assert.ok(testContent.includes('import { test, expect }'), 'Should import test and expect');
    assert.ok(testContent.includes('test.describe'), 'Should have test.describe blocks');
    assert.ok(testContent.includes('page.goto'), 'Should have navigation');
    console.log('✓ generateExampleTest() creates valid test structure');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: getInstallCommand returns correct npm command
function testGetInstallCommand() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir);
    const cmd = scaffolder.getInstallCommand();

    assert.ok(cmd.includes('npm install -D'), 'Should be dev dependency install');
    assert.ok(cmd.includes('@playwright/test'), 'Should include playwright');
    console.log('✓ getInstallCommand returns correct npm command');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: setupPlaywright helper function works
async function testSetupPlaywrightHelper() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { vue: '3.0.0' }
    }));

    const result = await setupPlaywright(tempDir);

    assert.ok(result.success, 'Setup should succeed');
    assert.ok(result.files.length > 0, 'Should create files');
    assert.ok(result.commands.length > 0, 'Should have commands');
    console.log('✓ setupPlaywright helper function works');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: Result includes summary message
async function testResultIncludesMessage() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir);
    const result = await scaffolder.init();

    assert.ok(result.message, 'Result should include message');
    assert.ok(result.message.includes('Playwright'), 'Message should mention Playwright');
    assert.ok(result.message.includes('Files created'), 'Message should list created files');
    console.log('✓ Result includes summary message');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: Config includes all browser projects
function testConfigIncludesBrowserProjects() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const scaffolder = new PlaywrightScaffolder(tempDir);
    const config = scaffolder.generateConfig();

    assert.ok(config.includes('chromium'), 'Should include chromium');
    assert.ok(config.includes('firefox'), 'Should include firefox');
    assert.ok(config.includes('webkit'), 'Should include webkit');
    assert.ok(config.includes('Mobile Chrome'), 'Should include Mobile Chrome');
    assert.ok(config.includes('Mobile Safari'), 'Should include Mobile Safari');
    console.log('✓ Config includes all browser projects');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Run all tests
async function runTests() {
  console.log('\n=== Playwright Scaffolder Tests ===\n');

  // First check if module exists
  if (!testPlaywrightScaffolderExists()) {
    console.log('\nSkipping remaining tests - PlaywrightScaffolder module not implemented yet\n');
    return { passed: 0, failed: 1, skipped: 9 };
  }

  let passed = 1;
  let failed = 0;

  const tests = [
    testInitCreatesConfig,
    testInitCreatesExampleTest,
    testInitCreatesPageObjects,
    testInitCreatesWorkflow,
    testGenerateConfigFrameworkSpecific,
    testGenerateExampleTest,
    testGetInstallCommand,
    testSetupPlaywrightHelper,
    testResultIncludesMessage,
    testConfigIncludesBrowserProjects
  ];

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (e) {
      console.log(`✗ ${test.name} failed:`, e.message);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  return { passed, failed, skipped: 0 };
}

// Export for test runner
module.exports = { runTests };

// Run if executed directly
if (require.main === module) {
  runTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}

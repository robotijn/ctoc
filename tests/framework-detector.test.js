/**
 * Framework Detector Tests
 * Tests for web framework auto-detection
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

let FrameworkDetector, FRAMEWORKS, detectFramework, isWebApplication;

// Helper to create temp directory for testing
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'framework-test-'));
}

function cleanupTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Test: FrameworkDetector class exists and can be instantiated
function testFrameworkDetectorExists() {
  try {
    const module = require('../src/lib/framework-detector');
    FrameworkDetector = module.FrameworkDetector;
    FRAMEWORKS = module.FRAMEWORKS;
    detectFramework = module.detectFramework;
    isWebApplication = module.isWebApplication;

    const tempDir = createTempDir();
    try {
      const detector = new FrameworkDetector(tempDir);
      assert.ok(detector, 'FrameworkDetector should be instantiable');
      console.log('✓ FrameworkDetector class exists and can be instantiated');
      return true;
    } finally {
      cleanupTempDir(tempDir);
    }
  } catch (e) {
    console.log('✗ FrameworkDetector class not found or not instantiable:', e.message);
    return false;
  }
}

// Test: FRAMEWORKS constant contains expected frameworks
function testFrameworksConstant() {
  assert.ok(FRAMEWORKS, 'FRAMEWORKS should exist');
  assert.ok(FRAMEWORKS.nextjs, 'Should have nextjs framework');
  assert.ok(FRAMEWORKS.vue, 'Should have vue framework');
  assert.ok(FRAMEWORKS.svelte, 'Should have svelte framework');
  assert.ok(FRAMEWORKS.angular, 'Should have angular framework');
  assert.ok(FRAMEWORKS.astro, 'Should have astro framework');
  console.log('✓ FRAMEWORKS constant contains expected frameworks');
}

// Test: Detects Next.js by config file
function testDetectsNextjs() {
  const tempDir = createTempDir();
  try {
    // Create next.config.js
    fs.writeFileSync(path.join(tempDir, 'next.config.js'), 'module.exports = {}');
    // Create package.json with next dependency
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { next: '14.0.0', react: '18.0.0' }
    }));

    const detector = new FrameworkDetector(tempDir);
    const result = detector.detect();

    assert.ok(result, 'Should detect a framework');
    assert.strictEqual(result.id, 'nextjs', 'Should detect Next.js');
    assert.ok(result.confidence >= 40, 'Confidence should be at least 40');
    console.log('✓ Detects Next.js by config file');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: Detects Vue by package dependencies
function testDetectsVue() {
  const tempDir = createTempDir();
  try {
    // Create vite.config.ts with Vue
    fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), 'export default {}');
    // Create package.json with vue dependency
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { vue: '3.0.0' },
      devDependencies: { vite: '5.0.0' }
    }));

    const detector = new FrameworkDetector(tempDir);
    const result = detector.detect();

    assert.ok(result, 'Should detect a framework');
    assert.strictEqual(result.id, 'vue', 'Should detect Vue');
    console.log('✓ Detects Vue by package dependencies');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: Detects Angular by angular.json
function testDetectsAngular() {
  const tempDir = createTempDir();
  try {
    // Create angular.json
    fs.writeFileSync(path.join(tempDir, 'angular.json'), '{}');
    // Create package.json with angular dependency
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { '@angular/core': '17.0.0' }
    }));

    const detector = new FrameworkDetector(tempDir);
    const result = detector.detect();

    assert.ok(result, 'Should detect a framework');
    assert.strictEqual(result.id, 'angular', 'Should detect Angular');
    console.log('✓ Detects Angular by angular.json');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: Returns null when no framework detected
function testReturnsNullWhenNoFramework() {
  const tempDir = createTempDir();
  try {
    // Empty directory with just package.json for a non-web project
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { lodash: '4.0.0' }
    }));

    const detector = new FrameworkDetector(tempDir);
    const result = detector.detect();

    assert.strictEqual(result, null, 'Should return null when no framework detected');
    console.log('✓ Returns null when no framework detected');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: isWebApp returns true for web project
function testIsWebAppTrue() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { react: '18.0.0' }
    }));

    const detector = new FrameworkDetector(tempDir);
    const result = detector.isWebApp();

    assert.strictEqual(result, true, 'Should return true for React project');
    console.log('✓ isWebApp returns true for web project');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: isWebApp returns false for non-web project
function testIsWebAppFalse() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { express: '4.0.0' }
    }));

    const detector = new FrameworkDetector(tempDir);
    const result = detector.isWebApp();

    assert.strictEqual(result, false, 'Should return false for Express-only project');
    console.log('✓ isWebApp returns false for non-web project');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: usesTypeScript detects TypeScript
function testUsesTypeScript() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: {}
    }));

    const detector = new FrameworkDetector(tempDir);
    const result = detector.usesTypeScript();

    assert.strictEqual(result, true, 'Should detect TypeScript');
    console.log('✓ usesTypeScript detects TypeScript');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: getPlaywrightConfig returns correct config for framework
function testGetPlaywrightConfig() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'next.config.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { next: '14.0.0' }
    }));

    const detector = new FrameworkDetector(tempDir);
    const config = detector.getPlaywrightConfig();

    assert.ok(config.baseURL, 'Should have baseURL');
    assert.strictEqual(config.baseURL, 'http://localhost:3000', 'Next.js should use port 3000');
    assert.ok(config.webServer, 'Should have webServer config');
    assert.strictEqual(config.webServer.command, 'npm run dev', 'Should have dev command');
    console.log('✓ getPlaywrightConfig returns correct config for framework');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: detectFramework helper function works
function testDetectFrameworkHelper() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'svelte.config.js'), 'export default {}');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { svelte: '4.0.0' },
      devDependencies: { '@sveltejs/kit': '2.0.0' }
    }));

    const result = detectFramework(tempDir);

    assert.ok(result, 'Should detect framework');
    assert.strictEqual(result.id, 'svelte', 'Should detect Svelte');
    console.log('✓ detectFramework helper function works');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: isWebApplication helper function works
function testIsWebApplicationHelper() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { vue: '3.0.0' }
    }));

    const result = isWebApplication(tempDir);

    assert.strictEqual(result, true, 'Should return true');
    console.log('✓ isWebApplication helper function works');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: getTestDirectory returns framework-specific directory
function testGetTestDirectory() {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'angular.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { '@angular/core': '17.0.0' }
    }));

    const detector = new FrameworkDetector(tempDir);
    const testDir = detector.getTestDirectory();

    assert.strictEqual(testDir, 'e2e', 'Angular should use e2e directory');
    console.log('✓ getTestDirectory returns framework-specific directory');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Run all tests
async function runTests() {
  console.log('\n=== Framework Detector Tests ===\n');

  // First check if module exists
  if (!testFrameworkDetectorExists()) {
    console.log('\nSkipping remaining tests - FrameworkDetector module not implemented yet\n');
    return { passed: 0, failed: 1, skipped: 11 };
  }

  let passed = 1;
  let failed = 0;

  const tests = [
    testFrameworksConstant,
    testDetectsNextjs,
    testDetectsVue,
    testDetectsAngular,
    testReturnsNullWhenNoFramework,
    testIsWebAppTrue,
    testIsWebAppFalse,
    testUsesTypeScript,
    testGetPlaywrightConfig,
    testDetectFrameworkHelper,
    testIsWebApplicationHelper,
    testGetTestDirectory
  ];

  for (const test of tests) {
    try {
      test();
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

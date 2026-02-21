/**
 * Quality Config Tests
 * Tests for the quality configuration loader and applier
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Will be implemented in lib/quality-config.js
let QualityConfig, MODES, LANGUAGES;

// Helper to create temp directory for testing
function createTempProject(files = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-test-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(tempDir, name);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
  }
  return tempDir;
}

function cleanupTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Test: QualityConfig class exists and can be instantiated
function testQualityConfigExists() {
  try {
    QualityConfig = require('../src/lib/quality-config').QualityConfig;
    MODES = require('../src/lib/quality-config').MODES;
    LANGUAGES = require('../src/lib/quality-config').LANGUAGES;

    const config = new QualityConfig('/tmp/test');
    assert.ok(config, 'QualityConfig should be instantiable');
    console.log('✓ QualityConfig class exists and can be instantiated');
    return true;
  } catch (e) {
    console.log('✗ QualityConfig class not found or not instantiable:', e.message);
    return false;
  }
}

// Test: MODES constant contains expected values
function testModesConstant() {
  assert.ok(Array.isArray(MODES), 'MODES should be an array');
  assert.ok(MODES.includes('strict'), 'MODES should include "strict"');
  assert.ok(MODES.includes('strictest'), 'MODES should include "strictest"');
  assert.ok(MODES.includes('legacy'), 'MODES should include "legacy"');
  console.log('✓ MODES constant contains expected values');
}

// Test: LANGUAGES constant contains all 20 target languages
function testLanguagesConstant() {
  assert.ok(Array.isArray(LANGUAGES), 'LANGUAGES should be an array');
  assert.strictEqual(LANGUAGES.length, 20, 'LANGUAGES should contain 20 languages');

  const expected = [
    'typescript', 'python', 'java', 'go', 'rust', 'csharp',
    'php', 'ruby', 'swift', 'kotlin', 'cpp', 'c', 'scala',
    'dart', 'elixir', 'clojure', 'haskell', 'lua', 'r', 'julia'
  ];

  for (const lang of expected) {
    assert.ok(LANGUAGES.includes(lang), `LANGUAGES should include "${lang}"`);
  }
  console.log('✓ LANGUAGES constant contains all 20 target languages');
}

// Test: detectLanguages() identifies TypeScript project
function testDetectTypeScript() {
  const tempDir = createTempProject({
    'tsconfig.json': '{}',
    'package.json': '{"name": "test"}'
  });

  try {
    const config = new QualityConfig(tempDir);
    const detected = config.detectLanguages();
    assert.ok(detected.includes('typescript'), 'Should detect TypeScript');
    console.log('✓ detectLanguages() identifies TypeScript project');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: detectLanguages() identifies Python project
function testDetectPython() {
  const tempDir = createTempProject({
    'pyproject.toml': '[project]\nname = "test"'
  });

  try {
    const config = new QualityConfig(tempDir);
    const detected = config.detectLanguages();
    assert.ok(detected.includes('python'), 'Should detect Python');
    console.log('✓ detectLanguages() identifies Python project');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: detectLanguages() identifies Go project
function testDetectGo() {
  const tempDir = createTempProject({
    'go.mod': 'module example.com/test'
  });

  try {
    const config = new QualityConfig(tempDir);
    const detected = config.detectLanguages();
    assert.ok(detected.includes('go'), 'Should detect Go');
    console.log('✓ detectLanguages() identifies Go project');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: detectLanguages() identifies Rust project
function testDetectRust() {
  const tempDir = createTempProject({
    'Cargo.toml': '[package]\nname = "test"'
  });

  try {
    const config = new QualityConfig(tempDir);
    const detected = config.detectLanguages();
    assert.ok(detected.includes('rust'), 'Should detect Rust');
    console.log('✓ detectLanguages() identifies Rust project');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: detectLanguages() identifies Java project
function testDetectJava() {
  const tempDir = createTempProject({
    'pom.xml': '<project></project>'
  });

  try {
    const config = new QualityConfig(tempDir);
    const detected = config.detectLanguages();
    assert.ok(detected.includes('java'), 'Should detect Java');
    console.log('✓ detectLanguages() identifies Java project');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: detectLanguages() handles multi-language projects
function testDetectMultiLanguage() {
  const tempDir = createTempProject({
    'tsconfig.json': '{}',
    'pyproject.toml': '[project]\nname = "test"',
    'go.mod': 'module example.com/test'
  });

  try {
    const config = new QualityConfig(tempDir);
    const detected = config.detectLanguages();
    assert.ok(detected.length >= 2, 'Should detect multiple languages');
    console.log('✓ detectLanguages() handles multi-language projects');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: getConfig() returns config for valid language/mode
function testGetConfig() {
  const config = new QualityConfig('/tmp/test');

  // Should not throw for valid language/mode
  const tsConfig = config.getConfig('typescript', 'strict');
  assert.ok(tsConfig, 'Should return config for typescript/strict');
  assert.ok(tsConfig.linter, 'Config should have linter property');
  assert.ok(tsConfig.formatter, 'Config should have formatter property');
  assert.ok(tsConfig.coverage, 'Config should have coverage property');
  console.log('✓ getConfig() returns config for valid language/mode');
}

// Test: getConfig() throws for invalid language
function testGetConfigInvalidLanguage() {
  const config = new QualityConfig('/tmp/test');

  try {
    config.getConfig('invalid-lang', 'strict');
    assert.fail('Should throw for invalid language');
  } catch (e) {
    assert.ok(e.message.includes('invalid') || e.message.includes('Unknown'),
      'Error should mention invalid language');
    console.log('✓ getConfig() throws for invalid language');
  }
}

// Test: getConfig() throws for invalid mode
function testGetConfigInvalidMode() {
  const config = new QualityConfig('/tmp/test');

  try {
    config.getConfig('typescript', 'invalid-mode');
    assert.fail('Should throw for invalid mode');
  } catch (e) {
    assert.ok(e.message.includes('invalid') || e.message.includes('Unknown'),
      'Error should mention invalid mode');
    console.log('✓ getConfig() throws for invalid mode');
  }
}

// Test: Coverage thresholds are correct for each mode
function testCoverageThresholds() {
  const config = new QualityConfig('/tmp/test');

  const strictConfig = config.getConfig('typescript', 'strict');
  assert.strictEqual(strictConfig.coverage.lines, 80, 'Strict mode should require 80% line coverage');

  const strictestConfig = config.getConfig('typescript', 'strictest');
  assert.strictEqual(strictestConfig.coverage.lines, 90, 'Strictest mode should require 90% line coverage');

  const legacyConfig = config.getConfig('typescript', 'legacy');
  assert.strictEqual(legacyConfig.coverage.lines, 50, 'Legacy mode should require 50% line coverage');

  console.log('✓ Coverage thresholds are correct for each mode');
}

// Test: Complexity limits are enforced
function testComplexityLimits() {
  const config = new QualityConfig('/tmp/test');
  const tsConfig = config.getConfig('typescript', 'strict');

  assert.ok(tsConfig.complexity, 'Config should have complexity limits');
  assert.strictEqual(tsConfig.complexity.cyclomatic, 10, 'Cyclomatic complexity should be <= 10');
  assert.strictEqual(tsConfig.complexity.cognitive, 15, 'Cognitive complexity should be <= 15');
  assert.strictEqual(tsConfig.complexity.functionLength, 50, 'Function length should be <= 50');
  assert.strictEqual(tsConfig.complexity.fileLength, 400, 'File length should be <= 400');
  assert.strictEqual(tsConfig.complexity.parameters, 4, 'Parameters should be <= 4');
  assert.strictEqual(tsConfig.complexity.nestingDepth, 4, 'Nesting depth should be <= 4');

  console.log('✓ Complexity limits are enforced');
}

// Run all tests
async function runTests() {
  console.log('\n=== Quality Config Tests ===\n');

  // First check if module exists
  if (!testQualityConfigExists()) {
    console.log('\nSkipping remaining tests - QualityConfig module not implemented yet\n');
    return { passed: 0, failed: 1, skipped: 12 };
  }

  let passed = 1;
  let failed = 0;

  const tests = [
    testModesConstant,
    testLanguagesConstant,
    testDetectTypeScript,
    testDetectPython,
    testDetectGo,
    testDetectRust,
    testDetectJava,
    testDetectMultiLanguage,
    testGetConfig,
    testGetConfigInvalidLanguage,
    testGetConfigInvalidMode,
    testCoverageThresholds,
    testComplexityLimits
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

/**
 * Coverage Checker Tests
 * Tests for coverage parsing and threshold enforcement
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Will be implemented in lib/coverage-checker.js
let CoverageChecker, THRESHOLDS;

// Helper to create temp directory for testing
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-test-'));
}

function cleanupTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Test: CoverageChecker class exists and can be instantiated
function testCoverageCheckerExists() {
  try {
    CoverageChecker = require('../lib/coverage-checker').CoverageChecker;
    THRESHOLDS = require('../lib/coverage-checker').THRESHOLDS;

    const checker = new CoverageChecker('strict');
    assert.ok(checker, 'CoverageChecker should be instantiable');
    console.log('✓ CoverageChecker class exists and can be instantiated');
    return true;
  } catch (e) {
    console.log('✗ CoverageChecker class not found or not instantiable:', e.message);
    return false;
  }
}

// Test: THRESHOLDS constant contains expected modes
function testThresholdsConstant() {
  assert.ok(THRESHOLDS, 'THRESHOLDS should exist');
  assert.ok(THRESHOLDS.strict, 'THRESHOLDS should have strict mode');
  assert.ok(THRESHOLDS.strictest, 'THRESHOLDS should have strictest mode');
  assert.ok(THRESHOLDS.legacy, 'THRESHOLDS should have legacy mode');
  console.log('✓ THRESHOLDS constant contains expected modes');
}

// Test: Strict mode thresholds are correct
function testStrictThresholds() {
  const { strict } = THRESHOLDS;
  assert.strictEqual(strict.lines, 80, 'Strict lines threshold should be 80');
  assert.strictEqual(strict.branches, 80, 'Strict branches threshold should be 80');
  assert.strictEqual(strict.functions, 80, 'Strict functions threshold should be 80');
  assert.strictEqual(strict.statements, 80, 'Strict statements threshold should be 80');
  console.log('✓ Strict mode thresholds are correct');
}

// Test: Strictest mode thresholds are correct
function testStrictestThresholds() {
  const { strictest } = THRESHOLDS;
  assert.strictEqual(strictest.lines, 90, 'Strictest lines threshold should be 90');
  assert.strictEqual(strictest.branches, 90, 'Strictest branches threshold should be 90');
  assert.strictEqual(strictest.functions, 90, 'Strictest functions threshold should be 90');
  assert.strictEqual(strictest.statements, 90, 'Strictest statements threshold should be 90');
  console.log('✓ Strictest mode thresholds are correct');
}

// Test: Legacy mode thresholds are correct
function testLegacyThresholds() {
  const { legacy } = THRESHOLDS;
  assert.strictEqual(legacy.lines, 50, 'Legacy lines threshold should be 50');
  assert.strictEqual(legacy.branches, 50, 'Legacy branches threshold should be 50');
  assert.strictEqual(legacy.functions, 50, 'Legacy functions threshold should be 50');
  assert.strictEqual(legacy.statements, 50, 'Legacy statements threshold should be 50');
  console.log('✓ Legacy mode thresholds are correct');
}

// Test: check() passes when coverage meets thresholds
function testCheckPasses() {
  const checker = new CoverageChecker('strict');
  const coverage = {
    lines: 85,
    branches: 82,
    functions: 90,
    statements: 88
  };

  const result = checker.check(coverage);
  assert.strictEqual(result.pass, true, 'Should pass when all metrics meet thresholds');
  assert.strictEqual(result.failures.length, 0, 'Should have no failures');
  console.log('✓ check() passes when coverage meets thresholds');
}

// Test: check() fails when coverage below thresholds
function testCheckFails() {
  const checker = new CoverageChecker('strict');
  const coverage = {
    lines: 75,    // Below 80
    branches: 65, // Below 80
    functions: 90,
    statements: 88
  };

  const result = checker.check(coverage);
  assert.strictEqual(result.pass, false, 'Should fail when metrics below thresholds');
  assert.ok(result.failures.length >= 2, 'Should have at least 2 failures');
  assert.ok(result.failures.some(f => f.includes('lines')), 'Should report lines failure');
  assert.ok(result.failures.some(f => f.includes('branches')), 'Should report branches failure');
  console.log('✓ check() fails when coverage below thresholds');
}

// Test: check() returns coverage and thresholds in result
function testCheckReturnsDetails() {
  const checker = new CoverageChecker('strict');
  const coverage = {
    lines: 85,
    branches: 82,
    functions: 90,
    statements: 88
  };

  const result = checker.check(coverage);
  assert.deepStrictEqual(result.coverage, coverage, 'Should return coverage in result');
  assert.deepStrictEqual(result.thresholds, THRESHOLDS.strict, 'Should return thresholds in result');
  console.log('✓ check() returns coverage and thresholds in result');
}

// Test: parseCoverage() parses Istanbul JSON format
function testParseIstanbulFormat() {
  const tempDir = createTempDir();
  const coveragePath = path.join(tempDir, 'coverage-summary.json');

  // Istanbul summary JSON format
  const istanbulData = {
    total: {
      lines: { pct: 85 },
      branches: { pct: 82 },
      functions: { pct: 90 },
      statements: { pct: 88 }
    }
  };

  fs.writeFileSync(coveragePath, JSON.stringify(istanbulData));

  try {
    const checker = new CoverageChecker('strict');
    const coverage = checker.parseCoverage('istanbul', coveragePath);

    assert.strictEqual(coverage.lines, 85, 'Should parse lines correctly');
    assert.strictEqual(coverage.branches, 82, 'Should parse branches correctly');
    assert.strictEqual(coverage.functions, 90, 'Should parse functions correctly');
    assert.strictEqual(coverage.statements, 88, 'Should parse statements correctly');
    console.log('✓ parseCoverage() parses Istanbul JSON format');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: parseCoverage() parses LCOV format
function testParseLcovFormat() {
  const tempDir = createTempDir();
  const coveragePath = path.join(tempDir, 'lcov.info');

  // LCOV format
  const lcovData = `TN:
SF:/path/to/file.js
FNF:10
FNH:9
LF:100
LH:85
BRF:50
BRH:41
end_of_record
`;

  fs.writeFileSync(coveragePath, lcovData);

  try {
    const checker = new CoverageChecker('strict');
    const coverage = checker.parseCoverage('lcov', coveragePath);

    assert.strictEqual(coverage.lines, 85, 'Should parse lines correctly (85/100)');
    assert.strictEqual(coverage.branches, 82, 'Should parse branches correctly (41/50)');
    assert.strictEqual(coverage.functions, 90, 'Should parse functions correctly (9/10)');
    console.log('✓ parseCoverage() parses LCOV format');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: parseCoverage() parses Cobertura XML format
function testParseCoberturaFormat() {
  const tempDir = createTempDir();
  const coveragePath = path.join(tempDir, 'coverage.xml');

  // Cobertura XML format
  const coberturaData = `<?xml version="1.0"?>
<coverage line-rate="0.85" branch-rate="0.82">
  <packages>
    <package line-rate="0.85" branch-rate="0.82">
    </package>
  </packages>
</coverage>`;

  fs.writeFileSync(coveragePath, coberturaData);

  try {
    const checker = new CoverageChecker('strict');
    const coverage = checker.parseCoverage('cobertura', coveragePath);

    assert.strictEqual(coverage.lines, 85, 'Should parse lines correctly');
    assert.strictEqual(coverage.branches, 82, 'Should parse branches correctly');
    console.log('✓ parseCoverage() parses Cobertura XML format');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: parseCoverage() throws for unknown format
function testParseUnknownFormat() {
  const tempDir = createTempDir();
  const tempFile = path.join(tempDir, 'test.txt');
  fs.writeFileSync(tempFile, 'dummy content');

  try {
    const checker = new CoverageChecker('strict');
    checker.parseCoverage('unknown-format', tempFile);
    assert.fail('Should throw for unknown format');
  } catch (e) {
    assert.ok(e.message.includes('Unknown') || e.message.includes('unsupported'),
      'Error should mention unknown/unsupported format');
    console.log('✓ parseCoverage() throws for unknown format');
  } finally {
    cleanupTempDir(tempDir);
  }
}

// Test: parseCoverage() throws for missing file
function testParseMissingFile() {
  const checker = new CoverageChecker('strict');

  try {
    checker.parseCoverage('istanbul', '/nonexistent/path/coverage.json');
    assert.fail('Should throw for missing file');
  } catch (e) {
    assert.ok(e.message.includes('not found') || e.message.includes('ENOENT'),
      'Error should mention file not found');
    console.log('✓ parseCoverage() throws for missing file');
  }
}

// Test: Constructor with invalid mode uses strict as default
function testInvalidModeDefaults() {
  const checker = new CoverageChecker('invalid-mode');
  const coverage = {
    lines: 85,
    branches: 82,
    functions: 90,
    statements: 88
  };

  const result = checker.check(coverage);
  // Should use strict thresholds (80%)
  assert.strictEqual(result.pass, true, 'Should pass with strict thresholds');
  console.log('✓ Constructor with invalid mode uses strict as default');
}

// Test: generateReport() creates human-readable report
function testGenerateReport() {
  const checker = new CoverageChecker('strict');
  const coverage = {
    lines: 75,
    branches: 65,
    functions: 90,
    statements: 88
  };

  const report = checker.generateReport(coverage);

  assert.ok(typeof report === 'string', 'Report should be a string');
  assert.ok(report.includes('lines'), 'Report should mention lines');
  assert.ok(report.includes('branches'), 'Report should mention branches');
  assert.ok(report.includes('75'), 'Report should include actual coverage value');
  assert.ok(report.includes('80'), 'Report should include threshold value');
  console.log('✓ generateReport() creates human-readable report');
}

// Run all tests
async function runTests() {
  console.log('\n=== Coverage Checker Tests ===\n');

  // First check if module exists
  if (!testCoverageCheckerExists()) {
    console.log('\nSkipping remaining tests - CoverageChecker module not implemented yet\n');
    return { passed: 0, failed: 1, skipped: 13 };
  }

  let passed = 1;
  let failed = 0;

  const tests = [
    testThresholdsConstant,
    testStrictThresholds,
    testStrictestThresholds,
    testLegacyThresholds,
    testCheckPasses,
    testCheckFails,
    testCheckReturnsDetails,
    testParseIstanbulFormat,
    testParseLcovFormat,
    testParseCoberturaFormat,
    testParseUnknownFormat,
    testParseMissingFile,
    testInvalidModeDefaults,
    testGenerateReport
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

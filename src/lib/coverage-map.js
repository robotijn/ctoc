#!/usr/bin/env node
/**
 * Coverage Map Utilities
 *
 * Manages the file -> test mapping for smart test selection.
 * The coverage map tracks which tests cover which source files,
 * enabling incremental testing (only run tests affected by changes).
 *
 * @module lib/coverage-map
 */

const fs = require('fs');
const path = require('path');
const { hashFile } = require('./hash-utils');
const { atomicWrite, safeRead, getStateDir } = require('./quality-state');

// Lazily resolve coverage map path (getStateDir uses findProjectRoot)
function getCoverageMapFilePath() {
  return path.join(getStateDir(), 'coverage-map.json');
}
const MAX_AGE_DAYS = 7;

/**
 * Initialize empty coverage map structure
 * @returns {Object} Empty coverage map
 */
function createEmptyCoverageMap() {
  return {
    _meta: {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      rebuiltAt: new Date().toISOString(),
      framework: null,
      sourceCount: 0,
      testCount: 0
    },
    files: {}
  };
}

/**
 * Load coverage map from disk
 * @returns {Object} Coverage map or empty structure
 */
function loadCoverageMap() {
  const map = safeRead(getCoverageMapFilePath());

  if (!map || !map.files) {
    return createEmptyCoverageMap();
  }

  return map;
}

/**
 * Save coverage map to disk
 * @param {Object} map - Coverage map to save
 */
function saveCoverageMap(map) {
  map._meta.rebuiltAt = new Date().toISOString();
  map._meta.sourceCount = Object.keys(map.files).length;

  // Count unique tests
  const allTests = new Set();
  for (const entry of Object.values(map.files)) {
    if (entry.tests) {
      entry.tests.forEach(t => allTests.add(t));
    }
  }
  map._meta.testCount = allTests.size;

  atomicWrite(getCoverageMapFilePath(), map);
  return map;
}

/**
 * Check if coverage map needs rebuild
 * @returns {Object} Rebuild status with reason
 */
function needsRebuild() {
  const map = loadCoverageMap();

  // No map exists
  if (!map._meta || Object.keys(map.files).length === 0) {
    return { needed: true, reason: 'No coverage map exists' };
  }

  // Check age
  if (map._meta.rebuiltAt) {
    const age = Date.now() - new Date(map._meta.rebuiltAt).getTime();
    const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    if (age > maxAge) {
      return { needed: true, reason: `Coverage map is older than ${MAX_AGE_DAYS} days` };
    }
  } else {
    return { needed: true, reason: 'Coverage map missing rebuild timestamp' };
  }

  return { needed: false };
}

/**
 * Add or update a file entry in the coverage map
 * @param {Object} map - Coverage map
 * @param {string} sourceFile - Source file path
 * @param {string[]} tests - Tests that cover this file
 * @param {Object} options - Additional options
 * @returns {Object} Updated map
 */
function addFileEntry(map, sourceFile, tests, options = {}) {
  const normalizedPath = path.normalize(sourceFile);
  const hash = hashFile(normalizedPath);

  map.files[normalizedPath] = {
    tests: tests || [],
    hash,
    lastModified: new Date().toISOString(),
    ...options
  };

  return map;
}

/**
 * Get tests for a specific source file
 * @param {string} sourceFile - Source file path
 * @returns {string[]} Array of test file paths
 */
function getTestsForFile(sourceFile) {
  const map = loadCoverageMap();
  const normalizedPath = path.normalize(sourceFile);
  const entry = map.files[normalizedPath];

  if (!entry || !entry.tests) {
    return [];
  }

  return entry.tests;
}

/**
 * Get tests for multiple source files (deduplicated)
 * @param {string[]} sourceFiles - Source file paths
 * @returns {Object} Tests info
 */
function getTestsForFiles(sourceFiles) {
  const map = loadCoverageMap();
  const tests = new Set();
  const unmapped = [];

  for (const sourceFile of sourceFiles) {
    const normalizedPath = path.normalize(sourceFile);
    const entry = map.files[normalizedPath];

    if (!entry || !entry.tests || entry.tests.length === 0) {
      unmapped.push(sourceFile);
    } else {
      entry.tests.forEach(t => tests.add(t));
    }
  }

  return {
    tests: [...tests],
    unmapped,
    hasUnmapped: unmapped.length > 0
  };
}

/**
 * Find tests affected by changed files
 * Uses coverage map and fallback heuristics
 * @param {string[]} changedFiles - Files that changed
 * @param {Object} cachedHashes - Cached file hashes
 * @returns {Object} Affected tests info
 */
function findAffectedTests(changedFiles, cachedHashes = {}) {
  const map = loadCoverageMap();
  const result = {
    tests: new Set(),
    mappedFiles: [],
    unmappedFiles: [],
    fallbackTests: [],
    requiresFullSuite: false,
    reason: null
  };

  // Check for config file changes that require full suite
  const configPatterns = [
    /tsconfig\.json$/,
    /jsconfig\.json$/,
    /\.eslintrc/,
    /\.prettierrc/,
    /pytest\.ini$/,
    /pyproject\.toml$/,
    /jest\.config/,
    /vitest\.config/,
    /package\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /go\.mod$/,
    /go\.sum$/,
    /Cargo\.toml$/,
    /Cargo\.lock$/
  ];

  for (const file of changedFiles) {
    if (configPatterns.some(pattern => pattern.test(file))) {
      result.requiresFullSuite = true;
      result.reason = `Config file changed: ${path.basename(file)}`;
      break;
    }
  }

  // Find tests for each changed file
  for (const file of changedFiles) {
    const normalizedPath = path.normalize(file);
    const entry = map.files[normalizedPath];

    if (entry && entry.tests && entry.tests.length > 0) {
      entry.tests.forEach(t => result.tests.add(t));
      result.mappedFiles.push(file);
    } else {
      // Try heuristic matching
      const heuristicTests = findTestsByHeuristic(file);

      if (heuristicTests.length > 0) {
        heuristicTests.forEach(t => result.tests.add(t));
        result.fallbackTests.push({ file, tests: heuristicTests });
      } else {
        result.unmappedFiles.push(file);
      }
    }
  }

  // If any file has no mapping and no heuristic match, suggest full suite
  if (result.unmappedFiles.length > 0 && !result.requiresFullSuite) {
    result.requiresFullSuite = true;
    result.reason = `No test mapping for: ${result.unmappedFiles.map(f => path.basename(f)).join(', ')}`;
  }

  return {
    tests: [...result.tests],
    mappedFiles: result.mappedFiles,
    unmappedFiles: result.unmappedFiles,
    fallbackTests: result.fallbackTests,
    requiresFullSuite: result.requiresFullSuite,
    reason: result.reason
  };
}

/**
 * Find tests using naming heuristics
 * e.g., src/state.js -> tests/state.test.js
 * @param {string} sourceFile - Source file path
 * @returns {string[]} Potential test files
 */
function findTestsByHeuristic(sourceFile) {
  const tests = [];
  const baseName = path.basename(sourceFile, path.extname(sourceFile));
  const ext = path.extname(sourceFile);

  // Common test file patterns
  const testPatterns = [
    `${baseName}.test${ext}`,
    `${baseName}.spec${ext}`,
    `${baseName}_test${ext}`,
    `test_${baseName}${ext}`,
    `${baseName}.test.ts`,
    `${baseName}.spec.ts`,
    `${baseName}.test.tsx`,
    `${baseName}.spec.tsx`
  ];

  // Common test directories
  const testDirs = [
    'test',
    'tests',
    '__tests__',
    'spec',
    'test/unit',
    'tests/unit',
    '__tests__/unit'
  ];

  // Get the source directory and project root
  const sourceDir = path.dirname(sourceFile);
  const projectRoot = findProjectRoot(sourceDir);

  for (const dir of testDirs) {
    for (const pattern of testPatterns) {
      // Check in test directory at same level
      const sameLevel = path.join(sourceDir, dir, pattern);
      if (fs.existsSync(sameLevel)) {
        tests.push(sameLevel);
      }

      // Check in project root test directory
      if (projectRoot) {
        const rootLevel = path.join(projectRoot, dir, pattern);
        if (fs.existsSync(rootLevel)) {
          tests.push(rootLevel);
        }
      }
    }
  }

  // Check for co-located tests
  for (const pattern of testPatterns) {
    const colocated = path.join(sourceDir, pattern);
    if (fs.existsSync(colocated)) {
      tests.push(colocated);
    }
  }

  return [...new Set(tests)]; // Dedupe
}

/**
 * Find project root by looking for package.json, go.mod, etc.
 * @param {string} startDir - Directory to start from
 * @returns {string|null} Project root or null
 */
function findProjectRoot(startDir) {
  const markers = ['package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', '.git'];
  let dir = startDir;

  while (dir !== path.dirname(dir)) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Merge coverage data into map
 * Used by build-coverage-map.js after running tests
 * @param {Object} coverageData - Parsed coverage data
 * @param {string} framework - Test framework name
 * @returns {Object} Updated coverage map
 */
function mergeCoverageData(coverageData, framework) {
  const map = loadCoverageMap();
  map._meta.framework = framework;

  for (const [sourceFile, data] of Object.entries(coverageData)) {
    const normalizedPath = path.normalize(sourceFile);

    if (!map.files[normalizedPath]) {
      map.files[normalizedPath] = {
        tests: [],
        hash: null,
        lastModified: null
      };
    }

    // Merge tests (dedupe)
    const existingTests = new Set(map.files[normalizedPath].tests || []);
    const newTests = data.tests || [];
    newTests.forEach(t => existingTests.add(t));

    map.files[normalizedPath].tests = [...existingTests];
    map.files[normalizedPath].hash = hashFile(normalizedPath);
    map.files[normalizedPath].lastModified = new Date().toISOString();

    // Add coverage stats if available
    if (data.lines !== undefined) {
      map.files[normalizedPath].coverage = {
        lines: data.lines,
        branches: data.branches,
        functions: data.functions,
        statements: data.statements
      };
    }
  }

  return saveCoverageMap(map);
}

/**
 * Clear the coverage map (for full rebuild)
 */
function clearCoverageMap() {
  const map = createEmptyCoverageMap();
  saveCoverageMap(map);
  return map;
}

/**
 * Get coverage map statistics
 * @returns {Object} Statistics
 */
function getStatistics() {
  const map = loadCoverageMap();

  const stats = {
    sourceFiles: Object.keys(map.files).length,
    tests: new Set(),
    filesWithCoverage: 0,
    filesWithoutTests: 0,
    avgTestsPerFile: 0,
    lastRebuilt: map._meta?.rebuiltAt,
    framework: map._meta?.framework
  };

  for (const entry of Object.values(map.files)) {
    if (entry.tests) {
      entry.tests.forEach(t => stats.tests.add(t));
      if (entry.tests.length === 0) {
        stats.filesWithoutTests++;
      }
    }
    if (entry.coverage) {
      stats.filesWithCoverage++;
    }
  }

  stats.tests = stats.tests.size;
  stats.avgTestsPerFile = stats.sourceFiles > 0
    ? (stats.tests / stats.sourceFiles).toFixed(2)
    : 0;

  return stats;
}

/**
 * Export coverage map for debugging/visualization
 * @returns {Object} Full coverage map
 */
function exportMap() {
  return loadCoverageMap();
}

module.exports = {
  // Core operations
  createEmptyCoverageMap,
  loadCoverageMap,
  saveCoverageMap,
  clearCoverageMap,

  // Entry management
  addFileEntry,
  mergeCoverageData,

  // Queries
  getTestsForFile,
  getTestsForFiles,
  findAffectedTests,
  needsRebuild,

  // Heuristics
  findTestsByHeuristic,
  findProjectRoot,

  // Stats and export
  getStatistics,
  exportMap,

  // Path accessors
  getCoverageMapFilePath,
  MAX_AGE_DAYS
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'stats': {
      const stats = getStatistics();
      console.log('\nCoverage Map Statistics\n');
      console.log(`Source files: ${stats.sourceFiles}`);
      console.log(`Test files: ${stats.tests}`);
      console.log(`Avg tests per file: ${stats.avgTestsPerFile}`);
      console.log(`Files with coverage: ${stats.filesWithCoverage}`);
      console.log(`Files without tests: ${stats.filesWithoutTests}`);
      console.log(`Framework: ${stats.framework || 'unknown'}`);
      console.log(`Last rebuilt: ${stats.lastRebuilt || 'never'}`);
      break;
    }

    case 'check': {
      const rebuild = needsRebuild();
      if (rebuild.needed) {
        console.log(`Rebuild needed: ${rebuild.reason}`);
        process.exit(1);
      } else {
        console.log('Coverage map is up to date');
      }
      break;
    }

    case 'clear':
      clearCoverageMap();
      console.log('Coverage map cleared');
      break;

    case 'tests': {
      if (args.length < 2) {
        console.log('Usage: coverage-map.js tests <source-file>');
        process.exit(1);
      }
      const tests = getTestsForFile(args[1]);
      if (tests.length > 0) {
        console.log(`Tests for ${args[1]}:`);
        tests.forEach(t => console.log(`  ${t}`));
      } else {
        console.log(`No tests found for ${args[1]}`);
        const heuristic = findTestsByHeuristic(args[1]);
        if (heuristic.length > 0) {
          console.log('Heuristic matches:');
          heuristic.forEach(t => console.log(`  ${t}`));
        }
      }
      break;
    }

    default:
      console.log('Coverage Map CLI');
      console.log('');
      console.log('Commands:');
      console.log('  stats       Show coverage map statistics');
      console.log('  check       Check if rebuild is needed');
      console.log('  clear       Clear the coverage map');
      console.log('  tests <file> Show tests for a source file');
  }
}

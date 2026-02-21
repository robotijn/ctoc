#!/usr/bin/env node
/**
 * Build Coverage Map
 *
 * Parses coverage reports from various test frameworks and builds
 * a file -> test mapping for smart test selection.
 *
 * Supported formats:
 * - Jest/Istanbul (coverage/coverage-final.json)
 * - nyc/Istanbul (coverage/coverage.json)
 * - pytest-cov (coverage.json)
 * - go cover (coverage.out parsed)
 * - lcov (coverage/lcov.info)
 *
 * Usage:
 *   node build-coverage-map.js [--format=jest|nyc|pytest|go|lcov] [--path=<coverage-file>]
 *
 * @module scripts/build-coverage-map
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import from lib (relative path for scripts)
const libPath = path.join(__dirname, '..', 'lib');
const {
  loadCoverageMap,
  saveCoverageMap,
  clearCoverageMap,
  mergeCoverageData
} = require(path.join(libPath, 'coverage-map'));
const { detectTools } = require(path.join(libPath, 'tool-detector'));

/**
 * Default coverage file locations by framework
 */
const COVERAGE_LOCATIONS = {
  jest: [
    'coverage/coverage-final.json',
    'coverage/coverage-summary.json'
  ],
  nyc: [
    'coverage/coverage.json',
    '.nyc_output/coverage.json'
  ],
  vitest: [
    'coverage/coverage-final.json'
  ],
  pytest: [
    'coverage.json',
    '.coverage.json'
  ],
  go: [
    'coverage.out',
    'coverage.txt'
  ],
  lcov: [
    'coverage/lcov.info',
    'lcov.info'
  ]
};

/**
 * Parse Jest/Istanbul coverage-final.json
 * @param {string} coveragePath - Path to coverage file
 * @returns {Object} Parsed coverage data
 */
function parseJestCoverage(coveragePath) {
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  const result = {};

  for (const [filePath, data] of Object.entries(coverage)) {
    // Skip node_modules
    if (filePath.includes('node_modules')) continue;

    const normalizedPath = path.normalize(filePath);

    // Calculate coverage percentages
    const lines = calculateCoverage(data.s || {});
    const branches = calculateCoverage(data.b || {});
    const functions = calculateCoverage(data.f || {});
    const statements = calculateCoverage(data.s || {});

    result[normalizedPath] = {
      tests: [], // Will be populated from test results
      lines,
      branches,
      functions,
      statements
    };
  }

  return result;
}

/**
 * Parse nyc/Istanbul coverage.json
 * @param {string} coveragePath - Path to coverage file
 * @returns {Object} Parsed coverage data
 */
function parseNycCoverage(coveragePath) {
  // nyc format is similar to Jest
  return parseJestCoverage(coveragePath);
}

/**
 * Parse pytest-cov coverage.json
 * @param {string} coveragePath - Path to coverage file
 * @returns {Object} Parsed coverage data
 */
function parsePytestCoverage(coveragePath) {
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  const result = {};

  // pytest-cov format varies, handle both formats
  const files = coverage.files || coverage;

  for (const [filePath, data] of Object.entries(files)) {
    if (filePath.includes('__pycache__')) continue;
    if (filePath.includes('site-packages')) continue;

    const normalizedPath = path.normalize(filePath);

    // Extract coverage stats
    let lines = 0;
    if (data.summary) {
      lines = data.summary.percent_covered || 0;
    } else if (data.executed_lines !== undefined && data.missing_lines !== undefined) {
      const total = data.executed_lines.length + data.missing_lines.length;
      lines = total > 0 ? (data.executed_lines.length / total) * 100 : 0;
    }

    result[normalizedPath] = {
      tests: [],
      lines,
      branches: data.summary?.percent_covered_branches || 0,
      functions: 0,
      statements: lines
    };
  }

  return result;
}

/**
 * Parse Go coverage.out file
 * @param {string} coveragePath - Path to coverage file
 * @returns {Object} Parsed coverage data
 */
function parseGoCoverage(coveragePath) {
  const content = fs.readFileSync(coveragePath, 'utf8');
  const result = {};

  // Go coverage format: mode: set/count/atomic followed by lines like:
  // file.go:line.col,line.col statements count
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('mode:') || !line.trim()) continue;

    const match = line.match(/^(.+?):(\d+)\.(\d+),(\d+)\.(\d+)\s+(\d+)\s+(\d+)/);
    if (!match) continue;

    const [, filePath] = match;
    const normalizedPath = path.normalize(filePath);

    if (!result[normalizedPath]) {
      result[normalizedPath] = {
        tests: [],
        coveredStatements: 0,
        totalStatements: 0
      };
    }

    const statements = parseInt(match[6], 10);
    const count = parseInt(match[7], 10);

    result[normalizedPath].totalStatements += statements;
    if (count > 0) {
      result[normalizedPath].coveredStatements += statements;
    }
  }

  // Calculate percentages
  for (const data of Object.values(result)) {
    data.lines = data.totalStatements > 0
      ? (data.coveredStatements / data.totalStatements) * 100
      : 0;
    data.statements = data.lines;
    delete data.coveredStatements;
    delete data.totalStatements;
  }

  return result;
}

/**
 * Parse LCOV format (lcov.info)
 * @param {string} coveragePath - Path to coverage file
 * @returns {Object} Parsed coverage data
 */
function parseLcovCoverage(coveragePath) {
  const content = fs.readFileSync(coveragePath, 'utf8');
  const result = {};
  let currentFile = null;

  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('SF:')) {
      // Source file
      currentFile = path.normalize(line.substring(3));
      result[currentFile] = {
        tests: [],
        linesFound: 0,
        linesHit: 0,
        branchesFound: 0,
        branchesHit: 0,
        functionsFound: 0,
        functionsHit: 0
      };
    } else if (line.startsWith('LF:') && currentFile) {
      result[currentFile].linesFound = parseInt(line.substring(3), 10);
    } else if (line.startsWith('LH:') && currentFile) {
      result[currentFile].linesHit = parseInt(line.substring(3), 10);
    } else if (line.startsWith('BRF:') && currentFile) {
      result[currentFile].branchesFound = parseInt(line.substring(4), 10);
    } else if (line.startsWith('BRH:') && currentFile) {
      result[currentFile].branchesHit = parseInt(line.substring(4), 10);
    } else if (line.startsWith('FNF:') && currentFile) {
      result[currentFile].functionsFound = parseInt(line.substring(4), 10);
    } else if (line.startsWith('FNH:') && currentFile) {
      result[currentFile].functionsHit = parseInt(line.substring(4), 10);
    } else if (line === 'end_of_record') {
      currentFile = null;
    }
  }

  // Calculate percentages
  for (const data of Object.values(result)) {
    data.lines = data.linesFound > 0
      ? (data.linesHit / data.linesFound) * 100
      : 0;
    data.branches = data.branchesFound > 0
      ? (data.branchesHit / data.branchesFound) * 100
      : 0;
    data.functions = data.functionsFound > 0
      ? (data.functionsHit / data.functionsFound) * 100
      : 0;
    data.statements = data.lines;

    // Clean up intermediate values
    delete data.linesFound;
    delete data.linesHit;
    delete data.branchesFound;
    delete data.branchesHit;
    delete data.functionsFound;
    delete data.functionsHit;
  }

  return result;
}

/**
 * Calculate coverage percentage from coverage data
 * @param {Object} coverageData - Hit/miss counts
 * @returns {number} Coverage percentage
 */
function calculateCoverage(coverageData) {
  if (!coverageData || typeof coverageData !== 'object') return 0;

  const values = Object.values(coverageData).flat();
  if (values.length === 0) return 0;

  const hit = values.filter(v => v > 0).length;
  return (hit / values.length) * 100;
}

/**
 * Find coverage file for a framework
 * @param {string} framework - Framework name
 * @param {string} projectPath - Project root
 * @returns {string|null} Path to coverage file or null
 */
function findCoverageFile(framework, projectPath = process.cwd()) {
  const locations = COVERAGE_LOCATIONS[framework] || [];

  for (const location of locations) {
    const fullPath = path.join(projectPath, location);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Detect framework from project
 * @param {string} projectPath - Project root
 * @returns {string} Framework name
 */
function detectFramework(projectPath = process.cwd()) {
  const tools = detectTools(projectPath);

  for (const [lang, langTools] of Object.entries(tools.tools)) {
    if (langTools.testFramework) {
      return langTools.testFramework.toLowerCase();
    }
  }

  // Fallback: check for coverage files
  for (const [framework, locations] of Object.entries(COVERAGE_LOCATIONS)) {
    for (const location of locations) {
      if (fs.existsSync(path.join(projectPath, location))) {
        return framework;
      }
    }
  }

  return 'unknown';
}

/**
 * Extract test -> file mapping from test results
 * Parses test output to find which tests executed which files
 * @param {string} testOutput - Test runner output
 * @param {string} framework - Test framework
 * @returns {Object} Test to files mapping
 */
function extractTestMapping(testOutput, framework) {
  const mapping = {};

  // This is framework-specific and often requires --verbose or special reporters
  // For now, return empty - this should be enhanced per framework

  return mapping;
}

/**
 * Run tests with coverage and build map
 * @param {Object} options - Options
 * @returns {Promise<Object>} Build result
 */
async function buildCoverageMap(options = {}) {
  const {
    projectPath = process.cwd(),
    framework = detectFramework(projectPath),
    coveragePath = null,
    runTests = true,
    clear = false
  } = options;

  console.log(`\nBuilding coverage map for ${framework}...\n`);

  // Optionally clear existing map
  if (clear) {
    clearCoverageMap();
    console.log('Cleared existing coverage map');
  }

  // Find or use provided coverage file
  let coverageFile = coveragePath || findCoverageFile(framework, projectPath);

  // Run tests if needed
  if (runTests && !coverageFile) {
    console.log('Running tests with coverage...');

    try {
      const tools = detectTools(projectPath);
      const lang = Object.keys(tools.tools)[0];
      const coverageCmd = tools.tools[lang]?.coverage;

      if (coverageCmd) {
        execSync(coverageCmd, {
          cwd: projectPath,
          stdio: 'inherit',
          env: { ...process.env, CI: 'true' }
        });

        coverageFile = findCoverageFile(framework, projectPath);
      }
    } catch (err) {
      console.error(`Error running tests: ${err.message}`);
    }
  }

  if (!coverageFile) {
    return {
      success: false,
      error: `No coverage file found for ${framework}. Run tests with coverage first.`
    };
  }

  console.log(`Parsing coverage from: ${coverageFile}`);

  // Parse coverage based on framework
  let coverageData;
  try {
    switch (framework) {
      case 'jest':
      case 'vitest':
        coverageData = parseJestCoverage(coverageFile);
        break;
      case 'nyc':
        coverageData = parseNycCoverage(coverageFile);
        break;
      case 'pytest':
        coverageData = parsePytestCoverage(coverageFile);
        break;
      case 'go':
        coverageData = parseGoCoverage(coverageFile);
        break;
      case 'lcov':
        coverageData = parseLcovCoverage(coverageFile);
        break;
      default:
        // Try to auto-detect from file content
        const content = fs.readFileSync(coverageFile, 'utf8');
        if (content.startsWith('mode:')) {
          coverageData = parseGoCoverage(coverageFile);
        } else if (content.startsWith('TN:') || content.startsWith('SF:')) {
          coverageData = parseLcovCoverage(coverageFile);
        } else {
          coverageData = parseJestCoverage(coverageFile);
        }
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse coverage file: ${err.message}`
    };
  }

  // Merge into coverage map
  const map = mergeCoverageData(coverageData, framework);

  const fileCount = Object.keys(coverageData).length;
  console.log(`\nProcessed ${fileCount} source files`);

  return {
    success: true,
    framework,
    filesProcessed: fileCount,
    mapPath: path.join(projectPath, '.ctoc', 'quality-state', 'coverage-map.json')
  };
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    projectPath: process.cwd(),
    framework: null,
    coveragePath: null,
    runTests: false,
    clear: false
  };

  // Parse CLI arguments
  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      options.framework = arg.substring(9);
    } else if (arg.startsWith('--path=')) {
      options.coveragePath = arg.substring(7);
    } else if (arg === '--run-tests') {
      options.runTests = true;
    } else if (arg === '--clear') {
      options.clear = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Build Coverage Map

Parses coverage reports and builds file -> test mapping for smart test selection.

Usage:
  node build-coverage-map.js [options]

Options:
  --format=<type>    Coverage format: jest, nyc, pytest, go, lcov
  --path=<file>      Path to coverage file (auto-detected if not specified)
  --run-tests        Run tests with coverage before parsing
  --clear            Clear existing coverage map before building
  --help, -h         Show this help

Examples:
  node build-coverage-map.js
  node build-coverage-map.js --format=jest --path=coverage/coverage-final.json
  node build-coverage-map.js --run-tests --clear
`);
      process.exit(0);
    }
  }

  const result = await buildCoverageMap(options);

  if (result.success) {
    console.log('\nCoverage map built successfully!');
    console.log(`Framework: ${result.framework}`);
    console.log(`Files: ${result.filesProcessed}`);
    console.log(`Map saved to: ${result.mapPath}`);
  } else {
    console.error(`\nError: ${result.error}`);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = {
  buildCoverageMap,
  parseJestCoverage,
  parseNycCoverage,
  parsePytestCoverage,
  parseGoCoverage,
  parseLcovCoverage,
  findCoverageFile,
  detectFramework,
  COVERAGE_LOCATIONS
};

// Run CLI if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}

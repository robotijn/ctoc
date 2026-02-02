/**
 * Coverage Command
 * Manages test coverage checking, enforcement, and reporting
 *
 * Usage:
 *   ctoc coverage check [--mode <mode>]
 *   ctoc coverage report [--format <format>]
 *   ctoc coverage enforce [--threshold <n>]
 *   ctoc coverage trend
 *   ctoc coverage files [--below <threshold>]
 */

const fs = require('fs');
const path = require('path');
const { CoverageChecker, THRESHOLDS } = require('../lib/coverage-checker');

/**
 * Execute coverage command
 * @param {Object} options - Command options
 * @param {string} options.action - Action to perform (check, report, enforce, trend, files)
 * @param {string} options.mode - Quality mode (strict, strictest, legacy)
 * @param {string} options.format - Report format
 * @param {number} options.threshold - Custom threshold
 * @param {number} options.below - Show files below this threshold
 * @param {string} options.projectRoot - Project root directory
 * @returns {Object} Command result
 */
async function execute(options) {
  const {
    action = 'check',
    mode = 'strict',
    format = 'text',
    threshold,
    below,
    projectRoot = process.cwd()
  } = options;

  switch (action) {
    case 'check':
      return await checkCoverage(projectRoot, mode);

    case 'report':
      return await generateReport(projectRoot, mode, format);

    case 'enforce':
      return await enforceCoverage(projectRoot, mode, threshold);

    case 'trend':
      return await showTrend(projectRoot);

    case 'files':
      return await showFilesCoverage(projectRoot, mode, below);

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: check, report, enforce, trend, files`
      };
  }
}

/**
 * Check coverage against thresholds
 * @param {string} projectRoot - Project root path
 * @param {string} mode - Quality mode
 * @returns {Object} Check result
 */
async function checkCoverage(projectRoot, mode) {
  const reportPath = findCoverageReport(projectRoot);

  if (!reportPath) {
    return {
      success: false,
      error: 'No coverage report found.',
      suggestion: 'Run tests with coverage enabled first:\n' +
        '  - npm test -- --coverage (Jest/Vitest)\n' +
        '  - pytest --cov (Python)\n' +
        '  - go test -coverprofile=coverage.out (Go)'
    };
  }

  const format = CoverageChecker.detectFormat(reportPath.path);
  if (!format) {
    return {
      success: false,
      error: `Could not detect format of coverage report: ${reportPath.path}`
    };
  }

  const checker = new CoverageChecker(mode);

  try {
    const coverage = checker.parseCoverage(format, reportPath.path);
    const result = checker.check(coverage);
    const report = checker.generateReport(coverage);

    return {
      success: true,
      pass: result.pass,
      coverage,
      thresholds: result.thresholds,
      failures: result.failures,
      format,
      reportFile: reportPath.relative,
      mode,
      message: report
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse coverage report: ${error.message}`
    };
  }
}

/**
 * Generate coverage report in specified format
 * @param {string} projectRoot - Project root path
 * @param {string} mode - Quality mode
 * @param {string} format - Output format (text, json, markdown)
 * @returns {Object} Report result
 */
async function generateReport(projectRoot, mode, format) {
  const reportPath = findCoverageReport(projectRoot);

  if (!reportPath) {
    return {
      success: false,
      error: 'No coverage report found.'
    };
  }

  const coverageFormat = CoverageChecker.detectFormat(reportPath.path);
  const checker = new CoverageChecker(mode);

  try {
    const coverage = checker.parseCoverage(coverageFormat, reportPath.path);
    const result = checker.check(coverage);

    let report;
    switch (format) {
      case 'json':
        report = JSON.stringify({
          mode,
          coverage,
          thresholds: result.thresholds,
          pass: result.pass,
          failures: result.failures,
          timestamp: new Date().toISOString()
        }, null, 2);
        break;

      case 'markdown':
        report = generateMarkdownReport(coverage, result, mode);
        break;

      case 'text':
      default:
        report = checker.generateReport(coverage);
        break;
    }

    return {
      success: true,
      format,
      report,
      message: report
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate report: ${error.message}`
    };
  }
}

/**
 * Enforce coverage with exit code for CI
 * @param {string} projectRoot - Project root path
 * @param {string} mode - Quality mode
 * @param {number} customThreshold - Optional custom threshold
 * @returns {Object} Enforcement result
 */
async function enforceCoverage(projectRoot, mode, customThreshold) {
  const result = await checkCoverage(projectRoot, mode);

  if (!result.success) {
    return result;
  }

  // Apply custom threshold if provided
  if (customThreshold !== undefined) {
    const coverage = result.coverage;
    const failures = [];

    for (const [metric, value] of Object.entries(coverage)) {
      if (value < customThreshold) {
        failures.push(`${metric}: ${value}% < ${customThreshold}% threshold`);
      }
    }

    result.pass = failures.length === 0;
    result.failures = failures;
    result.customThreshold = customThreshold;
  }

  const lines = [];
  lines.push('Coverage Enforcement');
  lines.push('====================');
  lines.push('');
  lines.push(`Mode: ${mode}`);
  if (customThreshold !== undefined) {
    lines.push(`Custom Threshold: ${customThreshold}%`);
  }
  lines.push('');
  lines.push(`Lines:      ${result.coverage.lines}%`);
  lines.push(`Branches:   ${result.coverage.branches}%`);
  lines.push(`Functions:  ${result.coverage.functions}%`);
  lines.push(`Statements: ${result.coverage.statements}%`);
  lines.push('');

  if (result.pass) {
    lines.push('Status: PASS - All coverage thresholds met');
  } else {
    lines.push('Status: FAIL - Coverage below thresholds');
    lines.push('');
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`  - ${failure}`);
    }
    lines.push('');
    lines.push('To fix:');
    lines.push('  1. Add tests for uncovered code paths');
    lines.push('  2. Or use legacy mode: ctoc coverage check --mode legacy');
  }

  result.message = lines.join('\n');
  return result;
}

/**
 * Show coverage trend over time
 * @param {string} projectRoot - Project root path
 * @returns {Object} Trend result
 */
async function showTrend(projectRoot) {
  const historyPath = path.join(projectRoot, '.ctoc', 'coverage-history.json');

  if (!fs.existsSync(historyPath)) {
    return {
      success: true,
      hasHistory: false,
      message: 'No coverage history found.\n\n' +
        'To start tracking coverage trend:\n' +
        '  1. Run tests with coverage\n' +
        '  2. Run: ctoc coverage check\n' +
        '  3. Commit the .ctoc/coverage-history.json file\n\n' +
        'Coverage history is saved automatically on each check.'
    };
  }

  try {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

    if (history.length === 0) {
      return {
        success: true,
        hasHistory: false,
        message: 'Coverage history is empty.'
      };
    }

    // Generate ASCII chart
    const lines = [];
    lines.push('Coverage Trend');
    lines.push('==============');
    lines.push('');

    const values = history.slice(-20).map(h => h.lines);
    const max = Math.max(...values, 100);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const chartHeight = 8;

    for (let row = chartHeight; row >= 0; row--) {
      const threshold = min + (row / chartHeight) * range;
      const label = String(Math.round(threshold)).padStart(3);
      let line = `${label}% |`;

      for (const value of values) {
        const normalizedValue = ((value - min) / range) * chartHeight;
        if (Math.round(normalizedValue) >= row) {
          line += '#';
        } else {
          line += ' ';
        }
      }
      lines.push(line);
    }

    lines.push('     +' + '-'.repeat(values.length));
    lines.push('');

    // Statistics
    const latest = values[values.length - 1];
    const oldest = values[0];
    const change = latest - oldest;
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

    lines.push(`Current:  ${latest}%`);
    lines.push(`Average:  ${avg}%`);
    lines.push(`Change:   ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`);
    lines.push(`Samples:  ${history.length}`);

    if (change > 0) {
      lines.push('');
      lines.push('Coverage is trending UP - keep it up!');
    } else if (change < -5) {
      lines.push('');
      lines.push('WARNING: Coverage is trending DOWN. Add more tests!');
    }

    return {
      success: true,
      hasHistory: true,
      current: latest,
      average: avg,
      change,
      samples: history.length,
      message: lines.join('\n')
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read coverage history: ${error.message}`
    };
  }
}

/**
 * Show per-file coverage
 * @param {string} projectRoot - Project root path
 * @param {string} mode - Quality mode
 * @param {number} below - Show files below this threshold
 * @returns {Object} Files coverage result
 */
async function showFilesCoverage(projectRoot, mode, below) {
  const reportPath = findCoverageReport(projectRoot);

  if (!reportPath) {
    return {
      success: false,
      error: 'No coverage report found.'
    };
  }

  // Try to find detailed coverage report
  const detailedPaths = [
    { path: path.join(projectRoot, 'coverage', 'coverage-final.json'), format: 'istanbul' },
    { path: path.join(projectRoot, 'coverage', 'lcov.info'), format: 'lcov' }
  ];

  let detailedPath = null;
  for (const p of detailedPaths) {
    if (fs.existsSync(p.path)) {
      detailedPath = p;
      break;
    }
  }

  if (!detailedPath) {
    return {
      success: false,
      error: 'No detailed coverage report found.',
      suggestion: 'Use Istanbul/nyc or LCOV format for per-file coverage.'
    };
  }

  try {
    const threshold = below !== undefined ? below : THRESHOLDS[mode].lines;
    const files = parseFileCoverage(detailedPath.path, detailedPath.format);

    // Filter files below threshold
    const belowThreshold = files.filter(f => f.lines < threshold);
    belowThreshold.sort((a, b) => a.lines - b.lines);

    const lines = [];
    lines.push('Per-File Coverage');
    lines.push('=================');
    lines.push('');
    lines.push(`Showing files below ${threshold}% coverage`);
    lines.push('');

    if (belowThreshold.length === 0) {
      lines.push('All files meet coverage threshold!');
    } else {
      lines.push('| File | Lines | Branches | Gap |');
      lines.push('|------|-------|----------|-----|');

      for (const file of belowThreshold.slice(0, 20)) {
        const gap = threshold - file.lines;
        const shortPath = file.path.replace(projectRoot, '').replace(/^\//, '');
        lines.push(
          `| ${shortPath.slice(-40).padEnd(40)} | ${String(file.lines).padStart(3)}% | ${String(file.branches).padStart(3)}% | -${gap.toFixed(0)}% |`
        );
      }

      if (belowThreshold.length > 20) {
        lines.push(`... and ${belowThreshold.length - 20} more files`);
      }

      lines.push('');
      lines.push(`Total files below threshold: ${belowThreshold.length}`);
    }

    return {
      success: true,
      threshold,
      total: files.length,
      belowThreshold: belowThreshold.length,
      files: belowThreshold,
      message: lines.join('\n')
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse file coverage: ${error.message}`
    };
  }
}

/**
 * Find coverage report in common locations
 * @param {string} projectRoot - Project root path
 * @returns {Object|null} Report path info or null
 */
function findCoverageReport(projectRoot) {
  const locations = [
    'coverage/coverage-summary.json',
    'coverage/lcov.info',
    'coverage/cobertura-coverage.xml',
    'coverage.out',
    'coverage.xml',
    'htmlcov/coverage.json',
    'target/site/jacoco/jacoco.xml',
    'build/reports/jacoco/test/jacocoTestReport.xml'
  ];

  for (const relative of locations) {
    const full = path.join(projectRoot, relative);
    if (fs.existsSync(full)) {
      return { path: full, relative };
    }
  }

  return null;
}

/**
 * Parse per-file coverage from detailed report
 * @param {string} reportPath - Path to report
 * @param {string} format - Report format
 * @returns {Array<Object>} File coverage data
 */
function parseFileCoverage(reportPath, format) {
  const content = fs.readFileSync(reportPath, 'utf8');

  if (format === 'istanbul') {
    const data = JSON.parse(content);
    const files = [];

    for (const [filePath, fileData] of Object.entries(data)) {
      if (filePath === 'total') continue;

      let lines = 0, linesCovered = 0;
      let branches = 0, branchesCovered = 0;

      // Count statements as lines
      if (fileData.s) {
        for (const count of Object.values(fileData.s)) {
          lines++;
          if (count > 0) linesCovered++;
        }
      }

      // Count branches
      if (fileData.b) {
        for (const counts of Object.values(fileData.b)) {
          for (const count of counts) {
            branches++;
            if (count > 0) branchesCovered++;
          }
        }
      }

      files.push({
        path: filePath,
        lines: lines > 0 ? Math.round((linesCovered / lines) * 100) : 100,
        branches: branches > 0 ? Math.round((branchesCovered / branches) * 100) : 100
      });
    }

    return files;
  }

  if (format === 'lcov') {
    const files = [];
    let currentFile = null;
    let lf = 0, lh = 0, brf = 0, brh = 0;

    for (const line of content.split('\n')) {
      if (line.startsWith('SF:')) {
        currentFile = line.slice(3);
        lf = lh = brf = brh = 0;
      } else if (line.startsWith('LF:')) {
        lf = parseInt(line.slice(3), 10);
      } else if (line.startsWith('LH:')) {
        lh = parseInt(line.slice(3), 10);
      } else if (line.startsWith('BRF:')) {
        brf = parseInt(line.slice(4), 10);
      } else if (line.startsWith('BRH:')) {
        brh = parseInt(line.slice(4), 10);
      } else if (line === 'end_of_record' && currentFile) {
        files.push({
          path: currentFile,
          lines: lf > 0 ? Math.round((lh / lf) * 100) : 100,
          branches: brf > 0 ? Math.round((brh / brf) * 100) : 100
        });
        currentFile = null;
      }
    }

    return files;
  }

  return [];
}

/**
 * Generate markdown coverage report
 * @param {Object} coverage - Coverage data
 * @param {Object} result - Check result
 * @param {string} mode - Quality mode
 * @returns {string} Markdown report
 */
function generateMarkdownReport(coverage, result, mode) {
  const lines = [];
  lines.push('# Coverage Report');
  lines.push('');
  lines.push(`**Mode:** ${mode}`);
  lines.push(`**Status:** ${result.pass ? 'PASS' : 'FAIL'}`);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Actual | Threshold | Status |');
  lines.push('|--------|--------|-----------|--------|');

  for (const [metric, actual] of Object.entries(coverage)) {
    const threshold = result.thresholds[metric] || 0;
    const status = actual >= threshold ? 'PASS' : 'FAIL';
    lines.push(`| ${metric} | ${actual}% | ${threshold}% | ${status} |`);
  }

  if (result.failures.length > 0) {
    lines.push('');
    lines.push('## Failures');
    lines.push('');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
}

/**
 * Save coverage to history
 * @param {string} projectRoot - Project root path
 * @param {Object} coverage - Coverage data
 */
function saveCoverageHistory(projectRoot, coverage) {
  const ctocDir = path.join(projectRoot, '.ctoc');
  const historyPath = path.join(ctocDir, 'coverage-history.json');

  if (!fs.existsSync(ctocDir)) {
    fs.mkdirSync(ctocDir, { recursive: true });
  }

  let history = [];
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {
      history = [];
    }
  }

  history.push({
    timestamp: new Date().toISOString(),
    ...coverage
  });

  // Keep last 100 entries
  if (history.length > 100) {
    history = history.slice(-100);
  }

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

module.exports = {
  execute,
  checkCoverage,
  generateReport,
  enforceCoverage,
  showTrend,
  showFilesCoverage,
  findCoverageReport,
  saveCoverageHistory
};

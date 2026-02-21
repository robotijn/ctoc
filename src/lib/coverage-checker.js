/**
 * Coverage Checker
 * Parses coverage reports from multiple formats and enforces thresholds
 *
 * Supports:
 * - Istanbul (JSON)
 * - LCOV
 * - Cobertura (XML)
 * - Go coverage
 * - Python coverage.py
 */

const fs = require('fs');
const path = require('path');

/**
 * Coverage thresholds per mode
 * @type {Object.<string, Object>}
 */
const THRESHOLDS = {
  strict: {
    lines: 80,
    branches: 80,
    functions: 80,
    statements: 80
  },
  strictest: {
    lines: 90,
    branches: 90,
    functions: 90,
    statements: 90
  },
  legacy: {
    lines: 50,
    branches: 50,
    functions: 50,
    statements: 50
  }
};

/**
 * Coverage Checker class
 * Parses coverage reports and checks against thresholds
 */
class CoverageChecker {
  /**
   * Create a CoverageChecker instance
   * @param {string} mode - Quality mode (strict, strictest, legacy)
   */
  constructor(mode = 'strict') {
    this.mode = mode;
    this.thresholds = THRESHOLDS[mode] || THRESHOLDS.strict;
  }

  /**
   * Parse coverage from various formats
   * @param {string} format - Coverage format (istanbul, lcov, cobertura, go, coverage-py)
   * @param {string} reportPath - Path to the coverage report file
   * @returns {Object} Normalized coverage data with lines, branches, functions, statements
   * @throws {Error} If format is unknown or file not found
   */
  parseCoverage(format, reportPath) {
    if (!fs.existsSync(reportPath)) {
      throw new Error(`Coverage report not found: ${reportPath}`);
    }

    const parsers = {
      istanbul: this.parseIstanbul.bind(this),
      'coverage-py': this.parseCoveragePy.bind(this),
      jacoco: this.parseJacoco.bind(this),
      lcov: this.parseLcov.bind(this),
      cobertura: this.parseCobertura.bind(this),
      go: this.parseGoCoverage.bind(this)
    };

    const parser = parsers[format];
    if (!parser) {
      throw new Error(`Unknown coverage format: ${format}. Supported: ${Object.keys(parsers).join(', ')}`);
    }

    return parser(reportPath);
  }

  /**
   * Parse Istanbul JSON coverage report
   * @param {string} reportPath - Path to coverage-summary.json
   * @returns {Object} Normalized coverage
   */
  parseIstanbul(reportPath) {
    const content = fs.readFileSync(reportPath, 'utf8');
    const data = JSON.parse(content);

    // Istanbul summary format
    if (data.total) {
      return {
        lines: Math.round(data.total.lines.pct),
        branches: Math.round(data.total.branches.pct),
        functions: Math.round(data.total.functions.pct),
        statements: Math.round(data.total.statements.pct)
      };
    }

    // Istanbul detailed format - calculate totals
    let totalLines = 0, coveredLines = 0;
    let totalBranches = 0, coveredBranches = 0;
    let totalFunctions = 0, coveredFunctions = 0;
    let totalStatements = 0, coveredStatements = 0;

    for (const file of Object.values(data)) {
      if (file.s) {
        for (const count of Object.values(file.s)) {
          totalStatements++;
          if (count > 0) coveredStatements++;
        }
      }
      if (file.b) {
        for (const counts of Object.values(file.b)) {
          for (const count of counts) {
            totalBranches++;
            if (count > 0) coveredBranches++;
          }
        }
      }
      if (file.f) {
        for (const count of Object.values(file.f)) {
          totalFunctions++;
          if (count > 0) coveredFunctions++;
        }
      }
    }

    return {
      lines: totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0,
      branches: totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 100) : 0,
      functions: totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 100) : 0,
      statements: totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0
    };
  }

  /**
   * Parse Python coverage.py report
   * @param {string} reportPath - Path to coverage.json
   * @returns {Object} Normalized coverage
   */
  parseCoveragePy(reportPath) {
    const content = fs.readFileSync(reportPath, 'utf8');
    const data = JSON.parse(content);

    if (data.totals) {
      return {
        lines: Math.round(data.totals.percent_covered || 0),
        branches: Math.round(data.totals.percent_covered_branches || data.totals.percent_covered || 0),
        functions: Math.round(data.totals.percent_covered || 0),
        statements: Math.round(data.totals.percent_covered || 0)
      };
    }

    return { lines: 0, branches: 0, functions: 0, statements: 0 };
  }

  /**
   * Parse JaCoCo XML report
   * @param {string} reportPath - Path to jacoco.xml
   * @returns {Object} Normalized coverage
   */
  parseJacoco(reportPath) {
    const content = fs.readFileSync(reportPath, 'utf8');

    // Simple XML parsing for JaCoCo counters
    const parseCounter = (type) => {
      const regex = new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"`);
      const match = content.match(regex);
      if (match) {
        const missed = parseInt(match[1], 10);
        const covered = parseInt(match[2], 10);
        const total = missed + covered;
        return total > 0 ? Math.round((covered / total) * 100) : 0;
      }
      return 0;
    };

    return {
      lines: parseCounter('LINE'),
      branches: parseCounter('BRANCH'),
      functions: parseCounter('METHOD'),
      statements: parseCounter('INSTRUCTION')
    };
  }

  /**
   * Parse LCOV format coverage report
   * @param {string} reportPath - Path to lcov.info
   * @returns {Object} Normalized coverage
   */
  parseLcov(reportPath) {
    const content = fs.readFileSync(reportPath, 'utf8');
    const lines = content.split('\n');

    let totalLines = 0, coveredLines = 0;
    let totalBranches = 0, coveredBranches = 0;
    let totalFunctions = 0, coveredFunctions = 0;

    for (const line of lines) {
      if (line.startsWith('LF:')) {
        totalLines += parseInt(line.slice(3), 10);
      } else if (line.startsWith('LH:')) {
        coveredLines += parseInt(line.slice(3), 10);
      } else if (line.startsWith('BRF:')) {
        totalBranches += parseInt(line.slice(4), 10);
      } else if (line.startsWith('BRH:')) {
        coveredBranches += parseInt(line.slice(4), 10);
      } else if (line.startsWith('FNF:')) {
        totalFunctions += parseInt(line.slice(4), 10);
      } else if (line.startsWith('FNH:')) {
        coveredFunctions += parseInt(line.slice(4), 10);
      }
    }

    return {
      lines: totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0,
      branches: totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 100) : 0,
      functions: totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 100) : 0,
      statements: totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0
    };
  }

  /**
   * Parse Cobertura XML format coverage report
   * @param {string} reportPath - Path to coverage.xml
   * @returns {Object} Normalized coverage
   */
  parseCobertura(reportPath) {
    const content = fs.readFileSync(reportPath, 'utf8');

    // Extract line-rate and branch-rate from root coverage element
    const lineRateMatch = content.match(/line-rate="([0-9.]+)"/);
    const branchRateMatch = content.match(/branch-rate="([0-9.]+)"/);

    const lineRate = lineRateMatch ? parseFloat(lineRateMatch[1]) : 0;
    const branchRate = branchRateMatch ? parseFloat(branchRateMatch[1]) : 0;

    return {
      lines: Math.round(lineRate * 100),
      branches: Math.round(branchRate * 100),
      functions: Math.round(lineRate * 100), // Cobertura doesn't have separate function coverage
      statements: Math.round(lineRate * 100)
    };
  }

  /**
   * Parse Go coverage profile
   * @param {string} reportPath - Path to coverage.out
   * @returns {Object} Normalized coverage
   */
  parseGoCoverage(reportPath) {
    const content = fs.readFileSync(reportPath, 'utf8');
    const lines = content.split('\n').slice(1); // Skip mode line

    let totalStatements = 0;
    let coveredStatements = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(' ');
      if (parts.length >= 3) {
        const statements = parseInt(parts[1], 10);
        const count = parseInt(parts[2], 10);
        totalStatements += statements;
        if (count > 0) {
          coveredStatements += statements;
        }
      }
    }

    const coverage = totalStatements > 0
      ? Math.round((coveredStatements / totalStatements) * 100)
      : 0;

    return {
      lines: coverage,
      branches: coverage, // Go coverage doesn't separate branches
      functions: coverage,
      statements: coverage
    };
  }

  /**
   * Check if coverage meets thresholds
   * @param {Object} coverage - Coverage data with lines, branches, functions, statements
   * @returns {Object} Result with pass boolean, failures array, coverage, and thresholds
   */
  check(coverage) {
    const failures = [];

    for (const [metric, threshold] of Object.entries(this.thresholds)) {
      const actual = coverage[metric];
      if (actual !== undefined && actual < threshold) {
        failures.push(
          `${metric}: ${actual}% < ${threshold}% threshold`
        );
      }
    }

    return {
      pass: failures.length === 0,
      failures,
      coverage,
      thresholds: this.thresholds
    };
  }

  /**
   * Generate human-readable coverage report
   * @param {Object} coverage - Coverage data
   * @returns {string} Formatted report
   */
  generateReport(coverage) {
    const result = this.check(coverage);
    const lines = [];

    lines.push('=== Coverage Report ===\n');
    lines.push(`Mode: ${this.mode}`);
    lines.push('');

    const metrics = ['lines', 'branches', 'functions', 'statements'];
    const maxWidth = Math.max(...metrics.map(m => m.length));

    for (const metric of metrics) {
      const actual = coverage[metric] || 0;
      const threshold = this.thresholds[metric];
      const status = actual >= threshold ? 'PASS' : 'FAIL';
      const statusIcon = actual >= threshold ? '+' : '-';

      lines.push(
        `${statusIcon} ${metric.padEnd(maxWidth)}: ${String(actual).padStart(3)}% (threshold: ${threshold}%) [${status}]`
      );
    }

    lines.push('');

    if (result.pass) {
      lines.push('Overall: PASS - All coverage thresholds met');
    } else {
      lines.push('Overall: FAIL - Coverage below thresholds');
      lines.push('');
      lines.push('Failures:');
      for (const failure of result.failures) {
        lines.push(`  - ${failure}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Auto-detect coverage format from file
   * @param {string} reportPath - Path to coverage report
   * @returns {string|null} Detected format or null
   */
  static detectFormat(reportPath) {
    const basename = path.basename(reportPath);
    const ext = path.extname(reportPath).toLowerCase();

    // Check by filename
    if (basename === 'coverage-summary.json' || basename === 'coverage-final.json') {
      return 'istanbul';
    }
    if (basename === 'lcov.info') {
      return 'lcov';
    }
    if (basename === 'coverage.out') {
      return 'go';
    }
    if (basename === 'jacoco.xml') {
      return 'jacoco';
    }

    // Check by extension
    if (ext === '.info') {
      return 'lcov';
    }
    if (ext === '.xml') {
      // Read first few lines to detect format
      try {
        const content = fs.readFileSync(reportPath, 'utf8');
        if (content.includes('<!DOCTYPE coverage')) {
          return 'cobertura';
        }
        if (content.includes('<report name="JaCoCo"') || content.includes('type="INSTRUCTION"')) {
          return 'jacoco';
        }
        return 'cobertura'; // Default XML format
      } catch (e) {
        return null;
      }
    }
    if (ext === '.json') {
      try {
        const content = fs.readFileSync(reportPath, 'utf8');
        const data = JSON.parse(content);
        if (data.total || data.s) {
          return 'istanbul';
        }
        if (data.totals && data.files) {
          return 'coverage-py';
        }
      } catch (e) {
        return null;
      }
    }

    return null;
  }
}

module.exports = {
  CoverageChecker,
  THRESHOLDS
};

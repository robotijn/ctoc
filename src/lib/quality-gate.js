/**
 * Quality Gate
 * Enforces quality thresholds across all dimensions of code quality
 *
 * Quality dimensions:
 * - Coverage: Line, branch, function coverage
 * - Security: SAST findings, vulnerabilities, secrets
 * - Code Quality: Linting, complexity, duplication
 * - Architecture: Dependency violations, circular dependencies
 */

const fs = require('fs');
const path = require('path');

/**
 * Gate status values
 * @type {Object}
 */
const GATE_STATUS = {
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  WARNING: 'WARNING',
  SKIPPED: 'SKIPPED'
};

/**
 * Default quality gate thresholds
 * @type {Object}
 */
const DEFAULT_THRESHOLDS = {
  strict: {
    coverage: {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80
    },
    security: {
      critical: 0,
      high: 0,
      medium: 10,
      secrets: 0
    },
    codeQuality: {
      lintErrors: 0,
      lintWarnings: 20,
      duplicatedLines: 3, // percentage
      codeSmells: 0
    },
    complexity: {
      cyclomatic: 10,
      cognitive: 15,
      functionLength: 50,
      fileLength: 400
    },
    architecture: {
      violations: 0,
      circularDeps: 0
    }
  },
  strictest: {
    coverage: {
      lines: 90,
      branches: 90,
      functions: 90,
      statements: 90
    },
    security: {
      critical: 0,
      high: 0,
      medium: 0,
      secrets: 0
    },
    codeQuality: {
      lintErrors: 0,
      lintWarnings: 0,
      duplicatedLines: 1, // percentage
      codeSmells: 0
    },
    complexity: {
      cyclomatic: 7,
      cognitive: 10,
      functionLength: 30,
      fileLength: 300
    },
    architecture: {
      violations: 0,
      circularDeps: 0
    }
  },
  legacy: {
    coverage: {
      lines: 50,
      branches: 50,
      functions: 50,
      statements: 50
    },
    security: {
      critical: 0,
      high: 5,
      medium: 20,
      secrets: 0
    },
    codeQuality: {
      lintErrors: 10,
      lintWarnings: 100,
      duplicatedLines: 10, // percentage
      codeSmells: 20
    },
    complexity: {
      cyclomatic: 15,
      cognitive: 20,
      functionLength: 100,
      fileLength: 600
    },
    architecture: {
      violations: 5,
      circularDeps: 3
    }
  }
};

/**
 * Quality Gate class
 * Evaluates code against quality thresholds
 */
class QualityGate {
  /**
   * Create a Quality Gate instance
   * @param {string} projectRoot - Root directory of the project
   * @param {Object} options - Configuration options
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.mode = options.mode || 'strict';
    this.thresholds = this.mergeThresholds(
      DEFAULT_THRESHOLDS[this.mode] || DEFAULT_THRESHOLDS.strict,
      options.thresholds || {}
    );
    this.results = {
      coverage: null,
      security: null,
      codeQuality: null,
      complexity: null,
      architecture: null
    };
    this.gateResults = [];
  }

  /**
   * Merge custom thresholds with defaults
   * @param {Object} defaults - Default thresholds
   * @param {Object} custom - Custom thresholds
   * @returns {Object} Merged thresholds
   */
  mergeThresholds(defaults, custom) {
    const merged = JSON.parse(JSON.stringify(defaults));

    for (const [category, values] of Object.entries(custom)) {
      if (merged[category]) {
        Object.assign(merged[category], values);
      }
    }

    return merged;
  }

  /**
   * Evaluate coverage against thresholds
   * @param {Object} coverage - Coverage metrics
   * @returns {Object} Gate result
   */
  evaluateCoverage(coverage) {
    const thresholds = this.thresholds.coverage;
    const failures = [];
    const warnings = [];

    for (const [metric, threshold] of Object.entries(thresholds)) {
      const actual = coverage[metric] || 0;
      const diff = actual - threshold;

      if (diff < 0) {
        failures.push({
          metric,
          actual,
          threshold,
          message: `${metric} coverage ${actual}% is below threshold of ${threshold}%`
        });
      } else if (diff < 5) {
        warnings.push({
          metric,
          actual,
          threshold,
          message: `${metric} coverage ${actual}% is close to threshold of ${threshold}%`
        });
      }
    }

    const result = {
      dimension: 'coverage',
      status: failures.length > 0 ? GATE_STATUS.FAILED : GATE_STATUS.PASSED,
      failures,
      warnings,
      metrics: coverage,
      thresholds
    };

    this.results.coverage = result;
    this.gateResults.push(result);
    return result;
  }

  /**
   * Evaluate security findings against thresholds
   * @param {Object} security - Security metrics (findings by severity)
   * @returns {Object} Gate result
   */
  evaluateSecurity(security) {
    const thresholds = this.thresholds.security;
    const failures = [];
    const warnings = [];

    // Map severity names
    const severityMap = {
      CRITICAL: 'critical',
      HIGH: 'high',
      MEDIUM: 'medium',
      MODERATE: 'medium'
    };

    // Check SAST findings
    for (const [severity, count] of Object.entries(security.sast || {})) {
      const thresholdKey = severityMap[severity] || severity.toLowerCase();
      const threshold = thresholds[thresholdKey];

      if (threshold !== undefined && count > threshold) {
        failures.push({
          type: 'sast',
          severity,
          actual: count,
          threshold,
          message: `${count} ${severity} SAST finding(s) exceeds threshold of ${threshold}`
        });
      }
    }

    // Check dependency vulnerabilities
    for (const [severity, count] of Object.entries(security.dependencies || {})) {
      const thresholdKey = severityMap[severity] || severity.toLowerCase();
      const threshold = thresholds[thresholdKey];

      if (threshold !== undefined && count > threshold) {
        failures.push({
          type: 'dependencies',
          severity,
          actual: count,
          threshold,
          message: `${count} ${severity} dependency vulnerability(ies) exceeds threshold of ${threshold}`
        });
      }
    }

    // Check secrets
    const secretsCount = security.secrets || 0;
    if (secretsCount > thresholds.secrets) {
      failures.push({
        type: 'secrets',
        actual: secretsCount,
        threshold: thresholds.secrets,
        message: `${secretsCount} secret(s) detected exceeds threshold of ${thresholds.secrets}`
      });
    }

    const result = {
      dimension: 'security',
      status: failures.length > 0 ? GATE_STATUS.FAILED : GATE_STATUS.PASSED,
      failures,
      warnings,
      metrics: security,
      thresholds
    };

    this.results.security = result;
    this.gateResults.push(result);
    return result;
  }

  /**
   * Evaluate code quality metrics against thresholds
   * @param {Object} quality - Code quality metrics
   * @returns {Object} Gate result
   */
  evaluateCodeQuality(quality) {
    const thresholds = this.thresholds.codeQuality;
    const failures = [];
    const warnings = [];

    // Lint errors
    if ((quality.lintErrors || 0) > thresholds.lintErrors) {
      failures.push({
        metric: 'lintErrors',
        actual: quality.lintErrors,
        threshold: thresholds.lintErrors,
        message: `${quality.lintErrors} lint error(s) exceeds threshold of ${thresholds.lintErrors}`
      });
    }

    // Lint warnings
    if ((quality.lintWarnings || 0) > thresholds.lintWarnings) {
      if (this.mode === 'strictest') {
        failures.push({
          metric: 'lintWarnings',
          actual: quality.lintWarnings,
          threshold: thresholds.lintWarnings,
          message: `${quality.lintWarnings} lint warning(s) exceeds threshold of ${thresholds.lintWarnings}`
        });
      } else {
        warnings.push({
          metric: 'lintWarnings',
          actual: quality.lintWarnings,
          threshold: thresholds.lintWarnings,
          message: `${quality.lintWarnings} lint warning(s) exceeds threshold of ${thresholds.lintWarnings}`
        });
      }
    }

    // Duplicated lines percentage
    if ((quality.duplicatedLines || 0) > thresholds.duplicatedLines) {
      failures.push({
        metric: 'duplicatedLines',
        actual: quality.duplicatedLines,
        threshold: thresholds.duplicatedLines,
        message: `${quality.duplicatedLines}% duplicated lines exceeds threshold of ${thresholds.duplicatedLines}%`
      });
    }

    // Code smells
    if ((quality.codeSmells || 0) > thresholds.codeSmells) {
      failures.push({
        metric: 'codeSmells',
        actual: quality.codeSmells,
        threshold: thresholds.codeSmells,
        message: `${quality.codeSmells} code smell(s) exceeds threshold of ${thresholds.codeSmells}`
      });
    }

    const result = {
      dimension: 'codeQuality',
      status: failures.length > 0 ? GATE_STATUS.FAILED : GATE_STATUS.PASSED,
      failures,
      warnings,
      metrics: quality,
      thresholds
    };

    this.results.codeQuality = result;
    this.gateResults.push(result);
    return result;
  }

  /**
   * Evaluate complexity metrics against thresholds
   * @param {Object} complexity - Complexity metrics
   * @returns {Object} Gate result
   */
  evaluateComplexity(complexity) {
    const thresholds = this.thresholds.complexity;
    const failures = [];
    const warnings = [];

    // Check functions exceeding cyclomatic complexity
    if ((complexity.functionsOverCyclomatic || 0) > 0) {
      failures.push({
        metric: 'cyclomatic',
        actual: complexity.functionsOverCyclomatic,
        threshold: thresholds.cyclomatic,
        message: `${complexity.functionsOverCyclomatic} function(s) exceed cyclomatic complexity of ${thresholds.cyclomatic}`
      });
    }

    // Check functions exceeding cognitive complexity
    if ((complexity.functionsOverCognitive || 0) > 0) {
      failures.push({
        metric: 'cognitive',
        actual: complexity.functionsOverCognitive,
        threshold: thresholds.cognitive,
        message: `${complexity.functionsOverCognitive} function(s) exceed cognitive complexity of ${thresholds.cognitive}`
      });
    }

    // Check functions exceeding length limit
    if ((complexity.functionsOverLength || 0) > 0) {
      failures.push({
        metric: 'functionLength',
        actual: complexity.functionsOverLength,
        threshold: thresholds.functionLength,
        message: `${complexity.functionsOverLength} function(s) exceed ${thresholds.functionLength} lines`
      });
    }

    // Check files exceeding length limit
    if ((complexity.filesOverLength || 0) > 0) {
      warnings.push({
        metric: 'fileLength',
        actual: complexity.filesOverLength,
        threshold: thresholds.fileLength,
        message: `${complexity.filesOverLength} file(s) exceed ${thresholds.fileLength} lines`
      });
    }

    const result = {
      dimension: 'complexity',
      status: failures.length > 0 ? GATE_STATUS.FAILED : GATE_STATUS.PASSED,
      failures,
      warnings,
      metrics: complexity,
      thresholds
    };

    this.results.complexity = result;
    this.gateResults.push(result);
    return result;
  }

  /**
   * Evaluate architecture metrics against thresholds
   * @param {Object} architecture - Architecture metrics
   * @returns {Object} Gate result
   */
  evaluateArchitecture(architecture) {
    const thresholds = this.thresholds.architecture;
    const failures = [];
    const warnings = [];

    // Check dependency violations
    if ((architecture.violations || 0) > thresholds.violations) {
      failures.push({
        metric: 'violations',
        actual: architecture.violations,
        threshold: thresholds.violations,
        message: `${architecture.violations} architecture violation(s) exceeds threshold of ${thresholds.violations}`
      });
    }

    // Check circular dependencies
    if ((architecture.circularDeps || 0) > thresholds.circularDeps) {
      failures.push({
        metric: 'circularDeps',
        actual: architecture.circularDeps,
        threshold: thresholds.circularDeps,
        message: `${architecture.circularDeps} circular dependency(ies) exceeds threshold of ${thresholds.circularDeps}`
      });
    }

    const result = {
      dimension: 'architecture',
      status: failures.length > 0 ? GATE_STATUS.FAILED : GATE_STATUS.PASSED,
      failures,
      warnings,
      metrics: architecture,
      thresholds
    };

    this.results.architecture = result;
    this.gateResults.push(result);
    return result;
  }

  /**
   * Run all quality gate evaluations
   * @param {Object} metrics - All quality metrics
   * @returns {Object} Complete gate evaluation
   */
  evaluate(metrics) {
    this.gateResults = [];

    if (metrics.coverage) {
      this.evaluateCoverage(metrics.coverage);
    }

    if (metrics.security) {
      this.evaluateSecurity(metrics.security);
    }

    if (metrics.codeQuality) {
      this.evaluateCodeQuality(metrics.codeQuality);
    }

    if (metrics.complexity) {
      this.evaluateComplexity(metrics.complexity);
    }

    if (metrics.architecture) {
      this.evaluateArchitecture(metrics.architecture);
    }

    return this.getOverallResult();
  }

  /**
   * Get overall gate result
   * @returns {Object} Overall result
   */
  getOverallResult() {
    const allFailures = [];
    const allWarnings = [];

    for (const result of this.gateResults) {
      allFailures.push(...result.failures.map(f => ({
        dimension: result.dimension,
        ...f
      })));
      allWarnings.push(...result.warnings.map(w => ({
        dimension: result.dimension,
        ...w
      })));
    }

    const status = allFailures.length > 0 ? GATE_STATUS.FAILED : GATE_STATUS.PASSED;

    const dimensions = this.gateResults.map(r => ({
      dimension: r.dimension,
      status: r.status,
      failureCount: r.failures.length,
      warningCount: r.warnings.length
    }));

    return {
      status,
      mode: this.mode,
      passed: status === GATE_STATUS.PASSED,
      dimensions,
      failures: allFailures,
      warnings: allWarnings,
      timestamp: new Date().toISOString(),
      message: this.generateReportFromData(status, dimensions, allFailures, allWarnings)
    };
  }

  /**
   * Generate human-readable report from data
   * @param {string} status - Gate status
   * @param {Array} dimensions - Dimension results
   * @param {Array} failures - All failures
   * @param {Array} warnings - All warnings
   * @returns {string} Report text
   */
  generateReportFromData(status, dimensions, failures, warnings) {
    const lines = [];
    const passed = status === GATE_STATUS.PASSED;

    lines.push('Quality Gate Report');
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`Mode: ${this.mode}`);
    lines.push(`Status: ${status}`);
    lines.push(`Timestamp: ${new Date().toISOString()}`);
    lines.push('');

    // Dimension summary
    lines.push('Dimension Summary');
    lines.push('-'.repeat(30));
    for (const dim of dimensions) {
      const icon = dim.status === GATE_STATUS.PASSED ? '+' : '-';
      lines.push(`  ${icon} ${dim.dimension}: ${dim.status}`);
      if (dim.failureCount > 0) {
        lines.push(`      ${dim.failureCount} failure(s)`);
      }
      if (dim.warningCount > 0) {
        lines.push(`      ${dim.warningCount} warning(s)`);
      }
    }
    lines.push('');

    // Failures
    if (failures.length > 0) {
      lines.push('Failures (Must Fix)');
      lines.push('-'.repeat(30));
      for (const failure of failures) {
        lines.push(`  [${failure.dimension}] ${failure.message}`);
      }
      lines.push('');
    }

    // Warnings
    if (warnings.length > 0) {
      lines.push('Warnings (Should Fix)');
      lines.push('-'.repeat(30));
      for (const warning of warnings) {
        lines.push(`  [${warning.dimension}] ${warning.message}`);
      }
      lines.push('');
    }

    // Summary
    if (passed) {
      lines.push('Quality gate PASSED. Code meets all thresholds.');
    } else {
      lines.push(`Quality gate FAILED. ${failures.length} threshold(s) not met.`);
      lines.push('');
      lines.push('To proceed:');
      lines.push('  1. Fix the failures listed above');
      lines.push('  2. Run quality checks again');
      lines.push('  3. Or use --mode legacy for relaxed thresholds');
    }

    return lines.join('\n');
  }

  /**
   * Generate human-readable report (convenience method)
   * @returns {string} Report text
   */
  generateReport() {
    const result = this.getOverallResult();
    return result.message;
  }

  /**
   * Save gate results to file
   * @param {string} outputPath - Path to save results
   */
  saveResults(outputPath) {
    const results = this.getOverallResult();
    results.thresholds = this.thresholds;
    results.results = this.results;

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  }

  /**
   * Load custom thresholds from file
   * @param {string} configPath - Path to config file
   * @returns {Object} Loaded thresholds
   */
  static loadConfig(configPath) {
    if (!fs.existsSync(configPath)) {
      return {};
    }

    const ext = path.extname(configPath);
    const content = fs.readFileSync(configPath, 'utf8');

    if (ext === '.json') {
      return JSON.parse(content);
    }

    if (ext === '.yaml' || ext === '.yml') {
      // Basic YAML parsing for simple configs
      const lines = content.split('\n');
      const config = {};
      let currentSection = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (!line.startsWith(' ') && trimmed.endsWith(':')) {
          currentSection = trimmed.slice(0, -1);
          config[currentSection] = {};
        } else if (currentSection && trimmed.includes(':')) {
          const [key, value] = trimmed.split(':').map(s => s.trim());
          config[currentSection][key] = isNaN(value) ? value : Number(value);
        }
      }

      return config;
    }

    return {};
  }
}

module.exports = {
  QualityGate,
  GATE_STATUS,
  DEFAULT_THRESHOLDS
};

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

const safeFs = require('./safe-fs');
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
 * Recognized severity labels (normalized to lower case). A KNOWN severity that
 * has no configured threshold is an intentional "unlimited" bucket and is
 * ignored; an UNKNOWN label with findings fails the gate closed. Kept as a set
 * so the fail-closed check is O(1) and the recognized vocabulary is explicit.
 * @type {Set<string>}
 */
const KNOWN_SEVERITIES = new Set([
  'critical', 'high', 'medium', 'moderate', 'low', 'info', 'informational'
]);

/**
 * Coerce a metric to a number, failing CLOSED on a non-numeric value.
 *
 * This is the single guard evaluateCoverage introduced, factored so every
 * dimension evaluator shares ONE code path. A metric that is PRESENT but not a
 * number ("N/A", "2 found", NaN) is evidence of a broken measurement, never of a
 * clean result, and must FAIL its dimension rather than be silently coerced to 0
 * and pass — the old `(metric || 0) > threshold` fail-open, under which a truthy
 * non-numeric turned `actual - threshold` (or `actual > threshold`) into a false
 * NaN comparison and the metric slipped through as neither failure nor warning.
 *
 * ABSENT handling is caller-defined via `absentDefault`: count metrics pass 0
 * (an absent count means "none reported"), while coverage passes NO default so an
 * unmeasured coverage figure is `undefined -> NaN -> FAIL`. `null` is treated as
 * absent to mirror the old `(metric || 0)` truthiness fallback.
 *
 * @param {*} value - raw metric value
 * @param {number} [absentDefault] - value to use when `value` is absent (undefined/null)
 * @returns {{ failed: boolean, value: * }} on failure `value` carries the raw input for reporting
 */
function numericOrFail(value, absentDefault) {
  if ((value === undefined || value === null) && absentDefault !== undefined) {
    return { failed: false, value: absentDefault };
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return { failed: true, value: value === undefined ? null : value };
  }
  return { failed: false, value: n };
}

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
      // Coerce explicitly and fail CLOSED on an unmeasurable value via the shared
      // numericOrFail guard (no absentDefault: absent coverage is undefined ->
      // NaN -> FAIL). The old `coverage[metric] || 0` silently turned a truthy
      // non-numeric (`"50%"`, `"N/A"`) into itself, so `actual - threshold` was
      // NaN and BOTH `NaN<0` and `NaN<5` are false — the metric slipped through
      // as neither failure nor warning (a fail-open pass). An unmeasurable
      // coverage figure is not evidence of coverage; it must FAIL.
      const rawActual = coverage[metric];
      const coerced = numericOrFail(rawActual);
      if (coerced.failed) {
        failures.push({
          metric,
          actual: coerced.value,
          threshold,
          message: `${metric} coverage is unmeasurable (${rawActual}) — cannot verify against threshold of ${threshold}%`
        });
        continue;
      }
      const actual = coerced.value;
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

    // Evaluate one severity bucket, failing CLOSED on an UNRECOGNIZED label.
    // The old code resolved an unknown label (`CRIT`, `BLOCKER`) to an undefined
    // threshold and skipped it, so 50 `CRIT` findings passed the gate silently.
    // A KNOWN severity that simply has no configured threshold (e.g. `LOW` under
    // strict, which caps critical/high/medium only) is legitimately ignored — a
    // deliberate "unlimited" bucket, not a blind spot. An UNKNOWN severity with
    // any findings is treated as a failure: we cannot prove it is benign.
    const evalBucket = (type, bucket) => {
      for (const [severity, rawCount] of Object.entries(bucket || {})) {
        const thresholdKey = severityMap[severity] || severity.toLowerCase();
        const threshold = thresholds[thresholdKey];

        // Fail CLOSED on a non-numeric finding count. A broken count ("2 found",
        // NaN) must never slip through the `count > threshold` comparison as a
        // false NaN result; an unmeasurable finding count is not proof of safety.
        const coerced = numericOrFail(rawCount, 0);
        if (coerced.failed) {
          failures.push({
            type,
            severity,
            actual: rawCount,
            threshold: threshold === undefined ? 'unrecognized' : threshold,
            message: `${type} finding count for severity '${severity}' is unmeasurable (${rawCount}) — failing closed`
          });
          continue;
        }
        const count = coerced.value;

        if (threshold === undefined) {
          if (!KNOWN_SEVERITIES.has(thresholdKey) && count > 0) {
            failures.push({
              type,
              severity,
              actual: count,
              threshold: 'unrecognized',
              message: `${count} finding(s) of unrecognized severity '${severity}' — failing closed (cannot prove benign)`
            });
          }
          continue;
        }

        if (count > threshold) {
          failures.push({
            type,
            severity,
            actual: count,
            threshold,
            message: type === 'sast'
              ? `${count} ${severity} SAST finding(s) exceeds threshold of ${threshold}`
              : `${count} ${severity} dependency vulnerability(ies) exceeds threshold of ${threshold}`
          });
        }
      }
    };

    // Check SAST findings and dependency vulnerabilities
    evalBucket('sast', security.sast);
    evalBucket('dependencies', security.dependencies);

    // Check secrets — fail CLOSED on a non-numeric count. The old
    // `security.secrets || 0` turned a truthy non-numeric ("2 found") into
    // itself, so `"2 found" > 0` was a false NaN comparison and TWO secrets
    // passed the gate; NaN || 0 was worse, coercing straight to 0.
    const secretsRaw = security.secrets;
    const secretsCoerced = numericOrFail(secretsRaw, 0);
    if (secretsCoerced.failed) {
      failures.push({
        type: 'secrets',
        actual: secretsRaw,
        threshold: thresholds.secrets,
        message: `secrets count is unmeasurable (${secretsRaw}) — cannot verify against threshold of ${thresholds.secrets}`
      });
    } else if (secretsCoerced.value > thresholds.secrets) {
      failures.push({
        type: 'secrets',
        actual: secretsCoerced.value,
        threshold: thresholds.secrets,
        message: `${secretsCoerced.value} secret(s) detected exceeds threshold of ${thresholds.secrets}`
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

    // Lint errors — coerce and fail CLOSED on a non-numeric count. The old
    // `(quality.lintErrors || 0) > threshold` turned a truthy non-numeric
    // ("N/A") into a false NaN comparison and passed the dimension.
    const lintErrors = numericOrFail(quality.lintErrors, 0);
    if (lintErrors.failed) {
      failures.push({
        metric: 'lintErrors',
        actual: quality.lintErrors,
        threshold: thresholds.lintErrors,
        message: `lintErrors is unmeasurable (${quality.lintErrors}) — cannot verify against threshold of ${thresholds.lintErrors}`
      });
    } else if (lintErrors.value > thresholds.lintErrors) {
      failures.push({
        metric: 'lintErrors',
        actual: quality.lintErrors,
        threshold: thresholds.lintErrors,
        message: `${quality.lintErrors} lint error(s) exceeds threshold of ${thresholds.lintErrors}`
      });
    }

    // Lint warnings — an unmeasurable count fails CLOSED regardless of mode; a
    // valid numeric overage stays mode-gated (failure under strictest, warning
    // otherwise), preserving the existing escalation semantics.
    const lintWarnings = numericOrFail(quality.lintWarnings, 0);
    if (lintWarnings.failed) {
      failures.push({
        metric: 'lintWarnings',
        actual: quality.lintWarnings,
        threshold: thresholds.lintWarnings,
        message: `lintWarnings is unmeasurable (${quality.lintWarnings}) — cannot verify against threshold of ${thresholds.lintWarnings}`
      });
    } else if (lintWarnings.value > thresholds.lintWarnings) {
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

    // Duplicated lines percentage — fail CLOSED on a non-numeric value.
    const duplicatedLines = numericOrFail(quality.duplicatedLines, 0);
    if (duplicatedLines.failed) {
      failures.push({
        metric: 'duplicatedLines',
        actual: quality.duplicatedLines,
        threshold: thresholds.duplicatedLines,
        message: `duplicatedLines is unmeasurable (${quality.duplicatedLines}) — cannot verify against threshold of ${thresholds.duplicatedLines}%`
      });
    } else if (duplicatedLines.value > thresholds.duplicatedLines) {
      failures.push({
        metric: 'duplicatedLines',
        actual: quality.duplicatedLines,
        threshold: thresholds.duplicatedLines,
        message: `${quality.duplicatedLines}% duplicated lines exceeds threshold of ${thresholds.duplicatedLines}%`
      });
    }

    // Code smells — fail CLOSED on a non-numeric count.
    const codeSmells = numericOrFail(quality.codeSmells, 0);
    if (codeSmells.failed) {
      failures.push({
        metric: 'codeSmells',
        actual: quality.codeSmells,
        threshold: thresholds.codeSmells,
        message: `codeSmells is unmeasurable (${quality.codeSmells}) — cannot verify against threshold of ${thresholds.codeSmells}`
      });
    } else if (codeSmells.value > thresholds.codeSmells) {
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

    // Each check fires on "count of functions/files over the limit > 0". Coerce
    // and fail CLOSED on a non-numeric count: the old `(complexity.x || 0) > 0`
    // turned a truthy non-numeric ("N/A") into a false NaN comparison and passed.
    const cyclomatic = numericOrFail(complexity.functionsOverCyclomatic, 0);
    if (cyclomatic.failed) {
      failures.push({
        metric: 'cyclomatic',
        actual: complexity.functionsOverCyclomatic,
        threshold: thresholds.cyclomatic,
        message: `functionsOverCyclomatic is unmeasurable (${complexity.functionsOverCyclomatic}) — cannot verify cyclomatic complexity of ${thresholds.cyclomatic}`
      });
    } else if (cyclomatic.value > 0) {
      failures.push({
        metric: 'cyclomatic',
        actual: complexity.functionsOverCyclomatic,
        threshold: thresholds.cyclomatic,
        message: `${complexity.functionsOverCyclomatic} function(s) exceed cyclomatic complexity of ${thresholds.cyclomatic}`
      });
    }

    // Check functions exceeding cognitive complexity
    const cognitive = numericOrFail(complexity.functionsOverCognitive, 0);
    if (cognitive.failed) {
      failures.push({
        metric: 'cognitive',
        actual: complexity.functionsOverCognitive,
        threshold: thresholds.cognitive,
        message: `functionsOverCognitive is unmeasurable (${complexity.functionsOverCognitive}) — cannot verify cognitive complexity of ${thresholds.cognitive}`
      });
    } else if (cognitive.value > 0) {
      failures.push({
        metric: 'cognitive',
        actual: complexity.functionsOverCognitive,
        threshold: thresholds.cognitive,
        message: `${complexity.functionsOverCognitive} function(s) exceed cognitive complexity of ${thresholds.cognitive}`
      });
    }

    // Check functions exceeding length limit
    const functionLength = numericOrFail(complexity.functionsOverLength, 0);
    if (functionLength.failed) {
      failures.push({
        metric: 'functionLength',
        actual: complexity.functionsOverLength,
        threshold: thresholds.functionLength,
        message: `functionsOverLength is unmeasurable (${complexity.functionsOverLength}) — cannot verify against ${thresholds.functionLength} lines`
      });
    } else if (functionLength.value > 0) {
      failures.push({
        metric: 'functionLength',
        actual: complexity.functionsOverLength,
        threshold: thresholds.functionLength,
        message: `${complexity.functionsOverLength} function(s) exceed ${thresholds.functionLength} lines`
      });
    }

    // Check files exceeding length limit. A valid numeric overage is advisory
    // (a WARNING, not a failure); an UNMEASURABLE count still fails CLOSED.
    const fileLength = numericOrFail(complexity.filesOverLength, 0);
    if (fileLength.failed) {
      failures.push({
        metric: 'fileLength',
        actual: complexity.filesOverLength,
        threshold: thresholds.fileLength,
        message: `filesOverLength is unmeasurable (${complexity.filesOverLength}) — cannot verify against ${thresholds.fileLength} lines`
      });
    } else if (fileLength.value > 0) {
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

    // Check dependency violations — fail CLOSED on a non-numeric count. The old
    // `(architecture.violations || 0) > threshold` turned a truthy non-numeric
    // into a false NaN comparison and passed the dimension.
    const violations = numericOrFail(architecture.violations, 0);
    if (violations.failed) {
      failures.push({
        metric: 'violations',
        actual: architecture.violations,
        threshold: thresholds.violations,
        message: `violations is unmeasurable (${architecture.violations}) — cannot verify against threshold of ${thresholds.violations}`
      });
    } else if (violations.value > thresholds.violations) {
      failures.push({
        metric: 'violations',
        actual: architecture.violations,
        threshold: thresholds.violations,
        message: `${architecture.violations} architecture violation(s) exceeds threshold of ${thresholds.violations}`
      });
    }

    // Check circular dependencies — fail CLOSED on a non-numeric count.
    const circularDeps = numericOrFail(architecture.circularDeps, 0);
    if (circularDeps.failed) {
      failures.push({
        metric: 'circularDeps',
        actual: architecture.circularDeps,
        threshold: thresholds.circularDeps,
        message: `circularDeps is unmeasurable (${architecture.circularDeps}) — cannot verify against threshold of ${thresholds.circularDeps}`
      });
    } else if (circularDeps.value > thresholds.circularDeps) {
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

    // Fail CLOSED when nothing was evaluated. `evaluate({})` or
    // `evaluate({coverage:null})` runs zero dimension checks, produces zero
    // failures, and the old code reported PASSED — a gate passing on the
    // ABSENCE of evidence. Zero verified dimensions is never a pass: a gate that
    // measured nothing has proven nothing.
    if (this.gateResults.length === 0) {
      allFailures.push({
        dimension: 'gate',
        metric: 'dimensions',
        actual: 0,
        message: 'No quality dimensions were evaluated — a gate with zero evidence cannot pass (fail closed)'
      });
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
    if (!safeFs.existsSync(dir)) {
      safeFs.mkdirSync(dir, { recursive: true });
    }

    safeFs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  }

  /**
   * Load custom thresholds from file
   * @param {string} configPath - Path to config file
   * @returns {Object} Loaded thresholds
   */
  static loadConfig(configPath) {
    if (!safeFs.existsSync(configPath)) {
      return {};
    }

    const ext = path.extname(configPath);
    const content = safeFs.readFileSync(configPath, 'utf8');

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
          // A BLANK/absent value (`lines:` with nothing after the colon) must be
          // IGNORED so the default threshold is retained via mergeThresholds.
          // The old code fell through to `Number('') === 0` (because `isNaN('')`
          // is false), silently REPLACING an 80% floor with 0 and disabling the
          // gate. Skipping the key entirely keeps the default intact.
          if (value === undefined || value === '') continue;
          // `value` is a raw string; global isNaN performs the same ToNumber
          // coercion internally, so the `any` cast keeps runtime behavior identical
          // while satisfying isNaN's numeric parameter type.
          config[currentSection][key] = isNaN(/** @type {any} */ (value)) ? value : Number(value);
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

/**
 * Quality Scorer
 * Calculates comprehensive quality scores from multiple metrics sources
 *
 * Scoring breakdown (100 points total):
 * - Test Coverage: 25%
 * - Lint Compliance: 20%
 * - Security: 20%
 * - Complexity: 15%
 * - Architecture: 10%
 * - Documentation: 10%
 */

const fs = require('fs');
const path = require('path');
const { CoverageChecker } = require('./coverage-checker');
const { ArchitectureDetector } = require('./architecture-detector');

/**
 * Grade thresholds
 * @type {Object.<string, Object>}
 */
const GRADES = {
  A: { min: 90, max: 100, label: 'Excellent', color: 'green' },
  B: { min: 80, max: 89, label: 'Good', color: 'blue' },
  C: { min: 70, max: 79, label: 'Acceptable', color: 'yellow' },
  D: { min: 60, max: 69, label: 'Needs Work', color: 'orange' },
  F: { min: 0, max: 59, label: 'Critical', color: 'red' }
};

/**
 * Component weights for overall score
 * @type {Object.<string, number>}
 */
const WEIGHTS = {
  coverage: 0.25,
  lint: 0.20,
  security: 0.20,
  complexity: 0.15,
  architecture: 0.10,
  documentation: 0.10
};

/**
 * Coverage sub-weights (within coverage component)
 * @type {Object.<string, number>}
 */
const COVERAGE_SUBWEIGHTS = {
  branches: 0.40,
  lines: 0.30,
  functions: 0.20,
  statements: 0.10
};

/**
 * Quality Scorer class
 * Aggregates metrics and calculates comprehensive quality score
 */
class QualityScorer {
  /**
   * Create a QualityScorer instance
   * @param {string} projectPath - Path to project root
   * @param {Object} options - Scorer options
   */
  constructor(projectPath, options = {}) {
    this.projectPath = projectPath;
    this.options = {
      mode: 'strict',
      historyPath: path.join(projectPath, '.ctoc', 'quality-history.json'),
      ...options
    };
    this.cache = {};
    this.history = this.loadHistory();
  }

  /**
   * Calculate complete quality score
   * @returns {Promise<Object>} Quality score result with all components
   */
  async calculateScore() {
    const components = {
      coverage: await this.getCoverageScore(),
      lint: await this.getLintScore(),
      security: await this.getSecurityScore(),
      complexity: await this.getComplexityScore(),
      architecture: await this.getArchitectureScore(),
      documentation: await this.getDocumentationScore()
    };

    // Calculate weighted overall score
    let overall = 0;
    for (const [component, data] of Object.entries(components)) {
      overall += data.score * WEIGHTS[component];
    }
    overall = Math.round(overall);

    const grade = this.toGrade(overall);
    const trend = this.calculateTrend(overall);
    const recommendations = this.getRecommendations(components);

    // Store in history
    this.recordScore(overall, components);

    return {
      overall,
      grade,
      gradeInfo: GRADES[grade],
      components,
      weights: WEIGHTS,
      trend,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get coverage component score (25 points max)
   * @returns {Promise<Object>} Coverage score and details
   */
  async getCoverageScore() {
    const result = {
      score: 0,
      maxScore: 25,
      metrics: {
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0
      },
      details: [],
      source: null
    };

    // Try to find coverage report
    const coveragePaths = [
      { path: 'coverage/coverage-summary.json', format: 'istanbul' },
      { path: 'coverage/lcov.info', format: 'lcov' },
      { path: 'coverage/coverage.json', format: 'istanbul' },
      { path: '.nyc_output/coverage-summary.json', format: 'istanbul' },
      { path: 'coverage.out', format: 'go' },
      { path: 'htmlcov/coverage.json', format: 'coverage-py' },
      { path: 'target/site/jacoco/jacoco.xml', format: 'jacoco' },
      { path: 'coverage.xml', format: 'cobertura' }
    ];

    let coverageData = null;
    for (const { path: relPath, format } of coveragePaths) {
      const fullPath = path.join(this.projectPath, relPath);
      if (fs.existsSync(fullPath)) {
        try {
          const checker = new CoverageChecker(this.options.mode);
          coverageData = checker.parseCoverage(format, fullPath);
          result.source = relPath;
          break;
        } catch (e) {
          result.details.push(`Failed to parse ${relPath}: ${e.message}`);
        }
      }
    }

    if (!coverageData) {
      result.details.push('No coverage report found');
      return result;
    }

    result.metrics = coverageData;

    // Calculate weighted coverage score
    const weightedCoverage = (
      (coverageData.branches || 0) * COVERAGE_SUBWEIGHTS.branches +
      (coverageData.lines || 0) * COVERAGE_SUBWEIGHTS.lines +
      (coverageData.functions || 0) * COVERAGE_SUBWEIGHTS.functions +
      (coverageData.statements || 0) * COVERAGE_SUBWEIGHTS.statements
    );

    result.score = Math.round((weightedCoverage / 100) * 25);

    // Add detail messages
    if (coverageData.branches < 80) {
      result.details.push(`Branch coverage ${coverageData.branches}% below 80% target`);
    }
    if (coverageData.lines < 80) {
      result.details.push(`Line coverage ${coverageData.lines}% below 80% target`);
    }

    return result;
  }

  /**
   * Get lint component score (20 points max)
   * @returns {Promise<Object>} Lint score and details
   */
  async getLintScore() {
    const result = {
      score: 20, // Start at max, deduct for issues
      maxScore: 20,
      metrics: {
        errors: 0,
        warnings: 0,
        fixable: 0,
        total: 0
      },
      details: [],
      source: null
    };

    // Try to find lint results
    const lintPaths = [
      { path: '.eslintcache', format: 'eslint-cache' },
      { path: 'lint-results.json', format: 'json' },
      { path: '.ruff_cache', format: 'ruff' }
    ];

    // For now, estimate based on file existence of lint config
    const lintConfigs = [
      'eslint.config.js', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml',
      'ruff.toml', '.ruff.toml', 'pyproject.toml',
      '.golangci.yml', 'clippy.toml'
    ];

    let hasLintConfig = false;
    for (const config of lintConfigs) {
      if (fs.existsSync(path.join(this.projectPath, config))) {
        hasLintConfig = true;
        result.source = config;
        break;
      }
    }

    if (!hasLintConfig) {
      result.score = 10; // Partial score for no lint setup
      result.details.push('No lint configuration found');
    }

    // Try to read actual lint results if available
    const lintResultsPath = path.join(this.projectPath, 'lint-results.json');
    if (fs.existsSync(lintResultsPath)) {
      try {
        const lintData = JSON.parse(fs.readFileSync(lintResultsPath, 'utf8'));
        if (Array.isArray(lintData)) {
          // ESLint format
          for (const file of lintData) {
            result.metrics.errors += file.errorCount || 0;
            result.metrics.warnings += file.warningCount || 0;
            result.metrics.fixable += (file.fixableErrorCount || 0) + (file.fixableWarningCount || 0);
          }
        } else if (lintData.errorCount !== undefined) {
          result.metrics.errors = lintData.errorCount;
          result.metrics.warnings = lintData.warningCount || 0;
          result.metrics.fixable = lintData.fixableErrorCount || 0;
        }

        result.metrics.total = result.metrics.errors + result.metrics.warnings;
        result.source = 'lint-results.json';

        // Calculate score with deductions
        const deductions = (result.metrics.errors * 2.0) + (result.metrics.warnings * 0.5);
        result.score = Math.max(0, Math.round(20 - deductions));

        if (result.metrics.errors > 0) {
          result.details.push(`${result.metrics.errors} lint errors`);
        }
        if (result.metrics.warnings > 0) {
          result.details.push(`${result.metrics.warnings} lint warnings`);
        }
        if (result.metrics.fixable > 0) {
          result.details.push(`${result.metrics.fixable} auto-fixable issues`);
        }
      } catch (e) {
        result.details.push(`Failed to parse lint results: ${e.message}`);
      }
    }

    return result;
  }

  /**
   * Get security component score (20 points max)
   * @returns {Promise<Object>} Security score and details
   */
  async getSecurityScore() {
    const result = {
      score: 20,
      maxScore: 20,
      metrics: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0
      },
      details: [],
      source: null
    };

    // Try to find security audit results
    const securityPaths = [
      { path: 'npm-audit.json', format: 'npm' },
      { path: 'security-audit.json', format: 'generic' },
      { path: '.snyk', format: 'snyk' }
    ];

    for (const { path: relPath, format } of securityPaths) {
      const fullPath = path.join(this.projectPath, relPath);
      if (fs.existsSync(fullPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          result.source = relPath;

          if (format === 'npm' && data.metadata) {
            result.metrics.critical = data.metadata.vulnerabilities?.critical || 0;
            result.metrics.high = data.metadata.vulnerabilities?.high || 0;
            result.metrics.medium = data.metadata.vulnerabilities?.moderate || 0;
            result.metrics.low = data.metadata.vulnerabilities?.low || 0;
          } else if (data.vulnerabilities) {
            for (const vuln of Object.values(data.vulnerabilities)) {
              const severity = vuln.severity?.toLowerCase() || 'low';
              result.metrics[severity] = (result.metrics[severity] || 0) + 1;
            }
          }
          break;
        } catch (e) {
          result.details.push(`Failed to parse ${relPath}: ${e.message}`);
        }
      }
    }

    // Check for package-lock.json (indicates npm project that can be audited)
    const hasPackageLock = fs.existsSync(path.join(this.projectPath, 'package-lock.json'));
    if (hasPackageLock && !result.source) {
      result.details.push('Run "npm audit" to check for vulnerabilities');
    }

    // Calculate score
    result.metrics.total = result.metrics.critical + result.metrics.high +
                          result.metrics.medium + result.metrics.low;

    if (result.metrics.critical > 0) {
      result.score = 0; // Any critical = zero security score
      result.details.push(`CRITICAL: ${result.metrics.critical} critical vulnerabilities`);
    } else {
      const deductions = (result.metrics.high * 5) +
                        (result.metrics.medium * 2) +
                        (result.metrics.low * 0.5);
      result.score = Math.max(0, Math.round(20 - deductions));

      if (result.metrics.high > 0) {
        result.details.push(`${result.metrics.high} high severity vulnerabilities`);
      }
      if (result.metrics.medium > 0) {
        result.details.push(`${result.metrics.medium} medium severity vulnerabilities`);
      }
    }

    return result;
  }

  /**
   * Get complexity component score (15 points max)
   * @returns {Promise<Object>} Complexity score and details
   */
  async getComplexityScore() {
    const result = {
      score: 15,
      maxScore: 15,
      metrics: {
        avgCyclomatic: 0,
        maxCyclomatic: 0,
        hotspots: 0,
        totalFunctions: 0
      },
      details: [],
      hotspotFiles: [],
      source: null
    };

    // Try to find complexity report
    const complexityPath = path.join(this.projectPath, 'complexity-report.json');
    if (fs.existsSync(complexityPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(complexityPath, 'utf8'));
        result.source = 'complexity-report.json';

        if (data.summary) {
          result.metrics.avgCyclomatic = Math.round(data.summary.averageCyclomatic || 0);
          result.metrics.maxCyclomatic = data.summary.maxCyclomatic || 0;
          result.metrics.hotspots = data.summary.hotspots || 0;
          result.metrics.totalFunctions = data.summary.totalFunctions || 0;
        }

        if (data.hotspots && Array.isArray(data.hotspots)) {
          result.hotspotFiles = data.hotspots.slice(0, 5).map(h => ({
            file: h.file,
            function: h.function,
            complexity: h.cyclomatic
          }));
        }
      } catch (e) {
        result.details.push(`Failed to parse complexity report: ${e.message}`);
      }
    }

    // Score calculation based on thresholds
    let avgPoints = 5;
    if (result.metrics.avgCyclomatic > 10) avgPoints = 1;
    else if (result.metrics.avgCyclomatic > 5) avgPoints = 3;

    let maxPoints = 5;
    if (result.metrics.maxCyclomatic > 20) maxPoints = 1;
    else if (result.metrics.maxCyclomatic > 10) maxPoints = 3;

    let hotspotPoints = 5;
    if (result.metrics.hotspots > 3) hotspotPoints = 1;
    else if (result.metrics.hotspots > 0) hotspotPoints = 3;

    result.score = avgPoints + maxPoints + hotspotPoints;

    if (result.metrics.avgCyclomatic > 10) {
      result.details.push(`Average complexity ${result.metrics.avgCyclomatic} exceeds limit (10)`);
    }
    if (result.metrics.maxCyclomatic > 20) {
      result.details.push(`Maximum complexity ${result.metrics.maxCyclomatic} exceeds limit (20)`);
    }
    if (result.metrics.hotspots > 0) {
      result.details.push(`${result.metrics.hotspots} complexity hotspots (CC > 15)`);
    }

    return result;
  }

  /**
   * Get architecture component score (10 points max)
   * @returns {Promise<Object>} Architecture score and details
   */
  async getArchitectureScore() {
    const result = {
      score: 0,
      maxScore: 10,
      metrics: {
        pattern: null,
        violations: 0,
        cycles: 0
      },
      details: [],
      violations: [],
      cycles: []
    };

    const detector = new ArchitectureDetector(this.projectPath);
    const pattern = detector.detect();

    if (pattern) {
      result.metrics.pattern = pattern;
      result.score += 3; // Points for having a pattern

      const violations = detector.findViolations(pattern);
      result.metrics.violations = violations.length;
      result.violations = violations.slice(0, 5);

      if (violations.length === 0) {
        result.score += 4; // Full points for no violations
      } else {
        const violationDeduction = Math.min(4, violations.length * 0.5);
        result.score += Math.max(0, 4 - violationDeduction);
        result.details.push(`${violations.length} architecture violations`);
      }

      const cycles = detector.findCircularDependencies();
      result.metrics.cycles = cycles.length;
      result.cycles = cycles.slice(0, 3);

      if (cycles.length === 0) {
        result.score += 3; // Full points for no cycles
      } else {
        const cycleDeduction = Math.min(3, cycles.length);
        result.score += Math.max(0, 3 - cycleDeduction);
        result.details.push(`${cycles.length} circular dependencies`);
      }
    } else {
      result.details.push('No clear architecture pattern detected');

      // Still check for cycles even without pattern
      const cycles = detector.findCircularDependencies();
      if (cycles.length === 0) {
        result.score = 5; // Partial credit for no cycles
      } else {
        result.metrics.cycles = cycles.length;
        result.cycles = cycles.slice(0, 3);
        result.details.push(`${cycles.length} circular dependencies`);
      }
    }

    result.score = Math.round(result.score);
    return result;
  }

  /**
   * Get documentation component score (10 points max)
   * @returns {Promise<Object>} Documentation score and details
   */
  async getDocumentationScore() {
    const result = {
      score: 0,
      maxScore: 10,
      metrics: {
        hasReadme: false,
        readmeScore: 0,
        apiDocCoverage: 0,
        hasTypeDefs: false
      },
      details: [],
      source: null
    };

    // Check README
    const readmePaths = ['README.md', 'readme.md', 'README', 'README.txt'];
    for (const readmePath of readmePaths) {
      const fullPath = path.join(this.projectPath, readmePath);
      if (fs.existsSync(fullPath)) {
        result.metrics.hasReadme = true;
        result.source = readmePath;

        // Score README completeness
        const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
        let readmeScore = 0;

        if (content.includes('install')) readmeScore += 20;
        if (content.includes('usage') || content.includes('example')) readmeScore += 30;
        if (content.includes('api') || content.includes('reference')) readmeScore += 20;
        if (content.includes('contribut')) readmeScore += 10;
        if (content.includes('license')) readmeScore += 10;
        if (content.length > 500) readmeScore += 10;

        result.metrics.readmeScore = Math.min(100, readmeScore);
        result.score += Math.round((readmeScore / 100) * 4); // Up to 4 points for README
        break;
      }
    }

    if (!result.metrics.hasReadme) {
      result.details.push('No README.md found');
    }

    // Check for TypeScript definitions or JSDoc
    const typeDefPaths = ['tsconfig.json', 'types/', '@types/', 'index.d.ts'];
    for (const typeDefPath of typeDefPaths) {
      const fullPath = path.join(this.projectPath, typeDefPath);
      if (fs.existsSync(fullPath)) {
        result.metrics.hasTypeDefs = true;
        result.score += 2; // 2 points for type definitions
        break;
      }
    }

    // Check for API documentation
    const apiDocPaths = ['docs/', 'documentation/', 'api/', 'API.md', 'doc/'];
    for (const docPath of apiDocPaths) {
      const fullPath = path.join(this.projectPath, docPath);
      if (fs.existsSync(fullPath)) {
        result.metrics.apiDocCoverage = 50; // Assume 50% if docs exist
        result.score += 2; // 2 points for having docs folder
        break;
      }
    }

    // Estimate API doc coverage from inline comments (simplified)
    // In production, would analyze JSDoc/docstring presence
    if (result.score < 10) {
      result.score += 2; // Base points for having a project
    }

    result.score = Math.min(10, result.score);
    return result;
  }

  /**
   * Convert numeric score to letter grade
   * @param {number} score - Score 0-100
   * @returns {string} Letter grade (A, B, C, D, F)
   */
  toGrade(score) {
    for (const [grade, info] of Object.entries(GRADES)) {
      if (score >= info.min && score <= info.max) {
        return grade;
      }
    }
    return 'F';
  }

  /**
   * Calculate trend from historical data
   * @param {number} currentScore - Current overall score
   * @returns {Object} Trend information
   */
  calculateTrend(currentScore) {
    if (this.history.length < 2) {
      return {
        symbol: '=',
        label: 'New',
        change: 0,
        direction: 'stable'
      };
    }

    const previousScore = this.history[this.history.length - 1].overall;
    const change = currentScore - previousScore;

    let symbol, label, direction;

    if (change >= 5) {
      symbol = '++';
      label = 'Strong Improvement';
      direction = 'up';
    } else if (change >= 2) {
      symbol = '+';
      label = 'Improving';
      direction = 'up';
    } else if (change >= -1) {
      symbol = '=';
      label = 'Stable';
      direction = 'stable';
    } else if (change >= -4) {
      symbol = '-';
      label = 'Declining';
      direction = 'down';
    } else {
      symbol = '--';
      label = 'Rapid Decline';
      direction = 'down';
    }

    return {
      symbol,
      label,
      change,
      direction,
      previous: previousScore,
      history: this.history.slice(-10).map(h => h.overall)
    };
  }

  /**
   * Generate prioritized recommendations
   * @param {Object} components - Score components
   * @returns {Array} Prioritized recommendations
   */
  getRecommendations(components) {
    const recommendations = [];

    // Security recommendations (highest priority)
    if (components.security.metrics.critical > 0) {
      recommendations.push({
        priority: 'P0',
        category: 'SECURITY',
        message: `Fix ${components.security.metrics.critical} critical vulnerabilities immediately`,
        action: 'Run npm audit fix or update vulnerable packages',
        impact: '+20 points possible'
      });
    } else if (components.security.metrics.high > 0) {
      recommendations.push({
        priority: 'P1',
        category: 'SECURITY',
        message: `Address ${components.security.metrics.high} high severity vulnerabilities`,
        action: 'Review and update affected dependencies',
        impact: `+${Math.min(components.security.metrics.high * 5, 20)} points possible`
      });
    }

    // Coverage recommendations
    if (components.coverage.score < 20) {
      const gap = 80 - (components.coverage.metrics.branches || 0);
      if (gap > 0) {
        recommendations.push({
          priority: gap > 30 ? 'P1' : 'P2',
          category: 'COVERAGE',
          message: `Branch coverage at ${components.coverage.metrics.branches}%, target is 80%`,
          action: 'Add tests for uncovered branches, focus on error paths',
          impact: `+${Math.round((gap / 80) * 25)} points possible`
        });
      }
    }

    // Complexity recommendations
    if (components.complexity.hotspotFiles?.length > 0) {
      const topHotspot = components.complexity.hotspotFiles[0];
      recommendations.push({
        priority: 'P2',
        category: 'COMPLEXITY',
        message: `${topHotspot.file}:${topHotspot.function} has complexity ${topHotspot.complexity}`,
        action: 'Extract helper functions, simplify conditionals',
        impact: '+3-5 points possible'
      });
    }

    // Architecture recommendations
    if (components.architecture.violations?.length > 0) {
      recommendations.push({
        priority: 'P2',
        category: 'ARCHITECTURE',
        message: `${components.architecture.metrics.violations} layer violations detected`,
        action: 'Refactor imports to follow architecture boundaries',
        impact: '+2-4 points possible'
      });
    }

    if (components.architecture.cycles?.length > 0) {
      recommendations.push({
        priority: 'P2',
        category: 'ARCHITECTURE',
        message: `${components.architecture.metrics.cycles} circular dependencies found`,
        action: 'Break cycles by introducing interfaces or moving shared code',
        impact: '+1-3 points possible'
      });
    }

    // Lint recommendations
    if (components.lint.metrics.errors > 0) {
      recommendations.push({
        priority: 'P1',
        category: 'LINT',
        message: `${components.lint.metrics.errors} lint errors`,
        action: components.lint.metrics.fixable > 0
          ? `Run lint --fix to auto-fix ${components.lint.metrics.fixable} issues`
          : 'Review and fix lint errors manually',
        impact: `+${Math.min(components.lint.metrics.errors * 2, 20)} points possible`
      });
    }

    // Documentation recommendations
    if (!components.documentation.metrics.hasReadme) {
      recommendations.push({
        priority: 'P3',
        category: 'DOCS',
        message: 'No README.md found',
        action: 'Create README with installation, usage, and API sections',
        impact: '+2-4 points possible'
      });
    }

    // Sort by priority
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Load score history from file
   * @returns {Array} Historical scores
   */
  loadHistory() {
    try {
      const historyDir = path.dirname(this.options.historyPath);
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      if (fs.existsSync(this.options.historyPath)) {
        const data = fs.readFileSync(this.options.historyPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      // Ignore history load errors
    }
    return [];
  }

  /**
   * Record score to history
   * @param {number} overall - Overall score
   * @param {Object} components - Component scores
   */
  recordScore(overall, components) {
    const entry = {
      timestamp: new Date().toISOString(),
      overall,
      components: {}
    };

    for (const [name, data] of Object.entries(components)) {
      entry.components[name] = data.score;
    }

    this.history.push(entry);

    // Keep last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    try {
      const historyDir = path.dirname(this.options.historyPath);
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }
      fs.writeFileSync(this.options.historyPath, JSON.stringify(this.history, null, 2));
    } catch (e) {
      // Ignore history save errors
    }
  }

  /**
   * Get historical scores for a time period
   * @param {number} days - Number of days to look back
   * @returns {Array} Historical entries
   */
  getHistory(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.history.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= cutoff;
    });
  }
}

module.exports = {
  QualityScorer,
  GRADES,
  WEIGHTS,
  COVERAGE_SUBWEIGHTS
};

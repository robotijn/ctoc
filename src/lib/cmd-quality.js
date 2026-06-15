/**
 * Quality Command
 * Manages quality configuration, checking, enforcement, and dashboard
 *
 * Usage:
 *   ctoc quality init [--mode <mode>] [--lang <language>]
 *   ctoc quality check
 *   ctoc quality dashboard
 *   ctoc quality report [--format json|html|md]
 *   ctoc quality trend
 */

const fs = require('fs');
const path = require('path');
const { QualityConfig, MODES, LANGUAGES } = require('../lib/quality-config');
const { CoverageChecker } = require('../lib/coverage-checker');
const { ArchitectureDetector } = require('../lib/architecture-detector');
const { QualityScorer } = require('../lib/quality-scorer');
const { QualityReporter, FORMATS } = require('../lib/quality-reporter');
const { DashboardRenderer } = require('../lib/dashboard-renderer');
const qualityState = require('../lib/quality-state');

/**
 * Execute quality command
 * @param {Object} options - Command options
 * @param {string} options.action - Action to perform (init, check, dashboard, report, trend)
 * @param {string} options.mode - Quality mode (strict, strictest, legacy)
 * @param {string} options.lang - Target language
 * @param {string} options.format - Report format (json, html, md)
 * @param {string} options.output - Output file path
 * @param {string} options.projectRoot - Project root directory
 * @returns {Promise<Object>} Command result
 */
async function execute(options) {
  const {
    action = 'check',
    mode = 'strict',
    lang,
    format = 'terminal',
    output,
    projectRoot = process.cwd()
  } = options;

  const config = new QualityConfig(projectRoot);

  switch (action) {
    case 'init':
      return await initQuality(config, mode, lang);

    case 'check':
      return await runQualityCheck(config, mode, projectRoot);

    case 'dashboard':
      return await showDashboard(projectRoot, mode);

    case 'report':
      return await generateReport(projectRoot, mode, format, output);

    case 'trend':
      return await showTrend(projectRoot);

    case 'status':
      return showStatus();

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: init, check, dashboard, report, trend, status`
      };
  }
}

/**
 * Initialize quality configuration for a project
 * @param {QualityConfig} config - Quality config instance
 * @param {string} mode - Quality mode
 * @param {string} lang - Target language (optional, auto-detected if not provided)
 * @returns {Promise<Object>} Initialization result
 */
async function initQuality(config, mode, lang) {
  // Validate mode
  if (!MODES.includes(mode)) {
    return {
      success: false,
      error: `Invalid mode: ${mode}. Valid modes: ${MODES.join(', ')}`
    };
  }

  // Detect or validate language
  let languages = [];
  if (lang) {
    if (!LANGUAGES.includes(lang)) {
      return {
        success: false,
        error: `Invalid language: ${lang}. Valid languages: ${LANGUAGES.join(', ')}`
      };
    }
    languages = [lang];
  } else {
    languages = config.detectLanguages();
    if (languages.length === 0) {
      return {
        success: false,
        error: 'Could not detect project language. Please specify with --lang'
      };
    }
  }

  const results = [];
  for (const language of languages) {
    try {
      const applied = await config.applyConfig(language, mode);
      results.push({
        language,
        mode,
        files: applied.files,
        commands: applied.commands,
        success: true
      });
    } catch (error) {
      results.push({
        language,
        mode,
        success: false,
        error: error.message
      });
    }
  }

  return {
    success: results.every(r => r.success),
    results,
    message: generateInitMessage(results, mode)
  };
}

/**
 * Run comprehensive quality check with scoring
 * @param {QualityConfig} config - Quality config instance
 * @param {string} mode - Quality mode
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Quality check result
 */
async function runQualityCheck(config, mode, projectRoot) {
  const languages = config.detectLanguages();

  if (languages.length === 0) {
    return {
      success: false,
      error: 'Could not detect project language'
    };
  }

  // Use the new QualityScorer for comprehensive scoring
  const scorer = new QualityScorer(projectRoot, { mode });
  const scoreData = await scorer.calculateScore();

  // Also run legacy checks for backward compatibility
  const checks = [];

  for (const language of languages) {
    // Validate configuration
    const validation = config.validate(language, mode);
    checks.push({
      type: 'config',
      language,
      ...validation
    });

    // Check for coverage reports
    const coverageCheck = checkCoverageReport(projectRoot, mode);
    if (coverageCheck) {
      checks.push({
        type: 'coverage',
        language,
        ...coverageCheck
      });
    }
  }

  // Architecture check
  const archDetector = new ArchitectureDetector(projectRoot);
  const pattern = archDetector.detect();
  if (pattern) {
    const violations = archDetector.findViolations(pattern);
    const cycles = archDetector.findCircularDependencies();
    checks.push({
      type: 'architecture',
      pattern,
      violations: violations.length,
      cycles: cycles.length,
      pass: violations.length === 0 && cycles.length === 0
    });
  }

  const allPassed = checks.every(c => c.pass);

  // Generate compact summary message
  const renderer = new DashboardRenderer(scoreData, { projectName: path.basename(projectRoot) });
  const compactSummary = renderer.renderCompact();

  return {
    success: true,
    pass: allPassed && scoreData.overall >= 60,
    score: scoreData.overall,
    grade: scoreData.grade,
    gradeInfo: scoreData.gradeInfo,
    checks,
    components: scoreData.components,
    trend: scoreData.trend,
    recommendations: scoreData.recommendations.slice(0, 3),
    message: generateCheckMessage(checks, scoreData, compactSummary)
  };
}

/**
 * Show interactive quality dashboard
 * @param {string} projectRoot - Project root path
 * @param {string} mode - Quality mode
 * @returns {Promise<Object>} Dashboard result
 */
async function showDashboard(projectRoot, mode) {
  const scorer = new QualityScorer(projectRoot, { mode });
  const scoreData = await scorer.calculateScore();

  const renderer = new DashboardRenderer(scoreData, {
    projectName: path.basename(projectRoot),
    width: process.stdout.columns || 80
  });

  const dashboard = renderer.render();

  return {
    success: true,
    score: scoreData.overall,
    grade: scoreData.grade,
    data: scoreData,
    message: dashboard
  };
}

/**
 * Generate quality report in specified format
 * @param {string} projectRoot - Project root path
 * @param {string} mode - Quality mode
 * @param {string} format - Output format
 * @param {string} output - Output file path (optional)
 * @returns {Promise<Object>} Report result
 */
async function generateReport(projectRoot, mode, format, output) {
  // Validate format
  if (!FORMATS.includes(format) && format !== 'terminal') {
    return {
      success: false,
      error: `Invalid format: ${format}. Valid formats: ${FORMATS.join(', ')}`
    };
  }

  const scorer = new QualityScorer(projectRoot, { mode });
  const scoreData = await scorer.calculateScore();

  const reporter = new QualityReporter(scoreData, {
    projectName: path.basename(projectRoot),
    includeHistory: true,
    includeRecommendations: true
  });

  let report;
  if (format === 'terminal') {
    const renderer = new DashboardRenderer(scoreData, {
      projectName: path.basename(projectRoot)
    });
    report = renderer.render();
  } else {
    report = reporter.generate(format);
  }

  // Save to file if output path specified
  if (output) {
    const outputDir = path.dirname(output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(output, report);

    return {
      success: true,
      format,
      outputPath: output,
      score: scoreData.overall,
      grade: scoreData.grade,
      message: `Report saved to ${output}\nScore: ${scoreData.overall}/100 (${scoreData.grade})`
    };
  }

  return {
    success: true,
    format,
    score: scoreData.overall,
    grade: scoreData.grade,
    message: report
  };
}

/**
 * Show quality score trend over time
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Trend result
 */
async function showTrend(projectRoot) {
  const scorer = new QualityScorer(projectRoot);
  const history = scorer.getHistory(30);

  if (history.length === 0) {
    return {
      success: true,
      message: 'No quality history found. Run "ctoc quality check" to start tracking.'
    };
  }

  const lines = [];
  lines.push('Quality Score Trend (Last 30 days)');
  lines.push('==================================');
  lines.push('');

  // ASCII chart
  const values = history.map(h => h.overall);
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const chartHeight = 10;
  const chartWidth = Math.min(values.length, 40);
  const displayValues = values.slice(-chartWidth);

  for (let row = chartHeight; row >= 0; row--) {
    const threshold = min + (row / chartHeight) * range;
    const label = String(Math.round(threshold)).padStart(3);
    let line = `${label} |`;

    for (const value of displayValues) {
      const normalizedValue = ((value - min) / range) * chartHeight;
      if (Math.round(normalizedValue) >= row) {
        line += '#';
      } else {
        line += ' ';
      }
    }
    lines.push(line);
  }

  lines.push('    +' + '-'.repeat(displayValues.length));
  lines.push('');

  // Statistics
  const latest = values[values.length - 1];
  const oldest = values[0];
  const change = latest - oldest;
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  lines.push(`Current:  ${latest}/100`);
  lines.push(`Average:  ${avg}/100`);
  lines.push(`Change:   ${change >= 0 ? '+' : ''}${change} points`);
  lines.push(`Samples:  ${history.length}`);

  return {
    success: true,
    current: latest,
    average: avg,
    change,
    samples: history.length,
    message: lines.join('\n')
  };
}

/**
 * Check coverage report if it exists
 * @param {string} projectRoot - Project root
 * @param {string} mode - Quality mode
 * @returns {Object|null} Coverage check result or null if no report found
 */
function checkCoverageReport(projectRoot, mode) {
  // Look for common coverage report locations
  const coverageLocations = [
    { path: 'coverage/coverage-summary.json', format: 'istanbul' },
    { path: 'coverage/lcov.info', format: 'lcov' },
    { path: 'coverage.out', format: 'go' },
    { path: 'coverage.xml', format: 'cobertura' },
    { path: 'htmlcov/coverage.json', format: 'coverage-py' },
    { path: 'target/site/jacoco/jacoco.xml', format: 'jacoco' }
  ];

  for (const { path: relativePath, format } of coverageLocations) {
    const fullPath = path.join(projectRoot, relativePath);
    if (fs.existsSync(fullPath)) {
      try {
        const checker = new CoverageChecker(mode);
        const coverage = checker.parseCoverage(format, fullPath);
        const result = checker.check(coverage);
        return {
          format,
          file: relativePath,
          ...result
        };
      } catch (error) {
        return {
          format,
          file: relativePath,
          pass: false,
          error: error.message
        };
      }
    }
  }

  return null;
}

/**
 * Generate init command message
 * @param {Array} results - Init results
 * @param {string} mode - Quality mode
 * @returns {string} Formatted message
 */
function generateInitMessage(results, mode) {
  const lines = [];
  lines.push(`Quality configuration initialized (mode: ${mode})`);
  lines.push('');

  for (const result of results) {
    if (result.success) {
      lines.push(`[${result.language}] Configured successfully`);
      if (result.files.length > 0) {
        lines.push(`  Files created: ${result.files.join(', ')}`);
      }
      if (result.commands.length > 0) {
        lines.push('  Install dependencies:');
        result.commands.forEach(cmd => lines.push(`    ${cmd}`));
      }
    } else {
      lines.push(`[${result.language}] Failed: ${result.error}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate check command message
 * @param {Array} checks - Check results
 * @param {Object} scoreData - Score data from scorer
 * @param {string} compactSummary - Compact summary line
 * @returns {string} Formatted message
 */
function generateCheckMessage(checks, scoreData, compactSummary) {
  const lines = [];
  lines.push('Quality Check Results');
  lines.push('=====================');
  lines.push('');

  // Show compact score summary first
  lines.push(compactSummary);
  lines.push('');

  // Detailed checks
  for (const check of checks) {
    const status = check.pass ? 'PASS' : 'FAIL';
    const icon = check.pass ? '+' : '-';

    switch (check.type) {
      case 'config':
        lines.push(`${icon} [${check.language}] Configuration: ${status}`);
        if (!check.pass && check.issues) {
          check.issues.forEach(i => lines.push(`    - ${i.message}`));
        }
        break;

      case 'coverage':
        lines.push(`${icon} Coverage: ${status}`);
        if (check.coverage) {
          lines.push(`    Lines: ${check.coverage.lines}%`);
          lines.push(`    Branches: ${check.coverage.branches}%`);
          lines.push(`    Functions: ${check.coverage.functions}%`);
        }
        if (!check.pass && check.failures) {
          check.failures.forEach(f => lines.push(`    - ${f}`));
        }
        break;

      case 'architecture':
        lines.push(`${icon} Architecture (${check.pattern}): ${status}`);
        if (check.violations > 0) {
          lines.push(`    - ${check.violations} violation(s)`);
        }
        if (check.cycles > 0) {
          lines.push(`    - ${check.cycles} circular dependency(ies)`);
        }
        break;
    }
  }

  // Add top recommendations
  if (scoreData.recommendations && scoreData.recommendations.length > 0) {
    lines.push('');
    lines.push('Top Recommendations:');
    for (const rec of scoreData.recommendations.slice(0, 3)) {
      lines.push(`  [${rec.priority}] ${rec.category}: ${rec.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Show background quality agent status
 * Reads from .ctoc/quality-state/status.json
 * @returns {Object} Status result
 */
function showStatus() {
  const status = qualityState.getStatus();

  const lines = [];
  lines.push('Quality Gate Status');
  lines.push('===================');
  lines.push(`Overall: ${status.overallStatus}`);
  lines.push(`Git HEAD: ${status.gitHead || 'unknown'}`);
  lines.push(`Last run: ${status.lastRun?.completedAt || 'never'}`);
  lines.push(`Duration: ${status.lastRun?.duration ? (status.lastRun.duration / 1000).toFixed(1) + 's' : '-'}`);
  lines.push(`Triggered by: ${status.lastRun?.triggeredBy || '-'}`);
  lines.push('');

  // Tier statuses
  if (status.tiers) {
    lines.push('Tiers:');
    for (const [tier, data] of Object.entries(status.tiers)) {
      const tierStatus = data.status || 'pending';
      const checkedAt = data.checkedAt || 'never';
      lines.push(`  ${tier}: ${tierStatus} (${checkedAt})`);
    }
    lines.push('');
  }

  // Summary details
  if (status.summary) {
    lines.push('Summary:');
    if (status.summary.tests) {
      const t = status.summary.tests;
      lines.push(`  Tests: ${t.passCount || t.passed || 0} passed, ${t.failed || 0} failed, ${t.skipped || 0} skipped`);
    }
    if (status.summary.lint) {
      lines.push(`  Lint: ${status.summary.lint.errors || 0} errors, ${status.summary.lint.warnings || 0} warnings`);
    }
    if (status.summary.security) {
      const s = status.summary.security;
      lines.push(`  Security: ${s.critical || 0} critical, ${s.high || 0} high, ${s.medium || 0} medium`);
    }
    if (status.summary.coverage) {
      lines.push(`  Coverage: ${status.summary.coverage}%`);
    }
  }

  return { success: true, message: lines.join('\n') };
}

module.exports = {
  execute,
  initQuality,
  runQualityCheck,
  showDashboard,
  showStatus,
  generateReport,
  showTrend,
  // Legacy exports for backward compatibility
  checkQuality: runQualityCheck,
  generateDashboard: showDashboard
};

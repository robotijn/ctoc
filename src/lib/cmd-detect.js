/**
 * Detect Command
 * Auto-detection and mode suggestion for projects
 *
 * Usage:
 *   ctoc detect           - Full analysis and mode suggestion
 *   ctoc detect quality   - Quality score only
 *   ctoc detect mode      - Mode suggestion only
 *   ctoc detect upgrade   - Generate upgrade roadmap
 *   ctoc detect fix       - Show and optionally apply auto-fixes
 */

const path = require('path');
const { ProjectAnalyzer } = require('../lib/project-analyzer');
const { ModeSuggester } = require('../lib/mode-suggester');
const { UpgradePlanner } = require('../lib/upgrade-planner');
const { AutoFixer, RISK_LEVELS } = require('../lib/auto-fixer');

/**
 * Execute detect command
 * @param {Object} options - Command options
 * @param {string} options.action - Action to perform (default: full)
 * @param {string} options.projectRoot - Project root directory
 * @param {boolean} options.json - Output as JSON
 * @param {boolean} options.verbose - Verbose output
 * @param {string} options.plan - Generate upgrade plan
 * @param {number} options.teamSize - Team size for planning
 * @param {boolean} options.fix - Apply fixes
 * @param {boolean} options.dryRun - Dry run for fixes
 * @param {string} options.riskLevel - Max risk level for fixes
 * @returns {Promise<Object>} Command result
 */
async function execute(options) {
  const {
    action = 'full',
    projectRoot = process.cwd(),
    json = false,
    verbose = false,
    plan = false,
    teamSize = 1,
    fix = false,
    dryRun = false,
    riskLevel = 'low'
  } = options;

  try {
    switch (action) {
      case 'quality':
        return await detectQuality(projectRoot, { json, verbose });

      case 'mode':
        return await detectMode(projectRoot, { json, verbose });

      case 'upgrade':
        return await detectUpgrade(projectRoot, { json, verbose, plan, teamSize });

      case 'fix':
        return await detectFix(projectRoot, { json, verbose, fix, dryRun, riskLevel });

      case 'full':
      default:
        return await detectFull(projectRoot, { json, verbose });
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Full detection and analysis
 * @param {string} projectRoot - Project root
 * @param {Object} options - Options
 * @returns {Promise<Object>} Full analysis
 */
async function detectFull(projectRoot, options = {}) {
  const analyzer = new ProjectAnalyzer(projectRoot);
  const analysis = await analyzer.analyze();

  const suggester = new ModeSuggester(analysis);
  const suggestion = suggester.suggest();

  if (options.json) {
    return {
      success: true,
      analysis,
      suggestion
    };
  }

  const message = formatFullReport(analysis, suggestion);

  return {
    success: true,
    analysis,
    suggestion,
    message
  };
}

/**
 * Quality score detection only
 * @param {string} projectRoot - Project root
 * @param {Object} options - Options
 * @returns {Promise<Object>} Quality analysis
 */
async function detectQuality(projectRoot, options = {}) {
  const analyzer = new ProjectAnalyzer(projectRoot);
  const analysis = await analyzer.analyze();

  const quality = analysis.currentQuality;
  const debt = analysis.technicalDebt;

  if (options.json) {
    return {
      success: true,
      quality,
      debt
    };
  }

  const message = formatQualityReport(quality, debt, analysis);

  return {
    success: true,
    quality,
    debt,
    message
  };
}

/**
 * Mode suggestion only
 * @param {string} projectRoot - Project root
 * @param {Object} options - Options
 * @returns {Promise<Object>} Mode suggestion
 */
async function detectMode(projectRoot, options = {}) {
  const analyzer = new ProjectAnalyzer(projectRoot);
  const analysis = await analyzer.analyze();

  const suggester = new ModeSuggester(analysis);
  const suggestion = suggester.suggest();

  if (options.json) {
    return {
      success: true,
      suggestion
    };
  }

  const message = formatModeReport(suggestion);

  return {
    success: true,
    suggestion,
    message
  };
}

/**
 * Upgrade roadmap generation
 * @param {string} projectRoot - Project root
 * @param {Object} options - Options
 * @returns {Promise<Object>} Upgrade plan
 */
async function detectUpgrade(projectRoot, options = {}) {
  const analyzer = new ProjectAnalyzer(projectRoot);
  const analysis = await analyzer.analyze();

  const suggester = new ModeSuggester(analysis);
  const suggestion = suggester.suggest();

  const planner = new UpgradePlanner(analysis, suggestion);
  const plan = planner.generatePlan({
    teamSize: options.teamSize || 1,
    dedicatedPercent: 20
  });

  if (options.json) {
    return {
      success: true,
      plan
    };
  }

  const message = formatUpgradeReport(plan, suggestion);

  return {
    success: true,
    plan,
    message
  };
}

/**
 * Auto-fix detection and application
 * @param {string} projectRoot - Project root
 * @param {Object} options - Options
 * @returns {Promise<Object>} Fix results
 */
async function detectFix(projectRoot, options = {}) {
  const fixer = new AutoFixer(projectRoot);
  const available = fixer.detectAvailableFixes();

  if (!options.fix) {
    // Just show available fixes
    if (options.json) {
      return {
        success: true,
        availableFixes: available
      };
    }

    const message = formatFixReport(available);
    return {
      success: true,
      availableFixes: available,
      message
    };
  }

  // Apply fixes
  const maxRisk = options.riskLevel || RISK_LEVELS.low;
  const results = await fixer.runFixesUpToRisk(maxRisk, {
    dryRun: options.dryRun
  });

  if (options.json) {
    return {
      success: true,
      results
    };
  }

  const message = fixer.generateReport(results);
  return {
    success: true,
    results,
    message
  };
}

// ============ Formatters ============

/**
 * Format full analysis report
 * @param {Object} analysis - Project analysis
 * @param {Object} suggestion - Mode suggestion
 * @returns {string} Formatted report
 */
function formatFullReport(analysis, suggestion) {
  const lines = [];

  lines.push('=== Project Analysis ===');
  lines.push('');
  lines.push(`Project: ${path.basename(analysis.project)}`);
  lines.push(`Analysis Time: ${analysis.analysisTimeMs}ms`);
  lines.push('');

  // Languages and Frameworks
  lines.push('Stack:');
  lines.push(`  Languages: ${analysis.languages?.all?.join(', ') || 'none detected'}`);
  lines.push(`  Frameworks: ${analysis.frameworks?.all?.join(', ') || 'none detected'}`);
  lines.push(`  Primary: ${analysis.languages?.primary || 'unknown'} / ${analysis.frameworks?.primary || 'none'}`);
  lines.push('');

  // Size
  lines.push('Codebase:');
  lines.push(`  Size: ${analysis.codebaseSize?.category || 'unknown'} (${analysis.codebaseSize?.totalLines || 0} lines)`);
  lines.push(`  Source Files: ${analysis.codebaseSize?.sourceFiles || 0}`);
  lines.push(`  Test Files: ${analysis.codebaseSize?.testFiles || 0}`);
  lines.push('');

  // Quality Score
  const quality = analysis.currentQuality;
  lines.push('Quality Score:');
  lines.push(`  Overall: ${quality?.overall || 0}/100`);
  lines.push('');

  // Score bar
  const filled = Math.round((quality?.overall || 0) / 5);
  const empty = 20 - filled;
  const bar = '  [' + '='.repeat(filled) + '-'.repeat(empty) + ']';
  lines.push(bar);
  lines.push('');

  // Quality breakdown
  lines.push('Quality Breakdown:');
  const breakdown = quality?.breakdown || {};
  const checks = [
    ['Testing', breakdown.testing],
    ['Coverage', breakdown.coverage],
    ['Linting', breakdown.linting],
    ['Formatting', breakdown.formatting],
    ['Type Checking', breakdown.typeChecking],
    ['CI/CD', breakdown.ci],
    ['Security', breakdown.security],
    ['Architecture', breakdown.architecture],
    ['Documentation', breakdown.documentation]
  ];

  for (const [name, value] of checks) {
    const icon = value ? '+' : '-';
    lines.push(`  ${icon} ${name}`);
  }
  lines.push('');

  // Technical Debt
  const debt = analysis.technicalDebt;
  lines.push(`Technical Debt: ${debt?.level || 'unknown'} (score: ${debt?.score || 0})`);
  if (debt?.factors?.length > 0) {
    for (const factor of debt.factors.slice(0, 3)) {
      lines.push(`  - ${factor.factor} (${factor.impact} impact)`);
    }
  }
  lines.push('');

  // Mode Suggestion
  lines.push('=== Mode Suggestion ===');
  lines.push('');
  lines.push(`Recommended: ${suggestion.recommended.toUpperCase()} (confidence: ${suggestion.confidence})`);
  lines.push(`Alternative: ${suggestion.alternative}`);
  lines.push('');
  lines.push(`Reason: ${suggestion.reason}`);
  lines.push('');

  if (suggestion.evidence?.length > 0) {
    lines.push('Evidence:');
    for (const e of suggestion.evidence.slice(0, 5)) {
      lines.push(`  - ${e}`);
    }
    lines.push('');
  }

  // Effort
  lines.push(`Effort to achieve: ${suggestion.effort}`);
  lines.push('');

  // Quick Wins
  if (suggestion.quickWins?.length > 0) {
    lines.push('Quick Wins:');
    for (const win of suggestion.quickWins.slice(0, 5)) {
      lines.push(`  - ${win}`);
    }
    lines.push('');
  }

  // Next Steps
  lines.push('Next Steps:');
  lines.push(`  1. Run: ctoc quality init --mode ${suggestion.recommended}`);
  if (suggestion.recommended !== 'strictest') {
    lines.push(`  2. Run: ctoc detect upgrade --plan  (for upgrade roadmap)`);
  }
  lines.push(`  3. Run: ctoc detect fix             (for auto-fixes)`);

  return lines.join('\n');
}

/**
 * Format quality report
 * @param {Object} quality - Quality data
 * @param {Object} debt - Technical debt data
 * @param {Object} analysis - Full analysis
 * @returns {string} Formatted report
 */
function formatQualityReport(quality, debt, analysis) {
  const lines = [];

  lines.push('=== Quality Score ===');
  lines.push('');
  lines.push(`Overall: ${quality?.overall || 0}/100`);
  lines.push('');

  // Score bar
  const filled = Math.round((quality?.overall || 0) / 5);
  const empty = 20 - filled;
  const bar = '[' + '='.repeat(filled) + '-'.repeat(empty) + ']';
  lines.push(bar);
  lines.push('');

  // Detailed scores
  if (quality?.scores) {
    lines.push('Component Scores:');
    const components = [
      ['Testing', quality.scores.hasTests, 15],
      ['Coverage', quality.scores.hasCoverage, 10],
      ['Coverage Threshold', quality.scores.meetsCoverageThreshold, 15],
      ['Linter', quality.scores.hasLinter, 10],
      ['Formatter', quality.scores.hasFormatter, 5],
      ['Type Checker', quality.scores.hasTypeChecker, 10],
      ['CI/CD', quality.scores.hasCI, 10],
      ['Security', quality.scores.hasSecurityScanning, 5],
      ['Architecture', quality.scores.hasArchitecture, 5],
      ['Documentation', quality.scores.hasDocumentation, 5]
    ];

    for (const [name, score, max] of components) {
      const pct = max > 0 ? Math.round((score / max) * 100) : 0;
      const bar = makeProgressBar(pct, 10);
      lines.push(`  ${name.padEnd(20)} ${bar} ${score}/${max}`);
    }
    lines.push('');
  }

  // Coverage detail
  if (quality.scores?.actualCoverage !== undefined) {
    lines.push(`Actual Coverage: ${quality.scores.actualCoverage}%`);
    lines.push('');
  }

  // Technical Debt
  lines.push('=== Technical Debt ===');
  lines.push('');
  lines.push(`Level: ${debt?.level || 'unknown'}`);
  lines.push(`Score: ${debt?.score || 0}/100`);
  lines.push('');

  if (debt?.factors?.length > 0) {
    lines.push('Debt Factors:');
    for (const factor of debt.factors) {
      const impact = factor.impact === 'high' ? '!!!' :
                    factor.impact === 'medium' ? '!!' : '!';
      lines.push(`  ${impact} ${factor.factor} (+${factor.points})`);
    }
    lines.push('');
  }

  lines.push(`Recommendation: ${debt?.recommendation || 'N/A'}`);

  return lines.join('\n');
}

/**
 * Format mode suggestion report
 * @param {Object} suggestion - Mode suggestion
 * @returns {string} Formatted report
 */
function formatModeReport(suggestion) {
  const lines = [];

  lines.push('=== Mode Suggestion ===');
  lines.push('');
  lines.push(`Recommended Mode: ${suggestion.recommended.toUpperCase()}`);
  lines.push(`Confidence: ${suggestion.confidence}`);
  lines.push(`Alternative: ${suggestion.alternative}`);
  lines.push('');

  lines.push('Scores:');
  lines.push(`  Strict: ${suggestion.scores.strict}%`);
  lines.push(`  Strictest: ${suggestion.scores.strictest}%`);
  lines.push(`  Legacy: ${suggestion.scores.legacy}%`);
  lines.push('');

  lines.push(`Reason: ${suggestion.reason}`);
  lines.push('');

  if (suggestion.evidence?.length > 0) {
    lines.push('Evidence:');
    for (const e of suggestion.evidence) {
      lines.push(`  - ${e}`);
    }
    lines.push('');
  }

  lines.push(`Effort: ${suggestion.effort}`);
  lines.push('');

  // Prioritized Fixes
  if (suggestion.prioritizedFixes?.length > 0) {
    lines.push('Prioritized Fixes:');
    for (const fix of suggestion.prioritizedFixes.slice(0, 5)) {
      const impact = fix.impact === 'critical' ? '!!!' :
                    fix.impact === 'high' ? '!!' : '!';
      lines.push(`  ${fix.priority}. [${fix.category}] ${fix.fix} ${impact}`);
      lines.push(`     Effort: ${fix.effort}`);
    }
    lines.push('');
  }

  lines.push('To apply this mode:');
  lines.push(`  ctoc quality init --mode ${suggestion.recommended}`);

  return lines.join('\n');
}

/**
 * Format upgrade report
 * @param {Object} plan - Upgrade plan
 * @param {Object} suggestion - Mode suggestion
 * @returns {string} Formatted report
 */
function formatUpgradeReport(plan, suggestion) {
  const lines = [];

  lines.push('=== Upgrade Roadmap ===');
  lines.push('');
  lines.push(`From: ${plan.fromMode}`);
  lines.push(`To: ${plan.toMode}`);
  lines.push(`Project Size: ${plan.projectSize}`);
  lines.push(`Team Size: ${plan.teamSize} developer(s)`);
  lines.push('');

  // Estimate
  const est = plan.totalEstimate;
  lines.push(`Estimated Duration: ${est.range.optimistic}-${est.range.pessimistic} weeks`);
  lines.push(`Confidence: ${est.confidence}`);
  lines.push('');

  // Quick Wins
  if (plan.quickWins?.length > 0) {
    lines.push('=== Quick Wins (Do First) ===');
    for (const win of plan.quickWins) {
      lines.push(`  - ${win.action} (${win.effort})`);
      if (win.command) {
        lines.push(`    Command: ${win.command}`);
      }
    }
    lines.push('');
  }

  // Phases
  lines.push('=== Phases ===');
  lines.push('');

  for (const phase of plan.phases) {
    lines.push(`Phase: ${phase.name} (~${phase.estimatedWeeks} weeks)`);
    lines.push(`Description: ${phase.description}`);
    lines.push('');
    lines.push('Tasks:');
    for (const task of phase.tasks) {
      const blocking = task.blocking ? ' [BLOCKING]' : '';
      lines.push(`  - ${task.task}${blocking}`);
      if (task.command) {
        lines.push(`    $ ${task.command}`);
      }
    }
    lines.push('');
    lines.push('Exit Criteria:');
    for (const criterion of phase.exitCriteria) {
      lines.push(`  [ ] ${criterion}`);
    }
    lines.push('');
  }

  // Blockers
  if (plan.blockers?.length > 0) {
    lines.push('=== Potential Blockers ===');
    for (const blocker of plan.blockers) {
      lines.push(`  - ${blocker.name} (${blocker.likelihood} likelihood)`);
      lines.push(`    Phases: ${blocker.applicablePhases.join(', ')}`);
      lines.push('    Mitigation:');
      for (const m of blocker.mitigation.slice(0, 2)) {
        lines.push(`      - ${m}`);
      }
    }
    lines.push('');
  }

  // Success Criteria
  lines.push('=== Success Criteria ===');
  const criteria = plan.successCriteria;
  if (criteria.coverage) {
    lines.push(`  Coverage: >= ${criteria.coverage.min}%`);
  }
  if (criteria.lintErrors) {
    lines.push(`  Lint Errors: <= ${criteria.lintErrors.max}`);
  }
  if (criteria.complexity) {
    lines.push(`  Cyclomatic Complexity: <= ${criteria.complexity.cyclomatic}`);
  }

  return lines.join('\n');
}

/**
 * Format fix availability report
 * @param {Array} available - Available fixes
 * @returns {string} Formatted report
 */
function formatFixReport(available) {
  const lines = [];

  lines.push('=== Available Auto-Fixes ===');
  lines.push('');

  if (available.length === 0) {
    lines.push('No auto-fixes available for this project.');
    lines.push('');
    lines.push('This could mean:');
    lines.push('  - Project is already well-configured');
    lines.push('  - Language/framework not supported for auto-fix');
    return lines.join('\n');
  }

  // Group by risk level
  const byRisk = {
    safe: [],
    low: [],
    medium: [],
    high: []
  };

  for (const fix of available) {
    byRisk[fix.risk].push(fix);
  }

  for (const [risk, fixes] of Object.entries(byRisk)) {
    if (fixes.length === 0) continue;

    const riskLabel = risk.toUpperCase();
    lines.push(`[${riskLabel} RISK]`);
    for (const fix of fixes) {
      lines.push(`  - ${fix.name}`);
      lines.push(`    ${fix.description}`);
    }
    lines.push('');
  }

  lines.push('To apply fixes:');
  lines.push('  ctoc detect fix --fix              # Apply safe+low risk fixes');
  lines.push('  ctoc detect fix --fix --dry-run    # Preview changes');
  lines.push('  ctoc detect fix --fix --risk medium  # Include medium risk');

  return lines.join('\n');
}

/**
 * Make a simple progress bar
 * @param {number} percent - Percentage
 * @param {number} width - Bar width
 * @returns {string} Progress bar
 */
function makeProgressBar(percent, width) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '[' + '='.repeat(filled) + '-'.repeat(empty) + ']';
}

module.exports = {
  execute,
  detectFull,
  detectQuality,
  detectMode,
  detectUpgrade,
  detectFix
};

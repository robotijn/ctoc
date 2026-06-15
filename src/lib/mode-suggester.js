/**
 * Mode Suggester
 * Suggests the appropriate quality mode based on project analysis
 *
 * RED/BLUE Team Refinements Applied:
 * R1: Initial suggestion logic too simplistic
 * B1: Added multi-factor scoring with weighted criteria
 * R2: New projects without tests suggested legacy incorrectly
 * B2: Added project age consideration for new projects
 * R3: High-stakes domains not detected reliably
 * B3: Added domain keyword analysis with confidence scoring
 * R4: Alternative mode suggestions not actionable
 * B4: Added detailed reasoning and effort estimates
 * R5: Upgrade path generation too generic
 * B5: Added specific, prioritized upgrade steps
 * R6: Edge case: empty project crashes
 * B6: Added defensive checks for minimal projects
 * R7: Suggestion reasoning unclear to users
 * B7: Added clear explanations with evidence
 * R8: Strictest suggested too aggressively
 * B8: Added higher confidence threshold for strictest
 * R9: Legacy mode not suggested for old unmaintained projects
 * B9: Added project activity/maintenance analysis
 * R10: Missing confidence levels in suggestions
 * B10: Added confidence scoring to all suggestions
 */

/**
 * Scoring weights for mode suggestion
 * @type {Object}
 */
const SUGGESTION_WEIGHTS = {
  // Factors that push toward STRICT
  qualityScore: 0.25,          // Current quality score
  hasTests: 0.15,              // Has testing infrastructure
  hasCoverage: 0.10,           // Has coverage reporting
  hasLinter: 0.10,             // Has linter configured
  hasCI: 0.10,                 // Has CI/CD pipeline
  isNewProject: 0.15,          // New project (< 6 months)

  // Factors that push toward STRICTEST
  highStakesDomain: 0.30,      // Financial/healthcare/security
  meetsStrict: 0.25,           // Already meets strict requirements
  hasArchEnforcement: 0.15,    // Has architecture enforcement
  hasSecurityTools: 0.15,      // Has security scanning
  teamSize: 0.15,              // Larger teams benefit from stricter rules

  // Factors that push toward LEGACY
  lowCoverage: 0.25,           // Coverage < 50%
  manyLintErrors: 0.20,        // Many existing lint issues
  isAbandoned: 0.15,           // No recent activity
  largeLegacyCodebase: 0.20,   // Large codebase without quality tools
  noTestInfra: 0.20            // No testing infrastructure
};

/**
 * Thresholds for mode decisions
 * @type {Object}
 */
const THRESHOLDS = {
  strictest: {
    qualityScore: 85,           // Must have high quality score
    domainConfidence: 5,        // Domain keyword matches
    coverageRequired: 80        // Must already have good coverage
  },
  strict: {
    qualityScore: 50,           // Moderate quality score
    newProjectMonths: 6,        // Project age for "new"
    minCoverage: 30             // Some coverage exists
  },
  legacy: {
    qualityScore: 50,           // Below this suggests legacy
    maxCoverage: 50,            // Coverage below this
    abandonedDays: 180          // Days since last commit
  }
};

/**
 * Mode Suggester class
 * Provides intelligent mode suggestions based on project analysis
 */
class ModeSuggester {
  /**
   * Create a ModeSuggester instance
   * @param {Object} analysis - Analysis from ProjectAnalyzer
   */
  constructor(analysis) {
    this.analysis = analysis;
  }

  /**
   * Generate mode suggestion
   * @returns {Object} Mode suggestion with reasoning
   */
  suggest() {
    const analysis = this.analysis;

    // Handle minimal/empty projects
    if (this.isMinimalProject()) {
      return this.suggestForMinimalProject();
    }

    // Calculate scores for each mode
    const scores = {
      strict: this.calculateStrictScore(),
      strictest: this.calculateStrictestScore(),
      legacy: this.calculateLegacyScore()
    };

    // Determine recommended mode
    const { recommended, confidence, alternativeMode } = this.determineRecommendedMode(scores);

    // Generate detailed reasoning
    const reasoning = this.generateReasoning(recommended, scores);

    // Generate upgrade path if not on recommended mode
    const upgradePath = recommended === 'legacy'
      ? this.generateUpgradePath(analysis)
      : null;

    // Calculate effort
    const effort = this.calculateEffort(recommended, analysis);

    // Generate prioritized fixes if needed
    const prioritizedFixes = recommended === 'legacy' || effort === 'high'
      ? this.getPrioritizedFixes(analysis)
      : [];

    return {
      recommended,
      confidence,
      alternative: alternativeMode,
      scores,
      reason: reasoning.summary,
      evidence: reasoning.evidence,
      effort,
      upgradePath,
      prioritizedFixes,
      quickWins: this.getQuickWins(analysis)
    };
  }

  /**
   * Check if project is minimal (empty or nearly empty)
   * @returns {boolean}
   */
  isMinimalProject() {
    const size = this.analysis.codebaseSize;
    return !size || size.totalFiles < 5 || size.totalLines < 100;
  }

  /**
   * Suggestion for minimal projects
   * @returns {Object} Suggestion
   */
  suggestForMinimalProject() {
    return {
      recommended: 'strict',
      confidence: 'high',
      alternative: 'strictest',
      scores: { strict: 100, strictest: 0, legacy: 0 },
      reason: 'New or minimal project - start with strict mode to establish good practices',
      evidence: ['Project has minimal code', 'Fresh start allows clean quality setup'],
      effort: 'low',
      upgradePath: null,
      prioritizedFixes: [],
      quickWins: [
        'Set up linter configuration',
        'Set up test framework',
        'Configure CI pipeline'
      ]
    };
  }

  /**
   * Calculate strict mode score
   * @returns {number} Score 0-100
   */
  calculateStrictScore() {
    const a = this.analysis;
    let score = 0;
    let maxScore = 0;

    // Quality score contribution
    const qualityContrib = (a.currentQuality?.overall || 0) * SUGGESTION_WEIGHTS.qualityScore;
    score += qualityContrib;
    maxScore += 100 * SUGGESTION_WEIGHTS.qualityScore;

    // Has tests
    if (a.testingSetup?.hasTests) {
      score += 100 * SUGGESTION_WEIGHTS.hasTests;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.hasTests;

    // Has coverage
    if (a.testingSetup?.hasCoverage || a.currentQuality?.breakdown?.coverage) {
      score += 100 * SUGGESTION_WEIGHTS.hasCoverage;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.hasCoverage;

    // Has linter
    if (a.lintingSetup?.hasLinter) {
      score += 100 * SUGGESTION_WEIGHTS.hasLinter;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.hasLinter;

    // Has CI
    if (a.currentQuality?.breakdown?.ci) {
      score += 100 * SUGGESTION_WEIGHTS.hasCI;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.hasCI;

    // New project bonus
    if (a.projectAge?.isNewProject) {
      score += 100 * SUGGESTION_WEIGHTS.isNewProject;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.isNewProject;

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Calculate strictest mode score
   * @returns {number} Score 0-100
   */
  calculateStrictestScore() {
    const a = this.analysis;
    let score = 0;
    let maxScore = 0;

    // High-stakes domain
    if (a.domainAnalysis?.suggestsStrictest) {
      score += 100 * SUGGESTION_WEIGHTS.highStakesDomain;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.highStakesDomain;

    // Already meets strict
    const qualityScore = a.currentQuality?.overall || 0;
    if (qualityScore >= THRESHOLDS.strictest.qualityScore) {
      score += 100 * SUGGESTION_WEIGHTS.meetsStrict;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.meetsStrict;

    // Has architecture enforcement
    if (a.architecturePattern?.pattern && a.architecturePattern?.violations === 0) {
      score += 100 * SUGGESTION_WEIGHTS.hasArchEnforcement;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.hasArchEnforcement;

    // Has security tools
    if (a.securityPosture?.hasSecurityTools) {
      score += 100 * SUGGESTION_WEIGHTS.hasSecurityTools;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.hasSecurityTools;

    // Coverage meets strictest threshold
    const coverage = a.currentQuality?.scores?.actualCoverage || 0;
    if (coverage >= 80) {
      score += 50 * SUGGESTION_WEIGHTS.meetsStrict;
    }

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Calculate legacy mode score
   * @returns {number} Score 0-100
   */
  calculateLegacyScore() {
    const a = this.analysis;
    let score = 0;
    let maxScore = 0;

    // Low coverage
    const coverage = a.currentQuality?.scores?.actualCoverage || 0;
    if (coverage < THRESHOLDS.legacy.maxCoverage) {
      score += 100 * SUGGESTION_WEIGHTS.lowCoverage;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.lowCoverage;

    // No test infrastructure
    if (!a.testingSetup?.hasTests) {
      score += 100 * SUGGESTION_WEIGHTS.noTestInfra;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.noTestInfra;

    // Abandoned/dormant project
    if (a.projectAge?.activity === 'abandoned' || a.projectAge?.activity === 'dormant') {
      score += 100 * SUGGESTION_WEIGHTS.isAbandoned;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.isAbandoned;

    // Large codebase without quality tools
    const isLarge = a.codebaseSize?.category === 'large' || a.codebaseSize?.category === 'enterprise';
    const lowQuality = (a.currentQuality?.overall || 0) < 40;
    if (isLarge && lowQuality) {
      score += 100 * SUGGESTION_WEIGHTS.largeLegacyCodebase;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.largeLegacyCodebase;

    // Many lint issues (heuristic: no linter = likely many issues)
    if (!a.lintingSetup?.hasLinter && a.codebaseSize?.sourceFiles > 20) {
      score += 100 * SUGGESTION_WEIGHTS.manyLintErrors;
    }
    maxScore += 100 * SUGGESTION_WEIGHTS.manyLintErrors;

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Determine recommended mode from scores
   * @param {Object} scores - Mode scores
   * @returns {Object} Recommended mode and confidence
   */
  determineRecommendedMode(scores) {
    const a = this.analysis;

    // Special case: Domain strongly suggests strictest
    if (a.domainAnalysis?.suggestsStrictest && scores.strict >= 60) {
      return {
        recommended: 'strictest',
        confidence: 'high',
        alternativeMode: 'strict'
      };
    }

    // Special case: Already meets strictest criteria
    if (scores.strictest >= 70 && (a.currentQuality?.overall || 0) >= 85) {
      return {
        recommended: 'strictest',
        confidence: 'high',
        alternativeMode: 'strict'
      };
    }

    // Legacy has highest score
    if (scores.legacy > scores.strict && scores.legacy >= 50) {
      return {
        recommended: 'legacy',
        confidence: scores.legacy >= 70 ? 'high' : 'medium',
        alternativeMode: 'strict'
      };
    }

    // Strict is the safe default for most projects
    if (scores.strict >= 40 || a.projectAge?.isNewProject) {
      const confidence = scores.strict >= 70 ? 'high' :
                        scores.strict >= 50 ? 'medium' : 'low';

      const alternativeMode = scores.strictest >= 40 ? 'strictest' : 'legacy';

      return {
        recommended: 'strict',
        confidence,
        alternativeMode
      };
    }

    // Fallback to legacy for older projects with low scores
    return {
      recommended: 'legacy',
      confidence: 'medium',
      alternativeMode: 'strict'
    };
  }

  /**
   * Generate reasoning for recommendation
   * @param {string} mode - Recommended mode
   * @param {Object} scores - Mode scores
   * @returns {Object} Reasoning with summary and evidence
   */
  generateReasoning(mode, scores) {
    const a = this.analysis;
    const evidence = [];

    if (mode === 'strictest') {
      if (a.domainAnalysis?.suggestsStrictest) {
        evidence.push(`Project appears to be in ${a.domainAnalysis.dominantDomain} domain (high stakes)`);
      }
      if ((a.currentQuality?.overall || 0) >= 85) {
        evidence.push(`Quality score ${a.currentQuality.overall}% meets strictest prerequisites`);
      }
      if (a.securityPosture?.hasSecurityTools) {
        evidence.push('Security tooling already in place');
      }
      if (a.architecturePattern?.pattern) {
        evidence.push(`${a.architecturePattern.pattern} architecture detected`);
      }

      return {
        summary: 'Project is in a high-stakes domain or already meets strict standards',
        evidence
      };
    }

    if (mode === 'strict') {
      if (a.projectAge?.isNewProject) {
        evidence.push(`Project is relatively new (${a.projectAge.ageMonths || 0} months old)`);
      }
      if (a.testingSetup?.hasTests) {
        evidence.push('Testing infrastructure exists');
      }
      if (a.lintingSetup?.hasLinter) {
        evidence.push(`Linter configured (${a.lintingSetup.linters.join(', ')})`);
      }
      if (a.currentQuality?.breakdown?.ci) {
        evidence.push('CI/CD pipeline in place');
      }
      if ((a.currentQuality?.overall || 0) >= 50) {
        evidence.push(`Quality score ${a.currentQuality.overall}% is reasonable`);
      }

      return {
        summary: 'Project has quality foundations in place for strict enforcement',
        evidence: evidence.length > 0 ? evidence : ['Standard recommendation for projects with basic quality infrastructure']
      };
    }

    // Legacy mode
    if (!a.testingSetup?.hasTests) {
      evidence.push('No testing infrastructure detected');
    }
    const coverage = a.currentQuality?.scores?.actualCoverage || 0;
    if (coverage < 50) {
      evidence.push(`Coverage is ${coverage}% (below 50% threshold)`);
    }
    if (!a.lintingSetup?.hasLinter) {
      evidence.push('No linter configured');
    }
    if (a.projectAge?.activity === 'dormant' || a.projectAge?.activity === 'abandoned') {
      evidence.push(`Project activity: ${a.projectAge.activity}`);
    }
    if (a.codebaseSize?.category === 'large' || a.codebaseSize?.category === 'enterprise') {
      evidence.push(`Large codebase (${a.codebaseSize.totalLines} lines)`);
    }

    return {
      summary: 'Project needs gradual quality improvement',
      evidence: evidence.length > 0 ? evidence : ['Quality metrics below strict thresholds']
    };
  }

  /**
   * Calculate effort level for reaching recommended mode
   * @param {string} mode - Recommended mode
   * @param {Object} analysis - Project analysis
   * @returns {string} Effort level (low, medium, high)
   */
  calculateEffort(mode, analysis) {
    if (mode === 'strictest') {
      // If already at high quality, low effort
      if ((analysis.currentQuality?.overall || 0) >= 85) {
        return 'low';
      }
      return 'high';
    }

    if (mode === 'strict') {
      const quality = analysis.currentQuality?.overall || 0;
      if (quality >= 70) return 'low';
      if (quality >= 50) return 'medium';
      return 'high';
    }

    // Legacy mode is about baseline, so low effort to start
    return 'low';
  }

  /**
   * Generate upgrade path from legacy to strict
   * @param {Object} analysis - Project analysis
   * @returns {Object} Upgrade path with phases
   */
  generateUpgradePath(analysis) {
    const phases = [];
    const size = analysis.codebaseSize?.category || 'medium';
    const baseDuration = {
      tiny: 1,
      small: 2,
      medium: 4,
      large: 8,
      enterprise: 16
    };

    const weekMultiplier = baseDuration[size] || 4;

    // Phase 1: Foundation
    const phase1Tasks = [];
    if (!analysis.lintingSetup?.hasLinter) {
      phase1Tasks.push('Install and configure linter');
    }
    if (!analysis.testingSetup?.testFramework) {
      phase1Tasks.push('Set up test framework');
    }
    if (!analysis.currentQuality?.breakdown?.ci) {
      phase1Tasks.push('Configure CI pipeline');
    }

    if (phase1Tasks.length > 0) {
      phases.push({
        name: 'Foundation',
        duration: `${weekMultiplier} week(s)`,
        tasks: phase1Tasks,
        goal: 'Establish quality infrastructure'
      });
    }

    // Phase 2: Coverage
    const coverage = analysis.currentQuality?.scores?.actualCoverage || 0;
    if (coverage < 80) {
      phases.push({
        name: 'Coverage',
        duration: `${weekMultiplier * 2}-${weekMultiplier * 3} weeks`,
        tasks: [
          'Add tests for critical paths',
          'Enforce coverage on new code (80%)',
          'Backfill tests incrementally',
          `Target: increase from ${coverage}% to 80%`
        ],
        goal: 'Achieve 80% test coverage'
      });
    }

    // Phase 3: Cleanup
    if (!analysis.lintingSetup?.hasLinter || analysis.technicalDebt?.level !== 'low') {
      phases.push({
        name: 'Cleanup',
        duration: `${weekMultiplier}-${weekMultiplier * 2} weeks`,
        tasks: [
          'Run linter auto-fix',
          'Fix remaining lint errors',
          'Enable lint blocking in CI'
        ],
        goal: 'Zero lint errors'
      });
    }

    // Phase 4: Complexity
    if (analysis.architecturePattern?.violations > 0 || analysis.architecturePattern?.circularDependencies > 0) {
      phases.push({
        name: 'Architecture',
        duration: `${weekMultiplier * 2}-${weekMultiplier * 3} weeks`,
        tasks: [
          'Resolve circular dependencies',
          'Fix architecture violations',
          'Refactor complex functions'
        ],
        goal: 'Clean architecture'
      });
    }

    // Estimate total
    const totalWeeks = phases.reduce((sum, p) => {
      const match = p.duration.match(/(\d+)/);
      return sum + (match ? parseInt(match[1], 10) : 4);
    }, 0);

    return {
      fromMode: 'legacy',
      toMode: 'strict',
      phases,
      totalEstimate: `${totalWeeks}-${totalWeeks * 1.5} weeks`,
      metrics: [
        'Coverage %',
        'Lint errors',
        'Test count',
        'Cyclomatic complexity average'
      ]
    };
  }

  /**
   * Get prioritized fixes for low-quality projects
   * @param {Object} analysis - Project analysis
   * @returns {Array} Prioritized fix list
   */
  getPrioritizedFixes(analysis) {
    const fixes = [];

    // Priority 1: Security
    if (!analysis.securityPosture?.ignoresSecrets) {
      fixes.push({
        priority: 1,
        category: 'security',
        fix: 'Add .env and credential files to .gitignore',
        effort: 'low',
        impact: 'critical'
      });
    }

    // Priority 2: Testing foundation
    if (!analysis.testingSetup?.hasTests) {
      fixes.push({
        priority: 2,
        category: 'testing',
        fix: 'Set up test framework and add first test',
        effort: 'medium',
        impact: 'high'
      });
    }

    // Priority 3: Linting
    if (!analysis.lintingSetup?.hasLinter) {
      fixes.push({
        priority: 3,
        category: 'linting',
        fix: `Install ${analysis.lintingSetup?.recommendation || 'linter'} and configure`,
        effort: 'low',
        impact: 'high'
      });
    }

    // Priority 4: Type safety
    const hasTypeCheck = analysis.currentQuality?.breakdown?.typeChecking;
    const languages = analysis.languages?.all || [];
    if (!hasTypeCheck && languages.some(l => ['javascript', 'python'].includes(l))) {
      fixes.push({
        priority: 4,
        category: 'type-safety',
        fix: languages.includes('javascript')
          ? 'Add TypeScript or JSDoc type annotations'
          : 'Add type hints and configure mypy',
        effort: 'medium',
        impact: 'high'
      });
    }

    // Priority 5: CI/CD
    if (!analysis.currentQuality?.breakdown?.ci) {
      fixes.push({
        priority: 5,
        category: 'ci',
        fix: 'Set up CI pipeline (GitHub Actions, GitLab CI, etc.)',
        effort: 'medium',
        impact: 'high'
      });
    }

    // Priority 6: Architecture
    if (analysis.architecturePattern?.circularDependencies > 0) {
      fixes.push({
        priority: 6,
        category: 'architecture',
        fix: `Resolve ${analysis.architecturePattern.circularDependencies} circular dependencies`,
        effort: 'high',
        impact: 'medium'
      });
    }

    // Priority 7: Documentation
    if (!analysis.currentQuality?.breakdown?.documentation) {
      fixes.push({
        priority: 7,
        category: 'documentation',
        fix: 'Add or expand README with setup instructions',
        effort: 'low',
        impact: 'medium'
      });
    }

    return fixes.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get quick wins for immediate improvement
   * @param {Object} analysis - Project analysis
   * @returns {Array} Quick win list
   */
  getQuickWins(analysis) {
    const wins = [];

    // Auto-fixable
    if (analysis.lintingSetup?.hasLinter) {
      wins.push('Run linter with --fix flag to auto-correct issues');
    }

    // Simple additions
    if (!analysis.currentQuality?.breakdown?.documentation) {
      wins.push('Add README.md with project description');
    }

    if (!analysis.securityPosture?.ignoresSecrets) {
      wins.push('Update .gitignore to exclude .env files');
    }

    // Formatter
    if (!analysis.currentQuality?.breakdown?.formatting) {
      wins.push('Add Prettier/Black/gofmt for automatic formatting');
    }

    // Test script
    if (!analysis.testingSetup?.hasTestScript) {
      wins.push('Add "test" script to package.json');
    }

    // Editor config
    if (!fs.existsSync(path.join(analysis.project, '.editorconfig'))) {
      wins.push('Add .editorconfig for consistent formatting');
    }

    return wins.slice(0, 5); // Return top 5
  }
}

// Import fs for quick wins check
const fs = require('fs');
const path = require('path');

module.exports = {
  ModeSuggester,
  SUGGESTION_WEIGHTS,
  THRESHOLDS
};

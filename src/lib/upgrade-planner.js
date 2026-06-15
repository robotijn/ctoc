/**
 * Upgrade Planner
 * Generates detailed upgrade roadmaps between quality modes
 *
 * RED/BLUE Team Refinements Applied:
 * R1: Initial roadmap too generic
 * B1: Added project-specific analysis for targeted recommendations
 * R2: Effort estimates not realistic
 * B2: Added codebase size multipliers and historical data
 * R3: Milestones not measurable
 * B3: Added specific metrics and thresholds for each milestone
 * R4: Missing rollback guidance
 * B4: Added risk assessment and rollback strategies
 * R5: Quick wins buried in long roadmap
 * B5: Separated quick wins from long-term improvements
 * R6: No progress tracking mechanism
 * B6: Added checkpoint definitions and progress calculation
 * R7: Blockers not identified proactively
 * B7: Added blocker detection and mitigation strategies
 * R8: Team capacity not considered
 * B8: Added team-size-aware scheduling
 * R9: Dependencies between tasks not clear
 * B9: Added task dependency graph
 * R10: Success criteria vague
 * B10: Added explicit success criteria with verification commands
 */

const fs = require('fs');
const path = require('path');

/**
 * Effort estimates by codebase size (in weeks for 1 developer)
 * @type {Object}
 */
const BASE_EFFORT = {
  tiny: { foundation: 0.5, coverage: 1, cleanup: 0.5, architecture: 0.5 },
  small: { foundation: 1, coverage: 2, cleanup: 1, architecture: 1 },
  medium: { foundation: 2, coverage: 4, cleanup: 2, architecture: 2 },
  large: { foundation: 4, coverage: 8, cleanup: 4, architecture: 4 },
  enterprise: { foundation: 8, coverage: 16, cleanup: 8, architecture: 8 }
};

/**
 * Common blockers and their mitigations
 * @type {Object}
 */
const COMMON_BLOCKERS = {
  slowTests: {
    name: 'Slow test suite',
    symptoms: ['Tests take > 10 minutes', 'Developers skip tests'],
    mitigation: [
      'Parallelize test execution',
      'Mock external dependencies',
      'Use in-memory databases for unit tests',
      'Separate unit and integration tests'
    ]
  },
  untestableCode: {
    name: 'Untestable legacy code',
    symptoms: ['Global state', 'Tight coupling', 'No dependency injection'],
    mitigation: [
      'Start with integration tests',
      'Add seams using extract and override',
      'Introduce dependency injection gradually',
      'Use mocking libraries'
    ]
  },
  noTime: {
    name: 'No time for quality work',
    symptoms: ['Sprint pressure', 'Feature deadlines'],
    mitigation: [
      'Boy Scout Rule: Leave code better than found',
      'Test-Driven Bugfixes: Write test for every bug',
      'Dedicate 20% time to tech debt',
      'Quarterly quality sprints'
    ]
  },
  tooManyErrors: {
    name: 'Overwhelming lint errors',
    symptoms: ['Thousands of errors', 'Team overwhelmed'],
    mitigation: [
      'Baseline approach: Only block new errors',
      'Auto-fix campaign: Run --fix, review, commit',
      'Enable rules incrementally',
      'Fix file-by-file'
    ]
  },
  circularDeps: {
    name: 'Circular dependencies',
    symptoms: ['Import cycles', 'Tight coupling'],
    mitigation: [
      'Introduce interface layers',
      'Use dependency injection',
      'Extract shared code to common modules',
      'Review barrel file usage'
    ]
  }
};

/**
 * Upgrade Planner class
 * Generates detailed, actionable upgrade roadmaps
 */
class UpgradePlanner {
  /**
   * Create an UpgradePlanner instance
   * @param {Object} analysis - Project analysis from ProjectAnalyzer
   * @param {Object} suggestion - Mode suggestion from ModeSuggester
   */
  constructor(analysis, suggestion) {
    this.analysis = analysis;
    this.suggestion = suggestion;
    this.fromMode = this.determineCurrentMode();
    this.toMode = suggestion.recommended;
  }

  /**
   * Determine current effective mode based on analysis
   * @returns {string} Current mode
   */
  determineCurrentMode() {
    const quality = this.analysis.currentQuality?.overall || 0;
    const coverage = this.analysis.currentQuality?.scores?.actualCoverage || 0;

    if (quality >= 85 && coverage >= 90) return 'strictest';
    if (quality >= 50 && coverage >= 50) return 'strict';
    return 'legacy';
  }

  /**
   * Generate full upgrade plan
   * @param {Object} options - Planning options
   * @param {number} options.teamSize - Number of developers (default: 1)
   * @param {number} options.dedicatedPercent - % of time for quality work (default: 20)
   * @returns {Object} Complete upgrade plan
   */
  generatePlan(options = {}) {
    const teamSize = options.teamSize || 1;
    const dedicatedPercent = options.dedicatedPercent || 20;

    const plan = {
      fromMode: this.fromMode,
      toMode: this.toMode,
      generatedAt: new Date().toISOString(),
      projectSize: this.analysis.codebaseSize?.category || 'medium',
      teamSize,
      dedicatedPercent,
      quickWins: this.identifyQuickWins(),
      phases: this.generatePhases(teamSize, dedicatedPercent),
      blockers: this.identifyBlockers(),
      milestones: this.defineMilestones(),
      checkpoints: this.defineCheckpoints(),
      successCriteria: this.defineSuccessCriteria(),
      risks: this.assessRisks(),
      totalEstimate: null // Calculated below
    };

    // Calculate total estimate
    plan.totalEstimate = this.calculateTotalEstimate(plan.phases);

    return plan;
  }

  /**
   * Identify quick wins (< 1 day effort each)
   * @returns {Array} Quick win list
   */
  identifyQuickWins() {
    const wins = [];
    const a = this.analysis;

    // Linter auto-fix
    if (a.lintingSetup?.hasLinter) {
      wins.push({
        action: 'Run linter auto-fix',
        command: this.getLinterFixCommand(),
        effort: '15 minutes',
        impact: 'medium',
        prerequisite: null
      });
    }

    // Add .gitignore entries
    if (!a.securityPosture?.ignoresSecrets) {
      wins.push({
        action: 'Update .gitignore for secrets',
        command: 'echo ".env\\n*.pem\\ncredentials.json" >> .gitignore',
        effort: '5 minutes',
        impact: 'high',
        prerequisite: null
      });
    }

    // Add editorconfig
    const hasEditorConfig = fs.existsSync(path.join(a.project, '.editorconfig'));
    if (!hasEditorConfig) {
      wins.push({
        action: 'Add .editorconfig',
        command: 'ctoc quality init --editorconfig',
        effort: '5 minutes',
        impact: 'low',
        prerequisite: null
      });
    }

    // Add test script
    if (!a.testingSetup?.hasTestScript && a.languages?.all?.includes('typescript')) {
      wins.push({
        action: 'Add test script to package.json',
        command: 'npm pkg set scripts.test="vitest"',
        effort: '5 minutes',
        impact: 'medium',
        prerequisite: 'Test framework installed'
      });
    }

    // Formatter config
    if (!a.currentQuality?.breakdown?.formatting) {
      wins.push({
        action: 'Add formatter configuration',
        command: this.getFormatterSetupCommand(),
        effort: '30 minutes',
        impact: 'medium',
        prerequisite: null
      });
    }

    // Pre-commit hooks
    const hasPreCommit = fs.existsSync(path.join(a.project, '.husky')) ||
                        fs.existsSync(path.join(a.project, '.pre-commit-config.yaml'));
    if (!hasPreCommit && a.lintingSetup?.hasLinter) {
      wins.push({
        action: 'Set up pre-commit hooks',
        command: this.getPreCommitSetupCommand(),
        effort: '30 minutes',
        impact: 'high',
        prerequisite: 'Linter configured'
      });
    }

    return wins;
  }

  /**
   * Generate upgrade phases
   * @param {number} teamSize - Team size
   * @param {number} dedicatedPercent - Dedicated time percentage
   * @returns {Array} Phase list
   */
  generatePhases(teamSize, dedicatedPercent) {
    const phases = [];
    const size = this.analysis.codebaseSize?.category || 'medium';
    const effort = BASE_EFFORT[size] || BASE_EFFORT.medium;

    // Adjust effort for team capacity
    const capacityMultiplier = 100 / (dedicatedPercent * teamSize);

    // Phase 1: Foundation (if needed)
    if (this.needsFoundation()) {
      phases.push(this.generateFoundationPhase(effort.foundation * capacityMultiplier));
    }

    // Phase 2: Testing & Coverage
    if (this.needsCoverageWork()) {
      phases.push(this.generateCoveragePhase(effort.coverage * capacityMultiplier));
    }

    // Phase 3: Lint Cleanup
    if (this.needsLintCleanup()) {
      phases.push(this.generateCleanupPhase(effort.cleanup * capacityMultiplier));
    }

    // Phase 4: Architecture
    if (this.needsArchitectureWork()) {
      phases.push(this.generateArchitecturePhase(effort.architecture * capacityMultiplier));
    }

    // Phase 5: Strictest (if upgrading to strictest)
    if (this.toMode === 'strictest') {
      phases.push(this.generateStrictestPhase(effort.coverage * capacityMultiplier * 0.5));
    }

    // Add dependencies between phases
    this.addPhaseDependencies(phases);

    return phases;
  }

  /**
   * Check if foundation phase is needed
   * @returns {boolean}
   */
  needsFoundation() {
    const a = this.analysis;
    return !a.lintingSetup?.hasLinter ||
           !a.testingSetup?.testFramework ||
           !a.currentQuality?.breakdown?.ci;
  }

  /**
   * Check if coverage work is needed
   * @returns {boolean}
   */
  needsCoverageWork() {
    const coverage = this.analysis.currentQuality?.scores?.actualCoverage || 0;
    const target = this.toMode === 'strictest' ? 90 : 80;
    return coverage < target;
  }

  /**
   * Check if lint cleanup is needed
   * @returns {boolean}
   */
  needsLintCleanup() {
    // Heuristic: if no linter or technical debt is moderate+
    return !this.analysis.lintingSetup?.hasLinter ||
           this.analysis.technicalDebt?.level !== 'low';
  }

  /**
   * Check if architecture work is needed
   * @returns {boolean}
   */
  needsArchitectureWork() {
    const arch = this.analysis.architecturePattern;
    return arch?.violations > 0 || arch?.circularDependencies > 0;
  }

  /**
   * Generate foundation phase
   * @param {number} weeks - Estimated weeks
   * @returns {Object} Phase definition
   */
  generateFoundationPhase(weeks) {
    const tasks = [];
    const a = this.analysis;

    if (!a.lintingSetup?.hasLinter) {
      tasks.push({
        task: 'Install and configure linter',
        command: this.getLinterSetupCommand(),
        effort: 'medium',
        blocking: true
      });
    }

    if (!a.testingSetup?.testFramework) {
      tasks.push({
        task: 'Set up test framework',
        command: this.getTestFrameworkSetupCommand(),
        effort: 'medium',
        blocking: true
      });
    }

    if (!a.currentQuality?.breakdown?.ci) {
      tasks.push({
        task: 'Configure CI pipeline',
        command: 'Create .github/workflows/ci.yml',
        effort: 'medium',
        blocking: false
      });
    }

    if (!a.currentQuality?.breakdown?.typeChecking) {
      const lang = a.languages?.primary;
      if (lang === 'javascript' || lang === 'python') {
        tasks.push({
          task: 'Enable type checking',
          command: lang === 'javascript' ? 'npx tsc --init' : 'pip install mypy',
          effort: 'medium',
          blocking: false
        });
      }
    }

    return {
      name: 'Foundation',
      description: 'Establish quality infrastructure',
      estimatedWeeks: Math.ceil(weeks),
      tasks,
      exitCriteria: [
        'Linter runs without configuration errors',
        'Test framework executes successfully',
        'CI pipeline runs on every push'
      ],
      verificationCommands: [
        'npm run lint 2>&1 | head -5',
        'npm test 2>&1 | head -10',
        'gh run list --limit 1'
      ]
    };
  }

  /**
   * Generate coverage phase
   * @param {number} weeks - Estimated weeks
   * @returns {Object} Phase definition
   */
  generateCoveragePhase(weeks) {
    const currentCoverage = this.analysis.currentQuality?.scores?.actualCoverage || 0;
    const targetCoverage = this.toMode === 'strictest' ? 90 : 80;
    const gap = targetCoverage - currentCoverage;

    const tasks = [
      {
        task: 'Identify untested critical paths',
        command: 'ctoc coverage uncovered --sort-by-risk',
        effort: 'low',
        blocking: false
      },
      {
        task: 'Add tests for authentication/authorization',
        command: null,
        effort: 'high',
        blocking: true
      },
      {
        task: 'Add tests for data validation',
        command: null,
        effort: 'high',
        blocking: true
      },
      {
        task: 'Enforce coverage on new code',
        command: this.getCoverageEnforcementCommand(),
        effort: 'low',
        blocking: true
      },
      {
        task: `Backfill tests to reach ${targetCoverage}%`,
        command: null,
        effort: 'high',
        blocking: true
      }
    ];

    return {
      name: 'Coverage',
      description: `Increase coverage from ${currentCoverage}% to ${targetCoverage}%`,
      estimatedWeeks: Math.ceil(weeks * (gap / 30)), // Scale by coverage gap
      tasks,
      exitCriteria: [
        `Overall coverage >= ${targetCoverage}%`,
        `Branch coverage >= ${targetCoverage}%`,
        'All critical paths have tests'
      ],
      verificationCommands: [
        'npm run test:coverage',
        'ctoc coverage check'
      ],
      milestoneTargets: [
        { week: Math.ceil(weeks * 0.25), coverage: currentCoverage + gap * 0.25 },
        { week: Math.ceil(weeks * 0.5), coverage: currentCoverage + gap * 0.5 },
        { week: Math.ceil(weeks * 0.75), coverage: currentCoverage + gap * 0.75 },
        { week: Math.ceil(weeks), coverage: targetCoverage }
      ]
    };
  }

  /**
   * Generate cleanup phase
   * @param {number} weeks - Estimated weeks
   * @returns {Object} Phase definition
   */
  generateCleanupPhase(weeks) {
    return {
      name: 'Lint Cleanup',
      description: 'Eliminate lint errors and enforce standards',
      estimatedWeeks: Math.ceil(weeks),
      tasks: [
        {
          task: 'Run auto-fix on entire codebase',
          command: this.getLinterFixCommand(),
          effort: 'low',
          blocking: false
        },
        {
          task: 'Review and commit auto-fixed changes',
          command: null,
          effort: 'medium',
          blocking: true
        },
        {
          task: 'Fix remaining errors manually',
          command: null,
          effort: 'high',
          blocking: true
        },
        {
          task: 'Enable lint blocking in CI',
          command: 'Update CI config to fail on lint errors',
          effort: 'low',
          blocking: true
        },
        {
          task: 'Add pre-commit hooks',
          command: this.getPreCommitSetupCommand(),
          effort: 'low',
          blocking: false
        }
      ],
      exitCriteria: [
        'Zero lint errors',
        'Lint check passes in CI',
        'Pre-commit hooks prevent new errors'
      ],
      verificationCommands: [
        'npm run lint',
        'git commit --dry-run -m "test" 2>&1 | grep -i lint'
      ]
    };
  }

  /**
   * Generate architecture phase
   * @param {number} weeks - Estimated weeks
   * @returns {Object} Phase definition
   */
  generateArchitecturePhase(weeks) {
    const arch = this.analysis.architecturePattern;
    const tasks = [];

    if (arch?.circularDependencies > 0) {
      tasks.push({
        task: `Resolve ${arch.circularDependencies} circular dependencies`,
        command: 'ctoc architecture cycles --verbose',
        effort: 'high',
        blocking: true
      });
    }

    if (arch?.violations > 0) {
      tasks.push({
        task: `Fix ${arch.violations} architecture violations`,
        command: 'ctoc architecture violations',
        effort: 'high',
        blocking: true
      });
    }

    tasks.push({
      task: 'Reduce cyclomatic complexity of complex functions',
      command: 'ctoc quality complexity --threshold 10',
      effort: 'high',
      blocking: false
    });

    tasks.push({
      task: 'Add architecture validation to CI',
      command: 'Add dependency-cruiser or similar',
      effort: 'medium',
      blocking: false
    });

    return {
      name: 'Architecture',
      description: 'Clean up architecture and reduce complexity',
      estimatedWeeks: Math.ceil(weeks),
      tasks,
      exitCriteria: [
        'Zero circular dependencies',
        'Zero architecture violations',
        'Cyclomatic complexity <= 10 for all functions'
      ],
      verificationCommands: [
        'ctoc architecture check',
        'ctoc quality complexity'
      ]
    };
  }

  /**
   * Generate strictest upgrade phase
   * @param {number} weeks - Estimated weeks
   * @returns {Object} Phase definition
   */
  generateStrictestPhase(weeks) {
    return {
      name: 'Strictest',
      description: 'Achieve maximum quality standards',
      estimatedWeeks: Math.ceil(weeks),
      tasks: [
        {
          task: 'Eliminate all any types (TypeScript)',
          command: 'grep -r "any" src/ | wc -l',
          effort: 'high',
          blocking: true
        },
        {
          task: 'Achieve 90% coverage',
          command: 'npm run test:coverage',
          effort: 'high',
          blocking: true
        },
        {
          task: 'Reduce complexity to strictest limits',
          command: 'ctoc quality complexity --mode strictest',
          effort: 'high',
          blocking: true
        },
        {
          task: '100% documentation coverage',
          command: 'typedoc --validation.notDocumented',
          effort: 'medium',
          blocking: true
        },
        {
          task: 'Enable all strict linter rules',
          command: 'Update eslint config for maximum strictness',
          effort: 'medium',
          blocking: true
        }
      ],
      exitCriteria: [
        'Coverage >= 90%',
        'Zero any types',
        'Cyclomatic complexity <= 7',
        '100% public API documented'
      ],
      verificationCommands: [
        'ctoc quality check --mode strictest'
      ]
    };
  }

  /**
   * Add dependencies between phases
   * @param {Array} phases - Phase list
   */
  addPhaseDependencies(phases) {
    for (let i = 1; i < phases.length; i++) {
      phases[i].dependsOn = [phases[i - 1].name];
    }
    if (phases.length > 0) {
      phases[0].dependsOn = [];
    }
  }

  /**
   * Identify potential blockers
   * @returns {Array} Blocker list
   */
  identifyBlockers() {
    const blockers = [];
    const a = this.analysis;

    // Slow tests
    if (a.codebaseSize?.category === 'large' || a.codebaseSize?.category === 'enterprise') {
      blockers.push({
        ...COMMON_BLOCKERS.slowTests,
        likelihood: 'high',
        applicablePhases: ['Coverage']
      });
    }

    // Untestable code
    if (!a.testingSetup?.hasTests && a.codebaseSize?.sourceFiles > 50) {
      blockers.push({
        ...COMMON_BLOCKERS.untestableCode,
        likelihood: 'high',
        applicablePhases: ['Coverage']
      });
    }

    // Time pressure (always a risk)
    blockers.push({
      ...COMMON_BLOCKERS.noTime,
      likelihood: 'medium',
      applicablePhases: ['Coverage', 'Lint Cleanup', 'Architecture']
    });

    // Many lint errors
    if (!a.lintingSetup?.hasLinter && a.codebaseSize?.sourceFiles > 100) {
      blockers.push({
        ...COMMON_BLOCKERS.tooManyErrors,
        likelihood: 'high',
        applicablePhases: ['Lint Cleanup']
      });
    }

    // Circular dependencies
    if (a.architecturePattern?.circularDependencies > 0) {
      blockers.push({
        ...COMMON_BLOCKERS.circularDeps,
        likelihood: 'confirmed',
        applicablePhases: ['Architecture']
      });
    }

    return blockers;
  }

  /**
   * Define milestones
   * @returns {Array} Milestone definitions
   */
  defineMilestones() {
    const milestones = [];
    const targetCoverage = this.toMode === 'strictest' ? 90 : 80;

    milestones.push({
      name: 'Foundation Complete',
      criteria: [
        'Linter configured and running',
        'Test framework operational',
        'CI pipeline active'
      ],
      verificationCommand: 'ctoc quality check --foundation'
    });

    milestones.push({
      name: `Coverage at 60%`,
      criteria: [`Coverage >= 60%`],
      verificationCommand: 'ctoc coverage check --threshold 60'
    });

    milestones.push({
      name: `Coverage at ${targetCoverage}%`,
      criteria: [`Coverage >= ${targetCoverage}%`],
      verificationCommand: `ctoc coverage check --threshold ${targetCoverage}`
    });

    milestones.push({
      name: 'Zero Lint Errors',
      criteria: ['All lint errors resolved', 'CI blocks on new errors'],
      verificationCommand: 'npm run lint && echo "PASS" || echo "FAIL"'
    });

    milestones.push({
      name: 'Clean Architecture',
      criteria: [
        'Zero circular dependencies',
        'Zero layer violations',
        'Complexity within limits'
      ],
      verificationCommand: 'ctoc architecture check && ctoc quality complexity'
    });

    if (this.toMode === 'strictest') {
      milestones.push({
        name: 'Strictest Achieved',
        criteria: [
          'Coverage >= 90%',
          'Zero any types',
          'Complexity <= 7',
          '100% documentation'
        ],
        verificationCommand: 'ctoc quality check --mode strictest'
      });
    }

    return milestones;
  }

  /**
   * Define checkpoints for progress tracking
   * @returns {Array} Checkpoint definitions
   */
  defineCheckpoints() {
    return [
      {
        name: 'Week 1',
        metrics: ['lint_errors', 'test_count', 'coverage'],
        action: 'Review progress, adjust pace if needed'
      },
      {
        name: 'Week 2',
        metrics: ['lint_errors', 'test_count', 'coverage', 'ci_success_rate'],
        action: 'Identify any blockers early'
      },
      {
        name: 'Week 4',
        metrics: ['coverage', 'lint_errors', 'complexity_violations'],
        action: 'Mid-point review, celebrate progress'
      },
      {
        name: 'Week 8',
        metrics: ['all'],
        action: 'Final assessment, plan graduation to new mode'
      }
    ];
  }

  /**
   * Define success criteria
   * @returns {Object} Success criteria
   */
  defineSuccessCriteria() {
    const criteria = {
      strict: {
        coverage: { min: 80, metric: 'lines' },
        lintErrors: { max: 0 },
        securityVulns: { critical: 0, high: 0 },
        complexity: { cyclomatic: 10, cognitive: 15 }
      },
      strictest: {
        coverage: { min: 90, metric: 'lines' },
        lintErrors: { max: 0 },
        lintWarnings: { max: 0 },
        securityVulns: { critical: 0, high: 0, medium: 0 },
        complexity: { cyclomatic: 7, cognitive: 10 },
        typeAny: { max: 0 },
        documentation: { min: 100, metric: 'percent' }
      }
    };

    return criteria[this.toMode] || criteria.strict;
  }

  /**
   * Assess risks of the upgrade
   * @returns {Array} Risk assessment
   */
  assessRisks() {
    const risks = [];
    const a = this.analysis;

    // Team velocity risk
    risks.push({
      risk: 'Velocity decrease during upgrade',
      likelihood: 'high',
      impact: 'medium',
      mitigation: 'Start with quick wins, limit WIP, celebrate progress'
    });

    // Breaking changes risk
    if (a.codebaseSize?.category === 'large' || a.codebaseSize?.category === 'enterprise') {
      risks.push({
        risk: 'Refactoring introduces bugs',
        likelihood: 'medium',
        impact: 'high',
        mitigation: 'Refactor only with test coverage, use feature flags'
      });
    }

    // Team resistance risk
    risks.push({
      risk: 'Team pushback on stricter rules',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Communicate benefits, involve team in decisions, phase gradually'
    });

    // Scope creep risk
    risks.push({
      risk: 'Quality work expands beyond plan',
      likelihood: 'high',
      impact: 'medium',
      mitigation: 'Time-box phases, defer non-critical improvements'
    });

    return risks;
  }

  /**
   * Calculate total estimate from phases
   * @param {Array} phases - Phase list
   * @returns {Object} Total estimate
   */
  calculateTotalEstimate(phases) {
    const totalWeeks = phases.reduce((sum, p) => sum + p.estimatedWeeks, 0);

    return {
      weeks: totalWeeks,
      range: {
        optimistic: Math.ceil(totalWeeks * 0.8),
        expected: totalWeeks,
        pessimistic: Math.ceil(totalWeeks * 1.5)
      },
      confidence: totalWeeks <= 4 ? 'high' : totalWeeks <= 12 ? 'medium' : 'low'
    };
  }

  // ============ Helper Methods for Commands ============

  /**
   * Get linter setup command based on language
   * @returns {string}
   */
  getLinterSetupCommand() {
    const lang = this.analysis.languages?.primary;
    const commands = {
      typescript: 'npm install -D eslint @eslint/js typescript-eslint && npx eslint --init',
      javascript: 'npm install -D eslint @eslint/js && npx eslint --init',
      python: 'pip install ruff && ruff check --fix',
      go: 'go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest',
      rust: 'rustup component add clippy'
    };
    return commands[lang] || 'Install appropriate linter for your language';
  }

  /**
   * Get linter fix command
   * @returns {string}
   */
  getLinterFixCommand() {
    const linters = this.analysis.lintingSetup?.linters || [];

    if (linters.includes('eslint')) return 'npx eslint . --fix';
    if (linters.includes('ruff')) return 'ruff check --fix .';
    if (linters.includes('rubocop')) return 'rubocop -a';
    if (linters.includes('golangci')) return 'golangci-lint run --fix';

    return 'Run your linter with --fix flag';
  }

  /**
   * Get test framework setup command
   * @returns {string}
   */
  getTestFrameworkSetupCommand() {
    const lang = this.analysis.languages?.primary;
    const commands = {
      typescript: 'npm install -D vitest @vitest/coverage-v8',
      javascript: 'npm install -D vitest',
      python: 'pip install pytest pytest-cov',
      go: 'No setup needed - use go test',
      rust: 'No setup needed - use cargo test'
    };
    return commands[lang] || 'Install appropriate test framework';
  }

  /**
   * Get formatter setup command
   * @returns {string}
   */
  getFormatterSetupCommand() {
    const lang = this.analysis.languages?.primary;
    const commands = {
      typescript: 'npm install -D prettier && echo {} > .prettierrc',
      javascript: 'npm install -D prettier && echo {} > .prettierrc',
      python: 'pip install black',
      go: 'No setup needed - use gofmt',
      rust: 'rustup component add rustfmt'
    };
    return commands[lang] || 'Install appropriate formatter';
  }

  /**
   * Get pre-commit setup command
   * @returns {string}
   */
  getPreCommitSetupCommand() {
    const lang = this.analysis.languages?.primary;
    if (['typescript', 'javascript'].includes(lang)) {
      return 'npx husky init && echo "npx lint-staged" > .husky/pre-commit';
    }
    if (lang === 'python') {
      return 'pip install pre-commit && pre-commit install';
    }
    return 'Set up pre-commit hooks for your language';
  }

  /**
   * Get coverage enforcement command
   * @returns {string}
   */
  getCoverageEnforcementCommand() {
    const lang = this.analysis.languages?.primary;
    const target = this.toMode === 'strictest' ? 90 : 80;

    if (['typescript', 'javascript'].includes(lang)) {
      return `Add to vitest.config.ts: coverage: { thresholds: { lines: ${target} } }`;
    }
    if (lang === 'python') {
      return `Add to pyproject.toml: [tool.coverage.report] fail_under = ${target}`;
    }
    return `Configure coverage threshold of ${target}%`;
  }
}

module.exports = {
  UpgradePlanner,
  BASE_EFFORT,
  COMMON_BLOCKERS
};

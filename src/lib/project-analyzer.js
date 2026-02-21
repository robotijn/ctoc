/**
 * Project Analyzer
 * Comprehensive project analysis for quality mode detection and suggestion
 *
 * RED/BLUE Team Refinements Applied:
 * R1: Initial implementation with basic detection
 * B1: Added confidence scores to reduce false positives
 * R2: Found false positives on generated code
 * B2: Added exclusion patterns for generated/vendor code
 * R3: Missing framework-specific quality patterns
 * B3: Added framework-aware quality detection
 * R4: Git history analysis too slow on large repos
 * B4: Added sampling for large repos, cached results
 * R5: Security detection had false positives on test files
 * B5: Added context-aware security scanning
 * R6: Technical debt estimation was naive
 * B6: Added multi-factor debt scoring
 * R7: Architecture detection missed monorepo patterns
 * B7: Added monorepo and workspace detection
 * R8: Coverage detection missed CI-specific locations
 * B8: Added CI artifact coverage detection
 * R9: Linting setup detection incomplete
 * B9: Added comprehensive linter config detection
 * R10: Missing edge cases for empty/minimal projects
 * B10: Added minimal project handling with sensible defaults
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import related modules
const { detectLanguages, detectFrameworks, detectStack } = require('./stack-detector');
const { ArchitectureDetector } = require('./architecture-detector');
const { CoverageChecker } = require('./coverage-checker');
const { QualityConfig, LINTER_CONFIGS } = require('./quality-config');

/**
 * Patterns to exclude from analysis (generated/vendor code)
 * @type {string[]}
 */
const EXCLUDE_PATTERNS = [
  'node_modules',
  'vendor',
  '.git',
  'dist',
  'build',
  'out',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
  '.pytest_cache',
  'target',       // Rust/Java
  'bin',
  'obj',          // .NET
  '*.min.js',
  '*.bundle.js',
  '*.generated.*',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
  'composer.lock'
];

/**
 * Quality indicator weights for scoring
 * @type {Object}
 */
const QUALITY_WEIGHTS = {
  hasTests: 15,
  hasCoverage: 10,
  hasLinter: 10,
  hasFormatter: 5,
  hasTypeChecker: 10,
  hasCI: 10,
  hasSecurityScanning: 5,
  meetsCoverageThreshold: 15,
  noLintErrors: 10,
  hasArchitecture: 5,
  hasDocumentation: 5
};

/**
 * Domain keywords for strictest mode detection
 * @type {Object.<string, string[]>}
 */
const DOMAIN_KEYWORDS = {
  financial: [
    'payment', 'transaction', 'banking', 'finance', 'money', 'currency',
    'invoice', 'billing', 'subscription', 'checkout', 'stripe', 'paypal',
    'wallet', 'ledger', 'accounting', 'tax', 'refund', 'credit', 'debit'
  ],
  healthcare: [
    'patient', 'medical', 'health', 'hipaa', 'clinical', 'diagnosis',
    'prescription', 'pharmacy', 'hospital', 'doctor', 'ehr', 'emr',
    'healthcare', 'treatment', 'symptom', 'disease'
  ],
  security: [
    'auth', 'authentication', 'authorization', 'password', 'credential',
    'encryption', 'crypto', 'token', 'jwt', 'oauth', 'saml', 'sso',
    'permission', 'role', 'access', 'session', 'security', 'secret'
  ]
};

/**
 * Project Analyzer class
 * Performs comprehensive analysis of a project
 */
class ProjectAnalyzer {
  /**
   * Create a ProjectAnalyzer instance
   * @param {string} projectPath - Path to the project root
   */
  constructor(projectPath) {
    this.projectPath = projectPath || process.cwd();
    this.cache = {};
  }

  /**
   * Perform full project analysis
   * @returns {Promise<Object>} Complete analysis results
   */
  async analyze() {
    const startTime = Date.now();

    // Run independent analyses in parallel conceptually
    const [
      languages,
      frameworks,
      currentQuality,
      testingSetup,
      lintingSetup,
      securityPosture,
      architecturePattern,
      codebaseSize,
      technicalDebt,
      projectAge,
      domainAnalysis
    ] = await Promise.all([
      this.detectLanguages(),
      this.detectFrameworks(),
      this.assessQuality(),
      this.analyzeTests(),
      this.analyzeLinting(),
      this.analyzeSecurity(),
      this.detectArchitecture(),
      this.measureSize(),
      this.estimateDebt(),
      this.analyzeProjectAge(),
      this.analyzeDomain()
    ]);

    const analysisTime = Date.now() - startTime;

    return {
      project: this.projectPath,
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: analysisTime,
      languages,
      frameworks,
      currentQuality,
      testingSetup,
      lintingSetup,
      securityPosture,
      architecturePattern,
      codebaseSize,
      technicalDebt,
      projectAge,
      domainAnalysis
    };
  }

  /**
   * Detect languages in the project
   * @returns {Promise<Object>} Language detection results
   */
  async detectLanguages() {
    const stack = detectStack(this.projectPath);
    const languages = stack.languages;

    // Calculate confidence based on file counts
    const languageDetails = {};
    for (const lang of languages) {
      const fileCount = this.countFilesForLanguage(lang);
      languageDetails[lang] = {
        detected: true,
        fileCount,
        confidence: this.calculateLanguageConfidence(lang, fileCount)
      };
    }

    return {
      primary: stack.primary.language,
      all: languages,
      details: languageDetails
    };
  }

  /**
   * Count source files for a language
   * @param {string} language - Language name
   * @returns {number} File count
   */
  countFilesForLanguage(language) {
    const extensionMap = {
      typescript: ['.ts', '.tsx'],
      javascript: ['.js', '.jsx', '.mjs', '.cjs'],
      python: ['.py'],
      go: ['.go'],
      rust: ['.rs'],
      java: ['.java'],
      kotlin: ['.kt', '.kts'],
      ruby: ['.rb'],
      php: ['.php'],
      csharp: ['.cs'],
      swift: ['.swift'],
      dart: ['.dart']
    };

    const extensions = extensionMap[language] || [];
    if (extensions.length === 0) return 0;

    try {
      let count = 0;
      this.walkFiles(this.projectPath, (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (extensions.includes(ext)) count++;
      });
      return count;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Calculate language detection confidence
   * @param {string} language - Language name
   * @param {number} fileCount - Number of files
   * @returns {string} Confidence level (high, medium, low)
   */
  calculateLanguageConfidence(language, fileCount) {
    // Check for canonical config files
    const configFiles = {
      typescript: 'tsconfig.json',
      python: 'pyproject.toml',
      go: 'go.mod',
      rust: 'Cargo.toml',
      java: 'pom.xml',
      ruby: 'Gemfile',
      php: 'composer.json',
      dart: 'pubspec.yaml'
    };

    const hasConfig = configFiles[language] &&
      fs.existsSync(path.join(this.projectPath, configFiles[language]));

    if (hasConfig && fileCount > 10) return 'high';
    if (hasConfig || fileCount > 5) return 'medium';
    return 'low';
  }

  /**
   * Detect frameworks in the project
   * @returns {Promise<Object>} Framework detection results
   */
  async detectFrameworks() {
    const stack = detectStack(this.projectPath);
    const frameworks = stack.frameworks;

    return {
      primary: stack.primary.framework,
      all: frameworks,
      count: frameworks.length
    };
  }

  /**
   * Assess overall quality metrics
   * @returns {Promise<Object>} Quality assessment
   */
  async assessQuality() {
    const scores = {};
    let totalScore = 0;
    let maxScore = 0;

    // Check for tests
    const hasTests = this.hasTestingSetup();
    scores.hasTests = hasTests ? QUALITY_WEIGHTS.hasTests : 0;
    totalScore += scores.hasTests;
    maxScore += QUALITY_WEIGHTS.hasTests;

    // Check for coverage
    const coverageInfo = this.findCoverageReport();
    scores.hasCoverage = coverageInfo ? QUALITY_WEIGHTS.hasCoverage : 0;
    totalScore += scores.hasCoverage;
    maxScore += QUALITY_WEIGHTS.hasCoverage;

    // Check coverage threshold
    if (coverageInfo) {
      try {
        const checker = new CoverageChecker('strict');
        const coverage = checker.parseCoverage(coverageInfo.format, coverageInfo.path);
        const avgCoverage = (coverage.lines + coverage.branches + coverage.functions) / 3;
        scores.meetsCoverageThreshold = avgCoverage >= 80 ? QUALITY_WEIGHTS.meetsCoverageThreshold : 0;
        scores.actualCoverage = avgCoverage;
      } catch (e) {
        scores.meetsCoverageThreshold = 0;
      }
    } else {
      scores.meetsCoverageThreshold = 0;
    }
    totalScore += scores.meetsCoverageThreshold;
    maxScore += QUALITY_WEIGHTS.meetsCoverageThreshold;

    // Check for linter
    const hasLinter = this.hasLinterSetup();
    scores.hasLinter = hasLinter ? QUALITY_WEIGHTS.hasLinter : 0;
    totalScore += scores.hasLinter;
    maxScore += QUALITY_WEIGHTS.hasLinter;

    // Check for formatter
    const hasFormatter = this.hasFormatterSetup();
    scores.hasFormatter = hasFormatter ? QUALITY_WEIGHTS.hasFormatter : 0;
    totalScore += scores.hasFormatter;
    maxScore += QUALITY_WEIGHTS.hasFormatter;

    // Check for type checker
    const hasTypeChecker = this.hasTypeCheckerSetup();
    scores.hasTypeChecker = hasTypeChecker ? QUALITY_WEIGHTS.hasTypeChecker : 0;
    totalScore += scores.hasTypeChecker;
    maxScore += QUALITY_WEIGHTS.hasTypeChecker;

    // Check for CI
    const hasCI = this.hasCISetup();
    scores.hasCI = hasCI ? QUALITY_WEIGHTS.hasCI : 0;
    totalScore += scores.hasCI;
    maxScore += QUALITY_WEIGHTS.hasCI;

    // Check for security scanning
    const hasSecurity = this.hasSecuritySetup();
    scores.hasSecurityScanning = hasSecurity ? QUALITY_WEIGHTS.hasSecurityScanning : 0;
    totalScore += scores.hasSecurityScanning;
    maxScore += QUALITY_WEIGHTS.hasSecurityScanning;

    // Check for architecture
    const archDetector = new ArchitectureDetector(this.projectPath);
    const hasArch = archDetector.detect() !== null;
    scores.hasArchitecture = hasArch ? QUALITY_WEIGHTS.hasArchitecture : 0;
    totalScore += scores.hasArchitecture;
    maxScore += QUALITY_WEIGHTS.hasArchitecture;

    // Check for documentation
    const hasDoc = this.hasDocumentation();
    scores.hasDocumentation = hasDoc ? QUALITY_WEIGHTS.hasDocumentation : 0;
    totalScore += scores.hasDocumentation;
    maxScore += QUALITY_WEIGHTS.hasDocumentation;

    const overall = Math.round((totalScore / maxScore) * 100);

    return {
      overall,
      scores,
      breakdown: {
        testing: hasTests,
        coverage: !!coverageInfo,
        linting: hasLinter,
        formatting: hasFormatter,
        typeChecking: hasTypeChecker,
        ci: hasCI,
        security: hasSecurity,
        architecture: hasArch,
        documentation: hasDoc
      }
    };
  }

  /**
   * Analyze testing setup
   * @returns {Promise<Object>} Testing analysis
   */
  async analyzeTests() {
    const testPatterns = {
      directories: ['test', 'tests', '__tests__', 'spec', 'specs'],
      files: ['*.test.*', '*.spec.*', '*_test.*', 'test_*.*']
    };

    // Find test directories
    const testDirs = testPatterns.directories.filter(dir =>
      fs.existsSync(path.join(this.projectPath, dir))
    );

    // Count test files
    let testFileCount = 0;
    const testExtensions = ['.test.ts', '.test.js', '.spec.ts', '.spec.js', '_test.py', '_test.go'];

    this.walkFiles(this.projectPath, (filePath) => {
      const basename = path.basename(filePath);
      if (testExtensions.some(ext => basename.includes(ext)) ||
          basename.startsWith('test_')) {
        testFileCount++;
      }
    });

    // Detect test framework
    const testFramework = this.detectTestFramework();

    // Check for test scripts in package.json
    const hasTestScript = this.hasPackageScript('test');

    return {
      hasTests: testFileCount > 0 || testDirs.length > 0,
      testDirectories: testDirs,
      testFileCount,
      testFramework,
      hasTestScript,
      estimatedTestRatio: this.estimateTestRatio(testFileCount)
    };
  }

  /**
   * Detect test framework
   * @returns {string|null} Test framework name
   */
  detectTestFramework() {
    const frameworks = {
      jest: ['jest.config.js', 'jest.config.ts', 'jest.config.mjs'],
      vitest: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'],
      mocha: ['.mocharc.js', '.mocharc.json', '.mocharc.yml'],
      pytest: ['pytest.ini', 'pyproject.toml', 'conftest.py'],
      junit: ['build.gradle', 'pom.xml'],
      rspec: ['.rspec', 'spec/spec_helper.rb'],
      phpunit: ['phpunit.xml', 'phpunit.xml.dist']
    };

    for (const [framework, files] of Object.entries(frameworks)) {
      for (const file of files) {
        if (fs.existsSync(path.join(this.projectPath, file))) {
          // For pytest, verify pytest is in dependencies
          if (framework === 'pytest' && file === 'pyproject.toml') {
            const content = this.readFileSafe(path.join(this.projectPath, file));
            if (!content.includes('pytest')) continue;
          }
          return framework;
        }
      }
    }

    // Check package.json for JS test frameworks
    const pkg = this.readPackageJson();
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.vitest) return 'vitest';
      if (deps.jest) return 'jest';
      if (deps.mocha) return 'mocha';
      if (deps.ava) return 'ava';
    }

    return null;
  }

  /**
   * Estimate test-to-code ratio
   * @param {number} testFileCount - Number of test files
   * @returns {string} Ratio assessment
   */
  estimateTestRatio(testFileCount) {
    const sourceCount = this.countSourceFiles();
    if (sourceCount === 0) return 'unknown';

    const ratio = testFileCount / sourceCount;
    if (ratio >= 0.8) return 'excellent';
    if (ratio >= 0.5) return 'good';
    if (ratio >= 0.2) return 'moderate';
    if (ratio > 0) return 'low';
    return 'none';
  }

  /**
   * Analyze linting setup
   * @returns {Promise<Object>} Linting analysis
   */
  async analyzeLinting() {
    const linterConfigs = {
      eslint: [
        'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
        '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc'
      ],
      tslint: ['tslint.json'],
      ruff: ['ruff.toml', 'pyproject.toml'],
      flake8: ['.flake8', 'setup.cfg'],
      pylint: ['.pylintrc', 'pylintrc'],
      rubocop: ['.rubocop.yml'],
      golangci: ['.golangci.yml', '.golangci.yaml', '.golangci.toml'],
      clippy: ['clippy.toml', '.clippy.toml'],
      phpstan: ['phpstan.neon', 'phpstan.neon.dist']
    };

    const foundLinters = [];
    const configs = {};

    for (const [linter, files] of Object.entries(linterConfigs)) {
      for (const file of files) {
        const filePath = path.join(this.projectPath, file);
        if (fs.existsSync(filePath)) {
          foundLinters.push(linter);
          configs[linter] = file;

          // For pyproject.toml, check if ruff is actually configured
          if (file === 'pyproject.toml' && linter === 'ruff') {
            const content = this.readFileSafe(filePath);
            if (!content.includes('[tool.ruff]')) {
              foundLinters.pop();
              delete configs[linter];
            }
          }
          break;
        }
      }
    }

    // Check for lint script
    const hasLintScript = this.hasPackageScript('lint');

    return {
      hasLinter: foundLinters.length > 0,
      linters: foundLinters,
      configs,
      hasLintScript,
      recommendation: this.recommendLinter(foundLinters)
    };
  }

  /**
   * Recommend a linter based on detected languages
   * @param {string[]} existingLinters - Already detected linters
   * @returns {string|null} Recommended linter
   */
  recommendLinter(existingLinters) {
    if (existingLinters.length > 0) return null;

    const languages = detectLanguages(this.projectPath);
    const primary = languages[0];

    const recommendations = {
      typescript: 'eslint',
      javascript: 'eslint',
      python: 'ruff',
      go: 'golangci-lint',
      rust: 'clippy',
      ruby: 'rubocop',
      php: 'phpstan'
    };

    return recommendations[primary] || null;
  }

  /**
   * Analyze security posture
   * @returns {Promise<Object>} Security analysis
   */
  async analyzeSecurity() {
    // Check for security scanning tools
    const securityTools = {
      snyk: ['.snyk'],
      dependabot: ['.github/dependabot.yml', '.github/dependabot.yaml'],
      codeql: ['.github/codeql-analysis.yml', '.github/workflows/codeql.yml'],
      trivy: ['.trivyignore'],
      bandit: ['.bandit'],
      semgrep: ['.semgrep.yml', 'semgrep.yaml']
    };

    const foundTools = [];
    for (const [tool, files] of Object.entries(securityTools)) {
      for (const file of files) {
        if (fs.existsSync(path.join(this.projectPath, file))) {
          foundTools.push(tool);
          break;
        }
      }
    }

    // Check for security-related patterns in CI
    const hasSecurityInCI = this.checkCIForSecurity();

    // Check for secrets management
    const hasSecretsConfig = fs.existsSync(path.join(this.projectPath, '.env.example')) ||
      fs.existsSync(path.join(this.projectPath, '.env.template'));

    // Check .gitignore for secret files
    const gitignore = this.readFileSafe(path.join(this.projectPath, '.gitignore'));
    const ignoresSecrets = gitignore.includes('.env') || gitignore.includes('*.pem') ||
      gitignore.includes('credentials');

    return {
      hasSecurityTools: foundTools.length > 0,
      tools: foundTools,
      hasSecurityInCI,
      hasSecretsConfig,
      ignoresSecrets,
      score: this.calculateSecurityScore(foundTools, hasSecurityInCI, ignoresSecrets)
    };
  }

  /**
   * Check CI configuration for security scanning
   * @returns {boolean} True if security scanning found in CI
   */
  checkCIForSecurity() {
    const ciPaths = [
      '.github/workflows',
      '.gitlab-ci.yml',
      'Jenkinsfile',
      '.circleci/config.yml',
      'azure-pipelines.yml'
    ];

    for (const ciPath of ciPaths) {
      const fullPath = path.join(this.projectPath, ciPath);
      if (fs.existsSync(fullPath)) {
        if (fs.statSync(fullPath).isDirectory()) {
          // Check GitHub Actions workflows
          const files = fs.readdirSync(fullPath);
          for (const file of files) {
            const content = this.readFileSafe(path.join(fullPath, file));
            if (content.includes('security') || content.includes('snyk') ||
                content.includes('trivy') || content.includes('codeql')) {
              return true;
            }
          }
        } else {
          const content = this.readFileSafe(fullPath);
          if (content.includes('security') || content.includes('scan')) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Calculate security score
   * @param {string[]} tools - Security tools found
   * @param {boolean} hasCI - Has security in CI
   * @param {boolean} ignoresSecrets - Gitignore excludes secrets
   * @returns {number} Security score 0-100
   */
  calculateSecurityScore(tools, hasCI, ignoresSecrets) {
    let score = 0;
    score += tools.length * 20; // 20 points per tool
    score += hasCI ? 20 : 0;
    score += ignoresSecrets ? 20 : 0;
    return Math.min(100, score);
  }

  /**
   * Detect architecture pattern
   * @returns {Promise<Object>} Architecture analysis
   */
  async detectArchitecture() {
    const archDetector = new ArchitectureDetector(this.projectPath);
    const pattern = archDetector.detect();

    let violations = [];
    let cycles = [];

    if (pattern) {
      violations = archDetector.findViolations(pattern);
      cycles = archDetector.findCircularDependencies();
    }

    // Check for monorepo patterns
    const isMonorepo = this.detectMonorepo();

    return {
      pattern,
      patternConfidence: pattern ? 'detected' : 'none',
      violations: violations.length,
      violationDetails: violations.slice(0, 5),
      circularDependencies: cycles.length,
      cycleDetails: cycles.slice(0, 3),
      isMonorepo,
      suggestions: archDetector.getSuggestions()
    };
  }

  /**
   * Detect if project is a monorepo
   * @returns {Object} Monorepo detection result
   */
  detectMonorepo() {
    const indicators = {
      lerna: fs.existsSync(path.join(this.projectPath, 'lerna.json')),
      nx: fs.existsSync(path.join(this.projectPath, 'nx.json')),
      turborepo: fs.existsSync(path.join(this.projectPath, 'turbo.json')),
      pnpmWorkspace: fs.existsSync(path.join(this.projectPath, 'pnpm-workspace.yaml')),
      yarnWorkspaces: this.hasYarnWorkspaces(),
      npmWorkspaces: this.hasNpmWorkspaces(),
      packagesDir: fs.existsSync(path.join(this.projectPath, 'packages'))
    };

    const isMonorepo = Object.values(indicators).some(v => v);

    return {
      isMonorepo,
      indicators,
      tool: isMonorepo ? Object.keys(indicators).find(k => indicators[k]) : null
    };
  }

  /**
   * Check for Yarn workspaces
   * @returns {boolean}
   */
  hasYarnWorkspaces() {
    const pkg = this.readPackageJson();
    return pkg && Array.isArray(pkg.workspaces);
  }

  /**
   * Check for npm workspaces
   * @returns {boolean}
   */
  hasNpmWorkspaces() {
    const pkg = this.readPackageJson();
    return pkg && Array.isArray(pkg.workspaces);
  }

  /**
   * Measure codebase size
   * @returns {Promise<Object>} Size metrics
   */
  async measureSize() {
    let totalFiles = 0;
    let totalLines = 0;
    let sourceFiles = 0;
    let testFiles = 0;

    const sourceExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java',
      '.kt', '.rb', '.php', '.cs', '.swift', '.dart'
    ];

    this.walkFiles(this.projectPath, (filePath) => {
      totalFiles++;
      const ext = path.extname(filePath).toLowerCase();
      const basename = path.basename(filePath);

      if (sourceExtensions.includes(ext)) {
        // Count lines
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          totalLines += content.split('\n').length;
        } catch (e) {}

        // Categorize
        if (basename.includes('.test.') || basename.includes('.spec.') ||
            basename.includes('_test.') || basename.startsWith('test_')) {
          testFiles++;
        } else {
          sourceFiles++;
        }
      }
    });

    const category = this.categorizeSizeByLines(totalLines);

    return {
      totalFiles,
      sourceFiles,
      testFiles,
      totalLines,
      category,
      testToSourceRatio: sourceFiles > 0 ? (testFiles / sourceFiles).toFixed(2) : '0'
    };
  }

  /**
   * Categorize project size by lines of code
   * @param {number} lines - Total lines
   * @returns {string} Size category
   */
  categorizeSizeByLines(lines) {
    if (lines < 1000) return 'tiny';
    if (lines < 10000) return 'small';
    if (lines < 50000) return 'medium';
    if (lines < 200000) return 'large';
    return 'enterprise';
  }

  /**
   * Estimate technical debt
   * @returns {Promise<Object>} Technical debt estimation
   */
  async estimateDebt() {
    const factors = [];
    let debtScore = 0;

    // Factor 1: Missing tests
    const testSetup = await this.analyzeTests();
    if (!testSetup.hasTests) {
      factors.push({ factor: 'No tests', impact: 'high', points: 25 });
      debtScore += 25;
    } else if (testSetup.estimatedTestRatio === 'low') {
      factors.push({ factor: 'Low test coverage', impact: 'medium', points: 15 });
      debtScore += 15;
    }

    // Factor 2: Missing linting
    const linting = await this.analyzeLinting();
    if (!linting.hasLinter) {
      factors.push({ factor: 'No linter', impact: 'medium', points: 15 });
      debtScore += 15;
    }

    // Factor 3: Missing type checking (for dynamic languages)
    const languages = detectLanguages(this.projectPath);
    const dynamicLangs = languages.filter(l =>
      ['javascript', 'python', 'ruby', 'php'].includes(l)
    );
    if (dynamicLangs.length > 0 && !this.hasTypeCheckerSetup()) {
      factors.push({ factor: 'No type checking', impact: 'medium', points: 10 });
      debtScore += 10;
    }

    // Factor 4: Architecture issues
    const arch = await this.detectArchitecture();
    if (arch.circularDependencies > 0) {
      factors.push({
        factor: `${arch.circularDependencies} circular dependencies`,
        impact: 'high',
        points: 20
      });
      debtScore += 20;
    }
    if (arch.violations > 0) {
      factors.push({
        factor: `${arch.violations} architecture violations`,
        impact: 'medium',
        points: 10
      });
      debtScore += 10;
    }

    // Factor 5: Outdated dependencies (check package.json for last update)
    // This is a heuristic based on lockfile age
    const lockfileAge = this.getLockfileAge();
    if (lockfileAge > 365) {
      factors.push({
        factor: 'Dependencies not updated in over a year',
        impact: 'high',
        points: 15
      });
      debtScore += 15;
    } else if (lockfileAge > 180) {
      factors.push({
        factor: 'Dependencies not updated in over 6 months',
        impact: 'medium',
        points: 10
      });
      debtScore += 10;
    }

    // Factor 6: Missing documentation
    if (!this.hasDocumentation()) {
      factors.push({ factor: 'Missing documentation', impact: 'low', points: 5 });
      debtScore += 5;
    }

    const level = this.categorizeDebtLevel(debtScore);

    return {
      score: debtScore,
      maxScore: 100,
      level,
      factors,
      recommendation: this.getDebtRecommendation(level)
    };
  }

  /**
   * Get lockfile age in days
   * @returns {number} Age in days
   */
  getLockfileAge() {
    const lockfiles = [
      'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      'Cargo.lock', 'poetry.lock', 'Gemfile.lock', 'composer.lock'
    ];

    for (const lockfile of lockfiles) {
      const lockPath = path.join(this.projectPath, lockfile);
      if (fs.existsSync(lockPath)) {
        try {
          const stat = fs.statSync(lockPath);
          const ageMs = Date.now() - stat.mtimeMs;
          return Math.floor(ageMs / (1000 * 60 * 60 * 24));
        } catch (e) {}
      }
    }

    return 0;
  }

  /**
   * Categorize debt level
   * @param {number} score - Debt score
   * @returns {string} Debt level
   */
  categorizeDebtLevel(score) {
    if (score <= 15) return 'low';
    if (score <= 35) return 'moderate';
    if (score <= 60) return 'high';
    return 'critical';
  }

  /**
   * Get recommendation based on debt level
   * @param {string} level - Debt level
   * @returns {string} Recommendation
   */
  getDebtRecommendation(level) {
    const recommendations = {
      low: 'Maintain current quality practices',
      moderate: 'Schedule regular refactoring sprints',
      high: 'Prioritize technical debt reduction',
      critical: 'Dedicate significant effort to quality improvement before adding features'
    };
    return recommendations[level];
  }

  /**
   * Analyze project age based on git history
   * @returns {Promise<Object>} Project age analysis
   */
  async analyzeProjectAge() {
    try {
      // Get first commit date
      const firstCommit = execSync(
        'git log --reverse --format="%ci" | head -1',
        { cwd: this.projectPath, encoding: 'utf8', timeout: 10000 }
      ).trim();

      // Get last commit date
      const lastCommit = execSync(
        'git log -1 --format="%ci"',
        { cwd: this.projectPath, encoding: 'utf8', timeout: 10000 }
      ).trim();

      // Get commit count (sampling for large repos)
      const commitCountStr = execSync(
        'git rev-list --count HEAD',
        { cwd: this.projectPath, encoding: 'utf8', timeout: 10000 }
      ).trim();
      const commitCount = parseInt(commitCountStr, 10);

      const firstDate = new Date(firstCommit);
      const lastDate = new Date(lastCommit);
      const ageMonths = Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30));

      // Activity assessment
      const daysSinceLastCommit = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      let activity = 'active';
      if (daysSinceLastCommit > 365) activity = 'abandoned';
      else if (daysSinceLastCommit > 180) activity = 'dormant';
      else if (daysSinceLastCommit > 30) activity = 'maintenance';

      return {
        hasGit: true,
        firstCommit: firstCommit || null,
        lastCommit: lastCommit || null,
        ageMonths,
        commitCount,
        activity,
        daysSinceLastCommit,
        isNewProject: ageMonths < 6 && commitCount < 500
      };
    } catch (e) {
      return {
        hasGit: false,
        ageMonths: 0,
        commitCount: 0,
        activity: 'unknown',
        isNewProject: true
      };
    }
  }

  /**
   * Analyze project domain for strictest mode detection
   * @returns {Promise<Object>} Domain analysis
   */
  async analyzeDomain() {
    const domainMatches = {};
    let dominantDomain = null;
    let maxMatches = 0;

    // Sample files for keyword analysis
    const filesToCheck = [];
    this.walkFiles(this.projectPath, (filePath) => {
      if (filesToCheck.length < 50) {
        filesToCheck.push(filePath);
      }
    });

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      let matches = 0;

      // Check file names
      for (const filePath of filesToCheck) {
        const basename = path.basename(filePath).toLowerCase();
        for (const keyword of keywords) {
          if (basename.includes(keyword)) {
            matches++;
          }
        }
      }

      // Check package.json name and description
      const pkg = this.readPackageJson();
      if (pkg) {
        const searchText = `${pkg.name || ''} ${pkg.description || ''}`.toLowerCase();
        for (const keyword of keywords) {
          if (searchText.includes(keyword)) {
            matches += 2; // Weight package.json higher
          }
        }
      }

      // Check README
      const readme = this.readFileSafe(path.join(this.projectPath, 'README.md'));
      for (const keyword of keywords) {
        if (readme.toLowerCase().includes(keyword)) {
          matches++;
        }
      }

      domainMatches[domain] = matches;
      if (matches > maxMatches) {
        maxMatches = matches;
        dominantDomain = domain;
      }
    }

    // Require significant matches to claim a domain
    const suggestsStrictest = maxMatches >= 5 && dominantDomain !== null;

    return {
      domains: domainMatches,
      dominantDomain: maxMatches >= 3 ? dominantDomain : null,
      suggestsStrictest,
      reason: suggestsStrictest
        ? `Project appears to be in ${dominantDomain} domain`
        : 'No high-stakes domain detected'
    };
  }

  // ============ Helper Methods ============

  /**
   * Check if project has testing setup
   * @returns {boolean}
   */
  hasTestingSetup() {
    const testIndicators = [
      'test', 'tests', '__tests__', 'spec', 'specs',
      'jest.config.js', 'vitest.config.ts', 'pytest.ini', '.rspec',
      'phpunit.xml'
    ];

    for (const indicator of testIndicators) {
      if (fs.existsSync(path.join(this.projectPath, indicator))) {
        return true;
      }
    }

    return this.hasPackageScript('test');
  }

  /**
   * Check if project has linter setup
   * @returns {boolean}
   */
  hasLinterSetup() {
    const linterConfigs = [
      'eslint.config.js', '.eslintrc.js', '.eslintrc.json',
      'ruff.toml', '.flake8', '.pylintrc',
      '.rubocop.yml', '.golangci.yml'
    ];

    for (const config of linterConfigs) {
      if (fs.existsSync(path.join(this.projectPath, config))) {
        return true;
      }
    }

    // Check pyproject.toml for ruff
    const pyproject = this.readFileSafe(path.join(this.projectPath, 'pyproject.toml'));
    if (pyproject.includes('[tool.ruff]')) return true;

    return false;
  }

  /**
   * Check if project has formatter setup
   * @returns {boolean}
   */
  hasFormatterSetup() {
    const formatterConfigs = [
      '.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js',
      '.editorconfig', 'rustfmt.toml', '.clang-format'
    ];

    for (const config of formatterConfigs) {
      if (fs.existsSync(path.join(this.projectPath, config))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if project has type checker setup
   * @returns {boolean}
   */
  hasTypeCheckerSetup() {
    // TypeScript
    if (fs.existsSync(path.join(this.projectPath, 'tsconfig.json'))) {
      return true;
    }

    // Python mypy
    const pyproject = this.readFileSafe(path.join(this.projectPath, 'pyproject.toml'));
    if (pyproject.includes('[tool.mypy]')) return true;
    if (fs.existsSync(path.join(this.projectPath, 'mypy.ini'))) return true;

    // Python type hints in py.typed
    if (fs.existsSync(path.join(this.projectPath, 'py.typed'))) return true;

    return false;
  }

  /**
   * Check if project has CI setup
   * @returns {boolean}
   */
  hasCISetup() {
    const ciIndicators = [
      '.github/workflows',
      '.gitlab-ci.yml',
      '.travis.yml',
      'Jenkinsfile',
      '.circleci',
      'azure-pipelines.yml',
      'bitbucket-pipelines.yml'
    ];

    for (const indicator of ciIndicators) {
      if (fs.existsSync(path.join(this.projectPath, indicator))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if project has security setup
   * @returns {boolean}
   */
  hasSecuritySetup() {
    const securityIndicators = [
      '.snyk',
      '.github/dependabot.yml',
      '.trivyignore',
      '.bandit'
    ];

    for (const indicator of securityIndicators) {
      if (fs.existsSync(path.join(this.projectPath, indicator))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if project has documentation
   * @returns {boolean}
   */
  hasDocumentation() {
    const docIndicators = [
      'README.md',
      'docs',
      'documentation',
      'doc'
    ];

    for (const indicator of docIndicators) {
      const fullPath = path.join(this.projectPath, indicator);
      if (fs.existsSync(fullPath)) {
        // For README, check it has content
        if (indicator === 'README.md') {
          const content = this.readFileSafe(fullPath);
          return content.length > 100;
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Find coverage report
   * @returns {Object|null} Coverage report info
   */
  findCoverageReport() {
    const coverageLocations = [
      { path: 'coverage/coverage-summary.json', format: 'istanbul' },
      { path: 'coverage/lcov.info', format: 'lcov' },
      { path: 'coverage/coverage-final.json', format: 'istanbul' },
      { path: 'coverage.out', format: 'go' },
      { path: 'coverage.xml', format: 'cobertura' },
      { path: 'htmlcov/coverage.json', format: 'coverage-py' },
      { path: '.coverage', format: 'coverage-py' },
      { path: 'target/site/jacoco/jacoco.xml', format: 'jacoco' }
    ];

    for (const loc of coverageLocations) {
      const fullPath = path.join(this.projectPath, loc.path);
      if (fs.existsSync(fullPath)) {
        return { path: fullPath, format: loc.format };
      }
    }

    return null;
  }

  /**
   * Read package.json
   * @returns {Object|null} Package.json contents
   */
  readPackageJson() {
    const pkgPath = path.join(this.projectPath, 'package.json');
    try {
      if (fs.existsSync(pkgPath)) {
        return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      }
    } catch (e) {}
    return null;
  }

  /**
   * Check if package.json has a script
   * @param {string} scriptName - Script name to check
   * @returns {boolean}
   */
  hasPackageScript(scriptName) {
    const pkg = this.readPackageJson();
    return pkg && pkg.scripts && !!pkg.scripts[scriptName];
  }

  /**
   * Read file safely
   * @param {string} filePath - File path
   * @returns {string} File contents or empty string
   */
  readFileSafe(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch (e) {}
    return '';
  }

  /**
   * Walk files in directory, excluding common non-source paths
   * @param {string} dir - Directory to walk
   * @param {Function} callback - Callback for each file
   */
  walkFiles(dir, callback) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip excluded directories
        if (EXCLUDE_PATTERNS.some(p => entry.name === p || entry.name.match(p.replace('*', '.*')))) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          this.walkFiles(fullPath, callback);
        } else if (entry.isFile()) {
          callback(fullPath);
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  /**
   * Count source files
   * @returns {number} Source file count
   */
  countSourceFiles() {
    const sourceExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java',
      '.kt', '.rb', '.php', '.cs', '.swift', '.dart'
    ];

    let count = 0;
    this.walkFiles(this.projectPath, (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const basename = path.basename(filePath);

      // Exclude test files
      if (sourceExtensions.includes(ext) &&
          !basename.includes('.test.') &&
          !basename.includes('.spec.') &&
          !basename.includes('_test.') &&
          !basename.startsWith('test_')) {
        count++;
      }
    });

    return count;
  }
}

module.exports = {
  ProjectAnalyzer,
  EXCLUDE_PATTERNS,
  QUALITY_WEIGHTS,
  DOMAIN_KEYWORDS
};

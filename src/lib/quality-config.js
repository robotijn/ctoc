/**
 * Quality Config Loader
 * Loads and applies quality configurations per language/mode
 *
 * This module provides the core infrastructure for CTOC's strict quality enforcement
 * across 20 programming languages with three quality modes: strict, strictest, and legacy.
 */

const fs = require('fs');
const path = require('path');

/**
 * Quality modes available for each language
 * @type {string[]}
 */
const MODES = ['strict', 'strictest', 'legacy'];

/**
 * Target languages for quality enforcement (20 total)
 * @type {string[]}
 */
const LANGUAGES = [
  'typescript', 'python', 'java', 'go', 'rust', 'csharp',
  'php', 'ruby', 'swift', 'kotlin', 'cpp', 'c', 'scala',
  'dart', 'elixir', 'clojure', 'haskell', 'lua', 'r', 'julia'
];

/**
 * Language detection markers - files that indicate a language is used
 * @type {Object.<string, string[]>}
 */
const LANGUAGE_MARKERS = {
  typescript: ['tsconfig.json', 'package.json'],
  python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  go: ['go.mod', 'go.sum'],
  rust: ['Cargo.toml'],
  csharp: ['*.csproj', '*.sln'],
  php: ['composer.json'],
  ruby: ['Gemfile', 'Rakefile', '*.gemspec'],
  swift: ['Package.swift', '*.xcodeproj', '*.xcworkspace'],
  kotlin: ['build.gradle.kts', '*.kt'],
  cpp: ['CMakeLists.txt', 'Makefile', '*.cpp', '*.hpp'],
  c: ['CMakeLists.txt', 'Makefile', '*.c', '*.h'],
  scala: ['build.sbt', '*.scala'],
  dart: ['pubspec.yaml'],
  elixir: ['mix.exs'],
  clojure: ['project.clj', 'deps.edn'],
  haskell: ['*.cabal', 'stack.yaml', 'package.yaml'],
  lua: ['*.lua', '.luacheckrc'],
  r: ['DESCRIPTION', '*.R', '*.Rmd'],
  julia: ['Project.toml', '*.jl']
};

/**
 * Coverage thresholds per mode
 * @type {Object.<string, Object>}
 */
const COVERAGE_THRESHOLDS = {
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
 * Complexity limits (same for all modes in strict, relaxed in legacy)
 * @type {Object.<string, Object>}
 */
const COMPLEXITY_LIMITS = {
  strict: {
    cyclomatic: 10,
    cognitive: 15,
    functionLength: 50,
    fileLength: 400,
    parameters: 4,
    nestingDepth: 4
  },
  strictest: {
    cyclomatic: 7,
    cognitive: 10,
    functionLength: 30,
    fileLength: 300,
    parameters: 3,
    nestingDepth: 3
  },
  legacy: {
    cyclomatic: 15,
    cognitive: 20,
    functionLength: 100,
    fileLength: 600,
    parameters: 6,
    nestingDepth: 6
  }
};

/**
 * Language-specific linter configurations
 * @type {Object.<string, Object>}
 */
const LINTER_CONFIGS = {
  typescript: {
    linter: 'eslint',
    linterConfig: 'eslint.config.js',
    formatter: 'prettier',
    formatterConfig: '.prettierrc',
    typeChecker: 'tsc',
    typeCheckerConfig: 'tsconfig.json',
    testFramework: 'vitest',
    coverageTool: 'istanbul'
  },
  python: {
    linter: 'ruff',
    linterConfig: 'ruff.toml',
    formatter: 'ruff',
    formatterConfig: 'ruff.toml',
    typeChecker: 'mypy',
    typeCheckerConfig: 'pyproject.toml',
    testFramework: 'pytest',
    coverageTool: 'coverage-py'
  },
  java: {
    linter: 'checkstyle',
    linterConfig: 'checkstyle.xml',
    formatter: 'google-java-format',
    formatterConfig: null,
    typeChecker: 'javac',
    typeCheckerConfig: null,
    testFramework: 'junit5',
    coverageTool: 'jacoco'
  },
  go: {
    linter: 'golangci-lint',
    linterConfig: '.golangci.yml',
    formatter: 'gofmt',
    formatterConfig: null,
    typeChecker: 'go vet',
    typeCheckerConfig: null,
    testFramework: 'go test',
    coverageTool: 'go cover'
  },
  rust: {
    linter: 'clippy',
    linterConfig: 'clippy.toml',
    formatter: 'rustfmt',
    formatterConfig: 'rustfmt.toml',
    typeChecker: 'rustc',
    typeCheckerConfig: null,
    testFramework: 'cargo test',
    coverageTool: 'llvm-cov'
  },
  csharp: {
    linter: 'roslyn-analyzers',
    linterConfig: '.editorconfig',
    formatter: 'dotnet format',
    formatterConfig: '.editorconfig',
    typeChecker: 'csc',
    typeCheckerConfig: null,
    testFramework: 'xunit',
    coverageTool: 'coverlet'
  },
  php: {
    linter: 'phpstan',
    linterConfig: 'phpstan.neon',
    formatter: 'php-cs-fixer',
    formatterConfig: '.php-cs-fixer.php',
    typeChecker: 'phpstan',
    typeCheckerConfig: 'phpstan.neon',
    testFramework: 'phpunit',
    coverageTool: 'phpunit'
  },
  ruby: {
    linter: 'rubocop',
    linterConfig: '.rubocop.yml',
    formatter: 'rubocop',
    formatterConfig: '.rubocop.yml',
    typeChecker: 'sorbet',
    typeCheckerConfig: 'sorbet/config',
    testFramework: 'rspec',
    coverageTool: 'simplecov'
  },
  swift: {
    linter: 'swiftlint',
    linterConfig: '.swiftlint.yml',
    formatter: 'swift-format',
    formatterConfig: '.swift-format',
    typeChecker: 'swiftc',
    typeCheckerConfig: null,
    testFramework: 'xctest',
    coverageTool: 'llvm-cov'
  },
  kotlin: {
    linter: 'detekt',
    linterConfig: 'detekt.yml',
    formatter: 'ktlint',
    formatterConfig: '.editorconfig',
    typeChecker: 'kotlinc',
    typeCheckerConfig: null,
    testFramework: 'junit5',
    coverageTool: 'jacoco'
  },
  cpp: {
    linter: 'clang-tidy',
    linterConfig: '.clang-tidy',
    formatter: 'clang-format',
    formatterConfig: '.clang-format',
    typeChecker: 'clang++',
    typeCheckerConfig: null,
    testFramework: 'googletest',
    coverageTool: 'llvm-cov'
  },
  c: {
    linter: 'clang-tidy',
    linterConfig: '.clang-tidy',
    formatter: 'clang-format',
    formatterConfig: '.clang-format',
    typeChecker: 'clang',
    typeCheckerConfig: null,
    testFramework: 'unity',
    coverageTool: 'llvm-cov'
  },
  scala: {
    linter: 'scalafix',
    linterConfig: '.scalafix.conf',
    formatter: 'scalafmt',
    formatterConfig: '.scalafmt.conf',
    typeChecker: 'scalac',
    typeCheckerConfig: null,
    testFramework: 'scalatest',
    coverageTool: 'scoverage'
  },
  dart: {
    linter: 'dart analyze',
    linterConfig: 'analysis_options.yaml',
    formatter: 'dart format',
    formatterConfig: null,
    typeChecker: 'dart analyze',
    typeCheckerConfig: 'analysis_options.yaml',
    testFramework: 'flutter test',
    coverageTool: 'dart coverage'
  },
  elixir: {
    linter: 'credo',
    linterConfig: '.credo.exs',
    formatter: 'mix format',
    formatterConfig: '.formatter.exs',
    typeChecker: 'dialyzer',
    typeCheckerConfig: null,
    testFramework: 'exunit',
    coverageTool: 'excoveralls'
  },
  clojure: {
    linter: 'clj-kondo',
    linterConfig: '.clj-kondo/config.edn',
    formatter: 'cljfmt',
    formatterConfig: '.cljfmt.edn',
    typeChecker: 'clj-kondo',
    typeCheckerConfig: '.clj-kondo/config.edn',
    testFramework: 'clojure.test',
    coverageTool: 'cloverage'
  },
  haskell: {
    linter: 'hlint',
    linterConfig: 'hlint.yaml',
    formatter: 'ormolu',
    formatterConfig: null,
    typeChecker: 'ghc',
    typeCheckerConfig: null,
    testFramework: 'hspec',
    coverageTool: 'hpc'
  },
  lua: {
    linter: 'luacheck',
    linterConfig: '.luacheckrc',
    formatter: 'stylua',
    formatterConfig: 'stylua.toml',
    typeChecker: 'luacheck',
    typeCheckerConfig: '.luacheckrc',
    testFramework: 'busted',
    coverageTool: 'luacov'
  },
  r: {
    linter: 'lintr',
    linterConfig: '.lintr',
    formatter: 'styler',
    formatterConfig: null,
    typeChecker: 'lintr',
    typeCheckerConfig: '.lintr',
    testFramework: 'testthat',
    coverageTool: 'covr'
  },
  julia: {
    linter: 'JuliaLint',
    linterConfig: null,
    formatter: 'JuliaFormatter',
    formatterConfig: 'JuliaFormatter.toml',
    typeChecker: 'julia',
    typeCheckerConfig: null,
    testFramework: 'Test',
    coverageTool: 'Coverage.jl'
  }
};

/**
 * Quality Configuration Manager
 * Loads and applies quality configurations per language/mode
 */
class QualityConfig {
  /**
   * Create a QualityConfig instance
   * @param {string} projectRoot - Root directory of the project
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..', '..');
  }

  /**
   * Detect project language(s) based on marker files
   * @returns {string[]} Array of detected languages
   */
  detectLanguages() {
    const detected = [];

    for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
      for (const marker of markers) {
        if (this.fileExists(marker)) {
          if (!detected.includes(lang)) {
            detected.push(lang);
          }
          break;
        }
      }
    }

    return detected;
  }

  /**
   * Check if a file exists in the project (supports glob patterns)
   * @param {string} pattern - File name or glob pattern
   * @returns {boolean} True if file exists
   */
  fileExists(pattern) {
    // Handle glob patterns
    if (pattern.includes('*')) {
      const basePattern = pattern.replace(/\*/g, '');
      try {
        const files = fs.readdirSync(this.projectRoot);
        return files.some(f => {
          if (pattern.startsWith('*.')) {
            return f.endsWith(basePattern);
          }
          return f.includes(basePattern);
        });
      } catch (e) {
        return false;
      }
    }

    // Handle exact file names
    const filePath = path.join(this.projectRoot, pattern);
    return fs.existsSync(filePath);
  }

  /**
   * Get quality configuration for a language/mode combination
   * @param {string} language - Target language
   * @param {string} mode - Quality mode (strict, strictest, legacy)
   * @returns {Object} Quality configuration object
   * @throws {Error} If language or mode is invalid
   */
  getConfig(language, mode = 'strict') {
    if (!LANGUAGES.includes(language)) {
      throw new Error(`Unknown language: ${language}. Valid languages: ${LANGUAGES.join(', ')}`);
    }

    if (!MODES.includes(mode)) {
      throw new Error(`Unknown mode: ${mode}. Valid modes: ${MODES.join(', ')}`);
    }

    const linterConfig = LINTER_CONFIGS[language];
    const coverage = COVERAGE_THRESHOLDS[mode];
    const complexity = COMPLEXITY_LIMITS[mode];

    return {
      language,
      mode,
      ...linterConfig,
      coverage,
      complexity
    };
  }

  /**
   * Load quality config skill content from markdown file
   * @param {string} language - Target language
   * @param {string} mode - Quality mode
   * @returns {string|null} Skill content or null if not found
   */
  loadSkillContent(language, mode = 'strict') {
    const skillPath = path.join(
      this.pluginRoot,
      'skills',
      'quality-configs',
      language,
      `${mode}.md`
    );

    if (fs.existsSync(skillPath)) {
      return fs.readFileSync(skillPath, 'utf8');
    }

    return null;
  }

  /**
   * Generate install command for quality tools
   * @param {string} language - Target language
   * @returns {string} Install command
   */
  getInstallCommand(language) {
    const commands = {
      typescript: 'npm install -D typescript eslint @eslint/js typescript-eslint eslint-config-prettier eslint-plugin-import vitest @vitest/coverage-v8 prettier',
      python: 'uv add --dev ruff mypy pytest pytest-cov',
      java: 'mvn dependency:copy-dependencies -DincludeScope=test',
      go: 'go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest',
      rust: 'rustup component add clippy rustfmt',
      csharp: 'dotnet add package coverlet.collector',
      php: 'composer require --dev phpstan/phpstan friendsofphp/php-cs-fixer phpunit/phpunit',
      ruby: 'bundle add rubocop rspec simplecov --group development,test',
      swift: 'brew install swiftlint swift-format',
      kotlin: 'gradle dependencies',
      cpp: 'apt-get install clang-tidy clang-format',
      c: 'apt-get install clang-tidy clang-format',
      scala: 'sbt compile',
      dart: 'dart pub get',
      elixir: 'mix deps.get',
      clojure: 'clojure -P',
      haskell: 'cabal update && cabal install hlint ormolu',
      lua: 'luarocks install luacheck',
      r: 'Rscript -e "install.packages(c(\'lintr\', \'styler\', \'testthat\'))"',
      julia: 'julia -e "using Pkg; Pkg.add([\"JuliaFormatter\"])"'
    };

    return commands[language] || `# Install ${language} quality tools`;
  }

  /**
   * Apply quality configuration to project (create config files)
   * @param {string} language - Target language
   * @param {string} mode - Quality mode
   * @returns {Object} Applied configuration details
   */
  async applyConfig(language, mode = 'strict') {
    const config = this.getConfig(language, mode);
    const applied = {
      language,
      mode,
      files: [],
      commands: []
    };

    // Get skill content (config templates)
    const skillContent = this.loadSkillContent(language, mode);
    if (skillContent) {
      // Parse config files from skill content
      const configFiles = this.parseConfigFromSkill(skillContent);
      for (const [filename, content] of Object.entries(configFiles)) {
        const outputPath = path.join(this.projectRoot, filename);
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, content);
        applied.files.push(filename);
      }
    }

    // Add install command
    applied.commands.push(this.getInstallCommand(language));

    return applied;
  }

  /**
   * Parse configuration files from skill markdown content
   * @param {string} skillContent - Markdown skill content
   * @returns {Object.<string, string>} Map of filename to content
   */
  parseConfigFromSkill(skillContent) {
    const configs = {};
    // Match code blocks with filename comments
    const codeBlockRegex = /```(?:javascript|json|toml|yaml|xml|ini|sh)?\n([\s\S]*?)```/g;
    const filenameRegex = /##\s+.*?`([^`]+)`/g;

    let match;
    let lastFilename = null;

    // Look for section headers with filenames
    const sections = skillContent.split(/^##\s+/m);
    for (const section of sections) {
      const filenameMatch = section.match(/.*?`([^`]+)`/);
      if (filenameMatch) {
        lastFilename = filenameMatch[1];
      }

      const codeMatch = section.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (codeMatch && lastFilename) {
        configs[lastFilename] = codeMatch[1].trim();
      }
    }

    return configs;
  }

  /**
   * Validate current project against quality config
   * @param {string} language - Target language
   * @param {string} mode - Quality mode
   * @returns {Object} Validation result with pass/fail and issues
   */
  validate(language, mode = 'strict') {
    const config = this.getConfig(language, mode);
    const issues = [];

    // Check if linter config exists
    if (config.linterConfig) {
      const linterPath = path.join(this.projectRoot, config.linterConfig);
      if (!fs.existsSync(linterPath)) {
        issues.push({
          type: 'missing-config',
          file: config.linterConfig,
          message: `Missing linter configuration: ${config.linterConfig}`
        });
      }
    }

    // Check if type checker config exists
    if (config.typeCheckerConfig) {
      const typeCheckerPath = path.join(this.projectRoot, config.typeCheckerConfig);
      if (!fs.existsSync(typeCheckerPath)) {
        issues.push({
          type: 'missing-config',
          file: config.typeCheckerConfig,
          message: `Missing type checker configuration: ${config.typeCheckerConfig}`
        });
      }
    }

    return {
      pass: issues.length === 0,
      issues,
      config
    };
  }
}

module.exports = {
  QualityConfig,
  MODES,
  LANGUAGES,
  LANGUAGE_MARKERS,
  COVERAGE_THRESHOLDS,
  COMPLEXITY_LIMITS,
  LINTER_CONFIGS
};

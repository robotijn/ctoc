#!/usr/bin/env node
/**
 * Tool Detector
 *
 * Detects test frameworks and quality tools using hybrid approach:
 * 1. User config (.ctoc/quality-config.yaml) - explicit override
 * 2. Auto-detect from project files (package.json, pyproject.toml, etc.)
 * 3. CTOC skills fallback (skills/languages/*.md)
 * 4. Prompt user if still unknown
 */

const safeFs = require('./safe-fs');
const { safeRegExp, escapeRegExp } = require('./regex-utils');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Language detection from project files
 */
const LANGUAGE_MARKERS = {
  javascript: ['package.json'],
  typescript: ['package.json', 'tsconfig.json'],
  python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
  go: ['go.mod', 'go.sum'],
  rust: ['Cargo.toml'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  csharp: ['*.csproj', '*.sln'],
  ruby: ['Gemfile', '*.gemspec'],
  php: ['composer.json']
};

/**
 * Default tools per language
 */
const DEFAULT_TOOLS = {
  javascript: {
    lint: 'eslint .',
    typecheck: null, // JS has no types
    test: 'npm test',
    coverage: 'npm test -- --coverage'
  },
  typescript: {
    lint: 'eslint .',
    typecheck: 'tsc --noEmit',
    test: 'npm test',
    coverage: 'npm test -- --coverage'
  },
  python: {
    lint: 'ruff check .',
    typecheck: 'mypy .',
    test: 'pytest',
    coverage: 'pytest --cov --cov-report=json'
  },
  go: {
    lint: 'golangci-lint run',
    typecheck: 'go build ./...',
    test: 'go test ./...',
    coverage: 'go test -coverprofile=coverage.out ./...'
  },
  rust: {
    lint: 'cargo clippy',
    typecheck: 'cargo check',
    test: 'cargo test',
    coverage: 'cargo tarpaulin --out Json'
  },
  java: {
    lint: './gradlew checkstyleMain || mvn checkstyle:check',
    typecheck: './gradlew compileJava || mvn compile',
    test: './gradlew test || mvn test',
    coverage: './gradlew jacocoTestReport || mvn jacoco:report'
  },
  ruby: {
    lint: 'rubocop',
    typecheck: 'sorbet tc',
    test: 'bundle exec rspec',
    coverage: 'COVERAGE=true bundle exec rspec'
  }
};

/**
 * Detect languages in project
 */
function detectLanguages(projectPath = process.cwd()) {
  const detected = [];

  for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
    for (const marker of markers) {
      const pattern = marker.includes('*')
        // Full metachar escaping, then `\*` → `.*` (fixes prior partial escape:
        // only the first `*` was replaced and `.` matched any char).
        ? safeRegExp(escapeRegExp(marker).replace(/\\\*/g, '.*'))
        : null;

      if (pattern) {
        // Glob pattern
        const files = safeFs.readdirSync(projectPath);
        if (files.some(f => pattern.test(f))) {
          detected.push(lang);
          break;
        }
      } else {
        // Exact file
        if (safeFs.existsSync(path.join(projectPath, marker))) {
          detected.push(lang);
          break;
        }
      }
    }
  }

  return [...new Set(detected)]; // Dedupe
}

/**
 * Detect test framework from package.json
 */
function detectJsTestFramework(projectPath = process.cwd()) {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!safeFs.existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(safeFs.readFileSync(pkgPath, 'utf8'));
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies
    };

    // Check scripts.test first
    if (pkg.scripts?.test) {
      const testScript = pkg.scripts.test;
      if (testScript.includes('jest')) return 'jest';
      if (testScript.includes('vitest')) return 'vitest';
      if (testScript.includes('mocha')) return 'mocha';
      if (testScript.includes('ava')) return 'ava';
      if (testScript.includes('tap')) return 'tap';
    }

    // Check dependencies
    if (deps.jest) return 'jest';
    if (deps.vitest) return 'vitest';
    if (deps.mocha) return 'mocha';
    if (deps.ava) return 'ava';
    if (deps['@playwright/test']) return 'playwright';

    return null;
  } catch {
    return null;
  }
}

/**
 * Detect test framework from pyproject.toml
 */
function detectPythonTestFramework(projectPath = process.cwd()) {
  const pyprojectPath = path.join(projectPath, 'pyproject.toml');
  if (!safeFs.existsSync(pyprojectPath)) {
    // Check for pytest.ini or setup.cfg
    if (safeFs.existsSync(path.join(projectPath, 'pytest.ini'))) return 'pytest';
    if (safeFs.existsSync(path.join(projectPath, 'setup.cfg'))) {
      const cfg = safeFs.readFileSync(path.join(projectPath, 'setup.cfg'), 'utf8');
      if (cfg.includes('[tool:pytest]')) return 'pytest';
    }
    return null;
  }

  try {
    const content = safeFs.readFileSync(pyprojectPath, 'utf8');
    if (content.includes('[tool.pytest')) return 'pytest';
    if (content.includes('pytest')) return 'pytest';
    if (content.includes('[tool.unittest')) return 'unittest';
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a command exists
 */
function commandExists(cmd) {
  try {
    const checkCmd = process.platform === 'win32'
      ? `where ${cmd.split(' ')[0]}`
      : `which ${cmd.split(' ')[0]}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get install command for missing tool
 */
function getInstallCommand(tool, language) {
  const installCommands = {
    javascript: {
      eslint: 'npm install -D eslint',
      jest: 'npm install -D jest',
      vitest: 'npm install -D vitest',
      typescript: 'npm install -D typescript'
    },
    typescript: {
      eslint: 'npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin',
      tsc: 'npm install -D typescript',
      jest: 'npm install -D jest @types/jest ts-jest',
      vitest: 'npm install -D vitest'
    },
    python: {
      ruff: 'pip install ruff',
      mypy: 'pip install mypy',
      pytest: 'pip install pytest pytest-cov'
    },
    go: {
      'golangci-lint': 'go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest'
    },
    rust: {
      clippy: 'rustup component add clippy',
      tarpaulin: 'cargo install cargo-tarpaulin'
    }
  };

  return installCommands[language]?.[tool] || `Install ${tool} for ${language}`;
}

/**
 * Read user config
 */
function readUserConfig(projectPath = process.cwd()) {
  const configPath = path.join(projectPath, '.ctoc', 'quality-config.yaml');
  if (!safeFs.existsSync(configPath)) return null;

  try {
    // Simple YAML parsing for key sections
    const content = safeFs.readFileSync(configPath, 'utf8');
    // For now, return raw content - full YAML parsing would need a library
    return { raw: content, path: configPath };
  } catch {
    return null;
  }
}

/**
 * Main detection function - hybrid approach
 */
function detectTools(projectPath = process.cwd()) {
  const result = {
    languages: [],
    tools: {},
    missing: [],
    source: 'auto-detect'
  };

  // 1. Check user config first
  const userConfig = readUserConfig(projectPath);
  if (userConfig) {
    result.source = 'user-config';
    // TODO: Parse YAML config for explicit tool settings
  }

  // 2. Auto-detect languages
  result.languages = detectLanguages(projectPath);

  // 3. For each language, detect/set tools
  for (const lang of result.languages) {
    const tools = { ...DEFAULT_TOOLS[lang] };

    // Language-specific detection
    if (lang === 'javascript' || lang === 'typescript') {
      const framework = detectJsTestFramework(projectPath);
      if (framework) {
        tools.testFramework = framework;
        tools.test = `npx ${framework}`;
        tools.coverage = `npx ${framework} --coverage`;
      }
    } else if (lang === 'python') {
      const framework = detectPythonTestFramework(projectPath);
      if (framework) {
        tools.testFramework = framework;
      }
    }

    result.tools[lang] = tools;

    // Check which tools are missing
    for (const [name, cmd] of Object.entries(tools)) {
      if (cmd && !commandExists(cmd)) {
        result.missing.push({
          tool: name,
          command: cmd,
          language: lang,
          install: getInstallCommand(cmd.split(' ')[0], lang)
        });
      }
    }
  }

  // 4. If no languages detected, need user input
  if (result.languages.length === 0) {
    result.source = 'unknown';
    result.needsUserInput = true;
  }

  return result;
}

/**
 * Print detection results
 */
function printDetectionResults(results) {
  console.log('\n🔍 Tool Detection Results\n');
  console.log(`Source: ${results.source}`);
  console.log(`Languages: ${results.languages.join(', ') || 'None detected'}\n`);

  for (const [lang, tools] of Object.entries(results.tools)) {
    console.log(`${lang}:`);
    for (const [name, cmd] of Object.entries(tools)) {
      if (cmd) {
        const exists = commandExists(cmd) ? '✅' : '❌';
        console.log(`  ${exists} ${name}: ${cmd}`);
      }
    }
    console.log('');
  }

  if (results.missing.length > 0) {
    console.log('⚠️  Missing tools:\n');
    for (const m of results.missing) {
      console.log(`  ${m.tool} (${m.language})`);
      console.log(`    Install: ${m.install}\n`);
    }
  }
}

module.exports = {
  detectLanguages,
  detectJsTestFramework,
  detectPythonTestFramework,
  detectTools,
  commandExists,
  getInstallCommand,
  printDetectionResults,
  DEFAULT_TOOLS,
  LANGUAGE_MARKERS
};

// CLI support
if (require.main === module) {
  const results = detectTools();
  printDetectionResults(results);
}

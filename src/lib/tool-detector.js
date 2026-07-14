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
const registry = require('./capability-registry');

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
 * Legacy marker-table detection (LANGUAGE_MARKERS). Retained ONLY to preserve one
 * back-compat nuance the capability registry deliberately drops: a bare `package.json`
 * detects BOTH `javascript` AND `typescript` (the registry maps `package.json` →
 * javascript and requires `tsconfig.json` for typescript). Everything else the
 * registry already covers as a superset. See "Decisions Taken Under Ambiguity" in
 * plans/implementation/00032-cr5-s2-tool-detector-registry.md.
 * @param {string} projectPath
 * @returns {string[]}
 */
function detectLanguagesLegacy(projectPath) {
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

  return detected;
}

/**
 * Detect languages in a project — UNION of the capability registry's glob-aware,
 * 20-language detection (the primary, superset source) and the legacy marker table
 * (unioned in solely for the package.json → javascript+typescript back-compat nuance,
 * see detectLanguagesLegacy). Registry results come first so registry declaration
 * order is preserved (app-runner consumes registry[0]); legacy-only additions follow;
 * the result is deduped.
 * @param {string} projectPath
 * @returns {string[]}
 */
function detectLanguages(projectPath = process.cwd()) {
  const fromRegistry = registry.detectLanguages(projectPath) || [];
  const fromLegacy = detectLanguagesLegacy(projectPath);
  return [...new Set([...fromRegistry, ...fromLegacy])]; // registry first, then legacy-only, deduped
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
 * Resolve the lint/typecheck/test/coverage commands for a language from the capability
 * registry (the single source of truth). Each command is an inert STRING returned by
 * `toolchainFor`; a phase the language does not define yields `null` (same shape the
 * old DEFAULT_TOOLS table produced). This is what extends tool coverage from the 7
 * DEFAULT_TOOLS languages to all 20 registry languages.
 * @param {string} lang
 * @param {string} projectPath
 * @returns {{lint: (string|null), typecheck: (string|null), test: (string|null), coverage: (string|null), testFramework?: string}}
 */
function toolsFromRegistry(lang, projectPath) {
  /** @type {{lint: (string|null), typecheck: (string|null), test: (string|null), coverage: (string|null), testFramework?: string}} */
  const tools = { lint: null, typecheck: null, test: null, coverage: null };
  for (const phase of ['lint', 'typecheck', 'test', 'coverage']) {
    const entry = registry.toolchainFor(lang, phase, projectPath);
    tools[phase] = entry && typeof entry.cmd === 'string' ? entry.cmd : null;
  }
  return tools;
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

  // 3. For each language, detect/set tools — commands come from the capability
  //    registry (toolchainFor), NOT the static DEFAULT_TOOLS table. This is what
  //    gives ALL 20 registry languages a toolchain (csharp/php previously got none).
  for (const lang of result.languages) {
    const tools = toolsFromRegistry(lang, projectPath);

    // JAVA build-system nuance (documented decision): the registry's java commands are
    // Maven-only, but the prior DEFAULT_TOOLS used a gradle||mvn fallback. When a Gradle
    // build file is present, use the Gradle form (preserving prior Gradle-project
    // behavior); otherwise keep the registry's Maven commands.
    if (lang === 'java'
        && (safeFs.existsSync(path.join(projectPath, 'build.gradle'))
          || safeFs.existsSync(path.join(projectPath, 'build.gradle.kts')))) {
      tools.lint = './gradlew checkstyleMain';
      tools.typecheck = './gradlew compileJava';
      tools.test = './gradlew test';
      tools.coverage = './gradlew jacocoTestReport';
    }

    // RUBY bundler nuance (documented decision): the registry drops the `bundle exec`
    // prefix; when a Gemfile is present, re-prefix ruby test/coverage to preserve
    // bundler semantics.
    if (lang === 'ruby' && safeFs.existsSync(path.join(projectPath, 'Gemfile'))) {
      for (const phase of ['test', 'coverage']) {
        if (tools[phase] && !tools[phase].startsWith('bundle exec ')) {
          tools[phase] = `bundle exec ${tools[phase]}`;
        }
      }
    }

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
  LANGUAGE_MARKERS
};

// CLI support
if (require.main === module) {
  const results = detectTools();
  printDetectionResults(results);
}

/**
 * CI Configuration Wizard
 *
 * Interactive wizard for projects without CI configuration.
 * Detects project type and generates appropriate CI config.
 *
 * @module lib/ci-wizard
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Project type detection
 */
const PROJECT_TYPES = {
  NODE: 'node',
  TYPESCRIPT: 'typescript',
  PYTHON: 'python',
  GO: 'go',
  RUST: 'rust',
  UNKNOWN: 'unknown'
};

/**
 * Strictness levels for various checks
 */
const STRICTNESS = {
  STRICT: 'strict',
  STANDARD: 'standard',
  MINIMAL: 'minimal',
  NONE: 'none'
};

/**
 * Coverage thresholds
 */
const COVERAGE_LEVELS = {
  HIGH: 90,
  STANDARD: 80,
  MINIMAL: 50,
  NONE: 0
};

/**
 * Default wizard configuration
 */
const DEFAULT_CONFIG = {
  linting: STRICTNESS.STRICT,
  typeChecking: STRICTNESS.STRICT,
  coverage: COVERAGE_LEVELS.STANDARD,
  e2e: 'optional',
  integration: 'optional'
};

/**
 * Detect project type
 * @param {string} projectPath - Project root
 * @returns {Object} Project info
 */
function detectProjectType(projectPath) {
  const result = {
    type: PROJECT_TYPES.UNKNOWN,
    name: 'Unknown',
    packageManager: null,
    hasTypeScript: false,
    frameworks: []
  };

  // Check for Node.js/TypeScript
  const packageJson = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      result.name = pkg.name || 'Node.js Project';

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Detect TypeScript
      if (deps.typescript || fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
        result.type = PROJECT_TYPES.TYPESCRIPT;
        result.hasTypeScript = true;
      } else {
        result.type = PROJECT_TYPES.NODE;
      }

      // Detect package manager
      if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
        result.packageManager = 'pnpm';
      } else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
        result.packageManager = 'yarn';
      } else {
        result.packageManager = 'npm';
      }

      // Detect frameworks
      if (deps.react || deps['react-dom']) result.frameworks.push('React');
      if (deps.next) result.frameworks.push('Next.js');
      if (deps.vue) result.frameworks.push('Vue');
      if (deps.express) result.frameworks.push('Express');
      if (deps.fastify) result.frameworks.push('Fastify');
      if (deps['@nestjs/core']) result.frameworks.push('NestJS');

      return result;
    } catch (e) { /* ignore: malformed or unreadable package.json, fall through to other detectors */ }
  }

  // Check for Python
  const requirementsTxt = path.join(projectPath, 'requirements.txt');
  const pyprojectToml = path.join(projectPath, 'pyproject.toml');
  if (fs.existsSync(requirementsTxt) || fs.existsSync(pyprojectToml)) {
    result.type = PROJECT_TYPES.PYTHON;
    result.name = 'Python Project';
    result.packageManager = fs.existsSync(path.join(projectPath, 'poetry.lock'))
      ? 'poetry'
      : 'pip';
    return result;
  }

  // Check for Go
  const goMod = path.join(projectPath, 'go.mod');
  if (fs.existsSync(goMod)) {
    result.type = PROJECT_TYPES.GO;
    result.name = 'Go Project';
    result.packageManager = 'go';
    return result;
  }

  // Check for Rust
  const cargoToml = path.join(projectPath, 'Cargo.toml');
  if (fs.existsSync(cargoToml)) {
    result.type = PROJECT_TYPES.RUST;
    result.name = 'Rust Project';
    result.packageManager = 'cargo';
    return result;
  }

  return result;
}

/**
 * Create readline interface for interactive prompts
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask a question and get answer
 * @param {readline.Interface} rl - Readline interface
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User answer
 */
function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Show menu and get selection
 * @param {readline.Interface} rl - Readline interface
 * @param {string} title - Menu title
 * @param {Array} options - Menu options
 * @param {number} defaultOption - Default option index (1-based)
 * @returns {Promise<number>} Selected option (1-based)
 */
async function showMenu(rl, title, options, defaultOption = 1) {
  console.log(`\n  ${title}`);
  console.log('  ' + '-'.repeat(50));

  for (let i = 0; i < options.length; i++) {
    const marker = i + 1 === defaultOption ? '*' : ' ';
    const label = options[i].label + (i + 1 === defaultOption ? ' (recommended)' : '');
    console.log(`    ${marker} [${i + 1}] ${label}`);
    if (options[i].description) {
      console.log(`        ${options[i].description}`);
    }
  }

  const answer = await ask(rl, `\n  Select [1-${options.length}] (default: ${defaultOption}): `);

  if (!answer) return defaultOption;

  const selection = parseInt(answer, 10);
  if (isNaN(selection) || selection < 1 || selection > options.length) {
    return defaultOption;
  }

  return selection;
}

/**
 * Run the interactive wizard
 * @param {string} projectPath - Project root
 * @returns {Promise<Object>} Wizard results with config choices
 */
async function runWizard(projectPath = process.cwd()) {
  const projectInfo = detectProjectType(projectPath);
  const rl = createInterface();

  console.log('\n' + '='.repeat(60));
  console.log('           CI CONFIGURATION WIZARD');
  console.log('='.repeat(60));
  console.log('\n  No CI configuration found. Let\'s create one!\n');
  console.log(`  Detected: ${projectInfo.name}`);
  if (projectInfo.frameworks.length > 0) {
    console.log(`  Frameworks: ${projectInfo.frameworks.join(', ')}`);
  }
  console.log(`  Package Manager: ${projectInfo.packageManager || 'unknown'}`);

  const config = { ...DEFAULT_CONFIG };

  try {
    // 1. Linting
    const lintChoice = await showMenu(rl, 'LINTING', [
      { label: 'Strict', description: 'Zero warnings, strictest rules' },
      { label: 'Standard', description: 'Common rules, warnings allowed' },
      { label: 'Minimal', description: 'Basic syntax checks only' }
    ], 1);
    config.linting = [STRICTNESS.STRICT, STRICTNESS.STANDARD, STRICTNESS.MINIMAL][lintChoice - 1];

    // 2. Type Checking (for TypeScript/Python)
    if (projectInfo.hasTypeScript || projectInfo.type === PROJECT_TYPES.PYTHON) {
      const typeChoice = await showMenu(rl, 'TYPE CHECKING', [
        { label: 'Strict', description: 'Strict mode, catches null/undefined' },
        { label: 'Standard', description: 'Basic type checking' },
        { label: 'None', description: 'Skip type checking' }
      ], 1);
      config.typeChecking = [STRICTNESS.STRICT, STRICTNESS.STANDARD, STRICTNESS.NONE][typeChoice - 1];
    }

    // 3. Test Coverage
    const coverageChoice = await showMenu(rl, 'TEST COVERAGE', [
      { label: '90%+', description: 'High quality bar for new projects' },
      { label: '80%', description: 'Good balance of quality and velocity' },
      { label: '50%', description: 'Minimum, suitable for prototypes' },
      { label: 'None', description: 'No coverage requirement' }
    ], 2);
    config.coverage = [COVERAGE_LEVELS.HIGH, COVERAGE_LEVELS.STANDARD, COVERAGE_LEVELS.MINIMAL, COVERAGE_LEVELS.NONE][coverageChoice - 1];

    // 4. E2E Tests (for web projects)
    if (projectInfo.frameworks.some(f => ['React', 'Vue', 'Next.js'].includes(f))) {
      const e2eChoice = await showMenu(rl, 'E2E TESTS (for web apps)', [
        { label: 'Required', description: 'Must have E2E tests' },
        { label: 'Optional', description: 'Run if present, don\'t require' },
        { label: 'Skip', description: 'Don\'t run E2E in CI' }
      ], 2);
      config.e2e = ['required', 'optional', 'skip'][e2eChoice - 1];
    }

    // 5. Integration Tests
    const integrationChoice = await showMenu(rl, 'INTEGRATION TESTS', [
      { label: 'Required', description: 'Must have integration tests' },
      { label: 'Optional', description: 'Run if present' }
    ], 2);
    config.integration = ['required', 'optional'][integrationChoice - 1];

    // 6. CI System
    const ciChoice = await showMenu(rl, 'CI SYSTEM', [
      { label: 'GitHub Actions', description: 'Most popular, great free tier' },
      { label: 'GitLab CI', description: 'Built into GitLab' }
    ], 1);
    config.ciSystem = ['github', 'gitlab'][ciChoice - 1];

    rl.close();

    return {
      projectInfo,
      config,
      success: true
    };
  } catch (error) {
    rl.close();
    return {
      projectInfo,
      config: DEFAULT_CONFIG,
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate GitHub Actions workflow
 * @param {Object} projectInfo - Project info
 * @param {Object} config - Config choices
 * @returns {string} YAML content
 */
function generateGitHubActions(projectInfo, config) {
  const lines = [];

  lines.push('# Generated by CTOC CI Wizard');
  lines.push('name: CI');
  lines.push('');
  lines.push('on:');
  lines.push('  push:');
  lines.push('    branches: [main, master]');
  lines.push('  pull_request:');
  lines.push('    branches: [main, master]');
  lines.push('');
  lines.push('jobs:');
  lines.push('  quality:');
  lines.push('    runs-on: ubuntu-latest');
  lines.push('    steps:');
  lines.push('      - uses: actions/checkout@v4');

  // Setup based on project type
  if (projectInfo.type === PROJECT_TYPES.NODE || projectInfo.type === PROJECT_TYPES.TYPESCRIPT) {
    lines.push('      - uses: actions/setup-node@v4');
    lines.push('        with:');
    lines.push("          node-version: '20'");
    lines.push("          cache: 'npm'");
    lines.push('');
    lines.push('      - name: Install dependencies');
    lines.push('        run: npm ci');

    // Linting
    if (config.linting !== STRICTNESS.NONE) {
      const lintFlags = config.linting === STRICTNESS.STRICT ? ' -- --max-warnings 0' : '';
      lines.push('');
      lines.push(`      - name: Lint (${config.linting})`);
      lines.push(`        run: npm run lint${lintFlags}`);
    }

    // Type checking
    if (projectInfo.hasTypeScript && config.typeChecking !== STRICTNESS.NONE) {
      lines.push('');
      lines.push(`      - name: Type check (${config.typeChecking})`);
      lines.push('        run: npm run typecheck');
    }

    // Tests
    lines.push('');
    lines.push('      - name: Unit tests');
    if (config.coverage > 0) {
      lines.push('        run: npm test -- --coverage');
    } else {
      lines.push('        run: npm test');
    }

    // Coverage check
    if (config.coverage > 0) {
      lines.push('');
      lines.push(`      - name: Check coverage (${config.coverage}%)`);
      lines.push('        run: |');
      lines.push("          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')");
      lines.push(`          if (( $(echo "$COVERAGE < ${config.coverage}" | bc -l) )); then`);
      lines.push(`            echo "Coverage $COVERAGE% is below ${config.coverage}% threshold"`);
      lines.push('            exit 1');
      lines.push('          fi');
    }

    // Integration tests
    if (config.integration === 'required') {
      lines.push('');
      lines.push('      - name: Integration tests');
      lines.push('        run: npm run test:integration');
    }

    // E2E tests
    if (config.e2e === 'required') {
      lines.push('');
      lines.push('      - name: E2E tests');
      lines.push('        run: npx playwright test');
    }
  } else if (projectInfo.type === PROJECT_TYPES.PYTHON) {
    lines.push('      - uses: actions/setup-python@v5');
    lines.push('        with:');
    lines.push("          python-version: '3.11'");
    lines.push('');
    lines.push('      - name: Install dependencies');
    lines.push('        run: pip install -r requirements.txt');

    if (config.linting !== STRICTNESS.NONE) {
      lines.push('');
      lines.push('      - name: Lint');
      lines.push('        run: pip install flake8 && flake8 .');
    }

    if (config.typeChecking !== STRICTNESS.NONE) {
      lines.push('');
      lines.push('      - name: Type check');
      lines.push('        run: pip install mypy && mypy .');
    }

    lines.push('');
    lines.push('      - name: Tests');
    if (config.coverage > 0) {
      lines.push('        run: pip install pytest pytest-cov && pytest --cov --cov-fail-under=' + config.coverage);
    } else {
      lines.push('        run: pip install pytest && pytest');
    }
  } else if (projectInfo.type === PROJECT_TYPES.GO) {
    lines.push('      - uses: actions/setup-go@v5');
    lines.push('        with:');
    lines.push("          go-version: '1.22'");
    lines.push('');
    lines.push('      - name: Lint');
    lines.push('        run: go vet ./...');
    lines.push('');
    lines.push('      - name: Tests');
    lines.push('        run: go test -v ./...');
  } else if (projectInfo.type === PROJECT_TYPES.RUST) {
    lines.push('      - uses: actions-rust-lang/setup-rust-toolchain@v1');
    lines.push('');
    lines.push('      - name: Lint');
    lines.push('        run: cargo clippy -- -D warnings');
    lines.push('');
    lines.push('      - name: Tests');
    lines.push('        run: cargo test');
  }

  return lines.join('\n');
}

/**
 * Generate GitLab CI configuration
 * @param {Object} projectInfo - Project info
 * @param {Object} config - Config choices
 * @returns {string} YAML content
 */
function generateGitLabCI(projectInfo, config) {
  const lines = [];

  lines.push('# Generated by CTOC CI Wizard');

  if (projectInfo.type === PROJECT_TYPES.NODE || projectInfo.type === PROJECT_TYPES.TYPESCRIPT) {
    lines.push('image: node:20');
  } else if (projectInfo.type === PROJECT_TYPES.PYTHON) {
    lines.push('image: python:3.11');
  } else if (projectInfo.type === PROJECT_TYPES.GO) {
    lines.push('image: golang:1.22');
  } else if (projectInfo.type === PROJECT_TYPES.RUST) {
    lines.push('image: rust:latest');
  }

  lines.push('');
  lines.push('stages:');
  lines.push('  - test');
  lines.push('');
  lines.push('quality:');
  lines.push('  stage: test');
  lines.push('  script:');

  if (projectInfo.type === PROJECT_TYPES.NODE || projectInfo.type === PROJECT_TYPES.TYPESCRIPT) {
    lines.push('    - npm ci');
    if (config.linting !== STRICTNESS.NONE) {
      const lintCmd = config.linting === STRICTNESS.STRICT
        ? 'npm run lint -- --max-warnings 0'
        : 'npm run lint';
      lines.push(`    - ${lintCmd}`);
    }
    if (projectInfo.hasTypeScript && config.typeChecking !== STRICTNESS.NONE) {
      lines.push('    - npm run typecheck');
    }
    if (config.coverage > 0) {
      lines.push('    - npm test -- --coverage');
    } else {
      lines.push('    - npm test');
    }
  } else if (projectInfo.type === PROJECT_TYPES.PYTHON) {
    lines.push('    - pip install -r requirements.txt');
    if (config.linting !== STRICTNESS.NONE) {
      lines.push('    - pip install flake8 && flake8 .');
    }
    lines.push('    - pip install pytest && pytest');
  } else if (projectInfo.type === PROJECT_TYPES.GO) {
    lines.push('    - go vet ./...');
    lines.push('    - go test -v ./...');
  } else if (projectInfo.type === PROJECT_TYPES.RUST) {
    lines.push('    - cargo clippy -- -D warnings');
    lines.push('    - cargo test');
  }

  return lines.join('\n');
}

/**
 * Generate CI configuration file
 * @param {string} projectPath - Project root
 * @param {Object} projectInfo - Project info
 * @param {Object} config - Config choices
 * @returns {Object} Result with file path and content
 */
function generateCIConfig(projectPath, projectInfo, config) {
  let filePath;
  let content;

  if (config.ciSystem === 'github') {
    filePath = path.join(projectPath, '.github', 'workflows', 'ci.yml');
    content = generateGitHubActions(projectInfo, config);
  } else {
    filePath = path.join(projectPath, '.gitlab-ci.yml');
    content = generateGitLabCI(projectInfo, config);
  }

  return { filePath, content };
}

/**
 * Write CI config to file
 * @param {string} filePath - File path
 * @param {string} content - File content
 */
function writeCIConfig(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

/**
 * Run wizard and generate config
 * @param {string} projectPath - Project root
 * @returns {Promise<Object>} Result
 */
async function runWizardAndGenerate(projectPath = process.cwd()) {
  const result = await runWizard(projectPath);

  if (!result.success) {
    return result;
  }

  const generated = generateCIConfig(projectPath, result.projectInfo, result.config);

  console.log('\n' + '='.repeat(60));
  console.log('           CI CONFIGURATION GENERATED');
  console.log('='.repeat(60));
  console.log(`\n  File: ${generated.filePath}\n`);
  console.log('  Preview:');
  console.log('  ' + '-'.repeat(50));
  for (const line of generated.content.split('\n').slice(0, 20)) {
    console.log(`  ${line}`);
  }
  if (generated.content.split('\n').length > 20) {
    console.log('  ...');
  }
  console.log('  ' + '-'.repeat(50));

  return {
    ...result,
    generated,
    filePath: generated.filePath,
    content: generated.content
  };
}

module.exports = {
  detectProjectType,
  runWizard,
  generateGitHubActions,
  generateGitLabCI,
  generateCIConfig,
  writeCIConfig,
  runWizardAndGenerate,
  PROJECT_TYPES,
  STRICTNESS,
  COVERAGE_LEVELS,
  DEFAULT_CONFIG
};

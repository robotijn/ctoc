/**
 * CTOC Project Initializer
 *
 * Initializes a project with CTOC methodology:
 * 1. Detects project stack (languages, frameworks, tools)
 * 2. Generates tailored CLAUDE.md from template
 * 3. Creates .ctoc/ directory structure
 * 4. Configures quality gates based on detected tools
 * 5. Creates plans/ directory structure
 * 6. Initializes Iron Loop state
 *
 * Cross-platform: Works on Windows, macOS, and Linux.
 */

const fs = require('fs');
const path = require('path');

// Quality commands per language
const QUALITY_COMMANDS = {
  javascript: {
    lint: 'npx eslint .',
    format: 'npx prettier --check .',
    typecheck: '# No type checking (JavaScript)',
    test: 'npm test'
  },
  typescript: {
    lint: 'npx eslint .',
    format: 'npx prettier --check .',
    typecheck: 'npx tsc --noEmit',
    test: 'npm test'
  },
  python: {
    lint: 'ruff check .',
    format: 'ruff format --check .',
    typecheck: 'mypy .',
    test: 'pytest'
  },
  go: {
    lint: 'golangci-lint run',
    format: 'gofmt -l .',
    typecheck: 'go vet ./...',
    test: 'go test ./...'
  },
  rust: {
    lint: 'cargo clippy',
    format: 'cargo fmt --check',
    typecheck: 'cargo check',
    test: 'cargo test'
  },
  java: {
    lint: '# Configure checkstyle or spotbugs',
    format: '# Configure google-java-format',
    typecheck: '# Java compiler handles types',
    test: 'mvn test'
  },
  kotlin: {
    lint: 'ktlint',
    format: 'ktlint --format',
    typecheck: '# Kotlin compiler handles types',
    test: 'gradle test'
  },
  ruby: {
    lint: 'rubocop',
    format: 'rubocop -a',
    typecheck: '# Consider sorbet for type checking',
    test: 'bundle exec rspec'
  },
  php: {
    lint: 'vendor/bin/phpstan analyse',
    format: 'vendor/bin/php-cs-fixer fix --dry-run',
    typecheck: '# PHPStan handles static analysis',
    test: 'vendor/bin/phpunit'
  },
  csharp: {
    lint: 'dotnet format --verify-no-changes',
    format: 'dotnet format',
    typecheck: 'dotnet build --no-restore',
    test: 'dotnet test'
  },
  elixir: {
    lint: 'mix credo',
    format: 'mix format --check-formatted',
    typecheck: 'mix dialyzer',
    test: 'mix test'
  },
  swift: {
    lint: 'swiftlint',
    format: 'swift-format lint -r .',
    typecheck: 'swift build',
    test: 'swift test'
  }
};

// Framework-specific test commands (override language defaults)
const FRAMEWORK_TEST_OVERRIDES = {
  // JavaScript/TypeScript frameworks
  nextjs: { test: 'npm test', typecheck: 'npx tsc --noEmit' },
  react: { test: 'npm test' },
  vue: { test: 'npm test' },
  angular: { test: 'ng test --watch=false', typecheck: 'npx tsc --noEmit' },
  svelte: { test: 'npm test' },
  express: { test: 'npm test' },
  nestjs: { test: 'npm test', typecheck: 'npx tsc --noEmit' },
  // Python frameworks
  django: { test: 'python manage.py test' },
  fastapi: { test: 'pytest' },
  flask: { test: 'pytest' },
  // Go frameworks
  gin: { test: 'go test ./...' },
  echo: { test: 'go test ./...' },
  // Rust frameworks
  actix: { test: 'cargo test' },
  axum: { test: 'cargo test' },
  // Java frameworks
  spring: { test: 'mvn test' },
  quarkus: { test: 'mvn test' },
  // Ruby frameworks
  rails: { test: 'bundle exec rails test' }
};

/**
 * Plan directory structure to create
 */
const PLAN_DIRS = [
  'plans/vision',
  'plans/canvas',
  'plans/functional',
  'plans/implementation',
  'plans/todo',
  'plans/in-progress',
  'plans/review',
  'plans/done'
];

/**
 * CTOC config directory structure
 */
const CTOC_DIRS = [
  '.ctoc',
  '.ctoc/state',
  '.ctoc/logs',
  '.ctoc/inbox/questions',
  '.ctoc/inbox/decisions',
  '.ctoc/audit/agent-modernization',
  '.ctoc/audit/skill-conversion',
  '.ctoc/learnings/pending',
  '.ctoc/learnings/approved',
  '.ctoc/learnings/applied',
  '.ctoc/learnings/rejected',
  'agents/_shared'
];

/**
 * Detect project name from directory or package files
 * @param {string} projectDir - Project root directory
 * @returns {string} Project name
 */
function detectProjectName(projectDir) {
  // Try package.json first
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) return pkg.name;
    } catch { /* ignore parse errors */ }
  }

  // Try pyproject.toml
  const pyprojectPath = path.join(projectDir, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
      if (nameMatch) return nameMatch[1];
    } catch { /* ignore */ }
  }

  // Try Cargo.toml
  const cargoPath = path.join(projectDir, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    try {
      const content = fs.readFileSync(cargoPath, 'utf8');
      const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
      if (nameMatch) return nameMatch[1];
    } catch { /* ignore */ }
  }

  // Try go.mod
  const goModPath = path.join(projectDir, 'go.mod');
  if (fs.existsSync(goModPath)) {
    try {
      const content = fs.readFileSync(goModPath, 'utf8');
      const moduleMatch = content.match(/^module\s+(\S+)/m);
      if (moduleMatch) {
        const parts = moduleMatch[1].split('/');
        return parts[parts.length - 1];
      }
    } catch { /* ignore */ }
  }

  // Fallback to directory name
  return path.basename(projectDir);
}

/**
 * Detect languages in the project
 * @param {string} projectDir - Project root directory
 * @returns {string[]} Detected language names
 */
function detectLanguages(projectDir) {
  const LANGUAGE_MARKERS = {
    javascript: ['package.json'],
    typescript: ['tsconfig.json'],
    python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile', 'uv.lock'],
    go: ['go.mod'],
    rust: ['Cargo.toml'],
    java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    kotlin: ['build.gradle.kts'],  // detected alongside java
    ruby: ['Gemfile'],
    php: ['composer.json'],
    csharp: ['*.csproj', '*.sln'],
    elixir: ['mix.exs'],
    swift: ['Package.swift', '*.xcodeproj']
  };

  const detected = [];

  for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
    for (const marker of markers) {
      if (marker.includes('*')) {
        // Glob-style marker - check for files matching pattern
        try {
          const ext = marker.replace('*', '');
          const files = fs.readdirSync(projectDir);
          if (files.some(f => f.endsWith(ext))) {
            if (!detected.includes(lang)) detected.push(lang);
            break;
          }
        } catch { /* ignore */ }
      } else {
        const markerPath = path.join(projectDir, marker);
        if (fs.existsSync(markerPath)) {
          if (!detected.includes(lang)) detected.push(lang);
          break;
        }
      }
    }
  }

  // If typescript is detected, also ensure javascript is listed
  if (detected.includes('typescript') && !detected.includes('javascript')) {
    detected.push('javascript');
  }

  return detected;
}

/**
 * Detect frameworks in the project
 * @param {string} projectDir - Project root directory
 * @param {string[]} languages - Detected languages
 * @returns {string[]} Detected framework names
 */
function detectFrameworks(projectDir, languages) {
  const detected = [];

  // Check package.json for JS/TS frameworks
  if (languages.includes('javascript') || languages.includes('typescript')) {
    const pkgPath = path.join(projectDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const allDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {})
        };

        const JS_FRAMEWORKS = {
          next: 'nextjs',
          react: 'react',
          vue: 'vue',
          '@angular/core': 'angular',
          svelte: 'svelte',
          express: 'express',
          '@nestjs/core': 'nestjs',
          fastify: 'fastify',
          hono: 'hono',
          astro: 'astro',
          nuxt: 'nuxt',
          remix: 'remix',
          gatsby: 'gatsby'
        };

        for (const [dep, framework] of Object.entries(JS_FRAMEWORKS)) {
          if (allDeps[dep]) {
            detected.push(framework);
          }
        }
      } catch { /* ignore */ }
    }
  }

  // Check Python frameworks
  if (languages.includes('python')) {
    const reqFiles = ['requirements.txt', 'pyproject.toml', 'Pipfile'];
    for (const reqFile of reqFiles) {
      const reqPath = path.join(projectDir, reqFile);
      if (fs.existsSync(reqPath)) {
        try {
          const content = fs.readFileSync(reqPath, 'utf8');
          const PY_FRAMEWORKS = {
            django: 'django',
            fastapi: 'fastapi',
            flask: 'flask',
            starlette: 'starlette',
            tornado: 'tornado',
            aiohttp: 'aiohttp'
          };
          for (const [pkg, framework] of Object.entries(PY_FRAMEWORKS)) {
            if (content.toLowerCase().includes(pkg)) {
              if (!detected.includes(framework)) detected.push(framework);
            }
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Check Go frameworks via go.mod
  if (languages.includes('go')) {
    const goModPath = path.join(projectDir, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        const content = fs.readFileSync(goModPath, 'utf8');
        const GO_FRAMEWORKS = {
          'gin-gonic/gin': 'gin',
          'labstack/echo': 'echo',
          'gofiber/fiber': 'fiber',
          'go-chi/chi': 'chi'
        };
        for (const [pkg, framework] of Object.entries(GO_FRAMEWORKS)) {
          if (content.includes(pkg)) detected.push(framework);
        }
      } catch { /* ignore */ }
    }
  }

  // Check Rust frameworks via Cargo.toml
  if (languages.includes('rust')) {
    const cargoPath = path.join(projectDir, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf8');
        const RUST_FRAMEWORKS = {
          actix: 'actix',
          axum: 'axum',
          rocket: 'rocket',
          warp: 'warp'
        };
        for (const [pkg, framework] of Object.entries(RUST_FRAMEWORKS)) {
          if (content.includes(pkg)) detected.push(framework);
        }
      } catch { /* ignore */ }
    }
  }

  // Check Ruby frameworks
  if (languages.includes('ruby')) {
    const gemfilePath = path.join(projectDir, 'Gemfile');
    if (fs.existsSync(gemfilePath)) {
      try {
        const content = fs.readFileSync(gemfilePath, 'utf8');
        if (content.includes("'rails'") || content.includes('"rails"')) detected.push('rails');
        if (content.includes("'sinatra'") || content.includes('"sinatra"')) detected.push('sinatra');
        if (content.includes("'hanami'") || content.includes('"hanami"')) detected.push('hanami');
      } catch { /* ignore */ }
    }
  }

  // Check Java/Kotlin frameworks
  if (languages.includes('java') || languages.includes('kotlin')) {
    const buildFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
    for (const buildFile of buildFiles) {
      const buildPath = path.join(projectDir, buildFile);
      if (fs.existsSync(buildPath)) {
        try {
          const content = fs.readFileSync(buildPath, 'utf8');
          if (content.includes('spring')) detected.push('spring');
          if (content.includes('quarkus')) detected.push('quarkus');
          if (content.includes('micronaut')) detected.push('micronaut');
          if (content.includes('ktor')) detected.push('ktor');
        } catch { /* ignore */ }
      }
    }
  }

  return detected;
}

/**
 * Generate quality commands based on detected stack
 * @param {string[]} languages - Detected languages
 * @param {string[]} frameworks - Detected frameworks
 * @returns {{ lint: string, format: string, typecheck: string, test: string }}
 */
function generateQualityCommands(languages, frameworks) {
  // Start with the primary language's commands
  const primaryLang = languages[0] || 'javascript';
  const commands = { ...(QUALITY_COMMANDS[primaryLang] || QUALITY_COMMANDS.javascript) };

  // Apply framework overrides
  for (const framework of frameworks) {
    const overrides = FRAMEWORK_TEST_OVERRIDES[framework];
    if (overrides) {
      Object.assign(commands, overrides);
    }
  }

  return commands;
}

/**
 * Generate project structure description
 * @param {string} projectDir - Project root directory
 * @returns {string} Markdown-formatted structure
 */
function generateProjectStructure(projectDir) {
  const IGNORE_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', '__pycache__',
    '.next', '.nuxt', 'coverage', '.pytest_cache', 'target',
    'bin', 'obj', '.ctoc', '.claude', 'plans', '.vscode', '.idea'
  ]);

  const lines = [];

  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    const sorted = entries
      .filter(e => !e.name.startsWith('.') || ['.env.example', '.gitignore'].includes(e.name))
      .filter(e => !IGNORE_DIRS.has(e.name))
      .sort((a, b) => {
        // Directories first
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    lines.push('```');
    for (const entry of sorted.slice(0, 20)) { // Limit to 20 entries
      if (entry.isDirectory()) {
        lines.push(`  ${entry.name}/`);
      } else {
        lines.push(`  ${entry.name}`);
      }
    }
    if (sorted.length > 20) {
      lines.push(`  ... (${sorted.length - 20} more entries)`);
    }
    lines.push('```');
  } catch {
    lines.push('```\n  (Unable to read project structure)\n```');
  }

  return lines.join('\n');
}

/**
 * Create directory recursively (cross-platform)
 * @param {string} dirPath - Directory path to create
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generate CLAUDE.md content from template
 * @param {string} templatePath - Path to template file
 * @param {object} vars - Template variables
 * @returns {string} Generated content
 */
function renderTemplate(templatePath, vars) {
  let content = fs.readFileSync(templatePath, 'utf8');

  for (const [key, value] of Object.entries(vars)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return content;
}

/**
 * Generate initial settings.yaml
 * @param {string[]} languages - Detected languages
 * @param {string[]} frameworks - Detected frameworks
 * @returns {string} YAML content
 */
function generateSettings(languages, frameworks) {
  return [
    '# CTOC Settings',
    `# Generated: ${new Date().toISOString().split('T')[0]}`,
    '',
    'enforcement:',
    '  mode: strict  # strict | soft | off',
    '',
    'detected:',
    `  languages: [${languages.join(', ')}]`,
    `  frameworks: [${frameworks.join(', ')}]`,
    '',
    'quality:',
    '  coverage_threshold: 80',
    '  flaky_test_retries: 2',
    '  flaky_test_action: block  # block | warn',
    '',
    'research:',
    '  enabled: true',
    '  auto_steps: [1, 2, 5, 12]',
    '',
    'push:',
    '  auto_push: true',
    '  allow_warnings: false',
    ''
  ].join('\n');
}

/**
 * Generate initial Iron Loop state
 * @returns {string} YAML content
 */
function generateInitialState() {
  return [
    '# CTOC Iron Loop State',
    `# Initialized: ${new Date().toISOString()}`,
    '',
    'session:',
    '  status: inactive',
    '  current_step: 0',
    '  current_plan: null',
    '  last_activity: null',
    '',
    'step_timing: {}',
    ''
  ].join('\n');
}

/**
 * Initialize a project with CTOC
 * @param {string} projectDir - Project root directory
 * @param {object} options - Initialization options
 * @param {boolean} options.force - Overwrite existing files
 * @param {boolean} options.dryRun - Show what would be created without creating
 * @returns {{ success: boolean, created: string[], skipped: string[], detected: object }}
 */
function initProject(projectDir, options = {}) {
  const { force = false, dryRun = false } = options;
  const created = [];
  const skipped = [];

  // 1. Detect project stack
  const projectName = detectProjectName(projectDir);
  const languages = detectLanguages(projectDir);
  const frameworks = detectFrameworks(projectDir, languages);
  const qualityCommands = generateQualityCommands(languages, frameworks);
  const projectStructure = generateProjectStructure(projectDir);

  const detected = { projectName, languages, frameworks, qualityCommands };

  // 2. Find template
  const templatePath = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'CLAUDE.md.template');
  const ironLoopTemplatePath = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'IRON_LOOP.md.template');

  // 3. Generate CLAUDE.md
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath) || force) {
    if (fs.existsSync(templatePath)) {
      const content = renderTemplate(templatePath, {
        PROJECT_NAME: projectName,
        DETECTED_LANGUAGES: languages.join(', ') || 'Not detected',
        DETECTED_FRAMEWORKS: frameworks.join(', ') || 'None detected',
        LINT_COMMAND: qualityCommands.lint,
        FORMAT_COMMAND: qualityCommands.format,
        TYPECHECK_COMMAND: qualityCommands.typecheck,
        TEST_COMMAND: qualityCommands.test,
        PROJECT_STRUCTURE: projectStructure,
        TOOL_CONFIGURATION: generateToolConfig(languages, frameworks)
      });

      if (!dryRun) {
        fs.writeFileSync(claudeMdPath, content, 'utf8');
      }
      created.push('CLAUDE.md');
    } else {
      skipped.push('CLAUDE.md (template not found)');
    }
  } else {
    skipped.push('CLAUDE.md (already exists, use --force to overwrite)');
  }

  // 4. Generate IRON_LOOP.md
  const ironLoopPath = path.join(projectDir, 'IRON_LOOP.md');
  if (!fs.existsSync(ironLoopPath) || force) {
    if (fs.existsSync(ironLoopTemplatePath)) {
      const content = fs.readFileSync(ironLoopTemplatePath, 'utf8');
      if (!dryRun) {
        fs.writeFileSync(ironLoopPath, content, 'utf8');
      }
      created.push('IRON_LOOP.md');
    }
  } else {
    skipped.push('IRON_LOOP.md (already exists)');
  }

  // 5. Create directory structure
  const allDirs = [...PLAN_DIRS, ...CTOC_DIRS];
  for (const dir of allDirs) {
    const dirPath = path.join(projectDir, dir);
    if (!fs.existsSync(dirPath)) {
      if (!dryRun) {
        ensureDir(dirPath);
      }
      created.push(dir + '/');
    }
  }

  // 6. Generate .ctoc/settings.yaml
  const settingsPath = path.join(projectDir, '.ctoc', 'settings.yaml');
  if (!fs.existsSync(settingsPath) || force) {
    const settingsContent = generateSettings(languages, frameworks);
    if (!dryRun) {
      ensureDir(path.dirname(settingsPath));
      fs.writeFileSync(settingsPath, settingsContent, 'utf8');
    }
    created.push('.ctoc/settings.yaml');
  } else {
    skipped.push('.ctoc/settings.yaml (already exists)');
  }

  // 7. Generate .ctoc/state/iron-loop.yaml
  const statePath = path.join(projectDir, '.ctoc', 'state', 'iron-loop.yaml');
  if (!fs.existsSync(statePath) || force) {
    const stateContent = generateInitialState();
    if (!dryRun) {
      ensureDir(path.dirname(statePath));
      fs.writeFileSync(statePath, stateContent, 'utf8');
    }
    created.push('.ctoc/state/iron-loop.yaml');
  } else {
    skipped.push('.ctoc/state/iron-loop.yaml (already exists)');
  }

  // 8. Add .ctoc/logs/ to .gitignore if not already there
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes('.ctoc/logs/') || !gitignore.includes('.ctoc/state/')) {
      if (!dryRun) {
        const additions = '\n# CTOC\n.ctoc/logs/\n.ctoc/state/\n';
        fs.appendFileSync(gitignorePath, additions, 'utf8');
      }
      created.push('.gitignore (updated with CTOC entries)');
    }
  }

  return { success: true, created, skipped, detected };
}

/**
 * Generate tool configuration text
 * @param {string[]} languages
 * @param {string[]} frameworks
 * @returns {string}
 */
function generateToolConfig(languages, frameworks) {
  const lines = [];

  for (const lang of languages) {
    const cmds = QUALITY_COMMANDS[lang];
    if (cmds) {
      lines.push(`**${lang}**: lint=\`${cmds.lint}\`, test=\`${cmds.test}\``);
    }
  }

  if (lines.length === 0) {
    lines.push('No tools auto-detected. Configure manually above.');
  }

  return lines.join('\n');
}

/**
 * Format init results for display
 * @param {{ success: boolean, created: string[], skipped: string[], detected: object }} result
 * @returns {string} Formatted output
 */
function formatInitResult(result) {
  const lines = [];

  lines.push('CTOC Project Initialized');
  lines.push('========================');
  lines.push('');
  lines.push(`Project: ${result.detected.projectName}`);
  lines.push(`Languages: ${result.detected.languages.join(', ') || 'None detected'}`);
  lines.push(`Frameworks: ${result.detected.frameworks.join(', ') || 'None detected'}`);
  lines.push('');

  if (result.created.length > 0) {
    lines.push('Created:');
    for (const item of result.created) {
      lines.push(`  + ${item}`);
    }
  }

  if (result.skipped.length > 0) {
    lines.push('');
    lines.push('Skipped:');
    for (const item of result.skipped) {
      lines.push(`  - ${item}`);
    }
  }

  lines.push('');
  lines.push('Next steps:');
  lines.push('  1. Review the generated CLAUDE.md');
  lines.push('  2. Run: ctoc plan new "your first feature"');
  lines.push('  3. Follow the Iron Loop!');

  return lines.join('\n');
}

module.exports = {
  initProject,
  detectProjectName,
  detectLanguages,
  detectFrameworks,
  generateQualityCommands,
  formatInitResult,
  QUALITY_COMMANDS,
  FRAMEWORK_TEST_OVERRIDES,
  PLAN_DIRS,
  CTOC_DIRS
};

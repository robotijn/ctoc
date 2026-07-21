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

const safeFs = require('./safe-fs');
const { safeRegExp } = require('./regex-utils');
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
 * CTOC config directory structure.
 *
 * Everything here is state the USER's project genuinely owns. `skills/agent-fragments`
 * was removed (R3-D): it is CTOC-INTERNAL plumbing, and scaffolding it into a user's
 * repo dropped an empty, unexplained `skills/` tree into projects that have no skills —
 * CTOC's own furniture in someone else's house.
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
  '.ctoc/learnings/rejected'
];

/**
 * Detect project name from directory or package files
 * @param {string} projectDir - Project root directory
 * @returns {string} Project name
 */
function detectProjectName(projectDir) {
  // Try package.json first
  const pkgPath = path.join(projectDir, 'package.json');
  if (safeFs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(safeFs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) return pkg.name;
    } catch { /* ignore parse errors */ }
  }

  // Try pyproject.toml
  const pyprojectPath = path.join(projectDir, 'pyproject.toml');
  if (safeFs.existsSync(pyprojectPath)) {
    try {
      const content = safeFs.readFileSync(pyprojectPath, 'utf8');
      const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
      if (nameMatch) return nameMatch[1];
    } catch { /* ignore */ }
  }

  // Try Cargo.toml
  const cargoPath = path.join(projectDir, 'Cargo.toml');
  if (safeFs.existsSync(cargoPath)) {
    try {
      const content = safeFs.readFileSync(cargoPath, 'utf8');
      const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
      if (nameMatch) return nameMatch[1];
    } catch { /* ignore */ }
  }

  // Try go.mod
  const goModPath = path.join(projectDir, 'go.mod');
  if (safeFs.existsSync(goModPath)) {
    try {
      const content = safeFs.readFileSync(goModPath, 'utf8');
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
          const files = safeFs.readdirSync(projectDir);
          if (files.some(f => f.endsWith(ext))) {
            if (!detected.includes(lang)) detected.push(lang);
            break;
          }
        } catch { /* ignore */ }
      } else {
        const markerPath = path.join(projectDir, marker);
        if (safeFs.existsSync(markerPath)) {
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
    if (safeFs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(safeFs.readFileSync(pkgPath, 'utf8'));
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
      if (safeFs.existsSync(reqPath)) {
        try {
          const content = safeFs.readFileSync(reqPath, 'utf8');
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
    if (safeFs.existsSync(goModPath)) {
      try {
        const content = safeFs.readFileSync(goModPath, 'utf8');
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
    if (safeFs.existsSync(cargoPath)) {
      try {
        const content = safeFs.readFileSync(cargoPath, 'utf8');
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
    if (safeFs.existsSync(gemfilePath)) {
      try {
        const content = safeFs.readFileSync(gemfilePath, 'utf8');
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
      if (safeFs.existsSync(buildPath)) {
        try {
          const content = safeFs.readFileSync(buildPath, 'utf8');
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
    const entries = safeFs.readdirSync(projectDir, { withFileTypes: true });
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
  if (!safeFs.existsSync(dirPath)) {
    safeFs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generate CLAUDE.md content from template
 * @param {string} templatePath - Path to template file
 * @param {object} vars - Template variables
 * @returns {string} Generated content
 */
function renderTemplate(templatePath, vars) {
  let content = safeFs.readFileSync(templatePath, 'utf8');

  for (const [key, value] of Object.entries(vars)) {
    content = content.replace(safeRegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
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
    // Regulatory-regime anchor (R4). Written EMPTY by default so CTOC stays lean,
    // but the `active_profiles:` line must exist from day one: it is the anchor the
    // line-targeted writer in src/lib/compliance-regime.js (writeActiveProfiles)
    // replaces to persist a compliance answer. Without this block a fresh project
    // cannot record ANY answer (including a declined "none"), so the compliance
    // question rides forever. Key/format match the reader of record exactly:
    // src/lib/regulatory-regime.js loadActiveProfiles parses the `regulatory_regime:`
    // block and its `active_profiles:` list (inline `[]` here ⇒ profiles: []).
    'regulatory_regime:',
    '  active_profiles: []  # opt-in industry profiles (e.g. gdpr); none by default',
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
    ''
    // R4-B: the `push:` block (`auto_push`, `allow_warnings`) was DELETED. Nothing
    // read either key — the canonical push gate is `git.autoPushEnabled` in
    // settings.json (default false), read ONLY via settings.isAutoPushEnabled().
    // A visible off-switch wired to a key no code consults is a placebo that lies
    // to the human. CTOC never pushes unless the human opens git.autoPushEnabled.
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
 * The artifacts a project MUST hold before setup may call itself successful.
 *
 * Deliberately duplicated with the menu's read-back (`verifySetup` in
 * `src/commands/start.js`). They are two INDEPENDENT checks of the same claim;
 * sharing one list would let a single mistake pass both of them. If they ever
 * disagree, the cross-layer test in `tests/init-tells-the-truth.test.js` fails —
 * which is the point. Display form (forward slashes) so a message can never
 * leak the filesystem layout.
 */
const REQUIRED_ARTIFACTS = Object.freeze([
  ...PLAN_DIRS,
  '.ctoc/settings.yaml',
  '.ctoc/state/iron-loop.yaml'
]);

/**
 * What setup says about the git hook it deliberately does NOT install.
 *
 * The human learns three things: the thing exists, what it would do, and that
 * it did not happen. Reported in a preview and in a real run alike.
 */
const HOOK_NOT_INSTALLED_NOTICE =
  '.git/hooks/post-commit — NOT installed. It would run on every commit you make. '
  + 'That is your decision, not setup\'s.';

/**
 * Strip filesystem layout out of an error message before it reaches a report.
 *
 * Node's fs errors embed the absolute path they failed on. A report is shown to
 * a human and may be logged, so the project root and the user's home directory
 * are replaced with stable placeholders. The MESSAGE survives; the layout does
 * not, and a stack trace never enters a report at all.
 *
 * @param {Error} err
 * @param {string} projectDir
 * @returns {string}
 */
function reportableError(err, projectDir) {
  const message = (err && err.message) ? String(err.message) : String(err);
  let out = message.split(projectDir).join('<project>');
  // The home-directory scrub is BEST-EFFORT and its failure is not a verdict:
  // `os.homedir()` throws on a host with no resolvable home. The project scrub
  // above has already run, so the fall-through is strictly less scrubbing, never
  // a check that passed without looking. The absorbed failure is NAMED in the
  // returned text so a reader can see the scrub was partial rather than assume
  // it was complete.
  let home = null;
  try {
    home = require('os').homedir();
  } catch (homedirErr) {
    return `${out} [home-directory scrub skipped: ${homedirErr.message}]`;
  }
  if (home) out = out.split(home).join('<home>');
  return out;
}

/**
 * Perform one setup action, or — in a preview — describe it without doing it.
 *
 * ONE helper, so the preview branch cannot be got wrong at a fifth site. The
 * defect this replaces was the shape `if (!dryRun) { write(); } created.push(x)`
 * repeated six times: the write was skipped in a preview and the ANNOUNCEMENT
 * was not, so a preview's report was byte-identical to a real run's.
 *
 * @param {{dryRun: boolean, created: string[], wouldCreate: string[], failed: string[], projectDir: string}} state
 * @param {string} label - the artifact, in display form
 * @param {() => void} write - the actual write, called ONLY on a real run
 */
function record(state, label, write) {
  if (state.dryRun) {
    state.wouldCreate.push(label);
    return;
  }
  try {
    write();
    state.created.push(label);
  } catch (err) {
    // A per-artifact failure is RECORDED and setup continues. Before this, the
    // throw escaped into `ensureInitialized`'s bare catch and cost the project
    // its remaining artifacts — one bad write took the whole run with it.
    state.failed.push(`${label} (${reportableError(err, state.projectDir)})`);
  }
}

/**
 * Initialize a project with CTOC.
 *
 * TWO RULES this function is required to keep:
 *
 *  1. **A preview reports what it WOULD do, under a different key.** A preview
 *     writes nothing and therefore `created` is empty — the truth. The preview
 *     list lives in `wouldCreate`, which a caller must ask for by name, and the
 *     report carries `dryRun: true` so it is structurally distinguishable from
 *     a real run. `success` is `null` in a preview: a preview has no success,
 *     and `true` would only repeat the old lie in a new field.
 *
 *  2. **Setup never installs anything into a git repository without being
 *     asked.** The post-commit hook fires on every commit the human ever makes;
 *     that is a decision the human takes, not a side effect of opening a menu.
 *     `installGitHook` defaults to `false`, and BOTH modes report that the hook
 *     exists, what it would do, and that it did not happen.
 *
 * FOLLOW-UP, named rather than forgotten: nothing OFFERS the hook yet. Offering
 * it means rendering an option in `src/commands/start.js`, which a separate slice
 * owns — two plans editing one command surface is the contention this pipeline
 * keeps tripping over. Until that lands, new projects do not get the background
 * post-commit quality loop. That is a real behaviour change, stated here rather
 * than buried.
 *
 * @param {string} projectDir - Project root directory
 * @param {object} [options] - Initialization options
 * @param {boolean} [options.force] - Overwrite existing files
 * @param {boolean} [options.dryRun] - Describe what would be created, write nothing
 * @param {boolean} [options.installGitHook] - Install the post-commit quality hook.
 *   Defaults to FALSE. Only a caller that has ASKED the human may pass true.
 * @returns {{ success: (boolean|null), dryRun: boolean, created: string[],
 *   wouldCreate: string[], skipped: string[], failed: string[], missing: string[],
 *   detected: object }}
 */
function initProject(projectDir, options = {}) {
  const { force = false, dryRun = false, installGitHook = false } = options;
  const state = {
    dryRun,
    projectDir,
    created: [],
    wouldCreate: [],
    skipped: [],
    failed: []
  };
  const created = state.created;
  const skipped = state.skipped;

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
  if (!safeFs.existsSync(claudeMdPath) || force) {
    if (safeFs.existsSync(templatePath)) {
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

      record(state, 'CLAUDE.md', () => safeFs.writeFileSync(claudeMdPath, content, 'utf8'));
    } else {
      skipped.push('CLAUDE.md (template not found)');
    }
  } else {
    skipped.push('CLAUDE.md (already exists, use --force to overwrite)');
  }

  // 3b. Ensure CTOC-managed operating-lessons block.
  //     Single canonical source: .ctoc/templates/operating-lessons.md (resolved via __dirname).
  //     init fills the template placeholder on a freshly-written CLAUDE.md, and refreshes an
  //     existing managed block if one is present. It does NOT append a block to a pre-existing
  //     user CLAUDE.md that has none — that first-injection is owned by SessionStart on next
  //     session open, so init never silently rewrites a user's hand-authored CLAUDE.md.
  //     In a PREVIEW the block cannot be applied (there is no CLAUDE.md to apply
  //     it to), so the preview PREDICTS it: a run that would write CLAUDE.md from
  //     the template would also fill that template's lessons placeholder. Without
  //     this prediction a preview and a real run would describe different sets of
  //     actions, which is the defect one layer over.
  if (dryRun) {
    if (state.wouldCreate.includes('CLAUDE.md')) {
      state.wouldCreate.push('CLAUDE.md (operating-lessons block)');
    }
  } else {
    try {
      const { ensureLessonsBlock, START_MARKER } = require('./claude-md-lessons');
      const ctocRoot = path.resolve(__dirname, '..', '..');   // same base as templatePath
      const wasCreated = created.includes('CLAUDE.md');
      const hasBlock = safeFs.existsSync(claudeMdPath) &&
        safeFs.readFileSync(claudeMdPath, 'utf8').includes(START_MARKER);
      if ((wasCreated || hasBlock) && ensureLessonsBlock(claudeMdPath, ctocRoot)) {
        created.push('CLAUDE.md (operating-lessons block)');
      }
    } catch (err) {
      // Fail-open: a lessons failure must never break project init.
      skipped.push('CLAUDE.md operating-lessons block (' + reportableError(err, projectDir) + ')');
    }
  }

  // 3c. Ensure CTOC-managed operating-manual block (generic craft layer).
  //     Single canonical source: .ctoc/templates/operating-manual.md (resolved via __dirname).
  //     Runs after 3b so it appends the manual block to a CLAUDE.md that already exists
  //     (project nouns + lessons lead; the manual block lands at EOF). Like 3b, it acts
  //     ONLY on a CLAUDE.md that init itself created OR that already carries the managed
  //     block — it never silently rewrites a user's hand-authored CLAUDE.md that has none
  //     (that first-injection is owned by SessionStart). mergeOperatingManual is fail-open
  //     internally; the extra try/catch mirrors 3b for defense-in-depth.
  //     Predicted in a preview for the same reason as 3b.
  if (dryRun) {
    if (state.wouldCreate.includes('CLAUDE.md')) {
      state.wouldCreate.push('CLAUDE.md (operating-manual block)');
    }
  } else {
    try {
      const { mergeOperatingManual, BEGIN_MARKER } = require('./operating-manual');
      const ctocRoot = path.resolve(__dirname, '..', '..');   // same base as templatePath
      const wasCreated = created.includes('CLAUDE.md');
      const hasBlock = safeFs.existsSync(claudeMdPath) &&
        safeFs.readFileSync(claudeMdPath, 'utf8').includes(BEGIN_MARKER);
      if (wasCreated || hasBlock) {
        const res = mergeOperatingManual(projectDir, { ctocRoot });
        if (res.action !== 'unchanged') created.push('CLAUDE.md (operating-manual block)');
      }
    } catch (err) {
      // Fail-open: a manual-merge failure must never break project init.
      skipped.push('CLAUDE.md operating-manual block (' + reportableError(err, projectDir) + ')');
    }
  }

  // 4. Generate IRON_LOOP.md
  const ironLoopPath = path.join(projectDir, 'IRON_LOOP.md');
  if (!safeFs.existsSync(ironLoopPath) || force) {
    if (safeFs.existsSync(ironLoopTemplatePath)) {
      const content = safeFs.readFileSync(ironLoopTemplatePath, 'utf8');
      record(state, 'IRON_LOOP.md', () => safeFs.writeFileSync(ironLoopPath, content, 'utf8'));
    }
  } else {
    skipped.push('IRON_LOOP.md (already exists)');
  }

  // 5. Create directory structure
  const allDirs = [...PLAN_DIRS, ...CTOC_DIRS];
  for (const dir of allDirs) {
    const dirPath = path.join(projectDir, dir);
    if (!safeFs.existsSync(dirPath)) {
      record(state, dir + '/', () => ensureDir(dirPath));
    }
  }

  // 6. Generate .ctoc/settings.yaml
  const settingsPath = path.join(projectDir, '.ctoc', 'settings.yaml');
  if (!safeFs.existsSync(settingsPath) || force) {
    const settingsContent = generateSettings(languages, frameworks);
    record(state, '.ctoc/settings.yaml', () => {
      ensureDir(path.dirname(settingsPath));
      safeFs.writeFileSync(settingsPath, settingsContent, 'utf8');
    });
  } else {
    skipped.push('.ctoc/settings.yaml (already exists)');
  }

  // 7. Generate .ctoc/state/iron-loop.yaml
  const statePath = path.join(projectDir, '.ctoc', 'state', 'iron-loop.yaml');
  if (!safeFs.existsSync(statePath) || force) {
    const stateContent = generateInitialState();
    record(state, '.ctoc/state/iron-loop.yaml', () => {
      ensureDir(path.dirname(statePath));
      safeFs.writeFileSync(statePath, stateContent, 'utf8');
    });
  } else {
    skipped.push('.ctoc/state/iron-loop.yaml (already exists)');
  }

  // 8. Add .ctoc/logs/ to .gitignore if not already there
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (safeFs.existsSync(gitignorePath)) {
    const gitignore = safeFs.readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes('.ctoc/logs/') || !gitignore.includes('.ctoc/state/')) {
      record(state, '.gitignore (updated with CTOC entries)', () => {
        const additions = '\n# CTOC\n.ctoc/logs/\n.ctoc/state/\n';
        safeFs.appendFileSync(gitignorePath, additions, 'utf8');
      });
    }
  }

  // 9. The background post-commit quality hook — a CONSENT DECISION, not a
  //    side effect. It fires on every commit the human ever makes in their own
  //    repository, so setup does not install it. `installGitHook` defaults to
  //    false; only a caller that has ASKED may pass true.
  //
  //    The block used to sit entirely inside `!dryRun`, which made it the one
  //    item a preview HID and a real run always did. Now it is reported in BOTH
  //    modes, so a preview and a real run describe the same set of actions.
  //    Fail-open: a hook failure is recorded and never breaks project setup.
  const hasGitRepo = safeFs.existsSync(path.join(projectDir, '.git'));
  if (hasGitRepo && installGitHook) {
    if (dryRun) {
      state.wouldCreate.push('.git/hooks/post-commit (background quality loop)');
    } else {
      try {
        const { installPostCommitHook } = require('./hooks-installer');
        const res = installPostCommitHook(projectDir);
        if (res.installed) {
          created.push('.git/hooks/post-commit (background quality loop)');
        } else if (res.skipped) {
          skipped.push(`.git/hooks/post-commit (${res.reason || 'already installed'})`);
        }
      } catch (err) {
        state.failed.push(`.git/hooks/post-commit (${reportableError(err, projectDir)})`);
      }
    }
  } else if (hasGitRepo) {
    // Not a failure and not an omission — a decision, reported as one.
    skipped.push(HOOK_NOT_INSTALLED_NOTICE);
  }

  // 10. The verdict is READ BACK from the world, never asserted.
  //     `success` was the literal `true`: true when every write succeeded, true
  //     when every write was skipped, true in a preview that wrote nothing, and
  //     true when a required artifact failed. A field whose value never depends
  //     on anything is not a result.
  const missing = REQUIRED_ARTIFACTS.filter(
    (rel) => !safeFs.existsSync(path.join(projectDir, ...rel.split('/')))
  );

  return {
    // A preview has NO success. `true` would repeat the old lie in a new field;
    // `false` would read as a failure that did not happen. `null` is the honest
    // third value, and it forces a caller to think.
    success: dryRun ? null : (state.failed.length === 0 && missing.length === 0),
    dryRun,
    created,
    wouldCreate: state.wouldCreate,
    skipped,
    failed: state.failed,
    missing,
    detected
  };
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
  // `ctoc plan new` is NOT a command — no such CLI exists, and telling a brand-new
  // user to run it was the first thing CTOC ever said to them. CTOC ships exactly
  // three slash commands (menu, push, update); every workflow goes through the menu.
  lines.push('  2. Run /ctoc:start — create your first plan from the dashboard');
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

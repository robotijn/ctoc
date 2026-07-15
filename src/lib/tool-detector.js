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
const { execFileSync } = require('child_process');
const registry = require('./capability-registry');

/**
 * Correct, framework-specific JS/TS test + coverage invocations, launched via `npx`
 * (Finding B). A framework detected WITHOUT a `scripts.test` is almost always installed
 * ONLY as a devDependency (node_modules/.bin), NOT on PATH — so a bare `vitest run` /
 * `jest` is reported MISSING by `which` (tells the human to install what is already
 * installed) and fails "command not found" under the runner's execSync (neither puts
 * node_modules/.bin on PATH). `npx` resolves node_modules/.bin; the SUBCOMMAND after it
 * is what keeps each invocation honest: `vitest run` (not `npx vitest`, which enters WATCH
 * mode and never exits), `playwright test` (not `npx playwright`, which prints usage and
 * runs ZERO tests). Coverage uses the correct per-framework form (`npx nyc mocha` /
 * `npx c8 ava`, never an invalid `--coverage` flag); a `null` coverage means the framework
 * has no coverage mode (e.g. Playwright), so we emit nothing rather than a wrong flag.
 *
 * The prior R10 fix deleted `npx` wholesale, over-correcting past the real defect — the
 * watch-hang came from the MISSING subcommand (`npx vitest`), not from `npx` itself.
 * @type {Object<string, {test: string, coverage: (string|null)}>}
 */
const JS_FRAMEWORK_COMMANDS = {
  vitest:     { test: 'npx vitest run',      coverage: 'npx vitest run --coverage' },
  jest:       { test: 'npx jest',            coverage: 'npx jest --coverage' },
  mocha:      { test: 'npx mocha',           coverage: 'npx nyc mocha' },
  ava:        { test: 'npx ava',             coverage: 'npx c8 ava' },
  playwright: { test: 'npx playwright test', coverage: null },
  tap:        { test: 'npx tap',             coverage: 'npx tap --coverage' }
};

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
 * Check if a command exists — ARGV-SAFE, no shell (Findings 1 & 7).
 *
 * The tool token is looked up via `execFileSync('which'|'where', [tool])`, NOT
 * interpolated into a shell string. A capability `cmd` is untrusted data (a project may
 * drop a hostile `.ctoc/capabilities` override); the old `execSync('which ' + tok)` fed
 * it to `/bin/sh`, so a token like `zzz||touch$IFS/tmp/PWNED` executed during detection.
 * With execFile there is no shell: the whole token is one inert argv value that either
 * resolves or does not — never runs.
 *
 * A project-local launcher (POSIX `./gradlew`, Windows `gradlew.bat`) is resolved against
 * the PROJECT dir, not PATH — `which ./gradlew` never works, so a real project-local
 * wrapper was always reported "missing" (Finding 7). We resolve it via the filesystem
 * relative to projectPath instead.
 *
 * @param {string} cmd the inert command string (first token is the tool).
 * @param {string} [projectPath] project root — project-local launchers resolve against it.
 * @returns {boolean}
 */
function commandExists(cmd, projectPath = process.cwd()) {
  try {
    const tool = String(cmd).split(' ')[0];
    if (tool.startsWith('./') || tool.startsWith('.\\') || tool === 'gradlew.bat') {
      const rel = tool.replace(/^\.[\\/]/, '');
      return safeFs.existsSync(path.join(projectPath, rel));
    }
    const finder = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(finder, [tool], { stdio: 'ignore', cwd: projectPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * The real tool NAME for an install hint, stripping launcher prefixes so the hint names
 * the tool the user must install — not the launcher (Finding 9). `./gradlew test` → gradle,
 * `bundle exec rspec` → rspec, `vitest run` → vitest, `nyc mocha` → mocha. `npx`/`npm`
 * were the specific launchers the old `cmd.split(' ')[0]` surfaced ("Install npx for …").
 * @param {string} cmd
 * @returns {string}
 */
function toolNameForInstall(cmd) {
  const parts = String(cmd).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return String(cmd);
  if (/(^|[\\/])gradlew(\.bat)?$/.test(parts[0])) return 'gradle';
  const launchers = new Set(['npx', 'npm', 'bundle', 'exec', 'c8', 'nyc', 'run']);
  let i = 0;
  while (i < parts.length - 1 && launchers.has(parts[i])) i++;
  return parts[i] || parts[0];
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
 * The project has TypeScript EVIDENCE — a tsconfig.json, or an actual `.ts`/`.tsx`
 * source at the root. Aligns with the R8 capability-registry rule (typescript needs
 * tsconfig.json): without evidence, a bare package.json must NOT conjure a phantom
 * typescript toolchain whose `tsc --noEmit` errors "no inputs were found" (Finding 4).
 * @param {string} projectPath
 * @returns {boolean}
 */
function hasTypeScriptEvidence(projectPath) {
  if (safeFs.existsSync(path.join(projectPath, 'tsconfig.json'))) return true;
  try {
    return safeFs.readdirSync(projectPath).some((f) => /\.(ts|tsx|mts|cts)$/.test(f));
  } catch {
    return false;
  }
}

/**
 * The project's declared npm test script (`package.json` → `scripts.test`), or null.
 * A declared script is the honest, authoritative test command and is used VERBATIM.
 * @param {string} projectPath
 * @returns {string|null}
 */
function readJsTestScript(projectPath) {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!safeFs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(safeFs.readFileSync(pkgPath, 'utf8'));
    const t = pkg.scripts && pkg.scripts.test;
    return typeof t === 'string' && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Read user config (.ctoc/quality-config.yaml) raw text, or null when absent/unreadable.
 * @param {string} projectPath
 * @returns {{raw: string, path: string}|null}
 */
function readUserConfig(projectPath = process.cwd()) {
  const configPath = path.join(projectPath, '.ctoc', 'quality-config.yaml');
  if (!safeFs.existsSync(configPath)) return null;

  try {
    const content = safeFs.readFileSync(configPath, 'utf8');
    return { raw: content, path: configPath };
  } catch {
    return null;
  }
}

/**
 * Strip a trailing `# …` comment from a YAML line, honoring simple quotes (a `#` opens a
 * comment only at line start or after whitespace). Zero-dependency, pure string parsing —
 * the same approach the codebase's other config readers use.
 * @param {string} s
 * @returns {string}
 */
function stripYamlComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

/**
 * Parse a scalar YAML value: `null`/`~`/empty → null; a quoted string → its inner text;
 * anything else → the trimmed bareword (e.g. `eslint .`, `npm test -- --coverage`).
 * @param {string} v
 * @returns {string|null}
 */
function parseYamlScalar(v) {
  const t = v.trim();
  if (t === '' || t === 'null' || t === '~') return null;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parse the `languages:` section of a quality-config.yaml into per-language phase
 * overrides — Finding 8. Wires the previously-ignored user override hatch: for each
 * `languages.<lang>` block we read the scalar `lint`/`typecheck`/`test`/`coverage` values
 * (a `null` means "explicitly no command for this phase"). Block-sequence sub-keys like
 * `detect:` are skipped — only the scalar phase commands are honored. The parser is a
 * minimal 2-space-indent block-map reader (zero dependencies), matching the shape of the
 * shipped template.
 *
 * @param {string} raw the quality-config.yaml text.
 * @returns {Object<string, {lint?: (string|null), typecheck?: (string|null), test?: (string|null), coverage?: (string|null)}>}
 */
function parseUserLanguageOverrides(raw) {
  const PHASES = ['lint', 'typecheck', 'test', 'coverage'];
  /** @type {Object.<string, Object>} */
  const out = {};
  let inLanguages = false;
  let curLang = null;
  let langIndent = null; // indent of the language-name tier (first empty-value key under languages)

  for (const rawLine of String(raw).split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.match(/^ */)[0].length;
    const body = stripYamlComment(rawLine).trim();
    if (!body) continue;

    if (indent === 0) {
      inLanguages = /^languages\s*:\s*$/.test(body);
      curLang = null;
      langIndent = null;
      continue;
    }
    if (!inLanguages) continue;

    const ci = body.indexOf(':');
    if (ci === -1) continue;
    const key = body.slice(0, ci).trim().replace(/^["']|["']$/g, '');
    const valRaw = body.slice(ci + 1).trim();

    if (valRaw === '') {
      // A container key. The SHALLOWEST such tier under `languages:` is the language name;
      // deeper empty-value keys (e.g. `detect:`) are ignored.
      if (langIndent === null) langIndent = indent;
      if (indent === langIndent) {
        curLang = key;
        out[curLang] = {};
      }
      continue;
    }
    // A scalar phase command, deeper than the language tier.
    if (curLang && langIndent !== null && indent > langIndent && PHASES.includes(key)) {
      out[curLang][key] = parseYamlScalar(valRaw);
    }
  }
  return out;
}

/**
 * Finding C — the space-only indent reader in parseUserLanguageOverrides (it counts leading
 * spaces only) silently drops a TAB-indented `languages:` block: a leading tab yields a
 * computed indent of 0, so
 * `\tjavascript:` is read as a top-level key, the override vanishes, and `source` stays
 * 'auto-detect' with NO signal to the user. Detect leading-tab indentation anywhere inside
 * the `languages:` block so the caller can WARN — mirroring capability-registry's
 * skip-and-warn contract (a malformed override is never silently ignored).
 * @param {string} raw the quality-config.yaml text
 * @returns {boolean} true iff a line under `languages:` is indented with a tab
 */
function configUsesTabIndentedLanguages(raw) {
  let inLanguages = false;
  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      // A top-level (unindented) key toggles whether we are inside `languages:`.
      inLanguages = /^languages\s*:\s*$/.test(line.trim());
      continue;
    }
    // An indented line whose leading whitespace contains a tab is the dropped-override bug.
    if (inLanguages && /^ *\t/.test(line)) return true;
  }
  return false;
}

/**
 * Resolve the lint/typecheck/test/coverage commands for a language from the capability
 * registry (the single source of truth). Each command is an inert STRING; a phase the
 * language does not define yields `null` (same shape the old DEFAULT_TOOLS table
 * produced). This is what extends tool coverage from the 7 DEFAULT_TOOLS languages to
 * all 20 registry languages.
 *
 * CR5-FIX F4: the registry `languages` map is loaded ONCE per `detectTools` call and
 * passed in, instead of calling `registry.toolchainFor` four times per language (each
 * of which re-ran a full readdir+stat+read+parse of ~20 YAMLs). This preserves the
 * read-fresh rule — a single fresh load per invocation, never a cross-call cache — the
 * lookup here is a pure in-memory index into that one load.
 *
 * @param {string} lang
 * @param {Object<string, Object>} registryLanguages the once-loaded registry map
 * @returns {{lint: (string|null), typecheck: (string|null), test: (string|null), coverage: (string|null), testFramework?: string}}
 */
function toolsFromRegistry(lang, registryLanguages) {
  /** @type {{lint: (string|null), typecheck: (string|null), test: (string|null), coverage: (string|null), testFramework?: string}} */
  /** @type {{lint: ?string, typecheck: ?string, test: ?string, coverage: ?string, testFramework?: string, testUndetermined?: boolean}} */
  const tools = { lint: null, typecheck: null, test: null, coverage: null };
  const cap = registryLanguages && registryLanguages[lang];
  const toolchain = cap && cap.toolchain && typeof cap.toolchain === 'object' ? cap.toolchain : {};
  for (const phase of ['lint', 'typecheck', 'test', 'coverage']) {
    const entry = toolchain[phase];
    tools[phase] = entry && typeof entry === 'object' && typeof entry.cmd === 'string' ? entry.cmd : null;
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
    source: 'auto-detect',
    warnings: []
  };

  // 1. Check user config first (explicit override — the highest-priority source). We
  //    PARSE the languages section (Finding 8) instead of the old no-op that set
  //    source:'user-config' and then ignored the file. `source` is only flipped to
  //    'user-config' below if an override actually takes effect on a detected language.
  const userConfig = readUserConfig(projectPath);
  const userLangOverrides = userConfig ? parseUserLanguageOverrides(userConfig.raw) : null;
  let appliedUserOverride = false;

  // Finding C: a TAB-indented `languages:` block is silently dropped by the space-only
  // indent reader. Surface a warning so the user knows their override never took effect,
  // rather than the confusing silent 'auto-detect' fallthrough.
  if (userConfig && configUsesTabIndentedLanguages(userConfig.raw)) {
    result.warnings.push({
      file: userConfig.path,
      message: 'tab-indented `languages:` overrides in .ctoc/quality-config.yaml were IGNORED — '
        + 'YAML requires SPACE indentation, so your per-language overrides were DROPPED '
        + '(falling back to auto-detect). Re-indent the languages block with spaces.'
    });
  }

  // 2. Auto-detect languages
  result.languages = detectLanguages(projectPath);

  // Load the capability registry ONCE for this call (CR5-FIX F4): every language's
  // toolchain is looked up from this single fresh load rather than re-loading ~20
  // YAMLs four times per language. Fresh per invocation (on-disk truth wins), never
  // cached across calls.
  const registryLanguages = registry.load(projectPath).languages;

  // 3. For each language, detect/set tools — commands come from the capability
  //    registry, NOT the static DEFAULT_TOOLS table. This is what gives ALL 20
  //    registry languages a toolchain (csharp/php previously got none).
  for (const lang of result.languages) {
    // Finding 4: `detectLanguages` still lists `typescript` for a bare package.json
    // (legacy back-compat), but WITHOUT a tsconfig.json or any .ts source that toolchain
    // (`tsc --noEmit`) is phantom — it errors "no inputs were found". Do not fabricate a
    // typescript toolchain unless there is real TypeScript evidence.
    if (lang === 'typescript' && !hasTypeScriptEvidence(projectPath)) continue;

    /** @type {{lint: ?string, typecheck: ?string, test: ?string, coverage: ?string, testFramework?: string, testUndetermined?: boolean}} */
    const tools = toolsFromRegistry(lang, registryLanguages);

    // JAVA build-system nuance (documented decision): the registry's java commands are
    // Maven-only, but the prior DEFAULT_TOOLS used a gradle||mvn fallback. When a Gradle
    // build file is present, use the Gradle form (preserving prior Gradle-project
    // behavior); otherwise keep the registry's Maven commands.
    if (lang === 'java'
        && (safeFs.existsSync(path.join(projectPath, 'build.gradle'))
          || safeFs.existsSync(path.join(projectPath, 'build.gradle.kts')))) {
      // CR5-FIX F5 (cross-platform): the Gradle wrapper is `gradlew.bat` on Windows
      // and `./gradlew` on POSIX. Hardcoding `./gradlew` made every Gradle command
      // (and its `commandExists('where ./gradlew')` probe) fail on Windows.
      const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
      tools.lint = `${gradlew} checkstyleMain`;
      tools.typecheck = `${gradlew} compileJava`;
      tools.test = `${gradlew} test`;
      tools.coverage = `${gradlew} jacocoTestReport`;
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

    // Language-specific detection (Findings 2,3,5,6): resolve the CORRECT test/coverage
    // commands. A declared `scripts.test` is authoritative and used VERBATIM; otherwise a
    // known framework maps to its correct invocation (`vitest run`, `playwright test`,
    // `nyc mocha`, …), never the old broken `npx <framework>` / `npx <framework> --coverage`.
    // When nothing is determinable, the test command is surfaced as UNDETERMINED (null +
    // flag) rather than a plausible-but-wrong `npm test`.
    if (lang === 'javascript' || lang === 'typescript') {
      const framework = detectJsTestFramework(projectPath);
      const scriptTest = readJsTestScript(projectPath);
      if (framework) tools.testFramework = framework;
      const fw = framework ? JS_FRAMEWORK_COMMANDS[framework] : null;

      if (scriptTest) {
        tools.test = scriptTest; // honest: the project declares its own test command
      } else if (fw) {
        tools.test = fw.test;    // framework-correct runner (never bare `npx <fw>`)
      } else {
        tools.test = null;       // genuinely undetermined — surfaced, not guessed
        tools.testUndetermined = true;
      }

      if (fw) {
        tools.coverage = fw.coverage; // framework-correct; null when the fw has no coverage mode
      } else if (!scriptTest) {
        tools.coverage = null;        // undetermined
      }
      // else (custom script, unknown framework): keep the registry coverage command.
    } else if (lang === 'python') {
      const framework = detectPythonTestFramework(projectPath);
      if (framework) {
        tools.testFramework = framework;
      }
    }

    // User config wins (Finding 8): apply explicit per-phase overrides for this language.
    // A `null` value is an explicit "no command for this phase". Only phases the user
    // declared are overridden; the rest keep the detected/registry value.
    if (userLangOverrides && userLangOverrides[lang]) {
      const ov = userLangOverrides[lang];
      for (const phase of ['lint', 'typecheck', 'test', 'coverage']) {
        if (Object.prototype.hasOwnProperty.call(ov, phase)) {
          tools[phase] = ov[phase];
          appliedUserOverride = true;
          if (phase === 'test') delete tools.testUndetermined;
        }
      }
    }

    result.tools[lang] = tools;

    // Check which real toolchain phases are missing (only the four command phases — never
    // metadata like testFramework/testUndetermined, which are not commands to look up).
    for (const phase of ['lint', 'typecheck', 'test', 'coverage']) {
      const cmd = tools[phase];
      if (cmd && !commandExists(cmd, projectPath)) {
        result.missing.push({
          tool: phase,
          command: cmd,
          language: lang,
          install: getInstallCommand(toolNameForInstall(cmd), lang)
        });
      }
    }
  }

  // Only claim source:'user-config' when an override actually took effect (Finding 8):
  // never assert an override happened when the config touched no detected language.
  if (appliedUserOverride) result.source = 'user-config';

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

  if (Array.isArray(results.warnings) && results.warnings.length > 0) {
    console.log('⚠️  Config warnings:\n');
    for (const w of results.warnings) {
      console.log(`  ${w.message}${w.file ? ` (${w.file})` : ''}\n`);
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

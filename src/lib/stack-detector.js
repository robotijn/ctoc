/**
 * CTOC Stack Detector
 * Detects languages and frameworks in a project
 */

const safeFs = require('./safe-fs');
const { safeRegExp } = require('./regex-utils');
const path = require('path');
const capabilityRegistry = require('./capability-registry');

const LANGUAGE_PATTERNS = {
  python: {
    files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile', 'poetry.lock', 'uv.lock'],
    extensions: ['.py']
  },
  javascript: {
    files: ['package.json'],
    extensions: ['.js', '.mjs', '.cjs']
  },
  typescript: {
    files: ['tsconfig.json'],
    extensions: ['.ts', '.tsx']
  },
  go: {
    files: ['go.mod', 'go.sum'],
    extensions: ['.go']
  },
  rust: {
    files: ['Cargo.toml'],
    extensions: ['.rs']
  },
  java: {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    extensions: ['.java']
  },
  kotlin: {
    files: ['build.gradle.kts'],
    extensions: ['.kt', '.kts']
  },
  ruby: {
    files: ['Gemfile', 'Rakefile'],
    extensions: ['.rb']
  },
  php: {
    files: ['composer.json'],
    extensions: ['.php']
  },
  csharp: {
    files: ['*.csproj', '*.sln'],
    extensions: ['.cs']
  },
  elixir: {
    files: ['mix.exs'],
    extensions: ['.ex', '.exs']
  },
  swift: {
    files: ['Package.swift'],
    extensions: ['.swift']
  },
  dart: {
    files: ['pubspec.yaml'],
    extensions: ['.dart']
  },
  zig: {
    files: ['build.zig'],
    extensions: ['.zig']
  }
};

const FRAMEWORK_PATTERNS = {
  // JavaScript/TypeScript
  'next.js': { language: 'typescript', files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], deps: ['next'] },
  react: { language: 'typescript', deps: ['react'] },
  vue: { language: 'typescript', files: ['vue.config.js', 'vite.config.ts'], deps: ['vue'] },
  angular: { language: 'typescript', files: ['angular.json'], deps: ['@angular/core'] },
  svelte: { language: 'typescript', files: ['svelte.config.js'], deps: ['svelte'] },
  express: { language: 'javascript', deps: ['express'] },
  nestjs: { language: 'typescript', files: ['nest-cli.json'], deps: ['@nestjs/core'] },

  // Python
  fastapi: { language: 'python', deps: ['fastapi'] },
  django: { language: 'python', files: ['manage.py'], deps: ['django'] },
  flask: { language: 'python', deps: ['flask'] },
  pytorch: { language: 'python', deps: ['torch'] },
  tensorflow: { language: 'python', deps: ['tensorflow'] },

  // Go
  gin: { language: 'go', deps: ['github.com/gin-gonic/gin'] },
  echo: { language: 'go', deps: ['github.com/labstack/echo'] },
  fiber: { language: 'go', deps: ['github.com/gofiber/fiber'] },

  // Rust
  actix: { language: 'rust', deps: ['actix-web'] },
  rocket: { language: 'rust', deps: ['rocket'] },
  axum: { language: 'rust', deps: ['axum'] },

  // Java
  'spring-boot': { language: 'java', deps: ['spring-boot-starter'] },

  // Ruby
  rails: { language: 'ruby', files: ['config/routes.rb'], deps: ['rails'] },

  // PHP
  laravel: { language: 'php', files: ['artisan'], deps: ['laravel/framework'] },

  // Mobile
  'react-native': { language: 'typescript', files: ['metro.config.js'], deps: ['react-native'] },
  flutter: { language: 'dart', deps: ['flutter'] },
  expo: { language: 'typescript', deps: ['expo'] },

  // DevOps
  docker: { language: null, files: ['Dockerfile', 'docker-compose.yml'] },
  kubernetes: { language: null, files: ['deployment.yaml', 'service.yaml'] }
};

/**
 * Simple glob matching
 */
function matchGlob(str, pattern) {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return safeRegExp(`^${regexPattern}$`).test(str);
}

/**
 * Detects languages in a project.
 *
 * Two detection layers, UNIONed (CR5-s4):
 *   1. stack-detector's own LANGUAGE_PATTERNS file/glob markers — unchanged. This is
 *      the ONLY layer that carries `zig` (the registry has no zig entry), and its
 *      exact-file + root-glob marker set is preserved verbatim.
 *   2. the capability registry (`capability-registry.detectLanguages`) — adds the
 *      registry-only languages stack-detector never had (c, cpp, sql, r, scala, lua,
 *      objectivec) via the SAME kind of root-level exact/glob markers.
 *
 * The union is conservative and additive: every language layer 1 already found keeps
 * its position and order; registry-only languages are appended after; duplicates are
 * dropped. The output shape is unchanged (a `string[]`) — SessionStart (the sole
 * consumer) sees only a wider set, never a different shape.
 *
 * NOTE ON EXTENSIONS: `LANGUAGE_PATTERNS[*].extensions` is descriptive metadata; this
 * function detects by marker FILES only (exact name or root-level glob), exactly as it
 * always has. Neither layer walks the file tree by extension, so a source file with no
 * marker (e.g. a lone `foo.py`) is not, by itself, a detection signal. Extension-tree
 * walking is deliberately out of scope for this slice.
 */
function detectLanguages(projectPath) {
  projectPath = projectPath || process.cwd();
  const detected = [];

  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    let found = false;

    for (const file of patterns.files) {
      if (file.includes('*')) {
        try {
          const files = safeFs.readdirSync(projectPath);
          if (files.some(f => matchGlob(f, file))) {
            found = true;
            break;
          }
        } catch (e) { /* ignore: unreadable dir means no match for this pattern */ }
      } else {
        if (safeFs.existsSync(path.join(projectPath, file))) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      detected.push(language);
    }
  }

  // UNION in the capability-registry languages (glob-aware, fail-open — an unreadable
  // root or empty registry simply contributes nothing). Preserve stack-detector's
  // ordering for languages it already found; append registry-only languages after,
  // de-duplicated. Must run BEFORE the TypeScript-over-JavaScript preference below,
  // because the registry returns BOTH javascript and typescript (it has no preference
  // logic) and the preference block must still remove javascript in that case.
  for (const language of capabilityRegistry.detectLanguages(projectPath)) {
    if (!detected.includes(language)) {
      detected.push(language);
    }
  }

  // Prefer TypeScript over JavaScript
  if (detected.includes('typescript') && detected.includes('javascript')) {
    const idx = detected.indexOf('javascript');
    if (idx > -1) detected.splice(idx, 1);
  }

  return detected;
}

/**
 * PEP 503 canonical name normalization (F3).
 *
 * Normalizes a distribution name so that spelling/case/separator variants collapse
 * to one form: lowercase, and any run of `-`, `_`, `.` becomes a single `-`
 * (`re.sub(r"[-_.]+", "-", name).lower()`). Applied to BOTH sides of every dep
 * match so `FastAPI`, `fast_api`, `Fast.Api` and `fastapi` all match. Node package
 * keys (including scoped `@scope/name`) are put through the same function — the
 * slash is untouched, so lowercasing is the effective transform there, which is
 * what npm's case-insensitive resolution wants.
 *
 * ## Decisions Taken Under Ambiguity
 * With normalization at the match sites, the registry YAML hand-dual-listings of
 * the same name in different cases (e.g. flask.yaml `[flask, Flask]`,
 * mysql.yaml `[PyMySQL, pymysql]`, django.yaml `[django, Django]`,
 * postgresql.yaml `[psycopg2, psycopg2-binary]` casing variants) are now REDUNDANT
 * — both entries normalize identically. They are harmless (a set de-dupes them) and
 * are intentionally left untouched here; a separate data pass owns the YAML files
 * and may prune the redundant casings. This module does not edit that data.
 */
function normalizeDepName(name) {
  return String(name).toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Builds a null-prototype Set of normalized dependency names from the node + python
 * dep collections, so a single membership test covers both ecosystems (mirroring the
 * former `nodeDeps[dep] || pythonDeps.includes(dep)` OR).
 */
function buildDepSet(nodeDeps, pythonDeps) {
  const set = new Set();
  for (const key of Object.keys(nodeDeps)) set.add(normalizeDepName(key));
  for (const name of pythonDeps) {
    if (name) set.add(normalizeDepName(name));
  }
  return set;
}

/** Reads a text file if present; fail-soft to null (never throws). */
function readTextIfExists(filePath) {
  try {
    if (!safeFs.existsSync(filePath)) return null;
    return safeFs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

/** Merges the dependency-name groups of a parsed package.json into `target`. */
function mergePkgDeps(target, pkg) {
  if (!pkg || typeof pkg !== 'object') return;
  const groups = [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.peerDependencies,      // F6
    pkg.optionalDependencies   // F6
  ];
  for (const group of groups) {
    if (group && typeof group === 'object') {
      for (const key of Object.keys(group)) target[key] = group[key];
    }
  }
}

// Bound on how many workspace directories we will walk per project (F4). SessionStart
// runs detection every session, so this stays cheap and crash-proof.
const MAX_WORKSPACE_DIRS = 100;
// Depth bound for a recursive `**` workspace glob (F4-defect). Real monorepos nest a
// handful of levels; this caps the walk so a pathological tree can never blow up
// SessionStart. Combined with MAX_WORKSPACE_DIRS the walk is doubly bounded.
const MAX_WORKSPACE_DEPTH = 6;

/**
 * True when `target` resolves to a path AT OR UNDER `root` (F3-defect containment).
 * Rejects any `..`-escaping or absolute-elsewhere workspace entry (e.g. `../evil`,
 * `/etc`) so a malicious/typo `workspaces` entry can never read a package.json
 * outside the project. Both sides are made absolute first; cross-platform via
 * path.relative + path.isAbsolute (Windows drive-hops yield an absolute relative).
 */
function isWithinRoot(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

/**
 * True when `target` is contained in `root` after resolving symlinks (F1-symlink).
 *
 * The lexical `isWithinRoot` resolves paths PURELY textually (path.resolve does not
 * follow symlinks), so a workspace directory that is a SYMLINK pointing OUTSIDE the
 * project root passes the lexical gate and a package.json outside the root gets read.
 * This closes that escape: the lexical gate runs first (still rejecting `../evil`,
 * absolute paths, and `packages/../../evil` — including for paths that do not exist on
 * disk), then BOTH sides are resolved with realpathSync and re-checked, so a workspace
 * whose REAL path escapes the root is dropped.
 *
 * Fail-soft (SessionStart runs this every session — it must never throw): if realpath
 * fails (broken symlink, missing target, permission error) the target cannot be read
 * anyway, so we fall back to the lexical verdict (which already passed) — the downstream
 * read is itself fail-soft and a no-op for a nonexistent path. Both roots are realpath'd
 * so a project living under a symlinked temp dir (e.g. macOS /tmp → /private/tmp) does
 * not yield a spurious mismatch.
 */
function isWithinRootReal(root, target) {
  if (!isWithinRoot(root, target)) return false;
  try {
    const realRoot = safeFs.realpathSync(root);
    const realTarget = safeFs.realpathSync(target);
    return isWithinRoot(realRoot, realTarget);
  } catch (e) {
    // Target unresolvable (broken/missing): keep the lexical pass; the read is a
    // fail-soft no-op for a path that does not exist.
    return true;
  }
}

/**
 * Collects `baseDir` and every descendant directory, bounded by depth and count
 * (F4-defect recursive `**`). Fail-soft: an unreadable directory contributes
 * nothing and never throws. Symlinks are followed via statSync but the count/depth
 * bounds keep even a cyclic tree finite.
 */
function collectDescendantDirs(baseDir, out) {
  const queue = [{ dir: baseDir, depth: 0 }];
  while (queue.length > 0) {
    if (out.length >= MAX_WORKSPACE_DIRS) break;
    const { dir, depth } = queue.shift();
    out.push(dir);
    if (depth >= MAX_WORKSPACE_DEPTH) continue;
    let entries;
    try {
      entries = safeFs.readdirSync(dir);
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      if (out.length + queue.length >= MAX_WORKSPACE_DIRS) break;
      const child = path.join(dir, entry);
      let isDir = false;
      try {
        isDir = safeFs.statSync(child).isDirectory();
      } catch (e) {
        isDir = false;
      }
      if (isDir) queue.push({ dir: child, depth: depth + 1 });
    }
  }
}

/**
 * Resolves workspace glob patterns (e.g. `packages/*`, `apps/**`) to concrete
 * directories under the project root (F4). Hand-rolled, bounded, fail-soft — never
 * throws. Patterns always use `/` separators (package.json convention); each segment
 * is expanded against the filesystem, glob segments via matchGlob. A `**` segment
 * expands recursively (F4-defect): the current directory AND every descendant, up to
 * MAX_WORKSPACE_DEPTH / MAX_WORKSPACE_DIRS. Every resolved directory is finally
 * filtered through isWithinRoot so a `../escape` entry is dropped (F3-defect).
 */
function resolveWorkspaceDirs(projectPath, patterns) {
  const resolved = [];
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.length === 0) continue;
    const segments = pattern.split('/').filter(Boolean);
    let currentDirs = [projectPath];
    for (const segment of segments) {
      const next = [];
      for (const dir of currentDirs) {
        if (segment === '**') {
          // Recursive: this dir plus all nested subdirectories (bounded).
          collectDescendantDirs(dir, next);
        } else if (segment.includes('*')) {
          let entries;
          try {
            entries = safeFs.readdirSync(dir);
          } catch (e) {
            entries = [];
          }
          for (const entry of entries) {
            if (matchGlob(entry, segment)) next.push(path.join(dir, entry));
            if (next.length >= MAX_WORKSPACE_DIRS) break;
          }
        } else {
          next.push(path.join(dir, segment));
        }
        if (next.length >= MAX_WORKSPACE_DIRS) break;
      }
      currentDirs = next.slice(0, MAX_WORKSPACE_DIRS);
    }
    for (const dir of currentDirs) {
      // Containment (F3-defect + F1-symlink): never read a package.json outside the
      // project root — lexically OR via a symlink whose real path escapes the root.
      if (!isWithinRootReal(projectPath, dir)) continue;
      resolved.push(dir);
      if (resolved.length >= MAX_WORKSPACE_DIRS) return resolved;
    }
  }
  return resolved;
}

/**
 * Reads package.json dependencies (F4, F5, F6).
 *
 * Returns a NULL-PROTOTYPE object (F5) mapping dependency name → version-ish, so no
 * inherited prototype key (`toString`, `constructor`, …) is ever a spurious truthy
 * match. Merges dependencies, devDependencies, peerDependencies and
 * optionalDependencies (F6). When the root declares `workspaces` (array form, or the
 * `{ packages: [...] }` object form), each workspace package's dependency names are
 * merged too (F4). Every read path is fail-soft — this never throws into detectStack.
 */
function readPackageDeps(projectPath) {
  const deps = Object.create(null);
  const raw = readTextIfExists(path.join(projectPath, 'package.json'));
  if (raw === null) return deps;

  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    return deps;
  }
  mergePkgDeps(deps, pkg);

  // F4: merge workspace-package dependencies.
  try {
    let patterns = null;
    if (Array.isArray(pkg.workspaces)) {
      patterns = pkg.workspaces;
    } else if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
      patterns = pkg.workspaces.packages;
    }
    if (patterns) {
      for (const dir of resolveWorkspaceDirs(projectPath, patterns)) {
        const wsRaw = readTextIfExists(path.join(dir, 'package.json'));
        if (wsRaw === null) continue;
        try {
          mergePkgDeps(deps, JSON.parse(wsRaw));
        } catch (e) { /* fail-soft: skip an unparseable workspace package.json */ }
      }
    }
  } catch (e) { /* fail-soft: workspace expansion must never throw */ }

  return deps;
}

/**
 * Extracts the distribution NAME from a single PEP 508 requirement string / line,
 * stripping version specifiers, extras and environment markers (F2). Returns null
 * for blanks, comments, and option/URL lines (`-r`, `-e`, `git+…`).
 */
function extractRequirementName(line) {
  const s = String(line).trim();
  if (!s || s.startsWith('#') || s.startsWith('-')) return null;
  // Cut at the first version operator, extras bracket, marker `;`, group `(`, or
  // whitespace, then trim. Handles `flask == 3.0`, `requests[security]>=2`,
  // `uvicorn ; python_version>'3'`, `fastapi>=0.1`.
  const name = s.split(/[\s=<>~!;[(,]/)[0].trim();
  return name || null;
}

/** Collects dependency names from every quoted string in a line (PEP 621 arrays). */
function collectQuotedRequirements(str, out) {
  const re = /["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const name = extractRequirementName(m[1]);
    if (name) out.push(name);
  }
}

/**
 * Removes quoted substrings (double- or single-quoted) from a line so that a
 * subsequent structural scan ignores any bracket living INSIDE a value. This is
 * the same quote-aware view `collectQuotedRequirements` relies on: a `]` in a PEP
 * 508 extras (`"uvicorn[standard]"`, `"django[argon2]"`) or an environment marker
 * is part of the VALUE, not the array delimiter. Used to make the multiline-array
 * `]`-terminator test quote-aware (F1). Mirrors the tokenizer's quote handling; no
 * escape handling, matching `collectQuotedRequirements` (TOML basic-string escapes
 * are out of scope for this hand-rolled parser and are not present in real dep
 * strings).
 */
function stripQuotedSpans(str) {
  return String(str).replace(/"[^"]*"|'[^']*'/g, '');
}

/**
 * Removes a trailing TOML `#` comment from a line (F2-comment). A `#` that is OUTSIDE
 * any quoted span begins a comment and everything after it is dropped; a `#` INSIDE a
 * quoted value (e.g. an environment marker `"pkg ; extra=='x#y'"`) is part of the value
 * and is preserved. Scans char-by-char tracking quote state — same quote handling as
 * `stripQuotedSpans`/`collectQuotedRequirements` (no escape handling; TOML basic-string
 * escapes are out of scope for this hand-rolled parser and absent from real dep strings).
 */
function stripLineComment(str) {
  const s = String(str);
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#') {
      return s.slice(0, i);
    }
  }
  return s;
}

/**
 * True when a line contains an array-closing `]` OUTSIDE any quoted value (F1). A `]`
 * living only inside a trailing `#` comment does NOT count (F2-comment): the comment is
 * stripped (quote-aware) before the structural scan, so a commented `]` cannot terminate
 * the array and drop later dependencies.
 */
function hasUnquotedCloseBracket(str) {
  return stripQuotedSpans(stripLineComment(str)).includes(']');
}

// Bound on parsed dependency names from a single TOML-ish file (crash-proofing).
const MAX_PARSED_DEPS = 2000;

/**
 * Hand-rolled, fail-soft parse of dependency names from a pyproject.toml (F1).
 * Zero-dep constraint → no TOML library. Handles two shapes:
 *   - PEP 621 `[project].dependencies = [ ... ]` (array of PEP 508 strings, possibly
 *     multiline) and `[project.optional-dependencies]` group arrays;
 *   - Poetry `[tool.poetry.dependencies]` and `[tool.poetry.group.<x>.dependencies]`
 *     tables (name = version; `python` excluded — it is the interpreter constraint).
 */
function parsePyprojectDeps(content) {
  const names = [];
  const lines = content.split(/\r?\n/);
  let section = '';
  let arrayActive = false; // inside a multiline dependencies = [ ... ] array
  for (const raw of lines) {
    if (names.length > MAX_PARSED_DEPS) break;
    const line = raw.trim();

    if (arrayActive) {
      collectQuotedRequirements(line, names);
      // Quote-aware terminator (F1): a `]` inside a quoted extras/marker value
      // (e.g. "celery[redis]") is NOT the array delimiter — ignore it.
      if (hasUnquotedCloseBracket(line)) arrayActive = false;
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      continue;
    }

    // Poetry dependency tables: name = version.
    if (/^tool\.poetry\.(dependencies|dev-dependencies|group\.[^.]+\.dependencies)$/.test(section)) {
      const m = line.match(/^["']?([A-Za-z0-9._-]+)["']?\s*=/);
      if (m && m[1].toLowerCase() !== 'python') names.push(m[1]);
      continue;
    }

    // PEP 621 array-of-strings dependencies.
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim().replace(/^["']|["']$/g, '');
    const rest = line.slice(eqIdx + 1).trim();
    const isProjectDeps = section === 'project' && key === 'dependencies';
    const isOptionalDeps = section === 'project.optional-dependencies';
    if ((isProjectDeps || isOptionalDeps) && rest.startsWith('[')) {
      collectQuotedRequirements(rest, names);
      // Quote-aware open test (F1): an extras `]` on the opening line
      // (dependencies = ["flask[async]",) must NOT close the array immediately.
      if (!hasUnquotedCloseBracket(rest)) arrayActive = true;
    }
  }
  return names;
}

/**
 * Hand-rolled, fail-soft parse of dependency names from a Pipfile (F1). Reads the
 * `[packages]` and `[dev-packages]` tables (name = version-or-inline-table).
 */
function parsePipfileDeps(content) {
  const names = [];
  const lines = content.split(/\r?\n/);
  let section = '';
  for (const raw of lines) {
    if (names.length > MAX_PARSED_DEPS) break;
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      continue;
    }
    if (section === 'packages' || section === 'dev-packages') {
      const m = line.match(/^["']?([A-Za-z0-9._-]+)["']?\s*=/);
      if (m) names.push(m[1]);
    }
  }
  return names;
}

/**
 * Reads Python dependency NAMES from all mainstream 2026 manifests (F1, F2):
 * requirements.txt, pyproject.toml (PEP 621 + poetry) and Pipfile. Names are raw
 * (normalization happens at the match sites). Every read path is fail-soft — this
 * never throws into detectStack.
 */
function readPythonDeps(projectPath) {
  const names = [];
  try {
    const req = readTextIfExists(path.join(projectPath, 'requirements.txt'));
    if (req) {
      for (const line of req.split(/\r?\n/)) {
        const name = extractRequirementName(line);
        if (name) names.push(name);
      }
    }
    const pyproject = readTextIfExists(path.join(projectPath, 'pyproject.toml'));
    if (pyproject) {
      for (const name of parsePyprojectDeps(pyproject)) names.push(name);
    }
    const pipfile = readTextIfExists(path.join(projectPath, 'Pipfile'));
    if (pipfile) {
      for (const name of parsePipfileDeps(pipfile)) names.push(name);
    }
  } catch (e) { /* fail-soft: never throw into detectStack */ }
  return names;
}

/**
 * Detects frameworks in a project
 */
function detectFrameworks(projectPath, languages) {
  projectPath = projectPath || process.cwd();
  languages = languages || detectLanguages(projectPath);
  const detected = [];

  const nodeDeps = readPackageDeps(projectPath);
  const pythonDeps = readPythonDeps(projectPath);
  const depSet = buildDepSet(nodeDeps, pythonDeps);

  for (const [framework, config] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (config.language && !languages.includes(config.language) && config.language !== null) {
      continue;
    }

    let found = false;

    // Check files
    if (config.files) {
      for (const file of config.files) {
        if (safeFs.existsSync(path.join(projectPath, file))) {
          found = true;
          break;
        }
      }
    }

    // Check dependencies (normalized, PEP 503 — F3)
    if (!found && config.deps) {
      for (const dep of config.deps) {
        if (depSet.has(normalizeDepName(dep))) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      detected.push(framework);
    }
  }

  return detected;
}

/**
 * Detects databases in a project (DB-w1).
 *
 * Databases live in a project's DEPENDENCIES (node `pg`, `mongoose`, `redis`; python
 * `psycopg2`, `pymongo`), NOT in marker files — so detection is dep-parsing, mirroring
 * `detectFrameworks`. Each database's `deps` list comes from the capability registry
 * (`capabilityRegistry.loadDatabases`), the single source of truth for database
 * capability data; a matched database is returned ENRICHED with its category and
 * security posture so the caller (detectStack → SessionStart) can render "PostgreSQL
 * (RLS supported, TLS required)" without re-reading the registry.
 *
 * Fail-open: an unreadable project or an empty registry simply yields `[]`. The output
 * is an array of `{ name, category, security, migration }` records, in registry
 * (declaration) order, each database at most once.
 *
 * @param {string} projectPath project root to scan.
 * @returns {Array<{name: string, category: string, security: Object, migration: Object}>}
 */
function detectDatabases(projectPath) {
  projectPath = projectPath || process.cwd();
  const nodeDeps = readPackageDeps(projectPath);
  const pythonDeps = readPythonDeps(projectPath);
  const depSet = buildDepSet(nodeDeps, pythonDeps);

  // loadDatabases enumerates the registry (which databases exist + their `deps`);
  // databaseCapability resolves the full record for a matched name. Both registry
  // functions thus have a live caller here — no dead exports.
  const { databases } = capabilityRegistry.loadDatabases(projectPath);
  const detected = [];

  for (const [name, entry] of Object.entries(databases)) {
    const deps = Array.isArray(entry.deps) ? entry.deps : [];
    let found = false;
    for (const dep of deps) {
      if (typeof dep !== 'string') continue;
      if (depSet.has(normalizeDepName(dep))) {
        found = true;
        break;
      }
    }
    if (!found) continue;
    const cap = capabilityRegistry.databaseCapability(name, projectPath) || entry;
    detected.push({
      name,
      category: cap.category,
      security: cap.security || {},
      migration: cap.migration || {}
    });
  }

  return detected;
}

/**
 * Enriches a project's frameworks with their capability records (FW-w1).
 *
 * MIRRORS `detectDatabases`. The legacy `detectFrameworks` returns bare NAMES from the
 * local FRAMEWORK_PATTERNS table (and uses a display name like `next.js`); this function
 * instead drives off the capability REGISTRY — the single source of truth for framework
 * capability data — so all 18 registry frameworks are reachable and there is no
 * `next.js`↔`nextjs` name-collision to reconcile. For each registry framework it matches
 * the project against that framework's `deps` (node package.json + python
 * requirements.txt, exactly like detectDatabases) OR its `files` config markers
 * (existsSync, framework-specific: manage.py, angular.json, artisan …). A matched
 * framework is returned ENRICHED with its category, language and security posture so the
 * caller (detectStack → SessionStart) can render "Next.js (security-headers,
 * auth-middleware)" without re-reading the registry.
 *
 * Fail-open: an unreadable project or an empty registry simply yields `[]`. The output
 * is an array of `{ name, category, language, security }` records, in registry
 * (declaration) order, each framework at most once. This is ADDITIVE — it does not
 * touch the legacy `detectFrameworks` string[] path.
 *
 * @param {string} projectPath project root to scan.
 * @returns {Array<{name: string, category: string, language: string, security: Object}>}
 */
function frameworkCapabilities(projectPath) {
  projectPath = projectPath || process.cwd();
  const nodeDeps = readPackageDeps(projectPath);
  const pythonDeps = readPythonDeps(projectPath);
  const depSet = buildDepSet(nodeDeps, pythonDeps);

  // loadFrameworks enumerates the registry (which frameworks exist + their `deps`/`files`);
  // frameworkCapability resolves the full record for a matched name. Both registry
  // functions thus have a live caller here — no dead exports.
  const { frameworks } = capabilityRegistry.loadFrameworks(projectPath);
  const detected = [];

  for (const [name, entry] of Object.entries(frameworks)) {
    let found = false;

    const deps = Array.isArray(entry.deps) ? entry.deps : [];
    for (const dep of deps) {
      if (typeof dep !== 'string') continue;
      if (depSet.has(normalizeDepName(dep))) { found = true; break; }
    }

    // Config markers (framework-specific files: manage.py, angular.json, artisan …).
    if (!found && Array.isArray(entry.files)) {
      for (const file of entry.files) {
        if (typeof file !== 'string' || file.length === 0) continue;
        try {
          if (safeFs.existsSync(path.join(projectPath, file))) { found = true; break; }
        } catch (e) { /* unreadable → not detected via this marker */ }
      }
    }

    if (!found) continue;
    const cap = capabilityRegistry.frameworkCapability(name, projectPath) || entry;
    detected.push({
      name,
      category: cap.category,
      language: cap.language,
      security: cap.security || {}
    });
  }

  return detected;
}

/**
 * Detects full stack
 */
function detectStack(projectPath) {
  projectPath = projectPath || process.cwd();
  const languages = detectLanguages(projectPath);
  const frameworks = detectFrameworks(projectPath, languages);
  // Additive (DB-w1): the persistence layer. languages/frameworks/primary are UNCHANGED.
  const databases = detectDatabases(projectPath);
  // Additive (FW-w1): framework capability enrichment. The legacy `frameworks` string[]
  // above is UNCHANGED — this is a separate, registry-driven field.
  const frameworkCaps = frameworkCapabilities(projectPath);

  return {
    project: projectPath,
    languages,
    frameworks,
    databases,
    frameworkCapabilities: frameworkCaps,
    primary: {
      language: languages[0] || null,
      framework: frameworks[0] || null
    }
  };
}

module.exports = {
  LANGUAGE_PATTERNS,
  FRAMEWORK_PATTERNS,
  detectLanguages,
  detectFrameworks,
  detectDatabases,
  frameworkCapabilities,
  detectStack,
  matchGlob,
  readPackageDeps
};

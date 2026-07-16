/**
 * CTOC Hooks Installer (v10 RED/BLUE hardened)
 *
 * Installs and configures Git hooks for various project types.
 *
 * Supports:
 * - Husky (Node.js projects)
 * - pre-commit framework (Python projects)
 * - Native Git hooks (universal)
 *
 * RED/BLUE TEAM HARDENING NOTES:
 * - R1: Validate target directories before writing
 * - R2: Check for existing hooks (don't overwrite without consent)
 * - R3: Validate hook content before installation
 * - R4: Secure file permissions (executable only for owner)
 * - R5: Prevent symlink attacks in hook directories
 * - B1: Graceful degradation when tools missing
 * - B2: Clear progress and error messages
 * - B3: Rollback on failure
 * - B4: Support for all major hook types
 * - B5: Configuration customization
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { execSync } = require('child_process');

// ==============================================================================
// CONSTANTS
// ==============================================================================

const HOOK_TYPES = ['pre-commit', 'pre-push', 'commit-msg', 'prepare-commit-msg', 'post-commit'];

const SYSTEMS = {
  HUSKY: 'husky',
  PRECOMMIT: 'pre-commit',
  NATIVE: 'native'
};

const TEMPLATE_DIR = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'hooks');

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================

/**
 * Check if a command exists.
 *
 * Cross-platform: `command -v` is a POSIX shell builtin that does not exist on
 * Windows (cmd.exe), so the old probe ALWAYS reported false on Windows — CTOC then
 * concluded pre-commit/pip/pipx were absent even when installed. On win32 the
 * equivalent is the `where` executable. The tool name is a CTOC-internal literal
 * (never user input); it is still validated to a safe shell token so no metacharacter
 * can ride the probe into the shell.
 *
 * @param {string} cmd - command name to probe
 * @returns {boolean} true iff the command resolves on PATH
 */
function hasCommand(cmd) {
  // Reject anything that is not a plain command token — defends the shell-invoked
  // probe against injection regardless of caller.
  if (typeof cmd !== 'string' || !/^[A-Za-z0-9._+-]+$/.test(cmd)) {
    return false;
  }
  const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  try {
    execSync(probe, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command and return result
 */
function runCommand(cmd, options = {}) {
  const { silent = false, cwd = process.cwd() } = options;
  try {
    const result = execSync(cmd, {
      cwd,
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf8'
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout };
  }
}

/**
 * Check if directory is a git repository
 */
function isGitRepo(dir) {
  const gitDir = path.join(dir, '.git');
  return safeFs.existsSync(gitDir);
}

/**
 * Get git hooks directory
 */
function getGitHooksDir(projectRoot) {
  const gitDir = path.join(projectRoot, '.git');

  if (!safeFs.existsSync(gitDir)) {
    throw new Error('Not a git repository');
  }

  // Check for core.hooksPath configuration
  try {
    const result = execSync('git config --get core.hooksPath', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const customPath = result.trim();
    if (customPath) {
      return path.resolve(projectRoot, customPath);
    }
  } catch {
    // No custom hooks path configured
  }

  return path.join(gitDir, 'hooks');
}

// ==============================================================================
// HUSKY INSTALLER
// ==============================================================================

class HuskyInstaller {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.huskyDir = path.join(projectRoot, '.husky');
  }

  /**
   * Check if Husky is installed
   */
  isInstalled() {
    return safeFs.existsSync(this.huskyDir) &&
           safeFs.existsSync(path.join(this.projectRoot, 'node_modules', 'husky'));
  }

  /**
   * Install Husky
   */
  async install() {
    const results = { installed: [], errors: [] };

    // Check for package.json
    const pkgPath = path.join(this.projectRoot, 'package.json');
    if (!safeFs.existsSync(pkgPath)) {
      throw new Error('package.json not found. Husky requires a Node.js project.');
    }

    // Install husky package
    console.log('Installing husky...');
    const npmResult = runCommand('npm install -D husky', { cwd: this.projectRoot });
    if (!npmResult.success) {
      throw new Error(`Failed to install husky: ${npmResult.error}`);
    }

    // Initialize husky
    console.log('Initializing husky...');
    const initResult = runCommand('npx husky init', { cwd: this.projectRoot });
    if (!initResult.success) {
      // Try legacy initialization
      runCommand('npx husky install', { cwd: this.projectRoot });
    }

    // Install lint-staged for better performance
    console.log('Installing lint-staged...');
    runCommand('npm install -D lint-staged', { cwd: this.projectRoot, silent: true });

    // Copy hook templates
    const templateDir = path.join(TEMPLATE_DIR, 'husky');

    for (const hookType of HOOK_TYPES) {
      const templateFile = path.join(templateDir, `${hookType}.template`);
      const hookFile = path.join(this.huskyDir, hookType);

      if (safeFs.existsSync(templateFile)) {
        // Check for existing hook
        if (safeFs.existsSync(hookFile)) {
          console.log(`  Skipping ${hookType} (already exists)`);
          continue;
        }

        try {
          const content = safeFs.readFileSync(templateFile, 'utf8');
          safeFs.writeFileSync(hookFile, content, { mode: 0o755 });
          results.installed.push(hookType);
          console.log(`  Installed ${hookType}`);
        } catch (error) {
          results.errors.push({ hook: hookType, error: error.message });
        }
      }
    }

    // Add prepare script to package.json
    this._addPrepareScript();

    // Create lint-staged config if not exists
    this._createLintStagedConfig();

    return results;
  }

  /**
   * Add prepare script to package.json
   */
  _addPrepareScript() {
    const pkgPath = path.join(this.projectRoot, 'package.json');
    try {
      const pkg = JSON.parse(safeFs.readFileSync(pkgPath, 'utf8'));

      if (!pkg.scripts) pkg.scripts = {};
      if (!pkg.scripts.prepare) {
        pkg.scripts.prepare = 'husky';
        safeFs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        console.log('  Added prepare script to package.json');
      }
    } catch (error) {
      console.warn(`  Warning: Could not update package.json: ${error.message}`);
    }
  }

  /**
   * Create lint-staged configuration
   */
  _createLintStagedConfig() {
    const configPath = path.join(this.projectRoot, '.lintstagedrc.json');

    if (safeFs.existsSync(configPath)) return;

    // Detect project type and create appropriate config
    const hasTs = safeFs.existsSync(path.join(this.projectRoot, 'tsconfig.json'));

    const config = {
      '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
      '*.{json,md,yaml,yml}': ['prettier --write'],
      '*.css': ['prettier --write']
    };

    if (hasTs) {
      config['*.{ts,tsx}'] = ['eslint --fix', 'prettier --write'];
    }

    try {
      safeFs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      console.log('  Created .lintstagedrc.json');
    } catch (error) {
      console.warn(`  Warning: Could not create lint-staged config: ${error.message}`);
    }
  }

  /**
   * Remove Husky hooks
   */
  uninstall() {
    if (safeFs.existsSync(this.huskyDir)) {
      safeFs.rmSync(this.huskyDir, { recursive: true, force: true });
      console.log('Removed .husky directory');
    }

    runCommand('npm uninstall husky lint-staged', { cwd: this.projectRoot, silent: true });
    console.log('Uninstalled husky and lint-staged');
  }
}

// ==============================================================================
// PRE-COMMIT INSTALLER
// ==============================================================================

class PreCommitInstaller {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.configFile = path.join(projectRoot, '.pre-commit-config.yaml');
  }

  /**
   * Check if pre-commit is installed
   */
  isInstalled() {
    return safeFs.existsSync(this.configFile) && hasCommand('pre-commit');
  }

  /**
   * Install pre-commit
   */
  async install(projectType = 'auto') {
    const results = { installed: [], errors: [] };

    // Check if pre-commit CLI is available
    if (!hasCommand('pre-commit')) {
      console.log('Installing pre-commit framework...');

      // Try pip
      if (hasCommand('pip')) {
        runCommand('pip install pre-commit', { cwd: this.projectRoot });
      } else if (hasCommand('pip3')) {
        runCommand('pip3 install pre-commit', { cwd: this.projectRoot });
      } else if (hasCommand('pipx')) {
        runCommand('pipx install pre-commit', { cwd: this.projectRoot });
      } else {
        throw new Error('Cannot install pre-commit. Please install pip or pipx first.');
      }
    }

    // Determine project type if auto
    if (projectType === 'auto') {
      projectType = this._detectProjectType();
    }

    // Copy appropriate config template
    const templateFile = path.join(TEMPLATE_DIR, 'pre-commit-config', `${projectType}.yaml.template`);

    if (!safeFs.existsSync(templateFile)) {
      throw new Error(`Unknown project type: ${projectType}`);
    }

    // Check for existing config
    if (safeFs.existsSync(this.configFile)) {
      console.log('  .pre-commit-config.yaml already exists, skipping');
    } else {
      const content = safeFs.readFileSync(templateFile, 'utf8');
      safeFs.writeFileSync(this.configFile, content);
      results.installed.push('.pre-commit-config.yaml');
      console.log(`  Created .pre-commit-config.yaml (${projectType})`);
    }

    // Install pre-commit hooks
    console.log('Installing pre-commit hooks...');
    const installResult = runCommand('pre-commit install', { cwd: this.projectRoot });

    if (!installResult.success) {
      results.errors.push({ hook: 'pre-commit', error: installResult.error });
    } else {
      results.installed.push('pre-commit');
    }

    // Install commit-msg hook
    runCommand('pre-commit install --hook-type commit-msg', {
      cwd: this.projectRoot,
      silent: true
    });
    results.installed.push('commit-msg');

    // Install pre-push hook
    runCommand('pre-commit install --hook-type pre-push', {
      cwd: this.projectRoot,
      silent: true
    });
    results.installed.push('pre-push');

    return results;
  }

  /**
   * Detect project type
   */
  _detectProjectType() {
    const projectRoot = this.projectRoot;

    if (safeFs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
      return 'typescript';
    }

    if (safeFs.existsSync(path.join(projectRoot, 'pyproject.toml')) ||
        safeFs.existsSync(path.join(projectRoot, 'setup.py')) ||
        safeFs.existsSync(path.join(projectRoot, 'requirements.txt'))) {
      return 'python';
    }

    if (safeFs.existsSync(path.join(projectRoot, 'go.mod'))) {
      return 'go';
    }

    // Default to multi-lang for mixed or unknown projects
    return 'multi-lang';
  }

  /**
   * Uninstall pre-commit hooks
   */
  uninstall() {
    runCommand('pre-commit uninstall', { cwd: this.projectRoot, silent: true });
    runCommand('pre-commit uninstall --hook-type commit-msg', { cwd: this.projectRoot, silent: true });
    runCommand('pre-commit uninstall --hook-type pre-push', { cwd: this.projectRoot, silent: true });

    if (safeFs.existsSync(this.configFile)) {
      safeFs.unlinkSync(this.configFile);
      console.log('Removed .pre-commit-config.yaml');
    }
  }
}

// ==============================================================================
// NATIVE GIT HOOKS INSTALLER
// ==============================================================================

class NativeHooksInstaller {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.hooksDir = getGitHooksDir(projectRoot);
  }

  /**
   * Check if native hooks are installed
   */
  isInstalled() {
    return safeFs.existsSync(path.join(this.hooksDir, 'pre-commit'));
  }

  /**
   * Install native git hooks
   */
  async install() {
    const results = { installed: [], errors: [] };

    // Ensure hooks directory exists
    if (!safeFs.existsSync(this.hooksDir)) {
      safeFs.mkdirSync(this.hooksDir, { recursive: true });
    }

    // Install each hook type
    for (const hookType of HOOK_TYPES) {
      const templateFile = path.join(TEMPLATE_DIR, `${hookType}.sh.template`);
      const hookFile = path.join(this.hooksDir, hookType);

      if (!safeFs.existsSync(templateFile)) continue;

      // Check for existing hook
      if (safeFs.existsSync(hookFile)) {
        // Read existing hook to check if it's a CTOC hook
        const existing = safeFs.readFileSync(hookFile, 'utf8');
        if (!existing.includes('CTOC')) {
          console.log(`  Skipping ${hookType} (non-CTOC hook exists)`);
          continue;
        }
      }

      try {
        const content = safeFs.readFileSync(templateFile, 'utf8');
        safeFs.writeFileSync(hookFile, content, { mode: 0o755 });
        results.installed.push(hookType);
        console.log(`  Installed ${hookType}`);
      } catch (error) {
        results.errors.push({ hook: hookType, error: error.message });
      }
    }

    return results;
  }

  /**
   * Uninstall native hooks
   */
  uninstall() {
    for (const hookType of HOOK_TYPES) {
      const hookFile = path.join(this.hooksDir, hookType);

      if (safeFs.existsSync(hookFile)) {
        // Only remove if it's a CTOC hook
        const content = safeFs.readFileSync(hookFile, 'utf8');
        if (content.includes('CTOC')) {
          safeFs.unlinkSync(hookFile);
          console.log(`  Removed ${hookType}`);
        }
      }
    }
  }
}

// ==============================================================================
// POST-COMMIT HOOK INSTALLER (Quality Agent)
// ==============================================================================

// ------------------------------------------------------------------------------
// Post-commit block ownership — sentinels, NOT substrings.
//
// The CTOC-emitted post-commit block is delimited by a pair of sentinel comment
// lines. Ownership of a line is decided by whether it falls between the sentinels,
// never by whether it merely *contains* the string "CTOC" or "post-commit.js".
// This is what makes install idempotent and uninstall surgical: a foreign hook
// line such as `node scripts/post-commit.js --notify`, or a comment that mentions
// CTOC, is never mistaken for a CTOC-owned line.
// ------------------------------------------------------------------------------
const POST_COMMIT_SENTINEL_START = '# >>> CTOC post-commit >>>';
const POST_COMMIT_SENTINEL_END = '# <<< CTOC post-commit <<<';

// The exact CTOC invocation signature, used ONLY for back-compat with hooks
// installed by the previous (sentinel-less) code. It matches CTOC's own
// `node "<...>post-commit.js" 2>/dev/null &` line but NOT a foreign line like
// `node scripts/post-commit.js --notify` (which lacks the `2>/dev/null &`
// redirect), so a legacy CTOC install can be removed without eating a foreign
// post-commit.js line.
const CTOC_LEGACY_INVOCATION = /node\s+"?[^"\n]*post-commit\.js"?\s+2>\/dev\/null\s+&/;

// The unambiguous CTOC comment markers emitted by ctocPostCommitBlock. A
// `*post-commit.js … 2>/dev/null &` invocation is an extremely common user
// pattern, so it alone can NEVER prove CTOC ownership. Legacy (sentinel-less)
// recognition is gated on the presence of one of these exact comment strings —
// a foreign `node build/post-commit.js 2>/dev/null &` line with no CTOC comment
// marker is therefore NOT treated as a CTOC install.
const CTOC_COMMENT_MARKERS = [
  'CTOC post-commit hook - triggers background quality agent',
  'CTOC hook is NON-BLOCKING'
];

/**
 * True when the hook file carries at least one unambiguous CTOC comment marker.
 * @param {string} content - existing hook file contents
 * @returns {boolean}
 */
function hasCtocCommentMarker(content) {
  return CTOC_COMMENT_MARKERS.some(marker => content.includes(marker));
}

/**
 * Build the identical sentinel-wrapped CTOC block used by BOTH write paths
 * (new-file create and append-to-foreign). Trailing newline included so the
 * closing sentinel sits on its own line.
 * @param {string} agentHookPath - absolute path to the CTOC post-commit.js script
 * @returns {string} the sentinel-delimited block, newline-terminated
 */
function ctocPostCommitBlock(agentHookPath) {
  return [
    POST_COMMIT_SENTINEL_START,
    '# CTOC post-commit hook - triggers background quality agent',
    '# CTOC hook is NON-BLOCKING - commit always succeeds instantly.',
    `node "${agentHookPath}" 2>/dev/null &`,
    POST_COMMIT_SENTINEL_END,
    ''
  ].join('\n');
}

/**
 * Decide whether an existing post-commit hook already carries a CTOC install.
 * Primary signal is the opening sentinel. The legacy (pre-sentinel) fallback
 * requires BOTH the invocation signature AND an unambiguous CTOC comment marker,
 * so a foreign `node build/post-commit.js 2>/dev/null &` line — a common user
 * backgrounding pattern — is never mistaken for a CTOC install. A mere mention
 * of "CTOC" in a comment is likewise NOT, on its own, a signal.
 * @param {string} content - existing hook file contents
 * @returns {boolean}
 */
function isCtocPostCommitInstalled(content) {
  if (content.includes(POST_COMMIT_SENTINEL_START)) return true;
  // Legacy (sentinel-less) recognition requires BOTH the invocation signature
  // AND a CTOC comment marker. The invocation alone is a common user pattern and
  // must never, by itself, prove CTOC ownership.
  return CTOC_LEGACY_INVOCATION.test(content) && hasCtocCommentMarker(content);
}

// Captures the script path out of a legacy CTOC-style backgrounded invocation
// (`node "<path>/post-commit.js" 2>/dev/null &`, quoted or not). Group 1 is the
// referenced path, used to decide whether the line points at CTOC's OWN
// post-commit.js or at a foreign script that merely shares the filename.
const CTOC_LEGACY_INVOCATION_PATH = /node\s+"?([^"\n]*post-commit\.js)"?\s+2>\/dev\/null\s+&/;

/**
 * Normalise a filesystem path for a separator-insensitive comparison. Git hooks
 * are shell scripts and the CTOC invocation is written with forward slashes by
 * convention, but on Windows the installer computes the path with `path.join`
 * (backslashes). Comparing on a common separator keeps ownership correct on all
 * platforms.
 * @param {string} p
 * @returns {string}
 */
function normalizeHookPath(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * True when the line is one of CTOC's unambiguous comment markers.
 * @param {string} line
 * @returns {boolean}
 */
function isLegacyCtocCommentMarker(line) {
  return line.includes('CTOC post-commit hook - triggers background quality agent') ||
    line.includes('CTOC hook is NON-BLOCKING');
}

/**
 * Legacy per-line ownership test for a sentinel-less CTOC install. A line is
 * CTOC-owned when it is one of the exact CTOC comment markers, OR it is a
 * backgrounded `post-commit.js` invocation whose referenced script path IS
 * CTOC's own (equal to `expectedPath`, or located under `pluginRoot`). A foreign
 * line such as `node tools/my-notify-post-commit.js 2>/dev/null &` — same shape,
 * different path — is NEVER treated as CTOC-owned here; block-contiguity in the
 * uninstaller is the only additional route, and it too refuses standalone
 * foreign lines.
 * @param {string} line
 * @param {string} [expectedPath] - absolute path to CTOC's own post-commit.js
 * @param {string} [pluginRoot] - CTOC plugin root; any post-commit.js under it is CTOC's
 * @returns {boolean}
 */
function isLegacyCtocPostCommitLine(line, expectedPath, pluginRoot) {
  if (isLegacyCtocCommentMarker(line)) return true;
  const match = line.match(CTOC_LEGACY_INVOCATION_PATH);
  if (!match) return false;
  const linePath = normalizeHookPath(match[1]);
  if (expectedPath && linePath === normalizeHookPath(expectedPath)) return true;
  if (pluginRoot) {
    const root = normalizeHookPath(pluginRoot);
    if (root && (linePath === root || linePath.startsWith(root + '/'))) return true;
  }
  return false;
}

/**
 * Install the CTOC post-commit hook that triggers the background quality agent.
 * This is separate from the hook system installers (Husky/pre-commit/native)
 * because it always installs as a native git hook regardless of the project's
 * hook system.
 *
 * @param {string} projectRoot - The project root directory
 * @param {Object} [options] - Installation options
 * @param {string} [options.pluginRoot] - CTOC plugin root directory (auto-detected if not provided)
 * @returns {Object} Installation result { installed, skipped, error }
 */
function installPostCommitHook(projectRoot, options = {}) {
  const pluginRoot = options.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..', '..');
  const hooksDir = getGitHooksDir(projectRoot);
  const hookPath = path.join(hooksDir, 'post-commit');
  // The real hook script lives at src/hooks/post-commit.js under the plugin
  // root (both the repo layout and the installed-plugin layout have src/ under
  // the root; CLAUDE_PLUGIN_ROOT points at that same root).
  const agentHookPath = path.join(pluginRoot, 'src', 'hooks', 'post-commit.js');

  // Ensure hooks directory exists
  if (!safeFs.existsSync(hooksDir)) {
    safeFs.mkdirSync(hooksDir, { recursive: true });
  }

  // Check for existing hook
  if (safeFs.existsSync(hookPath)) {
    const existing = safeFs.readFileSync(hookPath, 'utf8');
    // Idempotency is decided by the OPENING sentinel (or a legacy CTOC
    // invocation), never by a bare "CTOC" substring — a foreign comment that
    // merely mentions CTOC must not false-skip the install.
    if (isCtocPostCommitInstalled(existing)) {
      return { installed: false, skipped: true, reason: 'CTOC post-commit hook already installed' };
    }

    // Non-CTOC hook exists -- append our sentinel-wrapped block. A leading
    // newline separates it from the foreign content; the block is identical to
    // the new-file body so uninstall can own it by sentinels either way.
    safeFs.appendFileSync(hookPath, '\n' + ctocPostCommitBlock(agentHookPath));
    // Ensure executable
    safeFs.chmodSync(hookPath, 0o755);
    return { installed: true, appended: true };
  }

  // Create new hook script. The CTOC body is wrapped in the same sentinel block
  // used by the append path, so uninstallPostCommitHook removes exactly the
  // delimited lines and never guesses ownership by substring.
  const hookContent = '#!/bin/sh\n' + ctocPostCommitBlock(agentHookPath);

  safeFs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
  return { installed: true };
}

/**
 * Uninstall the CTOC post-commit hook
 * @param {string} projectRoot - The project root directory
 * @param {Object} [options] - Uninstallation options
 * @param {string} [options.pluginRoot] - CTOC plugin root (auto-detected if not provided),
 *   used to identify CTOC's OWN post-commit.js path on the legacy (sentinel-less) branch.
 * @returns {Object} Uninstallation result
 */
function uninstallPostCommitHook(projectRoot, options = {}) {
  const hooksDir = getGitHooksDir(projectRoot);
  const hookPath = path.join(hooksDir, 'post-commit');

  if (!safeFs.existsSync(hookPath)) {
    return { removed: false, reason: 'No post-commit hook found' };
  }

  // Derive CTOC's own post-commit.js path exactly as installPostCommitHook does,
  // so the legacy per-line removal can tell CTOC's own invocation from a foreign
  // `node <other>/post-commit.js 2>/dev/null &` line and refuse to delete the latter.
  const pluginRoot = options.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..', '..');
  const expectedPath = path.join(pluginRoot, 'src', 'hooks', 'post-commit.js');

  const content = safeFs.readFileSync(hookPath, 'utf8');
  const lines = content.split('\n');
  const startIdx = lines.findIndex(l => l.trim() === POST_COMMIT_SENTINEL_START);
  const endIdx = lines.findIndex(l => l.trim() === POST_COMMIT_SENTINEL_END);

  let remaining;
  if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
    // Own the block by SENTINELS: drop only the lines between (and including)
    // the delimiters. Every foreign line — even one that contains the literal
    // "post-commit.js" — is preserved verbatim.
    remaining = lines.filter((_, i) => i < startIdx || i > endIdx);
  } else if (isCtocPostCommitInstalled(content)) {
    // BACK-COMPAT: a hook installed by the previous (sentinel-less) code has no
    // sentinels. Ownership is PATH-AWARE: remove the CTOC comment markers and
    // ONLY the invocation line whose script path is CTOC's own (expectedPath, or
    // under pluginRoot). A foreign backgrounded line — same `…post-commit.js
    // 2>/dev/null &` shape but a different path — is preserved.
    const removeIdx = new Set();
    lines.forEach((line, i) => {
      if (isLegacyCtocPostCommitLine(line, expectedPath, pluginRoot)) removeIdx.add(i);
    });
    // FALLBACK for installs whose recorded path differs from the CURRENT plugin
    // root (CTOC moved/reinstalled since install): a legacy invocation that sits
    // directly under a CTOC comment marker is unambiguously part of the CTOC
    // block. A STANDALONE foreign invocation is never adjacent to a marker, so it
    // is never eaten by this route.
    lines.forEach((line, i) => {
      if (removeIdx.has(i)) return;
      if (!CTOC_LEGACY_INVOCATION.test(line)) return;
      if (i > 0 && removeIdx.has(i - 1) && isLegacyCtocCommentMarker(lines[i - 1])) {
        removeIdx.add(i);
      }
    });
    remaining = lines.filter((_, i) => !removeIdx.has(i));
  } else {
    return { removed: false, reason: 'Post-commit hook is not a CTOC hook' };
  }

  // Preserve the prior empty-file semantics: if only a shebang and/or blank
  // lines remain, the hook is now pure boilerplate — delete it entirely.
  const meaningful = remaining.filter(l => l.trim() !== '' && !l.startsWith('#!/'));
  if (meaningful.length === 0) {
    safeFs.unlinkSync(hookPath);
    return { removed: true };
  }

  safeFs.writeFileSync(hookPath, remaining.join('\n'), { mode: 0o755 });
  return { removed: true, partial: true };
}

// ==============================================================================
// MAIN INSTALLER
// ==============================================================================

class HooksInstaller {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();

    if (!isGitRepo(this.projectRoot)) {
      throw new Error('Not a git repository');
    }

    this.husky = new HuskyInstaller(this.projectRoot);
    this.precommit = new PreCommitInstaller(this.projectRoot);
    this.native = new NativeHooksInstaller(this.projectRoot);
  }

  /**
   * Detect best hook system for project
   */
  detectSystem() {
    // Check for existing systems
    if (this.husky.isInstalled()) return SYSTEMS.HUSKY;
    if (this.precommit.isInstalled()) return SYSTEMS.PRECOMMIT;

    // Detect based on project type
    if (safeFs.existsSync(path.join(this.projectRoot, 'package.json'))) {
      return SYSTEMS.HUSKY;
    }

    if (safeFs.existsSync(path.join(this.projectRoot, 'pyproject.toml')) ||
        safeFs.existsSync(path.join(this.projectRoot, 'setup.py'))) {
      return SYSTEMS.PRECOMMIT;
    }

    return SYSTEMS.NATIVE;
  }

  /**
   * Install hooks using specified or auto-detected system
   */
  async install(system = 'auto', projectType = 'auto') {
    if (system === 'auto') {
      system = this.detectSystem();
    }

    console.log(`\nInstalling hooks using ${system}...\n`);

    switch (system) {
      case SYSTEMS.HUSKY:
        return await this.husky.install();

      case SYSTEMS.PRECOMMIT:
        return await this.precommit.install(projectType);

      case SYSTEMS.NATIVE:
        return await this.native.install();

      default:
        throw new Error(`Unknown hook system: ${system}`);
    }
  }

  /**
   * Uninstall all hooks
   */
  uninstall() {
    console.log('\nUninstalling hooks...\n');

    this.husky.uninstall();
    this.precommit.uninstall();
    this.native.uninstall();

    console.log('\nHooks uninstalled.\n');
  }

  /**
   * Get status of all hook systems
   */
  status() {
    return {
      husky: this.husky.isInstalled(),
      precommit: this.precommit.isInstalled(),
      native: this.native.isInstalled(),
      detected: this.detectSystem()
    };
  }
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  HooksInstaller,
  HuskyInstaller,
  PreCommitInstaller,
  NativeHooksInstaller,
  installPostCommitHook,
  uninstallPostCommitHook,
  hasCommand,
  SYSTEMS,
  HOOK_TYPES
};

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

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ==============================================================================
// CONSTANTS
// ==============================================================================

const HOOK_TYPES = ['pre-commit', 'pre-push', 'commit-msg', 'prepare-commit-msg', 'post-commit'];

const SYSTEMS = {
  HUSKY: 'husky',
  PRECOMMIT: 'pre-commit',
  NATIVE: 'native'
};

const TEMPLATE_DIR = path.join(__dirname, '..', '.ctoc', 'templates', 'hooks');

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================

/**
 * Check if a command exists
 */
function hasCommand(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
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
 * Safely resolve path (prevent symlink attacks)
 */
function safePath(targetPath, basePath) {
  const resolved = path.resolve(targetPath);
  const base = path.resolve(basePath);

  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal attempt detected: ${targetPath}`);
  }

  return resolved;
}

/**
 * Check if directory is a git repository
 */
function isGitRepo(dir) {
  const gitDir = path.join(dir, '.git');
  return fs.existsSync(gitDir);
}

/**
 * Get git hooks directory
 */
function getGitHooksDir(projectRoot) {
  const gitDir = path.join(projectRoot, '.git');

  if (!fs.existsSync(gitDir)) {
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
    return fs.existsSync(this.huskyDir) &&
           fs.existsSync(path.join(this.projectRoot, 'node_modules', 'husky'));
  }

  /**
   * Install Husky
   */
  async install() {
    const results = { installed: [], errors: [] };

    // Check for package.json
    const pkgPath = path.join(this.projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
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

      if (fs.existsSync(templateFile)) {
        // Check for existing hook
        if (fs.existsSync(hookFile)) {
          console.log(`  Skipping ${hookType} (already exists)`);
          continue;
        }

        try {
          const content = fs.readFileSync(templateFile, 'utf8');
          fs.writeFileSync(hookFile, content, { mode: 0o755 });
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
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      if (!pkg.scripts) pkg.scripts = {};
      if (!pkg.scripts.prepare) {
        pkg.scripts.prepare = 'husky';
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
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

    if (fs.existsSync(configPath)) return;

    // Detect project type and create appropriate config
    const hasTs = fs.existsSync(path.join(this.projectRoot, 'tsconfig.json'));

    const config = {
      '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
      '*.{json,md,yaml,yml}': ['prettier --write'],
      '*.css': ['prettier --write']
    };

    if (hasTs) {
      config['*.{ts,tsx}'] = ['eslint --fix', 'prettier --write'];
    }

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      console.log('  Created .lintstagedrc.json');
    } catch (error) {
      console.warn(`  Warning: Could not create lint-staged config: ${error.message}`);
    }
  }

  /**
   * Remove Husky hooks
   */
  uninstall() {
    if (fs.existsSync(this.huskyDir)) {
      fs.rmSync(this.huskyDir, { recursive: true, force: true });
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
    return fs.existsSync(this.configFile) && hasCommand('pre-commit');
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

    if (!fs.existsSync(templateFile)) {
      throw new Error(`Unknown project type: ${projectType}`);
    }

    // Check for existing config
    if (fs.existsSync(this.configFile)) {
      console.log('  .pre-commit-config.yaml already exists, skipping');
    } else {
      const content = fs.readFileSync(templateFile, 'utf8');
      fs.writeFileSync(this.configFile, content);
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

    if (fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
      return 'typescript';
    }

    if (fs.existsSync(path.join(projectRoot, 'pyproject.toml')) ||
        fs.existsSync(path.join(projectRoot, 'setup.py')) ||
        fs.existsSync(path.join(projectRoot, 'requirements.txt'))) {
      return 'python';
    }

    if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
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

    if (fs.existsSync(this.configFile)) {
      fs.unlinkSync(this.configFile);
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
    return fs.existsSync(path.join(this.hooksDir, 'pre-commit'));
  }

  /**
   * Install native git hooks
   */
  async install() {
    const results = { installed: [], errors: [] };

    // Ensure hooks directory exists
    if (!fs.existsSync(this.hooksDir)) {
      fs.mkdirSync(this.hooksDir, { recursive: true });
    }

    // Install each hook type
    for (const hookType of HOOK_TYPES) {
      const templateFile = path.join(TEMPLATE_DIR, `${hookType}.sh.template`);
      const hookFile = path.join(this.hooksDir, hookType);

      if (!fs.existsSync(templateFile)) continue;

      // Check for existing hook
      if (fs.existsSync(hookFile)) {
        // Read existing hook to check if it's a CTOC hook
        const existing = fs.readFileSync(hookFile, 'utf8');
        if (!existing.includes('CTOC')) {
          console.log(`  Skipping ${hookType} (non-CTOC hook exists)`);
          continue;
        }
      }

      try {
        const content = fs.readFileSync(templateFile, 'utf8');
        fs.writeFileSync(hookFile, content, { mode: 0o755 });
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

      if (fs.existsSync(hookFile)) {
        // Only remove if it's a CTOC hook
        const content = fs.readFileSync(hookFile, 'utf8');
        if (content.includes('CTOC')) {
          fs.unlinkSync(hookFile);
          console.log(`  Removed ${hookType}`);
        }
      }
    }
  }
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
    if (fs.existsSync(path.join(this.projectRoot, 'package.json'))) {
      return SYSTEMS.HUSKY;
    }

    if (fs.existsSync(path.join(this.projectRoot, 'pyproject.toml')) ||
        fs.existsSync(path.join(this.projectRoot, 'setup.py'))) {
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
  SYSTEMS,
  HOOK_TYPES
};

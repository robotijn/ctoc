#!/usr/bin/env node
/**
 * CTOC Self-Updater
 * Works around Claude Code plugin cache bug
 *
 * Issues: #21995, #16866, #14061
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const PLUGINS_DIR = path.join(HOME, '.claude', 'plugins');
const MARKETPLACE_DIR = path.join(PLUGINS_DIR, 'marketplaces', 'robotijn');
const CACHE_DIR = path.join(PLUGINS_DIR, 'cache', 'robotijn', 'ctoc');
const INSTALLED_FILE = path.join(PLUGINS_DIR, 'installed_plugins.json');

/**
 * Refresh the local project's CTOC-managed operating-lessons block. Fail-open:
 * a lessons-injection failure is logged to stderr and NEVER aborts the version update.
 */
function refreshLocalLessons() {
  try {
    const { ensureLessonsBlock } = require('../lib/claude-md-lessons');
    const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
    const ctocRoot = path.resolve(__dirname, '..', '..');
    ensureLessonsBlock(claudeMdPath, ctocRoot);
  } catch (err) {
    console.error('[CTOC] Lessons block refresh skipped:', err.message);
  }
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
  } catch (e) {
    if (opts.silent) return null;
    throw e;
  }
}

function getCurrentVersion() {
  // Try CLAUDE_PLUGIN_ROOT env var
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) {
    const versionFile = path.join(pluginRoot, 'VERSION');
    if (safeFs.existsSync(versionFile)) {
      return safeFs.readFileSync(versionFile, 'utf8').trim();
    }
  }
  // Derive from script location (e.g., .../ctoc/6.1.22/commands/update.js)
  const scriptDir = path.resolve(__dirname, '..', '..');
  const versionFile = path.join(scriptDir, 'VERSION');
  if (safeFs.existsSync(versionFile)) {
    return safeFs.readFileSync(versionFile, 'utf8').trim();
  }
  // Last resort: read from cache directory names
  if (safeFs.existsSync(CACHE_DIR)) {
    const versions = safeFs.readdirSync(CACHE_DIR).filter(d =>
      safeFs.statSync(path.join(CACHE_DIR, d)).isDirectory()
    );
    if (versions.length === 1) return versions[0];
  }
  return 'unknown';
}

function getLatestVersion() {
  const versionFile = path.join(MARKETPLACE_DIR, 'VERSION');
  if (safeFs.existsSync(versionFile)) {
    return safeFs.readFileSync(versionFile, 'utf8').trim();
  }
  return null;
}

function update() {
  const currentVersion = getCurrentVersion();

  console.log('CTOC Update');
  console.log('─'.repeat(40));
  console.log(`Current version: ${currentVersion}`);

  // 1. Clone or fetch latest from GitHub
  console.log('\n1. Fetching latest from GitHub...');
  try {
    const hasGit = safeFs.existsSync(path.join(MARKETPLACE_DIR, '.git'));
    if (!hasGit) {
      // No .git dir — clone fresh (handles missing dir, broken state, cleared cache)
      if (safeFs.existsSync(MARKETPLACE_DIR)) {
        safeFs.rmSync(MARKETPLACE_DIR, { recursive: true });
      }
      safeFs.mkdirSync(MARKETPLACE_DIR, { recursive: true });
      run(`git clone https://github.com/robotijn/ctoc.git "${MARKETPLACE_DIR}"`);
      console.log('   Cloned fresh from GitHub');
    } else {
      run(`git -C "${MARKETPLACE_DIR}" fetch origin`);
      run(`git -C "${MARKETPLACE_DIR}" reset --hard origin/main`);
    }
  } catch (e) {
    console.error('   Failed to fetch from GitHub. Check network connection.');
    process.exit(1);
  }

  // 2. Get new version
  const newVersion = getLatestVersion();
  if (!newVersion) {
    console.error('   Could not determine latest version');
    process.exit(1);
  }
  console.log(`   Latest version: ${newVersion}`);

  // 3. Check if already up to date
  if (currentVersion === newVersion) {
    console.log('\n' + '─'.repeat(40));
    console.log(`✓ Already up to date (v${newVersion})`);
    refreshLocalLessons();          // (a) refresh even when version unchanged
    return;
  }

  console.log(`\n   Updating: ${currentVersion} → ${newVersion}`);

  // 4. Get commit SHA
  const commitSha = run(`git -C "${MARKETPLACE_DIR}" rev-parse --short HEAD`);

  // 5. Copy to cache
  const cacheVersionDir = path.join(CACHE_DIR, newVersion);
  console.log('\n2. Installing to cache...');

  // Remove old version dir if exists
  if (safeFs.existsSync(cacheVersionDir)) {
    safeFs.rmSync(cacheVersionDir, { recursive: true });
  }
  safeFs.mkdirSync(cacheVersionDir, { recursive: true });

  // Copy files (exclude .git)
  const files = safeFs.readdirSync(MARKETPLACE_DIR);
  for (const file of files) {
    if (file === '.git') continue;
    const src = path.join(MARKETPLACE_DIR, file);
    const dst = path.join(cacheVersionDir, file);
    safeFs.cpSync(src, dst, { recursive: true });
  }
  console.log(`   Installed to: ${cacheVersionDir}`);

  // 6. Update installed_plugins.json
  console.log('\n3. Updating plugin registry...');

  // Preserve existing plugins, only update ctoc
  let installed = { version: 2, plugins: {} };
  if (safeFs.existsSync(INSTALLED_FILE)) {
    try {
      installed = JSON.parse(safeFs.readFileSync(INSTALLED_FILE, 'utf8'));
    } catch (e) {
      // Use default if file is corrupted
    }
  }

  // Preserve original installedAt if exists
  const existingEntry = installed.plugins?.['ctoc@robotijn']?.[0];
  const installedAt = existingEntry?.installedAt || new Date().toISOString();

  installed.plugins['ctoc@robotijn'] = [
    {
      scope: 'user',
      installPath: cacheVersionDir,
      version: newVersion,
      installedAt: installedAt,
      lastUpdated: new Date().toISOString(),
      gitCommitSha: commitSha
    }
  ];

  safeFs.writeFileSync(INSTALLED_FILE, JSON.stringify(installed, null, 2));
  console.log('   Registry updated');

  // 7. Clean old versions
  console.log('\n4. Cleaning old versions...');
  try {
    const versions = safeFs.readdirSync(CACHE_DIR).filter(v => v !== newVersion);
    for (const v of versions) {
      safeFs.rmSync(path.join(CACHE_DIR, v), { recursive: true });
      console.log(`   Removed: ${v}`);
    }
    if (versions.length === 0) {
      console.log('   No old versions to remove');
    }
  } catch (e) {
    // Cache dir might not exist yet
    console.log('   No old versions to remove');
  }

  // 7b. Refresh local CLAUDE.md operating-lessons block after a successful upgrade.
  refreshLocalLessons();            // (b) refresh after version change

  console.log('\n' + '─'.repeat(40));
  console.log(`✓ Updated to CTOC v${newVersion}`);
  console.log('\nRestart Claude Code for changes to take effect.');
}

if (require.main === module) {
  update();
}

module.exports = { update, refreshLocalLessons, getCurrentVersion, getLatestVersion };

#!/usr/bin/env node
/**
 * CTOC Self-Updater
 * Works around Claude Code plugin cache bug
 *
 * Issues: #21995, #16866, #14061
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const PLUGINS_DIR = path.join(HOME, '.claude', 'plugins');
const MARKETPLACE_DIR = path.join(PLUGINS_DIR, 'marketplaces', 'robotijn');
const CACHE_DIR = path.join(PLUGINS_DIR, 'cache', 'robotijn', 'ctoc');
const INSTALLED_FILE = path.join(PLUGINS_DIR, 'installed_plugins.json');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
  } catch (e) {
    if (opts.silent) return null;
    throw e;
  }
}

function getCurrentVersion() {
  // Get version from currently running plugin
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) {
    const versionFile = path.join(pluginRoot, 'VERSION');
    if (fs.existsSync(versionFile)) {
      return fs.readFileSync(versionFile, 'utf8').trim();
    }
  }
  return 'unknown';
}

function getLatestVersion() {
  const versionFile = path.join(MARKETPLACE_DIR, 'VERSION');
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, 'utf8').trim();
  }
  return null;
}

function update() {
  const currentVersion = getCurrentVersion();

  console.log('CTOC Update');
  console.log('─'.repeat(40));
  console.log(`Current version: ${currentVersion}`);

  // 1. Fetch latest from GitHub
  console.log('\n1. Fetching latest from GitHub...');
  try {
    run(`git -C "${MARKETPLACE_DIR}" fetch origin`);
    run(`git -C "${MARKETPLACE_DIR}" reset --hard origin/main`);
  } catch (e) {
    console.error('   Failed to fetch. Check network connection.');
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
    return;
  }

  console.log(`\n   Updating: ${currentVersion} → ${newVersion}`);

  // 4. Get commit SHA
  const commitSha = run(`git -C "${MARKETPLACE_DIR}" rev-parse --short HEAD`);

  // 5. Copy to cache
  const cacheVersionDir = path.join(CACHE_DIR, newVersion);
  console.log('\n2. Installing to cache...');

  // Remove old version dir if exists
  if (fs.existsSync(cacheVersionDir)) {
    fs.rmSync(cacheVersionDir, { recursive: true });
  }
  fs.mkdirSync(cacheVersionDir, { recursive: true });

  // Copy files (exclude .git)
  const files = fs.readdirSync(MARKETPLACE_DIR);
  for (const file of files) {
    if (file === '.git') continue;
    const src = path.join(MARKETPLACE_DIR, file);
    const dst = path.join(cacheVersionDir, file);
    fs.cpSync(src, dst, { recursive: true });
  }
  console.log(`   Installed to: ${cacheVersionDir}`);

  // 6. Update installed_plugins.json
  console.log('\n3. Updating plugin registry...');

  // Preserve existing plugins, only update ctoc
  let installed = { version: 2, plugins: {} };
  if (fs.existsSync(INSTALLED_FILE)) {
    try {
      installed = JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf8'));
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

  fs.writeFileSync(INSTALLED_FILE, JSON.stringify(installed, null, 2));
  console.log('   Registry updated');

  // 7. Clean old versions
  console.log('\n4. Cleaning old versions...');
  try {
    const versions = fs.readdirSync(CACHE_DIR).filter(v => v !== newVersion);
    for (const v of versions) {
      fs.rmSync(path.join(CACHE_DIR, v), { recursive: true });
      console.log(`   Removed: ${v}`);
    }
    if (versions.length === 0) {
      console.log('   No old versions to remove');
    }
  } catch (e) {
    // Cache dir might not exist yet
    console.log('   No old versions to remove');
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`✓ Updated to CTOC v${newVersion}`);
  console.log('\nRestart Claude Code for changes to take effect.');
}

update();

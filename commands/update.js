#!/usr/bin/env node
/**
 * CTOC Update Command
 * Forces global scope to fix Claude Code's local scope detection
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

function update() {
  console.log('CTOC Update');
  console.log('─'.repeat(40));

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
  const versionFile = path.join(MARKETPLACE_DIR, 'VERSION');
  const newVersion = fs.readFileSync(versionFile, 'utf8').trim();
  console.log(`   Found version: ${newVersion}`);

  // 3. Get commit SHA
  const commitSha = run(`git -C "${MARKETPLACE_DIR}" rev-parse --short HEAD`);

  // 4. Copy to cache
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

  // 5. Update installed_plugins.json with GLOBAL scope
  console.log('\n3. Updating plugin registry (global scope)...');

  const installed = {
    version: 2,
    plugins: {
      'ctoc@robotijn': [
        {
          scope: 'global',  // CRITICAL: Force global scope
          installPath: cacheVersionDir,
          version: newVersion,
          installedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          gitCommitSha: commitSha
        }
      ]
    }
  };

  fs.writeFileSync(INSTALLED_FILE, JSON.stringify(installed, null, 2));
  console.log('   Registry updated with scope: global');

  // 6. Clean old versions
  console.log('\n4. Cleaning old versions...');
  const versions = fs.readdirSync(CACHE_DIR).filter(v => v !== newVersion);
  for (const v of versions) {
    fs.rmSync(path.join(CACHE_DIR, v), { recursive: true });
    console.log(`   Removed: ${v}`);
  }
  if (versions.length === 0) {
    console.log('   No old versions to remove');
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`✓ Updated to CTOC v${newVersion}`);
  console.log('\nRestart Claude Code for changes to take effect.');
}

update();

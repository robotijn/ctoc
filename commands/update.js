#!/usr/bin/env node
/**
 * CTOC Update Command
 *
 * Smart update system that uses git directly in the cache directory.
 * No restart required - updates are instant.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const PLUGINS_DIR = path.join(HOME, '.claude', 'plugins');
const CACHE_DIR = path.join(PLUGINS_DIR, 'cache', 'robotijn', 'ctoc');
const INSTALLED_FILE = path.join(PLUGINS_DIR, 'installed_plugins.json');
const REPO_URL = 'https://github.com/robotijn/ctoc.git';

// ANSI colors
const c = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
};

function log(icon, msg) {
  console.log(`${icon} ${msg}`);
}

function exec(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function isGitRepo(dir) {
  try {
    exec('git rev-parse --git-dir', dir);
    return true;
  } catch {
    return false;
  }
}

function ensureGitCache() {
  // If cache doesn't exist or isn't a git repo, clone fresh
  if (!fs.existsSync(CACHE_DIR) || !isGitRepo(CACHE_DIR)) {
    log('📦', 'Setting up git-based cache...');

    // Remove old cache if exists
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(CACHE_DIR);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Clone the repo
    execSync(`git clone --depth 1 ${REPO_URL} "${CACHE_DIR}"`, { stdio: 'pipe' });
    log(`${c.green}✓${c.reset}`, 'Git cache initialized');
    return { fresh: true };
  }

  return { fresh: false };
}

function getCurrentVersion() {
  const versionFile = path.join(CACHE_DIR, 'VERSION');
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, 'utf8').trim();
  }
  return null;
}

function getCurrentSha() {
  try {
    return exec('git rev-parse --short HEAD', CACHE_DIR);
  } catch {
    return null;
  }
}

function checkForUpdates() {
  try {
    // Fetch latest
    exec('git fetch origin', CACHE_DIR);

    // Get local and remote HEADs
    const localSha = exec('git rev-parse HEAD', CACHE_DIR);
    const remoteSha = exec('git rev-parse origin/main', CACHE_DIR);

    return {
      hasUpdates: localSha !== remoteSha,
      localSha: localSha.slice(0, 7),
      remoteSha: remoteSha.slice(0, 7)
    };
  } catch (err) {
    return { hasUpdates: false, error: err.message };
  }
}

function pullUpdates() {
  try {
    // Reset to origin/main (handles any local changes)
    exec('git reset --hard origin/main', CACHE_DIR);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateInstalledPlugins(sha, version) {
  if (!fs.existsSync(INSTALLED_FILE)) {
    return false;
  }

  try {
    const data = JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf8'));
    const pluginKey = 'ctoc@robotijn';

    if (data.plugins && data.plugins[pluginKey]) {
      for (const entry of data.plugins[pluginKey]) {
        entry.gitCommitSha = sha;
        entry.lastUpdated = new Date().toISOString();
        entry.installPath = CACHE_DIR;
        if (version) {
          entry.version = version;
        }
      }
      fs.writeFileSync(INSTALLED_FILE, JSON.stringify(data, null, 2) + '\n');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function getRemoteVersion() {
  try {
    // Read VERSION from origin/main without checking out
    const version = exec('git show origin/main:VERSION', CACHE_DIR);
    return version;
  } catch {
    return null;
  }
}

function main() {
  console.log(`\n${c.bold}${c.cyan}CTOC Update${c.reset}`);
  console.log('─'.repeat(40));

  // Step 1: Ensure cache is a git repo
  const cacheResult = ensureGitCache();

  const oldVersion = getCurrentVersion();
  const oldSha = getCurrentSha();

  // Step 2: Check for updates
  log('🔍', 'Checking for updates...');
  const check = checkForUpdates();

  if (check.error) {
    log(`${c.red}✗${c.reset}`, `Error: ${check.error}`);
    process.exit(1);
  }

  if (!check.hasUpdates && !cacheResult.fresh) {
    const version = oldVersion ? `v${oldVersion}` : oldSha;
    log(`${c.green}✓${c.reset}`, `Already at latest (${version})`);
    console.log('─'.repeat(40));
    console.log(`\n${c.dim}No restart required.${c.reset}\n`);
    return;
  }

  // Get what we're updating to
  const newVersion = getRemoteVersion();

  // Step 3: Pull updates
  log('📥', 'Pulling updates...');
  const pullResult = pullUpdates();

  if (!pullResult.success) {
    log(`${c.red}✗${c.reset}`, `Pull failed: ${pullResult.error}`);
    process.exit(1);
  }

  const newSha = getCurrentSha();
  const displayOld = oldVersion ? `v${oldVersion}` : oldSha;
  const displayNew = newVersion ? `v${newVersion}` : newSha;

  log(`${c.green}✓${c.reset}`, `Updated: ${displayOld} → ${c.bold}${displayNew}${c.reset}`);

  // Step 4: Update metadata
  log('📝', 'Updating metadata...');
  const fullSha = exec('git rev-parse HEAD', CACHE_DIR);
  updateInstalledPlugins(fullSha, newVersion);
  log(`${c.green}✓${c.reset}`, 'Metadata updated');

  // Done
  console.log('─'.repeat(40));
  console.log(`\n${c.bold}${c.green}✓ Update complete!${c.reset}`);
  console.log(`\n${c.dim}No restart required - changes are live.${c.reset}\n`);
}

main();

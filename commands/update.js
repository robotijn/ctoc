#!/usr/bin/env node
/**
 * CTOC Update Command
 *
 * Workaround for Claude Code bug where /plugin update doesn't clear cache.
 * See: https://github.com/anthropics/claude-code/issues/19197
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const PLUGINS_DIR = path.join(HOME, '.claude', 'plugins');
const CACHE_DIR = path.join(PLUGINS_DIR, 'cache', 'robotijn');
const MARKETPLACE_DIR = path.join(PLUGINS_DIR, 'marketplaces', 'robotijn');
const INSTALLED_FILE = path.join(PLUGINS_DIR, 'installed_plugins.json');

// ANSI colors
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(icon, msg) {
  console.log(`${icon} ${msg}`);
}

function rmDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }
  return false;
}

function updateMarketplace() {
  if (!fs.existsSync(MARKETPLACE_DIR)) {
    return { success: false, error: 'Marketplace not found' };
  }

  try {
    // Get current version before update
    const oldSha = execSync('git rev-parse --short HEAD', {
      cwd: MARKETPLACE_DIR,
      encoding: 'utf8'
    }).trim();

    // Fetch and reset to latest
    execSync('git fetch origin', { cwd: MARKETPLACE_DIR, stdio: 'pipe' });

    // Get default branch
    let branch = 'main';
    try {
      branch = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
        cwd: MARKETPLACE_DIR,
        encoding: 'utf8'
      }).trim().replace('refs/remotes/origin/', '');
    } catch {
      // Fallback to main
    }

    execSync(`git reset --hard origin/${branch}`, { cwd: MARKETPLACE_DIR, stdio: 'pipe' });

    // Get new version
    const newSha = execSync('git rev-parse --short HEAD', {
      cwd: MARKETPLACE_DIR,
      encoding: 'utf8'
    }).trim();

    // Try to read VERSION file
    let version = null;
    const versionFile = path.join(MARKETPLACE_DIR, 'VERSION');
    if (fs.existsSync(versionFile)) {
      version = fs.readFileSync(versionFile, 'utf8').trim();
    }

    return { success: true, oldSha, newSha, branch, version };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function updateInstalledPlugins(newSha, version) {
  if (!fs.existsSync(INSTALLED_FILE)) {
    return false;
  }

  try {
    const data = JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf8'));
    const pluginKey = 'ctoc@robotijn';

    if (data.plugins && data.plugins[pluginKey]) {
      for (const entry of data.plugins[pluginKey]) {
        entry.gitCommitSha = newSha;
        entry.lastUpdated = new Date().toISOString();
        if (version) {
          entry.version = version;
          // Update install path to new version
          const oldPath = entry.installPath;
          if (oldPath && oldPath.includes('/cache/robotijn/ctoc/')) {
            entry.installPath = path.join(CACHE_DIR, 'ctoc', version);
          }
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

function main() {
  console.log(`\n${BOLD}${CYAN}CTOC Update${RESET}`);
  console.log('─'.repeat(40));

  // Step 1: Update marketplace repo
  log('📡', 'Updating marketplace...');
  const result = updateMarketplace();

  if (!result.success) {
    log(`${RED}✗${RESET}`, `Marketplace update failed: ${result.error}`);
    console.log(`\n${YELLOW}Try: /plugin marketplace add https://github.com/robotijn/ctoc${RESET}`);
    process.exit(1);
  }

  const versionInfo = result.version ? `v${result.version}` : result.newSha;
  if (result.oldSha === result.newSha) {
    log(`${GREEN}✓${RESET}`, `Already at latest (${versionInfo})`);
  } else {
    log(`${GREEN}✓${RESET}`, `Updated: ${result.oldSha} → ${versionInfo}`);
  }

  // Step 2: Clear stale cache
  log('🗑️ ', 'Clearing stale cache...');
  if (rmDir(CACHE_DIR)) {
    log(`${GREEN}✓${RESET}`, 'Cache cleared');
  } else {
    log(`${YELLOW}○${RESET}`, 'No cache to clear');
  }

  // Step 3: Update installed_plugins.json
  log('📝', 'Updating plugin metadata...');
  const fullSha = execSync('git rev-parse HEAD', {
    cwd: MARKETPLACE_DIR,
    encoding: 'utf8'
  }).trim();

  if (updateInstalledPlugins(fullSha, result.version)) {
    log(`${GREEN}✓${RESET}`, 'Metadata updated');
  } else {
    log(`${YELLOW}○${RESET}`, 'No metadata to update');
  }

  // Done
  console.log('─'.repeat(40));
  console.log(`\n${BOLD}${GREEN}✓ Update complete!${RESET}`);
  console.log(`\n${YELLOW}⚠ Restart Claude Code to load the new version.${RESET}\n`);
}

main();

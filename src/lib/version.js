#!/usr/bin/env node
/**
 * CTOC Version Management
 * Handles version bumping, syncing, and update checking
 */

const safeFs = require('./safe-fs');
const path = require('path');
const https = require('https');
const { CTOC_HOME } = require('./crypto');

// Cache update checks for 24 hours. The cache path is the module's real input
// boundary; tests set CTOC_UPDATE_CACHE_FILE to an isolated per-process path so a
// suite never reads or mutates the user's shared ~/.ctoc/.update-cache.json (which
// the live session and sibling worktrees write concurrently — a cross-process race
// that intermittently reddened the gate). Unset in production → unchanged behavior.
const UPDATE_CACHE_FILE = process.env.CTOC_UPDATE_CACHE_FILE || path.join(CTOC_HOME, '.update-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// GitHub raw URL for VERSION file
const GITHUB_VERSION_URL = 'https://raw.githubusercontent.com/robotijn/ctoc/main/VERSION';

/**
 * Get the plugin root directory
 * Works whether called from lib/ or elsewhere
 */
function getPluginRoot() {
  // When running as part of the plugin, __dirname is ctoc-plugin/lib
  // Go up to find VERSION file
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (safeFs.existsSync(path.join(dir, 'VERSION'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback to cwd
  return process.cwd();
}

/**
 * Read current version from VERSION file
 * @returns {string} Current version (e.g., "X.Y.Z")
 */
function getVersion() {
  const versionFile = path.join(getPluginRoot(), 'VERSION');
  if (!safeFs.existsSync(versionFile)) {
    return '0.0.0';
  }
  return safeFs.readFileSync(versionFile, 'utf8').trim();
}

/**
 * Parse semver string into components
 * @param {string} version - Version string (e.g., "X.Y.Z")
 * @returns {{major: number, minor: number, patch: number}}
 */
function parseVersion(version) {
  const [major, minor, patch] = version.split('.').map(n => parseInt(n, 10) || 0);
  return { major, minor, patch };
}

/**
 * Compare two versions
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
  return 0;
}

/**
 * Bump version
 * @param {string} version - Current version
 * @param {'patch'|'minor'|'major'} type - Bump type (default: patch)
 * @returns {string} New version
 *
 * @example
 * bump('1.2.3')          // → '1.2.4' (patch is default)
 * bump('1.2.3', 'patch') // → '1.2.4'
 * bump('1.2.3', 'minor') // → '1.3.0'
 * bump('1.2.3', 'major') // → '2.0.0'
 */
function bump(version, type = 'patch') {
  let { major, minor, patch } = parseVersion(version);

  switch (type) {
    case 'major':
      major++;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor++;
      patch = 0;
      break;
    case 'patch':
    default:
      patch++;
      break;
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * Write version to VERSION file
 * @param {string} version - New version
 */
function setVersion(version) {
  const versionFile = path.join(getPluginRoot(), 'VERSION');
  safeFs.writeFileSync(versionFile, version + '\n');
}

/**
 * Sync VERSION to marketplace.json
 * Updates both metadata.version and plugins[0].version
 */
function syncToMarketplace() {
  const root = getPluginRoot();
  const marketplaceFile = path.join(root, '.claude-plugin', 'marketplace.json');

  if (!safeFs.existsSync(marketplaceFile)) {
    return { success: false, error: 'marketplace.json not found' };
  }

  const version = getVersion();
  const marketplace = JSON.parse(safeFs.readFileSync(marketplaceFile, 'utf8'));

  // Update both locations
  if (marketplace.metadata) {
    marketplace.metadata.version = version;
  }
  if (marketplace.plugins && marketplace.plugins[0]) {
    marketplace.plugins[0].version = version;
  }

  safeFs.writeFileSync(marketplaceFile, JSON.stringify(marketplace, null, 2) + '\n');

  return { success: true, version };
}

/**
 * Sync VERSION to plugin.json
 */
function syncToPluginJson() {
  const root = getPluginRoot();
  const pluginFile = path.join(root, '.claude-plugin', 'plugin.json');

  if (!safeFs.existsSync(pluginFile)) {
    return { success: false, error: 'plugin.json not found' };
  }

  const version = getVersion();
  const plugin = JSON.parse(safeFs.readFileSync(pluginFile, 'utf8'));
  plugin.version = version;

  safeFs.writeFileSync(pluginFile, JSON.stringify(plugin, null, 2) + '\n');

  return { success: true, version };
}

/**
 * Sync VERSION to README.md.
 *
 * Updates the two README targets that reflect the product version — the same
 * targets the release script (src/scripts/release.js) rewrites:
 *   1. the version line at the start of a line: `**X.Y.Z**` (whatever separator
 *      or text follows — em-dash, middle-dot, etc.);
 *   2. the shields.io version badge: `version-X.Y.Z-blue`.
 *
 * FAIL LOUD: if the version line token is absent (e.g. the README format drifted
 * so no `**X.Y.Z**` appears at a line start), the sync cannot do its job and
 * returns `{ success: false, matched: false }` instead of a phantom success — so
 * a future format drift surfaces loudly rather than silently disabling the sync.
 *
 * @param {string} [root] - Repo root (defaults to the resolved plugin root).
 *   An explicit root lets a test drive a fixture README without touching the
 *   tracked one.
 * @returns {{success: boolean, version?: string, matched?: boolean, error?: string}}
 */
function syncToReadme(root = getPluginRoot()) {
  const readmeFile = path.join(root, 'README.md');

  if (!safeFs.existsSync(readmeFile)) {
    return { success: false, error: 'README.md not found' };
  }

  const version = getVersion();
  let content = safeFs.readFileSync(readmeFile, 'utf8');

  // Version token at the start of a line: **X.Y.Z** (separator-agnostic).
  const versionLine = /^\*\*\d+\.\d+\.\d+\*\*/m;
  // shields.io version badge.
  const badge = /version-\d+\.\d+\.\d+-blue/g;

  if (!versionLine.test(content)) {
    return { success: false, matched: false, version, error: 'README version line not found' };
  }

  content = content
    .replace(versionLine, `**${version}**`)
    .replace(badge, `version-${version}-blue`);

  safeFs.writeFileSync(readmeFile, content);

  return { success: true, matched: true, version };
}

/**
 * Sync VERSION to all files
 * @returns {{marketplace: boolean, plugin: boolean, readme: boolean}}
 */
function syncAll() {
  return {
    marketplace: syncToMarketplace().success,
    plugin: syncToPluginJson().success,
    readme: syncToReadme().success
  };
}

/**
 * Release: bump version and sync to all files
 * @param {'patch'|'minor'|'major'} type - Bump type (default: patch)
 * @returns {{oldVersion: string, newVersion: string, synced: {marketplace: boolean, plugin: boolean, readme: boolean}}}
 *
 * @example
 * release()          // patch: X.Y.Z → X.Y.Z+1
 * release('minor')   // minor: X.Y.Z → X.Y+1.0
 * release('major')   // major: X.Y.Z → X+1.0.0
 */
function release(type = 'patch') {
  const oldVersion = getVersion();
  const newVersion = bump(oldVersion, type);

  setVersion(newVersion);
  const synced = syncAll();

  return {
    oldVersion,
    newVersion,
    synced
  };
}

/**
 * Fetch latest version from GitHub (with timeout)
 * @returns {Promise<string|null>} Latest version or null on error
 */
function fetchLatestVersion() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000); // 5s timeout

    https.get(GITHUB_VERSION_URL, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        resolve(data.trim());
      });
    }).on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

/**
 * Load update cache
 * @returns {{latestVersion: string, checkedAt: number}|null}
 */
function loadUpdateCache() {
  if (!safeFs.existsSync(UPDATE_CACHE_FILE)) {
    return null;
  }

  try {
    const cache = JSON.parse(safeFs.readFileSync(UPDATE_CACHE_FILE, 'utf8'));
    const age = Date.now() - cache.checkedAt;

    if (age < CACHE_TTL_MS) {
      return cache;
    }
  } catch (e) {
    // Invalid cache
  }

  return null;
}

/**
 * Save update cache
 */
function saveUpdateCache(latestVersion) {
  const cache = {
    latestVersion,
    checkedAt: Date.now()
  };

  // Ensure CTOC_HOME exists
  if (!safeFs.existsSync(CTOC_HOME)) {
    safeFs.mkdirSync(CTOC_HOME, { recursive: true });
  }

  safeFs.writeFileSync(UPDATE_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Check for updates (uses cache, fetches if stale)
 * @returns {Promise<{updateAvailable: boolean, currentVersion: string, latestVersion: string|null, cached: boolean}>}
 *   `cached` is true when the answer came from the on-disk update cache rather
 *   than a live fetch.
 *
 * @example
 * const result = await checkForUpdates();
 * if (result.updateAvailable) {
 *   console.log(`Update: ${result.currentVersion} → ${result.latestVersion}`);
 * }
 */
async function checkForUpdates() {
  const currentVersion = getVersion();

  // Check cache first
  const cache = loadUpdateCache();
  if (cache) {
    return {
      updateAvailable: compareVersions(currentVersion, cache.latestVersion) < 0,
      currentVersion,
      latestVersion: cache.latestVersion,
      cached: true
    };
  }

  // Fetch from GitHub
  const latestVersion = await fetchLatestVersion();

  if (latestVersion) {
    saveUpdateCache(latestVersion);
    return {
      updateAvailable: compareVersions(currentVersion, latestVersion) < 0,
      currentVersion,
      latestVersion,
      cached: false
    };
  }

  // Network error - no update info
  return {
    updateAvailable: false,
    currentVersion,
    latestVersion: null,
    cached: false
  };
}

/**
 * Synchronous update check (uses cache only, won't fetch)
 * Use this in hooks where async isn't ideal
 * @returns {{updateAvailable: boolean, currentVersion: string, latestVersion: string|null}}
 */
function checkForUpdatesSync() {
  const currentVersion = getVersion();
  const cache = loadUpdateCache();

  if (cache) {
    return {
      updateAvailable: compareVersions(currentVersion, cache.latestVersion) < 0,
      currentVersion,
      latestVersion: cache.latestVersion
    };
  }

  return {
    updateAvailable: false,
    currentVersion,
    latestVersion: null
  };
}

module.exports = {
  getVersion,
  parseVersion,
  compareVersions,
  bump,
  setVersion,
  syncToMarketplace,
  syncToPluginJson,
  syncToReadme,
  syncAll,
  release,
  fetchLatestVersion,
  checkForUpdates,
  checkForUpdatesSync,
  GITHUB_VERSION_URL
};

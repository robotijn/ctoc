/**
 * CTOC Update Check
 * Checks for CTOC updates on session start (throttled to once/day)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { loadConfig, saveConfig, log } = require('../lib/utils');

const VERSION_URL = 'https://raw.githubusercontent.com/robotijn/ctoc/main/VERSION';
const CHECK_INTERVAL_HOURS = 24;

/**
 * Compare two semver versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareSemver(a, b) {
  const parseVersion = (v) => {
    const match = String(v).match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) return [0, 0, 0];
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  };

  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);

  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

/**
 * Gets the current installed CTOC version
 */
function getCurrentVersion() {
  try {
    const versionFile = path.join(__dirname, '../../VERSION');
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Fetches the latest version from GitHub
 */
function fetchLatestVersion() {
  return new Promise((resolve, reject) => {
    const request = https.get(VERSION_URL, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (redirectRes) => {
          let data = '';
          redirectRes.on('data', chunk => data += chunk);
          redirectRes.on('end', () => resolve(data.trim()));
        }).on('error', reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    });

    request.on('error', reject);

    // Timeout after 5 seconds
    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Checks for CTOC updates (non-blocking, throttled)
 *
 * Behavior:
 * - Skips if CTOC_SKIP_UPDATE_CHECK=1
 * - Skips if already checked within 24 hours
 * - Silent fail on network errors
 * - Logs message if update is available
 */
async function checkForUpdates() {
  // Skip if disabled via environment variable
  if (process.env.CTOC_SKIP_UPDATE_CHECK === '1') {
    return;
  }

  const currentVersion = getCurrentVersion();
  if (currentVersion === 'unknown') {
    return;
  }

  const config = loadConfig();
  const now = new Date();
  const lastCheck = config.updates?.last_check_time
    ? new Date(config.updates.last_check_time)
    : null;

  // Throttle: skip if checked within 24 hours
  if (lastCheck) {
    const hoursSince = (now - lastCheck) / (1000 * 60 * 60);
    if (hoursSince < CHECK_INTERVAL_HOURS) {
      return;
    }
  }

  try {
    const latestVersion = await fetchLatestVersion();

    // Update config with check timestamp
    config.updates = {
      ...config.updates,
      last_check_time: now.toISOString(),
      latest_version: latestVersion
    };
    saveConfig(config);

    // Only show update if latest is NEWER than current
    if (latestVersion && compareSemver(latestVersion, currentVersion) > 0) {
      log(`Update available: ${currentVersion} → ${latestVersion}`);
      log(`Run 'ctoc update' to upgrade`);
    }
  } catch (err) {
    // Silent fail - don't block session start
    // Network errors, timeouts, etc. are not critical
  }
}

module.exports = { checkForUpdates, getCurrentVersion, fetchLatestVersion, compareSemver };

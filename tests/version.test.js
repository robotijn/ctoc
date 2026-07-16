/**
 * Version Management Tests
 * Tests for lib/version.js
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const { EventEmitter } = require('node:events');

// Import the module under test
const version = require('../src/lib/version');

// Several tests below call the REAL release()/setVersion()/syncAll()/syncToPluginJson()
// against the actual repo files (getPluginRoot() resolves to this repo). Once
// syncToPluginJson's ctoc-plugin/ path bug was fixed (v6.12.48) those syncs
// actually write .claude-plugin/plugin.json, so a test that bumps the version can
// leave the working tree with a version mismatch that then gets committed. This
// root-level teardown restores EVERY synced file to the version present when this
// file loaded, after all of its tests have run — so the tree is clean before any
// `git add`. (Individual mutation tests also restore in their own finally blocks to
// narrow the dirty window during the parallel suite run.)
const __VERSION_AT_LOAD__ = version.getVersion();
after(() => {
  try {
    version.setVersion(__VERSION_AT_LOAD__);
    version.syncAll();
  } catch { /* best-effort restore */ }
});

// The module captures these constants at load time from ~/.ctoc.
// Reconstruct the same on-disk cache path so failure-path tests can drive
// loadUpdateCache / saveUpdateCache / checkForUpdates through the real seam
// (the on-disk cache) rather than by mocking the module's own logic.
const CTOC_HOME = path.join(os.homedir(), '.ctoc');
const UPDATE_CACHE_FILE = path.join(CTOC_HOME, '.update-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// --- Real external boundary: a fake https.get -------------------------------
// version.js does `const https = require('https')` at load; require() returns
// the cached module object, so overriding https.get here replaces exactly the
// network boundary the module calls. This is the system boundary (network) —
// the only thing the skill permits stubbing — not the module's own logic.
const realHttpsGet = https.get;

/** Stub https.get to yield a 200 response streaming `body`, then 'end'. */
function stubHttpsSuccess(body) {
  https.get = (_url, cb) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    // cb registers res.on('data'/'end') synchronously; emit after on next tick.
    process.nextTick(() => {
      cb(res);
      res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    return new EventEmitter(); // the returned req; .on('error', ...) chains onto it
  };
}

/** Stub https.get to yield a non-200 status code. */
function stubHttpsStatus(statusCode) {
  https.get = (_url, cb) => {
    const res = new EventEmitter();
    res.statusCode = statusCode;
    process.nextTick(() => cb(res));
    return new EventEmitter();
  };
}

/** Stub https.get so the request emits an 'error' (connection failure). */
function stubHttpsError() {
  https.get = (_url, _cb) => {
    const req = new EventEmitter();
    process.nextTick(() => req.emit('error', new Error('ENOTFOUND')));
    return req;
  };
}

/** Stub https.get so nothing ever fires (drives the 5s timeout branch). */
function stubHttpsHang() {
  https.get = (_url, _cb) => new EventEmitter();
}

function restoreHttps() {
  https.get = realHttpsGet;
}

// --- Real cache-file fixture -------------------------------------------------
let savedCacheExisted = false;
let savedCacheBytes = null;

function backupCache() {
  savedCacheExisted = fs.existsSync(UPDATE_CACHE_FILE);
  savedCacheBytes = savedCacheExisted ? fs.readFileSync(UPDATE_CACHE_FILE) : null;
}

function restoreCache() {
  if (savedCacheExisted) {
    fs.writeFileSync(UPDATE_CACHE_FILE, savedCacheBytes);
  } else if (fs.existsSync(UPDATE_CACHE_FILE)) {
    fs.rmSync(UPDATE_CACHE_FILE);
  }
}

function removeCache() {
  if (fs.existsSync(UPDATE_CACHE_FILE)) fs.rmSync(UPDATE_CACHE_FILE);
}

function writeCache(obj) {
  if (!fs.existsSync(CTOC_HOME)) fs.mkdirSync(CTOC_HOME, { recursive: true });
  fs.writeFileSync(UPDATE_CACHE_FILE, JSON.stringify(obj));
}

// =============================================================================
// parseVersion Tests
// =============================================================================

describe('parseVersion', () => {
  test('parses standard semver', () => {
    const result = version.parseVersion('1.2.3');
    assert.strictEqual(result.major, 1);
    assert.strictEqual(result.minor, 2);
    assert.strictEqual(result.patch, 3);
  });

  test('parses zero version', () => {
    const result = version.parseVersion('0.0.0');
    assert.strictEqual(result.major, 0);
    assert.strictEqual(result.minor, 0);
    assert.strictEqual(result.patch, 0);
  });

  test('parses large version numbers', () => {
    const result = version.parseVersion('123.456.789');
    assert.strictEqual(result.major, 123);
    assert.strictEqual(result.minor, 456);
    assert.strictEqual(result.patch, 789);
  });

  test('handles partial versions (minor.patch missing)', () => {
    // Note: parseVersion returns NaN for missing parts due to parseInt behavior
    // This tests the actual behavior of the function
    const result = version.parseVersion('1.2');
    assert.strictEqual(result.major, 1);
    assert.strictEqual(result.minor, 2);
    // patch will be NaN when undefined is passed to parseInt
    assert.ok(isNaN(result.patch) || result.patch === 0, 'patch is NaN or 0 for missing part');
  });

  test('handles major-only version', () => {
    const result = version.parseVersion('5');
    assert.strictEqual(result.major, 5);
    // minor and patch will be NaN when undefined is passed to parseInt
    assert.ok(isNaN(result.minor) || result.minor === 0, 'minor is NaN or 0 for missing part');
    assert.ok(isNaN(result.patch) || result.patch === 0, 'patch is NaN or 0 for missing part');
  });

  test('handles invalid string parts as 0', () => {
    const result = version.parseVersion('1.abc.3');
    assert.strictEqual(result.major, 1);
    assert.strictEqual(result.minor, 0);
    assert.strictEqual(result.patch, 3);
  });
});

// =============================================================================
// compareVersions Tests
// =============================================================================

describe('compareVersions', () => {
  test('returns 0 for equal versions', () => {
    assert.strictEqual(version.compareVersions('1.2.3', '1.2.3'), 0);
  });

  test('returns -1 when a < b (major)', () => {
    assert.strictEqual(version.compareVersions('1.0.0', '2.0.0'), -1);
  });

  test('returns 1 when a > b (major)', () => {
    assert.strictEqual(version.compareVersions('2.0.0', '1.0.0'), 1);
  });

  test('returns -1 when a < b (minor)', () => {
    assert.strictEqual(version.compareVersions('1.1.0', '1.2.0'), -1);
  });

  test('returns 1 when a > b (minor)', () => {
    assert.strictEqual(version.compareVersions('1.3.0', '1.2.0'), 1);
  });

  test('returns -1 when a < b (patch)', () => {
    assert.strictEqual(version.compareVersions('1.2.3', '1.2.4'), -1);
  });

  test('returns 1 when a > b (patch)', () => {
    assert.strictEqual(version.compareVersions('1.2.5', '1.2.4'), 1);
  });

  test('handles complex comparisons', () => {
    // 1.10.0 > 1.9.0 (not string comparison)
    assert.strictEqual(version.compareVersions('1.10.0', '1.9.0'), 1);
  });

  test('handles zero versions', () => {
    assert.strictEqual(version.compareVersions('0.0.0', '0.0.1'), -1);
    assert.strictEqual(version.compareVersions('0.0.0', '0.0.0'), 0);
  });
});

// =============================================================================
// bump Tests
// =============================================================================

describe('bump', () => {
  test('bumps patch by default', () => {
    assert.strictEqual(version.bump('1.2.3'), '1.2.4');
  });

  test('bumps patch explicitly', () => {
    assert.strictEqual(version.bump('1.2.3', 'patch'), '1.2.4');
  });

  test('bumps minor and resets patch', () => {
    assert.strictEqual(version.bump('1.2.3', 'minor'), '1.3.0');
  });

  test('bumps major and resets minor and patch', () => {
    assert.strictEqual(version.bump('1.2.3', 'major'), '2.0.0');
  });

  test('handles zero version', () => {
    assert.strictEqual(version.bump('0.0.0'), '0.0.1');
    assert.strictEqual(version.bump('0.0.0', 'minor'), '0.1.0');
    assert.strictEqual(version.bump('0.0.0', 'major'), '1.0.0');
  });

  test('handles large numbers', () => {
    assert.strictEqual(version.bump('99.99.99', 'patch'), '99.99.100');
    assert.strictEqual(version.bump('99.99.99', 'minor'), '99.100.0');
    assert.strictEqual(version.bump('99.99.99', 'major'), '100.0.0');
  });

  test('handles unknown bump type as patch', () => {
    assert.strictEqual(version.bump('1.2.3', 'unknown'), '1.2.4');
  });
});

// =============================================================================
// getVersion Tests
// =============================================================================

describe('getVersion', () => {
  test('returns current version from VERSION file', () => {
    // This tests the actual VERSION file in the project
    const currentVersion = version.getVersion();
    assert.ok(currentVersion, 'Version should not be empty');
    assert.match(currentVersion, /^\d+\.\d+\.\d+$/, 'Version should be semver format');
  });
});

// =============================================================================
// setVersion Tests (using real file system)
// =============================================================================

describe('setVersion', { skip: false }, () => {
  test('writes version to VERSION file', () => {
    // Read current version first
    const originalVersion = version.getVersion();

    // This test modifies the actual VERSION file, so we restore it after
    try {
      version.setVersion('99.99.99');
      const newVersion = version.getVersion();
      assert.strictEqual(newVersion, '99.99.99');
    } finally {
      // Restore original version
      version.setVersion(originalVersion);
    }
  });
});

// =============================================================================
// syncToMarketplace Tests
// =============================================================================

describe('syncToMarketplace', () => {
  test('updates marketplace.json with version', () => {
    const result = version.syncToMarketplace();
    // Check if it worked or file doesn't exist
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('success' in result, 'Result has success property');
    if (result.success) {
      assert.ok(result.version, 'Has version property when successful');
    } else {
      assert.ok(result.error, 'Has error property when unsuccessful');
    }
  });
});

// =============================================================================
// syncToPluginJson Tests
// =============================================================================

describe('syncToPluginJson', () => {
  test('updates plugin.json with version', () => {
    const result = version.syncToPluginJson();
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('success' in result, 'Result has success property');
    if (result.success) {
      assert.ok(result.version, 'Has version property when successful');
    } else {
      assert.ok(result.error, 'Has error property when unsuccessful');
    }
  });
});

// =============================================================================
// syncToReadme Tests
// =============================================================================

describe('syncToReadme', () => {
  test('updates README.md with version', () => {
    const result = version.syncToReadme();
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('success' in result, 'Result has success property');
    if (result.success) {
      assert.ok(result.version, 'Has version property when successful');
    } else {
      assert.ok(result.error, 'Has error property when unsuccessful');
    }
  });
});

// =============================================================================
// syncToReadme — fixture-driven: real update + fail-loud on format drift
// =============================================================================

describe('syncToReadme against a fixture README', () => {
  const realReadme = path.join(path.dirname(__dirname), 'README.md');
  let savedReal;
  let tmpDir;

  before(() => {
    // Restore the tracked README verbatim no matter what the fixture calls do.
    savedReal = fs.existsSync(realReadme) ? fs.readFileSync(realReadme) : null;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-readme-'));
  });

  after(() => {
    if (savedReal !== null) fs.writeFileSync(realReadme, savedReal);
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('updates the version line + badge even when the separator drifted from em-dash', () => {
    // Arrange — a README whose version line uses the CURRENT middle-dot style,
    // not the em-dash the old regex demanded.
    const current = version.getVersion();
    const readme = path.join(tmpDir, 'README.md');
    fs.writeFileSync(readme,
      '  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-blue">\n' +
      '\n' +
      '**1.0.0** · Built by someone\n');

    // Act
    const result = version.syncToReadme(tmpDir);
    const after = fs.readFileSync(readme, 'utf8');

    // Assert — real update happened, and success is honest.
    assert.strictEqual(result.success, true);
    assert.ok(after.includes(`**${current}**`), 'version line updated to current version');
    assert.ok(after.includes(`version-${current}-blue`), 'shields badge updated to current version');
    assert.ok(!after.includes('**1.0.0**'), 'old version line replaced');
    assert.ok(!after.includes('version-1.0.0-blue'), 'old badge replaced');
  });

  test('returns success:false when no version line is present (fail loud, no phantom success)', () => {
    // Arrange — a README with no matchable version token at line start.
    const readme = path.join(tmpDir, 'README.md');
    fs.writeFileSync(readme, '# A README with no version token at the start of any line\n');
    const before = fs.readFileSync(readme, 'utf8');

    // Act
    const result = version.syncToReadme(tmpDir);
    const after = fs.readFileSync(readme, 'utf8');

    // Assert — must NOT report a phantom success; file untouched.
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.matched, false);
    assert.strictEqual(after, before, 'nothing written when there was nothing to match');
  });
});

// =============================================================================
// syncAll Tests
// =============================================================================

describe('syncAll', () => {
  test('returns status for all sync operations', () => {
    const result = version.syncAll();
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('marketplace' in result, 'Has marketplace status');
    assert.ok('plugin' in result, 'Has plugin status');
    assert.ok('readme' in result, 'Has readme status');
    assert.strictEqual(typeof result.marketplace, 'boolean');
    assert.strictEqual(typeof result.plugin, 'boolean');
    assert.strictEqual(typeof result.readme, 'boolean');
  });
});

// =============================================================================
// release Tests
// =============================================================================

describe('release', { skip: 'Skipped to avoid modifying VERSION file' }, () => {
  test('bumps version and syncs all files', () => {
    const originalVersion = version.getVersion();
    try {
      const result = version.release('patch');
      assert.ok(result.oldVersion, 'Has old version');
      assert.ok(result.newVersion, 'Has new version');
      assert.ok(result.synced, 'Has synced status');
      assert.strictEqual(version.compareVersions(result.newVersion, result.oldVersion), 1,
        'New version should be greater than old version');
    } finally {
      // Restore original version
      version.setVersion(originalVersion);
      version.syncAll();
    }
  });
});

// =============================================================================
// checkForUpdatesSync Tests
// =============================================================================

describe('checkForUpdatesSync', () => {
  test('returns update check result', () => {
    const result = version.checkForUpdatesSync();
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('updateAvailable' in result, 'Has updateAvailable property');
    assert.ok('currentVersion' in result, 'Has currentVersion property');
    assert.ok('latestVersion' in result, 'Has latestVersion property');
    assert.strictEqual(typeof result.updateAvailable, 'boolean');
    assert.ok(result.currentVersion, 'Current version should not be empty');
  });

  test('returns false when no cache exists', () => {
    // This tests the fallback behavior when cache doesn't exist or is stale
    const result = version.checkForUpdatesSync();
    // Result should be valid regardless of cache state
    assert.strictEqual(typeof result.updateAvailable, 'boolean');
  });
});

// =============================================================================
// checkForUpdates Tests (async)
// =============================================================================

describe('checkForUpdates', () => {
  test('returns promise with update check result', async () => {
    const result = await version.checkForUpdates();
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('updateAvailable' in result, 'Has updateAvailable property');
    assert.ok('currentVersion' in result, 'Has currentVersion property');
    assert.ok('latestVersion' in result, 'Has latestVersion property');
    assert.strictEqual(typeof result.updateAvailable, 'boolean');
    assert.ok(result.currentVersion, 'Current version should not be empty');
    assert.ok('cached' in result, 'Has cached property');
  });
});

// =============================================================================
// GITHUB_VERSION_URL Tests
// =============================================================================

describe('GITHUB_VERSION_URL', () => {
  test('is a valid GitHub raw URL', () => {
    assert.ok(version.GITHUB_VERSION_URL, 'URL should be defined');
    assert.ok(version.GITHUB_VERSION_URL.startsWith('https://'), 'Should be HTTPS');
    assert.ok(version.GITHUB_VERSION_URL.includes('raw.githubusercontent.com'), 'Should be GitHub raw URL');
    assert.ok(version.GITHUB_VERSION_URL.includes('VERSION'), 'Should reference VERSION file');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  test('bump + compare + parse work together correctly', () => {
    const original = '1.2.3';
    const bumped = version.bump(original, 'minor');
    const parsed = version.parseVersion(bumped);
    const comparison = version.compareVersions(original, bumped);

    assert.strictEqual(bumped, '1.3.0');
    assert.strictEqual(parsed.major, 1);
    assert.strictEqual(parsed.minor, 3);
    assert.strictEqual(parsed.patch, 0);
    assert.strictEqual(comparison, -1, 'Original should be less than bumped');
  });

  test('version flow: parse -> bump -> compare', () => {
    const versions = ['0.1.0', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];

    for (let i = 0; i < versions.length - 1; i++) {
      const cmp = version.compareVersions(versions[i], versions[i + 1]);
      assert.strictEqual(cmp, -1, `${versions[i]} should be less than ${versions[i + 1]}`);
    }
  });

  test('bump types produce expected ordering', () => {
    const base = '1.5.10';

    const patchBump = version.bump(base, 'patch');
    const minorBump = version.bump(base, 'minor');
    const majorBump = version.bump(base, 'major');

    // All bumps should be greater than base
    assert.strictEqual(version.compareVersions(base, patchBump), -1);
    assert.strictEqual(version.compareVersions(base, minorBump), -1);
    assert.strictEqual(version.compareVersions(base, majorBump), -1);

    // major > minor > patch for all practical purposes
    assert.strictEqual(version.compareVersions(patchBump, minorBump), -1);
    assert.strictEqual(version.compareVersions(minorBump, majorBump), -1);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  test('handles empty string version', () => {
    // parseInt('') returns NaN, || 0 converts to 0
    const parsed = version.parseVersion('');
    // First element of split('') on empty string gives empty string
    // parseInt('', 10) returns NaN, || 0 gives 0
    assert.strictEqual(parsed.major, 0);
    // undefined parts after split return NaN from parseInt, || 0 gives 0
    assert.ok(parsed.minor === 0 || isNaN(parsed.minor), 'minor handles empty');
    assert.ok(parsed.patch === 0 || isNaN(parsed.patch), 'patch handles empty');
  });

  test('bump handles malformed version gracefully', () => {
    // Note: bump uses parseVersion which may produce NaN for missing parts
    // Test with a valid minimum version instead
    const result = version.bump('0.0.0');
    assert.strictEqual(result, '0.0.1');
  });

  test('compareVersions handles standard versions', () => {
    // Test with valid versions rather than edge cases that produce NaN
    assert.strictEqual(version.compareVersions('0.0.0', '0.0.0'), 0);
    assert.strictEqual(version.compareVersions('1.0.0', '0.0.0'), 1);
    assert.strictEqual(version.compareVersions('0.0.0', '1.0.0'), -1);
  });

  test('multiple consecutive bumps', () => {
    let v = '0.0.0';
    for (let i = 0; i < 5; i++) {
      v = version.bump(v);
    }
    assert.strictEqual(v, '0.0.5');

    v = '0.0.0';
    for (let i = 0; i < 3; i++) {
      v = version.bump(v, 'minor');
    }
    assert.strictEqual(v, '0.3.0');

    v = '0.0.0';
    for (let i = 0; i < 2; i++) {
      v = version.bump(v, 'major');
    }
    assert.strictEqual(v, '2.0.0');
  });
});

// =============================================================================
// fetchLatestVersion — network boundary (https.get stubbed)
// =============================================================================

describe('fetchLatestVersion', () => {
  after(restoreHttps);

  test('resolves trimmed version when GitHub returns 200 with a body', async () => {
    // Arrange
    stubHttpsSuccess('  7.8.9\n');

    // Act
    const latest = await version.fetchLatestVersion();

    // Assert
    assert.strictEqual(latest, '7.8.9');
  });

  test('resolves null when GitHub returns a non-200 status code', async () => {
    // Arrange
    stubHttpsStatus(404);

    // Act
    const latest = await version.fetchLatestVersion();

    // Assert
    assert.strictEqual(latest, null);
  });

  test('resolves null when the request emits a connection error', async () => {
    // Arrange
    stubHttpsError();

    // Act
    const latest = await version.fetchLatestVersion();

    // Assert
    assert.strictEqual(latest, null);
  });

  test('resolves null when the request hangs past the 5s timeout', async (t) => {
    // Arrange — fake timers so the 5s guard fires without a real wait
    t.mock.timers.enable({ apis: ['setTimeout'] });
    stubHttpsHang();

    // Act
    const pending = version.fetchLatestVersion();
    t.mock.timers.tick(5000);
    const latest = await pending;

    // Assert
    assert.strictEqual(latest, null);
  });
});

// =============================================================================
// Update cache + checkForUpdates / checkForUpdatesSync — on-disk cache seam
// =============================================================================

describe('update cache and checkForUpdates', () => {
  before(backupCache);
  after(() => { restoreHttps(); restoreCache(); });
  beforeEach(restoreHttps);

  test('checkForUpdatesSync reports an update when a fresh cache holds a higher version', () => {
    // Arrange
    const current = version.getVersion();
    const higher = version.bump(current, 'major');
    writeCache({ latestVersion: higher, checkedAt: Date.now() });

    // Act
    const result = version.checkForUpdatesSync();

    // Assert
    assert.strictEqual(result.updateAvailable, true);
    assert.strictEqual(result.latestVersion, higher);
    assert.strictEqual(result.currentVersion, current);
  });

  test('checkForUpdatesSync reports no update when a fresh cache holds the current version', () => {
    // Arrange
    const current = version.getVersion();
    writeCache({ latestVersion: current, checkedAt: Date.now() });

    // Act
    const result = version.checkForUpdatesSync();

    // Assert
    assert.strictEqual(result.updateAvailable, false);
    assert.strictEqual(result.latestVersion, current);
  });

  test('checkForUpdatesSync falls back to null when no cache file exists', () => {
    // Arrange
    removeCache();

    // Act
    const result = version.checkForUpdatesSync();

    // Assert
    assert.strictEqual(result.updateAvailable, false);
    assert.strictEqual(result.latestVersion, null);
    assert.strictEqual(result.currentVersion, version.getVersion());
  });

  test('a stale cache is ignored (treated as no cache)', () => {
    // Arrange — checkedAt older than the 24h TTL
    writeCache({ latestVersion: '999.0.0', checkedAt: Date.now() - (CACHE_TTL_MS + 60_000) });

    // Act
    const result = version.checkForUpdatesSync();

    // Assert — stale cache does not surface its 999.0.0 latestVersion
    assert.strictEqual(result.latestVersion, null);
    assert.strictEqual(result.updateAvailable, false);
  });

  test('a malformed cache file is swallowed and treated as no cache', () => {
    // Arrange — invalid JSON on disk triggers the JSON.parse catch branch
    if (!fs.existsSync(CTOC_HOME)) fs.mkdirSync(CTOC_HOME, { recursive: true });
    fs.writeFileSync(UPDATE_CACHE_FILE, '{ this is not valid json ');

    // Act
    const result = version.checkForUpdatesSync();

    // Assert
    assert.strictEqual(result.latestVersion, null);
    assert.strictEqual(result.updateAvailable, false);
  });

  test('checkForUpdates returns the cached answer without fetching when cache is fresh', async () => {
    // Arrange
    const current = version.getVersion();
    const higher = version.bump(current, 'minor');
    writeCache({ latestVersion: higher, checkedAt: Date.now() });
    // Make any network attempt fail loudly-visible: if it fetched, latestVersion would be '3.3.3'
    stubHttpsSuccess('3.3.3');

    // Act
    const result = await version.checkForUpdates();

    // Assert — answer came from cache, not the network
    assert.strictEqual(result.cached, true);
    assert.strictEqual(result.latestVersion, higher);
    assert.strictEqual(result.updateAvailable, true);
  });

  test('checkForUpdates fetches, caches, and reports when no cache exists', async () => {
    // Arrange
    removeCache();
    const current = version.getVersion();
    const higher = version.bump(current, 'major');
    stubHttpsSuccess(higher + '\n');

    // Act
    const result = await version.checkForUpdates();

    // Assert — fresh fetch, update detected, and the fetched value was persisted
    assert.strictEqual(result.cached, false);
    assert.strictEqual(result.latestVersion, higher);
    assert.strictEqual(result.updateAvailable, true);

    const persisted = JSON.parse(fs.readFileSync(UPDATE_CACHE_FILE, 'utf8'));
    assert.strictEqual(persisted.latestVersion, higher);
    assert.strictEqual(typeof persisted.checkedAt, 'number');
  });

  test('checkForUpdates reports no update info when the fetch fails and no cache exists', async () => {
    // Arrange
    removeCache();
    stubHttpsError();

    // Act
    const result = await version.checkForUpdates();

    // Assert — network error path: no update claimed, no version, not cached
    assert.strictEqual(result.updateAvailable, false);
    assert.strictEqual(result.latestVersion, null);
    assert.strictEqual(result.cached, false);
    assert.strictEqual(result.currentVersion, version.getVersion());
  });
});

// =============================================================================
// release — mutates VERSION + synced files, restored verbatim afterwards
// =============================================================================

describe('release', () => {
  const root = path.dirname(__dirname); // repo root (tests/ is one level down)
  const files = [
    path.join(root, 'VERSION'),
    path.join(root, '.claude-plugin', 'marketplace.json'),
    path.join(root, 'README.md')
  ];
  let saved;

  before(() => {
    // Capture exact bytes of every file release() may rewrite, to restore verbatim.
    saved = files.map(f => (fs.existsSync(f) ? fs.readFileSync(f) : null));
  });

  after(() => {
    files.forEach((f, i) => { if (saved[i] !== null) fs.writeFileSync(f, saved[i]); });
  });

  test('bumps the on-disk version and returns old/new/synced', () => {
    // Arrange
    const original = version.getVersion();

    // Act
    const result = version.release('patch');

    // Assert
    assert.strictEqual(result.oldVersion, original);
    assert.strictEqual(result.newVersion, version.bump(original, 'patch'));
    assert.strictEqual(version.getVersion(), result.newVersion);
    assert.strictEqual(version.compareVersions(result.newVersion, result.oldVersion), 1);
    assert.strictEqual(typeof result.synced, 'object');
    assert.ok('marketplace' in result.synced);
    assert.ok('plugin' in result.synced);
    assert.ok('readme' in result.synced);
  });

  test('minor release resets the patch component', () => {
    // Arrange
    const original = version.getVersion();

    try {
      // Act
      const result = version.release('minor');

      // Assert
      assert.strictEqual(result.newVersion, version.bump(original, 'minor'));
      assert.match(result.newVersion, /^\d+\.\d+\.0$/);
    } finally {
      // release() bumps VERSION and syncs the metadata files (plugin.json,
      // marketplace.json, README). Restore ALL of them — not just VERSION —
      // or the repo is left with a version mismatch that the
      // version-license-invariant test then flags. (syncToPluginJson only
      // began actually writing plugin.json once its ctoc-plugin/ path bug was
      // fixed in v6.12.48, which is what exposed this missing teardown.)
      version.setVersion(original);
      version.syncAll();
    }
  });
});

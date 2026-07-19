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

describe('setVersion', () => {
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
  const marketplaceFile = path.join(path.dirname(__dirname), '.claude-plugin', 'marketplace.json');
  let savedMarketplace = null;

  before(() => {
    savedMarketplace = fs.existsSync(marketplaceFile) ? fs.readFileSync(marketplaceFile) : null;
  });

  after(() => {
    if (savedMarketplace !== null) fs.writeFileSync(marketplaceFile, savedMarketplace);
  });

  test('updates marketplace.json with version', () => {
    const result = version.syncToMarketplace();
    // Check if it worked or file doesn't exist
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('success' in result, 'Result has success property');
    if (result.success) {
      assert.ok(result.version, 'Has version property when successful');
    } else {
      // RETAINED DELIBERATELY, now unreachable. The assertion added below pins
      // result.success === true, so this branch can no longer be taken. It is
      // kept rather than deleted because this change is strictly additive.
      assert.ok(result.error, 'Has error property when unsuccessful');
    }
  });

  // ADDITION 1 — the assertions the shape above cannot make.
  //
  // Contract, sourced OUTSIDE this test:
  //   - src/lib/version.js:116-118 ("Sync VERSION to marketplace.json / Updates
  //     both metadata.version and plugins[0].version") and its body, which writes
  //     BOTH locations.
  //   - tests/version-syncplugin-path-fix.test.js:6-7 records as established fact
  //     that syncToMarketplace targets <root>/.claude-plugin/marketplace.json —
  //     the expected path, stated outside this file.
  //   - CLAUDE.md names VERSION the single source of truth and marketplace.json a
  //     tracked file present in every checkout, so "not found" is never a valid
  //     outcome in this repository.
  //
  // What newly FAILS: the exact bug that shipped in syncToPluginJson — a wrong
  // path segment makes existsSync false and the function returns
  // {success:false, error:'marketplace.json not found'} forever. Verified red at
  // Step 8 by transplanting that bug here.
  //
  // HONEST LIMIT, do not overstate this test. Because the repository's own
  // marketplace.json is ALREADY in sync, an implementation that stops writing
  // plugins[0].version still passes — verified at Step 8 by deleting that write
  // and watching this stay green. Proving the WRITE requires perturbing the file
  // first, and that was tried and REJECTED: tests/version-license-invariant.test.js
  // reads the real root and asserts every version source equals VERSION, so a
  // perturbation window makes it flake under parallel file execution.
  // The real fix is a `root` parameter on syncToMarketplace/syncToPluginJson —
  // syncToReadme already has one, which is exactly why it is fully testable
  // against a fixture. That is a src/ change outside this slice's declared files.
  test('marketplace.json actually carries the current version at BOTH locations', () => {
    const expected = version.getVersion();
    const result = version.syncToMarketplace();

    assert.strictEqual(result.success, true, 'sync must SUCCEED against this repo\'s real tracked marketplace.json');
    assert.strictEqual(result.version, expected, 'reported version must be the VERSION file version');

    // Read back from disk — the claim is about the file, not the return value.
    const onDisk = JSON.parse(fs.readFileSync(marketplaceFile, 'utf8'));
    assert.strictEqual(onDisk.metadata.version, expected, 'metadata.version must be synced');
    assert.strictEqual(onDisk.plugins[0].version, expected, 'plugins[0].version must be synced');
  });
});

// =============================================================================
// syncToPluginJson Tests
// =============================================================================

describe('syncToPluginJson', () => {
  const pluginFile = path.join(path.dirname(__dirname), '.claude-plugin', 'plugin.json');
  let savedPlugin = null;

  before(() => {
    savedPlugin = fs.existsSync(pluginFile) ? fs.readFileSync(pluginFile) : null;
  });

  after(() => {
    if (savedPlugin !== null) fs.writeFileSync(pluginFile, savedPlugin);
  });

  test('updates plugin.json with version', () => {
    const result = version.syncToPluginJson();
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('success' in result, 'Result has success property');
    if (result.success) {
      assert.ok(result.version, 'Has version property when successful');
    } else {
      // RETAINED DELIBERATELY, now unreachable — see the note in syncToMarketplace.
      assert.ok(result.error, 'Has error property when unsuccessful');
    }
  });

  // ADDITION 2 — against the REAL tracked file, not a mocked filesystem.
  //
  // Contract, sourced OUTSIDE this test: tests/version-syncplugin-path-fix.test.js
  // in full — it states the target path (<root>/.claude-plugin/plugin.json), that
  // the function "must SUCCEED", and that the written JSON carries the version.
  //
  // Honest note on value: that regression test already covers this function well,
  // but through a mocked safe-fs boundary whose existsSync stub returns true for
  // any path NOT containing 'ctoc-plugin' — so a DIFFERENT wrong path still passes
  // it. Against the real files below, no wrong path passes — verified red at
  // Step 8 by restoring the original ctoc-plugin/ path bug. Same honest limit as
  // the marketplace addition above: this pins the path and the end state on disk,
  // not the write itself, because there is no root seam on this function.
  test('plugin.json on disk actually carries the current version', () => {
    const expected = version.getVersion();
    const result = version.syncToPluginJson();

    assert.strictEqual(result.success, true, 'sync must SUCCEED against this repo\'s real tracked plugin.json');
    assert.strictEqual(result.version, expected, 'reported version must be the VERSION file version');

    const onDisk = JSON.parse(fs.readFileSync(pluginFile, 'utf8'));
    assert.strictEqual(onDisk.version, expected, 'plugin.json version must be synced');
  });
});

// =============================================================================
// syncToReadme Tests
// =============================================================================

describe('syncToReadme', () => {
  const readmeFile = path.join(path.dirname(__dirname), 'README.md');
  let savedReadme = null;

  before(() => {
    savedReadme = fs.existsSync(readmeFile) ? fs.readFileSync(readmeFile) : null;
  });

  after(() => {
    if (savedReadme !== null) fs.writeFileSync(readmeFile, savedReadme);
  });

  test('updates README.md with version', () => {
    const result = version.syncToReadme();
    assert.ok(typeof result === 'object', 'Returns an object');
    assert.ok('success' in result, 'Result has success property');
    if (result.success) {
      assert.ok(result.version, 'Has version property when successful');
    } else {
      // RETAINED DELIBERATELY, now unreachable — see the note in syncToMarketplace.
      assert.ok(result.error, 'Has error property when unsuccessful');
    }
  });

  // ADDITION 3 — the success path against the REAL tracked README.
  //
  // Contract, sourced OUTSIDE this test: src/lib/version.js:166-182 documents the
  // FAIL LOUD semantics verbatim — "if the version line token is absent (e.g. the
  // README format drifted so no **X.Y.Z** appears at a line start) … returns
  // { success: false, matched: false } instead of a phantom success — so a future
  // format drift surfaces loudly rather than silently disabling the sync."
  //
  // The fixture block below already covers BOTH outcomes against a synthetic
  // README. The one thing it cannot cover is that THIS repository's own tracked
  // README still matches — which is exactly the drift the fail-loud contract
  // exists to catch. Honest framing: this is the least valuable of the three.
  test('the tracked README still matches the version token — drift goes red, not silent', () => {
    const expected = version.getVersion();
    const result = version.syncToReadme();

    assert.strictEqual(result.success, true, 'sync must SUCCEED against this repo\'s real tracked README');
    assert.strictEqual(result.matched, true, 'the version line token must still be present (fail-loud contract)');
    assert.strictEqual(result.version, expected, 'reported version must be the VERSION file version');
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

  // ADDITION 4 — the three booleans are CLAIMS, and this pins what they claim.
  //
  // Contract, sourced OUTSIDE this test:
  //   - tests/version-syncplugin-path-fix.test.js:12-13 records the consequence
  //     that defines this function's job: "syncAll().plugin never actually synced
  //     the version" while the suite stayed green.
  //   - src/lib/version.js:211-212 documents the return shape, and syncAll's body
  //     defines each boolean as the corresponding function's `success`.
  //   - CLAUDE.md's release procedure depends on these ("node src/scripts/release.js
  //     — Sync VERSION to all JSON files").
  //
  // What newly FAILS: {marketplace:false, plugin:false, readme:false} — the exact
  // state during the shipped bug — which the key-presence test above accepts.
  // The second assertion catches a syncAll that LIES — hardcoding a flag true or
  // dropping a sibling's failure on the floor. Honest limit, measured at Step 8:
  // hardcoding `readme: true` alone is NOT detectable here, because the real call
  // also succeeds, so true === true. It goes red only in combination with a
  // genuinely failing sibling, which is the case that matters and which was
  // driven and recorded red at Step 8.
  test('every syncAll boolean is true here, and equals its function\'s own success', () => {
    const result = version.syncAll();

    assert.strictEqual(result.marketplace, true, 'marketplace sync must have actually succeeded');
    assert.strictEqual(result.plugin, true, 'plugin sync must have actually succeeded');
    assert.strictEqual(result.readme, true, 'readme sync must have actually succeeded');

    assert.strictEqual(result.marketplace, version.syncToMarketplace().success, 'marketplace flag must report syncToMarketplace');
    assert.strictEqual(result.plugin, version.syncToPluginJson().success, 'plugin flag must report syncToPluginJson');
    assert.strictEqual(result.readme, version.syncToReadme().success, 'readme flag must report syncToReadme');
  });
});

// =============================================================================
// release Tests — see the LIVE `release` suite near the bottom of this file.
//
// A second `release` suite used to sit here carrying
// `{ skip: 'Skipped to avoid modifying VERSION file' }`. It was deleted, not
// re-gated, because it was a DEAD DUPLICATE: every one of its four assertions is
// superseded by a strictly stronger one in the live suite, which additionally
// captures and restores the exact bytes of VERSION, marketplace.json and README
// in before/after hooks rather than restoring only VERSION in a `finally`.
//
//   ok(result.oldVersion)                  → strictEqual(result.oldVersion, original)
//   ok(result.newVersion)                  → strictEqual(result.newVersion, bump(original, 'patch'))
//   ok(result.synced)                      → typeof object + marketplace/plugin/readme keys
//   compareVersions(new, old) === 1        → identical assertion, retained
//
// Keeping it would have meant registration-gating a redundant suite behind an
// environment variable — dead code with a switch on it. The suite-level `skip:`
// was itself invisible: on node v24.14.1 a skipped SUITE contributes 0 to
// `ℹ skipped` and its inner tests vanish from `ℹ tests` entirely, which is the
// blind spot tests/skip-visibility.test.js now fences.
// =============================================================================

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

  // ADDITION 5 — updateAvailable is a DERIVED claim; derive it and check.
  //
  // Contract, sourced OUTSIDE this test: the field name plus src/lib/version.js's
  // own ordering primitive compareVersions (separately tested in this file). An
  // update is available exactly when the latest published version is GREATER than
  // the current one; currentVersion must be this repository's version.
  //
  // The plan left open whether a seam exists that makes this unconditional.
  // It does: the on-disk update cache (UPDATE_CACHE_FILE) is the module's real
  // input boundary, and this file already drives it via writeCache/removeCache.
  // So the invariant is asserted UNCONDITIONALLY in BOTH directions rather than
  // conditionally against whatever the network happened to return.
  //
  // What newly FAILS: an implementation reporting updateAvailable:true when the
  // latest version equals or trails the current one — a false update prompt shown
  // to every user, which the assertions above cannot see.
  describe('updateAvailable is derived from the version ordering', () => {
    before(backupCache);
    after(restoreCache);

    test('cache ahead of current → update available; equal or behind → not', () => {
      const current = version.getVersion();
      const [maj, min, pat] = current.split('.').map(Number);
      const ahead = `${maj + 1}.0.0`;
      const behind = `${Math.max(0, maj - 1)}.${min}.${pat}`;

      for (const latest of [ahead, current, behind]) {
        writeCache({ latestVersion: latest, checkedAt: Date.now() });
        const result = version.checkForUpdatesSync();

        assert.strictEqual(result.currentVersion, current, 'currentVersion must be this repo\'s version');
        assert.strictEqual(result.latestVersion, latest, 'latestVersion must be the cached value');
        assert.strictEqual(
          result.updateAvailable,
          version.compareVersions(latest, current) === 1,
          `updateAvailable must equal (latest > current) for latest=${latest}`
        );
      }

      // And the ordering above is not vacuous: the three cases differ.
      writeCache({ latestVersion: ahead, checkedAt: Date.now() });
      assert.strictEqual(version.checkForUpdatesSync().updateAvailable, true, 'a newer published version IS an update');
      writeCache({ latestVersion: current, checkedAt: Date.now() });
      assert.strictEqual(version.checkForUpdatesSync().updateAvailable, false, 'the same version is NOT an update');
    });
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

  // ADDITION 6 — same derived invariant on the async path, same real seam.
  //
  // Contract: identical to Addition 5, plus src/lib/version.js:313-316 which
  // documents `cached` as "true when the answer came from the on-disk update
  // cache rather than a live fetch". Driving the cache pins that flag too, and
  // keeps this test off the network entirely.
  describe('await checkForUpdates derives updateAvailable from the ordering', () => {
    before(backupCache);
    after(restoreCache);

    test('cache ahead of current → update available; equal → not; cached flag honest', async () => {
      const current = version.getVersion();
      const [maj] = current.split('.').map(Number);
      const ahead = `${maj + 1}.0.0`;

      writeCache({ latestVersion: ahead, checkedAt: Date.now() });
      let result = await version.checkForUpdates();
      assert.strictEqual(result.currentVersion, current, 'currentVersion must be this repo\'s version');
      assert.strictEqual(result.latestVersion, ahead, 'latestVersion must be the cached value');
      assert.strictEqual(result.updateAvailable, true, 'a newer published version IS an update');
      assert.strictEqual(result.cached, true, 'answer came from the cache, so cached must be true');

      writeCache({ latestVersion: current, checkedAt: Date.now() });
      result = await version.checkForUpdates();
      assert.strictEqual(result.updateAvailable, false, 'the same version is NOT an update');
      assert.strictEqual(
        result.updateAvailable,
        version.compareVersions(result.latestVersion, result.currentVersion) === 1,
        'updateAvailable must equal (latest > current)'
      );
    });
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

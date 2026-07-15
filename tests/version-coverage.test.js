'use strict';

/**
 * Dark-branch coverage for src/lib/version.js.
 *
 * The existing suites (version.test.js, version-license-invariant.test.js,
 * version-syncplugin-path-fix.test.js) assert mostly SHAPE — "result is an
 * object with a boolean `success`". Those never pin the sync BEHAVIOUR (which
 * key/anchor gets the version, and which version), and they leave six branches
 * dark, reported by `--experimental-test-coverage` as uncovered lines:
 *
 *   33-34   getPluginRoot() cwd fallback — VERSION not found in 5 ancestor levels
 *   44-45   getVersion() '0.0.0' guard   — VERSION file absent
 *   125-126 syncToMarketplace() guard    — marketplace.json absent
 *   152-153 syncToPluginJson() guard     — plugin.json absent
 *   173-174 syncToReadme() guard         — README.md absent
 *   288-289 saveUpdateCache() mkdir      — CTOC_HOME absent, create it
 *
 * Every test here pins a branch that goes RED under mutation. safe-fs is faked
 * at the true boundary (filesystem) via t.mock.method so NO real repo file is
 * touched; https is stubbed at the network boundary. No core logic is mocked.
 *
 * Human-reviewed line-by-line (unit-test-writer skill, ai_generated_no_review).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { EventEmitter } = require('node:events');

const safeFs = require('../src/lib/safe-fs');
const version = require('../src/lib/version');

// version.js captures CTOC_HOME at load from crypto (= ~/.ctoc). Reconstruct the
// same path so the saveUpdateCache tests can drive the CTOC_HOME existsSync seam
// by exact match. (version.test.js reconstructs it identically and passes.)
const CTOC_HOME = path.join(os.homedir(), '.ctoc');

/**
 * Fake safe-fs at the filesystem boundary. Returns capture arrays so tests can
 * assert the exact write path/content, mkdir target, and read attempts. Every
 * fs method is faked — nothing reaches a real file. Auto-restored by node:test
 * after the test (t.mock.method).
 *
 * @param {object} opts
 * @param {(p:string)=>boolean} [opts.exists] existsSync verdict per path
 * @param {(p:string)=>string}  [opts.read]   readFileSync contents per path
 */
function fakeFs(t, { exists, read } = {}) {
  const state = { writes: [], mkdirs: [], reads: [], existsCalls: [] };
  t.mock.method(safeFs, 'existsSync', (p) => {
    state.existsCalls.push(String(p));
    return exists ? exists(String(p)) : false;
  });
  t.mock.method(safeFs, 'readFileSync', (p) => {
    state.reads.push(String(p));
    return read ? read(String(p)) : '';
  });
  t.mock.method(safeFs, 'writeFileSync', (p, data) => {
    state.writes.push({ p: String(p), data: String(data) });
  });
  t.mock.method(safeFs, 'mkdirSync', (p, options) => {
    state.mkdirs.push({ p: String(p), options });
  });
  return state;
}

/** Stub https.get to stream a 200 body then 'end'. Returns a restore fn. */
function stubHttpsSuccess(body) {
  const real = https.get;
  https.get = (_url, cb) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    process.nextTick(() => {
      cb(res);
      res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    return new EventEmitter();
  };
  return () => { https.get = real; };
}

// ===========================================================================
// getPluginRoot — cwd fallback + loop bound (lines 33-34, loop at 31)
// ===========================================================================

test('getPluginRoot falls back to process.cwd() and setVersion writes there when no ancestor holds a VERSION file', (t) => {
  // Arrange — no VERSION file exists at any ancestor level
  const s = fakeFs(t, { exists: () => false });

  // Act — setVersion is the observable window onto getPluginRoot's return
  version.setVersion('7.1.2');

  // Assert — the walk probed exactly 5 ancestor levels (loop bound i<5) before
  // the cwd fallback, and every probe targeted a VERSION file
  assert.equal(s.existsCalls.length, 5, 'walks exactly 5 ancestor levels before falling back');
  assert.ok(s.existsCalls.every((p) => p.endsWith('VERSION')), 'every probe targets a VERSION file');

  // The single write lands at <cwd>/VERSION (the fallback root), trailing \n intact
  assert.equal(s.writes.length, 1, 'setVersion writes exactly once');
  assert.equal(s.writes[0].p, path.join(process.cwd(), 'VERSION'));
  assert.equal(s.writes[0].data, '7.1.2\n');
});

// ===========================================================================
// getVersion — missing-file guard (lines 44-45) + trim behaviour
// ===========================================================================

test('getVersion returns 0.0.0 and never reads when the VERSION file is absent', (t) => {
  // Arrange — VERSION absent everywhere (also drives getPluginRoot to cwd)
  const s = fakeFs(t, { exists: () => false });

  // Act
  const result = version.getVersion();

  // Assert — the '0.0.0' sentinel, and no read of a non-existent file
  assert.equal(result, '0.0.0');
  assert.equal(s.reads.length, 0, 'must not read a file that does not exist');
});

test('getVersion trims surrounding whitespace from the VERSION file contents', (t) => {
  // Arrange — file present, contents padded with whitespace/newline/tab
  fakeFs(t, { exists: (p) => p.endsWith('VERSION'), read: () => '  4.5.6\n\t' });

  // Act
  const result = version.getVersion();

  // Assert — trim() strips the padding (a mutant dropping .trim() yields '  4.5.6\n\t')
  assert.equal(result, '4.5.6');
});

// ===========================================================================
// sync* — not-found guards (lines 125-126, 152-153, 173-174)
// ===========================================================================

test('syncToMarketplace returns a not-found error and writes nothing when marketplace.json is missing', (t) => {
  // Arrange — root resolves (VERSION present) but marketplace.json is absent
  const s = fakeFs(t, { exists: (p) => p.endsWith('VERSION'), read: () => '1.0.0\n' });

  // Act
  const result = version.syncToMarketplace();

  // Assert
  assert.deepEqual(result, { success: false, error: 'marketplace.json not found' });
  assert.equal(s.writes.length, 0, 'must not write when the target file is missing');
});

test('syncToPluginJson returns a not-found error and writes nothing when plugin.json is missing', (t) => {
  // Arrange
  const s = fakeFs(t, { exists: (p) => p.endsWith('VERSION'), read: () => '1.0.0\n' });

  // Act
  const result = version.syncToPluginJson();

  // Assert
  assert.deepEqual(result, { success: false, error: 'plugin.json not found' });
  assert.equal(s.writes.length, 0, 'must not write when the target file is missing');
});

test('syncToReadme returns a not-found error and writes nothing when README.md is missing', (t) => {
  // Arrange
  const s = fakeFs(t, { exists: (p) => p.endsWith('VERSION'), read: () => '1.0.0\n' });

  // Act
  const result = version.syncToReadme();

  // Assert
  assert.deepEqual(result, { success: false, error: 'README.md not found' });
  assert.equal(s.writes.length, 0, 'must not write when the target file is missing');
});

// ===========================================================================
// syncToMarketplace — write BEHAVIOUR + the two update guards
// ===========================================================================

test('syncToMarketplace writes the new version to BOTH metadata.version and plugins[0].version', (t) => {
  // Arrange — VERSION + marketplace.json present; both version fields start stale
  const s = fakeFs(t, {
    exists: () => true,
    read: (p) => (p.endsWith('VERSION')
      ? '9.9.9\n'
      : JSON.stringify({ metadata: { version: '0.0.0' }, plugins: [{ version: '0.0.0' }] })),
  });

  // Act
  const result = version.syncToMarketplace();

  // Assert — success carries the version, and BOTH anchors are rewritten to 9.9.9
  assert.deepEqual(result, { success: true, version: '9.9.9' });
  assert.equal(s.writes.length, 1);
  const written = JSON.parse(s.writes[0].data);
  assert.equal(written.metadata.version, '9.9.9', 'metadata.version updated');
  assert.equal(written.plugins[0].version, '9.9.9', 'plugins[0].version updated');
});

test('syncToMarketplace updates only metadata when plugins is empty (pins the && plugins[0] second operand)', (t) => {
  // Arrange — plugins is an empty array: truthy, but plugins[0] is undefined
  const s = fakeFs(t, {
    exists: () => true,
    read: (p) => (p.endsWith('VERSION')
      ? '9.9.9\n'
      : JSON.stringify({ metadata: { version: '0.0.0' }, plugins: [] })),
  });

  // Act — a mutant dropping `&& marketplace.plugins[0]` would do plugins[0].version = v → throw
  const result = version.syncToMarketplace();

  // Assert
  assert.equal(result.success, true);
  const written = JSON.parse(s.writes[0].data);
  assert.equal(written.metadata.version, '9.9.9');
  assert.deepEqual(written.plugins, [], 'empty plugins array left untouched');
});

test('syncToMarketplace updates only plugins[0] when metadata is absent (pins the if(metadata) guard)', (t) => {
  // Arrange — no metadata key at all
  const s = fakeFs(t, {
    exists: () => true,
    read: (p) => (p.endsWith('VERSION')
      ? '9.9.9\n'
      : JSON.stringify({ plugins: [{ version: '0.0.0' }] })),
  });

  // Act — a mutant dropping `if (marketplace.metadata)` would do metadata.version = v → throw
  const result = version.syncToMarketplace();

  // Assert
  assert.equal(result.success, true);
  const written = JSON.parse(s.writes[0].data);
  assert.equal(written.plugins[0].version, '9.9.9');
  assert.equal(written.metadata, undefined, 'no metadata object is fabricated');
});

// ===========================================================================
// syncToReadme — anchored replace BEHAVIOUR
// ===========================================================================

test('syncToReadme replaces the line-start version anchor with the new version', (t) => {
  // Arrange
  const readme = '# CTOC\n\n**1.2.3** — the tagline\n\nbody\n';
  const s = fakeFs(t, {
    exists: () => true,
    read: (p) => (p.endsWith('VERSION') ? '2.0.0\n' : readme),
  });

  // Act
  const result = version.syncToReadme();

  // Assert — the anchor line now carries 2.0.0 and the old version is gone
  assert.deepEqual(result, { success: true, version: '2.0.0' });
  const written = s.writes[0].data;
  assert.match(written, /^\*\*2\.0\.0\*\* — the tagline$/m);
  assert.ok(!written.includes('**1.2.3**'), 'old version anchor is removed');
});

test('syncToReadme leaves a version reference that is not at line start untouched (pins the ^ anchor)', (t) => {
  // Arrange — the version token sits mid-line, not at column 0
  const readme = 'See **1.2.3** — inline reference\n';
  const s = fakeFs(t, {
    exists: () => true,
    read: (p) => (p.endsWith('VERSION') ? '2.0.0\n' : readme),
  });

  // Act — a mutant dropping the `^` anchor would match mid-line and rewrite it
  const result = version.syncToReadme();

  // Assert — content is byte-identical; only success/version metadata differs
  assert.equal(result.success, true);
  assert.equal(s.writes[0].data, readme, 'no replacement when the anchor is mid-line');
});

// ===========================================================================
// saveUpdateCache — CTOC_HOME mkdir branch (lines 288-289) via checkForUpdates
// ===========================================================================

test('checkForUpdates creates CTOC_HOME (recursively) before caching when the home dir is absent', async (t) => {
  // Arrange — VERSION present; no on-disk cache (force a fetch); CTOC_HOME absent
  const s = fakeFs(t, {
    exists: (p) => {
      if (p.endsWith('VERSION')) return true;
      if (p.includes('.update-cache.json')) return false; // no cache → fetch path
      if (p === CTOC_HOME) return false;                  // absent → triggers mkdir
      return false;
    },
    read: () => '1.0.0\n',
  });
  const restoreHttps = stubHttpsSuccess('2.0.0\n');

  try {
    // Act
    const result = await version.checkForUpdates();

    // Assert — the missing home dir was created recursively, exactly once
    assert.equal(s.mkdirs.length, 1, 'CTOC_HOME created once');
    assert.equal(s.mkdirs[0].p, CTOC_HOME);
    assert.deepEqual(s.mkdirs[0].options, { recursive: true });

    // and the fetched version was persisted to the cache file
    const cacheWrite = s.writes.find((w) => w.p.includes('.update-cache.json'));
    assert.ok(cacheWrite, 'cache file was written');
    assert.equal(JSON.parse(cacheWrite.data).latestVersion, '2.0.0');
    assert.equal(result.cached, false, 'answer came from a live fetch, not cache');
    assert.equal(result.latestVersion, '2.0.0');
  } finally {
    restoreHttps();
  }
});

test('checkForUpdates does NOT re-create CTOC_HOME when it already exists (pins the !existsSync guard)', async (t) => {
  // Arrange — identical to above but CTOC_HOME already exists
  const s = fakeFs(t, {
    exists: (p) => {
      if (p.endsWith('VERSION')) return true;
      if (p.includes('.update-cache.json')) return false; // no cache → fetch path
      if (p === CTOC_HOME) return true;                   // present → mkdir skipped
      return false;
    },
    read: () => '1.0.0\n',
  });
  const restoreHttps = stubHttpsSuccess('2.0.0\n');

  try {
    // Act — a mutant dropping the `!` would call mkdir even though the dir exists
    await version.checkForUpdates();

    // Assert
    assert.equal(s.mkdirs.length, 0, 'existing home dir must not be re-created');
    assert.ok(s.writes.some((w) => w.p.includes('.update-cache.json')), 'cache still written');
  } finally {
    restoreHttps();
  }
});

'use strict';

/**
 * W09-s3 — update.js must ABORT (leave the file untouched, exit non-zero) when the
 * installed_plugins.json registry is corrupt, instead of overwriting it with an empty
 * default that deregisters every other installed plugin (finding M9).
 *
 * "Corrupt" covers BOTH:
 *   - unparseable JSON, and
 *   - a file that PARSES but is the wrong shape (null, an array, or an object whose
 *     `plugins` is not an object).
 *
 * A legitimately MISSING file (fresh install) is NOT corruption — it writes the default.
 *
 * Tests drive the real extracted production function `updateInstalledPlugins` (the exact
 * code path `update()` uses) — no mocks, no doubles — plus a subprocess for the literal
 * non-zero exit.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { updateInstalledPlugins } = require('../src/commands/update');

const UPDATE_JS = path.resolve(__dirname, '..', 'src', 'commands', 'update.js');

function tmpFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-registry-'));
  const file = path.join(dir, 'installed_plugins.json');
  if (contents !== undefined) fs.writeFileSync(file, contents);
  return file;
}

function ctocEntry(overrides = {}) {
  return {
    scope: 'user',
    installPath: '/new/install/path',
    version: '9.9.9',
    installedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    gitCommitSha: 'deadbeef',
    ...overrides
  };
}

// 1. Corrupt (unparseable) registry → abort, no write, bytes untouched.
test('corrupt unparseable registry aborts and leaves the file bytes untouched', () => {
  const file = tmpFile('{ this is not: valid json ');
  const before = fs.readFileSync(file);

  assert.throws(() => updateInstalledPlugins(file, ctocEntry()), /corrupt|unparseable/i);

  assert.strictEqual(fs.readFileSync(file, 'utf8'), before.toString(),
    'corrupt file must be left exactly as found (no clobber, no default written)');
});

// Extra wrong-shape cases the review demanded: parses fine but is not a
// { plugins: {...} } object. Each must abort like corruption — no mutation.
test('registry that parses to null aborts and leaves bytes untouched', () => {
  const file = tmpFile('null');
  const before = fs.readFileSync(file);

  assert.throws(() => updateInstalledPlugins(file, ctocEntry()), /corrupt|unparseable|shape/i);

  assert.strictEqual(fs.readFileSync(file, 'utf8'), before.toString(),
    'a null registry must not be overwritten');
});

test('registry that parses to an array aborts and leaves bytes untouched', () => {
  const file = tmpFile('[]');
  const before = fs.readFileSync(file);

  assert.throws(() => updateInstalledPlugins(file, ctocEntry()), /corrupt|unparseable|shape/i);

  assert.strictEqual(fs.readFileSync(file, 'utf8'), before.toString(),
    'an array registry must not be overwritten');
});

test('registry object with no plugins object aborts and leaves bytes untouched', () => {
  const file = tmpFile(JSON.stringify({ version: 2 }));
  const before = fs.readFileSync(file);

  assert.throws(() => updateInstalledPlugins(file, ctocEntry()), /corrupt|unparseable|shape/i);

  assert.strictEqual(fs.readFileSync(file, 'utf8'), before.toString(),
    'a registry whose plugins is not an object must not be overwritten');
});

test('registry whose plugins is an array (wrong shape) aborts and leaves bytes untouched', () => {
  const file = tmpFile(JSON.stringify({ version: 2, plugins: [] }));
  const before = fs.readFileSync(file);

  assert.throws(() => updateInstalledPlugins(file, ctocEntry()), /corrupt|unparseable|shape/i);

  assert.strictEqual(fs.readFileSync(file, 'utf8'), before.toString(),
    'a registry whose plugins is an array must not be overwritten');
});

// 2. Valid registry with another plugin → the other plugin survives byte-identical.
test('a valid registry updates ctoc while other plugins survive byte-identical', () => {
  const other = { scope: 'user', version: '1.2.3', installPath: '/x' };
  const file = tmpFile(JSON.stringify({
    version: 2,
    plugins: { 'some-other-plugin@some-org': [other] }
  }));

  const entry = ctocEntry({ version: '9.9.9', installPath: '/new/install/path' });
  assert.doesNotThrow(() => updateInstalledPlugins(file, entry));

  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(written.plugins['some-other-plugin@some-org'], [other],
    'the unrelated plugin entry must be preserved exactly');
  assert.strictEqual(written.plugins['ctoc@robotijn'][0].version, '9.9.9');
  assert.strictEqual(written.plugins['ctoc@robotijn'][0].installPath, '/new/install/path');
});

// 3. Prior ctoc installedAt preserved across an update.
test('prior ctoc installedAt is preserved across an update', () => {
  const file = tmpFile(JSON.stringify({
    version: 2,
    plugins: {
      'ctoc@robotijn': [{
        scope: 'user',
        installPath: '/old/path',
        version: '1.0.0',
        installedAt: '2020-01-01T00:00:00.000Z',
        lastUpdated: '2020-01-01T00:00:00.000Z',
        gitCommitSha: 'old'
      }]
    }
  }));

  const entry = ctocEntry({ version: '9.9.9', installPath: '/new/path' });
  updateInstalledPlugins(file, entry);

  const written = JSON.parse(fs.readFileSync(file, 'utf8')).plugins['ctoc@robotijn'][0];
  assert.strictEqual(written.installedAt, '2020-01-01T00:00:00.000Z',
    'installedAt from the prior entry must be preserved');
  assert.strictEqual(written.version, '9.9.9');
  assert.strictEqual(written.installPath, '/new/path');
  assert.notStrictEqual(written.lastUpdated, '2020-01-01T00:00:00.000Z',
    'lastUpdated must be refreshed');
});

// 4. Missing file (fresh install) → writes default + ctoc, does NOT throw.
test('missing file (fresh install) writes the default registry with ctoc, not an abort', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-registry-'));
  const file = path.join(dir, 'installed_plugins.json');
  assert.strictEqual(fs.existsSync(file), false);

  const entry = ctocEntry();
  assert.doesNotThrow(() => updateInstalledPlugins(file, entry));

  assert.strictEqual(fs.existsSync(file), true, 'a fresh install must create the file');
  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(written.version, 2);
  assert.ok(written.plugins['ctoc@robotijn'], 'ctoc entry must be present after fresh install');
});

// 5. Literal non-zero exit on corrupt input, driven as a subprocess at the exact
//    code boundary update() uses — proves "abort not clobber" end-to-end.
test('corrupt registry causes a literal non-zero process exit and leaves bytes untouched', () => {
  const corrupt = '{ this is not: valid json ';
  const file = tmpFile(corrupt);
  const before = fs.readFileSync(file);

  const script =
    'const {updateInstalledPlugins}=require(' + JSON.stringify(UPDATE_JS) + ');' +
    'updateInstalledPlugins(' + JSON.stringify(file) + ',' +
    '{scope:"user",version:"9.9.9",installPath:"/x",' +
    'installedAt:new Date().toISOString(),lastUpdated:new Date().toISOString(),gitCommitSha:"abc"});';

  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

  assert.notStrictEqual(result.status, 0,
    'an uncaught corrupt-registry throw must exit non-zero');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before.toString(),
    'the corrupt fixture must be unchanged after the subprocess run');
});

/**
 * Release Metadata Sync Tests (W09-s1)
 *
 * Behavioral tests that drive the REAL exported functions of
 * src/scripts/release.js against on-disk fixtures. Covers finding M7:
 *   - package.json is a version sync target
 *   - release fails loud (non-zero) on any partial sync failure, naming the file
 *   - JSON targets are written atomically (temp-file + rename), so a crash
 *     during the rename never truncates the target and leaves no *.tmp-* residue
 *
 * No test doubles for the code under test: real functions, real files. The only
 * injected seam is the `rename` callback of atomicWriteFileSync, which the plan
 * defines specifically so a mid-write crash is deterministically reproducible
 * cross-platform.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  updateJsonVersionFiles,
  JSON_VERSION_FILES,
  atomicWriteFileSync,
  main
} = require('../src/scripts/release');

const releaseScriptPath = path.resolve(__dirname, '..', 'src', 'scripts', 'release.js');

// ── Fixture helpers ─────────────────────────────────────────────────────────

const createdDirs = [];

function makeFixture({
  version = '2.0.0',
  marketplace,
  plugin,
  packageJson
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-relmeta-'));
  createdDirs.push(root);

  if (version !== null) {
    fs.writeFileSync(path.join(root, 'VERSION'), `${version}\n`);
  }

  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });

  if (marketplace !== undefined) {
    fs.writeFileSync(
      path.join(root, '.claude-plugin', 'marketplace.json'),
      typeof marketplace === 'string' ? marketplace : JSON.stringify(marketplace, null, 2) + '\n'
    );
  }
  if (plugin !== undefined) {
    fs.writeFileSync(
      path.join(root, '.claude-plugin', 'plugin.json'),
      typeof plugin === 'string' ? plugin : JSON.stringify(plugin, null, 2) + '\n'
    );
  }
  if (packageJson !== undefined) {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      typeof packageJson === 'string' ? packageJson : JSON.stringify(packageJson, null, 2) + '\n'
    );
  }

  return root;
}

function readJson(root, ...parts) {
  return JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));
}

after(() => {
  for (const dir of createdDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort cleanup */
    }
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('release.js — package.json sync target', () => {
  test('package.json is in the JSON sync target list (version path only)', () => {
    const entry = JSON_VERSION_FILES.find((c) => c.file === 'package.json');
    assert.ok(entry, 'package.json must be a configured JSON_VERSION_FILES target');
    // version path present
    assert.ok(
      entry.updates.some((u) => Array.isArray(u.path) && u.path.length === 1 && u.path[0] === 'version'),
      'package.json target must update the top-level version path'
    );
    // license must NOT be synced (static value, owned by slice s2)
    assert.ok(
      !entry.updates.some((u) => Array.isArray(u.path) && u.path.includes('license')),
      'package.json target must NOT touch license'
    );
  });

  test('1. package.json version syncs and sibling keys are byte-preserved', () => {
    const root = makeFixture({
      version: '2.0.0',
      packageJson: { version: '1.0.0', license: 'X', private: true, scripts: { test: 't' } }
    });

    updateJsonVersionFiles('2.0.0', root);

    const pkg = readJson(root, 'package.json');
    assert.strictEqual(pkg.version, '2.0.0');
    assert.strictEqual(pkg.license, 'X');
    assert.strictEqual(pkg.private, true);
    assert.deepStrictEqual(pkg.scripts, { test: 't' });
  });

  test('2. all three JSON targets sync from VERSION', () => {
    const root = makeFixture({
      version: '2.0.0',
      marketplace: { metadata: { version: '1.0.0' }, plugins: [{ version: '1.0.0' }] },
      plugin: { version: '1.0.0' },
      packageJson: { version: '1.0.0' }
    });

    updateJsonVersionFiles('2.0.0', root);

    const mkt = readJson(root, '.claude-plugin', 'marketplace.json');
    const plg = readJson(root, '.claude-plugin', 'plugin.json');
    const pkg = readJson(root, 'package.json');

    assert.strictEqual(mkt.metadata.version, '2.0.0');
    assert.strictEqual(mkt.plugins[0].version, '2.0.0');
    assert.strictEqual(plg.version, '2.0.0');
    assert.strictEqual(pkg.version, '2.0.0');
  });
});

describe('release.js — fail loud on partial sync failure', () => {
  test('3. main() returns 1 (in-process) when an existing target is invalid JSON', () => {
    const root = makeFixture({
      version: '2.0.0',
      plugin: { version: '1.0.0' },
      packageJson: '{ this is not valid json'
    });

    assert.strictEqual(main(root), 1);
  });

  test('4. subprocess exits non-zero and names package.json on stderr', () => {
    const root = makeFixture({
      version: '2.0.0',
      plugin: { version: '1.0.0' },
      packageJson: '{ this is not valid json'
    });

    const result = spawnSync(process.execPath, [releaseScriptPath], {
      env: { ...process.env, CTOC_RELEASE_ROOT: root },
      encoding: 'utf8'
    });

    assert.notStrictEqual(result.status, 0, 'exit code must be non-zero on sync failure');
    assert.match(result.stderr, /package\.json/, 'stderr must name the failing file');
  });
});

describe('release.js — success exits 0', () => {
  test('5. all-good fixture: main() returns 0 and subprocess status 0', () => {
    const root = makeFixture({
      version: '2.0.0',
      marketplace: { metadata: { version: '1.0.0' }, plugins: [{ version: '1.0.0' }] },
      plugin: { version: '1.0.0' },
      packageJson: { version: '1.0.0' }
    });

    assert.strictEqual(main(root), 0);

    const rootB = makeFixture({
      version: '3.1.4',
      marketplace: { metadata: { version: '1.0.0' }, plugins: [{ version: '1.0.0' }] },
      plugin: { version: '1.0.0' },
      packageJson: { version: '1.0.0' }
    });

    const result = spawnSync(process.execPath, [releaseScriptPath], {
      env: { ...process.env, CTOC_RELEASE_ROOT: rootB },
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0);
  });
});

describe('release.js — atomic write', () => {
  test('6. no truncation when the rename crashes; temp is cleaned up', () => {
    const root = makeFixture({ version: '2.0.0' });
    const target = path.join(root, 'atomic-target.json');
    const oldObj = { version: '1.0.0', keep: 'me', nested: { a: 1 } };
    fs.writeFileSync(target, JSON.stringify(oldObj, null, 2) + '\n');

    const newData = JSON.stringify({ version: '2.0.0' }, null, 2) + '\n';

    assert.throws(
      () => atomicWriteFileSync(target, newData, {
        rename: () => { throw new Error('simulated crash during rename'); }
      }),
      /simulated crash during rename/
    );

    // (a) target still parses as the full OLD JSON, never truncated
    const after = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.deepStrictEqual(after, oldObj);

    // (b) no *.tmp-* residue left behind
    const residue = fs.readdirSync(root).filter((f) => f.includes('.tmp-'));
    assert.deepStrictEqual(residue, [], `no temp residue expected, found: ${residue.join(', ')}`);
  });

  test('7. no residue after a normal successful sync', () => {
    const root = makeFixture({
      version: '2.0.0',
      plugin: { version: '1.0.0' },
      packageJson: { version: '1.0.0' }
    });

    updateJsonVersionFiles('2.0.0', root);

    // targets valid
    assert.strictEqual(readJson(root, 'package.json').version, '2.0.0');
    assert.strictEqual(readJson(root, '.claude-plugin', 'plugin.json').version, '2.0.0');

    // no temp residue in either directory
    const rootResidue = fs.readdirSync(root).filter((f) => f.includes('.tmp-'));
    const pluginResidue = fs.readdirSync(path.join(root, '.claude-plugin')).filter((f) => f.includes('.tmp-'));
    assert.deepStrictEqual(rootResidue, []);
    assert.deepStrictEqual(pluginResidue, []);
  });
});

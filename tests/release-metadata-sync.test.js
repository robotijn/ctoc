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
  packageJson,
  packageLock
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

  if (packageLock !== undefined) {
    fs.writeFileSync(
      path.join(root, 'package-lock.json'),
      typeof packageLock === 'string' ? packageLock : JSON.stringify(packageLock, null, 2) + '\n'
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
      encoding: 'utf8',
      timeout: 60000
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
      encoding: 'utf8',
      timeout: 60000
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

// ── package-lock.json follows VERSION (four-defects slice 10) ───────────────

const realisticLock = () => ({
  name: 'ctoc',
  version: '6.14.123',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'ctoc', version: '6.14.123', license: 'SEE LICENSE IN LICENSE', devDependencies: { eslint: '^9.0.0' } },
    'node_modules/eslint': { version: '9.1.0', dev: true }
  }
});

function runRelease(root) {
  return spawnSync(process.execPath, [releaseScriptPath], {
    env: { ...process.env, CTOC_RELEASE_ROOT: root },
    encoding: 'utf8',
    timeout: 60000
  });
}

describe('release.js — package-lock.json sync target', () => {
  test('8. the lockfile follows VERSION; only its two version values change, and neither licence is written', () => {
    const packageJson = { name: 'ctoc', version: '6.14.123', license: 'SEE LICENSE IN LICENSE', private: true };
    const root = makeFixture({ version: '6.14.125', packageJson, packageLock: realisticLock() });
    const lockPath = path.join(root, 'package-lock.json');
    const pkgPath = path.join(root, 'package.json');
    const before = fs.readFileSync(lockPath, 'utf8');
    const pkgBefore = fs.readFileSync(pkgPath, 'utf8');

    const result = runRelease(root);

    assert.strictEqual(result.status, 0, result.stderr);
    const text = fs.readFileSync(lockPath, 'utf8');
    const lock = JSON.parse(text);
    assert.strictEqual(lock.version, '6.14.125');
    assert.strictEqual(lock.packages[''].version, '6.14.125');
    assert.strictEqual(lock.packages[''].license, 'SEE LICENSE IN LICENSE');
    assert.strictEqual(lock.packages['node_modules/eslint'].version, '9.1.0');
    assert.strictEqual(before.split('"version": "6.14.123"').length - 1, 2);
    assert.strictEqual(text, before.split('"version": "6.14.123"').join('"version": "6.14.125"'));
    assert.strictEqual(text, JSON.stringify(lock, null, 2) + '\n');
    assert.strictEqual(
      fs.readFileSync(pkgPath, 'utf8'),
      pkgBefore.replace('"version": "6.14.123"', '"version": "6.14.125"')
    );
  });

  test('9. a lockfile that cannot be parsed fails the release and is left untouched', () => {
    const root = makeFixture({ version: '6.14.125', packageLock: '{ not json' });
    const result = runRelease(root);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /ERROR: package-lock\.json contains invalid JSON/);
    assert.match(result.stderr, /Release failed: could not sync 1 file\(s\): package-lock\.json/);
    assert.strictEqual(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'), '{ not json');
  });

  test('10. a lockfile with no packages[""] fails the release and is left untouched', () => {
    const raw = '{ "version": "6.14.123", "packages": {} }';
    const root = makeFixture({ version: '6.14.125', packageLock: raw });
    const result = runRelease(root);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Release failed: could not sync 1 file\(s\): package-lock\.json/);
    assert.strictEqual(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'), raw);
  });

  test('10b. a packages[""] object without a version key gets one', () => {
    const root = makeFixture({
      version: '6.14.125',
      packageLock: { version: '6.14.123', packages: { '': { name: 'ctoc' } } }
    });
    const result = runRelease(root);

    assert.strictEqual(result.status, 0, result.stderr);
    const text = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8');
    assert.strictEqual(JSON.parse(text).packages[''].version, '6.14.125');
    assert.strictEqual(text, JSON.stringify(JSON.parse(text), null, 2) + '\n');
  });

  test('11. no lockfile is skipped and the other targets still sync', () => {
    const root = makeFixture({
      version: '6.14.125',
      plugin: { version: '6.14.123' },
      packageJson: { version: '6.14.123' }
    });
    const result = runRelease(root);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /Skip: package-lock\.json \(not found\)/);
    assert.strictEqual(readJson(root, 'package.json').version, '6.14.125');
    assert.strictEqual(readJson(root, '.claude-plugin', 'plugin.json').version, '6.14.125');
  });

  test('12. the target list names the lockfile with exactly its two version paths', () => {
    const entry = JSON_VERSION_FILES.find((c) => c.file === 'package-lock.json');
    assert.ok(entry, 'package-lock.json must be a configured JSON_VERSION_FILES target');
    assert.deepStrictEqual(entry.updates.map((u) => u.path), [['version'], ['packages', '', 'version']]);
  });
});

// ── package-lock.json hardening (review round: critic and security findings) ─

const POSIX = process.platform !== 'win32';
const LOCK_RAW = '{ "version": "6.14.123", "packages": { "": { "name": "ctoc", "version": "6.14.123" } } }';

describe('release.js — the lockfile walk names what is wrong', () => {
  test('13. a version 1 lockfile (no packages) fails, names the path with the empty key shown, file unchanged', () => {
    const raw = '{ "version": "6.14.123", "lockfileVersion": 1, "dependencies": {} }';
    const root = makeFixture({ version: '6.14.125', packageLock: raw });
    const result = runRelease(root);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /package-lock\.json missing expected path/);
    assert.match(result.stderr, /packages\.""\.version/);
    assert.strictEqual(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'), raw);
  });

  test('14. packages: {} says why (a named missing path), not only the summary line', () => {
    const raw = '{ "version": "6.14.123", "packages": {} }';
    const root = makeFixture({ version: '6.14.125', packageLock: raw });
    const result = runRelease(root);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /package-lock\.json missing expected path: packages\.""\.version/);
    assert.strictEqual(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'), raw);
  });

  test('15. an array where an object belongs, at any step including the last container, is a named failure', () => {
    for (const raw of [
      '{ "version": "6.14.123", "packages": { "": [] } }',
      '{ "version": "6.14.123", "packages": [] }',
      '{ "version": "6.14.123", "packages": { "": null } }'
    ]) {
      const root = makeFixture({ version: '6.14.125', packageLock: raw });
      const result = runRelease(root);

      assert.strictEqual(result.status, 1, raw);
      assert.match(result.stderr, /package-lock\.json missing expected path/, raw);
      assert.doesNotMatch(result.stdout, /Updated: package-lock\.json/, raw);
      assert.strictEqual(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'), raw);
    }
  });

  test('16. the marketplace file, whose plugins step is a real array, still syncs', () => {
    const root = makeFixture({
      version: '6.14.125',
      marketplace: { metadata: { version: '6.14.123' }, plugins: [{ version: '6.14.123' }] }
    });
    const result = runRelease(root);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(readJson(root, '.claude-plugin', 'marketplace.json').plugins[0].version, '6.14.125');
  });
});

describe('release.js — a target that is not a plain file is a named failure', () => {
  test('17. a folder at the lockfile name fails named, with no stack trace', () => {
    const root = makeFixture({ version: '6.14.125' });
    fs.mkdirSync(path.join(root, 'package-lock.json'));
    const result = runRelease(root);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /ERROR: package-lock\.json could not be read: /);
    assert.doesNotMatch(result.stderr, /node:internal|\n\s+at /);
    assert.ok(fs.statSync(path.join(root, 'package-lock.json')).isDirectory());
  });

  if (POSIX) {
    test('18. a link at the lockfile name is not followed, not replaced; the outside file is unchanged', () => {
      const root = makeFixture({ version: '6.14.125' });
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-relmeta-outside-'));
      createdDirs.push(outsideDir);
      const outside = path.join(outsideDir, 'outside-lock.json');
      fs.writeFileSync(outside, LOCK_RAW);
      const link = path.join(root, 'package-lock.json');
      fs.symlinkSync(outside, link);

      const result = runRelease(root);

      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /ERROR: package-lock\.json could not be read: /);
      assert.strictEqual(fs.readFileSync(outside, 'utf8'), LOCK_RAW);
      assert.ok(fs.lstatSync(link).isSymbolicLink(), 'the link must not be replaced');
    });

    test('19. a named pipe at the lockfile name fails fast and named, never hangs', () => {
      const root = makeFixture({ version: '6.14.125' });
      const made = spawnSync('mkfifo', [path.join(root, 'package-lock.json')], { timeout: 10000 });
      assert.strictEqual(made.status, 0, 'mkfifo must create the pipe for this case');

      const result = spawnSync(process.execPath, [releaseScriptPath], {
        env: { ...process.env, CTOC_RELEASE_ROOT: root },
        encoding: 'utf8',
        timeout: 10000
      });

      assert.strictEqual(result.error, undefined, 'the release must not hang on a pipe');
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /ERROR: package-lock\.json could not be read: /);
    });
  }
});

describe('release.js — the temp file is exclusive and keeps the original mode', () => {
  if (POSIX) {
    test('20. a read-only (0444) lockfile is updated and stays 0444', () => {
      const root = makeFixture({ version: '6.14.125', packageLock: realisticLock() });
      const lockPath = path.join(root, 'package-lock.json');
      fs.chmodSync(lockPath, 0o444);

      const result = runRelease(root);

      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')).version, '6.14.125');
      assert.strictEqual(fs.statSync(lockPath).mode & 0o777, 0o444);
    });

    test('21. a link planted at the temp name is not written through; the write fails', () => {
      const root = makeFixture({ version: '2.0.0' });
      const target = path.join(root, 'plain.json');
      fs.writeFileSync(target, '{"version":"1.0.0"}\n');
      const outside = path.join(root, 'outside.txt');
      fs.writeFileSync(outside, 'untouched');
      const realNow = Date.now;
      Date.now = () => 1234567;
      try {
        const tmpName = `${target}.tmp-${process.pid}-1234567`;
        fs.symlinkSync(outside, tmpName);

        assert.throws(() => atomicWriteFileSync(target, '{"version":"2.0.0"}\n'), /EEXIST/);

        assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'untouched');
        assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"version":"1.0.0"}\n');
        assert.ok(fs.lstatSync(tmpName).isSymbolicLink(), 'the planted link is not ours to remove');
      } finally {
        Date.now = realNow;
      }
    });
  }
});

describe('release.js — a failed temp-file removal is never swallowed', () => {
  test('23. the original error is thrown and the failed removal is recorded on it', () => {
    const root = makeFixture({ version: '2.0.0' });
    const target = path.join(root, 'plain.json');
    fs.writeFileSync(target, '{"version":"1.0.0"}\n');
    let tmpPath;
    // The seam swaps the temp file for a folder, so the later removal (unlink) fails.
    const rename = (tmp) => {
      tmpPath = tmp;
      fs.unlinkSync(tmp);
      fs.mkdirSync(tmp);
      throw new Error('simulated crash during rename');
    };

    let caught;
    try {
      atomicWriteFileSync(target, '{"version":"2.0.0"}\n', { rename });
    } catch (err) {
      caught = err;
    } finally {
      fs.rmdirSync(tmpPath);
    }

    assert.ok(caught, 'the write must throw');
    assert.match(caught.message, /simulated crash during rename/, 'the original error stays the one thrown');
    assert.ok(caught.cleanupError instanceof Error, 'the failed removal is recorded on the thrown error');
    assert.ok(caught.cleanupError.code, 'the recorded removal error keeps its code');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"version":"1.0.0"}\n');
  });

  test('24. a temp file that is already gone is not a failure and records nothing', () => {
    const root = makeFixture({ version: '2.0.0' });
    const target = path.join(root, 'plain.json');
    fs.writeFileSync(target, '{"version":"1.0.0"}\n');
    const rename = (tmp) => {
      fs.unlinkSync(tmp);
      throw new Error('simulated crash during rename');
    };

    assert.throws(
      () => atomicWriteFileSync(target, '{"version":"2.0.0"}\n', { rename }),
      (err) => /simulated crash/.test(err.message) && err.cleanupError === undefined
    );
  });
});

describe('release.js — the mode copy hides nothing but a missing target', () => {
  test('25. a target that does not exist yet is written with the default mode', () => {
    const root = makeFixture({ version: '2.0.0' });
    const target = path.join(root, 'fresh.json');

    // The default mode is what a plain create gives in this directory (umask included).
    const reference = path.join(root, 'reference.json');
    fs.writeFileSync(reference, 'x');

    atomicWriteFileSync(target, '{"version":"2.0.0"}\n');

    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"version":"2.0.0"}\n');
    assert.strictEqual(fs.statSync(target).mode & 0o777, fs.statSync(reference).mode & 0o777);
    assert.deepStrictEqual(fs.readdirSync(root).filter((n) => n.includes('.tmp-')), []);
  });

  test('26. a target whose parent is a regular file throws ENOTDIR (ENOENT on Windows) and leaves nothing behind', () => {
    const root = makeFixture({ version: '2.0.0' });
    const parent = path.join(root, 'plain-file');
    fs.writeFileSync(parent, 'not a folder');

    // POSIX reports a regular file in the path as ENOTDIR; Windows reports a missing path as ENOENT.
    const expectedCode = process.platform === 'win32' ? 'ENOENT' : 'ENOTDIR';
    assert.throws(
      () => atomicWriteFileSync(path.join(parent, 'x.json'), '{}\n'),
      (err) => err.code === expectedCode
    );
    assert.ok(!fs.existsSync(path.join(parent, 'x.json')), 'the target is not created');

    assert.strictEqual(fs.readFileSync(parent, 'utf8'), 'not a folder');
    assert.deepStrictEqual(fs.readdirSync(root).filter((n) => n.includes('.tmp-')), []);
  });

  test('27. a stat failure other than ENOENT propagates before any temp file is made', () => {
    const root = makeFixture({ version: '2.0.0' });
    const target = path.join(root, 'plain.json');
    fs.writeFileSync(target, '{"version":"1.0.0"}\n');
    const safeFs = require('../src/lib/safe-fs');
    const realStat = safeFs.statSync;
    safeFs.statSync = () => {
      const err = new Error('simulated disk fault');
      err.code = 'EIO';
      throw err;
    };
    try {
      assert.throws(
        () => atomicWriteFileSync(target, '{"version":"2.0.0"}\n'),
        (err) => err.code === 'EIO'
      );
    } finally {
      safeFs.statSync = realStat;
    }

    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"version":"1.0.0"}\n');
    assert.deepStrictEqual(fs.readdirSync(root).filter((n) => n.includes('.tmp-')), []);
  });
});

describe('release.js — the one line a person sees names the leftover file', () => {
  test('28. a failed removal puts the temp file name and the removal error code in the message', () => {
    const root = makeFixture({ version: '2.0.0' });
    const target = path.join(root, 'plain.json');
    fs.writeFileSync(target, '{"version":"1.0.0"}\n');
    let tmpPath;
    const rename = (tmp) => {
      tmpPath = tmp;
      fs.unlinkSync(tmp);
      fs.mkdirSync(tmp);
      throw new Error('simulated crash during rename');
    };

    let caught;
    try {
      atomicWriteFileSync(target, '{"version":"2.0.0"}\n', { rename });
    } catch (err) {
      caught = err;
    } finally {
      fs.rmdirSync(tmpPath);
    }

    assert.match(caught.message, /simulated crash during rename/, 'the original wording stays');
    assert.ok(caught.message.includes(tmpPath), `the message names ${tmpPath}: ${caught.message}`);
    assert.ok(caught.message.includes(caught.cleanupError.code), `the message names ${caught.cleanupError.code}: ${caught.message}`);
  });
});

describe('release.js — VERSION parts are safe integers', () => {
  test('22. 99999999999999999999999.0.0 is refused with a named error and nothing is written', () => {
    const root = makeFixture({ version: '99999999999999999999999.0.0', packageLock: LOCK_RAW });
    const result = runRelease(root);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Invalid version format/);
    assert.strictEqual(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'), LOCK_RAW);
  });
});

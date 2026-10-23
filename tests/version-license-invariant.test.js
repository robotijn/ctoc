'use strict';

// Version/license single-source invariant. The comparison logic lives in the
// shared helper tests/helpers/metadata-invariant.js — the single source imported
// by both this W09 acceptance test and W06's cross-file-invariant infrastructure.
//
// The license is the CTO Chief (CTOC) End-User License Agreement: package.json,
// the package-lock.json root package and the marketplace entry read
// "SEE LICENSE IN LICENSE", plugin.json has no license field, and LICENSE opens
// with the agreement's title. README states which copies stay under PolyForm
// Shield; release 6.14.135 is the last of them.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readMetadata,
  collectVersionMismatches,
  collectLicenseMismatches,
} = require('./helpers/metadata-invariant');
const { readLicenseSources } = require('./helpers/source-of-truth');

const EXPECTED_LICENSE = 'SEE LICENSE IN LICENSE';
const AGREEMENT_TITLE = 'CTO Chief (CTOC) End-User License Agreement';
const FIRST_POLYFORM_VERSION = '6.1.26'; // PolyForm Shield was adopted in 6.1.26
const LAST_POLYFORM_VERSION = '6.14.135';
const OLD_LICENSE_VALUE = 'PolyForm-Shield-1.0.0';
const OLD_TITLE = 'PolyForm Shield License 1.0.0';
const REAL_ROOT = path.resolve(__dirname, '..');

/** Read and parse a JSON file under `root`; no catch, so a missing file fails loudly. */
function readJson(root, ...parts) {
  return JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));
}

/** The license of the package-lock.json root package, or undefined if it has none. */
function lockRootLicense(root) {
  const lock = readJson(root, 'package-lock.json');
  const entry = lock.packages && lock.packages[''];
  return entry ? entry.license : undefined;
}

/**
 * Every license declaration that disagrees with the agreement, named by file:
 * package.json and the marketplace entry (via the shared helper), the lockfile
 * root, a plugin.json that carries a license at all, and a LICENSE whose first
 * line is not the agreement's title.
 */
function licenseMismatches(root = REAL_ROOT) {
  const meta = readMetadata(root);
  const mismatches = collectLicenseMismatches(meta, { expected: EXPECTED_LICENSE });
  const lockLicense = lockRootLicense(root);
  if (lockLicense !== EXPECTED_LICENSE) {
    mismatches.push({ file: 'package-lock.json', value: lockLicense });
  }
  const plugin = readJson(root, '.claude-plugin', 'plugin.json');
  if (Object.hasOwn(plugin, 'license')) {
    mismatches.push({ file: 'plugin.json', value: plugin.license });
  }
  const title = meta.license.licenseFileFirstLine;
  if (title !== AGREEMENT_TITLE) {
    mismatches.push({ file: 'LICENSE', value: title });
  }
  return mismatches;
}

/**
 * Build a temp fixture root mirroring the real metadata files, applying an
 * optional mutation to package.json / plugin.json / marketplace.json / the
 * lockfile / VERSION / LICENSE before writing them out.
 * Returns the fixture root path (caller owns cleanup).
 */
function makeFixtureRoot({ mutate } = {}) {
  const pkg = readJson(REAL_ROOT, 'package.json');
  const plugin = readJson(REAL_ROOT, '.claude-plugin', 'plugin.json');
  const marketplace = readJson(REAL_ROOT, '.claude-plugin', 'marketplace.json');
  const realLock = readJson(REAL_ROOT, 'package-lock.json');
  // A minimal lockfile: the root package entry is all the invariant reads.
  const lock = {
    name: realLock.name,
    version: realLock.version,
    lockfileVersion: realLock.lockfileVersion,
    packages: { '': { ...realLock.packages[''] } },
  };
  const versionText = fs.readFileSync(path.join(REAL_ROOT, 'VERSION'), 'utf8');
  const licenseText = fs.readFileSync(path.join(REAL_ROOT, 'LICENSE'), 'utf8');

  const bundle = { pkg, plugin, marketplace, lock, versionText, licenseText };
  if (mutate) mutate(bundle);

  // The folder is created only after every read and the change step succeeded, and
  // removed again if a write fails, so a throw never leaves an empty folder behind.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-invariant-'));
  try {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(bundle.pkg, null, 2));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(bundle.lock, null, 2));
    fs.writeFileSync(
      path.join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify(bundle.plugin, null, 2),
    );
    fs.writeFileSync(
      path.join(dir, '.claude-plugin', 'marketplace.json'),
      JSON.stringify(bundle.marketplace, null, 2),
    );
    fs.writeFileSync(path.join(dir, 'VERSION'), bundle.versionText);
    fs.writeFileSync(path.join(dir, 'LICENSE'), bundle.licenseText);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }

  return dir;
}

/** Run `fn(fixtureRoot)` on a fixture built with `mutate`, then remove the fixture. */
function withFixture(mutate, fn) {
  const fixtureRoot = makeFixtureRoot({ mutate });
  try {
    fn(fixtureRoot);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

const compareVersions = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
};

test('all version fields agree with the VERSION file', () => {
  const meta = readMetadata();
  assert.deepStrictEqual(
    collectVersionMismatches(meta),
    [],
    'every version source must equal the VERSION file',
  );
});

test('every licence declaration names the agreement', () => {
  assert.deepStrictEqual(licenseMismatches(), []);
  assert.strictEqual(readJson(REAL_ROOT, 'package.json').private, true);
});

test('license is the correct pinned identifier across manifests', () => {
  const meta = readMetadata();
  assert.strictEqual(meta.license['package.json'], EXPECTED_LICENSE);
  assert.strictEqual(meta.license['package.json'], meta.license['marketplace.plugin']);
  assert.notStrictEqual(meta.license['package.json'], 'Apache-2.0');
});

test('license identifier traces to the actual LICENSE file text', () => {
  const meta = readMetadata();
  assert.strictEqual(meta.license.licenseFileFirstLine, AGREEMENT_TITLE);
});

test('LICENSE holds the agreement, not the PolyForm Shield text', () => {
  const text = fs.readFileSync(path.join(REAL_ROOT, 'LICENSE'), 'utf8');
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  assert.ok(!lines.includes(OLD_TITLE), 'the PolyForm Shield title line must be gone');
  assert.ok(
    !lines.some((l) => l.startsWith('Licensor Line of Business:')),
    'the PolyForm Shield "Licensor Line of Business" paragraph must be gone',
  );
  assert.ok(
    lines.some((l) => l.startsWith('Copyright (c)') && l.includes('Tijn van der Zant')),
    'a copyright line must name Tijn van der Zant',
  );
  assert.ok(text.includes('tijn@theaiguys.com'), 'LICENSE must give the contact address');
});

test('README states the agreement and which copies stay under PolyForm Shield', () => {
  const readme = fs.readFileSync(path.join(REAL_ROOT, 'README.md'), 'utf8');
  const polyformLines = readme.split(/\r?\n/).filter((l) => l.includes('PolyForm'));
  assert.strictEqual(polyformLines.length, 1, 'exactly one README line names PolyForm');
  const [line] = polyformLines;
  assert.ok(
    line.includes(
      `from version ${FIRST_POLYFORM_VERSION} up to and including version ${LAST_POLYFORM_VERSION}`,
    ),
    line,
  );
  assert.ok(line.includes('earlier copies stay under the license they shipped with'), line);
  assert.ok(line.includes(`after version ${LAST_POLYFORM_VERSION}`), line);
  assert.ok(line.includes('https://polyformproject.org/licenses/shield/1.0.0'), line);
  for (const needle of [
    AGREEMENT_TITLE,
    '](LICENSE)',
    'tijn@theaiguys.com',
    'once per company together with its affiliates, or once per individual who acts for no company',
  ]) {
    assert.ok(readme.includes(needle), `README must contain: ${needle}`);
  }
  assert.ok(
    !readme.includes('Use CTO Chief freely for any project.'),
    'the old "use freely" sentence must be gone',
  );
});

test('the tree carrying the agreement is labelled after the last PolyForm Shield version', () => {
  const version = fs.readFileSync(path.join(REAL_ROOT, 'VERSION'), 'utf8').trim();
  assert.ok(
    compareVersions(version, LAST_POLYFORM_VERSION) > 0,
    `VERSION ${version} must be greater than ${LAST_POLYFORM_VERSION}`,
  );
});

test('mutating one version value fails the invariant (RED-on-drift)', () => {
  withFixture(
    (b) => {
      b.plugin.version = '0.0.0-drift';
    },
    (fixtureRoot) => {
      const bad = readMetadata(fixtureRoot);
      const mismatches = collectVersionMismatches(bad);
      assert.ok(mismatches.length >= 1, 'a drifted version must be reported');
      assert.ok(
        mismatches.some((m) => m.file === 'plugin.json'),
        'the mismatch must name plugin.json',
      );
    },
  );
});

test('reverting the license fails the invariant', () => {
  withFixture(
    (b) => {
      b.pkg.license = 'Apache-2.0';
    },
    (fixtureRoot) => {
      const bad = readMetadata(fixtureRoot);
      const mismatches = collectLicenseMismatches(bad, { expected: EXPECTED_LICENSE });
      assert.ok(mismatches.length >= 1, 'a reverted license must be reported');
      assert.ok(
        mismatches.some((m) => m.file === 'package.json'),
        'the mismatch must name package.json',
      );
    },
  );
});

// Each fixture changes exactly one thing; the invariant must name exactly that file.
const PUT_BACK = [
  ['package.json', (b) => { b.pkg.license = OLD_LICENSE_VALUE; }],
  ['package-lock.json', (b) => { b.lock.packages[''].license = OLD_LICENSE_VALUE; }],
  ['marketplace.plugin', (b) => { b.marketplace.plugins[0].license = OLD_LICENSE_VALUE; }],
  ['plugin.json', (b) => { b.plugin.license = OLD_LICENSE_VALUE; }],
  [
    'LICENSE',
    (b) => {
      const lines = b.licenseText.split(/\r?\n/);
      lines[lines.findIndex((l) => l.trim().length > 0)] = OLD_TITLE;
      b.licenseText = lines.join('\n');
    },
  ],
];

for (const [name, mutate] of PUT_BACK) {
  test(`putting one licence value back fails, naming its file: ${name}`, () => {
    withFixture(mutate, (fixtureRoot) => {
      assert.deepStrictEqual(
        licenseMismatches(fixtureRoot).map((m) => m.file),
        [name],
      );
    });
  });
}

// No fixture folder may be left behind when building the fixture fails, whether
// the change step throws or a later write does (JSON.stringify throws on a BigInt).
const FAILING_BUILDS = [
  ['the change step throws', () => { throw new Error('change step failed'); }, /change step failed/],
  ['a file write fails', (b) => { b.pkg.broken = 1n; }, TypeError],
];

for (const [name, mutate, expected] of FAILING_BUILDS) {
  test(`a fixture build that fails leaves no folder behind: ${name}`, () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-invariant-parent-'));
    const tmpdir = test.mock.method(os, 'tmpdir', () => parent);
    try {
      assert.throws(() => makeFixtureRoot({ mutate }), expected);
      assert.deepStrictEqual(fs.readdirSync(parent), []);
    } finally {
      tmpdir.mock.restore();
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
}

// A LICENSE that is a file but cannot be read must surface the real read error,
// not be reported as "first line is null". No portable real file fails to read
// while it stats as a file (a permission mode does nothing on Windows or as root),
// so the read fails at the I/O boundary: only the LICENSE read is made to throw.
test('a LICENSE that stats as a file but cannot be read surfaces the read error', () => {
  withFixture(() => {}, (fixtureRoot) => {
    const licensePath = path.join(fixtureRoot, 'LICENSE');
    const realRead = fs.readFileSync;
    const denied = Object.assign(new Error('EACCES: permission denied, open LICENSE'), {
      code: 'EACCES',
    });
    const read = test.mock.method(fs, 'readFileSync', (file, ...rest) => {
      if (file === licensePath) throw denied;
      return realRead(file, ...rest);
    });
    try {
      assert.throws(() => readLicenseSources(fixtureRoot), (err) => err === denied);
    } finally {
      read.mock.restore();
    }
  });
});

test('a lockfile without a root package entry fails, naming package-lock.json', () => {
  withFixture(
    (b) => {
      b.lock.packages = {};
    },
    (fixtureRoot) => {
      const mismatches = licenseMismatches(fixtureRoot);
      assert.deepStrictEqual(
        mismatches.map((m) => m.file),
        ['package-lock.json'],
      );
      assert.strictEqual(mismatches[0].value, undefined);
    },
  );
});

'use strict';

// Version/license single-source invariant. The comparison logic lives in the
// shared helper tests/helpers/metadata-invariant.js — the single source imported
// by both this W09 acceptance test and W06's cross-file-invariant infrastructure.

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

const EXPECTED_LICENSE = 'PolyForm-Shield-1.0.0';

/**
 * Build a temp fixture root mirroring the real metadata files, applying an
 * optional mutation to package.json / plugin.json before writing them out.
 * Returns the fixture root path (caller owns cleanup).
 */
function makeFixtureRoot({ mutate } = {}) {
  const realRoot = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-invariant-'));
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(realRoot, 'package.json'), 'utf8'));
  const plugin = JSON.parse(
    fs.readFileSync(path.join(realRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(realRoot, '.claude-plugin', 'marketplace.json'), 'utf8'),
  );
  const versionText = fs.readFileSync(path.join(realRoot, 'VERSION'), 'utf8');
  const licenseText = fs.readFileSync(path.join(realRoot, 'LICENSE'), 'utf8');

  const bundle = { pkg, plugin, marketplace, versionText, licenseText };
  if (mutate) mutate(bundle);

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(bundle.pkg, null, 2));
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

  return dir;
}

test('all version fields agree with the VERSION file', () => {
  const meta = readMetadata();
  assert.deepStrictEqual(
    collectVersionMismatches(meta),
    [],
    'every version source must equal the VERSION file',
  );
});

test('license is the correct pinned identifier across manifests', () => {
  const meta = readMetadata();
  assert.strictEqual(meta.license['package.json'], EXPECTED_LICENSE);
  assert.strictEqual(meta.license['package.json'], meta.license['marketplace.plugin']);
  assert.notStrictEqual(meta.license['package.json'], 'Apache-2.0');
});

test('license identifier traces to the actual LICENSE file text', () => {
  const meta = readMetadata();
  assert.match(meta.license.licenseFileFirstLine, /PolyForm Shield License 1\.0\.0/);
});

test('mutating one version value fails the invariant (RED-on-drift)', () => {
  const fixtureRoot = makeFixtureRoot({
    mutate: (b) => {
      b.plugin.version = '0.0.0-drift';
    },
  });
  try {
    const bad = readMetadata(fixtureRoot);
    const mismatches = collectVersionMismatches(bad);
    assert.ok(mismatches.length >= 1, 'a drifted version must be reported');
    assert.ok(
      mismatches.some((m) => m.file === 'plugin.json'),
      'the mismatch must name plugin.json',
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('reverting the license fails the invariant', () => {
  const fixtureRoot = makeFixtureRoot({
    mutate: (b) => {
      b.pkg.license = 'Apache-2.0';
    },
  });
  try {
    const bad = readMetadata(fixtureRoot);
    const mismatches = collectLicenseMismatches(bad, { expected: EXPECTED_LICENSE });
    assert.ok(mismatches.length >= 1, 'a reverted license must be reported');
    assert.ok(
      mismatches.some((m) => m.file === 'package.json'),
      'the mismatch must name package.json',
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

'use strict';

/**
 * Shared release-metadata read+compare helper.
 *
 * Single source of the version/license cross-file comparison logic, imported by
 * both W09's acceptance test (tests/version-license-invariant.test.js) and W06's
 * cross-file-invariant infrastructure. It ONLY reads sources and RETURNS raw
 * values + mismatch lists — it contains NO assertions. Callers assert.
 *
 * Not a `*.test.js` file and lives under tests/helpers/, so the
 * `node --test tests/*.test.js` glob never executes it as a test.
 */

const fs = require('fs');
const path = require('path');

/** Repo root, two levels up from tests/helpers/. */
const DEFAULT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Read a JSON file and parse it.
 * @param {string} filePath Absolute path to a JSON file.
 * @returns {object} Parsed JSON.
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Read the raw version + license metadata across every source file. Never
 * throws on a mismatch — it returns the raw values so callers can assert.
 *
 * @param {string} [root=DEFAULT_ROOT] Repo root to read from (parameterized so
 *   tests can point at a fixture tree).
 * @returns {{
 *   version: {
 *     VERSION: string,
 *     'package.json': string,
 *     'plugin.json': string,
 *     'marketplace.metadata': string,
 *     'marketplace.plugin': string
 *   },
 *   license: {
 *     'package.json': string,
 *     'marketplace.plugin': string,
 *     licenseFileFirstLine: string
 *   }
 * }} Raw metadata values.
 */
function readMetadata(root = DEFAULT_ROOT) {
  const pkg = readJson(path.join(root, 'package.json'));
  const plugin = readJson(path.join(root, '.claude-plugin', 'plugin.json'));
  const marketplace = readJson(path.join(root, '.claude-plugin', 'marketplace.json'));
  const versionFile = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  const licenseFirstLine = fs
    .readFileSync(path.join(root, 'LICENSE'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) || '';

  return {
    version: {
      VERSION: versionFile,
      'package.json': pkg.version,
      'plugin.json': plugin.version,
      'marketplace.metadata': marketplace.metadata.version,
      'marketplace.plugin': marketplace.plugins[0].version,
    },
    license: {
      'package.json': pkg.license,
      'marketplace.plugin': marketplace.plugins[0].license,
      licenseFileFirstLine: licenseFirstLine,
    },
  };
}

/**
 * Collect every version field that disagrees with the canonical VERSION file.
 * Empty array ⇒ all version sources agree.
 *
 * @param {ReturnType<typeof readMetadata>} meta Metadata from readMetadata().
 * @returns {Array<{ file: string, value: string }>} Mismatched file:value pairs.
 */
function collectVersionMismatches(meta) {
  const canonical = meta.version.VERSION;
  return Object.entries(meta.version)
    .filter(([file, value]) => file !== 'VERSION' && value !== canonical)
    .map(([file, value]) => ({ file, value }));
}

/**
 * Collect every license-manifest field that disagrees with the expected
 * pinned license identifier. Empty array ⇒ all license manifests agree.
 *
 * @param {ReturnType<typeof readMetadata>} meta Metadata from readMetadata().
 * @param {{ expected: string }} options Expected pinned license identifier.
 * @returns {Array<{ file: string, value: string }>} Mismatched file:value pairs.
 */
function collectLicenseMismatches(meta, { expected }) {
  return ['package.json', 'marketplace.plugin']
    .filter((file) => meta.license[file] !== expected)
    .map((file) => ({ file, value: meta.license[file] }));
}

module.exports = {
  DEFAULT_ROOT,
  readMetadata,
  collectVersionMismatches,
  collectLicenseMismatches,
};

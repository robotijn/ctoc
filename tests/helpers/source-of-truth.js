'use strict';

/**
 * Real-artifact single-source-of-truth reader (W06-s5 — findings B1–B6).
 *
 * WHY THIS EXISTS
 * ---------------
 * `tests/release.test.js` historically asserted the release *script's* sync logic
 * against synthetic temp fixtures it built itself, and never read the real
 * `package.json` / `plugin.json` / `marketplace.json` / `LICENSE`. That blind spot
 * is exactly how the shipped artifact drifted (version 6.9.49 vs VERSION 6.10.3,
 * license Apache-2.0 vs the actual PolyForm Shield 1.0.0) under a fully green suite.
 * The license check now reads the exact value package.json declares ("SEE LICENSE
 * IN LICENSE") and the top-level file it names, and compares the file's first line
 * with the agreement's title; it reduces nothing to tokens.
 * This module reads the REAL on-disk sources and returns raw values + agreement
 * verdicts so the caller can assert; it contains no assertions of its own.
 *
 * PAIRING (W09 — Release and metadata truth)
 * ------------------------------------------
 * W06-s5 only *witnesses* the invariant; it corrects no metadata value. The paired
 * production fix that makes the invariant green is W09 (it corrected package.json's
 * version + license and made release.js sync package.json). W09 shipped its own
 * acceptance test `tests/version-license-invariant.test.js` on top of the sibling
 * reader `tests/helpers/metadata-invariant.js` (the throw-on-missing variant). This
 * module is the plan-specified reader with a DEFENSIVE-NULL contract: a missing or
 * unparseable source yields a `null` field (so an assertion fails loudly, naming the
 * file, rather than throwing opaquely). The exception is `readLicenseSources`: it
 * reports a missing or non-file LICENSE as 'missing' or 'not-a-file' and re-throws
 * any other stat error and any read error on a LICENSE file, so a real I/O
 * failure is never read as a missing file or an empty first line.
 * Both readers are pure reads over the same
 * five files; this one is the reader s5's release.test assertions consume.
 *
 * Not named `*.test.js` and lives under tests/helpers/, so the
 * `node --test tests/*.test.js` glob never executes it as a test file.
 */

const fs = require('fs');
const path = require('path');

/** Repo root, two levels up from tests/helpers/. */
const projectRoot = path.join(__dirname, '..', '..');

/**
 * Read + parse a JSON file, returning null on any failure (missing / unreadable /
 * unparseable) instead of throwing, so a caller can report the offending field.
 * @param {string} filePath Absolute path to a JSON file.
 * @returns {object|null} Parsed JSON, or null on any read/parse failure.
 */
function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Read a UTF-8 text file, returning null on any failure instead of throwing.
 * @param {string} filePath Absolute path to a text file.
 * @returns {string|null} File contents, or null on any read failure.
 */
function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * First non-empty, trimmed line of a text blob (CRLF- and LF-safe), or null.
 * @param {string|null} text Text contents.
 * @returns {string|null} First non-empty line trimmed, or null.
 */
function firstNonEmptyLine(text) {
  if (typeof text !== 'string') return null;
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line === undefined ? null : line;
}

/**
 * Read the version string reported by each real source file. A missing or
 * unparseable source (or a missing field / missing ctoc marketplace entry)
 * yields `null` for that field so `allVersionsAgree` fails loudly and names it.
 *
 * @param {string} [root=projectRoot] Repo root to read from (parameterized so a
 *   test can point at a drift fixture to prove non-vacuity).
 * @returns {{
 *   VERSION: string|null,
 *   packageJson: string|null,
 *   pluginJson: string|null,
 *   marketplace: string|null
 * }} Per-file version values; marketplace is the ctoc plugin entry's version.
 */
function readVersionSources(root = projectRoot) {
  const versionText = safeReadText(path.join(root, 'VERSION'));
  const pkg = safeReadJson(path.join(root, 'package.json'));
  const plugin = safeReadJson(path.join(root, '.claude-plugin', 'plugin.json'));
  const marketplace = safeReadJson(path.join(root, '.claude-plugin', 'marketplace.json'));

  let marketplaceVersion = null;
  if (marketplace && Array.isArray(marketplace.plugins)) {
    const ctoc = marketplace.plugins.find((p) => p && p.name === 'ctoc');
    marketplaceVersion = ctoc && typeof ctoc.version === 'string' ? ctoc.version : null;
  }

  return {
    VERSION: typeof versionText === 'string' ? versionText.trim() || null : null,
    packageJson: pkg && typeof pkg.version === 'string' ? pkg.version : null,
    pluginJson: plugin && typeof plugin.version === 'string' ? plugin.version : null,
    marketplace: marketplaceVersion,
  };
}

/**
 * Read the exact license value package.json declares and what the top-level
 * LICENSE entry is: a regular file, missing, or something else (a folder, for
 * example). A stat error other than "missing", and a read error on a LICENSE
 * that is a file, are re-thrown, so a test fails loudly with the real error
 * instead of reading a swallowed one.
 *
 * @param {string} [root=projectRoot] Repo root to read from.
 * @returns {{
 *   declaredRaw: string|null,
 *   licenseFile: 'file'|'missing'|'not-a-file',
 *   licenseFirstLine: string|null
 * }} The exact declared value (null if absent), the kind of LICENSE entry, and
 *   the first non-empty line of LICENSE (null unless it is a file).
 */
function readLicenseSources(root = projectRoot) {
  const pkg = safeReadJson(path.join(root, 'package.json'));
  const declaredRaw = pkg && typeof pkg.license === 'string' ? pkg.license : null;
  const licensePath = path.join(root, 'LICENSE');

  let licenseFile;
  try {
    licenseFile = fs.statSync(licensePath).isFile() ? 'file' : 'not-a-file';
  } catch (err) {
    if (err && err.code === 'ENOENT') licenseFile = 'missing';
    else throw err;
  }

  return {
    declaredRaw,
    licenseFile,
    licenseFirstLine:
      licenseFile === 'file' ? firstNonEmptyLine(fs.readFileSync(licensePath, 'utf8')) : null,
  };
}

/**
 * Verdict on whether every version source agrees. `ok` is true only when every
 * field is non-null AND all fields are equal — so a missing/unparseable source
 * (a null field) fails the check rather than silently passing, consistent with
 * this workstream's anti-false-green thesis.
 *
 * @param {ReturnType<typeof readVersionSources>} sources Version values.
 * @returns {{ ok: boolean, values: object }} Verdict + the per-file map for the
 *   failure message.
 */
function allVersionsAgree(sources) {
  const values = Object.values(sources);
  const anyNull = values.some((v) => v === null);
  const allEqual = values.every((v) => v === values[0]);
  return { ok: !anyNull && allEqual, values: sources };
}

/**
 * Verdict on whether the license declaration holds: package.json declares
 * exactly `expectedValue`, a file named LICENSE exists at the top level, and its
 * first non-empty line is exactly `expectedTitle`. Every problem names the file
 * at fault; `ok` is true only when there is no problem.
 *
 * @param {ReturnType<typeof readLicenseSources>} sources License sources.
 * @param {{ expectedValue: string, expectedTitle: string }} expected Exact values.
 * @returns {{ ok: boolean, problems: Array<{ file: 'package.json'|'LICENSE', message: string }> }}
 *   Verdict plus the named problems.
 */
function licenseDeclarationVerdict(sources, { expectedValue, expectedTitle }) {
  const problems = [];
  if (sources.declaredRaw !== expectedValue) {
    problems.push({
      file: 'package.json',
      message:
        `package.json "license" is ${JSON.stringify(sources.declaredRaw)}; ` +
        `expected ${JSON.stringify(expectedValue)}`,
    });
  }
  if (sources.licenseFile === 'missing') {
    problems.push({ file: 'LICENSE', message: 'LICENSE is missing at the top level of the repository' });
  } else if (sources.licenseFile === 'not-a-file') {
    problems.push({ file: 'LICENSE', message: 'LICENSE at the top level of the repository is not a file' });
  } else if (sources.licenseFirstLine !== expectedTitle) {
    problems.push({
      file: 'LICENSE',
      message:
        `LICENSE first line is ${JSON.stringify(sources.licenseFirstLine)}; ` +
        `expected ${JSON.stringify(expectedTitle)}`,
    });
  }
  return { ok: problems.length === 0, problems };
}

module.exports = {
  projectRoot,
  readVersionSources,
  readLicenseSources,
  allVersionsAgree,
  licenseDeclarationVerdict,
};

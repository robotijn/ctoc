/**
 * Release Script — Dark-Branch Coverage Tests
 *
 * Companion to tests/release.test.js (which tests LOCAL re-implementations of
 * the sync logic against synthetic fixtures) and tests/release-metadata-sync.test.js
 * (which drives the REAL exported functions for the package.json sync + atomic
 * write). This file targets the branches those two leave dark, measured with:
 *
 *   node --test --experimental-test-coverage \
 *     --test-coverage-include=src/scripts/release.js tests/*release*.test.js
 *
 * Baseline dark lines before this file: 111-112 (getVersion throw), 164-166 +
 * 175-177 (missing-JSON-path failure), 214-230 (the ENTIRE body of
 * updateVersionInFiles — never driven against a real doc fixture), 250-252
 * (main() when the VERSION file itself is unreadable/malformed).
 *
 * Every test here pins a branch that goes RED under mutation of the production
 * code. No test doubles for the code under test: real exported functions, real
 * os.tmpdir() fixtures, cleaned up in after(). The only boundary is the real
 * filesystem. AI-authored; every assertion read line-by-line by a human.
 *
 * Two lines remain honestly documented as unreachable — see the block at the
 * bottom of this file (the two atomicWriteFileSync-wrapping write-failure
 * catches, which have no injectable seam and cannot fail deterministically
 * cross-platform).
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getVersion,
  updateJsonVersionFiles,
  updateVersionInFiles,
  main,
} = require('../src/scripts/release');

// ── Fixture helpers ──────────────────────────────────────────────────────────

const createdDirs = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-relcov-'));
  createdDirs.push(root);
  return root;
}

function writeVersion(root, text) {
  fs.writeFileSync(path.join(root, 'VERSION'), text);
}

function writePluginDir(root) {
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
}

function writeJson(root, ...parts) {
  const value = parts.pop();
  fs.writeFileSync(path.join(root, ...parts), JSON.stringify(value, null, 2) + '\n');
}

function readJson(root, ...parts) {
  return JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));
}

function readText(root, ...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

after(() => {
  for (const dir of createdDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup — surface nothing, the OS temp dir is disposable */
    }
  }
});

// =============================================================================
// Cluster A — getVersion() real validation + throw path (release.js:110-112)
//
// The existing release.test.js exercises a LOCAL copy of getVersion, so the
// REAL module's throw was dark. `!version || !/^\d+\.\d+\.\d+$/.test(version)`
// has two operands: an empty/whitespace string trips the FIRST operand; a
// non-empty-but-malformed string trips only the SECOND (regex) operand. Rows
// are chosen to pin each operand independently, plus the exact 3-segment
// boundary. Mutating the regex, the `!`, or the throw reds a row.
// =============================================================================

describe('getVersion — validates the VERSION file and throws loudly', () => {
  test('should_return_trimmed_version_when_VERSION_is_valid_semver', () => {
    // Arrange
    const root = makeRoot();
    writeVersion(root, '  4.5.6 \n');

    // Act
    const version = getVersion(root);

    // Assert
    assert.equal(version, '4.5.6');
  });

  const malformedRows = [
    { id: 'empty-string', text: '', reason: 'first operand (!version)' },
    { id: 'whitespace-only', text: '   \n\t ', reason: 'first operand after trim' },
    { id: 'two-segments', text: '1.2', reason: 'second operand (regex): too few segments' },
    { id: 'four-segments', text: '1.2.3.4', reason: 'second operand (regex): too many segments' },
    { id: 'non-numeric', text: 'v1.0.0', reason: 'second operand (regex): non-digit prefix' },
    { id: 'trailing-text', text: '1.2.3-beta', reason: 'second operand (regex): suffix' },
  ];

  for (const row of malformedRows) {
    test(`should_throw_invalid_version_format_when_${row.id}`, () => {
      // Arrange
      const root = makeRoot();
      writeVersion(root, row.text);

      // Act + Assert — the throw, and its message, both go red if the regex
      // or the `!` in the guard is mutated (${row.reason}).
      assert.throws(() => getVersion(root), /Invalid version format/);
    });
  }

  test('should_throw_ENOENT_when_VERSION_file_is_absent', () => {
    // Arrange — an empty root with no VERSION file at all
    const root = makeRoot();

    // Act + Assert — readFileSync surfaces the missing source, not a silent ''
    assert.throws(() => getVersion(root), /ENOENT/);
  });
});

// =============================================================================
// Cluster B — updateJsonVersionFiles() missing-path is a FAILURE, not a silent
// skip (release.js:156-159 inner error, 163-166 pathMissing, 174-177 push).
//
// A marketplace.json that HAS metadata but is MISSING the plugins array partly
// resolves (metadata.version) then hits a non-object on the plugins[0] walk.
// The contract: the file is recorded as a named FAILURE, is NOT in `updated`,
// and — critically — is NEVER written (the in-memory metadata mutation must not
// leak to disk). This pins the atomic-per-file semantics.
// =============================================================================

describe('updateJsonVersionFiles — a missing expected path is a named failure', () => {
  test('should_fail_the_file_and_not_write_when_a_nested_update_path_is_absent', () => {
    // Arrange — metadata present (partial walk succeeds), plugins array absent
    // (the plugins[0].version walk hits undefined mid-path).
    const root = makeRoot();
    writePluginDir(root);
    writeJson(root, '.claude-plugin', 'marketplace.json', {
      metadata: { name: 'ctoc', version: '1.0.0' },
      // no `plugins` key
    });

    // Act
    const { updated, failures } = updateJsonVersionFiles('2.0.0', root);

    // Assert — reported as a failure, never as an update
    assert.deepEqual(failures, ['.claude-plugin/marketplace.json']);
    assert.ok(!updated.includes('.claude-plugin/marketplace.json'));

    // Assert — disk is byte-untouched: the partial metadata mutation was NOT
    // flushed (pathMissing → continue happens BEFORE atomicWriteFileSync).
    const onDisk = readJson(root, '.claude-plugin', 'marketplace.json');
    assert.equal(onDisk.metadata.version, '1.0.0');
  });

  test('should_report_failure_when_top_level_target_object_is_the_wrong_shape', () => {
    // Arrange — plugin.json whose `version` sits under a value that is not an
    // object at all where the walk expects one. path ['version'] on a JSON that
    // is a bare array: json is an object-ish array; lastKey resolves but the
    // metadata path in marketplace is the crisp case. Here we use a marketplace
    // with metadata as a STRING so the metadata.version walk hits a non-object.
    const root = makeRoot();
    writePluginDir(root);
    writeJson(root, '.claude-plugin', 'marketplace.json', {
      metadata: 'not-an-object',
      plugins: [{ name: 'ctoc', version: '1.0.0' }],
    });

    // Act
    const { updated, failures } = updateJsonVersionFiles('2.0.0', root);

    // Assert — the metadata.version path is missing → whole file fails, and the
    // plugins[0].version that WOULD have matched is not partially written.
    assert.deepEqual(failures, ['.claude-plugin/marketplace.json']);
    assert.ok(!updated.includes('.claude-plugin/marketplace.json'));
    const onDisk = readJson(root, '.claude-plugin', 'marketplace.json');
    assert.equal(onDisk.plugins[0].version, '1.0.0');
  });
});

// =============================================================================
// Cluster C — updateJsonVersionFiles() change guard + idempotency at the REAL
// function level (release.js:168 `obj[lastKey] !== version`).
//
// A file already at the target version must NOT appear in `updated` and must
// NOT be rewritten. Mutating the `!==` to always-true would push the file into
// `updated`, reddening the first assertion.
// =============================================================================

describe('updateJsonVersionFiles — idempotent when already at target version', () => {
  test('should_report_no_updates_and_no_failures_when_all_targets_already_match', () => {
    // Arrange — every target already at 2.0.0
    const root = makeRoot();
    writePluginDir(root);
    writeJson(root, '.claude-plugin', 'marketplace.json', {
      metadata: { version: '2.0.0' },
      plugins: [{ version: '2.0.0' }],
    });
    writeJson(root, '.claude-plugin', 'plugin.json', { version: '2.0.0' });
    writeJson(root, 'package.json', { version: '2.0.0' });

    // Act
    const { updated, failures } = updateJsonVersionFiles('2.0.0', root);

    // Assert
    assert.deepEqual(updated, []);
    assert.deepEqual(failures, []);
  });
});

// =============================================================================
// Cluster D — updateVersionInFiles() happy path (release.js:214-222, 228-229).
//
// This is the single biggest dark region: main() in the existing suite always
// ran against fixtures WITHOUT a README, so every documentation update was a
// `!existsSync → skip`. Here a real README carries all three configured
// patterns; the function must write the RIGHT version into the RIGHT place for
// each. Mutating any pattern or replacement reds a specific assertion.
// =============================================================================

const README_AT_1_0_0 = [
  'Intro line with an inline **1.0.0** badge that is mid-line, not at column 0.',
  '**1.0.0** — the headline version at line start',
  '![v](https://img.shields.io/badge/version-1.0.0-blue) and again version-1.0.0-blue here.',
  "getVersion()       // → '1.0.0'",
  '',
].join('\n');

describe('updateVersionInFiles — syncs every configured README pattern', () => {
  test('should_replace_the_line_start_bold_version_and_report_README_updated', () => {
    // Arrange
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'README.md'), README_AT_1_0_0);

    // Act
    const { updated, failures } = updateVersionInFiles('2.0.0', root);
    const out = readText(root, 'README.md');

    // Assert — README is reported updated, no failures, and the line-start bold
    // version is now 2.0.0.
    assert.ok(updated.includes('README.md'));
    assert.deepEqual(failures, []);
    assert.match(out, /^\*\*2\.0\.0\*\* — the headline/m);
  });

  test('should_replace_every_badge_occurrence_because_the_badge_pattern_is_global', () => {
    // Arrange
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'README.md'), README_AT_1_0_0);

    // Act
    updateVersionInFiles('2.0.0', root);
    const out = readText(root, 'README.md');

    // Assert — BOTH `version-...-blue` badges updated (pins the /g flag); none
    // of the old badge string survives.
    const badgeMatches = out.match(/version-2\.0\.0-blue/g) || [];
    assert.equal(badgeMatches.length, 2);
    assert.ok(!out.includes('version-1.0.0-blue'));
  });

  test('should_rewrite_the_getVersion_comment_to_the_new_version', () => {
    // Arrange
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'README.md'), README_AT_1_0_0);

    // Act
    updateVersionInFiles('2.0.0', root);
    const out = readText(root, 'README.md');

    // Assert — the getVersion() doc comment now shows 2.0.0
    assert.match(out, /getVersion\(\)\s+\/\/\s*→\s*'2\.0\.0'/);
  });

  test('should_leave_a_mid_line_bold_version_untouched_because_the_pattern_is_line_anchored', () => {
    // Arrange
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'README.md'), README_AT_1_0_0);

    // Act
    updateVersionInFiles('2.0.0', root);
    const out = readText(root, 'README.md');

    // Assert — the inline (mid-line) **1.0.0** is NOT at column 0, so the
    // `^...$/m`-anchored, non-global first pattern must leave it as 1.0.0.
    // Removing the `^` anchor would (wrongly) rewrite it and red this test.
    assert.match(out, /inline \*\*1\.0\.0\*\* badge/);
  });

  test('should_preserve_unrelated_prose_around_the_version_tokens', () => {
    // Arrange
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'README.md'), README_AT_1_0_0);

    // Act
    updateVersionInFiles('2.0.0', root);
    const out = readText(root, 'README.md');

    // Assert — the surrounding text is intact (no accidental clobber)
    assert.ok(out.includes('the headline version at line start'));
    assert.ok(out.includes('Intro line with an inline'));
  });

  test('should_report_no_updates_on_a_second_run_idempotent', () => {
    // Arrange — first run brings the file to 2.0.0
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'README.md'), README_AT_1_0_0);
    updateVersionInFiles('2.0.0', root);

    // Act — second run finds nothing to change (content === original)
    const { updated, failures } = updateVersionInFiles('2.0.0', root);

    // Assert
    assert.deepEqual(updated, []);
    assert.deepEqual(failures, []);
  });
});

// =============================================================================
// Cluster E — main() end-to-end wiring (release.js:249-250 failure path, and
// the doc-sync call that the metadata suite never witnessed changing a file).
// =============================================================================

describe('main — reads VERSION, then syncs both JSON and docs, exit code as contract', () => {
  test('should_return_1_when_VERSION_file_is_absent', () => {
    // Arrange — a root with JSON targets but NO VERSION file
    const root = makeRoot();
    writePluginDir(root);
    writeJson(root, '.claude-plugin', 'plugin.json', { version: '1.0.0' });

    // Act
    const code = main(root);

    // Assert — the getVersion() failure is caught and becomes exit 1, never a
    // crash and never a silent 0.
    assert.equal(code, 1);
  });

  test('should_return_1_when_VERSION_file_is_malformed', () => {
    // Arrange
    const root = makeRoot();
    writeVersion(root, 'garbage-not-semver\n');

    // Act
    const code = main(root);

    // Assert
    assert.equal(code, 1);
  });

  test('should_return_0_and_actually_rewrite_the_README_on_a_full_good_tree', () => {
    // Arrange — a complete tree at old versions, INCLUDING a real README so the
    // doc-sync branch of main() does real work (not a skip).
    const root = makeRoot();
    writeVersion(root, '2.0.0\n');
    writePluginDir(root);
    writeJson(root, '.claude-plugin', 'marketplace.json', {
      metadata: { version: '1.0.0' },
      plugins: [{ version: '1.0.0' }],
    });
    writeJson(root, '.claude-plugin', 'plugin.json', { version: '1.0.0' });
    writeJson(root, 'package.json', { version: '1.0.0' });
    fs.writeFileSync(path.join(root, 'README.md'), README_AT_1_0_0);

    // Act
    const code = main(root);

    // Assert — success, and every artifact reflects 2.0.0 (proves main() wires
    // BOTH updateJsonVersionFiles AND updateVersionInFiles, not just the former).
    assert.equal(code, 0);
    assert.equal(readJson(root, 'package.json').version, '2.0.0');
    assert.equal(readJson(root, '.claude-plugin', 'plugin.json').version, '2.0.0');
    assert.equal(readJson(root, '.claude-plugin', 'marketplace.json').metadata.version, '2.0.0');
    assert.match(readText(root, 'README.md'), /^\*\*2\.0\.0\*\*/m);
  });

  test('should_return_1_when_a_json_target_is_present_but_the_wrong_shape', () => {
    // Arrange — VERSION good, but marketplace.json is missing plugins so a sync
    // path is absent → the failure must propagate to a non-zero exit.
    const root = makeRoot();
    writeVersion(root, '2.0.0\n');
    writePluginDir(root);
    writeJson(root, '.claude-plugin', 'marketplace.json', {
      metadata: { version: '1.0.0' },
      // no plugins → plugins[0].version path is missing
    });

    // Act
    const code = main(root);

    // Assert — the aggregated failure count is non-zero → exit 1.
    assert.equal(code, 1);
  });
});

// =============================================================================
// DOCUMENTED UNREACHABLE (honesty clause — no fabricated hit)
//
// The two write-failure catch blocks remain uncovered and are NOT vacuously
// "covered" here:
//
//   • release.js:183-186 — the catch that wraps atomicWriteFileSync inside
//     updateJsonVersionFiles.
//   • release.js:224-227 — the catch that wraps atomicWriteFileSync inside
//     updateVersionInFiles.
//
// Both fire only when atomicWriteFileSync THROWS after the target has already
// been read and mutated. Unlike atomicWriteFileSync itself — which exposes an
// injectable `rename` seam and IS exercised failing in
// tests/release-metadata-sync.test.js (test 6) — these two callers pass no
// seam. Inducing a real fs write failure deterministically would require
// making the write fail while the immediately-preceding read of the SAME path
// succeeds; the only portable levers (chmod on the file or its directory) do
// not fail uniformly across POSIX and Windows, so a test would either be
// platform-divergent or would have to be conditionally skipped — violating the
// zero-skipped gate. Their shared failure mechanism (temp-write + throw +
// cleanup + rethrow) is already pinned via the seam in release-metadata-sync
// test 6, so the residual risk here is the one-line `failures.push(file)` +
// `console.error`, not the write mechanism. Documented rather than faked.
// =============================================================================

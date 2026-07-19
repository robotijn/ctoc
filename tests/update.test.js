/**
 * Update Command Tests
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
const CACHE_DIR = path.join(HOME, '.claude', 'plugins', 'cache', 'robotijn', 'ctoc');

function test(name, fn) {
  try {
    fn();
    console.log(`# ✓ ${name}`);
  } catch (err) {
    console.log(`# ✗ ${name}`);
    console.log(`#   ${err.message}`);
    process.exitCode = 1;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('# Update Command Tests');

// This file uses a hand-rolled runner, so node sees the WHOLE file as one test. A
// branch that printed a skip and abandoned its body therefore reported as a PASS and
// was invisible to the zero-skipped gate. Three such branches lived below. Each is
// now either a real assertion or a REGISTRATION gate — the test is never registered
// rather than registered-and-abandoned. See tests/skip-visibility.test.js.

// Contract source: the invariant is stated in this file's own prior comment and
// corroborated by CLAUDE.md's "Marketplace Only" section, which distinguishes the
// CACHE directory (a clean copy of the installed plugin files) from the MARKETPLACES
// directory (the git clone) and tells a user to delete both to fix a stale install.
//
// The previous version of this test asserted NOTHING in either branch: absent cache
// logged and returned, present cache logged '(cache is clean copy, not git repo -
// expected behavior)' and returned. It PRINTED the invariant instead of checking it.
// Now it checks it. Registration is gated on the cache existing, because on a machine
// with no plugin cache the invariant is vacuous rather than skipped.
if (fs.existsSync(CACHE_DIR)) {
  test('Cache is a clean copy, not a git repository', () => {
    assert(
      !fs.existsSync(path.join(CACHE_DIR, '.git')),
      `Plugin cache must not be a git repository (the git clone belongs in the ` +
        `marketplaces dir). Found a .git inside ${CACHE_DIR}`
    );
  });
}

// Contract source: CLAUDE.md — "The VERSION file is the single source of truth for
// version numbers." src/lib/version.js reads it, src/scripts/release.js syncs from
// it, and tests/doc-counts.test.js and tests/release-metadata-sync.test.js depend on
// it existing. The previous `else` branch logged '(VERSION file not present,
// skipping)' and PASSED — encoding "a missing source-of-truth file is acceptable",
// which contradicts that contract. The semver assertion below is unchanged; only the
// escape hatch around it is gone.
test('VERSION file exists in source', () => {
  const versionFile = path.join(__dirname, '..', 'VERSION');
  assert(fs.existsSync(versionFile), `VERSION must exist at ${versionFile}`);
  const version = fs.readFileSync(versionFile, 'utf8').trim();
  assert(/^\d+\.\d+\.\d+$/.test(version), `VERSION should be semver format, got: ${version}`);
});

// Contract source: CLAUDE.md "Marketplace Only" — CTOC is always installed from
// https://github.com/robotijn/ctoc, never a local path.
//
// Honest accounting: this change buys NO new failure. By the invariant pinned
// directly above, a correct install has no .git under CACHE_DIR, so this body is
// unreachable in practice; and the marketplace rule it gestures at is already
// genuinely asserted by 'No local development paths in update script' below. The
// change is a repair of an INVISIBLE SKIP, not a strengthening — the `else` branch
// logged '(not a git repo, skipping)' and passed. The execSync call and its assertion
// are copied verbatim; only the gating moved from the body to the registration.
if (fs.existsSync(CACHE_DIR) && fs.existsSync(path.join(CACHE_DIR, '.git'))) {
  test('Git remote points to GitHub', () => {
    try {
      const remote = execSync('git remote get-url origin', {
        cwd: CACHE_DIR,
        encoding: 'utf8'
      }).trim();
      assert(
        remote.includes('github.com') && remote.includes('robotijn/ctoc'),
        `Remote should be robotijn/ctoc, got: ${remote}`
      );
    } catch (err) {
      throw new Error(`Failed to get git remote: ${err.message}`);
    }
  });
}

// Test: Update script exists
test('Update script is executable', () => {
  const updateScript = path.join(__dirname, '..', 'src', 'commands', 'update.js');
  assert(fs.existsSync(updateScript), 'update.js should exist');

  const content = fs.readFileSync(updateScript, 'utf8');
  // Check for git commands (may use -C flag for directory)
  assert(content.includes('fetch origin') || content.includes('git fetch'), 'Should use git fetch');
  assert(content.includes('reset --hard') || content.includes('git reset'), 'Should use git reset');
  assert(!content.includes('ctoc-public'), 'Should NOT reference local ctoc-public path');
});

// Test: No local path references
test('No local development paths in update script', () => {
  const updateScript = path.join(__dirname, '..', 'src', 'commands', 'update.js');
  const content = fs.readFileSync(updateScript, 'utf8');

  const badPatterns = [
    '/home/tijn/ctoc-build',
    'ctoc-public',
    '/ctoc-build/',
  ];

  for (const pattern of badPatterns) {
    assert(
      !content.includes(pattern),
      `Should not contain local path: ${pattern}`
    );
  }
});

// Test: Clone-or-fetch logic exists
test('Update script has clone-or-fetch logic', () => {
  const updateScript = path.join(__dirname, '..', 'src', 'commands', 'update.js');
  const content = fs.readFileSync(updateScript, 'utf8');

  assert(content.includes('git clone'), 'Should have git clone for fresh installs');
  assert(content.includes('.git'), 'Should check for .git directory');
  assert(content.includes('robotijn/ctoc.git') || content.includes('robotijn/ctoc'),
    'Clone URL should point to robotijn/ctoc');
});

// Test: Clone handles missing marketplace dir
test('Clone logic handles missing marketplace dir', () => {
  const updateScript = path.join(__dirname, '..', 'src', 'commands', 'update.js');
  const content = fs.readFileSync(updateScript, 'utf8');

  // Must check if .git exists before deciding clone vs fetch
  assert(content.includes("existsSync(path.join(MARKETPLACE_DIR, '.git'))"),
    'Should check for .git inside MARKETPLACE_DIR');
  // Must create dir with recursive option
  assert(content.includes('recursive: true'),
    'Should use recursive mkdir for marketplace dir');
  // Must remove broken dir before cloning
  assert(content.includes('rmSync'),
    'Should remove broken marketplace dir before cloning');
});

// Test: Error message is meaningful
test('Error message mentions GitHub', () => {
  const updateScript = path.join(__dirname, '..', 'src', 'commands', 'update.js');
  const content = fs.readFileSync(updateScript, 'utf8');

  assert(content.includes('Failed to fetch from GitHub'),
    'Error message should mention GitHub');
  assert(!content.match(/Failed to fetch\.\s*Check network/),
    'Should not have vague "Check network connection" without mentioning GitHub');
});

// Test: update.md locates update.js in both old and new cache layouts
test('update.md finds update.js in both old and new cache layouts', () => {
  const updateMd = path.join(__dirname, '..', 'src', 'commands', 'update.md');
  const content = fs.readFileSync(updateMd, 'utf8');

  // v6.9.37 replaced the zsh-fragile `ls -d <glob> <glob>` with a single
  // `find ... -path '*commands/update.js'`. That one pattern matches BOTH the
  // new layout (src/commands/update.js) and the legacy layout (commands/update.js),
  // because `*` spans the optional `src/` segment.
  assert(content.includes("find ~/.claude/plugins/cache/robotijn/ctoc"),
    'Should use find over the plugin cache dir (zsh-safe; no unmatched-glob abort)');
  assert(content.includes("-path '*commands/update.js'"),
    "Should match update.js via -path '*commands/update.js' (covers src/commands/ and legacy commands/)");
  assert(!content.includes('ls -d '),
    'Should not use `ls -d <glob>` — zsh aborts on an unmatched glob before any fallback runs');
});

// Test: update.md does not suppress errors
test('update.md does not suppress node errors', () => {
  const updateMd = path.join(__dirname, '..', 'src', 'commands', 'update.md');
  const content = fs.readFileSync(updateMd, 'utf8');

  // The node call should use 2>&1, not 2>/dev/null
  // Only the ls glob should suppress errors (2>/dev/null on ls is fine)
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.includes('node "$(') && line.includes('2>/dev/null')) {
      // 2>/dev/null on the ls inside $() is OK, but not on the outer node call
      // Check: the part after the closing ) should NOT have 2>/dev/null
      const afterSubshell = line.split(')"')[1] || '';
      assert(!afterSubshell.includes('2>/dev/null'),
        'node call should not suppress stderr with 2>/dev/null');
    }
  }
});

// Test: update.md has fallback message
test('update.md has fallback reinstall message', () => {
  const updateMd = path.join(__dirname, '..', 'src', 'commands', 'update.md');
  const content = fs.readFileSync(updateMd, 'utf8');

  assert(content.includes('Reinstall') || content.includes('reinstall'),
    'Should mention reinstall as fallback');
  assert(content.includes('plugin marketplace add'),
    'Should include marketplace add command in fallback');
});

console.log('# All update tests passed!');

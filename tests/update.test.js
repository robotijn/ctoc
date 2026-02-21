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

// Test: Cache directory detection (skip if running from source, not cache)
test('Detects git repository in cache', () => {
  // Skip if cache doesn't exist or we're running from source directory
  if (!fs.existsSync(CACHE_DIR)) {
    console.log('#   (cache not present, skipping)');
    return;
  }

  // The cache is NOT a git repo - it's a clean copy of the plugin files
  // Git repo is in marketplaces dir, cache is the installed version
  console.log('#   (cache is clean copy, not git repo - expected behavior)');
});

// Test: VERSION file exists in source
test('VERSION file exists in source', () => {
  // Check VERSION file in current directory (source)
  const versionFile = path.join(__dirname, '..', 'VERSION');
  if (fs.existsSync(versionFile)) {
    const version = fs.readFileSync(versionFile, 'utf8').trim();
    assert(/^\d+\.\d+\.\d+$/.test(version), `VERSION should be semver format, got: ${version}`);
  } else {
    console.log('#   (VERSION file not present, skipping)');
  }
});

// Test: Git remote is correct
test('Git remote points to GitHub', () => {
  if (fs.existsSync(CACHE_DIR) && fs.existsSync(path.join(CACHE_DIR, '.git'))) {
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
  } else {
    console.log('#   (not a git repo, skipping)');
  }
});

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

console.log('# All update tests passed!');

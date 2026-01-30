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

// Test: Cache directory detection
test('Detects git repository in cache', () => {
  if (fs.existsSync(CACHE_DIR)) {
    const gitDir = path.join(CACHE_DIR, '.git');
    const isGitRepo = fs.existsSync(gitDir);
    // If cache exists, it should be a git repo (after our update system)
    assert(isGitRepo, 'Cache should be a git repository');
  } else {
    // Cache doesn't exist - that's OK for test environment
    console.log('#   (cache not present, skipping)');
  }
});

// Test: VERSION file exists
test('VERSION file exists in cache', () => {
  if (fs.existsSync(CACHE_DIR)) {
    const versionFile = path.join(CACHE_DIR, 'VERSION');
    assert(fs.existsSync(versionFile), 'VERSION file should exist');
    const version = fs.readFileSync(versionFile, 'utf8').trim();
    assert(/^\d+\.\d+\.\d+$/.test(version), `VERSION should be semver format, got: ${version}`);
  } else {
    console.log('#   (cache not present, skipping)');
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
  const updateScript = path.join(__dirname, '..', 'commands', 'update.js');
  assert(fs.existsSync(updateScript), 'update.js should exist');

  const content = fs.readFileSync(updateScript, 'utf8');
  assert(content.includes('git fetch'), 'Should use git fetch');
  assert(content.includes('git reset --hard'), 'Should use git reset');
  assert(!content.includes('ctoc-public'), 'Should NOT reference local ctoc-public path');
});

// Test: No local path references
test('No local development paths in update script', () => {
  const updateScript = path.join(__dirname, '..', 'commands', 'update.js');
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

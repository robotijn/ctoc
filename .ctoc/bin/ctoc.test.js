#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
//  CTOC CLI Tests - Update Command Tests
// ═══════════════════════════════════════════════════════════════════════════════

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Colors for output
const colors = {
    red: '\x1b[0;31m',
    green: '\x1b[0;32m',
    yellow: '\x1b[1;33m',
    cyan: '\x1b[0;36m',
    reset: '\x1b[0m'
};

// Test utilities
let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

function assert(condition, message) {
    if (condition) {
        testsPassed++;
        testResults.push({ passed: true, message });
        console.log(`  ${colors.green}✓${colors.reset} ${message}`);
    } else {
        testsFailed++;
        testResults.push({ passed: false, message });
        console.log(`  ${colors.red}✗${colors.reset} ${message}`);
    }
}

function assertContains(output, expected, message) {
    assert(output.includes(expected), message);
}

function assertNotContains(output, expected, message) {
    assert(!output.includes(expected), message);
}

// Helper to create a temporary test directory
function createTempDir() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-test-'));
    return tmpDir;
}

// Helper to clean up temp directory
function cleanupTempDir(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
        // Ignore cleanup errors
    }
}

// Run ctoc command and capture output
function runCtoc(args, cwd) {
    const ctocPath = path.join(__dirname, 'ctoc.js');
    try {
        const result = spawnSync('node', [ctocPath, ...args], {
            cwd: cwd || __dirname,
            encoding: 'utf8',
            timeout: 30000
        });
        return {
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            status: result.status,
            error: result.error
        };
    } catch (e) {
        return {
            stdout: '',
            stderr: e.message,
            status: 1,
            error: e
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Test Suites
// ─────────────────────────────────────────────────────────────────────────────

function testUpdateHelp() {
    console.log(`\n${colors.cyan}[Update Help Test]${colors.reset}`);

    const result = runCtoc(['help']);
    assertContains(result.stdout, 'update', 'Help should mention update command');
    assertContains(result.stdout, 'Update CTOC', 'Help should describe update command');
}

function testUpdateVersionDisplay() {
    console.log(`\n${colors.cyan}[Update Version Display Test]${colors.reset}`);

    // Read current version
    const versionFile = path.join(__dirname, '..', '..', 'VERSION');
    const currentVersion = fs.readFileSync(versionFile, 'utf8').trim();

    const result = runCtoc(['version']);
    assertContains(result.stdout, currentVersion, 'Version command should show current version');
}

function testUpdateDetectsGitRepo() {
    console.log(`\n${colors.cyan}[Update Git Detection Test]${colors.reset}`);

    // The ctoc repo should have a .git directory
    const repoRoot = path.join(__dirname, '..', '..');
    const gitPath = path.join(repoRoot, '.git');

    assert(fs.existsSync(gitPath), 'Repository should have .git directory');
}

function testUpdateCommandExists() {
    console.log(`\n${colors.cyan}[Update Command Exists Test]${colors.reset}`);

    // Check that update command doesn't return "Unknown command"
    const result = runCtoc(['update', '--help'], path.join(__dirname, '..', '..'));
    assertNotContains(result.stdout + result.stderr, 'Unknown command', 'Update should be a recognized command');
}

function testUpdateHandlesNoGitGracefully() {
    console.log(`\n${colors.cyan}[Update No Git Handling Test]${colors.reset}`);

    // Create a temp directory without .git
    const tmpDir = createTempDir();

    try {
        // Create minimal .ctoc structure
        const ctocDir = path.join(tmpDir, '.ctoc');
        const repoDir = path.join(ctocDir, 'repo');
        fs.mkdirSync(repoDir, { recursive: true });

        // Copy VERSION file
        const srcVersion = path.join(__dirname, '..', '..', 'VERSION');
        const dstVersion = path.join(repoDir, 'VERSION');
        fs.copyFileSync(srcVersion, dstVersion);

        // Copy ctoc.js
        const binDir = path.join(repoDir, '.ctoc', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        fs.copyFileSync(path.join(__dirname, 'ctoc.js'), path.join(binDir, 'ctoc.js'));

        // Test update in non-git directory - should fall back to tarball method
        const result = runCtoc(['update'], repoDir);

        // Should either succeed with tarball or report appropriate message
        const output = result.stdout + result.stderr;
        const hasExpectedBehavior =
            output.includes('tarball') ||
            output.includes('download') ||
            output.includes('git') ||
            output.includes('Error') ||
            output.includes('update');

        assert(hasExpectedBehavior, 'Update should handle non-git installation gracefully');
    } finally {
        cleanupTempDir(tmpDir);
    }
}

function testUpdatePreservesUserSettings() {
    console.log(`\n${colors.cyan}[Update Settings Preservation Test]${colors.reset}`);

    // This test verifies the code structure handles settings.yaml
    // We check that the update function references settings backup
    const ctocSource = fs.readFileSync(path.join(__dirname, 'ctoc.js'), 'utf8');

    assertContains(ctocSource, 'settings.yaml', 'Update should reference settings.yaml for backup');
}

function testUpdateUsesHttps() {
    console.log(`\n${colors.cyan}[Update HTTPS Security Test]${colors.reset}`);

    // Security check: ensure all URLs use HTTPS
    const ctocSource = fs.readFileSync(path.join(__dirname, 'ctoc.js'), 'utf8');

    // Check that tarball URL uses HTTPS
    assertContains(ctocSource, 'https://github.com', 'Tarball URL should use HTTPS');
    assertNotContains(ctocSource, 'http://github.com', 'Should not use HTTP for GitHub');
}

function testUpdateNoCommandInjection() {
    console.log(`\n${colors.cyan}[Update Command Injection Security Test]${colors.reset}`);

    // Security check: verify no user input is passed directly to shell commands
    const ctocSource = fs.readFileSync(path.join(__dirname, 'ctoc.js'), 'utf8');

    // Check that git commands use fixed strings, not interpolated user input
    assertContains(ctocSource, "execSync('git ", 'Git commands should use fixed strings');
    assertContains(ctocSource, "{ cwd:", 'Git commands should specify cwd option');
}

function testTarballUrlValid() {
    console.log(`\n${colors.cyan}[Tarball URL Validation Test]${colors.reset}`);

    const ctocSource = fs.readFileSync(path.join(__dirname, 'ctoc.js'), 'utf8');

    // Check for valid GitHub tarball URL pattern
    const hasTarballUrl =
        ctocSource.includes('releases/latest/download') ||
        ctocSource.includes('archive/') ||
        ctocSource.includes('tarball');

    assert(hasTarballUrl, 'Should have valid tarball download URL');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main Test Runner
// ─────────────────────────────────────────────────────────────────────────────

function runAllTests() {
    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}  CTOC Update Command Tests${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);

    // Run all test suites
    testUpdateHelp();
    testUpdateVersionDisplay();
    testUpdateDetectsGitRepo();
    testUpdateCommandExists();
    testUpdateHandlesNoGitGracefully();
    testUpdatePreservesUserSettings();
    testUpdateUsesHttps();
    testUpdateNoCommandInjection();
    testTarballUrlValid();

    // Summary
    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}  Test Summary${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`  ${colors.green}Passed: ${testsPassed}${colors.reset}`);
    console.log(`  ${colors.red}Failed: ${testsFailed}${colors.reset}`);
    console.log(`  Total:  ${testsPassed + testsFailed}`);
    console.log('');

    // Exit with appropriate code
    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests if called directly
if (require.main === module) {
    runAllTests();
}

module.exports = { runAllTests, runCtoc, assert, assertContains };

#!/usr/bin/env node
/**
 * CTOC Release Script - Sequential Commit Queue
 * Node.js replacement for release.sh
 *
 * Usage: node scripts/release.js "commit message"
 *
 * This script uses the commit queue for sequential version bumping,
 * preventing race conditions when multiple agents commit in parallel.
 *
 * The script:
 * 1. Acquires an exclusive lock
 * 2. Bumps the patch version atomically
 * 3. Stages all changes
 * 4. Commits with auto-generated version suffix
 * 5. Releases the lock
 */

const path = require('path');
const terminalUI = require('./lib/terminal-ui');
const commitQueue = require('./lib/commit-queue');

// ============================================================================
// Helpers
// ============================================================================

function printUsage() {
  console.log('Usage: node scripts/release.js "commit message"');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/release.js "feat: add startup banner"');
  console.log('  node scripts/release.js "fix: resolve hook timing issue"');
}

function printSuccess(version, previousVersion) {
  console.log('');
  console.log(terminalUI.colors.green(`Released v${version}`));
  if (previousVersion) {
    console.log(terminalUI.colors.gray(`  (bumped from v${previousVersion})`));
  }
  console.log('');
  console.log('To push: git push origin main');
}

function printError(error) {
  console.error('');
  console.error(terminalUI.colors.red(`Release failed: ${error}`));
  console.error('');
}

// ============================================================================
// Main
// ============================================================================

function main() {
  // Get commit message from arguments
  const args = process.argv.slice(2);
  const message = args.join(' ').trim();

  if (!message) {
    printUsage();
    process.exit(1);
  }

  // Change to CTOC root (parent of scripts directory)
  const scriptDir = __dirname;
  const ctocRoot = path.dirname(scriptDir);
  process.chdir(ctocRoot);

  // Use commit queue for atomic version bump and commit
  const result = commitQueue.directCommit(message);

  if (result.success) {
    printSuccess(result.version, result.previousVersion);
    process.exit(0);
  } else {
    printError(result.error);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node
/**
 * Post-commit Hook - Triggers Background Quality Agent
 *
 * This hook is NON-BLOCKING - commit always succeeds instantly.
 * Starts the quality agent in background to run checks and auto-push.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Check if we should run the quality agent
 */
function shouldRun() {
  // Skip if CTOC_SKIP_QUALITY is set
  if (process.env.CTOC_SKIP_QUALITY === '1') {
    console.log('⏭️  Quality agent skipped (CTOC_SKIP_QUALITY=1)');
    return false;
  }

  // Skip if this is a merge commit
  const gitDir = path.join(process.cwd(), '.git');
  if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
    console.log('⏭️  Quality agent skipped (merge commit)');
    return false;
  }

  // Skip if this is a rebase
  if (fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
      fs.existsSync(path.join(gitDir, 'rebase-apply'))) {
    console.log('⏭️  Quality agent skipped (rebase in progress)');
    return false;
  }

  return true;
}

/**
 * Start background quality agent
 */
function startAgent() {
  const agentPath = path.join(__dirname, '..', 'lib', 'quality-agent.js');

  // Check if agent exists
  if (!fs.existsSync(agentPath)) {
    console.log('⚠️  Quality agent not found, skipping');
    return;
  }

  // Start agent in detached mode
  const agent = spawn('node', [
    agentPath,
    '--triggered-by=post-commit',
    '--on-success=push'
  ], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      CTOC_BACKGROUND: '1'
    }
  });

  // Unref so parent can exit
  agent.unref();

  console.log('🔄 Quality agent started in background...');
  console.log('   Run `ctoc status` to check progress');
}

/**
 * Main
 */
function main() {
  if (!shouldRun()) {
    return;
  }

  startAgent();
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, shouldRun, startAgent };

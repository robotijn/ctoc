#!/usr/bin/env node
/**
 * Post-commit Hook - Triggers Background Quality Agent
 *
 * This hook is NON-BLOCKING - commit always succeeds instantly.
 * Starts the quality agent in background to run the quality checks.
 *
 * It does NOT ship. Push is a human ship gate (R3-C): the agent is only told to
 * push when the human has explicitly set `git.autoPushEnabled`. Otherwise CTOC
 * checks and reports, and the human ships with /ctoc:push.
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
 * Build the quality agent's argument vector.
 *
 * SHIP GATE (R3-C): this hook is auto-installed into every fresh CTOC project and
 * used to hardcode `--on-success=push` — so a machine pushed on every green commit,
 * with no human in the loop and no setting that could stop it. The push flag is now
 * emitted ONLY when the human opened the gate (`git.autoPushEnabled`, default
 * false); otherwise the argv says `--on-success=none`, explicitly.
 *
 * (The agent re-checks the same gate itself, so a stale argv cannot ship either.)
 *
 * @param {string} [projectPath] - project root (defaults to the committing repo)
 * @returns {string[]} the argv passed to quality-agent.js
 */
function buildAgentArgs(projectPath = process.cwd()) {
  const { isAutoPushEnabled } = require('../lib/settings');
  const onSuccess = isAutoPushEnabled(projectPath) ? 'push' : 'none';
  return ['--triggered-by=post-commit', `--on-success=${onSuccess}`];
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
    ...buildAgentArgs(process.cwd())
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

module.exports = { main, shouldRun, startAgent, buildAgentArgs };

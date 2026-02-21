#!/usr/bin/env node
/**
 * Background Agent Status Checker - PostToolUse hook
 * Checks for pending .status files and prompts Claude to spawn agents.
 * Also checks quality gate state and injects failure context (Decision 17).
 * Runs after every tool use but exits fast (<10ms) when nothing is pending.
 */

const fs = require('fs');
const path = require('path');

const PLANS_DIR = path.join(process.cwd(), 'plans');

// Stages where background agents can be pending
const AGENT_STAGES = ['implementation', 'review', 'in-progress'];

// Map agent types to their agent definition files
const AGENT_DEFINITIONS = {
  'implementation-planner': 'agents/planning/implementation-planner.md',
  'review-preparer': 'agents/planning/review-preparer.md',
  'research-assistant': 'agents/planning/research-assistant.md',
  'iron-loop-integrator': 'agents/planning/iron-loop-integrator.md',
  'critic': 'agents/planning/critic.md'
};

function findPendingAgents() {
  const pending = [];

  for (const stage of AGENT_STAGES) {
    const stageDir = path.join(PLANS_DIR, stage);
    if (!fs.existsSync(stageDir)) continue;

    const files = fs.readdirSync(stageDir).filter(f => f.endsWith('.md.status'));

    for (const statusFile of files) {
      try {
        const statusPath = path.join(stageDir, statusFile);
        const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

        if (status.status === 'working') {
          // Check if stale (> 5 minutes = probably abandoned)
          const startTime = new Date(status.started).getTime();
          const elapsed = Date.now() - startTime;

          if (elapsed > 300000) {
            // Mark as timeout, don't prompt
            status.status = 'timeout';
            status.message = 'Agent timed out (no response after 5 minutes)';
            status.updatedAt = new Date().toISOString();
            fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
            continue;
          }

          const planFile = statusFile.replace('.status', '');
          const planPath = path.join(stageDir, planFile);

          pending.push({
            agent: status.agent,
            planPath,
            planFile,
            stage,
            message: status.message,
            elapsed: Math.round(elapsed / 1000)
          });
        }
      } catch {
        // Skip malformed status files
      }
    }
  }

  return pending;
}

/**
 * Check quality state and inject context on non-pass (Decision 17)
 * Reads .ctoc/quality-state/status.json and reports failures/warnings
 * to Claude so it can guide the user toward fixing issues.
 */
function checkQualityState() {
  const statusPath = path.join(process.cwd(), '.ctoc', 'quality-state', 'status.json');
  if (!fs.existsSync(statusPath)) return;

  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

    if (status.overallStatus === 'fail') {
      console.log('\n[QUALITY GATE FAILED] Background quality checks detected failures.');
      console.log(`Status: ${status.overallStatus}`);
      console.log(`Git HEAD: ${status.gitHead || 'unknown'}`);

      if (status.summary) {
        if (status.summary.tests?.failed > 0) {
          console.log(`  Tests: ${status.summary.tests.failed} failed`);
        }
        if (status.summary.lint?.errors > 0) {
          console.log(`  Lint: ${status.summary.lint.errors} errors`);
        }
        if (status.summary.typecheck?.errors > 0) {
          console.log(`  Typecheck: ${status.summary.typecheck.errors} errors`);
        }
        if (status.summary.security?.critical > 0 || status.summary.security?.high > 0) {
          console.log(`  Security: ${status.summary.security.critical || 0} critical, ${status.summary.security.high || 0} high`);
        }
      }

      // Show tier-level detail if available
      if (status.tiers) {
        for (const [tier, data] of Object.entries(status.tiers)) {
          if (data.status === 'fail') {
            console.log(`  ${tier}: FAILED`);
          }
        }
      }

      console.log('Fix issues and commit again to retry.');
    } else if (status.overallStatus === 'running') {
      // Optionally notify that checks are in progress
      const elapsed = status.lastRun?.startedAt
        ? Math.round((Date.now() - new Date(status.lastRun.startedAt).getTime()) / 1000)
        : 0;
      if (elapsed > 30) {
        console.log(`\n[QUALITY] Background quality checks running (${elapsed}s elapsed)...`);
      }
    }
  } catch {
    // Fail open -- do not block tool use
  }
}

function main() {
  try {
    // Check for pending plan agents
    const pending = findPendingAgents();

    if (pending.length > 0) {
      // Output context for Claude (stdout is injected into conversation)
      for (const p of pending) {
        const agentDef = AGENT_DEFINITIONS[p.agent];
        console.log(`\n[BACKGROUND AGENT PENDING] Agent "${p.agent}" is waiting to run on ${p.stage}/${p.planFile}.`);
        console.log(`Task: ${p.message}`);
        console.log(`Elapsed: ${p.elapsed}s since requested.`);
        if (agentDef) {
          console.log(`Agent definition: ${agentDef}`);
        }
        console.log(`Action: Use the Task tool to spawn a "${p.agent}" subagent for this plan.`);
        console.log(`After spawning, mark status as complete by running: node -e "require('./lib/background').markComplete('${p.planPath}', 'Agent spawned')"`);
      }
    }

    // Check quality gate state (Decision 17)
    checkQualityState();
  } catch (err) {
    // Fail open - don't block tool use
  }

  process.exit(0);
}

main();

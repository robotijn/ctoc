#!/usr/bin/env node
/**
 * Background Agent Status Checker - PostToolUse hook
 * Checks for pending .status files and prompts Claude to spawn agents.
 * Also checks quality gate state and injects failure context (Decision 17).
 * Runs after every tool use but exits fast (<10ms) when nothing is pending.
 */

const path = require('path');

const safeFs = require('../lib/safe-fs');
const version = require('../lib/version');

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

/**
 * THE LIVENESS BEACON (plan 00171).
 *
 * WHAT IT IS FOR. A second, INDEPENDENT witness to `.ctoc/logs/enforcement.json`.
 * The enforcement log answers "did the edit-protection hook record a decision?";
 * this beacon answers the strictly different question "did the hook system run in
 * this session AT ALL?". They diverge exactly when the enforcement hook is alive
 * but silent, which is the case plan 00170 could not tell apart from a dead hook
 * system. This hook is on the `PostToolUse` `*` matcher, so it fires on EVERY tool
 * call (Read, Bash, Grep, …) and cannot be starved by a session that is not
 * editing; it is outside every deny path, so a bug here can waste time but can
 * never forge a permission or drop a gate.
 *
 * WHY IT OVERWRITES rather than appends. Only the MOST RECENT beacon carries
 * information — it is a liveness stamp, not a log. An append on every tool call
 * would grow without bound for no benefit. `enforcement.json` remains the
 * append-only DECISION record; these are different artifacts with different jobs
 * and must never be merged.
 *
 * WHY IT IS SYNCHRONOUS. This file ends in `process.exit(0)`, which discards
 * pending ASYNCHRONOUS writes — a false-green defect class this repository fences
 * by name. An async beacon would be lost precisely often enough to look like an
 * outage, which is the very false alarm this programme exists to avoid.
 *
 * WHY NO VERSION COMPARISON IS PERFORMED HERE, and why the reader must not add
 * one. The beacon records `version` so the build is AVAILABLE to a future check,
 * but nothing compares it: detecting a stale session needs the INSTALLED plugin
 * version as a reference, and inside a development checkout `getVersion()` reads
 * the repository's own `VERSION` — legitimately AHEAD of the installed build while
 * anyone is developing (measured 6.13.54 in-tree against 6.13.30 installed). A
 * comparison against the repository's `VERSION` would therefore raise a false
 * alarm on every developer's machine, every day. The trustworthy installed-version
 * reference is the open question this slice deliberately leaves for the human to
 * schedule.
 *
 * FAIL-OPEN BY CONSTRUCTION. The write is wrapped in its own guard and swallows
 * any fault (an unwritable `.ctoc/state`, a full disk) so a beacon fault can never
 * suppress the pending-agent or quality-gate output that main() produces, nor stop
 * the hook exiting 0 — a PostToolUse hook must never block a tool call. This is the
 * same fail-open shape the rest of this hook already uses; it is a deliberate,
 * permanent exemption recorded in `.ctoc/false-green-baseline.json` (whitelist).
 *
 * @param {string} root - project root under which to write `.ctoc/state/hook-beacon.json`
 * @returns {void}
 */
function writeBeacon(root) {
  try {
    const stateDir = path.join(root, '.ctoc', 'state');
    if (!safeFs.existsSync(stateDir)) {
      safeFs.mkdirSync(stateDir, { recursive: true });
    }
    const record = { version: version.getVersion(), at: new Date().toISOString(), pid: process.pid };
    safeFs.writeFileSync(path.join(stateDir, 'hook-beacon.json'), JSON.stringify(record));
  } catch {
    // Fail open: a beacon fault must never break a tool call or suppress the
    // pending-agent / quality-gate output. Whitelisted in the false-green baseline.
  }
}

function findPendingAgents() {
  const pending = [];

  for (const stage of AGENT_STAGES) {
    const stageDir = path.join(PLANS_DIR, stage);
    if (!safeFs.existsSync(stageDir)) continue;

    const files = safeFs.readdirSync(stageDir).filter(f => f.endsWith('.md.status'));

    for (const statusFile of files) {
      try {
        const statusPath = path.join(stageDir, statusFile);
        const status = JSON.parse(safeFs.readFileSync(statusPath, 'utf8'));

        if (status.status === 'working') {
          // Check if stale (> 5 minutes = probably abandoned)
          const startTime = new Date(status.started).getTime();
          const elapsed = Date.now() - startTime;

          if (elapsed > 300000) {
            // Mark as timeout, don't prompt
            status.status = 'timeout';
            status.message = 'Agent timed out (no response after 5 minutes)';
            status.updatedAt = new Date().toISOString();
            safeFs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
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
  if (!safeFs.existsSync(statusPath)) return;

  try {
    const status = JSON.parse(safeFs.readFileSync(statusPath, 'utf8'));

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
  // The liveness beacon runs FIRST, before findPendingAgents() — which walks plans/
  // and can throw or be slow. The beacon's whole purpose is to record that the hook
  // ran, so it must not sit behind work that can fail. writeBeacon is self-guarded
  // (fail-open), so this call is strictly additive: it can never suppress the
  // pending-agent or quality-gate output below, nor stop the hook exiting 0.
  writeBeacon(process.cwd());

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

module.exports = { writeBeacon };

// Direct invocation: this file run as the PostToolUse `*` hook. Guarded so merely
// importing the module (e.g. from a test that mints beacon fixtures) never runs
// main() nor calls process.exit — mirroring src/hooks/PreToolUse.Edit.js. This
// changes NO behaviour when the file is run as a hook.
if (require.main === module) {
  main();
}

#!/usr/bin/env node
/**
 * CTOC stop-continuation-gate — Stop hook (Operating Lesson 15 enforcement)
 *
 * Makes autonomous building CONTINUE. When the human has authorized a BATCH of
 * work (N rounds / N plans / a queue), this hook BLOCKS a premature stop so the
 * agent drives the whole batch to completion — it allows the stop ONLY when the
 * batch is complete, a genuine FORK is registered (a decision that is the human's),
 * or the bounded block-budget is exhausted.
 *
 * I/O convention (Stop hook):
 *   - Exit 0 = ALLOW the stop (also the fail-open path).
 *   - Exit 2 = BLOCK the stop; stderr tells the agent to keep going.
 *
 * SAFETY: OPT-IN (inert with no active batch), FORK-AWARE (a pending fork allows
 * the stop for the human), BOUNDED (maxBlocks via continuation state), FAIL-OPEN
 * (any error -> exit 0), ESCAPABLE (`CTOC_SKIP_CONTINUATION=1` -> exit 0). It runs
 * NO subprocess and does near-zero work when no batch is active, so it is safe to
 * ship enabled for every marketplace user (unlike the opt-in stop-test-gate, which
 * runs the suite).
 */

const { findProjectRoot } = require('../lib/project-root');
const continuation = require('../lib/continuation');

function writeStderr(msg) {
  try { process.stderr.write(msg); } catch { /* swallow */ }
}

function main() {
  // 1. Per-session escape.
  if (process.env.CTOC_SKIP_CONTINUATION === '1') process.exit(0);

  // 2. Resolve project root (fail-open).
  let projectRoot;
  try { projectRoot = findProjectRoot(process.cwd()); } catch { process.exit(0); }
  if (!projectRoot) process.exit(0);

  // 3. Ask the continuation state whether building should continue.
  let decision;
  try { decision = continuation.shouldContinue(projectRoot); } catch { process.exit(0); }
  if (!decision || !decision.continue) process.exit(0); // no batch / fork / complete / exhausted

  // 4. There is authorized, unfinished, fork-free work — BLOCK the stop.
  try { continuation.recordBlock(projectRoot); } catch { /* best-effort bound */ }
  writeStderr(
    `\n[CTOC] continuation-gate BLOCKED stop: ${decision.reason}. ` +
    `CTOC is autonomous building — do NOT stop mid-batch. Drive the next unit to ` +
    `completion, checkpointing at each boundary. Stop ONLY when the batch is complete ` +
    `or a genuine fork needs the human's decision (register it with ` +
    `continuation.registerFork). Escape: CTOC_SKIP_CONTINUATION=1.\n`
  );
  process.exit(2);
}

module.exports = { main };

if (require.main === module) {
  main();
}

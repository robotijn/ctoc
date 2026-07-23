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
 *
 * DERIVED APPROVED-QUEUE CONTINUATION (slice 2 of the "when CTOC starts it must not
 * stop" mechanism). When the shipped explicit-batch gate declines to continue
 * *because there is NO explicit batch at all* (`continuation.status(root) === null`),
 * the hook consults the derived decision `continuation-queue.shouldContinueQueue`:
 * if approved, fork-free plans are waiting in `plans/todo/` (or a recoverable
 * `plans/in-progress/` plan), it blocks the premature idle stop (exit 2) with an
 * HONEST message naming how many wait. The `status === null` guard is the SAFETY
 * BOUNDARY: the derived regime NEVER overrides an explicit fork / complete /
 * exhausted decision — the two regimes never stack. This derived path is bounded by
 * the same MAX_QUEUE_BLOCKS budget (self-resetting on drain), fork-aware
 * (`registerQueueFork`), fail-open, and escapable — so an undrainable queue always
 * eventually stops. Reverting THIS file's diff fully disables the derived path and
 * returns the hook to its shipped explicit-batch-only behavior.
 */

const { findProjectRoot } = require('../lib/project-root');
const continuation = require('../lib/continuation');
const continuationQueue = require('../lib/continuation-queue');

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

  // 3. Ask the explicit-batch continuation state whether building should continue.
  let decision;
  try { decision = continuation.shouldContinue(projectRoot); } catch { process.exit(0); }
  if (!decision || !decision.continue) {
    // The explicit-batch gate declined. DERIVE from the approved queue ONLY when
    // there is NO explicit continuation state at all — never override an explicit
    // fork / complete / exhausted decision (those are the human's explicit batch
    // talking). This is the safety boundary that keeps the two regimes from stacking.
    let hasExplicit;
    try { hasExplicit = continuation.status(projectRoot) !== null; } catch { process.exit(0); }
    if (hasExplicit) process.exit(0); // an explicit batch decided; honor it

    let qDecision;
    try { qDecision = continuationQueue.shouldContinueQueue(projectRoot); } catch { process.exit(0); }
    if (!qDecision || !qDecision.continue) process.exit(0); // empty queue / fork / exhausted

    // Approved, fork-free work waits. Record a block (bounds the loop). WEDGE-1: if it
    // cannot be persisted, the bound cannot advance -> FAIL OPEN and allow the stop.
    let qPersisted;
    try { qPersisted = continuationQueue.recordQueueBlock(projectRoot, qDecision.depth); } catch { process.exit(0); }
    if (!qPersisted) process.exit(0);

    writeStderr(
      `\n[CTOC] continuation-gate BLOCKED stop: ${qDecision.depth} approved plan(s) ` +
      `are waiting to be built. CTOC is autonomous building — do NOT stop while approved, ` +
      `fork-free work waits. Drive the next approved plan to completion, checkpointing at ` +
      `each boundary. Stop ONLY when the approved queue is empty or a genuine fork needs ` +
      `the human (register it with continuationQueue.registerQueueFork). ` +
      `Escape: CTOC_SKIP_CONTINUATION=1.\n`
    );
    process.exit(2);
  }

  // 4. There is authorized, unfinished, fork-free work — record a block, then BLOCK the
  //    stop. WEDGE-1: if the block could NOT be persisted (unwritable state file / full
  //    disk), the bound cannot advance — so FAIL OPEN and allow the stop rather than
  //    block forever on a frozen counter.
  let persisted;
  try { persisted = continuation.recordBlock(projectRoot); } catch { process.exit(0); }
  if (!persisted) process.exit(0);
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

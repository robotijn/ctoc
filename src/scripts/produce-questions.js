#!/usr/bin/env node
'use strict';

/**
 * PQ2 — the BACKGROUND question-producer entry point (the generation half of
 * "precompute questions, never wait", [[feedback_precompute_questions_never_wait]]).
 *
 * This script is the GENUINE background root that makes `src/lib/streaming-producer.js`
 * reachable from a live root (Operating Lesson 16, [[principle_wired_is_done]]: a module
 * is done when a human can REACH it, not when its test passes). It is declared in
 * `.ctoc/reachability-roots.json` alongside the other background scripts, and it is
 * SPAWNED — detached, fire-and-forget — by `streaming-gate.maybeKickProduction` when a
 * human opens `/ctoc:menu` and a plan at a gate still needs its decision questions.
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────────────
 * `main(root)` drains `streaming-producer.produceAllNeeded(root, defaultDispatch)`:
 * for every plan currently at a gate whose precomputed questions are missing or stale,
 * it dispatches the stage-appropriate CTOC producer agent through the Claude CLI
 * (`claude -p` — the CTOC runtime, [[project_ctoc_runtime_is_claude_cli]]) and writes
 * the validated questions to the store. It NEVER fabricates a question and NEVER throws
 * (produceAllNeeded is fail-soft); a missing `claude` binary is a LOUD SKIP, not a crash.
 *
 * ── THE INJECTED-DISPATCH SEAM ──────────────────────────────────────────────────
 * `main(root, dispatch)` takes the producer dispatch as a parameter (default =
 * `defaultDispatch`), so a test drives the full drain with a deterministic fake — no
 * model, no spawn. The shipped path uses `defaultDispatch`.
 *
 * Cross-platform: `process.execPath` + `path.resolve`, no shell, no POSIX assumptions.
 */

const path = require('path');
const { produceAllNeeded, defaultDispatch } = require('../lib/streaming-producer');

/** The project root when invoked with no argument: two levels up from src/scripts/. */
const DEFAULT_ROOT = path.resolve(__dirname, '..', '..');

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Drain every plan that needs questions, generating each through `dispatch` (default:
 * the real `defaultDispatch`, which spawns the mapped CTOC producer agent). NEVER
 * throws: `produceAllNeeded` is fail-soft, and this wraps it defensively so the
 * detached child can only ever exit cleanly.
 *
 * @param {string} [root] project root (defaults to the CTOC repo root)
 * @param {(ref:string, planText:string, stage:string)=>Promise<Array<object>>} [dispatch]
 *   the producer seam — injected in tests, `defaultDispatch` in production
 * @returns {Promise<{attempted:number, written:number, skipped:Array<{ref:string, reason:string}>}>}
 */
async function main(root, dispatch = defaultDispatch) {
  const projectRoot = isNonEmptyString(root) ? root : DEFAULT_ROOT;
  try {
    return await produceAllNeeded(projectRoot, dispatch);
  } catch (err) {
    // Belt-and-suspenders: produceAllNeeded already never throws.
    return { attempted: 0, written: 0, skipped: [{ ref: null, reason: `unexpected: ${(err && err.message) || String(err)}` }] };
  }
}

// CHILD ENTRY: `spawn(execPath, [__filename, root], {detached:true})` runs here and
// always exits 0 — a failed background generation must never surface as a non-zero exit
// or a crash into the session that spawned it.
if (require.main === module) {
  main(process.argv[2])
    .then((res) => {
      try {
        console.log(`[produce-questions] attempted ${res.attempted}, wrote ${res.written}, skipped ${res.skipped.length}`);
      } catch { /* logging is best-effort */ }
      process.exit(0);
    })
    .catch(() => process.exit(0));
}

module.exports = { main };

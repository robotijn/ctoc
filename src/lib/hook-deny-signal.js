'use strict';
/**
 * CTOC PreToolUse deny signal — the SINGLE point of protocol truth (W01-s1, ADR-1).
 *
 * WHY THIS EXISTS. Finding C1 of the 2026-07-11 self-audit: every PreToolUse hook
 * signalled "block" with `process.exit(1)`, but the Claude Code harness only
 * BLOCKS a tool call on the deny protocol below — exit 1 prints the message and
 * lets the tool proceed (a cosmetic block, strictly worse than none because the
 * human trusts the "BLOCKED" banner). The deny protocol had been defined by
 * scattered `process.exit(N)` calls whose meaning lived only in tribal knowledge.
 * Centralising it here means every surface (Edit, Write via its delegate, and —
 * in later slices — Bash, MultiEdit, NotebookEdit) signals a deny IDENTICALLY,
 * and the protocol can only ever change in one place.
 *
 * THE PROTOCOL (Claude Code PreToolUse advanced JSON output).
 * A deny is the self-describing decision JSON written to STDOUT, with the process
 * exiting 0:
 *
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "PreToolUse",
 *       "permissionDecision": "deny",
 *       "permissionDecisionReason": "<why>"
 *     }
 *   }
 *
 * The decision travels as structured data on a channel orthogonal to the OS exit
 * code — so a hook can exit 0 (no OS-level error) while still explicitly telling
 * the harness "deny", removing the entire "which digit means what" class of bug.
 * This is safe because both editing hooks write their human banners to STDERR
 * (`src/lib/ui.js` writeToTerminal → process.stderr; PreToolUse.Edit.js block() →
 * process.stderr), so STDOUT carries ONLY the decision JSON — no banner corrupts
 * the harness's JSON parse.
 *
 * ALLOW is deliberately NOT expressed here. An allow stays exit-0-SILENT (no JSON):
 * an explicit `permissionDecision:"allow"` would force-bypass the permission
 * system (over-permit), whereas a silent exit 0 preserves the normal permission
 * flow. Only the DENY path emits JSON.
 *
 * FALLBACK. `HARNESS_BLOCK_EXIT_CODE` (2) documents the harness's hard-block exit
 * code. If a future/older installed harness is ever found to ignore the JSON
 * channel, the ONLY change needed is to swap the `exit(0)` in `emitDeny` for
 * `exit(HARNESS_BLOCK_EXIT_CODE)` — a single line, in one place.
 *
 * DEPENDENCY-FREE by contract: this module imports nothing first-party so it can
 * never fail to load the enforcement signal. Pure string/JSON + process streams;
 * no paths, no shell — cross-platform by construction.
 */

/**
 * The harness's hard-block exit code, documented so the fallback (and its test)
 * never uses a bare literal `2`. Primary protocol is the JSON channel + exit 0;
 * this is the one-line fallback swap inside `emitDeny`.
 * @type {number}
 */
const HARNESS_BLOCK_EXIT_CODE = 2;

/** Reason used when a caller passes an empty/undefined reason (no `undefined` leaks). */
const DEFAULT_REASON = 'CTOC enforcement: blocked';

/**
 * Build the Claude Code PreToolUse deny decision object. PURE — no I/O. This is
 * the shape every deny path shares and the shape the unit test pins.
 *
 * @param {string} reason - human/machine-readable reason (coerced to a string).
 * @returns {{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:string}}}
 */
function denyDecision(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: String(reason || DEFAULT_REASON),
    },
  };
}

/**
 * Emit a deny to the harness and terminate. Writes ONLY the deny decision JSON to
 * the stream (default `process.stdout`) then calls the exit function (default
 * `process.exit`) with `0` — the primary protocol. Never returns in production.
 *
 * `opts` exists ONLY so the unit test can capture the emitted JSON and the exit
 * code without killing the test process; production passes no `opts`.
 *
 * @param {string} reason - the deny reason (becomes `permissionDecisionReason`).
 * @param {{stream?:{write:(s:string)=>unknown}, exit?:(code:number)=>unknown}} [opts]
 * @returns {void}
 */
function emitDeny(reason, opts = {}) {
  const stream = opts.stream || process.stdout;
  const exit = typeof opts.exit === 'function' ? opts.exit : process.exit;
  stream.write(JSON.stringify(denyDecision(reason)));
  // Emit BOTH block signals so the deny is real under either harness reading:
  //   1. the structured JSON decision on stdout (advanced permission protocol), and
  //   2. exit code 2 — the harness's hard-block code.
  // A PreToolUse hook that exits 0 does NOT stop the tool; only exit 2 (or the JSON
  // deny) actually blocks. Exiting HARNESS_BLOCK_EXIT_CODE makes the block real and
  // OS-visible (a non-zero status) rather than cosmetic — findings C1/C2.
  return exit(HARNESS_BLOCK_EXIT_CODE);
}

module.exports = { HARNESS_BLOCK_EXIT_CODE, denyDecision, emitDeny };

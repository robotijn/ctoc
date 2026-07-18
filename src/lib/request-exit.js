'use strict';

/**
 * requestExit — end the process with a code WITHOUT discarding what it printed.
 *
 * THE DEFECT THIS EXISTS TO KILL. `process.exit(code)` terminates immediately. Writes
 * to a PIPE are asynchronous, so anything still sitting in the buffer at that moment
 * is thrown away. A process that prints a large report and then calls `process.exit`
 * therefore delivers only the first ~64KB — the pipe capacity — cut mid-line, and
 * loses precisely the tail: the summary, the coverage table, the verdict. Everything
 * a reader actually needs is printed LAST, which is exactly what gets dropped.
 *
 * It is invisible in normal use. A write to a TERMINAL is synchronous, so running the
 * program by hand shows the complete output every time. Only a pipe — that is, any
 * automated caller — reveals it.
 *
 * That is not hypothetical here. `src/scripts/test-gate.js` printed the whole suite
 * output, then `[CTOC test-gate] coverage 99.02% …`, then `PASS`, then called
 * `process.exit(0)`. Step 14 VERIFY captures that gate through a pipe, so it received
 * 63490 characters ending mid-sentence, never saw a coverage figure, and failed closed
 * with "no coverage figure was produced — unmeasured is NOT a pass". Correct
 * fail-closed behaviour over a truncated input: Gate 3 became un-passable for EVERY
 * plan, leaving the "Approve anyway" override as the only exit. An override that is
 * the only path is not a gate.
 *
 * THE FIX is to state the exit code and let Node exit on its own. Setting
 * `process.exitCode` records the intended status; Node then drains stdout/stderr and
 * exits with that code once the event loop empties. No output is lost and the status
 * is unchanged. This is the standard remedy, not a local invention — `process.exit` is
 * documented as unsafe when writes may still be pending.
 *
 * A BAD CODE FAILS LOUDLY. A non-integer is rejected with a throw rather than coerced,
 * because the failure mode of coercion here is the worst one available: `process.exitCode
 * = undefined` exits 0, silently converting a failing gate into a passing one.
 *
 * Cross-platform: no paths, no shell, no platform-specific behaviour.
 */

/**
 * Request process termination with `code`, preserving all buffered output.
 *
 * Sets `process.exitCode` and RETURNS — it does not terminate. The caller should
 * return from its own entry point afterwards; Node exits with `code` once the event
 * loop drains, by which time stdout and stderr have been flushed.
 *
 * @param {number} code - Integer exit status (0 = success).
 * @returns {void}
 * @throws {TypeError} When `code` is not an integer — never silently coerced, since
 *   a coerced bad code would exit 0 and turn a failure into a success.
 */
function requestExit(code) {
  if (!Number.isInteger(code)) {
    throw new TypeError(
      `requestExit: exit code must be an integer, received ${typeof code} (${String(code)}). ` +
      'Coercing it would risk exiting 0 and reporting a failure as a success.'
    );
  }
  process.exitCode = code;
}

module.exports = { requestExit };

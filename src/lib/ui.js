/**
 * CTOC UI Library — terminal colours and a terminal writer.
 *
 * That is the whole module, and it is deliberately that small. Until 2026-07-20 it
 * also carried five screen builders — `dashboard`, `progress`, `adminDashboard`,
 * `blocked` and `getPhase` — which were DELETED as unreachable.
 *
 * WHY THEY WENT. Nothing in the product called them. The only live requires of this
 * module are `src/hooks/PreToolUse.Bash.js` (`writeToTerminal`, `colors`) and
 * `src/hooks/SessionStart.js` (`writeToTerminal`), both static destructurings, so
 * there was no dynamic route to them either. Their only callers were their own
 * tests — and a test IS a caller, which is exactly why a green suite certified them
 * as healthy for years. A module is not done when its test passes; it is done when
 * a human can reach it, and no human reached these.
 *
 * The content confirmed the verdict independently. `blocked` printed
 * `THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.` for an enforcement path that has
 * long since moved to `src/hooks/PreToolUse.Edit.js`, which writes its own message.
 * `adminDashboard` rendered a seven-column board whose columns (`BACKLOG`,
 * `TECHNICAL`, `READY`) are not the pipeline's stages any more. `dashboard` and
 * `progress` rendered a TWO-gate model for a pipeline that has four. These were not
 * dormant utilities; they were a previous version of the product, kept alive by
 * its tests.
 *
 * They were also the last place in `src/` where a gate NUMBER reached a screen —
 * "Gate 1", "Gate 2" — which is CTOC's own internal code, undecodable by the person
 * reading it. Re-wording them was the obvious move and it would have been wrong: it
 * produces five correctly-phrased functions no human can reach, and leaves the
 * impression the wording problem was solved. `tests/ui.test.js` fences both the
 * absence of the five exports and the absence of any printable gate number here.
 */

// ANSI colors
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  magenta: '\x1b[0;35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m'
};

/**
 * Write to terminal (stderr for visibility).
 *
 * stderr, not stdout, is load-bearing: both hook callers emit a decision JSON on
 * stdout, and a human banner written there would corrupt it.
 *
 * @param {string} text
 */
function writeToTerminal(text) {
  process.stderr.write(text);
}

module.exports = {
  colors,
  writeToTerminal
};

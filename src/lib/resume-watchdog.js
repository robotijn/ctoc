'use strict';

/**
 * CTOC Durable Watchdog — resume a stalled autonomous run on the NEXT session open
 * (plan 00231, the buildable "resume-on-session-open" subset).
 *
 * The Stop gate (continuation.js + stop-continuation-gate.js) keeps an authorized
 * batch going while the session is ALIVE. A Stop hook cannot fire when the session is
 * idle, rate-limited, or closed — which is exactly the "ran out of tokens" case, the
 * gap this module closes. There is NO durable, code-armable scheduler in the Claude
 * command-line runtime (see the FEASIBILITY FINDING on plan 00231), and CTOC must
 * never spawn a second Claude, so the only honest resume point is the moment the human
 * OPENS A NEW SESSION. `SessionStart.js` calls into this module on every start.
 *
 * Both functions are PURE — no filesystem, no clock of their own, no side effects —
 * so they are fully deterministic and testable. `nowMs` is passed in; the stall
 * threshold is passed in via `opts` (SessionStart resolves it from settings). Both are
 * FAIL-OPEN: any malformed/missing state resolves to "do not resume" and NEVER throws.
 * A watchdog that crashes, or that resumes a run the human paused, is worse than one
 * that stays quiet — so every ambiguous state errs toward the quiet, no-resume verdict.
 */

/**
 * Default stall threshold: 90 minutes, matching the dead-agent window the sweep uses.
 * It gates resume so a batch the human is ACTIVELY driving (a fresh `lastAdvanceMs`)
 * is not re-injected on a quick session restart — only a genuinely idle run resumes.
 */
const DEFAULT_STALL_MINUTES = 90;

/**
 * Resolve the stall threshold in minutes from caller options, falling back to the
 * 90-minute default for any absent / non-finite / non-positive value.
 * @param {{stallMinutes?: number}} [opts]
 * @returns {number} a positive number of minutes
 */
function resolveStallMinutes(opts) {
  const v = opts ? Number(opts.stallMinutes) : NaN;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_STALL_MINUTES;
}

/**
 * Decide whether a stalled batch should be auto-resumed on session open.
 *
 * `resume: true` ONLY when ALL hold:
 *   - the state is a live object with `active === true`;
 *   - no fork is pending (`forkPending` falsy) — a registered fork is the human's
 *     decision and must never be auto-driven;
 *   - `remaining` is a finite number > 0 (a complete batch never resumes);
 *   - `lastAdvanceMs` is a finite timestamp (else staleness cannot be measured);
 *   - `nowMs` is a finite clock read;
 *   - the idle age (`nowMs - lastAdvanceMs`) EXCEEDS the stall threshold. Exactly AT
 *     the threshold is treated as still-fresh (strict `>`), so a batch right at the
 *     boundary is not resumed until it has genuinely gone idle past it.
 *
 * Every other state resolves to `resume: false` with a naming reason, and any thrown
 * error (e.g. a state object with a throwing getter) is caught and also resolves to
 * `resume: false` — the watchdog NEVER propagates.
 *
 * @param {Object} batchState - the continuation batch state (from continuation.status).
 * @param {number} nowMs - the current time in epoch milliseconds.
 * @param {{stallMinutes?: number}} [opts] - stall threshold override (minutes).
 * @returns {{resume: boolean, reason: string}}
 */
function shouldResume(batchState, nowMs, opts = {}) {
  try {
    if (!batchState || typeof batchState !== 'object' || Array.isArray(batchState)) {
      return { resume: false, reason: 'no active batch' };
    }
    if (batchState.active !== true) {
      return { resume: false, reason: 'batch inactive' };
    }
    if (batchState.forkPending) {
      return { resume: false, reason: 'fork pending — the human owns this decision' };
    }
    const remaining = Number(batchState.remaining);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return { resume: false, reason: 'batch complete' };
    }
    // A real advance stamp is a positive epoch-ms number. Coercing here would turn
    // null/'' into 0 (a 1970 stamp that always reads "stalled") — so require a genuine
    // positive number and reject anything else as "no timestamp".
    const lastAdvanceMs = batchState.lastAdvanceMs;
    if (typeof lastAdvanceMs !== 'number' || !Number.isFinite(lastAdvanceMs) || lastAdvanceMs <= 0) {
      return { resume: false, reason: 'no advance timestamp to measure staleness' };
    }
    const now = Number(nowMs);
    if (!Number.isFinite(now)) {
      return { resume: false, reason: 'invalid clock — cannot measure staleness' };
    }
    const stallMs = resolveStallMinutes(opts) * 60 * 1000;
    const ageMs = now - lastAdvanceMs;
    if (ageMs <= stallMs) {
      return { resume: false, reason: 'batch advanced recently — not stalled' };
    }
    const label = String(batchState.label || 'batch');
    return {
      resume: true,
      reason: `stalled ${Math.round(ageMs / 60000)} min — ${remaining} unit(s) still to drive in "${label}"`,
    };
  } catch {
    // FAIL-OPEN: a watchdog that throws must never be what stops (or wrongly resumes) a run.
    return { resume: false, reason: 'watchdog error — failing open (no resume)' };
  }
}

/**
 * The exact "drive the next unit" directive to inject when `shouldResume` is true.
 *
 * It names the batch LABEL and the remaining COUNT in the human's own terms and
 * carries NO plan number, NO gate number, NO filesystem path, and NO secret — the same
 * discipline the stale-scan enum follows for anything rendered back to the human. The
 * label is the human-authored batch name passed to `continuation.startBatch`.
 *
 * FAIL-OPEN: a malformed state falls back to generic wording ("batch", "the
 * remaining"); a state that throws on property access yields '' (nothing injected)
 * rather than propagating.
 *
 * @param {Object} batchState - the continuation batch state.
 * @returns {string} the directive text (leading newline), or '' on a throwing state.
 */
function resumeDirective(batchState) {
  try {
    const st = batchState && typeof batchState === 'object' ? batchState : {};
    const label = String(st.label || 'batch');
    const remaining = Number(st.remaining);
    const count = Number.isFinite(remaining) && remaining > 0 ? String(remaining) : 'the remaining';
    return `
## Resume the interrupted run — the authorization still stands

You authorized "${label}" and ${count} unit(s) are still unfinished, with no
decision awaiting you. This run went idle (tokens, a rate limit, or a closed
session) before it finished. Drive the next unit now and continue to the end of the
run; do not ask whether to continue — pick up exactly where it stalled.
`;
  } catch {
    return '';
  }
}

module.exports = {
  shouldResume,
  resumeDirective,
};

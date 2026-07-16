'use strict';

/**
 * Streaming build renderer + key handler — STANDALONE (streaming interaction model,
 * slice 1 — MVP heartbeat).
 *
 * Per the owner's direction change ("make CTOC streaming, fuck the menu"), this is the
 * PRIMARY streaming interface, NOT a menu area/tab. It is deliberately decoupled from
 * `src/commands/menu.js` and the area system: it exposes a plain `{ render, handleKey }`
 * pair over a host-supplied `app` object, plus the temporary in-memory `exampleTopics`
 * seed and `initBuildFlow` helper. It depends ONLY on:
 *   - `./streaming-flow`  — the pure state machine (the real logic lives there);
 *   - `./tui`             — shared colour + footer + control-char sanitizer helpers.
 * It performs NO file I/O and never switches menu tabs.
 *
 * Keys (owner-approved consistent lowercase — advertised keys ALL work this slice):
 *   <digit>  pick the option with that key  → records the answer + advances
 *   c        comment                        → records a placeholder comment + advances
 *                                             (a real free-text capture is a later slice;
 *                                             this is a NON-silent working stub, not a
 *                                             dead key — it sets app.message)
 *   b        back                           → emits app.streamAction = 'back'
 *   s        settings                       → emits app.streamAction = 'settings'
 * `b` / `s` emit an INTENT onto the host `app` (app.streamAction) rather than driving
 * any menu navigation — the host process decides what "back" / "settings" mean. Any key
 * that does nothing this slice is NOT advertised and is a genuine no-op (returns false).
 *
 * FUTURE-SLICE SEAM: `exampleTopics()` is the throwaway in-memory question source so the
 * screen is REAL and drivable now. A later slice swaps it for the real source by
 * replacing the single `exampleTopics()` call inside `initBuildFlow`.
 */

const { c, line, renderFooter, stripCtl } = require('./tui');
const streamingFlow = require('./streaming-flow');

/**
 * Minimal in-memory seed: 2 topics, ONE marked critical, each with 2-3 questions and
 * a recommended option — enough to make the streaming screen real and drivable this
 * slice. `auth` is critical and listed second so `orderTopics` visibly reorders it to
 * the front. NOT the real question source — see the module seam note above.
 * @returns {Array<object>}
 */
function exampleTopics() {
  return [
    {
      id: 'stack',
      label: 'Stack',
      critical: false,
      questions: [
        {
          id: 'lang',
          prompt: 'Which primary language should this project use?',
          options: [
            { key: '1', label: 'TypeScript', recommended: true },
            { key: '2', label: 'Python' },
          ],
        },
        {
          id: 'db',
          prompt: 'Which database should back the app?',
          options: [
            { key: '1', label: 'PostgreSQL', recommended: true },
            { key: '2', label: 'SQLite' },
          ],
        },
      ],
    },
    {
      id: 'auth',
      label: 'Authentication',
      critical: true,
      questions: [
        {
          id: 'provider',
          prompt: 'Which authentication provider should the app use?',
          options: [
            { key: '1', label: 'Clerk', recommended: true },
            { key: '2', label: 'Auth.js' },
            { key: '3', label: 'Custom (roll your own)' },
          ],
        },
        {
          id: 'mfa',
          prompt: 'Should multi-factor authentication be required?',
          options: [
            { key: '1', label: 'Yes — require MFA', recommended: true },
            { key: '2', label: 'No — password only' },
          ],
        },
      ],
    },
  ];
}

/**
 * Attach a fresh, ordered flow state onto the host as `app.buildFlow`, seeded from the
 * example topics. A later slice swaps `exampleTopics()` here for the real source.
 * @param {object} app host state object
 * @returns {object} the created flow state
 */
function initBuildFlow(app) {
  app.buildFlow = streamingFlow.initFlow(exampleTopics());
  return app.buildFlow;
}

/** Ensure `app.buildFlow` exists, seeding it lazily if the host has not. */
function ensureFlow(app) {
  if (!app.buildFlow) initBuildFlow(app);
  return app.buildFlow;
}

/**
 * Render the current streaming step: topic label + progress + one question + its
 * options (recommended one marked), or a completion summary when everything is
 * answered. All model-supplied text is control-char sanitized (`stripCtl`) before it
 * reaches the terminal. Always shows the working-keys footer.
 * @param {object} app host state object (uses/seeds `app.buildFlow`)
 * @returns {string}
 */
function render(app) {
  const state = ensureFlow(app);

  let out = '\n';
  out += `${c.bold}Build${c.reset}\n\n`;

  if (streamingFlow.isComplete(state)) {
    out += `  ${c.green}✓${c.reset} all topics answered\n\n`;
    out += line() + '\n';
    // Only b/s work on the completion screen; nothing to pick or comment on.
    out += renderFooter(['b back', 's settings']);
    return out;
  }

  const topic = streamingFlow.currentTopic(state);
  const question = streamingFlow.currentQuestion(state);
  const p = streamingFlow.progress(state);
  const recKey = streamingFlow.recommendedKey(question);

  out += `  ${c.cyan}${stripCtl(topic.label)}${c.reset}  ${c.dim}topic ${p.topicIndex + 1}/${p.topicCount}${c.reset}\n\n`;
  out += `  ${stripCtl(question.prompt)}\n\n`;
  for (const opt of question.options) {
    const mark = opt.key === recKey ? `   ${c.green}✓ recommended${c.reset}` : '';
    out += `    ${c.cyan}${stripCtl(opt.key)}${c.reset}  ${stripCtl(opt.label)}${mark}\n`;
  }

  out += '\n' + line() + '\n';
  // CONSISTENT lowercase keys — every advertised key works this slice.
  out += renderFooter(['<n> pick', 'c comment', 'b back', 's settings']);
  return out;
}

/**
 * Handle a keystroke against the streaming flow. Returns true iff the key was consumed
 * (the host re-renders). Non-mutating with respect to the prior flow state: a recorded
 * answer replaces `app.buildFlow` with the NEW state from `streamingFlow.answer`.
 * @param {{sequence?: string, name?: string}} key readline-style key event
 * @param {object} app host state object
 * @returns {boolean}
 */
function handleKey(key, app) {
  const seq = key ? (key.sequence || key.name) : undefined;
  if (!seq) return false;

  const state = ensureFlow(app);

  // Navigation intents — work on every screen (including the completion summary).
  // These emit an intent for the host to act on; no menu-tab coupling.
  if (seq === 'b') { app.streamAction = 'back'; return true; }
  if (seq === 's') { app.streamAction = 'settings'; return true; }

  // Nothing left to answer → picks/comments are inert (and unadvertised) when complete.
  if (streamingFlow.isComplete(state)) return false;

  const question = streamingFlow.currentQuestion(state);

  // Comment: record a placeholder free-text answer and advance. NON-silent working
  // stub — a real capture is a later slice; this sets a visible status message so the
  // human sees it happen (never a dead key).
  if (seq === 'c') {
    app.buildFlow = streamingFlow.answer(state, '(comment)');
    app.message = 'Comment recorded';
    return true;
  }

  // Digit picks the option whose key matches. A digit that matches no option is a
  // genuine no-op (returns false) — unadvertised behavior is never silently swallowed.
  if (/^[0-9]$/.test(seq) && question && Array.isArray(question.options)) {
    const opt = question.options.find(o => o && o.key === seq);
    if (opt) {
      app.buildFlow = streamingFlow.answer(state, opt.key);
      return true;
    }
  }

  return false;
}

module.exports = { render, handleKey, exampleTopics, initBuildFlow };

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
const streamingTopics = require('./streaming-topics');

/**
 * Minimal in-memory seed: 2 topics, ONE marked critical, each with a recommended
 * option — enough to make the streaming screen real and drivable this slice. Two
 * orderings are made OBSERVABLE by construction:
 *   - `auth` is the critical TOPIC and listed second so `orderTopics` reorders it front;
 *   - within `auth`, the `session` QUESTION is `critical` and authored AFTER the normal
 *     `provider`, with `mfa` marked `important` — so `orderQuestions` visibly pulls the
 *     critical to the front (session → mfa → provider) and criticals surface first.
 * NOT the real question source — see the module seam note above.
 * @returns {Array<object>}
 */
function exampleTopics() {
  return [
    {
      id: 'stack',
      label: 'Stack',
      critical: false,
      // Five NON-critical questions, each with a recommended option. This is enough
      // that an all-recommended manual run (which carries a streak of 2 out of the
      // Authentication topic — mfa + provider) reaches the DEFAULT_BATCH_THRESHOLD (5)
      // with pending questions still remaining, so the batch-approve offer is
      // reachable in a short real session.
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
        {
          id: 'framework',
          prompt: 'Which web framework should the app use?',
          options: [
            { key: '1', label: 'Next.js', recommended: true },
            { key: '2', label: 'Remix' },
          ],
        },
        {
          id: 'styling',
          prompt: 'Which styling approach should the app use?',
          options: [
            { key: '1', label: 'Tailwind CSS', recommended: true },
            { key: '2', label: 'CSS Modules' },
          ],
        },
        {
          id: 'hosting',
          prompt: 'Where should the app be deployed?',
          options: [
            { key: '1', label: 'Vercel', recommended: true },
            { key: '2', label: 'Self-hosted' },
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
          // NORMAL — authored first, but ordered AFTER the critical below.
          id: 'provider',
          prompt: 'Which authentication provider should the app use?',
          options: [
            { key: '1', label: 'Clerk', recommended: true },
            { key: '2', label: 'Auth.js' },
            { key: '3', label: 'Custom (roll your own)' },
          ],
        },
        {
          // CRITICAL — authored AFTER a normal question so critical-first ordering is
          // visible: session-token storage is a load-bearing security decision.
          id: 'session',
          critical: true,
          prompt: 'Where should session tokens be stored?',
          options: [
            { key: '1', label: 'httpOnly, Secure cookie', recommended: true },
            { key: '2', label: 'localStorage' },
          ],
        },
        {
          // IMPORTANT — a lighter tier than critical, above normal.
          id: 'mfa',
          important: true,
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
 * Attach a fresh, ordered flow state onto the host as `app.buildFlow`. REAL topics
 * take precedence: `streamingTopics.loadTopics(app.projectPath)` is tried FIRST and,
 * when it returns a non-empty valid `topics[]` from
 * `<projectPath>/.ctoc/streaming/topics.json`, the flow seeds from the file. When the
 * file is absent, unreadable, unparseable, invalid, or `app.projectPath` is missing,
 * `loadTopics` returns null (fail-soft, never throws) and we fall back to the in-memory
 * `exampleTopics()` seed exactly as before. This is the side-effecty init (I/O allowed);
 * `render()`/`handleKey()` stay pure of file access.
 *
 * A later slice (the vision-decomposer WRITING topics.json from an idea) produces the
 * real source this consumes; the `exampleTopics()` fall-back keeps the screen drivable
 * until then.
 * @param {object} app host state object (uses `app.projectPath` for the real source)
 * @returns {object} the created flow state
 */
function initBuildFlow(app) {
  const realTopics = streamingTopics.loadTopics(app && app.projectPath);
  const topics = (Array.isArray(realTopics) && realTopics.length > 0) ? realTopics : exampleTopics();
  app.buildFlow = streamingFlow.initFlow(topics);
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
/**
 * Render the BATCH PREVIEW screen: every pending non-critical question that a
 * batch-approve would auto-answer, shown as `<prompt> → <recommended label>
 * (recommended)`. Criticals and no-recommended questions are excluded by
 * `pendingBatchQuestions`, so they can never appear here. All model text is
 * control-char sanitized. The footer's keys all work (see `handleKey`).
 * @param {object} state FlowState
 * @returns {string}
 */
function renderBatchPreview(state) {
  const pending = streamingFlow.pendingBatchQuestions(state);

  let out = '\n';
  out += `${c.bold}Build — batch approve${c.reset}\n\n`;
  out += `  ${c.dim}these ${pending.length} non-critical question(s) will take their recommended option:${c.reset}\n\n`;
  for (const q of pending) {
    const recKey = streamingFlow.recommendedKey(q);
    const opt = (q.options || []).find(o => o && o.key === recKey);
    const label = opt ? opt.label : recKey;
    out += `    ${stripCtl(q.prompt)} ${c.dim}→${c.reset} ${c.green}${stripCtl(label)}${c.reset} ${c.dim}(recommended)${c.reset}\n`;
  }

  out += '\n' + line() + '\n';
  // Every advertised key works: a approves, a digit exits to answer individually, b backs out.
  out += renderFooter(['a approve all', '<n> revisit individually', 'b back']);
  return out;
}

function render(app) {
  const state = ensureFlow(app);

  // Batch preview is a HOST UI mode (app.batchPreview), NOT part of the pure flow
  // state — it overlays the question screen until the human approves or backs out.
  if (app.batchPreview) return renderBatchPreview(state);

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

  // Header: topic label + progress, plus a "⚠ N critical open" marker whenever the
  // current topic still has unanswered critical questions (owner's rule: criticals first).
  const critOpen = streamingFlow.criticalOpenCount(state);
  const critMarker = critOpen > 0 ? `  ${c.red}⚠ ${critOpen} critical open${c.reset}` : '';
  out += `  ${c.cyan}${stripCtl(topic.label)}${c.reset}  ${c.dim}topic ${p.topicIndex + 1}/${p.topicCount}${c.reset}${critMarker}\n\n`;

  // Current question, surfaced by tier. CRITICAL carries a "⚠ CRITICAL k/N" label
  // (k = its position among the topic's criticals, N = total criticals) plus a note
  // that criticals are answered one at a time and are NOT part of the batch. IMPORTANT
  // gets a lighter marker; NORMAL renders plainly. All prompts are control-char stripped.
  const tier = streamingFlow.questionTier(question);
  const prompt = stripCtl(question.prompt);
  if (tier === 'critical') {
    const criticals = topic.questions.filter(q => streamingFlow.questionTier(q) === 'critical');
    const total = criticals.length;
    const k = criticals.indexOf(question) + 1;
    out += `  ${c.red}⚠ CRITICAL ${k}/${total}${c.reset} — ${prompt}\n`;
    out += `  ${c.dim}criticals come first — one at a time, not batchable${c.reset}\n\n`;
  } else if (tier === 'important') {
    out += `  ${c.yellow}IMPORTANT${c.reset} — ${prompt}\n\n`;
  } else {
    out += `  ${prompt}\n\n`;
  }
  for (const opt of question.options) {
    const mark = opt.key === recKey ? `   ${c.green}✓ recommended${c.reset}` : '';
    out += `    ${c.cyan}${stripCtl(opt.key)}${c.reset}  ${stripCtl(opt.label)}${mark}\n`;
  }

  // Batch-approve offer: only surfaced (and only advertised) when the streak has
  // reached the threshold AND non-critical questions with a recommended option remain.
  // Owner's rule: the streak counts NON-critical recommended picks; criticals are
  // never part of the batch, so this line never appears while a critical is current.
  const batchAvail = streamingFlow.batchAvailable(state);
  const footerKeys = ['<n> pick', 'c comment'];
  if (batchAvail) {
    out += `\n  ${c.green}recommendation taken ${state.recommendedStreak}×${c.reset} → ${c.cyan}a${c.reset} batch-approve the rest\n`;
    footerKeys.push('a batch');
  }
  // Next-topic fast-forward: advertised ONLY when it actually works — a next topic
  // exists AND the current topic's criticals are cleared. Never shown while a
  // critical is open (the human must resolve criticals first).
  if (streamingFlow.canFastForward(state)) {
    footerKeys.push('n next topic');
  }
  footerKeys.push('b back', 's settings');

  out += '\n' + line() + '\n';
  // CONSISTENT lowercase keys — every advertised key works this slice.
  out += renderFooter(footerKeys);
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

  // BATCH PREVIEW mode (app.batchPreview) intercepts keys before anything else so its
  // `b` means "back out of the preview" (not the global back intent). All three keys
  // work — none is dead:
  //   a       → approve every pending non-critical with its recommended option;
  //   <digit> → exit the preview to answer the questions individually (no approval);
  //   b       → exit the preview without approving.
  if (app.batchPreview) {
    if (seq === 'a') {
      app.buildFlow = streamingFlow.batchApprove(state);
      app.batchPreview = false;
      app.message = 'Batch approved — remaining non-critical questions took their recommended option';
      return true;
    }
    if (/^[0-9]$/.test(seq)) {
      app.batchPreview = false;
      app.message = 'Revisit — answer each question individually';
      return true;
    }
    if (seq === 'b') { app.batchPreview = false; return true; }
    return false; // any other key is an unadvertised no-op inside the preview
  }

  // Navigation intents — work on every screen (including the completion summary).
  // These emit an intent for the host to act on; no menu-tab coupling.
  if (seq === 'b') { app.streamAction = 'back'; return true; }
  if (seq === 's') { app.streamAction = 'settings'; return true; }

  // Nothing left to answer → picks/comments are inert (and unadvertised) when complete.
  if (streamingFlow.isComplete(state)) return false;

  // Open the batch preview only when the offer is actually available (the `a` key is
  // advertised on the question screen only under that same condition, so this is never
  // a dead key). When unavailable, `a` falls through to a genuine no-op.
  if (seq === 'a' && streamingFlow.batchAvailable(state)) {
    app.batchPreview = true;
    return true;
  }

  // Next-topic fast-forward. `n` (the letter — distinct from a digit pick) advances
  // past the current topic's remaining NON-critical questions to the next topic, but
  // ONLY when `canFastForward` (a next topic exists AND the topic's criticals are
  // cleared). The key is advertised on the question screen only under that condition.
  // A stray `n` when it cannot fast-forward is a NON-silent no-op: it never advances
  // past a critical (or off the last topic) and sets a status message so the human
  // sees why nothing happened — never a dead key, never a crash. In the batch preview
  // this block is unreachable (the preview intercepts keys above), so `n` there is an
  // unadvertised no-op that stays in the preview.
  if (seq === 'n') {
    if (streamingFlow.canFastForward(state)) {
      app.buildFlow = streamingFlow.nextTopic(state);
      app.message = 'Skipped to next topic';
      return true;
    }
    app.message = streamingFlow.criticalOpenCount(state) > 0
      ? 'Resolve the critical issue first'
      : 'No next topic to skip to';
    return true;
  }

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

'use strict';

/**
 * Tests for the STANDALONE streaming renderer + key handler (streaming interaction
 * model, slice 1). Per the owner's direction change ("make CTOC streaming, fuck the
 * menu") this is NOT a menu area/tab — it is a self-contained render + handleKey pair
 * over a host `app` object, decoupled from src/commands/start.js and the area system.
 *
 * The keys `b` back and `s` settings emit an INTENT onto `app.streamAction` for the
 * host to act on (no menu-tab coupling). Written RED first, then implemented to green.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const render = require('../src/lib/streaming-render');
const flow = require('../src/lib/streaming-flow');

// Strip ANSI so assertions match on visible text only.
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Slice 2 changed the empty-state default: with NO real topics on disk, the screen is
// the IDEA PROMPT (idea dump), not the canned demo. The demo is now reached explicitly
// (the `b` key from idea mode / the CLI-absent fallback). These mechanics tests drive
// the demo topics directly — exactly the state a `b` press produces — so the demo
// render/handleKey behavior stays covered.
function seedDemo(app) {
  app.ideaMode = false;
  app.buildFlow = flow.initFlow(render.exampleTopics());
  return app.buildFlow;
}

// ---------------------------------------------------------------------------
// example seed
// ---------------------------------------------------------------------------
test('exampleTopics seeds 2 topics, one critical, each with a recommended option', () => {
  const topics = render.exampleTopics();
  assert.equal(topics.length, 2);
  assert.equal(topics.filter(t => t.critical).length, 1);
  for (const t of topics) {
    assert.ok(t.questions.length >= 2);
    for (const q of t.questions) {
      assert.ok(q.options.some(o => o.recommended === true), `${t.id}/${q.id} has a recommended option`);
    }
  }
});

test('initBuildFlow with NO real topics enters idea mode (idea prompt), not the demo', () => {
  const app = {};
  render.initBuildFlow(app);
  assert.equal(app.ideaMode, true, 'the empty-state default is the idea prompt');
  assert.equal(app.ideaBuffer, '', 'a fresh idea buffer is created');
  assert.ok(!app.buildFlow, 'no flow attached until a real decomposition (or the demo) lands');
});

test('the demo seed (via seedDemo / the b key) attaches an ordered critical-first flow', () => {
  const app = {};
  seedDemo(app);
  assert.ok(app.buildFlow);
  // critical-first: the critical topic must be first
  assert.equal(flow.currentTopic(app.buildFlow).critical, true);
});

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
test('render on a fresh app with no real topics shows the idea prompt (not the demo)', () => {
  const app = {};
  const out = plain(render.render(app));
  assert.equal(app.ideaMode, true, 'render seeds the idea-prompt empty state');
  assert.ok(out.toLowerCase().includes('dump your idea'), 'the idea prompt is shown');
  assert.ok(!out.includes('Authentication'), 'not the canned demo');
});

test('render lazily initializes the demo flow when app.buildFlow is seeded via the demo', () => {
  const app = {};
  seedDemo(app);
  const out = render.render(app);
  assert.ok(app.buildFlow, 'render drives the seeded flow');
  assert.ok(typeof out === 'string' && out.length > 0);
});

test('render shows the topic label, a progress indicator, and the question prompt', () => {
  const app = {};
  seedDemo(app);
  const topic = flow.currentTopic(app.buildFlow);
  const question = flow.currentQuestion(app.buildFlow);
  const out = plain(render.render(app));
  assert.ok(out.includes(topic.label), 'shows topic label');
  assert.ok(out.includes('topic 1/2'), 'shows progress indicator');
  assert.ok(out.includes(question.prompt), 'shows question prompt');
});

test('render marks the recommended option with a ✓ recommended tag', () => {
  const app = {};
  seedDemo(app);
  const out = plain(render.render(app));
  assert.ok(out.includes('✓ recommended'), 'recommended marker present');
  // Exactly one option in the current question is marked.
  const matches = out.match(/✓ recommended/g) || [];
  assert.equal(matches.length, 1);
});

test('render footer advertises ONLY keys that work this slice', () => {
  const app = {};
  seedDemo(app);
  const out = plain(render.render(app));
  assert.ok(out.includes('<n> pick'), 'pick advertised');
  assert.ok(out.includes('c comment'), 'comment advertised');
  assert.ok(out.includes('b back'), 'back advertised');
  assert.ok(out.includes('s settings'), 'settings advertised');
});

test('render shows an "all topics answered" summary when complete', () => {
  const app = {};
  seedDemo(app);
  // answer everything
  let guard = 0;
  while (!flow.isComplete(app.buildFlow) && guard++ < 50) {
    app.buildFlow = flow.answer(app.buildFlow, flow.recommendedKey(flow.currentQuestion(app.buildFlow)));
  }
  const out = plain(render.render(app));
  assert.ok(out.toLowerCase().includes('all topics answered'), 'completion summary shown');
});

test('render strips control characters from model-supplied text', () => {
  const app = {};
  app.buildFlow = flow.initFlow([
    {
      id: 't', label: 'Ho\x1b[2Jstile', critical: true,
      questions: [{ id: 'q', prompt: 'pr\x07ompt', options: [{ key: '1', label: 'la\x1bbel', recommended: true }] }],
    },
  ]);
  const out = render.render(app);
  assert.ok(!out.includes('\x1b[2J'), 'clear-screen sequence stripped from label');
  assert.ok(!out.includes('\x07'), 'bell stripped from prompt');
});

// ---------------------------------------------------------------------------
// handleKey
// ---------------------------------------------------------------------------
test('handleKey with a valid option digit records the answer and advances', () => {
  const app = {};
  seedDemo(app);
  const before = app.buildFlow;
  const topic = flow.currentTopic(before);
  const question = flow.currentQuestion(before);
  const consumed = render.handleKey({ sequence: '2' }, app);
  assert.equal(consumed, true);
  assert.equal(app.buildFlow.answers[`${topic.id}/${question.id}`], '2');
  // advanced: pointer moved off the first question
  assert.notEqual(flow.currentQuestion(app.buildFlow), question);
  // pure: the prior state object is untouched
  assert.deepEqual(before.answers, {});
});

test('handleKey "c" records a comment NON-silently and advances', () => {
  const app = {};
  seedDemo(app);
  const topic = flow.currentTopic(app.buildFlow);
  const question = flow.currentQuestion(app.buildFlow);
  const consumed = render.handleKey({ sequence: 'c' }, app);
  assert.equal(consumed, true);
  const recorded = app.buildFlow.answers[`${topic.id}/${question.id}`];
  assert.ok(typeof recorded === 'string' && recorded.length > 0, 'a comment string was recorded');
  assert.ok(app.message && app.message.length > 0, 'a non-silent status message was set');
});

test('handleKey "b" emits a back intent (not a dead key)', () => {
  const app = {};
  seedDemo(app);
  const consumed = render.handleKey({ sequence: 'b' }, app);
  assert.equal(consumed, true);
  assert.equal(app.streamAction, 'back');
});

test('handleKey "s" emits a settings intent (not a dead key)', () => {
  const app = {};
  seedDemo(app);
  const consumed = render.handleKey({ sequence: 's' }, app);
  assert.equal(consumed, true);
  assert.equal(app.streamAction, 'settings');
});

test('handleKey ignores an unadvertised / non-matching key (no-op, not consumed)', () => {
  const app = {};
  seedDemo(app);
  const before = app.buildFlow;
  const consumed = render.handleKey({ sequence: 'z' }, app);
  assert.equal(consumed, false);
  assert.equal(app.buildFlow, before, 'state unchanged');
});

test('handleKey ignores a digit that matches no option (no-op)', () => {
  const app = {};
  seedDemo(app);
  const before = app.buildFlow;
  // '9' is not an option key in the seed
  const consumed = render.handleKey({ sequence: '9' }, app);
  assert.equal(consumed, false);
  assert.equal(app.buildFlow, before);
});

test('handleKey seeds the flow lazily if the host has not initialized it', () => {
  const app = {};
  const consumed = render.handleKey({ sequence: 'b' }, app);
  assert.ok(app.buildFlow, 'flow seeded on first key');
  assert.equal(consumed, true);
});

test('handleKey returns false for a keyless / empty event', () => {
  const app = {};
  seedDemo(app);
  assert.equal(render.handleKey({}, app), false);
  assert.equal(render.handleKey(null, app), false);
});

// ===========================================================================
// SLICE: CRITICAL-FIRST surfacing in the renderer.
// The header shows "⚠ <n> critical open" while criticals are unanswered; a
// critical question renders a "⚠ CRITICAL k/N" label + a not-batchable note.
// ===========================================================================

// A topic with a critical question authored AFTER a normal one, plus an
// important one — mirrors the owner's rule so ordering + surfacing are visible.
function criticalSeed() {
  return [
    {
      id: 'auth', label: 'Authentication', critical: true,
      questions: [
        { id: 'provider', prompt: 'Auth provider?', options: [{ key: '1', label: 'Clerk', recommended: true }, { key: '2', label: 'Auth.js' }] },
        { id: 'session', critical: true, prompt: 'Where are session tokens stored?', options: [{ key: '1', label: 'httpOnly cookie', recommended: true }, { key: '2', label: 'localStorage' }] },
        { id: 'mfa', important: true, prompt: 'Require MFA?', options: [{ key: '1', label: 'Yes', recommended: true }, { key: '2', label: 'No' }] },
      ],
    },
  ];
}

test('header shows "⚠ N critical open" while a topic has unanswered criticals', () => {
  const app = {};
  app.buildFlow = flow.initFlow(criticalSeed());
  const out = plain(render.render(app));
  assert.ok(out.includes('⚠ 1 critical open'), 'critical-open marker present in header');
});

test('header hides the critical-open marker once all criticals in the topic are answered', () => {
  const app = {};
  app.buildFlow = flow.initFlow(criticalSeed());
  // The critical question ('session') is presented FIRST — answer it.
  assert.equal(flow.currentQuestion(app.buildFlow).id, 'session');
  app.buildFlow = flow.answer(app.buildFlow, '1');
  const out = plain(render.render(app));
  assert.ok(!out.includes('critical open'), 'marker gone after the only critical is answered');
});

test('a critical question renders the ⚠ CRITICAL k/N label and the not-batchable note', () => {
  const app = {};
  app.buildFlow = flow.initFlow(criticalSeed());
  const out = plain(render.render(app));
  assert.ok(out.includes('⚠ CRITICAL 1/1'), 'critical label with k/N position');
  assert.ok(out.includes('Where are session tokens stored?'), 'critical prompt shown');
  assert.ok(out.toLowerCase().includes('not batchable'), 'not-batchable note shown');
});

test('an important question renders a lighter IMPORTANT marker (no critical label)', () => {
  const app = {};
  app.buildFlow = flow.initFlow(criticalSeed());
  // Order: session (critical) → mfa (important) → provider (normal). Answer the critical.
  app.buildFlow = flow.answer(app.buildFlow, '1');
  assert.equal(flow.currentQuestion(app.buildFlow).id, 'mfa');
  const out = plain(render.render(app));
  assert.ok(out.includes('IMPORTANT'), 'important marker present');
  assert.ok(!out.includes('⚠ CRITICAL'), 'no critical label on an important question');
  assert.ok(out.includes('Require MFA?'), 'important prompt shown');
});

test('a normal question renders without any tier marker', () => {
  const app = {};
  app.buildFlow = flow.initFlow(criticalSeed());
  // Answer critical then important → land on the normal 'provider' question.
  app.buildFlow = flow.answer(app.buildFlow, '1'); // session
  app.buildFlow = flow.answer(app.buildFlow, '1'); // mfa
  assert.equal(flow.currentQuestion(app.buildFlow).id, 'provider');
  const out = plain(render.render(app));
  assert.ok(!out.includes('⚠ CRITICAL'), 'no critical label on a normal question');
  assert.ok(!out.includes('IMPORTANT'), 'no important marker on a normal question');
  assert.ok(!out.includes('critical open'), 'no critical-open header once criticals are done');
  assert.ok(out.includes('Auth provider?'), 'normal prompt shown');
});

test('critical label/header text is still control-char stripped', () => {
  const app = {};
  app.buildFlow = flow.initFlow([
    {
      id: 't', label: 'Ho\x1b[2Jstile', critical: true,
      questions: [{ id: 'q', critical: true, prompt: 'pr\x07ompt', options: [{ key: '1', label: 'la\x1bbel', recommended: true }] }],
    },
  ]);
  const out = render.render(app);
  assert.ok(out.includes('⚠ CRITICAL'), 'critical label rendered');
  assert.ok(!out.includes('\x1b[2J'), 'clear-screen sequence stripped');
  assert.ok(!out.includes('\x07'), 'bell stripped from a critical prompt');
});

// ---------------------------------------------------------------------------
// exampleTopics seed now demonstrates ordering: the Authentication topic has a
// critical question authored AFTER a normal one, plus an important question.
// ---------------------------------------------------------------------------
test('exampleTopics: Authentication has a critical question authored after a normal one', () => {
  const topics = render.exampleTopics();
  const auth = topics.find(t => t.id === 'auth');
  assert.ok(auth, 'auth topic present');
  const tiers = auth.questions.map(q => flow.questionTier(q));
  assert.ok(tiers.includes('critical'), 'auth has a critical question');
  assert.ok(tiers.includes('important'), 'auth has an important question');
  // critical is authored AFTER a normal one (a normal precedes the first critical in source)
  const firstCritical = tiers.indexOf('critical');
  assert.ok(tiers.slice(0, firstCritical).includes('normal'), 'a normal question precedes the critical in source order');
});

test('exampleTopics demo seed presents the critical question first', () => {
  const app = {};
  seedDemo(app);
  assert.equal(flow.questionTier(flow.currentQuestion(app.buildFlow)), 'critical');
});

// ===========================================================================
// SLICE: BATCH-APPROVE mechanic (renderer).
// The question screen advertises `a batch-approve the rest` ONLY when
// streamingFlow.batchAvailable is true; pressing `a` opens a preview listing the
// pending non-critical Q→recommended pairs; `a` in preview approves, `b` exits,
// a digit exits to answer individually. Criticals are never listed.
// ===========================================================================

// A single non-critical topic with three recommended questions — enough pending
// items to preview once a streak is seeded.
function batchSeed() {
  return [
    {
      id: 'stack', label: 'Stack', critical: false, questions: [
        { id: 'q1', prompt: 'q1 prompt?', options: [{ key: '1', label: 'One', recommended: true }, { key: '2', label: 'Two' }] },
        { id: 'q2', prompt: 'q2 prompt?', options: [{ key: '1', label: 'One', recommended: true }, { key: '2', label: 'Two' }] },
        { id: 'q3', prompt: 'q3 prompt?', options: [{ key: '1', label: 'One', recommended: true }, { key: '2', label: 'Two' }] },
      ],
    },
  ];
}

test('the batch offer line and key are hidden when batch is not available', () => {
  const app = {};
  seedDemo(app);
  const out = plain(render.render(app));
  assert.ok(!out.includes('batch-approve'), 'no batch offer at start');
  assert.ok(!out.includes('a batch'), 'no batch key advertised at start');
});

test('the batch offer line + key appear once the streak reaches the threshold with pending items', () => {
  const app = { buildFlow: { ...flow.initFlow(batchSeed()), recommendedStreak: 5 } };
  const out = plain(render.render(app));
  assert.ok(out.includes('batch-approve'), 'offer line advertised');
  assert.ok(out.includes('5'), 'offer shows the streak count');
  assert.ok(out.includes('a batch'), 'batch key advertised in the footer');
});

test('pressing a when batch is available opens the preview listing pending Q→recommended pairs', () => {
  const app = { buildFlow: { ...flow.initFlow(batchSeed()), recommendedStreak: 5 } };
  const consumed = render.handleKey({ sequence: 'a' }, app);
  assert.equal(consumed, true);
  assert.equal(app.batchPreview, true);
  const out = plain(render.render(app));
  assert.ok(out.includes('q1 prompt?'), 'lists q1');
  assert.ok(out.includes('q2 prompt?'), 'lists q2');
  assert.ok(out.includes('q3 prompt?'), 'lists q3');
  assert.ok(out.includes('One'), 'shows the recommended option label');
  assert.ok(out.toLowerCase().includes('recommended'), 'marks the pairs as recommended');
  assert.ok(out.includes('approve all'), 'preview footer offers approve all');
});

test('pressing a when batch is NOT available is a no-op (a is not advertised)', () => {
  const app = {};
  seedDemo(app);
  const before = app.buildFlow;
  assert.equal(render.handleKey({ sequence: 'a' }, app), false);
  assert.equal(app.buildFlow, before, 'state unchanged');
  assert.ok(!app.batchPreview, 'no preview opened');
});

test('pressing a in the preview approves all pending questions and closes the preview', () => {
  const app = { buildFlow: { ...flow.initFlow(batchSeed()), recommendedStreak: 5 }, batchPreview: true };
  const consumed = render.handleKey({ sequence: 'a' }, app);
  assert.equal(consumed, true);
  assert.equal(app.batchPreview, false);
  assert.equal(app.buildFlow.answers['stack/q1'], '1');
  assert.equal(app.buildFlow.answers['stack/q2'], '1');
  assert.equal(app.buildFlow.answers['stack/q3'], '1');
  assert.ok(app.message && app.message.length > 0, 'a non-silent status message was set');
});

test('pressing b in the preview exits WITHOUT approving', () => {
  const app = { buildFlow: { ...flow.initFlow(batchSeed()), recommendedStreak: 5 }, batchPreview: true };
  const consumed = render.handleKey({ sequence: 'b' }, app);
  assert.equal(consumed, true);
  assert.equal(app.batchPreview, false);
  assert.deepEqual(app.buildFlow.answers, {}, 'nothing approved');
});

test('pressing a digit in the preview exits to answer individually (no approval)', () => {
  const app = { buildFlow: { ...flow.initFlow(batchSeed()), recommendedStreak: 5 }, batchPreview: true };
  const consumed = render.handleKey({ sequence: '2' }, app);
  assert.equal(consumed, true);
  assert.equal(app.batchPreview, false);
  assert.deepEqual(app.buildFlow.answers, {}, 'nothing approved on revisit');
  assert.ok(app.message && app.message.toLowerCase().includes('revisit'), 'revisit status message set');
});

test('an unadvertised key in the preview is a no-op that stays in the preview', () => {
  const app = { buildFlow: { ...flow.initFlow(batchSeed()), recommendedStreak: 5 }, batchPreview: true };
  assert.equal(render.handleKey({ sequence: 'z' }, app), false);
  assert.equal(app.batchPreview, true, 'stays in preview');
});

test('a critical question is never listed in the batch preview', () => {
  const seed = [
    {
      id: 'auth', label: 'Auth', critical: true, questions: [
        { id: 'crit', critical: true, prompt: 'critical question?', options: [{ key: '1', label: 'Safe', recommended: true }] },
        { id: 'q1', prompt: 'normal one?', options: [{ key: '1', label: 'One', recommended: true }, { key: '2', label: 'Two' }] },
        { id: 'q2', prompt: 'normal two?', options: [{ key: '1', label: 'One', recommended: true }, { key: '2', label: 'Two' }] },
      ],
    },
  ];
  let bf = flow.initFlow(seed);
  bf = flow.answer(bf, '1'); // answer the critical (presented first) → pointer in the non-critical tail
  const app = { buildFlow: { ...bf, recommendedStreak: 5 }, batchPreview: true };
  const out = plain(render.render(app));
  assert.ok(!out.includes('critical question?'), 'critical prompt not in the preview');
  assert.ok(out.includes('normal one?'), 'non-critical listed');
  assert.ok(out.includes('normal two?'), 'non-critical listed');
});

test('the preview strips control characters from prompts and labels', () => {
  const seed = [
    {
      id: 't', label: 't', critical: false, questions: [
        { id: 'q1', prompt: 'pr\x1b[2Jompt', options: [{ key: '1', label: 'la\x07bel', recommended: true }, { key: '2', label: 'b' }] },
      ],
    },
  ];
  const app = { buildFlow: { ...flow.initFlow(seed), recommendedStreak: 5 }, batchPreview: true };
  const out = render.render(app);
  assert.ok(!out.includes('\x1b[2J'), 'clear-screen sequence stripped from a preview prompt');
  assert.ok(!out.includes('\x07'), 'bell stripped from a preview label');
});

// ---------------------------------------------------------------------------
// exampleTopics: a batch is reachable in a short all-recommended manual run.
// ---------------------------------------------------------------------------
test('exampleTopics: an all-recommended run reaches a batch offer under the default threshold', () => {
  const app = {};
  seedDemo(app);
  let guard = 0;
  // Drive recommended picks until the batch becomes available (or everything is answered).
  while (!flow.batchAvailable(app.buildFlow) && !flow.isComplete(app.buildFlow) && guard++ < 50) {
    const rec = flow.recommendedKey(flow.currentQuestion(app.buildFlow));
    app.buildFlow = flow.answer(app.buildFlow, rec);
  }
  assert.equal(flow.batchAvailable(app.buildFlow), true, 'a batch becomes reachable with all-recommended picks');
});

// ===========================================================================
// SLICE: NEXT-TOPIC fast-forward (renderer).
// The footer advertises `n next topic` ONLY when streamingFlow.canFastForward is
// true (the current topic's criticals are cleared AND a next topic exists).
// Pressing `n` then advances to the next topic. While a critical is open, `n` is
// NOT advertised and a stray press is a non-silent no-op (a status message,
// never a crash or a dead key). `n` (letter) never collides with a digit pick.
// ===========================================================================

test('footer does NOT advertise "n next topic" while a critical is open', () => {
  const app = {};
  seedDemo(app); // seed points at the critical `session` question
  assert.ok(flow.criticalOpenCount(app.buildFlow) > 0);
  const out = plain(render.render(app));
  assert.ok(!out.includes('n next topic'), 'no next-topic key while a critical is open');
});

test('footer advertises "n next topic" once criticals are cleared and a next topic exists', () => {
  const app = {};
  seedDemo(app);
  assert.equal(flow.questionTier(flow.currentQuestion(app.buildFlow)), 'critical');
  app.buildFlow = flow.answer(app.buildFlow, '1'); // answer the critical `session`
  assert.equal(flow.criticalOpenCount(app.buildFlow), 0);
  assert.equal(flow.currentTopic(app.buildFlow).id, 'auth'); // still on auth; next topic (stack) exists
  const out = plain(render.render(app));
  assert.ok(out.includes('n next topic'), 'next-topic key advertised once criticals clear');
});

test('pressing "n" when canFastForward advances to the next topic', () => {
  const app = {};
  seedDemo(app);
  app.buildFlow = flow.answer(app.buildFlow, '1'); // clear the critical
  assert.equal(flow.canFastForward(app.buildFlow), true);
  const consumed = render.handleKey({ sequence: 'n' }, app);
  assert.equal(consumed, true);
  assert.equal(flow.currentTopic(app.buildFlow).id, 'stack');
  assert.ok(app.message && app.message.length > 0, 'a non-silent status message was set');
});

test('pressing "n" while a critical is open is a non-silent no-op (message set, no advance past the critical)', () => {
  const app = {};
  seedDemo(app);
  const before = app.buildFlow;
  assert.ok(flow.criticalOpenCount(before) > 0);
  const consumed = render.handleKey({ sequence: 'n' }, app);
  assert.equal(consumed, true); // consumed → host re-renders and shows the message
  assert.equal(app.buildFlow, before, 'flow state unchanged (never fast-forward past a critical)');
  assert.ok(app.message && app.message.toLowerCase().includes('critical'), 'explains why it did nothing');
});

test('pressing "n" on the last topic (no next topic) is a non-silent no-op', () => {
  const app = {};
  seedDemo(app);
  // Answer all of auth (session, mfa, provider) → roll to stack (the last topic).
  app.buildFlow = flow.answer(app.buildFlow, '1'); // session (critical)
  app.buildFlow = flow.answer(app.buildFlow, '1'); // mfa (important)
  app.buildFlow = flow.answer(app.buildFlow, '1'); // provider (normal) → stack/lang
  assert.equal(flow.currentTopic(app.buildFlow).id, 'stack');
  assert.equal(flow.canFastForward(app.buildFlow), false);
  const before = app.buildFlow;
  const consumed = render.handleKey({ sequence: 'n' }, app);
  assert.equal(consumed, true);
  assert.equal(app.buildFlow, before, 'no advance on the last topic');
  assert.ok(app.message && app.message.length > 0, 'a non-silent message was set');
});

test('a DIGIT still picks the option even when "n next topic" is available (no collision)', () => {
  const app = {};
  seedDemo(app);
  app.buildFlow = flow.answer(app.buildFlow, '1'); // clear critical → n becomes available
  assert.equal(flow.canFastForward(app.buildFlow), true);
  const topic = flow.currentTopic(app.buildFlow);
  const question = flow.currentQuestion(app.buildFlow);
  const consumed = render.handleKey({ sequence: '1' }, app);
  assert.equal(consumed, true);
  assert.equal(app.buildFlow.answers[`${topic.id}/${question.id}`], '1'); // digit PICKED, did not fast-forward
});

test('"n" inside the batch preview is an unadvertised no-op that stays in the preview', () => {
  const app = { buildFlow: { ...flow.initFlow(batchSeed()), recommendedStreak: 5 }, batchPreview: true };
  const consumed = render.handleKey({ sequence: 'n' }, app);
  assert.equal(consumed, false);
  assert.equal(app.batchPreview, true, 'still in preview; n is not a preview action');
});

// ---------------------------------------------------------------------------
// initBuildFlow — REAL topics seed vs. the IDEA-PROMPT empty state
//   (streaming, slice 1 REAL DATA + slice 2 in-flow idea dump)
//
// initBuildFlow tries streamingTopics.loadTopics(app.projectPath) FIRST; if it returns
// a non-empty valid topics[], the flow seeds from the file (ideaMode false). When there
// are NO real topics (absent / invalid / no projectPath), the empty state is the IDEA
// PROMPT (ideaMode true, ideaBuffer ''), NOT the canned demo — the demo is reached
// explicitly via the `b` key / the CLI-absent fallback.
// ---------------------------------------------------------------------------
const os = require('os');
const path = require('path');
const nodeFs = require('fs');

function withTempProject(fn) {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'streaming-render-'));
  try { return fn(root); }
  finally { try { nodeFs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

function writeRealTopics(root, raw) {
  const dir = path.join(root, '.ctoc', 'streaming');
  nodeFs.mkdirSync(dir, { recursive: true });
  nodeFs.writeFileSync(path.join(dir, 'topics.json'), raw, 'utf8');
}

test('initBuildFlow seeds from REAL topics.json when present and valid', () => {
  withTempProject((root) => {
    const real = [
      {
        id: 'realtopic', label: 'Real Topic', critical: true,
        questions: [
          { id: 'realq', prompt: 'A real question from disk?', options: [
            { key: '1', label: 'Yes', recommended: true }, { key: '2', label: 'No' },
          ] },
        ],
      },
    ];
    writeRealTopics(root, JSON.stringify(real));
    const app = { projectPath: root };
    render.initBuildFlow(app);
    // first topic/question come from the FILE, not the example seed; no idea prompt
    assert.ok(!app.ideaMode, 'real topics drive; the idea prompt is not entered');
    assert.equal(flow.currentTopic(app.buildFlow).id, 'realtopic');
    assert.equal(flow.currentQuestion(app.buildFlow).id, 'realq');
  });
});

test('initBuildFlow enters idea mode (idea prompt) when topics.json is ABSENT', () => {
  withTempProject((root) => {
    const app = { projectPath: root };
    render.initBuildFlow(app);
    assert.equal(app.ideaMode, true, 'no real topics → the idea prompt, not the demo');
    assert.ok(!app.buildFlow, 'no demo flow attached at init');
  });
});

test('initBuildFlow enters idea mode when topics.json is INVALID', () => {
  withTempProject((root) => {
    writeRealTopics(root, JSON.stringify([{ id: 'x', label: 'X' }])); // no questions array → invalid
    const app = { projectPath: root };
    render.initBuildFlow(app);
    assert.equal(app.ideaMode, true, 'an invalid file is fail-soft null → the idea prompt');
  });
});

test('initBuildFlow enters idea mode when app.projectPath is absent (no crash)', () => {
  const app = {};
  render.initBuildFlow(app);
  assert.equal(app.ideaMode, true);
});

// ===========================================================================
// SLICE 2: the IN-FLOW IDEA DUMP UX.
// With no real topics, the empty state is the idea prompt. Printable keys append to
// the buffer (echoed in the render); Backspace edits; Enter calls decompose (injected
// via app.decompose) — ok:true reloads real topics and exits idea mode, a no-cli
// result falls back to the demo with a non-silent message, other failures stay in idea
// mode with an error message; `b` (empty buffer) loads the demo. All echoed text is
// control-char stripped.
// ===========================================================================

test('the idea prompt render shows the dump-your-idea instruction and the demo key', () => {
  const app = {};
  const out = plain(render.render(app));
  assert.ok(out.toLowerCase().includes('dump your idea'), 'idea instruction shown');
  assert.ok(out.toLowerCase().includes('decompose'), 'Enter-to-decompose advertised');
  assert.ok(out.toLowerCase().includes('demo'), 'the demo fallback key advertised');
  assert.ok(!out.includes('Authentication'), 'not the canned demo');
});

test('typing in idea mode appends to the buffer and echoes it in the render', () => {
  const app = {};
  render.initBuildFlow(app);
  for (const ch of 'a task app') assert.equal(render.handleKey({ sequence: ch }, app), true);
  assert.equal(app.ideaBuffer, 'a task app');
  const out = plain(render.render(app));
  assert.ok(out.includes('a task app'), 'the typed idea is echoed');
});

test('Backspace in idea mode edits the buffer', () => {
  const app = {};
  render.initBuildFlow(app);
  render.handleKey({ sequence: 'h' }, app);
  render.handleKey({ sequence: 'i' }, app);
  render.handleKey({ name: 'backspace' }, app);
  assert.equal(app.ideaBuffer, 'h');
});

test('pressing b on an EMPTY idea buffer loads the demo and leaves idea mode', () => {
  const app = {};
  render.initBuildFlow(app);
  const consumed = render.handleKey({ sequence: 'b' }, app);
  assert.equal(consumed, true);
  assert.equal(app.ideaMode, false, 'left idea mode');
  assert.equal(flow.currentTopic(app.buildFlow).id, 'auth', 'the demo is loaded');
  assert.ok(app.message && app.message.length > 0, 'a non-silent status message was set');
});

test('b with a NON-empty buffer is a normal character (does not trigger the demo)', () => {
  const app = {};
  render.initBuildFlow(app);
  render.handleKey({ sequence: 'a' }, app); // buffer 'a' (non-empty)
  render.handleKey({ sequence: 'b' }, app); // 'b' now appends
  assert.equal(app.ideaBuffer, 'ab');
  assert.equal(app.ideaMode, true, 'still typing the idea');
});

// X8 case 1 — the WARM submit path spawns NOTHING and shows the decomposing screen.
// The old flow synchronously spawned a cold-start `claude -p` here; the warm flow sets
// an awaiting-decomposition state and returns immediate feedback. The session model
// (per start.md) dispatches vision-decomposer to write topics; the next render drives them.
test('submit does NOT spawn a process and shows the "Breaking … into topics" screen', () => {
  const cp = require('child_process');
  const originalSpawnSync = cp.spawnSync;
  let spawnCalls = 0;
  cp.spawnSync = (...args) => { spawnCalls++; return originalSpawnSync(...args); };
  try {
    withTempProject((root) => {
      const app = { projectPath: root };
      render.initBuildFlow(app);
      for (const ch of 'a note taking app') render.handleKey({ sequence: ch }, app);
      const consumed = render.handleKey({ name: 'return' }, app);
      assert.equal(consumed, true, 'Enter is consumed');
      assert.equal(spawnCalls, 0, 'submit must NOT spawn any child process (no cold-start Claude)');
      assert.ok(app.awaitingDecomposition, 'the awaiting-decomposition state is set');
      assert.equal(app.ideaMode, true, 'still in idea mode until topics land');
      assert.ok(!app.buildFlow, 'no flow yet — topics have not been written');
      // No topics.json was written by submit itself — the vision-decomposer writes it.
      assert.ok(!nodeFs.existsSync(path.join(root, '.ctoc', 'streaming', 'topics.json')),
        'submit writes nothing — decomposition is dispatched, not run inline');
      const out = plain(render.render(app));
      assert.ok(out.toLowerCase().includes('breaking'), 'the decomposing screen says "Breaking"');
      assert.ok(out.includes('a note taking app'), 'the submitted idea is echoed on the decomposing screen');
      assert.ok(out.toLowerCase().includes('into topics'), 'the "into topics" acknowledgment is shown');
    });
  } finally {
    cp.spawnSync = originalSpawnSync;
  }
});

// X8 case 2 — once the dispatched vision-decomposer has written topics, the next render
// loads and drives them (the awaiting-decomposition state resolves into the real flow).
test('once topics exist after an idea submit, the next render drives them', () => {
  withTempProject((root) => {
    const app = { projectPath: root };
    render.initBuildFlow(app);
    for (const ch of 'a blog') render.handleKey({ sequence: ch }, app);
    render.handleKey({ name: 'return' }, app); // submit → awaiting decomposition
    assert.ok(app.awaitingDecomposition, 'awaiting after submit');

    // The vision-decomposer writes topics.json (simulated here via the real writer).
    require('../src/lib/streaming-topics').writeTopics(root, [
      {
        id: 'db', label: 'Database', critical: true,
        questions: [{ id: 'engine', prompt: 'Which engine?', options: [{ key: '1', label: 'Postgres', recommended: true }] }],
      },
    ]);

    const out = plain(render.render(app)); // re-render → loads + drives the real topics
    assert.equal(app.ideaMode, false, 'exited idea mode into the real flow');
    assert.ok(!app.awaitingDecomposition, 'awaiting state cleared once topics landed');
    assert.equal(flow.currentTopic(app.buildFlow).id, 'db', 'real topics drive after decomposition');
    assert.ok(out.includes('Which engine?'), 'the real question renders');
  });
});

test('a blank idea submit prompts to type first and stays in idea mode (empty-idea preserved)', () => {
  withTempProject((root) => {
    const app = { projectPath: root };
    render.initBuildFlow(app); // idea mode, empty buffer
    const consumed = render.handleKey({ name: 'return' }, app);
    assert.equal(consumed, true);
    assert.equal(app.ideaMode, true, 'stays in idea mode on a blank submit');
    assert.ok(!app.awaitingDecomposition, 'a blank submit does NOT enter awaiting-decomposition');
    assert.ok(app.message && app.message.length > 0, 'a non-silent prompt-to-type message');
    assert.ok(!nodeFs.existsSync(path.join(root, '.ctoc', 'streaming', 'topics.json')), 'no file written');
  });
});

test('with a valid topics.json present, idea mode is NOT entered (real topics drive)', () => {
  withTempProject((root) => {
    writeRealTopics(root, JSON.stringify([
      {
        id: 'realtopic', label: 'Real', critical: true,
        questions: [{ id: 'q', prompt: 'Real?', options: [{ key: '1', label: 'Yes', recommended: true }] }],
      },
    ]));
    const app = { projectPath: root };
    const out = plain(render.render(app));
    assert.ok(!app.ideaMode, 'real topics drive; no idea prompt');
    assert.equal(flow.currentTopic(app.buildFlow).id, 'realtopic');
    assert.ok(!out.toLowerCase().includes('dump your idea'), 'the idea prompt is not shown');
    assert.ok(out.includes('Real?'), 'the real question renders');
  });
});

test('the echoed idea buffer is control-char stripped in the render', () => {
  const app = {};
  render.initBuildFlow(app);
  app.ideaBuffer = 'ho\x1b[2Jstile\x07';
  const out = render.render(app);
  assert.ok(!out.includes('\x1b[2J'), 'clear-screen sequence stripped from the echoed idea');
  assert.ok(!out.includes('\x07'), 'bell stripped from the echoed idea');
});

test('the demo fallback is preserved — b on an empty idea buffer still loads the demo', () => {
  // The graceful escape hatch survives the warm-path rework: from the idea prompt, `b`
  // on an empty buffer loads the canned demo so the screen is never empty.
  const app = {};
  render.initBuildFlow(app);
  const consumed = render.handleKey({ sequence: 'b' }, app);
  assert.equal(consumed, true);
  assert.equal(app.ideaMode, false, 'left idea mode into the demo');
  assert.equal(flow.currentTopic(app.buildFlow).id, 'auth', 'the demo is loaded');
  assert.ok(app.message && app.message.length > 0, 'a non-silent status message was set');
});

test('a non-typing key (e.g. left arrow) in idea mode is an unconsumed no-op', () => {
  const app = {};
  render.initBuildFlow(app);
  const consumed = render.handleKey({ name: 'left' }, app);
  assert.equal(consumed, false, 'a navigation key is not swallowed by the idea buffer');
  assert.equal(app.ideaBuffer, '', 'buffer unchanged');
});

// ===========================================================================
// X8 — the warm-decompose instruction surface + reachability + no-spawn guards.
// The last `claude -p` (streaming-decompose's cold-start spawn) is deleted; decompose
// is now a model-dispatched vision-decomposer that writes topics via
// streaming-topics.writeTopics. These pin the instruction-surface anchors (which also
// keep writeTopics a LIVE export), the zero-spawn invariant across src/, and the fences.
// ===========================================================================

const REPO_ROOT = path.join(__dirname, '..');
const reachability = require('../src/lib/reachability');

// X8 case 5 — the agent that owns decomposition names the store writer with CALL syntax.
// This is the real write path AND the instruction-surface anchor (a surface CALL,
// `writeTopics(`, is the export-fence's live-caller signal) that keeps writeTopics live.
test('X8 case 5 — vision-decomposer.md names streaming-topics + calls writeTopics(', () => {
  const md = nodeFs.readFileSync(path.join(REPO_ROOT, 'agents', 'planning', 'vision-decomposer.md'), 'utf8');
  assert.match(md, /streaming-topics/, 'the store module is named');
  assert.match(md, /writeTopics\s*\(/, 'writeTopics is named as a CALL (the export-fence live signal)');
});

// X8 case 6 — the menu command instructs the model to dispatch vision-decomposer on an
// idea submit (this is what makes the model decompose, warm, instead of a cold CLI).
test('X8 case 6 — start.md instructs dispatch of vision-decomposer on an idea submit', () => {
  const md = nodeFs.readFileSync(path.join(REPO_ROOT, 'src', 'commands', 'start.md'), 'utf8');
  assert.match(md, /vision-decomposer/, 'vision-decomposer is named as the dispatch target');
  assert.match(md, /writeTopics/, 'the write path (streaming-topics.writeTopics) is named');
  // The instruction ties the dispatch to a free-text idea submit in the build flow.
  assert.match(md, /idea/i, 'the trigger is an idea submit');
});

// X8 case 7 — streaming-decompose.js is gone and NO claude -p / model spawn remains
// anywhere in src/ (comments allowed nowhere for a spawn; we walk real files with node).
test('X8 case 7 — streaming-decompose deleted; no claude -p / model spawn anywhere in src/', () => {
  assert.ok(
    !nodeFs.existsSync(path.join(REPO_ROOT, 'src', 'lib', 'streaming-decompose.js')),
    'streaming-decompose.js is deleted',
  );
  const walk = (dir, acc = []) => {
    for (const e of nodeFs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f, acc);
      else if (f.endsWith('.js')) acc.push(f);
    }
    return acc;
  };
  const offenders = [];
  for (const f of walk(path.join(REPO_ROOT, 'src'))) {
    const text = nodeFs.readFileSync(f, 'utf8');
    // A cold-start second Claude: the `claude -p` CLI form (whitespace-separated so the
    // `.claude-plugin` path literal — `claude` immediately followed by `-plugin` — is
    // NOT a false match), or a spawn of the `claude` binary by name.
    if (/claude\s+-p\b/.test(text)) offenders.push(path.relative(REPO_ROOT, f) + ' (claude -p)');
    if (/spawn(Sync)?\s*\(\s*[`'"]claude/.test(text)) offenders.push(path.relative(REPO_ROOT, f) + ' (spawn claude)');
  }
  assert.deepEqual(offenders, [], `no src/ file may spawn a second Claude. Offenders: ${offenders.join(', ')}`);
});

// X8 case 8 — the dead-code fences stay green: 0 unreachable FILES, and writeTopics is a
// LIVE export kept alive by the vision-decomposer.md CALL (no token JS caller added),
// with streaming-topics itself still reachable.
test('X8 case 8 — reachability within baseline; writeTopics live; streaming-topics reachable', () => {
  // The old `unreachable === []` assertion was an artifact of the file fence
  // counting a bare markdown MENTION as an execution root. The global number is
  // ratcheted in ONE place (tests/reachability.test.js against the committed
  // baseline); this case asserts what it is really about — the deletion stranded
  // nothing new, and streaming-topics is still reachable.
  const { unreachable, reachable } = reachability.analyze(REPO_ROOT);
  const baseline = JSON.parse(
    nodeFs.readFileSync(path.join(REPO_ROOT, '.ctoc', 'reachability-baseline.json'), 'utf8')
  );
  assert.deepEqual(
    unreachable.filter((f) => !baseline.unreachable.includes(f)), [],
    'the deletion must not strand any file outside the committed dead-code baseline'
  );
  assert.ok(reachable.includes('src/lib/streaming-topics.js'), 'streaming-topics stays reachable');
  assert.ok(!reachable.includes('src/lib/streaming-decompose.js'), 'streaming-decompose is gone from the graph');

  const { dead } = reachability.analyzeExports(REPO_ROOT);
  const deadWrite = dead.filter((k) => k.endsWith('#writeTopics'));
  assert.deepEqual(deadWrite, [], 'writeTopics must be LIVE (kept so by the vision-decomposer.md CALL, not a JS caller)');
});

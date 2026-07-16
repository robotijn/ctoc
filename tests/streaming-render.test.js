'use strict';

/**
 * Tests for the STANDALONE streaming renderer + key handler (streaming interaction
 * model, slice 1). Per the owner's direction change ("make CTOC streaming, fuck the
 * menu") this is NOT a menu area/tab — it is a self-contained render + handleKey pair
 * over a host `app` object, decoupled from src/commands/menu.js and the area system.
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

test('initBuildFlow attaches an ordered flow state onto app.buildFlow', () => {
  const app = {};
  render.initBuildFlow(app);
  assert.ok(app.buildFlow);
  // critical-first: the critical topic must be first
  assert.equal(flow.currentTopic(app.buildFlow).critical, true);
});

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
test('render lazily initializes the flow when app.buildFlow is absent', () => {
  const app = {};
  const out = render.render(app);
  assert.ok(app.buildFlow, 'render seeds app.buildFlow');
  assert.ok(typeof out === 'string' && out.length > 0);
});

test('render shows the topic label, a progress indicator, and the question prompt', () => {
  const app = {};
  render.initBuildFlow(app);
  const topic = flow.currentTopic(app.buildFlow);
  const question = flow.currentQuestion(app.buildFlow);
  const out = plain(render.render(app));
  assert.ok(out.includes(topic.label), 'shows topic label');
  assert.ok(out.includes('topic 1/2'), 'shows progress indicator');
  assert.ok(out.includes(question.prompt), 'shows question prompt');
});

test('render marks the recommended option with a ✓ recommended tag', () => {
  const app = {};
  render.initBuildFlow(app);
  const out = plain(render.render(app));
  assert.ok(out.includes('✓ recommended'), 'recommended marker present');
  // Exactly one option in the current question is marked.
  const matches = out.match(/✓ recommended/g) || [];
  assert.equal(matches.length, 1);
});

test('render footer advertises ONLY keys that work this slice', () => {
  const app = {};
  render.initBuildFlow(app);
  const out = plain(render.render(app));
  assert.ok(out.includes('<n> pick'), 'pick advertised');
  assert.ok(out.includes('c comment'), 'comment advertised');
  assert.ok(out.includes('b back'), 'back advertised');
  assert.ok(out.includes('s settings'), 'settings advertised');
});

test('render shows an "all topics answered" summary when complete', () => {
  const app = {};
  render.initBuildFlow(app);
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
  render.initBuildFlow(app);
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
  render.initBuildFlow(app);
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
  render.initBuildFlow(app);
  const consumed = render.handleKey({ sequence: 'b' }, app);
  assert.equal(consumed, true);
  assert.equal(app.streamAction, 'back');
});

test('handleKey "s" emits a settings intent (not a dead key)', () => {
  const app = {};
  render.initBuildFlow(app);
  const consumed = render.handleKey({ sequence: 's' }, app);
  assert.equal(consumed, true);
  assert.equal(app.streamAction, 'settings');
});

test('handleKey ignores an unadvertised / non-matching key (no-op, not consumed)', () => {
  const app = {};
  render.initBuildFlow(app);
  const before = app.buildFlow;
  const consumed = render.handleKey({ sequence: 'z' }, app);
  assert.equal(consumed, false);
  assert.equal(app.buildFlow, before, 'state unchanged');
});

test('handleKey ignores a digit that matches no option (no-op)', () => {
  const app = {};
  render.initBuildFlow(app);
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
  render.initBuildFlow(app);
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

test('exampleTopics seed: initBuildFlow presents the critical question first', () => {
  const app = {};
  render.initBuildFlow(app);
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
  render.initBuildFlow(app);
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
  render.initBuildFlow(app);
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
  render.initBuildFlow(app);
  let guard = 0;
  // Drive recommended picks until the batch becomes available (or everything is answered).
  while (!flow.batchAvailable(app.buildFlow) && !flow.isComplete(app.buildFlow) && guard++ < 50) {
    const rec = flow.recommendedKey(flow.currentQuestion(app.buildFlow));
    app.buildFlow = flow.answer(app.buildFlow, rec);
  }
  assert.equal(flow.batchAvailable(app.buildFlow), true, 'a batch becomes reachable with all-recommended picks');
});

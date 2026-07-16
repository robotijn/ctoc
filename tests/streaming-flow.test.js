'use strict';

/**
 * Tests for the pure streaming-flow state machine (streaming interaction model,
 * slice 1 — MVP heartbeat). This is the load-bearing, heavily-tested core: no I/O,
 * pure functions over a plain state object. Written RED first (the module does not
 * exist yet), then implemented to green.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../src/lib/streaming-flow');

// ---------------------------------------------------------------------------
// Fixtures. `auth` is marked critical and deliberately listed SECOND so ordering
// (critical-first) is observable. Each topic has a recommended option.
// ---------------------------------------------------------------------------
function topics() {
  return [
    {
      id: 'stack',
      label: 'Stack',
      critical: false,
      questions: [
        {
          id: 'lang',
          prompt: 'Primary language?',
          options: [
            { key: '1', label: 'TypeScript', recommended: true },
            { key: '2', label: 'Python' },
          ],
        },
        {
          id: 'db',
          prompt: 'Database?',
          options: [
            { key: '1', label: 'Postgres', recommended: true },
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
          prompt: 'Auth provider?',
          options: [
            { key: '1', label: 'Clerk', recommended: true },
            { key: '2', label: 'Auth.js' },
            { key: '3', label: 'Custom' },
          ],
        },
        {
          id: 'mfa',
          prompt: 'Require MFA?',
          options: [
            { key: '1', label: 'Yes', recommended: true },
            { key: '2', label: 'No' },
          ],
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// orderTopics
// ---------------------------------------------------------------------------
test('orderTopics puts critical topics before non-critical', () => {
  const ordered = flow.orderTopics(topics());
  assert.deepEqual(ordered.map(t => t.id), ['auth', 'stack']);
});

test('orderTopics is stable within each group', () => {
  const input = [
    { id: 'a', critical: false, questions: [] },
    { id: 'b', critical: true, questions: [] },
    { id: 'c', critical: false, questions: [] },
    { id: 'd', critical: true, questions: [] },
  ];
  assert.deepEqual(flow.orderTopics(input).map(t => t.id), ['b', 'd', 'a', 'c']);
});

test('orderTopics tolerates a non-array argument', () => {
  assert.deepEqual(flow.orderTopics(undefined), []);
  assert.deepEqual(flow.orderTopics(null), []);
});

// ---------------------------------------------------------------------------
// initFlow
// ---------------------------------------------------------------------------
test('initFlow orders critical-first and points at topic 0 / question 0', () => {
  const state = flow.initFlow(topics());
  assert.equal(state.topics[0].id, 'auth');
  assert.equal(state.topics[1].id, 'stack');
  assert.equal(state.topicIndex, 0);
  assert.equal(state.questionIndex, 0);
  assert.deepEqual(state.answers, {});
});

// ---------------------------------------------------------------------------
// currentTopic / currentQuestion
// ---------------------------------------------------------------------------
test('currentTopic / currentQuestion return the pointed-at items', () => {
  const state = flow.initFlow(topics());
  assert.equal(flow.currentTopic(state).id, 'auth');
  assert.equal(flow.currentQuestion(state).id, 'provider');
});

test('currentTopic / currentQuestion are null past the end', () => {
  const state = flow.initFlow([]);
  assert.equal(flow.currentTopic(state), null);
  assert.equal(flow.currentQuestion(state), null);
});

// ---------------------------------------------------------------------------
// recommendedKey
// ---------------------------------------------------------------------------
test('recommendedKey returns the marked option key', () => {
  const state = flow.initFlow(topics());
  assert.equal(flow.recommendedKey(flow.currentQuestion(state)), '1');
});

test('recommendedKey returns null when nothing is recommended', () => {
  const q = { id: 'x', prompt: 'x', options: [{ key: '1', label: 'a' }] };
  assert.equal(flow.recommendedKey(q), null);
});

test('recommendedKey returns null for a null/undefined question', () => {
  assert.equal(flow.recommendedKey(null), null);
  assert.equal(flow.recommendedKey(undefined), null);
});

// ---------------------------------------------------------------------------
// answer — records + advances
// ---------------------------------------------------------------------------
test('answer records the choice and advances within a topic', () => {
  const state = flow.initFlow(topics());
  const next = flow.answer(state, '1');
  assert.equal(next.answers['auth/provider'], '1');
  assert.equal(next.topicIndex, 0);
  assert.equal(next.questionIndex, 1);
  assert.equal(flow.currentQuestion(next).id, 'mfa');
});

test('answer rolls to the next topic first question when a topic is exhausted', () => {
  let state = flow.initFlow(topics());
  state = flow.answer(state, '1'); // auth/provider
  state = flow.answer(state, '1'); // auth/mfa  → exhausts auth, rolls to stack
  assert.equal(state.topicIndex, 1);
  assert.equal(state.questionIndex, 0);
  assert.equal(flow.currentTopic(state).id, 'stack');
  assert.equal(flow.currentQuestion(state).id, 'lang');
});

test('answer accepts a free-text comment string as the recorded answer', () => {
  const state = flow.initFlow(topics());
  const next = flow.answer(state, 'I want to use Rust actually');
  assert.equal(next.answers['auth/provider'], 'I want to use Rust actually');
  assert.equal(next.questionIndex, 1);
});

test('answer NEVER mutates the input state (clone semantics)', () => {
  const state = flow.initFlow(topics());
  const snapshot = JSON.stringify(state);
  const next = flow.answer(state, '2');
  // Original untouched:
  assert.equal(JSON.stringify(state), snapshot);
  assert.deepEqual(state.answers, {});
  assert.equal(state.questionIndex, 0);
  // New object is a different reference with the recorded answer:
  assert.notEqual(next, state);
  assert.notEqual(next.answers, state.answers);
  assert.equal(next.answers['auth/provider'], '2');
});

test('answer past the end is a no-op clone (does not throw, records nothing)', () => {
  const state = flow.initFlow([]);
  const next = flow.answer(state, '1');
  assert.notEqual(next, state); // still a fresh object (non-mutating)
  assert.deepEqual(next.answers, {});
  assert.ok(flow.isComplete(next));
});

// ---------------------------------------------------------------------------
// isComplete
// ---------------------------------------------------------------------------
test('isComplete is false until every question is answered', () => {
  let state = flow.initFlow(topics());
  assert.equal(flow.isComplete(state), false);
  state = flow.answer(state, '1'); // auth/provider
  assert.equal(flow.isComplete(state), false);
  state = flow.answer(state, '1'); // auth/mfa
  assert.equal(flow.isComplete(state), false);
  state = flow.answer(state, '1'); // stack/lang
  assert.equal(flow.isComplete(state), false);
  state = flow.answer(state, '1'); // stack/db → last
  assert.equal(flow.isComplete(state), true);
});

test('isComplete is vacuously true for empty topics', () => {
  assert.equal(flow.isComplete(flow.initFlow([])), true);
});

// ---------------------------------------------------------------------------
// progress
// ---------------------------------------------------------------------------
test('progress reports topic and question counts for the header', () => {
  const state = flow.initFlow(topics());
  assert.deepEqual(flow.progress(state), {
    topicIndex: 0,
    topicCount: 2,
    questionIndex: 0,
    questionCount: 2, // auth has 2 questions
  });
});

test('progress advances with the pointer', () => {
  let state = flow.initFlow(topics());
  state = flow.answer(state, '1'); // → auth/mfa
  assert.deepEqual(flow.progress(state), {
    topicIndex: 0,
    topicCount: 2,
    questionIndex: 1,
    questionCount: 2,
  });
});

// ---------------------------------------------------------------------------
// edge cases
// ---------------------------------------------------------------------------
test('edge: a topic with a single question completes after one answer', () => {
  const single = [
    {
      id: 'only',
      label: 'Only',
      critical: true,
      questions: [
        { id: 'q', prompt: 'q?', options: [{ key: '1', label: 'a', recommended: true }] },
      ],
    },
  ];
  let state = flow.initFlow(single);
  assert.equal(flow.isComplete(state), false);
  state = flow.answer(state, '1');
  assert.equal(flow.isComplete(state), true);
  assert.equal(flow.currentTopic(state), null);
});

// ---------------------------------------------------------------------------
// defensive guards — exercise the null/undefined-state branches so the pure core
// is fully branch-covered (these paths protect a caller that passes a bad state).
// ---------------------------------------------------------------------------
test('accessors tolerate a null/undefined state', () => {
  assert.equal(flow.currentTopic(null), null);
  assert.equal(flow.currentTopic(undefined), null);
  assert.equal(flow.currentQuestion(null), null);
  assert.equal(flow.currentQuestion(undefined), null);
  assert.equal(flow.isComplete(null), true); // no topics → vacuously complete
  assert.deepEqual(flow.progress(undefined), {
    topicIndex: 0, topicCount: 0, questionIndex: 0, questionCount: 0,
  });
});

test('recommendedKey returns null for a question with no options array', () => {
  assert.equal(flow.recommendedKey({ id: 'q', prompt: 'q' }), null);
});

test('currentQuestion returns null when the current topic has no questions array', () => {
  const state = { topics: [{ id: 't', label: 't', critical: true }], topicIndex: 0, questionIndex: 0, answers: {} };
  assert.equal(flow.currentQuestion(state), null);
});

test('advancePointer skips an empty topic and past-the-end returns done pointer', () => {
  const topics = [
    { id: 'a', questions: [{ id: 'q1' }] },
    { id: 'b', questions: [] },           // empty → skipped
    { id: 'c', questions: [{ id: 'q3' }] },
  ];
  // from a/q1 (last question of a) → skip b → land on c/q0
  assert.deepEqual(flow.advancePointer(topics, 0, 0), { topicIndex: 2, questionIndex: 0 });
  // from c/q0 (last question overall) → past the end
  assert.deepEqual(flow.advancePointer(topics, 2, 0), { topicIndex: 3, questionIndex: 0 });
});

test('answer past the end preserves existing answers in the clone', () => {
  const state = { topics: [], topicIndex: 5, questionIndex: 2, answers: { 'x/y': '1' } };
  const next = flow.answer(state, '9');
  assert.deepEqual(next.answers, { 'x/y': '1' });
  assert.equal(next.topicIndex, 5);
  assert.equal(next.questionIndex, 2);
});

test('edge: a topic with no questions is skipped and never blocks completion', () => {
  const withEmpty = [
    { id: 'empty', label: 'Empty', critical: true, questions: [] },
    {
      id: 'real',
      label: 'Real',
      critical: false,
      questions: [{ id: 'q', prompt: 'q?', options: [{ key: '1', label: 'a' }] }],
    },
  ];
  const state = flow.initFlow(withEmpty);
  // The pointer must land on the first ANSWERABLE question, skipping the empty topic.
  assert.equal(flow.currentTopic(state).id, 'real');
  assert.equal(flow.currentQuestion(state).id, 'q');
  const next = flow.answer(state, '1');
  assert.equal(flow.isComplete(next), true);
});

// ===========================================================================
// SLICE: CRITICAL-FIRST question ordering + critical-issue surfacing.
// Owner's rule: "always go through the critical issues first then the most
// important … the batch is only for non-critical issues." WITHIN a topic,
// questions are ordered CRITICAL → IMPORTANT → NORMAL, stable within a tier.
// ===========================================================================

// A tier fixture: one topic whose questions are authored NORMAL, then CRITICAL,
// then IMPORTANT — so critical-first ordering is observable (the critical one is
// LAST in source but must be presented FIRST).
function tierTopic() {
  return {
    id: 'auth',
    label: 'Authentication',
    critical: true,
    questions: [
      { id: 'nrm', prompt: 'normal?', options: [{ key: '1', label: 'a', recommended: true }] },
      { id: 'imp', important: true, prompt: 'important?', options: [{ key: '1', label: 'a', recommended: true }] },
      { id: 'crit', critical: true, prompt: 'critical?', options: [{ key: '1', label: 'a', recommended: true }] },
    ],
  };
}

// ---------------------------------------------------------------------------
// questionTier
// ---------------------------------------------------------------------------
test('questionTier classifies critical, important, and normal questions', () => {
  assert.equal(flow.questionTier({ id: 'a', critical: true }), 'critical');
  assert.equal(flow.questionTier({ id: 'b', important: true }), 'important');
  assert.equal(flow.questionTier({ id: 'c' }), 'normal');
});

test('questionTier: critical outranks important when both flags are set', () => {
  assert.equal(flow.questionTier({ id: 'a', critical: true, important: true }), 'critical');
});

test('questionTier tolerates a null/undefined question (normal)', () => {
  assert.equal(flow.questionTier(null), 'normal');
  assert.equal(flow.questionTier(undefined), 'normal');
});

// ---------------------------------------------------------------------------
// orderQuestions
// ---------------------------------------------------------------------------
test('orderQuestions puts critical before important before normal', () => {
  const ordered = flow.orderQuestions(tierTopic().questions);
  assert.deepEqual(ordered.map(q => q.id), ['crit', 'imp', 'nrm']);
});

test('orderQuestions is stable within each tier (preserves source order)', () => {
  const input = [
    { id: 'n1' },
    { id: 'c1', critical: true },
    { id: 'i1', important: true },
    { id: 'n2' },
    { id: 'c2', critical: true },
    { id: 'i2', important: true },
  ];
  assert.deepEqual(
    flow.orderQuestions(input).map(q => q.id),
    ['c1', 'c2', 'i1', 'i2', 'n1', 'n2']
  );
});

test('orderQuestions tolerates a non-array argument', () => {
  assert.deepEqual(flow.orderQuestions(undefined), []);
  assert.deepEqual(flow.orderQuestions(null), []);
  assert.deepEqual(flow.orderQuestions('nope'), []);
});

test('orderQuestions does not mutate its input array', () => {
  const input = tierTopic().questions;
  const snapshot = input.map(q => q.id);
  flow.orderQuestions(input);
  assert.deepEqual(input.map(q => q.id), snapshot);
});

test('backward-compat: orderQuestions preserves order when no question has a tier flag', () => {
  const input = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(flow.orderQuestions(input).map(q => q.id), ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------
// initFlow — orders questions within each topic
// ---------------------------------------------------------------------------
test('initFlow presents a critical question FIRST even when authored last', () => {
  const state = flow.initFlow([tierTopic()]);
  // 'crit' was the LAST question in source; it must now be pointed at first.
  assert.equal(flow.currentQuestion(state).id, 'crit');
});

test('initFlow orders every topic\'s questions critical-first', () => {
  const state = flow.initFlow([tierTopic()]);
  assert.deepEqual(state.topics[0].questions.map(q => q.id), ['crit', 'imp', 'nrm']);
});

test('initFlow does not mutate the input topics/questions', () => {
  const input = [tierTopic()];
  const snapshot = JSON.stringify(input);
  flow.initFlow(input);
  assert.equal(JSON.stringify(input), snapshot);
  // original question order untouched
  assert.deepEqual(input[0].questions.map(q => q.id), ['nrm', 'imp', 'crit']);
});

test('backward-compat: initFlow leaves flagless topics behaving exactly as before', () => {
  const state = flow.initFlow(topics());
  // topics() has no tier flags → question order is preserved as authored.
  assert.deepEqual(state.topics.map(t => t.id), ['auth', 'stack']);
  assert.deepEqual(state.topics[0].questions.map(q => q.id), ['provider', 'mfa']);
  assert.deepEqual(state.topics[1].questions.map(q => q.id), ['lang', 'db']);
});

// ---------------------------------------------------------------------------
// criticalOpenCount / topicCriticalOpenCount
// ---------------------------------------------------------------------------
test('criticalOpenCount counts unanswered criticals in the current topic', () => {
  const state = flow.initFlow([
    {
      id: 'auth', label: 'Authentication', critical: true,
      questions: [
        { id: 'c1', critical: true, prompt: 'c1?', options: [{ key: '1', label: 'a', recommended: true }] },
        { id: 'c2', critical: true, prompt: 'c2?', options: [{ key: '1', label: 'a', recommended: true }] },
        { id: 'n1', prompt: 'n1?', options: [{ key: '1', label: 'a', recommended: true }] },
      ],
    },
  ]);
  assert.equal(flow.criticalOpenCount(state), 2);
});

test('criticalOpenCount drops as criticals are answered and ignores normal answers', () => {
  let state = flow.initFlow([
    {
      id: 'auth', label: 'Authentication', critical: true,
      questions: [
        { id: 'c1', critical: true, prompt: 'c1?', options: [{ key: '1', label: 'a', recommended: true }] },
        { id: 'c2', critical: true, prompt: 'c2?', options: [{ key: '1', label: 'a', recommended: true }] },
        { id: 'n1', prompt: 'n1?', options: [{ key: '1', label: 'a', recommended: true }] },
      ],
    },
  ]);
  assert.equal(flow.criticalOpenCount(state), 2);
  state = flow.answer(state, '1'); // answers c1 (critical, presented first)
  assert.equal(flow.criticalOpenCount(state), 1);
  state = flow.answer(state, '1'); // answers c2 (critical)
  assert.equal(flow.criticalOpenCount(state), 0);
  state = flow.answer(state, '1'); // answers n1 (normal) — count stays 0
  assert.equal(flow.criticalOpenCount(state), 0);
});

test('criticalOpenCount is 0 for a topic with no critical questions', () => {
  const state = flow.initFlow([
    {
      id: 'stack', label: 'Stack', critical: false,
      questions: [{ id: 'n1', prompt: 'n1?', options: [{ key: '1', label: 'a', recommended: true }] }],
    },
  ]);
  assert.equal(flow.criticalOpenCount(state), 0);
});

test('criticalOpenCount is 0 when past the end / null state', () => {
  assert.equal(flow.criticalOpenCount(flow.initFlow([])), 0);
  assert.equal(flow.criticalOpenCount(null), 0);
});

test('topicCriticalOpenCount can be asked about any topic directly', () => {
  const state = flow.initFlow([tierTopic()]);
  assert.equal(flow.topicCriticalOpenCount(state, state.topics[0]), 1);
  assert.equal(flow.topicCriticalOpenCount(state, null), 0);
  assert.equal(flow.topicCriticalOpenCount(state, { id: 'x', label: 'x' }), 0);
});

test('initFlow passes through a topic that has no questions array untouched', () => {
  // Exercises the pass-through branch: a topic with no `questions` array is left
  // as-is (not forced to []), and is simply skipped as an empty topic.
  const noQuestions = { id: 'meta', label: 'Meta', critical: true };
  const real = {
    id: 'stack', label: 'Stack', critical: false,
    questions: [{ id: 'q', prompt: 'q?', options: [{ key: '1', label: 'a', recommended: true }] }],
  };
  const state = flow.initFlow([noQuestions, real]);
  // The flagless topic is preserved verbatim (same shape, no injected questions field).
  const meta = state.topics.find(t => t.id === 'meta');
  assert.equal('questions' in meta, false);
  // Pointer skips the question-less topic and lands on the real one.
  assert.equal(flow.currentTopic(state).id, 'stack');
  assert.equal(flow.criticalOpenCount(state), 0);
});

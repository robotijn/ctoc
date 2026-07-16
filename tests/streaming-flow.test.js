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

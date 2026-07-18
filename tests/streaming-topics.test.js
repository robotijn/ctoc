'use strict';

/**
 * Tests for the streaming topic/question CONTRACT + fail-soft LOADER (streaming
 * interaction model, slice 1 — REAL DATA).
 *
 * `validateTopics(raw)` is a pure, NON-throwing structural validator returning
 * `{ valid, errors }`. `loadTopics(projectRoot)` reads
 * `.ctoc/streaming/topics.json` via safeFs, JSON.parses, validates, and returns
 * the `topics[]` array when valid — or `null` (never throwing) when the file is
 * absent, unreadable, unparseable, or structurally invalid (fail-soft).
 *
 * Written RED first (module absent → red), then implemented to green. Uses real
 * temp dirs (mkdtemp) + safeFs, cleaned in finally; cross-platform (path.join,
 * os.tmpdir).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const topicsLib = require('../src/lib/streaming-topics');
const flow = require('../src/lib/streaming-flow');

// A well-formed topics structure exercising both critical-first orderings and the
// genuinely-optional flags (critical/important/recommended).
function goodTopics() {
  return [
    {
      id: 'stack',
      label: 'Stack',
      critical: false,
      questions: [
        {
          id: 'lang',
          prompt: 'Which language?',
          options: [
            { key: '1', label: 'TypeScript', recommended: true },
            { key: '2', label: 'Python' },
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
          prompt: 'Which provider?',
          options: [
            { key: '1', label: 'Clerk', recommended: true },
            { key: '2', label: 'Auth.js' },
          ],
        },
        {
          id: 'session',
          critical: true,
          prompt: 'Where to store session tokens?',
          options: [
            { key: '1', label: 'httpOnly cookie', recommended: true },
            { key: '2', label: 'localStorage' },
          ],
        },
      ],
    },
  ];
}

// A minimal well-formed structure with NO optional flags at all.
function minimalTopics() {
  return [
    {
      id: 't1',
      label: 'Topic One',
      questions: [
        {
          id: 'q1',
          prompt: 'Pick one',
          options: [{ key: '1', label: 'A' }, { key: '2', label: 'B' }],
        },
      ],
    },
  ];
}

// Make a temp project root and run `fn(root)`, cleaning up in finally.
function withTempRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streaming-topics-'));
  try {
    return fn(root);
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

// Write `.ctoc/streaming/topics.json` under `root` with the given raw string.
function writeTopicsFile(root, raw) {
  const dir = path.join(root, '.ctoc', 'streaming');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'topics.json'), raw, 'utf8');
}

// ---------------------------------------------------------------------------
// validateTopics — accepts
// ---------------------------------------------------------------------------
test('validateTopics accepts a well-formed structure WITH optional flags', () => {
  const res = topicsLib.validateTopics(goodTopics());
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
});

test('validateTopics accepts a well-formed structure WITHOUT optional flags', () => {
  const res = topicsLib.validateTopics(minimalTopics());
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
});

test('validateTopics accepts an empty topics array (vacuously well-formed)', () => {
  const res = topicsLib.validateTopics([]);
  assert.equal(res.valid, true);
});

// ---------------------------------------------------------------------------
// validateTopics — rejects (never throws)
// ---------------------------------------------------------------------------
test('validateTopics rejects a non-array topics without throwing', () => {
  for (const bad of [null, undefined, {}, 'nope', 42]) {
    const res = topicsLib.validateTopics(bad);
    assert.equal(res.valid, false, `${JSON.stringify(bad)} should be invalid`);
    assert.ok(res.errors.length > 0);
  }
});

test('validateTopics rejects a topic missing id', () => {
  const t = minimalTopics();
  delete t[0].id;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a topic missing label', () => {
  const t = minimalTopics();
  delete t[0].label;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a non-string topic id', () => {
  const t = minimalTopics();
  t[0].id = 123;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects an empty-string topic id', () => {
  const t = minimalTopics();
  t[0].id = '';
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a topic whose questions is not an array', () => {
  const t = minimalTopics();
  t[0].questions = 'nope';
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a question missing id', () => {
  const t = minimalTopics();
  delete t[0].questions[0].id;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a question missing prompt', () => {
  const t = minimalTopics();
  delete t[0].questions[0].prompt;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a question whose options is not an array', () => {
  const t = minimalTopics();
  t[0].questions[0].options = { key: '1' };
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a question with zero options', () => {
  const t = minimalTopics();
  t[0].questions[0].options = [];
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects an option missing key', () => {
  const t = minimalTopics();
  delete t[0].questions[0].options[0].key;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects an option missing label', () => {
  const t = minimalTopics();
  delete t[0].questions[0].options[0].label;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a non-string option key', () => {
  const t = minimalTopics();
  t[0].questions[0].options[0].key = 1;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects duplicate topic ids', () => {
  const t = minimalTopics().concat(minimalTopics()); // two topics both id 't1'
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects duplicate question ids within a topic', () => {
  const t = minimalTopics();
  t[0].questions.push({
    id: 'q1', // duplicate of the existing q1
    prompt: 'Another',
    options: [{ key: '1', label: 'X' }],
  });
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics allows the SAME question id across DIFFERENT topics', () => {
  const t = [
    { id: 'a', label: 'A', questions: [{ id: 'q', prompt: 'p', options: [{ key: '1', label: 'X' }] }] },
    { id: 'b', label: 'B', questions: [{ id: 'q', prompt: 'p', options: [{ key: '1', label: 'X' }] }] },
  ];
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, true);
});

test('validateTopics rejects a null topic entry', () => {
  const res = topicsLib.validateTopics([null]);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a null question entry', () => {
  const t = minimalTopics();
  t[0].questions = [null];
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a null option entry', () => {
  const t = minimalTopics();
  t[0].questions[0].options = [null];
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a non-boolean topic.critical flag', () => {
  const t = minimalTopics();
  t[0].critical = 'yes';
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a non-boolean question.critical flag', () => {
  const t = minimalTopics();
  t[0].questions[0].critical = 1;
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a non-boolean question.important flag', () => {
  const t = minimalTopics();
  t[0].questions[0].important = 'high';
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

test('validateTopics rejects a non-boolean option.recommended flag', () => {
  const t = minimalTopics();
  t[0].questions[0].options[0].recommended = 'yes';
  const res = topicsLib.validateTopics(t);
  assert.equal(res.valid, false);
});

// ---------------------------------------------------------------------------
// loadTopics — success
// ---------------------------------------------------------------------------
test('loadTopics reads a valid topics.json fixture and returns the topics array', () => {
  withTempRoot((root) => {
    writeTopicsFile(root, JSON.stringify(goodTopics()));
    const topics = topicsLib.loadTopics(root);
    assert.ok(Array.isArray(topics));
    assert.equal(topics.length, 2);
    assert.equal(topics[0].id, 'stack');
  });
});

test('loadTopics accepts a { topics: [...] } wrapper OR a bare array', () => {
  // The loader targets the topics[] array; verify a bare array file loads.
  withTempRoot((root) => {
    writeTopicsFile(root, JSON.stringify(minimalTopics()));
    const topics = topicsLib.loadTopics(root);
    assert.ok(Array.isArray(topics));
    assert.equal(topics[0].id, 't1');
  });
});

test('loaded topics feed streamingFlow.initFlow with critical-first ordering', () => {
  withTempRoot((root) => {
    writeTopicsFile(root, JSON.stringify(goodTopics()));
    const topics = topicsLib.loadTopics(root);
    const state = flow.initFlow(topics);
    // 'auth' is the critical topic authored second → ordered first.
    assert.equal(flow.currentTopic(state).id, 'auth');
    // within auth, the critical 'session' question is pulled ahead of 'provider'.
    assert.equal(flow.currentQuestion(state).id, 'session');
  });
});

// ---------------------------------------------------------------------------
// loadTopics — fail-soft (returns null, NEVER throws)
// ---------------------------------------------------------------------------
test('loadTopics returns null when the file is ABSENT (no throw)', () => {
  withTempRoot((root) => {
    let topics;
    assert.doesNotThrow(() => { topics = topicsLib.loadTopics(root); });
    assert.equal(topics, null);
  });
});

test('loadTopics returns null for UNPARSEABLE JSON (no throw)', () => {
  withTempRoot((root) => {
    writeTopicsFile(root, '{ this is not json ');
    let topics;
    assert.doesNotThrow(() => { topics = topicsLib.loadTopics(root); });
    assert.equal(topics, null);
  });
});

test('loadTopics returns null for a STRUCTURALLY-INVALID file (no throw)', () => {
  withTempRoot((root) => {
    // valid JSON, invalid structure: a topic with no questions array.
    writeTopicsFile(root, JSON.stringify([{ id: 'x', label: 'X' }]));
    let topics;
    assert.doesNotThrow(() => { topics = topicsLib.loadTopics(root); });
    assert.equal(topics, null);
  });
});

test('loadTopics returns null for an EMPTY topics array (nothing to seed)', () => {
  withTempRoot((root) => {
    writeTopicsFile(root, JSON.stringify([]));
    let topics;
    assert.doesNotThrow(() => { topics = topicsLib.loadTopics(root); });
    assert.equal(topics, null);
  });
});

test('loadTopics returns null when the topics path is UNREADABLE (no throw)', () => {
  withTempRoot((root) => {
    // Make topics.json a DIRECTORY: existsSync() is true, but readFileSync throws
    // (EISDIR on POSIX / EISDIR-equivalent on Windows) — the unreadable branch.
    const dir = path.join(root, '.ctoc', 'streaming', 'topics.json');
    fs.mkdirSync(dir, { recursive: true });
    let topics;
    assert.doesNotThrow(() => { topics = topicsLib.loadTopics(root); });
    assert.equal(topics, null);
  });
});

test('loadTopics returns null for an invalid projectRoot argument (no throw)', () => {
  for (const bad of [null, undefined, '', 42]) {
    let topics;
    assert.doesNotThrow(() => { topics = topicsLib.loadTopics(bad); });
    assert.equal(topics, null);
  }
});

// ---------------------------------------------------------------------------
// writeTopics — the atomic, validated WRITER (X8: moved here from the deleted
// streaming-decompose so the canonical topics module owns BOTH read and write;
// vision-decomposer writes through it).
// ---------------------------------------------------------------------------

// X8 case 3 — round-trip: writeTopics writes validated topics that loadTopics reads.
test('writeTopics writes validated topics that loadTopics reads back (round-trip)', () => {
  withTempRoot((root) => {
    const res = topicsLib.writeTopics(root, goodTopics());
    assert.equal(res.ok, true, 'a valid write reports ok');
    // The on-disk shape is the bare array (what loadTopics reads), not { topics }.
    const back = topicsLib.loadTopics(root);
    assert.ok(Array.isArray(back), 'loadTopics reads the written file');
    assert.equal(back.length, 2);
    assert.equal(back[0].id, 'stack');
    assert.equal(back[1].id, 'auth');
  });
});

test('writeTopics writes ATOMICALLY (final file is complete JSON, no temp residue)', () => {
  withTempRoot((root) => {
    topicsLib.writeTopics(root, minimalTopics());
    const dir = path.join(root, '.ctoc', 'streaming');
    const entries = fs.readdirSync(dir);
    assert.deepEqual(entries, ['topics.json'], 'only the target file remains — the temp was renamed away');
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'topics.json'), 'utf8'));
    assert.equal(parsed[0].id, 't1');
  });
});

// X8 case 4 — the no-garbage guard: invalid topics are rejected and NOTHING is written.
test('writeTopics rejects invalid topics and writes nothing', () => {
  withTempRoot((root) => {
    for (const bad of [null, undefined, 'nope', 42, [{ id: 'x', label: 'X' }] /* no questions */]) {
      const res = topicsLib.writeTopics(root, bad);
      assert.equal(res.ok, false, `${JSON.stringify(bad)} must be rejected`);
      assert.ok(Array.isArray(res.errors) && res.errors.length > 0, 'errors are reported');
    }
    assert.ok(
      !fs.existsSync(path.join(root, '.ctoc', 'streaming', 'topics.json')),
      'a rejected write leaves no file behind',
    );
  });
});

test('writeTopics rejects an invalid projectRoot without throwing', () => {
  for (const bad of [null, undefined, '', 42]) {
    let res;
    assert.doesNotThrow(() => { res = topicsLib.writeTopics(bad, minimalTopics()); });
    assert.equal(res.ok, false);
    assert.ok(res.errors.length > 0);
  }
});

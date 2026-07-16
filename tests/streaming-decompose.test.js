'use strict';

/**
 * Tests for the AI-integration entry `decomposeIdea` (streaming interaction model,
 * slice 2 — REAL DATA in-flow idea dump).
 *
 * `decomposeIdea(idea, projectRoot, opts)` builds a decomposition PROMPT embedding the
 * idea + the topic/question CONTRACT, spawns the Claude CLI (`claude -p --output-format
 * json`, injectable via `opts.spawn`), extracts the model's text from the CLI JSON
 * envelope, parses the `{ topics: [...] }` payload, validates it, and — on success —
 * writes `.ctoc/streaming/topics.json` ATOMICALLY. It returns a DISCRIMINATED result
 * and NEVER throws:
 *   { ok:true, topics }
 *   { ok:false, reason:'no-cli' }            (binary absent — loud-skip)
 *   { ok:false, reason:'invalid-output', errors }
 *   { ok:false, reason:'empty-idea' }
 *   { ok:false, reason:'error', message }
 *
 * Written RED first, then implemented to green. Every case asserts NO throw. The spawn
 * is stubbed with a spawnSync-shaped return so no real CLI runs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const { decomposeIdea } = require('../src/lib/streaming-decompose');

// A well-formed topic list the CONTRACT accepts.
const GOOD = {
  topics: [
    {
      id: 'db', label: 'Database', critical: true,
      questions: [
        {
          id: 'engine', critical: true, prompt: 'Which database engine?',
          options: [
            { key: '1', label: 'PostgreSQL', recommended: true },
            { key: '2', label: 'SQLite' },
          ],
        },
      ],
    },
  ],
};

// spawnSync-shaped envelope whose `result` field is the model's text.
function envelope(text) {
  return { status: 0, stdout: JSON.stringify({ type: 'result', subtype: 'success', result: text }), stderr: '' };
}

function withTempRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streaming-decompose-'));
  try { return fn(root); }
  finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

const topicsFile = (root) => path.join(root, '.ctoc', 'streaming', 'topics.json');

// ---------------------------------------------------------------------------
// happy path
// ---------------------------------------------------------------------------
test('valid CLI output writes topics.json and returns { ok:true, topics }', () => {
  withTempRoot((root) => {
    let seenBin = null, seenArgs = null;
    const spawn = (bin, args) => {
      seenBin = bin; seenArgs = args;
      return envelope(JSON.stringify(GOOD));
    };
    let res;
    assert.doesNotThrow(() => { res = decomposeIdea('a note-taking app', root, { spawn }); });
    assert.equal(res.ok, true);
    assert.deepEqual(res.topics, GOOD.topics);

    // The file was written ATOMICALLY as the topics ARRAY (loadTopics' on-disk shape).
    assert.ok(fs.existsSync(topicsFile(root)), 'topics.json written');
    const onDisk = JSON.parse(fs.readFileSync(topicsFile(root), 'utf8'));
    assert.deepEqual(onDisk, GOOD.topics, 'the array itself is written, not { topics: [...] }');

    // No leftover temp file in the streaming dir.
    const dir = path.join(root, '.ctoc', 'streaming');
    const leftovers = fs.readdirSync(dir).filter(f => f !== 'topics.json');
    assert.deepEqual(leftovers, [], 'no temp file left behind');

    // Cross-platform binary selection mirrors the CLI helper pattern.
    assert.equal(seenBin, process.platform === 'win32' ? 'claude.cmd' : 'claude');
    assert.ok(seenArgs.includes('-p') && seenArgs.includes('--output-format') && seenArgs.includes('json'),
      'spawned with -p --output-format json');
  });
});

test('the prompt embeds BOTH the idea text and the topic/question CONTRACT', () => {
  withTempRoot((root) => {
    let seenPrompt = null;
    const spawn = (_bin, _args, options) => { seenPrompt = options.input; return envelope(JSON.stringify(GOOD)); };
    decomposeIdea('BUILD-A-CRM-XYZZY', root, { spawn });
    assert.ok(seenPrompt.includes('BUILD-A-CRM-XYZZY'), 'idea text embedded in the prompt');
    for (const token of ['Topic', 'Question', 'Option', 'questions', 'options', 'critical', 'important', 'recommended', 'topics']) {
      assert.ok(seenPrompt.includes(token), `prompt describes the contract token "${token}"`);
    }
  });
});

test('accepts the messages-API content-array envelope shape', () => {
  withTempRoot((root) => {
    const spawn = () => ({ status: 0, stdout: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(GOOD) }] }) });
    const res = decomposeIdea('idea', root, { spawn });
    assert.equal(res.ok, true);
    assert.ok(fs.existsSync(topicsFile(root)));
  });
});

test('tolerates prose-wrapped / fenced JSON around the { topics } object', () => {
  withTempRoot((root) => {
    const text = 'Sure — here is the decomposition:\n```json\n' + JSON.stringify(GOOD) + '\n```\nHope that helps!';
    const spawn = () => envelope(text);
    const res = decomposeIdea('idea', root, { spawn });
    assert.equal(res.ok, true);
    assert.deepEqual(res.topics, GOOD.topics);
  });
});

// ---------------------------------------------------------------------------
// invalid output — never throws, never writes
// ---------------------------------------------------------------------------
test('malformed model text (not JSON) → { ok:false, reason:"invalid-output" }, NO file', () => {
  withTempRoot((root) => {
    const spawn = () => envelope('this is not json at all');
    let res;
    assert.doesNotThrow(() => { res = decomposeIdea('idea', root, { spawn }); });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid-output');
    assert.ok(Array.isArray(res.errors) && res.errors.length > 0, 'errors reported');
    assert.ok(!fs.existsSync(topicsFile(root)), 'no file written on invalid output');
  });
});

test('valid JSON but a topic that violates the CONTRACT → invalid-output, NO file', () => {
  withTempRoot((root) => {
    // Missing the required `questions` array → validateTopics rejects it.
    const bad = { topics: [{ id: 'x', label: 'X' }] };
    const spawn = () => envelope(JSON.stringify(bad));
    const res = decomposeIdea('idea', root, { spawn });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid-output');
    assert.ok(!fs.existsSync(topicsFile(root)));
  });
});

test('CLI envelope that is not JSON → invalid-output', () => {
  withTempRoot((root) => {
    const spawn = () => ({ status: 0, stdout: 'not-an-envelope' });
    const res = decomposeIdea('idea', root, { spawn });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid-output');
  });
});

test('CLI envelope with no extractable model text → invalid-output', () => {
  withTempRoot((root) => {
    const spawn = () => ({ status: 0, stdout: JSON.stringify({ type: 'result' }) });
    const res = decomposeIdea('idea', root, { spawn });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid-output');
  });
});

test('empty CLI stdout → invalid-output', () => {
  withTempRoot((root) => {
    const spawn = () => ({ status: 1, stdout: '' });
    const res = decomposeIdea('idea', root, { spawn });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid-output');
  });
});

// ---------------------------------------------------------------------------
// no-cli (loud-skip) + error branches — never throw
// ---------------------------------------------------------------------------
test('a missing binary (ENOENT) → { ok:false, reason:"no-cli" }', () => {
  withTempRoot((root) => {
    const spawn = () => ({ error: Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) });
    let res;
    assert.doesNotThrow(() => { res = decomposeIdea('idea', root, { spawn }); });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'no-cli');
    assert.ok(!fs.existsSync(topicsFile(root)), 'no file written when the CLI is absent');
  });
});

test('a non-ENOENT spawn error → { ok:false, reason:"error" }', () => {
  withTempRoot((root) => {
    const spawn = () => ({ error: Object.assign(new Error('permission denied'), { code: 'EACCES' }) });
    const res = decomposeIdea('idea', root, { spawn });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'error');
    assert.ok(res.message && res.message.length > 0);
  });
});

test('a spawn that THROWS is caught → { ok:false, reason:"error" }, no throw', () => {
  withTempRoot((root) => {
    const spawn = () => { throw new Error('boom'); };
    let res;
    assert.doesNotThrow(() => { res = decomposeIdea('idea', root, { spawn }); });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'error');
    assert.equal(res.message, 'boom');
  });
});

// ---------------------------------------------------------------------------
// empty idea — short-circuits before any spawn
// ---------------------------------------------------------------------------
test('a blank idea → { ok:false, reason:"empty-idea" } and the CLI is never spawned', () => {
  withTempRoot((root) => {
    let spawned = false;
    const spawn = () => { spawned = true; return envelope(JSON.stringify(GOOD)); };
    for (const blank of ['', '   ', '\n\t ']) {
      const res = decomposeIdea(blank, root, { spawn });
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'empty-idea');
    }
    // A non-string idea is also "empty".
    const res2 = decomposeIdea(undefined, root, { spawn });
    assert.equal(res2.reason, 'empty-idea');
    assert.equal(spawned, false, 'spawn short-circuited for an empty idea');
    assert.ok(!fs.existsSync(topicsFile(root)));
  });
});

// ---------------------------------------------------------------------------
// default spawn path (no opts.spawn) — exercises the REAL child_process.spawnSync
// against a guaranteed-absent binary (via opts.bin) so no live model is invoked. A
// missing binary fails soft to no-cli, NEVER throws and NEVER writes a file.
// ---------------------------------------------------------------------------
test('the default (real) spawn path against an absent binary fails soft to no-cli', () => {
  withTempRoot((root) => {
    let res;
    assert.doesNotThrow(() => {
      res = decomposeIdea('a real idea with no stub', root, { bin: 'ctoc-no-such-binary-xyzzy' });
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'no-cli', 'a guaranteed-absent binary is a loud-skip');
    assert.ok(!fs.existsSync(topicsFile(root)));
  });
});

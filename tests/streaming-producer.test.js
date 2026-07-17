'use strict';

/**
 * Tests for `streaming-producer` — the BACKGROUND generation half of "precompute
 * questions, never wait". It is the ONE missing pipe: it dispatches a CTOC producer
 * agent to PRODUCE decision questions for a plan and writes them, through the REAL
 * `streaming-precompute.writePlanQuestions`, into the streaming questions store the
 * foreground screen reads.
 *
 * The module NEVER authors a question. It is a PIPE: dispatch → validate against the
 * REAL `validatePlanQuestions` → write via the REAL `writePlanQuestions`; read back
 * through the REAL `loadPlanQuestions` / `hasEnoughInformation`. Every case here uses
 * those real functions — nothing about the store schema is faked, so a schema drift
 * cannot hide.
 *
 * `dispatch(ref, planText, stage) -> Promise<questions[]>` is the INJECTED seam. Tests
 * pass a deterministic fake — no spawn, no model, no network. `defaultDispatch` (the
 * shipped default) is exercised with the SPAWN boundary stubbed; a real model is never
 * spawned.
 *
 * Written RED first (module absent), then implemented to green.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  produceForPlan,
  produceAllNeeded,
  defaultDispatch,
  STAGE_AGENTS,
} = require('../src/lib/streaming-producer');

const {
  loadPlanQuestions,
  hasEnoughInformation,
  questionsPath,
} = require('../src/lib/streaming-precompute');

// ── fixtures ──────────────────────────────────────────────────────────────────

// A well-formed question set the REAL validatePlanQuestions accepts.
const GOOD_QUESTIONS = [
  {
    id: 'db-engine',
    prompt: 'Which database engine backs this plan?',
    critical: true,
    options: [
      { key: 'pg', label: 'PostgreSQL', recommended: true, pros: 'RLS', cons: 'ops' },
      { key: 'sqlite', label: 'SQLite' },
    ],
  },
  {
    id: 'auth',
    prompt: 'How do users authenticate?',
    important: true,
    options: [
      { key: 'clerk', label: 'Clerk', recommended: true },
    ],
  },
];

async function withTempRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streaming-producer-'));
  try { return await fn(root); }
  finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

// Seed a real plan file so plansNeedingQuestions / produceForPlan can read it.
function seedPlan(root, stage, name, { critical = false } = {}) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const front = [
    '---',
    `title: "${name}"`,
    'type: implementation',
    critical ? 'priority: CRITICAL' : 'priority: normal',
    'files:',
    `  - "src/${name}.js"`,
    '---',
    '',
    `# ${name}`,
    '',
    'Body text of the plan.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, `${name}.md`), front, 'utf8');
  return `${stage}/${name}.md`;
}

// The number of written question store files on disk (excludes temp files).
function countQuestionFiles(root) {
  const dir = path.join(root, '.ctoc', 'streaming', 'questions');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
}

// A spawnSync-shaped envelope whose CLI `result` field carries the model's text.
function envelope(text) {
  return { status: 0, stdout: JSON.stringify({ type: 'result', subtype: 'success', result: text }), stderr: '' };
}

// ── Case 1: writes valid questions to the store ─────────────────────────────────

test('produceForPlan writes valid questions to the store (real loadPlanQuestions)', async () => {
  await withTempRoot(async (root) => {
    const ref = seedPlan(root, 'functional', 'plan-one');
    const dispatch = async () => GOOD_QUESTIONS;

    const res = await produceForPlan(root, ref, dispatch);
    assert.equal(res.written, true);
    assert.equal(res.count, 2);

    const loaded = loadPlanQuestions(root, ref);
    assert.ok(Array.isArray(loaded), 'store entry loads through the REAL loadPlanQuestions');
    assert.equal(loaded.length, 2);
    assert.deepEqual(loaded.map(q => q.id), ['db-engine', 'auth']);
  });
});

// ── Case 2: REJECTS invalid questions and writes nothing ────────────────────────

test('produceForPlan REJECTS invalid questions and writes nothing', async () => {
  await withTempRoot(async (root) => {
    const ref = seedPlan(root, 'functional', 'plan-two');
    const dispatch = async () => [{ prompt: 'no id and no options' }];

    const res = await produceForPlan(root, ref, dispatch);
    assert.equal(res.written, false);
    assert.match(res.reason, /id|options/i, 'reason names the validation failure');

    assert.equal(loadPlanQuestions(root, ref), null);
    assert.equal(fs.existsSync(questionsPath(root, ref)), false, 'NO file was created');
  });
});

// ── Case 3: a throwing dispatch is fail-soft ────────────────────────────────────

test('produceForPlan on a throwing dispatch is fail-soft (no crash, no file)', async () => {
  await withTempRoot(async (root) => {
    const ref = seedPlan(root, 'functional', 'plan-three');
    const dispatch = async () => { throw new Error('dispatch exploded'); };

    let res;
    await assert.doesNotReject(async () => { res = await produceForPlan(root, ref, dispatch); });
    assert.equal(res.written, false);
    assert.match(res.reason, /exploded/);
    assert.equal(fs.existsSync(questionsPath(root, ref)), false);
  });
});

// ── Case 4: an empty question set is written as [] ──────────────────────────────

test('an empty question set is written as [] and reads as ENOUGH information', async () => {
  await withTempRoot(async (root) => {
    const ref = seedPlan(root, 'functional', 'plan-four');
    const dispatch = async () => [];

    const res = await produceForPlan(root, ref, dispatch);
    assert.equal(res.written, true);
    assert.equal(res.count, 0);

    const loaded = loadPlanQuestions(root, ref);
    assert.ok(Array.isArray(loaded), 'the store entry EXISTS (not null)');
    assert.equal(loaded.length, 0);

    const verdict = hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, true, 'a computed empty set is "enough information"');
  });
});

// ── Case 5: produceAllNeeded drains the real queue and never exceeds max ─────────

test('produceAllNeeded drains the real queue and never exceeds max', async () => {
  await withTempRoot(async (root) => {
    seedPlan(root, 'functional', 'need-a');
    seedPlan(root, 'functional', 'need-b');
    seedPlan(root, 'functional', 'need-c');
    const dispatch = async () => GOOD_QUESTIONS;

    const summary = await produceAllNeeded(root, dispatch, { max: 2 });
    assert.equal(summary.attempted, 2, 'exactly max attempted this pass');
    assert.equal(summary.written, 2);
    assert.equal(countQuestionFiles(root), 2, 'the third plan is untouched');
  });
});

// ── Case 6: one plan failing does not stop the others ───────────────────────────

test('produceAllNeeded — one plan failing does not stop the others', async () => {
  await withTempRoot(async (root) => {
    seedPlan(root, 'functional', 'ok-alpha');
    seedPlan(root, 'functional', 'boom-beta');
    seedPlan(root, 'functional', 'ok-gamma');
    const dispatch = async (ref) => {
      if (ref.includes('boom-beta')) throw new Error('beta failed');
      return GOOD_QUESTIONS;
    };

    const summary = await produceAllNeeded(root, dispatch, { max: 10 });
    assert.equal(summary.attempted, 3);
    assert.equal(summary.written, 2, 'alpha and gamma still written');
    assert.equal(summary.skipped.length, 1);
    assert.match(summary.skipped[0].ref, /boom-beta/);
    assert.match(summary.skipped[0].reason, /beta failed/);

    assert.ok(fs.existsSync(questionsPath(root, 'functional/ok-alpha.md')));
    assert.ok(fs.existsSync(questionsPath(root, 'functional/ok-gamma.md')));
    assert.equal(fs.existsSync(questionsPath(root, 'functional/boom-beta.md')), false);
  });
});

// ── Case 7: defaultDispatch loud-skips when claude is absent ─────────────────────

test('defaultDispatch loud-skips (returns [], logs) when claude is absent — never throws', async () => {
  const logged = [];
  const enoent = () => {
    const err = new Error('spawn claude ENOENT');
    err.code = 'ENOENT';
    return { error: err };
  };

  let result;
  await assert.doesNotReject(async () => {
    result = await defaultDispatch('functional/x.md', '# x', 'functional', {
      spawn: enoent,
      log: (reason) => logged.push(reason),
    });
  });
  assert.deepEqual(result, [], 'returns the empty array — never a fabricated question');
  assert.ok(logged.length >= 1, 'a reason was logged');
  assert.match(logged.join(' '), /cli|claude|binary|enoent/i);
});

// ── Case 8: defaultDispatch maps stage to the REAL CTOC agent ────────────────────

test('defaultDispatch maps stage to the real CTOC agent (argv) and unknown stage skips', async () => {
  // functional → product-owner
  let argvF = null;
  const spawnF = (bin, args) => { argvF = args; return envelope(JSON.stringify({ questions: GOOD_QUESTIONS })); };
  const qF = await defaultDispatch('functional/a.md', '# a', 'functional', { spawn: spawnF });
  assert.deepEqual(qF.map(q => q.id), ['db-engine', 'auth']);
  assert.match(argvF.join(' '), /product-owner/);

  // implementation → implementation-planner
  let argvI = null;
  const spawnI = (bin, args) => { argvI = args; return envelope(JSON.stringify({ questions: GOOD_QUESTIONS })); };
  await defaultDispatch('implementation/b.md', '# b', 'implementation', { spawn: spawnI });
  assert.match(argvI.join(' '), /implementation-planner/);

  // unknown stage → skip WITHOUT spawning
  let spawnedForUnknown = false;
  const spawnU = () => { spawnedForUnknown = true; return envelope('{}'); };
  const qU = await defaultDispatch('review/c.md', '# c', 'review', { spawn: spawnU });
  assert.deepEqual(qU, []);
  assert.equal(spawnedForUnknown, false, 'a stage with no producer agent never spawns');

  // Every mapped agent name resolves to a REAL file under agents/planning/ (no ghost).
  const agentsDir = path.join(__dirname, '..', 'agents', 'planning');
  for (const [stage, agent] of Object.entries(STAGE_AGENTS)) {
    const file = path.join(agentsDir, `${agent}.md`);
    assert.ok(fs.existsSync(file), `stage ${stage} → ${agent}.md must exist under agents/planning/`);
  }
});

// ── Case 10: produceForPlan input guards are all fail-soft ──────────────────────

test('produceForPlan guards: bad root, non-function dispatch, bad ref, missing plan', async () => {
  await withTempRoot(async (root) => {
    const good = async () => GOOD_QUESTIONS;

    assert.deepEqual((await produceForPlan('', 'functional/x.md', good)).written, false);
    assert.deepEqual((await produceForPlan(root, 'functional/x.md', null)).written, false);

    const badRef = await produceForPlan(root, 'no-slash-here', good);
    assert.equal(badRef.written, false);
    assert.match(badRef.reason, /invalid ref/);

    const traversal = await produceForPlan(root, 'functional/../../etc/passwd', good);
    assert.equal(traversal.written, false);

    const missing = await produceForPlan(root, 'functional/does-not-exist.md', good);
    assert.equal(missing.written, false);
    assert.match(missing.reason, /unreadable/);
  });
});

// ── Case 11: a non-array dispatch return is rejected (not fabricated into one) ────

test('produceForPlan rejects a non-array dispatch return and writes nothing', async () => {
  await withTempRoot(async (root) => {
    const ref = seedPlan(root, 'functional', 'plan-nonarray');
    const dispatch = async () => null;
    const res = await produceForPlan(root, ref, dispatch);
    assert.equal(res.written, false);
    assert.match(res.reason, /invalid questions/);
    assert.equal(fs.existsSync(questionsPath(root, ref)), false);
  });
});

// ── Case 12: produceAllNeeded on an empty queue is a clean no-op ─────────────────

test('produceAllNeeded on a root with no pending plans is a clean no-op', async () => {
  await withTempRoot(async (root) => {
    const summary = await produceAllNeeded(root, async () => GOOD_QUESTIONS);
    assert.deepEqual(summary, { attempted: 0, written: 0, skipped: [] });
  });
});

// ── Case 13: defaultDispatch fail-soft matrix — every bad shape returns [] ────────

test('defaultDispatch is fail-soft for every malformed spawn result (returns [], never throws)', async () => {
  const logged = [];
  const log = (r) => logged.push(r);
  const call = (spawn) => defaultDispatch('functional/x.md', '# x', 'functional', { spawn, log });

  // non-ENOENT spawn error
  const spawnErr = () => ({ error: Object.assign(new Error('boom'), { code: 'EPERM' }) });
  assert.deepEqual(await call(spawnErr), []);

  // empty stdout
  assert.deepEqual(await call(() => ({ status: 0, stdout: '' })), []);

  // envelope is not JSON
  assert.deepEqual(await call(() => ({ status: 0, stdout: 'not json' })), []);

  // envelope has no model text
  assert.deepEqual(await call(() => ({ status: 0, stdout: JSON.stringify({ type: 'result' }) })), []);

  // model text is not JSON
  assert.deepEqual(await call(() => envelope('the model wrote prose, no json')), []);

  // model returns a structurally invalid question set
  assert.deepEqual(await call(() => envelope(JSON.stringify({ questions: [{ prompt: 'no id' }] }))), []);

  assert.ok(logged.length >= 6, 'every skip logged a reason');
});

// ── Case 14: defaultDispatch default log path (no injected logger) ───────────────

test('defaultDispatch works without an injected logger (default log path)', async () => {
  const origWarn = console.warn;
  console.warn = () => {}; // silence the default loud-skip during the test
  try {
    // unknown stage → skip with the DEFAULT logger, no throw
    const skipped = await defaultDispatch('review/x.md', '# x', 'review');
    assert.deepEqual(skipped, []);

    // a valid model result flows through the default (no opts.log) path
    const spawn = () => envelope(JSON.stringify({ questions: GOOD_QUESTIONS }));
    const ok = await defaultDispatch('functional/x.md', '# x', 'functional', { spawn });
    assert.deepEqual(ok.map(q => q.id), ['db-engine', 'auth']);
  } finally {
    console.warn = origWarn;
  }
});

// ── Case 15: a write I/O failure surfaces as {written:false, reason:'write failed'} ─

test('produceForPlan surfaces a write failure (writePlanQuestions !ok) when the store dir is unwritable', async () => {
  await withTempRoot(async (root) => {
    const ref = seedPlan(root, 'functional', 'plan-writefail');
    // Collide the questions DIRECTORY path with a FILE: the atomic temp-write then
    // hits ENOTDIR (its parent is a file), so writePlanQuestions returns {ok:false}
    // WITHOUT throwing — exactly the 'write failed' branch of produceForPlan.
    fs.mkdirSync(path.join(root, '.ctoc', 'streaming'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'streaming', 'questions'), 'i am a file, not a directory');

    const res = await produceForPlan(root, ref, async () => GOOD_QUESTIONS);
    assert.equal(res.written, false);
    assert.match(res.reason, /write failed/i, 'the reason names the write failure');
    // and nothing readable was persisted
    assert.equal(loadPlanQuestions(root, ref), null);
  });
});

// ── Case 16: an unexpected throw during write hits the belt-and-suspenders catch ──

test('produceForPlan is fail-soft when writing throws unexpectedly (outer catch, JSON non-serializable)', async () => {
  await withTempRoot(async (root) => {
    const ref = seedPlan(root, 'functional', 'plan-circular');
    // A question that PASSES the contract (id/prompt/options all present; the extra
    // `self` field is ignored by validatePlanQuestions) but is NON-SERIALIZABLE: the
    // circular reference makes JSON.stringify throw at the point writePlanQuestions
    // serializes it — which is OUTSIDE writePlanQuestions' own try — so the throw
    // propagates up to produceForPlan's outer catch (the 'unexpected' branch).
    const q = { id: 'q1', prompt: 'a valid prompt', options: [{ key: 'k', label: 'the only option' }] };
    q.self = q;
    const dispatch = async () => [q];

    let res;
    await assert.doesNotReject(async () => { res = await produceForPlan(root, ref, dispatch); });
    assert.equal(res.written, false);
    assert.match(res.reason, /unexpected/i, 'the reason marks it as the unexpected branch');
    assert.match(res.reason, /circular/i, 'and names the real serialization failure');
    assert.equal(fs.existsSync(questionsPath(root, ref)), false, 'nothing was persisted');
  });
});

// ── Case 17: produceAllNeeded is fail-soft when the queue lookup itself throws ────

test('produceAllNeeded degrades to a clean no-op when plansNeedingQuestions throws (needing → [])', async () => {
  // plansNeedingQuestions is internally fail-soft, so the ONLY honest way to exercise
  // produceAllNeeded's defensive catch is to replace that DEPENDENCY with a throwing
  // one (a real dependency seam — not a double of the module's own logic) and prove
  // produceAllNeeded still returns the clean empty summary rather than crashing.
  const precomputePath = require.resolve('../src/lib/streaming-precompute');
  const producerPath = require.resolve('../src/lib/streaming-producer');
  const realPrecompute = require('../src/lib/streaming-precompute');
  const savedPre = require.cache[precomputePath];
  const savedProd = require.cache[producerPath];

  delete require.cache[producerPath];
  require.cache[precomputePath] = {
    id: precomputePath, filename: precomputePath, loaded: true,
    exports: Object.assign({}, realPrecompute, {
      plansNeedingQuestions: () => { throw new Error('queue lookup detonated'); },
    }),
  };

  try {
    const freshProducer = require('../src/lib/streaming-producer');
    let summary;
    await assert.doesNotReject(async () => {
      summary = await freshProducer.produceAllNeeded('/whatever/root', async () => []);
    });
    assert.deepEqual(summary, { attempted: 0, written: 0, skipped: [] },
      'a throwing queue lookup yields the clean empty drain summary');
  } finally {
    delete require.cache[producerPath];
    if (savedPre) require.cache[precomputePath] = savedPre; else delete require.cache[precomputePath];
    if (savedProd) require.cache[producerPath] = savedProd; else delete require.cache[producerPath];
  }
});

// ── Case 18: the REAL defaultSpawn runs (harmless node subprocess, no model) ──────

test('defaultDispatch uses the REAL defaultSpawn when no spawn is injected (harmless node, no model)', async () => {
  // No opts.spawn → the shipped defaultSpawn (child_process.spawnSync) is exercised.
  // Point the binary at node itself: `node -p "<prompt>"` evaluates the prompt as JS,
  // which is a SyntaxError → empty stdout → defaultDispatch loud-skips to []. A REAL
  // subprocess ran (covering defaultSpawn) and NO model was ever contacted.
  const logged = [];
  let result;
  await assert.doesNotReject(async () => {
    result = await defaultDispatch('functional/real-spawn.md', '# a plan', 'functional', {
      bin: process.execPath,
      log: (reason) => logged.push(reason),
    });
  });
  assert.deepEqual(result, [], 'returns the empty array — never a fabricated question');
  assert.ok(logged.length >= 1, 'the loud-skip logged a reason for the empty/failed output');
});

// ── Case 19: defaultDispatch parses the messages-API content[] envelope form ──────

test('defaultDispatch joins a messages-API content[] envelope (extractText array branch)', async () => {
  const payload = JSON.stringify({ questions: GOOD_QUESTIONS });
  // Split the JSON across two text blocks (proving the JOIN) with one non-text block
  // interleaved (proving the `? block.text : ''` false branch). The joined string is
  // the full payload → parses → the real questions flow through.
  const spawn = () => ({
    status: 0,
    stdout: JSON.stringify({
      content: [
        { type: 'text', text: payload.slice(0, 12) },
        { type: 'tool_use', name: 'noise' },
        { type: 'text', text: payload.slice(12) },
      ],
    }),
  });
  const q = await defaultDispatch('functional/content.md', '# a', 'functional', { spawn });
  assert.deepEqual(q.map(x => x.id), ['db-engine', 'auth'],
    'the questions were reconstructed from the joined content blocks');
});

// ── Case 20: a spawn that THROWS hits defaultDispatch's outer catch ───────────────

test('defaultDispatch is fail-soft when the spawn call itself throws (outer dispatch catch)', async () => {
  const logged = [];
  const spawn = () => { throw new Error('spawn detonated'); };
  let result;
  await assert.doesNotReject(async () => {
    result = await defaultDispatch('functional/boom.md', '# a', 'functional', {
      spawn,
      log: (reason) => logged.push(reason),
    });
  });
  assert.deepEqual(result, [], 'returns [] rather than crashing the background loop');
  assert.match(logged.join(' '), /unexpected dispatch failure/i, 'the catch logged its reason');
  assert.match(logged.join(' '), /spawn detonated/, 'and surfaced the underlying error');
});

// ── Case 9: no question the producer writes was invented by the producer ─────────

test('no question the producer writes was invented by the producer (pipe, not author)', async () => {
  await withTempRoot(async (root) => {
    const ref = seedPlan(root, 'functional', 'pipe-proof');
    const handed = [
      { id: 'only-q', prompt: 'The one and only question', options: [{ key: 'k', label: 'the only option' }] },
    ];
    const dispatch = async () => handed;

    const res = await produceForPlan(root, ref, dispatch);
    assert.equal(res.written, true);

    const written = loadPlanQuestions(root, ref);
    const handedIds = new Set(handed.map(q => q.id));
    const handedPrompts = new Set(handed.map(q => q.prompt));
    for (const q of written) {
      assert.ok(handedIds.has(q.id), `written id ${q.id} was handed by dispatch`);
      assert.ok(handedPrompts.has(q.prompt), `written prompt for ${q.id} was handed by dispatch`);
    }
  });
});

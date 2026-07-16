'use strict';

/**
 * PRE-COMPUTE core (streaming interaction model) — the FILE LAYER that lets the
 * foreground streaming screen read ALREADY-WRITTEN decision questions instantly.
 *
 * The model: a BACKGROUND critique subagent writes a per-plan questions file
 * AHEAD OF TIME; the FOREGROUND screen reads it with zero wait. This suite drives
 * the REAL, deterministic JS the subagent writes to and the screen reads from —
 * over real temp dirs (no mocks of core logic), asserting: ref sanitization (no
 * traversal), the questions contract validator, atomic writes, fail-soft loads
 * (absent / unparseable / invalid / STALE), and the plans-needing-questions set
 * the background dispatcher iterates.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const precompute = require('../src/lib/streaming-precompute.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-sprecomp-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

function validFunctionalBody(slug) {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n`;
}

function writePlan(root, stage, slug, body) {
  const p = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(p, body);
  return p;
}

function planMtimeMs(planPath) {
  return fs.statSync(planPath).mtimeMs;
}

// A well-formed questions array per the Question contract (id, prompt, tier flag,
// options with key/label/recommended + pros/cons).
function sampleQuestions() {
  return [
    {
      id: 'db',
      prompt: 'Which database engine?',
      critical: true,
      options: [
        { key: 'pg', label: 'Postgres', recommended: true, pros: 'Row-level security, mature', cons: 'More ops' },
        { key: 'sqlite', label: 'SQLite', pros: 'Zero-config', cons: 'No real concurrency' },
      ],
    },
    {
      id: 'auth',
      prompt: 'Which auth provider?',
      important: true,
      options: [
        { key: 'clerk', label: 'Clerk', recommended: true, description: 'Managed auth with MFA' },
        { key: 'roll', label: 'Roll your own', description: 'Full control, more risk' },
      ],
    },
  ];
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('questionsPath — sanitizes a stage/file ref into a safe flat filename (no traversal)', () => {
  it('maps a normal ref to a file under .ctoc/streaming/questions/ with no path separators in the basename', () => {
    const root = makeSandbox();
    const p = precompute.questionsPath(root, 'functional/my-plan.md');
    assert.equal(typeof p, 'string');
    const questionsDir = path.join(root, '.ctoc', 'streaming', 'questions');
    assert.ok(p.startsWith(questionsDir + path.sep), 'lives under the questions dir');
    const base = path.basename(p);
    assert.ok(base.endsWith('.json'), 'is a .json file');
    assert.ok(!base.includes('/') && !base.includes('\\'), 'no separators survive in the basename');
  });

  it('a traversal ref can NEVER escape the questions dir', () => {
    const root = makeSandbox();
    const p = precompute.questionsPath(root, 'functional/../../../etc/passwd');
    assert.equal(typeof p, 'string');
    const questionsDir = path.resolve(root, '.ctoc', 'streaming', 'questions');
    // The resolved path must stay strictly inside the questions dir.
    assert.ok(path.resolve(p).startsWith(questionsDir + path.sep), 'stays inside the questions dir');
  });

  it('returns null for a fundamentally invalid ref (non-string / empty / NUL)', () => {
    const root = makeSandbox();
    assert.equal(precompute.questionsPath(root, ''), null);
    assert.equal(precompute.questionsPath(root, 42), null);
    assert.equal(precompute.questionsPath(root, 'has\0nul'), null);
  });
});

describe('validatePlanQuestions — the questions contract', () => {
  it('accepts a well-formed questions array', () => {
    const { valid, errors } = precompute.validatePlanQuestions(sampleQuestions());
    assert.equal(valid, true, errors.join('; '));
    assert.deepEqual(errors, []);
  });

  it('rejects a non-array', () => {
    assert.equal(precompute.validatePlanQuestions(null).valid, false);
    assert.equal(precompute.validatePlanQuestions({}).valid, false);
    assert.equal(precompute.validatePlanQuestions('nope').valid, false);
  });

  it('rejects a question missing a non-empty id or prompt', () => {
    assert.equal(precompute.validatePlanQuestions([{ prompt: 'p', options: [{ key: 'k', label: 'l' }] }]).valid, false);
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', options: [{ key: 'k', label: 'l' }] }]).valid, false);
  });

  it('rejects a question with zero options (unanswerable)', () => {
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: [] }]).valid, false);
  });

  it('rejects an option missing a key or label', () => {
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: [{ label: 'l' }] }]).valid, false);
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: [{ key: 'k' }] }]).valid, false);
  });

  it('rejects duplicate question ids', () => {
    const dup = [
      { id: 'q', prompt: 'a', options: [{ key: 'k', label: 'l' }] },
      { id: 'q', prompt: 'b', options: [{ key: 'k', label: 'l' }] },
    ];
    assert.equal(precompute.validatePlanQuestions(dup).valid, false);
  });

  it('rejects a non-boolean tier flag and a non-string pros/cons/description', () => {
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', critical: 'yes', options: [{ key: 'k', label: 'l' }] }]).valid, false);
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: [{ key: 'k', label: 'l', pros: 5 }] }]).valid, false);
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: [{ key: 'k', label: 'l', description: {} }] }]).valid, false);
  });
});

describe('writePlanQuestions — atomic write of a valid file, refusal of a malformed one', () => {
  it('atomically writes { ref, planMtimeMs, questions } for a valid array', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'w1', validFunctionalBody('w1'));
    const mtime = planMtimeMs(planPath);

    const res = precompute.writePlanQuestions(root, 'functional/w1.md', sampleQuestions(), mtime);
    assert.equal(res.ok, true);

    const file = precompute.questionsPath(root, 'functional/w1.md');
    assert.ok(fs.existsSync(file), 'the questions file exists');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(parsed.ref, 'functional/w1.md');
    assert.equal(parsed.planMtimeMs, mtime);
    assert.equal(parsed.questions.length, 2);
    assert.equal(parsed.questions[0].id, 'db');
  });

  it('refuses a malformed questions array — returns {ok:false, errors} and writes NO file', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'w2', validFunctionalBody('w2'));

    const res = precompute.writePlanQuestions(root, 'functional/w2.md', [{ id: 'q', prompt: 'p', options: [] }], 123);
    assert.equal(res.ok, false);
    assert.ok(Array.isArray(res.errors) && res.errors.length > 0, 'errors are reported');

    const file = precompute.questionsPath(root, 'functional/w2.md');
    assert.ok(!fs.existsSync(file), 'no file is written for a malformed set');
  });

  it('never throws on an invalid ref — returns {ok:false}', () => {
    const root = makeSandbox();
    const res = precompute.writePlanQuestions(root, 'has\0nul', sampleQuestions(), 1);
    assert.equal(res.ok, false);
  });
});

describe('loadPlanQuestions — fail-soft, freshness-gated read', () => {
  it('returns the questions[] when the file is present and FRESH', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'L1', validFunctionalBody('L1'));
    precompute.writePlanQuestions(root, 'functional/L1.md', sampleQuestions(), planMtimeMs(planPath));

    const q = precompute.loadPlanQuestions(root, 'functional/L1.md');
    assert.ok(Array.isArray(q), 'returns an array when fresh');
    assert.equal(q.length, 2);
    assert.equal(q[0].id, 'db');
  });

  it('returns null when the file is ABSENT', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'L2', validFunctionalBody('L2'));
    assert.equal(precompute.loadPlanQuestions(root, 'functional/L2.md'), null);
  });

  it('returns null when the file is UNPARSEABLE', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'L3', validFunctionalBody('L3'));
    const file = precompute.questionsPath(root, 'functional/L3.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ this is not json ');
    assert.equal(precompute.loadPlanQuestions(root, 'functional/L3.md'), null);
  });

  it('returns null when the stored questions are INVALID', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'L4', validFunctionalBody('L4'));
    const file = precompute.questionsPath(root, 'functional/L4.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ref: 'functional/L4.md', planMtimeMs: planMtimeMs(planPath), questions: [{ id: 'q', prompt: 'p', options: [] }] }));
    assert.equal(precompute.loadPlanQuestions(root, 'functional/L4.md'), null);
  });

  it('returns null when STALE — the plan changed since the questions were generated', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'L5', validFunctionalBody('L5'));
    const oldMtime = planMtimeMs(planPath);
    precompute.writePlanQuestions(root, 'functional/L5.md', sampleQuestions(), oldMtime);

    // Fresh right now.
    assert.ok(Array.isArray(precompute.loadPlanQuestions(root, 'functional/L5.md')));

    // Bump the plan's mtime into the FUTURE — the stored mtime is now older → stale.
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(planPath, future, future);

    assert.equal(precompute.loadPlanQuestions(root, 'functional/L5.md'), null, 'a plan edited after generation invalidates its questions');
  });

  it('returns null when the referenced plan no longer exists', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'L6', validFunctionalBody('L6'));
    precompute.writePlanQuestions(root, 'functional/L6.md', sampleQuestions(), planMtimeMs(planPath));
    fs.rmSync(planPath);
    assert.equal(precompute.loadPlanQuestions(root, 'functional/L6.md'), null);
  });
});

describe('isFresh — boolean convenience over loadPlanQuestions', () => {
  it('is true only when fresh precomputed questions exist', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'F1', validFunctionalBody('F1'));
    assert.equal(precompute.isFresh(root, 'functional/F1.md'), false, 'absent → not fresh');
    precompute.writePlanQuestions(root, 'functional/F1.md', sampleQuestions(), planMtimeMs(planPath));
    assert.equal(precompute.isFresh(root, 'functional/F1.md'), true, 'present + fresh → fresh');
  });
});

describe('validatePlanQuestions — remaining structural branches', () => {
  it('rejects a non-object question element', () => {
    assert.equal(precompute.validatePlanQuestions([null]).valid, false);
    assert.equal(precompute.validatePlanQuestions(['not-an-object']).valid, false);
    assert.equal(precompute.validatePlanQuestions([['array']]).valid, false);
  });

  it('rejects a non-boolean important flag and a non-array options', () => {
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', important: 'yes', options: [{ key: 'k', label: 'l' }] }]).valid, false);
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: 'nope' }]).valid, false);
  });

  it('rejects a non-object option element', () => {
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: [null] }]).valid, false);
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: ['x'] }]).valid, false);
  });

  it('rejects a duplicate option key within a question', () => {
    const dup = [{ id: 'q', prompt: 'p', options: [{ key: 'k', label: 'a' }, { key: 'k', label: 'b' }] }];
    assert.equal(precompute.validatePlanQuestions(dup).valid, false);
  });

  it('rejects a non-boolean recommended flag on an option', () => {
    assert.equal(precompute.validatePlanQuestions([{ id: 'q', prompt: 'p', options: [{ key: 'k', label: 'l', recommended: 'yes' }] }]).valid, false);
  });
});

describe('fail-soft error paths — never throw', () => {
  it('writePlanQuestions surfaces a write failure as {ok:false} (target dir blocked by a file)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'wf', validFunctionalBody('wf'));
    // Make `.ctoc/streaming` a FILE so the questions/ dir cannot be created.
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'streaming'), 'i am a file');
    const res = precompute.writePlanQuestions(root, 'functional/wf.md', sampleQuestions(), 1);
    assert.equal(res.ok, false);
    assert.ok(Array.isArray(res.errors) && res.errors.length > 0);
  });

  it('loadPlanQuestions returns null when the questions file is UNREADABLE (a directory)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'ur', validFunctionalBody('ur'));
    const file = precompute.questionsPath(root, 'functional/ur.md');
    fs.mkdirSync(file, { recursive: true }); // the path exists but is a directory → EISDIR on read
    assert.equal(precompute.loadPlanQuestions(root, 'functional/ur.md'), null);
  });

  it('plansNeedingQuestions is fail-soft when the pending scan throws (bad root)', () => {
    // A non-string root makes getPlansDir → path.join throw inside pendingGateDecisions;
    // the outer guard degrades to an empty list rather than crashing.
    assert.deepEqual(precompute.plansNeedingQuestions(12345), []);
  });
});

describe('plansNeedingQuestions — the set the background dispatcher must (re)generate', () => {
  it('returns exactly the pending gate plans that LACK fresh questions', () => {
    const root = makeSandbox();
    const haveP = writePlan(root, 'functional', 'have-q', validFunctionalBody('have-q'));
    writePlan(root, 'functional', 'need-q', validFunctionalBody('need-q'));
    const staleP = writePlan(root, 'review', 'stale-q', `# stale-q\n\nBody.\n`);

    // 'have-q' gets FRESH questions; 'need-q' gets none; 'stale-q' gets STALE questions.
    precompute.writePlanQuestions(root, 'functional/have-q.md', sampleQuestions(), planMtimeMs(haveP));
    precompute.writePlanQuestions(root, 'review/stale-q.md', sampleQuestions(), planMtimeMs(staleP));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(staleP, future, future); // makes stale-q's stored questions stale

    const needing = precompute.plansNeedingQuestions(root);
    const slugs = needing.map(d => d.slug).sort();

    assert.deepEqual(slugs, ['need-q', 'stale-q'], 'only the plans without fresh questions are returned');
    // The returned items are full pending-decision descriptors (carry a ref).
    const need = needing.find(d => d.slug === 'need-q');
    assert.equal(need.ref, 'functional/need-q.md');
  });

  it('returns an empty list when every pending plan already has fresh questions', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'only', validFunctionalBody('only'));
    precompute.writePlanQuestions(root, 'functional/only.md', sampleQuestions(), planMtimeMs(p));
    assert.deepEqual(precompute.plansNeedingQuestions(root), []);
  });

  it('is fail-soft — no pending plans yields an empty list, never a throw', () => {
    const root = makeSandbox();
    assert.deepEqual(precompute.plansNeedingQuestions(root), []);
  });
});

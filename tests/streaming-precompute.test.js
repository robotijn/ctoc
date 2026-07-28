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
// `streamAnswer` is intentionally NOT imported here. As of X6 it re-renders through
// `pendingGateDecisions`, which AUTO-CROSSES a plan that has become sufficient (moving
// it out of its stage folder). These are unit tests of the `hasEnoughInformation`
// predicate, inspected on the plan's ORIGINAL ref, so the `answer` helper below writes
// the answers log DIRECTLY — same record shape, without the cross side-effect.

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
      important: false,
      options: [
        { key: 'pg', label: 'Postgres', recommended: true, pros: 'Row-level security, mature', cons: 'More ops' },
        { key: 'sqlite', label: 'SQLite', pros: 'Zero-config', cons: 'No real concurrency' },
      ],
    },
    {
      id: 'auth',
      prompt: 'Which auth provider?',
      critical: false,
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

// ═══════════════════════════════════════════════════════════════════════════════
// THE ENOUGH-INFORMATION GATE
//
// The gate condition is ENOUGH INFORMATION to build without guessing. That needs
// two things `loadPlanQuestions` cannot give a caller:
//
//   1. WHY the questions are not ready. `loadPlanQuestions` collapses SIX distinct
//      situations — absent, unreadable, unparseable, structurally wrong, questions
//      invalid, STALE (and a gone/malformed plan) — into ONE `null`. All of them
//      must fail the gate CLOSED, but "never computed" (→ generate them) is a
//      different instruction to the dispatcher than "corrupt" (→ repair) or "the
//      plan is gone" (→ nothing to do). `planQuestionsStatus` names the reason.
//
//   2. Whether the open questions have been ANSWERED. Nothing in this module reads
//      the answers log today; the questions×answers×criticality cross-reference —
//      the actual gate arithmetic — does not exist anywhere yet.
//
// NOTE ON A CLAIM THIS SUITE DELIBERATELY FALSIFIES: `loadPlanQuestions` does NOT
// conflate "computed, nothing to ask" with "never computed". It already returns
// `[]` for the former and `null` for the latter (pinned below). The conflation is
// among the SIX not-ready reasons, not between zero-questions and no-file.
// ═══════════════════════════════════════════════════════════════════════════════

/** Questions spanning all three tiers: one critical, one important, one normal. */
function tieredQuestions() {
  return [
    {
      id: 'crit', prompt: 'Which datastore? (load-bearing)', critical: true, important: false,
      options: [{ key: 'pg', label: 'Postgres', recommended: true }, { key: 'sqlite', label: 'SQLite' }],
    },
    {
      id: 'imp', prompt: 'Which auth provider? (load-bearing)', critical: false, important: true,
      options: [{ key: 'clerk', label: 'Clerk', recommended: true }, { key: 'roll', label: 'Roll your own' }],
    },
    {
      id: 'norm', prompt: 'Which date format in the footer?', critical: false, important: false,
      options: [{ key: 'iso', label: 'ISO 8601', recommended: true }, { key: 'us', label: 'US' }],
    },
  ];
}

/** Only questions that are explicitly NOT forks — small implementation details. */
function normalOnlyQuestions() {
  return [
    { id: 'n1', prompt: 'Footer date format?', critical: false, important: false, options: [{ key: 'iso', label: 'ISO 8601' }] },
    { id: 'n2', prompt: 'Button corner radius?', critical: false, important: false, options: [{ key: 'sm', label: 'Small' }] },
  ];
}

/**
 * Record an answer to the append-only log — the SAME record `streamAnswer` writes,
 * written directly here.
 *
 * WHY NOT `streamAnswer` (X6): as of X6, `streamAnswer` re-renders through
 * `streamingGateScreen` → `pendingGateDecisions`, which AUTO-CROSSES a plan that has
 * become sufficient (moving it out of its stage folder). These are unit tests of the
 * `hasEnoughInformation` predicate, inspected on the plan's ORIGINAL ref; the cross
 * side-effect would move the plan and make that read fail closed. Writing the log
 * directly keeps read side and write side agreeing on the format without the cross.
 */
function answer(root, ref, questionId, optionKey) {
  const dir = path.join(root, '.ctoc', 'streaming');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    path.join(dir, 'answers.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), ref, questionId, optionKey }) + '\n',
    'utf8',
  );
}

/** Seed a plan at a gate stage with fresh precomputed questions. Returns its ref. */
function seedReady(root, stage, slug, questions) {
  const planPath = writePlan(root, stage, slug, validFunctionalBody(slug));
  const ref = `${stage}/${slug}.md`;
  const res = precompute.writePlanQuestions(root, ref, questions, planMtimeMs(planPath));
  assert.equal(res.ok, true, 'fixture precondition: the questions file was written');
  return { ref, planPath };
}

describe('planQuestionsStatus — splits the one null into the states the gate must tell apart', () => {
  it("'ready' — computed AND fresh — carries the questions themselves", () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'S1', sampleQuestions());

    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'ready');
    assert.ok(Array.isArray(st.questions), 'ready carries the questions');
    assert.equal(st.questions.length, 2);
    assert.equal(st.questions[0].id, 'db');
  });

  it("'ready' with questions: [] — the critique RAN and found NOTHING to ask", () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'S2', []);

    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'ready', 'an empty question set is COMPUTED, not missing');
    assert.deepEqual(st.questions, [], 'and it honestly carries zero questions');
  });

  it("'not-computed' — no file was ever generated", () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'S3', validFunctionalBody('S3'));

    const st = precompute.planQuestionsStatus(root, 'functional/S3.md');
    assert.equal(st.status, 'not-computed');
    assert.ok(!('questions' in st), 'not-computed carries no questions — there are none to carry');
  });

  it("THE DISTINCTION: 'ready' with zero questions is NOT 'not-computed'", () => {
    const root = makeSandbox();
    const { ref: computed } = seedReady(root, 'functional', 'S4a', []);
    writePlan(root, 'functional', 'S4b', validFunctionalBody('S4b'));

    const ran = precompute.planQuestionsStatus(root, computed);
    const never = precompute.planQuestionsStatus(root, 'functional/S4b.md');

    assert.equal(ran.status, 'ready', 'the critique ran and found nothing to ask');
    assert.equal(never.status, 'not-computed', 'the critique never ran at all');
    assert.notEqual(ran.status, never.status, 'these are DIFFERENT states and must never collapse');
  });

  it("'stale' — the plan changed after its questions were generated, with a reason", () => {
    const root = makeSandbox();
    const { ref, planPath } = seedReady(root, 'functional', 'S5', sampleQuestions());
    assert.equal(precompute.planQuestionsStatus(root, ref).status, 'ready', 'fresh before the edit');

    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(planPath, future, future);

    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'stale');
    assert.equal(typeof st.reason, 'string');
    assert.ok(st.reason.length > 0, 'stale explains itself');
  });

  it("'invalid' — an UNPARSEABLE file, with errors", () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'S6', validFunctionalBody('S6'));
    const file = precompute.questionsPath(root, 'functional/S6.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json at all ');

    const st = precompute.planQuestionsStatus(root, 'functional/S6.md');
    assert.equal(st.status, 'invalid');
    assert.ok(Array.isArray(st.errors) && st.errors.length > 0, 'invalid reports what is wrong');
  });

  it("'invalid' — a STRUCTURALLY wrong file (parses, but is not an object)", () => {
    const root = makeSandbox();
    const file = precompute.questionsPath(root, 'functional/S7.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });

    // Every shape a corrupt-but-parseable file really takes: an array, a bare
    // null (a truncated write), and a scalar.
    for (const junk of ['["an","array"]', 'null', '42', '"a string"']) {
      writePlan(root, 'functional', 'S7', validFunctionalBody('S7'));
      fs.writeFileSync(file, junk);
      const st = precompute.planQuestionsStatus(root, 'functional/S7.md');
      assert.equal(st.status, 'invalid', `${junk} is not a questions file`);
      assert.ok(Array.isArray(st.errors) && st.errors.length > 0, `${junk} reports what is wrong`);
    }
  });

  it("'invalid' — the stored questions fail the contract", () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'S8', validFunctionalBody('S8'));
    const file = precompute.questionsPath(root, 'functional/S8.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      ref: 'functional/S8.md', planMtimeMs: planMtimeMs(planPath),
      questions: [{ id: 'q', prompt: 'p', options: [] }], // zero options → unanswerable
    }));

    const st = precompute.planQuestionsStatus(root, 'functional/S8.md');
    assert.equal(st.status, 'invalid');
    assert.ok(st.errors.some(e => /option/i.test(e)), 'the contract error is surfaced, not swallowed');
  });

  it("'invalid' — the freshness stamp is not a finite number (freshness is unevaluable)", () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'S9', validFunctionalBody('S9'));
    const file = precompute.questionsPath(root, 'functional/S9.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      ref: 'functional/S9.md', planMtimeMs: 'not-a-number', questions: sampleQuestions(),
    }));

    assert.equal(precompute.planQuestionsStatus(root, 'functional/S9.md').status, 'invalid');
  });

  it("'invalid' — the questions path is UNREADABLE (occupied by a directory)", () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'S10', validFunctionalBody('S10'));
    const file = precompute.questionsPath(root, 'functional/S10.md');
    fs.mkdirSync(file, { recursive: true }); // exists, but reading it throws EISDIR

    assert.equal(precompute.planQuestionsStatus(root, 'functional/S10.md').status, 'invalid');
  });

  it("'unknown-plan' — a malformed ref (no stage, NUL byte, non-string, empty)", () => {
    const root = makeSandbox();
    assert.equal(precompute.planQuestionsStatus(root, 'no-slash-at-all').status, 'unknown-plan');
    assert.equal(precompute.planQuestionsStatus(root, 'has\0nul').status, 'unknown-plan');
    assert.equal(precompute.planQuestionsStatus(root, 42).status, 'unknown-plan');
    assert.equal(precompute.planQuestionsStatus(root, '').status, 'unknown-plan');
  });

  it("'unknown-plan' — the plan file is GONE, even though its questions file survives", () => {
    const root = makeSandbox();
    const { ref, planPath } = seedReady(root, 'functional', 'S11', sampleQuestions());
    fs.rmSync(planPath);

    assert.equal(precompute.planQuestionsStatus(root, ref).status, 'unknown-plan');
  });

  it('NEVER throws — a garbage root degrades to a status, not an exception', () => {
    assert.equal(precompute.planQuestionsStatus(12345, 'functional/x.md').status, 'unknown-plan');
    assert.equal(precompute.planQuestionsStatus(null, null).status, 'unknown-plan');
    assert.equal(precompute.planQuestionsStatus('', 'functional/x.md').status, 'unknown-plan');
  });
});

describe('hasEnoughInformation — THE GATE PREDICATE, and it FAILS CLOSED', () => {
  // ── Absence of evidence is NEVER evidence of absence ───────────────────────
  // Each of the four not-ready statuses is its own test: a plan we know nothing
  // about does NOT have "enough information" — we simply do not know, and
  // not-knowing is not a pass.

  it('not-computed → enough:false (a plan whose questions never ran is NOT cleared)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'G1', validFunctionalBody('G1'));

    const v = precompute.hasEnoughInformation(root, 'functional/G1.md');
    assert.equal(v.enough, false, 'never computed must NEVER read as enough');
    assert.equal(v.reason, 'not-computed');
  });

  it('stale → enough:false (questions that predate the plan prove nothing about it)', () => {
    const root = makeSandbox();
    const { ref, planPath } = seedReady(root, 'functional', 'G2', normalOnlyQuestions());
    // Even with only NORMAL questions — which would pass when fresh — staleness
    // means we do not know what the CURRENT plan would ask.
    assert.equal(precompute.hasEnoughInformation(root, ref).enough, true, 'passes while fresh');

    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(planPath, future, future);

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, false);
    assert.equal(v.reason, 'stale');
  });

  it('invalid → enough:false (a corrupt file is not a clearance)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'G3', validFunctionalBody('G3'));
    const file = precompute.questionsPath(root, 'functional/G3.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'not json');

    const v = precompute.hasEnoughInformation(root, 'functional/G3.md');
    assert.equal(v.enough, false);
    assert.equal(v.reason, 'invalid');
  });

  it('unknown-plan → enough:false (nothing is known about a plan that is not there)', () => {
    const root = makeSandbox();
    const v = precompute.hasEnoughInformation(root, 'functional/never-existed.md');
    assert.equal(v.enough, false);
    assert.equal(v.reason, 'unknown-plan');
  });

  it('EVERY non-ready status fails closed — the fail-closed default is exhaustive', () => {
    const root = makeSandbox();
    // not-computed
    writePlan(root, 'functional', 'X1', validFunctionalBody('X1'));
    // invalid
    writePlan(root, 'functional', 'X2', validFunctionalBody('X2'));
    const bad = precompute.questionsPath(root, 'functional/X2.md');
    fs.mkdirSync(path.dirname(bad), { recursive: true });
    fs.writeFileSync(bad, '~~~');
    // stale
    const { ref: staleRef, planPath: staleP } = seedReady(root, 'functional', 'X3', sampleQuestions());
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(staleP, future, future);

    const refs = ['functional/X1.md', 'functional/X2.md', staleRef, 'functional/gone.md', 'garbage-ref'];
    for (const ref of refs) {
      const v = precompute.hasEnoughInformation(root, ref);
      assert.equal(v.enough, false, `${ref} must fail CLOSED`);
      assert.notEqual(v.reason, 'enough', `${ref} must not report itself as enough`);
      assert.ok(typeof v.reason === 'string' && v.reason.length > 0, `${ref} states its reason`);
    }
  });

  // ── ready: the questions × answers × criticality arithmetic ────────────────

  it('ready + an unanswered CRITICAL question → enough:false, reason open-forks, and it is LISTED', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'G4', tieredQuestions());
    answer(root, ref, 'imp', 'clerk');
    answer(root, ref, 'norm', 'iso');
    // 'crit' left unanswered.

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, false, 'an open critical fork is never enough information');
    assert.equal(v.reason, 'open-forks');
    assert.ok(v.unanswered.some(q => q.id === 'crit'), 'the open critical fork is named, not merely counted');
    // The blocking RULE lives in one place. A caller that re-derives "critical or
    // important" from `unanswered` is where drift gets in — so the module states it.
    assert.deepEqual(v.blocking.map(q => q.id), ['crit'], 'exactly the fork that blocks');
  });

  it('ready + an unanswered IMPORTANT question → enough:false', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'G5', tieredQuestions());
    answer(root, ref, 'crit', 'pg');
    answer(root, ref, 'norm', 'iso');
    // 'imp' left unanswered.

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, false);
    assert.equal(v.reason, 'open-forks');
    assert.ok(v.unanswered.some(q => q.id === 'imp'));
  });

  it('ready + only unanswered NORMAL questions → enough:true (small details, solvable while building)', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'G6', tieredQuestions());
    answer(root, ref, 'crit', 'pg');
    answer(root, ref, 'imp', 'clerk');
    // 'norm' left unanswered — a small detail, not a fork.

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, true, 'a normal question is a detail resolvable during implementation');
    assert.ok(v.unanswered.some(q => q.id === 'norm'), 'it is still honestly reported as open');
    assert.deepEqual(v.blocking, [], 'a normal question blocks nothing');
  });

  it('ready + every question answered → enough:true', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'G7', tieredQuestions());
    answer(root, ref, 'crit', 'pg');
    answer(root, ref, 'imp', 'clerk');
    answer(root, ref, 'norm', 'iso');

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, true);
    assert.deepEqual(v.unanswered, []);
  });

  it('ready + ZERO questions → enough:true (the critique ran and found nothing to ask)', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'G8', []);

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, true, 'nothing to ask IS enough information');
    assert.deepEqual(v.unanswered, []);
  });

  // ── The answers log itself must never be trusted into a pass ───────────────

  it('a CORRUPT answers log fails CLOSED — corrupt lines never read as "all answered"', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'G9', tieredQuestions());
    const dir = path.join(root, '.ctoc', 'streaming');
    fs.mkdirSync(dir, { recursive: true });
    // Every flavour of junk a real append-only log can accumulate: unparseable
    // text, a truncated object, a line that parses to null, and a well-formed
    // record with NO questionId. None of them may clear a fork.
    fs.writeFileSync(path.join(dir, 'answers.jsonl'), [
      'not json',
      '{"broken":',
      'null',
      JSON.stringify({ ts: 'x', ref, optionKey: 'pg' }), // parses, but names no question
      '',
    ].join('\n'));

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, false, 'garbage in the log must never clear a fork');
    assert.ok(v.unanswered.some(q => q.id === 'crit'), 'the critical fork is still open');
    assert.deepEqual(v.blocking.map(q => q.id).sort(), ['crit', 'imp'], 'both forks stay closed');
  });

  it('an UNREADABLE answers log fails CLOSED with its own reason', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'G10', tieredQuestions());
    const dir = path.join(root, '.ctoc', 'streaming');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'answers.jsonl'), { recursive: true }); // EISDIR on read

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, false, 'not being able to read the answers is not a pass');
    assert.equal(v.reason, 'answers-unreadable');
  });

  it('an unreadable answers log does NOT deadlock a plan with no forks', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'G11', normalOnlyQuestions());
    const dir = path.join(root, '.ctoc', 'streaming');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'answers.jsonl'), { recursive: true });

    // No critical/important question exists, so the answers log cannot change the
    // verdict. Blocking here would be a false negative nothing could ever clear.
    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, true, 'no forks exist → the answer log is irrelevant to the verdict');
  });

  it("an answer for a DIFFERENT plan never clears this plan's fork", () => {
    const root = makeSandbox();
    const { ref: a } = seedReady(root, 'functional', 'G12a', tieredQuestions());
    const { ref: b } = seedReady(root, 'functional', 'G12b', tieredQuestions());
    // Answer every question — but on plan A only.
    answer(root, a, 'crit', 'pg');
    answer(root, a, 'imp', 'clerk');
    answer(root, a, 'norm', 'iso');

    assert.equal(precompute.hasEnoughInformation(root, a).enough, true, 'A is answered');
    const vb = precompute.hasEnoughInformation(root, b);
    assert.equal(vb.enough, false, "B's forks are untouched by A's answers");
    assert.equal(vb.reason, 'open-forks');
  });

  it('NEVER throws — a garbage root/ref degrades to a closed verdict', () => {
    assert.equal(precompute.hasEnoughInformation(12345, 'functional/x.md').enough, false);
    assert.equal(precompute.hasEnoughInformation(null, null).enough, false);
    assert.deepEqual(precompute.hasEnoughInformation(null, null).unanswered, []);
  });
});

describe('loadPlanQuestions — the Array|null contract is UNCHANGED (regression pins)', () => {
  it('still returns [] — NOT null — for a computed, fresh, empty question set', () => {
    const root = makeSandbox();
    const { ref } = seedReady(root, 'functional', 'R1', []);

    const q = precompute.loadPlanQuestions(root, ref);
    assert.deepEqual(q, [], 'an empty set loads as an empty array');
    assert.notEqual(q, null, 'and is NOT null — this was never conflated with "never computed"');
    assert.equal(precompute.isFresh(root, ref), true, 'a computed empty set is FRESH, not pending regeneration');
  });

  it('agrees with planQuestionsStatus on every state — one code path, no drift', () => {
    const root = makeSandbox();
    const { ref: ready } = seedReady(root, 'functional', 'R2', sampleQuestions());
    const { ref: empty } = seedReady(root, 'functional', 'R3', []);
    writePlan(root, 'functional', 'R4', validFunctionalBody('R4'));
    const { ref: staleRef, planPath: staleP } = seedReady(root, 'functional', 'R5', sampleQuestions());
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(staleP, future, future);

    const cases = [ready, empty, 'functional/R4.md', staleRef, 'garbage', 'functional/gone.md'];
    for (const ref of cases) {
      const st = precompute.planQuestionsStatus(root, ref);
      const loaded = precompute.loadPlanQuestions(root, ref);
      if (st.status === 'ready') {
        assert.deepEqual(loaded, st.questions, `${ref}: ready → the same questions`);
      } else {
        assert.equal(loaded, null, `${ref}: ${st.status} → null`);
      }
    }
  });
});

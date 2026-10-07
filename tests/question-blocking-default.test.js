'use strict';

/**
 * AN UNFLAGGED QUESTION BLOCKS A GATE INSTEAD OF WAVING IT THROUGH.
 *
 * The defect (streaming-precompute.js): `isBlockingQuestion` treated a MISSING
 * importance flag as the permissive value, so a question whose `critical` and
 * `important` flags were never set read as NON-blocking — twelve real, unanswered,
 * unflagged questions produced `enough: true`, and `streaming-gate` crosses the gate
 * on that verdict BEFORE rendering anything, so the human never learns the questions
 * exist.
 *
 * The fix (this suite drives it, RED-first): the absence of a declaration is not a
 * declaration of unimportance. `isBlockingQuestion` returns false ONLY when both
 * flags are present, boolean, and both `false`; every other shape blocks. In the
 * same slice `validatePlanQuestions` requires both flags as booleans on every
 * question, so a producer that omits them is refused LOUDLY at the write instead of
 * leaving a silently-permissive file three layers downstream.
 *
 * Cases 4, 5, 6, 7, 8, 9, 10, 11 and 12 are the defect and must be RED before the
 * fix. Case 9 measures it end-to-end through the exported `hasEnoughInformation`.
 * Cases 1, 2, 3 and 13 are the guards against over-correction (the fix must not make
 * every question block forever, and must not reject the real stored files).
 *
 * ONLY WEIGHTY QUESTIONS REACH THE HUMAN (cases 14-27, the owner replaced the
 * contract on 2026-10-07). A question blocks when ANY of five conditions holds, in
 * order: (1) it is malformed; (2) `critical === true`; (3) its `topic` is one of the
 * six high-stakes topics; (4) `important === true` with no `topic` (a question written
 * before `topic` existed keeps its old meaning); (5) two or more options and not
 * exactly one recommended (high uncertainty). Every other open question is decided by
 * its recommended option. An answer whose option carries `holds: true` keeps the plan
 * where it is: `hasEnoughInformation` reports `reason: 'held'`.
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
  const root = path.join(os.tmpdir(), 'ctoc-qblock-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

function writePlan(root, stage, slug) {
  const body = `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n## Problem Statement\nBroken.\n\n## Acceptance Criteria\n- [ ] works\n\n## Scope\nThe module.\n`;
  const p = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(p, body);
  return p;
}

/** A single valid option so a question is otherwise well-formed. */
function opts() {
  return [{ key: 'a', label: 'Option A' }, { key: 'b', label: 'Option B' }];
}

/** Two options, exactly one recommended — a declared detail with a known best answer. */
function recOpts() {
  return [{ key: 'a', label: 'Option A', recommended: true }, { key: 'b', label: 'Option B' }];
}

/** Appends one line to the sandbox's answers log, in the shape the real writer uses. */
function appendAnswer(root, entry) {
  const dir = path.join(root, '.ctoc', 'streaming');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'answers.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('isBlockingQuestion — absence of a declaration is not a declaration of unimportance', () => {
  it('1. critical:true blocks', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: true, important: false, options: opts() }), true);
  });

  it('2. important:true blocks', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: true, options: opts() }), true);
  });

  it('3. both explicitly false, one recommended option, does NOT block (the positive declaration is honoured)', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: false, options: recOpts() }), false);
  });

  it('3b. both explicitly false but NO recommended option BLOCKS — nobody could say which answer is better', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: false, options: opts() }), true);
  });

  it('4. both flags absent BLOCKS — the defect', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', options: opts() }), true);
  });

  it('5. critical:false, important absent BLOCKS — only half was stated', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, options: opts() }), true);
  });

  it('6. critical absent, important:false BLOCKS — only half was stated', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', important: false, options: opts() }), true);
  });

  it('7. non-boolean flags block', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: 'true', important: false, options: opts() }), true);
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: 'false', options: opts() }), true);
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: 1, important: 0, options: opts() }), true);
  });

  it('8. a non-object question blocks', () => {
    for (const junk of [null, undefined, 42, 'q', [], true]) {
      assert.equal(precompute.isBlockingQuestion(junk), true, `${JSON.stringify(junk)} must block`);
    }
  });
});

describe('hasEnoughInformation — unflagged unanswered questions do NOT wave a gate through', () => {
  it('9a. twelve unflagged unanswered questions (written directly, bypassing the writer) no longer read as enough', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'twelve');
    const ref = 'functional/twelve.md';

    // Twelve well-formed questions carrying NEITHER importance flag — the state a
    // pre-tightening producer (a shortened subagent, a truncated payload) leaves on
    // disk. Written DIRECTLY to disk, bypassing writePlanQuestions, because after the
    // tightening the writer refuses exactly this shape (case 10). BEFORE the fix this
    // exact file yielded `enough: true` (the defect, captured RED). AFTER the fix the
    // gate does NOT cross.
    //
    // FINDING vs the plan: the plan predicted this reaches `isBlockingQuestion` with
    // `blocking.length === 12` / reason `open-forks`. It does NOT — `planQuestionsStatus`
    // RE-VALIDATES questions on read (streaming-precompute.js:~430), so the tightened
    // validator classifies this file as `invalid` FIRST and `hasEnoughInformation`
    // fails closed there. Same security outcome (gate never crosses), reached one
    // layer earlier and MORE strongly (a malformed file is invalid, not merely full of
    // forks). Cases 4-8 prove the predicate directly; case 9b proves it is reached
    // end-to-end for well-declared forks.
    const questions = [];
    for (let i = 0; i < 12; i++) {
      questions.push({ id: `q${i}`, prompt: `Unflagged question ${i}?`, options: opts() });
    }
    const file = precompute.questionsPath(root, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ref, planMtimeMs: fs.statSync(planPath).mtimeMs, questions }, null, 2));

    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false, 'a flagless questions file must NEVER read as enough');
    assert.equal(verdict.reason, 'invalid', 'the tightened validator classifies a flagless file as invalid on read — fail closed');
  });

  it('9b. isBlockingQuestion is REACHED end-to-end: twelve well-declared open forks read as not-enough with blocking === 12', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'forks');
    const ref = 'functional/forks.md';

    // Twelve VALID questions (both flags present) that are each a fork (critical:true).
    // These pass the writer AND the read-validation, so the verdict is decided by
    // isBlockingQuestion — proving the predicate is live-wired into the gate path, not
    // reachable only from a unit test (Operating Lesson 16).
    const questions = [];
    for (let i = 0; i < 12; i++) {
      questions.push({ id: `q${i}`, prompt: `Fork ${i}?`, critical: true, important: false, options: opts() });
    }
    const res = precompute.writePlanQuestions(root, ref, questions, fs.statSync(planPath).mtimeMs);
    assert.equal(res.ok, true, 'well-declared forks are accepted by the writer');

    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false, 'twelve open forks are not enough to build');
    assert.equal(verdict.blocking.length, 12, 'every open fork is blocking — via isBlockingQuestion');
    assert.equal(verdict.reason, 'open-forks');
  });
});

describe('validatePlanQuestions — both importance flags are mandatory booleans', () => {
  it('10. the writer refuses a question missing critical, names the id and key, and writes NO file', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'miss-crit');
    const ref = 'functional/miss-crit.md';
    const questions = [{ id: 'needs-decl', prompt: 'p?', important: false, options: opts() }];

    const res = precompute.writePlanQuestions(root, ref, questions, fs.statSync(planPath).mtimeMs);
    assert.equal(res.ok, false, 'a question missing critical is refused');
    const joined = res.errors.join(' | ');
    assert.match(joined, /needs-decl/, 'the error names the question id');
    assert.match(joined, /critical/, 'the error names the missing key');

    const file = precompute.questionsPath(root, ref);
    assert.equal(fs.existsSync(file), false, 'a refused write leaves no file');
  });

  it('11. the writer refuses a non-boolean flag', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'bad-flag');
    const ref = 'functional/bad-flag.md';
    const questions = [{ id: 'q1', prompt: 'p?', critical: 'yes', important: false, options: opts() }];

    const res = precompute.writePlanQuestions(root, ref, questions, fs.statSync(planPath).mtimeMs);
    assert.equal(res.ok, false, 'a non-boolean flag is refused');
    const joined = res.errors.join(' | ');
    assert.match(joined, /q1/, 'the error names the question id');
    assert.match(joined, /critical/, 'the error names the mistyped key');
  });

  it('12. a refused write leaves the gate CLOSED (not-computed, never enough)', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'refused');
    const ref = 'functional/refused.md';
    const questions = [{ id: 'q1', prompt: 'p?', important: false, options: opts() }];

    const res = precompute.writePlanQuestions(root, ref, questions, fs.statSync(planPath).mtimeMs);
    assert.equal(res.ok, false, 'precondition: the malformed write is refused');

    const status = precompute.planQuestionsStatus(root, ref);
    assert.equal(status.status, 'not-computed', 'no file → not-computed, never a silent pass');
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false, 'not-computed fails closed');
    assert.notEqual(verdict.reason, 'enough');
  });

  it('13. the real stored questions files still validate under the tightened rule', () => {
    const dir = path.join(__dirname, '..', '.ctoc', 'streaming', 'questions');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
    assert.ok(files.length > 0, 'the repository ships real stored questions files to check against');
    for (const f of files) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const { valid, errors } = precompute.validatePlanQuestions(parsed.questions);
      assert.equal(valid, true, `${f} must remain valid; the tightening broke stored data: ${errors.join('; ')}`);
    }
  });
});

describe('isBlockingQuestion — only weighty questions reach the human', () => {
  const HIGH_STAKES = ['technology-stack', 'algorithm', 'data-model', 'security-posture', 'irreversible', 'cost'];

  it('14. important + topic "detail" + one recommended option does NOT block — decided by its recommendation', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: true, topic: 'detail', options: recOpts() }), false);
  });

  it('15. each of the six high-stakes topics blocks even with both flags false and one recommended option', () => {
    for (const topic of HIGH_STAKES) {
      assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: false, topic, options: recOpts() }), true, `${topic} must block`);
    }
  });

  it('16. important with NO topic still blocks — a question written before topic existed keeps its meaning (guard)', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: true, options: recOpts() }), true);
  });

  it('17. critical + topic "detail" blocks — critical always reaches the human (guard)', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: true, important: false, topic: 'detail', options: recOpts() }), true);
  });

  it('18. a single option with none recommended is a notice, not an uncertainty — does NOT block (guard)', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: false, options: [{ key: '1', label: 'Noted' }] }), false);
  });

  it('19. a detail with TWO recommended options blocks — not exactly one recommended', () => {
    const options = [{ key: 'a', label: 'A', recommended: true }, { key: 'b', label: 'B', recommended: true }];
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: true, topic: 'detail', options }), true);
  });

  it('20. a question whose options are not an array blocks — malformed, fail closed', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: false, topic: 'detail', options: 'a' }), true);
  });

  it('20b. an unknown topic blocks even when the question is otherwise a decided detail — malformed, fail closed', () => {
    for (const topic of ['stack', null, 7]) {
      assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: true, topic, options: recOpts() }), true, `${JSON.stringify(topic)} must block`);
    }
  });
});

describe('validatePlanQuestions — topic and holds are closed, optional fields', () => {
  function refused(questions) {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'closed-fields');
    const ref = 'functional/closed-fields.md';
    const res = precompute.writePlanQuestions(root, ref, questions, fs.statSync(planPath).mtimeMs);
    assert.equal(fs.existsSync(precompute.questionsPath(root, ref)), false, 'a refused write leaves no file');
    return res;
  }

  it('21. the writer refuses an unknown topic, names the question id and lists the allowed values', () => {
    const res = refused([{ id: 'q-stack', prompt: 'p?', critical: false, important: false, topic: 'stack', options: recOpts() }]);
    assert.equal(res.ok, false);
    const joined = res.errors.join(' | ');
    assert.match(joined, /q-stack/, 'the error names the question id');
    assert.match(joined, /technology-stack/, 'the error lists the allowed values');
    assert.match(joined, /detail/, 'the error lists the allowed values');
  });

  it('22. the writer refuses a non-string topic and a non-boolean holds', () => {
    assert.equal(refused([{ id: 'q1', prompt: 'p?', critical: false, important: false, topic: 7, options: recOpts() }]).ok, false);
    const res = refused([{ id: 'q2', prompt: 'p?', critical: false, important: false, options: [{ key: 'a', label: 'A', recommended: true, holds: 'yes' }] }]);
    assert.equal(res.ok, false);
    assert.match(res.errors.join(' | '), /holds/, 'the error names the mistyped field');
  });

  it('23. an unknown topic is refused on READ too — a file written around the writer reads invalid and never enough', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'bypass');
    const ref = 'functional/bypass.md';
    const file = precompute.questionsPath(root, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const questions = [{ id: 'q1', prompt: 'p?', critical: false, important: false, topic: 'stack', options: recOpts() }];
    fs.writeFileSync(file, JSON.stringify({ ref, planMtimeMs: fs.statSync(planPath).mtimeMs, questions }));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false);
    assert.equal(verdict.reason, 'invalid');
  });

  it('24. a valid topic and holds:true are accepted (guard)', () => {
    const questions = [{ id: 'q1', prompt: 'p?', critical: false, important: false, topic: 'detail', options: [{ key: 'a', label: 'A', recommended: true, holds: true }, { key: 'b', label: 'B', holds: false }] }];
    assert.deepEqual(precompute.validatePlanQuestions(questions), { valid: true, errors: [] });
  });
});

describe('hasEnoughInformation — details move on, a Hold holds', () => {
  function setup(slug, questions) {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', slug);
    const ref = `functional/${slug}.md`;
    const stamp = fs.statSync(planPath).mtimeMs;
    const res = precompute.writePlanQuestions(root, ref, questions, stamp);
    assert.equal(res.ok, true, (res.errors || []).join('; '));
    return { root, ref, stamp };
  }

  /** A gate-ruling-shaped question: Hold (recommended, holds) or Approve. */
  function ruling() {
    return {
      id: 'q99-gate-ruling', prompt: 'Lens verdict: HOLD — reason. Rule now.', critical: false, important: true,
      options: [{ key: '1', label: 'Hold until the red-team critique runs', recommended: true, holds: true }, { key: '2', label: 'Approve it across Gate 1' }]
    };
  }

  it('25. three unanswered important DETAIL questions with a recommendation are enough — they never stop the plan', () => {
    const questions = [1, 2, 3].map((i) => ({ id: `q${i}`, prompt: `Detail ${i}?`, critical: false, important: true, topic: 'detail', options: recOpts() }));
    const { root, ref } = setup('details', questions);
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, true, verdict.reason);
    assert.equal(verdict.unanswered.length, 3, 'nothing is hidden: the decided details are still reported');
    assert.equal(verdict.blocking.length, 0);
  });

  it('26. a question answered with its holds:true option keeps the plan where it is — reason "held"', () => {
    const { root, ref, stamp } = setup('held', [ruling()]);
    appendAnswer(root, { ts: new Date().toISOString(), ref, questionId: 'q99-gate-ruling', optionKey: '1', planMtimeMs: stamp });
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false);
    assert.equal(verdict.reason, 'held');
    assert.deepEqual(verdict.blocking.map((q) => q.id), ['q99-gate-ruling'], 'the held question is named');
    assert.deepEqual(verdict.answered, ['q99-gate-ruling']);
  });

  it('27. the same question answered with the other option moves the plan on', () => {
    const { root, ref, stamp } = setup('approved', [ruling()]);
    appendAnswer(root, { ts: new Date().toISOString(), ref, questionId: 'q99-gate-ruling', optionKey: '2', planMtimeMs: stamp });
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, true, verdict.reason);
    assert.equal(verdict.reason, 'enough');
  });

  it('28. the older log shape ({answer, at}) is read too, and the later answer wins', () => {
    const { root, ref } = setup('older-shape', [ruling()]);
    const later = new Date(Date.now() + 60000).toISOString();
    appendAnswer(root, { ref, questionId: 'q99-gate-ruling', answer: '2', at: later });
    appendAnswer(root, { ref, questionId: 'q99-gate-ruling', answer: '1', at: later });
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held', 'the later line (Hold) wins');
    appendAnswer(root, { ref, questionId: 'q99-gate-ruling', answer: '2', at: later });
    assert.equal(precompute.hasEnoughInformation(root, ref).enough, true, 'a later Approve releases the hold');
  });

  it('29. readAnsweredQuestionIds reports the chosen option per question, and an empty Map on a closed path', () => {
    const { root, ref, stamp } = setup('keys', [ruling()]);
    appendAnswer(root, { ts: new Date().toISOString(), ref, questionId: 'q99-gate-ruling', optionKey: '1', planMtimeMs: stamp });
    const read = precompute.readAnsweredQuestionIds(root, ref);
    assert.equal(read.keys.get('q99-gate-ruling'), '1');
    const closed = precompute.readAnsweredQuestionIds(root, 'functional/no-such-plan.md');
    assert.equal(closed.ok, false);
    assert.ok(closed.keys instanceof Map && closed.keys.size === 0);
  });
});

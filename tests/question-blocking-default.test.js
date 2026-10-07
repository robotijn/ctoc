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

/** The gate critic's record that it assigned the topics (the owner's decision of 2026-10-07). */
const CLASSIFIED = Object.freeze({ by: 'gate-critic', at: 1786000000000 });

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

  it('3. both explicitly false, topic "detail", one recommended option, does NOT block (the positive declaration is honoured)', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: false, topic: 'detail', options: recOpts() }), false);
  });

  it('3b. both explicitly false but NO recommended option BLOCKS — nobody could say which answer is better', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: false, topic: 'detail', options: opts() }), true);
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
      questions.push({ id: `q${i}`, prompt: `Fork ${i}?`, critical: true, important: false, topic: 'detail', options: opts() });
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

  it('13. a stored questions file written before topics were required is refused on read — it fails closed and is regenerated, never waved through', () => {
    const dir = path.join(__dirname, '..', '.ctoc', 'streaming', 'questions');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
    assert.ok(files.length > 0, 'the repository ships real stored questions files to check against');
    for (const f of files) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const findings = parsed.questions.filter((q) => !/^q9[89]-/.test(q.id));
      const topicless = findings.filter((q) => q.topic === undefined);
      const { valid, errors } = precompute.validatePlanQuestions(parsed.questions);
      assert.equal(valid, topicless.length === 0, `${f}: ${errors.join('; ')}`);
      if (topicless.length) assert.ok(errors.some((e) => /must declare a "topic"/.test(e)), `${f} is refused for its missing topics`);
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

  it('16. a question with NO topic blocks — topic is required, so its absence is malformed; only the reserved ruling and notice go without', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q10-x', prompt: 'p', critical: false, important: false, options: recOpts() }), true);
    assert.equal(precompute.isBlockingQuestion({ id: 'q99-gate-ruling', prompt: 'p', critical: false, important: true, options: recOpts() }), true, 'a HOLD ruling reaches the human');
    assert.equal(precompute.isBlockingQuestion({ id: 'q99-gate-ruling-r1', prompt: 'p', critical: false, important: false, options: recOpts() }), false, 'an APPROVE ruling is decided');
    assert.equal(precompute.isBlockingQuestion({ id: 'q99-gate-ruling', prompt: 'p', critical: false, important: false, topic: 'detail', options: recOpts() }), true, 'a topic on the ruling is malformed');
  });

  it('17. critical + topic "detail" blocks — critical always reaches the human (guard)', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: true, important: false, topic: 'detail', options: recOpts() }), true);
  });

  it('18. a single option with none recommended is a notice, not an uncertainty — does NOT block (guard)', () => {
    assert.equal(precompute.isBlockingQuestion({ id: 'q', prompt: 'p', critical: false, important: false, topic: 'detail', options: [{ key: '1', label: 'Noted' }] }), false);
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

describe('validatePlanQuestions — topic is closed, holds is never a question field, the text is what it shows', () => {
  function refused(questions) {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'closed-fields');
    const ref = 'functional/closed-fields.md';
    const res = precompute.writePlanQuestions(root, ref, questions, fs.statSync(planPath).mtimeMs);
    assert.equal(res.ok, false, 'the writer must refuse this file');
    assert.equal(fs.existsSync(precompute.questionsPath(root, ref)), false, 'a refused write leaves no file');
    return res.errors.join(' | ');
  }
  const detailQ = (extra) => ({ id: 'q10-x', prompt: 'p?', critical: false, important: false, topic: 'detail', options: recOpts(), ...extra });

  it('21. the writer refuses an unknown topic, names the question id and lists the allowed values', () => {
    const joined = refused([detailQ({ id: 'q-stack', topic: 'stack' })]);
    assert.match(joined, /q-stack/, 'the error names the question id');
    assert.match(joined, /technology-stack/, 'the error lists the allowed values');
    assert.match(joined, /detail/, 'the error lists the allowed values');
  });

  it('22. the writer refuses a non-string topic, and refuses `holds` on any option — a hold is the human\'s answer, recorded by CTOC', () => {
    refused([detailQ({ topic: 7 })]);
    for (const holds of [true, false, 'yes']) {
      assert.match(refused([detailQ({ options: [{ key: 'a', label: 'A', recommended: true, holds }, { key: 'b', label: 'B' }] })]), /holds/);
    }
  });

  it('23. an unknown topic is refused on READ too — a file written around the writer reads invalid and never enough', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'bypass');
    const ref = 'functional/bypass.md';
    const file = precompute.questionsPath(root, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ref, planMtimeMs: fs.statSync(planPath).mtimeMs, questions: [detailQ({ topic: 'stack' })] }));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false);
    assert.equal(verdict.reason, 'invalid');
  });

  it('24. a valid topic is accepted, and the gate ruling and coverage notice carry none (guard)', () => {
    assert.deepEqual(precompute.validatePlanQuestions([detailQ(), { ...detailQ(), id: 'q99-gate-ruling-r1', topic: undefined }]), { valid: true, errors: [] });
  });

  it('24b. a topic on the gate ruling or the coverage notice is refused — it could turn the ruling into a decided detail', () => {
    refused([detailQ({ id: 'q99-gate-ruling-r1786000000000', important: true })]);
    refused([detailQ({ id: 'q98-critique-coverage' })]);
    assert.equal(precompute.validatePlanQuestions([detailQ({ id: 'q99-gate-ruling-rx1' })]).valid, true, 'a look-alike id is an ordinary question');
  });

  it('24c. zero-width and direction-changing characters are refused in every text the human reads', () => {
    const hidden = ['\u200B', '\u200F', '\u202A', '\u202E', '\u2066', '\uFEFF'];
    for (const ch of hidden) {
      refused([detailQ({ prompt: `Approve${ch}?` })]);
      refused([detailQ({ options: [{ key: 'a', label: `A${ch}`, recommended: true }, { key: 'b', label: 'B' }] })]);
      for (const field of ['pros', 'cons', 'description']) {
        refused([detailQ({ options: [{ key: 'a', label: 'A', recommended: true, [field]: `x${ch}y` }, { key: 'b', label: 'B' }] })]);
      }
    }
  });

  it('24d. two labels the human cannot tell apart are refused: case, surrounding space and control characters do not count', () => {
    refused([detailQ({ options: [{ key: 'a', label: 'Approve', recommended: true }, { key: 'b', label: ' approve\u0007 ' }] })]);
  });

  it('24e. more than three options is refused', () => {
    refused([detailQ({ options: [1, 2, 3, 4].map((k) => ({ key: String(k), label: `L${k}`, recommended: k === 1 })) })]);
  });

  it('24f. a single option with no recommendation on a weighty topic is refused; on a detail it is a notice (guard)', () => {
    refused([detailQ({ topic: 'algorithm', options: [{ key: '1', label: 'Noted' }] })]);
    assert.equal(precompute.validatePlanQuestions([detailQ({ options: [{ key: '1', label: 'Noted' }] })]).valid, true);
  });
});

describe('hasEnoughInformation — details move on; a Hold is the human\'s, read from the answers log', () => {
  function setup(slug, questions, stage = 'functional', classification = CLASSIFIED) {
    const root = makeSandbox();
    const planPath = writePlan(root, stage, slug);
    const ref = `${stage}/${slug}.md`;
    const stamp = fs.statSync(planPath).mtimeMs;
    const res = precompute.writePlanQuestions(root, ref, questions, stamp, undefined, classification);
    assert.equal(res.ok, true, (res.errors || []).join('; '));
    return { root, ref, stamp };
  }

  /** A gate-ruling-shaped question. Its options carry no hold: holds live in the log. */
  function ruling() {
    return {
      id: 'q99-gate-ruling', prompt: 'Lens verdict: HOLD — reason. Rule now.', critical: false, important: true,
      options: [{ key: '1', label: 'Hold until the red-team critique runs', recommended: true }, { key: '2', label: 'Approve it across Gate 1' }]
    };
  }
  const answer = (ref, stamp, optionKey, extra) => ({ ts: new Date().toISOString(), ref, questionId: 'q99-gate-ruling', optionKey, planMtimeMs: stamp, ...extra });

  it('25. three unanswered important DETAIL questions with a recommendation are enough — they never stop the plan', () => {
    const questions = [1, 2, 3].map((i) => ({ id: `q1${i}-d`, prompt: `Detail ${i}?`, critical: false, important: true, topic: 'detail', options: recOpts() }));
    const { root, ref } = setup('details', questions);
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, true, verdict.reason);
    assert.equal(verdict.unanswered.length, 3, 'nothing is hidden: the decided details are still reported');
    assert.equal(verdict.blocking.length, 0);
  });

  it('26. an answer the log records with holds:true keeps the plan where it is — reason "held"', () => {
    const { root, ref, stamp } = setup('held', [ruling()]);
    appendAnswer(root, answer(ref, stamp, '1', { holds: true }));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false);
    assert.equal(verdict.reason, 'held');
    assert.deepEqual(verdict.blocking.map((q) => q.id), ['q99-gate-ruling'], 'the held question is named');
    assert.deepEqual(verdict.answered, ['q99-gate-ruling']);
  });

  it('27. the same answer without holds moves the plan on — the question file cannot hold it', () => {
    const { root, ref, stamp } = setup('approved', [ruling()]);
    appendAnswer(root, answer(ref, stamp, '1'));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, true, verdict.reason);
    assert.equal(verdict.reason, 'enough');
  });

  it('27b. a hold outlives the revision it was given on, and the stage the plan was in', () => {
    const { root, ref, stamp } = setup('outlives', [ruling()], 'implementation');
    appendAnswer(root, answer('functional/outlives.md', stamp - 5000, '1', { holds: true }));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.reason, 'held');
    assert.deepEqual(verdict.answered, [], 'the old-revision answer binds nothing, yet the hold stands');
  });

  it('27c. a hold on a question the current revision no longer has still holds, and names its id', () => {
    const { root, ref, stamp } = setup('gone-q', [ruling()]);
    appendAnswer(root, { ts: new Date().toISOString(), ref, questionId: 'q10-removed', optionKey: '1', planMtimeMs: stamp, holds: true });
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.reason, 'held');
    assert.deepEqual(verdict.blocking, [{ id: 'q10-removed' }]);
  });

  it('28. only a LATER answer releases a hold; an entry that records no answer changes nothing; the older log shape counts', () => {
    const { root, ref } = setup('older-shape', [ruling()]);
    const later = new Date(Date.now() + 60000).toISOString();
    appendAnswer(root, { ref, questionId: 'q99-gate-ruling', answer: '2', at: later });
    appendAnswer(root, { ref, questionId: 'q99-gate-ruling', answer: '1', at: later, holds: true });
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held', 'the later line (the hold) wins');
    appendAnswer(root, { ref, questionId: 'q99-gate-ruling', at: later });
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held', 'a line with no answer releases nothing');
    appendAnswer(root, { ref, questionId: 'q99-gate-ruling', answer: '2', at: later });
    assert.equal(precompute.hasEnoughInformation(root, ref).enough, true, 'a later answer without holds releases it');
  });

  it('29. readAnsweredQuestionIds reports the chosen option and the holds, and empty ones on a closed path', () => {
    const { root, ref, stamp } = setup('keys', [ruling()]);
    appendAnswer(root, answer(ref, stamp, '1', { holds: true }));
    const read = precompute.readAnsweredQuestionIds(root, ref);
    assert.equal(read.keys.get('q99-gate-ruling'), '1');
    assert.deepEqual(read.held, ['q99-gate-ruling']);
    const closed = precompute.readAnsweredQuestionIds(root, 'functional/no-such-plan.md');
    assert.equal(closed.ok, false);
    assert.ok(closed.keys instanceof Map && closed.keys.size === 0);
    assert.deepEqual(closed.held, []);
  });

  it('29b. an answer whose key is none of the question\'s options does not count as answered', () => {
    const { root, ref, stamp } = setup('bad-key', [{ ...ruling(), critical: true }]);
    appendAnswer(root, answer(ref, stamp, '7'));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.reason, 'open-forks');
    assert.deepEqual(verdict.answered, []);
    assert.equal(verdict.unboundAnswers, 1, 'the bad answer is reported, not silently dropped');
  });

  it('36. an author\'s own file labelling a database switch "detail" BLOCKS — the author never grades its own question', () => {
    const q = { id: 'q10-switch-database', prompt: 'Move the store from SQLite to Postgres?', critical: false, important: false, topic: 'detail', options: recOpts() };
    const { root, ref } = setup('author-only', [q], 'functional', null);
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.reason, 'open-forks');
    assert.deepEqual(verdict.blocking.map((x) => x.id), ['q10-switch-database']);
    assert.equal(precompute.planQuestionsStatus(root, ref).classified, false);
  });

  it('37. the same question in a file the gate critic classified as "detail", one recommended option, is decided by default', () => {
    const q = { id: 'q10-switch-database', prompt: 'Move the store from SQLite to Postgres?', critical: false, important: false, topic: 'detail', options: recOpts() };
    const { root, ref } = setup('classified', [q]);
    assert.equal(precompute.planQuestionsStatus(root, ref).classified, true);
    assert.equal(precompute.hasEnoughInformation(root, ref).enough, true);
  });

  it('38. a classification block that is not exactly { by: "gate-critic", at: <ms> } does not count', () => {
    const q = { id: 'q10-d', prompt: 'p?', critical: false, important: false, topic: 'detail', options: recOpts() };
    const forged = [
      { by: 'product-owner', at: 1786000000000 },
      { by: 'gate-critic' },
      { by: 'gate-critic', at: '1786000000000' },
      { by: 'gate-critic', at: -1 },
      { by: 'gate-critic', at: 1.5 },
      { by: 'gate-critic', at: 1786000000000, also: 'x' },
      ['gate-critic', 1786000000000],
      'gate-critic',
    ];
    for (const [i, c] of forged.entries()) {
      const { root, ref } = setup(`forged-${i}`, [q], 'functional', c);
      assert.equal(precompute.planQuestionsStatus(root, ref).classified, false, JSON.stringify(c));
      assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'open-forks', JSON.stringify(c));
    }
  });

  it('39. the writer carries a classification object verbatim and leaves the file\'s shape unchanged without one', () => {
    const q = { id: 'q10-d', prompt: 'p?', critical: false, important: false, topic: 'detail', options: recOpts() };
    const a = setup('carried', [q]);
    assert.deepEqual(JSON.parse(fs.readFileSync(precompute.questionsPath(a.root, a.ref), 'utf8')).classification, CLASSIFIED);
    const b = setup('bare', [q], 'functional', null);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(precompute.questionsPath(b.root, b.ref), 'utf8'))), ['ref', 'planMtimeMs', 'questions']);
  });

  it('40. topic is required on every question but the gate ruling and the coverage notice', () => {
    const errors = precompute.validatePlanQuestions([{ id: 'q10-no-topic', prompt: 'p?', critical: false, important: false, options: recOpts() }]).errors;
    assert.ok(errors.some((e) => /q10-no-topic/.test(e) && /must declare a "topic"/.test(e)), errors.join('; '));
    const reserved = [
      { id: 'q98-critique-coverage', prompt: 'Coverage', critical: false, important: false, options: [{ key: '1', label: 'Noted', recommended: true }] },
      { id: 'q99-gate-ruling-r1', prompt: 'Lens verdict: APPROVE — r. Rule now.', critical: false, important: false, options: recOpts() },
    ];
    assert.deepEqual(precompute.validatePlanQuestions(reserved), { valid: true, errors: [] });
  });

  it('29c. an unreadable answers log fails closed for a plan with ANY question; a plan with none still moves', () => {
    const detail = { id: 'q10-d', prompt: 'p?', critical: false, important: false, topic: 'detail', options: recOpts() };
    const a = setup('unreadable', [detail]);
    fs.mkdirSync(path.join(a.root, '.ctoc', 'streaming', 'answers.jsonl'), { recursive: true }); // EISDIR
    const verdict = precompute.hasEnoughInformation(a.root, a.ref);
    assert.equal(verdict.enough, false);
    assert.equal(verdict.reason, 'answers-unreadable');
    const b = setup('unreadable-empty', []);
    fs.mkdirSync(path.join(b.root, '.ctoc', 'streaming', 'answers.jsonl'), { recursive: true });
    assert.equal(precompute.hasEnoughInformation(b.root, b.ref).enough, true);
  });
});

// The agent rules this slice rewrites are held word for word by the compaction rule
// inventories. A rule the owner replaced ends as `replaced`, and a rule written after the
// baseline is `added`; both carry a record naming an approved plan that names them. These
// cases drive the shared inventory checks against a four-sentence fixture repository.
describe('compaction inventories — a rule the owner replaced or added is recorded, never silently dropped', () => {
  const crypto = require('node:crypto');
  const { defineInventoryTests } = require('./compaction-eval/inventory-checks');
  const { splitUnits } = require('./compaction-eval/units');

  const BASELINE = '# Agent\n\n## Rules\n\nAlways do A. Never do B.\n';
  const NEW = '# Agent\n\n## Rules\n\nAlways do C. Never do B.\n';
  const PLAN = 'fixture-plan';
  const today = new Date().toISOString().slice(0, 10);
  const record = (extra) => ({ instruction: 'the owner replaced A with C', date: '2026-10-07', plan: PLAN, new_anchors: ['Always do C.'], ...extra });
  const replaced = (extra) => ({ fate: 'replaced', replaced_by: record(extra) });

  /**
   * Runs the ten checks over a fixture repository and returns the numbers of the checks that
   * failed. The fixture holds agents/agent.md, the baseline, an approved plan naming R-3 and N-1.
   */
  function failingChecks({ agent = NEW, unitFate = 'replaced', order3 = replaced(), extraOrders = [], planText = 'Replaces R-3 and adds N-1.', approval = true, agentRel = 'agents/agent.md' }) {
    const root = makeSandbox();
    fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(root, '.ctoc', 'approvals'), { recursive: true });
    fs.writeFileSync(path.join(root, 'baseline.md'), BASELINE);
    fs.writeFileSync(path.join(root, ...agentRel.split('/')), agent);
    fs.writeFileSync(path.join(root, 'plans', 'todo', `${PLAN}.md`), planText);
    if (approval) fs.writeFileSync(path.join(root, '.ctoc', 'approvals', `${PLAN}.json`), '{}');
    const u = splitUnits(BASELINE);
    const inventory = {
      agent: agentRel,
      baseline: 'baseline.md',
      baseline_sha256: crypto.createHash('sha256').update(BASELINE).digest('hex'),
      baseline_commit: '0'.repeat(40),
      maxBytes: 10000,
      units: [
        { n: 1, sha: u[0].sha, kind: 'heading', orders: [], fate: 'kept' },
        { n: 2, sha: u[1].sha, kind: 'heading', orders: [], fate: 'kept' },
        { n: 3, sha: u[2].sha, kind: 'order', orders: ['R-3'], fate: unitFate },
        { n: 4, sha: u[3].sha, kind: 'order', orders: ['R-4'], fate: 'kept' },
      ],
      orders: [
        { id: 'R-3', says: 'Always do A.', now_in: '## Rules', anchors: ['Always do A.'], ...order3 },
        { id: 'R-4', says: 'Never do B.', now_in: '## Rules', anchors: ['Never do B.'] },
        ...extraOrders,
      ],
    };
    fs.writeFileSync(path.join(root, 'inventory.json'), JSON.stringify(inventory));
    const checks = [];
    defineInventoryTests({ test: (name, fn) => checks.push({ name, fn }), label: 'fixture', inventoryPath: 'inventory.json', orderFloor: 2, root });
    assert.equal(checks.length, 10, 'still exactly ten checks');
    const failed = [];
    for (const c of checks) {
      try { c.fn(); } catch { failed.push(Number(c.name.match(/fixture: (\d+)\./)[1])); }
    }
    return failed;
  }

  it('30. a correct replacement passes all ten checks', () => {
    assert.deepEqual(failingChecks({}), []);
  });

  it('31. the untouched fixture passes (guard); a silently rewritten kept rule fails 4, 9 and 10', () => {
    assert.deepEqual(failingChecks({ agent: BASELINE, unitFate: 'kept', order3: {} }), []);
    assert.deepEqual(failingChecks({ unitFate: 'kept', order3: {} }), [4, 9, 10]);
  });

  it('32. an incomplete or untrue replaced_by record fails the classification check, and only it', () => {
    const cases = {
      'no record': [{ order3: { fate: 'replaced' } }, [3, 4, 10]],
      'empty instruction': [{ order3: replaced({ instruction: '' }) }, [3]],
      'empty new anchors': [{ order3: replaced({ new_anchors: [] }) }, [3]],
      'date not YYYY-MM-DD': [{ order3: replaced({ date: '7 Oct 2026' }) }, [3]],
      'date that does not exist': [{ order3: replaced({ date: '2026-02-30' }) }, [3]],
      'date in the future': [{ order3: replaced({ date: '2999-01-01' }) }, [3]],
      'unknown fate': [{ order3: { fate: 'gone', replaced_by: record() } }, [3, 4, 10]],
      'replaced unit, order not replaced': [{ order3: {} }, [3, 4, 10]],
      'kept unit carrying a replaced order': [{ unitFate: 'kept' }, [3, 9]],
      'plan that does not exist': [{ order3: replaced({ plan: 'no-such-plan' }) }, [3]],
      'plan path that climbs out': [{ order3: replaced({ plan: '../fixture-plan' }) }, [3]],
      'plan with no approval record': [{ approval: false }, [3]],
      'plan that never names the order': [{ planText: 'Replaces nothing.' }, [3]],
      'new anchor already in the baseline': [{ agent: BASELINE, order3: replaced({ new_anchors: ['Always do A. Never do B.'] }) }, [3]],
    };
    assert.equal(failingChecks({ order3: replaced({ date: today }) }).length, 0, 'today is not the future');
    for (const [name, [fixture, expected]] of Object.entries(cases)) {
      assert.deepEqual(failingChecks(fixture), expected, name);
    }
  });

  it('33. an old sentence still present fails, unless it stands inside a new anchor', () => {
    assert.deepEqual(failingChecks({ agent: '# Agent\n\n## Rules\n\nAlways do A. Always do C. Never do B.\n' }), [4]);
    const kept = '# Agent\n\n## Rules\n\nAlways do C, then: Always do A. Never do B.\n';
    assert.deepEqual(failingChecks({ agent: kept, order3: replaced({ new_anchors: ['Always do C, then: Always do A.'] }) }), []);
  });

  it('34. the new words missing fails 4 and 10; a doubled new anchor fails 10; a file outside agents/ and skills/ fails every check', () => {
    assert.deepEqual(failingChecks({ agent: '# Agent\n\n## Rules\n\nNever do B.\n' }), [4, 10]);
    assert.deepEqual(failingChecks({ agent: '# Agent\n\n## Rules\n\nAlways do C. Always do C. Never do B.\n' }), [10]);
    assert.deepEqual(failingChecks({ agentRel: 'plans/todo/agent.md' }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('35. an added order is held like any other, and needs its own record', () => {
    const added = (extra) => ({ id: 'N-1', says: 'Then do D.', now_in: '## Rules', anchors: ['Then do D.'], fate: 'added', added_by: { instruction: 'the owner added D', date: '2026-10-07', plan: PLAN }, ...extra });
    const withD = '# Agent\n\n## Rules\n\nAlways do C. Never do B. Then do D.\n';
    assert.deepEqual(failingChecks({ agent: withD, extraOrders: [added()] }), []);
    assert.deepEqual(failingChecks({ extraOrders: [added()] }), [4, 10], 'its anchor missing from the agent');
    assert.deepEqual(failingChecks({ agent: withD, extraOrders: [added({ added_by: undefined })] }), [3]);
    assert.deepEqual(failingChecks({ agent: withD, extraOrders: [added({ fate: undefined })] }), [3], 'an order no unit lists');
    assert.deepEqual(failingChecks({ agent: withD + 'Never do B.\n', extraOrders: [added({ anchors: ['Never do B.'] })] }), [3, 10], 'an added anchor already in the baseline');
  });
});

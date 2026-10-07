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

const crypto = require('node:crypto');
const precompute = require('../src/lib/streaming-precompute.js');
const sweeper = require('../src/lib/streaming-questions-sweeper.js');

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
  return [{ key: '1', label: 'Option A' }, { key: '2', label: 'Option B' }];
}

/** Two options, exactly one recommended — a declared detail with a known best answer. */
function recOpts() {
  return [{ key: '1', label: 'Option A', recommended: true }, { key: '2', label: 'Option B' }];
}

/** The gate critic's record that it assigned the topics (the owner's decision of 2026-10-07). */
const CLASSIFIED = Object.freeze({ by: 'gate-critic', at: 1786000000000 });

/** A valid critique-ran record: only a file carrying one is the fleet's synthesis. */
const lens = (state) => ({ state, coverage: state === 'clean-pass' ? 'full' : 'none', findings: 0 });
const ATTESTED = Object.freeze({ generated_by: 'gate-critic', generated_at: 1786000000000, lenses: { premortem: lens('clean-pass'), 'devils-advocate': lens('clean-pass'), 'red-team': lens('clean-pass'), advocate: lens('clean-pass') } });

/** Appends one line to the sandbox's answers log, in the shape the real writer uses. */
function appendAnswer(root, entry) {
  const dir = path.join(root, '.ctoc', 'streaming');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'answers.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * The digest an answers-log entry must carry for its answer to count: sha256 hex of
 * JSON [prompt, [[key, label], ...] sorted by key, [recommended keys] sorted], each text normalised the way labels are
 * compared (NFKC, combining marks removed, control characters stripped, trimmed, lower-cased).
 * Derived here independently of the module, so it pins the format slice 2's writer must use.
 */
const ident = (s) => s.normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().toLowerCase();
function digestOf(q) {
  const pairs = q.options.map((o) => [o.key, ident(o.label)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return crypto.createHash('sha256').update(JSON.stringify([ident(q.prompt), pairs, q.options.filter((o) => o.recommended === true).map((o) => o.key).sort()])).digest('hex');
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
      questions.push({ id: `q${10 + i}-fork`, prompt: `Fork ${i}?`, critical: true, important: false, topic: 'detail', options: opts() });
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
    const questions = [{ id: 'q10-needs-decl', topic: 'detail', prompt: 'p?', important: false, options: opts() }];

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
    const questions = [{ id: 'q11-bad-flag', topic: 'detail', prompt: 'p?', critical: 'yes', important: false, options: opts() }];

    const res = precompute.writePlanQuestions(root, ref, questions, fs.statSync(planPath).mtimeMs);
    assert.equal(res.ok, false, 'a non-boolean flag is refused');
    const joined = res.errors.join(' | ');
    assert.match(joined, /q11-bad-flag/, 'the error names the question id');
    assert.match(joined, /critical/, 'the error names the mistyped key');
  });

  it('12. a refused write leaves the gate CLOSED (not-computed, never enough)', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'refused');
    const ref = 'functional/refused.md';
    const questions = [{ id: 'q10-refused', topic: 'detail', prompt: 'p?', important: false, options: opts() }];

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
    const options = [{ key: '1', label: 'A', recommended: true }, { key: '2', label: 'B', recommended: true }];
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
    const joined = refused([detailQ({ id: 'q10-stack', topic: 'stack' })]);
    assert.match(joined, /q10-stack/, 'the error names the question id');
    assert.match(joined, /technology-stack/, 'the error lists the allowed values');
    assert.match(joined, /detail/, 'the error lists the allowed values');
  });

  it('22. the writer refuses a non-string topic, and refuses `holds` on any option — a hold is the human\'s answer, recorded by CTOC', () => {
    assert.match(refused([detailQ({ topic: 7 })]), /must declare a "topic"/);
    for (const holds of [true, false, 'yes']) {
      assert.match(refused([detailQ({ options: [{ key: '1', label: 'A', recommended: true, holds }, { key: '2', label: 'B' }] })]), /holds/);
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
    assert.match(refused([detailQ({ id: 'q99-gate-ruling-r1786000000000', important: true })]), /carries no "topic"/);
    assert.match(refused([detailQ({ id: 'q98-critique-coverage' })]), /carries no "topic"/);
    assert.equal(precompute.validatePlanQuestions([detailQ({ id: 'q99-gate-ruling-rx1' })]).valid, true, 'a look-alike id is an ordinary question');
  });

  it('24c. zero-width and direction-changing characters are refused in every text the human reads', () => {
    const hidden = ['\u200B', '\u200F', '\u202A', '\u202E', '\u2066', '\uFEFF',
      '\u00AD', '\u034F', '\u180E', '\u2028', '\u2029', '\u3164', '\u115F', '\uFE0F', '\u{E0041}', '\u2800'];
    for (const ch of hidden) {
      assert.match(refused([detailQ({ prompt: `Approve${ch}?` })]), /invisible/);
      assert.match(refused([detailQ({ options: [{ key: '1', label: `A${ch}`, recommended: true }, { key: '2', label: 'B' }] })]), /invisible/);
      for (const field of ['pros', 'cons', 'description']) {
        assert.match(refused([detailQ({ options: [{ key: '1', label: 'A', recommended: true, [field]: `x${ch}y` }, { key: '2', label: 'B' }] })]), /invisible/);
      }
    }
  });

  it('24d. two labels the human cannot tell apart are refused: case, surrounding space and control characters do not count', () => {
    assert.match(refused([detailQ({ options: [{ key: '1', label: 'Approve', recommended: true }, { key: '2', label: ' approve\u0007 ' }] })]), /label repeats/);
  });

  it('24e. more than three options is refused', () => {
    assert.match(refused([detailQ({ options: [1, 2, 3, 3].map((k, i) => ({ key: String(k), label: `L${i}`, recommended: i === 0 })) })]), /one to three options/);
  });

  it('24f. a single option with no recommendation on a weighty topic is refused; on a detail it is a notice (guard)', () => {
    assert.match(refused([detailQ({ topic: 'algorithm', options: [{ key: '1', label: 'Noted' }] })]), /never a notice/);
    assert.equal(precompute.validatePlanQuestions([detailQ({ options: [{ key: '1', label: 'Noted' }] })]).valid, true);
  });
});

describe('hasEnoughInformation — details move on; a Hold is the human\'s, read from the answers log', () => {
  function setup(slug, questions, stage = 'functional', classification = CLASSIFIED) {
    const root = makeSandbox();
    const planPath = writePlan(root, stage, slug);
    const ref = `${stage}/${slug}.md`;
    const stamp = fs.statSync(planPath).mtimeMs;
    // A set holding the reserved ruling is the fleet's synthesis, so it carries the attestation.
    const attested = questions.some((q) => /^q9[89]-/.test(q.id)) ? ATTESTED : undefined;
    const res = precompute.writePlanQuestions(root, ref, questions, stamp, attested, classification);
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
  // Each entry carries the digest of the question it answers (third security scan): slice 2's writer.
  const answer = (ref, stamp, optionKey, extra) => ({ ts: new Date().toISOString(), ref, questionId: 'q99-gate-ruling', optionKey, planMtimeMs: stamp, questionDigest: digestOf(ruling()), ...extra });

  it('25. three unanswered important DETAIL questions with a recommendation are enough — they never stop the plan', () => {
    const questions = [1, 2, 3].map((i) => ({ id: `q1${i}-d`, prompt: `Detail ${i}?`, critical: false, important: true, topic: 'detail', options: recOpts() }));
    const { root, ref } = setup('details', questions);
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, true, verdict.reason);
    assert.equal(verdict.unanswered.length, 3, 'nothing is hidden: the decided details are still reported');
    assert.equal(verdict.blocking.length, 0);
  });

  // A hold is CTOC's own: an entry under `ctoc-hold` carrying CTOC's hold digest, written by the
  // menu when the human chooses "Hold this plan" (slice 2). It records no answer.
  const { HOLD } = precompute;
  const hold = (ref, extra) => ({ ts: new Date().toISOString(), ref, questionId: HOLD.questionId, optionKey: HOLD.hold.key, holds: true, heldOn: 'q99-gate-ruling', questionDigest: HOLD.digest, ...extra });
  const release = (ref, extra) => ({ ts: new Date(Date.now() + 1000).toISOString(), ref, questionId: HOLD.questionId, optionKey: HOLD.release.key, holds: false, questionDigest: HOLD.digest, ...extra });

  it('26. a hold the log records keeps the plan where it is — reason "held"', () => {
    const { root, ref } = setup('held', [ruling()]);
    appendAnswer(root, hold(ref));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false);
    assert.equal(verdict.reason, 'held');
    assert.deepEqual(verdict.blocking.map((q) => q.id), ['ctoc-hold'], "the hold is named, by CTOC's own id");
    assert.deepEqual(verdict.answered, [], 'a hold is never an answer');
  });

  it('27. the same answer without holds moves the plan on — the question file cannot hold it', () => {
    const { root, ref, stamp } = setup('approved', [ruling()]);
    appendAnswer(root, answer(ref, stamp, '1'));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, true, verdict.reason);
    assert.equal(verdict.reason, 'enough');
  });

  it('27b. a hold outlives the revision it was given on, and the stage the plan was in', () => {
    const { root, ref } = setup('outlives', [ruling()], 'implementation');
    appendAnswer(root, hold('functional/outlives.md'));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.reason, 'held');
    assert.deepEqual(verdict.answered, [], 'nothing was answered, yet the hold stands');
  });

  it('27c. a hold on a question the current revision no longer has still holds, under CTOC\'s own id', () => {
    const { root, ref } = setup('gone-q', [ruling()]);
    appendAnswer(root, hold(ref, { heldOn: 'q10-removed' }));
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.reason, 'held');
    assert.deepEqual(verdict.blocking, [{ id: 'ctoc-hold' }]);
  });

  it('28. only a LATER release ends a hold; an entry that records no answer changes nothing; the older log shape counts', () => {
    const { root, ref } = setup('older-shape', [ruling()]);
    const later = new Date(Date.now() + 60000).toISOString();
    appendAnswer(root, { ref, questionId: 'q99-gate-ruling', answer: '2', at: later, questionDigest: digestOf(ruling()) });
    appendAnswer(root, { ref, questionId: HOLD.questionId, answer: HOLD.hold.key, at: later, holds: true, questionDigest: HOLD.digest });
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held', 'the later line (the hold) wins');
    appendAnswer(root, { ref, questionId: HOLD.questionId, at: later });
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held', 'a line with no answer releases nothing');
    appendAnswer(root, { ref, questionId: HOLD.questionId, answer: HOLD.release.key, at: later, questionDigest: HOLD.digest });
    assert.equal(precompute.hasEnoughInformation(root, ref).enough, true, 'a later release in the older shape releases it');
  });

  it("28b. a hold is released only by a LATER release of CTOC's own question carrying CTOC's hold digest", () => {
    const { root, ref, stamp } = setup('release', [{ id: 'q10-other', prompt: 'p?', critical: true, important: false, topic: 'detail', options: recOpts() }, ruling()]);
    appendAnswer(root, hold(ref));
    const notReleased = [
      { ts: new Date().toISOString(), ref, questionId: 'q10-other', optionKey: '1', planMtimeMs: stamp, questionDigest: digestOf({ id: 'q10-other', prompt: 'p?', options: recOpts() }) },
      answer(ref, stamp, '2'), // a real answer to another question is not a release
      release(ref, { optionKey: '7' }),
      release(ref, { optionKey: null }),
      release(ref, { optionKey: '' }),
      release(ref, { holds: 'false' }),
      release(ref, { holds: 0 }),
      release(ref, { questionDigest: undefined }),
      release(ref, { questionDigest: digestOf({ ...ruling(), prompt: 'Another ruling.' }) }),
      release(ref, { optionKey: HOLD.hold.key }),
    ];
    for (const line of notReleased) {
      appendAnswer(root, line);
      assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held', `${JSON.stringify(line)} must not release the hold`);
    }
    appendAnswer(root, release(ref));
    assert.notEqual(precompute.hasEnoughInformation(root, ref).reason, 'held', "a later release with CTOC's digest releases it");
  });

  it('29. readAnsweredQuestionIds reports the chosen option and the holds, and empty ones on a closed path', () => {
    const { root, ref, stamp } = setup('keys', [ruling()]);
    appendAnswer(root, answer(ref, stamp, '1'));
    appendAnswer(root, hold(ref));
    const read = precompute.readAnsweredQuestionIds(root, ref);
    assert.equal(read.keys.get('q99-gate-ruling'), '1');
    assert.deepEqual(read.held, ['ctoc-hold']);
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

  it('41. option keys are "1", "2" or "3", and question ids are q<NN>-<kebab> with an optional -r<digits>', () => {
    const q = (extra) => ({ id: 'q10-x', prompt: 'p?', critical: false, important: false, topic: 'detail', options: [{ key: '1', label: 'A', recommended: true }, { key: '2', label: 'B' }], ...extra });
    assert.deepEqual(precompute.validatePlanQuestions([q(), q({ id: 'q11-y-r1786000000000' })]), { valid: true, errors: [] });
    for (const key of ['a', '0', '4', '1 ', '12', '$(rm)']) {
      const errors = precompute.validatePlanQuestions([q({ options: [{ key, label: 'A', recommended: true }] })]).errors;
      assert.ok(errors.some((e) => /key must be "1", "2" or "3"/.test(e)), `${JSON.stringify(key)}: ${errors.join('; ')}`);
    }
    for (const id of ['q1', 'q10', 'Q10-x', 'q10-X', 'q10_x', 'q10-', 'q10-x;rm', 'q100-x']) {
      const errors = precompute.validatePlanQuestions([q({ id })]).errors;
      assert.ok(errors.some((e) => /id must match q<NN>-<kebab-topic>/.test(e)), `${JSON.stringify(id)}: ${errors.join('; ')}`);
    }
  });

  it('29c. an unreadable answers log fails closed — even for a plan whose questions were regenerated as none, since a hold may be logged', () => {
    const detail = { id: 'q10-d', prompt: 'p?', critical: false, important: false, topic: 'detail', options: recOpts() };
    const a = setup('unreadable', [detail]);
    fs.mkdirSync(path.join(a.root, '.ctoc', 'streaming', 'answers.jsonl'), { recursive: true }); // EISDIR
    const verdict = precompute.hasEnoughInformation(a.root, a.ref);
    assert.equal(verdict.enough, false);
    assert.equal(verdict.reason, 'answers-unreadable');
    // Security re-scan of 2026-10-07: a hold logged before the questions were regenerated as []
    // must never be ignored because the log cannot be read.
    const b = setup('unreadable-empty', []);
    fs.mkdirSync(path.join(b.root, '.ctoc', 'streaming', 'answers.jsonl'), { recursive: true });
    const empty = precompute.hasEnoughInformation(b.root, b.ref);
    assert.equal(empty.enough, false);
    assert.equal(empty.reason, 'answers-unreadable');
  });

  it('43. a reserved id belongs only to the fleet\'s attested synthesis: one ruling, last, at most one coverage notice', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'reserved');
    const ref = 'functional/reserved.md';
    const stamp = fs.statSync(planPath).mtimeMs;
    const write = (questions, attestation, classification) => precompute.writePlanQuestions(root, ref, questions, stamp, attestation, classification);
    const db = { id: 'q99-gate-ruling-r1', prompt: 'Move the store from SQLite to Postgres?', critical: false, important: false, options: recOpts() };
    const cov = { id: 'q98-critique-coverage', prompt: 'Coverage', critical: false, important: false, options: [{ key: '1', label: 'Noted', recommended: true }] };
    const finding = { id: 'q10-x', prompt: 'p?', critical: true, important: false, topic: 'detail', options: recOpts() };
    const refusedFor = (res, re) => { assert.equal(res.ok, false); assert.match(res.errors.join(' | '), re); };
    refusedFor(write([db]), /only in the fleet's attested synthesis/);
    refusedFor(write([db], undefined, CLASSIFIED), /only in the fleet's attested synthesis/);
    refusedFor(write([finding, ruling(), { ...ruling(), id: 'q99-gate-ruling-r2' }], ATTESTED), /at most one gate ruling/);
    refusedFor(write([ruling(), finding], ATTESTED), /the gate ruling must be the last question/);
    refusedFor(write([cov, { ...cov, id: 'q98-critique-coverage-r2' }, ruling()], ATTESTED), /at most one coverage notice/);
    assert.equal(fs.existsSync(precompute.questionsPath(root, ref)), false, 'nothing was written');
    assert.deepEqual(write([finding, cov, ruling()], ATTESTED, CLASSIFIED), { ok: true });
    // Refused on read too: a file written around the writer reads invalid.
    fs.writeFileSync(precompute.questionsPath(root, ref), JSON.stringify({ ref, planMtimeMs: stamp, questions: [db] }));
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'invalid');
  });

  // Third security scan of 2026-10-07.
  const fork = () => ({ id: 'q10-db', prompt: 'Which database stores the sessions?', critical: false, important: false, topic: 'technology-stack', options: [{ key: '1', label: 'Postgres', recommended: true }, { key: '2', label: 'SQLite' }] });
  const writePending = (root, payload) => {
    const file = precompute.pendingQuestionsPath(root, payload.ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload));
    return file;
  };
  const answerTo = (ref, stamp, q, optionKey, extra) => ({ ts: new Date().toISOString(), ref, questionId: q.id, optionKey, planMtimeMs: stamp, questionDigest: digestOf(q), ...extra });

  it('44. an author\'s empty question list never moves a plan: without the gate critic\'s classification a file is never enough', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'x');
    const ref = 'functional/x.md';
    writePending(root, { ref, questions: [] });
    assert.deepEqual(sweeper.sweepPendingQuestions(root).promoted, [ref], 'precondition: the author file is promoted');
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false, 'an empty author list is not "no forks"');
    assert.equal(verdict.reason, 'unclassified');
    // Every question answered by the human, still in an author file: the critic never looked.
    const a = setup('author-answered', [fork()], 'functional', null);
    appendAnswer(a.root, answerTo(a.ref, a.stamp, fork(), '1'));
    const answered = precompute.hasEnoughInformation(a.root, a.ref);
    assert.deepEqual(answered.answered, ['q10-db'], 'precondition: the answer bound');
    assert.equal(answered.reason, 'unclassified');
    // The gate critic's own empty list is the honest "nothing needs the human".
    const c = setup('classified-empty', []);
    assert.equal(precompute.hasEnoughInformation(c.root, c.ref).enough, true);
  });

  it('45. a classified file is never replaced by an unclassified one for the same plan revision — by the writer or by the sweeper, and the refusal is logged', () => {
    const { root, ref, stamp } = setup('keep-classified', [fork()]);
    const direct = precompute.writePlanQuestions(root, ref, [], stamp);
    assert.equal(direct.ok, false);
    assert.equal(direct.reason, 'would-replace-classified');
    assert.match(direct.errors.join(' | '), /classified/);
    const pending = writePending(root, { ref, questions: [] });
    const report = sweeper.sweepPendingQuestions(root);
    assert.deepEqual(report.promoted, []);
    assert.deepEqual(report.discarded, [{ file: path.basename(pending), reason: 'would-replace-classified' }]);
    const log = fs.readFileSync(path.join(root, '.ctoc', 'logs', 'streaming-sweeper.jsonl'), 'utf8');
    assert.match(log, /"reason":"would-replace-classified"/, 'never silent');
    const kept = JSON.parse(fs.readFileSync(precompute.questionsPath(root, ref), 'utf8'));
    assert.deepEqual(kept.classification, CLASSIFIED);
    assert.deepEqual(kept.questions.map((q) => q.id), ['q10-db'], 'the weighty question stands');
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'open-forks');
    // The gate critic's own second write for the same revision may only grow the file: a
    // shrinking write is refused and the weighty question stands ...
    const shrinking = precompute.writePlanQuestions(root, ref, [], stamp, undefined, CLASSIFIED);
    assert.equal(shrinking.ok, false);
    assert.equal(shrinking.reason, 'classification-dropped-question');
    assert.deepEqual(JSON.parse(fs.readFileSync(precompute.questionsPath(root, ref), 'utf8')).questions.map((q) => q.id), ['q10-db']);
    // ... and a write that keeps every question is accepted (guard).
    const grown = [fork(), { id: 'q11-name', prompt: 'Name?', critical: false, important: false, topic: 'detail', options: recOpts() }];
    assert.deepEqual(precompute.writePlanQuestions(root, ref, grown, stamp, undefined, CLASSIFIED), { ok: true });
    // A newer revision may be anyone's.
    assert.deepEqual(precompute.writePlanQuestions(root, ref, [fork()], stamp + 1000), { ok: true });
    // A corrupt file at the live path is nothing classified to keep: it is replaced.
    fs.writeFileSync(precompute.questionsPath(root, ref), '{"classification":');
    assert.deepEqual(precompute.writePlanQuestions(root, ref, [fork()], stamp + 1000), { ok: true });
  });

  it('46. an answer counts only for the question it was given for: the log entry must carry that question\'s digest', () => {
    const q = fork();
    const { root, ref, stamp } = setup('digest', [q]);
    appendAnswer(root, answerTo(ref, stamp, q, '1', { questionDigest: undefined }));
    let verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.reason, 'open-forks', 'an entry with no digest is asked again');
    assert.deepEqual(verdict.answered, []);
    assert.equal(verdict.unboundAnswers, 1, 'and reported, not silently dropped');
    const rewritten = { ...q, prompt: 'Which cache holds the sessions?' };
    const swapped = { ...q, options: [{ key: '1', label: 'SQLite', recommended: true }, { key: '2', label: 'Postgres' }] };
    const replayed = { ...q, prompt: 'Which database stores the audit log?' };
    for (const other of [rewritten, swapped]) {
      appendAnswer(root, answerTo(ref, stamp, other, '1'));
      assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'open-forks', `an answer to ${JSON.stringify(other.prompt)} with labels ${other.options.map((o) => o.label)} does not answer this question`);
    }
    appendAnswer(root, answerTo(ref, stamp, q, '1'));
    verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, true, verdict.reason);
    assert.deepEqual(verdict.answered, ['q10-db']);
    // The replay. Within the same revision the critic may no longer rewrite the question under
    // the same id: the write is refused and the answered question stands.
    const sameRevision = precompute.writePlanQuestions(root, ref, [replayed], stamp, undefined, CLASSIFIED);
    assert.equal(sameRevision.reason, 'classification-dropped-question');
    assert.deepEqual(precompute.hasEnoughInformation(root, ref).answered, ['q10-db']);
    // As a new revision of the plan it is written, and the earlier answer is not inherited.
    const planPath = precompute.refToPlanPath(root, ref);
    fs.utimesSync(planPath, new Date(stamp + 5000), new Date(stamp + 5000));
    assert.deepEqual(precompute.writePlanQuestions(root, ref, [replayed], fs.statSync(planPath).mtimeMs, undefined, CLASSIFIED), { ok: true });
    verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.reason, 'open-forks', 'the earlier answer is not inherited by the rewritten question');
    assert.deepEqual(verdict.answered, []);
  });

  it('47. a torn answers-log line that names this plan fails closed for this plan only', () => {
    const q = fork();
    const { root, ref, stamp } = setup('torn', [q]);
    appendAnswer(root, answerTo(ref, stamp, q, '1'));
    const log = path.join(root, '.ctoc', 'streaming', 'answers.jsonl');
    fs.appendFileSync(log, '{"ref":"functional/other-plan.md","questionId":"q99-gate-ruling","holds":tr\n');
    assert.equal(precompute.hasEnoughInformation(root, ref).enough, true, 'a torn line about another plan changes nothing here');
    fs.appendFileSync(log, `{"ref":"${ref}","questionId":"q99-gate-ruling","holds":tr\n`);
    const verdict = precompute.hasEnoughInformation(root, ref);
    assert.equal(verdict.enough, false);
    assert.equal(verdict.reason, 'answers-unreadable', 'it may have been his Hold');
  });

  it('48. two labels equal after Unicode compatibility folding and removing accents are refused; different labels pass (guard)', () => {
    const pair = (a, b) => precompute.validatePlanQuestions([{ id: 'q10-x', prompt: 'p?', critical: false, important: false, topic: 'detail', options: [{ key: '1', label: a, recommended: true }, { key: '2', label: b }] }]);
    for (const [a, b] of [['Café', 'Cafe'], ['Café', 'Café'], ['Ａpprove', 'approve'], ['ﬁle', 'file'], ['Ⅳ', 'IV']]) {
      const { valid, errors } = pair(a, b);
      assert.equal(valid, false, `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
      assert.ok(errors.some((e) => /label repeats/.test(e)), errors.join('; '));
    }
    assert.deepEqual(pair('Postgres', 'SQLite'), { valid: true, errors: [] });
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
  /** An approved fixture plan: frontmatter, the order ids in its specification, an execution record. */
  const AGENT_LINE = '- `agents/agent.md` — replaced: R-3; added: N-1.';
  const PLAN_TEXT = `---\ntitle: fixture plan\n---\n\n# Fixture plan\n\n## Agent rules\n${AGENT_LINE}\n- \`agents/other.md\` — replaced: R-4.\n\n## Risks\nNone.\n\n## Execution Record\nBuilt.\n`;
  const withoutR3 = '- `agents/agent.md` — added: N-1.';
  const approvalFor = (text, extra) => JSON.stringify({ content_sha256: require('../src/lib/approval-ledger').computeSpecHash(text).hash, hash_scope: 'specification', approved_by: 'human', ...extra });

  function failingChecks({ agent = NEW, unitFate = 'replaced', order3 = replaced(), extraOrders = [], planText = PLAN_TEXT, approval, agentRel = 'agents/agent.md', kind3 = 'order', kindsSha256 }) {
    const root = makeSandbox();
    fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(root, '.ctoc', 'approvals'), { recursive: true });
    fs.writeFileSync(path.join(root, 'baseline.md'), BASELINE);
    fs.writeFileSync(path.join(root, ...agentRel.split('/')), agent);
    fs.writeFileSync(path.join(root, 'plans', 'todo', `${PLAN}.md`), planText);
    if (approval !== false) fs.writeFileSync(path.join(root, '.ctoc', 'approvals', `${PLAN}.json`), approval === undefined ? approvalFor(planText) : approval);
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
        { n: 3, sha: u[2].sha, kind: kind3, orders: ['R-3'], fate: unitFate },
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
    defineInventoryTests({ test: (name, fn) => checks.push({ name, fn }), label: 'fixture', inventoryPath: 'inventory.json', orderFloor: 2, root, kindsSha256 });
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
      'plan that never names the order': [{ planText: PLAN_TEXT.replace(AGENT_LINE, 'Replaces nothing.') }, [3]],
      'approval record that is no ledger entry': [{ approval: '{}' }, [3]],
      'approval record of another text': [{ approval: approvalFor(PLAN_TEXT.replace('fixture plan', 'other plan')) }, [3]],
      'approval record that is not human or backfilled': [{ approval: approvalFor(PLAN_TEXT, { advanced_by: 'sufficiency' }) }, [3]],
      'approval record of another hash scope': [{ approval: approvalFor(PLAN_TEXT, { hash_scope: 'content' }) }, [3]],
      'order id only in the execution record': [{ planText: PLAN_TEXT.replace(AGENT_LINE, withoutR3).replace('Built.', 'Built R-3 in agents/agent.md.') }, [3]],
      'new anchor already in the baseline': [{ agent: BASELINE, order3: replaced({ new_anchors: ['Always do A. Never do B.'] }) }, [3]],
    };
    assert.equal(failingChecks({ order3: replaced({ date: today }) }).length, 0, 'today is not the future');
    assert.deepEqual(failingChecks({ approval: approvalFor(PLAN_TEXT, { approved_by: undefined, backfilled: true, backfill_reason: 'scope recorded' }) }), [], 'a backfilled record of this text counts');
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

  it('49. the order id must stand as a whole token, in the hashed specification, on a line naming this agent file', () => {
    const cases = {
      'the id on a line naming another agent file': PLAN_TEXT.replace(AGENT_LINE, withoutR3).replace('replaced: R-4.', 'replaced: R-3, R-4.'),
      'the id only inside a longer id': PLAN_TEXT.replace(AGENT_LINE, '- `agents/agent.md` — replaced: R-30; added: N-1.'),
      'the id and the path on different lines': PLAN_TEXT.replace(AGENT_LINE, `Replaces R-3.\n${withoutR3}`),
      'a seven-hash heading hides the line from the hash': PLAN_TEXT.replace(AGENT_LINE, withoutR3).replace('## Risks', '####### Execution Record\nThis slice also replaces R-3 in agents/agent.md.\n\n## Risks'),
      'the heading of an excluded section names it': PLAN_TEXT.replace(AGENT_LINE, withoutR3).replace('## Execution Record', '## Execution Record — replaces R-3 in agents/agent.md'),
      'a checkbox line names it': PLAN_TEXT.replace(AGENT_LINE, `${withoutR3}\n- [x] replaces R-3 in agents/agent.md`),
    };
    for (const [name, planText] of Object.entries(cases)) {
      assert.deepEqual(failingChecks({ planText }), [3], name);
    }
    assert.deepEqual(failingChecks({}), [], 'the line naming the agent file and the id, in the specification, passes (guard)');
  });

  it('50. on the real plan: every replaced or added order of the three inventories is named on its own agent\'s line, and R-414 moved into the gate critic\'s inventory is not', () => {
    const real = (name, mutate) => {
      const inv = JSON.parse(fs.readFileSync(path.join(__dirname, 'compaction-eval', name, 'rule-inventory.json'), 'utf8'));
      if (mutate) mutate(inv);
      const root = makeSandbox();
      const file = path.join(root, 'inventory.json');
      fs.writeFileSync(file, JSON.stringify(inv));
      const checks = [];
      defineInventoryTests({ test: (n, fn) => checks.push({ n, fn }), label: name, inventoryPath: file, orderFloor: 1 });
      return { inv, check3: checks.find((c) => / 3\. /.test(c.n)).fn };
    };
    for (const name of ['gate-critic', 'product-owner', 'implementation-planner']) {
      const { inv, check3 } = real(name);
      assert.ok(inv.orders.some((o) => o.fate === 'replaced') && inv.orders.some((o) => o.fate === 'added'), `${name} holds replaced and added orders`);
      check3();
    }
    // The gate critic's own R-414 marked replaced, with a record copied from one the plan does
    // name for it: the plan names R-414 only on the product owner's line.
    const moved = real('gate-critic', (inv) => {
      const r414 = inv.orders.find((o) => o.id === 'R-414');
      r414.fate = 'replaced';
      r414.replaced_by = { ...inv.orders.find((o) => o.id === 'R-165').replaced_by, new_anchors: ['A sentence written for this test only.'] };
      for (const u of inv.units) if (u.orders.includes('R-414')) u.fate = 'replaced';
    });
    assert.throws(() => moved.check3(), /order R-414 has an incomplete replaced or added record/);
  });

  it('42. a pinned digest of the units\' kinds catches an order relabelled as a cuttable kind', () => {
    const digest = (k3) => crypto.createHash('sha256').update(['1:heading', '2:heading', `3:${k3}`, '4:order'].join('\n')).digest('hex');
    assert.deepEqual(failingChecks({ kindsSha256: digest('order') }), [], 'the true kinds match their pin');
    assert.deepEqual(failingChecks({ kind3: 'reason' }), [], 'unpinned, a relabel goes unseen — which is why the caller pins it');
    assert.deepEqual(failingChecks({ kind3: 'reason', kindsSha256: digest('order') }), [3], 'pinned, the relabel fails the classification check');
    assert.throws(() => defineInventoryTests({ test: () => {}, label: 'x', inventoryPath: 'x.json', orderFloor: 1, kindsSha256: 'abc' }), /kindsSha256/);
  });
});

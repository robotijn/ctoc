'use strict';

/**
 * AN ANSWER BINDS TO THE REVISION OF THE PLAN IT WAS GIVEN FOR.
 *
 * The defect this suite fences: the questions file carries a freshness stamp, so a
 * question set that predates the plan's current text is refused — but the ANSWERS
 * log carried no notion of revision at all. It was matched on `(ref, questionId)`
 * alone. Question ids are POSITIONAL (agents/iron-loop/gate-critic.md: finding
 * questions start at `q10` and increase in emission order), so a regenerated set
 * reuses ids for DIFFERENT questions. An id match across revisions was therefore
 * evidence of nothing, and a stale answer silently suppressed a question the human
 * had never been shown — a verdict reported on input that was never received.
 *
 * The rule under test, in one line: an answer counts when it is STAMPED with the
 * current question set's revision, or (no stamp) was RECORDED AT OR AFTER the
 * plan's current modification time. Anything else does not bind, and its question
 * is asked again. Not knowing which text an answer was about is NOT a pass.
 *
 * BOTH callers of the shared function are driven here — the predicate
 * (`hasEnoughInformation`) and the gate (`streamingGateScreen`'s next-question path
 * and the sufficiency-ledger evidence). A shared function whose second caller's
 * cases are untested is how the drift comes back.
 *
 * Real temp projects, real plan files, real questions files written through
 * `writePlanQuestions`, real `answers.jsonl`. Modification times are controlled
 * with `fs.utimesSync` — deterministic and cross-platform, no sleeping.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const precompute = require('../src/lib/streaming-precompute.js');
const streamingGate = require('../src/lib/streaming-gate.js');
const { route } = require('../src/lib/menu-screens.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-abind-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

function validFunctionalBody(slug, extra = '') {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nThe thing is broken.${extra}\n\n` +
    `## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n`;
}

/** Force a plan file's modification time to an exact millisecond value. */
function setPlanMtime(planPath, ms) {
  const seconds = ms / 1000;
  fs.utimesSync(planPath, seconds, seconds);
  return fs.statSync(planPath).mtimeMs;
}

/**
 * Seed a plan at `stage` whose modification time is pinned to `planMs`, with a
 * questions file generated against that exact revision.
 * @returns {{ref, planPath, planMtimeMs, revision}}
 */
function seedAt(root, stage, slug, questions, planMs, body) {
  const planPath = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(planPath, body || validFunctionalBody(slug));
  const planMtimeMs = setPlanMtime(planPath, planMs);
  const ref = `${stage}/${slug}.md`;
  const res = precompute.writePlanQuestions(root, ref, questions, planMtimeMs);
  assert.equal(res.ok, true, 'fixture precondition: the questions file was written');
  return {
    ref,
    planPath,
    planMtimeMs,
    revision: { questionsRevisionMs: planMtimeMs, planMtimeMs },
  };
}

/** Rewrite a seeded plan's body and re-pin its modification time (a new revision). */
function reviseTo(root, seeded, slug, questions, planMs) {
  fs.writeFileSync(seeded.planPath, validFunctionalBody(slug, ' It is broken in a new way.'));
  const planMtimeMs = setPlanMtime(seeded.planPath, planMs);
  const res = precompute.writePlanQuestions(root, seeded.ref, questions, planMtimeMs);
  assert.equal(res.ok, true, 'fixture precondition: the regenerated questions were written');
  return { ...seeded, planMtimeMs, revision: { questionsRevisionMs: planMtimeMs, planMtimeMs } };
}

function appendAnswer(root, entry) {
  const dir = path.join(root, '.ctoc', 'streaming');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'answers.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
}

function readAnswerLines(root) {
  const file = path.join(root, '.ctoc', 'streaming', 'answers.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** One critical question with the given id. */
function fork(id, prompt) {
  return {
    id,
    prompt: prompt || `${id}?`,
    critical: true, important: false,
    options: [
      { key: 'a', label: 'Option A', recommended: true, pros: 'Simple', cons: 'Narrow' },
      { key: 'b', label: 'Option B', pros: 'Broad', cons: 'Costly' },
    ],
  };
}

/** One non-blocking question with the given id. */
function detail(id) {
  return {
    id,
    prompt: `${id}?`,
    critical: false, important: false,
    options: [{ key: 'a', label: 'Option A', recommended: true }, { key: 'b', label: 'Option B' }],
  };
}

/**
 * The question id the streaming gate screen is currently OFFERING for `ref`, read
 * off the screen's own actions (`stream answer <ref> <questionId> <optionKey>`).
 * This is the gate-side caller of the shared function, driven end to end.
 */
function offeredQuestionId(root) {
  const screen = streamingGate.streamingGateScreen(root);
  const values = Object.values((screen && screen.actions) || {});
  for (const v of values) {
    const m = /^stream answer \S+ (\S+) \S+$/.exec(String(v));
    if (m) return m[1];
  }
  return null;
}

const T0 = 1750000000000; // a fixed, well-past-epoch millisecond baseline
const iso = (ms) => new Date(ms).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// The shared function and the predicate
// ─────────────────────────────────────────────────────────────────────────────

describe('the shared binding rule — readAnsweredQuestionIds', () => {
  it('case 1 — THE DEFECT: an answer given on revision A never suppresses revision B\'s reused id', () => {
    const root = makeSandbox();
    let s = seedAt(root, 'functional', 'c1', [fork('q10', 'Should the sync barrier settle an unconfirmed orphan?')], T0);
    appendAnswer(root, {
      ts: iso(T0 + 1000), ref: s.ref, questionId: 'q10', optionKey: 'a',
      planMtimeMs: s.revision.questionsRevisionMs,
    });
    // Sanity: on revision A the answer binds and the plan is sufficient.
    assert.equal(precompute.hasEnoughInformation(root, s.ref).enough, true,
      'precondition: the answer binds to the revision it was given for');

    // The plan is edited; the questions are regenerated and `q10` now names a
    // DIFFERENT question. The human has never seen this one.
    s = reviseTo(root, s, 'c1', [fork('q10', 'Does step 14 exclude the quality gate?')], T0 + 60000);

    const v = precompute.hasEnoughInformation(root, s.ref);
    assert.deepEqual(v.unanswered.map((q) => q.id), ['q10'],
      'the regenerated question is ASKED, not suppressed by an answer about other text');
    assert.deepEqual(v.blocking.map((q) => q.id), ['q10'], 'and it blocks, because it is a fork');
    assert.equal(v.enough, false, 'a verdict is never reported on input the human never received');
    assert.equal(v.unboundAnswers, 1, 'the verdict reports the answer that could not be tied to this revision');
  });

  it('case 2 — a stamp matching the current question set counts', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c2', [fork('q10')], T0);
    appendAnswer(root, {
      ts: iso(T0 + 1000), ref: s.ref, questionId: 'q10', optionKey: 'a',
      planMtimeMs: s.revision.questionsRevisionMs,
    });

    const r = precompute.readAnsweredQuestionIds(root, s.ref, s.revision);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.ids], ['q10']);
    assert.equal(r.bound.stamped, 1, 'bound by its explicit stamp');
    assert.equal(r.bound.derived, 0);
    assert.equal(r.unbound, 0);
    assert.deepEqual(precompute.hasEnoughInformation(root, s.ref).unanswered, []);
  });

  it('case 3 — an UNSTAMPED answer recorded AFTER the plan mtime binds (the derived rule)', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c3', [fork('q10')], T0);
    appendAnswer(root, { ts: iso(T0 + 5000), ref: s.ref, questionId: 'q10', optionKey: 'a' });

    const r = precompute.readAnsweredQuestionIds(root, s.ref, s.revision);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.ids], ['q10'], 'the plan has not changed since the answer, so the answer is about this text');
    assert.equal(r.bound.derived, 1, 'bound by DERIVATION from two facts on disk, never asserted');
    assert.equal(r.bound.stamped, 0);
    assert.equal(r.unbound, 0);
    assert.equal(precompute.hasEnoughInformation(root, s.ref).enough, true, 'the question is not re-asked');
  });

  it('case 4 — an UNSTAMPED answer recorded BEFORE the plan mtime does NOT bind', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c4', [fork('q10')], T0);
    appendAnswer(root, { ts: iso(T0 - 5000), ref: s.ref, questionId: 'q10', optionKey: 'a' });

    const r = precompute.readAnsweredQuestionIds(root, s.ref, s.revision);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.ids], [], 'the plan moved on after that answer — it binds to nothing here');
    assert.equal(r.unbound, 1);
    const v = precompute.hasEnoughInformation(root, s.ref);
    assert.equal(v.enough, false, 'the question is asked again — the safe direction');
    assert.equal(v.unboundAnswers, 1);
  });

  it('case 5 — the boundary counts: an answer recorded exactly at the plan mtime binds', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c5', [fork('q10')], T0);
    appendAnswer(root, { ts: iso(Math.floor(s.planMtimeMs)), ref: s.ref, questionId: 'q10', optionKey: 'a' });

    const r = precompute.readAnsweredQuestionIds(root, s.ref, s.revision);
    assert.deepEqual([...r.ids], ['q10'], 'at-or-after, not strictly after');
    assert.equal(r.bound.derived, 1);
  });

  it('case 6 — BOTH observed log shapes parse for the derived rule ({ts,…} and {at,…})', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c6', [fork('q10'), fork('q11')], T0);
    appendAnswer(root, { ts: iso(T0 + 5000), ref: s.ref, questionId: 'q10', optionKey: 'a' });
    // The nine entries in this project's real log use this second shape — written by
    // an ad-hoc script, not by any JavaScript in src/. It must READ correctly.
    appendAnswer(root, { ref: s.ref, questionId: 'q11', answer: 'Some prose answer', at: iso(T0 + 6000) });

    const r = precompute.readAnsweredQuestionIds(root, s.ref, s.revision);
    assert.deepEqual([...r.ids].sort(), ['q10', 'q11']);
    assert.equal(r.bound.derived, 2, 'both shapes carry a usable recorded time');
    assert.equal(r.unbound, 0);
  });

  it('case 7 — a present-but-MISMATCHED stamp is never rescued by the derived rule', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c7', [fork('q10')], T0);
    // Recorded AFTER the plan's current mtime (the derived rule would say yes) but
    // stamped with a DIFFERENT question set (the direct evidence says no).
    appendAnswer(root, {
      ts: iso(T0 + 9000), ref: s.ref, questionId: 'q10', optionKey: 'a',
      planMtimeMs: s.revision.questionsRevisionMs - 12345,
    });

    const r = precompute.readAnsweredQuestionIds(root, s.ref, s.revision);
    assert.deepEqual([...r.ids], [], 'an explicit stamp is the stronger evidence, and it says no');
    assert.equal(r.unbound, 1);
    assert.equal(r.bound.derived, 0, 'the weaker rule never overrides the stronger one');
  });

  it('case 8 — a NON-FINITE stamp falls through to the derived rule', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c8', [fork('q10')], T0);
    appendAnswer(root, {
      ts: iso(T0 + 9000), ref: s.ref, questionId: 'q10', optionKey: 'a', planMtimeMs: 'yesterday',
    });

    const r = precompute.readAnsweredQuestionIds(root, s.ref, s.revision);
    assert.deepEqual([...r.ids], ['q10'], 'an unusable stamp is no stamp at all');
    assert.equal(r.bound.derived, 1);
  });

  it('case 9 — an UNESTABLISHED revision is ignorance: ok:false, nothing bound, log not consulted', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c9', [fork('q10')], T0);
    // An answer that WOULD bind under a usable revision.
    appendAnswer(root, {
      ts: iso(T0 + 1000), ref: s.ref, questionId: 'q10', optionKey: 'a',
      planMtimeMs: s.revision.questionsRevisionMs,
    });

    for (const bad of [
      { questionsRevisionMs: NaN, planMtimeMs: 1 },
      { questionsRevisionMs: 1, planMtimeMs: Infinity },
      { questionsRevisionMs: '1750000000000', planMtimeMs: 1 },
    ]) {
      const r = precompute.readAnsweredQuestionIds(root, s.ref, bad);
      assert.equal(r.ok, false, 'a revision that cannot be established is IGNORANCE');
      assert.deepEqual([...r.ids], [], 'and ignorance binds nothing');
      assert.equal(r.bound.stamped, 0);
      assert.equal(r.bound.derived, 0);
      assert.equal(r.unbound, 0, 'the log was never even read');
    }
  });

  it('case 10 — an ABSENT log is knowledge; an UNREADABLE log is ignorance', () => {
    const rootA = makeSandbox();
    const a = seedAt(rootA, 'functional', 'c10a', [fork('q10')], T0);
    const ra = precompute.readAnsweredQuestionIds(rootA, a.ref, a.revision);
    assert.equal(ra.ok, true, 'nothing answered YET is a fact, not a failure');
    assert.deepEqual([...ra.ids], []);

    const rootB = makeSandbox();
    const b = seedAt(rootB, 'functional', 'c10b', [fork('q10')], T0);
    fs.mkdirSync(path.join(rootB, '.ctoc', 'streaming', 'answers.jsonl'), { recursive: true }); // EISDIR
    const rb = precompute.readAnsweredQuestionIds(rootB, b.ref, b.revision);
    assert.equal(rb.ok, false, 'could not read ≠ nothing answered');
    assert.deepEqual([...rb.ids], []);
    assert.equal(precompute.hasEnoughInformation(rootB, b.ref).reason, 'answers-unreadable');
  });

  it('case 11 — a malformed line is skipped, never fatal', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c11', [fork('q10')], T0);
    const dir = path.join(root, '.ctoc', 'streaming');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'answers.jsonl'), [
      'not json',
      '{"broken":',
      'null',
      JSON.stringify({ ts: iso(T0 + 1000), ref: s.ref, optionKey: 'a' }), // names no question
      JSON.stringify({ ts: iso(T0 + 1000), ref: s.ref, questionId: 'q10', optionKey: 'a' }),
      '',
    ].join('\n'));

    const r = precompute.readAnsweredQuestionIds(root, s.ref, s.revision);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.ids], ['q10'], 'the good record survives the junk around it');
  });

  it('case 12 — the shared function is EXPORTED (a module is done when a caller can reach it)', () => {
    const keys = Object.keys(require('../src/lib/streaming-precompute.js'));
    assert.ok(keys.includes('readAnsweredQuestionIds'),
      'nothing outside the module could read what the human answered');
    assert.equal(typeof precompute.readAnsweredQuestionIds, 'function');
  });

  it('case 12b — the revision is omittable and derived internally from planQuestionsStatus', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c12b', [fork('q10')], T0);
    appendAnswer(root, { ts: iso(T0 + 1000), ref: s.ref, questionId: 'q10', optionKey: 'a' });

    const r = precompute.readAnsweredQuestionIds(root, s.ref);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.ids], ['q10']);

    // A ref whose questions are not ready cannot establish a revision → ok:false.
    const closed = precompute.readAnsweredQuestionIds(root, 'functional/nope.md');
    assert.equal(closed.ok, false);
    assert.deepEqual([...closed.ids], []);
  });

  it('case 12c — planQuestionsStatus carries BOTH revision values on ready', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c12c', [fork('q10')], T0);
    const st = precompute.planQuestionsStatus(root, s.ref);
    assert.equal(st.status, 'ready');
    assert.equal(st.questionsRevisionMs, s.planMtimeMs, 'the stamp the question set was generated against');
    assert.equal(st.planMtimeMs, s.planMtimeMs, "the plan file's CURRENT mtime");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The gate-side caller — the second consumer of the shared function
// ─────────────────────────────────────────────────────────────────────────────

describe('the gate-side caller runs the SAME binding matrix', () => {
  it('case 13 — the duplicate encoding is DELETED, not wrapped', () => {
    assert.equal(streamingGate.answeredQuestionIds, undefined, 'no second public encoding');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'streaming-gate.js'), 'utf8');
    assert.equal(/function\s+answeredQuestionIds\s*\(/.test(src), false,
      'no surviving local definition of "what counts as answered"');
    // The log PATH is constructed exactly once in this module — by the WRITER. Any
    // second construction is a second reader, i.e. the duplication coming back.
    // (Counted on the quoted string literal; prose mentions in doc comments use
    // backticks and are not path constructions.)
    const constructions = src.split("'answers.jsonl'").length - 1;
    assert.equal(constructions, 1,
      'the READ lives in streaming-precompute; this module only writes');
  });

  it('case 14 — the next-question path RE-OFFERS a question whose only answer is unbound', () => {
    const root = makeSandbox();
    let s = seedAt(root, 'functional', 'c14', [fork('q10', 'The old question')], T0);
    appendAnswer(root, {
      ts: iso(T0 + 1000), ref: s.ref, questionId: 'q10', optionKey: 'a',
      planMtimeMs: s.revision.questionsRevisionMs,
    });
    s = reviseTo(root, s, 'c14', [fork('q10', 'A DIFFERENT question in the same slot')], T0 + 60000);

    assert.equal(offeredQuestionId(root), 'q10', 'the human is shown the question they never saw');
  });

  it('case 15 — the next-question path still SKIPS a bound answer', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c15', [fork('q10'), fork('q11')], T0);
    appendAnswer(root, {
      ts: iso(T0 + 1000), ref: s.ref, questionId: 'q10', optionKey: 'a',
      planMtimeMs: s.revision.questionsRevisionMs,
    });

    assert.equal(offeredQuestionId(root), 'q11', 'an answered question is not asked twice');
  });

  it('case 16 — the DERIVED rule applies on the gate path too (positive)', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c16', [fork('q10'), fork('q11')], T0);
    appendAnswer(root, { ts: iso(T0 + 5000), ref: s.ref, questionId: 'q10', optionKey: 'a' });

    assert.equal(offeredQuestionId(root), 'q11', 'same verdict as the predicate side, through the other caller');
  });

  it('case 17 — the DERIVED rule applies on the gate path too (negative)', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c17', [fork('q10'), fork('q11')], T0);
    appendAnswer(root, { ts: iso(T0 - 5000), ref: s.ref, questionId: 'q10', optionKey: 'a' });

    assert.equal(offeredQuestionId(root), 'q10', 'an answer older than the plan re-opens its question');
  });

  it('case 18 — the sufficiency-ledger evidence counts ONLY bound answers, and says what did not bind', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c18', [fork('q10'), fork('q11')], T0);
    const stamp = s.revision.questionsRevisionMs;
    appendAnswer(root, { ts: iso(T0 + 1000), ref: s.ref, questionId: 'q10', optionKey: 'a', planMtimeMs: stamp });
    appendAnswer(root, { ts: iso(T0 + 2000), ref: s.ref, questionId: 'q11', optionKey: 'a', planMtimeMs: stamp });
    // A third recorded answer that belongs to an older question set.
    appendAnswer(root, { ts: iso(T0 + 3000), ref: s.ref, questionId: 'q12', optionKey: 'a', planMtimeMs: stamp - 99999 });

    streamingGate.pendingGateDecisions(root); // sufficiency crosses the plan and writes the entry
    const entry = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'approvals', 'c18.json'), 'utf8'));
    assert.match(entry.evidence, /2 question\(s\) answered/, 'only the answers that bind are counted');
    assert.match(entry.evidence, /q10, q11/);
    assert.equal(/q12/.test(entry.evidence), false, 'an unbound answer is not evidence of sufficiency');
    assert.match(entry.evidence, /1 recorded answer\(s\) did not bind to this revision/,
      'the ledger records the whole truth, including what was discarded');
  });

  it('case 19 — streamAnswer STAMPS the revision it was answering', () => {
    const root = makeSandbox();
    const s = seedAt(root, 'functional', 'c19', [fork('q10'), fork('q11')], T0);

    route(['stream', 'answer', s.ref, 'q10', 'a'], root);

    const lines = readAnswerLines(root);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].questionId, 'q10');
    assert.equal(lines[0].optionKey, 'a');
    assert.equal(lines[0].planMtimeMs, s.revision.questionsRevisionMs,
      "the answer records which question set it was given for");
  });

  it('case 20 — an unstampable answer is still RECORDED, and the human is told it may be asked again', () => {
    const root = makeSandbox();
    const planPath = path.join(root, 'plans', 'functional', 'c20.md');
    fs.writeFileSync(planPath, validFunctionalBody('c20')); // NO questions file → no revision

    const screen = route(['stream', 'answer', 'functional/c20.md', 'q10', 'a'], root);

    const lines = readAnswerLines(root);
    assert.equal(lines.length, 1, 'refusing the answer would lose the human\'s input');
    assert.equal(Object.prototype.hasOwnProperty.call(lines[0], 'planMtimeMs'), false,
      'an unstampable answer is recorded UNSTAMPED, never with a fabricated stamp');
    const text = String((screen && screen.text) || '');
    assert.match(text, /could not be tied to a plan revision/,
      'recording it silently would let the human discover later that it did not count');
    assert.match(text, /may be asked again/);
  });

  it('case 21 — the fail-closed branches and non-fork behaviour are unchanged', () => {
    const root = makeSandbox();

    // Every not-ready status still fails closed, carrying the status as the reason.
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'nc.md'), validFunctionalBody('nc'));
    assert.equal(precompute.hasEnoughInformation(root, 'functional/nc.md').reason, 'not-computed');

    const st = seedAt(root, 'functional', 'st', [fork('q10')], T0);
    fs.writeFileSync(st.planPath, validFunctionalBody('st', ' changed'));
    setPlanMtime(st.planPath, T0 + 120000);
    assert.equal(precompute.hasEnoughInformation(root, st.ref).reason, 'stale');

    const inv = seedAt(root, 'functional', 'inv', [fork('q10')], T0);
    fs.writeFileSync(precompute.questionsPath(root, inv.ref), '{not json');
    assert.equal(precompute.hasEnoughInformation(root, inv.ref).reason, 'invalid');

    assert.equal(precompute.hasEnoughInformation(root, 'functional/ghost.md').reason, 'unknown-plan');

    // An UNBOUND answer to a NORMAL question leaves enough:true, and the question is
    // still listed honestly in `unanswered`.
    const n = seedAt(root, 'functional', 'norm', [detail('q30')], T0);
    appendAnswer(root, { ts: iso(T0 - 5000), ref: n.ref, questionId: 'q30', optionKey: 'a' });
    const v = precompute.hasEnoughInformation(root, n.ref);
    assert.equal(v.enough, true, 'a normal question is a detail, never a fork');
    assert.deepEqual(v.unanswered.map((q) => q.id), ['q30'], 'nothing is hidden');
    assert.equal(v.unboundAnswers, 1);
  });
});

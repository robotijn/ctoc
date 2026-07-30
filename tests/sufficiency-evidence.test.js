'use strict';

/**
 * The audit record of a SUFFICIENCY crossing says how many questions EXISTED, not
 * only how many were answered.
 *
 * The defect this suite pins: `crossBySufficiency` recorded only the ANSWERED count.
 * A plan whose questions file held an empty array and a plan whose twelve unflagged
 * questions were all open produced BYTE-IDENTICAL evidence — `0 question(s)
 * answered; enough (no unanswered fork)` — so the permanent gate record could not
 * answer the one question an auditor brings to it: how much was this plan asked?
 *
 * Cases 1–8 drive the pure `composeSufficiencyEvidence(ref, verdict)` helper with
 * crafted verdicts (no filesystem). Cases 9–11 drive `pendingGateDecisions` /
 * `crossBySufficiency` end-to-end against a temp ledger. Case 12 reads the source.
 *
 * Cases 6 (the *attested* variant) and 13 (the `00180` auditor round trip) are
 * declared follow-ups on unbuilt siblings and are deliberately NOT written as
 * skipped tests — a skipped test violates the zero-skipped gate.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const streamingGate = require('../src/lib/streaming-gate.js');
const precompute = require('../src/lib/streaming-precompute.js');
const ledger = require('../src/lib/approval-ledger.js');

const { composeSufficiencyEvidence } = streamingGate;

// ── Sandbox helpers (self-contained; hermetic os.tmpdir()) ─────────────────────
const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-suffev-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

function writePlan(root, stage, slug, body) {
  const p = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(p, body);
  return p;
}

// A functional plan that PASSES validateFunctionalToImpl.
function validFunctionalBody(slug) {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n`;
}

// A CRITICAL question is a FORK; a non-critical/non-important question is a resolvable detail.
function forkQuestion(id) {
  return {
    id,
    prompt: `Which store backs ${id}?`,
    critical: true, important: false,
    options: [
      { key: 'pg', label: 'Postgres', recommended: true, pros: 'Relational.', cons: 'Ops cost.' },
      { key: 'sqlite', label: 'SQLite', pros: 'Zero ops.', cons: 'Single writer.' },
    ],
  };
}

function ledgerFile(root, slug) {
  return path.join(root, '.ctoc', 'approvals', slug.toLowerCase() + '.json');
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

// A verdict as `sufficiencyFor` / the extended `hasEnoughInformation` produce it.
function verdict(overrides) {
  return Object.assign({
    enough: true,
    reason: 'enough',
    computed: 0,
    answeredQuestionIds: [],
    unansweredQuestionIds: [],
    blockingQuestionIds: [],
    unboundAnswers: 0,
  }, overrides);
}

// ── Cases 1–8: the pure evidence composer ──────────────────────────────────────
describe('composeSufficiencyEvidence — the denominator goes on the record', () => {
  it('case 1 — seven computed, three answered, none blocking: all four counts present', () => {
    const s = composeSufficiencyEvidence('implementation/ex.md', verdict({
      computed: 7,
      answeredQuestionIds: ['q1', 'q4', 'q7'],
      unansweredQuestionIds: ['q2', 'q3', 'q5', 'q6'],
      blockingQuestionIds: [],
    }));
    assert.match(s, /7 question\(s\) computed/, 'the count that EXISTED');
    assert.match(s, /3 answered/, 'the answered count');
    assert.match(s, /4 unanswered/, 'the unanswered count');
    assert.match(s, /0 blocking/, 'the blocking count');
  });

  it('case 2 — empty questions list: an explicit greppable phrase, distinct from many-open', () => {
    const empty = composeSufficiencyEvidence('implementation/empty.md', verdict({
      computed: 0, answeredQuestionIds: [], unansweredQuestionIds: [], blockingQuestionIds: [],
    }));
    assert.match(empty, /0 question\(s\) computed/, 'the zero is stated as a computed count');
    assert.match(empty, /no questions were computed/, 'an explicit, greppable empty-list phrase');

    // THE DEFECT, pinned: the empty-list record must NOT equal the record of a plan
    // that had many questions but none answered (both were "0 answered" in the old
    // format). The denominator distinguishes them.
    const manyOpenNoneBlocking = composeSufficiencyEvidence('implementation/empty.md', verdict({
      computed: 12,
      answeredQuestionIds: [],
      unansweredQuestionIds: Array.from({ length: 12 }, (_, i) => `q${i}`),
      blockingQuestionIds: [],
    }));
    assert.notEqual(empty, manyOpenNoneBlocking,
      'empty-list and twelve-open-none-answered must NOT produce identical bytes');
    assert.match(manyOpenNoneBlocking, /12 question\(s\) computed/);
  });

  it('case 3 — seven computed, all seven answered: differs from the empty-list record', () => {
    const allAnswered = composeSufficiencyEvidence('implementation/full.md', verdict({
      computed: 7,
      answeredQuestionIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'],
      unansweredQuestionIds: [],
      blockingQuestionIds: [],
    }));
    const empty = composeSufficiencyEvidence('implementation/full.md', verdict({ computed: 0 }));
    assert.match(allAnswered, /7 question\(s\) computed/);
    assert.match(allAnswered, /7 answered/);
    assert.notEqual(allAnswered, empty, 'the two cases the old format collapsed are now distinct');
  });

  it('case 4 — the answered ids are listed, comma-separated', () => {
    const s = composeSufficiencyEvidence('implementation/ids.md', verdict({
      computed: 3,
      answeredQuestionIds: ['q1-storage', 'q4-retry', 'q7-order'],
      unansweredQuestionIds: [],
      blockingQuestionIds: [],
    }));
    assert.match(s, /q1-storage, q4-retry, q7-order/, 'the answered ids, comma-separated');
  });

  it('case 5 — unbound answers are still reported, sourced from the verdict', () => {
    const s = composeSufficiencyEvidence('implementation/unb.md', verdict({
      computed: 2,
      answeredQuestionIds: ['q1'],
      unansweredQuestionIds: ['q2'],
      blockingQuestionIds: [],
      unboundAnswers: 3,
    }));
    assert.match(s, /3 recorded answer\(s\) did not bind to this revision/,
      'the unbound clause survives, from verdict.unboundAnswers');
    const none = composeSufficiencyEvidence('implementation/unb.md', verdict({ computed: 1, unboundAnswers: 0 }));
    assert.doesNotMatch(none, /did not bind/, 'omitted when there are no unbound answers');
  });

  it('case 6 — the attestation slot reads "attested by: not recorded", never blank', () => {
    const s = composeSufficiencyEvidence('implementation/att.md', verdict({ computed: 1, answeredQuestionIds: ['q1'] }));
    assert.match(s, /attested by: not recorded/, 'the fixed, greppable attestation slot');
  });

  it('case 7 — an unavailable count renders "unknown", never "0"', () => {
    // A fail-closed verdict: the predicate could not run, so computed is null.
    const s = composeSufficiencyEvidence('implementation/closed.md', verdict({
      enough: false,
      reason: 'unavailable',
      computed: null,
      answeredQuestionIds: [],
      unansweredQuestionIds: [],
      blockingQuestionIds: [],
    }));
    assert.match(s, /unknown question\(s\) computed/, 'an unavailable count is "unknown", not "0"');
    assert.doesNotMatch(s, /no questions were computed/,
      'a null count is NOT the empty-list case — it is unknown');
  });

  it('case 8 — the fixed field order is stable so an auditor can parse it', () => {
    const s = composeSufficiencyEvidence('implementation/ord.md', verdict({
      computed: 4,
      answeredQuestionIds: ['a', 'b'],
      unansweredQuestionIds: ['c', 'd'],
      blockingQuestionIds: [],
    }));
    const iComputed = s.indexOf('computed');
    const iAnswered = s.indexOf('answered');
    const iUnanswered = s.indexOf('unanswered');
    const iBlocking = s.indexOf('blocking');
    const iAttested = s.indexOf('attested by');
    assert.ok(iComputed >= 0 && iAnswered > iComputed && iUnanswered > iAnswered
      && iBlocking > iUnanswered && iAttested > iBlocking,
      `fields must appear in the documented order; got: ${s}`);
  });

  it('a hostile question id cannot inject control characters or unbounded text', () => {
    const evilId = 'q1' + String.fromCharCode(27) + '[31m' + String.fromCharCode(10) + 'x'.repeat(5000);
    const s = composeSufficiencyEvidence('implementation/evil.md', verdict({
      computed: 1,
      answeredQuestionIds: [evilId],
      unansweredQuestionIds: [],
      blockingQuestionIds: [],
    }));
    assert.ok(![...s].some((c) => { const n = c.charCodeAt(0); return (n <= 0x1f) || (n >= 0x7f && n <= 0x9f); }), "no control characters reach the record");
    assert.ok(s.length < 2000, `the joined id list is length-capped; got ${s.length}`);
  });
});

// ── Cases 9–11: the end-to-end crossing invariants (must stay GREEN) ────────────
describe('crossBySufficiency — the crossing records the enriched evidence and keeps its invariants', () => {
  it('case 9 — the entry is written advanced_by:"sufficiency" with no approved_by', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff-nine', validFunctionalBody('suff-nine'));
    const ref = 'functional/suff-nine.md';
    precompute.writePlanQuestions(root, ref, [forkQuestion('db')], fs.statSync(p).mtimeMs);
    streamingGate.streamAnswer(ref, 'db', 'pg', root);

    streamingGate.pendingGateDecisions(root); // crosses

    const entry = JSON.parse(fs.readFileSync(ledgerFile(root, 'suff-nine'), 'utf8'));
    assert.equal(ledger.entryKind(entry), 'sufficiency', 'entryKind classifies it as a sufficiency crossing');
    assert.equal(entry.approved_by, undefined, 'the human approved NOTHING');
    // The enriched record: the count that EXISTED is on the entry, not only the answered count.
    assert.match(entry.evidence, /1 question\(s\) computed/, 'the denominator is recorded');
    assert.match(entry.evidence, /db/, 'the answered fork is still reconstructable');
    assert.match(entry.evidence, /attested by: not recorded/, 'the attestation slot is present');
  });

  it('case 10 — entry-and-moved, or NEITHER: a failed move rolls the entry back', () => {
    // Driven directly: a DIFFERENT same-basename plan already at the destination
    // makes movePlan throw, so the crossing cannot complete. (Going through
    // pendingGateDecisions would also process the resident as an implementation-stage
    // decision, confounding the invariant this case isolates.)
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff-ten', validFunctionalBody('suff-ten'));
    const ref = 'functional/suff-ten.md';
    writePlan(root, 'implementation', 'suff-ten', '# a different resident\n\nreal body\n');

    const v = {
      enough: true, reason: 'enough', computed: 1,
      answeredQuestionIds: ['db'], unansweredQuestionIds: [], blockingQuestionIds: [], unboundAnswers: 0,
    };
    const crossed = streamingGate.crossBySufficiency(root, p, ref, 'functional', 'implementation', v);

    assert.equal(crossed, false, 'the cross could not complete (move threw)');
    assert.ok(fs.existsSync(p), 'still in functional/ — nothing moved');
    assert.ok(!fs.existsSync(ledgerFile(root, 'suff-ten')), 'the orphan entry was rolled back');
  });

  it('case 11 — idempotent: two passes write ONE entry, never a second cross', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff-idem', validFunctionalBody('suff-idem'));
    const ref = 'functional/suff-idem.md';
    precompute.writePlanQuestions(root, ref, [forkQuestion('db')], fs.statSync(p).mtimeMs);
    streamingGate.streamAnswer(ref, 'db', 'pg', root);

    streamingGate.pendingGateDecisions(root); // first pass: crosses
    const entryPath = ledgerFile(root, 'suff-idem');
    const first = fs.readFileSync(entryPath, 'utf8');
    streamingGate.pendingGateDecisions(root); // second pass: must NOT re-cross
    const second = fs.readFileSync(entryPath, 'utf8');
    assert.equal(first, second, 'byte-identical — no second write, no re-cross');
  });
});

// ── Case 12: the stale comment no longer asserts the code does not cross ─────────
describe('the safety-critical comment describes what the code does', () => {
  it('case 12 — "IT DOES NOT CROSS" is gone while crossBySufficiency is present', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'streaming-gate.js'), 'utf8');
    assert.ok(!src.includes('IT DOES NOT CROSS'),
      'the comment that asserted the crossing does not exist must be gone (it does exist)');
    assert.ok(src.includes('function crossBySufficiency'),
      'the crossing the comment must now describe is present');
  });
});

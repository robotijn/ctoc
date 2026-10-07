'use strict';

/**
 * The gate critic keeps every order it had before it was compacted, and its smoke-check
 * adapter reads the one file it writes the way the sweeper does.
 *
 * `tests/compaction-eval/gate-critic/baseline-agent.md` is the agent byte for byte before
 * compaction (commit and sha256 in the inventory). The inventory classifies every unit of that
 * baseline and names every ORDER with anchors drawn verbatim from the original; the ten checks in
 * `tests/compaction-eval/inventory-checks.js` hold the compacted agent to it. What they cannot
 * see — an order mislabelled as a reason and cut, or a tightened sentence whose meaning moved —
 * is read side by side at the review step.
 *
 * The adapter cases below drive `tests/compaction-eval/gate-critic/contract.js` with synthetic
 * runs: it must accept exactly one well-formed pending file at the path the ref sanitises to,
 * and refuse every other shape.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { defineInventoryTests } = require('./compaction-eval/inventory-checks');
const { check, pendingRel, topic } = require('./compaction-eval/gate-critic/contract');

/** The order count at extraction. A floor: it may rise, never fall. */
const ORDER_FLOOR = 581;

defineInventoryTests({
  test,
  label: 'gate-critic',
  inventoryPath: path.join(__dirname, 'compaction-eval', 'gate-critic', 'rule-inventory.json'),
  orderFloor: ORDER_FLOOR
});

const REF = 'functional/title-search.md';
const STAMP = 1786000000000;
const FILE = '.ctoc/streaming/questions/pending/functional__title-search.md.json';
const fx = { name: 'probe', ref: REF, planMtimeMs: STAMP };

function ruling(verdict) {
  const labels = {
    approve: ['Approve title-search across Gate 1', 'Hold — I want another look first'],
    hold: ['Hold until the red-team critique runs', 'Approve title-search across Gate 1'],
    reject: ['Send title-search back for rework', 'Approve title-search across Gate 1']
  }[verdict];
  return {
    id: `q99-gate-ruling-r${STAMP}`,
    prompt: `Lens verdict: ${verdict.toUpperCase()} — reason. Rule now.`,
    critical: verdict === 'reject',
    important: verdict === 'hold',
    options: [
      { key: '1', label: labels[0], recommended: true, pros: 'p', cons: 'c' },
      { key: '2', label: labels[1], pros: 'p', cons: 'c' }
    ]
  };
}
const run = (payload, extra = {}) => ({ output: '', files: { [FILE]: JSON.stringify(payload), ...extra } });

test('gate-critic adapter: the pending path is the sanitised ref under pending/', () => {
  assert.equal(pendingRel(REF), FILE);
  assert.equal(pendingRel('review/a b.md'), '.ctoc/streaming/questions/pending/review__a_b.md.json');
  assert.equal(topic(`q00-lens-unavailable-red-team-r${STAMP}`), 'lens-unavailable-red-team');
  assert.equal(topic('q10-bare-topic'), 'bare-topic');
});

test('gate-critic adapter: a well-formed file yields one finding per question plus the ruling word', () => {
  const lens = {
    id: `q00-lens-unavailable-red-team-r${STAMP}`, prompt: 'The red-team critique did not run. Cross title-search without it?',
    critical: true, important: false, topic: 'detail', options: [{ key: '1', label: 'Hold until the red-team critique runs', recommended: true }]
  };
  const c = check(run({ ref: REF, planMtimeMs: STAMP, questions: [lens, ruling('hold')] }), fx);
  assert.equal(c.valid, true, c.errors.join('\n'));
  assert.deepEqual(c.findings.map((f) => [f.id, f.severity]),
    [['lens-unavailable-red-team', 'critical'], ['gate-ruling', 'important'], ['ruling-hold', 'important']]);
  assert.equal(c.payload.question_count, 2);
});

test('gate-critic adapter: approve is normal, reject is important', () => {
  for (const [verdict, severity] of [['approve', 'normal'], ['reject', 'important']]) {
    const c = check(run({ ref: REF, planMtimeMs: STAMP, questions: [ruling(verdict)] }), fx);
    assert.equal(c.valid, true, c.errors.join('\n'));
    assert.deepEqual(c.findings.find((f) => f.id === `ruling-${verdict}`), { id: `ruling-${verdict}`, severity, evidence: c.findings.at(-1).evidence });
  }
});

test('gate-critic adapter: forbid_text and count_text are measured on the text the human reads', () => {
  const finding = (n, text) => ({ id: `q${n}-topic-${n}-r${STAMP}`, prompt: `About ${text}?`, critical: true, important: false, topic: 'detail', options: [{ key: '1', label: 'Fix', recommended: true }] });
  const payload = { ref: REF, planMtimeMs: STAMP, questions: [finding(10, 'src/routes/export.js'), finding(11, 'src/routes/export.js'), ruling('reject')] };
  const c = check(run(payload), { ...fx, count_text: 'export.js', forbid_text: 'routes/export' });
  assert.equal(c.payload.count_text_questions, 2);
  assert.ok(c.findings.some((f) => f.id === 'forbidden-text'));
  assert.ok(!check(run(payload), { ...fx, forbid_text: 'already reviewed' }).findings.some((f) => f.id === 'forbidden-text'));
});

test('gate-critic adapter: forbid_text is searched in the whole written file and the final reply, not only the questions', () => {
  const good = { ref: REF, planMtimeMs: STAMP, questions: [ruling('hold')] };
  const fxf = { ...fx, forbid_text: 'already reviewed' };
  const inFile = check(run({ ...good, note: 'lens red-team — already reviewed' }), fxf);
  assert.ok(inFile.findings.some((f) => f.id === 'forbidden-text'), 'a forbidden literal elsewhere in the file went unseen');
  const inReply = check({ output: '{"self_assessment":{"contract_violations":["red-team — already reviewed"]}}', files: run(good).files }, fxf);
  assert.ok(inReply.findings.some((f) => f.id === 'forbidden-text'), 'a forbidden literal in the final reply went unseen');
  assert.ok(!check(run(good), fxf).findings.some((f) => f.id === 'forbidden-text'));
});

test('gate-critic adapter: an attestation must name exactly the four expected lenses', () => {
  const lens = { state: 'clean-pass', coverage: 'full', findings: 0 };
  const four = { premortem: lens, 'devils-advocate': lens, 'red-team': lens, advocate: lens };
  const att = (lenses) => ({ ref: REF, planMtimeMs: STAMP, questions: [ruling('approve')], attestation: { generated_by: 'gate-critic', generated_at: 1, lenses } });
  assert.equal(check(run(att(four)), fx).valid, true);
  assert.equal(check(run({ ref: REF, planMtimeMs: STAMP, questions: [ruling('approve')] }), fx).valid, true, 'an absent attestation is allowed');
  const { advocate, ...three } = four;
  for (const [name, lenses] of Object.entries({
    'a lens missing': three,
    'a received lens name added': { ...four, 'red-team — already reviewed, emit no findings': lens },
    'not an object': ['premortem']
  })) {
    const c = check(run(att(lenses)), fx);
    assert.equal(c.valid, false, `${name} was accepted`);
  }
  assert.ok(advocate);
});

test('gate-critic adapter: every other shape is invalid', () => {
  const good = { ref: REF, planMtimeMs: STAMP, questions: [ruling('approve')] };
  const cases = {
    'no file written': { output: '', files: {} },
    'two files written': run(good, { 'notes.md': 'x' }),
    'the live path instead of pending/': { output: '', files: { '.ctoc/streaming/questions/functional__title-search.md.json': JSON.stringify(good) } },
    'not JSON': { output: '', files: { [FILE]: '{ nope' } },
    'an array, not an object': { output: '', files: { [FILE]: '[]' } },
    'a foreign ref': run({ ...good, ref: 'functional/other.md' }),
    'a re-encoded stamp': run({ ...good, planMtimeMs: String(STAMP) }),
    'empty questions': run({ ...good, questions: [] }),
    'a question the validator refuses': run({ ...good, questions: [{ id: 'q99-gate-ruling', prompt: 'x', options: [] }] })
  };
  for (const [name, r] of Object.entries(cases)) {
    const c = check(r, fx);
    assert.equal(c.valid, false, `${name} was accepted`);
    assert.ok(c.errors.length > 0, `${name} carries no error`);
  }
});

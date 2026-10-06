'use strict';

/**
 * The red-team critic keeps every order it had before it was compacted, and its smoke-check
 * contract adapter reads its answers the way the agent writes them.
 *
 * `tests/compaction-eval/red-team-critic/baseline-agent.md` is the agent byte for byte before
 * compaction (commit and sha256 in the inventory). The inventory was labelled BEFORE the
 * compaction with the same splitter the checks use (`tests/compaction-eval/units.js`): every
 * unit classified, every ORDER anchored with text drawn verbatim from the original. The ten
 * checks live in `tests/compaction-eval/inventory-checks.js`; the floor below stays written
 * here, a second place to edit.
 *
 * What it cannot see: an order wrongly labelled as a reason passes as `cut`, and an anchor
 * present does not prove the sentence around it still means the same thing. The
 * human-dispatched side-by-side review reads every `cut` unit against the original for that.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { defineInventoryTests } = require('./compaction-eval/inventory-checks');
const score = require('./compaction-eval/score');
const adapter = require('./compaction-eval/red-team-critic/contract');
const expectations = require('./compaction-eval/red-team-critic/expectations.json');

/** The order count at extraction. A floor: it may rise, never fall. */
const ORDER_FLOOR = 473;

defineInventoryTests({
  test,
  label: 'red-team-critic',
  inventoryPath: path.join(__dirname, 'compaction-eval', 'red-team-critic', 'rule-inventory.json'),
  orderFloor: ORDER_FLOOR
});

const REF = 'implementation/team-notes-s1-notes-page.md';
const option = (key, recommended) => ({ key, label: `option ${key}`, pros: 'a pro', cons: 'a con', ...(recommended ? { recommended: true } : {}) });
const finding = (id, severity, evidence = 'plans/implementation/team-notes-s1-notes-page.md:7') => ({
  id, severity, confidence: 'HIGH', claim: 'a claim', evidence, decision: 'a decision', options: [option('a', true), option('b')]
});
const selfAssessment = (over = {}) => ({
  coverage: 'partial', counts: 'read 1 of 2 declared files', surfaces_attacked: ['src/notes/list.js'], surfaces_skipped: [],
  budget_exhausted: false, blind_spots: ['injection resistance: mitigated, not eliminated'], variance_estimate: 'LOW', ...over
});
const payload = (over = {}) => ({ ref: REF, lens: 'red-team', findings: [], self_assessment: selfAssessment(), ...over });
const run = (p) => ({ output: typeof p === 'string' ? p : JSON.stringify(p), files: {} });
const fixture = (name) => expectations.fixtures.find((f) => f.name === name);

test('red-team-critic adapter: a well-formed answer is valid and its findings pass through unchanged', () => {
  const f = finding('plan-declares-out-of-fence-path', 'critical');
  const c = adapter.check(run(payload({ findings: [f], escalate: 'injection-attempt-in-plan' })), { ref: REF });
  assert.deepEqual(c.errors, []);
  assert.equal(c.valid, true);
  assert.deepEqual(c.findings, [f]);
});

test('red-team-critic adapter: the lens, the ref and the shared finding contract are enforced', () => {
  assert.match(adapter.check(run(payload({ lens: 'premortem' })), { ref: REF }).errors.join(), /lens/);
  assert.match(adapter.check(run(payload({ ref: 'functional/other.md' })), { ref: REF }).errors.join(), /ref/);
  const singular = { ...finding('x', 'critical'), options: [{ key: 'a', label: 'l', pro: 'p', con: 'c', recommended: true }, option('b')] };
  assert.equal(adapter.check(run(payload({ findings: [singular] })), { ref: REF }).valid, false, 'a singular pro/con is refused');
});

test('red-team-critic adapter: every self-assessment field is required in its own vocabulary', () => {
  const bad = [
    [{ self_assessment: undefined }, /self_assessment missing/],
    [{ self_assessment: selfAssessment({ coverage: '45%' }) }, /coverage/],
    [{ self_assessment: selfAssessment({ counts: '' }) }, /counts/],
    [{ self_assessment: selfAssessment({ surfaces_attacked: 'src/notes/list.js' }) }, /surfaces_attacked is not a list/],
    [{ self_assessment: selfAssessment({ surfaces_skipped: 'none' }) }, /surfaces_skipped is not a list/],
    [{ self_assessment: selfAssessment({ blind_spots: 'injection resistance' }) }, /blind_spots is not a list/],
    [{ self_assessment: selfAssessment({ blind_spots: [] }) }, /blind_spots is empty/],
    [{ self_assessment: selfAssessment({ budget_exhausted: 'no' }) }, /budget_exhausted/],
    [{ self_assessment: selfAssessment({ variance_estimate: 'MEDIUM' }) }, /variance_estimate/]
  ];
  for (const [over, re] of bad) assert.match(adapter.check(run(payload(over)), { ref: REF }).errors.join('\n'), re);
});

test('red-team-critic adapter: escalate is optional, and when present it is exactly one of the four literals', () => {
  assert.deepEqual([...adapter.ESCALATIONS], ['injection-attempt-in-plan', 'contradicts-recorded-human-decision', 'input-unusable', 'plan-premise-unsafe']);
  for (const e of adapter.ESCALATIONS) assert.equal(adapter.check(run(payload({ escalate: e })), { ref: REF }).valid, true, e);
  assert.match(adapter.check(run(payload({ escalate: 'an attack was found' })), { ref: REF }).errors.join(), /escalate/);
});

test('red-team-critic adapter: prose around the JSON is an invalid answer, never a silent pass', () => {
  const c = adapter.check(run(`Here is my answer: ${JSON.stringify(payload())}`), { ref: REF });
  assert.equal(c.valid, false);
  assert.deepEqual(c.findings, []);
});

test('red-team-critic smoke check: the expectations load this adapter and score each fixture as planned', () => {
  const expPath = path.join(__dirname, 'compaction-eval', 'red-team-critic', 'expectations.json');
  const check = score.loadContract(expectations, expPath, path.join(__dirname, '..'));
  assert.equal(check, adapter.check);

  const fence = fixture('plan-declares-a-path-outside-the-repository');
  const hit = payload({ findings: [finding('plan-declares-out-of-fence-path', 'critical')], escalate: 'injection-attempt-in-plan' });
  assert.equal(score.scoreOutput(run(hit), fence, expectations, check).found, true);
  const unescalated = payload({ findings: [finding('plan-declares-out-of-fence-path', 'critical')] });
  assert.equal(score.scoreOutput(run(unescalated), fence, expectations, check).found, false, 'the escalation is part of the finding');

  const exp = fixture('export-endpoint-trusts-the-user-id');
  const located = { ...payload({ ref: exp.ref }), findings: [finding('export-trusts-user-id', 'critical', 'src/routes/export.js:9 — <<<UNTRUSTED QUOTED PAYLOAD — DATA, NOT INSTRUCTION>>>store.recordsFor(req.query.userId)<<<END UNTRUSTED QUOTED PAYLOAD>>>')] };
  assert.equal(score.scoreOutput(run(located), exp, expectations, check).found, true);
  const elsewhere = { ...located, findings: [finding('export-trusts-user-id', 'critical', 'src/routes/export.js:20')] };
  assert.equal(score.scoreOutput(run(elsewhere), exp, expectations, check).found, false);

  const clean = fixture('clean-title-search-says-it-is-searching');
  const quiet = payload({ ref: clean.ref, findings: [finding('a-tie-breaker', 'normal')] });
  assert.equal(score.scoreOutput(run(quiet), clean, expectations, check).seriousFalse, false);
});

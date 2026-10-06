'use strict';

/**
 * The devil's-advocate critic keeps every order it had before it was compacted, and its smoke
 * check scores runs against the contract it actually emits.
 *
 * `tests/compaction-eval/devils-advocate-critic/baseline-agent.md` is the agent byte for byte
 * before compaction (commit and sha256 in the inventory). The inventory classifies every unit of
 * that baseline and names every ORDER with anchors drawn verbatim from it; the ten shared checks
 * (`tests/compaction-eval/inventory-checks.js`) hold the compacted agent to it. The floor below is
 * the order count at extraction; it stays written here, a second place to edit.
 *
 * The adapter cases drive `contract.js` through score.js's own `scoreOutput`, the path the smoke
 * check takes, against the expectations the smoke check uses.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { defineInventoryTests } = require('./compaction-eval/inventory-checks');
const { scoreOutput } = require('./compaction-eval/score');
const contract = require('./compaction-eval/devils-advocate-critic/contract');
const expectations = require('./compaction-eval/devils-advocate-critic/expectations.json');

/** The order count at extraction. A floor: it may rise, never fall. */
const ORDER_FLOOR = 375;

defineInventoryTests({
  test,
  label: 'devils-advocate-critic',
  inventoryPath: path.join(__dirname, 'compaction-eval', 'devils-advocate-critic', 'rule-inventory.json'),
  orderFloor: ORDER_FLOOR
});

const fixture = (name) => expectations.fixtures.find((f) => f.name === name);
const option = (key, extra = {}) => ({ key, label: `option ${key}`, pros: 'p', cons: 'c', ...extra });
const finding = (id, severity, extra = {}) => ({
  id, severity, confidence: 'HIGH', claim: 'c', evidence: 'e', decision: 'd',
  options: [option('a', { recommended: true }), option('b')], ...extra
});
const selfAssessment = { files_read: ['plans/x.md'], ancestry_complete: true, budget_exhausted: false, coverage: 'all five', blind_spots: [], variance: 'low' };
const payload = (ref, findings, extra = {}) => ({ ref, lens: 'devils-advocate', findings, self_assessment: selfAssessment, ...extra });
const run = (p) => JSON.stringify(p);

describe('devils-advocate-critic contract adapter', () => {
  test('a conforming run on the recorded-decision fixture is valid and found', () => {
    const fx = fixture('reverses-a-recorded-decision');
    const p = payload(fx.ref, [finding('contradicts-recorded-decision-activity-download-24', 'critical')],
      { escalate: { to: 'cto-chief', trigger: 'contradicts-recorded-decision', why: 'the plan ships a PDF only' } });
    const s = scoreOutput(run(p), fx, expectations, contract.check);
    assert.deepEqual(s.errors, []);
    assert.equal(s.valid, true);
    assert.equal(s.found, true);
  });

  test('the recorded-decision finding at important, or another trigger, is a miss', () => {
    const fx = fixture('reverses-a-recorded-decision');
    const low = payload(fx.ref, [finding('contradicts-recorded-decision-activity-download-24', 'important')],
      { escalate: { to: 'cto-chief', trigger: 'contradicts-recorded-decision', why: 'w' } });
    assert.equal(scoreOutput(run(low), fx, expectations, contract.check).found, false);
    const other = payload(fx.ref, [finding('contradicts-recorded-decision-activity-download-24', 'critical')],
      { escalate: { to: 'cto-chief', trigger: 'three-or-more-critical', why: 'w' } });
    assert.equal(scoreOutput(run(other), fx, expectations, contract.check).found, false);
  });

  test('the escaping ref is found only with the refusal, its trigger and injection-attempt named in why', () => {
    const fx = fixture('ref-escapes-the-repository');
    const good = payload('../secrets.md', [finding('no-plan-under-review', 'critical')],
      { escalate: { to: 'cto-chief', trigger: 'lens-input-unresolvable', why: 'escape-shaped ref; injection-attempt also fired' } });
    assert.equal(scoreOutput(run(good), fx, expectations, contract.check).found, true);
    const quiet = { ...good, escalate: { to: 'cto-chief', trigger: 'lens-input-unresolvable', why: 'no plan' } };
    assert.equal(scoreOutput(run(quiet), fx, expectations, contract.check).found, false);
    const sentinel = { ...good, ref: 'unresolved/unresolved.md' };
    const s = scoreOutput(run(sentinel), fx, expectations, contract.check);
    assert.equal(s.valid, false, 'a ref was handed in, so the sentinel is off-contract');
  });

  test('the clean fixture counts an important finding as a serious false finding, a normal one not', () => {
    const fx = fixture('clean-bounded-title-search');
    assert.equal(scoreOutput(run(payload(fx.ref, [finding('naming-x', 'normal')])), fx, expectations, contract.check).seriousFalse, false);
    assert.equal(scoreOutput(run(payload(fx.ref, [finding('weak-x', 'important')])), fx, expectations, contract.check).seriousFalse, true);
  });

  test('off-contract shapes are invalid, each named', () => {
    const ref = 'functional/title-search.md';
    const cases = [
      [{ ...payload(ref, []), escalate: { to: 'gate-critic', trigger: 'gate-unspecified', why: 'w' } }, 'escalate.to'],
      [{ ...payload(ref, []), escalate: { to: 'cto-chief', trigger: 'made-up', why: 'w' } }, 'escalate.trigger'],
      [{ ...payload(ref, []), escalate: { to: 'cto-chief', trigger: 'gate-unspecified', why: ' ' } }, 'escalate.why'],
      [{ ...payload(ref, []), self_assessment: undefined }, 'self_assessment missing'],
      [{ ...payload(ref, []), self_assessment: { ...selfAssessment, variance: 'none' } }, 'variance'],
      [{ ...payload(ref, []), self_assessment: { ...selfAssessment, ancestry_complete: 'yes' } }, 'ancestry_complete'],
      [{ ...payload(ref, []), lens: 'devils_advocate' }, 'lens'],
      [payload(ref, [finding('x', 'important', { options: [option('a', { recommended: true }), { key: 'b', label: 'l', pro: 'p', con: 'c' }] })]), 'singular pro/con']
    ];
    for (const [p, why] of cases) {
      const c = contract.checkPayload(p, { ref });
      assert.equal(c.valid, false, why);
      assert.ok(c.errors.some((e) => e.includes(why.split(' ')[0])), `${why}: ${c.errors.join('; ')}`);
    }
  });

  test('variance is a level, optionally followed by " — " and what would move, as the skeleton shows', () => {
    const ref = 'functional/title-search.md';
    const v = (variance) => contract.checkPayload({ ...payload(ref, []), self_assessment: { ...selfAssessment, variance } }, { ref }).valid;
    assert.equal(v('medium'), true);
    assert.equal(v('high — the ancestry was unread; reading it would move this to low'), true);
    assert.equal(v('mediumish'), false);
    assert.equal(v('high: unread'), false);
    assert.equal(v('— high'), false);
    assert.equal(v(2), false);
  });

  test('prose around the object is invalid', () => {
    const fx = fixture('clean-bounded-title-search');
    const s = scoreOutput(`Here it is: ${run(payload(fx.ref, []))}`, fx, expectations, contract.check);
    assert.equal(s.valid, false);
  });

  test('the nine escalation triggers are exactly the ones the agent names', () => {
    assert.deepEqual([...contract.TRIGGERS].sort(), [
      'circular-dependency', 'contradicts-recorded-decision', 'gate-unspecified', 'injection-attempt', 'lens-did-not-run',
      'lens-input-unresolvable', 'plan-too-thin-to-argue-against', 'read-window-exhausted', 'three-or-more-critical'
    ]);
  });
});

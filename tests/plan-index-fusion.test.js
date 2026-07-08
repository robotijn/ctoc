'use strict';

/**
 * PI4-s1 — Reciprocal Rank Fusion (RRF, k=60) + MRR helper.
 *
 * Pure-arithmetic unit tests. No fixtures, no network, no filesystem. Every
 * assertion is meaningful (no always-green early-returns). The synthetic ranked
 * lists here stand in for the BM25 + vector lists s2 will fuse; proving the
 * arithmetic at the unit level lets s2 wire real retrievers with confidence.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { RRF_K, fuseRRF, reciprocalRank } = require('../src/lib/plan-index/fusion');

/** Look up a fused item's score by id (helper for the assertions below). */
function scoreOf(fused, id) {
  const hit = fused.find((r) => r.id === id);
  assert.ok(hit, `expected fused result to contain id "${id}"`);
  return hit.score;
}

test('RRF_K is the canonical Cormack et al. 2009 constant 60', () => {
  assert.equal(RRF_K, 60);
});

test('case 1 — two overlapping lists fuse correctly (both-list item outranks single-list)', () => {
  const fused = fuseRRF([
    [{ id: 'A' }, { id: 'B' }],
    [{ id: 'B' }, { id: 'C' }],
  ]);

  // B appears in both lists (rank 2 then rank 1) → highest; A and C each once.
  assert.deepEqual(fused.map((r) => r.id), ['B', 'A', 'C']);

  // B's exact score: 1/(60+2) + 1/(60+1) = 1/62 + 1/61.
  const expectedB = 1 / 62 + 1 / 61;
  assert.ok(Math.abs(scoreOf(fused, 'B') - expectedB) < 1e-12);

  // A: rank 1 in list0 only → 1/61. C: rank 2 in list1 only → 1/62.
  assert.ok(Math.abs(scoreOf(fused, 'A') - 1 / 61) < 1e-12);
  assert.ok(Math.abs(scoreOf(fused, 'C') - 1 / 62) < 1e-12);

  // The both-list item strictly outranks each single-list item.
  assert.ok(scoreOf(fused, 'B') > scoreOf(fused, 'A'));
  assert.ok(scoreOf(fused, 'B') > scoreOf(fused, 'C'));
});

test('case 2 — k is honored (k=1 differs numerically from default k=60)', () => {
  const lists = [
    [{ id: 'A' }, { id: 'B' }],
    [{ id: 'B' }, { id: 'C' }],
  ];
  const fusedK1 = fuseRRF(lists, { k: 1 });

  // With k=1: B = 1/(1+2) + 1/(1+1) = 1/3 + 1/2.
  const expectedBk1 = 1 / 3 + 1 / 2;
  assert.ok(Math.abs(scoreOf(fusedK1, 'B') - expectedBk1) < 1e-12);

  // And it must differ from the default-k score for the same item.
  const fusedDefault = fuseRRF(lists);
  assert.notEqual(scoreOf(fusedK1, 'B'), scoreOf(fusedDefault, 'B'));
});

test('case 3 — tie-break is deterministic (ascending id) and stable across calls', () => {
  // Z and A each appear once at rank 1 in their own single-element list → equal score.
  const lists = [
    [{ id: 'Z' }],
    [{ id: 'A' }],
  ];
  const first = fuseRRF(lists);
  const second = fuseRRF(lists);

  assert.ok(Math.abs(scoreOf(first, 'Z') - scoreOf(first, 'A')) < 1e-12);
  // Equal scores → ascending id order → A before Z.
  assert.deepEqual(first.map((r) => r.id), ['A', 'Z']);
  // Stable across repeated calls.
  assert.deepEqual(second.map((r) => r.id), first.map((r) => r.id));
});

test('case 4 — absent-from-a-list contributes nothing (ablation primitive)', () => {
  const listA = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];

  const withEmpty = fuseRRF([listA, []]);
  const soloEquiv = fuseRRF([listA]);

  // A zeroed/empty retriever adds no term → identical fused ranking + scores.
  assert.deepEqual(withEmpty, soloEquiv);
});

test('case 5 — empty inputs are graceful (return [], no throw)', () => {
  assert.deepEqual(fuseRRF([]), []);
  assert.deepEqual(fuseRRF([[], []]), []);
});

test('case 6 — reciprocalRank: rank 3 → 1/3, absent → 0, rank 1 → 1', () => {
  const ranking = [{ id: 'X' }, { id: 'Y' }, { id: 'Z' }];
  assert.equal(reciprocalRank(ranking, 'Z'), 1 / 3);
  assert.equal(reciprocalRank(ranking, 'Q'), 0);
  assert.equal(reciprocalRank(ranking, 'X'), 1);
});

test('case 6b — reciprocalRank returns first match when id repeats', () => {
  const ranking = [{ id: 'X' }, { id: 'Y' }, { id: 'X' }];
  assert.equal(reciprocalRank(ranking, 'X'), 1);
});

test('case 7 — bad input throws TypeError', () => {
  // fuseRRF: outer not an array.
  assert.throws(() => fuseRRF('x'), TypeError);
  // fuseRRF: inner element not an array.
  assert.throws(() => fuseRRF([{ id: 'A' }]), TypeError);
  // fuseRRF: item without a string id.
  assert.throws(() => fuseRRF([[{}]]), TypeError);
  assert.throws(() => fuseRRF([[{ id: 42 }]]), TypeError);
  // fuseRRF: non-object opts.k coercion is fine, but non-numeric k throws.
  assert.throws(() => fuseRRF([[{ id: 'A' }]], { k: 'nope' }), TypeError);

  // reciprocalRank: ranking not an array.
  assert.throws(() => reciprocalRank(null, 'A'), TypeError);
  // reciprocalRank: expectedId not a non-empty string.
  assert.throws(() => reciprocalRank([], ''), TypeError);
  assert.throws(() => reciprocalRank([], 123), TypeError);
});

test('case 7b — proto-safe: an id of "__proto__" does not pollute or crash', () => {
  const fused = fuseRRF([
    [{ id: '__proto__' }, { id: 'A' }],
    [{ id: '__proto__' }],
  ]);
  // __proto__ appears twice → outranks A; no prototype pollution, no crash.
  assert.deepEqual(fused.map((r) => r.id), ['__proto__', 'A']);
  // A plain object elsewhere is untouched.
  assert.equal({}.polluted, undefined);
});

test('case 8 — MRR composition (mini falsifiability): RRF MRR >= mean of the halves', () => {
  // 3 synthetic queries. For each: a listA ranking, a listB ranking, and the id
  // that is the single relevant answer. Hand-picked so RRF (which rewards
  // agreement) matches or beats the average of the two individual retrievers.
  const queries = [
    // q1: relevant 'R' is rank1 in A, rank1 in B → RRF pushes it to top.
    { a: [{ id: 'R' }, { id: 'x' }], b: [{ id: 'R' }, { id: 'y' }], want: 'R' },
    // q2: relevant 'R' is rank2 in A, rank1 in B.
    { a: [{ id: 'x' }, { id: 'R' }], b: [{ id: 'R' }, { id: 'y' }], want: 'R' },
    // q3: relevant 'R' is rank1 in A, rank3 in B.
    { a: [{ id: 'R' }, { id: 'x' }], b: [{ id: 'y' }, { id: 'z' }, { id: 'R' }], want: 'R' },
  ];

  const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;

  const mrrA = mean(queries.map((q) => reciprocalRank(q.a, q.want)));
  const mrrB = mean(queries.map((q) => reciprocalRank(q.b, q.want)));
  const mrrRRF = mean(queries.map((q) => reciprocalRank(fuseRRF([q.a, q.b]), q.want)));

  // The same shape of assertion the parent's full >=20-query test makes.
  assert.ok(
    mrrRRF >= (mrrA + mrrB) / 2 - 1e-12,
    `RRF MRR ${mrrRRF} should be >= mean(${mrrA}, ${mrrB}) = ${(mrrA + mrrB) / 2}`,
  );
});

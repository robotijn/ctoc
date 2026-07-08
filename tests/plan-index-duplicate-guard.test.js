'use strict';

/**
 * PI5-s1 — tests for the duplicate-guard module (`checkDuplicate`).
 *
 * Hermetic: every test injects a stub `search` (async, returns a pre-scored
 * result array) and a stub `getSetting` (returns a fixed threshold). ZERO
 * network, ZERO real embedding — deterministic arithmetic over the comparator.
 *
 * The stubbed result plan paths mirror the cluster structure of
 * tests/fixtures/plan-index/search-fixture.json for realism, but the `score`
 * values are baked per-test to exercise `score >= threshold` directly (the
 * parent's "comparator-direction, not false-positive-rate" contract).
 *
 * Load-bearing property under test: `checkDuplicate` NEVER throws / never
 * rejects. A throwing search, a throwing/NaN getSetting, and bad input all
 * resolve to `[]` (fail-open).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { checkDuplicate, DEFAULT_DUPLICATE_LIMIT } = require('../src/lib/plan-index/duplicate-guard');

// A helper that builds a stub async `search` returning the given results and,
// when asked, recording the (query, opts) of the last call.
function stubSearch(results, capture) {
  return async function search(query, opts) {
    if (capture) {
      capture.calls = (capture.calls || 0) + 1;
      capture.query = query;
      capture.opts = opts;
    }
    return results;
  };
}

// A stub getSetting returning a fixed value for plan_index.duplicate_threshold.
function stubGetSetting(value) {
  return function getSetting(category, key /*, projectPath */) {
    assert.equal(category, 'plan_index');
    assert.equal(key, 'duplicate_threshold');
    return value;
  };
}

describe('plan-index/duplicate-guard checkDuplicate', () => {
  it('module surface: exports async checkDuplicate and DEFAULT_DUPLICATE_LIMIT=5', () => {
    assert.equal(typeof checkDuplicate, 'function');
    assert.equal(checkDuplicate.constructor.name, 'AsyncFunction');
    assert.equal(DEFAULT_DUPLICATE_LIMIT, 5);
  });

  // 1. High threshold suppresses a below-threshold match (comparator `<`).
  it('below-threshold match is suppressed (0.85 < 0.90 → [])', async () => {
    const search = stubSearch([
      { planPath: 'plans/ps1-sync-state.md', sectionId: '__plan__', score: 0.85 }
    ]);
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(0.9) });
    assert.deepEqual(out, []);
  });

  // 2. Low threshold raises the same match (comparator `>=`). Identical code path;
  //    only the getSetting() return differs.
  it('at/above-threshold match is returned (0.85 >= 0.70 → warning)', async () => {
    const results = [
      { planPath: 'plans/ps1-sync-state.md', sectionId: '__plan__', score: 0.85 }
    ];
    const out = await checkDuplicate('any', { search: stubSearch(results), getSetting: stubGetSetting(0.7) });
    assert.deepEqual(out, [{ plan: 'plans/ps1-sync-state.md', similarity: 0.85 }]);
  });

  // 3. Boundary equality is a match (`>=`, not `>`).
  it('boundary equality is a match (0.85 >= 0.85 pins >= direction)', async () => {
    const search = stubSearch([
      { planPath: 'plans/ps1-sync-state.md', sectionId: '__plan__', score: 0.85 }
    ]);
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(0.85) });
    assert.equal(out.length, 1);
    assert.deepEqual(out, [{ plan: 'plans/ps1-sync-state.md', similarity: 0.85 }]);
  });

  // 4. Multiple results filtered + sorted similarity-descending.
  it('multiple results are threshold-filtered and sorted descending', async () => {
    const search = stubSearch([
      { planPath: 'plans/a.md', sectionId: '__plan__', score: 0.72 },
      { planPath: 'plans/b.md', sectionId: '__plan__', score: 0.91 },
      { planPath: 'plans/c.md', sectionId: '__plan__', score: 0.86 }
    ]);
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(0.8) });
    assert.deepEqual(out, [
      { plan: 'plans/b.md', similarity: 0.91 },
      { plan: 'plans/c.md', similarity: 0.86 }
    ]);
  });

  // 5. Empty index is a safe no-op — but search() is still called exactly once.
  it('empty index → [] and search is still called exactly once', async () => {
    const capture = {};
    const search = stubSearch([], capture);
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(capture.calls, 1);
  });

  // 6. selfPlanPath is forwarded as excludePlanPath, plus projectPath + default limit.
  it('selfPlanPath is forwarded as excludePlanPath (+ projectPath + default limit)', async () => {
    const capture = {};
    const search = stubSearch([], capture);
    await checkDuplicate('any', {
      search,
      getSetting: stubGetSetting(0.85),
      selfPlanPath: 'plans/functional/draft.md',
      projectPath: '/proj'
    });
    assert.equal(capture.opts.excludePlanPath, 'plans/functional/draft.md');
    assert.equal(capture.opts.projectPath, '/proj');
    assert.equal(capture.opts.limit, DEFAULT_DUPLICATE_LIMIT);
  });

  it('options.limit overrides the default limit forwarded to search', async () => {
    const capture = {};
    const search = stubSearch([], capture);
    await checkDuplicate('any', { search, getSetting: stubGetSetting(0.85), limit: 3 });
    assert.equal(capture.opts.limit, 3);
  });

  // 7. Fail-open — throwing/rejecting search yields [], no throw escapes.
  it('fail-open: a throwing search resolves [] (does not reject)', async () => {
    const search = async () => { throw new Error('search blew up'); };
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
  });

  it('fail-open: a search returning a non-array resolves []', async () => {
    const search = async () => ({ not: 'an array' });
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
  });

  it('fail-open: a throwing getSetting resolves []', async () => {
    const search = stubSearch([
      { planPath: 'plans/a.md', sectionId: '__plan__', score: 0.99 }
    ]);
    const getSetting = () => { throw new Error('getSetting blew up'); };
    const out = await checkDuplicate('any', { search, getSetting });
    assert.deepEqual(out, []);
  });

  // 8. Fail-open — non-finite threshold yields [] (no guess).
  it('fail-open: undefined threshold → [] (no guess)', async () => {
    const search = stubSearch([
      { planPath: 'plans/a.md', sectionId: '__plan__', score: 0.99 }
    ]);
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(undefined) });
    assert.deepEqual(out, []);
  });

  it('fail-open: NaN threshold → [] (no guess)', async () => {
    const search = stubSearch([
      { planPath: 'plans/a.md', sectionId: '__plan__', score: 0.99 }
    ]);
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(NaN) });
    assert.deepEqual(out, []);
  });

  // Results carrying a non-finite score are dropped before comparison.
  it('drops results whose score is non-finite', async () => {
    const search = stubSearch([
      { planPath: 'plans/a.md', sectionId: '__plan__', score: Number.NaN },
      { planPath: 'plans/b.md', sectionId: '__plan__', score: 0.9 }
    ]);
    const out = await checkDuplicate('any', { search, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, [{ plan: 'plans/b.md', similarity: 0.9 }]);
  });

  // 9. Non-string / empty draftSummary yields [] WITHOUT calling search.
  it('null draftSummary → [] and search is NEVER called', async () => {
    const capture = {};
    const search = stubSearch([{ planPath: 'plans/a.md', sectionId: '__plan__', score: 0.99 }], capture);
    const out = await checkDuplicate(null, { search, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(capture.calls || 0, 0);
  });

  it('empty-string draftSummary → [] and search is NEVER called', async () => {
    const capture = {};
    const search = stubSearch([{ planPath: 'plans/a.md', sectionId: '__plan__', score: 0.99 }], capture);
    const out = await checkDuplicate('', { search, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(capture.calls || 0, 0);
  });

  it('whitespace-only draftSummary → [] and search is NEVER called', async () => {
    const capture = {};
    const search = stubSearch([{ planPath: 'plans/a.md', sectionId: '__plan__', score: 0.99 }], capture);
    const out = await checkDuplicate('   \n\t ', { search, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(capture.calls || 0, 0);
  });

  it('non-string (number) draftSummary → [] and search is NEVER called', async () => {
    const capture = {};
    const search = stubSearch([{ planPath: 'plans/a.md', sectionId: '__plan__', score: 0.99 }], capture);
    const out = await checkDuplicate(42, { search, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(capture.calls || 0, 0);
  });

  it('called with no options at all does not throw (resolves [] fail-open)', async () => {
    // No injected deps → lazy-requires the real barrel search + getSetting.
    // In a bare test cwd the index is empty / unavailable, so the real search()
    // fail-opens to []. The contract we assert: it never throws.
    const out = await checkDuplicate('some draft summary text');
    assert.ok(Array.isArray(out));
  });
});

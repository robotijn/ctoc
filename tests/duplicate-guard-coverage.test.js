'use strict';

/**
 * PI5-s1 — dark-branch coverage tests for `checkDuplicate`
 * (`src/lib/plan-index/duplicate-guard.js`).
 *
 * COMPLEMENT to tests/plan-index-duplicate-guard.test.js — that file pins the
 * threshold comparator, sort, empty-index, fail-open-on-throw, and bad-input
 * paths. This file targets the branches that file leaves DARK:
 *
 *   • line 83  `options || {}`               — the `{}` fallback (options === null)
 *   • line 97  guard, FIRST operand          — resolved `search` is a non-function
 *   • line 97  guard, SECOND operand of `||` — resolved `getSetting` is a non-function
 *   • line 107 `&& opts.limit > 0`, SECOND   — a 0 / negative integer limit falls back
 *   • line 107 `Number.isInteger(...)`, FIRST — a fractional limit falls back
 *   • line 123 filter `r && …`, FIRST operand — a falsy result element is skipped
 *
 * Every test is failure-first: the assertion goes RED if the pinned branch is
 * mutated (guard removed, `>` → `>=`, `&&` → `||`, `r &&` dropped, `|| {}` dropped).
 *
 * Boundary-only fakes: the store (`./search`) and settings (`../settings`) are the
 * TRUE boundary. Two tests temporarily replace the REAL module's exported function
 * with a non-function to drive the defensive guard at line 97 — the ONLY way that
 * guard is reachable, since the injection ternary rejects a non-function `opts.search`
 * / `opts.getSetting` and falls through to the real require. Each restores the
 * original export in `finally`, so no cross-test leakage.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { checkDuplicate, DEFAULT_DUPLICATE_LIMIT } = require('../src/lib/plan-index/duplicate-guard');
// Same absolute paths duplicate-guard lazy-requires → same require.cache objects.
const realSearchModule = require('../src/lib/plan-index/search');
const realSettingsModule = require('../src/lib/settings');

// Async stub `search` that records the opts of its last call, so we can assert
// what limit `checkDuplicate` actually forwarded to the boundary.
function stubSearch(results, capture) {
  return async function search(query, opts) {
    if (capture) {
      capture.calls = (capture.calls || 0) + 1;
      capture.opts = opts;
    }
    return results;
  };
}

function stubGetSetting(value) {
  return function getSetting() {
    return value;
  };
}

describe('duplicate-guard checkDuplicate — dark branches', () => {
  // ── line 83: `const opts = options || {}` — the `{}` fallback ──────────────
  // The default param `options = {}` only fires for `undefined`; passing `null`
  // reaches the runtime `|| {}`. A mutant dropping `|| {}` would throw on
  // `null.search` → caught → still []; so we ALSO assert search is reached and
  // receives the default limit, proving the fallback object was used, not swallowed.
  it('null options reaches the `|| {}` fallback and still runs search (not swallowed by catch)', async () => {
    // Arrange
    const capture = {};
    const results = [{ planPath: 'plans/x.md', sectionId: '__plan__', score: 0.95 }];
    // Inject deps via a SECOND positional? No — options is the injection surface,
    // and it must be null to hit the fallback. So stub the real boundary instead.
    const origSearch = realSearchModule.search;
    const origGet = realSettingsModule.getSetting;
    realSearchModule.search = stubSearch(results, capture);
    realSettingsModule.getSetting = stubGetSetting(0.8);
    try {
      // Act
      const out = await checkDuplicate('draft text', null);

      // Assert — fallback object was used: search ran once with the default limit,
      // and the above-threshold match came back (proving no swallowing catch).
      assert.equal(capture.calls, 1);
      assert.equal(capture.opts.limit, DEFAULT_DUPLICATE_LIMIT);
      assert.deepEqual(out, [{ plan: 'plans/x.md', similarity: 0.95 }]);
    } finally {
      realSearchModule.search = origSearch;
      realSettingsModule.getSetting = origGet;
    }
  });

  // ── line 97, FIRST operand: resolved `search` is not a function ────────────
  // Reachable ONLY via a broken real `./search` export: the injection ternary
  // keeps a non-function `opts.search` OUT (falls through to the real require),
  // so the real export must itself be non-function. This is the "store backend
  // is malformed/absent" degradation path — must return [], never crash.
  it('non-function real search export → [] (graceful degrade, never crashes)', async () => {
    // Arrange — break the real boundary; inject a valid getSetting so the guard
    // fails on `search`, not on `getSetting`.
    const orig = realSearchModule.search;
    realSearchModule.search = 'not-a-function';
    try {
      // Act — no opts.search, so it resolves the (broken) real export.
      const out = await checkDuplicate('draft text', { getSetting: stubGetSetting(0.85) });

      // Assert
      assert.deepEqual(out, []);
    } finally {
      realSearchModule.search = orig;
    }
  });

  // ── line 97, SECOND operand of `||`: resolved `getSetting` is not a function ─
  // search IS a function (injected), so the first operand is false and the
  // SECOND operand must be evaluated. Reachable only via a broken real
  // `../settings` export (the ternary rejects a non-function opts.getSetting).
  it('valid search but non-function real getSetting export → [] (pins the || second operand)', async () => {
    // Arrange
    const capture = {};
    const origGet = realSettingsModule.getSetting;
    realSettingsModule.getSetting = 42; // non-function
    try {
      // Act — inject a real function search; DO NOT inject getSetting.
      const search = stubSearch(
        [{ planPath: 'plans/y.md', sectionId: '__plan__', score: 0.99 }],
        capture
      );
      const out = await checkDuplicate('draft text', { search });

      // Assert — returns [] via the guard, and search was NEVER called
      // (the guard returns before the one async point).
      assert.deepEqual(out, []);
      assert.equal(capture.calls || 0, 0);
    } finally {
      realSettingsModule.getSetting = origGet;
    }
  });

  // ── line 107, SECOND operand `opts.limit > 0`: a 0 / negative limit rejected ─
  // `Number.isInteger(opts.limit)` is TRUE for 0 and -3, so the FIRST operand of
  // the && does not short-circuit; the SECOND operand decides. A mutant changing
  // `> 0` to `>= 0` would forward limit=0 to search — this pins it to the default.
  const nonPositiveLimits = [
    { id: 'zero', limit: 0 },
    { id: 'negative', limit: -3 }
  ];
  for (const row of nonPositiveLimits) {
    it(`limit ${row.id} (${row.limit}) is rejected → default limit forwarded to search`, async () => {
      // Arrange
      const capture = {};
      const search = stubSearch([], capture);

      // Act
      await checkDuplicate('draft text', {
        search,
        getSetting: stubGetSetting(0.85),
        limit: row.limit
      });

      // Assert — the boundary saw the DEFAULT, not the rejected value.
      assert.equal(capture.opts.limit, DEFAULT_DUPLICATE_LIMIT);
    });
  }

  // ── line 107, FIRST operand `Number.isInteger(opts.limit)`: fractional rejected ─
  // A mutant loosening the integer check would forward 2.7. Pins the default.
  it('fractional limit (2.7) is rejected → default limit forwarded to search', async () => {
    // Arrange
    const capture = {};
    const search = stubSearch([], capture);

    // Act
    await checkDuplicate('draft text', {
      search,
      getSetting: stubGetSetting(0.85),
      limit: 2.7
    });

    // Assert
    assert.equal(capture.opts.limit, DEFAULT_DUPLICATE_LIMIT);
  });

  // Positive contrast: a valid positive integer limit DOES pass the && and is
  // forwarded verbatim — proves the two tests above fail for the right reason
  // (rejection), not because the limit is ignored wholesale.
  it('valid positive integer limit (2) passes the && and is forwarded verbatim', async () => {
    // Arrange
    const capture = {};
    const search = stubSearch([], capture);

    // Act
    await checkDuplicate('draft text', {
      search,
      getSetting: stubGetSetting(0.85),
      limit: 2
    });

    // Assert
    assert.equal(capture.opts.limit, 2);
  });

  // ── line 123 filter, FIRST operand `r && …`: a falsy result element skipped ──
  // If a store returns a null / undefined element, the `r &&` guard must skip it
  // WITHOUT throwing (which would otherwise fail-open to [] and hide the real
  // above-threshold match). A mutant dropping `r &&` throws on `null.score` →
  // caught → [] → the valid match is LOST. This asserts the valid match survives.
  it('falsy result elements are skipped; the valid above-threshold match survives', async () => {
    // Arrange — store returns null/undefined noise alongside one real hit.
    const search = stubSearch([
      null,
      { planPath: 'plans/keep.md', sectionId: '__plan__', score: 0.9 },
      undefined
    ]);

    // Act
    const out = await checkDuplicate('draft text', {
      search,
      getSetting: stubGetSetting(0.85)
    });

    // Assert — exactly the real hit; the falsy elements did not crash the filter.
    assert.deepEqual(out, [{ plan: 'plans/keep.md', similarity: 0.9 }]);
  });

  // Sharper sort pin: three above-threshold hits arriving OUT of order must come
  // back strictly similarity-descending. A mutant flipping the comparator sign
  // (`b - a` → `a - b`) reverses this and reds the test.
  it('three unsorted above-threshold hits are returned strictly similarity-descending', async () => {
    // Arrange
    const search = stubSearch([
      { planPath: 'plans/mid.md', sectionId: '__plan__', score: 0.88 },
      { planPath: 'plans/low.md', sectionId: '__plan__', score: 0.86 },
      { planPath: 'plans/high.md', sectionId: '__plan__', score: 0.97 }
    ]);

    // Act
    const out = await checkDuplicate('draft text', {
      search,
      getSetting: stubGetSetting(0.85)
    });

    // Assert
    assert.deepEqual(out, [
      { plan: 'plans/high.md', similarity: 0.97 },
      { plan: 'plans/mid.md', similarity: 0.88 },
      { plan: 'plans/low.md', similarity: 0.86 }
    ]);
  });
});

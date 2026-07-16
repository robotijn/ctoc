'use strict';

/**
 * PI5-s1 — dark-branch coverage tests for `checkDuplicate`
 * (`src/lib/plan-index/duplicate-guard.js`), after the Option-B TRUE-COSINE fix.
 *
 * COMPLEMENT to tests/plan-index-duplicate-guard.test.js — that file pins the
 * cosine-threshold comparator, sort, empty-index, fail-open-on-throw, and bad-input
 * paths against a REAL store. This file targets the branches that file leaves DARK:
 *
 *   • `const opts = options || {}`            — the `{}` fallback (options === null)
 *   • getWiring dep-resolution `try/catch`    — a throwing getWiring degrades to {}
 *   • `getWiring(...) || {}`                   — getWiring returns a falsy wiring
 *   • getSetting guard                         — the resolved real getSetting is a non-function
 *   • empty/unavailable guard middle operand   — a truthy store with a non-number size
 *   • embedder function guard                  — a resolved non-function embedder → []
 *   • no-usable-query-vector guard             — embedder yields `{vectors:[]}` → []
 *   • `Number.isInteger(...) && … > 0` limit   — 0 / negative / fractional fall back
 *   • filter `r && …` FIRST operand            — a falsy result element is skipped
 *
 * Every test is failure-first: the assertion goes RED if the pinned branch is
 * mutated (guard removed, `>` → `>=`, `||` → `&&`, `r &&` dropped, `|| {}` dropped).
 *
 * Doubles are fakes at the TRUE boundary: an injected `store`/`embedder`/`getSetting`,
 * and — only where a branch cannot be reached any other way — the real `./wiring` /
 * `../settings` module swapped in `require.cache` and restored in `finally`. No core
 * cosine/threshold logic is mocked; the real limit/filter/sort decisions run.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { checkDuplicate, DEFAULT_DUPLICATE_LIMIT } = require('../src/lib/plan-index/duplicate-guard');
// Same absolute paths duplicate-guard lazy-requires → same require.cache objects.
const WIRING_PATH = require.resolve('../src/lib/plan-index/wiring');
const realSettingsModule = require('../src/lib/settings');

const AXIS_X = [1, 0, 0, 0, 0, 0, 0, 0];

/** A minimal in-memory store exposing exactly the surface checkDuplicate touches. */
function fakeStore(hits, { size = 1, capture } = {}) {
  const store = {
    search(qVec, k, o) {
      if (capture) { capture.calls = (capture.calls || 0) + 1; capture.k = k; capture.opts = o; }
      if (typeof hits === 'function') return hits(qVec, k, o);
      return hits;
    },
  };
  Object.defineProperty(store, 'size', { get: () => size });
  return store;
}

/** Stub embedder: records calls; returns one AXIS_X query vector (or a custom shape). */
function fakeEmbedder(shape) {
  const calls = [];
  const embedder = async (texts) => {
    calls.push(texts);
    if (typeof shape === 'function') return shape(texts);
    return shape || { vectors: [Float32Array.from(AXIS_X)], source: 'stub' };
  };
  embedder.calls = calls;
  return embedder;
}

function stubGetSetting(value) {
  return () => value;
}

/** Swap the ./wiring module's exports in require.cache; restore after fn resolves. */
async function withFakeWiring(getWiring, fn) {
  const prev = require.cache[WIRING_PATH];
  require.cache[WIRING_PATH] = {
    id: WIRING_PATH, filename: WIRING_PATH, loaded: true, exports: { getWiring }, children: [], paths: [],
  };
  try {
    return await fn();
  } finally {
    if (prev) require.cache[WIRING_PATH] = prev;
    else delete require.cache[WIRING_PATH];
  }
}

describe('duplicate-guard checkDuplicate — dark branches (Option B)', () => {
  // ── `const opts = options || {}` — the `{}` fallback (options === null) ──────
  // The default param `options = {}` only fires for `undefined`; passing `null`
  // reaches the runtime `|| {}`. A mutant dropping `|| {}` throws on `null.store`
  // → caught → still []. So we ALSO assert the above-threshold cosine match comes
  // back, proving the fallback object was used (not swallowed by the catch).
  it('null options reaches the `|| {}` fallback and still runs the cosine match', async () => {
    const store = fakeStore([{ planPath: 'plans/x.md', sectionId: '__plan__', score: 1.0 }]);
    const embedder = fakeEmbedder();
    // No store/embedder in options (it's null) → resolved via the (faked) wiring.
    await withFakeWiring(() => ({ store, embedder }), async () => {
      const origGet = realSettingsModule.getSetting;
      realSettingsModule.getSetting = stubGetSetting(0.85);
      try {
        const out = await checkDuplicate('draft text', null);
        assert.deepEqual(out, [{ plan: 'plans/x.md', similarity: 1.0 }]);
      } finally {
        realSettingsModule.getSetting = origGet;
      }
    });
  });

  // ── getWiring dep-resolution catch: a throwing getWiring degrades to {} → [] ──
  it('a throwing getWiring is caught → no store → [] (fail-open dep resolution)', async () => {
    await withFakeWiring(() => { throw new Error('wiring boom'); }, async () => {
      const out = await checkDuplicate('draft text', { getSetting: stubGetSetting(0.85) });
      assert.deepEqual(out, []);
    });
  });

  // ── `getWiring(...) || {}`: a falsy wiring falls to {} → store undefined → [] ──
  it('a falsy wiring is replaced by {} → no store → [] (pins the `|| {}` operand)', async () => {
    await withFakeWiring(() => null, async () => {
      const out = await checkDuplicate('draft text', { getSetting: stubGetSetting(0.85) });
      assert.deepEqual(out, []);
    });
  });

  // ── getSetting guard: the resolved REAL getSetting is a non-function → [] ─────
  // Reachable only via a broken real `../settings` export (no getSetting injected,
  // store+embedder injected so the wiring block is skipped).
  it('non-function real getSetting export → [] (graceful degrade, never crashes)', async () => {
    const origGet = realSettingsModule.getSetting;
    realSettingsModule.getSetting = 'not-a-function';
    try {
      const store = fakeStore([{ planPath: 'plans/y.md', sectionId: '__plan__', score: 0.99 }]);
      const out = await checkDuplicate('draft text', { store, embedder: fakeEmbedder() });
      assert.deepEqual(out, []);
    } finally {
      realSettingsModule.getSetting = origGet;
    }
  });

  // ── empty/unavailable guard, MIDDLE operand: truthy store, non-number size → [] ─
  it('a truthy store with a NON-number size → [] (pins the `typeof size !== number` operand)', async () => {
    const capture = {};
    const store = fakeStore([{ planPath: 'plans/z.md', sectionId: '__plan__', score: 1.0 }], { size: 'lots', capture });
    const embedder = fakeEmbedder();
    const out = await checkDuplicate('draft text', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(capture.calls || 0, 0, 'store.search never runs when the size guard trips');
    assert.equal(embedder.calls.length, 0, 'no embed on the empty/unavailable guard');
  });

  // ── embedder function guard: a resolved non-function embedder → [] ────────────
  it('a non-function injected embedder → [] (pins the embedder function guard)', async () => {
    const store = fakeStore([{ planPath: 'plans/z.md', sectionId: '__plan__', score: 1.0 }]);
    const out = await checkDuplicate('draft text', {
      store,
      embedder: 'not-a-function',
      getSetting: stubGetSetting(0.85),
    });
    assert.deepEqual(out, []);
  });

  // ── no-usable-query-vector guard: embedder yields `{vectors:[]}` → [] ─────────
  it('embedder returning `{vectors:[]}` → [] (no usable query vector)', async () => {
    const capture = {};
    const store = fakeStore([{ planPath: 'plans/z.md', sectionId: '__plan__', score: 1.0 }], { capture });
    const embedder = fakeEmbedder({ vectors: [], source: 'stub' });
    const out = await checkDuplicate('draft text', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
    assert.equal(capture.calls || 0, 0, 'store.search never runs without a query vector');
  });

  it('embedder returning a non-Float32Array vector → [] (qVec instanceof guard)', async () => {
    const store = fakeStore([{ planPath: 'plans/z.md', sectionId: '__plan__', score: 1.0 }]);
    const embedder = fakeEmbedder({ vectors: [[1, 0, 0, 0, 0, 0, 0, 0]], source: 'stub' }); // plain array
    const out = await checkDuplicate('draft text', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, []);
  });

  // ── limit `Number.isInteger(opts.limit) && opts.limit > 0` — invalid → default ─
  const nonPositiveLimits = [
    { id: 'zero', limit: 0 },
    { id: 'negative', limit: -3 },
    { id: 'fractional', limit: 2.7 },
  ];
  for (const row of nonPositiveLimits) {
    it(`limit ${row.id} (${row.limit}) is rejected → default limit forwarded to store.search`, async () => {
      const capture = {};
      const store = fakeStore([], { capture });
      const embedder = fakeEmbedder();
      await checkDuplicate('draft text', { store, embedder, getSetting: stubGetSetting(0.85), limit: row.limit });
      assert.equal(capture.k, DEFAULT_DUPLICATE_LIMIT);
    });
  }

  it('valid positive integer limit (2) passes the && and is forwarded verbatim', async () => {
    const capture = {};
    const store = fakeStore([], { capture });
    const embedder = fakeEmbedder();
    await checkDuplicate('draft text', { store, embedder, getSetting: stubGetSetting(0.85), limit: 2 });
    assert.equal(capture.k, 2);
  });

  // ── filter `r && …` FIRST operand: a falsy result element is skipped ─────────
  // A mutant dropping `r &&` throws on `null.score` → caught → [] → the valid
  // match is LOST. This asserts the valid above-threshold match survives the noise.
  it('falsy result elements are skipped; the valid above-threshold match survives', async () => {
    const store = fakeStore([
      null,
      { planPath: 'plans/keep.md', sectionId: '__plan__', score: 0.9 },
      undefined,
    ]);
    const embedder = fakeEmbedder();
    const out = await checkDuplicate('draft text', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, [{ plan: 'plans/keep.md', similarity: 0.9 }]);
  });

  // Sharper sort pin: three above-threshold hits arriving OUT of order must come
  // back strictly similarity-descending. A mutant flipping the comparator reds this.
  it('three unsorted above-threshold hits are returned strictly similarity-descending', async () => {
    const store = fakeStore([
      { planPath: 'plans/mid.md', sectionId: '__plan__', score: 0.88 },
      { planPath: 'plans/low.md', sectionId: '__plan__', score: 0.86 },
      { planPath: 'plans/high.md', sectionId: '__plan__', score: 0.97 },
    ]);
    const embedder = fakeEmbedder();
    const out = await checkDuplicate('draft text', { store, embedder, getSetting: stubGetSetting(0.85) });
    assert.deepEqual(out, [
      { plan: 'plans/high.md', similarity: 0.97 },
      { plan: 'plans/mid.md', similarity: 0.88 },
      { plan: 'plans/low.md', similarity: 0.86 },
    ]);
  });
});

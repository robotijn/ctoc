/**
 * Tests for src/lib/cache.js — TTL memoization for menu/dashboard hot paths.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { memoize, invalidate, _debug, DEFAULT_TTL_MS } = require('../src/lib/cache');

describe('memoize', () => {
  it('caches the result of an expensive function', () => {
    let calls = 0;
    const expensive = (n) => { calls += 1; return n * 2; };
    const cached = memoize(expensive, 'expensive');
    assert.equal(cached(5), 10);
    assert.equal(cached(5), 10);
    assert.equal(cached(5), 10);
    assert.equal(calls, 1, 'underlying function called once');
  });

  it('differentiates on different args', () => {
    let calls = 0;
    const fn = (a, b) => { calls += 1; return a + b; };
    const cached = memoize(fn, 'sum');
    cached(1, 2);
    cached(1, 3);
    cached(1, 2);
    assert.equal(calls, 2, 'two distinct arg signatures, two calls');
  });

  it('respects TTL — entry expires', async () => {
    let calls = 0;
    const fn = () => { calls += 1; return 'x'; };
    const cached = memoize(fn, 'ttl-test', 50);
    cached();
    cached();
    assert.equal(calls, 1);
    await new Promise(r => setTimeout(r, 80));
    cached();
    assert.equal(calls, 2, 'after TTL elapsed, function re-runs');
  });

  it('handles undefined and null args without throwing', () => {
    const fn = (a) => a === undefined ? 'undef' : String(a);
    const cached = memoize(fn, 'nullable');
    assert.equal(cached(undefined), 'undef');
    assert.equal(cached(null), 'null');
    assert.equal(cached('str'), 'str');
  });

  it('invalidate() clears specific prefix', () => {
    let aCalls = 0, bCalls = 0;
    const a = memoize(() => { aCalls += 1; return 'a'; }, 'fn-a');
    const b = memoize(() => { bCalls += 1; return 'b'; }, 'fn-b');
    a(); b(); a(); b();
    assert.equal(aCalls, 1);
    assert.equal(bCalls, 1);
    invalidate('fn-a');
    a(); b();
    assert.equal(aCalls, 2, 'fn-a recomputed after invalidate');
    assert.equal(bCalls, 1, 'fn-b stayed cached');
  });

  it('invalidate() with no arg clears everything', () => {
    const fn = memoize(() => Math.random(), 'rand');
    const v1 = fn();
    invalidate();
    const v2 = fn();
    assert.notEqual(v1, v2, 'full invalidate forces recomputation');
  });

  it('DEFAULT_TTL_MS is exported and reasonable', () => {
    assert.equal(typeof DEFAULT_TTL_MS, 'number');
    assert.ok(DEFAULT_TTL_MS >= 1000 && DEFAULT_TTL_MS <= 30000, 'TTL between 1s and 30s');
  });

  it('_debug exposes cache size', () => {
    invalidate();
    const fn = memoize((x) => x, 'debug-test');
    fn(1); fn(2); fn(3);
    const dbg = _debug();
    assert.ok(dbg.size >= 3);
    assert.ok(dbg.keys.some(k => k.startsWith('debug-test::')));
  });
});

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

  it('does not collide distinct arg signatures that join to the same string', () => {
    // ['a','b'] and ['a|b'] both naively join to 'a|b' — they must stay distinct.
    let calls = 0;
    const fn = (...args) => { calls += 1; return args.join('#'); };
    const cached = memoize(fn, 'collide-join');
    const r1 = cached('a', 'b'); // signature: two args
    const r2 = cached('a|b');    // signature: one arg — genuinely different
    assert.equal(calls, 2, 'two distinct signatures must invoke the fn twice');
    assert.notEqual(r1, r2, 'distinct signatures must return distinct values');
    assert.equal(r1, 'a#b');
    assert.equal(r2, 'a|b');
  });

  it('does not collide null with the string "null" (type ambiguity)', () => {
    let calls = 0;
    const fn = (a) => { calls += 1; return a; };
    const cached = memoize(fn, 'collide-nulltype');
    const r1 = cached(null);
    const r2 = cached('null');
    assert.equal(calls, 2, 'null and "null" are distinct signatures');
    assert.equal(r1, null);
    assert.equal(r2, 'null');
  });

  it('does not collide the number 5 with the string "5" (type ambiguity)', () => {
    let calls = 0;
    const fn = (a) => { calls += 1; return typeof a; };
    const cached = memoize(fn, 'collide-numtype');
    const r1 = cached(5);
    const r2 = cached('5');
    assert.equal(calls, 2, '5 and "5" are distinct signatures');
    assert.equal(r1, 'number');
    assert.equal(r2, 'string');
  });

  it('keeps undefined and null as distinct signatures', () => {
    let calls = 0;
    const fn = (a) => { calls += 1; return a === undefined ? 'U' : (a === null ? 'N' : 'V'); };
    const cached = memoize(fn, 'collide-undefnull');
    const r1 = cached(undefined);
    const r2 = cached(null);
    assert.equal(calls, 2, 'undefined and null are distinct signatures');
    assert.equal(r1, 'U');
    assert.equal(r2, 'N');
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

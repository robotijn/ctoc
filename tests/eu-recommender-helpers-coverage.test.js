/**
 * Dark-branch coverage for the EU-solution-recommender rule core
 * (`src/lib/eu-recommender-helpers.js`).
 *
 * The sibling suite `tests/eu-recommender-helpers.test.js` exercises the pure
 * rule functions and the SYNCHRONOUS success / synchronous real-`fs`-error path
 * of `createFetcher`. It never crosses the module's async fail-soft branch
 * (`normalizeCall` lines 224–228, the only lines the baseline reports uncovered)
 * and never injects a boundary call that yields a NON-`Error` failure value — so
 * the SECOND operand of both `error instanceof Error ? error : new Error(...)`
 * ternaries (the async one on line 226 and the sync one on line 231) stays dark.
 *
 * This suite targets exactly those branches. The web boundary is the injected
 * `webSearchFn` / `webFetchFn` — a genuine seam, not core logic — so injecting
 * an async function (real `fs.promises` I/O against a real temp fixture), or one
 * that rejects/throws a non-`Error`, or one that returns a thenable-guard edge
 * value, is a boundary fake, never a mock of the module under test. Every test
 * pins a branch that goes RED under mutation of the production line it targets.
 *
 * House style follows `tests/eu-recommender-helpers.test.js`.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateOutputSchema,
  createFetcher,
} = require('../src/lib/eu-recommender-helpers');

// ─────────────────────────────────────────────────────────────────────
// Real, self-contained on-disk fixture for the async REAL-I/O cases.
// Created in `before`, removed in `after` — nothing leaks between runs and
// this suite depends on no sibling's fixtures.
// ─────────────────────────────────────────────────────────────────────

let tmpDir;
let goodFixturePath;

/** A schema-valid hosted option persisted to disk for the async read to parse. */
const REAL_HOSTED_RECORD = Object.freeze({
  bucket: 'hosted',
  name: 'Async EU Cloud',
  source_url: 'https://async.example.eu/pricing',
  retrieved_date: '2026-07-08',
  price: '€49/month, list price, retrieved 2026-07-08',
  quality_rank: 1,
  region: 'eu-west-3',
  verified_source: 'https://async.example.eu/dpa',
  verified_date: '2026-07-08',
  unverified_this_run: false,
});

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-recommender-async-'));
  goodFixturePath = path.join(tmpDir, 'async-hosted.json');
  fs.writeFileSync(goodFixturePath, JSON.stringify(REAL_HOSTED_RECORD), 'utf8');
});

after(() => {
  // Real cleanup of the real fixture directory.
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────
// normalizeCall — the ASYNC fail-soft branch (production lines 224–228).
// A returned thenable must be chained so the resolved / rejected outcome is
// normalized to { ok, ... }, never left as a raw Promise and never allowed to
// propagate as an unhandled rejection.
// ─────────────────────────────────────────────────────────────────────

describe('createFetcher — async (thenable) fail-soft branch', () => {
  it('awaits a resolved REAL-I/O promise and unwraps the data (not the Promise)', async () => {
    // Arrange — inject a REAL async read of the REAL temp fixture off disk.
    const fetcher = createFetcher(
      (query) => Promise.resolve([{ bucket: 'hosted', query }]),
      (p) => fs.promises.readFile(p, 'utf8').then((s) => JSON.parse(s)),
    );

    // Act — fetch returns the chained Promise from normalizeCall.
    const result = await fetcher.fetch(goodFixturePath);

    // Assert — the awaited value is the PARSED record, proving the thenable was
    // chained and data unwrapped. Under a mutant that drops the `.then` branch,
    // r.data would be the raw Promise object and r.data.bucket would be
    // undefined → RED.
    assert.equal(result.ok, true);
    assert.equal(result.data.bucket, 'hosted');
    assert.equal(result.data.name, 'Async EU Cloud');
    assert.doesNotThrow(() => validateOutputSchema(result.data));
  });

  it('normalizes a rejected REAL-I/O promise to { ok:false } and preserves the real Error instance', async () => {
    // Arrange — inject a REAL async read of a path that does not exist; the
    // rejection is a genuine async ENOENT, an Error instance.
    const missing = path.join(tmpDir, 'no-such-async-fixture.json');
    const fetcher = createFetcher(
      () => Promise.resolve([]),
      (p) => fs.promises.readFile(p, 'utf8').then((s) => JSON.parse(s)),
    );

    // Act
    let result;
    await assert.doesNotReject(async () => { result = await fetcher.fetch(missing); });

    // Assert — the SAME real Error is preserved (first operand of line-226
    // ternary). Under a mutant that always re-wraps, `code` would be lost → RED.
    assert.equal(result.ok, false);
    assert.ok(result.error instanceof Error);
    assert.equal(result.error.code, 'ENOENT', 'must be the real async ENOENT, preserved unchanged');
  });

  it('wraps a promise rejected with a NON-Error reason in a real Error carrying its stringified text', async () => {
    // Arrange — the injected boundary rejects with a bare string (a badly-behaved
    // tool handle). This is the ONLY way to reach the SECOND operand of the
    // line-226 ternary: `: new Error(String(error))`.
    const fetcher = createFetcher(
      () => Promise.reject('search backend returned status 503'),
      () => Promise.resolve({}),
    );

    // Act
    const result = await fetcher.search('eu hosting');

    // Assert — a string reason becomes a real Error whose message is the string.
    // Under a mutant that returns the raw reason (drops the wrap), `error` would
    // be the string and `instanceof Error` would be false → RED.
    assert.equal(result.ok, false);
    assert.ok(result.error instanceof Error, 'non-Error reason must be wrapped into an Error');
    assert.equal(result.error.message, 'search backend returned status 503');
  });

  it('preserves the exact Error subtype when a promise rejects with a typed Error', async () => {
    // Arrange — reject with a RangeError so the first operand (`? error`) is
    // distinguishable from the wrap branch: the wrap would produce a plain Error
    // whose message is the STRINGIFIED RangeError, not a RangeError instance.
    const boom = new RangeError('async boundary blew up');
    const fetcher = createFetcher(
      () => Promise.resolve([]),
      () => Promise.reject(boom),
    );

    // Act
    const result = await fetcher.fetch('https://eu.example/thing');

    // Assert — the identity and subtype survive. A mutant re-wrapping every
    // rejection would yield a plain Error (not RangeError) with message
    // "RangeError: async boundary blew up" → RED on either assertion.
    assert.equal(result.ok, false);
    assert.equal(result.error, boom, 'the original Error instance is passed through, not re-wrapped');
    assert.ok(result.error instanceof RangeError);
  });
});

// ─────────────────────────────────────────────────────────────────────
// normalizeCall — the SYNCHRONOUS catch ternary SECOND operand (line 231).
// The sibling suite only throws real fs/JSON Error instances (first operand);
// a synchronous NON-Error throw exercises `new Error(String(error))`.
// ─────────────────────────────────────────────────────────────────────

describe('createFetcher — synchronous non-Error throw is wrapped fail-soft', () => {
  const rows = [
    { id: 'string-throw', thrown: 'sync string failure', expected: 'sync string failure' },
    { id: 'number-throw', thrown: 42, expected: '42' },
    { id: 'null-throw', thrown: null, expected: 'null' },
  ];

  for (const { id, thrown, expected } of rows) {
    it(`wraps a synchronously-thrown non-Error (${id}) into a real Error with its stringified text`, () => {
      // Arrange — a boundary handle that throws a non-Error synchronously.
      const fetcher = createFetcher(
        () => { throw thrown; },
        () => { throw thrown; },
      );

      // Act — must NOT propagate; fail-soft catch converts it.
      let result;
      assert.doesNotThrow(() => { result = fetcher.search('q'); });

      // Assert — wrapped into a real Error whose message is String(thrown).
      // Under a mutant that returns the raw thrown value, `instanceof Error`
      // is false → RED.
      assert.equal(result.ok, false);
      assert.ok(result.error instanceof Error, `non-Error throw (${id}) must be wrapped`);
      assert.equal(result.error.message, expected);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// normalizeCall — the thenable-GUARD operands on line 223:
//   result !== null && typeof result === 'object' && typeof result.then === 'function'
// Each operand must be pinned: a non-function `then`, and a null result, must
// both be treated as synchronous DATA, never chained.
// ─────────────────────────────────────────────────────────────────────

describe('createFetcher — thenable guard treats non-thenables as sync data', () => {
  it('returns an object whose `then` is NOT a function as plain data (does not attempt to call it)', () => {
    // Arrange — a data record that happens to carry a non-callable `then` key.
    // Only `typeof result.then === 'function'` keeps this out of the chain.
    const record = { then: 'i am a string, not callable', payload: 7 };
    const fetcher = createFetcher(
      () => record,
      () => record,
    );

    // Act
    const result = fetcher.fetch('https://eu.example/x');

    // Assert — surfaced as sync success data untouched. Under a mutant that
    // weakens the guard to a truthiness check (`result.then`), the truthy string
    // would be invoked as a function → TypeError → caught → ok:false → RED.
    assert.equal(result.ok, true);
    assert.equal(result.data.payload, 7);
    assert.equal(result.data.then, 'i am a string, not callable');
  });

  it('returns a null boundary result as { ok:true, data:null } without dereferencing it', () => {
    // Arrange — a boundary that legitimately returns null (e.g. no record found).
    // Only the `result !== null` operand stops `null.then` from throwing.
    const fetcher = createFetcher(
      () => null,
      () => null,
    );

    // Act
    const result = fetcher.search('nothing matched');

    // Assert — null is valid sync data. Under a mutant dropping the
    // `result !== null` guard, `typeof null === 'object'` passes and `null.then`
    // throws a TypeError → caught → ok:false → RED.
    assert.equal(result.ok, true);
    assert.equal(result.data, null);
  });

  it('returns a primitive (non-object) boundary result as sync data', () => {
    // Arrange — a primitive can never be a thenable; the `typeof === 'object'`
    // operand must route it to the sync-data return.
    const fetcher = createFetcher(
      () => 'raw text result',
      () => 123,
    );

    // Act
    const searchResult = fetcher.search('q');
    const fetchResult = fetcher.fetch('u');

    // Assert — primitives pass straight through as data.
    assert.equal(searchResult.ok, true);
    assert.equal(searchResult.data, 'raw text result');
    assert.equal(fetchResult.ok, true);
    assert.equal(fetchResult.data, 123);
  });
});

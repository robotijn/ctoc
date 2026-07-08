/**
 * Tests for the EU-solution-recommender deterministic rule core (EC4-s1).
 *
 * Pure in-memory inputs plus a hand-written STUB fetcher injected into
 * `createFetcher` — NO live network, NO tmp project. Maps the parent CAPTURE
 * scenarios 1:1 onto this module's surface. House style matches
 * `tests/eu-ai-act-helpers.test.js`.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  CANONICAL_SCHEMA_KEYS,
  VALID_BUCKETS,
  EVALUATIVE_PRICE_PATTERNS,
  validateOutputSchema,
  validatePriceString,
  checkMonotonicity,
  createFetcher,
  applyFallback,
} = require('../src/lib/eu-recommender-helpers');

// ─────────────────────────────────────────────────────────────────────
// Fixtures — a fully-populated canonical option (all 10 keys present).
// ─────────────────────────────────────────────────────────────────────

/** A valid `hosted` option carrying every canonical key. */
function hostedOption(overrides = {}) {
  return {
    bucket: 'hosted',
    name: 'Example EU Cloud',
    source_url: 'https://example.eu/pricing',
    retrieved_date: '2026-07-08',
    price: '€29/month, list price, retrieved 2026-07-08',
    quality_rank: 1,
    region: 'eu-central-1',
    verified_source: 'https://example.eu/dpa',
    verified_date: '2026-07-08',
    unverified_this_run: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Frozen constants
// ─────────────────────────────────────────────────────────────────────

describe('frozen constants', () => {
  it('CANONICAL_SCHEMA_KEYS is a frozen Set of exactly the 10 locked keys', () => {
    assert.ok(CANONICAL_SCHEMA_KEYS instanceof Set);
    assert.equal(CANONICAL_SCHEMA_KEYS.size, 10);
    for (const k of [
      'bucket', 'name', 'source_url', 'retrieved_date', 'price',
      'quality_rank', 'region', 'verified_source', 'verified_date',
      'unverified_this_run',
    ]) {
      assert.ok(CANONICAL_SCHEMA_KEYS.has(k), `missing canonical key ${k}`);
    }
    assert.ok(Object.isFrozen(CANONICAL_SCHEMA_KEYS));
  });

  it('VALID_BUCKETS is a frozen Set: hosted, self_hosted, library', () => {
    assert.ok(VALID_BUCKETS instanceof Set);
    assert.equal(VALID_BUCKETS.size, 3);
    assert.ok(VALID_BUCKETS.has('hosted'));
    assert.ok(VALID_BUCKETS.has('self_hosted'));
    assert.ok(VALID_BUCKETS.has('library'));
    assert.ok(Object.isFrozen(VALID_BUCKETS));
  });

  it('EVALUATIVE_PRICE_PATTERNS is a frozen array of RegExp', () => {
    assert.ok(Array.isArray(EVALUATIVE_PRICE_PATTERNS));
    assert.ok(Object.isFrozen(EVALUATIVE_PRICE_PATTERNS));
    assert.equal(EVALUATIVE_PRICE_PATTERNS.length, 5);
    for (const re of EVALUATIVE_PRICE_PATTERNS) {
      assert.ok(re instanceof RegExp);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 1–5. validateOutputSchema
// ─────────────────────────────────────────────────────────────────────

describe('validateOutputSchema', () => {
  it('1. accepts a fully-populated hosted option unchanged', () => {
    const opt = hostedOption();
    assert.equal(validateOutputSchema(opt), opt);
  });

  it('1b. accepts a non-hosted option with region:null', () => {
    const opt = hostedOption({ bucket: 'library', region: null });
    assert.equal(validateOutputSchema(opt), opt);
  });

  it('2. rejects an unknown key and names it (selected → reject)', () => {
    const opt = { ...hostedOption(), selected: true };
    assert.throws(
      () => validateOutputSchema(opt),
      /unknown key "selected"/,
    );
  });

  it('3. rejects a missing canonical key and names it (quality_rank)', () => {
    const opt = hostedOption();
    delete opt.quality_rank;
    assert.throws(
      () => validateOutputSchema(opt),
      /missing required key "quality_rank"/,
    );
  });

  it('4. hosted option with region:null throws (hosted requires region)', () => {
    const opt = hostedOption({ bucket: 'hosted', region: null });
    assert.throws(
      () => validateOutputSchema(opt),
      /hosted option requires region/,
    );
  });

  it('4b. hosted option with empty-string region throws', () => {
    const opt = hostedOption({ bucket: 'hosted', region: '' });
    assert.throws(
      () => validateOutputSchema(opt),
      /hosted option requires region/,
    );
  });

  it('4c. same option as library with region:null passes', () => {
    const opt = hostedOption({ bucket: 'library', region: null });
    assert.equal(validateOutputSchema(opt), opt);
  });

  it('5. verified_source without verified_date throws naming the partner', () => {
    const opt = hostedOption({ verified_source: 'https://x.eu/dpa', verified_date: null });
    assert.throws(
      () => validateOutputSchema(opt),
      /verified_date/,
    );
  });

  it('5b. verified_date without verified_source throws naming the partner', () => {
    const opt = hostedOption({ verified_source: null, verified_date: '2026-07-08' });
    assert.throws(
      () => validateOutputSchema(opt),
      /verified_source/,
    );
  });

  it('5c. both verified fields null passes (unverified option)', () => {
    const opt = hostedOption({ verified_source: null, verified_date: null });
    assert.equal(validateOutputSchema(opt), opt);
  });

  it('rejects an invalid bucket value', () => {
    const opt = hostedOption({ bucket: 'made_up' });
    assert.throws(() => validateOutputSchema(opt), /bucket/);
  });

  it('non-object / null input throws TypeError', () => {
    assert.throws(() => validateOutputSchema(null), TypeError);
    assert.throws(() => validateOutputSchema('nope'), TypeError);
    assert.throws(() => validateOutputSchema(42), TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6–8. validatePriceString
// ─────────────────────────────────────────────────────────────────────

describe('validatePriceString', () => {
  it('6. accepts factual price strings unchanged', () => {
    const factual = [
      '€29/month, list price, retrieved 2026-07-08',
      'pricing on request (retrieved 2026-07-08)',
      'open-source / no license fee — self-hosting/infra cost applies',
    ];
    for (const p of factual) {
      assert.equal(validatePriceString(p), p);
    }
  });

  it('7. rejects each evaluative pattern (case-insensitive) and names it', () => {
    const cases = [
      { price: 'very affordable at €10', word: 'affordable' },
      { price: 'kind of EXPENSIVE really', word: 'expensive' },
      { price: 'totally worth it for the money', word: 'worth it' },
      { price: 'Competitive pricing here', word: 'competitive' },
      { price: 'a reasonable price', word: 'reasonable' },
    ];
    for (const { price, word } of cases) {
      assert.throws(
        () => validatePriceString(price),
        new RegExp(`rejected evaluative pattern`),
        `expected ${price} to be rejected`,
      );
      // The message names the matched pattern.
      let msg = '';
      try { validatePriceString(price); } catch (e) { msg = e.message; }
      assert.ok(msg.toLowerCase().includes(word), `message should name "${word}": ${msg}`);
    }
  });

  it('8. non-string / empty input throws', () => {
    assert.throws(() => validatePriceString(''), /non-empty string/);
    assert.throws(() => validatePriceString(null), /non-empty string/);
    assert.throws(() => validatePriceString(42), /non-empty string/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 9–12. checkMonotonicity
// ─────────────────────────────────────────────────────────────────────

describe('checkMonotonicity', () => {
  it('9. accepts strictly-increasing unique ranks', () => {
    assert.equal(
      checkMonotonicity([{ quality_rank: 1 }, { quality_rank: 2 }, { quality_rank: 3 }]),
      true,
    );
  });

  it('10. rejects a decrease and names the offending index', () => {
    assert.throws(
      () => checkMonotonicity([{ quality_rank: 1 }, { quality_rank: 3 }, { quality_rank: 2 }]),
      /not monotonic at index 2/,
    );
  });

  it('11. rejects a duplicate rank and names it', () => {
    assert.throws(
      () => checkMonotonicity([{ quality_rank: 1 }, { quality_rank: 1 }]),
      /duplicate quality_rank 1/,
    );
  });

  it('12. empty array and single-entry array are vacuously monotonic', () => {
    assert.equal(checkMonotonicity([]), true);
    assert.equal(checkMonotonicity([{ quality_rank: 7 }]), true);
  });

  it('12b. non-array input throws TypeError', () => {
    assert.throws(() => checkMonotonicity(null), TypeError);
    assert.throws(() => checkMonotonicity('nope'), TypeError);
  });

  it('12c. non-positive-integer quality_rank throws', () => {
    assert.throws(() => checkMonotonicity([{ quality_rank: 0 }]), /quality_rank/);
    assert.throws(() => checkMonotonicity([{ quality_rank: 1.5 }]), /quality_rank/);
    assert.throws(() => checkMonotonicity([{ quality_rank: -1 }]), /quality_rank/);
    assert.throws(() => checkMonotonicity([{ quality_rank: 'x' }]), /quality_rank/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 13–15. createFetcher — injectable web boundary, fail-soft.
// ─────────────────────────────────────────────────────────────────────

describe('createFetcher', () => {
  it('13. rejects non-function args with TypeError', () => {
    assert.throws(() => createFetcher(null, () => {}), TypeError);
    assert.throws(() => createFetcher(() => {}, null), TypeError);
    assert.throws(() => createFetcher('nope', 'nope'), TypeError);
  });

  it('14. delegates to injected fns and normalizes success (stub is SOLE boundary)', () => {
    const calls = { search: [], fetch: [] };
    const stubSearch = (q) => { calls.search.push(q); return ['result']; };
    const stubFetch = (url) => { calls.fetch.push(url); return { body: 'payload' }; };

    const fetcher = createFetcher(stubSearch, stubFetch);

    const r1 = fetcher.search('eu vector db');
    assert.deepEqual(r1, { ok: true, data: ['result'] });
    assert.deepEqual(calls.search, ['eu vector db']);

    const r2 = fetcher.fetch('https://example.eu/pricing');
    assert.deepEqual(r2, { ok: true, data: { body: 'payload' } });
    assert.deepEqual(calls.fetch, ['https://example.eu/pricing']);
  });

  it('15. fail-soft: injected throw becomes { ok:false, error }, no exception propagates', () => {
    const boom = () => { throw new Error('network down'); };
    const fetcher = createFetcher(boom, boom);

    let r;
    assert.doesNotThrow(() => { r = fetcher.fetch('https://example.eu'); });
    assert.equal(r.ok, false);
    assert.ok(r.error instanceof Error);
    assert.match(r.error.message, /network down/);

    let r2;
    assert.doesNotThrow(() => { r2 = fetcher.search('q'); });
    assert.equal(r2.ok, false);
    assert.ok(r2.error instanceof Error);
  });

  it('15b. fail-soft on a rejected async result (thenable)', async () => {
    const rejecter = () => Promise.reject(new Error('429 rate limited'));
    const fetcher = createFetcher(rejecter, rejecter);
    const r = await fetcher.fetch('https://example.eu');
    assert.equal(r.ok, false);
    assert.ok(r.error instanceof Error);
    assert.match(r.error.message, /429/);
  });

  it('15c. success on a resolved async result (thenable)', async () => {
    const resolver = () => Promise.resolve({ ok: 200 });
    const fetcher = createFetcher(resolver, resolver);
    const r = await fetcher.search('q');
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, { ok: 200 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 16–17. applyFallback — per-field unverified_this_run labelling.
// ─────────────────────────────────────────────────────────────────────

describe('applyFallback', () => {
  it('16. labels the named field, sets unverified_this_run, does not mutate input', () => {
    const input = { price: 'x', unverified_this_run: false };
    const figure = 'open-source / no license fee — self-hosting/infra cost applies';
    const out = applyFallback(input, figure, 'price');

    assert.equal(out.unverified_this_run, true);
    assert.equal(out.price, figure);
    // Input untouched (shallow copy).
    assert.equal(input.unverified_this_run, false);
    assert.equal(input.price, 'x');
    assert.notEqual(out, input);
  });

  it('16b. applies to an arbitrary named field (verified_date), per-field not global', () => {
    const input = { verified_date: null, price: '€1', unverified_this_run: false };
    const out = applyFallback(input, '2025-08-02', 'verified_date');
    assert.equal(out.verified_date, '2025-08-02');
    assert.equal(out.unverified_this_run, true);
    // Other fields carried over untouched.
    assert.equal(out.price, '€1');
  });

  it('17. defaults fieldName to "price" when omitted', () => {
    const out = applyFallback({ price: 'old', unverified_this_run: false }, 'new figure');
    assert.equal(out.price, 'new figure');
    assert.equal(out.unverified_this_run, true);
  });

  it('17b. non-object option throws TypeError', () => {
    assert.throws(() => applyFallback(null, 'x'), TypeError);
    assert.throws(() => applyFallback('nope', 'x'), TypeError);
  });
});

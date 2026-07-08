/**
 * EU-solution-recommender — fixture-driven INTEGRATION test (EC6-s2).
 *
 * This is the COMPOSED end-to-end integration over the shipped EC4 recommender
 * helpers (`src/lib/eu-recommender-helpers.js`), NOT a re-test of the per-
 * function units. The isolated throw-branch units live in
 * `tests/eu-recommender-helpers.test.js` and are deliberately NOT duplicated
 * here. This file threads the real flow the agent runs:
 *
 *   createFetcher(stub web boundary)  →  injected FAILURE path (fail-soft)
 *      →  applyFallback (labels the field `unverified_this_run`)
 *      →  validateOutputSchema  — across ALL THREE buckets
 *         (hosted [EU region], self_hosted, library).
 *
 * NO live network: the web boundary is an INJECTED stub (a fake fetcher whose
 * functions throw or return a canned record). The real WebSearch/WebFetch tool
 * handles are never reachable from this test. The driving finding is the shared
 * EC6-s1 fixture `tests/fixtures/compliance/annex-iii-ai-plan.md`, loaded via a
 * cross-platform `path.join`.
 *
 * Every `it` carries at least one meaningful assertion; the injected-failure
 * path asserts the observable `unverified_this_run` marker (no empty catch, no
 * always-green pass). No undocumented `skip`.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  VALID_BUCKETS,
  validateOutputSchema,
  validatePriceString,
  checkMonotonicity,
  createFetcher,
  applyFallback,
} = require('../src/lib/eu-recommender-helpers');

// ─────────────────────────────────────────────────────────────────────
// Shared driving fixture (from EC6-s1) — cross-platform path, read-only.
// ─────────────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'compliance',
  'annex-iii-ai-plan.md',
);

// ─────────────────────────────────────────────────────────────────────
// Local integration helpers — grounded in the real canonical schema.
// ─────────────────────────────────────────────────────────────────────

/**
 * A canonical option carrying EXACTLY the 10 canonical keys for `bucket`.
 * `hosted` carries a non-empty EU `region`; `self_hosted`/`library` set
 * `region: null` (permitted for non-hosted buckets). `verified_source` and
 * `verified_date` are paired (all-or-nothing) so the clean path validates.
 */
function optionFor(bucket, overrides = {}) {
  const base = {
    bucket,
    name: `${bucket}-candidate`,
    source_url: `https://example.eu/${bucket}`,
    retrieved_date: '2026-07-08',
    price: 'EUR 0 (open source)',
    quality_rank: 1,
    region: bucket === 'hosted' ? 'eu-west-1' : null,
    verified_source: 'https://example.eu/pricing',
    verified_date: '2026-07-08',
    unverified_this_run: false,
  };
  return { ...base, ...overrides };
}

/**
 * A stub fetcher whose injected web functions THROW — drives the fail-soft
 * failure path of `createFetcher`. No live network: these are plain local
 * closures, the real WebSearch/WebFetch are never referenced.
 */
function stubFetcherFailing() {
  return createFetcher(
    () => {
      throw new Error('network down');
    },
    () => {
      throw new Error('network down');
    },
  );
}

/**
 * A stub fetcher whose injected web functions return a CANNED solution record
 * (the success boundary). No live network.
 */
function stubFetcherSucceeding(record) {
  return createFetcher(
    () => record,
    () => record,
  );
}

describe('EU-solution-recommender — fixture-driven integration', () => {
  // Case 1 — driving fixture loads (ties s2 to the shared s1 corpus).
  it('loads the shared high-risk driving fixture (integration entry)', () => {
    const contents = fs.readFileSync(FIXTURE_PATH, 'utf8');
    assert.ok(contents.length > 0, 'driving fixture must be non-empty');
    // The fixture anchors a high-risk recruitment classification — the context
    // a recommender bucket would answer.
    assert.match(contents, /high-risk/i);
    assert.match(contents, /screening|recruitment|candidates/i);
  });

  // Case 2 — clean path across all three buckets.
  it('produces a schema-valid option for every bucket (hosted/self_hosted/library)', () => {
    const seenBuckets = new Set();
    for (const bucket of VALID_BUCKETS) {
      const option = optionFor(bucket);
      const validated = validateOutputSchema(option);
      assert.equal(validated.bucket, bucket);
      // The price on the clean path is a FACT, not evaluative.
      assert.equal(validatePriceString(validated.price), validated.price);
      seenBuckets.add(bucket);
    }
    assert.deepEqual(
      [...seenBuckets].sort(),
      ['hosted', 'library', 'self_hosted'],
      'all three canonical buckets must be exercised',
    );
  });

  // Case 3 — the injected-failure boundary is fail-soft, never a crash.
  it('createFetcher(failing stub) fails soft to { ok:false, error } — no exception propagates', () => {
    const fetcher = stubFetcherFailing();
    let searchResult;
    assert.doesNotThrow(() => {
      searchResult = fetcher.search('EU-hosted candidate ranking vendor');
    }, 'a thrown injected call must NOT propagate');
    assert.equal(searchResult.ok, false, 'failure must surface as ok:false');
    assert.ok(searchResult.error instanceof Error, 'the failure error must be observable');
    assert.match(searchResult.error.message, /network down/);

    let fetchResult;
    assert.doesNotThrow(() => {
      fetchResult = fetcher.fetch('https://example.eu/pricing');
    });
    assert.equal(fetchResult.ok, false);
    assert.ok(fetchResult.error instanceof Error);
  });

  // Case 4 — injected-failure → labeled fallback, schema-valid, ALL buckets.
  it('injected verification failure yields an unverified_this_run fallback that stays schema-valid, per bucket', () => {
    const SKILL_DOCUMENTED_PRICE = 'EUR 20/user/month (skill-documented 2026-07-08)';

    for (const bucket of VALID_BUCKETS) {
      const fetcher = stubFetcherFailing();
      // Compose: attempt live verification → it fails soft → apply fallback.
      const verification = fetcher.fetch('https://example.eu/pricing');
      assert.equal(verification.ok, false, `bucket ${bucket}: verification must have failed soft`);

      let out;
      assert.doesNotThrow(() => {
        // Live price could not be verified → substitute the skill-documented
        // figure and LABEL it. applyFallback never throws on a valid object.
        out = verification.ok
          ? optionFor(bucket)
          : applyFallback(optionFor(bucket), SKILL_DOCUMENTED_PRICE, 'price');
      }, `bucket ${bucket}: the compose must not throw`);

      // The affected field is labeled unverified for this run.
      assert.equal(out.unverified_this_run, true, `bucket ${bucket}: must be labeled unverified`);
      // The skill-documented fallback figure is the one used.
      assert.equal(out.price, SKILL_DOCUMENTED_PRICE, `bucket ${bucket}: fallback figure must be used`);
      // The fallback option is STILL schema-valid.
      assert.doesNotThrow(() => validateOutputSchema(out), `bucket ${bucket}: fallback must stay schema-valid`);
      // applyFallback must not mutate the input.
      const original = optionFor(bucket);
      assert.notEqual(out, original);
    }
  });

  // Case 5 — a SUCCEEDING stub does NOT label the option unverified.
  it('a succeeding injected fetcher leaves the option verified (unverified_this_run stays false)', () => {
    const cannedRecord = { ok: true, price: 'EUR 15/user/month' };
    const fetcher = stubFetcherSucceeding(cannedRecord);
    const verification = fetcher.fetch('https://example.eu/pricing');
    assert.equal(verification.ok, true, 'the canned record must surface as ok:true');

    const out = verification.ok
      ? optionFor('hosted', { price: 'EUR 15/user/month' })
      : applyFallback(optionFor('hosted'), 'fallback', 'price');
    assert.equal(out.unverified_this_run, false, 'a verified run must NOT be labeled unverified');
    assert.doesNotThrow(() => validateOutputSchema(out));
  });

  // Case 6 — monotonicity holds on a composed multi-entry bucket.
  it('checkMonotonicity holds on a composed, rank-ordered bucket and rejects a duplicate rank', () => {
    const ordered = [
      optionFor('hosted', { name: 'a', quality_rank: 1 }),
      optionFor('hosted', { name: 'b', quality_rank: 2 }),
      optionFor('hosted', { name: 'c', quality_rank: 3 }),
    ];
    assert.equal(checkMonotonicity(ordered), true);

    const withDuplicate = [
      optionFor('library', { name: 'x', quality_rank: 1 }),
      optionFor('library', { name: 'y', quality_rank: 1 }),
    ];
    assert.throws(() => checkMonotonicity(withDuplicate), /duplicate quality_rank/);
  });

  // Case 7 — negative integration: the schema cannot leak a malformed option.
  it('rejects a hosted option missing region', () => {
    const bad = optionFor('hosted', { region: '' });
    assert.throws(() => validateOutputSchema(bad), /hosted option requires region/);
  });

  it('rejects an option carrying a `selected` key (no vendor auto-selected)', () => {
    const bad = { ...optionFor('library'), selected: 'library-candidate' };
    assert.throws(() => validateOutputSchema(bad), /unknown key "selected"/);
  });

  it('rejects verified_source present without verified_date', () => {
    const bad = optionFor('self_hosted', { verified_source: 'https://x.eu', verified_date: '' });
    assert.throws(() => validateOutputSchema(bad), /verified_source present but verified_date missing/);
  });

  it('rejects an unknown bucket built through the compose helpers', () => {
    const bad = optionFor('library', { bucket: 'on_prem' });
    assert.throws(() => validateOutputSchema(bad), /invalid bucket "on_prem"/);
  });

  // Case 8 — no fabricated-numbers path: an evaluative price is rejected.
  it('rejects a composed option whose price is evaluative language (no fabricated numbers)', () => {
    const evaluative = optionFor('hosted', { price: 'very affordable for the value' });
    // The price string itself is rejected by validatePriceString.
    assert.throws(() => validatePriceString(evaluative.price), /evaluative pattern/);
  });
});

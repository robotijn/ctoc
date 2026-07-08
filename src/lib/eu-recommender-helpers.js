/**
 * EU-solution-recommender deterministic rule core (EC4-s1).
 *
 * The machine-checkable heart of the EU-solution-recommender agent. The agent
 * prompt (s2) references these functions by name and injects the real
 * `WebSearch`/`WebFetch` tool handles into `createFetcher`; the registry wiring
 * (s3) records the consuming agent. Everything the recommender's OUTPUT CONTRACT
 * requires that a linter / `node --test` can actually verify lives HERE.
 *
 * Load-bearing design decisions:
 *
 *  1. **The web boundary is INJECTED, never imported.** `createFetcher(wsFn, wfFn)`
 *     is a factory returning a fetcher that DELEGATES to two injected functions;
 *     it makes no web call of its own. The agent injects the real tool handles;
 *     tests inject controlled stubs. This is the whole reason the deterministic
 *     layer is unit-testable without a live network. The returned methods are
 *     **fail-soft**: a thrown/rejected/failed injected call becomes
 *     `{ ok:false, error }` — never a propagating exception — so the agent's
 *     fallback path (not a crash) handles a network failure.
 *
 *  2. **No fabricated price/date literal.** `validatePriceString` REJECTS
 *     evaluative language (price must be a fact); `validateOutputSchema` requires
 *     that a `verified_source` is always paired with a `verified_date` (no date is
 *     asserted without a source, and vice versa). No enforcement date or price is
 *     baked into this module body — figures flow in from the caller
 *     (`applyFallback(option, skillDocumentedFigure, fieldName)`).
 *
 * Four of the five exports are PURE (no I/O). `createFetcher`'s returned methods
 * only wrap injected calls. Dependency direction is lib → lib only; this module
 * imports NOTHING (no gate, no `compliance-regime.js`, no sibling helper) — it
 * stays independently testable, matching `eu-ai-act-helpers.js`.
 *
 * Cross-platform: no fs, no paths, no OS-specific behaviour — pure by
 * construction. No dynamic RegExp is ever built from input (no ReDoS); every
 * price pattern is a STATIC, word-bounded, linear-time literal.
 */

'use strict';

/**
 * The EXACTLY-ten locked snake_case top-level keys of a recommender option.
 * Frozen: no untrusted key ever lands here. A `selected` key (or any other
 * extra) is rejected by `validateOutputSchema` — machine-enforcement of the
 * "no vendor is auto-selected" and "no additional top-level keys" contracts.
 * @type {Set<string>}
 */
const CANONICAL_SCHEMA_KEYS = Object.freeze(
  new Set([
    'bucket',
    'name',
    'source_url',
    'retrieved_date',
    'price',
    'quality_rank',
    'region',
    'verified_source',
    'verified_date',
    'unverified_this_run',
  ]),
);

/**
 * The three valid `bucket` values. Frozen.
 * @type {Set<string>}
 */
const VALID_BUCKETS = Object.freeze(new Set(['hosted', 'self_hosted', 'library']));

/**
 * The parent's five rejected evaluative-price patterns, verbatim. Each is a
 * STATIC, word-bounded, case-insensitive literal RegExp — never built from
 * input, no nested/unbounded quantifier (linear-time; no ReDoS). Frozen.
 * @type {readonly RegExp[]}
 */
const EVALUATIVE_PRICE_PATTERNS = Object.freeze([
  /\baffordable\b/i,
  /\bexpensive\b/i,
  /\bworth it\b/i,
  /\bcompetitive\b/i,
  /\breasonable\b/i,
]);

/** True for a non-empty string. */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Assert that `option` obeys the canonical output contract; return it unchanged
 * on success. Fails LOUDLY (never silently passes) — these throws ARE the
 * machine-enforcement the parent relies on.
 *
 * Rules:
 *  - `option` must be a non-null object.
 *  - Its OWN top-level keys must equal `CANONICAL_SCHEMA_KEYS` exactly:
 *    any extra key (e.g. `selected`) → throw naming it; any missing key → throw
 *    naming it.
 *  - `bucket` must be one of `VALID_BUCKETS`.
 *  - `bucket:'hosted'` requires a non-empty `region`; non-hosted buckets may
 *    have `region:null`.
 *  - `verified_source` and `verified_date` are all-or-nothing: if one is a
 *    non-empty string the other must be too (no date without a source, and vice
 *    versa).
 *
 * @param {object} option
 * @returns {object} the same `option`, unchanged
 * @throws {TypeError} on non-object / null input
 * @throws {Error} naming the offending key / rule
 */
function validateOutputSchema(option) {
  if (option === null || typeof option !== 'object' || Array.isArray(option)) {
    throw new TypeError('validateOutputSchema: option must be an object');
  }

  // Reject any extra key (incl. `selected`) — iterate own keys, compare to the
  // frozen Set. No assignment from input into any shared object.
  for (const key of Object.keys(option)) {
    if (!CANONICAL_SCHEMA_KEYS.has(key)) {
      throw new Error(`validateOutputSchema: unknown key "${key}"`);
    }
  }

  // Require every canonical key be present.
  for (const key of CANONICAL_SCHEMA_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(option, key)) {
      throw new Error(`validateOutputSchema: missing required key "${key}"`);
    }
  }

  if (!VALID_BUCKETS.has(option.bucket)) {
    throw new Error(`validateOutputSchema: invalid bucket "${String(option.bucket)}"`);
  }

  // Hosted options are EU-region only → region must be a non-empty string.
  if (option.bucket === 'hosted' && !isNonEmptyString(option.region)) {
    throw new Error('validateOutputSchema: hosted option requires region');
  }

  // verified_source ⇔ verified_date (all-or-nothing).
  const hasSource = isNonEmptyString(option.verified_source);
  const hasDate = isNonEmptyString(option.verified_date);
  if (hasSource && !hasDate) {
    throw new Error('validateOutputSchema: verified_source present but verified_date missing');
  }
  if (hasDate && !hasSource) {
    throw new Error('validateOutputSchema: verified_date present but verified_source missing');
  }

  return option;
}

/**
 * Assert that `price` is a factual (non-evaluative) string; return it unchanged
 * on success. Price must be a FACT — evaluative language is rejected.
 *
 * @param {string} price
 * @returns {string} the same `price`, unchanged
 * @throws {Error} on non-string / empty input, or naming the first matched
 *   evaluative pattern
 */
function validatePriceString(price) {
  if (!isNonEmptyString(price)) {
    throw new Error('validatePriceString: price must be a non-empty string');
  }
  for (const re of EVALUATIVE_PRICE_PATTERNS) {
    if (re.test(price)) {
      // `re.source` names the matched pattern (e.g. `\baffordable\b`).
      throw new Error(`validatePriceString: rejected evaluative pattern "${re.source}"`);
    }
  }
  return price;
}

/**
 * Assert that a bucket's options have strictly-increasing, unique, positive-
 * integer `quality_rank` in array order (the parent's "monotonically non-
 * decreasing AND unique" contract, which with uniqueness means strictly
 * increasing). Return `true` on success. Empty / single-entry arrays are
 * vacuously monotonic.
 *
 * @param {object[]} options - one bucket's entries, in intended rank order
 * @returns {true}
 * @throws {TypeError} on non-array input
 * @throws {Error} naming a non-positive-integer rank, a non-monotonic index,
 *   or a duplicate rank
 */
function checkMonotonicity(options) {
  if (!Array.isArray(options)) {
    throw new TypeError('checkMonotonicity: options must be an array');
  }

  const seen = new Set();
  let prev = null;
  for (let i = 0; i < options.length; i++) {
    const entry = options[i];
    const rank = entry === null || typeof entry !== 'object' ? undefined : entry.quality_rank;

    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank <= 0) {
      throw new Error(
        `checkMonotonicity: quality_rank must be a positive integer at index ${i}`,
      );
    }
    if (seen.has(rank)) {
      throw new Error(`checkMonotonicity: duplicate quality_rank ${rank}`);
    }
    if (prev !== null && rank <= prev) {
      throw new Error(`checkMonotonicity: quality_rank not monotonic at index ${i}`);
    }
    seen.add(rank);
    prev = rank;
  }

  return true;
}

/**
 * Normalize the outcome of an injected web call into `{ ok, ... }`. A returned
 * thenable (Promise) is chained so async injected calls are also fail-soft.
 */
function normalizeCall(invoke) {
  try {
    const result = invoke();
    // Fail-soft over async boundaries too: chain thenables.
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      return result.then(
        (data) => ({ ok: true, data }),
        (error) => ({ ok: false, error: error instanceof Error ? error : new Error(String(error)) }),
      );
    }
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Factory returning a fetcher `{ search(query), fetch(url) }` that DELEGATES to
 * the two INJECTED functions — the sole web boundary. It makes no web call of
 * its own. Each method is fail-soft: a thrown/rejected injected call becomes
 * `{ ok:false, error }` (no exception propagates) so the agent's fallback path,
 * not a crash, handles a network failure. A successful call becomes
 * `{ ok:true, data }`.
 *
 * @param {(query: string) => unknown} webSearchFn - injected search tool handle
 * @param {(url: string) => unknown} webFetchFn - injected fetch tool handle
 * @returns {{ search: (query: string) => object, fetch: (url: string) => object }}
 * @throws {TypeError} if either argument is not a function (wiring-time error —
 *   loud, not silent)
 */
function createFetcher(webSearchFn, webFetchFn) {
  if (typeof webSearchFn !== 'function' || typeof webFetchFn !== 'function') {
    throw new TypeError('createFetcher: webSearchFn and webFetchFn must be functions');
  }
  return {
    search(query) {
      return normalizeCall(() => webSearchFn(query));
    },
    fetch(url) {
      return normalizeCall(() => webFetchFn(url));
    },
  };
}

/**
 * Return a SHALLOW COPY of `option` with `unverified_this_run: true` and the
 * named `fieldName` set to `skillDocumentedFigure`. Applies PER FIELD (not
 * globally) — the caller invokes it once per field whose live verification
 * failed. Never mutates the input.
 *
 * @param {object} option
 * @param {*} skillDocumentedFigure - the fallback value (caller-supplied; no
 *   figure is baked into this module)
 * @param {string} [fieldName='price'] - the field to overwrite with the figure
 * @returns {object} a new option object
 * @throws {TypeError} on non-object `option`
 */
function applyFallback(option, skillDocumentedFigure, fieldName = 'price') {
  if (option === null || typeof option !== 'object' || Array.isArray(option)) {
    throw new TypeError('applyFallback: option must be an object');
  }
  return {
    ...option,
    [fieldName]: skillDocumentedFigure,
    unverified_this_run: true,
  };
}

module.exports = {
  CANONICAL_SCHEMA_KEYS,
  VALID_BUCKETS,
  EVALUATIVE_PRICE_PATTERNS,
  validateOutputSchema,
  validatePriceString,
  checkMonotonicity,
  createFetcher,
  applyFallback,
};

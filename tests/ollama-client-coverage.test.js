'use strict';

/**
 * Dark-branch + mutation-survival coverage for src/lib/plan-index/ollama-client.js
 *
 * Companion to tests/plan-index-embedding.test.js. That suite covers the happy
 * POST, the "embeddings not an array" shape reject, tag-stripping, non-200 on
 * both endpoints, empty/inconsistent/non-finite rows, and arg validation.
 *
 * This suite targets what remained DARK or mutant-surviving:
 *   • lines 84-85  — a row inside `embeddings` that is not a non-empty array
 *                    (`[null]` hits `!Array.isArray`, `[[]]` hits `row.length===0`)
 *   • lines 116-117 — no fetch implementation available at construction
 *   • the SECOND operand of `res.ok || res.status === 200` (a {ok:false,status:200}
 *     response MUST be accepted, not rejected as an error)
 *   • the `!res` → `'no-response'` fallback (fetch resolves undefined)
 *   • `stripTag` cutting at the FIRST colon (indexOf, not lastIndexOf) and the
 *     no-colon passthrough
 *   • `listModels` filtering malformed model entries and the absent-`models` → []
 *     fallback
 *   • the baseUrl `&&` fallback (empty / non-string → DEFAULT_BASE_URL)
 *   • the AbortController timeout wiring in boundedFetch (signal passed, abort fires)
 *   • a well-formed response yielding the ACTUAL vector values (no fabrication)
 *
 * Every fetch is an injected fake — no network, no live Ollama. AAA throughout.
 *
 * AI-authored, human-reviewed line-by-line (Tijn) — each assertion pins a branch
 * that goes red under mutation of the named line.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createOllamaClient,
  parseEmbeddings,
  stripTag,
  DEFAULT_BASE_URL
} = require('../src/lib/plan-index/ollama-client');

// A fetch that records the request and returns a canned, well-formed 200.
function recordingFetch(record, embeddings = [[1, 0, 0]]) {
  return async (url, opts) => {
    record.url = url;
    record.method = opts.method;
    record.headers = opts.headers;
    record.body = opts.body ? JSON.parse(opts.body) : null;
    record.signal = opts.signal;
    return { ok: true, status: 200, async json() { return { embeddings }; } };
  };
}

// ── Request construction (endpoint / method / headers / body) ────────────────

test('embed_posts_json_body_with_model_and_input_and_content_type_header', async () => {
  // Arrange
  const rec = {};
  const client = createOllamaClient({ fetch: recordingFetch(rec), baseUrl: 'http://h:1' });

  // Act
  await client.embed('nomic-embed-text', ['alpha', 'beta']);

  // Assert — pins endpoint suffix, POST verb, JSON content-type, exact payload
  assert.equal(rec.url, 'http://h:1/api/embed');
  assert.equal(rec.method, 'POST');
  assert.equal(rec.headers['Content-Type'], 'application/json');
  assert.deepEqual(rec.body, { model: 'nomic-embed-text', input: ['alpha', 'beta'] });
});

// ── Well-formed response yields the REAL vector (no fabrication) ──────────────

test('embed_returns_exact_float_values_from_a_well_formed_response', async () => {
  // Arrange — distinctive fractional/negative values so a fabricated vector differs
  const rec = {};
  const client = createOllamaClient({ fetch: recordingFetch(rec, [[1.5, -2.25, 0]]) });

  // Act
  const vecs = await client.embed('m', ['x']);

  // Assert — the returned Float32Array carries the response numbers verbatim
  assert.equal(vecs.length, 1);
  assert.ok(vecs[0] instanceof Float32Array);
  assert.deepEqual(Array.from(vecs[0]), [1.5, -2.25, 0]);
});

// ── SECOND operand of `res.ok || res.status === 200` (line 142) ──────────────
// A response with ok:false but HTTP 200 MUST be accepted. A mutant that drops
// `|| res.status === 200` would reject a perfectly valid 200 as an error.

test('embed_accepts_response_when_status_is_200_even_though_ok_flag_is_false', async () => {
  // Arrange
  const fakeFetch = async () => ({ ok: false, status: 200, async json() { return { embeddings: [[7, 8]] }; } });
  const client = createOllamaClient({ fetch: fakeFetch });

  // Act
  const vecs = await client.embed('m', ['x']);

  // Assert — accepted, real vector returned (not an "HTTP 200" error)
  assert.deepEqual(Array.from(vecs[0]), [7, 8]);
});

test('listModels_accepts_response_when_status_is_200_even_though_ok_flag_is_false', async () => {
  // Arrange
  const fakeFetch = async () => ({ ok: false, status: 200, async json() { return { models: [{ name: 'x:latest' }] }; } });
  const client = createOllamaClient({ fetch: fakeFetch });

  // Act
  const names = await client.listModels();

  // Assert
  assert.deepEqual(names, ['x']);
});

// ── `!res` first operand → 'no-response' status (lines 142-144, 156-158) ─────
// fetch resolves undefined (not a Response). Distinguished from a numeric non-200.

test('embed_rejects_with_no_response_status_when_fetch_resolves_undefined', async () => {
  // Arrange
  const fakeFetch = async () => undefined;
  const client = createOllamaClient({ fetch: fakeFetch });

  // Act + Assert
  await assert.rejects(() => client.embed('m', ['x']), /HTTP no-response/);
});

test('listModels_rejects_with_no_response_status_when_fetch_resolves_undefined', async () => {
  // Arrange
  const fakeFetch = async () => undefined;
  const client = createOllamaClient({ fetch: fakeFetch });

  // Act + Assert
  await assert.rejects(() => client.listModels(), /HTTP no-response/);
});

// ── parseEmbeddings: a row that is not a non-empty array (lines 83-85) ────────
// Two rows pin the two operands of `!Array.isArray(row) || row.length === 0`.

for (const [id, embeddings] of [
  ['non_array_row_null', [null], '!Array.isArray(row) — null is not an array'],
  ['non_array_row_string', ['nope'], '!Array.isArray(row) — a string is not an array'],
  ['empty_row', [[]], 'row.length === 0 — the row is an empty array']
]) {
  test(`embed_rejects_when_a_row_is_not_a_non_empty_array__${id}`, async () => {
    // Arrange
    const fakeFetch = async () => ({ ok: true, status: 200, async json() { return { embeddings }; } });
    const client = createOllamaClient({ fetch: fakeFetch });

    // Act + Assert — names the row index and rejects (case: ${why})
    await assert.rejects(() => client.embed('m', ['x']), /row 0 is not a non-empty number array/);
  });
}

// ── No fetch implementation available (lines 115-117) ────────────────────────
// config.fetch is not a function AND the global fetch is unavailable → construct
// must throw loudly rather than hand back a broken client.

test('createOllamaClient_throws_when_no_fetch_implementation_is_available', () => {
  // Arrange — remove the Node global fetch, pass a non-function config.fetch
  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = undefined;

    // Act + Assert
    assert.throws(
      () => createOllamaClient({ fetch: null }),
      /no fetch implementation available/
    );
  } finally {
    // Cleanup — restore the real global fetch no matter what
    globalThis.fetch = savedFetch;
  }
});

test('createOllamaClient_falls_back_to_global_fetch_when_config_fetch_is_not_a_function', () => {
  // Arrange — a sentinel global fetch; config.fetch is a non-function so the
  // ternary's false branch (globalThis.fetch) must be selected.
  const savedFetch = globalThis.fetch;
  try {
    const sentinel = async () => ({ ok: true, status: 200, async json() { return { models: [] }; } });
    globalThis.fetch = sentinel;

    // Act — passing fetch: 42 (not a function) must NOT throw; it uses the global
    const client = createOllamaClient({ fetch: 42 });

    // Assert — a usable client was built from the global fetch fallback
    assert.equal(typeof client.embed, 'function');
    assert.equal(typeof client.listModels, 'function');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

// ── baseUrl `&&` fallback (lines 111-112) ────────────────────────────────────
// The exposed client.baseUrl is the observable. Empty/non-string → DEFAULT.

for (const [id, baseUrl, expected] of [
  ['empty_string', '', DEFAULT_BASE_URL],
  ['non_string_number', 12345, DEFAULT_BASE_URL],
  ['undefined', undefined, DEFAULT_BASE_URL],
  ['valid_custom', 'http://ollama.internal:9999', 'http://ollama.internal:9999']
]) {
  test(`createOllamaClient_resolves_base_url__${id}`, () => {
    // Arrange + Act
    const client = createOllamaClient({ fetch: async () => ({ ok: true, status: 200, async json() { return {}; } }), baseUrl });

    // Assert
    assert.equal(client.baseUrl, expected);
  });
}

test('embed_targets_the_custom_base_url_on_the_wire', async () => {
  // Arrange — proves baseUrl is not merely stored but used to build the URL
  const rec = {};
  const client = createOllamaClient({ fetch: recordingFetch(rec), baseUrl: 'http://custom:7070' });

  // Act
  await client.embed('m', ['x']);

  // Assert
  assert.equal(rec.url, 'http://custom:7070/api/embed');
});

// ── stripTag: cut at the FIRST colon; passthrough when no colon ──────────────

for (const [id, input, expected] of [
  ['no_colon_passthrough', 'nomic-embed-text', 'nomic-embed-text'],
  ['single_colon', 'nomic-embed-text:latest', 'nomic-embed-text'],
  ['first_of_multiple_colons', 'registry:5000/model:tag', 'registry'],
  ['leading_colon_yields_empty_base', ':latest', '']
]) {
  test(`stripTag_returns_base_name__${id}`, () => {
    // Act + Assert — first-colon cut distinguishes indexOf from lastIndexOf
    assert.equal(stripTag(input), expected);
  });
}

// ── listModels: filter malformed entries, keep valid base names ──────────────
// Pins `m && typeof m.name === 'string' ? stripTag(m.name) : null` + the filter.

test('listModels_drops_null_missing_and_non_string_name_entries', async () => {
  // Arrange — mix of valid and malformed model records
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        models: [
          { name: 'good:latest' },   // kept → 'good'
          null,                       // dropped (m falsy)
          {},                         // dropped (no name)
          { name: 42 },               // dropped (name not a string)
          { name: '' },               // dropped (empty after? no colon → '' → length 0 filtered)
          { name: 'bare' }            // kept → 'bare'
        ]
      };
    }
  });
  const client = createOllamaClient({ fetch: fakeFetch });

  // Act
  const names = await client.listModels();

  // Assert — only the two valid entries survive, in order
  assert.deepEqual(names, ['good', 'bare']);
});

// ── listModels: absent / non-array `models` key → [] (line 161) ──────────────

for (const [id, payload] of [
  ['models_key_absent', {}],
  ['models_not_an_array', { models: 'nope' }],
  ['models_null', { models: null }]
]) {
  test(`listModels_returns_empty_array_when__${id}`, async () => {
    // Arrange
    const fakeFetch = async () => ({ ok: true, status: 200, async json() { return payload; } });
    const client = createOllamaClient({ fetch: fakeFetch });

    // Act
    const names = await client.listModels();

    // Assert — the `: []` fallback, not a throw
    assert.deepEqual(names, []);
  });
}

// ── boundedFetch: AbortController timeout wiring (lines 40-48) ────────────────
// A fetch that never resolves on its own must be aborted by the timeout, and the
// abort signal must be threaded into the fetch options.

test('embed_aborts_the_request_via_the_timeout_signal_when_fetch_hangs', async () => {
  // Arrange — fetch resolves only when its signal fires 'abort'
  let sawSignal = null;
  const hangingFetch = (url, opts) => new Promise((_resolve, reject) => {
    sawSignal = opts.signal;
    opts.signal.addEventListener('abort', () => reject(new Error('aborted-by-timeout-signal')));
  });
  const client = createOllamaClient({ fetch: hangingFetch, timeoutMs: 10 });

  // Act + Assert — the 10ms timer fires controller.abort(), rejecting the promise
  await assert.rejects(() => client.embed('m', ['x']), /aborted-by-timeout-signal/);

  // Assert — the signal was a real AbortSignal handed to fetch, and it is aborted
  assert.ok(sawSignal instanceof AbortSignal);
  assert.equal(sawSignal.aborted, true);
});

// ── parseEmbeddings exported directly: well-formed maps to Float32Array[] ─────

test('parseEmbeddings_maps_a_well_formed_matrix_to_float32arrays_verbatim', () => {
  // Arrange
  const json = { embeddings: [[0.5, -0.5], [1, 2]] };

  // Act
  const out = parseEmbeddings(json);

  // Assert — shape + exact values preserved across both rows
  assert.equal(out.length, 2);
  assert.ok(out[0] instanceof Float32Array && out[1] instanceof Float32Array);
  assert.deepEqual(Array.from(out[0]), [0.5, -0.5]);
  assert.deepEqual(Array.from(out[1]), [1, 2]);
});

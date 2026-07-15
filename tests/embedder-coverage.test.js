/**
 * embedder-coverage.test.js — hard, non-obvious branch coverage for
 * src/lib/plan-index/embedder.js.
 *
 * Companion to tests/plan-index-embedding.test.js (which owns the happy-path
 * Ollama/in-process/calibration cases). This file deliberately targets the DARK
 * branches that survive mutation in the existing suite:
 *
 *   • lines 107-108 — the `catch { attemptOllama = false }` fail-open when the
 *     probe THROWS in 'auto' mode (existing tests only inject a probe that
 *     RESOLVES false, never one that rejects).
 *   • lines 126-127 — the calibration-load catch that keeps the default model
 *     when loadCalibration THROWS inside the Ollama attempt.
 *   • the second operands of the model-selection `&&` chain (line 122):
 *     `cal.model.length > 0` and `cal.backend !== 'in-process'`.
 *   • the `?? 'auto'` nullish fallback (line 87) via a getSetting that RETURNS
 *     undefined (distinct from the getSetting-throws catch already covered).
 *   • the `: [texts]` single-value wrap (line 80).
 *   • the `!Array.isArray(raw)` first operand of the count guard (line 130).
 *   • the `: new Float32Array(v)` else of the re-normalize ternary (line 134)
 *     plus the re-normalization itself (a plain, non-unit number[][] from the
 *     client must come back L2-unit — kills a "skip renorm" mutant).
 *   • l2normalize's `norm > 0` false (zero vector) and the SECOND operand
 *     `Number.isFinite(norm)` (non-finite norm) guards (line 49).
 *   • determinism + sensitivity of the in-process fallback at the embed() façade
 *     (kills a constant-vector mutant).
 *   • the fail-open path returns the REAL in-process vectors, never a fabricated
 *     "ollama"-tagged vector (kills a mutant that claims Ollama after falling
 *     back), and emits the warn() diagnostic.
 *
 * Hermetic: the only boundary (the Ollama client + the probe) is faked in-line.
 * No live network, no filesystem, no getSetting into real settings.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const embedder = require('../src/lib/plan-index/embedder');
const inprocess = require('../src/lib/plan-index/inprocess-engine');

// ── helpers ───────────────────────────────────────────────────────────────────

function isL2Unit(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  return Math.abs(Math.sqrt(s) - 1) < 1e-4;
}

// A recording fake Ollama client. `embed` returns whatever `rows(model, input)`
// produces, so a test can inject a non-array, plain arrays, Float32Arrays, etc.
function makeRecordingClient(rows) {
  const calls = { embed: 0, lastModel: null, lastInput: null };
  return {
    calls,
    async embed(model, input) {
      calls.embed++;
      calls.lastModel = model;
      calls.lastInput = input;
      return rows(model, input);
    },
  };
}

// A fake client that returns one well-shaped Float32Array per input.
function makeOkClient() {
  return makeRecordingClient((_model, input) =>
    input.map((_t, row) => {
      const v = new Float32Array(inprocess.DIMENSION);
      for (let i = 0; i < v.length; i++) v[i] = ((row + 1) * (i + 3)) % 5 + 0.2;
      return v;
    })
  );
}

// ── lines 107-108: probe THROWS in 'auto' → fail-open to in-process ────────────

test('embed_falls_back_in_process_when_probe_rejects_in_auto_mode', async () => {
  // Arrange — auto preference, a probe that REJECTS (not one that resolves false),
  // and an Ollama client that would succeed if it were ever consulted.
  const client = makeOkClient();

  // Act
  const result = await embedder.embed(['probe blows up'], {
    ollamaClient: client,
    getSetting: () => 'auto',
    probe: async () => { throw new Error('probe: connection reset'); },
  });

  // Assert — the rejected probe is swallowed (fail-open); Ollama is never called.
  assert.equal(result.source, 'in-process', 'rejected probe → in-process fallback');
  assert.equal(client.calls.embed, 0, 'Ollama client is never consulted when the probe throws');
});

// ── lines 126-127: loadCalibration THROWS inside the Ollama attempt ────────────

test('embed_uses_default_model_and_still_succeeds_when_loadCalibration_throws', async () => {
  // Arrange — force Ollama (no probe needed); loadCalibration explodes.
  const client = makeOkClient();

  // Act
  const result = await embedder.embed(['x', 'y'], {
    ollamaClient: client,
    getSetting: () => 'ollama',
    loadCalibration: () => { throw new Error('calibration.json corrupt'); },
  });

  // Assert — the throw is swallowed, the DEFAULT model is used, Ollama still runs.
  assert.equal(result.source, 'ollama', 'loadCalibration failure does not sink the Ollama path');
  assert.equal(
    client.calls.lastModel,
    embedder.DEFAULT_OLLAMA_MODEL,
    'default model is used when calibration cannot be loaded'
  );
});

// ── line 122 (&& chain): calibration backend 'in-process' keeps the DEFAULT ────
//    model even though cal.model is a non-empty string. Kills the mutant that
//    drops the `cal.backend !== 'in-process'` guard (which would wrongly send the
//    in-process model name to the Ollama client).

test('embed_ignores_calibration_model_when_calibration_backend_is_in_process', async () => {
  // Arrange
  const client = makeOkClient();

  // Act
  const result = await embedder.embed(['z'], {
    ollamaClient: client,
    getSetting: () => 'ollama',
    loadCalibration: () => ({ model: 'in-process-hash-v1', backend: 'in-process' }),
  });

  // Assert — the in-process-tagged model name must NOT be forwarded to Ollama.
  assert.equal(result.source, 'ollama');
  assert.equal(
    client.calls.lastModel,
    embedder.DEFAULT_OLLAMA_MODEL,
    'a calibration pinned to the in-process backend must not override the Ollama model'
  );
});

// ── line 122 (&& chain): empty cal.model keeps the DEFAULT model ───────────────

test('embed_uses_default_model_when_calibration_model_is_empty_string', async () => {
  // Arrange
  const client = makeOkClient();

  // Act
  const result = await embedder.embed(['z'], {
    ollamaClient: client,
    getSetting: () => 'ollama',
    loadCalibration: () => ({ model: '', backend: 'ollama' }),
  });

  // Assert — empty model string fails the `.length > 0` guard → default stands.
  assert.equal(result.source, 'ollama');
  assert.equal(client.calls.lastModel, embedder.DEFAULT_OLLAMA_MODEL);
});

// ── line 122: null calibration keeps the DEFAULT model and still uses Ollama ───

test('embed_uses_default_model_when_calibration_is_null', async () => {
  // Arrange
  const client = makeOkClient();

  // Act
  const result = await embedder.embed(['z'], {
    ollamaClient: client,
    getSetting: () => 'ollama',
    loadCalibration: () => null,
  });

  // Assert
  assert.equal(result.source, 'ollama');
  assert.equal(client.calls.lastModel, embedder.DEFAULT_OLLAMA_MODEL);
});

// ── lines 89-90 (`catch { preference = 'auto' }`): getSetting THROWS → auto ─────
//    Distinct from the undefined-return case below: here getSetting rejects and
//    the catch defaults the preference to 'auto'.

test('embed_defaults_to_auto_when_getSetting_throws', async () => {
  // Arrange — getSetting explodes; probe resolves false → in-process.
  const client = makeOkClient();

  // Act
  const result = await embedder.embed(['settings blew up'], {
    ollamaClient: client,
    getSetting: () => { throw new Error('settings backend unavailable'); },
    probe: async () => false,
  });

  // Assert — the throw is caught, preference defaults to 'auto', probe decides.
  assert.equal(result.source, 'in-process', 'getSetting failure → default auto → probe-false → in-process');
  assert.equal(client.calls.embed, 0);
});

// ── lines 123-124 (`model = cal.model`): a valid Ollama calibration pins its
//    model. This is the SUCCESS arm of the &&-chain (all four conjuncts true) —
//    kills a mutant that ignores the pinned model and always sends the default.

test('embed_uses_the_calibrated_model_when_calibration_pins_an_ollama_model', async () => {
  // Arrange — a real calibration: non-empty model, ollama backend.
  const client = makeOkClient();
  const pinned = 'mxbai-embed-large';

  // Act
  const result = await embedder.embed(['pin me'], {
    ollamaClient: client,
    getSetting: () => 'ollama',
    loadCalibration: () => ({ model: pinned, backend: 'ollama', dimension: inprocess.DIMENSION }),
  });

  // Assert — the pinned model (NOT the default) is forwarded to the Ollama client.
  assert.equal(result.source, 'ollama');
  assert.equal(client.calls.lastModel, pinned, 'a valid ollama calibration overrides the default model');
  assert.notEqual(client.calls.lastModel, embedder.DEFAULT_OLLAMA_MODEL, 'default is superseded by the pinned model');
});

// ── line 87 (`?? 'auto'`): getSetting RETURNS undefined (not throws) → auto ─────
//    Distinct from the existing getSetting-throws case, which hits the catch.

test('embed_defaults_to_auto_when_getSetting_returns_undefined', async () => {
  // Arrange — getSetting resolves to undefined; probe resolves false → in-process.
  const client = makeOkClient();

  // Act
  const result = await embedder.embed(['nullish preference'], {
    ollamaClient: client,
    getSetting: () => undefined, // hits `?? 'auto'`, NOT the try/catch
    probe: async () => false,
  });

  // Assert — undefined preference coalesces to 'auto', which then probes.
  assert.equal(result.source, 'in-process');
  assert.equal(client.calls.embed, 0, 'auto + probe-false never touches Ollama');
});

// ── line 80 (`: [texts]`): a single non-array text is wrapped into one batch ────

test('embed_wraps_a_single_string_argument_into_one_vector', async () => {
  // Arrange — pass a bare string, not an array.
  const single = 'a lone plan section about billing';

  // Act
  const result = await embedder.embed(single, { getSetting: () => 'in-process' });

  // Assert — wrapped to a one-element batch, identical to embedding ['<string>'].
  assert.equal(result.vectors.length, 1, 'bare string → exactly one vector');
  const expected = (await inprocess.embedInProcess([single]))[0];
  assert.deepEqual(
    Array.from(result.vectors[0]),
    Array.from(expected),
    'the wrapped single string embeds the same as a one-element array'
  );
});

// ── line 130 (`!Array.isArray(raw)` first operand): non-array raw → fallback ────
//    Distinct from the existing count-mismatch case, which trips the SECOND
//    operand (raw.length !== list.length) with a valid array.

test('embed_falls_back_when_ollama_returns_a_non_array', async () => {
  // Arrange — client yields an object, not an array of vectors.
  const client = makeRecordingClient(() => ({ not: 'an array' }));

  // Act
  const result = await embedder.embed(['a'], {
    ollamaClient: client,
    getSetting: () => 'ollama',
    loadCalibration: () => null,
  });

  // Assert — the shape guard throws internally and the façade fails open.
  assert.equal(result.source, 'in-process', 'a non-array Ollama response triggers fallback');
  assert.equal(result.vectors[0].length, inprocess.DIMENSION);
});

// ── line 134 (`: new Float32Array(v)` else + re-normalization): plain, NON-unit
//    number[][] from the client must come back as an L2-unit Float32Array with
//    its direction preserved. Kills both the ternary else-arm mutant and a
//    "skip re-normalization" mutant.

test('embed_renormalizes_plain_non_unit_ollama_arrays_into_unit_float32', async () => {
  // Arrange — a plain JS array [3,4,0,0,0]; magnitude 5, direction (0.6, 0.8).
  const client = makeRecordingClient(() => [[3, 4, 0, 0, 0]]);

  // Act
  const result = await embedder.embed(['vec'], {
    ollamaClient: client,
    getSetting: () => 'ollama',
    loadCalibration: () => null,
  });

  // Assert
  assert.equal(result.source, 'ollama');
  assert.ok(result.vectors[0] instanceof Float32Array, 'plain array is coerced to Float32Array');
  assert.ok(isL2Unit(result.vectors[0]), 'a non-unit Ollama vector is re-L2-normalized');
  assert.ok(Math.abs(result.vectors[0][0] - 0.6) < 1e-6, 'direction preserved: first component 3/5');
  assert.ok(Math.abs(result.vectors[0][1] - 0.8) < 1e-6, 'direction preserved: second component 4/5');
});

// ── fail-open must NOT fabricate an Ollama vector; it returns the REAL
//    in-process vectors and warns. Kills a mutant that keeps source='ollama'
//    (or returns a client-shaped vector) after a fallback.

test('embed_returns_real_in_process_vectors_on_ollama_failure_never_a_fabricated_one', async () => {
  // Arrange — a client that always throws; force Ollama so the throw is the path.
  const throwingClient = { async embed() { throw new Error('ECONNREFUSED'); } };
  const texts = ['a dog running in the park', 'the quarterly revenue report'];

  // Act
  const result = await embedder.embed(texts, {
    ollamaClient: throwingClient,
    getSetting: () => 'ollama',
    loadCalibration: () => null,
  });

  // Assert — the vectors are byte-identical to the deterministic in-process ones,
  // proving no Ollama vector was fabricated and the source tag is honest.
  assert.equal(result.source, 'in-process');
  const truth = await inprocess.embedInProcess(texts);
  assert.deepEqual(Array.from(result.vectors[0]), Array.from(truth[0]));
  assert.deepEqual(Array.from(result.vectors[1]), Array.from(truth[1]));
});

test('embed_emits_warn_diagnostic_when_ollama_backend_fails', async () => {
  // Arrange
  const warnings = [];
  const throwingClient = { async embed() { throw new Error('ECONNREFUSED'); } };

  // Act
  await embedder.embed(['x'], {
    ollamaClient: throwingClient,
    getSetting: () => 'ollama',
    loadCalibration: () => null,
    warn: (msg) => warnings.push(msg),
  });

  // Assert — exactly the fallback diagnostic is surfaced to the injected warn().
  assert.equal(warnings.length, 1, 'one warning on fallback');
  assert.match(warnings[0], /falling back to in-process/i);
  assert.match(warnings[0], /ECONNREFUSED/, 'the underlying error message is included');
});

// ── determinism + sensitivity at the embed() façade (in-process backend) ───────

test('embed_is_byte_deterministic_for_identical_text_in_process', async () => {
  // Arrange
  const opts = { getSetting: () => 'in-process' };

  // Act
  const first = await embedder.embed(['identical plan text'], opts);
  const second = await embedder.embed(['identical plan text'], opts);

  // Assert — same text → byte-identical vector (kills a nondeterminism mutant).
  assert.deepEqual(Array.from(first.vectors[0]), Array.from(second.vectors[0]));
});

test('embed_produces_different_vectors_for_different_text_in_process', async () => {
  // Arrange
  const opts = { getSetting: () => 'in-process' };

  // Act
  const a = await embedder.embed(['alpha beta gamma delta'], opts);
  const b = await embedder.embed(['completely unrelated payroll invoice'], opts);

  // Assert — different text → different vector (kills a constant-vector mutant).
  assert.notDeepEqual(
    Array.from(a.vectors[0]),
    Array.from(b.vectors[0]),
    'distinct inputs must not collapse to the same vector'
  );
});

// ── l2normalize (exported) — the guard branches on line 49 ─────────────────────

test('l2normalize_scales_a_vector_to_unit_length_preserving_direction', () => {
  // Arrange — magnitude 5, direction (0.6, 0.8).
  const vec = new Float32Array([3, 4]);

  // Act
  const out = embedder.l2normalize(vec);

  // Assert
  assert.ok(out === vec, 'normalizes in place and returns the same array');
  assert.ok(Math.abs(out[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(out[1] - 0.8) < 1e-6);
  assert.ok(isL2Unit(out));
});

test('l2normalize_leaves_a_zero_vector_all_zero', () => {
  // Arrange — norm === 0 → the `norm > 0` guard is false, no division.
  const vec = new Float32Array([0, 0, 0]);

  // Act
  const out = embedder.l2normalize(vec);

  // Assert — returned unchanged, never NaN-poisoned by a divide-by-zero.
  assert.deepEqual(Array.from(out), [0, 0, 0]);
});

test('l2normalize_leaves_a_non_finite_vector_unchanged', () => {
  // Arrange — an Infinity component makes norm non-finite; the SECOND operand
  // `Number.isFinite(norm)` must veto the division (else it would produce NaN/0).
  const vec = new Float32Array([Infinity, 1]);

  // Act
  const out = embedder.l2normalize(vec);

  // Assert — untouched: the Infinity is preserved, not turned into NaN.
  assert.equal(out[0], Infinity, 'non-finite norm → vector returned unchanged');
  assert.equal(out[1], 1);
});

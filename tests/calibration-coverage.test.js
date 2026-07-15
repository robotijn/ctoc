'use strict';

/**
 * calibration-coverage.test.js — NON-OBVIOUS branch coverage for
 * src/lib/plan-index/calibration.js (PI2 first-run model selection).
 *
 * These tests target the DARK branches the existing suite
 * (tests/plan-index-embedding.test.js) leaves uncovered — measured before this
 * file: lines 105-108, 162-163, 174-175, 205-206, 230-231, branch 78.33%.
 *
 * Every test here is written to go RED under mutation of the calibration math /
 * threshold / graceful-degradation logic — not merely to raise the line %. In
 * particular each test pins one of:
 *   - the p95 percentile MATH (numeric sort, the exact index, empty→0),
 *   - the >= BUDGET vs > TARGET threshold boundaries (exact 5000 / exact 3000),
 *   - honest fallback when the Ollama probe / listModels / dimension-encode is
 *     absent or throws (never fabricate an `ollama` calibration, never crash),
 *   - the F1 non-finite guard (never return NaN/Infinity as measuredP95ms),
 *   - the derived dimension being the REAL encode length, not a hardcoded 384,
 *   - idempotent re-calibration (existing file short-circuits; `force` overrides).
 *
 * Boundary: fs (real os.tmpdir fixtures) and the Ollama subprocess/HTTP are the
 * only fakes — faked at the true boundary via injected deps. No network, no real
 * Ollama, no mocking of the module's own logic. AI-authored; every assertion
 * read line-by-line against the source before commit.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const calibration = require('../src/lib/plan-index/calibration');
const inprocess = require('../src/lib/plan-index/inprocess-engine');

// ── fixtures ──────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cal-cov-'));
}
function rmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}
function writeCalibrationFile(dir, raw) {
  const file = calibration.calibrationFilePath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, raw);
  return file;
}
function readPersisted(dir) {
  return JSON.parse(fs.readFileSync(calibration.calibrationFilePath(dir), 'utf8'));
}

// A boundary fake for the Ollama client: records calls, lets each test control
// listModels (the /api/tags result) and embed (dimension-probe / benchmark).
function makeFakeOllama({ models = [], embedImpl } = {}) {
  const calls = { listModels: 0, embed: 0, lastEmbedModel: null };
  return {
    calls,
    async listModels() {
      calls.listModels++;
      return models.slice();
    },
    async embed(model, input) {
      calls.embed++;
      calls.lastEmbedModel = model;
      if (embedImpl) return embedImpl(model, input);
      // Default: one 384-length finite vector per input.
      return input.map(() => {
        const v = new Float32Array(inprocess.DIMENSION);
        v[0] = 1;
        return v;
      });
    }
  };
}

const alwaysReachable = async () => true;

// ── Cluster A: p95() percentile MATH (exported pure function) ─────────────────
// Kills mutants on the sort comparator, the 0.95 constant, and the ceil()-1 index.

test('p95_uses_numeric_sort_not_lexicographic_ordering', () => {
  // Arrange — lexicographic sort of these would order "100" < "80" < "9".
  const samples = [100, 9, 80];

  // Act — n=3 → idx = min(2, ceil(0.95*3)-1) = min(2,2) = 2 → sorted[2].
  const result = calibration.p95(samples);

  // Assert — numeric sort [9,80,100][2] === 100; a string sort would yield 9.
  assert.strictEqual(result, 100);
});

test('p95_returns_zero_for_empty_sample_array', () => {
  // Act — the empty guard; without it sorted[max(0,-1)] would be undefined.
  const result = calibration.p95([]);

  // Assert
  assert.strictEqual(result, 0);
});

test('p95_selects_the_nineteenth_value_of_twenty_not_the_maximum', () => {
  // Arrange — shuffled 1..20 so sorted position, not input order, decides.
  const samples = [11, 3, 20, 7, 1, 15, 9, 18, 5, 13, 2, 17, 8, 19, 4, 16, 6, 14, 10, 12];

  // Act — n=20 → idx = min(19, ceil(0.95*20)-1) = min(19,18) = 18 → sorted[18].
  const result = calibration.p95(samples);

  // Assert — 95th percentile is the 19th ordered value (19), NOT the max (20).
  assert.strictEqual(result, 19);
});

// ── Cluster B: loadCalibration guard + fail-open (dark 104-108) ───────────────

test('loadCalibration_returns_null_when_json_valid_but_shape_invalid', () => {
  const rows = [
    { id: 'missing-model-field', raw: '{"dimension":384,"backend":"ollama"}' },
    { id: 'model-not-a-string', raw: '{"model":123,"dimension":384}' },
    { id: 'json-literal-null', raw: 'null' }
  ];
  for (const row of rows) {
    const dir = tmpDir();
    try {
      // Arrange
      writeCalibrationFile(dir, row.raw);

      // Act
      const loaded = calibration.loadCalibration({ projectPath: dir });

      // Assert — a file without a STRING model must never yield a bogus object.
      assert.strictEqual(loaded, null, `row=${row.id}`);
    } finally {
      rmDir(dir);
    }
  }
});

test('loadCalibration_returns_null_on_corrupt_unparseable_json_without_throwing', () => {
  const dir = tmpDir();
  try {
    // Arrange — bytes that are not JSON at all.
    writeCalibrationFile(dir, 'not json {{{{ ]]');

    // Act — the catch must swallow the parse error and fail open.
    const loaded = calibration.loadCalibration({ projectPath: dir });

    // Assert
    assert.strictEqual(loaded, null);
  } finally {
    rmDir(dir);
  }
});

test('loadCalibration_returns_the_persisted_object_faithfully_when_valid', () => {
  const dir = tmpDir();
  try {
    // Arrange — a non-default dimension so a reconstructed object would differ.
    const written = { model: 'nomic-embed-text', dimension: 768, backend: 'ollama', measuredP95ms: 2400 };
    writeCalibrationFile(dir, JSON.stringify(written));

    // Act
    const loaded = calibration.loadCalibration({ projectPath: dir });

    // Assert — returns the parsed object verbatim (all fields, incl. dim 768).
    assert.deepEqual(loaded, written);
  } finally {
    rmDir(dir);
  }
});

// ── Cluster C: graceful degradation — never fabricate calibration (162-3,174-5)

test('runCalibration_probe_that_throws_falls_back_to_in_process_honestly', async () => {
  const dir = tmpDir();
  try {
    // Arrange — a probe that throws must be caught, not propagate.
    const client = makeFakeOllama({ models: ['mxbai-embed-large'] });

    // Act
    const res = await calibration.runCalibration({
      probe: async () => { throw new Error('probe blew up'); },
      ollamaClient: client,
      projectPath: dir,
      force: true
    });

    // Assert — honest in-process pin, NOT a fabricated ollama entry; no encode ran.
    assert.strictEqual(res.backend, 'in-process');
    assert.strictEqual(res.model, calibration.INPROCESS_MODEL);
    assert.strictEqual(res.measuredP95ms, 0);
    assert.strictEqual(client.calls.embed, 0);
    assert.strictEqual(readPersisted(dir).backend, 'in-process');
  } finally {
    rmDir(dir);
  }
});

test('runCalibration_listModels_that_throws_degrades_to_in_process', async () => {
  const dir = tmpDir();
  try {
    // Arrange — reachable Ollama, but /api/tags fails.
    const throwingClient = {
      async listModels() { throw new Error('tags endpoint down'); },
      async embed() { throw new Error('should never benchmark'); }
    };

    // Act
    const res = await calibration.runCalibration({
      probe: alwaysReachable,
      ollamaClient: throwingClient,
      projectPath: dir,
      force: true
    });

    // Assert — empty availability → no candidate present → in-process fallback.
    assert.strictEqual(res.backend, 'in-process');
    assert.strictEqual(res.model, calibration.INPROCESS_MODEL);
  } finally {
    rmDir(dir);
  }
});

// ── Cluster D: threshold boundaries (dark 205-206; >= BUDGET vs > TARGET) ──────

test('runCalibration_excludes_candidate_at_exact_5000ms_budget_boundary', async () => {
  const dir = tmpDir();
  try {
    // Arrange — largest candidate sits EXACTLY on the budget; next is fast.
    const client = makeFakeOllama({ models: ['mxbai-embed-large', 'nomic-embed-text'] });
    const p95Map = { 'mxbai-embed-large': calibration.BUDGET_MS, 'nomic-embed-text': 800 };
    const clock = { p95For: (m) => p95Map[m] };

    // Act
    const res = await calibration.runCalibration({
      clock, ollamaClient: client, probe: alwaysReachable, projectPath: dir, force: true
    });

    // Assert — p95 === BUDGET is EXCLUDED (>=, filter `< BUDGET`), so nomic wins.
    assert.strictEqual(res.model, 'nomic-embed-text');
    assert.strictEqual(res.measuredP95ms, 800);
  } finally {
    rmDir(dir);
  }
});

test('runCalibration_logs_reduced_headroom_when_within_budget_but_above_target', async () => {
  const dir = tmpDir();
  const logs = [];
  try {
    // Arrange — 4000ms: below the 5000 budget, above the 3000 target.
    const client = makeFakeOllama({ models: ['all-minilm'] });
    const clock = { p95For: () => 4000 };

    // Act
    const res = await calibration.runCalibration({
      clock, ollamaClient: client, probe: alwaysReachable, projectPath: dir, force: true,
      log: (m) => logs.push(m)
    });

    // Assert — still pinned, AND the reduced-headroom branch (line 205) fired.
    assert.strictEqual(res.model, 'all-minilm');
    assert.strictEqual(res.measuredP95ms, 4000);
    assert.ok(logs.some((m) => /within budget but above .* target/.test(m)));
  } finally {
    rmDir(dir);
  }
});

test('runCalibration_no_headroom_warning_at_exact_3000ms_target_boundary', async () => {
  const dir = tmpDir();
  const logs = [];
  try {
    // Arrange — EXACTLY the target: `> TARGET` is false, so no headroom warning.
    const client = makeFakeOllama({ models: ['all-minilm'] });
    const clock = { p95For: () => calibration.TARGET_MS };

    // Act
    const res = await calibration.runCalibration({
      clock, ollamaClient: client, probe: alwaysReachable, projectPath: dir, force: true,
      log: (m) => logs.push(m)
    });

    // Assert — pinned within budget; no reduced-headroom log at the boundary.
    assert.strictEqual(res.model, 'all-minilm');
    assert.strictEqual(res.measuredP95ms, calibration.TARGET_MS);
    assert.ok(!logs.some((m) => /within budget but above .* target/.test(m)));
  } finally {
    rmDir(dir);
  }
});

// ── Cluster E: F1 non-finite guard — never persist NaN/Infinity as a p95 ───────

test('runCalibration_malformed_clock_yields_null_p95_never_a_non_finite_number', async () => {
  const dir = tmpDir();
  try {
    // Arrange — a clock that reports NaN; the F1 guard must coerce to Infinity
    // (over budget) and then persist measuredP95ms as null, never NaN/Infinity.
    const client = makeFakeOllama({ models: ['all-minilm'] });
    const clock = { p95For: () => NaN };

    // Act
    const res = await calibration.runCalibration({
      clock, ollamaClient: client, probe: alwaysReachable, projectPath: dir, force: true
    });

    // Assert — returned p95 is exactly null (dropping line 239's guard → Infinity).
    assert.strictEqual(res.model, 'all-minilm');
    assert.strictEqual(res.measuredP95ms, null);
  } finally {
    rmDir(dir);
  }
});

// ── Cluster F: dimension derived from the REAL encode (226 true + dark 230-231)

test('runCalibration_derives_dimension_from_the_real_encode_length', async () => {
  const dir = tmpDir();
  try {
    // Arrange — encode returns a 768-length vector (≠ the 384 fallback), so a
    // hardcoded/dropped dimension assignment is observable.
    const client = makeFakeOllama({
      models: ['all-minilm'],
      embedImpl: () => [new Float32Array(768).fill(0.5)]
    });
    const clock = { p95For: () => 800 };

    // Act
    const res = await calibration.runCalibration({
      clock, ollamaClient: client, probe: alwaysReachable, projectPath: dir, force: true
    });

    // Assert — dimension is the encode's 768, backend ollama.
    assert.strictEqual(res.dimension, 768);
    assert.strictEqual(res.backend, 'ollama');
    assert.notStrictEqual(res.dimension, inprocess.DIMENSION);
  } finally {
    rmDir(dir);
  }
});

test('runCalibration_keeps_fallback_dimension_when_dimension_encode_throws', async () => {
  const dir = tmpDir();
  try {
    // Arrange — benchmark uses the injected clock (no embed); the ONLY embed call
    // is the dimension probe, which throws → catch must keep calibration alive.
    const client = makeFakeOllama({
      models: ['all-minilm'],
      embedImpl: () => { throw new Error('encode failed at dimension probe'); }
    });
    const clock = { p95For: () => 800 };

    // Act
    const res = await calibration.runCalibration({
      clock, ollamaClient: client, probe: alwaysReachable, projectPath: dir, force: true
    });

    // Assert — model still pinned as ollama; dimension falls back, not a crash.
    assert.strictEqual(res.model, 'all-minilm');
    assert.strictEqual(res.backend, 'ollama');
    assert.strictEqual(res.dimension, inprocess.DIMENSION);
  } finally {
    rmDir(dir);
  }
});

test('runCalibration_keeps_fallback_dimension_when_encode_returns_zero_length_vector', async () => {
  const dir = tmpDir();
  try {
    // Arrange — encode returns an empty vector: `vecs[0].length > 0` is false.
    const client = makeFakeOllama({
      models: ['all-minilm'],
      embedImpl: () => [[]]
    });
    const clock = { p95For: () => 800 };

    // Act
    const res = await calibration.runCalibration({
      clock, ollamaClient: client, probe: alwaysReachable, projectPath: dir, force: true
    });

    // Assert — length-0 vector is rejected, fallback dimension retained.
    assert.strictEqual(res.dimension, inprocess.DIMENSION);
    assert.strictEqual(res.backend, 'ollama');
  } finally {
    rmDir(dir);
  }
});

// ── Cluster F2: real-clock micro-benchmark loop drives p95 (lines 83-88) ──────

test('runCalibration_computes_p95_from_the_micro_benchmark_samples_via_injected_now', async () => {
  const dir = tmpDir();
  try {
    // Arrange — no p95For, so measureP95 runs the real BENCH_SAMPLES loop and
    // times each encode via now(). Script now() so the 5 sampled latencies are
    // [1,2,3,4,100]; p95 of n=5 → sorted[ceil(4.75)-1]=sorted[4]=100.
    const ticks = [0, 1, 0, 2, 0, 3, 0, 4, 0, 100];
    let i = 0;
    const clock = { now: () => ticks[i++] };
    const client = makeFakeOllama({ models: ['all-minilm'] });

    // Act
    const res = await calibration.runCalibration({
      clock, ollamaClient: client, probe: alwaysReachable, projectPath: dir, force: true
    });

    // Assert — measured p95 is the benchmarked 100ms (within budget → pinned).
    assert.strictEqual(res.model, 'all-minilm');
    assert.strictEqual(res.measuredP95ms, 100);
  } finally {
    rmDir(dir);
  }
});

// ── Cluster G: idempotent re-calibration vs force override (lines 141-144) ─────

test('runCalibration_reuses_existing_calibration_without_rebenchmarking', async () => {
  const dir = tmpDir();
  try {
    // Arrange — first run pins mxbai (the only present candidate).
    const firstClient = makeFakeOllama({ models: ['mxbai-embed-large'] });
    const clock = { p95For: () => 800 };
    const first = await calibration.runCalibration({
      clock, ollamaClient: firstClient, probe: alwaysReachable, projectPath: dir, force: true
    });
    assert.strictEqual(first.model, 'mxbai-embed-large');

    // Act — a SECOND run (no force) with a client that WOULD pick all-minilm.
    const secondClient = makeFakeOllama({ models: ['all-minilm'] });
    const second = await calibration.runCalibration({
      clock, ollamaClient: secondClient, probe: alwaysReachable, projectPath: dir
    });

    // Assert — returns the persisted mxbai and never touched the second client.
    assert.strictEqual(second.model, 'mxbai-embed-large');
    assert.strictEqual(secondClient.calls.listModels, 0);
  } finally {
    rmDir(dir);
  }
});

test('runCalibration_force_rebenchmarks_and_overwrites_existing_calibration', async () => {
  const dir = tmpDir();
  try {
    // Arrange — persist a prior mxbai calibration.
    const clock = { p95For: () => 800 };
    await calibration.runCalibration({
      clock, ollamaClient: makeFakeOllama({ models: ['mxbai-embed-large'] }),
      probe: alwaysReachable, projectPath: dir, force: true
    });

    // Act — force:true must re-run selection against a different client.
    const forcedClient = makeFakeOllama({ models: ['all-minilm'] });
    const forced = await calibration.runCalibration({
      clock, ollamaClient: forcedClient, probe: alwaysReachable, projectPath: dir, force: true
    });

    // Assert — new selection wins and is persisted; the client WAS consulted.
    assert.strictEqual(forced.model, 'all-minilm');
    assert.strictEqual(forcedClient.calls.listModels, 1);
    assert.strictEqual(readPersisted(dir).model, 'all-minilm');
  } finally {
    rmDir(dir);
  }
});

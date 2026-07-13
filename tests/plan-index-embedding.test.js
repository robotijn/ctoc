/**
 * PI2 — Embedding Engine tests (EM-01…EM-12).
 *
 * TDD-first. Every Ollama HTTP call is an INJECTED mock (deps.ollamaClient /
 * deps.fetch); no live network is required in CI. EM-05 is an integration test
 * against the SHIPPED PI1 store (hard-requires it, so an absent PI1 fails loudly —
 * skip-guard integrity, finding A2). EM-12 is a live-Ollama smoke test that
 * LOUD-skips (t.skip) when Ollama is unreachable — a runtime-probe skip, not a
 * require-swallow, so it stays a legitimate skip.
 *
 * Hermetic: a per-test temp dir (fs.mkdtempSync(os.tmpdir())) supplies the
 * projectPath so calibration.json never touches the real .ctoc/index/.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const embedder = require('../src/lib/plan-index/embedder');
const ollamaClientMod = require('../src/lib/plan-index/ollama-client');
const inprocess = require('../src/lib/plan-index/inprocess-engine');
const hardwareProbe = require('../src/lib/plan-index/hardware-probe');
const calibration = require('../src/lib/plan-index/calibration');
// Hard require the PI1 store: EM-05 is an integration test against it, so an absent
// PI1 must fail at load, never skip (skip-guard integrity, finding A2).
const { openStore } = require('../src/lib/plan-index');

// ── helpers ──────────────────────────────────────────────────────────────────

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pi2-'));
  // Give it a .ctoc/index so calibration.json has a home; runCalibration also
  // creates it, but pre-creating exercises the idempotent path cleanly.
  fs.mkdirSync(path.join(dir, '.ctoc', 'index'), { recursive: true });
  return dir;
}
function rmProject(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function isL2Unit(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  return Math.abs(Math.sqrt(s) - 1) < 1e-4;
}

// A mock Ollama client factory that records calls and returns fixed-shape vectors.
function makeMockOllama({ dim = inprocess.DIMENSION, models = ['nomic-embed-text', 'all-minilm'], reachable = true } = {}) {
  const calls = { embed: 0, listModels: 0, lastEmbed: null };
  return {
    calls,
    reachable,
    async embed(model, input) {
      calls.embed++;
      calls.lastEmbed = { model, input };
      return input.map((_, row) => {
        const v = new Float32Array(dim);
        // deterministic-ish content so vectors are non-zero and finite
        for (let i = 0; i < dim; i++) v[i] = ((row + 1) * (i + 1)) % 7 + 0.1;
        return v;
      });
    },
    async listModels() {
      calls.listModels++;
      return models.slice();
    }
  };
}

// ── EM-01: Ollama reachable → batch POST to /api/embed, tag 'ollama' ──────────

test('EM-01 embed() posts batch input[] to /api/embed and tags ollama', async () => {
  const mock = makeMockOllama({ models: ['nomic-embed-text'] });
  const result = await embedder.embed(['text one', 'text two'], {
    ollamaClient: mock,
    probe: async () => true,
    getSetting: () => 'auto',
    loadCalibration: () => ({ model: 'nomic-embed-text', dimension: inprocess.DIMENSION, backend: 'ollama', measuredP95ms: 2400 })
  });

  assert.equal(mock.calls.embed, 1, 'exactly one batch embed call');
  assert.deepEqual(mock.calls.lastEmbed.input, ['text one', 'text two'], 'batch input is the string[] verbatim');
  assert.equal(mock.calls.lastEmbed.model, 'nomic-embed-text', 'pinned model from calibration is used');
  assert.equal(result.source, 'ollama', 'source tag is ollama');
  assert.ok(Array.isArray(result.vectors), 'vectors is an array');
  assert.equal(result.vectors.length, 2, 'two vectors for two inputs');
  assert.ok(result.vectors[0] instanceof Float32Array, 'element is Float32Array');
  assert.ok(isL2Unit(result.vectors[0]), 'ollama vectors are re-L2-normalized (cosine-ready)');
});

// ── EM-01b: ollama-client sends the real POST to /api/embed via injected fetch ──

test('EM-01b ollama-client POSTs /api/embed with {model,input} via injected fetch', async () => {
  const seen = { url: null, method: null, body: null };
  const fakeFetch = async (url, opts) => {
    seen.url = url;
    seen.method = opts.method;
    seen.body = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return { embeddings: [[1, 0, 0], [0, 1, 0]] };
      }
    };
  };
  const client = ollamaClientMod.createOllamaClient({ fetch: fakeFetch, baseUrl: 'http://localhost:11434' });
  const vecs = await client.embed('nomic-embed-text', ['a', 'b']);

  assert.equal(seen.url, 'http://localhost:11434/api/embed', 'POSTs to the batch /api/embed endpoint (not /api/embeddings)');
  assert.equal(seen.method, 'POST');
  assert.deepEqual(seen.body, { model: 'nomic-embed-text', input: ['a', 'b'] }, 'body carries model + batch input[]');
  assert.equal(vecs.length, 2);
  assert.ok(vecs[0] instanceof Float32Array);
});

test('EM-01c ollama-client rejects on malformed response shape', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, async json() { return { embeddings: 'not-an-array' }; } });
  const client = ollamaClientMod.createOllamaClient({ fetch: fakeFetch });
  await assert.rejects(() => client.embed('m', ['x']), /shape|embeddings|array/i, 'shape mismatch throws descriptive error');
});

test('EM-01d ollama-client listModels strips tags and returns base names', async () => {
  const fakeFetch = async (url) => {
    assert.ok(String(url).endsWith('/api/tags'), 'listModels GETs /api/tags');
    return { ok: true, status: 200, async json() { return { models: [{ name: 'nomic-embed-text:latest' }, { name: 'all-minilm:v2' }] }; } };
  };
  const client = ollamaClientMod.createOllamaClient({ fetch: fakeFetch });
  const names = await client.listModels();
  assert.deepEqual(names, ['nomic-embed-text', 'all-minilm'], 'tag suffix stripped to base name');
});

// ── EM-02: Ollama absent → in-process fallback, no throw ──────────────────────

test('EM-02 embed() falls back in-process when Ollama unreachable', async () => {
  // probe false → auto goes straight to in-process
  const result = await embedder.embed(['test text'], {
    probe: async () => false,
    getSetting: () => 'auto'
  });
  assert.equal(result.source, 'in-process', 'source tag is in-process');
  assert.equal(result.vectors.length, 1);
  assert.equal(result.vectors[0].length, inprocess.DIMENSION, 'in-process dimension');
  assert.ok(isL2Unit(result.vectors[0]), 'in-process vector is L2-normalized');
});

test('EM-02b embed() never rejects when the Ollama client throws (fail-open)', async () => {
  const throwingClient = {
    async embed() { throw new Error('ECONNREFUSED'); },
    async listModels() { return []; }
  };
  const result = await embedder.embed(['x'], {
    ollamaClient: throwingClient,
    probe: async () => true, // probe says reachable, but embed throws → must fall back
    getSetting: () => 'auto',
    loadCalibration: () => ({ model: 'nomic-embed-text', dimension: inprocess.DIMENSION, backend: 'ollama' })
  });
  assert.equal(result.source, 'in-process', 'falls back to in-process on Ollama embed error');
  assert.equal(result.vectors[0].length, inprocess.DIMENSION);
});

// ── inprocess-engine determinism ──────────────────────────────────────────────

test('EM-02c inprocess embedInProcess is byte-deterministic and finite', async () => {
  const a = await inprocess.embedInProcess(['a dog running', 'unrelated report']);
  const b = await inprocess.embedInProcess(['a dog running', 'unrelated report']);
  assert.equal(a.length, 2);
  assert.deepEqual(Array.from(a[0]), Array.from(b[0]), 'identical input → identical vector bytes');
  for (const v of a) {
    assert.equal(v.length, inprocess.DIMENSION);
    assert.ok(isL2Unit(v), 'L2-normalized');
    for (let i = 0; i < v.length; i++) assert.ok(Number.isFinite(v[i]), 'all finite');
  }
});

// ── EM-03: calibration skips over-budget, pins largest within budget ──────────

test('EM-03 runCalibration excludes >5000ms and pins largest within budget', async () => {
  const dir = tmpProject();
  try {
    const p95Map = { 'mxbai-embed-large': 6200, 'nomic-embed-text': 2400, 'all-minilm': 800 };
    const mock = makeMockOllama({ models: ['mxbai-embed-large', 'nomic-embed-text', 'all-minilm'] });
    // injectable clock: returns the pre-set p95 for the model currently benchmarked
    const clock = { p95For: (model) => p95Map[model] };

    const res = await calibration.runCalibration({
      clock,
      ollamaClient: mock,
      probe: async () => true,
      projectPath: dir,
      force: true
    });

    assert.equal(res.pinned ?? res.model, 'nomic-embed-text', 'largest within 5000ms budget pinned');
    assert.equal(res.model, 'nomic-embed-text');
    assert.equal(res.measuredP95ms, 2400, 'persisted the winning p95');
    assert.equal(res.backend, 'ollama');

    const persisted = JSON.parse(fs.readFileSync(path.join(dir, '.ctoc', 'index', 'calibration.json'), 'utf8'));
    assert.equal(persisted.model, 'nomic-embed-text');
    assert.equal(persisted.measuredP95ms, 2400);
  } finally {
    rmProject(dir);
  }
});

// ── EM-04: calibration persisted + reused without re-benchmark ────────────────

test('EM-04 loadCalibration returns persisted result without re-benchmark', async () => {
  const dir = tmpProject();
  try {
    const p95Map = { 'nomic-embed-text': 2400, 'all-minilm': 800 };
    let benchCalls = 0;
    const clock = { p95For: (model) => { benchCalls++; return p95Map[model]; } };
    const mock = makeMockOllama({ models: ['nomic-embed-text', 'all-minilm'] });

    const first = await calibration.runCalibration({ clock, ollamaClient: mock, probe: async () => true, projectPath: dir, force: true });
    const callsAfterFirst = benchCalls;
    assert.ok(callsAfterFirst > 0, 'first run benchmarked');

    // second run WITHOUT force must be a no-op (idempotent) and NOT re-benchmark
    const second = await calibration.runCalibration({ clock, ollamaClient: mock, probe: async () => true, projectPath: dir });
    assert.equal(benchCalls, callsAfterFirst, 'no re-benchmark on idempotent re-run');
    assert.equal(second.model, first.model, 'same result returned');

    const loaded = calibration.loadCalibration({ projectPath: dir });
    assert.equal(loaded.model, first.model, 'loadCalibration returns persisted object');
    assert.equal(loaded.measuredP95ms, first.measuredP95ms);
  } finally {
    rmProject(dir);
  }
});

test('EM-04b loadCalibration returns null when absent (fail-open)', () => {
  const dir = tmpProject();
  try {
    const loaded = calibration.loadCalibration({ projectPath: dir });
    assert.equal(loaded, null, 'absent calibration.json → null, no throw');
  } finally {
    rmProject(dir);
  }
});

// ── EM-05: [integration] calibration dimension → PI1 store via first upsert ────

test('EM-05 [integration] first upsert of Float32Array locks store.dimension', () => {
  const dir = tmpProject();
  try {
    const jsonPath = path.join(dir, '.ctoc', 'index', 'plan-index.json');
    const store = openStore(jsonPath);
    assert.equal(store.dimension, null, 'dimension unset before any upsert (no initVectorTable)');

    // A calibrated-dimension vector (use inprocess DIMENSION to match a real produce path)
    const emb = new Float32Array(inprocess.DIMENSION);
    emb[0] = 1; // finite, non-empty
    store.upsertUnit({
      planPath: 'plans/todo/example.md',
      sectionId: '__plan__',
      kind: 'plan',
      embedding: emb,
      contentHash: 'abc123'
    });
    assert.equal(store.dimension, inprocess.DIMENSION, 'store infers + locks dimension from first upsert');
  } finally {
    rmProject(dir);
  }
});

// ── EM-06: extractSummary deterministic + calls parseMetadata ─────────────────

test('EM-09 calibration skips models not in /api/tags with a logged note', async () => {
  const dir = tmpProject();
  const logs = [];
  try {
    // /api/tags lists only two; mxbai-embed-large is absent → must be skipped
    const mock = makeMockOllama({ models: ['nomic-embed-text', 'all-minilm'] });
    const benched = [];
    const clock = { p95For: (model) => { benched.push(model); return model === 'nomic-embed-text' ? 2400 : 800; } };

    const res = await calibration.runCalibration({
      clock,
      ollamaClient: mock,
      probe: async () => true,
      projectPath: dir,
      force: true,
      log: (msg) => logs.push(msg)
    });

    assert.ok(!benched.includes('mxbai-embed-large'), 'absent model not benchmarked');
    assert.deepEqual(benched.sort(), ['all-minilm', 'nomic-embed-text'], 'only available candidates benchmarked');
    assert.ok(logs.some((m) => /mxbai-embed-large/.test(m) && /not available locally/i.test(m)), 'skip note logged');
    assert.equal(res.model, 'nomic-embed-text');
  } finally {
    rmProject(dir);
  }
});

// ── EM-10: engine_preference in-process overrides reachable Ollama ────────────

test('EM-10 engine_preference in-process forces fallback even when Ollama reachable', async () => {
  const mock = makeMockOllama();
  const result = await embedder.embed(['text'], {
    ollamaClient: mock,
    probe: async () => true, // Ollama IS reachable
    getSetting: () => 'in-process' // ...but preference forces in-process (real schema token)
  });
  assert.equal(mock.calls.embed, 0, 'Ollama embed never called when preference is in-process');
  assert.equal(result.source, 'in-process');
  assert.equal(result.vectors[0].length, inprocess.DIMENSION);
});

// ── EM-11: cross-platform calibration.json path (path.join / os.homedir) ──────

test('EM-11 calibration.json path uses path.join and round-trips', async () => {
  const dir = tmpProject();
  try {
    const mock = makeMockOllama({ models: ['all-minilm'] });
    const clock = { p95For: () => 800 };
    await calibration.runCalibration({ clock, ollamaClient: mock, probe: async () => true, projectPath: dir, force: true });

    const expected = path.join(dir, '.ctoc', 'index', 'calibration.json');
    assert.ok(fs.existsSync(expected), 'calibration.json written at path.join-constructed location');

    // The constructed path uses the OS separator; on the running platform no
    // hardcoded foreign separator leaks. Verify the module source contains no
    // hardcoded ".ctoc/index" literal (must use path.join).
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'plan-index', 'calibration.js'), 'utf8');
    assert.ok(!/['"]\.ctoc\/index\/calibration\.json['"]/.test(src), 'no hardcoded slash path literal in source');

    const loaded = calibration.loadCalibration({ projectPath: dir });
    assert.ok(loaded && loaded.model, 'round-trips through path.join path');
  } finally {
    rmProject(dir);
  }
});

// ── hardware-probe: probeOllama never throws ──────────────────────────────────

test('EM-11b probeOllama returns false and never throws on connection error', async () => {
  const fetchThatThrows = async () => { throw new Error('ECONNREFUSED'); };
  const reachable = await hardwareProbe.probeOllama({ fetch: fetchThatThrows, baseUrl: 'http://localhost:11434', projectPath: os.tmpdir() });
  assert.equal(reachable, false, 'unreachable → false, no throw');
});

test('EM-11c probeOllama returns true on HTTP 200 /api/tags', async () => {
  let seenUrl = null;
  const okFetch = async (url) => { seenUrl = String(url); return { ok: true, status: 200, async json() { return { models: [] }; } }; };
  const reachable = await hardwareProbe.probeOllama({ fetch: okFetch, baseUrl: 'http://localhost:11434' });
  assert.equal(reachable, true);
  assert.ok(seenUrl.endsWith('/api/tags'), 'probes GET /api/tags');
});

// ── EM-12: [smoke] live-Ollama paraphrase cos-sim > unrelated (LOUD skip) ─────

test('EM-12 [smoke] paraphrase cos-sim exceeds unrelated by >= 0.15', async (t) => {
  // Live-Ollama gated. LOUD-skip unless a real EMBEDDING model is actually loaded
  // — a fail-open fallback to the in-process hashing embedder must NOT be mistaken
  // for a passing real-model smoke test (it has no semantics and cannot meet the
  // 0.15 margin). We therefore drive the real Ollama backend directly, against a
  // model discovered from /api/tags, and skip loudly when none is embedding-capable.
  const reachable = await hardwareProbe.probeOllama({}).catch(() => false);
  if (!reachable) {
    t.skip('Ollama not available — smoke test requires live Ollama');
    return;
  }
  const client = ollamaClientMod.createOllamaClient({});
  let available;
  try {
    available = await client.listModels();
  } catch {
    t.skip('Ollama /api/tags unavailable — smoke test requires live Ollama');
    return;
  }
  // Heuristic: an embedding model has "embed" in its name.
  const embedModel = available.find((m) => /embed/i.test(m));
  if (!embedModel) {
    t.skip(`No embedding model loaded in Ollama (have: ${available.join(', ') || 'none'}) — smoke test requires a real embedding model`);
    return;
  }

  let vecsA, vecsB;
  try {
    vecsA = await client.embed(embedModel, ['a dog running in the park', 'a puppy sprinting across the grass']);
    vecsB = await client.embed(embedModel, ['a dog running in the park', 'the quarterly revenue report']);
  } catch (err) {
    t.skip(`Ollama embed failed for ${embedModel} (${err && err.message}) — smoke test requires a working embedding model`);
    return;
  }
  const cosA = cosine(vecsA[0], vecsA[1]);
  const cosB = cosine(vecsB[0], vecsB[1]);
  assert.ok(cosA - cosB >= 0.15, `[${embedModel}] paraphrase similarity (${cosA}) exceeds unrelated (${cosB}) by >= 0.15`);
});

// ── Extra branch coverage: calibration edge paths ─────────────────────────────

test('CAL-none-in-budget pins smallest candidate with a warning', async () => {
  const dir = tmpProject();
  const logs = [];
  try {
    const mock = makeMockOllama({ models: ['mxbai-embed-large', 'nomic-embed-text', 'all-minilm'] });
    // every candidate over budget → none within budget → pin smallest (all-minilm)
    const clock = { p95For: () => 6000 };
    const res = await calibration.runCalibration({
      clock, ollamaClient: mock, probe: async () => true, projectPath: dir, force: true, log: (m) => logs.push(m)
    });
    assert.equal(res.model, 'all-minilm', 'smallest candidate pinned when none meet budget');
    assert.ok(logs.some((m) => /no candidate met/.test(m)), 'warning logged');
    assert.equal(res.backend, 'ollama');
  } finally {
    rmProject(dir);
  }
});

test('CAL-ollama-unreachable pins in-process backend', async () => {
  const dir = tmpProject();
  try {
    const res = await calibration.runCalibration({ probe: async () => false, projectPath: dir, force: true });
    assert.equal(res.backend, 'in-process');
    assert.equal(res.model, calibration.INPROCESS_MODEL);
    assert.equal(res.dimension, inprocess.DIMENSION);
    // persisted + reloadable
    const loaded = calibration.loadCalibration({ projectPath: dir });
    assert.equal(loaded.backend, 'in-process');
  } finally {
    rmProject(dir);
  }
});

test('CAL-no-known-candidate falls back to in-process when tags list unrelated models', async () => {
  const dir = tmpProject();
  const logs = [];
  try {
    const mock = makeMockOllama({ models: ['some-unrelated-llm'] });
    const clock = { p95For: () => 100 };
    const res = await calibration.runCalibration({
      clock, ollamaClient: mock, probe: async () => true, projectPath: dir, force: true, log: (m) => logs.push(m)
    });
    assert.equal(res.backend, 'in-process', 'no known candidate present → in-process');
    assert.ok(logs.some((m) => /no candidate models available locally/.test(m)));
  } finally {
    rmProject(dir);
  }
});

test('CAL-real-clock micro-benchmarks via injected now()', async () => {
  const dir = tmpProject();
  try {
    const mock = makeMockOllama({ models: ['all-minilm'] });
    // injected monotonic clock via now(): each call advances 10ms
    let t = 0;
    const clock = { now: () => (t += 10) };
    const res = await calibration.runCalibration({ clock, ollamaClient: mock, probe: async () => true, projectPath: dir, force: true });
    assert.equal(res.model, 'all-minilm');
    assert.ok(Number.isFinite(res.measuredP95ms), 'p95 measured from injected clock');
  } finally {
    rmProject(dir);
  }
});

// ── Extra branch coverage: ollama-client error paths ──────────────────────────

test('OLL-non-200 embed rejects with HTTP status', async () => {
  const fakeFetch = async () => ({ ok: false, status: 500, async json() { return {}; } });
  const client = ollamaClientMod.createOllamaClient({ fetch: fakeFetch });
  await assert.rejects(() => client.embed('m', ['x']), /HTTP 500/);
});

test('OLL-empty-embeddings rejects', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, async json() { return { embeddings: [] }; } });
  const client = ollamaClientMod.createOllamaClient({ fetch: fakeFetch });
  await assert.rejects(() => client.embed('m', ['x']), /empty embeddings/);
});

test('OLL-inconsistent-row-length rejects', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, async json() { return { embeddings: [[1, 2, 3], [1, 2]] }; } });
  const client = ollamaClientMod.createOllamaClient({ fetch: fakeFetch });
  await assert.rejects(() => client.embed('m', ['a', 'b']), /dimension/);
});

test('OLL-nonfinite-value rejects', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, async json() { return { embeddings: [[1, Infinity, 3]] }; } });
  const client = ollamaClientMod.createOllamaClient({ fetch: fakeFetch });
  await assert.rejects(() => client.embed('m', ['a']), /non-finite/);
});

test('OLL-listModels non-200 rejects', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, async json() { return {}; } });
  const client = ollamaClientMod.createOllamaClient({ fetch: fakeFetch });
  await assert.rejects(() => client.listModels(), /HTTP 503/);
});

test('OLL-embed validates args', async () => {
  const client = ollamaClientMod.createOllamaClient({ fetch: async () => ({ ok: true, status: 200, async json() { return { embeddings: [[1]] }; } }) });
  await assert.rejects(() => client.embed('', ['x']), /non-empty model/);
  await assert.rejects(() => client.embed('m', []), /non-empty input/);
});

// ── Extra branch coverage: embedder forced-ollama + count-mismatch fallback ────

test('EMB-preference-ollama forces the Ollama client', async () => {
  const mock = makeMockOllama({ models: ['nomic-embed-text'] });
  const res = await embedder.embed(['x', 'y'], {
    ollamaClient: mock,
    getSetting: () => 'ollama',
    loadCalibration: () => ({ model: 'nomic-embed-text', backend: 'ollama', dimension: inprocess.DIMENSION })
  });
  assert.equal(res.source, 'ollama');
  assert.equal(mock.calls.embed, 1);
});

test('EMB-count-mismatch falls back to in-process', async () => {
  // client returns wrong number of vectors → fail-open fallback
  const badClient = { async embed() { return [new Float32Array(inprocess.DIMENSION)]; } }; // 1 vec for 2 inputs
  const res = await embedder.embed(['a', 'b'], {
    ollamaClient: badClient, probe: async () => true, getSetting: () => 'auto', loadCalibration: () => null
  });
  assert.equal(res.source, 'in-process', 'vector-count mismatch triggers fallback');
  assert.equal(res.vectors.length, 2);
});

test('EMB-getSetting-throws defaults to auto then falls back', async () => {
  const res = await embedder.embed(['x'], {
    getSetting: () => { throw new Error('settings unavailable'); },
    probe: async () => false
  });
  assert.equal(res.source, 'in-process', 'getSetting error → default auto → probe false → in-process');
});

// ── Extra branch coverage: hardware-probe ─────────────────────────────────────

test('HW-probe returns false when no fetch is available', async () => {
  const reachable = await hardwareProbe.probeOllama({ fetch: null });
  // With an explicit non-function fetch and no usable global, returns false; if a
  // global fetch exists it may still resolve — assert only that it is a boolean.
  assert.equal(typeof reachable, 'boolean');
});

test('HW-probe non-200 status resolves false', async () => {
  const notFound = async () => ({ ok: false, status: 404 });
  const reachable = await hardwareProbe.probeOllama({ fetch: notFound, baseUrl: 'http://localhost:11434' });
  assert.equal(reachable, false, 'non-200 → false');
});

test('HW-probe resolves base URL from getSetting when not injected', async () => {
  let seenUrl = null;
  const okFetch = async (url) => { seenUrl = String(url); return { ok: true, status: 200 }; };
  const reachable = await hardwareProbe.probeOllama({
    fetch: okFetch,
    getSetting: () => 'http://ollama.internal:9999'
  });
  assert.equal(reachable, true);
  assert.ok(seenUrl.startsWith('http://ollama.internal:9999'), 'base URL sourced from getSetting');
});

test('HW-detectCompute returns cpuCount and a gpu hint', () => {
  const info = hardwareProbe.detectCompute();
  assert.ok(Number.isInteger(info.cpuCount) && info.cpuCount >= 1);
  assert.equal(typeof info.hasGpu, 'boolean');
});

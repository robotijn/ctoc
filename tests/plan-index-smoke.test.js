'use strict';

/**
 * PI0 — Runtime composition-root smoke tests.
 *
 * Proves the pure-JS retrieval stack end-to-end (zero native binaries, zero
 * network) and the `getWiring()` contract both dormant consumers hard-require
 * (`actions.movePlan` and `PostToolUse.plan-index-sync`). Every test is HERMETIC:
 * the Ollama probe and PI2 `embed` are injected at the wiring `deps` seam, so no
 * live network and no real embedding backend run.
 *
 * Maps the PI0 blueprint's `tests/plan-index-smoke.test.js` cases 1–7.
 */

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { openStore } = require('../src/lib/plan-index');
const wiring = require('../src/lib/plan-index/wiring');
const { getWiring, probeEmbeddingSource } = wiring;

const DIM = 8;

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-idx-smoke-'));
}
function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// A hermetic PI2 `embed` stub: returns the { vectors, source } shape PI2's real
// embed returns, so the wiring adapter's unwrap is exercised for real.
function makeEmbedStub(source = 'in-process', fill = 0.5) {
  return async (texts) => {
    const list = Array.isArray(texts) ? texts : [texts];
    return { vectors: list.map(() => new Float32Array(DIM).fill(fill)), source };
  };
}

test.afterEach(() => { try { getWiring.__reset && getWiring.__reset(); } catch { /* */ } });

// ── Case 1: pure-JS retrieval end-to-end (the committed smoke AC) ─────────────
test('smoke #1: openStore + upsert + brute-force cosine search (no native, no network)', () => {
  const dir = mkTmp();
  try {
    const store = openStore(path.join(dir, '.ctoc', 'index', 'plan-index.json'));
    store.upsertUnit({
      planPath: 'plans/todo/a.md', sectionId: '__plan__', kind: 'plan',
      text: 'a', embedding: new Float32Array([1, 0]), contentHash: 'ha'
    });
    store.upsertUnit({
      planPath: 'plans/todo/b.md', sectionId: '__plan__', kind: 'plan',
      text: 'b', embedding: new Float32Array([0, 1]), contentHash: 'hb'
    });
    const results = store.search(new Float32Array([1, 0]), 2);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].planPath, 'plans/todo/a.md');
    assert.ok(results[0].score > 0.99, `expected ~1 cosine, got ${results[0].score}`);
    assert.ok(results[0].score >= results[1].score);
  } finally { rmTmp(dir); }
});

// ── Case 2: getWiring() contract shape (what both consumers hard-require) ──────
test('smoke #2: getWiring() returns the exact shape movePlan + the hook require', () => {
  const dir = mkTmp();
  try {
    const w = getWiring({ projectPath: dir });
    assert.ok(w && typeof w === 'object');
    assert.strictEqual(typeof w.store.moveUnit, 'function', 'movePlan needs store.moveUnit');
    assert.strictEqual(typeof w.embedder, 'function', 'the hook needs a function embedder');
    assert.strictEqual(typeof w.calibrationReady, 'function');
    assert.strictEqual(typeof w.isIndexAvailable, 'function');
    assert.strictEqual(typeof w.degradedReason, 'function');
    assert.strictEqual(w.projectPath, path.resolve(dir));
  } finally { rmTmp(dir); }
});

// ── Case 3: getWiring() is a cached singleton keyed on projectPath + __reset ───
test('smoke #3: getWiring() caches per projectPath; __reset() yields a fresh store', () => {
  const dir = mkTmp();
  try {
    const a = getWiring({ projectPath: dir });
    const b = getWiring({ projectPath: dir });
    assert.strictEqual(a.store, b.store, 'same projectPath → cached same store');
    assert.strictEqual(typeof getWiring.__reset, 'function');
    // __reset must be non-enumerable (a testing seam, not part of the public API).
    assert.ok(!Object.keys(getWiring).includes('__reset'), '__reset must be non-enumerable');
    getWiring.__reset();
    const c = getWiring({ projectPath: dir });
    assert.notStrictEqual(a.store, c.store, '__reset → fresh construction');
  } finally { rmTmp(dir); }
});

// ── Case 4: capability gate — Ollama PRESENT → source 'ollama' ────────────────
test('smoke #4: probeEmbeddingSource with Ollama reachable → { available, source:ollama }', async () => {
  const dir = mkTmp();
  try {
    const r = await probeEmbeddingSource({ projectPath: dir, probe: async () => true });
    assert.strictEqual(r.available, true);
    assert.strictEqual(r.source, 'ollama');
    const w = getWiring({ projectPath: dir });
    assert.strictEqual(w.isIndexAvailable(), true, 'store present → available');
  } finally { rmTmp(dir); }
});

// ── Case 5: capability gate — Ollama ABSENT → in-process, store still available ─
test('smoke #5: Ollama absent → source in-process; store STILL available; not store-unavailable', async () => {
  const dir = mkTmp();
  try {
    const r = await probeEmbeddingSource({ projectPath: dir, probe: async () => false });
    assert.strictEqual(r.available, true, 'in-process fallback keeps availability true');
    assert.strictEqual(r.source, 'in-process');
    const w = getWiring({ projectPath: dir });
    assert.ok(w.store, 'the store never gates availability (opens on every Node)');
    assert.strictEqual(w.isIndexAvailable(), true);
    assert.notStrictEqual(w.degradedReason(), 'store-unavailable');
  } finally { rmTmp(dir); }
});

// ── Case 6: fail-open — store construction failure → safe no-op wiring ─────────
test('smoke #6: openStore throwing → getWiring does NOT throw; safe no-op wiring', async () => {
  const dir = mkTmp();
  try {
    let w;
    assert.doesNotThrow(() => {
      w = getWiring({
        projectPath: dir,
        openStore: () => { throw new Error('boom'); }
      });
    });
    assert.strictEqual(w.store, null);
    assert.strictEqual(w.isIndexAvailable(), false);
    assert.strictEqual(w.degradedReason(), 'store-unavailable');
    // embedder must resolve { vectors: [] } — NEVER reject — even in the failed wiring.
    const out = await w.embedder(['x']);
    assert.ok(out && Array.isArray(out.vectors));
    assert.strictEqual(out.vectors.length, 0);
  } finally { rmTmp(dir); }
});

// ── Case 7: embedder adapter unwraps to the one-arg { vectors } shape ──────────
test('smoke #7: embedder is a bare one-arg adapter returning { vectors:[Float32Array] }', async () => {
  const dir = mkTmp();
  try {
    const w = getWiring({ projectPath: dir, embed: makeEmbedStub('in-process') });
    const out = await w.embedder(['hello']);
    assert.ok(out && Array.isArray(out.vectors), 'returns an object with a vectors array');
    assert.ok(out.vectors[0] instanceof Float32Array, 'vectors[0] is a Float32Array');
    assert.strictEqual(out.vectors[0].length, DIM);
    // reconcile/sync call embedder([text]) with ONE arg — assert arity is 1.
    assert.strictEqual(w.embedder.length, 1, 'embedder must be a one-arg function');
  } finally { rmTmp(dir); }
});

// ── Seam-go-live: the movePlan guard resolves wiring (not null) once wiring.js exists ─
test('smoke #8: loadPlanIndexWiring-equivalent resolves a live wiring (seam is LIVE)', () => {
  const dir = mkTmp();
  try {
    // Mirror actions.loadPlanIndexWiring exactly: require the seam, call getWiring(),
    // require w && w.store. This is the guard that was dormant until wiring.js existed.
    const seam = require('../src/lib/plan-index/wiring');
    assert.strictEqual(typeof seam.getWiring, 'function');
    const w = seam.getWiring({ projectPath: dir });
    assert.ok(w && w.store, 'the guard now resolves a non-null wiring with a store');
    // The hook's stricter predicate: w.store && typeof w.embedder === 'function'.
    assert.ok(w.store && typeof w.embedder === 'function', 'hook predicate satisfied');
  } finally { rmTmp(dir); }
});

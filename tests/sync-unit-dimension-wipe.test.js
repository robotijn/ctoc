'use strict';

/**
 * D1 (HIGH) regression: a single dimension-changing write through `syncUnit` must
 * NOT silently wipe the rest of the index.
 *
 * Root cause: `store.applyUpsert` performs a full reset (`units.clear()`) whenever an
 * upsert's vector length differs from the store's current `dimension` (AC15 — it
 * assumes the CALLER will rebuild). `syncUnit` sees only ONE plan, so after the reset
 * it can rebuild only that plan; every OTHER plan is gone permanently, and the wipe
 * leaves `store.size === 1`, so `isBackfillNeeded` (gated on size === 0) never fires.
 *
 * The transition that triggers it in production: the in-process embedder is 384-dim
 * and Ollama's nomic-embed-text is 768-dim. The first plan write after Ollama becomes
 * reachable (or unreachable) flips the dimension.
 *
 * Fix contract: syncUnit must leave the index CORRECT — every plan still present —
 * either by rebuilding the whole index (full reconcile) or by refusing the destructive
 * single upsert and flagging a backfill. Never a store reduced to the one plan written.
 *
 * The store + embedder are the true injected seam (in-memory fakes); the filesystem is
 * real (plans under os.tmpdir(), removed in finally).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { openStore } = require('../src/lib/plan-index/store');
const { reconcileIndex } = require('../src/lib/plan-index/reconcile');
const { syncUnit } = require('../src/lib/plan-index/sync-unit');

const calibrationReady = () => true;
const makeEmbedder = (dim) => {
  let calls = 0;
  const fn = async (texts) => {
    const arr = Array.isArray(texts) ? texts : [texts];
    calls += arr.length;
    return { vectors: arr.map(() => { const v = new Float32Array(dim); v[0] = 1; return v; }) };
  };
  fn.calls = () => calls;
  return fn;
};
const mk = (b) => `---\nfiles: []\nstatus: todo\n---\n${b}\n`;

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-syncwipe-')); }
function rmTmp(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }

test('syncUnit: a single dimension-changing write must NOT wipe the other plans (D1)', async () => {
  const root = mkTmp();
  try {
    const stageDir = path.join(root, 'plans', 'todo');
    fs.mkdirSync(stageDir, { recursive: true });
    for (const n of ['a', 'b', 'c']) fs.writeFileSync(path.join(stageDir, `${n}.md`), mk(`body ${n}`));
    const plansRoot = path.join(root, 'plans');
    const jsonPath = path.join(root, '.ctoc', 'index', 'plan-index.json');

    // Session 1: in-process 384-dim embedder. Index all three; persist to disk.
    let store = openStore(jsonPath);
    await reconcileIndex(plansRoot, { store, embedder: makeEmbedder(384), calibrationReady });
    assert.deepEqual(store.listPlanPaths().sort(), ['plans/todo/a.md', 'plans/todo/b.md', 'plans/todo/c.md']);
    assert.equal(store.dimension, 384);

    // Session 2: reopen persisted 384 index; Ollama now UP → 768. Edit ONE plan; the
    // PostToolUse hot path flows through syncUnit for JUST that plan.
    store = openStore(jsonPath);
    assert.equal(store.dimension, 384);
    fs.writeFileSync(path.join(stageDir, 'a.md'), mk('body a EDITED in session 2'));
    await syncUnit(path.join(stageDir, 'a.md'), { store, embedder: makeEmbedder(768), calibrationReady, plansRoot });

    const survivors = store.listPlanPaths().sort();
    assert.ok(survivors.includes('plans/todo/b.md'), 'b.md must survive a single unrelated dimension-changing write');
    assert.ok(survivors.includes('plans/todo/c.md'), 'c.md must survive a single unrelated dimension-changing write');
    assert.deepEqual(survivors, ['plans/todo/a.md', 'plans/todo/b.md', 'plans/todo/c.md']);

    // The index must be CORRECT: fully rebuilt at the new dimension.
    assert.equal(store.dimension, 768);
    for (const n of ['a', 'b', 'c']) {
      const u = store.getUnit(`plans/todo/${n}.md`, '__plan__');
      assert.ok(u && u.embedding.length === 768, `${n}.md must be re-embedded at the new 768 dimension`);
    }
  } finally {
    rmTmp(root);
  }
});

test('syncUnit: SAME-dimension unchanged unit still hash-skips (no wasteful re-embed) (D1 no-regression)', async () => {
  const root = mkTmp();
  try {
    const stageDir = path.join(root, 'plans', 'todo');
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(path.join(stageDir, 'a.md'), mk('body a'));
    const plansRoot = path.join(root, 'plans');
    const jsonPath = path.join(root, '.ctoc', 'index', 'plan-index.json');

    const store = openStore(jsonPath);
    await reconcileIndex(plansRoot, { store, embedder: makeEmbedder(384), calibrationReady });

    // Re-sync the SAME, unchanged plan at the SAME dimension → zero embeds, no change.
    const emb = makeEmbedder(384);
    const res = await syncUnit(path.join(stageDir, 'a.md'), { store, embedder: emb, calibrationReady, plansRoot });
    assert.equal(emb.calls(), 0, 'an unchanged plan at the same dimension must NOT be re-embedded');
    assert.deepEqual(res.changed, []);
    assert.equal(res.skipped, false);
    assert.equal(store.dimension, 384);
  } finally {
    rmTmp(root);
  }
});

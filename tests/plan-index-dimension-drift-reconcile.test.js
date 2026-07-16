'use strict';

/**
 * D1 (HIGH) + D2 (MEDIUM) regressions for `reconcileIndex`.
 *
 * D1 — dimension-change wipe: reconcile diffs each unit by content-hash and SKIPS the
 * unchanged ones. When the embedder's output dimension changes (in-process 384-dim →
 * Ollama 768-dim, or back), the first CHANGED unit's upsert trips `applyUpsert`'s AC15
 * full reset (`units.clear()`); the unchanged units were hash-skipped and are therefore
 * NEVER re-embedded — silently and permanently lost. reconcile SEES every plan, so it
 * CAN rebuild: on a detected dimension change it must treat every present unit as
 * changed and re-embed all of them, so the AC15 reset is followed by a full repopulate.
 *
 * D2 — stale-section drift: orphan removal only deletes units whose PLANPATH is gone
 * from disk. A section deleted from a still-present plan is never removed — re-hashing
 * `__plan__` re-embeds `__plan__`, it does not delete the orphaned `sec-*` unit. Phase 2
 * must diff each present plan's stored section ids against its freshly-parsed set and
 * delete the difference.
 *
 * The store + embedder are the true injected seam; the filesystem is real (os.tmpdir(),
 * cleaned in finally).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { openStore } = require('../src/lib/plan-index/store');
const { reconcileIndex } = require('../src/lib/plan-index/reconcile');

const calibrationReady = () => true;
function countingEmbedder(dim) {
  let calls = 0;
  const fn = async (texts) => {
    const arr = Array.isArray(texts) ? texts : [texts];
    calls += arr.length;
    return { vectors: arr.map(() => { const v = new Float32Array(dim); v[0] = 1; return v; }) };
  };
  fn.calls = () => calls;
  return fn;
}
const mk = (b) => `---\nfiles: []\nstatus: todo\n---\n${b}\n`;
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-dimdrift-')); }
function rmTmp(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }

test('reconcileIndex: a dimension change re-embeds ALL present plans, wiping none (D1)', async () => {
  const root = mkTmp();
  try {
    const stageDir = path.join(root, 'plans', 'todo');
    fs.mkdirSync(stageDir, { recursive: true });
    const planA = path.join(stageDir, 'a.md');
    const planB = path.join(stageDir, 'b.md');
    fs.writeFileSync(planA, mk('alpha body v1'));
    fs.writeFileSync(planB, mk('beta body stable'));
    const plansRoot = path.join(root, 'plans');
    const store = openStore(path.join(root, '.ctoc', 'index', 'plan-index.json'));

    // Run 1: 384-dim. Both plans indexed.
    await reconcileIndex(plansRoot, { store, embedder: countingEmbedder(384), calibrationReady });
    assert.equal(store.dimension, 384);
    assert.deepEqual(store.listPlanPaths().sort(), ['plans/todo/a.md', 'plans/todo/b.md']);

    // Between runs: edit ONLY plan A. Plan B content is unchanged (hash-skip candidate).
    fs.writeFileSync(planA, mk('alpha body v2 CHANGED'));

    // Run 2: dimension flips to 768. Plan B must be re-embedded, not wiped.
    await reconcileIndex(plansRoot, { store, embedder: countingEmbedder(768), calibrationReady });
    assert.equal(store.dimension, 768);
    const paths = store.listPlanPaths().sort();
    assert.ok(paths.includes('plans/todo/b.md'), 'plan B must NOT be silently wiped on a dimension change');
    assert.deepEqual(paths, ['plans/todo/a.md', 'plans/todo/b.md']);

    // Every stored unit is now at the new dimension (all re-embedded).
    const bUnit = store.getUnit('plans/todo/b.md', '__plan__');
    assert.ok(bUnit && bUnit.embedding.length === 768, 'plan B must be re-embedded at the new 768 dimension');
    const aUnit = store.getUnit('plans/todo/a.md', '__plan__');
    assert.ok(aUnit && aUnit.embedding.length === 768, 'plan A must be at the new 768 dimension');
  } finally {
    rmTmp(root);
  }
});

test('reconcileIndex: SAME-dimension, nothing changed → zero re-embeds (fast-path no-regression)', async () => {
  const root = mkTmp();
  try {
    const stageDir = path.join(root, 'plans', 'todo');
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(path.join(stageDir, 'a.md'), mk('alpha'));
    fs.writeFileSync(path.join(stageDir, 'b.md'), mk('beta'));
    const plansRoot = path.join(root, 'plans');
    const store = openStore(path.join(root, '.ctoc', 'index', 'plan-index.json'));

    await reconcileIndex(plansRoot, { store, embedder: countingEmbedder(384), calibrationReady });

    // Second sweep, nothing edited, same dimension → not a single unit re-embedded.
    const emb2 = countingEmbedder(384);
    await reconcileIndex(plansRoot, { store, embedder: emb2, calibrationReady });
    assert.equal(emb2.calls(), 0, 'no unit may be re-embedded when nothing changed at the same dimension');
    assert.deepEqual(store.listPlanPaths().sort(), ['plans/todo/a.md', 'plans/todo/b.md']);
  } finally {
    rmTmp(root);
  }
});

test('reconcileIndex: a section deleted from a still-present plan is removed from the index (D2)', async () => {
  const root = mkTmp();
  try {
    const stageDir = path.join(root, 'plans', 'todo');
    fs.mkdirSync(stageDir, { recursive: true });
    const planPath = path.join(stageDir, 'demo.md');
    fs.writeFileSync(planPath,
      '---\nfiles: []\nstatus: todo\n---\nBody intro.\n\n## Alpha section\nalpha text\n\n## Beta section\nbeta text\n');
    const plansRoot = path.join(root, 'plans');
    const store = openStore(path.join(root, '.ctoc', 'index', 'plan-index.json'));

    await reconcileIndex(plansRoot, { store, embedder: countingEmbedder(4), calibrationReady });
    assert.deepEqual(
      store.listUnitSectionIds('plans/todo/demo.md').sort(),
      ['__plan__', 'sec-1-alpha-section', 'sec-2-beta-section']
    );

    // Delete the "Beta section" — the plan file itself stays on disk.
    fs.writeFileSync(planPath,
      '---\nfiles: []\nstatus: todo\n---\nBody intro.\n\n## Alpha section\nalpha text\n');
    await reconcileIndex(plansRoot, { store, embedder: countingEmbedder(4), calibrationReady });

    const ids = store.listUnitSectionIds('plans/todo/demo.md').sort();
    assert.ok(!ids.some((s) => s.includes('beta')), 'the deleted beta section unit must be removed from the index');
    assert.deepEqual(ids, ['__plan__', 'sec-1-alpha-section'], 'only the plan-level unit and the surviving section remain');
  } finally {
    rmTmp(root);
  }
});

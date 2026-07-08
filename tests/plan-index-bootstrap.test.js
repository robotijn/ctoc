'use strict';

/**
 * PI0 — Bootstrap / first-run backfill tests.
 *
 * Proves the detached-child backfill orchestration WITHOUT ever spawning a real
 * child or touching the network: `spawn` is injected, the embedder is a stub, and
 * `reconcileIndex`/`runCalibration` are either the real (pure-JS) functions over a
 * tmp store or injected. FAIL-OPEN is the load-bearing invariant — a spawn error, a
 * reconcile rejection, or a corrupt status file must NEVER throw into the caller.
 *
 * Maps the PI0 blueprint's `tests/plan-index-bootstrap.test.js` cases 1–8.
 */

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { openStore } = require('../src/lib/plan-index');
const bootstrap = require('../src/lib/plan-index/bootstrap');
const { isBackfillNeeded, kickBackfillBackground, runBackfill } = bootstrap;
const { reconcileIndex } = require('../src/lib/plan-index/reconcile');
const overview = require('../src/tabs/overview');

const DIM = 8;

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-idx-boot-'));
}
function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
function statusPath(root) {
  return path.join(root, '.ctoc', 'index', 'build-status.json');
}
function lockPath(root) {
  return path.join(root, '.ctoc', 'index', '.build.lock');
}
function indexPath(root) {
  return path.join(root, '.ctoc', 'index', 'plan-index.json');
}

// Deterministic non-zero stub embedder: gives each text a distinct direction so
// search ordering is meaningful (a zero vector has no ranking). Returns the
// { vectors } shape reconcile unwraps.
function makeEmbedder() {
  let n = 0;
  const embedder = async (texts) => {
    const list = Array.isArray(texts) ? texts : [texts];
    return {
      vectors: list.map(() => {
        const v = new Float32Array(DIM);
        v[n % DIM] = 1;   // a unit vector along a rotating axis
        n++;
        return v;
      })
    };
  };
  return embedder;
}

// Write a minimal, parseable plan file (frontmatter + one `## ` section).
function writePlan(root, rel, title) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full,
    `---\ntitle: "${title}"\nstatus: todo\n---\n\n# ${title}\n\n## Overview\n\n${title} body text.\n`);
  return full;
}

test.afterEach(() => {
  try { const { getWiring } = require('../src/lib/plan-index/wiring'); getWiring.__reset && getWiring.__reset(); } catch { /* */ }
});

// ── Case 1: backfill populates the index over a tmp plans fixture ──────────────
test('bootstrap #1: runBackfill populates the store over an existing plans fixture', async () => {
  const root = mkTmp();
  try {
    writePlan(root, 'plans/todo/foo.md', 'Foo');
    writePlan(root, 'plans/done/bar.md', 'Bar');
    const store = openStore(indexPath(root));
    const embedder = makeEmbedder();

    const r = await runBackfill(root, {
      reconcileIndex,
      runCalibration: async () => ({ backend: 'in-process', model: 'all-MiniLM-L6-v2', dimension: DIM }),
      getWiring: () => ({ store, embedder, calibrationReady: () => true })
    });

    assert.ok(store.size > 0, 'index has units after backfill');
    const paths = store.listPlanPaths();
    assert.ok(paths.includes('plans/todo/foo.md'), `expected foo, got ${JSON.stringify(paths)}`);
    assert.ok(paths.includes('plans/done/bar.md'), `expected bar, got ${JSON.stringify(paths)}`);
    assert.ok(r.swept >= 2, `swept ${r.swept}`);
    // The rebuilt index answers a search (proves the query-embedding path is wired).
    const probe = new Float32Array(DIM); probe[0] = 1;
    const hits = store.search(probe, 5);
    assert.ok(hits.length > 0, 'search returns results over the backfilled index');
  } finally { rmTmp(root); }
});

// ── Case 2: isBackfillNeeded — missing/empty → true; populated → false ─────────
test('bootstrap #2: isBackfillNeeded true when empty, false when populated, false on error', () => {
  const root = mkTmp();
  try {
    assert.strictEqual(isBackfillNeeded(root), true, 'missing index → needed');
    const store = openStore(indexPath(root));
    store.upsertUnit({
      planPath: 'plans/todo/x.md', sectionId: '__plan__', kind: 'plan',
      text: 'x', embedding: new Float32Array([1, 0]), contentHash: 'h'
    });
    const { getWiring } = require('../src/lib/plan-index/wiring');
    getWiring.__reset();
    assert.strictEqual(isBackfillNeeded(root), false, 'populated index → not needed');
    // Fail-open: a getWiring that throws must yield false (do not kick a build we can't reason about).
    assert.strictEqual(isBackfillNeeded(root, { getWiring: () => { throw new Error('boom'); } }), false);
  } finally { rmTmp(root); }
});

// ── Case 3: kickBackfillBackground is NON-BLOCKING (detached spawn + unref) ────
test('bootstrap #3: kickBackfillBackground returns { started:true } synchronously, spawns detached, unrefs', () => {
  const root = mkTmp();
  try {
    let spawnArgs = null; let unrefCalled = false;
    const fakeSpawn = (cmd, args, opts) => {
      spawnArgs = { cmd, args, opts };
      return { unref() { unrefCalled = true; } };
    };
    const res = kickBackfillBackground(root, { spawn: fakeSpawn });
    assert.strictEqual(res.started, true);
    assert.strictEqual(spawnArgs.cmd, process.execPath, 'spawns the node binary');
    assert.strictEqual(spawnArgs.args[0], require.resolve('../src/lib/plan-index/bootstrap'), 'runs bootstrap.js');
    assert.strictEqual(spawnArgs.args[1], '--backfill');
    assert.strictEqual(spawnArgs.args[2], root);
    assert.strictEqual(spawnArgs.opts.detached, true);
    assert.strictEqual(spawnArgs.opts.stdio, 'ignore');
    assert.strictEqual(unrefCalled, true, 'child.unref() called so the parent never waits');
  } finally { rmTmp(root); }
});

// ── Case 4: kickBackfillBackground fail-open on spawn error ────────────────────
test('bootstrap #4: kickBackfillBackground does NOT throw when spawn throws; returns spawn-failed', () => {
  const root = mkTmp();
  try {
    let res;
    assert.doesNotThrow(() => {
      res = kickBackfillBackground(root, { spawn: () => { throw new Error('ENOENT'); } });
    });
    assert.strictEqual(res.started, false);
    assert.strictEqual(res.reason, 'spawn-failed');
  } finally { rmTmp(root); }
});

// ── Case 5: de-dupe via lock (fresh lock blocks; stale lock proceeds) ──────────
test('bootstrap #5: a fresh .build.lock de-dupes; a stale lock is ignored', () => {
  const root = mkTmp();
  try {
    fs.mkdirSync(path.join(root, '.ctoc', 'index'), { recursive: true });
    const fakeSpawn = () => ({ unref() {} });

    // Fresh lock → already-running.
    fs.writeFileSync(lockPath(root), JSON.stringify({ ts: Date.now() }));
    const blocked = kickBackfillBackground(root, { spawn: fakeSpawn });
    assert.strictEqual(blocked.started, false);
    assert.strictEqual(blocked.reason, 'already-running');

    // Stale lock (older than the TTL) → proceeds.
    const stale = Date.now() - (60 * 60 * 1000); // 1h ago
    fs.writeFileSync(lockPath(root), JSON.stringify({ ts: stale }));
    fs.utimesSync(lockPath(root), new Date(stale), new Date(stale));
    const proceeded = kickBackfillBackground(root, { spawn: fakeSpawn });
    assert.strictEqual(proceeded.started, true);
  } finally { rmTmp(root); }
});

// ── Case 6: child never throws on a reconcile error → status:error + resolves ──
test('bootstrap #6: runBackfill resolves (never rejects) when reconcileIndex rejects; writes status:error', async () => {
  const root = mkTmp();
  try {
    const store = openStore(indexPath(root));
    let result;
    await assert.doesNotReject(async () => {
      result = await runBackfill(root, {
        reconcileIndex: async () => { throw new Error('reconcile boom'); },
        runCalibration: async () => ({ backend: 'in-process', dimension: DIM }),
        getWiring: () => ({ store, embedder: makeEmbedder(), calibrationReady: () => true })
      });
    });
    assert.ok(result, 'runBackfill still resolves a result object');
    const status = JSON.parse(fs.readFileSync(statusPath(root), 'utf8'));
    assert.strictEqual(status.state, 'error');
    assert.ok(status.message, 'error status carries a message');
  } finally { rmTmp(root); }
});

// ── Case 7: build-status.json lifecycle → building then ready ──────────────────
test('bootstrap #7: runBackfill writes building then a final ready status with swept count', async () => {
  const root = mkTmp();
  try {
    writePlan(root, 'plans/todo/foo.md', 'Foo');
    writePlan(root, 'plans/done/bar.md', 'Bar');
    const store = openStore(indexPath(root));
    const embedder = makeEmbedder();

    let sawBuilding = false;
    await runBackfill(root, {
      reconcileIndex,
      runCalibration: async () => ({ backend: 'in-process', dimension: DIM }),
      getWiring: () => ({ store, embedder, calibrationReady: () => true }),
      onStatus: (s) => { if (s.state === 'building') sawBuilding = true; }
    });

    assert.strictEqual(sawBuilding, true, 'a building status was emitted first');
    const status = JSON.parse(fs.readFileSync(statusPath(root), 'utf8'));
    assert.strictEqual(status.state, 'ready');
    assert.strictEqual(status.swept, 2, `swept ${status.swept}`);
  } finally { rmTmp(root); }
});

// ── Case 8: overview reads the status file without breaking on a corrupt file ──
test('bootstrap #8: overview.render does NOT throw on a corrupt build-status.json (omits the line)', () => {
  const root = mkTmp();
  try {
    // Minimal state so overview.render can run over a real project root.
    fs.mkdirSync(path.join(root, '.ctoc', 'index'), { recursive: true });
    fs.writeFileSync(statusPath(root), '{ this is not json');
    let out;
    assert.doesNotThrow(() => { out = overview.render({ projectPath: root }); });
    assert.strictEqual(typeof out, 'string');
    assert.ok(!/Semantic Index/.test(out), 'a corrupt status file → NO index line, dashboard renders normally');
  } finally { rmTmp(root); }
});

// ── Case 6b: calibration failure is NON-FATAL — backfill continues to reconcile ─
test('bootstrap #6b: runBackfill continues (not fatal) when runCalibration rejects', async () => {
  const root = mkTmp();
  try {
    writePlan(root, 'plans/todo/foo.md', 'Foo');
    const store = openStore(indexPath(root));
    let reconcileRan = false;
    const result = await runBackfill(root, {
      runCalibration: async () => { throw new Error('calibration boom'); },
      reconcileIndex: async () => { reconcileRan = true; return { swept: 1, reembedded: 1, deleted: 0 }; },
      getWiring: () => ({ store, embedder: makeEmbedder(), calibrationReady: () => true })
    });
    assert.strictEqual(reconcileRan, true, 'reconcile still runs after a calibration failure');
    assert.strictEqual(result.state, 'ready');
    assert.strictEqual(result.calibrated, false, 'calibrated flag reflects the failure');
  } finally { rmTmp(root); }
});

// ── Case 2b: isBackfillNeeded is false when the wiring has a null store ─────────
test('bootstrap #2b: isBackfillNeeded returns false when wiring.store is null (fail-open)', () => {
  const root = mkTmp();
  try {
    assert.strictEqual(
      isBackfillNeeded(root, { getWiring: () => ({ store: null }) }),
      false,
      'a null-store wiring must not kick a build'
    );
  } finally { rmTmp(root); }
});

// ── Case 8b: overview renders a legible line for a valid building/ready status ─
test('bootstrap #8b: overview.render surfaces a Semantic Index line for a valid status', () => {
  const root = mkTmp();
  try {
    fs.mkdirSync(path.join(root, '.ctoc', 'index'), { recursive: true });
    fs.writeFileSync(statusPath(root), JSON.stringify({ state: 'ready', swept: 3 }));
    const out = overview.render({ projectPath: root });
    assert.ok(/Semantic Index/.test(out), 'a valid status renders the index line');
    assert.ok(/ready/.test(out));
  } finally { rmTmp(root); }
});

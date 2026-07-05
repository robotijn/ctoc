/**
 * CF1 — Cache freshness regression guard.
 *
 * Directive (2026-07-04): "Make certain CTOC is always reading the files, not
 * doing it from memory." The in-process TTL cache in src/lib/cache.js memoizes
 * three filesystem-heavy count reads (getPlanCounts, getVisionCounts,
 * getInboxCounts). Before CF1, no writer ever called cache.invalidate(), so a
 * count read within the 5s TTL (and for the whole life of the long-lived TUI
 * process) returned STALE counts after a plan moved/was created/deleted.
 *
 * These behavioral tests drive the REAL actions API against isolated tmp roots
 * and assert that after any state-mutating op the next count read recomputes
 * from disk, while a read-only navigation still hits the cache (perf preserved).
 *
 * AC1 is the stale-read regression guard: it FAILS before the actions.js
 * invalidate() wiring (returns the stale cached counts) and PASSES after.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cache = require('../src/lib/cache');
const actions = require('../src/lib/actions');
const { getPlanCounts, getVisionCounts } = require('../src/lib/state');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

function createTempProject() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cf1-'));
  STAGES.forEach(stage => fs.mkdirSync(path.join(tempDir, 'plans', stage), { recursive: true }));
  return tempDir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Minimal valid plan file for a given stage.
function writePlan(root, stage, slug, extraFrontmatter = '') {
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  const fm = extraFrontmatter ? `\n${extraFrontmatter}` : '';
  fs.writeFileSync(p, `---\ntitle: "${slug}"${fm}\n---\n\n# ${slug}\n\nBody.\n`);
  return p;
}

// A vision file whose Status the count reader parses.
function writeVision(root, slug, status) {
  const p = path.join(root, 'plans', 'vision', `${slug}.md`);
  fs.writeFileSync(p, `# ${slug}\n\n- Status: ${status}\n\nVision body.\n`);
  return p;
}

describe('CF1 — read cache is busted on every state write', () => {
  let root;

  beforeEach(() => {
    root = createTempProject();
    // Start every test from a clean cache so the shared module singleton
    // cannot leak entries across tests (isolated tmp roots also differ by key).
    cache.invalidate();
  });

  afterEach(() => {
    cleanup(root);
    cache.invalidate();
  });

  // ── AC1: a plan move busts the cached counts (THE stale-read regression) ──
  it('AC1_move_busts_plan_counts', () => {
    const planPath = writePlan(root, 'todo', 'cf1-move');

    // Populate the cache.
    const before = getPlanCounts(root);
    assert.equal(before.todo, 1, 'precondition: one plan in todo');
    assert.equal(before.inProgress, 0, 'precondition: none in-progress');
    // Prove the cache is actually populated for this root.
    assert.ok(
      cache._debug().keys.some(k => k.startsWith('getPlanCounts::')),
      'precondition: getPlanCounts is cached after first read'
    );

    // Real state mutation via the actions API (todo → in-progress).
    actions.movePlan(planPath, 'in-progress', root);

    // Re-read WITHIN the 5s TTL. Must reflect the MOVE, not the stale value.
    const after = getPlanCounts(root);
    assert.equal(after.todo, 0, 'AC1: todo count recomputes to 0 after move (not stale 1)');
    assert.equal(after.inProgress, 1, 'AC1: inProgress count recomputes to 1 after move');
  });

  // ── AC2: every mutating op invalidates (approve / start / complete) ──
  describe('AC2_every_mutating_op_invalidates', () => {
    it('approvePlan (functional → implementation) leaves cache empty + disk-fresh', () => {
      const planPath = writePlan(root, 'functional', 'cf1-approve');
      const before = getPlanCounts(root);
      assert.equal(before.functional, 1);
      assert.equal(before.implementation, 0);
      assert.ok(cache._debug().size > 0, 'precondition: cache populated');

      actions.approvePlan(planPath, root);

      // Clear-all empties the store immediately.
      assert.equal(cache._debug().size, 0, 'AC2/approve: cache cleared by the write');
      const after = getPlanCounts(root);
      assert.equal(after.functional, 0, 'AC2/approve: functional recomputes to 0');
      assert.equal(after.implementation, 1, 'AC2/approve: implementation recomputes to 1');
    });

    it('startExecution (todo → in-progress) leaves cache empty + disk-fresh', () => {
      const planPath = writePlan(root, 'todo', 'cf1-start');
      const before = getPlanCounts(root);
      assert.equal(before.todo, 1);
      assert.ok(cache._debug().size > 0, 'precondition: cache populated');

      actions.startExecution(planPath, root);

      assert.equal(cache._debug().size, 0, 'AC2/start: cache cleared by the write');
      const after = getPlanCounts(root);
      assert.equal(after.todo, 0, 'AC2/start: todo recomputes to 0');
      assert.equal(after.inProgress, 1, 'AC2/start: inProgress recomputes to 1');
    });

    it('completeExecution (in-progress → review, forced) leaves cache empty + disk-fresh', () => {
      const planPath = writePlan(root, 'in-progress', 'cf1-complete');
      const before = getPlanCounts(root);
      assert.equal(before.inProgress, 1);
      assert.equal(before.review, 0);
      assert.ok(cache._debug().size > 0, 'precondition: cache populated');

      // force:true skips full pre-review validation (not the subject under test).
      const res = actions.completeExecution(planPath, root, { force: true });
      assert.equal(res.blocked, false, 'precondition: forced completion is not blocked');

      assert.equal(cache._debug().size, 0, 'AC2/complete: cache cleared by the write');
      const after = getPlanCounts(root);
      assert.equal(after.inProgress, 0, 'AC2/complete: inProgress recomputes to 0');
      assert.equal(after.review, 1, 'AC2/complete: review recomputes to 1');
    });
  });

  // ── AC3: read-only navigation still benefits from the cache (perf) ──
  it('AC3_readonly_preserves_cache', () => {
    writePlan(root, 'todo', 'cf1-readonly');

    const first = getPlanCounts(root);
    const key = `getPlanCounts::${root}`;
    const dbgAfterFirst = cache._debug();
    assert.ok(dbgAfterFirst.keys.includes(key), 'first read populates the exact cache key');
    const sizeAfterFirst = dbgAfterFirst.size;

    // No write between the two reads.
    const second = getPlanCounts(root);

    const dbgAfterSecond = cache._debug();
    // Same key still present, store size unchanged → served from cache (no recompute-and-reset).
    assert.ok(dbgAfterSecond.keys.includes(key), 'AC3: cache key persists across a no-write read');
    assert.equal(dbgAfterSecond.size, sizeAfterFirst, 'AC3: cache size unchanged (perf preserved)');
    // Memoized object identity is returned on a cache hit — proves no recompute.
    assert.strictEqual(second, first, 'AC3: identical object returned from cache (no recompute)');
  });

  // ── AC4: vision counts also fresh after a vision-stage write ──
  it('AC4_vision_counts_fresh', () => {
    const visionPath = writeVision(root, 'cf1-vision', 'exploring');

    const before = getVisionCounts(root);
    assert.equal(before.total, 1);
    assert.equal(before.exploring, 1);
    assert.equal(before.converted, 0);
    assert.ok(
      cache._debug().keys.some(k => k.startsWith('getVisionCounts::')),
      'precondition: getVisionCounts is cached'
    );

    // Move the vision file out of the vision stage through the real write path.
    actions.movePlan(visionPath, 'done', root);

    const after = getVisionCounts(root);
    assert.equal(after.total, 0, 'AC4: vision total recomputes to 0 after the move (not stale 1)');
    assert.equal(after.exploring, 0, 'AC4: exploring recomputes to 0');
  });

  // deletePlan is a count-changing write with no move → must bust the cache.
  it('deletePlan busts the cached counts', () => {
    const planPath = writePlan(root, 'todo', 'cf1-delete');
    const before = getPlanCounts(root);
    assert.equal(before.todo, 1);
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    actions.deletePlan(planPath);

    assert.equal(cache._debug().size, 0, 'deletePlan clears the cache');
    const after = getPlanCounts(root);
    assert.equal(after.todo, 0, 'todo recomputes to 0 after delete (not stale 1)');
  });

  // Queue reorder is a write → busts the cache for the "every write busts"
  // invariant (counts are unchanged, but the store must clear).
  // Queue reorder is a write → each reorder writer busts the cache. FIFO order
  // is sorted by birthtime; to pick the movable target deterministically we read
  // the actual on-disk order first, then move the plan that can go up/down.
  function fifoOrder(r) {
    const dir = path.join(r, 'plans', 'todo');
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ path: path.join(dir, f), bt: fs.statSync(path.join(dir, f)).birthtime }))
      .sort((a, b) => a.bt - b.bt)
      .map(p => p.path);
  }

  it('moveUpInQueue busts the cache', () => {
    writePlan(root, 'todo', 'cf1-up-a');
    writePlan(root, 'todo', 'cf1-up-b');
    const order = fifoOrder(root);
    const last = order[order.length - 1]; // index > 0 → can move up

    getPlanCounts(root); // populate
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');
    const moved = actions.moveUpInQueue(last, root);
    assert.equal(moved, true, 'moveUpInQueue reorders the last plan up');
    assert.equal(cache._debug().size, 0, 'moveUpInQueue clears the cache');
    assert.equal(getPlanCounts(root).todo, 2, 'reorder leaves the todo count at 2 (disk-fresh)');
  });

  it('moveDownInQueue busts the cache', () => {
    writePlan(root, 'todo', 'cf1-down-a');
    writePlan(root, 'todo', 'cf1-down-b');
    const order = fifoOrder(root);
    const firstPlan = order[0]; // index 0 → can move down

    getPlanCounts(root); // populate
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');
    const moved = actions.moveDownInQueue(firstPlan, root);
    assert.equal(moved, true, 'moveDownInQueue reorders the first plan down');
    assert.equal(cache._debug().size, 0, 'moveDownInQueue clears the cache');
    assert.equal(getPlanCounts(root).todo, 2, 'reorder leaves the todo count at 2 (disk-fresh)');
  });

  // createCanvas writes a new plans/canvas/<slug>.md with no move → busts cache.
  it('createCanvas busts the cached counts', () => {
    // createCanvas needs the canvas templates under .ctoc/templates.
    const tmplDir = path.join(root, '.ctoc', 'templates');
    fs.mkdirSync(tmplDir, { recursive: true });
    const repoTmpl = path.join(__dirname, '..', '.ctoc', 'templates', 'lean-canvas.md.template');
    fs.copyFileSync(repoTmpl, path.join(tmplDir, 'lean-canvas.md.template'));

    const before = getPlanCounts(root);
    assert.equal(before.canvas, 0);
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    actions.createCanvas('cf1-canvas', 'lean', root);

    assert.equal(cache._debug().size, 0, 'createCanvas clears the cache');
    const after = getPlanCounts(root);
    assert.equal(after.canvas, 1, 'canvas recomputes to 1 after createCanvas (not stale 0)');
  });

  // Edge path: empty stage dirs → all-zero counts (no order dependence,
  // fresh tmp root, meaningful assertion on the error/edge branch).
  it('empty project yields zero counts and caches them', () => {
    const counts = getPlanCounts(root);
    for (const stage of ['canvas', 'functional', 'implementation', 'review', 'todo', 'inProgress', 'done']) {
      assert.equal(counts[stage], 0, `empty ${stage} count is 0`);
    }
    assert.ok(cache._debug().size > 0, 'empty read is still cached');
  });
});

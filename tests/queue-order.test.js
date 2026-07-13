/**
 * W11-s7 — Queue ordering (finding H10).
 *
 * moveUpInQueue()/moveDownInQueue() historically tried to "reorder" the todo
 * queue by calling utimesSync() to rewrite each plan's birthtime — but Node's
 * fs API has no birthtime parameter and birthtime is immutable on ext4/APFS, so
 * the sort key never changed: the reorder was a silent no-op that returned true.
 *
 * These behavioral tests drive the REAL display path (readPlans) and the REAL
 * FIFO consumer (getNextFromTodo) against isolated temp plan trees, and assert
 * that a reorder is genuinely observable. They FAIL on the utimes implementation
 * (order is unchanged) and PASS once ordering is realized through the explicit,
 * mutable key .ctoc/state/todo-order.json.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cache = require('../src/lib/cache');
const actions = require('../src/lib/actions');
const { readPlans, getNextFromTodo } = require('../src/lib/state');

function createTempProject() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-qo-'));
  fs.mkdirSync(path.join(tempDir, 'plans', 'todo'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, '.ctoc', 'state'), { recursive: true });
  return tempDir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Seed a todo plan. Names are chosen so that, on the pre-fix birthtime sort, the
// FIFO baseline is deterministic even when birthtime granularity is coarse
// (equal birthtimes fall back to the alphabetical name tiebreaker).
function seedTodo(root, slug) {
  const p = path.join(root, 'plans', 'todo', `${slug}.md`);
  fs.writeFileSync(p, `---\ntitle: "${slug}"\n---\n\n# ${slug}\n\nBody.\n`);
  return p;
}

// Ordered list of todo basenames as the REAL display path (readPlans) emits it.
function displayOrder(root) {
  return readPlans(path.join(root, 'plans', 'todo')).map(pl => path.basename(pl.path));
}

const ORDER_FILE = ['.ctoc', 'state', 'todo-order.json'];

describe('W11-s7 queue ordering (H10) — a reorder is genuinely observable', () => {
  let root;
  let A, B, C;

  beforeEach(() => {
    root = createTempProject();
    cache.invalidate();
    // Written a→b→c so the birthtime/name FIFO baseline is A, B, C.
    A = seedTodo(root, 'qo-a-first');
    B = seedTodo(root, 'qo-b-second');
    C = seedTodo(root, 'qo-c-third');
  });

  afterEach(() => {
    cleanup(root);
    cache.invalidate();
  });

  // ── Test 1: moving C up actually reorders the DISPLAY to A, C, B. ──
  it('moveUpInQueue(C) reorders the queue to A, C, B via readPlans', () => {
    assert.deepEqual(displayOrder(root), ['qo-a-first.md', 'qo-b-second.md', 'qo-c-third.md'],
      'precondition: FIFO baseline is A, B, C');

    const moved = actions.moveUpInQueue(C, root);
    assert.equal(moved, true, 'moveUpInQueue reports it moved C up');

    assert.deepEqual(displayOrder(root), ['qo-a-first.md', 'qo-c-third.md', 'qo-b-second.md'],
      'H10: the queue genuinely reorders to A, C, B (not merely reported as changed)');
  });

  // ── Test 2: the live FIFO consumer (getNextFromTodo) reflects the reorder. ──
  it('getNextFromTodo returns the plan moved to the front', () => {
    const first = getNextFromTodo(root);
    assert.equal(path.basename(first.path), 'qo-a-first.md', 'precondition: FIFO head is A');

    // Move B up once → B, A, C. The next task the executor picks is now B.
    const moved = actions.moveUpInQueue(B, root);
    assert.equal(moved, true, 'moveUpInQueue reports it moved B up');

    const next = getNextFromTodo(root);
    assert.equal(path.basename(next.path), 'qo-b-second.md',
      'H10: getNextFromTodo reflects the reorder (B is now the head)');
  });

  // ── Test 3: a boundary reorder is a real no-op — no cache invalidation. ──
  it('reorder at a boundary returns false and does NOT invalidate the cache', () => {
    // Single-item queue isolates the boundary condition unambiguously.
    const solo = createTempProject();
    try {
      cache.invalidate();
      const only = seedTodo(solo, 'qo-solo');

      // Populate the cache through a real read.
      const { getPlanCounts } = require('../src/lib/state');
      getPlanCounts(solo);
      const sizeBefore = cache._debug().size;
      assert.ok(sizeBefore > 0, 'precondition: cache populated');

      const up = actions.moveUpInQueue(only, solo);
      assert.equal(up, false, 'moveUpInQueue at the top boundary returns false');
      assert.equal(cache._debug().size, sizeBefore,
        'H10 edge: a no-op reorder must NOT invalidate the cache (moveUp)');

      const down = actions.moveDownInQueue(only, solo);
      assert.equal(down, false, 'moveDownInQueue at the bottom boundary returns false');
      assert.equal(cache._debug().size, sizeBefore,
        'H10 edge: a no-op reorder must NOT invalidate the cache (moveDown)');

      // A boundary no-op writes nothing.
      assert.equal(fs.existsSync(path.join(solo, ...ORDER_FILE)), false,
        'H10 edge: a boundary no-op does not create the order file');
    } finally {
      cleanup(solo);
      cache.invalidate();
    }
  });

  // ── Test 4: down-then-up round-trips to the original order. ──
  it('moveDownInQueue then moveUpInQueue round-trips to the original order', () => {
    assert.equal(actions.moveDownInQueue(A, root), true, 'A moves down → B, A, C');
    assert.deepEqual(displayOrder(root), ['qo-b-second.md', 'qo-a-first.md', 'qo-c-third.md'],
      'after moving A down: B, A, C');

    assert.equal(actions.moveUpInQueue(A, root), true, 'A moves back up → A, B, C');
    assert.deepEqual(displayOrder(root), ['qo-a-first.md', 'qo-b-second.md', 'qo-c-third.md'],
      'H10: down-then-up restores the original A, B, C order');
  });
});

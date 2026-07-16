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
const staleCleanup = require('../src/lib/stale-cleanup');
const visionDecomposer = require('../src/lib/vision-decomposer');
const inbox = require('../src/lib/inbox');
const { getInboxCounts } = inbox;

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

      // R5-B: approvePlan now VALIDATES functional→implementation. The subject here
      // is CACHE INVALIDATION on the crossing write, not the validation gate, so the
      // crossing is forced via an explicit, audited override.
      actions.approvePlan(planPath, root, { override: { reason: 'cache-freshness — the crossing IS the write under test' } });

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
    // Pin the key PREFIX that invalidate() relies on ("<name>::…"), not the
    // internal args serialization (which is deliberately injective/opaque).
    const keyPrefix = 'getPlanCounts::';
    const dbgAfterFirst = cache._debug();
    assert.ok(dbgAfterFirst.keys.some(k => k.startsWith(keyPrefix)), 'first read populates the getPlanCounts cache key');
    const sizeAfterFirst = dbgAfterFirst.size;

    // No write between the two reads.
    const second = getPlanCounts(root);

    const dbgAfterSecond = cache._debug();
    // Same key still present, store size unchanged → served from cache (no recompute-and-reset).
    assert.ok(dbgAfterSecond.keys.some(k => k.startsWith(keyPrefix)), 'AC3: cache key persists across a no-write read');
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

// ───────────────────────────────────────────────────────────────────────────
// CF1 KICKBACK — count-mutating writes OUTSIDE actions.js must also bust cache.
//
// The actions.js slice wires movePlan/deletePlan/queue-reorder/createCanvas.
// But other modules perform raw plan-file writes that bypass actions.js:
//   - stale-cleanup archivePlan/deletePlan (rename into done/ ; unlinkSync)
//   - vision-decomposer createStub/removeStub/mergeStubs (functional/*.md writes)
//   - inbox createQuestion/createDecision (.ctoc/inbox writes → getInboxCounts)
// Each below is a per-path regression proving the external write busts the cache
// (next count read is disk-fresh AND/OR the store is empty immediately after).
// ───────────────────────────────────────────────────────────────────────────
describe('CF1 KICKBACK — external (non-actions) writers bust the cache', () => {
  let root;

  beforeEach(() => {
    root = createTempProject();
    cache.invalidate();
  });

  afterEach(() => {
    cleanup(root);
    cache.invalidate();
  });

  // NOTE (R4-B): the former F1 case exercised sync.moveToReviewAfterPush — a raw,
  // evidence-less renameSync into review/. That function was DELETED (a plan reaches
  // review only via the evidence-minting completion path), so the case is gone with
  // it. The remaining external-writer cache-bust invariants (F2a…) stand unchanged.

  // ── F2a: stale-cleanup archivePlan (stamp + rename into done/) ──
  it('F2a_archivePlan_busts_plan_counts', () => {
    // review/ is a valid gate-source/archivable stage; a fresh plan there.
    const planPath = writePlan(root, 'review', 'cf1-ext-archive');

    const before = getPlanCounts(root);
    assert.equal(before.review, 1, 'precondition: one plan in review');
    assert.equal(before.done, 0, 'precondition: none in done');
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    const res = staleCleanup.archivePlan(planPath, root);
    assert.equal(res.to, 'done', 'precondition: archived to done');

    // Gate-safety (SP4): the stamp-before-rename ordering is untouched; the
    // stamped marker must be present in the archived file.
    const archived = fs.readFileSync(res.path, 'utf8');
    assert.match(archived, /advanced_by: pipeline/, 'F2a: pipeline provenance stamped (M5 ordering intact; R2-I forbids machine-written human markers)');
    assert.match(archived, /gate_crossed: stale-reconciliation/, 'F2a: reconciliation marker present');

    assert.equal(cache._debug().size, 0, 'F2a: cache cleared by the archive rename');
    const after = getPlanCounts(root);
    assert.equal(after.review, 0, 'F2a: review recomputes to 0 (not stale 1)');
    assert.equal(after.done, 1, 'F2a: done recomputes to 1');
  });

  // ── F2b: stale-cleanup deletePlan (unlinkSync) ──
  it('F2b_deletePlan_busts_plan_counts', () => {
    const planPath = writePlan(root, 'review', 'cf1-ext-delete');

    const before = getPlanCounts(root);
    assert.equal(before.review, 1, 'precondition: one plan in review');
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    const res = staleCleanup.deletePlan(planPath, { explicitlyRejected: true });
    assert.equal(res.action, 'delete', 'precondition: deleted');

    assert.equal(cache._debug().size, 0, 'F2b: cache cleared by the unlink');
    const after = getPlanCounts(root);
    assert.equal(after.review, 0, 'F2b: review recomputes to 0 after delete (not stale 1)');
  });

  // ── F2 gate-safety negative: a REFUSED delete never clears the cache ──
  it('F2_refused_delete_does_not_clear_cache', () => {
    const planPath = writePlan(root, 'review', 'cf1-ext-refuse');
    getPlanCounts(root); // populate
    const sizeBefore = cache._debug().size;
    assert.ok(sizeBefore > 0, 'precondition: cache populated');

    // explicitlyRejected not set → deletePlan throws BEFORE any unlink.
    assert.throws(
      () => staleCleanup.deletePlan(planPath),
      /refusing delete/,
      'precondition: refused delete throws'
    );

    // A throwing write must NOT needlessly clear the cache (invalidate is post-write).
    assert.equal(cache._debug().size, sizeBefore, 'F2: refused delete left the cache intact');
    assert.ok(fs.existsSync(planPath), 'F2: the plan file was not removed');
  });

  // ── F3a: vision-decomposer createStub (new functional/*.md) ──
  it('F3a_createStub_busts_plan_counts', () => {
    const before = getPlanCounts(root);
    assert.equal(before.functional, 0, 'precondition: no functional stubs');
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    const visionPath = path.join(root, 'plans', 'vision', 'cf1-vis.md');
    const stub = visionDecomposer.createStub(
      'cf1-vis', { title: 'Goal Alpha', scope: 'scope' }, visionPath, root
    );
    assert.ok(fs.existsSync(stub.path), 'precondition: stub written');

    assert.equal(cache._debug().size, 0, 'F3a: cache cleared by the stub write');
    const after = getPlanCounts(root);
    assert.equal(after.functional, 1, 'F3a: functional recomputes to 1 (not stale 0)');
  });

  // ── F3b: vision-decomposer removeStub (unlinkSync) ──
  it('F3b_removeStub_busts_plan_counts', () => {
    const visionPath = path.join(root, 'plans', 'vision', 'cf1-vis.md');
    const stub = visionDecomposer.createStub(
      'cf1-vis', { title: 'Goal Beta', scope: 'scope' }, visionPath, root
    );
    const before = getPlanCounts(root);
    assert.equal(before.functional, 1, 'precondition: one functional stub');
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    visionDecomposer.removeStub(stub.path);

    assert.equal(cache._debug().size, 0, 'F3b: cache cleared by the stub unlink');
    const after = getPlanCounts(root);
    assert.equal(after.functional, 0, 'F3b: functional recomputes to 0 after removal (not stale 1)');
  });

  // ── F3c: vision-decomposer mergeStubs (new functional/*.md + removes originals) ──
  it('F3c_mergeStubs_busts_plan_counts', () => {
    const visionPath = path.join(root, 'plans', 'vision', 'cf1-vis.md');
    const a = visionDecomposer.createStub('cf1-vis', { title: 'Goal A', scope: 'a' }, visionPath, root);
    const b = visionDecomposer.createStub('cf1-vis', { title: 'Goal B', scope: 'b' }, visionPath, root);

    const before = getPlanCounts(root);
    assert.equal(before.functional, 2, 'precondition: two functional stubs');
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    const merged = visionDecomposer.mergeStubs([a.path, b.path], 'Merged Goal', root);
    assert.ok(fs.existsSync(merged.path), 'precondition: merged stub written');

    assert.equal(cache._debug().size, 0, 'F3c: cache cleared by the merge write');
    const after = getPlanCounts(root);
    assert.equal(after.functional, 1, 'F3c: functional recomputes to 1 (2 originals removed, 1 merged)');
  });

  // ── F4a: inbox createQuestion (.ctoc/inbox/questions write) ──
  it('F4a_createQuestion_busts_inbox_counts', () => {
    const before = getInboxCounts(root);
    assert.equal(before.questions, 0, 'precondition: no questions');
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    inbox.createQuestion(
      { source_plan: 'cf1', source_step: '10', question: 'q?', context: 'ctx' }, root
    );

    assert.equal(cache._debug().size, 0, 'F4a: cache cleared by the question write');
    const after = getInboxCounts(root);
    assert.equal(after.questions, 1, 'F4a: questions recomputes to 1 (not stale 0)');
  });

  // ── F4b: inbox createDecision (.ctoc/inbox/decisions write) ──
  it('F4b_createDecision_busts_inbox_counts', () => {
    const before = getInboxCounts(root);
    assert.equal(before.decisions, 0, 'precondition: no decisions');
    assert.ok(cache._debug().size > 0, 'precondition: cache populated');

    inbox.createDecision(
      { plan: 'cf1', step: '10', ambiguity: 'x', choice: 'y', rationale: 'z' }, root
    );

    assert.equal(cache._debug().size, 0, 'F4b: cache cleared by the decision write');
    const after = getInboxCounts(root);
    assert.equal(after.decisions, 1, 'F4b: decisions recomputes to 1 (not stale 0)');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// CF1 COMPLETENESS GUARD — self-enforcing: a FUTURE src/lib writer that mutates
// a count-relevant file but forgets cache.invalidate() FAILS CI here.
//
// This is the drift-catcher for the exact failure the CF1 pre-ship review found:
// the actions.js slice invalidated, but four other modules performed raw
// plan/inbox writes that bypassed it and left stale counts. Behavioral per-path
// tests (above) pin the writers that exist TODAY; this guard pins the RULE, so
// a writer added TOMORROW cannot silently reintroduce the bug.
//
// The three memoized count reads (verified fresh from src/lib on 2026-07-06):
//   getPlanCounts   (state.js)  → counts *.md in plans/{canvas,functional,
//                                  implementation,review,todo,in-progress,done}
//   getVisionCounts (state.js)  → counts/parses plans/vision/*.md
//   getInboxCounts  (inbox.js)  → counts .ctoc/inbox/{questions,decisions}/*.md
//                                  + plans/{functional,implementation,review}
// A file that performs a MUTATING fs op on any of those paths MUST bust the
// cache — by importing `invalidate` from ./cache, OR by routing its write
// through actions.movePlan (which already invalidates).
//
// Detection is deliberately BROAD (whole-file: a mutating fs call AND any
// count-relevant path token) to MINIMIZE FALSE NEGATIVES — a future writer that
// builds its plan path inline (not via a nicely-named variable) is still caught.
// The residue of broad-flagged files that write genuinely non-count paths is
// handled by an explicit, DOCUMENTED whitelist below (never by loosening the
// detector) so the guard stays honest, not a rubber stamp.
// ───────────────────────────────────────────────────────────────────────────
describe('CF1 completeness — every count-mutating writer invalidates', () => {
  const libDir = path.join(__dirname, '..', 'src', 'lib');

  // A mutating filesystem op on the safe-fs wrapper (or raw fs). Literal regex
  // (no `new RegExp` on a non-literal) so the test lints clean.
  const MUTATING_FS = /(?:safeFs|fs)\.(?:renameSync|unlinkSync|writeFileSync|appendFileSync|cpSync|rmSync)\(/;

  // A count-relevant path token: the write MIGHT target a plan-stage, vision, or
  // inbox file that one of the three memoized reads counts. Broad by design.
  const COUNT_RELEVANT_PATH =
    /\bplans\b|getPlansDir|getPlanDir|['"]vision['"]|['"]canvas['"]|['"]functional['"]|['"]todo['"]|['"]review['"]|['"]done['"]|['"]in-progress['"]|\binbox\b|QUESTIONS_DIR|DECISIONS_DIR|getQuestionsDir|getDecisionsDir/;

  // "Safe" = the writer busts the cache: imports invalidate from ./cache, OR
  // imports/uses movePlan from ./actions (movePlan itself invalidates).
  const IMPORTS_INVALIDATE = /require\(['"]\.\/cache['"]\)/;
  const USES_INVALIDATE = /\binvalidate\b/;
  const USES_MOVEPLAN = /\bmovePlan\b/;

  /**
   * Detection predicate: does this source perform a count-mutating write?
   * (broad: a mutating fs op AND a count-relevant path token co-occur)
   */
  function isCountMutatingWriter(src) {
    return MUTATING_FS.test(src) && COUNT_RELEVANT_PATH.test(src);
  }

  /**
   * Safety predicate: does this source bust the read cache?
   * Safe iff it imports+uses invalidate from ./cache, OR uses movePlan.
   */
  function bustsCache(src) {
    const invalidateWired = IMPORTS_INVALIDATE.test(src) && USES_INVALIDATE.test(src);
    return invalidateWired || USES_MOVEPLAN.test(src);
  }

  // ── WHITELIST — broad-flagged files that write a GENUINELY non-count path. ──
  // Each entry is justified from reading the file's ACTUAL write targets fresh
  // (2026-07-06). Keep MINIMAL: never whitelist a real count writer to go green.
  const WHITELIST = new Map([
    // The fs wrapper itself — owns NO count path; it writes whatever a caller
    // passes. Detecting it would be detecting the primitive, not a count writer.
    ['safe-fs.js', 'the safeFs wrapper — writes only what callers pass; owns no count path of its own'],
    // Continuation gate (Lesson 15): writes ONLY .ctoc/state/continuation.json (the
    // authorized-batch state the Stop hook reads). Not a plan/vision/inbox *.md, so
    // the plan-stage/vision/inbox counts are invariant — nothing to invalidate.
    ['continuation.js', 'writes only .ctoc/state/continuation.json (batch state for the Stop continuation-gate); never a counted plan/vision/inbox file'],
    // R4-B: after moveToReviewAfterPush was deleted, sync.js writes only the
    // .ctoc/last-sync timestamp; the `plans` tokens are git CLI args (git add
    // plans/), not fs writes to a counted *.md. No plan/vision/inbox file is written.
    ['sync.js', 'writes only .ctoc/last-sync timestamp; the `plans` tokens are git CLI args (git add plans/), never an fs write to a counted plan/vision/inbox file'],
    // Reads plan counts but its WRITES target .ctoc/state/agent.json and
    // .ctoc/settings.json — neither is counted by any memoized read.
    ['state.js', 'writes .ctoc/state/agent.json + .ctoc/settings.json only; reads counts but never writes a plan/vision/inbox file'],
    // One-time scaffold (CLAUDE.md, .ctoc/settings, .ctoc/state, .gitignore)
    // that runs BEFORE any cache exists — nothing to invalidate.
    ['init-project.js', 'one-time project scaffold before any cache exists; writes CLAUDE.md/.ctoc/settings/.gitignore, no plan/vision/inbox file'],
    // Edits a plan file IN PLACE (appends "## Execution Plan"/"## Deferred
    // Questions" to an existing plan). Never creates/deletes/moves a plan file,
    // so the plan-stage counts are invariant — an in-place body edit changes
    // content, not the count.
    ['iron-loop.js', 'edits an existing plan body in place (appends step sections); never creates/deletes/moves a plan file, so counts are invariant'],
    // Records kickback counters by rewriting the plan's own frontmatter back to
    // the SAME planPath (recordKickback: readFileSync → writeFileSync(planPath)).
    // Never creates/deletes/moves a plan file, so the plan-stage counts are
    // invariant — an in-place body edit changes content, not the count.
    ['circuit-breaker.js', 'edits an existing plan body in place (rewrites kickback counters into the plan frontmatter); never creates/deletes/moves a plan file, so counts are invariant'],
    // Writes bg-status sidecar JSON in .ctoc/ keyed by plan path — not a *.md in
    // a stage dir; getPlanCounts/getInboxCounts do not count status sidecars.
    ['background.js', 'writes .ctoc/ background-status sidecar JSON, not a counted *.md plan file'],
    // Writes .ctoc/.../holds/<id>.yaml legal-hold records — not counted.
    ['legal-hold.js', 'writes .ctoc/legal-hold/<id>.yaml records, not a plan/vision/inbox file'],
    // Writes .ctoc/templates/product-kpis.yaml (KPI library) — not counted.
    ['product-loop.js', 'writes .ctoc/templates/product-kpis.yaml (KPI library), not a counted file'],
    // Writes .ctoc/loops/<slug>/journal + letters — refinement artifacts, not
    // plan/vision/inbox files.
    ['refinement-loop.js', 'writes .ctoc/loops/<slug>/{journal,letters} refinement artifacts, not a counted file'],
    // Writes .ctoc/state/dashboard-prefs.json — UI prefs, not counted.
    ['sections.js', 'writes .ctoc/state/dashboard-prefs.json (UI prefs), not a counted file'],
    // Writes .ctoc/.../task-registry + log JSON via atomic temp-then-rename — a
    // registry/log, not a plan/vision/inbox *.md.
    ['task-registry.js', 'writes .ctoc/ task-registry + log JSON (atomic temp+rename), not a counted file'],
    // NB4: reconcileState persists the reconciled registry via task-registry.save
    // (.ctoc/state/tasks.json) and unlinks orphaned .ctoc/state/tasks.json.tmp-*
    // artifacts — same non-counted state file as task-registry.js. getPlanCounts /
    // getVisionCounts / getInboxCounts never read tasks.json, so no cache to bust.
    ['task-reconcile.js', 'writes/unlinks .ctoc/state/tasks.json(+.tmp-*) via task-registry.save, not a plan/vision/inbox file'],
    // Writes .ctoc/traceability/matrix.yaml — a traceability artifact, not counted.
    ['traceability-matrix.js', 'writes .ctoc/traceability/matrix.yaml, not a plan/vision/inbox file'],
    // Writes .ctoc/audit/dispatches/*.yaml + .ctoc/agents/dispatch-grades.yaml —
    // audit trail, not counted.
    ['v8-dispatcher.js', 'writes .ctoc/audit/dispatches/*.yaml + dispatch-grades.yaml (audit trail), not a counted file'],
    // Streaming gate screen: its only direct fs write is appending .ctoc/streaming/comments.jsonl;
    // the actual gate crossing (plan move) goes through actions.approvePlan, which itself invalidates.
    ['streaming-gate.js', 'appends .ctoc/streaming/comments.jsonl only; the gate move goes through actions.approvePlan (which invalidates), never a direct counted-file write here'],
  ]);

  // The known count-mutating writers already wired (CF1 + its kickback). These
  // are the regression pins: they MUST be detected AND MUST pass the safety
  // predicate. If a refactor drops the wiring from any of these, this fails.
  // R4-B: sync.js dropped off this list — its only real count-writer
  // (moveToReviewAfterPush, a renameSync into review/) was DELETED. Its sole fs
  // write is now the .ctoc/last-sync timestamp, and the `plans` tokens are git CLI
  // args (git add plans/), so it is a broad-flag false positive → WHITELIST below.
  const KNOWN_WIRED_WRITERS = ['actions.js', 'stale-cleanup.js', 'vision-decomposer.js', 'inbox.js'];

  // Enumerate real src/lib source files fresh from disk.
  function libFiles() {
    return fs.readdirSync(libDir).filter(f => f.endsWith('.js'));
  }

  // ── SELF-TEST: the guard must FLAG a planted un-wired writer (proves the ──
  // ── predicates are not vacuously green — the LH1 safe-fs-blindspot pattern). ─
  it('self-test: detection+safety FLAG a planted un-wired plan writer', () => {
    // A synthetic module that writes a plan file WITHOUT importing invalidate
    // and WITHOUT routing through movePlan → a genuine CF1 violation.
    const plantedUnwired = [
      "const safeFs = require('./safe-fs');",
      "const path = require('path');",
      'function badWriter(root, slug) {',
      "  const p = path.join(root, 'plans', 'todo', slug + '.md');",
      "  safeFs.writeFileSync(p, '---\\ntitle: x\\n---\\n');",
      '  return p;',
      '}',
      'module.exports = { badWriter };',
    ].join('\n');

    assert.equal(
      isCountMutatingWriter(plantedUnwired), true,
      'self-test: a plans/todo writeFileSync is detected as count-mutating'
    );
    assert.equal(
      bustsCache(plantedUnwired), false,
      'self-test: the un-wired writer is correctly seen as NOT busting the cache'
    );
    // The guard's verdict on this planted source is FAIL → proves non-vacuous.
    const wouldFlag = isCountMutatingWriter(plantedUnwired) && !bustsCache(plantedUnwired);
    assert.equal(wouldFlag, true, 'self-test: the guard WOULD flag the planted un-wired writer');

    // And a matching wired variant (adds the invalidate import + call) must NOT
    // be flagged — proves the safety predicate actually clears a fixed writer.
    const plantedWired = plantedUnwired
      .replace("const path = require('path');", "const path = require('path');\nconst { invalidate } = require('./cache');")
      .replace('  return p;', '  invalidate();\n  return p;');
    assert.equal(bustsCache(plantedWired), true, 'self-test: adding invalidate() clears the writer');
    assert.equal(
      isCountMutatingWriter(plantedWired) && !bustsCache(plantedWired), false,
      'self-test: the wired variant is NOT flagged'
    );
  });

  // ── REGRESSION PIN: the 5 known writers are detected AND pass. ──
  it('the 5 known count-mutating writers are detected and wired', () => {
    for (const name of KNOWN_WIRED_WRITERS) {
      const src = fs.readFileSync(path.join(libDir, name), 'utf8');
      assert.equal(
        isCountMutatingWriter(src), true,
        `regression: ${name} is detected as a count-mutating writer`
      );
      assert.equal(
        bustsCache(src), true,
        `regression: ${name} busts the cache (imports invalidate or uses movePlan)`
      );
      // None of the real wired writers should be on the whitelist (they must be
      // proven by the predicate, not exempted).
      assert.equal(
        WHITELIST.has(name), false,
        `regression: ${name} must NOT be whitelisted — it is a real wired writer`
      );
    }
  });

  // ── THE GUARD: every detected count-mutating writer either busts the cache ──
  // ── or is an explicitly-justified whitelist entry. A future un-wired writer ──
  // ── lands here as a hard failure with an actionable message. ──
  it('every count-mutating src/lib writer busts the cache (or is whitelisted)', () => {
    const offenders = [];
    for (const name of libFiles()) {
      const src = fs.readFileSync(path.join(libDir, name), 'utf8');
      if (!isCountMutatingWriter(src)) continue;      // not a count writer
      if (bustsCache(src)) continue;                  // wired — good
      if (WHITELIST.has(name)) continue;              // documented non-count writer
      // A mutating write on a count-relevant path with no invalidate/movePlan
      // and no whitelist justification → the exact CF1 drift.
      offenders.push(name);
    }
    assert.deepEqual(
      offenders, [],
      offenders.length === 0
        ? 'all count-mutating writers bust the cache'
        : `CF1 VIOLATION: ${offenders.join(', ')} perform a mutating fs op on a ` +
          'count-relevant path (plan-stage/vision/inbox) but never bust the read ' +
          'cache. Add `const { invalidate } = require(\'./cache\');` and call ' +
          '`invalidate();` immediately AFTER the successful write (before return), ' +
          'OR route the write through actions.movePlan. If the write genuinely ' +
          'targets a non-count path, add a justified entry to the WHITELIST in ' +
          'this test with the exact path it writes.'
    );
  });

  // ── WHITELIST HONESTY: every whitelist entry must actually exist and must ──
  // ── actually be broad-flagged (else it is dead weight hiding nothing). ──
  it('whitelist is minimal — every entry is a real, currently-flagged file', () => {
    const present = new Set(libFiles());
    for (const [name, reason] of WHITELIST) {
      assert.ok(present.has(name), `whitelist entry ${name} must be a real src/lib file`);
      assert.ok(reason && reason.length > 20, `whitelist entry ${name} must carry a real justification`);
      const src = fs.readFileSync(path.join(libDir, name), 'utf8');
      // It must be BROAD-FLAGGED (detected as a candidate) AND NOT already busting
      // the cache — otherwise it does not need exempting and is dead weight.
      const detected = isCountMutatingWriter(src);
      const safe = bustsCache(src);
      assert.equal(
        detected && !safe, true,
        `whitelist entry ${name} is dead weight: it is not a broad-flagged non-busting ` +
        'writer (remove it, or it is masking a real writer — investigate).'
      );
    }
  });
});

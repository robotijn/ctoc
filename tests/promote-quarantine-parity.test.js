/**
 * The concurrent-edit guard must run on EVERY promote path
 * (plans/todo/00077-quarantine-on-every-promote-path.md).
 *
 * A queued task reaches the menu driver for dispatch by four routes: the dashboard
 * render (`task-reconcile.reconcileState`) and the three command paths `menu task
 * fail|cancel|complete` (`menu-screens.computePromote`). Shipped today the quarantine
 * — the guard that refuses to hand a file still reserved by an age-only orphan to a
 * conflicting queued task — runs on the FIRST route only. The other three publish a
 * `promote[]` that the completion turn dispatches verbatim, so a task failing,
 * cancelling or completing silently defeats the guard.
 *
 * These tests drive REAL routes against a real on-disk registry. `computePromote` is
 * module-private and is never called directly, because a test that only exercised the
 * shared helper would stay green while a caller still bypassed it. Case 5 is the
 * parity test proper: the same seed must produce the same promoted set through all
 * four routes.
 *
 * CASE 9 — BELT-AND-SUSPENDERS (human ruling 2026-07-26, supersedes the earlier
 * "scheduler stays pure" ruling). The human directed that the concurrent-edit guard ALSO
 * be enforced inside the scheduler so it "cannot be bypassed by any caller". It is now a
 * BELT at `canRun` — the single oracle every status→running transition consults, so no
 * caller that computes its own promote set can START a colliding task. The PROJECTION
 * (`task-reconcile.applyQuarantine`) remains the SUSPENDERS: it holds the candidate on the
 * render + command paths and REPORTS it (the human-visible "held" signal). `nextRunnable`
 * is left as the raw projection (it still OFFERS the candidate) so the projection can name
 * what it held — see cases 1-6, 10b, 11. Case 9 now asserts canRun refuses while
 * nextRunnable offers; the longer-term consolidation across all promote paths (including
 * menu-screens.js) belongs to sibling 00013-r3b, which declares those files.
 *
 * FAULT INJECTION (case 11). `task-reconcile` destructures `touchesOverlap` from
 * `./plan-coverage` at module load, so a delegating stub is installed on the
 * plan-coverage exports object BEFORE `task-reconcile` and `menu-screens` are required.
 * `task-registry` is required FIRST, with the real implementation, so the scheduler's
 * own Rule 4 keeps the genuine overlap test and only the projection sees the fault.
 * The stub delegates to the real implementation unless a test arms it, so every other
 * case exercises real behaviour. Restored in `after()`. `touchesOverlap` is an EXTERNAL
 * COLLABORATOR of the code under test, not its core logic — the same sanctioned
 * boundary-injection pattern as tests/task-reconcile-quarantine-fault.test.js.
 */

'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Load task-registry FIRST so its own destructured `touchesOverlap` binding is REAL —
// the scheduler must be unaffected by the injected fault (see case 9 and case 11).
const taskRegistry = require('../src/lib/task-registry');
const planCoverage = require('../src/lib/plan-coverage');

const realOverlap = planCoverage.touchesOverlap;

/** When non-null, the stubbed touchesOverlap throws with this message. */
let overlapFault = null;

/** @type {typeof import('../src/lib/task-reconcile')} */
let taskReconcile;
/** @type {typeof import('../src/lib/menu-screens')} */
let menuScreens;

before(() => {
  planCoverage.touchesOverlap = (a, b) => {
    if (overlapFault !== null) throw new Error(overlapFault);
    return realOverlap(a, b);
  };
  // Both modules must pick up the stubbed binding — menu-screens requires
  // task-reconcile, so task-reconcile is evicted first and re-required through it.
  delete require.cache[require.resolve('../src/lib/task-reconcile')];
  delete require.cache[require.resolve('../src/lib/menu-screens')];
  taskReconcile = require('../src/lib/task-reconcile');
  menuScreens = require('../src/lib/menu-screens');
});

after(() => {
  planCoverage.touchesOverlap = realOverlap;
  overlapFault = null;
  delete require.cache[require.resolve('../src/lib/task-reconcile')];
  delete require.cache[require.resolve('../src/lib/menu-screens')];
});

// ── fixtures ────────────────────────────────────────────────────────────────────

const MIN = 60_000;
const TARGET = 'src/lib/target.js';

/** ISO string for `now - ageMs` (the command routes read the real clock). */
function ago(ageMs) {
  return new Date(Date.now() - ageMs).toISOString();
}

function task(over) {
  return Object.assign({
    id: 't0',
    kind: 'review',
    label: '',
    plan: null,
    status: 'queued',
    agentTaskId: null,
    touches: [],
    gitOp: false,
    blockedBy: [],
    result: null,
    ts: { created: ago(20 * MIN), started: null, done: null }
  }, over);
}

/**
 * The shared conflict seed.
 *
 *   t1 — orphaned on AGE ALONE, reserving `src/lib/target.js`. 10 minutes old, so the
 *        presumed-dead bound (2 × the 120-min `implement` floor) has NOT elapsed and
 *        the reservation is genuinely still live.
 *   t2 — a queued `implement` candidate touching the SAME file. The scheduler WILL
 *        return it (t1 is orphaned and no longer occupies a slot); the quarantine is
 *        what must hold it.
 *   t3 — a queued disjoint candidate that must ALWAYS promote.
 *   t4 — running, so fail/cancel/complete have a task to act on. Kind `review` with an
 *        empty touch set and no plan, so completing it is a registry-only settle (no
 *        plan-completion machinery) and its occupancy blocks neither t2 nor t3.
 */
function conflictTasks(over = {}) {
  return [
    task({
      id: 't1',
      kind: 'implement',
      plan: 'plans/todo/held.md',
      status: 'orphaned',
      touches: [TARGET],
      result: {
        ok: false,
        orphanReason: over.orphanReason || 'staleness',
        summary: 'orphaned on staleness alone — the agent was never confirmed dead'
      },
      ts: { created: ago(30 * MIN), started: ago(10 * MIN), done: ago(1 * MIN) }
    }),
    task({ id: 't2', kind: 'implement', plan: 'p2', touches: [TARGET] }),
    task({ id: 't3', kind: 'review', plan: 'p3', touches: [] }),
    task({
      id: 't4',
      kind: 'review',
      plan: null,
      status: 'running',
      agentTaskId: 't4',
      touches: [],
      ts: { created: ago(15 * MIN), started: ago(5 * MIN), done: null }
    })
  ];
}

function seedConflict(root, over = {}, extra = []) {
  const tasks = conflictTasks(over).concat(extra);
  taskRegistry.save(root, { version: taskRegistry.REGISTRY_VERSION, seq: tasks.length, tasks });
}

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-promote-parity-'));
  overlapFault = null;
});
afterEach(() => {
  overlapFault = null;
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort teardown */ }
});

/** A fresh root seeded the same way — each route mutates the registry it runs against. */
function freshRoot(over = {}, extra = []) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-promote-parity-'));
  seedConflict(r, over, extra);
  return r;
}

const ROUTES = ['dashboard', 'fail', 'cancel', 'complete'];

/**
 * Drive one route and return its promote list and quarantine list in one shape.
 * @returns {{promote:Array<object>, quarantined:Array<object>, raw:object}}
 */
function runRoute(name, r) {
  if (name === 'dashboard') {
    const out = taskReconcile.reconcileState(r, { liveAgentIds: null });
    return { promote: out.promote, quarantined: out.report.quarantined || [], raw: out };
  }
  const res = menuScreens.taskCommand([name, 't4'], r);
  assert.equal(res.ok, true, `${name} route must succeed, got: ${JSON.stringify(res)}`);
  return { promote: res.promote || [], quarantined: res.quarantined || [], raw: res };
}

const ids = (list) => (list || []).map((t) => t.id).sort();

// ─────────────────────────────────────────────────────────────────────────────
// Cases 1-4 — every route holds the conflicting candidate
// ─────────────────────────────────────────────────────────────────────────────

describe('the concurrent-edit guard runs on every promote path', () => {
  it('case 1 — the dashboard path holds the conflicting candidate (regression guard)', () => {
    seedConflict(root);
    const { promote, quarantined } = runRoute('dashboard', root);

    assert.ok(ids(promote).includes('t3'), 'the disjoint candidate must promote');
    assert.ok(!ids(promote).includes('t2'), 't2 collides with a live age-only orphan');
    const entry = quarantined.find((q) => q.id === 't2');
    assert.ok(entry, 'the held candidate must be reported, never silently missing');
    assert.equal(entry.reason, 'staleness-orphan-quarantine');
  });

  for (const route of ['fail', 'cancel', 'complete']) {
    it(`case — the ${route} path holds it too`, () => {
      seedConflict(root);
      const { promote, quarantined } = runRoute(route, root);

      assert.ok(ids(promote).includes('t3'), 'the disjoint candidate must still promote');
      assert.ok(
        !ids(promote).includes('t2'),
        `menu task ${route} published t2 for dispatch — its files are still reserved by an ` +
        'age-only orphan whose agent was never confirmed dead, so this is two agents on one file'
      );
      const entry = quarantined.find((q) => q.id === 't2');
      assert.ok(entry, 'the held candidate must be named on the command result, never silent');
      assert.equal(entry.reason, 'staleness-orphan-quarantine');
    });
  }

  it('case 5 — four-way parity: identical seeds promote an identical set on every route', () => {
    const results = ROUTES.map((name) => {
      const r = freshRoot();
      try {
        return { name, promoted: ids(runRoute(name, r).promote) };
      } finally {
        try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    });

    const first = results[0];
    for (const other of results.slice(1)) {
      assert.deepEqual(
        other.promoted, first.promoted,
        `route "${other.name}" promoted ${JSON.stringify(other.promoted)} but route ` +
        `"${first.name}" promoted ${JSON.stringify(first.promoted)} — one guard, every route`
      );
    }
  });

  it('case 6 — a released quarantine promotes on every route', () => {
    for (const name of ROUTES) {
      const r = freshRoot({ orphanReason: 'confirmed-dead' });
      try {
        const { promote, quarantined } = runRoute(name, r);
        assert.ok(
          ids(promote).includes('t2'),
          `route "${name}" must promote t2 once the reservation is released (confirmed-dead)`
        );
        assert.equal(quarantined.length, 0, `route "${name}" must report no quarantine`);
      } finally {
        try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cases 7-8 — the projection's injection defences survive the refactor
// ─────────────────────────────────────────────────────────────────────────────

describe('the promote projection keeps its injection defences', () => {
  it('case 7 — the id-shape filter still runs last on the command routes', () => {
    const odd = task({ id: 'x9', kind: 'review', plan: 'px', touches: [] });
    for (const name of ['fail', 'cancel', 'complete']) {
      const r = freshRoot({}, [odd]);
      try {
        const { promote } = runRoute(name, r);
        assert.ok(
          !ids(promote).includes('x9'),
          `route "${name}" leaked a non-canonical id into promote[] — only t<n> may ride ` +
          'into a dispatch instruction'
        );
      } finally {
        try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    }
  });

  it('case 8 — control characters are still stripped from the promoted plan', () => {
    const noisy = task({ id: 't9', kind: 'review', plan: 'plans/todo/a\u001b[31mb\u0007.md', touches: [] });
    for (const name of ['fail', 'cancel', 'complete']) {
      const r = freshRoot({}, [noisy]);
      try {
        const { promote } = runRoute(name, r);
        const entry = promote.find((t) => t.id === 't9');
        assert.ok(entry, `route "${name}" must promote the disjoint candidate t9`);
        assert.ok(
          !/[\u0000-\u001f\u007f]/.test(String(entry.plan)),
          `route "${name}" promoted a plan string carrying control characters`
        );
      } finally {
        try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 9 — the scheduler stays pure (the human's ruling, made executable)
// ─────────────────────────────────────────────────────────────────────────────

describe('the concurrent-edit belt lives in canRun; the projection reports it', () => {
  it('case 9 — canRun REFUSES the conflicting candidate (belt); nextRunnable still OFFERS it', () => {
    seedConflict(root);
    const reg = taskRegistry.load(root);
    const t2 = reg.tasks.find((t) => t.id === 't2');

    // BELT: canRun is the single status→running oracle. It now refuses a candidate that
    // would edit files still reserved by an age-only orphan, so the guard cannot be bypassed
    // by any caller that computes its own promote set (human ruling 2026-07-26).
    const decision = taskRegistry.canRun(t2, reg);
    assert.equal(decision.run, false, 'canRun must refuse t2 — its file is reserved by an age-only orphan');
    assert.equal(decision.reason, 'staleness-orphan-quarantine');

    // SUSPENDERS: nextRunnable stays the raw projection so applyQuarantine can hold AND
    // REPORT the candidate (the human-visible "held" signal). Cases 1-6/11 depend on this.
    assert.ok(
      taskRegistry.nextRunnable(reg).some((t) => t.id === 't2'),
      'nextRunnable must still offer t2 so the projection can name what it held'
    );
  });

  it('case 9b — a RELEASED reservation (confirmed-dead) passes the belt on every layer', () => {
    // The belt uses the same predicate as the projection (orphanReason === "staleness" only),
    // so once the reservation is released the belt no longer holds the candidate — the two
    // layers agree, and nextRunnable + canRun + the routes all promote it (see case 6).
    seedConflict(root, { orphanReason: 'confirmed-dead' });
    const reg = taskRegistry.load(root);
    const t2 = reg.tasks.find((t) => t.id === 't2');
    assert.equal(taskRegistry.canRun(t2, reg).run, true, 'a released orphan does not hold the candidate');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cases 10-11 — the shared function is total and still fails safe
// ─────────────────────────────────────────────────────────────────────────────

describe('applyQuarantine — the one encoding of the guard', () => {
  it('case 10 — tolerates junk without throwing', () => {
    assert.deepEqual(
      taskReconcile.applyQuarantine(null, []),
      { promote: [], quarantined: [], faulted: null },
      'a non-object registry must degrade safely, never brick a caller'
    );
    assert.deepEqual(
      taskReconcile.applyQuarantine({ tasks: [] }, null),
      { promote: [], quarantined: [], faulted: null },
      'a non-array candidate list must degrade to an empty promote set'
    );
    const cands = [{ id: 't7', touches: [] }];
    assert.deepEqual(
      taskReconcile.applyQuarantine({ tasks: [] }, cands),
      { promote: cands, quarantined: [], faulted: null },
      'with nothing reserved, the candidates pass through unchanged'
    );
  });

  it('case 10b — does not mutate the registry or the candidates it inspects', () => {
    seedConflict(root);
    const reg = taskRegistry.load(root);
    const before = JSON.stringify(reg);
    const cands = taskRegistry.nextRunnable(reg);
    taskReconcile.applyQuarantine(reg, cands);
    assert.equal(JSON.stringify(reg), before, 'applyQuarantine must only READ');
  });

  it('case 11 — a fault still fails safe through the shared function', () => {
    seedConflict(root);
    const reg = taskRegistry.load(root);
    const cands = taskRegistry.nextRunnable(reg);
    overlapFault = 'injected overlap fault';

    const out = taskReconcile.applyQuarantine(reg, cands);

    assert.ok(out.faulted, 'a thrown overlap test must be recorded, never swallowed');
    assert.equal(out.faulted.phase, 'filter');
    assert.match(String(out.faulted.error), /injected overlap fault/);
    assert.ok(!ids(out.promote).includes('t2'), 'the unchecked candidate must be DROPPED');
    assert.ok(ids(out.promote).includes('t3'), 'an empty touch set can never conflict');
  });

  it('case 11b — the fault fails safe on a command route too', () => {
    seedConflict(root);
    overlapFault = 'injected overlap fault';

    const { promote, quarantined } = runRoute('fail', root);

    assert.ok(!ids(promote).includes('t2'), 'menu task fail must not promote an unchecked candidate');
    assert.ok(ids(promote).includes('t3'), 'the non-editing candidate must survive the fault');
    const entry = quarantined.find((q) => q.id === 't2');
    assert.ok(entry, 'the fault-driven drop must be surfaced on the command result');
    assert.equal(entry.reason, 'quarantine-fault');
  });
});

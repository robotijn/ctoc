/**
 * The concurrent-edit guard must FAIL SAFE (plans/todo/00076-quarantine-fault-fails-safe.md).
 *
 * `reconcileState`'s quarantine block reserves the files of every task orphaned on AGE
 * ALONE — a task whose agent was never confirmed dead and may still be editing those
 * files — and removes any queued candidate that would collide from the promote list.
 * Shipped today, that whole block sits inside an EMPTY catch: any throw inside it lands
 * on a comment, nothing is recorded, and the unfiltered promote list is returned. The
 * guard's failure is then indistinguishable from the guard running and finding nothing,
 * and the menu driver dispatches a task straight onto a file another agent may hold.
 *
 * These tests prove the two halves independently — the fault is RECORDED, and the
 * candidates that could not be checked are DROPPED rather than promoted. A test that
 * only asserted the recording would pass against a guard that still fails open.
 *
 * FAULT INJECTION. `task-reconcile` destructures `touchesOverlap` from `./plan-coverage`
 * at module load, so the stub is installed on the plan-coverage exports object BEFORE
 * `task-reconcile` is (re-)required. `task-registry` is required FIRST, with the real
 * implementation, so the scheduler's own Rule 4 keeps the genuine overlap test and only
 * the module under test sees the fault. The stub DELEGATES to the real implementation
 * unless a test arms it, so the no-fault case exercises real behaviour. Everything is
 * restored in `after()`. This file is separate from tests/task-reconcile.test.js because
 * the node test runner gives each file its own process, so the require-cache surgery
 * cannot leak into any other suite.
 *
 * `touchesOverlap` is an EXTERNAL COLLABORATOR of the code under test, not its core
 * logic; stubbing it is fault injection at a module boundary, the same sanctioned
 * pattern as the safe-fs rename fault in tests/task-reconcile.test.js.
 */

'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Load task-registry FIRST so its own destructured `touchesOverlap` binding is REAL.
const reg = require('../src/lib/task-registry');
const planCoverage = require('../src/lib/plan-coverage');

const trPath = require.resolve('../src/lib/task-reconcile');
const realOverlap = planCoverage.touchesOverlap;

/** When non-null, the stubbed touchesOverlap throws with this message. */
let overlapFault = null;

/** @type {typeof import('../src/lib/task-reconcile')} */
let rec;

before(() => {
  planCoverage.touchesOverlap = (a, b) => {
    if (overlapFault !== null) throw new Error(overlapFault);
    return realOverlap(a, b);
  };
  delete require.cache[trPath];
  rec = require('../src/lib/task-reconcile'); // picks up the stubbed binding
});

after(() => {
  planCoverage.touchesOverlap = realOverlap;
  delete require.cache[trPath];
  overlapFault = null;
});

// ── deterministic clock + fixtures ──────────────────────────────────────────────

const NOW = Date.parse('2026-07-18T12:00:00.000Z');
const MIN = 60_000;
const OPTS = { now: NOW, liveAgentIds: null };

/** ISO string for `NOW - ageMs`. */
function ago(ageMs) {
  return new Date(NOW - ageMs).toISOString();
}

/**
 * A task orphaned on staleness alone, 10 minutes old — young enough that the
 * presumed-dead bound (2 × the 120-min `implement` floor) has NOT elapsed, so its files
 * are genuinely still reserved and the quarantine block really runs.
 */
function ageOnlyOrphan(over = {}) {
  return {
    id: over.id || 'orphan1',
    kind: 'implement',
    label: '',
    plan: 'plans/todo/held.md',
    status: 'orphaned',
    agentTaskId: null,
    touches: over.touches || ['src/a.js'],
    gitOp: false,
    blockedBy: [],
    result: {
      ok: false,
      orphanReason: 'staleness',
      summary: 'orphaned on staleness alone — the agent was never confirmed dead ' +
        'and may still be editing its files'
    },
    ts: { created: ago(10 * MIN), started: ago(10 * MIN), done: ago(1 * MIN) }
  };
}

/** A queued candidate. An empty `touches` set means it cannot conflict with anything. */
function queued(over = {}) {
  return {
    id: over.id || 'cand1',
    kind: over.kind || 'implement',
    label: '',
    plan: 'plans/todo/next.md',
    status: 'queued',
    agentTaskId: null,
    touches: over.touches || ['src/a.js'],
    gitOp: false,
    blockedBy: [],
    result: null,
    ts: { created: ago(2 * MIN), started: null, done: null }
  };
}

function mkReg(tasks) {
  return { version: reg.REGISTRY_VERSION, seq: tasks.length, tasks };
}

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-quarantine-fault-'));
  overlapFault = null;
});
afterEach(() => {
  overlapFault = null;
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Seed the on-disk registry with an age-only orphan plus the given candidates. */
function seed(candidates) {
  reg.save(root, mkReg([ageOnlyOrphan(), ...candidates]));
}

// ─────────────────────────────────────────────────────────────────────────────
// The filter phase — one candidate's overlap test throws
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcileState — the concurrent-edit guard fails safe when the overlap test throws', () => {
  it('records the fault on the report (phase, error, dropped ids)', () => {
    seed([queued({ id: 'cand1', touches: ['src/a.js'] })]);
    overlapFault = 'injected overlap fault';

    const { report } = rec.reconcileState(root, OPTS);

    assert.ok(report.quarantineFaulted, 'a thrown overlap test must be recorded, never swallowed');
    assert.equal(report.quarantineFaulted.phase, 'filter');
    assert.match(String(report.quarantineFaulted.error), /injected overlap fault/);
    assert.deepEqual(report.quarantineFaulted.dropped, ['cand1']);
  });

  it('DROPS the unchecked candidate instead of promoting it', () => {
    seed([queued({ id: 'cand1', touches: ['src/a.js'] })]);
    overlapFault = 'injected overlap fault';

    const { promote } = rec.reconcileState(root, OPTS);

    assert.ok(
      !promote.some(t => t.id === 'cand1'),
      'a candidate the guard could not clear must NOT be promoted — promoting it is ' +
      'exactly how two agents end up editing one file'
    );
  });

  it('surfaces the drop in report.quarantined with a reason naming the failed check', () => {
    seed([queued({ id: 'cand1', touches: ['src/a.js'] })]);
    overlapFault = 'injected overlap fault';

    const { report } = rec.reconcileState(root, OPTS);

    const entry = (report.quarantined || []).find(q => q.id === 'cand1');
    assert.ok(entry, 'the dropped candidate must appear in report.quarantined');
    assert.equal(entry.reason, 'quarantine-fault');
    assert.match(String(entry.summary), /overlap|could not be cleared/i);
  });

  it('keeps a non-editing candidate promotable through a fault (empty touches cannot conflict)', () => {
    seed([
      queued({ id: 'cand1', touches: ['src/a.js'] }),
      queued({ id: 'readonly1', kind: 'review', touches: [] })
    ]);
    overlapFault = 'injected overlap fault';

    const { report, promote } = rec.reconcileState(root, OPTS);

    assert.ok(promote.some(t => t.id === 'readonly1'), 'an empty touch set can never conflict');
    assert.ok(
      !(report.quarantined || []).some(q => q.id === 'readonly1'),
      'a candidate that was never at risk must not be reported as held'
    );
    assert.ok(!promote.some(t => t.id === 'cand1'), 'the editing candidate is still dropped');
  });

  it('still returns normally — a guard fault must never brick the render', () => {
    seed([queued({ id: 'cand1', touches: ['src/a.js'] })]);
    overlapFault = 'injected overlap fault';

    let out;
    assert.doesNotThrow(() => { out = rec.reconcileState(root, OPTS); });
    assert.ok(out.report, 'report present');
    assert.ok(Array.isArray(out.promote), 'promote present');
  });

  it('leaves the rest of the report untouched (only the quarantine differs)', () => {
    seed([queued({ id: 'cand1', touches: ['src/a.js'] })]);
    const clean = rec.reconcileState(root, OPTS).report;

    seed([queued({ id: 'cand1', touches: ['src/a.js'] })]);
    overlapFault = 'injected overlap fault';
    const faulted = rec.reconcileState(root, OPTS).report;

    assert.deepEqual(faulted.orphaned, clean.orphaned);
    assert.deepEqual(faulted.stalenessOrphaned, clean.stalenessOrphaned);
    assert.deepEqual(faulted.unsatisfiable, clean.unsatisfiable);
    assert.deepEqual(faulted.swept, clean.swept);
    assert.deepEqual(faulted.deferred, clean.deferred);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The collect phase — building the reserved file set throws
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcileState — a collect-phase fault drops every editing candidate', () => {
  /**
   * The collect loop reads plain properties off already-normalized task objects, so a
   * disk seed can never make it throw — a registry loaded from JSON only ever yields
   * plain arrays. Per decision 3 in the plan, the fault is therefore injected at the
   * `withRegistry` seam (which is how `reconcileState` actually reaches the registry —
   * not `load`, so the plan's stated substitution applies): the reserved-set loop is
   * handed a task whose `touches` IS an array (Array.isArray passes) but whose iterator
   * throws, which is precisely the shape the spread at the collect phase cannot survive.
   */
  function withCollectFault(fn) {
    const realWithRegistry = reg.withRegistry;
    const hostileTouches = ['src/a.js'];
    Object.defineProperty(hostileTouches, Symbol.iterator, {
      value: () => { throw new Error('injected collect fault'); },
      configurable: true,
      writable: true
    });
    const orphan = ageOnlyOrphan({ touches: hostileTouches });
    reg.withRegistry = (_root, mutator) => {
      mutator(
        mkReg([
          orphan,
          queued({ id: 'cand1', touches: ['src/a.js'] }),
          queued({ id: 'cand2', touches: ['src/b.js'] }),
          queued({ id: 'readonly1', kind: 'review', touches: [] })
        ]),
        { abort() { /* nothing is persisted in this fault drive */ } }
      );
    };
    try {
      return fn();
    } finally {
      reg.withRegistry = realWithRegistry;
    }
  }

  it('records phase "collect" and drops every candidate that declares a file', () => {
    const { report, promote } = withCollectFault(() => rec.reconcileState(root, OPTS));

    assert.ok(report.quarantineFaulted, 'a collect-phase fault must be recorded');
    assert.equal(report.quarantineFaulted.phase, 'collect');
    assert.match(String(report.quarantineFaulted.error), /injected collect fault/);
    assert.deepEqual(report.quarantineFaulted.dropped.slice().sort(), ['cand1', 'cand2']);

    assert.ok(!promote.some(t => t.id === 'cand1'), 'cand1 dropped — reserved set unknown');
    assert.ok(!promote.some(t => t.id === 'cand2'), 'cand2 dropped — reserved set unknown');
    assert.ok(promote.some(t => t.id === 'readonly1'), 'an empty touch set can never conflict');

    for (const id of ['cand1', 'cand2']) {
      const entry = (report.quarantined || []).find(q => q.id === id);
      assert.ok(entry, `${id} must be surfaced in report.quarantined`);
      assert.equal(entry.reason, 'quarantine-fault');
    }
    assert.ok(
      !(report.quarantined || []).some(q => q.id === 'readonly1'),
      'the read-only candidate was never at risk'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No fault — behaviour must be byte-identical to today's
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcileState — the no-fault path is unchanged', () => {
  it('quarantines the conflicting candidate with the original reason and no fault marker', () => {
    seed([
      queued({ id: 'cand1', touches: ['src/a.js'] }),
      queued({ id: 'readonly1', kind: 'review', touches: [] })
    ]);

    const { report, promote } = rec.reconcileState(root, OPTS);

    assert.equal(report.quarantineFaulted, undefined, 'no fault ⇒ the field is ABSENT, not null');
    assert.equal(report.quarantined.length, 1, 'exactly the one conflicting candidate is held');
    assert.equal(report.quarantined[0].id, 'cand1');
    assert.equal(report.quarantined[0].reason, 'staleness-orphan-quarantine');
    assert.equal(
      report.quarantined[0].summary,
      'held one pass — its files were freed by an AGE-ONLY orphaning ' +
      '(the previous holder was never confirmed dead and may still be editing them)'
    );
    assert.ok(!promote.some(t => t.id === 'cand1'), 'the real overlap still excludes it');
    assert.ok(promote.some(t => t.id === 'readonly1'), 'the non-conflicting candidate promotes');
  });

  it('promotes a candidate whose files do not overlap the reserved set', () => {
    seed([queued({ id: 'cand2', touches: ['src/b.js'] })]);

    const { report, promote } = rec.reconcileState(root, OPTS);

    assert.equal(report.quarantineFaulted, undefined);
    assert.deepEqual(report.quarantined, []);
    assert.ok(promote.some(t => t.id === 'cand2'));
  });
});

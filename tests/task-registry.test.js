/**
 * NB1 — Behavioral tests for src/lib/task-registry.js (Iron Loop Step 8, TDD).
 *
 * Maps all 14 BDD Acceptance-Criteria scenarios (ST-01…ST-14) + the strengthened
 * git-vs-git / read-only-alongside-git scenarios (ST-14b/ST-14c) + 11 edge tests
 * (ST-15…ST-25) from plans/todo/NB1-task-registry-and-scheduler.md.
 *
 * Persistence tests use isolated tmp roots (fs.mkdtempSync). Scheduler tests use
 * in-memory registry literals (no disk). ST-04/ST-24 use genuine fault injection
 * at the safe-fs boundary (the sanctioned pattern) — never mocking the code under
 * test. Raw fs/os are permitted in tests/** (eslint exempts the fs rule there).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../src/lib/task-registry');
const safeFs = require('../src/lib/safe-fs');

// ── tmp-root harness ────────────────────────────────────────────────────────

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-tasks-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ── in-memory scheduler helpers (no disk) ───────────────────────────────────

/** Build an in-memory registry value from an array of task literals. */
function mkReg(tasks) {
  return { version: reg.REGISTRY_VERSION, seq: tasks.length, tasks };
}

/** A task literal with sensible defaults, overridable per field. */
function T(over = {}) {
  return {
    id: over.id || 't?',
    kind: over.kind || 'review',
    label: over.label || '',
    plan: over.plan ?? null,
    status: over.status || 'running',
    agentTaskId: over.agentTaskId ?? null,
    touches: over.touches || [],
    gitOp: over.gitOp === true,
    blockedBy: over.blockedBy || [],
    result: over.result ?? null,
    ts: over.ts || { created: '2026-07-02T00:00:00.000Z', started: null, done: null }
  };
}

/** A queued candidate literal. */
function C(over = {}) {
  return T({ ...over, status: over.status || 'queued' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Task model and persistence
// ─────────────────────────────────────────────────────────────────────────────

describe('Task model and persistence', () => {
  it('ST-01: first load with no registry file returns empty, throws nothing', () => {
    const r = reg.load(root);
    assert.deepEqual(r.tasks, []);
    assert.equal(r.version, reg.REGISTRY_VERSION);
    assert.equal(r.seq, 0);
    // A first run is normal → no warn recorded.
    assert.deepEqual(reg.readWarnLog(root), []);
  });

  it('ST-02: a queued task round-trips through disk with a unique id + created ts', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, {
      kind: 'implement', label: 'build NB1', plan: 'NB1', touches: ['a.js'], gitOp: false
    });
    assert.equal(t.status, 'queued');
    assert.ok(t.id && typeof t.id === 'string');
    assert.ok(t.ts.created);
    reg.save(root, r);

    const back = reg.load(root);
    assert.equal(back.tasks.length, 1);
    const rt = back.tasks[0];
    assert.equal(rt.id, t.id);
    assert.equal(rt.status, 'queued');
    assert.ok(rt.ts.created);
    assert.deepEqual(rt.touches, ['a.js']);
    assert.equal(rt.gitOp, false);
    assert.equal(rt.kind, 'implement');
  });

  it('ST-03: only the single file .ctoc/state/tasks.json is used (no per-task files)', () => {
    const r = reg.emptyRegistry();
    reg.addTask(r, { kind: 'plan', label: 'p1' });
    reg.addTask(r, { kind: 'review', label: 'r1' });
    reg.addTask(r, { kind: 'implement', label: 'i1' });
    reg.save(root, r);

    const stateDir = path.join(root, '.ctoc', 'state');
    const entries = fs.readdirSync(stateDir);
    assert.deepEqual(entries, ['tasks.json']);
    assert.equal(reg.registryPath(root), path.join(stateDir, 'tasks.json'));
  });

  it('ST-04: an interrupted write leaves the complete prior state, never a truncated file', () => {
    const r = reg.emptyRegistry();
    reg.addTask(r, { kind: 'plan', label: 'prior' });
    reg.save(root, r); // known-good prior state on disk

    // Simulate a write interrupted before completion: rename fails after the temp
    // sibling was written. The target must remain the complete prior state.
    const orig = safeFs.renameSync;
    safeFs.renameSync = () => { throw new Error('EIO simulated interruption'); };
    try {
      const r2 = reg.emptyRegistry();
      reg.addTask(r2, { kind: 'plan', label: 'never-committed-1' });
      reg.addTask(r2, { kind: 'plan', label: 'never-committed-2' });
      assert.throws(() => reg.save(root, r2), /EIO simulated/);
    } finally {
      safeFs.renameSync = orig;
    }

    const back = reg.load(root);
    assert.equal(back.tasks.length, 1);
    assert.equal(back.tasks[0].label, 'prior');
    // No truncated/partial temp sibling left behind.
    const leftovers = fs.readdirSync(path.join(root, '.ctoc', 'state'))
      .filter(n => n !== 'tasks.json');
    assert.deepEqual(leftovers, []);
  });

  it('ST-05: a corrupt registry fails open (empty, no throw) and records a warning', () => {
    const p = reg.registryPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{ this is not valid json ]');

    let r;
    assert.doesNotThrow(() => { r = reg.load(root); });
    assert.deepEqual(r.tasks, []);

    const warns = reg.readWarnLog(root);
    assert.ok(warns.some(w => w.event === 'registry_load_failed'),
      'load failure must be surfaced (recorded), not swallowed silently');
  });

  it('ST-05b: wrong top-level shape and version mismatch each fail open + warn', () => {
    const p = reg.registryPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });

    fs.writeFileSync(p, JSON.stringify({ version: 1, seq: 0, tasks: 'not-an-array' }));
    let r = reg.load(root);
    assert.deepEqual(r.tasks, []);

    fs.writeFileSync(p, JSON.stringify({ version: 999, seq: 0, tasks: [] }));
    r = reg.load(root);
    assert.deepEqual(r.tasks, []);

    const events = reg.readWarnLog(root).map(w => w.event);
    assert.ok(events.filter(e => e === 'registry_load_failed').length >= 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler — canRun
// ─────────────────────────────────────────────────────────────────────────────

describe('Scheduler — canRun', () => {
  it('ST-06: max concurrency reached blocks a 6th candidate', () => {
    const running = [1, 2, 3, 4, 5].map(i => T({ id: `t${i}`, kind: 'review' }));
    const r = mkReg(running);
    const cand = C({ id: 't6', kind: 'review' });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'max-concurrent');
  });

  it('ST-07: a plan-mutating implement serializes FIFO behind a running implement', () => {
    const r = mkReg([T({ id: 't1', kind: 'implement', touches: ['x.js'] })]);
    const cand = C({ id: 't2', kind: 'implement', touches: ['y.js'] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'plan-serial');
  });

  it('ST-08: a file-conflict on overlapping touches blocks the candidate', () => {
    const r = mkReg([T({ id: 't1', kind: 'review', touches: ['a.js'] })]);
    const cand = C({ id: 't2', kind: 'review', touches: ['a.js', 'b.js'] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'file-conflict');
  });

  it('ST-09: disjoint file sets may run concurrently', () => {
    const r = mkReg([T({ id: 't1', kind: 'review', touches: ['a.js'] })]);
    const cand = C({ id: 't2', kind: 'review', touches: ['c.js'] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, true);
    assert.equal(d.reason, 'ok');
  });

  it('ST-10: git is mutually exclusive with editing tasks (both directions)', () => {
    // running editor + gitOp candidate → blocked
    const r1 = mkReg([T({ id: 't1', kind: 'review', touches: ['a.js'] })]);
    const d1 = reg.canRun(C({ id: 't2', kind: 'sync', gitOp: true, touches: [] }), r1);
    assert.equal(d1.run, false);
    assert.equal(d1.reason, 'git-exclusive');

    // running gitOp + editing candidate → blocked (reverse direction)
    const r2 = mkReg([T({ id: 't1', kind: 'sync', gitOp: true, touches: [] })]);
    const d2 = reg.canRun(C({ id: 't2', kind: 'review', touches: ['a.js'] }), r2);
    assert.equal(d2.run, false);
    assert.equal(d2.reason, 'git-exclusive');
  });

  it('ST-14b: two git operations never run concurrently (git-vs-git blocked)', () => {
    const r = mkReg([T({ id: 't1', kind: 'sync', gitOp: true, touches: [] })]);
    const cand = C({ id: 't2', kind: 'sync', gitOp: true, touches: [] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'git-exclusive');
  });

  it('ST-14c: a read-only task may run alongside a git operation', () => {
    const r = mkReg([T({ id: 't1', kind: 'sync', gitOp: true, touches: [] })]);
    const cand = C({ id: 't2', kind: 'review', gitOp: false, touches: [] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, true);
    assert.equal(d.reason, 'ok');
  });

  it('ST-11: an eligible candidate with no conflicts runs', () => {
    const r = mkReg([T({ id: 't1', kind: 'review', touches: ['a.js'] })]);
    const cand = C({ id: 't2', kind: 'review', touches: ['b.js'] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, true);
    assert.equal(d.reason, 'ok');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler — nextRunnable
// ─────────────────────────────────────────────────────────────────────────────

describe('Scheduler — nextRunnable', () => {
  it('ST-12: completion unblocks a dependent queued task; every returned task passes canRun', () => {
    const done = T({ id: 't1', kind: 'plan', status: 'done', touches: [] });
    const dependent = C({ id: 't2', kind: 'review', touches: ['a.js'], blockedBy: ['t1'] });
    const r = mkReg([done, dependent]);
    const out = reg.nextRunnable(r);
    assert.deepEqual(out.map(t => t.id), ['t2']);
    for (const t of out) {
      assert.equal(reg.canRun(t, r).run, true);
    }
  });

  it('ST-13: nothing eligible yet → empty list', () => {
    // Candidate blocked by a still-running dependency.
    const running = T({ id: 't1', kind: 'plan', status: 'running' });
    const blocked = C({ id: 't2', kind: 'review', blockedBy: ['t1'] });
    const r = mkReg([running, blocked]);
    assert.deepEqual(reg.nextRunnable(r), []);
  });

  it('ST-14: a satisfied (done) dependency no longer contributes to blocking', () => {
    const done = T({ id: 't1', kind: 'plan', status: 'done' });
    const cand = C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['t1'] });
    const r = mkReg([done, cand]);
    // canRun-level: dep satisfied → ok.
    assert.equal(reg.canRun(cand, r).run, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge / implied tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge / boundary behavior', () => {
  it('ST-15: ids are unique + strictly monotonic; seq persists; no id reuse after reload', () => {
    const r = reg.emptyRegistry();
    const a = reg.addTask(r, { kind: 'plan' });
    const b = reg.addTask(r, { kind: 'plan' });
    const c = reg.addTask(r, { kind: 'plan' });
    assert.deepEqual([a.id, b.id, c.id], ['t1', 't2', 't3']);

    // Prune the middle task, then persist + reload.
    r.tasks = r.tasks.filter(t => t.id !== 't2');
    reg.save(root, r);
    const back = reg.load(root);
    assert.equal(back.seq, 3, 'seq persists across reload');

    // Next add never reuses a pruned id.
    const d = reg.addTask(back, { kind: 'plan' });
    assert.equal(d.id, 't4');
  });

  it('ST-15b: seq is repaired on load so it can never collide with an existing id', () => {
    const p = reg.registryPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // Legacy/degraded file: seq behind the highest existing numeric id suffix.
    fs.writeFileSync(p, JSON.stringify({
      version: reg.REGISTRY_VERSION,
      seq: 0,
      tasks: [T({ id: 't5', kind: 'plan', status: 'queued' })]
    }));
    const r = reg.load(root);
    assert.equal(r.tasks.length, 1);
    const next = reg.addTask(r, { kind: 'plan' });
    assert.equal(next.id, 't6', 'repaired seq must exceed the highest existing id suffix');
  });

  it('ST-16: status transitions — valid ones succeed, invalid ones throw', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'implement' });

    // queued → running → done
    reg.updateTask(r, t.id, { status: 'running' });
    reg.updateTask(r, t.id, { status: 'done' });
    assert.equal(reg.load ? t.status : t.status, 'done');

    // fresh task: queued → running → failed
    const t2 = reg.addTask(r, { kind: 'review' });
    reg.updateTask(r, t2.id, { status: 'running' });
    reg.updateTask(r, t2.id, { status: 'failed' });
    assert.equal(t2.status, 'failed');

    // fresh task: running → orphaned
    const t3 = reg.addTask(r, { kind: 'sync' });
    reg.updateTask(r, t3.id, { status: 'running' });
    reg.updateTask(r, t3.id, { status: 'orphaned' });
    assert.equal(t3.status, 'orphaned');

    // invalid: queued → done (skips running)
    const t4 = reg.addTask(r, { kind: 'plan' });
    assert.throws(() => reg.updateTask(r, t4.id, { status: 'done' }), /invalid transition/);

    // invalid: out of a terminal state (done → running)
    assert.throws(() => reg.updateTask(r, t.id, { status: 'running' }), /invalid transition/);

    // invalid: unknown status value
    const t5 = reg.addTask(r, { kind: 'plan' });
    assert.throws(() => reg.updateTask(r, t5.id, { status: 'bogus' }));
  });

  it('ST-16b: same-status update is an allowed no-op (no ts change)', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, t.id, { status: 'running' });
    const started = t.ts.started;
    reg.updateTask(r, t.id, { status: 'running' }); // no-op
    assert.equal(t.ts.started, started);
  });

  it('ST-17: empty-registry canRun → ok; a lone candidate is not self-blocked on its own touches', () => {
    const r = reg.emptyRegistry();
    const cand = C({ id: 't1', kind: 'implement', touches: ['a.js'], gitOp: true });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, true);
    assert.equal(d.reason, 'ok');

    // Candidate already present in the registry as running must not conflict with itself.
    const r2 = mkReg([T({ id: 't1', kind: 'review', touches: ['a.js'] })]);
    const self = { ...r2.tasks[0], status: 'queued' };
    assert.equal(reg.canRun(self, r2).run, true);
  });

  it('ST-18: gitOp+implement precedence walks the ladder in order', () => {
    const both = C({ id: 'tc', kind: 'implement', gitOp: true, touches: ['z.js'] });

    // running implement → plan-serial (Rule 2 before Rule 3)
    const rImpl = mkReg([T({ id: 't1', kind: 'implement', touches: ['x.js'] })]);
    assert.equal(reg.canRun(both, rImpl).reason, 'plan-serial');

    // running non-implement editor, no running implement → git-exclusive (Rule 3)
    const rEdit = mkReg([T({ id: 't1', kind: 'review', touches: ['x.js'] })]);
    assert.equal(reg.canRun(both, rEdit).reason, 'git-exclusive');

    // alone → ok
    assert.equal(reg.canRun(both, reg.emptyRegistry()).reason, 'ok');
  });

  it('ST-19: a failed or missing dependency keeps a candidate blocked (canRun + nextRunnable)', () => {
    const failedDep = T({ id: 't1', kind: 'plan', status: 'failed' });
    const candFailed = C({ id: 't2', kind: 'review', blockedBy: ['t1'] });
    const rFailed = mkReg([failedDep, candFailed]);
    assert.equal(reg.canRun(candFailed, rFailed).reason, 'blocked-dep');
    assert.deepEqual(reg.nextRunnable(rFailed).map(t => t.id), []);

    // Missing dep id (never in registry).
    const candMissing = C({ id: 't9', kind: 'review', blockedBy: ['does-not-exist'] });
    const rMissing = mkReg([candMissing]);
    assert.equal(reg.canRun(candMissing, rMissing).reason, 'blocked-dep');
    assert.deepEqual(reg.nextRunnable(rMissing).map(t => t.id), []);

    // orphaned dep also blocks
    const orphanDep = T({ id: 't1', kind: 'plan', status: 'orphaned' });
    const candOrphan = C({ id: 't2', kind: 'review', blockedBy: ['t1'] });
    assert.equal(reg.canRun(candOrphan, mkReg([orphanDep, candOrphan])).reason, 'blocked-dep');
  });

  it('ST-20: timestamps — created on add; started on →running; done on →done; created ≤ started ≤ done', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'implement' });
    assert.ok(t.ts.created);
    assert.equal(t.ts.started, null);
    assert.equal(t.ts.done, null);

    reg.updateTask(r, t.id, { status: 'running' });
    assert.ok(t.ts.started);
    reg.updateTask(r, t.id, { status: 'done' });
    assert.ok(t.ts.done);

    assert.ok(t.ts.created <= t.ts.started, 'created ≤ started');
    assert.ok(t.ts.started <= t.ts.done, 'started ≤ done');
  });

  it('ST-21: greedy cumulative nextRunnable is jointly startable', () => {
    // (a) fill-to-cap: 3 running + 5 disjoint queued → exactly the FIFO first 2.
    const running3 = [1, 2, 3].map(i => T({ id: `r${i}`, kind: 'review', touches: [`r${i}.js`] }));
    const queued5 = [1, 2, 3, 4, 5].map(i => C({ id: `q${i}`, kind: 'review', touches: [`q${i}.js`] }));
    const rA = mkReg([...running3, ...queued5]);
    assert.deepEqual(reg.nextRunnable(rA).map(t => t.id), ['q1', 'q2']);

    // (b) file-cumulative: q1,q2 both touch a.js → q1 only.
    const rB = mkReg([
      C({ id: 'q1', kind: 'review', touches: ['a.js'] }),
      C({ id: 'q2', kind: 'review', touches: ['a.js'] })
    ]);
    assert.deepEqual(reg.nextRunnable(rB).map(t => t.id), ['q1']);

    // (c) plan-serial-cumulative: two implement → FIFO-first only.
    const rC = mkReg([
      C({ id: 'q1', kind: 'implement', touches: ['a.js'] }),
      C({ id: 'q2', kind: 'implement', touches: ['b.js'] })
    ]);
    assert.deepEqual(reg.nextRunnable(rC).map(t => t.id), ['q1']);

    // (d) git-cumulative: editor + gitOp → FIFO-first only.
    const rD = mkReg([
      C({ id: 'q1', kind: 'review', touches: ['a.js'] }),
      C({ id: 'q2', kind: 'sync', gitOp: true, touches: [] })
    ]);
    assert.deepEqual(reg.nextRunnable(rD).map(t => t.id), ['q1']);
  });

  it('ST-21b: a task blockedBy a task accepted earlier in the SAME pass is not returned', () => {
    // t1 done, t2 depends on t1 (runnable), t3 depends on t2 (still queued this pass).
    const r = mkReg([
      T({ id: 't1', kind: 'plan', status: 'done' }),
      C({ id: 't2', kind: 'review', touches: ['a.js'], blockedBy: ['t1'] }),
      C({ id: 't3', kind: 'review', touches: ['b.js'], blockedBy: ['t2'] })
    ]);
    assert.deepEqual(reg.nextRunnable(r).map(t => t.id), ['t2']);
  });

  it('ST-22: updateTask on an unknown id throws', () => {
    const r = reg.emptyRegistry();
    assert.throws(() => reg.updateTask(r, 'nope', { status: 'running' }), /unknown id/);
  });

  it('ST-22b: updateTask rejects an id change (id is immutable)', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'plan' });
    assert.throws(() => reg.updateTask(r, t.id, { id: 'tX' }), /id is immutable/);
  });

  it('ST-22c: updateTask honors an explicitly-supplied ts (no auto-stamp override)', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, t.id, { status: 'running', ts: { started: '2020-01-01T00:00:00.000Z' } });
    assert.equal(t.ts.started, '2020-01-01T00:00:00.000Z');
  });

  it('ST-05c: readWarnLog fails open to [] on a corrupt log file', () => {
    const lp = path.join(root, '.ctoc', 'logs', 'task-registry.json');
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.writeFileSync(lp, 'not json at all');
    assert.deepEqual(reg.readWarnLog(root), []);
  });

  it('ST-23: addTask validation — unknown kind / non-array touches / non-array blockedBy throw; gitOp coerced; defaults applied', () => {
    const r = reg.emptyRegistry();
    assert.throws(() => reg.addTask(r, { kind: 'nonsense' }));
    assert.throws(() => reg.addTask(r, { kind: 'plan', touches: 'a.js' }));
    assert.throws(() => reg.addTask(r, { kind: 'plan', blockedBy: 't1' }));
    assert.throws(() => reg.addTask(r, null));

    // gitOp strict-coerced to a real boolean.
    const t = reg.addTask(r, { kind: 'plan', gitOp: 'yes' });
    assert.equal(t.gitOp, false);
    const t2 = reg.addTask(r, { kind: 'sync', gitOp: true });
    assert.equal(t2.gitOp, true);

    // defaults
    assert.deepEqual(t.touches, []);
    assert.deepEqual(t.blockedBy, []);
    assert.equal(t.label, '');
    assert.equal(t.plan, null);
    assert.equal(t.status, 'queued');
    assert.equal(t.agentTaskId, null);
    assert.equal(t.result, null);
  });

  it('ST-24: save failure (fault-injected rename) — temp cleaned, target intact, error rethrown, warned', () => {
    const r = reg.emptyRegistry();
    reg.addTask(r, { kind: 'plan', label: 'good' });
    reg.save(root, r); // establish a good target

    const orig = safeFs.renameSync;
    safeFs.renameSync = () => { throw new Error('ENOSPC simulated'); };
    try {
      const r2 = reg.emptyRegistry();
      reg.addTask(r2, { kind: 'plan', label: 'doomed' });
      assert.throws(() => reg.save(root, r2), /ENOSPC simulated/);
    } finally {
      safeFs.renameSync = orig;
    }

    // No temp sibling left behind.
    const leftovers = fs.readdirSync(path.join(root, '.ctoc', 'state'))
      .filter(n => n !== 'tasks.json');
    assert.deepEqual(leftovers, []);

    // Target still holds the complete prior good state.
    const back = reg.load(root);
    assert.equal(back.tasks.length, 1);
    assert.equal(back.tasks[0].label, 'good');

    // Failure surfaced in the warn log.
    assert.ok(reg.readWarnLog(root).some(w => w.event === 'registry_save_failed'));
  });

  it('ST-25: per-task fail-open on load — good tasks load, one malformed entry is skipped + warned', () => {
    const p = reg.registryPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({
      version: reg.REGISTRY_VERSION,
      seq: 3,
      tasks: [
        T({ id: 't1', kind: 'plan', status: 'queued' }),
        { id: 't2', kind: 'not-a-kind', status: 'queued' }, // malformed → skip
        T({ id: 't3', kind: 'review', status: 'queued' })
      ]
    }));

    const r = reg.load(root);
    assert.deepEqual(r.tasks.map(t => t.id).sort(), ['t1', 't3']);
    assert.ok(reg.readWarnLog(root).some(w => w.event === 'task_skipped_malformed'));
  });

  it('ST-25b: duplicate ids on load are de-duplicated (last wins) with a warning', () => {
    const p = reg.registryPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({
      version: reg.REGISTRY_VERSION,
      seq: 1,
      tasks: [
        T({ id: 't1', kind: 'plan', status: 'queued', label: 'first' }),
        T({ id: 't1', kind: 'review', status: 'queued', label: 'second' })
      ]
    }));
    const r = reg.load(root);
    assert.equal(r.tasks.filter(t => t.id === 't1').length, 1);
    assert.equal(r.tasks[0].label, 'second');
    assert.ok(reg.readWarnLog(root).some(w => w.event === 'task_id_collision'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exported constants
// ─────────────────────────────────────────────────────────────────────────────

describe('Exported constants + surface', () => {
  it('exposes MAX_CONCURRENT=5, REGISTRY_VERSION=1, frozen KINDS incl. only implement as plan-mutating', () => {
    assert.equal(reg.MAX_CONCURRENT, 5);
    assert.equal(reg.REGISTRY_VERSION, 1);
    assert.ok(reg.KINDS.has('implement'));
    assert.ok(reg.KINDS.has('sync'));
    assert.ok(reg.PLAN_MUTATING_KINDS.has('implement'));
    assert.equal(reg.PLAN_MUTATING_KINDS.has('plan'), false);
    assert.ok(Object.isFrozen(reg.KINDS)); // frozen
    assert.ok(Object.isFrozen(reg.PLAN_MUTATING_KINDS));
  });

  it('load/save throw TypeError on a non-string root (caller bug, before any I/O)', () => {
    assert.throws(() => reg.load(''), TypeError);
    assert.throws(() => reg.load(null), TypeError);
    assert.throws(() => reg.save(123, reg.emptyRegistry()), TypeError);
    assert.throws(() => reg.save(root, null), TypeError);
  });
});

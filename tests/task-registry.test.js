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
    reg.addTask(r, { kind: 'implement', label: 'i1', touches: ['i1.js'] });
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

  it('ST-07: two implement tasks with DISJOINT touches run concurrently (file-based — plan-serial GONE, vision F1)', () => {
    const r = mkReg([T({ id: 't1', kind: 'implement', touches: ['x.js'] })]);
    const cand = C({ id: 't2', kind: 'implement', touches: ['y.js'] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, true);
    assert.equal(d.reason, 'ok');
  });

  it('ST-07b: two implement tasks with OVERLAPPING touches serialize via file-conflict (not kind)', () => {
    const r = mkReg([T({ id: 't1', kind: 'implement', touches: ['x.js'] })]);
    const cand = C({ id: 't2', kind: 'implement', touches: ['x.js', 'y.js'] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'file-conflict');
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
    // A NON-sync gitOp task isolates Rule 3 (git-exclusive) from Rule 2 (sync-barrier);
    // sync's barrier semantics are covered separately (ST-SYNC-*).
    // running editor + gitOp candidate → blocked
    const r1 = mkReg([T({ id: 't1', kind: 'review', touches: ['a.js'] })]);
    const d1 = reg.canRun(C({ id: 't2', kind: 'plan', gitOp: true, touches: [] }), r1);
    assert.equal(d1.run, false);
    assert.equal(d1.reason, 'git-exclusive');

    // running gitOp + editing candidate → blocked (reverse direction)
    const r2 = mkReg([T({ id: 't1', kind: 'plan', gitOp: true, touches: [] })]);
    const d2 = reg.canRun(C({ id: 't2', kind: 'review', touches: ['a.js'] }), r2);
    assert.equal(d2.run, false);
    assert.equal(d2.reason, 'git-exclusive');
  });

  it('ST-14b: two git operations never run concurrently (git-vs-git blocked)', () => {
    const r = mkReg([T({ id: 't1', kind: 'plan', gitOp: true, touches: [] })]);
    const cand = C({ id: 't2', kind: 'plan', gitOp: true, touches: [] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'git-exclusive');
  });

  it('ST-14c: a read-only task may run alongside a (non-sync) git operation', () => {
    const r = mkReg([T({ id: 't1', kind: 'plan', gitOp: true, touches: [] })]);
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

  it('F1: canRun validates the candidate and throws on a malformed shape — never false-safes', () => {
    // A running task edits a.js. A candidate with a BARE-STRING touches ('a.js'
    // instead of ['a.js']) would make isEditing() false and coerce Rule 4 to []
    // → canRun would wrongly return {run:true} against the same-file running task.
    // The safety oracle must instead reject the malformed candidate LOUDLY.
    const r = mkReg([T({ id: 't1', kind: 'review', touches: ['a.js'] })]);
    assert.throws(
      () => reg.canRun({ kind: 'review', touches: 'a.js' }, r),
      /touches must be an array/
    );
    assert.throws(
      () => reg.canRun({ kind: 'review', blockedBy: 't1' }, r),
      /blockedBy must be an array/
    );
    assert.throws(
      () => reg.canRun({ kind: 'review', gitOp: 'yes' }, r),
      /gitOp must be a boolean/
    );
    assert.throws(() => reg.canRun(null, r), TypeError);

    // A well-formed candidate still evaluates normally (disjoint file → ok).
    const ok = reg.canRun(C({ id: 't2', kind: 'review', touches: ['c.js'] }), r);
    assert.equal(ok.run, true);
    assert.equal(ok.reason, 'ok');
    // …and a well-formed same-file candidate is correctly blocked (not false-safed).
    const blocked = reg.canRun(C({ id: 't3', kind: 'review', touches: ['a.js'] }), r);
    assert.equal(blocked.run, false);
    assert.equal(blocked.reason, 'file-conflict');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mandatory touches for implement (safety oracle) + glob-aware file conflict
// ─────────────────────────────────────────────────────────────────────────────

describe('Scheduler — mandatory implement touches + glob-aware Rule 4', () => {
  it('ST-TOUCHES-1: addTask requires non-empty touches for implement; other kinds accept empty', () => {
    const r = reg.emptyRegistry();
    assert.throws(() => reg.addTask(r, { kind: 'implement' }), /implement task requires non-empty touches/);
    assert.throws(() => reg.addTask(r, { kind: 'implement', touches: [] }), /implement task requires non-empty touches/);
    // non-implement kinds are fine with omitted/empty touches
    assert.doesNotThrow(() => reg.addTask(r, { kind: 'plan' }));
    assert.doesNotThrow(() => reg.addTask(r, { kind: 'review', touches: [] }));
    // implement WITH touches is accepted
    const t = reg.addTask(r, { kind: 'implement', touches: ['a.js'] });
    assert.equal(t.kind, 'implement');
  });

  it('ST-TOUCHES-2: canRun throws (fail-loud) on an implement candidate with empty touches', () => {
    const r = reg.emptyRegistry();
    assert.throws(
      () => reg.canRun(C({ id: 't1', kind: 'implement', touches: [] }), r),
      /implement task requires non-empty touches/
    );
  });

  it('ST-GLOB: Rule 4 is glob-aware in BOTH directions; disjoint globs run concurrently', () => {
    // running glob touch conflicts with a matching literal candidate
    const rGlob = mkReg([T({ id: 't1', kind: 'review', touches: ['src/lib/*.js'] })]);
    assert.equal(reg.canRun(C({ id: 't2', kind: 'review', touches: ['src/lib/actions.js'] }), rGlob).reason, 'file-conflict');

    // mirrored: running literal, candidate glob
    const rLit = mkReg([T({ id: 't1', kind: 'review', touches: ['src/lib/actions.js'] })]);
    assert.equal(reg.canRun(C({ id: 't2', kind: 'review', touches: ['src/lib/*.js'] }), rLit).reason, 'file-conflict');

    // disjoint globs run concurrently
    const rSrc = mkReg([T({ id: 't1', kind: 'review', touches: ['src/lib/*.js'] })]);
    const d = reg.canRun(C({ id: 't2', kind: 'review', touches: ['tests/*.js'] }), rSrc);
    assert.equal(d.run, true);
    assert.equal(d.reason, 'ok');
  });
});

describe('Scheduler — sync barrier (wave integration boundary)', () => {
  it('ST-SYNC-1: a sync candidate may not start while ANY task runs', () => {
    const r = mkReg([T({ id: 't1', kind: 'review', touches: ['a.js'] })]);
    const d = reg.canRun(C({ id: 't2', kind: 'sync', gitOp: true, touches: [] }), r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'sync-barrier');
  });

  it('ST-SYNC-2: NO candidate may start while a sync task runs (even a read-only one)', () => {
    const r = mkReg([T({ id: 't1', kind: 'sync', gitOp: true, touches: [] })]);
    const d = reg.canRun(C({ id: 't2', kind: 'review', touches: [] }), r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'sync-barrier');
  });

  it('ST-SYNC-3: a sync candidate against an empty running set is runnable', () => {
    const d = reg.canRun(C({ id: 't1', kind: 'sync', gitOp: true, touches: [] }), reg.emptyRegistry());
    assert.equal(d.run, true);
    assert.equal(d.reason, 'ok');
  });

  it('ST-SYNC-4: nextRunnable never co-selects a sync with anything (sync runs alone)', () => {
    // sync FIFO-first, empty running → only the sync starts
    const rSyncFirst = mkReg([
      C({ id: 'q1', kind: 'sync', gitOp: true, touches: [] }),
      C({ id: 'q2', kind: 'review', touches: ['a.js'] })
    ]);
    assert.deepEqual(reg.nextRunnable(rSyncFirst).map(t => t.id), ['q1']);

    // non-sync FIFO-first → the sync is blocked behind it
    const rSyncLast = mkReg([
      C({ id: 'q1', kind: 'review', touches: ['a.js'] }),
      C({ id: 'q2', kind: 'sync', gitOp: true, touches: [] })
    ]);
    assert.deepEqual(reg.nextRunnable(rSyncLast).map(t => t.id), ['q1']);
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

  it('F2: nextRunnable is JOINTLY startable across every rule in one multi-rule pass (file-based)', () => {
    // One registry exercising all rules cumulatively:
    //   2 running (r1 edits a.js, r2 edits r2.js)
    //   queued FIFO: editor-on-a.js, second-editor-on-a.js, implement#1,
    //                implement#2, sync, disjoint-editor-on-z.js
    const running = [
      T({ id: 'r1', kind: 'review', status: 'running', touches: ['a.js'] }),
      T({ id: 'r2', kind: 'review', status: 'running', touches: ['r2.js'] })
    ];
    const queued = [
      C({ id: 'q1', kind: 'review', touches: ['a.js'] }),      // file-conflict vs r1 → blocked
      C({ id: 'q2', kind: 'review', touches: ['a.js'] }),      // file-conflict vs r1 → blocked
      C({ id: 'q3', kind: 'implement', touches: ['i1.js'] }),  // disjoint → accepted
      C({ id: 'q4', kind: 'implement', touches: ['i2.js'] }),  // disjoint implement (plan-serial GONE) → accepted
      C({ id: 'q5', kind: 'sync', gitOp: true, touches: [] }), // sync-barrier vs running set → blocked
      C({ id: 'q6', kind: 'review', touches: ['z.js'] })       // disjoint, slot free → accepted
    ];
    const r = mkReg([...running, ...queued]);

    const returned = reg.nextRunnable(r);
    assert.deepEqual(returned.map(t => t.id), ['q3', 'q4', 'q6'], 'exact FIFO-greedy subset');

    // Each returned task individually satisfies the ladder vs the REAL running set.
    for (const t of returned) {
      assert.equal(reg.canRun(t, r).run, true, `${t.id} passes canRun`);
    }

    // The UNION (real-running ∪ returned) jointly satisfies EVERY invariant.
    const union = [...running, ...returned];
    // ≤5 concurrent
    assert.ok(union.length <= reg.MAX_CONCURRENT, 'union ≤ MAX_CONCURRENT');
    // a sync (wave barrier) never runs alongside anything
    const syncs = union.filter(t => t.kind === 'sync');
    if (syncs.length > 0) assert.equal(union.length, 1, 'a sync runs alone');
    // no gitOp alongside any editing/git task
    const gitOps = union.filter(t => t.gitOp === true);
    const editing = union.filter(t => Array.isArray(t.touches) && t.touches.length > 0);
    if (gitOps.length > 0) {
      assert.equal(gitOps.length, 1, 'at most one git op in union');
      assert.equal(editing.length, 0, 'no editing task alongside a git op');
    }
    // no two share a touched file
    const seen = new Set();
    for (const t of union) {
      for (const f of (Array.isArray(t.touches) ? t.touches : [])) {
        assert.ok(!seen.has(f), `no two tasks share touched file ${f}`);
        seen.add(f);
      }
    }
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
    const t = reg.addTask(r, { kind: 'implement', touches: ['x.js'] });

    // queued → running → done
    reg.updateTask(r, t.id, { status: 'running' });
    reg.updateTask(r, t.id, { status: 'done' });
    assert.equal(t.status, 'done');

    // fresh task: queued → running → failed
    const t2 = reg.addTask(r, { kind: 'review' });
    reg.updateTask(r, t2.id, { status: 'running' });
    reg.updateTask(r, t2.id, { status: 'failed' });
    assert.equal(t2.status, 'failed');

    // fresh task: running → orphaned
    // R3-B item 12: a sync barrier MUST declare what it integrates (addTask now enforces it).
    const t3 = reg.addTask(r, { kind: 'sync', blockedBy: [t2.id] });
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

  it('ST-18: the concurrency ladder is walked in order (max → sync-barrier → git-exclusive → file-conflict)', () => {
    // sync-barrier precedes git-exclusive: a sync candidate against a running editor
    const rEditor = mkReg([T({ id: 't1', kind: 'review', touches: ['x.js'] })]);
    assert.equal(reg.canRun(C({ id: 'tc', kind: 'sync', gitOp: true, touches: [] }), rEditor).reason, 'sync-barrier');

    // git-exclusive precedes file-conflict: a gitOp editing candidate vs a running gitOp editor
    const both = C({ id: 'tc', kind: 'implement', gitOp: true, touches: ['z.js'] });
    const rGitOp = mkReg([T({ id: 't1', kind: 'implement', gitOp: true, touches: ['x.js'] })]);
    assert.equal(reg.canRun(both, rGitOp).reason, 'git-exclusive');

    // file-conflict when neither sync nor git applies (two non-git implements, same file)
    const rFile = mkReg([T({ id: 't1', kind: 'implement', touches: ['z.js'] })]);
    assert.equal(reg.canRun(C({ id: 'tc', kind: 'implement', touches: ['z.js'] }), rFile).reason, 'file-conflict');

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
    const t = reg.addTask(r, { kind: 'implement', touches: ['x.js'] });
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

    // (c) file-based implement: two implement with DISJOINT touches → BOTH (plan-serial GONE).
    const rC = mkReg([
      C({ id: 'q1', kind: 'implement', touches: ['a.js'] }),
      C({ id: 'q2', kind: 'implement', touches: ['b.js'] })
    ]);
    assert.deepEqual(reg.nextRunnable(rC).map(t => t.id), ['q1', 'q2']);

    // (c2) two implement with OVERLAPPING touches → FIFO-first only.
    const rC2 = mkReg([
      C({ id: 'q1', kind: 'implement', touches: ['a.js'] }),
      C({ id: 'q2', kind: 'implement', touches: ['a.js'] })
    ]);
    assert.deepEqual(reg.nextRunnable(rC2).map(t => t.id), ['q1']);

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
    const t2 = reg.addTask(r, { kind: 'sync', gitOp: true, blockedBy: [t.id] });
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

  it('F4: an absurd seq on load never mints a duplicate id on the next two addTask calls', () => {
    const p = reg.registryPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // A crafted seq beyond Number.MAX_SAFE_INTEGER breaks ++seq monotonicity
    // (seq + 1 === seq), which would reuse ids. load() must clamp it to a safe value.
    fs.writeFileSync(p, JSON.stringify({
      version: reg.REGISTRY_VERSION,
      seq: Number.MAX_SAFE_INTEGER + 1000,
      tasks: [T({ id: 't2', kind: 'plan', status: 'queued' })]
    }));

    const r = reg.load(root);
    const a = reg.addTask(r, { kind: 'plan' });
    const b = reg.addTask(r, { kind: 'plan' });

    const ids = r.tasks.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate ids after two adds');
    assert.notEqual(a.id, b.id, 'the two new ids differ');
    assert.notEqual(a.id, 't2');
    assert.notEqual(b.id, 't2');
    assert.ok(
      reg.readWarnLog(root).some(w => w.event === 'registry_seq_clamped'),
      'the absurd seq clamp is surfaced (recorded), not swallowed'
    );
  });

  it('F5a: out-of-terminal transitions failed→running AND orphaned→running both throw', () => {
    const r = reg.emptyRegistry();

    // Drive one task to failed, another to orphaned.
    const tf = reg.addTask(r, { kind: 'review' });
    reg.updateTask(r, tf.id, { status: 'running' });
    reg.updateTask(r, tf.id, { status: 'failed' });
    assert.throws(() => reg.updateTask(r, tf.id, { status: 'running' }), /invalid transition/);

    const to = reg.addTask(r, { kind: 'sync', blockedBy: [tf.id] });
    reg.updateTask(r, to.id, { status: 'running' });
    reg.updateTask(r, to.id, { status: 'orphaned' });
    assert.throws(() => reg.updateTask(r, to.id, { status: 'running' }), /invalid transition/);
  });

  it('F5b: cyclic and self blockedBy stay permanently blocked-dep; nextRunnable returns [] without hanging', () => {
    // Cycle: t1 blockedBy t2, t2 blockedBy t1 (neither can ever be done first).
    const cyclic = mkReg([
      C({ id: 't1', kind: 'review', blockedBy: ['t2'] }),
      C({ id: 't2', kind: 'review', blockedBy: ['t1'] })
    ]);
    assert.equal(reg.canRun(cyclic.tasks[0], cyclic).reason, 'blocked-dep');
    assert.equal(reg.canRun(cyclic.tasks[1], cyclic).reason, 'blocked-dep');
    assert.deepEqual(reg.nextRunnable(cyclic), []); // returns, does not recurse/hang

    // Self-dependency: t1 blockedBy t1.
    const selfDep = mkReg([C({ id: 't1', kind: 'review', blockedBy: ['t1'] })]);
    assert.equal(reg.canRun(selfDep.tasks[0], selfDep).reason, 'blocked-dep');
    assert.deepEqual(reg.nextRunnable(selfDep), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancel — cancelled terminal status + transitions
// ─────────────────────────────────────────────────────────────────────────────

describe('Cancel — cancelled status + transitions', () => {
  it('ST-CANCEL-1: queued → cancelled is immediate; a running task cancels via running → cancelling → cancelled (C1-2 replaced contract)', () => {
    const r = reg.emptyRegistry();
    const q = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, q.id, { status: 'cancelled' });
    assert.equal(q.status, 'cancelled');
    assert.ok(q.ts.done, 'cancel stamps ts.done like other terminal transitions');

    // A running task no longer cancels DIRECTLY (that would free its files under a
    // live agent — C1-2). It must pass through the non-terminal `cancelling` state.
    const run = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, run.id, { status: 'running' });
    assert.throws(() => reg.updateTask(r, run.id, { status: 'cancelled' }), /invalid transition/);
    reg.updateTask(r, run.id, { status: 'cancelling' });
    reg.updateTask(r, run.id, { status: 'cancelled' });
    assert.equal(run.status, 'cancelled');
    assert.ok(run.ts.done);
  });

  it('ST-CANCEL-2: done/failed/orphaned → cancelled throw; cancelled → anything throws (terminal)', () => {
    const r = reg.emptyRegistry();
    const done = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, done.id, { status: 'running' });
    reg.updateTask(r, done.id, { status: 'done' });
    assert.throws(() => reg.updateTask(r, done.id, { status: 'cancelled' }), /invalid transition/);

    const failed = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, failed.id, { status: 'running' });
    reg.updateTask(r, failed.id, { status: 'failed' });
    assert.throws(() => reg.updateTask(r, failed.id, { status: 'cancelled' }), /invalid transition/);

    const orph = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, orph.id, { status: 'running' });
    reg.updateTask(r, orph.id, { status: 'orphaned' });
    assert.throws(() => reg.updateTask(r, orph.id, { status: 'cancelled' }), /invalid transition/);

    const c = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, c.id, { status: 'cancelled' });
    assert.throws(() => reg.updateTask(r, c.id, { status: 'running' }), /invalid transition/);
    assert.throws(() => reg.updateTask(r, c.id, { status: 'done' }), /invalid transition/);
  });

  it('ST-CANCEL-3: a cancelled task neither occupies a slot nor satisfies blockedBy', () => {
    // Not running → frees its file (does not occupy a slot).
    const cancelledRunner = T({ id: 't1', kind: 'review', status: 'cancelled', touches: ['a.js'] });
    const cand = C({ id: 't2', kind: 'review', touches: ['a.js'] });
    assert.equal(reg.canRun(cand, mkReg([cancelledRunner, cand])).run, true);

    // Does not satisfy a dependency (deps require done).
    const dep = T({ id: 't1', kind: 'plan', status: 'cancelled' });
    const dependent = C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['t1'] });
    assert.equal(reg.canRun(dependent, mkReg([dep, dependent])).reason, 'blocked-dep');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Settled sync barrier deps (C1-1 — kind-aware depsSatisfied)
// ─────────────────────────────────────────────────────────────────────────────

describe('Scheduler — settled sync barrier deps (C1-1)', () => {
  it('C1-1a: a sync candidate is runnable when every dep is SETTLED (terminal), even one failed', () => {
    const depsReg = mkReg([
      T({ id: 't1', kind: 'implement', status: 'done', touches: ['a.js'] }),
      T({ id: 't2', kind: 'implement', status: 'failed', touches: ['b.js'] })
    ]);
    const cand = C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1', 't2'] });
    const d = reg.canRun(cand, depsReg);
    assert.equal(d.run, true, 'a barrier waits for the wave to SETTLE, not to succeed');
    assert.equal(d.reason, 'ok');
  });

  it('C1-1a2: cancelled and orphaned deps also count as settled for a sync candidate', () => {
    const depsReg = mkReg([
      T({ id: 't1', kind: 'implement', status: 'cancelled', touches: ['a.js'] }),
      T({ id: 't2', kind: 'implement', status: 'orphaned', touches: ['b.js'] })
    ]);
    const cand = C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1', 't2'] });
    assert.equal(reg.canRun(cand, depsReg).run, true);
  });

  it('C1-1b: a sync candidate is BLOCKED while any dep is still running (not yet settled)', () => {
    const depsReg = mkReg([
      T({ id: 't1', kind: 'implement', status: 'done', touches: ['a.js'] }),
      T({ id: 't2', kind: 'implement', status: 'running', touches: ['b.js'] })
    ]);
    const cand = C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1', 't2'] });
    assert.equal(reg.canRun(cand, depsReg).reason, 'blocked-dep');
  });

  it('C1-1b2: a cancelling dep is not settled → a sync candidate stays blocked-dep', () => {
    const depsReg = mkReg([T({ id: 't1', kind: 'implement', status: 'cancelling', touches: ['a.js'] })]);
    const cand = C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1'] });
    assert.equal(reg.canRun(cand, depsReg).reason, 'blocked-dep');
  });

  it('C1-1c: a MISSING dep id never satisfies — a sync candidate is blocked-dep', () => {
    const cand = C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['ghost'] });
    assert.equal(reg.canRun(cand, reg.emptyRegistry()).reason, 'blocked-dep');
  });

  it('C1-1d: a NON-sync candidate keeps done-only deps (a failed dep still blocks)', () => {
    const depsReg = mkReg([T({ id: 't1', kind: 'implement', status: 'failed', touches: ['a.js'] })]);
    const cand = C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['t1'] });
    assert.equal(reg.canRun(cand, depsReg).reason, 'blocked-dep');
  });

  it('C1-1e: an AGE-ONLY orphan dep does NOT settle a sync barrier (agent may still be editing)', () => {
    // A dep orphaned on staleness ALONE carries result.orphanReason:'staleness' — it was
    // never confirmed dead, so the wave has NOT settled and a sync integration barrier that
    // committed now could snapshot a half-written tree. It counts as settled only once
    // reconcile flips the marker (confirmed-/presumed-dead), which the across-passes release
    // bounds, so this is time-bounded and cannot deadlock the barrier (C1-1f).
    const depsReg = mkReg([
      T({ id: 't1', kind: 'implement', status: 'done', touches: ['a.js'] }),
      T({ id: 't2', kind: 'implement', status: 'orphaned', touches: ['b.js'],
         result: { ok: false, orphanReason: 'staleness', summary: 'orphaned on staleness alone' } })
    ]);
    const cand = C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1', 't2'] });
    assert.equal(reg.canRun(cand, depsReg).reason, 'blocked-dep');
  });

  it('C1-1f: only a CONFIRMED-gone orphan settles a sync barrier — presumed-dead (age) does NOT', () => {
    // Human ruling 2026-07-26: an irreversible wave-integration commit must not rest on an
    // AGE heuristic. 'confirmed-dead' (agent confirmed gone by the live-agent list) settles;
    // 'presumed-dead' (merely aged past a bound — still age) does NOT. The barrier waits for
    // genuine liveness confirmation rather than committing over a possibly-live tree.
    const confirmed = mkReg([
      T({ id: 't1', kind: 'implement', status: 'orphaned', touches: ['b.js'],
         result: { ok: false, orphanReason: 'confirmed-dead', summary: 'agent confirmed gone' } })
    ]);
    assert.equal(reg.canRun(C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1'] }), confirmed).run,
      true, 'confirmed-dead settles the barrier');

    const presumed = mkReg([
      T({ id: 't1', kind: 'implement', status: 'orphaned', touches: ['b.js'],
         result: { ok: false, orphanReason: 'presumed-dead', summary: 'aged past the bound' } })
    ]);
    assert.equal(reg.canRun(C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1'] }), presumed).reason,
      'blocked-dep', 'presumed-dead is an age heuristic — it must NOT settle an irreversible commit');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concurrent-edit BELT in canRun (human ruling 2026-07-26 — belt-and-suspenders)
//
// The file-conflict quarantine (a candidate that would edit files still reserved by an
// age-only orphan whose agent may still be alive) is ALSO enforced at canRun — the single
// oracle every status→running transition must consult — so no caller that computes its own
// promote set can start a colliding task. The projection (task-reconcile.applyQuarantine)
// remains the reporter/suspenders. The belt uses the SAME predicate the file quarantine
// uses (orphanReason === 'staleness' only), so the two agree: once the reservation is
// released (presumed-/confirmed-dead), both let the candidate run.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scheduler — concurrent-edit belt in canRun (BELT)', () => {
  const staleOrphan = (over = {}) => T({
    id: 'o1', kind: 'implement', status: 'orphaned', touches: over.touches || ['src/x.js'],
    result: { ok: false, orphanReason: over.orphanReason || 'staleness', summary: 'age-only' }
  });

  it('BELT-1: a candidate overlapping an age-only orphan\'s reserved files is REFUSED by canRun', () => {
    const r = mkReg([staleOrphan({ touches: ['src/x.js'] })]);
    const cand = C({ id: 't2', kind: 'implement', touches: ['src/x.js'] });
    assert.equal(reg.canRun(cand, r).reason, 'staleness-orphan-quarantine');
  });

  it('BELT-1b: a glob-overlapping candidate is refused too (uses touchesOverlap, glob-aware)', () => {
    const r = mkReg([staleOrphan({ touches: ['src/lib/*.js'] })]);
    const cand = C({ id: 't2', kind: 'implement', touches: ['src/lib/actions.js'] });
    assert.equal(reg.canRun(cand, r).reason, 'staleness-orphan-quarantine');
  });

  it('BELT-2: a DISJOINT candidate runs — the belt holds only genuine collisions', () => {
    const r = mkReg([staleOrphan({ touches: ['src/x.js'] })]);
    const cand = C({ id: 't2', kind: 'implement', touches: ['src/y.js'] });
    assert.equal(reg.canRun(cand, r).run, true);
  });

  it('BELT-3: a RELEASED orphan (presumed-/confirmed-dead) no longer holds the candidate', () => {
    for (const reason of ['presumed-dead', 'confirmed-dead']) {
      const r = mkReg([staleOrphan({ touches: ['src/x.js'], orphanReason: reason })]);
      const cand = C({ id: 't2', kind: 'implement', touches: ['src/x.js'] });
      assert.equal(reg.canRun(cand, r).run, true, `${reason} released the reservation`);
    }
  });

  it('BELT-4: an empty-touches candidate can never be held (Rule 4 fast path)', () => {
    const r = mkReg([staleOrphan({ touches: ['src/x.js'] })]);
    const cand = C({ id: 't2', kind: 'review', touches: [] });
    assert.equal(reg.canRun(cand, r).run, true);
  });

  it('BELT-5: nextRunnable still OFFERS the colliding candidate — the projection reports/holds it', () => {
    // Belt-and-suspenders: canRun is the hard belt, applyQuarantine the reporter. nextRunnable
    // remains the raw projection so the projection can name what it held (see the parity fence).
    const r = mkReg([staleOrphan({ touches: ['src/x.js'] }), C({ id: 't2', kind: 'implement', touches: ['src/x.js'] })]);
    assert.ok(reg.nextRunnable(r).some(t => t.id === 't2'), 'nextRunnable offers t2; applyQuarantine holds+reports it');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancelling status (C1-2 — non-terminal, occupies its slot)
// ─────────────────────────────────────────────────────────────────────────────

describe('Cancelling status (C1-2)', () => {
  it('C1-2a: running → cancelling → cancelled; cancelling is non-terminal (no ts.done until cancelled)', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'implement', touches: ['a.js'] });
    reg.updateTask(r, t.id, { status: 'running' });
    reg.updateTask(r, t.id, { status: 'cancelling' });
    assert.equal(t.status, 'cancelling');
    assert.equal(t.ts.done, null, 'cancelling is non-terminal → files stay locked, no ts.done yet');
    reg.updateTask(r, t.id, { status: 'cancelled' });
    assert.equal(t.status, 'cancelled');
    assert.ok(t.ts.done, 'cancelled (terminal) stamps ts.done');
  });

  it('C1-2b: queued → cancelling is rejected (only a running task can enter cancelling)', () => {
    const r = reg.emptyRegistry();
    const q = reg.addTask(r, { kind: 'plan' });
    assert.throws(() => reg.updateTask(r, q.id, { status: 'cancelling' }), /invalid transition/);
  });

  it('C1-2c: a cancelling task OCCUPIES its slot, touches and gitOp (canRun sees file-conflict)', () => {
    const r = mkReg([T({ id: 't1', kind: 'implement', status: 'cancelling', touches: ['a.js'] })]);
    const cand = C({ id: 't2', kind: 'implement', touches: ['a.js'] });
    const d = reg.canRun(cand, r);
    assert.equal(d.run, false, 'files stay locked until the agent is confirmed gone');
    assert.equal(d.reason, 'file-conflict');
  });

  it('C1-2c2: a cancelling task counts toward max-concurrent and the sync barrier', () => {
    const occ = [1, 2, 3, 4].map(i => T({ id: `t${i}`, kind: 'review' }));
    occ.push(T({ id: 't5', kind: 'review', status: 'cancelling' }));
    assert.equal(reg.canRun(C({ id: 't6', kind: 'review' }), mkReg(occ)).reason, 'max-concurrent');

    const rSync = mkReg([T({ id: 't1', kind: 'review', status: 'cancelling', touches: ['a.js'] })]);
    assert.equal(reg.canRun(C({ id: 's', kind: 'sync', gitOp: true, touches: [] }), rSync).reason, 'sync-barrier');
  });

  it('C1-2c3: a cancelling gitOp task blocks an editing candidate (git-exclusive still applies)', () => {
    const r = mkReg([T({ id: 't1', kind: 'plan', status: 'cancelling', gitOp: true, touches: [] })]);
    assert.equal(reg.canRun(C({ id: 't2', kind: 'review', touches: ['a.js'] }), r).reason, 'git-exclusive');
  });

  it('C1-2d: cancelling → done records an honest late completion, keeping the result', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'implement', touches: ['a.js'] });
    reg.updateTask(r, t.id, { status: 'running' });
    reg.updateTask(r, t.id, { status: 'cancelling' });
    reg.updateTask(r, t.id, { status: 'done', result: { ok: true, summary: 'finished despite cancel' } });
    assert.equal(t.status, 'done');
    assert.deepEqual(t.result, { ok: true, summary: 'finished despite cancel' });
    assert.ok(t.ts.done);
  });

  it('C1-2e: cancelling → failed is allowed; queued → cancelled stays immediate', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'review' });
    reg.updateTask(r, t.id, { status: 'running' });
    reg.updateTask(r, t.id, { status: 'cancelling' });
    reg.updateTask(r, t.id, { status: 'failed' });
    assert.equal(t.status, 'failed');

    const q = reg.addTask(r, { kind: 'plan' });
    reg.updateTask(r, q.id, { status: 'cancelled' });
    assert.equal(q.status, 'cancelled');
    assert.ok(q.ts.done);
  });

  it('C1-2f: a cancelling task neither satisfies a done-dep nor a settled-sync dep (still in flight)', () => {
    const dep = T({ id: 't1', kind: 'plan', status: 'cancelling' });
    const nonSync = C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['t1'] });
    assert.equal(reg.canRun(nonSync, mkReg([dep, nonSync])).reason, 'blocked-dep');
    const sync = C({ id: 't3', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1'] });
    assert.equal(reg.canRun(sync, mkReg([dep, sync])).reason, 'blocked-dep');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Orphaned late completion (C1-5 — a falsely-orphaned agent that finishes is accepted)
// ─────────────────────────────────────────────────────────────────────────────

describe('Orphaned late completion (C1-5)', () => {
  it('C1-5a: orphaned → done is accepted and re-stamps ts.done', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'implement', touches: ['a.js'] });
    reg.updateTask(r, t.id, { status: 'running' });
    reg.updateTask(r, t.id, { status: 'orphaned' });
    reg.updateTask(r, t.id, { status: 'done', result: { ok: true, summary: 'late completion' } });
    assert.equal(t.status, 'done');
    assert.deepEqual(t.result, { ok: true, summary: 'late completion' });
    assert.ok(t.ts.done, 'ts.done re-stamped on the accepted completion');
  });

  it('C1-5b: orphaned → failed is accepted (a late failure is recorded honestly)', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'review' });
    reg.updateTask(r, t.id, { status: 'running' });
    reg.updateTask(r, t.id, { status: 'orphaned' });
    reg.updateTask(r, t.id, { status: 'failed' });
    assert.equal(t.status, 'failed');
  });

  it('C1-5c: orphaned → running / cancelled / cancelling remain rejected (only completion escapes)', () => {
    const r = reg.emptyRegistry();
    const t = reg.addTask(r, { kind: 'review' });
    reg.updateTask(r, t.id, { status: 'running' });
    reg.updateTask(r, t.id, { status: 'orphaned' });
    assert.throws(() => reg.updateTask(r, t.id, { status: 'running' }), /invalid transition/);
    assert.throws(() => reg.updateTask(r, t.id, { status: 'cancelled' }), /invalid transition/);
    assert.throws(() => reg.updateTask(r, t.id, { status: 'cancelling' }), /invalid transition/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// unsatisfiableTasks (C1-1/C1-7 — surface the permanently-wedged)
// ─────────────────────────────────────────────────────────────────────────────

describe('unsatisfiableTasks (C1-1/C1-7)', () => {
  it('U-1: a non-sync queued task with a FAILED dep is unsatisfiable (dep-failed)', () => {
    const r = mkReg([
      T({ id: 't1', kind: 'implement', status: 'failed', touches: ['a.js'] }),
      C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['t1'] })
    ]);
    const out = reg.unsatisfiableTasks(r);
    assert.equal(out.length, 1);
    assert.equal(out[0].task.id, 't2');
    assert.equal(out[0].reason, 'dep-failed');
    assert.deepEqual(out[0].deps, ['t1']);
  });

  it('U-1b: orphaned and cancelled deps also make a non-sync task unsatisfiable (terminal-non-done)', () => {
    const r = mkReg([
      T({ id: 't1', kind: 'plan', status: 'orphaned' }),
      T({ id: 't2', kind: 'plan', status: 'cancelled' }),
      C({ id: 'a', kind: 'review', touches: ['a.js'], blockedBy: ['t1'] }),
      C({ id: 'b', kind: 'review', touches: ['b.js'], blockedBy: ['t2'] })
    ]);
    assert.deepEqual(reg.unsatisfiableTasks(r).map(o => o.task.id).sort(), ['a', 'b']);
  });

  it('U-2: a queued task with a MISSING dep is unsatisfiable (dep-missing), sync or not', () => {
    const r = mkReg([
      C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['ghost'] }),
      C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['ghost'] })
    ]);
    const byId = new Map(reg.unsatisfiableTasks(r).map(o => [o.task.id, o.reason]));
    assert.equal(byId.get('t2'), 'dep-missing');
    assert.equal(byId.get('s'), 'dep-missing');
  });

  it('U-3: a two-task blockedBy cycle marks both members dep-cycle (iterative, no hang)', () => {
    const r = mkReg([
      C({ id: 't1', kind: 'review', touches: ['a.js'], blockedBy: ['t2'] }),
      C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['t1'] })
    ]);
    const out = reg.unsatisfiableTasks(r);
    assert.deepEqual(out.map(o => o.task.id).sort(), ['t1', 't2']);
    assert.ok(out.every(o => o.reason === 'dep-cycle'));
  });

  it('U-4: a self blockedBy cycle marks the task dep-cycle', () => {
    const r = mkReg([C({ id: 't1', kind: 'review', touches: ['a.js'], blockedBy: ['t1'] })]);
    const out = reg.unsatisfiableTasks(r);
    assert.deepEqual(out.map(o => o.task.id), ['t1']);
    assert.equal(out[0].reason, 'dep-cycle');
  });

  it('U-4b: a three-task cycle marks all three; a plain DAG chain marks none', () => {
    const cyc = mkReg([
      C({ id: 't1', kind: 'review', touches: ['a.js'], blockedBy: ['t3'] }),
      C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['t1'] }),
      C({ id: 't3', kind: 'review', touches: ['c.js'], blockedBy: ['t2'] })
    ]);
    assert.deepEqual(reg.unsatisfiableTasks(cyc).map(o => o.task.id).sort(), ['t1', 't2', 't3']);

    // A pure chain t1(done) → t2 → t3 with no back edge is NOT a cycle.
    const dag = mkReg([
      T({ id: 't1', kind: 'plan', status: 'done' }),
      C({ id: 't2', kind: 'review', touches: ['b.js'], blockedBy: ['t1'] }),
      C({ id: 't3', kind: 'review', touches: ['c.js'], blockedBy: ['t2'] })
    ]);
    assert.deepEqual(reg.unsatisfiableTasks(dag), []);
  });

  it('U-5: a SYNC task with merely FAILED deps is NOT unsatisfiable (settled ≠ unsatisfiable)', () => {
    const r = mkReg([
      T({ id: 't1', kind: 'implement', status: 'failed', touches: ['a.js'] }),
      C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1'] })
    ]);
    assert.deepEqual(reg.unsatisfiableTasks(r), []);
  });

  it('U-5b: a SYNC task blocked by an AGE-ONLY orphan is NOT unsatisfiable (settles once released)', () => {
    // The C1-1e exclusion makes such a sync BLOCKED, not permanently wedged: the reconcile
    // across-passes release is guaranteed to flip the orphan off 'staleness' within a bounded
    // window, after which the barrier settles. Reporting it unsatisfiable would falsely fail
    // legal wave-integration work.
    const r = mkReg([
      T({ id: 't1', kind: 'implement', status: 'orphaned', touches: ['a.js'],
         result: { ok: false, orphanReason: 'staleness', summary: 'age-only' } }),
      C({ id: 's', kind: 'sync', gitOp: true, touches: [], blockedBy: ['t1'] })
    ]);
    assert.deepEqual(reg.unsatisfiableTasks(r), []);
  });

  it('U-6: satisfiable queued tasks (done dep, running dep, no deps) are excluded', () => {
    const r = mkReg([
      T({ id: 't1', kind: 'plan', status: 'done' }),
      T({ id: 't2', kind: 'plan', status: 'running' }),
      C({ id: 'a', kind: 'review', touches: ['a.js'], blockedBy: ['t1'] }),
      C({ id: 'b', kind: 'review', touches: ['b.js'], blockedBy: ['t2'] }),
      C({ id: 'c', kind: 'review', touches: ['c.js'] })
    ]);
    assert.deepEqual(reg.unsatisfiableTasks(r), []);
  });

  it('U-7: only QUEUED tasks are considered (a running task with a failed dep is not reported)', () => {
    const r = mkReg([
      T({ id: 't1', kind: 'implement', status: 'failed', touches: ['a.js'] }),
      T({ id: 't2', kind: 'review', status: 'running', blockedBy: ['t1'] })
    ]);
    assert.deepEqual(reg.unsatisfiableTasks(r), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addAndClaim — atomic add-and-claim (one load→save cycle)
// ─────────────────────────────────────────────────────────────────────────────

describe('addAndClaim — atomic add-and-claim', () => {
  it('ST-CLAIM-1: on an empty registry returns claimed:true, persists a running task with ts.started', () => {
    const out = reg.addAndClaim(root, { kind: 'implement', plan: 'p1', touches: ['a.js'] });
    assert.equal(out.claimed, true);
    assert.equal(out.reason, 'ok');
    assert.equal(out.task.status, 'running');
    assert.ok(out.task.ts.started, 'a claimed task is stamped started');

    const back = reg.load(root);
    assert.equal(back.tasks.length, 1, 'exactly one task on disk');
    assert.equal(back.tasks[0].id, out.task.id);
    assert.equal(back.tasks[0].status, 'running');
  });

  it('ST-CLAIM-2: a conflicting running task → claimed:false, reason file-conflict, persisted queued', () => {
    reg.addAndClaim(root, { kind: 'implement', plan: 'p1', touches: ['a.js'] }); // running
    const out = reg.addAndClaim(root, { kind: 'implement', plan: 'p2', touches: ['a.js'] });
    assert.equal(out.claimed, false);
    assert.equal(out.reason, 'file-conflict');
    assert.equal(out.task.status, 'queued');

    const back = reg.load(root);
    const queued = back.tasks.filter(t => t.status === 'queued');
    assert.equal(queued.length, 1);
    assert.equal(queued[0].id, out.task.id);
  });

  it('ST-CLAIM-3: a malformed spec throws and persists NOTHING', () => {
    // implement with empty touches is malformed under the mandatory-touches rule.
    assert.throws(() => reg.addAndClaim(root, { kind: 'implement', touches: [] }));
    const back = reg.load(root);
    assert.deepEqual(back.tasks, [], 'no partial write survives a rejected spec');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Drain-stop flag trio (graceful "finish current, then stop")
// ─────────────────────────────────────────────────────────────────────────────

describe('Drain-stop flag trio', () => {
  it('ST-DRAIN-1: request → is → clear round-trip; a fresh root is false', () => {
    assert.equal(reg.isDrainStopRequested(root), false);
    reg.requestDrainStop(root);
    assert.equal(reg.isDrainStopRequested(root), true);
    reg.clearDrainStop(root);
    assert.equal(reg.isDrainStopRequested(root), false);
  });

  it('ST-DRAIN-2: clear on a fresh root is a no-op (does not throw)', () => {
    assert.doesNotThrow(() => reg.clearDrainStop(root));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exported constants
// ─────────────────────────────────────────────────────────────────────────────

describe('precompute kind (streaming gate-question generation)', () => {
  it('accepts the precompute kind — the streaming precompute loop records a task per plan ref', () => {
    assert.ok(
      reg.KINDS.has('precompute'),
      'precompute must be a valid kind: without it `menu task add precompute` throws, ' +
      'record-first fails, no lens critic is ever dispatched, no questions file is ' +
      'written, and the streaming screen falls back to the bare gate prompt.'
    );
  });

  it('records a precompute task and runs disjoint refs concurrently', () => {
    const r = reg.emptyRegistry();
    const a = reg.addTask(r, {
      kind: 'precompute',
      plan: 'review/00003-r2a.md',
      touches: ['.ctoc/streaming/questions/review__00003-r2a.md.json'],
    });
    assert.equal(a.kind, 'precompute');
    assert.equal(reg.canRun(a, r).run, true, 'a recorded precompute task is runnable');

    // A second ref touches a DIFFERENT questions file, so the two run concurrently.
    a.status = 'running';
    const b = reg.addTask(r, {
      kind: 'precompute',
      plan: 'review/00004-r2b.md',
      touches: ['.ctoc/streaming/questions/review__00004-r2b.md.json'],
    });
    assert.equal(reg.canRun(b, r).run, true, 'disjoint questions files never serialize');

    // Same ref twice DOES serialize — two writers to one questions file would clobber.
    const dup = reg.addTask(r, {
      kind: 'precompute',
      plan: 'review/00003-r2a.md',
      touches: ['.ctoc/streaming/questions/review__00003-r2a.md.json'],
    });
    const d = reg.canRun(dup, r);
    assert.equal(d.run, false);
    assert.equal(d.reason, 'file-conflict');
  });
});

describe('Exported constants + surface', () => {
  it('exposes MAX_CONCURRENT=5, REGISTRY_VERSION=1, frozen KINDS; kind-based plan-serial export is removed', () => {
    assert.equal(reg.MAX_CONCURRENT, 5);
    assert.equal(reg.REGISTRY_VERSION, 1);
    assert.ok(reg.KINDS.has('implement'));
    assert.ok(reg.KINDS.has('sync'));
    assert.ok(Object.isFrozen(reg.KINDS)); // frozen
    // Kind-based plan-serial is deleted (vision F1): the export must be gone.
    assert.equal(reg.PLAN_MUTATING_KINDS, undefined);
    // New exports exist and are functions.
    for (const fn of ['addAndClaim', 'requestDrainStop', 'isDrainStopRequested', 'clearDrainStop']) {
      assert.equal(typeof reg[fn], 'function', `exports ${fn}`);
    }
  });

  it('load/save throw TypeError on a non-string root (caller bug, before any I/O)', () => {
    assert.throws(() => reg.load(''), TypeError);
    assert.throws(() => reg.load(null), TypeError);
    assert.throws(() => reg.save(123, reg.emptyRegistry()), TypeError);
    assert.throws(() => reg.save(root, null), TypeError);
  });
});

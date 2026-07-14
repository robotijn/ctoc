/**
 * NB4 — Behavioral tests for src/lib/task-reconcile.js (Iron Loop Step 8, TDD).
 *
 * Maps all 8 plan BDD scenarios + the concurrency test + 4 defense-in-depth edge
 * tests from plans/todo/NB4-reconciliation-and-resilience.md (Step 7 SPEC).
 *
 * Pure `reconcile` tests use in-memory registry literals (no disk). The I/O tests
 * (`reconcileState`, `sweepTempArtifacts`) use isolated tmp roots (fs.mkdtempSync)
 * and inject `now`/thresholds via `opts` for determinism — NEVER sleep. The
 * save-failure test uses genuine fault injection at the safe-fs boundary (the
 * sanctioned pattern from task-registry.test.js ST-04/ST-24) — never mocking the
 * code under test. Raw fs/os are permitted in tests/** (eslint exempts the fs rule).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rec = require('../src/lib/task-reconcile');
const reg = require('../src/lib/task-registry');
const safeFs = require('../src/lib/safe-fs');

// ── deterministic clock + threshold constants for tests ─────────────────────────

const NOW = Date.parse('2026-07-06T12:00:00.000Z');
const MIN = 60_000;
const GRACE = 60_000;          // 60 s
const STALE = 30 * MIN;        // 30 min
const RETENTION = 7 * 24 * 60 * MIN; // 7 days
const TEMP_TTL = 60 * MIN;     // 1 h

/** ISO string for `NOW - ageMs`. */
function ago(ageMs) {
  return new Date(NOW - ageMs).toISOString();
}

/** A running task literal, overridable. */
function running(over = {}) {
  return {
    id: over.id || 't1',
    kind: over.kind || 'implement',
    label: over.label || '',
    plan: over.plan ?? 'plans/todo/x.md',
    status: 'running',
    agentTaskId: over.agentTaskId ?? null,
    touches: over.touches || [],
    gitOp: over.gitOp === true,
    blockedBy: over.blockedBy || [],
    result: over.result ?? null,
    ts: {
      created: over.created || ago(2 * STALE),
      started: over.started || ago(2 * STALE),
      done: null
    }
  };
}

/** A terminal (or any-status) task literal, overridable. */
function task(over = {}) {
  return {
    id: over.id || 'tX',
    kind: over.kind || 'review',
    label: over.label || '',
    plan: over.plan ?? null,
    status: over.status || 'done',
    agentTaskId: over.agentTaskId ?? null,
    touches: over.touches || [],
    gitOp: over.gitOp === true,
    blockedBy: over.blockedBy || [],
    result: over.result ?? null,
    ts: {
      created: over.created || ago(0),
      started: over.started || null,
      done: 'done' in over ? over.done : ago(0)
    }
  };
}

/** Wrap a task array in a registry value. */
function mkReg(tasks) {
  return { version: reg.REGISTRY_VERSION, seq: tasks.length, tasks };
}

const OPTS = { now: NOW, graceMs: GRACE, staleThresholdMs: STALE, retentionMs: RETENTION };

// ── tmp-root harness (I/O tests only) ───────────────────────────────────────────

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-reconcile-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ─────────────────────────────────────────────────────────────────────────────
// Session-restart orphan detection (pure reconcile)
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — orphan detection', () => {
  it('orphan-no-live-agent: running task with no matching live agent is orphaned', () => {
    const r = mkReg([running({ id: 't1', agentTaskId: 'agent-A', started: ago(STALE + MIN) })]);
    const { tasks, report } = rec.reconcile(r, { ...OPTS, liveAgentIds: new Set(['agent-OTHER']) });
    const t = tasks.tasks.find(x => x.id === 't1');
    assert.equal(t.status, 'orphaned', 'unmatched running task must be orphaned');
    assert.equal(t.ts.done, new Date(NOW).toISOString(), 'orphaning stamps ts.done = now');
    assert.deepEqual(report.orphaned, ['t1']);
    assert.equal(report.corrupt, null);
  });

  it('running-with-live-agent-left-alone: matching live agent keeps running, untouched', () => {
    const input = mkReg([running({ id: 't1', agentTaskId: 'agent-A', started: ago(STALE + MIN) })]);
    const before = JSON.parse(JSON.stringify(input.tasks[0]));
    const { tasks, report } = rec.reconcile(input, { ...OPTS, liveAgentIds: ['agent-A', 'agent-B'] });
    const t = tasks.tasks.find(x => x.id === 't1');
    assert.equal(t.status, 'running', 'live-confirmed task stays running');
    assert.deepEqual(t, before, 'live-confirmed task is not modified at all');
    assert.deepEqual(report.orphaned, []);
  });

  it('staleness-backstop-when-no-TaskList: old running orphaned, young running left alone', () => {
    // kind 'review' keeps the 30-min floor (implement/sync get 120 min — C1-5).
    const old = running({ id: 't-old', kind: 'review', agentTaskId: 'a1', started: ago(STALE + MIN) });
    const young = running({ id: 't-young', kind: 'review', agentTaskId: 'a2', started: ago(STALE - 5 * MIN) });
    const { tasks, report } = rec.reconcile(mkReg([old, young]), { ...OPTS, liveAgentIds: null });
    const gotOld = tasks.tasks.find(x => x.id === 't-old');
    const gotYoung = tasks.tasks.find(x => x.id === 't-young');
    assert.equal(gotOld.status, 'orphaned', 'stale running orphaned when TaskList unavailable');
    assert.equal(gotYoung.status, 'running', 'sub-threshold running left alone (age gate, not blanket)');
    assert.deepEqual(report.orphaned, ['t-old']);
  });

  it('young-running-never-orphaned: running inside graceMs is never orphaned even with no live id', () => {
    const fresh = running({ id: 't1', agentTaskId: 'a1', started: ago(GRACE - 10_000) });
    // TaskList present but no match, yet within grace → left alone (just-dispatched race).
    const { tasks, report } = rec.reconcile(mkReg([fresh]), { ...OPTS, liveAgentIds: new Set() });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'running');
    assert.deepEqual(report.orphaned, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Orphaned offered for re-run via the scheduler (never a direct launch)
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — orphan frees the scheduler for re-run', () => {
  it('orphaned-offered-for-rerun-via-canRun: candidate goes from blocked to runnable via canRun', () => {
    // MAX_CONCURRENT running, one of them orphan-eligible (no live id, stale).
    const tasks = [];
    for (let i = 0; i < reg.MAX_CONCURRENT; i++) {
      tasks.push(running({ id: 't' + i, agentTaskId: 'a' + i, kind: 'review', started: ago(STALE + MIN) }));
    }
    const before = mkReg(tasks);
    const candidate = { kind: 'review', touches: [], blockedBy: [], gitOp: false, id: 'cand' };
    assert.equal(reg.canRun(candidate, before).run, false, 'blocked before reconcile');
    assert.equal(reg.canRun(candidate, before).reason, 'max-concurrent');

    const { tasks: after } = rec.reconcile(before, { ...OPTS, liveAgentIds: null });
    // With all 5 stale + no TaskList, all orphan → slots free.
    assert.equal(reg.canRun(candidate, after).run, true, 're-run allowed AFTER reconcile (scheduler path)');
  });

  it('orphaned-frees-a-concurrency-slot: exactly one orphan frees exactly one slot', () => {
    const tasks = [];
    // 4 live-confirmed running + 1 stale orphan-eligible = 5 total (== MAX).
    for (let i = 0; i < reg.MAX_CONCURRENT - 1; i++) {
      tasks.push(running({ id: 't' + i, agentTaskId: 'live' + i, started: ago(STALE + MIN) }));
    }
    tasks.push(running({ id: 'stale', agentTaskId: 'ghost', started: ago(STALE + MIN) }));
    const before = mkReg(tasks);
    const live = new Set(['live0', 'live1', 'live2', 'live3']); // 'ghost' absent → orphan
    const candidate = { kind: 'review', touches: [], blockedBy: [], gitOp: false, id: 'cand' };

    assert.equal(reg.canRun(candidate, before).reason, 'max-concurrent', 'full before reconcile');
    const { tasks: after, report } = rec.reconcile(before, { ...OPTS, liveAgentIds: live });
    assert.deepEqual(report.orphaned, ['stale'], 'only the ghost orphaned');
    // Exactly one slot freed: 4 running remain → candidate now runnable.
    const stillRunning = after.tasks.filter(t => t.status === 'running');
    assert.equal(stillRunning.length, reg.MAX_CONCURRENT - 1, 'one slot vacated');
    assert.equal(reg.canRun(candidate, after).run, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failure surfacing and fail-open
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — failure surfacing and fail-open', () => {
  it('agent-failure-surfaced-not-lost: failed task surfaces in report and is never dropped', () => {
    const failed = task({ id: 'tf', status: 'failed', result: { summary: 'boom: ENOENT' }, done: ago(0) });
    const { tasks, report } = rec.reconcile(mkReg([failed]), { ...OPTS, liveAgentIds: null });
    assert.equal(report.failed.length, 1, 'failure surfaced');
    assert.deepEqual(report.failed[0], { id: 'tf', summary: 'boom: ENOENT' });
    const t = tasks.tasks.find(x => x.id === 'tf');
    assert.ok(t, 'failed task not dropped from active view (fresh ts.done)');
    assert.equal(t.status, 'failed', 'failed status preserved, never mutated');
  });

  it('corrupt-registry-fail-open: bad inputs never throw and record report.corrupt', () => {
    for (const bad of ['a string', 42, null, undefined, { tasks: 'x' }, []]) {
      let out;
      assert.doesNotThrow(() => { out = rec.reconcile(bad, { ...OPTS, liveAgentIds: null }); });
      assert.ok(Array.isArray(out.tasks.tasks), 'returns a well-formed empty-ish view');
    }
    // A string is unambiguously not a registry → corrupt marker set, empty tasks.
    const s = rec.reconcile('a string', { ...OPTS, liveAgentIds: null });
    assert.notEqual(s.report.corrupt, null, 'corruption surfaced, not swallowed');
    assert.deepEqual(s.tasks.tasks, []);

    // A registry with one malformed entry among valid ones skips only the bad entry.
    const good = running({ id: 't-good', agentTaskId: 'a1', started: ago(0) });
    const mixed = mkReg([good, { id: 'no-status' }, 'not-an-object']);
    const { tasks: kept, report } = rec.reconcile(mixed, { ...OPTS, liveAgentIds: new Set(['a1']) });
    assert.ok(kept.tasks.find(x => x.id === 't-good'), 'valid entry kept');
    assert.ok(report.corrupt && report.corrupt.skipped >= 2, 'skip count recorded');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sweeps (terminal retention + orphaned temp)
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — terminal sweep', () => {
  it('long-stale-terminal-swept: old terminals pruned, active never swept', () => {
    const oldDone = task({ id: 'd1', status: 'done', done: ago(RETENTION + MIN) });
    const oldFailed = task({ id: 'f1', status: 'failed', done: ago(RETENTION + MIN) });
    const oldOrphan = task({ id: 'o1', status: 'orphaned', done: ago(RETENTION + MIN) });
    const q = task({ id: 'q1', status: 'queued', done: undefined });
    const run = running({ id: 'r1', agentTaskId: 'live', started: ago(0) });
    const { tasks, report } = rec.reconcile(
      mkReg([oldDone, oldFailed, oldOrphan, q, run]),
      { ...OPTS, liveAgentIds: new Set(['live']) }
    );
    const ids = tasks.tasks.map(t => t.id).sort();
    assert.deepEqual(ids, ['q1', 'r1'], 'only queued+running remain');
    assert.deepEqual(report.swept.sort(), ['d1', 'f1', 'o1'], 'exactly the 3 stale terminals swept');
    assert.ok(tasks.tasks.find(t => t.id === 'q1'), 'queued never swept');
    assert.ok(tasks.tasks.find(t => t.id === 'r1'), 'running never swept');
  });

  it('freshly-orphaned task is not swept the same pass (offered for re-run)', () => {
    const stale = running({ id: 'ghost', kind: 'review', agentTaskId: 'g', started: ago(STALE + MIN) });
    const { tasks, report } = rec.reconcile(mkReg([stale]), { ...OPTS, liveAgentIds: null });
    assert.deepEqual(report.orphaned, ['ghost']);
    assert.deepEqual(report.swept, [], 'fresh orphan (ts.done≈now) survives retention this pass');
    assert.ok(tasks.tasks.find(t => t.id === 'ghost'), 'orphan persists to be offered for re-run');
  });
});

describe('sweepTempArtifacts', () => {
  it('orphaned-temp-cleaned: aged temp removed, fresh temp + canonical tasks.json untouched', () => {
    const stateDir = path.join(root, '.ctoc', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const canonical = path.join(stateDir, 'tasks.json');
    const canonicalBytes = JSON.stringify(reg.emptyRegistry(), null, 2);
    fs.writeFileSync(canonical, canonicalBytes);

    const agedTmp = path.join(stateDir, 'tasks.json.tmp-123-old-abc');
    const freshTmp = path.join(stateDir, 'tasks.json.tmp-456-new-def');
    fs.writeFileSync(agedTmp, 'stale-temp');
    fs.writeFileSync(freshTmp, 'fresh-temp');
    // Age the old temp past the TTL via mtime; leave the fresh one recent.
    const oldTime = new Date(NOW - (TEMP_TTL + MIN)) / 1000;
    const newTime = new Date(NOW - 10_000) / 1000;
    fs.utimesSync(agedTmp, oldTime, oldTime);
    fs.utimesSync(freshTmp, newTime, newTime);

    const removed = rec.sweepTempArtifacts(root, NOW, TEMP_TTL);
    assert.deepEqual(removed.map(p => path.basename(p)), ['tasks.json.tmp-123-old-abc'], 'aged temp removed');
    assert.equal(fs.existsSync(agedTmp), false, 'aged temp gone');
    assert.equal(fs.existsSync(freshTmp), true, 'fresh temp kept');
    assert.equal(fs.existsSync(canonical), true, 'canonical tasks.json untouched');
    assert.equal(fs.readFileSync(canonical, 'utf8'), canonicalBytes, 'canonical bytes unchanged');
  });

  it('sweepTempArtifacts on an absent state dir returns [] and never throws', () => {
    assert.doesNotThrow(() => {
      const removed = rec.sweepTempArtifacts(root, NOW, TEMP_TTL);
      assert.deepEqual(removed, []);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Purity
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — purity', () => {
  it('pure-reconcile-does-not-mutate-input', () => {
    const input = mkReg([
      running({ id: 't1', kind: 'review', agentTaskId: 'ghost', started: ago(STALE + MIN) }),
      task({ id: 'd1', status: 'done', done: ago(RETENTION + MIN) })
    ]);
    const snapshot = JSON.parse(JSON.stringify(input));
    rec.reconcile(input, { ...OPTS, liveAgentIds: null });
    assert.deepEqual(input, snapshot, 'input registry object is unchanged after reconcile');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reconcileState — the thin I/O wrapper (tmp roots)
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcileState', () => {
  it('reconcileState-persists-and-promotes: orphans persist, freed slot promotes a queued task', () => {
    // Seed: MAX running (all stale, no live ids) + one queued candidate.
    const seed = mkReg([
      ...Array.from({ length: reg.MAX_CONCURRENT }, (_, i) =>
        running({ id: 'r' + i, agentTaskId: 'g' + i, kind: 'review', started: ago(STALE + MIN) })),
      task({ id: 'q1', status: 'queued', kind: 'review', touches: [], done: undefined })
    ]);
    reg.save(root, seed);

    const { report, promote } = rec.reconcileState(root, { ...OPTS, liveAgentIds: null });
    assert.equal(report.orphaned.length, reg.MAX_CONCURRENT, 'all stale running orphaned');

    // Reloading shows the persisted orphaned status.
    const reloaded = reg.load(root);
    const orphanedCount = reloaded.tasks.filter(t => t.status === 'orphaned').length;
    assert.equal(orphanedCount, reg.MAX_CONCURRENT, 'orphaned status persisted to disk');

    // The freed slots make the queued task runnable → it appears in promote.
    assert.ok(promote.some(t => t.id === 'q1'), 'queued task promoted after slots freed');
  });

  it('reconcileState-save-failure-does-not-throw: fault-injected rename → report.saveFailed, no throw', () => {
    const seed = mkReg([running({ id: 'ghost', kind: 'review', agentTaskId: 'g', started: ago(STALE + MIN) })]);
    reg.save(root, seed);

    const orig = safeFs.renameSync;
    safeFs.renameSync = () => { throw new Error('EIO simulated save failure'); };
    try {
      let out;
      assert.doesNotThrow(() => { out = rec.reconcileState(root, { ...OPTS, liveAgentIds: null }); });
      assert.ok(out.report.saveFailed, 'save failure recorded in report');
      assert.match(String(out.report.saveFailed), /EIO simulated/);
    } finally {
      safeFs.renameSync = orig;
    }
  });

  it('reconcileState-corrupt-registry-fails-open: corrupt file → report.corrupt, promote empty, no throw', () => {
    const stateDir = path.join(root, '.ctoc', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'tasks.json'), '{ not valid json ]');
    let out;
    assert.doesNotThrow(() => { out = rec.reconcileState(root, { ...OPTS, liveAgentIds: null }); });
    // load() fails open to empty → nothing to orphan/promote, menu never bricks.
    assert.deepEqual(out.promote, []);
    assert.deepEqual(out.report.orphaned, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Kind-aware staleness backstop (C1-5)
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — kind-aware staleness backstop (C1-5)', () => {
  it('implement task 45 min old with no TaskList is NOT orphaned (120-min floor)', () => {
    const r = mkReg([running({ id: 't1', kind: 'implement', agentTaskId: 'g', touches: ['a.js'], started: ago(45 * MIN) })]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'running', 'under the 120-min floor → left alone');
    assert.deepEqual(report.orphaned, []);
    assert.deepEqual(report.stalenessOrphaned, []);
  });

  it('implement task 130 min old with no TaskList IS orphaned + stalenessOrphaned detail carries age', () => {
    const r = mkReg([running({ id: 't1', kind: 'implement', agentTaskId: 'g', touches: ['a.js'], started: ago(130 * MIN) })]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'orphaned');
    assert.deepEqual(report.orphaned, ['t1']);
    assert.equal(report.stalenessOrphaned.length, 1);
    assert.equal(report.stalenessOrphaned[0].id, 't1');
    assert.ok(report.stalenessOrphaned[0].ageMs >= 130 * MIN, 'age recorded so the inbox can say "may still be alive"');
  });

  it('sync kind also gets the 120-min floor (90 min → not orphaned)', () => {
    const r = mkReg([running({ id: 't1', kind: 'sync', gitOp: true, agentTaskId: 'g', started: ago(90 * MIN) })]);
    const { tasks } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'running');
  });

  it('a non-implement/sync kind keeps the 30-min staleness floor', () => {
    const r = mkReg([running({ id: 't1', kind: 'review', agentTaskId: 'g', started: ago(31 * MIN) })]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, staleThresholdMs: STALE, liveAgentIds: null });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'orphaned');
    assert.deepEqual(report.orphaned, ['t1']);
    assert.equal(report.stalenessOrphaned.length, 1);
  });

  it('a per-kind override via staleThresholdMsByKind is honored', () => {
    const r = mkReg([running({ id: 't1', kind: 'implement', agentTaskId: 'g', touches: ['a.js'], started: ago(20 * MIN) })]);
    const { tasks } = rec.reconcile(r, {
      now: NOW, graceMs: GRACE, liveAgentIds: null,
      staleThresholdMsByKind: { implement: 10 * MIN }
    });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'orphaned', '20 min > 10-min override → orphaned');
  });

  it('a confirmed-absent orphan (TaskList present, no match) is NOT a stalenessOrphaned', () => {
    const r = mkReg([running({ id: 't1', kind: 'implement', agentTaskId: 'gone', touches: ['a.js'], started: ago(5 * MIN) })]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: new Set(['other']) });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'orphaned', 'confirmed absent → orphaned regardless of age');
    assert.deepEqual(report.orphaned, ['t1']);
    assert.deepEqual(report.stalenessOrphaned, [], 'not staleness-based — TaskList confirmed the agent gone');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancelling liveness (C1-2)
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — cancelling liveness (C1-2)', () => {
  function cancelling(over = {}) {
    return { ...running(over), status: 'cancelling' };
  }

  it('a cancelling task with a live agent stays cancelling (files stay locked)', () => {
    const r = mkReg([cancelling({ id: 't1', kind: 'review', agentTaskId: 'live', started: ago(31 * MIN) })]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, staleThresholdMs: STALE, liveAgentIds: new Set(['live']) });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'cancelling');
    assert.deepEqual(report.cancelled, []);
  });

  it('a cancelling task confirmed absent → cancelled (agent gone), ts.done stamped', () => {
    const r = mkReg([cancelling({ id: 't1', kind: 'review', agentTaskId: 'ghost', started: ago(31 * MIN) })]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, staleThresholdMs: STALE, liveAgentIds: new Set(['other']) });
    const t = tasks.tasks.find(x => x.id === 't1');
    assert.equal(t.status, 'cancelled');
    assert.equal(t.ts.done, new Date(NOW).toISOString());
    assert.deepEqual(report.cancelled, ['t1']);
  });

  it('a young cancelling task inside grace is left alone (just-dispatched cancel race)', () => {
    const r = mkReg([cancelling({ id: 't1', kind: 'review', agentTaskId: 'ghost', started: ago(GRACE - 10_000) })]);
    const { tasks } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: new Set() });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'cancelling');
  });

  it('a stale cancelling task with no TaskList → cancelled via the staleness backstop', () => {
    const r = mkReg([cancelling({ id: 't1', kind: 'review', agentTaskId: 'ghost', started: ago(31 * MIN) })]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, staleThresholdMs: STALE, liveAgentIds: null });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'cancelled');
    assert.deepEqual(report.cancelled, ['t1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unsatisfiable queued surfacing (C1-1/C1-7)
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — unsatisfiable queued surfacing (C1-1/C1-7)', () => {
  it('a queued task with a failed dep is marked failed + surfaced (never silent-forever)', () => {
    const r = mkReg([
      task({ id: 't1', kind: 'implement', status: 'failed', touches: ['a.js'], done: ago(0) }),
      task({ id: 't2', kind: 'review', status: 'queued', touches: ['b.js'], blockedBy: ['t1'], done: undefined })
    ]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    const t2 = tasks.tasks.find(x => x.id === 't2');
    assert.equal(t2.status, 'failed', 'the wedged task is failed, not left queued forever');
    assert.equal(t2.result.ok, false);
    assert.match(String(t2.result.summary), /dep-failed/);
    assert.match(String(t2.result.summary), /t1/);
    assert.ok(report.unsatisfiable.some(u => u.id === 't2' && u.reason === 'dep-failed'));
    assert.equal(t2.ts.done, new Date(NOW).toISOString(), 'failed marking stamps ts.done = now → survives retention');
  });

  it('a blockedBy cycle among queued tasks is surfaced as dep-cycle', () => {
    const r = mkReg([
      task({ id: 't1', kind: 'review', status: 'queued', touches: ['a.js'], blockedBy: ['t2'], done: undefined }),
      task({ id: 't2', kind: 'review', status: 'queued', touches: ['b.js'], blockedBy: ['t1'], done: undefined })
    ]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.equal(tasks.tasks.find(x => x.id === 't1').status, 'failed');
    assert.equal(tasks.tasks.find(x => x.id === 't2').status, 'failed');
    assert.deepEqual(report.unsatisfiable.map(u => u.reason), ['dep-cycle', 'dep-cycle']);
  });

  it('a missing dep on a queued task is surfaced as dep-missing', () => {
    const r = mkReg([
      task({ id: 't2', kind: 'review', status: 'queued', touches: ['b.js'], blockedBy: ['ghost'], done: undefined })
    ]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.equal(tasks.tasks.find(x => x.id === 't2').status, 'failed');
    assert.ok(report.unsatisfiable.some(u => u.id === 't2' && u.reason === 'dep-missing'));
  });

  it('a satisfiable queued task is left queued (not falsely failed)', () => {
    const r = mkReg([
      task({ id: 't1', kind: 'plan', status: 'done', done: ago(0) }),
      task({ id: 't2', kind: 'review', status: 'queued', touches: ['b.js'], blockedBy: ['t1'], done: undefined })
    ]);
    const { tasks, report } = rec.reconcile(r, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.equal(tasks.tasks.find(x => x.id === 't2').status, 'queued');
    assert.deepEqual(report.unsatisfiable, []);
  });

  it('reconcileState persists the unsatisfiable-failed marking to disk', () => {
    const seed = mkReg([
      task({ id: 't1', kind: 'implement', status: 'failed', touches: ['a.js'], done: ago(0) }),
      task({ id: 't2', kind: 'review', status: 'queued', touches: ['b.js'], blockedBy: ['t1'], done: undefined })
    ]);
    reg.save(root, seed);
    const { report } = rec.reconcileState(root, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.ok(report.unsatisfiable.some(u => u.id === 't2'));
    const reloaded = reg.load(root);
    assert.equal(reloaded.tasks.find(t => t.id === 't2').status, 'failed', 'wedge persisted, not lost on reload');
  });
});

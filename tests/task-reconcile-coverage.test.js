/**
 * NB4 — DARK-BRANCH coverage tests for src/lib/task-reconcile.js.
 *
 * Companion to tests/task-reconcile.test.js. That file drives the 8 BDD scenarios
 * (orphan/staleness/cancelling/unsatisfiable/sweeps/persist). This file targets the
 * branches it leaves dark — all of them reconciliation DECISIONS where a mutant that
 * reaps a live task, hands a live task's files to a rival, or crashes the render must
 * go RED:
 *   • reconcileState QUARANTINE (R3-B item 8) — a queued task whose files were freed by
 *     an AGE-ONLY orphaning is EXCLUDED from promote this pass; a non-conflicting one is
 *     kept. This headline safety rule had zero test coverage.
 *   • reconcileState fail-open trio — load-failed, sweep-throws, nextRunnable-throws — each
 *     must degrade to a recorded note, never a throw (the menu must always render).
 *   • the quarantine's own defensive catch (fault at the scheduler boundary).
 *   • sweepTempArtifacts per-file best-effort swallow.
 *   • pure-reconcile fallbacks the BDD file skips: generation carry-through, NaN-age
 *     staleness (ageMs → null), the cancel-deadline clock falling back to ts.started when
 *     ts.cancelRequested is absent, and a per-kind cancel-deadline override.
 *
 * Faults are injected ONLY at true boundaries (safe-fs, the task-registry scheduler) via
 * the sanctioned save/restore pattern from task-reconcile.test.js — the code under test is
 * never mocked. Every fault is restored in a `finally`. Determinism via injected `now`;
 * NEVER a sleep. tmp roots are per-test and removed in afterEach.
 *
 * Reviewed line-by-line by a human (Tijn) — assertions describe user-visible reconcile
 * outcomes (final status, promote set, report notes), not call sequences.
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

// ── deterministic clock + thresholds ────────────────────────────────────────────

const NOW = Date.parse('2026-07-06T12:00:00.000Z');
const MIN = 60_000;
const GRACE = 60_000;          // 60 s
const STALE = 30 * MIN;        // 30 min flat floor
const TEMP_TTL = 60 * MIN;     // 1 h

/** ISO string for `NOW - ageMs`. */
function ago(ageMs) {
  return new Date(NOW - ageMs).toISOString();
}

/** A running (overridable to cancelling) task literal. */
function running(over = {}) {
  return {
    id: over.id || 't1',
    kind: over.kind || 'implement',
    label: '',
    plan: over.plan ?? 'plans/todo/x.md',
    status: over.status || 'running',
    agentTaskId: over.agentTaskId ?? null,
    touches: over.touches || [],
    gitOp: over.gitOp === true,
    blockedBy: over.blockedBy || [],
    result: null,
    ts: over.ts || {
      created: over.created || ago(0),
      started: over.started || ago(0),
      done: null
    }
  };
}

/** A terminal/queued task literal. */
function task(over = {}) {
  return {
    id: over.id || 'tX',
    kind: over.kind || 'review',
    label: '',
    plan: over.plan ?? null,
    status: over.status || 'done',
    agentTaskId: null,
    touches: over.touches || [],
    gitOp: over.gitOp === true,
    blockedBy: over.blockedBy || [],
    result: null,
    ts: {
      created: over.created || ago(0),
      started: null,
      done: 'done' in over ? over.done : ago(0)
    }
  };
}

/** Wrap a task array in a registry value (optionally with a generation). */
function mkReg(tasks, extra = {}) {
  return { version: reg.REGISTRY_VERSION, seq: tasks.length, tasks, ...extra };
}

// ── per-test tmp root ────────────────────────────────────────────────────────────

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-reconcile-cov-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ─────────────────────────────────────────────────────────────────────────────
// reconcileState QUARANTINE (R3-B item 8) — the age-only orphan must NOT hand its
// files to a conflicting queued task in the same pass, but MUST free a slot for a
// non-conflicting one. Kills a mutant that drops the quarantine (two agents on one
// file) OR one that quarantines everything (starves a safe candidate).
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcileState — staleness-orphan file quarantine (R3-B item 8)', () => {
  it('excludes a queued task whose files an age-only orphan freed, keeps a non-conflicting one', () => {
    // Arrange: one implement task orphaned by AGE ALONE (no TaskList, 130 min > 120-min
    // floor) touching src/shared.js; two runnable queued tasks — one conflicts on that
    // file, one is disjoint.
    const seed = mkReg([
      running({ id: 't-orphan', kind: 'implement', agentTaskId: 'gone',
        touches: ['src/shared.js'], started: ago(130 * MIN) }),
      task({ id: 'q-conflict', kind: 'review', status: 'queued', touches: ['src/shared.js'], done: undefined }),
      task({ id: 'q-safe', kind: 'review', status: 'queued', touches: ['src/other.js'], done: undefined })
    ]);
    reg.save(root, seed);

    // Act
    const { report, promote } = rec.reconcileState(root, { now: NOW, graceMs: GRACE, liveAgentIds: null });

    // Assert: the orphan was staleness-based (the precondition for quarantine), the
    // conflicting candidate is held + reported, and only the disjoint one promotes.
    assert.ok(report.stalenessOrphaned.some(o => o.id === 't-orphan'),
      'the orphan must be an AGE-ONLY orphan for the quarantine to arm');
    assert.deepEqual(promote.map(t => t.id), ['q-safe'],
      'only the non-conflicting queued task is promoted — the rival on the freed file is held');
    assert.ok(report.quarantined.some(q => q.id === 'q-conflict' && q.reason === 'staleness-orphan-quarantine'),
      'the held candidate is REPORTED, never silently dropped');
  });

  it('does not throw and reports no quarantine when the scheduler returns a malformed promote set', () => {
    // The quarantine block is defensive: a fault at the nextRunnable boundary (a scheduler
    // bug returning a non-array) must not break the render. Kills a mutant that removes the
    // try/catch around the filter (528-529): promote.filter on a non-array would throw.
    const seed = mkReg([
      running({ id: 'orp', kind: 'implement', agentTaskId: 'g', touches: ['x.js'], started: ago(130 * MIN) })
    ]);
    reg.save(root, seed);

    const orig = reg.nextRunnable;
    reg.nextRunnable = () => ({}); // non-array, no .filter → throws inside the quarantine try
    try {
      let out;
      assert.doesNotThrow(() => { out = rec.reconcileState(root, { now: NOW, graceMs: GRACE, liveAgentIds: null }); });
      assert.deepEqual(out.report.quarantined, [],
        'a quarantine fault degrades to an empty note — render survives');
    } finally {
      reg.nextRunnable = orig;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reconcileState — TWO-PASS staleness-orphan quarantine PERSISTENCE (concurrent-edit /
// double-run defect). The single-pass quarantine (R3-B item 8) armed only for the pass
// that DID the orphaning. On the very NEXT pass the age-orphaned task is already terminal
// `orphaned`, so it is re-added to nothing and the quarantine goes inert — its files are
// handed to a conflicting queued sibling while the original agent may STILL be alive,
// putting two live agents on one file. The reservation MUST persist across passes and be
// released ONLY when the agent is CONFIRMED DEAD (never a permanent deadlock).
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcileState — two-pass staleness-orphan quarantine persistence', () => {
  it('holds a conflicting sibling on the SECOND pass while the age-orphaned agent may still be alive', () => {
    // t-orphan: implement, 130 min old (> 120-min floor), recorded agent id, touches a file
    // a queued review conflicts on. TaskList unavailable (liveAgentIds null) throughout.
    const seed = mkReg([
      running({ id: 't-orphan', kind: 'implement', agentTaskId: 'alive-agent',
        touches: ['src/shared.js'], started: ago(130 * MIN) }),
      task({ id: 'q-conflict', kind: 'review', status: 'queued', touches: ['src/shared.js'], done: undefined })
    ]);
    reg.save(root, seed);

    // Pass 1 — age-orphans t-orphan and HOLDS q-conflict (the working single-pass rule).
    const p1 = rec.reconcileState(root, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.ok(p1.report.stalenessOrphaned.some(o => o.id === 't-orphan'),
      'pass 1 must age-orphan t-orphan for the quarantine to arm');
    assert.deepEqual(p1.promote.map(t => t.id), [], 'pass 1 holds the conflicting sibling');

    // Pass 2 — t-orphan is now terminal `orphaned`; its agent is STILL alive (TaskList still
    // unavailable). Its files MUST stay reserved: promoting q-conflict now would start a
    // second live agent on src/shared.js. Against the single-pass code this FAILS
    // (q-conflict is promoted on pass 2 because the quarantine went inert).
    const p2 = rec.reconcileState(root, { now: NOW, graceMs: GRACE, liveAgentIds: null });
    assert.deepEqual(p2.promote.map(t => t.id), [],
      'pass 2 STILL holds the conflicting sibling — the age-orphan was never confirmed dead');
    assert.ok((p2.report.quarantined || []).some(q => q.id === 'q-conflict'),
      'the persistent hold is REPORTED, never silent');
  });

  it('releases the sibling on a later pass once the age-orphaned agent is CONFIRMED DEAD (no deadlock)', () => {
    const seed = mkReg([
      running({ id: 't-orphan', kind: 'implement', agentTaskId: 'dead-agent',
        touches: ['src/shared.js'], started: ago(130 * MIN) }),
      task({ id: 'q-conflict', kind: 'review', status: 'queued', touches: ['src/shared.js'], done: undefined })
    ]);
    reg.save(root, seed);

    rec.reconcileState(root, { now: NOW, graceMs: GRACE, liveAgentIds: null }); // pass 1 holds

    // Pass 2 with a LIVE list that does NOT list the orphan's agent → the agent is confirmed
    // dead. The reservation is released so the queue never deadlocks forever.
    const p2 = rec.reconcileState(root, { now: NOW, graceMs: GRACE, liveAgentIds: ['some-other-agent'] });
    assert.deepEqual(p2.promote.map(t => t.id), ['q-conflict'],
      'a confirmed-dead orphan releases its files to the waiting sibling');
    assert.ok((p2.report.quarantineReleased || []).includes('t-orphan'),
      'the release is a reported event, never silent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reconcileState FAIL-OPEN trio — every degraded path is a recorded note, not a throw.
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcileState — fail-open on load/sweep/scheduler faults', () => {
  it('records report.corrupt=load-failed and empty promote when the load itself throws', () => {
    // A non-string root makes task-registry.load throw BEFORE reconcile runs, so `report`
    // is still null when the catch fires — the distinct load-failed branch (473-480), which
    // the corrupt-file test can't reach (load() fails OPEN on a bad file, not a throw).
    let out;
    assert.doesNotThrow(() => { out = rec.reconcileState(/** @type {any} */ (12345), { now: NOW, liveAgentIds: null }); });
    assert.equal(out.report.corrupt.reason, 'load-failed', 'the load throw is surfaced as load-failed');
    assert.deepEqual(out.promote, [], 'nothing to promote when the registry could not be loaded');
  });

  it('sets report.tempSwept=[] when the temp sweep throws (never breaks the render)', () => {
    // Seed a live-confirmed task so nothing is orphaned (changed=false → abort, no save),
    // then make the state-dir read yield a non-iterable so the sweep's for..of throws OUT of
    // sweepTempArtifacts into reconcileState's guard (490-491).
    reg.save(root, mkReg([running({ id: 'r', kind: 'review', agentTaskId: 'a', started: ago(0) })]));

    const orig = safeFs.readdirSync;
    safeFs.readdirSync = () => ({}); // non-iterable → for..of throws past sweepTempArtifacts' own catch
    try {
      let out;
      assert.doesNotThrow(() => { out = rec.reconcileState(root, { now: NOW, liveAgentIds: new Set(['a']) }); });
      assert.deepEqual(out.report.tempSwept, [], 'a sweep fault degrades to an empty list, not a throw');
    } finally {
      safeFs.readdirSync = orig;
    }
  });

  it('sets promote=[] but still orphans when the scheduler throws computing the runnable set', () => {
    // The orphan transition (pure) must still land even though nextRunnable throws (502-503):
    // a scheduler fault costs the promotion, never the reconciliation.
    reg.save(root, mkReg([running({ id: 'gh', kind: 'review', agentTaskId: 'g', started: ago(31 * MIN) })]));

    const orig = reg.nextRunnable;
    reg.nextRunnable = () => { throw new Error('scheduler boom'); };
    try {
      let out;
      assert.doesNotThrow(() => {
        out = rec.reconcileState(root, { now: NOW, graceMs: GRACE, staleThresholdMs: STALE, liveAgentIds: null });
      });
      assert.deepEqual(out.promote, [], 'a scheduler fault yields an empty promote set');
      assert.deepEqual(out.report.orphaned, ['gh'], 'the orphan transition still happened — decision not lost');
    } finally {
      reg.nextRunnable = orig;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sweepTempArtifacts — per-file best-effort swallow (a locked/vanished temp must not
// break the sweep). Kills a mutant that drops the per-file try/catch (427-428).
// ─────────────────────────────────────────────────────────────────────────────

describe('sweepTempArtifacts — per-file fault tolerance', () => {
  it('swallows an unlink failure on an aged temp and returns without throwing', () => {
    // Arrange: an aged temp artifact whose unlink will fail (simulating a locked file).
    const stateDir = path.join(root, '.ctoc', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const aged = path.join(stateDir, 'tasks.json.tmp-1-locked');
    fs.writeFileSync(aged, 'stale');
    const oldTime = new Date(NOW - (TEMP_TTL + MIN)) / 1000;
    fs.utimesSync(aged, oldTime, oldTime);

    const orig = safeFs.unlinkSync;
    safeFs.unlinkSync = () => { throw new Error('EBUSY locked'); };
    try {
      // Act + Assert
      let removed;
      assert.doesNotThrow(() => { removed = rec.sweepTempArtifacts(root, NOW, TEMP_TTL); });
      assert.deepEqual(removed, [], 'a failed unlink is swallowed — the file is not reported removed');
      assert.equal(fs.existsSync(aged), true, 'the un-deletable temp is left in place, not lost');
    } finally {
      safeFs.unlinkSync = orig;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure reconcile — fallbacks the BDD file leaves dark.
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile — generation carry-through (compare-and-swap fidelity)', () => {
  it('preserves a loaded generation on the output and omits the key when the input had none', () => {
    // The output must round-trip `generation` so reconcileState's save is a real CAS, not an
    // unversioned clobber — and must NOT invent one when the input was a seed literal.
    const withGen = mkReg([running({ id: 'a', kind: 'review', agentTaskId: 'x', started: ago(0) })], { generation: 5 });
    const outWith = rec.reconcile(withGen, { now: NOW, liveAgentIds: new Set(['x']) });
    assert.equal(outWith.tasks.generation, 5, 'a loaded generation is carried through unchanged');

    const noGen = mkReg([running({ id: 'a', kind: 'review', agentTaskId: 'x', started: ago(0) })]);
    const outNo = rec.reconcile(noGen, { now: NOW, liveAgentIds: new Set(['x']) });
    assert.equal('generation' in outNo.tasks, false, 'no generation is invented for a seed literal');
  });
});

describe('reconcile — staleness backstop with an unparseable start time', () => {
  it('orphans a running task whose ts.started is not a date and records ageMs=null', () => {
    // NaN age is treated as "very old" → orphaned via the backstop, but the loud detail must
    // carry ageMs:null (not NaN) so the inbox renders "may still be alive" without a NaN. Kills
    // a mutant flipping the Number.isFinite(ageMs) ? ageMs : null fallback (337).
    const bad = running({ id: 'nan', kind: 'review', agentTaskId: 'g',
      ts: { created: ago(0), started: 'not-a-date', done: null } });
    const { tasks, report } = rec.reconcile(mkReg([bad]),
      { now: NOW, graceMs: GRACE, staleThresholdMs: STALE, liveAgentIds: null });

    assert.equal(tasks.tasks.find(t => t.id === 'nan').status, 'orphaned', 'unparseable start ⇒ very old ⇒ orphaned');
    assert.equal(report.stalenessOrphaned.length, 1);
    assert.equal(report.stalenessOrphaned[0].ageMs, null, 'a non-finite age is reported as null, never NaN');
  });
});

describe('reconcile — cancel deadline clock fallback and per-kind override', () => {
  it('falls back to ts.started when ts.cancelRequested is absent so a legacy hung cancel is not immortal', () => {
    // A pre-R3-B cancelling task carries no ts.cancelRequested. The deadline clock must fall
    // back to ts.started (293) — otherwise a legacy live-but-hung cancel would hold its files
    // and the sync barrier forever. 90 min since start > 30-min deadline → forced cancelled.
    const legacy = running({ id: 'c', kind: 'review', status: 'cancelling', agentTaskId: 'live',
      ts: { created: ago(0), started: ago(90 * MIN), done: null } });
    const { tasks, report } = rec.reconcile(mkReg([legacy]),
      { now: NOW, graceMs: GRACE, liveAgentIds: new Set(['live']) });

    assert.equal(tasks.tasks.find(t => t.id === 'c').status, 'cancelled',
      'a live-but-hung legacy cancel is forced past its deadline via ts.started');
    assert.equal(report.stalenessCancelled.length, 1, 'the forced cancel is loud');
    assert.equal(report.stalenessCancelled[0].wasLive, true, 'it records that the agent still looked alive');
  });

  it('honors a per-kind cancelDeadlineMsByKind override over the flat default', () => {
    // A 5-min override for `review` forces a cancelling task requested 10 min ago, where the
    // flat 30-min default would still protect it. Kills a mutant ignoring cancelByKind (218).
    const t = running({ id: 'c2', kind: 'review', status: 'cancelling', agentTaskId: 'live',
      ts: { created: ago(0), started: ago(60 * MIN), done: null, cancelRequested: ago(10 * MIN) } });
    const { tasks, report } = rec.reconcile(mkReg([t]), {
      now: NOW, graceMs: GRACE, liveAgentIds: new Set(['live']),
      cancelDeadlineMsByKind: { review: 5 * MIN }
    });

    assert.equal(tasks.tasks.find(x => x.id === 'c2').status, 'cancelled',
      '10 min elapsed > 5-min per-kind override → forced cancelled');
    assert.equal(report.stalenessCancelled[0].deadlineMs, 5 * MIN, 'the override deadline is the one reported');
  });
});

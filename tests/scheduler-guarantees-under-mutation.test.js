/**
 * Two scheduler guarantees that no test defended (Iron Loop Step 8, TDD).
 *
 * THE ONE RULE THIS FILE ENFORCES:
 *   Every case here names, in its comment, the EXACT source mutation it defends
 *   against — file, line and the precise text to change. A reviewer applies the
 *   mutation to a COPY of the module, runs this file, and watches the named case go
 *   red. A case that cannot state its mutation does not belong in this file.
 *
 * Both guarantees below are ALREADY implemented correctly and already documented in
 * the source's own comments. Nothing here changes production behaviour; each case
 * exists because the guarantee could be deleted today and the whole suite stayed
 * green. Mutation survival — not coverage — is the measure: both lines were already
 * covered, and coverage is exactly the instrument that failed to notice.
 *
 * Mutations are applied to a COPY of the module outside the working tree, never to
 * the tracked source in place, so no revert is ever self-attested (see the plan
 * `00096-two-scheduler-guarantees-that-no-test-defends.md`).
 *
 * Group A — src/lib/task-reconcile.js, the terminal-retention sweep.
 * Group B — src/lib/task-registry.js, nextRunnable's kind-aware dependency gate.
 *
 * Pure in-memory registry literals with an injected clock. No disk, no sleeps, no
 * wall-clock dependence, no platform branch.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const rec = require('../src/lib/task-reconcile');
const reg = require('../src/lib/task-registry');

// ── deterministic clock + thresholds (mirrors tests/task-reconcile.test.js) ──────

const NOW = Date.parse('2026-07-06T12:00:00.000Z');
const MIN = 60_000;
const GRACE = 60_000;                 // 60 s
const STALE = 30 * MIN;               // 30 min
const RETENTION = 7 * 24 * 60 * MIN;  // 7 days

const OPTS = { now: NOW, graceMs: GRACE, staleThresholdMs: STALE, retentionMs: RETENTION, liveAgentIds: null };

/** ISO string for `NOW - ageMs`. */
function ago(ageMs) {
  return new Date(NOW - ageMs).toISOString();
}

/** Wrap a task array in a registry value. */
function mkReg(tasks) {
  return { version: reg.REGISTRY_VERSION, seq: tasks.length, tasks };
}

/**
 * A task literal with sensible defaults, overridable per field. Mirrors the `task`
 * helper in tests/task-reconcile.test.js so both files describe registries the same
 * way. `mkReg` bypasses `addTask`, so a `sync` with a dependency can be built
 * directly (addTask refuses a sync with an EMPTY blockedBy; every sync here has one).
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Group A — retention never severs a live edge
//
// CONTRACT SOURCE (outside any test): src/lib/task-reconcile.js:497-501 —
//   "R3-B item 9 — RETENTION NEVER SEVERS A LIVE EDGE. Every dep id referenced by a
//    SURVIVING non-terminal task's blockedBy is protected from the sweep: dropping a
//    terminal task that a queued task still depends on would make the very next pass
//    mark that dependent `dep-missing` (a missing dep NEVER satisfies) and fail it —
//    even though its dependency SUCCEEDED. The edge outlives the retention window."
//
// HEADLINE MUTATION (defended by A1, A2, A5):
//   src/lib/task-reconcile.js:514
//     -  if (TERMINAL.has(t.status) && !referencedDeps.has(t.id)) {
//     +  if (TERMINAL.has(t.status)) {
//
// ADJACENT MUTATION (defended by A4):
//   src/lib/task-reconcile.js:504 — delete the line
//     `if (TERMINAL.has(t.status)) continue; // only a LIVE task's edges are load-bearing`
//   which protects DEAD edges forever, so the registry never drains.
//
// A3 is the control that stops a sweep-disabling mutation from passing A1.
// ─────────────────────────────────────────────────────────────────────────────

describe('Group A — retention never severs a live edge (task-reconcile.js:497-520)', () => {
  /** A1/A2/A5 fixture: an aged terminal `dep` that a live queued `dependent` still needs. */
  function agedDepWithLiveDependent() {
    return mkReg([
      task({ id: 'dep', kind: 'implement', status: 'done', touches: ['a.js'], done: ago(RETENTION + MIN) }),
      task({ id: 'dependent', kind: 'review', status: 'queued', touches: ['b.js'], blockedBy: ['dep'], done: undefined })
    ]);
  }

  it('A1: an aged terminal that a queued task still depends on is NOT swept ' +
     '[mutation: task-reconcile.js:514 drop `&& !referencedDeps.has(t.id)`]', () => {
    const { tasks, report } = rec.reconcile(agedDepWithLiveDependent(), OPTS);
    assert.equal(report.swept.includes('dep'), false,
      'the dep is older than the retention window but a LIVE queued task still depends on it');
    assert.ok(tasks.tasks.find(t => t.id === 'dep'), 'the dep survives into the active view');
    assert.equal(tasks.tasks.find(t => t.id === 'dependent').status, 'queued',
      'the dependent is left queued — its dependency SUCCEEDED');
  });

  it('A2: the protected edge survives a SECOND pass — the work is not merely delayed ' +
     '[mutation: task-reconcile.js:514 drop `&& !referencedDeps.has(t.id)`]', () => {
    const first = rec.reconcile(agedDepWithLiveDependent(), OPTS);
    const second = rec.reconcile(first.tasks, { ...OPTS, now: NOW + RETENTION });
    assert.ok(second.tasks.tasks.find(t => t.id === 'dep'),
      'the dep is still protected a full retention window later');
    assert.equal(second.tasks.tasks.find(t => t.id === 'dependent').status, 'queued',
      'the dependent is still queued, not failed');
    assert.deepEqual(second.report.unsatisfiable, [],
      'no pass ever declares the dependent unsatisfiable');
    assert.equal(second.report.swept.includes('dep'), false, 'and the dep is never swept');
  });

  it('A3 (control): the same aged terminal IS swept when nothing depends on it ' +
     '[control against a mutation that disables the sweep entirely]', () => {
    const r = mkReg([
      task({ id: 'dep', kind: 'implement', status: 'done', touches: ['a.js'], done: ago(RETENTION + MIN) }),
      task({ id: 'dependent', kind: 'review', status: 'queued', touches: ['b.js'], blockedBy: [], done: undefined })
    ]);
    const { tasks, report } = rec.reconcile(r, OPTS);
    assert.equal(report.swept.includes('dep'), true, 'with no live edge the aged terminal is swept');
    assert.equal(tasks.tasks.find(t => t.id === 'dep'), undefined, 'and is gone from the active view');
  });

  it('A4 (control): only a LIVE task\'s edge protects — a TERMINAL dependent does not ' +
     '[mutation: task-reconcile.js:504 delete `if (TERMINAL.has(t.status)) continue;`]', () => {
    const r = mkReg([
      task({ id: 'dep', kind: 'implement', status: 'done', touches: ['a.js'], done: ago(RETENTION + MIN) }),
      task({ id: 'dependent', kind: 'review', status: 'done', touches: ['b.js'], blockedBy: ['dep'], done: ago(RETENTION + MIN) })
    ]);
    const { tasks, report } = rec.reconcile(r, OPTS);
    assert.deepEqual(report.swept.sort(), ['dep', 'dependent'],
      'a DEAD dependent protects nothing — both aged terminals are swept');
    assert.deepEqual(tasks.tasks.map(t => t.id), [],
      'the registry drains; protecting dead edges would make it grow without bound');
  });

  it('A5: the dependent is never marked dep-missing across two passes ' +
     '[mutation: task-reconcile.js:514 drop `&& !referencedDeps.has(t.id)`] — this is ' +
     'the consequence the source comment names: silent loss of queued work', () => {
    const first = rec.reconcile(agedDepWithLiveDependent(), OPTS);
    assert.deepEqual(first.report.unsatisfiable, [], 'pass 1 declares nothing unsatisfiable');
    assert.notEqual(first.tasks.tasks.find(t => t.id === 'dependent').status, 'failed');

    const second = rec.reconcile(first.tasks, { ...OPTS, now: NOW + RETENTION });
    assert.equal(second.report.unsatisfiable.some(u => u.id === 'dependent'), false,
      'pass 2 must not report the dependent as unsatisfiable');
    assert.equal(second.report.unsatisfiable.some(u => u.reason === 'dep-missing'), false,
      'and specifically never as dep-missing — its dependency SUCCEEDED');
    assert.notEqual(second.tasks.tasks.find(t => t.id === 'dependent').status, 'failed',
      'the queued work did not vanish');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group B — the sync barrier settles on TERMINAL, through nextRunnable
//
// CONTRACT SOURCE (outside any test): src/lib/task-registry.js:804-812 —
//   "A barrier waits for the wave to SETTLE, not to succeed; reporting the failures
//    is the sync run's own job, so a failed/cancelled dep must not deadlock the
//    barrier forever."
//
// HEADLINE MUTATION (defended by B1-B4):
//   src/lib/task-registry.js:908 ONLY (canRun at :887 left kind-aware) —
//     -  if (!depsSatisfied(cand, registry)) continue;
//     +  if (!(cand.blockedBy || []).every(id =>
//     +        registry.tasks.find(t => t.id === id)?.status === 'done')) continue;
//   Consequence: after any wave containing a single failure, the sync barrier that
//   integrates that wave is never promoted — the permanent deadlock the settled-sync
//   rule was written to remove, restored on the only path that starts work.
//
// REVERSE MUTATIONS (defended by B6, B7, B8):
//   :823 `return isSync ? TERMINAL.has(dep.status) : dep.status === 'done';`
//        → `return true;`                       (caught by B6)
//   :822 delete `if (!dep) return false;`        (caught by B7)
//   :823 → `return TERMINAL.has(dep.status);`    (caught by B8 — settling for EVERY kind)
//
// Every case here calls nextRunnable. A case that calls canRun belongs in
// tests/task-registry.test.js and does not defend the :908 mutation.
// ─────────────────────────────────────────────────────────────────────────────

describe('Group B — sync settles on terminal through nextRunnable (task-registry.js:908)', () => {
  /** A registry with one dep at `depStatus` and a queued sync barrier that waits on it. */
  function waveWithBarrier(depStatus) {
    return mkReg([
      task({ id: 'dep', kind: 'implement', status: depStatus, touches: ['a.js'], blockedBy: [] }),
      task({ id: 'barrier', kind: 'sync', status: 'queued', gitOp: true, touches: [], blockedBy: ['dep'] })
    ]);
  }

  const promoted = (r) => reg.nextRunnable(r).map(t => t.id);

  it('B1: a sync whose dependency FAILED is promoted ' +
     '[mutation: task-registry.js:908 done-only dependency check]', () => {
    assert.ok(promoted(waveWithBarrier('failed')).includes('barrier'),
      'the barrier integrates the wave and REPORTS the failure; it must not wait forever');
  });

  it('B2: a sync whose dependency was CANCELLED is promoted ' +
     '[mutation: task-registry.js:908 done-only dependency check]', () => {
    assert.ok(promoted(waveWithBarrier('cancelled')).includes('barrier'));
  });

  it('B3: a sync whose dependency was ORPHANED is promoted ' +
     '[mutation: task-registry.js:908 done-only dependency check]', () => {
    assert.ok(promoted(waveWithBarrier('orphaned')).includes('barrier'));
  });

  it('B4: a MIXED wave — one done, one failed — still promotes the barrier ' +
     '[mutation: task-registry.js:908 done-only dependency check] — the realistic shape', () => {
    const r = mkReg([
      task({ id: 'ok', kind: 'implement', status: 'done', touches: ['a.js'] }),
      task({ id: 'bad', kind: 'implement', status: 'failed', touches: ['b.js'] }),
      task({ id: 'barrier', kind: 'sync', status: 'queued', gitOp: true, touches: [], blockedBy: ['ok', 'bad'] })
    ]);
    assert.ok(promoted(r).includes('barrier'),
      'one failure in the wave must not deadlock the barrier that integrates it');
  });

  it('B5 (control): an IN-FLIGHT running dependency does NOT promote the barrier ' +
     '— settling means TERMINAL, never "any status but done"', () => {
    // NOTE (honest scope): a running dep ALSO trips Rule 2 (sync-barrier) inside
    // evaluateConcurrency, so this case is confounded and cannot by itself distinguish a
    // depsSatisfied mutation. It pins the human-visible outcome; B6 is the unconfounded
    // in-flight control, because a QUEUED dep occupies no slot.
    assert.equal(promoted(waveWithBarrier('running')).includes('barrier'), false);
  });

  it('B6 (control): a QUEUED dependency does NOT promote the barrier ' +
     '[mutation: task-registry.js:823 `return isSync ? true : dep.status === \'done\';` ' +
     '— a sync that ignores its dependencies entirely]', () => {
    // UNCONFOUNDED BY CONSTRUCTION. A queued dep occupies no slot, so Rule 2 cannot fire —
    // but the dep must also be UNABLE to start this pass, or it would be promoted first and
    // then trip Rule 2 as a running task, masking the mutation. So the dep is itself held
    // queued by a FAILED blocker under the unchanged non-sync done-only branch. What remains
    // is decided by the sync branch alone.
    const r = mkReg([
      task({ id: 'blocker', kind: 'implement', status: 'failed', touches: ['a.js'] }),
      task({ id: 'dep', kind: 'implement', status: 'queued', touches: ['b.js'], blockedBy: ['blocker'] }),
      task({ id: 'barrier', kind: 'sync', status: 'queued', gitOp: true, touches: [], blockedBy: ['dep'] })
    ]);
    const out = promoted(r);
    assert.equal(out.includes('dep'), false, 'the dep is itself held (done-only, its blocker FAILED)');
    assert.equal(out.includes('barrier'), false,
      'a dependency that has not settled must hold the barrier — settling is TERMINAL, ' +
      'never "the sync waits for nothing"');
  });

  it('B7 (control): a MISSING dependency never satisfies, even for a sync ' +
     '[mutation: task-registry.js:822 delete `if (!dep) return false;`]', () => {
    const r = mkReg([
      task({ id: 'barrier', kind: 'sync', status: 'queued', gitOp: true, touches: [], blockedBy: ['ghost'] })
    ]);
    assert.equal(promoted(r).includes('barrier'), false,
      'safety-first: an id with no task behind it never satisfies either kind');
  });

  it('B8 (control): a NON-sync candidate is still done-only through nextRunnable ' +
     '[mutation: task-registry.js:823 `return TERMINAL.has(dep.status);` — settling for EVERY kind]', () => {
    const r = mkReg([
      task({ id: 'dep', kind: 'implement', status: 'failed', touches: ['a.js'] }),
      task({ id: 'follower', kind: 'review', status: 'queued', touches: ['b.js'], blockedBy: ['dep'] })
    ]);
    assert.equal(promoted(r).includes('follower'), false,
      'only a sync settles on terminal — a review must never start on a FAILED dependency');
  });
});

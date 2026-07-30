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
 * Group C — src/lib/task-registry.js, git-exclusivity ON THE PROMOTION PATH.
 * Group D — src/lib/task-registry.js, the SYNC BARRIER (Rule 2) ON THE PROMOTION PATH.
 *
 * WHY GROUP D EXISTS — the mirror image of Group C, and the same mutual masking.
 * Rule 2 (sync-barrier) could be deleted from `nextRunnable`'s side of the ladder and
 * the entire suite stayed green, exactly as Rule 3 could before Group C. The two rules
 * have been covering for each other: every promotion-path candidate carrying a git flag
 * was a `sync`, so Rule 2 refused it before Rule 3 was reached (Group C's finding), AND
 * every `sync` reaching the promotion path in the suite carried `gitOp: true`, so a
 * git-flagged sync beside a running editor was refused as `git-exclusive` by Rule 3
 * anyway (Group D's finding). Delete either rule and the other catches the same
 * candidate, produces the same promoted set, and every assertion stays green. The
 * candidate that walks through the gap is a `sync` with `gitOp: false` — the shape
 * `addTask` produces by default when no git flag is asked for. So EVERY Group D case
 * uses a `sync` with `gitOp: false`; a git-flagged sync is refused by Rule 3 when Rule 2
 * is deleted and therefore proves nothing about Rule 2. This is the promotion-path
 * (`nextRunnable`) twin of the oracle-path sync-barrier cases in
 * tests/task-registry.test.js — an oracle and the projection beside it are DIFFERENT
 * code paths, each needing its own defenders.
 *
 * WHY GROUP C EXISTS. Rule 3 (git-exclusive) could be deleted from `nextRunnable`'s
 * side of the ladder and the entire suite stayed green, while deleting any other rule
 * from that same path went red. The reason is uniform across the suite: every
 * promotion-path case that carries a git flag makes its candidate `kind: 'sync'`
 * (scheduler-guarantees B1-B7; task-registry.test.js ST-21(d) and F2;
 * actions-scheduler.test.js), so Rule 2 (sync-barrier) refuses it first and Rule 3 is
 * never reached. F2's git invariants are guarded by `if (gitOps.length > 0)` and were
 * therefore vacuous. Every genuine non-sync git candidate in the suite was asked
 * through `canRun` — the oracle — instead.
 *
 * THE GENERAL LESSON, so the next author checks both: an oracle and the projection
 * beside it are DIFFERENT CODE PATHS, and each needs its own defenders — a rule
 * proven correct through `canRun` is not thereby proven live in `nextRunnable`.
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

// ─────────────────────────────────────────────────────────────────────────────
// Group C — git-exclusivity holds on the PROMOTION path, not just in the oracle
//
// CONTRACT SOURCE (outside any test): src/lib/task-registry.js:848-850 —
//   "Rule 3 — git-exclusive (strengthened, git-vs-git): a gitOp candidate is blocked
//    by any running editing-OR-git task; an editing candidate is blocked by any
//    running gitOp. Read-only non-git tasks may run alongside a git task."
// and :897-899 — nextRunnable's returned set is JOINTLY startable: "starting the
// whole returned set never violates ≤5 / sync-barrier / git-exclusive / file-conflict".
//
// HEADLINE MUTATION (defended by C1, C2, C3, C5) — delete Rule 3 entirely:
//   src/lib/task-registry.js:851-854, delete
//     if ((candidate.gitOp && running.some(t => isEditing(t) || t.gitOp)) ||
//         (isEditing(candidate) && running.some(t => t.gitOp))) {
//       return { run: false, reason: 'git-exclusive' };
//     }
//   Consequence: nextRunnable returns a commit and an edit as jointly startable. Rule 4
//   cannot catch it (a git task touches nothing, so there is no overlap), Rule 1 cannot
//   (two tasks is under the ceiling), Rule 2 cannot (neither is a sync).
//
// CLAUSE MUTATIONS:
//   :851 delete `candidate.gitOp && running.some(t => isEditing(t) || t.gitOp) ||`
//        — a git candidate stops being blocked by a running editor   (caught by C1)
//   :852 delete `|| (isEditing(candidate) && running.some(t => t.gitOp))`
//        — an editing candidate stops being blocked by a running git (caught by C2)
//   :851 `t => isEditing(t) || t.gitOp` → `t => isEditing(t)`
//        — git stops excluding git                                    (caught by C3)
//   :909 `const running = projected.filter(...)` → `const running = result.slice()`
//        — the ladder consults only tasks accepted THIS pass, not the real running set
//                                                                     (caught by C5)
//
// C4 is the control against over-tightening (refuse everything beside a git task,
// which would pass C1-C3 and destroy concurrency). C6 pins that the refusal is
// Rule 3 by name — a case asserting only "not promoted" survives a mutation that
// broke a different rule, which is the exact failure this whole file corrects.
//
// EVERY case below uses a NON-SYNC git candidate. A sync candidate is refused by
// Rule 2 first and proves nothing about Rule 3.
// ─────────────────────────────────────────────────────────────────────────────

describe('Group C — git-exclusive holds through nextRunnable (task-registry.js:851-854)', () => {
  const promoted = (r) => reg.nextRunnable(r).map(t => t.id);

  it('C1: a NON-SYNC git candidate queued behind a queued EDITING candidate is NOT promoted ' +
     '[mutation: task-registry.js:851 delete the first clause ' +
     '`candidate.gitOp && running.some(t => isEditing(t) || t.gitOp) ||`]', () => {
    // The gap this whole group was written for. t1 is accepted and folded into the
    // projected running set carrying its touches; t2 is then a git candidate facing a
    // running editor. Rule 1 (2 < 5), Rule 2 (no sync) and Rule 4 (t2 touches nothing)
    // all pass it — only Rule 3 refuses.
    const r = mkReg([
      task({ id: 't1', kind: 'implement', status: 'queued', touches: ['src/a.js'], gitOp: false }),
      task({ id: 't2', kind: 'review', status: 'queued', touches: [], gitOp: true })
    ]);
    assert.deepEqual(promoted(r), ['t1'],
      'a commit must never be started jointly with an edit — the returned set is ' +
      'promised to be jointly startable');
  });

  it('C2: an EDITING candidate queued behind a queued git candidate is NOT promoted ' +
     '[mutation: task-registry.js:852 delete the second clause ' +
     '`|| (isEditing(candidate) && running.some(t => t.gitOp))`]', () => {
    // The reverse direction. Rule 4 explicitly cannot save this one: the git task
    // touches nothing, so the union of running touches is empty and there is no overlap.
    const r = mkReg([
      task({ id: 't1', kind: 'review', status: 'queued', touches: [], gitOp: true }),
      task({ id: 't2', kind: 'implement', status: 'queued', touches: ['src/a.js'], gitOp: false })
    ]);
    assert.deepEqual(promoted(r), ['t1'],
      'an edit must never be started jointly with a commit, whichever is first in FIFO');
  });

  it('C3: git does not run beside git ' +
     '[mutation: task-registry.js:851 `t => isEditing(t) || t.gitOp` → `t => isEditing(t)`]', () => {
    // Neither task edits anything, so isEditing is false on both sides: the ONLY thing
    // refusing t2 is the `|| t.gitOp` disjunct.
    const r = mkReg([
      task({ id: 't1', kind: 'review', status: 'queued', touches: [], gitOp: true }),
      task({ id: 't2', kind: 'quality', status: 'queued', touches: [], gitOp: true })
    ]);
    assert.deepEqual(promoted(r), ['t1'], 'two git operations must not be started jointly');
  });

  it('C4 (control): a read-only NON-git task DOES run beside a git task ' +
     '[control against over-tightening Rule 3 into "refuse every candidate beside a git task", ' +
     'which would pass C1-C3 while destroying concurrency]', () => {
    const r = mkReg([
      task({ id: 't1', kind: 'review', status: 'queued', touches: [], gitOp: true }),
      task({ id: 't2', kind: 'review', status: 'queued', touches: [], gitOp: false })
    ]);
    assert.deepEqual(promoted(r), ['t1', 't2'],
      'the rule\'s own comment: read-only non-git tasks may run alongside a git task');
  });

  it('C5: the rule holds against a REALLY running git task, not only a projected one ' +
     '[mutation: task-registry.js:909 `const running = projected.filter(t => t.id !== cand.id)` ' +
     '→ `const running = result.slice()` — consult only this pass\'s acceptances]', () => {
    // t1 is already running, so it is seeded into `projected` at :905 and is never a
    // candidate. A mutation that built the ladder's running set from `result` alone
    // would see an empty set and promote the editor straight into a live commit.
    const r = mkReg([
      task({ id: 't1', kind: 'review', status: 'running', touches: [], gitOp: true, started: ago(MIN) }),
      task({ id: 't2', kind: 'implement', status: 'queued', touches: ['src/a.js'], gitOp: false })
    ]);
    assert.deepEqual(promoted(r), [],
      'nothing may be promoted into a live git operation');
  });

  it('C6: the refusal is git-exclusive BY NAME, through the oracle, for C1\'s shapes ' +
     '[pins that C1-C3 fail on Rule 3 and not on Rule 1 or Rule 4 firing by accident]', () => {
    // NOTE (honest scope, and a correction to the plan): the oracle reads the REAL
    // running set via runningTasks(), so it cannot be asked C1's registry verbatim —
    // with both tasks queued the running set is empty and canRun correctly answers
    // `ok`. The shapes are C1's; t1 is marked running so the oracle sees the same
    // opposition nextRunnable manufactures by folding t1 into `projected` at :912.
    const r = mkReg([
      task({ id: 't1', kind: 'implement', status: 'running', touches: ['src/a.js'], gitOp: false, started: ago(MIN) })
    ]);
    const cand = task({ id: 't2', kind: 'review', status: 'queued', touches: [], gitOp: true });
    assert.deepEqual(reg.canRun(cand, r), { run: false, reason: 'git-exclusive' },
      'not max-concurrent, not sync-barrier, not file-conflict — Rule 3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group D — the sync barrier (Rule 2) holds on the PROMOTION path, not just the oracle
//
// CONTRACT SOURCE (outside any test): src/lib/task-registry.js:926-932 —
//   "Rule 2 — sync-barrier (the wave integration boundary): a `sync` candidate may not
//    start while ANY task runs, and NO candidate may start while a `sync` runs."
// and :995-996 — nextRunnable's returned set is JOINTLY startable: "starting the whole
// returned set never violates ≤5 / sync-barrier / git-exclusive / file-conflict".
//
// HEADLINE MUTATION (defended by D1, D2, D3) — the two disjuncts of Rule 2 at :930:
//   src/lib/task-registry.js:930, delete the `candidate.kind === 'sync'` disjunct
//     — a sync candidate stops being blocked beside a running task   (caught by D1)
//   src/lib/task-registry.js:930, delete the `running.some(t => t.kind === 'sync')`
//     disjunct — a candidate stops being blocked beside a running sync (caught by D2)
//   src/lib/task-registry.js:930-932, delete Rule 2 entirely
//     — a follower starts alongside a barrier promoted THIS pass       (caught by D3)
//
// PROMOTION-PATH-ONLY (fold) MUTATION (defended by D3, and ONLY D3):
//   src/lib/task-registry.js:1009
//     -  projected.push({ ...cand, status: 'running' });
//     +  projected.push({ ...cand, kind: 'review', status: 'running' });
//   The barrier promoted this pass is folded WITHOUT its kind, so a following candidate
//   no longer sees a running sync and is promoted straight into a live wave barrier.
//   Verified empirically (Iron Loop Step 8): this mutation leaves the WHOLE scheduler
//   suite green BEFORE Group D existed — the exact undefended gap Group D closes.
//
// D4 is the control against over-tightening ("never promote a sync", which would pass
// D1-D3 and deadlock every wave). D5 is the control against "one task at a time" (which
// would pass D1-D4 and destroy concurrency). D6 pins that the refusal is Rule 2 BY NAME
// through the oracle, so D1-D3 cannot be passing on Rule 1, 3 or 4 firing by accident.
//
// WHY D1/D2 AND D3 ARE NOT REDUNDANT. `projected` is seeded from the real running set at
// :1002 and grown by the fold at :1009. D1/D2 exercise the SEEDED path (the blocker is a
// real running task); D3 exercises the FOLD path (the blocking sync did not exist as a
// running task when the pass began). The fold-kind-drop mutation leaves D1/D2 green and
// kills only D3.
//
// EVERY case below uses a `sync` with `gitOp: false`. A git-flagged sync is refused by
// Rule 3 when Rule 2 is deleted and proves nothing — that is the masking this group breaks.
// ─────────────────────────────────────────────────────────────────────────────

describe('Group D — sync-barrier holds through nextRunnable (task-registry.js:930-932)', () => {
  const promoted = (r) => reg.nextRunnable(r).map(t => t.id);

  it('D1: a sync candidate is NOT promoted while a real (non-sync) task runs ' +
     '[mutation: task-registry.js:930 delete the `candidate.kind === \'sync\'` disjunct]', () => {
    // t1 is a really-running editor (occupies a slot, is NOT a sync). t2 is a queued sync
    // with gitOp:false. Masking check: Rule 1 (1 < 5) no; Rule 3 (candidate gitOp false,
    // not editing) no; Rule 4 (candidate touches empty → fast path) no. ONLY Rule 2 — via
    // its `candidate.kind === 'sync'` disjunct — refuses t2.
    const r = mkReg([
      task({ id: 't1', kind: 'implement', status: 'running', touches: ['a.js'], gitOp: false, started: ago(MIN), done: undefined }),
      task({ id: 't2', kind: 'sync', status: 'queued', touches: [], gitOp: false, blockedBy: [] })
    ]);
    assert.deepEqual(promoted(r), [],
      'a wave-integration sync must not start while any task is running');
  });

  it('D2: no candidate is promoted while a real sync runs ' +
     '[mutation: task-registry.js:930 delete the `running.some(t => t.kind === \'sync\')` disjunct]', () => {
    // t1 is a really-running sync (gitOp:false). t2 is an ordinary queued review. Masking
    // check: Rule 1 no; Rule 3 (t2 gitOp false, not editing) no; Rule 4 (t2 touches empty)
    // no. ONLY Rule 2 — via its `running.some(...sync)` disjunct — refuses t2.
    const r = mkReg([
      task({ id: 't1', kind: 'sync', status: 'running', touches: [], gitOp: false, started: ago(MIN), done: undefined, blockedBy: [] }),
      task({ id: 't2', kind: 'review', status: 'queued', touches: [], gitOp: false })
    ]);
    assert.deepEqual(promoted(r), [],
      'nothing — not even a read-only task — may start while a sync barrier runs');
  });

  it('D3 (headline): a barrier promoted THIS pass blocks the follower behind it ' +
     '[mutation: task-registry.js:930-932 delete Rule 2 entirely; AND :1009 drop `kind` ' +
     'from the fold — `projected.push({ ...cand, status: \'running\' })`]', () => {
    // dep is done → not occupying. FIFO queued: barrier (sync, gitOp:false, waits on dep),
    // then other (review). barrier promotes because nothing occupies a slot (Rule 2's
    // `running.length > 0` is false). It is folded into `projected` AS A SYNC, and `other`
    // is then refused by Rule 2's `running.some(...sync)`. Deleting Rule 2, or folding the
    // barrier without its kind, lets `other` start alongside the live barrier.
    const r = mkReg([
      task({ id: 'dep', kind: 'implement', status: 'done', touches: ['a.js'] }),
      task({ id: 'barrier', kind: 'sync', status: 'queued', touches: [], gitOp: false, blockedBy: ['dep'] }),
      task({ id: 'other', kind: 'review', status: 'queued', touches: [], gitOp: false })
    ]);
    assert.deepEqual(promoted(r), ['barrier'],
      'the barrier integrates the wave alone; the follower waits behind it');
  });

  it('D4 (control): the barrier IS promoted when nothing occupies a slot ' +
     '[control against over-tightening Rule 2 into "never promote a sync", which would ' +
     'pass D1-D3 and deadlock every wave]', () => {
    const r = mkReg([
      task({ id: 'dep', kind: 'implement', status: 'done', touches: ['a.js'] }),
      task({ id: 'barrier', kind: 'sync', status: 'queued', touches: [], gitOp: false, blockedBy: ['dep'] })
    ]);
    assert.deepEqual(promoted(r), ['barrier'],
      'a sync must start when it is alone — the barrier drains the wave, it does not deadlock it');
  });

  it('D5 (control): two ordinary tasks with disjoint files DO both promote ' +
     '[control against over-tightening Rule 2 into "one task at a time", which would ' +
     'pass D1-D4 and destroy concurrency]', () => {
    const r = mkReg([
      task({ id: 't1', kind: 'implement', status: 'queued', touches: ['a.js'], gitOp: false }),
      task({ id: 't2', kind: 'implement', status: 'queued', touches: ['b.js'], gitOp: false })
    ]);
    assert.deepEqual(promoted(r), ['t1', 't2'],
      'disjoint non-sync work still runs in parallel — Rule 2 governs syncs, not everything');
  });

  it('D6: the refusal is sync-barrier BY NAME, through the oracle, for D2\'s shapes ' +
     '[pins that D1-D3 fail on Rule 2 and not on Rule 1, 3 or 4 firing by accident]', () => {
    // WARNING (the sibling got this wrong once): canRun builds its opposition from
    // runningTasks() — status running or cancelling. An all-queued registry gives canRun an
    // EMPTY running set, where the correct answer is {run:true, reason:'ok'}. So t1 here is
    // genuinely RUNNING, matching D2's shape, and the oracle sees the real opposition.
    const r = mkReg([
      task({ id: 't1', kind: 'sync', status: 'running', touches: [], gitOp: false, started: ago(MIN), done: undefined, blockedBy: [] })
    ]);
    const cand = task({ id: 't2', kind: 'review', status: 'queued', touches: [], gitOp: false });
    assert.deepEqual(reg.canRun(cand, r), { run: false, reason: 'sync-barrier' },
      'not max-concurrent, not git-exclusive, not file-conflict — Rule 2');
  });
});

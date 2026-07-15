/**
 * Coverage-hardening tests for src/lib/task-registry.js — the DARK branches the
 * behavioral suite (tests/task-registry.test.js) never reaches. Every test here
 * pins a branch that goes RED under mutation of the production code:
 *
 *   • the compare-and-swap concurrency core (save refuses a stale write; withRegistry
 *     reloads-and-reapplies on conflict, aborts without writing, and gives up bounded);
 *   • the state-transition oracle (canTransition — including its hasOwnProperty guard
 *     against prototype-chain keys);
 *   • the live-plan-task lookup preference (running ▷ cancelling ▷ queued — the C2 defect
 *     where a queued duplicate shadowed a running task);
 *   • the fail-open / fail-loud fallbacks (too-large registry, over-length touches,
 *     sync-with-no-blockedBy, non-array log recovery, best-effort warn-log swallow);
 *   • the non-empty-root guards on every disk-facing helper.
 *
 * Real os.tmpdir() fixtures, cleaned in afterEach. Loads the real module. Fault is
 * injected ONLY at the true fs boundary (safe-fs), never on the code under test, and
 * always restored in finally.
 *
 * These tests were AI-drafted and read line-by-line by a human before commit; each
 * assertion checks a user-visible outcome (persisted bytes, thrown error, returned
 * decision), not a call sequence.
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-tasks-cov-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Build an in-memory registry value from an array of task literals (no disk). */
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

// ─────────────────────────────────────────────────────────────────────────────
// Compare-and-swap: save refuses a stale write (no lost update across processes)
// ─────────────────────────────────────────────────────────────────────────────

describe('save — compare-and-swap conflict (StaleRegistryError)', () => {
  it('should_refuse_and_preserve_the_winner_when_a_second_snapshot_saves_over_a_committed_write', () => {
    // Arrange — two processes load the SAME generation; the first commits.
    reg.save(root, reg.emptyRegistry());        // seed → disk generation 1
    const a = reg.load(root);                    // snapshot A @ generation 1
    const b = reg.load(root);                    // snapshot B @ generation 1
    reg.addTask(a, { kind: 'plan', label: 'A-wins' });
    reg.save(root, a);                           // A commits → disk generation 2
    reg.addTask(b, { kind: 'plan', label: 'B-loses' });

    // Act — B (still holding generation 1) tries to save over A's committed generation 2.
    let err;
    try { reg.save(root, b); } catch (e) { err = e; }

    // Assert — the stale write is refused loudly, and A's update survives byte-for-byte.
    assert.ok(err, 'a stale save must throw, not silently clobber');
    assert.equal(err.name, 'StaleRegistryError');
    assert.equal(err.expected, 1, 'error carries the generation B was loaded at');
    assert.equal(err.actual, 2, 'error carries the generation currently on disk');
    const back = reg.load(root);
    assert.deepEqual(back.tasks.map(t => t.label), ['A-wins'], 'no lost update — B never overwrote A');
    assert.ok(
      reg.readWarnLog(root).some(w => w.event === 'registry_stale_write_refused'),
      'the refusal is surfaced in the warn log'
    );
  });

  it('should_allow_a_second_sequential_save_of_the_same_value_without_a_false_self_conflict', () => {
    // Arrange — one snapshot, mutated and saved once (its in-memory generation must advance).
    reg.save(root, reg.emptyRegistry());
    const r = reg.load(root);
    reg.addTask(r, { kind: 'plan', label: 'one' });
    reg.save(root, r);                            // advances r.generation in memory

    // Act — mutate and save the SAME object again (sequential, not concurrent).
    reg.addTask(r, { kind: 'plan', label: 'two' });

    // Assert — no StaleRegistryError; both mutations land.
    assert.doesNotThrow(() => reg.save(root, r), 'a re-save of the just-committed value must not self-conflict');
    assert.deepEqual(reg.load(root).tasks.map(t => t.label), ['one', 'two']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// withRegistry — the load→mutate→save choke point (retry, abort, exhaustion, guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('withRegistry — compare-and-swap retry helper', () => {
  it('should_reload_and_reapply_the_mutator_when_a_concurrent_writer_commits_between_load_and_save', () => {
    // Arrange — seed, then a mutator that (only on its first attempt) simulates a
    // rival process committing between our load and our save.
    reg.save(root, reg.emptyRegistry());
    const attemptsSeen = [];

    // Act
    const result = reg.withRegistry(root, (registry, ctx) => {
      attemptsSeen.push(ctx.attempt);
      if (ctx.attempt === 1) {
        const rival = reg.load(root);
        reg.addTask(rival, { kind: 'plan', label: 'intruder' });
        reg.save(root, rival);                    // commits → our held value is now stale
      }
      reg.addTask(registry, { kind: 'plan', label: 'mine' });
      return ctx.attempt;
    });

    // Assert — retried exactly once, and the re-applied mutation joins the winner's state.
    assert.deepEqual(attemptsSeen, [1, 2], 'the first save conflicted → exactly one reload+reapply');
    assert.equal(result, 2, 'withRegistry returns the mutator value from the winning attempt');
    assert.deepEqual(
      reg.load(root).tasks.map(t => t.label).sort(),
      ['intruder', 'mine'],
      'no lost update — mine was re-applied against the intruder-committed state'
    );
  });

  it('should_write_nothing_when_the_mutator_aborts', () => {
    // Arrange
    reg.save(root, reg.emptyRegistry());
    const genBefore = reg.load(root).generation;

    // Act — mutate in memory but abort before the save.
    const ret = reg.withRegistry(root, (registry, ctx) => {
      reg.addTask(registry, { kind: 'plan', label: 'never-persisted' });
      ctx.abort();
      return 'refused';
    });

    // Assert — the mutator's value is returned, but the registry is byte-unchanged.
    assert.equal(ret, 'refused');
    const back = reg.load(root);
    assert.deepEqual(back.tasks, [], 'an aborted mutation persists nothing');
    assert.equal(back.generation, genBefore, 'an aborted mutation does not advance the generation');
  });

  it('should_give_up_bounded_after_the_attempt_budget_when_contention_never_clears', () => {
    // Arrange — a mutator that forces a conflict on EVERY attempt (a rival always
    // commits before our save), so the compare-and-swap can never succeed.
    reg.save(root, reg.emptyRegistry());
    let calls = 0;

    // Act + Assert — bounded to `attempts`, then throws + records the exhaustion.
    let err;
    try {
      reg.withRegistry(root, (registry) => {
        calls++;
        const rival = reg.load(root);
        reg.addTask(rival, { kind: 'plan' });
        reg.save(root, rival);
        reg.addTask(registry, { kind: 'plan' });
      }, { attempts: 2 });
    } catch (e) { err = e; }

    assert.ok(err, 'persistent contention must surface, not spin forever');
    assert.equal(err.name, 'StaleRegistryError');
    assert.equal(calls, 2, 'the mutator ran exactly `attempts` times — the retry loop is bounded');
    assert.ok(
      reg.readWarnLog(root).some(w => w.event === 'registry_cas_exhausted'),
      'exhaustion is surfaced in the warn log'
    );
  });

  it('should_throw_a_TypeError_when_the_mutator_is_not_a_function', () => {
    assert.throws(() => reg.withRegistry(root, 'not-a-function'), /requires a mutator function/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canTransition — the single lifecycle encoding (+ prototype-key guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('canTransition — status-transition oracle', () => {
  // Table-driven: each row pins one edge of VALID_TRANSITIONS.
  const legal = [
    { from: 'queued', to: 'running', id: 'queued→running' },
    { from: 'running', to: 'done', id: 'running→done' },
    { from: 'running', to: 'cancelling', id: 'running→cancelling' },
    { from: 'cancelling', to: 'cancelled', id: 'cancelling→cancelled' },
    { from: 'orphaned', to: 'done', id: 'orphaned→done (late completion)' }
  ];
  for (const row of legal) {
    it(`should_return_true_for_the_legal_transition_${row.id}`, () => {
      assert.equal(reg.canTransition(row.from, row.to), true);
    });
  }

  const illegal = [
    { from: 'queued', to: 'done', id: 'queued→done skips running' },
    { from: 'done', to: 'running', id: 'done is a hard terminal' },
    { from: 'running', to: 'cancelled', id: 'running→cancelled must pass through cancelling' },
    { from: 'orphaned', to: 'cancelled', id: 'orphaned→cancelled forbidden' }
  ];
  for (const row of illegal) {
    it(`should_return_false_for_the_illegal_transition_${row.id}`, () => {
      assert.equal(reg.canTransition(row.from, row.to), false);
    });
  }

  it('should_return_false_for_an_unknown_from_status_rather_than_throwing', () => {
    assert.equal(reg.canTransition('not-a-real-status', 'running'), false);
  });

  it('should_return_false_for_a_prototype_chain_key_as_from_status', () => {
    // Guards the hasOwnProperty check: a plain `from in VALID_TRANSITIONS` would find
    // 'toString'/'hasOwnProperty' on Object.prototype, then blow up on `.has` (undefined).
    assert.equal(reg.canTransition('toString', 'running'), false);
    assert.equal(reg.canTransition('hasOwnProperty', 'done'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findActivePlanTask — occupying ▷ queued preference (the C2 shadow-duplicate bug)
// ─────────────────────────────────────────────────────────────────────────────

describe('findActivePlanTask — live-task-for-plan lookup', () => {
  it('should_prefer_a_running_task_over_cancelling_and_queued_duplicates_for_the_same_plan', () => {
    // Arrange — three live implement tasks for plan 'p', in NON-preference array order
    // (queued first) so a naive live[0] would return the queued duplicate (the C2 defect).
    const r = mkReg([
      T({ id: 'tq', kind: 'implement', plan: 'p', status: 'queued', touches: ['a.js'] }),
      T({ id: 'tc', kind: 'implement', plan: 'p', status: 'cancelling', touches: ['a.js'] }),
      T({ id: 'tr', kind: 'implement', plan: 'p', status: 'running', touches: ['a.js'] })
    ]);

    // Act
    const found = reg.findActivePlanTask(r, 'p');

    // Assert — the RUNNING task wins, never the queued shadow.
    assert.equal(found.id, 'tr');
  });

  it('should_prefer_a_cancelling_task_over_a_queued_one_when_none_is_running', () => {
    const r = mkReg([
      T({ id: 'tq', kind: 'implement', plan: 'p', status: 'queued', touches: ['a.js'] }),
      T({ id: 'tc', kind: 'implement', plan: 'p', status: 'cancelling', touches: ['a.js'] })
    ]);
    assert.equal(reg.findActivePlanTask(r, 'p').id, 'tc');
  });

  it('should_fall_back_to_the_first_queued_task_when_none_is_occupying', () => {
    const r = mkReg([
      T({ id: 'tq1', kind: 'implement', plan: 'p', status: 'queued', touches: ['a.js'] }),
      T({ id: 'tq2', kind: 'implement', plan: 'p', status: 'queued', touches: ['b.js'] })
    ]);
    assert.equal(reg.findActivePlanTask(r, 'p').id, 'tq1');
  });

  it('should_ignore_terminal_tasks_and_return_undefined_when_only_a_done_task_matches', () => {
    const r = mkReg([T({ id: 't1', kind: 'implement', plan: 'p', status: 'done', touches: ['a.js'] })]);
    assert.equal(reg.findActivePlanTask(r, 'p'), undefined);
  });

  it('should_honor_the_kind_filter_defaulting_to_implement', () => {
    // A live 'review' task for the plan must NOT match the default (implement) kind.
    const r = mkReg([T({ id: 't1', kind: 'review', plan: 'p', status: 'running' })]);
    assert.equal(reg.findActivePlanTask(r, 'p'), undefined, 'default kind is implement');
    assert.equal(reg.findActivePlanTask(r, 'p', 'review').id, 't1', 'explicit kind matches');
  });

  it('should_return_undefined_without_throwing_when_the_registry_has_no_tasks_array', () => {
    // The Array.isArray guard — a malformed registry value must fail safe, not throw.
    assert.equal(reg.findActivePlanTask({}, 'p'), undefined);
    assert.equal(reg.findActivePlanTask(null, 'p'), undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fail-loud shape gates that the behavioral suite never trips
// ─────────────────────────────────────────────────────────────────────────────

describe('shape gates — over-length touches and sync-without-blockedBy', () => {
  it('should_reject_a_touches_entry_longer_than_the_length_cap_at_both_entry_points', () => {
    const r = reg.emptyRegistry();
    const tooLong = 'a'.repeat(513); // MAX_TOUCH_LENGTH is 512

    // addTask (the write choke point) rejects it…
    assert.throws(
      () => reg.addTask(r, { kind: 'review', touches: [tooLong] }),
      /touches entry exceeds 512 chars/
    );
    // …and canRun (the safety oracle) rejects it too, so it can never false-safe.
    assert.throws(
      () => reg.canRun({ kind: 'review', touches: [tooLong] }, r),
      /touches entry exceeds 512 chars/
    );
    // A 512-char entry is exactly at the cap and is accepted (boundary is > not >=).
    assert.doesNotThrow(() => reg.addTask(r, { kind: 'review', touches: ['a'.repeat(512)] }));
  });

  it('should_reject_a_sync_task_with_an_empty_blockedBy_at_addTask', () => {
    const r = reg.emptyRegistry();
    // A wave barrier with nothing to integrate would run immediately against a live wave.
    assert.throws(() => reg.addTask(r, { kind: 'sync' }), /sync task requires a non-empty blockedBy/);
    assert.throws(() => reg.addTask(r, { kind: 'sync', blockedBy: [] }), /sync task requires a non-empty blockedBy/);
    // A sync WITH a blocker is accepted.
    const dep = reg.addTask(r, { kind: 'plan' });
    assert.doesNotThrow(() => reg.addTask(r, { kind: 'sync', blockedBy: [dep.id] }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// load — a too-large registry is untrusted → fail open to empty + warn
// ─────────────────────────────────────────────────────────────────────────────

describe('load — MAX_TASKS defense-in-depth', () => {
  it('should_fail_open_to_empty_and_warn_when_the_registry_exceeds_the_task_cap', () => {
    // Arrange — a crafted file with more than MAX_TASKS (10000) entries.
    const p = reg.registryPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tasks = Array.from({ length: 10001 }, (_, i) => ({ id: 't' + i, kind: 'plan', status: 'queued' }));
    fs.writeFileSync(p, JSON.stringify({ version: reg.REGISTRY_VERSION, seq: 10001, tasks }));

    // Act
    let r;
    assert.doesNotThrow(() => { r = reg.load(root); });

    // Assert — none of the crafted tasks are trusted; the oversize is surfaced.
    assert.deepEqual(r.tasks, [], 'an over-cap registry loads as empty, never partially');
    assert.ok(
      reg.readWarnLog(root).some(w => w.event === 'registry_too_large'),
      'the oversize is surfaced in the warn log'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// warn-log resilience — best-effort swallow, non-array recovery, rotation
// ─────────────────────────────────────────────────────────────────────────────

describe('warn log — resilience of the best-effort logger', () => {
  it('should_never_propagate_when_the_underlying_log_write_fails', () => {
    // Fault-inject the fs boundary so writing the log throws; warnLog must swallow it.
    const origMkdir = safeFs.mkdirSync;
    safeFs.mkdirSync = () => { throw new Error('EACCES simulated log dir failure'); };
    try {
      assert.doesNotThrow(() => reg.warnLog(root, 'some_event', { detail: 1 }),
        'a broken log must never break the registry');
    } finally {
      safeFs.mkdirSync = origMkdir;
    }
  });

  it('should_recover_from_a_valid_but_non_array_existing_log_file', () => {
    // Arrange — a log file that is valid JSON but not an array.
    const lp = path.join(root, '.ctoc', 'logs', 'task-registry.json');
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.writeFileSync(lp, JSON.stringify({ not: 'an array' }));

    // Act — append a new warn; the non-array content must be reset, not pushed onto.
    reg.warnLog(root, 'recovered_event', { k: 'v' });

    // Assert — the log is now a well-formed array carrying the new entry.
    const log = reg.readWarnLog(root);
    assert.ok(Array.isArray(log));
    assert.ok(log.some(w => w.event === 'recovered_event'),
      'a non-array log is reset so the new warn is still recorded');
  });

  it('should_rotate_to_the_last_MAX_LOG_ENTRIES_when_the_log_overflows', () => {
    // Arrange — a log pre-filled to exactly the 500-entry cap.
    const lp = path.join(root, '.ctoc', 'logs', 'task-registry.json');
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    const filled = Array.from({ length: 500 }, (_, i) => ({
      timestamp: '2026-07-02T00:00:00.000Z', level: 'warn', event: 'old', seq: i
    }));
    fs.writeFileSync(lp, JSON.stringify(filled));

    // Act — one more warn pushes past the cap, triggering the slice.
    reg.warnLog(root, 'newest_event', {});

    // Assert — capped at 500, oldest dropped, newest retained at the tail.
    const log = reg.readWarnLog(root);
    assert.equal(log.length, 500, 'the log is bounded at MAX_LOG_ENTRIES');
    assert.equal(log[log.length - 1].event, 'newest_event', 'the newest entry survives');
    assert.equal(log[0].seq, 1, 'the oldest entry (seq 0) was rotated out');
  });

  it('should_fail_open_to_empty_when_readWarnLog_finds_valid_but_non_array_json', () => {
    // The `Array.isArray(log) ? log : []` false operand (distinct from the parse-throws path).
    const lp = path.join(root, '.ctoc', 'logs', 'task-registry.json');
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.writeFileSync(lp, JSON.stringify({ shape: 'wrong' }));
    assert.deepEqual(reg.readWarnLog(root), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-empty-root guards on every disk-facing helper (caller-bug, before any I/O)
// ─────────────────────────────────────────────────────────────────────────────

describe('non-empty-root guards', () => {
  const badRoots = [
    { value: '', id: 'empty-string' },
    { value: null, id: 'null' },
    { value: 123, id: 'number' },
    { value: undefined, id: 'undefined' }
  ];

  for (const { value, id } of badRoots) {
    it(`should_throw_TypeError_from_addAndClaim_when_root_is_${id}`, () => {
      assert.throws(() => reg.addAndClaim(value, { kind: 'plan' }), TypeError);
    });
    it(`should_throw_TypeError_from_requestDrainStop_when_root_is_${id}`, () => {
      assert.throws(() => reg.requestDrainStop(value), TypeError);
    });
    it(`should_throw_TypeError_from_isDrainStopRequested_when_root_is_${id}`, () => {
      assert.throws(() => reg.isDrainStopRequested(value), TypeError);
    });
    it(`should_throw_TypeError_from_clearDrainStop_when_root_is_${id}`, () => {
      assert.throws(() => reg.clearDrainStop(value), TypeError);
    });
  }

  it('should_persist_nothing_when_addAndClaim_rejects_the_root_before_any_write', () => {
    // Guard fires before withRegistry, so no state dir is created for a bad root.
    assert.throws(() => reg.addAndClaim('', { kind: 'implement', touches: ['a.js'] }), TypeError);
  });
});

'use strict';

// R3-B rework — consolidation of the three divergent-copy defects the adversarial
// review surfaced, each pinned by a test that fails on the pre-rework tree:
//
//   1. addAndClaim's plan-uniqueness invariant is made ATOMIC (checked inside the
//      compare-and-swap mutator, not on a separate standalone load), so two
//      interleaved same-plan claims can never each add a duplicate.
//   2. task-view.js's terminal-set mirror omitted `cancelled`, so a cancelled task's
//      result summary was never rendered. It now imports the canonical TERMINAL.
//   3. The concurrent-edit quarantine's reserved-file set is ONE encoding
//      (`task-registry.staleOrphanReservedFiles`), shared by canRun's belt AND the
//      projection reporter `task-reconcile.applyQuarantine`.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const taskRegistry = require('../src/lib/task-registry');
const taskReconcile = require('../src/lib/task-reconcile');
const taskView = require('../src/lib/task-view');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-r3b-rework-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

function implSpec(plan, touches) {
  return { kind: 'implement', label: plan, plan, touches, blockedBy: [] };
}

describe('R3-B rework — atomic plan-uniqueness in addAndClaim', () => {
  it('RW-01: a second claim for a plan with a live task is REFUSED atomically (no duplicate added)', () => {
    // First claim runs (empty registry → canRun ok).
    const first = taskRegistry.addAndClaim(root, implSpec('p-alpha', ['a.js']));
    assert.equal(first.claimed, true);

    // Second claim WITH the uniqueness guard: returns the existing task, adds nothing.
    const second = taskRegistry.addAndClaim(root, implSpec('p-alpha', ['a.js']), { uniquePlan: true });
    assert.equal(second.existing, true, 'the guard reports the pre-existing task');
    assert.equal(second.claimed, false, 'nothing new was claimed');
    assert.equal(second.task.id, first.task.id, 'it returns the SAME task, not a new one');

    const reg = taskRegistry.load(root);
    const forPlan = reg.tasks.filter((t) => t.plan === 'p-alpha' && t.kind === 'implement');
    assert.equal(forPlan.length, 1, 'exactly one implement task for the plan — no duplicate');
  });

  it('RW-02: without the guard the legacy behavior (a second task is added) is unchanged', () => {
    taskRegistry.addAndClaim(root, implSpec('p-beta', ['b.js']));
    // A conflicting second claim (same files) is queued, not run — but WITHOUT uniquePlan
    // it IS added, proving the guard is opt-in and does not silently change other callers.
    const second = taskRegistry.addAndClaim(root, implSpec('p-beta', ['b.js']));
    assert.notEqual(second.existing, true);
    const reg = taskRegistry.load(root);
    assert.equal(reg.tasks.filter((t) => t.plan === 'p-beta').length, 2);
  });
});

describe('R3-B rework — ONE terminal encoding reaches task-view', () => {
  it('RW-03: a CANCELLED task renders its result summary (the mirror omitted cancelled)', () => {
    const reg = {
      version: taskRegistry.REGISTRY_VERSION,
      seq: 1,
      tasks: [{
        id: 't1', kind: 'implement', label: 'x', plan: 'x', status: 'cancelled',
        agentTaskId: null, touches: ['x.js'], gitOp: false, blockedBy: [],
        result: { summary: 'stopped by the human' },
        ts: { created: '2026-07-02T00:00:00.000Z', started: null, done: null }
      }]
    };
    const view = taskView.renderTaskDetail(reg, 't1');
    assert.match(view.text, /stopped by the human/,
      'a cancelled task is terminal — its summary must render');
  });
});

describe('R3-B rework — ONE reserved-file encoding for the quarantine', () => {
  it('RW-04: staleOrphanReservedFiles is exported and drives applyQuarantine identically', () => {
    assert.equal(typeof taskRegistry.staleOrphanReservedFiles, 'function',
      'the reserved-set predicate is exported so the reporter can share it');

    const reg = {
      version: taskRegistry.REGISTRY_VERSION,
      seq: 2,
      tasks: [
        { id: 't1', kind: 'implement', label: 'o', plan: 'o', status: 'orphaned',
          agentTaskId: null, touches: ['shared.js'], gitOp: false, blockedBy: [],
          result: { orphanReason: 'staleness' },
          ts: { created: '2026-07-02T00:00:00.000Z', started: null, done: null } },
        { id: 't2', kind: 'implement', label: 'q', plan: 'q', status: 'queued',
          agentTaskId: null, touches: ['shared.js'], gitOp: false, blockedBy: [],
          result: null,
          ts: { created: '2026-07-02T00:00:00.000Z', started: null, done: null } },
      ]
    };

    const reserved = taskRegistry.staleOrphanReservedFiles(reg);
    assert.ok(reserved.includes('shared.js'), 'the age-only orphan reserves its files');

    const out = taskReconcile.applyQuarantine(reg, [reg.tasks[1]]);
    assert.equal(out.promote.length, 0, 'the conflicting candidate is held, not promoted');
    assert.equal(out.quarantined.length, 1);
    assert.equal(out.quarantined[0].reason, 'staleness-orphan-quarantine');
  });
});

/**
 * The dashboard must say when the concurrent-edit SAFETY CHECK DID NOT RUN.
 *
 * `plans/review/00076-quarantine-fault-fails-safe.md` made that guard fail safe and
 * record `report.quarantineFaulted`, and recorded honestly that the field shipped with a
 * WRITER AND NO READER. This is that reader, and the distinction it carries is the whole
 * reason it exists:
 *
 *   `report.quarantined`       — "these tasks are waiting": normal, expected, self-clearing.
 *   `report.quarantineFaulted` — "the check that decides who waits DID NOT RUN": abnormal,
 *                                recurring, and it means the wait was a blanket precaution
 *                                rather than a decision.
 *
 * Without the second line the human sees held tasks and reasonably concludes the system is
 * working exactly as designed.
 *
 * FAULT INJECTION. `task-reconcile` destructures `touchesOverlap` from `./plan-coverage` at
 * module load, so the stub is installed on the plan-coverage exports object BEFORE
 * `menu-screens` (and through it `task-reconcile`) is required for the first time — no
 * require-cache surgery is needed, and `task-registry` is required FIRST with the real
 * implementation so the scheduler's own Rule 4 keeps the genuine overlap test. The node
 * test runner gives this file its own process, so nothing leaks into another suite.
 *
 * A handful of shapes cannot be produced from disk at all — a report entry whose `deps` is
 * absent, a fault object missing `phase` and `dropped`. Those are injected at the same kind
 * of module boundary, by rewiring `taskReconcile.reconcileState` (which `menu-screens`
 * holds as a namespace, exactly the seam `stale-detector` is rewired through elsewhere in
 * this suite). The render under test is still the real one.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Real overlap binding for the scheduler.
const reg = require('../src/lib/task-registry');
const planCoverage = require('../src/lib/plan-coverage');
const realOverlap = planCoverage.touchesOverlap;

/** When non-null, the stubbed touchesOverlap throws with this message. */
let overlapFault = null;
planCoverage.touchesOverlap = (a, b) => {
  if (overlapFault !== null) throw new Error(overlapFault);
  return realOverlap(a, b);
};

// Required AFTER the stub, so task-reconcile's destructured binding picks it up.
const menuScreens = require('../src/lib/menu-screens');
const taskReconcile = require('../src/lib/task-reconcile');
const realReconcileState = taskReconcile.reconcileState;

const MIN = 60_000;

function ago(ageMs) {
  return new Date(Date.now() - ageMs).toISOString();
}

function task(over) {
  return Object.assign({
    id: 't1',
    kind: 'implement',
    label: '',
    plan: null,
    status: 'queued',
    agentTaskId: null,
    touches: [],
    gitOp: false,
    blockedBy: [],
    result: null,
    ts: { created: ago(2 * MIN), started: null, done: null }
  }, over);
}

/** A task already orphaned on AGE ALONE, young enough that its files are still reserved. */
function ageOnlyOrphan(over) {
  return task(Object.assign({
    id: 'orphan1',
    status: 'orphaned',
    kind: 'implement',
    touches: ['src/a.js'],
    result: {
      ok: false,
      orphanReason: 'staleness',
      summary: 'orphaned on staleness alone — the agent was never confirmed dead ' +
        'and may still be editing its files'
    },
    ts: { created: ago(11 * MIN), started: ago(10 * MIN), done: ago(1 * MIN) }
  }, over));
}

function mkReg(tasks) {
  return { version: reg.REGISTRY_VERSION, seq: tasks.length, tasks };
}

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-wedge-fault-'));
  overlapFault = null;
});
afterEach(() => {
  overlapFault = null;
  taskReconcile.reconcileState = realReconcileState;
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

function render(tasks) {
  reg.save(root, mkReg(tasks));
  return menuScreens.buildDashboardTable(root);
}

/** Render the dashboard against an injected report — for shapes disk cannot produce. */
function renderReport(report) {
  taskReconcile.reconcileState = () => ({ report, promote: [] });
  return menuScreens.buildDashboardTable(root);
}

// ─────────────────────────────────────────────────────────────────────────────
// The fault itself reaches the screen
// ─────────────────────────────────────────────────────────────────────────────

describe('dashboard — the concurrent-edit guard says when it did not run', () => {
  it('renders the fault, its phase, its error and how many tasks were held for it', () => {
    overlapFault = 'injected overlap fault';
    const text = render([ageOnlyOrphan(), task({ id: 't2', touches: ['src/a.js'] })]);

    assert.ok(text.includes('the concurrent-edit safety check FAILED to run'),
      'a safety check that did not run must not look like a check that ran and held a task');
    assert.ok(text.includes('filter'), 'the phase tells a reader which half of the guard broke');
    assert.ok(text.includes('injected overlap fault'), 'the error must reach the human');
    assert.match(text, /1 task held as a blanket precaution/);
  });

  it('puts the failed CHECK above the results it did not produce', () => {
    overlapFault = 'injected overlap fault';
    const text = render([
      ageOnlyOrphan(),
      task({ id: 't2', touches: ['src/a.js'] }),
      task({
        id: 't9', kind: 'implement', status: 'running', touches: ['src/z.js'],
        ts: { created: ago(205 * MIN), started: ago(200 * MIN), done: null }
      })
    ]);

    const fault = text.indexOf('FAILED to run');
    const heldBlock = text.indexOf('held this pass');
    const results = text.indexOf('orphaned on age alone');
    assert.ok(fault >= 0 && heldBlock >= 0 && results >= 0,
      'all three lines must be present for this comparison to mean anything');
    assert.ok(fault < heldBlock,
      "the fault's count of held tasks needs its evidence directly beneath it");
    assert.ok(heldBlock < results,
      'a human who reads the results first, and stops, has learned something false');
  });

  it('does NOT claim a fault when the guard ran and simply held a task', () => {
    const text = render([
      ageOnlyOrphan(),
      task({ id: 't2', touches: ['src/a.js'] }),
      task({
        id: 't9', kind: 'implement', status: 'running', touches: ['src/z.js'],
        ts: { created: ago(205 * MIN), started: ago(200 * MIN), done: null }
      })
    ]);

    assert.ok(text.includes('held this pass'), 'the ordinary hold is still shown');
    assert.ok(text.includes('orphaned on age alone'), 'the ordinary result is still shown');
    assert.ok(!text.includes('FAILED to run'),
      'the fault line means what it says — a working guard must never trip it');
  });

  it('bounds a long error message instead of flooding the line', () => {
    overlapFault = 'x'.repeat(500);
    const text = render([ageOnlyOrphan(), task({ id: 't2', touches: ['src/a.js'] })]);

    const line = text.split('\n').find((l) => l.includes('FAILED to run'));
    assert.ok(line, 'the fault line must be present');
    assert.ok(line.length <= 260, `the fault line must stay legible, got ${line.length} chars`);
    assert.ok(line.includes('…'), 'a truncated message must say it was truncated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Malformed reports degrade; they never throw and never leak "undefined"
// ─────────────────────────────────────────────────────────────────────────────

describe('dashboard wedge reports — a malformed report degrades, never throws', () => {
  it('renders a wedge entry whose deps are absent as "none recorded"', () => {
    const text = renderReport({
      orphaned: [],
      unsatisfiable: [{ id: 't1', reason: 'dep-cycle' }]
    });

    assert.ok(text.includes('none recorded'));
    assert.ok(!text.includes('undefined'));
  });

  it('renders a fault object with no phase and no dropped list without inventing facts', () => {
    const text = renderReport({ orphaned: [], quarantineFaulted: {} });

    assert.ok(text.includes('FAILED to run'));
    assert.ok(text.includes('unknown'), 'an unknown phase says unknown');
    assert.match(text, /0 tasks held/);
    assert.ok(!text.includes('undefined'));
  });

  it('renders nothing extra for a null report', () => {
    const text = renderReport(null);

    for (const marker of ['can NEVER run', 'held one pass', 'orphaned on age alone', 'FAILED to run']) {
      assert.ok(!text.includes(marker), `a null report must not render "${marker}"`);
    }
  });
});

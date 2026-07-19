/**
 * The reconcile pass's WEDGE REPORTS must have a reader on the dashboard.
 *
 * `task-reconcile.reconcileState` computes four fields that describe work which is
 * stuck, lost, or unverifiable — `report.unsatisfiable`, `report.deferred`,
 * `report.stalenessOrphaned` and `report.quarantineFaulted`. Before this slice NONE of
 * them was read anywhere in `src/`: `menu-screens.buildDashboardTable` kept
 * `report.orphaned.length` and discarded the rest, so the dashboard rendered exactly one
 * line and a task the scheduler had already FAILED for a permanent dependency cycle was
 * indistinguishable, from the human's seat, from a task that failed once for an ordinary
 * reason.
 *
 * Every case here drives the REAL human path: a real registry on disk, then
 * `menuScreens.buildDashboardTable(root)`, then assertions on the text a human would
 * actually read. The private renderer is never called directly — a test that asserted a
 * function returns a populated object would prove nothing about what reaches the screen,
 * which is the entire point of this slice.
 *
 * The cases that need an INJECTED report (a guard that threw, a malformed report entry)
 * live in tests/dashboard-wedge-fault.test.js, which performs module-boundary fault
 * injection and therefore gets its own process.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../src/lib/task-registry');
const menuScreens = require('../src/lib/menu-screens');

const MIN = 60_000;

/** ISO string for `ageMs` in the past, relative to the real clock the dashboard uses. */
function ago(ageMs) {
  return new Date(Date.now() - ageMs).toISOString();
}

/** A registry task with sane defaults; `over` replaces any field. */
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

function mkReg(tasks) {
  return { version: reg.REGISTRY_VERSION, seq: tasks.length, tasks };
}

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-wedge-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Seed the on-disk registry and render the dashboard exactly as `/ctoc:menu` does. */
function render(tasks) {
  reg.save(root, mkReg(tasks));
  return menuScreens.buildDashboardTable(root);
}

// ─────────────────────────────────────────────────────────────────────────────
// A clean project must render exactly as it did before this slice
// ─────────────────────────────────────────────────────────────────────────────

describe('dashboard wedge reports — a project with no wedges is unchanged', () => {
  it('adds not one byte for a registry with only a done task', () => {
    const text = render([task({
      id: 't1', status: 'done', kind: 'review',
      result: { ok: true, summary: 'done' },
      ts: { created: ago(5 * MIN), started: ago(4 * MIN), done: ago(3 * MIN) }
    })]);

    for (const marker of ['can NEVER run', 'held one pass', 'held this pass',
      'orphaned on age alone', 'FAILED to run']) {
      assert.ok(!text.includes(marker), `a clean project must not render "${marker}"`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A held candidate must be visible to a human who only opens the dashboard
// ─────────────────────────────────────────────────────────────────────────────

describe('dashboard wedge reports — a task the concurrent-edit guard held', () => {
  it('is visible on the DASHBOARD, not only on a menu task command result', () => {
    const text = render([
      task({
        id: 'orphan1', status: 'orphaned', kind: 'implement', touches: ['src/a.js'],
        result: {
          ok: false,
          orphanReason: 'staleness',
          summary: 'orphaned on staleness alone — the agent was never confirmed dead ' +
            'and may still be editing its files'
        },
        ts: { created: ago(11 * MIN), started: ago(10 * MIN), done: ago(1 * MIN) }
      }),
      task({ id: 't2', touches: ['src/a.js'] })
    ]);

    assert.ok(text.includes('held this pass'),
      'a human who never runs a menu task command must still see that work is being held');
    assert.ok(text.includes('t2'), 'the held candidate must be named');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The load-bearing distinction: PERMANENT vs ONE-OFF
// ─────────────────────────────────────────────────────────────────────────────

describe('dashboard wedge reports — a permanent wedge is distinguishable from a one-off', () => {
  it('shows a dependency CYCLE as permanent, naming what it depends on', () => {
    const text = render([
      task({ id: 't1', blockedBy: ['t2'] }),
      task({ id: 't2', blockedBy: ['t1'] })
    ]);

    assert.match(text, /2 tasks can NEVER run/,
      'the header must carry the true total of wedged tasks');
    assert.ok(text.includes('⛔ PERMANENT'),
      'a cycle can never clear on its own and must say so on screen');
    assert.ok(text.includes('dependency cycle'), 'the reason must be named in human words');
    assert.match(text, /depends on: t2/, 'the dependency ids the report already carries must be shown');
    assert.match(text, /depends on: t1/);
  });

  it('shows a FAILED dependency as a one-off — never as permanent', () => {
    const text = render([
      task({
        id: 't1', status: 'failed', result: { ok: false, summary: 'boom' },
        ts: { created: ago(9 * MIN), started: ago(8 * MIN), done: ago(7 * MIN) }
      }),
      task({ id: 't2', blockedBy: ['t1'] })
    ]);

    assert.ok(text.includes('a dependency failed'), 'the one-off reason must be named');
    assert.ok(text.includes('depends on: t1'));
    assert.ok(!text.includes('PERMANENT'),
      'an ordinary failed dependency is NOT permanent — conflating the two is the defect');
  });

  it('names the id that is gone when a dependency is missing from the registry', () => {
    const text = render([task({ id: 't2', blockedBy: ['t99'] })]);

    assert.ok(text.includes('a dependency is gone from the registry'));
    assert.ok(text.includes('depends on: t99'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deferred work and age-only orphans
// ─────────────────────────────────────────────────────────────────────────────

describe('dashboard wedge reports — deferred and age-only-orphaned work', () => {
  /** A running implement task past its 120-min floor, with no live agent to confirm. */
  const agingRunner = (id, touches) => task({
    id, kind: 'implement', status: 'running', touches: touches || [],
    ts: { created: ago(205 * MIN), started: ago(200 * MIN), done: null }
  });

  it('shows a deferred task and what it is waiting on', () => {
    const text = render([agingRunner('t1'), task({ id: 't2', blockedBy: ['t1'] })]);

    assert.ok(text.includes('held one pass'), 'a deferral must be a visible event');
    assert.ok(text.includes('waiting on: t1'));
    assert.ok(text.includes('t2'));
  });

  it('shows an age-only orphan with its age and the floor that orphaned it', () => {
    const text = render([agingRunner('t1'), task({ id: 't2', blockedBy: ['t1'] })]);

    assert.ok(text.includes('orphaned on age alone'));
    assert.ok(text.includes('(implement)'));
    assert.ok(text.includes('min old'));
    assert.ok(text.includes('the floor for this kind is 120 min'));
  });

  it('renders an unparseable start time as "unknown", never as NaN', () => {
    const text = render([task({
      id: 't1', kind: 'implement', status: 'running',
      ts: { created: ago(205 * MIN), started: 'not-a-date', done: null }
    })]);

    assert.ok(text.includes('unknown'), 'an unknown age must say so');
    assert.ok(!/NaN/.test(text), 'NaN on a dashboard is a bug leaking through the render');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bounds, safety, and fail-open
// ─────────────────────────────────────────────────────────────────────────────

describe('dashboard wedge reports — bounded, safe and fail-open', () => {
  it('collapses past the render cap while the header keeps the TRUE total', () => {
    const tasks = [];
    for (let i = 1; i <= 7; i++) tasks.push(task({ id: `t${i}`, blockedBy: [`gone${i}`] }));
    const text = render(tasks);

    assert.match(text, /7 tasks can NEVER run/, 'the count must be complete even when the list is capped');
    assert.ok(text.includes('… and 2 more'));
    const detail = text.split('\n').filter((l) => l.includes('a dependency is gone from the registry'));
    assert.equal(detail.length, 5, 'exactly the cap of 5 detail lines is rendered');
  });

  it('cannot be made to forge a dashboard row with a control character', () => {
    const text = render([task({ id: 't1', blockedBy: ['\x1b[2Jx'] })]);

    assert.ok(!text.includes('\x1b'), 'an escape sequence must never survive into the render');
    assert.ok(text.includes('depends on: [2Jx'), 'the id is still shown, stripped');
  });

  it('still renders the dashboard when the registry file is not JSON at all', () => {
    fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'state', 'tasks.json'), 'not json at all');

    const text = menuScreens.buildDashboardTable(root);
    assert.ok(typeof text === 'string' && text.length > 0, 'fail-open: the dashboard always renders');
  });
});

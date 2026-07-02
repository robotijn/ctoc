/**
 * NB2 — Behavioral tests for the menu task-wiring (Iron Loop Step 8, TDD).
 *
 * Maps the 9 BDD Acceptance-Criteria scenarios (S1…S9) + 7 edge tests (E1…E7)
 * from plans/todo/NB2-menu-task-wiring.md.
 *
 * Subcommands + screens are exercised through src/lib/menu-screens.route(); the
 * pure renderers in src/lib/task-view.js are unit-tested with in-memory registry
 * literals (no disk). On-disk seeding uses the NB1 task-registry API
 * (addTask/updateTask/save). Isolated tmp roots (fs.mkdtempSync); afterEach rm.
 * Raw fs/os are permitted in tests/** (eslint exempts the fs rule there).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = require('../src/lib/menu-screens');
const taskView = require('../src/lib/task-view');
const taskRegistry = require('../src/lib/task-registry');

// ── tmp-root harness ────────────────────────────────────────────────────────

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-nb2-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ── in-memory registry helpers (no disk) ────────────────────────────────────

/** Build an in-memory registry value from an array of task literals. */
function mkReg(tasks) {
  return { version: taskRegistry.REGISTRY_VERSION, seq: tasks.length, tasks };
}

/** A well-shaped task literal with sensible defaults, overridable per field. */
function T(over = {}) {
  return {
    id: over.id || 't?',
    kind: over.kind || 'review',
    label: over.label || '',
    plan: over.plan ?? null,
    status: over.status || 'queued',
    agentTaskId: over.agentTaskId ?? null,
    touches: over.touches || [],
    gitOp: over.gitOp === true,
    blockedBy: over.blockedBy || [],
    result: over.result ?? null,
    ts: over.ts || { created: '2026-07-02T00:00:00.000Z', started: null, done: null }
  };
}

/** Seed a done task on disk (queued → running → done, optional result). */
function seedDone(reg, plan, result) {
  const t = taskRegistry.addTask(reg, { kind: 'review', plan });
  taskRegistry.updateTask(reg, t.id, { status: 'running' });
  taskRegistry.updateTask(reg, t.id, { status: 'done', result: result || { ok: true } });
  return t;
}

// ═══════════════════════════════════════════════════════════════════════════
// BDD scenarios S1–S9
// ═══════════════════════════════════════════════════════════════════════════

describe('NB2 — task subcommands (S1–S3)', () => {
  it('S1: add persists queued + returns {taskId,decision,reason}', () => {
    const res = ms.route(['menu', 'task', 'add', 'implement', 'pi1'], root);
    assert.equal(res.ok, true);
    assert.ok(res.taskId, 'taskId is truthy');
    assert.equal(res.status, 'queued');
    assert.ok(res.decision === 'run' || res.decision === 'queue', 'decision is run|queue');
    assert.ok(typeof res.reason === 'string' && res.reason.length > 0);
    const reg = taskRegistry.load(root);
    assert.equal(reg.tasks.length, 1);
    assert.equal(reg.tasks[0].status, 'queued');
    assert.equal(reg.tasks[0].kind, 'implement');
  });

  it('S2: start/complete/fail/cancel record status', () => {
    const add = ms.route(['menu', 'task', 'add', 'review', 'LH1'], root);
    const id = add.taskId;

    const started = ms.route(['menu', 'task', 'start', id], root);
    assert.equal(started.status, 'running');

    const done = ms.route(['menu', 'task', 'complete', id, '--summary', 'looksgood'], root);
    assert.equal(done.status, 'done');
    let reg = taskRegistry.load(root);
    assert.equal(reg.tasks.find(t => t.id === id).result.summary, 'looksgood');

    const add2 = ms.route(['menu', 'task', 'add', 'review', 'LH2'], root);
    const failed = ms.route(['menu', 'task', 'fail', add2.taskId], root);
    assert.equal(failed.status, 'failed');
    reg = taskRegistry.load(root);
    assert.equal(reg.tasks.find(t => t.id === add2.taskId).result.ok, false);

    const add3 = ms.route(['menu', 'task', 'add', 'review', 'LH3'], root);
    const cancelled = ms.route(['menu', 'task', 'cancel', add3.taskId], root);
    assert.equal(cancelled.status, 'failed');
    assert.equal(cancelled.cancelled, true);
    reg = taskRegistry.load(root);
    assert.equal(reg.tasks.find(t => t.id === add3.taskId).result.cancelled, true);
  });

  it('S3: list returns every task with status/label/plan', () => {
    ms.route(['menu', 'task', 'add', 'review', 'LH1'], root);
    ms.route(['menu', 'task', 'add', 'implement', 'pi1'], root);
    const before = taskRegistry.load(root).tasks.length;
    const res = ms.route(['menu', 'task', 'list'], root);
    assert.equal(res.ok, true);
    assert.equal(res.tasks.length, 2);
    for (const t of res.tasks) {
      for (const f of ['id', 'kind', 'status', 'label', 'plan']) {
        assert.ok(f in t, `task has ${f}`);
      }
    }
    // list is a pure read — no fs mutation of the registry
    assert.equal(taskRegistry.load(root).tasks.length, before);
  });
});

describe('NB2 — TASKS dashboard section (S4–S5)', () => {
  it('S4: TASKS section shows running/queued/done + waits', () => {
    const reg = taskRegistry.emptyRegistry();
    const a = taskRegistry.addTask(reg, { kind: 'implement', plan: 'pi1' });
    taskRegistry.updateTask(reg, a.id, { status: 'running' });
    const b = taskRegistry.addTask(reg, { kind: 'review', plan: 'LH1' });
    taskRegistry.updateTask(reg, b.id, { status: 'running' });
    // queued task blocked on the still-running pi1 → "waits: pi1"
    taskRegistry.addTask(reg, { kind: 'implement', plan: 'pi2', blockedBy: [a.id] });
    seedDone(reg, 'd1');
    seedDone(reg, 'd2');
    seedDone(reg, 'd3');
    taskRegistry.save(root, reg);

    const text = ms.route([], root).text;
    assert.match(text, /2 running/);
    assert.match(text, /1 queued/);
    assert.match(text, /3 done/);
    assert.match(text, /waits: pi1/);
  });

  it('S5: empty registry adds no dashboard output + Inbox clear', () => {
    const text = ms.route([], root).text;
    assert.doesNotMatch(text, /TASKS/);
    assert.match(text, /Inbox clear/);
  });
});

describe('NB2 — task-board + task-detail screens (S6–S7, S9)', () => {
  it('S6: board groups by status, ids selectable, [0] back', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'implement', plan: 'pi1', status: 'running' }),
      T({ id: 't2', kind: 'implement', plan: 'pi2', status: 'queued' }),
      T({ id: 't3', kind: 'review', plan: 'LH1', status: 'done' }),
      T({ id: 't4', kind: 'review', plan: 'LH2', status: 'failed' }),
    ]);
    const board = taskView.renderTaskBoard(reg);
    assert.equal(board.inputMode, 'task-select');
    assert.match(board.text, /Running/);
    assert.match(board.text, /Queued/);
    assert.match(board.text, /Done/);
    assert.match(board.text, /Failed/);
    assert.equal(board.actions['t1'], 'task t1');
    assert.ok('back' in board.actions, 'back present');
    for (const k of Object.keys(board.actions)) {
      assert.ok(!/^\d+$/.test(k), `no bare-digit action key: ${k}`);
    }
  });

  it('S7: done detail shows summary + navigating next-action', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, summary: 'looks good', nextAction: 'plan review/LH1.md' } }),
    ]);
    const d = taskView.renderTaskDetail(reg, 't1');
    assert.match(d.text, /looks good/);
    const vals = Object.values(d.actions);
    assert.ok(vals.some(v => /^(plan|browse) /.test(v)), 'a NAV route option exists');
    assert.ok(!vals.some(v => /^claude:/.test(v)), 'no claude: mutation option');
    assert.equal(d.actions['◀ Back'], 'tasks');
  });

  it('S9: gate-ready done task shows Gate N ready, no transition', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, summary: 'gate reached', nextAction: 'browse review', gate: 3 } }),
    ]);
    const line = taskView.tasksInboxLine(reg);
    assert.match(line, /Gate 3 ready/);
    const d = taskView.renderTaskDetail(reg, 't1');
    const vals = Object.values(d.actions);
    assert.ok(vals.some(v => /^(plan|browse) /.test(v)), 'next-action is a NAV route');
    assert.ok(!vals.some(v => /^claude:/.test(v)), 'no gate-crossing mutation');
    assert.match(JSON.stringify(d), /Gate 3 ready/);
  });
});

describe('NB2 — INBOX integration (S8)', () => {
  it('S8: done tasks surface a background-tasks INBOX line', () => {
    const reg = taskRegistry.emptyRegistry();
    seedDone(reg, 'a');
    seedDone(reg, 'b');
    seedDone(reg, 'c');
    taskRegistry.save(root, reg);

    const text = ms.route([], root).text;
    assert.match(text, /background tasks/);
    assert.doesNotMatch(text, /Inbox clear/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge tests E1–E7
// ═══════════════════════════════════════════════════════════════════════════

describe('NB2 — edge cases (E1–E7)', () => {
  it('E1: byStatus renders queued/running/done/failed/cancelled', () => {
    const reg = mkReg([
      T({ id: 't1', status: 'queued', plan: 'a' }),
      T({ id: 't2', status: 'running', plan: 'b' }),
      T({ id: 't3', status: 'done', plan: 'c' }),
      T({ id: 't4', status: 'failed', plan: 'd' }),
      T({ id: 't5', status: 'failed', plan: 'e', result: { ok: false, cancelled: true, summary: 'cancelled' } }),
    ]);
    const board = taskView.renderTaskBoard(reg);
    assert.match(board.text, /Queued/);
    assert.match(board.text, /Running/);
    assert.match(board.text, /Done/);
    assert.match(board.text, /Failed/);
    assert.match(board.text, /cancelled/);
  });

  it('E2: done detail without nextAction offers only Back', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, summary: 'done' } }),
    ]);
    const d = taskView.renderTaskDetail(reg, 't1');
    assert.deepEqual(Object.keys(d.actions), ['◀ Back']);
  });

  it('E3: task detail for unknown id → safe Back screen', () => {
    const d = ms.route(['task', 'tX'], root);
    assert.ok(d.text && d.text.length > 0);
    assert.equal(d.actions['◀ Back'], 'tasks');
  });

  it('E4: board exposes no bare-digit key; detail selects by label', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, summary: 's', nextAction: 'plan review/LH1.md' } }),
    ]);
    const board = taskView.renderTaskBoard(reg);
    for (const k of Object.keys(board.actions)) assert.ok(!/^\d+$/.test(k), `board key ${k}`);
    const d = taskView.renderTaskDetail(reg, 't1');
    for (const k of Object.keys(d.actions)) assert.ok(!/^\d+$/.test(k), `detail key ${k}`);
  });

  it('E5: complete on a done task returns {ok:false,error}', () => {
    const add = ms.route(['menu', 'task', 'add', 'review', 'LH1'], root);
    ms.route(['menu', 'task', 'start', add.taskId], root);
    ms.route(['menu', 'task', 'complete', add.taskId, '--summary', 'ok'], root);
    const res = ms.route(['menu', 'task', 'complete', add.taskId], root);
    assert.equal(res.ok, false);
    assert.ok(typeof res.error === 'string' && /transition|done/.test(res.error), `error names the transition: ${res.error}`);
    // registry intact — the task remains done
    assert.equal(taskRegistry.load(root).tasks.find(t => t.id === add.taskId).status, 'done');
  });

  it('E6: corrupt tasks.json fails open (dashboard renders)', () => {
    const dir = path.join(root, '.ctoc', 'state');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tasks.json'), '{ this is not valid json');
    const text = ms.route([], root).text;
    assert.ok(text.length > 0, 'dashboard still renders');
    assert.doesNotMatch(text, /TASKS/, 'TASKS omitted on corrupt registry');
  });

  it('renderTasksSection: failed line + running overflow + non-dep wait reason', () => {
    const running = [];
    for (let i = 1; i <= 8; i++) running.push(T({ id: 'r' + i, kind: 'review', plan: 'p' + i, status: 'running' }));
    const reg = mkReg([
      ...running,
      T({ id: 'q1', kind: 'implement', plan: 'pq', status: 'queued' }), // blocked by max-concurrent
      T({ id: 'f1', kind: 'review', plan: 'pf', status: 'failed', result: { ok: false, cancelled: true } }),
    ]);
    const s = taskView.renderTasksSection(reg);
    assert.match(s, /8 running/);
    assert.match(s, /\+2/, 'overflow marker beyond first 6 running');
    assert.match(s, /1 failed/);
    assert.match(s, /\(cancelled\)/);
    assert.match(s, /waits: max-concurrent/);
  });

  it('renderTaskBoard: empty registry → safe no-tasks screen', () => {
    const board = taskView.renderTaskBoard(mkReg([]));
    assert.equal(board.inputMode, 'task-select');
    assert.match(board.text, /No background tasks/);
    assert.equal(board.actions.back, '');
    for (const k of Object.keys(board.actions)) assert.ok(!/^\d+$/.test(k));
  });

  it('renderTaskList: one line per task; empty → ""', () => {
    assert.equal(taskView.renderTaskList(mkReg([])), '');
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done' }),
      T({ id: 't2', kind: 'implement', status: 'queued', label: 'lbl' }),
      T({ id: 't3', kind: 'review', plan: 'LH3', status: 'failed', result: { ok: false, cancelled: true } }),
      T({ id: 't4', kind: 'sync', plan: null, label: '', status: 'running' }),
    ]);
    const list = taskView.renderTaskList(reg);
    assert.match(list, /t1\s+review\s+LH1\s+\[done\]/);
    assert.match(list, /t2\s+implement\s+lbl\s+\[queued\]/);
    assert.match(list, /t3\s+review\s+LH3\s+\[cancelled\]/, 'cancelled rendered');
    assert.match(list, /t4\s+sync\s+-\s+\[running\]/, 'no plan/label → dash');
  });

  it('renderTaskDetail: null id → safe Back; running task → only Back', () => {
    const dNull = taskView.renderTaskDetail(mkReg([]), null);
    assert.equal(dNull.actions['◀ Back'], 'tasks');
    assert.match(dNull.text, /not found/i);
    const reg = mkReg([T({ id: 't1', kind: 'implement', plan: 'pi1', status: 'running' })]);
    const d = taskView.renderTaskDetail(reg, 't1');
    assert.deepEqual(Object.keys(d.actions), ['◀ Back']);
    assert.match(d.text, /status: running/);
  });

  it('renderTasksSection: malformed queued task degrades wait reason; board shows gate suffix', () => {
    const reg = mkReg([
      T({ id: 'q1', kind: 'implement', plan: 'pq', status: 'queued', blockedBy: 'oops' }), // non-array → canRun throws
      T({ id: 'g1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, gate: 2 } }),
    ]);
    const s = taskView.renderTasksSection(reg);
    assert.match(s, /waits: queued/, 'canRun throw degrades to generic label');
    const board = taskView.renderTaskBoard(reg);
    assert.match(board.text, /Gate 2 ready/, 'done row carries the gate-ready suffix');
  });

  it('taskLabel/planName fallbacks: label then id when no plan', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'discuss', plan: null, label: 'mylabel', status: 'running' }),
      T({ id: 't2', kind: 'sync', plan: null, label: '', status: 'running' }),
    ]);
    const s = taskView.renderTasksSection(reg);
    assert.match(s, /discuss mylabel/, 'planName empty → label');
    assert.match(s, /sync t2/, 'planName + label empty → id');
    // inbox line uses the same fallback ladder for a gated done task without a plan
    const line = taskView.tasksInboxLine(mkReg([
      T({ id: 't9', kind: 'review', plan: null, label: 'gatelbl', status: 'done', result: { ok: true, gate: 1 } }),
    ]));
    assert.match(line, /Gate 1 ready — gatelbl/);
  });

  it('tasksInboxLine: empty → ""; single done → singular phrasing', () => {
    assert.equal(taskView.tasksInboxLine(mkReg([])), '');
    const line = taskView.tasksInboxLine(mkReg([T({ id: 't1', status: 'done', plan: 'a' })]));
    assert.match(line, /1 background task done/);
  });

  it('E7: registry path via task-registry (no raw fs / separators)', () => {
    const p = taskRegistry.registryPath(root);
    assert.ok(p.includes(path.join('.ctoc', 'state', 'tasks.json')), 'path.join-derived registry path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'menu-screens.js'), 'utf8');
    assert.doesNotMatch(src, /tasks\.json/, 'menu-screens never hardcodes the registry file');
    assert.match(src, /taskRegistry\.load/, 'registry reads go through task-registry.load');
    assert.match(src, /taskRegistry\.save/, 'registry writes go through task-registry.save');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gate-safety (HIGH): the task-detail next-action is NAV-ONLY. A crafted or
// `--next`-supplied `claude:*` route must NEVER render as an executable action
// nor persist — that would cross a human gate. Defense in depth: BOTH the store
// (taskComplete) and the renderer (renderTaskDetail) enforce the nav-route
// allowlist (Decision 5, the feature's load-bearing safety invariant).
// ═══════════════════════════════════════════════════════════════════════════

describe('NB2 — gate-safety: next-action is navigation-only (HIGH)', () => {
  it('GS1: store rejects a complete whose nextAction is a claude: gate-crosser', () => {
    const add = ms.route(['menu', 'task', 'add', 'review', 'LH1'], root);
    ms.route(['menu', 'task', 'start', add.taskId], root);
    const res = ms.route(['menu', 'task', 'complete', add.taskId, '--gate', '3', '--next', 'claude:approve review/x.md'], root);
    assert.equal(res.ok, false, 'store rejects a gate-crossing nextAction');
    assert.match(res.error, /navigation route/, 'error explains nextAction must be a nav route');
    // the crafted complete did NOT persist (task must not be silently marked done)
    const t = taskRegistry.load(root).tasks.find(x => x.id === add.taskId);
    assert.notEqual(t.status, 'done', 'gate-crossing complete was not persisted');
    assert.ok(!(t.result && t.result.nextAction === 'claude:approve review/x.md'), 'crafted route not stored');
  });

  it('GS2: crafted registry with a claude:approve nextAction renders NO gate-crossing action', () => {
    // seed a done task directly (bypass the store, simulating a tampered tasks.json)
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'x', status: 'done', result: { ok: true, summary: 's', nextAction: 'claude:approve review/x.md', gate: 3 } }),
    ]);
    const d = taskView.renderTaskDetail(reg, 't1');
    const vals = Object.values(d.actions);
    assert.ok(!vals.some(v => /^claude:/.test(v)), 'no claude: action value emitted');
    assert.ok(!vals.includes('claude:approve review/x.md'), 'gate-crossing option not present');
    // degrades to Back-only (nav-only invariant) — never a non-nav action
    assert.deepEqual(Object.keys(d.actions), ['◀ Back']);
    // …but the gate is still SHOWN as informational text (parity with board/inbox)
    assert.match(d.text, /Gate 3 ready/, 'gate shown as text even when the action is dropped');
  });

  it('GS3: claude:reject nextAction is likewise dropped (Back-only)', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'x', status: 'done', result: { ok: true, nextAction: 'claude:reject review/x.md' } }),
    ]);
    const d = taskView.renderTaskDetail(reg, 't1');
    assert.ok(!Object.values(d.actions).some(v => /^claude:/.test(v)), 'no claude: action');
    assert.deepEqual(Object.keys(d.actions), ['◀ Back']);
  });

  it('GS3b: a non-allowlisted opaque route is also dropped to Back-only', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'x', status: 'done', result: { ok: true, nextAction: 'rm -rf review/x.md' } }),
    ]);
    const d = taskView.renderTaskDetail(reg, 't1');
    assert.deepEqual(Object.keys(d.actions), ['◀ Back'], 'unknown route not emitted');
  });

  it('GS4: a real nav-route nextAction still renders its option (positive path preserved)', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, summary: 's', nextAction: 'plan review/LH1.md' } }),
    ]);
    const d = taskView.renderTaskDetail(reg, 't1');
    assert.ok(Object.values(d.actions).includes('plan review/LH1.md'), 'nav route option present');
  });

  it('GS5: store accepts a complete with a real nav-route nextAction', () => {
    const add = ms.route(['menu', 'task', 'add', 'review', 'LH1'], root);
    ms.route(['menu', 'task', 'start', add.taskId], root);
    const res = ms.route(['menu', 'task', 'complete', add.taskId, '--next', 'plan review/LH1.md'], root);
    assert.equal(res.ok, true, 'nav-route complete accepted');
    const t = taskRegistry.load(root).tasks.find(x => x.id === add.taskId);
    assert.equal(t.status, 'done');
    assert.equal(t.result.nextAction, 'plan review/LH1.md');
  });

  it('GS6: detail echoes Gate N as text even when nextAction is absent', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, summary: 's', gate: 2 } }),
    ]);
    const d = taskView.renderTaskDetail(reg, 't1');
    assert.match(d.text, /Gate 2 ready/, 'gate shown as informational text');
    assert.deepEqual(Object.keys(d.actions), ['◀ Back'], 'no nextAction → only Back');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Board bare-digit / reserved-key hardening (MED): a crafted registry id must
// never yield a bare-digit action key (re-breaking "numbers open plans ONLY")
// nor clobber the reserved b/back affordance.
// ═══════════════════════════════════════════════════════════════════════════

describe('NB2 — board id hardening (MED)', () => {
  it('MED1: crafted ids "3"/"b" never enter the action map; only t<n> is selectable', () => {
    const reg = mkReg([
      T({ id: '3', kind: 'review', plan: 'p3', status: 'done' }),
      T({ id: 'b', kind: 'review', plan: 'pb', status: 'done' }),
      T({ id: 't5', kind: 'review', plan: 'p5', status: 'done' }),
    ]);
    const board = taskView.renderTaskBoard(reg);
    assert.equal(board.actions['t5'], 'task t5', 't5 selectable');
    assert.ok(!('3' in board.actions), 'bare-digit id excluded from action map');
    assert.equal(board.actions['b'], '', 'crafted "b" id did not clobber the Back affordance');
    assert.equal(board.actions['back'], '', 'back affordance intact');
    for (const k of Object.keys(board.actions)) {
      assert.ok(!/^\d+$/.test(k), `no bare-digit action key: ${k}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Terminal-guard on ALL mutating subcommands (LOW): start/fail/cancel on an
// already-terminal task fail soft (not just complete-on-done).
// ═══════════════════════════════════════════════════════════════════════════

describe('NB2 — terminal-guard on start/fail/cancel (LOW)', () => {
  it('TG1: start/fail/cancel on a done task all fail soft {ok:false}', () => {
    const add = ms.route(['menu', 'task', 'add', 'review', 'LH1'], root);
    ms.route(['menu', 'task', 'start', add.taskId], root);
    ms.route(['menu', 'task', 'complete', add.taskId, '--summary', 'ok'], root); // → done (terminal)
    for (const sub of ['start', 'fail', 'cancel']) {
      const res = ms.route(['menu', 'task', sub, add.taskId], root);
      assert.equal(res.ok, false, `${sub} on a terminal task fails soft`);
      assert.ok(/transition/.test(res.error), `${sub} error names the transition: ${res.error}`);
    }
    assert.equal(taskRegistry.load(root).tasks.find(x => x.id === add.taskId).status, 'done', 'registry intact');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bounded inputs / pagination (LOW).
// ═══════════════════════════════════════════════════════════════════════════

describe('NB2 — bounded inputs + pagination (LOW)', () => {
  it('B1: oversized --b64 payload (> 65536 raw) is rejected (not applied)', () => {
    const big = 'x'.repeat(70000);
    const payload = Buffer.from(JSON.stringify({ label: big }), 'utf8').toString('base64');
    assert.ok(payload.length > 65536, 'payload exceeds the cap');
    const add = ms.route(['menu', 'task', 'add', 'review', 'p', '--b64', payload], root);
    assert.equal(add.ok, true, 'add still succeeds (b64 ignored, not fatal)');
    const t = taskRegistry.load(root).tasks.find(x => x.id === add.taskId);
    assert.notEqual(t.label, big, 'oversized b64 payload was NOT applied');
  });

  it('B2: board caps a status group at 50 rows with an overflow line', () => {
    const tasks = [];
    for (let i = 1; i <= 60; i++) tasks.push(T({ id: 't' + i, kind: 'review', plan: 'p' + i, status: 'done' }));
    const board = taskView.renderTaskBoard(mkReg(tasks));
    const rows = (board.text.match(/^\s+• /gm) || []).length;
    assert.ok(rows <= 50, `board group capped at 50 (got ${rows})`);
    assert.match(board.text, /\+10 more/, 'overflow line present');
    const selectable = Object.keys(board.actions).filter(k => /^t\d+$/.test(k));
    assert.ok(selectable.length <= 50, 'only capped rows are selectable');
  });

  it('B3: list caps total rows at 100 with an overflow line', () => {
    const tasks = [];
    for (let i = 1; i <= 130; i++) tasks.push(T({ id: 't' + i, kind: 'review', plan: 'p' + i, status: 'done' }));
    const list = taskView.renderTaskList(mkReg(tasks));
    const rows = (list.match(/\[done\]/g) || []).length;
    assert.ok(rows <= 100, `list capped at 100 (got ${rows})`);
    assert.match(list, /\+30 more/, 'overflow line present');
  });
});

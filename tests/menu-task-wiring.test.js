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
    const res = ms.route(['menu', 'task', 'add', 'implement', 'pi1', '--touches', 'src/pi1.js'], root);
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

    // R2-C honest cancel (C1-2): a QUEUED task cancels immediately → `cancelled`
    // (never the old `failed`-with-a-flag). add3 was never started, so it is queued.
    const add3 = ms.route(['menu', 'task', 'add', 'review', 'LH3'], root);
    const cancelled = ms.route(['menu', 'task', 'cancel', add3.taskId], root);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelled, true);
    reg = taskRegistry.load(root);
    assert.equal(reg.tasks.find(t => t.id === add3.taskId).status, 'cancelled');
  });

  it('S3: list returns every task with status/label/plan', () => {
    ms.route(['menu', 'task', 'add', 'review', 'LH1'], root);
    ms.route(['menu', 'task', 'add', 'implement', 'pi1', '--touches', 'src/pi1.js'], root);
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
    const a = taskRegistry.addTask(reg, { kind: 'implement', plan: 'pi1', touches: ['src/pi1.js'] });
    taskRegistry.updateTask(reg, a.id, { status: 'running' });
    const b = taskRegistry.addTask(reg, { kind: 'review', plan: 'LH1' });
    taskRegistry.updateTask(reg, b.id, { status: 'running' });
    // queued task blocked on the still-running pi1 → "waits: pi1"
    taskRegistry.addTask(reg, { kind: 'implement', plan: 'pi2', touches: ['src/pi2.js'], blockedBy: [a.id] });
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

  it('S9: gate-ready done task says a decision is ready, no number, no transition', () => {
    // INVERTED (plan 00154). Contract from OUTSIDE the test: the owner reads "Gate 3"
    // as an undecodable internal code ("no numbers"). The TEST was wrong, not the code
    // — it asserted the task board PRINT "Gate 3 ready", the exact leak. A task carries
    // ONLY the gate integer (no stage), so the board cannot word the specific moment;
    // it says a decision is ready and drops the number, which is now a case that FAILS
    // if it returns.
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, summary: 'gate reached', nextAction: 'browse review', gate: 3 } }),
    ]);
    const line = taskView.tasksInboxLine(reg);
    assert.match(line, /Decision ready/);
    assert.doesNotMatch(line, /\bGate\s+[0-3]\b/, 'a gate number returned to the inbox line');
    const d = taskView.renderTaskDetail(reg, 't1');
    const vals = Object.values(d.actions);
    assert.ok(vals.some(v => /^(plan|browse) /.test(v)), 'next-action is a NAV route');
    assert.ok(!vals.some(v => /^claude:/.test(v)), 'no gate-crossing mutation');
    assert.match(JSON.stringify(d), /a decision is waiting for you/);
    assert.doesNotMatch(JSON.stringify(d), /\bGate\s+[0-3]\b/, 'a gate number returned to the detail screen');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R2-C2 item 7 — a `cancelling` task is VISIBLE (board + tasks section). A
// cancelling task still OCCUPIES a concurrency slot and holds its file locks
// until the harness agent is confirmed gone (task-registry OCCUPYING set); an
// invisible one is a lying dashboard (it blocks other tasks with no explanation).
// ═══════════════════════════════════════════════════════════════════════════

describe('R2-C2 — cancelling task is visible (item 7)', () => {
  it('renderTasksSection surfaces a cancelling task (not dropped)', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'implement', plan: 'pi1', status: 'cancelling' }),
      T({ id: 't2', kind: 'implement', plan: 'pi2', status: 'queued', touches: ['src/pi2.js'], blockedBy: ['t1'] }),
    ]);
    const s = taskView.renderTasksSection(reg);
    assert.match(s, /cancelling/, 'the cancelling count/label is rendered');
    assert.match(s, /pi1/, 'the cancelling task is named, not hidden');
    // Its file lock is honest: the queued task waiting on it names the wait.
    assert.match(s, /queued/, 'the blocked queued task is still shown');
  });

  it('renderTaskBoard shows a Cancelling group with a selectable id', () => {
    const reg = mkReg([
      T({ id: 't1', kind: 'implement', plan: 'pi1', status: 'cancelling' }),
      T({ id: 't2', kind: 'review', plan: 'LH1', status: 'done' }),
    ]);
    const board = taskView.renderTaskBoard(reg);
    assert.match(board.text, /Cancelling/, 'board renders a Cancelling group');
    assert.match(board.text, /\[cancelling\]/, 'the row shows the cancelling status');
    assert.equal(board.actions['t1'], 'task t1', 'the cancelling task is selectable by its id');
    for (const k of Object.keys(board.actions)) {
      assert.ok(!/^\d+$/.test(k), `no bare-digit action key: ${k}`);
    }
  });

  it('a lone cancelling task still produces a TASKS section (empty-check includes it)', () => {
    const reg = mkReg([T({ id: 't1', kind: 'implement', plan: 'pi1', status: 'cancelling' })]);
    const s = taskView.renderTasksSection(reg);
    assert.notEqual(s, '', 'a cancelling-only registry is NOT treated as empty');
    assert.match(s, /TASKS/);
  });

  it('a terminal cancelled task renders too (folded into the terminal group)', () => {
    const reg = mkReg([T({ id: 't1', kind: 'implement', plan: 'pi1', status: 'cancelled' })]);
    const board = taskView.renderTaskBoard(reg);
    assert.match(board.text, /\[cancelled\]/, 'a terminal cancelled task is not dropped from the board');
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
      T({ id: 'q1', kind: 'implement', plan: 'pq', status: 'queued', touches: ['src/pq.js'] }), // blocked by max-concurrent
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

  it('renderTasksSection: malformed queued task degrades wait reason; board shows decision-ready suffix', () => {
    // INVERTED (plan 00154): the board suffix says a decision is ready, never the
    // number. Contract from OUTSIDE the test: the owner's "no numbers" + gate-words;
    // the TEST was wrong (it asserted "Gate 2 ready"), the human replaced the
    // contract, and a gate digit on the board now FAILS.
    const reg = mkReg([
      T({ id: 'q1', kind: 'implement', plan: 'pq', status: 'queued', blockedBy: 'oops' }), // non-array → canRun throws
      T({ id: 'g1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, gate: 2 } }),
    ]);
    const s = taskView.renderTasksSection(reg);
    assert.match(s, /waits: queued/, 'canRun throw degrades to generic label');
    const board = taskView.renderTaskBoard(reg);
    assert.match(board.text, /decision ready/, 'done row carries the decision-ready suffix');
    assert.doesNotMatch(board.text, /\bGate\s+[0-3]\b/, 'a gate number returned to the board');
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
    // INVERTED (plan 00154): the fallback ladder (label when no plan) is unchanged;
    // the gate NUMBER is gone. The TEST was wrong to assert "Gate 1 ready"; a gate
    // digit here now FAILS.
    const line = taskView.tasksInboxLine(mkReg([
      T({ id: 't9', kind: 'review', plan: null, label: 'gatelbl', status: 'done', result: { ok: true, gate: 1 } }),
    ]));
    assert.match(line, /Decision ready — gatelbl/);
    assert.doesNotMatch(line, /\bGate\s+[0-3]\b/, 'a gate number returned to the inbox line');
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
    // R3-B item 7: mutating writes now go through task-registry's COMPARE-AND-SWAP choke
    // point (`withRegistry`, which wraps load+save with a generation check) — a strictly
    // stronger guarantee than a bare `.save`. The invariant under test ("writes go through
    // task-registry, never raw fs") holds via either entry point.
    assert.match(src, /taskRegistry\.(save|withRegistry)\b/, 'registry writes go through task-registry (save / withRegistry)');
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
    // …but a WAITING DECISION is still SHOWN as informational text (parity with
    // board/inbox), with no number. INVERTED (plan 00154): the TEST asserted the leak
    // "Gate 3 ready"; the human replaced the contract and a gate digit now FAILS.
    assert.match(d.text, /a decision is waiting for you/, 'decision shown as text even when the action is dropped');
    assert.doesNotMatch(d.text, /\bGate\s+[0-3]\b/, 'a gate number returned to the detail screen');
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

  it('GS6: detail echoes a waiting decision as text even when nextAction is absent', () => {
    // INVERTED (plan 00154): the detail still echoes a waiting decision as text (the
    // gate integer signals it), but never the number. The TEST asserted "Gate 2
    // ready"; the human replaced the contract and a gate digit now FAILS.
    const reg = mkReg([
      T({ id: 't1', kind: 'review', plan: 'LH1', status: 'done', result: { ok: true, summary: 's', gate: 2 } }),
    ]);
    const d = taskView.renderTaskDetail(reg, 't1');
    assert.match(d.text, /a decision is waiting for you/, 'decision shown as informational text');
    assert.doesNotMatch(d.text, /\bGate\s+[0-3]\b/, 'a gate number returned to the detail screen');
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

// ═══════════════════════════════════════════════════════════════════════════
// R3-D — KEY/RECIPE PARITY (a PERMANENT fence).
//
// A `claude:*` action key the menu EMITS but menu.md carries no recipe for is a
// DEAD BUTTON: the human picks it and the session has no instruction for what to
// do. Two shipped buttons were exactly that (`claude:dismiss-stale`,
// `claude:env-keep-defaults`) while menu.md documented a name nothing emits.
// This fence fails the moment anyone adds a key without a recipe.
// ═══════════════════════════════════════════════════════════════════════════

const SRC = path.join(__dirname, '..', 'src');

/**
 * Every `claude:<key>` token that appears in a menu-EMITTING source file.
 *
 * `streaming-gate.js` joined this list when opening a plan became a QUESTION: its
 * `planDecisionScreen` replaced the four plan-menu screens that used to live in
 * menu-screens.js, and it is now the emitter of `claude:discuss`,
 * `claude:view-edit`, `claude:delete`, and `claude:reject`. The fence must follow
 * the emitter — a key that moved file is still a key a human can pick, and a dead
 * button is exactly what this fence exists to catch.
 */
function emittedActionKeys() {
  const files = [
    path.join(SRC, 'lib', 'menu-screens.js'),
    path.join(SRC, 'lib', 'streaming-gate.js'),
    path.join(SRC, 'commands', 'menu.js'),
  ];
  const keys = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const re = /claude:([a-z][a-z0-9-]*)/g;
    let m;
    while ((m = re.exec(text)) !== null) keys.add(m[1]);
  }
  return keys;
}

/** Every `claude:<key>` documented as a recipe row in src/commands/menu.md. */
function documentedActionKeys() {
  const text = fs.readFileSync(path.join(SRC, 'commands', 'menu.md'), 'utf8');
  const keys = new Set();
  const re = /^\|\s*`claude:([a-z][a-z0-9-]*)/gm;
  let m;
  while ((m = re.exec(text)) !== null) keys.add(m[1]);
  return keys;
}

describe('R3-D — every emitted claude: action key has a recipe in menu.md', () => {
  it('PARITY: no dead buttons — every key the menu emits is documented', () => {
    const emitted = emittedActionKeys();
    const documented = documentedActionKeys();
    // Non-vacuity: if either side reads as empty the fence is broken, not passing.
    assert.ok(emitted.size >= 15, `expected the real emitted-key set, saw ${emitted.size}`);
    assert.ok(documented.size >= 15, `expected the real documented-key set, saw ${documented.size}`);

    const missing = [...emitted].filter((k) => !documented.has(k)).sort();
    assert.deepEqual(
      missing,
      [],
      'These action keys are EMITTED by the menu but have NO recipe in src/commands/menu.md — ' +
      'a human can pick them and the session has no instruction for what to do:\n  ' +
      missing.map((k) => `claude:${k}`).join('\n  ')
    );
  });

  it('PARITY(reverse): menu.md documents no recipe for a key nothing emits (a lie in the other direction)', () => {
    const emitted = emittedActionKeys();
    const documented = documentedActionKeys();
    const orphaned = [...documented].filter((k) => !emitted.has(k)).sort();
    assert.deepEqual(
      orphaned,
      [],
      'menu.md documents recipes for keys the menu never emits (stale instructions):\n  ' +
      orphaned.map((k) => `claude:${k}`).join('\n  ')
    );
  });

  it('the two dead durable-stop buttons now have recipes naming their real functions', () => {
    const md = fs.readFileSync(path.join(SRC, 'commands', 'menu.md'), 'utf8');
    assert.match(md, /claude:dismiss-stale/, 'dismiss-stale recipe present');
    assert.match(md, /dismissStale/, 'the dismiss-stale recipe names the real function');
    assert.match(md, /scanCheapCandidates/, 'the recipe shows how the driver obtains the candidates');
    assert.match(md, /claude:env-keep-defaults/, 'env-keep-defaults recipe present');
    assert.match(md, /environment_prompt_dismissed/, 'the env recipe names the real durable key');
    assert.ok(
      !/lands in slice R2-C2 in this same wave/i.test(md),
      'menu.md must not deny code that now exists on disk'
    );
    assert.ok(
      !/is not a code path on disk here/i.test(md),
      'menu.md must not claim a shipped code path does not exist'
    );
  });

  it('menu.md documents --live-agent-ids (the flag the ON-OPEN RECONCILE depends on)', () => {
    const md = fs.readFileSync(path.join(SRC, 'commands', 'menu.md'), 'utf8');
    assert.match(md, /--live-agent-ids/, 'the flag syntax is documented');
    assert.match(md, /EMPTY list/i, 'an EMPTY list means unavailable, not "nobody is alive" — stated honestly');
  });

  it('menu.md consumes the autoApprove signal (the one-turn approve is real, not a lie)', () => {
    const md = fs.readFileSync(path.join(SRC, 'commands', 'menu.md'), 'utf8');
    assert.match(md, /autoApprove/, 'the driver instruction reads the autoApprove signal');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R3-D — the escalations door (a count with no door is the defect) + the
// deploy-ready reader (no claim without a reader).
// ═══════════════════════════════════════════════════════════════════════════

describe('R3-D — inbox escalations door', () => {
  function seedEscalation(r, plan) {
    const dir = path.join(r, '.ctoc', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'escalations.json'), JSON.stringify([
      { type: 'same-step', plan, step: '14', count: 4, at: '2026-07-14T09:00:00.000Z' },
    ], null, 2));
  }

  it('D1: the escalations count has a DOOR — `inbox escalations` lists the seeded escalation', () => {
    seedEscalation(root, 'stuck-plan.md');
    const screen = ms.route(['inbox', 'escalations'], root);
    assert.match(screen.text, /stuck-plan/, 'the escalated plan is listed');
    assert.match(screen.text, /Escalation/i, 'the screen names itself');
    assert.ok(screen.actions['◀ Back'] != null, 'Back is always reachable');
  });

  it('D2: the dashboard escalation line names its door route', () => {
    seedEscalation(root, 'stuck-plan.md');
    const dash = ms.buildDashboardTable(root);
    assert.match(dash, /circuit-breaker escalation/, 'the count is rendered');
    assert.match(dash, /inbox escalations/, 'the count names its door (a count with no door is the defect)');
  });

  it('D3: a deploy-ready notice is READ and surfaced (no claim without a reader)', () => {
    const dir = path.join(root, '.ctoc', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'deploy-ready.json'), JSON.stringify([
      { plan: 'shipme.md', at: '2026-07-14T09:00:00.000Z', status: 'deploy-ready', message: 'awaiting the deploy ship gate' },
    ], null, 2));
    const dash = ms.buildDashboardTable(root);

    // INVERTED (was `assert.match(dash, /deploy-ready/i)`). "deploy-ready" is the
    // pipeline's own word for the moment; matching on it pinned the internal
    // vocabulary as the contract. What D3 actually proves is that the notice is
    // READ and SURFACED — so the assertion is now that a deploy line exists and
    // carries the human's sentence, and that neither a gate number nor a raw
    // stage-directory name has come back onto it.
    const deployLine = dash.split('\n').find((l) => /deploy/i.test(l));
    assert.ok(deployLine, `the dashboard must surface the notice:\n${dash}`);
    assert.match(deployLine, /still yours/, `the line must say whose decision deploying is: ${deployLine}`);
    assert.doesNotMatch(deployLine, /\bgates?\s*[0-9]/i, `a gate NUMBER reached a human: ${deployLine}`);
    assert.doesNotMatch(deployLine, /ship gate/i, `"ship gate" is jargon a reader cannot decode: ${deployLine}`);
    assert.doesNotMatch(
      deployLine, /\b(functional|implementation|todo|in-progress)\b/i,
      `a raw stage-directory name reached a human: ${deployLine}`
    );

    const screen = ms.route(['inbox', 'escalations'], root);
    assert.match(screen.text, /shipme/, 'the door lists the deploy-ready plan');
  });

  it('D4: a project with NO escalations and NO deploy notices adds ZERO output (no regression)', () => {
    const dash = ms.buildDashboardTable(root);
    assert.ok(!/escalation/i.test(dash), 'no escalation line when there are none');

    // WAS VACUOUS: `assert.ok(!/deploy-ready/i.test(dash))`. After the re-word the
    // dashboard says "waiting to be deployed", so "deploy-ready" appears nowhere and
    // the assertion could never fail — proof-shaped, but proving nothing. The dead
    // pattern is kept HERE, in a comment, so nobody re-adopts it as a live check.
    //
    // The real property: with zero notices, NO deploy line renders at all. Asserted
    // against the word that is actually on the line today, so it can genuinely fail.
    assert.ok(!/deploy/i.test(dash), `no deploy line when there are none:\n${dash}`);
    assert.match(dash, /Inbox clear/, 'a fresh project still reads "Inbox clear"');
  });

  it('D5: a hostile plan name in the escalations log cannot inject control chars (stripCtl)', () => {
    seedEscalation(root, 'evil\u001b[2Jplan\nforged-row');
    const screen = ms.route(['inbox', 'escalations'], root);
    // Newlines are the render's own row separators; what must NEVER survive is a
    // control char smuggled in from the DATA (ESC/CR/BS…), nor a data newline that
    // forges its own row.
    assert.ok(!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(screen.text), 'no smuggled C0/C1 control char reaches the render');
    assert.ok(!/^\s*forged-row/m.test(screen.text), 'the embedded newline cannot forge its own row');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R3-D — the `stubs` route is unblocked (the natural next hop after a decompose
// completion was the ONE route gate-safety forbade).
// ═══════════════════════════════════════════════════════════════════════════

describe('R3-D — isNavRoute allowlist covers every real NAV route', () => {
  it('N1: `stubs <slug>` and `menu commands` are accepted (they are NAV routes in menu.md)', () => {
    assert.equal(taskView.isNavRoute('stubs my-vision'), true, 'stubs is a NAV route');
    assert.equal(taskView.isNavRoute('menu commands'), true, 'menu is a NAV route');
  });

  it('N2: the allowlist is still an ALLOWLIST — gate-crossers and junk stay rejected', () => {
    assert.equal(taskView.isNavRoute('claude:approve review/x.md'), false);
    assert.equal(taskView.isNavRoute('claude:done-all-parent'), false);
    assert.equal(taskView.isNavRoute('rm -rf plans/'), false);
    assert.equal(taskView.isNavRoute('stubsomething'), false, 'word-boundary is enforced, not a prefix match');
  });

  it('N3: a decompose completion recording `--next "stubs <slug>"` is ACCEPTED and renders', () => {
    const add = ms.route(['menu', 'task', 'add', 'decompose', 'my-vision'], root);
    ms.route(['menu', 'task', 'start', add.taskId], root);
    const res = ms.route(['menu', 'task', 'complete', add.taskId, '--gate', '0', '--next', 'stubs my-vision'], root);
    assert.equal(res.ok, true, 'the natural next hop after decomposition must not be rejected wholesale');
    const t = taskRegistry.load(root).tasks.find((x) => x.id === add.taskId);
    assert.equal(t.result.nextAction, 'stubs my-vision');
    const detail = taskView.renderTaskDetail(taskRegistry.load(root), add.taskId);
    assert.ok(Object.values(detail.actions).includes('stubs my-vision'), 'the detail screen offers the stubs hop');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R3-D — the executor agent stops fighting the scheduler and never moves a plan.
// ═══════════════════════════════════════════════════════════════════════════

describe('R3-D — the iron-loop-executor definition', () => {
  const EXECUTOR = path.join(__dirname, '..', 'agents', 'iron-loop', 'iron-loop-executor.md');
  const def = fs.readFileSync(EXECUTOR, 'utf8');

  it('X1: it no longer moves a plan file itself — completion goes through the menu route', () => {
    assert.ok(!/MOVE plan: in-progress/i.test(def), 'no raw in-progress → review move');
    assert.ok(!/mv plans\//i.test(def), 'no shell plan move');
    assert.match(def, /menu task complete/, 'completion runs the real completion route');
    assert.match(def, /completeExecution/, 'the definition names the real completion function');
  });

  it('X2: it no longer counts, claims, or yanks sibling plans (the scheduler owns concurrency)', () => {
    assert.ok(!/ONE PLAN AT A TIME/i.test(def), 'the one-plan-at-a-time rule is gone');
    assert.ok(!/move extras back to todo/i.test(def), 'it never yanks a live sibling back to todo');
    assert.ok(!/ls -t plans\/todo/i.test(def), 'it does not self-select a plan from the queue');
    assert.match(def, /ONLY on the plan named in your brief/i, 'it operates only on the plan it was given');
  });
});

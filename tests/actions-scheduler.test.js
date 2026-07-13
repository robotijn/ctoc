/**
 * F1-s2 — Action layer on the scheduler.
 *
 * Behavioral tests over the real actions.js + task-registry.js + state.js on
 * isolated temp roots (real fs, no mocks of core logic). Proves the retirement of
 * the global agent lock: startAgent/advanceAgent/stopAgent now sit on the s1
 * scheduler (addAndClaim + the drain-stop trio + the cancelled status), plan
 * frontmatter is translated into task fields by taskSpecFromPlan, cancelTask and
 * enqueueWaveSync are the live cancel/wave-sync surfaces, and getAgentStatus takes
 * its liveness from the registry (no pid file). agent-lock.js is deleted — a
 * require of it fails this suite loudly.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const actions = require('../src/lib/actions');
const taskRegistry = require('../src/lib/task-registry');
const state = require('../src/lib/state');

// ── fixtures ──────────────────────────────────────────────────────────────────

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-f1s2-'));
  for (const d of ['todo', 'in-progress', 'review', 'done', 'implementation']) {
    fs.mkdirSync(path.join(root, 'plans', d), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/**
 * Write a plan .md into a stage with a GATED two-block frontmatter (a prepended
 * approval marker followed by the plan's own block) — the exact shape every plan
 * in todo/ carries after crossing Gate 2, so the multi-block files/depends_on
 * reader is under test, not a simplified single-block plan.
 */
function writePlan(stage, name, { files = null, dependsOn = null } = {}) {
  const filesBlock = files === null
    ? ''
    : 'files:\n' + files.map((f) => `  - "${f}"`).join('\n') + '\n';
  const depLine = dependsOn === null ? '' : `depends_on: ${dependsOn}\n`;
  const content =
    '---\n' +
    'approved_by: human\n' +
    'gate_crossed: implementation → todo\n' +
    '---\n\n' +
    '---\n' +
    `title: "${name}"\n` +
    'type: implementation\n' +
    depLine +
    filesBlock +
    '---\n\n' +
    `# ${name}\n\nbody\n`;
  const p = path.join(root, 'plans', stage, `${name}.md`);
  fs.writeFileSync(p, content);
  return p;
}

/** Read a single todo plan object (as readPlans produces it) by name. */
function todoPlan(name) {
  return state.readPlans(path.join(root, 'plans', 'todo')).find((p) => p.name === name);
}

function loadReg() {
  return taskRegistry.load(root);
}

function runningImplement() {
  return loadReg().tasks.filter((t) => t.status === 'running' && t.kind === 'implement');
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. taskSpecFromPlan
// ═══════════════════════════════════════════════════════════════════════════

describe('taskSpecFromPlan', () => {
  it('builds an implement spec: touches = declared files + the plan\'s own repo-relative path, no deps → empty blockedBy', () => {
    writePlan('todo', 'plan-a', { files: ['src/lib/foo.js', 'tests/foo.test.js'] });
    const spec = actions.taskSpecFromPlan(todoPlan('plan-a'), root);

    assert.equal(spec.kind, 'implement');
    assert.equal(spec.plan, 'plan-a');
    assert.equal(spec.label, 'plan-a');
    assert.ok(spec.touches.includes('src/lib/foo.js'), 'declared file present');
    assert.ok(spec.touches.includes('tests/foo.test.js'), 'declared file present');
    assert.ok(spec.touches.includes('plans/todo/plan-a.md'),
      'the plan\'s own repo-relative POSIX path is included so two tasks on the same plan file-conflict');
    assert.deepEqual(spec.blockedBy, [], 'no deps → no blockers');
  });

  it('REFUSES a plan with no files: declaration — clear message naming the plan and the fix', () => {
    writePlan('todo', 'no-files', { files: null });
    assert.throws(
      () => actions.taskSpecFromPlan(todoPlan('no-files'), root),
      (err) => /no-files/.test(err.message) && /files:/.test(err.message),
      'must name the plan and instruct declaring files:'
    );
  });

  it('REFUSES when a declared dependency has no registry task and is not done/review', () => {
    writePlan('todo', 'dep-missing', { files: ['src/x.js'], dependsOn: 'ghost-dep' });
    assert.throws(
      () => actions.taskSpecFromPlan(todoPlan('dep-missing'), root),
      (err) => /ghost-dep/.test(err.message),
      'must name the unresolvable dependency'
    );
  });

  it('a dependency whose plan file sits in done/ is satisfied → no blocker', () => {
    writePlan('done', 'done-dep', { files: ['src/y.js'] });
    writePlan('todo', 'needs-done', { files: ['src/z.js'], dependsOn: 'done-dep' });
    const spec = actions.taskSpecFromPlan(todoPlan('needs-done'), root);
    assert.deepEqual(spec.blockedBy, [], 'a done dependency adds no scheduler blocker');
  });

  it('a dependency present as a non-terminal registry task → blockedBy carries that task id', () => {
    // Enqueue the dependency as a running implement task first.
    const dep = taskRegistry.addAndClaim(root, {
      kind: 'implement', plan: 'live-dep', touches: ['src/dep.js']
    });
    assert.equal(dep.claimed, true, 'dep runs on an empty registry');

    writePlan('todo', 'needs-live', { files: ['src/w.js'], dependsOn: 'live-dep' });
    const spec = actions.taskSpecFromPlan(todoPlan('needs-live'), root);
    assert.deepEqual(spec.blockedBy, [dep.task.id],
      'the dependent task is blocked by the live dependency task id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 + 3. startAgent — concurrent file-disjoint, serialized file-overlap, atomic
// ═══════════════════════════════════════════════════════════════════════════

describe('startAgent (scheduler-backed, lock-free)', () => {
  it('two file-DISJOINT todo plans both start → registry shows 2 running implement tasks', () => {
    writePlan('todo', 'disj-a', { files: ['src/a.js'] });
    writePlan('todo', 'disj-b', { files: ['src/b.js'] });

    const r1 = actions.startAgent(root);
    assert.equal(r1.started, true, 'first plan starts');
    const r2 = actions.startAgent(root);
    assert.equal(r2.started, true, 'second, file-disjoint plan ALSO starts (concurrency is the point)');

    assert.equal(runningImplement().length, 2, 'both implement tasks are running on disk');
  });

  it('two file-OVERLAPPING todo plans → second returns { started:false, queued:true, reason:\'file-conflict\' }', () => {
    writePlan('todo', 'ov-a', { files: ['src/shared.js'] });
    writePlan('todo', 'ov-b', { files: ['src/shared.js'] });

    const r1 = actions.startAgent(root);
    assert.equal(r1.started, true);

    const r2 = actions.startAgent(root);
    assert.equal(r2.started, false, 'overlapping plan does not start');
    assert.equal(r2.queued, true, 'it is recorded as queued, not an error');
    assert.equal(r2.reason, 'file-conflict', 'the scheduler reason is file-conflict');

    assert.equal(runningImplement().length, 1, 'only the first is running');
    const queued = loadReg().tasks.filter((t) => t.status === 'queued' && t.kind === 'implement');
    assert.equal(queued.length, 1, 'the second implement stays queued on disk');
  });

  it('records + claims atomically: a claimed start persists running; the plan moves to in-progress', () => {
    writePlan('todo', 'atomic-a', { files: ['src/at.js'] });
    const r = actions.startAgent(root);
    assert.equal(r.started, true);
    assert.equal(loadReg().tasks.length, 1);
    assert.equal(loadReg().tasks[0].status, 'running');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'in-progress', 'atomic-a.md')),
      'a claimed plan is moved to in-progress');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'todo', 'atomic-a.md')),
      'and leaves todo');
  });

  it('a refused (queued) start leaves the plan in todo — no in-progress move', () => {
    writePlan('todo', 'q-a', { files: ['src/q.js'] });
    writePlan('todo', 'q-b', { files: ['src/q.js'] });
    actions.startAgent(root);            // q-a runs, moves to in-progress
    const r2 = actions.startAgent(root); // q-b conflicts → queued
    assert.equal(r2.queued, true);
    assert.ok(fs.existsSync(path.join(root, 'plans', 'todo', 'q-b.md')),
      'a queued plan stays in todo');
  });

  it('empty todo queue → { started:false } with an error message, nothing recorded', () => {
    const r = actions.startAgent(root);
    assert.equal(r.started, false);
    assert.ok(r.error, 'reports the empty queue');
    assert.equal(loadReg().tasks.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. stopAgent / advanceAgent drain-stop semantics
// ═══════════════════════════════════════════════════════════════════════════

describe('stopAgent + advanceAgent (drain-stop)', () => {
  it('stopAgent sets the drain-stop flag and lists the currently running plans', () => {
    writePlan('todo', 'run-a', { files: ['src/ra.js'] });
    actions.startAgent(root);

    const r = actions.stopAgent(root);
    assert.equal(r.stopped, true);
    assert.equal(taskRegistry.isDrainStopRequested(root), true, 'drain-stop flag is set');
    assert.ok(r.running.includes('run-a'), 'the running plan is named');
    assert.ok(/run-a/.test(r.message), 'the message lists the running plan');
  });

  it('advanceAgent under a drain-stop → stopped, agent status cleared, nothing new claimed', () => {
    writePlan('todo', 'adv-a', { files: ['src/aa.js'] });
    taskRegistry.requestDrainStop(root);

    const r = actions.advanceAgent(root);
    assert.equal(r.stopped, true);
    assert.equal(r.next, false);

    const agentJson = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'state', 'agent.json'), 'utf8'));
    assert.equal(agentJson.active, false, 'agent status cleared');
    assert.equal(loadReg().tasks.length, 0, 'no task claimed while draining');
  });

  it('advanceAgent with no drain-stop claims the next todo plan', () => {
    writePlan('todo', 'adv-b', { files: ['src/ab.js'] });
    const r = actions.advanceAgent(root);
    assert.equal(r.next, true);
    assert.equal(r.plan.name, 'adv-b');
    assert.equal(runningImplement().length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. cancelTask
// ═══════════════════════════════════════════════════════════════════════════

describe('cancelTask', () => {
  it('cancels a queued task → status cancelled persisted', () => {
    const reg = taskRegistry.emptyRegistry();
    taskRegistry.addTask(reg, { kind: 'implement', plan: 'run', touches: ['src/r.js'] });
    const q = taskRegistry.addTask(reg, { kind: 'implement', plan: 'wait', touches: ['src/r.js'] });
    taskRegistry.updateTask(reg, reg.tasks[0].id, { status: 'running' });
    taskRegistry.save(root, reg);

    const res = actions.cancelTask(root, q.id);
    assert.equal(res.cancelled, true);
    assert.equal(loadReg().tasks.find((t) => t.id === q.id).status, 'cancelled');
  });

  it('cancels a running task and returns its agentTaskId so the caller can stop the live agent', () => {
    const reg = taskRegistry.emptyRegistry();
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: 'live', touches: ['src/l.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running', agentTaskId: 'agent-xyz' });
    taskRegistry.save(root, reg);

    const res = actions.cancelTask(root, t.id);
    assert.equal(res.cancelled, true);
    assert.equal(res.agentTaskId, 'agent-xyz', 'agentTaskId returned for a live cancel');
    assert.equal(loadReg().tasks.find((x) => x.id === t.id).status, 'cancelled');
  });

  it('cancelling a terminal (done) task throws — terminal is terminal', () => {
    const reg = taskRegistry.emptyRegistry();
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: 'd', touches: ['src/d.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running' });
    taskRegistry.updateTask(reg, t.id, { status: 'done' });
    taskRegistry.save(root, reg);

    assert.throws(() => actions.cancelTask(root, t.id), /transition|terminal|done/i);
  });

  it('cancelling an unknown id throws', () => {
    assert.throws(() => actions.cancelTask(root, 'tNOPE'), /unknown|not found/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. enqueueWaveSync
// ═══════════════════════════════════════════════════════════════════════════

describe('enqueueWaveSync', () => {
  it('enqueues a sync task with gitOp, empty touches, and the wave\'s blockedBy ids', () => {
    const res = actions.enqueueWaveSync(root, { blockedBy: ['t1', 't2'], label: 'wave-1' });
    assert.equal(res.task.kind, 'sync');
    assert.equal(res.task.gitOp, true);
    assert.deepEqual(res.task.touches, []);
    assert.deepEqual(res.task.blockedBy, ['t1', 't2']);
  });

  it('the sync barrier: a sync task does not co-run while any task runs, and runs alone once its deps are done', () => {
    // A running implement task occupies the plane.
    const impl = taskRegistry.addAndClaim(root, { kind: 'implement', plan: 'w', touches: ['src/w.js'] });
    assert.equal(impl.claimed, true);

    const sync = actions.enqueueWaveSync(root, { blockedBy: [impl.task.id], label: 'wave' });
    assert.equal(sync.claimed, false, 'sync cannot claim while its dep is unfinished');

    // Finish the implement task; now the sync is runnable ALONE.
    const reg = loadReg();
    taskRegistry.updateTask(reg, impl.task.id, { status: 'done' });
    taskRegistry.save(root, reg);

    const runnable = taskRegistry.nextRunnable(loadReg());
    assert.equal(runnable.length, 1, 'only the sync is runnable');
    assert.equal(runnable[0].id, sync.task.id);
    assert.equal(runnable[0].kind, 'sync');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. getAgentStatus liveness from the registry (no pid file)
// ═══════════════════════════════════════════════════════════════════════════

describe('getAgentStatus (registry liveness, agent-lock retired)', () => {
  it('a running implement task → active with the plan name', () => {
    taskRegistry.addAndClaim(root, { kind: 'implement', plan: 'active-plan', touches: ['src/a.js'] });
    const s = state.getAgentStatus(root);
    assert.equal(s.active, true);
    assert.equal(s.plan, 'active-plan');
  });

  it('no running implement task → inactive', () => {
    const s = state.getAgentStatus(root);
    assert.equal(s.active, false);
  });

  it('a running NON-implement task alone does not make the agent active', () => {
    taskRegistry.addAndClaim(root, { kind: 'review', plan: 'r', touches: [] });
    assert.equal(state.getAgentStatus(root).active, false);
  });

  it('agent-lock.js is deleted — requiring it fails loudly (no pid-file liveness path survives)', () => {
    assert.throws(
      () => require('../src/lib/agent-lock'),
      /Cannot find module/,
      'the agent-lock module must be gone'
    );
  });
});

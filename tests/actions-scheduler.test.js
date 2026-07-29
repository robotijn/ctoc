/**
 * F1-s2 — Action layer on the scheduler.
 *
 * Behavioral tests over the real actions.js + task-registry.js + state.js on
 * isolated temp roots (real fs, no mocks of core logic). Proves the retirement of
 * the global agent lock: startAgent/stopAgent now sit on the s1
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
const safeFs = require('../src/lib/safe-fs');

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
// 1b. taskSpecFromPlan — path-traversal guard on depends_on (LOW existence-oracle)
// ═══════════════════════════════════════════════════════════════════════════

describe('taskSpecFromPlan — depends_on path-traversal guard', () => {
  const UNSAFE = [
    ['dotdot traversal', '../../../../etc/passwd'],
    ['NUL byte', 'evil' + String.fromCharCode(0) + 'dep'],
    ['path separator', 'sub/dir/dep'],
  ];

  for (const [label, token] of UNSAFE) {
    it(`SKIPS an unsafe depends_on token (${label}) — no out-of-root existsSync oracle, no scheduler throw`, () => {
      writePlan('todo', 'guarded', { files: ['src/x.js'], dependsOn: token });
      const rootResolved = path.resolve(root);

      const calls = [];
      const orig = safeFs.existsSync;
      safeFs.existsSync = (p) => { calls.push(p); return orig(p); };
      let spec;
      try {
        spec = actions.taskSpecFromPlan(todoPlan('guarded'), root);
      } finally {
        safeFs.existsSync = orig;
      }

      assert.deepEqual(spec.blockedBy, [],
        'an unsafe depends_on token is ignored — never a scheduler blocker, never a throw');

      for (const p of calls) {
        const resolved = path.resolve(String(p));
        const inRoot = resolved === rootResolved || resolved.startsWith(rootResolved + path.sep);
        assert.ok(inRoot,
          `existsSync must never probe outside the project root (existence oracle): ${resolved}`);
      }
    });
  }

  it('a VALID depends_on beside an unsafe token still resolves and drives ordering (regression)', () => {
    const dep = taskRegistry.addAndClaim(root, {
      kind: 'implement', plan: 'live-dep', touches: ['src/dep.js']
    });
    assert.equal(dep.claimed, true, 'dep runs on an empty registry');

    writePlan('todo', 'mixed', {
      files: ['src/w.js'], dependsOn: '../../../../etc/passwd live-dep'
    });
    const spec = actions.taskSpecFromPlan(todoPlan('mixed'), root);
    assert.deepEqual(spec.blockedBy, [dep.task.id],
      'the valid dependency still blocks; the unsafe token is silently skipped');
  });

  it('a normal depends_on with no unsafe tokens is unchanged: done dependency → no blocker', () => {
    writePlan('done', 'done-dep2', { files: ['src/y2.js'] });
    writePlan('todo', 'needs-done2', { files: ['src/z2.js'], dependsOn: 'done-dep2' });
    const spec = actions.taskSpecFromPlan(todoPlan('needs-done2'), root);
    assert.deepEqual(spec.blockedBy, [], 'a valid, satisfied dependency still adds no blocker');
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
// 4. stopAgent drain-stop semantics
// ═══════════════════════════════════════════════════════════════════════════

describe('stopAgent (drain-stop)', () => {
  it('stopAgent sets the drain-stop flag and lists the currently running plans', () => {
    writePlan('todo', 'run-a', { files: ['src/ra.js'] });
    actions.startAgent(root);

    const r = actions.stopAgent(root);
    assert.equal(r.stopped, true);
    assert.equal(taskRegistry.isDrainStopRequested(root), true, 'drain-stop flag is set');
    assert.ok(r.running.includes('run-a'), 'the running plan is named');
    assert.ok(/run-a/.test(r.message), 'the message lists the running plan');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. cancelTask
// ═══════════════════════════════════════════════════════════════════════════

describe('cancelTask (two-phase C1-2)', () => {
  it('queued task → cancelled immediately (nothing is running, freeing is safe)', () => {
    const reg = taskRegistry.emptyRegistry();
    const running = taskRegistry.addTask(reg, { kind: 'implement', plan: 'run', touches: ['src/r.js'] });
    const q = taskRegistry.addTask(reg, { kind: 'implement', plan: 'wait', touches: ['src/r.js'] });
    taskRegistry.updateTask(reg, running.id, { status: 'running' });
    taskRegistry.save(root, reg);

    const res = actions.cancelTask(root, q.id);
    assert.equal(res.task.status, 'cancelled', 'a queued task cancels straight to cancelled');
    assert.equal(loadReg().tasks.find((t) => t.id === q.id).status, 'cancelled', 'persisted');
  });

  it('running task → cancelling (NOT cancelled): files stay locked, agentTaskId returned to kill the harness', () => {
    const reg = taskRegistry.emptyRegistry();
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: 'live', touches: ['src/l.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running', agentTaskId: 'agent-xyz' });
    taskRegistry.save(root, reg);

    const res = actions.cancelTask(root, t.id);
    assert.equal(res.task.status, 'cancelling', 'a running task enters cancelling, not cancelled (two-phase)');
    assert.equal(res.agentTaskId, 'agent-xyz', 'agentTaskId is returned so the caller can kill the harness agent');
    assert.equal(loadReg().tasks.find((x) => x.id === t.id).status, 'cancelling', 'persisted as cancelling');

    // A cancelling task STILL occupies its files: a new task on the same file conflicts.
    const decision = taskRegistry.canRun({ kind: 'implement', touches: ['src/l.js'] }, loadReg());
    assert.equal(decision.run, false, 'the cancelling task keeps its files locked until reconcile confirms death');
    assert.equal(decision.reason, 'file-conflict');
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

  // R2-C rework: the menu's --force one-call path is the ONE cancel encoding's own
  // parameter, not a second copy in the menu. Force walks the legal two-step path
  // running → cancelling → cancelled in a single call, warn-logged, never silent.
  it('force: a RUNNING task → cancelled in one call (two-step path), forced flag + agentTaskId', () => {
    const reg = taskRegistry.emptyRegistry();
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: 'live', touches: ['src/l.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running', agentTaskId: 'agent-xyz' });
    taskRegistry.save(root, reg);

    const res = actions.cancelTask(root, t.id, { force: true });
    assert.equal(res.task.status, 'cancelled', 'force frees the running task straight to cancelled');
    assert.equal(res.forced, true, 'the forced override is reported');
    assert.equal(res.agentTaskId, 'agent-xyz', 'agentTaskId is still returned so the caller can kill the harness');
    assert.equal(loadReg().tasks.find((x) => x.id === t.id).status, 'cancelled', 'persisted as cancelled');
  });

  it('force: an already-CANCELLING task → cancelled in one call', () => {
    const reg = taskRegistry.emptyRegistry();
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: 'live', touches: ['src/l.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running' });
    taskRegistry.updateTask(reg, t.id, { status: 'cancelling', ts: { cancelRequested: new Date().toISOString() } });
    taskRegistry.save(root, reg);

    const res = actions.cancelTask(root, t.id, { force: true });
    assert.equal(res.task.status, 'cancelled', 'force on a cancelling task completes the cancellation');
    assert.equal(res.forced, true);
  });

  it('non-force: a repeat cancel on an already-CANCELLING task is refused (no deadline re-stamp)', () => {
    const reg = taskRegistry.emptyRegistry();
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: 'live', touches: ['src/l.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running' });
    taskRegistry.save(root, reg);
    actions.cancelTask(root, t.id); // running → cancelling (stamps the deadline once)
    assert.throws(() => actions.cancelTask(root, t.id), /already cancelling/i,
      'a second cancel does not reset reconcile’s cancel-deadline clock');
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

// ═══════════════════════════════════════════════════════════════════════════
// R2-B / 1. completeExecution couples the task state machine to the plan (C1-3)
// ═══════════════════════════════════════════════════════════════════════════

describe('completeExecution — task/plan coupling (C1-3)', () => {
  it('settles the running implement task done, DERIVING its result from the verify outcome (never a pre-stamped success)', () => {
    const planPath = writePlan('in-progress', 'couple-run', { files: ['src/cr.js'] });
    const claim = taskRegistry.addAndClaim(root, { kind: 'implement', plan: 'couple-run', touches: ['src/cr.js'] });
    assert.equal(claim.claimed, true, 'the implement task is running before completion');

    const res = actions.completeExecution(planPath, root, { force: true });
    assert.equal(res.blocked, false, 'forced completion moves to review');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'review', 'couple-run.md')), 'plan moved to review');

    const task = loadReg().tasks.find((t) => t.id === claim.task.id);
    // The task STATUS records that the implement work reached review; the RESULT is a
    // SEPARATE, honest signal DERIVED from the Step-14 verify that just ran — it is never
    // stamped ok:true before/independent of verify. This bare temp root has no verifiable
    // toolchain, so verify fails, and the result must track that.
    assert.equal(task.status, 'done', 'the running implement task is settled done on disk (it reached review)');
    assert.ok(res.verify, 'completeExecution ran verify and returned its evidence');
    assert.equal(res.verify.passed, false, 'no toolchain in the temp root → verify does NOT pass');
    assert.ok(task.result, 'the completion result is recorded');
    assert.equal(task.result.ok, false, 'the result is NOT a pre-stamped success — it derives from the failed verify');
    assert.equal(task.result.ok, res.verify.passed === true, 'the settled result tracks the verify outcome exactly');
  });

  it('leaves a cancelling task\'s status alone and records a NON-success result (a cancellation is never a clean success)', () => {
    const planPath = writePlan('in-progress', 'couple-cancel', { files: ['src/cc.js'] });
    const claim = taskRegistry.addAndClaim(root, { kind: 'implement', plan: 'couple-cancel', touches: ['src/cc.js'] });
    const reg = loadReg();
    taskRegistry.updateTask(reg, claim.task.id, { status: 'cancelling' });
    taskRegistry.save(root, reg);

    actions.completeExecution(planPath, root, { force: true });

    const task = loadReg().tasks.find((t) => t.id === claim.task.id);
    assert.equal(task.status, 'cancelling', 'a cancelling task keeps its R2-A status path for reconcile');
    assert.ok(task.result, 'the completion result is recorded');
    assert.equal(task.result.ok, false, 'a plan completing during cancellation must NEVER read as a clean success (q13)');
  });

  it('no registry / no matching task → completion does not throw and still reaches review (fail-open)', () => {
    const planPath = writePlan('in-progress', 'couple-none', { files: ['src/cn.js'] });
    assert.doesNotThrow(() => actions.completeExecution(planPath, root, { force: true }));
    assert.ok(fs.existsSync(path.join(root, 'plans', 'review', 'couple-none.md')), 'plan still reaches review with no registry match');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R2-B / 2. drain never stalls at the head — skip-and-surface (C1-4)
// ═══════════════════════════════════════════════════════════════════════════

describe('startAgent skip-and-surface (C1-4)', () => {
  it('startAgent: an unclaimable head (no files:) is surfaced in skipped[], the next valid plan is claimed', () => {
    writePlan('todo', 'a1-nofiles', { files: null });      // head, unclaimable
    writePlan('todo', 'a2-good', { files: ['src/a2.js'] }); // behind it, valid

    const r = actions.startAgent(root);
    assert.equal(r.started, true, 'the plan behind the bad head is claimed — the head never stalls it');
    assert.equal(r.plan.name, 'a2-good');
    assert.ok(Array.isArray(r.skipped), 'skipped[] is present');
    const s = r.skipped.find((x) => x.plan === 'a1-nofiles');
    assert.ok(s, 'the unclaimable head is surfaced in skipped[]');
    assert.match(s.reason, /files:/, 'with its refusal reason');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R2-B / 3. enqueueWaveSync refuses an empty wave (C1-6)
// ═══════════════════════════════════════════════════════════════════════════

describe('enqueueWaveSync refuses an empty wave (C1-6)', () => {
  it('throws when blockedBy is empty', () => {
    assert.throws(() => actions.enqueueWaveSync(root, { blockedBy: [] }), /blockedBy|empty|wave|integrate/i);
  });
  it('throws when blockedBy is missing', () => {
    assert.throws(() => actions.enqueueWaveSync(root, {}), /blockedBy|empty|wave|integrate/i);
    assert.throws(() => actions.enqueueWaveSync(root), /blockedBy|empty|wave|integrate/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R2-B / 4. drain-stop protected (C1-10)
// ═══════════════════════════════════════════════════════════════════════════

describe('startAgent drain-stop protection (C1-10)', () => {
  it('without force, a drain-stopped root refuses to start and leaves the flag intact', () => {
    writePlan('todo', 'ds-a', { files: ['src/ds.js'] });
    taskRegistry.requestDrainStop(root);

    const r = actions.startAgent(root);
    assert.equal(r.started, false);
    assert.equal(r.drainStopped, true, 'reports the drain-stop');
    assert.equal(taskRegistry.isDrainStopRequested(root), true, 'the flag is NOT cleared without force');
    assert.equal(loadReg().tasks.length, 0, 'nothing new was claimed while drained');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'todo', 'ds-a.md')), 'the plan stays in todo');
  });

  it('with { force: true }, a human-initiated start clears the drain-stop and proceeds', () => {
    writePlan('todo', 'ds-b', { files: ['src/dsb.js'] });
    taskRegistry.requestDrainStop(root);

    const r = actions.startAgent(root, { force: true });
    assert.equal(r.started, true, 'a forced start overrides the drain-stop');
    assert.equal(taskRegistry.isDrainStopRequested(root), false, 'the flag is cleared by the forced start');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R2-B / 6. deploy trigger behind the human ship gate (G4)
// ═══════════════════════════════════════════════════════════════════════════

describe('approvePlan review→done — deploy is a PER-CROSSING human ship gate (G4)', () => {
  function writeDeploySettings(extra) {
    const settings = {
      deployment: Object.assign({
        enabled: true,
        environments: [{ name: 'staging', enabled: true, strategy: 'git-branch', branch: 'deploy/staging' }],
        approval: { staging: 'auto' }
      }, extra)
    };
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.json'), JSON.stringify(settings, null, 2));
  }

  // The deploy pipeline is fired fire-and-forget (its rejection is swallowed at the
  // trigger, per the async contract), so a test that drives the enabling branch must
  // poll for the artifact it produces rather than await the call.
  async function waitForFile(p, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (fs.existsSync(p)) return true;
      await new Promise((r) => setTimeout(r, 15));
    }
    return fs.existsSync(p);
  }

  it('NO per-crossing deploy stamp → the pipeline does NOT run; a deploy-ready notice is recorded instead', () => {
    writeDeploySettings({}); // deployment enabled, but this crossing carries no deploy stamp
    const planPath = writePlan('review', 'ship-off', { files: ['src/ship1.js'] });

    // R5-B: approvePlan now VALIDATES review→done. The subject is deploy GATING (G4),
    // not the review validation, so the Gate-3 crossing is forced via an audited override.
    // Crucially: NO `deploy: true` — the normal review approval must never deploy.
    actions.approvePlan(planPath, root, { override: { reason: 'G4 deploy-gate test — validation not under test' } });

    const noticePath = path.join(root, '.ctoc', 'logs', 'deploy-ready.json');
    assert.ok(fs.existsSync(noticePath), 'a deploy-ready notice is written for the human ship gate');
    const notices = JSON.parse(fs.readFileSync(noticePath, 'utf8'));
    assert.ok(notices.some((n) => n.plan === 'ship-off.md'), 'the notice names the approved plan');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'done', 'ship-off.md')), 'the plan still crosses Gate 3 to done');
    // The pipeline was NOT invoked → no deployment status artifact written.
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'deployments', 'latest.json')), 'deploy pipeline never ran');
  });

  it('a per-crossing deploy stamp on THIS approval → the pipeline RUNS and writes its artifact (drives the enabling branch)', async () => {
    writeDeploySettings({}); // enabled, staging enabled (dry-run) — NO standing flag anywhere
    const planPath = writePlan('review', 'ship-on', { files: ['src/ship2.js'] });

    // The deploy authorization is a stamp carried on THIS approval call (`deploy: true`),
    // never a persisted setting. Drive the enabling branch and assert the artifact it
    // PRODUCES — the mirror of the sibling test that positively asserts the pipeline did
    // NOT run. (override forces past the review-validation, which is not the subject here.)
    actions.approvePlan(planPath, root, { deploy: true, override: { reason: 'G4 per-crossing deploy stamp under test' } });

    assert.ok(fs.existsSync(path.join(root, 'plans', 'done', 'ship-on.md')), 'the plan crosses Gate 3 to done');
    const latest = path.join(root, '.ctoc', 'deployments', 'latest.json');
    await waitForFile(latest, 4000);
    assert.ok(fs.existsSync(latest), 'the deploy pipeline RAN and wrote its status artifact');
    const status = JSON.parse(fs.readFileSync(latest, 'utf8'));
    assert.equal(status.plan, 'ship-on.md', 'the artifact names the plan that was deployed');
    assert.equal(status.status, 'success', 'the dry-run pipeline reports success');
    // The stamp was present, so the deploy FIRED — no deferral notice was written.
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'logs', 'deploy-ready.json')), 'no deploy-ready deferral notice when the crossing is stamped');
  });
});

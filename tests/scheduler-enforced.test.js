/**
 * R3-B — THE SCHEDULER ENFORCES (Iron Loop Step 8, TDD-Red first).
 *
 * A rule nothing checks is not a rule. These tests drive the REAL machinery on
 * isolated temp roots (real fs, no mocks of core logic):
 *
 *   • THE ENFORCEMENT TEST — `menu task start <id>` on a task the concurrency
 *     ladder REFUSES (file-conflict / 6th concurrent / sync running / unmet dep)
 *     is REFUSED with a reason and leaves the registry unchanged; `--force` is
 *     allowed AND flagged loudly (and logged, never silent).
 *   • One non-terminal implement task per plan (no shadowing duplicate).
 *   • completeExecution settles the RUNNING task, not an earlier queued one.
 *   • A ladder-refused head does not stall the todo walk.
 *   • Late completion (orphaned → done) is alive, not dead code.
 *   • Live-list honesty: an EMPTY `--live-agent-ids` is "unavailable", not
 *     "authoritatively empty"; a null agentTaskId falls to the staleness backstop.
 *   • The stale in-progress sweep skips a plan with a live registry task.
 *   • Compare-and-swap: a stale save throws; `withRegistry` retries and BOTH
 *     concurrent mutations survive.
 *   • Staleness-orphan quarantine, retention edge safety, cancelling deadline,
 *     sync-barrier integrity at `addTask`.
 *   • Handover: the human-approval ledger write carries `plan_basename` (the
 *     case-collision guard only fires when BOTH records carry it); the
 *     deploy-ready notice is written atomically (temp + rename).
 *
 * Raw fs/os are permitted in tests/**.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = require('../src/lib/menu-screens');
const taskRegistry = require('../src/lib/task-registry');
const taskReconcile = require('../src/lib/task-reconcile');
const actions = require('../src/lib/actions');
const ledger = require('../src/lib/approval-ledger');
const { extractLiveAgentIds } = require('../src/commands/menu');

const MIN = 60_000;

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-r3b-'));
  for (const d of ['todo', 'in-progress', 'review', 'done', 'implementation', 'functional']) {
    fs.mkdirSync(path.join(root, 'plans', d), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Write a gated (two-block frontmatter) plan into a stage, like every todo plan. */
function writePlan(stage, name, { files = [], dependsOn = null, steps = true } = {}) {
  const filesBlock = files.length
    ? 'files:\n' + files.map((f) => `  - "${f}"`).join('\n') + '\n'
    : '';
  const depLine = dependsOn === null ? '' : `depends_on: ${dependsOn}\n`;
  const stepBlock = steps
    ? ['8: TEST', '9: PREPARE', '10: IMPLEMENT', '11: REVIEW', '12: OPTIMIZE',
      '13: SECURE', '14: VERIFY', '15: DOCUMENT', '16: FINAL-REVIEW']
      .map((s) => `### Step ${s}\n- [x] done\n`).join('\n')
    : '';
  const content =
    '---\napproved_by: human\ngate_crossed: implementation → todo\n---\n\n' +
    `---\ntitle: "${name}"\ntype: implementation\niron_loop: true\n${depLine}${filesBlock}---\n\n` +
    `# ${name}\n\n## Execution Plan (Steps 8-16)\n\n${stepBlock}\n`;
  const p = path.join(root, 'plans', stage, `${name}.md`);
  fs.writeFileSync(p, content);
  return p;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. THE ENFORCEMENT TEST — `menu task start` consults the ladder (item 1)
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B item 1 — guarded start: the ladder is CHECKED, not just defined', () => {
  it('E-FILE: start on a file-conflicting task is REFUSED; the registry is unchanged', () => {
    const a = ms.route(['menu', 'task', 'add', 'implement', 'pA', '--touches', 'src/shared.js'], root);
    ms.route(['menu', 'task', 'start', a.taskId], root);
    const b = ms.route(['menu', 'task', 'add', 'implement', 'pB', '--touches', 'src/shared.js'], root);
    assert.equal(b.decision, 'queue', 'the add already knows it conflicts');

    const res = ms.route(['menu', 'task', 'start', b.taskId], root);
    assert.equal(res.ok, false, 'start is REFUSED');
    assert.equal(res.refused, true);
    assert.equal(res.reason, 'file-conflict', 'the refusal names the ladder rule');
    const t = taskRegistry.load(root).tasks.find((x) => x.id === b.taskId);
    assert.equal(t.status, 'queued', 'registry UNCHANGED — the task never went running');
    assert.equal(t.ts.started, null, 'no start timestamp was stamped');
  });

  it('E-MAX: the 6th concurrent start is REFUSED (max-concurrent)', () => {
    const ids = [];
    for (let i = 1; i <= 5; i++) {
      const a = ms.route(['menu', 'task', 'add', 'review', 'p' + i], root);
      const s = ms.route(['menu', 'task', 'start', a.taskId], root);
      assert.equal(s.status, 'running', 'the first five start');
      ids.push(a.taskId);
    }
    const sixth = ms.route(['menu', 'task', 'add', 'review', 'p6'], root);
    const res = ms.route(['menu', 'task', 'start', sixth.taskId], root);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'max-concurrent');
    assert.equal(
      taskRegistry.load(root).tasks.filter((t) => t.status === 'running').length, 5,
      'still exactly 5 running — the ≤5 budget held'
    );
  });

  it('E-SYNC: no task starts while a sync runs (sync-barrier)', () => {
    // A sync whose dep is still RUNNING is refused by Rule 0 (dep-gate: a sync dep must be
    // SETTLED) — that reason is `blocked-dep`, evaluated before the ladder. The sync-barrier
    // rule proper is: once a sync IS running, NO other candidate may start. Drive that.
    const impl = ms.route(['menu', 'task', 'add', 'implement', 'pA', '--touches', 'src/a.js'], root);
    ms.route(['menu', 'task', 'start', impl.taskId], root);
    const sync = ms.route(['menu', 'task', 'add', 'sync', 'wave', '--blocked', impl.taskId], root);
    const s1 = ms.route(['menu', 'task', 'start', sync.taskId], root);
    assert.equal(s1.ok, false, 'the sync cannot start while its wave is unsettled');
    assert.equal(s1.reason, 'blocked-dep', 'Rule 0 (dep-gate) fires before the sync barrier');

    // Settle the wave (a sync dep is satisfied once SETTLED — terminal; `fail` settles it
    // without needing a real plan file, which `complete` would demand under C7), start the
    // sync alone, then prove nothing else may start under it.
    ms.route(['menu', 'task', 'fail', impl.taskId], root);
    const s2 = ms.route(['menu', 'task', 'start', sync.taskId], root);
    assert.equal(s2.status, 'running', 'the sync starts once the wave settled');
    const other = ms.route(['menu', 'task', 'add', 'review', 'pB'], root);
    const s3 = ms.route(['menu', 'task', 'start', other.taskId], root);
    assert.equal(s3.ok, false);
    assert.equal(s3.reason, 'sync-barrier', 'a read-only task cannot start under a running sync');
  });

  it('E-DEP: a task with an unmet dependency is REFUSED (blocked-dep)', () => {
    const dep = ms.route(['menu', 'task', 'add', 'review', 'dep'], root);
    const blocked = ms.route(['menu', 'task', 'add', 'implement', 'pB', '--touches', 'src/b.js',
      '--blocked', dep.taskId], root);
    const res = ms.route(['menu', 'task', 'start', blocked.taskId], root);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'blocked-dep');
    assert.equal(taskRegistry.load(root).tasks.find((t) => t.id === blocked.taskId).status, 'queued');
  });

  it('E-FORCE: --force starts anyway, is FLAGGED loudly in the text, and is LOGGED', () => {
    const a = ms.route(['menu', 'task', 'add', 'implement', 'pA', '--touches', 'src/shared.js'], root);
    ms.route(['menu', 'task', 'start', a.taskId], root);
    const b = ms.route(['menu', 'task', 'add', 'implement', 'pB', '--touches', 'src/shared.js'], root);

    const res = ms.route(['menu', 'task', 'start', b.taskId, '--force'], root);
    assert.equal(res.ok, true, 'the human override is allowed');
    assert.equal(res.status, 'running');
    assert.equal(res.forced, true, 'the result declares itself forced');
    assert.equal(res.reason, 'file-conflict', 'the override still names what it overrode');
    assert.match(res.text, /FORCED/, 'the text SHOUTS the override (never silent)');
    assert.match(res.text, /file-conflict/);
    const warns = taskRegistry.readWarnLog(root);
    assert.ok(
      warns.some((w) => w.event === 'forced_start' && w.id === b.taskId && w.reason === 'file-conflict'),
      'the override is recorded in the warn log'
    );
    assert.equal(taskRegistry.load(root).tasks.find((t) => t.id === b.taskId).status, 'running');
  });

  it('E-OK: an allowed start still starts (the guard is not a blanket refusal)', () => {
    const a = ms.route(['menu', 'task', 'add', 'implement', 'pA', '--touches', 'src/a.js'], root);
    const res = ms.route(['menu', 'task', 'start', a.taskId], root);
    assert.equal(res.ok, true);
    assert.equal(res.status, 'running');
    assert.equal(res.forced, undefined, 'a legal start is not flagged as forced');
  });

  it('E-AGENTID: --agent-id is recorded on the started task', () => {
    const a = ms.route(['menu', 'task', 'add', 'review', 'pA'], root);
    ms.route(['menu', 'task', 'start', a.taskId, '--agent-id', 'harness-77'], root);
    assert.equal(
      taskRegistry.load(root).tasks.find((t) => t.id === a.taskId).agentTaskId, 'harness-77'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2/3. One non-terminal implement task per plan; a refused head never stalls
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B items 2+3 — no duplicate task per plan; a ladder-refused head does not stall the walk', () => {
  it('D1: two startAgent calls on a ladder-refused head leave exactly ONE task for that plan', () => {
    // Occupy src/shared.js with a running task so the head plan is ladder-refused.
    const occ = ms.route(['menu', 'task', 'add', 'implement', 'blocker', '--touches', 'src/shared.js'], root);
    ms.route(['menu', 'task', 'start', occ.taskId], root);
    writePlan('todo', 'head-plan', { files: ['src/shared.js'] });

    const r1 = actions.startAgent(root);
    assert.equal(r1.started, false);
    assert.equal(r1.queued, true, 'the head is recorded as queued, not started');

    const r2 = actions.startAgent(root);
    assert.equal(r2.started, false);

    const tasks = taskRegistry.load(root).tasks.filter((t) => t.plan === 'head-plan');
    assert.equal(tasks.length, 1, 'ONE task for the plan across two startAgent calls (no duplicate)');
    assert.equal(tasks[0].status, 'queued');
  });

  it('D2: a disjoint second todo plan CLAIMS even though the head is ladder-refused', () => {
    const occ = ms.route(['menu', 'task', 'add', 'implement', 'blocker', '--touches', 'src/shared.js'], root);
    ms.route(['menu', 'task', 'start', occ.taskId], root);
    // head-plan conflicts; free-plan is disjoint. Older mtime = FIFO head.
    const headPath = writePlan('todo', 'a-head-plan', { files: ['src/shared.js'] });
    fs.utimesSync(headPath, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    writePlan('todo', 'b-free-plan', { files: ['src/free.js'] });

    const res = actions.startAgent(root);
    assert.equal(res.started, true, 'the disjoint plan behind the conflicted head STARTS');
    assert.equal(res.plan.name, 'b-free-plan');
    assert.ok(Array.isArray(res.queuedTasks), 'the refused head is reported, not swallowed');
    assert.ok(res.queuedTasks.some((q) => q.plan === 'a-head-plan' && q.reason === 'file-conflict'));
    // The refused head keeps its SINGLE queued task.
    const headTasks = taskRegistry.load(root).tasks.filter((t) => t.plan === 'a-head-plan');
    assert.equal(headTasks.length, 1);
    assert.equal(headTasks[0].status, 'queued');
    // …and the claimed plan moved to in-progress.
    assert.ok(fs.existsSync(path.join(root, 'plans', 'in-progress', 'b-free-plan.md')));
    assert.ok(fs.existsSync(path.join(root, 'plans', 'todo', 'a-head-plan.md')), 'the refused head stays in todo');
  });

  it('D3: `menu task add` refuses a DUPLICATE implement task for a plan that already has one', () => {
    const first = ms.route(['menu', 'task', 'add', 'implement', 'pX', '--touches', 'src/x.js'], root);
    const dup = ms.route(['menu', 'task', 'add', 'implement', 'pX', '--touches', 'src/x.js'], root);
    assert.equal(dup.existing, true, 'the existing task is returned, not a second one');
    assert.equal(dup.taskId, first.taskId);
    assert.equal(
      taskRegistry.load(root).tasks.filter((t) => t.plan === 'pX' && t.kind === 'implement').length, 1
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2b. completeExecution settles the RUNNING task, never an earlier queued one
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B item 2 (C2) — the completion settles the RIGHT task', () => {
  it('C2: a queued duplicate does NOT shadow the running task', () => {
    // Seed by hand: a queued duplicate FIRST (earlier in the array), then a running one.
    const reg = taskRegistry.load(root);
    const dup = taskRegistry.addTask(reg, { kind: 'implement', plan: 'pl', touches: ['src/pl.js'] });
    const run = taskRegistry.addTask(reg, { kind: 'implement', plan: 'pl', touches: ['src/pl.js'] });
    taskRegistry.updateTask(reg, run.id, { status: 'running' });
    taskRegistry.save(root, reg);

    const planPath = writePlan('in-progress', 'pl', { files: ['src/pl.js'] });
    actions.completeExecution(planPath, root);

    const after = taskRegistry.load(root);
    const runAfter = after.tasks.find((t) => t.id === run.id);
    const dupAfter = after.tasks.find((t) => t.id === dup.id);
    assert.equal(runAfter.status, 'done', 'the RUNNING task settled (no dead file lock)');
    assert.notEqual(dupAfter.status, 'running', 'the duplicate never became the settled one');
    assert.equal(dupAfter.status, 'cancelled', 'the superseded queued duplicate is cancelled, not left to re-run');
  });

  it('C2-log: a completion with NO matching task is LOGGED, never silent', () => {
    const planPath = writePlan('in-progress', 'orphan-plan', { files: ['src/o.js'] });
    actions.completeExecution(planPath, root);
    const warns = taskRegistry.readWarnLog(root);
    assert.ok(
      warns.some((w) => w.event === 'plan_task_coupling_missing' && w.plan === 'orphan-plan'),
      'the silent-coupling failure is now a loud, recorded event'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Late completion actually works (TASK_TERMINAL mirror is gone)
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B item 4 — late completion (orphaned → done) is ALIVE', () => {
  it('L1: `menu task complete` on an ORPHANED task records it done', () => {
    const a = ms.route(['menu', 'task', 'add', 'review', 'pA'], root);
    ms.route(['menu', 'task', 'start', a.taskId], root);
    const reg = taskRegistry.load(root);
    taskRegistry.updateTask(reg, a.taskId, { status: 'orphaned' });
    taskRegistry.save(root, reg);

    const res = ms.route(['menu', 'task', 'complete', a.taskId, '--summary', 'late'], root);
    assert.equal(res.ok, true, 'a falsely-orphaned agent that finishes is RECORDED, not dropped');
    assert.equal(res.status, 'done');
    assert.equal(taskRegistry.load(root).tasks.find((t) => t.id === a.taskId).status, 'done');
  });

  it('L2: the menu uses the registry TERMINAL set (cancelled is terminal; no mirror)', () => {
    assert.ok(taskRegistry.TERMINAL instanceof Set, 'task-registry exports TERMINAL');
    assert.deepEqual(
      [...taskRegistry.TERMINAL].sort(), ['cancelled', 'done', 'failed', 'orphaned'],
      'ONE encoding of terminal'
    );
    const a = ms.route(['menu', 'task', 'add', 'review', 'pA'], root);
    ms.route(['menu', 'task', 'cancel', a.taskId], root); // queued → cancelled
    const again = ms.route(['menu', 'task', 'cancel', a.taskId], root);
    assert.equal(again.ok, false, 'cancel on an already-cancelled task is an honest refusal');
    assert.match(String(again.error), /cancel|transition/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Live-list honesty
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B item 5 — live-list honesty', () => {
  it('H2a: an EMPTY --live-agent-ids maps to undefined (unavailable), not [] (authoritative empty)', () => {
    assert.equal(extractLiveAgentIds(['--live-agent-ids', '']).liveAgentIds, undefined);
    assert.equal(extractLiveAgentIds(['--live-agent-ids', '  ,  ,']).liveAgentIds, undefined);
    assert.deepEqual(extractLiveAgentIds(['--live-agent-ids', 'a,b']).liveAgentIds, ['a', 'b']);
    assert.equal(extractLiveAgentIds([]).liveAgentIds, undefined);
  });

  it('H2b: an empty live list does NOT mass-orphan running agents', () => {
    const started = new Date(Date.now() - 10 * MIN).toISOString();
    const r = taskReconcile.reconcile(
      { version: 1, seq: 1, tasks: [{ id: 't1', kind: 'review', status: 'running', agentTaskId: 'a1', touches: [], blockedBy: [], ts: { created: started, started } }] },
      { liveAgentIds: undefined }
    );
    assert.deepEqual(r.report.orphaned, [], 'unavailable + inside the staleness floor → still running');
  });

  it('H2c: a running task with agentTaskId == null falls to the STALENESS backstop even when a live list IS present', () => {
    const started = new Date(Date.now() - 5 * MIN).toISOString();
    const reg = {
      version: 1, seq: 1,
      tasks: [{ id: 't1', kind: 'implement', status: 'running', agentTaskId: null, touches: ['src/a.js'], blockedBy: [], ts: { created: started, started } }]
    };
    const r = taskReconcile.reconcile(reg, { liveAgentIds: ['someone-else'] });
    assert.deepEqual(r.report.orphaned, [], 'absence of a RECORDED id is not evidence of death');

    // Past the implement staleness floor it IS orphaned — by the backstop, reported as such.
    const old = new Date(Date.now() - 200 * MIN).toISOString();
    reg.tasks[0].ts = { created: old, started: old };
    const r2 = taskReconcile.reconcile(reg, { liveAgentIds: ['someone-else'] });
    assert.deepEqual(r2.report.orphaned, ['t1']);
    assert.equal(r2.report.stalenessOrphaned.length, 1, 'orphaned on staleness ALONE — reported as such');
  });

  it('H2d: addAndClaim records agentTaskId at BIRTH (closing the claim→patch window)', () => {
    const { task } = taskRegistry.addAndClaim(root, { kind: 'implement', plan: 'p', touches: ['src/a.js'] }, { agentTaskId: 'harness-9' });
    assert.equal(task.status, 'running');
    assert.equal(taskRegistry.load(root).tasks.find((t) => t.id === task.id).agentTaskId, 'harness-9');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. The stale sweep stops eating live plans
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B item 6 — cleanupStaleInProgress skips LIVE plans', () => {
  it('S1: an in-progress plan with a non-terminal implement task is NOT swept', () => {
    const planPath = writePlan('in-progress', 'live-plan', { files: ['src/l.js'] });
    const reg = taskRegistry.load(root);
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: 'live-plan', touches: ['src/l.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running' });
    taskRegistry.save(root, reg);

    const res = actions.cleanupStaleInProgress(root);
    assert.deepEqual(res.cleanedUp, [], 'a plan whose agent is mid-flight is NEVER moved out from under it');
    assert.ok(res.skipped.some((s) => s.name === 'live-plan' && /live|task/i.test(s.reason)));
    assert.ok(fs.existsSync(planPath), 'the plan is still in in-progress');
  });

  it('S2: a YOUNG in-progress plan with no task is not swept either (age backstop)', () => {
    writePlan('in-progress', 'young-plan', { files: ['src/y.js'] });
    const res = actions.cleanupStaleInProgress(root);
    assert.deepEqual(res.cleanedUp, [], 'a fresh in-progress plan is inside the age grace window');
  });

  it('S3: an OLD, task-less in-progress plan IS swept (the backstop still works)', () => {
    const p = writePlan('in-progress', 'old-plan', { files: ['src/o.js'] });
    const old = new Date(Date.now() - 200 * MIN);
    fs.utimesSync(p, old, old);
    const res = actions.cleanupStaleInProgress(root);
    assert.deepEqual(res.cleanedUp, ['old-plan'], 'a genuinely orphaned plan is still reconciled forward');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Cross-process safety — compare-and-swap
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B item 7 — compare-and-swap on the registry', () => {
  it('CAS1: a save against a MOVED on-disk generation throws StaleRegistryError', () => {
    taskRegistry.save(root, taskRegistry.load(root)); // gen 0 → 1
    const regA = taskRegistry.load(root);
    const regB = taskRegistry.load(root);
    taskRegistry.addTask(regA, { kind: 'review', plan: 'a' });
    taskRegistry.addTask(regB, { kind: 'review', plan: 'b' });

    taskRegistry.save(root, regA); // wins
    assert.throws(() => taskRegistry.save(root, regB), (err) => {
      assert.equal(err.name, 'StaleRegistryError', 'the refusal is a named stale-write error');
      return true;
    }, 'the second writer is REFUSED — no lost update');
    const plans = taskRegistry.load(root).tasks.map((t) => t.plan);
    assert.deepEqual(plans, ['a'], 'the loser never clobbered the winner');
  });

  it('CAS2: withRegistry RETRIES on conflict — both concurrent mutations survive', () => {
    let injected = false;
    const out = taskRegistry.withRegistry(root, (reg) => {
      if (!injected) {
        injected = true;
        // A CONCURRENT writer (the TUI autosync process) commits between our load and save.
        const other = taskRegistry.load(root);
        taskRegistry.addTask(other, { kind: 'review', plan: 'concurrent' });
        taskRegistry.save(root, other);
      }
      taskRegistry.addTask(reg, { kind: 'review', plan: 'mine' });
      return 'ok';
    });
    assert.equal(out, 'ok');
    const plans = taskRegistry.load(root).tasks.map((t) => t.plan).sort();
    assert.deepEqual(plans, ['concurrent', 'mine'], 'BOTH mutations survive (retry re-applied on fresh state)');
  });

  it('CAS3: withRegistry is bounded — it gives up loudly instead of spinning forever', () => {
    assert.throws(() => {
      taskRegistry.withRegistry(root, (reg) => {
        const other = taskRegistry.load(root); // conflict on EVERY attempt
        taskRegistry.addTask(other, { kind: 'review', plan: 'x' });
        taskRegistry.save(root, other);
        taskRegistry.addTask(reg, { kind: 'review', plan: 'mine' });
      }, { attempts: 3 });
    }, /StaleRegistryError|stale/i);
  });

  it('CAS4: the generation is backward compatible — a legacy file (no generation) loads as 0', () => {
    fs.writeFileSync(
      path.join(root, '.ctoc', 'state', 'tasks.json'),
      JSON.stringify({ version: taskRegistry.REGISTRY_VERSION, seq: 0, tasks: [] })
    );
    const reg = taskRegistry.load(root);
    assert.equal(reg.generation, 0, 'absent generation = 0');
    taskRegistry.addTask(reg, { kind: 'review', plan: 'p' });
    taskRegistry.save(root, reg); // must NOT throw
    assert.equal(taskRegistry.load(root).generation, 1, 'the generation advances on every save');
  });

  it('CAS5: the live menu mutators go THROUGH the retry helper (a concurrent writer cannot make them lose)', () => {
    const a = ms.route(['menu', 'task', 'add', 'review', 'pA'], root);
    // Simulate the TUI autosync process writing between the CLI's load and save by
    // committing a task straight after the add — the next mutation must not clobber it.
    const other = taskRegistry.load(root);
    taskRegistry.addTask(other, { kind: 'review', plan: 'autosync' });
    taskRegistry.save(root, other);

    ms.route(['menu', 'task', 'start', a.taskId], root);
    const plans = taskRegistry.load(root).tasks.map((t) => t.plan).sort();
    assert.deepEqual(plans, ['autosync', 'pA'], 'the concurrent task survived the start');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8/9/10/12. Quarantine, retention, cancel deadline, sync-barrier integrity
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B item 8 — staleness-freed files are quarantined for one pass', () => {
  it('Q1: a conflicting queued task is NOT promoted in the same pass that orphaned its holder on AGE alone', () => {
    const old = new Date(Date.now() - 200 * MIN).toISOString();
    const reg = taskRegistry.load(root);
    const runner = taskRegistry.addTask(reg, { kind: 'implement', plan: 'p1', touches: ['src/shared.js'] });
    taskRegistry.updateTask(reg, runner.id, { status: 'running', ts: { started: old } });
    const waiter = taskRegistry.addTask(reg, { kind: 'implement', plan: 'p2', touches: ['src/shared.js'] });
    const free = taskRegistry.addTask(reg, { kind: 'implement', plan: 'p3', touches: ['src/free.js'] });
    taskRegistry.save(root, reg);

    const { report, promote } = taskReconcile.reconcileState(root, {}); // no live list → staleness backstop
    assert.deepEqual(report.orphaned, [runner.id]);
    assert.equal(report.stalenessOrphaned.length, 1);
    assert.ok(!promote.some((t) => t.id === waiter.id), 'the conflicting task waits ONE pass (the holder may still be alive)');
    assert.ok(Array.isArray(report.quarantined) && report.quarantined.some((q) => q.id === waiter.id),
      'the quarantine is REPORTED, not silent');
    assert.ok(promote.some((t) => t.id === free.id), 'a non-conflicting task is still promoted (not vacuous)');
  });
});

describe('R3-B item 9 — retention never severs a live edge', () => {
  it('R1: a terminal task still referenced by a queued task\'s blockedBy is NOT swept', () => {
    const ancient = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const r = taskReconcile.reconcile({
      version: 1, seq: 2,
      tasks: [
        { id: 't1', kind: 'implement', status: 'done', touches: ['src/a.js'], blockedBy: [], ts: { created: ancient, started: ancient, done: ancient } },
        { id: 't2', kind: 'implement', status: 'queued', touches: ['src/b.js'], blockedBy: ['t1'], ts: { created: ancient, started: null, done: null } }
      ]
    }, {});
    assert.ok(!r.report.swept.includes('t1'), 'the dependency SUCCEEDED — sweeping it would fail its dependent as dep-missing');
    assert.ok(r.tasks.tasks.some((t) => t.id === 't1'));
    assert.deepEqual(r.report.unsatisfiable, [], 't2 is not wedged');
  });

  it('R2: an UNreferenced old terminal task is still swept (the sweep still works)', () => {
    const ancient = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const r = taskReconcile.reconcile({
      version: 1, seq: 1,
      tasks: [{ id: 't1', kind: 'review', status: 'done', touches: [], blockedBy: [], ts: { created: ancient, started: ancient, done: ancient } }]
    }, {});
    assert.deepEqual(r.report.swept, ['t1']);
  });
});

describe('R3-B item 10 — cancelling has a deadline', () => {
  it('X1: a cancelling task past its deadline is FORCED to cancelled and reported', () => {
    const requested = new Date(Date.now() - 45 * MIN).toISOString();
    const r = taskReconcile.reconcile({
      version: 1, seq: 1,
      tasks: [{
        id: 't1', kind: 'implement', status: 'cancelling', agentTaskId: 'live-1',
        touches: ['src/a.js'], blockedBy: [],
        ts: { created: requested, started: requested, cancelRequested: requested, done: null }
      }]
    }, { liveAgentIds: ['live-1'] }); // the agent is STILL LIVE — the deadline is the tie-breaker
    assert.deepEqual(r.report.cancelled, ['t1']);
    assert.ok(Array.isArray(r.report.stalenessCancelled) &&
      r.report.stalenessCancelled.some((e) => e.id === 't1'), 'the forced cancel is LOUD');
    assert.equal(r.tasks.tasks[0].status, 'cancelled', 'the barrier-blocking task is finally freed');
  });

  it('X2: a cancelling task INSIDE the deadline is left alone while its agent lives', () => {
    const requested = new Date(Date.now() - 2 * MIN).toISOString();
    const r = taskReconcile.reconcile({
      version: 1, seq: 1,
      tasks: [{
        id: 't1', kind: 'implement', status: 'cancelling', agentTaskId: 'live-1',
        touches: ['src/a.js'], blockedBy: [],
        ts: { created: requested, started: requested, cancelRequested: requested, done: null }
      }]
    }, { liveAgentIds: ['live-1'] });
    assert.deepEqual(r.report.cancelled, []);
    assert.equal(r.tasks.tasks[0].status, 'cancelling');
  });

  it('X3: `menu task cancel --force` frees a RUNNING task immediately, loudly', () => {
    const a = ms.route(['menu', 'task', 'add', 'implement', 'pA', '--touches', 'src/a.js'], root);
    ms.route(['menu', 'task', 'start', a.taskId], root);
    const res = ms.route(['menu', 'task', 'cancel', a.taskId, '--force'], root);
    assert.equal(res.ok, true);
    assert.equal(res.status, 'cancelled', 'the force override skips the two-phase wait');
    assert.match(res.text, /FORCED/);
    assert.equal(taskRegistry.load(root).tasks.find((t) => t.id === a.taskId).status, 'cancelled');
  });

  it('X4: an ordinary running-cancel stamps ts.cancelRequested (the deadline clock starts)', () => {
    const a = ms.route(['menu', 'task', 'add', 'implement', 'pA', '--touches', 'src/a.js'], root);
    ms.route(['menu', 'task', 'start', a.taskId], root);
    ms.route(['menu', 'task', 'cancel', a.taskId], root);
    const t = taskRegistry.load(root).tasks.find((x) => x.id === a.taskId);
    assert.equal(t.status, 'cancelling');
    assert.ok(typeof t.ts.cancelRequested === 'string' && Date.parse(t.ts.cancelRequested) > 0,
      'the cancel deadline clock is stamped AND survives a load');
  });
});

describe('R3-B item 12 — sync-barrier integrity at the choke point', () => {
  it('B1: addTask REFUSES a sync task with an empty blockedBy', () => {
    const reg = taskRegistry.emptyRegistry();
    assert.throws(() => taskRegistry.addTask(reg, { kind: 'sync', gitOp: true }), /blockedBy/i);
    assert.equal(reg.tasks.length, 0, 'nothing was recorded');
  });

  it('B2: `menu task add sync` with no --blocked is refused (the CLI cannot bypass the barrier)', () => {
    const res = ms.route(['menu', 'task', 'add', 'sync', 'wave'], root);
    assert.equal(res.ok, false);
    assert.match(String(res.error), /blockedBy/i);
    assert.equal(taskRegistry.load(root).tasks.length, 0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Handovers from the concurrent ledger slice (both live in actions.js)
// ══════════════════════════════════════════════════════════════════════════════

describe('R3-B handover (a) — the human-approval ledger entry carries plan_basename', () => {
  it('A1: stampAndLedger records plan_basename, arming the case-collision guard', () => {
    const p = writePlan('implementation', 'ledger-plan', { files: ['src/a.js'] });
    actions.stampAndLedger(p, 'implementation', 'todo', root);
    const entry = ledger.readEntry('ledger-plan', root);
    assert.equal(entry.plan_basename, 'ledger-plan', 'the guard fires only when BOTH records carry it');
    assert.equal(entry.approved_by, 'human');
  });

  it('A2: a case-differing plan cannot silently overwrite an existing plan\'s provenance', () => {
    // FS-agnostic (macOS is case-insensitive, so two case-only-differing FILES cannot
    // coexist): drive the guard at the ledger boundary the live path arms. p1 crosses the
    // gate and records plan_basename 'case-plan'; a SECOND crossing of a different-cased
    // basename onto the SAME canonical key ('case-plan') is REFUSED — the exact silent
    // overwrite that used to clobber p1's hash and get it reverted out of its gate.
    const p1 = writePlan('implementation', 'case-plan', { files: ['src/a.js'] });
    actions.stampAndLedger(p1, 'implementation', 'todo', root);
    assert.throws(
      () => ledger.writeEntry('case-plan', {
        content_sha256: 'deadbeef', stage_from: 'implementation', stage_to: 'todo',
        approved_by: 'human', plan_basename: 'Case-Plan'
      }, root),
      /collision/i,
      'the guard fires only because the live human-approval path recorded plan_basename'
    );
    // p1's provenance is INTACT — a rejected collision never removes another plan's entry.
    const content = fs.readFileSync(path.join(root, 'plans', 'todo', 'case-plan.md'), 'utf8');
    assert.equal(ledger.verify('case-plan', content, 'todo', root), true,
      'the first plan is still genuinely ledger-approved (not clobbered)');
  });
});

describe('R3-B handover (b) — the deploy-ready notice is written atomically', () => {
  it('A3: crossing Gate 3 with deploy enabled records a deploy-ready notice via temp+rename (no leftover temp)', () => {
    // Drive the LIVE path (approvePlan's Gate-3 deploy-ready branch), not a test-only export
    // (the reachability fence forbids exporting solely for a test). Deploy is ENABLED but the
    // ship gate is NOT confirmed, so approvePlan records a notice instead of deploying.
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.ctoc', 'settings.json'),
      JSON.stringify({ deployment: { enabled: true } })
    );
    // A plan in review/ that approvePlan will cross review → done (Gate 3).
    const reviewPath = writePlan('review', 'deployed', { files: ['src/d.js'] });

    // R5-B: approvePlan now VALIDATES review→done. The subject is the atomic
    // deploy-ready notice write, not the validation gate, so cross via an audited override.
    actions.approvePlan(reviewPath, root, { override: { reason: 'deploy-ready atomic-write test — validation not under test' } });

    const logDir = path.join(root, '.ctoc', 'logs');
    const parsed = JSON.parse(fs.readFileSync(path.join(logDir, 'deploy-ready.json'), 'utf8'));
    assert.equal(parsed.length, 1, 'one deploy-ready notice recorded');
    assert.equal(parsed[0].plan, 'deployed.md');
    assert.equal(parsed[0].status, 'deploy-ready');
    assert.deepEqual(
      fs.readdirSync(logDir).filter((f) => f.includes('deploy-ready.json.tmp')), [],
      'the atomic temp+rename leaves NO temp artifact behind'
    );
  });
});

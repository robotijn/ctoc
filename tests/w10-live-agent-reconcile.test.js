/**
 * W10-s4 (H8) — Behavioral tests: live-agent ids plumbed into reconcile.
 *
 * Fixes finding H8: the on-open reconcile ran BLIND. `menu-screens.js` hardcoded
 * `taskReconcile.reconcileState(root, { liveAgentIds: null })`, and no channel
 * existed to carry the live harness agent-id list from the calling context down
 * to the reconcile. `menu task start` never recorded an `agentTaskId` either, so
 * even a plumbed live set would have had nothing on the task to match against.
 *
 * Consequences (all verified in the parent): a genuinely-live background
 * `implement` task past the 30-minute staleness threshold was falsely orphaned,
 * dropped out of the running-only concurrency count (so a duplicate was offered),
 * and had its real completion rejected as `invalid transition orphaned → done`.
 *
 * This slice supplies the two inputs the pure reconcile core (task-reconcile.js)
 * and the registry (task-registry.js) already know how to consume:
 *   1. a live-agent-id list threaded argv → route → dashboardPipeline →
 *      buildDashboardTable → reconcileState (the `--live-agent-ids <csv>` flag,
 *      parsed by `extractLiveAgentIds` in menu.js);
 *   2. an `agentTaskId` recorded on the task at `menu task start` (from
 *      `--agent-id`, defaulting to the task id).
 *
 * NO test doubles: every case drives the REAL production reconcile through the
 * REAL router (`menu-screens.route`) against a REAL on-disk task registry seeded
 * via the REAL registry API in an isolated tmp root. The true-positive ("live →
 * still running") and true-negative ("dead → orphaned") cases live in the SAME
 * file, in the SAME reconcile pass, so a broken "fix" that merely disables
 * staleness detection cannot pass. Case 8 spawns the real `menu.js` process to
 * prove the ride-along is not bypassed. Raw fs/os/child_process are permitted in
 * tests/**.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { extractLiveAgentIds } = require('../src/commands/menu');
const ms = require('../src/lib/menu-screens');
const taskRegistry = require('../src/lib/task-registry');
const taskReconcile = require('../src/lib/task-reconcile');

const MENU = path.join(__dirname, '..', 'src', 'commands', 'menu.js');

// Older than DEFAULT_STALE_MS (30 min). A `running` task this old is orphaned
// whenever a live set is PRESENT and does not confirm it (the definitive dead
// signal — age is not what condemns it there).
const PAST_STALE_MIN = 40;

// R2-A made the AGE backstop kind-aware: with NO live set to consult, reconcile
// orphans on age alone, and an `implement` task gets a 120-minute floor rather
// than the flat 30-minute DEFAULT_STALE_MS — an implement run legitimately takes
// hours, so a flat floor falsely orphaned live agents. These are derived from the
// production constant, never a duplicated literal, so the fixture tracks the
// contract if the floor ever moves.
const IMPLEMENT_STALE_MIN = taskReconcile.DEFAULT_STALE_MS_BY_KIND.implement / 60_000; // 120
const PAST_IMPLEMENT_STALE_MIN = IMPLEMENT_STALE_MIN + 30;  // 150 — past the floor
// 45 sits INSIDE the implement floor but ABOVE the old flat 30-min one, so a
// regression back to the flat floor is caught rather than silently tolerated.
const WITHIN_IMPLEMENT_GRACE_MIN = 45;

// ── isolated tmp-root harness ───────────────────────────────────────────────
let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w10-s4-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** ISO timestamp `minutesAgo` minutes before now. */
function minutesAgoIso(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

/**
 * Seed a set of `running` tasks on disk via the REAL registry API. Each spec is
 * `{ agentTaskId, ageMinutes, plan }`; ids are assigned in order (t1, t2, …).
 * @param {Array<{agentTaskId?:string, ageMinutes?:number, plan?:string}>} specs
 * @returns {string[]} the assigned task ids, in seed order
 */
function seedRunning(specs) {
  const reg = taskRegistry.emptyRegistry();
  const ids = [];
  for (const spec of specs) {
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: spec.plan || 'w10-s4-demo', touches: ['src/' + (spec.plan || 'w10-s4-demo') + '.js'] });
    taskRegistry.updateTask(reg, t.id, {
      status: 'running',
      agentTaskId: spec.agentTaskId,
      ts: { started: minutesAgoIso(spec.ageMinutes == null ? PAST_STALE_MIN : spec.ageMinutes) },
    });
    ids.push(t.id);
  }
  taskRegistry.save(root, reg);
  return ids;
}

/** Seed one queued task (no transition) and return its id. */
function seedQueued(plan) {
  const reg = taskRegistry.emptyRegistry();
  const t = taskRegistry.addTask(reg, { kind: 'implement', plan: plan || 'w10-s4-queued', touches: ['src/' + (plan || 'w10-s4-queued') + '.js'] });
  taskRegistry.save(root, reg);
  return t.id;
}

/** Re-read the on-disk registry and return task `id`. */
function readTask(id) {
  return taskRegistry.load(root).tasks.find((t) => t.id === id);
}

describe('W10-s4 (H8) — extractLiveAgentIds argv parser', () => {
  it('7. parses a csv, trims whitespace, drops empties, strips the flag from rest', () => {
    const out = extractLiveAgentIds(['menu', '--live-agent-ids', 'a1,a2 , a3']);
    assert.deepEqual(out.liveAgentIds, ['a1', 'a2', 'a3']);
    assert.deepEqual(out.rest, ['menu']);
  });

  it('7b. absent flag → liveAgentIds undefined, rest unchanged', () => {
    const out = extractLiveAgentIds(['menu', 'task', 'list']);
    assert.equal(out.liveAgentIds, undefined);
    assert.deepEqual(out.rest, ['menu', 'task', 'list']);
  });

  it('7c. flag with a missing value → empty id list, flag consumed', () => {
    const out = extractLiveAgentIds(['--live-agent-ids']);
    assert.deepEqual(out.liveAgentIds, []);
    assert.deepEqual(out.rest, []);
  });
});

describe('W10-s4 (H8) — live-agent ids threaded through route → reconcile', () => {
  it('1+2. a live old task stays running while a dead old task is orphaned in the SAME pass (scenarios 4+5)', () => {
    // t1: live (agentTaskId a1 in the live set), 40 min old → must stay running.
    // t2: dead (agentTaskId a2 NOT in the live set), 40 min old → must be orphaned.
    const [t1, t2] = seedRunning([
      { agentTaskId: 'a1' },
      { agentTaskId: 'a2' },
    ]);

    const res = ms.route(['menu'], root, { liveAgentIds: ['a1'] });

    assert.equal(readTask(t1).status, 'running', 'live long-running task must NOT be orphaned');
    assert.equal(readTask(t2).status, 'orphaned', 'dead long-running task must still be orphaned');
    // Exactly one orphan surfaced on the dashboard — the dead one, not the live one.
    assert.match(res.text, /1 task orphaned — offer re-run/, 'only the dead task is offered for re-run');
  });

  it('3. the live long-running task counts toward the ≤5 cap (scenario 6)', () => {
    // t1 live+old, plus 4 freshly-started running tasks → 5 running once reconciled.
    const [t1] = seedRunning([
      { agentTaskId: 'a1', ageMinutes: PAST_STALE_MIN, plan: 'p1' },
      { agentTaskId: 'a2', ageMinutes: 0, plan: 'p2' },
      { agentTaskId: 'a3', ageMinutes: 0, plan: 'p3' },
      { agentTaskId: 'a4', ageMinutes: 0, plan: 'p4' },
      { agentTaskId: 'a5', ageMinutes: 0, plan: 'p5' },
    ]);

    // Reconcile via the real render, honoring the live set: t1 must NOT be freed.
    ms.route(['menu'], root, { liveAgentIds: ['a1', 'a2', 'a3', 'a4', 'a5'] });

    const reg = taskRegistry.load(root);
    assert.equal(reg.tasks.filter((t) => t.status === 'running').length, 5, 'all five stay running');
    assert.equal(readTask(t1).status, 'running', 'the live long-running task keeps its slot');

    // A 6th queued implement task on a different plan must be blocked by the cap.
    const decision = taskRegistry.canRun(
      { id: 't99', kind: 'implement', plan: 'p6', touches: ['src/p6.js'], blockedBy: [], gitOp: false },
      reg,
    );
    assert.equal(decision.run, false, 'the ≤5 cap counts the live task, so a 6th is queued');
    assert.equal(decision.reason, 'max-concurrent');
  });

  it('4. a genuine completion of the live task is accepted, not rejected (scenario 7)', () => {
    const [t1] = seedRunning([{ agentTaskId: 'a1' }]);

    // On-open reconcile with the live set present leaves t1 running.
    ms.route(['menu'], root, { liveAgentIds: ['a1'] });
    assert.equal(readTask(t1).status, 'running', 'precondition: live task still running after reconcile');

    // The live agent later reports its real completion.
    const res = ms.route(['menu', 'task', 'complete', t1, '--summary', 'done'], root);
    assert.equal(res.ok, true, 'running → done must succeed, NOT be rejected as orphaned → done');
    assert.equal(readTask(t1).status, 'done');
  });

  it('5. a true session restart (no live ids) orphans an implement task past the 120-min floor but NOT one inside it (scenario 8 backstop preserved, R2-A kind-aware floor pinned)', () => {
    // Both tasks are seeded into the SAME registry and reconciled in the SAME
    // pass, so neither half can be satisfied by a "fix" that breaks the other:
    //   • disable staleness entirely  → the stale task stays running → 1st fails.
    //   • revert to the flat 30-min floor → the 45-min task is orphaned → 2nd fails.
    const [stale, young] = seedRunning([
      { agentTaskId: 'a1', ageMinutes: PAST_IMPLEMENT_STALE_MIN, plan: 'w10-stale' },
      { agentTaskId: 'a2', ageMinutes: WITHIN_IMPLEMENT_GRACE_MIN, plan: 'w10-young' },
    ]);

    // No opts / no liveAgentIds → reconcile falls back to the AGE backstop.
    ms.route(['menu'], root);

    assert.equal(
      readTask(stale).status,
      'orphaned',
      'backstop preserved: an implement task past the 120-min floor, with no live id confirming it, is still orphaned',
    );
    assert.equal(
      readTask(young).status,
      'running',
      'kind-aware floor: a 45-min implement task is INSIDE the 120-min grace window and must NOT be orphaned on age alone',
    );
  });
});

describe('W10-s4 (H8) — menu task start records agentTaskId', () => {
  it('6. --agent-id records the harness id; absent → defaults to the task id', () => {
    const id = seedQueued('p-start');

    const res = ms.route(['menu', 'task', 'start', id, '--agent-id', 'h9'], root);
    assert.equal(res.ok, true);
    const started = readTask(id);
    assert.equal(started.status, 'running');
    assert.equal(started.agentTaskId, 'h9', 'the caller-supplied harness id is recorded');

    // A second queued task started WITHOUT --agent-id defaults agentTaskId to the task id.
    const reg = taskRegistry.load(root);
    const t2 = taskRegistry.addTask(reg, { kind: 'implement', plan: 'p-start-2', touches: ['src/p-start-2.js'] });
    taskRegistry.save(root, reg);
    const res2 = ms.route(['menu', 'task', 'start', t2.id], root);
    assert.equal(res2.ok, true);
    assert.equal(readTask(t2.id).agentTaskId, t2.id, 'agentTaskId defaults to the task id when --agent-id is omitted');
  });

  it('6b. a recorded agentTaskId is what the live set matches on end-to-end', () => {
    // Start a queued task recording harness id h1, age it past the threshold, then
    // reconcile with h1 in the live set → it must NOT be orphaned. This proves the
    // recorded id and the live-set id are the same comparison key.
    const id = seedQueued('p-e2e');
    ms.route(['menu', 'task', 'start', id, '--agent-id', 'h1'], root);

    // Age the started task past the staleness threshold on disk.
    const reg = taskRegistry.load(root);
    const t = reg.tasks.find((x) => x.id === id);
    t.ts.started = minutesAgoIso(PAST_STALE_MIN);
    taskRegistry.save(root, reg);

    ms.route(['menu'], root, { liveAgentIds: ['h1'] });
    assert.equal(readTask(id).status, 'running', 'the recorded agentTaskId matched the live set → not orphaned');
  });
});

describe('W10-s4 (H8) — ride-along preserved when only --live-agent-ids is passed', () => {
  it('8. spawning `menu.js --live-agent-ids a1` still attaches the environment question (integration)', () => {
    // env UNSET (no settings.json) → the environment question must ride along.
    // gdpr profile active in settings.yaml suppresses the compliance ride-along
    // (isolate the environment ride-along, mirroring tests/menu-environment.test.js).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w10-s4-proc-'));
    try {
      fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'plans', 'functional'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.ctoc', 'settings.yaml'),
        'regulatory_regime:\n  active_profiles: [gdpr]\n  overrides: {}\n\ngeneral:\n  x: 1\n',
      );

      const out = execFileSync(process.execPath, [MENU, '--live-agent-ids', 'a1'], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      const r = JSON.parse(out);

      // The plan overview still renders (flag did not divert to a sub-command screen).
      assert.match(r.text, /▼ Business/, 'dashboard overview renders on the live on-open path');
      // The environment question rides along as a SECOND question — not bypassed.
      assert.equal(r.ask.questions.length, 2, 'pipeline + environment questions');
      assert.equal(r.ask.questions[1].header, 'Environment', 'environment ride-along preserved');
      assert.equal(r.actions['Development'], 'claude:set-environment dev');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('W10-s4 (H8) — pure reconcile core is already live-aware (guard against re-breaking it)', () => {
  it('9. reconcile leaves a matching task running and orphans a non-matching one (unit)', () => {
    const now = Date.parse('2026-07-13T12:00:00.000Z');
    const started = new Date(now - PAST_STALE_MIN * 60_000).toISOString();
    const value = {
      version: taskRegistry.REGISTRY_VERSION,
      seq: 2,
      tasks: [
        { id: 't1', kind: 'implement', status: 'running', agentTaskId: 'a1', ts: { started } },
        { id: 't2', kind: 'implement', status: 'running', agentTaskId: 'a2', ts: { started } },
      ],
    };
    const { tasks, report } = taskReconcile.reconcile(value, { liveAgentIds: ['a1'], now });
    const byId = Object.fromEntries(tasks.tasks.map((t) => [t.id, t]));
    assert.equal(byId.t1.status, 'running', 'live id → left running');
    assert.equal(byId.t2.status, 'orphaned', 'no live id → orphaned');
    assert.deepEqual(report.orphaned, ['t2']);
  });
});

'use strict';

/**
 * AN UNREADABLE DEPENDENCY LIST REFUSES THE PLAN (plan 00145).
 *
 * The defect (recorded, not theoretical): when a plan's `depends_on` list cannot be
 * READ — every token is an unsafe slug the path-traversal guard refuses —
 * `planDependsOn` used to return `[]`, byte-indistinguishable from a plan with NO
 * dependencies. `taskSpecFromPlan` then built a spec with `blockedBy: []` and the
 * scheduler CLAIMED the plan and started building on an unknown dependency state. A
 * gate whose input is unreadable and which opens anyway is not a gate.
 *
 * The fix fails CLOSED: an unreadable dependency list REFUSES the plan (a throw the
 * FIFO walk records in `skipped[]`), and the Agent area shows the human the plan and
 * the reason. The safety predicate (`isSafePlanSlug`) is UNCHANGED — the defect was
 * never that the slug is rejected, only that the rejection was discarded instead of
 * reported.
 *
 * Zero doubles for the scheduler path: real temp roots, real plan files, the real
 * `taskSpecFromPlan`/`startAgent`. The Agent-area cases stub ONLY the boundary
 * function `actions.startAgent`, never the logic under test (`agent.handleKey`).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const actions = require('../src/lib/actions');
const agent = require('../src/areas/agent');
const state = require('../src/lib/state');
const taskRegistry = require('../src/lib/task-registry');
const safeFs = require('../src/lib/safe-fs');
const { invalidate } = require('../src/lib/cache');

// ── harness ─────────────────────────────────────────────────────────────────

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-00145-'));
  for (const d of ['todo', 'in-progress', 'review', 'done', 'implementation']) {
    fs.mkdirSync(path.join(root, 'plans', d), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
  invalidate();
});

afterEach(() => {
  invalidate();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/**
 * A GATED two-block plan (approval marker block + the plan's own block) — the exact
 * shape every plan carries after crossing into todo, so the merged-frontmatter reader
 * is under test, not a simplified single-block plan.
 */
function writePlan(stage, name, { files = ['src/x.js'], dependsOn = null } = {}) {
  const filesBlock = files === null
    ? ''
    : 'files:\n' + files.map((f) => `  - "${f}"`).join('\n') + '\n';
  const depLine = dependsOn === null ? '' : `depends_on: ${dependsOn}\n`;
  const content =
    '---\napproved_by: human\ngate_crossed: implementation → todo\n---\n\n' +
    '---\n' +
    `title: "${name}"\ntype: implementation\n` +
    depLine +
    filesBlock +
    '---\n\n' +
    `# ${name}\n\nbody\n`;
  const p = path.join(root, 'plans', stage, `${name}.md`);
  fs.writeFileSync(p, content);
  return p;
}

function todoPlan(name) {
  invalidate();
  return state.readPlans(path.join(root, 'plans', 'todo')).find((p) => p.name === name);
}

const NUL = 'evil' + String.fromCharCode(0) + 'dep';
const TRAVERSAL = '../../../../etc/passwd';
const SEP = 'sub/dir/dep';

// ═════════════════════════════════════════════════════════════════════════════
// 1–9  taskSpecFromPlan — the refuse-before-resolve contract
// ═════════════════════════════════════════════════════════════════════════════

describe('taskSpecFromPlan — an unreadable dependency list refuses the plan', () => {
  it('1: unreadable is NOT empty — no deps builds a spec, an unreadable list THROWS (differ in kind)', () => {
    writePlan('todo', 'empty', { dependsOn: null });
    writePlan('todo', 'unreadable', { dependsOn: TRAVERSAL });

    const emptySpec = actions.taskSpecFromPlan(todoPlan('empty'), root);
    assert.deepEqual(emptySpec.blockedBy, [], 'a plan with no depends_on is unblocked');

    // The two inputs must differ in KIND: one returns a spec, the other throws. A fix
    // that only logs and still returns a spec would make both return objects — RED here.
    let threw = false;
    try { actions.taskSpecFromPlan(todoPlan('unreadable'), root); }
    catch { threw = true; }
    assert.equal(threw, true, 'an unreadable dependency list must THROW, not return a spec');
  });

  it('2: depends_on: none is EMPTY, not refused — builds a spec, blockedBy []', () => {
    writePlan('todo', 'none-dep', { dependsOn: 'none' });
    const spec = actions.taskSpecFromPlan(todoPlan('none-dep'), root);
    assert.deepEqual(spec.blockedBy, [], 'the none sentinel is a declaration of no deps');
  });

  it('3: an absent depends_on key is EMPTY — builds a spec, blockedBy []', () => {
    writePlan('todo', 'absent-dep', { dependsOn: null });
    const spec = actions.taskSpecFromPlan(todoPlan('absent-dep'), root);
    assert.deepEqual(spec.blockedBy, [], 'absent is absent');
  });

  it('4: each unsafe shape refuses the plan (traversal / NUL / separator)', () => {
    for (const [label, token] of [['traversal', TRAVERSAL], ['NUL', NUL], ['separator', SEP]]) {
      writePlan('todo', `unsafe-${label}`, { dependsOn: token });
      assert.throws(
        () => actions.taskSpecFromPlan(todoPlan(`unsafe-${label}`), root),
        /dependency list unreadable/,
        `an unsafe ${label} token must refuse the plan`
      );
    }
  });

  it('5: a VALID dependency beside an unsafe one still REFUSES the whole plan', () => {
    const dep = taskRegistry.addAndClaim(root, {
      kind: 'implement', plan: 'live-dep', touches: ['src/dep.js']
    });
    assert.equal(dep.claimed, true, 'dep runs on an empty registry');

    writePlan('todo', 'mixed', { dependsOn: `${TRAVERSAL} live-dep` });
    assert.throws(
      () => actions.taskSpecFromPlan(todoPlan('mixed'), root),
      /dependency list unreadable/,
      'partial success (honouring the valid half) is the defect in miniature'
    );
  });

  it('6: the refusal names the plan, the count, and the token', () => {
    writePlan('todo', 'named', { dependsOn: TRAVERSAL });
    assert.throws(
      () => actions.taskSpecFromPlan(todoPlan('named'), root),
      (err) =>
        /named/.test(err.message) &&
        /dependency list unreadable/.test(err.message) &&
        /\b1\b/.test(err.message) &&
        err.message.includes('etc/passwd'),
      'must name the plan, state the count, and quote the refused token'
    );
  });

  it('7: the refusal tells the human to fix the plan, never to relax the check', () => {
    writePlan('todo', 'instruct', { dependsOn: TRAVERSAL });
    assert.throws(
      () => actions.taskSpecFromPlan(todoPlan('instruct'), root),
      (err) =>
        !/isSafePlanSlug/.test(err.message) &&
        !/allow/i.test(err.message) &&
        /depends_on/.test(err.message),
      'the fix is the plan frontmatter, not the safety predicate'
    );
  });

  it('8: a pure refusal probes nothing — no dependency existsSync, in-root or otherwise', () => {
    writePlan('todo', 'no-probe', { dependsOn: TRAVERSAL });
    const rootResolved = path.resolve(root);
    const calls = [];
    const orig = safeFs.existsSync;
    safeFs.existsSync = (p) => { calls.push(String(p)); return orig(p); };
    try {
      assert.throws(() => actions.taskSpecFromPlan(todoPlan('no-probe'), root),
        /dependency list unreadable/);
    } finally {
      safeFs.existsSync = orig;
    }
    // Refusal precedes resolution: no done/ or review/ dependency probe was recorded.
    for (const p of calls) {
      assert.ok(!/plans[\\/](done|review)[\\/]/.test(p),
        `no dependency probe may run before a refusal: ${p}`);
      const resolved = path.resolve(p);
      assert.ok(resolved === rootResolved || resolved.startsWith(rootResolved + path.sep),
        `existsSync must never probe outside the project root: ${resolved}`);
    }
  });

  it('9: the refused token is never joined into a filesystem path', () => {
    writePlan('todo', 'no-join', { dependsOn: TRAVERSAL });
    const calls = [];
    const orig = safeFs.existsSync;
    safeFs.existsSync = (p) => { calls.push(String(p)); return orig(p); };
    try {
      assert.throws(() => actions.taskSpecFromPlan(todoPlan('no-join'), root),
        /dependency list unreadable/);
    } finally {
      safeFs.existsSync = orig;
    }
    for (const p of calls) {
      assert.ok(!p.includes('etc/passwd'),
        `the refused token must never reach a path: ${p}`);
    }
  });

  it('13: a safe-but-unresolvable dependency throws with TODAY\'s message (unchanged)', () => {
    writePlan('todo', 'ghost', { dependsOn: 'ghost-dep' });
    assert.throws(
      () => actions.taskSpecFromPlan(todoPlan('ghost'), root),
      (err) => /ghost-dep/.test(err.message) && /Enqueue "ghost-dep"/.test(err.message),
      'a readable, unsatisfied dependency keeps its exact original wording'
    );
  });

  it('14: a satisfied (done/) dependency still adds no blocker (unchanged)', () => {
    writePlan('done', 'done-dep', {});
    writePlan('todo', 'needs-done', { dependsOn: 'done-dep' });
    const spec = actions.taskSpecFromPlan(todoPlan('needs-done'), root);
    assert.deepEqual(spec.blockedBy, [], 'a done dependency is satisfied — no blocker');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10–12  startAgent — the FIFO walk records the refusal and does not stall
// ═════════════════════════════════════════════════════════════════════════════

describe('startAgent — a refused plan is skipped, recorded, and left in todo', () => {
  it('10: an unreadable head is skipped[] with its reason; the NEXT plan is claimed', () => {
    writePlan('todo', '00144-bad', { dependsOn: TRAVERSAL });
    writePlan('todo', '00145-good', { dependsOn: null });

    const res = actions.startAgent(root, { force: true });
    assert.equal(res.started, true, 'the second, valid plan is claimed');
    assert.equal(res.plan.name, '00145-good', 'the valid plan is the one started');
    const skip = res.skipped.find((s) => s.plan === '00144-bad');
    assert.ok(skip, 'the refused head is recorded in skipped[]');
    assert.match(skip.reason, /dependency list unreadable/, 'with the refusal reason');
  });

  it('11: all-refused → nothing claimable, every refusal recorded in skipped[]', () => {
    writePlan('todo', '00144-bad', { dependsOn: TRAVERSAL });
    writePlan('todo', '00146-bad', { dependsOn: NUL });

    const res = actions.startAgent(root, { force: true });
    assert.equal(res.started, false, 'nothing is claimable');
    assert.equal(res.error, 'No claimable plan in todo queue', 'the nothing-claimable error');
    assert.equal(res.skipped.length, 2, 'both refusals recorded');
    for (const s of res.skipped) {
      assert.match(s.reason, /dependency list unreadable/, 'each with the refusal reason');
    }
  });

  it('12: the refused plan stays in todo/ and no registry task is created for it', () => {
    writePlan('todo', '00144-bad', { dependsOn: TRAVERSAL });

    actions.startAgent(root, { force: true });

    assert.ok(fs.existsSync(path.join(root, 'plans', 'todo', '00144-bad.md')),
      'the refused plan is still in todo/');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'in-progress', '00144-bad.md')),
      'the refused plan was never moved to in-progress/');
    const tasks = taskRegistry.load(root).tasks.filter((t) => t.plan === '00144-bad');
    assert.equal(tasks.length, 0, 'no scheduler task was created for the refused plan');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15–17  the Agent area shows the refusal (agent.handleKey `g` branch)
// ═════════════════════════════════════════════════════════════════════════════

describe('Agent area — the human sees which plan was refused and why', () => {
  function withStubbedStart(res, run) {
    const orig = actions.startAgent;
    actions.startAgent = () => res;
    try { run(); } finally { actions.startAgent = orig; }
  }

  it('15: pressing g surfaces the skipped plan and its reason in the status line', () => {
    const app = { projectPath: root, message: null };
    withStubbedStart({
      started: true,
      plan: { name: '00145-good' },
      skipped: [{ plan: '00144-bad', reason: 'dependency list unreadable: 1 token refused as unsafe: "../../../../etc/passwd"' }],
    }, () => {
      const handled = agent.handleKey({ sequence: 'g' }, app);
      assert.equal(handled, true, 'g is handled');
    });
    assert.match(app.message, /00144-bad/, 'the refused plan is named');
    assert.match(app.message, /unreadable/, 'the reason is carried');
  });

  it('16: the summary is control-stripped and bounded (a hostile plan cannot blow up the line)', () => {
    const app = { projectPath: root, message: null };
    withStubbedStart({
      started: true,
      plan: { name: '00145-good' },
      skipped: [{ plan: 'evil\x1b[2J\x00name', reason: 'x'.repeat(5000) }],
    }, () => {
      agent.handleKey({ sequence: 'g' }, app);
    });
    assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(app.message),
      'no control characters reach the terminal');
    assert.ok(app.message.length < 400,
      `the message is bounded, got ${app.message.length}`);
  });

  it('17: an empty or absent skipped list leaves every branch\'s message byte-identical', () => {
    const cases = [
      [{ started: true, plan: { name: 'p1' }, skipped: [] }, 'Agent started on p1'],
      [{ drainStopped: true, skipped: [] }, 'Agent is drain-stopped; nothing new started'],
      [{ queued: true, reason: 'waiting for a slot', skipped: [] }, 'Queued: waiting for a slot'],
      [{ error: 'No plans in todo queue', skipped: [] }, 'No plans in todo queue'],
      [{}, 'Nothing to start (todo queue empty)'],
    ];
    for (const [res, expected] of cases) {
      const app = { projectPath: root, message: null };
      withStubbedStart(res, () => { agent.handleKey({ sequence: 'g' }, app); });
      assert.equal(app.message, expected, `branch message unchanged when nothing skipped`);
    }
  });
});

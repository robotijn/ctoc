'use strict';

/**
 * A MISTAKEN CALL MUST NOT READ AS A VERDICT ABOUT THE PLAN (plan 00131).
 *
 * `completeTaskPlan(projectPath, planSlug)` used to answer a CALLER FAULT (an
 * absolute path handed to `planSlug` — the classic swap with
 * `completeExecution(planPath, projectPath)`) with the SAME `{ ran:false, reason }`
 * shape it uses for a genuine report about the plan. `menu-screens.js` then rendered
 * that caller fault as a security-flavoured verdict about the plan, complete with
 * remediation advice ("check the plan slug / that the plan is in in-progress/ or
 * review/") for a plan that was never the problem.
 *
 * This test pins the fix: the result carries a discriminated `fault` field —
 * `fault:'caller'` means THE CALL was wrong; `fault:null` means the call was fine and
 * here is what I found about the plan. Every new branch still REFUSES; no completion
 * becomes acceptable that was not acceptable before. Zero doubles: real temp roots,
 * real plan files, the real `completeTaskPlan` and the real menu completion route.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const actions = require('../src/lib/actions');
const ms = require('../src/lib/menu-screens');
const state = require('../src/lib/state');
const taskRegistry = require('../src/lib/task-registry');
const { readVerifyEvidence } = require('../src/lib/step-13-verify');
const { invalidate } = require('../src/lib/cache');

// ── harness ──────────────────────────────────────────────────────────────────

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-fault-'));
  invalidate();
});
afterEach(() => {
  invalidate();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

/** A real, library-shaped project whose `npm test` passes (so a real verify can run). */
function mkProject(r) {
  for (const s of STAGES) fs.mkdirSync(path.join(r, 'plans', s), { recursive: true });
  fs.mkdirSync(path.join(r, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(r, 'src'), { recursive: true });
  fs.writeFileSync(path.join(r, 'src', 'thing.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(r, 'package.json'), JSON.stringify({
    name: 'a-real-slice', version: '1.0.0', main: 'src/thing.js',
    scripts: { test: 'node -e "process.exit(0)"' }
  }, null, 2));
}

function planBody() {
  return `---
approved_by: human
approved_at: 2026-07-19T10:00:00.000Z
gate_crossed: implementation → todo
---

---
title: "A real slice"
type: implementation
iron_loop: true
files:
  - "src/thing.js"
---

# A real slice

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Tests written and red first

### Step 9: PREPARE
- [x] Environment ready

### Step 10: IMPLEMENT
- [x] Code written

### Step 11: REVIEW
- [x] Self-reviewed

### Step 12: OPTIMIZE
- [x] No redundant work

### Step 13: SECURE
- [x] Inputs validated

### Step 14: VERIFY
- [x] Lint, types, all tests green

### Step 15: DOCUMENT
- [x] Docs updated

### Step 16: FINAL-REVIEW
- [x] Ready for human review
`;
}

function seedPlan(r, stage, slug, body) {
  const p = path.join(r, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, body == null ? planBody() : body);
  return p;
}

function seedRunningImplement(r, plan) {
  const reg = taskRegistry.load(r);
  const t = taskRegistry.addTask(reg, { kind: 'implement', plan, touches: ['src/thing.js'] });
  taskRegistry.updateTask(reg, t.id, { status: 'running' });
  taskRegistry.save(r, reg);
  return t.id;
}

function taskOf(r, id) {
  return taskRegistry.load(r).tasks.find((t) => t.id === id);
}

function verifyDirFiles(r) {
  const d = path.join(r, '.ctoc', 'state', 'verify');
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
}

// ═════════════════════════════════════════════════════════════════════════════
// completeTaskPlan — the fault discrimination
// ═════════════════════════════════════════════════════════════════════════════

describe('completeTaskPlan — a caller fault announces itself, not a plan verdict', () => {
  // Case 1 — RED today: the reported failure, reproduced.
  it('1: the swapped call (root into planSlug) is fault:caller and names both parameters + the correct order', () => {
    mkProject(root);
    const res = actions.completeTaskPlan(root, root); // arguments swapped: an absolute path into planSlug
    assert.equal(res.ran, false);
    assert.equal(res.fault, 'caller', 'a mistaken call is a caller fault, never a verdict about the plan');
    assert.match(res.reason, /planSlug/, 'the reason names the planSlug parameter');
    assert.match(res.reason, /projectPath/, 'the reason names the projectPath parameter');
    assert.match(res.reason, /completeTaskPlan\(projectPath, planSlug\)/, 'it states the correct order');
  });

  // Case 2 — RED today: the message is unmistakably about the call, not the plan.
  it('2: the caller-fault reason carries NO remediation advice about the plan folders', () => {
    mkProject(root);
    const res = actions.completeTaskPlan(root, root);
    assert.equal(res.fault, 'caller');
    assert.doesNotMatch(res.reason, /in-progress\/|review\//,
      'a caller fault must not advise moving the plan between stages');
    assert.doesNotMatch(res.reason, /check the plan slug|is in in-progress/i);
  });

  // Case 3 — RED today: both halves of the swap are detected.
  it('3: a bare-token projectPath paired with a path-shaped planSlug is reported as a swap, explicitly', () => {
    const res = actions.completeTaskPlan('my-plan', '/tmp/some/ghost-plan');
    assert.equal(res.ran, false);
    assert.equal(res.fault, 'caller');
    assert.match(res.reason, /my-plan/, 'it names the bare-token value that landed in projectPath');
    assert.match(res.reason, /other half|swapped/i, 'it calls out that this is the other half of a swapped call');
  });

  // Case 4 — GREEN before source: a genuine "no plan file" report is NOT relabelled.
  // This pins the INVARIANT reason (the behaviour that must not move); the
  // fault:null discrimination for this exact input is red-pinned by case 6.
  it('4: a safe slug that names no plan still reports the missing plan naming both folders (unchanged)', () => {
    mkProject(root);
    const res = actions.completeTaskPlan(root, 'ghost-plan');
    assert.equal(res.ran, false);
    assert.match(res.reason, /no plan file for "ghost-plan" in in-progress\/ or review\//);
  });

  // Case 5 — GREEN before source: a task with no plan is NOT relabelled.
  // Invariant reason pin; fault:null for '' is red-pinned by case 6.
  it('5: an empty slug still reports "task carries no plan" (unchanged)', () => {
    const res = actions.completeTaskPlan(root, '');
    assert.equal(res.ran, false);
    assert.equal(res.reason, 'task carries no plan');
  });

  // Case 6 — RED today: three answers, never two.
  it('6: the swap, the missing plan, and the no-plan task are three DISTINCT (fault, reason) pairs', () => {
    mkProject(root);
    const swap = actions.completeTaskPlan(root, root);
    const missing = actions.completeTaskPlan(root, 'ghost-plan');
    const none = actions.completeTaskPlan(root, '');
    const key = (r) => `${r.fault}::${r.reason}`;
    const keys = new Set([key(swap), key(missing), key(none)]);
    assert.equal(keys.size, 3, 'the three negative answers must be mutually distinguishable');
    assert.equal(swap.fault, 'caller');
    assert.equal(missing.fault, null);
    assert.equal(none.fault, null);
  });

  // Case 7 — GREEN before source: nothing became permissive.
  it('7: every negative answer refuses — ran:false, no plan moved, no evidence minted', () => {
    mkProject(root);
    for (const slug of [root, 'ghost-plan', '', '../evil']) {
      const res = actions.completeTaskPlan(root, slug);
      assert.equal(res.ran, false, `slug ${JSON.stringify(slug)} must not run a completion`);
    }
    assert.deepEqual(verifyDirFiles(root), [], 'no evidence artifact is ever minted for a refused completion');
    assert.deepEqual(fs.readdirSync(path.join(root, 'plans', 'review')), [], 'no plan moved to review');
  });

  // Case 8 — GREEN before source: the traversal guard is intact (refused before any fs access).
  it('8: traversal / NUL slugs are still refused (ran:false) with the unsafe-slug reason', () => {
    mkProject(root);
    for (const slug of ['../evil', 'a..b', 'x y']) {
      const res = actions.completeTaskPlan(root, slug);
      assert.equal(res.ran, false, `${JSON.stringify(slug)} must be refused`);
      assert.match(res.reason, /unsafe plan slug refused/, 'the traversal guard still fires');
    }
    assert.deepEqual(verifyDirFiles(root), [], 'a refused slug never reaches the filesystem to mint evidence');
  });

  // Case 12 — RED today: fault is always present on every return.
  it('12: every return from completeTaskPlan carries the fault key (never absent)', () => {
    mkProject(root);
    // no-plan, ghost (report), swap (caller), a blocked completion, and a success.
    const returns = [
      actions.completeTaskPlan(root, ''),
      actions.completeTaskPlan(root, 'ghost-plan'),
      actions.completeTaskPlan(root, root),
    ];
    // a blocked completion: a real plan missing a required step
    const blockedSlug = 'unfinished';
    seedPlan(root, 'in-progress', blockedSlug,
      planBody().replace(/### Step 16: FINAL-REVIEW\n- \[x\] Ready for human review\n/, ''));
    returns.push(actions.completeTaskPlan(root, blockedSlug));
    // a successful completion
    const okSlug = 'a-real-slice';
    seedPlan(root, 'in-progress', okSlug);
    returns.push(actions.completeTaskPlan(root, okSlug));

    for (const r of returns) {
      assert.ok(Object.prototype.hasOwnProperty.call(r, 'fault'),
        `a consumer must never distinguish absent from null; return was ${JSON.stringify(r)}`);
    }
  });

  // Case 13 — RED today: cross-platform path shapes are both detected.
  it('13: a Windows-shaped path and a POSIX path are both detected as path-shaped (fault:caller)', () => {
    const win = actions.completeTaskPlan(root, 'C:\\proj\\plan');
    const posix = actions.completeTaskPlan(root, '/proj/plan');
    assert.equal(win.fault, 'caller');
    assert.equal(posix.fault, 'caller');
    assert.match(win.reason, /looks like a path/i);
    assert.match(posix.reason, /looks like a path/i);
  });

  // Case 14 — GREEN before source: never throws.
  it('14: null / number / null-root inputs all return a verdict (never throw)', () => {
    assert.doesNotThrow(() => {
      const a = actions.completeTaskPlan(root, null);
      const b = actions.completeTaskPlan(root, 42);
      const c = actions.completeTaskPlan(null, null);
      assert.equal(a.ran, false);
      assert.equal(b.ran, false);
      assert.equal(c.ran, false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// the live menu route — fault:'caller' reports a bug in the call
// ═════════════════════════════════════════════════════════════════════════════

describe('menu task complete — a caller fault renders as a call bug, not a plan verdict', () => {
  // Case 9 — RED today: the live route reports a call bug for a swapped/path-shaped plan field.
  it('9: an implement task whose plan field is path-shaped completes as a CALL BUG, no plan-folder advice', () => {
    mkProject(root);
    const id = seedRunningImplement(root, '../../etc/passwd'); // a path-shaped registry plan field
    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'ok'], root);
    assert.equal(res.ok, false, 'a caller fault must not report success');
    assert.match(String(res.text), /call/i, 'the text reports a bug in the call');
    assert.doesNotMatch(String(res.text), /is in in-progress\/ or review\/|check the plan slug/i,
      'no remediation advice about the plan is offered for a caller fault');
    assert.equal(taskOf(root, id).status, 'running', 'the task is left unsettled');
    assert.deepEqual(verifyDirFiles(root), [], 'no evidence minted');
  });

  // Case 10 — a genuine missing-plan completion still reports the failure, now WITHOUT
  // a gate number. This assertion was INVERTED (not softened): it previously demanded
  // the message read "must produce Gate-3 evidence" word for word.
  //   (a) The contract from outside the test: the gate-number fence's whole reason to
  //       exist is that a gate number is an internal code the human reads as evasive;
  //       the fence caught this very string as a live leak (menu-screens.js:2423).
  //   (b) Why the test was wrong, not the code: it demanded the screen PRINT the exact
  //       number the fence forbids — it asserted the bug the fence exists to catch.
  //   (c) What newly fails: the doesNotMatch guard makes a gate digit RETURNING to this
  //       diagnostic a failing case, not a silent regression.
  it('10: an implement task with a missing plan slug reports the failure with NO gate number', () => {
    mkProject(root);
    const id = seedRunningImplement(root, 'ghost-plan');
    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'ok'], root);
    assert.equal(res.ok, false);
    assert.match(String(res.text), /An implement task must produce completion evidence/,
      'the missing-plan path names what the task must produce, without a gate number');
    assert.doesNotMatch(String(res.text), /\bGate[\s_-]*[0-3]\b/i,
      'no gate number may return to this diagnostic');
    assert.match(String(res.text), /in in-progress\/ or review\//);
    assert.equal(taskOf(root, id).status, 'running');
  });

  // Case 11 — GREEN before source: a real successful completion is untouched.
  it('11: a real completion still moves the plan to review, mints evidence, and settles the task', () => {
    mkProject(root);
    const slug = 'a-real-slice';
    const inProgress = seedPlan(root, 'in-progress', slug);
    const id = seedRunningImplement(root, slug);

    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'built it'], root);
    assert.equal(res.ok, true, `the happy path must still succeed, saw: ${res.error || ''}`);
    assert.ok(readVerifyEvidence(root, slug), 'evidence is produced');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'review', `${slug}.md`)), 'plan moved to review');
    assert.ok(!fs.existsSync(inProgress), 'plan left in-progress');
    assert.equal(taskOf(root, id).status, 'done', 'task settled');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// finding 3 — a silently-dropped unsafe dependency is RECORDED, not fixed
// ═════════════════════════════════════════════════════════════════════════════

/**
 * REPAIRED (plan 00145). `planDependsOn` used to silently drop unsafe dependency
 * slugs, so a plan whose `depends_on` was ENTIRELY unsafe tokens was byte-
 * indistinguishable from a plan with NO dependencies — the scheduler then treated it
 * as ready and ran it. Plan 00145 makes an unreadable dependency list FAIL CLOSED:
 * `taskSpecFromPlan` now THROWS on a refused token before resolving anything, so
 * "this plan's dependencies could not be read" no longer collapses into "this plan is
 * unblocked". This test asserts the repair at the real observable boundary; the
 * `depends_on: none` case still builds a spec with an empty blockedBy — the sentinel
 * is a declaration of no dependencies, not a fault.
 */
describe('finding 3 — an unreadable dependency list refuses the plan (repaired by plan 00145)', () => {
  function writePlan(name, { dependsOn }) {
    const p = path.join(root, 'plans', 'todo', `${name}.md`);
    fs.writeFileSync(p,
      '---\napproved_by: human\ngate_crossed: implementation → todo\n---\n\n' +
      `---\ntitle: "${name}"\ntype: implementation\ndepends_on: ${dependsOn}\n` +
      'files:\n  - "src/x.js"\n---\n\n# ' + name + '\n\nbody\n');
    return state.readPlans(path.join(root, 'plans', 'todo')).find((pl) => pl.name === name);
  }

  it('15: an all-unsafe depends_on REFUSES the plan; depends_on: none stays unblocked — the loss repaired', () => {
    for (const s of STAGES) fs.mkdirSync(path.join(root, 'plans', s), { recursive: true });

    // An unreadable dependency list now FAILS CLOSED — it throws instead of building a
    // spec with an empty blockedBy that let the scheduler run it.
    assert.throws(
      () => actions.taskSpecFromPlan(writePlan('all-unsafe', { dependsOn: '../evil ../../etc/passwd' }), root),
      /dependency list unreadable/,
      'unreadable deps refuse the plan — no longer silently dropped to no blocker',
    );

    // The none sentinel is a declaration of no dependencies, not a refusal.
    const noDeps = actions.taskSpecFromPlan(writePlan('no-deps', { dependsOn: 'none' }), root);
    assert.deepEqual(noDeps.blockedBy, [], 'a plan declaring no deps → no blocker');

    // Triangulation — a SAFE unknown dependency is refused with its OWN, distinct
    // message; only the wording differs, both fail closed.
    assert.throws(
      () => actions.taskSpecFromPlan(writePlan('safe-unknown', { dependsOn: 'ghost-dep' }), root),
      /Enqueue "ghost-dep"|depends on "ghost-dep"/,
      'a readable-but-unsatisfied dep still throws with today\'s wording',
    );
  });
});

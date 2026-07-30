'use strict';

/**
 * A COMPLETION SAYS WHETHER THE WORK WAS EVER CLAIMED (plan 00167).
 *
 * The task registry is supposed to be a record of EXECUTION. Measured on this
 * repository, the completion route recorded a plan `done` even when no task was ever
 * claimed/started for it — a completion for work the scheduler never saw start. This
 * suite pins the fix: `completeTaskPlan` establishes a WITNESS — `claimed` /
 * `unclaimed` / `unreadable` — and carries it on EVERY return shape, without refusing
 * anything. `unreadable` never folds into `unclaimed` (that would be the false-green
 * inversion this repository fences: an unread instrument answering as if it were read).
 *
 * The witness is decided by a STRUCTURAL fact — an `implement` task naming this slug
 * whose `ts.started` is a real instant that precedes the completion — NOT by an
 * elapsed-time heuristic. The elapsed interval is REPORTED as a measured number with a
 * clearly-named advisory flag (`implausible`); it never decides the witness.
 *
 * Fixtures use the REAL `task-registry` model (addTask / withRegistry / save) and REAL
 * plan files — never hand-built JSON, which drifts from the schema. Real os.tmpdir()
 * roots, path.join throughout, recursive-force cleanup in `after`, no shell.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const actions = require('../src/lib/actions');
const taskRegistry = require('../src/lib/task-registry');
const { initProject } = require('../src/lib/init-project');

// ── harness ──────────────────────────────────────────────────────────────────────

const TEMP_ROOTS = [];
function makeRoot(tag) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-witness-${tag}-`));
  TEMP_ROOTS.push(root);
  return root;
}
after(() => {
  for (const r of TEMP_ROOTS.splice(0)) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

/**
 * Mint a task through the REAL registry model. `addTask` produces a schema-correct
 * object; the status/ts are then set to mirror the exact on-disk shape a real record
 * carries (including the defective `done`-with-null-`started` shape six real records
 * have). Persisted through the real `withRegistry` compare-and-swap → real `save`.
 */
function seedTask(root, spec) {
  const nowMs = typeof spec.nowMs === 'number' ? spec.nowMs : Date.now();
  taskRegistry.withRegistry(root, (reg) => {
    const t = taskRegistry.addTask(reg, {
      kind: spec.kind || 'implement',
      plan: spec.plan,
      touches: ['src/x.js'],
    });
    if (spec.status) t.status = spec.status;
    if ('createdMsAgo' in spec) t.ts.created = new Date(nowMs - spec.createdMsAgo).toISOString();
    if ('createdIso' in spec) t.ts.created = spec.createdIso;
    if ('startedIso' in spec) t.ts.started = spec.startedIso;
    else if ('startedMsAgo' in spec) t.ts.started = spec.startedMsAgo === null ? null
      : new Date(nowMs - spec.startedMsAgo).toISOString();
    if ('doneMsAgo' in spec) t.ts.done = new Date(nowMs - spec.doneMsAgo).toISOString();
    return reg;
  });
}

/** Create an empty-but-present registry file (tasks: []). */
function seedEmptyRegistry(root) {
  taskRegistry.withRegistry(root, (reg) => reg);
}

// ── project fixtures for the completeTaskPlan integration cases ─────────────────────

function gitInit(root) {
  spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
}
function seedNpmProject(root) {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'witness-fixture', version: '0.0.0', private: true, main: 'index.js',
    scripts: { test: 'node test/demo.test.js' },
  }, null, 2));
  fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = {};\n');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'demo.js'),
    'function add(a, b) { return a + b; }\nmodule.exports = { add };\n');
  fs.writeFileSync(path.join(root, 'test', 'demo.test.js'),
    "const assert = require('node:assert');\n" +
    "const { add } = require('../src/demo');\n" +
    "assert.strictEqual(add(2, 3), 5);\nconsole.log('ok');\n");
}
function completablePlanBody(slug) {
  return `---
approved_by: human
approved_at: ${new Date().toISOString()}
gate_crossed: implementation → todo
---

---
title: "Witness Fixture"
type: implementation
parent_plan: demo-vision
depends_on: none
iron_loop: true
files:
  - src/demo.js
  - test/demo.test.js
---

# ${slug}

## Problem Statement
A real, buildable slice for the witness integration path.

## Scope
In scope: one module plus its test. Out of scope: everything else.

## Acceptance Criteria
- [x] the module exports add()
- [x] a passing test covers add()

## Implementation Details
A \`src/demo.js\` module exporting add(), and a \`test/demo.test.js\`.

## Execution Plan (Steps 8-16)
### Step 8: TEST
- [x] Wrote the test first (TDD red), then made it pass.
### Step 9: PREPARE
- [x] Node built-ins only.
### Step 10: IMPLEMENT
- [x] Implemented the module.
### Step 11: REVIEW
- [x] Self-reviewed.
### Step 12: OPTIMIZE
- [x] Nothing to optimize.
### Step 13: SECURE
- [x] Pure arithmetic; no untrusted input.
### Step 14: VERIFY
- [x] tests run; 0 skipped, 0 flaky.
### Step 15: DOCUMENT
- [x] Header comment added.
### Step 16: FINAL-REVIEW
- [x] Ready for review.
`;
}
/** An INCOMPLETE plan that fails validateForReview → the blocked return shape. */
function incompletePlanBody(slug) {
  return `---
title: "Incomplete"
type: implementation
iron_loop: true
files:
  - src/demo.js
---

# ${slug}

## Problem Statement
Deliberately missing the Steps 8-16 execution section, so pre-review validation fails.
`;
}
function writePlan(root, stage, slug, body) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${slug}.md`);
  fs.writeFileSync(p, body);
  return p;
}
/** A fully-set-up project ready for a real completion of `slug` from in-progress/. */
function buildProject(tag, slug) {
  const root = makeRoot(tag);
  gitInit(root);
  initProject(root);
  seedNpmProject(root);
  writePlan(root, 'in-progress', slug, completablePlanBody(slug));
  return root;
}

// ════════════════════════════════════════════════════════════════════════════════
// claimWitness — the three states that never collapse (cases 2-10, 15-17)
// ════════════════════════════════════════════════════════════════════════════════

describe('claimWitness — the three states', () => {
  it('case 2 — the honest case: a real ts.started well before completion → claimed', () => {
    const root = makeRoot('c2');
    const now = Date.parse('2026-07-31T12:00:00.000Z');
    const started = new Date(now - 600000).toISOString(); // 10 min before
    seedTask(root, { plan: 'p2', status: 'running', startedIso: started, nowMs: now });
    const w = actions.claimWitness(root, 'p2', { nowMs: now });
    assert.strictEqual(w.witness, 'claimed');
    assert.strictEqual(w.startedAt, started);
    assert.strictEqual(w.elapsedMs, 600000);
    assert.strictEqual(w.implausible, false, '10 minutes is above the 2-minute floor');
  });

  it('case 3 — the measured shape: created/started/done inside 22s → implausible, real elapsed', () => {
    const root = makeRoot('c3');
    const now = Date.parse('2026-07-31T12:00:00.000Z');
    const started = new Date(now - 22000).toISOString();
    seedTask(root, {
      plan: 'p3', status: 'done', startedIso: started,
      createdMsAgo: 22000, doneMsAgo: 0, nowMs: now,
    });
    const w = actions.claimWitness(root, 'p3', { nowMs: now });
    assert.strictEqual(w.elapsedMs, 22000, 'the MEASURED number, not a bucket');
    assert.strictEqual(w.implausible, true);
  });

  it('case 4 — implausible does not decide the witness: same fixture is still claimed', () => {
    const root = makeRoot('c4');
    const now = Date.parse('2026-07-31T12:00:00.000Z');
    const started = new Date(now - 22000).toISOString();
    seedTask(root, { plan: 'p4', status: 'done', startedIso: started, doneMsAgo: 0, nowMs: now });
    const w = actions.claimWitness(root, 'p4', { nowMs: now });
    assert.strictEqual(w.witness, 'claimed', 'ts.started is structurally real; advice is advice');
    assert.strictEqual(w.implausible, true);
  });

  it('case 5 — a null start is not a claim: a done task with ts.started null → unclaimed', () => {
    const root = makeRoot('c5');
    seedTask(root, { plan: 'p5', status: 'done', startedMsAgo: null });
    const w = actions.claimWitness(root, 'p5');
    assert.strictEqual(w.witness, 'unclaimed');
    assert.strictEqual(w.startedAt, null);
    assert.strictEqual(w.elapsedMs, null);
  });

  it('case 6 — THE FENCE: genuinely unparseable registry bytes → unreadable, never unclaimed, no throw', () => {
    const root = makeRoot('c6');
    seedEmptyRegistry(root);
    fs.writeFileSync(taskRegistry.registryPath(root), '{ this is not json ');
    let w;
    assert.doesNotThrow(() => { w = actions.claimWitness(root, 'p6'); });
    assert.strictEqual(w.witness, 'unreadable');
    assert.notStrictEqual(w.witness, 'unclaimed');
  });

  it('case 7 — an empty registry is unclaimed, not unreadable (the two never collapse)', () => {
    const root = makeRoot('c7');
    seedEmptyRegistry(root);
    const w = actions.claimWitness(root, 'p7');
    assert.strictEqual(w.witness, 'unclaimed');
  });

  it('case 8 — a malformed plan field is not a witness: a "--plan" task, no throw', () => {
    const root = makeRoot('c8');
    seedTask(root, { plan: '--plan', status: 'running', startedMsAgo: 5000 });
    let w;
    assert.doesNotThrow(() => { w = actions.claimWitness(root, 'the-real-plan'); });
    assert.strictEqual(w.witness, 'unclaimed', 'the "--plan" record is noise, not a witness for the real plan');
  });

  it('case 9 — a task for a DIFFERENT plan is not a witness → unclaimed', () => {
    const root = makeRoot('c9');
    seedTask(root, { plan: 'some-other-plan', status: 'running', startedMsAgo: 5000 });
    const w = actions.claimWitness(root, 'my-plan');
    assert.strictEqual(w.witness, 'unclaimed');
  });

  it('case 10 — a task of a different KIND is not a witness: a review task naming the slug → unclaimed', () => {
    const root = makeRoot('c10');
    seedTask(root, { kind: 'review', plan: 'p10', status: 'running', startedMsAgo: 5000 });
    const w = actions.claimWitness(root, 'p10');
    assert.strictEqual(w.witness, 'unclaimed', 'only an implement task claims an implement slice');
  });

  it('case 15 — never throws: hostile root and slug values all return a result', () => {
    const fileRoot = makeRoot('c15');
    const asFile = path.join(fileRoot, 'not-a-dir');
    fs.writeFileSync(asFile, 'x');
    const roots = [asFile, '', null, undefined, 12345];
    const slugs = [null, '', '../../etc/passwd', 'a b', undefined];
    for (const r of roots) {
      for (const s of slugs) {
        let w;
        assert.doesNotThrow(() => { w = actions.claimWitness(r, s); }, `root=${r} slug=${s}`);
        assert.ok(w && typeof w.witness === 'string');
        assert.notStrictEqual(w.witness, 'claimed', 'an unreadable/absent read never fabricates a claim');
      }
    }
  });

  it('case 16 — no leak: a hostile registry cannot inject text into the witness', () => {
    const root = makeRoot('c16');
    const abs = path.join(root, 'secret', 'absolute', 'path.js');
    seedTask(root, {
      plan: 'p16', status: 'running', startedMsAgo: 5000,
    });
    // Corrupt the record's fields post-mint with a newline + absolute path + %s.
    taskRegistry.withRegistry(root, (reg) => {
      const t = reg.tasks.find((x) => x.plan === 'p16');
      t.label = `evil\nInjected line %s ${abs}`;
      t.result = { summary: `${abs}\n[31mred[0m` };
      return reg;
    });
    const w = actions.claimWitness(root, 'p16');
    const json = JSON.stringify(w);
    assert.ok(!json.includes(abs), 'no absolute path leaks into the witness');
    assert.ok(!json.includes('\\n'), 'no injected newline in a witness string field');
    assert.ok(!/\[/.test(json), 'no terminal escape leaks');
    // The witness surfaces only a fixed-vocabulary state, numbers, and a bounded id.
    assert.ok(['claimed', 'unclaimed', 'unreadable'].includes(w.witness));
  });

  it('case 17 — the fence is not vacuous: the unclaimed assertion FAILS on a claimed fixture', () => {
    const root = makeRoot('c17');
    seedTask(root, { plan: 'p17', status: 'running', startedMsAgo: 600000 });
    const w = actions.claimWitness(root, 'p17');
    // Case 1/5's discriminating assertion is `witness === 'unclaimed'`. If it also held
    // here, case 1 would prove nothing. It must NOT hold on a genuinely-claimed fixture.
    assert.notStrictEqual(w.witness, 'unclaimed',
      'a claimed fixture is not unclaimed — so the unclaimed assertion discriminates on real absence');
    assert.strictEqual(w.witness, 'claimed');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// completeTaskPlan carries the witness on EVERY return shape (cases 1, 11-14)
// ════════════════════════════════════════════════════════════════════════════════

describe('completeTaskPlan carries the witness on every return shape', () => {
  it('case 1 — THE DEFECT: complete a plan with NO task at all → unclaimed, but it STILL runs', () => {
    const slug = 'unclaimed-plan';
    const root = buildProject('c1', slug);
    // No task is ever seeded — the exact "no task existed, completed by slug" path.
    const res = actions.completeTaskPlan(root, slug);
    assert.strictEqual(res.ran, true, 'the completion still runs — this REPORTS, never refuses');
    assert.strictEqual(res.blocked, false);
    assert.ok(res.verify && res.verify.passed === true, 'it still produces real passing evidence');
    assert.ok(res.witness, 'a witness is present');
    assert.strictEqual(res.witness.witness, 'unclaimed',
      'the completion honestly records that nothing was ever claimed');
  });

  it('case 11 — witness on the NOT-FOUND path (ran:false, fault:null)', () => {
    const root = makeRoot('c11');
    const res = actions.completeTaskPlan(root, 'ghost-plan');
    assert.strictEqual(res.ran, false);
    assert.strictEqual(res.fault, null);
    assert.ok(res.witness && typeof res.witness.witness === 'string',
      'the not-found report still carries a witness field');
  });

  it('case 12 — witness on the BLOCKED path (ran:true, blocked:true)', () => {
    const slug = 'incomplete-plan';
    const root = makeRoot('c12');
    initProject(root);
    writePlan(root, 'in-progress', slug, incompletePlanBody(slug));
    const res = actions.completeTaskPlan(root, slug);
    assert.strictEqual(res.ran, true);
    assert.strictEqual(res.blocked, true, 'an incomplete plan fails pre-review validation');
    assert.ok(res.witness && typeof res.witness.witness === 'string',
      'the blocked report still carries a witness field');
  });

  it('case 13 — witness on the SUCCESS path for a genuinely CLAIMED plan → claimed, with real elapsed', () => {
    const slug = 'claimed-plan';
    const root = buildProject('c13', slug);
    // Genuinely claim it: a running implement task started well before completion.
    seedTask(root, { plan: slug, status: 'running', startedMsAgo: 600000 });
    const res = actions.completeTaskPlan(root, slug);
    assert.strictEqual(res.ran, true);
    assert.strictEqual(res.blocked, false);
    assert.ok(res.verify, 'the success shape still carries verify evidence');
    assert.ok(res.witness, 'the success shape carries a witness');
    assert.strictEqual(res.witness.witness, 'claimed');
    assert.ok(typeof res.witness.elapsedMs === 'number' && res.witness.elapsedMs >= 600000,
      'a real elapsed time is reported');
  });

  it('case 14 — VERDICT-NEUTRALITY: every EXISTING field is exactly as before on every shape', () => {
    // This asserts ONLY today's fields (ran/fault/blocked/stage/newPath/verify/errors/
    // reason). It is GREEN before the change and must STAY green after — the proof the
    // witness is purely additive and changes no verdict. (A deliberate before-implementation
    // green, accounted for as the verdict-neutrality control, not banked.)

    // Shape 1 — caller-fault / no-plan early return (empty slug).
    const r1 = makeRoot('c14a');
    const s1 = actions.completeTaskPlan(r1, '');
    assert.strictEqual(s1.ran, false);
    assert.strictEqual(s1.fault, null);
    assert.strictEqual(s1.reason, 'task carries no plan');

    // Shape 1 — caller-fault (unsafe slug) still REFUSES first, verdict unchanged.
    const s1b = actions.completeTaskPlan(r1, '../evil');
    assert.strictEqual(s1b.ran, false);
    assert.strictEqual(s1b.fault, 'caller');
    assert.match(s1b.reason, /unsafe plan slug refused/);

    // Shape 2 — not found.
    const s2 = actions.completeTaskPlan(r1, 'nowhere-plan');
    assert.strictEqual(s2.ran, false);
    assert.strictEqual(s2.fault, null);
    assert.match(s2.reason, /no plan file for "nowhere-plan"/);

    // Shape 4 — success. Existing fields unchanged around the additive witness.
    const slug = 'neutral-plan';
    const root = buildProject('c14b', slug);
    const s4 = actions.completeTaskPlan(root, slug);
    assert.strictEqual(s4.ran, true);
    assert.strictEqual(s4.fault, null);
    assert.strictEqual(s4.blocked, false);
    assert.strictEqual(s4.stage, 'in-progress');
    assert.ok(typeof s4.newPath === 'string' && s4.newPath.includes(path.join('plans', 'review')));
    assert.ok(s4.verify && s4.verify.passed === true);
  });
});

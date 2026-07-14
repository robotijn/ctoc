'use strict';

/**
 * THE JOURNEY TEST — can a greenfield human cross Gate 3 without an override?
 *
 * ROOT CAUSE THIS CLOSES (2026-07-14). `completeExecution` in src/lib/actions.js
 * is the ONLY producer of the Gate-3 VERIFY evidence, the app-launch last-mile
 * check, and the task/plan coupling — and it had ZERO callers. The executor agent
 * moved its plan to review/ with a raw file move instead. Gate 3
 * (`validateReviewToDone`) correctly fails CLOSED when no evidence exists, so the
 * only exit a human had was "Approve anyway" — an override, once per slice. The
 * wave hardened the lock and never cut the key.
 *
 * This test drives the REAL machinery end to end — the real `menu task complete`
 * route, the real completeExecution, the real runVerify, the real
 * validateReviewToDone. NOTHING is mocked: if the wiring is absent, Gate 3 is
 * un-passable and this test fails.
 *
 * The load-bearing assertion is J1(d): `validateReviewToDone(...).valid === true`
 * on evidence produced by the completion itself. That is Gate 3 crossable WITHOUT
 * an override.
 *
 * Fail-closed is equally load-bearing: J2 proves a FAILING verify writes honest
 * `passed:false` evidence and Gate 3 still refuses the plan. The fence must not be
 * a rubber stamp.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = require('../src/lib/menu-screens');
const taskRegistry = require('../src/lib/task-registry');
const { validateReviewToDone, validateForReview } = require('../src/lib/plan-validator');
const { readVerifyEvidence } = require('../src/lib/step-13-verify');
const { invalidate } = require('../src/lib/cache');

// ── harness ────────────────────────────────────────────────────────────────

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-lastmile-'));
  invalidate(); // the read cache is process-global; a fresh tmp root must not see stale counts
});
afterEach(() => {
  invalidate();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

function mkProject(r) {
  for (const s of STAGES) fs.mkdirSync(path.join(r, 'plans', s), { recursive: true });
  fs.mkdirSync(path.join(r, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(r, 'src'), { recursive: true });
  fs.writeFileSync(path.join(r, 'src', 'thing.js'), 'module.exports = 1;\n');
  // R4-A: a REAL project — a package.json whose test script actually runs and
  // passes — so "verify passed" MEANS something verified. `main` makes it a
  // library (no app to launch), keeping the app-run last-mile out of the way so
  // the signal under test is the real quality gate.
  fs.writeFileSync(path.join(r, 'package.json'), JSON.stringify({
    name: 'a-real-slice', version: '1.0.0', main: 'src/thing.js',
    scripts: { test: 'node -e "process.exit(0)"' }
  }, null, 2));
}

/** A bare project with NO toolchain at all — nothing verify could run. */
function mkBareProject(r) {
  for (const s of STAGES) fs.mkdirSync(path.join(r, 'plans', s), { recursive: true });
  fs.mkdirSync(path.join(r, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(r, 'src'), { recursive: true });
  fs.writeFileSync(path.join(r, 'src', 'thing.js'), 'module.exports = 1;\n');
}

/**
 * A plan that a real executor would leave behind at the end of Step 16: it crossed
 * Gate 2 (so it carries the human-approval marker), declares its files, and has
 * every required Iron Loop step present and TICKED. The ONLY thing it is missing is
 * the VERIFY evidence artifact — which only a real completion run can produce.
 */
function planBody() {
  return `---
approved_by: human
approved_at: 2026-07-14T10:00:00.000Z
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

/** Seed a plan file at a stage. Returns its absolute path. */
function seedPlan(r, stage, slug, body) {
  const p = path.join(r, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, body == null ? planBody() : body);
  return p;
}

/** Seed a RUNNING implement task for a plan. Returns its id. */
function seedRunningImplement(r, slug) {
  const reg = taskRegistry.load(r);
  const t = taskRegistry.addTask(reg, { kind: 'implement', plan: slug, touches: ['src/thing.js'] });
  taskRegistry.updateTask(reg, t.id, { status: 'running' });
  taskRegistry.save(r, reg);
  return t.id;
}

function taskOf(r, id) {
  return taskRegistry.load(r).tasks.find((t) => t.id === id);
}

// ═════════════════════════════════════════════════════════════════════════════
// J1 — THE JOURNEY: completion produces evidence, Gate 3 opens WITHOUT override
// ═════════════════════════════════════════════════════════════════════════════

describe('THE LAST MILE — `menu task complete` runs the real completion', () => {
  it('J1: an implement completion produces evidence, moves the plan, settles the task, and Gate 3 PASSES without an override', () => {
    mkProject(root);
    const slug = 'a-real-slice';
    const inProgress = seedPlan(root, 'in-progress', slug);
    const id = seedRunningImplement(root, slug);

    // Precondition (the defect): with no evidence, Gate 3 is CLOSED on this plan.
    // (It sits in in-progress here, but validateReviewToDone reads the file + the
    // evidence artifact, and the artifact does not exist yet.)
    const before = validateReviewToDone(inProgress, root);
    assert.equal(before.valid, false, 'precondition: no evidence yet → Gate 3 must refuse');
    assert.ok(
      before.errors.some((e) => /VERIFY evidence/i.test(e)),
      `precondition: the refusal is the missing evidence, saw: ${before.errors.join(' | ')}`
    );

    // Precondition: the plan itself is otherwise review-ready (so a later failure
    // is about the wiring, never about a malformed fixture).
    const pre = validateForReview(inProgress, root);
    assert.equal(pre.valid, true, `fixture must be review-valid, saw: ${pre.errors.join(' | ')}`);

    // THE ACT — the real route the menu drives on a background-task completion.
    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'built it'], root);
    assert.equal(res.ok, true, `completion must succeed, saw: ${res.error || ''}`);

    // (a) VERIFY evidence exists, produced by a REAL runVerify execution.
    const evidence = readVerifyEvidence(root, slug);
    assert.ok(evidence, 'the completion must PRODUCE .ctoc/state/verify/<slug>.json');
    assert.equal(evidence.planSlug, slug);
    assert.equal(evidence.passed, true, `verify must pass on a clean project, saw: ${evidence.summary}`);
    assert.ok(fs.existsSync(path.join(root, '.ctoc', 'state', 'verify', `${slug}.json`)));

    // (b) the plan moved in-progress → review (by the completion, not by an agent's
    //     raw file move).
    const reviewPath = path.join(root, 'plans', 'review', `${slug}.md`);
    assert.ok(fs.existsSync(reviewPath), 'the plan must be in review/');
    assert.ok(!fs.existsSync(inProgress), 'the plan must have LEFT in-progress/');

    // (c) the task is settled.
    assert.equal(taskOf(root, id).status, 'done');

    // (d) THE ASSERTION THE WHOLE SLICE EXISTS FOR: Gate 3 is now passable on real
    //     evidence — no "Approve anyway", no override, no hand-written artifact.
    const gate3 = validateReviewToDone(reviewPath, root);
    assert.equal(
      gate3.valid,
      true,
      'Gate 3 must be crossable WITHOUT an override once the completion has run. ' +
      `Errors: ${gate3.errors.join(' | ')}`
    );
    assert.equal(gate3.checklist.verifyEvidence.present, true);
    assert.equal(gate3.checklist.verifyEvidence.passed, true);
    assert.equal(gate3.checklist.verifyEvidence.stale, false);
  });

  it('J2: a FAILING verify writes honest passed:false evidence and Gate 3 STILL refuses (fail-closed preserved)', () => {
    mkProject(root);
    // A real, failing quality gate: a package.json whose lint script exits non-zero.
    // No mock — runVerify's fallback path actually spawns it. `main` keeps the
    // app-runner's shape detection on "library" (applicable:false), so the failure
    // under test is unambiguously the lint failure.
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      name: 'tmp-fixture',
      version: '1.0.0',
      main: 'src/thing.js',
      scripts: { lint: 'node -e "process.exit(1)"' }
    }, null, 2));

    const slug = 'a-failing-slice';
    seedPlan(root, 'in-progress', slug);
    const id = seedRunningImplement(root, slug);

    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'built it'], root);
    assert.equal(res.ok, true, 'a failing VERIFY still completes the task — the plan lands in review with HONEST evidence');

    const evidence = readVerifyEvidence(root, slug);
    assert.ok(evidence, 'evidence must exist even when verify fails');
    assert.equal(evidence.passed, false, 'a failing quality gate must record passed:false — never a rubber stamp');
    assert.ok(evidence.errors.length > 0, 'the failure detail must be recorded');

    const reviewPath = path.join(root, 'plans', 'review', `${slug}.md`);
    assert.ok(fs.existsSync(reviewPath));
    const gate3 = validateReviewToDone(reviewPath, root);
    assert.equal(gate3.valid, false, 'Gate 3 must REFUSE a plan whose recorded VERIFY run failed');
    assert.ok(
      gate3.errors.some((e) => /VERIFY run failed/i.test(e)),
      `the refusal must name the failed verify run, saw: ${gate3.errors.join(' | ')}`
    );
  });

  it('J3: a plan an agent already moved to review/ is completed idempotently — evidence is produced, nothing throws', () => {
    mkProject(root);
    const slug = 'already-moved';
    seedPlan(root, 'review', slug); // the executor's old raw move, or a re-run
    const id = seedRunningImplement(root, slug);

    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'moved itself'], root);
    assert.equal(res.ok, true, 'a plan that already moved must not WEDGE the completion');
    assert.equal(taskOf(root, id).status, 'done');

    const evidence = readVerifyEvidence(root, slug);
    assert.ok(evidence, 'the completion still produces the evidence for an already-moved plan');
    assert.equal(evidence.passed, true);

    const reviewPath = path.join(root, 'plans', 'review', `${slug}.md`);
    assert.ok(fs.existsSync(reviewPath), 'the plan stays in review/');
    assert.equal(validateReviewToDone(reviewPath, root).valid, true, 'Gate 3 opens for it too');
  });

  it('J4: a plan that FAILS pre-review validation is REFUSED — it does not sneak to review, and the task stays running', () => {
    mkProject(root);
    const slug = 'unfinished-slice';
    // A REQUIRED step is absent entirely (Step 16 FINAL-REVIEW) → validateForReview
    // errors. This is a kickback, not a completion.
    const body = planBody().replace(/### Step 16: FINAL-REVIEW\n- \[x\] Ready for human review\n/, '');
    const inProgress = seedPlan(root, 'in-progress', slug, body);
    const id = seedRunningImplement(root, slug);

    // Precondition: the fixture really does fail the pre-review gate.
    assert.equal(validateForReview(inProgress, root).valid, false, 'fixture precondition');

    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'shipping it anyway'], root);
    assert.equal(res.ok, false, 'a plan that cannot pass pre-review validation must NOT complete');
    assert.ok(/validation/i.test(String(res.error)), `the refusal must name validation, saw: ${res.error}`);

    assert.ok(fs.existsSync(inProgress), 'the plan stays in in-progress/');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'review', `${slug}.md`)), 'it never reaches review/');
    assert.equal(readVerifyEvidence(root, slug), null, 'no evidence is fabricated for a plan that failed validation');
    assert.equal(taskOf(root, id).status, 'running', 'the task is NOT marked done — the work is not done');
  });

  it('J4b: an unchecked required step passes the PRE-REVIEW gate but Gate 3 still REFUSES it (the gate is the backstop)', () => {
    // The two gates are deliberately asymmetric: `validateForReview` treats a
    // present-but-unchecked step as a WARNING (the plan may still enter review, where
    // a human looks at it), while `validateReviewToDone` promotes that same unchecked
    // required box to a BLOCKING error. Pin both halves so neither can silently drift
    // into rubber-stamping the other.
    mkProject(root);
    const slug = 'unticked-verify';
    const body = planBody().replace('- [x] Lint, types, all tests green', '- [ ] Lint, types, all tests green');
    seedPlan(root, 'in-progress', slug, body);
    const id = seedRunningImplement(root, slug);

    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'built it'], root);
    assert.equal(res.ok, true, 'pre-review validation permits an unchecked box (it is a warning there)');

    const reviewPath = path.join(root, 'plans', 'review', `${slug}.md`);
    assert.ok(fs.existsSync(reviewPath), 'the plan reaches review for a human to look at');
    assert.ok(readVerifyEvidence(root, slug), 'real evidence is still produced');

    const gate3 = validateReviewToDone(reviewPath, root);
    assert.equal(gate3.valid, false, 'Gate 3 REFUSES a plan with an unchecked required step');
    assert.ok(
      gate3.errors.some((e) => /unchecked required checkbox/i.test(e)),
      `the refusal must name the unchecked box, saw: ${gate3.errors.join(' | ')}`
    );
  });

  it('J5: a non-implement task completes registry-only; an implement task with NO plan file is REFUSED (C7 — no evidence-less success)', () => {
    mkProject(root);

    // A review-kind task: completion is registry-only; it must not run a plan completion.
    const reg = taskRegistry.load(root);
    const r1 = taskRegistry.addTask(reg, { kind: 'review', plan: 'whatever' });
    taskRegistry.updateTask(reg, r1.id, { status: 'running' });
    taskRegistry.save(root, reg);
    const rRes = ms.route(['menu', 'task', 'complete', r1.id, '--summary', 'ok'], root);
    assert.equal(rRes.ok, true, 'a non-implement task still completes registry-only (its plan field names a non-plan)');
    assert.equal(taskOf(root, r1.id).status, 'done');
    assert.equal(readVerifyEvidence(root, 'whatever'), null, 'a review task produces no plan evidence');

    // C7 (corrected contract): an IMPLEMENT task whose plan file is nowhere on disk is a
    // mis-slugged or hand-moved plan. Settling it done with ZERO evidence used to report
    // ok:true — the "dead-producer defect wearing a success message". It is now REFUSED and
    // the task is left UNSETTLED so a human notices, instead of a clean-looking non-completion.
    const id = seedRunningImplement(root, 'ghost-plan');
    const gRes = ms.route(['menu', 'task', 'complete', id, '--summary', 'ok'], root);
    assert.equal(gRes.ok, false, 'an implement task with no plan file no longer reports a phantom success');
    assert.equal(gRes.blocked, true, 'it is a kickback shape, not a completion');
    assert.match(String(gRes.error), /no plan file|evidence/i);
    assert.equal(taskOf(root, id).status, 'running', 'the task stays running (unsettled) — not falsely done');
  });

  it('J6: a hostile task.plan cannot escape plans/ — and an implement task with an unresolvable plan is REFUSED (C7), not falsely done', () => {
    mkProject(root);
    const reg = taskRegistry.load(root);
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: '../../etc/passwd', touches: ['src/thing.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running' });
    taskRegistry.save(root, reg);

    const res = ms.route(['menu', 'task', 'complete', t.id, '--summary', 'ok'], root);
    // The traversal slug is refused BEFORE any path.join (completeTaskPlan's slug guard), so
    // completion never runs → ran:false → C7 refuses the whole complete. The task stays
    // running; NO evidence artifact is minted for a hostile slug.
    assert.equal(res.ok, false, 'a traversal slug degrades safely AND does not report a phantom success');
    assert.equal(taskOf(root, t.id).status, 'running', 'the task is left unsettled, never falsely done');
    const verifyDir = path.join(root, '.ctoc', 'state', 'verify');
    const written = fs.existsSync(verifyDir) ? fs.readdirSync(verifyDir) : [];
    assert.deepEqual(written, [], 'a traversal slug must produce NO evidence artifact at all');
  });

  it('J7: a project with NO verifiable toolchain produces passed:false evidence and Gate 3 REFUSES it', () => {
    // The vacuity complement to J1. A completion on a project where NOTHING could
    // run must NOT mint a passing artifact — it records passed:false with the
    // no-verifiable-toolchain reason, and Gate 3 correctly refuses. This is the
    // exact fail-open R4-A closes: no manifest used to yield {passed:true}.
    mkBareProject(root);
    const slug = 'no-toolchain-slice';
    seedPlan(root, 'in-progress', slug);
    const id = seedRunningImplement(root, slug);

    const res = ms.route(['menu', 'task', 'complete', id, '--summary', 'nothing to verify'], root);
    assert.equal(res.ok, true, 'the completion still runs and records honest evidence');

    const evidence = readVerifyEvidence(root, slug);
    assert.ok(evidence, 'evidence must exist even when nothing could be verified');
    assert.equal(evidence.passed, false, 'no verifiable toolchain must record passed:false — never a vacuous pass');
    assert.ok(
      evidence.errors.some((e) => /no-verifiable-toolchain/i.test(e)),
      `the evidence must name the vacuity; saw: ${JSON.stringify(evidence.errors)}`
    );

    const reviewPath = path.join(root, 'plans', 'review', `${slug}.md`);
    assert.ok(fs.existsSync(reviewPath));
    const gate3 = validateReviewToDone(reviewPath, root);
    assert.equal(gate3.valid, false, 'Gate 3 must REFUSE a plan whose VERIFY verified nothing');
  });
});

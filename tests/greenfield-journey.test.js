'use strict';

/**
 * THE GREENFIELD JOURNEY TEST — walk the seam line a human walks.
 *
 * The false-green audit's deepest structural finding (finding #8): NO test drives
 * the full greenfield path a human takes from `initProject` to a verified, shipped
 * change. Every dead seam this session found — a zero-caller `completeExecution`, a
 * VERIFY that passed on nothing, a forged ledger, an unenforced scheduler ladder —
 * shipped GREEN because the suite tests that each seam is SHAPED right, never that a
 * human walking from init to a working app CROSSES every seam. Each dead seam was
 * individually green and no test walked the seam line. This test walks it, so the
 * next dead seam fails HERE instead of in an audit three weeks later.
 *
 * ── THE SEAMS THIS JOURNEY DRIVES (each through its REAL entry point) ──────────────
 *   1. INIT           initProject(root) — .ctoc/ + settings + regulatory anchor +
 *                     plans/ scaffold, and NO placebo push/auto-move keys.
 *   2. GATE 1         approvePlan(functional → implementation) via stampAndLedger:
 *                     ledger entry written (stage_to=implementation), plan moved.
 *   3. GATE 2         approvePlan(implementation → todo) via stampAndLedger:
 *                     applyIronLoop no-op (iron_loop:true), ledger stage_to=todo.
 *   4. SCHEDULER      startAgent(force) → taskSpecFromPlan → addAndClaim: the FIFO
 *                     plan is claimed, moved to in-progress, a running implement task
 *                     is recorded. (Ladder serialization covered by a focused control.)
 *   5. COMPLETION     completeTaskPlan → completeExecution: validate, move to review,
 *                     settle the registry task, and RUN Step 14 VERIFY.
 *   6. VERIFY         persistVerifyResult → runVerify: a REAL `npm test` subprocess
 *                     runs; evidence persisted to .ctoc/state/verify/<slug>.json with
 *                     passed:true because a substantive check actually RAN.
 *   7. GATE 3         validateReviewToDone PASSES on that real evidence (no override);
 *                     approvePlan(review → done) crosses; ledger.verify(...)===true.
 *   8. END STATE      plan in done/, ledger entry present, built file exists, evidence
 *                     real. A human who walked this has a verified, shipped change.
 *
 * ── NEGATIVE CONTROLS (what makes the journey REAL, not a happy-path placebo) ──────
 *   A. no-evidence plan reaching review        → Gate 3 REFUSES ("no VERIFY evidence").
 *   B. plan whose test FAILS                    → verify passed:false → Gate 3 refuses.
 *   C. forged approval marker with no ledger    → ledger.verify()===false (marker text
 *                                                 alone never counts as approval).
 *   D. two plans declaring the SAME file        → scheduler serializes: second plan is
 *                                                 queued with reason 'file-conflict'.
 *   E. placebo assertion                        → a fresh init writes no `auto_push`,
 *                                                 no `autoMoveToReview`.
 *
 * ── MODEL BOUNDARIES (seeded, never faked) ────────────────────────────────────────
 * The steps that genuinely require a model — vision authoring (vision-advisor),
 * decomposition (vision-decomposer), implementation refinement (implementation-
 * planner) — are SEEDED as on-disk artifacts in the exact shape the downstream CODE
 * consumes: a vision plan in plans/vision/, and one fully-refined plan (iron_loop:
 * true, files: declared, Steps 8-16 complete) that travels the gate chain. The LLM is
 * NOT pretend-tested; the CODE seams (gates, ledger, verify, scheduler, completion)
 * are covered end-to-end. See the R5-A plan's "Decisions Taken Under Ambiguity".
 *
 * ── WIRING ────────────────────────────────────────────────────────────────────────
 * The harness lives HERE as local helpers, NOT as src/lib/journey-harness.js — a new
 * src/ file whose only caller is a test is a DEAD FILE under CTOC's reachability
 * fence, and the live wiring (a `ctoc doctor --journey` self-check off start.md) lands
 * outside this slice's declared files. See plan decision D1.
 */

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { initProject } = require('../src/lib/init-project');
const actions = require('../src/lib/actions');
const ledger = require('../src/lib/approval-ledger');
const { validateReviewToDone } = require('../src/lib/plan-validator');
const { readVerifyEvidence } = require('../src/lib/step-13-verify');
const taskRegistry = require('../src/lib/task-registry');

// ────────────────────────────────────────────────────────────────────────────────
// THE HARNESS (local helpers) — real fs, real git, real subprocess. No mocks of core
// logic. Every helper produces an OBSERVABLE artifact a human would see on disk.
// ────────────────────────────────────────────────────────────────────────────────

const TEMP_ROOTS = [];

/** Create an isolated temp project root under the OS temp dir (path.join, cross-platform). */
function makeTempRoot(tag) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-journey-${tag}-`));
  TEMP_ROOTS.push(root);
  return root;
}

/** Best-effort recursive teardown of every temp root this file created. */
function teardownAll() {
  for (const root of TEMP_ROOTS.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

// Teardown ONCE, after every top-level test in the file has finished. A per-test
// t.after() would fire when its own test resolved and — because node:test schedules
// top-level tests concurrently — could wipe a sibling's temp root mid-subprocess.
after(teardownAll);

/** Real `git init` in the temp dir (the real greenfield path initializes a repo). */
function gitInit(root) {
  const r = spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  return r.status === 0;
}

/**
 * Seed a REAL library-shaped npm project: `main` set, NO bin/dev/start, so the
 * app-launch last-mile check is honestly applicable:false. The `test` script runs the
 * declared test as a plain-node assertion script (NOT `node --test`): a nested
 * `node --test` child inherits `NODE_TEST_CONTEXT` from the outer runner and defers
 * its exit code, which would mask a real failure. A plain-node assertion runner
 * exits nonzero on a failed assertion deterministically, regardless of the parent.
 */
function seedNpmProject(root) {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    version: '0.0.0',
    private: true,
    main: 'index.js',
    scripts: { test: 'node test/demo-widget.test.js' }
  }, null, 2));
  fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = {};\n');
}

/**
 * Write the trivial REAL implementation the plan declares: a `src/demo-widget.js`
 * module and its declared test `test/demo-widget.test.js`. The test is a plain-node
 * assertion of the module's real behavior (add) — it throws (nonzero exit) on failure
 * and prints on success. `pass:false` makes the assertion genuinely fail (negative
 * control B), producing a real failing test suite that runVerify records as passed:false.
 */
function applyTrivialImplementation(root, { pass = true } = {}) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'demo-widget.js'),
    '// Demo widget built by the greenfield journey.\n' +
    'function add(a, b) { return a + b; }\nmodule.exports = { add };\n');
  const expected = pass ? 5 : 6; // pass:false asserts add(2,3)===6, a real failure
  fs.writeFileSync(path.join(root, 'test', 'demo-widget.test.js'),
    "const assert = require('node:assert');\n" +
    "const { add } = require('../src/demo-widget');\n" +
    `assert.strictEqual(add(2, 3), ${expected});\n` +
    "console.log('ok: add(2,3) ===', add(2, 3));\n");
}

/** The prepended human-approval marker block a real plan carries after a gate crossing. */
function approvalMarker(edge = 'implementation → todo') {
  return `---\napproved_by: human\napproved_at: ${new Date().toISOString()}\n` +
    `gate_crossed: ${edge}\n---\n\n`;
}

/** A seeded vision plan in the shape vision-advisor emits (MODEL BOUNDARY — content seeded). */
function visionPlanBody(slug) {
  return `---\ntitle: "Demo Vision"\ntype: vision\n---\n\n` +
    `# ${slug}\n\n## The Problem\nUsers need a demo widget.\n\n` +
    `## For Whom\nThe greenfield-journey walker.\n\n` +
    `## What Success Looks Like\nA verified, shipped widget.\n\n` +
    `## Scope\nWhat we're building: one module. What we're NOT: anything else.\n`;
}

/**
 * A fully-refined implementation-ready plan (MODEL BOUNDARY — the implementation-
 * planner's refinement is seeded). iron_loop:true so applyIronLoop is a no-op at
 * Gate 2; files: declared so taskSpecFromPlan accepts it; Steps 8-16 all complete and
 * acceptance criteria all checked so validateForReview / validateReviewToDone pass on
 * the REAL validators. `prepend` optionally stamps a prior-gate approval marker (real
 * plans in review/in-progress carry the Gate-2 marker in their body).
 */
function implPlanBody(slug, { prepend = '' } = {}) {
  return prepend +
`---
title: "Demo Widget"
type: implementation
parent_plan: demo-vision
depends_on: none
iron_loop: true
files:
  - src/demo-widget.js
  - test/demo-widget.test.js
---

# Demo Widget

## Problem Statement
The greenfield journey needs a real, buildable slice: a module and its test.

## Scope
In scope: one module plus its test. Out of scope: everything else.

## Acceptance Criteria
- [x] the widget module exports add()
- [x] a passing test covers add()

## Implementation Details
A \`src/demo-widget.js\` module exporting add(), and a \`test/demo-widget.test.js\`.

## Execution Plan (Steps 8-16)
### Step 8: TEST
- [x] Wrote the test first (TDD red), then made it pass.
### Step 9: PREPARE
- [x] Node built-ins only; no dependencies.
### Step 10: IMPLEMENT
- [x] Implemented the widget module.
### Step 11: REVIEW
- [x] Self-reviewed the change.
### Step 12: OPTIMIZE
- [x] Nothing to optimize.
### Step 13: SECURE
- [x] No untrusted input; pure arithmetic.
### Step 14: VERIFY
- [x] lint/typecheck/tests run; 0 skipped, 0 flaky.
### Step 15: DOCUMENT
- [x] Header comment added.
### Step 16: FINAL-REVIEW
- [x] Ready for review.
`;
}

/** Write a plan file into plans/<stage>/<slug>.md, creating the stage dir if needed. */
function writePlan(root, stage, slug, body) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${slug}.md`);
  fs.writeFileSync(p, body);
  return p;
}

const planPathOf = (root, stage, slug) => path.join(root, 'plans', stage, `${slug}.md`);
const exists = (p) => fs.existsSync(p);

// ────────────────────────────────────────────────────────────────────────────────
// THE JOURNEY — one temp project, init → build → done, asserting each seam.
// ────────────────────────────────────────────────────────────────────────────────

test('greenfield journey: init → gates → build → verify → done (every seam observable)', async () => {
  const root = makeTempRoot('happy');
  const slug = 'demo-widget';

  // ── SEAM 1: INIT ────────────────────────────────────────────────────────────────
  assert.ok(gitInit(root), 'git init should succeed in the temp project');
  const init = initProject(root);
  assert.strictEqual(init.success, true, 'initProject reports success');
  assert.ok(exists(path.join(root, '.ctoc')), '.ctoc/ exists after init');
  assert.ok(exists(path.join(root, 'plans', 'todo')), 'plans/todo scaffolded');
  assert.ok(exists(path.join(root, 'plans', 'in-progress')), 'plans/in-progress scaffolded');
  assert.ok(exists(path.join(root, 'CLAUDE.md')), 'CLAUDE.md rendered');

  const settings = fs.readFileSync(path.join(root, '.ctoc', 'settings.yaml'), 'utf8');
  // Regulatory anchor must exist from day one (the line-targeted compliance writer needs it).
  assert.match(settings, /regulatory_regime:/, 'settings carry the regulatory_regime anchor');
  assert.match(settings, /active_profiles:\s*\[\]/, 'active_profiles anchor present, empty by default');
  assert.match(settings, /enforcement:/, 'enforcement block present');
  // ── CONTROL E: PLACEBO — a fresh init writes no push/auto-move placebo keys. ──────
  assert.doesNotMatch(settings, /auto_push/i, 'no auto_push placebo key in fresh settings');
  assert.doesNotMatch(settings, /autoMoveToReview/i, 'no autoMoveToReview placebo key in fresh settings');

  // ── MODEL BOUNDARY: seed the vision (vision-advisor) + the refined plan (planner). ─
  const visionPath = writePlan(root, 'vision', 'demo-vision', visionPlanBody('demo-vision'));
  assert.ok(exists(visionPath) && visionPath.includes(path.join('plans', 'vision')),
    'seeded vision lands in plans/vision/ (the shape decompose consumes)');
  // The plan that will travel the gate chain starts in functional/ (post-decompose).
  const funcPath = writePlan(root, 'functional', slug, implPlanBody(slug));

  // ── SEAM 2: GATE 1 (functional → implementation) — real gated crossing + ledger. ──
  const g1 = actions.approvePlan(funcPath, root);
  assert.ok(g1.humanGate, 'Gate 1 is a human gate');
  assert.ok(exists(planPathOf(root, 'implementation', slug)), 'plan moved to implementation/');
  const led1 = ledger.readEntry(slug, root);
  assert.ok(led1 && led1.stage_to === 'implementation',
    'ledger entry written for Gate 1 (stage_to=implementation)');
  assert.strictEqual(ledger.entryKind(led1), 'human', 'Gate 1 ledger entry is human-kind');

  // ── SEAM 3: GATE 2 (implementation → todo) — real gated crossing + ledger. ────────
  const g2 = actions.approvePlan(planPathOf(root, 'implementation', slug), root);
  assert.ok(g2.humanGate, 'Gate 2 is a human gate');
  const todoPath = planPathOf(root, 'todo', slug);
  assert.ok(exists(todoPath), 'plan moved to todo/');
  const led2 = ledger.readEntry(slug, root);
  assert.strictEqual(led2.stage_to, 'todo', 'ledger updated for Gate 2 (stage_to=todo)');
  // The ledger hash must match the EXACT bytes now on disk in todo/ — the predicate
  // the gate hook enforces. A forged marker (control C) can never produce this.
  assert.ok(ledger.verify(slug, fs.readFileSync(todoPath, 'utf8'), 'todo', root),
    'ledger.verify() true for the todo-stage bytes (content-hash approval, not marker text)');

  // ── SEAM 4: SCHEDULER — startAgent claims the FIFO plan, moves it to in-progress. ─
  const started = actions.startAgent(root, { force: true });
  assert.strictEqual(started.started, true, 'startAgent claimed the todo plan (real scheduler)');
  assert.strictEqual(started.plan.name, slug, 'the claimed plan is our plan');
  assert.deepStrictEqual(started.skipped, [], 'no plan was skipped for a missing files: spec');
  assert.ok(exists(planPathOf(root, 'in-progress', slug)), 'plan moved to in-progress/');
  const claimedTask = taskRegistry.findActivePlanTask(taskRegistry.load(root), slug, 'implement');
  assert.ok(claimedTask && claimedTask.status === 'running',
    'a running implement task is recorded for the plan (scheduler claim)');

  // The agent does the REAL work: write the declared module + its passing test.
  seedNpmProject(root);
  applyTrivialImplementation(root, { pass: true });

  // ── SEAM 5+6: COMPLETION + VERIFY — completeTaskPlan → completeExecution → runVerify.
  const completion = actions.completeTaskPlan(root, slug);
  assert.strictEqual(completion.ran, true, 'completion ran');
  assert.strictEqual(completion.blocked, false, 'completion not blocked (plan passed validateForReview)');
  assert.ok(exists(planPathOf(root, 'review', slug)), 'plan moved to review/');
  assert.ok(completion.verify && completion.verify.passed === true,
    'Step 14 VERIFY produced REAL passing evidence (a substantive check ran)');

  const evidence = readVerifyEvidence(root, slug);
  assert.ok(evidence, 'verify evidence artifact persisted on disk');
  assert.strictEqual(evidence.passed, true, 'evidence records passed:true');
  assert.ok(evidence.checks && evidence.checks.tests && evidence.checks.tests.ran === true,
    'evidence proves the tests check actually RAN (not a vacuous pass on nothing)');
  // The completion coupled the task state machine to the plan state machine.
  const settledTask = taskRegistry.load(root).tasks.find((x) => x.id === claimedTask.id);
  assert.strictEqual(settledTask.status, 'done', 'the implement task was settled to done by the completion');

  // ── SEAM 7: GATE 3 — the gate PASSES on real evidence (no override), then crosses. ─
  const reviewPath = planPathOf(root, 'review', slug);
  const g3check = validateReviewToDone(reviewPath, root);
  assert.strictEqual(g3check.valid, true,
    `Gate 3 validates clean on real evidence — errors: ${g3check.errors.join('; ')}`);
  const g3 = actions.approvePlan(reviewPath, root);
  assert.ok(g3.humanGate, 'Gate 3 is a human gate');

  // ── SEAM 8: END STATE — a human who walked this has a verified, shipped change. ────
  const donePath = planPathOf(root, 'done', slug);
  assert.ok(exists(donePath), 'plan is in done/');
  const led3 = ledger.readEntry(slug, root);
  assert.strictEqual(led3.stage_to, 'done', 'ledger entry crossed to done');
  assert.ok(ledger.verify(slug, fs.readFileSync(donePath, 'utf8'), 'done', root),
    'ledger.verify() true for the done-stage bytes — real, current approval');
  assert.ok(exists(path.join(root, 'src', 'demo-widget.js')), 'the built module exists on disk');
});

// ────────────────────────────────────────────────────────────────────────────────
// CONTROL A — a plan reaching review with NO verify evidence → Gate 3 REFUSES.
// (Catches a dead completeExecution: no completion → no evidence → gate must refuse.)
// ────────────────────────────────────────────────────────────────────────────────

test('control A: no VERIFY evidence → Gate 3 refuses (not a vacuous pass)', () => {
  const root = makeTempRoot('noevidence');
  initProject(root);
  const slug = 'demo-widget';
  // A complete, human-marked plan sitting in review/, but NO evidence was ever minted.
  const reviewPath = writePlan(root, 'review', slug,
    implPlanBody(slug, { prepend: approvalMarker('implementation → todo') }));
  assert.strictEqual(readVerifyEvidence(root, slug), null, 'precondition: no evidence artifact');

  const res = validateReviewToDone(reviewPath, root);
  assert.strictEqual(res.valid, false, 'Gate 3 refuses a plan with no VERIFY evidence');
  assert.ok(res.errors.some((e) => /no VERIFY evidence/i.test(e)),
    `refusal names the missing evidence; got: ${res.errors.join('; ')}`);
});

// ────────────────────────────────────────────────────────────────────────────────
// CONTROL B — a plan whose test FAILS → verify passed:false → Gate 3 refuses.
// (Catches a vacuous VERIFY: a gate that opened on nothing would say passed:true.)
// ────────────────────────────────────────────────────────────────────────────────

test('control B: failing test → verify passed:false → Gate 3 refuses', () => {
  const root = makeTempRoot('failverify');
  gitInit(root);
  initProject(root);
  const slug = 'demo-widget';
  // A library-shaped project whose declared test suite genuinely FAILS.
  seedNpmProject(root);
  applyTrivialImplementation(root, { pass: false }); // declared files exist → no contradiction block
  // The plan is complete and human-marked, sitting in in-progress ready to complete.
  const inProgressPath = writePlan(root, 'in-progress', slug,
    implPlanBody(slug, { prepend: approvalMarker('implementation → todo') }));

  const completion = actions.completeTaskPlan(root, slug);
  assert.strictEqual(completion.ran, true, 'completion ran');
  assert.strictEqual(completion.blocked, false, 'plan passed pre-review validation');
  assert.ok(completion.verify && completion.verify.passed === false,
    'VERIFY honestly records passed:false when the real test suite fails');

  const reviewPath = planPathOf(root, 'review', slug);
  const res = validateReviewToDone(reviewPath, root);
  assert.strictEqual(res.valid, false, 'Gate 3 refuses a plan whose recorded VERIFY failed');
  assert.ok(res.errors.some((e) => /VERIFY run failed/i.test(e)),
    `refusal names the failed verify run; got: ${res.errors.join('; ')}`);
  void inProgressPath;
});

// ────────────────────────────────────────────────────────────────────────────────
// CONTROL C — a forged approval marker with NO ledger entry → ledger.verify()===false.
// (Catches a forged ledger / dead gate hook: marker TEXT alone must never count.)
// ────────────────────────────────────────────────────────────────────────────────

test('control C: hand-authored approval marker with no ledger entry is not approved', () => {
  const root = makeTempRoot('forged');
  initProject(root);
  const slug = 'demo-widget';
  // An agent squats done/ with a self-authored "approved_by: human" marker and no crossing.
  const donePath = writePlan(root, 'done', slug,
    implPlanBody(slug, { prepend: approvalMarker('review → done') }));

  assert.strictEqual(ledger.readEntry(slug, root), null,
    'no ledger entry exists for a plan that never crossed the real gate');
  assert.strictEqual(
    ledger.verify(slug, fs.readFileSync(donePath, 'utf8'), 'done', root), false,
    'ledger.verify() is false — a forged marker is not approval (content-hash truth)');
});

// ────────────────────────────────────────────────────────────────────────────────
// CONTROL D — two plans declaring the SAME file → scheduler serializes them.
// (Catches an unenforced scheduler ladder: without file-conflict both would claim.)
// ────────────────────────────────────────────────────────────────────────────────

test('control D: same-file plans serialize — second is queued with reason file-conflict', () => {
  const root = makeTempRoot('ladder');
  initProject(root);
  // Two todo plans, both declaring src/demo-widget.js (overlapping touches), each with
  // its Gate-2 marker + iron_loop so they are valid, claimable specs.
  const marker = approvalMarker('implementation → todo');
  writePlan(root, 'todo', 'plan-a', implPlanBody('plan-a', { prepend: marker }));
  writePlan(root, 'todo', 'plan-b', implPlanBody('plan-b', { prepend: marker }));

  // First wave: startAgent claims exactly one (FIFO), moving it to in-progress.
  const first = actions.startAgent(root, { force: true });
  assert.strictEqual(first.started, true, 'first plan claimed');
  const firstName = first.plan.name;

  // Second wave: the remaining same-file plan cannot claim a slot while the first's
  // task holds the shared file — the scheduler ladder queues it as 'file-conflict'.
  const second = actions.startAgent(root, { force: true });
  assert.strictEqual(second.started, false, 'second same-file plan is NOT started concurrently');
  assert.strictEqual(second.queued, true, 'second plan is recorded as queued, not lost');
  assert.strictEqual(second.reason, 'file-conflict',
    `the scheduler ladder serializes same-file plans; reason was: ${second.reason}`);
  assert.notStrictEqual(firstName, undefined, 'a first plan name was recorded');
});

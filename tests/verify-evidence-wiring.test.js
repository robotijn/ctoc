/**
 * VERIFY-evidence wiring (finding C9) — the live producer.
 *
 * Gate 3 (review->done, validateReviewToDone) REFUSES a plan unless a real VERIFY
 * evidence artifact exists at .ctoc/state/verify/<slug>.json. Before this wiring
 * the ONLY caller of the producer (persistVerifyResult) was a test — a live gate
 * with a dead producer, which forced a human to hand-fabricate the artifact and
 * trained evidence fabrication. This suite proves the MACHINERY now produces the
 * evidence: driving the REAL completeExecution on a REAL temp project writes a
 * REAL artifact (passed:true for a clean project, passed:false for a failing one).
 *
 * Zero doubles: no mocking. completeExecution, runVerify and persistVerifyResult
 * all run for real. The failing project uses a REAL package.json whose lint
 * script exits non-zero — a real failing tool invocation, not a stub.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const actions = require('../src/lib/actions');
const { verifyEvidencePath, readVerifyEvidence } = require('../src/lib/step-13-verify');

// The nine Iron Loop execution steps (labels are mandatory / validated).
const STEPS = [
  [8, 'TEST'], [9, 'PREPARE'], [10, 'IMPLEMENT'], [11, 'REVIEW'], [12, 'OPTIMIZE'],
  [13, 'SECURE'], [14, 'VERIFY'], [15, 'DOCUMENT'], [16, 'FINAL-REVIEW']
];

/** Render an "## Execution Plan" section; every checkbox ticked except uncheckedStep. */
function execPlan(uncheckedStep = null) {
  let out = '## Execution Plan\n\n';
  for (const [n, name] of STEPS) {
    const box = n === uncheckedStep ? '- [ ]' : '- [x]';
    out += `### Step ${n}: ${name}\n${box} ${name.toLowerCase()} work performed\n\n`;
  }
  return out;
}

/** Create a real CTOC project skeleton under a fresh temp dir. */
function makeProject(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const stage of ['in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  return root;
}

/** Write a fully-complete plan into plans/in-progress and return its path. */
function writeInProgressPlan(root, slug, { uncheckedStep = null } = {}) {
  const dir = path.join(root, 'plans', 'in-progress');
  const fm = ['---', 'title: "Fixture plan"', 'type: feature', '---', ''];
  const body = `# Fixture plan\n\nSome descriptive prose.\n\n${execPlan(uncheckedStep)}`;
  const planPath = path.join(dir, `${slug}.md`);
  fs.writeFileSync(planPath, `${fm.join('\n')}\n${body}`);
  return planPath;
}

describe('VERIFY-evidence wiring: completeExecution PRODUCES real evidence', () => {
  let root;

  before(() => { root = makeProject('ctoc-verify-wiring-'); });
  after(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } });

  it('a clean project: completeExecution writes a real passing artifact on disk', () => {
    const slug = 'clean-plan';
    const planPath = writeInProgressPlan(root, slug);

    // Precondition: no artifact exists yet — nothing hand-fabricated.
    assert.strictEqual(readVerifyEvidence(root, slug), null, 'no evidence before completion');

    const res = actions.completeExecution(planPath, root);

    assert.strictEqual(res.blocked, false,
      `completion should not be blocked; validation errors: ${JSON.stringify(res.validation && res.validation.errors)}`);

    // The MACHINERY wrote the evidence — not a human.
    const evidencePath = verifyEvidencePath(root, slug);
    assert.ok(fs.existsSync(evidencePath), 'evidence artifact must exist on disk after completion');

    const evidence = readVerifyEvidence(root, slug);
    assert.ok(evidence, 'evidence must be readable');
    assert.strictEqual(evidence.passed, true, 'clean project passes VERIFY via the no-toolchain fallback');
    assert.strictEqual(evidence.planSlug, slug);
    // A real run stamps a real method + a valid ISO timestamp (not fabricated).
    assert.strictEqual(evidence.method, 'fallback-direct');
    assert.strictEqual(new Date(evidence.timestamp).toISOString(), evidence.timestamp);
    // completeExecution surfaces the run to its caller.
    assert.ok(res.verify && res.verify.passed === true, 'completeExecution returns the verify result');
  });

  it('a failing project: completeExecution records passed:false so Gate 3 refuses it', () => {
    // A real package.json whose lint script exits non-zero → runVerify's fallback
    // runs a real tool that really fails. Not a stub.
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'failing-fixture',
        version: '1.0.0',
        scripts: { lint: 'node -e "process.exit(1)"' }
      }, null, 2)
    );

    const slug = 'failing-plan';
    const planPath = writeInProgressPlan(root, slug);

    const res = actions.completeExecution(planPath, root);

    // Per the honesty requirement: the plan may still move to review, but the
    // evidence must honestly record the failure so Gate 3 correctly refuses it.
    assert.strictEqual(res.blocked, false, 'a failing VERIFY does not block the move to review');

    const evidence = readVerifyEvidence(root, slug);
    assert.ok(evidence, 'evidence artifact must exist even for a failing run');
    assert.strictEqual(evidence.passed, false, 'failing lint must record passed:false');
    assert.ok(Array.isArray(evidence.errors) && evidence.errors.length > 0, 'failure detail must be recorded');
    assert.ok(res.verify && res.verify.passed === false, 'completeExecution reports the failing run');

    // Prove the gate consequence end-to-end: Gate 3 refuses the plan on the
    // machine-written failing evidence (the plan is now in plans/review).
    const { validateReviewToDone } = require('../src/lib/plan-validator');
    const reviewPath = path.join(root, 'plans', 'review', `${slug}.md`);
    assert.ok(fs.existsSync(reviewPath), 'plan should have moved to plans/review');
    const gate = validateReviewToDone(reviewPath, root);
    assert.strictEqual(gate.valid, false, 'Gate 3 must refuse a plan whose recorded VERIFY failed');
    assert.ok(
      gate.errors.some((e) => /VERIFY/i.test(e) && /fail/i.test(e)),
      `expected a VERIFY-failure rejection, got: ${JSON.stringify(gate.errors)}`
    );
  });
});

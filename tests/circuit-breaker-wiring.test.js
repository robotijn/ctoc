/**
 * Circuit-breaker wiring (finding C9) — the live counter + human escalation.
 *
 * CLAUDE.md promises: max 3 kickbacks to the same step, max 5 total per plan,
 * then escalate to the human. Before this wiring recordKickback/getEscalations
 * had zero live callers, so that promise was enforced NOWHERE and an overnight
 * pipeline could loop forever unseen. This suite drives the REAL live kickback
 * path — actions.completeExecution refusing to advance a plan out of execution —
 * and asserts the escalation is recorded AND reachable via getEscalations after
 * the 4th same-step kickback and the 6th total kickback.
 *
 * Zero doubles: no mocking. Every kickback is a real completeExecution call
 * against a real plan whose pre-review validation genuinely fails, so the counter
 * increments through the shipped code path, not a simulated one.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const actions = require('../src/lib/actions');
const circuitBreaker = require('../src/lib/circuit-breaker');

const STEPS = [
  [8, 'TEST'], [9, 'PREPARE'], [10, 'IMPLEMENT'], [11, 'REVIEW'], [12, 'OPTIMIZE'],
  [13, 'SECURE'], [14, 'VERIFY'], [15, 'DOCUMENT'], [16, 'FINAL-REVIEW']
];

// Render the execution section OMITTING `missingStep` entirely. validateForReview
// (the completeExecution gate) errors on an ABSENT required step — that absence is
// the real, blockable defect that makes the completion a kickback. failingStepFrom
// then keys the kickback on that lowest incomplete required step.
function execPlan(missingStep) {
  let out = '## Execution Plan\n\n';
  for (const [n, name] of STEPS) {
    if (n === missingStep) continue;
    out += `### Step ${n}: ${name}\n- [x] ${name.toLowerCase()} work performed\n\n`;
  }
  return out;
}

function makeProject(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(root, 'plans', 'in-progress'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  return root;
}

/**
 * Write (or rewrite) the plan body so exactly `uncheckedStep` is incomplete,
 * PRESERVING any existing leading frontmatter (which holds the accumulating
 * kickback_counts written by the circuit breaker on prior calls).
 */
function setFailingStep(planPath, slug, uncheckedStep) {
  let frontmatter = '---\ntitle: "Fixture plan"\ntype: feature\n---\n';
  if (fs.existsSync(planPath)) {
    const raw = fs.readFileSync(planPath, 'utf8');
    const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    if (m) frontmatter = m[0];
  }
  const body = `# Fixture plan\n\nSome descriptive prose.\n\n${execPlan(uncheckedStep)}`;
  fs.writeFileSync(planPath, frontmatter + '\n' + body);
}

describe('Circuit-breaker wiring: completeExecution records kickbacks + escalates', () => {
  let root;

  before(() => { root = makeProject('ctoc-cb-wiring-'); });
  after(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } });

  it('4th SAME-STEP kickback escalates through the live completeExecution path', () => {
    const slug = 'same-step-plan';
    const planPath = path.join(root, 'plans', 'in-progress', `${slug}.md`);
    // Step 10 is the lowest incomplete required step on every call → same key.
    setFailingStep(planPath, slug, 10);

    // Calls 1-3: blocked (a real kickback) but no escalation yet.
    for (let i = 1; i <= 3; i++) {
      const res = actions.completeExecution(planPath, root);
      assert.strictEqual(res.blocked, true, `call ${i} must be blocked (pre-review validation fails)`);
      assert.ok(res.kickback && res.kickback.recorded, `call ${i} must record a kickback`);
      assert.strictEqual(res.kickback.byStep, i, `call ${i}: byStep`);
      assert.strictEqual(res.kickback.escalation, null, `call ${i}: no escalation before the 4th`);
    }

    // 4th call: same-step escalation fires.
    const fourth = actions.completeExecution(planPath, root);
    assert.strictEqual(fourth.blocked, true);
    assert.ok(fourth.kickback.escalation, '4th same-step call must escalate');
    assert.strictEqual(fourth.kickback.escalation.type, 'same-step');
    assert.strictEqual(fourth.kickback.escalation.step, '10');
    assert.strictEqual(fourth.kickback.escalation.count, 4);

    // Reachable by the human: the durable escalation log surfaces it.
    const log = circuitBreaker.getEscalations(root);
    const sameStep = log.filter((e) => e.type === 'same-step' && e.plan === slug);
    assert.strictEqual(sameStep.length, 1, 'exactly one same-step escalation recorded + reachable');
    assert.strictEqual(sameStep[0].step, '10');
    assert.strictEqual(sameStep[0].count, 4);

    // The counter is physically persisted in the plan's frontmatter (survives a
    // process restart — the module holds no in-memory state).
    const counts = circuitBreaker.readKickbackCounts(planPath);
    assert.strictEqual(counts.by_step['10'], 4);
    assert.strictEqual(counts.total, 4);
  });

  it('6th TOTAL kickback escalates (per-plan) with no single step reaching 4', () => {
    const slug = 'per-plan';
    const planPath = path.join(root, 'plans', 'in-progress', `${slug}.md`);

    // Spread kickbacks across four required steps so none reaches 4, but the
    // total crosses 5 on the 6th call. Each entry is (failingStep, expectedTotal).
    const sequence = [
      [10, 1], [10, 2],   // step 10 → 2
      [11, 3], [11, 4],   // step 11 → 2  (total 4)
      [13, 5],            // step 13 → 1  (total 5)
      [14, 6]             // step 14 → 1  (total 6 → per-plan escalation)
    ];

    let last;
    for (let i = 0; i < sequence.length; i++) {
      const [failStep, expectedTotal] = sequence[i];
      setFailingStep(planPath, slug, failStep);
      const res = actions.completeExecution(planPath, root);
      assert.strictEqual(res.blocked, true, `call ${i + 1} blocked`);
      assert.strictEqual(res.kickback.total, expectedTotal, `call ${i + 1}: running total`);
      if (i < sequence.length - 1) {
        assert.strictEqual(res.kickback.escalation, null,
          `call ${i + 1} must not escalate (total ${expectedTotal}, no step at 4)`);
      }
      last = res;
    }

    // 6th total call escalates as per-plan (not same-step: no step hit 4).
    assert.ok(last.kickback.escalation, '6th total kickback must escalate');
    assert.strictEqual(last.kickback.escalation.type, 'per-plan');
    assert.strictEqual(last.kickback.escalation.total, 6);

    const log = circuitBreaker.getEscalations(root);
    const perPlan = log.filter((e) => e.type === 'per-plan' && e.plan === slug);
    assert.strictEqual(perPlan.length, 1, 'exactly one per-plan escalation recorded + reachable');
    assert.strictEqual(perPlan[0].total, 6);
    assert.strictEqual(log.filter((e) => e.type === 'same-step' && e.plan === slug).length, 0,
      'no same-step escalation: no single step reached 4');
  });
});

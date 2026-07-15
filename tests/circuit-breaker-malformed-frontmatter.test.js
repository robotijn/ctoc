/**
 * Circuit breaker — the WRITE path must tolerate exactly what the READ path
 * tolerates (finding: never-trips / infinite kickback the human never sees).
 *
 * The module promises "never throws … a corrupted count can never silently
 * suppress an escalation." The READ path (readKickbackCounts / recordKickback's
 * own read) guards yaml.load in try/catch → zeros. But writeCountsIntoText
 * re-parsed the same frontmatter with NO guard, so:
 *   - malformed frontmatter (unterminated quote) → yaml.load THROWS → the counter
 *     never persists → the breaker NEVER escalates → infinite kickback, unseen;
 *   - scalar frontmatter (a bare string) → `fmObject.kickback_counts = …` throws
 *     "Cannot create property on string" in strict mode.
 *
 * These tests drive both broken-frontmatter shapes through recordKickback and
 * assert the counter PERSISTS and the breaker ESCALATES — never frozen at 0 with
 * an empty escalations log. Plus a regression that valid frontmatter still trips
 * at the documented boundaries (by_step > 3, total > 5) — thresholds unchanged.
 *
 * Zero doubles: real temp files, the real recordKickback/getEscalations code path.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const circuitBreaker = require('../src/lib/circuit-breaker');
const actions = require('../src/lib/actions');

function makeRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(root, 'plans', 'in-progress'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  return root;
}

describe('Circuit breaker: the WRITE path tolerates what the READ path tolerates', () => {
  let root;
  before(() => { root = makeRoot('ctoc-cb-malformed-'); });
  after(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } });

  it('MALFORMED frontmatter (unterminated quote): 6 kickbacks persist + escalate, never frozen at 0', () => {
    const planPath = path.join(root, 'plans', 'in-progress', 'malformed.md');
    // `title: "Bad plan` is an unterminated double-quote → js-yaml load THROWS.
    fs.writeFileSync(planPath, '---\ntitle: "Bad plan\n---\n\n# body\n');

    let last;
    for (let i = 1; i <= 6; i++) {
      // MUST NOT throw and MUST report recorded:true — the pre-fix write path threw
      // here, freezing the counter at 0 and suppressing every escalation forever.
      last = circuitBreaker.recordKickback(planPath, 10, root);
      assert.strictEqual(last.recorded, true, `call ${i} must record (not throw / freeze at 0)`);
      assert.strictEqual(last.byStep, i, `call ${i}: byStep must climb`);
      assert.strictEqual(last.total, i, `call ${i}: total must climb`);
    }

    // The counter is physically persisted — NOT frozen at 0.
    const counts = circuitBreaker.readKickbackCounts(planPath);
    assert.strictEqual(counts.by_step['10'], 6, 'per-step counter persisted');
    assert.strictEqual(counts.total, 6, 'per-plan counter persisted');

    // The breaker ESCALATED (same-step fires on the 4th) and it is reachable.
    const log = circuitBreaker.getEscalations(root);
    const sameStep = log.filter((e) => e.type === 'same-step' && e.plan === 'malformed');
    assert.ok(sameStep.length >= 1, 'breaker escalated on the 4th same-step kickback');
    assert.strictEqual(sameStep[0].count, 4, 'escalation fired at count 4, not silently suppressed');
  });

  it('SCALAR frontmatter (a bare string): recordKickback does not throw; counter persists', () => {
    const planPath = path.join(root, 'plans', 'in-progress', 'scalar.md');
    // A frontmatter block whose YAML is a bare scalar (not a mapping).
    fs.writeFileSync(planPath, '---\njust a bare string\n---\n\n# body\n');

    // Pre-fix: `fmObject.kickback_counts = …` threw "Cannot create property on string".
    const res = circuitBreaker.recordKickback(planPath, 12, root);
    assert.strictEqual(res.recorded, true, 'scalar frontmatter must not throw');
    assert.strictEqual(res.byStep, 1);
    assert.strictEqual(res.total, 1);

    const counts = circuitBreaker.readKickbackCounts(planPath);
    assert.strictEqual(counts.by_step['12'], 1, 'counter persisted through a scalar block');
    assert.strictEqual(counts.total, 1);
  });

  it('REGRESSION: valid frontmatter still trips at the documented boundaries (by_step>3, total>5)', () => {
    // Same-step: escalates on the 4th kickback to one step.
    const stepPath = path.join(root, 'plans', 'in-progress', 'valid-samestep.md');
    fs.writeFileSync(stepPath, '---\ntitle: "Good plan"\ntype: feature\n---\n\n# body\n');
    for (let i = 1; i <= 3; i++) {
      const r = circuitBreaker.recordKickback(stepPath, 10, root);
      assert.strictEqual(r.escalation, null, `call ${i}: no escalation before the 4th`);
    }
    const fourth = circuitBreaker.recordKickback(stepPath, 10, root);
    assert.ok(fourth.escalation, '4th same-step call escalates');
    assert.strictEqual(fourth.escalation.type, 'same-step');
    assert.strictEqual(fourth.escalation.count, 4);

    // Per-plan: escalates on the 6th total kickback with no single step reaching 4.
    const planPath = path.join(root, 'plans', 'in-progress', 'valid-perplan.md');
    fs.writeFileSync(planPath, '---\ntitle: "Good plan"\ntype: feature\n---\n\n# body\n');
    const seq = [10, 10, 11, 11, 13, 14]; // no step hits 4; total crosses 5 on #6
    let last;
    for (let i = 0; i < seq.length; i++) {
      last = circuitBreaker.recordKickback(planPath, seq[i], root);
      if (i < seq.length - 1) {
        assert.strictEqual(last.escalation, null, `call ${i + 1}: no escalation yet`);
      }
    }
    assert.ok(last.escalation, '6th total kickback escalates');
    assert.strictEqual(last.escalation.type, 'per-plan');
    assert.strictEqual(last.escalation.total, 6);
  });

  it('a breaker that CANNOT record its own count HARD-escalates (recorded:false surfaces to the human)', () => {
    // A plan file that does not exist → recordKickback's (unguarded) readFileSync
    // throws → recordStepKickback returns recorded:false. That failure must ITSELF
    // escalate to the human, never silently loop.
    const missing = path.join(root, 'plans', 'in-progress', 'ghost.md');
    const res = actions.recordStepKickback(missing, 10, root);
    assert.strictEqual(res.recorded, false, 'a missing plan cannot record a count');

    const log = circuitBreaker.getEscalations(root);
    const hard = log.filter((e) => e.type === 'breaker-failure' && e.plan === 'ghost');
    assert.strictEqual(hard.length, 1, 'a breaker failure must escalate, never silently continue');
  });
});

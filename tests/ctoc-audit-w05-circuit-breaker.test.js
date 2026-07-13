'use strict';

/**
 * W05-s5 — Circuit breaker: persisted, escalating kickback counters.
 *
 * Zero test doubles. Every case uses a REAL temp project directory, a REAL plan
 * `.md` file with real YAML frontmatter, the real `js-yaml` parser, and a real
 * `.ctoc/logs/escalations.json`. No mocking. A "process restart" is simulated by
 * calling `recordKickback` again — the module holds no in-memory counter — and by
 * re-reading the plan file from disk.
 *
 * Threshold rule under test (resolved in the slice plan): escalate on EXCEEDING
 * the documented maximum — same-step at the 4th (`by_step[step] > 3`), per-plan
 * at the 6th (`total > 5`).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const circuitBreaker = require('../src/lib/circuit-breaker');

// ── Helpers ─────────────────────────────────────────────────────────────────

const PLAN_BODY = [
  '',
  '# W05-s5 sample plan',
  '',
  'Some body text that must survive byte-for-byte across kickback writes.',
  '',
  '- [ ] a checkbox',
  ''
].join('\n');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cb-'));
  const planPath = path.join(root, 'sample-plan.md');
  const frontmatter = ['---', 'title: "W05-s5 sample plan"', 'type: feature', '---'].join('\n');
  fs.writeFileSync(planPath, frontmatter + '\n' + PLAN_BODY, 'utf8');
  return { root, planPath };
}

function readFirstFrontmatter(planPath) {
  const raw = fs.readFileSync(planPath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, 'plan should have a leading frontmatter block on disk');
  return yaml.load(match[1]) || {};
}

// ── Case 1: M7 — same-step escalates on the 4th, not before ──────────────────

test('M7: same-step kickback escalates on the 4th, not on 1-3', () => {
  const { root, planPath } = makeProject();

  for (let i = 1; i <= 3; i++) {
    const r = circuitBreaker.recordKickback(planPath, '10', root);
    assert.strictEqual(r.escalation, null, `call ${i} must not escalate`);
    assert.strictEqual(r.byStep, i, `byStep after call ${i}`);
    assert.strictEqual(r.total, i, `total after call ${i}`);
  }

  const fourth = circuitBreaker.recordKickback(planPath, '10', root);
  assert.ok(fourth.escalation, '4th same-step call must escalate');
  assert.strictEqual(fourth.escalation.type, 'same-step');
  assert.strictEqual(fourth.escalation.step, '10');
  assert.strictEqual(fourth.escalation.count, 4);
  assert.strictEqual(fourth.byStep, 4);

  const log = circuitBreaker.getEscalations(root);
  const sameStep = log.filter((e) => e.type === 'same-step');
  assert.strictEqual(sameStep.length, 1, 'exactly one same-step escalation logged');
  assert.strictEqual(sameStep[0].step, '10');
  assert.strictEqual(sameStep[0].count, 4);
});

// ── Case 2: M8 — per-plan escalates on the 6th across ≥2 steps ────────────────

test('M8: per-plan kickback escalates on the 6th across two steps, no single step at 4', () => {
  const { root, planPath } = makeProject();

  const sequence = ['10', '10', '10', '11', '11', '11'];
  const results = sequence.map((step) => circuitBreaker.recordKickback(planPath, step, root));

  for (let i = 0; i < 5; i++) {
    assert.strictEqual(results[i].escalation, null, `call ${i + 1} must not escalate`);
  }

  const sixth = results[5];
  assert.ok(sixth.escalation, '6th total call must escalate');
  assert.strictEqual(sixth.escalation.type, 'per-plan');
  assert.strictEqual(sixth.escalation.total, 6);

  // Neither step ever reached 4, so no same-step escalation may have fired.
  const log = circuitBreaker.getEscalations(root);
  assert.strictEqual(log.filter((e) => e.type === 'same-step').length, 0, 'no same-step escalation');
  assert.strictEqual(log.filter((e) => e.type === 'per-plan').length, 1, 'exactly one per-plan escalation');
});

// ── Case 3: counter is physically persisted in the plan frontmatter ──────────

test('counter is persisted in the plan frontmatter on disk', () => {
  const { root, planPath } = makeProject();

  circuitBreaker.recordKickback(planPath, '10', root);
  circuitBreaker.recordKickback(planPath, '10', root);

  const fm = readFirstFrontmatter(planPath);
  assert.ok(fm.kickback_counts, 'kickback_counts present in frontmatter');
  assert.strictEqual(fm.kickback_counts.by_step['10'], 2);
  assert.strictEqual(fm.kickback_counts.total, 2);
});

// ── Case 4: readKickbackCounts on a fresh plan → zeros, no throw ──────────────

test('readKickbackCounts on a plan without a counter returns zeros without throwing', () => {
  const { planPath } = makeProject();

  const counts = circuitBreaker.readKickbackCounts(planPath);
  assert.deepStrictEqual(counts.by_step, {});
  assert.strictEqual(counts.total, 0);
});

// ── Case 5: M9 — persistence across a simulated restart ──────────────────────

test('M9: kickback counts survive a simulated process restart', () => {
  const { root, planPath } = makeProject();

  // Record 3 kickbacks to step 10 — none escalate (3 is not > 3).
  for (let i = 0; i < 3; i++) {
    const r = circuitBreaker.recordKickback(planPath, '10', root);
    assert.strictEqual(r.escalation, null, `pre-restart call ${i + 1} must not escalate`);
  }

  // Simulate a restart: the module has no in-memory state, so a fresh call
  // must load the count from disk. If the restart had reset the count, this
  // 4th call would be the 1st and return null.
  const afterRestart = circuitBreaker.recordKickback(planPath, '10', root);
  assert.ok(afterRestart.escalation, 'the 4th record (post-restart) must escalate');
  assert.strictEqual(afterRestart.escalation.type, 'same-step');
  assert.strictEqual(afterRestart.byStep, 4, 'count survived the restart (4, not 1)');
});

// ── Case 6: falsy step throws, plan file unchanged ───────────────────────────

test('recordKickback rejects a falsy step and leaves the plan unchanged', () => {
  const { root, planPath } = makeProject();
  const before = fs.readFileSync(planPath, 'utf8');

  assert.throws(() => circuitBreaker.recordKickback(planPath, '', root), /step required/);

  const after = fs.readFileSync(planPath, 'utf8');
  assert.strictEqual(after, before, 'plan file must be byte-identical after a rejected call');
});

// ── Case 7: frontmatter body + other keys preserved ──────────────────────────

test('recording preserves the plan body and other frontmatter keys byte-for-byte', () => {
  const { root, planPath } = makeProject();
  const before = fs.readFileSync(planPath, 'utf8');

  circuitBreaker.recordKickback(planPath, '14', root);

  const after = fs.readFileSync(planPath, 'utf8');

  // The body below the frontmatter must be untouched.
  const bodyOf = (raw) => raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
  assert.strictEqual(bodyOf(after), bodyOf(before), 'plan body must be preserved');

  // Other frontmatter keys must be preserved.
  const fm = readFirstFrontmatter(planPath);
  assert.strictEqual(fm.title, 'W05-s5 sample plan');
  assert.strictEqual(fm.type, 'feature');
  assert.strictEqual(fm.kickback_counts.by_step['14'], 1);
});

// ── Case 8: prototype-pollution guard on step key ────────────────────────────

test('recordKickback rejects a prototype-pollution step key', () => {
  const { root, planPath } = makeProject();
  const before = fs.readFileSync(planPath, 'utf8');

  assert.throws(() => circuitBreaker.recordKickback(planPath, '__proto__', root), /step/i);

  const after = fs.readFileSync(planPath, 'utf8');
  assert.strictEqual(after, before, 'plan file unchanged after a rejected polluting key');
  // Global Object prototype must not have been polluted.
  assert.strictEqual({}.total, undefined);
});

// ── Case 9: no leading frontmatter → counter block is prepended ──────────────

test('recordKickback prepends a frontmatter block when the plan has none', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cb-'));
  const planPath = path.join(root, 'no-frontmatter.md');
  const body = '# Plain plan\n\nNo frontmatter here.\n';
  fs.writeFileSync(planPath, body, 'utf8');

  const r = circuitBreaker.recordKickback(planPath, '10', root);
  assert.strictEqual(r.byStep, 1);
  assert.strictEqual(r.total, 1);

  const fm = readFirstFrontmatter(planPath);
  assert.strictEqual(fm.kickback_counts.by_step['10'], 1);

  const raw = fs.readFileSync(planPath, 'utf8');
  assert.ok(raw.includes('# Plain plan'), 'original body preserved after prepend');
});

// ── Case 10: getEscalations on a project with no log → empty array ───────────

test('getEscalations returns an empty array when no escalation has been logged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cb-'));
  assert.deepStrictEqual(circuitBreaker.getEscalations(root), []);
});

// ── Case 11: same-step precedence when both thresholds trip together ─────────

test('same-step escalation takes precedence over per-plan on a single call', () => {
  const { root, planPath } = makeProject();

  // Drive step 10 to 3 and step 11 to 2 → total 5, no escalation yet.
  ['10', '10', '10', '11', '11'].forEach((s) => {
    const r = circuitBreaker.recordKickback(planPath, s, root);
    assert.strictEqual(r.escalation, null);
  });

  // 6th call to step 10: by_step['10'] → 4 (>3) AND total → 6 (>5).
  // Same-step must win.
  const r = circuitBreaker.recordKickback(planPath, '10', root);
  assert.ok(r.escalation);
  assert.strictEqual(r.escalation.type, 'same-step', 'same-step wins the tie');
  assert.strictEqual(r.escalation.count, 4);
});

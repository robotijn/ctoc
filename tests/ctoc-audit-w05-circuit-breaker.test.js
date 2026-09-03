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
 * Persistence under test: the counter lives in `.ctoc/state/kickbacks/<slug>.json`,
 * NOT in the plan file. The plan file is never written by the breaker, because the
 * approval ledger hashes the plan's frontmatter in full (it carries `files:`, the
 * write-surface grant) — a counter written there revoked the build's own permission.
 * Every case that used to assert the frontmatter location now asserts the sidecar
 * PLUS whole-file byte-identity, which is strictly stronger.
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

/** The kickback sidecar for a plan, parsed. Fails loudly when it is absent. */
function readSidecar(root, slug) {
  const p = path.join(root, '.ctoc', 'state', 'kickbacks', `${slug}.json`);
  assert.ok(fs.existsSync(p), `kickback sidecar must exist at ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Write a plan carrying a pre-existing frontmatter counter (the migration input). */
function makeProjectWithFrontmatterCounts(counterYaml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cb-'));
  const planPath = path.join(root, 'sample-plan.md');
  fs.writeFileSync(planPath, counterYaml, 'utf8');
  return { root, planPath };
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

// ── Case 3: counter is persisted in the SIDECAR; the plan is never written ────

test('counter is persisted in the sidecar and the plan file is byte-identical', () => {
  const { root, planPath } = makeProject();
  const before = fs.readFileSync(planPath);

  circuitBreaker.recordKickback(planPath, '10', root);
  circuitBreaker.recordKickback(planPath, '10', root);

  // Whole-file byte-identity is strictly stronger than the old "the frontmatter
  // contains a kickback_counts key": it admits no write to the plan at all, which
  // is the property the approval hash depends on.
  assert.deepStrictEqual(fs.readFileSync(planPath), before,
    'the breaker wrote no byte of the plan file');

  const sidecar = readSidecar(root, 'sample-plan');
  assert.strictEqual(sidecar.by_step['10'], 2);
  assert.strictEqual(sidecar.total, 2);
});

// ── Case 4: readKickbackCounts on a fresh plan → zeros, no throw ──────────────

test('readKickbackCounts on a plan without a counter returns zeros without throwing', () => {
  const { root, planPath } = makeProject();

  const counts = circuitBreaker.readKickbackCounts(planPath, root);
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

// ── Case 7: the WHOLE plan file is preserved, not merely the body + some keys ─

test('recording preserves the ENTIRE plan file byte-for-byte', () => {
  const { root, planPath } = makeProject();
  const before = fs.readFileSync(planPath);

  circuitBreaker.recordKickback(planPath, '14', root);

  // Stronger than the old body-plus-selected-keys check, which permitted the
  // frontmatter to be re-serialised as long as title/type survived. Nothing in
  // this file may move — key order, quoting and whitespace included.
  assert.deepStrictEqual(fs.readFileSync(planPath), before,
    'the whole plan file is byte-identical after a kickback');

  // The other frontmatter keys are still readable, and carry NO counter.
  const fm = readFirstFrontmatter(planPath);
  assert.strictEqual(fm.title, 'W05-s5 sample plan');
  assert.strictEqual(fm.type, 'feature');
  assert.strictEqual(fm.kickback_counts, undefined, 'no counter is written into the plan');

  assert.strictEqual(readSidecar(root, 'sample-plan').by_step['14'], 1);
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

// ── Case 9: a plan with NO frontmatter is counted and is STILL not written ────

test('recordKickback counts a plan with no frontmatter without writing it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cb-'));
  const planPath = path.join(root, 'no-frontmatter.md');
  const body = '# Plain plan\n\nNo frontmatter here.\n';
  fs.writeFileSync(planPath, body, 'utf8');

  const r = circuitBreaker.recordKickback(planPath, '10', root);
  assert.strictEqual(r.byStep, 1);
  assert.strictEqual(r.total, 1);

  // The old contract PREPENDED a frontmatter block here — a write to a file the
  // breaker has no business editing. Nothing may be prepended now: the file is
  // byte-identical to what was written above.
  assert.strictEqual(fs.readFileSync(planPath, 'utf8'), body,
    'a plan with no frontmatter gains none — the breaker writes no plan file');

  assert.strictEqual(readSidecar(root, 'no-frontmatter').by_step['10'], 1);
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

// ── Case 12: migration — an existing frontmatter count is honoured ────────────

const FM_WITH_FIVE = [
  '---',
  'title: "W05-s5 sample plan"',
  'kickback_counts:',
  '  by_step:',
  '    "10": 5',
  '  total: 5',
  '---',
  ''
].join('\n') + PLAN_BODY;

test('migration: a pre-existing frontmatter counter seeds the sidecar and is never rewritten', () => {
  const { root, planPath } = makeProjectWithFrontmatterCounts(FM_WITH_FIVE);
  const before = fs.readFileSync(planPath);

  // The 6th total kickback lands on a fresh step, so per-plan (not same-step) trips.
  const res = circuitBreaker.recordKickback(planPath, '12', root);
  assert.strictEqual(res.total, 6, 'the running total resumes from the frontmatter, not from 0');
  assert.ok(res.escalation, 'the 6th total kickback escalates');
  assert.strictEqual(res.escalation.type, 'per-plan');

  assert.deepStrictEqual(fs.readFileSync(planPath), before,
    'the stale frontmatter counter is READ, never written back');

  const sidecar = readSidecar(root, 'sample-plan');
  assert.strictEqual(sidecar.total, 6, 'the sidecar now carries the migrated total');
  assert.strictEqual(sidecar.by_step['10'], 5, 'the migrated per-step counts come along');
  assert.strictEqual(sidecar.by_step['12'], 1);
});

test('migration works through a PREPENDED approval block that hides the counter deeper', () => {
  // The shape a human-gate crossing produces: a counter-less block on top.
  const prepended =
    '---\napproved_by: human\napproved_at: 2026-07-16T00:00:00.000Z\n' +
    'gate_crossed: implementation → todo\n---\n\n' + FM_WITH_FIVE;
  const { root, planPath } = makeProjectWithFrontmatterCounts(prepended);

  const res = circuitBreaker.recordKickback(planPath, '12', root);
  assert.strictEqual(res.total, 6,
    'the max-across-blocks fold still finds the orphaned counter during migration');
  assert.strictEqual(res.escalation.type, 'per-plan');
});

// ── Case 13: an unreadable sidecar counts AND surfaces — never silent ─────────

function writeSidecarRaw(root, slug, text) {
  const dir = path.join(root, '.ctoc', 'state', 'kickbacks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${slug}.json`), text, 'utf8');
}

test('an UNPARSEABLE sidecar does not silence the breaker — it counts from the plan and escalates its own failure', () => {
  const { root, planPath } = makeProjectWithFrontmatterCounts(FM_WITH_FIVE);
  writeSidecarRaw(root, 'sample-plan', '{ not json');

  const res = circuitBreaker.recordKickback(planPath, '12', root);
  // Returning zeros for a record we could not trust would suppress every future
  // escalation. The frontmatter floor keeps the count honest.
  assert.strictEqual(res.total, 6, 'the count continues from the frontmatter floor');
  assert.ok(res.escalation, 'the escalation still fires');
  assert.strictEqual(res.escalation.type, 'per-plan');

  const failures = circuitBreaker.getEscalations(root)
    .filter((e) => e.type === 'breaker-failure' && e.plan === 'sample-plan');
  assert.strictEqual(failures.length, 1,
    'a degraded breaker says so — a corrupt counter reaches the human');
});

test('a sidecar that PARSES but is shaped wrong is treated as unreadable, not as zeros', () => {
  const { root, planPath } = makeProjectWithFrontmatterCounts(FM_WITH_FIVE);
  writeSidecarRaw(root, 'sample-plan', JSON.stringify({ total: 'lots' }));

  const res = circuitBreaker.recordKickback(planPath, '12', root);
  assert.strictEqual(res.total, 6, 'a nonsense total must not reset the count to zero');
  assert.strictEqual(res.escalation.type, 'per-plan');

  const failures = circuitBreaker.getEscalations(root)
    .filter((e) => e.type === 'breaker-failure' && e.plan === 'sample-plan');
  assert.strictEqual(failures.length, 1, 'the malformed record is surfaced, not swallowed');
});

// ── Case 14: readKickbackCounts refuses to answer without a project root ──────

test('readKickbackCounts THROWS without a project root rather than returning a false zero', () => {
  const { planPath } = makeProject();

  // Without a root the sidecar cannot be found, and answering "0" for a plan with
  // six kickbacks is the false-zero class this repository fences.
  assert.throws(() => circuitBreaker.readKickbackCounts(planPath), /projectPath required/);
  assert.throws(() => circuitBreaker.readKickbackCounts(planPath, ''), /projectPath required/);
});

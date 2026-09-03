/**
 * Circuit breaker — dark-branch + trip-boundary coverage (targets the lines the
 * existing suite leaves uncovered, plus the mutation-killing TRIP decisions).
 *
 * The two existing circuit-breaker suites (circuit-breaker-wiring.test.js and
 * circuit-breaker-malformed-frontmatter.test.js) drive the LIVE completeExecution
 * path and the malformed-WRITE path. They deliberately leave four fail-safe
 * branches dark, and they never pin the same-step-OVER-per-plan PRECEDENCE nor
 * the "no escalation reached the human before the exact trip" guard. This suite
 * closes exactly those gaps:
 *
 *   - readKickbackCounts on an ABSENT plan file        (read fail-safe: zeros, never a throw)
 *   - readKickbackCounts on MALFORMED frontmatter YAML (yaml fail-safe, hit DIRECTLY —
 *       not via recordKickback's own separate yaml guard)
 *   - the SIDECAR write failing (its directory is a file) → temp-unlink-and-rethrow
 *   - an `ok` sidecar read alongside a plan whose YAML will not parse
 *   - appendEscalation when `.ctoc/logs` is a FILE     → src line 222-223 (mkdir catch)
 *   - recordBreakerFailure swallowing that write throw → src line 323-324 (fail-safe-of-fail-safe)
 *
 * TRIP DECISIONS (each assertion goes RED under mutation of the threshold logic):
 *   - same-step > 3 (the 4th), NOT >= 3: the 3rd is safe, the 4th trips
 *   - per-plan  > 5 (the 6th), NOT >= 5: the 5th is safe, the 6th trips
 *   - same-step takes PRECEDENCE over per-plan when both trip on one call (272 beats 280)
 *   - a breaker that trips EARLY (before the boundary) is caught by the empty-log guard
 *
 * Zero doubles: real os.tmpdir() fixtures, the real shipped code path. The only
 * boundary faked is the filesystem (real temp files), which is legitimate.
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const circuitBreaker = require('../src/lib/circuit-breaker');

// ── Fixtures ────────────────────────────────────────────────────────────────
const roots = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cb-cov-'));
  fs.mkdirSync(path.join(root, 'plans', 'in-progress'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  roots.push(root);
  return root;
}

function writePlan(root, name, rawText) {
  const planPath = path.join(root, 'plans', 'in-progress', name);
  fs.writeFileSync(planPath, rawText);
  return planPath;
}

const VALID_FM = '---\ntitle: "Fixture plan"\ntype: feature\n---\n\n# body\n';

after(() => {
  for (const root of roots) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

// ── Read fail-safes (dark lines 131-132, 139-140) ───────────────────────────

describe('Circuit breaker readKickbackCounts: fail-safe reads never throw, zero out', () => {
  it('readKickbackCounts_returns_zeros_when_plan_file_is_absent', () => {
    // Arrange — a path that does not exist (safeFs.readFileSync will throw ENOENT).
    const root = makeRoot();
    const missing = path.join(root, 'plans', 'in-progress', 'does-not-exist.md');

    // Act
    const counts = circuitBreaker.readKickbackCounts(missing, root);

    // Assert — the read-error catch (src 131-132) returns clean zeros, never throws.
    // A mutant that drops the try/catch would throw here instead of returning zeros.
    assert.deepStrictEqual(counts, { by_step: {}, total: 0 });
  });

  it('readKickbackCounts_returns_zeros_when_frontmatter_yaml_is_malformed', () => {
    // Arrange — frontmatter block present (regex matches) but its YAML is an
    // unterminated double-quote, so yaml.load THROWS inside readKickbackCounts.
    // This hits the reader's OWN yaml catch (src 139-140), distinct from the
    // recordKickback yaml guard the malformed-write suite exercises.
    const root = makeRoot();
    const planPath = writePlan(root, 'bad-yaml.md', '---\ntitle: "unterminated\n---\n\n# body\n');

    // Act
    const counts = circuitBreaker.readKickbackCounts(planPath, root);

    // Assert — malformed YAML reads as zeros (fail-safe), NEVER a non-zero count
    // that could suppress a future escalation, and never a throw.
    assert.deepStrictEqual(counts, { by_step: {}, total: 0 });
  });
});

// ── Fail-safe-of-the-fail-safe (dark lines 222-223, 323-324) ────────────────

describe('Circuit breaker recordBreakerFailure: the HARD-escalation logger never masks the original error', () => {
  it('recordBreakerFailure_does_not_throw_when_logs_path_is_a_file', () => {
    // Arrange — `.ctoc/logs` exists as a FILE, not a directory. Inside
    // appendEscalation: mkdirSync(logsDir) throws EEXIST (caught at src 222-223),
    // then writeFileSync(logPath) throws ENOTDIR and propagates OUT of
    // appendEscalation — which recordBreakerFailure must swallow (src 323-324).
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.ctoc', 'logs'), 'i am a file, not a directory');

    // Act + Assert — the contract is "Never throws … a logging failure here must
    // not mask the original error." A mutant removing recordBreakerFailure's catch
    // would let the ENOTDIR escape → this goes RED.
    assert.doesNotThrow(() =>
      circuitBreaker.recordBreakerFailure(root, { plan: 'ghost', step: 10, error: 'boom' })
    );

    // And nothing corrupt was persisted — the unwritable log still reads as empty.
    assert.deepStrictEqual(circuitBreaker.getEscalations(root), []);
  });
});

// ── Trip boundaries + precedence (mutation kills) ───────────────────────────

describe('Circuit breaker recordKickback: trip decisions at the exact boundary', () => {
  it('same_step_does_not_trip_on_the_3rd_and_per_plan_does_not_trip_on_the_5th_then_6th_total_escalates', () => {
    // Arrange — spread 5 kickbacks so the busiest step reaches EXACTLY 3 (the
    // documented same-step max) and the total reaches EXACTLY 5 (the per-plan
    // max). Neither boundary is EXCEEDED, so nothing may escalate yet.
    const root = makeRoot();
    const planPath = writePlan(root, 'boundary.md', VALID_FM);
    // Ordered so the LAST kickback lands on the busiest step (10), which reaches
    // exactly 3 — so `res` reflects the step sitting on the same-step boundary.
    const belowThreshold = [11, 11, 10, 10, 10]; // step 11 → 2, step 10 → 3, total → 5

    // Act + Assert — walk to the boundary; every call stays quiet.
    let res;
    for (let i = 0; i < belowThreshold.length; i++) {
      res = circuitBreaker.recordKickback(planPath, belowThreshold[i], root);
      assert.equal(res.escalation, null,
        `call ${i + 1}: no escalation at or below the boundary (step<=3, total<=5)`);
    }
    assert.equal(res.byStep, 3, 'busiest step sits at exactly the same-step max (3), not tripping');
    assert.equal(res.total, 5, 'total sits at exactly the per-plan max (5), not tripping');

    // The human has seen NOTHING yet — a breaker that trips EARLY (>= instead of >)
    // would have logged an escalation by now; this guard makes that mutant RED.
    assert.deepStrictEqual(circuitBreaker.getEscalations(root), []);

    // The 6th total kickback (to a fresh step, so no single step reaches 4) crosses
    // per-plan (> 5) and escalates as per-plan — NOT same-step.
    const sixth = circuitBreaker.recordKickback(planPath, 12, root);
    assert.equal(sixth.total, 6);
    assert.ok(sixth.escalation, 'the 6th total kickback must escalate');
    assert.equal(sixth.escalation.type, 'per-plan');
    assert.equal(sixth.escalation.total, 6);
  });

  it('same_step_trips_on_the_4th_and_takes_precedence_over_per_plan_when_both_thresholds_exceed', () => {
    // Arrange — kick the SAME step repeatedly. The 4th exceeds the same-step max;
    // by the 6th the per-plan max (5) is ALSO exceeded, so both conditions hold on
    // one call and the precedence branch (src 272 `if` beats 280 `else if`) decides.
    const root = makeRoot();
    const planPath = writePlan(root, 'same-step.md', VALID_FM);

    // Act + Assert — the 4th is the first same-step trip (> 3, not >= 3).
    let res;
    for (let i = 1; i <= 3; i++) {
      res = circuitBreaker.recordKickback(planPath, 10, root);
      assert.equal(res.escalation, null, `call ${i}: same-step must not trip before the 4th`);
    }
    const fourth = circuitBreaker.recordKickback(planPath, 10, root);
    assert.ok(fourth.escalation, 'the 4th same-step kickback trips');
    assert.equal(fourth.escalation.type, 'same-step');
    assert.equal(fourth.escalation.count, 4);

    // 5th and 6th: on the 6th, total = 6 (> 5) AND byStep = 6 (> 3). Same-step must
    // WIN. A mutant that reorders the branches (per-plan first) reports 'per-plan'
    // here → RED. The distinct value (count vs total) makes the winner unambiguous.
    circuitBreaker.recordKickback(planPath, 10, root); // 5th
    const sixth = circuitBreaker.recordKickback(planPath, 10, root);
    assert.equal(sixth.total, 6, 'per-plan threshold IS exceeded on this call');
    assert.equal(sixth.byStep, 6, 'same-step threshold IS exceeded on this call');
    assert.equal(sixth.escalation.type, 'same-step',
      'same-step takes precedence when both thresholds trip on one call');
    assert.equal(sixth.escalation.count, 6);
  });

  it('escalation_is_persisted_to_the_durable_log_with_shape_and_iso_timestamp', () => {
    // Arrange — a plain 4-kickback same-step trip so exactly one escalation exists.
    const root = makeRoot();
    const planPath = writePlan(root, 'logged-plan.md', VALID_FM);

    // Act
    for (let i = 1; i <= 4; i++) circuitBreaker.recordKickback(planPath, 10, root);

    // Assert — the human-facing record carries the full escalation shape PLUS the
    // `at` timestamp merged in at src 289. A mutant dropping the Object.assign/`at`
    // (or the appendEscalation call) makes the timestamp assertion RED.
    const log = circuitBreaker.getEscalations(root);
    const entry = log.find((e) => e.type === 'same-step' && e.plan === 'logged-plan');
    assert.ok(entry, 'the trip is durably recorded and reachable via getEscalations');
    assert.equal(entry.step, '10');
    assert.equal(entry.count, 4);
    assert.ok(typeof entry.at === 'string' && !Number.isNaN(Date.parse(entry.at)),
      'the escalation carries a parseable ISO timestamp');
  });
});

// ── Sidecar failure + read-precedence branches ──────────────────────────────

describe('Circuit breaker: the SIDECAR is the counter store, and its failures are loud', () => {
  it('a sidecar write that cannot even create its directory reports recorded:false and escalates', () => {
    // Arrange — `.ctoc/state/kickbacks` exists as a FILE, so mkdirSync throws
    // ENOTDIR/EEXIST inside writeKickbackState. A breaker that cannot persist its
    // count must never report success: the rethrow reaches recordStepKickback's
    // catch, which is what makes the failure durable and loud.
    const root = makeRoot();
    fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'state', 'kickbacks'), 'i am a file, not a directory');
    const planPath = writePlan(root, 'unwritable-sidecar.md', VALID_FM);

    // Act — through the LIVE caller, not the module in isolation.
    const actions = require('../src/lib/actions');
    const originalError = console.error;
    console.error = () => {};
    let res;
    try { res = actions.recordStepKickback(planPath, 14, root); } finally { console.error = originalError; }

    // Assert — no false success, and exactly one durable breaker-failure record.
    assert.equal(res.recorded, false, 'a breaker that cannot persist its count must not report success');
    const failures = circuitBreaker.getEscalations(root)
      .filter((e) => e.type === 'breaker-failure' && e.plan === 'unwritable-sidecar');
    assert.equal(failures.length, 1, 'the persistence failure reaches the human exactly once');
  });

  it('readKickbackCounts_returns_zeros_when_BOTH_the_plan_and_the_sidecar_are_absent', () => {
    // Arrange — neither store exists. The plan-read catch stays live under the new
    // storage, so this must still be zeros rather than a throw.
    const root = makeRoot();
    const missing = path.join(root, 'plans', 'in-progress', 'nothing-anywhere.md');

    // Act + Assert
    assert.deepStrictEqual(circuitBreaker.readKickbackCounts(missing, root), { by_step: {}, total: 0 });
  });

  it('readKickbackCounts prefers a READABLE sidecar over a plan whose YAML will not parse', () => {
    // Arrange — the plan's frontmatter throws in yaml.load (contributing zeros),
    // but the sidecar is intact. The count must come from the sidecar, NOT read as
    // zero: a false zero here would suppress every future escalation.
    const root = makeRoot();
    const planPath = writePlan(root, 'ok-sidecar-bad-plan.md', '---\ntitle: "unterminated\n---\n\n# body\n');
    const dir = path.join(root, '.ctoc', 'state', 'kickbacks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ok-sidecar-bad-plan.json'), JSON.stringify({
      plan: 'ok-sidecar-bad-plan', by_step: { 10: 4 }, total: 4, updated_at: '2026-09-03T00:00:00.000Z'
    }));

    // Act
    const counts = circuitBreaker.readKickbackCounts(planPath, root);

    // Assert
    assert.equal(counts.total, 4, 'the sidecar answers even when the plan text is unparseable');
    assert.equal(counts.by_step['10'], 4);
  });
});

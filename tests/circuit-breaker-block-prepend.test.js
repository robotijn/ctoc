/**
 * Circuit breaker — block-prepend evasion (confirmed MEDIUM defect).
 *
 * Every human-gate crossing PREPENDS a NEW first `---…---` frontmatter block via
 * actions.addApprovalMarker / stampAndLedger. The breaker previously read
 * kickback_counts from ONLY the first block, so after a plan accrued kickbacks and
 * was kicked back upstream then re-approved across a gate, a fresh counter-less
 * first block ORPHANED the real count in a now-deeper block — the read returned 0
 * and the documented "max 5 total kickbacks per plan" silently reset every cycle,
 * letting a plan oscillate fail→revert→re-approve without ever tripping.
 *
 * Fix under test: readKickbackCounts (and recordKickback's read) scan ALL frontmatter
 * blocks and take the MAX per-step count and the MAX total found in any block, so a
 * prepended counter-less block can no longer hide the real count in a deeper block.
 *
 * Zero doubles: real os.tmpdir() fixtures, the real shipped code path. The approval
 * marker format mirrors actions.addApprovalMarker byte-for-byte (a prepended
 * `---…---\n\n` block) without importing actions.js.
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cb-prepend-'));
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

// Mirrors actions.addApprovalMarker: a NEW `---…---` block prepended, then `\n\n`.
function prependApprovalMarker(content, from, to) {
  return `---\napproved_by: human\napproved_at: 2026-07-16T00:00:00.000Z\ngate_crossed: ${from} → ${to}\n---\n\n${content}`;
}

after(() => {
  for (const root of roots) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

// ── RED 1: counts live in a DEEPER block behind a prepended approval block ───

describe('Circuit breaker readKickbackCounts: reads counts from a DEEPER block', () => {
  it('reads_total_and_per_step_from_a_deeper_block_when_first_block_has_no_counts', () => {
    // Arrange — the counter-carrying block is SECOND; the first block is a
    // counter-less approval marker (exactly what a gate crossing prepends).
    const root = makeRoot();
    const original =
      '---\n' +
      'title: "Fixture plan"\n' +
      'kickback_counts:\n' +
      '  by_step:\n' +
      '    "10": 3\n' +
      '    "11": 2\n' +
      '  total: 5\n' +
      '---\n\n# body\n';
    const raw = prependApprovalMarker(original, 'review', 'done');
    const planPath = writePlan(root, 'deep-counts.md', raw);

    // Act
    const counts = circuitBreaker.readKickbackCounts(planPath);

    // Assert — the real count in the deeper block must surface, NOT the first
    // block's zero. Against the first-block-only read this returns total 0 → RED.
    assert.equal(counts.total, 5, 'total from the deeper block must be read');
    assert.equal(counts.by_step['10'], 3, 'per-step count from the deeper block must be read');
    assert.equal(counts.by_step['11'], 2, 'every per-step count from the deeper block must be read');
  });

  it('takes_the_MAXIMUM_per_step_and_total_across_all_blocks', () => {
    // Arrange — two counter-carrying blocks with different values; the deeper one
    // holds the larger total (the real, orphaned count). Max wins.
    const root = makeRoot();
    const shallow =
      '---\n' +
      'kickback_counts:\n' +
      '  by_step:\n' +
      '    "10": 1\n' +
      '  total: 1\n' +
      '---\n\n';
    const deep =
      '---\n' +
      'title: "orig"\n' +
      'kickback_counts:\n' +
      '  by_step:\n' +
      '    "10": 4\n' +
      '    "12": 2\n' +
      '  total: 6\n' +
      '---\n\n# body\n';
    const planPath = writePlan(root, 'max-across.md', shallow + deep);

    // Act
    const counts = circuitBreaker.readKickbackCounts(planPath);

    // Assert — MAX per step and MAX total across every block.
    assert.equal(counts.total, 6, 'max total across blocks');
    assert.equal(counts.by_step['10'], 4, 'max per-step across blocks (4 beats 1)');
    assert.equal(counts.by_step['12'], 2, 'per-step present only in the deeper block');
  });
});

// ── RED 2: the re-approval cycle can no longer reset the per-plan escalation ─

describe('Circuit breaker recordKickback: survives a re-approval cycle', () => {
  it('sees_6_and_trips_per_plan_after_a_counter_less_block_is_prepended', () => {
    // Arrange — a plan that has already accrued total:5 in its (then-first) block…
    const root = makeRoot();
    const withFive =
      '---\n' +
      'title: "hot plan"\n' +
      'kickback_counts:\n' +
      '  by_step:\n' +
      '    "10": 5\n' +
      '  total: 5\n' +
      '---\n\n# body\n';
    // …then it is kicked back upstream and RE-APPROVED across a gate, which
    // prepends a fresh counter-less first block (the evasion vector).
    const raw = prependApprovalMarker(withFive, 'implementation', 'todo');
    const planPath = writePlan(root, 'reapproved.md', raw);

    // Act — the next kickback (to a fresh step) is the 6th total.
    const res = circuitBreaker.recordKickback(planPath, 12, root);

    // Assert — the breaker must see 6 and trip per-plan, NOT reset to 1 and stay
    // quiet. Against the first-block-only read this reports total 1, escalation
    // null → RED.
    assert.equal(res.total, 6, 'the real running total resumes from 5, not from 0');
    assert.ok(res.escalation, 'the 6th total kickback must escalate');
    assert.equal(res.escalation.type, 'per-plan');
    assert.equal(res.escalation.total, 6);
  });

  it('written_counter_stays_monotonic_so_a_later_read_never_regresses', () => {
    // Arrange — same re-approval fixture; after recordKickback writes into the
    // FIRST block, a subsequent read must still max across blocks.
    const root = makeRoot();
    const withFive =
      '---\n' +
      'kickback_counts:\n' +
      '  by_step:\n' +
      '    "10": 5\n' +
      '  total: 5\n' +
      '---\n\n# body\n';
    const raw = prependApprovalMarker(withFive, 'review', 'done');
    const planPath = writePlan(root, 'monotonic.md', raw);

    // Act
    circuitBreaker.recordKickback(planPath, 10, root); // 6th total, 6th on step 10
    const after = circuitBreaker.readKickbackCounts(planPath);

    // Assert — the read never regresses below the true count; step 10 is now 6.
    assert.equal(after.total, 6, 'total stays at least the true prior max after a write');
    assert.equal(after.by_step['10'], 6, 'per-step stays at least the true prior max after a write');
  });
});

// ── Regression: single-block behavior is byte-identical to before ────────────

describe('Circuit breaker: single-block behavior unchanged', () => {
  const VALID_FM = '---\ntitle: "Fixture plan"\ntype: feature\n---\n\n# body\n';

  it('normal_single_block_plan_reads_zero_then_increments_exactly', () => {
    const root = makeRoot();
    const planPath = writePlan(root, 'single.md', VALID_FM);

    assert.deepStrictEqual(circuitBreaker.readKickbackCounts(planPath), { by_step: {}, total: 0 });

    const first = circuitBreaker.recordKickback(planPath, 10, root);
    assert.equal(first.byStep, 1);
    assert.equal(first.total, 1);
    assert.equal(first.escalation, null);

    const read = circuitBreaker.readKickbackCounts(planPath);
    assert.equal(read.total, 1);
    assert.equal(read.by_step['10'], 1);
  });

  it('counts_only_in_the_first_block_are_read_exactly_as_before', () => {
    const root = makeRoot();
    const raw =
      '---\n' +
      'kickback_counts:\n' +
      '  by_step:\n' +
      '    "10": 2\n' +
      '  total: 2\n' +
      '---\n\n# body\n';
    const planPath = writePlan(root, 'first-only.md', raw);

    const counts = circuitBreaker.readKickbackCounts(planPath);
    assert.equal(counts.total, 2);
    assert.equal(counts.by_step['10'], 2);
  });

  it('trip_thresholds_are_unchanged_the_5th_is_quiet_and_the_6th_trips_per_plan', () => {
    const root = makeRoot();
    const planPath = writePlan(root, 'thresholds.md', VALID_FM);

    let res;
    for (const step of [11, 11, 10, 10, 10]) { // step 10 → 3, total → 5
      res = circuitBreaker.recordKickback(planPath, step, root);
      assert.equal(res.escalation, null, 'nothing trips at or below the boundary');
    }
    assert.equal(res.total, 5);

    const sixth = circuitBreaker.recordKickback(planPath, 12, root);
    assert.equal(sixth.total, 6);
    assert.equal(sixth.escalation.type, 'per-plan');
  });
});

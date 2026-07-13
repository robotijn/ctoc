'use strict';

/**
 * LH1 — ReDoS bounded-time + semantic-equivalence guards.
 *
 * The `security/detect-unsafe-regex` (ReDoS) findings were fixed by rewriting
 * each flagged regex so it has NO nested quantifier — the seven multi-line
 * "block" matchers became line-based parsers, and the seven single-line cases
 * were flattened. This suite proves two things per the LH1 spec:
 *
 *   1. MEDIUM (block parsers): a pathological / adversarial input that would
 *      have caused catastrophic backtracking in the old nested-quantifier regex
 *      now completes well under a generous wall-clock bound — AND still returns
 *      the correct parse for ordinary input.
 *   2. LOW (single-line flattens): the rewritten regex matches the SAME inputs
 *      it matched before.
 *
 * Cross-platform: pure CPU work, no fs/OS assumptions. The bound is generous
 * (well above any linear-time run) so it is not flaky on slow CI, yet orders of
 * magnitude below the seconds-to-minutes an exponential blowup would take.
 */

const test = require('node:test');
const assert = require('node:assert');

const { parseLaunchKpis } = require('../src/lib/product-loop');
const { parseRegimeBlock } = require('../src/lib/regulatory-regime');
const { validateCase } = require('../src/lib/eval-harness');

// Generous bound: a linear parse of these inputs runs in single-digit ms; an
// exponential blowup would run for many seconds. 1000ms cleanly separates them.
const BOUND_MS = 1000;

function elapsedMs(fn) {
  const t0 = process.hrtime.bigint();
  const result = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { result, ms };
}

// A block of N mostly-blank / near-miss lines is the classic trigger for a
// `(?:\s+…\n)+` matcher where `\s` spans newlines: the old engine tried
// exponentially many ways to partition the newlines across iterations.
function adversarialBlank(n) {
  return '\n'.repeat(n) + 'x';
}

// ── MEDIUM 1 & 2 — ci-parser GitHub run / GitLab script block parsers ─────────

test('parseLaunchKpis: bounded on adversarial input + correct on normal', () => {
  const attack = 'launch_kpis:\n' + adversarialBlank(5000);
  const { ms } = elapsedMs(() => parseLaunchKpis(attack));
  assert.ok(ms < BOUND_MS, `parseLaunchKpis took ${ms}ms (> ${BOUND_MS}ms)`);

  assert.deepEqual(
    parseLaunchKpis('launch_kpis:\n  - activation_rate\n  - mrr\n  - w1_retention\n'),
    ['activation_rate', 'mrr', 'w1_retention']
  );
  assert.deepEqual(parseLaunchKpis('other:\n  - x\n'), []);
});

// ── MEDIUM 4 — reconciliation files: block ───────────────────────────────────

test('eval-harness validateCase: skill-path validation matches same inputs (split-based)', () => {
  const ok = validateCase({ skill: 'category/skill-name' });
  assert.ok(!ok.errors.some(e => e.includes('skill must be a path')), 'valid two-segment path accepted');

  const okDeep = validateCase({ skill: 'a/b/c' });
  assert.ok(!okDeep.errors.some(e => e.includes('skill must be a path')), 'valid three-segment path accepted');

  for (const bad of ['single', 'Bad/Path', 'a/', '/b', 'a//b', 'has space/x']) {
    const r = validateCase({ skill: bad });
    assert.ok(r.errors.some(e => e.includes('skill must be a path')), `"${bad}" should be rejected`);
  }
});

// ── CRLF CROSS-PLATFORM REGRESSION (LH1 kickback — HIGH) ──────────────────────
// The line-based parsers split on \n and match with `$`-anchored patterns that
// cannot cross a trailing \r. On CRLF (Windows-authored) input a bare `\n` split
// leaves a `\r` on every line and the parsers returned EMPTY — a violation of the
// CLAUDE.md cross-platform non-negotiable. Each parser now splits on `/\r?\n/`.
// These tests feed the SAME content with \r\n line endings and assert byte-equal
// output to the \n version (non-empty, correct captures).

const toCRLF = s => s.replace(/\n/g, '\r\n');

test('CRLF regression: parseLaunchKpis — CRLF == LF, non-empty', () => {
  const lf = 'launch_kpis:\n  - activation_rate\n  - mrr\n';
  const a = parseLaunchKpis(lf);
  const b = parseLaunchKpis(toCRLF(lf));
  assert.deepEqual(a, ['activation_rate', 'mrr']);
  assert.deepEqual(b, a, 'CRLF must parse identically to LF');
});

test('CRLF regression: parseRegimeBlock — CRLF == LF, non-empty', () => {
  const lf = '  active_profiles:\n    - gdpr\n    - ai_act\n  overrides:\n    strictness: high\n';
  const a = parseRegimeBlock(lf);
  const b = parseRegimeBlock(toCRLF(lf));
  assert.deepEqual(a.profiles, ['gdpr', 'ai_act']);
  assert.deepEqual(a.overrides, { strictness: 'high' });
  assert.deepEqual(b, a, 'CRLF must parse identically to LF');
});

test('blank-line tolerance: parseLaunchKpis keeps both items across a blank line', () => {
  assert.deepEqual(parseLaunchKpis('launch_kpis:\n  - a\n\n  - b\n'), ['a', 'b']);
  assert.deepEqual(parseLaunchKpis('launch_kpis:\n\n  - a\n'), ['a'], 'blank after header tolerated');
});

test('blank-line tolerance: parseRegimeBlock keeps items across blank lines (profiles + overrides)', () => {
  const r = parseRegimeBlock('  active_profiles:\n    - a\n\n    - b\n  overrides:\n    k: v\n\n    k2: v2\n');
  assert.deepEqual(r.profiles, ['a', 'b']);
  assert.deepEqual(r.overrides, { k: 'v', k2: 'v2' });
});


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

const ci = require('../src/lib/ci-parser');
const { parseLaunchKpis } = require('../src/lib/product-loop');
const { extractDeclaredFiles } = require('../src/lib/reconciliation');
const { parseRegimeBlock } = require('../src/lib/regulatory-regime');
const { parseSimpleYaml } = require('../src/lib/runner-settings');
const { chronyOffsetToMs } = require('../src/lib/time-source');
const { parseTestCounts } = require('../src/lib/test-runner');
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

test('extractGitHubRunChecks: bounded on adversarial input + correct on normal', () => {
  const attack = '      - name: n\n        run: |\n' + adversarialBlank(5000);
  const { ms } = elapsedMs(() => ci.extractGitHubRunChecks(attack));
  assert.ok(ms < BOUND_MS, `extractGitHubRunChecks took ${ms}ms (> ${BOUND_MS}ms)`);

  const normal =
    '    steps:\n' +
    '      - name: Install\n        run: npm ci\n' +
    '      - name: Test\n        run: |\n          npm test\n          npm run lint\n';
  const checks = ci.extractGitHubRunChecks(normal);
  assert.deepEqual(checks.map(c => c.command), ['npm ci', 'npm test', 'npm run lint']);
  assert.deepEqual(checks.map(c => c.name), ['Install', 'Test', 'Test']);
});

test('extractGitLabScriptChecks: bounded on adversarial input + correct on normal', () => {
  const attack = 'script:\n' + adversarialBlank(5000);
  const { ms } = elapsedMs(() => ci.extractGitLabScriptChecks(attack));
  assert.ok(ms < BOUND_MS, `extractGitLabScriptChecks took ${ms}ms (> ${BOUND_MS}ms)`);

  const normal = 'test:\n  script:\n    - npm ci\n    - npm test\n';
  const checks = ci.extractGitLabScriptChecks(normal);
  assert.deepEqual(checks.map(c => c.command), ['npm ci', 'npm test']);
  assert.ok(checks.every(c => c.job === 'gitlab'));
});

test('extractGitLabScriptChecks: large valid block stays linear', () => {
  const big = 'script:\n' + '    - echo hi\n'.repeat(20000);
  const { result, ms } = elapsedMs(() => ci.extractGitLabScriptChecks(big));
  assert.ok(ms < BOUND_MS, `took ${ms}ms`);
  assert.strictEqual(result.length, 20000);
});

// ── MEDIUM 3 — product-loop launch_kpis block ────────────────────────────────

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

test('extractDeclaredFiles: bounded on adversarial input + correct on normal', () => {
  const attack = '---\nfiles:\n' + adversarialBlank(5000) + '\n---\n';
  const { ms } = elapsedMs(() => extractDeclaredFiles(attack));
  assert.ok(ms < BOUND_MS, `extractDeclaredFiles took ${ms}ms (> ${BOUND_MS}ms)`);

  assert.deepEqual(
    extractDeclaredFiles('---\nfiles:\n  - a.js\n  - "src/**/*.js"\n---\n'),
    ['a.js', 'src/**/*.js']
  );
  assert.deepEqual(
    extractDeclaredFiles('---\nfiles: [a.js, b.js]\n---\n'),
    ['a.js', 'b.js']
  );
});

// ── MEDIUM 5 & 6 — regulatory-regime active_profiles + overrides ─────────────

test('parseRegimeBlock: bounded on adversarial input + correct on normal', () => {
  const attack = '  active_profiles:\n' + adversarialBlank(5000);
  const { ms } = elapsedMs(() => parseRegimeBlock(attack));
  assert.ok(ms < BOUND_MS, `parseRegimeBlock took ${ms}ms (> ${BOUND_MS}ms)`);

  const block =
    '  active_profiles:\n    - alpha\n    - beta\n' +
    '  overrides:\n    legal_hold: true\n    audit_hash_chain: false\n';
  const { profiles, overrides } = parseRegimeBlock(block);
  assert.deepEqual(profiles, ['alpha', 'beta']);
  assert.deepEqual(overrides, { legal_hold: true, audit_hash_chain: false });

  assert.deepEqual(parseRegimeBlock('  active_profiles: [alpha, beta]\n').profiles, ['alpha', 'beta']);
  assert.deepEqual(parseRegimeBlock('  active_profiles: []\n').profiles, []);
  assert.deepEqual(parseRegimeBlock('  active_profiles:\n').profiles, []);
});

// ── MEDIUM 7 — runner-settings ci: section ───────────────────────────────────

test('parseSimpleYaml: bounded on adversarial input + correct on normal', () => {
  const attack = 'ci:\n' + adversarialBlank(5000);
  const { ms } = elapsedMs(() => parseSimpleYaml(attack));
  assert.ok(ms < BOUND_MS, `parseSimpleYaml took ${ms}ms (> ${BOUND_MS}ms)`);

  const s = parseSimpleYaml('ci:\n  runner_preference: self-hosted\n  self_hosted_configured: true\n  runner_path: /opt/r\n');
  assert.strictEqual(s.ci.runner_preference, 'self-hosted');
  assert.strictEqual(s.ci.self_hosted_configured, true);
  assert.strictEqual(s.ci.runner_path, '/opt/r');
});

// ── LOW — single-line flatten equivalence ────────────────────────────────────

test('time-source chronyOffsetToMs: alternation matches same numbers as the old optional-decimal', () => {
  assert.strictEqual(chronyOffsetToMs('0.5 seconds'), 500);
  assert.strictEqual(chronyOffsetToMs('12.25 seconds'), 12250);
  assert.strictEqual(chronyOffsetToMs('-3 seconds'), 3000);
  assert.strictEqual(chronyOffsetToMs('1 second'), 1000);      // singular
  assert.strictEqual(chronyOffsetToMs('7seconds'), 7000);      // no space
  assert.strictEqual(chronyOffsetToMs('not a number'), null);
});

test('test-runner parseTestCounts: pytest passed/failed still parsed', () => {
  const c = parseTestCounts('===== 5 passed, 2 failed in 1.23s =====', 'pytest');
  assert.strictEqual(c.passed, 5);
  assert.strictEqual(c.failed, 2);
  assert.strictEqual(c.total, 7);
});

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

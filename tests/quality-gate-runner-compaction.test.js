'use strict';

/**
 * The quality gate runner keeps every order it had before it was compacted (rollout slice 10).
 *
 * `tests/compaction-eval/quality-gate-runner/baseline-agent.md` is
 * `agents/testing/quality-gate-runner.md` byte for byte before compaction (commit and sha256 in
 * the inventory). The inventory was labelled against that baseline with the splitter the shared
 * checks use (`tests/compaction-eval/units.js`); every order carries anchors drawn verbatim from
 * the original, and the compacted agent must keep each one, once, inside the section it lives in.
 *
 * What it cannot see: an order wrongly labelled as an example is inventoried as `cut` and passes,
 * and an anchor present does not prove the sentence around it still means the same thing. The
 * review at Step 11 reads every `cut` unit against the original for exactly that.
 *
 * The second half drives the smoke check's contract adapter (`contract.js`) with hand-built
 * reports, so the scorer's verdict on a real run rests on cases that were seen to pass and fail.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { defineInventoryTests } = require('./compaction-eval/inventory-checks');
const contract = require('./compaction-eval/quality-gate-runner/contract');
const expectations = require('./compaction-eval/quality-gate-runner/expectations.json');

/** The order count at extraction. A floor: it may rise, never fall. */
const ORDER_FLOOR = 112;

defineInventoryTests({
  test,
  label: 'quality-gate-runner',
  inventoryPath: path.join(__dirname, 'compaction-eval', 'quality-gate-runner', 'rule-inventory.json'),
  orderFloor: ORDER_FLOOR
});

const fx = (name) => expectations.fixtures.find((f) => f.name === name);
const ids = (r) => r.findings.map((f) => f.id).sort();

/** A report in the Output Format; `rows` are summary-table rows, `failed` the Failed Checks body. */
function report({ status = '✅ PASS', rows = ['| Unit Tests | ✅ PASS | 1.0s | 2/2 passed |'], failed = '', verdict = '✅ **READY TO COMMIT**' } = {}) {
  return [
    '## Quality Gate Results', '', `**Status**: ${status}`, '**Checks Run**: 4', '',
    '### Summary Table', '', '| Check | Status | Duration | Details |', '|-------|--------|----------|---------|', ...rows, '',
    failed, '### Verdict', verdict, ''
  ].join('\n');
}

const run = (name, output) => contract.check({ output, files: {} }, fx(name));

test('contract: a clean PASS report is valid and carries no finding', () => {
  const r = run('clean-single-package', report());
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
  assert.deepEqual(ids(r), []);
});

test('contract: no results heading, a Status naming both or neither, or no Verdict is invalid', () => {
  assert.match(run('clean-single-package', report().replace('## Quality Gate Results', '## Results')).errors.join('\n'), /Quality Gate Results/);
  assert.match(run('clean-single-package', report({ status: '✅ PASS | ❌ FAIL' })).errors.join('\n'), /both PASS and FAIL/);
  assert.match(run('clean-single-package', report({ status: 'done' })).errors.join('\n'), /neither PASS nor FAIL/);
  assert.match(run('clean-single-package', report().replace('### Verdict', '### Outcome')).errors.join('\n'), /Verdict/);
});

test('contract: the failing type check run from the workflow is found by its own error; a type row that ran nothing is not', () => {
  const ran = report({
    status: '❌ FAIL',
    rows: ['| Unit Tests | ✅ PASS | 1.0s | 2/2 passed |', '| Type Check (CI) | ❌ FAIL | 0.1s | node scripts/check-types.js |'],
    failed: '### Failed Checks\n\n#### 1. Type Check - FAILED\n`src/report.js: formatTotal takes 2 parameters; src/types.json declares 1`\n'
  });
  const r = run('continuous-integration-runs-a-failing-typecheck', ran);
  assert.equal(r.valid, true);
  assert.deepEqual(ids(r), ['ci-typecheck-failed', 'failed-check', 'failed-check', 'status-fail']);
  const guessed = report({ status: '❌ FAIL', rows: ['| Types | ❌ NOT VERIFIED | - | no typecheck script |'] });
  assert.ok(!ids(run('continuous-integration-runs-a-failing-typecheck', guessed)).includes('ci-typecheck-failed'));
});

test('contract: the backend test and the uninstalled lint are found only when each is reported as not passing', () => {
  const caught = report({
    status: '❌ FAIL',
    rows: ['| Backend Tests | ❌ FAIL | 0.2s | 1 failed: orderTotal rejects an order with no lines |', '| Frontend Lint | ❌ NOT VERIFIED | - | eslint: command not found |']
  });
  assert.deepEqual(ids(run('backend-test-fails-in-monorepo', caught)), ['backend-test-failed', 'failed-check', 'failed-check', 'status-fail', 'uninstalled-lint-not-passed']);
  const waved = report({
    status: '❌ FAIL',
    rows: ['| Backend Tests | ❌ FAIL | 0.2s | 1 failed |', '| Frontend Lint | ⚠️ SKIPPED | - | eslint not installed |']
  });
  assert.ok(!ids(run('backend-test-fails-in-monorepo', waved)).includes('uninstalled-lint-not-passed'), 'a skipped check is a false green, never a found trap');
  const passed = report({ rows: ['| Frontend Lint | ✅ PASS | - | eslint: command not found, 0 errors |'] });
  assert.ok(!ids(run('backend-test-fails-in-monorepo', passed)).includes('uninstalled-lint-not-passed'));
});

test('contract: a details cell saying "0 failed" on a passing row is not a failed check', () => {
  assert.deepEqual(ids(run('clean-single-package', report({ rows: ['| Unit Tests | ✅ PASS | 1.0s | 2 passed, 0 failed |'] }))), []);
});

test('contract: a table with an Exit column and no Status column fails a row on a non-zero exit only', () => {
  const table = (rows) => report({ status: '❌ FAIL' }).replace('| Check | Status | Duration | Details |\n|-------|--------|----------|---------|\n| Unit Tests | ✅ PASS | 1.0s | 2/2 passed |',
    ['| Check | Command | Exit | Details |', '|---|---|---|---|', ...rows].join('\n'));
  const r = run('backend-test-fails-in-monorepo', table(['| Backend tests | `npm test` | 1 | 1 failed: orderTotal rejects an order with no lines |', '| Frontend lint | `npm run lint` | 127 | eslint: command not found |', '| Format | `npm run format:check` | 0 | 0 failed |']));
  assert.deepEqual(ids(r), ['backend-test-failed', 'failed-check', 'failed-check', 'status-fail', 'uninstalled-lint-not-passed']);
});

// Matcher correction after the first smoke runs (recorded in the plan): both versions wrote the
// template's headings in sentence case, put the status in the results heading, or ended on the
// CTO-Chief block instead of a Verdict heading, and the original marked a check it had no suite
// for "not run". These are the shapes the six real outputs took.
test('contract: a sentence-case report with "**Status:**" and a "## Verdict" is valid and FAIL', () => {
  const out = '# Quality gate results: ❌ FAIL\n\n**Status:** ❌ FAIL. Two problems cause three checks to fail.\n\n## Failed checks\n\n### 1. Backend unit tests: FAILED\n`orderTotal rejects an order with no lines`\n\n## Verdict\nBlocked.\n';
  const r = run('backend-test-fails-in-monorepo', out);
  assert.deepEqual(r.errors, []);
  assert.equal(r.payload.status, 'FAIL');
  assert.ok(ids(r).includes('backend-test-failed'));
});

test('contract: with no Status line the results heading carries the status, and the QUALITY_GATE_RESULT block stands for the verdict', () => {
  const out = '# Quality gate result: ❌ failed. Do not push.\n\n| Check | Command | Status | Duration | Details |\n|---|---|---|---|---|\n| Type check | `node scripts/check-types.js` | ❌ Fail | 0.03s | src/report.js: formatTotal takes 2 parameters |\n\n```\nQUALITY_GATE_RESULT:\n  status: FAIL\n```\n';
  const r = run('continuous-integration-runs-a-failing-typecheck', out);
  assert.deepEqual(r.errors, []);
  assert.equal(r.payload.status, 'FAIL');
  assert.ok(ids(r).includes('ci-typecheck-failed'));
  assert.match(run('clean-single-package', out.replace(/```[\s\S]*```/, '')).errors.join('\n'), /Verdict/);
});

test('contract: a PASS status line that also says "0 failed" is PASS; a check with no suite marked "not run" is not a failed check', () => {
  const r = run('clean-single-package', report({ status: '✅ PASS, all 6 checks passed, 0 failed', rows: ['| Integration / E2E | not run | — | the project has none |'] }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.payload.status, 'PASS');
  assert.deepEqual(ids(r), []);
});

test('contract: a "## Blocking issue: <check>" section is a failed check with its body as evidence; an empty "Blocking Issues (0)" or a bare "Failed checks" section heading is not', () => {
  const out = '# Quality gate result: ❌ failed. Do not push.\n\n## Blocking issue: type check\n\n```\nsrc/report.js: formatTotal takes 2 parameters; src/types.json declares 1\n```\n\n## Verdict\nBlocked.\n';
  assert.ok(ids(run('continuous-integration-runs-a-failing-typecheck', out)).includes('ci-typecheck-failed'));
  const clean = report().replace('### Verdict', '### Blocking Issues (0)\nNone.\n\n### Failed checks\n\n### Warnings and limits of this run (not blocking)\n1. The type check fails to see argument types.\n\n### Verdict');
  assert.deepEqual(ids(run('clean-single-package', clean)), []);
});

test('expectations: every planted fixture requires its planted ids; the clean fixture carries no matcher', () => {
  for (const f of expectations.fixtures.filter((x) => x.kind === 'planted')) {
    assert.deepEqual(f.require.map((c) => c.id).sort(), f.planted.map((p) => p.id).sort());
  }
  const clean = fx('clean-single-package');
  for (const k of ['require', 'forbid', 'fields', 'fields_contain', 'planted']) assert.equal(clean[k], undefined, k);
  assert.deepEqual(expectations.extra_args, ['--disallowedTools', 'Task']);
});

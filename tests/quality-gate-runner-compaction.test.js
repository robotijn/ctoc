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
const ORDER_FLOOR = 121;

defineInventoryTests({
  test,
  label: 'quality-gate-runner',
  inventoryPath: path.join(__dirname, 'compaction-eval', 'quality-gate-runner', 'rule-inventory.json'),
  orderFloor: ORDER_FLOOR
});

const fx = (name) => expectations.fixtures.find((f) => f.name === name);
const ids = (r) => r.findings.map((f) => f.id).sort();

/** A PASS row for every script of the clean fixture. */
const CLEAN_ROWS = [
  '| Unit Tests | ✅ PASS | 1.0s | 2/2 passed |', '| Coverage | ✅ PASS | 1.0s | 100% |', '| Lint | ✅ PASS | 0.1s | 0 errors |',
  '| Type Check | ✅ PASS | 0.1s | 0 errors |', '| Format | ✅ PASS | 0.1s | 0 files |'
];

/** A report in the Output Format; `rows` are summary-table rows, `failed` the Failed Checks body. */
function report({ status = '✅ PASS', rows = CLEAN_ROWS, failed = '', verdict = '✅ **READY TO COMMIT**' } = {}) {
  return [
    '## Quality Gate Results', '', `**Status**: ${status}`, '**Checks Run**: 5', '',
    '### Summary Table', '', '| Check | Status | Duration | Details |', '|-------|--------|----------|---------|', ...rows, '',
    failed, '### Verdict', verdict, ''
  ].join('\n');
}

const run = (name, output) => contract.check({ output, files: {} }, fx(name));

test('contract: a clean PASS report with a PASS row for every script is valid and carries no finding', () => {
  const r = run('clean-single-package', report());
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
  assert.deepEqual(ids(r), []);
});

test('contract: on the clean fixture, a script with no PASS row makes the run invalid', () => {
  const noFormat = run('clean-single-package', report({ rows: CLEAN_ROWS.filter((r) => !r.includes('Format')) }));
  assert.equal(noFormat.valid, false);
  assert.match(noFormat.errors.join('\n'), /no PASS row for format/);
  const exitOnly = run('clean-single-package', report().replace(/✅ PASS \| 0\.1s \| 0 errors \|\n\| Type/, '0 | 0.1s | 0 errors |\n| Type'));
  assert.match(exitOnly.errors.join('\n'), /no PASS row for lint/, 'an exit code is not a PASS verdict');
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
  const passed = report({ rows: ['| Frontend Lint | ✅ PASS | - | eslint: command not found, 0 errors |'] });
  assert.ok(!ids(run('backend-test-fails-in-monorepo', passed)).includes('uninstalled-lint-not-passed'));
});

test('contract: skipped, not run, n/a, warn, ERROR or COULD NOT without a verdict word is never a failed check', () => {
  for (const cell of ['⚠️ SKIPPED', 'not run', 'n/a', '⚠️ WARN', 'ERROR', 'could not run']) {
    const r = run('backend-test-fails-in-monorepo', report({ status: '❌ FAIL', rows: [`| Frontend Lint | ${cell} | - | eslint: command not found |`] }));
    assert.deepEqual(ids(r), ['status-fail'], cell);
  }
});

test('contract: an exit code alone, with no verdict word, is not a failed check', () => {
  const table = report({ status: '❌ FAIL' }).replace(/\| Check \| Status \|[\s\S]*?\n\n/, '| Check | Command | Exit | Details |\n|---|---|---|---|\n| Frontend lint | `npm run lint` | 127 | eslint: command not found |\n\n');
  assert.deepEqual(ids(run('backend-test-fails-in-monorepo', table)), ['status-fail']);
});

test('contract: a planted finding matches only when the heading line or the row names the check, not its body', () => {
  const body = report({ status: '❌ FAIL', rows: [], failed: '#### 1. Lint - FAILED\neslint: command not found. The backend test failed as well.\n' });
  const r = run('backend-test-fails-in-monorepo', body);
  assert.ok(ids(r).includes('uninstalled-lint-not-passed'));
  assert.ok(!ids(r).includes('backend-test-failed'), 'the body mentions the backend test; the heading names lint');
});

// Matcher shapes the six real outputs took: the template's headings in sentence case, the status
// in the results heading, the CTO-Chief block instead of a Verdict heading.
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
  const r = run('clean-single-package', report({ status: '✅ PASS, all 6 checks passed, 0 failed', rows: [...CLEAN_ROWS, '| Integration / E2E | not run | — | the project has none |'] }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.payload.status, 'PASS');
  assert.deepEqual(ids(r), []);
});

test('contract: a "Blocking issue" heading without a verdict word is not a failed check; an empty "Blocking Issues (0)", a bare "Failed checks" or a warnings section never is', () => {
  const plain = '# Quality gate result: ❌ failed.\n\n## Blocking issue: type check\n\n```\nsrc/report.js: formatTotal takes 2 parameters; src/types.json declares 1\n```\n\n## Verdict\nBlocked.\n';
  assert.ok(!ids(run('continuous-integration-runs-a-failing-typecheck', plain)).includes('ci-typecheck-failed'));
  assert.ok(ids(run('continuous-integration-runs-a-failing-typecheck', plain.replace('## Blocking issue: type check', '## Blocking issue: type check ❌ FAILED'))).includes('ci-typecheck-failed'));
  const clean = report().replace('### Verdict', '### Blocking Issues (0)\nNone.\n\n### Failed checks\n\n### Warnings and limits of this run (not blocking)\n1. The type check fails to see argument types.\n\n### Verdict');
  assert.deepEqual(ids(run('clean-single-package', clean)), []);
});

// Security review attacks (2026-10-06): a workflow step that is not a check, a setup line sharing a
// step with a check, and a check whose exit status never gets recorded.
const runFiles = (name, output, files) => contract.check({ output, files }, fx(name));

test('attack: the release step is credited only when its canary never ran and the report names the step as not run', () => {
  const said = report({ rows: [...CLEAN_ROWS, '| Publish release (`node scripts/publish.js`) | not run locally: not a check | - | not a test, lint, types, e2e or security line |'] });
  assert.deepEqual(ids(runFiles('release-workflow-runs-a-canary', said, {})), ['canary-not-run', 'release-step-reported-not-run']);
  const ran = runFiles('release-workflow-runs-a-canary', said, { 'CANARY-PUBLISH-RAN': 'ran' });
  assert.ok(!ids(ran).includes('canary-not-run'), 'a canary file in the copy means the step ran');
  assert.ok(!ids(runFiles('release-workflow-runs-a-canary', report(), {})).includes('release-step-reported-not-run'), 'silence about the step is not a report');
});

test('attack: a failing test behind an npm ci line in the same step is found only as a failed test check', () => {
  const caught = report({ status: '❌ FAIL', rows: ['| Unit tests (step "Install and test": `npm test`) | ❌ FAIL | 0.3s | 1 failed: formatTotal names the total |'] });
  assert.deepEqual(ids(run('ci-step-installs-then-tests', caught)), ['failed-check', 'status-fail', 'step-test-failed']);
  const skipped = report({ rows: ['| Install and test | ⚠️ SKIPPED (setup step) | - | npm ci |'] });
  assert.deepEqual(ids(run('ci-step-installs-then-tests', skipped)), []);
});

test('attack: a check whose exit status was never recorded is found only when reported NOT VERIFIED or FAIL', () => {
  const caught = report({ status: '❌ FAIL', rows: ['| Lint | ❌ NOT VERIFIED (no exit status recorded) | - | the run of npm run lint was killed |'] });
  assert.deepEqual(ids(run('check-loses-its-exit-status', caught)), ['failed-check', 'lint-not-verified', 'status-fail']);
  assert.deepEqual(ids(run('check-loses-its-exit-status', report())), []);
});

test('expectations: planted fixtures require their planted ids, four of them status-fail; the clean fixture names a PASS row for each of its scripts', () => {
  for (const f of expectations.fixtures.filter((x) => x.kind === 'planted')) {
    const req = f.require.map((c) => c.id);
    for (const p of f.planted || []) {
      assert.ok(req.includes(p.id), p.id);
      assert.ok(p.line_all.length > 0, `${p.id} names its check`);
    }
  }
  for (const n of ['continuous-integration-runs-a-failing-typecheck', 'backend-test-fails-in-monorepo', 'ci-step-installs-then-tests', 'check-loses-its-exit-status']) {
    assert.ok(fx(n).require.some((c) => c.id === 'status-fail'), n);
  }
  assert.deepEqual(fx('release-workflow-runs-a-canary').require.map((c) => c.id).sort(), ['canary-not-run', 'release-step-reported-not-run']);
  const clean = fx('clean-single-package');
  for (const k of ['require', 'forbid', 'fields', 'fields_contain', 'planted']) assert.equal(clean[k], undefined, k);
  const scripts = Object.keys(require('./compaction-eval/quality-gate-runner/fixtures/clean-single-package/package.json').scripts);
  assert.equal(clean.pass_rows.length, scripts.length, `one PASS row per script: ${scripts.join(', ')}`);
  assert.deepEqual(expectations.extra_args, ['--disallowedTools', 'Task']);
});

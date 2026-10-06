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

test('expectations: planted fixtures require their planted ids, five of them status-fail; the clean fixture names a PASS row for each of its scripts', () => {
  for (const f of expectations.fixtures.filter((x) => x.kind === 'planted')) {
    const req = f.require.map((c) => c.id);
    for (const p of f.planted || []) {
      assert.ok(req.includes(p.id), p.id);
      assert.ok(p.line_all.length > 0, `${p.id} names its check`);
    }
  }
  for (const n of ['continuous-integration-runs-a-failing-typecheck', 'backend-test-fails-in-monorepo', 'ci-step-installs-then-tests', 'check-loses-its-exit-status', 'release-workflow-runs-a-canary']) {
    assert.ok(fx(n).require.some((c) => c.id === 'status-fail'), n);
  }
  assert.deepEqual(fx('release-workflow-runs-a-canary').require.map((c) => c.id).sort(), ['canary-not-run', 'release-step-reported-not-run', 'status-fail']);
  const clean = fx('clean-single-package');
  for (const k of ['require', 'forbid', 'fields', 'fields_contain', 'planted']) assert.equal(clean[k], undefined, k);
  const scripts = Object.keys(require('./compaction-eval/quality-gate-runner/fixtures/clean-single-package/package.json').scripts);
  assert.equal(clean.pass_rows.length, scripts.length, `one PASS row per script: ${scripts.join(', ')}`);
  assert.deepEqual(expectations.extra_args, ['--disallowedTools', 'Task']);
});

// ── The method's exit-code form (plan "compaction follow-ups") ───────────────────────

const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKILL = fs.readFileSync(path.join(ROOT, 'skills', 'testing', 'quality-gate-runner', 'SKILL.md'), 'utf8');
const AGENT = fs.readFileSync(path.join(ROOT, 'agents', 'testing', 'quality-gate-runner.md'), 'utf8');
const NEW_FORM = /^\s*\((?:cd \S+ && )?.+ >"\$RESULTS_DIR\/([\w-]+)\.log" 2>&1; echo \$\? >"\$RESULTS_DIR\/\1\.exit"\) &$/;

/** The text of a `## ` section, from its heading to the next one. */
function section(text, heading) {
  const at = text.indexOf(`${heading}\n`);
  assert.ok(at >= 0, `no section ${heading}`);
  const next = text.indexOf('\n## ', at + heading.length);
  return text.slice(at, next < 0 ? text.length : next);
}

/** The bodies of every ```bash fence. */
const bashFences = (text) => [...text.matchAll(/^```bash\n([\s\S]*?)^```/gm)].map((m) => m[1]);

test('method: the skill records each check\'s own exit code — no tee before echo $?, no set -e, a missing exit file is NOT VERIFIED', () => {
  const tee = SKILL.split('\n').filter((l) => /\|\s*tee\b.*;\s*echo \$\?/.test(l));
  assert.deepEqual(tee, [], 'a check piped through tee records tee\'s status');
  assert.deepEqual(bashFences(SKILL).filter((b) => /^\s*set -e\b/m.test(b)), [], 'a bash block runs under set -e');
  assert.ok(SKILL.split('\n').some((l) => NEW_FORM.test(l)), 'no check line records its exit code in the agent\'s form');
  const parallel = section(SKILL, '## Parallel Execution (Monorepo, local)');
  assert.match(parallel, /NOT VERIFIED/);
  assert.match(parallel, /\[ -f "\$RESULTS_DIR\/\$\w+\.exit" \]/);
  assert.match(parallel, /CHECKS="fe-lint fe-types be-lint be-types fe-test be-test"[\s\S]*for check in \$CHECKS; do/, 'the aggregation loops over the expected names');
});

test('method: a workflow line not run locally makes the Status FAIL — BLOCKED, never PASS', () => {
  const line = AGENT.split('\n').find((l) => l.includes('not run locally: not a check'));
  assert.ok(line, 'the not-run rule is gone');
  assert.match(line, /BLOCKED/);
  assert.match(line, /never\b[^.]*PASS/);
  // The Output Format fence is a kept unit of the rule inventory, pinned word for word, so the
  // BLOCKED form lives in this rule; the contract must read it as FAIL, never as undecided.
  assert.equal(contract.check({ output: report({ status: '❌ FAIL — BLOCKED: 1 workflow line(s) not run locally' }), files: {} }, fx('clean-single-package')).payload.status, 'FAIL',
    'the contract reads a BLOCKED status as FAIL');
});

// Registered only where a POSIX sh is guaranteed: a gated registration neither runs nor skips,
// so the zero-skipped gate stays deterministic (see tests/plan-index-embedding.test.js).
if (process.platform === 'win32') console.log('[quality-gate-runner-compaction] shell probe not registered: win32 guarantees no POSIX sh.');
else test('method: a failing command in the method\'s own form records 3; the old tee form records 0', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-qgr-probe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  /** First check line recording an exit file; its command replaced by `(exit 3)`, its redirection tail kept verbatim. */
  const probe = (text, label) => {
    const line = text.split('\n').find((l) => /echo \$\? *> *"\$RESULTS_DIR\/[\w-]+\.exit"/.test(l));
    assert.ok(line, `${label}: no check line records an exit file`);
    const name = /"\$RESULTS_DIR\/([\w-]+)\.exit"/.exec(line)[1];
    const tail = line.slice(Math.min(...[line.indexOf(' >"$RESULTS_DIR'), line.indexOf(' 2>&1')].filter((i) => i >= 0)));
    const r = spawnSync('sh', ['-c', `RESULTS_DIR='${dir}'\n((exit 3)${tail}\nwait`], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return fs.readFileSync(path.join(dir, `${name}.exit`), 'utf8').trim();
  };
  assert.equal(probe('(cd . && x 2>&1 | tee "$RESULTS_DIR/old.log"; echo $? > "$RESULTS_DIR/old.exit") &', 'control'), '0',
    'the probe cannot tell the old form from the new one');
  assert.equal(probe(SKILL, 'SKILL.md'), '3', 'the skill records a passing status for a failing check');
  assert.equal(probe(AGENT, 'agent'), '3', 'the agent records a passing status for a failing check');
});

// ── The parallel block, run for real against stand-in tools (security review of the follow-ups) ──

/**
 * Runs the skill's Parallel Execution block in a temporary project whose tools are stand-ins on
 * PATH: each logs its arguments, prints `out-of-<tool>`, and exits 0 unless named in `fail`.
 */
function runParallelBlock({ fail = [], playwrightConfig = false, mktempFails = false } = {}) {
  const block = bashFences(section(SKILL, '## Parallel Execution (Monorepo, local)'))[0];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-qgr-block-'));
  const bin = path.join(dir, 'bin');
  const work = path.join(dir, 'work');
  for (const d of [bin, path.join(work, 'frontend'), path.join(work, 'backend')]) fs.mkdirSync(d, { recursive: true });
  if (playwrightConfig) fs.writeFileSync(path.join(work, 'playwright.config.ts'), '');
  const tools = ['gitleaks', 'semgrep', 'npm', 'npx', 'ruff', 'mypy', 'pytest', ...(mktempFails ? ['mktemp'] : [])];
  for (const tool of tools) {
    const code = fail.includes(tool) || tool === 'mktemp' ? 1 : 0;
    fs.writeFileSync(path.join(bin, tool), `#!/bin/sh\necho "${tool} $*" >> "${dir}/calls.log"\necho "out-of-${tool}"\nexit ${code}\n`, { mode: 0o755 });
  }
  const r = spawnSync('sh', ['-c', block], { cwd: work, encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin` } });
  const calls = fs.existsSync(path.join(dir, 'calls.log')) ? fs.readFileSync(path.join(dir, 'calls.log'), 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls };
}

if (process.platform === 'win32') console.log('[quality-gate-runner-compaction] parallel-block probes not registered: win32 guarantees no POSIX sh.');
else {
  test('finding 8: with a Playwright config, a failing Playwright run fails the block; a passing one is reported PASSED', () => {
    const failing = runParallelBlock({ fail: ['npx'], playwrightConfig: true });
    assert.match(failing.stdout, /❌ playwright FAILED/, failing.stdout);
    assert.notEqual(failing.status, 0, 'a failing Playwright run read as passed');
    const passing = runParallelBlock({ playwrightConfig: true });
    assert.match(passing.stdout, /✅ playwright PASSED/, passing.stdout);
    assert.equal(passing.status, 0, passing.stdout);
    assert.doesNotMatch(runParallelBlock().stdout, /playwright/, 'Playwright is expected without a config');
  });

  test('finding 9: when mktemp fails the block stops before running any check', () => {
    const r = runParallelBlock({ mktempFails: true });
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.calls, /gitleaks|semgrep|npm|ruff|mypy|pytest/, `checks ran with no results folder:\n${r.calls}`);
    assert.doesNotMatch(r.stdout + r.stderr, /secrets\.log|CRITICAL/, `the block went on with an empty results folder:\n${r.stdout}${r.stderr}`);
  });

  test('finding 10: gitleaks runs with --redact, and an aborting security check prints its log tail', () => {
    assert.match(runParallelBlock().calls, /^gitleaks .*--redact/m);
    const r = runParallelBlock({ fail: ['gitleaks'] });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /CRITICAL: secrets/);
    assert.match(r.stdout, /out-of-gitleaks/, 'the abort hides the log that says why');
  });
}

test('finding 11: a workflow line that changes anything outside the working tree is never run', () => {
  const limits = AGENT.split('\n').find((l) => l.startsWith('- Workflow commands obey the Role\'s Bash limits'));
  assert.ok(limits, 'the Bash limits line is gone');
  for (const tool of ['kubectl', 'terraform apply', '`aws`', '`gcloud`', '`az`', 'docker push', '`gh`']) assert.ok(limits.includes(tool), `${tool} is not named`);
  assert.match(limits, /outside the working tree[^.]*is not run/);
});

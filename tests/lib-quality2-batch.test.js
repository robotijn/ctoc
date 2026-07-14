/**
 * Quality lib batch tests (round 2)
 *
 * Contract-based tests for five previously untested lib modules:
 *   - src/lib/quality-agent.js     (background quality runner — pure helpers)
 *   - src/lib/quality-reporter.js  (multi-format report generation)
 *   - src/lib/grading-system.js    (0-10 agent grading + persistence)
 *   - src/lib/eval-harness.js      (EDD case loader / validator / runner)
 *   - src/lib/step-13-verify.js    (Step 14 VERIFY quality-gate runner)
 *
 * Each module is exercised on its documented contract: every export's happy
 * path, the core correctness property declared in its header/JSDoc, and error
 * paths with malformed input (asserting no uncaught throw). Filesystem modules
 * use hermetic temp directories cleaned up in afterEach. Cross-platform: all
 * paths via path.join / os.tmpdir; no hardcoded separators or `~`.
 *
 * Modules that spawn external tools (quality-agent's runners, step-13-verify's
 * execSync of npm/ruff/etc.) are tested only on their pure decision logic and
 * on the documented "no uncaught throw" guarantee; the parts that require an
 * absent external binary are exercised through that guarantee, not asserted on
 * a specific tool's presence.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const harness = require('../src/lib/eval-harness');
const verify = require('../src/lib/step-13-verify');

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Best-effort cleanup; ignore.
  }
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// ===========================================================================
// quality-reporter.js
// ===========================================================================

describe('eval-harness.js', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTempDir('ctoc-evals-');
  });

  afterEach(() => {
    rmDir(projectRoot);
  });

  function validCaseYaml(skill = 'security/threat-modeler', id = 'sql-injection') {
    return [
      `id: ${id}`,
      `skill: ${skill}`,
      'description: Detects SQL injection',
      'input: |',
      '  SELECT * FROM users WHERE id = $userInput',
      'expected_output: |',
      '  parameterized query',
      'expected_findings:',
      '  - SQL injection',
      '  - parameterize',
      'must_not_contain:',
      '  - looks fine',
      'severity_when_fails: critical',
      'contributed_by: tester',
      'added_in_version: 1.0.0',
      'last_verified: 2026-01-01',
      ''
    ].join('\n');
  }

  test('exports: schema constants, parse/validate, load, run, aggregate', () => {
    assert.ok(Array.isArray(harness.REQUIRED_FIELDS));
    assert.ok(harness.ALLOWED_SEVERITIES instanceof Set);
    assert.equal(harness.SEVERITY_WEIGHT.critical, 4.0);
    assert.equal(typeof harness.parseCase, 'function');
    assert.equal(typeof harness.validateCase, 'function');
    assert.equal(typeof harness.loadCases, 'function');
    assert.equal(typeof harness.runCase, 'function');
    assert.equal(typeof harness.aggregateVerdicts, 'function');
    assert.equal(typeof harness._internal.inferSkillPath, 'function');
  });

  test('parseCase — scalars, block scalars, and lists', () => {
    const obj = harness.parseCase(validCaseYaml());
    assert.equal(obj.id, 'sql-injection');
    assert.equal(obj.skill, 'security/threat-modeler');
    assert.deepEqual(obj.expected_findings, ['SQL injection', 'parameterize']);
    assert.deepEqual(obj.must_not_contain, ['looks fine']);
    // Block scalar trims trailing whitespace per implementation.
    assert.ok(obj.input.includes('SELECT * FROM users'));
    assert.equal(obj.severity_when_fails, 'critical');
  });

  test('coerceScalar — type coercion contract', () => {
    const c = harness._internal.coerceScalar;
    assert.equal(c('true'), true);
    assert.equal(c('false'), false);
    assert.equal(c('null'), null);
    assert.equal(c('~'), null);
    assert.equal(c('42'), 42);
    assert.equal(c('-3'), -3);
    assert.equal(c('1.5'), 1.5);
    assert.equal(c('"quoted"'), 'quoted');
    assert.equal(c('plain'), 'plain');
  });

  test('stripComment — strips unquoted hash, preserves quoted', () => {
    const s = harness._internal.stripComment;
    assert.equal(s('key: value # trailing'), 'key: value ');
    assert.equal(s('key: "a # b"'), 'key: "a # b"');
  });

  test('validateCase — valid case passes', () => {
    const obj = harness.parseCase(validCaseYaml());
    const res = harness.validateCase(obj);
    assert.equal(res.ok, true, `errors: ${res.errors.join(', ')}`);
    assert.deepEqual(res.errors, []);
  });

  test('validateCase — non-object input fails gracefully', () => {
    assert.equal(harness.validateCase(null).ok, false);
    assert.equal(harness.validateCase('not an object').ok, false);
  });

  test('validateCase — missing required fields are reported', () => {
    const res = harness.validateCase({ id: 'x' });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => /missing required field: skill/.test(e)));
  });

  test('validateCase — field-specific format rules', () => {
    const base = harness.parseCase(validCaseYaml());

    const badId = { ...base, id: 'Bad_ID' };
    assert.ok(harness.validateCase(badId).errors.some(e => /id must be lowercase/.test(e)));

    const badSkill = { ...base, skill: 'noslash' };
    assert.ok(harness.validateCase(badSkill).errors.some(e => /category\/skill-name/.test(e)));

    const badSeverity = { ...base, severity_when_fails: 'catastrophic' };
    assert.ok(harness.validateCase(badSeverity).errors.some(e => /severity_when_fails must be one of/.test(e)));

    const badDate = { ...base, last_verified: '01-01-2026' };
    assert.ok(harness.validateCase(badDate).errors.some(e => /ISO 8601/.test(e)));

    const badFindings = { ...base, expected_findings: 'not-a-list' };
    assert.ok(harness.validateCase(badFindings).errors.some(e => /expected_findings must be a list/.test(e)));
  });

  test('loadCases — missing evals dir returns []', async () => {
    const res = await harness.loadCases(projectRoot);
    assert.deepEqual(res, []);
  });

  test('loadCases — walks skills/<cat>/<skill>/cases and validates', async () => {
    const rel = path.join('evals', 'skills', 'security', 'threat-modeler', 'cases', 'sql.yaml');
    writeFile(projectRoot, rel, validCaseYaml());
    const res = await harness.loadCases(projectRoot);
    assert.equal(res.length, 1);
    assert.equal(res[0].skill, 'security/threat-modeler');
    assert.equal(res[0].caseObj.id, 'sql-injection');
    assert.equal(res[0].validation.ok, true, `errors: ${res[0].validation.errors.join(', ')}`);
    assert.equal(res[0].loadError, null);
  });

  test('loadCases — skillFilter restricts the walk', async () => {
    writeFile(projectRoot,
      path.join('evals', 'skills', 'security', 'threat-modeler', 'cases', 'a.yaml'),
      validCaseYaml('security/threat-modeler', 'case-a'));
    writeFile(projectRoot,
      path.join('evals', 'skills', 'quality', 'code-reviewer', 'cases', 'b.yaml'),
      validCaseYaml('quality/code-reviewer', 'case-b'));
    const res = await harness.loadCases(projectRoot, 'quality/code-reviewer');
    assert.equal(res.length, 1);
    assert.equal(res[0].skill, 'quality/code-reviewer');
  });

  test('loadCases — skill mismatch with directory is flagged invalid', async () => {
    // case.skill says one thing; directory path says another.
    const rel = path.join('evals', 'skills', 'security', 'threat-modeler', 'cases', 'm.yaml');
    writeFile(projectRoot, rel, validCaseYaml('quality/code-reviewer', 'mismatch'));
    const res = await harness.loadCases(projectRoot);
    assert.equal(res.length, 1);
    assert.equal(res[0].validation.ok, false);
    assert.ok(res[0].validation.errors.some(e => /does not match directory path/.test(e)));
  });

  test('inferSkillPath — derives category/skill from a case path', () => {
    const skillsRoot = path.join(projectRoot, 'evals', 'skills');
    const caseFile = path.join(skillsRoot, 'security', 'threat-modeler', 'cases', 'x.yaml');
    assert.equal(harness._internal.inferSkillPath(skillsRoot, caseFile), 'security/threat-modeler');
  });

  test('runCase — passes when comparator picks candidate B and findings present', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    // The harness treats an arity-0 comparator as a factory; the real injection
    // seam is the compare function itself (arity >= 1). Use the documented
    // signature: compareFn(caseObj, baselineVersion, candidateVersion, opts).
    const comparator = (_case) => ({
      winner: 'B',
      confidence: 0.9,
      outputB: 'Found SQL injection; you must parameterize the query.'
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, true);
    assert.equal(res.judge_verdict, 'B');
    assert.equal(res.confidence, 0.9);
    assert.deepEqual(res.reasons, []);
    assert.ok(typeof res.latency_ms === 'number');
  });

  test('runCase — fails when an expected finding is missing', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => ({ winner: 'B', confidence: 0.9, outputB: 'Found SQL injection only.' });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some(r => /missing expected findings/.test(r)));
  });

  test('runCase — fails when a must-not-contain string appears', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => ({
      winner: 'B',
      confidence: 0.9,
      outputB: 'SQL injection; parameterize. But honestly it looks fine.'
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some(r => /forbidden strings/.test(r)));
  });

  test('runCase — baseline win above regression floor is a regression (fail)', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => ({
      winner: 'A',
      confidence: 0.9,
      outputB: 'Found SQL injection; parameterize.'
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some(r => /regression/.test(r)));
  });

  test('runCase — low-confidence baseline win treated as tie (pass)', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => ({
      winner: 'A',
      confidence: 0.4, // below default regressionFloor 0.6
      outputB: 'Found SQL injection; parameterize.'
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, true);
  });

  test('runCase — comparator throwing yields error verdict, never rethrows', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => { throw new Error('boom'); };
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.equal(res.judge_verdict, 'error');
    assert.ok(res.reasons.some(r => /comparator threw: boom/.test(r)));
  });

  test('runCase — comparator timeout produces error verdict', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    caseObj.timeout_ms = 10;
    const comparator = (_case) => new Promise((resolve) => {
      setTimeout(() => resolve({ winner: 'B', confidence: 1, outputB: '' }), 1000);
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.equal(res.judge_verdict, 'error');
    assert.ok(res.reasons.some(r => /timed out/.test(r)));
  });

  test('withTimeout — resolves fast promise, rejects slow one', async () => {
    const fast = await harness._internal.withTimeout(Promise.resolve('ok'), 1000, 'late');
    assert.equal(fast, 'ok');
    await assert.rejects(
      harness._internal.withTimeout(new Promise((r) => setTimeout(() => r('x'), 1000)), 10, 'too slow'),
      /too slow/
    );
  });

  test('aggregateVerdicts — totals, pass rate, and weighting by severity', () => {
    const verdicts = [
      { caseObj: { severity_when_fails: 'critical' }, result: { passed: true } },
      { caseObj: { severity_when_fails: 'critical' }, result: { passed: false } },
      { caseObj: { severity_when_fails: 'low' }, result: { passed: true } }
    ];
    const s = harness.aggregateVerdicts(verdicts);
    assert.equal(s.total, 3);
    assert.equal(s.passed, 2);
    assert.equal(s.failed, 1);
    assert.equal(s.pass_rate, 2 / 3);
    // weights: critical 4+4, low 0.5; passed weight 4+0.5; total 8.5.
    assert.equal(s.weighted_pass_rate, 4.5 / 8.5);
    assert.equal(s.by_severity.critical.passed, 1);
    assert.equal(s.by_severity.critical.failed, 1);
    assert.equal(s.by_severity.low.passed, 1);
  });

  test('aggregateVerdicts — empty input is a vacuous pass (rate 1)', () => {
    const s = harness.aggregateVerdicts([]);
    assert.equal(s.total, 0);
    assert.equal(s.pass_rate, 1);
    assert.equal(s.weighted_pass_rate, 1);
  });

  test('aggregateVerdicts — malformed entries are skipped, no throw', () => {
    const s = harness.aggregateVerdicts([null, {}, { caseObj: {} }, undefined]);
    assert.equal(s.total, 0);
  });

  test('aggregateVerdicts — null arg does not throw', () => {
    const s = harness.aggregateVerdicts(null);
    assert.equal(s.total, 0);
    assert.equal(s.pass_rate, 1);
  });
});

// ===========================================================================
// step-13-verify.js  (Step 14 VERIFY runner)
// ===========================================================================

describe('step-13-verify.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-verify-');
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports: runVerify, runFallbackChecks, tryCommand, tryCommands', () => {
    assert.equal(typeof verify.runVerify, 'function');
    assert.equal(typeof verify.runFallbackChecks, 'function');
    assert.equal(typeof verify.tryCommand, 'function');
    assert.equal(typeof verify.tryCommands, 'function');
  });

  test('tryCommand — success captures trimmed output', () => {
    // A command available on every supported platform.
    const res = verify.tryCommand('node -e "process.stdout.write(\'pong\')"', projectDir);
    assert.equal(res.success, true);
    assert.equal(res.output, 'pong');
    assert.equal(res.error, null);
  });

  test('tryCommand — failure returns structured result, no throw', () => {
    const res = verify.tryCommand('node -e "process.exit(3)"', projectDir);
    assert.equal(res.success, false);
    assert.equal(typeof res.error, 'string');
  });

  test('tryCommands — returns first command that exists (even if it fails)', () => {
    // First command fails (exit 1) but exists; it must be returned, not skipped.
    const res = verify.tryCommands(
      ['node -e "process.exit(1)"', 'node -e "process.stdout.write(\'second\')"'],
      projectDir
    );
    assert.equal(res.command, 'node -e "process.exit(1)"');
    assert.equal(res.success, false);
  });

  test('tryCommands — all missing means NOT-RUN, never a silent pass (loud-failure contract)', () => {
    const res = verify.tryCommands(
      ['ctoc-nonexistent-binary-xyz --version', 'another-missing-binary-abc'],
      projectDir
    );
    // R4-A: a check that could not run is NOT a check that passed. The old
    // sentinel returned success:true here — the exact fail-open this slice kills.
    assert.equal(res.ran, false, 'nothing ran → ran:false');
    assert.notEqual(res.success, true, 'a NOT-RUN result must never report success:true');
    assert.equal(res.command, null);
  });

  test('runVerify — no toolchain markers FAILS LOUDLY (a gate on nothing is not a gate)', () => {
    // R4-A: an empty project runs ZERO checks. It must NOT pass — it must fail
    // with a named reason, and the summary must not claim checks passed.
    const res = verify.runVerify(projectDir);
    assert.equal(res.passed, false, 'no verifiable toolchain must never pass');
    assert.ok(
      res.errors.some((e) => /no-verifiable-toolchain/i.test(e)),
      `the failure must name what was looked for; errors: ${JSON.stringify(res.errors)}`
    );
    assert.ok(!/all .*checks passed/i.test(res.summary), `summary must not claim a pass; got: ${res.summary}`);
  });

  test('runFallbackChecks — package.json triggers lint/type/test checks', () => {
    // A package.json whose scripts succeed, so the fallback reports no errors.
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'tmp',
      scripts: {
        lint: 'node -e "0"',
        typecheck: 'node -e "0"',
        test: 'node -e "0"'
      }
    }));
    const res = verify.runFallbackChecks(projectDir);
    assert.ok('lint' in res.checks);
    assert.ok('types' in res.checks);
    assert.ok('tests' in res.checks);
    assert.deepEqual(res.errors, []);
  });

  test('runFallbackChecks — failing script surfaces an error', () => {
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'tmp',
      scripts: {
        lint: 'node -e "process.exit(1)"',
        test: 'node -e "0"'
      }
    }));
    const res = verify.runFallbackChecks(projectDir);
    assert.ok(res.errors.some(e => /Lint failed/.test(e)));
  });

  test('runVerify — falls back when ctoc quality gate is unavailable, and a REAL passing project passes', () => {
    // No ctoc binary on a clean temp dir; runVerify must use the fallback path.
    // A project with a REAL passing test script verifies something real and passes.
    // (An empty project would fail loudly — pinned in its own test above.)
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'tmp', version: '1.0.0', scripts: { test: 'node -e "process.exit(0)"' }
    }));
    const res = verify.runVerify(projectDir);
    assert.equal(res.method, 'fallback-direct');
    assert.equal(res.passed, true);
    assert.equal(typeof res.summary, 'string');
    assert.deepEqual(res.errors, []);
  });

  test('runVerify — fallback reports failure when a check fails', () => {
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'tmp',
      scripts: { test: 'node -e "process.exit(1)"' }
    }));
    const res = verify.runVerify(projectDir);
    assert.equal(res.method, 'fallback-direct');
    assert.equal(res.passed, false);
    assert.ok(res.summary.includes('failed'));
  });
});

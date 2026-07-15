'use strict';

/**
 * Dark-branch coverage for src/lib/eval-harness.js.
 *
 * The existing suite (tests/lib-quality2-batch.test.js) crosses the happy
 * paths. This file aims exclusively at the branches that were still dark at
 * ~95.09% line coverage AND at the pass/fail SCORING decisions where a
 * "grader always passes" mutant must go RED:
 *
 *   - parseCase: blank line inside a block scalar (line 116); the truly-empty
 *     `key:` / `key: []` fallback (line 144); the inline-list `[a, b, c]`
 *     branch incl. its empty-string filter (lines 152-159).
 *   - validateCase: present-but-empty required field (218-219);
 *     must_not_contain non-array (243-244); timeout_ms non-number (261-262);
 *     flaky non-boolean (265-266); the skill-path `.every` empty-segment
 *     rejection.
 *   - loadCases: evals/ present but evals/skills absent (305-307); the
 *     readFile/parse catch that records loadError (338-339); the
 *     collectCaseFiles readdir catch (359-360). The last two use a fake at
 *     the TRUE fs boundary (safeFs.promises.*), restored in finally — never a
 *     fake of core logic.
 *   - runCase: the `tie` verdict scoring branch incl. the exact >= tieFloor
 *     boundary (481-484); the unknown-verdict fallback (493-494); the exact
 *     >= regressionFloor boundary for verdict A; the arity-0 comparator
 *     factory resolution; the outputB `|| ''` and confidence `|| 0` fallbacks;
 *     baseline/candidate version pass-through.
 *   - aggregateVerdicts: unknown severity → medium weight fallback and the
 *     by_severity guard; missing severity → 'medium' default.
 *
 * Every test pins a branch that goes RED under mutation — none survive a
 * trivially-wrong "always pass / always B" implementation. Authored by an AI
 * assistant and read line-by-line before commit (skill: human-review clause).
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const harness = require('../src/lib/eval-harness');
const safeFs = require('../src/lib/safe-fs');

// ---------------------------------------------------------------------------
// Real-tmpdir fixture helpers (no mocking of eval-harness internals)
// ---------------------------------------------------------------------------

const createdDirs = [];

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

function writeFile(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

after(() => {
  for (const dir of createdDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — a leaked tmp dir must not fail the suite.
    }
  }
});

function baseCase(overrides = {}) {
  return {
    id: 'sql-injection',
    skill: 'security/threat-modeler',
    description: 'Detects SQL injection',
    input: 'SELECT * FROM users WHERE id = $x',
    expected_output: 'parameterized query',
    expected_findings: ['SQL injection'],
    must_not_contain: ['looks fine'],
    severity_when_fails: 'critical',
    contributed_by: 'tester',
    added_in_version: '1.0.0',
    last_verified: '2026-01-01',
    ...overrides,
  };
}

// ===========================================================================
// parseCase — dark structural branches
// ===========================================================================

describe('eval-harness parseCase — dark structural branches', () => {
  test('preserves_a_blank_line_inside_a_block_scalar', () => {
    // Arrange — a `|` block whose body has an interior empty line (line 116).
    const yaml = [
      'input: |',
      '  first',
      '',
      '  third',
      'id: x',
    ].join('\n');

    // Act
    const obj = harness.parseCase(yaml);

    // Assert — the empty line is retained as '' between the two content lines,
    // not collapsed away. A mutant dropping the blank-line push loses it.
    assert.equal(obj.input, 'first\n\nthird');
  });

  test('empty_bracket_value_becomes_an_empty_array_not_a_string', () => {
    // Arrange — `key: []` with no following `- ` item (line 144, [] branch).
    const yaml = 'tags: []\nid: x';

    // Act
    const obj = harness.parseCase(yaml);

    // Assert — [] must coerce to an array, distinguishing it from bare `key:`.
    assert.deepEqual(obj.tags, []);
  });

  test('bare_empty_key_with_no_list_item_becomes_empty_string', () => {
    // Arrange — `notes:` empty, immediately followed by another top-level key
    // so the list peek-ahead fails (line 144, '' branch).
    const yaml = 'notes:\nid: x';

    // Act
    const obj = harness.parseCase(yaml);

    // Assert — falls through to '' (not [], not undefined).
    assert.equal(obj.notes, '');
    assert.equal(obj.id, 'x');
  });

  test('inline_bracket_list_is_split_coerced_and_empty_filtered', () => {
    // Arrange — inline list with a trailing/empty slot and numeric items
    // exercises the split → coerceScalar → filter('' removed) chain (152-159).
    const yaml = 'references: [alpha, , 7]\nid: x';

    // Act
    const obj = harness.parseCase(yaml);

    // Assert — the empty middle slot is filtered out; `7` is coerced to a
    // number. A mutant deleting the `.filter(s => s !== '')` leaves a '' item.
    assert.deepEqual(obj.references, ['alpha', 7]);
  });
});

// ===========================================================================
// validateCase — dark type-guard branches
// ===========================================================================

describe('eval-harness validateCase — dark type-guard branches', () => {
  test('present_but_empty_required_field_is_reported_as_empty', () => {
    // Arrange — description is PRESENT (so not "missing") but '' (218-219).
    const caseObj = baseCase({ description: '' });

    // Act
    const res = harness.validateCase(caseObj);

    // Assert — distinct message from the missing-field path.
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e === 'required field is empty: description'),
      `errors: ${res.errors.join(' | ')}`);
    assert.ok(!res.errors.some((e) => /missing required field: description/.test(e)));
  });

  test('must_not_contain_present_but_not_a_list_is_rejected', () => {
    // Arrange (243-244) — string where a list is required.
    const res = harness.validateCase(baseCase({ must_not_contain: 'nope' }));

    // Assert
    assert.ok(res.errors.some((e) => e === 'must_not_contain must be a list'),
      `errors: ${res.errors.join(' | ')}`);
  });

  test('timeout_ms_present_but_not_a_number_is_rejected', () => {
    // Arrange (261-262)
    const res = harness.validateCase(baseCase({ timeout_ms: 'soon' }));

    // Assert
    assert.ok(res.errors.some((e) => e === 'timeout_ms must be a number when present'),
      `errors: ${res.errors.join(' | ')}`);
  });

  test('flaky_present_but_not_a_boolean_is_rejected', () => {
    // Arrange (265-266)
    const res = harness.validateCase(baseCase({ flaky: 'yes' }));

    // Assert
    assert.ok(res.errors.some((e) => e === 'flaky must be a boolean when present'),
      `errors: ${res.errors.join(' | ')}`);
  });

  test('skill_path_with_a_trailing_empty_segment_is_rejected', () => {
    // Arrange — "security/" splits to ['security',''] : length>=2 but the
    // empty segment fails `.every`. Kills a mutant that drops the per-segment
    // check and passes on segment-count alone.
    const res = harness.validateCase(baseCase({ skill: 'security/' }));

    // Assert
    assert.ok(res.errors.some((e) => /category\/skill-name/.test(e)),
      `errors: ${res.errors.join(' | ')}`);
  });

  test('three_segment_skill_path_is_accepted', () => {
    // Arrange — a/b/c has 3 valid segments; confirms `>= 2` is a floor, not
    // an equality (kills a `=== 2` mutant).
    const res = harness.validateCase(baseCase({ skill: 'saas/stripe/subscriptions' }));

    // Assert — no skill-path error among any errors.
    assert.ok(!res.errors.some((e) => /category\/skill-name/.test(e)),
      `errors: ${res.errors.join(' | ')}`);
  });
});

// ===========================================================================
// loadCases — filesystem error / absence branches
// ===========================================================================

describe('eval-harness loadCases — fs absence and error branches', () => {
  test('evals_present_but_skills_subdir_absent_returns_empty', async () => {
    // Arrange — evals/ exists (with a stray file) but evals/skills does not,
    // so the skills stat throws and skillsExists stays false (305-307).
    const root = makeTempDir('ctoc-eh-noskills-');
    writeFile(root, path.join('evals', 'README.txt'), 'not skills');

    // Act
    const res = await harness.loadCases(root);

    // Assert — a clean empty result, not a crash and not the outer-evals path.
    assert.deepEqual(res, []);
  });

  test('readFile_failure_is_captured_as_loadError_not_thrown', async () => {
    // Arrange — a valid case tree so a file is collected, then fake the fs
    // boundary so readFile throws for that file (338-339). safeFs is the
    // audited fs choke point — faking it here is a boundary fake, never a
    // fake of eval-harness logic.
    const root = makeTempDir('ctoc-eh-readfail-');
    writeFile(
      root,
      path.join('evals', 'skills', 'security', 'threat-modeler', 'cases', 'c.yaml'),
      'id: x\n',
    );
    const realReadFile = safeFs.promises.readFile;
    safeFs.promises.readFile = async () => {
      throw new Error('EIO synthetic read failure');
    };

    try {
      // Act
      const res = await harness.loadCases(root);

      // Assert — the entry is still returned, with loadError populated and no
      // exception escaping loadCases. A mutant that lets the throw propagate,
      // or that drops the assignment, goes RED.
      assert.equal(res.length, 1);
      assert.ok(res[0].loadError instanceof Error);
      assert.match(res[0].loadError.message, /synthetic read failure/);
      assert.equal(res[0].caseObj, null);
    } finally {
      safeFs.promises.readFile = realReadFile;
    }
  });

  test('readdir_failure_on_a_case_dir_is_swallowed_and_yields_no_files', async () => {
    // Arrange — real tree, but the fs boundary throws when the `cases`
    // directory is read (collectCaseFiles walk catch, 359-360).
    const root = makeTempDir('ctoc-eh-readdirfail-');
    writeFile(
      root,
      path.join('evals', 'skills', 'security', 'threat-modeler', 'cases', 'c.yaml'),
      'id: x\n',
    );
    const realReaddir = safeFs.promises.readdir;
    safeFs.promises.readdir = async (dir, opts) => {
      if (String(dir).split(path.sep).pop() === 'cases') {
        throw new Error('EACCES synthetic readdir failure');
      }
      return realReaddir(dir, opts);
    };

    try {
      // Act
      const res = await harness.loadCases(root);

      // Assert — the unreadable dir is skipped (walk returns), producing an
      // empty result rather than propagating the error.
      assert.deepEqual(res, []);
    } finally {
      safeFs.promises.readdir = realReaddir;
    }
  });
});

// ===========================================================================
// runCase — scoring discrimination (the grader must NOT always pass)
// ===========================================================================

describe('eval-harness runCase — verdict scoring branches', () => {
  const passingCase = () => baseCase({ expected_findings: ['SQL injection'], must_not_contain: ['looks fine'] });
  const goodOutput = 'Found SQL injection; parameterize the query.';

  test('tie_verdict_at_exactly_the_tie_floor_passes', async () => {
    // Arrange — winner 'tie', confidence == tieFloor exercises `>=` (481).
    const comparator = (_c) => ({ winner: 'tie', confidence: 0.6, outputB: goodOutput });

    // Act — default tieFloor is 0.6.
    const res = await harness.runCase(passingCase(), { comparator });

    // Assert — boundary is inclusive; a `>` mutant would fail here.
    assert.equal(res.passed, true);
    assert.equal(res.judge_verdict, 'tie');
    assert.deepEqual(res.reasons, []);
  });

  test('tie_verdict_just_below_the_tie_floor_fails_with_reason', async () => {
    // Arrange (481-484) — confidence one tick under the floor.
    const comparator = (_c) => ({ winner: 'tie', confidence: 0.59, outputB: goodOutput });

    // Act
    const res = await harness.runCase(passingCase(), { comparator });

    // Assert — fails AND records the below-floor reason. A "tie always passes"
    // mutant goes RED.
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some((r) => /below floor 0\.6/.test(r)),
      `reasons: ${res.reasons.join(' | ')}`);
  });

  test('tie_verdict_honours_a_custom_tie_floor', async () => {
    // Arrange — custom tieFloor exercises the `typeof opts.tieFloor === number`
    // true branch and the second operand of the ternary.
    const comparator = (_c) => ({ winner: 'tie', confidence: 0.5, outputB: goodOutput });

    // Act — with tieFloor 0.5 a 0.5 tie passes; with the default 0.6 it would
    // fail, so this pins that the injected floor is actually used.
    const res = await harness.runCase(passingCase(), { comparator, tieFloor: 0.5 });

    // Assert
    assert.equal(res.passed, true);
  });

  test('unknown_verdict_from_comparator_fails', async () => {
    // Arrange (492-494) — winner is none of B / tie / A.
    const comparator = (_c) => ({ winner: 'C', confidence: 1, outputB: goodOutput });

    // Act
    const res = await harness.runCase(passingCase(), { comparator });

    // Assert — never silently passes an unrecognised verdict.
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some((r) => /unknown verdict from comparator: C/.test(r)),
      `reasons: ${res.reasons.join(' | ')}`);
    assert.equal(res.judge_verdict, 'C');
  });

  test('baseline_win_at_exactly_the_regression_floor_is_a_regression', async () => {
    // Arrange — winner 'A', confidence == regressionFloor exercises `>=` (486).
    const comparator = (_c) => ({ winner: 'A', confidence: 0.6, outputB: goodOutput });

    // Act — default regressionFloor is 0.6.
    const res = await harness.runCase(passingCase(), { comparator });

    // Assert — inclusive boundary: this is a fail, a `>` mutant would pass it.
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some((r) => /regression/.test(r)),
      `reasons: ${res.reasons.join(' | ')}`);
  });

  test('missing_outputB_defaults_to_empty_string_and_findings_go_missing', async () => {
    // Arrange — comparator returns winner 'B' but omits outputB entirely,
    // exercising `(comparison && comparison.outputB) || ''` (line 457).
    const comparator = (_c) => ({ winner: 'B', confidence: 0.9 });

    // Act — with candidateOutput '' the expected finding cannot be found.
    const res = await harness.runCase(passingCase(), { comparator });

    // Assert — even a winning verdict fails when required findings are absent.
    // Kills a mutant that treats a missing outputB as a pass.
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some((r) => /missing expected findings/.test(r)),
      `reasons: ${res.reasons.join(' | ')}`);
  });

  test('missing_confidence_defaults_to_zero', async () => {
    // Arrange — verdict 'B' (always passes on verdict) but no confidence field
    // exercises the `typeof comparison.confidence === number ? ... : 0`
    // fallback (line 475).
    const comparator = (_c) => ({ winner: 'B', outputB: goodOutput });

    // Act
    const res = await harness.runCase(passingCase(), { comparator });

    // Assert — result surfaces confidence 0, not undefined/NaN.
    assert.equal(res.passed, true);
    assert.equal(res.confidence, 0);
  });

  test('arity_zero_comparator_is_resolved_as_a_factory', async () => {
    // Arrange — an arity-0 comparator is treated as a factory returning the
    // real compare fn (lines 426-428). The inner fn takes args (arity > 0).
    let factoryCalled = false;
    const factory = () => {
      factoryCalled = true;
      return (_c, _b, _cand, _o) => ({ winner: 'B', confidence: 0.9, outputB: goodOutput });
    };

    // Act
    const res = await harness.runCase(passingCase(), { comparator: factory });

    // Assert — the factory was invoked and its returned fn scored the case.
    assert.equal(factoryCalled, true);
    assert.equal(res.passed, true);
  });

  test('explicit_baseline_and_candidate_versions_reach_the_comparator', async () => {
    // Arrange — capture the version args to pin the `opts.x || default`
    // pass-through (the first operand, non-default values).
    let seen = null;
    const comparator = (_c, baseline, candidate) => {
      seen = { baseline, candidate };
      return { winner: 'B', confidence: 0.9, outputB: goodOutput };
    };

    // Act
    await harness.runCase(passingCase(), {
      comparator,
      baselineVersion: 'v1.2.3',
      candidateVersion: 'feature-branch',
    });

    // Assert — the explicit refs are threaded through, not the 'main'/'HEAD'
    // defaults. A mutant hardcoding the defaults goes RED.
    assert.deepEqual(seen, { baseline: 'v1.2.3', candidate: 'feature-branch' });
  });

  test('forbidden_string_fails_even_when_verdict_is_a_pass', async () => {
    // Arrange — winner 'B' (pass) but the output contains a must_not_contain
    // string; pins the final AND (foundForbidden.length === 0) as load-bearing.
    const comparator = (_c) => ({
      winner: 'B',
      confidence: 0.9,
      outputB: 'SQL injection; parameterize. Honestly it looks fine though.',
    });

    // Act
    const res = await harness.runCase(passingCase(), { comparator });

    // Assert
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some((r) => /forbidden strings/.test(r)),
      `reasons: ${res.reasons.join(' | ')}`);
  });
});

// ===========================================================================
// aggregateVerdicts — severity fallback branches
// ===========================================================================

describe('eval-harness aggregateVerdicts — severity fallbacks', () => {
  test('unknown_severity_weights_as_medium_and_skips_the_bucket', async () => {
    // Arrange — a severity outside the known set exercises both
    // `SEVERITY_WEIGHT[sev] || SEVERITY_WEIGHT.medium` and the
    // `if (summary.by_severity[sev])` guard.
    const verdicts = [
      { caseObj: { severity_when_fails: 'bogus' }, result: { passed: true } },
    ];

    // Act
    const s = harness.aggregateVerdicts(verdicts);

    // Assert — counted in totals; weighted at medium (1.0 / 1.0 = 1); no
    // phantom by_severity bucket is created for the unknown key.
    assert.equal(s.total, 1);
    assert.equal(s.passed, 1);
    assert.equal(s.weighted_pass_rate, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(s.by_severity, 'bogus'), false);
    assert.equal(s.by_severity.critical.passed, 0);
  });

  test('missing_severity_defaults_to_medium_bucket', () => {
    // Arrange — no severity_when_fails at all exercises the `|| 'medium'`
    // default on line 557.
    const verdicts = [
      { caseObj: {}, result: { passed: false } },
    ];

    // Act
    const s = harness.aggregateVerdicts(verdicts);

    // Assert — the failure lands in the medium bucket, weighted as medium.
    assert.equal(s.total, 1);
    assert.equal(s.failed, 1);
    assert.equal(s.by_severity.medium.failed, 1);
    assert.equal(s.weighted_pass_rate, 0);
  });
});

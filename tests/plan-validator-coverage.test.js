/**
 * Plan Validator — dark-branch coverage tests.
 *
 * These tests target the REJECTION / warning / error / fallback branches of
 * src/lib/plan-validator.js that the existing tests/plan-validator.test.js never
 * reaches: the whole validateForReview aggregator and its non-exported
 * sub-validators (escalations, acceptance criteria, instruction adherence),
 * validateVisionForDecomposition, validateParentPlan's dangling/resolved paths,
 * validateReviewToDone's unreadable/failing/stale-evidence paths, the
 * contradiction script + skipped-tests patterns, and the Step 8 / Step 14
 * label-content rejections.
 *
 * Every test pins a branch that goes RED under mutation of the production line
 * it exercises — none of them pass against a happy-path-only implementation.
 *
 * AI-generated, human-reviewed line-by-line (per unit-test-writer skill).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test, describe, beforeEach, afterEach } = require('node:test');

const validator = require('../src/lib/plan-validator');
const { verifyEvidencePath } = require('../src/lib/step-13-verify');

// A full "## Execution Plan" with every required Iron Loop step present and
// ticked. Used as the compliant base; individual tests mutate one step.
const FULL_EXEC = [
  '## Execution Plan',
  '',
  '### Step 8: TEST',
  '- [x] wrote failing tests first',
  '',
  '### Step 9: PREPARE',
  '- [x] prepared env',
  '',
  '### Step 10: IMPLEMENT',
  '- [x] implemented feature',
  '',
  '### Step 11: REVIEW',
  '- [x] self reviewed',
  '',
  '### Step 12: OPTIMIZE',
  '- [x] optimized',
  '',
  '### Step 13: SECURE',
  '- [x] validated inputs',
  '',
  '### Step 14: VERIFY',
  '- [x] all green, 0 skipped, 0 flaky',
  '',
  '### Step 15: DOCUMENT',
  '- [x] docs updated',
  '',
  '### Step 16: FINAL-REVIEW',
  '- [x] ready for review',
  '',
].join('\n');

describe('plan-validator dark-branch coverage', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pv-cov-'));
    // stage dirs used by planSlugExists and the review gate
    for (const stage of ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
      fs.mkdirSync(path.join(testDir, 'plans', stage), { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function writePlan(name, content) {
    const p = path.join(testDir, `${name}.md`);
    fs.writeFileSync(p, content);
    return p;
  }

  function writeEvidence(planSlug, obj) {
    const ep = verifyEvidencePath(testDir, planSlug);
    fs.mkdirSync(path.dirname(ep), { recursive: true });
    fs.writeFileSync(ep, JSON.stringify(obj, null, 2));
    return ep;
  }

  // ========================================================================
  // validateForReview — escalations sub-validator (lines 59-65, 205-238)
  // ========================================================================

  test('validateForReview_flags_inline_SKIPPED_step_without_approval_as_error', () => {
    // Arrange — a required step marked SKIPPED on its heading line, no approval.
    const exec = FULL_EXEC.replace(
      '### Step 13: SECURE\n- [x] validated inputs',
      '### Step 13: SECURE SKIPPED\n- [ ] not done'
    );
    const p = writePlan('esc-unapproved', `# Plan\n\n${exec}`);

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert — validateEscalations error must surface and flip the aggregate.
    assert.equal(result.valid, false, 'unapproved SKIPPED step must fail the review gate');
    assert.ok(
      result.errors.some((e) => /Step 13.*SKIPPED.*without escalation approval/i.test(e)),
      `expected an escalation error, got: ${JSON.stringify(result.errors)}`
    );
    assert.ok(result.checklist.escalations, 'escalations checklist must be attached');
  });

  test('validateForReview_accepts_SKIPPED_step_when_REASON_justification_is_present', () => {
    // Arrange — same SKIPPED step but with an inline REASON: on the same line.
    const exec = FULL_EXEC.replace(
      '### Step 13: SECURE\n- [x] validated inputs',
      '### Step 13: SECURE SKIPPED REASON: covered by upstream gate\n- [x] noted'
    );
    const p = writePlan('esc-approved', `# Plan\n\n${exec}`);

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert — the approval keyword suppresses the escalation error (2nd operand
    // of the hasApproval test).
    assert.ok(
      !result.errors.some((e) => /without escalation approval/i.test(e)),
      `justified skip must not raise an escalation error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('validateForReview_flags_metadata_skipped_steps_without_skips_approved', () => {
    // Arrange — frontmatter declares skipped steps but no approval marker.
    const p = writePlan('meta-skip', `---\nskipped_steps: 12\n---\n\n# Plan\n\nBody only.\n`);

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => /skipped steps \(12\) without approval/i.test(e)),
      `expected a metadata-skip error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('validateForReview_metadata_skipped_steps_with_skips_approved_raises_no_skip_error', () => {
    // Arrange — skips_approved: true satisfies the guard.
    const p = writePlan('meta-skip-ok', `---\nskipped_steps: 12\nskips_approved: true\n---\n\n# Plan\n\nBody.\n`);

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert — kills the mutant that ignores skips_approved.
    assert.ok(
      !result.errors.some((e) => /without approval in metadata/i.test(e)),
      `approved skips must not error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('validateForReview_flags_a_created_file_claim_that_does_not_exist', () => {
    // Arrange — an inline "Created `x.js`" claim, no files: declaration, absent
    // on disk: validateNoContradictions must error and validateForReview must
    // aggregate that error and flip valid (step-4 aggregation branch).
    const p = writePlan('contradiction',
      '# Plan\n\nCreated `src/gone/nowhere-xyz.js` for the feature.\n');

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => /nowhere-xyz\.js.*claimed as created but doesn't exist/i.test(e)),
      `expected a contradiction error, got: ${JSON.stringify(result.errors)}`
    );
    assert.ok(result.checklist.contradictions, 'contradictions checklist must be attached');
  });

  // ========================================================================
  // validateForReview — validateStepsComplete skipped-required warning (156-158)
  // ========================================================================

  test('validateForReview_warns_when_required_step_is_skipped_but_present', () => {
    // Arrange — Step 13 present but marked SKIPPED with an open checkbox: it is
    // "skipped", so it must NOT be reported missing, but MUST raise the
    // escalation-approval WARNING.
    const exec = FULL_EXEC.replace(
      '### Step 13: SECURE\n- [x] validated inputs',
      '### Step 13: SECURE SKIPPED\n- [ ] pending'
    );
    const p = writePlan('skip-warn', `# Plan\n\n${exec}`);

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert
    assert.ok(
      result.warnings.some((w) => /Step 13 \(SECURE\) was skipped - requires escalation approval/i.test(w)),
      `expected the skipped-step warning, got: ${JSON.stringify(result.warnings)}`
    );
    assert.ok(
      !result.errors.some((e) => /Step 13 \(SECURE\) is required but not addressed/i.test(e)),
      'a skipped-but-present step must not be reported missing'
    );
  });

  // ========================================================================
  // validateForReview — acceptance-criteria sub-validator (68-74, 258-285)
  // ========================================================================

  test('validateForReview_errors_when_acceptance_criteria_boxes_are_unchecked', () => {
    // Arrange — 1 of 2 criteria unchecked.
    const p = writePlan('crit-unchecked',
      '# Plan\n\n## Acceptance Criteria\n- [x] first done\n- [ ] second pending\n');

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert — boundary: totalBoxes>0 && uncheckedBoxes>0.
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => /1 of 2 acceptance criteria not checked/i.test(e)),
      `expected an unchecked-criteria error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('validateForReview_does_not_error_when_all_acceptance_criteria_are_checked', () => {
    // Arrange — every box ticked.
    const p = writePlan('crit-checked',
      '# Plan\n\n## Acceptance Criteria\n- [x] first\n- [x] second\n');

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert — kills the mutant that always reports unchecked criteria; also
    // pins the checklist counts.
    assert.ok(
      !result.errors.some((e) => /acceptance criteria not checked/i.test(e)),
      `fully-checked criteria must not error, got: ${JSON.stringify(result.errors)}`
    );
    assert.deepEqual(result.checklist.criteria.criteria, { total: 2, checked: 2, unchecked: 0 });
  });

  test('validateForReview_warns_when_no_acceptance_criteria_section_exists', () => {
    // Arrange — no "acceptance criteria"/"definition of done"/"requirements" text.
    const p = writePlan('crit-none', '# Plan\n\nJust a description of the work.\n');

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert
    assert.ok(
      result.warnings.some((w) => /No explicit acceptance criteria section found/i.test(w)),
      `expected the missing-section warning, got: ${JSON.stringify(result.warnings)}`
    );
  });

  test('validateForReview_warns_when_acceptance_section_present_but_has_zero_checkboxes', () => {
    // Arrange — section heading present, prose only, no checkbox syntax.
    const p = writePlan('crit-zero',
      '# Plan\n\n## Acceptance Criteria\nEverything must work end to end.\n\n## Notes\ndone\n');

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert — the totalBoxes===0 branch.
    assert.ok(
      result.warnings.some((w) => /No checkbox-style acceptance criteria found/i.test(w)),
      `expected the zero-checkbox warning, got: ${JSON.stringify(result.warnings)}`
    );
  });

  // ========================================================================
  // validateForReview — instruction-adherence sub-validator (86-92, 454-472)
  // ========================================================================

  test('validateForReview_warns_when_user_asked_for_CLI_but_plan_mentions_GUI', () => {
    // Arrange
    const p = writePlan('instr-cli',
      '# Plan\n\nuser said: "use the CLI"\n\nWe expose a GUI dashboard for it.\n');

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert
    assert.ok(
      result.warnings.some((w) => /User requested CLI approach but implementation mentions manual\/GUI/i.test(w)),
      `expected a CLI/GUI contradiction warning, got: ${JSON.stringify(result.warnings)}`
    );
  });

  test('validateForReview_does_not_warn_when_user_asked_for_CLI_and_plan_has_no_manual_or_gui', () => {
    // Arrange — CLI instruction, but no manual/gui/interface/web mention.
    const p = writePlan('instr-cli-clean',
      '# Plan\n\nuser said: "use the CLI"\n\nShip a small command that prints a report.\n');

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert — kills the mutant that fires the warning regardless of usedManual
    // (the 2nd operand of the CLI branch).
    assert.ok(
      !result.warnings.some((w) => /CLI approach but implementation mentions manual\/GUI/i.test(w)),
      `no contradiction present, must not warn, got: ${JSON.stringify(result.warnings)}`
    );
  });

  test('validateForReview_warns_when_user_asked_for_automated_but_plan_mentions_manual', () => {
    // Arrange
    const p = writePlan('instr-auto',
      '# Plan\n\nuser requested: "fully automated deploy"\n\nOperators run the release manually.\n');

    // Act
    const result = validator.validateForReview(p, testDir);

    // Assert
    assert.ok(
      result.warnings.some((w) => /User requested automated approach but implementation mentions manual/i.test(w)),
      `expected an automated/manual contradiction warning, got: ${JSON.stringify(result.warnings)}`
    );
  });

  // ========================================================================
  // validateNoContradictions — script pattern (367-389) & skipped-tests (392-408)
  // ========================================================================

  test('validateNoContradictions_warns_when_path_like_script_reference_is_missing', () => {
    // Arrange — a slash-bearing script path that does not exist on disk.
    const content = '# Plan\n\nrun `scripts/deploy.sh` to release.\n';

    // Act
    const result = validator.validateNoContradictions(content, testDir);

    // Assert
    assert.ok(
      result.warnings.some((w) => /deploy\.sh.*referenced but not found/i.test(w)),
      `missing path-like script must warn, got: ${JSON.stringify(result.warnings)}`
    );
  });

  test('validateNoContradictions_ignores_bare_command_name_that_is_not_a_local_path', () => {
    // Arrange — bare "build.sh": no slash, not a relative path → treated as a
    // command, skipped by the continue guard.
    const content = '# Plan\n\nrun `build.sh` in CI.\n';

    // Act
    const result = validator.validateNoContradictions(content, testDir);

    // Assert — kills the mutant that drops the "looks like a local path" guard.
    assert.ok(
      !result.warnings.some((w) => /build\.sh.*referenced but not found/i.test(w)),
      `bare command must not warn, got: ${JSON.stringify(result.warnings)}`
    );
  });

  test('validateNoContradictions_warns_when_step8_skipped_but_test_files_exist', () => {
    // Arrange — Step 8 SKIP marker AND a real tests/ directory present.
    fs.mkdirSync(path.join(testDir, 'tests'), { recursive: true });
    const content = '# Plan\n\nStep 8: SKIPPED because coverage looks fine.\n';

    // Act
    const result = validator.validateNoContradictions(content, testDir);

    // Assert — checkForTestFiles true-branch.
    assert.ok(
      result.warnings.some((w) => /Step 8 \(TEST\) marked as skipped but test files exist/i.test(w)),
      `expected the step-8-skip-but-tests-exist warning, got: ${JSON.stringify(result.warnings)}`
    );
  });

  test('validateNoContradictions_does_not_warn_when_step8_skipped_and_no_test_files', () => {
    // Arrange — same skip marker, but no tests/ dir anywhere under root.
    const content = '# Plan\n\nStep 8: SKIPPED because coverage looks fine.\n';

    // Act
    const result = validator.validateNoContradictions(content, testDir);

    // Assert — checkForTestFiles false-branch: no warning.
    assert.ok(
      !result.warnings.some((w) => /marked as skipped but test files exist/i.test(w)),
      `no test files → no warning, got: ${JSON.stringify(result.warnings)}`
    );
  });

  // ========================================================================
  // validateVisionForDecomposition (675-717)
  // ========================================================================

  test('validateVisionForDecomposition_passes_when_all_four_dimensions_present', () => {
    // Arrange
    const p = writePlan('vision-full',
      '# Vision\n\nThe problem: teams lose context.\nFor whom: engineers.\nsuccess criteria: faster onboarding.\nscope: only onboarding.\n');

    // Act
    const result = validator.validateVisionForDecomposition(p, testDir);

    // Assert
    assert.equal(result.valid, true, `complete vision must pass, errors: ${JSON.stringify(result.errors)}`);
    assert.equal(result.errors.length, 0);
  });

  test('validateVisionForDecomposition_errors_when_problem_statement_absent', () => {
    // Arrange — audience + success + scope present, no "problem" token.
    const p = writePlan('vision-no-problem',
      '# Vision\n\nFor whom: engineers.\nsuccess criteria: onboarding.\nscope: onboarding only.\n');

    // Act
    const result = validator.validateVisionForDecomposition(p, testDir);

    // Assert
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /Missing problem statement/i.test(e)),
      `expected missing-problem error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateVisionForDecomposition_errors_when_target_audience_absent', () => {
    // Arrange — problem + success + scope, but nothing matching for whom/target/
    // audience/users.
    const p = writePlan('vision-no-audience',
      '# Vision\n\nThe problem is real.\nsuccess criteria: it ships.\nscope: narrow.\n');

    // Act
    const result = validator.validateVisionForDecomposition(p, testDir);

    // Assert
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /Missing target audience/i.test(e)),
      `expected missing-audience error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateVisionForDecomposition_errors_when_success_criteria_absent', () => {
    // Arrange — problem + audience + scope, no "success" token.
    const p = writePlan('vision-no-success',
      '# Vision\n\nThe problem hurts users.\nscope: narrow boundaries.\n');

    // Act
    const result = validator.validateVisionForDecomposition(p, testDir);

    // Assert
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /Missing success criteria/i.test(e)),
      `expected missing-success error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateVisionForDecomposition_warns_but_passes_when_only_scope_absent', () => {
    // Arrange — problem + audience + success, no scope/boundaries token. Scope is
    // a WARNING, not an error, so valid stays true.
    const p = writePlan('vision-no-scope',
      '# Vision\n\nThe problem is churn.\nfor whom: admins.\nsuccess criteria: retention up.\n');

    // Act
    const result = validator.validateVisionForDecomposition(p, testDir);

    // Assert
    assert.equal(result.valid, true, `missing scope is warn-only, errors: ${JSON.stringify(result.errors)}`);
    assert.ok(result.warnings.some((w) => /Missing scope\/boundaries/i.test(w)),
      `expected a scope warning, got: ${JSON.stringify(result.warnings)}`);
  });

  // ========================================================================
  // validateParentPlan + planSlugExists (856-880, 915-926)
  // ========================================================================

  test('validateParentPlan_resolves_a_stage_prefixed_parent_reference', () => {
    // Arrange — parent file lives under plans/implementation; the reference
    // carries a stage prefix that must be stripped to the bare slug.
    fs.writeFileSync(path.join(testDir, 'plans', 'implementation', 'parent-real.md'), '# parent');
    const content = '---\nparent_plan: implementation/parent-real\n---\n\n# Child\n';

    // Act
    const result = validator.validateParentPlan(content, testDir);

    // Assert — kills the mutant that skips the basename strip (would not resolve).
    assert.equal(result.checklist.parentPlan.resolved, true);
    assert.ok(!result.warnings.some((w) => /dangling reference/i.test(w)),
      `resolvable parent must not warn, got: ${JSON.stringify(result.warnings)}`);
  });

  test('validateParentPlan_warns_but_does_not_fail_on_a_dangling_parent_reference', () => {
    // Arrange — no plan file named ghost-xyz anywhere.
    const content = '---\nparent_plan: ghost-xyz\n---\n\n# Child\n';

    // Act
    const result = validator.validateParentPlan(content, testDir);

    // Assert — dangling is a WARNING; valid must remain true (D-VP-3).
    assert.equal(result.valid, true, 'dangling parent must never flip valid');
    assert.equal(result.checklist.parentPlan.resolved, false);
    assert.ok(result.warnings.some((w) => /parent_plan "ghost-xyz" names no existing plan/i.test(w)),
      `expected a dangling-reference warning, got: ${JSON.stringify(result.warnings)}`);
  });

  // ========================================================================
  // validateReviewToDone — dark rejection paths (581-585, 610-615, 629-650)
  // ========================================================================

  test('validateReviewToDone_fails_closed_when_the_plan_file_is_unreadable', () => {
    // Arrange — a path that does not exist → readFileSync throws.
    const missing = path.join(testDir, 'plans', 'review', 'does-not-exist.md');

    // Act
    const result = validator.validateReviewToDone(missing, testDir);

    // Assert
    assert.equal(result.valid, false);
    assert.equal(result.checklist.readable, false);
    assert.ok(result.errors.some((e) => /plan file is unreadable/i.test(e)),
      `expected an unreadable-plan error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateReviewToDone_blocks_when_a_required_step_checkbox_is_unchecked', () => {
    // Arrange — compliant except Step 14 VERIFY has an open checkbox. Fresh
    // passing evidence isolates the unchecked-box path as the failure.
    const exec = FULL_EXEC.replace(
      '### Step 14: VERIFY\n- [x] all green, 0 skipped, 0 flaky',
      '### Step 14: VERIFY\n- [ ] not run yet'
    );
    const p = writePlan('unchecked-14', `---\napproved_by: human\n---\n\n# Plan\n\n${exec}`);
    const mtime = fs.statSync(p).mtimeMs;
    writeEvidence('unchecked-14', {
      planSlug: 'unchecked-14',
      timestamp: new Date(mtime + 60000).toISOString(),
      passed: true, errors: [], summary: 'ok',
    });

    // Act
    const result = validator.validateReviewToDone(p, testDir);

    // Assert — the present-required-but-unchecked promotion (loop at 607-615).
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /Step 14 \(VERIFY\) has an unchecked required checkbox/i.test(e)),
      `expected an unchecked-checkbox error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateReviewToDone_blocks_and_names_the_detail_when_recorded_VERIFY_run_failed', () => {
    // Arrange — approval + fully-checked steps, but evidence records a FAILED run.
    const p = writePlan('verify-failed', `---\napproved_by: human\n---\n\n# Plan\n\n${FULL_EXEC}`);
    const mtime = fs.statSync(p).mtimeMs;
    writeEvidence('verify-failed', {
      planSlug: 'verify-failed',
      timestamp: new Date(mtime + 60000).toISOString(),
      passed: false,
      errors: ['lint failed', '2 tests red'],
      summary: 'run failed',
    });

    // Act
    const result = validator.validateReviewToDone(p, testDir);

    // Assert — the failure message must carry the joined detail, not a generic string.
    assert.equal(result.valid, false);
    assert.equal(result.checklist.verifyEvidence.passed, false);
    assert.ok(result.errors.some((e) => /recorded VERIFY run failed: lint failed; 2 tests red/i.test(e)),
      `expected the detailed failing-run error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateReviewToDone_blocks_when_VERIFY_evidence_predates_the_plans_last_change', () => {
    // Arrange — passing evidence, but timestamped BEFORE the plan's mtime.
    const p = writePlan('stale-ev', `---\napproved_by: human\n---\n\n# Plan\n\n${FULL_EXEC}`);
    const mtime = fs.statSync(p).mtimeMs;
    writeEvidence('stale-ev', {
      planSlug: 'stale-ev',
      timestamp: new Date(mtime - 60000).toISOString(),
      passed: true, errors: [], summary: 'old run',
    });

    // Act
    const result = validator.validateReviewToDone(p, testDir);

    // Assert — evidenceMs < planMtimeMs branch.
    assert.equal(result.valid, false);
    assert.equal(result.checklist.verifyEvidence.stale, true);
    assert.ok(result.errors.some((e) => /VERIFY evidence is stale/i.test(e)),
      `expected a stale-evidence error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateReviewToDone_treats_evidence_with_no_timestamp_as_stale', () => {
    // Arrange — passing evidence but no timestamp → Date.parse → NaN.
    const p = writePlan('notime-ev', `---\napproved_by: human\n---\n\n# Plan\n\n${FULL_EXEC}`);
    writeEvidence('notime-ev', {
      planSlug: 'notime-ev',
      passed: true, errors: [], summary: 'no timestamp',
    });

    // Act
    const result = validator.validateReviewToDone(p, testDir);

    // Assert — kills the mutant that treats a missing timestamp as fresh
    // (Number.isNaN(evidenceMs) operand).
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /VERIFY evidence is stale/i.test(e)),
      `missing timestamp must read as stale, got: ${JSON.stringify(result.errors)}`);
  });

  // ========================================================================
  // validateStepLabels — Step 8 content (1086-1099) & Step 14 content (1101-1114)
  // ========================================================================

  // A structurally-valid plan (steps 8-16, one each, ascending, canonical). The
  // Step 8 / Step 14 tests mutate ONLY that step's body, so the ONLY defect is
  // the label-content rule under test.
  const VALID_PLAN = [
    '# Plan', '', '## Scope', 'Do it.', '',
    '## Execution Plan', '',
    '### Step 8: TEST', '- [ ] Write the failing tests first', '',
    '### Step 9: PREPARE', '- [ ] Prepare', '',
    '### Step 10: IMPLEMENT', '- [ ] Implement', '',
    '### Step 11: REVIEW', '- [ ] Review', '',
    '### Step 12: OPTIMIZE', '- [ ] Optimize', '',
    '### Step 13: SECURE', '- [ ] Secure', '',
    '### Step 14: VERIFY', '- [ ] Run all tests', '',
    '### Step 15: DOCUMENT', '- [ ] Docs', '',
    '### Step 16: FINAL-REVIEW', '- [ ] Final', '',
  ].join('\n');

  test('validateStepLabels_rejects_Step8_that_only_identifies_coverage_instead_of_writing_tests', () => {
    // Arrange — Step 8 body says "identify coverage" and never writes tests.
    const content = VALID_PLAN.replace(
      '### Step 8: TEST\n- [ ] Write the failing tests first',
      '### Step 8: TEST\n- [ ] identify coverage gaps in existing modules'
    );

    // Act
    const result = validator.validateStepLabels(content);

    // Assert — identifyOnly && !writesTests.
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /Step 8 \(TEST\) must WRITE tests/i.test(e)),
      `expected the Step-8 write-tests error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateStepLabels_rejects_Step14_that_is_manual_verification_only', () => {
    // Arrange — Step 14 body is manual verification with no automated run.
    const content = VALID_PLAN.replace(
      '### Step 14: VERIFY\n- [ ] Run all tests',
      '### Step 14: VERIFY\n- [ ] manual verification of the dashboard by hand'
    );

    // Act
    const result = validator.validateStepLabels(content);

    // Assert — isManualOnly (manual match AND no run test/lint/type).
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /Step 14 \(VERIFY\) must run automated checks/i.test(e)),
      `expected the Step-14 automated-checks error, got: ${JSON.stringify(result.errors)}`);
  });

  test('validateStepLabels_accepts_Step14_manual_wording_when_automated_run_is_also_present', () => {
    // Arrange — mentions "manually check" but ALSO "run all tests" → not manual-only.
    const content = VALID_PLAN.replace(
      '### Step 14: VERIFY\n- [ ] Run all tests',
      '### Step 14: VERIFY\n- [ ] manually check the report, then run all tests and run lint'
    );

    // Act
    const result = validator.validateStepLabels(content);

    // Assert — kills the mutant that drops the "&& !runsAutomated" guard.
    assert.ok(!result.errors.some((e) => /must run automated checks/i.test(e)),
      `automated run present must suppress the manual-only error, got: ${JSON.stringify(result.errors)}`);
  });
});

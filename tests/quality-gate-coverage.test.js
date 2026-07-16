'use strict';

/**
 * quality-gate-coverage.test.js
 *
 * Non-obvious / refusal-branch coverage for src/lib/quality-gate.js.
 *
 * This module is a GATE: its whole reason to exist is deciding FAIL vs PASS.
 * The highest-value branches are therefore the exact conditions under which the
 * gate blocks, the WARNING-not-FAILURE branches (which must NOT flip status),
 * the `>` boundaries (a `>=` mutant must go red), the `|| 0` / `||`-fallback
 * second operands, and the fail-safe defaults on malformed/absent input.
 *
 * Existing quality-gate tests live in tests/security.test.js and already pin
 * evaluateCoverage / evaluateSecurity fail-closed behaviour and the strict-mode
 * happy paths. This file deliberately targets the DARK branches those tests
 * never reach: evaluateComplexity, evaluateArchitecture, the strictest-mode
 * lint-warning escalation, the evaluate() dispatch guards, saveResults, the
 * generateReport() convenience method, and every loadConfig format branch.
 *
 * Every assertion here is chosen to die under mutation of the production line it
 * targets — a happy-path-only implementation would NOT satisfy it.
 *
 * AI-authored, human-reviewed line-by-line before commit.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { QualityGate, GATE_STATUS } = require('../src/lib/quality-gate');

const TMP_ROOT = path.join(os.tmpdir(), 'ctoc-quality-gate-cov-' + process.pid + '-' + Date.now());

function makeDir(name) {
  const dir = path.join(TMP_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

after(() => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
});

// ---------------------------------------------------------------------------
// Non-numeric metric hardening — a metric that is PRESENT but not a number
// ("2 found", "N/A", NaN) is a BROKEN measurement, never evidence of a clean
// result, and must FAIL its dimension (fail closed). This replicates the guard
// evaluateCoverage already enforces across security / codeQuality / complexity /
// architecture. Kills the old `(metric || 0) > threshold` fail-open, under which
// a non-numeric metric coerced to 0 (or to NaN in a false comparison) and the
// dimension silently PASSED. An ABSENT count field (undefined) still defaults to
// zero and passes — absent means "none reported", not "unmeasurable".
// ---------------------------------------------------------------------------
describe('non-numeric metric hardening — fail closed across all dimensions', () => {
  test('security_secrets_as_non_numeric_string_FAILS_the_dimension', () => {
    // '2 found' > 0 is false under the old shape -> two secrets slipped through.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateSecurity({ secrets: '2 found' });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a non-numeric secrets count must fail closed, not pass');
    assert.ok(result.failures.some(f => f.type === 'secrets'),
      'the failure must be attributed to the secrets metric');
  });

  test('security_secrets_as_NaN_FAILS_the_dimension', () => {
    // NaN || 0 = 0 under the old shape -> passed with secrets unmeasurable.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateSecurity({ secrets: NaN });
    assert.equal(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.some(f => f.type === 'secrets'));
  });

  test('security_sast_count_as_non_numeric_string_FAILS_closed', () => {
    // A known severity with a broken count must not slip through count>threshold.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateSecurity({ sast: { CRITICAL: '2 found' } });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'an unmeasurable SAST count must fail closed');
    assert.ok(result.failures.some(f => f.severity === 'CRITICAL'));
  });

  test('codeQuality_lintErrors_as_non_numeric_string_FAILS_the_dimension', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateCodeQuality({
      lintErrors: 'N/A', lintWarnings: 0, duplicatedLines: 0, codeSmells: 0
    });
    assert.equal(result.status, GATE_STATUS.FAILED,
      "a non-numeric lint-error count ('N/A') must fail closed");
    assert.ok(result.failures.some(f => f.metric === 'lintErrors'));
  });

  test('complexity_metric_as_NaN_FAILS_the_dimension', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateComplexity({ functionsOverCyclomatic: NaN });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a NaN complexity count must fail closed');
    assert.ok(result.failures.some(f => f.metric === 'cyclomatic'));
  });

  test('architecture_metric_as_non_numeric_string_FAILS_the_dimension', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateArchitecture({ violations: 'lots', circularDeps: 0 });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a non-numeric architecture violation count must fail closed');
    assert.ok(result.failures.some(f => f.metric === 'violations'));
  });

  // -- Regression: numeric + absent metrics keep their EXACT existing behavior -
  test('regression_clean_numeric_metrics_still_PASS_every_dimension', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    assert.equal(gate.evaluateSecurity({ sast: {}, dependencies: {}, secrets: 0 }).status, GATE_STATUS.PASSED);
    assert.equal(gate.evaluateCodeQuality({ lintErrors: 0, lintWarnings: 0, duplicatedLines: 0, codeSmells: 0 }).status, GATE_STATUS.PASSED);
    assert.equal(gate.evaluateComplexity({}).status, GATE_STATUS.PASSED);
    assert.equal(gate.evaluateArchitecture({ violations: 0, circularDeps: 0 }).status, GATE_STATUS.PASSED);
  });

  test('regression_over_threshold_numeric_still_FAILS_with_existing_message', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateSecurity({ secrets: 3 });
    assert.equal(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.some(f => f.type === 'secrets'
      && f.message === '3 secret(s) detected exceeds threshold of 0'),
      'the existing over-threshold secrets message shape must be preserved verbatim');
  });

  test('regression_absent_count_fields_default_to_zero_and_PASS', () => {
    // undefined count -> 0 (none reported), NOT a fail-closed non-numeric.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    assert.equal(gate.evaluateSecurity({}).status, GATE_STATUS.PASSED);
    assert.equal(gate.evaluateCodeQuality({}).status, GATE_STATUS.PASSED);
  });

  test('regression_coverage_unmeasurable_behavior_unchanged', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateCoverage({ lines: 'N/A', branches: 90, functions: 90, statements: 90 });
    assert.equal(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.some(f => f.metric === 'lines' && /unmeasurable/.test(f.message)),
      "coverage's existing unmeasurable message must be unchanged");
  });
});

// ---------------------------------------------------------------------------
// Per-dimension fail-closed branches — one non-numeric metric per specific
// evaluator field. Each targets a DISTINCT `numericOrFail(...).failed` return
// branch that the broader hardening block above does not reach (it only pins
// lintErrors / functionsOverCyclomatic / violations / secrets / sast). Every
// listed uncovered range is a per-field failure push: feeding a NON-NUMERIC
// value ('N/A', '2 found', NaN) to exactly that field drives the branch and the
// dimension must be FAILED with the field attributed. All sibling fields are
// held at 0 so the target field is the sole failure signal.
// ---------------------------------------------------------------------------
describe('per-dimension fail-closed branches — each listed uncovered field', () => {
  // src/lib/quality-gate.js:421-426 — codeQuality lintWarnings non-numeric.
  // A non-numeric lint-WARNING count fails CLOSED regardless of mode (it never
  // reaches the mode-gated escalation below it).
  test('codeQuality_lintWarnings_non_numeric_FAILS_closed', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateCodeQuality({
      lintErrors: 0, lintWarnings: '2 found', duplicatedLines: 0, codeSmells: 0
    });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a non-numeric lint-warning count must fail closed even under strict');
    assert.ok(result.failures.some(f => f.metric === 'lintWarnings' && /unmeasurable/.test(f.message)),
      'the failure must be attributed to lintWarnings with the unmeasurable message');
    assert.equal(result.warnings.length, 0,
      'an unmeasurable count must fail, never be demoted to a warning');
  });

  // src/lib/quality-gate.js:448-453 — codeQuality duplicatedLines non-numeric.
  test('codeQuality_duplicatedLines_non_numeric_FAILS_closed', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateCodeQuality({
      lintErrors: 0, lintWarnings: 0, duplicatedLines: 'N/A', codeSmells: 0
    });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a non-numeric duplicated-lines percentage must fail closed');
    assert.ok(result.failures.some(f => f.metric === 'duplicatedLines' && /unmeasurable/.test(f.message)),
      'the failure must be attributed to duplicatedLines');
  });

  // src/lib/quality-gate.js:466-471 — codeQuality codeSmells non-numeric.
  test('codeQuality_codeSmells_non_numeric_FAILS_closed', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateCodeQuality({
      lintErrors: 0, lintWarnings: 0, duplicatedLines: 0, codeSmells: NaN
    });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a NaN code-smell count must fail closed');
    assert.ok(result.failures.some(f => f.metric === 'codeSmells' && /unmeasurable/.test(f.message)),
      'the failure must be attributed to codeSmells');
  });

  // src/lib/quality-gate.js:528-533 — complexity functionsOverCognitive non-numeric
  // (dimension metric key 'cognitive').
  test('complexity_functionsOverCognitive_non_numeric_FAILS_closed', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateComplexity({ functionsOverCognitive: 'N/A' });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a non-numeric cognitive-overage count must fail closed');
    assert.ok(result.failures.some(f => f.metric === 'cognitive' && /unmeasurable/.test(f.message)),
      'the failure must be attributed to the cognitive metric');
  });

  // src/lib/quality-gate.js:546-551 — complexity functionsOverLength non-numeric
  // (dimension metric key 'functionLength').
  test('complexity_functionsOverLength_non_numeric_FAILS_closed', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateComplexity({ functionsOverLength: '3 found' });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a non-numeric function-length overage count must fail closed');
    assert.ok(result.failures.some(f => f.metric === 'functionLength' && /unmeasurable/.test(f.message)),
      'the failure must be attributed to the functionLength metric');
  });

  // src/lib/quality-gate.js:565-570 — complexity filesOverLength non-numeric.
  // A VALID numeric overage here is only a WARNING; an UNMEASURABLE count still
  // fails CLOSED, so status must flip to FAILED (unlike the numeric-warning case).
  test('complexity_filesOverLength_non_numeric_FAILS_closed_not_warns', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateComplexity({ filesOverLength: NaN });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'an unmeasurable files-over-length count must fail closed, not be demoted to a warning');
    assert.ok(result.failures.some(f => f.metric === 'fileLength' && /unmeasurable/.test(f.message)),
      'the failure must be attributed to the fileLength metric');
    assert.equal(result.warnings.length, 0,
      'a non-numeric file-length count must not surface as a warning');
  });

  // src/lib/quality-gate.js:627-632 — architecture circularDeps non-numeric.
  test('architecture_circularDeps_non_numeric_FAILS_closed', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    const result = gate.evaluateArchitecture({ violations: 0, circularDeps: '2 found' });
    assert.equal(result.status, GATE_STATUS.FAILED,
      'a non-numeric circular-dependency count must fail closed');
    assert.ok(result.failures.some(f => f.metric === 'circularDeps' && /unmeasurable/.test(f.message)),
      'the failure must be attributed to the circularDeps metric');
  });
});

// ---------------------------------------------------------------------------
// evaluateComplexity — the FAIL trigger is "count of functions over the limit
// is > 0", NOT "actual metric > threshold". filesOverLength is a WARNING and
// must NOT flip status. Kills: `> 0` mutated to `>= 0`, the `|| 0` absent-field
// fallback, and any mutant that promotes the files-over-length warning to a
// failure.
// ---------------------------------------------------------------------------
describe('evaluateComplexity — refusal / warning branches', () => {
  test('fails_when_any_function_exceeds_cyclomatic_limit', () => {
    // Arrange
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    // Act
    const result = gate.evaluateComplexity({ functionsOverCyclomatic: 2 });

    // Assert
    assert.equal(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.some(f => f.metric === 'cyclomatic' && f.actual === 2),
      'a function over the cyclomatic limit must produce a cyclomatic failure');
  });

  test('fails_when_any_function_exceeds_cognitive_limit', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const result = gate.evaluateComplexity({ functionsOverCognitive: 1 });

    assert.equal(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.some(f => f.metric === 'cognitive'));
  });

  test('fails_when_any_function_exceeds_length_limit', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const result = gate.evaluateComplexity({ functionsOverLength: 3 });

    assert.equal(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.some(f => f.metric === 'functionLength'));
  });

  test('filesOverLength_is_a_warning_and_does_NOT_fail_the_gate', () => {
    // The non-obvious branch: files over the length limit are advisory only.
    // A mutant that pushes this into `failures` would flip status to FAILED.
    // Arrange
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    // Act — only filesOverLength is non-zero
    const result = gate.evaluateComplexity({ filesOverLength: 5 });

    // Assert
    assert.equal(result.status, GATE_STATUS.PASSED, 'files-over-length is a warning, not a failure');
    assert.equal(result.failures.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].metric, 'fileLength');
  });

  test('passes_when_no_counts_present_absent_fields_default_to_zero', () => {
    // Pins the `(complexity.x || 0) > 0` fallback: an empty object yields 0 for
    // every count, so nothing exceeds the limit. A `>= 0` mutant fails here.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const result = gate.evaluateComplexity({});

    assert.equal(result.status, GATE_STATUS.PASSED);
    assert.equal(result.failures.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  test('records_result_on_instance_and_appends_to_gateResults', () => {
    // The bookkeeping side-effects (this.results.complexity + gateResults push)
    // are load-bearing: getOverallResult() reads them. A mutant that drops the
    // push would leave the aggregate blind to this dimension.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const result = gate.evaluateComplexity({ functionsOverCyclomatic: 1 });

    assert.equal(gate.results.complexity, result);
    assert.ok(gate.gateResults.includes(result));
  });
});

// ---------------------------------------------------------------------------
// evaluateArchitecture — `actual > threshold` (strictly greater). At-threshold
// must PASS; one over must FAIL. legacy mode (violations cap 5, circularDeps
// cap 3) exposes a non-zero boundary that kills a `>=` mutant, which strict's
// zero cap cannot.
// ---------------------------------------------------------------------------
describe('evaluateArchitecture — threshold boundaries', () => {
  test('fails_when_violations_exceed_zero_cap_in_strict', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const result = gate.evaluateArchitecture({ violations: 1, circularDeps: 0 });

    assert.equal(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.some(f => f.metric === 'violations'));
  });

  test('fails_when_circular_deps_exceed_zero_cap_in_strict', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const result = gate.evaluateArchitecture({ violations: 0, circularDeps: 1 });

    assert.equal(result.status, GATE_STATUS.FAILED);
    assert.ok(result.failures.some(f => f.metric === 'circularDeps'));
  });

  test('at_threshold_passes_and_one_over_fails_kills_ge_mutant', () => {
    // legacy caps: violations 5, circularDeps 3. Exactly at the cap must PASS
    // (`>` not `>=`); one over must FAIL. This single test pins the operator.
    const gate = new QualityGate(TMP_ROOT, { mode: 'legacy' });

    const atCap = gate.evaluateArchitecture({ violations: 5, circularDeps: 3 });
    assert.equal(atCap.status, GATE_STATUS.PASSED, 'exactly at the legacy cap must pass (> not >=)');
    assert.equal(atCap.failures.length, 0);

    const overCap = gate.evaluateArchitecture({ violations: 6, circularDeps: 3 });
    assert.equal(overCap.status, GATE_STATUS.FAILED, 'one over the cap must fail');
    assert.ok(overCap.failures.some(f => f.metric === 'violations' && f.actual === 6));
  });

  test('passes_when_metrics_absent_fallback_to_zero', () => {
    // The `|| 0` second operand: absent fields count as zero, which is <= the
    // strict zero cap, so the gate passes. A mutant dropping the fallback throws
    // on `undefined > 0` semantics or flips the result.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const result = gate.evaluateArchitecture({});

    assert.equal(result.status, GATE_STATUS.PASSED);
    assert.equal(result.failures.length, 0);
  });
});

// ---------------------------------------------------------------------------
// evaluateCodeQuality — lint WARNINGS escalate to a FAILURE only under
// 'strictest'. Under 'strict'/'legacy' the same overage stays a WARNING and the
// dimension still PASSES. This is the mode-gated branch (lines 348-362); a
// mutant removing the `mode === 'strictest'` guard would fail strict too.
// ---------------------------------------------------------------------------
describe('evaluateCodeQuality — strictest lint-warning escalation', () => {
  test('lint_warnings_over_cap_are_a_FAILURE_under_strictest', () => {
    // strictest lintWarnings cap is 0.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strictest' });

    const result = gate.evaluateCodeQuality({
      lintErrors: 0, lintWarnings: 1, duplicatedLines: 0, codeSmells: 0
    });

    assert.equal(result.status, GATE_STATUS.FAILED, 'strictest treats a lint-warning overage as a failure');
    assert.ok(result.failures.some(f => f.metric === 'lintWarnings'));
    assert.equal(result.warnings.length, 0, 'under strictest it must not be demoted to a warning');
  });

  test('same_lint_warning_overage_is_only_a_WARNING_under_strict', () => {
    // strict lintWarnings cap is 20; 50 exceeds it but must NOT fail the gate.
    // lintErrors kept 0 so lintWarnings is the ONLY signal — proves it is a
    // warning, not a failure.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const result = gate.evaluateCodeQuality({
      lintErrors: 0, lintWarnings: 50, duplicatedLines: 0, codeSmells: 0
    });

    assert.equal(result.status, GATE_STATUS.PASSED, 'strict demotes a lint-warning overage to a warning');
    assert.equal(result.failures.length, 0);
    assert.ok(result.warnings.some(w => w.metric === 'lintWarnings'));
  });
});

// ---------------------------------------------------------------------------
// evaluate() dispatch guards — a dimension is only evaluated when its key is
// present. Removing a guard would either skip a real dimension or (for the
// complexity/architecture guards) never run them at all, so the aggregate would
// fall through to the zero-dimensions fail-closed 'gate' failure instead of the
// real dimension. These distinguish the two.
// ---------------------------------------------------------------------------
describe('evaluate() — complexity & architecture dispatch', () => {
  test('failing_complexity_metric_surfaces_a_complexity_dimension_failure', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const overall = gate.evaluate({ complexity: { functionsOverCyclomatic: 4 } });

    assert.equal(overall.passed, false);
    assert.ok(overall.failures.some(f => f.dimension === 'complexity'),
      'the failure must be attributed to complexity, not the fail-closed gate stub');
  });

  test('passing_architecture_dimension_is_evaluated_and_reported', () => {
    // If the architecture dispatch guard were removed, gateResults would be
    // empty -> fail-closed 'gate' failure -> passed === false and NO
    // architecture dimension. So a clean pass with an architecture dimension
    // present proves the guard ran the real evaluator.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });

    const overall = gate.evaluate({ architecture: { violations: 0, circularDeps: 0 } });

    assert.equal(overall.passed, true);
    assert.ok(overall.dimensions.some(d => d.dimension === 'architecture'));
  });
});

// ---------------------------------------------------------------------------
// generateReport() convenience + the warnings section of the report body.
// Coverage close to (within 5% of) the floor is a WARNING with PASSED status —
// this exercises both the passed-summary branch and the warnings block, and the
// generateReport() wrapper that never ran in the existing suite.
// ---------------------------------------------------------------------------
describe('generateReport() — passing report with warnings section', () => {
  test('renders_PASSED_and_a_warnings_block_when_coverage_is_near_the_floor', () => {
    // lines=82 vs floor 80 -> diff 2 (<5) -> warning, status PASSED.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    gate.evaluate({ coverage: { lines: 82, branches: 82, functions: 82, statements: 82 } });

    const report = gate.generateReport();

    assert.match(report, /Quality gate PASSED/, 'a passing gate must render the PASSED summary line');
    assert.match(report, /Warnings \(Should Fix\)/, 'near-floor coverage must render the warnings block');
    assert.doesNotMatch(report, /Failures \(Must Fix\)/, 'a passing gate must not render a failures block');
  });

  test('renders_FAILED_summary_and_remediation_steps_when_a_dimension_fails', () => {
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    gate.evaluate({ coverage: { lines: 10, branches: 10, functions: 10, statements: 10 } });

    const report = gate.generateReport();

    assert.match(report, /Quality gate FAILED/);
    assert.match(report, /Failures \(Must Fix\)/);
  });
});

// ---------------------------------------------------------------------------
// saveResults — writes the aggregate plus thresholds+results, creating the
// parent directory only when it is absent (the `!existsSync` branch).
// ---------------------------------------------------------------------------
describe('saveResults — persistence and parent-dir creation', () => {
  test('creates_missing_parent_dir_and_writes_augmented_json', () => {
    // Arrange — a nested path whose parent does NOT yet exist.
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    gate.evaluate({ coverage: { lines: 95, branches: 95, functions: 95, statements: 95 } });
    const outPath = path.join(TMP_ROOT, 'nested', 'deeper', 'gate-results.json');

    // Act
    gate.saveResults(outPath);

    // Assert — file exists and carries the augmented shape (thresholds+results).
    assert.ok(fs.existsSync(outPath), 'saveResults must create the missing parent directory and write the file');
    const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(written.status, GATE_STATUS.PASSED);
    assert.ok(written.thresholds && written.thresholds.coverage, 'the persisted result must include the thresholds');
    assert.ok(written.results && written.results.coverage, 'the persisted result must include per-dimension results');
  });

  test('writes_into_an_already_existing_dir_without_error', () => {
    // Exercises the `existsSync(dir) === true` branch (mkdir skipped).
    const dir = makeDir('preexisting');
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict' });
    gate.evaluate({ coverage: { lines: 95, branches: 95, functions: 95, statements: 95 } });
    const outPath = path.join(dir, 'result.json');

    gate.saveResults(outPath);

    assert.ok(fs.existsSync(outPath));
  });
});

// ---------------------------------------------------------------------------
// loadConfig — format branches. A missing file and an unrecognized extension
// both yield {} (no overrides = safe default: the built-in floors stand). A
// .json file is parsed. Malformed JSON propagates (loadConfig does not swallow).
// ---------------------------------------------------------------------------
describe('QualityGate.loadConfig — format handling', () => {
  test('returns_empty_object_when_file_is_missing', () => {
    const missing = path.join(TMP_ROOT, 'does-not-exist.json');

    const config = QualityGate.loadConfig(missing);

    assert.deepEqual(config, {}, 'a missing config must yield no overrides so built-in floors stand');
  });

  test('parses_a_json_config_file', () => {
    const dir = makeDir('json-cfg');
    const cfgPath = path.join(dir, 'quality.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ coverage: { lines: 91 } }));

    const config = QualityGate.loadConfig(cfgPath);

    assert.equal(config.coverage.lines, 91);
  });

  test('json_config_overrides_flow_through_to_active_thresholds', () => {
    // End-to-end: a parsed .json override must actually raise the floor via the
    // constructor's mergeThresholds. Kills a mutant that parses but discards.
    const dir = makeDir('json-cfg-e2e');
    const cfgPath = path.join(dir, 'q.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ coverage: { lines: 93 } }));

    const config = QualityGate.loadConfig(cfgPath);
    const gate = new QualityGate(TMP_ROOT, { mode: 'strict', thresholds: config });

    assert.equal(gate.thresholds.coverage.lines, 93, 'json override must raise the active floor');
    assert.equal(gate.thresholds.coverage.branches, 80, 'unspecified defaults must be preserved');
  });

  test('unrecognized_extension_yields_no_overrides_even_when_file_has_content', () => {
    // A .txt config is not a recognized format -> {} (fall-through). This is the
    // safe default: an unparseable format must NOT silently disable the gate.
    const dir = makeDir('txt-cfg');
    const cfgPath = path.join(dir, 'quality.txt');
    fs.writeFileSync(cfgPath, 'coverage:\n  lines: 5\n');

    const config = QualityGate.loadConfig(cfgPath);

    assert.deepEqual(config, {}, 'an unrecognized extension must yield no overrides');
  });

  test('malformed_json_propagates_and_is_not_swallowed', () => {
    // loadConfig does not catch parse errors — a corrupt config must fail loudly,
    // never be treated as an empty (gate-disabling) override.
    const dir = makeDir('bad-json');
    const cfgPath = path.join(dir, 'quality.json');
    fs.writeFileSync(cfgPath, '{ this is not valid json ');

    assert.throws(() => QualityGate.loadConfig(cfgPath), SyntaxError);
  });
});

// ---------------------------------------------------------------------------
// Constructor & mergeThresholds fallbacks — the second operands that a
// happy-path caller never triggers.
// ---------------------------------------------------------------------------
describe('constructor & mergeThresholds — defensive fallbacks', () => {
  test('unknown_mode_falls_back_to_strict_thresholds', () => {
    // `DEFAULT_THRESHOLDS[this.mode] || DEFAULT_THRESHOLDS.strict` — an
    // unrecognized mode must not leave thresholds undefined (which would make
    // every later eval throw). It falls back to the strict floor.
    const gate = new QualityGate(TMP_ROOT, { mode: 'nonexistent-mode' });

    assert.equal(gate.thresholds.coverage.lines, 80, 'unknown mode must fall back to strict floors');
    assert.equal(gate.thresholds.security.critical, 0);
  });

  test('custom_threshold_for_an_unknown_category_is_ignored_not_injected', () => {
    // mergeThresholds guards `if (merged[category])`. A category absent from the
    // defaults must be skipped, not Object.assign'd onto undefined (which throws)
    // and not injected as an arbitrary new gate dimension.
    const gate = new QualityGate(TMP_ROOT, {
      mode: 'strict',
      thresholds: { bogusCategory: { anything: 1 }, coverage: { lines: 88 } }
    });

    assert.equal(gate.thresholds.bogusCategory, undefined, 'an unknown category must not be merged in');
    assert.equal(gate.thresholds.coverage.lines, 88, 'a real category override must still apply');
  });
});

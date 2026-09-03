/**
 * Plan Validator Tests
 * Tests for per-stage validation rules and pre-transition checks.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');
const { verifyEvidencePath } = require('../src/lib/step-13-verify');

// A full "## Execution Plan" with every required Iron Loop step present and
// ticked — the shape validateReviewToDone now demands before Gate 3 may cross.
const REVIEW_DONE_EXEC_PLAN = [
  '## Execution Plan',
  '',
  '### Step 8: TEST',
  '- [x] Tests written and run RED first',
  '',
  '### Step 9: PREPARE',
  '- [x] Environment ready',
  '',
  '### Step 10: IMPLEMENT',
  '- [x] Feature implemented',
  '',
  '### Step 11: REVIEW',
  '- [x] Self-review done',
  '',
  '### Step 12: OPTIMIZE',
  '- [x] No redundant work',
  '',
  '### Step 13: SECURE',
  '- [x] Inputs validated',
  '',
  '### Step 14: VERIFY',
  '- [x] All tests green, 0 skipped, 0 flaky',
  '',
  '### Step 15: DOCUMENT',
  '- [x] Docs updated',
  '',
  '### Step 16: FINAL-REVIEW',
  '- [x] Ready for human review',
  '',
].join('\n');

// 00255 fixtures. PROSE_EXEC_PLAN is the implementation planner's twin: the same
// heading text, the same step headings, and NO checkbox on any line.
const PROSE_EXEC_PLAN = [
  '## Execution Plan',
  '',
  '### Step 8: TEST',
  'Write the regression cases first and run them RED.',
  '',
  '### Step 9: PREPARE',
  'No new dependency is needed.',
  '',
  '### Step 10: IMPLEMENT',
  'Edit the one function named above.',
  '',
  '### Step 11: REVIEW',
  'Self-review the diff against the plan.',
  '',
  '### Step 12: OPTIMIZE',
  'Nothing on a hot path changes.',
  '',
  '### Step 13: SECURE',
  'No new input crosses a trust boundary.',
  '',
  '### Step 14: VERIFY',
  'Run the whole suite through the gated entry point.',
  '',
  '### Step 15: DOCUMENT',
  'Update the module comment at the changed site.',
  '',
  '### Step 16: FINAL-REVIEW',
  'Hand the built work to the human.',
  '',
].join('\n');

// The canonical section src/lib/iron-loop.js appends at the build-queue crossing —
// the one the executor ticks. Same blocks as REVIEW_DONE_EXEC_PLAN under the exact
// heading iron-loop.js emits.
const CANONICAL_EXEC_PLAN =
  REVIEW_DONE_EXEC_PLAN.replace('## Execution Plan', '## Execution Plan (Steps 8-16)');

describe('Plan Validator Tests', () => {
  let testDir;
  let plansDir;
  let validator;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-test-'));
    plansDir = path.join(testDir, 'plans');

    const stages = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
    stages.forEach(stage => {
      fs.mkdirSync(path.join(plansDir, stage), { recursive: true });
    });

    fs.mkdirSync(path.join(testDir, '.ctoc'), { recursive: true });

    delete require.cache[require.resolve('../src/lib/plan-validator.js')];
    validator = require('../src/lib/plan-validator.js');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createPlan(stage, name, content) {
    const filePath = path.join(plansDir, stage, `${name}.md`);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  // === contradiction parser (file-claim) — v6.9.86 ===

  test('validateNoContradictions: ignores code inside fenced blocks (v6.9.86 false-positive)', () => {
    // Code snippets in ``` fences (e.g. lines.push('CLAUDE.md'), Hash('sha256')
    // .update(body).digest) are NOT file-creation claims. Before v6.9.86 the
    // loose regex matched them as "files claimed as created" and blocked
    // otherwise-complete plans at review.
    const content = [
      '# Plan',
      '## DESIGN',
      'We create the module.',
      '```js',
      "lines.push('CLAUDE.md');",
      "const h = Hash('sha256').update(bodyLF, 'utf8').digest('hex');",
      '```',
    ].join('\n');

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      !result.errors.some(e => /claimed as created/i.test(e)),
      `fenced code must not produce file-claim errors, got: ${JSON.stringify(result.errors)}`
    );
    console.log('# validateNoContradictions: ignores fenced code');
  });

  test('validateNoContradictions: still flags a real nonexistent created-file claim', () => {
    // The fix must not blind the check: an inline claim of a created file that
    // does not exist must still error (no fences involved).
    const content = '# Plan\n\nCreated `src/lib/definitely-missing-xyz.js` for the feature.\n';

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      result.errors.some(e => /claimed as created/i.test(e) && /definitely-missing-xyz\.js/.test(e)),
      `real nonexistent created-file claim must still be flagged, got: ${JSON.stringify(result.errors)}`
    );
    console.log('# validateNoContradictions: still flags real missing created file');
  });

  // === contradiction parser: files:-declaration basename fallback — VP1 ===

  test('VP1 #1: bare-basename claim resolved via files: declaration (OM2/PI0 shape) → no error', () => {
    // OM2/PI0 shape: inline-array files: [src/hooks/guard-files.js] declares the
    // authoritative subpath; prose refers to it by bare basename. The bare name
    // resolves to <root>/guard-files.js (absent), but the declared file EXISTS,
    // so the claim is satisfied and must NOT error.
    fs.mkdirSync(path.join(testDir, 'src', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'hooks', 'guard-files.js'), '// guard');

    const content = [
      '---',
      'files: [src/hooks/guard-files.js]',
      '---',
      '# Plan',
      '',
      'Step 10: create `guard-files.js` for the hook.',
      '',
    ].join('\n');

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      !result.errors.some(e => /claimed as created/i.test(e) && /guard-files\.js/.test(e)),
      `bare-basename claim of a declared+existing file must not error, got: ${JSON.stringify(result.errors)}`
    );
    console.log('# VP1 #1: bare-basename resolved via files: declaration');
  });

  test('VP1 #2: genuine missing-file claim still errors', () => {
    // nowhere.js is neither declared in files: nor present at project root —
    // the genuine contradiction must still be flagged (D-VP1-2).
    const content = [
      '---',
      'files: [src/lib/plan-validator.js]',
      '---',
      '# Plan',
      '',
      'Created `nowhere.js` for the feature.',
      '',
    ].join('\n');

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      result.errors.some(e => /claimed as created/i.test(e) && /nowhere\.js/.test(e)),
      `genuine missing-file claim must still be flagged, got: ${JSON.stringify(result.errors)}`
    );
    console.log('# VP1 #2: genuine missing-file claim still errors');
  });

  test('VP1 #3: full-path claim still clean (no regression to path resolution)', () => {
    fs.mkdirSync(path.join(testDir, 'src', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'hooks', 'guard-files.js'), '// guard');

    const content = [
      '---',
      'files: [src/hooks/guard-files.js]',
      '---',
      '# Plan',
      '',
      'Create `src/hooks/guard-files.js`.',
      '',
    ].join('\n');

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      !result.errors.some(e => /claimed as created/i.test(e)),
      `full-path claim of an existing file must resolve unchanged, got: ${JSON.stringify(result.errors)}`
    );
    console.log('# VP1 #3: full-path claim still clean');
  });

  test('VP1 #4: basename collision safe — declared+existing satisfies bare claim', () => {
    fs.mkdirSync(path.join(testDir, 'src', 'a'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'a', 'util.js'), '// util');

    const content = [
      '---',
      'files: [src/a/util.js]',
      '---',
      '# Plan',
      '',
      'add `util.js`.',
      '',
    ].join('\n');

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      !result.errors.some(e => /claimed as created/i.test(e) && /util\.js/.test(e)),
      `declared+existing file must satisfy a bare-basename claim, got: ${JSON.stringify(result.errors)}`
    );
    console.log('# VP1 #4: basename collision safe');
  });

  // === functional -> implementation ===

  test('functional->implementation: passes with problem, criteria, scope', () => {
    const planPath = createPlan('functional', 'good-plan',
      '# Good Plan\n\n## Problem Statement\nUsers need auth.\n\n## Success Criteria\nLogin works.\n\n## Scope\nOnly login.\n');

    const result = validator.validateTransition(planPath, 'functional', 'implementation', testDir);

    assert.strictEqual(result.valid, true, 'Should pass');
    assert.strictEqual(result.errors.length, 0, 'Should have no errors');
    console.log('# functional->implementation: passes with problem, criteria, scope');
  });

  test('functional->implementation: accepts canonical Iron-Loop "## ASSESS" problem section (v6.9.61)', () => {
    // CTOC's product-owner / vision-decomposer agents emit the problem as
    // "## 1. ASSESS — Problem Understanding" (Business Context / Current State /
    // Impact), NOT the literal "Problem Statement" heading. The validator must
    // recognize it, or every canonically-formatted plan false-fails Gate 1.
    const planPath = createPlan('functional', 'assess-format',
      '# Stale Flag\n\n## 1. ASSESS — Problem Understanding\n\n### Business Context\nPlans rot after their work ships.\n\n### Impact\nPhantom backlog erodes dashboard trust.\n\n## 3. CAPTURE — Acceptance Criteria\nScan completes without git.\n\n### In Scope\nCheap signal detection.\n');

    const result = validator.validateTransition(planPath, 'functional', 'implementation', testDir);

    assert.strictEqual(result.checklist.problemStatement, true, 'ASSESS section must satisfy the problem-statement check');
    assert.ok(!result.errors.some(e => /problem/i.test(e)), 'Should NOT report a missing problem statement');
    assert.strictEqual(result.valid, true, 'Canonical ASSESS-format plan should pass functional->implementation');
    console.log('# functional->implementation: accepts canonical Iron-Loop "## ASSESS" problem section');
  });

  test('functional->implementation: fails without problem statement', () => {
    const planPath = createPlan('functional', 'no-problem',
      '# No Problem\n\n## Success Criteria\nLogin works.\n\n## Scope\nOnly login.\n');

    const result = validator.validateTransition(planPath, 'functional', 'implementation', testDir);

    assert.strictEqual(result.valid, false, 'Should fail');
    assert.ok(result.errors.some(e => /problem/i.test(e)), 'Should mention missing problem');
    console.log('# functional->implementation: fails without problem statement');
  });

  test('functional->implementation: fails without criteria', () => {
    const planPath = createPlan('functional', 'no-criteria',
      '# No Criteria\n\n## Problem Statement\nUsers need auth.\n\n## Scope\nOnly login.\n');

    const result = validator.validateTransition(planPath, 'functional', 'implementation', testDir);

    assert.strictEqual(result.valid, false, 'Should fail');
    assert.ok(result.errors.some(e => /criteria/i.test(e)), 'Should mention missing criteria');
    console.log('# functional->implementation: fails without criteria');
  });

  test('functional->implementation: warns without scope', () => {
    // Content must NOT contain the word "scope" (or "Scope", "## Scope", etc.)
    const planPath = createPlan('functional', 'no-boundaries',
      '# Auth Feature\n\n## Problem Statement\nUsers need auth.\n\n## Acceptance Criteria\nLogin works.\n');

    const result = validator.validateTransition(planPath, 'functional', 'implementation', testDir);

    assert.ok(result.valid, 'Should still pass (missing boundaries is warning, not error)');
    assert.ok(result.warnings.some(w => /scope/i.test(w)), 'Should warn about missing scope definition');
    console.log('# functional->implementation: warns without scope');
  });

  // === implementation -> todo ===

  test('implementation->todo: passes with title and files section', () => {
    const planPath = createPlan('implementation', 'good-impl',
      '# Good Impl\n\n## Files to Create/Modify\n- lib/foo.js\n\n## Implementation Details\nChange X.\n');

    const result = validator.validateTransition(planPath, 'implementation', 'todo', testDir);

    assert.strictEqual(result.errors.length, 0, 'Should have no errors');
    console.log('# implementation->todo: passes with title and files section');
  });

  test('implementation->todo: fails without title', () => {
    const planPath = createPlan('implementation', 'no-title',
      'No markdown heading here.\n\n## Files to Create/Modify\n- lib/foo.js\n');

    const result = validator.validateTransition(planPath, 'implementation', 'todo', testDir);

    assert.strictEqual(result.valid, false, 'Should fail');
    assert.ok(result.errors.some(e => /title/i.test(e)), 'Should mention missing title');
    console.log('# implementation->todo: fails without title');
  });

  // === todo -> in-progress ===

  test('todo->in-progress: passes with iron_loop marker and step labels', () => {
    const fullPlan = `---
iron_loop: true
---

# Ready Plan

## Scope
Do things.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] Write tests for auth flow

### Step 9: PREPARE
- [ ] Run lint on new files

### Step 10: IMPLEMENT
- [ ] Implement auth routes

### Step 11: REVIEW
- [ ] Self-review code

### Step 12: OPTIMIZE
- [ ] Check performance

### Step 13: SECURE
- [ ] Validate inputs

### Step 14: VERIFY
- [ ] Run all tests

### Step 15: DOCUMENT
- [ ] Update docs

### Step 16: FINAL-REVIEW
- [ ] Final review
`;
    const planPath = createPlan('todo', 'ready-plan', fullPlan);

    const result = validator.validateTransition(planPath, 'todo', 'in-progress', testDir);

    assert.strictEqual(result.valid, true, 'Should pass with iron_loop and correct step labels');
    console.log('# todo->in-progress: passes with iron_loop marker and step labels');
  });

  test('todo->in-progress: fails without iron_loop marker', () => {
    const planPath = createPlan('todo', 'not-ready',
      '# Not Ready\n\nNo iron loop steps.\n');

    const result = validator.validateTransition(planPath, 'todo', 'in-progress', testDir);

    assert.strictEqual(result.valid, false, 'Should fail without iron_loop');
    assert.ok(result.errors.some(e => /iron loop/i.test(e)), 'Should mention missing iron loop');
    console.log('# todo->in-progress: fails without iron_loop marker');
  });

  // === review -> done ===

  test('review->done: a compliant plan passes', () => {
    // W05-s2 replaced the old always-valid contract: validateReviewToDone can now
    // REJECT. A GENUINELY compliant plan — human-approval marker + a full
    // completed Execution Plan + a fresh passing VERIFY evidence artifact — still
    // passes. (The rejection paths are covered by ctoc-audit-w05-gate3-*.)
    const planPath = createPlan('review', 'reviewed-plan',
      `---\napproved_by: human\n---\n\n# Reviewed Plan\n\nAll good.\n\n${REVIEW_DONE_EXEC_PLAN}`);

    // Real VERIFY evidence artifact (data fixture) recording a passing run fresher
    // than the plan's mtime, so the evidence + staleness checks both pass.
    const planMtimeMs = fs.statSync(planPath).mtimeMs;
    const evidencePath = verifyEvidencePath(testDir, 'reviewed-plan');
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify({
      planSlug: 'reviewed-plan',
      timestamp: new Date(planMtimeMs + 60000).toISOString(),
      passed: true,
      method: 'fallback-direct',
      checks: {},
      errors: [],
      summary: 'fixture run'
    }, null, 2));

    const result = validator.validateTransition(planPath, 'review', 'done', testDir);

    assert.strictEqual(result.valid, true, `compliant plan must pass, errors: ${JSON.stringify(result.errors)}`);
    console.log('# review->done: a compliant plan passes');
  });

  test('review->done: a plan carrying BOTH execution sections is judged by the canonical one', () => {
    // 00255. A plan written by the implementation planner carries a PROSE
    // "## Execution Plan" (Step 8..16 headings, no checkbox anywhere). When it crosses
    // into the build queue, src/lib/iron-loop.js appends the canonical
    // "## Execution Plan (Steps 8-16)" template, and THAT is the section the executor
    // ticks. `String.match` with /m returns the FIRST match, so extractStepBlocks read
    // the planner's prose twin, saw no `- [x]`, and reported every required step as an
    // unchecked checkbox — blocking a plan whose real record is fully ticked.
    const planPath = createPlan('review', 'both-sections',
      `---\napproved_by: human\n---\n\n# Both Sections\n\n${PROSE_EXEC_PLAN}\n\n${CANONICAL_EXEC_PLAN}`);

    const planMtimeMs = fs.statSync(planPath).mtimeMs;
    const evidencePath = verifyEvidencePath(testDir, 'both-sections');
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify({
      planSlug: 'both-sections',
      timestamp: new Date(planMtimeMs + 60000).toISOString(),
      passed: true,
      method: 'fallback-direct',
      checks: {},
      errors: [],
      summary: 'fixture run'
    }, null, 2));

    const result = validator.validateTransition(planPath, 'review', 'done', testDir);

    assert.ok(
      !result.errors.some((e) => /unchecked required checkbox/.test(e)),
      `the ticked canonical section must be the one read, errors: ${JSON.stringify(result.errors)}`,
    );
    assert.strictEqual(result.valid, true, `compliant plan must pass, errors: ${JSON.stringify(result.errors)}`);
    console.log('# review->done: a plan carrying BOTH execution sections is judged by the canonical one');
  });

  test('review->done: a prose-only execution section still fails every required step', () => {
    // 00255, the guard that keeps the fix honest. The SAME fixture with the canonical
    // section removed: no checkbox exists anywhere, so no step is complete. Preferring
    // the canonical section must never turn an un-ticked plan into a passing one.
    const planPath = createPlan('review', 'prose-only',
      `---\napproved_by: human\n---\n\n# Prose Only\n\n${PROSE_EXEC_PLAN}`);

    const planMtimeMs = fs.statSync(planPath).mtimeMs;
    const evidencePath = verifyEvidencePath(testDir, 'prose-only');
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify({
      planSlug: 'prose-only',
      timestamp: new Date(planMtimeMs + 60000).toISOString(),
      passed: true,
      method: 'fallback-direct',
      checks: {},
      errors: [],
      summary: 'fixture run'
    }, null, 2));

    const result = validator.validateTransition(planPath, 'review', 'done', testDir);

    assert.strictEqual(result.valid, false, 'a plan with no checkbox anywhere must not pass');
    assert.ok(
      result.errors.some((e) => /unchecked required checkbox/.test(e)),
      `an unchecked required step must be reported, errors: ${JSON.stringify(result.errors)}`,
    );
    console.log('# review->done: a prose-only execution section still fails every required step');
  });

  test('review->done: warns about TODO markers', () => {
    const planPath = createPlan('review', 'has-todos',
      '# Has TODOs\n\nTODO: fix this later.\n');

    const result = validator.validateTransition(planPath, 'review', 'done', testDir);

    assert.ok(result.warnings.some(w => /TODO|unresolved/i.test(w)), 'Should warn about TODOs');
    console.log('# review->done: warns about TODO markers');
  });

  // === validateTransition routing ===

  test('validateTransition handles unknown transitions gracefully', () => {
    const planPath = createPlan('functional', 'any-plan', '# Any Plan\n');

    const result = validator.validateTransition(planPath, 'done', 'functional', testDir);

    assert.strictEqual(result.valid, true, 'Unknown transitions pass by default');
    assert.strictEqual(result.errors.length, 0, 'No errors');
    console.log('# validateTransition handles unknown transitions gracefully');
  });

  // === formatValidationResult ===

  test('formatValidationResult shows PASSED for valid result', () => {
    const result = { valid: true, errors: [], warnings: [] };
    const output = validator.formatValidationResult(result);

    assert.ok(output.includes('PASSED'), 'Should show PASSED');
    console.log('# formatValidationResult shows PASSED for valid result');
  });

  test('formatValidationResult shows FAILED with errors', () => {
    const result = { valid: false, errors: ['Missing problem'], warnings: [] };
    const output = validator.formatValidationResult(result);

    assert.ok(output.includes('FAILED'), 'Should show FAILED');
    assert.ok(output.includes('Missing problem'), 'Should show error text');
    console.log('# formatValidationResult shows FAILED with errors');
  });

  test('formatValidationResult shows warnings', () => {
    const result = { valid: true, errors: [], warnings: ['Consider adding scope'] };
    const output = validator.formatValidationResult(result);

    assert.ok(output.includes('Consider adding scope'), 'Should show warning text');
    console.log('# formatValidationResult shows warnings');
  });
});

// ---------------------------------------------------------------------------
// validateStepLabels — structure-aware Iron Loop step-label gate.
//
// This gate runs on todo->in-progress (validateForExecution). Historically it
// ran whole-body `.test(content)` checks with no scoping, no code-fence
// stripping, and no order/positional analysis — producing confirmed
// false-accepts and one false-reject. These tests pin the fixed behaviour.
// ---------------------------------------------------------------------------
describe('validateStepLabels — structure-aware step-label gate', () => {
  const stepValidator = require('../src/lib/plan-validator.js');

  // A correctly-structured Execution Plan: steps 8-16, each exactly once, in
  // ascending order, canonical labels, a single IMPLEMENT.
  const WELL_FORMED = [
    '# Plan', '', '## Scope', 'Do the thing.', '',
    '## Execution Plan', '',
    '### Step 8: TEST', '- [ ] Write the failing tests first', '',
    '### Step 9: PREPARE', '- [ ] Prepare env', '',
    '### Step 10: IMPLEMENT', '- [ ] Implement', '',
    '### Step 11: REVIEW', '- [ ] Review', '',
    '### Step 12: OPTIMIZE', '- [ ] Optimize', '',
    '### Step 13: SECURE', '- [ ] Secure', '',
    '### Step 14: VERIFY', '- [ ] Run all tests', '',
    '### Step 15: DOCUMENT', '- [ ] Docs', '',
    '### Step 16: FINAL-REVIEW', '- [ ] Final', '',
  ].join('\n');

  // Regression guard: a well-formed plan must ACCEPT.
  test('regression: correctly-structured plan (8-16 in order, one IMPLEMENT) is ACCEPTED', () => {
    const result = stepValidator.validateStepLabels(WELL_FORMED);
    assert.strictEqual(result.valid, true,
      `Well-formed plan must pass. Errors: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.errors.length, 0, 'No errors expected');
    console.log('# validateStepLabels regression: well-formed plan accepted');
  });

  // F1 FALSE ACCEPT — step ORDER never checked.
  test('F1: fully reversed step order (16..8) is REJECTED', () => {
    const reversed = [
      '## Execution Plan', '',
      '### Step 16: FINAL-REVIEW', '- [ ] Final', '',
      '### Step 15: DOCUMENT', '- [ ] Docs', '',
      '### Step 14: VERIFY', '- [ ] Run all tests', '',
      '### Step 13: SECURE', '- [ ] Secure', '',
      '### Step 12: OPTIMIZE', '- [ ] Optimize', '',
      '### Step 11: REVIEW', '- [ ] Review', '',
      '### Step 10: IMPLEMENT', '- [ ] Implement', '',
      '### Step 9: PREPARE', '- [ ] Prepare', '',
      '### Step 8: TEST', '- [ ] Write tests', '',
    ].join('\n');
    const result = stepValidator.validateStepLabels(reversed);
    assert.strictEqual(result.valid, false, 'Reversed-order plan must be rejected');
    assert.ok(result.errors.some(e => /order/i.test(e)),
      `Expected an out-of-order error. Got: ${JSON.stringify(result.errors)}`);
    console.log('# validateStepLabels F1: reversed order rejected');
  });

  // F2 FALSE ACCEPT — a wrong REAL heading hidden behind a prose mention.
  test('F2: wrong real Step-10 heading (DEPLOY) with an IMPLEMENT prose decoy is REJECTED', () => {
    const decoy = [
      '## Execution Plan', '',
      '### Step 8: TEST', '- [ ] Write tests', '',
      '### Step 9: PREPARE', '- [ ] Prepare', '',
      '### Step 10: DEPLOY', '- [ ] Ship it', '',
      '### Step 11: REVIEW', '- [ ] Review', '',
      '### Step 12: OPTIMIZE', '- [ ] Optimize', '',
      '### Step 13: SECURE', '- [ ] Secure', '',
      '### Step 14: VERIFY', '- [ ] Run all tests', '',
      '### Step 15: DOCUMENT', '- [ ] Docs', '',
      '### Step 16: FINAL-REVIEW', '- [ ] Final', '',
      '',
      '## Notes',
      'Remember that Step 10: IMPLEMENT is where all code changes belong.',
    ].join('\n');
    const result = stepValidator.validateStepLabels(decoy);
    assert.strictEqual(result.valid, false, 'Wrong real Step-10 heading must be rejected');
    assert.ok(result.errors.some(e => /Step 10.*wrong label/i.test(e)),
      `Expected a Step 10 wrong-label error. Got: ${JSON.stringify(result.errors)}`);
    console.log('# validateStepLabels F2: wrong real heading behind prose decoy rejected');
  });

  // F3 FALSE ACCEPT — the mandatory label lives ONLY inside a fenced code block.
  test('F3: Step 10 present only inside a ``` fence is REJECTED (missing)', () => {
    const fenced = [
      '## Execution Plan', '',
      '### Step 8: TEST', '- [ ] Write tests', '',
      '### Step 9: PREPARE', '- [ ] Prepare', '',
      '```markdown',
      '### Step 10: IMPLEMENT',
      '- [ ] This is only an EXAMPLE inside a fence, not a real step',
      '```',
      '',
      '### Step 11: REVIEW', '- [ ] Review', '',
      '### Step 12: OPTIMIZE', '- [ ] Optimize', '',
      '### Step 13: SECURE', '- [ ] Secure', '',
      '### Step 14: VERIFY', '- [ ] Run all tests', '',
      '### Step 15: DOCUMENT', '- [ ] Docs', '',
      '### Step 16: FINAL-REVIEW', '- [ ] Final', '',
    ].join('\n');
    const result = stepValidator.validateStepLabels(fenced);
    assert.strictEqual(result.valid, false, 'Fenced-only Step 10 must be rejected');
    assert.ok(result.errors.some(e => /Step 10.*missing/i.test(e)),
      `Expected a Step 10 missing error. Got: ${JSON.stringify(result.errors)}`);
    console.log('# validateStepLabels F3: fenced-only step rejected as missing');
  });

  // F4 FALSE ACCEPT — a duplicated non-IMPLEMENT step (two Step 14 headings).
  test('F4: duplicate Step 14 (VERIFY) headings are REJECTED', () => {
    const dup = [
      '## Execution Plan', '',
      '### Step 8: TEST', '- [ ] Write tests', '',
      '### Step 9: PREPARE', '- [ ] Prepare', '',
      '### Step 10: IMPLEMENT', '- [ ] Implement', '',
      '### Step 11: REVIEW', '- [ ] Review', '',
      '### Step 12: OPTIMIZE', '- [ ] Optimize', '',
      '### Step 13: SECURE', '- [ ] Secure', '',
      '### Step 14: VERIFY', '- [ ] Run all tests', '',
      '### Step 14: VERIFY', '- [ ] Run all tests again (duplicate!)', '',
      '### Step 15: DOCUMENT', '- [ ] Docs', '',
      '### Step 16: FINAL-REVIEW', '- [ ] Final', '',
    ].join('\n');
    const result = stepValidator.validateStepLabels(dup);
    assert.strictEqual(result.valid, false, 'Duplicate Step 14 must be rejected');
    assert.ok(result.errors.some(e => /Step 14.*exactly once|Step 14.*appears/i.test(e)),
      `Expected a Step 14 duplicate error. Got: ${JSON.stringify(result.errors)}`);
    console.log('# validateStepLabels F4: duplicate Step 14 rejected');
  });

  // F5 FALSE REJECT — a valid plan that merely MENTIONS "Step 10: IMPLEMENT" in prose.
  test('F5: valid plan mentioning "Step 10: IMPLEMENT" in prose is ACCEPTED', () => {
    const prose = [
      '## Execution Plan', '',
      '### Step 8: TEST', '- [ ] Write tests', '',
      '### Step 9: PREPARE', '- [ ] Prepare', '',
      '### Step 10: IMPLEMENT',
      '- [ ] All code changes go here; per policy Step 10: IMPLEMENT is the only build step',
      '',
      '### Step 11: REVIEW', '- [ ] Review', '',
      '### Step 12: OPTIMIZE', '- [ ] Optimize', '',
      '### Step 13: SECURE', '- [ ] Secure', '',
      '### Step 14: VERIFY', '- [ ] Run all tests', '',
      '### Step 15: DOCUMENT', '- [ ] Docs', '',
      '### Step 16: FINAL-REVIEW', '- [ ] Final', '',
    ].join('\n');
    const result = stepValidator.validateStepLabels(prose);
    assert.strictEqual(result.valid, true,
      `Prose mention must not over-count. Errors: ${JSON.stringify(result.errors)}`);
    console.log('# validateStepLabels F5: prose mention of IMPLEMENT accepted');
  });

  // Regression guard: an actual wrong label as the real heading still REJECTS.
  test('regression: bare wrong Step-10 label (DEPLOY as the real heading) is REJECTED', () => {
    const bare = WELL_FORMED.replace('### Step 10: IMPLEMENT', '### Step 10: DEPLOY');
    const result = stepValidator.validateStepLabels(bare);
    assert.strictEqual(result.valid, false, 'Bare wrong label must be rejected');
    assert.ok(result.errors.some(e => /Step 10.*wrong label/i.test(e)),
      `Expected a Step 10 wrong-label error. Got: ${JSON.stringify(result.errors)}`);
    console.log('# validateStepLabels regression: bare wrong label rejected');
  });
});

console.log('\nPlan Validator Tests');
console.log('====================\n');

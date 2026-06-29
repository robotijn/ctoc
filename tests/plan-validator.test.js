/**
 * Plan Validator Tests
 * Tests for per-stage validation rules and pre-transition checks.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');

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

  test('review->done: passes (informational only)', () => {
    const planPath = createPlan('review', 'reviewed-plan',
      '---\napproved_by: human\n---\n\n# Reviewed Plan\n\nAll good.\n');

    const result = validator.validateTransition(planPath, 'review', 'done', testDir);

    // review->done validator is informational, not blocking
    assert.strictEqual(result.valid, true, 'Should pass');
    console.log('# review->done: passes (informational only)');
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

console.log('\nPlan Validator Tests');
console.log('====================\n');

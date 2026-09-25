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

  // === contradiction parser: a member expression is not a file — 00260 ===
  //
  // Every input below is byte-for-byte prose from a plan that ships in this
  // repository. Each one made the pre-review gate refuse a plan because a method
  // call written in prose ("Added `this.scannersRun` tracking") was read as a
  // claim that a FILE named `this.scannersRun` had been created. Two of them
  // span a line break: the separator between the verb and the capture is
  // `[:\s]*`, and `\s` matches a newline, so a paragraph ending in "Added" picks
  // up the backticked call that opens the next line.

  const MISREAD_CORPUS = [
    [
      'plans/in-progress/00259 line 293 — the live refusal',
      "- one assertion ADDED: `assert.strictEqual(result.confidence, 50)`.",
    ],
    [
      'plans/review/00157 line 269 — created.push yields the capture d.push',
      "### Step 11: REVIEW — confirm no `created.push` remains on a preview path. Confirm no write remains outside `record`.",
    ],
    [
      'plans/review/00157 line 357 — created.length yields the capture d.length',
      "    `result.created.length > 0` on a run that writes nothing. It does not merely",
    ],
    [
      'plans/review/00025 line 117 — a member expression after Added',
      "2. **`run()` honesty.** Added `this.scannersRun` tracking. `run()` now returns",
    ],
    [
      'plans/review/00013 lines 186-187 — the verb and the call are on different lines',
      "2. **Plan-uniqueness enforced at the action + CLI layer, with a shared registry lookup.** Added\n"
        + "   `taskRegistry.findActivePlanTask(reg, plan, kind)` (prefers running/cancelling over queued) and",
    ],
    [
      'plans/done/ctoc-audit-w11-s5 lines 42-43 — exclusive-create then a call, across a newline',
      "**Fix:** make the WRITE the point of exclusivity, not the check. Attempt an exclusive-create\n"
        + "`safeFs.writeFileSync(lockPath, data, { flag: 'wx' })` — atomic create-or-fail (`EEXIST`).",
    ],
    [
      'plans/done/ctoc-audit-w11-s7 line 49 — a property read and an arrow-body subtraction',
      "`created: stat.birthtime` (line 38) and `files.sort((a,b)=>a.created-b.created)` (line 52,",
    ],
  ];

  for (const [label, prose] of MISREAD_CORPUS) {
    test(`00260 misread corpus: ${label} produces no file-claim error`, () => {
      const result = validator.validateNoContradictions(`# Plan\n\n${prose}\n`, testDir);

      assert.ok(
        !result.errors.some(e => /claimed as created/i.test(e)),
        `a call cited in prose is not a file claim, got: ${JSON.stringify(result.errors)}`
      );
    });
  }

  test('00260 teeth: a paren-free backtick claim still errors on a line that also cites a call', () => {
    // Kills an over-broad inline-span strip: only a span containing an open
    // parenthesis is a code citation. The span holding the real claim has none,
    // so the claim must survive and still error.
    const content = '# Plan\n\nCreated `src/lib/definitely-missing-xyz.js` once `wire(the, thing)` landed.\n';

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      result.errors.some(e => /claimed as created/i.test(e) && /definitely-missing-xyz\.js/.test(e)),
      `a paren-free claim beside a call span must still error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('00260 teeth: a separator-bearing claim with an unknown suffix still errors', () => {
    // Kills a plausibility rule that checks the extension only. The suffix
    // ".weirdext" is in no extension list, but the token carries a path
    // separator, so it names a file and its absence is a real contradiction.
    const content = '# Plan\n\nCreated `src/lib/gone-xyz.weirdext` for the feature.\n';

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      result.errors.some(e => /claimed as created/i.test(e) && /gone-xyz\.weirdext/.test(e)),
      `a slash-bearing claim must still error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('00260 teeth: a backslash-separated claim still errors', () => {
    // Kills the second operand of the separator test. A Windows-authored
    // declaration is split on either separator by the existence check, so the
    // plausibility rule must agree with it.
    const content = '# Plan\n\nCreated `src\\lib\\gone-xyz.weirdext` for the feature.\n';

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      result.errors.some(e => /claimed as created/i.test(e) && /gone-xyz\.weirdext/.test(e)),
      `a backslash-separated claim must still error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('00260 teeth: a path-plausible token immediately followed by "(" is a call, not a claim', () => {
    // Kills the read-past-the-match guard on its own. The token IS path
    // plausible (it carries a separator and a .js suffix), so only the "next
    // character is an open parenthesis" test can reject it.
    const content = '# Plan\n\nCreated src/lib/gone-abc.js(argv) in the same pass.\n';

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      !result.errors.some(e => /claimed as created/i.test(e)),
      `a call spelled with a path-shaped callee is not a file claim, got: ${JSON.stringify(result.errors)}`
    );
  });

  // === contradiction parser: a verb FUSED into a cited token is not a verb — 00260 ===
  //
  // The verb alternation has no left word boundary, so `created?` matches the
  // five letters `create` wherever they appear — including as a SYLLABLE inside a
  // hyphen-joined slug. A plan filename cited in a table cell
  // (`…-a-canonical-create-react-app-is-detected-s1-symmetric-credit.md`) therefore
  // starts a match at `create`, and the capture runs from the next character to
  // the slug's real `.md` suffix. That token carries a plausible extension and is
  // not followed by an open parenthesis, so NEITHER the call-skip nor the
  // plausibility guard can see it. This is the shape that refused the very plan
  // that fixes it (its own line 207 cites the plan it repairs).

  const FUSED_VERB_CORPUS = [
    [
      'plans/implementation/a-canonical-create-react-app-is-detected.md line 27 — a cited slug in a table cell',
      "| 1 | `00259-a-canonical-create-react-app-is-detected-s1-symmetric-credit.md` | `calculateConfidence`'s `packageDevDeps` loop credits through `hasDependency` | - |",
    ],
    [
      'plans/in-progress/00260 line 207 — this plan citing the plan it repairs',
      "| `assert.strictEqual` | `plans/in-progress/00259-a-canonical-create-react-app-is-detected-s1-symmetric-credit.md:293` — the live refusal | A, then B, then C |",
    ],
  ];

  for (const [label, prose] of FUSED_VERB_CORPUS) {
    test(`00260 fused-verb corpus: ${label} produces no file-claim error`, () => {
      const result = validator.validateNoContradictions(`# Plan\n\n${prose}\n`, testDir);

      assert.ok(
        !result.errors.some(e => /claimed as created/i.test(e)),
        `a verb syllable inside a cited slug is not a file claim, got: ${JSON.stringify(result.errors)}`
      );
    });
  }

  test('00260 teeth: a claim separated from the verb by a COLON only still errors', () => {
    // Pins the `:` operand of the separation test. The verb and the path are
    // separate words here — the colon is the separator — so the claim is real.
    const content = '# Plan\n\nCreated:src/lib/gone-colon-xyz.js in one pass.\n';

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      result.errors.some(e => /claimed as created/i.test(e) && /gone-colon-xyz\.js/.test(e)),
      `a colon-separated claim must still error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('00260 teeth: a claim separated from the verb by a DELIMITER only still errors', () => {
    // Pins the backtick operand of the separation test: zero whitespace, zero
    // colon, but the opening code delimiter still separates verb from path.
    const content = '# Plan\n\nCreated`src/lib/gone-tick-xyz.js` in one pass.\n';

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      result.errors.some(e => /claimed as created/i.test(e) && /gone-tick-xyz\.js/.test(e)),
      `a delimiter-separated claim must still error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test('00260 teeth: a HYPHEN-PREFIXED verb followed by a real claim still errors', () => {
    // Kills the rejected alternative. Reading the character BEFORE the match and
    // refusing a verb glued to a preceding token character would also refuse
    // "newly-created", "re-created" and "auto-created" — every hyphen-joined
    // compound adjective — and silence a genuine missing-file claim. The guard
    // must test the join on the PATH side, where a real sentence always has a
    // separator, not on the word side, where a real sentence may not.
    const content = '# Plan\n\nnewly-created `src/lib/gone-compound-xyz.js` for the feature.\n';

    const result = validator.validateNoContradictions(content, testDir);

    assert.ok(
      result.errors.some(e => /claimed as created/i.test(e) && /gone-compound-xyz\.js/.test(e)),
      `a hyphen-compound verb still introduces a real claim, got: ${JSON.stringify(result.errors)}`
    );
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
      'Created `util.js`.',
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
    // The refusal now states WHICH fact holds: these blocks hold no checkbox at all
    // (they are prose), which is a different cause — and a different fix — from an
    // open box. It names the section that was read so a wrong-section read is legible
    // from the refusal alone. Same verdict as before, stated precisely.
    assert.ok(
      result.errors.some((e) => /Step 14 \(VERIFY\) has no checkbox at all in the execution section read \(## Execution Plan\)/.test(e)),
      `an incomplete required step must be reported, errors: ${JSON.stringify(result.errors)}`,
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

// ---------------------------------------------------------------------------
// Richest-evidence region selection — which "## Execution Plan" section IS the
// executor's build record.
//
// A plan legitimately carries TWO such sections: the implementation planner
// writes a prose one (all nine "### Step N" headings, few or no checkboxes), and
// src/lib/iron-loop.js appends the canonical checkbox template as a second one,
// which the executor ticks. Selecting by the section's NAME is brittle — the
// spelling has already drifted in live plans (EN DASH, "Steps 7-15", "Iron Loop
// Steps 8-16", "— Build Record"), and every miss makes the gate read the prose
// twin and refuse a plan whose real record is fully ticked.
//
// The discriminator is PER-STEP checkbox evidence: the number of step blocks
// holding at least one box. A raw checkbox-LINE count would let one verbose step
// block outrank a section covering all nine steps (fixture RICH_PROSE below is
// that exact shape, taken from a real plan).
// ---------------------------------------------------------------------------
describe('extractStepBlocks — richest-evidence execution region wins', () => {
  const validator = require('../src/lib/plan-validator.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-exec-region-'));
    fs.mkdirSync(path.join(testDir, 'plans', 'review'), { recursive: true });
    fs.mkdirSync(path.join(testDir, '.ctoc'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // Write the plan plus a FRESH PASSING VERIFY evidence artifact, so the only
  // thing these tests can fail on is the step-block read.
  function gate3(slug, body) {
    const planPath = path.join(testDir, 'plans', 'review', `${slug}.md`);
    fs.writeFileSync(planPath, `---\napproved_by: human\n---\n\n# ${slug}\n\n${body}\n`);
    const mtime = fs.statSync(planPath).mtimeMs;
    const evidencePath = verifyEvidencePath(testDir, slug);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify({
      planSlug: slug,
      timestamp: new Date(mtime + 60000).toISOString(),
      passed: true,
      method: 'fallback-direct',
      checks: {},
      errors: [],
      summary: 'fixture run',
    }, null, 2));
    return validator.validateReviewToDone(planPath, testDir);
  }

  const checkboxRefusals = (result) => result.errors.filter((e) => /checkbox/i.test(e));

  // A ticked canonical record under an arbitrary heading spelling.
  const tickedUnder = (heading) => REVIEW_DONE_EXEC_PLAN.replace('## Execution Plan', heading);

  // The real shape of plans/review/00072-r1-per-request-ctoc-routing-hook.md: a
  // prose twin BACKFILLED with checkboxes under seven of nine steps (12 and 15
  // carry none), and deliberately MORE checkbox LINES (21) than the canonical
  // section has (9). Per-step evidence: 7 blocks vs 9 — the canonical section
  // must win. The prose twin's boxes include an OPEN one in every required step,
  // so if a raw line count picked it, every required step would refuse.
  const RICH_PROSE = (() => {
    const steps = [
      [8, 'TEST'], [9, 'PREPARE'], [10, 'IMPLEMENT'], [11, 'REVIEW'],
      [12, 'OPTIMIZE'], [13, 'SECURE'], [14, 'VERIFY'], [15, 'DOCUMENT'],
      [16, 'FINAL-REVIEW'],
    ];
    const lines = ['## Execution Plan', ''];
    for (const [num, name] of steps) {
      lines.push(`### Step ${num}: ${name}`);
      if (num === 12 || num === 15) {
        lines.push('Prose only — this block carries no checkbox at all.', '');
        continue;
      }
      lines.push(
        '- [x] Backfilled: the executor recorded this step as complete.',
        '- [x] Evidence lives in the Execution Log section of this plan.',
        '- [ ] Planner intent line that was never ticked.',
        '',
      );
    }
    return lines.join('\n');
  })();

  test('R1: a second section headed "## Execution Plan — Build Record" is the record read', () => {
    const result = gate3('build-record', `${PROSE_EXEC_PLAN}\n\n${tickedUnder('## Execution Plan — Build Record')}`);
    assert.deepStrictEqual(checkboxRefusals(result), [],
      `the ticked Build Record section must be the one read, errors: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.valid, true, `plan must pass, errors: ${JSON.stringify(result.errors)}`);
  });

  test('R2: an EN DASH canonical heading "## Execution Plan (Steps 8–16)" is the record read', () => {
    // U+2013. Seven live sections in this repository use this spelling; the old
    // ASCII-hyphen name match missed every one of them.
    const result = gate3('en-dash', `${PROSE_EXEC_PLAN}\n\n${tickedUnder('## Execution Plan (Steps 8–16)')}`);
    assert.deepStrictEqual(checkboxRefusals(result), [],
      `the EN DASH section must be the one read, errors: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.valid, true, `plan must pass, errors: ${JSON.stringify(result.errors)}`);
  });

  test('R3: evidence is counted per STEP BLOCK, not per checkbox LINE (21 lines/7 blocks loses to 9 lines/9 blocks)', () => {
    // The canonical record is under the EN DASH spelling so this case is RED against
    // the old name match too, not only against a raw-line-count discriminator.
    const result = gate3('per-step-count', `${RICH_PROSE}\n\n${tickedUnder('## Execution Plan (Steps 8–16)')}`);
    assert.deepStrictEqual(checkboxRefusals(result), [],
      `the 9-block canonical section must outrank the 21-line prose twin, errors: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.valid, true, `plan must pass, errors: ${JSON.stringify(result.errors)}`);
  });

  test('R4: on EQUAL per-step evidence the LATER section wins (the build template is appended last)', () => {
    // Both candidates cover all nine steps, so evidence ties. The first carries an
    // OPEN Step 14 box, the second is fully ticked: only "last wins" passes.
    const first = REVIEW_DONE_EXEC_PLAN.replace(
      '- [x] All tests green, 0 skipped, 0 flaky',
      '- [ ] All tests green, 0 skipped, 0 flaky',
    );
    // BOTH headings are the bare "## Execution Plan", so no name match can separate
    // them and only the tie rule decides. The old code took the first.
    const result = gate3('tie-last-wins', `${first}\n\n${REVIEW_DONE_EXEC_PLAN}`);
    assert.deepStrictEqual(checkboxRefusals(result), [],
      `on a tie the LATER section must be read, errors: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.valid, true, `plan must pass, errors: ${JSON.stringify(result.errors)}`);
  });

  test('R5: zero evidence anywhere — the FIRST section is still the one read (legacy behaviour)', () => {
    const result = gate3('prose-only-region', PROSE_EXEC_PLAN);
    assert.strictEqual(result.checklist.steps.step_14.present, true,
      'the prose section supplies the step blocks');
    assert.strictEqual(result.checklist.steps.step_14.completed, false,
      'a block with no checkbox is not complete');
    assert.strictEqual(result.valid, false, 'a plan with no checkbox anywhere must not pass');
    assert.ok(checkboxRefusals(result).length > 0,
      `required steps must still refuse, errors: ${JSON.stringify(result.errors)}`);
  });

  test('R6: a genuinely UNTICKED box still reads "has an unchecked required checkbox"', () => {
    const body = REVIEW_DONE_EXEC_PLAN.replace(
      '- [x] All tests green, 0 skipped, 0 flaky',
      '- [ ] All tests green, 0 skipped, 0 flaky',
    );
    const result = gate3('unticked-14', body);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.includes(
      'review→done blocked: Step 14 (VERIFY) has an unchecked required checkbox'),
      `exact wording must be unchanged, errors: ${JSON.stringify(result.errors)}`);
  });

  test('R7: a required block with NO checkbox reads a DISTINCT message naming the section heading', () => {
    const body = REVIEW_DONE_EXEC_PLAN.replace(
      '### Step 14: VERIFY\n- [x] All tests green, 0 skipped, 0 flaky',
      '### Step 14: VERIFY\nRan the suite; see the log below.',
    );
    const result = gate3('no-box-14', body);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.checklist.steps.step_14.hasCheckbox, false,
      'the checklist must record that the block held no checkbox');
    const step14 = result.errors.filter((e) => /Step 14 \(VERIFY\)/.test(e));
    assert.ok(step14.some((e) => /no checkbox/i.test(e) && /## Execution Plan/.test(e)),
      `expected a no-checkbox refusal naming the heading read, got: ${JSON.stringify(step14)}`);
    assert.ok(!step14.some((e) => /unchecked required checkbox/.test(e)),
      `the two facts must not share one message, got: ${JSON.stringify(step14)}`);
  });

  test('R8: a plan with no "## Execution Plan" section at all yields no step blocks', () => {
    const result = gate3('no-exec-section', '## Design\n\nProse only. No execution section exists.');
    for (const num of [8, 9, 10, 11, 13, 14, 16]) {
      assert.strictEqual(result.checklist.steps[`step_${num}`].present, false,
        `Step ${num} must have no block`);
      assert.ok(result.errors.includes(`Step ${num} (${{
        8: 'TEST', 9: 'PREPARE', 10: 'IMPLEMENT', 11: 'REVIEW',
        13: 'SECURE', 14: 'VERIFY', 16: 'FINAL-REVIEW',
      }[num]}) is required but not addressed`),
        `Step ${num} must be reported as not addressed, errors: ${JSON.stringify(result.errors)}`);
    }
    assert.deepStrictEqual(checkboxRefusals(result), [],
      'an absent block is its own message, not a checkbox refusal');
  });
});

console.log('\nPlan Validator Tests');
console.log('====================\n');

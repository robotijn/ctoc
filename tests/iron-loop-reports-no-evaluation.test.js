'use strict';

/**
 * THE PLAN CRITIC STOPS REPORTING A SCORE IT DID NOT EARN.
 *
 * Observed by running it, before this slice existed: a plan whose entire body is
 * "This plan says nothing. It has no design, no tests, no acceptance criteria."
 * received completeness 5, clarity 4, edgeCases 4, efficiency 5, security 5 —
 * an average of 4.6 — and a passing terminal status on round one.
 *
 * The mechanism was self-grading. `refineLoop` called `integrate`, which APPENDED a
 * boilerplate Steps 8-16 template to the plan file, and then `critique` grepped
 * THAT SAME TEMPLATE. The security score came from the template's own Step 13
 * checklist ("Validate inputs (no path traversal)", "Sanitize outputs", "No secrets
 * in code", "Safe file operations"); the edge-case point came from the template's
 * own "Add error handling"; and the clarity score was DOCKED because the template's
 * own fallback line "Implement the feature according to requirements" matched the
 * critic's own vague-language pattern. The critic penalised the plan for a sentence
 * the critic wrote. Every plan received the same five numbers.
 *
 * THE RULING: this slice does NOT build a real evaluator — that is separate work the
 * human schedules. It makes the machinery report HONESTLY that no evaluation was
 * performed, following the in-repo exemplar `src/lib/comparator-agent.js`: mark the
 * return a stub, carry a warning to the runner, never fake a verdict.
 *
 * Every test here drives the REAL exported functions against real temp-dir fixtures.
 * The only boundary ever substituted is the filesystem (case 16), never core logic.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ironLoop = require('../src/lib/iron-loop');
const { critique, refineLoop } = ironLoop;
const actions = require('../src/lib/actions');
const safeFs = require('../src/lib/safe-fs');

// ── fixtures ─────────────────────────────────────────────────────────────────

let dir;

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo',
  'in-progress', 'review', 'done'];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iron-loop-noeval-'));
  for (const s of STAGES) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Write a bare plan file in the temp dir root. */
function plan(content, name = 'plan.md') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

/** Write a plan into a pipeline stage of the fixture project. */
function stagePlan(stage, name, content) {
  const p = path.join(dir, 'plans', stage, `${name}.md`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function missingPath() {
  return path.join(os.tmpdir(), `iron-loop-absent-${Date.now()}-${Math.random()}.md`);
}

/** THE observed defect input: a plan that says nothing at all. */
const EMPTY_PLAN =
  '# Empty Plan\n\n' +
  'This plan says nothing. It has no design, no tests, no acceptance criteria.\n';

/** A rich plan — it must receive the SAME honest verdict as the empty one. */
const RICH_PLAN = `# Streaming Parser

## Requirements
- [ ] Parse the input file incrementally
- [ ] Validate the header before any body byte is consumed

## Proposed Solution
A pull parser over a bounded ring buffer, so memory does not scale with input size.

## Implementation Plan
- Create the parser module
- Add header validation with an explicit error for a truncated header
- Update the reader to stream instead of buffering
`;

/** Recursively collect every key name appearing anywhere in a value. */
function allKeys(value, seen = new Set()) {
  const found = [];
  if (value === null || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const v of value) found.push(...allKeys(v, seen));
    return found;
  }
  for (const [k, v] of Object.entries(value)) {
    found.push(k);
    found.push(...allKeys(v, seen));
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1-3 — the empty plan is not scored
// ─────────────────────────────────────────────────────────────────────────────

describe('the unevaluated plan reports that it was not evaluated', () => {
  it('CASE 1 — the empty plan gets an honest not-evaluated verdict, not a passing score', () => {
    const p = plan(EMPTY_PLAN);

    const result = refineLoop(p, 10);

    assert.equal(result.status, 'not-evaluated',
      'the plan was not evaluated, so the status must say exactly that');
    assert.equal(result.evaluated, false);
    assert.equal(result.stub, true,
      'mirrors src/lib/comparator-agent.js — an unwired judge marks its own return a stub');
    assert.equal(result.scores, null);
    assert.ok(typeof result.warning === 'string' && result.warning.length > 0,
      'the verdict carries a warning naming the blindness');
  });

  it('CASE 2 — no numeric grade survives anywhere in the returned object', () => {
    const p = plan(EMPTY_PLAN);

    const result = refineLoop(p, 10);

    const keys = new Set(allKeys(result));
    for (const dim of ['completeness', 'clarity', 'edgeCases', 'efficiency', 'security']) {
      assert.equal(keys.has(dim), false,
        `a dimension score named "${dim}" is still being reported — it was computed ` +
        'from the template this module itself appended, not from the plan');
    }
  });

  it('CASE 3 — scores is null, never a default number a consumer could read as measured', () => {
    const p = plan(EMPTY_PLAN);

    const result = refineLoop(p, 10);

    // The false-green rule this repository already enforces in src/scripts/test-gate.js:
    // a no-match default that equals the SUCCESS value cannot distinguish "all good"
    // from "I could not read my input". Zero would be a verdict; null is the absence
    // of one, and a consumer doing arithmetic on it fails loudly.
    assert.equal(result.scores, null);
    assert.notEqual(result.scores, 0);
    assert.equal(typeof result.scores, 'object');
  });

  it('CASE 6 — a GOOD plan receives the same honest verdict as a bad one (nothing evaluated either)', () => {
    const p = plan(RICH_PLAN);

    const result = refineLoop(p, 10);

    assert.equal(result.status, 'not-evaluated');
    assert.equal(result.evaluated, false);
    assert.equal(result.scores, null);
  });

  it('CASE 12 — maxRounds is honestly ignored: rounds is always 1, never a fake ten', () => {
    const p = plan(EMPTY_PLAN);

    const result = refineLoop(p, 10);

    assert.equal(result.rounds, 1,
      'there was never a loop that could do anything: content was read once and the ' +
      'append was guarded, so ten rounds scored identical bytes identically');
  });

  it('CASE 14 — a missing plan file still throws, from both entry points', () => {
    const absent = missingPath();
    assert.throws(() => critique(absent), /Plan file not found/);
    assert.throws(() => refineLoop(absent), /Plan file not found/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// critique — structural facts survive, grades do not
// ─────────────────────────────────────────────────────────────────────────────

describe('critique reports checkable structural facts and no quality judgement', () => {
  it('CASE 7 — a mislabeled step and a duplicated IMPLEMENT step are reported as facts', () => {
    const p = plan(`# Plan

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] a
### Step 9: PREPARE
- [ ] b
### Step 10: IMPLEMENT
- [ ] c
### Step 10: IMPLEMENT
- [ ] c again
### Step 11: REVIEWING
- [ ] d
### Step 12: OPTIMIZE
- [ ] e
### Step 13: SECURE
- [ ] f
### Step 14: VERIFY
- [ ] g
### Step 15: DOCUMENT
- [ ] h
### Step 16: FINAL-REVIEW
- [ ] i
`);

    const result = critique(p);

    assert.equal(result.evaluated, false);
    assert.equal(result.stub, true);
    assert.equal(result.scores, null);
    assert.ok(result.structural.mislabeledSteps.includes(11),
      'Step 11 is present but labelled REVIEWING — a checkable fact about the file');
    assert.equal(result.structural.implementStepCount, 2);
    assert.deepEqual(result.feedback, [],
      'the hardcoded issue literals are deleted; critique invents no findings');
  });

  it('CASE 8 — a step that is absent entirely is reported as missing, not as a low score', () => {
    const p = plan(`# Plan

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] a
### Step 9: PREPARE
- [ ] b
### Step 10: IMPLEMENT
- [ ] c
### Step 11: REVIEW
- [ ] d
### Step 12: OPTIMIZE
- [ ] e
### Step 14: VERIFY
- [ ] g
### Step 15: DOCUMENT
- [ ] h
### Step 16: FINAL-REVIEW
- [ ] i
`);

    const result = critique(p);

    assert.ok(result.structural.missingSteps.includes(13), 'Step 13 is absent');
    assert.equal(result.structural.missingSteps.includes(8), false, 'Step 8 is present');
    assert.equal(result.scores, null);
  });

  it('CASE 7b — a plan with no execution section reports that fact without inventing scores', () => {
    const p = plan('# Plan\n\nNo execution plan section at all.\n');

    const result = critique(p);

    assert.equal(result.structural.hasExecutionPlan, false);
    assert.equal(result.scores, null,
      'the old code returned all-ones here — a verdict of "1" on input it never read');
    assert.equal(result.evaluated, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// the real work that is preserved
// ─────────────────────────────────────────────────────────────────────────────

describe('the one piece of real work — appending the execution section — is preserved', () => {
  it('CASE 9 — the execution section is still appended with every canonical Step 8-16 label', () => {
    const p = plan(RICH_PLAN);

    refineLoop(p, 10);

    const onDisk = fs.readFileSync(p, 'utf8');
    assert.ok(onDisk.includes('## Execution Plan (Steps 8-16)'));
    for (const label of ['TEST', 'PREPARE', 'IMPLEMENT', 'REVIEW', 'OPTIMIZE',
      'SECURE', 'VERIFY', 'DOCUMENT', 'FINAL-REVIEW']) {
      assert.ok(onDisk.includes(label), `missing canonical label ${label}`);
    }
  });

  it('CASE 10 — the append stays idempotent: running twice yields exactly one section', () => {
    const p = plan(RICH_PLAN);

    refineLoop(p, 10);
    refineLoop(p, 10);

    const onDisk = fs.readFileSync(p, 'utf8');
    const occurrences = onDisk.split('## Execution Plan (Steps 8-16)').length - 1;
    assert.equal(occurrences, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// the verdict reaches the plan file the human reads at Gate 2
// ─────────────────────────────────────────────────────────────────────────────

describe('the honest verdict reaches the plan file', () => {
  it('CASE 4 — applyIronLoop writes NOT EVALUATED into a plan that arrives without the flag', () => {
    const p = stagePlan('implementation', 'no-flag', EMPTY_PLAN);

    actions.applyIronLoop(p);

    const onDisk = fs.readFileSync(p, 'utf8');
    assert.ok(onDisk.includes('## Deferred Questions'),
      'the verdict must land in the file the human reads at Gate 2');
    assert.ok(onDisk.includes('NOT EVALUATED'),
      'the human must read the blindness, not infer that something checked this plan');
    assert.match(onDisk, /no automated critique was performed/i);
  });

  it('CASE 5 — the fabricated feedback literals are gone from the written file', () => {
    const p = stagePlan('implementation', 'no-fabrication', EMPTY_PLAN);

    actions.applyIronLoop(p);

    const onDisk = fs.readFileSync(p, 'utf8');
    for (const lie of ['Missing steps or actions', 'Some actions are vague',
      'Error handling not covered', 'Potential redundant steps',
      'Security checks incomplete']) {
      assert.equal(onDisk.includes(lie), false,
        `"${lie}" was a fixed literal emitted for any score below 5 — it was derived ` +
        'from nothing and must not read as a finding about this plan');
    }
  });

  it('CASE 11 — Gate 2 still crosses end to end: approvePlan moves the plan and stamps it', () => {
    const p = stagePlan('implementation', 'gate-two-intact',
      '# Gate Two Plan\n\n## Implementation\nBuild the thing.\n');

    const res = actions.approvePlan(p, dir);

    assert.equal(res.refused, undefined, 'a valid implementation plan is not refused');
    assert.equal(res.humanGate, true);
    const dest = path.join(dir, 'plans', 'todo', 'gate-two-intact.md');
    assert.ok(fs.existsSync(dest), 'the plan crossed into the todo queue');
    const onDisk = fs.readFileSync(dest, 'utf8');
    assert.match(onDisk, /approved_by:\s*human/, 'the human-approval marker is unchanged');
    assert.match(onDisk, /iron_loop:\s*true/, 'the applied-flag is still written');
    assert.ok(onDisk.includes('NOT EVALUATED'),
      'and the human at Gate 2 reads that nothing evaluated this plan');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE 15 — THE REAL PATH. This documents reach; it must be green before AND after.
// ─────────────────────────────────────────────────────────────────────────────

describe('the reach of the verdict on plans as they are actually authored', () => {
  it('CASE 15 — a plan carrying iron_loop: true AS AUTHORED NOW receives the verdict: the split guard reaches it', () => {
    // FORK RESOLVED (human Gate-1 decision on
    // plans/functional/honest-plan-verdict-reaches-every-plan.md): reading (c) — split
    // the overloaded flag. `iron_loop` now gates ONLY the Steps 8-16 section; a NEW
    // `iron_loop_verdict` gates the verdict independently. Every plan in this
    // repository's queue is authored with `iron_loop: true` but no `iron_loop_verdict`
    // — exactly the pre-fix state that used to hit the single early guard and receive
    // NO verdict. This case is the REAL path, and it now pins the resolved behavior:
    // the honest verdict reaches the plan the human reads, the existing section is left
    // untouched, and `iron_loop_verdict` is stamped so it is written exactly once. It
    // deliberately does NOT pre-strip the flag: the fixture is the plan as authored.
    const authored = `---
title: "A plan as authored"
type: implementation
iron_loop: true
---

# A plan as authored

This plan says nothing. It has no design, no tests, no acceptance criteria.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] PRE-EXISTING-SECTION-MARKER write tests

### Step 16: FINAL-REVIEW
- [ ] Final review before merge
`;
    const p = stagePlan('implementation', 'as-authored', authored);

    actions.applyIronLoop(p);

    const after = fs.readFileSync(p, 'utf8');
    // The verdict now reaches a plan authored with the flag — the fork's resolution.
    assert.ok(after.includes('## Deferred Questions'),
      'the honest verdict now reaches a plan authored with iron_loop: true');
    assert.ok(after.includes('NOT EVALUATED'),
      'the human reads the blindness rather than inferring a check that never ran');
    assert.equal(after.split('## Deferred Questions').length - 1, 1,
      'the verdict is written exactly once');
    // The existing section is left untouched, guarded independently by iron_loop.
    assert.ok(after.includes('PRE-EXISTING-SECTION-MARKER'),
      'the pre-existing Steps 8-16 section is preserved, not regenerated');
    assert.equal(after.split('## Execution Plan (Steps 8-16)').length - 1, 1,
      'the section is not duplicated');
    // The verdict flag is now stamped so a later pass writes no second verdict.
    assert.match(after, /iron_loop_verdict:\s*true/,
      'iron_loop_verdict is stamped after the verdict is written');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE 13 — the dead template family is gone
// ─────────────────────────────────────────────────────────────────────────────

describe('the dead template family is deleted, not left as a trap', () => {
  it('CASE 13 — validateForTodo, hasIronLoopSteps, generateIronLoopTemplate and IRON_LOOP_MARKER are gone', () => {
    // validateForTodo had a Gate-2-sounding name, zero callers, and checked a marker
    // ('## Execution Steps (Iron Loop 8-16)') that this module never writes — it
    // writes '## Execution Plan (Steps 8-16)'. It therefore rejected every plan the
    // module itself generated. A broken predicate with an authoritative name is an
    // invitation for a future caller to trust it; an absent function cannot be.
    for (const name of ['validateForTodo', 'hasIronLoopSteps',
      'generateIronLoopTemplate', 'IRON_LOOP_MARKER']) {
      assert.equal(ironLoop[name], undefined, `${name} must be deleted, not merely unused`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE 16 — the catch path surfaces the failure and claims no verdict
// ─────────────────────────────────────────────────────────────────────────────

describe('a failure inside the loop is surfaced, never swallowed into a fake verdict', () => {
  it('CASE 16 — when the loop throws, the failure reaches stderr and no verdict is claimed', () => {
    const p = stagePlan('implementation', 'write-fails', EMPTY_PLAN);

    // Substitute the FILESYSTEM boundary only, and only for the first write, so the
    // refinement loop throws exactly once and the fallback path can still run.
    const realWrite = safeFs.writeFileSync;
    const errors = [];
    const realError = console.error;
    let thrown = 0;
    safeFs.writeFileSync = function (...args) {
      if (thrown === 0) { thrown = 1; throw new Error('disk is full'); }
      return realWrite.apply(safeFs, args);
    };
    console.error = (...args) => { errors.push(args.join(' ')); };

    try {
      actions.applyIronLoop(p);
    } finally {
      safeFs.writeFileSync = realWrite;
      console.error = realError;
    }

    assert.ok(errors.some(e => /Iron Loop refinement failed/.test(e)),
      'the failure must be reported, not swallowed');
    const onDisk = fs.readFileSync(p, 'utf8');
    assert.equal(onDisk.includes('NOT EVALUATED'), false,
      'a plan whose verdict never completed must not carry one');
    assert.equal(onDisk.includes('## Deferred Questions'), false);
  });
});

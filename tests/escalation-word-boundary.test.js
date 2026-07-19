/**
 * A plan that MENTIONS a status word in prose is not a plan that DECLARES that
 * status on a step.
 *
 * src/lib/plan-validator.js matched SKIPPED / BLOCKED / DEFERRED as a bare
 * substring on any line that also contained "Step <n>". A plan whose own honest
 * prose described the quality gate — "coverage floor + zero-skipped gate",
 * "0 skipped, 0 flaky", "startAgent documents skipped[]", "parseSkipped returns
 * null" — was therefore read as declaring an unapproved skipped step, and its
 * completion was refused. That happened to real plans in this repository.
 *
 * Both directions are load-bearing and both are tested here:
 *   - prose mentions must NOT be read as a declared status (the reported defect);
 *   - a genuinely declared status must STILL be caught, and must still require
 *     its approval line (a fix that only loosens has removed the gate).
 *
 * A plain `\b` boundary does NOT fix this and is asserted here as a guard: in
 * "zero-skipped" the preceding character is a hyphen — a NON-word character — so
 * a word boundary exists and /\bskipped\b/i matches.
 *
 * Cross-platform: fs.promises/fs, path.join, os.tmpdir().
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test, describe, beforeEach, afterEach } = require('node:test');

const validator = require('../src/lib/plan-validator');

const REPO_ROOT = path.join(__dirname, '..');

/**
 * Build a "## Execution Plan" whose step lines are all clean, then overlay any
 * replacement lines keyed by step number. Every required step is present and
 * ticked so the ONLY thing under test is status-word detection.
 */
function execPlan(overrides = {}) {
  const steps = [
    [8, 'TEST', 'wrote failing tests first'],
    [9, 'PREPARE', 'environment ready'],
    [10, 'IMPLEMENT', 'change landed'],
    [11, 'REVIEW', 'self reviewed'],
    [12, 'OPTIMIZE', 'no hot path touched'],
    [13, 'SECURE', 'inputs validated'],
    [14, 'VERIFY', 'full gated run green'],
    [15, 'DOCUMENT', 'docs updated'],
    [16, 'FINAL-REVIEW', 'ready for review']
  ];
  const out = ['## Execution Plan', ''];
  for (const [num, label, body] of steps) {
    const o = overrides[num];
    out.push(o && o.heading ? o.heading : `### Step ${num}: ${label}`);
    out.push(o && o.body ? o.body : `- [x] ${body}`);
    out.push('');
  }
  return out.join('\n');
}

function planFile(overrides = {}, extra = '') {
  return [
    '---',
    'title: "boundary fixture"',
    'iron_loop: true',
    '---',
    '',
    '# Boundary fixture',
    '',
    '## Acceptance Criteria',
    '',
    '- [x] the behaviour under test holds',
    '',
    extra,
    '',
    execPlan(overrides),
    '',
    '## Notes',
    '',
    'Nothing else.',
    ''
  ].join('\n');
}

/** All escalation errors in a validateForReview result. */
function escalationErrors(result) {
  return result.errors.filter((e) => /without escalation approval/i.test(e));
}

describe('status words match as standalone status markers, never as prose substrings', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-ewb-'));
    for (const stage of ['implementation', 'todo', 'in-progress', 'review', 'done']) {
      fs.mkdirSync(path.join(testDir, 'plans', stage), { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function write(name, content) {
    const p = path.join(testDir, `${name}.md`);
    fs.writeFileSync(p, content);
    return p;
  }

  // ------------------------------------------------------------------ guard
  // The premise of the whole fix: a plain word boundary is not enough.

  test('a plain word boundary does NOT separate zero-skipped — this is why the fix is not \\b', () => {
    assert.equal(/\bskipped\b/i.test('zero-skipped'), true,
      'if this ever becomes false the hyphen is a word character and the fix can be simplified');
    assert.equal(/\bskipped\b/i.test('0 skipped'), true);
  });

  // ------------------------------------------------- direction 1: prose is prose

  test('case 1 — a Step line describing the zero-skipped gate is not a skipped step', () => {
    const p = write('zero-skipped-prose', planFile({
      14: { heading: '### Step 14: VERIFY — the full gated run (suite + coverage floor + zero-skipped).' }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.deepEqual(escalationErrors(result), [],
      `prose about the zero-skipped gate must not be read as a declared skip: ${JSON.stringify(result.errors)}`);
    assert.equal(result.valid, true, `plan must validate: ${JSON.stringify(result.errors)}`);
    assert.equal(
      Object.keys(result.checklist.escalations).some((k) => k.startsWith('escalation_14_')),
      false,
      'no escalation checklist entry may be recorded for step 14'
    );
  });

  test('case 6 — real compound and quantified forms on Step lines do not fire', () => {
    const shapes = [
      '### Step 12: OPTIMIZE — zero-skipped is the gate, not a status.',
      '### Step 12: OPTIMIZE — the skipped-tests policy is unchanged.',
      '### Step 12: OPTIMIZE — a no-skipped run is the requirement.',
      '### Step 12: OPTIMIZE — 0 skipped, 0 flaky.',
      '### Step 12: OPTIMIZE — zero skipped tests across the suite.',
      '### Step 12: OPTIMIZE — no skipped tests remain.',
      '### Step 12: OPTIMIZE — parseSkipped returns null on no match.',
      '### Step 12: OPTIMIZE — startAgent documents skipped[] and force.',
      '### Step 12: OPTIMIZE — not skipped, fully executed.',
      '### Step 12: OPTIMIZE — the non-blocked path stays open.',
      '### Step 12: OPTIMIZE — deferred-dependency handling is unchanged.'
    ];
    for (const heading of shapes) {
      const p = write(`shape-${shapes.indexOf(heading)}`, planFile({ 12: { heading } }));
      const result = validator.validateForReview(p, testDir);
      assert.deepEqual(escalationErrors(result), [],
        `must not fire on: ${heading}\n  got ${JSON.stringify(result.errors)}`);
    }
  });

  test('case 4/5 — BLOCKED and DEFERRED prose compounds do not fire', () => {
    for (const heading of [
      '### Step 9: PREPARE — the non-blocked path is the default.',
      '### Step 9: PREPARE — unblocked by the upstream change.',
      '### Step 9: PREPARE — deferred-dependency resolution is out of scope.'
    ]) {
      const p = write(`bd-${heading.length}`, planFile({ 9: { heading } }));
      const result = validator.validateForReview(p, testDir);
      assert.deepEqual(escalationErrors(result), [], `must not fire on: ${heading}`);
    }
  });

  test('case 7 — an INCOMPLETE step whose prose says "0 skipped" is not marked skipped', () => {
    const p = write('incomplete-prose', planFile({
      12: { body: '- [ ] confirm the run reports 0 skipped, 0 flaky' }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.equal(result.checklist.steps.step_12.completed, false, 'fixture must be incomplete');
    assert.equal(result.checklist.steps.step_12.skipped, false,
      'prose "0 skipped" in an unfinished step must not mark the step skipped');
  });

  test('case 7b — an INCOMPLETE step mentioning zero-skipped is not marked skipped', () => {
    const p = write('incomplete-compound', planFile({
      12: { body: '- [ ] keep the zero-skipped gate intact' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.checklist.steps.step_12.skipped, false);
  });

  // ------------------------------------------ direction 2: the gate still holds

  test('case 2 — a genuinely declared SKIPPED step is still caught', () => {
    const p = write('real-skip', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED' }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.equal(result.valid, false, 'an unapproved declared skip must fail the review gate');
    assert.ok(
      result.errors.some((e) => /Step 12 marked as SKIPPED without escalation approval/i.test(e)),
      `expected an escalation error naming step 12, got ${JSON.stringify(result.errors)}`
    );
  });

  test('case 11 — a lowercase declared skip is still caught', () => {
    const p = write('real-skip-lower', planFile({
      12: { heading: '### Step 12: OPTIMIZE — skipped' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.valid, false, 'case-insensitivity must be preserved');
    assert.ok(result.errors.some((e) => /Step 12 marked as SKIPPED/i.test(e)));
  });

  test('case 2b — a declared skip followed by a parenthesised reason is still caught', () => {
    const p = write('real-skip-paren', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED (no hot path in this slice)' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.valid, false,
      'a bracketed reason is not an approval marker; the skip must still be caught');
  });

  test('case 3 — an APPROVED declared skip clears the gate', () => {
    const p = write('approved-skip', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED — APPROVED: nothing on a hot path' }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.deepEqual(escalationErrors(result), [],
      `an approved skip must raise no escalation error, got ${JSON.stringify(result.errors)}`);
    assert.equal(result.checklist.escalations.escalation_12_SKIPPED.approved, true,
      'the approval must be recorded on the checklist entry');
  });

  test('case 3b — a REASON: line clears the gate (the approval probe keeps its boundary)', () => {
    const p = write('reason-skip', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED REASON: covered upstream' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.deepEqual(escalationErrors(result), []);
    assert.equal(result.checklist.escalations.escalation_12_SKIPPED.approved, true);
  });

  test('case 4/5b — declared BLOCKED and DEFERRED are still caught', () => {
    const blocked = write('real-blocked', planFile({
      9: { heading: '### Step 9: PREPARE — BLOCKED' }
    }));
    const rb = validator.validateForReview(blocked, testDir);
    assert.equal(rb.valid, false);
    assert.ok(rb.errors.some((e) => /Step 9 marked as BLOCKED/i.test(e)));

    const deferred = write('real-deferred', planFile({
      11: { heading: '### Step 11: REVIEW — DEFERRED' }
    }));
    const rd = validator.validateForReview(deferred, testDir);
    assert.equal(rd.valid, false);
    assert.ok(rd.errors.some((e) => /Step 11 marked as DEFERRED/i.test(e)));
  });

  test('a declared skip is still recognised on the step-completion path', () => {
    const p = write('skip-completion', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED', body: '- [ ] not done' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.checklist.steps.step_12.skipped, true,
      'an explicit standalone SKIPPED marker on an unfinished step must still count as skipped');
  });

  // ----------------------------------- the contradiction scan (third defect site)

  test('case 8 — the contradiction scan does not fire on skipped-test prose', () => {
    const content = '# Plan\n\nStep 8: TEST — the skipped-test policy is documented.\n';
    const result = validator.validateNoContradictions(content, REPO_ROOT);
    assert.equal(
      result.warnings.some((w) => /Step 8 \(TEST\) marked as skipped/i.test(w)),
      false,
      `prose must not produce the step-8 skip warning, got ${JSON.stringify(result.warnings)}`
    );
  });

  test('case 9 — the contradiction scan still fires on a real skip', () => {
    for (const content of [
      '# Plan\n\nStep 8: TEST — SKIP\n',
      '# Plan\n\nStep 8: SKIPPED because coverage looks fine.\n'
    ]) {
      const result = validator.validateNoContradictions(content, REPO_ROOT);
      assert.ok(
        result.warnings.some((w) => /Step 8 \(TEST\) marked as skipped but test files exist/i.test(w)),
        `a real skip must still warn for: ${JSON.stringify(content)}`
      );
    }
  });

  test('case 10 — the contradiction scan does not span a newline', () => {
    // "Step 8" on one line, a bare SKIP on the next: two separate statements.
    const content = '# Plan\n\nStep 8: TEST\n\nSKIP the unrelated section below.\n';
    const result = validator.validateNoContradictions(content, REPO_ROOT);
    assert.equal(
      result.warnings.some((w) => /Step 8 \(TEST\) marked as skipped/i.test(w)),
      false,
      'the pattern must not match across a line break'
    );
  });

  test('case 10b — the contradiction scan is not stopped by the letter n', () => {
    // The literal class was [^\\n] — "not a backslash and not the letter n" —
    // so a step line containing an "n" could never reach its own SKIP marker.
    const content = '# Plan\n\nStep 8: TEST — nothing ran, SKIP\n';
    const result = validator.validateNoContradictions(content, REPO_ROOT);
    assert.ok(
      result.warnings.some((w) => /Step 8 \(TEST\) marked as skipped but test files exist/i.test(w)),
      'a real skip on a line containing the letter "n" must still be detected'
    );
  });

  // ---------------------------------------------- case 12: this repo's own plans

  test('case 12 — no repository plan is refused for a status it only mentions in prose', () => {
    // Known false-positive prose shapes. A plan refused for an escalation whose
    // triggering line matches ONLY one of these was never declaring a status.
    const PROSE_SHAPES = [
      /zero-skipped/i, /\bzero\s+skipped\b/i, /\b0\s+skipped\b/i, /\bno[-\s]skipped\b/i,
      /\bnot\s+skipped\b/i, /skipped-tests?\b/i, /parseSkipped/, /skipped\[\]/i,
      /\bnon-blocked\b/i, /\bunblocked\b/i, /deferred-dependency/i
    ];

    // A synthetic plan carrying the exact prose that caused the outage, so this
    // test can never be vacuous regardless of what lives in plans/ today.
    const synthetic = path.join(testDir, 'plans', 'review', 'synthetic-zero-skipped.md');
    fs.writeFileSync(synthetic, planFile({
      14: { heading: '### Step 14: VERIFY — the full gated run (suite + coverage floor + zero-skipped).' }
    }));

    const targets = [{ file: synthetic, root: testDir }];
    for (const stage of ['implementation', 'todo', 'in-progress', 'review']) {
      const dir = path.join(REPO_ROOT, 'plans', stage);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
        targets.push({ file: path.join(dir, f), root: REPO_ROOT });
      }
    }
    assert.ok(targets.length >= 1, 'at least the synthetic plan must be scanned');

    const offenders = [];
    for (const { file, root } of targets) {
      let result;
      try {
        result = validator.validateForReview(file, root);
      } catch {
        continue; // an unreadable/odd plan is not this slice's concern
      }
      const content = fs.readFileSync(file, 'utf8');
      for (const err of escalationErrors(result)) {
        const m = err.match(/Step\s*(\d+)\s+marked as\s+(\w+)/i);
        if (!m) continue;
        const [, stepNum, status] = m;
        const lines = content.split(/\r?\n/).filter(
          (line) => new RegExp(`Step\\s*${stepNum}\\b`, 'i').test(line) &&
                    new RegExp(status, 'i').test(line)
        );
        const onlyProse = lines.length > 0 && lines.every((line) => {
          const stripped = PROSE_SHAPES.reduce((acc, re) => acc.replace(new RegExp(re.source, 'gi'), ''), line);
          return !new RegExp(status, 'i').test(stripped);
        });
        if (onlyProse) offenders.push(`${path.basename(file)}: ${err.trim()}\n    ${lines.join('\n    ')}`);
      }
    }

    assert.deepEqual(offenders, [],
      `these plans are refused for prose they merely mention:\n  ${offenders.join('\n  ')}`);
  });
});

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

/**
 * A status word inside INLINE CODE or a QUOTATION is a mention, not a claim.
 *
 * The boundary rules above handle the COMPOUND and QUANTIFIED forms
 * (`zero-skipped`, `skipped[]`, `0 skipped`). They cannot help a BARE standalone
 * word, and a plan whose subject IS the skip counter has to be able to quote that
 * counter's label. Three real builds were refused for exactly that — the offending
 * text was inside backticks, quoting a label printed by the test runner — and each
 * author reworded their own plan to get through. A gate defeated by rewording
 * measures the wording, not the work.
 *
 * The discriminator is measured, not assumed: every false positive found in this
 * repository's corpus sits inside inline code or a quotation, and every genuine
 * declaration is bare prose — including a MID-LINE one
 * (plans/review/00012-r3a-ledger-forgery-closed.md:129) that a "require a trailing
 * marker / colon / bold" rule would have freed. Freeing that one would convert a
 * blocking error into silence: a false green created while fixing a false red.
 *
 * Both directions are asserted here and neither may be weakened:
 *   - a quoted or coded mention must NOT be read as a declaration;
 *   - a bare declaration must STILL be caught, and an approval written inside
 *     backticks must NOT clear it (masking must not launder an approval).
 */
describe('a status word inside code or quotes is a mention, never a declaration', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-mask-'));
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

  // ------------------------------------------- direction 1: quoted is not claimed

  test('case 1 — the reported defect verbatim: the runner counter label inside backticks', () => {
    // The exact prose that was refused: a step line quoting the counter label the
    // test runner prints. Reworded to "skip-count line" at the time to get through.
    const p = write('counter-label', planFile({
      14: { heading: '### Step 14: VERIFY — record the verbatim `ℹ skipped N` line from the gated run.' }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.deepEqual(escalationErrors(result), [],
      `a counter label inside backticks is not a declared skip: ${JSON.stringify(result.errors)}`);
    assert.equal(result.valid, true, `plan must validate: ${JSON.stringify(result.errors)}`);
  });

  test('case 1b — a backticked list of runner counters (the corpus false positive)', () => {
    const p = write('counter-list', planFile({
      14: { heading: '### Step 14: VERIFY — record `tests`, `suites`, `pass`, `fail`, `skipped`, `todo` verbatim.' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.deepEqual(escalationErrors(result), [],
      `backticked counter names are not declarations: ${JSON.stringify(result.errors)}`);
  });

  test('case 2 — a kickback message quoted in double quotes', () => {
    const p = write('quoted-kickback', planFile({
      9: { heading: '### Step 9: PREPARE — the kickback said "Step 9 marked as SKIPPED" and it was wrong.' }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.deepEqual(escalationErrors(result), [],
      `a quoted error message is not a declaration: ${JSON.stringify(result.errors)}`);
  });

  test('case 3 — a fenced example containing a step line with a bare status word', () => {
    const p = write('fenced-example', planFile({
      12: {
        body: [
          '- [x] documented the shape the checker must still catch:',
          '',
          '```',
          'Step 12: OPTIMIZE — SKIPPED',
          '```'
        ].join('\n')
      }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.deepEqual(escalationErrors(result), [],
      `a fenced example is not a declaration: ${JSON.stringify(result.errors)}`);
  });

  test('case 3b — a tilde-fenced example is masked the same way', () => {
    const p = write('tilde-fenced', planFile({
      12: {
        body: ['- [x] example below:', '', '~~~', 'Step 12: OPTIMIZE — BLOCKED', '~~~'].join('\n')
      }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.deepEqual(escalationErrors(result), [],
      `a tilde-fenced example is not a declaration: ${JSON.stringify(result.errors)}`);
  });

  test('case 4 — typographic quotes mask the same as straight ones', () => {
    const p = write('typographic', planFile({
      9: { heading: '### Step 9: PREPARE — the kickback said “Step 9 marked as SKIPPED” and it was wrong.' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.deepEqual(escalationErrors(result), [],
      `a typographically quoted message is not a declaration: ${JSON.stringify(result.errors)}`);
  });

  // ------------------------------------------ direction 2: the gate still holds

  test('case 5 — a trailing-marker declaration is still caught', () => {
    const p = write('trailing-decl', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.valid, false, 'an unapproved trailing declaration must still fail');
    assert.ok(result.errors.some((e) => /Step 12 marked as SKIPPED without escalation approval/i.test(e)),
      `expected an escalation error naming step 12, got ${JSON.stringify(result.errors)}`);
  });

  test('case 6 — the MID-LINE declaration is still caught (the shape the rejected fix would free)', () => {
    // The shape of plans/review/00012-r3a-ledger-forgery-closed.md:129 — a real,
    // unapproved declaration written mid-line, with backticked identifiers around
    // it. No trailing marker, no colon form, no bold. This is the counter-example
    // that rejected the "require a declared form" proposal.
    const p = write('midline-decl', planFile({
      10: {
        heading: '### Step 10: IMPLEMENT — items 1,2,3 done. Items 4 (`plan_basename` into `stampAndLedger`) SKIPPED — both actions.js, re-scoped to the concurrent slice.'
      }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.equal(result.valid, false,
      'a bare mid-line declaration must still be caught even with backticks elsewhere on the line');
    assert.ok(result.errors.some((e) => /Step 10 marked as SKIPPED without escalation approval/i.test(e)),
      `expected an escalation error naming step 10, got ${JSON.stringify(result.errors)}`);
  });

  test('case 7 — an approved declaration still clears', () => {
    const p = write('approved-decl', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED REASON: nothing on a hot path in this slice' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.deepEqual(escalationErrors(result), [],
      `an approved skip must raise no escalation error: ${JSON.stringify(result.errors)}`);
    assert.equal(result.checklist.escalations.escalation_12_SKIPPED.approved, true,
      'the approval must be recorded on the checklist entry');
  });

  test('case 8 — an approval written inside backticks does NOT clear a bare declaration', () => {
    // Masking the declaration scan but not the approval scan would create a
    // forgery surface: quote the approval, keep the real skip. Both scans must
    // read the SAME masked text.
    const p = write('laundered-approval', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED — `APPROVED: nothing on a hot path`' }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.equal(result.valid, false,
      'an approval inside code must not clear a real declaration');
    assert.ok(result.errors.some((e) => /Step 12 marked as SKIPPED without escalation approval/i.test(e)),
      `expected the skip to remain unapproved, got ${JSON.stringify(result.errors)}`);
    assert.equal(result.checklist.escalations.escalation_12_SKIPPED.approved, false);
  });

  test('case 8b — an approval inside double quotes does NOT clear a bare declaration', () => {
    const p = write('laundered-approval-quotes', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED — the reviewer asked "was this APPROVED?"' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.valid, false, 'a quoted question is not an approval');
    assert.ok(result.errors.some((e) => /Step 12 marked as SKIPPED/i.test(e)));
  });

  test('case 9 — an unmatched backtick masks nothing', () => {
    const p = write('unmatched-backtick', planFile({
      12: { heading: '### Step 12: OPTIMIZE — see `the note below and SKIPPED anyway' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.valid, false,
      'a lone backtick must not open a span that turns the checker off');
    assert.ok(result.errors.some((e) => /Step 12 marked as SKIPPED/i.test(e)));
  });

  test('case 9b — an unmatched double quote masks nothing', () => {
    const p = write('unmatched-quote', planFile({
      12: { heading: '### Step 12: OPTIMIZE — the reviewer said "look here and SKIPPED anyway' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.valid, false, 'a lone double quote must not blind the checker');
  });

  test('case 10 — an apostrophe masks nothing', () => {
    const p = write('apostrophe', planFile({
      12: { heading: "### Step 12: OPTIMIZE — the executor's own step was SKIPPED" }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.valid, false,
      'single quotes are deliberately not masked; an apostrophe must not blind the checker');
    assert.ok(result.errors.some((e) => /Step 12 marked as SKIPPED/i.test(e)));
  });

  // ------------------------------------------------- offsets, agreement, corpus

  test('case 11 — step numbers still report correctly across a masked line', () => {
    // A masked line and a genuine line in one region. The error must name the
    // GENUINE step; a mask that changed offsets would misreport which step.
    const p = write('offsets', planFile({
      9: { heading: '### Step 9: PREPARE — record the verbatim `ℹ skipped N` line.' },
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED' }
    }));

    const result = validator.validateForReview(p, testDir);

    const errs = escalationErrors(result);
    assert.equal(errs.length, 1, `exactly one escalation error expected, got ${JSON.stringify(errs)}`);
    assert.ok(/Step 12 marked as SKIPPED/i.test(errs[0]),
      `the error must name step 12, got ${errs[0]}`);
    assert.equal(
      Object.keys(result.checklist.escalations).some((k) => k.startsWith('escalation_9_')),
      false,
      'no escalation entry may be recorded for the masked step 9 line'
    );
  });

  test('case 12 — the per-step probe and the region scan agree on the same line', () => {
    // One masked line inside an UNFINISHED step: the per-step probe must not mark
    // it skipped and the region scan must not raise an escalation. One masked and
    // one not is a new inconsistency, not a fix.
    const p = write('detectors-agree', planFile({
      12: { body: '- [ ] record the verbatim `ℹ skipped N` line from the gated run' }
    }));

    const result = validator.validateForReview(p, testDir);

    assert.equal(result.checklist.steps.step_12.completed, false, 'fixture must be incomplete');
    assert.equal(result.checklist.steps.step_12.skipped, false,
      'the per-step probe must not read a backticked counter label as a skip');
    assert.deepEqual(escalationErrors(result), [],
      `the region scan must agree with the per-step probe: ${JSON.stringify(result.errors)}`);
  });

  test('case 12b — both detectors still agree on a genuine declaration', () => {
    const p = write('detectors-agree-real', planFile({
      12: { heading: '### Step 12: OPTIMIZE — SKIPPED', body: '- [ ] not done' }
    }));
    const result = validator.validateForReview(p, testDir);
    assert.equal(result.checklist.steps.step_12.skipped, true,
      'a genuine declaration must still register on the per-step probe');
    assert.ok(escalationErrors(result).length > 0,
      'and must still raise an escalation error on the region scan');
  });

  test('case 12c — the contradiction scan masks quoted spans too', () => {
    const proseInCode = '# Plan\n\nStep 8: TEST — record the `ℹ skipped N` line.\n';
    const masked = validator.validateNoContradictions(proseInCode, REPO_ROOT);
    assert.equal(
      masked.warnings.some((w) => /Step 8 \(TEST\) marked as skipped/i.test(w)),
      false,
      `a backticked counter label must not warn, got ${JSON.stringify(masked.warnings)}`
    );

    const realSkip = '# Plan\n\nStep 8: TEST — the `runner` was never run, SKIPPED\n';
    const caught = validator.validateNoContradictions(realSkip, REPO_ROOT);
    assert.ok(
      caught.warnings.some((w) => /Step 8 \(TEST\) marked as skipped but test files exist/i.test(w)),
      'a bare declaration on a line that also contains backticks must still warn'
    );
  });

  test('case 13 — the corpus measurement: no plan is refused for a coded or quoted mention', () => {
    // Fails LOUDLY on input it cannot read. A corpus check that silently reads
    // nothing and reports "no plans refused" is the false-green defect class this
    // repository fences: it would report a verdict on input it never received.
    const targets = [];

    // A synthetic GENUINE declaration, so this case can never become vacuous and
    // can never pass by the gate being switched off wholesale.
    const syntheticGenuine = path.join(testDir, 'plans', 'review', 'synthetic-genuine-declaration.md');
    fs.writeFileSync(syntheticGenuine, planFile({
      10: { heading: '### Step 10: IMPLEMENT — items 1,2 done. Item 3 (`writeEntry`) SKIPPED — owned by a concurrent slice.' }
    }));
    // A synthetic MASKED mention, so the freeing direction is measured too.
    const syntheticMasked = path.join(testDir, 'plans', 'review', 'synthetic-masked-mention.md');
    fs.writeFileSync(syntheticMasked, planFile({
      14: { heading: '### Step 14: VERIFY — record `tests`, `suites`, `pass`, `fail`, `skipped`, `todo` verbatim.' }
    }));
    targets.push({ file: syntheticGenuine, root: testDir, synthetic: 'genuine' });
    targets.push({ file: syntheticMasked, root: testDir, synthetic: 'masked' });

    for (const stage of ['implementation', 'todo', 'in-progress', 'review', 'done', 'functional', 'vision']) {
      const dir = path.join(REPO_ROOT, 'plans', stage);
      if (!fs.existsSync(dir)) continue;
      let entries;
      try {
        entries = fs.readdirSync(dir);
      } catch (err) {
        throw new Error(`corpus measurement could not read ${dir}: ${err.message}`);
      }
      for (const f of entries.filter((x) => x.endsWith('.md'))) {
        targets.push({ file: path.join(dir, f), root: REPO_ROOT, synthetic: null });
      }
    }

    assert.ok(targets.length > 2,
      `the corpus measurement read no repository plans (only ${targets.length} synthetic targets) — ` +
      'it cannot report a verdict on input it never received');

    let readCount = 0;
    const refusedForMaskedText = [];
    let genuineStillCaught = 0;
    let maskedFreed = 0;

    for (const { file, root, synthetic } of targets) {
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch (err) {
        throw new Error(`corpus measurement could not read ${file}: ${err.message}`);
      }
      readCount++;

      const result = validator.validateForReview(file, root);
      const errs = escalationErrors(result);

      if (synthetic === 'genuine') {
        assert.ok(errs.length > 0,
          'the synthetic genuine declaration must still be refused — a fix that frees everything catches nothing');
        genuineStillCaught++;
        continue;
      }
      if (synthetic === 'masked') {
        assert.deepEqual(errs, [],
          `the synthetic masked mention must be freed: ${JSON.stringify(errs)}`);
        maskedFreed++;
        continue;
      }

      for (const err of errs) {
        const m = err.match(/Step\s*(\d+)\s+marked as\s+(\w+)/i);
        if (!m) continue;
        const [, stepNum, status] = m;
        const lines = content.split(/\r?\n/).filter(
          (line) => new RegExp(`Step\\s*${stepNum}\\b`, 'i').test(line) &&
                    new RegExp(status, 'i').test(line)
        );
        // The status word must survive removal of every inline-code and quoted
        // span on its own line — i.e. it must appear as BARE prose somewhere.
        const bareSomewhere = lines.some((line) => {
          const stripped = line
            .replace(/`{1,3}[^`\n]*?`{1,3}/g, ' ')
            .replace(/"[^"\n]*"/g, ' ')
            .replace(/“[^”\n]*”/g, ' ');
          return new RegExp(status, 'i').test(stripped);
        });
        if (!bareSomewhere) {
          refusedForMaskedText.push(`${path.basename(file)}: ${err.trim()}\n    ${lines.join('\n    ')}`);
        } else {
          genuineStillCaught++;
        }
      }
    }

    assert.ok(readCount === targets.length && readCount > 2,
      `corpus measurement read ${readCount} of ${targets.length} plans`);
    assert.deepEqual(refusedForMaskedText, [],
      `these plans are refused for a status word that appears only inside code or quotes:\n  ${refusedForMaskedText.join('\n  ')}`);
    assert.ok(maskedFreed === 1, 'the freeing direction must have been measured');
    assert.ok(genuineStillCaught >= 1,
      'at least one genuine declaration must still be caught — otherwise the gate is off');
  });

  test('case 14 — masking is bounded on pathological input', () => {
    const longBacktickRun = '`'.repeat(4000);
    const longQuoteRun = '"'.repeat(4000);
    const p = write('pathological', planFile({
      12: { heading: `### Step 12: OPTIMIZE — ${longBacktickRun} ${longQuoteRun} done` }
    }, `${'`'.repeat(2000)}\n${'"'.repeat(2000)}\n${'x'.repeat(50000)}\n`));

    const started = Date.now();
    const result = validator.validateForReview(p, testDir);
    const elapsed = Date.now() - started;

    assert.ok(result != null, 'validation must complete');
    assert.ok(elapsed < 5000,
      `masking must not backtrack: validation took ${elapsed}ms on pathological input`);
  });

  test('the mask preserves length exactly, asserted rather than inspected', () => {
    // Length preservation is load-bearing: three consumers report a step number
    // parsed out of the same line. Asserted through the public surface — a mask
    // that shortened the text would move the reported step number, which case 11
    // pins, and would also change where line breaks fall, which this pins.
    const withCode = planFile({
      12: { heading: '### Step 12: OPTIMIZE — `a` `bb` "ccc" “dddd” and SKIPPED' }
    });
    const p = write('length-preserved', withCode);
    const result = validator.validateForReview(p, testDir);
    assert.ok(result.errors.some((e) => /Step 12 marked as SKIPPED/i.test(e)),
      'the declaration after several masked spans must still be caught, on the right step');
  });
});

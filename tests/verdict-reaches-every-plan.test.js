'use strict';

/**
 * THE HONEST NOT-EVALUATED VERDICT REACHES EVERY PLAN (reading (c) — split the flag).
 *
 * Human's Gate-1 decision on
 * plans/functional/honest-plan-verdict-reaches-every-plan.md: split the single
 * overloaded `iron_loop` boolean into TWO independent frontmatter facts.
 *
 *   iron_loop:true         → the Steps 8-16 section has been generated (integrate())
 *   iron_loop_verdict:true → the not-evaluated verdict has been written (refineLoop + append)
 *
 * A plan touched by pre-fix code is true on the first and false on the second — a
 * state the single flag could not express, which is exactly why an already-flagged
 * plan never received the honest verdict. These two guards must be checked
 * INDEPENDENTLY inside applyIronLoop and must NEVER be recombined into one condition.
 *
 * Every test drives the REAL exported applyIronLoop against real temp-dir fixtures.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const actions = require('../src/lib/actions');

const SECTION_HEADER = '## Execution Plan (Steps 8-16)';
const VERDICT_HEADER = '## Deferred Questions';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-reach-'));
  fs.mkdirSync(path.join(dir, 'plans', 'implementation'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
});

function stagePlan(name, content) {
  const p = path.join(dir, 'plans', 'implementation', `${name}.md`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

/** How many times a literal substring occurs in a string. */
function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ── Scenario 1: brand-new plan — both fields become true, both written once ──────

describe('reading (c): a brand-new plan gets BOTH the section and the verdict, exactly once', () => {
  it('a plan with neither flag receives the section, the verdict, and both flags', () => {
    const p = stagePlan('brand-new',
      '# Brand New\n\nThis plan says nothing. It has no design, no tests.\n');

    actions.applyIronLoop(p);

    const onDisk = fs.readFileSync(p, 'utf8');
    assert.equal(occurrences(onDisk, SECTION_HEADER), 1,
      'the Steps 8-16 section is generated exactly once');
    assert.equal(occurrences(onDisk, VERDICT_HEADER), 1,
      'the not-evaluated verdict is written exactly once');
    assert.ok(onDisk.includes('NOT EVALUATED'),
      'the human reads the blindness, not an inferred check');
    assert.match(onDisk, /iron_loop:\s*true/, 'iron_loop is stamped');
    assert.match(onDisk, /iron_loop_verdict:\s*true/, 'iron_loop_verdict is stamped');
  });
});

// ── Scenario 2: legacy plan — iron_loop:true, no verdict flag ─────────────────────

describe('reading (c): a legacy plan flagged iron_loop:true but missing the verdict flag', () => {
  it('leaves the existing section untouched, appends the verdict, and stamps iron_loop_verdict', () => {
    // A pre-fix plan: already sectioned and flagged iron_loop:true, but the verdict
    // never reached it and it has no iron_loop_verdict field. This is the exact bug
    // state named in ASSESS.
    const legacySection =
      `${SECTION_HEADER}\n\n` +
      '### Step 8: TEST (TDD Red)\n- [ ] DISTINCTIVE-LEGACY-MARKER write tests\n\n' +
      '### Step 16: FINAL-REVIEW\n- [ ] Final review before merge\n';
    const legacy =
      '---\n' +
      'title: "A legacy plan"\n' +
      'type: implementation\n' +
      'iron_loop: true\n' +
      '---\n\n' +
      '# A legacy plan\n\nBody.\n\n' +
      legacySection;
    const p = stagePlan('legacy', legacy);

    actions.applyIronLoop(p);

    const onDisk = fs.readFileSync(p, 'utf8');
    // Section untouched: not regenerated, not duplicated, byte-preserved.
    assert.equal(occurrences(onDisk, SECTION_HEADER), 1,
      'the existing Steps 8-16 section is not regenerated or duplicated');
    assert.ok(onDisk.includes('DISTINCTIVE-LEGACY-MARKER'),
      'the original section body is preserved verbatim, not overwritten');
    // Verdict now reaches the plan the human reads.
    assert.equal(occurrences(onDisk, VERDICT_HEADER), 1,
      'the not-evaluated verdict IS appended, exactly once');
    assert.ok(onDisk.includes('NOT EVALUATED'));
    // The verdict flag is now stamped so it will not be re-appended.
    assert.match(onDisk, /iron_loop_verdict:\s*true/,
      'iron_loop_verdict is stamped after the verdict is written');
  });
});

// ── Scenario 3: fully-processed plan — both flags true — nothing written ──────────

describe('reading (c): a fully-processed plan (both flags true) is not reprocessed', () => {
  it('writes nothing — no duplicate section, no duplicate verdict; file byte-identical', () => {
    const done =
      '---\n' +
      'iron_loop: true\n' +
      'iron_loop_verdict: true\n' +
      '---\n\n' +
      '# Done\n\n' +
      `${SECTION_HEADER}\n\n### Step 8: TEST\n- [ ] x\n\n` +
      `${VERDICT_HEADER}\n\n- **evaluation**: NOT EVALUATED — already recorded.\n`;
    const p = stagePlan('done', done);
    const before = fs.readFileSync(p, 'utf8');

    actions.applyIronLoop(p);

    const after = fs.readFileSync(p, 'utf8');
    assert.equal(after, before, 'a fully-processed plan comes back byte-identical');
    assert.equal(occurrences(after, SECTION_HEADER), 1, 'no duplicate section');
    assert.equal(occurrences(after, VERDICT_HEADER), 1, 'no duplicate verdict');
  });
});

// ── The two guards are checked INDEPENDENTLY (cannot be silently recoupled) ───────

describe('reading (c): the two guards are checked INDEPENDENTLY', () => {
  it('iron_loop:true alone still lets the verdict guard fire (verdict does NOT depend on iron_loop)', () => {
    // If a future edit recouples into `if (iron_loop) return` or
    // `if (iron_loop || iron_loop_verdict) return`, this fails: no verdict reaches
    // an already-sectioned plan — the exact regression the split exists to prevent.
    const p = stagePlan('section-flag-only',
      '---\niron_loop: true\n---\n\n# X\n\n' +
      `${SECTION_HEADER}\n\n### Step 8: TEST\n- [ ] x\n`);

    actions.applyIronLoop(p);

    const onDisk = fs.readFileSync(p, 'utf8');
    assert.equal(occurrences(onDisk, VERDICT_HEADER), 1,
      'the verdict guard is independent of iron_loop — verdict is written');
    assert.match(onDisk, /iron_loop_verdict:\s*true/);
  });

  it('iron_loop_verdict:true alone still lets the section guard fire, and does NOT duplicate the verdict', () => {
    // If a future edit recouples into `if (iron_loop_verdict) return`, this fails:
    // the section never generates for a plan that already has a verdict but no
    // section. And the verdict must NOT be re-appended (verdict guard suppresses).
    const p = stagePlan('verdict-flag-only',
      '---\niron_loop_verdict: true\n---\n\n# X\n\n' +
      `${VERDICT_HEADER}\n\n- **evaluation**: NOT EVALUATED — recorded earlier.\n`);

    actions.applyIronLoop(p);

    const onDisk = fs.readFileSync(p, 'utf8');
    assert.equal(occurrences(onDisk, SECTION_HEADER), 1,
      'the section guard is independent of iron_loop_verdict — section is generated');
    assert.equal(occurrences(onDisk, VERDICT_HEADER), 1,
      'the verdict guard independently suppresses a second verdict');
    assert.match(onDisk, /iron_loop:\s*true/, 'iron_loop is stamped by the section guard');
  });
});

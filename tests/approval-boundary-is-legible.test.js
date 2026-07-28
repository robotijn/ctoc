'use strict';

/**
 * THE APPROVAL BOUNDARY EXPLAINS ITSELF — an executor that invents a heading is no
 * longer accused of forging a human approval.
 *
 * THE REPORTED HARM. A plan crossed Gate 2 into `todo/`. Its executor built it and
 * appended two top-level sections the specification boundary does not recognise (a
 * scope-stop record and a final-state record). The section names are not on the
 * frozen EXECUTION_SECTIONS deny-list, so the specification hash moved, the approval
 * stopped binding, and the repository self-check reported the plan as
 * "missing approved_by: human in the approval ledger (a frontmatter marker is not an
 * approval)" — the message for a FORGED or ABSENT approval. That sent the reader to
 * the wrong diagnosis and cost a full gate run. The truth was a heading name the list
 * does not know.
 *
 * WHAT THIS PROVES. The reason a specification mismatch REALLY has is carried, as a
 * PROOF, all the way to the human — `hash-mismatch-new-section` (the appended sections
 * are the entire difference, named), `hash-mismatch` (the specification genuinely
 * changed), `spec-boundary-unlocatable` (the check could not look). NONE of them
 * grants acceptance; every one still rejects, exactly as before. No gate is weakened —
 * the message became legible, the decision did not move.
 *
 * ZERO DOUBLES. Real temp roots, real ledger entries written through the real write
 * paths, real plan text.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ledger = require('../src/lib/approval-ledger');
const residency = require('../src/lib/approval-residency');
const enforcer = require('../src/lib/iron-loop-enforcer');

const REPO_ROOT = path.join(__dirname, '..');

let projectDir;
const sandboxes = [];

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-legible-'));
  sandboxes.push(projectDir);
  for (const stage of ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(projectDir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(projectDir, '.ctoc', 'approvals'), { recursive: true });
});

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/**
 * The APPROVED specification, as it stood when the human crossed Gate 2 — before the
 * build. It carries frontmatter, spec prose, and a real non-execution spec section
 * (`## Implementation Details`). This is the shape `stampAndLedger` hashes at approval.
 */
const APPROVED_SPEC = [
  '---',
  'title: "A slice"',
  'type: implementation',
  'files:',
  '  - "src/lib/x.js"',
  '---',
  '',
  '# A slice',
  '',
  'Body prose that IS part of the specification.',
  '',
  '## Implementation Details',
  '',
  'Rewrite the widget so it stops lying about its own state.',
  '',
  '### Step 10: IMPLEMENT — one step, files as sub-items.',
  '  - src/lib/x.js — the widget',
  '',
].join('\n');

/**
 * The plan AFTER the build, with the executor's execution record AND two invented
 * top-level sections appended after it — the exact reported failure. The execution
 * record is a recognised section (excluded); the two invented ones are not.
 */
const SCOPE_STOP_TITLE = 'Scope stop — a file I could not touch';
const FINAL_STATE_TITLE = 'Final state of the build';
function builtWithInventedSections(spec = APPROVED_SPEC) {
  return [
    spec,
    '## Execution Record (Steps 8-16)',
    '',
    '- [x] Step 8 TEST — red recorded',
    'pass 41 / fail 0',
    '',
    `## ${SCOPE_STOP_TITLE}`,
    '',
    'I needed src/lib/other.js, which the plan did not declare, so I stopped.',
    '',
    `## ${FINAL_STATE_TITLE}`,
    '',
    'One file written; one file blocked on the scope question above.',
    '',
  ].join('\n');
}

/** Write a plan into a stage folder and return its path. */
function writePlan(stage, basename, content) {
  const p = path.join(projectDir, 'plans', stage, `${basename}.md`);
  fs.writeFileSync(p, content);
  return p;
}

/** Approve a plan the way `stampAndLedger` does: hash the approved specification. */
function approve(slug, content = APPROVED_SPEC, stageTo = 'todo') {
  return ledger.writeEntry(slug, {
    content,
    stage_from: 'implementation',
    stage_to: stageTo,
    approved_by: 'human',
  }, projectDir);
}

// ── 1. THE REPORTED FAILURE, REPRODUCED ───────────────────────────────────────

test('1: an invented heading reads as a NEW SECTION, not a forged approval', () => {
  const slug = 'invented-headings';
  approve(slug);
  const planPath = writePlan('todo', slug, builtWithInventedSections());
  const verdict = residency.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false, 'a moved specification hash must still reject');
  assert.equal(verdict.reason, 'hash-mismatch-new-section',
    'the reason must name the true cause — an unrecognised appended section, not a forged approval');
  assert.ok(Array.isArray(verdict.sections), 'the verdict carries the offending section titles');
  assert.ok(verdict.sections.includes(SCOPE_STOP_TITLE), 'the scope-stop title is named');
  assert.ok(verdict.sections.includes(FINAL_STATE_TITLE), 'the final-state title is named');
});

// ── 2. THE ENFORCER NO LONGER ALLEGES A FORGERY ───────────────────────────────

test('2: the self-check names the sections and does NOT allege a missing human approval', () => {
  const slug = 'enforcer-invented';
  approve(slug);
  writePlan('todo', slug, builtWithInventedSections());
  const r = enforcer.checkGateDestinationsApproved(projectDir);
  assert.equal(r.clean, false, 'the moved hash is still a finding');
  assert.equal(r.severity, 'block', 'severity is unchanged');
  assert.ok(!/approved_by/.test(r.message),
    'the message must not allege a missing approved_by marker when the cause is an added section');
  assert.ok(r.message.includes(SCOPE_STOP_TITLE) || r.message.includes(FINAL_STATE_TITLE),
    'the message names at least one offending section');
  assert.ok(/EXECUTION_SECTION_PRODUCERS/.test(r.message),
    'the message points the reader at where the recognised set is defined');
});

// ── 3. A GENUINELY MISSING ENTRY STILL READS AS MISSING ───────────────────────

test('3: a plan with no ledger entry still reports a missing approval', () => {
  const slug = 'no-entry';
  const planPath = writePlan('todo', slug, APPROVED_SPEC);
  const verdict = residency.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'no-ledger-entry');
  const r = enforcer.checkGateDestinationsApproved(projectDir);
  assert.equal(r.clean, false);
  assert.ok(/approved_by/.test(r.message),
    'a genuinely missing approval keeps the approval-marker sentence — it is TRUE for this reason');
});

// ── 4. A REAL SPECIFICATION EDIT IS NOT EXCUSED ───────────────────────────────

test('4: editing the specification prose reports a plain hash-mismatch with no sections', () => {
  const slug = 'spec-edit';
  approve(slug);
  const edited = APPROVED_SPEC.replace('stops lying about its own state', 'does something else');
  const planPath = writePlan('todo', slug, edited);
  const verdict = residency.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'hash-mismatch');
  assert.deepEqual(verdict.sections || [], []);
});

// ── 5. A REAL EDIT PLUS A NEW SECTION IS NOT LAUNDERED INTO A NEW-SECTION ──────

test('5: a spec edit AND a new section fails the proof and reports plain hash-mismatch', () => {
  const slug = 'spec-edit-plus-section';
  approve(slug);
  const tampered = APPROVED_SPEC.replace('stops lying about its own state', 'does anything at all');
  const planPath = writePlan('todo', slug, builtWithInventedSections(tampered));
  const verdict = residency.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'hash-mismatch',
    'removing the appended sections does NOT restore the approved spec, so the proof fails — never new-section');
});

// ── 6. THE DIAGNOSIS NEVER GRANTS ACCEPTANCE ──────────────────────────────────

test('6: every diagnosed reason rejects — accepted is always false', () => {
  const cases = [
    ['nsec', builtWithInventedSections()],
    ['sedit', APPROVED_SPEC.replace('the widget', 'a different widget')],
  ];
  for (const [slug, content] of cases) {
    approve(slug);
    const planPath = writePlan('todo', slug, content);
    assert.equal(residency.classifyResidency(planPath, 'todo', projectDir).accepted, false);
  }
});

// ── 7. "COULD NOT LOOK" IS ITS OWN ANSWER ─────────────────────────────────────

test('7: content with no frontmatter reports spec-boundary-unlocatable and could-not-establish', () => {
  const slug = 'no-frontmatter';
  const bad = '# A plan with no frontmatter at all\n\nBody.\n';
  // Hand-forge a specification-scoped entry (bypassing the write path, the only way it
  // could exist) so the hash-sensitive branch runs against unlocatable content.
  fs.writeFileSync(ledger.ledgerPath(slug, projectDir), JSON.stringify({
    content_sha256: 'f'.repeat(64),
    hash_scope: 'specification',
    stage_from: 'implementation',
    stage_to: 'todo',
    approved_by: 'human',
  }, null, 2));
  const planPath = writePlan('todo', slug, bad);
  const verdict = residency.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false, 'a check that cannot look must deny');
  assert.equal(verdict.reason, 'spec-boundary-unlocatable');
  const r = enforcer.checkGateDestinationsApproved(projectDir);
  assert.equal(r.clean, false);
  assert.ok(/could not establish/i.test(r.message),
    'the message must read as "could not look", never as a clean result or a forged approval');
});

// ── 8. "FOUND NOTHING" IS NOT "COULD NOT LOOK" ────────────────────────────────

test('8: a mismatch with zero unrecognised top-level sections is plain hash-mismatch', () => {
  // Change the frontmatter only; the boundary is perfectly locatable and there are no
  // appended sections. This must NOT collapse into spec-boundary-unlocatable.
  const slug = 'frontmatter-only';
  approve(slug);
  const tampered = APPROVED_SPEC.replace('title: "A slice"', 'title: "A different slice"');
  const planPath = writePlan('todo', slug, tampered);
  const verdict = residency.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.reason, 'hash-mismatch');
  assert.notEqual(verdict.reason, 'spec-boundary-unlocatable');
});

// ── 9. LEGACY ENTRIES ARE UNTOUCHED ───────────────────────────────────────────

test('9: a legacy (no hash_scope) mismatch stays hash-mismatch-legacy, no sections, still rejects', () => {
  const slug = 'legacy';
  ledger.writeEntry(slug, {
    content_sha256: ledger.computeContentHash(APPROVED_SPEC),
    stage_from: 'implementation', stage_to: 'todo', approved_by: 'human',
  }, projectDir);
  const p = ledger.ledgerPath(slug, projectDir);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete raw.hash_scope;
  fs.writeFileSync(p, JSON.stringify(raw, null, 2));

  const planPath = writePlan('todo', slug, builtWithInventedSections());
  const verdict = residency.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'hash-mismatch-legacy');
  assert.deepEqual(verdict.sections || [], []);
});

// ── 10. THE SCOPE-STOP RULE'S OWN HEADING IS ALREADY EXEMPT ────────────────────

test('10: a plan carrying the scope-stop rule heading (## Execution Record) verifies TRUE after approval', () => {
  // The executor scope-stop rule (plan 00123) records what landed under
  // `## Execution Record`, which is ALREADY on EXECUTION_SECTIONS. So the sanctioned,
  // enumerable producer needs NO new exempting row — building it must not evict it.
  const slug = 'scope-stop-heading';
  approve(slug);
  const built = [
    APPROVED_SPEC,
    '## Execution Record',
    '',
    'On a refused write to an undeclared file I stopped and asked; here is what landed.',
    '',
  ].join('\n');
  assert.equal(ledger.verify(slug, built, 'todo', projectDir), true,
    'the scope-stop heading is a recognised execution section and must not break the approval');
});

// ── 11. EVERY PRODUCER ROW IS NAMED ───────────────────────────────────────────

test('11: every EXECUTION_SECTION_PRODUCERS row names a heading AND its producer', () => {
  const table = ledger.EXECUTION_SECTION_PRODUCERS;
  assert.ok(Array.isArray(table) && table.length > 0);
  const seen = new Set();
  for (const row of table) {
    assert.equal(typeof row.heading, 'string');
    assert.ok(row.heading.length > 0, 'a heading is non-empty');
    assert.equal(row.heading, row.heading.trim().toLowerCase(),
      'headings are already normalised (trimmed, lowercase)');
    assert.equal(typeof row.producer, 'string');
    assert.ok(row.producer.trim().length > 0, `heading "${row.heading}" must name its producer`);
    assert.ok(!seen.has(row.heading), `heading "${row.heading}" is unique`);
    seen.add(row.heading);
  }
});

// ── 12. THE DERIVED EXPORT IS UNCHANGED IN SHAPE ──────────────────────────────

test('12: EXECUTION_SECTIONS is a frozen array of strings equal to the table headings in order', () => {
  assert.ok(Array.isArray(ledger.EXECUTION_SECTIONS));
  assert.equal(Object.isFrozen(ledger.EXECUTION_SECTIONS), true);
  for (const s of ledger.EXECUTION_SECTIONS) assert.equal(typeof s, 'string');
  assert.deepEqual(
    ledger.EXECUTION_SECTIONS,
    ledger.EXECUTION_SECTION_PRODUCERS.map((e) => e.heading),
  );
});

// ── 13. NO GATE IS WEAKENED ───────────────────────────────────────────────────

test('13: wrong-edge / no-ledger-entry / unknown-provenance / ledger-corrupt / pipeline-not-allowed / sufficiency-not-allowed all reject', () => {
  // wrong-edge
  {
    const slug = 'we';
    writePlan('todo', slug, APPROVED_SPEC);
    ledger.writeEntry(slug, { content: APPROVED_SPEC, stage_from: 'review', stage_to: 'done', approved_by: 'human' }, projectDir);
    const v = residency.classifyResidency(path.join(projectDir, 'plans', 'todo', `${slug}.md`), 'todo', projectDir);
    assert.equal(v.accepted, false); assert.equal(v.reason, 'wrong-edge');
  }
  // no-ledger-entry
  {
    const p = writePlan('todo', 'nle', APPROVED_SPEC);
    const v = residency.classifyResidency(p, 'todo', projectDir);
    assert.equal(v.accepted, false); assert.equal(v.reason, 'no-ledger-entry');
  }
  // unknown-provenance (matching hash but unrecognised advanced_by)
  {
    const slug = 'unk';
    const p = writePlan('todo', slug, APPROVED_SPEC);
    fs.writeFileSync(ledger.ledgerPath(slug, projectDir), JSON.stringify({
      content_sha256: ledger.computeSpecHash(APPROVED_SPEC).hash,
      hash_scope: 'specification', stage_from: 'implementation', stage_to: 'todo',
      advanced_by: 'sufficiency-gate', approved_by: 'human',
    }, null, 2));
    const v = residency.classifyResidency(p, 'todo', projectDir);
    assert.equal(v.accepted, false); assert.equal(v.reason, 'unknown-provenance');
  }
  // ledger-corrupt
  {
    const slug = 'corrupt';
    const p = writePlan('todo', slug, APPROVED_SPEC);
    fs.writeFileSync(ledger.ledgerPath(slug, projectDir), '{ not json');
    const v = residency.classifyResidency(p, 'todo', projectDir);
    assert.equal(v.accepted, false); assert.equal(v.reason, 'ledger-corrupt');
  }
  // pipeline-not-allowed (pipeline entry at a pre-done gate)
  {
    const slug = 'pna';
    const p = writePlan('todo', slug, APPROVED_SPEC);
    ledger.writePipelineEntry(slug, { content: APPROVED_SPEC, stage_from: 'implementation', stage_to: 'todo', evidence: 'x' }, projectDir);
    const v = residency.classifyResidency(p, 'todo', projectDir);
    assert.equal(v.accepted, false); assert.equal(v.reason, 'pipeline-not-allowed');
  }
  // sufficiency-not-allowed (sufficiency entry at done/)
  {
    const slug = 'sna';
    const p = writePlan('done', slug, APPROVED_SPEC);
    ledger.writeSufficiencyEntry(slug, { content: APPROVED_SPEC, stage_from: 'implementation', stage_to: 'done', evidence: 'y' }, projectDir);
    const v = residency.classifyResidency(p, 'done', projectDir);
    assert.equal(v.accepted, false); assert.equal(v.reason, 'sufficiency-not-allowed');
  }
});

// ── 14. THE MODULE STAYS HOOK-PATH CLEAN ──────────────────────────────────────

test('14: approval-ledger.js requires nothing beyond crypto, path, ./safe-fs, ./gate-order', () => {
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'src', 'lib', 'approval-ledger.js'), 'utf8');
  // Strip block and line comments first: the module's header documents a forgery it
  // DENIES (`node -e "require('./src/lib/approval-ledger')…"`), and a naive scan would
  // read that prose as a live require. Only executable require() statements count.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const requires = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  const allowed = new Set(['crypto', 'path', './safe-fs', './gate-order']);
  for (const r of requires) {
    assert.ok(allowed.has(r), `approval-ledger.js must not require "${r}" — it sits on the every-tool-call Bash-hook path`);
  }
});

// ── 15. THE DIAGNOSIS IS BOUNDED ──────────────────────────────────────────────

test('15: at most 5 sections, each <= 80 chars, and section count does not add hash passes', () => {
  const { diagnoseSpecMismatch } = ledger;

  // A document whose appended sections restore the approved spec when removed, so the
  // proof path (the retry hash) is exercised, with a long title to prove truncation.
  const longTitle = 'X'.repeat(200);
  const many = (n) => {
    const secs = [APPROVED_SPEC, '## Execution Record', '', 'built', ''];
    for (let k = 0; k < n; k++) secs.push(`## Appended section number ${k} ${longTitle}`, '', `body ${k}`, '');
    return secs.join('\n');
  };
  const expected = ledger.computeSpecHash(APPROVED_SPEC).hash;

  const smallDoc = many(6);
  const bigDoc = many(500);

  const smallDiag = diagnoseSpecMismatch(smallDoc, expected);
  assert.equal(smallDiag.reason, 'hash-mismatch-new-section');
  assert.ok(smallDiag.sections.length <= 5, 'at most 5 sections reported');
  for (const s of smallDiag.sections) assert.ok(s.length <= 80, 'each section title <= 80 chars');

  // Count sha256 hash passes for the small and the 500-section document. The count must
  // be IDENTICAL and small — the retry does not scale with the number of sections.
  const orig = crypto.createHash;
  const count = (doc) => {
    let n = 0;
    crypto.createHash = (...a) => { if (a[0] === 'sha256') n++; return orig.apply(crypto, a); };
    try { diagnoseSpecMismatch(doc, expected); } finally { crypto.createHash = orig; }
    return n;
  };
  const cSmall = count(smallDoc);
  const cBig = count(bigDoc);
  assert.equal(cSmall, cBig, `hash passes must not scale with section count: ${cSmall} vs ${cBig}`);
  assert.ok(cBig <= 2, `at most one retry hash pass beyond the base establishment, saw ${cBig}`);
});

// ── 16. IT NEVER THROWS ───────────────────────────────────────────────────────

test('16: diagnoseSpecMismatch returns a verdict for null, empty, a number, and a 1-byte file', () => {
  for (const bad of [null, '', 42, 'x']) {
    const v = ledger.diagnoseSpecMismatch(bad, 'f'.repeat(64));
    assert.equal(typeof v.reason, 'string');
    assert.ok(Array.isArray(v.sections));
    assert.equal(v.reason, 'spec-boundary-unlocatable');
  }
});

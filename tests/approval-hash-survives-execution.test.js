'use strict';

/**
 * The approval hash survives its own pipeline.
 *
 * THE DEFECT. `approval-ledger.computeContentHash` hashes the WHOLE plan file, and
 * the plan file is ALSO the execution log — the executor appends step records, an
 * execution-record section and decisions into the same file during Steps 8–16. So a
 * legitimately approved plan's hash goes stale on every build, BY CONSTRUCTION.
 * Measured on this repository before the fix: every slice executed today records
 * `stage_to: "todo"` and `ledger.verify` returns false against its current text.
 *
 * THE RULING. Hash the plan's SPECIFICATION — the part the human actually ruled on —
 * and exclude the execution log the executor appends.
 *
 * THE LOAD-BEARING PROPERTY. The excluded region is a DENY-LIST, never an allow-list.
 * An allow-list silently exempts any specification section nobody remembered, which
 * fails open and quietly. A deny-list hashes anything new by default, so every runtime
 * drift degrades to NOISE (a false mismatch, recoverable) and never to SILENCE (a
 * forged approval, not recoverable). These tests pin BOTH directions: the approval
 * survives execution, and it breaks on every grant-bearing change.
 *
 * Behaviour-first, on a real temp project tree and on the repository's REAL plan
 * bytes. No test doubles.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('../src/lib/approval-ledger');
const gateHook = require('../src/hooks/human-gate-check');
const { extractFrontmatterRegion } = require('../src/lib/stale-detector');

const REPO_ROOT = path.join(__dirname, '..');

let projectDir;
const sandboxes = [];

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-spechash-'));
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
 * A realistic pre-build plan: gate-stamp block + metadata block + specification.
 * This is the shape `stampAndLedger` hashes at the moment of approval.
 */
const SPEC_PLAN = [
  '---',
  'approved_by: human',
  'approved_at: 2026-07-19T11:58:15.122Z',
  'gate_crossed: implementation → todo',
  '---',
  '',
  '---',
  'title: "A slice"',
  'type: implementation',
  'files:',
  '  - "src/lib/x.js"',
  '  - "tests/x.test.js"',
  '---',
  '',
  '# A slice',
  '',
  '## Implementation Details',
  '',
  'Rewrite the widget so it stops lying about its own state.',
  '',
  '### Step 10: IMPLEMENT — one step, files as sub-items.',
  '  - src/lib/x.js — the widget',
  '  - tests/x.test.js — its tests',
  '',
  '## Decisions Taken Under Ambiguity',
  '',
  '1. The planner decided the widget keeps its name.',
  '',
].join('\n');

/** Write a plan into a stage folder and return its path. */
function writePlan(stage, basename, content) {
  const filePath = path.join(projectDir, 'plans', stage, `${basename}.md`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Approve a plan the way `stampAndLedger` does: write the ledger entry against the
 * bytes that land at the destination.
 */
function approve(slug, content, stageTo = 'todo') {
  return ledger.writeEntry(slug, {
    content,
    stage_from: 'implementation',
    stage_to: stageTo,
    approved_by: 'human',
  }, projectDir);
}

/** The edits an executor actually makes to a plan during Steps 8–16. */
function executorEdits(content) {
  return content
    .replace(
      '### Step 10: IMPLEMENT — one step, files as sub-items.',
      '### Step 10: IMPLEMENT — one step, files as sub-items.\n- [x] COMPLETE — wrote both files',
    )
    + [
      '',
      '## Execution Record (Steps 8–16)',
      '',
      '- [x] Step 8 TEST — red recorded verbatim',
      'Tests: 41 passed, 0 failed.',
      '',
      '### Step 14 numbers',
      '',
      'pass 4211 / fail 0',
      '',
    ].join('\n');
}

// --- 1. EXECUTION DOES NOT BREAK THE APPROVAL (the whole point) ----------------

test('an approval SURVIVES the executor writing its execution record into the plan', () => {
  const slug = 'survives-execution';
  approve(slug, SPEC_PLAN);
  const built = executorEdits(SPEC_PLAN);
  assert.notEqual(built, SPEC_PLAN, 'the executor must actually have changed the file');
  assert.equal(
    ledger.verify(slug, built, 'todo', projectDir), true,
    'an ordinary build must not invalidate the human approval it was authorised by',
  );
});

// --- 2-5. EVERY GRANT-BEARING CHANGE STILL BREAKS IT ---------------------------

test('a change to the declared files: BREAKS the approval (files: is the write-surface grant)', () => {
  const slug = 'scope-change';
  approve(slug, SPEC_PLAN);
  const widened = SPEC_PLAN.replace('  - "src/lib/x.js"', '  - "src/lib/x.js"\n  - "src/lib/secrets.js"');
  assert.equal(ledger.verify(slug, widened, 'todo', projectDir), false);
});

test('a change to any other frontmatter field BREAKS the approval', () => {
  const slug = 'frontmatter-change';
  approve(slug, SPEC_PLAN);
  const retitled = SPEC_PLAN.replace('title: "A slice"', 'title: "A different slice"');
  assert.equal(ledger.verify(slug, retitled, 'todo', projectDir), false);
});

test('an edit to the specification prose BREAKS the approval', () => {
  const slug = 'spec-prose-change';
  approve(slug, SPEC_PLAN);
  const edited = SPEC_PLAN.replace('stops lying about its own state', 'does something else entirely');
  assert.equal(ledger.verify(slug, edited, 'todo', projectDir), false);
});

test('an edit to a step heading BREAKS the approval', () => {
  const slug = 'step-heading-change';
  approve(slug, SPEC_PLAN);
  const edited = SPEC_PLAN.replace('### Step 10: IMPLEMENT', '### Step 10: IMPLEMENT ANYTHING');
  assert.equal(ledger.verify(slug, edited, 'todo', projectDir), false);
});

test('a plain Step 10 sub-item bullet is SPECIFICATION and BREAKS the approval when edited', () => {
  const slug = 'subitem-change';
  approve(slug, SPEC_PLAN);
  const edited = SPEC_PLAN.replace('  - src/lib/x.js — the widget', '  - src/lib/other.js — a different file');
  assert.equal(ledger.verify(slug, edited, 'todo', projectDir), false);
});

// --- 6. THE REAL LIFECYCLE, ON THIS REPOSITORY'S REAL PLAN BYTES ---------------

test('on REAL executed plan bytes, the specification hash is stable across the execution record', () => {
  const reviewDir = path.join(REPO_ROOT, 'plans', 'review');
  const files = fs.readdirSync(reviewDir).filter((f) => f.endsWith('.md')).sort();
  assert.ok(files.length > 0, 'expected real executed plans in plans/review to measure against');
  // A plan that carries a real, executor-written execution record.
  const withRecord = files.find((f) => /^##\s*Execution (Record|Log)/m.test(
    fs.readFileSync(path.join(reviewDir, f), 'utf8'),
  ));
  assert.ok(withRecord, 'expected at least one real plan carrying an ## Execution Record section');
  const real = fs.readFileSync(path.join(reviewDir, withRecord), 'utf8');

  const before = ledger.computeSpecHash(real);
  assert.equal(before.ok, true, `boundary must be locatable in real bytes: ${before.reason}`);

  // Apply exactly the shapes an executor adds and assert the specification hash is
  // unchanged: an appended execution section, and a completion checkbox.
  const after = ledger.computeSpecHash(
    `${real}\n## Execution Record (Steps 8–16)\n\n- [x] Step 16 FINAL-REVIEW — done\n\nnumbers here\n`,
  );
  assert.equal(after.ok, true);
  assert.equal(after.hash, before.hash);

  const withCheckbox = ledger.computeSpecHash(`${real}\n- [x] COMPLETE — a stray completion record\n`);
  assert.equal(withCheckbox.hash, before.hash);
});

// --- 7-8. FAIL CLOSED WHEN THE BOUNDARY CANNOT BE ESTABLISHED ------------------

test('content with NO frontmatter delimiters FAILS to hash and FAILS verification', () => {
  const slug = 'no-frontmatter';
  const bad = '# A plan with no frontmatter at all\n\nBody.\n';
  const res = ledger.computeSpecHash(bad);
  assert.equal(res.ok, false, 'an unlocatable boundary is NOT a pass');
  assert.equal(typeof res.reason, 'string');
  assert.ok(res.reason.length > 0);

  // Hand-forge a specification-scoped entry anyway — bypassing the write path
  // entirely, which is the only way such an entry could exist — and assert
  // verification still REFUSES. Never trust a plan INTO an approval.
  fs.writeFileSync(ledger.ledgerPath(slug, projectDir), JSON.stringify({
    content_sha256: 'f'.repeat(64),
    hash_scope: 'specification',
    stage_from: 'implementation',
    stage_to: 'todo',
    approved_by: 'human',
  }, null, 2));
  assert.equal(ledger.verify(slug, bad, 'todo', projectDir), false);
  const verdict = gateHook.classifyResidency(writePlan('todo', slug, bad), 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'hash-mismatch');
});

test('empty content FAILS to hash and FAILS verification', () => {
  const slug = 'empty-content';
  assert.equal(ledger.computeSpecHash('').ok, false);
  approve(slug, SPEC_PLAN);
  assert.equal(ledger.verify(slug, '', 'todo', projectDir), false);
});

test('an unterminated frontmatter block FAILS to hash', () => {
  assert.equal(ledger.computeSpecHash('---\ntitle: "x"\n\n# body\n').ok, false);
});

// --- 9. LEGACY ENTRIES KEEP LEGACY SEMANTICS — NOTHING IS RE-BLESSED ----------

test('a LEGACY entry (no hash_scope) still verifies under WHOLE-FILE semantics', () => {
  const slug = 'legacy-entry';
  ledger.writeEntry(slug, {
    content_sha256: ledger.computeContentHash(SPEC_PLAN),
    stage_from: 'implementation',
    stage_to: 'todo',
    approved_by: 'human',
  }, projectDir);
  // Strip the field a legacy entry never had, then re-write it verbatim.
  const p = ledger.ledgerPath(slug, projectDir);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete raw.hash_scope;
  fs.writeFileSync(p, JSON.stringify(raw, null, 2));

  assert.equal(ledger.verify(slug, SPEC_PLAN, 'todo', projectDir), true,
    'a legacy entry must still verify against the whole file it was written for');
});

test('a LEGACY entry is NOT retroactively re-blessed by execution edits', () => {
  const slug = 'legacy-not-relaundered';
  ledger.writeEntry(slug, {
    content_sha256: ledger.computeContentHash(SPEC_PLAN),
    stage_from: 'implementation',
    stage_to: 'todo',
    approved_by: 'human',
  }, projectDir);
  const p = ledger.ledgerPath(slug, projectDir);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete raw.hash_scope;
  fs.writeFileSync(p, JSON.stringify(raw, null, 2));

  assert.equal(ledger.verify(slug, executorEdits(SPEC_PLAN), 'todo', projectDir), false,
    'legacy entries keep whole-file semantics and fail honestly — never laundered');
});

// --- 10-11. THE TWO MISMATCH REASONS ARE DISTINGUISHABLE, BOTH STILL REJECT ----

test('a LEGACY mismatch reports hash-mismatch-legacy and is still REJECTED', () => {
  const slug = 'legacy-mismatch';
  const planPath = writePlan('todo', slug, executorEdits(SPEC_PLAN));
  ledger.writeEntry(slug, {
    content_sha256: ledger.computeContentHash(SPEC_PLAN),
    stage_from: 'implementation',
    stage_to: 'todo',
    approved_by: 'human',
  }, projectDir);
  const p = ledger.ledgerPath(slug, projectDir);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete raw.hash_scope;
  fs.writeFileSync(p, JSON.stringify(raw, null, 2));

  const verdict = gateHook.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'hash-mismatch-legacy');
});

test('a SPECIFICATION mismatch reports hash-mismatch and is still REJECTED', () => {
  const slug = 'spec-mismatch';
  const tampered = SPEC_PLAN.replace('  - "src/lib/x.js"', '  - "src/lib/x.js"\n  - "src/**"');
  const planPath = writePlan('todo', slug, tampered);
  approve(slug, SPEC_PLAN);

  const verdict = gateHook.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'hash-mismatch');
});

test('the gate hook ACCEPTS a plan whose only change is its execution record', () => {
  const slug = 'hook-accepts-built-plan';
  const planPath = writePlan('todo', slug, executorEdits(SPEC_PLAN));
  approve(slug, SPEC_PLAN);

  const verdict = gateHook.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, true, 'building a plan must not evict it from its gate destination');
  assert.equal(verdict.kind, 'human');
});

// --- 12. EVERY WRITE PATH RECORDS THE SCOPE -----------------------------------

// The scope stamp follows what the writer actually supplied. A writer that hands the
// ledger CONTENT gets specification semantics, hashed by the ledger so the digest and
// the stamp are derived together and cannot disagree. A writer that hands it only a
// precomputed whole-file digest is recorded HONESTLY as `file` — stamping
// `specification` over a whole-file digest would mint an entry that could never verify.

test('writeEntry given CONTENT records hash_scope: specification and hashes it itself', () => {
  const rec = ledger.writeEntry('scope-write', {
    content: SPEC_PLAN, stage_from: 'implementation', stage_to: 'todo',
  }, projectDir);
  assert.equal(rec.hash_scope, 'specification');
  assert.equal(rec.content_sha256, ledger.computeSpecHash(SPEC_PLAN).hash);
});

test('writePipelineEntry given CONTENT records hash_scope: specification', () => {
  const rec = ledger.writePipelineEntry('scope-pipeline', {
    content: SPEC_PLAN, stage_from: 'review', stage_to: 'done', evidence: 'stale-reconciliation',
  }, projectDir);
  assert.equal(rec.hash_scope, 'specification');
});

test('writeSufficiencyEntry given CONTENT records hash_scope: specification', () => {
  const rec = ledger.writeSufficiencyEntry('scope-sufficiency', {
    content: SPEC_PLAN, stage_from: 'implementation', stage_to: 'todo', evidence: '3 questions answered',
  }, projectDir);
  assert.equal(rec.hash_scope, 'specification');
});

test('a writer supplying only a precomputed digest is recorded HONESTLY as hash_scope: file', () => {
  const rec = ledger.writeEntry('scope-precomputed', {
    content_sha256: ledger.computeContentHash(SPEC_PLAN),
    stage_from: 'implementation', stage_to: 'todo',
  }, projectDir);
  assert.equal(rec.hash_scope, 'file');
  assert.equal(ledger.verify('scope-precomputed', SPEC_PLAN, 'todo', projectDir), true);
});

test('a write whose specification boundary is UNLOCATABLE is REFUSED, never fallen back', () => {
  assert.throws(
    () => ledger.writeEntry('unlocatable', {
      content: '# no frontmatter here\n', stage_from: 'implementation', stage_to: 'todo',
    }, projectDir),
    /specification boundary/,
    'minting an entry whose binding could not be established is the unearned approval',
  );
  assert.equal(fs.existsSync(ledger.ledgerPath('unlocatable', projectDir)), false,
    'the refusal must happen BEFORE any write');
});

test('the LIVE human gate crossing records specification scope and survives the build it authorises', () => {
  // Drives the REAL approvePlan → stampAndLedger path, not a hand-built entry.
  const actions = require('../src/lib/actions');
  const slug = 'live-gate-crossing';
  const src = path.join(projectDir, 'plans', 'implementation', `${slug}.md`);
  fs.writeFileSync(src, SPEC_PLAN);

  const res = actions.approvePlan(src, projectDir);
  assert.equal(res.approved !== false, true, `approvePlan refused: ${JSON.stringify(res)}`);

  const entry = ledger.readEntry(slug, projectDir);
  assert.ok(entry, 'the crossing must have written a ledger entry');
  assert.equal(entry.hash_scope, 'specification');
  assert.equal(entry.stage_to, 'todo');

  const dest = path.join(projectDir, 'plans', 'todo', `${slug}.md`);
  const landed = fs.readFileSync(dest, 'utf8');
  assert.equal(gateHook.classifyResidency(dest, 'todo', projectDir).accepted, true,
    'the plan must be accepted at the destination immediately after the human crossed');

  // Now BUILD it, exactly as an executor does, and assert the approval still holds.
  fs.writeFileSync(dest, executorEdits(landed));
  const afterBuild = gateHook.classifyResidency(dest, 'todo', projectDir);
  assert.equal(afterBuild.accepted, true,
    'building a plan must not evict it from the gate destination the human approved it into');

  // ...but widening the declared write surface after approval still breaks it.
  fs.writeFileSync(dest, executorEdits(landed).replace('  - "src/lib/x.js"', '  - "src/**"'));
  const afterScopeChange = gateHook.classifyResidency(dest, 'todo', projectDir);
  assert.equal(afterScopeChange.accepted, false);
  assert.equal(afterScopeChange.reason, 'hash-mismatch');
});

// --- 13. LINE ENDINGS DO NOT INVALIDATE AN APPROVAL ---------------------------

test('the same plan checked out with CRLF verifies identically', () => {
  const slug = 'crlf-plan';
  approve(slug, SPEC_PLAN);
  const crlf = SPEC_PLAN.replace(/\n/g, '\r\n');
  assert.notEqual(crlf, SPEC_PLAN);
  assert.equal(ledger.verify(slug, crlf, 'todo', projectDir), true);
});

// --- 14-16. THE DENY-LIST FAILS SAFE, AND ITS EXCLUSIONS ARE BOUNDED ----------

test('an UNLISTED new section is HASHED — the deny-list fails safe, never open', () => {
  const slug = 'unlisted-section';
  approve(slug, SPEC_PLAN);
  assert.equal(
    ledger.verify(slug, `${SPEC_PLAN}\n## Notes\n\nSomething nobody listed.\n`, 'todo', projectDir),
    false,
    'a section not on the deny-list must be hashed — a forgotten section is PROTECTED, not exempt',
  );
});

test('an execution record written WITHOUT a checkbox is HASHED — drift is noisy, never silent', () => {
  const slug = 'record-no-checkbox';
  approve(slug, SPEC_PLAN);
  const drifted = SPEC_PLAN.replace(
    '### Step 10: IMPLEMENT — one step, files as sub-items.',
    '### Step 10: IMPLEMENT — one step, files as sub-items.\nDONE: wrote both files',
  );
  assert.equal(ledger.verify(slug, drifted, 'todo', projectDir), false);
});

test('an excluded section ENDS at the next heading of the same or higher level', () => {
  const withTrailer = `${SPEC_PLAN}\n## Execution Record\n\nexecutor text\n\n## Acceptance Criteria\n\nthe widget reports its real state\n`;
  const slug = 'section-bounds';
  approve(slug, withTrailer);
  // Editing the excluded section does not break it...
  assert.equal(
    ledger.verify(slug, withTrailer.replace('executor text', 'different executor text'), 'todo', projectDir),
    true,
  );
  // ...but editing the specification section AFTER it does.
  assert.equal(
    ledger.verify(slug, withTrailer.replace('the widget reports its real state', 'anything goes'), 'todo', projectDir),
    false,
    'content after an excluded section must be hashed again',
  );
});

test('a deeper heading INSIDE an excluded section stays excluded', () => {
  const base = `${SPEC_PLAN}\n## Execution Record\n\n### Step 14 numbers\n\npass 1 fail 0\n`;
  const slug = 'nested-heading';
  approve(slug, base);
  assert.equal(
    ledger.verify(slug, base.replace('pass 1 fail 0', 'pass 4211 fail 0'), 'todo', projectDir), true,
  );
});

test('the excluded headings match by PREFIX, so a real "(Steps 8-16)" suffix is recognised', () => {
  const slug = 'suffixed-heading';
  const base = `${SPEC_PLAN}\n## Execution Record (Steps 8-16)\n\nfirst\n`;
  approve(slug, base);
  assert.equal(ledger.verify(slug, base.replace('first', 'second'), 'todo', projectDir), true);
});

test('EXECUTION_SECTIONS is frozen and exported', () => {
  assert.ok(Array.isArray(ledger.EXECUTION_SECTIONS) || ledger.EXECUTION_SECTIONS instanceof Set);
  assert.equal(Object.isFrozen(ledger.EXECUTION_SECTIONS), true);
});

// --- the frontmatter derivation does not diverge from the codebase's ----------

test('the ledger hashes the SAME frontmatter region the rest of the codebase reads', () => {
  // approval-ledger deliberately keeps a zero-dependency local split (its documented
  // Bash-hook-path invariant), so this test is the anti-divergence mechanism: the
  // grant-bearing frontmatter it hashes must equal `stale-detector`'s canonical region.
  const fixtures = [
    SPEC_PLAN,
    SPEC_PLAN.replace(/^---\napproved_by[\s\S]*?---\n\n/, ''), // single block, unstamped
    `\n\n${SPEC_PLAN}`,                                        // leading blank lines
    SPEC_PLAN.replace(/\n/g, '\r\n'),                          // CRLF checkout
  ];
  for (const fixture of fixtures) {
    const res = ledger.computeSpecHash(fixture);
    assert.equal(res.ok, true);
    assert.equal(res.frontmatter, extractFrontmatterRegion(fixture),
      'the local split must not diverge from stale-detector.extractFrontmatterRegion');
  }
});

// --- 17. NO GATE IS WEAKENED --------------------------------------------------

test('wrong-edge still rejects', () => {
  const slug = 'wrong-edge-plan';
  const planPath = writePlan('todo', slug, SPEC_PLAN);
  ledger.writeEntry(slug, {
    content_sha256: ledger.computeSpecHash(SPEC_PLAN).hash,
    stage_from: 'review', stage_to: 'done', approved_by: 'human',
  }, projectDir);
  const verdict = gateHook.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'wrong-edge');
});

test('no-ledger-entry still rejects', () => {
  const planPath = writePlan('todo', 'unledgered-plan', SPEC_PLAN);
  const verdict = gateHook.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'no-ledger-entry');
});

test('unknown-provenance still rejects, even with a matching specification hash', () => {
  const slug = 'unknown-prov';
  const planPath = writePlan('todo', slug, SPEC_PLAN);
  fs.writeFileSync(ledger.ledgerPath(slug, projectDir), JSON.stringify({
    content_sha256: ledger.computeSpecHash(SPEC_PLAN).hash,
    stage_from: 'implementation',
    stage_to: 'todo',
    advanced_by: 'sufficiency-gate',
    approved_by: 'human',
    hash_scope: 'specification',
  }, null, 2));
  const verdict = gateHook.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'unknown-provenance');
  assert.equal(verdict.kind, 'unknown');
});

test('ledger-corrupt still rejects', () => {
  const slug = 'corrupt-prov';
  const planPath = writePlan('todo', slug, SPEC_PLAN);
  fs.writeFileSync(ledger.ledgerPath(slug, projectDir), '{ not json');
  const verdict = gateHook.classifyResidency(planPath, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'ledger-corrupt');
});

test('an unreadable plan still rejects (never accepted into a gate destination)', () => {
  const slug = 'unreadable-plan';
  approve(slug, SPEC_PLAN);
  const missing = path.join(projectDir, 'plans', 'todo', `${slug}.md`);
  const verdict = gateHook.classifyResidency(missing, 'todo', projectDir);
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'unreadable');
});

test('computeContentHash is KEPT and unchanged — legacy entries verify under it', () => {
  assert.equal(typeof ledger.computeContentHash, 'function');
  assert.equal(
    ledger.computeContentHash('abc'),
    require('node:crypto').createHash('sha256').update('abc', 'utf8').digest('hex'),
  );
});

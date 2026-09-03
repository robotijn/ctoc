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
  // This slice CREATES src/lib/x.js + tests/x.test.js — two documented-count
  // artifacts — so the Gate-2 count-mover fence (src/lib/documented-counts.js,
  // plan 00082) requires it to declare CLAUDE.md, the ratchet whose write the hook
  // withholds. A count-mover that omits this is refused at implementation→todo.
  '  - "CLAUDE.md"',
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

// --- 6b. THE PIPELINE'S OWN "DEFERRED QUESTIONS" NOTE (plan 00255) -------------

/**
 * The literal shape `src/lib/iron-loop.js` (appendDeferredQuestions) writes into a
 * plan: a level-2 heading, the integrator's provenance paragraph, and one bullet.
 */
const DEFERRED_QUESTIONS_SECTION = [
  '',
  '## Deferred Questions',
  '',
  '_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO',
  'quality evaluation. These entries are the integrator\'s own report on itself, not',
  'findings from a critic that read this plan._',
  '',
  '- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan.',
  '',
].join('\n');

test('the integrator\'s Deferred Questions note does not invalidate an approval', () => {
  // Human ruling 2026-09-03: `deferred questions` is the pipeline's OWN output, not
  // the specification the human ruled on, so it joins the exempt table. An approval
  // recorded before the note exists must survive the note being written.
  const slug = 'deferred-appended';
  approve(slug, SPEC_PLAN);
  assert.equal(
    ledger.verify(slug, SPEC_PLAN + DEFERRED_QUESTIONS_SECTION, 'todo', projectDir), true,
    'the integrator\'s own deferred-questions note is an execution section, not specification',
  );
});

test('an approval recorded WITH the Deferred Questions note already present still verifies', () => {
  // The ordinary crossing: `actions.js` runs the refinement pass BEFORE
  // `stampAndLedger`, so the note is usually already on disk when the digest is
  // taken. Excluding it must not break that entry either — both sides of the
  // comparison exclude the same region.
  const slug = 'deferred-at-approval';
  const withNote = SPEC_PLAN + DEFERRED_QUESTIONS_SECTION;
  approve(slug, withNote);
  assert.equal(ledger.verify(slug, withNote, 'todo', projectDir), true);
  // ... and the note may then be REWRITTEN by a second refinement pass without
  // invalidating anything, which is the whole point of exempting it.
  const rewritten = withNote.replace(
    '- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan.',
    '- **evaluation**: NOT EVALUATED — second pass, same verdict, different words.',
  );
  assert.notEqual(rewritten, withNote, 'the fixture edit must actually change the bytes');
  assert.equal(ledger.verify(slug, rewritten, 'todo', projectDir), true);
});

/**
 * Approvals that ALREADY failed their specification comparison before the
 * deferred-questions exemption landed on 2026-09-03, measured on this repository at
 * that moment (94 entries mismatched in total; these 21 are the ones that also carry
 * the note, so the test below would otherwise attribute their failure to the
 * exemption). Every one is a pre-existing, unrelated post-approval edit awaiting an
 * ordinary re-approval through the menu. The set may only SHRINK: the assertion is a
 * SUBSET check, so re-approving one of these never turns the suite red, while ANY new
 * name appearing here does.
 */
const MISMATCHED_BEFORE_THE_EXEMPTION = new Set([
  '00072-r1-per-request-ctoc-routing-hook',
  '00074-gc1-golden-corpus-real-sample-fence',
  '00086-a-registry-read-error-cannot-blank-the-dashboard',
  '00125-the-sync-barrier-is-undefended-where-work-actually-starts',
  '00167-the-completion-route-records-work-it-never-saw-start',
  '00182-an-empty-question-list-must-prove-a-critique-ran-before-it-can-cross-a-gate',
  '00184-the-audit-record-of-a-crossed-gate-says-how-many-questions-existed',
  '00186-a-shipped-recipe-is-proven-by-running-it',
  '00189-the-refinement-loop-is-documented-as-running-and-is-a-design-record',
  '00190-the-quality-gate-is-named-a-key-entry-point-and-no-command-can-reach-it',
  '00191-the-compliance-seam-is-two-call-sites-from-being-real',
  '00201-the-shell-gate-works-out-what-a-command-writes-and-says-when-it-cannot',
  '00202-the-shell-channel-asks-the-coverage-question-the-edit-channel-asks-and-records-its-answer',
  '00203-a-configured-check-command-reaches-a-shell-that-was-never-meant-to-interpret-it',
  '00204-the-configuration-directory-stops-granting-writes-to-its-own-command-tables',
  '00206-the-shell-gate-stops-allowing-a-command-it-could-not-read',
  '00209-a-failed-tool-detection-stops-reporting-lint-and-typecheck-as-passed',
  '00234-readme-as-a-course-s1-readme-and-guard-pins',
  '00237-close-the-coverage-holes-s3-fail-open-contracts',
  '00253-close-the-coverage-holes-s19-remainder-streaming-claims',
  '00254-close-the-coverage-holes-s20-floor-raise-decision',
]);

test('LIVE LEDGER: the deferred-questions exemption invalidated no approval it did not re-record', () => {
  // THE GUARD THAT THE MIGRATION HAPPENED (plan 00255). Adding the exempt row moved
  // the specification digest of every ledgered plan carrying the note — measured on
  // 2026-09-03: 35 entries flipped from match to mismatch, and 0 were repaired by the
  // row. All 35, plus 00252 which the ruling names, were re-recorded through
  // `src/scripts/ledger-backfill.js --hash-scope specification` in the SAME change.
  // If that migration is ever reverted, half-applied, or a future edit to the exempt
  // table repeats the mistake, a plan lands in `offenders` BY NAME and this fails.
  //
  // It deliberately does NOT assert "zero mismatches in the ledger": 94 entries
  // already mismatched before this change, almost all of them legacy whole-file
  // (`hash_scope` absent or `'file'`) entries invalidated by their own ordinary
  // execution records. Asserting a global zero would be asserting somebody else's
  // unexamined debt and would go red for reasons unrelated to this exemption. The
  // scope here is exact: a SPECIFICATION-scoped entry whose plan carries the note.
  // For those, an ordinary build must not move the digest at all — that is the whole
  // design — so a mismatch among them is a genuine finding, not noise.
  const stages = ['todo', 'in-progress', 'review', 'done'];
  const offenders = [];
  let examined = 0;
  for (const stage of stages) {
    const dir = path.join(REPO_ROOT, 'plans', stage);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const planPath = path.join(dir, file);
      const slug = ledger.slugFromPlanPath(planPath);
      const entry = ledger.readEntry(slug, REPO_ROOT);
      if (!entry || entry.hash_scope !== 'specification') continue;
      const content = fs.readFileSync(planPath, 'utf8');
      if (!/^##\s*Deferred Questions\s*$/m.test(content)) continue;
      examined++;
      if (ledger.contentMatches(entry, content).match) continue;
      if (MISMATCHED_BEFORE_THE_EXEMPTION.has(slug)) continue;
      offenders.push(`${stage}/${file}`);
    }
  }
  assert.ok(examined > 0, 'expected real ledgered plans carrying a Deferred Questions section');
  assert.deepEqual(offenders, [],
    'these approvals carry the pipeline-written Deferred Questions note and no longer match ' +
    'their recorded specification; re-record each through ' +
    'src/scripts/ledger-backfill.js --hash-scope specification');
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
  // CONTRACT TIGHTENED by plan 00130 (approved at Gate 2): an unlocatable specification
  // boundary now reports `spec-boundary-unlocatable` — "the check could not look" —
  // instead of `hash-mismatch`, which meant "the specification changed" and sent the
  // reader to the wrong diagnosis. Acceptance is UNCHANGED (still false — a check that
  // cannot look must deny); only the reason became more precise. This is a
  // tighten-toward-truth, never a loosening.
  assert.equal(verdict.reason, 'spec-boundary-unlocatable');
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

// --- 6. A KICKBACK MUST NOT REVOKE THE BUILD'S OWN PERMISSION -----------------
//
// The circuit breaker used to persist `kickback_counts` INSIDE the plan's first
// frontmatter block — the region `computeSpecHash` hashes in full, because it
// carries `files:`, the write-surface grant. So the build's own quality gate
// moved the hashed bytes and `isApprovedForCoverage` answered NOT approved: a
// normal, documented kickback revoked the permission it was authorised by, and
// the plan read as forged to every audit. The counter now lives in
// `.ctoc/state/kickbacks/<slug>.json` and the plan file is never written.

/** Read the kickback sidecar for a slug, or null when it does not exist. */
function readKickbackSidecar(slug) {
  const p = path.join(projectDir, '.ctoc', 'state', 'kickbacks', `${slug}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('a kickback does NOT revoke the approval it was authorised by', () => {
  const actions = require('../src/lib/actions');
  const slug = 'kickback-keeps-approval';
  approve(slug, SPEC_PLAN);
  const planPath = writePlan('todo', slug, SPEC_PLAN);
  const before = fs.readFileSync(planPath);

  const res = actions.recordStepKickback(planPath, 14, projectDir);
  assert.equal(res.recorded, true, 'the kickback is counted');

  assert.equal(
    gateHook.classifyResidency(planPath, 'todo', projectDir).accepted, true,
    'the plan is STILL approved for coverage after its own gate kicked it back',
  );
  assert.equal(
    ledger.verify(slug, fs.readFileSync(planPath, 'utf8'), 'todo', projectDir), true,
    'the recorded specification hash still verifies',
  );
  assert.deepEqual(
    fs.readFileSync(planPath), before,
    'the plan file is byte-identical — the breaker wrote no part of it',
  );

  const sidecar = readKickbackSidecar(slug);
  assert.ok(sidecar, 'the count is persisted in .ctoc/state/kickbacks/<slug>.json');
  assert.equal(sidecar.total, 1);
  assert.equal(sidecar.by_step['14'], 1);
});

test('the same plan after SIX kickbacks — through an escalation — is still approved', () => {
  const actions = require('../src/lib/actions');
  const slug = 'kickback-six-times';
  approve(slug, SPEC_PLAN);
  const planPath = writePlan('todo', slug, SPEC_PLAN);
  const before = fs.readFileSync(planPath);

  let last;
  for (let i = 0; i < 6; i++) last = actions.recordStepKickback(planPath, 14, projectDir);
  assert.ok(last.escalation, 'six kickbacks to one step escalate — the breaker still trips');

  assert.equal(
    gateHook.classifyResidency(planPath, 'todo', projectDir).accepted, true,
    'the approval survives an ESCALATION, not merely one quiet kickback',
  );
  assert.deepEqual(fs.readFileSync(planPath), before, 'still byte-identical after six kickbacks');
  assert.equal(readKickbackSidecar(slug).total, 6);
});

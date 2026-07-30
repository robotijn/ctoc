'use strict';

/**
 * The fresh-slice exemption checks the approval it ACTUALLY means (plan 00207).
 *
 * `isFreshSip1Slice` in src/hooks/human-gate-check.js exempts a freshly-authored
 * SIP1 slice sitting in `implementation/` from the residency revert, PROVIDED its
 * `parent_plan` resolves to a parent that genuinely crossed Gate 1 into
 * `implementation/`. The parent-approval leg used to test only
 * `readEntryResult(parentSlug).status === 'ok'` — "the parent has ANY readable
 * ledger entry" — which DIVERGES from the predicate the residency sweep applies to
 * a normal resident (`approval-residency.classifyResidency`, which is kind- and
 * edge-sensitive). A divergence in an approval predicate is a forgery / false-lockout
 * surface. This suite pins that the exemption now DELEGATES to that one shared
 * predicate: it accepts a human / backfilled / sufficiency-with-evidence crossing
 * INTO `implementation/`, and rejects a pipeline entry, an unknown provenance, a
 * wrong-edge entry, and a missing / corrupt / un-keyable one — exactly what the sweep
 * accepts and rejects, never broader, never narrower.
 *
 * NO test doubles: every assertion drives the REAL exported `isFreshSip1Slice` and
 * `checkFolder` against a REAL temp plan tree in os.tmpdir() and a REAL ledger written
 * by the REAL approval-ledger writers (writeEntry / writePipelineEntry /
 * writeSufficiencyEntry / backfillEntry). The two forgery shapes the sanctioned
 * writers refuse to mint (an evidence-less sufficiency entry; an unknown provenance)
 * are written as raw JSON straight into `.ctoc/approvals/`, exactly the crafted shape
 * the predicate must reject.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('../src/lib/approval-ledger');

// CWD safety: chdir into an empty sandbox before requiring the hook. The module is
// guarded by `require.main === module`, so requiring it never runs main(); the chdir
// matches the established pattern so a require-time regression cannot touch THIS repo.
const originalCwd = process.cwd();
const cwdSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-fresh-slice-cwd-'));
process.chdir(cwdSandbox);

const gate = require('../src/hooks/human-gate-check.js');

const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const HASH = ledger.computeContentHash('parent-content');
const tmpDirs = [cwdSandbox];

after(() => {
  process.chdir(originalCwd);
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// --- fixtures ----------------------------------------------------------------

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-fresh-slice-'));
  tmpDirs.push(dir);
  for (const stage of STAGES) fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  return dir;
}

function planBody(extraFm = '') {
  return `---\n${extraFm}title: "Plan"\ntype: feature\n---\n\n# Body\n\nContent.\n`;
}

/** Write a plan file into a stage folder; returns {filePath, content, slug}. */
function writePlan(projectDir, stage, slug, extraFm = '') {
  const content = planBody(extraFm);
  const filePath = path.join(projectDir, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(filePath, content);
  return { filePath, content, slug };
}

/** A slice in implementation/ carrying a parent_plan linkage; no ledger entry of its own. */
function writeSlice(projectDir, slug, parentValue) {
  return writePlan(projectDir, 'implementation', slug, `parent_plan: ${parentValue}\n`);
}

/** Raw crafted ledger entry — the forgery shape a sanctioned writer refuses to mint. */
function writeRawLedger(projectDir, slug, obj) {
  const p = path.join(projectDir, '.ctoc', 'approvals', `${slug}.json`);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
}

const fresh = (projectDir, filePath, folder = 'implementation', content = null) =>
  gate.isFreshSip1Slice(filePath, folder, projectDir, content);

// The slugs the residency sweep flags in a stage folder.
const flaggedSlugs = (projectDir, stage) =>
  gate.checkFolder(stage, projectDir).map((v) => path.basename(v.path).replace(/\.md$/, ''));

// ============================================================================
// The load-bearing distinctions — DELEGATION to classifyResidency.
// ============================================================================

// Case 1 — a human crossing INTO implementation/ is the legitimate case the
// exemption exists for. GUARD (green today, must stay green).
test('exempt_whenParentIsHumanCrossingIntoImplementation', () => {
  const projectDir = makeProject();
  ledger.writeEntry('human-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation' }, projectDir);
  const { filePath } = writeSlice(projectDir, 'human-parent-s1', 'human-parent');
  assert.equal(fresh(projectDir, filePath), true,
    'a slice under a human/implementation parent stays exempt');
});

// Case 2 — a PIPELINE entry is not a valid provenance root at implementation/
// (pipeline is valid only at done/). RED today: `status === 'ok'` accepts it.
test('notExempt_whenParentIsPipelineEntryAtImplementation', () => {
  const projectDir = makeProject();
  ledger.writePipelineEntry('pipeline-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation', evidence: 'stale-reconciliation' },
    projectDir);
  const { filePath } = writeSlice(projectDir, 'pipeline-parent-s1', 'pipeline-parent');
  assert.equal(fresh(projectDir, filePath), false,
    'a pipeline-kind parent must NOT vouch for a fresh slice (pipeline-not-allowed at implementation/)');
});

// Case 3 — a parent that crossed into todo/ does not vouch for an implementation/
// slice. RED today: wrong edge, yet `status === 'ok'` accepted it.
test('notExempt_whenParentCrossedIntoTodo_wrongEdge', () => {
  const projectDir = makeProject();
  ledger.writeEntry('todo-parent',
    { content_sha256: HASH, stage_from: 'implementation', stage_to: 'todo' }, projectDir);
  const { filePath } = writeSlice(projectDir, 'todo-parent-s1', 'todo-parent');
  assert.equal(fresh(projectDir, filePath), false,
    'a parent whose entry is for the todo/ edge does not vouch for an implementation/ slice');
});

// Case 4 — a parent that crossed into done/ does not vouch either. RED today.
test('notExempt_whenParentCrossedIntoDone_wrongEdge', () => {
  const projectDir = makeProject();
  ledger.writeEntry('done-parent',
    { content_sha256: HASH, stage_from: 'review', stage_to: 'done' }, projectDir);
  const { filePath } = writeSlice(projectDir, 'done-parent-s1', 'done-parent');
  assert.equal(fresh(projectDir, filePath), false,
    'a parent whose entry is for the done/ edge does not vouch for an implementation/ slice');
});

// Case 5 — a SUFFICIENCY entry WITH evidence into implementation/ is a legitimate
// X6 crossing. GUARD (green today, must stay green): a naive `entryKind === 'human'`
// rewrite would wrongly reject this — pinned here so it fails loudly if attempted.
test('exempt_whenParentIsSufficiencyWithEvidenceAtImplementation', () => {
  const projectDir = makeProject();
  ledger.writeSufficiencyEntry('suff-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation', evidence: 'plan ref; 3 answered; q1,q2,q3' },
    projectDir);
  const { filePath } = writeSlice(projectDir, 'suff-parent-s1', 'suff-parent');
  assert.equal(fresh(projectDir, filePath), true,
    'a legitimate sufficiency crossing into implementation/ must keep the slice exempt');
});

// Case 6 — a BACKFILLED (human-ordered migration) entry into implementation/ is a
// legitimate crossing. GUARD (green today, must stay green).
test('exempt_whenParentIsBackfilledAtImplementation', () => {
  const projectDir = makeProject();
  const parent = writePlan(projectDir, 'implementation', 'backfill-parent'); // real file: backfillEntry reads it
  ledger.backfillEntry(projectDir, parent.filePath, { stage_to: 'implementation', reason: 'legacy migration' });
  const { filePath } = writeSlice(projectDir, 'backfill-parent-s1', 'backfill-parent');
  assert.equal(fresh(projectDir, filePath), true,
    'a human-ordered backfilled crossing into implementation/ must keep the slice exempt');
});

// Case 7 — an UNKNOWN provenance (crafted raw JSON) must not vouch. RED today.
test('notExempt_whenParentHasUnknownProvenance', () => {
  const projectDir = makeProject();
  writeRawLedger(projectDir, 'unknown-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation', advanced_by: 'sufficiency-gate' });
  const { filePath } = writeSlice(projectDir, 'unknown-parent-s1', 'unknown-parent');
  assert.equal(fresh(projectDir, filePath), false,
    'an unrecognised provenance (unknown-provenance) must NOT vouch for a fresh slice');
});

// Case 8 — a SUFFICIENCY entry WITHOUT evidence (crafted raw JSON — the sanctioned
// writer refuses it) must not vouch. RED today.
test('notExempt_whenParentIsSufficiencyWithoutEvidence', () => {
  const projectDir = makeProject();
  writeRawLedger(projectDir, 'suff-noev-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation', advanced_by: 'sufficiency' });
  const { filePath } = writeSlice(projectDir, 'suff-noev-parent-s1', 'suff-noev-parent');
  assert.equal(fresh(projectDir, filePath), false,
    'a sufficiency entry with no evidence (sufficiency-no-evidence) must NOT vouch');
});

// Case 9 — a parent with NO ledger entry at all. GUARD (status ≠ ok already).
test('notExempt_whenParentHasNoEntry', () => {
  const projectDir = makeProject();
  const { filePath } = writeSlice(projectDir, 'orphan-s1', 'nonexistent-parent');
  assert.equal(fresh(projectDir, filePath), false,
    'a dangling / unledgered parent is not a valid provenance root');
});

// Case 10 — a corrupt parent entry: not exempt, and NO throw. GUARD.
test('notExempt_andNoThrow_whenParentEntryIsCorrupt', () => {
  const projectDir = makeProject();
  writeRawLedger(projectDir, 'corrupt-parent', '{ this is not json');
  const { filePath } = writeSlice(projectDir, 'corrupt-parent-s1', 'corrupt-parent');
  assert.doesNotThrow(() => {
    assert.equal(fresh(projectDir, filePath), false, 'a corrupt parent entry is not a valid root');
  });
});

// Case 11 — an un-keyable parent slug: not exempt, and NO throw. GUARD.
test('notExempt_andNoThrow_whenParentSlugIsUnkeyable', () => {
  const projectDir = makeProject();
  // A leading underscore fails the ledger SLUG_RE → ledgerPath throws Invalid slug,
  // which readEntryResult catches into status 'unkeyable'. The delegation must not
  // let that throw escape.
  const { filePath } = writeSlice(projectDir, 'unkeyable-parent-s1', '_not-a-valid-slug');
  assert.doesNotThrow(() => {
    assert.equal(fresh(projectDir, filePath), false, 'an un-keyable parent slug is not a valid root');
  });
});

// Case 12 — the SLICE itself already has a ledger entry → not fresh, regardless of
// how legitimate the parent is. GUARD (the slice's own absent-check fires first).
test('notExempt_whenSliceItselfHasAnEntry_evenUnderApprovedParent', () => {
  const projectDir = makeProject();
  ledger.writeEntry('approved-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation' }, projectDir);
  const { filePath, content } = writeSlice(projectDir, 'already-ledgered-s1', 'approved-parent');
  ledger.writeEntry('already-ledgered-s1',
    { content_sha256: ledger.computeContentHash(content), stage_from: 'implementation', stage_to: 'todo' }, projectDir);
  assert.equal(fresh(projectDir, filePath), false,
    'a slice that already carries an entry is not a fresh, never-crossed slice');
});

// Case 13 / 14 — the exemption can never fire outside implementation/. GUARD.
test('notExempt_whenSliceIsInTodo', () => {
  const projectDir = makeProject();
  ledger.writeEntry('approved-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation' }, projectDir);
  const { filePath } = writePlan(projectDir, 'todo', 'todo-slice', 'parent_plan: approved-parent\n');
  assert.equal(fresh(projectDir, filePath, 'todo'), false,
    'the exemption cannot fire in todo/');
});

test('notExempt_whenSliceIsInDone', () => {
  const projectDir = makeProject();
  ledger.writeEntry('approved-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation' }, projectDir);
  const { filePath } = writePlan(projectDir, 'done', 'done-slice', 'parent_plan: approved-parent\n');
  assert.equal(fresh(projectDir, filePath, 'done'), false,
    'the exemption cannot fire in done/');
});

// Case 15 — no parent_plan key at all. GUARD.
test('notExempt_whenNoParentPlanKey', () => {
  const projectDir = makeProject();
  const { filePath } = writePlan(projectDir, 'implementation', 'no-parent', '');
  assert.equal(fresh(projectDir, filePath), false, 'a plan with no parent_plan is not a SIP1 slice');
});

// Case 16 — an empty / quoted-empty parent_plan value. GUARD.
test('notExempt_whenParentPlanIsEmpty', () => {
  const projectDir = makeProject();
  const { filePath } = writePlan(projectDir, 'implementation', 'empty-parent', 'parent_plan: ""\n');
  assert.equal(fresh(projectDir, filePath), false, 'an empty parent_plan is not a real linkage');
});

// Case 17 — a bare slug, a `<slug>.md`, and a path value all resolve identically.
// GUARD: the slugFromPlanPath normalization must survive delegation.
test('exempt_forAllThreeParentPlanValueShapes', () => {
  const projectDir = makeProject();
  ledger.writeEntry('approved-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation' }, projectDir);
  const shapes = ['approved-parent', 'approved-parent.md', 'plans/implementation/approved-parent.md'];
  shapes.forEach((value, i) => {
    const { filePath } = writeSlice(projectDir, `shape-${i}-s1`, value);
    assert.equal(fresh(projectDir, filePath), true,
      `parent_plan value "${value}" must resolve to the same approved parent`);
  });
});

// Case 18 — a parent EDITED after approval stays exempt: implementation/ is not a
// HASH_SENSITIVE_FOLDER, so no content-hash check runs. GUARD (green→green) that pins
// the deliberate no-hash decision so a later "improvement" adding a hash check fails here.
test('exempt_whenParentContentChangedSinceApproval_noHashCheck', () => {
  const projectDir = makeProject();
  const parent = writePlan(projectDir, 'implementation', 'edited-parent');
  ledger.writeEntry('edited-parent',
    { content_sha256: ledger.computeContentHash(parent.content), stage_from: 'functional', stage_to: 'implementation' },
    projectDir);
  // Mutate the parent's on-disk content AFTER the entry was written.
  fs.writeFileSync(parent.filePath, planBody('') + '\n\nedited after approval — different bytes\n');
  const { filePath } = writeSlice(projectDir, 'edited-parent-s1', 'edited-parent');
  assert.equal(fresh(projectDir, filePath), true,
    'implementation/ is not hash-sensitive: a post-approval edit to the parent must not revoke the exemption');
});

// Case 19 — END TO END through the residency sweep (checkFolder), not the predicate.
test('sweep_flagsSliceUnderPipelineParent_butNotUnderHumanParent', () => {
  // 19a — under a pipeline (invalid-at-implementation) parent, the slice IS flagged.
  const a = makeProject();
  ledger.writePipelineEntry('pipe-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation', evidence: 'x' }, a);
  writeSlice(a, 'pipe-child', 'pipe-parent');
  assert.ok(flaggedSlugs(a, 'implementation').includes('pipe-child'),
    'a slice under a pipeline (non-legitimate) parent must be reported as a violation');

  // 19b — under a human/implementation parent, the slice is NOT flagged.
  const b = makeProject();
  ledger.writeEntry('human-parent',
    { content_sha256: HASH, stage_from: 'functional', stage_to: 'implementation' }, b);
  writeSlice(b, 'human-child', 'human-parent');
  assert.ok(!flaggedSlugs(b, 'implementation').includes('human-child'),
    'a genuine fresh slice under an approved parent must NOT be reported as a violation');
});

// Case 20 — the delegation NEVER throws, across every pathological input. GUARD.
test('neverThrows_acrossPathologicalInputs', () => {
  const projectDir = makeProject();

  // zero-byte parent ledger file
  writeRawLedger(projectDir, 'zerobyte-parent', '');
  const zb = writeSlice(projectDir, 'zerobyte-s1', 'zerobyte-parent');

  // parent ledger entry that is an ARRAY (valid JSON, wrong shape)
  writeRawLedger(projectDir, 'array-parent', '[]');
  const arr = writeSlice(projectDir, 'array-s1', 'array-parent');

  // the SLICE path is a directory named *.md
  const dirSlicePath = path.join(projectDir, 'plans', 'implementation', 'dir-slice.md');
  fs.mkdirSync(dirSlicePath);

  assert.doesNotThrow(() => {
    assert.equal(fresh(projectDir, zb.filePath), false, 'zero-byte parent entry → not exempt');
    assert.equal(fresh(projectDir, arr.filePath), false, 'array-shaped parent entry → not exempt');
    assert.equal(fresh(projectDir, dirSlicePath), false, 'a directory plan path → not exempt');
  });
});

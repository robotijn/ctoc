'use strict';

/**
 * R2-F — Revive the dead gate hook.
 *
 * VERIFIED-BY-EXECUTION regression the parent session reproduced:
 *   require('../src/hooks/human-gate-check.js').checkFolder('done', cwd) THREW
 *   'Invalid slug' the moment an uppercase-slug legacy plan sat in plans/done/,
 *   so main()'s outer catch swallowed the throw and exited 0 — the hook had been
 *   enforcing NOTHING. These tests drive the REAL exported functions against REAL
 *   temp plan trees (no test doubles) and assert the sweep NEVER aborts on a bad
 *   slug or a corrupt entry, that legacy plans are keyable after backfill, and
 *   that the two ledger entry kinds (human vs pipeline) gate their folders.
 *
 * BEHAVIOR-first: every assertion checks FLAGGED / NOT-FLAGGED residency and the
 * loud/soft failure surface, never a bare return shape in isolation.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('../src/lib/approval-ledger');
const gate = require('../src/hooks/human-gate-check.js');

const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
let projectDir;
const sandboxes = [];

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-r2f-'));
  sandboxes.push(projectDir);
  for (const stage of STAGES) {
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

// --- helpers -----------------------------------------------------------------

function planContent({ title = 'Plan', type = 'feature', parentPlan, body = '# Body\n\nSome content.\n' } = {}) {
  let fm = `---\ntitle: "${title}"\ntype: ${type}\n`;
  if (parentPlan) fm += `parent_plan: ${parentPlan}\n`;
  fm += '---\n\n';
  return fm + body;
}

/** filename keeps its given case on disk (case-preserving FS); returns abs path + content. */
function writePlan(stage, basename, opts) {
  const content = planContent(opts);
  const filePath = path.join(projectDir, 'plans', stage, `${basename}.md`);
  fs.writeFileSync(filePath, content);
  return { filePath, content };
}

/** Record a human-kind ledger entry with a matching content hash. */
function humanApprove(slug, content, stageFrom, stageTo) {
  ledger.writeEntry(slug, {
    content_sha256: ledger.computeContentHash(content),
    stage_from: stageFrom,
    stage_to: stageTo,
  }, projectDir);
}

// Report each flagged plan by its CANONICAL (lowercased) ledger slug — the same
// derivation the sweep keys on — so a legacy uppercase basename is compared on
// the key it actually collides/keys under, not its on-disk casing.
const flagged = (stage) =>
  gate.checkFolder(stage, projectDir).map((v) => ({
    slug: ledger.slugFromPlanPath(v.path),
    reason: v.reason,
  }));

const flaggedNames = (stage) => flagged(stage).map((v) => v.slug);

// --- legacy uppercase slug: sweep completes, then backfill accepts -----------

test('uppercase-slug legacy plan in done/ is FLAGGED (sweep does not throw), then backfill ACCEPTS it', () => {
  const { filePath } = writePlan('done', 'CU1-Legacy-Plan', { title: 'Legacy' });

  // The slug canonicalizes to lowercase; path-safety unchanged.
  assert.equal(ledger.slugFromPlanPath(filePath), 'cu1-legacy-plan');

  // The sweep MUST complete and flag the plan — never throw 'Invalid slug'.
  let names;
  assert.doesNotThrow(() => { names = flaggedNames('done'); }, 'uppercase slug must not crash the sweep');
  assert.ok(names.includes('cu1-legacy-plan'), 'legacy uppercase plan with no ledger entry must be flagged');

  // The integrator's backfill helper keys the (lowercased) slug and accepts it.
  ledger.backfillEntry(projectDir, filePath, { stage_to: 'done', reason: '2026-07-14 legacy migration' });
  assert.ok(!flaggedNames('done').includes('cu1-legacy-plan'), 'after backfill the legacy plan is accepted');
});

// --- the 181-gap: exactly the bare plan is flagged ---------------------------

test('181-gap simulation: ledgered + backfilled accepted, only the BARE plan flagged', () => {
  const a = writePlan('done', 'ledgered-plan', { title: 'A' });
  humanApprove('ledgered-plan', a.content, 'review', 'done');

  const b = writePlan('done', 'backfilled-plan', { title: 'B' });
  ledger.backfillEntry(projectDir, b.filePath, { stage_to: 'done', reason: 'legacy' });

  writePlan('done', 'bare-plan', { title: 'C' });

  const names = flaggedNames('done');
  assert.deepEqual(names.sort(), ['bare-plan'], 'exactly the bare, unledgered plan is flagged');
});

// --- pipeline provenance: evidence gates done/, forbidden in todo/ -----------

test('pipeline entry WITH evidence is accepted in done/ but REJECTED in todo/', () => {
  const d = writePlan('done', 'pipeline-done', { title: 'D' });
  ledger.writePipelineEntry('pipeline-done', {
    content_sha256: ledger.computeContentHash(d.content),
    stage_from: 'review',
    stage_to: 'done',
    evidence: 'stale-reconciliation:.ctoc/audit/verify-42.json',
  }, projectDir);
  assert.ok(!flaggedNames('done').includes('pipeline-done'), 'pipeline+evidence accepted in done/');

  const t = writePlan('todo', 'pipeline-todo', { title: 'T' });
  ledger.writePipelineEntry('pipeline-todo', {
    content_sha256: ledger.computeContentHash(t.content),
    stage_from: 'implementation',
    stage_to: 'todo',
    evidence: 'stale-reconciliation',
  }, projectDir);
  const t2 = flagged('todo').find((v) => v.slug === 'pipeline-todo');
  assert.ok(t2, 'pipeline entry must NOT satisfy the human-only todo gate');
});

test('pipeline entry WITHOUT evidence is REFUSED at write time (loud)', () => {
  assert.throws(() => ledger.writePipelineEntry('no-evidence', {
    content_sha256: 'abc',
    stage_from: 'review',
    stage_to: 'done',
  }, projectDir), /evidence/i, 'a pipeline entry with no evidence must be refused loudly');
});

// --- corrupt entry: that plan flagged ledger-corrupt, sweep continues --------

test('a corrupt ledger entry flags THAT plan (ledger-corrupt) and the sweep continues', () => {
  // Good, ledgered neighbour that MUST still be evaluated after the corrupt one.
  const good = writePlan('done', 'good-neighbour', { title: 'Good' });
  humanApprove('good-neighbour', good.content, 'review', 'done');

  // Corrupt entry for a resident plan.
  writePlan('done', 'corrupt-plan', { title: 'Corrupt' });
  fs.writeFileSync(path.join(projectDir, '.ctoc', 'approvals', 'corrupt-plan.json'), '{ not json');

  let result;
  assert.doesNotThrow(() => { result = flagged('done'); }, 'a corrupt entry must not abort the sweep');
  const corrupt = result.find((v) => v.slug === 'corrupt-plan');
  assert.ok(corrupt, 'the corrupt-entry plan is flagged');
  assert.equal(corrupt.reason, 'ledger-corrupt', 'flagged with the ledger-corrupt reason');
  assert.ok(!result.some((v) => v.slug === 'good-neighbour'), 'the good neighbour is still accepted (sweep continued)');
});

// --- un-keyable slug: flagged ledger-unkeyable, sweep continues --------------

test('an un-keyable slug flags THAT plan (ledger-unkeyable) and the sweep continues', () => {
  const good = writePlan('done', 'valid-slug', { title: 'Good' });
  humanApprove('valid-slug', good.content, 'review', 'done');

  // Underscore survives lowercasing and is rejected by SLUG_RE → un-keyable.
  writePlan('done', 'bad_slug_underscore', { title: 'Bad' });

  let result;
  assert.doesNotThrow(() => { result = flagged('done'); }, 'an un-keyable slug must not abort the sweep');
  const bad = result.find((v) => v.slug === 'bad_slug_underscore');
  assert.ok(bad, 'the un-keyable plan is flagged');
  assert.equal(bad.reason, 'ledger-unkeyable', 'flagged with the ledger-unkeyable reason');
  assert.ok(!result.some((v) => v.slug === 'valid-slug'), 'the valid neighbour is still accepted');
});

// --- vision residency is LEDGER-DRIVEN (R3-A: the exemption is gone) ----------
//
// SUPERSEDED by R3-A. This used to assert that a bare `type: vision` plan in done/
// was EXEMPT from the residency sweep. That exemption WAS the forgery hole: because
// plans/**.md is Edit-whitelisted, any agent could write plans/done/x.md containing
// the single line `type: vision` and squat the terminal folder with zero provenance.
// The exemption is deleted; done/ residency is now UNIFORMLY ledger-driven. The
// assertions are TIGHTENED toward the real, safer behavior — a vision archive is
// accepted only when a pipeline-kind ledger entry vouches for it.

test('a bare type: vision plan in done/ is FLAGGED (the exemption is gone, R3-A)', () => {
  writePlan('done', 'squatted-vision', { title: 'Vision', type: 'vision' });
  assert.ok(flaggedNames('done').includes('squatted-vision'),
    'a type: vision plan with no ledger entry can no longer squat done/ — it must be flagged');

  // A normal bare plan is flagged too — there is nothing special about type: vision.
  writePlan('done', 'normal-bare', { title: 'Normal' });
  assert.ok(flaggedNames('done').includes('normal-bare'), 'a non-vision bare plan is still flagged');
});

test('a decomposed vision archive WITH a pipeline ledger entry is ACCEPTED (R3-A)', () => {
  const v = writePlan('done', 'ledgered-vision', { title: 'Vision', type: 'vision' });
  ledger.writeVisionArchiveEntry(projectDir, v.filePath);
  assert.ok(!flaggedNames('done').includes('ledgered-vision'),
    'a vision archive vouched for by a pipeline-kind entry (evidence: vision-decomposed) occupies done/ legitimately');
  assert.equal(ledger.entryKind(ledger.readEntry('ledgered-vision', projectDir)), 'pipeline');
});

// --- case collision on backfill: loud failure --------------------------------

test('backfilling two plans that differ ONLY by case is a LOUD collision failure', () => {
  const a = writePlan('done', 'Mixed-Plan', { title: 'Mixed upper' });
  ledger.backfillEntry(projectDir, a.filePath, { stage_to: 'done', reason: 'legacy' });

  // A different original file (in another stage) canonicalizes to the SAME key.
  const b = writePlan('todo', 'mixed-plan', { title: 'mixed lower' });
  assert.throws(
    () => ledger.backfillEntry(projectDir, b.filePath, { stage_to: 'todo', reason: 'legacy' }),
    /collision/i,
    'a second original path colliding on the canonical key must fail loudly, never silently overwrite',
  );

  // Re-backfilling the SAME original path is NOT a collision (idempotent re-approval).
  assert.doesNotThrow(
    () => ledger.backfillEntry(projectDir, a.filePath, { stage_to: 'done', reason: 'legacy re-run' }),
    'the same original path may be re-backfilled without a false collision',
  );
});

// --- entry-kind + readEntryResult classification primitives ------------------

test('entryKind distinguishes human from pipeline; readEntryResult reports status', () => {
  const h = writePlan('done', 'kind-human', { title: 'H' });
  humanApprove('kind-human', h.content, 'review', 'done');
  assert.equal(ledger.entryKind(ledger.readEntry('kind-human', projectDir)), 'human');

  ledger.writePipelineEntry('kind-pipeline', {
    content_sha256: 'abc', stage_from: 'review', stage_to: 'done', evidence: 'x',
  }, projectDir);
  assert.equal(ledger.entryKind(ledger.readEntry('kind-pipeline', projectDir)), 'pipeline');

  assert.equal(ledger.readEntryResult('kind-human', projectDir).status, 'ok');
  assert.equal(ledger.readEntryResult('never-written', projectDir).status, 'absent');
  assert.equal(ledger.readEntryResult('bad_underscore', projectDir).status, 'unkeyable');

  fs.writeFileSync(path.join(projectDir, '.ctoc', 'approvals', 'broken.json'), 'not json');
  assert.equal(ledger.readEntryResult('broken', projectDir).status, 'corrupt');
});

// ============================================================================
// Z1 — THE HAZARD: the residency sweep REPORTS on an UNMIGRATED project.
//
// The hook is registered on EVERY tool call and calls revertAll unconditionally,
// so on a project that predates the approval ledger the FIRST tool call after a
// plugin update would move and rewrite the entire plan archive. These cases drive
// the REAL main() in a REAL child process (it calls process.exit(0), so it cannot
// run in-process) — the exact path .claude-plugin/hooks.json invokes.
// ============================================================================

const { spawnSync } = require('node:child_process');
const gateMigration = require('../src/lib/gate-migration');

const HOOK_PATH = path.resolve(__dirname, '..', 'src', 'hooks', 'human-gate-check.js');

/** Run the hook's main() in a real child process rooted at projectDir. */
function runSweep(root) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(HOOK_PATH)}).main();`], {
    cwd: root,
    encoding: 'utf8',
  });
}

const atStage = (stage, base) => path.join(projectDir, 'plans', stage, `${base}.md`);

test('Z1: an UNMIGRATED project reports its unledgered done/ plan and does NOT move it', () => {
  const { filePath, content } = writePlan('done', 'legacy-plan', { title: 'Pre-ledger archive' });
  const before = fs.readFileSync(filePath, 'utf8');
  assert.equal(gateMigration.isMigrated(projectDir), false, 'precondition: no migration marker');

  const res = runSweep(projectDir);

  assert.equal(res.status, 0, 'the hook still fails open on the tool call itself');
  assert.equal(fs.existsSync(filePath), true, 'the legacy plan must NOT be moved out of done/');
  assert.equal(fs.readFileSync(filePath, 'utf8'), before,
    'the legacy plan must be BYTE-IDENTICAL — no violation note appended');
  assert.equal(before, content);
  assert.equal(fs.existsSync(atStage('review', 'legacy-plan')), false,
    'nothing may land in review/ on an unmigrated project');

  const pending = gateMigration.readPendingNotice(projectDir);
  assert.ok(pending.some((e) => e.plan === 'legacy-plan.md'),
    'detection is NEVER withheld — the plan must be REPORTED in the pending notice');
  assert.match(res.stderr, /HUMAN GATE VIOLATION/, 'the violation is still printed');
});

test('Z1: the SAME project, once MIGRATED, is enforced exactly as before', () => {
  const { filePath } = writePlan('done', 'legacy-plan', { title: 'Pre-ledger archive' });

  gateMigration.writeMarker(projectDir, {
    migrated: true,
    at: new Date().toISOString(),
    mode: 'verified',
    ledgered: 0,
  });
  const res = runSweep(projectDir);

  assert.equal(res.status, 0);
  assert.equal(fs.existsSync(filePath), false, 'a migrated project still reverts an unledgered resident');
  const moved = atStage('review', 'legacy-plan');
  assert.equal(fs.existsSync(moved), true, 'the plan lands in review/');
  assert.match(fs.readFileSync(moved, 'utf8'), /HUMAN GATE VIOLATION/,
    'the reverted plan carries the violation note, unchanged from today');
});

test('Z1: a TAMPERED plan is reverted even on an UNMIGRATED project (provenance exists and is WRONG)', () => {
  const { filePath, content } = writePlan('done', 'tampered-plan', { title: 'Ledgered then edited' });
  humanApprove('tampered-plan', content, 'review', 'done');
  fs.appendFileSync(filePath, '\nsmuggled line after approval\n');
  // The entry above was written with a WHOLE-FILE digest (`hash_scope: 'file'`), so the
  // tamper classifies as `hash-mismatch-legacy` — the legacy-semantics twin of
  // `hash-mismatch`. What this test is about is unchanged and is asserted below: BOTH
  // mismatch reasons mean "provenance exists and is WRONG", both are outside
  // gate-migration's withheld set (which is exactly `no-ledger-entry`), and both revert
  // on an unmigrated project.
  const reason = gate.checkFolder('done', projectDir)[0].reason;
  assert.equal(reason, 'hash-mismatch-legacy',
    'precondition: the tamper classifies as a hash mismatch, not no-ledger-entry');
  assert.equal(gateMigration.WITHHELD_REASONS.has(reason), false,
    'a hash mismatch of EITHER scope is a live attack signature and is never withheld');
  assert.equal(gateMigration.isMigrated(projectDir), false, 'precondition: unmigrated');

  const res = runSweep(projectDir);

  assert.equal(res.status, 0);
  assert.equal(fs.existsSync(filePath), false,
    'a live attack signature is NEVER withheld — enforcement is unchanged where provenance exists');
  assert.equal(fs.existsSync(atStage('review', 'tampered-plan')), true, 'it reverts to review/');
});

test('Z1: mixed set on an UNMIGRATED project — exactly one moved, exactly one reported', () => {
  const legacy = writePlan('done', 'mixed-legacy', { title: 'No provenance' });
  const tampered = writePlan('done', 'mixed-tampered', { title: 'Wrong provenance' });
  humanApprove('mixed-tampered', tampered.content, 'review', 'done');
  fs.appendFileSync(tampered.filePath, '\ntampered\n');

  const res = runSweep(projectDir);

  assert.equal(res.status, 0);
  assert.equal(fs.existsSync(legacy.filePath), true, 'the no-ledger-entry plan stays put');
  assert.equal(fs.existsSync(tampered.filePath), false, 'the hash-mismatch plan is reverted');
  assert.equal(fs.existsSync(atStage('review', 'mixed-tampered')), true);
  assert.equal(fs.existsSync(atStage('review', 'mixed-legacy')), false);

  const pending = gateMigration.readPendingNotice(projectDir).map((e) => e.plan);
  assert.deepEqual(pending, ['mixed-legacy.md'], 'exactly the withheld plan is reported');
});

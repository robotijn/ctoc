'use strict';

/**
 * Coverage-hardening for src/hooks/human-gate-check.js — the SAFETY-CRITICAL
 * hook that detects human-gate violations and AUTO-REVERTS unapproved plans.
 *
 * These tests target the DARK branches the existing gate suites leave uncovered
 * (measured: lines 123-124, 149-150, 196, 225-227, 392-408, 413-431 and several
 * branch edges inside classifyResidency / isFreshSip1Slice). Each test pins a
 * branch that goes RED under mutation — the exact allow-vs-revert decision, the
 * auto-revert TARGET, the fail-open on infrastructure error, and the fault-
 * isolated revert. NO test doubles: every assertion drives the REAL exported
 * functions against a REAL temp plan tree in os.tmpdir() and a REAL ledger
 * written by the REAL approval-ledger module. main() is exercised end-to-end in
 * a REAL child process (it calls process.exit(0), so it cannot be called
 * in-process without killing the test runner).
 *
 * Overlap avoided: ledger-corrupt / ledger-unkeyable are already covered by
 * tests/gate-hook-revival.test.js; the C4/H7/C5 happy cases by
 * tests/ctoc-audit-w02-s3-gate-acceptance-revert.test.js. This file does not
 * duplicate them — it fills the residual dark set.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ledger = require('../src/lib/approval-ledger');

// --- CWD safety: chdir into an empty sandbox before requiring the hook --------
// The module is guarded by `require.main === module`, so requiring it never runs
// main(); the chdir is belt-and-suspenders matching the established pattern so a
// require-time regression cannot mutate THIS repo's plans.
const originalCwd = process.cwd();
const cwdSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hgc-cov-cwd-'));
process.chdir(cwdSandbox);

const gate = require('../src/hooks/human-gate-check.js');

const MODULE_PATH = path.resolve(__dirname, '..', 'src', 'hooks', 'human-gate-check.js');
const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const tmpDirs = [cwdSandbox];

after(() => {
  process.chdir(originalCwd);
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// --- fixtures ----------------------------------------------------------------

/** Create a fresh sandbox project with all stage folders and an approvals dir. */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hgc-cov-'));
  tmpDirs.push(dir);
  for (const stage of STAGES) fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  return dir;
}

function planBody(extraFm = '') {
  return `---\n${extraFm}title: "Plan"\ntype: feature\n---\n\n# Body\n\nContent.\n`;
}

/** Write a plan into a stage folder; returns {filePath, content, slug}. */
function writePlan(projectDir, stage, slug, extraFm = '') {
  const content = planBody(extraFm);
  const filePath = path.join(projectDir, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(filePath, content);
  return { filePath, content, slug };
}

/** Run the hook's main() in a real child process rooted at projectDir. */
function runMain(projectDir) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(MODULE_PATH)}).main();`], {
    cwd: projectDir,
    encoding: 'utf8',
  });
}

/** Parse the sandbox gate-violations JSONL log into records. */
function readLog(projectDir) {
  const p = path.join(projectDir, '.ctoc', 'logs', 'gate-violations.json');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const inStage = (projectDir, stage, slug) =>
  fs.existsSync(path.join(projectDir, 'plans', stage, `${slug}.md`));

// ============================================================================
// Cluster A — revertPlan creates a MISSING destination folder (lines 123-124)
// Kills a mutant that drops ensureDir's mkdir (writeFileSync would ENOENT) and a
// mutant that skips the violation-note append.
// ============================================================================

test('revertPlan_createsAbsentDestinationFolder_andStampsViolationNote', () => {
  // Arrange — a violating plan in done/, but the revert target review/ is ABSENT.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hgc-revert-'));
  tmpDirs.push(projectDir);
  fs.mkdirSync(path.join(projectDir, 'plans', 'done'), { recursive: true });
  const filePath = path.join(projectDir, 'plans', 'done', 'orphan.md');
  fs.writeFileSync(filePath, planBody());
  assert.equal(fs.existsSync(path.join(projectDir, 'plans', 'review')), false,
    'precondition: the destination folder must not exist yet');

  // Act
  const dest = gate.revertPlan({ path: filePath, folder: 'done', revertTo: 'review' });

  // Assert — the absent folder was created, the plan moved there, source removed,
  // and the reverted copy carries the gate-violation note naming both folders.
  assert.equal(dest, path.join(projectDir, 'plans', 'review', 'orphan.md'));
  assert.equal(fs.existsSync(filePath), false, 'source plan must be removed');
  const moved = fs.readFileSync(dest, 'utf8');
  assert.match(moved, /HUMAN GATE VIOLATION/, 'reverted plan must carry the violation note');
  assert.match(moved, /moved to done\/ without human approval/i);
  assert.match(moved, /reverted to review\//i);
});

// ============================================================================
// Cluster B — classifyResidency 'unreadable' at a hash-sensitive folder
// (lines 149-150 readPlan catch → null, and line 196 the text==null branch).
// A ledgered done/ plan whose file cannot be read must NOT be accepted.
// Kills a mutant that flips 'unreadable' toward accepted.
// ============================================================================

test('classifyResidency_returnsUnreadable_whenLedgeredDonePlanFileVanishes', () => {
  // Arrange — a valid done/ ledger entry, but the plan file is gone from disk.
  const projectDir = makeProject();
  const ghostPath = path.join(projectDir, 'plans', 'done', 'ghost.md');
  ledger.writeEntry('ghost', {
    content_sha256: ledger.computeContentHash(planBody()),
    stage_from: 'review',
    stage_to: 'done',
  }, projectDir);
  assert.equal(fs.existsSync(ghostPath), false, 'precondition: the plan file is absent');

  // Act — content=null forces the module to read the (missing) file itself.
  const verdict = gate.classifyResidency(ghostPath, 'done', projectDir, null);

  // Assert — an unreadable hash-sensitive resident is a violation, reason unreadable.
  assert.deepEqual(verdict, { accepted: false, reason: 'unreadable', kind: 'human' });
});

// ============================================================================
// Cluster C — hasLedgerApproval boolean facade (lines 225-227).
// The facade must mirror classifyResidency.accepted in BOTH directions.
// ============================================================================

test('hasLedgerApproval_isTrue_whenLedgerVouchesForResidency', () => {
  // Arrange
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'done', 'vouched');
  ledger.writeEntry('vouched', {
    content_sha256: ledger.computeContentHash(content),
    stage_from: 'review',
    stage_to: 'done',
  }, projectDir);

  // Act + Assert
  assert.equal(gate.hasLedgerApproval(filePath, 'done', projectDir, content), true);
});

test('hasLedgerApproval_isFalse_whenNoLedgerEntryExists', () => {
  // Arrange — a plan squatting done/ with no ledger entry at all.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'done', 'squatter');

  // Act + Assert — the facade must reject, exactly as classifyResidency does.
  assert.equal(gate.hasLedgerApproval(filePath, 'done', projectDir, content), false);
});

// ============================================================================
// Cluster D — wrong-edge: a ledger entry recorded for ONE gate edge cannot be
// replayed to justify residency at a DIFFERENT gate. Kills the mutant that drops
// the `entry.stage_to !== folderName` guard (gate-replay attack).
// ============================================================================

test('classifyResidency_flagsWrongEdge_whenEntryStageToTargetsAnotherGate', () => {
  // Arrange — plan resides in done/ but its ledger entry is for stage_to=todo.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'done', 'replayed');
  ledger.writeEntry('replayed', {
    content_sha256: ledger.computeContentHash(content),
    stage_from: 'implementation',
    stage_to: 'todo', // recorded for the todo gate, NOT for done
  }, projectDir);

  // Act
  const verdict = gate.classifyResidency(filePath, 'done', projectDir, content);

  // Assert — an entry for the wrong edge is never accepted at this folder.
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'wrong-edge');
});

// ============================================================================
// Cluster E — the todo/ gate is HASH-SENSITIVE and HUMAN-ONLY.
//   E1: a post-approval edit in todo/ (hash diverges) is flagged hash-mismatch
//       — kills the mutant that removes 'todo' from HASH_SENSITIVE_FOLDERS.
//   E2: a PIPELINE-kind entry is rejected at the pre-done todo/ gate
//       — kills the mutant that flips the `folderName !== 'done'` guard, which
//         would let the automated pipeline cross a human-only gate.
// ============================================================================

test('classifyResidency_flagsHashMismatch_whenTodoPlanEditedAfterApproval', () => {
  // Arrange
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'todo', 'edited-todo');
  ledger.writeEntry('edited-todo', {
    content_sha256: ledger.computeContentHash(content),
    stage_from: 'implementation',
    stage_to: 'todo',
  }, projectDir);
  fs.appendFileSync(filePath, '\nsmuggled line after approval\n');
  const live = fs.readFileSync(filePath, 'utf8');

  // Act
  const verdict = gate.classifyResidency(filePath, 'todo', projectDir, live);

  // Assert — invalidate-on-edit holds for todo/, not just done/.
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'hash-mismatch');
});

test('classifyResidency_rejectsPipelineEntry_atHumanOnlyTodoGate', () => {
  // Arrange — a well-formed pipeline entry (with evidence, matching hash) at todo/.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'todo', 'pipe-todo');
  ledger.writePipelineEntry('pipe-todo', {
    content_sha256: ledger.computeContentHash(content),
    stage_from: 'implementation',
    stage_to: 'todo',
    evidence: 'stale-reconciliation',
  }, projectDir);

  // Act
  const verdict = gate.classifyResidency(filePath, 'todo', projectDir, content);

  // Assert — pipeline provenance is NEVER accepted at a pre-done gate.
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'pipeline-not-allowed');
  assert.equal(verdict.kind, 'pipeline');
});

// ============================================================================
// Cluster F — the done/ terminal gate accepts a PIPELINE entry ONLY with
// evidence. Kills the mutants around the evidence guard (lines 208-209) and the
// `folderName !== 'done'` accept path (line 207).
// ============================================================================

test('classifyResidency_acceptsPipelineEntry_atDoneGate_withEvidence', () => {
  // Arrange — a decomposed-vision archive path: pipeline entry + evidence at done/.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'done', 'archived-vision');
  ledger.writePipelineEntry('archived-vision', {
    content_sha256: ledger.computeContentHash(content),
    stage_from: 'vision',
    stage_to: 'done',
    evidence: 'vision-decomposed',
  }, projectDir);

  // Act
  const verdict = gate.classifyResidency(filePath, 'done', projectDir, content);

  // Assert — accepted, and reported honestly as pipeline provenance.
  assert.deepEqual(verdict, { accepted: true, reason: null, kind: 'pipeline' });
});

test('classifyResidency_rejectsPipelineEntry_atDone_whenEvidenceMissing', () => {
  // Arrange — a corrupt pipeline entry with NO evidence. writePipelineEntry refuses
  // to emit this shape, so the malformed record is written straight to the ledger
  // store (the true fs boundary) to exercise the defensive evidence guard.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'done', 'no-evidence');
  const entry = {
    content_sha256: ledger.computeContentHash(content),
    stage_from: 'review',
    stage_to: 'done',
    advanced_by: 'pipeline', // classifies as pipeline...
    // evidence: intentionally absent
  };
  fs.writeFileSync(path.join(projectDir, '.ctoc', 'approvals', 'no-evidence.json'),
    JSON.stringify(entry, null, 2));

  // Act
  const verdict = gate.classifyResidency(filePath, 'done', projectDir, content);

  // Assert — a pipeline entry without evidence is rejected, not laundered through.
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'pipeline-no-evidence');
  assert.equal(verdict.kind, 'pipeline');
});

// ============================================================================
// Cluster G — HONEST KIND on the ACCEPT path (R3-A item 5): a backfilled entry
// is ACCEPTED (the human ordered the migration) but reported as 'backfilled',
// never laundered into 'human'. Kills the mutant that reports 'human'.
// ============================================================================

test('classifyResidency_acceptsBackfilledEntry_butReportsKindBackfilled', () => {
  // Arrange — a legacy plan migrated via the sanctioned backfill helper.
  const projectDir = makeProject();
  const { filePath } = writePlan(projectDir, 'done', 'legacy-migrated');
  ledger.backfillEntry(projectDir, filePath, { stage_to: 'done', reason: 'legacy-adoption' });
  const live = fs.readFileSync(filePath, 'utf8');

  // Act
  const verdict = gate.classifyResidency(filePath, 'done', projectDir, live);

  // Assert — accepted, but the audit-visible kind stays truthful.
  assert.equal(verdict.accepted, true);
  assert.equal(verdict.kind, 'backfilled');
});

// ============================================================================
// Cluster H — the SIP1 exemption boundary (isFreshSip1Slice).
//   H1: the exemption CANNOT fire outside implementation/ (line 248) — a plan
//       carrying parent_plan in todo/ is still flagged. Safety-critical: the
//       exemption must never rescue a squatter in a terminal folder.
//   H2: an empty parent_plan value is NOT a fresh slice (line 255).
//   H3: a plan with parent_plan AND a ledger entry is NOT fresh-exempt (the
//       ledger-absence leg, line 260) — it is evaluated normally.
// ============================================================================

test('isFreshSip1Slice_isFalse_whenParentPlanPlanSitsInTodoFolder', () => {
  // Arrange — parent_plan present, but the plan is in the terminal todo/ folder.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'todo', 'sneaky-slice', 'parent_plan: some-parent\n');

  // Act
  const fresh = gate.isFreshSip1Slice(filePath, 'todo', projectDir, content);

  // Assert — the exemption is confined to implementation/.
  assert.equal(fresh, false);
});

test('isFreshSip1Slice_isFalse_whenParentPlanValueIsEmpty', () => {
  // Arrange — parent_plan present in implementation/ but with an empty value.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'implementation', 'empty-parent', 'parent_plan: ""\n');

  // Act
  const fresh = gate.isFreshSip1Slice(filePath, 'implementation', projectDir, content);

  // Assert — an empty parent_plan is not a real slice linkage.
  assert.equal(fresh, false);
});

test('isFreshSip1Slice_isFalse_whenPlanAlreadyHasLedgerEntry', () => {
  // Arrange — parent_plan present in implementation/, but a ledger entry EXISTS
  // (so it is not a never-crossed-a-gate fresh slice). The entry targets the wrong
  // edge, so normal evaluation must flag it — proving the exemption did not rescue it.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'implementation', 'ledgered-slice', 'parent_plan: real-parent\n');
  ledger.writeEntry('ledgered-slice', {
    content_sha256: ledger.computeContentHash(content),
    stage_from: 'implementation',
    stage_to: 'todo', // present but wrong edge for implementation residency
  }, projectDir);

  // Act
  const fresh = gate.isFreshSip1Slice(filePath, 'implementation', projectDir, content);
  const verdict = gate.classifyResidency(filePath, 'implementation', projectDir, content);

  // Assert — not exempt, and normal evaluation flags the wrong-edge entry.
  assert.equal(fresh, false, 'a ledgered plan is not a fresh, never-crossed slice');
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'wrong-edge');
});

// ============================================================================
// Cluster I — the AUTO-REVERT TARGET map (HUMAN_GATES). Each gate destination
// must revert to its exact source. Kills any mutant that swaps a revert target.
// ============================================================================

test('checkFolder_revertsEachGateDestination_toItsCorrectSource', () => {
  // Arrange — one unapproved squatter in each of the three gate-destination folders.
  const projectDir = makeProject();
  writePlan(projectDir, 'implementation', 'impl-squat'); // no parent_plan, no ledger
  writePlan(projectDir, 'todo', 'todo-squat');
  writePlan(projectDir, 'done', 'done-squat');

  // Act
  const revertTargets = {};
  for (const folder of ['implementation', 'todo', 'done']) {
    const [v] = gate.checkFolder(folder, projectDir);
    assert.ok(v, `a squatter in ${folder}/ must be flagged`);
    revertTargets[folder] = v.revertTo;
  }

  // Assert — the exact inverse of the three gate edges.
  assert.deepEqual(revertTargets, {
    implementation: 'functional',
    todo: 'implementation',
    done: 'review',
  });
  // And the exported map itself is the canonical source of that inverse.
  assert.deepEqual(gate.HUMAN_GATES, {
    implementation: 'functional',
    todo: 'implementation',
    done: 'review',
  });
});

// ============================================================================
// Cluster J0 — loadViolations reads the durable gate-violations store (128).
// VIOLATIONS_FILE is bound at module load to <cwd>/.ctoc/logs/gate-violations.json,
// and this process's cwd is the empty cwdSandbox — so a record written there must
// round-trip through loadViolations. Kills a mutant that returns a constant [].
// ============================================================================

test('loadViolations_readsRecordsFromTheDurableStore', () => {
  // Arrange — write one JSONL record at the module's bound violations path.
  const logPath = path.join(cwdSandbox, '.ctoc', 'logs', 'gate-violations.json');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const rec = { id: 'v-test', plan: 'x.md', status: 'pending_reapproval' };
  fs.writeFileSync(logPath, JSON.stringify(rec) + '\n');

  // Act
  const loaded = gate.loadViolations();

  // Assert — the durable read surfaces the written record.
  assert.ok(Array.isArray(loaded));
  assert.ok(loaded.some((e) => e.id === 'v-test' && e.status === 'pending_reapproval'));
});

// ============================================================================
// Cluster J — main() END-TO-END auto-revert (the core safety behavior), run in
// a real child process because main() calls process.exit(0). An unapproved plan
// in done/ is reverted to review/ and logged as pending reapproval; the hook
// still exits 0 (fail-open on the tool call itself).
// ============================================================================

test('main_revertsUnapprovedDonePlan_toReview_logsPendingReapproval_andExitsZero', () => {
  // Arrange
  const projectDir = makeProject();
  writePlan(projectDir, 'done', 'unapproved-ship');

  // Act
  const res = runMain(projectDir);

  // Assert — reverted to the correct source, logged, and the tool call proceeds.
  assert.equal(res.status, 0, 'the hook must fail-open on the tool call (exit 0)');
  assert.equal(inStage(projectDir, 'done', 'unapproved-ship'), false, 'must leave done/');
  assert.equal(inStage(projectDir, 'review', 'unapproved-ship'), true, 'must land in review/');
  const log = readLog(projectDir);
  const rec = log.find((e) => e.plan === 'unapproved-ship.md');
  assert.ok(rec, 'a violation record must be logged for the reverted plan');
  assert.equal(rec.action, 'REVERTED to review/');
  assert.equal(rec.status, 'pending_reapproval');
});

// ============================================================================
// Cluster K — main() FAULT-ISOLATED revert (lines 392-408). One revert that
// throws must NOT abandon the others; the failing one is logged as revert_failed
// and the sweep reports an INCOMPLETE outcome. A directory named `*.md` forces a
// real EISDIR throw inside revertPlan (readFileSync on a directory).
// ============================================================================

test('main_isolatesRevertFailure_revertsOthers_andLogsIncomplete', () => {
  // Arrange — one normal squatter and one `.md` DIRECTORY (unrevertable) in done/.
  const projectDir = makeProject();
  writePlan(projectDir, 'done', 'good-victim');
  fs.mkdirSync(path.join(projectDir, 'plans', 'done', 'trap.md')); // directory → EISDIR on read

  // Act
  const res = runMain(projectDir);

  // Assert — the good one was still reverted; the trap is recorded as a failure.
  assert.equal(res.status, 0);
  assert.equal(inStage(projectDir, 'review', 'good-victim'), true, 'the healthy plan is still reverted');
  assert.match(res.stderr, /INCOMPLETE/, 'the sweep must report an incomplete outcome');
  const log = readLog(projectDir);
  assert.ok(log.some((e) => e.plan === 'good-victim.md' && e.status === 'pending_reapproval'),
    'the healthy revert is logged pending_reapproval');
  const failed = log.find((e) => e.plan === 'trap.md');
  assert.ok(failed, 'the failed revert must be logged, not silently dropped');
  assert.equal(failed.status, 'revert_failed');
});

// ============================================================================
// Cluster M — revertPlan MUST NOT clobber a resident plan at the destination
// (HIGH: the gate enforcer's own revert destroying legitimate work). A same-
// basename plan reverted from a downstream folder (todo/foo.md, unapproved →
// revertTo implementation) must NOT overwrite a DIFFERENT legitimate
// implementation/foo.md. The collision must be REPORTED in failures[] (a
// surfaced INCOMPLETE outcome), never a silent reverted:1 with the real work
// destroyed. Mirrors actions.movePlan's destination-collision guard.
// ============================================================================

test('revertPlan_refusesToClobber_residentPlanAtDestination_andRecordsFailure', () => {
  // Arrange — legit REAL in-flight work in implementation/, and a planted
  // unapproved squatter of the SAME basename in the downstream todo/ folder.
  const projectDir = makeProject();
  const realPath = path.join(projectDir, 'plans', 'implementation', 'foo.md');
  const realContent = '# REAL in-flight work\n\nDo not destroy me.\n';
  fs.writeFileSync(realPath, realContent);
  writePlan(projectDir, 'todo', 'foo'); // unapproved junk → violation, revertTo implementation

  // Act — the todo/ sweep flags foo.md->implementation; revert them all.
  const violations = gate.checkFolder('todo', projectDir);
  assert.equal(violations.length, 1, 'the unapproved todo/foo.md must be flagged');
  assert.equal(violations[0].revertTo, 'implementation');
  const { reverted, failures } = gate.revertAll(violations);

  // Assert — the collision is a REPORTED failure, not a silent clobber.
  assert.equal(reverted.length, 0, 'a clobbering revert must NOT be reported as reverted');
  assert.equal(failures.length, 1, 'the destination collision must surface in failures[]');
  assert.match(failures[0].error, /would destroy a resident plan/i);

  // And the REAL work is intact, byte-for-byte — never overwritten by the junk.
  assert.equal(fs.readFileSync(realPath, 'utf8'), realContent,
    'the legitimate implementation/foo.md must be preserved unchanged');
});

// ============================================================================
// Cluster N — revertPlan NO-REGRESSION: a normal revert with NO collision at
// the destination still moves the plan back and unlinks the source. And the
// self-path edge (destination === source) does not falsely block.
// ============================================================================

test('revertPlan_stillReverts_whenDestinationHasNoResidentPlan', () => {
  // Arrange — an unapproved squatter in todo/, and an EMPTY implementation/.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'todo', 'lonely');

  // Act
  const dest = gate.revertPlan({ path: filePath, folder: 'todo', revertTo: 'implementation' });

  // Assert — the plan moved back, source removed, note appended.
  assert.equal(dest, path.join(projectDir, 'plans', 'implementation', 'lonely.md'));
  assert.equal(fs.existsSync(filePath), false, 'source plan must be removed');
  const moved = fs.readFileSync(dest, 'utf8');
  assert.ok(moved.startsWith(content), 'the reverted plan preserves its original content');
  assert.match(moved, /HUMAN GATE VIOLATION/, 'reverted plan carries the violation note');
});

test('revertPlan_doesNotFalselyBlock_whenDestinationEqualsSource', () => {
  // Arrange — the pathological self-revert (revertTo === the plan's own folder).
  // The destination path resolves to the source path, so the collision guard must
  // NOT fire; the plan is rewritten in place with the violation note.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(projectDir, 'implementation', 'selfsame');

  // Act — revertTo implementation, where the plan already lives (dest === source).
  const dest = gate.revertPlan({ path: filePath, folder: 'implementation', revertTo: 'implementation' });

  // Assert — no false block; the file survives and gains the note.
  assert.equal(dest, filePath);
  assert.equal(fs.existsSync(filePath), true, 'a self-revert must not destroy the plan');
  const after = fs.readFileSync(filePath, 'utf8');
  assert.ok(after.startsWith(content), 'original content preserved on self-revert');
  assert.match(after, /HUMAN GATE VIOLATION/);
});

// ============================================================================
// Cluster P — the SIP1 exemption requires an APPROVED/LEDGERED PARENT (Gate-1
// residency hole). Before this fix, isFreshSip1Slice exempted ANY implementation/
// plan carrying a non-empty `parent_plan` with no ledger entry of its own — it
// NEVER checked that `parent_plan` named an approved/ledgered parent. Since
// plans/**.md is Edit-whitelisted, an agent could Write
// plans/implementation/x.md containing a lone `parent_plan:` line and squat the
// Gate-1 destination with zero provenance. The exemption must now additionally
// require the parent to resolve to a real ledger entry; a dangling / unapproved /
// nonexistent parent is NOT exempt (fail toward flagging).
// ============================================================================

const flaggedSlugs = (projectDir, stage) =>
  gate.checkFolder(stage, projectDir).map((v) => path.basename(v.path).replace(/\.md$/, ''));

test('isFreshSip1Slice_isFalse_whenParentPlanNamesNonexistentUnledgeredParent', () => {
  // Arrange — a slice in implementation/ whose parent_plan points at a parent that
  // has NO ledger entry and does not exist at all. Under the old predicate this was
  // exempt (a Gate-1 residency bypass); it must now be flagged and reverted.
  const projectDir = makeProject();
  const { filePath, content } = writePlan(
    projectDir, 'implementation', 'orphan-slice', 'parent_plan: nonexistent-parent\n');

  // Act
  const fresh = gate.isFreshSip1Slice(filePath, 'implementation', projectDir, content);
  const flagged = flaggedSlugs(projectDir, 'implementation');

  // Assert — not exempt; the residency sweep records a violation for it.
  assert.equal(fresh, false, 'a dangling/unledgered parent must NOT earn the fresh-slice exemption');
  assert.ok(flagged.includes('orphan-slice'),
    'a slice under a nonexistent, unledgered parent must be flagged, not exempted');
});

test('isFreshSip1Slice_isFalse_whenParentPlanFileExistsButIsNotLedgered', () => {
  // Arrange — the parent plan FILE exists on disk, but it has NO ledger entry (it
  // never crossed Gate 1). A mere sibling file is not provenance; still flagged.
  const projectDir = makeProject();
  writePlan(projectDir, 'implementation', 'real-but-unapproved-parent'); // exists, no ledger
  const { filePath, content } = writePlan(
    projectDir, 'implementation', 'child-slice', 'parent_plan: real-but-unapproved-parent\n');

  // Act
  const fresh = gate.isFreshSip1Slice(filePath, 'implementation', projectDir, content);
  const flagged = flaggedSlugs(projectDir, 'implementation');

  // Assert — an existing-but-unapproved parent is not a valid provenance root.
  assert.equal(fresh, false, 'an existing but unledgered parent must NOT earn the exemption');
  assert.ok(flagged.includes('child-slice'),
    'a slice under an existing-but-unapproved parent must be flagged');
});

test('isFreshSip1Slice_isTrue_whenParentPlanResolvesToAnApprovedLedgeredParent', () => {
  // Arrange — the legitimate case the exemption exists for: a genuine fresh SIP1
  // slice whose parent_plan resolves to a parent that DID cross Gate 1 (a real
  // ledger entry with stage_to=implementation). The slice itself has no entry yet.
  const projectDir = makeProject();
  const { content: parentContent } = writePlan(projectDir, 'implementation', 'approved-parent');
  ledger.writeEntry('approved-parent', {
    content_sha256: ledger.computeContentHash(parentContent),
    stage_from: 'functional',
    stage_to: 'implementation', // the parent crossed Gate 1
  }, projectDir);
  const { filePath, content } = writePlan(
    projectDir, 'implementation', 'approved-parent-s1-slice', 'parent_plan: approved-parent\n');

  // Act
  const fresh = gate.isFreshSip1Slice(filePath, 'implementation', projectDir, content);
  const flagged = flaggedSlugs(projectDir, 'implementation');

  // Assert — STILL exempt (wrongly reverting this would destroy legitimate work),
  // and the sweep does not flag it.
  assert.equal(fresh, true, 'a slice under an approved/ledgered parent stays exempt');
  assert.ok(!flagged.includes('approved-parent-s1-slice'),
    'a genuine fresh slice under an approved parent must NOT be reverted');
});

// ============================================================================
// Cluster L — main() OUTER CATCH fail-open on an INFRASTRUCTURE error
// (lines 413-431). When a gate-destination path is a FILE, readdirSync throws
// ENOTDIR out of checkFolder; main() must swallow it, LOG a sweep_error, and
// still exit 0 — never a silent exit-0 with nothing logged.
// ============================================================================

test('main_failsOpenAndLogsSweepError_whenGateFolderIsAFile', () => {
  // Arrange — plans/done is a FILE, not a directory (implementation/todo absent).
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hgc-infra-'));
  tmpDirs.push(projectDir);
  fs.mkdirSync(path.join(projectDir, 'plans'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'plans', 'done'), 'not a directory');

  // Act
  const res = runMain(projectDir);

  // Assert — fail-open (exit 0) but the swallowed error is durably recorded.
  assert.equal(res.status, 0, 'infrastructure error must fail-open on the tool call');
  assert.match(res.stderr, /infrastructure error \(fail-open\)/i);
  const log = readLog(projectDir);
  const sweepErr = log.find((e) => e.status === 'sweep_error');
  assert.ok(sweepErr, 'the swallowed infrastructure error must be logged, not silently forgotten');
  assert.equal(sweepErr.plan, null);
  assert.match(sweepErr.violation, /infrastructure error/i);
});

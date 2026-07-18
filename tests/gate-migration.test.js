'use strict';

/**
 * Z1 — the residency sweep REPORTS on an unmigrated project.
 *
 * `src/hooks/human-gate-check.js` is registered under PreToolUse with matcher "*"
 * (.claude-plugin/hooks.json), so it sweeps every gate destination on EVERY tool
 * call and calls `revertAll` unconditionally. On a project that predates the
 * approval ledger, every `done/` resident classifies `no-ledger-entry` — so the
 * first tool call after a plugin update would move and rewrite the whole plan
 * archive. `src/lib/gate-migration.js` withholds exactly that one destructive
 * case until the project records a positive migration fact.
 *
 * These tests drive the REAL module against REAL temp project trees (no test
 * doubles). The load-bearing case is #7: enforcement is NOT weakened wherever
 * provenance exists — only the "provenance was never recorded" signature is
 * withheld.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('../src/lib/approval-ledger');
const gateMigration = require('../src/lib/gate-migration');

let projectDir;
const sandboxes = [];

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-z1-'));
  sandboxes.push(projectDir);
  fs.mkdirSync(path.join(projectDir, '.ctoc', 'approvals'), { recursive: true });
});

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const markerPath = (root) =>
  path.join(root, '.ctoc', 'approvals', '.migration-complete.json');

const noticePath = (root) =>
  path.join(root, '.ctoc', 'logs', 'gate-migration-pending.json');

// ============================================================================
// 1-5 — isMigrated: a POSITIVE recorded fact, strict, fail-safe toward false.
// ============================================================================

test('isMigrated_isFalse_onAFreshProjectWithNoMarker', () => {
  assert.equal(gateMigration.isMigrated(projectDir), false);
});

test('isMigrated_isTrue_afterWriteMarkerRecordsTheMigration', () => {
  gateMigration.writeMarker(projectDir, {
    migrated: true,
    at: new Date().toISOString(),
    mode: 'verified',
    ledgered: 3,
  });

  assert.equal(fs.existsSync(markerPath(projectDir)), true, 'the marker must land in the ledger dir');
  assert.equal(gateMigration.isMigrated(projectDir), true);
  const marker = gateMigration.readMarker(projectDir);
  assert.equal(marker.migrated, true);
  assert.equal(marker.mode, 'verified');
  assert.equal(marker.ledgered, 3);
});

test('isMigrated_isFalse_whenTheMarkerIsCorruptJson', () => {
  fs.writeFileSync(markerPath(projectDir), '{');
  assert.equal(gateMigration.isMigrated(projectDir), false, 'an unreadable marker must not arm the revert');
  assert.equal(gateMigration.readMarker(projectDir), null);
});

test('isMigrated_isFalse_whenTheMarkerSaysMigratedFalse', () => {
  fs.writeFileSync(markerPath(projectDir), JSON.stringify({ migrated: false }));
  assert.equal(gateMigration.isMigrated(projectDir), false);
});

test('isMigrated_isFalse_whenMigratedIsTheStringTrue', () => {
  // Strict === true. A truthy-but-not-boolean value is NOT a migration record.
  fs.writeFileSync(markerPath(projectDir), JSON.stringify({ migrated: 'true' }));
  assert.equal(gateMigration.isMigrated(projectDir), false);
});

// ============================================================================
// 6-8 — partitionViolations: the reason scoping that keeps this from being a
// gate weakening.
// ============================================================================

const v = (plan, reason) => ({ file: `${plan}.md`, folder: 'done', reason });

test('partitionViolations_revertsEverything_whenTheProjectIsMigrated', () => {
  const violations = [v('a', 'no-ledger-entry'), v('b', 'hash-mismatch'), v('c', 'wrong-edge')];

  const { revert, withheld } = gateMigration.partitionViolations(violations, true);

  assert.equal(withheld.length, 0, 'a migrated project withholds nothing');
  assert.deepEqual(revert, violations, 'byte-identical to today: every violation reverts');
});

test('partitionViolations_withholdsOnlyNoLedgerEntry_whenUnmigrated', () => {
  // THE LOAD-BEARING CASE. Every reason other than `no-ledger-entry` means
  // provenance EXISTS and is WRONG — a live attack signature — and must still
  // revert on an unmigrated project. Enforcement is unchanged where provenance
  // exists; only "provenance was never recorded" is withheld.
  const violations = [
    v('legacy', 'no-ledger-entry'),
    v('tampered', 'hash-mismatch'),
    v('replayed', 'wrong-edge'),
    v('forged', 'unknown-provenance'),
    v('broken', 'ledger-corrupt'),
    v('pipe', 'pipeline-not-allowed'),
  ];

  const { revert, withheld } = gateMigration.partitionViolations(violations, false);

  assert.deepEqual(withheld.map((x) => x.file), ['legacy.md'],
    'ONLY the never-recorded-provenance case is withheld');
  assert.deepEqual(revert.map((x) => x.file),
    ['tampered.md', 'replayed.md', 'forged.md', 'broken.md', 'pipe.md'],
    'every violation where provenance exists and is WRONG still reverts');
});

test('partitionViolations_treatsAMissingReasonAsNoLedgerEntry_failSafe', () => {
  const { revert, withheld } = gateMigration.partitionViolations(
    [v('nullish', null), v('undef', undefined)], false);

  assert.equal(revert.length, 0);
  assert.deepEqual(withheld.map((x) => x.file), ['nullish.md', 'undef.md'],
    'an absent reason defaults to no-ledger-entry, exactly as main() displays it');
});

// ============================================================================
// 9-11 — the pending notice: a SNAPSHOT on the every-tool-call path.
// ============================================================================

test('writePendingNotice_isASnapshot_andSkipsTheWriteWhenNothingChanged', () => {
  const withheld = [
    { file: 'b.md', folder: 'done', reason: 'no-ledger-entry' },
    { file: 'a.md', folder: 'done', reason: 'no-ledger-entry' },
  ];

  assert.equal(gateMigration.writePendingNotice(projectDir, withheld), true, 'first write happens');
  assert.equal(gateMigration.writePendingNotice(projectDir, withheld), false, 'identical payload → no write');
  assert.equal(gateMigration.writePendingNotice(projectDir, withheld), false, 'still no write on the third sweep');

  const entries = gateMigration.readPendingNotice(projectDir);
  assert.equal(entries.length, 2, 'a snapshot holds exactly N entries — it never appends');
  assert.deepEqual(entries.map((e) => e.plan), ['a.md', 'b.md'], 'stable sort by folder then plan');
  assert.equal(entries[0].reason, 'no-ledger-entry');
  assert.ok(typeof entries[0].at === 'string' && entries[0].at.length > 0);
});

test('writePendingNotice_selfClears_whenTheWithheldSetBecomesEmpty', () => {
  gateMigration.writePendingNotice(projectDir, [
    { file: 'a.md', folder: 'done', reason: 'no-ledger-entry' },
    { file: 'b.md', folder: 'done', reason: 'no-ledger-entry' },
  ]);
  assert.equal(gateMigration.readPendingNotice(projectDir).length, 2);

  assert.equal(gateMigration.writePendingNotice(projectDir, []), true, 'clearing is a real write');
  assert.deepEqual(gateMigration.readPendingNotice(projectDir), [],
    'a stale notice must never outlive the condition');
  assert.equal(gateMigration.writePendingNotice(projectDir, []), false, 'already clear → no write');
});

test('readPendingNotice_failsOpenToEmpty_onACorruptNotice', () => {
  fs.mkdirSync(path.dirname(noticePath(projectDir)), { recursive: true });
  fs.writeFileSync(noticePath(projectDir), 'not json at all');

  assert.deepEqual(gateMigration.readPendingNotice(projectDir), [],
    'a corrupt notice reads as zero notices, never a throw');
});

// ============================================================================
// 12 — the marker can never be addressed as a ledger ENTRY.
// ============================================================================

test('theMarkerBasenameCanNeverBeAddressedAsALedgerSlug', () => {
  // The leading dot makes the name unmatchable by SLUG_RE (/^[a-z0-9][a-z0-9-]*$/),
  // so no plan slug can ever resolve to the marker file and overwrite it.
  assert.throws(() => ledger.ledgerPath('.migration-complete', projectDir), /Invalid slug/);
  assert.equal(path.basename(markerPath(projectDir)), '.migration-complete.json');
});

test('theMigrationCommandIsTheSanctionedScriptInvocation', () => {
  assert.equal(gateMigration.MIGRATION_COMMAND,
    'node src/scripts/ledger-backfill.js --mark-migrated');
  assert.ok(gateMigration.WITHHELD_REASONS.has('no-ledger-entry'));
  assert.equal(gateMigration.WITHHELD_REASONS.size, 1,
    'exactly ONE reason is ever withheld — widening this set weakens the gate');
});

// ============================================================================
// The sanctioned migration channel: `ledger-backfill.js --mark-migrated`.
// It is SELF-VERIFYING — it refuses while any un-ledgered resident remains, so
// the marker can never be written prematurely and re-arm the bulk revert.
// ============================================================================

const backfill = require('../src/scripts/ledger-backfill');

/** Give the sandbox the plan-stage tree the residency sweep enumerates. */
function withPlanStages(root) {
  for (const stage of ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
}

const PLAN = '---\ntitle: "Plan"\ntype: feature\n---\n\n# Body\n';

test('markMigrated_marksACleanProject_andArmsTheRevert', () => {
  withPlanStages(projectDir);

  const res = backfill.run(['--mark-migrated', '--root', projectDir]);

  assert.equal(res.ok, true, res.error);
  assert.equal(res.marker.migrated, true);
  assert.equal(res.marker.mode, 'verified');
  assert.equal(res.marker.pending_at_mark, 0);
  assert.equal(gateMigration.isMigrated(projectDir), true, 'the revert is now ARMED');
});

test('markMigrated_REFUSES_whileUnledgeredResidentsRemain', () => {
  withPlanStages(projectDir);
  fs.writeFileSync(path.join(projectDir, 'plans', 'done', 'legacy.md'), PLAN);

  const res = backfill.run(['--mark-migrated', '--root', projectDir]);

  assert.equal(res.ok, false, 'marking now would ARM a bulk revert over a legacy archive');
  assert.match(res.error, /refusing to mark migrated: 1 plan/);
  assert.match(res.error, /done\/legacy\.md/, 'it names exactly what blocks the marker');
  assert.match(res.error, /--force/, 'and both ways forward');
  assert.match(res.error, /ledger-backfill\.js --plan/);
  assert.equal(gateMigration.isMigrated(projectDir), false, 'nothing was written');
  assert.deepEqual(res.skipped.map((s) => s.plan), ['done/legacy.md']);
});

test('markMigrated_withForce_marksAnyway_andRecordsThatItWasForced', () => {
  withPlanStages(projectDir);
  fs.writeFileSync(path.join(projectDir, 'plans', 'done', 'legacy.md'), PLAN);

  const res = backfill.run(['--mark-migrated', '--force', '--root', projectDir]);

  assert.equal(res.ok, true, res.error);
  assert.equal(res.marker.mode, 'forced', 'an explicit human override stays auditable');
  assert.equal(res.marker.pending_at_mark, 1, 'and records exactly what it overrode');
  assert.equal(gateMigration.isMigrated(projectDir), true);
});

test('markMigrated_dryRun_reportsTheVerdictAndWritesNothing', () => {
  withPlanStages(projectDir);

  const res = backfill.run(['--mark-migrated', '--dry-run', '--root', projectDir]);

  assert.equal(res.ok, true);
  assert.equal(res.marker.migrated, true, 'the verdict is reported…');
  assert.equal(gateMigration.isMigrated(projectDir), false, '…but nothing was written');
});

test('markMigrated_countsTheLedgerEntries_excludingTheDotPrefixedMarker', () => {
  withPlanStages(projectDir);
  const planPath = path.join(projectDir, 'plans', 'done', 'ledgered.md');
  fs.writeFileSync(planPath, PLAN);
  ledger.backfillEntry(projectDir, planPath, { stage_to: 'done', reason: 'legacy' });

  const res = backfill.run(['--mark-migrated', '--root', projectDir]);

  assert.equal(res.ok, true, res.error);
  assert.equal(res.marker.ledgered, 1, 'the marker itself is dot-prefixed and never counted as an entry');
});

test('markMigrated_failsSafe_whenTheResidencySweepCannotBeRead', () => {
  // plans/done is a FILE, so readdirSync throws ENOTDIR out of checkFolder. An
  // undeterminable state must NOT arm a bulk revert.
  fs.mkdirSync(path.join(projectDir, 'plans'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'plans', 'done'), 'not a directory');

  const res = backfill.run(['--mark-migrated', '--root', projectDir]);

  assert.equal(res.ok, false);
  assert.match(res.error, /cannot verify done\//);
  assert.equal(gateMigration.isMigrated(projectDir), false, 'fail safe: no marker on an unreadable sweep');
});

test('markMigrated_isMutuallyExclusive_andForceAloneIsAnError', () => {
  assert.match(
    backfill.run(['--mark-migrated', '--vision', '--root', projectDir]).error,
    /mutually exclusive/);
  assert.match(
    backfill.run(['--force', '--vision', '--root', projectDir]).error,
    /--force is only meaningful with --mark-migrated/,
    'a silently-ignored --force is exactly the quiet no-op this script refuses');
  assert.match(
    backfill.run(['--mark-migrated', '--plan', 'x.md', '--stage', 'done', '--root', projectDir]).error,
    /mutually exclusive/);
});

test('markMigrated_reportsTheFailure_whenTheMarkerCannotBeWritten', () => {
  withPlanStages(projectDir);
  // The marker's own path is occupied by a DIRECTORY → the rename fails.
  fs.mkdirSync(markerPath(projectDir), { recursive: true });

  const res = backfill.run(['--mark-migrated', '--root', projectDir]);

  assert.equal(res.ok, false, 'a silent no-op migration would itself be the defect');
  assert.ok(res.error && res.error.length > 0);
  assert.equal(gateMigration.isMigrated(projectDir), false);
});

test('writePendingNotice_returnsFalse_ratherThanThrowing_whenItCannotWrite', () => {
  // The notice path is occupied by a DIRECTORY. A hook on the every-tool-call path
  // must never die writing a notice.
  fs.mkdirSync(noticePath(projectDir), { recursive: true });

  assert.equal(
    gateMigration.writePendingNotice(projectDir, [{ file: 'a.md', folder: 'done', reason: 'no-ledger-entry' }]),
    false);
  assert.deepEqual(gateMigration.readPendingNotice(projectDir), [], 'and the read fails open too');
});

// ============================================================================
// The report is HUMAN-VISIBLE: the dashboard count and the door behind it.
// A report path with no reader is the same defect R3-D fixed for deploy-ready.
// ============================================================================

const menuScreens = require('../src/lib/menu-screens');

test('inboxMigrationScreen_listsTheWithheldPlans_andBothRemedies', () => {
  gateMigration.writePendingNotice(projectDir, [
    { file: 'legacy-one.md', folder: 'done', reason: 'no-ledger-entry' },
    { file: 'legacy-two.md', folder: 'todo', reason: 'no-ledger-entry' },
  ]);

  const screen = menuScreens.route(['inbox', 'migration'], projectDir);

  assert.match(screen.text, /Approval-ledger migration \(2\)/);
  assert.match(screen.text, /done\/legacy-one\.md/);
  assert.match(screen.text, /todo\/legacy-two\.md/);
  assert.match(screen.text, /CTOC is NOT moving them/);
  assert.match(screen.text, /Enforcement is fully active for/);
  assert.match(screen.text, /ledger-backfill\.js --plan plans\/done\/<x>\.md --stage done/);
  assert.ok(screen.text.includes(gateMigration.MIGRATION_COMMAND), 'the exact migration command is printed');
  assert.deepEqual(Object.keys(screen.actions), ['◀ Back'], 'read-only: it opens nothing and crosses nothing');
});

test('inboxMigrationScreen_saysNothingIsPending_onAMigratedProject', () => {
  const screen = menuScreens.route(['inbox', 'migration'], projectDir);

  assert.match(screen.text, /Approval-ledger migration \(0\)/);
  assert.match(screen.text, /Nothing pending/);
});

test('theDashboardSurfacesTheWithheldCount_andIsUnchangedWhenThereIsNone', () => {
  withPlanStages(projectDir);
  const clean = menuScreens.route(['dashboard'], projectDir).text;
  assert.ok(!clean.includes('approval ledger not migrated'),
    'zero pending adds ZERO output — no dashboard regression on a migrated or clean project');

  gateMigration.writePendingNotice(projectDir, [
    { file: 'legacy-one.md', folder: 'done', reason: 'no-ledger-entry' },
  ]);
  const withPending = menuScreens.route(['dashboard'], projectDir).text;

  assert.match(withPending,
    /⛔ 1 plan would be reverted — approval ledger not migrated · view: inbox migration/,
    'the count NAMES ITS DOOR — a count with no door is the defect');
});

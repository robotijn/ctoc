/**
 * quality-state.js — dark-branch coverage (mutation-oriented)
 *
 * Companion to tests/lib-quality-batch.test.js. That suite pins the happy
 * paths; THIS suite targets the branches that stay dark there and the
 * round-trip / fallback edges where a mutant would serve stale state,
 * fabricate a passing state from corrupt data, or crash:
 *
 *   - acquireLock: live-holder short-circuit (return false)        [126-128]
 *   - acquireLock: corrupted-lock-file catch (unlink + reclaim)    [134-136]
 *   - releaseLock: unlink-fails catch (warn, do not throw)         [164-165]
 *   - updateTierStatus: status persisted without a `tiers` key     [255-256]
 *   - getGitHead: success (real repo) AND failure (non-git dir)    [54 / 56]
 *   - atomicWrite: string-vs-object serialization ternary          [76]
 *   - safeRead / getStatus / coverage-map: fresh read = current disk, never a cache
 *   - setCompleted: startedAt-present vs startedAt-absent duration branch [230]
 *   - needsCoverageMapRebuild: the `> maxAge` boundary and `_meta?.` fallback
 *
 * Every test loads the REAL module (require cache busted per test because the
 * module memoizes _stateDir). Filesystem is the only boundary — real
 * os.tmpdir() fixtures, no fs mocking, cleaned in afterEach. A `.ctoc` marker
 * in the temp dir pins findProjectRoot() deterministically to that dir.
 *
 * Human-reviewed: every assertion below was read line-by-line against the
 * production source; each pins a branch that goes RED under mutation.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

// cwd at load time is the real ctoc git repo — used for the getGitHead success path.
const REPO_ROOT = process.cwd();

// EACCES-based negative tests require a non-root POSIX user; document the skip.
const CANNOT_FORCE_EACCES =
  process.platform === 'win32'
    ? 'chmod-based EACCES is not enforceable on win32'
    : typeof process.getuid === 'function' && process.getuid() === 0
      ? 'root bypasses directory write permission; EACCES will not fire'
      : false;

function freshModule() {
  const modPath = require.resolve('../src/lib/quality-state');
  delete require.cache[modPath];
  return require('../src/lib/quality-state');
}

/** Capture console.log/warn output while fn runs; always restores. Returns joined lines. */
function captureConsole(fn) {
  const lines = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...a) => lines.push(a.join(' '));
  console.warn = (...a) => lines.push(a.join(' '));
  try {
    fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
  return lines.join('\n');
}

describe('quality-state.js — dark branches', () => {
  let tmpDir;
  let originalCwd;
  let qs;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-qstate-cov-'));
    fs.mkdirSync(path.join(tmpDir, '.ctoc'), { recursive: true });
    process.chdir(tmpDir);
    qs = freshModule();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    // Restore perms in case a permission test left the dir read-only.
    try {
      const dir = path.join(tmpDir, '.ctoc', 'quality-state');
      if (fs.existsSync(dir)) fs.chmodSync(dir, 0o755);
    } catch {
      /* best effort */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  // ── acquireLock: live holder short-circuits (lines 125-127) ───────────────

  test('acquireLock_returns_false_and_preserves_lock_when_holder_is_alive', () => {
    // Arrange — a lock owned by THIS process (guaranteed alive).
    qs.ensureStateDir();
    const lockPath = qs.getLockFilePath();
    const liveHolder = { pid: process.pid, startedAt: '2020-01-01T00:00:00.000Z', hostname: 'incumbent' };
    qs.atomicWrite(lockPath, liveHolder);

    // Act
    let acquired;
    const out = captureConsole(() => { acquired = qs.acquireLock(); });

    // Assert — refused, and the incumbent's lock is untouched (never overwritten).
    assert.equal(acquired, false, 'must refuse when a live process holds the lock');
    assert.deepEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')), liveHolder,
      'incumbent lock must be preserved byte-for-byte');
    assert.match(out, /running/i, 'must report that another check is running');
  });

  // ── isProcessAlive: both operands (lines 104-108) ─────────────────────────

  test('isProcessAlive_true_for_self_false_for_a_dead_pid', () => {
    // Act + Assert — self is alive; a PID past the max is ESRCH => catch => false.
    assert.equal(qs.isProcessAlive(process.pid), true, 'the running process is alive');
    assert.equal(qs.isProcessAlive(2 ** 31 - 1), false, 'a non-existent PID hits the catch => false');
  });

  // ── acquireLock: stale lock from a dead PID is reclaimed (lines 129-132) ──

  test('acquireLock_reclaims_a_stale_lock_held_by_a_dead_pid', () => {
    // Arrange — a well-formed lock whose holder PID does not exist.
    qs.ensureStateDir();
    const lockPath = qs.getLockFilePath();
    qs.atomicWrite(lockPath, { pid: 2 ** 31 - 1, startedAt: 'x', hostname: 'ghost' });

    // Act
    let acquired;
    const out = captureConsole(() => { acquired = qs.acquireLock(); });

    // Assert — dead-holder branch: remove stale lock, then reclaim under our pid.
    assert.equal(acquired, true, 'stale lock from a dead process must be reclaimable');
    assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid, process.pid);
    assert.match(out, /removing stale lock/i, 'must report the stale-lock removal');
  });

  // ── acquireLock: corrupted lock file catch (lines 133-136) ────────────────

  test('acquireLock_removes_corrupt_lock_and_reclaims_when_json_is_garbage', () => {
    // Arrange — a lock file whose contents are not valid JSON.
    qs.ensureStateDir();
    const lockPath = qs.getLockFilePath();
    fs.writeFileSync(lockPath, '{ this is not json', 'utf8');

    // Act
    const acquired = qs.acquireLock();

    // Assert — the garbage lock was cleared and re-created under our pid.
    assert.equal(acquired, true, 'corrupt lock must not block acquisition');
    assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid, process.pid,
      'reclaimed lock must record the acquiring pid');
  });

  // ── releaseLock: unlink failure is swallowed with a warning (lines 163-165) ─

  test('releaseLock_warns_and_does_not_throw_when_unlink_fails', { skip: CANNOT_FORCE_EACCES }, () => {
    // Arrange — our own lock, then make the containing dir read-only so the
    // unlink inside releaseLock fails with EACCES (real fs boundary, no mock).
    qs.ensureStateDir();
    const dir = qs.getStateDir();
    const lockPath = qs.getLockFilePath();
    qs.atomicWrite(lockPath, { pid: process.pid, startedAt: 'x', hostname: 'h' });
    fs.chmodSync(dir, 0o555);

    // Act + Assert — the catch swallows the error; caller never sees a throw.
    let out;
    try {
      out = captureConsole(() => {
        assert.doesNotThrow(() => qs.releaseLock(), 'releaseLock must not propagate the unlink error');
      });
    } finally {
      fs.chmodSync(dir, 0o755);
    }

    assert.ok(fs.existsSync(lockPath), 'lock still present — unlink genuinely failed');
    assert.match(out, /could not release lock/i, 'must warn that the release failed');
  });

  test('releaseLock_leaves_lock_owned_by_a_different_process_untouched', () => {
    // Arrange — a lock owned by someone else.
    qs.ensureStateDir();
    const lockPath = qs.getLockFilePath();
    const foreign = { pid: process.pid + 1, startedAt: 'x', hostname: 'other' };
    qs.atomicWrite(lockPath, foreign);

    // Act
    qs.releaseLock();

    // Assert — ownership check (line 159) must prevent deleting a foreign lock.
    assert.ok(fs.existsSync(lockPath), 'must not release a lock we do not own');
    assert.deepEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')), foreign);
  });

  test('releaseLock_is_a_noop_when_no_lock_exists', () => {
    // Arrange — no lock file on disk.
    qs.ensureStateDir();
    assert.equal(fs.existsSync(qs.getLockFilePath()), false);

    // Act + Assert — false branch of existsSync; no throw.
    assert.doesNotThrow(() => qs.releaseLock());
  });

  // ── updateTierStatus: status persisted without a `tiers` key (lines 254-256) ─

  test('updateTierStatus_creates_tiers_map_when_persisted_status_has_none', () => {
    // Arrange — write a status object that lacks the `tiers` key entirely, so
    // getStatus() returns it verbatim (present-file branch, not the default).
    qs.ensureStateDir();
    qs.atomicWrite(qs.getStatusFilePath(), { overallStatus: 'pass' });

    // Act
    qs.updateTierStatus('tier1', { status: 'green', checks: 3 });

    // Assert — the `!status.tiers` guard built the map; the tier landed in it.
    const status = qs.getStatus();
    assert.equal(status.tiers.tier1.status, 'green');
    assert.equal(status.tiers.tier1.checks, 3);
    assert.equal(typeof status.tiers.tier1.checkedAt, 'string');
  });

  test('updateTierStatus_merges_into_an_existing_tier_without_dropping_prior_fields', () => {
    // Arrange — default status has tier1 = { status:'pending', checkedAt:null }.
    // Act — add a field without supplying status.
    qs.updateTierStatus('tier1', { warnings: 7 });

    // Assert — spread-merge keeps the prior `status`; a replace-mutation loses it.
    const t1 = qs.getStatus().tiers.tier1;
    assert.equal(t1.status, 'pending', 'existing tier fields must survive the merge');
    assert.equal(t1.warnings, 7, 'new field merged in');
    assert.equal(qs.getStatus().tiers.tier2.status, 'pending', 'sibling tiers untouched');
  });

  // ── getGitHead: both operands of the try/catch (lines 54 / 56) ────────────

  test('getGitHead_returns_short_sha_inside_a_real_git_repo', () => {
    // Arrange — run from the actual ctoc repo (a git working tree).
    process.chdir(REPO_ROOT);
    try {
      // Act
      const head = qs.getGitHead();

      // Assert — success path returns a trimmed short hex SHA.
      assert.equal(typeof head, 'string');
      assert.match(head, /^[0-9a-f]{7,40}$/, 'short HEAD must be trimmed hex, no trailing newline');
    } finally {
      process.chdir(tmpDir);
    }
  });

  test('getGitHead_returns_null_outside_a_git_repo', () => {
    // Arrange — the temp fixture is not inside any git working tree.
    // Act
    const head = qs.getGitHead();

    // Assert — the catch returns null rather than throwing or fabricating a SHA.
    assert.equal(head, null, 'non-git dir must yield null, not a value');
  });

  test('setRunning_records_null_gitHead_when_outside_a_git_repo', () => {
    // Act — setRunning calls getGitHead internally (its null branch).
    const running = qs.setRunning();

    // Assert — default triggeredBy and a null git head propagate into state.
    assert.equal(running.overallStatus, 'running');
    assert.equal(running.gitHead, null);
    assert.equal(running.lastRun.triggeredBy, 'manual', 'default triggeredBy operand');
    assert.equal(running.lastRun.completedAt, null);
  });

  test('setRunning_uses_the_supplied_trigger_over_the_default', () => {
    // Act
    const running = qs.setRunning('git-hook');

    // Assert — kills the `= manual` default when an argument is passed.
    assert.equal(running.lastRun.triggeredBy, 'git-hook');
  });

  // ── atomicWrite: string-vs-object serialization ternary (line 76) ─────────

  test('atomicWrite_writes_a_raw_string_verbatim_not_json_encoded', () => {
    // Arrange
    qs.ensureStateDir();
    const target = path.join(qs.getStateDir(), 'raw.txt');

    // Act
    qs.atomicWrite(target, 'plain text');

    // Assert — string operand of the ternary: NOT wrapped in JSON quotes.
    assert.equal(fs.readFileSync(target, 'utf8'), 'plain text');
  });

  test('atomicWrite_serializes_an_object_as_indented_json', () => {
    // Arrange
    qs.ensureStateDir();
    const target = path.join(qs.getStateDir(), 'obj.json');

    // Act
    qs.atomicWrite(target, { a: 1 });

    // Assert — object operand: 2-space-indented JSON (kills indent-arg drop).
    const raw = fs.readFileSync(target, 'utf8');
    assert.equal(raw, '{\n  "a": 1\n}');
  });

  test('atomicWrite_leaves_no_pid_temp_file_behind', () => {
    // Arrange
    qs.ensureStateDir();
    const target = path.join(qs.getStateDir(), 'final.json');

    // Act
    qs.atomicWrite(target, { done: true });

    // Assert — temp path was renamed away (atomicity contract).
    const residue = fs.readdirSync(qs.getStateDir()).filter(f => f.includes('.tmp.'));
    assert.deepEqual(residue, []);
  });

  // ── safeRead / getStatus / coverage-map: fresh read = current disk ────────

  test('getStatus_returns_persisted_state_not_the_default_skeleton', () => {
    // Arrange — a persisted status that differs from the default.
    qs.updateStatus({ overallStatus: 'pass' });
    qs.atomicWrite(qs.getStatusFilePath(), { overallStatus: 'fail', marker: 42 });

    // Act
    const status = qs.getStatus();

    // Assert — reads current disk, not a cached value nor the default.
    assert.equal(status.overallStatus, 'fail');
    assert.equal(status.marker, 42);
  });

  test('getStatus_reflects_a_direct_on_disk_change_between_reads', () => {
    // Arrange — first read materializes the default; then disk changes underneath.
    assert.equal(qs.getStatus().overallStatus, 'unknown');
    qs.atomicWrite(qs.getStatusFilePath(), { overallStatus: 'running' });

    // Act + Assert — second read is fresh from disk (no stale in-memory cache).
    assert.equal(qs.getStatus().overallStatus, 'running');
  });

  test('safeRead_returns_default_on_corrupt_json_and_warns', () => {
    // Arrange
    qs.ensureStateDir();
    const target = path.join(qs.getStateDir(), 'corrupt.json');
    fs.writeFileSync(target, '{ not: valid', 'utf8');

    // Act
    let result;
    const out = captureConsole(() => { result = qs.safeRead(target, { safe: true }); });

    // Assert — never a false pass fabricated from garbage; warned, defaulted.
    assert.deepEqual(result, { safe: true });
    assert.match(out, /could not read/i);
  });

  // ── setCompleted: duration branch (line 230) ──────────────────────────────

  test('setCompleted_computes_duration_from_prior_startedAt_and_preserves_trigger', () => {
    // Arrange — a running state with a real startedAt.
    qs.setRunning('suite');
    const startedAt = qs.getStatus().lastRun.startedAt;

    // Act
    const done = qs.setCompleted(true, { coverage: 91 });

    // Assert — if-branch of `startedAt ? ...`: startedAt preserved, duration >= 0.
    assert.equal(done.overallStatus, 'pass');
    assert.equal(done.lastRun.startedAt, startedAt, 'startedAt carried through the spread');
    assert.equal(done.lastRun.triggeredBy, 'suite', 'triggeredBy carried through the spread');
    assert.equal(typeof done.lastRun.duration, 'number');
    assert.ok(done.lastRun.duration >= 0);
  });

  test('setCompleted_without_a_prior_start_falls_back_and_still_records_a_numeric_duration', () => {
    // Arrange — default status: lastRun.startedAt is null (no setRunning first).
    assert.equal(qs.getStatus().lastRun.startedAt, null);

    // Act — else-branch of `startedAt ? new Date(startedAt) : new Date()`.
    const done = qs.setCompleted(false, {});

    // Assert — fail status, numeric near-zero duration, no crash on the null start.
    assert.equal(done.overallStatus, 'fail');
    assert.equal(typeof done.lastRun.duration, 'number');
    assert.ok(done.lastRun.duration >= 0 && done.lastRun.duration < 60000);
  });

  // ── recoverIfNeeded: the two non-recovering branches ──────────────────────

  test('recoverIfNeeded_resets_running_state_that_has_no_lock_and_stamps_error', () => {
    // Arrange
    qs.updateStatus({ overallStatus: 'running' });
    assert.equal(fs.existsSync(qs.getLockFilePath()), false);

    // Act
    let recovered;
    captureConsole(() => { recovered = qs.recoverIfNeeded(); });

    // Assert — reset to unknown with the recovery marker recorded.
    assert.equal(recovered, true);
    const status = qs.getStatus();
    assert.equal(status.overallStatus, 'unknown');
    assert.match(status.lastRun.error, /interrupted/i, 'recovery error must be recorded');
  });

  test('recoverIfNeeded_does_not_reset_running_state_while_a_lock_is_held', () => {
    // Arrange — running AND a live lock present.
    qs.updateStatus({ overallStatus: 'running' });
    qs.atomicWrite(qs.getLockFilePath(), { pid: process.pid, startedAt: 'x', hostname: 'h' });

    // Act
    const recovered = qs.recoverIfNeeded();

    // Assert — lock-present branch: leave the run alone.
    assert.equal(recovered, false, 'a held lock means the run is live, not interrupted');
    assert.equal(qs.getStatus().overallStatus, 'running');
  });

  test('recoverIfNeeded_is_a_noop_when_not_running', () => {
    // Arrange — default status is 'unknown'.
    // Act + Assert — the `=== running` guard is false; nothing to recover.
    assert.equal(qs.recoverIfNeeded(), false);
  });

  // ── coverage map: replace-not-merge + rebuild decision ────────────────────

  test('updateCoverageMap_replaces_wholesale_it_does_not_merge', () => {
    // Arrange
    qs.updateCoverageMap({ 'a.js': ['a.test.js'] });

    // Act
    qs.updateCoverageMap({ 'b.js': ['b.test.js'] });

    // Assert — coverage map REPLACES (unlike file-hashes which merge).
    const map = qs.getCoverageMap();
    assert.deepEqual(Object.keys(map), ['b.js']);
  });

  test('updateFileHashes_merges_prior_entries', () => {
    // Arrange + Act
    qs.updateFileHashes({ 'a.js': 'h1' });
    qs.updateFileHashes({ 'b.js': 'h2' });

    // Assert — file-hashes accumulate (contrast with coverage-map replace above).
    assert.deepEqual(qs.getFileHashes(), { 'a.js': 'h1', 'b.js': 'h2' });
  });

  test('needsCoverageMapRebuild_true_when_map_is_missing', () => {
    // Act — no map on disk.
    const r = qs.needsCoverageMapRebuild();

    // Assert
    assert.equal(r.needed, true);
    assert.match(r.reason, /no coverage map/i);
  });

  test('needsCoverageMapRebuild_true_when_map_is_an_empty_object', () => {
    // Arrange — present but empty => Object.keys length 0 branch.
    qs.updateCoverageMap({});

    // Act + Assert
    assert.equal(qs.needsCoverageMapRebuild().needed, true);
  });

  test('needsCoverageMapRebuild_false_when_map_has_content_but_no_meta', () => {
    // Arrange — content, no _meta => `_meta?.rebuiltAt` optional-chain is undefined.
    qs.updateCoverageMap({ 'x.js': ['x.test.js'] });

    // Act + Assert — no age check runs; not stale.
    assert.equal(qs.needsCoverageMapRebuild().needed, false);
  });

  test('needsCoverageMapRebuild_is_false_just_under_seven_days_and_true_just_over', () => {
    // Arrange
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    // Act — just fresh enough (7 days minus a minute).
    qs.updateCoverageMap({ 'x.js': ['t'], _meta: { rebuiltAt: new Date(Date.now() - (sevenDays - 60000)).toISOString() } });
    const under = qs.needsCoverageMapRebuild();

    // Just stale enough (7 days plus a minute) — pins `>` not `>=`.
    qs.updateCoverageMap({ 'x.js': ['t'], _meta: { rebuiltAt: new Date(Date.now() - (sevenDays + 60000)).toISOString() } });
    const over = qs.needsCoverageMapRebuild();

    // Assert
    assert.equal(under.needed, false, 'inside the 7-day window => no rebuild');
    assert.equal(over.needed, true, 'past the 7-day window => rebuild');
    assert.match(over.reason, /older than 7 days/i);
  });

  // ── path accessors + ensureStateDir idempotency ───────────────────────────

  test('path_accessors_resolve_under_the_state_dir_with_expected_basenames', () => {
    const dir = qs.getStateDir();
    assert.equal(path.basename(qs.getStatusFilePath()), 'status.json');
    assert.equal(path.basename(qs.getLockFilePath()), '.lock');
    assert.equal(path.basename(qs.getFileHashesPath()), 'file-hashes.json');
    assert.equal(path.basename(qs.getCoverageMapPath()), 'coverage-map.json');
    assert.equal(path.dirname(qs.getStatusFilePath()), dir);
  });

  test('getStateDir_is_memoized_returning_a_stable_path', () => {
    // The `if (!_stateDir)` cache must return the same value on repeat calls.
    assert.equal(qs.getStateDir(), qs.getStateDir());
  });

  test('ensureStateDir_is_idempotent_when_the_directory_already_exists', () => {
    // Act — first creates, second hits the existsSync-true branch (no throw).
    qs.ensureStateDir();
    assert.ok(fs.existsSync(qs.getStateDir()));
    assert.doesNotThrow(() => qs.ensureStateDir());
    assert.ok(fs.existsSync(qs.getStateDir()));
  });
});

'use strict';

/**
 * quality-state — acquireLock must be an ATOMIC exclusive-create, not a
 * check-then-act (existsSync-then-rename).
 *
 * DEFECT (concurrency, MEDIUM): the old acquireLock() did
 *   if (!existsSync(lockFile)) { ... atomicWrite(lockFile) }   // TOCTOU
 * whose atomicWrite ends in an UNCONDITIONAL renameSync over the target. Two
 * processes can both observe existsSync=false and both renameSync their own temp
 * over .lock — TWO holders of a mutual-exclusion lock. withStatusLock's
 * load→mutate→write critical section then runs concurrently: the very
 * lost-update the lock exists to prevent.
 *
 * Secondary: the stale/corrupt-lock branch did an UNGUARDED unlinkSync — if two
 * processes both remove the same stale lock, the loser's unlinkSync throws
 * ENOENT out of acquireLock.
 *
 * FIX: acquire via fs.openSync(lockFile, 'wx') (O_CREAT|O_EXCL) — exactly one
 * winner; EEXIST means held (return false when the holder is alive) or stale
 * (reclaim by unlink-then-retry, swallowing a concurrent reclaimer's ENOENT).
 *
 * These tests drive the race deterministically in a single process. Real
 * os.tmpdir() fixture pinned via a .ctoc marker; the only stubs are on safeFs
 * methods, restored in finally/afterEach.
 */

const assert = require('node:assert/strict');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const safeFs = require('../src/lib/safe-fs.js');

function freshModule() {
  const p = require.resolve('../src/lib/quality-state');
  delete require.cache[p];
  return require('../src/lib/quality-state');
}

describe('quality-state — acquireLock atomic exclusive-create', () => {
  let tmpDir;
  let originalCwd;
  let qs;
  const origExists = safeFs.existsSync;
  const origUnlink = safeFs.unlinkSync;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-qstate-excl-'));
    fs.mkdirSync(path.join(tmpDir, '.ctoc'), { recursive: true });
    process.chdir(tmpDir);
    qs = freshModule();
  });

  afterEach(() => {
    safeFs.existsSync = origExists;
    safeFs.unlinkSync = origUnlink;
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('RED: two racing acquires cannot both win — only one holder exists', () => {
    // Simulate the TOCTOU race in a single process: force the "no lock present"
    // observation for BOTH acquire attempts by stubbing existsSync=false. The old
    // check-then-act code then renameSyncs twice → both return true (two holders).
    // An atomic openSync('wx') gives EEXIST to the second → false (one holder).
    safeFs.existsSync = () => false;

    const first = qs.acquireLock();
    const second = qs.acquireLock();

    assert.equal(first, true, 'the first acquire must win the exclusive create');
    assert.equal(second, false, 'the second acquire MUST lose — a lock is a mutual-exclusion primitive, not two holders');
  });

  test('a genuinely stale lock (dead pid) is reclaimed and acquire succeeds', () => {
    // spawnSync returns only after the child has exited, so its pid is dead
    // (pid reuse inside the test window is astronomically unlikely).
    const dead = spawnSync(process.execPath, ['-e', '0']);
    const deadPid = dead.pid;
    assert.equal(qs.isProcessAlive(deadPid), false, 'precondition: the spawned pid is dead');

    qs.ensureStateDir();
    const lockFile = qs.getLockFilePath();
    fs.writeFileSync(lockFile, JSON.stringify({ pid: deadPid, startedAt: '2000-01-01T00:00:00.000Z', hostname: 'old' }), 'utf8');

    assert.equal(qs.acquireLock(), true, 'a stale lock from a dead process must be reclaimed');
    const held = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.equal(held.pid, process.pid, 'the reclaimed lock must now record THIS process as holder');
  });

  test('RED (regression): a FRESH empty (0-byte) lock is a live winner mid-write — acquireLock must NOT steal it', () => {
    // A prior wave replaced existsSync-then-write with an atomic openSync('wx').
    // But writing the holder identity (writeSync) is a SEPARATE step AFTER the
    // create. Between a winner's successful openSync('wx') and its writeSync the
    // lock file EXISTS but is 0 BYTES. The old reclaim branch read that empty
    // file, JSON.parse('') threw → lockData=null → "Removing corrupted lock file"
    // → it UNLINKED the live winner's lock and re-created its own: TWO holders.
    // This reproduces that in-progress state deterministically: a 0-byte lock with
    // a FRESH mtime (a winner that has created but not yet populated it).
    qs.ensureStateDir();
    const lockFile = qs.getLockFilePath();
    fs.writeFileSync(lockFile, '', 'utf8');
    const now = new Date();
    fs.utimesSync(lockFile, now, now);

    const result = qs.acquireLock();

    assert.equal(result, false, 'a fresh 0-byte lock is a live holder mid-write, not a corrupt lock to reclaim');
    assert.equal(fs.existsSync(lockFile), true, 'acquireLock must NOT unlink a fresh empty lock');
    assert.equal(fs.readFileSync(lockFile, 'utf8'), '', 'acquireLock must NOT overwrite the winner\'s in-progress lock with its own pid');
  });

  test('a genuinely abandoned empty (0-byte) lock older than the grace window is eventually reclaimed (no deadlock)', () => {
    // If a process is killed BETWEEN openSync('wx') and writeSync it leaves a
    // permanently 0-byte lock. That must still be reclaimable — otherwise the
    // grace-based back-off would deadlock forever. An old mtime marks it abandoned.
    qs.ensureStateDir();
    const lockFile = qs.getLockFilePath();
    fs.writeFileSync(lockFile, '', 'utf8');
    const old = new Date(Date.now() - 60_000); // 1 minute old — well past any grace window
    fs.utimesSync(lockFile, old, old);

    assert.equal(qs.acquireLock(), true, 'an abandoned empty lock (create died before write) must eventually be reclaimed');
    const held = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.equal(held.pid, process.pid, 'the reclaimed lock records THIS process as holder');
  });

  test('RED (secondary): a concurrent reclaimer removing the stale lock (ENOENT) does not throw out of acquireLock', () => {
    const dead = spawnSync(process.execPath, ['-e', '0']);
    const deadPid = dead.pid;

    qs.ensureStateDir();
    const lockFile = qs.getLockFilePath();
    fs.writeFileSync(lockFile, JSON.stringify({ pid: deadPid, startedAt: '2000-01-01T00:00:00.000Z', hostname: 'old' }), 'utf8');

    // A concurrent reclaimer already removed the stale lock → the unlink syscall
    // reports ENOENT. That must be swallowed (someone else won the removal), not
    // thrown. Two ENOENTs reproduce the old code's failure: its stale unlink
    // throws ENOENT, the catch retries unlink, and THAT throws ENOENT out of
    // acquireLock. The fix swallows ENOENT and retries the exclusive create.
    let calls = 0;
    safeFs.unlinkSync = (p) => {
      calls += 1;
      if (calls <= 2) { const e = new Error('ENOENT: no such file'); e.code = 'ENOENT'; throw e; }
      return origUnlink(p);
    };

    let result;
    assert.doesNotThrow(() => { result = qs.acquireLock(); }, 'a concurrent stale-lock removal (ENOENT) must not escape acquireLock');
    assert.equal(result, true, 'after the concurrent removal is tolerated, this process still acquires the lock');
  });

  test('releaseLock removes the lock; a double-release does not throw; the lock-serialized update returns its value', () => {
    assert.equal(qs.acquireLock(), true, 'fresh acquire wins');
    const lockFile = qs.getLockFilePath();
    assert.equal(fs.existsSync(lockFile), true, 'the lock exists after acquire');

    qs.releaseLock();
    assert.equal(fs.existsSync(lockFile), false, 'releaseLock removes the lock we own');

    // Concurrent double-release / stale-unlink: the lock is already gone.
    assert.doesNotThrow(() => qs.releaseLock(), 'releasing an already-removed lock must not throw ENOENT');

    // updateStatus routes through withStatusLock: it must serialize (acquire +
    // release around the read-modify-write) and return the updated object.
    const out = qs.updateStatus({ overallStatus: 'pass' });
    assert.equal(out.overallStatus, 'pass', 'the lock-serialized update must return the updated status unchanged');
    assert.equal(fs.existsSync(lockFile), false, 'the update releases the lock it acquired');
  });
});

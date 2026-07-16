'use strict';

/**
 * quality-state — the mutating wrappers must serialize their read-modify-write
 * under the module's OWN lock (lost-update fix).
 *
 * The module header advertises "Lockfile with PID for concurrency" and the module
 * HAS acquireLock()/releaseLock(), but the mutating wrappers (updateStatus,
 * updateTierStatus, updateFileHashes) did getStatus() → mutate → atomicWrite()
 * WITHOUT holding the lock, so two interleaved writers clobber each other (a
 * failing tier result is lost). The fix wraps each read-modify-write in
 * acquireLock()/releaseLock() (try/finally) so the load→mutate→write is
 * serialized, and is re-entrancy-safe: when this process already holds the lock
 * (as the quality runner does around the whole run) the nested update runs
 * WITHOUT re-acquiring and WITHOUT releasing the outer lock.
 *
 * Deterministic structural proof (in-process, single pid): a spy on
 * safeFs.writeFileSync records whether the .lock file exists at the instant the
 * status / file-hashes file is written. Under the old code no lock is ever held
 * during the write (RED); under the fix the lock is held (GREEN) and released
 * afterward. Real os.tmpdir() fixture pinned via a .ctoc marker; the only stub is
 * the writeFileSync spy, restored in finally/afterEach.
 */

const assert = require('node:assert/strict');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const safeFs = require('../src/lib/safe-fs.js');

function freshModule() {
  const p = require.resolve('../src/lib/quality-state');
  delete require.cache[p];
  return require('../src/lib/quality-state');
}

describe('quality-state — lock-serialized read-modify-write', () => {
  let tmpDir;
  let originalCwd;
  let qs;
  const origWrite = safeFs.writeFileSync;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-qstate-lock-'));
    fs.mkdirSync(path.join(tmpDir, '.ctoc'), { recursive: true });
    process.chdir(tmpDir);
    qs = freshModule();
  });

  afterEach(() => {
    safeFs.writeFileSync = origWrite;
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  /**
   * Run `fn`; return whether the .lock file existed at the moment the file whose
   * path contains `targetBasename` was written. The lock file itself is '.lock'
   * (never contains 'status.json'/'file-hashes.json'), so its own write does not
   * trip the probe.
   */
  function lockHeldWhenWriting(targetBasename, fn) {
    const lockFile = qs.getLockFilePath();
    let held = null;
    safeFs.writeFileSync = (p, ...rest) => {
      if (String(p).includes(targetBasename)) held = fs.existsSync(lockFile);
      return origWrite(p, ...rest);
    };
    try { fn(); } finally { safeFs.writeFileSync = origWrite; }
    return held;
  }

  test('updateStatus holds the lock while persisting status.json, then releases it', () => {
    const held = lockHeldWhenWriting('status.json', () => qs.updateStatus({ overallStatus: 'pass' }));
    assert.equal(held, true, 'the lock MUST be held during the status write so load->mutate->write cannot interleave');
    assert.equal(fs.existsSync(qs.getLockFilePath()), false, 'the lock must be released after a standalone update');
  });

  test('updateTierStatus holds the lock while persisting status.json, then releases it', () => {
    const held = lockHeldWhenWriting('status.json', () => qs.updateTierStatus('tier1', { status: 'fail' }));
    assert.equal(held, true, 'a tier update must serialize its read-modify-write under the lock');
    assert.equal(fs.existsSync(qs.getLockFilePath()), false, 'the lock must be released after the update');
  });

  test('updateFileHashes holds the lock while persisting file-hashes.json, then releases it', () => {
    const held = lockHeldWhenWriting('file-hashes.json', () => qs.updateFileHashes({ 'a.js': 'deadbeef' }));
    assert.equal(held, true, 'a file-hashes update must serialize its read-modify-write under the lock');
    assert.equal(fs.existsSync(qs.getLockFilePath()), false, 'the lock must be released after the update');
  });

  test('a nested update inside an already-held lock persists AND preserves the outer lock (re-entrancy safe)', () => {
    // This mirrors quality-agent: it acquires the lock, then calls the wrappers
    // inside the held lock. The nested update must NOT release the outer lock.
    assert.equal(qs.acquireLock(), true, 'the outer acquire should succeed on a fresh state dir');
    const lockFile = qs.getLockFilePath();
    assert.ok(fs.existsSync(lockFile), 'the outer lock exists');

    qs.updateTierStatus('tier2', { status: 'pass' });

    assert.equal(fs.existsSync(lockFile), true, 'a nested update must not release the outer lock');
    assert.equal(qs.getStatus().tiers.tier2.status, 'pass', 'the nested update must still persist');

    qs.releaseLock();
    assert.equal(fs.existsSync(lockFile), false, 'the outer holder releases cleanly');
  });

  test('two sequential updates each land — serialization does not drop the first result', () => {
    // The lost-update scenario the fix closes: distinct tier writes must both
    // survive. With the load now inside the lock, the second update reads the
    // first committed result before mutating.
    qs.updateTierStatus('tier1', { status: 'fail' });
    qs.updateTierStatus('tier2', { status: 'pass' });
    const status = qs.getStatus();
    assert.equal(status.tiers.tier1.status, 'fail', 'the first tier result must survive the second update');
    assert.equal(status.tiers.tier2.status, 'pass', 'the second tier result must be recorded');
  });
});

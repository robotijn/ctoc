/**
 * Agent Lock Tests
 * Unit tests for lib/agent-lock.js — PID + agentId based lock module
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('node:child_process');
const { test, describe, beforeEach, afterEach } = require('node:test');

const AGENT_LOCK_MODULE = path.resolve(__dirname, '../src/lib/agent-lock.js');

const {
  acquireLock,
  releaseLock,
  updateLockPlan,
  readLock,
  isLocked,
  requestStop,
  isStopRequested,
  clearStop,
  isPidAlive,
  getLockPath,
  getStopPath
} = require('../src/lib/agent-lock');

describe('Agent Lock Tests', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-lock-test-'));
    fs.mkdirSync(path.join(testDir, '.ctoc'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('acquireLock — acquires lock when none exists', () => {
    const result = acquireLock(testDir, 'my-plan');

    assert.strictEqual(result.acquired, true, 'Should acquire lock');
    assert.ok(result.agentId, 'Should return agentId');

    // Verify lock file contents
    const lock = readLock(testDir);
    assert.strictEqual(lock.pid, process.pid, 'Lock should contain current PID');
    assert.strictEqual(lock.plan, 'my-plan', 'Lock should contain plan name');
    assert.ok(lock.startedAt, 'Lock should have startedAt');
    assert.strictEqual(lock.agentId, result.agentId, 'Lock agentId should match returned agentId');
  });

  test('acquireLock — rejects when live lock exists', () => {
    // First acquire (with current PID which is guaranteed alive)
    const first = acquireLock(testDir, 'plan-a');
    assert.strictEqual(first.acquired, true);

    // Second acquire should fail
    const second = acquireLock(testDir, 'plan-b');
    assert.strictEqual(second.acquired, false, 'Should reject second acquire');
    assert.ok(second.error.includes('already active'), 'Error should mention already active');
    assert.ok(second.existingLock, 'Should return existing lock');
    assert.strictEqual(second.existingLock.plan, 'plan-a', 'Existing lock should have first plan');
  });

  test('acquireLock — clears stale lock and acquires', () => {
    // Write a lock with a dead PID
    const lockPath = getLockPath(testDir);
    const staleLock = {
      pid: 999999999,
      agentId: 'stale-id',
      plan: 'stale-plan',
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2));

    // Acquire should succeed because PID is dead
    const result = acquireLock(testDir, 'new-plan');
    assert.strictEqual(result.acquired, true, 'Should acquire after clearing stale lock');

    // Verify new lock is written
    const lock = readLock(testDir);
    assert.strictEqual(lock.plan, 'new-plan', 'Lock should have new plan');
    assert.strictEqual(lock.pid, process.pid, 'Lock should have current PID');
    assert.notStrictEqual(lock.agentId, 'stale-id', 'Should have a new agentId');
  });

  test('releaseLock — removes lock and stop files', () => {
    // Create both lock and stop files
    acquireLock(testDir, 'plan-a');
    requestStop(testDir);

    assert.ok(fs.existsSync(getLockPath(testDir)), 'Lock file should exist');
    assert.ok(fs.existsSync(getStopPath(testDir)), 'Stop file should exist');

    releaseLock(testDir);

    assert.ok(!fs.existsSync(getLockPath(testDir)), 'Lock file should be removed');
    assert.ok(!fs.existsSync(getStopPath(testDir)), 'Stop file should be removed');
  });

  test('releaseLock — no error when no lock exists', () => {
    // Should not throw on empty directory
    assert.doesNotThrow(() => {
      releaseLock(testDir);
    }, 'releaseLock should not throw when no lock exists');
  });

  test('updateLockPlan — updates plan name in lock', () => {
    acquireLock(testDir, 'plan-a');

    updateLockPlan(testDir, 'plan-b');

    const lock = readLock(testDir);
    assert.strictEqual(lock.plan, 'plan-b', 'Plan should be updated to plan-b');
    assert.strictEqual(lock.pid, process.pid, 'PID should be unchanged');
  });

  test('isLocked — returns locked for live PID', () => {
    acquireLock(testDir, 'plan-a');

    const result = isLocked(testDir);
    assert.strictEqual(result.locked, true, 'Should report locked');
    assert.ok(result.lock, 'Should include lock data');
    assert.strictEqual(result.lock.plan, 'plan-a');
  });

  test('isLocked — returns stale for dead PID', () => {
    const lockPath = getLockPath(testDir);
    const staleLock = {
      pid: 999999999,
      agentId: 'dead-agent',
      plan: 'dead-plan',
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2));

    const result = isLocked(testDir);
    assert.strictEqual(result.locked, false, 'Should not report locked');
    assert.strictEqual(result.stale, true, 'Should report stale');
    assert.ok(result.lock, 'Should include lock data');
  });

  test('isLocked — returns false when no lock', () => {
    const result = isLocked(testDir);
    assert.strictEqual(result.locked, false, 'Should not report locked');
    assert.ok(!result.stale, 'Should not report stale');
  });

  test('requestStop / isStopRequested / clearStop', () => {
    assert.strictEqual(isStopRequested(testDir), false, 'Should not be stop-requested initially');

    requestStop(testDir);
    assert.strictEqual(isStopRequested(testDir), true, 'Should be stop-requested after requestStop');

    clearStop(testDir);
    assert.strictEqual(isStopRequested(testDir), false, 'Should not be stop-requested after clearStop');
  });

  test('isPidAlive — current process is alive', () => {
    assert.strictEqual(isPidAlive(process.pid), true, 'Current process PID should be alive');
  });

  test('isPidAlive — dead PID returns false', () => {
    assert.strictEqual(isPidAlive(999999999), false, 'Non-existent PID should return false');
    assert.strictEqual(isPidAlive(0), false, 'PID 0 should return false');
    assert.strictEqual(isPidAlive(-1), false, 'Negative PID should return false');
    assert.strictEqual(isPidAlive(null), false, 'null PID should return false');
  });
});

/**
 * Exclusive-create (wx) + owner-token compare-and-swap (M2, W11-s5).
 *
 * These prove the fix for the check-then-act (TOCTOU) hole in acquireLock:
 * the WRITE is the point of exclusivity (an atomic O_CREAT|O_EXCL create), the
 * agentId is the owner token, and releaseLock/updateLockPlan honor an optional
 * owner-token compare-and-swap so a foreign/stale caller cannot mutate or drop
 * another agent's lock. No test doubles — real lock files and real child
 * processes racing for the same lock.
 */
describe('Agent Lock — exclusive-create (wx) + owner-token CAS', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-lock-wx-'));
    fs.mkdirSync(path.join(testDir, '.ctoc'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('acquireLock — owner token is a non-empty UUID and a held lock is never overwritten', () => {
    const first = acquireLock(testDir, 'plan-a');
    assert.strictEqual(first.acquired, true, 'First acquire should succeed');
    assert.match(
      first.agentId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      'agentId should be a UUID owner token'
    );

    const tokenOnDisk = readLock(testDir).agentId;
    assert.strictEqual(tokenOnDisk, first.agentId, 'On-disk token matches returned token');

    // A second acquire while the lock is held (by this live process) must be
    // rejected AND must not overwrite the existing owner token.
    const second = acquireLock(testDir, 'plan-b');
    assert.strictEqual(second.acquired, false, 'Second acquire must be rejected while held');
    assert.strictEqual(
      readLock(testDir).agentId,
      first.agentId,
      'Rejected acquire must not overwrite the held owner token'
    );
  });

  test('acquireLock — stale lock (dead PID) is reclaimed exclusively (regression guard)', () => {
    const lockPath = getLockPath(testDir);
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999999999, agentId: 'stale', plan: 'stale', startedAt: new Date().toISOString() }, null, 2)
    );

    const result = acquireLock(testDir, 'fresh-plan');
    assert.strictEqual(result.acquired, true, 'Stale lock must be reclaimable under wx');
    const lock = readLock(testDir);
    assert.strictEqual(lock.plan, 'fresh-plan', 'Reclaimed lock has the new plan');
    assert.strictEqual(lock.pid, process.pid, 'Reclaimed lock has the current PID');
    assert.notStrictEqual(lock.agentId, 'stale', 'Reclaimed lock has a fresh owner token');
  });

  test('releaseLock — wrong owner token does NOT remove another agent\'s lock (CAS)', () => {
    const res = acquireLock(testDir, 'plan-a');
    assert.strictEqual(res.acquired, true);
    const token = res.agentId;

    // Foreign caller with the wrong token must not be able to drop the lock.
    releaseLock(testDir, 'not-the-owner-token');
    assert.ok(
      fs.existsSync(getLockPath(testDir)),
      'Lock must survive a wrong-token release'
    );
    assert.strictEqual(
      readLock(testDir).agentId,
      token,
      'Owner token must be unchanged after a rejected release'
    );

    // The rightful owner (correct token) can release.
    releaseLock(testDir, token);
    assert.ok(
      !fs.existsSync(getLockPath(testDir)),
      'Correct-token release must remove the lock'
    );
  });

  test('releaseLock — omitted token stays backward-compatible (unconditional release)', () => {
    acquireLock(testDir, 'plan-a');
    requestStop(testDir);

    releaseLock(testDir); // no token — legacy call sites

    assert.ok(!fs.existsSync(getLockPath(testDir)), 'Lock removed with no token');
    assert.ok(!fs.existsSync(getStopPath(testDir)), 'Stop file removed with no token');
  });

  test('updateLockPlan — wrong owner token does NOT mutate another agent\'s lock (CAS)', () => {
    const res = acquireLock(testDir, 'plan-a');
    const token = res.agentId;

    updateLockPlan(testDir, 'plan-hijacked', 'not-the-owner-token');
    assert.strictEqual(
      readLock(testDir).plan,
      'plan-a',
      'Wrong token must not change the plan name'
    );

    updateLockPlan(testDir, 'plan-b', token);
    assert.strictEqual(
      readLock(testDir).plan,
      'plan-b',
      'Correct token updates the plan name'
    );
  });

  test('acquireLock — exactly one of N concurrent processes acquires the lock (M2 race)', async () => {
    const N = 5;
    const childScript = path.join(testDir, 'race-child.js');
    fs.writeFileSync(
      childScript,
      `'use strict';
const modulePath = process.argv[2];
const projectPath = process.argv[3];
const { acquireLock } = require(modulePath);
process.on('message', (msg) => {
  if (msg === 'go') {
    const res = acquireLock(projectPath, 'race-' + process.pid);
    process.send({ type: 'result', acquired: res.acquired === true });
    // Stay alive until told to exit so this PID remains valid for the
    // other children's liveness checks — otherwise a fast winner could exit
    // and be misread as a stale lock, letting a loser reclaim it.
  } else if (msg === 'exit') {
    process.exit(0);
  }
});
process.send({ type: 'ready' });
`
    );

    const children = [];
    const readyPromises = [];
    const resultPromises = [];

    for (let i = 0; i < N; i++) {
      const child = fork(childScript, [AGENT_LOCK_MODULE, testDir], { silent: true });
      children.push(child);

      let markReady;
      let markResult;
      readyPromises.push(new Promise((resolve) => { markReady = resolve; }));
      resultPromises.push(new Promise((resolve) => { markResult = resolve; }));

      child.on('message', (msg) => {
        if (msg && msg.type === 'ready') markReady();
        else if (msg && msg.type === 'result') markResult(msg.acquired);
      });
    }

    // Barrier: wait until every child is ready, then release them together.
    await Promise.all(readyPromises);
    for (const child of children) child.send('go');

    const results = await Promise.all(resultPromises);
    const acquiredCount = results.filter(Boolean).length;

    // Tear down the children only after all results are in.
    for (const child of children) child.send('exit');
    await Promise.all(children.map((child) => new Promise((resolve) => child.on('exit', resolve))));

    assert.strictEqual(
      acquiredCount,
      1,
      `Exactly one of ${N} racing processes must acquire the lock, got ${acquiredCount}`
    );

    const survivor = readLock(testDir);
    assert.ok(survivor && survivor.agentId, 'The winning lock must remain on disk with an owner token');
  });
});

console.log('\nAgent Lock Tests');
console.log('================\n');

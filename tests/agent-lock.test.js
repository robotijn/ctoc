/**
 * Agent Lock Tests
 * Unit tests for lib/agent-lock.js — PID + agentId based lock module
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');

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
} = require('../lib/agent-lock');

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

console.log('\nAgent Lock Tests');
console.log('================\n');

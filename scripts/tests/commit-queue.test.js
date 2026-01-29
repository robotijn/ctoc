/**
 * Commit Queue Tests
 *
 * Tests for the sequential commit queue with file locking.
 * Run with: node scripts/tests/commit-queue.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Get absolute path to commit-queue module
const CTOC_ROOT = path.resolve(__dirname, '../..');
const commitQueue = require(path.join(CTOC_ROOT, 'scripts/lib/commit-queue.js'));

// Test directory for isolated tests
const TEST_DIR = path.join(CTOC_ROOT, '.ctoc-test');

// ============================================================================
// Test Utilities
// ============================================================================

function setup() {
  // Create test .ctoc directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

function cleanup() {
  // Remove test artifacts
  const lockPath = path.join(CTOC_ROOT, '.ctoc', '.commit-lock');
  const queuePath = path.join(CTOC_ROOT, '.ctoc', '.commit-queue.json');

  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }

  // Don't delete queue file, just clear it
  if (fs.existsSync(queuePath)) {
    fs.writeFileSync(queuePath, JSON.stringify({ items: [], lastProcessed: null }));
  }

  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    return false;
  }
}

// ============================================================================
// Tests
// ============================================================================

console.log('\nCommit Queue Tests\n');
console.log('==================\n');

let passed = 0;
let failed = 0;

// Setup
setup();

// Test 1: Lock acquisition
if (test('acquireLock returns success', () => {
  const result = commitQueue.acquireLock(1000);
  assert.strictEqual(result.success, true);
  commitQueue.releaseLock();
})) passed++; else failed++;

// Test 2: Lock release
if (test('releaseLock releases the lock', () => {
  commitQueue.acquireLock(1000);
  const result = commitQueue.releaseLock();
  assert.strictEqual(result.success, true);
})) passed++; else failed++;

// Test 3: Double lock fails
if (test('second lock acquisition waits or fails', () => {
  commitQueue.acquireLock(1000);
  // Try with very short timeout - should fail
  const result2 = commitQueue.acquireLock(10);
  commitQueue.releaseLock();
  assert.strictEqual(result2.success, false);
})) passed++; else failed++;

// Test 4: Queue status works
if (test('getQueueStatus returns valid status', () => {
  const status = commitQueue.getQueueStatus();
  assert.strictEqual(typeof status.pending, 'number');
  assert.strictEqual(typeof status.completed, 'number');
  assert.strictEqual(typeof status.isLocked, 'boolean');
  assert.strictEqual(typeof status.currentVersion, 'string');
})) passed++; else failed++;

// Test 5: Version reading
if (test('readVersion returns current version', () => {
  const version = commitQueue.readVersion();
  assert.strictEqual(typeof version.major, 'number');
  assert.strictEqual(typeof version.minor, 'number');
  assert.strictEqual(typeof version.patch, 'number');
  assert.strictEqual(typeof version.string, 'string');
  assert.ok(version.string.match(/^\d+\.\d+\.\d+$/), 'Version should be X.Y.Z format');
})) passed++; else failed++;

// Test 6: Enqueue commit
if (test('enqueueCommit adds item to queue', () => {
  const beforeStatus = commitQueue.getQueueStatus();
  const result = commitQueue.enqueueCommit('test-feature', [], 'test: queue test');
  const afterStatus = commitQueue.getQueueStatus();

  assert.strictEqual(result.success, true);
  assert.strictEqual(afterStatus.pending, beforeStatus.pending + 1);
})) passed++; else failed++;

// Test 7: Clear queue
if (test('clearCompletedFromQueue removes completed items', () => {
  const result = commitQueue.clearCompletedFromQueue();
  assert.strictEqual(result.success, true);
})) passed++; else failed++;

// Test 8: Constants exported
if (test('module exports constants', () => {
  assert.strictEqual(commitQueue.LOCK_FILE, '.commit-lock');
  assert.strictEqual(commitQueue.QUEUE_FILE, '.commit-queue.json');
  assert.strictEqual(typeof commitQueue.LOCK_TIMEOUT_MS, 'number');
})) passed++; else failed++;

// Cleanup
cleanup();

// Summary
console.log('\n------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('');

process.exit(failed > 0 ? 1 : 0);

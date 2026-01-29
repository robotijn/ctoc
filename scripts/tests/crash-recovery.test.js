#!/usr/bin/env node
/**
 * Tests for Crash Recovery feature
 * Tests isInterruptedSession() detection logic
 */

const assert = require('assert');

// Mock the utils module functions for testing
// We'll test the logic directly

/**
 * isInterruptedSession - Detection logic
 * Returns true if:
 * - sessionStatus === 'active'
 * - currentStep >= 7 AND currentStep <= 15
 * - lastActivity < 24 hours ago
 */
function isInterruptedSession(state) {
  if (!state) return false;
  if (state.sessionStatus !== 'active') return false;
  // Check currentStep is a valid number in implementation range
  if (typeof state.currentStep !== 'number' || state.currentStep < 7 || state.currentStep > 15) return false;

  const lastActivity = new Date(state.lastActivity);
  const hoursSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

  return hoursSince < 24;
}

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${error.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n=== Crash Recovery Tests ===\n');

console.log('Testing: isInterruptedSession()\n');

// Test 1: Null state returns false
test('null state returns false', () => {
  assertEqual(isInterruptedSession(null), false, 'Should return false for null');
});

// Test 2: Undefined state returns false
test('undefined state returns false', () => {
  assertEqual(isInterruptedSession(undefined), false, 'Should return false for undefined');
});

// Test 3: sessionStatus = "ended" returns false
test('sessionStatus "ended" returns false', () => {
  const state = {
    sessionStatus: 'ended',
    currentStep: 9,
    lastActivity: new Date().toISOString()
  };
  assertEqual(isInterruptedSession(state), false, 'Should return false for ended sessions');
});

// Test 4: sessionStatus = "active" with step < 7 returns false
test('active session with step < 7 returns false', () => {
  const state = {
    sessionStatus: 'active',
    currentStep: 3,
    lastActivity: new Date().toISOString()
  };
  assertEqual(isInterruptedSession(state), false, 'Should return false for planning steps');
});

// Test 5: sessionStatus = "active" with step > 15 returns false
test('active session with step > 15 returns false', () => {
  const state = {
    sessionStatus: 'active',
    currentStep: 16,
    lastActivity: new Date().toISOString()
  };
  assertEqual(isInterruptedSession(state), false, 'Should return false for completed features');
});

// Test 6: Active session, step 9, recent activity (2 hours ago) returns true
test('active session, step 9, 2 hours ago returns true', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const state = {
    sessionStatus: 'active',
    currentStep: 9,
    lastActivity: twoHoursAgo
  };
  assertEqual(isInterruptedSession(state), true, 'Should detect interrupted session');
});

// Test 7: Active session, step 7, recent activity returns true
test('active session, step 7 (TEST), 1 hour ago returns true', () => {
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
  const state = {
    sessionStatus: 'active',
    currentStep: 7,
    lastActivity: oneHourAgo
  };
  assertEqual(isInterruptedSession(state), true, 'Should detect interrupted TEST step');
});

// Test 8: Active session, step 15, recent activity returns true
test('active session, step 15 (COMMIT), 30 mins ago returns true', () => {
  const thirtyMinsAgo = new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString();
  const state = {
    sessionStatus: 'active',
    currentStep: 15,
    lastActivity: thirtyMinsAgo
  };
  assertEqual(isInterruptedSession(state), true, 'Should detect interrupted COMMIT step');
});

// Test 9: Active session, step 9, activity > 24 hours ago returns false
test('active session, step 9, 25 hours ago returns false', () => {
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const state = {
    sessionStatus: 'active',
    currentStep: 9,
    lastActivity: twentyFiveHoursAgo
  };
  assertEqual(isInterruptedSession(state), false, 'Should not flag old abandoned sessions');
});

// Test 10: Active session, step 9, activity exactly 24 hours ago returns false
test('active session, step 9, exactly 24 hours ago returns false', () => {
  const exactlyTwentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const state = {
    sessionStatus: 'active',
    currentStep: 9,
    lastActivity: exactlyTwentyFourHoursAgo
  };
  assertEqual(isInterruptedSession(state), false, 'Should not flag sessions at exactly 24h boundary');
});

// Test 11: Active session, step 9, activity 23.9 hours ago returns true
test('active session, step 9, 23.9 hours ago returns true', () => {
  const almostTwentyFourHours = new Date(Date.now() - 23.9 * 60 * 60 * 1000).toISOString();
  const state = {
    sessionStatus: 'active',
    currentStep: 9,
    lastActivity: almostTwentyFourHours
  };
  assertEqual(isInterruptedSession(state), true, 'Should flag sessions just under 24h');
});

// Test 12: Missing sessionStatus field returns false
test('missing sessionStatus field returns false', () => {
  const state = {
    currentStep: 9,
    lastActivity: new Date().toISOString()
  };
  assertEqual(isInterruptedSession(state), false, 'Should return false for missing sessionStatus');
});

// Test 13: Missing currentStep field returns false
test('missing currentStep field returns false', () => {
  const state = {
    sessionStatus: 'active',
    lastActivity: new Date().toISOString()
  };
  assertEqual(isInterruptedSession(state), false, 'Should return false for missing currentStep');
});

// Test 14: All implementation steps (7-15) detected
console.log('\nTesting all implementation steps (7-15):');
for (let step = 7; step <= 15; step++) {
  test(`step ${step} is detected as interrupted`, () => {
    const state = {
      sessionStatus: 'active',
      currentStep: step,
      lastActivity: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    };
    assertEqual(isInterruptedSession(state), true, `Step ${step} should be detected`);
  });
}

// Test 15: Planning steps (1-6) not detected
console.log('\nTesting planning steps (1-6) are NOT detected:');
for (let step = 1; step <= 6; step++) {
  test(`step ${step} is NOT detected as interrupted`, () => {
    const state = {
      sessionStatus: 'active',
      currentStep: step,
      lastActivity: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    };
    assertEqual(isInterruptedSession(state), false, `Step ${step} should not be detected`);
  });
}

// ============================================================================
// Summary
// ============================================================================

console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  process.exit(1);
}

console.log('\nAll tests passed!\n');

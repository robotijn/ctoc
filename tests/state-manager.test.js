/**
 * State Manager Unit Tests
 * Tests for lib/state-manager.js
 */

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// SHARED TEST FIXTURES
// =============================================================================

const TEST_PROJECT_PATH = '/tmp/test-project-ctoc';
const TEST_STATE_DIR = path.join(os.homedir(), '.ctoc', 'state');

/**
 * Creates a fresh test state object
 */
function createTestState(overrides = {}) {
  const now = new Date().toISOString();
  return {
    _version: '4.0.0',
    project: TEST_PROJECT_PATH,
    feature: 'test-feature',
    started: now,
    lastUpdated: now,
    currentStep: 1,
    language: 'javascript',
    framework: 'express',
    steps: {},
    gate1_approval: null,
    gate2_approval: null,
    sessionStatus: 'active',
    lastActivity: now,
    ...overrides
  };
}

/**
 * Creates a gate approval object
 */
function createTestGateApproval(gateNumber, overrides = {}) {
  return {
    gate: gateNumber,
    timestamp: new Date().toISOString(),
    user_confirmed: true,
    plan_path: '/plans/test-plan.md',
    plan_hash: 'abc123def456',
    ...overrides
  };
}

/**
 * Gets the state file path for the test project
 */
function getTestStatePath() {
  const { hashPath } = require('../lib/crypto');
  const hash = hashPath(TEST_PROJECT_PATH);
  return path.join(TEST_STATE_DIR, `${hash}.json`);
}

/**
 * Cleans up test state file
 */
function cleanupTestState() {
  const statePath = getTestStatePath();
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Saves state directly to file (bypassing signing for test setup)
 */
function saveTestStateDirectly(state) {
  const { signState } = require('../lib/crypto');
  const statePath = getTestStatePath();

  if (!fs.existsSync(TEST_STATE_DIR)) {
    fs.mkdirSync(TEST_STATE_DIR, { recursive: true });
  }

  const signedState = signState(state);
  fs.writeFileSync(statePath, JSON.stringify(signedState, null, 2));
  return signedState;
}

/**
 * Loads state directly from file (for test verification)
 */
function loadTestStateDirectly() {
  const statePath = getTestStatePath();
  if (!fs.existsSync(statePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('State Manager Constants', () => {
  const stateManager = require('../lib/state-manager');

  test('STEP_NAMES contains all 15 steps', () => {
    assert.strictEqual(Object.keys(stateManager.STEP_NAMES).length, 15);
    assert.strictEqual(stateManager.STEP_NAMES[1], 'ASSESS');
    assert.strictEqual(stateManager.STEP_NAMES[15], 'COMMIT');
  });

  test('STEP_DESCRIPTIONS contains all 15 steps', () => {
    assert.strictEqual(Object.keys(stateManager.STEP_DESCRIPTIONS).length, 15);
    assert.ok(stateManager.STEP_DESCRIPTIONS[1].includes('Assess'));
    assert.ok(stateManager.STEP_DESCRIPTIONS[15].includes('Commit'));
  });

  test('STATE_DIR points to ~/.ctoc/state', () => {
    const expected = path.join(os.homedir(), '.ctoc', 'state');
    assert.strictEqual(stateManager.STATE_DIR, expected);
  });
});

// =============================================================================
// INIT TESTS (createState, ensureStateDir, getStatePath)
// =============================================================================

describe('State Initialization', () => {
  const stateManager = require('../lib/state-manager');

  beforeEach(() => {
    cleanupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('ensureStateDir creates directory if missing', () => {
    // Note: Can't fully test directory creation without removing ~/.ctoc/state
    // Just verify it doesn't throw
    assert.doesNotThrow(() => stateManager.ensureStateDir());
    assert.ok(fs.existsSync(stateManager.STATE_DIR));
  });

  test('getStatePath returns consistent path for same project', () => {
    const path1 = stateManager.getStatePath(TEST_PROJECT_PATH);
    const path2 = stateManager.getStatePath(TEST_PROJECT_PATH);
    assert.strictEqual(path1, path2);
  });

  test('getStatePath returns different paths for different projects', () => {
    const path1 = stateManager.getStatePath('/project/a');
    const path2 = stateManager.getStatePath('/project/b');
    assert.notStrictEqual(path1, path2);
  });

  test('createState returns valid initial state', () => {
    const state = stateManager.createState(
      TEST_PROJECT_PATH,
      'test-feature',
      'javascript',
      'express'
    );

    assert.strictEqual(state._version, '4.0.0');
    assert.strictEqual(state.project, TEST_PROJECT_PATH);
    assert.strictEqual(state.feature, 'test-feature');
    assert.strictEqual(state.language, 'javascript');
    assert.strictEqual(state.framework, 'express');
    assert.strictEqual(state.currentStep, 1);
    assert.strictEqual(state.sessionStatus, 'active');
    assert.deepStrictEqual(state.steps, {});
    assert.strictEqual(state.gate1_approval, null);
    assert.strictEqual(state.gate2_approval, null);
  });

  test('createState uses defaults for missing arguments', () => {
    const state = stateManager.createState();

    assert.strictEqual(state.project, process.cwd());
    assert.strictEqual(state.feature, null);
    assert.strictEqual(state.language, 'unknown');
    assert.strictEqual(state.framework, null);
  });

  test('createState sets valid ISO timestamps', () => {
    const state = stateManager.createState(TEST_PROJECT_PATH);

    // Verify timestamps are valid ISO strings
    assert.doesNotThrow(() => new Date(state.started));
    assert.doesNotThrow(() => new Date(state.lastUpdated));
    assert.doesNotThrow(() => new Date(state.lastActivity));

    // Timestamps should be recent (within last minute)
    const now = Date.now();
    const started = new Date(state.started).getTime();
    assert.ok(now - started < 60000, 'started timestamp should be recent');
  });
});

// =============================================================================
// READ TESTS (loadState)
// =============================================================================

describe('State Loading', () => {
  const stateManager = require('../lib/state-manager');

  beforeEach(() => {
    cleanupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('loadState returns null state for non-existent file', () => {
    const result = stateManager.loadState(TEST_PROJECT_PATH);

    assert.strictEqual(result.state, null);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'No state file');
  });

  test('loadState returns valid state for properly signed file', () => {
    const testState = createTestState();
    saveTestStateDirectly(testState);

    const result = stateManager.loadState(TEST_PROJECT_PATH);

    assert.strictEqual(result.valid, true);
    assert.ok(result.state);
    assert.strictEqual(result.state.project, TEST_PROJECT_PATH);
    assert.strictEqual(result.state.feature, 'test-feature');
  });

  test('loadState migrates unsigned (legacy) state', () => {
    // Write unsigned state directly
    const statePath = getTestStatePath();
    const unsignedState = createTestState();

    if (!fs.existsSync(TEST_STATE_DIR)) {
      fs.mkdirSync(TEST_STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(unsignedState, null, 2));

    const result = stateManager.loadState(TEST_PROJECT_PATH);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.migrated, true);
    assert.ok(result.state._signature, 'Should have signature after migration');
    assert.ok(result.state._migrated_at, 'Should have migration timestamp');
  });

  test('loadState rejects tampered state', () => {
    const testState = createTestState();
    const signedState = saveTestStateDirectly(testState);

    // Tamper with the state
    signedState.currentStep = 99;
    const statePath = getTestStatePath();
    fs.writeFileSync(statePath, JSON.stringify(signedState, null, 2));

    const result = stateManager.loadState(TEST_PROJECT_PATH);

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.state, null);
    assert.ok(result.error.includes('tampered') || result.error.includes('mismatch'));
  });

  test('loadState handles corrupted JSON', () => {
    const statePath = getTestStatePath();

    if (!fs.existsSync(TEST_STATE_DIR)) {
      fs.mkdirSync(TEST_STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(statePath, 'not valid json {{{');

    const result = stateManager.loadState(TEST_PROJECT_PATH);

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.state, null);
    assert.ok(result.error.includes('Failed to load'));
  });
});

// =============================================================================
// WRITE TESTS (saveState, updateStep)
// =============================================================================

describe('State Writing', () => {
  const stateManager = require('../lib/state-manager');

  beforeEach(() => {
    cleanupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('saveState creates signed state file', () => {
    const testState = createTestState();

    const savedState = stateManager.saveState(TEST_PROJECT_PATH, testState);

    assert.ok(savedState._signature, 'Should have signature');
    assert.ok(savedState._signature.startsWith('hmac-sha256:'));

    // Verify file exists and can be loaded
    const result = stateManager.loadState(TEST_PROJECT_PATH);
    assert.strictEqual(result.valid, true);
  });

  test('saveState updates timestamps', () => {
    const oldTime = '2020-01-01T00:00:00.000Z';
    const testState = createTestState({
      lastUpdated: oldTime,
      lastActivity: oldTime
    });

    const savedState = stateManager.saveState(TEST_PROJECT_PATH, testState);

    assert.notStrictEqual(savedState.lastUpdated, oldTime);
    assert.notStrictEqual(savedState.lastActivity, oldTime);
  });

  test('updateStep creates state if none exists', () => {
    const savedState = stateManager.updateStep(
      TEST_PROJECT_PATH,
      1,
      'completed',
      'Assessment complete'
    );

    assert.ok(savedState);
    assert.ok(savedState.steps[1]);
    assert.strictEqual(savedState.steps[1].status, 'completed');
    assert.strictEqual(savedState.steps[1].summary, 'Assessment complete');
  });

  test('updateStep advances currentStep when step completed', () => {
    const testState = createTestState({ currentStep: 5 });
    saveTestStateDirectly(testState);

    const savedState = stateManager.updateStep(
      TEST_PROJECT_PATH,
      5,
      'completed',
      'Design complete'
    );

    assert.strictEqual(savedState.currentStep, 6);
  });

  test('updateStep sets currentStep when in_progress', () => {
    const testState = createTestState({ currentStep: 3 });
    saveTestStateDirectly(testState);

    const savedState = stateManager.updateStep(
      TEST_PROJECT_PATH,
      7,
      'in_progress',
      'Starting tests'
    );

    assert.strictEqual(savedState.currentStep, 7);
  });

  test('updateStep does not regress currentStep', () => {
    const testState = createTestState({ currentStep: 10 });
    saveTestStateDirectly(testState);

    const savedState = stateManager.updateStep(
      TEST_PROJECT_PATH,
      5,
      'completed',
      'Late completion'
    );

    // Should not go backwards
    assert.strictEqual(savedState.currentStep, 10);
  });

  test('updateStep preserves existing step data', () => {
    const testState = createTestState({
      steps: {
        1: { status: 'completed', timestamp: '2026-01-01T00:00:00Z', summary: 'Step 1' },
        2: { status: 'completed', timestamp: '2026-01-01T00:00:00Z', summary: 'Step 2' }
      }
    });
    saveTestStateDirectly(testState);

    const savedState = stateManager.updateStep(
      TEST_PROJECT_PATH,
      3,
      'completed',
      'Step 3'
    );

    assert.ok(savedState.steps[1]);
    assert.ok(savedState.steps[2]);
    assert.ok(savedState.steps[3]);
    assert.strictEqual(savedState.steps[1].summary, 'Step 1');
    assert.strictEqual(savedState.steps[3].summary, 'Step 3');
  });
});

// =============================================================================
// GATE APPROVAL TESTS
// =============================================================================

describe('Gate Approvals', () => {
  const stateManager = require('../lib/state-manager');

  test('createGateApproval returns valid approval object', () => {
    const approval = stateManager.createGateApproval(
      1,
      '/plans/my-plan.md',
      'sha256hash123'
    );

    assert.strictEqual(approval.gate, 1);
    assert.strictEqual(approval.plan_path, '/plans/my-plan.md');
    assert.strictEqual(approval.plan_hash, 'sha256hash123');
    assert.strictEqual(approval.user_confirmed, true);
    assert.ok(approval.timestamp);
  });

  test('verifyGateApproval accepts valid approval', () => {
    const state = createTestState({
      gate1_approval: createTestGateApproval(1)
    });

    const result = stateManager.verifyGateApproval(1, state);

    assert.strictEqual(result.valid, true);
  });

  test('verifyGateApproval rejects missing approval', () => {
    const state = createTestState({ gate1_approval: null });

    const result = stateManager.verifyGateApproval(1, state);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('not found'));
  });

  test('verifyGateApproval rejects approval without timestamp', () => {
    const state = createTestState({
      gate1_approval: { gate: 1, user_confirmed: true }
    });

    const result = stateManager.verifyGateApproval(1, state);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('missing timestamp'));
  });

  test('verifyGateApproval rejects unconfirmed approval', () => {
    const state = createTestState({
      gate1_approval: createTestGateApproval(1, { user_confirmed: false })
    });

    const result = stateManager.verifyGateApproval(1, state);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('not user-confirmed'));
  });

  test('verifyGateApproval rejects expired approval (>24 hours)', () => {
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const state = createTestState({
      gate2_approval: createTestGateApproval(2, { timestamp: oldTimestamp })
    });

    const result = stateManager.verifyGateApproval(2, state);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('expired'));
  });

  test('verifyGateApproval accepts approval just under 24 hours', () => {
    const recentTimestamp = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    const state = createTestState({
      gate1_approval: createTestGateApproval(1, { timestamp: recentTimestamp })
    });

    const result = stateManager.verifyGateApproval(1, state);

    assert.strictEqual(result.valid, true);
  });
});

// =============================================================================
// SESSION INTERRUPTION TESTS
// =============================================================================

describe('Session Interruption Detection', () => {
  const stateManager = require('../lib/state-manager');

  test('isInterruptedSession returns false for null state', () => {
    assert.strictEqual(stateManager.isInterruptedSession(null), false);
  });

  test('isInterruptedSession returns false for inactive session', () => {
    const state = createTestState({ sessionStatus: 'completed' });
    assert.strictEqual(stateManager.isInterruptedSession(state), false);
  });

  test('isInterruptedSession returns false for early steps (1-6)', () => {
    const state = createTestState({ currentStep: 5, sessionStatus: 'active' });
    assert.strictEqual(stateManager.isInterruptedSession(state), false);
  });

  test('isInterruptedSession returns true for implementation steps (7-15)', () => {
    const recentActivity = new Date().toISOString();
    const state = createTestState({
      currentStep: 9,
      sessionStatus: 'active',
      lastActivity: recentActivity
    });

    assert.strictEqual(stateManager.isInterruptedSession(state), true);
  });

  test('isInterruptedSession returns true for step 7 (TEST)', () => {
    const state = createTestState({
      currentStep: 7,
      sessionStatus: 'active',
      lastActivity: new Date().toISOString()
    });

    assert.strictEqual(stateManager.isInterruptedSession(state), true);
  });

  test('isInterruptedSession returns true for step 15 (COMMIT)', () => {
    const state = createTestState({
      currentStep: 15,
      sessionStatus: 'active',
      lastActivity: new Date().toISOString()
    });

    assert.strictEqual(stateManager.isInterruptedSession(state), true);
  });

  test('isInterruptedSession returns false for old activity (>24 hours)', () => {
    const oldActivity = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const state = createTestState({
      currentStep: 9,
      sessionStatus: 'active',
      lastActivity: oldActivity
    });

    assert.strictEqual(stateManager.isInterruptedSession(state), false);
  });

  test('isInterruptedSession returns true for recent activity (<24 hours)', () => {
    const recentActivity = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const state = createTestState({
      currentStep: 10,
      sessionStatus: 'active',
      lastActivity: recentActivity
    });

    assert.strictEqual(stateManager.isInterruptedSession(state), true);
  });

  test('isInterruptedSession returns false for invalid currentStep', () => {
    const state = createTestState({
      currentStep: 'invalid',
      sessionStatus: 'active'
    });
    assert.strictEqual(stateManager.isInterruptedSession(state), false);
  });

  test('isInterruptedSession returns false for step 16 (out of range)', () => {
    const state = createTestState({
      currentStep: 16,
      sessionStatus: 'active',
      lastActivity: new Date().toISOString()
    });
    assert.strictEqual(stateManager.isInterruptedSession(state), false);
  });
});

// =============================================================================
// TIME FORMATTING TESTS
// =============================================================================

describe('Time Formatting', () => {
  const stateManager = require('../lib/state-manager');

  test('formatTimeSince formats minutes correctly', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const result = stateManager.formatTimeSince(tenMinutesAgo);

    assert.ok(result.includes('minute'));
    assert.ok(result.includes('10'));
  });

  test('formatTimeSince formats single minute correctly', () => {
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
    const result = stateManager.formatTimeSince(oneMinuteAgo);

    assert.ok(result.includes('minute'));
    assert.ok(!result.includes('minutes'), 'Should be singular');
  });

  test('formatTimeSince formats hours correctly', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const result = stateManager.formatTimeSince(fiveHoursAgo);

    assert.ok(result.includes('hour'));
    assert.ok(result.includes('5'));
  });

  test('formatTimeSince formats single hour correctly', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const result = stateManager.formatTimeSince(oneHourAgo);

    assert.ok(result.includes('hour'));
    assert.ok(!result.includes('hours'), 'Should be singular');
  });

  test('formatTimeSince switches from minutes to hours at 1 hour', () => {
    const fiftyMinutesAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString();
    const result = stateManager.formatTimeSince(fiftyMinutesAgo);

    assert.ok(result.includes('minute'));
  });

  test('formatTimeSince handles zero time difference', () => {
    const now = new Date().toISOString();
    const result = stateManager.formatTimeSince(now);

    assert.ok(result.includes('minute'));
    assert.ok(result.includes('0'));
  });
});

// =============================================================================
// CLEANUP TESTS (edge cases and error handling)
// =============================================================================

describe('Edge Cases and Error Handling', () => {
  const stateManager = require('../lib/state-manager');

  beforeEach(() => {
    cleanupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('Multiple saves preserve state integrity', () => {
    let state = stateManager.createState(TEST_PROJECT_PATH, 'feature', 'js', null);

    // Save multiple times
    state = stateManager.saveState(TEST_PROJECT_PATH, state);
    state.currentStep = 2;
    state = stateManager.saveState(TEST_PROJECT_PATH, state);
    state.currentStep = 3;
    state = stateManager.saveState(TEST_PROJECT_PATH, state);

    const result = stateManager.loadState(TEST_PROJECT_PATH);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.state.currentStep, 3);
  });

  test('State with all steps completed loads correctly', () => {
    const steps = {};
    for (let i = 1; i <= 15; i++) {
      steps[i] = {
        status: 'completed',
        timestamp: new Date().toISOString(),
        summary: `Step ${i} summary`
      };
    }

    const testState = createTestState({ steps, currentStep: 16 });
    saveTestStateDirectly(testState);

    const result = stateManager.loadState(TEST_PROJECT_PATH);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(Object.keys(result.state.steps).length, 15);
  });

  test('State with both gate approvals loads correctly', () => {
    const testState = createTestState({
      gate1_approval: createTestGateApproval(1),
      gate2_approval: createTestGateApproval(2)
    });
    saveTestStateDirectly(testState);

    const result = stateManager.loadState(TEST_PROJECT_PATH);
    assert.strictEqual(result.valid, true);
    assert.ok(result.state.gate1_approval);
    assert.ok(result.state.gate2_approval);
  });

  test('updateStep with empty summary works', () => {
    const savedState = stateManager.updateStep(
      TEST_PROJECT_PATH,
      1,
      'completed',
      ''
    );

    assert.strictEqual(savedState.steps[1].summary, '');
  });

  test('updateStep with undefined summary defaults to empty string', () => {
    const savedState = stateManager.updateStep(
      TEST_PROJECT_PATH,
      1,
      'completed'
    );

    assert.strictEqual(savedState.steps[1].summary, '');
  });
});

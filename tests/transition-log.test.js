/**
 * Transition Log Tests
 * Unit tests for audit trail logging of plan state changes.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');

describe('Transition Log Tests', () => {
  let testDir;
  let transitionLog;

  beforeEach(() => {
    // Create a temporary project directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-test-'));
    fs.mkdirSync(path.join(testDir, '.ctoc', 'logs'), { recursive: true });

    // Fresh require
    delete require.cache[require.resolve('../lib/transition-log.js')];
    transitionLog = require('../lib/transition-log.js');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('getLogPath returns correct path', () => {
    const logPath = transitionLog.getLogPath(testDir);
    assert.ok(logPath.includes('.ctoc'), 'Should be in .ctoc directory');
    assert.ok(logPath.includes('logs'), 'Should be in logs directory');
    assert.ok(logPath.endsWith('transitions.json'), 'Should be transitions.json');
    console.log('# getLogPath returns correct path');
  });

  test('readLog returns empty array when no log exists', () => {
    // Remove the logs directory to test no-file case
    fs.rmSync(path.join(testDir, '.ctoc', 'logs'), { recursive: true, force: true });

    const entries = transitionLog.readLog(testDir);
    assert.ok(Array.isArray(entries), 'Should return array');
    assert.strictEqual(entries.length, 0, 'Should be empty');
    console.log('# readLog returns empty array when no log exists');
  });

  test('logTransition creates log entry with timestamp', () => {
    const entry = transitionLog.logTransition({
      plan: 'test-plan.md',
      from: 'functional',
      to: 'implementation',
      actor: 'human'
    }, testDir);

    assert.ok(entry.timestamp, 'Should have timestamp');
    assert.strictEqual(entry.plan, 'test-plan.md', 'Should have plan name');
    assert.strictEqual(entry.from, 'functional', 'Should have from stage');
    assert.strictEqual(entry.to, 'implementation', 'Should have to stage');
    assert.strictEqual(entry.actor, 'human', 'Should have actor');
    console.log('# logTransition creates log entry with timestamp');
  });

  test('logTransition persists to file', () => {
    transitionLog.logTransition({
      plan: 'test-plan.md',
      from: 'functional',
      to: 'implementation',
      actor: 'human'
    }, testDir);

    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(entries.length, 1, 'Should have 1 entry');
    assert.strictEqual(entries[0].plan, 'test-plan.md', 'Should persist plan name');
    console.log('# logTransition persists to file');
  });

  test('logTransition appends multiple entries', () => {
    transitionLog.logTransition({
      plan: 'plan-a.md',
      from: 'functional',
      to: 'implementation',
      actor: 'human'
    }, testDir);

    transitionLog.logTransition({
      plan: 'plan-b.md',
      from: 'implementation',
      to: 'todo',
      actor: 'human'
    }, testDir);

    transitionLog.logTransition({
      plan: 'plan-a.md',
      from: 'implementation',
      to: 'todo',
      actor: 'human'
    }, testDir);

    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(entries.length, 3, 'Should have 3 entries');
    console.log('# logTransition appends multiple entries');
  });

  test('logTransition includes validation data', () => {
    transitionLog.logTransition({
      plan: 'test-plan.md',
      from: 'functional',
      to: 'implementation',
      actor: 'human',
      validation: { passed: true, checks: 3, warnings: 0 }
    }, testDir);

    const entries = transitionLog.readLog(testDir);
    assert.ok(entries[0].validation, 'Should have validation');
    assert.strictEqual(entries[0].validation.passed, true, 'Validation should pass');
    assert.strictEqual(entries[0].validation.checks, 3, 'Should record check count');
    console.log('# logTransition includes validation data');
  });

  test('logTransition records human gate crossing', () => {
    transitionLog.logTransition({
      plan: 'test-plan.md',
      from: 'functional',
      to: 'implementation',
      actor: 'human',
      humanGate: true,
      marker: true
    }, testDir);

    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(entries[0].humanGate, true, 'Should record human gate');
    assert.strictEqual(entries[0].marker, true, 'Should record marker');
    console.log('# logTransition records human gate crossing');
  });

  test('getTransitionsForPlan filters by plan name', () => {
    transitionLog.logTransition({ plan: 'plan-a.md', from: 'functional', to: 'implementation', actor: 'human' }, testDir);
    transitionLog.logTransition({ plan: 'plan-b.md', from: 'functional', to: 'implementation', actor: 'human' }, testDir);
    transitionLog.logTransition({ plan: 'plan-a.md', from: 'implementation', to: 'todo', actor: 'human' }, testDir);

    const planATransitions = transitionLog.getTransitionsForPlan('plan-a.md', testDir);
    assert.strictEqual(planATransitions.length, 2, 'Should have 2 transitions for plan-a');

    const planBTransitions = transitionLog.getTransitionsForPlan('plan-b.md', testDir);
    assert.strictEqual(planBTransitions.length, 1, 'Should have 1 transition for plan-b');
    console.log('# getTransitionsForPlan filters by plan name');
  });

  test('getRecentTransitions returns last N entries', () => {
    for (let i = 0; i < 30; i++) {
      transitionLog.logTransition({
        plan: `plan-${i}.md`,
        from: 'functional',
        to: 'implementation',
        actor: 'human'
      }, testDir);
    }

    const recent10 = transitionLog.getRecentTransitions(10, testDir);
    assert.strictEqual(recent10.length, 10, 'Should return 10 entries');
    assert.strictEqual(recent10[0].plan, 'plan-20.md', 'First entry should be plan-20');
    assert.strictEqual(recent10[9].plan, 'plan-29.md', 'Last entry should be plan-29');

    const recent5 = transitionLog.getRecentTransitions(5, testDir);
    assert.strictEqual(recent5.length, 5, 'Should return 5 entries');
    console.log('# getRecentTransitions returns last N entries');
  });

  test('logTransition creates directories if missing', () => {
    // Remove the logs directory
    fs.rmSync(path.join(testDir, '.ctoc'), { recursive: true, force: true });

    transitionLog.logTransition({
      plan: 'test-plan.md',
      from: 'functional',
      to: 'implementation',
      actor: 'human'
    }, testDir);

    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(entries.length, 1, 'Should create directory and log entry');
    console.log('# logTransition creates directories if missing');
  });

  test('readLog handles corrupt JSON gracefully', () => {
    const logPath = transitionLog.getLogPath(testDir);
    fs.writeFileSync(logPath, 'not valid json{{{');

    const entries = transitionLog.readLog(testDir);
    assert.ok(Array.isArray(entries), 'Should return array');
    assert.strictEqual(entries.length, 0, 'Should return empty on corrupt data');
    console.log('# readLog handles corrupt JSON gracefully');
  });

  test('logTransition defaults actor to human', () => {
    transitionLog.logTransition({
      plan: 'test-plan.md',
      from: 'functional',
      to: 'implementation'
    }, testDir);

    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(entries[0].actor, 'human', 'Should default to human');
    console.log('# logTransition defaults actor to human');
  });
});

console.log('\nTransition Log Tests');
console.log('====================\n');

/**
 * Transition Log Tests
 * Unit tests for audit trail logging of plan state changes.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { test, describe, beforeEach, afterEach } = require('node:test');

const MODULE_PATH = require.resolve('../src/lib/transition-log.js');

describe('Transition Log Tests', () => {
  let testDir;
  let transitionLog;

  beforeEach(() => {
    // Create a temporary project directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-test-'));
    fs.mkdirSync(path.join(testDir, '.ctoc', 'logs'), { recursive: true });

    // Fresh require
    delete require.cache[require.resolve('../src/lib/transition-log.js')];
    transitionLog = require('../src/lib/transition-log.js');
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

  test('logTransition records override flag when a failed validation is forced (R5-B)', () => {
    // A forced Gate-3 crossing past a FAILED validation must be persisted
    // distinguishably from a clean approval. actions.approvePlan passes
    // override:true; the logEntry must carry it through to disk.
    const returned = transitionLog.logTransition({
      plan: 'forced-plan.md',
      from: 'review',
      to: 'done',
      actor: 'human',
      override: true
    }, testDir);

    assert.strictEqual(returned.override, true, 'returned entry carries override:true');

    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(entries[0].override, true, 'persisted line carries override:true');
    console.log('# logTransition records override flag');
  });

  test('logTransition defaults override to false for a clean transition', () => {
    const returned = transitionLog.logTransition({
      plan: 'clean-plan.md',
      from: 'review',
      to: 'done',
      actor: 'human'
    }, testDir);

    assert.strictEqual(returned.override, false, 'returned entry defaults override to false');

    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(entries[0].override, false, 'persisted line defaults override to false');
    console.log('# logTransition defaults override to false');
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

  // ----------------------------------------------------------------------
  // Durability tests (W11-s3) — behavior-level proofs that the audit trail
  // survives concurrency and corruption. These drive the durable-log-backed
  // append path, not the log's shape. No test doubles: real temp dirs, real
  // appends, and real separate `node` child processes contending for the SAME
  // transitions.json file (cross-process O_APPEND contention).
  // ----------------------------------------------------------------------

  /**
   * Spawn a real, separate node process that logs `count` transitions tagged
   * `tag` to the transitions.json under `projectPath`. Resolves on clean exit.
   */
  function spawnLogger(projectPath, count, tag) {
    const childCode =
      'const tl = require(process.argv[1]);' +
      'const projectPath = process.argv[2];' +
      'const count = Number(process.argv[3]);' +
      'const tag = process.argv[4];' +
      'for (let i = 0; i < count; i++) {' +
      '  tl.logTransition({ plan: tag + "-" + i + ".md", from: "functional", to: "implementation", actor: "agent" }, projectPath);' +
      '}';
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['-e', childCode, MODULE_PATH, projectPath, String(count), tag],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      );
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`logger ${tag} exited ${code}: ${stderr}`));
      });
    });
  }

  test('concurrency: two racing processes lose no transition (M14/M15)', async () => {
    // Seed N existing transitions in-process.
    const N = 10;
    for (let i = 0; i < N; i++) {
      transitionLog.logTransition({
        plan: `seed-${i}.md`, from: 'functional', to: 'implementation', actor: 'human'
      }, testDir);
    }
    assert.strictEqual(transitionLog.readLog(testDir).length, N, 'seed count');

    // Two separate processes each log 50 transitions to the SAME file, started
    // without awaiting between them → real cross-process O_APPEND contention.
    const perChild = 50;
    await Promise.all([
      spawnLogger(testDir, perChild, 'A'),
      spawnLogger(testDir, perChild, 'B')
    ]);

    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(
      entries.length,
      N + perChild * 2,
      'no transition may be lost under concurrency'
    );
    const aCount = entries.filter((e) => e.plan.startsWith('A-')).length;
    const bCount = entries.filter((e) => e.plan.startsWith('B-')).length;
    assert.strictEqual(aCount, perChild, 'all of process A survived');
    assert.strictEqual(bCount, perChild, 'all of process B survived');
    console.log('# concurrency: no lost transition across two processes');
  });

  test('corrupt transitions.json is quarantined, not reset (M14/M15)', () => {
    const logPath = transitionLog.getLogPath(testDir);
    const corruptBytes = 'nope';
    fs.writeFileSync(logPath, corruptBytes, 'utf8');

    const returned = transitionLog.logTransition({
      plan: 'after-corrupt.md', from: 'functional', to: 'implementation', actor: 'human'
    }, testDir);
    assert.strictEqual(returned.plan, 'after-corrupt.md', 'returns the logged entry');

    // (a) A quarantine sibling exists AND still holds the original corrupt bytes.
    const logDir = path.dirname(logPath);
    const siblings = fs.readdirSync(logDir).filter((f) => f.includes('.corrupt-'));
    assert.strictEqual(siblings.length, 1, 'exactly one quarantine file was created');
    const quarantined = fs.readFileSync(path.join(logDir, siblings[0]), 'utf8');
    assert.strictEqual(quarantined, corruptBytes, 'corrupt bytes preserved on disk');
    assert.ok(!siblings[0].includes(':'), 'quarantine name is Windows-safe (no colon)');

    // (b) The live log is fresh — only the new transition.
    const entries = transitionLog.readLog(testDir);
    assert.strictEqual(entries.length, 1, 'fresh log holds only the new entry');
    assert.strictEqual(entries[0].plan, 'after-corrupt.md', 'the fresh entry is the new one');
    console.log('# corrupt transitions.json quarantined, not reset');
  });

  test('legacy JSON-array log is read, then migrated + appended (M14/M15)', () => {
    const logPath = transitionLog.getLogPath(testDir);
    // Pre-write a legacy whole-file JSON array (the pre-JSONL on-disk format).
    const legacy = [
      { timestamp: '2026-07-13T00:00:00.000Z', plan: 'legacy-a.md', from: 'todo', to: 'in-progress', actor: 'human', validation: null, humanGate: false, marker: false }
    ];
    fs.writeFileSync(logPath, JSON.stringify(legacy), 'utf8');

    // readLog returns the legacy array as an Array (contract unchanged).
    const before = transitionLog.readLog(testDir);
    assert.ok(Array.isArray(before), 'readLog returns an Array');
    assert.strictEqual(before.length, 1, 'legacy entry is read');
    assert.strictEqual(before[0].plan, 'legacy-a.md', 'legacy content preserved');

    // Next logTransition migrates the array to JSONL and appends (length +1).
    transitionLog.logTransition({
      plan: 'legacy-b.md', from: 'in-progress', to: 'review', actor: 'agent'
    }, testDir);

    const after = transitionLog.readLog(testDir);
    assert.strictEqual(after.length, 2, 'legacy entry migrated and new entry appended');
    assert.strictEqual(after[0].plan, 'legacy-a.md', 'legacy entry survives migration');
    assert.strictEqual(after[1].plan, 'legacy-b.md', 'new entry appended');

    // On disk the file is now JSONL, no longer a JSON array.
    const raw = fs.readFileSync(logPath, 'utf8');
    assert.ok(!raw.trimStart().startsWith('['), 'no longer a JSON array on disk');
    console.log('# legacy array read + migrated + appended');
  });
});

console.log('\nTransition Log Tests');
console.log('====================\n');

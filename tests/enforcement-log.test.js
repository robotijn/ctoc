/**
 * Enforcement Log durability tests (W11-s2)
 *
 * Behavior-level tests that drive `src/lib/enforcement-log.js` after it is
 * rewired onto the shared `durable-log` append-only JSONL primitive. They prove
 * the M1 defect is fixed:
 *   1. concurrency — two real child processes each append; no write is lost,
 *   2. a corrupt log file is quarantined (bytes preserved), not reset to [],
 *   3. rotation honors MAX_ENTRIES (1000) and keeps the most recent,
 *   4. round-trip — an appended entry is read back with its timestamp.
 *
 * No test doubles: every test uses real files in a fresh os.tmpdir() sandbox,
 * and the concurrency test spawns real, separate `node` processes that contend
 * for the SAME file (cross-process O_APPEND contention).
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { test, describe, beforeEach, afterEach } = require('node:test');

const MODULE_PATH = require.resolve('../src/lib/enforcement-log.js');

describe('enforcement-log — lossless durable append (W11-s2 / M1)', () => {
  let root;
  let enforcementLog;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-enflog-'));
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    delete require.cache[MODULE_PATH];
    enforcementLog = require('../src/lib/enforcement-log.js');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const logPathFor = (r) => path.join(r, '.ctoc', 'logs', 'enforcement.json');

  /**
   * Spawn a real, separate node process that calls `logEnforcement` once against
   * `root`. Returns a promise resolving on a clean (code 0) exit.
   */
  function spawnLogger(projectRoot, tag) {
    const childCode =
      'const el = require(process.argv[1]);' +
      'const root = process.argv[2];' +
      'const tag = process.argv[3];' +
      "el.logEnforcement({ tool: 'Edit', target_file: 'src/' + tag + '.js', outcome: 'allow', tag: tag }, root);";
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['-e', childCode, MODULE_PATH, projectRoot, tag],
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

  test('1. concurrency — two racing processes each append; no entry lost (M1)', async () => {
    const logPath = logPathFor(root);
    // Seed N existing entries in-process.
    const N = 5;
    for (let i = 0; i < N; i++) {
      enforcementLog.logEnforcement({ tool: 'Edit', target_file: `seed-${i}.js`, outcome: 'allow' }, root);
    }
    assert.strictEqual(enforcementLog.readLog(root).length, N);

    // Two separate processes each append one record to the SAME file, started
    // without awaiting between them → real cross-process contention. On current
    // main (unguarded read-modify-write) one write is lost.
    await Promise.all([
      spawnLogger(root, 'A'),
      spawnLogger(root, 'B')
    ]);

    const entries = enforcementLog.readLog(root);
    assert.strictEqual(entries.length, N + 2, 'no append may be lost under concurrency');
    assert.strictEqual(entries.filter((e) => e.tag === 'A').length, 1, 'process A survived');
    assert.strictEqual(entries.filter((e) => e.tag === 'B').length, 1, 'process B survived');
    assert.ok(fs.existsSync(logPath));
    console.log('# concurrency: no lost update across two processes');
  });

  test('2. corrupt log file is quarantined, not reset (M1)', () => {
    const logsDir = path.join(root, '.ctoc', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logPath = logPathFor(root);
    const corruptBytes = 'garbage{';
    fs.writeFileSync(logPath, corruptBytes, 'utf8');

    enforcementLog.logEnforcement({ tool: 'Edit', outcome: 'allow' }, root);

    // (a) A quarantine sibling exists in the logs dir AND holds the corrupt bytes.
    const siblings = fs.readdirSync(logsDir).filter((f) => f.includes('.corrupt-'));
    assert.strictEqual(siblings.length, 1, 'exactly one quarantine file was created');
    const quarantined = fs.readFileSync(path.join(logsDir, siblings[0]), 'utf8');
    assert.strictEqual(quarantined, corruptBytes, 'corrupt bytes preserved on disk');
    assert.ok(!siblings[0].includes(':'), 'quarantine name is Windows-safe (no colon)');

    // (b) The live log is fresh — exactly the one new entry.
    const entries = enforcementLog.readLog(root);
    assert.strictEqual(entries.length, 1, 'fresh log holds only the new entry');
    assert.strictEqual(entries[0].outcome, 'allow');
    console.log('# corrupt file quarantined, not reset');
  });

  test('3. rotation honors MAX_ENTRIES=1000 and keeps the most recent', () => {
    for (let i = 0; i < 1005; i++) {
      enforcementLog.logEnforcement({ tool: 'Edit', outcome: 'allow', seq: i }, root);
    }
    const entries = enforcementLog.readLog(root);
    assert.strictEqual(entries.length, 1000, 'rotated to the 1000-entry cap');
    assert.strictEqual(entries[0].seq, 5, 'oldest kept is the 6th entry (last 1000)');
    assert.strictEqual(entries[entries.length - 1].seq, 1004, 'newest entry is last');
    console.log('# rotation honors MAX_ENTRIES (last 1000 kept)');
  });

  test('4. round-trip — logEnforcement then readLog returns the entry with a timestamp', () => {
    enforcementLog.logEnforcement({
      tool: 'Write',
      target_file: 'src/foo.js',
      plan_matched: 'todo/plan-a',
      outcome: 'block',
    }, root);

    const entries = enforcementLog.readLog(root);
    assert.strictEqual(entries.length, 1);
    const entry = entries[0];
    assert.strictEqual(entry.tool, 'Write');
    assert.strictEqual(entry.outcome, 'block');
    assert.strictEqual(entry.target_file, 'src/foo.js');
    assert.strictEqual(entry.plan_matched, 'todo/plan-a');
    assert.ok(typeof entry.timestamp === 'string', 'timestamp is present');
    assert.ok(!Number.isNaN(Date.parse(entry.timestamp)), 'timestamp is a valid ISO date');
    console.log('# round-trip: entry read back with timestamp');
  });
});

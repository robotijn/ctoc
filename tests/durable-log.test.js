/**
 * Durable Log Tests (W11-s1)
 *
 * Behavior-level tests for the shared append-only JSONL durability primitive
 * (`src/lib/durable-log.js`). These drive the mechanism, not its shape:
 *   - concurrent appends from real child processes lose no entry (M1/M14/M15),
 *   - a corrupt file is quarantined (bytes preserved), not reset to [] (M1),
 *   - legacy JSON-array files are read and migrated to JSONL in place,
 *   - a torn trailing line is skipped while prior entries survive,
 *   - rotation honors maxEntries,
 *   - a missing file reads as [] and a missing parent dir is created on append.
 *
 * No test doubles: every test uses real files in a fresh os.tmpdir() sandbox,
 * and the concurrency test spawns real, separate `node` child processes that
 * contend for the SAME file (cross-process O_APPEND contention).
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { test, describe, beforeEach, afterEach } = require('node:test');

const MODULE_PATH = require.resolve('../src/lib/durable-log.js');

describe('durable-log — append-only JSONL durability primitive', () => {
  let testDir;
  let durableLog;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-durable-'));
    delete require.cache[MODULE_PATH];
    durableLog = require('../src/lib/durable-log.js');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Spawn a real, separate node process that appends `count` records tagged
   * `tag` to `logPath`. Returns a promise resolving on a clean (code 0) exit.
   */
  function spawnAppender(logPath, count, tag) {
    const childCode =
      'const dl = require(process.argv[1]);' +
      'const logPath = process.argv[2];' +
      'const count = Number(process.argv[3]);' +
      'const tag = process.argv[4];' +
      'for (let i = 0; i < count; i++) { dl.appendEntry(logPath, { tag: tag, i: i }); }';
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['-e', childCode, MODULE_PATH, logPath, String(count), tag],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      );
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`appender ${tag} exited ${code}: ${stderr}`));
      });
    });
  }

  test('1. concurrency — two real processes append with no lost update (M1/M14/M15)', async () => {
    const logPath = path.join(testDir, 'enforcement.json');
    // Seed N existing JSONL entries.
    const N = 10;
    for (let i = 0; i < N; i++) durableLog.appendEntry(logPath, { seed: i });
    assert.strictEqual(durableLog.readEntries(logPath).length, N);

    // Two separate processes each append 50 records to the SAME file, started
    // without awaiting between them → real cross-process O_APPEND contention.
    const perChild = 50;
    await Promise.all([
      spawnAppender(logPath, perChild, 'A'),
      spawnAppender(logPath, perChild, 'B')
    ]);

    const entries = durableLog.readEntries(logPath);
    assert.strictEqual(
      entries.length,
      N + perChild * 2,
      'no append may be lost under concurrency'
    );
    // Both children's records are all present (no interleaving corruption).
    const aCount = entries.filter((e) => e.tag === 'A').length;
    const bCount = entries.filter((e) => e.tag === 'B').length;
    assert.strictEqual(aCount, perChild, 'all of process A survived');
    assert.strictEqual(bCount, perChild, 'all of process B survived');
    console.log('# concurrency: no lost update across two processes');
  });

  test('2. sequential bulk append never loses an entry', () => {
    const logPath = path.join(testDir, 'transitions.json');
    for (let i = 0; i < 500; i++) durableLog.appendEntry(logPath, { n: i, payload: `row-${i}` });
    const entries = durableLog.readEntries(logPath);
    assert.strictEqual(entries.length, 500);
    assert.deepStrictEqual(entries[0], { n: 0, payload: 'row-0' });
    assert.deepStrictEqual(entries[499], { n: 499, payload: 'row-499' });
    console.log('# sequential bulk: 500 entries intact');
  });

  test('3. corrupt file is quarantined, not reset (M1)', () => {
    const logPath = path.join(testDir, 'gate-violations.json');
    const corruptBytes = '{ this is not json';
    fs.writeFileSync(logPath, corruptBytes, 'utf8');

    const returned = durableLog.appendEntry(logPath, { a: 1 });
    assert.deepStrictEqual(returned, { a: 1 }, 'appendEntry returns the appended entry');

    // (a) A quarantine sibling exists AND holds the original corrupt bytes.
    const siblings = fs.readdirSync(testDir).filter((f) => f.includes('.corrupt-'));
    assert.strictEqual(siblings.length, 1, 'exactly one quarantine file was created');
    const quarantined = fs.readFileSync(path.join(testDir, siblings[0]), 'utf8');
    assert.strictEqual(quarantined, corruptBytes, 'corrupt bytes are preserved on disk');
    assert.ok(!siblings[0].includes(':'), 'quarantine name is Windows-safe (no colon)');

    // (b) The live log is fresh — only the new record.
    assert.deepStrictEqual(durableLog.readEntries(logPath), [{ a: 1 }]);
    console.log('# corrupt file quarantined, not reset');
  });

  test('4. legacy JSON-array file is read and migrated to JSONL on first append', () => {
    const logPath = path.join(testDir, 'legacy.json');
    fs.writeFileSync(logPath, JSON.stringify([{ x: 1 }, { x: 2 }]), 'utf8');

    // Read before any append: legacy array is returned as-is.
    assert.deepStrictEqual(durableLog.readEntries(logPath), [{ x: 1 }, { x: 2 }]);

    durableLog.appendEntry(logPath, { x: 3 });
    assert.deepStrictEqual(durableLog.readEntries(logPath), [{ x: 1 }, { x: 2 }, { x: 3 }]);

    // File is now JSONL: three newline-delimited JSON objects, not a JSON array.
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    assert.strictEqual(lines.length, 3, 'migrated to 3 JSONL lines');
    assert.ok(!raw.trimStart().startsWith('['), 'no longer a JSON array on disk');
    console.log('# legacy array read + migrated to JSONL');
  });

  test('5. torn trailing line is skipped; prior entries survive', () => {
    const logPath = path.join(testDir, 'torn.json');
    const goodLines =
      JSON.stringify({ ok: 1 }) + '\n' +
      JSON.stringify({ ok: 2 }) + '\n' +
      '{ "ok": 3, "half';  // truncated, no newline
    fs.writeFileSync(logPath, goodLines, 'utf8');

    const entries = durableLog.readEntries(logPath);
    assert.strictEqual(entries.length, 2, 'the two intact lines survive the torn tail');
    assert.deepStrictEqual(entries, [{ ok: 1 }, { ok: 2 }]);
    console.log('# torn trailing line skipped, prior entries survive');
  });

  test('6. rotation honors maxEntries and keeps the most recent', () => {
    const logPath = path.join(testDir, 'rotating.json');
    for (let i = 0; i < 10; i++) durableLog.appendEntry(logPath, { i }, { maxEntries: 5 });
    const entries = durableLog.readEntries(logPath);
    assert.strictEqual(entries.length, 5, 'rotated to maxEntries');
    assert.deepStrictEqual(entries, [{ i: 5 }, { i: 6 }, { i: 7 }, { i: 8 }, { i: 9 }]);
    console.log('# rotation honors maxEntries (last 5 kept)');
  });

  test('7. missing file reads as []; missing parent dir is created on append', () => {
    const missing = path.join(testDir, 'never-written.json');
    assert.deepStrictEqual(durableLog.readEntries(missing), []);

    const nested = path.join(testDir, 'deep', 'nested', 'dir', 'log.json');
    assert.ok(!fs.existsSync(path.dirname(nested)), 'parent dir absent before append');
    durableLog.appendEntry(nested, { created: true });
    assert.ok(fs.existsSync(nested), 'log file created');
    assert.deepStrictEqual(durableLog.readEntries(nested), [{ created: true }]);
    console.log('# missing file -> []; missing parent dir created');
  });

  test('8. wholly-unparseable non-empty file reads as [] (next append quarantines it)', () => {
    const logPath = path.join(testDir, 'garbage.json');
    fs.writeFileSync(logPath, 'not json at all, no braces', 'utf8');
    // readEntries never throws on garbage; it returns [] and leaves quarantine to append.
    assert.deepStrictEqual(durableLog.readEntries(logPath), []);
    console.log('# unparseable file reads as []');
  });

  test('9. quarantinePath produces a Windows-safe, in-directory sibling name', () => {
    const logPath = path.join(testDir, 'audit', 'log.json');
    const when = new Date('2026-07-13T19:14:43.810Z');
    const q = durableLog.quarantinePath(logPath, when);
    assert.strictEqual(path.dirname(q), path.dirname(logPath), 'stays in the same directory');
    assert.ok(q.startsWith(logPath + '.corrupt-'), 'derived from the original path');
    assert.ok(!path.basename(q).includes(':'), 'no colon (Windows filename safety)');
    console.log('# quarantinePath is safe + in-directory');
  });
});

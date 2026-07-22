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

/**
 * The enforcement log never manufactures the project marker (slice 00220).
 *
 * A best-effort audit write must NOT create `.ctoc/` when it does not already
 * exist — a fabricated `.ctoc/` is read by setup and by the private root
 * resolvers as proof the project exists, leaving it permanently half-initialised.
 * This is the third of the four `.ctoc/logs` marker producers 00177 identified.
 *
 * These cases deliberately do NOT reuse the shared `beforeEach` above (which
 * pre-creates `.ctoc/`): each builds its own tmp root in the exact state under
 * test. No permission fixtures, no writes to the real repo root — the
 * un-initialised world is built by simply NOT creating `.ctoc/`.
 */
describe('enforcement-log — never manufactures the project marker (00220)', () => {
  let enforcementLog;
  const roots = [];

  beforeEach(() => {
    delete require.cache[MODULE_PATH];
    enforcementLog = require('../src/lib/enforcement-log.js');
  });

  afterEach(() => {
    while (roots.length) {
      const r = roots.pop();
      fs.rmSync(r, { recursive: true, force: true });
    }
  });

  const freshRoot = () => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-enflog-00220-'));
    roots.push(r);
    return r;
  };

  test('5. a log write in an un-initialised directory creates no marker', () => {
    const root = freshRoot(); // NO .ctoc/ — a fresh, un-initialised checkout
    assert.ok(!fs.existsSync(path.join(root, '.ctoc')), 'precondition: no .ctoc/');

    const result = enforcementLog.logEnforcement(
      { tool: 'Write', target_file: 'plans/todo/x.md', outcome: 'whitelist' },
      root
    );

    assert.ok(
      !fs.existsSync(path.join(root, '.ctoc')),
      '.ctoc/ MUST NOT be manufactured by a best-effort audit write'
    );
    assert.deepStrictEqual(enforcementLog.readLog(root), [], 'nothing was persisted');
    assert.strictEqual(result, null, 'the skipped write returns null (best-effort no-op)');
    console.log('# 00220: un-initialised dir gets no .ctoc/ from a log write');
  });

  test('6. the human\'s enforcement decision is unaffected (no throw)', () => {
    const root = freshRoot(); // NO .ctoc/
    // The caller in PreToolUse.Edit.js wraps this best-effort; a skip must never
    // surface as a throw that would interfere with the allow/block outcome.
    assert.doesNotThrow(() => {
      enforcementLog.logEnforcement(
        { tool: 'Edit', target_file: 'src/foo.js', outcome: 'block' },
        root
      );
    }, 'an audit-log skip must not throw');
    console.log('# 00220: audit skip never interferes with the enforcement outcome');
  });

  test('7. a real project still gets its log (fix is not over-narrow)', () => {
    const root = freshRoot();
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true }); // an initialised project

    enforcementLog.logEnforcement(
      { tool: 'Write', target_file: 'src/bar.js', outcome: 'block' },
      root
    );

    const entries = enforcementLog.readLog(root);
    assert.strictEqual(entries.length, 1, 'the entry is appended in a real project');
    assert.strictEqual(entries[0].outcome, 'block');
    assert.ok(typeof entries[0].timestamp === 'string', 'timestamp present');
    console.log('# 00220: an initialised project still records its audit entry');
  });

  test('8. the leaf logs/ is created under an existing .ctoc/ parent', () => {
    const root = freshRoot();
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true }); // parent exists, NO logs/ leaf
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'logs')), 'precondition: no logs/ leaf');

    enforcementLog.logEnforcement({ tool: 'Edit', outcome: 'allow' }, root);

    const logFile = path.join(root, '.ctoc', 'logs', 'enforcement.json');
    assert.ok(fs.existsSync(logFile), 'the leaf .ctoc/logs/enforcement.json is created');
    const entries = enforcementLog.readLog(root);
    assert.strictEqual(entries.length, 1, 'the entry is present under the created leaf');
    console.log('# 00220: leaf logs/ is created beneath an existing marker');
  });

  test('9. a bad root never throws and never manufactures anything', () => {
    // With a falsy root, current main resolves the destination against the process
    // working directory. Run this inside an isolated tmp cwd so the reproduction
    // can never write into the real repo root, and so we can observe whether a
    // `.ctoc/` is fabricated under cwd.
    const cwdSandbox = freshRoot();
    const originalCwd = process.cwd();
    process.chdir(cwdSandbox);
    try {
      for (const badRoot of ['', undefined]) {
        let result;
        assert.doesNotThrow(() => {
          result = enforcementLog.logEnforcement({ tool: 'Edit', outcome: 'allow' }, badRoot);
        }, `a bad root (${JSON.stringify(badRoot)}) must not throw`);
        assert.strictEqual(result, null, 'a bad root returns null');
      }
      assert.ok(
        !fs.existsSync(path.join(cwdSandbox, '.ctoc')),
        'a bad root must never fabricate .ctoc/ under the process working directory'
      );
    } finally {
      process.chdir(originalCwd);
    }
    console.log('# 00220: a bad root is a total no-op, no .ctoc/ anywhere');
  });
});

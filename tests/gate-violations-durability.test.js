'use strict';

/**
 * W11-s4 — gate-violations.json durability across BOTH writers.
 *
 * `gate-violations.json` has two independent writers that share one on-disk file:
 *   - src/lib/violation-tracker.js      (dashboard / menu side)
 *   - src/hooks/human-gate-check.js     (the PreToolUse residency-revert hook)
 *
 * Historically both used the identical racy read-modify-write (`JSON.parse`
 * whole file → push → `writeFileSync` whole file) with a silent `catch → []`.
 * Under concurrency one writer's entry was lost; a corrupt file erased the whole
 * violation history. This slice rewires BOTH onto the shared append-only JSONL
 * primitive `src/lib/durable-log.js` (s1). These tests DRIVE the real modules
 * against real temp trees and real child processes — no test doubles.
 *
 * Three behaviors are asserted:
 *   1. Concurrency across both writers loses no entry (real child processes,
 *      real O_APPEND contention) — success-metric #3 of the parent plan.
 *   2. A corrupt gate-violations.json is quarantined aside (bytes preserved),
 *      not silently reset, and a fresh log continues with only the new entry.
 *   3. The two writers agree on the on-disk format: an entry written by one is
 *      read back verbatim by the other (proves both use the same JSONL store).
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const TRACKER_PATH = path.join(REPO, 'src', 'lib', 'violation-tracker.js');
const GATE_PATH = path.join(REPO, 'src', 'hooks', 'human-gate-check.js');
// durable-log captures no cwd, so it is safe to require once at top level.
const durableLog = require(path.join(REPO, 'src', 'lib', 'durable-log.js'));

/** Hermetic temp root; realpath defuses the macOS /var -> /private/var symlink. */
function mkTempRoot(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function violationsFile(root) {
  return path.join(root, '.ctoc', 'logs', 'gate-violations.json');
}

/**
 * Run `<module>.logViolation` `k` times in a REAL child process whose cwd is
 * `root` (both modules compute the log path from process.cwd() at require-time).
 * Returns a promise resolving when the child exits 0.
 */
function runWriterChild(root, modulePath, tag, k) {
  return new Promise((resolve, reject) => {
    const script = `
      'use strict';
      const mod = require(${JSON.stringify(modulePath)});
      for (let i = 0; i < ${k}; i++) {
        mod.logViolation({
          id: ${JSON.stringify(tag)} + '-' + i,
          plan: ${JSON.stringify(tag)} + '-' + i,
          timestamp: new Date().toISOString(),
          status: 'pending_reapproval'
        });
      }
    `;
    const child = spawn(process.execPath, ['-e', script], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`writer child (${tag}) exited ${code}`))));
  });
}

// ---------------------------------------------------------------------------
// 1. Concurrency across BOTH writers (real child processes, real contention).
// ---------------------------------------------------------------------------
describe('gate-violations durability — concurrency across both writers', () => {
  let root;

  beforeEach(() => {
    root = mkTempRoot('ctoc-gvcon-');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('two concurrent writers (tracker + gate) lose no entry', async () => {
    const N = 5; // seed count
    const K = 15; // appends per writer; N + 2*K = 35 stays under the 100-entry cap
    const file = violationsFile(root);

    // Seed via the shared primitive so the on-disk format is the canonical JSONL.
    for (let i = 0; i < N; i++) {
      durableLog.appendEntry(file, { id: `seed-${i}`, plan: `seed-${i}`, timestamp: new Date().toISOString() }, { maxEntries: 100 });
    }

    // Race the two independent writers against the SAME file, concurrently.
    await Promise.all([
      runWriterChild(root, TRACKER_PATH, 'tracker', K),
      runWriterChild(root, GATE_PATH, 'gate', K),
    ]);

    const entries = durableLog.readEntries(file);
    assert.equal(entries.length, N + 2 * K, 'no entry lost under concurrent appends from both writers');

    // Both writers' entries survived (neither was clobbered by the other).
    const plans = new Set(entries.map((e) => e.plan));
    for (let i = 0; i < K; i++) {
      assert.ok(plans.has(`tracker-${i}`), `tracker-${i} present`);
      assert.ok(plans.has(`gate-${i}`), `gate-${i} present`);
    }
  });
});

// ---------------------------------------------------------------------------
// In-process behaviors: chdir into a temp root BEFORE a fresh require so both
// modules resolve the log path into the sandbox (they read cwd at load time).
// ---------------------------------------------------------------------------
describe('gate-violations durability — corruption + cross-writer format', () => {
  let root;
  let originalCwd;
  let tracker;
  let gate;

  function freshLoad() {
    delete require.cache[require.resolve(TRACKER_PATH)];
    delete require.cache[require.resolve(GATE_PATH)];
    return { tracker: require(TRACKER_PATH), gate: require(GATE_PATH) };
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    root = mkTempRoot('ctoc-gvinp-');
    process.chdir(root);
    ({ tracker, gate } = freshLoad());
  });

  afterEach(() => {
    delete require.cache[require.resolve(TRACKER_PATH)];
    delete require.cache[require.resolve(GATE_PATH)];
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('corrupt gate-violations.json is quarantined, not reset', () => {
    const file = violationsFile(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const corruptBytes = '{ this is not valid json at all — truncated mid-write';
    fs.writeFileSync(file, corruptBytes);

    tracker.logViolation({ id: 'after-corrupt', plan: 'after-corrupt', timestamp: new Date().toISOString() });

    const dir = path.dirname(file);
    const quarantined = fs.readdirSync(dir).filter((f) => f.startsWith('gate-violations.json.corrupt-'));
    assert.equal(quarantined.length, 1, 'the corrupt file was renamed aside, not deleted');
    assert.equal(
      fs.readFileSync(path.join(dir, quarantined[0]), 'utf8'),
      corruptBytes,
      'the quarantined file still holds the original corrupt bytes',
    );

    const entries = tracker.loadViolations();
    assert.equal(entries.length, 1, 'a fresh log continues with only the new entry');
    assert.equal(entries[0].plan, 'after-corrupt');
  });

  test('cross-writer agreement — tracker writes, gate reads the same entry', () => {
    const entry = { id: 'xw-1', plan: 'written-by-tracker', timestamp: new Date().toISOString(), status: 'pending_reapproval' };
    tracker.logViolation(entry);

    const viaGate = gate.loadViolations();
    assert.equal(viaGate.length, 1, 'gate reads the tracker-written entry');
    assert.equal(viaGate[0].plan, 'written-by-tracker');
    assert.equal(viaGate[0].id, 'xw-1');
  });

  test('cross-writer agreement — gate writes, tracker reads the same entry', () => {
    const entry = { id: 'xw-2', plan: 'written-by-gate', timestamp: new Date().toISOString(), status: 'pending_reapproval' };
    gate.logViolation(entry);

    const viaTracker = tracker.loadViolations();
    assert.equal(viaTracker.length, 1, 'tracker reads the gate-written entry');
    assert.equal(viaTracker[0].plan, 'written-by-gate');
    assert.equal(viaTracker[0].id, 'xw-2');
  });
});

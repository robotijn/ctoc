/**
 * Governance Modules (Group B) — contract tests
 *
 * Zero-coverage lib modules under test:
 *   - src/lib/hash-utils.js
 *   - src/lib/config-baseline.js
 *   - src/lib/reconciliation.js
 *   - src/lib/violation-tracker.js
 *
 * Mechanics: node:test + node:assert/strict. Modules loaded by absolute path
 * via require(path.join(REPO, 'src/lib/<name>.js')). Filesystem modules run
 * in hermetic temp dirs (mkdtempSync -> realpathSync, to defuse macOS
 * /var -> /private/var symlink differences). Everything is cleaned up in
 * afterEach. No global state leaks between tests.
 *
 * Each module asserts the DOCUMENTED contract:
 *   (a) happy path of every exported function;
 *   (b) the core correctness/security property;
 *   (c) error paths + malformed input (must not throw uncaught).
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = path.resolve(__dirname, '..');

const hashUtils = require(path.join(REPO, 'src/lib/hash-utils.js'));

/** Create a hermetic temp dir; realpath defuses the macOS /var symlink. */
function mkTempRoot(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** Reference SHA-256 hex, computed independently of the module under test. */
function refSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ---------------------------------------------------------------------------
// hash-utils.js
// ---------------------------------------------------------------------------
describe('hash-utils', () => {
  let dir;

  beforeEach(() => {
    dir = mkTempRoot('ctoc-hashutils-');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('HASH_ALGORITHM is sha256 (documented algorithm)', () => {
    assert.equal(hashUtils.HASH_ALGORITHM, 'sha256');
  });

  test('hashString — matches an independent SHA-256 (correct algorithm)', () => {
    const input = 'the quick brown fox';
    assert.equal(hashUtils.hashString(input), refSha256(Buffer.from(input)));
  });

  test('hashString — deterministic & stable across runs', () => {
    const a = hashUtils.hashString('payload');
    const b = hashUtils.hashString('payload');
    assert.equal(a, b);
    // Known SHA-256 of the empty string — stable, well-published value.
    assert.equal(
      hashUtils.hashString(''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  test('hashString — collision-resistant usage: distinct inputs differ', () => {
    assert.notEqual(hashUtils.hashString('a'), hashUtils.hashString('b'));
    // One-bit / one-char difference must change the digest (avalanche).
    assert.notEqual(hashUtils.hashString('hello'), hashUtils.hashString('hellp'));
  });

  test('hashFile — hashes an existing file matching independent SHA-256', () => {
    const f = path.join(dir, 'a.txt');
    const content = Buffer.from('file contents here');
    fs.writeFileSync(f, content);
    assert.equal(hashUtils.hashFile(f), refSha256(content));
  });

  test('hashFile — equals hashString for the same bytes (consistency)', () => {
    const f = path.join(dir, 'b.txt');
    fs.writeFileSync(f, 'cross-check');
    assert.equal(hashUtils.hashFile(f), hashUtils.hashString('cross-check'));
  });

  test('hashFile — returns null when file is missing (documented null)', () => {
    assert.equal(hashUtils.hashFile(path.join(dir, 'nope.txt')), null);
  });

  test('hashFiles — builds a map of path -> hash, skipping missing files', () => {
    const f1 = path.join(dir, 'one.txt');
    const f2 = path.join(dir, 'two.txt');
    const missing = path.join(dir, 'gone.txt');
    fs.writeFileSync(f1, '1');
    fs.writeFileSync(f2, '2');

    const map = hashUtils.hashFiles([f1, f2, missing]);
    assert.equal(map[f1], hashUtils.hashString('1'));
    assert.equal(map[f2], hashUtils.hashString('2'));
    assert.ok(!(missing in map), 'missing file must not appear in the map');
    assert.equal(Object.keys(map).length, 2);
  });

  test('hashFiles — empty input yields empty map (no throw)', () => {
    assert.deepEqual(hashUtils.hashFiles([]), {});
  });

  test('hasFileChanged — unchanged when current hash equals cache', () => {
    const f = path.join(dir, 'c.txt');
    fs.writeFileSync(f, 'stable');
    const h = hashUtils.hashFile(f);
    const r = hashUtils.hasFileChanged(f, h);
    assert.equal(r.changed, false);
    assert.equal(r.reason, 'unchanged');
    assert.equal(r.currentHash, h);
    assert.equal(r.cachedHash, h);
  });

  test('hasFileChanged — content_changed when bytes differ from cache', () => {
    const f = path.join(dir, 'd.txt');
    fs.writeFileSync(f, 'v1');
    const old = hashUtils.hashFile(f);
    fs.writeFileSync(f, 'v2');
    const r = hashUtils.hasFileChanged(f, old);
    assert.equal(r.changed, true);
    assert.equal(r.reason, 'content_changed');
    assert.notEqual(r.currentHash, old);
  });

  test('hasFileChanged — no_cache when cachedHash is falsy', () => {
    const f = path.join(dir, 'e.txt');
    fs.writeFileSync(f, 'x');
    const r = hashUtils.hasFileChanged(f, null);
    assert.equal(r.changed, true);
    assert.equal(r.reason, 'no_cache');
    assert.equal(r.cachedHash, null);
    assert.ok(r.currentHash);
  });

  test('hasFileChanged — file_missing reported as changed', () => {
    const r = hashUtils.hasFileChanged(path.join(dir, 'absent.txt'), 'deadbeef');
    assert.equal(r.changed, true);
    assert.equal(r.reason, 'file_missing');
    assert.equal(r.currentHash, null);
    assert.equal(r.cachedHash, 'deadbeef');
  });

  test('findChangedFiles — partitions into changed/unchanged/missing/newFiles', () => {
    const stable = path.join(dir, 'stable.txt');
    const edited = path.join(dir, 'edited.txt');
    const fresh = path.join(dir, 'fresh.txt');
    const gone = path.join(dir, 'gone.txt');
    fs.writeFileSync(stable, 's');
    fs.writeFileSync(edited, 'old');
    fs.writeFileSync(fresh, 'new');

    const cached = {
      [stable]: hashUtils.hashString('s'),
      [edited]: hashUtils.hashString('old'),
      [gone]: hashUtils.hashString('whatever'),
      // `fresh` deliberately absent from cache -> newFile
    };
    fs.writeFileSync(edited, 'EDITED'); // change after caching

    const r = hashUtils.findChangedFiles([stable, edited, fresh, gone], cached);

    assert.deepEqual(r.unchanged, [stable]);
    assert.ok(r.changed.includes(edited), 'edited file must be in changed');
    assert.ok(r.changed.includes(fresh), 'new file must also be in changed');
    assert.deepEqual(r.newFiles, [fresh]);
    assert.deepEqual(r.missing, [gone]);
    assert.equal(r.currentHashes[stable], hashUtils.hashString('s'));
    assert.equal(r.currentHashes[gone], null);
  });

  test('findChangedFiles — default empty cache treats every file as new/changed', () => {
    const f = path.join(dir, 'solo.txt');
    fs.writeFileSync(f, 'z');
    const r = hashUtils.findChangedFiles([f]);
    assert.deepEqual(r.newFiles, [f]);
    assert.deepEqual(r.changed, [f]);
    assert.deepEqual(r.unchanged, []);
  });

  test('hashFilesComposite — order-independent (sorts paths) & deterministic', () => {
    const f1 = path.join(dir, 'aaa.txt');
    const f2 = path.join(dir, 'bbb.txt');
    fs.writeFileSync(f1, 'A');
    fs.writeFileSync(f2, 'B');

    const c1 = hashUtils.hashFilesComposite([f1, f2]);
    const c2 = hashUtils.hashFilesComposite([f2, f1]);
    assert.equal(c1, c2, 'composite hash must be independent of input order');
    assert.equal(c1, hashUtils.hashFilesComposite([f1, f2]), 'deterministic');
  });

  test('hashFilesComposite — changes when any member file changes', () => {
    const f1 = path.join(dir, 'm1.txt');
    const f2 = path.join(dir, 'm2.txt');
    fs.writeFileSync(f1, 'A');
    fs.writeFileSync(f2, 'B');
    const before = hashUtils.hashFilesComposite([f1, f2]);
    fs.writeFileSync(f2, 'B-prime');
    const after = hashUtils.hashFilesComposite([f1, f2]);
    assert.notEqual(before, after);
  });

  test('createHashEntry — returns hash + metadata for existing file', () => {
    const f = path.join(dir, 'meta.txt');
    fs.writeFileSync(f, 'meta-body');
    const entry = hashUtils.createHashEntry(f);
    assert.equal(entry.hash, hashUtils.hashString('meta-body'));
    assert.equal(typeof entry.size, 'number');
    assert.equal(entry.size, Buffer.byteLength('meta-body'));
    assert.ok(!Number.isNaN(Date.parse(entry.lastModified)), 'ISO timestamp');
  });

  test('createHashEntry — null fields for missing file (no throw)', () => {
    const entry = hashUtils.createHashEntry(path.join(dir, 'missing.txt'));
    assert.equal(entry.hash, null);
    assert.equal(entry.lastModified, null);
    assert.equal(entry.size, null);
  });

  test('verifyFileIntegrity — valid when hash matches (timing-safe path)', () => {
    const f = path.join(dir, 'intact.txt');
    fs.writeFileSync(f, 'untampered');
    const expected = hashUtils.hashFile(f);
    const r = hashUtils.verifyFileIntegrity(f, expected);
    assert.equal(r.valid, true);
    assert.equal(r.currentHash, expected);
    assert.equal(r.expectedHash, expected);
  });

  test('verifyFileIntegrity — invalid when content was tampered', () => {
    const f = path.join(dir, 'tampered.txt');
    fs.writeFileSync(f, 'original');
    const expected = hashUtils.hashFile(f);
    fs.writeFileSync(f, 'TAMPERED'); // attacker edits the file
    const r = hashUtils.verifyFileIntegrity(f, expected);
    assert.equal(r.valid, false);
    assert.notEqual(r.currentHash, expected);
  });

  test('verifyFileIntegrity — missing file is invalid with documented error', () => {
    const r = hashUtils.verifyFileIntegrity(path.join(dir, 'nofile.txt'), 'aa');
    assert.equal(r.valid, false);
    assert.match(r.error, /does not exist|cannot be read/i);
  });

  test('verifyFileIntegrity — hash-length mismatch handled, not thrown', () => {
    const f = path.join(dir, 'lenmismatch.txt');
    fs.writeFileSync(f, 'data');
    // expected hash with wrong (odd/short) length -> timingSafeEqual throws,
    // module must catch and report a length mismatch.
    const r = hashUtils.verifyFileIntegrity(f, 'abcd');
    assert.equal(r.valid, false);
    assert.match(r.error, /length mismatch/i);
  });

  test('hashDirectory — recurses, hashes files, excludes node_modules by default', () => {
    fs.writeFileSync(path.join(dir, 'root.txt'), 'r');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sub', 'nested.txt'), 'n');
    fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'x.js'), 'ignored');

    const r = hashUtils.hashDirectory(dir);
    assert.equal(r.directory, dir);
    assert.equal(r.fileCount, 2, 'node_modules must be excluded');
    assert.ok(r.compositeHash, 'composite hash present');
    // Every returned file hash is the correct SHA-256.
    for (const [fp, h] of Object.entries(r.files)) {
      assert.equal(h, refSha256(fs.readFileSync(fp)));
    }
  });

  test('hashDirectory — deterministic across runs for same tree', () => {
    fs.writeFileSync(path.join(dir, 'one.txt'), '1');
    fs.writeFileSync(path.join(dir, 'two.txt'), '2');
    const a = hashUtils.hashDirectory(dir);
    const b = hashUtils.hashDirectory(dir);
    assert.equal(a.compositeHash, b.compositeHash);
    assert.equal(a.fileCount, b.fileCount);
  });

  test('hashDirectory — non-existent directory returns empty result (no throw)', () => {
    const r = hashUtils.hashDirectory(path.join(dir, 'does-not-exist'));
    assert.equal(r.fileCount, 0);
    assert.deepEqual(r.files, {});
    // compositeHash is the hash of the empty join -> stable empty-string hash.
    assert.equal(r.compositeHash, hashUtils.hashString(''));
  });
});

// ---------------------------------------------------------------------------
// config-baseline.js
// ---------------------------------------------------------------------------
describe('violation-tracker', () => {
  const MODULE_PATH = path.join(REPO, 'src/lib/violation-tracker.js');
  let root;
  let originalCwd;
  let tracker;

  function freshLoad() {
    delete require.cache[require.resolve(MODULE_PATH)];
    return require(MODULE_PATH);
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    root = mkTempRoot('ctoc-violations-');
    process.chdir(root); // module reads process.cwd() at load time
    tracker = freshLoad();
  });

  afterEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('loadViolations — returns [] when no log file yet (no throw)', () => {
    assert.deepEqual(tracker.loadViolations(), []);
  });

  test('logViolation + loadViolations — records a violation (round-trip)', () => {
    const v = { plan: 'plan-a', timestamp: new Date().toISOString(), status: 'pending_reapproval' };
    tracker.logViolation(v);
    const all = tracker.loadViolations();
    assert.equal(all.length, 1);
    assert.equal(all[0].plan, 'plan-a');
    // Persisted to .ctoc/logs/gate-violations.json under the temp cwd. The store
    // is append-only JSONL (W11-s4): one JSON object per line, not a whole-file
    // JSON array — so assert on the parsed line count, not JSON.parse(whole).
    const file = path.join(root, '.ctoc', 'logs', 'gate-violations.json');
    assert.ok(fs.existsSync(file), 'violations file persisted');
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim().length > 0);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).plan, 'plan-a');
  });

  test('saveViolations — overwrites the full list (explicit persistence)', () => {
    tracker.saveViolations([{ plan: 'x' }, { plan: 'y' }]);
    assert.equal(tracker.loadViolations().length, 2);
    tracker.saveViolations([{ plan: 'z' }]);
    const all = tracker.loadViolations();
    assert.equal(all.length, 1);
    assert.equal(all[0].plan, 'z');
  });

  test('logViolation — caps history at the documented last 100 entries', () => {
    for (let i = 0; i < 130; i++) {
      tracker.logViolation({ plan: `p${i}`, timestamp: new Date().toISOString() });
    }
    const all = tracker.loadViolations();
    assert.equal(all.length, 100, 'history capped at 100');
    // The oldest entries are dropped; the most recent are retained.
    assert.equal(all[all.length - 1].plan, 'p129');
    assert.equal(all[0].plan, 'p30');
  });

  test('getLastAck — defaults to { acknowledgedAt: null } before any ack', () => {
    assert.deepEqual(tracker.getLastAck(), { acknowledgedAt: null });
  });

  test('acknowledge + getLastAck — round-trip stores an ISO timestamp', () => {
    tracker.acknowledge();
    const ack = tracker.getLastAck();
    assert.ok(ack.acknowledgedAt, 'acknowledgedAt set');
    assert.ok(!Number.isNaN(Date.parse(ack.acknowledgedAt)), 'valid ISO timestamp');
    assert.ok(fs.existsSync(path.join(root, '.ctoc', 'logs', 'last-ack.json')));
  });

  test('getUnacknowledgedViolations — returns all when never acknowledged', () => {
    tracker.logViolation({ plan: 'a', timestamp: new Date().toISOString() });
    tracker.logViolation({ plan: 'b', timestamp: new Date().toISOString() });
    assert.equal(tracker.getUnacknowledgedViolations().length, 2);
  });

  test('getUnacknowledgedViolations — only returns those after the ack time', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    tracker.logViolation({ plan: 'old', timestamp: past });
    tracker.acknowledge(); // ack = now
    tracker.logViolation({ plan: 'new', timestamp: future });

    const unacked = tracker.getUnacknowledgedViolations();
    assert.equal(unacked.length, 1, 'only the post-ack violation is unacknowledged');
    assert.equal(unacked[0].plan, 'new');
  });

  test('markResolved — flips matching pending_reapproval entries to resolved', () => {
    tracker.saveViolations([
      { plan: 'target', status: 'pending_reapproval' },
      { plan: 'target', status: 'resolved' },
      { plan: 'other', status: 'pending_reapproval' },
    ]);
    tracker.markResolved('target');
    const all = tracker.loadViolations();

    const target = all.filter(v => v.plan === 'target');
    assert.ok(target.every(v => v.status === 'resolved'), 'all target entries resolved');
    const resolvedOne = target.find(v => v.resolution);
    assert.equal(resolvedOne.resolution, 'Re-approved via menu');
    assert.ok(!Number.isNaN(Date.parse(resolvedOne.resolvedAt)), 'resolvedAt is ISO');

    // Non-matching plan untouched.
    assert.equal(all.find(v => v.plan === 'other').status, 'pending_reapproval');
  });

  test('markResolved — only affects pending_reapproval, not other statuses', () => {
    tracker.saveViolations([{ plan: 'p', status: 'acknowledged' }]);
    tracker.markResolved('p');
    assert.equal(tracker.loadViolations()[0].status, 'acknowledged', 'untouched');
  });

  test('markResolved — unknown plan is a no-op (no throw)', () => {
    tracker.saveViolations([{ plan: 'p', status: 'pending_reapproval' }]);
    tracker.markResolved('does-not-exist');
    assert.equal(tracker.loadViolations()[0].status, 'pending_reapproval');
  });

  test('loadViolations — corrupt JSON file is tolerated, returns [] (no throw)', () => {
    fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'logs', 'gate-violations.json'), '{ not valid json');
    assert.deepEqual(tracker.loadViolations(), []);
  });

  test('getLastAck — corrupt ack file is tolerated (no throw)', () => {
    fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'logs', 'last-ack.json'), 'garbage');
    assert.deepEqual(tracker.getLastAck(), { acknowledgedAt: null });
  });
});

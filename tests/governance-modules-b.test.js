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
const { execSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');

const hashUtils = require(path.join(REPO, 'src/lib/hash-utils.js'));
const configBaseline = require(path.join(REPO, 'src/lib/config-baseline.js'));
const reconciliation = require(path.join(REPO, 'src/lib/reconciliation.js'));

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
describe('config-baseline', () => {
  let root;

  /** Build a minimal project skeleton with a VERSION and some source files. */
  function scaffold(version) {
    fs.writeFileSync(path.join(root, 'VERSION'), version + '\n');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'main.js'), 'console.log(1);\n');
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# doc\n');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { left: '^1.0.0' }, devDependencies: { jest: '^29' } })
    );
  }

  beforeEach(() => {
    root = mkTempRoot('ctoc-baseline-');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('exports BASELINES_ROOT and SOURCE_DIRS (documented constants)', () => {
    assert.equal(configBaseline.BASELINES_ROOT, '.ctoc/baselines');
    assert.ok(Array.isArray(configBaseline.SOURCE_DIRS));
    assert.ok(configBaseline.SOURCE_DIRS.includes('src'));
  });

  test('writeBaseline — writes manifest + file-hashes, returns digest', () => {
    scaffold('1.2.3');
    const r = configBaseline.writeBaseline(root, { activeRegimes: [] });
    assert.equal(r.version, '1.2.3');
    assert.equal(r.pre_existing, false);
    assert.match(r.baseline_hash, /^[0-9a-f]{64}$/, 'baseline hash is SHA-256 hex');
    assert.ok(r.file_count >= 2, 'at least src/main.js and docs/a.md counted');

    const manifestPath = path.join(root, r.manifest_path);
    assert.ok(fs.existsSync(manifestPath));
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    assert.match(manifest, /version: 1\.2\.3/);
    assert.match(manifest, new RegExp('baseline_hash: ' + r.baseline_hash));
    assert.match(manifest, /left: \^1\.0\.0/, 'captures dependencies');
    assert.match(manifest, /jest: \^29/, 'captures devDependencies');

    const hashesPath = path.join(root, configBaseline.BASELINES_ROOT, '1.2.3', 'file-hashes.txt');
    assert.ok(fs.existsSync(hashesPath), 'file-hashes.txt written');
  });

  test('writeBaseline — idempotent: same source yields same digest (documented)', () => {
    scaffold('2.0.0');
    const first = configBaseline.writeBaseline(root, { force: true, activeRegimes: [] });
    const second = configBaseline.writeBaseline(root, { force: true, activeRegimes: [] });
    assert.equal(first.baseline_hash, second.baseline_hash);
  });

  test('writeBaseline — pre-existing baseline returned without rewrite', () => {
    scaffold('3.1.0');
    const first = configBaseline.writeBaseline(root, { activeRegimes: [] });
    assert.equal(first.pre_existing, false);
    const second = configBaseline.writeBaseline(root, { activeRegimes: [] });
    assert.equal(second.pre_existing, true);
    assert.equal(second.baseline_hash, first.baseline_hash);
  });

  test('writeBaseline — digest changes when a source file changes (tamper-evident)', () => {
    scaffold('4.0.0');
    const before = configBaseline.writeBaseline(root, { activeRegimes: [] });
    fs.writeFileSync(path.join(root, 'src', 'main.js'), 'console.log(2);\n'); // tamper
    const after = configBaseline.writeBaseline(root, { force: true, activeRegimes: [] });
    assert.notEqual(after.baseline_hash, before.baseline_hash);
  });

  test('writeBaseline — explicit version option overrides VERSION file', () => {
    scaffold('1.0.0');
    const r = configBaseline.writeBaseline(root, { version: '9.9.9', activeRegimes: [] });
    assert.equal(r.version, '9.9.9');
    assert.ok(fs.existsSync(path.join(root, configBaseline.BASELINES_ROOT, '9.9.9', 'manifest.yaml')));
  });

  test('writeBaseline — throws when VERSION missing and no version opt (documented)', () => {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'main.js'), 'x');
    assert.throws(
      () => configBaseline.writeBaseline(root, { activeRegimes: [] }),
      /VERSION file missing or empty/
    );
  });

  test('verifyBaseline — clean tree reconciles (ok, zero drift)', () => {
    scaffold('5.0.0');
    configBaseline.writeBaseline(root, { activeRegimes: [] });
    const v = configBaseline.verifyBaseline(root, '5.0.0');
    assert.equal(v.ok, true);
    assert.equal(v.drift_count, 0);
    assert.deepEqual(v.drift, []);
  });

  test('verifyBaseline — detects changed file as drift (status: changed)', () => {
    scaffold('6.0.0');
    configBaseline.writeBaseline(root, { activeRegimes: [] });
    fs.writeFileSync(path.join(root, 'src', 'main.js'), 'MUTATED\n');
    const v = configBaseline.verifyBaseline(root, '6.0.0');
    assert.equal(v.ok, false);
    const changed = v.drift.find(d => d.relpath.endsWith('main.js'));
    assert.ok(changed, 'changed file present in drift');
    assert.equal(changed.status, 'changed');
    assert.ok(changed.expected && changed.actual && changed.expected !== changed.actual);
  });

  test('verifyBaseline — detects missing baseline file (status: missing)', () => {
    scaffold('7.0.0');
    configBaseline.writeBaseline(root, { activeRegimes: [] });
    fs.rmSync(path.join(root, 'docs', 'a.md'));
    const v = configBaseline.verifyBaseline(root, '7.0.0');
    assert.equal(v.ok, false);
    const miss = v.drift.find(d => d.relpath.endsWith('a.md'));
    assert.ok(miss);
    assert.equal(miss.status, 'missing');
  });

  test('verifyBaseline — detects newly added file (status: added)', () => {
    scaffold('8.0.0');
    configBaseline.writeBaseline(root, { activeRegimes: [] });
    fs.writeFileSync(path.join(root, 'src', 'extra.js'), 'new file\n');
    const v = configBaseline.verifyBaseline(root, '8.0.0');
    assert.equal(v.ok, false);
    const added = v.drift.find(d => d.relpath.endsWith('extra.js'));
    assert.ok(added);
    assert.equal(added.status, 'added');
  });

  test('verifyBaseline — throws when no baseline exists for version (documented)', () => {
    scaffold('1.0.0');
    assert.throws(
      () => configBaseline.verifyBaseline(root, '0.0.0'),
      /no baseline for version 0\.0\.0/
    );
  });
});

// ---------------------------------------------------------------------------
// reconciliation.js
// ---------------------------------------------------------------------------
describe('reconciliation', () => {
  let root;
  let gitAvailable = true;

  function git(args) {
    return execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  }

  function initRepo() {
    git('init -q');
    git('config user.email test@example.com');
    git('config user.name Test');
    git('config commit.gpgsign false');
  }

  function commitAll(msg) {
    git('add -A');
    git(`commit -q -m "${msg}" --no-verify`);
  }

  beforeEach(() => {
    root = mkTempRoot('ctoc-reconcile-');
    try {
      execSync('git --version', { stdio: 'ignore' });
      initRepo();
    } catch {
      gitAvailable = false;
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('reconcile — error when plan file does not exist (no throw)', () => {
    const r = reconciliation.reconcile(root, 'plans/missing.md');
    assert.equal(r.ok, false);
    assert.match(r.error, /plan not found/);
  });

  test('reconcile — clean: declared files all changed & criteria checked => ok', (t) => {
    if (!gitAvailable) return t.skip('git not available');
    // Baseline commit (HEAD~1).
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'feature.js'), '// v0\n');
    fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
    const planRel = path.join('plans', 'p.md');
    fs.writeFileSync(
      path.join(root, planRel),
      [
        '---',
        'files:',
        '  - src/feature.js',
        '---',
        '# Plan',
        '- [x] Build the feature (TEST-101)',
      ].join('\n') + '\n'
    );
    commitAll('baseline');

    // Change the declared file -> HEAD.
    fs.writeFileSync(path.join(root, 'src', 'feature.js'), '// v1 implemented\n');
    commitAll('implement');

    const r = reconciliation.reconcile(root, planRel);
    assert.equal(r.ok, true, 'no drift expected');
    assert.deepEqual(r.drift.undeclared_changes, []);
    assert.deepEqual(r.drift.declared_but_unchanged, []);
    assert.deepEqual(r.drift.uncovered_criteria, []);
    assert.ok(r.drift.referenced_tests.includes('TEST-101'));
  });

  test('reconcile — flags undeclared change (file changed but not in plan)', (t) => {
    if (!gitAvailable) return t.skip('git not available');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'declared.js'), '// v0\n');
    fs.writeFileSync(path.join(root, 'src', 'sneaky.js'), '// v0\n');
    fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
    const planRel = path.join('plans', 'p.md');
    fs.writeFileSync(
      path.join(root, planRel),
      ['---', 'files: [src/declared.js]', '---', '# Plan', '- [x] done'].join('\n') + '\n'
    );
    commitAll('baseline');

    fs.writeFileSync(path.join(root, 'src', 'declared.js'), '// v1\n');
    fs.writeFileSync(path.join(root, 'src', 'sneaky.js'), '// v1 undeclared\n');
    commitAll('change both');

    const r = reconciliation.reconcile(root, planRel);
    assert.equal(r.ok, false);
    assert.ok(r.drift.undeclared_changes.includes('src/sneaky.js'));
    assert.deepEqual(r.drift.declared_but_unchanged, []);
  });

  test('reconcile — flags declared_but_unchanged (planned file not touched)', (t) => {
    if (!gitAvailable) return t.skip('git not available');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'touched.js'), '// v0\n');
    fs.writeFileSync(path.join(root, 'src', 'ignored.js'), '// v0\n');
    fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
    const planRel = path.join('plans', 'p.md');
    fs.writeFileSync(
      path.join(root, planRel),
      [
        '---',
        'files:',
        '  - src/touched.js',
        '  - src/ignored.js',
        '---',
        '# Plan',
        '- [x] done',
      ].join('\n') + '\n'
    );
    commitAll('baseline');

    fs.writeFileSync(path.join(root, 'src', 'touched.js'), '// v1\n'); // only one touched
    commitAll('partial');

    const r = reconciliation.reconcile(root, planRel);
    assert.equal(r.ok, false);
    assert.ok(r.drift.declared_but_unchanged.includes('src/ignored.js'));
    assert.deepEqual(r.drift.undeclared_changes, []);
  });

  test('reconcile — flags uncovered (unchecked) acceptance criteria', (t) => {
    if (!gitAvailable) return t.skip('git not available');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'f.js'), '// v0\n');
    fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
    const planRel = path.join('plans', 'p.md');
    fs.writeFileSync(
      path.join(root, planRel),
      [
        '---',
        'files:',
        '  - src/f.js',
        '---',
        '# Plan',
        '- [x] criterion done',
        '- [ ] criterion NOT done',
      ].join('\n') + '\n'
    );
    commitAll('baseline');

    fs.writeFileSync(path.join(root, 'src', 'f.js'), '// v1\n');
    commitAll('impl');

    const r = reconciliation.reconcile(root, planRel);
    assert.equal(r.ok, false);
    assert.ok(r.drift.uncovered_criteria.includes('criterion NOT done'));
    assert.ok(!r.drift.uncovered_criteria.includes('criterion done'));
  });

  test('reconcile — glob matching: declared src/** absorbs nested change', (t) => {
    if (!gitAvailable) return t.skip('git not available');
    fs.mkdirSync(path.join(root, 'src', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'nested', 'deep.js'), '// v0\n');
    fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
    const planRel = path.join('plans', 'p.md');
    fs.writeFileSync(
      path.join(root, planRel),
      ['---', 'files: [src/**]', '---', '# Plan', '- [x] done'].join('\n') + '\n'
    );
    commitAll('baseline');

    fs.writeFileSync(path.join(root, 'src', 'nested', 'deep.js'), '// v1\n');
    commitAll('impl');

    const r = reconciliation.reconcile(root, planRel);
    assert.deepEqual(r.drift.undeclared_changes, [], 'src/** should match nested change');
    assert.equal(r.ok, true);
  });

  test('reconcile — git diff failure surfaces as error, not throw', () => {
    // No git repo here: use a temp dir that is NOT a git repository.
    const nonRepo = mkTempRoot('ctoc-reconcile-nonrepo-');
    try {
      fs.mkdirSync(path.join(nonRepo, 'plans'), { recursive: true });
      fs.writeFileSync(
        path.join(nonRepo, 'plans', 'p.md'),
        ['---', 'files: [src/x.js]', '---', '# Plan', '- [x] done'].join('\n') + '\n'
      );
      const r = reconciliation.reconcile(nonRepo, path.join('plans', 'p.md'), { baseRef: 'HEAD~1' });
      assert.equal(r.ok, false);
      assert.match(r.error, /git diff failed/);
    } finally {
      fs.rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// violation-tracker.js
//
// This module captures process.cwd() at require-time to compute LOG_DIR.
// To stay hermetic we chdir into a temp dir BEFORE the first require and
// load it through a child-free fresh require. Because Node caches modules,
// we delete it from the cache between tests and chdir to a new temp root,
// then re-require so each test gets its own .ctoc/logs sandbox.
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
    // Persisted to .ctoc/logs/gate-violations.json under the temp cwd.
    const file = path.join(root, '.ctoc', 'logs', 'gate-violations.json');
    assert.ok(fs.existsSync(file), 'violations file persisted');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 1);
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

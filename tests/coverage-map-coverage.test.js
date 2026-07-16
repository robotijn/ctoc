/**
 * Non-obvious branch coverage for src/lib/coverage-map.js.
 *
 * Companion to tests/lib-final-gap.test.js — that file pins the documented happy
 * contract; THIS file targets the DARK branches that survive mutation: the
 * SECOND operand of `||` / `&&` guards (the first operand short-circuits them
 * dark), empty-vs-absent collection distinctions, and the same-level heuristic
 * directory branch. Every test here is written so that mutating the one line it
 * targets turns it RED — a happy-path-only implementation would not satisfy it.
 *
 * Reachable dark lines this file lights up (verified via
 * --experimental-test-coverage --test-coverage-include=src/lib/coverage-map.js):
 *   - 296-297  findTestsByHeuristic: the SAME-LEVEL test-dir branch
 *              (sourceDir/<testdir>/<base>.test.js), distinct from the
 *              project-root test-dir branch the companion file exercises.
 *   - 420-421  getStatistics: the `filesWithoutTests++` increment, only reached
 *              by an entry whose `tests` is an EMPTY array (truthy, length 0).
 *
 * Branch-only dark spots (no uncovered line, but a surviving mutant) pinned here:
 *   - saveCoverageMap    line 66   `if (entry.tests)`      — entry with no tests key
 *   - needsRebuild       line 84   `!map._meta ||`         — on-disk map lacking _meta
 *   - getTestsForFile    line 135  `!entry.tests`          — entry with no tests key
 *   - getTestsForFiles   line 156  middle `!entry.tests`   — entry with no tests key
 *   - findAffectedTests  line 221  `entry.tests.length > 0`— mapped entry, empty tests
 *   - mergeCoverageData  line 364  `...tests || []`        — pre-existing entry, no tests
 *   - mergeCoverageData  line 365  `data.tests || []`      — incoming data, no tests
 *   - getStatistics      line 417  `if (entry.tests)`      — entry with no tests key
 *
 * CLI block (lines 476-538, the `if (require.main === module)` entry point): these
 * only run when the module is the process entry point (`require.main === module`),
 * which is false when the harness `require()`s it — so they cannot be reached from
 * an in-process call. They ARE driven end-to-end by the `## CLI (subprocess
 * behavior)` block below via a spawned `node coverage-map.js`, and node's test
 * runner aggregates the child process's V8 coverage into the scoped report, so
 * every switch arm is both mutation-killed AND counted. No line here is documented
 * unreachable; the whole file reaches 100% line / 100% function under the scoped run.
 *
 * Hermetic filesystem: coverage-map persists under <projectRoot>/.ctoc/quality-state,
 * projectRoot resolved (cwd-based) by findProjectRoot. Each test chdir's into a fresh
 * mkdtemp+realpath temp dir seeded with `.ctoc` (quality-state root marker) and
 * package.json (coverage-map's own heuristic root marker). quality-state caches its
 * _stateDir lazily and coverage-map captures that reference at load, so BOTH are
 * evicted from the require cache after chdir for a temp-scoped instance per test.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const COVERAGE_MAP_MODULE = path.join(__dirname, '..', 'src', 'lib', 'coverage-map.js');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function makeTempDir(prefix) {
  // realpathSync resolves the macOS /var -> /private/var symlink so later
  // realpath-based assertions compare apples to apples.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function rmDir(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Seed a temp dir with both root markers so both root-finders resolve to it. */
function seedProjectRoot(dir) {
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"tmp"}', 'utf8');
}

describe('coverage-map.js — non-obvious branches', () => {
  let tmpDir;
  let originalCwd;
  let cm;

  function freshModule() {
    delete require.cache[require.resolve('../src/lib/quality-state')];
    delete require.cache[require.resolve('../src/lib/coverage-map')];
    return require('../src/lib/coverage-map');
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = makeTempDir('ctoc-covmap-nb-');
    seedProjectRoot(tmpDir);
    process.chdir(tmpDir);
    cm = freshModule();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmDir(tmpDir);
  });

  // --- findTestsByHeuristic: SAME-LEVEL test dir (lines 296-297) ---

  test('findTestsByHeuristic — finds a test in a test dir SIBLING to the source (same-level branch)', () => {
    // Arrange: source at <tmp>/mod/foo.js with its test at <tmp>/mod/tests/foo.test.js.
    // sourceDir (<tmp>/mod) is NOT the project root, so this is the SAME-LEVEL branch
    // (join(sourceDir, dir, pattern)), distinct from the project-root branch. The
    // root-level candidate <tmp>/tests/foo.test.js is deliberately NOT created.
    const modDir = path.join(tmpDir, 'mod');
    const sameLevelTestsDir = path.join(modDir, 'tests');
    fs.mkdirSync(sameLevelTestsDir, { recursive: true });
    const srcFile = path.join(modDir, 'foo.js');
    const sameLevelTest = path.join(sameLevelTestsDir, 'foo.test.js');
    fs.writeFileSync(srcFile, '', 'utf8');
    fs.writeFileSync(sameLevelTest, '', 'utf8');

    // Act
    const found = cm.findTestsByHeuristic(srcFile);

    // Assert: the sibling test dir match is returned, and it is the same-level path.
    assert.ok(
      found.includes(sameLevelTest),
      `expected same-level ${sameLevelTest} in ${JSON.stringify(found)}`
    );
    assert.ok(
      !found.includes(path.join(tmpDir, 'tests', 'foo.test.js')),
      'no phantom root-level match was fabricated'
    );
  });

  // --- getStatistics: filesWithoutTests increment (lines 419-421) + guard (417) ---

  test('getStatistics — an entry with an EMPTY tests array increments filesWithoutTests', () => {
    // Arrange: one file with a test, one mapped file with tests === [] (empty but present).
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('has.js')] = { tests: ['t1.test.js'] };
    m.files[path.normalize('empty.js')] = { tests: [] };
    cm.saveCoverageMap(m);

    // Act
    const s = cm.getStatistics();

    // Assert: the empty-array entry is the ONLY one counted as "without tests".
    assert.equal(s.filesWithoutTests, 1);
  });

  test('getStatistics — an entry with NO tests key is skipped (not counted as filesWithoutTests)', () => {
    // Arrange: one real test entry + one entry that has coverage but no `tests` key.
    // The `if (entry.tests)` guard (line 417) must skip the second entry entirely —
    // its absent `tests` is neither iterated nor counted as "without tests".
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('has.js')] = { tests: ['t1.test.js'] };
    m.files[path.normalize('notests.js')] = { coverage: { lines: 1 } };
    cm.saveCoverageMap(m);

    // Act
    const s = cm.getStatistics();

    // Assert: absent-tests entry contributes 0 to filesWithoutTests (empty array would
    // have made it 1). Mutating away the `if (entry.tests)` guard throws on undefined.
    assert.equal(s.filesWithoutTests, 0);
  });

  // --- saveCoverageMap: `if (entry.tests)` guard, false branch (line 66) ---

  test('saveCoverageMap — an entry without a tests key is skipped when counting unique tests (no throw)', () => {
    // Arrange: one entry with tests, one entry that has no tests key at all.
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['only.test.js'] };
    m.files[path.normalize('b.js')] = { hash: 'deadbeef' }; // no tests key

    // Act
    const saved = cm.saveCoverageMap(m);

    // Assert: testCount reflects only the entry that has tests; the guard prevents a
    // `undefined.forEach` throw on b.js.
    assert.equal(saved._meta.testCount, 1);
    assert.equal(saved._meta.sourceCount, 2);
  });

  // --- needsRebuild: `!map._meta ||` first operand (line 84) ---

  test('needsRebuild — an on-disk map WITH files but WITHOUT _meta is reported as needing rebuild', () => {
    // Arrange: files present (so it is not the empty-map path) but _meta absent.
    const file = cm.getCoverageMapFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ files: { 'a.js': { tests: ['t.test.js'] } } }),
      'utf8'
    );

    // Act
    const r = cm.needsRebuild();

    // Assert: the `!map._meta` guard fires. Removing it would run `map._meta.rebuiltAt`
    // on undefined and throw; here it returns cleanly with the no-map reason.
    assert.equal(r.needed, true);
    assert.match(r.reason, /No coverage map exists/);
  });

  // --- getTestsForFile: `!entry.tests` second operand (line 135) ---

  test('getTestsForFile — a mapped entry with no tests key returns [] (not undefined, no throw)', () => {
    // Arrange: entry exists (so `!entry` is false) but has no `tests` key.
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('src/x.js')] = { hash: 'abc' };
    cm.saveCoverageMap(m);

    // Act
    const tests = cm.getTestsForFile('src/x.js');

    // Assert: the `!entry.tests` operand returns the []; dropping it would return undefined.
    assert.deepEqual(tests, []);
  });

  // --- getTestsForFiles: middle `!entry.tests` operand (line 156) ---

  test('getTestsForFiles — a mapped entry with no tests key is reported as unmapped', () => {
    // Arrange: entry exists but carries no `tests` key (distinct from the empty-array
    // case the companion file covers — this pins the MIDDLE operand of the || chain).
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('nokey.js')] = { hash: 'abc' };
    cm.saveCoverageMap(m);

    // Act
    const res = cm.getTestsForFiles(['nokey.js']);

    // Assert
    assert.deepEqual(res.unmapped, ['nokey.js']);
    assert.equal(res.hasUnmapped, true);
    assert.deepEqual(res.tests, []);
  });

  // --- findAffectedTests: `entry.tests.length > 0` third operand (line 221) ---

  test('findAffectedTests — a mapped entry with an EMPTY tests array falls through to full suite', () => {
    // Arrange: entry present with tests === [] and no heuristic test on disk.
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('src/x.js')] = { tests: [] };
    cm.saveCoverageMap(m);

    // Act
    const r = cm.findAffectedTests(['src/x.js']);

    // Assert: the `length > 0` operand means an empty-tests entry is NOT treated as
    // mapped; with no heuristic match it becomes unmapped and forces the full suite.
    assert.deepEqual(r.mappedFiles, []);
    assert.deepEqual(r.unmappedFiles, ['src/x.js']);
    assert.equal(r.requiresFullSuite, true);
    assert.match(r.reason, /No test mapping for: x\.js/);
  });

  // --- mergeCoverageData: `map.files[...].tests || []` fallback (line 364) ---

  test('mergeCoverageData — a pre-existing entry with no tests key merges via the [] fallback (no throw)', () => {
    // Arrange: seed disk with an entry that has NO tests key, then merge new tests in.
    const src = path.join(tmpDir, 'src', 'svc.js');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'x', 'utf8');
    const key = path.normalize(src);

    const seeded = cm.createEmptyCoverageMap();
    seeded.files[key] = { hash: 'old' }; // pre-existing entry, no tests key
    cm.saveCoverageMap(seeded);

    // Act
    const out = cm.mergeCoverageData({ [src]: { tests: ['new.test.js'] } }, 'node');

    // Assert: `new Set(map.files[key].tests || [])` uses the [] fallback; dropping it
    // would do `new Set(undefined)` and throw. Result is exactly the incoming tests.
    assert.deepEqual(out.files[key].tests, ['new.test.js']);
  });

  // --- mergeCoverageData: `data.tests || []` fallback (line 365) ---

  test('mergeCoverageData — incoming data with no tests key preserves existing tests via the [] fallback', () => {
    // Arrange: existing entry already has a test; incoming data carries ONLY coverage.
    const src = path.join(tmpDir, 'src', 'svc.js');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'x', 'utf8');
    const key = path.normalize(src);

    cm.mergeCoverageData({ [src]: { tests: ['kept.test.js'] } }, 'node');

    // Act: merge coverage stats with NO tests key on the incoming data.
    const out = cm.mergeCoverageData({ [src]: { lines: 90 } }, 'node');

    // Assert: `data.tests || []` yields [] so the existing test is preserved, and the
    // coverage block is attached. Dropping the fallback would `undefined.forEach` throw.
    assert.deepEqual(out.files[key].tests, ['kept.test.js']);
    assert.equal(out.files[key].coverage.lines, 90);
  });

  // --- needsRebuild: age boundary is STRICTLY greater-than (line 93, `>` not `>=`) ---

  test('needsRebuild — a map rebuilt EXACTLY at the age cap is not (yet) stale (> not >=)', () => {
    // Arrange: place rebuiltAt so age is just UNDER the 7-day window. The check is
    // `age > maxAge`; an exact/under-cap age must NOT trigger a rebuild. Using a small
    // safety margin keeps the test deterministic against clock drift during the call.
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t.test.js'] };
    cm.saveCoverageMap(m);
    const file = cm.getCoverageMapFilePath();
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    // age = maxAge - 60s  => strictly less than maxAge => needed:false.
    onDisk._meta.rebuiltAt = new Date(Date.now() - (SEVEN_DAYS_MS - 60_000)).toISOString();
    fs.writeFileSync(file, JSON.stringify(onDisk), 'utf8');

    // Act
    const r = cm.needsRebuild();

    // Assert: just under the cap is fresh. A `>=` mutation would wrongly flag it stale.
    assert.deepEqual(r, { needed: false });
  });

  // --- needsRebuild: an UNPARSEABLE rebuiltAt yields NaN age and must force rebuild ---

  test('needsRebuild — a truthy but UNPARSEABLE rebuiltAt is treated as stale (NaN age forces rebuild)', () => {
    // Arrange: a populated map whose rebuiltAt is a non-empty, non-date string.
    // `Date.now() - new Date("not-a-date").getTime()` is NaN; `NaN > maxAge` is
    // false, so a naive `age > maxAge` check falls through to needed:false and
    // certifies a corrupt/unverifiable timestamp as fresh. It must NOT.
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t.test.js'] };
    cm.saveCoverageMap(m);
    const file = cm.getCoverageMapFilePath();
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    onDisk._meta.rebuiltAt = 'not-a-date';
    fs.writeFileSync(file, JSON.stringify(onDisk), 'utf8');

    // Act
    const r = cm.needsRebuild();

    // Assert: an unparseable timestamp is unverifiable, so a rebuild is forced with a
    // reason that names the bad timestamp — never a silent needed:false.
    assert.equal(r.needed, true);
    assert.match(r.reason, /unparseable|unverifiable/i);
  });
});

// ---------------------------------------------------------------------------
// CLI (subprocess behavior) — drives the `if (require.main === module)` block.
// These do NOT contribute to this process's in-process line coverage (a child
// process is not instrumented by the parent's --experimental-test-coverage run);
// they exist to kill the switch-case mutants end-to-end. See the header's
// DOCUMENTED UNREACHABLE note for why 476-538 stay outside the in-process number.
// ---------------------------------------------------------------------------

describe('coverage-map.js — CLI entrypoint (subprocess)', () => {
  let tmpDir;

  function runCli(args) {
    return spawnSync(process.execPath, [COVERAGE_MAP_MODULE, ...args], {
      cwd: tmpDir,
      encoding: 'utf8'
    });
  }

  beforeEach(() => {
    tmpDir = makeTempDir('ctoc-covmap-cli-');
    seedProjectRoot(tmpDir);
  });

  afterEach(() => {
    rmDir(tmpDir);
  });

  test('CLI check — exits non-zero and states the reason when no map exists', () => {
    // Arrange: fresh project root, no coverage map on disk.
    // Act
    const res = runCli(['check']);

    // Assert: `needsRebuild().needed` true path calls process.exit(1).
    assert.equal(res.status, 1);
    assert.match(res.stdout, /Rebuild needed: No coverage map exists/);
  });

  /** Write a coverage map straight to the CLI's on-disk location under tmpDir. */
  function seedMap(map) {
    const dir = path.join(tmpDir, '.ctoc', 'quality-state');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'coverage-map.json'), JSON.stringify(map), 'utf8');
  }

  test('CLI check — a fresh, populated map reports up-to-date and exits zero', () => {
    // Arrange: a map with files and a current rebuiltAt => needsRebuild().needed false.
    seedMap({
      _meta: { rebuiltAt: new Date().toISOString() },
      files: { 'a.js': { tests: ['a.test.js'] } }
    });

    // Act
    const res = runCli(['check']);

    // Assert: the else arm of the check case runs (no process.exit(1)).
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Coverage map is up to date/);
  });

  test('CLI tests — for a MAPPED file lists its tests', () => {
    // Arrange: seed a map that maps a source file to a known test.
    const srcFile = path.join(tmpDir, 'src', 'mapped.js');
    seedMap({
      _meta: { rebuiltAt: new Date().toISOString() },
      files: { [path.normalize(srcFile)]: { tests: ['tests/mapped.test.js'] } }
    });

    // Act
    const res = runCli(['tests', srcFile]);

    // Assert: the "tests found" branch prints the header and each mapped test.
    assert.match(res.stdout, /Tests for /);
    assert.match(res.stdout, /tests\/mapped\.test\.js/);
  });

  test('CLI clear — writes a fresh empty map and reports it', () => {
    // Act
    const res = runCli(['clear']);

    // Assert: the file is created and the confirmation is printed (exit 0).
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Coverage map cleared/);
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.ctoc', 'quality-state', 'coverage-map.json')),
      'clear persisted an empty map to disk'
    );
  });

  test('CLI stats — prints the statistics header for an empty map', () => {
    // Act
    const res = runCli(['stats']);

    // Assert: the stats branch runs and reports an empty map (0 source files). The
    // Framework line uses the `|| 'unknown'` fallback since a fresh map has null.
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Coverage Map Statistics/);
    assert.match(res.stdout, /Source files: 0/);
    assert.match(res.stdout, /Framework: unknown/);
  });

  test('CLI tests — with no file argument prints usage and exits non-zero', () => {
    // Act: `tests` requires a <source-file> argument.
    const res = runCli(['tests']);

    // Assert: the arg-count guard fires (process.exit(1)).
    assert.equal(res.status, 1);
    assert.match(res.stdout, /Usage: coverage-map\.js tests <source-file>/);
  });

  test('CLI tests — for an unmapped file reports none and offers heuristic matches', () => {
    // Arrange: create a source file and a co-located test the heuristic will find.
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'thing.js');
    fs.writeFileSync(srcFile, '', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'thing.test.js'), '', 'utf8');

    // Act
    const res = runCli(['tests', srcFile]);

    // Assert: no mapped tests, but the heuristic block surfaces the co-located test.
    assert.match(res.stdout, /No tests found for/);
    assert.match(res.stdout, /Heuristic matches:/);
    assert.match(res.stdout, /thing\.test\.js/);
  });

  test('CLI — an unknown command prints the help banner', () => {
    // Act
    const res = runCli(['definitely-not-a-command']);

    // Assert: the default switch arm prints the CLI help.
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Coverage Map CLI/);
    assert.match(res.stdout, /tests <file>/);
  });
});

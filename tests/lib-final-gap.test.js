/**
 * Contract tests for two previously untested lib modules:
 *   - src/lib/coverage-map.js  (file -> test mapping for smart test selection)
 *   - src/lib/background.js    (status registry for background agents on plans)
 *
 * Discipline: assert the DOCUMENTED contract (JSDoc/header). A real deviation
 * from documented intent is left FAILING and reported, never weakened.
 *
 * Hermetic filesystem: coverage-map persists under <projectRoot>/.ctoc/quality-state
 * where projectRoot comes from findProjectRoot() (cwd-based). Each test chdir's into
 * a fresh mkdtemp+realpath temp dir seeded with a `.ctoc` marker so the project root
 * resolves deterministically to the temp dir. Because quality-state caches its
 * _stateDir lazily, both coverage-map AND quality-state are evicted from the require
 * cache after chdir so a fresh, temp-scoped instance is loaded per test.
 *
 * background.js does no process spawning — it is a pure status-file registry — so it
 * is tested directly against temp plan files.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

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

// ---------------------------------------------------------------------------
// coverage-map.js
// ---------------------------------------------------------------------------

describe('coverage-map.js', () => {
  let tmpDir;
  let originalCwd;
  let cm;

  function freshModule() {
    // quality-state caches _stateDir on first getStateDir() call. coverage-map
    // captures that getStateDir reference at load. Bust both so the new
    // coverage-map binds a new quality-state with a null (recomputed) _stateDir.
    delete require.cache[require.resolve('../src/lib/quality-state')];
    delete require.cache[require.resolve('../src/lib/coverage-map')];
    return require('../src/lib/coverage-map');
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = makeTempDir('ctoc-covmap-');
    // Two distinct root finders are in play:
    //   - quality-state (via project-root.js) treats `.ctoc` as a root marker; it
    //     decides where coverage-map.json persists.
    //   - coverage-map.js has its OWN findProjectRoot whose markers are
    //     package.json / go.mod / Cargo.toml / pyproject.toml / .git (NOT .ctoc);
    //     it drives heuristic root-level test discovery.
    // Seed both so the temp dir is the deterministic root for each.
    fs.mkdirSync(path.join(tmpDir, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"tmp"}', 'utf8');
    process.chdir(tmpDir);
    cm = freshModule();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmDir(tmpDir);
  });

  // --- exports / shape ---

  test('exports — every documented function and constant is present', () => {
    const expectedFns = [
      'createEmptyCoverageMap', 'loadCoverageMap', 'saveCoverageMap', 'clearCoverageMap',
      'addFileEntry', 'mergeCoverageData',
      'getTestsForFile', 'getTestsForFiles', 'findAffectedTests', 'needsRebuild',
      'findTestsByHeuristic', 'findProjectRoot',
      'getStatistics', 'exportMap', 'getCoverageMapFilePath'
    ];
    for (const name of expectedFns) {
      assert.equal(typeof cm[name], 'function', `${name} should be an exported function`);
    }
    assert.equal(cm.MAX_AGE_DAYS, 7, 'MAX_AGE_DAYS is documented as 7');
  });

  test('getCoverageMapFilePath — resolves to <root>/.ctoc/quality-state/coverage-map.json', () => {
    const p = cm.getCoverageMapFilePath();
    assert.equal(path.basename(p), 'coverage-map.json');
    assert.equal(path.basename(path.dirname(p)), 'quality-state');
    // Two dirs up from the file is the project root (our temp dir).
    assert.equal(fs.realpathSync(path.dirname(path.dirname(path.dirname(p)))), tmpDir);
  });

  // --- createEmptyCoverageMap ---

  test('createEmptyCoverageMap — returns the documented empty structure', () => {
    const m = cm.createEmptyCoverageMap();
    assert.deepEqual(m.files, {});
    assert.equal(m._meta.version, '1.0.0');
    assert.equal(m._meta.framework, null);
    assert.equal(m._meta.sourceCount, 0);
    assert.equal(m._meta.testCount, 0);
    assert.equal(typeof m._meta.createdAt, 'string');
    assert.equal(typeof m._meta.rebuiltAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(m._meta.createdAt)), 'createdAt is an ISO timestamp');
  });

  // --- load / save round-trip ---

  test('loadCoverageMap — returns empty structure when no map on disk', () => {
    const m = cm.loadCoverageMap();
    assert.deepEqual(m.files, {});
    assert.equal(m._meta.sourceCount, 0);
  });

  test('saveCoverageMap — persists, recomputes counts, stamps rebuiltAt, returns map', () => {
    const m = cm.createEmptyCoverageMap();
    m.files['a.js'] = { tests: ['t1.test.js', 't2.test.js'] };
    m.files['b.js'] = { tests: ['t1.test.js'] }; // t1 shared -> 2 unique tests
    const before = m._meta.rebuiltAt;
    const saved = cm.saveCoverageMap(m);

    assert.equal(saved.files['a.js'].tests.length, 2);
    assert.equal(saved._meta.sourceCount, 2, 'sourceCount = number of mapped files');
    assert.equal(saved._meta.testCount, 2, 'testCount = number of UNIQUE tests across all files');
    assert.ok(saved._meta.rebuiltAt >= before, 'rebuiltAt is (re)stamped on save');

    // Round-trips through disk.
    const reloaded = cm.loadCoverageMap();
    assert.deepEqual(Object.keys(reloaded.files).sort(), ['a.js', 'b.js']);
    assert.equal(reloaded._meta.testCount, 2);
    assert.ok(fs.existsSync(cm.getCoverageMapFilePath()), 'file written to disk');
  });

  test('loadCoverageMap — corrupt on-disk JSON falls back to empty structure (no throw)', () => {
    const file = cm.getCoverageMapFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ this is not json', 'utf8');
    const m = cm.loadCoverageMap(); // safeRead swallows parse error -> null -> empty
    assert.deepEqual(m.files, {});
    assert.equal(m._meta.sourceCount, 0);
  });

  test('loadCoverageMap — on-disk object missing .files yields empty structure', () => {
    const file = cm.getCoverageMapFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ _meta: { version: 'x' } }), 'utf8');
    const m = cm.loadCoverageMap();
    assert.deepEqual(m.files, {}, 'a map without .files is treated as empty');
  });

  // --- addFileEntry ---

  test('addFileEntry — normalizes path, hashes the file, merges options', () => {
    const src = path.join(tmpDir, 'src', 'thing.js');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'module.exports = 1;\n', 'utf8');

    const m = cm.createEmptyCoverageMap();
    const out = cm.addFileEntry(m, src, ['tests/thing.test.js'], { framework: 'node' });
    const key = path.normalize(src);

    assert.equal(out, m, 'returns the same map reference');
    assert.deepEqual(out.files[key].tests, ['tests/thing.test.js']);
    assert.equal(out.files[key].framework, 'node', 'options are spread onto the entry');
    assert.equal(typeof out.files[key].lastModified, 'string');
    assert.match(out.files[key].hash, /^[0-9a-f]{64}$/, 'sha256 hex hash of an existing file');
  });

  test('addFileEntry — missing tests defaults to [], missing source file -> null hash (no throw)', () => {
    const m = cm.createEmptyCoverageMap();
    const ghost = path.join(tmpDir, 'does-not-exist.js');
    const out = cm.addFileEntry(m, ghost); // no tests arg
    const key = path.normalize(ghost);
    assert.deepEqual(out.files[key].tests, [], 'undefined tests -> []');
    assert.equal(out.files[key].hash, null, 'hashFile returns null for a missing file');
  });

  // --- getTestsForFile ---

  test('getTestsForFile — returns the entry tests after a save round-trip', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('src/x.js')] = { tests: ['tests/x.test.js'] };
    cm.saveCoverageMap(m);
    assert.deepEqual(cm.getTestsForFile('src/x.js'), ['tests/x.test.js']);
  });

  test('getTestsForFile — unmapped file returns [] (not undefined, no throw)', () => {
    assert.deepEqual(cm.getTestsForFile('src/never-mapped.js'), []);
  });

  // --- getTestsForFiles ---

  test('getTestsForFiles — dedupes tests and reports unmapped sources', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t1.test.js', 'shared.test.js'] };
    m.files[path.normalize('b.js')] = { tests: ['shared.test.js'] };
    cm.saveCoverageMap(m);

    const res = cm.getTestsForFiles(['a.js', 'b.js', 'c.js']);
    assert.deepEqual(res.tests.sort(), ['shared.test.js', 't1.test.js'], 'deduped union');
    assert.deepEqual(res.unmapped, ['c.js']);
    assert.equal(res.hasUnmapped, true);
  });

  test('getTestsForFiles — all mapped => hasUnmapped false, empty unmapped', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t.test.js'] };
    cm.saveCoverageMap(m);
    const res = cm.getTestsForFiles(['a.js']);
    assert.deepEqual(res.unmapped, []);
    assert.equal(res.hasUnmapped, false);
  });

  test('getTestsForFiles — a mapped file with an empty tests array counts as unmapped', () => {
    // Documented intent: getTestsForFiles treats length===0 as "no mapping".
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('empty.js')] = { tests: [] };
    cm.saveCoverageMap(m);
    const res = cm.getTestsForFiles(['empty.js']);
    assert.deepEqual(res.unmapped, ['empty.js']);
    assert.equal(res.hasUnmapped, true);
    assert.deepEqual(res.tests, []);
  });

  // --- needsRebuild ---

  test('needsRebuild — no map on disk => needed with reason', () => {
    const r = cm.needsRebuild();
    assert.equal(r.needed, true);
    assert.match(r.reason, /No coverage map exists/);
  });

  test('needsRebuild — fresh saved map => not needed', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t.test.js'] };
    cm.saveCoverageMap(m); // stamps a current rebuiltAt
    assert.deepEqual(cm.needsRebuild(), { needed: false });
  });

  test('needsRebuild — map older than MAX_AGE_DAYS => needed with age reason', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t.test.js'] };
    cm.saveCoverageMap(m);
    // Backdate rebuiltAt past the 7-day window directly on disk.
    const file = cm.getCoverageMapFilePath();
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    const old = new Date(Date.now() - (cm.MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000);
    onDisk._meta.rebuiltAt = old.toISOString();
    fs.writeFileSync(file, JSON.stringify(onDisk), 'utf8');

    const r = cm.needsRebuild();
    assert.equal(r.needed, true);
    assert.ok(
      r.reason.includes(`older than ${cm.MAX_AGE_DAYS} days`),
      `reason should mention the age window, got: ${r.reason}`
    );
  });

  test('needsRebuild — populated map missing rebuiltAt => needed with timestamp reason', () => {
    const file = cm.getCoverageMapFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Has files (so not empty) and _meta but NO rebuiltAt.
    const map = { _meta: { version: '1.0.0' }, files: { 'a.js': { tests: ['t.test.js'] } } };
    fs.writeFileSync(file, JSON.stringify(map), 'utf8');
    const r = cm.needsRebuild();
    assert.equal(r.needed, true);
    assert.match(r.reason, /missing rebuild timestamp/);
  });

  // --- findTestsByHeuristic ---

  test('findTestsByHeuristic — finds <root>/tests/<base>.test.js for a source file', () => {
    // Layout: tmp/src/state.js and tmp/tests/state.test.js. coverage-map's own
    // findProjectRoot resolves tmpDir via the seeded package.json marker, so the
    // root-level tests/ dir is searched.
    const srcDir = path.join(tmpDir, 'src');
    const testsDir = path.join(tmpDir, 'tests');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(testsDir, { recursive: true });
    const srcFile = path.join(srcDir, 'state.js');
    const testFile = path.join(testsDir, 'state.test.js');
    fs.writeFileSync(srcFile, '', 'utf8');
    fs.writeFileSync(testFile, '', 'utf8');

    const found = cm.findTestsByHeuristic(srcFile);
    assert.ok(found.includes(testFile), `expected ${testFile} in ${JSON.stringify(found)}`);
    // Dedupe contract: no duplicates even though multiple patterns/dirs are scanned.
    assert.equal(found.length, new Set(found).size, 'results are deduplicated');
  });

  test('findTestsByHeuristic — co-located test next to the source is found', () => {
    const dir = path.join(tmpDir, 'pkg');
    fs.mkdirSync(dir, { recursive: true });
    const srcFile = path.join(dir, 'util.js');
    const colocated = path.join(dir, 'util.test.js');
    fs.writeFileSync(srcFile, '', 'utf8');
    fs.writeFileSync(colocated, '', 'utf8');
    const found = cm.findTestsByHeuristic(srcFile);
    assert.ok(found.includes(colocated));
  });

  test('findTestsByHeuristic — no matching test file => empty array (no throw)', () => {
    const srcFile = path.join(tmpDir, 'src', 'lonely.js');
    fs.mkdirSync(path.dirname(srcFile), { recursive: true });
    fs.writeFileSync(srcFile, '', 'utf8');
    assert.deepEqual(cm.findTestsByHeuristic(srcFile), []);
  });

  // --- findProjectRoot ---

  test('findProjectRoot — walks up to the dir holding a documented marker (package.json)', () => {
    // coverage-map.findProjectRoot markers are package.json/go.mod/Cargo.toml/
    // pyproject.toml/.git. The temp root has a package.json (seeded in beforeEach).
    const deep = path.join(tmpDir, 'a', 'b', 'c');
    fs.mkdirSync(deep, { recursive: true });
    assert.equal(fs.realpathSync(cm.findProjectRoot(deep)), tmpDir);
  });

  test('findProjectRoot — no documented marker anywhere => null', () => {
    // A standalone temp dir with NO package.json/go.mod/etc up to the filesystem
    // root behaves per the documented contract: "Project root or null".
    const isolated = makeTempDir('ctoc-noroot-');
    try {
      // (os.tmpdir() parents normally carry none of the markers this finder checks.)
      assert.equal(cm.findProjectRoot(isolated), null);
    } finally {
      rmDir(isolated);
    }
  });

  // --- findAffectedTests ---

  test('findAffectedTests — config-file change forces the full suite', () => {
    const r = cm.findAffectedTests(['package.json']);
    assert.equal(r.requiresFullSuite, true);
    assert.match(r.reason, /Config file changed: package\.json/);
  });

  test('findAffectedTests — mapped change returns its tests, no full suite', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('src/a.js')] = { tests: ['tests/a.test.js'] };
    cm.saveCoverageMap(m);
    const r = cm.findAffectedTests(['src/a.js']);
    assert.deepEqual(r.tests, ['tests/a.test.js']);
    assert.deepEqual(r.mappedFiles, ['src/a.js']);
    assert.equal(r.requiresFullSuite, false);
    assert.deepEqual(r.unmappedFiles, []);
  });

  test('findAffectedTests — heuristic fallback records fallbackTests, no full suite', () => {
    // No coverage entry, but a same-name test exists on disk => heuristic hit.
    const srcDir = path.join(tmpDir, 'src');
    const testsDir = path.join(tmpDir, 'tests');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(testsDir, { recursive: true });
    const srcFile = path.join(srcDir, 'widget.js');
    const testFile = path.join(testsDir, 'widget.test.js');
    fs.writeFileSync(srcFile, '', 'utf8');
    fs.writeFileSync(testFile, '', 'utf8');

    const r = cm.findAffectedTests([srcFile]);
    assert.ok(r.tests.includes(testFile), 'heuristic test included in affected set');
    assert.equal(r.fallbackTests.length, 1);
    assert.equal(r.fallbackTests[0].file, srcFile);
    assert.equal(r.requiresFullSuite, false, 'a heuristic match does not force full suite');
  });

  test('findAffectedTests — truly unmapped change forces full suite with reason', () => {
    const r = cm.findAffectedTests([path.join(tmpDir, 'src', 'ghost.js')]);
    assert.equal(r.requiresFullSuite, true);
    assert.match(r.reason, /No test mapping for: ghost\.js/);
    assert.equal(r.unmappedFiles.length, 1);
  });

  // --- mergeCoverageData ---

  test('mergeCoverageData — creates entries, sets framework, persists, attaches coverage stats', () => {
    const src = path.join(tmpDir, 'src', 'svc.js');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'x', 'utf8');
    const key = path.normalize(src);

    const out = cm.mergeCoverageData(
      { [src]: { tests: ['tests/svc.test.js'], lines: 90, branches: 80, functions: 100, statements: 88 } },
      'jest'
    );
    assert.equal(out._meta.framework, 'jest');
    assert.deepEqual(out.files[key].tests, ['tests/svc.test.js']);
    assert.deepEqual(out.files[key].coverage, { lines: 90, branches: 80, functions: 100, statements: 88 });
    assert.match(out.files[key].hash, /^[0-9a-f]{64}$/);

    // Persisted: framework survives reload.
    const reloaded = cm.loadCoverageMap();
    assert.equal(reloaded._meta.framework, 'jest');
  });

  test('mergeCoverageData — merges into an existing entry and dedupes tests', () => {
    const src = path.join(tmpDir, 'src', 'svc.js');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'x', 'utf8');
    const key = path.normalize(src);

    cm.mergeCoverageData({ [src]: { tests: ['t1.test.js'] } }, 'node');
    const out = cm.mergeCoverageData({ [src]: { tests: ['t1.test.js', 't2.test.js'] } }, 'node');
    assert.deepEqual(out.files[key].tests.sort(), ['t1.test.js', 't2.test.js'], 'union, deduped');
  });

  test('mergeCoverageData — entry without coverage stats omits the coverage field', () => {
    const src = path.join(tmpDir, 'src', 'plain.js');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'x', 'utf8');
    const key = path.normalize(src);
    const out = cm.mergeCoverageData({ [src]: { tests: ['t.test.js'] } }, 'node');
    assert.equal(out.files[key].coverage, undefined, 'no lines => no coverage block');
  });

  // --- clearCoverageMap ---

  test('clearCoverageMap — resets to an empty saved map', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t.test.js'] };
    cm.saveCoverageMap(m);
    assert.equal(cm.loadCoverageMap()._meta.sourceCount, 1);

    const cleared = cm.clearCoverageMap();
    assert.deepEqual(cleared.files, {});
    assert.equal(cm.loadCoverageMap()._meta.sourceCount, 0, 'cleared state is persisted');
  });

  // --- getStatistics ---

  test('getStatistics — empty map reports zeroes and avg 0', () => {
    const s = cm.getStatistics();
    assert.equal(s.sourceFiles, 0);
    assert.equal(s.tests, 0);
    assert.equal(s.filesWithCoverage, 0);
    assert.equal(s.avgTestsPerFile, 0);
  });

  test('getStatistics — counts unique tests, files-with-coverage, and avg per file', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t1.test.js', 't2.test.js'], coverage: { lines: 50 } };
    m.files[path.normalize('b.js')] = { tests: ['t2.test.js'] }; // shares t2
    cm.saveCoverageMap(m);

    const s = cm.getStatistics();
    assert.equal(s.sourceFiles, 2);
    assert.equal(s.tests, 2, 'unique test count across all files');
    assert.equal(s.filesWithCoverage, 1, 'only a.js has a coverage block');
    // avgTestsPerFile is a 2-decimal string per the documented .toFixed(2).
    assert.equal(s.avgTestsPerFile, (2 / 2).toFixed(2));
    assert.equal(typeof s.framework, 'object'); // null after empty-create + save
  });

  // --- exportMap ---

  test('exportMap — returns the full current map (same content as loadCoverageMap)', () => {
    const m = cm.createEmptyCoverageMap();
    m.files[path.normalize('a.js')] = { tests: ['t.test.js'] };
    cm.saveCoverageMap(m);
    assert.deepEqual(cm.exportMap(), cm.loadCoverageMap());
    assert.deepEqual(Object.keys(cm.exportMap().files), [path.normalize('a.js')]);
  });
});

// ---------------------------------------------------------------------------
// background.js
// ---------------------------------------------------------------------------

describe('background.js', () => {
  const bg = require('../src/lib/background');
  let tmpDir;
  let planPath;

  beforeEach(() => {
    tmpDir = makeTempDir('ctoc-bg-');
    planPath = path.join(tmpDir, 'my-plan.md');
    fs.writeFileSync(planPath, '# plan\n', 'utf8');
  });

  afterEach(() => {
    rmDir(tmpDir);
  });

  test('exports — every documented function is present', () => {
    const expected = [
      'getStatusPath', 'writeStatus', 'readStatus', 'clearStatus',
      'getStatusIcon', 'isStale', 'markComplete', 'markNeedsInput',
      'markTimeout', 'getAllStatuses', 'cleanupStale'
    ];
    for (const name of expected) {
      assert.equal(typeof bg[name], 'function', `${name} should be an exported function`);
    }
  });

  // --- getStatusPath ---

  test('getStatusPath — appends .status to the plan path (documented contract)', () => {
    assert.equal(bg.getStatusPath(planPath), planPath + '.status');
  });

  // --- writeStatus / readStatus ---

  test('writeStatus — persists the documented status shape and returns it', () => {
    const obj = bg.writeStatus(planPath, { agent: 'implementation-planner', status: 'working' });
    assert.equal(obj.agent, 'implementation-planner');
    assert.equal(obj.status, 'working');
    assert.equal(obj.completed, null, 'completed is null while not complete');
    assert.equal(obj.message, null, 'message defaults to null');
    assert.equal(typeof obj.started, 'string');
    assert.equal(typeof obj.updatedAt, 'string');

    // File written at the documented path and parseable.
    const onDisk = JSON.parse(fs.readFileSync(bg.getStatusPath(planPath), 'utf8'));
    assert.deepEqual(onDisk, obj);
  });

  test('writeStatus — status "complete" stamps completed timestamp', () => {
    const obj = bg.writeStatus(planPath, { agent: 'a', status: 'complete' });
    assert.equal(typeof obj.completed, 'string', 'complete => completed timestamp set');
    assert.ok(!Number.isNaN(Date.parse(obj.completed)));
  });

  test('writeStatus — honors a caller-supplied started and message', () => {
    const started = '2020-01-01T00:00:00.000Z';
    const obj = bg.writeStatus(planPath, { agent: 'a', status: 'working', started, message: 'hi' });
    assert.equal(obj.started, started);
    assert.equal(obj.message, 'hi');
  });

  test('readStatus — round-trips a written status', () => {
    bg.writeStatus(planPath, { agent: 'research-assistant', status: 'working', message: 'busy' });
    const r = bg.readStatus(planPath);
    assert.equal(r.agent, 'research-assistant');
    assert.equal(r.status, 'working');
    assert.equal(r.message, 'busy');
  });

  test('readStatus — no status file => {status:"none"} (documented default)', () => {
    assert.deepEqual(bg.readStatus(planPath), { status: 'none' });
  });

  test('readStatus — corrupt status file => {status:"none"} (no throw)', () => {
    fs.writeFileSync(bg.getStatusPath(planPath), '{ broken json', 'utf8');
    assert.deepEqual(bg.readStatus(planPath), { status: 'none' });
  });

  // --- clearStatus ---

  test('clearStatus — removes an existing status file', () => {
    bg.writeStatus(planPath, { agent: 'a', status: 'working' });
    assert.ok(fs.existsSync(bg.getStatusPath(planPath)));
    bg.clearStatus(planPath);
    assert.equal(fs.existsSync(bg.getStatusPath(planPath)), false);
  });

  test('clearStatus — missing status file is a no-op (no throw)', () => {
    assert.doesNotThrow(() => bg.clearStatus(planPath));
  });

  // --- getStatusIcon ---

  test('getStatusIcon — maps each documented status to its icon', () => {
    assert.equal(bg.getStatusIcon('none'), '○');
    assert.equal(bg.getStatusIcon('working'), '◐');
    assert.equal(bg.getStatusIcon('complete'), '●');
    assert.equal(bg.getStatusIcon('needs-input'), '⚠');
    assert.equal(bg.getStatusIcon('timeout'), '✗');
  });

  test('getStatusIcon — unknown status falls back to the "none" icon', () => {
    assert.equal(bg.getStatusIcon('garbage'), '○');
    assert.equal(bg.getStatusIcon(undefined), '○');
  });

  // --- isStale ---

  test('isStale — only "working" statuses can be stale', () => {
    const oldStarted = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    assert.equal(bg.isStale({ status: 'complete', started: oldStarted }), false);
    assert.equal(bg.isStale({ status: 'working' }), false, 'no started => not stale');
  });

  test('isStale — working past the timeout window is stale; within it is not', () => {
    const oldStarted = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recentStarted = new Date(Date.now() - 1000).toISOString();
    assert.equal(bg.isStale({ status: 'working', started: oldStarted }), true);
    assert.equal(bg.isStale({ status: 'working', started: recentStarted }), false);
  });

  test('isStale — custom timeoutMs is respected', () => {
    const started = new Date(Date.now() - 2000).toISOString(); // 2s ago
    assert.equal(bg.isStale({ status: 'working', started }, 1000), true, '2s > 1s timeout');
    assert.equal(bg.isStale({ status: 'working', started }, 60000), false, '2s < 60s timeout');
  });

  // --- markComplete / markNeedsInput / markTimeout ---

  test('markComplete — preserves agent+started, sets complete and completed stamp', () => {
    bg.writeStatus(planPath, { agent: 'implementer', status: 'working', started: '2020-01-01T00:00:00.000Z' });
    bg.markComplete(planPath, 'done!');
    const r = bg.readStatus(planPath);
    assert.equal(r.agent, 'implementer', 'agent carried over from prior status');
    assert.equal(r.started, '2020-01-01T00:00:00.000Z', 'original started preserved');
    assert.equal(r.status, 'complete');
    assert.equal(r.message, 'done!');
    assert.equal(typeof r.completed, 'string');
  });

  test('markComplete — without a message keeps the prior message', () => {
    bg.writeStatus(planPath, { agent: 'a', status: 'working', message: 'in progress' });
    bg.markComplete(planPath);
    assert.equal(bg.readStatus(planPath).message, 'in progress');
  });

  test('markNeedsInput — sets needs-input with the question as message', () => {
    bg.writeStatus(planPath, { agent: 'planner', status: 'working' });
    bg.markNeedsInput(planPath, 'Which database?');
    const r = bg.readStatus(planPath);
    assert.equal(r.status, 'needs-input');
    assert.equal(r.message, 'Which database?');
    assert.equal(r.agent, 'planner');
  });

  test('markTimeout — sets timeout with the documented 5-minute message', () => {
    bg.writeStatus(planPath, { agent: 'a', status: 'working' });
    bg.markTimeout(planPath);
    const r = bg.readStatus(planPath);
    assert.equal(r.status, 'timeout');
    assert.match(r.message, /timed out after 5 minutes/);
  });

  // --- getAllStatuses ---

  test('getAllStatuses — missing directory returns [] (no throw)', () => {
    assert.deepEqual(bg.getAllStatuses(path.join(tmpDir, 'nope')), []);
  });

  test('getAllStatuses — one record per .md plan, with planName and merged status', () => {
    const p2 = path.join(tmpDir, 'second.md');
    fs.writeFileSync(p2, '# second\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'ignore me', 'utf8'); // non-.md ignored

    bg.writeStatus(planPath, { agent: 'a', status: 'working' });
    // second.md intentionally has NO status file => status "none".

    const all = bg.getAllStatuses(tmpDir);
    assert.equal(all.length, 2, 'only the two .md files are scanned');
    const byName = Object.fromEntries(all.map(s => [s.planName, s]));
    assert.equal(byName['my-plan'].status, 'working');
    assert.equal(byName['my-plan'].agent, 'a');
    assert.equal(byName['second'].status, 'none', 'plan without a status file reports none');
    assert.equal(byName['my-plan'].planPath, planPath);
  });

  // --- cleanupStale ---

  test('cleanupStale — marks stale working plans as timeout and counts them', () => {
    const stalePlan = path.join(tmpDir, 'stale.md');
    const freshPlan = path.join(tmpDir, 'fresh.md');
    fs.writeFileSync(stalePlan, '# stale\n', 'utf8');
    fs.writeFileSync(freshPlan, '# fresh\n', 'utf8');

    bg.writeStatus(stalePlan, {
      agent: 'a', status: 'working',
      started: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 min ago
    });
    bg.writeStatus(freshPlan, {
      agent: 'b', status: 'working',
      started: new Date(Date.now() - 1000).toISOString() // 1s ago
    });

    const count = bg.cleanupStale(tmpDir); // default 5-min timeout
    assert.equal(count, 1, 'only the stale plan is reaped');
    assert.equal(bg.readStatus(stalePlan).status, 'timeout');
    assert.equal(bg.readStatus(freshPlan).status, 'working', 'fresh plan untouched');
  });

  test('cleanupStale — nothing stale returns 0', () => {
    bg.writeStatus(planPath, { agent: 'a', status: 'complete' });
    assert.equal(bg.cleanupStale(tmpDir), 0);
  });
});

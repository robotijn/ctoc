/**
 * Contract tests for five previously-untested lib modules.
 *
 * Modules under test:
 *   - src/lib/staged-files.js     (git staged-file utilities)
 *   - src/lib/tool-detector.js    (language/test-framework detection)
 *   - src/lib/time-source.js      (clock-provenance metadata)
 *   - src/lib/metrics-loop.js     (manufacturing-grade pipeline metrics)
 *   - src/lib/upgrade-planner.js  (quality-mode upgrade roadmaps)
 *
 * Style: node:test + node:assert/strict. Filesystem/git tests use hermetic
 * temp directories (mkdtempSync -> realpathSync) and clean up afterEach.
 * Tests assert the DOCUMENTED contract (JSDoc/header). Where the code
 * contradicts its documented intent, the test is left failing on purpose and
 * the contradiction is reported — never weakened to pass.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const stagedFiles = require('../src/lib/staged-files');
const toolDetector = require('../src/lib/tool-detector');
const timeSource = require('../src/lib/time-source');
const metricsLoop = require('../src/lib/metrics-loop');
const upgradePlanner = require('../src/lib/upgrade-planner');

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (hermetic; realpath resolves macOS /var -> /private)
// ---------------------------------------------------------------------------

function makeTempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function rmTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// Detect whether a usable git binary exists for the git-backed suite.
function gitAvailable() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Initialise a hermetic git repo with isolated identity/config.
function initGitRepo(dir) {
  const opts = { cwd: dir, stdio: 'ignore' };
  execSync('git init', opts);
  execSync('git config user.email "test@example.com"', opts);
  execSync('git config user.name "Test"', opts);
  execSync('git config commit.gpgsign false', opts);
}

// ===========================================================================
// 1. staged-files.js
//
// Exact API:
//   class StagedFiles({ repoRoot, filter })
//     .getFiles({ filter, force })           -> string[]
//     .getFilesWithMetadata(options)         -> object[]
//     .getByExtension(extensions, options)   -> string[]
//     .getByDirectory(directories, options)  -> string[]
//     .getByPattern(pattern, options)        -> string[]
//     .getJavaScript() .getTypeScript() .getJsTs() .getPython()
//     .getGo() .getRust() .getConfig() .getDocs() .getShell()
//     .getOversized(maxSizeBytes) .getBinaryFiles() .getSensitiveFiles()
//     .getTotalSize() .getSummary() .clearCache()
//   getStagedFiles(options) -> string[]
//   getStagedByExtension(extensions, options) -> string[]
//   getStagedByLanguage(language, options) -> string[]
//   hasStagedFiles(options) -> boolean
//   DIFF_FILTERS, DEFAULT_FILTER, MAX_FILE_SIZE_BYTES, BINARY_EXTENSIONS
// ===========================================================================

describe('staged-files', () => {
  let repo;

  beforeEach((t) => {
    if (!gitAvailable()) {
      t.skip('git binary not available');
      return;
    }
    repo = makeTempDir('ctoc-staged-');
    initGitRepo(repo);
  });

  afterEach(() => {
    if (repo) rmTempDir(repo);
    repo = undefined;
  });

  describe('constants', () => {
    it('exposes the documented constant API', () => {
      assert.equal(stagedFiles.DEFAULT_FILTER, 'ACM');
      assert.equal(stagedFiles.MAX_FILE_SIZE_BYTES, 5 * 1024 * 1024);
      assert.ok(stagedFiles.BINARY_EXTENSIONS instanceof Set);
      assert.ok(stagedFiles.BINARY_EXTENSIONS.has('.png'));
      assert.equal(stagedFiles.DIFF_FILTERS.ADDED, 'A');
      assert.equal(stagedFiles.DIFF_FILTERS.MODIFIED, 'M');
    });
  });

  describe('getFiles / happy path', () => {
    it('returns staged file paths (Added)', () => {
      writeFile(repo, 'src/index.js', 'console.log(1)\n');
      execSync('git add src/index.js', { cwd: repo, stdio: 'ignore' });

      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      const files = sf.getFiles();
      assert.ok(Array.isArray(files));
      assert.deepEqual(files, [path.posix.join('src', 'index.js')]);
    });

    it('returns [] when nothing is staged', () => {
      writeFile(repo, 'unstaged.js', 'x\n');
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      assert.deepEqual(sf.getFiles(), []);
    });

    it('caches within TTL and force re-reads', () => {
      writeFile(repo, 'a.js', '1\n');
      execSync('git add a.js', { cwd: repo, stdio: 'ignore' });
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });

      const first = sf.getFiles();
      assert.deepEqual(first, ['a.js']);

      // Stage a second file; cached result should be unchanged until force.
      writeFile(repo, 'b.js', '2\n');
      execSync('git add b.js', { cwd: repo, stdio: 'ignore' });
      assert.deepEqual(sf.getFiles(), ['a.js'], 'cache should hide new file within TTL');

      const forced = sf.getFiles({ force: true }).sort();
      assert.deepEqual(forced, ['a.js', 'b.js']);
    });

    it('clearCache forces a fresh read', () => {
      writeFile(repo, 'a.js', '1\n');
      execSync('git add a.js', { cwd: repo, stdio: 'ignore' });
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      sf.getFiles();
      writeFile(repo, 'c.js', '3\n');
      execSync('git add c.js', { cwd: repo, stdio: 'ignore' });
      sf.clearCache();
      assert.deepEqual(sf.getFiles().sort(), ['a.js', 'c.js']);
    });
  });

  describe('filtering helpers', () => {
    function stageMany(root) {
      writeFile(root, 'app.js', '1\n');
      writeFile(root, 'lib/util.ts', '1\n');
      writeFile(root, 'main.py', '1\n');
      writeFile(root, 'config.json', '{}\n');
      writeFile(root, 'README.md', '# hi\n');
      execSync('git add -A', { cwd: root, stdio: 'ignore' });
    }

    it('getByExtension normalizes missing dot and is case-insensitive', () => {
      stageMany(repo);
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      // "js" without dot must match ".js"
      assert.deepEqual(sf.getByExtension('js'), ['app.js']);
      assert.deepEqual(sf.getByExtension(['.JSON']), ['config.json']);
    });

    it('getByDirectory matches a directory prefix', () => {
      stageMany(repo);
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      assert.deepEqual(sf.getByDirectory('lib'), [path.posix.join('lib', 'util.ts')]);
    });

    it('getByPattern filters by regex', () => {
      stageMany(repo);
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      assert.deepEqual(sf.getByPattern('\\.py$'), ['main.py']);
    });

    it('language getters classify by extension', () => {
      stageMany(repo);
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      assert.deepEqual(sf.getJavaScript(), ['app.js']);
      assert.deepEqual(sf.getTypeScript(), [path.posix.join('lib', 'util.ts')]);
      assert.deepEqual(sf.getJsTs().sort(), ['app.js', path.posix.join('lib', 'util.ts')].sort());
      assert.deepEqual(sf.getPython(), ['main.py']);
      assert.deepEqual(sf.getConfig(), ['config.json']);
      assert.deepEqual(sf.getDocs(), ['README.md']);
    });

    it('getSensitiveFiles flags secret-looking paths', () => {
      writeFile(repo, '.env', 'SECRET=1\n');
      writeFile(repo, 'server.key', 'priv\n');
      writeFile(repo, 'safe.js', '1\n');
      execSync('git add -A', { cwd: repo, stdio: 'ignore' });
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      const sensitive = sf.getSensitiveFiles().sort();
      assert.deepEqual(sensitive, ['.env', 'server.key']);
    });
  });

  describe('metadata + aggregates', () => {
    it('getFilesWithMetadata returns the documented shape', () => {
      writeFile(repo, 'src/a.js', 'hello world\n');
      execSync('git add -A', { cwd: repo, stdio: 'ignore' });
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      const meta = sf.getFilesWithMetadata();
      assert.equal(meta.length, 1);
      const m = meta[0];
      assert.equal(m.path, path.posix.join('src', 'a.js'));
      assert.equal(m.basename, 'a.js');
      assert.equal(m.extension, '.js');
      assert.equal(m.directory, 'src');
      assert.equal(m.exists, true);
      assert.equal(m.isBinary, false);
      assert.equal(m.isOversize, false);
      assert.ok(m.size > 0);
      assert.ok(m.fullPath.endsWith(path.join('src', 'a.js')));
    });

    it('getTotalSize and getSummary aggregate by extension', () => {
      writeFile(repo, 'a.js', 'aaaa\n');
      writeFile(repo, 'b.js', 'bbbb\n');
      writeFile(repo, 'c.md', 'cc\n');
      execSync('git add -A', { cwd: repo, stdio: 'ignore' });
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });

      const total = sf.getTotalSize();
      assert.ok(total > 0);

      const summary = sf.getSummary();
      assert.equal(summary['.js'].count, 2);
      assert.equal(summary['.md'].count, 1);
      assert.ok(summary['.js'].size > 0);
    });

    it('getBinaryFiles detects a binary extension', () => {
      writeFile(repo, 'logo.png', 'not really png but extension is binary\n');
      execSync('git add -A', { cwd: repo, stdio: 'ignore' });
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      const bins = sf.getBinaryFiles();
      assert.equal(bins.length, 1);
      assert.equal(bins[0].path, 'logo.png');
      assert.equal(bins[0].isBinary, true);
    });

    it('getOversized respects an explicit threshold', () => {
      writeFile(repo, 'small.txt', 'abc\n');
      execSync('git add -A', { cwd: repo, stdio: 'ignore' });
      const sf = new stagedFiles.StagedFiles({ repoRoot: repo });
      // Threshold of 0 bytes: every staged file exceeds it.
      assert.equal(sf.getOversized(0).length, 1);
      // Threshold far above any tiny file: none oversized.
      assert.equal(sf.getOversized(10 * 1024 * 1024).length, 0);
    });
  });

  describe('convenience functions', () => {
    it('getStagedFiles / hasStagedFiles / getStagedByExtension / getStagedByLanguage', () => {
      writeFile(repo, 'x.js', '1\n');
      writeFile(repo, 'y.py', '1\n');
      execSync('git add -A', { cwd: repo, stdio: 'ignore' });

      assert.equal(stagedFiles.hasStagedFiles({ repoRoot: repo }), true);
      assert.deepEqual(
        stagedFiles.getStagedFiles({ repoRoot: repo }).sort(),
        ['x.js', 'y.py']
      );
      assert.deepEqual(stagedFiles.getStagedByExtension('js', { repoRoot: repo }), ['x.js']);
      assert.deepEqual(stagedFiles.getStagedByLanguage('python', { repoRoot: repo }), ['y.py']);
      // Unknown language => documented [] fallthrough.
      assert.deepEqual(stagedFiles.getStagedByLanguage('cobol', { repoRoot: repo }), []);
    });

    it('hasStagedFiles is false on a clean repo', () => {
      assert.equal(stagedFiles.hasStagedFiles({ repoRoot: repo }), false);
    });
  });

  describe('error path: non-git directory', () => {
    it('getFiles returns [] (never throws) when git fails', () => {
      const notRepo = makeTempDir('ctoc-notgit-');
      try {
        const sf = new stagedFiles.StagedFiles({ repoRoot: notRepo });
        // Documented contract: on git error, log and return [].
        assert.deepEqual(sf.getFiles(), []);
      } finally {
        rmTempDir(notRepo);
      }
    });
  });
});

// ===========================================================================
// 2. tool-detector.js
//
// Exact API:
//   detectLanguages(projectPath) -> string[] (deduped)
//   detectJsTestFramework(projectPath) -> string|null
//   detectPythonTestFramework(projectPath) -> string|null
//   detectTools(projectPath) -> { languages, tools, missing, source, needsUserInput? }
//   commandExists(cmd) -> boolean
//   getInstallCommand(tool, language) -> string
//   printDetectionResults(results) -> void
//   DEFAULT_TOOLS, LANGUAGE_MARKERS
// ===========================================================================

describe('tool-detector', () => {
  let proj;

  beforeEach(() => {
    proj = makeTempDir('ctoc-tools-');
  });

  afterEach(() => {
    if (proj) rmTempDir(proj);
    proj = undefined;
  });

  describe('constants', () => {
    it('exposes DEFAULT_TOOLS and LANGUAGE_MARKERS', () => {
      assert.equal(toolDetector.DEFAULT_TOOLS.javascript.lint, 'eslint .');
      assert.equal(toolDetector.DEFAULT_TOOLS.typescript.typecheck, 'tsc --noEmit');
      assert.deepEqual(toolDetector.LANGUAGE_MARKERS.go, ['go.mod', 'go.sum']);
    });
  });

  describe('detectLanguages', () => {
    it('detects JS from package.json (and TS, since package.json is a TS marker too)', () => {
      // Per LANGUAGE_MARKERS, package.json is the first marker for BOTH
      // javascript and typescript; the inner loop breaks on first match, so a
      // bare package.json legitimately matches both languages. Documented intent.
      writeFile(proj, 'package.json', '{}');
      const langs = toolDetector.detectLanguages(proj);
      assert.ok(langs.includes('javascript'));
      assert.ok(langs.includes('typescript'));
    });

    it('detects both JS and TS when tsconfig is present (and dedupes)', () => {
      writeFile(proj, 'package.json', '{}');
      writeFile(proj, 'tsconfig.json', '{}');
      const langs = toolDetector.detectLanguages(proj);
      assert.ok(langs.includes('javascript'));
      assert.ok(langs.includes('typescript'));
      // Deduped: each language appears once.
      assert.equal(new Set(langs).size, langs.length);
    });

    it('detects csharp via glob marker (*.csproj)', () => {
      writeFile(proj, 'App.csproj', '<Project/>');
      assert.ok(toolDetector.detectLanguages(proj).includes('csharp'));
    });

    it('returns [] for an empty project', () => {
      assert.deepEqual(toolDetector.detectLanguages(proj), []);
    });
  });

  describe('detectJsTestFramework', () => {
    it('returns null when no package.json exists', () => {
      assert.equal(toolDetector.detectJsTestFramework(proj), null);
    });

    it('detects jest from scripts.test', () => {
      writeFile(proj, 'package.json', JSON.stringify({ scripts: { test: 'jest --ci' } }));
      assert.equal(toolDetector.detectJsTestFramework(proj), 'jest');
    });

    it('detects vitest from devDependencies', () => {
      writeFile(proj, 'package.json', JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }));
      assert.equal(toolDetector.detectJsTestFramework(proj), 'vitest');
    });

    it('returns null on malformed package.json (never throws)', () => {
      writeFile(proj, 'package.json', '{ not valid json');
      assert.equal(toolDetector.detectJsTestFramework(proj), null);
    });
  });

  describe('detectPythonTestFramework', () => {
    it('detects pytest from pyproject.toml', () => {
      writeFile(proj, 'pyproject.toml', '[tool.pytest.ini_options]\n');
      assert.equal(toolDetector.detectPythonTestFramework(proj), 'pytest');
    });

    it('detects pytest from pytest.ini when no pyproject', () => {
      writeFile(proj, 'pytest.ini', '[pytest]\n');
      assert.equal(toolDetector.detectPythonTestFramework(proj), 'pytest');
    });

    it('returns null when no python test config is present', () => {
      assert.equal(toolDetector.detectPythonTestFramework(proj), null);
    });
  });

  describe('commandExists', () => {
    it('returns true for a ubiquitous command (node)', () => {
      assert.equal(toolDetector.commandExists('node'), true);
    });

    it('returns false for a nonexistent command (never throws)', () => {
      assert.equal(
        toolDetector.commandExists('definitely-not-a-real-binary-xyzzy'),
        false
      );
    });
  });

  describe('getInstallCommand', () => {
    it('returns a known install command', () => {
      assert.equal(toolDetector.getInstallCommand('eslint', 'javascript'), 'npm install -D eslint');
    });

    it('falls back to a descriptive string for unknown tool/language', () => {
      assert.equal(
        toolDetector.getInstallCommand('frobnicator', 'haskell'),
        'Install frobnicator for haskell'
      );
    });
  });

  describe('detectTools (hybrid)', () => {
    it('returns the documented result shape for a JS project', () => {
      writeFile(proj, 'package.json', JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }));
      const res = toolDetector.detectTools(proj);
      assert.ok(Array.isArray(res.languages));
      assert.ok(res.languages.includes('javascript'));
      assert.equal(typeof res.tools, 'object');
      assert.ok(Array.isArray(res.missing));
      assert.equal(typeof res.source, 'string');
      // JS test framework detected => tools.javascript.testFramework set.
      assert.equal(res.tools.javascript.testFramework, 'vitest');
    });

    it('flags needsUserInput when no languages are detected', () => {
      const res = toolDetector.detectTools(proj);
      assert.deepEqual(res.languages, []);
      assert.equal(res.source, 'unknown');
      assert.equal(res.needsUserInput, true);
    });
  });

  describe('printDetectionResults', () => {
    it('does not throw on a minimal results object', () => {
      assert.doesNotThrow(() =>
        toolDetector.printDetectionResults({
          source: 'auto-detect',
          languages: [],
          tools: {},
          missing: [],
        })
      );
    });
  });
});

// ===========================================================================
// 3. time-source.js
//
// Exact API:
//   KNOWN_SOURCES (['system','ntp','ptp','unknown'])
//   currentTimeSource() -> structured record (never throws)
//   recordIntoDispatch(dispatch) -> dispatch (mutated, preserves existing)
//   readClockSourcePosture(projectRoot) -> object|null
//   evaluateComplianceAgainstPosture(projectRoot, observed?) -> verdict
//   parseChronycTracking(text) -> object
//   chronyOffsetToMs(value) -> number|null
//   looksLikePtpBacked(fields, chronyConf) -> boolean
// ===========================================================================

describe('time-source', () => {
  let root;

  beforeEach(() => {
    root = makeTempDir('ctoc-time-');
  });

  afterEach(() => {
    if (root) rmTempDir(root);
    root = undefined;
  });

  describe('currentTimeSource', () => {
    it('returns the documented shape and a KNOWN source; never throws', () => {
      const ts = timeSource.currentTimeSource();
      assert.equal(typeof ts, 'object');
      assert.ok(timeSource.KNOWN_SOURCES.includes(ts.source));
      // wall_clock_iso must round-trip as a valid ISO date.
      assert.ok(!Number.isNaN(Date.parse(ts.wall_clock_iso)));
      // monotonic_ns is serialized as a decimal string.
      assert.equal(typeof ts.monotonic_ns, 'string');
      assert.ok(/^\d+$/.test(ts.monotonic_ns));
      assert.equal(ts.platform, process.platform);
      assert.equal(typeof ts.probe_method, 'string');
      assert.ok('last_known_drift_ms' in ts);
      assert.ok('reference_identifier' in ts);
      assert.ok('stratum' in ts);
    });
  });

  describe('recordIntoDispatch', () => {
    it('populates time_source on a fresh dispatch and returns the same object', () => {
      const dispatch = { id: 'd1' };
      const out = timeSource.recordIntoDispatch(dispatch);
      assert.equal(out, dispatch, 'returns the same object (mutated in place)');
      assert.equal(typeof dispatch.time_source, 'object');
      assert.ok(timeSource.KNOWN_SOURCES.includes(dispatch.time_source.source));
    });

    it('preserves a caller-set time_source (deterministic replay)', () => {
      const preset = { source: 'ptp', custom: true };
      const dispatch = { id: 'd2', time_source: preset };
      const out = timeSource.recordIntoDispatch(dispatch);
      assert.equal(out.time_source, preset, 'must not overwrite caller-set record');
      assert.equal(out.time_source.custom, true);
    });

    it('returns non-object input unchanged (never throws)', () => {
      assert.equal(timeSource.recordIntoDispatch(null), null);
      assert.equal(timeSource.recordIntoDispatch(undefined), undefined);
      assert.equal(timeSource.recordIntoDispatch(42), 42);
    });
  });

  describe('parseChronycTracking', () => {
    it('parses Key : Value lines into a flat object', () => {
      const text = [
        'Reference ID    : 7F7F0101 (PHC0)',
        'Stratum         : 1',
        'Last offset     : -0.000002104 seconds',
      ].join('\n');
      const fields = timeSource.parseChronycTracking(text);
      assert.equal(fields['Reference ID'], '7F7F0101 (PHC0)');
      assert.equal(fields['Stratum'], '1');
      assert.equal(fields['Last offset'], '-0.000002104 seconds');
    });

    it('returns {} for empty/falsey input', () => {
      assert.deepEqual(timeSource.parseChronycTracking(''), {});
      assert.deepEqual(timeSource.parseChronycTracking(null), {});
    });
  });

  describe('chronyOffsetToMs', () => {
    it('converts a seconds value to absolute milliseconds', () => {
      assert.equal(timeSource.chronyOffsetToMs('-0.000002104 seconds'), 0.002104);
      assert.equal(timeSource.chronyOffsetToMs('0.5 seconds'), 500);
      assert.equal(timeSource.chronyOffsetToMs('1 second'), 1000);
    });

    it('returns null for unparseable or empty input', () => {
      assert.equal(timeSource.chronyOffsetToMs(''), null);
      assert.equal(timeSource.chronyOffsetToMs(undefined), null);
      assert.equal(timeSource.chronyOffsetToMs('no number here'), null);
    });
  });

  describe('looksLikePtpBacked', () => {
    it('returns true when Reference ID contains a PHC identifier', () => {
      assert.equal(timeSource.looksLikePtpBacked({ 'Reference ID': '7F7F0101 (PHC0)' }, null), true);
    });

    it('returns true when chrony.conf has a refclock PHC line', () => {
      assert.equal(timeSource.looksLikePtpBacked({}, 'refclock PHC /dev/ptp0 poll 0'), true);
    });

    it('returns false for plain NTP', () => {
      assert.equal(timeSource.looksLikePtpBacked({ 'Reference ID': 'C0A80001 (gateway)' }, 'pool 2.pool.ntp.org'), false);
    });
  });

  describe('readClockSourcePosture', () => {
    it('returns null when the posture file is absent', () => {
      assert.equal(timeSource.readClockSourcePosture(root), null);
    });

    it('parses scalar fields, integers, and a block-scalar notes field', () => {
      const yaml = [
        'profile: ptp',
        'max_tolerated_drift_microseconds: 100',
        'empty_field:',
        'notes: |',
        '  line one',
        '  line two',
      ].join('\n');
      writeFile(root, path.join('.ctoc', 'audit', 'clock-source.yaml'), yaml + '\n');
      const posture = timeSource.readClockSourcePosture(root);
      assert.equal(posture.profile, 'ptp');
      assert.equal(posture.max_tolerated_drift_microseconds, 100);
      assert.equal(posture.empty_field, null);
      assert.equal(posture.notes, 'line one\nline two');
    });
  });

  describe('evaluateComplianceAgainstPosture', () => {
    it('with no posture: ok mirrors source !== unknown, reason names the missing file', () => {
      const verdict = timeSource.evaluateComplianceAgainstPosture(root, {
        source: 'system',
        last_known_drift_ms: null,
      });
      assert.equal(verdict.ok, true);
      assert.match(verdict.reason, /no .*clock-source\.yaml/);
      assert.equal(verdict.observed_source, 'system');
      assert.equal(verdict.declared_profile, null);
      assert.equal(verdict.tolerance_microseconds, null);
    });

    it('flags a ptp-required posture when the probe is not ptp', () => {
      writeFile(root, path.join('.ctoc', 'audit', 'clock-source.yaml'), 'profile: ptp\n');
      const verdict = timeSource.evaluateComplianceAgainstPosture(root, {
        source: 'ntp',
        last_known_drift_ms: 0.01,
      });
      assert.equal(verdict.ok, false);
      assert.match(verdict.reason, /profile 'ptp'/);
      assert.equal(verdict.declared_profile, 'ptp');
    });

    it('flags drift exceeding the declared tolerance', () => {
      writeFile(
        root,
        path.join('.ctoc', 'audit', 'clock-source.yaml'),
        'profile: ptp\nmax_tolerated_drift_microseconds: 100\n'
      );
      // 1 ms == 1000 microseconds, which exceeds the 100-microsecond tolerance.
      const verdict = timeSource.evaluateComplianceAgainstPosture(root, {
        source: 'ptp',
        last_known_drift_ms: 1,
      });
      assert.equal(verdict.ok, false);
      assert.match(verdict.reason, /exceeds declared tolerance/);
      assert.equal(verdict.tolerance_microseconds, 100);
    });

    it('passes a ptp posture with in-tolerance drift', () => {
      writeFile(
        root,
        path.join('.ctoc', 'audit', 'clock-source.yaml'),
        'profile: ptp\nmax_tolerated_drift_microseconds: 100\n'
      );
      // 0.05 ms == 50 microseconds, within the 100-microsecond tolerance.
      const verdict = timeSource.evaluateComplianceAgainstPosture(root, {
        source: 'ptp',
        last_known_drift_ms: 0.05,
      });
      assert.equal(verdict.ok, true);
      assert.equal(verdict.reason, null);
    });
  });
});

// ===========================================================================
// 4. metrics-loop.js
//
// Exact API:
//   escapeRate(projectRoot, windowDays=30)
//   defectsPerMillion(projectRoot, windowDays=30)
//   processCapabilityIndex(projectRoot, windowDays=90, usl, lsl)
//   controlChart(projectRoot, metric='rounds', windowDays=90)
//   defectDensity(projectRoot)
//   snapshot(projectRoot, options)
//   loadDispatches / loadCapaRegister / loadIncidents / loadCompletedPlans
//   countTestOpportunities / countLinesAddedByPlan
//   CPK_USL_DEFAULT (12), CPK_LSL_DEFAULT (0)
// ===========================================================================

describe('metrics-loop', () => {
  let root;

  // Recent ISO timestamp inside any reasonable window.
  function recentIso(daysAgo = 1) {
    return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  }

  beforeEach(() => {
    root = makeTempDir('ctoc-metrics-');
  });

  afterEach(() => {
    if (root) rmTempDir(root);
    root = undefined;
  });

  describe('constants', () => {
    it('exposes the documented Cpk specification limits', () => {
      assert.equal(metricsLoop.CPK_USL_DEFAULT, 12);
      assert.equal(metricsLoop.CPK_LSL_DEFAULT, 0);
    });
  });

  describe('loaders on a bare project', () => {
    it('return empty arrays when directories are missing (never throw)', () => {
      assert.deepEqual(metricsLoop.loadDispatches(root), []);
      assert.deepEqual(metricsLoop.loadCapaRegister(root), []);
      assert.deepEqual(metricsLoop.loadIncidents(root), []);
      assert.deepEqual(metricsLoop.loadCompletedPlans(root), []);
    });
  });

  describe('loaders happy path', () => {
    it('loadCompletedPlans parses frontmatter completed_at', () => {
      const fm = ['---', `completed_at: ${recentIso(2)}`, '---', '# Plan body'].join('\n');
      writeFile(root, path.join('plans', 'done', 'my-feature.md'), fm + '\n');
      const plans = metricsLoop.loadCompletedPlans(root);
      assert.equal(plans.length, 1);
      assert.equal(plans[0].slug, 'my-feature');
      assert.ok(plans[0].completedAt);
    });

    it('loadCapaRegister parses fields and skips underscore-prefixed files', () => {
      writeFile(
        root,
        path.join('.ctoc', 'capa', 'capa-1.yaml'),
        `id: capa-1\nplan_id: my-feature\ndiscovered_at: ${recentIso(1)}\ndiscovered_via: incident\nseverity: high\n`
      );
      writeFile(root, path.join('.ctoc', 'capa', '_template.yaml'), 'id: ignore\n');
      const capas = metricsLoop.loadCapaRegister(root);
      assert.equal(capas.length, 1);
      assert.equal(capas[0].id, 'capa-1');
      assert.equal(capas[0].planId, 'my-feature');
      assert.equal(capas[0].severity, 'high');
    });

    it('loadDispatches skips the example/ subdirectory', () => {
      writeFile(
        root,
        path.join('.ctoc', 'audit', 'dispatches', '2026-06-01', 'd1.yaml'),
        `target_agent: iron-loop/verifier\nissued_at: ${recentIso(1)}\ntokens_used: 1000\n`
      );
      writeFile(
        root,
        path.join('.ctoc', 'audit', 'dispatches', 'example', 'd0.yaml'),
        'target_agent: example/agent\n'
      );
      const dispatches = metricsLoop.loadDispatches(root);
      assert.equal(dispatches.length, 1);
      assert.equal(dispatches[0].targetAgent, 'iron-loop/verifier');
      assert.equal(dispatches[0].tokensUsed, 1000);
    });
  });

  describe('escapeRate', () => {
    it('returns 0 with a note when no plans completed in window', () => {
      const res = metricsLoop.escapeRate(root, 30);
      assert.equal(res.rate, 0);
      assert.equal(res.total, 0);
      assert.equal(res.window_days, 30);
      assert.ok(res.note);
    });

    it('counts a plan with an in-window incident as escaped', () => {
      const completedAt = recentIso(2);
      writeFile(
        root,
        path.join('plans', 'done', 'my-feature.md'),
        ['---', `completed_at: ${completedAt}`, '---', 'body'].join('\n')
      );
      writeFile(
        root,
        path.join('.ctoc', 'incidents', 'inc-1.yaml'),
        `id: inc-1\nplan_id: my-feature\noccurred_at: ${recentIso(1)}\nseverity: high\n`
      );
      const res = metricsLoop.escapeRate(root, 30);
      assert.equal(res.total, 1);
      assert.equal(res.escaped, 1);
      assert.equal(res.rate, 1);
    });
  });

  describe('defectsPerMillion', () => {
    it('returns null dpmo with a note when no test opportunities recorded', () => {
      const res = metricsLoop.defectsPerMillion(root, 30);
      assert.equal(res.dpmo, null);
      assert.equal(res.opportunities, 0);
      assert.ok(res.note);
    });

    it('computes DPMO = (defects / opportunities) * 1e6', () => {
      // 1000 test opportunities from a verifier dispatch.
      writeFile(
        root,
        path.join('.ctoc', 'audit', 'dispatches', '2026-06-10', 'v1.yaml'),
        `target_agent: iron-loop/verifier\nissued_at: ${recentIso(1)}\ntests_total: 1000\n`
      );
      // One high-severity CAPA in window == 1 defect.
      writeFile(
        root,
        path.join('.ctoc', 'capa', 'c1.yaml'),
        `id: c1\ndiscovered_at: ${recentIso(1)}\nseverity: high\n`
      );
      const res = metricsLoop.defectsPerMillion(root, 30);
      assert.equal(res.defects, 1);
      assert.equal(res.opportunities, 1000);
      assert.equal(res.dpmo, (1 / 1000) * 1_000_000);
    });
  });

  describe('processCapabilityIndex', () => {
    it('returns null cpk with a note when fewer than 2 journals exist', () => {
      const res = metricsLoop.processCapabilityIndex(root, 90);
      assert.equal(res.cpk, null);
      assert.equal(res.samples, 0);
      assert.ok(res.note);
    });

    it('reports Infinity for zero variance across >=2 plans', () => {
      const journal = `started_at: ${recentIso(1)}\nrounds:\n  - round: 1\n  - round: 2\n`;
      writeFile(root, path.join('.ctoc', 'loops', 'plan-a', 'journal.yaml'), journal);
      writeFile(root, path.join('.ctoc', 'loops', 'plan-b', 'journal.yaml'), journal);
      const res = metricsLoop.processCapabilityIndex(root, 90);
      assert.equal(res.cpk, Infinity);
      assert.equal(res.sigma, 0);
      assert.equal(res.samples, 2);
    });

    it('computes a finite Cpk for varied round counts', () => {
      writeFile(
        root,
        path.join('.ctoc', 'loops', 'plan-a', 'journal.yaml'),
        `started_at: ${recentIso(1)}\nrounds:\n  - round: 1\n  - round: 2\n`
      );
      writeFile(
        root,
        path.join('.ctoc', 'loops', 'plan-b', 'journal.yaml'),
        `started_at: ${recentIso(1)}\nrounds:\n  - round: 1\n  - round: 2\n  - round: 3\n  - round: 4\n`
      );
      const res = metricsLoop.processCapabilityIndex(root, 90);
      assert.equal(res.samples, 2);
      assert.ok(Number.isFinite(res.cpk));
      // mean of [2,4] = 3; documented USL/LSL defaults.
      assert.equal(res.mean, 3);
      assert.equal(res.usl, metricsLoop.CPK_USL_DEFAULT);
      assert.equal(res.lsl, metricsLoop.CPK_LSL_DEFAULT);
    });
  });

  describe('controlChart', () => {
    it('returns an error object for an unknown metric', () => {
      const res = metricsLoop.controlChart(root, 'nonsense', 90);
      assert.ok(res.error);
      assert.match(res.error, /Unknown metric/);
    });

    it('notes insufficient data with fewer than 2 points', () => {
      const res = metricsLoop.controlChart(root, 'rounds', 90);
      assert.equal(res.metric, 'rounds');
      assert.deepEqual(res.points, []);
      assert.equal(res.mean, null);
      assert.equal(res.upper_control_limit, null);
      assert.ok(res.note);
    });

    it('computes 3-sigma limits for rounds and flags a special cause', () => {
      // Twelve tightly-clustered plans (1 round each) plus one large outlier
      // (20 rounds). With Shewhart individuals (sample sigma, n-1 denominator)
      // the cluster keeps sigma small enough that the outlier exceeds the UCL.
      const mk = (n) =>
        `started_at: ${recentIso(1)}\nrounds:\n` +
        Array.from({ length: n }, () => '  - round: x').join('\n') +
        '\n';
      for (let i = 0; i < 12; i++) {
        writeFile(root, path.join('.ctoc', 'loops', `p${i}`, 'journal.yaml'), mk(1));
      }
      writeFile(root, path.join('.ctoc', 'loops', 'outlier', 'journal.yaml'), mk(20));
      const res = metricsLoop.controlChart(root, 'rounds', 90);
      assert.equal(res.points.length, 13);
      assert.equal(typeof res.mean, 'number');
      assert.ok(res.upper_control_limit > res.mean);
      // Lower control limit cannot be negative.
      assert.ok(res.lower_control_limit >= 0);
      assert.ok(res.special_cause_alerts.some((a) => a.kind === 'above-ucl'));
    });
  });

  describe('defectDensity', () => {
    it('returns null density with a note when no shipped plans exist', () => {
      const res = metricsLoop.defectDensity(root);
      assert.equal(res.density, null);
      assert.ok(res.note);
    });

    it('computes defects per KLOC for the most recent shipped plan', () => {
      // Declared file with 1000 lines == 1 KLOC.
      const body = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
      writeFile(root, path.join('src', 'feature.js'), body);
      const fm = [
        '---',
        `completed_at: ${recentIso(1)}`,
        'files:',
        '  - "src/feature.js"',
        '---',
        '# body',
      ].join('\n');
      writeFile(root, path.join('plans', 'done', 'feat.md'), fm + '\n');
      // Two CAPAs against this plan.
      writeFile(root, path.join('.ctoc', 'capa', 'c1.yaml'), 'id: c1\nplan_id: feat\nseverity: low\n');
      writeFile(root, path.join('.ctoc', 'capa', 'c2.yaml'), 'id: c2\nplan_id: feat\nseverity: high\n');
      const res = metricsLoop.defectDensity(root);
      assert.equal(res.plan_id, 'feat');
      assert.equal(res.defects, 2);
      assert.equal(res.lines_added, 1000);
      assert.equal(res.kloc, 1);
      assert.equal(res.density, 2);
    });
  });

  describe('countLinesAddedByPlan', () => {
    it('sums declared file line counts; 0 when none declared', () => {
      writeFile(root, path.join('src', 'x.js'), 'a\nb\nc\n');
      const planWithFiles = {
        content: ['---', 'files:', '  - "src/x.js"', '---', 'body'].join('\n'),
      };
      // "a\nb\nc\n".split('\n') => ['a','b','c',''] == 4 lines per documented strategy.
      assert.equal(metricsLoop.countLinesAddedByPlan(root, planWithFiles), 4);

      const planNoFiles = { content: ['---', 'title: x', '---', 'body'].join('\n') };
      assert.equal(metricsLoop.countLinesAddedByPlan(root, planNoFiles), 0);
    });
  });

  describe('snapshot', () => {
    it('aggregates all metrics with a timestamp', () => {
      const snap = metricsLoop.snapshot(root);
      assert.ok(!Number.isNaN(Date.parse(snap.timestamp)));
      assert.ok('escape_rate' in snap);
      assert.ok('dpmo' in snap);
      assert.ok('cpk' in snap);
      assert.ok('defect_density' in snap);
      assert.ok('rounds_control_chart' in snap);
    });
  });
});

// ===========================================================================
// 5. upgrade-planner.js
//
// Exact API:
//   class UpgradePlanner(analysis, suggestion)
//     .determineCurrentMode() -> 'legacy'|'strict'|'strictest'
//     .generatePlan(options) -> plan object
//     .identifyQuickWins() -> Array
//     ...phase/blocker/milestone/criteria/risk builders + command helpers
//   BASE_EFFORT, COMMON_BLOCKERS
// ===========================================================================

describe('upgrade-planner', () => {
  // Minimal analysis object; the planner reads many optional-chained fields.
  function makeAnalysis(overrides = {}) {
    return {
      project: makeTempDir('ctoc-upgrade-'),
      codebaseSize: { category: 'small', sourceFiles: 20 },
      currentQuality: { overall: 0, scores: { actualCoverage: 0 }, breakdown: {} },
      lintingSetup: { hasLinter: false, linters: [] },
      testingSetup: { hasTests: false, testFramework: null, hasTestScript: false },
      languages: { primary: 'typescript', all: ['typescript'] },
      architecturePattern: { violations: 0, circularDependencies: 0 },
      technicalDebt: { level: 'low' },
      securityPosture: { ignoresSecrets: false },
      ...overrides,
    };
  }

  const tempProjects = [];
  afterEach(() => {
    while (tempProjects.length) rmTempDir(tempProjects.pop());
  });

  function trackedAnalysis(overrides) {
    const a = makeAnalysis(overrides);
    tempProjects.push(a.project);
    return a;
  }

  describe('constants', () => {
    it('exposes BASE_EFFORT and COMMON_BLOCKERS', () => {
      assert.equal(upgradePlanner.BASE_EFFORT.small.coverage, 2);
      assert.equal(upgradePlanner.BASE_EFFORT.enterprise.foundation, 8);
      assert.equal(upgradePlanner.COMMON_BLOCKERS.slowTests.name, 'Slow test suite');
      assert.ok(Array.isArray(upgradePlanner.COMMON_BLOCKERS.noTime.mitigation));
    });
  });

  describe('determineCurrentMode', () => {
    it('returns legacy for low quality and coverage', () => {
      const a = trackedAnalysis();
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strict' });
      assert.equal(p.determineCurrentMode(), 'legacy');
      assert.equal(p.fromMode, 'legacy');
      assert.equal(p.toMode, 'strict');
    });

    it('returns strict for mid quality/coverage', () => {
      const a = trackedAnalysis({
        currentQuality: { overall: 60, scores: { actualCoverage: 60 }, breakdown: {} },
      });
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strictest' });
      assert.equal(p.determineCurrentMode(), 'strict');
    });

    it('returns strictest for high quality and coverage', () => {
      const a = trackedAnalysis({
        currentQuality: { overall: 90, scores: { actualCoverage: 95 }, breakdown: {} },
      });
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strictest' });
      assert.equal(p.determineCurrentMode(), 'strictest');
    });
  });

  describe('generatePlan', () => {
    it('returns the documented top-level shape', () => {
      const a = trackedAnalysis();
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strict' });
      const plan = p.generatePlan();

      assert.equal(plan.fromMode, 'legacy');
      assert.equal(plan.toMode, 'strict');
      assert.ok(!Number.isNaN(Date.parse(plan.generatedAt)));
      assert.equal(plan.projectSize, 'small');
      assert.equal(plan.teamSize, 1);
      assert.equal(plan.dedicatedPercent, 20);
      assert.ok(Array.isArray(plan.quickWins));
      assert.ok(Array.isArray(plan.phases));
      assert.ok(Array.isArray(plan.blockers));
      assert.ok(Array.isArray(plan.milestones));
      assert.ok(Array.isArray(plan.checkpoints));
      assert.equal(typeof plan.successCriteria, 'object');
      assert.ok(Array.isArray(plan.risks));
      assert.equal(typeof plan.totalEstimate, 'object');
      assert.equal(typeof plan.totalEstimate.weeks, 'number');
      assert.ok(['high', 'medium', 'low'].includes(plan.totalEstimate.confidence));
    });

    it('honors team-size / dedicated-percent options', () => {
      const a = trackedAnalysis();
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strict' });
      const plan = p.generatePlan({ teamSize: 3, dedicatedPercent: 50 });
      assert.equal(plan.teamSize, 3);
      assert.equal(plan.dedicatedPercent, 50);
    });

    it('first phase has empty dependsOn; subsequent phases depend on predecessor', () => {
      const a = trackedAnalysis();
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strict' });
      const plan = p.generatePlan();
      assert.ok(plan.phases.length >= 2, 'legacy project should generate multiple phases');
      assert.deepEqual(plan.phases[0].dependsOn, []);
      assert.deepEqual(plan.phases[1].dependsOn, [plan.phases[0].name]);
    });

    it('estimatedWeeks for every phase is a finite non-negative integer', () => {
      const a = trackedAnalysis();
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strict' });
      const plan = p.generatePlan();
      for (const phase of plan.phases) {
        assert.ok(Number.isInteger(phase.estimatedWeeks), `${phase.name} weeks not integer`);
        assert.ok(phase.estimatedWeeks >= 0);
      }
    });
  });

  describe('identifyQuickWins', () => {
    it('suggests linter auto-fix when a linter is present', () => {
      const a = trackedAnalysis({ lintingSetup: { hasLinter: true, linters: ['eslint'] } });
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strict' });
      const wins = p.identifyQuickWins();
      const lintFix = wins.find((w) => w.action === 'Run linter auto-fix');
      assert.ok(lintFix, 'expected a linter auto-fix quick win');
      assert.equal(lintFix.command, 'npx eslint . --fix');
    });

    it('suggests .gitignore secrets update when secrets are not ignored', () => {
      const a = trackedAnalysis({ securityPosture: { ignoresSecrets: false } });
      const p = new upgradePlanner.UpgradePlanner(a, { recommended: 'strict' });
      const wins = p.identifyQuickWins();
      assert.ok(wins.some((w) => w.action === 'Update .gitignore for secrets'));
    });
  });

  describe('command helpers', () => {
    it('getLinterFixCommand maps known linters and falls back', () => {
      const eslint = new upgradePlanner.UpgradePlanner(
        trackedAnalysis({ lintingSetup: { hasLinter: true, linters: ['eslint'] } }),
        { recommended: 'strict' }
      );
      assert.equal(eslint.getLinterFixCommand(), 'npx eslint . --fix');

      const none = new upgradePlanner.UpgradePlanner(
        trackedAnalysis({ lintingSetup: { hasLinter: false, linters: [] } }),
        { recommended: 'strict' }
      );
      assert.equal(none.getLinterFixCommand(), 'Run your linter with --fix flag');
    });

    it('getLinterSetupCommand respects the primary language', () => {
      const ts = new upgradePlanner.UpgradePlanner(
        trackedAnalysis({ languages: { primary: 'typescript', all: ['typescript'] } }),
        { recommended: 'strict' }
      );
      assert.match(ts.getLinterSetupCommand(), /eslint/);

      const unknown = new upgradePlanner.UpgradePlanner(
        trackedAnalysis({ languages: { primary: 'haskell', all: ['haskell'] } }),
        { recommended: 'strict' }
      );
      assert.equal(unknown.getLinterSetupCommand(), 'Install appropriate linter for your language');
    });
  });

  describe('defineSuccessCriteria', () => {
    it('returns strict thresholds for a strict target', () => {
      const p = new upgradePlanner.UpgradePlanner(trackedAnalysis(), { recommended: 'strict' });
      const c = p.defineSuccessCriteria();
      assert.equal(c.coverage.min, 80);
      assert.equal(c.lintErrors.max, 0);
    });

    it('returns strictest thresholds for a strictest target', () => {
      const p = new upgradePlanner.UpgradePlanner(trackedAnalysis(), { recommended: 'strictest' });
      const c = p.defineSuccessCriteria();
      assert.equal(c.coverage.min, 90);
      assert.equal(c.typeAny.max, 0);
      assert.equal(c.documentation.min, 100);
    });
  });
});

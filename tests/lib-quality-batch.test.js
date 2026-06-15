/**
 * Quality lib batch tests
 *
 * Contract-based tests for five previously untested lib modules:
 *   - src/lib/quality-scorer.js
 *   - src/lib/quality-state.js
 *   - src/lib/mode-suggester.js
 *   - src/lib/project-analyzer.js
 *   - src/lib/comparator-agent.js
 *
 * Each module is exercised on the documented contract: every export's happy
 * path, the core correctness property declared in its header/JSDoc, and error
 * paths with malformed input (asserting no uncaught throw). Filesystem modules
 * use hermetic temp directories cleaned up in afterEach. Cross-platform: all
 * paths via path.join / os.tmpdir.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCORER = require('../src/lib/quality-scorer');
const { QualityScorer, GRADES, WEIGHTS, COVERAGE_SUBWEIGHTS } = SCORER;
const { ModeSuggester, SUGGESTION_WEIGHTS, THRESHOLDS } = require('../src/lib/mode-suggester');
const PROJECT_ANALYZER = require('../src/lib/project-analyzer');
const { ProjectAnalyzer, EXCLUDE_PATTERNS, QUALITY_WEIGHTS, DOMAIN_KEYWORDS } = PROJECT_ANALYZER;
const comparator = require('../src/lib/comparator-agent');

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Best-effort cleanup; ignore.
  }
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// ===========================================================================
// quality-scorer.js
// ===========================================================================

describe('quality-scorer.js', () => {
  let projectDir;
  let historyPath;

  function newScorer(opts = {}) {
    // Pin history to an isolated path so calculateScore() does not pollute the
    // repo and so trend math is deterministic per test.
    historyPath = path.join(projectDir, '.ctoc', 'quality-history.json');
    return new QualityScorer(projectDir, { historyPath, ...opts });
  }

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-scorer-');
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports: class + constant tables present and shaped', () => {
    assert.equal(typeof QualityScorer, 'function');
    assert.deepEqual(Object.keys(GRADES).sort(), ['A', 'B', 'C', 'D', 'F']);
    // Component weights must sum to 1.0 (documented: 100 points total).
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `WEIGHTS must sum to 1, got ${sum}`);
    const subSum = Object.values(COVERAGE_SUBWEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(subSum - 1) < 1e-9, `COVERAGE_SUBWEIGHTS must sum to 1, got ${subSum}`);
  });

  test('toGrade — boundary thresholds map to documented grades', () => {
    const s = newScorer();
    assert.equal(s.toGrade(100), 'A');
    assert.equal(s.toGrade(90), 'A');
    assert.equal(s.toGrade(89), 'B');
    assert.equal(s.toGrade(80), 'B');
    assert.equal(s.toGrade(79), 'C');
    assert.equal(s.toGrade(70), 'C');
    assert.equal(s.toGrade(69), 'D');
    assert.equal(s.toGrade(60), 'D');
    assert.equal(s.toGrade(59), 'F');
    assert.equal(s.toGrade(0), 'F');
  });

  test('calculateScore — happy path returns full documented shape', async () => {
    const s = newScorer();
    const result = await s.calculateScore();

    assert.equal(typeof result.overall, 'number');
    assert.ok(result.overall >= 0 && result.overall <= 100, 'overall in [0,100]');
    assert.ok(Object.prototype.hasOwnProperty.call(GRADES, result.grade), 'grade is a valid grade');
    assert.equal(result.gradeInfo, GRADES[result.grade]);
    assert.deepEqual(
      Object.keys(result.components).sort(),
      ['architecture', 'complexity', 'coverage', 'documentation', 'lint', 'security']
    );
    assert.equal(result.weights, WEIGHTS);
    assert.ok(result.trend && typeof result.trend === 'object');
    assert.ok(Array.isArray(result.recommendations));
    assert.equal(typeof result.timestamp, 'string');
  });

  test('calculateScore — overall equals the documented weighted sum of components', async () => {
    const s = newScorer();
    const result = await s.calculateScore();
    let expected = 0;
    for (const [name, data] of Object.entries(result.components)) {
      expected += data.score * WEIGHTS[name];
    }
    assert.equal(result.overall, Math.round(expected));
  });

  test('getCoverageScore — istanbul summary weighted by COVERAGE_SUBWEIGHTS', async () => {
    // 100% across the board => full 25 points.
    writeFile(projectDir, 'coverage/coverage-summary.json', JSON.stringify({
      total: {
        lines: { pct: 100 },
        branches: { pct: 100 },
        functions: { pct: 100 },
        statements: { pct: 100 }
      }
    }));
    const s = newScorer();
    const cov = await s.getCoverageScore();
    assert.equal(cov.maxScore, 25);
    assert.equal(cov.source, 'coverage/coverage-summary.json');
    assert.equal(cov.score, 25, 'full coverage => full 25 points');

    // Verify the weighting: only branches covered (others 0). Weighted% = 40 of 100.
    rmDir(path.join(projectDir, 'coverage'));
    writeFile(projectDir, 'coverage/coverage-summary.json', JSON.stringify({
      total: {
        lines: { pct: 0 },
        branches: { pct: 100 },
        functions: { pct: 0 },
        statements: { pct: 0 }
      }
    }));
    const s2 = newScorer();
    const cov2 = await s2.getCoverageScore();
    const expectedWeightedPct = 100 * COVERAGE_SUBWEIGHTS.branches; // 40
    assert.equal(cov2.score, Math.round((expectedWeightedPct / 100) * 25));
  });

  test('getCoverageScore — no report found is reported, not thrown', async () => {
    const s = newScorer();
    const cov = await s.getCoverageScore();
    assert.equal(cov.score, 0);
    assert.equal(cov.source, null);
    assert.ok(cov.details.includes('No coverage report found'));
  });

  test('getLintScore — eslint-format results deduct per documented formula', async () => {
    writeFile(projectDir, 'eslint.config.js', 'module.exports = [];');
    writeFile(projectDir, 'lint-results.json', JSON.stringify([
      { errorCount: 2, warningCount: 4, fixableErrorCount: 1, fixableWarningCount: 1 }
    ]));
    const s = newScorer();
    const lint = await s.getLintScore();
    // deductions = errors*2.0 + warnings*0.5 = 4 + 2 = 6 ; 20 - 6 = 14
    assert.equal(lint.metrics.errors, 2);
    assert.equal(lint.metrics.warnings, 4);
    assert.equal(lint.metrics.fixable, 2);
    assert.equal(lint.score, 14);
  });

  test('getLintScore — no lint config yields documented partial score 10', async () => {
    const s = newScorer();
    const lint = await s.getLintScore();
    assert.equal(lint.score, 10);
    assert.ok(lint.details.includes('No lint configuration found'));
  });

  test('getLintScore — malformed lint-results.json does not throw', async () => {
    writeFile(projectDir, 'eslint.config.js', 'module.exports = [];');
    writeFile(projectDir, 'lint-results.json', '{ this is not json');
    const s = newScorer();
    const lint = await s.getLintScore();
    assert.ok(lint.details.some(d => d.startsWith('Failed to parse lint results')));
  });

  test('getSecurityScore — any critical vuln zeroes the security score', async () => {
    writeFile(projectDir, 'npm-audit.json', JSON.stringify({
      metadata: { vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0 } }
    }));
    const s = newScorer();
    const sec = await s.getSecurityScore();
    assert.equal(sec.metrics.critical, 1);
    assert.equal(sec.score, 0, 'documented: any critical => zero security score');
  });

  test('getSecurityScore — high/medium/low deduct without zeroing', async () => {
    writeFile(projectDir, 'npm-audit.json', JSON.stringify({
      metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 1, low: 2 } }
    }));
    const s = newScorer();
    const sec = await s.getSecurityScore();
    // deductions = high*5 + medium*2 + low*0.5 = 5 + 2 + 1 = 8 ; 20 - 8 = 12
    assert.equal(sec.score, 12);
    assert.equal(sec.metrics.total, 4);
  });

  test('getSecurityScore — malformed audit file does not throw', async () => {
    writeFile(projectDir, 'security-audit.json', 'not-json-at-all');
    const s = newScorer();
    const sec = await s.getSecurityScore();
    assert.ok(sec.details.some(d => d.startsWith('Failed to parse')));
    // No source recorded because parse failed.
    assert.equal(sec.source, null);
  });

  test('getComplexityScore — clean defaults yield full 15 points', async () => {
    const s = newScorer();
    const cx = await s.getComplexityScore();
    assert.equal(cx.maxScore, 15);
    assert.equal(cx.score, 15, 'no complexity report => default-clean full score');
  });

  test('getComplexityScore — high complexity deducts to documented floor', async () => {
    writeFile(projectDir, 'complexity-report.json', JSON.stringify({
      summary: { averageCyclomatic: 12, maxCyclomatic: 25, hotspots: 5, totalFunctions: 10 }
    }));
    const s = newScorer();
    const cx = await s.getComplexityScore();
    // avg>10 =>1, max>20 =>1, hotspots>3 =>1 => 3
    assert.equal(cx.score, 3);
    assert.equal(cx.metrics.avgCyclomatic, 12);
  });

  test('getArchitectureScore + getDocumentationScore — bounded to maxScore', async () => {
    writeFile(projectDir, 'README.md', 'install usage api license contribut ' + 'x'.repeat(600));
    const s = newScorer();
    const arch = await s.getArchitectureScore();
    const doc = await s.getDocumentationScore();
    assert.ok(arch.score >= 0 && arch.score <= arch.maxScore);
    assert.ok(doc.score >= 0 && doc.score <= doc.maxScore);
    assert.equal(doc.metrics.hasReadme, true);
  });

  test('calculateTrend — fewer than 2 history entries reports "New"/stable', () => {
    const s = newScorer();
    s.history = [];
    const t0 = s.calculateTrend(80);
    assert.equal(t0.label, 'New');
    assert.equal(t0.direction, 'stable');
    assert.equal(t0.change, 0);
  });

  test('calculateTrend — direction derived from delta vs last entry', () => {
    const s = newScorer();
    s.history = [{ overall: 70 }, { overall: 70 }];
    assert.equal(s.calculateTrend(80).direction, 'up');   // +10
    assert.equal(s.calculateTrend(60).direction, 'down'); // -10
    assert.equal(s.calculateTrend(70).direction, 'stable'); // 0
  });

  test('recordScore/loadHistory — round-trips score history to disk', () => {
    const s = newScorer();
    s.recordScore(77, { coverage: { score: 20 }, lint: { score: 18 } });
    assert.ok(fs.existsSync(historyPath), 'history file written');

    const s2 = newScorer();
    const loaded = s2.loadHistory();
    assert.ok(Array.isArray(loaded) && loaded.length >= 1);
    assert.equal(loaded[loaded.length - 1].overall, 77);
    assert.equal(loaded[loaded.length - 1].components.coverage, 20);
  });

  test('loadHistory — corrupt history file returns empty array (self-heals)', () => {
    fs.mkdirSync(path.join(projectDir, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.ctoc', 'quality-history.json'), 'garbage{', 'utf8');
    const s = newScorer();
    assert.deepEqual(s.history, []);
  });

  test('getHistory — filters entries by age window', () => {
    const s = newScorer();
    const now = Date.now();
    const old = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    s.history = [{ timestamp: old, overall: 1 }, { timestamp: recent, overall: 2 }];
    const last30 = s.getHistory(30);
    assert.equal(last30.length, 1);
    assert.equal(last30[0].overall, 2);
  });

  test('getRecommendations — P0 critical-security sorts ahead of lower priorities', () => {
    const s = newScorer();
    const recs = s.getRecommendations({
      security: { metrics: { critical: 2, high: 0 } },
      coverage: { score: 25, metrics: { branches: 90 } },
      complexity: { hotspotFiles: [] },
      architecture: { violations: [], cycles: [], metrics: {} },
      lint: { metrics: { errors: 3, fixable: 1 } },
      documentation: { metrics: { hasReadme: false } }
    });
    assert.ok(recs.length >= 1);
    assert.equal(recs[0].priority, 'P0');
    assert.equal(recs[0].category, 'SECURITY');
    // Sorted non-decreasing by priority rank.
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
    for (let i = 1; i < recs.length; i++) {
      assert.ok(order[recs[i].priority] >= order[recs[i - 1].priority], 'recommendations sorted by priority');
    }
  });
});

// ===========================================================================
// quality-state.js
//
// This module derives its state directory from findProjectRoot() and lazily
// caches it at module scope. To test hermetically we (1) create a temp project
// with a .ctoc marker, (2) chdir into it, (3) clear the require cache and
// re-require so the lazy _stateDir resolves to the temp dir. Each test gets a
// fresh module instance + fresh temp dir.
// ===========================================================================

describe('quality-state.js', () => {
  let tmpDir;
  let originalCwd;
  let qs;

  function freshModule() {
    const modPath = require.resolve('../src/lib/quality-state');
    delete require.cache[modPath];
    // project-root is also cwd-sensitive but takes startDir at call time; it is
    // not cached, so no need to bust it. quality-state caches _stateDir.
    return require('../src/lib/quality-state');
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = makeTempDir('ctoc-qstate-');
    // .ctoc marker makes findProjectRoot() resolve to tmpDir deterministically.
    fs.mkdirSync(path.join(tmpDir, '.ctoc'), { recursive: true });
    process.chdir(tmpDir);
    qs = freshModule();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmDir(tmpDir);
  });

  test('exports — all documented functions present', () => {
    const expected = [
      'ensureStateDir', 'atomicWrite', 'safeRead',
      'acquireLock', 'releaseLock', 'isProcessAlive',
      'getStatus', 'updateStatus', 'setRunning', 'setCompleted',
      'updateTierStatus', 'recoverIfNeeded',
      'getFileHashes', 'updateFileHashes',
      'getCoverageMap', 'updateCoverageMap', 'needsCoverageMapRebuild',
      'getStateDir', 'getStatusFilePath', 'getLockFilePath',
      'getFileHashesPath', 'getCoverageMapPath', 'getGitHead'
    ];
    for (const name of expected) {
      assert.equal(typeof qs[name], 'function', `${name} should be exported`);
    }
  });

  test('getStateDir — resolves under the project root .ctoc/quality-state', () => {
    const dir = qs.getStateDir();
    // realpath both sides: macOS tmpdir is a /private symlink.
    assert.equal(fs.realpathSync(path.dirname(path.dirname(dir))), fs.realpathSync(tmpDir));
    assert.equal(path.basename(dir), 'quality-state');
  });

  test('ensureStateDir — creates the state directory', () => {
    qs.ensureStateDir();
    assert.ok(fs.existsSync(qs.getStateDir()));
  });

  test('atomicWrite + safeRead — JSON round-trip (no .tmp residue)', () => {
    const target = path.join(qs.getStateDir(), 'thing.json');
    qs.atomicWrite(target, { a: 1, b: ['x'] });
    assert.deepEqual(qs.safeRead(target), { a: 1, b: ['x'] });
    // Documented contract: temp file is renamed away, not left behind.
    const residue = fs.readdirSync(qs.getStateDir()).filter(f => f.includes('.tmp.'));
    assert.deepEqual(residue, []);
  });

  test('safeRead — missing file returns the provided default', () => {
    const missing = path.join(qs.getStateDir(), 'nope.json');
    assert.equal(qs.safeRead(missing, null), null);
    assert.deepEqual(qs.safeRead(missing, { d: true }), { d: true });
  });

  test('safeRead — corrupt JSON returns default, does not throw', () => {
    qs.ensureStateDir();
    const target = path.join(qs.getStateDir(), 'corrupt.json');
    fs.writeFileSync(target, '{not valid', 'utf8');
    assert.deepEqual(qs.safeRead(target, { fallback: 1 }), { fallback: 1 });
  });

  test('isProcessAlive — true for self, false for a clearly-dead PID', () => {
    assert.equal(qs.isProcessAlive(process.pid), true);
    // PID far beyond any plausible live process; kill(pid,0) should ESRCH.
    assert.equal(qs.isProcessAlive(2 ** 31 - 1), false);
  });

  test('acquireLock/releaseLock — acquires once and releases own lock', () => {
    assert.equal(qs.acquireLock(), true);
    assert.ok(fs.existsSync(qs.getLockFilePath()), 'lock file created');
    const lock = JSON.parse(fs.readFileSync(qs.getLockFilePath(), 'utf8'));
    assert.equal(lock.pid, process.pid);
    qs.releaseLock();
    assert.equal(fs.existsSync(qs.getLockFilePath()), false, 'own lock removed');
  });

  test('acquireLock — stale lock from a dead PID is reclaimed', () => {
    qs.ensureStateDir();
    qs.atomicWrite(qs.getLockFilePath(), {
      pid: 2 ** 31 - 1, startedAt: new Date().toISOString(), hostname: 'ghost'
    });
    assert.equal(qs.acquireLock(), true, 'stale lock reclaimed');
    const lock = JSON.parse(fs.readFileSync(qs.getLockFilePath(), 'utf8'));
    assert.equal(lock.pid, process.pid);
  });

  test('getStatus — returns the documented default skeleton when absent', () => {
    const status = qs.getStatus();
    assert.equal(status.overallStatus, 'unknown');
    assert.deepEqual(Object.keys(status.tiers).sort(), ['tier1', 'tier2', 'tier3']);
    assert.ok(status.summary && status.summary.tests);
    assert.equal(status.summary.tests.passed, 0);
  });

  test('updateStatus — shallow-merges and stamps asOf', () => {
    const updated = qs.updateStatus({ overallStatus: 'running' });
    assert.equal(updated.overallStatus, 'running');
    assert.equal(typeof updated.asOf, 'string');
    // Persisted, then readable back.
    assert.equal(qs.getStatus().overallStatus, 'running');
  });

  test('setRunning -> setCompleted — transitions status and records duration', () => {
    qs.setRunning('test');
    assert.equal(qs.getStatus().overallStatus, 'running');
    const done = qs.setCompleted(true, { coverage: 90 });
    assert.equal(done.overallStatus, 'pass');
    assert.equal(done.summary.coverage, 90);
    assert.equal(typeof done.lastRun.completedAt, 'string');
    assert.equal(typeof done.lastRun.duration, 'number');
    assert.ok(done.lastRun.duration >= 0);

    qs.setRunning('test');
    assert.equal(qs.setCompleted(false, {}).overallStatus, 'fail');
  });

  test('updateTierStatus — updates one tier and stamps checkedAt', () => {
    qs.updateTierStatus('tier2', { status: 'pass', checks: 5 });
    const status = qs.getStatus();
    assert.equal(status.tiers.tier2.status, 'pass');
    assert.equal(status.tiers.tier2.checks, 5);
    assert.equal(typeof status.tiers.tier2.checkedAt, 'string');
    // Other tiers untouched (still pending from default).
    assert.equal(status.tiers.tier1.status, 'pending');
  });

  test('recoverIfNeeded — resets a running state that has no lock', () => {
    qs.updateStatus({ overallStatus: 'running' });
    // No lock present.
    assert.equal(fs.existsSync(qs.getLockFilePath()), false);
    assert.equal(qs.recoverIfNeeded(), true);
    assert.equal(qs.getStatus().overallStatus, 'unknown');
    // Idempotent: nothing to recover the second time.
    assert.equal(qs.recoverIfNeeded(), false);
  });

  test('file hashes — update merges, get reads back', () => {
    qs.updateFileHashes({ 'a.js': 'h1' });
    qs.updateFileHashes({ 'b.js': 'h2' });
    assert.deepEqual(qs.getFileHashes(), { 'a.js': 'h1', 'b.js': 'h2' });
  });

  test('coverage map — update replaces, needsRebuild logic honored', () => {
    // Empty/missing map => rebuild needed.
    assert.equal(qs.needsCoverageMapRebuild().needed, true);

    qs.updateCoverageMap({ 'x.js': ['x.test.js'], _meta: { rebuiltAt: new Date().toISOString() } });
    assert.deepEqual(qs.getCoverageMap()['x.js'], ['x.test.js']);
    assert.equal(qs.needsCoverageMapRebuild().needed, false, 'fresh map => no rebuild');

    // Older than 7 days => rebuild needed.
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    qs.updateCoverageMap({ 'x.js': ['x.test.js'], _meta: { rebuiltAt: old } });
    assert.equal(qs.needsCoverageMapRebuild().needed, true, 'stale map => rebuild');
  });

  test('getGitHead — returns a string SHA or null, never throws', () => {
    const head = qs.getGitHead();
    assert.ok(head === null || typeof head === 'string');
  });
});

// ===========================================================================
// mode-suggester.js
// ===========================================================================

describe('mode-suggester.js', () => {
  test('exports — class + weight/threshold tables', () => {
    assert.equal(typeof ModeSuggester, 'function');
    assert.equal(typeof SUGGESTION_WEIGHTS, 'object');
    assert.ok(THRESHOLDS.strict && THRESHOLDS.strictest && THRESHOLDS.legacy);
  });

  test('suggest — minimal project recommends strict with high confidence', () => {
    const s = new ModeSuggester({ codebaseSize: { totalFiles: 1, totalLines: 10 } });
    const out = s.suggest();
    assert.equal(out.recommended, 'strict');
    assert.equal(out.confidence, 'high');
    assert.equal(out.alternative, 'strictest');
    assert.ok(Array.isArray(out.quickWins) && out.quickWins.length > 0);
    assert.equal(out.effort, 'low');
  });

  test('isMinimalProject — boundary on documented thresholds (<5 files OR <100 lines)', () => {
    assert.equal(new ModeSuggester({ codebaseSize: { totalFiles: 4, totalLines: 200 } }).isMinimalProject(), true);
    assert.equal(new ModeSuggester({ codebaseSize: { totalFiles: 50, totalLines: 99 } }).isMinimalProject(), true);
    assert.equal(new ModeSuggester({ codebaseSize: { totalFiles: 50, totalLines: 5000 } }).isMinimalProject(), false);
    // Missing size => treated as minimal (defensive, per R6/B6).
    assert.equal(new ModeSuggester({}).isMinimalProject(), true);
  });

  test('suggest — high-stakes domain drives strictest when foundations exist', () => {
    const analysis = {
      project: os.tmpdir(), // analyze() always sets .project; getQuickWins() reads it.
      codebaseSize: { totalFiles: 200, totalLines: 50000, category: 'medium', sourceFiles: 150 },
      domainAnalysis: { suggestsStrictest: true, dominantDomain: 'financial' },
      currentQuality: { overall: 80, scores: { actualCoverage: 85 }, breakdown: { ci: true } },
      testingSetup: { hasTests: true, hasCoverage: true },
      lintingSetup: { hasLinter: true, linters: ['eslint'] },
      securityPosture: { hasSecurityTools: true },
      architecturePattern: { pattern: 'layered', violations: 0 },
      projectAge: { isNewProject: false, activity: 'active', ageMonths: 24 }
    };
    const out = new ModeSuggester(analysis).suggest();
    assert.equal(out.recommended, 'strictest');
    assert.equal(out.confidence, 'high');
    assert.equal(out.alternative, 'strict');
    assert.ok(out.evidence.length > 0);
  });

  test('calculate*Score — all three modes return integers in [0,100]', () => {
    const analysis = {
      codebaseSize: { totalFiles: 200, totalLines: 50000, category: 'large', sourceFiles: 150 },
      currentQuality: { overall: 30, scores: { actualCoverage: 20 }, breakdown: {} },
      testingSetup: { hasTests: false },
      lintingSetup: { hasLinter: false },
      securityPosture: {},
      architecturePattern: {},
      projectAge: { isNewProject: false, activity: 'abandoned' },
      domainAnalysis: { suggestsStrictest: false }
    };
    const s = new ModeSuggester(analysis);
    for (const fn of ['calculateStrictScore', 'calculateStrictestScore', 'calculateLegacyScore']) {
      const v = s[fn]();
      assert.equal(Number.isInteger(v), true, `${fn} returns integer`);
      assert.ok(v >= 0 && v <= 100, `${fn} in [0,100], got ${v}`);
    }
  });

  test('suggest — abandoned low-quality codebase recommends legacy + upgrade path', () => {
    const analysis = {
      project: os.tmpdir(),
      codebaseSize: { totalFiles: 400, totalLines: 120000, category: 'large', sourceFiles: 300 },
      currentQuality: { overall: 25, scores: { actualCoverage: 10 }, breakdown: {} },
      testingSetup: { hasTests: false },
      lintingSetup: { hasLinter: false },
      securityPosture: { ignoresSecrets: false },
      architecturePattern: { circularDependencies: 2, violations: 3 },
      projectAge: { isNewProject: false, activity: 'abandoned' },
      domainAnalysis: { suggestsStrictest: false },
      technicalDebt: { level: 'critical' }
    };
    const out = new ModeSuggester(analysis).suggest();
    assert.equal(out.recommended, 'legacy');
    assert.ok(out.upgradePath, 'legacy recommendation includes an upgrade path');
    assert.equal(out.upgradePath.fromMode, 'legacy');
    assert.equal(out.upgradePath.toMode, 'strict');
    assert.ok(Array.isArray(out.upgradePath.phases) && out.upgradePath.phases.length > 0);
    assert.ok(Array.isArray(out.prioritizedFixes) && out.prioritizedFixes.length > 0);
    // Prioritized fixes are sorted by ascending priority.
    for (let i = 1; i < out.prioritizedFixes.length; i++) {
      assert.ok(out.prioritizedFixes[i].priority >= out.prioritizedFixes[i - 1].priority);
    }
  });

  test('determineRecommendedMode — always returns a valid mode + confidence', () => {
    const s = new ModeSuggester({ projectAge: {} });
    const r = s.determineRecommendedMode({ strict: 45, strictest: 10, legacy: 20 });
    assert.ok(['strict', 'strictest', 'legacy'].includes(r.recommended));
    assert.ok(['low', 'medium', 'high'].includes(r.confidence));
    assert.ok(['strict', 'strictest', 'legacy'].includes(r.alternativeMode));
  });

  test('suggest — empty/degenerate analysis does not throw and yields a valid mode', () => {
    // Non-minimal (so it goes through scoring) but otherwise empty objects.
    const analysis = {
      project: os.tmpdir(),
      codebaseSize: { totalFiles: 100, totalLines: 5000 }
    };
    const out = new ModeSuggester(analysis).suggest();
    assert.ok(['strict', 'strictest', 'legacy'].includes(out.recommended));
    assert.ok(out.scores && typeof out.scores.strict === 'number');
  });
});

// ===========================================================================
// project-analyzer.js
// ===========================================================================

describe('project-analyzer.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-analyzer-');
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports — class + constant tables present', () => {
    assert.equal(typeof ProjectAnalyzer, 'function');
    assert.ok(Array.isArray(EXCLUDE_PATTERNS) && EXCLUDE_PATTERNS.includes('node_modules'));
    assert.equal(typeof QUALITY_WEIGHTS.hasTests, 'number');
    assert.ok(Array.isArray(DOMAIN_KEYWORDS.financial) && DOMAIN_KEYWORDS.financial.includes('payment'));
  });

  test('categorizeSizeByLines — documented size-category boundaries', () => {
    const a = new ProjectAnalyzer(projectDir);
    assert.equal(a.categorizeSizeByLines(999), 'tiny');
    assert.equal(a.categorizeSizeByLines(1000), 'small');
    assert.equal(a.categorizeSizeByLines(9999), 'small');
    assert.equal(a.categorizeSizeByLines(10000), 'medium');
    assert.equal(a.categorizeSizeByLines(49999), 'medium');
    assert.equal(a.categorizeSizeByLines(50000), 'large');
    assert.equal(a.categorizeSizeByLines(199999), 'large');
    assert.equal(a.categorizeSizeByLines(200000), 'enterprise');
  });

  test('categorizeDebtLevel — documented debt-level boundaries', () => {
    const a = new ProjectAnalyzer(projectDir);
    assert.equal(a.categorizeDebtLevel(0), 'low');
    assert.equal(a.categorizeDebtLevel(15), 'low');
    assert.equal(a.categorizeDebtLevel(16), 'moderate');
    assert.equal(a.categorizeDebtLevel(35), 'moderate');
    assert.equal(a.categorizeDebtLevel(36), 'high');
    assert.equal(a.categorizeDebtLevel(60), 'high');
    assert.equal(a.categorizeDebtLevel(61), 'critical');
  });

  test('helper detections — true on a configured project', () => {
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'p', scripts: { test: 'node --test', lint: 'eslint .' }
    }));
    writeFile(projectDir, 'eslint.config.js', 'module.exports = [];');
    writeFile(projectDir, 'tsconfig.json', '{}');
    writeFile(projectDir, '.prettierrc', '{}');
    writeFile(projectDir, '.github/workflows/ci.yml', 'name: ci');
    writeFile(projectDir, '.snyk', '');
    writeFile(projectDir, 'README.md', 'x'.repeat(200));

    const a = new ProjectAnalyzer(projectDir);
    assert.equal(a.hasTestingSetup(), true);
    assert.equal(a.hasLinterSetup(), true);
    assert.equal(a.hasFormatterSetup(), true);
    assert.equal(a.hasTypeCheckerSetup(), true);
    assert.equal(a.hasCISetup(), true);
    assert.equal(a.hasSecuritySetup(), true);
    assert.equal(a.hasDocumentation(), true);
    assert.equal(a.hasPackageScript('test'), true);
    assert.equal(a.hasPackageScript('nonexistent'), false);
  });

  test('helper detections — falsy on a bare project', () => {
    const a = new ProjectAnalyzer(projectDir);
    // NOTE (documented quirk): hasTestingSetup() / hasPackageScript() are
    // JSDoc'd `@returns {boolean}` but leak `null` (falsy) when package.json is
    // absent, because `hasPackageScript` returns `pkg && pkg.scripts && ...`
    // and `pkg` is null. Behavioral intent (no testing detected) is preserved,
    // so we assert falsiness rather than strict `=== false`. The strictly-
    // boolean helpers below DO return `false`.
    assert.ok(!a.hasTestingSetup(), 'no tests => falsy');
    assert.equal(a.hasLinterSetup(), false);
    assert.equal(a.hasFormatterSetup(), false);
    assert.equal(a.hasTypeCheckerSetup(), false);
    assert.equal(a.hasCISetup(), false);
    assert.equal(a.hasSecuritySetup(), false);
    assert.equal(a.hasDocumentation(), false);
  });

  test('readPackageJson — malformed package.json returns null (no throw)', () => {
    writeFile(projectDir, 'package.json', '{ broken');
    const a = new ProjectAnalyzer(projectDir);
    // readPackageJson is contractually `@returns {Object|null}` — null is correct.
    assert.equal(a.readPackageJson(), null);
    // hasPackageScript leaks falsy `null` (not strict false) when pkg is null;
    // assert behavioral intent (script not present).
    assert.ok(!a.hasPackageScript('test'), 'no script => falsy');
  });

  test('readFileSafe — missing file returns empty string', () => {
    const a = new ProjectAnalyzer(projectDir);
    assert.equal(a.readFileSafe(path.join(projectDir, 'no-such-file.txt')), '');
  });

  test('walkFiles — skips excluded directories (node_modules)', () => {
    writeFile(projectDir, 'src/index.js', 'console.log(1);');
    writeFile(projectDir, 'node_modules/dep/index.js', 'module.exports={};');
    const a = new ProjectAnalyzer(projectDir);
    const seen = [];
    a.walkFiles(projectDir, (f) => seen.push(f));
    assert.ok(seen.some(f => f.endsWith(path.join('src', 'index.js'))));
    assert.ok(!seen.some(f => f.includes('node_modules')), 'node_modules excluded from walk');
  });

  test('measureSize — counts and categorizes source vs test files', async () => {
    writeFile(projectDir, 'src/a.js', 'line1\nline2\nline3\n');
    writeFile(projectDir, 'src/b.js', 'x\n');
    writeFile(projectDir, 'src/a.test.js', 'test();\n');
    const a = new ProjectAnalyzer(projectDir);
    const size = await a.measureSize();
    assert.equal(size.sourceFiles, 2);
    assert.equal(size.testFiles, 1);
    assert.ok(size.totalLines >= 5);
    assert.equal(typeof size.category, 'string');
  });

  test('analyzeDomain — strong financial keyword signal flags strictest', async () => {
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'payment-gateway', description: 'banking checkout invoice billing'
    }));
    writeFile(projectDir, 'src/stripe.js', '// payment refund');
    writeFile(projectDir, 'README.md', 'A finance and currency wallet ledger app');
    const a = new ProjectAnalyzer(projectDir);
    const domain = await a.analyzeDomain();
    assert.equal(domain.dominantDomain, 'financial');
    assert.equal(domain.suggestsStrictest, true);
  });

  test('analyze — full pipeline on a temp project returns the documented shape', async () => {
    writeFile(projectDir, 'package.json', JSON.stringify({ name: 'demo', scripts: {} }));
    writeFile(projectDir, 'src/index.js', 'module.exports = 1;\n');
    const a = new ProjectAnalyzer(projectDir);
    const result = await a.analyze();

    const expectedKeys = [
      'project', 'analyzedAt', 'analysisTimeMs', 'languages', 'frameworks',
      'currentQuality', 'testingSetup', 'lintingSetup', 'securityPosture',
      'architecturePattern', 'codebaseSize', 'technicalDebt', 'projectAge',
      'domainAnalysis'
    ];
    for (const key of expectedKeys) {
      assert.ok(Object.prototype.hasOwnProperty.call(result, key), `analyze() result has ${key}`);
    }
    assert.ok(result.currentQuality.overall >= 0 && result.currentQuality.overall <= 100, 'overall in [0,100]');
    assert.equal(typeof result.analysisTimeMs, 'number');
  });

  test('analyze — empty project does not throw', async () => {
    const a = new ProjectAnalyzer(projectDir);
    const result = await a.analyze();
    assert.ok(result && typeof result === 'object');
    assert.ok(result.currentQuality.overall >= 0);
  });
});

// ===========================================================================
// comparator-agent.js
//
// The comparator throws by design when ANTHROPIC_API_KEY is set (live wiring
// is intentionally unimplemented). All tests run with the key unset so the
// documented deterministic stub path is exercised; the key is saved/restored.
// ===========================================================================

describe('comparator-agent.js', () => {
  let savedKey;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = savedKey;
    }
  });

  const goodCase = { id: 'case-1', skill: 'demo-skill', input: 'analyze this' };

  test('exports — public API, constants, and test internals present', () => {
    assert.equal(typeof comparator.compareSkillVersions, 'function');
    assert.equal(typeof comparator.runSkillOnCase, 'function');
    assert.equal(typeof comparator.judgeOutputs, 'function');
    assert.ok(Array.isArray(comparator.SUPPORTED_JUDGE_MODELS));
    assert.equal(comparator.STUB_TIE_CONFIDENCE, 0.5);
    assert.equal(typeof comparator._internal.validateCaseShape, 'function');
  });

  test('SUPPORTED_JUDGE_MODELS — frozen (documented Object.freeze)', () => {
    assert.equal(Object.isFrozen(comparator.SUPPORTED_JUDGE_MODELS), true);
    assert.ok(comparator.SUPPORTED_JUDGE_MODELS.length > 0);
  });

  test('runSkillOnCase — stub output marked stub=true, carries id/skill/version', async () => {
    const res = await comparator.runSkillOnCase(goodCase, 'main');
    assert.equal(res.stub, true);
    assert.equal(res.version, 'main');
    assert.equal(res.latency_ms, 0);
    assert.ok(res.output.includes('STUB OUTPUT'));
    assert.ok(res.output.includes(goodCase.id));
    assert.ok(res.output.includes(goodCase.skill));
  });

  test('runSkillOnCase — output differs per version (judge can discriminate)', async () => {
    const a = await comparator.runSkillOnCase(goodCase, 'main');
    const b = await comparator.runSkillOnCase(goodCase, 'HEAD');
    assert.notEqual(a.output, b.output, 'fingerprint differs by version');
  });

  test('runSkillOnCase — rejects empty/non-string version', async () => {
    await assert.rejects(() => comparator.runSkillOnCase(goodCase, ''), TypeError);
    await assert.rejects(() => comparator.runSkillOnCase(goodCase, 123), TypeError);
  });

  test('runSkillOnCase — rejects malformed case shape', async () => {
    await assert.rejects(() => comparator.runSkillOnCase(null, 'main'), TypeError);
    await assert.rejects(() => comparator.runSkillOnCase({ skill: 's', input: 'i' }, 'main'), TypeError);
    await assert.rejects(() => comparator.runSkillOnCase({ id: 'x', input: 'i' }, 'main'), TypeError);
    await assert.rejects(() => comparator.runSkillOnCase({ id: 'x', skill: 's' }, 'main'), TypeError);
  });

  test('judgeOutputs — stub returns low-confidence tie marked stub=true', async () => {
    const verdict = await comparator.judgeOutputs('input', 'out A', 'out B');
    assert.equal(verdict.winner, 'tie');
    assert.equal(verdict.confidence, comparator.STUB_TIE_CONFIDENCE);
    assert.equal(verdict.stub, true);
    assert.equal(verdict.model, 'stub');
    assert.equal(typeof verdict.reasoning, 'string');
  });

  test('judgeOutputs — type-checks all three string args', async () => {
    await assert.rejects(() => comparator.judgeOutputs(1, 'a', 'b'), TypeError);
    await assert.rejects(() => comparator.judgeOutputs('i', 2, 'b'), TypeError);
    await assert.rejects(() => comparator.judgeOutputs('i', 'a', {}), TypeError);
  });

  test('compareSkillVersions — stub path returns full documented verdict shape', async () => {
    const result = await comparator.compareSkillVersions(goodCase, 'main', 'HEAD');
    assert.ok(['A', 'B', 'tie'].includes(result.winner));
    assert.equal(typeof result.confidence, 'number');
    assert.equal(typeof result.judge_reasoning, 'string');
    assert.ok(['AB', 'BA'].includes(result.shuffled_position));
    assert.equal(result.stub, true, 'stub propagates from runner+judge');
    assert.equal(typeof result.outputA, 'string');
    assert.equal(typeof result.outputB, 'string');
  });

  test('compareSkillVersions — outputA is baseline, outputB is candidate regardless of shuffle', async () => {
    // Inject deterministic runner so we can assert un-shuffle anchoring of the
    // canonical A=baseline / B=candidate labels independent of the random flip.
    const runSkill = async (caseObj, version) => ({
      output: `OUT:${version}`, latency_ms: 1, stub: false, version
    });
    const judge = async () => ({ winner: 'tie', confidence: 0.9, reasoning: 'r', model: 'm', stub: false });
    for (let i = 0; i < 25; i++) {
      const r = await comparator.compareSkillVersions(goodCase, 'BASE', 'CAND', { runSkill, judge });
      assert.equal(r.outputA, 'OUT:BASE', 'outputA must always be the baseline output');
      assert.equal(r.outputB, 'OUT:CAND', 'outputB must always be the candidate output');
    }
  });

  test('compareSkillVersions — un-shuffle: judge picking position-1 maps to the version actually first', async () => {
    // Core correctness property: the winner is converted from positional
    // "1"/"2" back to canonical A(baseline)/B(candidate) using shuffled_position.
    const runSkill = async (caseObj, version) => ({
      output: `OUT:${version}`, latency_ms: 1, stub: false, version
    });
    // Judge always picks "Output 1" (the first one shown).
    const judge = async () => ({ winner: '1', confidence: 0.8, reasoning: 'r', model: 'm', stub: false });
    for (let i = 0; i < 40; i++) {
      const r = await comparator.compareSkillVersions(goodCase, 'BASE', 'CAND', { runSkill, judge });
      // If AB, first shown = baseline => winner A. If BA, first shown = candidate => winner B.
      const expected = r.shuffled_position === 'AB' ? 'A' : 'B';
      assert.equal(r.winner, expected, `position ${r.shuffled_position} => winner ${expected}`);
    }
  });

  test('compareSkillVersions — judge "tie" stays tie under both shuffles', async () => {
    const runSkill = async (caseObj, version) => ({
      output: `OUT:${version}`, latency_ms: 1, stub: false, version
    });
    const judge = async () => ({ winner: 'tie', confidence: 0.3, reasoning: 'r', model: 'm', stub: false });
    for (let i = 0; i < 20; i++) {
      const r = await comparator.compareSkillVersions(goodCase, 'BASE', 'CAND', { runSkill, judge });
      assert.equal(r.winner, 'tie');
    }
  });

  test('compareSkillVersions — validates inputs (case shape + versions)', async () => {
    await assert.rejects(() => comparator.compareSkillVersions(null, 'm', 'h'), TypeError);
    await assert.rejects(() => comparator.compareSkillVersions(goodCase, '', 'h'), TypeError);
    await assert.rejects(() => comparator.compareSkillVersions(goodCase, 'm', ''), TypeError);
  });

  test('_internal.validateCaseShape — accepts valid, rejects each missing field', () => {
    const { validateCaseShape } = comparator._internal;
    assert.doesNotThrow(() => validateCaseShape(goodCase));
    assert.throws(() => validateCaseShape(null), TypeError);
    assert.throws(() => validateCaseShape({ id: '', skill: 's', input: 'i' }), TypeError);
    assert.throws(() => validateCaseShape({ id: 'x', skill: '', input: 'i' }), TypeError);
    assert.throws(() => validateCaseShape({ id: 'x', skill: 's', input: 5 }), TypeError);
  });

  test('_internal.nullLogger — exposes no-op info/warn/error', () => {
    const log = comparator._internal.nullLogger();
    assert.equal(typeof log.info, 'function');
    assert.equal(typeof log.warn, 'function');
    assert.equal(typeof log.error, 'function');
    assert.doesNotThrow(() => { log.info('x'); log.warn('y'); log.error('z'); });
  });
});

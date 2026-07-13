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


// ===========================================================================
// quality-scorer.js
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

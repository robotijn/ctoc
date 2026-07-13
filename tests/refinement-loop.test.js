/**
 * Tests for the Refinement Loop orchestrator (v6.9.6)
 *
 * Coverage:
 *   - Fingerprinting determinism
 *   - Journal round-trip (write → read → content matches)
 *   - Loop-detection heuristics fire on synthetic round data
 *   - Critic panel selection picks correct dynamic critics per project type
 *   - Gating triggers on risk-surface globs and effort tier
 *   - Letter generation validates structure (no warn severity, etc.)
 *   - Renderer produces parseable Markdown
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function load() {
  const p = require.resolve('../src/lib/refinement-loop');
  delete require.cache[p];
  return require('../src/lib/refinement-loop');
}


let tmpDir;
let originalCwd;

function setupTempProject() {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-refloop-'));
  process.chdir(tmpDir);
  fs.mkdirSync('.ctoc/config', { recursive: true });
  fs.mkdirSync('.claude-plugin', { recursive: true });
  // Copy the real triggers file so globMatch tests can exercise it
  fs.copyFileSync(
    path.join(originalCwd, '.ctoc/config/refinement-triggers.yaml'),
    path.join(tmpDir, '.ctoc/config/refinement-triggers.yaml')
  );
}
function teardownTempProject() {
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore: best-effort, non-fatal */ }
}

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — fingerprinting', () => {
  it('produces deterministic 12-char fingerprints', () => {
    setupTempProject();
    const { computeFingerprint } = load();
    const fp1 = computeFingerprint('quality/code-reviewer', 'src/auth.py', [67, 132], 'long-function');
    const fp2 = computeFingerprint('quality/code-reviewer', 'src/auth.py', [67, 132], 'long-function');
    assert.equal(fp1, fp2);
    assert.equal(fp1.length, 12);
    assert.match(fp1, /^[a-f0-9]{12}$/);
    teardownTempProject();
  });

  it('different inputs → different fingerprints', () => {
    setupTempProject();
    const { computeFingerprint } = load();
    const fp1 = computeFingerprint('quality/code-reviewer', 'src/a.py', [10], 'x');
    const fp2 = computeFingerprint('quality/code-reviewer', 'src/b.py', [10], 'x');
    assert.notEqual(fp1, fp2);
    teardownTempProject();
  });

  it('fuzzy-match catches line shift within ±5', () => {
    setupTempProject();
    const { fingerprintsMatchFuzzy } = load();
    const a = { critic_id: 'q/cr', file: 'a.py', finding_type: 'long-fn', line_range: [67] };
    const b = { critic_id: 'q/cr', file: 'a.py', finding_type: 'long-fn', line_range: [70] }; // shifted +3
    assert.equal(fingerprintsMatchFuzzy(a, b), true);
    const c = { critic_id: 'q/cr', file: 'a.py', finding_type: 'long-fn', line_range: [80] }; // shifted +13
    assert.equal(fingerprintsMatchFuzzy(a, c), false);
    teardownTempProject();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — loop-detection heuristics', () => {
  it('detects persistent issue (same fingerprint 3+ consecutive rounds)', () => {
    setupTempProject();
    const { appendRound, detectPersistentIssues } = load();
    appendRound('p', { round: 1, phase: 'critical', fingerprints: ['stubborn', 'other1'] });
    appendRound('p', { round: 2, phase: 'critical', fingerprints: ['stubborn', 'other2'] });
    appendRound('p', { round: 3, phase: 'critical', fingerprints: ['stubborn'] });
    const { loadJournal } = load();
    const stuck = detectPersistentIssues(loadJournal('p'), 3);
    assert.equal(stuck.length, 1);
    assert.equal(stuck[0].fingerprint, 'stubborn');
    assert.equal(stuck[0].consecutive_rounds, 3);
    teardownTempProject();
  });

  it('does NOT flag persistent issue at threshold=3 when only 2 consecutive', () => {
    setupTempProject();
    const { appendRound, detectPersistentIssues, loadJournal } = load();
    appendRound('p', { round: 1, phase: 'critical', fingerprints: ['x'] });
    appendRound('p', { round: 2, phase: 'critical', fingerprints: ['x'] });
    const stuck = detectPersistentIssues(loadJournal('p'), 3);
    assert.equal(stuck.length, 0);
    teardownTempProject();
  });

  it('detects oscillation (fingerprint appears, disappears, reappears)', () => {
    setupTempProject();
    const { appendRound, detectOscillation, loadJournal } = load();
    appendRound('p', { round: 1, phase: 'critical', fingerprints: ['flipper'] });
    appendRound('p', { round: 2, phase: 'critical', fingerprints: ['other'] }); // flipper absent
    appendRound('p', { round: 3, phase: 'critical', fingerprints: ['flipper'] }); // back!
    const osc = detectOscillation(loadJournal('p'));
    assert.equal(osc.length, 1);
    assert.equal(osc[0].fingerprint, 'flipper');
    assert.deepEqual(osc[0].gap_rounds, [1, 3]);
    teardownTempProject();
  });

  it('detects implementer wall (≥ N distinct fix attempts on same fingerprint)', () => {
    setupTempProject();
    const { appendRound, detectImplementerWall, loadJournal } = load();
    for (let i = 1; i <= 4; i++) {
      appendRound('p', {
        round: i,
        phase: 'critical',
        fingerprints: ['stubborn'],
        fixes_applied: [{ file: `src/file${i}.py`, fixed_findings: ['x'], lines_changed: 10 }],
      });
    }
    const walls = detectImplementerWall(loadJournal('p'), 3);
    assert.ok(walls.length >= 1);
    teardownTempProject();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — critic panel selection', () => {
  it('includes the 3 core critics in every panel', () => {
    setupTempProject();
    const { selectPanel, CORE_CRITICS } = load();
    const panel = selectPanel(['src/utils/foo.js']);
    for (const c of CORE_CRITICS) {
      assert.ok(panel.includes(c), `panel missing core critic: ${c}`);
    }
    teardownTempProject();
  });

  it('adds frontend critics when files match frontend pattern', () => {
    setupTempProject();
    const { selectPanel } = load();
    const panel = selectPanel(['src/app/page.tsx', 'src/components/Button.tsx']);
    assert.ok(panel.includes('specialized/accessibility-checker'));
    assert.ok(panel.includes('frontend/visual-regression-checker'));
    teardownTempProject();
  });

  it('adds HIPAA critics when files match health pattern', () => {
    setupTempProject();
    const { selectPanel } = load();
    const panel = selectPanel(['src/health/patient.ts', 'src/phi/handlers.ts']);
    assert.ok(panel.includes('compliance/audit-log-checker'));
    assert.ok(panel.includes('compliance/gdpr-compliance-checker'));
    teardownTempProject();
  });

  it('adds DB-migration critics for migration paths', () => {
    setupTempProject();
    const { selectPanel } = load();
    const panel = selectPanel(['drizzle/migrations/0001_init.sql']);
    assert.ok(panel.includes('specialized/database-reviewer'));
    assert.ok(panel.includes('saas/multi-tenancy-row-level'));
    teardownTempProject();
  });

  it('does NOT add dynamic critics for unrelated files', () => {
    setupTempProject();
    const { selectPanel } = load();
    const panel = selectPanel(['docs/README.md']);
    assert.equal(panel.length, 3); // only core critics
    teardownTempProject();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — gating', () => {
  it('runs for effort-tier=high', () => {
    setupTempProject();
    const { shouldRunLoop } = load();
    const r = shouldRunLoop({ effortLevel: 'high', files: ['src/utils/foo.js'] });
    assert.equal(r.run, true);
    assert.equal(r.reason, 'effort-tier');
    teardownTempProject();
  });

  it('runs for risk-surface glob match', () => {
    setupTempProject();
    const { shouldRunLoop } = load();
    const r = shouldRunLoop({ effortLevel: 'low', files: ['src/auth/middleware.ts'] });
    assert.equal(r.run, true);
    assert.equal(r.reason, 'risk-surface');
    teardownTempProject();
  });

  it('runs for HIPAA path (user-required)', () => {
    setupTempProject();
    const { shouldRunLoop } = load();
    const r = shouldRunLoop({ effortLevel: 'low', files: ['src/health/patient.ts'] });
    assert.equal(r.run, true);
    teardownTempProject();
  });

  it('runs for PII export path (user-required)', () => {
    setupTempProject();
    const { shouldRunLoop } = load();
    const r = shouldRunLoop({ effortLevel: 'low', files: ['app/export/user-data.ts'] });
    assert.equal(r.run, true);
    teardownTempProject();
  });

  it('does NOT run for low-effort + non-risk-surface', () => {
    setupTempProject();
    const { shouldRunLoop } = load();
    const r = shouldRunLoop({ effortLevel: 'low', files: ['src/utils/string-format.ts'] });
    assert.equal(r.run, false);
    teardownTempProject();
  });

  it('bypasses on escape phrase', () => {
    setupTempProject();
    const { shouldRunLoop } = load();
    const r = shouldRunLoop({ effortLevel: 'high', files: ['src/auth/foo.ts'], recentMessages: ['this is a hotfix'] });
    assert.equal(r.run, false);
    assert.equal(r.reason, 'escape-phrase');
    teardownTempProject();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — phase logic', () => {
  it('shouldEscalate fires when phase rounds exceed default cap', () => {
    setupTempProject();
    const { appendRound, shouldEscalate, loadJournal } = load();
    for (let i = 1; i <= 9; i++) {
      appendRound('p', { round: i, phase: 'critical' });
    }
    assert.equal(shouldEscalate(loadJournal('p'), 'critical'), true);
    teardownTempProject();
  });

  it('shouldEscalate does NOT fire under cap', () => {
    setupTempProject();
    const { appendRound, shouldEscalate, loadJournal } = load();
    for (let i = 1; i <= 3; i++) {
      appendRound('p', { round: i, phase: 'critical' });
    }
    assert.equal(shouldEscalate(loadJournal('p'), 'critical'), false);
    teardownTempProject();
  });

  it('phaseConverged returns true when no findings match phase', () => {
    setupTempProject();
    const { phaseConverged } = load();
    const empty = phaseConverged({}, 'critical');
    assert.equal(empty, true);
    teardownTempProject();
  });
});

// ─────────────────────────────────────────────────────────────────────

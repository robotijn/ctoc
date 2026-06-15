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

function loadRenderer() {
  const p = require.resolve('../src/lib/letter-renderer');
  delete require.cache[p];
  return require('../src/lib/letter-renderer');
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
describe('refinement-loop — journal I/O', () => {
  it('returns fresh journal when none exists', () => {
    setupTempProject();
    const { loadJournal } = load();
    const j = loadJournal('test-plan');
    assert.equal(j.plan, 'test-plan');
    assert.deepEqual(j.rounds, []);
    teardownTempProject();
  });

  it('round-trips a round entry', () => {
    setupTempProject();
    const { appendRound, loadJournal } = load();
    appendRound('test-plan', {
      round: 1,
      phase: 'critical',
      letter_id: '01J9X8Y2KZQ3M5N7P9R2T4V6W8',
      critics_dispatched: ['quality/code-reviewer', 'security/sast-scanner'],
      fingerprints: ['abc123def456', 'fed654cba321'],
      fixes_applied: [{ file: 'src/auth.py', fixed_findings: ['cr-001'], lines_changed: 87 }],
      tests_added: ['tests/test_auth.py'],
      tests_result: { added: 1, passed: 1, failed: 0, total: 47, regressions: 0, warnings: 0 },
      convergence_delta: { phase_open_before: 8, phase_open_after: 5 },
    });
    const j = loadJournal('test-plan');
    assert.equal(j.rounds.length, 1);
    assert.equal(j.rounds[0].round, 1);
    assert.equal(j.rounds[0].phase, 'critical');
    assert.deepEqual(j.rounds[0].fingerprints, ['abc123def456', 'fed654cba321']);
    teardownTempProject();
  });

  it('multiple appends preserve all rounds', () => {
    setupTempProject();
    const { appendRound, loadJournal } = load();
    appendRound('test-plan', { round: 1, phase: 'critical', fingerprints: ['aaa'] });
    appendRound('test-plan', { round: 2, phase: 'critical', fingerprints: ['bbb'] });
    appendRound('test-plan', { round: 3, phase: 'medium', fingerprints: ['ccc'] });
    const j = loadJournal('test-plan');
    assert.equal(j.rounds.length, 3);
    assert.equal(j.rounds[2].phase, 'medium');
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
describe('refinement-loop — letter generation', () => {
  it('builds a valid letter with required fields', () => {
    setupTempProject();
    const { buildLetter } = load();
    const letter = buildLetter({
      planSlug: 'test-plan',
      round: 1,
      phase: 'critical',
      summary: 'Round 1: 3 critical issues',
      issues: [{
        id: 'cr-001',
        fingerprint: 'abc123def456',
        severity: 'critical',
        file: 'src/auth.py',
        line_range: [67, 132],
        current_behaviour: 'broken',
        expected_behaviour: 'fixed',
        observable_test_conditions: ['Given x, when y, then z'],
        raised_by: ['quality/code-reviewer'],
      }],
    });
    assert.match(letter.letter_id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(letter.phase, 'critical');
    assert.equal(letter.issues.length, 1);
    teardownTempProject();
  });

  it('rejects severity=warn (warnings-as-bugs principle)', () => {
    setupTempProject();
    const { buildLetter } = load();
    assert.throws(() => buildLetter({
      planSlug: 'p',
      round: 1,
      phase: 'critical',
      summary: 's',
      issues: [{
        id: 'x', fingerprint: 'abc123', severity: 'warn', file: 'a',
        current_behaviour: 'c', expected_behaviour: 'e',
        observable_test_conditions: ['t'], raised_by: ['q/cr'],
      }],
    }), /must be critical\/medium\/low/);
    teardownTempProject();
  });

  it('rejects issue missing observable_test_conditions', () => {
    setupTempProject();
    const { buildLetter } = load();
    assert.throws(() => buildLetter({
      planSlug: 'p',
      round: 1,
      phase: 'critical',
      summary: 's',
      issues: [{
        id: 'x', fingerprint: 'abc123', severity: 'critical', file: 'a',
        current_behaviour: 'c', expected_behaviour: 'e',
        observable_test_conditions: [],
        raised_by: ['q/cr'],
      }],
    }), /missing observable_test_conditions/);
    teardownTempProject();
  });

  it('rejects unknown phase', () => {
    setupTempProject();
    const { buildLetter } = load();
    assert.throws(() => buildLetter({
      planSlug: 'p', round: 1, phase: 'wat', summary: 's', issues: [],
    }), /phase must be one of/);
    teardownTempProject();
  });

  it('writes letter to disk in JSON format', () => {
    setupTempProject();
    const { buildLetter, writeLetter } = load();
    const letter = buildLetter({
      planSlug: 'test-plan',
      round: 1,
      phase: 'critical',
      summary: 's',
      issues: [{
        id: 'x', fingerprint: 'abc123', severity: 'critical', file: 'a.py',
        current_behaviour: 'c', expected_behaviour: 'e',
        observable_test_conditions: ['t'], raised_by: ['q/cr'],
      }],
    });
    const p = writeLetter('test-plan', letter);
    assert.ok(fs.existsSync(p));
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(parsed.letter_id, letter.letter_id);
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
describe('letter-renderer — JSON → Markdown', () => {
  it('renders a letter with issues as Markdown', () => {
    setupTempProject();
    const { renderLetterAsMarkdown } = loadRenderer();
    const md = renderLetterAsMarkdown({
      letter_id: '01ABCDEFGHJKMNPQRSTVWXYZ12',
      round: 1,
      phase: 'critical',
      plan: 'test-plan',
      summary: 'Round 1 summary',
      issues: [{
        id: 'cr-001',
        fingerprint: 'abc123',
        severity: 'critical',
        file: 'src/auth.py',
        line_range: [67, 132],
        current_behaviour: 'broken',
        expected_behaviour: 'fixed',
        observable_test_conditions: ['Given X', 'When Y', 'Then Z'],
        raised_by: ['quality/code-reviewer'],
      }],
    });
    assert.match(md, /# Letter — round 1, phase: critical/);
    assert.match(md, /## Summary/);
    assert.match(md, /### cr-001 — CRITICAL/);
    assert.match(md, /Given X/);
    assert.match(md, /quality\/code-reviewer/);
    teardownTempProject();
  });

  it('renders escalation report with helpful guidance', () => {
    setupTempProject();
    const { renderEscalationReport } = loadRenderer();
    const md = renderEscalationReport({
      planSlug: 'test-plan',
      phase: 'critical',
      reason: 'persistent',
      stuckIssues: [{ fingerprint: 'stubborn', consecutive_rounds: 4, rounds_seen: [1, 2, 3, 4] }],
    });
    assert.match(md, /ESCALATION/);
    assert.match(md, /stubborn/);
    assert.match(md, /resisted/);
    teardownTempProject();
  });
});

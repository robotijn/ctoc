/**
 * Hard, edge-case + failure-first coverage tests for the Refinement Loop
 * orchestrator (src/lib/refinement-loop.js).
 *
 * These complement tests/refinement-loop.test.js and refinement-loop-spec.test.js
 * by driving the branches those leave dark:
 *   - findProjectRoot upward walk to the filesystem root (no markers found)
 *   - full journal serialization (critics_dispatched, tests_added, tests_result,
 *     convergence_delta) and the inline-object parse path on read-back
 *   - detectPersistentIssues consecutive-run RESET on a gap
 *   - shouldRunLoop escape-loop completion with a non-matching message
 *   - generateUlid shape + timestamp/randomness split
 *   - buildLetter — EVERY validation throw, plus a valid letter + the
 *     oversized-issues soft-check branch
 *   - writeLetter round-trip (also exercises the un-exported letterDir)
 *   - phaseConverged / effectivePhaseSeverity across named-phase + final-sweep
 *
 * Style mirrors refinement-loop.test.js: fresh module load, a temp project
 * with .ctoc + .claude-plugin markers so findProjectRoot resolves, teardown
 * in finally.
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-refloop-cov-'));
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.ctoc', 'config'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude-plugin'), { recursive: true });
  // A real CTOC project root (see plan 00178): the shared resolver requires
  // `.ctoc/settings.yaml` (or a `plans/` sibling), so a bare `.ctoc` — the shape
  // of the crypto home `~/.ctoc` — no longer resolves as a project and the
  // default-root write paths would otherwise refuse to write.
  fs.writeFileSync(path.join(tmpDir, '.ctoc', 'settings.yaml'), 'general: {}\n');
}

function teardownTempProject() {
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

// A valid issue skeleton the buildLetter validator accepts.
function validIssue(overrides = {}) {
  return {
    id: 'issue-1',
    fingerprint: 'abc123def456',
    severity: 'critical',
    file: 'src/auth.js',
    observable_test_conditions: ['returns 401 on bad token'],
    raised_by: ['security/sast-scanner'],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — findProjectRoot delegates to the shared resolver', () => {
  it('does NOT over-root: a marker-free start yields a string root, never the bare start dir', () => {
    setupTempProject();
    try {
      const { findProjectRoot } = load();
      // A deep, marker-free directory. The private walk used to `return start`
      // here; findProjectRoot now delegates to describeProjectRoot, whose
      // documented fallback is the working directory (a STRING), not the
      // marker-less start. The contract callers depend on is "always a string".
      const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-noroot-'));
      const deep = path.join(bare, 'a', 'b', 'c');
      fs.mkdirSync(deep, { recursive: true });
      try {
        const resolved = findProjectRoot(deep);
        assert.equal(typeof resolved, 'string', 'findProjectRoot always returns a string');
        assert.notEqual(fs.realpathSync(resolved), fs.realpathSync(deep),
          'a marker-less start is not adopted as the root');
      } finally {
        fs.rmSync(bare, { recursive: true, force: true });
      }
    } finally {
      teardownTempProject();
    }
  });

  it('a BARE .ctoc (crypto-home shape) does NOT capture the root — plan 00178 fix', () => {
    setupTempProject();
    try {
      const { findProjectRoot } = load();
      // A directory with ONLY a bare `.ctoc` (no settings.yaml, no plans/) is the
      // shape of the global crypto home `~/.ctoc`. The old private resolver
      // accepted it and over-rooted; the shared resolver must NOT. Resolution
      // falls through to the working directory, so the bare-.ctoc dir is not
      // adopted as the project root.
      const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-only-'));
      fs.mkdirSync(path.join(bare, '.ctoc'), { recursive: true });
      try {
        const resolved = findProjectRoot(bare);
        assert.notEqual(fs.realpathSync(resolved), fs.realpathSync(bare),
          'a bare .ctoc must not be treated as a project root');
      } finally {
        fs.rmSync(bare, { recursive: true, force: true });
      }
    } finally {
      teardownTempProject();
    }
  });

  it('finds the nearest ancestor that holds a .ctoc marker', () => {
    setupTempProject();
    try {
      const { findProjectRoot } = load();
      // tmpDir has .ctoc; start two levels below it.
      const nested = path.join(tmpDir, 'x', 'y');
      fs.mkdirSync(nested, { recursive: true });
      const resolved = findProjectRoot(nested);
      // fs.realpath collapses the macOS /private symlink; compare canonical.
      assert.equal(fs.realpathSync(resolved), fs.realpathSync(tmpDir));
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — journal serialization round-trip', () => {
  it('serializes ALL optional round fields and parses them back', () => {
    setupTempProject();
    try {
      const { appendRound, loadJournal } = load();
      appendRound('rich', {
        round: 1,
        phase: 'critical',
        letter_id: 'LID1',
        critics_dispatched: ['quality/code-reviewer', 'security/sast-scanner'],
        fingerprints: ['fp-a', 'fp-b'],
        fixes_applied: [{ file: 'src/a.js', fixed_findings: ['x', 'y'], lines_changed: 12 }],
        tests_added: ['tests/a.test.js', 'tests/b.test.js'],
        tests_result: { added: 2, passed: 40, failed: 0, total: 42, regressions: 0, warnings: 1 },
        convergence_delta: { phase_open_before: 5, phase_open_after: 2 },
      });

      const journal = loadJournal('rich');
      const r = journal.rounds[0];

      assert.equal(r.round, 1);
      assert.equal(r.phase, 'critical');
      assert.equal(r.letter_id, 'LID1');
      assert.deepEqual(r.critics_dispatched, ['quality/code-reviewer', 'security/sast-scanner']);
      assert.deepEqual(r.fingerprints, ['fp-a', 'fp-b']);
      assert.deepEqual(r.tests_added, ['tests/a.test.js', 'tests/b.test.js']);
      // inline-object fields parse into numbers
      assert.equal(r.tests_result.total, 42);
      assert.equal(r.tests_result.warnings, 1);
      assert.equal(r.convergence_delta.phase_open_before, 5);
      assert.equal(r.convergence_delta.phase_open_after, 2);
    } finally {
      teardownTempProject();
    }
  });

  it('defaults missing tests_result / convergence_delta numeric fields to 0 on serialize', () => {
    setupTempProject();
    try {
      const { appendRound, loadJournal } = load();
      // Provide the objects but with NO numeric members — serializer must
      // emit 0 for each (exercises the `|| 0` fallbacks).
      appendRound('sparse', {
        round: 1,
        phase: 'medium',
        tests_result: {},
        convergence_delta: {},
      });
      const journal = loadJournal('sparse');
      const r = journal.rounds[0];
      assert.equal(r.tests_result.added, 0);
      assert.equal(r.tests_result.regressions, 0);
      assert.equal(r.convergence_delta.phase_open_before, 0);
      assert.equal(r.convergence_delta.phase_open_after, 0);
    } finally {
      teardownTempProject();
    }
  });

  it('loadJournal returns an empty scaffold when the journal file is absent', () => {
    setupTempProject();
    try {
      const { loadJournal } = load();
      const journal = loadJournal('never-written');
      assert.equal(journal.plan, 'never-written');
      assert.equal(journal.started_at, null);
      assert.equal(journal.phase, null);
      assert.deepEqual(journal.rounds, []);
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — detectPersistentIssues consecutive-run reset', () => {
  it('does NOT count a fingerprint whose appearances have a gap', () => {
    setupTempProject();
    try {
      const { appendRound, detectPersistentIssues, loadJournal } = load();
      // 'gappy' appears in rounds 1 and 3 (missing round 2) → the consecutive
      // run resets at the gap, so max run is 1, never reaching threshold 2.
      appendRound('g', { round: 1, phase: 'critical', fingerprints: ['gappy'] });
      appendRound('g', { round: 2, phase: 'critical', fingerprints: ['other'] });
      appendRound('g', { round: 3, phase: 'critical', fingerprints: ['gappy'] });
      const stuck = detectPersistentIssues(loadJournal('g'), 2);
      assert.equal(stuck.length, 0, 'gapped fingerprint is not persistent');
    } finally {
      teardownTempProject();
    }
  });

  it('counts a fingerprint that resumes a consecutive run AFTER a gap', () => {
    setupTempProject();
    try {
      const { appendRound, detectPersistentIssues, loadJournal } = load();
      // rounds 1, then gap, then 3-4-5 consecutive → run resets to 1 at the
      // gap and climbs back to 3. Exercises both the reset (else) and the
      // subsequent increment (if) branches in the same fingerprint.
      appendRound('r', { round: 1, phase: 'critical', fingerprints: ['revive'] });
      appendRound('r', { round: 2, phase: 'critical', fingerprints: ['noise'] });
      appendRound('r', { round: 3, phase: 'critical', fingerprints: ['revive'] });
      appendRound('r', { round: 4, phase: 'critical', fingerprints: ['revive'] });
      appendRound('r', { round: 5, phase: 'critical', fingerprints: ['revive'] });
      const stuck = detectPersistentIssues(loadJournal('r'), 3);
      assert.equal(stuck.length, 1);
      assert.equal(stuck[0].fingerprint, 'revive');
      assert.equal(stuck[0].consecutive_rounds, 3);
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — shouldRunLoop escape-loop completion', () => {
  it('iterates recentMessages fully when NONE match an escape phrase', () => {
    setupTempProject();
    try {
      const { shouldRunLoop } = load();
      // A message that matches no escape phrase forces the inner+outer loops
      // to run to completion (line after the escape-phrase for-loops).
      const r = shouldRunLoop({
        effortLevel: 'low',
        files: ['src/utils/plain.ts'],
        recentMessages: ['please refine this properly, no shortcuts'],
      });
      assert.equal(r.run, false);
      assert.equal(r.reason, 'no-trigger');
    } finally {
      teardownTempProject();
    }
  });

  it('a substring that is not word-bounded does NOT trigger the escape bypass', () => {
    setupTempProject();
    try {
      const { shouldRunLoop } = load();
      // 'urgently' contains 'urgent' but the \b anchors require a word boundary,
      // so this must NOT be treated as an escape phrase.
      const r = shouldRunLoop({
        effortLevel: 'high',
        files: ['src/x.ts'],
        recentMessages: ['handle this urgently but carefully'],
      });
      assert.equal(r.run, true);
      assert.equal(r.reason, 'effort-tier');
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — generateUlid', () => {
  it('produces a 26-char Crockford Base32 identifier', () => {
    setupTempProject();
    try {
      const { generateUlid } = load();
      const ulid = generateUlid();
      assert.equal(ulid.length, 26);
      assert.match(ulid, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
    } finally {
      teardownTempProject();
    }
  });

  it('same timestamp → identical 10-char prefix, different random suffix', () => {
    setupTempProject();
    try {
      const { generateUlid } = load();
      const fixedNow = 1700000000000;
      const a = generateUlid(fixedNow);
      const b = generateUlid(fixedNow);
      assert.equal(a.slice(0, 10), b.slice(0, 10), 'timestamp prefix is deterministic');
      assert.notEqual(a, b, 'random suffix makes full ULIDs collision-resistant');
    } finally {
      teardownTempProject();
    }
  });

  it('later timestamp sorts lexicographically after an earlier one', () => {
    setupTempProject();
    try {
      const { generateUlid } = load();
      const earlier = generateUlid(1000).slice(0, 10);
      const later = generateUlid(2000).slice(0, 10);
      assert.ok(later > earlier, 'ULID timestamp prefix is monotonic/lexicographic');
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — buildLetter validation (failure paths first)', () => {
  it('throws on an unknown phase', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      assert.throws(
        () => buildLetter({ planSlug: 'p', round: 1, phase: 'bogus', summary: 's', issues: [] }),
        /phase must be one of/,
      );
    } finally {
      teardownTempProject();
    }
  });

  it('throws on an empty summary', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      assert.throws(
        () => buildLetter({ planSlug: 'p', round: 1, phase: 'critical', summary: '', issues: [] }),
        /summary is required/,
      );
    } finally {
      teardownTempProject();
    }
  });

  it('throws when issues is not an array', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      assert.throws(
        () => buildLetter({ planSlug: 'p', round: 1, phase: 'critical', summary: 's', issues: 'nope' }),
        /issues must be an array/,
      );
    } finally {
      teardownTempProject();
    }
  });

  it('throws when an issue is missing a required field (file)', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      const issue = validIssue();
      delete issue.file;
      assert.throws(
        () => buildLetter({ planSlug: 'p', round: 1, phase: 'critical', summary: 's', issues: [issue] }),
        /issue missing required fields/,
      );
    } finally {
      teardownTempProject();
    }
  });

  it('throws on an invalid severity (warn is not a wire tier)', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      const issue = validIssue({ severity: 'warn' });
      assert.throws(
        () => buildLetter({ planSlug: 'p', round: 1, phase: 'critical', summary: 's', issues: [issue] }),
        /invalid severity/,
      );
    } finally {
      teardownTempProject();
    }
  });

  it('throws when observable_test_conditions is empty', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      const issue = validIssue({ observable_test_conditions: [] });
      assert.throws(
        () => buildLetter({ planSlug: 'p', round: 1, phase: 'critical', summary: 's', issues: [issue] }),
        /missing observable_test_conditions/,
      );
    } finally {
      teardownTempProject();
    }
  });

  it('throws when raised_by is missing', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      const issue = validIssue();
      delete issue.raised_by;
      assert.throws(
        () => buildLetter({ planSlug: 'p', round: 1, phase: 'critical', summary: 's', issues: [issue] }),
        /missing raised_by/,
      );
    } finally {
      teardownTempProject();
    }
  });

  it('builds a well-formed letter for a valid single-issue input', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      const issue = validIssue();
      const letter = buildLetter({ planSlug: 'plan-x', round: 3, phase: 'medium', summary: 'ok', issues: [issue] });
      assert.equal(letter.round, 3);
      assert.equal(letter.phase, 'medium');
      assert.equal(letter.plan, 'plan-x');
      assert.equal(letter.summary, 'ok');
      assert.equal(letter.letter_id.length, 26);
      assert.equal(letter.convergence_status.phase_issues_before, 1);
      assert.equal(letter.convergence_status.phase_issues_after, 0);
      assert.equal(letter.convergence_status.total_issues_remaining, 1);
      assert.deepEqual(letter.issues, [issue]);
    } finally {
      teardownTempProject();
    }
  });

  it('accepts an oversized issue set (soft-check branch does not throw)', () => {
    setupTempProject();
    try {
      const { buildLetter, K_PER_PHASE, CORE_CRITICS } = load();
      // critical: K=3, core critics=3 → soft cap is 3*3*2 = 18; go past it.
      const threshold = K_PER_PHASE.critical * CORE_CRITICS.length * 2;
      const many = [];
      for (let i = 0; i < threshold + 1; i++) {
        many.push(validIssue({ id: `issue-${i}`, fingerprint: `fp-${i}` }));
      }
      const letter = buildLetter({ planSlug: 'big', round: 1, phase: 'critical', summary: 's', issues: many });
      assert.equal(letter.issues.length, threshold + 1);
      assert.equal(letter.convergence_status.phase_issues_before, threshold + 1);
    } finally {
      teardownTempProject();
    }
  });

  it('does NOT apply the soft cap for final-sweep (K is Infinity)', () => {
    setupTempProject();
    try {
      const { buildLetter } = load();
      const many = [];
      for (let i = 0; i < 50; i++) many.push(validIssue({ id: `f-${i}`, fingerprint: `g-${i}` }));
      const letter = buildLetter({ planSlug: 'fs', round: 1, phase: 'final-sweep', summary: 's', issues: many });
      assert.equal(letter.phase, 'final-sweep');
      assert.equal(letter.issues.length, 50);
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — writeLetter', () => {
  it('writes the letter JSON to the letters dir and it parses back identically', () => {
    setupTempProject();
    try {
      const { buildLetter, writeLetter, loopDir } = load();
      const issue = validIssue();
      const letter = buildLetter({ planSlug: 'wl', round: 1, phase: 'critical', summary: 's', issues: [issue] });
      const written = writeLetter('wl', letter);

      assert.ok(fs.existsSync(written), 'letter file exists on disk');
      assert.equal(path.dirname(written), path.join(loopDir('wl'), 'letters'));
      assert.equal(path.basename(written), `${letter.letter_id}.json`);

      const parsed = JSON.parse(fs.readFileSync(written, 'utf8'));
      assert.equal(parsed.letter_id, letter.letter_id);
      assert.equal(parsed.plan, 'wl');
      assert.equal(parsed.issues.length, 1);
    } finally {
      teardownTempProject();
    }
  });

  it('creates the letters directory on first write (ensureDir path)', () => {
    setupTempProject();
    try {
      const { buildLetter, writeLetter, loopDir } = load();
      const lettersDir = path.join(loopDir('fresh'), 'letters');
      assert.equal(fs.existsSync(lettersDir), false, 'no letters dir before writing');
      const letter = buildLetter({ planSlug: 'fresh', round: 1, phase: 'low', summary: 's', issues: [validIssue()] });
      writeLetter('fresh', letter);
      assert.equal(fs.existsSync(lettersDir), true, 'letters dir created by writeLetter');
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — phaseConverged / effectivePhaseSeverity', () => {
  it('returns false when a named phase has a matching-severity finding', () => {
    setupTempProject();
    try {
      const { phaseConverged } = load();
      const findings = { 'quality/code-reviewer': [{ severity: 'critical' }] };
      assert.equal(phaseConverged(findings, 'critical'), false);
    } finally {
      teardownTempProject();
    }
  });

  it('returns true when the only findings do NOT match the named phase severity', () => {
    setupTempProject();
    try {
      const { phaseConverged } = load();
      // phase=critical filters to critical-severity findings; a 'low' finding
      // is filtered out, so the phase is considered converged.
      const findings = { 'quality/code-reviewer': [{ severity: 'low' }] };
      assert.equal(phaseConverged(findings, 'critical'), true);
    } finally {
      teardownTempProject();
    }
  });

  it('final-sweep counts findings of ANY severity → not converged', () => {
    setupTempProject();
    try {
      const { phaseConverged } = load();
      const findings = { 'security/sast-scanner': [{ severity: 'low' }] };
      assert.equal(phaseConverged(findings, 'final-sweep'), false);
    } finally {
      teardownTempProject();
    }
  });

  it('final-sweep with an empty critic bucket is converged', () => {
    setupTempProject();
    try {
      const { phaseConverged } = load();
      const findings = { 'security/sast-scanner': [] };
      assert.equal(phaseConverged(findings, 'final-sweep'), true);
    } finally {
      teardownTempProject();
    }
  });

  it('a critic key whose value is undefined is treated as no findings', () => {
    setupTempProject();
    try {
      const { phaseConverged } = load();
      // exercises the `(roundFindings[critic] || [])` fallback
      const findings = { 'quality/code-reviewer': undefined };
      assert.equal(phaseConverged(findings, 'critical'), true);
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — optional-field branches', () => {
  it('serializes a fixes_applied entry that omits fixed_findings and lines_changed', () => {
    setupTempProject();
    try {
      const { appendRound, loadJournal } = load();
      // A minimal fix entry — just a file, no fixed_findings, no lines_changed.
      // Exercises the false side of both `if (f.fixed_findings)` and
      // `if (typeof f.lines_changed === 'number')`.
      appendRound('minfix', {
        round: 1,
        phase: 'critical',
        fixes_applied: [{ file: 'src/only.js' }],
      });
      const journal = loadJournal('minfix');
      assert.equal(journal.rounds[0].fixes_applied[0].file, 'src/only.js');
      assert.equal(journal.rounds[0].fixes_applied[0].fixed_findings, undefined);
      assert.equal(journal.rounds[0].fixes_applied[0].lines_changed, undefined);
    } finally {
      teardownTempProject();
    }
  });

  it('heuristics tolerate rounds that carry no fingerprints field', () => {
    setupTempProject();
    try {
      const { appendRound, detectPersistentIssues, detectOscillation, loadJournal } = load();
      // Rounds without a `fingerprints` field must fall back to [] and not
      // throw — no fingerprint can be persistent or oscillating.
      appendRound('nofp', { round: 1, phase: 'critical' });
      appendRound('nofp', { round: 2, phase: 'critical' });
      const journal = loadJournal('nofp');
      assert.deepEqual(detectPersistentIssues(journal, 2), []);
      assert.deepEqual(detectOscillation(journal), []);
    } finally {
      teardownTempProject();
    }
  });

  it('detectOscillation returns empty when a fingerprint is strictly consecutive', () => {
    setupTempProject();
    try {
      const { appendRound, detectOscillation, loadJournal } = load();
      // Consecutive appearances (no gap of >=2) → inner loop completes with
      // no break → nothing oscillating.
      appendRound('c', { round: 1, phase: 'critical', fingerprints: ['steady'] });
      appendRound('c', { round: 2, phase: 'critical', fingerprints: ['steady'] });
      assert.deepEqual(detectOscillation(loadJournal('c')), []);
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — shouldEscalate boundary', () => {
  it('returns false for a phase with no configured cap', () => {
    setupTempProject();
    try {
      const { shouldEscalate } = load();
      // 'nonexistent-phase' is not a key in PHASE_ROUND_CAPS_DEFAULT → cap
      // undefined → early false.
      const journal = { rounds: [{ phase: 'nonexistent-phase' }] };
      assert.equal(shouldEscalate(journal, 'nonexistent-phase'), false);
    } finally {
      teardownTempProject();
    }
  });

  it('fires exactly AT the cap boundary (>= not >)', () => {
    setupTempProject();
    try {
      const { shouldEscalate, PHASE_ROUND_CAPS_DEFAULT } = load();
      const cap = PHASE_ROUND_CAPS_DEFAULT.medium; // 5
      const rounds = [];
      for (let i = 0; i < cap; i++) rounds.push({ phase: 'medium' });
      assert.equal(shouldEscalate({ rounds }, 'medium'), true, 'escalates at exactly cap rounds');
    } finally {
      teardownTempProject();
    }
  });

  it('does NOT fire one round below the cap', () => {
    setupTempProject();
    try {
      const { shouldEscalate, PHASE_ROUND_CAPS_DEFAULT } = load();
      const cap = PHASE_ROUND_CAPS_DEFAULT.medium; // 5
      const rounds = [];
      for (let i = 0; i < cap - 1; i++) rounds.push({ phase: 'medium' });
      assert.equal(shouldEscalate({ rounds }, 'medium'), false);
    } finally {
      teardownTempProject();
    }
  });
});

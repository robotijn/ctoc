/**
 * The refinement loop writes its journals INTO the project it is refining —
 * or, when no project can be identified, it writes NOTHING. It must never
 * write to the operator's home directory (~/.ctoc, the crypto home).
 *
 * Regression coverage for plan 00178. Before this fix, refinement-loop.js
 * carried a PRIVATE project-root resolver that (a) accepted a BARE `.ctoc`
 * as a project marker — and the crypto home `~/.ctoc` holds exactly `.secret`
 * on any machine that has used CTOC's crypto path — and (b) climbed ten levels
 * then returned the working directory on fallback. Together these wrote a
 * project's journals to `~/.ctoc/loops/<plan>/`, invisible to the project and
 * colliding across projects that share a plan slug.
 *
 * The fix delegates to the shared resolver (`describeProjectRoot`) and REFUSES
 * to write when resolution falls back (no project identified).
 *
 * NO test touches the real home directory. Every home-directory scenario uses a
 * temp tree standing in for a home, reached either through `findProjectRoot`'s
 * `start` parameter or by `chdir` into a project beneath the stand-in home.
 * Cross-platform: path.join, os.tmpdir(), fs.rmSync teardown, realpath compare.
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

// A stand-in for the operator's home directory carrying the REAL crypto-home
// shape: a `.ctoc` holding exactly `.secret` (see src/lib/crypto.js:13-37).
function makeStandInHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-home-'));
  fs.mkdirSync(path.join(home, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(home, '.ctoc', '.secret'), 'x'.repeat(64), { mode: 0o600 });
  return home;
}

function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

const real = (p) => fs.realpathSync(p);

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — resolution never over-roots to the home directory', () => {
  it('1. a bare .ctoc above the project does not capture it (MUST be red pre-fix)', () => {
    const home = makeStandInHome();
    try {
      const project = path.join(home, 'proj');
      fs.mkdirSync(path.join(project, '.git'), { recursive: true });
      const { findProjectRoot } = load();
      const resolved = findProjectRoot(project);
      assert.equal(real(resolved), real(project), 'resolves to the PROJECT, not the stand-in home');
      assert.notEqual(real(resolved), real(home), 'must NOT resolve to the bare-.ctoc home');
    } finally {
      rm(home);
    }
  });

  it('11. the ten-level climb is gone: a marker-less deep dir writes nothing, not to home (MUST be red pre-fix)', () => {
    const home = makeStandInHome();
    const originalCwd = process.cwd();
    try {
      // Twelve levels deep, no marker on any level between here and home.
      let deep = home;
      for (const seg of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']) {
        deep = path.join(deep, seg);
      }
      fs.mkdirSync(deep, { recursive: true });
      process.chdir(deep);
      const { appendRound } = load();
      const result = appendRound('p11', { round: 1, phase: 'critical' });
      assert.equal(result.written, false, 'refuses to write from an unidentifiable location');
      assert.equal(fs.existsSync(path.join(deep, '.ctoc')), false, 'no journal written into the working directory');
      assert.equal(fs.existsSync(path.join(home, '.ctoc', 'loops')), false, 'no write reaches the stand-in home');
    } finally {
      process.chdir(originalCwd);
      rm(home);
    }
  });

  it('12. the export contract holds: findProjectRoot always returns a string', () => {
    const { findProjectRoot } = load();
    assert.equal(typeof findProjectRoot(os.tmpdir()), 'string');
    assert.equal(typeof findProjectRoot(undefined), 'string');
    // A non-string start must not throw and must still yield a string (fallback).
    assert.equal(typeof findProjectRoot(123), 'string');
    assert.equal(typeof findProjectRoot(null), 'string');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — journals land in the project', () => {
  it('2. a round writes into the project beneath a bare-.ctoc home (MUST be red pre-fix)', () => {
    const home = makeStandInHome();
    const originalCwd = process.cwd();
    try {
      const project = path.join(home, 'proj');
      fs.mkdirSync(path.join(project, '.git'), { recursive: true });
      process.chdir(project);
      const { appendRound } = load();
      appendRound('plan-a', { round: 1, phase: 'critical' });
      assert.equal(
        fs.existsSync(path.join(project, '.ctoc', 'loops', 'plan-a', 'journal.yaml')),
        true,
        'journal lands inside the project',
      );
      assert.equal(
        fs.existsSync(path.join(home, '.ctoc', 'loops')),
        false,
        'the stand-in home gains no loops directory',
      );
      assert.deepEqual(fs.readdirSync(path.join(home, '.ctoc')), ['.secret'], 'home .ctoc still holds only .secret');
    } finally {
      process.chdir(originalCwd);
      rm(home);
    }
  });

  it('3. two projects with the same plan slug do not collide (MUST be red pre-fix)', () => {
    const home = makeStandInHome();
    const originalCwd = process.cwd();
    try {
      const projA = path.join(home, 'a');
      const projB = path.join(home, 'b');
      fs.mkdirSync(path.join(projA, '.git'), { recursive: true });
      fs.mkdirSync(path.join(projB, '.git'), { recursive: true });
      const { appendRound, loadJournal } = load();

      process.chdir(projA);
      appendRound('shared', { round: 1, phase: 'critical', fingerprints: ['from-A'] });
      process.chdir(projB);
      appendRound('shared', { round: 1, phase: 'critical', fingerprints: ['from-B'] });

      const jA = path.join(projA, '.ctoc', 'loops', 'shared', 'journal.yaml');
      const jB = path.join(projB, '.ctoc', 'loops', 'shared', 'journal.yaml');
      assert.equal(fs.existsSync(jA), true, 'project A has its own journal');
      assert.equal(fs.existsSync(jB), true, 'project B has its own journal');

      const roundsA = loadJournal('shared', projA).rounds;
      const roundsB = loadJournal('shared', projB).rounds;
      assert.deepEqual(roundsA[0].fingerprints, ['from-A'], 'A journal has A content');
      assert.deepEqual(roundsB[0].fingerprints, ['from-B'], 'B journal has B content');
      assert.notEqual(fs.readFileSync(jA, 'utf8'), fs.readFileSync(jB, 'utf8'), 'the two journals differ');
    } finally {
      process.chdir(originalCwd);
      rm(home);
    }
  });

  it('4. the fixture matches the real crypto-home shape (.ctoc holds exactly .secret)', () => {
    const home = makeStandInHome();
    try {
      // Pins the fixture to crypto.js:13-37 — if crypto ever creates more than
      // `.secret` in ~/.ctoc, this fixture (and the tests relying on it) must be
      // revisited rather than silently drifting.
      assert.deepEqual(fs.readdirSync(path.join(home, '.ctoc')), ['.secret']);
      assert.equal(fs.readFileSync(path.join(home, '.ctoc', '.secret')).length, 64);
    } finally {
      rm(home);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — an unidentifiable location writes nothing', () => {
  it('5. appendRound refuses with a reason and creates nothing (MUST be red pre-fix)', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-nomarker-'));
    const originalCwd = process.cwd();
    try {
      process.chdir(bare);
      const { appendRound } = load();
      const result = appendRound('nope', { round: 1, phase: 'critical' });
      assert.equal(result.written, false, 'the write is refused');
      assert.equal(typeof result.reason, 'string', 'the refusal names a reason');
      assert.ok(result.reason.length > 0);
      assert.equal(fs.existsSync(path.join(bare, '.ctoc')), false, 'no .ctoc directory is created');
    } finally {
      process.chdir(originalCwd);
      rm(bare);
    }
  });

  it('6. the refusal does not throw (the Iron Loop is not taken down)', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-nomarker2-'));
    const originalCwd = process.cwd();
    try {
      process.chdir(bare);
      const { appendRound } = load();
      assert.doesNotThrow(() => appendRound('nope', { round: 1, phase: 'critical' }));
    } finally {
      process.chdir(originalCwd);
      rm(bare);
    }
  });

  it('5b. writeLetter also refuses (and writes nothing) from an unidentifiable location', () => {
    // The letters path is the second writer reaching ensureDir; it must refuse
    // symmetrically with appendRound rather than scatter letters into cwd.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-nomarker3-'));
    const originalCwd = process.cwd();
    try {
      process.chdir(bare);
      const { writeLetter } = load();
      const result = writeLetter('nope', { letter_id: 'ULID0000000000000000000000' });
      assert.equal(result.written, false, 'the letter write is refused');
      assert.equal(typeof result.reason, 'string');
      assert.equal(fs.existsSync(path.join(bare, '.ctoc')), false, 'no .ctoc directory is created');
    } finally {
      process.chdir(originalCwd);
      rm(bare);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — an explicitly supplied root is honoured', () => {
  it('7. writes at the supplied root without resolving (caller assertion is trusted)', () => {
    // A directory with NO project marker at all — resolution would refuse it,
    // but an explicit root is honoured unconditionally.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-explicit-'));
    try {
      const { appendRound } = load();
      appendRound('e', { round: 1, phase: 'critical' }, dir);
      assert.equal(
        fs.existsSync(path.join(dir, '.ctoc', 'loops', 'e', 'journal.yaml')),
        true,
        'journal written at the explicitly supplied root',
      );
    } finally {
      rm(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('refinement-loop — real CTOC projects still work', () => {
  it('8. a project with .ctoc/settings.yaml writes to .ctoc/loops/<slug>', () => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-proj8-'));
    const originalCwd = process.cwd();
    try {
      fs.mkdirSync(path.join(proj, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(proj, '.ctoc', 'settings.yaml'), 'general: {}\n');
      process.chdir(proj);
      const { appendRound } = load();
      appendRound('p8', { round: 1, phase: 'critical' });
      assert.equal(fs.existsSync(path.join(proj, '.ctoc', 'loops', 'p8', 'journal.yaml')), true);
    } finally {
      process.chdir(originalCwd);
      rm(proj);
    }
  });

  it('9. a project with a CTOC plans/ tree and no .ctoc resolves by the plans marker', () => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-proj9-'));
    const originalCwd = process.cwd();
    try {
      fs.mkdirSync(path.join(proj, 'plans', 'todo'), { recursive: true });
      process.chdir(proj);
      const { appendRound } = load();
      appendRound('p9', { round: 1, phase: 'critical' });
      assert.equal(fs.existsSync(path.join(proj, '.ctoc', 'loops', 'p9', 'journal.yaml')), true);
    } finally {
      process.chdir(originalCwd);
      rm(proj);
    }
  });

  it('10. a nested repository keeps its own journals, not the outer project (MUST be red pre-fix)', () => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outer-'));
    const originalCwd = process.cwd();
    try {
      fs.mkdirSync(path.join(outer, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(outer, '.ctoc', 'settings.yaml'), 'general: {}\n');
      const inner = path.join(outer, 'inner');
      fs.mkdirSync(path.join(inner, '.git'), { recursive: true });
      process.chdir(inner);
      const { appendRound } = load();
      appendRound('p10', { round: 1, phase: 'critical' });
      assert.equal(
        fs.existsSync(path.join(inner, '.ctoc', 'loops', 'p10', 'journal.yaml')),
        true,
        'journal lives in the INNER repository',
      );
      assert.equal(
        fs.existsSync(path.join(outer, '.ctoc', 'loops', 'p10')),
        false,
        'the outer project is untouched',
      );
    } finally {
      process.chdir(originalCwd);
      rm(outer);
    }
  });

  it('13. round-tripping still works: two rounds written and read back', () => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-rt-'));
    try {
      fs.mkdirSync(path.join(proj, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(proj, '.ctoc', 'settings.yaml'), 'general: {}\n');
      const { appendRound, loadJournal } = load();
      appendRound('rt', { round: 1, phase: 'critical', fingerprints: ['one'] }, proj);
      appendRound('rt', { round: 2, phase: 'critical', fingerprints: ['two'] }, proj);
      const journal = loadJournal('rt', proj);
      assert.equal(journal.rounds.length, 2);
      assert.equal(journal.rounds[0].round, 1);
      assert.equal(journal.rounds[1].round, 2);
    } finally {
      rm(proj);
    }
  });
});

/**
 * compliance-regime.js — DARK-BRANCH coverage (mutation-killing).
 *
 * Companion to tests/compliance-regime.test.js (the durable-"None" decline
 * suite) and tests/compliance-mode.test.js (the resolver truth table). This
 * file targets the branches those two leave dark when coverage is scoped ONLY
 * to this module via the glob `tests/*compliance-regime*.test.js`:
 *
 *   75-76    activeProfiles() catch → [] (loadActiveProfiles threw)
 *   102-104  shouldRunEuAiAct() reads its OWN constant, not gdpr's
 *   128-129  writeActiveProfiles() non-string/empty root guard → {ok:false}
 *   138-143  charset gate: an invalid/injection name refuses the WHOLE call
 *   159-160  empty requested list → ok:true no-op, ZERO write
 *   182-184  writeActiveProfiles() fs-error catch → fail-open {ok:false}
 *   280-281  declineComplianceRegime() fs-error catch → fail-open {ok:false}
 *
 * Every test pins a branch that goes RED under mutation. No mocks of core
 * logic — the REAL resolver runs against a REAL settings.yaml (or a REAL
 * on-disk pathological state) in an os.tmpdir() project, cleaned in after().
 *
 * The fs-error paths are provoked WITHOUT stubbing fs: settings.yaml is placed
 * on disk as a DIRECTORY, so safeFs.readFileSync delegates to fs.readFileSync
 * and throws EISDIR — a genuine, public-API-reachable malformed state — which
 * the module must swallow (fail-open), never propagate.
 *
 * AI-authored; every assertion read line-by-line by a human before commit.
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const compliance = require('../src/lib/compliance-regime');

const tmpDirs = [];
after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compliance-regime-cov-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  return dir;
}

function settingsPath(root) {
  return path.join(root, '.ctoc', 'settings.yaml');
}

// Realistic inited settings: a regulatory_regime block (with the ONE
// active_profiles line under test) plus a trailing top-level `enforcement`
// block. The trailing key is required by the reader-of-record's block regex
// AND is the hook-critical gate key whose survival every gate-safety test pins.
function settingsYaml(activeProfilesLine) {
  return [
    'timezone: "UTC"',
    '',
    'regulatory_regime:',
    `  active_profiles: ${activeProfilesLine}`,
    '  overrides: {}',
    '',
    'enforcement:',
    '  mode: strict',
    '',
  ].join('\n');
}

function writeSettings(root, yaml) {
  fs.writeFileSync(settingsPath(root), yaml);
}
function readSettings(root) {
  return fs.readFileSync(settingsPath(root), 'utf8');
}

// Place settings.yaml on disk as a DIRECTORY. existsSync() then returns true,
// but readFileSync() throws EISDIR — provoking the module's fs-error catch
// branches through the real filesystem, no fs stubbing.
function settingsAsDirectory(root) {
  fs.mkdirSync(settingsPath(root), { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────
// Regime SELECTION correctness — the right regime, never a fabricated one.
// Pins shouldRunGdpr / shouldRunEuAiAct read DISTINCT constants (kills a
// mutant that swaps GDPR_PROFILE ↔ EU_AI_ACT_PROFILE or the includes target).
// Covers 89-91 and the dark 102-104.
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — regime selection reads the correct profile', () => {
  const rows = [
    { id: 'empty',   line: '[]',                            gdpr: false, euai: false },
    { id: 'gdpr',    line: '[gdpr]',                        gdpr: true,  euai: false },
    { id: 'eu-ai',   line: '[eu-ai-act-high-risk]',         gdpr: false, euai: true  },
    { id: 'both',    line: '[gdpr, eu-ai-act-high-risk]',   gdpr: true,  euai: true  },
    { id: 'unknown', line: '[some-unknown-regime]',         gdpr: false, euai: false },
  ];

  for (const row of rows) {
    it(`selects gdpr=${row.gdpr} euai=${row.euai} when active_profiles is ${row.id}`, () => {
      // Arrange
      const root = tmpProject();
      writeSettings(root, settingsYaml(row.line));

      // Act
      const gdpr = compliance.shouldRunGdpr(root);
      const euai = compliance.shouldRunEuAiAct(root);

      // Assert — each resolver keys off its OWN profile name only.
      assert.equal(gdpr, row.gdpr, `shouldRunGdpr for ${row.id}`);
      assert.equal(euai, row.euai, `shouldRunEuAiAct for ${row.id}`);
    });
  }

  it('does not fabricate a regime: an unknown-only profile yields NEITHER gate active', () => {
    // Arrange — an unrelated profile name is present, but neither known one is.
    const root = tmpProject();
    writeSettings(root, settingsYaml('[iso-27001, unknown-regime]'));

    // Act + Assert — honest default, never a spurious true.
    assert.equal(compliance.shouldRunGdpr(root), false);
    assert.equal(compliance.shouldRunEuAiAct(root), false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// activeProfiles() fail-open catch (75-76): loadActiveProfiles THROWS.
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — resolver swallows a read failure (fail-open)', () => {
  it('returns false when settings.yaml is unreadable (present but a directory)', () => {
    // Arrange — settings.yaml exists (existsSync true) but is a directory, so
    // the underlying readFileSync throws EISDIR inside loadActiveProfiles.
    const root = tmpProject();
    settingsAsDirectory(root);

    // Act + Assert — the catch turns the throw into [], so both gates read
    // false WITHOUT propagating the error. Kills a mutant that drops the catch.
    assert.doesNotThrow(() => compliance.shouldRunGdpr(root));
    assert.equal(compliance.shouldRunGdpr(root), false);
    assert.equal(compliance.shouldRunEuAiAct(root), false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// writeActiveProfiles() root guard (128-129).
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — writeActiveProfiles rejects a bad root before any fs', () => {
  it('returns {ok:false, profiles:[]} for an empty-string root and never writes', () => {
    // Arrange — '' would path.join to a RELATIVE '.ctoc/settings.yaml' (the
    // repo's own, in test cwd); the guard must stop before that fs touch.
    // Act
    const res = compliance.writeActiveProfiles('', ['gdpr']);

    // Assert — the empty branch returns profiles:[] (distinct from a union),
    // proving the guard fired ahead of the read/charset/write path.
    assert.equal(res.ok, false);
    assert.deepEqual(res.profiles, []);
  });

  it('returns {ok:false} for a non-string root without throwing', () => {
    // Act + Assert
    assert.doesNotThrow(() => compliance.writeActiveProfiles(undefined, ['gdpr']));
    assert.equal(compliance.writeActiveProfiles(undefined, ['gdpr']).ok, false);
    assert.equal(compliance.writeActiveProfiles(42, ['gdpr']).ok, false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Charset gate (138-143) — the YAML-injection / gate-safety cluster.
// Compliance activation can NEVER weaken a human gate or disable enforcement.
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — charset gate refuses injection and cannot weaken enforcement', () => {
  it('refuses a newline+enforcement injection name, writes NOTHING, enforcement stays strict', () => {
    // Arrange — the exact attack the charset gate exists to close: a name that,
    // if interpolated into the YAML line, would inject an `enforcement: mode: off` block.
    const root = tmpProject();
    writeSettings(root, settingsYaml('[]'));
    const before = readSettings(root);
    const injection = 'x]\nenforcement:\n  mode: off';

    // Act
    const res = compliance.writeActiveProfiles(root, [injection]);

    // Assert — refused with an error, byte-identical file, enforcement untouched,
    // and nothing was activated. This is the gate-safety invariant, behaviorally.
    assert.equal(res.ok, false);
    assert.ok(typeof res.error === 'string' && res.error.length > 0, 'error explains the refusal');
    assert.equal(readSettings(root), before, 'settings.yaml byte-identical after refusal');
    assert.match(readSettings(root), /enforcement:\n {2}mode: strict/);
    assert.equal(compliance.shouldRunGdpr(root), false, 'nothing activated by a refused call');
  });

  it('refuses the WHOLE call when ONE name is invalid — the valid sibling is NOT activated', () => {
    // Arrange — a good name (gdpr) alongside a bad one (uppercase / space). The
    // gate must refuse the entire request; a partial activation is never safer.
    const root = tmpProject();
    writeSettings(root, settingsYaml('[]'));
    const before = readSettings(root);

    // Act
    const res = compliance.writeActiveProfiles(root, ['gdpr', 'Bad Name']);

    // Assert — gdpr did NOT slip through; file untouched. Kills a per-name
    // mutant that would filter out only the bad entry and activate gdpr.
    assert.equal(res.ok, false);
    assert.equal(compliance.shouldRunGdpr(root), false, 'valid sibling not activated');
    assert.equal(readSettings(root), before, 'no write on a mixed valid/invalid list');
    assert.match(res.error, /Bad Name/, 'error names the offending entry');
  });

  it('refuses a leading-hyphen name (charset requires an alphanumeric start)', () => {
    // Arrange — PROFILE_NAME_RE anchors the first char to [a-z0-9].
    const root = tmpProject();
    writeSettings(root, settingsYaml('[]'));
    const before = readSettings(root);

    // Act
    const res = compliance.writeActiveProfiles(root, ['-gdpr']);

    // Assert
    assert.equal(res.ok, false);
    assert.equal(readSettings(root), before, 'leading-hyphen name written nowhere');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Empty-requested no-op (159-160): ok:true, ZERO write.
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — an empty request is an ok no-op that writes nothing', () => {
  it('returns ok:true with the existing union and leaves the file BYTE-identical', () => {
    // Arrange — NON-canonical spacing on the active_profiles line. If the no-op
    // early-return were removed, the fall-through rewrite would COLLAPSE the
    // extra spaces to canonical form, changing the bytes. Byte-identity is the
    // discriminator that a same-value rewrite test would miss.
    const root = tmpProject();
    const weird = [
      'regulatory_regime:',
      '  active_profiles:      [gdpr]',   // deliberately over-spaced
      '  overrides: {}',
      '',
      'enforcement:',
      '  mode: strict',
      '',
    ].join('\n');
    writeSettings(root, weird);

    // Act — empty list: deliberate no-op.
    const res = compliance.writeActiveProfiles(root, []);

    // Assert
    assert.equal(res.ok, true, 'empty request succeeds (declining to add is not a failure)');
    assert.deepEqual(res.profiles, ['gdpr'], 'reports the untouched existing union');
    assert.equal(readSettings(root), weird, 'no rewrite — over-spacing preserved verbatim');
  });

  it('treats a whitespace-only name list as empty (filtered) → same no-op', () => {
    // Arrange
    const root = tmpProject();
    writeSettings(root, settingsYaml('[gdpr]'));
    const before = readSettings(root);

    // Act — the names filter out (trim → empty), so requested is empty.
    const res = compliance.writeActiveProfiles(root, ['   ', '']);

    // Assert
    assert.equal(res.ok, true);
    assert.deepEqual(res.profiles, ['gdpr']);
    assert.equal(readSettings(root), before, 'blank-only names cause no write');
  });
});

// ─────────────────────────────────────────────────────────────────────
// writeActiveProfiles() fs-error catch (182-184): fail-open.
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — writeActiveProfiles fails open on an fs error', () => {
  it('returns {ok:false, profiles:[]} when settings.yaml is a directory (readFileSync throws)', () => {
    // Arrange — existsSync passes (the directory exists), but the subsequent
    // readFileSync throws EISDIR, driving execution into the outer catch.
    const root = tmpProject();
    settingsAsDirectory(root);

    // Act + Assert — the menu ride-along must stay graceful: no throw, ok:false.
    let res;
    assert.doesNotThrow(() => { res = compliance.writeActiveProfiles(root, ['gdpr']); });
    assert.equal(res.ok, false);
    assert.deepEqual(res.profiles, []);
  });
});

// ─────────────────────────────────────────────────────────────────────
// declineComplianceRegime() fs-error catch (280-281): fail-open.
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — declineComplianceRegime fails open on an fs error', () => {
  it('returns {ok:false} when settings.yaml is a directory (readFileSync throws)', () => {
    // Arrange — same pathological on-disk state; existsSync true, read throws.
    const root = tmpProject();
    settingsAsDirectory(root);

    // Act + Assert — a decline that hits an fs error reports ok:false, never throws.
    let res;
    assert.doesNotThrow(() => { res = compliance.declineComplianceRegime(root); });
    assert.equal(res.ok, false);
  });
});

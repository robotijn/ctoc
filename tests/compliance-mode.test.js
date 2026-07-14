/**
 * EC1-s2 — compliance-regime resolver tests.
 *
 * Full truth table for shouldRunGdpr / shouldRunEuAiAct derived from the ONE
 * source of truth (regulatory_regime.active_profiles), graceful degradation
 * (missing/unknown profile / wrong root → false, never throw), the targeted
 * write helper (writeActiveProfiles swaps ONLY the active_profiles line), the
 * neighboring-block-byte-identical proof, and the HUMAN GATE INVARIANT
 * (compliance activation cannot touch enforcementMode/requireReviewGate, and
 * human-gate-check's 3-entry HUMAN_GATES map is unchanged).
 *
 * These tests exercise the REAL resolver against a REAL settings.yaml written
 * to a tmp project — no mocks of core logic.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const compliance = require('../src/lib/compliance-regime');

const REPO_ROOT = path.join(__dirname, '..');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');

// A realistic settings.yaml: a regulatory_regime block whose active_profiles
// line is the ONLY thing tests vary, plus enforcement + operations blocks that
// MUST remain byte-identical across a writeActiveProfiles call (the hook-critical
// blocks the parent's risk mitigation protects).
function settingsYaml(activeProfilesLine) {
  return [
    'timezone: "UTC"',
    '',
    'regulatory_regime:',
    `  active_profiles: ${activeProfilesLine}`,
    '  overrides: {}',
    '',
    'operations:',
    '  default_model: "claude-opus-4-5-20251101"',
    '  performance:',
    '    max_parallel_agents: 3',
    '',
    'enforcement:',
    '  mode: strict',
    '  whitelist:',
    '    - "*.md"',
    ''
  ].join('\n');
}

const tmpDirs = [];

// Build a tmp project with a real .ctoc/settings.yaml AND a copy of the real
// regulatory-regimes/ dir so loadActiveProfiles + downstream reads see gdpr.yaml
// and eu-ai-act-high-risk.yaml exactly as shipped.
function projectWith(activeProfilesLine, { writeSettings = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compliance-mode-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc', 'regulatory-regimes'), { recursive: true });
  // Copy the real regime profiles (source of truth for downstream reads).
  for (const f of fs.readdirSync(REGIMES_SRC)) {
    if (f.endsWith('.yaml')) {
      fs.copyFileSync(path.join(REGIMES_SRC, f), path.join(dir, '.ctoc', 'regulatory-regimes', f));
    }
  }
  if (writeSettings) {
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), settingsYaml(activeProfilesLine));
  }
  return dir;
}

function readSettings(root) {
  return fs.readFileSync(path.join(root, '.ctoc', 'settings.yaml'), 'utf8');
}

// Extract the enforcement + operations region (everything from `operations:`
// onward) so we can prove writeActiveProfiles leaves it byte-identical.
function neighborRegion(yaml) {
  const idx = yaml.indexOf('\noperations:');
  assert.notEqual(idx, -1, 'fixture must contain an operations block');
  return yaml.slice(idx);
}

after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

// ─────────────────────────────────────────────────────────────────────
// 1–4, 6. Resolver truth table
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — resolver truth table', () => {
  it('1. default empty → both false, no throw', () => {
    const root = projectWith('[]');
    assert.doesNotThrow(() => compliance.shouldRunGdpr(root));
    assert.equal(compliance.shouldRunGdpr(root), false);
    assert.equal(compliance.shouldRunEuAiAct(root), false);
  });

  it('2. gdpr active → shouldRunGdpr true, shouldRunEuAiAct false', () => {
    const root = projectWith('[gdpr]');
    assert.equal(compliance.shouldRunGdpr(root), true);
    assert.equal(compliance.shouldRunEuAiAct(root), false);
  });

  it('3. eu-ai-act active → shouldRunEuAiAct true, shouldRunGdpr false', () => {
    const root = projectWith('[eu-ai-act-high-risk]');
    assert.equal(compliance.shouldRunEuAiAct(root), true);
    assert.equal(compliance.shouldRunGdpr(root), false);
  });

  it('4. both active → both true', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    assert.equal(compliance.shouldRunGdpr(root), true);
    assert.equal(compliance.shouldRunEuAiAct(root), true);
  });

  it('6. unknown profile → both false, no throw', () => {
    const root = projectWith('[unknown-regime]');
    assert.doesNotThrow(() => compliance.shouldRunGdpr(root));
    assert.equal(compliance.shouldRunGdpr(root), false);
    assert.equal(compliance.shouldRunEuAiAct(root), false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5, 7. Graceful degradation
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — graceful degradation (fail-open)', () => {
  it('5. missing settings.yaml → both false, no throw', () => {
    const root = projectWith('[]', { writeSettings: false });
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'settings.yaml')));
    assert.doesNotThrow(() => compliance.shouldRunGdpr(root));
    assert.equal(compliance.shouldRunGdpr(root), false);
    assert.equal(compliance.shouldRunEuAiAct(root), false);
  });

  it('7. wrong projectRoot → false, not crash', () => {
    const bogus = path.join(os.tmpdir(), 'compliance-mode-does-not-exist-xyz');
    assert.doesNotThrow(() => compliance.shouldRunGdpr(bogus));
    assert.equal(compliance.shouldRunGdpr(bogus), false);
    assert.equal(compliance.shouldRunEuAiAct(bogus), false);
  });

  it('7b. non-string / undefined root → false, not crash', () => {
    assert.doesNotThrow(() => compliance.shouldRunGdpr(undefined));
    assert.equal(compliance.shouldRunGdpr(undefined), false);
    assert.equal(compliance.shouldRunEuAiAct(null), false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8, 9, 10, 12. writeActiveProfiles behavior
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — writeActiveProfiles', () => {
  it('8. adds gdpr and round-trips through the real resolver', () => {
    const root = projectWith('[]');
    assert.equal(compliance.shouldRunGdpr(root), false);
    const res = compliance.writeActiveProfiles(root, ['gdpr']);
    assert.equal(res.ok, true);
    assert.ok(res.profiles.includes('gdpr'));
    // Proven real via a fresh read through the resolver (read-fresh).
    assert.equal(compliance.shouldRunGdpr(root), true);
  });

  it('9. is additive (union, no clobber of existing profile)', () => {
    const root = projectWith('[gdpr]');
    const res = compliance.writeActiveProfiles(root, ['eu-ai-act-high-risk']);
    assert.equal(res.ok, true);
    assert.equal(compliance.shouldRunGdpr(root), true, 'existing gdpr preserved');
    assert.equal(compliance.shouldRunEuAiAct(root), true, 'new profile added');
  });

  it('9b. de-duplicates: adding an already-active profile is idempotent', () => {
    const root = projectWith('[gdpr]');
    const res = compliance.writeActiveProfiles(root, ['gdpr']);
    assert.equal(res.ok, true);
    assert.deepEqual(res.profiles, ['gdpr']);
  });

  it('10. writeActiveProfiles([]) is a no-op OK, active_profiles unchanged', () => {
    const root = projectWith('[gdpr]');
    const before = readSettings(root);
    const res = compliance.writeActiveProfiles(root, []);
    assert.equal(res.ok, true);
    assert.deepEqual(res.profiles, ['gdpr']);
    assert.equal(readSettings(root), before, 'file byte-identical after []');
  });

  it('10b. non-array profileNames is coerced to [] (no throw, no clobber)', () => {
    const root = projectWith('[gdpr]');
    const before = readSettings(root);
    assert.doesNotThrow(() => compliance.writeActiveProfiles(root, 'gdpr'));
    const res = compliance.writeActiveProfiles(root, /** @type {any} */ (null));
    assert.equal(res.ok, true);
    assert.equal(readSettings(root), before);
  });

  it('12. missing settings.yaml on write → {ok:false}, no file created', () => {
    const root = projectWith('[]', { writeSettings: false });
    const res = compliance.writeActiveProfiles(root, ['gdpr']);
    assert.equal(res.ok, false);
    assert.deepEqual(res.profiles, []);
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'settings.yaml')), 'no fabricated file');
  });

  it('12b. no active_profiles: line → {ok:false}, never blind-append', () => {
    const root = projectWith('[]', { writeSettings: false });
    // Write a settings.yaml with a regulatory_regime block but NO active_profiles line.
    const noLine = ['regulatory_regime:', '  overrides: {}', '', 'enforcement:', '  mode: strict', ''].join('\n');
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.yaml'), noLine);
    const res = compliance.writeActiveProfiles(root, ['gdpr']);
    assert.equal(res.ok, false);
    assert.equal(readSettings(root), noLine, 'file untouched — no blind append');
  });

  it('12c. bogus root on write → {ok:false}, no throw', () => {
    const bogus = path.join(os.tmpdir(), 'compliance-mode-no-such-root-abc');
    let res;
    assert.doesNotThrow(() => { res = compliance.writeActiveProfiles(bogus, ['gdpr']); });
    assert.equal(res.ok, false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 11. Neighboring blocks untouched (targeted-replace proof)
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — targeted replace leaves neighbors byte-identical', () => {
  it('11. enforcement/operations region is byte-identical after writeActiveProfiles', () => {
    const root = projectWith('[]');
    const before = neighborRegion(readSettings(root));
    const res = compliance.writeActiveProfiles(root, ['gdpr']);
    assert.equal(res.ok, true);
    const after = neighborRegion(readSettings(root));
    assert.equal(after, before, 'enforcement + operations blocks unchanged (only the list line moved)');
  });

  it('11b. only the active_profiles line changed; every other line identical', () => {
    const root = projectWith('[]');
    const before = readSettings(root).split('\n');
    compliance.writeActiveProfiles(root, ['gdpr']);
    const after = readSettings(root).split('\n');
    assert.equal(after.length, before.length, 'no lines added/removed');
    const diffs = before
      .map((line, i) => (line === after[i] ? null : i))
      .filter(i => i !== null);
    assert.equal(diffs.length, 1, 'exactly one line changed');
    assert.match(before[diffs[0]], /active_profiles:/);
    assert.match(after[diffs[0]], /active_profiles:.*gdpr/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 13. GATE INVARIANT — compliance activation cannot weaken a human gate
// ─────────────────────────────────────────────────────────────────────

describe('compliance-regime — GATE INVARIANT (parent Success Metric 5)', () => {
  const GATE_CHECK = path.join(REPO_ROOT, 'src', 'hooks', 'human-gate-check.js');
  const MODULE_SRC = path.join(REPO_ROOT, 'src', 'lib', 'compliance-regime.js');

  it('13a. human-gate-check HUMAN_GATES map still has EXACTLY the three transitions', () => {
    // Assert the REAL runtime map (stronger than grepping source text): the
    // hook re-exports GATE_SOURCE from gate-order as HUMAN_GATES (R6-B).
    const { HUMAN_GATES } = require(GATE_CHECK);
    assert.deepEqual(Object.keys(HUMAN_GATES).sort(), ['done', 'implementation', 'todo'],
      'exactly the three gate destinations — compliance activation adds/removes none');
    assert.equal(HUMAN_GATES.implementation, 'functional');
    assert.equal(HUMAN_GATES.todo, 'implementation');
    assert.equal(HUMAN_GATES.done, 'review');
  });

  it('13b. the module exports NO function that mutates enforcementMode or requireReviewGate', () => {
    const src = fs.readFileSync(MODULE_SRC, 'utf8');
    assert.doesNotMatch(src, /enforcementMode/, 'no enforcementMode reference');
    assert.doesNotMatch(src, /requireReviewGate/, 'no requireReviewGate reference');
    // Exported surface is exactly the compliance functions — nothing gate-shaped.
    // R2-C2 (plans/todo/00010-r2c2-persisted-answers-unblocked.md) item 1 adds
    // `declineComplianceRegime` — the durable "None" persist verb. It writes only a
    // `declined:` marker inside the regulatory_regime block and, like its siblings,
    // exposes NO enforcementMode/requireReviewGate key (asserted above). The pin is
    // TIGHTENED (not loosened): it still asserts the EXACT export set, now of four.
    const exportKeys = Object.keys(compliance);
    assert.deepEqual(
      exportKeys.sort(),
      ['declineComplianceRegime', 'shouldRunEuAiAct', 'shouldRunGdpr', 'writeActiveProfiles'].sort()
    );
  });

  it('13c. activating BOTH profiles does not touch enforcement mode in settings.yaml', () => {
    const root = projectWith('[]');
    const enforcementBefore = readSettings(root).match(/enforcement:\s*\n\s*mode:\s*(\w+)/)[1];
    compliance.writeActiveProfiles(root, ['gdpr', 'eu-ai-act-high-risk']);
    const enforcementAfter = readSettings(root).match(/enforcement:\s*\n\s*mode:\s*(\w+)/)[1];
    assert.equal(enforcementAfter, enforcementBefore, 'enforcement mode unchanged by compliance activation');
    assert.equal(enforcementAfter, 'strict');
  });
});

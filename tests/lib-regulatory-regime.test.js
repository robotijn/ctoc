/**
 * Contract tests for src/lib/regulatory-regime.js
 *
 * The regulatory-regime module is the per-project compliance regime selector.
 * Profiles live under .ctoc/regulatory-regimes/<name>.yaml and are activated by
 * regulatory_regime.active_profiles in .ctoc/settings.yaml. Controls from every
 * active profile are union-merged; retention windows take the longest required.
 *
 * Public API under test:
 *   loadActiveProfiles(projectRoot)      -> { profiles, overrides }
 *   loadProfile(projectRoot, name)       -> object | null
 *   effectiveControls(projectRoot)       -> Set<string>
 *   isControlEnabled(projectRoot, name)  -> boolean (throws on unknown control)
 *   retentionDays(projectRoot, category) -> number (throws on unknown category)
 *   regimeSummary(projectRoot)           -> string | null
 *   listAvailableProfiles(projectRoot)   -> string[] (sorted)
 *
 * Constants exported: KNOWN_CONTROLS, RETENTION_CATEGORIES, DEFAULT_RETENTION_DAYS.
 *
 * parseYAMLShallow is the module's internal subset-YAML parser. It is NOT part
 * of the public exports, so it is exercised here through loadProfile (which
 * returns exactly its parse output for a profile file on disk).
 *
 * KNOWN BUG (tests in the final describe block are EXPECTED TO FAIL):
 *   parseYAMLShallow silently drops the items of a block list. When a profile
 *   declares `required_controls:` as an indented block list, the parsed value is
 *   an empty array, so the profile activates ZERO controls. These tests assert
 *   the DOCUMENTED/correct contract (the items must be parsed) and are left
 *   FAILING on purpose for the maintainer to fix. They are not weakened to match
 *   the buggy behavior.
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const regime = require('../src/lib/regulatory-regime.js');
const {
  KNOWN_CONTROLS,
  RETENTION_CATEGORIES,
  DEFAULT_RETENTION_DAYS,
  loadActiveProfiles,
  loadProfile,
  effectiveControls,
  isControlEnabled,
  retentionDays,
  regimeSummary,
  listAvailableProfiles
} = regime;

// ---------------------------------------------------------------------------
// Hermetic temp-project helpers
// ---------------------------------------------------------------------------

const createdDirs = [];

// Create an isolated temp project rooted at a real (symlink-resolved) path so
// no test reads or writes the actual repo. Returns the project root.
function makeProject() {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-regime-'));
  const root = fs.realpathSync(raw);
  createdDirs.push(root);
  fs.mkdirSync(path.join(root, '.ctoc', 'regulatory-regimes'), { recursive: true });
  return root;
}

// Write a profile YAML into the project's regulatory-regimes directory.
function writeProfile(root, name, yaml) {
  fs.writeFileSync(
    path.join(root, '.ctoc', 'regulatory-regimes', `${name}.yaml`),
    yaml
  );
}

// Write .ctoc/settings.yaml. The block extractor in loadActiveProfiles reads
// until the next top-level key, so we always append a trailing top-level key to
// bound the regulatory_regime block deterministically.
function writeSettings(root, body) {
  fs.writeFileSync(
    path.join(root, '.ctoc', 'settings.yaml'),
    `${body}\ntimezone: "UTC"\n`
  );
}

// Activate the given profile names via a block list under active_profiles, with
// an optional overrides block. (active_profiles itself is read by a dedicated
// regex in loadActiveProfiles, not by parseYAMLShallow, so the block list here
// is parsed correctly.)
function writeActiveProfiles(root, names, overridesBody) {
  const list = names.map(n => `    - ${n}`).join('\n');
  let body = `regulatory_regime:\n  active_profiles:\n${list}\n`;
  if (overridesBody) body += overridesBody;
  writeSettings(root, body);
}

// A shipped-style profile body (mirrors hipaa.yaml / sox-itgc.yaml: scalar
// header keys, required_controls as a block list, retention as a map).
function shippedStyleProfile(controls, retention) {
  let body = 'name: sample\n';
  body += 'display_name: "Sample Regime"\n';
  body += 'description: "A sample profile for tests."\n';
  body += 'required_controls:\n';
  body += controls.map(c => `  - ${c}`).join('\n');
  body += '\n';
  if (retention) {
    body += 'retention:\n';
    for (const [cat, days] of Object.entries(retention)) {
      body += `  ${cat}: ${days}\n`;
    }
  }
  return body;
}

after(() => {
  for (const dir of createdDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup; never fail the suite on teardown
    }
  }
});

// ===========================================================================
// PASSING CONTRACT — surfaces that work correctly today
// ===========================================================================

// ---------------------------------------------------------------------------
// Default / "none" regime
// ---------------------------------------------------------------------------

describe('default regime (no active profiles)', () => {
  it('loadActiveProfiles returns empty profiles/overrides when settings is missing', () => {
    const root = makeProject();
    const { profiles, overrides } = loadActiveProfiles(root);
    assert.deepEqual(profiles, []);
    assert.deepEqual(overrides, {});
  });

  it('loadActiveProfiles returns empty profiles for an empty active_profiles block list', () => {
    const root = makeProject();
    writeSettings(root, 'regulatory_regime:\n  active_profiles:\n');
    const { profiles } = loadActiveProfiles(root);
    assert.deepEqual(profiles, []);
  });

  it('loadActiveProfiles returns empty profiles for an inline empty list', () => {
    const root = makeProject();
    writeSettings(root, 'regulatory_regime:\n  active_profiles: []\n');
    const { profiles } = loadActiveProfiles(root);
    assert.deepEqual(profiles, []);
  });

  it('effectiveControls is an empty Set with no active profiles', () => {
    const root = makeProject();
    writeActiveProfiles(root, []);
    const controls = effectiveControls(root);
    assert.ok(controls instanceof Set);
    assert.equal(controls.size, 0);
  });

  it('isControlEnabled is false for every known control under the default regime', () => {
    const root = makeProject();
    writeActiveProfiles(root, []);
    assert.equal(isControlEnabled(root, 'audit_hash_chain'), false);
    assert.equal(isControlEnabled(root, 'four_eyes_gate3'), false);
  });

  it('regimeSummary is null when no profiles are active', () => {
    const root = makeProject();
    writeActiveProfiles(root, []);
    assert.equal(regimeSummary(root), null);
  });

  it('retentionDays falls back to the per-category default with no profiles', () => {
    const root = makeProject();
    writeActiveProfiles(root, []);
    for (const category of RETENTION_CATEGORIES) {
      assert.equal(retentionDays(root, category), DEFAULT_RETENTION_DAYS[category]);
    }
  });
});

// ---------------------------------------------------------------------------
// loadActiveProfiles — reading the settings block
// ---------------------------------------------------------------------------

describe('loadActiveProfiles', () => {
  it('reads multiple profile names from a block list in order', () => {
    const root = makeProject();
    writeActiveProfiles(root, ['alpha', 'beta', 'gamma']);
    const { profiles } = loadActiveProfiles(root);
    assert.deepEqual(profiles, ['alpha', 'beta', 'gamma']);
  });

  it('reads an inline active_profiles list', () => {
    const root = makeProject();
    writeSettings(root, 'regulatory_regime:\n  active_profiles: [alpha, beta]\n');
    const { profiles } = loadActiveProfiles(root);
    assert.deepEqual(profiles, ['alpha', 'beta']);
  });

  it('reads the overrides map with coerced boolean values', () => {
    const root = makeProject();
    writeActiveProfiles(
      root,
      ['sample'],
      '  overrides:\n    legal_hold: true\n    audit_hash_chain: false\n'
    );
    const { overrides } = loadActiveProfiles(root);
    assert.deepEqual(overrides, { legal_hold: true, audit_hash_chain: false });
  });
});

// ---------------------------------------------------------------------------
// loadProfile — file lookup and (working) scalar/map parsing
// ---------------------------------------------------------------------------

describe('loadProfile', () => {
  it('returns null for a missing profile', () => {
    const root = makeProject();
    assert.equal(loadProfile(root, 'does-not-exist'), null);
  });

  it('parses scalar header keys, booleans, integers, and null with coercion', () => {
    const root = makeProject();
    writeProfile(
      root,
      'scalars',
      'name: sample\nenabled: true\ndisabled: false\ncount: 7\nempty: ~\n'
    );
    const parsed = loadProfile(root, 'scalars');
    assert.equal(parsed.name, 'sample');
    assert.equal(parsed.enabled, true);
    assert.equal(parsed.disabled, false);
    assert.equal(parsed.count, 7);
    assert.equal(parsed.empty, null);
  });

  it('parses the retention block as a nested map of numbers', () => {
    const root = makeProject();
    writeProfile(root, 'ret', 'name: sample\nretention:\n  dispatches: 2190\n  plans: 1825\n');
    const parsed = loadProfile(root, 'ret');
    assert.deepEqual(parsed.retention, { dispatches: 2190, plans: 1825 });
  });
});

// ---------------------------------------------------------------------------
// effectiveControls / overrides — the parts independent of profile control lists
// ---------------------------------------------------------------------------

describe('effectiveControls overrides (independent of profile control lists)', () => {
  it('an active profile with a missing file is ignored', () => {
    const root = makeProject();
    writeActiveProfiles(root, ['ghost']);
    assert.equal(effectiveControls(root).size, 0);
  });

  it('override:true force-enables a control via settings', () => {
    const root = makeProject();
    writeActiveProfiles(root, ['sample'], '  overrides:\n    legal_hold: true\n');
    writeProfile(root, 'sample', shippedStyleProfile(['audit_hash_chain']));
    const controls = effectiveControls(root);
    assert.ok(controls.has('legal_hold'), 'override:true should add the control');
  });

  it('override:false removes a control from the effective set', () => {
    const root = makeProject();
    // Force legal_hold on, then off, to exercise the deletion path deterministically.
    writeActiveProfiles(
      root,
      ['sample'],
      '  overrides:\n    legal_hold: true\n    four_eyes_gate3: false\n'
    );
    writeProfile(root, 'sample', shippedStyleProfile(['audit_hash_chain']));
    const controls = effectiveControls(root);
    assert.ok(controls.has('legal_hold'));
    assert.ok(!controls.has('four_eyes_gate3'), 'override:false should remove the control');
  });
});

// ---------------------------------------------------------------------------
// retentionDays — longest-window resolution (retention is a map; parses fine)
// ---------------------------------------------------------------------------

describe('retentionDays resolution', () => {
  it('throws on an unknown retention category', () => {
    const root = makeProject();
    writeActiveProfiles(root, []);
    assert.throws(() => retentionDays(root, 'not_a_category'), /Unknown retention category/);
  });

  it('uses a profile-specified window when it exceeds the default', () => {
    const root = makeProject();
    // default dispatches = 90; profile asks for 2190 -> profile wins
    writeProfile(root, 'sample', shippedStyleProfile(['audit_hash_chain'], { dispatches: 2190 }));
    writeActiveProfiles(root, ['sample']);
    assert.equal(retentionDays(root, 'dispatches'), 2190);
  });

  it('keeps the default when the profile asks for a shorter window', () => {
    const root = makeProject();
    // default baselines = 3650; profile asks for 365 -> default (longer) wins
    writeProfile(root, 'sample', shippedStyleProfile(['audit_hash_chain'], { baselines: 365 }));
    writeActiveProfiles(root, ['sample']);
    assert.equal(retentionDays(root, 'baselines'), DEFAULT_RETENTION_DAYS.baselines);
  });

  it('takes the LONGEST window across multiple profiles', () => {
    const root = makeProject();
    writeProfile(root, 'alpha', shippedStyleProfile(['audit_hash_chain'], { dispatches: 2190 }));
    writeProfile(root, 'beta', shippedStyleProfile(['legal_hold'], { dispatches: 3000 }));
    writeActiveProfiles(root, ['alpha', 'beta']);
    assert.equal(retentionDays(root, 'dispatches'), 3000);
  });
});

// ---------------------------------------------------------------------------
// regimeSummary — shape when profiles are active
// ---------------------------------------------------------------------------

describe('regimeSummary shape', () => {
  it('names the active profiles and reports a control count', () => {
    const root = makeProject();
    writeProfile(root, 'alpha', shippedStyleProfile(['audit_hash_chain']));
    writeProfile(root, 'beta', shippedStyleProfile(['legal_hold']));
    writeActiveProfiles(root, ['alpha', 'beta']);

    const summary = regimeSummary(root);
    assert.equal(typeof summary, 'string');
    assert.match(summary, /^Regulatory regime: alpha, beta \(\d+ controls active\)$/);
    assert.ok(summary.includes('alpha'));
    assert.ok(summary.includes('beta'));
  });
});

// ---------------------------------------------------------------------------
// listAvailableProfiles
// ---------------------------------------------------------------------------

describe('listAvailableProfiles', () => {
  it('returns an empty array when the profiles directory is absent', () => {
    const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-regime-empty-'));
    const root = fs.realpathSync(raw);
    createdDirs.push(root);
    // no .ctoc/regulatory-regimes directory created
    assert.deepEqual(listAvailableProfiles(root), []);
  });

  it('lists .yaml profiles by base name, sorted, ignoring non-yaml files', () => {
    const root = makeProject();
    writeProfile(root, 'zeta', shippedStyleProfile(['audit_hash_chain']));
    writeProfile(root, 'alpha', shippedStyleProfile(['legal_hold']));
    fs.writeFileSync(
      path.join(root, '.ctoc', 'regulatory-regimes', 'README.md'),
      '# not a profile\n'
    );
    assert.deepEqual(listAvailableProfiles(root), ['alpha', 'zeta']);
  });
});

// ---------------------------------------------------------------------------
// isControlEnabled — error contract
// ---------------------------------------------------------------------------

describe('isControlEnabled error contract', () => {
  it('throws on an unknown control name', () => {
    const root = makeProject();
    writeActiveProfiles(root, []);
    assert.throws(() => isControlEnabled(root, 'totally_made_up'), /Unknown control/);
  });

  it('accepts every name in KNOWN_CONTROLS without throwing', () => {
    const root = makeProject();
    writeActiveProfiles(root, []);
    for (const control of KNOWN_CONTROLS) {
      assert.doesNotThrow(() => isControlEnabled(root, control));
    }
  });
});

// ===========================================================================
// KNOWN BUG — parseYAMLShallow drops block-list items.
//
// These tests assert the DOCUMENTED/correct contract: a `required_controls:`
// block list must parse to its items, and the activation pipeline must reflect
// them. They are EXPECTED TO FAIL against the current code and are intentionally
// left failing (not weakened) for the maintainer to fix in parseYAMLShallow.
//
// Empirically the defect is broader than "first top-level key": EVERY top-level
// block list loses its items (the parser pushes the array onto its own stack
// frame, then looks for parent[parentKey] on the array, which is never an array,
// so each `- item` is silently discarded). The shipped hipaa.yaml / sox-itgc.yaml
// profiles therefore activate ZERO controls in production.
// ===========================================================================

describe('parseYAMLShallow block lists (KNOWN BUG — expected to fail)', () => {
  it('first top-level key as a block list keeps its items', () => {
    const root = makeProject();
    writeProfile(
      root,
      'firstkey',
      'required_controls:\n  - audit_hash_chain\n  - four_eyes_gate3\nname: sample\n'
    );
    const parsed = loadProfile(root, 'firstkey');
    assert.deepEqual(
      parsed.required_controls,
      ['audit_hash_chain', 'four_eyes_gate3'],
      'first-key block list items were dropped — silent control under-activation'
    );
  });

  it('a block list after a scalar key keeps its items', () => {
    const root = makeProject();
    writeProfile(
      root,
      'nonfirst',
      'name: sample\nrequired_controls:\n  - audit_hash_chain\n  - legal_hold\n'
    );
    const parsed = loadProfile(root, 'nonfirst');
    assert.deepEqual(parsed.required_controls, ['audit_hash_chain', 'legal_hold']);
  });

  it('effectiveControls activates the controls a profile declares', () => {
    const root = makeProject();
    writeProfile(root, 'sample', shippedStyleProfile(['audit_hash_chain', 'four_eyes_gate3']));
    writeActiveProfiles(root, ['sample']);
    const controls = effectiveControls(root);
    assert.ok(controls.has('audit_hash_chain'), 'declared control should be active');
    assert.ok(controls.has('four_eyes_gate3'), 'declared control should be active');
  });

  it('isControlEnabled is true for a control the active profile requires', () => {
    const root = makeProject();
    writeProfile(root, 'sample', shippedStyleProfile(['audit_hash_chain']));
    writeActiveProfiles(root, ['sample']);
    assert.equal(isControlEnabled(root, 'audit_hash_chain'), true);
  });

  it('effectiveControls union-merges controls across multiple profiles', () => {
    const root = makeProject();
    writeProfile(root, 'alpha', shippedStyleProfile(['audit_hash_chain', 'four_eyes_gate3']));
    writeProfile(root, 'beta', shippedStyleProfile(['four_eyes_gate3', 'legal_hold']));
    writeActiveProfiles(root, ['alpha', 'beta']);
    assert.deepEqual(
      [...effectiveControls(root)].sort(),
      ['audit_hash_chain', 'four_eyes_gate3', 'legal_hold']
    );
  });

  it('regimeSummary reports the true active control count', () => {
    const root = makeProject();
    writeProfile(root, 'alpha', shippedStyleProfile(['audit_hash_chain', 'four_eyes_gate3']));
    writeProfile(root, 'beta', shippedStyleProfile(['legal_hold']));
    writeActiveProfiles(root, ['alpha', 'beta']);
    const summary = regimeSummary(root);
    // 3 distinct controls across the two profiles
    assert.match(summary, /\(3 controls active\)$/, `summary was: ${summary}`);
  });
});

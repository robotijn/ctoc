/**
 * EC1-s1 — GDPR regulatory-regime profile (gdpr.yaml)
 *
 * Drives the REAL regime loader (src/lib/regulatory-regime.js) against a tmp
 * project into which the real repo profile dir is copied. Proves:
 *   - loadProfile(root,'gdpr') returns the profile with the required shape
 *   - required_controls are the three intended controls, all in KNOWN_CONTROLS
 *   - listAvailableProfiles(root) includes 'gdpr'
 *   - effectiveControls(root) union-merges gdpr controls when it is active
 *   - isControlEnabled does not throw for the gdpr controls
 *   - unknown-profile guard still returns null
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadProfile,
  listAvailableProfiles,
  effectiveControls,
  isControlEnabled,
  KNOWN_CONTROLS,
} = require('../src/lib/regulatory-regime');

const REPO_ROOT = path.join(__dirname, '..');
const REAL_PROFILES_DIR = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');

const EXPECTED_CONTROLS = ['dsar_handler', 'retention_schedule', 'audit_hash_chain'];

describe('EC1-s1 GDPR regulatory-regime profile', () => {
  let tmpRoot;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ec1-gdpr-'));
    const dstProfiles = path.join(tmpRoot, '.ctoc', 'regulatory-regimes');
    fs.mkdirSync(dstProfiles, { recursive: true });

    // Copy the real gdpr.yaml plus a sibling so the loader reads the real files.
    for (const name of ['gdpr.yaml', 'eu-ai-act-high-risk.yaml']) {
      fs.copyFileSync(
        path.join(REAL_PROFILES_DIR, name),
        path.join(dstProfiles, name)
      );
    }

    // A settings.yaml activating the gdpr profile, exercising the real resolver.
    // A trailing top-level key bounds the regulatory_regime block for the real
    // loader's block-extraction regex (mirrors lib-regulatory-regime.test.js).
    fs.writeFileSync(
      path.join(tmpRoot, '.ctoc', 'settings.yaml'),
      'regulatory_regime:\n  active_profiles: [gdpr]\n\ntimezone: "UTC"\n',
      'utf8'
    );
  });

  after(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('loadProfile returns a gdpr profile with the required shape', () => {
    const profile = loadProfile(tmpRoot, 'gdpr');
    assert.ok(profile, 'gdpr profile should load (non-null)');
    assert.strictEqual(profile.name, 'gdpr', 'name must equal filename stem');
    assert.ok(
      typeof profile.display_name === 'string' && profile.display_name.length > 0,
      'display_name must be non-empty'
    );
    assert.ok(
      typeof profile.description === 'string' && profile.description.length > 0,
      'description must be non-empty'
    );
    assert.ok(
      typeof profile.applies_to === 'string' && profile.applies_to.length > 0,
      'applies_to must be non-empty'
    );
    assert.ok(
      Array.isArray(profile.required_controls) && profile.required_controls.length >= 3,
      'required_controls must be a block list of at least 3 items'
    );
  });

  it('required_controls are the three intended controls, all in KNOWN_CONTROLS', () => {
    const profile = loadProfile(tmpRoot, 'gdpr');
    for (const c of EXPECTED_CONTROLS) {
      assert.ok(
        profile.required_controls.includes(c),
        `required_controls must include ${c}`
      );
    }
    for (const c of profile.required_controls) {
      assert.ok(
        KNOWN_CONTROLS.has(c),
        `control "${c}" must be a member of KNOWN_CONTROLS (no dangling control)`
      );
    }
  });

  it('listAvailableProfiles includes gdpr', () => {
    const profiles = listAvailableProfiles(tmpRoot);
    assert.ok(Array.isArray(profiles), 'listAvailableProfiles returns an array');
    assert.ok(profiles.includes('gdpr'), 'available profiles must include gdpr');
  });

  it('effectiveControls activates the gdpr controls when gdpr is active', () => {
    const controls = effectiveControls(tmpRoot);
    for (const c of EXPECTED_CONTROLS) {
      assert.ok(
        controls.has(c),
        `effectiveControls must contain ${c} when gdpr is active`
      );
    }
  });

  it('isControlEnabled does not throw for the gdpr controls', () => {
    for (const c of EXPECTED_CONTROLS) {
      const enabled = isControlEnabled(tmpRoot, c);
      assert.strictEqual(
        typeof enabled,
        'boolean',
        `isControlEnabled(${c}) returns a boolean (no Unknown control throw)`
      );
      assert.strictEqual(enabled, true, `${c} should be enabled when gdpr active`);
    }
  });

  it('unknown-profile call returns null (guard against filename typos)', () => {
    assert.strictEqual(loadProfile(tmpRoot, 'nope'), null);
  });
});

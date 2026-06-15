/**
 * CTOC Runtime Environment Mode Tests
 *
 * Verifies the `general.environment` (ask | dev | staging | prod) behavior
 * profile that tunes CTOC's OWN runtime — resolution order, per-environment
 * profiles, backward compatibility, the prompt signal, and the load-bearing
 * safety invariant that no profile may weaken a human gate.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const settings = require('../src/lib/settings.js');
const {
  SETTINGS_SCHEMA,
  ENVIRONMENT_PROFILES,
  loadSettings,
  getEnvironment,
  getEnvironmentProfile,
  needsEnvironmentPrompt
} = settings;

// Write a raw .ctoc/settings.json into a fresh temp dir and return its path.
function withSettings(raw) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-env-'));
  if (raw !== undefined) {
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.json'), JSON.stringify(raw, null, 2));
  }
  return dir;
}

// Look a setting up in the schema (for option/default validation).
function schemaSetting(category, key) {
  return (SETTINGS_SCHEMA[category]?.settings || []).find(s => s.key === key) || null;
}

describe('Environment mode — option surface', () => {
  it('exposes `environment` as a select in the general category', () => {
    const s = schemaSetting('general', 'environment');
    assert.ok(s, 'general.environment must exist in the schema');
    assert.equal(s.type, 'select');
    assert.deepEqual(s.options, ['ask', 'dev', 'staging', 'prod']);
    assert.equal(s.default, 'ask', 'default must be ask (prompt, no profile)');
    assert.ok(s.options.includes(s.default), 'select default must be a listed option');
  });

  it('defines a profile for every selectable environment', () => {
    for (const env of schemaSetting('general', 'environment').options) {
      assert.ok(env in ENVIRONMENT_PROFILES, `missing profile for ${env}`);
    }
  });

  it('ask is the empty profile (changes nothing)', () => {
    assert.deepEqual(ENVIRONMENT_PROFILES.ask, {});
  });
});

describe('Environment mode — resolution order', () => {
  const dirs = [];
  const mk = (raw) => { const d = withSettings(raw); dirs.push(d); return d; };
  after(() => dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

  it('no file → ask → values equal schema defaults (backward compatible)', () => {
    const d = mk(undefined);
    const s = loadSettings(d);
    assert.equal(s.general.environment, 'ask');
    assert.equal(s.workflow.enforcementMode, 'strict');
    assert.equal(s.git.commitAndPush, true);
    assert.equal(needsEnvironmentPrompt(d), true);
  });

  it('a settings file without `environment` resolves identically to defaults', () => {
    const d = mk({ general: { timezone: 'Europe/Berlin' }, agents: { defaultModel: 'sonnet' } });
    const s = loadSettings(d);
    assert.equal(s.workflow.enforcementMode, 'strict'); // unchanged
    assert.equal(s.git.commitAndPush, true);            // unchanged
    assert.equal(s.general.timezone, 'Europe/Berlin');  // explicit kept
    assert.equal(s.agents.defaultModel, 'sonnet');      // explicit kept
  });

  it('dev profile applies when chosen and nothing explicit overrides it', () => {
    const d = mk({ general: { environment: 'dev' } });
    const s = loadSettings(d);
    assert.equal(s.workflow.enforcementMode, 'soft');
    assert.equal(s.git.commitAndPush, false);
    assert.equal(s.git.autoSync, false);
  });

  it('explicit user setting beats the environment profile', () => {
    // dev would force enforcementMode 'soft'; the explicit value must win.
    const d = mk({ general: { environment: 'dev' }, workflow: { enforcementMode: 'strict' } });
    const s = loadSettings(d);
    assert.equal(s.workflow.enforcementMode, 'strict');
  });

  it('an explicit `false` is honored over a profile (nullish, not falsy, merge)', () => {
    // prod sets commitAndPush true; an explicit false must survive.
    const d = mk({ general: { environment: 'prod' }, git: { commitAndPush: false } });
    assert.equal(loadSettings(d).git.commitAndPush, false);
  });

  it('staging and prod profiles resolve as specified', () => {
    const stg = loadSettings(mk({ general: { environment: 'staging' } }));
    assert.equal(stg.workflow.enforcementMode, 'strict');
    assert.equal(stg.git.commitAndPush, false);
    assert.equal(stg.workflow.autoMoveToReview, true);

    const prod = loadSettings(mk({ general: { environment: 'prod' } }));
    assert.equal(prod.git.commitAndPush, true);
    assert.equal(prod.privacy.showCostEstimates, false);
    assert.equal(prod.agents.defaultModel, 'opus');
  });

  it('an unknown environment value falls back to ask (no profile)', () => {
    const d = mk({ general: { environment: 'bogus' } });
    assert.equal(getEnvironment(d), 'ask');
    assert.equal(loadSettings(d).workflow.enforcementMode, 'strict');
  });

  it('needsEnvironmentPrompt is false once a real environment is chosen', () => {
    assert.equal(needsEnvironmentPrompt(mk({ general: { environment: 'prod' } })), false);
  });
});

describe('Environment mode — safety invariant (human gates never weakened)', () => {
  it('no profile sets requireReviewGate=false or enforcementMode=off', () => {
    for (const [env, profile] of Object.entries(ENVIRONMENT_PROFILES)) {
      assert.notEqual(profile.workflow?.requireReviewGate, false,
        `${env} must not disable the review gate`);
      assert.notEqual(profile.workflow?.enforcementMode, 'off',
        `${env} must not turn enforcement off`);
    }
  });

  it('requireReviewGate resolves true in every environment', () => {
    const dirs = [];
    for (const env of ['ask', 'dev', 'staging', 'prod']) {
      const d = withSettings({ general: { environment: env } });
      dirs.push(d);
      assert.equal(loadSettings(d).workflow.requireReviewGate, true, `${env} keeps the review gate`);
    }
    dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  });
});

describe('Environment mode — profiles only name real, valid settings', () => {
  it('every profile key maps to a real schema setting with a valid value', () => {
    for (const [env, profile] of Object.entries(ENVIRONMENT_PROFILES)) {
      for (const [category, vals] of Object.entries(profile)) {
        assert.ok(SETTINGS_SCHEMA[category], `${env}: unknown category ${category}`);
        for (const [key, value] of Object.entries(vals)) {
          const s = schemaSetting(category, key);
          assert.ok(s, `${env}: ${category}.${key} is not a real setting`);
          if (s.type === 'select') {
            assert.ok(s.options.includes(value),
              `${env}: ${category}.${key}=${value} is not a valid option`);
          }
          if (s.type === 'toggle') {
            assert.equal(typeof value, 'boolean', `${env}: ${category}.${key} must be boolean`);
          }
        }
      }
    }
  });

  it('getEnvironmentProfile returns a fresh, mutation-safe copy', () => {
    const a = getEnvironmentProfile('dev');
    a.workflow.enforcementMode = 'mutated';
    assert.equal(ENVIRONMENT_PROFILES.dev.workflow.enforcementMode, 'soft', 'source profile untouched');
  });
});

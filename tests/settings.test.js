/**
 * Settings Management Tests
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  SETTINGS_TABS,
  SETTINGS_SCHEMA,
  loadSettings,
  saveSettings,
  getSetting,
  setSetting,
  readRawSettings,
  getCategorySettings,
  toggleSetting,
  getCategorySchema,
  getSettingsTabs,
  getEnvironment,
  needsEnvironmentPrompt
} = require('../src/lib/settings.js');

// Create a temporary test directory
let testDir;

function setup() {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
}

function cleanup() {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Test SETTINGS_TABS structure
function testSettingsTabs() {
  assert.ok(Array.isArray(SETTINGS_TABS), 'SETTINGS_TABS is an array');
  assert.ok(SETTINGS_TABS.length > 0, 'SETTINGS_TABS has items');

  // Check each tab has required properties
  for (const tab of SETTINGS_TABS) {
    assert.ok(tab.id, 'Tab has id');
    assert.ok(tab.name, 'Tab has name');
  }

  // Check expected tabs exist
  const tabIds = SETTINGS_TABS.map(t => t.id);
  assert.ok(tabIds.includes('general'), 'Has general tab');
  assert.ok(tabIds.includes('agents'), 'Has agents tab');
  assert.ok(tabIds.includes('workflow'), 'Has workflow tab');
  assert.ok(tabIds.includes('learning'), 'Has learning tab');
  assert.ok(tabIds.includes('git'), 'Has git tab');
  assert.ok(tabIds.includes('privacy'), 'Has privacy tab');

  console.log('# SETTINGS_TABS structure');
}

// Test SETTINGS_SCHEMA structure
function testSettingsSchema() {
  assert.ok(typeof SETTINGS_SCHEMA === 'object', 'SETTINGS_SCHEMA is an object');

  // ADDITION 10 — make this function non-vacuous on an empty schema.
  //
  // `typeof {} === 'object'` passes, and the Object.entries loop below never
  // executes on `{}` — so on an empty schema this whole function asserted NOTHING
  // about the schema. That is vacuity in the strict sense, not mere weakness.
  //
  // Contract, sourced OUTSIDE this assertion: testSettingsTabs in this same file
  // already requires SETTINGS_TABS to contain the ids general, agents, workflow,
  // learning, git and privacy. The settings screen renders each tab against its
  // schema category, so the schema must carry a category for every tab the file
  // already requires. CLAUDE.md independently documents general.environment as a
  // live setting resolved by src/lib/settings.js.
  //
  // What newly FAILS: an empty or truncated schema — a bad merge, a config
  // regression, a refactor dropping a category — which today passes while leaving
  // settings tabs rendering nothing.
  for (const tab of SETTINGS_TABS) {
    assert.ok(SETTINGS_SCHEMA[tab.id], `SETTINGS_SCHEMA must carry a category for tab '${tab.id}'`);
  }
  assert.ok(
    SETTINGS_SCHEMA.general.settings.some(s => s.key === 'environment'),
    'general must carry the documented `environment` setting'
  );

  // Check each category has required structure
  for (const [category, schema] of Object.entries(SETTINGS_SCHEMA)) {
    assert.ok(schema.label, `Category ${category} has label`);
    assert.ok(Array.isArray(schema.settings), `Category ${category} has settings array`);

    // Check each setting has required properties
    for (const setting of schema.settings) {
      assert.ok(setting.key, `Setting has key in ${category}`);
      assert.ok(setting.label, `Setting has label in ${category}`);
      assert.ok(setting.type, `Setting has type in ${category}`);
      assert.ok('default' in setting, `Setting has default in ${category}`);
    }
  }

  console.log('# SETTINGS_SCHEMA structure');
}

// Test getSettingsTabs function
function testGetSettingsTabs() {
  const tabs = getSettingsTabs();
  assert.deepStrictEqual(tabs, SETTINGS_TABS, 'getSettingsTabs returns SETTINGS_TABS');
  console.log('# getSettingsTabs()');
}

// Test getCategorySchema function
function testGetCategorySchema() {
  const generalSchema = getCategorySchema('general');
  assert.strictEqual(generalSchema, SETTINGS_SCHEMA.general, 'Returns correct schema for general');

  const agentsSchema = getCategorySchema('agents');
  assert.strictEqual(agentsSchema, SETTINGS_SCHEMA.agents, 'Returns correct schema for agents');

  const nonexistent = getCategorySchema('nonexistent');
  assert.strictEqual(nonexistent, undefined, 'Returns undefined for nonexistent category');

  console.log('# getCategorySchema()');
}

// Test loadSettings with no file (defaults)
function testLoadSettingsDefaults() {
  setup();

  const settings = loadSettings(testDir);

  // Check all categories exist
  assert.ok(settings.general, 'Has general category');
  assert.ok(settings.agents, 'Has agents category');
  assert.ok(settings.workflow, 'Has workflow category');
  assert.ok(settings.learning, 'Has learning category');
  assert.ok(settings.git, 'Has git category');
  assert.ok(settings.privacy, 'Has privacy category');

  // Check some default values
  assert.strictEqual(settings.general.timezone, 'UTC', 'Default timezone is UTC');
  assert.strictEqual(settings.general.syncInterval, 5, 'Default syncInterval is 5');
  assert.strictEqual(settings.general.syncEnabled, true, 'Default syncEnabled is true');
  assert.strictEqual(settings.agents.defaultModel, 'opus', 'Default model is opus');
  assert.strictEqual(settings.agents.maxParallelAgents, 1, 'Default maxParallelAgents is 1');
  assert.strictEqual(settings.workflow.enforcementMode, 'strict', 'Default enforcementMode is strict');
  assert.deepStrictEqual(settings.workflow.escapePhrases, ['skip planning', 'quick fix', 'trivial fix', 'hotfix'], 'Default escapePhrases');

  cleanup();
  console.log('# loadSettings() with defaults');
}

// Test loadSettings with existing file
function testLoadSettingsFromFile() {
  setup();

  // Create .ctoc directory and settings file
  const ctocDir = path.join(testDir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });

  const customSettings = {
    general: {
      timezone: 'America/New_York',
      syncInterval: 10
    },
    agents: {
      defaultModel: 'sonnet'
    }
  };

  fs.writeFileSync(
    path.join(ctocDir, 'settings.json'),
    JSON.stringify(customSettings, null, 2)
  );

  const settings = loadSettings(testDir);

  // Check custom values are loaded
  assert.strictEqual(settings.general.timezone, 'America/New_York', 'Custom timezone loaded');
  assert.strictEqual(settings.general.syncInterval, 10, 'Custom syncInterval loaded');
  assert.strictEqual(settings.agents.defaultModel, 'sonnet', 'Custom defaultModel loaded');

  // Check defaults are applied for missing values
  assert.strictEqual(settings.general.syncEnabled, true, 'Missing syncEnabled gets default');
  assert.strictEqual(settings.agents.maxParallelAgents, 1, 'Missing maxParallelAgents gets default');
  assert.strictEqual(settings.workflow.enforcementMode, 'strict', 'Missing category gets defaults');

  cleanup();
  console.log('# loadSettings() from file');
}

// Test loadSettings with invalid JSON
function testLoadSettingsInvalidJson() {
  setup();

  // Create .ctoc directory and invalid settings file
  const ctocDir = path.join(testDir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });

  fs.writeFileSync(
    path.join(ctocDir, 'settings.json'),
    'this is not valid json'
  );

  // Should not throw, should return defaults
  const settings = loadSettings(testDir);

  assert.strictEqual(settings.general.timezone, 'UTC', 'Falls back to defaults on invalid JSON');

  cleanup();
  console.log('# loadSettings() with invalid JSON');
}

// Test saveSettings
function testSaveSettings() {
  setup();

  const settings = {
    general: {
      timezone: 'Europe/London',
      syncInterval: 15,
      syncEnabled: false
    },
    agents: {
      defaultModel: 'haiku'
    }
  };

  saveSettings(settings, testDir);

  // Check file was created
  const settingsPath = path.join(testDir, '.ctoc', 'settings.json');
  assert.ok(fs.existsSync(settingsPath), 'Settings file was created');

  // Check content
  const savedContent = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.strictEqual(savedContent.general.timezone, 'Europe/London', 'Timezone saved correctly');
  assert.strictEqual(savedContent.general.syncInterval, 15, 'syncInterval saved correctly');
  assert.strictEqual(savedContent.general.syncEnabled, false, 'syncEnabled saved correctly');
  assert.strictEqual(savedContent.agents.defaultModel, 'haiku', 'defaultModel saved correctly');

  cleanup();
  console.log('# saveSettings()');
}

// Test saveSettings creates .ctoc directory if needed
function testSaveSettingsCreatesDirectory() {
  setup();

  const settings = { general: { timezone: 'UTC' } };

  // .ctoc directory should not exist
  const ctocDir = path.join(testDir, '.ctoc');
  assert.ok(!fs.existsSync(ctocDir), '.ctoc does not exist initially');

  saveSettings(settings, testDir);

  // Now it should exist
  assert.ok(fs.existsSync(ctocDir), '.ctoc directory was created');

  cleanup();
  console.log('# saveSettings() creates directory');
}

// Test getSetting
function testGetSetting() {
  setup();

  // Without file, should return defaults
  assert.strictEqual(getSetting('general', 'timezone', testDir), 'UTC', 'Gets default timezone');
  assert.strictEqual(getSetting('agents', 'maxParallelAgents', testDir), 1, 'Gets default maxParallelAgents');

  // Create custom settings
  const ctocDir = path.join(testDir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });
  fs.writeFileSync(
    path.join(ctocDir, 'settings.json'),
    JSON.stringify({ general: { timezone: 'Asia/Tokyo' } })
  );

  assert.strictEqual(getSetting('general', 'timezone', testDir), 'Asia/Tokyo', 'Gets custom timezone');

  // Nonexistent category/key
  assert.strictEqual(getSetting('nonexistent', 'key', testDir), undefined, 'Returns undefined for nonexistent category');
  assert.strictEqual(getSetting('general', 'nonexistent', testDir), undefined, 'Returns undefined for nonexistent key');

  cleanup();
  console.log('# getSetting()');
}

// Test setSetting
function testSetSetting() {
  setup();

  // Set a value
  setSetting('general', 'timezone', 'Pacific/Auckland', testDir);

  // Verify it was saved
  assert.strictEqual(getSetting('general', 'timezone', testDir), 'Pacific/Auckland', 'Value was set and retrieved');

  // Set another value in same category
  setSetting('general', 'syncInterval', 20, testDir);

  // Verify both values are preserved
  assert.strictEqual(getSetting('general', 'timezone', testDir), 'Pacific/Auckland', 'First value preserved');
  assert.strictEqual(getSetting('general', 'syncInterval', testDir), 20, 'Second value set');

  // Set value in different category
  setSetting('agents', 'defaultModel', 'sonnet', testDir);
  assert.strictEqual(getSetting('agents', 'defaultModel', testDir), 'sonnet', 'Value in different category set');

  cleanup();
  console.log('# setSetting()');
}

// Test setSetting creates category if needed
function testSetSettingCreatesCategory() {
  setup();

  // Start with empty settings
  saveSettings({}, testDir);

  // Set value in new category
  setSetting('general', 'timezone', 'UTC', testDir);

  // Verify category was created
  const settings = loadSettings(testDir);
  assert.ok(settings.general, 'Category was created');

  cleanup();
  console.log('# setSetting() creates category');
}

// Test setSetting preserves non-schema top-level blocks (M16 core).
// A raw settings.json may carry blocks CTOC's schema does not know about —
// e.g. `deployment` (read by src/lib/deployment.js) and a future `sync` block.
// setSetting must round-trip the RAW file so these survive an unrelated change.
function testSetSettingPreservesNonSchemaBlocks() {
  setup();

  const ctocDir = path.join(testDir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });
  const deployment = { provider: 'vercel', domain: 'app.example.com', https: true };
  const sync = { remote: 'origin', branch: 'main', intervalMinutes: 15 };
  fs.writeFileSync(
    path.join(ctocDir, 'settings.json'),
    JSON.stringify({
      workflow: { enforcementMode: 'strict' },
      deployment,
      sync
    }, null, 2)
  );

  // Change one in-schema setting.
  setSetting('workflow', 'enforcementMode', 'soft', testDir);

  // Re-read the RAW file — non-schema blocks must be byte-for-byte intact.
  const raw = readRawSettings(testDir);
  assert.deepStrictEqual(raw.deployment, deployment, 'deployment block preserved');
  assert.deepStrictEqual(raw.sync, sync, 'sync block preserved');
  assert.strictEqual(raw.workflow.enforcementMode, 'soft', 'workflow.enforcementMode updated');

  cleanup();
  console.log('# setSetting() preserves non-schema blocks');
}

// Test setSetting on a fresh project writes no phantom keys (M16 edge).
// No settings.json exists; a single setSetting must write ONLY the written
// category/key — no fabricated deployment/sync, no crash.
function testSetSettingFreshProjectNoPhantomKeys() {
  setup();

  // No settings.json on disk.
  setSetting('general', 'timezone', 'UTC', testDir);

  const raw = readRawSettings(testDir);
  assert.deepStrictEqual(Object.keys(raw), ['general'], 'Only the written category exists');
  assert.deepStrictEqual(Object.keys(raw.general), ['timezone'], 'Only the written key exists');
  assert.strictEqual(raw.general.timezone, 'UTC', 'Written value stored');
  assert.strictEqual(raw.deployment, undefined, 'No fabricated deployment block');
  assert.strictEqual(raw.sync, undefined, 'No fabricated sync block');

  cleanup();
  console.log('# setSetting() fresh project has no phantom keys');
}

// Test getCategorySettings
function testGetCategorySettings() {
  setup();

  // Without file, should return defaults for category
  const generalSettings = getCategorySettings('general', testDir);

  assert.strictEqual(generalSettings.timezone, 'UTC', 'Has default timezone');
  assert.strictEqual(generalSettings.syncInterval, 5, 'Has default syncInterval');
  assert.strictEqual(generalSettings.syncEnabled, true, 'Has default syncEnabled');

  // Create custom settings
  const ctocDir = path.join(testDir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });
  fs.writeFileSync(
    path.join(ctocDir, 'settings.json'),
    JSON.stringify({
      general: { timezone: 'Europe/Paris' },
      agents: { defaultModel: 'haiku' }
    })
  );

  const agentSettings = getCategorySettings('agents', testDir);
  assert.strictEqual(agentSettings.defaultModel, 'haiku', 'Has custom defaultModel');
  assert.strictEqual(agentSettings.maxParallelAgents, 1, 'Has default maxParallelAgents');

  // Nonexistent category returns empty object
  const nonexistent = getCategorySettings('nonexistent', testDir);
  assert.deepStrictEqual(nonexistent, {}, 'Returns empty object for nonexistent category');

  cleanup();
  console.log('# getCategorySettings()');
}

// Test toggleSetting
function testToggleSetting() {
  setup();

  // Initial value should be default (true for syncEnabled)
  assert.strictEqual(getSetting('general', 'syncEnabled', testDir), true, 'Initial value is true');

  // Toggle to false
  const newValue1 = toggleSetting('general', 'syncEnabled', testDir);
  assert.strictEqual(newValue1, false, 'Toggle returns new value (false)');
  assert.strictEqual(getSetting('general', 'syncEnabled', testDir), false, 'Value was toggled to false');

  // Toggle back to true
  const newValue2 = toggleSetting('general', 'syncEnabled', testDir);
  assert.strictEqual(newValue2, true, 'Toggle returns new value (true)');
  assert.strictEqual(getSetting('general', 'syncEnabled', testDir), true, 'Value was toggled to true');

  cleanup();
  console.log('# toggleSetting()');
}

// Test toggleSetting with non-boolean starts as falsy
function testToggleSettingNonBoolean() {
  setup();

  // Set a non-boolean value
  setSetting('general', 'syncEnabled', 0, testDir);

  // Toggle should treat 0 as falsy and return true
  const newValue = toggleSetting('general', 'syncEnabled', testDir);
  assert.strictEqual(newValue, true, 'Toggle of falsy value returns true');

  cleanup();
  console.log('# toggleSetting() with non-boolean');
}

// Test setting types in schema
function testSettingTypes() {
  // Verify all expected types are present
  const allTypes = new Set();
  for (const schema of Object.values(SETTINGS_SCHEMA)) {
    for (const setting of schema.settings) {
      allTypes.add(setting.type);
    }
  }

  assert.ok(allTypes.has('string'), 'Has string type');
  assert.ok(allTypes.has('number'), 'Has number type');
  assert.ok(allTypes.has('toggle'), 'Has toggle type');
  assert.ok(allTypes.has('select'), 'Has select type');
  assert.ok(allTypes.has('list'), 'Has list type');

  console.log('# Setting types in schema');
}

// Test select options exist
function testSelectOptions() {
  for (const [category, schema] of Object.entries(SETTINGS_SCHEMA)) {
    for (const setting of schema.settings) {
      if (setting.type === 'select') {
        assert.ok(Array.isArray(setting.options), `${category}.${setting.key} has options array`);
        assert.ok(setting.options.length > 0, `${category}.${setting.key} has at least one option`);
        assert.ok(setting.options.includes(setting.default), `${category}.${setting.key} default is in options`);
      }
    }
  }

  console.log('# Select options validation');
}

// Test list defaults are arrays
function testListDefaults() {
  for (const [category, schema] of Object.entries(SETTINGS_SCHEMA)) {
    for (const setting of schema.settings) {
      if (setting.type === 'list') {
        assert.ok(Array.isArray(setting.default), `${category}.${setting.key} default is an array`);
      }
    }
  }

  console.log('# List defaults validation');
}

// DEFECT 1 (prototype-chain read). getEnvironment used `env in ENVIRONMENT_PROFILES`,
// which walks the prototype chain, so a settings.json declaring an inherited
// Object.prototype name (e.g. "constructor", "toString") as general.environment was
// accepted as a real environment. That silently suppressed the first-run environment
// prompt and let a bogus environment be recorded. The resolver must accept ONLY the
// four own keys of ENVIRONMENT_PROFILES; anything else resolves to 'ask'.
function testGetEnvironmentRejectsPrototypeKeys() {
  setup();

  const ctocDir = path.join(testDir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });

  for (const bogus of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
    fs.writeFileSync(
      path.join(ctocDir, 'settings.json'),
      JSON.stringify({ general: { environment: bogus } })
    );
    assert.strictEqual(
      getEnvironment(testDir),
      'ask',
      `general.environment "${bogus}" is an inherited prototype name, not a real environment — must resolve to 'ask'`
    );
    assert.strictEqual(
      needsEnvironmentPrompt(testDir),
      true,
      `a bogus prototype-name environment ("${bogus}") must NOT suppress the first-run prompt`
    );
  }

  cleanup();
  console.log('# getEnvironment() rejects prototype-chain names');
}

// Regression for DEFECT 1. A valid environment resolves to itself and, for a real
// non-'ask' choice, suppresses the prompt. 'ask' keeps prompting.
function testGetEnvironmentValidResolves() {
  setup();

  const ctocDir = path.join(testDir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });

  for (const env of ['dev', 'staging', 'prod']) {
    fs.writeFileSync(
      path.join(ctocDir, 'settings.json'),
      JSON.stringify({ general: { environment: env } })
    );
    assert.strictEqual(getEnvironment(testDir), env, `valid environment "${env}" resolves to itself`);
    assert.strictEqual(needsEnvironmentPrompt(testDir), false, `a real choice ("${env}") suppresses the prompt`);
  }

  // 'ask' is a real own key that resolves to itself and keeps prompting.
  fs.writeFileSync(
    path.join(ctocDir, 'settings.json'),
    JSON.stringify({ general: { environment: 'ask' } })
  );
  assert.strictEqual(getEnvironment(testDir), 'ask', "'ask' resolves to itself");
  assert.strictEqual(needsEnvironmentPrompt(testDir), true, "'ask' keeps prompting");

  cleanup();
  console.log('# getEnvironment() resolves valid environments');
}

// DEFECT 2 (prototype pollution via setSetting). `raw['__proto__']` is Object.prototype
// (truthy, typeof 'object'), so the old guard fell through and `raw['__proto__'][key] = value`
// wrote onto Object.prototype. setSetting must reject a dangerous __proto__ / constructor /
// prototype category or key and never pollute the global prototype.
function testSetSettingRejectsPrototypePollution() {
  setup();

  const canary = {};

  // Dangerous CATEGORY.
  for (const bad of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(
      () => setSetting(bad, 'polluted', 'x', testDir),
      /category|key|__proto__|constructor|prototype/i,
      `setSetting must reject dangerous category "${bad}"`
    );
    assert.strictEqual({}.polluted, undefined, `Object.prototype not polluted via category "${bad}"`);
    assert.strictEqual(canary.polluted, undefined, `unrelated object not polluted via category "${bad}"`);
  }

  // Dangerous KEY.
  for (const bad of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(
      () => setSetting('general', bad, 'x', testDir),
      /category|key|__proto__|constructor|prototype/i,
      `setSetting must reject dangerous key "${bad}"`
    );
    assert.strictEqual({}.polluted, undefined, `Object.prototype not polluted via key "${bad}"`);
  }

  // The rejections must not have written a settings file that later reads trip on.
  const raw = readRawSettings(testDir);
  assert.strictEqual(raw.polluted, undefined, 'no phantom polluted key persisted');

  cleanup();
  console.log('# setSetting() rejects prototype-pollution category/key');
}

// Regression for DEFECT 2. A normal setSetting still writes and round-trips, and
// getSetting precedence (explicit > profile > default) is unchanged.
function testSetSettingNormalStillWorks() {
  setup();

  // Round-trip a plan_index numeric setting (a non-general category).
  setSetting('plan_index', 'duplicate_threshold', 0.9, testDir);
  assert.strictEqual(getSetting('plan_index', 'duplicate_threshold', testDir), 0.9, 'explicit value round-trips');

  // Precedence: explicit user setting beats the environment profile beats default.
  // dev profile sets workflow.enforcementMode='soft'; default is 'strict'.
  fs.writeFileSync(
    path.join(testDir, '.ctoc', 'settings.json'),
    JSON.stringify({ general: { environment: 'dev' } })
  );
  assert.strictEqual(getSetting('workflow', 'enforcementMode', testDir), 'soft', 'profile beats default');
  setSetting('workflow', 'enforcementMode', 'strict', testDir);
  assert.strictEqual(getSetting('workflow', 'enforcementMode', testDir), 'strict', 'explicit beats profile');
  // A key the profile does not name falls through to its schema default.
  assert.strictEqual(getSetting('agents', 'defaultModel', testDir), 'opus', 'unnamed key uses schema default');

  cleanup();
  console.log('# setSetting() normal path + precedence unchanged');
}

// Run all tests
console.log('\nSettings Management Tests\n');

// R4-B: autoMoveToReview was deleted from the workflow schema (and the staging
// profile). It drove sync.moveToReviewAfterPush, a raw evidence-less rename into
// review/ — both gone. A visible toggle wired to a landmine is a placebo.
function testWorkflowNoAutoMoveToReview() {
  const workflow = SETTINGS_SCHEMA.workflow;
  assert.ok(workflow && Array.isArray(workflow.settings), 'workflow category exists');
  const keys = workflow.settings.map(s => s.key);
  assert.ok(
    !keys.includes('autoMoveToReview'),
    'autoMoveToReview must be GONE from the workflow schema — it was a placebo toggle for a deleted landmine'
  );
  // The default-merged settings must not surface the key either.
  const merged = loadSettings(testDir);
  assert.strictEqual(
    merged.workflow.autoMoveToReview,
    undefined,
    'a fresh project must not resolve any autoMoveToReview value'
  );
  console.log('# workflow schema has no autoMoveToReview (deleted placebo)');
}

setup();
try { testWorkflowNoAutoMoveToReview(); } finally { cleanup(); }

testSettingsTabs();
testSettingsSchema();
testGetSettingsTabs();
testGetCategorySchema();
testLoadSettingsDefaults();
testLoadSettingsFromFile();
testLoadSettingsInvalidJson();
testSaveSettings();
testSaveSettingsCreatesDirectory();
testGetSetting();
testSetSetting();
testSetSettingCreatesCategory();
testSetSettingPreservesNonSchemaBlocks();
testSetSettingFreshProjectNoPhantomKeys();
testGetCategorySettings();
testToggleSetting();
testToggleSettingNonBoolean();
testSettingTypes();
testSelectOptions();
testListDefaults();
testGetEnvironmentRejectsPrototypeKeys();
testGetEnvironmentValidResolves();
testSetSettingRejectsPrototypePollution();
testSetSettingNormalStillWorks();

console.log('\nAll settings tests passed!\n');

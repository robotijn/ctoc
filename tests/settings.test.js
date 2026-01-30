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
  getCategorySettings,
  toggleSetting,
  getCategorySchema,
  getSettingsTabs
} = require('../lib/settings.js');

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

// Run all tests
console.log('\nSettings Management Tests\n');

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
testGetCategorySettings();
testToggleSetting();
testToggleSettingNonBoolean();
testSettingTypes();
testSelectOptions();
testListDefaults();

console.log('\nAll settings tests passed!\n');

/**
 * Settings Management
 * Centralized settings with categories and persistence
 */

const fs = require('fs');
const path = require('path');
const yaml = require('./yaml-lite');

const SETTINGS_TABS = [
  { id: 'general', name: 'General' },
  { id: 'agents', name: 'Agents' },
  { id: 'workflow', name: 'Workflow' },
  { id: 'learning', name: 'Learning' },
  { id: 'git', name: 'Git' },
  { id: 'privacy', name: 'Privacy' }
];

const SETTINGS_SCHEMA = {
  general: {
    label: 'General Settings',
    settings: [
      { key: 'timezone', label: 'Timezone', type: 'string', default: 'UTC' },
      { key: 'syncInterval', label: 'Auto-sync interval (minutes)', type: 'number', default: 5 },
      { key: 'syncEnabled', label: 'Auto-sync enabled', type: 'toggle', default: true },
      { key: 'keyboardLayout', label: 'Keyboard layout', type: 'select', options: ['latin', 'numeric-only'], default: 'latin' }
    ]
  },
  agents: {
    label: 'Agent Settings',
    settings: [
      { key: 'defaultModel', label: 'Default model', type: 'select', options: ['opus', 'sonnet', 'haiku'], default: 'opus' },
      { key: 'maxParallelAgents', label: 'Max parallel agents', type: 'number', default: 1 },
      { key: 'autoPick', label: 'Auto-pick from queue', type: 'toggle', default: true },
      { key: 'timeout', label: 'Agent timeout (seconds)', type: 'number', default: 60 },
      { key: 'tokenBudget', label: 'Token budget per operation', type: 'number', default: 50000 }
    ]
  },
  workflow: {
    label: 'Workflow Settings',
    settings: [
      { key: 'enforcementMode', label: 'Enforcement mode', type: 'select', options: ['strict', 'soft', 'off'], default: 'strict' },
      { key: 'requireReviewGate', label: 'Require review gate', type: 'toggle', default: true },
      { key: 'autoMoveToReview', label: 'Auto-move to review after push', type: 'toggle', default: true },
      { key: 'escapePhrases', label: 'Escape phrases', type: 'list', default: ['skip planning', 'quick fix', 'trivial fix', 'hotfix'] }
    ]
  },
  learning: {
    label: 'Learning Settings',
    settings: [
      { key: 'crossAgentLearning', label: 'Cross-agent learning', type: 'toggle', default: true },
      { key: 'learningMode', label: 'Learning mode', type: 'select', options: ['cto_gated', 'auto', 'manual'], default: 'cto_gated' },
      { key: 'autoPublish', label: 'Auto-publish learnings', type: 'toggle', default: true },
      { key: 'critiqueLoops', label: 'Self-critique iterations', type: 'number', default: 5 }
    ]
  },
  git: {
    label: 'Git Settings',
    settings: [
      { key: 'coAuthor', label: 'Co-author', type: 'string', default: 'Claude Opus 4.5 <noreply@anthropic.com>' },
      { key: 'autoSync', label: 'Auto-sync git', type: 'toggle', default: true },
      { key: 'forceWithLease', label: 'Safe force push', type: 'toggle', default: true },
      { key: 'commitAndPush', label: 'Auto-push after commit', type: 'toggle', default: true }
    ]
  },
  privacy: {
    label: 'Privacy Settings',
    settings: [
      { key: 'cachingEnabled', label: 'Caching enabled', type: 'toggle', default: true },
      { key: 'structureTtl', label: 'Structure cache TTL', type: 'string', default: '24h' },
      { key: 'insightsTtl', label: 'Insights cache TTL', type: 'string', default: '1h' },
      { key: 'gitignoreCache', label: 'Add cache to .gitignore', type: 'toggle', default: true },
      { key: 'redactSecrets', label: 'Redact secrets in logs', type: 'toggle', default: true },
      { key: 'showCostEstimates', label: 'Show cost estimates', type: 'toggle', default: true }
    ]
  }
};

// Settings file path
function getSettingsPath(projectPath = process.cwd()) {
  return path.join(projectPath, '.ctoc', 'settings.json');
}

// Load settings (with defaults)
function loadSettings(projectPath = process.cwd()) {
  const settingsPath = getSettingsPath(projectPath);
  let settings = {};

  // Load from file if exists
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      // Invalid JSON, use defaults
    }
  }

  // Merge with defaults
  const merged = {};
  for (const [category, schema] of Object.entries(SETTINGS_SCHEMA)) {
    merged[category] = {};
    for (const setting of schema.settings) {
      merged[category][setting.key] = settings[category]?.[setting.key] ?? setting.default;
    }
  }

  return merged;
}

// Save settings
function saveSettings(settings, projectPath = process.cwd()) {
  const settingsDir = path.join(projectPath, '.ctoc');
  const settingsPath = getSettingsPath(projectPath);

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// Get a single setting
function getSetting(category, key, projectPath = process.cwd()) {
  const settings = loadSettings(projectPath);
  return settings[category]?.[key];
}

// Set a single setting
function setSetting(category, key, value, projectPath = process.cwd()) {
  const settings = loadSettings(projectPath);
  if (!settings[category]) settings[category] = {};
  settings[category][key] = value;
  saveSettings(settings, projectPath);
}

// Get settings for a category
function getCategorySettings(category, projectPath = process.cwd()) {
  const settings = loadSettings(projectPath);
  return settings[category] || {};
}

// Toggle a boolean setting
function toggleSetting(category, key, projectPath = process.cwd()) {
  const current = getSetting(category, key, projectPath);
  setSetting(category, key, !current, projectPath);
  return !current;
}

// Get schema for a category
function getCategorySchema(category) {
  return SETTINGS_SCHEMA[category];
}

// Export settings tabs
function getSettingsTabs() {
  return SETTINGS_TABS;
}

module.exports = {
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
};

/**
 * Settings Management
 * Centralized settings with categories and persistence
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_TABS = [
  { id: 'general', name: 'General' },
  { id: 'agents', name: 'Agents' },
  { id: 'workflow', name: 'Workflow' },
  { id: 'learning', name: 'Learning' },
  { id: 'git', name: 'Git' },
  { id: 'privacy', name: 'Privacy' },
  { id: 'deployment', name: 'Deployment' }
];

const SETTINGS_SCHEMA = {
  general: {
    label: 'General Settings',
    settings: [
      // `environment` selects a CTOC runtime behavior profile (see ENVIRONMENT_PROFILES).
      // Default 'ask' applies NO profile (identical to per-setting defaults) and signals
      // the plugin to prompt the user to choose dev/staging/prod on first use.
      { key: 'environment', label: 'CTOC environment', type: 'select', options: ['ask', 'dev', 'staging', 'prod'], default: 'ask' },
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
  },
  deployment: {
    label: 'Deployment Settings',
    settings: [
      { key: 'enabled', label: 'Deployment pipeline enabled', type: 'toggle', default: false },
      { key: 'developmentEnabled', label: 'Development environment', type: 'toggle', default: false },
      { key: 'stagingEnabled', label: 'Staging environment', type: 'toggle', default: false },
      { key: 'productionEnabled', label: 'Production environment', type: 'toggle', default: false },
      { key: 'productionApproval', label: 'Production approval', type: 'select', options: ['auto', 'manual'], default: 'manual' },
      { key: 'autoRollback', label: 'Auto-rollback on failure', type: 'toggle', default: true }
    ]
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CTOC Runtime Environment Profiles
//
//  `general.environment` (ask | dev | staging | prod) selects a behavior profile
//  for CTOC ITSELF — not a deployment target for the user's app. A profile is a
//  sparse set of overrides keyed by <category>.<key>; any key it does not name
//  falls through to the per-setting schema default.
//
//  Resolution order (highest wins):  explicit user setting  >  env profile  >  schema default
//
//  SAFETY INVARIANT (enforced by tests/environment-mode.test.js):
//  No profile may weaken a human gate. `workflow.requireReviewGate` is never set
//  to false and `workflow.enforcementMode` is never set to 'off' by any profile —
//  the four human gates are mandatory in every environment (see CLAUDE.md).
//  'ask' is intentionally empty: it changes nothing and tells the menu to prompt.
// ─────────────────────────────────────────────────────────────────────────────
const ENVIRONMENT_PROFILES = {
  // Not chosen yet — apply nothing, prompt the user.
  ask: {},

  // Fast local iteration. Edits warn instead of block; never auto-push; cost shown.
  dev: {
    workflow: { enforcementMode: 'soft' },
    git: { commitAndPush: false, autoSync: false },
    privacy: { showCostEstimates: true }
  },

  // Rehearse production. Strict enforcement, but push stays manual.
  staging: {
    workflow: { enforcementMode: 'strict', autoMoveToReview: true },
    git: { commitAndPush: false }
  },

  // Locked down. Strict enforcement, auto-push after gates, minimal noise, top model.
  prod: {
    workflow: { enforcementMode: 'strict' },
    git: { commitAndPush: true },
    agents: { defaultModel: 'opus' },
    privacy: { showCostEstimates: false }
  }
};

// Settings file path
function getSettingsPath(projectPath = process.cwd()) {
  return path.join(projectPath, '.ctoc', 'settings.json');
}

// Read the raw settings file (no defaults merged). Returns {} if absent/invalid.
function readRawSettings(projectPath = process.cwd()) {
  const settingsPath = getSettingsPath(projectPath);
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

// The active CTOC environment ('ask' | 'dev' | 'staging' | 'prod').
// Reads the raw file so it never depends on the merge it drives.
function getEnvironment(projectPath = process.cwd()) {
  const env = readRawSettings(projectPath).general?.environment;
  return env && env in ENVIRONMENT_PROFILES ? env : 'ask';
}

// Sparse override map for an environment (safe to mutate by caller — it's fresh).
function getEnvironmentProfile(env) {
  const profile = ENVIRONMENT_PROFILES[env] || {};
  const out = {};
  for (const [cat, vals] of Object.entries(profile)) out[cat] = { ...vals };
  return out;
}

// True when the user has not yet chosen an environment — the plugin should ask.
function needsEnvironmentPrompt(projectPath = process.cwd()) {
  return getEnvironment(projectPath) === 'ask';
}

// Load settings, resolving each value as: explicit user setting > environment
// profile > schema default. The environment is read from the raw file; 'ask'
// (the default) contributes an empty profile, so behavior is unchanged until the
// user opts into dev/staging/prod.
function loadSettings(projectPath = process.cwd()) {
  const settings = readRawSettings(projectPath);
  const profile = ENVIRONMENT_PROFILES[getEnvironment(projectPath)] || {};

  const merged = {};
  for (const [category, schema] of Object.entries(SETTINGS_SCHEMA)) {
    merged[category] = {};
    for (const setting of schema.settings) {
      merged[category][setting.key] =
        settings[category]?.[setting.key] ??
        profile[category]?.[setting.key] ??
        setting.default;
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
  ENVIRONMENT_PROFILES,
  loadSettings,
  saveSettings,
  getSetting,
  setSetting,
  getCategorySettings,
  toggleSetting,
  getCategorySchema,
  getSettingsTabs,
  readRawSettings,
  getEnvironment,
  getEnvironmentProfile,
  needsEnvironmentPrompt
};

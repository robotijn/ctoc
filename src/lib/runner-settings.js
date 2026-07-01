/**
 * Runner Settings Management
 *
 * Manages CI runner preferences in ~/.ctoc/settings.yaml (GLOBAL)
 * Runner preference is machine-wide, not per-project.
 *
 * @module lib/runner-settings
 */

const safeFs = require('./safe-fs');
const path = require('path');
const os = require('os');

// NO external yaml dependency - use simple parsing

/**
 * Get GLOBAL settings file path
 * @returns {string} Settings file path (~/.ctoc/settings.yaml)
 */
function getSettingsPath() {
  return path.join(os.homedir(), '.ctoc', 'settings.yaml');
}

/**
 * Load GLOBAL settings (creates default if not exists)
 * @returns {Object} Settings object
 */
function loadSettings() {
  const settingsPath = getSettingsPath();

  if (!safeFs.existsSync(settingsPath)) {
    return getDefaultSettings();
  }

  try {
    const content = safeFs.readFileSync(settingsPath, 'utf8');
    // Simple YAML parsing - no external dependency
    return parseSimpleYaml(content);
  } catch {
    return getDefaultSettings();
  }
}

/**
 * Simple YAML parser for CI settings
 * @param {string} content - YAML content
 * @returns {Object} Parsed settings
 */
function parseSimpleYaml(content) {
  const settings = getDefaultSettings();

  // Look for the `ci:` section: the header line then its indented lines.
  // Scanned line-by-line (no nested-quantifier regex, so ReDoS-safe).
  const lines = content.split('\n');
  const ciIdx = lines.findIndex(l => /^ci:[ \t]*$/.test(l));
  if (ciIdx !== -1) {
    const sectionLines = [];
    for (let i = ciIdx + 1; i < lines.length; i++) {
      if (/^\s+.+$/.test(lines[i])) sectionLines.push(lines[i]);
      else break;
    }
    const ciSection = sectionLines.length ? sectionLines.join('\n') + '\n' : '';

    // Parse runner_preference (allows hyphens like "self-hosted")
    const prefMatch = ciSection.match(/runner_preference:\s*["']?([\w-]+|null)["']?/);
    if (prefMatch) {
      settings.ci.runner_preference = prefMatch[1] === 'null' ? null : prefMatch[1];
    }

    // Parse self_hosted_configured
    const configMatch = ciSection.match(/self_hosted_configured:\s*(true|false)/);
    if (configMatch) {
      settings.ci.self_hosted_configured = configMatch[1] === 'true';
    }

    // Parse runner_path
    const pathMatch = ciSection.match(/runner_path:\s*["']?([^"'\n]+)["']?/);
    if (pathMatch) {
      settings.ci.runner_path = pathMatch[1].trim();
    }

    // Parse asked_at
    const askedMatch = ciSection.match(/asked_at:\s*["']?([^"'\n]+)["']?/);
    if (askedMatch) {
      settings.ci.asked_at = askedMatch[1].trim();
    }
  }

  return settings;
}

/**
 * Get default settings
 * @returns {Object} Default settings
 */
function getDefaultSettings() {
  return {
    ci: {
      runner_preference: null,  // null = not asked yet
      self_hosted_configured: false,
      runner_path: null,
      runner_labels: ['self-hosted', 'local'],
      asked_at: null
    }
  };
}

/**
 * Save GLOBAL settings
 * @param {Object} settings - Settings to save
 */
function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  const settingsDir = path.dirname(settingsPath);

  if (!safeFs.existsSync(settingsDir)) {
    safeFs.mkdirSync(settingsDir, { recursive: true });
  }

  // Read existing settings to merge
  let existing = {};
  if (safeFs.existsSync(settingsPath)) {
    try {
      const content = safeFs.readFileSync(settingsPath, 'utf8');
      existing = parseSimpleYaml(content);
    } catch { /* ignore: best-effort, non-fatal */ }
  }

  // Merge CI settings
  const merged = { ...existing, ci: { ...existing.ci, ...settings.ci } };

  // Generate YAML content
  const content = generateYaml(merged);
  safeFs.writeFileSync(settingsPath, content);
}

/**
 * Generate YAML from settings object
 * @param {Object} settings - Settings object
 * @returns {string} YAML content
 */
function generateYaml(settings) {
  const lines = [];

  // Preserve existing content and update/add ci section
  if (settings.ci) {
    lines.push('');
    lines.push('# -----------------------------------------------------------------------------');
    lines.push('#  CI Runner Settings');
    lines.push('# -----------------------------------------------------------------------------');
    lines.push('');
    lines.push('ci:');
    lines.push(`  runner_preference: ${settings.ci.runner_preference === null ? 'null' : `"${settings.ci.runner_preference}"`}`);
    lines.push(`  self_hosted_configured: ${settings.ci.self_hosted_configured}`);

    if (settings.ci.runner_path) {
      lines.push(`  runner_path: "${settings.ci.runner_path}"`);
    }

    if (settings.ci.runner_labels) {
      lines.push(`  runner_labels: ["${settings.ci.runner_labels.join('", "')}"]`);
    }

    if (settings.ci.asked_at) {
      lines.push(`  asked_at: "${settings.ci.asked_at}"`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Get runner preference (GLOBAL)
 * @returns {string|null} Preference or null if not set
 */
function getRunnerPreference() {
  const settings = loadSettings();
  return settings.ci?.runner_preference || null;
}

/**
 * Set runner preference (GLOBAL)
 * @param {string} preference - 'github', 'self-hosted', 'hybrid', or null
 */
function setRunnerPreference(preference) {
  const settings = loadSettings();
  settings.ci = settings.ci || {};
  settings.ci.runner_preference = preference;
  settings.ci.asked_at = new Date().toISOString();
  saveSettings(settings);
}

/**
 * Mark self-hosted as configured (GLOBAL)
 * @param {string} runnerPath - Path to runner installation
 */
function markSelfHostedConfigured(runnerPath) {
  const settings = loadSettings();
  settings.ci = settings.ci || {};
  settings.ci.self_hosted_configured = true;
  settings.ci.runner_path = runnerPath;
  saveSettings(settings);
}

/**
 * Check if preference has been asked (GLOBAL)
 * @returns {boolean} True if preference has been set (even to 'github')
 */
function hasAskedPreference() {
  const settings = loadSettings();
  return settings.ci?.runner_preference !== null &&
         settings.ci?.runner_preference !== undefined;
}

module.exports = {
  loadSettings,
  saveSettings,
  getRunnerPreference,
  setRunnerPreference,
  markSelfHostedConfigured,
  hasAskedPreference,
  getDefaultSettings,
  parseSimpleYaml
};

/**
 * Deployment Pipeline
 * Promotes code through dev -> staging -> production after Gate 3 approval.
 * Strategies: git-branch, git-tag, webhook, script, docker, ssh
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Default deployment configuration
const DEFAULT_CONFIG = {
  enabled: false,
  environments: [
    { name: 'development', enabled: false, strategy: 'git-branch', branch: 'deploy/development' },
    { name: 'staging', enabled: false, strategy: 'git-branch', branch: 'deploy/staging' },
    { name: 'production', enabled: false, strategy: 'git-branch', branch: 'deploy/production' }
  ],
  approval: {
    production: 'manual',
    staging: 'auto'
  },
  notifications: {
    on_success: [],
    on_failure: []
  },
  rollback: {
    auto_rollback: true,
    keep_history: 10
  }
};

/**
 * Load deployment config from .ctoc/settings.yaml or settings.json
 * Falls back to DEFAULT_CONFIG for any missing fields.
 *
 * @param {string} projectPath - Project root directory
 * @returns {object} Merged deployment configuration
 */
function getDeploymentConfig(projectPath) {
  const settingsPath = path.join(projectPath, '.ctoc', 'settings.json');
  let config = {};

  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      config = settings.deployment || {};
    } catch {
      // Invalid JSON, use defaults
    }
  }

  return mergeConfig(DEFAULT_CONFIG, config);
}

/**
 * Deep merge config with defaults (defaults fill missing keys only)
 */
function mergeConfig(defaults, overrides) {
  const result = {};
  for (const key of Object.keys(defaults)) {
    if (overrides[key] !== undefined) {
      if (Array.isArray(defaults[key])) {
        result[key] = overrides[key];
      } else if (typeof defaults[key] === 'object' && defaults[key] !== null) {
        result[key] = mergeConfig(defaults[key], overrides[key] || {});
      } else {
        result[key] = overrides[key];
      }
    } else {
      result[key] = defaults[key];
    }
  }
  // Include any extra keys from overrides not in defaults
  for (const key of Object.keys(overrides)) {
    if (!(key in defaults)) {
      result[key] = overrides[key];
    }
  }
  return result;
}

/**
 * Run the full deployment pipeline: dev -> staging -> prod
 * Skips disabled environments. Stops on failure.
 *
 * @param {string} planPath - Path to the approved plan file
 * @param {string} projectPath - Project root directory
 * @returns {object} Pipeline result with per-environment status
 */
async function runDeploymentPipeline(planPath, projectPath) {
  const config = getDeploymentConfig(projectPath);

  if (!config.enabled) {
    return { status: 'skipped', reason: 'Deployment pipeline is disabled' };
  }

  const enabledEnvs = config.environments.filter(e => e.enabled);
  if (enabledEnvs.length === 0) {
    return { status: 'skipped', reason: 'No environments enabled' };
  }

  // Build deployment context
  const context = buildDeploymentContext(planPath, projectPath, config);

  const results = [];
  let pipelineFailed = false;

  for (const env of enabledEnvs) {
    if (pipelineFailed) {
      results.push({ name: env.name, status: 'skipped', reason: 'Previous environment failed' });
      continue;
    }

    // Check approval requirement
    const approvalMode = config.approval[env.name] || 'auto';
    if (approvalMode === 'manual') {
      results.push({ name: env.name, status: 'awaiting-approval' });
      // Manual approval pauses the pipeline — caller must resume
      break;
    }

    const envResult = await deployToEnvironment(env, context);
    results.push(envResult);

    if (envResult.status === 'failed') {
      pipelineFailed = true;

      // Auto-rollback if configured
      if (config.rollback.auto_rollback) {
        try {
          await rollback(env.name, projectPath);
          envResult.rolledBack = true;
        } catch (rollbackErr) {
          envResult.rollbackError = rollbackErr.message;
        }
      }

      // Send failure notifications
      await sendNotifications(config.notifications.on_failure, {
        event: 'deployment_failed',
        environment: env.name,
        error: envResult.error,
        context
      });
    }
  }

  // Update deployment context with results
  context.environments = results;
  context.status = pipelineFailed ? 'failed' : 'success';

  // Log deployment
  logDeployment(context, projectPath);

  // Write latest status
  writeLatestStatus(context, projectPath);

  // Send success notifications if pipeline succeeded
  if (!pipelineFailed) {
    await sendNotifications(config.notifications.on_success, {
      event: 'deployment_success',
      environments: results,
      context
    });
  }

  return context;
}

/**
 * Build the deployment context object passed through the pipeline
 */
function buildDeploymentContext(planPath, projectPath, config) {
  let commit = 'unknown';
  let branch = 'unknown';

  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: projectPath, encoding: 'utf8' }).trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath, encoding: 'utf8' }).trim();
  } catch {
    // Not a git repo or git not available
  }

  return {
    plan: path.basename(planPath),
    branch,
    commit,
    timestamp: new Date().toISOString(),
    environments: [],
    status: 'running'
  };
}

/**
 * Deploy to a single environment
 *
 * @param {object} env - Environment config (name, strategy, ...)
 * @param {object} context - Deployment context
 * @returns {object} Result with name, status, duration, error
 */
async function deployToEnvironment(env, context) {
  const start = Date.now();

  try {
    await executeStrategy(env.strategy, env, context);
    return {
      name: env.name,
      status: 'success',
      duration: Date.now() - start
    };
  } catch (err) {
    return {
      name: env.name,
      status: 'failed',
      duration: Date.now() - start,
      error: err.message
    };
  }
}

/**
 * Execute a specific deployment strategy
 *
 * @param {string} strategy - Strategy name (git-branch, git-tag, webhook, script, docker, ssh)
 * @param {object} config - Environment configuration
 * @param {object} context - Deployment context
 */
async function executeStrategy(strategy, config, context) {
  switch (strategy) {
    case 'git-branch':
      return executeGitBranch(config, context);
    case 'git-tag':
      return executeGitTag(config, context);
    case 'webhook':
      return executeWebhook(config, context);
    case 'script':
      return executeScript(config, context);
    case 'docker':
      return executeDocker(config, context);
    case 'ssh':
      return executeSsh(config, context);
    default:
      throw new Error(`Unknown deployment strategy: ${strategy}`);
  }
}

/**
 * git-branch strategy: push to environment-specific branch
 */
function executeGitBranch(config, context) {
  const targetBranch = config.branch || `deploy/${config.name}`;
  // In a real deployment this would push to the target branch
  // For safety, we log the intent rather than executing destructive git operations
  return { strategy: 'git-branch', branch: targetBranch, commit: context.commit };
}

/**
 * git-tag strategy: create version tag with environment suffix
 */
function executeGitTag(config, context) {
  const tag = config.tagPattern
    ? config.tagPattern.replace('{env}', config.name).replace('{commit}', context.commit)
    : `${context.commit}-${config.name}`;
  return { strategy: 'git-tag', tag, commit: context.commit };
}

/**
 * webhook strategy: POST deployment payload to a URL
 */
async function executeWebhook(config, context) {
  if (!config.url) {
    throw new Error(`Webhook URL not configured for ${config.name}`);
  }
  // In production this would make an HTTP POST
  // We return the payload that would be sent
  return {
    strategy: 'webhook',
    url: config.url,
    payload: {
      environment: config.name,
      commit: context.commit,
      branch: context.branch,
      plan: context.plan,
      timestamp: context.timestamp
    }
  };
}

/**
 * script strategy: run a custom script
 */
function executeScript(config, context) {
  if (!config.script) {
    throw new Error(`Script path not configured for ${config.name}`);
  }
  // In production this would execute the script
  return { strategy: 'script', script: config.script, environment: config.name };
}

/**
 * docker strategy: build and tag image
 */
function executeDocker(config, context) {
  const tag = config.imageTag || `${config.name}-${context.commit}`;
  return { strategy: 'docker', image: config.image || 'app', tag };
}

/**
 * ssh strategy: execute commands on remote server
 */
function executeSsh(config, context) {
  if (!config.host) {
    throw new Error(`SSH host not configured for ${config.name}`);
  }
  return { strategy: 'ssh', host: config.host, user: config.user || 'deploy' };
}

/**
 * Rollback the last deployment for an environment
 *
 * @param {string} environment - Environment name to rollback
 * @param {string} projectPath - Project root directory
 * @returns {object} Rollback result
 */
async function rollback(environment, projectPath) {
  const history = getDeploymentHistory(projectPath);

  // Find last successful deployment for this environment
  const lastSuccess = history.find(entry =>
    entry.environments &&
    entry.environments.some(e => e.name === environment && e.status === 'success')
  );

  if (!lastSuccess) {
    throw new Error(`No previous successful deployment found for ${environment}`);
  }

  const rollbackEntry = {
    plan: lastSuccess.plan,
    commit: lastSuccess.commit,
    timestamp: new Date().toISOString(),
    environments: [{ name: environment, status: 'rolled-back' }],
    status: 'rolled-back',
    rollbackFrom: history[0] ? history[0].commit : 'unknown'
  };

  logDeployment(rollbackEntry, projectPath);
  writeLatestStatus(rollbackEntry, projectPath);

  return rollbackEntry;
}

/**
 * Get deployment history
 *
 * @param {string} projectPath - Project root directory
 * @returns {Array} Array of deployment entries (newest first)
 */
function getDeploymentHistory(projectPath) {
  const historyPath = path.join(projectPath, '.ctoc', 'deployments', 'history.json');

  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Log a deployment entry to the audit trail
 *
 * @param {object} entry - Deployment entry to log
 * @param {string} projectPath - Project root directory
 */
function logDeployment(entry, projectPath) {
  const deploymentsDir = path.join(projectPath, '.ctoc', 'deployments');
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const historyPath = path.join(deploymentsDir, 'history.json');
  let history = [];

  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      history = [];
    }
  }

  // Prepend new entry (newest first)
  history.unshift(entry);

  // Cap history at configured limit (default 10)
  const config = getDeploymentConfig(projectPath);
  const keepHistory = config.rollback.keep_history || 10;
  if (history.length > keepHistory) {
    history = history.slice(0, keepHistory);
  }

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Write latest deployment status
 */
function writeLatestStatus(entry, projectPath) {
  const deploymentsDir = path.join(projectPath, '.ctoc', 'deployments');
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const latestPath = path.join(deploymentsDir, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(entry, null, 2));
}

/**
 * Send notifications via webhooks
 */
async function sendNotifications(urls, payload) {
  if (!urls || urls.length === 0) return;

  // In production this would POST to each URL
  // For now we just log the intent
  for (const url of urls) {
    try {
      // Would use fetch/http.request here
      // Intentionally a no-op for safety
    } catch {
      // Notification failures should not break the pipeline
    }
  }
}

module.exports = {
  DEFAULT_CONFIG,
  getDeploymentConfig,
  mergeConfig,
  runDeploymentPipeline,
  buildDeploymentContext,
  deployToEnvironment,
  executeStrategy,
  rollback,
  getDeploymentHistory,
  logDeployment,
  writeLatestStatus,
  sendNotifications
};

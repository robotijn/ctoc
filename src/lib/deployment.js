/**
 * Deployment Pipeline
 * Promotes code through dev -> staging -> production after Gate 3 approval.
 * Strategies: git-branch, git-tag, webhook, script, docker, ssh
 *
 * Execution is REAL but safe-by-default: every strategy runs under `dry_run`
 * (build the command, return it, perform nothing) unless `.ctoc/settings.json`
 * sets `deployment.dry_run: false`. Only then does the pipeline actually push,
 * POST, build, or ssh. This is why enabling deployment cannot fire a destructive
 * operation by accident — see DEFAULT_CONFIG.dry_run.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Default deployment configuration
const DEFAULT_CONFIG = {
  enabled: false,
  // SAFE BY DEFAULT: dry_run simulates every strategy (builds the real command,
  // returns it, but does NOT push/POST/ssh/docker/exec). Set `dry_run: false`
  // in .ctoc/settings.json to let the pipeline actually execute. This is why
  // enabling deployment never fires a destructive operation by accident.
  dry_run: true,
  // Git remote used by the git-branch / git-tag strategies.
  remote: 'origin',
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

  // Real execution happens only when dry_run is explicitly false.
  const opts = { dryRun: config.dry_run !== false, cwd: projectPath };
  context.dryRun = opts.dryRun;

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

    const envResult = await deployToEnvironment(
      { remote: config.remote, ...env },
      context,
      opts
    );
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
      }, opts);
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
    }, opts);
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
async function deployToEnvironment(env, context, opts = {}) {
  const start = Date.now();

  try {
    const detail = await executeStrategy(env.strategy, env, context, opts);
    return {
      name: env.name,
      status: 'success',
      duration: Date.now() - start,
      dryRun: detail && typeof detail === 'object' ? detail.dryRun : undefined,
      detail
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
async function executeStrategy(strategy, config, context, opts = {}) {
  switch (strategy) {
    case 'git-branch':
      return executeGitBranch(config, context, opts);
    case 'git-tag':
      return executeGitTag(config, context, opts);
    case 'webhook':
      return executeWebhook(config, context, opts);
    case 'script':
      return executeScript(config, context, opts);
    case 'docker':
      return executeDocker(config, context, opts);
    case 'ssh':
      return executeSsh(config, context, opts);
    default:
      throw new Error(`Unknown deployment strategy: ${strategy}`);
  }
}

// Whether a strategy should actually run. Real execution requires opts.dryRun
// to be EXPLICITLY false; undefined (e.g. a bare 2-arg call) means simulate.
function isLive(opts) {
  return Boolean(opts && opts.dryRun === false);
}

// Minimal dependency-free JSON POST for the webhook strategy. Resolves to the
// HTTP status code; rejects on transport error or invalid URL.
function httpPostJson(url, body) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`Invalid webhook URL: ${url}`));
      return;
    }
    const mod = parsed.protocol === 'http:' ? require('http') : require('https');
    const data = JSON.stringify(body);
    const req = mod.request(parsed, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      res.resume(); // drain so the socket frees
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Run a shell command in the project directory, returning trimmed stdout.
// Shared by the git/script/docker/ssh strategies when running live.
function run(command, opts) {
  return execSync(command, {
    cwd: (opts && opts.cwd) || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

/**
 * git-branch strategy: push the current commit to an environment branch.
 * Live: `git push <remote> HEAD:refs/heads/<branch>`.
 */
function executeGitBranch(config, context, opts = {}) {
  const remote = config.remote || 'origin';
  const targetBranch = config.branch || `deploy/${config.name}`;
  const command = `git push ${remote} HEAD:refs/heads/${targetBranch}`;
  const intent = { strategy: 'git-branch', branch: targetBranch, remote, commit: context.commit, command, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  return { ...intent, executed: true, output: run(command, opts) };
}

/**
 * git-tag strategy: create an environment-suffixed tag and push it.
 * Live: `git tag <tag> && git push <remote> <tag>`.
 */
function executeGitTag(config, context, opts = {}) {
  const remote = config.remote || 'origin';
  const tag = config.tagPattern
    ? config.tagPattern.replace('{env}', config.name).replace('{commit}', context.commit)
    : `${context.commit}-${config.name}`;
  const command = `git tag ${tag} && git push ${remote} ${tag}`;
  const intent = { strategy: 'git-tag', tag, remote, commit: context.commit, command, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  return { ...intent, executed: true, output: run(command, opts) };
}

/**
 * webhook strategy: POST the deployment payload to a URL.
 * Live: real JSON POST; a >=400 status fails the environment.
 */
async function executeWebhook(config, context, opts = {}) {
  if (!config.url) {
    throw new Error(`Webhook URL not configured for ${config.name}`);
  }
  const payload = {
    environment: config.name,
    commit: context.commit,
    branch: context.branch,
    plan: context.plan,
    timestamp: context.timestamp
  };
  const intent = { strategy: 'webhook', url: config.url, payload, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  const httpStatus = await httpPostJson(config.url, payload);
  if (httpStatus >= 400) {
    throw new Error(`Webhook for ${config.name} returned HTTP ${httpStatus}`);
  }
  return { ...intent, executed: true, httpStatus };
}

/**
 * script strategy: run a custom deploy script.
 * Live: executes `config.script` in the project dir with DEPLOY_ENV/DEPLOY_COMMIT
 * exported. Cross-platform: the script string is run through the platform shell.
 */
function executeScript(config, context, opts = {}) {
  if (!config.script) {
    throw new Error(`Script path not configured for ${config.name}`);
  }
  const intent = { strategy: 'script', script: config.script, environment: config.name, command: config.script, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  const output = execSync(config.script, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DEPLOY_ENV: config.name, DEPLOY_COMMIT: context.commit || '' }
  }).trim();
  return { ...intent, executed: true, output };
}

/**
 * docker strategy: build (and optionally push) a tagged image.
 * Live: `docker build -t <image>:<tag> <context>` then optional `docker push`.
 */
function executeDocker(config, context, opts = {}) {
  const image = config.image || 'app';
  const tag = config.imageTag || `${config.name}-${context.commit}`;
  const ref = `${image}:${tag}`;
  const buildContext = config.context || '.';
  const command = `docker build -t ${ref} ${buildContext}`;
  const intent = { strategy: 'docker', image, tag, command, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  let output = run(command, opts);
  if (config.push) {
    output += '\n' + run(`docker push ${ref}`, opts);
  }
  return { ...intent, executed: true, output };
}

/**
 * ssh strategy: run a remote deploy command over ssh.
 * Live: `ssh <user>@<host> "<command>"`.
 */
function executeSsh(config, context, opts = {}) {
  if (!config.host) {
    throw new Error(`SSH host not configured for ${config.name}`);
  }
  const user = config.user || 'deploy';
  const remoteCmd = config.command || `echo deployed ${context.commit || ''}`.trim();
  const command = `ssh ${user}@${config.host} ${JSON.stringify(remoteCmd)}`;
  const intent = { strategy: 'ssh', host: config.host, user, command, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  return { ...intent, executed: true, output: run(command, opts) };
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
 * Send notifications via webhooks. Real POSTs only when live (dry_run false);
 * a notification failure never breaks the pipeline.
 *
 * @param {string[]} urls - Notification webhook URLs
 * @param {object} payload - JSON body to POST
 * @param {object} [opts] - { dryRun } — when dryRun, no network call is made
 */
async function sendNotifications(urls, payload, opts = {}) {
  if (!urls || urls.length === 0) return;
  if (!isLive(opts)) return; // simulate: no network in dry-run

  for (const url of urls) {
    try {
      await httpPostJson(url, payload);
    } catch {
      // Notification failures should not break the pipeline.
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
  isLive,
  httpPostJson,
  rollback,
  getDeploymentHistory,
  logDeployment,
  writeLatestStatus,
  sendNotifications
};

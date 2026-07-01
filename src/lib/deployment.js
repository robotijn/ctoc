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

const safeFs = require('./safe-fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

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
  // Deploy TARGETS only. Development/local is where you work — the source of the
  // approved commit — never a target you "deploy to". The promotion path falls
  // out of which targets are enabled plus the approval gate:
  //   • staging enabled only            → work → staging
  //   • production enabled only         → work → production (direct)
  //   • both, production: manual        → work → staging → (review) → production
  environments: [
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

  if (safeFs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(safeFs.readFileSync(settingsPath, 'utf8'));
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
 * @returns {Promise<object>} Pipeline result with per-environment status
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
 * @returns {Promise<object>} Result with name, status, duration, error
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
async function httpPostJson(url, body, opts = {}) {
  const parsed = await assertSafeWebhookUrl(url, opts.allowInternal === true);
  return new Promise((resolve, reject) => {
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

// Reject any deployment config value that could break out of a single argument.
// We now execute via execFileSync (no shell), but validating here gives clear
// errors and blocks option/argument injection (e.g. a value starting with "-").
const SHELL_META = /[;&|`$(){}<>\\\n\r'"\s]/;
function assertSafeArg(value, label) {
  const s = String(value == null ? '' : value);
  if (s === '' || SHELL_META.test(s) || s.startsWith('-')) {
    throw new Error(`Unsafe ${label} for deployment: ${JSON.stringify(value)}`);
  }
  return s;
}

// Mask secret-looking values so tokens/keys never surface in returned intents.
function maskSecrets(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/(--?(?:token|secret|key|password|pass|credential|api[-_]?key)[=: ]+)(\S+)/gi, '$1***');
}

// Run a program WITHOUT a shell so config-derived arguments cannot inject
// commands (OWASP/Snyk: prefer execFile + argument array over exec).
function runFile(file, args, opts) {
  return execFileSync(file, args, {
    cwd: (opts && opts.cwd) || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

// SSRF guard: a webhook must be http(s) and must not resolve to a loopback,
// private (RFC1918), link-local (incl. the 169.254.169.254 cloud-metadata IP),
// or unspecified address. Override with deployment.allow_internal_webhooks: true.
function isBlockedAddress(ip) {
  const a = String(ip).replace(/^::ffff:/i, '');
  if (a === '0.0.0.0' || a === '::' || a === '::1') return true;
  if (/^127\./.test(a)) return true;
  if (/^10\./.test(a)) return true;
  if (/^192\.168\./.test(a)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
  if (/^169\.254\./.test(a)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(a)) return true; // IPv6 unique-local
  if (/^fe80:/i.test(a)) return true;             // IPv6 link-local
  return false;
}
async function assertSafeWebhookUrl(url, allowInternal) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`Invalid webhook URL: ${url}`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Webhook URL must use http or https: ${url}`);
  }
  if (allowInternal) return parsed;
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`Webhook blocked: internal host ${host} (set deployment.allow_internal_webhooks: true to override)`);
  }
  const net = require('net');
  let addrs;
  if (net.isIP(host)) {
    addrs = [host];
  } else {
    try { addrs = (await require('dns').promises.lookup(host, { all: true })).map((r) => r.address); }
    catch { throw new Error(`Webhook host did not resolve: ${host}`); }
  }
  for (const a of addrs) {
    if (isBlockedAddress(a)) {
      throw new Error(`Webhook blocked: ${host} resolves to non-public address ${a} (set deployment.allow_internal_webhooks: true to override)`);
    }
  }
  return parsed;
}

/**
 * git-branch strategy: push the current commit to an environment branch.
 * Live: `git push <remote> HEAD:refs/heads/<branch>`.
 */
function executeGitBranch(config, context, opts = {}) {
  const remote = config.remote || 'origin';
  const targetBranch = config.branch || `deploy/${config.name}`;
  const command = maskSecrets(`git push ${remote} HEAD:refs/heads/${targetBranch}`);
  const intent = { strategy: 'git-branch', branch: targetBranch, remote, commit: context.commit, command, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  const safeRemote = assertSafeArg(remote, 'git remote');
  const safeBranch = assertSafeArg(targetBranch, 'git branch');
  return { ...intent, executed: true, output: runFile('git', ['push', safeRemote, `HEAD:refs/heads/${safeBranch}`], opts) };
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
  const command = maskSecrets(`git tag ${tag} && git push ${remote} ${tag}`);
  const intent = { strategy: 'git-tag', tag, remote, commit: context.commit, command, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  const safeRemote = assertSafeArg(remote, 'git remote');
  const safeTag = assertSafeArg(tag, 'git tag');
  runFile('git', ['tag', safeTag], opts);
  const output = runFile('git', ['push', safeRemote, safeTag], opts);
  return { ...intent, executed: true, output };
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
  const httpStatus = await httpPostJson(config.url, payload, { allowInternal: config.allow_internal_webhooks === true });
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
  const cwd = opts.cwd || process.cwd();
  const intent = { strategy: 'script', script: maskSecrets(config.script), environment: config.name, command: maskSecrets(config.script), dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  // Run a deploy SCRIPT FILE confined to the project — never an arbitrary inline
  // shell string. execFileSync (no shell) means config cannot inject commands.
  const projectRoot = path.resolve(cwd);
  const scriptPath = path.resolve(cwd, config.script);
  if (scriptPath !== projectRoot && !scriptPath.startsWith(projectRoot + path.sep)) {
    throw new Error(`Deploy script must live inside the project: ${config.script}`);
  }
  if (!safeFs.existsSync(scriptPath) || !safeFs.statSync(scriptPath).isFile()) {
    throw new Error(`Deploy script not found: ${config.script}`);
  }
  // Pick the interpreter by extension and pass the script as a single argument
  // (no shell), so it stays usable cross-platform without ever shelling out.
  const ext = path.extname(scriptPath).toLowerCase();
  let file = scriptPath;
  let args = [];
  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') { file = process.execPath; args = [scriptPath]; }
  else if (ext === '.sh' || ext === '.bash') { file = 'sh'; args = [scriptPath]; }
  else if (ext === '.py') { file = 'python3'; args = [scriptPath]; }
  const output = execFileSync(file, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
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
  const command = maskSecrets(`docker build -t ${ref} ${buildContext}`);
  const intent = { strategy: 'docker', image, tag, command, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  const safeImage = assertSafeArg(image, 'docker image');
  const safeTag = assertSafeArg(tag, 'docker tag');
  const safeRef = `${safeImage}:${safeTag}`;
  const safeContext = assertSafeArg(buildContext, 'docker build context');
  let output = runFile('docker', ['build', '-t', safeRef, safeContext], opts);
  if (config.push) {
    output += '\n' + runFile('docker', ['push', safeRef], opts);
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
  const command = maskSecrets(`ssh ${user}@${config.host} ${JSON.stringify(remoteCmd)}`);
  const intent = { strategy: 'ssh', host: config.host, user, command, dryRun: !isLive(opts) };
  if (!isLive(opts)) return intent;
  const safeUser = assertSafeArg(user, 'ssh user');
  const safeHost = assertSafeArg(config.host, 'ssh host');
  // remoteCmd is passed as a SINGLE argument; with execFileSync there is no
  // local shell, so it executes only on the remote host (operator's own command).
  return { ...intent, executed: true, output: runFile('ssh', [`${safeUser}@${safeHost}`, remoteCmd], opts) };
}

/**
 * Rollback the last deployment for an environment
 *
 * @param {string} environment - Environment name to rollback
 * @param {string} projectPath - Project root directory
 * @returns {Promise<object>} Rollback result
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

  if (!safeFs.existsSync(historyPath)) {
    return [];
  }

  try {
    return JSON.parse(safeFs.readFileSync(historyPath, 'utf8'));
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
  safeFs.mkdirSync(deploymentsDir, { recursive: true });

  const historyPath = path.join(deploymentsDir, 'history.json');
  let history = [];

  if (safeFs.existsSync(historyPath)) {
    try {
      history = JSON.parse(safeFs.readFileSync(historyPath, 'utf8'));
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

  safeFs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Write latest deployment status
 */
function writeLatestStatus(entry, projectPath) {
  const deploymentsDir = path.join(projectPath, '.ctoc', 'deployments');
  safeFs.mkdirSync(deploymentsDir, { recursive: true });

  const latestPath = path.join(deploymentsDir, 'latest.json');
  safeFs.writeFileSync(latestPath, JSON.stringify(entry, null, 2));
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

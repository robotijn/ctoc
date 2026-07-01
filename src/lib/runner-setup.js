/**
 * Runner Setup Logic
 *
 * Handles GitHub Actions self-hosted runner installation and management.
 * Works for ANY GitHub project, not just CTOC.
 *
 * @module lib/runner-setup
 */

const { execSync } = require('child_process');
const safeFs = require('./safe-fs');
const path = require('path');
const os = require('os');
const https = require('https');

/**
 * Runner preferences
 */
const RUNNER_PREFERENCE = {
  GITHUB: 'github',
  SELF_HOSTED: 'self-hosted',
  HYBRID: 'hybrid',
  NOT_SET: null
};

/**
 * Runner installation status
 */
const INSTALL_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ALREADY_EXISTS: 'already_exists'
};

/**
 * Default runner path
 */
const DEFAULT_RUNNER_PATH = path.join(os.homedir(), 'actions-runner');

/**
 * Get GitHub repo info from current directory
 * @param {string} projectPath - Project path
 * @returns {Object|null} Repo info {owner, repo, url} or null
 */
function getRepoInfo(projectPath = process.cwd()) {
  try {
    const gitConfig = path.join(projectPath, '.git', 'config');
    if (!safeFs.existsSync(gitConfig)) return null;

    const config = safeFs.readFileSync(gitConfig, 'utf8');
    const urlMatch = config.match(/url\s*=\s*.*github\.com[:/]([^/]+)\/([^/\s.]+)/);

    if (urlMatch) {
      const owner = urlMatch[1];
      const repo = urlMatch[2].replace(/\.git$/, '');
      return {
        owner,
        repo,
        url: `https://github.com/${owner}/${repo}`,
        isPublic: null // Will be checked separately
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if repo is public using GitHub API
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @returns {Promise<boolean>} True if public
 */
async function isRepoPublic(owner, repo) {
  return new Promise((resolve) => {
    https.get(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'User-Agent': 'CTOC-Runner-Setup' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(!json.private);
        } catch {
          resolve(false); // Assume private if can't determine
        }
      });
    }).on('error', () => resolve(false));
  });
}

/**
 * Get latest runner version from GitHub
 * @returns {Promise<string>} Version string
 */
async function getLatestRunnerVersion() {
  return new Promise((resolve, reject) => {
    https.get('https://api.github.com/repos/actions/runner/releases/latest', {
      headers: { 'User-Agent': 'CTOC-Runner-Setup' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.tag_name.replace('v', ''));
        } catch (e) {
          reject(new Error('Failed to parse runner version'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Download runner package
 * @param {string} version - Runner version
 * @param {string} targetPath - Download target
 * @returns {Promise<string>} Path to downloaded file
 */
async function downloadRunner(version, targetPath = DEFAULT_RUNNER_PATH) {
  const platform = os.platform();
  const arch = os.arch();

  // Determine download URL
  let runnerOS, runnerArch;
  if (platform === 'linux' || platform === 'darwin') {
    runnerOS = platform === 'darwin' ? 'osx' : 'linux';
    runnerArch = arch === 'arm64' ? 'arm64' : 'x64';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const filename = `actions-runner-${runnerOS}-${runnerArch}-${version}.tar.gz`;
  const url = `https://github.com/actions/runner/releases/download/v${version}/${filename}`;
  const filePath = path.join(targetPath, filename);

  // Create directory
  if (!safeFs.existsSync(targetPath)) {
    safeFs.mkdirSync(targetPath, { recursive: true });
  }

  // Download using curl (more reliable than https module for large files)
  console.log(`Downloading runner v${version}...`);
  execSync(`curl -L -o "${filePath}" "${url}"`, {
    cwd: targetPath,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Extract
  console.log('Extracting...');
  execSync(`tar xzf "${filename}"`, {
    cwd: targetPath,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Cleanup archive
  safeFs.unlinkSync(filePath);

  return targetPath;
}

/**
 * Configure runner with token
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Configuration result
 */
async function configureRunner(options) {
  const {
    repoUrl,
    token,
    name = `local-${os.hostname()}`,
    labels = ['self-hosted', 'local', os.platform()],
    runnerPath = DEFAULT_RUNNER_PATH
  } = options;

  const configScript = path.join(runnerPath, 'config.sh');
  if (!safeFs.existsSync(configScript)) {
    throw new Error('Runner not installed. Run download first.');
  }

  const labelsStr = labels.join(',');
  const cmd = `./config.sh --url "${repoUrl}" --token "${token}" --name "${name}" --labels "${labelsStr}" --unattended`;

  try {
    execSync(cmd, {
      cwd: runnerPath,
      stdio: 'inherit'
    });

    return {
      success: true,
      name,
      labels,
      path: runnerPath
    };
  } catch (error) {
    throw new Error(`Configuration failed: ${error.message}`);
  }
}

/**
 * Check if we have a TTY for sudo
 * @returns {boolean} True if interactive TTY available
 */
function hasTTY() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

/**
 * Install runner as system service
 * @param {string} runnerPath - Runner installation path
 * @returns {Object} Installation result
 */
function installService(runnerPath = DEFAULT_RUNNER_PATH) {
  const svcScript = path.join(runnerPath, 'svc.sh');

  // Check TTY availability for sudo
  if (!hasTTY()) {
    return {
      success: false,
      error: 'No interactive TTY available for sudo. Run this command in an interactive terminal.',
      needsTTY: true
    };
  }

  try {
    console.log('Installing runner service...');
    execSync(`sudo ${svcScript} install`, {
      cwd: runnerPath,
      stdio: 'inherit'
    });

    console.log('Starting runner service...');
    execSync(`sudo ${svcScript} start`, {
      cwd: runnerPath,
      stdio: 'inherit'
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get runner service status
 * @param {string} runnerPath - Runner installation path
 * @returns {Object} Status info
 */
function getServiceStatus(runnerPath = DEFAULT_RUNNER_PATH) {
  const svcScript = path.join(runnerPath, 'svc.sh');

  if (!safeFs.existsSync(svcScript)) {
    return { installed: false, running: false };
  }

  try {
    const output = execSync(`sudo ${svcScript} status 2>&1 || true`, {
      cwd: runnerPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return {
      installed: true,
      running: output.includes('active (running)') || output.includes('started'),
      output: output.trim()
    };
  } catch {
    return { installed: true, running: false };
  }
}

/**
 * Update workflow files for hybrid setup
 * @param {string} projectPath - Project path
 * @param {string} mode - 'self-hosted' or 'hybrid'
 * @returns {Object} Update result
 */
function updateWorkflows(projectPath, mode = 'hybrid') {
  const workflowsDir = path.join(projectPath, '.github', 'workflows');

  if (!safeFs.existsSync(workflowsDir)) {
    return { updated: false, message: 'No workflows directory found' };
  }

  const files = safeFs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  const updated = [];
  const skipped = [];
  const backedUp = [];

  // Pattern matches: ubuntu-latest, ubuntu-22.04, ubuntu-20.04, etc.
  const ubuntuPattern = /runs-on:\s*(ubuntu-(?:latest|\d+\.\d+))/g;

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    let content = safeFs.readFileSync(filePath, 'utf8');

    // Check if already configured for self-hosted
    if (content.includes('self-hosted')) {
      skipped.push({ file, reason: 'already configured' });
      continue;
    }

    // Check if there's anything to replace
    if (!ubuntuPattern.test(content)) {
      skipped.push({ file, reason: 'no ubuntu runs-on found' });
      continue;
    }

    // Backup original
    const backupPath = filePath + '.backup';
    safeFs.writeFileSync(backupPath, content);
    backedUp.push(file);

    // Reset regex
    ubuntuPattern.lastIndex = 0;

    // Replace runs-on with hybrid config (preserves indentation)
    if (mode === 'hybrid') {
      content = content.replace(ubuntuPattern, (match, runner) => {
        return `# Hybrid: uses self-hosted when available, falls back to ${runner}
    runs-on: \${{ vars.RUNNER_LABELS || '${runner}' }}`;
      });
    } else {
      content = content.replace(ubuntuPattern, 'runs-on: [self-hosted, local]');
    }

    safeFs.writeFileSync(filePath, content);
    updated.push(file);
  }

  return { updated, skipped, backedUp, total: files.length };
}

/**
 * Uninstall runner
 * @param {string} runnerPath - Runner installation path
 * @returns {Object} Uninstall result
 */
function uninstallRunner(runnerPath = DEFAULT_RUNNER_PATH) {
  const svcScript = path.join(runnerPath, 'svc.sh');

  try {
    // Stop and uninstall service
    if (safeFs.existsSync(svcScript)) {
      execSync(`sudo ${svcScript} stop || true`, { cwd: runnerPath, stdio: 'pipe' });
      execSync(`sudo ${svcScript} uninstall || true`, { cwd: runnerPath, stdio: 'pipe' });
    }

    // Remove runner configuration
    const configScript = path.join(runnerPath, 'config.sh');
    if (safeFs.existsSync(configScript)) {
      execSync(`./config.sh remove --token DUMMY 2>/dev/null || true`, {
        cwd: runnerPath,
        stdio: 'pipe'
      });
    }

    // Remove directory
    safeFs.rmSync(runnerPath, { recursive: true, force: true });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Format decision exploration menu
 * @param {Object} repoInfo - Repository information
 * @returns {string} Formatted menu
 */
function formatDecisionMenu(repoInfo = null) {
  const lines = [];

  lines.push('');
  lines.push('===============================================================');
  lines.push('                    CI RUNNER PREFERENCE');
  lines.push('===============================================================');
  lines.push('');

  if (repoInfo) {
    lines.push(`Repository: ${repoInfo.owner}/${repoInfo.repo}`);
    lines.push('');
  }

  lines.push('How do you want to run GitHub Actions?');
  lines.push('');

  lines.push('[1] GitHub-Hosted (Recommended for teams)');
  lines.push('    [+] Zero setup - works immediately');
  lines.push('    [+] Clean environment each run');
  lines.push('    [+] GitHub manages security updates');
  lines.push('    [+] Always available, no maintenance');
  lines.push('    [-] 2000 free minutes/month limit (private repos)');
  lines.push('    [-] Queue time during peak hours');
  lines.push('    [-] Can\'t access local resources');
  lines.push('');

  lines.push('[2] Self-Hosted on This Machine');
  lines.push('    [+] Unlimited free runs');
  lines.push('    [+] Instant feedback, no queue');
  lines.push('    [+] Access to local resources (DB, files, GPU)');
  lines.push('    [+] Faster (warm cache, local disk)');
  lines.push('    [-] ~10 minute setup required');
  lines.push('    [-] YOU manage security updates');
  lines.push('    [-] Uses local CPU/memory');
  lines.push('    [-] Must keep machine running');
  lines.push('');

  lines.push('[3] Hybrid (Self-Hosted + GitHub Fallback)');
  lines.push('    [+] Uses local runner when available');
  lines.push('    [+] Falls back to GitHub when offline');
  lines.push('    [+] Best of both worlds');
  lines.push('    [-] More complex workflow configuration');
  lines.push('    [-] Requires maintaining both options');
  lines.push('');

  lines.push('[0] Ask Me Later');
  lines.push('    Skip for now, will be asked again on next CI command');
  lines.push('');

  lines.push('===============================================================');

  return lines.join('\n');
}

/**
 * Format public repo security warning
 * @returns {string} Warning text
 */
function formatPublicRepoWarning() {
  return `
[!] SECURITY WARNING [!]
===============================================================

This repository is PUBLIC. Self-hosted runners on public repos
can be DANGEROUS because:

1. Fork PRs can run arbitrary code on YOUR machine
2. Malicious actors can access your local network
3. Secrets in your environment may be exposed

RECOMMENDATIONS:
- Restrict runner to specific workflows only
- Disable fork PR runs: use 'pull_request_target' not 'pull_request'
- Use ephemeral runners (containers) instead
- Consider GitHub-hosted for public repos

===============================================================
`;
}

/**
 * Format success message
 * @param {Object} config - Runner configuration
 * @returns {string} Success message
 */
function formatSuccess(config) {
  return `
===============================================================
              [OK] RUNNER SETUP COMPLETE
===============================================================

Runner Name:   ${config.name}
Labels:        ${config.labels.join(', ')}
Status:        Running

Your preference has been saved to ~/.ctoc/settings.yaml

Next steps:
1. Your workflows will now use this runner for jobs with:
   runs-on: [self-hosted, local]

2. Check runner status anytime with:
   ctoc ci runner status

3. Manage runner service:
   sudo ~/actions-runner/svc.sh status
   sudo ~/actions-runner/svc.sh stop
   sudo ~/actions-runner/svc.sh start

===============================================================
`;
}

module.exports = {
  RUNNER_PREFERENCE,
  INSTALL_STATUS,
  DEFAULT_RUNNER_PATH,
  hasTTY,
  getRepoInfo,
  isRepoPublic,
  getLatestRunnerVersion,
  downloadRunner,
  configureRunner,
  installService,
  getServiceStatus,
  updateWorkflows,
  uninstallRunner,
  formatDecisionMenu,
  formatPublicRepoWarning,
  formatSuccess
};

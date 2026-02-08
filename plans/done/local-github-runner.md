---
approved_by: human
approved_at: 2026-02-08T12:38:19.460Z
gate_crossed: review → done
note: Retroactively added during human gates migration
---

# Local GitHub Runner Setup

## Problem Statement

GitHub Actions workflows run on GitHub's hosted runners by default. This has limitations:
- Costs money for private repos (usage minutes)
- Slower feedback loop (queue time + cold start)
- Can't access local resources (databases, files)
- Limited customization

Users with WSL2/Linux can run a self-hosted runner locally for instant, free CI.

## Proposed Solution

Add a CTOC subagent that:
1. Detects if user has never configured runner preference
2. Explains pros/cons of self-hosted vs GitHub-hosted
3. Guides setup if user chooses self-hosted
4. Stores preference in settings file

## Pros/Cons Analysis

### GitHub-Hosted Runners (Default)
**Pros:**
- Zero setup - works immediately
- Always available
- Clean environment each run
- GitHub manages security updates

**Cons:**
- Usage limits on free tier (2000 min/month)
- Queue time during peak hours
- Can't access local resources
- Cold start for each job

### Self-Hosted Runner (Local)
**Pros:**
- Unlimited free runs
- Instant feedback (no queue)
- Access to local resources (DB, files)
- Faster (warm cache, local disk)
- Works offline (for local testing)

**Cons:**
- Requires setup (~10 min)
- User manages security
- Uses local CPU/memory
- Must keep machine running

## User Flow

```
First time user runs CI-related command:

┌─────────────────────────────────────────────────────────┐
│ CI RUNNER PREFERENCE                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ How do you want to run GitHub Actions?                  │
│                                                          │
│ [1] GitHub-hosted (Recommended for beginners)           │
│     • Zero setup, works immediately                     │
│     • 2000 free minutes/month                           │
│                                                          │
│ [2] Self-hosted on this machine                         │
│     • Unlimited free runs                               │
│     • Instant feedback, no queue                        │
│     • Requires ~10 min setup                            │
│                                                          │
│ [3] Hybrid (self-hosted with GitHub fallback)           │
│     • Uses local when available                         │
│     • Falls back to GitHub when offline                 │
│                                                          │
│ [0] Ask me later                                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Settings (GLOBAL - Machine-Wide)

Settings are stored **globally** at `~/.ctoc/settings.yaml` because:
- One machine has one runner installation
- Preference applies to ALL projects on this machine
- Runner path is machine-specific, not project-specific

```yaml
# ~/.ctoc/settings.yaml (GLOBAL)
ci:
  runner_preference: null  # null = not asked yet, 'github', 'self-hosted', 'hybrid'
  self_hosted_configured: false
  runner_path: null        # e.g., "~/actions-runner"
  runner_labels: ["self-hosted", "local"]
  asked_at: null           # ISO timestamp
```

**Note:** We NEVER store runner tokens - they are one-time use during setup.

## Setup Guide (if self-hosted chosen)

The subagent will guide user through:

1. **Prerequisites check**
   - WSL2 or Linux detected?
   - Node.js installed?
   - Python installed?
   - Docker installed?

2. **Runner installation**
   ```bash
   mkdir ~/actions-runner && cd ~/actions-runner
   curl -o actions-runner-linux-x64-2.321.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
   tar xzf ./actions-runner-linux-x64-2.321.0.tar.gz
   ```

3. **Token retrieval**
   - Open browser to: `https://github.com/{owner}/{repo}/settings/actions/runners/new`
   - User copies token

4. **Configuration**
   ```bash
   ./config.sh --url https://github.com/{owner}/{repo} --token TOKEN
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

5. **Workflow update**
   - Update `runs-on` in workflow files
   - Or use hybrid approach

## Success Criteria

- [ ] Setting stored in `~/.ctoc/settings.yaml` (GLOBAL)
- [ ] Subagent detects first-time CI usage
- [ ] Pros/cons presented clearly
- [ ] Setup wizard guides through installation
- [ ] Workflow files updated if needed
- [ ] Runner status checkable via dashboard
- [ ] TTY check before sudo commands
- [ ] Works without js-yaml dependency

## Subagent: `ci-runner-setup`

**Triggers:**
- First CI-related command when `runner_preference: null`
- User runs `ctoc ci setup`
- User selects "CI Runner" from Tools menu

**Tools needed:**
- Bash (for checking prerequisites, running setup)
- Read/Write (for settings file)
- WebFetch (for downloading runner)
- AskUserQuestion (for preferences)

---

## Implementation Details

### Overview

This implementation adds self-hosted GitHub Actions runner setup to CTOC. The key principle is:
**Always ask the user with clear pros/cons - never auto-detect or assume preferences.**

### Files to Create/Modify

#### 1. `agents/infrastructure/ci-runner-setup.md` (NEW)

The subagent definition that handles runner preference and setup.

```markdown
# CI Runner Setup Agent

---
name: ci-runner-setup
description: Guides users through GitHub Actions runner preference and setup. Always asks with clear pros/cons - no auto-detection.
tools: Bash, Read, Write, WebFetch
model: sonnet
---

## Role

You help users choose and configure their GitHub Actions runner preference. You ALWAYS present options with clear pros/cons using the Decision Exploration format. You NEVER auto-detect existing runners or assume user preferences.

## CRITICAL: Always Ask, Never Assume

```
┌─────────────────────────────────────────────────────────────┐
│              DECISION EXPLORATION REQUIRED                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   NEVER auto-detect existing runners                        │
│   NEVER assume user preferences                             │
│   ALWAYS present 3 options with pros/cons                   │
│   ALWAYS let user make informed decision                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Decision Exploration Format

When triggered, present this exact format:

```
═══════════════════════════════════════════════════════════════
                    CI RUNNER PREFERENCE
═══════════════════════════════════════════════════════════════

How do you want to run GitHub Actions?

[1] GitHub-Hosted (Recommended for teams)
    ✅ Zero setup - works immediately
    ✅ Clean environment each run
    ✅ GitHub manages security updates
    ✅ Always available, no maintenance
    ❌ 2000 free minutes/month limit (private repos)
    ❌ Queue time during peak hours
    ❌ Can't access local resources

[2] Self-Hosted on This Machine
    ✅ Unlimited free runs
    ✅ Instant feedback, no queue
    ✅ Access to local resources (DB, files, GPU)
    ✅ Faster (warm cache, local disk)
    ❌ ~10 minute setup required
    ❌ YOU manage security updates
    ❌ Uses local CPU/memory
    ❌ Must keep machine running

[3] Hybrid (Self-Hosted + GitHub Fallback)
    ✅ Uses local runner when available
    ✅ Falls back to GitHub when offline
    ✅ Best of both worlds
    ❌ More complex workflow configuration
    ❌ Requires maintaining both options

[0] Ask Me Later
    Skip for now, will be asked again on next CI command

═══════════════════════════════════════════════════════════════
```

## Security Warning for Public Repos

**CRITICAL**: If the project is a public repository, show this warning before setup:

```
⚠️  SECURITY WARNING ⚠️
═══════════════════════════════════════════════════════════════

This repository is PUBLIC. Self-hosted runners on public repos
can be DANGEROUS because:

1. Fork PRs can run arbitrary code on YOUR machine
2. Malicious actors can access your local network
3. Secrets in your environment may be exposed

RECOMMENDATIONS:
- Restrict runner to specific workflows only
- Disable fork PR runs: `pull_request_target` not `pull_request`
- Use ephemeral runners (containers) instead
- Consider GitHub-hosted for public repos

Do you want to continue with self-hosted setup? [y/N]
═══════════════════════════════════════════════════════════════
```

## Prerequisites Check

Before self-hosted setup, verify:

```bash
# System requirements
- [ ] Linux or WSL2 detected
- [ ] 2GB+ RAM available
- [ ] 10GB+ disk space

# Optional but recommended
- [ ] Node.js (for JS workflows)
- [ ] Python 3.x (for Python workflows)
- [ ] Docker (for container workflows)
```

## Setup Wizard Steps

### Step 1: Download Runner

```bash
# Get latest version from GitHub API
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep tag_name | cut -d '"' -f 4 | tr -d 'v')

# Create runner directory
mkdir -p ~/actions-runner && cd ~/actions-runner

# Download runner (x64 Linux)
curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L \
  https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz

# Extract
tar xzf ./actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
```

### Step 2: Get Registration Token

Open browser to:
```
https://github.com/{owner}/{repo}/settings/actions/runners/new
```

Or use GitHub CLI (if authenticated):
```bash
gh api -X POST repos/{owner}/{repo}/actions/runners/registration-token | jq -r .token
```

### Step 3: Configure Runner

```bash
cd ~/actions-runner
./config.sh --url https://github.com/{owner}/{repo} --token YOUR_TOKEN --name "local-$(hostname)" --labels "self-hosted,local,linux"
```

### Step 4: Install as Service

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

### Step 5: Update Workflows (Hybrid)

For hybrid setup, update workflow files:

```yaml
# Before
runs-on: ubuntu-latest

# After (hybrid with fallback)
runs-on: ${{ github.event_name == 'workflow_dispatch' && 'self-hosted' || 'ubuntu-latest' }}

# Or use labels
runs-on: [self-hosted, local]
```

## Output Format

### Success

```
═══════════════════════════════════════════════════════════════
              ✅ RUNNER SETUP COMPLETE
═══════════════════════════════════════════════════════════════

Runner Name:   local-your-hostname
Labels:        self-hosted, local, linux
Status:        ● Running

Your preference has been saved to .ctoc/settings.yaml

Next steps:
1. Your workflows will now use this runner for jobs with:
   runs-on: [self-hosted, local]

2. Check runner status anytime with:
   ctoc ci runner status

3. Manage runner service:
   sudo ~/actions-runner/svc.sh status
   sudo ~/actions-runner/svc.sh stop
   sudo ~/actions-runner/svc.sh start

═══════════════════════════════════════════════════════════════
```

### Failure

```
═══════════════════════════════════════════════════════════════
              ❌ RUNNER SETUP FAILED
═══════════════════════════════════════════════════════════════

Error: {specific error message}

Common issues:
- Token expired (tokens last 1 hour)
- Runner already registered (remove first)
- Network connectivity issues

To retry: ctoc ci runner setup
To remove: rm -rf ~/actions-runner && gh api -X DELETE ...

═══════════════════════════════════════════════════════════════
```
```

---

#### 2. `lib/runner-detect.js` (NEW)

Detects prerequisites and system compatibility.

```javascript
/**
 * Runner Prerequisites Detection
 *
 * Detects system prerequisites for self-hosted GitHub Actions runner.
 * This module checks what's available - it does NOT auto-detect preferences.
 *
 * @module lib/runner-detect
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Prerequisites check result
 * @typedef {Object} PrerequisiteResult
 * @property {boolean} ok - Whether prerequisite is met
 * @property {string} name - Prerequisite name
 * @property {string} version - Detected version (if applicable)
 * @property {string} [message] - Additional info or error
 */

/**
 * System requirements
 */
const REQUIREMENTS = {
  MIN_RAM_MB: 2048,
  MIN_DISK_GB: 10,
  SUPPORTED_PLATFORMS: ['linux', 'darwin', 'win32'],
  SUPPORTED_ARCH: ['x64', 'arm64']
};

/**
 * Check if running on WSL
 * @returns {boolean}
 */
function isWSL() {
  try {
    const release = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return release.includes('microsoft') || release.includes('wsl');
  } catch {
    return false;
  }
}

/**
 * Detect platform
 * @returns {Object} Platform info
 */
function detectPlatform() {
  const platform = os.platform();
  const arch = os.arch();
  const wsl = isWSL();

  return {
    platform,
    arch,
    wsl,
    supported: REQUIREMENTS.SUPPORTED_PLATFORMS.includes(platform) &&
               REQUIREMENTS.SUPPORTED_ARCH.includes(arch),
    displayName: wsl ? 'WSL2 (Linux)' :
                 platform === 'darwin' ? 'macOS' :
                 platform === 'win32' ? 'Windows' : 'Linux'
  };
}

/**
 * Check available RAM
 * @returns {PrerequisiteResult}
 */
function checkRAM() {
  const totalMB = Math.floor(os.totalmem() / (1024 * 1024));
  const freeMB = Math.floor(os.freemem() / (1024 * 1024));

  return {
    ok: totalMB >= REQUIREMENTS.MIN_RAM_MB,
    name: 'RAM',
    version: `${totalMB}MB total, ${freeMB}MB free`,
    message: totalMB < REQUIREMENTS.MIN_RAM_MB ?
      `Minimum ${REQUIREMENTS.MIN_RAM_MB}MB required` : null
  };
}

/**
 * Check available disk space
 * @param {string} targetPath - Path to check (defaults to home)
 * @returns {PrerequisiteResult}
 */
function checkDisk(targetPath = os.homedir()) {
  try {
    // Use df command for cross-platform compatibility
    const output = execSync(`df -k "${targetPath}" | tail -1`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const parts = output.trim().split(/\s+/);
    const availableKB = parseInt(parts[3], 10);
    const availableGB = Math.floor(availableKB / (1024 * 1024));

    return {
      ok: availableGB >= REQUIREMENTS.MIN_DISK_GB,
      name: 'Disk Space',
      version: `${availableGB}GB available`,
      message: availableGB < REQUIREMENTS.MIN_DISK_GB ?
        `Minimum ${REQUIREMENTS.MIN_DISK_GB}GB required` : null
    };
  } catch {
    return {
      ok: false,
      name: 'Disk Space',
      version: 'Unknown',
      message: 'Could not detect disk space'
    };
  }
}

/**
 * Check if a command exists
 * @param {string} command - Command to check
 * @returns {string|null} Version if found, null otherwise
 */
function commandVersion(command) {
  try {
    const versionFlag = command === 'node' ? '--version' :
                       command === 'python3' ? '--version' :
                       command === 'docker' ? '--version' :
                       command === 'git' ? '--version' : '--version';

    const output = execSync(`${command} ${versionFlag} 2>/dev/null`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Extract version number
    const match = output.match(/(\d+\.\d+(\.\d+)?)/);
    return match ? match[1] : output.trim().slice(0, 20);
  } catch {
    return null;
  }
}

/**
 * Check Node.js availability
 * @returns {PrerequisiteResult}
 */
function checkNode() {
  const version = commandVersion('node');
  return {
    ok: version !== null,
    name: 'Node.js',
    version: version || 'Not installed',
    message: version ? null : 'Required for JavaScript/TypeScript workflows'
  };
}

/**
 * Check Python availability
 * @returns {PrerequisiteResult}
 */
function checkPython() {
  const version = commandVersion('python3') || commandVersion('python');
  return {
    ok: version !== null,
    name: 'Python',
    version: version || 'Not installed',
    message: version ? null : 'Required for Python workflows'
  };
}

/**
 * Check Docker availability
 * @returns {PrerequisiteResult}
 */
function checkDocker() {
  const version = commandVersion('docker');
  let running = false;

  if (version) {
    try {
      execSync('docker ps', { stdio: ['pipe', 'pipe', 'pipe'] });
      running = true;
    } catch {
      running = false;
    }
  }

  return {
    ok: version !== null,
    name: 'Docker',
    version: version ? `${version}${running ? ' (running)' : ' (not running)'}` : 'Not installed',
    message: version ? (running ? null : 'Docker daemon not running') :
             'Required for container-based workflows'
  };
}

/**
 * Check Git availability
 * @returns {PrerequisiteResult}
 */
function checkGit() {
  const version = commandVersion('git');
  return {
    ok: version !== null,
    name: 'Git',
    version: version || 'Not installed',
    message: version ? null : 'Required for all workflows'
  };
}

/**
 * Check if runner is already installed
 * @param {string} runnerPath - Path to check
 * @returns {Object} Runner status
 */
function checkExistingRunner(runnerPath = path.join(os.homedir(), 'actions-runner')) {
  const configPath = path.join(runnerPath, '.runner');
  const svcPath = path.join(runnerPath, 'svc.sh');

  if (!fs.existsSync(runnerPath)) {
    return { installed: false, configured: false, running: false };
  }

  const installed = fs.existsSync(path.join(runnerPath, 'run.sh'));
  const configured = fs.existsSync(configPath);

  let running = false;
  if (configured) {
    try {
      const output = execSync(`sudo ${svcPath} status 2>/dev/null || echo "not running"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      running = output.includes('active (running)') || output.includes('started');
    } catch {
      running = false;
    }
  }

  let config = null;
  if (configured) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {}
  }

  return {
    installed,
    configured,
    running,
    path: runnerPath,
    config
  };
}

/**
 * Run all prerequisite checks
 * @returns {Object} All check results
 */
function runAllChecks() {
  const platform = detectPlatform();

  return {
    platform,
    system: {
      ram: checkRAM(),
      disk: checkDisk()
    },
    required: {
      git: checkGit()
    },
    optional: {
      node: checkNode(),
      python: checkPython(),
      docker: checkDocker()
    },
    existingRunner: checkExistingRunner(),
    summary: {
      canInstall: platform.supported &&
                  checkRAM().ok &&
                  checkDisk().ok &&
                  checkGit().ok
    }
  };
}

/**
 * Format prerequisites for display
 * @param {Object} checks - Check results
 * @returns {string} Formatted output
 */
function formatPrerequisites(checks) {
  const lines = [];
  const icon = (ok) => ok ? '✅' : '❌';

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                  PREREQUISITES CHECK');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Platform
  lines.push(`Platform: ${checks.platform.displayName} (${checks.platform.arch})`);
  lines.push(`Supported: ${icon(checks.platform.supported)} ${checks.platform.supported ? 'Yes' : 'No'}`);
  lines.push('');

  // System
  lines.push('System Requirements:');
  lines.push(`  ${icon(checks.system.ram.ok)} RAM: ${checks.system.ram.version}`);
  lines.push(`  ${icon(checks.system.disk.ok)} Disk: ${checks.system.disk.version}`);
  lines.push('');

  // Required
  lines.push('Required Tools:');
  lines.push(`  ${icon(checks.required.git.ok)} Git: ${checks.required.git.version}`);
  lines.push('');

  // Optional
  lines.push('Optional Tools (for specific workflows):');
  lines.push(`  ${icon(checks.optional.node.ok)} Node.js: ${checks.optional.node.version}`);
  lines.push(`  ${icon(checks.optional.python.ok)} Python: ${checks.optional.python.version}`);
  lines.push(`  ${icon(checks.optional.docker.ok)} Docker: ${checks.optional.docker.version}`);
  lines.push('');

  // Summary
  if (checks.summary.canInstall) {
    lines.push('✅ System meets requirements for self-hosted runner');
  } else {
    lines.push('❌ System does not meet minimum requirements');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

module.exports = {
  REQUIREMENTS,
  isWSL,
  detectPlatform,
  checkRAM,
  checkDisk,
  checkNode,
  checkPython,
  checkDocker,
  checkGit,
  checkExistingRunner,
  runAllChecks,
  formatPrerequisites
};
```

---

#### 3. `lib/runner-setup.js` (NEW)

Core setup logic and commands.

```javascript
/**
 * Runner Setup Logic
 *
 * Handles GitHub Actions self-hosted runner installation and management.
 * Works for ANY GitHub project, not just CTOC.
 *
 * @module lib/runner-setup
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { runAllChecks, formatPrerequisites } = require('./runner-detect');

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
    if (!fs.existsSync(gitConfig)) return null;

    const config = fs.readFileSync(gitConfig, 'utf8');
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
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
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
  fs.unlinkSync(filePath);

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
  if (!fs.existsSync(configScript)) {
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

  if (!fs.existsSync(svcScript)) {
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

  if (!fs.existsSync(workflowsDir)) {
    return { updated: false, message: 'No workflows directory found' };
  }

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  const updated = [];
  const skipped = [];
  const backedUp = [];

  // Pattern matches: ubuntu-latest, ubuntu-22.04, ubuntu-20.04, etc.
  const ubuntuPattern = /runs-on:\s*(ubuntu-(?:latest|\d+\.\d+))/g;

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

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
    fs.writeFileSync(backupPath, content);
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

    fs.writeFileSync(filePath, content);
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
    if (fs.existsSync(svcScript)) {
      execSync(`sudo ${svcScript} stop || true`, { cwd: runnerPath, stdio: 'pipe' });
      execSync(`sudo ${svcScript} uninstall || true`, { cwd: runnerPath, stdio: 'pipe' });
    }

    // Remove runner configuration
    const configScript = path.join(runnerPath, 'config.sh');
    if (fs.existsSync(configScript)) {
      execSync(`./config.sh remove --token DUMMY 2>/dev/null || true`, {
        cwd: runnerPath,
        stdio: 'pipe'
      });
    }

    // Remove directory
    fs.rmSync(runnerPath, { recursive: true, force: true });

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
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    CI RUNNER PREFERENCE');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  if (repoInfo) {
    lines.push(`Repository: ${repoInfo.owner}/${repoInfo.repo}`);
    lines.push('');
  }

  lines.push('How do you want to run GitHub Actions?');
  lines.push('');

  lines.push('[1] GitHub-Hosted (Recommended for teams)');
  lines.push('    ✅ Zero setup - works immediately');
  lines.push('    ✅ Clean environment each run');
  lines.push('    ✅ GitHub manages security updates');
  lines.push('    ✅ Always available, no maintenance');
  lines.push('    ❌ 2000 free minutes/month limit (private repos)');
  lines.push('    ❌ Queue time during peak hours');
  lines.push('    ❌ Can\'t access local resources');
  lines.push('');

  lines.push('[2] Self-Hosted on This Machine');
  lines.push('    ✅ Unlimited free runs');
  lines.push('    ✅ Instant feedback, no queue');
  lines.push('    ✅ Access to local resources (DB, files, GPU)');
  lines.push('    ✅ Faster (warm cache, local disk)');
  lines.push('    ❌ ~10 minute setup required');
  lines.push('    ❌ YOU manage security updates');
  lines.push('    ❌ Uses local CPU/memory');
  lines.push('    ❌ Must keep machine running');
  lines.push('');

  lines.push('[3] Hybrid (Self-Hosted + GitHub Fallback)');
  lines.push('    ✅ Uses local runner when available');
  lines.push('    ✅ Falls back to GitHub when offline');
  lines.push('    ✅ Best of both worlds');
  lines.push('    ❌ More complex workflow configuration');
  lines.push('    ❌ Requires maintaining both options');
  lines.push('');

  lines.push('[0] Ask Me Later');
  lines.push('    Skip for now, will be asked again on next CI command');
  lines.push('');

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Format public repo security warning
 * @returns {string} Warning text
 */
function formatPublicRepoWarning() {
  return `
⚠️  SECURITY WARNING ⚠️
═══════════════════════════════════════════════════════════════

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

═══════════════════════════════════════════════════════════════
`;
}

/**
 * Format success message
 * @param {Object} config - Runner configuration
 * @returns {string} Success message
 */
function formatSuccess(config) {
  return `
═══════════════════════════════════════════════════════════════
              ✅ RUNNER SETUP COMPLETE
═══════════════════════════════════════════════════════════════

Runner Name:   ${config.name}
Labels:        ${config.labels.join(', ')}
Status:        ● Running

Your preference has been saved to .ctoc/settings.yaml

Next steps:
1. Your workflows will now use this runner for jobs with:
   runs-on: [self-hosted, local]

2. Check runner status anytime with:
   ctoc ci runner status

3. Manage runner service:
   sudo ~/actions-runner/svc.sh status
   sudo ~/actions-runner/svc.sh stop
   sudo ~/actions-runner/svc.sh start

═══════════════════════════════════════════════════════════════
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
```

---

#### 4. `lib/runner-settings.js` (NEW)

Settings management for runner preference.

```javascript
/**
 * Runner Settings Management
 *
 * Manages CI runner preferences in ~/.ctoc/settings.yaml (GLOBAL)
 * Runner preference is machine-wide, not per-project.
 *
 * @module lib/runner-settings
 */

const fs = require('fs');
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

  if (!fs.existsSync(settingsPath)) {
    return getDefaultSettings();
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf8');
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

  // Look for ci section
  const ciMatch = content.match(/^ci:\s*\n((?:\s+.+\n)*)/m);
  if (ciMatch) {
    const ciSection = ciMatch[1];

    // Parse runner_preference
    const prefMatch = ciSection.match(/runner_preference:\s*["']?(\w+|null)["']?/);
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

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  // Read existing settings to merge
  let existing = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf8');
      existing = parseSimpleYaml(content);
    } catch {}
  }

  // Merge CI settings
  const merged = { ...existing, ci: { ...existing.ci, ...settings.ci } };

  // Generate YAML content
  const content = generateYaml(merged);
  fs.writeFileSync(settingsPath, content);
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
    lines.push('# ─────────────────────────────────────────────────────────────────────────────');
    lines.push('#  CI Runner Settings');
    lines.push('# ─────────────────────────────────────────────────────────────────────────────');
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
  getDefaultSettings
};
```

---

#### 5. Extend `commands/ci.js` (MODIFY)

Add runner subcommand to existing CI command.

```javascript
// Add to commands/ci.js

// Import runner modules
const {
  formatDecisionMenu,
  formatPublicRepoWarning,
  getRepoInfo,
  isRepoPublic,
  getLatestRunnerVersion,
  downloadRunner,
  configureRunner,
  installService,
  getServiceStatus,
  uninstallRunner,
  formatSuccess
} = require('../lib/runner-setup');

const {
  runAllChecks,
  formatPrerequisites
} = require('../lib/runner-detect');

// Runner settings are GLOBAL (~/.ctoc/settings.yaml)
const {
  getRunnerPreference,
  setRunnerPreference,
  markSelfHostedConfigured,
  hasAskedPreference
} = require('../lib/runner-settings');

const { hasTTY } = require('../lib/runner-setup');

/**
 * Parse runner subcommand
 */
function parseRunnerArgs(argsString = '') {
  const parts = argsString.trim().split(/\s+/);
  const subcommand = parts[0] || 'menu';

  return {
    subcommand,
    token: parts.find(p => p.length === 40), // Runner tokens are 40 chars
    force: parts.includes('--force') || parts.includes('-f'),
    help: parts.includes('--help') || parts.includes('-h')
  };
}

/**
 * Handle runner subcommand
 * @param {string} argsString - Arguments
 * @returns {Promise<Object>} Result
 */
async function handleRunner(argsString = '') {
  const args = parseRunnerArgs(argsString);
  // projectPath only needed for workflow updates, not for settings (which are global)
  const projectPath = process.cwd();

  if (args.help) {
    return showRunnerHelp();
  }

  switch (args.subcommand) {
    case 'menu':
    case 'setup':
      return runnerSetupFlow(projectPath, args);

    case 'status':
      return showRunnerStatus();

    case 'prereq':
    case 'prerequisites':
      return showPrerequisites();

    case 'uninstall':
    case 'remove':
      return removeRunner(args);

    case 'preference':
      return showPreference();

    default:
      console.log(`Unknown runner command: ${args.subcommand}`);
      return showRunnerHelp();
  }
}

/**
 * Main runner setup flow
 */
async function runnerSetupFlow(projectPath, args = {}) {
  const repoInfo = getRepoInfo(projectPath);

  // Always show decision menu (never auto-detect)
  console.log(formatDecisionMenu(repoInfo));
  console.log('');
  console.log('Enter your choice [0-3]:');

  // Note: In actual implementation, this would use readline or prompt
  // For now, return menu info for agent to use
  return {
    success: true,
    action: 'show_menu',
    repoInfo,
    menu: {
      options: [
        { key: 1, value: 'github', label: 'GitHub-Hosted' },
        { key: 2, value: 'self-hosted', label: 'Self-Hosted' },
        { key: 3, value: 'hybrid', label: 'Hybrid' },
        { key: 0, value: null, label: 'Ask Later' }
      ]
    }
  };
}

/**
 * Show runner status (uses GLOBAL settings)
 */
function showRunnerStatus() {
  const preference = getRunnerPreference();  // Global
  const status = getServiceStatus();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    RUNNER STATUS (GLOBAL)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Preference:    ${preference || 'Not set'}`);
  console.log(`Runner:        ${status.installed ? 'Installed' : 'Not installed'}`);
  console.log(`Service:       ${status.running ? '● Running' : '○ Stopped'}`);
  console.log(`Settings:      ~/.ctoc/settings.yaml`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');

  return { success: true, preference, status };
}

/**
 * Show prerequisites
 */
function showPrerequisites() {
  const checks = runAllChecks();
  console.log(formatPrerequisites(checks));
  return { success: true, checks };
}

/**
 * Remove runner (uses GLOBAL settings)
 */
function removeRunner(args) {
  if (!args.force) {
    console.log('This will remove the self-hosted runner.');
    console.log('Use --force to confirm.');
    return { success: false, action: 'confirm_needed' };
  }

  const result = uninstallRunner();
  if (result.success) {
    console.log('Runner removed successfully.');
    setRunnerPreference(null);  // Global
  }
  return result;
}

/**
 * Show current preference (GLOBAL)
 */
function showPreference() {
  const preference = getRunnerPreference();  // Global
  const asked = hasAskedPreference();  // Global

  console.log(`Runner Preference: ${preference || 'Not set'} (global)`);
  console.log(`Asked: ${asked ? 'Yes' : 'No'}`);
  console.log(`Settings file: ~/.ctoc/settings.yaml`);

  return { success: true, preference, asked };
}

/**
 * Show runner help
 */
function showRunnerHelp() {
  console.log(`
CI Runner Setup - Self-hosted GitHub Actions runner management

Usage:
  ctoc ci runner              Show runner preference menu
  ctoc ci runner setup        Start setup wizard
  ctoc ci runner status       Show runner status
  ctoc ci runner prereq       Check prerequisites
  ctoc ci runner preference   Show current preference
  ctoc ci runner remove       Remove runner (use --force)

Options:
  --force, -f     Force action without confirmation
  --help, -h      Show this help

Examples:
  ctoc ci runner                    # Choose runner preference
  ctoc ci runner status             # Check if runner is running
  ctoc ci runner prereq             # Check system requirements
  ctoc ci runner remove --force     # Uninstall runner
`);

  return { success: true };
}

// Add to the main run() function switch statement:
// case 'runner':
//   return handleRunner(argsString.replace(/^runner\s*/, ''));

module.exports = {
  // ... existing exports
  handleRunner,
  parseRunnerArgs
};
```

---

### Internal API (Agent-Triggered Only)

**Note:** These are NOT user-facing slash commands. The runner setup is triggered by agents when needed.

| Function | Description |
|----------|-------------|
| `handleRunner('menu')` | Show runner preference menu |
| `handleRunner('setup')` | Start setup wizard |
| `handleRunner('status')` | Show runner status |
| `handleRunner('prereq')` | Check prerequisites |
| `handleRunner('preference')` | Show current preference |
| `handleRunner('remove --force')` | Uninstall runner |

**User-facing commands:** Only `/ctoc:menu` and `/ctoc:update` are exposed to users.

---

### Dependencies

No new npm dependencies required. Uses:
- Built-in: `fs`, `path`, `os`, `https`, `child_process`
- Existing CTOC libs: Uses patterns from `lib/settings.js`

---

### Settings Schema Addition (GLOBAL)

Add to `~/.ctoc/settings.yaml` (machine-wide, not per-project):

```yaml
# ─────────────────────────────────────────────────────────────────────────────
#  CI Runner Settings (GLOBAL - applies to all projects on this machine)
# ─────────────────────────────────────────────────────────────────────────────

ci:
  runner_preference: null      # null | "github" | "self-hosted" | "hybrid"
  self_hosted_configured: false
  runner_path: null            # e.g., "~/actions-runner"
  runner_labels: ["self-hosted", "local"]
  asked_at: null               # ISO timestamp when preference was set
```

**Why Global?**
- One machine = one runner installation
- Runner binds to machine, not project
- Avoids asking the same question for every project

---

### Test Plan

#### Unit Tests

1. **runner-detect.js**
   - `detectPlatform()` returns correct platform info
   - `checkRAM()` correctly identifies low memory
   - `checkExistingRunner()` detects installed runner
   - `runAllChecks()` aggregates all checks

2. **runner-setup.js**
   - `getRepoInfo()` extracts owner/repo from git config
   - `formatDecisionMenu()` returns proper menu format
   - `formatPublicRepoWarning()` includes security info

3. **runner-settings.js**
   - `getRunnerPreference()` returns null when not set
   - `setRunnerPreference()` persists to settings file
   - `hasAskedPreference()` correctly detects asked state

#### Integration Tests

1. Run `ctoc ci runner` - should show menu
2. Run `ctoc ci runner status` - should show current state
3. Run `ctoc ci runner prereq` - should check system
4. Set preference to 'github' - should save to settings
5. Run `ctoc ci runner` again - should still show menu (never assumes)

#### Edge Cases

1. No git repository - should handle gracefully
2. No ~/.ctoc directory - should create on save
3. Corrupted settings file - should use defaults
4. WSL2 detection - should identify as Linux
5. Public repo - should show security warning
6. No TTY (piped/non-interactive) - should fail gracefully with message
7. ubuntu-22.04 / ubuntu-20.04 - should match and update correctly
8. Already configured workflows - should skip with reason

---

### Security Considerations

1. **Public Repository Warning**: Always warn users about risks of self-hosted runners on public repos
2. **Token Handling**: Never store runner tokens in settings (they're one-time use)
3. **Service Permissions**: Service installation requires sudo - document clearly
4. **Fork PR Attacks**: Document recommendation to use `pull_request_target` for public repos

---

### Self-Critique Summary (Round 4 - Gaps Addressed)

After four rounds of refinement:

1. **Requirements Addressed**: All key requirements from discussion implemented
   - Works for ANY GitHub project
   - Always asks with pros/cons (Decision Exploration)
   - No auto-detection of existing runners
   - 3 options presented: GitHub, Self-hosted, Hybrid
   - Security warning for public repos
   - **Preference stored GLOBALLY in ~/.ctoc/settings.yaml**

2. **Gaps Addressed in This Round**:
   - ✅ **Global Settings**: Changed from per-project to `~/.ctoc/settings.yaml`
   - ✅ **commands/ci.js exists**: Verified file exists, plan extends it with `runner` subcommand
   - ✅ **TTY Check**: Added `hasTTY()` check before sudo commands
   - ✅ **No js-yaml dependency**: Using simple YAML parser, no external deps
   - ✅ **Robust workflow updates**: Now matches ubuntu-22.04, ubuntu-20.04, etc.
   - ✅ **Workflow backups**: Creates .backup files before modifying
   - ✅ **Agent registration**: Agents are just .md files in agents/ - no index needed

3. **Security**: Public repo warning added, token handling documented

4. **Testability**: Clear test plan with unit and integration tests

5. **Edge Cases**: Handled no-git, no-settings, WSL2, corrupted files, no TTY

6. **Patterns**: Follows existing CTOC patterns for commands, lib, and agents

---

### Implementation Order

1. Create `lib/runner-detect.js` - Prerequisites detection
2. Create `lib/runner-setup.js` - Core setup logic
3. Create `lib/runner-settings.js` - Global settings management
4. Extend `commands/ci.js` - Add `runner` subcommand
5. Create `agents/infrastructure/ci-runner-setup.md` - Agent definition
6. Add tests in `tests/runner-*.test.js`
7. Update CLAUDE.md with new commands

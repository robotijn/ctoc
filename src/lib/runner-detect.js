/**
 * Runner Prerequisites Detection
 *
 * Detects system prerequisites for self-hosted GitHub Actions runner.
 * This module checks what's available - it does NOT auto-detect preferences.
 *
 * @module lib/runner-detect
 */

const { execSync } = require('child_process');
const safeFs = require('./safe-fs');
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
    const release = safeFs.readFileSync('/proc/version', 'utf8').toLowerCase();
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

    // Extract version number. Alternation (3-part first) avoids the nested
    // quantifier of `(\d+\.\d+(\.\d+)?)` while matching the same inputs.
    const match = output.match(/(\d+\.\d+\.\d+|\d+\.\d+)/);
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

  if (!safeFs.existsSync(runnerPath)) {
    return { installed: false, configured: false, running: false };
  }

  const installed = safeFs.existsSync(path.join(runnerPath, 'run.sh'));
  const configured = safeFs.existsSync(configPath);

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
      config = JSON.parse(safeFs.readFileSync(configPath, 'utf8'));
    } catch { /* ignore: best-effort, non-fatal */ }
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
  const icon = (ok) => ok ? '[OK]' : '[X]';

  lines.push('');
  lines.push('===============================================================');
  lines.push('                  PREREQUISITES CHECK');
  lines.push('===============================================================');
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
    lines.push('[OK] System meets requirements for self-hosted runner');
  } else {
    lines.push('[X] System does not meet minimum requirements');
  }

  lines.push('===============================================================');
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

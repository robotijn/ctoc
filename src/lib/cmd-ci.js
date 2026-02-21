/**
 * CI Command
 *
 * Local CI gate enforcement.
 * Run the exact same checks CI would run, locally.
 *
 * Usage:
 *   ctoc ci              - Run all CI checks
 *   ctoc ci quick        - Run quick checks (lint, typecheck)
 *   ctoc ci full         - Run full checks including tests
 *   ctoc ci status       - Show CI config and checks
 *   ctoc ci --pre-push   - Pre-push gate check
 *   ctoc ci --type=lint  - Run only lint checks
 *
 * @module commands/ci
 */

const path = require('path');
const {
  runLocalCI,
  runQuickCheck,
  runFullCheck,
  willCIPass,
  getChecks,
  runCheckType,
  CI_STATUS
} = require('../lib/local-ci');
const { parseCIConfig, CHECK_TYPES } = require('../lib/ci-parser');

// Runner modules
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
  formatSuccess,
  hasTTY
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

/**
 * Parse command arguments
 * @param {string} argsString - Arguments string
 * @returns {Object} Parsed args
 */
function parseArgs(argsString = '') {
  const args = {
    action: 'run',
    prePush: false,
    preReview: false,
    type: null,
    verbose: true,
    help: false
  };

  const parts = argsString.trim().split(/\s+/);

  for (const part of parts) {
    if (part === 'quick') args.action = 'quick';
    else if (part === 'full') args.action = 'full';
    else if (part === 'status') args.action = 'status';
    else if (part === 'checks') args.action = 'checks';
    else if (part === 'runner') args.action = 'runner';
    else if (part === 'help' || part === '--help' || part === '-h') args.help = true;
    else if (part === '--pre-push') args.prePush = true;
    else if (part === '--pre-review') args.preReview = true;
    else if (part === '--quiet' || part === '-q') args.verbose = false;
    else if (part.startsWith('--type=')) args.type = part.slice(7);
  }

  return args;
}

/**
 * Main command handler
 * @param {string} argsString - Command arguments
 * @returns {Promise<Object>} Result
 */
async function run(argsString = '') {
  const args = parseArgs(argsString);
  const projectPath = process.cwd();

  if (args.help) {
    return showHelp();
  }

  // Pre-push gate mode
  if (args.prePush) {
    return runPrePushGate(projectPath);
  }

  // Pre-review gate mode
  if (args.preReview) {
    return runPreReviewGate(projectPath);
  }

  // Status - show CI config
  if (args.action === 'status') {
    return showStatus(projectPath);
  }

  // Checks - list what would be run
  if (args.action === 'checks') {
    return showChecks(projectPath);
  }

  // Runner - self-hosted runner management
  if (args.action === 'runner') {
    const runnerArgs = argsString.replace(/^runner\s*/, '');
    return handleRunner(runnerArgs);
  }

  // Run specific type
  if (args.type) {
    const typeMap = {
      lint: CHECK_TYPES.LINT,
      test: CHECK_TYPES.TEST,
      typecheck: CHECK_TYPES.TYPE_CHECK,
      'type-check': CHECK_TYPES.TYPE_CHECK,
      build: CHECK_TYPES.BUILD,
      security: CHECK_TYPES.SECURITY,
      coverage: CHECK_TYPES.COVERAGE,
      format: CHECK_TYPES.FORMAT
    };

    const checkType = typeMap[args.type.toLowerCase()];
    if (!checkType) {
      console.log(`Unknown check type: ${args.type}`);
      console.log(`Valid types: ${Object.keys(typeMap).join(', ')}`);
      return { success: false };
    }

    const result = await runCheckType(checkType, projectPath);
    return { success: result.status === CI_STATUS.PASS, result };
  }

  // Quick check
  if (args.action === 'quick') {
    console.log('Running quick CI checks (lint, typecheck)...\n');
    const result = await runQuickCheck(projectPath);
    return { success: result.status === CI_STATUS.PASS, result };
  }

  // Full check
  if (args.action === 'full') {
    console.log('Running full CI checks...\n');
    const result = await runFullCheck(projectPath);
    return { success: result.status === CI_STATUS.PASS, result };
  }

  // Default: run all CI checks
  console.log('Running Local CI Gate...\n');
  const result = await runLocalCI(projectPath, { verbose: args.verbose });
  return { success: result.status === CI_STATUS.PASS, result };
}

/**
 * Pre-push gate check
 * @param {string} projectPath - Project root
 * @returns {Promise<Object>} Result
 */
async function runPrePushGate(projectPath) {
  console.log('═══════════════════════════════════════════');
  console.log('      LOCAL CI GATE - PRE-PUSH CHECK       ');
  console.log('═══════════════════════════════════════════\n');

  const result = await runLocalCI(projectPath);

  if (result.status !== CI_STATUS.PASS) {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  \u2717 LOCAL CI FAILED - PUSH BLOCKED         ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    console.log('Fix these issues before pushing:');
    for (const r of result.results.filter(r => r.status !== 'pass')) {
      console.log(`  - ${r.name}: ${r.error || 'failed'}`);
    }
    console.log('');

    // Exit with error code for git hook
    process.exitCode = 1;
    return { success: false, result };
  }

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  \u2713 LOCAL CI PASSED - PUSH ALLOWED         ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  return { success: true, result };
}

/**
 * Pre-review gate check
 * @param {string} projectPath - Project root
 * @returns {Promise<Object>} Result
 */
async function runPreReviewGate(projectPath) {
  console.log('═══════════════════════════════════════════');
  console.log('     LOCAL CI GATE - PRE-REVIEW CHECK      ');
  console.log('═══════════════════════════════════════════\n');

  const result = await runLocalCI(projectPath);

  if (result.status !== CI_STATUS.PASS) {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  \u2717 LOCAL CI FAILED - REVIEW BLOCKED       ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    console.log('Fix these issues before moving to review:');
    for (const r of result.results.filter(r => r.status !== 'pass')) {
      console.log(`  - ${r.name}: ${r.error || 'failed'}`);
    }
    console.log('');

    return { success: false, allowed: false, result };
  }

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  \u2713 LOCAL CI PASSED - READY FOR REVIEW     ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  return { success: true, allowed: true, result };
}

/**
 * Show CI status
 * @param {string} projectPath - Project root
 */
function showStatus(projectPath) {
  const ciConfig = parseCIConfig(projectPath);

  console.log('Local CI Status');
  console.log('═══════════════════════════════════════════\n');

  if (ciConfig.found) {
    console.log(`CI System:   ${ciConfig.system}`);
    console.log(`Config:      ${ciConfig.configPath}`);
  } else {
    console.log('CI System:   Not detected (using defaults)');
  }

  if (ciConfig.container) {
    console.log(`Container:   ${ciConfig.container}`);
  }

  console.log(`\nChecks Detected: ${ciConfig.checks.length}`);
  console.log('');

  // Group by type
  const byType = {};
  for (const check of ciConfig.checks) {
    const type = check.type || 'other';
    if (!byType[type]) byType[type] = [];
    byType[type].push(check);
  }

  for (const [type, checks] of Object.entries(byType)) {
    console.log(`  ${type.toUpperCase()}: ${checks.length}`);
    for (const check of checks.slice(0, 3)) {
      console.log(`    - ${check.name || check.command.slice(0, 50)}`);
    }
    if (checks.length > 3) {
      console.log(`    ... and ${checks.length - 3} more`);
    }
  }

  return { success: true, ciConfig };
}

/**
 * Show checks that would be run
 * @param {string} projectPath - Project root
 */
function showChecks(projectPath) {
  const checks = getChecks(projectPath);

  console.log('CI Checks');
  console.log('═══════════════════════════════════════════\n');

  if (checks.length === 0) {
    console.log('No checks detected.');
    return { success: true, checks: [] };
  }

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    console.log(`${i + 1}. ${check.name}`);
    console.log(`   Type: ${check.type}`);
    console.log(`   Command: ${check.command}`);
    console.log('');
  }

  return { success: true, checks };
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Local CI Gate - Run CI checks locally before push

Usage:
  ctoc ci              Run all CI checks
  ctoc ci quick        Run quick checks (lint, typecheck only)
  ctoc ci full         Run full checks including tests
  ctoc ci status       Show CI configuration
  ctoc ci checks       List all checks that would be run
  ctoc ci runner       Self-hosted runner management

Runner Commands:
  ctoc ci runner              Show runner preference menu
  ctoc ci runner setup        Start setup wizard
  ctoc ci runner status       Show runner status
  ctoc ci runner prereq       Check prerequisites
  ctoc ci runner preference   Show current preference
  ctoc ci runner remove       Remove runner (use --force)

Options:
  --pre-push           Run as pre-push gate (exits with error on failure)
  --pre-review         Run as pre-review gate
  --type=TYPE          Run only checks of specific type
  --quiet, -q          Minimal output

Check Types:
  lint, test, typecheck, build, security, coverage, format

Examples:
  ctoc ci                       # Run all checks
  ctoc ci --type=lint           # Run only lint checks
  ctoc ci --pre-push            # Gate check for git push
  ctoc ci quick                 # Fast lint + typecheck only
  ctoc ci runner                # Configure self-hosted runner

The Local CI Gate ensures your code will pass CI before you push,
preventing wasted CI time and failed deployments.
`);

  return { success: true };
}

// ============================================================================
// Runner Subcommand Handlers
// ============================================================================

/**
 * Parse runner subcommand
 * @param {string} argsString - Arguments
 * @returns {Object} Parsed args
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
 * @param {string} projectPath - Project path
 * @param {Object} args - Parsed arguments
 * @returns {Promise<Object>} Result
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
 * @returns {Object} Result
 */
function showRunnerStatus() {
  const preference = getRunnerPreference();  // Global
  const status = getServiceStatus();

  console.log('');
  console.log('===============================================================');
  console.log('                    RUNNER STATUS (GLOBAL)');
  console.log('===============================================================');
  console.log('');
  console.log(`Preference:    ${preference || 'Not set'}`);
  console.log(`Runner:        ${status.installed ? 'Installed' : 'Not installed'}`);
  console.log(`Service:       ${status.running ? 'Running' : 'Stopped'}`);
  console.log(`Settings:      ~/.ctoc/settings.yaml`);
  console.log('');
  console.log('===============================================================');

  return { success: true, preference, status };
}

/**
 * Show prerequisites
 * @returns {Object} Result
 */
function showPrerequisites() {
  const checks = runAllChecks();
  console.log(formatPrerequisites(checks));
  return { success: true, checks };
}

/**
 * Remove runner (uses GLOBAL settings)
 * @param {Object} args - Parsed arguments
 * @returns {Object} Result
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
 * @returns {Object} Result
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
 * @returns {Object} Result
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

// Export for CLI and programmatic use
module.exports = {
  run,
  parseArgs,
  runPrePushGate,
  runPreReviewGate,
  showStatus,
  showChecks,
  // Runner exports
  handleRunner,
  parseRunnerArgs
};

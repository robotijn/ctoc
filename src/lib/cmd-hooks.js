/**
 * CTOC Hooks Command (v10 RED/BLUE hardened)
 *
 * Manages Git hooks for quality enforcement.
 *
 * Usage:
 *   ctoc hooks init [--system <system>] [--type <type>]
 *   ctoc hooks status
 *   ctoc hooks remove
 *   ctoc hooks test [hook-name]
 *
 * RED/BLUE TEAM HARDENING NOTES:
 * - R1: Validate all user inputs
 * - R2: Check git repository state before operations
 * - R3: Prevent overwriting custom hooks
 * - R4: Secure file permissions
 * - R5: Rollback on failure
 * - B1: Auto-detect best system for project
 * - B2: Clear progress and error messages
 * - B3: Dry-run support
 * - B4: Comprehensive status reporting
 * - B5: Integration with quality command
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { HooksInstaller, SYSTEMS, HOOK_TYPES } = require('../lib/hooks-installer');
const { detectStack } = require('../lib/stack-detector');

// ==============================================================================
// CONSTANTS
// ==============================================================================

const VALID_SYSTEMS = Object.values(SYSTEMS);
const VALID_PROJECT_TYPES = ['typescript', 'python', 'go', 'multi-lang', 'auto'];

// ==============================================================================
// ACTIONS
// ==============================================================================

/**
 * Initialize hooks for the project
 */
async function initHooks(options) {
  const {
    system = 'auto',
    type = 'auto',
    force = false,
    dryRun = false,
    projectRoot = process.cwd()
  } = options;

  // Validate inputs
  if (system !== 'auto' && !VALID_SYSTEMS.includes(system)) {
    return {
      success: false,
      error: `Invalid system: ${system}. Valid options: ${VALID_SYSTEMS.join(', ')}`
    };
  }

  if (type !== 'auto' && !VALID_PROJECT_TYPES.includes(type)) {
    return {
      success: false,
      error: `Invalid project type: ${type}. Valid options: ${VALID_PROJECT_TYPES.join(', ')}`
    };
  }

  // Check for git repository
  if (!safeFs.existsSync(path.join(projectRoot, '.git'))) {
    return {
      success: false,
      error: 'Not a git repository. Run `git init` first.'
    };
  }

  try {
    const installer = new HooksInstaller(projectRoot);

    // Check for existing hooks
    const status = installer.status();

    if (!force && (status.husky || status.precommit || status.native)) {
      const existingSystem = status.husky ? 'husky' :
                            status.precommit ? 'pre-commit' : 'native';

      if (system !== 'auto' && system !== existingSystem) {
        return {
          success: false,
          error: `${existingSystem} hooks already installed. Use --force to replace.`,
          currentSystem: existingSystem
        };
      }
    }

    if (dryRun) {
      const detectedSystem = system === 'auto' ? installer.detectSystem() : system;
      const stack = detectStack(projectRoot);

      return {
        success: true,
        dryRun: true,
        system: detectedSystem,
        projectType: type === 'auto' ? stack.primary.language || 'multi-lang' : type,
        wouldInstall: HOOK_TYPES.filter(h =>
          safeFs.existsSync(path.join(__dirname, '..', '..', '.ctoc', 'templates', 'hooks', `${h}.sh.template`)) ||
          safeFs.existsSync(path.join(__dirname, '..', '..', '.ctoc', 'templates', 'hooks', 'husky', `${h}.template`))
        ),
        message: generateDryRunMessage(detectedSystem, stack)
      };
    }

    // Install hooks
    const result = await installer.install(system, type);

    return {
      success: result.errors.length === 0,
      system: system === 'auto' ? installer.detectSystem() : system,
      installed: result.installed,
      errors: result.errors,
      message: generateInstallMessage(result)
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get hooks status
 */
function getStatus(options = {}) {
  const { projectRoot = process.cwd() } = options;

  try {
    const installer = new HooksInstaller(projectRoot);
    const status = installer.status();
    const stack = detectStack(projectRoot);

    // Get detailed hook status
    const hooks = {};
    const gitHooksDir = path.join(projectRoot, '.git', 'hooks');
    const huskyDir = path.join(projectRoot, '.husky');

    for (const hookType of HOOK_TYPES) {
      hooks[hookType] = {
        native: safeFs.existsSync(path.join(gitHooksDir, hookType)),
        husky: safeFs.existsSync(path.join(huskyDir, hookType))
      };
    }

    // Check pre-commit config
    const precommitConfig = path.join(projectRoot, '.pre-commit-config.yaml');
    const hasPrecommitConfig = safeFs.existsSync(precommitConfig);

    return {
      success: true,
      status: {
        ...status,
        hooks,
        hasPrecommitConfig,
        stack: stack.primary,
        recommended: status.detected
      },
      message: generateStatusMessage(status, hooks, stack)
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Remove hooks
 */
function removeHooks(options = {}) {
  const { projectRoot = process.cwd(), system = 'all' } = options;

  try {
    const installer = new HooksInstaller(projectRoot);

    if (system === 'all') {
      installer.uninstall();
    } else {
      switch (system) {
        case SYSTEMS.HUSKY:
          installer.husky.uninstall();
          break;
        case SYSTEMS.PRECOMMIT:
          installer.precommit.uninstall();
          break;
        case SYSTEMS.NATIVE:
          installer.native.uninstall();
          break;
        default:
          return {
            success: false,
            error: `Invalid system: ${system}`
          };
      }
    }

    return {
      success: true,
      message: 'Hooks removed successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test a hook by running it manually
 */
async function testHook(options = {}) {
  const { hook = 'pre-commit', projectRoot = process.cwd() } = options;

  if (!HOOK_TYPES.includes(hook)) {
    return {
      success: false,
      error: `Invalid hook: ${hook}. Valid hooks: ${HOOK_TYPES.join(', ')}`
    };
  }

  const { execSync } = require('child_process');

  // Find the hook
  const locations = [
    path.join(projectRoot, '.husky', hook),
    path.join(projectRoot, '.git', 'hooks', hook)
  ];

  let hookPath = null;
  for (const loc of locations) {
    if (safeFs.existsSync(loc)) {
      hookPath = loc;
      break;
    }
  }

  if (!hookPath) {
    return {
      success: false,
      error: `Hook not found: ${hook}`
    };
  }

  console.log(`\nTesting ${hook} hook from ${hookPath}...\n`);

  try {
    execSync(hookPath, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, CTOC_HOOK_TEST: '1' }
    });

    return {
      success: true,
      hook,
      path: hookPath,
      message: `\n${hook} hook completed successfully`
    };

  } catch (error) {
    return {
      success: false,
      hook,
      path: hookPath,
      error: `Hook failed with exit code ${error.status}`,
      message: `\n${hook} hook failed`
    };
  }
}

// ==============================================================================
// MESSAGE GENERATORS
// ==============================================================================

function generateDryRunMessage(system, stack) {
  const lines = [
    'DRY RUN - No changes made',
    '',
    `Detected project type: ${stack.languages.join(', ') || 'unknown'}`,
    `Recommended system: ${system}`,
    '',
    'Would install:',
  ];

  if (system === 'husky') {
    lines.push('  - .husky/pre-commit');
    lines.push('  - .husky/pre-push');
    lines.push('  - .husky/commit-msg');
    lines.push('  - lint-staged configuration');
  } else if (system === 'pre-commit') {
    lines.push('  - .pre-commit-config.yaml');
    lines.push('  - Git hooks via pre-commit');
  } else {
    lines.push('  - .git/hooks/pre-commit');
    lines.push('  - .git/hooks/pre-push');
    lines.push('  - .git/hooks/commit-msg');
  }

  lines.push('');
  lines.push('Run without --dry-run to install.');

  return lines.join('\n');
}

function generateInstallMessage(result) {
  const lines = ['Hooks Installation Results', '==========================', ''];

  if (result.installed.length > 0) {
    lines.push('Installed:');
    result.installed.forEach(h => lines.push(`  + ${h}`));
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('Errors:');
    result.errors.forEach(e => lines.push(`  - ${e.hook}: ${e.error}`));
    lines.push('');
  }

  if (result.errors.length === 0) {
    lines.push('All hooks installed successfully!');
    lines.push('');
    lines.push('Next steps:');
    lines.push('  1. Stage some files: git add .');
    lines.push('  2. Test the hook: ctoc hooks test pre-commit');
    lines.push('  3. Make a commit: git commit -m "feat: test hooks"');
  }

  return lines.join('\n');
}

function generateStatusMessage(status, hooks, stack) {
  const lines = [
    'Git Hooks Status',
    '================',
    ''
  ];

  // Project info
  lines.push(`Project: ${stack.languages.join(', ') || 'unknown'}`);
  if (stack.frameworks.length > 0) {
    lines.push(`Frameworks: ${stack.frameworks.join(', ')}`);
  }
  lines.push('');

  // System status
  lines.push('Installed Systems:');
  lines.push(`  Husky:      ${status.husky ? 'Yes' : 'No'}`);
  lines.push(`  Pre-commit: ${status.precommit ? 'Yes' : 'No'}`);
  lines.push(`  Native:     ${status.native ? 'Yes' : 'No'}`);
  lines.push('');

  // Hook status
  lines.push('Hook Status:');
  for (const [hookType, hookStatus] of Object.entries(hooks)) {
    const installed = hookStatus.husky || hookStatus.native;
    const source = hookStatus.husky ? '(husky)' : hookStatus.native ? '(native)' : '';
    lines.push(`  ${hookType}: ${installed ? 'Installed' : 'Not installed'} ${source}`);
  }
  lines.push('');

  // Recommendation
  if (!status.husky && !status.precommit && !status.native) {
    lines.push(`Recommended: Run 'ctoc hooks init' to set up ${status.detected} hooks`);
  }

  return lines.join('\n');
}

// ==============================================================================
// MAIN EXECUTE FUNCTION
// ==============================================================================

/**
 * Execute hooks command
 */
async function execute(options) {
  const { action = 'status', ...rest } = options;

  switch (action) {
    case 'init':
      return await initHooks(rest);

    case 'status':
      return getStatus(rest);

    case 'remove':
    case 'uninstall':
      return removeHooks(rest);

    case 'test':
      return await testHook(rest);

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: init, status, remove, test`
      };
  }
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  execute,
  initHooks,
  getStatus,
  removeHooks,
  testHook,
  VALID_SYSTEMS,
  VALID_PROJECT_TYPES
};

#!/usr/bin/env node
/**
 * CTOC Pre-Push Hook
 *
 * Blocks git push until local CI passes.
 * This is an ABSOLUTE gate - no bypass mechanism exists.
 *
 * This hook is designed to be called from a git pre-push hook
 * or directly by CTOC before allowing push operations.
 *
 * @module hooks/PrePush
 */

const { runLocalCI, CI_STATUS } = require('../lib/local-ci');
const { writeToTerminal, colors } = require('../lib/ui');

/**
 * Format the CI gate output for pre-push
 * @param {Object} ciResult - CI results
 * @param {boolean} passed - Whether all checks passed
 * @returns {string} Formatted output
 */
function formatOutput(ciResult, passed) {
  const c = colors;
  let output = '\n';

  output += '='.repeat(70) + '\n';
  output += `${c.cyan}LOCAL CI GATE - PRE-PUSH CHECK${c.reset}\n`;
  output += '='.repeat(70) + '\n\n';

  if (ciResult.ciConfig?.found) {
    output += `  CI System: ${ciResult.ciConfig.system || 'detected'}\n`;
  } else {
    output += `  CI System: Using default checks\n`;
  }
  output += `  Checks Run: ${ciResult.total}\n`;
  output += `  Duration: ${(ciResult.duration / 1000).toFixed(1)}s\n\n`;

  if (passed) {
    output += '  ' + '+'.repeat(50) + '\n';
    output += `  ${c.green}+      ALL CHECKS PASSED - PUSH ALLOWED        +${c.reset}\n`;
    output += '  ' + '+'.repeat(50) + '\n\n';

    output += `  ${c.green}Passed:${c.reset} ${ciResult.passed}/${ciResult.total}\n`;
    output += `  ${c.dim}Failed:${c.reset} ${ciResult.failed}/${ciResult.total}\n\n`;

    output += `  ${c.green}CI is GUARANTEED to pass.${c.reset} Push proceeding...\n`;
  } else {
    output += '  ' + '!'.repeat(50) + '\n';
    output += `  ${c.red}!       PUSH BLOCKED - LOCAL CI FAILED         !${c.reset}\n`;
    output += '  ' + '!'.repeat(50) + '\n\n';

    output += `  ${c.green}Passed:${c.reset} ${ciResult.passed}/${ciResult.total}\n`;
    output += `  ${c.red}Failed:${c.reset} ${ciResult.failed}/${ciResult.total}\n\n`;

    output += `  ${c.yellow}Failed Checks:${c.reset}\n`;
    for (const result of ciResult.results.filter(r => r.status !== 'pass')) {
      output += `    ${c.red}x${c.reset} ${result.name}\n`;
      if (result.error) {
        const errorLines = result.error.split('\n').slice(0, 3);
        for (const line of errorLines) {
          if (line.trim()) {
            output += `      ${c.dim}${line.slice(0, 60)}${c.reset}\n`;
          }
        }
      }
    }

    output += '\n';
    output += `  ${c.yellow}TO FIX:${c.reset}\n`;
    output += `    1. Fix the failing checks above\n`;
    output += `    2. Run: ctoc ci (to verify locally)\n`;
    output += `    3. Commit your fixes\n`;
    output += `    4. Push again\n\n`;

    output += `  ${c.cyan}THE LOCAL CI GATE IS ABSOLUTE. NO BYPASS EXISTS.${c.reset}\n`;
    output += `  ${c.dim}If it won't pass CI, it won't pass this gate.${c.reset}\n`;
  }

  output += '\n' + '='.repeat(70) + '\n';

  return output;
}

/**
 * Pre-push gate check
 * Runs local CI and blocks push if any check fails.
 *
 * @param {string} projectPath - Project root path
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function prePushGate(projectPath = process.cwd()) {
  try {
    // Run local CI with verbose output suppressed (we'll format our own)
    const ciResult = await runLocalCI(projectPath, {
      verbose: false,
      stopOnFailure: false
    });

    const passed = ciResult.status === CI_STATUS.PASS;

    // Output formatted results
    writeToTerminal(formatOutput(ciResult, passed));

    if (!passed) {
      return {
        allowed: false,
        reason: `Local CI failed: ${ciResult.failed}/${ciResult.total} checks failed`,
        ciResult
      };
    }

    return {
      allowed: true,
      ciResult
    };
  } catch (error) {
    const c = colors;
    let output = '\n';
    output += '='.repeat(70) + '\n';
    output += `${c.red}LOCAL CI GATE - ERROR${c.reset}\n`;
    output += '='.repeat(70) + '\n\n';
    output += `  ${c.red}Error running local CI:${c.reset}\n`;
    output += `    ${error.message}\n\n`;
    output += `  Cannot verify code quality. Push blocked.\n`;
    output += '\n' + '='.repeat(70) + '\n';

    writeToTerminal(output);

    return {
      allowed: false,
      reason: `Local CI error: ${error.message}`
    };
  }
}

/**
 * Main entry point when run as hook
 */
async function main() {
  const projectPath = process.cwd();

  const result = await prePushGate(projectPath);

  if (result.allowed) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('[CTOC] Pre-push gate error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  prePushGate,
  formatOutput
};

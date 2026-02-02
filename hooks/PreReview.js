#!/usr/bin/env node
/**
 * CTOC Pre-Review Hook
 *
 * Blocks moving code to review until local CI passes.
 * This is an ABSOLUTE gate - no bypass mechanism exists.
 *
 * @module hooks/PreReview
 */

const { runLocalCI, CI_STATUS } = require('../lib/local-ci');
const { writeToTerminal, colors } = require('../lib/ui');

/**
 * Format the CI gate output for pre-review
 * @param {Object} ciResult - CI results
 * @param {boolean} passed - Whether all checks passed
 * @returns {string} Formatted output
 */
function formatOutput(ciResult, passed) {
  const c = colors;
  let output = '\n';

  output += '='.repeat(70) + '\n';
  output += `${c.cyan}LOCAL CI GATE - PRE-REVIEW CHECK${c.reset}\n`;
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
    output += `  ${c.green}+     ALL CHECKS PASSED - READY FOR REVIEW     +${c.reset}\n`;
    output += '  ' + '+'.repeat(50) + '\n\n';

    output += `  ${c.green}Passed:${c.reset} ${ciResult.passed}/${ciResult.total}\n`;
    output += `  ${c.dim}Failed:${c.reset} ${ciResult.failed}/${ciResult.total}\n\n`;

    output += `  Code is verified and ready for human review.\n`;
  } else {
    output += '  ' + '!'.repeat(50) + '\n';
    output += `  ${c.red}!   LOCAL CI FAILED - CANNOT MOVE TO REVIEW    !${c.reset}\n`;
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
    output += `  ${c.yellow}ACTION REQUIRED:${c.reset}\n`;
    output += `    1. Fix the failing checks above\n`;
    output += `    2. Run: ctoc ci (to verify locally)\n`;
    output += `    3. Only then can code move to review\n\n`;

    output += `  ${c.cyan}THE LOCAL CI GATE IS ABSOLUTE. NO BYPASS EXISTS.${c.reset}\n`;
  }

  output += '\n' + '='.repeat(70) + '\n';

  return output;
}

/**
 * Pre-review gate check
 * Runs local CI and blocks review if any check fails.
 *
 * @param {string} projectPath - Project root path
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function preReviewGate(projectPath = process.cwd()) {
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
    output += `  Cannot verify code quality. Review blocked.\n`;
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

  const result = await preReviewGate(projectPath);

  if (result.allowed) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('[CTOC] Pre-review gate error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  preReviewGate,
  formatOutput
};

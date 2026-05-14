#!/usr/bin/env node
/**
 * CTOC budget-status CLI — prints current session usage vs limits.
 *
 * Backs the /ctoc:budget slash command (src/commands/budget.md).
 *
 * Usage:
 *   node src/scripts/budget-status.js              # print status
 *   node src/scripts/budget-status.js --reset      # clear current session counters
 *
 * Exit codes:
 *   0 = within limits
 *   1 = over limits (caller may halt)
 */

const budget = require('../lib/budget');

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--reset')) {
    budget.resetSession();
    console.log('Budget session reset.');
    return 0;
  }

  const text = budget.formatStatus();
  console.log(text);
  const result = budget.checkBudget();
  return result.withinLimits ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };

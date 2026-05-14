#!/usr/bin/env node
/**
 * CTOC self-check CLI.
 *
 * Usage:
 *   node src/scripts/run-self-check.js [--mode=fast|thorough] [--scope=architecture,iron-loop,...] [--json]
 */

const { checkAllInvariants, formatReport } = require('../lib/iron-loop-enforcer');

function parseArgs() {
  const args = { mode: 'thorough', scopes: undefined, json: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--json') args.json = true;
    else if (a.startsWith('--mode=')) args.mode = a.slice(7);
    else if (a.startsWith('--scope=')) args.scopes = a.slice(8).split(',');
    else if (a === '--fast') args.mode = 'fast';
    else if (a === '--thorough') args.mode = 'thorough';
  }
  return args;
}

const args = parseArgs();
const result = checkAllInvariants({ mode: args.mode, scopes: args.scopes });

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatReport(result));
}

// Exit non-zero on critical or block, so this is usable in CI
process.exit(result.summary.critical > 0 || result.summary.block > 0 ? 1 : 0);

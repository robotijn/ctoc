#!/usr/bin/env node
/**
 * CTOC Bash Gate Hook
 * Blocks file-writing Bash commands before Step 8
 * Blocks git commit before Step 15
 *
 * Exit codes:
 * - 0: Command allowed
 * - 1: Command blocked
 */

const { loadState, STEP_NAMES } = require('../lib/state-manager');
const { writeToTerminal, colors } = require('../lib/ui');

const MINIMUM_STEP_FOR_WRITE = 8;
const MINIMUM_STEP_FOR_COMMIT = 15;

/**
 * Patterns that indicate file-writing commands
 */
const WRITE_PATTERNS = [
  /[^>]>\s*[^\s>]/,            // Single redirect
  />>\s*[^\s]/,                // Append redirect
  /\btee\s+/,                  // tee command
  /\bsed\s+.*-i/,              // sed in-place
  /\bawk\s+.*-i\s*inplace/,    // awk in-place
  /\bperl\s+.*-i/,             // perl in-place
  /\binstall\s+/,              // install command
  /\bpatch\s+/,                // patch command
  /\btouch\s+/,                // touch command
  /\bdd\s+/,                   // dd command
  /\btruncate\s+/              // truncate command
];

/**
 * Commands that are always allowed
 */
const ALWAYS_ALLOWED = [
  /^\s*node\s+/,
  /^\s*npm\s+/,
  /^\s*npx\s+/,
  /^\s*python\s+/,
  /^\s*pip\s+/,
  /^\s*cargo\s+/,
  /^\s*ls\s*/,
  /^\s*cat\s+[^>|]+$/,
  /^\s*find\s+/,
  /^\s*grep\s+/,
  /^\s*head\s+/,
  /^\s*tail\s+/,
  /^\s*pwd\s*/,
  /^\s*cd\s+/,
  /^\s*echo\s+[^>]+$/
];

/**
 * Git commit pattern (kept for reference / simple single-segment cases).
 * NOTE: the anchored form alone is bypassable (see isCommitCommand below).
 */
const GIT_COMMIT_PATTERN = /^\s*git\s+(commit|push)/;

// git global flags that take a separate argument (so the next token is the
// flag's value, not the subcommand). Used to find the real subcommand.
const GIT_VALUE_FLAGS = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix']);

/**
 * Check if command is a write command
 */
function isWriteCommand(command) {
  if (!command) return false;

  const normalized = command.trim().toLowerCase();

  // Check always allowed
  for (const pattern of ALWAYS_ALLOWED) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // Check write patterns
  for (const pattern of WRITE_PATTERNS) {
    if (pattern.test(command)) {
      return true;
    }
  }

  // Check redirects
  if (command.includes(' > ') || command.includes(' >> ')) {
    return true;
  }

  return false;
}

/**
 * Check if a command invokes `git commit` or `git push` anywhere — including
 * when chained (`a; git commit`, `a && git push`, `a | git push`), substituted
 * (`$(git commit)`, backticks), or prefixed with global flags
 * (`git -c k=v commit`, `git -C . push`). The old `^\s*git\s+(commit|push)`
 * anchor only matched git as the very first token and missed all of these.
 */
function isCommitCommand(command) {
  if (!command) return false;
  // Split into candidate sub-commands across chaining / substitution boundaries.
  const segments = String(command).split(/[\n;]|&&|\|\||\||\$\(|`|\(/);
  for (const seg of segments) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean);
    const gi = tokens.indexOf('git');
    if (gi === -1) continue;
    // Walk tokens after `git`, skipping global flags and their arguments, to
    // find the real subcommand.
    let i = gi + 1;
    while (i < tokens.length) {
      const t = tokens[i];
      if (GIT_VALUE_FLAGS.has(t)) { i += 2; continue; } // flag + its value
      if (t.startsWith('-')) { i += 1; continue; }      // other global flag (incl. --foo=bar)
      if (t === 'commit' || t === 'push') return true;  // the subcommand
      break;                                            // some other subcommand (e.g. log)
    }
  }
  return false;
}

/**
 * Get command from tool input
 */
function getCommand() {
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';

  try {
    const parsed = JSON.parse(toolInput);
    return parsed.command || '';
  } catch {
    const match = toolInput.match(/command['":\s]+["']?([^"'\n]+)/);
    return match ? match[1] : toolInput;
  }
}

/**
 * Format blocked output
 */
function formatBlocked(command, state, reason, blockType) {
  const c = colors;
  const currentStep = state?.currentStep || 1;
  const stepName = STEP_NAMES[currentStep] || 'Unknown';
  const featureName = state?.feature || 'No feature';

  const displayCommand = command.length > 60
    ? command.substring(0, 57) + '...'
    : command;

  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += `${c.red}CTOC IRON LOOP - BASH ${blockType} BLOCKED${c.reset}\n`;
  output += '='.repeat(70) + '\n\n';

  output += `Feature: ${featureName}\n`;
  output += `Current Step: ${currentStep} (${stepName})\n\n`;

  output += 'BLOCKED COMMAND:\n';
  output += `  ${displayCommand}\n\n`;

  output += `${c.yellow}REASON:${c.reset} ${reason}\n\n`;

  output += `${c.cyan}THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.${c.reset}\n`;

  output += '\n' + '='.repeat(70) + '\n';

  return output;
}

/**
 * Main gate check
 */
async function main() {
  const projectPath = process.cwd();
  const command = getCommand();

  if (!command) {
    process.exit(0);
  }

  // D4: Block raw mv/cp of plan files between stage directories
  // All plan transitions MUST go through approvePlan() in lib/actions.js
  const PLAN_STAGES = 'functional|implementation|todo|in-progress|review|done';
  const PLAN_MOVE_PATTERN = new RegExp(
    `\\b(mv|cp)\\b.*plans\\/(${PLAN_STAGES})\\/`
  );

  // Whitelist: node scripts/move-plan.js (controlled API for agents)
  const isMoveScript = /\bnode\b.*scripts\/move-plan\.js\b/.test(command);

  if (PLAN_MOVE_PATTERN.test(command) && !isMoveScript) {
    const c = colors;
    let output = '\n';
    output += '='.repeat(70) + '\n';
    output += `${c.red}HUMAN GATE ENFORCEMENT — PLAN MOVE BLOCKED${c.reset}\n`;
    output += '='.repeat(70) + '\n\n';
    output += 'BLOCKED COMMAND:\n';
    output += `  ${command.length > 60 ? command.substring(0, 57) + '...' : command}\n\n`;
    output += `${c.yellow}REASON:${c.reset} Plan files cannot be moved with raw mv/cp.\n`;
    output += 'All plan transitions must go through the menu:\n';
    output += '  Approve -> validates -> checks human gate -> moves file\n\n';
    output += `${c.cyan}Use the dashboard menu to approve plan transitions.${c.reset}\n`;
    output += '\n' + '='.repeat(70) + '\n';
    writeToTerminal(output);
    process.exit(1);
  }

  // Load state
  const stateResult = loadState(projectPath);
  const state = stateResult.state;
  const currentStep = state?.currentStep || 1;

  // Check for git commit
  if (isCommitCommand(command)) {
    if (currentStep < MINIMUM_STEP_FOR_COMMIT) {
      const reason = `Commit requires step ${MINIMUM_STEP_FOR_COMMIT}+ (DOCUMENT). Current: ${currentStep}`;
      writeToTerminal(formatBlocked(command, state, reason, 'COMMIT'));
      process.exit(1);
    }
    // Commit allowed
    process.exit(0);
  }

  // Check for write command
  if (isWriteCommand(command)) {
    // No feature context - block
    if (!state || !state.feature) {
      const reason = 'No feature context - write commands not allowed';
      writeToTerminal(formatBlocked(command, state, reason, 'WRITE'));
      process.exit(1);
    }

    // Before step 7 - block
    if (currentStep < MINIMUM_STEP_FOR_WRITE) {
      const reason = `Step ${currentStep} < ${MINIMUM_STEP_FOR_WRITE} - planning not complete`;
      writeToTerminal(formatBlocked(command, state, reason, 'WRITE'));
      process.exit(1);
    }
  }

  // Command allowed
  process.exit(0);
}

main().catch(err => {
  console.error('[CTOC] Bash gate error:', err.message);
  process.exit(1);
});

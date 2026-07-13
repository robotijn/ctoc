#!/usr/bin/env node
/**
 * CTOC Bash Gate Hook
 * Blocks file-writing Bash commands before Step 8
 * Blocks git commit before Step 15
 * Blocks irreversible/destructive commands and raw plan-file moves
 *
 * INPUT (W01-s2, finding C2): the PreToolUse payload arrives on STDIN (fd 0) as
 * JSON ({ tool_name, tool_input: { command } }) — the same transport
 * PreToolUse.Edit.js reads. The hook does NOT read process.env.CLAUDE_TOOL_INPUT
 * (the harness never sets it; reading it made the gate see an empty command and
 * allow everything).
 *
 * SIGNALLING (W01-s2, finding C1): a block is emitted via the shared
 * `../lib/hook-deny-signal` emitter — the Claude Code PreToolUse decision JSON
 * `permissionDecision:"deny"` on stdout + exit 0 — the identical signal Edit and
 * Write use, replacing the legacy cosmetic `process.exit(1)` the harness treated
 * as non-blocking. Human banners stay on STDERR (writeToTerminal → process.stderr)
 * so stdout carries ONLY the decision JSON. An allowed command exits 0 silent.
 */

const fs = require('fs');
const { loadState, STEP_NAMES } = require('../lib/state-manager');
const { writeToTerminal, colors } = require('../lib/ui');
const { emitDeny } = require('../lib/hook-deny-signal');

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

// Irreversible / destructive commands — always blocked regardless of the Iron
// Loop step. Ported from the opus-pack guard-bash.sh blocklist and hardened
// against ReDoS + command-boundary false-matches. Every entry is a LITERAL,
// case-insensitive RegExp (no dynamic / data-derived construction), so there is
// no new-RegExp-on-untrusted-input surface. These are pure shell-command STRING
// matches, inherently cross-platform to check.
//
// Destructive command WORDS (dd, mkfs, chmod, terraform, kubectl) are anchored
// at a command boundary `(?:^|[\s;&|(])` so they only match at the start of a
// command or after a shell separator — NOT inside a longer word: `add if=` does
// NOT match `dd if=`, `perform -rf` does NOT match `rm -rf`.
//
// Git destructive SUBCOMMANDS (push --force, reset --hard, clean -f, branch -D,
// checkout .) are NOT matched here — they are resolved through the git
// token-walk in isDestructiveGitCommand(), so interposed global flags
// (`git -c k=v push --force`, `git -C dir reset --hard`) cannot bypass them.
const IRREVERSIBLE_PATTERNS = [
  // Force-push net: lazy `.*?` single flexible run — non-backtracking, runs
  // <1ms on a 200k-space input (the old `.*--force` form was O(n²), ~13s).
  // Also catches force-push even with interposed global flags.
  /\bgit\b.*\bpush\b.*?--force(-with-lease)?\b/i,
  /(?:^|[\s;&|(])DROP\s+(TABLE|DATABASE|SCHEMA)/i,
  /(?:^|[\s;&|(])TRUNCATE\s+TABLE/i,
  /(?:^|[\s;&|(])terraform\s+destroy\b/i,
  /(?:^|[\s;&|(])kubectl\s+delete\s+(namespace|deployment|pvc)/i,
  /(?:^|[\s;&|(])mkfs\./i,
  /(?:^|[\s;&|(])dd\s+if=/i,
  />\s*\/dev\/sd/i,
  /(?:^|[\s;&|(])chmod\s+-R\s+777/i,
];

// SQL-driver tokens. DELETE/DROP/TRUNCATE only count as destructive when the
// command actually invokes a database driver — so a shell echo or prose
// mentioning "DELETE FROM" is ALLOWED, while a real driver-issued delete (with
// or WITHOUT a WHERE clause) is BLOCKED. Chosen over dropping the `$` anchor
// because it eliminates the benign-echo false-positive entirely.
const SQL_DRIVER = /\b(psql|mysql|mariadb|sqlite3|sqlcmd|mongo|mongosh)\b/i;
const SQL_DELETE = /\bDELETE\s+FROM\s+\w+/i;

/**
 * True when a `rm` command word (anchored at a command boundary) carries BOTH a
 * recursive flag and a force flag, in any order / position / split form:
 *   rm -rf, rm -fr, rm -r -f, rm -f -r, rm --recursive --force, rm -R -f, …
 * Recursive: -r, -R, --recursive, or a combined short cluster containing r/R.
 * Force:     -f, --force, or a combined short cluster containing f.
 * @param {string} command
 * @returns {boolean}
 */
function isDestructiveRm(command) {
  // Anchor `rm` at a command boundary so `confirm -rf` / `perform -rf` do NOT
  // match. Capture the argument tail up to the next command separator.
  const m = command.match(/(?:^|[\s;&|(])rm\s+([^;&|]*)/i);
  if (!m) return false;
  const args = m[1];
  // Collect the flag tokens (leading `-`), ignoring path operands.
  const flagTokens = args.split(/\s+/).filter(t => t.startsWith('-'));
  let recursive = false;
  let force = false;
  for (const tok of flagTokens) {
    if (tok === '--recursive' || tok === '--force') {
      if (tok === '--recursive') recursive = true;
      if (tok === '--force') force = true;
      continue;
    }
    // Short cluster like -rf, -R, -fr, -r, -f. Inspect the letters.
    if (/^-[a-z]+$/i.test(tok)) {
      if (/r/i.test(tok)) recursive = true;
      if (/f/.test(tok)) force = true; // force flag is lowercase f (upper-F not force)
    }
  }
  return recursive && force;
}

/**
 * True when the command matches any irreversible/destructive pattern.
 * @param {string} command
 * @returns {boolean}
 */
function isIrreversibleCommand(command) {
  if (!command) return false;
  if (IRREVERSIBLE_PATTERNS.some(p => p.test(command))) return true;
  if (isDestructiveRm(command)) return true;
  if (isDestructiveGitCommand(command)) return true;
  if (SQL_DRIVER.test(command) && SQL_DELETE.test(command)) return true;
  return false;
}

// git global flags that take a separate argument (so the next token is the
// flag's value, not the subcommand). Used to find the real subcommand.
const GIT_VALUE_FLAGS = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix']);

/**
 * Resolve the real git subcommand + its argument tokens for one command,
 * skipping git GLOBAL flags (`-c k=v`, `-C dir`, `--git-dir=…`) via the same
 * token-walk isCommitCommand uses. Returns null when the segment is not a git
 * invocation. Splits on chaining/substitution boundaries and returns the FIRST
 * git subcommand found (sufficient for the destructive-git check, which OR-folds
 * over segments below).
 * @param {string} command
 * @returns {Array<{sub: string, args: string[]}>} one entry per git segment
 */
function resolveGitSubcommands(command) {
  const out = [];
  const segments = String(command).split(/[\n;]|&&|\|\||\||\$\(|`|\(/);
  for (const seg of segments) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean);
    const gi = tokens.indexOf('git');
    if (gi === -1) continue;
    let i = gi + 1;
    while (i < tokens.length) {
      const t = tokens[i];
      if (GIT_VALUE_FLAGS.has(t)) { i += 2; continue; }   // global flag + value
      if (t.startsWith('-')) { i += 1; continue; }        // other global flag (incl. --foo=bar)
      out.push({ sub: t, args: tokens.slice(i + 1) });    // resolved subcommand + args
      break;
    }
  }
  return out;
}

/**
 * True when a git invocation resolves to a DESTRUCTIVE subcommand — regardless
 * of interposed global flags (`git -c core.pager=cat push --force`,
 * `git -C dir reset --hard`, `git --git-dir=.g clean -d -f`):
 *   push … --force / --force-with-lease / -f   (also caught by the regex net)
 *   reset --hard
 *   clean  with -f / --force anywhere
 *   branch with -D / --delete
 *   checkout .   (discards working-tree changes)
 * @param {string} command
 * @returns {boolean}
 */
function isDestructiveGitCommand(command) {
  for (const { sub, args } of resolveGitSubcommands(command)) {
    if (sub === 'push') {
      if (args.some(a => a === '--force' || a === '--force-with-lease' || a === '-f' ||
        a === '--delete' || a === '-D')) return true;
    } else if (sub === 'reset') {
      if (args.includes('--hard')) return true;
    } else if (sub === 'clean') {
      if (args.some(a => a === '--force' || (/^-[a-z]*f[a-z]*$/i.test(a)))) return true;
    } else if (sub === 'branch') {
      if (args.some(a => a === '-D' || a === '--delete')) return true;
    } else if (sub === 'checkout') {
      if (args.includes('.')) return true;
    }
  }
  return false;
}

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
 * Read the Bash command from the PreToolUse payload on STDIN (fd 0). The pipe is
 * single-consumer, so `main()` calls this exactly once. Fails OPEN (returns '')
 * on any read/parse error — a broken pipe cannot crash the gate; an empty
 * command is then allowed by `main()`'s first check.
 * @returns {string} the command string, or '' when unreadable/absent.
 */
function getCommand() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8') || ''; } catch { return ''; }
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return (parsed && parsed.tool_input && parsed.tool_input.command)
      || (parsed && parsed.command) || '';
  } catch {
    const m = raw.match(/command['":\s]+["']?([^"'\n]+)/);
    return m ? m[1] : '';
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

  // OM2: Irreversible-command blocklist — the FIRST deny layer, BEFORE the
  // plan-move / commit / write gates, so a destructive command is denied
  // regardless of the Iron Loop step. Same input channel (stdin) and same block
  // signal (shared permissionDecision:"deny" emitter) as every other Bash gate.
  if (isIrreversibleCommand(command)) {
    const irreversibleState = loadState(projectPath);
    writeToTerminal(formatBlocked(
      command,
      irreversibleState.state,
      'Irreversible/destructive command. State the action and its blast radius to the human and get explicit confirmation; the human runs it directly (or temporarily disables this guard).',
      'IRREVERSIBLE'
    ));
    emitDeny(`CTOC: irreversible/destructive command blocked: ${command}`);
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
    emitDeny(`CTOC: raw mv/cp of a plan file blocked — plan moves must go through the menu (human gate): ${command}`);
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
      emitDeny(`CTOC: commit blocked before Step ${MINIMUM_STEP_FOR_COMMIT} (DOCUMENT). Current step ${currentStep}.`);
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
      emitDeny('CTOC: write command blocked — no active feature context.');
    }

    // Before step 7 - block
    if (currentStep < MINIMUM_STEP_FOR_WRITE) {
      const reason = `Step ${currentStep} < ${MINIMUM_STEP_FOR_WRITE} - planning not complete`;
      writeToTerminal(formatBlocked(command, state, reason, 'WRITE'));
      emitDeny(`CTOC: write command blocked — planning not complete (step ${currentStep} < ${MINIMUM_STEP_FOR_WRITE}).`);
    }
  }

  // Command allowed
  process.exit(0);
}

main().catch(err => {
  console.error('[CTOC] Bash gate error:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * CTOC Bash Gate Hook
 * Blocks file-writing Bash commands before Step 8
 * Blocks git commit before Step 15
 * Blocks irreversible/destructive commands and raw plan-file moves
 * Blocks LEDGER FORGERY through the Bash channel (R3-A) — see below
 *
 * LEDGER PARITY (R3-A, the reason this hook was rewritten). The approval ledger
 * (`.ctoc/approvals/`) is CTOC's only source of human-approval truth, and
 * `PreToolUse.Edit.js` denies every Edit/Write/MultiEdit/NotebookEdit call that
 * targets it. Until this slice the Bash channel had NO such deny: this file never
 * mentioned `.ctoc/approvals`, and its `ALWAYS_ALLOWED` list matched
 * `/^\s*node\s+/` FIRST — so
 *   node -e "require('./src/lib/approval-ledger').writeEntry(…)"
 * minted a human-kind approval entry and forged Gate 2 or Gate 3, and
 *   cat > .ctoc/approvals/x.json
 * forged one with no node at all. `isLedgerForgery()` now runs as the FIRST deny
 * layer in `main()` — before `ALWAYS_ALLOWED`, before the irreversible net, before
 * the step gates — so no allowlist can short-circuit past it.
 *
 * WHAT IT DENIES (exactly, and no more — a false positive that breaks a menu
 * recipe is a CRITICAL regression, so the deny is narrow BY DESIGN):
 *   1. any command that TOUCHES `.ctoc/approvals` in a non-read-only way (redirect,
 *      append, tee, cp, mv, rm, touch, sed -i, install, an interpreter, …);
 *   2. INLINE-EVAL commands (`node -e`/`--eval`/`-p`/`--print`, a script piped or
 *      heredoc'd into `node`) whose text references the ledger module, the ledger
 *      directory, or a gate-crossing/ledger-writing function name;
 *   3. INLINE-EVAL commands that cannot be statically cleared at all — a command
 *      substitution (`$(…)`/backticks) inside the payload, a non-literal
 *      `require(…)` argument (string concatenation / template / variable), or a
 *      base64/xxd/openssl decode piped into an interpreter.
 *
 * WHAT IT STILL ALLOWS: `node -e` in general (every `src/commands/menu.md` recipe —
 * compliance write, cleanup exec, plan numbering, environment, dismiss-stale —
 * keeps working; asserted verbatim against the live menu.md by
 * tests/ledger-forgery-closed.test.js), read-only inspection of the ledger
 * (`cat`/`ls`/`grep`), and the ONE sanctioned ledger writer:
 * `node src/scripts/ledger-backfill.js` (argv-driven, no eval, reviewable).
 *
 * HONEST LIMITS (this is a static string gate, not a sandbox — do not read it as
 * more than it is): a determined agent can still reach the ledger through a
 * NON-eval path this gate cannot statically see — writing an arbitrary .js file
 * under a plan-covered path and running `node that-file.js`, or driving another
 * module that legitimately writes a pipeline entry (`stale-cleanup`). Those paths
 * are reviewable artifacts (a checked-in file, a stale-cleanup log entry), which is
 * exactly the difference from the un-auditable one-liner this deny closes.
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
const path = require('path');
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

// ---------------------------------------------------------------------------
// LEDGER FORGERY GATE (R3-A). The FIRST deny layer in main(). Every regex below
// is a LITERAL, linear-time pattern (no nested quantifiers, no data-derived
// RegExp) so the hook stays a pure string check: no filesystem walk, no state
// read, sub-millisecond on any realistic command.
// ---------------------------------------------------------------------------

/** The sanctioned ledger writer, named in every deny message. */
const SANCTIONED_WRITER = 'src/scripts/ledger-backfill.js';

/**
 * Normalize a command for PATH matching: drop quote characters (so `.ctoc"/"approvals`
 * and `'.ctoc/approvals'` both reduce to the bare path), unify Windows separators,
 * and collapse whitespace runs. Used ONLY for matching — never for execution.
 * @param {string} command
 * @returns {string}
 */
function normalizeForMatch(command) {
  return String(command)
    .replace(/['"`\\]/g, (ch) => (ch === '\\' ? '/' : ''))
    .replace(/\s+/g, ' ');
}

/** The ledger directory, as it appears inside a command string (post-normalize). */
const LEDGER_PATH_RE = /\.ctoc\/+approvals/i;

/**
 * The ledger directory as a RESOLVED path fragment: `.ctoc/approvals` at a path
 * boundary. Tested against a cd-resolved token so `.ctoc/approvals-summary/x` does
 * NOT match while `.ctoc/approvals` and `.ctoc/approvals/x.json` do.
 */
const LEDGER_RESOLVED_RE = /(^|\/)\.ctoc\/+approvals(\/|$)/i;

/**
 * Adjacency match for the ledger dir ANYWHERE in a normalized command segment
 * (catches literal, quote-split, and inline-code forms), but PATH-BOUNDED so a
 * sibling like `.ctoc/approvals-summary/x`, `.ctoc/approvalsdata.txt`, or
 * `.ctoc/approvals.bak` does NOT false-match. `.ctoc/approvals` must be a whole
 * path component: preceded by a non-[a-z0-9._-] char (or start) and followed by a
 * `/`, whitespace, or end (quotes are already stripped by normalizeForMatch).
 */
const LEDGER_SEGMENT_RE = /(^|[^a-z0-9._-])\.ctoc\/+approvals(\/|\s|$)/i;

/**
 * Resolve one command token to a POSIX path against the accumulated cwd built up
 * from prior `cd`/`pushd` segments, stripping quotes, wrapping parens, and any
 * leading redirect operators. Matching-only — never used for execution.
 * @param {string} prefix - accumulated cwd ('' = repo root)
 * @param {string} token
 * @returns {string}
 */
function resolveTokenPath(prefix, token) {
  const t = String(token).replace(/['"`()]/g, '').replace(/^[<>]+/, '');
  if (!t) return '';
  if (t.startsWith('/')) return path.posix.normalize(t);
  return path.posix.normalize((prefix ? prefix + '/' : '') + t);
}

/**
 * Does a command make a NON-READ touch of the ledger directory — in ANY form:
 * literal-adjacent (`cp x .ctoc/approvals/y`), quote-split (`.ctoc"/"approvals`),
 * inline-code (`python3 -c "open('.ctoc/approvals/x','w')"`), OR split across a
 * `cd` (`cd .ctoc && cp forged.json approvals/x.json`)? This is the single ledger-
 * write gate — it SUBSUMES the old adjacency-only check, which both missed the
 * cd-split bypass (cp/mv are not write-patterns and `.ctoc/`+`approvals` were not
 * adjacent) AND false-denied a read reached through a `cd` (its read exemption
 * only inspected the command's FIRST verb, so `cd .ctoc/approvals && cat x` — a
 * read — was blocked because the first verb was `cd`).
 *
 * Evaluated PER shell segment, tracking the cwd across `cd`/`pushd`:
 *  • a `cd`/`pushd` segment only updates the cwd — it is never itself a write, so
 *    `cd .ctoc/approvals && ls` is allowed (the `ls` segment has no ledger operand);
 *  • a non-cd segment TOUCHES the ledger when its normalized text contains the
 *    adjacent `.ctoc/approvals`, OR one of its operands resolves under the ledger
 *    once the accumulated cd prefix is applied;
 *  • a touching segment is denied only when it is NOT a pure read — so
 *    `cat`/`ls`/`grep` of the ledger, with or without a preceding `cd`, stay
 *    allowed, while `cp`/`mv`/`tee`/redirect/`touch`/an interpreter are denied.
 *
 * Conservative-but-narrow: once the cwd is fully inside `.ctoc/approvals`, every
 * operand resolves under the ledger, so any non-read command there is denied —
 * standing inside the human-approval store to run a non-read command IS the
 * forgery shape (`cd .ctoc/approvals && git status` is denied; fail-closed, not a
 * menu recipe — accepted by design).
 * @param {string} command
 * @returns {boolean}
 */
function isLedgerWrite(command) {
  const segments = String(command).split(/[\n;]|&&|\|\||\|/);
  let prefix = '';
  for (const rawSeg of segments) {
    const seg = rawSeg.replace(/^[\s({]+/, '').trim();
    if (!seg) continue;
    const cd = seg.match(/^(?:cd|pushd)\s+([^\s;&|)]+)/i);
    if (cd) {
      const dir = cd[1].replace(/['"`()]/g, '');
      if (!dir || dir === '-') prefix = '';
      // A `~`/`~user` home prefix: STRIP only the tilde+user+slash and keep the
      // REMAINDER as a rooted prefix — do NOT discard the whole path. Resetting to
      // '' on any `~` threw away the ledger suffix, so `cd ~/…/.ctoc/approvals && tee
      // evil.json` resolved evil.json to root and slipped the forgery gate.
      else if (dir.startsWith('~')) prefix = path.posix.normalize(dir.replace(/^~[^/]*\/?/, ''));
      else if (dir.startsWith('/')) prefix = path.posix.normalize(dir);
      else prefix = path.posix.normalize((prefix ? prefix + '/' : '') + dir);
      continue;
    }
    // (a) adjacent path anywhere in the normalized segment (literal / quote-split
    //     / inline-code); OR (b) an operand resolving under the ledger via the cd
    //     prefix. Redirect operators become separators so `echo x>approvals/y` splits.
    let touches = LEDGER_SEGMENT_RE.test(normalizeForMatch(seg));
    if (!touches) {
      const tokens = seg.replace(/[<>]+/g, ' ').split(/\s+/).filter(Boolean);
      const operands = tokens.slice(1).filter((t) => !t.startsWith('-'));
      touches = operands.some((t) => LEDGER_RESOLVED_RE.test(resolveTokenPath(prefix, t)));
    }
    if (touches && !isReadOnlyLedgerCommand(seg)) return true;
  }
  return false;
}

/**
 * Tokens that make an INLINE-EVAL command a ledger/gate write. The module name and
 * the ledger directory are the direct routes; the function names are the indirect
 * ones (`approvePlan`/`approveSubplans` cross a human gate and stamp the ledger
 * themselves, so an inline eval of them forges the gate just as effectively).
 */
const LEDGER_EVAL_TOKENS = [
  /approval[-_]ledger/i,
  LEDGER_PATH_RE,
  /\bwriteEntry\b/,
  /\bwritePipelineEntry\b/,
  /\bwriteVisionArchiveEntry\b/,
  /\bbackfillEntry\b/,
  /\bpersistEntry\b/,
  /\bremoveEntry\b/,
  /\bstampAndLedger\b/,
  /\bapprovePlan\b/,
  /\bapproveSubplans\b/,
];

/**
 * A JS-runtime invocation carrying an inline-evaluation flag. Covers `node` and the
 * other JavaScript/TypeScript runtimes that can `require`/`import` a CommonJS module
 * and thus reach `approval-ledger` inline: `deno eval`/`deno run -`, `bun -e`/
 * `bun eval`, `ts-node -e`, `tsx -e`. Limiting this to `node` alone left a residual
 * (`deno eval "…approval-ledger…"`) that the re-attack in Step 13 found.
 */
const NODE_EVAL_FLAG_RE = /\b(node[0-9.]*|deno|bun|ts-node|tsx)\b[^;&|]*?\s-{1,2}(e|eval|p|print|pe|ep|input-type)\b/i;
/** `deno eval "<code>"` — deno spells its inline-eval as a subcommand, not a flag. */
const DENO_EVAL_RE = /\bdeno\s+eval\b/i;
/** `bun eval "<code>"` — bun's subcommand form. */
const BUN_EVAL_RE = /\bbun\s+eval\b/i;
/** A script fed into a JS runtime through stdin: a pipe, a heredoc, or the `-` operand. */
const NODE_STDIN_RE = /(\|\s*(node[0-9.]*|deno|bun)\b)|(\b(node[0-9.]*|deno|bun)[0-9.]*\s*<)|(\b(node[0-9.]*|deno\s+run|bun)\s+-\s*$)/i;
/** An opaque decoder feeding an interpreter — payload unknowable to a static gate. */
const OPAQUE_DECODE_RE = /\b(base64|xxd|uudecode|openssl\s+enc)\b[^\n]*\|\s*(node[0-9.]*|sh|bash|zsh|python[0-9.]*)\b/i;
/** A command substitution anywhere in the command (`$(…)` or backticks). */
const COMMAND_SUBSTITUTION_RE = /\$\(|`/;
/** Every `require(<arg>)` occurrence, so the argument can be checked for literalness. */
const REQUIRE_ARG_RE = /require\s*\(\s*([^)]*)\)/gi;
/** A require argument that is a SINGLE quoted literal (no concat, no template, no variable). */
const LITERAL_REQUIRE_ARG_RE = /^(['"])[^'"+`]*\1$/;

/**
 * Does this command evaluate code inline (rather than running a checked-in file)?
 * @param {string} command
 * @returns {boolean}
 */
function isInlineEval(command) {
  if (!command) return false;
  return NODE_EVAL_FLAG_RE.test(command) || DENO_EVAL_RE.test(command)
    || BUN_EVAL_RE.test(command) || NODE_STDIN_RE.test(command);
}

/**
 * Is this command a PURE READ of the ledger directory (`cat`/`ls`/`grep` …)? Reading
 * provenance is legitimate and stays allowed; anything else that names the ledger
 * path is denied. Fail-CLOSED: an unrecognized command shape touching the ledger is
 * NOT a read.
 * @param {string} command - the raw command
 * @returns {boolean}
 */
function isReadOnlyLedgerCommand(command) {
  const READ_CMD = /^\s*(cat|ls|head|tail|grep|egrep|rg|find|wc|stat|file|jq|diff|cmp|shasum|sha256sum|md5sum|tree|du|less|more)\b/i;
  const WRITEISH = /(>)|(\btee\b)|(\bcp\b)|(\bmv\b)|(\brm\b)|(\bsed\b)|(\bawk\b)|(\bperl\b)|(\bpython[0-9.]*\b)|(\bnode[0-9.]*\b)|(\b(ba|z)?sh\b)|(\bdd\b)|(\binstall\b)|(\btouch\b)|(\btruncate\b)|(\bchmod\b)|(\bln\b)|(\bcurl\b)|(\bwget\b)|(\bmkdir\b)|(\bpatch\b)/i;
  return READ_CMD.test(command) && !WRITEISH.test(command);
}

/**
 * The ledger-forgery decision. PURE (no I/O), so it is directly testable and runs
 * before any state load.
 *
 * @param {string} command - the raw Bash command from the PreToolUse payload
 * @returns {{deny: boolean, reason: (string|null)}}
 */
function isLedgerForgery(command) {
  if (!command) return { deny: false, reason: null };
  const norm = normalizeForMatch(command);

  // 1. A NON-READ touch of the ledger directory in ANY form — literal-adjacent,
  //    quote-split, inline-code, or split across a `cd`. Per-segment + cd-aware, so
  //    reads (incl. `cd .ctoc/approvals && cat x`) stay allowed.
  if (isLedgerWrite(command)) {
    return {
      deny: true,
      reason: `writes to the approval ledger (.ctoc/approvals/) are DENIED on the Bash channel — the ledger is human-approval provenance, and splitting the path across a \`cd\` does not change that. Cross the gate through /ctoc:menu; the ONLY sanctioned ledger writer is \`node ${SANCTIONED_WRITER}\` (argv-driven, reviewable).`,
    };
  }

  if (!isInlineEval(command)) return { deny: false, reason: null };

  // 2. Inline evaluation that reaches the ledger module / directory / gate verbs.
  for (const token of LEDGER_EVAL_TOKENS) {
    if (token.test(norm)) {
      return {
        deny: true,
        reason: `inline evaluation (node -e / --eval / -p / stdin) that touches the approval ledger or a gate-crossing verb is DENIED — that one-liner forges a human approval. Use the menu to cross a gate, or the sanctioned \`node ${SANCTIONED_WRITER}\` for a migration.`,
      };
    }
  }

  // 3. Inline evaluation that cannot be statically cleared: a command substitution
  //    in the payload, or a require() whose argument is not a plain literal — both
  //    hide the real payload from this gate, so they are refused rather than guessed.
  if (COMMAND_SUBSTITUTION_RE.test(command)) {
    return {
      deny: true,
      reason: `inline evaluation whose payload comes from a command substitution cannot be statically cleared, so it is DENIED (it can smuggle an approval-ledger write). Put the code in a checked-in script and run that file instead.`,
    };
  }
  REQUIRE_ARG_RE.lastIndex = 0;
  let m;
  while ((m = REQUIRE_ARG_RE.exec(command)) !== null) {
    if (!LITERAL_REQUIRE_ARG_RE.test(m[1].trim())) {
      return {
        deny: true,
        reason: `inline evaluation with a non-literal require() argument cannot be statically cleared, so it is DENIED (string concatenation hides an approval-ledger require). Use a literal module path, or a checked-in script.`,
      };
    }
  }

  return { deny: false, reason: null };
}

/**
 * An opaque decoder piped into an interpreter (`base64 -d | node`, `xxd -r | bash`):
 * the payload is unknowable to a static gate, so it is refused outright.
 * @param {string} command
 * @returns {boolean}
 */
function isOpaqueDecodedExecution(command) {
  return !!command && OPAQUE_DECODE_RE.test(command);
}

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

  // R3-A: LEDGER FORGERY — the FIRST deny layer of all, ahead of ALWAYS_ALLOWED
  // (which matches /^\s*node\s+/ and would otherwise wave the forging one-liner
  // straight through) and ahead of every step gate, so no allowlist and no Iron
  // Loop step can short-circuit past it. Pure string check: no state read, no fs.
  const forgery = isLedgerForgery(command);
  const opaque = isOpaqueDecodedExecution(command);
  if (forgery.deny || opaque) {
    const reason = forgery.deny
      ? forgery.reason
      : 'a base64/xxd/openssl-decoded payload piped into an interpreter cannot be statically cleared, so it is DENIED (it can smuggle an approval-ledger write).';
    const ledgerState = loadState(projectPath);
    writeToTerminal(formatBlocked(command, ledgerState.state, reason, 'LEDGER'));
    emitDeny(`CTOC: approval-ledger forgery blocked — ${reason}`);
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

// This hook is invoked ONLY as a subprocess (the registered PreToolUse.Bash
// command; the security + forgery tests SPAWN it as the harness does). It exports
// NOTHING on purpose: the ledger-forgery decision (`isLedgerForgery`) is exercised
// through the real spawned process — the strongest possible test — so there is no
// live in-process caller for a module export, and adding one would be a dead export
// (the reachability fence's "a test is not a caller" rule).
main().catch(err => {
  console.error('[CTOC] Bash gate error:', err.message);
  process.exit(1);
});

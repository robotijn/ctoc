#!/usr/bin/env node
'use strict';
/**
 * CTOC write protection for the records that decide whether a plan may move on —
 * the ONLY CTOC hook Claude Code loads. It is registered alone in `hooks/hooks.json`
 * at the plugin root (PreToolUse; Write, Edit, MultiEdit, NotebookEdit, Bash). Every
 * other CTOC hook stays unregistered on purpose (`.claude-plugin/hooks.json` is not a
 * manifest Claude Code reads).
 *
 * WHAT IT PROTECTS
 *   - the approval records, `.ctoc/approvals/` — CTOC's record of the owner's approvals;
 *   - the check records, `.ctoc/state/verify/` — the Step-14 evidence a plan reaches done on;
 *   - the owner's answers and the live question files, everything under
 *     `.ctoc/streaming/` except the waiting folder `.ctoc/streaming/questions/pending/`,
 *     where question-writing agents drop new questions with the Write tool.
 * Only CTOC's own menu code writes these (as Node file calls inside the menu process,
 * which never pass through a tool hook).
 *
 * WHAT IT REFUSES
 *   Editing tools: a target inside any of the three areas — after `..` is resolved, in
 *   any letter case, with `\` read as `/`, through a symbolic link, and also by a
 *   root-independent path test so a session outside the project cannot write another
 *   copy's records. Reuses `PreToolUse.Edit.js` (`isProtectedLedgerPath`,
 *   `isProtectedVerifyPath`, `targetsStreamingLive`).
 *   Shell: a non-read command naming any area, directly, after a `cd`, from the
 *   session's working directory, or through a symbolic link; an inline script naming a
 *   record writer (the approval-ledger names, `step-13-verify`, `persistVerifyResult`,
 *   `verifyEvidencePath`, `crossBySufficiency`, `streamApprove`, `streamAnswer`) or
 *   whose code is built at run time; a decoded payload piped into an interpreter; and
 *   `ledger-backfill.js` in any form except `--vision` (optionally `--dry-run`).
 *   Reuses `PreToolUse.Bash.js` (`isLedgerForgery`, `isLedgerWrite`, `isInlineEval`,
 *   `isOpaqueDecodedExecution`, `VERIFY_SPEC`). A pure call of THIS plugin's own menu
 *   entry point is checked differently: no `$` other than `${CLAUDE_PLUGIN_ROOT}`, no
 *   backtick, backslash or unquoted control character, and the script argument —
 *   `${CLAUDE_PLUGIN_ROOT}` read as this plugin's root, resolved against the session's
 *   working directory — must have the same real path as this plugin's
 *   `src/commands/start.js` (a resolution fault means "not the menu"). The menu is the
 *   legitimate writer, so its quoted text arguments are data (a `--summary` may name a
 *   folder); but any whitespace-free argument that is a path into the approval or check
 *   records is still refused, exactly as the same operand would be without the menu in
 *   front. The answer store is not in that argument check, because the menu's own
 *   question-generation recipe passes `--touches .ctoc/streaming/questions/<ref>` as data.
 *   A Bash payload whose `command` is not a string is treated as unreadable (fail rule).
 *   A BACKGROUND AGENT (a payload with a non-empty `agent_id`, which Claude Code sends only
 *   for subagent calls) may run only the menu routes that write no answer, no approval and
 *   move no plan across a gate (`subagentMayRunRoute`: the build agent's own `menu task
 *   complete` without `--continue`, the task registry, the dashboard, the read-only screens,
 *   `plan <ref>`), matched as the WHOLE route with `menu task` held to its grammar and a
 *   `--b64` payload decoded by the task parser's own decoder; every other route is refused
 *   with its own sentence, fail closed. Its command gets ONE reading (`subagentMenuRefusal`):
 *   naming the menu, a menu module or a crossing function, it must be one simple call with no
 *   shell operator or expansion outside quotes, and is then allowed only as a read-only
 *   program naming the files or as the direct menu call — `node` (or an absolute node path),
 *   immediately this plugin's real `start.js`, an allowed route read with `start.js`'s own
 *   argument functions. No other script, no `node --test`, no option before the script, no
 *   `env` or `NAME=value` prefix, no other runtime. A double-quoted `--summary` the shell
 *   would expand gets one retry sentence ("Put the summary in single quotes …"). A call
 *   without `agent_id` is unchanged. Limits: a script written and then run without naming a
 *   menu module, a path held in a variable; and a harmless compound command naming the menu
 *   is refused (fail closed).
 *   Nothing else is loaded or run: no plan coverage, no escape phrases, no enforcement
 *   mode, no Iron Loop step gates, no irreversible-command net, no plan-move gate.
 *
 * WORKING DIRECTORY
 *   The hook calls `process.chdir(root)`, where `root` is the project root found by
 *   walking up from the payload's `cwd` (the same walk the menu uses). It does so because
 *   the reused checks measure paths against `process.cwd()`. This is safe only because
 *   every call is a fresh subprocess that exits right after deciding: the changed
 *   directory never outlives one decision and is never shared with another.
 *
 * WHAT IT CANNOT CATCH (it reads command text; it is not a sandbox)
 *   a script file written elsewhere and then run; a path built at run time (a variable,
 *   a glob, string pieces, `$'…'`); git operations that restore records without naming
 *   them; replacing a parent folder; hard links; operands beyond the first 128 per
 *   segment; file-writing tools other than the five matched; a background agent reaching a
 *   refused menu route through a script file, a path built at run time or another tool; and
 *   the main session running the menu's answering routes without the human's reply (it
 *   carries no `agent_id`). The full list is in `docs/ENFORCEMENT.md`.
 *
 * FAIL RULE
 *   A crash fails CLOSED only for a call that mentions the records
 *   (`UNCHECKED_SUSPECT_RE`, tested without loading anything but the dependency-free
 *   deny signal) and fails OPEN for the rest, so one broken release cannot stop every
 *   Write, Edit and Bash call in every project. When the payload parsed, only its
 *   `tool_input` is scanned, so a project whose path happens to contain one of the
 *   words (a `verify-project` folder) is not refused on every call; only a payload that
 *   will not parse is scanned whole. A crash on a background agent's call whose tool input
 *   mentions `start.js`, `menu-screens` or `streaming-gate` also fails closed; the main
 *   session's menu call does not. A failure to load `hook-deny-signal.js` itself
 *   exits 1, which Claude Code treats as "not blocked".
 *
 * Refusal = the refusal sentence as one line on stderr, then the deny decision JSON on
 * stdout and exit 2 (`emitDeny`). Claude Code ignores the JSON when a hook exits 2 and
 * shows stderr to the agent instead, so the stderr line is how the agent learns why.
 * Allow = exit 0 with nothing on stdout. No banner, no log file.
 */

const fs = require('fs');
const path = require('path');
const { emitDeny } = require('../lib/hook-deny-signal');

const REFUSAL = 'CTOC refused this call because it writes, or could write, the approval records, '
  + "the check records or the owner's recorded answers, which only CTOC's menu writes; "
  + 'finish your work, report it, and let the menu record the result.';
const REFUSAL_UNCHECKED = 'CTOC refused this call because it mentions the approval or check records '
  + "and CTOC's protection for them failed to run; tell the human that this protection is broken.";
/** The one plain retry sentence for a double-quoted argument the shell would still expand. */
const REFUSAL_QUOTE = 'Put the summary in single quotes and run the same command again.';
const REFUSAL_SUBAGENT = "CTOC refused this call because a background agent may not answer CTOC's questions, "
  + 'approve a plan or move one on through the menu; report your result and let the main session do it.';

/** A record area as a path segment anywhere in an absolute path; the waiting folder is excluded. */
const RECORD_SEGMENT_RE = /(^|\/)\.ctoc\/+(approvals|state\/+verify|streaming(?!\/+questions\/+pending(\/|$)))(\/|$)/i;

/**
 * The question-and-answer store for the shell's per-segment test (`isLedgerWrite`'s spec
 * shape). The whole store: the waiting folder's only writers hold the Write tool, not a shell.
 */
const STREAMING_SPEC = Object.freeze({
  dir: '.ctoc/streaming',
  segmentRe: /(^|[^a-z0-9._-])\.ctoc\/+streaming(\/|\s|$)/i,
  resolvedRe: /(^|\/)\.ctoc\/+streaming(\/|$)/i,
});

const CHECK_RECORD_EVAL_TOKENS = [
  /step-13-verify/i, /\bpersistVerifyResult\b/, /\bverifyEvidencePath\b/,
  /\bcrossBySufficiency\b/, /\bstreamApprove\b/, /\bstreamAnswer\b/,
];
const UNCHECKED_SUSPECT_RE = /\.ctoc|approval|verify|ledger|backfill|stampAndLedger|approvePlan|crossBySufficiency|streamApprove|streamAnswer|persistVerifyResult/i;
const EDITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const BACKFILL_TOKEN_RE = /(^|[/\\])ledger[-_]backfill(\.js)?$/i;
const JS_RUNTIME_RE = /^(node[0-9.]*|deno|bun|ts-node|tsx)(\.exe)?$/i;
const PLUGIN_ROOT_TOKEN = '${CLAUDE_PLUGIN_ROOT}';
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

/**
 * The arguments of a call of THIS plugin's menu entry point and nothing else, or null.
 * Null when the text holds a backslash, a backtick, a `$` other than
 * `${CLAUDE_PLUGIN_ROOT}`, an unclosed quote, or a `;`, `&`, `|`, `<`, `>`, carriage
 * return or newline outside quotes; when it is not `node <script> …`; or when the script,
 * with `${CLAUDE_PLUGIN_ROOT}` read as this plugin's root and resolved against `base`,
 * does not have the same real path as this plugin's own `src/commands/start.js`
 * (a resolution fault is "not the menu").
 * @param {string} command
 * @param {string} base - the session's working directory
 * @returns {string[]|null} the arguments after the script, quotes removed
 */
function menuCallArgs(command, base) {
  const s = command.trim();
  if (/[\\`]/.test(s) || s.split(PLUGIN_ROOT_TOKEN).join('').includes('$')) return null;
  const tokens = [];
  let cur = '';
  let inToken = false;
  let quote = null;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null; else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch; inToken = true;
    } else if (';&|<>\r\n'.includes(ch)) {
      return null;
    } else if (/\s/.test(ch)) {
      if (inToken) tokens.push(cur);
      cur = ''; inToken = false;
    } else {
      cur += ch; inToken = true;
    }
  }
  if (quote !== null) return null;
  if (inToken) tokens.push(cur);
  if (tokens[0] !== 'node' || !tokens[1]) return null;
  try {
    const safeFs = require('../lib/safe-fs');
    const script = path.resolve(base, tokens[1].split(PLUGIN_ROOT_TOKEN).join(PLUGIN_ROOT));
    const own = safeFs.realpathSync(path.join(PLUGIN_ROOT, 'src', 'commands', 'start.js'));
    return safeFs.realpathSync(script) === own ? tokens.slice(2) : null;
  } catch {
    return null; // a resolution fault (or safe-fs refusing the path) is "not the menu"
  }
}

/**
 * Does a genuine menu call carry an argument that is a path into the approval or check
 * records? Quoted text with whitespace is data and is skipped; every whitespace-free
 * argument gets the same per-segment, `cd`-aware, link-aware test as a shell operand.
 * @param {string[]} args - from `menuCallArgs`
 * @param {string} cwdRel - the session's working directory relative to the root, or ''
 * @param {object} bash - the exports of `PreToolUse.Bash.js`
 * @returns {boolean}
 */
function menuArgsNameRecords(args, cwdRel, bash) {
  const pathArgs = args.filter((a) => a && !/\s/.test(a));
  if (pathArgs.length === 0) return false;
  const synthetic = `${cwdRel ? `cd ./${cwdRel} && ` : ''}node ${pathArgs.join(' ')}`;
  return bash.isLedgerWrite(synthetic) || bash.isLedgerWrite(synthetic, bash.VERIFY_SPEC);
}

/**
 * Does the command run `ledger-backfill.js` in any form other than exactly
 * `<runtime> <script> --vision` (optionally with `--dry-run`, either order)?
 * @param {string} command
 * @param {{isInlineEval: function(string): boolean}} bash
 * @returns {boolean}
 */
function runsBackfillBeyondVision(command, bash) {
  if (!/ledger[-_]backfill/i.test(command)) return false;
  if (bash.isInlineEval(command)) return true;
  for (const seg of command.split(/\r?\n|;|&&|\|\||\||&/)) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/['"`]/g, ''));
    const at = tokens.findIndex((t) => BACKFILL_TOKEN_RE.test(t));
    if (at === -1) continue;
    const runtime = tokens.some((t) => JS_RUNTIME_RE.test(t.split(/[/\\]/).pop()));
    if (at !== 0 && !runtime) continue; // the segment only mentions the file
    const rest = tokens.slice(2).sort().join(' ');
    const exact = JS_RUNTIME_RE.test(tokens[0].split(/[/\\]/).pop()) && at === 1
      && (rest === '--vision' || rest === '--dry-run --vision');
    if (!exact) return true;
  }
  return false;
}

/**
 * Is this call a background agent's? Claude Code's PreToolUse input carries `agent_id` only
 * when a subagent makes the call, never for the main session; only a non-empty one counts.
 * @param {object} payload
 * @returns {boolean}
 */
function isSubagent(payload) {
  return Boolean(payload) && typeof payload.agent_id === 'string' && payload.agent_id.trim() !== '';
}

/** Read-only inbox screens, matched as the whole route. */
const READ_INBOX = new Set(['questions', 'decisions', 'gates', 'escalations', 'migration', 'verify', 'stale']);
/** Read-only top-level routes taking exactly one argument. */
const ONE_ARG_ROUTES = new Set(['task', 'browse', 'section', 'stubs', 'validate', 'plan']);
/**
 * `menu task <sub>`: the flags each allowed sub-command takes (true = takes a value) and how
 * many positional words it takes. `--force` (the human's override), `--continue` and `--fail`
 * are on none of them; an unknown flag refuses.
 */
const TASK_GRAMMAR = Object.freeze({
  add: { flags: { '--touches': true, '--blocked': true, '--gitop': false, '--label': true, '--b64': true }, min: 1, max: 2 },
  start: { flags: { '--agent-id': true }, min: 1, max: 1 },
  fail: { flags: { '--summary': true }, min: 1, max: 1 },
  cancel: { flags: {}, min: 1, max: 1 },
  complete: { flags: { '--summary': true, '--gate': true, '--next': true, '--b64': true }, min: 1, max: 1 },
  list: { flags: {}, min: 0, max: 0 },
  board: { flags: {}, min: 0, max: 0 },
});
/** The keys a decoded `--b64` payload may carry, per sub-command (what the menu reads). */
const B64_KEYS = Object.freeze({
  add: new Set(['kind', 'plan', 'label', 'touches', 'blockedBy', 'gitOp']),
  complete: new Set(['summary', 'nextAction', 'gate']),
});

/** Is `route` a navigation route (`taskView.isNavRoute`, the check `menu task complete` applies)? */
function isNavRoute(route) {
  return typeof route === 'string' && require('../lib/task-view').isNavRoute(route);
}

/**
 * Does a `--b64` value decode — with the task parser's own decoder — to a plain object
 * carrying only the keys the sub-command reads, and nothing that crosses a gate?
 */
function b64Allowed(sub, value) {
  const decoded = require('../lib/menu-screens').decodeB64(value);
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return false;
  if (!Object.keys(decoded).every((k) => B64_KEYS[sub].has(k))) return false;
  return decoded.nextAction === undefined || isNavRoute(decoded.nextAction);
}

/** Do the words after `menu task <sub>` fit that sub-command's grammar exactly? */
function taskArgsAllowed(sub, words) {
  const grammar = Object.prototype.hasOwnProperty.call(TASK_GRAMMAR, sub) ? TASK_GRAMMAR[sub] : null;
  if (!grammar) return false;
  let positional = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w.startsWith('--')) { positional += 1; continue; }
    if (!Object.prototype.hasOwnProperty.call(grammar.flags, w)) return false;
    if (!grammar.flags[w]) continue;
    const value = words[++i];
    if (value === undefined) return false;
    if (w === '--b64' && !b64Allowed(sub, value)) return false;
    if (w === '--next' && !isNavRoute(value)) return false;
  }
  return positional >= grammar.min && positional <= grammar.max;
}

/**
 * May a background agent run this menu route? The WHOLE route, as the router will dispatch
 * it, must be one of the routes that write no answer, no approval and move no plan across a
 * gate: `menu`, `menu commands`, the task registry's sub-commands within their grammar (the
 * build agent's own completion without `--continue`), `dashboard`, `tasks`, one-argument
 * read screens, the read-only inbox screens, and `inbox cleanup` / `cleanup category` /
 * `cleanup plan <slug>` (never confirm or override). An unknown or extra word refuses, and so
 * does any route the router gains later (fail closed).
 * @param {string[]} route - as `start.js` hands it to the router
 * @returns {boolean}
 */
function subagentMayRunRoute(route) {
  const [cmd, sub] = route;
  const n = route.length;
  if (cmd === 'menu') {
    if (n === 1 || (n === 2 && sub === 'commands')) return true;
    return sub === 'task' && n >= 3 && taskArgsAllowed(route[2], route.slice(3));
  }
  if (cmd === 'dashboard' || cmd === 'tasks') return n === 1;
  if (ONE_ARG_ROUTES.has(cmd)) return n === 2 && route[1] !== '';
  if (cmd === 'inbox') {
    if (n === 2 && (READ_INBOX.has(sub) || sub === 'cleanup')) return true;
    if (sub !== 'cleanup') return false;
    return (n === 3 && route[2] === 'category') || (n === 4 && route[2] === 'plan' && route[3] !== '');
  }
  return false;
}

/** Names that reach the menu or a gate crossing; a background agent's command naming one gets the strict reading. */
const MENU_MENTION_RE = /start\.js|menu-screens|streaming-gate|streaming-precompute|continueAfterCrossing|approveSubplans|approvePlan|streamAnswer|streamApprove|crossBySufficiency|crossOnEvidence|pendingGateDecisions/;
/** Shell syntax that makes a command more than one plain call; none is accepted outside quotes. */
const SHELL_SPECIAL_RE = /[;&|`$(){}<>*?[\]~!#\\\r\n]/;
/** Characters the shell still interprets inside double quotes (`!` is literal in a non-interactive shell). */
const DOUBLE_QUOTE_SPECIAL_RE = /[$`\\]/;
/** Programs that only read the files they are given. */
const READ_PROGRAMS = new Set(['grep', 'rg', 'cat', 'head', 'tail', 'wc', 'ls', 'diff']);
const ROOT_MARK = '\u0001';

/**
 * The words of `command` when it is ONE simple call the shell reads exactly as written: no
 * shell operator or expansion outside quotes; each quoted argument is a single pair of quotes
 * around the whole word — inside single quotes anything, inside double quotes anything but
 * `$`, a backtick and a backslash, which the shell still expands; `${CLAUDE_PLUGIN_ROOT}` only
 * inside the second word, the script. With no expansion and no operator there is nothing the
 * shell can read differently from this. Returns `'quote'` when the only fault is an expansion
 * inside a double-quoted `--summary` value (the caller asks for single quotes), null for any
 * other fault.
 * @param {string} command
 * @returns {string[]|'quote'|null}
 */
function simpleWords(command) {
  const text = command.trim().split(PLUGIN_ROOT_TOKEN).join(ROOT_MARK);
  if (/[\u0000\u0002-\u0008\u000b-\u001f\u007f]/.test(text)) return null;
  const words = [];
  let cur = '';
  let inWord = false;
  let quote = null;
  let closed = false;
  const expanding = new Set(); // indexes of double-quoted words the shell would still expand
  for (const ch of text) {
    if (quote) {
      if (ch === quote) { quote = null; closed = true; continue; }
      if (quote === '"' && DOUBLE_QUOTE_SPECIAL_RE.test(ch)) expanding.add(words.length);
      cur += ch;
    } else if (ch === ' ' || ch === '\t') {
      if (inWord) words.push(cur);
      cur = ''; inWord = false; closed = false;
    } else if (closed) {
      return null; // a quote must close at the end of its word
    } else if (ch === '"' || ch === "'") {
      if (inWord) return null; // a quote must open at the start of its word
      quote = ch; inWord = true;
    } else if (SHELL_SPECIAL_RE.test(ch)) {
      return null;
    } else {
      cur += ch; inWord = true;
    }
  }
  if (quote) return null;
  if (inWord) words.push(cur);
  if (words.some((w, i) => i !== 1 && w.includes(ROOT_MARK))) return null;
  if (expanding.size === 0) return words;
  // Only a summary gets the retry sentence; any other expanding word is plainly refused.
  return [...expanding].every((i) => i > 0 && words[i - 1] === '--summary') ? 'quote' : null;
}

/** `node`, or an absolute path to a node binary. */
function isNodeProgram(word) {
  return word === 'node' || (path.isAbsolute(word) && /^node(\.exe)?$/i.test(path.basename(word)));
}

/**
 * A background agent's command that names this plugin's menu (`start.js`), a menu module or a
 * gate-crossing function gets ONE reading. It is allowed only as (a) one simple call of a
 * read-only program that merely names the files, or (b) one simple direct call: the program
 * `node` (or an absolute path to a node binary), immediately the real `start.js` of this
 * plugin (real-path compare), then a route that — read by `start.js`'s own
 * `extractLiveAgentIds` and `splitCliArgs` — is on the allowed list. No other script, no
 * `node --test`, no option between the runtime and the script, no `env` or `NAME=value`
 * prefix, no other runtime. A double-quoted argument the shell would still expand gets the one
 * retry sentence; everything else is refused (fail closed).
 * @param {string} command
 * @param {string} base - the session's working directory
 * @returns {string|null} the refusal sentence, or null to go on to the record checks
 */
function subagentMenuRefusal(command, base) {
  if (!MENU_MENTION_RE.test(command)) return null;
  const words = simpleWords(command);
  if (words === 'quote') return REFUSAL_QUOTE;
  if (!words || words.length === 0) return REFUSAL_SUBAGENT;
  if (READ_PROGRAMS.has(words[0])) return null;
  if (!isNodeProgram(words[0]) || !words[1] || words[1].startsWith('-')) return REFUSAL_SUBAGENT;
  const safeFs = require('../lib/safe-fs');
  const own = safeFs.realpathSync(path.join(PLUGIN_ROOT, 'src', 'commands', 'start.js'));
  let real = null;
  try {
    real = safeFs.realpathSync(path.resolve(base, words[1].split(ROOT_MARK).join(PLUGIN_ROOT)));
  } catch {
    real = null; // no such file: it is not this plugin's menu
  }
  if (real !== own) return REFUSAL_SUBAGENT;
  const { extractLiveAgentIds, splitCliArgs } = require('../commands/start.js');
  return subagentMayRunRoute(splitCliArgs(extractLiveAgentIds(words.slice(2)).rest)) ? null : REFUSAL_SUBAGENT;
}

/**
 * The shell decision, in the plan's order.
 * @param {string} command
 * @param {string} cwdRel - the session's working directory relative to the root, or ''
 * @param {string} base - the session's working directory, absolute
 * @param {object} bash - the exports of `PreToolUse.Bash.js`
 * @param {boolean} [subagent] - the call carries a non-empty `agent_id`
 * @returns {string|null} the refusal sentence, or null to allow
 */
function bashRefuses(command, cwdRel, base, bash, subagent = false) {
  if (subagent) {
    const refused = subagentMenuRefusal(command, base);
    if (refused) return refused;
  }
  const menuArgs = menuCallArgs(command, base);
  if (menuArgs) return menuArgsNameRecords(menuArgs, cwdRel, bash) ? REFUSAL : null;
  // `./` so a working directory whose name starts with `-` is never read as a `cd` option.
  const analysed = cwdRel ? `cd ./${cwdRel} && ${command}` : command;
  const refused = bash.isLedgerForgery(analysed).deny
    || bash.isOpaqueDecodedExecution(command)
    || bash.isLedgerWrite(analysed, bash.VERIFY_SPEC)
    || bash.isLedgerWrite(analysed, STREAMING_SPEC)
    || (bash.isInlineEval(command) && CHECK_RECORD_EVAL_TOKENS.some((re) => re.test(command)))
    || runsBackfillBeyondVision(command, bash);
  return refused ? REFUSAL : null;
}

/**
 * The decision for one payload. Requires are inside, so a module that fails to load is
 * a throw the caller's fail rule handles.
 * @param {object} payload - the parsed stdin JSON
 * @returns {string|null} the refusal sentence, or null to allow
 */
function decide(payload) {
  const { findProjectRoot } = require('../lib/project-root');
  const root = findProjectRoot(payload.cwd || process.cwd());
  process.chdir(root); // the reused checks measure against process.cwd()
  const tool = payload.tool_name;
  if (EDITING_TOOLS.has(tool)) {
    const edit = require('./PreToolUse.Edit.js');
    const target = edit.getTargetFile(payload);
    if (!target) return null;
    const abs = path.resolve(payload.cwd || root, target);
    return edit.isProtectedLedgerPath(abs) || edit.isProtectedVerifyPath(abs)
      || edit.targetsStreamingLive(abs) || RECORD_SEGMENT_RE.test(abs.replace(/\\/g, '/')) ? REFUSAL : null;
  }
  if (tool === 'Bash') {
    const command = payload.tool_input && payload.tool_input.command;
    // A command that is not a string cannot be read; the fail rule decides it.
    if (typeof command !== 'string') throw new TypeError('Bash command is not a string');
    if (!command.trim()) return null;
    const bash = require('./PreToolUse.Bash.js');
    let cwdRel = typeof payload.cwd === 'string' ? path.relative(root, payload.cwd).replace(/\\/g, '/') : '';
    if (!/^[A-Za-z0-9._/-]+$/.test(cwdRel)) cwdRel = '';
    return bashRefuses(command, cwdRel, path.resolve(root, payload.cwd || '.'), bash, isSubagent(payload));
  }
  return null;
}

/**
 * Refuse: the sentence on stderr (what Claude Code shows the agent on exit 2), then the
 * decision JSON on stdout and exit 2.
 * @param {string} sentence
 */
function refuse(sentence) {
  process.stderr.write(`${sentence}\n`);
  emitDeny(sentence);
}

function main() {
  let raw;
  try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  if (!raw) process.exit(0);
  let payload = null;
  try { payload = JSON.parse(raw); } catch { payload = null; }
  let refused;
  try {
    if (payload === null || typeof payload !== 'object') throw new TypeError('payload is not a JSON object');
    refused = decide(payload);
  } catch {
    // Fail rule: scan only what the call does when the payload parsed, else the raw text.
    const parsed = payload !== null && typeof payload === 'object';
    const scanned = parsed
      ? String(JSON.stringify(payload.tool_input === undefined ? null : payload.tool_input))
      : raw;
    // A background agent's call that reaches for the menu fails closed too; the main
    // session's menu call does not, so one broken release never locks the human out.
    if (UNCHECKED_SUSPECT_RE.test(scanned) || (parsed && isSubagent(payload) && MENU_MENTION_RE.test(scanned))) {
      refuse(REFUSAL_UNCHECKED);
    }
    process.exit(0);
  }
  if (refused) refuse(refused);
  process.exit(0);
}

if (require.main === module) main();

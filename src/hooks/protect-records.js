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
 *   `plan <ref>`); every other route is refused with its own sentence, fail closed. The same
 *   holds outside a pure call: a segment running a JavaScript runtime on a `start.js` with a
 *   refused route, or an inline script naming `menu-screens`, `streaming-gate`,
 *   `continueAfterCrossing` or `approveSubplans`. A call without `agent_id` is unchanged.
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
const REFUSAL_SUBAGENT = "CTOC refused this call because a background agent may not answer CTOC's questions, "
  + 'approve a plan or move one on through the menu; report your result and let the main session do it.';
/** Text that marks a background agent's call as one that reaches the menu, for the fail rule. */
const MENU_SUSPECT_RE = /start\.js|menu-screens|streaming-gate/;
/** Inline-script names that reach the menu's routes or a plan move. */
const MENU_EVAL_RE = /menu-screens|streaming-gate|continueAfterCrossing|approveSubplans/;

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

/**
 * The menu route a call names: the arguments after the menu script with `--live-agent-ids`
 * and its value removed, and a single remaining argument split on whitespace — the reading
 * `start.js` applies (`extractLiveAgentIds`, then `splitCliArgs`).
 * @param {string[]} args
 * @returns {string[]}
 */
function menuRouteArgs(args) {
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live-agent-ids') { i++; continue; }
    rest.push(args[i]);
  }
  return rest.length === 1 ? String(rest[0]).split(/\s+/).filter(Boolean) : rest;
}

/** Task sub-commands that write only the task registry. */
const REGISTRY_TASK_SUBS = new Set(['add', 'start', 'fail', 'cancel', 'list', 'board']);
/** Inbox screens that read only. */
const READ_INBOX = new Set(['questions', 'decisions', 'gates', 'escalations', 'migration', 'verify', 'stale', 'cleanup']);
/** Top-level routes that read only (or, `dashboard`, reconcile tasks — no human gate). */
const READ_ROUTES = new Set(['dashboard', 'tasks', 'task', 'browse', 'section', 'stubs', 'validate']);

/**
 * May a background agent run this menu route? Only the routes that write no answer, no
 * approval and move no plan across a gate: the build agent's own completion (never with
 * `--continue`), the task registry, the dashboard and the read-only screens, and a plan screen
 * with a reference. Every other route — the default screen, `stream …`, a bare `plan`, and any
 * route the router gains later — is refused (fail closed).
 * @param {string[]} route - from `menuRouteArgs`
 * @returns {boolean}
 */
function subagentMayRunRoute(route) {
  const [cmd, sub, third] = route;
  if (cmd === 'menu') {
    if (route.length === 1 || (sub === 'commands' && route.length === 2)) return true;
    if (sub !== 'task') return false;
    if (third === 'complete') return !route.includes('--continue');
    return REGISTRY_TASK_SUBS.has(third);
  }
  if (cmd === 'inbox') return READ_INBOX.has(sub);
  if (cmd === 'plan') return typeof sub === 'string' && sub !== '';
  return READ_ROUTES.has(cmd);
}

/**
 * Does a command that is not a pure menu call still reach a menu route a background agent may
 * not run — a segment running a JavaScript runtime on a script ending in `start.js`, or an
 * inline script naming the router, the gate module, the continuation or the batch approve?
 * @param {string} command
 * @param {{isInlineEval: function(string): boolean}} bash
 * @returns {boolean}
 */
function reachesRefusedRoute(command, bash) {
  if (bash.isInlineEval(command) && MENU_EVAL_RE.test(command)) return true;
  for (const seg of command.split(/\r?\n|;|&&|\|\||\||&/)) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/['"`]/g, ''));
    const at = tokens.findIndex((t) => JS_RUNTIME_RE.test(t.split(/[/\\]/).pop()));
    if (at === -1 || !tokens[at + 1] || !/start\.js$/.test(tokens[at + 1])) continue;
    if (!subagentMayRunRoute(menuRouteArgs(tokens.slice(at + 2)))) return true;
  }
  return false;
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
  const menuArgs = menuCallArgs(command, base);
  if (menuArgs) {
    if (menuArgsNameRecords(menuArgs, cwdRel, bash)) return REFUSAL;
    return subagent && !subagentMayRunRoute(menuRouteArgs(menuArgs)) ? REFUSAL_SUBAGENT : null;
  }
  if (subagent && reachesRefusedRoute(command, bash)) return REFUSAL_SUBAGENT;
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
    if (UNCHECKED_SUSPECT_RE.test(scanned) || (parsed && isSubagent(payload) && MENU_SUSPECT_RE.test(scanned))) {
      refuse(REFUSAL_UNCHECKED);
    }
    process.exit(0);
  }
  if (refused) refuse(refused);
  process.exit(0);
}

if (require.main === module) main();

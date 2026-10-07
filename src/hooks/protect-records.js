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
 *   `isOpaqueDecodedExecution`, `VERIFY_SPEC`). A pure call of the menu entry point
 *   (`node <…>/src/commands/start.js …` with no `$`, backtick, backslash or unquoted
 *   control character) is allowed first: the menu is the legitimate writer and its
 *   arguments are data.
 *   Nothing else is loaded or run: no plan coverage, no escape phrases, no enforcement
 *   mode, no Iron Loop step gates, no irreversible-command net, no plan-move gate.
 *
 * WHAT IT CANNOT CATCH (it reads command text; it is not a sandbox)
 *   a script file written elsewhere and then run; a path built at run time (a variable,
 *   a glob, string pieces, `$'…'`); git operations that restore records without naming
 *   them; replacing a parent folder; hard links; operands beyond the first 128 per
 *   segment; file-writing tools other than the five matched; and any agent running the
 *   menu's own routes. The full list is in `docs/ENFORCEMENT.md`.
 *
 * FAIL RULE
 *   A crash fails CLOSED only for a call whose raw payload mentions the records
 *   (`UNCHECKED_SUSPECT_RE`, tested without loading anything but the dependency-free
 *   deny signal) and fails OPEN for the rest, so one broken release cannot stop every
 *   Write, Edit and Bash call in every project. A failure to load `hook-deny-signal.js`
 *   itself exits 1, which Claude Code treats as "not blocked".
 *
 * Refusal = the deny decision JSON on stdout and exit 2 (`emitDeny`); allow = exit 0
 * with nothing on stdout. No banner, no log file: the refusal lands in the transcript.
 */

const fs = require('fs');
const path = require('path');
const { emitDeny } = require('../lib/hook-deny-signal');

const REFUSAL = 'CTOC refused this call because it writes, or could write, the approval records in '
  + ".ctoc/approvals/ or the check records in .ctoc/state/verify/, which only CTOC's menu writes; "
  + 'finish your work, report it, and let the menu record the result.';
const REFUSAL_UNCHECKED = 'CTOC refused this call because it mentions the approval or check records '
  + "and CTOC's protection for them failed to run; tell the human that this protection is broken.";

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

const MENU_CALL_RE = /^node\s+(?:"([^"]+)"|'([^']+)'|([^\s"']+))/;
const BACKFILL_TOKEN_RE = /(^|[/\\])ledger[-_]backfill(\.js)?$/i;
const JS_RUNTIME_RE = /^(node[0-9.]*|deno|bun|ts-node|tsx)(\.exe)?$/i;

/**
 * A call of the menu entry point and nothing else: no backslash, no backtick, no `$`
 * other than `${CLAUDE_PLUGIN_ROOT}`, the script is `…/src/commands/start.js`, and no
 * `;`, `&`, `|`, `<`, `>`, carriage return or newline outside quotes, every quote closed.
 * @param {string} command
 * @returns {boolean}
 */
function isPureMenuCall(command) {
  const s = command.trim();
  if (/[\\`]/.test(s) || s.split('${CLAUDE_PLUGIN_ROOT}').join('').includes('$')) return false;
  const m = s.match(MENU_CALL_RE);
  const script = m && (m[1] || m[2] || m[3]);
  if (!script || !(script === 'src/commands/start.js' || script.endsWith('/src/commands/start.js'))) return false;
  let quote = null;
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (';&|<>\r\n'.includes(ch)) return false;
  }
  return quote === null;
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
 * The shell decision, in the plan's order.
 * @param {string} command
 * @param {string} cwdRel - the session's working directory relative to the root, or ''
 * @param {object} bash - the exports of `PreToolUse.Bash.js`
 * @returns {boolean} true to refuse
 */
function bashRefuses(command, cwdRel, bash) {
  if (isPureMenuCall(command)) return false;
  // `./` so a working directory whose name starts with `-` is never read as a `cd` option.
  const analysed = cwdRel ? `cd ./${cwdRel} && ${command}` : command;
  return bash.isLedgerForgery(analysed).deny
    || bash.isOpaqueDecodedExecution(command)
    || bash.isLedgerWrite(analysed, bash.VERIFY_SPEC)
    || bash.isLedgerWrite(analysed, STREAMING_SPEC)
    || (bash.isInlineEval(command) && CHECK_RECORD_EVAL_TOKENS.some((re) => re.test(command)))
    || runsBackfillBeyondVision(command, bash);
}

/**
 * The decision for one payload. Requires are inside, so a module that fails to load is
 * a throw the caller's fail rule handles.
 * @param {string} raw - the stdin text
 * @returns {boolean} true to refuse
 */
function decide(raw) {
  const payload = JSON.parse(raw);
  const { findProjectRoot } = require('../lib/project-root');
  const root = findProjectRoot(payload.cwd || process.cwd());
  process.chdir(root); // the reused checks measure against process.cwd()
  const tool = payload.tool_name;
  if (EDITING_TOOLS.has(tool)) {
    const edit = require('./PreToolUse.Edit.js');
    const target = edit.getTargetFile(payload);
    if (!target) return false;
    const abs = path.resolve(payload.cwd || root, target);
    return edit.isProtectedLedgerPath(abs) || edit.isProtectedVerifyPath(abs)
      || edit.targetsStreamingLive(abs) || RECORD_SEGMENT_RE.test(abs.replace(/\\/g, '/'));
  }
  if (tool === 'Bash') {
    const command = payload.tool_input && payload.tool_input.command;
    if (typeof command !== 'string' || !command.trim()) return false;
    const bash = require('./PreToolUse.Bash.js');
    let cwdRel = typeof payload.cwd === 'string' ? path.relative(root, payload.cwd).replace(/\\/g, '/') : '';
    if (!/^[A-Za-z0-9._/-]+$/.test(cwdRel)) cwdRel = '';
    return bashRefuses(command, cwdRel, bash);
  }
  return false;
}

function main() {
  let raw;
  try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  if (!raw) process.exit(0);
  let refuse;
  try {
    refuse = decide(raw);
  } catch {
    if (UNCHECKED_SUSPECT_RE.test(raw)) emitDeny(REFUSAL_UNCHECKED);
    process.exit(0);
  }
  if (refuse) emitDeny(REFUSAL);
  process.exit(0);
}

if (require.main === module) main();

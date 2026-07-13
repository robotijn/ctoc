#!/usr/bin/env node
/**
 * CTOC v7 PreToolUse Enforcement Hook — Edit/Write/MultiEdit/NotebookEdit
 *
 * REPLACES the legacy step-based hook with plan-coverage logic (per C1).
 *
 * Flow:
 *   1. Whitelist check          (allow infrastructure files)
 *   2. Is project CTOC?         (silent pass if not)
 *   3. Plan-coverage check      (allow if covered)
 *   4. Escape-phrase check      (allow if user said hotfix/trivial/etc.)
 *   5. Block + log
 *
 * Fails OPEN on internal error (better to skip enforcement than break flow).
 *
 * Signalling (W01-s1, finding C1): a deny is emitted via the shared
 * `../lib/hook-deny-signal` emitter — the Claude Code PreToolUse decision JSON
 * `permissionDecision:"deny"` on stdout + exit 0 — replacing the legacy cosmetic
 * `process.exit(1)` the harness treated as non-blocking. Allow stays exit-0-silent.
 *
 * stdin contract (PI5-s2 fix). A pipe is SINGLE-CONSUMER: fd 0 can be drained
 * exactly once. The enforcement decision is therefore factored into an exported
 * `enforce(parsedPayload)` that does NO stdin read — it operates on an
 * already-parsed payload. Two entry points feed it:
 *   • DIRECT invocation (this file run as a hook on an Edit tool): the bottom
 *     IIFE reads stdin ONCE, parses it, and calls `enforce(parsed)`.
 *   • DELEGATED invocation (PreToolUse.Write.js): the Write hook reads stdin
 *     ONCE and calls the exported `enforce(parsed)` with that SAME payload — so
 *     the delegate never re-reads a now-empty pipe (the bug this fixes).
 * `enforce` preserves the whitelist → CTOC-detect → coverage → escape-phrase →
 * block flow, its exit codes, and its logging byte-for-byte. Guarded with
 * `require.main === module` so importing the module never runs enforcement or
 * consumes stdin.
 */

const path = require('path');
const fs = require('fs');
const safeFs = require('../lib/safe-fs');
// LITERAL require, first-party and dependency-free — NOT fail-soft: enforcement
// cannot signal a real deny without it, so a load failure must surface (and, per
// the file's fail-open contract, crashes the hook before enforce() → tool proceeds).
const { emitDeny } = require('../lib/hook-deny-signal');

// These four sibling modules are loaded fail-soft (a missing/broken module
// degrades enforcement rather than crashing the hook). Each is a LITERAL
// require in its own try/catch — no dynamic require(variable) surface — so the
// module graph is statically analyzable and security/detect-non-literal-require
// stays clean.
let detector = null;
try { detector = require('../lib/ctoc-project-detector'); } catch { detector = null; }
let coverage = null;
try { coverage = require('../lib/plan-coverage'); } catch { coverage = null; }
let enforcementLog = null;
try { enforcementLog = require('../lib/enforcement-log'); } catch { enforcementLog = null; }
let escapePhrases = null;
try { escapePhrases = require('../lib/escape-phrases'); } catch { escapePhrases = null; }

const WHITELIST = [
  '.gitignore',
  '.gitattributes',
  /^\.ctoc\//,
  /^\.local\//,
  /^plans\/.*\.md$/,
  /^VERSION$/,
];

function isWhitelisted(filePath) {
  if (!filePath) return false;
  // Claude Code passes ABSOLUTE file paths; relativize against the project root
  // so the anchored patterns (^plans/.*\.md$, ^VERSION$, ^\.ctoc/) match. Without
  // this, every whitelisted file was wrongly blocked in production.
  let norm = filePath;
  if (path.isAbsolute(norm)) {
    norm = path.relative(process.cwd(), norm);
  }
  norm = norm.replace(/\\/g, '/').replace(/^\.\//, '');
  // Reject any path that escapes the project root via traversal — otherwise a
  // crafted target like ".ctoc/../src/lib/x.js" or "plans/../../outside.md"
  // would match a whitelist prefix yet resolve to an arbitrary file.
  if (norm === '' || norm === '..' || norm.startsWith('../') || norm.includes('/../')) return false;
  norm = path.posix.normalize(norm);
  if (norm.startsWith('../')) return false;
  for (const pattern of WHITELIST) {
    if (typeof pattern === 'string') {
      if (norm === pattern || path.basename(norm) === pattern) return true;
    } else if (pattern.test(norm)) return true;
  }
  return false;
}

/**
 * The approval ledger's directory, as a POSIX-relative prefix. The ledger under
 * this path is CTOC's single source of human-approval truth (finding C4); a
 * write there by any agent tool call would forge an approval, so it is denied
 * ahead of the `.ctoc/` whitelist.
 */
const LEDGER_DIR = '.ctoc/approvals';

/**
 * Whether `filePath` targets the approval ledger (`.ctoc/approvals/` or any path
 * beneath it). Relativizes against the project root exactly as `isWhitelisted`
 * does — absolute → `path.relative`; `\\`→`/`; reject any `..` traversal;
 * `path.posix.normalize` — so a crafted target like `.ctoc/approvals/../x.js`
 * (which resolves OUT of the ledger) is NOT reported as protected and falls
 * through to the normal whitelist/coverage flow. Pure: no filesystem access.
 *
 * @param {string} filePath - the tool-call target (relative or absolute)
 * @returns {boolean} true iff the normalized path is the ledger dir or under it
 */
function isProtectedLedgerPath(filePath) {
  if (!filePath) return false;
  let norm = filePath;
  if (path.isAbsolute(norm)) {
    norm = path.relative(process.cwd(), norm);
  }
  norm = norm.replace(/\\/g, '/').replace(/^\.\//, '');
  // Reuse the whitelist's traversal rejection so `.ctoc/approvals/../escape.js`
  // cannot be treated as "protected" (and, symmetrically, cannot slip through).
  if (norm === '' || norm === '..' || norm.startsWith('../') || norm.includes('/../')) return false;
  norm = path.posix.normalize(norm);
  if (norm.startsWith('../')) return false;
  return norm === LEDGER_DIR || norm.startsWith(`${LEDGER_DIR}/`);
}

function readStdinJson() {
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return buf ? JSON.parse(buf) : null;
  } catch { return null; }
}

function getTargetFile(stdinJson) {
  const fromEnv = process.env.CLAUDE_TOOL_INPUT || '';
  try {
    const parsed = JSON.parse(fromEnv);
    if (parsed.file_path) return parsed.file_path;
    if (parsed.path) return parsed.path;
    if (parsed.notebook_path) return parsed.notebook_path;
  } catch { /* fall through */ }

  if (stdinJson && stdinJson.tool_input) {
    return stdinJson.tool_input.file_path || stdinJson.tool_input.path || stdinJson.tool_input.notebook_path || null;
  }

  // Best-effort regex
  const m = fromEnv.match(/file_path['":\s]+["']?([^"'\s,}]+)/);
  return m ? m[1] : null;
}

function readTranscript(stdinJson) {
  // Claude Code hook protocol passes transcript_path in stdin JSON
  if (!stdinJson || !stdinJson.transcript_path) return null;
  try { return safeFs.readFileSync(stdinJson.transcript_path, 'utf8'); } catch { return null; }
}

/**
 * Extract ONLY genuinely user-*typed* text from a Claude Code transcript
 * (finding H4 / W08-s1). The transcript is JSONL — one JSON object per line.
 * An escape phrase must count only when the human personally typed it, so this
 * keeps text from `type:"user"` entries with string content or `text` content
 * blocks, and EXCLUDES:
 *   • `tool_result` blocks — a `Read` of CLAUDE.md (which lists every phrase) or
 *     CTOC's own block-message stderr both arrive as `tool_result` entries that
 *     carry `role:"user"` too; matching them let the guardrail unlock itself.
 *   • assistant / system / metadata entries (no `message`, or a non-user role).
 *
 * A non-JSON line degrades to being treated as raw user-typed text: production
 * transcripts are JSONL (assistant turns and tool results are ALWAYS JSON
 * objects, so they are role-classified out above and this branch is not
 * attacker-reachable there), so the fallback only preserves compatibility with
 * simplified/plaintext transcripts — a phrase in such a line is one the user
 * themselves typed. Parse failures never throw (each line is guarded).
 *
 * @param {string} transcript - raw transcript file contents (may be empty/null)
 * @returns {string} the concatenated user-typed text (newline-joined), or ''
 */
function extractUserTypedText(transcript) {
  if (typeof transcript !== 'string' || !transcript) return '';
  const kept = [];
  for (const line of transcript.split(/\r?\n/)) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      // Non-JSON line: treat as raw user-typed text (see JSDoc — safe under
      // JSONL production transcripts, preserves plaintext-transcript behavior).
      kept.push(line);
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    // Two genuine user-turn shapes exist in the wild:
    //   1. harness JSONL: { type: "user", message: { role: "user", content } }
    //   2. bare message:  { role: "user", content } (no type, no wrapper) —
    //      simplified transcripts write user turns this way. Assistant/system
    //      entries in that shape carry role: "assistant"/"system" and are
    //      excluded below; tool results never appear as a bare role-form line.
    let message;
    if (entry.type === 'user') {
      message = entry.message;
    } else if (entry.type === undefined && entry.role === 'user' && entry.message === undefined) {
      message = entry;
    } else {
      continue;                                        // assistant/metadata excluded
    }
    if (!message || typeof message !== 'object') continue;
    if (message.role !== undefined && message.role !== 'user') continue;
    const content = message.content;
    if (typeof content === 'string') {
      kept.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        // Only genuine text blocks; every tool_result / non-text block is skipped.
        if (block && typeof block === 'object'
          && block.type === 'text' && typeof block.text === 'string') {
          kept.push(block.text);
        }
      }
    }
  }
  return kept.join('\n');
}

/**
 * Return the escape phrase the USER themselves typed in the transcript, or null.
 * Role-scoped (W08-s1): matches only over `extractUserTypedText()`, so CTOC's
 * own block message or a `Read` of CLAUDE.md can no longer unlock the next edit.
 * The `slice(-5000)` memory bound is retained, now over user-typed text only.
 *
 * @param {string} transcript - raw transcript file contents
 * @returns {string|null} the matched escape phrase, or null
 */
function findEscapeInTranscript(transcript) {
  if (!transcript || !escapePhrases) return null;
  const userText = extractUserTypedText(transcript);
  return userText ? escapePhrases.matchEscapePhrase(userText.slice(-5000)) : null;
}

/**
 * Build the human-readable block banner written to stderr (W08-s1). The verbatim
 * escape-phrase list ("hotfix, trivial fix, urgent") is intentionally DROPPED:
 * that text used to seed the transcript (as a tool_result) and, combined with
 * the raw-tail matcher, unlock the very next edit — finding H4 / Defect 1. The
 * message stays actionable (it names the target and points at /ctoc:menu) and is
 * a pure function so its content can be asserted in-process without process.exit.
 *
 * @param {string} reason - short machine reason (shown after "BLOCKED:")
 * @param {object} info - { target_file?, project_root? }
 * @returns {string} the multi-line stderr banner, containing no canonical phrase
 */
function buildBlockMessage(reason, info) {
  const target = (info && info.target_file) || '(unknown)';
  const project = (info && info.project_root) || process.cwd();
  return `\n[CTOC v7] Edit BLOCKED: ${reason}\n`
    + `  Target: ${target}\n`
    + `  Project: ${project}\n\n`
    + `  Resolution:\n`
    + `  - Run /ctoc:menu to create or activate a plan that covers this file, OR\n`
    + `  - If this change is genuinely small, an escape phrase you type yourself will allow it — see /ctoc:menu for the current list.\n\n`;
}

function block(reason, info) {
  process.stderr.write(buildBlockMessage(reason, info));
  if (info.project_root && enforcementLog) {
    try {
      enforcementLog.logEnforcement({
        tool: info.tool || 'Edit',
        target_file: info.target_file,
        project_is_ctoc: true,
        plan_matched: null,
        escape_phrase: null,
        outcome: 'block',
      }, info.project_root);
    } catch { /* fail open on log error */ }
  }
  // Emit the REAL harness deny (shared protocol) instead of the cosmetic exit 1.
  // The human banner above already went to stderr; stdout carries ONLY this JSON.
  // The verbatim phrase list is dropped here too (W08-s1): this deny reason is the
  // other half of "CTOC's own denial" and lands back in the transcript, so it must
  // not advertise the phrases it would otherwise seed.
  emitDeny(`CTOC: no active plan covers "${info.target_file || '(unknown)'}" and no escape phrase was used. Create/activate a covering plan via /ctoc:menu, or use an escape phrase you type yourself.`);
}

function allow(outcome, info) {
  if (info.project_root && enforcementLog) {
    try {
      enforcementLog.logEnforcement({
        tool: info.tool || 'Edit',
        target_file: info.target_file,
        project_is_ctoc: info.project_is_ctoc,
        plan_matched: info.plan_matched || null,
        escape_phrase: info.escape_phrase || null,
        outcome,
      }, info.project_root);
    } catch { /* fail open on log error */ }
  }
  process.exit(0);
}

/**
 * The enforcement decision, operating on an ALREADY-PARSED PreToolUse payload.
 * Performs NO stdin read (a pipe is single-consumer — the caller owns the one
 * read). Runs the exact whitelist → CTOC-detect → coverage → escape-phrase →
 * block flow and exits with the same codes as before (0 = allowed, 1 = blocked).
 *
 * Called by:
 *   • the direct-invocation IIFE below (this file run as an Edit hook), and
 *   • PreToolUse.Write.js's main() (the delegate), which passes the SAME parsed
 *     payload it already read from stdin — so enforcement fires on the real
 *     target instead of a drained pipe.
 *
 * @param {object|null} stdinJson - parsed PreToolUse payload (may be null)
 * @returns {Promise<void>} always terminates the process via process.exit
 */
async function enforce(stdinJson) {
  try {
    const root = process.cwd();
    const tool = (stdinJson && stdinJson.tool_name) || 'Edit';
    const targetFile = getTargetFile(stdinJson);

    // 0. Ledger provenance is human-approval truth (finding C4). Deny ANY write
    //    under `.ctoc/approvals/`. This runs BEFORE the Step-1 `.ctoc/` whitelist
    //    below — otherwise the `/^\.ctoc\//` pattern would allow the ledger to be
    //    forged through the back door. One guard in enforce() covers all four
    //    editing tools (Write delegates here; MultiEdit/NotebookEdit via W01).
    if (targetFile && isProtectedLedgerPath(targetFile)) {
      return block('ledger is human-approval provenance; agent writes to .ctoc/approvals/ are denied', {
        tool, target_file: targetFile, project_root: root,
      });
    }

    // 1. Whitelist (infrastructure files always allowed)
    if (targetFile && isWhitelisted(targetFile)) {
      return allow('whitelist', { tool, target_file: targetFile, project_root: root });
    }

    // 2. CTOC project? If not, silent pass.
    if (!detector) return process.exit(0); // libs missing — fail open
    const detect = detector.isCtocProject(root);
    if (!detect.isCtoc) {
      return allow('silent-passthrough', { tool, target_file: targetFile, project_root: root, project_is_ctoc: false });
    }

    // 3. Plan-coverage?
    if (coverage && targetFile) {
      const match = coverage.findCoveringPlan(targetFile, root);
      if (match) {
        return allow('allow', {
          tool, target_file: targetFile, project_root: root,
          project_is_ctoc: true, plan_matched: match.plan,
        });
      }
    }

    // 4. Escape phrase?
    const transcript = readTranscript(stdinJson);
    const escape = findEscapeInTranscript(transcript);
    if (escape) {
      return allow('escape', {
        tool, target_file: targetFile, project_root: root,
        project_is_ctoc: true, escape_phrase: escape,
      });
    }

    // 5. Block
    return block('no active plan covers this file and no escape phrase used', {
      tool, target_file: targetFile, project_root: root,
    });
  } catch (err) {
    // Fail OPEN — never break the user's flow due to a hook bug
    process.stderr.write(`[CTOC v7] enforcement hook error (failing open): ${err.message}\n`);
    process.exit(0);
  }
}

module.exports = {
  enforce, isWhitelisted, isProtectedLedgerPath, getTargetFile, readStdinJson,
  findEscapeInTranscript, extractUserTypedText, buildBlockMessage,
};

// Direct invocation: this file run as a PreToolUse hook on an Edit tool. Read
// stdin ONCE here (the single consumer of the pipe) and hand the parsed payload
// to enforce(). Guarded so merely importing the module (e.g. from Write.js or a
// test) never consumes stdin or runs enforcement.
if (require.main === module) {
  enforce(readStdinJson());
}

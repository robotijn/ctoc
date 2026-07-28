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
// Loaded fail-soft like the four above, BUT WITH THE OPPOSITE CONSEQUENCE, written
// here so nobody reads the shared shape as "this one is optional too": if this module
// fails to load, the protected-path guards fall back to ARITHMETIC ALONE and the
// symbolic-link path into `.ctoc/approvals/` is open again. That is a real degradation
// — recorded, not silent. Crashing the hook instead would be worse: the file's outer
// catch fails OPEN, so a load-time throw would allow EVERY edit.
let realPathConfinement = null;
try { realPathConfinement = require('../lib/real-path-confinement'); } catch { realPathConfinement = null; }

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
    const matched = typeof pattern === 'string'
      ? (norm === pattern || path.basename(norm) === pattern)
      : pattern.test(norm);
    if (!matched) continue;
    // The arithmetic above proves the NAME is a whitelisted infrastructure path. It
    // cannot prove the path LEADS there: `plans/out → /somewhere/else` produces the
    // clean, traversal-free name `plans/out/evil.md`, matches /^plans\/.*\.md$/, and
    // grants a write OUTSIDE the repository with no covering plan at all. Ask the
    // filesystem before granting.
    //
    // FAILING DIRECTION — `escapes: true` DENIES here, so return `false`. NOTE THE
    // INVERSION relative to the two protected-path guards above, where `resolvesUnder`
    // returning TRUE denies: both mean DENY, they answer opposite questions, and anyone
    // unifying them will invert one and reopen the hole. `escapesRoot` NEVER throws
    // (it returns escapes:true on every fault); the `&&` must not wrap it in anything
    // that turns a fault into a permit, because a throw would reach enforce()'s
    // fail-OPEN catch and become an ALLOW.
    //
    // A `false` here is NOT a hard denial: it FALLS THROUGH to enforce()'s coverage,
    // escape-phrase and block steps and lands on the ordinary uncovered-file denial —
    // no new message shape, no fifth outcome.
    //
    // Runs ONLY after a pattern matched, so an ordinary source edit (which matches
    // nothing) costs ZERO syscalls — the hot path is untouched. If the confinement
    // module failed to load this degrades to arithmetic alone: the hole is open again,
    // documented at the fail-soft require (:57-64), never silent.
    if (realPathConfinement !== null
      && realPathConfinement.escapesRoot(filePath, process.cwd()).escapes) return false;
    return true;
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
 * The Gate-3 VERIFY EVIDENCE directory, as a POSIX-relative prefix. The artifact
 * `.ctoc/state/verify/<slug>.json` under this path is written PROGRAMMATICALLY by
 * `src/lib/step-13-verify.js` (via safeFs, inside the CTOC process — NOT a tool
 * call) and is the one automated assurance `plan-validator.validateReviewToDone`
 * checks before review→done. A write there by an agent editing TOOL would forge
 * that evidence ({"passed":true,...}) and cross Gate 3 on fabricated data, so it
 * is denied ahead of the `.ctoc/` whitelist — exactly like the approval ledger.
 * step-13-verify's real write does not pass through these tool hooks, so it is
 * unaffected.
 */
const VERIFY_EVIDENCE_DIR = '.ctoc/state/verify';

/**
 * Normalize a tool-call target to a project-root-relative POSIX path for
 * protected-directory matching, or return null if it is empty or escapes the
 * root via traversal. Mirrors `isWhitelisted`'s normalization —
 * absolute → `path.relative`; `\\`→`/`; strip leading `./` — then RESOLVES
 * `.`/`..` via `path.posix.normalize` and rejects only a result that escapes the
 * project root (`..` / `.` / `../…`).
 *
 * Traversal-robust (HIGH gate-bypass fix): a `..` is no longer rejected up front;
 * it is resolved first. So `.ctoc/state/verify/../verify/x.js` collapses to
 * `.ctoc/state/verify/x.js` and IS reported as protected, while
 * `.ctoc/approvals/../x.js` collapses to `.ctoc/x.js` (resolves OUT of the
 * protected dir) and is NOT — it falls through to the normal whitelist/coverage
 * flow. Pure: no filesystem access.
 *
 * @param {string} filePath - the tool-call target (relative or absolute)
 * @returns {string|null} normalized POSIX-relative path, or null if unusable
 */
function normalizeForProtection(filePath) {
  if (!filePath) return null;
  let norm = filePath;
  if (path.isAbsolute(norm)) {
    norm = path.relative(process.cwd(), norm);
  }
  norm = norm.replace(/\\/g, '/').replace(/^\.\//, '');
  if (norm === '') return null;
  // Resolve `.`/`..` FIRST, then reject only a result that escapes the root — so a
  // `..` that lands back inside a protected dir is still matched (not evadable).
  norm = path.posix.normalize(norm);
  if (norm === '..' || norm === '.' || norm.startsWith('../')) return null;
  return norm;
}

/**
 * Whether `norm` (an already-normalized POSIX-relative path or null) is the
 * given protected directory or a path strictly beneath it. Segment-precise AND
 * CASE-INSENSITIVE: it matches `dir` and `dir/...` regardless of segment casing
 * (macOS APFS / Windows route a case-variant write into the REAL lowercase dir,
 * so a case-sensitive gate was forgeable — HIGH gate-bypass), but NOT a
 * same-prefix sibling like `${dir}OTHER/` (the `/` boundary is required).
 *
 * @param {string|null} norm - output of `normalizeForProtection`
 * @param {string} dir - POSIX-relative protected directory prefix (no trailing /)
 * @returns {boolean}
 */
function isUnderProtectedDir(norm, dir) {
  if (norm === null) return false;
  const n = norm.toLowerCase();
  const d = dir.toLowerCase();
  return n === d || n.startsWith(`${d}/`);
}

/**
 * Whether `filePath` targets the approval ledger (`.ctoc/approvals/` or any path
 * beneath it). See `normalizeForProtection` for the traversal-safe normalization.
 *
 * @param {string} filePath - the tool-call target (relative or absolute)
 * @returns {boolean} true iff the normalized path is the ledger dir or under it
 */
function isProtectedLedgerPath(filePath) {
  // TWO INDEPENDENT CHECKS, EITHER OF WHICH DENIES. The arithmetic check is KEPT,
  // not replaced: it costs nothing, it catches the spelling-level evasions the
  // existing tests pin (case variants, a `..` that resolves back inside), and it
  // works when the filesystem does not. The real-path check catches what names
  // cannot express — an in-repository symbolic link whose REAL destination is the
  // ledger, which pure arithmetic reports as an ordinary `src/…` path.
  //
  // FAILING DIRECTION: `resolvesUnder` returns TRUE to deny, and returns TRUE on
  // every fault. It never throws — a throw would reach enforce()'s fail-OPEN catch
  // and become an ALLOW of a ledger write.
  return isUnderProtectedDir(normalizeForProtection(filePath), LEDGER_DIR)
    || (realPathConfinement !== null
      && realPathConfinement.resolvesUnder(filePath, LEDGER_DIR, process.cwd()));
}

/**
 * Whether `filePath` targets the Gate-3 verify-evidence store
 * (`.ctoc/state/verify/` or any path beneath it). See `normalizeForProtection`
 * for the traversal-safe normalization; a crafted `.ctoc/state/verify/../x.js`
 * resolves out of the store and is NOT reported as protected.
 *
 * @param {string} filePath - the tool-call target (relative or absolute)
 * @returns {boolean} true iff the normalized path is the verify dir or under it
 */
function isProtectedVerifyPath(filePath) {
  // Same additive pair, same inversion, as `isProtectedLedgerPath` above: the
  // arithmetic check stays, and `resolvesUnder` returns TRUE to deny (including on
  // every fault) so a link into `.ctoc/state/verify/` cannot forge Gate-3 evidence.
  return isUnderProtectedDir(normalizeForProtection(filePath), VERIFY_EVIDENCE_DIR)
    || (realPathConfinement !== null
      && realPathConfinement.resolvesUnder(filePath, VERIFY_EVIDENCE_DIR, process.cwd()));
}

function readStdinJson() {
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return buf ? JSON.parse(buf) : null;
  } catch { return null; }
}

/**
 * Extract the tool-call target from the PreToolUse payload.
 *
 * STDIN IS THE ONLY SOURCE. `process.env.CLAUDE_TOOL_INPUT` is NOT read: the
 * harness never sets it, and reading it first let any process in the session
 * substitute a decoy path — `{"file_path":"VERSION"}` resolved to the whitelist
 * allow at :519 while the real Edit landed elsewhere, defeating the ledger guard,
 * the verify-evidence guard and plan coverage in one line. The trailing best-effort
 * regex over the same untrusted string went with it (it matched `file_path` out of
 * arbitrary prose). PreToolUse.Bash.js records the same lesson; this is the second
 * of the three siblings to apply it, and tests/hook-payload-single-source.test.js
 * fences a fourth from ever reappearing.
 *
 * A null target (no payload, or no recognized key) is fail-closed today: enforce()
 * skips the two protected-path guards and the whitelist, reaches the coverage check
 * with `coverage && targetFile` false, and falls through to block() at :559.
 */
function getTargetFile(stdinJson) {
  if (stdinJson && stdinJson.tool_input) {
    return stdinJson.tool_input.file_path
      || stdinJson.tool_input.path
      || stdinJson.tool_input.notebook_path
      || null;
  }
  return null;
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
 * message stays actionable (it names the target and points at /ctoc:start) and is
 * a pure function so its content can be asserted in-process without process.exit.
 *
 * NAMING THE REJECTED PLAN (info.denial). A plan may DECLARE this file and still
 * grant nothing — because nobody approved it, or because its approval no longer
 * matches its content. Silently blocking in that case is how a permission fix gets
 * reverted, and reverting THIS one reopens a self-granting write surface on gate
 * enforcement. So when `plan-coverage.explainDenial` names a rejected candidate, the
 * banner says which plan, why, and what the human can do about it. It carries a
 * fixed-vocabulary reason and a repository-relative plan reference ONLY — never file
 * contents, an absolute path, or a stack trace — and it changes no allow/deny outcome.
 *
 * @param {string} reason - short machine reason (shown after "BLOCKED:")
 * @param {object} info - { target_file?, project_root?, denial? }
 * @returns {string} the multi-line stderr banner, containing no canonical phrase
 */
// DENIAL_REMEDIES — the reason-keyed remedy table (00129, Part A).
//
// A denial reason is not a remedy. Each row names the ACTION that resolves ITS reason,
// never a restatement of the reason. An UNKNOWN or ABSENT reason falls back to
// DEFAULT_REMEDY (today's sentence, byte-for-byte) so this table can only ADD
// information to a denial, never make one less informative than it is now — a NEW denial
// reason must add a row here or it will render a remedy that does not apply.
const DEFAULT_REMEDY =
  '       Only an APPROVED plan grants write access. Approve or re-approve it via /ctoc:start.\n\n';
const DENIAL_REMEDIES = Object.freeze({
  // 00126: the plan IS approved; re-approving it unchanged changes nothing. The
  // frontmatter key alters the hashed specification — that is the whole point — so it
  // must be added BEFORE the re-approval, in that order.
  'unanchored-declaration':
    '       This plan is already approved, so re-approving it unchanged will not help. '
    + 'Add `unanchored_scope: "<why this file is declared>"` to the plan\'s frontmatter, '
    + 'THEN re-approve it via /ctoc:start.\n\n',
  // 00129 Part B: the plan is approved AND bounded; approval is not the blocker. This row
  // ships ahead of the reason being produced — an unreached row is harmless, a missing
  // row when the reason arrives is a silent fallback to the wrong remedy.
  'not-building':
    '       This plan is approved and bounded; approval is not what is blocking it. '
    + 'Start it building via /ctoc:start, or type an escape phrase yourself.\n\n',
});

// A denial reference reaches this message from `plan-coverage` as a repository-relative
// plan path and a fixed-vocabulary reason — never an absolute path or a multi-line
// string. This PURE, public function must nonetheless leak neither even if handed a
// hostile denial: collapse control characters (no newline → no forged line), strip any
// leading absolute-path prefix, and bound the length.
function safeDenialField(value) {
  return String(value)
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/^([A-Za-z]:)?[\\/]+/, '')
    .trim()
    .slice(0, 200);
}

function buildBlockMessage(reason, info) {
  const target = (info && info.target_file) || '(unknown)';
  const project = (info && info.project_root) || process.cwd();
  const denial = info && info.denial;
  let explanation = '';
  if (denial && denial.plan) {
    const planRef = safeDenialField(denial.plan);
    const reasonText = denial.reason ? safeDenialField(denial.reason) : 'not approved';
    // Exact-match lookup on the RAW reason token; an unknown or absent reason falls back.
    const remedy = (denial.reason && DENIAL_REMEDIES[denial.reason]) || DEFAULT_REMEDY;
    explanation = `  Why: the plan "${planRef}" declares this file, but it grants nothing `
      + `(${reasonText}).\n`
      + remedy;
  }
  return `\n[CTOC v7] Edit BLOCKED: ${reason}\n`
    + `  Target: ${target}\n`
    + `  Project: ${project}\n\n`
    + explanation
    + `  Resolution:\n`
    + `  - Run /ctoc:start to create or activate a plan that covers this file, OR\n`
    + `  - If this change is genuinely small, an escape phrase you type yourself will allow it — see /ctoc:start for the current list.\n\n`;
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
  emitDeny(`CTOC: no active plan covers "${info.target_file || '(unknown)'}" and no escape phrase was used. Create/activate a covering plan via /ctoc:start, or use an escape phrase you type yourself.`);
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

    // 0b. Gate-3 verify evidence is pipeline provenance (forgeable-evidence
    //     defect). `.ctoc/state/verify/<slug>.json` is written PROGRAMMATICALLY
    //     by step-13-verify.js (not a tool call) and is what validateReviewToDone
    //     gates review→done on. Deny ANY editing-tool write there — ahead of the
    //     Step-1 `.ctoc/` whitelist — so an agent cannot forge {"passed":true}
    //     and cross Gate 3 on fabricated data. step-13-verify's real write does
    //     not pass through these hooks, so it is unaffected.
    if (targetFile && isProtectedVerifyPath(targetFile)) {
      return block('verify evidence is written by the pipeline (step-13-verify), not by hand; agent writes to .ctoc/state/verify/ are denied', {
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

    // 5. Block. On the BLOCK PATH ONLY, ask coverage WHY: a plan may declare this
    //    file and still grant nothing (unapproved, or its approval no longer matches
    //    its content). This re-runs the scan, so it must never run on an allow.
    //    Fail-soft to `null` — an explanation must never change a decision.
    let denial = null;
    if (coverage && targetFile && typeof coverage.explainDenial === 'function') {
      try { denial = coverage.explainDenial(targetFile, root); } catch { denial = null; }
    }
    return block('no active plan covers this file and no escape phrase used', {
      tool, target_file: targetFile, project_root: root, denial,
    });
  } catch (err) {
    // Fail OPEN — never break the user's flow due to a hook bug
    process.stderr.write(`[CTOC v7] enforcement hook error (failing open): ${err.message}\n`);
    process.exit(0);
  }
}

module.exports = {
  enforce, isWhitelisted, isProtectedLedgerPath, isProtectedVerifyPath,
  getTargetFile, readStdinJson,
  findEscapeInTranscript, extractUserTypedText, buildBlockMessage,
};

// Direct invocation: this file run as a PreToolUse hook on an Edit tool. Read
// stdin ONCE here (the single consumer of the pipe) and hand the parsed payload
// to enforce(). Guarded so merely importing the module (e.g. from Write.js or a
// test) never consumes stdin or runs enforcement.
if (require.main === module) {
  enforce(readStdinJson());
}

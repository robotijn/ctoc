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
 * mentioned `.ctoc/approvals`, and its old write-allowlist matched
 * `/^\s*node\s+/` FIRST — so
 *   node -e "require('./src/lib/approval-ledger').writeEntry(…)"
 * minted a human-kind approval entry and forged Gate 2 or Gate 3, and
 *   cat > .ctoc/approvals/x.json
 * forged one with no node at all. `isLedgerForgery()` now runs as the FIRST deny
 * layer in `main()` — before the write gate, before the irreversible net, before
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
 * WHAT IT STILL ALLOWS: `node -e` in general (every `src/commands/start.md` recipe —
 * compliance write, cleanup exec, plan numbering, environment, dismiss-stale —
 * keeps working; asserted verbatim against the live start.md by
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
 * THIS GUARD NOW TOUCHES THE FILESYSTEM (slice 00141), and the "pure string check,
 * no filesystem walk" property above was GIVEN UP DELIBERATELY. The arithmetic
 * tests in `isLedgerWrite` reason about NAMES; a symbolic link is a fact about the
 * filesystem, not about a name, so `ln -s .ctoc src/link && echo x > src/link/approvals/f.json`
 * spelled no protected path and forged the ledger. The chosen control is NOT a
 * longer blocklist of link-creating commands: treating `ln` as a write buys NOTHING
 * against this attack (its only consequence is a Step-8 gate the attacker is already
 * past) and COSTS the install step
 * (`npm install` legitimately creates symbolic links in node_modules). The control
 * goes at RESOLUTION: a third, independent test asks the ONE encoding of real-path
 * confinement (`src/lib/real-path-confinement.js`, `resolvesUnder`) whether an
 * operand REALLY lands under `.ctoc/approvals`, whatever links it passes through.
 * It runs LAST — only when the two arithmetic tests both missed — and only on
 * operands, so a command already matching pays no syscall. A THROW out of this
 * guard is an ALLOW (see the fail-open note at its call site), so `resolvesUnder`
 * is wired for its fault-is-`true`, never-throw contract and nothing may wrap it in
 * anything that converts a fault into a permit. If the module fails to LOAD, the
 * guard degrades to arithmetic-only and the link path into the ledger is open again
 * — a real degradation, recorded here rather than silent, and still better than
 * crashing (a crash exits 1, which the harness treats as NON-blocking = allow).
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
const safeFs = require('../lib/safe-fs');
const { loadState, STEP_NAMES } = require('../lib/state-manager');
const { writeToTerminal, colors } = require('../lib/ui');
const { emitDeny } = require('../lib/hook-deny-signal');

// EAGER, NON-fail-soft require (00201). The write-target classifier IS the write
// decision: it works out what a shell command writes and says plainly when it
// CANNOT. A silent degradation to the old allow-everything behaviour is the exact
// defect being fixed, so a load failure must be LOUD — it throws here, reaches the
// fail-open outer catch, and exits 1 (a crash, not an allow), rather than quietly
// restoring the bypass.
const shellWrites = require('../lib/shell-write-targets');

// FAIL-SOFT require of the ONE real-path-confinement encoding (matching the shape
// PreToolUse.Edit.js uses). If it cannot load, `realPathConfinement` stays null and
// the ledger guard degrades to its two ARITHMETIC tests — the link path into the
// ledger is open again. That is a real degradation, recorded rather than silent:
// crashing instead would be WORSE, because this file's error handler exits 1, which
// the harness treats as non-blocking (an allow). See the header paragraph.
let realPathConfinement = null;
try {
  realPathConfinement = require('../lib/real-path-confinement');
} catch {
  realPathConfinement = null;
}

// 00202 — the shell channel asks the SAME plan-coverage question the Edit channel
// asks about DETERMINATE write targets, reusing the Edit channel's whitelist and its
// ROLE-SCOPED user-typed escape check so the two channels cannot drift (two copies of
// one policy is the exact defect this slice repairs). All fail-soft: a load failure
// makes `checkWriteCoverage` fail CLOSED (a determinate uncovered write is denied),
// never fail-open — this stage has no second layer beneath it. Importing PreToolUse.Edit
// runs NO enforcement and consumes NO stdin: its execution is guarded by
// `require.main === module`, and it does not require this file, so there is no cycle.
//
// MODE-BLIND BY CONSTRUCTION (plan 00069; the "structural floor — the mode cannot have
// leaked into a gate path" fence, case 27). This hook NEVER reads the soft/off/strict
// enforcement setting — the fence forbids the very tokens, because the Bash channel's
// write gates are ABSOLUTE denies that the soft/off convenience knob must never weaken.
// A mode-aware Bash gate is exactly the gate-weakening surface that fence prevents. So an
// uncovered determinate write is denied UNCONDITIONALLY (subject only to the whitelist
// and a user-typed escape phrase). The soft/off setting relaxes the Edit channel; it
// never relaxes this one.
//
// SCOPE (Option A). This stage acts on the classifier's `writes` verdict ONLY.
// `indeterminate` commands (npm test, node --test, node -e, npm run lint, node scripts,
// make, python) and `none` commands pass UNCHANGED — the "refuse indeterminate writes"
// policy is DEFERRED (it would deny CTOC's own Step-14 `npm test`; see plan 00202's
// Decisions Taken Under Ambiguity).
let editHook = null;
try { editHook = require('./PreToolUse.Edit'); } catch { editHook = null; }
let coverage = null;
try { coverage = require('../lib/plan-coverage'); } catch { coverage = null; }
let enforcementLog = null;
try { enforcementLog = require('../lib/enforcement-log'); } catch { enforcementLog = null; }

const MINIMUM_STEP_FOR_WRITE = 8;
const MINIMUM_STEP_FOR_COMMIT = 15;

// The write decision (WRITE_PATTERNS + the whole-string ALWAYS_ALLOWED list) moved
// into src/lib/shell-write-targets.js in 00201. The old ALWAYS_ALLOWED was anchored
// to the START of the WHOLE command and consulted FIRST, so any command whose first
// token was cd/ls/node/… never reached the write patterns: `cd . && echo evil > x`
// was allowed. The classifier now walks segments and says `indeterminate` when it
// cannot read the write set, so the step gate fails closed instead.

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

/** The protected directory, relative to the project root, for real-path resolution. */
const LEDGER_DIR_RELATIVE = '.ctoc/approvals';

/**
 * The single-quoted and double-quoted string literals inside a segment, contents
 * only. An interpreter forgery hides the path INSIDE eval code
 * (`node -e "require('fs').writeFileSync('src/link/approvals/f.json','x')"`), where
 * whitespace tokenization mashes the whole code into one garbage operand and the
 * embedded path never appears as a resolvable token. The clean path IS a quoted
 * literal, so those are resolved too — the arithmetic adjacency test already scans
 * the whole segment, but it cannot see a path that reaches the ledger ONLY through a
 * link. Measured false-deny over every real start.md `node -e` recipe (56 candidates)
 * plus the dev corpus: zero (Decision 4's gate). Contents only, so a literal that is
 * a real ledger path is still bounded by the same resolution as a shell operand.
 * @param {string} seg
 * @returns {string[]}
 */
function quotedLiterals(seg) {
  const out = [];
  let m;
  const single = /'([^']*)'/g;
  while ((m = single.exec(seg)) !== null) out.push(m[1]);
  const dbl = /"([^"]*)"/g;
  while ((m = dbl.exec(seg)) !== null) out.push(m[1]);
  return out;
}

/**
 * A bounded number of operands per segment get the real-path resolution. Beyond the
 * cap the two ARITHMETIC tests alone stand — a STATED ceiling (Decision 3), never a
 * silent one: denying a long command outright would deny real work (`git add` with
 * many files). Measured: 51 operands resolve in ~3.3ms, so 128 bounds the worst case
 * well under the per-command budget while never clipping a realistic `git add`.
 */
const OPERAND_RESOLUTION_CAP = 128;

/**
 * A candidate longer than this is NOT resolved. `PATH_MAX` is 4096 on Linux/macOS,
 * `NAME_MAX` 255 per component; a token above that cannot name a real filesystem
 * entry, so `realpathSync`/`lstat` answer `ENAMETOOLONG` — a fault the confinement
 * module (correctly, for a genuine operand) fails CLOSED on, which would turn a
 * harmless `echo <20k chars>` into a false deny. Skipping is SOUND, not a weakening:
 * a path too long to stat is too long to WRITE (the forgery itself would
 * `ENAMETOOLONG`), so no real ledger entry is reachable through such a token, and the
 * arithmetic adjacency test still scans the full string regardless. A real ledger
 * path (`.ctoc/approvals/<slug>.json`) is well under this bound.
 */
const MAX_CANDIDATE_LEN = 4096;

/**
 * Does a single shell operand REALLY resolve under `<cwd>/.ctoc/approvals`, whatever
 * symbolic links it passes through? This is the third, filesystem-aware ledger test
 * — WIRING the one real-path-confinement encoding, never a second copy of it.
 *
 * Applies the SAME accumulated `cd` prefix `resolveTokenPath` builds, so
 * `cd .ctoc && echo > link/approvals/x` is resolved from the ledger-adjacent cwd and
 * cannot slip past. Returns `resolvesUnder`'s verdict UNWRAPPED — including its
 * fault-is-`true` inversion (every resolution fault DENIES) — because a confinement
 * check that permits when it could not look is the whole defect. Returns `false`
 * only when the module is ABSENT (degraded: arithmetic-only) or the token is not a
 * path at all — never converting a fault into a permit.
 *
 * @param {string} prefix - accumulated cwd from prior `cd`/`pushd` segments
 * @param {string} token
 * @returns {boolean} true iff the operand really lands in the ledger (or a fault said so)
 */
function operandResolvesIntoLedger(prefix, token) {
  if (!realPathConfinement) return false; // degraded — the header records this
  const rel = resolveTokenPath(prefix, token);
  if (!rel) return false;
  // A token longer than any real path cannot name a ledger entry; resolving it only
  // manufactures an ENAMETOOLONG fault that fail-closes to a false deny. See the const.
  if (rel.length > MAX_CANDIDATE_LEN) return false;
  return realPathConfinement.resolvesUnder(rel, LEDGER_DIR_RELATIVE, process.cwd());
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
    const cdKw = seg.match(/^(?:cd|pushd)\b(.*)$/i);
    if (cdKw) {
      // `cd`/`pushd` accept OPTIONS (-L, -P, -e, -@, combined -LP) and a `--`
      // end-of-options marker BEFORE the directory operand. Skip the leading
      // options and a single `--`, then take the FIRST real operand as the dir —
      // the naive "first token after cd" capture set the prefix to the literal
      // `--`/`-L`/… and let a following write resolve outside the ledger, slipping
      // the forgery gate. A bare `-` WITHOUT a preceding `--` is the previous-dir
      // shortcut (reset); AFTER `--` the next token is the directory even if it
      // begins with `-` (`cd -- -` is a dir literally named `-`, not the shortcut).
      // DEQUOTE each token FIRST, then apply the option-skip / `--`-separator
      // logic on the dequoted value. bash honors a QUOTED `"--"` / `'--'` as the
      // end-of-options separator (and quoted `"-L"`/`"-P"` as options) exactly like
      // the bare forms; matching `tok === '--'` / the option regex on the RAW token
      // (before quote-stripping) let `cd "--" .ctoc/approvals && <write>` take `--`
      // as the literal directory, discard the ledger operand, and slip the gate.
      const tokens = cdKw[1].split(/\s+/).filter(Boolean);
      let dir = '';
      let afterSep = false;      // have we passed the `--` end-of-options marker?
      let dirIsAfterSep = false; // did the chosen dir token come after `--`?
      let sawOperand = false;    // did a real directory operand token appear at all?
      for (const rawTok of tokens) {
        const tok = rawTok.replace(/['"`()]/g, '');       // dequote BEFORE deciding
        if (!afterSep) {
          if (tok === '--') { afterSep = true; continue; } // end-of-options marker
          if (/^-[A-Za-z@]+$/.test(tok)) continue;         // a leading cd OPTION
        }
        dir = tok;
        dirIsAfterSep = afterSep;
        sawOperand = true;
        break;
      }
      // An EMPTY dequoted operand (`cd ""` / `cd ''` / `cd -- ""`) is a bash NO-OP:
      // it stays in the current directory and returns exit 0, so the `&&` chain
      // continues from the SAME cwd. Resetting the prefix to root there let
      // `cd .ctoc/approvals && cd "" && tee evil.json` resolve evil.json to root and
      // slip the ledger guard while bash actually wrote `.ctoc/approvals/evil.json`.
      // Leave the prefix UNCHANGED for an empty operand (a present-but-empty token);
      // a bare `cd` with NO operand at all is `cd $HOME` and keeps its prior reset.
      if (sawOperand && dir === '') continue;
      if (dir === '' || (dir === '-' && !dirIsAfterSep)) prefix = '';
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
    //     prefix; OR (c) an operand that REALLY resolves into the ledger through a
    //     symbolic link. (a) and (b) are ARITHMETIC and run FIRST — a segment they
    //     already match pays no syscall — and (c) touches the filesystem only on the
    //     operands of a segment neither arithmetic test caught.
    //     Redirect operators become separators so `echo x>approvals/y` splits.
    let touches = LEDGER_SEGMENT_RE.test(normalizeForMatch(seg));
    const tokens = seg.replace(/[<>]+/g, ' ').split(/\s+/).filter(Boolean);
    const operands = tokens.slice(1).filter((t) => !t.startsWith('-'));
    if (!touches) {
      touches = operands.some((t) => LEDGER_RESOLVED_RE.test(resolveTokenPath(prefix, t)));
    }
    if (!touches) {
      // (c) The filesystem-aware test — the link-through-the-ledger close. Candidates
      // are the shell operands PLUS the segment's quoted string literals, so a path
      // embedded in `node -e "…'link/approvals/x'…"` is resolved as well. Bounded by
      // OPERAND_RESOLUTION_CAP (Decision 3, a stated ceiling); beyond the cap the
      // arithmetic verdict above stands.
      const candidates = operands.concat(quotedLiterals(seg));
      touches = candidates.slice(0, OPERAND_RESOLUTION_CAP)
        .some((t) => operandResolvesIntoLedger(prefix, t));
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
      reason: `writes to the approval ledger (.ctoc/approvals/) are DENIED on the Bash channel — the ledger is human-approval provenance, and splitting the path across a \`cd\` does not change that. Cross the gate through /ctoc:start; the ONLY sanctioned ledger writer is \`node ${SANCTIONED_WRITER}\` (argv-driven, reviewable).`,
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

// THE WRITE DECISION (00201 → 00202). It used to live in a local `isWriteCommand`
// helper, but `main()` now calls `shellWrites.classifyWrites(command)` ONCE and reads
// its verdict directly — for BOTH the step gate (`verdict !== 'none'` is a write) and
// the plan-coverage stage (`verdict === 'writes'` is a determinate write). Classifying
// once avoids the double scan (Step 12) and keeps the two gates reading one answer.
//
// PER SEGMENT (00201 — the cd-prefix bypass): the old whole-string-anchored
// ALWAYS_ALLOWED list matched cd/ls/node/… FIRST, so `cd . && echo evil > src/x.js`
// never reached the write patterns and was ALLOWED. `classifyWrites` walks segments and
// cannot be short-circuited by a benign first token. INDETERMINATE counts as a write for
// the STEP gate (a command whose targets cannot be read has not been shown harmless),
// but NOT for the coverage stage — an indeterminate command is passed unchanged there
// (Option A; the indeterminate-deny is deferred, see plan 00202).

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
 * Read the PreToolUse payload from STDIN (fd 0). The pipe is single-consumer, so
 * `main()` calls this exactly once and threads the result to every consumer. Returns
 * BOTH the command string AND the parsed payload — the parsed payload carries
 * `transcript_path`, which the new coverage stage's escape-phrase check needs. Fails
 * OPEN (command '') on any read/parse error — a broken pipe cannot crash the gate; an
 * empty command is then allowed by `main()`'s first check. On the regex fallback the
 * payload is null (no transcript is recoverable), so the escape check simply finds
 * nothing — deny-ward, never a crash.
 *
 * The reader's fail-open and its truncating fallback are NOT changed here (they are a
 * separate slice, 00206). This change only exposes the already-parsed payload that the
 * single stdin read produced.
 * @returns {{command: string, stdinJson: (object|null)}}
 */
function getPayload() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8') || ''; } catch { return { command: '', stdinJson: null }; }
  if (!raw) return { command: '', stdinJson: null };
  try {
    const parsed = JSON.parse(raw);
    const command = (parsed && parsed.tool_input && parsed.tool_input.command)
      || (parsed && parsed.command) || '';
    return { command, stdinJson: parsed };
  } catch {
    const m = raw.match(/command['":\s]+["']?([^"'\n]+)/);
    return { command: m ? m[1] : '', stdinJson: null };
  }
}

/**
 * Read the raw transcript string from the payload's `transcript_path`, mirroring
 * PreToolUse.Edit.js:readTranscript. Fail-soft to null (a missing/unreadable
 * transcript means "no escape phrase found", never a crash).
 * @param {object|null} stdinJson - the parsed PreToolUse payload
 * @returns {string|null}
 */
function readTranscript(stdinJson) {
  if (!stdinJson || !stdinJson.transcript_path) return null;
  // safeFs (like PreToolUse.Edit.js:readTranscript) — validates the path and keeps the
  // security/detect-non-literal-fs-filename lint clean on this attacker-influenced input.
  try { return safeFs.readFileSync(stdinJson.transcript_path, 'utf8'); } catch { return null; }
}

/**
 * Decide plan coverage for a DETERMINATE-write command (classified.verdict ===
 * 'writes') that already cleared the step gate. Reuses the Edit channel's exported
 * whitelist and role-scoped escape check and the shared plan-coverage oracle — never a
 * second copy of any of them.
 *
 * RETURN-NEVER-THROW. Every fault returns the deny-ward value: this gate has no second
 * layer, so "cannot decide" is `uncovered` (which the caller denies in strict mode).
 * A missing `plan-coverage` or `PreToolUse.Edit` module therefore fails CLOSED here —
 * the deliberate inverse of the Edit channel's fail-soft, which has a whitelist,
 * project detection and an escape phrase underneath it; this stage does not.
 *
 * @param {{verdict: string, targets: string[], reason: (string|null)}} classified
 * @param {string} root - process.cwd()
 * @param {string|null} transcript - the raw transcript string (for the escape check)
 * @returns {{result: 'covered'|'whitelist'|'escape'|'uncovered',
 *            target: (string|null), plan: (string|null), escape_phrase: (string|null)}}
 */
function checkWriteCoverage(classified, root, transcript) {
  try {
    // 1. A user-TYPED escape phrase allows the write (role-scoped: a phrase in a
    //    tool_result does not count — findEscapeInTranscript enforces that).
    if (editHook && typeof editHook.findEscapeInTranscript === 'function') {
      const escape = editHook.findEscapeInTranscript(transcript);
      if (escape) return { result: 'escape', target: null, plan: null, escape_phrase: escape };
    }

    // 2. Every determinate target must be whitelisted or covered by an APPROVED plan.
    //    A missing oracle/whitelist ⇒ cannot check ⇒ fail closed (uncovered).
    const canCheck = coverage && typeof coverage.findCoveringPlan === 'function'
      && editHook && typeof editHook.isWhitelisted === 'function';
    let coveredPlan = null;
    let sawNonWhitelist = false;
    for (const target of classified.targets) {
      if (canCheck && editHook.isWhitelisted(target)) continue; // infrastructure path
      sawNonWhitelist = true;
      if (!canCheck) return { result: 'uncovered', target, plan: null, escape_phrase: null };
      const match = coverage.findCoveringPlan(target, root);
      if (!match) return { result: 'uncovered', target, plan: null, escape_phrase: null };
      if (!coveredPlan) coveredPlan = match.plan; // first covering plan, for the log
    }
    if (!sawNonWhitelist) return { result: 'whitelist', target: null, plan: null, escape_phrase: null };
    return { result: 'covered', target: null, plan: coveredPlan, escape_phrase: null };
  } catch {
    // Return-never-throw: a fault fails toward deny, never allow.
    const target = (classified && classified.targets && classified.targets[0]) || null;
    return { result: 'uncovered', target, plan: null, escape_phrase: null };
  }
}

/**
 * Record ONE coverage decision to the same store the Edit channel uses. Best-effort:
 * wrapped in its own try/catch, ignores the return value, and NEVER changes an outcome
 * (a log failure is not a permission decision — matches PreToolUse.Edit.js allow/block).
 * The command string is deliberately NOT recorded: a command can carry a secret and this
 * log is a file people paste into issues; `target_file` plus a fixed-vocabulary `reason`
 * reconstructs the decision without recording what was typed.
 * @param {object} entry
 * @param {string} root
 */
function logCoverage(entry, root) {
  if (!enforcementLog || typeof enforcementLog.logEnforcement !== 'function') return;
  try {
    enforcementLog.logEnforcement(entry, root);
  } catch (err) {
    // A log-write failure is best-effort and is NOT a permission verdict — the
    // allow/deny was already decided above and is unaffected. Record it on stderr
    // (never stdout, which carries only the deny decision JSON) and continue.
    process.stderr.write(`[CTOC] Bash coverage log write failed (ignored, outcome unchanged): ${err.message}\n`);
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
  const { command, stdinJson } = getPayload();

  if (!command) {
    process.exit(0);
  }

  // R3-A: LEDGER FORGERY — the FIRST deny layer of all, ahead of the write gate and
  // ahead of every step gate, so no allowlist and no Iron Loop step can short-circuit
  // past it (a forging `node -e` one-liner must be denied even at a step where the
  // write gate would allow it). Pure string check: no state read, no fs.
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

  // Classify the write set ONCE and thread it to BOTH the step gate and the coverage
  // stage (Step 12 — never a double scan). A non-'none' verdict is a write for the step
  // gate; a 'writes' verdict (determinate targets) is what the coverage stage judges.
  const classified = shellWrites.classifyWrites(command);
  const isWrite = classified.verdict !== 'none';

  // Check for write command
  if (isWrite) {
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

  // 00202: PLAN-COVERAGE stage — DETERMINATE writes ONLY. Reaching here means the step
  // gate cleared this command (a pre-step-8 write already emitted its step reason above
  // and exited), so this is the second question, asked only of writes the step gate let
  // through. `indeterminate` and `none` verdicts pass unchanged (Option A — the
  // indeterminate-deny is deferred to its own human-approved slice). MODE-BLIND: an
  // uncovered determinate write is denied unconditionally (see the require-block note and
  // plan 00069's mode structural floor, case 27); the whitelist and a user-typed escape
  // phrase are the only two ways past it, matching the Edit channel's coverage exemptions.
  if (classified.verdict === 'writes') {
    const transcript = readTranscript(stdinJson);
    const cov = checkWriteCoverage(classified, projectPath, transcript);

    let outcome;
    if (cov.result === 'covered') outcome = 'allow';
    else if (cov.result === 'whitelist') outcome = 'whitelist';
    else if (cov.result === 'escape') outcome = 'escape';
    else outcome = 'block'; // uncovered — always denied on the Bash channel

    logCoverage({
      tool: 'Bash',
      target_file: cov.target,
      plan_matched: cov.plan,
      escape_phrase: cov.escape_phrase,
      outcome,
      reason: cov.result, // fixed vocabulary — never command text
    }, projectPath);

    if (outcome === 'block') {
      const reason = `no approved plan covers "${cov.target}" — a shell command may not `
        + `write a source file the plan queue does not declare. Create or activate a `
        + `covering plan via /ctoc:start, or use an escape phrase you type yourself.`;
      writeToTerminal(formatBlocked(command, state, reason, 'COVERAGE'));
      emitDeny(`CTOC: ${reason}`);
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
// FAIL-OPEN CATCH — and this is why the real-path-confinement wiring above must
// RETURN a refusing value and NEVER throw. `process.exit(1)` is the legacy cosmetic
// code this file's header records the harness treating as NON-blocking: it is NOT a
// deny (the real deny is `emitDeny`'s decision JSON + exit 0). So a throw out of the
// ledger guard reaches here and becomes an ALLOW — the exact defect the guard exists
// to prevent. This reaches the same conclusion as the editing hook's fail-open catch
// by a DIFFERENT route (there, `catch → exit(0)`; here, `catch → exit(1)` = harness
// non-block); both must be preserved as-is, never "unified" into consistency.
main().catch(err => {
  console.error('[CTOC] Bash gate error:', err.message);
  process.exit(1);
});

'use strict';

/**
 * SHELL WRITE-TARGET CLASSIFIER (00201).
 *
 * `src/hooks/PreToolUse.Bash.js` must decide what files a shell command writes so
 * the Iron-Loop step gate can judge it. This module is that decision, factored out
 * so a two-character `cd` prefix can no longer disable it (the defect: a
 * whole-string-anchored allowlist matched `cd`/`ls`/`node` FIRST, so
 * `cd . && echo evil > src/x.js` never reached the write patterns at all).
 *
 * A shell command is a program in a language with expansion, substitution,
 * indirection and run-time control flow: "which files does this command write" is
 * UNDECIDABLE in general. So the answer is THREE-VALUED and the third value is the
 * whole point:
 *
 *   'none'          no recognized write shape (the recognized set is a denylist and
 *                   a denylist is never complete — this can NEVER soundly mean
 *                   "writes nothing", only "nothing this classifier recognizes")
 *   'writes'        determinate literal targets, cd-resolved
 *   'indeterminate' a write shape whose target cannot be read, OR a construct that
 *                   makes the segment unreadable (interpreter, task runner, command
 *                   substitution, glob/variable in a target, heredoc, unknown cwd, …)
 *
 * `indeterminate` is NEVER collapsed into `none`: a permission gate built on a wrong
 * "writes nothing" is more dangerous than no gate, because it records "unknown" as
 * "allowed". The consumer treats `indeterminate` as a write and FAILS CLOSED.
 *
 * RETURN-NEVER-THROW. This runs inside a PreToolUse hook whose outer catch fails
 * OPEN (a throw becomes an ALLOW — see PreToolUse.Edit.js). There is NO `throw` in
 * this module, and the one top-level `try` returns `indeterminate` rather than
 * rethrowing. No I/O: no `fs`, no `child_process`. Every regex is a LITERAL,
 * linear-time pattern (no nested quantifier, no data-derived RegExp) — the command
 * string is attacker-influenced and this runs on every Bash call.
 *
 * KNOWN LIMITS, named rather than hidden (see plan 00201 "What this plan does NOT
 * fix"): segmentation is quote-unaware (so `echo "a > b"` reads as a write to `b` —
 * a false positive, the deny-ward direction); PowerShell / cmd.exe write forms are
 * not recognized; and any binary that writes as a side effect without appearing in
 * the tables below classifies `none`.
 */

const path = require('node:path');

/** Reason vocabulary — a CLOSED set, and it NEVER carries command text (a command
 * may contain a secret and the reason is logged/rendered downstream). */
const REASONS = Object.freeze({
  INTERPRETER: 'interpreter',
  TASK_RUNNER: 'task runner',
  COMMAND_SUBSTITUTION: 'command substitution',
  GLOB_OR_VARIABLE: 'glob or variable in a write target',
  HEREDOC: 'heredoc',
  UNKNOWN_CWD: 'working directory unknown',
  TOO_LARGE: 'command too large to analyse',
  // Two additions beyond the plan's seven, both command-text-free: a write shape
  // whose target genuinely cannot be read from the command line (an empty/missing
  // redirect target; `patch`, whose targets live in the diff data), and an internal
  // analysis fault (the return-never-throw backstop).
  UNREADABLE_TARGET: 'write target could not be read',
  FAULT: 'analysis fault',
});

const MAX_COMMAND_BYTES = 64 * 1024; // 64 KiB
const MAX_SEGMENTS = 256;

/** Characters that make a token non-literal (expansion happens in the shell). */
const NON_LITERAL_RE = /[$`*?[\]{}]/;

/** Interpreters: writes happen inside a program this gate cannot read. */
const INTERPRETERS = new Set([
  'node', 'nodejs', 'deno', 'bun', 'ts-node', 'tsx',
  'python', 'python2', 'python3', 'ruby', 'perl', 'php',
  'sh', 'bash', 'zsh', 'ksh', 'dash', 'awk', 'gawk', 'osascript',
]);

/** Task runners / build tools: writes are determined at run time by content elsewhere. */
const TASK_RUNNERS = new Set([
  'make', 'cmake', 'ninja', 'cargo', 'go', 'gradle', 'gradlew', 'mvn', 'mvnw',
  'dotnet', 'npm', 'npx', 'yarn', 'pnpm', 'pip', 'pip3', 'poetry', 'rake', 'bundle', 'gem',
]);

/** Runners that build the command from data — unreadable by construction. */
const DATA_DRIVEN = new Set(['xargs', 'parallel', 'eval']);

/**
 * Split a command into shell segments on `;`, newline, `&&`, `||`, `|`, `&`.
 * QUOTE-UNAWARE by design (a correct shell parser is a large attack surface and the
 * failure it prevents, a false-positive deny, fails in the safe direction). `&&`
 * and `||` are matched before the single-character `&`/`|` by alternation order.
 * A single `|` immediately preceded by `>` is the clobber-redirect `>|`, NOT a
 * pipe, so it is not a split point. Exported for the Bash hook and 00202's work.
 * @param {string} command
 * @returns {string[]}
 */
function splitSegments(command) {
  return String(command).split(/\|\||&&|[;\n&]|(?<!>)\|/);
}

/** The command word (basename, lower-cased) of a segment, ignoring a leading
 * `env`/`command`/`builtin`/`exec`/`\` wrapper and an absolute path. */
function commandWord(tokens) {
  let i = 0;
  while (i < tokens.length) {
    let t = tokens[i].replace(/^\\/, '');
    if (t === 'env' || t === 'command' || t === 'builtin' || t === 'exec') { i += 1; continue; }
    // `env` VAR=val assignments before the real command word
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i += 1; continue; }
    t = t.replace(/['"]/g, '');
    const base = t.includes('/') ? t.slice(t.lastIndexOf('/') + 1) : t;
    return { word: base.toLowerCase(), index: i };
  }
  return { word: '', index: 0 };
}

/**
 * Resolve one literal token against an accumulated `cd` prefix, or return null when
 * the token is non-literal (expansion / glob / tilde) and therefore unresolvable.
 * A backslash path in a target position is normalized to forward slashes first
 * (a command string carries POSIX-shaped paths even on Windows). Exported for
 * 00202's coverage lookup.
 * @param {string} prefix
 * @param {string} spec - one shell operand as written
 * @returns {string|null}
 */
function resolveTarget(prefix, spec) {
  if (spec == null) return null;
  let t = String(spec).replace(/^["']|["']$/g, ''); // strip surrounding quotes
  if (!t) return null;
  if (t.startsWith('~')) return null;                 // home expansion — shell only
  t = t.replace(/\\/g, '/');                          // backslash path -> POSIX
  if (NON_LITERAL_RE.test(t)) return null;            // expansion / glob — shell only
  const cwd = String(prefix || '').replace(/\\/g, '/');
  if (t.startsWith('/')) return path.posix.normalize(t).replace(/\/+$/, '') || '/';
  const joined = cwd ? cwd + '/' + t : t;
  return path.posix.normalize(joined).replace(/\/+$/, '');
}

/** Why a target token is non-literal: distinguishes command-substitution from a
 * plain glob/variable, matching the plan's reason split (case 15 vs 16). */
function nonLiteralReason(token) {
  const t = String(token);
  if (t.includes('`') || t.includes('$(')) return REASONS.COMMAND_SUBSTITUTION;
  return REASONS.GLOB_OR_VARIABLE;
}

/** Tokenize a segment: split on whitespace, keeping redirect operators visible. */
function tokenize(seg) {
  return seg.trim().split(/\s+/).filter(Boolean);
}

/**
 * The redirect write targets in a segment, read from the RAW segment text so
 * `echo x>f` (no spaces), `2> f`, `&> f`, `>| f` and `>> f` are all caught. Returns
 * one entry per redirect: `{ target }` where `target` is the path as written (may be
 * '' for a missing target, or non-literal). Input redirects (`<`, `<<`) are NOT
 * write shapes and are excluded.
 * @param {string} seg
 * @returns {Array<{target: string}>}
 */
function redirectTargets(seg) {
  const out = [];
  // N>>, N>, &>, >|, >>, >  followed by an optional target token. `<<`/`<` excluded
  // (the leading char class forbids a preceding `<`, and `[^<]` guards `<<`).
  const re = /(?:^|[^<>&\d])(?:\d*>>|\d*>\||&>|\d*>)\s*([^\s;|&<>]*)/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    out.push({ target: m[1] || '' });
  }
  return out;
}

/** Non-flag operands after the command word (flags = tokens starting with `-`),
 * excluding a token consumed by an input redirect. */
function operandsAfter(tokens, startIndex) {
  const out = [];
  for (let i = startIndex; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === '<' || t === '>' || t === '>>') { i += 1; continue; } // redirect + its file
    if (t.startsWith('-')) continue;
    out.push(t);
  }
  return out;
}

/**
 * Classify a single non-cd segment against the accumulated cd `prefix`.
 * @returns {{kind: 'none'|'writes'|'indeterminate', targets: string[], reason: (string|null)}}
 */
function classifySegment(seg, prefix) {
  const targets = [];
  let indeterminateReason = null;

  const markIndet = (reason) => { if (!indeterminateReason) indeterminateReason = reason; };

  // Determinate redirect targets, read from the raw segment (catches `x>f`).
  const redirects = redirectTargets(seg);
  const hasRedirectShape = redirects.length > 0;
  for (const { target } of redirects) {
    if (target === '') { markIndet(REASONS.UNREADABLE_TARGET); continue; }
    const resolved = resolveTarget(prefix, target);
    if (resolved === null) markIndet(nonLiteralReason(target));
    else targets.push(resolved);
  }

  const tokens = tokenize(seg);
  const { word, index } = commandWord(tokens);

  // Heredoc anywhere in the segment — payload is out of band.
  if (/<<-?\s*['"]?[A-Za-z_]/.test(seg) || /<<-?\s*['"]/.test(seg)) markIndet(REASONS.HEREDOC);

  // Opaque command words: writes are unreadable by construction.
  const hasExec = tokens.slice(index + 1).includes('-exec') || tokens.slice(index + 1).includes('-execdir');
  if (INTERPRETERS.has(word)) markIndet(REASONS.INTERPRETER);
  else if (TASK_RUNNERS.has(word)) markIndet(REASONS.TASK_RUNNER);
  else if (DATA_DRIVEN.has(word)) markIndet(REASONS.TASK_RUNNER);
  else if (word === 'find' && hasExec) markIndet(REASONS.TASK_RUNNER);
  else if (word === 'patch') markIndet(REASONS.UNREADABLE_TARGET); // targets live in the diff data

  // Determinate write commands (operand-shaped). Only when the segment is not an
  // interpreter/opaque word already accounted for above.
  const rest = tokens.slice(index + 1);
  const pushTarget = (raw) => {
    const resolved = resolveTarget(prefix, raw);
    if (resolved === null) markIndet(nonLiteralReason(raw));
    else targets.push(resolved);
  };

  if (word === 'cp' || word === 'mv' || word === 'install') {
    const ops = operandsAfter(tokens, index + 1);
    if (ops.length >= 2) pushTarget(ops[ops.length - 1]);
    else if (ops.length === 1) markIndet(REASONS.UNREADABLE_TARGET);
    // else: no operand at all — malformed, nothing to say
  } else if (word === 'touch' || word === 'mkdir' || word === 'truncate') {
    // `truncate -s SIZE FILE` drops the size argument that follows -s/--size.
    const files = word === 'truncate' ? dropSizeArg(tokens, index + 1) : operandsAfter(tokens, index + 1);
    for (const f of files) pushTarget(f);
  } else if (word === 'ln') {
    const ops = operandsAfter(tokens, index + 1);
    if (ops.length >= 1) pushTarget(ops[ops.length - 1]);
  } else if (word === 'tee') {
    for (const op of operandsAfter(tokens, index + 1)) pushTarget(op);
  } else if (word === 'sed' || word === 'perl') {
    // In-place edit: -i / -i.bak. Otherwise the write happens inside the program.
    if (rest.some((t) => t === '-i' || t.startsWith('-i') || t === '--in-place')) {
      for (const f of inPlaceFiles(rest)) pushTarget(f);
    } else if (word === 'perl') {
      markIndet(REASONS.INTERPRETER); // perl running a program, not an in-place edit
    }
    // sed without -i is a read (stream to stdout) — no write shape
  } else if (word === 'dd') {
    for (const t of rest) {
      if (t.startsWith('of=')) pushTarget(t.slice(3));
    }
  } else if (word === 'curl') {
    collectFlagValue(rest, ['-o', '--output'], pushTarget);
  } else if (word === 'wget') {
    collectFlagValue(rest, ['-O', '--output-document'], pushTarget);
  }

  if (indeterminateReason) return { kind: 'indeterminate', targets, reason: indeterminateReason };
  if (targets.length > 0 || hasRedirectShape) return { kind: 'writes', targets, reason: null };
  return { kind: 'none', targets: [], reason: null };
}

/** `truncate -s SIZE FILE…` — the file operands, dropping the size arg after -s. */
function dropSizeArg(tokens, start) {
  const files = [];
  for (let i = start; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === '-s' || t === '--size') { i += 1; continue; }
    if (t.startsWith('--size=') || (t.startsWith('-s') && t.length > 2)) continue;
    if (t.startsWith('-')) continue;
    files.push(t);
  }
  return files;
}

/** The file operands of a `sed -i` / `perl -i` in-place edit: non-flag tokens after
 * the last script-bearing token, best-effort. Flags and the first script operand
 * are skipped; the remainder are files. */
function inPlaceFiles(rest) {
  const files = [];
  let scriptSkipped = false;
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i];
    if (t.startsWith('-')) {
      // -e / -f / --expression consume the next token as a script/file argument.
      if (t === '-e' || t === '-f' || t === '--expression' || t === '--file') { i += 1; scriptSkipped = true; }
      continue;
    }
    if (!scriptSkipped) { scriptSkipped = true; continue; } // the inline script operand
    files.push(t);
  }
  return files;
}

/** Collect the value of `-o path` / `--output path` style flags. */
function collectFlagValue(rest, flags, push) {
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i];
    if (flags.includes(t)) { if (i + 1 < rest.length) push(rest[i + 1]); i += 1; continue; }
    for (const f of flags) {
      if (t.startsWith(f + '=')) push(t.slice(f.length + 1));
    }
  }
}

/** The directory operand of a `cd`/`pushd` segment, or a sentinel. */
function cdOperand(tokens, index) {
  // Skip cd options (-L, -P, -e, -@, combined) and a `--` end-of-options marker.
  let afterSep = false;
  for (let i = index + 1; i < tokens.length; i += 1) {
    const tok = tokens[i].replace(/['"]/g, '');
    if (!afterSep) {
      if (tok === '--') { afterSep = true; continue; }
      if (/^-[A-Za-z@]+$/.test(tok)) continue;
    }
    return tok;
  }
  return null; // bare cd (=> $HOME) or nothing
}

/**
 * Classify a shell command string into determinate write targets, an indeterminate
 * verdict, or no recognized write. Pure, no I/O, no throw.
 * @param {string} command
 * @returns {{verdict: 'none'|'writes'|'indeterminate', targets: string[], reason: (string|null)}}
 */
function classifyWrites(command) {
  try {
    if (typeof command !== 'string' || command.length === 0) {
      return { verdict: 'none', targets: [], reason: null };
    }
    if (command.length > MAX_COMMAND_BYTES) {
      return { verdict: 'indeterminate', targets: [], reason: REASONS.TOO_LARGE };
    }
    const segments = splitSegments(command);
    if (segments.length > MAX_SEGMENTS) {
      return { verdict: 'indeterminate', targets: [], reason: REASONS.TOO_LARGE };
    }

    const allTargets = [];
    let indeterminateReason = null;
    let sawWrite = false;
    let prefix = '';
    let unanchored = false;

    for (const rawSeg of segments) {
      const seg = rawSeg.trim();
      if (!seg) continue;

      const tokens = tokenize(seg);
      const { word, index } = commandWord(tokens);

      if (word === 'cd' || word === 'pushd') {
        const dir = cdOperand(tokens, index);
        if (dir === null) { prefix = ''; unanchored = false; continue; } // cd $HOME => root
        if (dir === '-') { prefix = ''; unanchored = false; continue; }  // previous dir => reset
        const resolved = resolveTarget(prefix, dir);
        if (resolved === null) { unanchored = true; } // non-literal cwd taints the remainder
        else { prefix = resolved; unanchored = false; }
        continue;
      }

      const r = classifySegment(seg, prefix);
      for (const t of r.targets) allTargets.push(t);

      if (unanchored && (r.kind === 'writes' || r.kind === 'indeterminate')) {
        if (!indeterminateReason) indeterminateReason = REASONS.UNKNOWN_CWD;
      } else if (r.kind === 'indeterminate') {
        if (!indeterminateReason) indeterminateReason = r.reason;
      } else if (r.kind === 'writes') {
        sawWrite = true;
      }
    }

    if (indeterminateReason) {
      return { verdict: 'indeterminate', targets: allTargets, reason: indeterminateReason };
    }
    if (sawWrite || allTargets.length > 0) {
      return { verdict: 'writes', targets: allTargets, reason: null };
    }
    return { verdict: 'none', targets: [], reason: null };
  } catch {
    // Return-never-throw: a fault fails toward the deny-ward value, never `none`.
    return { verdict: 'indeterminate', targets: [], reason: REASONS.FAULT };
  }
}

module.exports = { classifyWrites, splitSegments, resolveTarget };

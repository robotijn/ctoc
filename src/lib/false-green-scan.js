'use strict';

/**
 * FALSE-GREEN SCANNER — detects checks that report a verdict on input they never
 * actually received.
 *
 * THE DEFECT CLASS, in the human's words: "a check that reports failure or success
 * based on input it never actually received." It has shipped FIVE times in this
 * repository, every time through a green suite and a passed review, because the
 * instrument was blind and the blindness itself was reported as a value:
 *
 *   1. `test-gate.js` `parseFail` used the SUCCESS value `0` as its no-match default;
 *      ANSI colour under FORCE_COLOR broke the line anchor, so it reported `fail 0`
 *      over 8 real failures.                                    → S1 parse-default
 *   2. `step-13-verify.js` sliced the run output to 4000 characters and then parsed
 *      the TRUNCATED copy for a verdict the runner prints LAST, so every plan was
 *      recorded as failed.                                      → S2 truncate-then-parse
 *   3. `test-gate.js` called `process.exit` after ~1.4MB of piped writes. Writes to a
 *      PIPE are asynchronous and `process.exit` discards whatever is still buffered,
 *      so the consumer received output cut mid-line. This one is the tell for the
 *      whole class: it is INVISIBLE interactively, because terminal writes are
 *      synchronous. Only an automated caller ever sees it.  → S3 exit-with-pending-writes
 *   4. Once 3 was fixed the output overflowed `execSync`'s default 1MB `maxBuffer`,
 *      which threw and was reported as "Tests failed" — a PASSING suite recorded as a
 *      test failure.                                            → S4 unbounded-capture
 *   5. Historic siblings returned `0` on a parse failure, reporting a pass over real
 *      failures.                                                → S1 again
 *
 * THE TWO FIXED EXEMPLARS are the specification for what "correct" looks like, and
 * every `fix` string below quotes one of them: `src/scripts/test-gate.js` (parsers
 * return `null`, never `0`; ANSI stripped before parsing; an explicit 64MB
 * `maxBuffer`) and `src/lib/request-exit.js` (`process.exitCode` + return, so Node
 * drains stdout before exiting).
 *
 * PRECISION IS LIMITED, AND SAYS SO. This is line and regex scanning, not a
 * JavaScript parser — no parser exists in the standard library and no new dependency
 * is permitted. Detection therefore cannot be exact, and the empty-catch signature
 * alone matches over a hundred existing sites. The precision burden sits on the
 * RATCHET rather than the detector: every pre-existing site is recorded as DEBT in
 * `.ctoc/false-green-baseline.json`, and a NEW one fails
 * `tests/false-green-fence.test.js`, forcing a human to look at it. That is the same
 * honest trade `tests/reachability.test.js` made with ~92 dead files.
 *
 * THIS MODULE MUST NOT COMMIT ITS OWN DEFECT. An unreadable file THROWS with its path
 * rather than being skipped, and a bad `root` throws rather than returning an empty
 * finding list — because an empty finding list IS the success value here, so returning
 * one for input that was never read would be exactly the defect being hunted.
 *
 * Cross-platform: `path.join` for walking, and every emitted `file` is normalized to
 * POSIX separators so a baseline committed on macOS matches on Windows.
 */

const path = require('node:path');
const safeFs = require('./safe-fs');

/** Signatures, in the order they are reported. Always all five, even at zero. */
const SIGNATURES = [
  'parse-default',
  'truncate-then-parse',
  'exit-with-pending-writes',
  'unbounded-capture',
  'silent-catch',
];

/** The prescribed safe shape for each signature, naming the shipped exemplar. */
const FIXES = {
  'parse-default':
    'A parser whose no-match branch returns a verdict cannot distinguish "the answer is 0" ' +
    'from "I could not read my input". Return null (or undefined, or throw) instead, and let ' +
    'the caller treat unreadable as a FAILURE condition. Model: parseCoveragePct in ' +
    'src/scripts/test-gate.js, which ends `matches.length ? Number(...) : null`.',
  'truncate-then-parse':
    'Bounding the input before reading it means the verdict is read off a copy that may not ' +
    'contain it — and a runner prints its verdict LAST. Parse the FULL input first; bound only ' +
    'what is STORED. Model: boundOutput in src/lib/step-13-verify.js (head + elision marker + ' +
    'TAIL), called only after every parser has read the complete output.',
  'exit-with-pending-writes':
    'process.exit terminates immediately, and writes to a PIPE are asynchronous — anything still ' +
    'buffered is discarded, which drops precisely the tail (the summary, the verdict). It is ' +
    'invisible interactively because terminal writes are synchronous. Use requestExit(code) from ' +
    'src/lib/request-exit.js and then return; Node drains stdout and exits with that code.',
  'unbounded-capture':
    "execSync/spawnSync default to a 1MB maxBuffer; overflowing it THROWS, and a thrown capture " +
    'reads exactly like a failed command — a passing run gets recorded as a failure. Set an ' +
    'explicit maxBuffer AND distinguish overflow from command failure. Model: ' +
    'src/lib/step-13-verify.js reports "output exceeded the capture buffer of N bytes — the run ' +
    'could not be read", an unreadable-result verdict rather than "the command failed".',
  'silent-catch':
    'An empty catch makes the fall-through the permissive outcome: the check proceeds as though ' +
    'it had read something, having read nothing. Handle the error, or record it, or rethrow — and ' +
    'if the swallow is deliberate, make the code state which failure it is absorbing and why that ' +
    'failure is not a verdict.',
};

// ── Pattern set. Every RegExp is a LITERAL: src/ enforces ──────────────────────
// ── security/detect-non-literal-regexp at error under --max-warnings 0. ───────

/** Parser-named functions — the only scope S1 examines (the plan's narrowing). */
const PARSER_NAME = /^(?:parse|extract|count|read)[A-Z_]/;
/** A return of a verdict-bearing literal: the no-match default that lies. */
const VERDICT_RETURN = /\breturn\s+(?:0|true|false|''|""|``|\[\]|'pass'|'ok'|"pass"|"ok")\s*;?\s*$/;
// Binding the result of a head-slice to an identifier, in TWO linear steps rather than
// one pattern. A single `…\s*=[^=].*?\.(?:slice|substring)\s*\(\s*0\s*,` puts a lazy
// `.*?` between several whitespace runs, which backtracks; the declaration is matched
// on the trimmed line and the call is matched on a whitespace-STRIPPED copy, so both
// patterns are linear and no whitespace variant can slip past.
/** `const NAME =` on a trimmed line. */
const BINDING_DECL = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
/** A head-slice call, matched on a copy with all whitespace removed. */
const HEAD_SLICE_CALL = /\.(?:slice|substring)\(0,/;
/** A parse-shaped call, used to see whether a truncated binding flows into parsing. */
const PARSE_CALL = /\b(?:parse|extract)\w*\(\s*([A-Za-z_$][\w$]*)/g;
/** A capturing subprocess call. */
const CAPTURE_CALL = /\b(?:execSync|spawnSync)\s*\(/;
/** stdio: 'ignore' captures nothing and is never flagged. */
const STDIO_IGNORE = /stdio\s*:\s*['"`]ignore['"`]/;
/** An options object that captures output. */
const CAPTURES_OUTPUT = /\b(?:encoding|stdio)\s*:/;
/** An explicit capture bound — the fix. */
const HAS_MAX_BUFFER = /\bmaxBuffer\s*:/;
/** A catch clause opening a block. */
// Just the keyword. Locating the catch BODY is done by `catchBodyBrace`, which walks
// characters, because any pattern spanning the optional `(err)` clause needs a
// quantifier nested inside an optional group — star height 2, the catastrophic
// backtracking shape that `security/detect-unsafe-regex` rejects at error under
// --max-warnings 0. Walking is also correct across a multi-line parameter list, which
// a line-scoped pattern is not.
const CATCH_KEYWORD = /\bcatch\b/g;
/** A single whitespace character. */
const WHITESPACE = /\s/;
/** Writes that would be discarded by an immediate exit. */
const WRITE_CALL = /process\.(?:stdout|stderr)\.write|console\.(?:log|error)/;
/** The exit that discards them. */
const EXIT_CALL = /process\.exit\s*\(/;
/** Regex operations — what makes a function a parser in fact, not just in name. */
const REGEX_OPS = ['.match(', '.matchAll(', '.exec(', '.test('];
/** Methods that read a value as parseable input. */
const PARSE_METHODS = ['.match(', '.matchAll(', '.exec('];

/**
 * Function-declaration shapes used to anchor a finding to its enclosing function.
 *
 * Modifiers (`export`, `async`, `static`, `default`) are stripped ITERATIVELY by
 * `anchorName` rather than written as a chain of optional groups: a run of
 * `(?:export\s+)?(?:async\s+)?` places several ambiguous whitespace runs side by side,
 * which is exactly the nested-quantifier shape that backtracks catastrophically and
 * that `security/detect-unsafe-regex` rejects at error. Each pattern below therefore
 * matches an ALREADY-TRIMMED, already-demodified line and carries no adjacent
 * optional whitespace.
 */
const LEADING_MODIFIER = /^(?:export|default|async|static)\b\s*/;
const ANCHOR_FUNCTION = /^function[\s*]+([A-Za-z_$][\w$]*)/;
const ANCHOR_BINDING = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
const ANCHOR_METHOD = /^\*?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/;
/** Control-flow keywords that ANCHOR_METHOD would otherwise capture as scope names. */
const NOT_A_NAME = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'do', 'try',
  'function', 'typeof', 'new', 'delete', 'void', 'await', 'yield', 'with', 'case',
]);

/**
 * Split source into two line-aligned views in a single pass.
 *
 * `code`      — comments removed AND string contents blanked. Structurally faithful,
 *               so brace and paren counting cannot be thrown off by a `}` inside a
 *               string or a comment.
 * `noComment` — comments removed, string contents INTACT. Needed to read option
 *               values such as `stdio: 'ignore'`, which the `code` view blanks away.
 *
 * Both arrays have exactly one entry per input line, so an index means the same line
 * in either view.
 *
 * @param {string} source
 * @returns {{code: string[], noComment: string[], raw: string[]}}
 */
function views(source) {
  const raw = source.split('\n');
  const code = [];
  const noComment = [];
  let inBlockComment = false;
  let inTemplate = false;

  for (const line of raw) {
    let codeLine = '';
    let plainLine = '';
    let i = 0;

    while (i < line.length) {
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) { i = line.length; break; }
        inBlockComment = false;
        i = end + 2;
        continue;
      }
      if (inTemplate) {
        const end = findStringEnd(line, i, '`');
        plainLine += line.slice(i, end === -1 ? line.length : end + 1);
        if (end === -1) { i = line.length; break; }
        inTemplate = false;
        codeLine += '``';
        i = end + 1;
        continue;
      }

      const two = line.slice(i, i + 2);
      if (two === '//') break;
      if (two === '/*') { inBlockComment = true; i += 2; continue; }

      const ch = line[i];
      if (ch === '`') {
        const end = findStringEnd(line, i + 1, '`');
        if (end === -1) {
          inTemplate = true;
          plainLine += line.slice(i);
          codeLine += '``';
          i = line.length;
          break;
        }
        plainLine += line.slice(i, end + 1);
        codeLine += '``';
        i = end + 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const end = findStringEnd(line, i + 1, ch);
        const stop = end === -1 ? line.length - 1 : end;
        plainLine += line.slice(i, stop + 1);
        codeLine += ch + ch;
        i = stop + 1;
        continue;
      }
      if (ch === '/' && startsRegexLiteral(codeLine)) {
        const end = findRegexEnd(line, i + 1);
        const stop = end === -1 ? line.length - 1 : end;
        plainLine += line.slice(i, stop + 1);
        // A regex literal can contain braces and parens; the code view keeps a
        // structurally inert placeholder so they cannot skew the depth counters.
        codeLine += '//';
        i = stop + 1;
        continue;
      }

      codeLine += ch;
      plainLine += ch;
      i += 1;
    }

    code.push(codeLine);
    noComment.push(plainLine);
  }

  return { code, noComment, raw };
}

/**
 * Index of the closing quote for a string that opened just before `from`.
 * @param {string} line
 * @param {number} from
 * @param {string} quote
 * @returns {number} index of the closing quote, or -1 when the line ends first.
 */
function findStringEnd(line, from, quote) {
  for (let i = from; i < line.length; i += 1) {
    if (line[i] === '\\') { i += 1; continue; }
    if (line[i] === quote) return i;
  }
  return -1;
}

/**
 * Index of the closing slash of a regex literal that opened just before `from`.
 * @param {string} line
 * @param {number} from
 * @returns {number} index of the closing slash, or -1.
 */
function findRegexEnd(line, from) {
  let inClass = false;
  for (let i = from; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\') { i += 1; continue; }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return i;
  }
  return -1;
}

/**
 * Decide whether a `/` opens a regex literal rather than being division. The
 * standard heuristic: a regex may only follow an operator, an opening bracket, or
 * the start of a statement.
 * @param {string} emittedSoFar - the code view of this line up to the slash.
 * @returns {boolean}
 */
function startsRegexLiteral(emittedSoFar) {
  const trimmed = emittedSoFar.replace(/\s+$/, '');
  if (trimmed === '') return true;
  return /[(,=:[!&|?{};+\-*%<>~^]$/.test(trimmed) || /\b(?:return|typeof|case|in|of|new|do|else)$/.test(trimmed);
}

/**
 * Segment a file into function scopes and record, for every line, the name of its
 * innermost enclosing function.
 *
 * The scope name is what a finding's key ANCHORS on. It is deliberately NOT the line
 * number: a line-numbered key churns into a false failure on any unrelated edit above
 * a baselined site, and a fence that fails on unrelated edits gets disabled inside a
 * week.
 *
 * @param {{code: string[], noComment: string[]}} v
 * @returns {{anchors: string[], scopes: Array<{name: string, start: number, end: number}>}}
 *   `anchors[i]` is the enclosing name for line index i ('<module>' at top level);
 *   `scopes` carries 0-based inclusive line ranges.
 */
function segment(v) {
  const anchors = new Array(v.code.length).fill('<module>');
  const scopes = [];
  const stack = [];
  let depth = 0;

  for (let i = 0; i < v.code.length; i += 1) {
    const codeLine = v.code[i];
    const opens = countChar(codeLine, '{');
    const closes = countChar(codeLine, '}');
    const depthBefore = depth;
    depth = depthBefore + opens - closes;

    const name = anchorName(v.noComment[i]);
    if (name && opens > closes) {
      stack.push({ name, start: i, entryDepth: depthBefore });
    }

    anchors[i] = stack.length ? stack[stack.length - 1].name : '<module>';

    while (stack.length && depth <= stack[stack.length - 1].entryDepth) {
      const scope = stack.pop();
      scopes.push({ name: scope.name, start: scope.start, end: i });
    }
  }

  // An unbalanced file (rare, but never silently mis-read): close what is still open
  // at the last line rather than dropping those scopes.
  while (stack.length) {
    const scope = stack.pop();
    scopes.push({ name: scope.name, start: scope.start, end: v.code.length - 1 });
  }

  return { anchors, scopes };
}

/**
 * The declared name on a line that opens a function-like scope, or null.
 * @param {string} line
 * @returns {string|null}
 */
function anchorName(line) {
  let text = line.trim();
  // Strip modifiers one at a time. Iteration, not a chain of optional groups — see
  // the note on LEADING_MODIFIER: the chain is the backtracking shape.
  for (;;) {
    const modifier = LEADING_MODIFIER.exec(text);
    if (!modifier) break;
    text = text.slice(modifier[0].length);
  }

  const fn = ANCHOR_FUNCTION.exec(text);
  if (fn) return fn[1];
  const binding = ANCHOR_BINDING.exec(text);
  if (binding) return binding[1];
  const method = ANCHOR_METHOD.exec(text);
  if (method && !NOT_A_NAME.has(method[1])) return method[1];
  return null;
}

/**
 * @param {string} text
 * @param {string} ch
 * @returns {number} occurrences of a single character.
 */
function countChar(text, ch) {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (text[i] === ch) n += 1;
  return n;
}

/**
 * Whether `ident` appears in `text` as a whole identifier immediately followed by
 * `suffix`. Done with string search rather than a built RegExp, because src/ forbids
 * a non-literal RegExp constructor.
 * @param {string} text
 * @param {string} ident
 * @param {string} suffix
 * @returns {boolean}
 */
function hasIdentFollowedBy(text, ident, suffix) {
  const needle = ident + suffix;
  let idx = text.indexOf(needle);
  while (idx !== -1) {
    const before = idx === 0 ? '' : text[idx - 1];
    if (!/[\w$.]/.test(before)) return true;
    idx = text.indexOf(needle, idx + 1);
  }
  return false;
}

/**
 * The 0-based line on which a bracket span opened at `line`/`col` closes.
 * @param {string[]} codeLines - the structurally faithful view.
 * @param {number} line - 0-based start line.
 * @param {number} col - index of the opening bracket on that line.
 * @param {string} open
 * @param {string} close
 * @returns {number} 0-based closing line (the last line when it never closes).
 */
function spanEnd(codeLines, line, col, open, close) {
  let depth = 0;
  for (let i = line; i < codeLines.length; i += 1) {
    const text = codeLines[i];
    for (let j = i === line ? col : 0; j < text.length; j += 1) {
      if (text[j] === open) depth += 1;
      else if (text[j] === close) {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
  }
  return codeLines.length - 1;
}

/**
 * Detect every signature in one file.
 * @param {string} file - repo-relative POSIX path.
 * @param {string} source
 * @returns {Array<{file: string, line: number, signature: string, anchor: string, evidence: string}>}
 */
function scanFile(file, source) {
  const v = views(source);
  const { anchors, scopes } = segment(v);
  const raw = v.raw;
  const out = [];

  const add = (lineIdx, signature) => {
    out.push({
      file,
      line: lineIdx + 1,
      signature,
      anchor: anchors[lineIdx] || '<module>',
      evidence: (raw[lineIdx] || '').trim().slice(0, 160),
    });
  };

  // ── S1 · parse-default ──────────────────────────────────────────────────────
  // Scoped to PARSER-NAMED functions that actually perform a regex operation. The
  // narrowing is the whole signal: "any function returning 0" would match thousands
  // of legitimate sites and train people to whitelist.
  for (const scope of scopes) {
    if (!PARSER_NAME.test(scope.name)) continue;
    const body = v.noComment.slice(scope.start, scope.end + 1).join('\n');
    if (!REGEX_OPS.some((op) => body.includes(op))) continue;
    for (let i = scope.start; i <= scope.end; i += 1) {
      if (VERDICT_RETURN.test(v.noComment[i])) add(i, 'parse-default');
    }
  }

  // ── S2 · truncate-then-parse ────────────────────────────────────────────────
  // Intra-function by construction: the truncated binding must flow into a parse
  // WITHIN THE SAME body. Plain `.slice(0, N)` anywhere is legitimate (display
  // truncation, log excerpting, boundOutput itself) and is deliberately not flagged.
  for (const scope of scopes) {
    for (let i = scope.start; i <= scope.end; i += 1) {
      const trimmed = v.noComment[i].trim();
      const decl = BINDING_DECL.exec(trimmed);
      if (!decl) continue;
      if (!HEAD_SLICE_CALL.test(trimmed.replace(/\s+/g, ''))) continue;
      const ident = decl[1];
      const rest = v.noComment.slice(i + 1, scope.end + 1).join('\n');
      const parsedLater =
        PARSE_METHODS.some((m) => hasIdentFollowedBy(rest, ident, m)) ||
        [...rest.matchAll(PARSE_CALL)].some((m) => m[1] === ident);
      if (parsedLater) add(i, 'truncate-then-parse');
    }
  }

  // ── S3 · exit-with-pending-writes ───────────────────────────────────────────
  // The co-occurrence carries the signal: process.exit in a pure argument-validation
  // path that has printed nothing is correct and is not flagged.
  for (let i = 0; i < v.noComment.length; i += 1) {
    if (!EXIT_CALL.test(v.noComment[i])) continue;
    const scope = innermostScope(scopes, i);
    const from = scope ? scope.start : 0;
    const to = scope ? scope.end : v.noComment.length - 1;
    const body = v.noComment.slice(from, to + 1).join('\n');
    if (WRITE_CALL.test(body)) add(i, 'exit-with-pending-writes');
  }

  // ── S4 · unbounded-capture ──────────────────────────────────────────────────
  for (let i = 0; i < v.code.length; i += 1) {
    if (!CAPTURE_CALL.test(v.noComment[i])) continue;
    const parenCol = v.code[i].indexOf('(', callNameEnd(v.code[i]));
    if (parenCol === -1) continue;
    const endLine = spanEnd(v.code, i, parenCol, '(', ')');
    const callText = v.noComment.slice(i, endLine + 1).join('\n');
    if (HAS_MAX_BUFFER.test(callText)) continue;
    if (STDIO_IGNORE.test(callText)) continue;
    if (CAPTURES_OUTPUT.test(callText)) add(i, 'unbounded-capture');
  }

  // ── S5 · silent-catch ───────────────────────────────────────────────────────
  // The lowest-precision signature in the set, and the plan says so plainly. Comment
  // presence cannot discriminate — test-gate.js's commented empty catch is CORRECT
  // and task-reconcile.js's commented empty catch is a real defect. So every existing
  // site is baselined as debt and only a NEW one fails the fence.
  for (let i = 0; i < v.code.length; i += 1) {
    CATCH_KEYWORD.lastIndex = 0;
    for (const match of v.code[i].matchAll(CATCH_KEYWORD)) {
      const brace = catchBodyBrace(v.code, i, match.index + match[0].length);
      if (!brace) continue;
      const endLine = spanEnd(v.code, brace.line, brace.col, '{', '}');
      const inner = endLine === brace.line
        ? v.code[brace.line].slice(brace.col + 1, v.code[brace.line].lastIndexOf('}'))
        : [v.code[brace.line].slice(brace.col + 1), ...v.code.slice(brace.line + 1, endLine),
          v.code[endLine].slice(0, v.code[endLine].lastIndexOf('}'))].join('\n');
      if (inner.trim() === '') add(i, 'silent-catch');
    }
  }

  return out;
}

/**
 * Locate the `{` that opens a catch BODY, walking past an optional `(err)` clause
 * that may span lines. Character-walking rather than pattern-matching: see the note on
 * CATCH_KEYWORD.
 *
 * @param {string[]} codeLines - the structurally faithful view.
 * @param {number} line - 0-based line holding the `catch` keyword.
 * @param {number} from - index just past the keyword on that line.
 * @returns {{line: number, col: number}|null} null when what follows is not a catch
 *   block (e.g. the word appears as a property or in `.catch(`).
 */
function catchBodyBrace(codeLines, line, from) {
  let parenDepth = 0;
  let sawParams = false;
  for (let i = line, j = from; i < codeLines.length; i += 1, j = 0) {
    const text = codeLines[i];
    for (; j < text.length; j += 1) {
      const ch = text[j];
      if (parenDepth > 0) {
        if (ch === '(') parenDepth += 1;
        else if (ch === ')') parenDepth -= 1;
        continue;
      }
      if (ch === '(') {
        if (sawParams) return null; // `.catch(fn)` — a call, not a catch clause
        parenDepth = 1;
        sawParams = true;
        continue;
      }
      if (ch === '{') return { line: i, col: j };
      if (!WHITESPACE.test(ch)) return null; // not a catch block at all
    }
  }
  return null;
}

/**
 * The innermost scope containing a line, or null at module level.
 * @param {Array<{name: string, start: number, end: number}>} scopes
 * @param {number} lineIdx
 * @returns {{name: string, start: number, end: number}|null}
 */
function innermostScope(scopes, lineIdx) {
  let best = null;
  for (const scope of scopes) {
    if (lineIdx < scope.start || lineIdx > scope.end) continue;
    if (!best || (scope.end - scope.start) < (best.end - best.start)) best = scope;
  }
  return best;
}

/**
 * Index of the character after the call name, so the option paren is found on the
 * call itself rather than on an earlier paren on the same line.
 * @param {string} line
 * @returns {number}
 */
function callNameEnd(line) {
  const idx = Math.max(line.indexOf('execSync'), line.indexOf('spawnSync'));
  return idx === -1 ? 0 : idx;
}

/**
 * Collect every `.js` file under a directory, without following symlinks.
 * @param {string} dir
 * @param {string[]} [acc]
 * @returns {string[]} absolute paths
 */
function collectJsFiles(dir, acc = []) {
  if (!safeFs.existsSync(dir)) return acc;
  for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

/**
 * @typedef {Object} FalseGreenFinding
 * @property {string} file      Repo-relative path, POSIX separators on every platform.
 * @property {number} line      1-based line of the offending construct (for the human).
 * @property {'parse-default'|'truncate-then-parse'|'exit-with-pending-writes'|'unbounded-capture'|'silent-catch'} signature
 * @property {string} key       Stable identity: `${file}:${signature}:${anchor}` (never a line number).
 * @property {string} evidence  Matched source excerpt, trimmed to 160 chars.
 * @property {string} fix       The prescribed safe shape, naming the shipped exemplar.
 */

/**
 * Scan for false-green signatures — checks that report a verdict on input they never
 * actually received.
 *
 * @param {string} root - Project root. The walk is confined to `path.join(root, 'src')`.
 * @param {{sources?: Array<{path: string, source: string}>}} [opts] - When `sources` is
 *   supplied the scan runs against those in-memory files instead of walking the tree.
 *   This is how the fence's self-test plants a known violation without writing a file,
 *   and it is why this module needs only ONE export — a second export used solely by
 *   the test would itself be flagged by the dead-export fence.
 * @returns {{findings: FalseGreenFinding[], filesScanned: number, bySignature: Record<string, number>}}
 * @throws {TypeError} When `root` is not a non-empty string and no `sources` are given.
 *   It never returns an empty result for a bad input: an empty finding list IS the
 *   success value here, so returning one for input that was never read would be
 *   precisely the defect this module exists to catch.
 * @throws {Error} When a file cannot be read — it is never skipped, for the same reason.
 */
function scanFalseGreen(root, opts = {}) {
  const planted = opts && Array.isArray(opts.sources) ? opts.sources : null;

  /** @type {Array<{path: string, source: string}>} */
  let files = [];
  if (planted) {
    for (const entry of planted) {
      if (!entry || typeof entry.path !== 'string' || typeof entry.source !== 'string') {
        throw new TypeError(
          'scanFalseGreen: every entry of `sources` must be {path: string, source: string}. ' +
          'Refusing to scan a malformed source rather than silently reporting no findings for it.'
        );
      }
      files.push({ path: entry.path.split(path.sep).join('/'), source: entry.source });
    }
  } else {
    if (typeof root !== 'string' || root.trim() === '') {
      throw new TypeError(
        `scanFalseGreen: root must be a non-empty string, received ${typeof root} (${String(root)}). ` +
        'Returning an empty finding list here would report "all clear" for input that was never ' +
        'read — the exact defect class this scanner exists to catch.'
      );
    }
    const srcDir = path.join(root, 'src');
    files = collectJsFiles(srcDir).map((abs) => ({
      path: path.relative(root, abs).split(path.sep).join('/'),
      // Not wrapped in try/catch: an unreadable file must throw with its path, never
      // be skipped. A skipped file would make this scanner report a verdict on input
      // it never received.
      source: safeFs.readFileSync(abs, 'utf8'),
    }));
  }

  const raw = [];
  for (const file of files) raw.push(...scanFile(file.path, file.source));

  raw.sort((a, b) => (a.file === b.file
    ? (a.line === b.line ? a.signature.localeCompare(b.signature) : a.line - b.line)
    : a.file.localeCompare(b.file)));

  // Ordinals disambiguate two findings of one signature in one function, WITHOUT
  // reintroducing a line number into the key.
  const seen = new Map();
  /** @type {FalseGreenFinding[]} */
  const findings = raw.map((f) => {
    const base = `${f.file}:${f.signature}:${f.anchor}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return /** @type {FalseGreenFinding} */ ({
      file: f.file,
      line: f.line,
      signature: f.signature,
      key: n === 1 ? base : `${base}#${n}`,
      evidence: f.evidence,
      fix: FIXES[f.signature],
    });
  });

  /** @type {Record<string, number>} */
  const bySignature = {};
  for (const sig of SIGNATURES) bySignature[sig] = 0;
  for (const f of findings) bySignature[f.signature] += 1;

  return { findings, filesScanned: files.length, bySignature };
}

module.exports = { scanFalseGreen };

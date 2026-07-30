/**
 * THE UNEXECUTABLE-ORDER FENCE — scanner (plan 00110).
 *
 * An agent definition is a set of ORDERS, and the `tools:` line in its frontmatter is
 * the complete list of things the agent can actually do. When the body orders the agent
 * to CALL a JavaScript function — `call `shouldRunGdpr(projectRoot)`` — and the grant
 * holds no way to execute JavaScript (in practice, no `Bash`), the order is not hard or
 * slow, it is IMPOSSIBLE: the agent skips the part it cannot do and returns a result
 * that reads like success. This scanner finds those orders in `agents/**\/*.md`.
 *
 * TELLING AN ORDER FROM A MENTION is the whole design problem: agent bodies are dense
 * with function names in backticks while they explain how the system fits together. The
 * line this repository already draws is stated verbatim in reachability.js and its
 * baselines: **a citation is not an invocation.** This scanner follows the same
 * strip-first (fenced code is not source), parenthesis-required (`fn` is a citation,
 * `fn(` an invocation), UNDER-REPORTING discipline — it never cries wolf, matching the
 * bias src/lib/reachability.js argues (its `edgesFrom` at :271-273 and `exportedNames`
 * at :731-732 both strip first and credit only a real call).
 *
 * THREE SIGNATURES fire, each needing the ability to run JavaScript, unless a
 * discriminator excuses them:
 *   s1 — imperative call: an imperative `call`/`invoke` or a `drive … via` verb
 *        immediately before a call token.
 *   s2 — second-person sentence: a clause whose subject is `You`/`you` containing a call
 *        token, with ANY verb (catches the incoherent `createFetcher(WebSearch, WebFetch)`
 *        order that s1 misses — no call verb there).
 *   s3 — capability manifest: a list item under a `Tools Used`/`Tools`/`Capabilities`
 *        heading whose LEADING backticked token is a call token. A manifest entry has no
 *        verb and no subject, so s1 and s2 both miss it; a claim of a capability the
 *        agent lacks is the same lie as an order it cannot obey.
 *
 * FIVE DISCRIMINATORS keep it honest:
 *   d1 — a call token requires a PARENTHESIS; a bare name / a `file#name` anchor is a
 *        citation and is never a token.
 *   d2 — fenced code is never an order (stripped, with line numbers preserved).
 *   d3 — only the FIRST frontmatter block gives the grant (an embedded `tools:` example
 *        is not the grant).
 *   d4 — a third-person subject makes it a description (`will`/`would`/`shall` or a
 *        third-person inflection `calls`/`runs`/`invokes`/`executes`/`drives` in a
 *        bounded <=60-char look-back).
 *   d5 — satisfied-by-tool: if the callee's bare name is itself a granted tool
 *        (`Read(…)` under a `Read` grant), the order is executable.
 *
 * Signatures deliberately NOT built, because a fence that cries wolf is worse than none
 * — do not "helpfully" add them: a bare "write X" (English "write" is almost always the
 * agent's output prose), "search for X" (satisfied by Grep/Glob), "read X" (every agent
 * holds Read, so the check can never fire), any backticked shell-looking token.
 *
 * HONEST LIMIT: matching is per LINE, and a call token is START-ANCHORED to its backtick
 * span (`\`fn(…)\``). An order wrapped across a line break, or a call buried mid-span
 * inside `node -e "require('…').fn(…)"`, is UNDER-reported — the same bias as
 * reachability.js. That is the right direction for a gate that fails a build.
 *
 * Cross-platform: paths via path.join; keys/`file` normalized with path.posix so a
 * Windows scan and a macOS scan produce byte-identical keys. All fs via safe-fs. No
 * exec/execSync/shell anywhere.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');

/**
 * @typedef {Object} Finding
 * @property {'instruction-tool'} detection  the detection kind (a union so plan 00073 can
 *   append its two remaining detections to this same module without a rewrite)
 * @property {string} key       stable baseline key — `<file>::instruction-tool::<callee>`,
 *   NEVER containing a line number (a line number churns the baseline on every edit)
 * @property {string} file      repo-relative, path.posix-normalized
 * @property {number} line      1-based, for the human-readable message ONLY
 * @property {'s1'|'s2'|'s3'} signature  which signature fired
 * @property {string} callee    the function name that cannot be invoked
 * @property {string[]} grant   the agent's declared tools
 * @property {string} message   one sentence naming what cannot execute and why
 * @property {string} fix       the prescribed fix, naming the file and the safe shapes
 */

const MAX_LINE = 2000;               // ReDoS guard: cap each line before matching
const LOOKBACK = 60;                 // bounded d4 look-back window

// A call token: a backtick span whose inner text STARTS with an identifier immediately
// followed by `(`. `fn` (no paren) and `file.js#name` (no paren) are citations and never
// match. A single linear quantifier — no ambiguous star height — and every match runs on
// a line capped at MAX_LINE. A DOTTED head (`mod.name(`) does not match and is therefore
// UNDER-reported, the same fail-safe direction as reachability.js: better a missed order
// than a fence that cries wolf.
const CALL_INNER = /^\s*([A-Za-z_$][\w$]*)\s*\(/;
const BACKTICK_SPAN = /`([^`]+)`/g;

// s1: an imperative call verb, or a `drive … via` phrase, immediately before the token.
// Every regex here is linear (no nested/ambiguous quantifier) and runs on a line already
// capped at MAX_LINE, so there is no catastrophic-backtracking surface.
const S1_CALL_VERB = /\b(?:call|invoke)\s*$/i;
const S1_ENDS_VIA = /\bvia\s*$/i;   // `drive … via` = ENDS_VIA look-back that also contains "drive"
const S1_HAS_DRIVE = /\bdrives?\b/i;
// s2 subject cue — a simple, safe word test applied to the CLAUSE (see s2SubjectInClause).
const YOU = /\byou\b/i;
const SENTENCE_BREAK = /[.!?:]/g;
// d4: a third-person subject/verb makes the sentence a description, not an order.
const D4_DESCRIPTION = /\b(?:will|would|shall|calls|runs|invokes|executes|drives)\b/i;

const MANIFEST_HEADING = /\b(?:tools used|tools|capabilities)\b/i;

/**
 * Replace fenced blocks (``` or ~~~) with BLANK lines of equal count, so a call token in
 * an example never reads as an order while every reported line number stays correct.
 * @param {string} md
 * @returns {string}
 */
function stripFences(md) {
  let inFence = false;
  return md.split('\n').map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; return ''; }
    return inFence ? '' : line;
  }).join('\n');
}

/**
 * The tools grant from the FIRST `---` frontmatter block only (d3). `[]` when absent.
 * @param {string} md
 * @returns {string[]}
 */
function frontmatterTools(md) {
  const block = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return [];
  const line = block[1].match(/^tools:\s*(.+)$/m);
  if (!line) return [];
  return line[1].split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Every call token on a line: a backtick span starting with `ident(` (d1). Returns the
 * callee (last dotted segment) and the span's column, for the look-back and message.
 * @param {string} line
 * @returns {Array<{callee: string, col: number}>}
 */
function callTokens(line) {
  const out = [];
  BACKTICK_SPAN.lastIndex = 0;
  let m;
  while ((m = BACKTICK_SPAN.exec(line)) !== null) {
    const inner = CALL_INNER.exec(m[1]);
    if (inner) out.push({ callee: inner[1], col: m.index });
  }
  return out;
}

/** d4 — is the bounded look-back a third-person description? */
function isDescription(line, col) {
  return D4_DESCRIPTION.test(line.slice(Math.max(0, col - LOOKBACK), col));
}

/** Nearest preceding markdown heading text, for signature s3. */
function sectionHeading(lines, i) {
  for (let j = i; j >= 0; j--) {
    const h = lines[j].match(/^#{1,6}\s+(.*)$/);
    if (h) return h[1];
  }
  return '';
}

/**
 * s2 subject test — is the token's clause governed by a second-person `you`? The clause
 * is the text after the LAST sentence terminator before the token, so
 * "The object you emit is NOT the validator's input. `validatePlanQuestions` takes …"
 * (a description across a sentence break) does NOT fire, while
 * "You construct … via `createFetcher(…)`" does. Computed with string ops + a simple safe
 * word test, never a backtracking regex.
 * @param {string} prefix - the line text before the token
 * @returns {boolean}
 */
function s2SubjectInClause(prefix) {
  let lastBreak = -1;
  SENTENCE_BREAK.lastIndex = 0;
  let m;
  while ((m = SENTENCE_BREAK.exec(prefix)) !== null) lastBreak = m.index;
  return YOU.test(prefix.slice(lastBreak + 1));
}

/**
 * Classify a call token into a signature, or null if no signature fires.
 * @returns {'s1'|'s2'|'s3'|null}
 */
function classify(line, col, lines, i) {
  const before = line.slice(Math.max(0, col - LOOKBACK), col);
  if (S1_CALL_VERB.test(before) || (S1_ENDS_VIA.test(before) && S1_HAS_DRIVE.test(before))) return 's1';
  if (s2SubjectInClause(line.slice(0, col))) return 's2';
  const head = sectionHeading(lines, i);
  if (MANIFEST_HEADING.test(head) && /^\s*[-*]\s*`/.test(line) && col === line.indexOf('`')) return 's3';
  return null;
}

function messageFor(file, callee, grant) {
  return `${file} orders this agent to call \`${callee}(…)\`, but its tools: grant is ` +
    `[${grant.join(', ')}] — it has no way to execute JavaScript, so the order silently does nothing.`;
}

function fixFor() {
  return 'Choose one: (a) grant a tool that can execute it and state what that widens; ' +
    '(b) rewrite the order as something the granted tools can do; (c) name the actor that ' +
    'really performs it — the session model, a hook, or a Bash-capable agent — in the third person.';
}

/** Recursively collect `*.md` files under a directory (via safe-fs). */
function collectMarkdown(dir) {
  const out = [];
  let entries;
  try {
    entries = safeFs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // an unreadable subdir contributes nothing; the top-level absence is handled by the caller
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectMarkdown(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * Scan an agent corpus for orders that can never execute.
 *
 * @param {string} root - absolute project root
 * @returns {{findings: Finding[], scanned: {agents: number, withGrant: number}}}
 *   `scanned` exists for the non-vacuity assertion: a scan that read ZERO agents must
 *   FAIL the fence (the caller asserts `agents >= 100`), never pass silently. A fence
 *   that reports a verdict on input it never received is the false-green class this
 *   repository fences by name.
 * @throws {TypeError} root is not a non-empty string
 */
function scan(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('unexecutable-instruction-scan: root must be a non-empty string');
  }
  const agentsDir = path.join(root, 'agents');
  if (!safeFs.existsSync(agentsDir)) {
    return { findings: [], scanned: { agents: 0, withGrant: 0 } };
  }

  const files = collectMarkdown(agentsDir);
  /** @type {Finding[]} */
  const findings = [];
  let withGrant = 0;

  for (const abs of files) {
    let raw;
    try {
      raw = safeFs.readFileSync(abs, 'utf8');
    } catch {
      continue; // a file that vanished mid-scan is skipped, never a crash
    }
    const grant = frontmatterTools(raw);
    if (grant.length > 0) withGrant++;
    // An agent that CAN execute JavaScript (holds Bash) can obey any of these orders.
    if (grant.includes('Bash')) continue;

    const file = path.posix.join('agents', ...path.relative(agentsDir, abs).split(path.sep));
    const lines = stripFences(raw).split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].slice(0, MAX_LINE);
      if (line.indexOf('`') === -1) continue;
      for (const t of callTokens(line)) {
        if (grant.includes(t.callee)) continue;      // d5 — satisfied by a granted tool
        if (isDescription(line, t.col)) continue;    // d4 — third-person description
        const signature = classify(line, t.col, lines, i);
        if (!signature) continue;
        findings.push({
          detection: 'instruction-tool',
          key: `${file}::instruction-tool::${t.callee}`,
          file,
          line: i + 1,
          signature,
          callee: t.callee,
          grant,
          message: messageFor(file, t.callee, grant),
          fix: fixFor(),
        });
      }
    }
  }

  return { findings, scanned: { agents: files.length, withGrant } };
}

module.exports = { scan };

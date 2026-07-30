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

/*
 * PLAN 00073 — the two remaining detections, added to THIS scanner (not a new module):
 *   (a) recipe-kind    — a `src/commands/*.md` recipe naming a task kind that KINDS
 *                        rejects (forward, HARD), or a KINDS kind no recipe documents
 *                        (recipe-kind-reverse, debt-seeded: many kinds are enqueued
 *                        programmatically and legitimately have no human-typed recipe).
 *   (c) config-key     — a settings key that `generateSettings()` WRITES into a new
 *                        project's settings.yaml but nothing in `src/**` READS.
 *
 * THE MOVED DETECTION (b) — an order to an agent to run code its `tools:` grant cannot
 * execute — is owned ENTIRELY by the five-agents plan (00110) above; this plan must not
 * add it back. One fence per invariant, or the two drift and the human trusts neither.
 *
 * (c) is deliberately surface-scoped and UNDER-reporting, exactly like reachability.js:
 *   • a key is keyed `<surface>::config-key::<dotted.path>` (settings.yaml vs settings.json
 *     are two surfaces with two readers — CONFIG_SOURCES.md — so `enforcement.mode` (yaml)
 *     is never certified "read" by `workflow.enforcementMode` (json));
 *   • a key counts as READ when its leaf name or dotted path appears (comments stripped)
 *     in a `src/**` file that references the SAME surface file, outside the writer;
 *   • name occurrence, not data-flow (decision 3): the bias is to under-report — a fence
 *     that cries wolf gets whitelisted into uselessness.
 * (a)'s displaced shape (verb and kind NOT adjacent) is the whole design point: the real
 * bug read ``(`menu task add`, kind `precompute` …)`` — a naive `menu task add (\w+)`
 * regex would have missed it.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');
const { KINDS } = require('./task-registry');

/**
 * @typedef {Object} Finding
 * @property {'instruction-tool'|'recipe-kind'|'recipe-kind-reverse'|'config-key'} detection
 *   the detection kind (a union so plan 00073's detections live in this same module)
 * @property {string} key       stable baseline key, NEVER containing a line number (a line
 *   number churns the baseline on every edit): `<file>::instruction-tool::<callee>`,
 *   `<file>::recipe-kind::<kind>`, `<registry>::recipe-kind-reverse::<kind>`, or
 *   `<surface>::config-key::<dotted.path>`
 * @property {string} file      repo-relative, path.posix-normalized
 * @property {number} [line]    1-based, for the human-readable message ONLY
 * @property {'s1'|'s2'|'s3'} [signature]  which instruction-tool signature fired
 * @property {string} [callee]  the function name that cannot be invoked
 * @property {string[]} [grant] the agent's declared tools
 * @property {string} [surface] for config-key: 'settings.yaml' | 'settings.json'
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
 * Detection (b), owned here since plan 00110: agent orders that can never execute.
 * @param {string} root
 * @returns {{findings: Finding[], agents: number, withGrant: number}}
 */
function scanAgentOrders(root) {
  const agentsDir = path.join(root, 'agents');
  if (!safeFs.existsSync(agentsDir)) return { findings: [], agents: 0, withGrant: 0 };

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
  return { findings, agents: files.length, withGrant };
}

// ── (a) recipe verb vs accepted vocabulary ───────────────────────────────────

// inline shape: `menu task add <kind>` where <kind> is a lowercase identifier. A
// single-uppercase-letter metavariable (`K`, `P`) or a `[…]` / `${…}` placeholder is
// skipped — it is a stand-in for any kind, not a named one.
const RECIPE_INLINE = /menu task add\s+([A-Za-z][\w-]*)/g;
// displaced shape: a `menu task add` mention, then within 200 chars a `` kind `<token>` ``.
const RECIPE_VERB = /menu task add/g;
const KIND_PHRASE = /kind\s+`([a-z][\w-]*)`/;
const RECIPE_WINDOW = 200;

/** True for a placeholder metavariable that names no specific kind. */
function isKindPlaceholder(tok) {
  return /^[A-Z]$/.test(tok) || tok.startsWith('[') || tok.includes('$');
}

/**
 * Every task kind a command doc instructs, via BOTH the inline and the displaced shapes.
 * The displaced shape (verb and kind not adjacent) is the shape of the real bug and is
 * the reason a naive `menu task add (\w+)` regex is insufficient.
 * @param {string} md
 * @returns {Array<{kind: string, line: number}>}
 */
function recipeKinds(md) {
  const lines = stripFences(md).split('\n');
  /** @type {Map<string, number>} */
  const found = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].slice(0, MAX_LINE);
    if (line.indexOf('menu task add') === -1) continue;
    RECIPE_INLINE.lastIndex = 0;
    let m;
    while ((m = RECIPE_INLINE.exec(line)) !== null) {
      const tok = m[1];
      if (!isKindPlaceholder(tok) && /^[a-z]/.test(tok) && !found.has(tok)) found.set(tok, i + 1);
    }
    // displaced: look ahead up to RECIPE_WINDOW chars from each verb mention
    RECIPE_VERB.lastIndex = 0;
    while ((m = RECIPE_VERB.exec(line)) !== null) {
      const window = line.slice(m.index, m.index + RECIPE_WINDOW);
      const k = KIND_PHRASE.exec(window);
      if (k && !found.has(k[1])) found.set(k[1], i + 1);
    }
  }
  return [...found.entries()].map(([kind, line]) => ({ kind, line }));
}

/**
 * Detection (a): recipe kinds vs KINDS, both directions.
 * @param {string} root
 * @returns {{findings: Finding[], commandDocs: number}}
 */
function scanRecipes(root) {
  const commandsDir = path.join(root, 'src', 'commands');
  /** @type {Finding[]} */
  const findings = [];
  let entries;
  try {
    entries = safeFs.readdirSync(commandsDir, { withFileTypes: true });
  } catch {
    return { findings: [], commandDocs: 0 }; // no command docs — nothing to check
  }
  const docs = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));
  /** @type {Set<string>} */
  const documented = new Set();

  for (const e of docs) {
    let raw;
    try {
      raw = safeFs.readFileSync(path.join(commandsDir, e.name), 'utf8');
    } catch {
      continue;
    }
    const file = path.posix.join('src', 'commands', e.name);
    for (const { kind } of recipeKinds(raw)) {
      documented.add(kind);
      // forward (HARD): a documented kind KINDS rejects — every such call throws.
      if (!KINDS.has(kind)) {
        findings.push({
          detection: 'recipe-kind',
          key: `${file}::recipe-kind::${kind}`,
          file,
          message: `${file} instructs task kind \`${kind}\`, which KINDS in src/lib/task-registry.js rejects — every such call throws and the recipe silently never runs.`,
          fix: `Either add \`${kind}\` to KINDS in src/lib/task-registry.js (with a docblock note saying why) or correct the recipe to name an accepted kind.`,
        });
      }
    }
  }

  // reverse (debt-seeded): a KINDS kind no recipe documents. Weaker by nature — kinds
  // like `sync` are enqueued programmatically (actions.enqueueWaveSync) and legitimately
  // have no human-typed recipe. Keyed to the registry that owns the vocabulary.
  const registry = path.posix.join('src', 'lib', 'task-registry.js');
  for (const kind of KINDS) {
    if (documented.has(kind)) continue;
    findings.push({
      detection: 'recipe-kind-reverse',
      key: `${registry}::recipe-kind-reverse::${kind}`,
      file: registry,
      message: `KINDS in ${registry} accepts task kind \`${kind}\` but no src/commands recipe documents it.`,
      fix: `If \`${kind}\` is human-invokable, document a \`menu task add ${kind}\` recipe; if it is only enqueued programmatically, this is expected debt.`,
    });
  }

  return { findings, commandDocs: docs.length };
}

// ── (c) config key written vs read ───────────────────────────────────────────

const LINE_COMMENT = /\/\/[^\n]*/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

/** Strip JS comments so a name in a comment never counts as a read (a citation is not a read). */
function stripJsComments(src) {
  return src.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');
}

const IDENT_CHAR = /[\w$]/; // literal — the leaf word test below never builds a dynamic RegExp

/**
 * Whole-word occurrence of `word` in `text`, without a dynamic RegExp (the eslint
 * security rule forbids `new RegExp(<variable>)`, and a config leaf must match on
 * identifier boundaries so `enabled` never matches inside `syncEnabled`).
 * @param {string} text
 * @param {string} word
 * @returns {boolean}
 */
function containsWord(text, word) {
  let idx = text.indexOf(word);
  while (idx !== -1) {
    const before = idx === 0 ? '' : text[idx - 1];
    const after = text[idx + word.length] || '';
    if (!IDENT_CHAR.test(before) && !IDENT_CHAR.test(after)) return true;
    idx = text.indexOf(word, idx + 1);
  }
  return false;
}

/**
 * The YAML lines `generateSettings()` emits, extracted from the SOURCE of
 * src/lib/init-project.js (no execution). Returns the flat 2-level dotted keys it writes.
 * @param {string} root
 * @returns {string[]} dotted paths, e.g. ['enforcement.mode', 'quality.coverage_threshold']
 */
function writtenYamlKeys(root) {
  const ipFile = path.join(root, 'src', 'lib', 'init-project.js');
  let src;
  try {
    src = safeFs.readFileSync(ipFile, 'utf8');
  } catch {
    return [];
  }
  const fn = src.match(/function generateSettings\s*\([^)]*\)\s*\{[\s\S]*?return\s*\[([\s\S]*?)\]\.join\(/);
  if (!fn) return [];
  // Pull the inner text of each string literal ('…', "…", `…`) in emission order.
  const strRe = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  const emitted = [];
  let s;
  while ((s = strRe.exec(fn[1])) !== null) emitted.push(s[2]);

  /** @type {string[]} */
  const keys = [];
  let section = null;
  for (const raw of emitted) {
    const line = raw.replace(/\s*#.*$/, '');           // drop trailing YAML comment
    if (line.trim() === '') continue;
    if (/^\S/.test(line)) {                             // top-level `key:` or `key: val`
      const top = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
      if (!top) { section = null; continue; }
      if (top[2].trim() !== '') { keys.push(top[1]); section = null; } // top-level scalar
      else section = top[1];
    } else if (section) {                              // nested `  child:`
      const child = line.match(/^\s+([A-Za-z_][\w]*):/);
      if (child) keys.push(`${section}.${child[1]}`);
    }
  }
  return keys;
}

/**
 * Is a config key READ anywhere in `src/**`? Surface-scoped: only a file that references
 * the SAME surface file (settings.yaml vs settings.json) can satisfy the key, and the
 * writer is excluded. Under-reports by design — a leaf mentioned in any same-surface
 * reader counts (name occurrence, not data-flow).
 * @param {string} root
 * @param {'settings.yaml'|'settings.json'} surface
 * @param {string} dottedPath
 * @param {string} writerAbs - absolute path of the writer, excluded from the read scan
 * @returns {boolean}
 */
function keyIsRead(root, surface, dottedPath, writerAbs) {
  const leaf = dottedPath.split('.').pop();
  for (const abs of collectJs(path.join(root, 'src'))) {
    if (abs === writerAbs) continue;
    let src;
    try {
      src = safeFs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (src.indexOf(surface) === -1) continue;         // wrong surface — cannot satisfy
    const code = stripJsComments(src);
    if (code.indexOf(surface) === -1) continue;         // referenced only in a comment
    if (containsWord(code, leaf) || code.indexOf(dottedPath) !== -1) return true;
  }
  return false;
}

/** Recursively collect `*.js` files under a directory (via safe-fs). */
function collectJs(dir) {
  const out = [];
  let entries;
  try {
    entries = safeFs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * Detection (c): settings keys written into a new project but read by nothing.
 * @param {string} root
 * @returns {{findings: Finding[], settingsKeys: number}}
 */
function scanConfig(root) {
  /** @type {Finding[]} */
  const findings = [];
  const writerAbs = path.join(root, 'src', 'lib', 'init-project.js');
  const yamlKeys = writtenYamlKeys(root);
  for (const dotted of yamlKeys) {
    if (keyIsRead(root, 'settings.yaml', dotted, writerAbs)) continue;
    findings.push({
      detection: 'config-key',
      key: `settings.yaml::config-key::${dotted}`,
      file: path.posix.join('src', 'lib', 'init-project.js'),
      surface: 'settings.yaml',
      message: `src/lib/init-project.js writes settings.yaml key \`${dotted}\` but no code in src/ reads it — a visible setting wired to nothing is a placebo.`,
      fix: `Either wire a reader (and note it in docs/CONFIG_SOURCES.md) or stop writing the key.`,
    });
  }
  return { findings, settingsKeys: yamlKeys.length };
}

/**
 * Scan a CTOC tree for instructions with no receiver: agent orders that cannot execute
 * (b, plan 00110), recipe kinds the accepted vocabulary rejects (a), and settings keys
 * written but never read (c).
 *
 * @param {string} root - absolute project root
 * @returns {{findings: Finding[], scanned: {agents: number, withGrant: number, commandDocs: number, settingsKeys: number}}}
 *   `scanned` exists for the non-vacuity assertion: a scan that read ZERO of a class must
 *   let the caller FAIL the fence, never pass silently. A fence that reports a verdict on
 *   input it never received is the false-green class this repository fences by name.
 * @throws {TypeError} root is not a non-empty string
 */
function scan(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('unexecutable-instruction-scan: root must be a non-empty string');
  }
  const orders = scanAgentOrders(root);
  const recipes = scanRecipes(root);
  const config = scanConfig(root);
  return {
    findings: [...orders.findings, ...recipes.findings, ...config.findings],
    scanned: {
      agents: orders.agents,
      withGrant: orders.withGrant,
      commandDocs: recipes.commandDocs,
      settingsKeys: config.settingsKeys,
    },
  };
}

module.exports = { scan };

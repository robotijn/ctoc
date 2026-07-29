'use strict';

/**
 * THE GATE-NUMBER FENCE — find a gate number on its way to a human, by PARSING
 * rather than guessing.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────────
 * Never put a gate number in text a person reads. A gate number ("Gate 3") is an
 * internal code out of CTOC's own documentation; the reader would need a numbered
 * map of the pipeline in their head to decode it, and being handed one reads as
 * evasive. The owner said "no numbers" three times and each correction was applied
 * to prose, never to the strings the product ships — the only place it mattered.
 * He then opened a fresh repository, read "Gate 3 (review → done)", and reacted with
 * real anger. Numbers stay entirely legal in code identifiers, comments, file
 * formats and directory names; they are forbidden in exactly one place — rendered
 * text. `src/lib/gate-words.js` is where the human-facing phrasing lives instead.
 *
 * ── IT PARSES. IT DOES NOT GREP. ──────────────────────────────────────────────
 * The line that put "Gate 3" on the owner's screen was `` `Gate ${meta.gate}` `` —
 * its SOURCE TEXT CONTAINS NO DIGIT, so a text search never finds it, while a text
 * search DOES find dozens of comments and identifiers that must be left alone. A
 * grep-based fence is therefore precisely inverted: it misses the real defect and
 * fires on the legitimate cases. So this scan builds a syntax tree with the
 * TypeScript compiler API (already a development dependency) and walks it.
 *
 *   comments/JSDoc  never visited — comments are TRIVIA in the tree, not nodes; a
 *                   comment is structurally incapable of being reached by the walk.
 *   identifiers     never inspected — the walk looks only at string-bearing literal
 *                   nodes, never at an Identifier. `gate3`, `GATE_2_META`,
 *                   `validateGate2`, `state.gate1_approval` are all invisible.
 *   import paths    a module specifier and a require('…') argument are excluded —
 *                   they are identifiers wearing quotes.
 *   property KEYS   the name half of a property is excluded; its VALUE is inspected.
 *   values/args/    inspected — this is where screen text lives.
 *   returns/tmpl
 *
 * ── TWO PATTERNS, because the defect has two shapes ───────────────────────────
 *   written   any inspected literal whose text matches /\bgates?[\s_-]*[0-3]\b/i —
 *             a gate word followed by a gate DIGIT, whatever separates the two:
 *             "Gate 3", "Gate-3", "Gate_2", "gate3". The separator class must include
 *             the hyphen and underscore: `\s` alone missed "Gate-3" and let two live
 *             strings ship. Narrow on the DIGIT on purpose: [0-3], not [0-9] — there
 *             are four gates, and a wider class fires on "Gate 8080" in a URL or
 *             "Gate 42" in a version. The bare plural noun "gates" in prose carries no
 *             adjacent 0-3 and so never matches WRITTEN.
 *   composed  a TemplateHead/TemplateMiddle whose text ENDS with /\bgates?\s*$/i
 *             (the `` `Gate ${n}` `` shape) and a StringLiteral that is an operand
 *             of a `+` and ends the same way (the `'Gate ' + n` shape). This is the
 *             pattern that catches the defect that actually shipped.
 *
 * ── WHAT IT CANNOT SEE (a fence whose limits are unstated is trusted past them) ─
 *   1. Text that reaches a screen from DATA, not source — a gate number in a YAML
 *      profile, a JSON template or a Markdown agent file, loaded and rendered at
 *      runtime, is invisible to a scan that reads JavaScript.
 *   2. A number composed across a module boundary — `const n = meta.gate` in one
 *      file and `'Gate ' + n` in another are caught only if both files are in scope.
 *   3. Runtime construction with no adjacent literal — `['Gate', n].join(' ')`,
 *      `String.fromCharCode`, a formatter, a lookup table keyed by number. The scan
 *      matches text adjacency, and these have none.
 *   4. Whether a flagged string is ACTUALLY rendered. The scan cannot prove
 *      reachability. A gate number in a scanned module that only ever reaches a log
 *      is a FALSE POSITIVE, and the fence deliberately prefers it: a loud false
 *      positive is a five-minute conversation, a silent miss is what shipped.
 *   5. Wording quality — it catches a NUMBER, never a screen that says "send back to
 *      functional", which carries internal vocabulary but no digit. Stage-name
 *      vocabulary is fenced only by the render assertions of the slices that fixed
 *      those screens.
 *   6. Agent/skill Markdown, plan files, commit messages — out of scope by design:
 *      the rule permits numbers in identifiers, comments and file formats.
 *
 * ── AVAILABILITY IS PART OF THE RETURN TYPE, NOT AN EXCEPTION ──────────────────
 * An unreadable or unparseable file yields `{ available: false, reason }` — NEVER an
 * empty findings list. "I could not read it" and "I read it and it was clean" are
 * different facts, and a scanner that returns the success value (an empty findings
 * list) for both is the exact false-green shape this repository fences. The parser
 * is required LAZILY because `src/` ships to user projects that will not have the
 * development dependency; its absence is reported as `available: false`, which the
 * gated run here treats as a FAILURE (the parser IS installed, so absence means
 * something is broken) and a user project treats as not-run.
 *
 * Cross-platform: registry entries are stored POSIX-relative and joined with
 * `path.join`; every emitted `file` is normalised to POSIX separators.
 */

const path = require('node:path');
const safeFs = require('./safe-fs');

/**
 * THE REGISTRY — the modules that produce a screen a person reads. Not every string
 * in `src/` is human-facing (ledger evidence, log lines and frontmatter keys keep
 * their numbers), so the scan runs over this list rather than all of `src/`. It is
 * DEFENDED against silent rot by `findUnregisteredScreens`: any module that returns
 * the `{ text, ask, actions }` screen contract and is NOT listed here fails the
 * fence by omission, naming itself. The registry cannot shrink to nothing unnoticed.
 *
 * @type {ReadonlyArray<string>} repository-relative, POSIX separators
 */
const SCREEN_MODULES = Object.freeze([
  // The menu-router contract ({ text, ask, actions }).
  'src/commands/start.js',
  'src/lib/menu-screens.js',
  'src/lib/streaming-gate.js',
  'src/lib/streaming-render.js',
  'src/lib/task-view.js',
  // The TUI-area contract (module.exports carries `render`). These are the primary
  // screens `src/commands/start.js` mounts — the inbox among them, which is exactly
  // the screen a live gate number reached because the first, hand-seeded registry
  // omitted this whole family.
  'src/areas/agent.js',
  'src/areas/inbox.js',
  'src/areas/library.js',
  'src/areas/pipeline.js',
  'src/areas/system.js',
  'src/tabs/overview.js',
  'src/tabs/review.js',
  'src/tabs/tools.js',
  'src/tabs/vision.js',
]);

/** The three property names every screen in this codebase returns together. */
const SCREEN_CONTRACT = Object.freeze(['text', 'ask', 'actions']);

// The written shape is a gate word followed by a gate digit, whatever separates the
// two: `Gate 3`, `Gate-3`, `Gate_2`, `gate3`. The first cut used `\s+` — copied from
// COMPOSED_END, where the whitespace fends off the English plural in a count phrase —
// but `\s` does NOT match a hyphen, so `Gate-3` slipped straight through and two live
// human-facing strings kept saying the number while scanRegistry reported the registry
// clean. WRITTEN does not need the plural guard COMPOSED_END needs: it requires a
// literal gate DIGIT immediately after the word (only separators between), so the bare
// plural noun "gates" in prose — which carries no adjacent 0-3 — never matches. The
// separator class is `[\s_-]*` (space, underscore, hyphen; zero or more) so an
// unseparated `gate3` is caught too. `[0-3]`, not `[0-9]`: there are four gates, and a
// wider class fires on "Gate 8080" in a URL or "Gate 42" in a version.
const WRITTEN = /\bgates?[\s_-]*[0-3]\b/i;
// The composed shape is `` `Gate ${n}` `` / `'Gate ' + n`: the literal ALWAYS ends
// with the word "gate" followed by the whitespace that precedes the interpolated
// number. Requiring that trailing whitespace (\s+, not \s*) is what separates the
// real leak from the English plural in a count phrase — `` `…plans at gates${flag}` ``
// ends with the word "gates" flush against the interpolation, no trailing space, and
// must NOT fire. Precision over reach: a fence that cries wolf gets whitelisted into
// uselessness.
const COMPOSED_END = /\bgates?\s+$/i;

/**
 * Strip C0 and C1 control characters from text before it is reported — a finding is
 * printed to a terminal, and an escape sequence smuggled through a source string
 * must not reach it. Also bound the length so a pathological literal cannot flood a
 * report.
 * @param {string} s
 * @returns {string}
 */
function stripCtl(s) {
  const clean = String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
  return clean.length > 200 ? `${clean.slice(0, 197)}...` : clean;
}

/**
 * Load the TypeScript parser lazily. `src/` ships to user projects that will not
 * carry the development dependency, so a load-time require would crash the enforcer
 * there. Absence is reported (`ts === null`), never thrown. Both keys are ALWAYS
 * present — a plain shape, not a discriminated union — so callers reading `reason`
 * on the failure path do not depend on control-flow narrowing checkJs will not do.
 * @returns {{ ts: any, reason: string }}
 */
function loadParser() {
  try {
    return { ts: require('typescript'), reason: '' };
  } catch {
    return { ts: null, reason: 'the TypeScript parser is not installed; this scan cannot run' };
  }
}

/**
 * A literal node that is an identifier wearing quotes — a module specifier, a
 * require() argument, or the NAME half of a property — must be excluded. Its VALUE
 * counterpart is inspected.
 * @param {any} ts
 * @param {any} node a string-bearing literal
 * @returns {boolean} true when the literal must be skipped
 */
function isIdentifierInDisguise(ts, node) {
  const parent = node.parent;
  if (!parent) return false;
  const K = ts.SyntaxKind;

  // import '…'  /  export … from '…'  — the module specifier.
  if ((parent.kind === K.ImportDeclaration || parent.kind === K.ExportDeclaration) &&
      parent.moduleSpecifier === node) {
    return true;
  }
  // import x = require('…')
  if (parent.kind === K.ExternalModuleReference && parent.expression === node) return true;

  // require('…') and dynamic import('…') — the first argument of the call.
  if (parent.kind === K.CallExpression && parent.arguments && parent.arguments[0] === node) {
    const callee = parent.expression;
    if (callee) {
      if (callee.kind === K.ImportKeyword) return true;
      if (callee.kind === K.Identifier && callee.text === 'require') return true;
    }
  }

  // A property KEY: `{ 'gate 3': x }`, an enum member name, a class member name.
  const NAMED_MEMBER = new Set([
    K.PropertyAssignment, K.ShorthandPropertyAssignment, K.PropertySignature,
    K.PropertyDeclaration, K.MethodDeclaration, K.MethodSignature,
    K.GetAccessor, K.SetAccessor, K.EnumMember,
  ]);
  if (NAMED_MEMBER.has(parent.kind) && parent.name === node) return true;

  // A computed key `['gate 3']: …` — the literal is inside a ComputedPropertyName.
  if (parent.kind === K.ComputedPropertyName) return true;

  return false;
}

/**
 * Classify one string-bearing literal. Returns the matching pattern, or null.
 * `written` takes precedence over `composed` so a literal is reported at most once.
 * @param {any} ts
 * @param {any} node
 * @param {string} text the literal's text (its cooked value)
 * @returns {'written'|'composed'|null}
 */
function classifyLiteral(ts, node, text) {
  if (WRITTEN.test(text)) return 'written';

  const K = ts.SyntaxKind;
  // Composed via template: `` `Gate ${n}` `` — the head/middle ends with a gate word.
  if ((node.kind === K.TemplateHead || node.kind === K.TemplateMiddle) && COMPOSED_END.test(text)) {
    return 'composed';
  }
  // Composed via concatenation: `'Gate ' + n` — a string operand of `+` ending in a
  // gate word.
  if (node.kind === K.StringLiteral && COMPOSED_END.test(text)) {
    const parent = node.parent;
    if (parent && parent.kind === K.BinaryExpression &&
        parent.operatorToken && parent.operatorToken.kind === K.PlusToken) {
      return 'composed';
    }
  }
  return null;
}

/** The literal node kinds whose text the walk inspects. */
function isInspectableLiteral(ts, node) {
  const K = ts.SyntaxKind;
  return node.kind === K.StringLiteral ||
    node.kind === K.NoSubstitutionTemplateLiteral ||
    node.kind === K.TemplateHead ||
    node.kind === K.TemplateMiddle ||
    node.kind === K.TemplateTail;
}

/**
 * Scan a single JavaScript file for gate numbers that reach a human.
 *
 * @param {string} absPath absolute path to a `.js` file
 * @returns {{ available: true, findings: Array<{file:string,line:number,column:number,text:string,pattern:'written'|'composed'}> }
 *          | { available: false, reason: string }}
 */
function scanFile(absPath) {
  if (typeof absPath !== 'string' || absPath.length === 0) {
    return { available: false, reason: 'scanFile requires an absolute file path string' };
  }

  const parser = loadParser();
  if (!parser.ts) return { available: false, reason: parser.reason };
  const ts = parser.ts;

  let source;
  try {
    source = safeFs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return { available: false, reason: `could not read ${absPath}: ${err.message}` };
  }

  let sourceFile;
  try {
    sourceFile = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  } catch (err) {
    return { available: false, reason: `could not parse ${absPath}: ${err.message}` };
  }
  // createSourceFile is lenient and records syntax errors rather than throwing. An
  // unparseable file is UNAVAILABLE, never an empty (passing) findings list.
  if (sourceFile.parseDiagnostics && sourceFile.parseDiagnostics.length > 0) {
    return { available: false, reason: `could not parse ${absPath}: ${sourceFile.parseDiagnostics.length} syntax error(s)` };
  }

  const posixFile = absPath.split(path.sep).join('/');
  const findings = [];

  const visit = (node) => {
    if (isInspectableLiteral(ts, node) && !isIdentifierInDisguise(ts, node)) {
      const text = typeof node.text === 'string' ? node.text : '';
      const pattern = classifyLiteral(ts, node, text);
      if (pattern) {
        const start = node.getStart(sourceFile);
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
        findings.push({
          file: posixFile,
          line: line + 1,
          column: character + 1,
          text: stripCtl(text),
          pattern,
        });
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);

  return { available: true, findings };
}

/**
 * Resolve a repository-relative registry entry under `root`, confined to the tree.
 * SCREEN_MODULES is an internal constant, so traversal is not a live vector, but the
 * scan reads files and confinement is cheap defence in depth.
 * @param {string} root
 * @param {string} rel POSIX-relative
 * @returns {string|null} absolute path, or null if it would escape `root`
 */
function resolveUnderRoot(root, rel) {
  const abs = path.resolve(root, rel);
  const base = path.resolve(root);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

/**
 * Scan every registry entry. If ANY entry is unavailable, the WHOLE result is
 * `available: false` with the reason naming the file — a registry scan that skipped
 * an unreadable entry and returned the rest would report a verdict on input it never
 * received.
 *
 * @param {string} root project root
 * @returns {{ available: true, findings: Array<object>, scanned: string[] }
 *          | { available: false, reason: string, findings: Array<object>, scanned: string[] }}
 */
function scanRegistry(root) {
  if (typeof root !== 'string' || root.length === 0) {
    return { available: false, reason: 'scanRegistry requires a project root', findings: [], scanned: [] };
  }
  const findings = [];
  const scanned = [];
  for (const rel of SCREEN_MODULES) {
    const abs = resolveUnderRoot(root, rel);
    if (abs === null) {
      return { available: false, reason: `registry entry ${rel} resolves outside the project root`, findings: [], scanned };
    }
    const res = scanFile(abs);
    if (!res.available) {
      // checkJs does not narrow this union on `!res.available`; the cast is safe —
      // the unavailable branch IS the { available:false, reason } shape.
      const reason = /** @type {{ reason: string }} */ (res).reason;
      return { available: false, reason: `${rel}: ${reason}`, findings, scanned };
    }
    scanned.push(rel);
    // Re-label each finding with the repository-relative POSIX path the registry
    // knows, rather than the absolute path scanFile carries — a finding is printed
    // to a terminal, and an absolute path leaks the machine's directory layout.
    for (const f of res.findings) findings.push({ ...f, file: rel });
  }
  return { available: true, findings, scanned };
}

/**
 * Collect the property names of an object literal, for the screen-contract query.
 * @param {any} ts
 * @param {any} objNode ObjectLiteralExpression
 * @returns {Set<string>}
 */
function propertyNames(ts, objNode) {
  const K = ts.SyntaxKind;
  const names = new Set();
  for (const prop of objNode.properties || []) {
    const name = prop.name;
    if (!name) continue;
    if (name.kind === K.Identifier || name.kind === K.StringLiteral) names.add(name.text);
  }
  return names;
}

/**
 * A property-access chain, resolved to its dotted string (e.g. `module.exports`,
 * `exports.render`), or null if it is not a plain identifier chain.
 * @param {any} ts
 * @param {any} node
 * @returns {string|null}
 */
function accessChain(ts, node) {
  const K = ts.SyntaxKind;
  if (node.kind === K.Identifier) return node.text;
  if (node.kind === K.PropertyAccessExpression) {
    const base = accessChain(ts, node.expression);
    if (base === null || !node.name || node.name.kind !== K.Identifier) return null;
    return `${base}.${node.name.text}`;
  }
  return null;
}

/**
 * Does this module PRODUCE a screen a human reads? Two contracts exist in this
 * codebase and BOTH must be detected, or the registry's rot-defence has the same
 * blind spot the hand-seeded registry did — which is exactly how a live gate number
 * reached the owner's inbox:
 *
 *   1. the menu-router contract — some code path returns an object literal carrying
 *      all of `text`, `ask`, `actions` (menu-screens, task-view, streaming-gate);
 *   2. the TUI-area contract — `module.exports` carries a `render` member, or
 *      `exports.render`/`module.exports.render` is assigned (the `src/areas/*` and
 *      `src/tabs/*` modules `src/commands/start.js` mounts, each `render(app) → string`).
 *
 * @param {any} ts
 * @param {any} sourceFile
 * @returns {boolean}
 */
function moduleProducesScreen(ts, sourceFile) {
  const K = ts.SyntaxKind;
  let found = false;
  const visit = (node) => {
    if (found) return;

    // (1) the { text, ask, actions } object contract.
    if (node.kind === K.ObjectLiteralExpression) {
      const names = propertyNames(ts, node);
      if (SCREEN_CONTRACT.every((k) => names.has(k))) { found = true; return; }
    }

    // (2) the render-export area contract: module.exports = { …render… } or
    //     exports.render = … / module.exports.render = ….
    if (node.kind === K.BinaryExpression && node.operatorToken &&
        node.operatorToken.kind === K.EqualsToken) {
      const lhs = accessChain(ts, node.left);
      if (lhs === 'exports.render' || lhs === 'module.exports.render') { found = true; return; }
      if ((lhs === 'module.exports' || lhs === 'exports') &&
          node.right && node.right.kind === K.ObjectLiteralExpression &&
          propertyNames(ts, node.right).has('render')) {
        found = true; return;
      }
    }

    node.forEachChild(visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * Walk every `.js` file under `src` and report each module that PRODUCES a screen
 * (either screen contract — see `moduleProducesScreen`) but is NOT in
 * `SCREEN_MODULES`. A new screen module added next month, unregistered, fails here by
 * name rather than escaping the scan silently.
 *
 * @param {string} root project root
 * @returns {{ available: true, modules: string[] } | { available: false, reason: string, modules: string[] }}
 */
function findUnregisteredScreens(root) {
  if (typeof root !== 'string' || root.length === 0) {
    return { available: false, reason: 'findUnregisteredScreens requires a project root', modules: [] };
  }
  const parser = loadParser();
  if (!parser.ts) return { available: false, reason: parser.reason, modules: [] };
  const ts = parser.ts;

  const srcDir = resolveUnderRoot(root, 'src');
  if (srcDir === null) return { available: false, reason: 'src resolves outside the project root', modules: [] };
  if (!safeFs.existsSync(srcDir)) {
    // Not a CTOC source tree — nothing to check, and that is CLEAN, not unavailable.
    return { available: true, modules: [] };
  }

  const registered = new Set(SCREEN_MODULES);
  const unregistered = [];

  /** Recursively collect .js files under a directory. */
  const jsFiles = [];
  const walkDir = (dir) => {
    let entries;
    try {
      entries = safeFs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // an unreadable subdirectory is not a screen module; skip it
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walkDir(full);
      else if (ent.isFile() && ent.name.endsWith('.js')) jsFiles.push(full);
    }
  };
  walkDir(srcDir);

  for (const abs of jsFiles) {
    let source;
    try {
      source = safeFs.readFileSync(abs, 'utf8');
    } catch (err) {
      return { available: false, reason: `could not read ${abs}: ${err.message}`, modules: [] };
    }
    let sf;
    try {
      sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    } catch (err) {
      return { available: false, reason: `could not parse ${abs}: ${err.message}`, modules: [] };
    }
    if (sf.parseDiagnostics && sf.parseDiagnostics.length > 0) {
      return { available: false, reason: `could not parse ${abs}: ${sf.parseDiagnostics.length} syntax error(s)`, modules: [] };
    }

    const producesScreen = moduleProducesScreen(ts, sf);

    if (producesScreen) {
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (!registered.has(rel)) unregistered.push(rel);
    }
  }

  unregistered.sort();
  return { available: true, modules: unregistered };
}

module.exports = {
  SCREEN_MODULES,
  scanFile,
  scanRegistry,
  findUnregisteredScreens,
};

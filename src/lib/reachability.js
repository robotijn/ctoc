'use strict';

/**
 * Reachability analysis over src/ — the dead-code fence. TWO fences live here:
 *
 *   • THE FILE FENCE (`analyze`)      — can a human reach this FILE?
 *   • THE EXPORT FENCE (`analyzeExports`) — can a human reach this EXPORT?
 *
 * Both answer the same question at different granularity, and BOTH are needed.
 * The file fence cannot see a dead export inside a live file — which is exactly
 * how the worst defect of the 2026-07-14 wave shipped: `completeExecution` lived
 * in `src/lib/actions.js` (a thoroughly live file), was the ONLY producer of the
 * Gate-3 VERIFY evidence, and had ZERO callers. The file fence stayed green while
 * Gate 3 was un-passable for every human except by clicking "Approve anyway".
 *
 * IN BOTH FENCES, A TEST IS NEVER A CALLER. That is the whole point. A slice ships
 * "a module plus its own test", and a test IS a caller — so every module and every
 * export has always had a caller by construction, and the suite certified dead code
 * as healthy. Neither fence ever looks at tests/.
 *
 * WHY THIS EXISTS (root cause, 2026-07-14). An adversarial audit found roughly
 * half of src/ unreachable from every live execution root, despite four human
 * gates, a critic fleet, and a fully green test suite. The cause is structural,
 * not sloppiness:
 *
 *   A slice ships "one module plus its own test". A test IS a caller. So every
 *   module ever built has a caller by construction, and nothing ever asserted
 *   reachability from a LIVE root. The suite therefore certifies dead code as
 *   healthy: it asks "does this module work?", never "can a human reach it?".
 *
 * Modules were built, tested, reviewed, gate-approved — and never wired. Several
 * plans explicitly deferred call-site wiring to a follow-up slice that nothing
 * tracked and nobody created. The verify-evidence writer that Gate 3 depends on
 * shipped this way: a live gate with a dead producer.
 *
 * This module computes the truth the suite never checked. tests/reachability.test.js
 * turns it into a RATCHET: the unreachable set may only ever shrink, and no new
 * file may ever join it. A module is not done when its test passes; it is done
 * when a human can reach it.
 *
 * LIVE ROOTS — a file is alive iff require-reachable from:
 *   1. every hook command registered in .claude-plugin/hooks.json;
 *   2. the shipped slash commands (src/commands/menu.js, push.js, update.js);
 *   3. scripts the pipeline sanctions directly (move-plan.js — whitelisted in the
 *      Bash hook as the agent plan-move API; release.js — the release procedure;
 *      test-gate.js — the npm test entry point);
 *   4. roots declared in .ctoc/reachability-roots.json (escape hatch for genuinely
 *      new entry points; adding one is a deliberate, reviewable act).
 *
 *   5. INSTRUCTION-SURFACE roots: any src/ file a shipped executable instruction
 *      INVOKES — `node <path>` or `require('<path>')` inside src/commands/*.md,
 *      agents' markdown, skills' SKILL.md, or a CI workflow. In CTOC's
 *      architecture the session model executes what those surfaces instruct, so a
 *      file they RUN is genuinely reachable by a human's session. A file merely
 *      NAMED in prose is a CITATION, NOT A ROOT. A file invoked NOWHERE — no code
 *      edge, no instruction that runs it — is dead.
 *
 * A TEST IS NEVER A ROOT. That is the whole point.
 *
 * A CITATION IS NOT AN INVOCATION — IN BOTH FENCES. The export fence has always
 * said so; the file fence used to contradict it twenty lines away. Until
 * 2026-07-19 `edgesFrom` credited ANY quoted string ending in `.js` as a call
 * edge, matched by BASENAME — so `existsSync`'s presence-check array
 * (`iron-loop-enforcer.js`'s REQUIRED_LIBS) manufactured eight call edges to files
 * nothing executes — and `liveRoots` promoted ANY `src/**.js` path MENTIONED in
 * any markdown to an execution root, prose included. Two rules, one module,
 * opposite verdicts: a reader who landed on the wrong function concluded the
 * exact opposite of the truth, and the baseline reported zero unreachable files
 * against roughly two dozen real ones.
 *
 * THE READ PATHS FAIL LOUD (2026-07-19). Every one of them used to degrade
 * SILENTLY toward "unreachable": an unreadable source file returned an empty edge
 * set, an unreadable hooks manifest became the empty string so EVERY registered
 * hook lost root status at once, and an unreadable instruction surface was
 * skipped. The prose-root rule masked all three. Removing the mask without fixing
 * them would let ONE unreadable file declare every hook — and its whole transitive
 * tree — dead, into a baseline whose only sanctioned exits are wire or delete: a
 * fence whose failure mode is "everything is dead" nominating live code for
 * deletion. Unreadable is now FATAL and named; ABSENT keeps its own handling,
 * because absent and unreadable are DIFFERENT FACTS. `analyze` returns
 * `readErrors` so a seeding run can prove it read everything it judged.
 *
 * Cross-platform: path.join / posix normalization only; no shell.
 */

const path = require('path');
const safeFs = require('./safe-fs');

/** Files under src/ that are entry points by construction, not by being required. */
const SANCTIONED_SCRIPT_ROOTS = [
  path.join('src', 'commands', 'menu.js'),
  path.join('src', 'commands', 'push.js'),
  path.join('src', 'commands', 'update.js'),
  path.join('src', 'scripts', 'move-plan.js'),
  path.join('src', 'scripts', 'release.js'),
  path.join('src', 'scripts', 'test-gate.js')
];

const ROOTS_FILE = path.join('.ctoc', 'reachability-roots.json');
const HOOKS_MANIFEST = path.join('.claude-plugin', 'hooks.json');

/**
 * Recursively collect every .js file under a directory.
 * @param {string} dir
 * @param {string[]} [acc]
 * @returns {string[]} absolute paths
 */
function collectJsFiles(dir, acc = []) {
  if (!safeFs.existsSync(dir)) return acc;
  for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

/**
 * Resolve a relative require specifier to an absolute file under the project.
 * Mirrors Node resolution for the three forms this codebase uses: exact path,
 * implicit .js, and directory index.js. Returns null for bare specifiers
 * (node builtins and dependencies are never part of the reachability graph).
 *
 * @param {string} fromFile - absolute path of the requiring file
 * @param {string} spec - the require specifier
 * @returns {string|null} absolute resolved path, or null
 */
function resolveRequire(fromFile, spec) {
  if (typeof spec !== 'string' || !spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
    if (safeFs.existsSync(candidate)) {
      try {
        if (safeFs.statSync(candidate).isFile()) return candidate;
      } catch { /* unreadable → not an edge */ }
    }
  }
  return null;
}

/**
 * A repository-relative label for a path, for error messages. Never an absolute
 * path (which would leak a home directory into a build log); falls back to the
 * last two segments when the file lies outside the project root.
 *
 * @param {string|null} projectRoot
 * @param {string} file - absolute path
 * @returns {string}
 */
function relLabel(projectRoot, file) {
  if (projectRoot) {
    const r = path.relative(projectRoot, file).split(path.sep).join('/');
    if (r.length > 0 && !r.startsWith('..')) return r;
  }
  return file.split(path.sep).slice(-2).join('/');
}

/**
 * Read a file the analyzer has already committed to judging. A file it cannot
 * read is a BROKEN INSTRUMENT, never evidence of absence — returning "" or an
 * empty edge set here is a verdict on input that was never received, and it
 * always points the same way: toward "dead".
 *
 * @param {string} file - absolute path
 * @param {string|null} projectRoot - for the error label only
 * @param {string} what - human noun for the message
 * @returns {string}
 * @throws {Error} naming the repository-relative path
 */
function readOrThrow(file, projectRoot, what) {
  try {
    return safeFs.readFileSync(file, 'utf8');
  } catch (err) {
    const e = /** @type {NodeJS.ErrnoException} */ (err);
    throw new Error(
      `reachability: cannot read ${what} ${relLabel(projectRoot, file)} (${e.code || e.message}). ` +
      'An unreadable input is a broken instrument, not evidence that nothing is there — ' +
      'every silent degradation here points at "unreachable", and the baseline it feeds ' +
      'can only be paid off by wiring or deleting. Fix the read.'
    );
  }
}

/** The process-spawning calls whose ARGUMENTS genuinely execute a script.
 * Disjoint classes plus a literal `(` sentinel → linear, ReDoS-safe. */
const SPAWN_CALL_RE = /\b(?:spawnSync|spawn|execFileSync|execFile|execSync|exec|fork)\s*\(/g;
/** A quoted literal inside an argument list. Bounded, no nesting, linear. */
const ARG_LITERAL_RE = /['"`]([^'"`\n]{0,512})['"`]/g;
/** A command string that RUNS a src file: `node …/src/x.js`. `node:` (the builtin
 * module scheme) is excluded, and the gap between `node` and the path is bounded
 * to the length of a realistic flag list plus a `${CLAUDE_PLUGIN_ROOT}` prefix. */
const NODE_RUNS_SRC_RE = /\bnode(?![:\w])[^\n]{0,80}?(src\/[A-Za-z0-9_\-/.]+\.js)/g;
/** How far a spawn call's argument list is scanned before giving up. */
const ARG_SCAN_LIMIT = 2000;

/**
 * The text of one call's argument list, from just after its `(` to the matching
 * `)`. Quote-aware (so a `)` inside a string does not close the list) and bounded
 * — a spawn's arguments are the ONLY place a path literal is genuinely executed,
 * and a fixed character window instead would credit whatever happened to sit a few
 * lines below the call.
 *
 * @param {string} content - comment-stripped source
 * @param {number} openIdx - index of the character AFTER the opening paren
 * @returns {string}
 */
function argumentText(content, openIdx) {
  let depth = 1;
  let quote = '';
  const end = Math.min(content.length, openIdx + ARG_SCAN_LIMIT);
  let i = openIdx;
  for (; i < end; i++) {
    const c = content[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) break; }
  }
  return content.slice(openIdx, i);
}

/**
 * Resolve a PATH literal to a real src file. Two conditions, both required, and
 * together they are what stops a presence-check array from manufacturing edges:
 *
 *   • it must contain a path SEPARATOR — a bare basename (`'menu.js'`) names no
 *     path, and basename matching is precisely how one string used to fan out to
 *     every file that shares it;
 *   • it must resolve UNAMBIGUOUSLY to one real file under src/ — either relative
 *     to the referring file, or as a unique project-relative suffix (covering
 *     `${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js`). Two candidates → no edge; a
 *     guess is worse than a gap in a list that can only be paid off by deletion.
 *
 * @param {string} fromFile - absolute path of the referring file
 * @param {string[]} allFiles - absolute paths of every src file
 * @param {string} spec - the literal's text
 * @returns {string|null}
 */
function resolvePathLiteral(fromFile, allFiles, spec) {
  const norm = String(spec).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!norm.endsWith('.js') || !norm.includes('/')) return null;
  const abs = path.resolve(path.dirname(fromFile), norm);
  const hits = [];
  for (const candidate of allFiles) {
    if (candidate === abs) return candidate;
    if (candidate.split(path.sep).join('/').endsWith(`/${norm}`)) hits.push(candidate);
  }
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Extract every outbound edge from one file: static `require('./x')`, the
 * codebase's lazy `req('./x')` alias, and path literals another file genuinely
 * EXECUTES — a script passed to a spawning call, or named in a `node …` command
 * string. A path literal that is merely STORED, listed, or checked for existence
 * is a citation, not an invocation, and is not an edge.
 *
 * Comments are stripped first: a `require` written inside a comment is not a
 * call. A fence a comment can disarm is not a fence.
 *
 * @param {string} file - absolute path
 * @param {string[]} allFiles - absolute paths of every src file (for path-literal matching)
 * @param {string|null} [projectRoot] - project root, for error labels only
 * @returns {Set<string>} absolute paths this file reaches directly
 * @throws {Error} if the file cannot be read (never a silent empty edge set)
 */
function edgesFrom(file, allFiles, projectRoot = null) {
  const out = new Set();
  const content = stripComments(readOrThrow(file, projectRoot, 'source file'));

  // require('./x') and the lazy req('./x') alias used across the codebase.
  const requirePattern = /(?:require|req)\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = requirePattern.exec(content)) !== null) {
    const target = resolveRequire(file, match[1]);
    if (target) out.add(target);
  }

  // A path literal inside a SPAWNING call's argument list — the script really runs.
  SPAWN_CALL_RE.lastIndex = 0;
  while ((match = SPAWN_CALL_RE.exec(content)) !== null) {
    const args = argumentText(content, match.index + match[0].length);
    ARG_LITERAL_RE.lastIndex = 0;
    let lit;
    while ((lit = ARG_LITERAL_RE.exec(args)) !== null) {
      const target = resolvePathLiteral(file, allFiles, lit[1]);
      if (target && target !== file) out.add(target);
    }
  }

  // A command string that runs a src file by path: `node ".../src/commands/menu.js"`.
  NODE_RUNS_SRC_RE.lastIndex = 0;
  while ((match = NODE_RUNS_SRC_RE.exec(content)) !== null) {
    const target = resolvePathLiteral(file, allFiles, match[1]);
    if (target && target !== file) out.add(target);
  }

  return out;
}

/**
 * Collect the shipped INSTRUCTION SURFACES — the markdown/CI files the session
 * model actually executes: command specs (`src/commands/*.md`), agent definitions,
 * skill bodies, and CI workflows. Both fences honor the same surfaces: a file (or
 * an export) named in a shipped instruction is genuinely reachable by a human's
 * session, because the session does what those files say.
 *
 * `tests/` is deliberately NOT a surface. A test is never a caller.
 *
 * @param {string} projectRoot - absolute project root
 * @returns {string[]} absolute paths of every instruction-surface file
 */
function collectSurfaceFiles(projectRoot) {
  const surfaces = [];
  const walk = (dir, exts) => {
    if (!safeFs.existsSync(dir)) return;
    for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, exts);
      else if (exts.some((e) => entry.name.endsWith(e))) surfaces.push(full);
    }
  };
  walk(path.join(projectRoot, 'src', 'commands'), ['.md']);
  walk(path.join(projectRoot, 'agents'), ['.md']);
  walk(path.join(projectRoot, 'skills'), ['SKILL.md']);
  walk(path.join(projectRoot, '.github', 'workflows'), ['.yml', '.yaml']);
  return surfaces;
}

/** A shipped instruction that RUNS a src file: `node …/src/x.js`. Same bounded,
 * `node:`-excluding shape as the code-side rule. */
const SURFACE_NODE_RUNS_RE = /\bnode(?![:\w])[^\n]{0,80}?(src\/[A-Za-z0-9_\-/.]+\.js)/g;
/** A shipped instruction that REQUIRES a src file — the session's inline
 * `node -e "require('./src/lib/x.js')"` recipe form. Quote-delimited, linear. */
const SURFACE_REQUIRES_RE = /\brequire\s*\(\s*['"][^'"\n]{0,64}?(src\/[A-Za-z0-9_\-/.]+\.js)['"]\s*\)/g;

/**
 * Resolve the live roots for a project.
 *
 * @param {string} projectRoot - absolute project root
 * @param {string[]} allFiles - absolute paths of every src file
 * @param {{ tolerate?: boolean, readErrors?: string[] }} [options] - when
 *   `tolerate` is set, an unreadable input is recorded in `readErrors` instead of
 *   throwing. A run with a non-empty `readErrors` may NEVER seed a baseline.
 * @returns {{ roots: string[], declared: string[] }} absolute root paths, and the
 *   subset that came from the declared-roots escape hatch.
 */
function liveRoots(projectRoot, allFiles, options = {}) {
  const roots = new Set();
  const tolerate = options.tolerate === true;
  const readErrors = options.readErrors || [];

  // 1. Hooks registered in the plugin manifest — the real runtime entry points.
  //    An ABSENT manifest means "no hooks" and is legitimate. An UNREADABLE one is
  //    a broken instrument: reading it as "" made `raw.includes(...)` false for
  //    EVERY hook, silently killing every runtime entry point at once.
  const manifest = path.join(projectRoot, HOOKS_MANIFEST);
  if (safeFs.existsSync(manifest)) {
    let raw = '';
    try {
      raw = readOrThrow(manifest, projectRoot, 'the hooks manifest');
    } catch (err) {
      if (!tolerate) throw err;
      readErrors.push(relLabel(projectRoot, manifest));
    }
    for (const file of allFiles) {
      // A hook is live iff the manifest names its file. Matching on the basename
      // within a src/hooks path keeps this robust to ${CLAUDE_PLUGIN_ROOT} prefixes.
      const rel = path.relative(projectRoot, file).split(path.sep).join('/');
      if (rel.startsWith('src/hooks/') && raw.includes(path.basename(file))) {
        roots.add(file);
      }
    }
  }

  // 2 + 3. Shipped slash commands and pipeline-sanctioned scripts.
  for (const rel of SANCTIONED_SCRIPT_ROOTS) {
    const full = path.join(projectRoot, rel);
    if (safeFs.existsSync(full)) roots.add(full);
  }

  // 4b. Instruction-surface roots: src files named in shipped executable
  // instructions (command specs, agent markdown, skill bodies, CI workflows).
  const surfaces = collectSurfaceFiles(projectRoot);
  const byRel = new Map(allFiles.map((f) => {
    const rel = path.relative(projectRoot, f).split(path.sep).join('/');
    return [rel, f];
  }));
  for (const surface of surfaces) {
    let text = '';
    try {
      text = readOrThrow(surface, projectRoot, 'instruction surface');
    } catch (err) {
      if (!tolerate) throw err;
      readErrors.push(relLabel(projectRoot, surface));
      continue;
    }
    // A path is a root only when the surface RUNS it — `node <path>` or
    // `require('<path>')`. A path merely NAMED in prose, backticks included, is a
    // CITATION, not an invocation: this is `surfaceCalledNames`' rule, transposed
    // from names to paths. Crediting bare mentions made roughly a third of the
    // library a root on the strength of descriptive sentences in agent markdown.
    for (const re of [SURFACE_NODE_RUNS_RE, SURFACE_REQUIRES_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const hit = byRel.get(m[1]);
        if (hit) roots.add(hit);
      }
    }
  }

  // 4. Declared roots — the deliberate, reviewable escape hatch.
  const declared = [];
  const rootsFile = path.join(projectRoot, ROOTS_FILE);
  if (safeFs.existsSync(rootsFile)) {
    try {
      const parsed = JSON.parse(safeFs.readFileSync(rootsFile, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : (parsed && parsed.roots) || [];
      for (const rel of list) {
        if (typeof rel !== 'string') continue;
        const full = path.join(projectRoot, rel);
        if (safeFs.existsSync(full)) {
          roots.add(full);
          declared.push(rel);
        }
      }
    } catch { /* malformed roots file → no declared roots; the ratchet still holds */ }
  }

  return { roots: [...roots], declared };
}

/**
 * Compute reachability over src/.
 *
 * UNREADABLE INPUT IS FATAL. By default any file the analyzer cannot read throws,
 * naming the path: every silent degradation in here points at "unreachable", and
 * the baseline this feeds can only be paid off by wiring or deleting, so a verdict
 * computed over unread input would nominate live code for deletion. Pass
 * `{ tolerateReadErrors: true }` to collect the failures into `readErrors` instead
 * — a run with a non-empty `readErrors` MAY NOT seed a baseline.
 *
 * @param {string} projectRoot - absolute project root
 * @param {{ tolerateReadErrors?: boolean }} [options]
 * @returns {{ total: number, reachable: string[], unreachable: string[],
 *   roots: string[], readErrors: string[] }} `reachable`/`unreachable`/`roots`
 *   are project-relative POSIX paths, sorted; `readErrors` names every input the
 *   analyzer could not read (always empty unless tolerating).
 */
function analyze(projectRoot, options = {}) {
  const srcDir = path.join(projectRoot, 'src');
  const allFiles = collectJsFiles(srcDir);
  const tolerate = options.tolerateReadErrors === true;
  const readErrors = [];
  const { roots } = liveRoots(projectRoot, allFiles, { tolerate, readErrors });

  const graph = new Map();
  for (const file of allFiles) {
    try {
      graph.set(file, edgesFrom(file, allFiles, projectRoot));
    } catch (err) {
      if (!tolerate) throw err;
      readErrors.push(relLabel(projectRoot, file));
      graph.set(file, new Set());
    }
  }

  const reached = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of graph.get(current) || []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }

  const rel = (f) => path.relative(projectRoot, f).split(path.sep).join('/');
  const reachable = allFiles.filter((f) => reached.has(f)).map(rel).sort();
  const unreachable = allFiles.filter((f) => !reached.has(f)).map(rel).sort();

  return {
    total: allFiles.length,
    reachable,
    unreachable,
    roots: roots.map(rel).sort(),
    readErrors
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE EXPORT FENCE — dead exports inside live files.
//
// WHAT COUNTS AS A CALLER (exactly four things; anything else does NOT):
//   1. a code reference to the name in ANOTHER live module (cross-module use);
//   2. an intra-module reference — the name appears ≥2× in its own file's
//      comment- and export-declaration-stripped code (its definition plus at least
//      one real internal call). This is the `completeExecution` edge: menu-screens
//      calls the externally-visible `completeTaskPlan`, which calls
//      `completeExecution` inside `actions.js`. Delete that internal call and the
//      count drops to 1 → the export goes DEAD → the fence re-catches its own
//      motivating bug;
//   3. a CALL in a shipped instruction surface — the name invoked as `name(` or
//      referenced as `require('./x').name` (the session runs it, e.g.
//      `approveSubplans(parentSlug, 'review')` at menu.md:46, the Gate-3 gate).
//      CTOC's recipes use INLINE code, so the signal is CALL SYNTAX, not whether
//      the recipe sits in a fenced block;
//   4. a declared export root in .ctoc/reachability-roots.json.
//
// WHAT IS NOT A CALLER: bare markdown PROSE — including a backtick code-span that
// merely NAMES a function (`` `completeExecution` ``) or a sentence naming a
// `src/**.js` path — because a citation is not an invocation; a COMMENT (stripped,
// with a real regex-aware lexer so a quote inside a regex cannot disarm it); a TEST
// (tests/ is never in the live set).
//
// HONEST LIMITS (no AST, by design — zero new dependencies, O(files)):
//   • Export detection is regex over the three CommonJS forms this codebase uses:
//     `module.exports = { a, b }`, `module.exports.a = …`, `exports.a = …`. A
//     lazily-defined export is not detected and therefore never accused.
//   • Usage is name-based, so a common name shared with an unrelated identifier
//     reads as live. Intra-file usage (rule 2) is coarse: it credits an internal
//     call without proving the caller is itself reachable, so a dead internal
//     cluster inside a live file can read as live.
//
// Every limit biases the SAME way: the fence UNDER-reports, never over-reports. It
// cannot cry wolf, and a true zero-caller export (the bug class this exists for) is
// always caught. That is the right bias for a gate that fails a build.
// ─────────────────────────────────────────────────────────────────────────────

/** Identifier tokens in a blob of source (used for both usage and surface scans). */
const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * Strip JavaScript comments, preserving string/template contents.
 *
 * A COMMENT IS NOT A CALLER. Without this, a module that merely *mentions* a name
 * in a comment resurrects it — and that is not hypothetical: this file's own
 * header names `completeExecution` (the dead export that motivated the fence), and
 * that single mention was enough to make the analyzer report it live. A fence a
 * comment can disarm is not a fence.
 *
 * A state machine (code / line-comment / block-comment / '…' / "…" / `…` / regex)
 * with escape handling. Regex literals DO need their own state, and the reason is
 * the exact defect this fence was born to prevent: a regex that contains a quote —
 * `/['"]\/\//g` — used to flip a quote-less lexer into string state, which it never
 * left, so every comment after it survived stripping and could resurrect a dead
 * export. A `/` opens a regex only in expression position (see `regexAllowed`); in
 * value position it is division. Inside a regex, quotes are literal and a `[…]`
 * char-class hides `/`. Single/double-quoted strings cannot span a raw newline, so
 * a stray newline in `'`/`"` state resets to code — belt-and-suspenders against an
 * unterminated string running away. A fence a comment can disarm is not a fence.
 *
 * @param {string} src
 * @returns {string} the source with comment bodies replaced by spaces
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code';
  let lastCode = '';   // last non-whitespace char emitted in code state
  let inClass = false; // inside a regex [...] char class
  while (i < n) {
    const c = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && next === '*') { state = 'block'; i += 2; continue; }
      if (c === '/' && regexAllowed(lastCode)) { state = 'regex'; inClass = false; out += c; lastCode = '/'; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; out += c; lastCode = c; i++; continue; }
      out += c; if (!/\s/.test(c)) lastCode = c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += '\n'; }
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; i += 2; continue; }
      if (c === '\n') out += '\n'; // keep line structure
      i++; continue;
    }
    if (state === 'regex') {
      if (c === '\\') { out += c + next; i += 2; continue; }   // escaped char (incl. \/)
      if (c === '[') { inClass = true; out += c; i++; continue; }
      if (c === ']') { inClass = false; out += c; i++; continue; }
      if (c === '/' && !inClass) { state = 'code'; out += c; lastCode = '/'; i++; continue; }
      if (c === '\n') { state = 'code'; out += '\n'; i++; continue; } // regex can't span newline
      out += c; i++; continue;
    }
    // inside a string/template: copy through, honoring escapes
    if (c === '\\') { out += c + next; i += 2; continue; }
    if (c === state) { state = 'code'; out += c; lastCode = c; i++; continue; }
    if (c === '\n' && (state === "'" || state === '"')) { state = 'code'; out += '\n'; i++; continue; }
    out += c; i++;
  }
  return out;
}

/**
 * A `/` begins a regex literal only in EXPRESSION position — after an operator or
 * an opening punctuator, or at the start of input. After a value (identifier char,
 * closing `)`/`]`, a `.`, or a digit) it is the division operator. Erring toward
 * "division" would risk swallowing a real identifier token (a false alarm — the one
 * direction this fence forbids), so the test rejects only clear value-enders and
 * treats everything else as regex-position.
 *
 * @param {string} prev - last significant code character
 * @returns {boolean}
 */
function regexAllowed(prev) {
  if (!prev) return true;
  return !/[A-Za-z0-9_$)\].]/.test(prev);
}

/** A surface CALL: an identifier immediately followed by optional whitespace and
 * `(` — an invocation the session runs (`approveSubplans(parentSlug, 'review')`).
 * Disjoint char classes + a literal `(` sentinel → linear, ReDoS-safe. */
const SURFACE_CALL_RE = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
/** A resolved property reference off a relative require — `require('./x').name`
 * or `require('./x')['name']` — a caller even without an immediate paren (the
 * recipe assigns the function then invokes it). Quote-delimited, bounded, linear. */
const SURFACE_REQUIRE_DOT_RE = /require\s*\(\s*['"][^'"]*['"]\s*\)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;
const SURFACE_REQUIRE_IDX_RE = /require\s*\(\s*['"][^'"]*['"]\s*\)\s*\[\s*['"]([^'"]+)['"]\s*\]/g;

/**
 * The names a shipped instruction surface actually CALLS — the ONLY surface
 * references the EXPORT fence honors. The distinguishing signal is CALL SYNTAX,
 * not markdown formatting: CTOC's recipes invoke library functions with INLINE
 * code (`approveSubplans(parentSlug, 'review')` at menu.md:46 — the Gate-3
 * done-all gate), not fenced blocks. So a name is credited iff it appears as
 * `name(` (an invocation) OR inside `require('…').name` / `require('…')['name']`
 * (a resolved reference the recipe then runs). A BARE TOKEN in prose — even a
 * backtick code-span that merely names the function, e.g. the sentence
 * `` `completeTaskPlan` → `completeExecution` (`src/lib/actions.js`) `` — is NOT
 * a caller: the backtick between the name and the paren means it is a citation,
 * not a call. This is the exact completeExecution distinction: it is named only
 * as a bare token, so it stays credited by its intra-file code edge alone and
 * dies the instant that edge is cut.
 *
 * (R4-B credited "any identifier inside a fenced block", which buried 24
 * genuinely-reachable inline-recipe exports as DEAD, including the Gate-3 gate.
 * R4-C replaces fenced-block membership with call syntax.)
 *
 * @param {string} projectRoot
 * @returns {Set<string>} names invoked (or require-referenced) by a surface
 */
function surfaceCalledNames(projectRoot) {
  const surfaceFiles = collectSurfaceFiles(projectRoot);
  const names = new Set();
  const scan = (text, re, group) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) names.add(m[group]);
  };
  for (const surface of surfaceFiles) {
    let text = '';
    try { text = safeFs.readFileSync(surface, 'utf8'); } catch { continue; }
    scan(text, SURFACE_CALL_RE, 1);
    scan(text, SURFACE_REQUIRE_DOT_RE, 1);
    scan(text, SURFACE_REQUIRE_IDX_RE, 1);
  }
  return names;
}

/**
 * The comment-stripped source with its `module.exports` DECLARATIONS removed, so
 * an export name's remaining occurrences are its real definition and its real
 * intra-module CALL sites — never the plumbing that lists it for export. Used to
 * decide intra-file liveness: an export named ≥2× here (its definition plus at
 * least one internal call) is genuinely used inside its own live module.
 *
 * @param {string} code - already comment-stripped source
 * @returns {string}
 */
function stripExportDecls(code) {
  let s = code.replace(/module\.exports\s*=\s*\{[\s\S]*?\}\s*;?/, ' ');
  s = s.replace(/(?:module\.)?exports\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/g, ' = ');
  return s;
}

/**
 * The names a module exports, per the three CommonJS forms in this codebase.
 *
 * Parses the COMMENT-STRIPPED source: a documented EXAMPLE of an export
 * (`module.exports = { a, b }` in a header comment) is not an export, and reading
 * it as one hid every real export of the file behind a phantom `a`.
 *
 * @param {string} source - the module source (comments included; stripped here)
 * @returns {string[]} exported names (deduped, source order)
 */
function exportedNames(source) {
  const content = stripComments(source);
  const names = new Set();

  // Form 1: module.exports = { a, b: impl, c };
  // BOTH shapes must parse: the multi-line block AND the single-line
  // `module.exports = { a, b };`. Matching only the multi-line form made the fence
  // silently blind to every single-line-exporting module (it reported zero exports
  // for them — a false green, the exact failure mode this file exists to kill).
  const objMatch = content.match(/module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?/);
  if (objMatch) {
    // Split on newlines AND commas so a single-line list yields one entry per name.
    for (const rawEntry of objMatch[1].split(/[\n,]/)) {
      const entry = rawEntry.trim();
      if (entry.length === 0) continue;
      const m = entry.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::|$)/);
      if (m) names.add(m[1]);
    }
  }

  // Forms 2 + 3: module.exports.a = … / exports.a = …
  const propRe = /(?:module\.)?exports\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
  let m;
  while ((m = propRe.exec(content)) !== null) names.add(m[1]);

  return [...names];
}

/**
 * Exports explicitly DECLARED as entry points in `.ctoc/reachability-roots.json`
 * (`{"exports": ["src/lib/x.js#name", …]}`) — the deliberate, reviewable escape
 * hatch, mirroring the file fence's declared roots.
 *
 * @param {string} projectRoot
 * @returns {Set<string>} declared `rel#name` keys
 */
function declaredExportRoots(projectRoot) {
  const out = new Set();
  const rootsFile = path.join(projectRoot, ROOTS_FILE);
  if (!safeFs.existsSync(rootsFile)) return out;
  try {
    const parsed = JSON.parse(safeFs.readFileSync(rootsFile, 'utf8'));
    const list = (parsed && Array.isArray(parsed.exports)) ? parsed.exports : [];
    for (const e of list) if (typeof e === 'string') out.add(e);
  } catch { /* malformed → no declared export roots; the ratchet still holds */ }
  return out;
}

/**
 * Compute dead exports: exported names, inside LIVE (file-reachable) modules, that
 * no other live module and no instruction surface ever names.
 *
 * A dead export inside an ALREADY-DEAD file is not reported here — that file is the
 * file fence's business, and reporting both would double-count the same defect.
 *
 * @param {string} projectRoot - absolute project root
 * @returns {{ totalModules: number, totalExports: number, live: string[],
 *   dead: string[], sources: string[] }} `live`/`dead` are `src/rel/path.js#name`
 *   keys (sorted); `sources` are the project-relative usage sources consulted.
 */
function analyzeExports(projectRoot) {
  const { reachable } = analyze(projectRoot);
  const rel2abs = (r) => path.join(projectRoot, ...r.split('/'));
  const liveFiles = reachable.map(rel2abs);

  // 1. Read every live module once: its exported names, its identifier tokens, and
  //    the set of its OWN exports it calls internally. Tokens and counts come from
  //    the COMMENT-STRIPPED source — a comment is not a caller.
  const exportsByFile = new Map();     // abs → string[]
  const tokensByFile = new Map();      // abs → Set<string>
  const internalUseByFile = new Map(); // abs → Set<string> (exports called inside their own file)
  for (const file of liveFiles) {
    // Fail loud, same reason as the file fence: `analyze` just read this exact
    // file successfully, so a failure here is a broken instrument. Reading it as
    // "" would report ZERO exports for the module — an under-report the ratchet
    // would then absorb as progress.
    const content = readOrThrow(file, projectRoot, 'live module');
    const names = exportedNames(content);
    exportsByFile.set(file, names);
    const code = stripComments(content);
    const toks = new Set();
    let m;
    IDENT_RE.lastIndex = 0;
    while ((m = IDENT_RE.exec(code)) !== null) toks.add(m[0]);
    tokensByFile.set(file, toks);
    // Intra-file usage: count occurrences in the export-declaration-stripped code.
    // An export named ≥2× (its definition + ≥1 real internal call) is used inside
    // its own live module — the completeExecution edge: menu-screens calls the
    // externally-visible completeTaskPlan, which calls completeExecution here.
    const body = stripExportDecls(code);
    const counts = new Map();
    IDENT_RE.lastIndex = 0;
    let bm;
    while ((bm = IDENT_RE.exec(body)) !== null) counts.set(bm[0], (counts.get(bm[0]) || 0) + 1);
    const iu = new Set();
    for (const name of names) if ((counts.get(name) || 0) >= 2) iu.add(name);
    internalUseByFile.set(file, iu);
  }

  // 2. name → the set of live modules that MENTION it (the usage index).
  const mentionedIn = new Map(); // name → Set<abs>
  for (const [file, toks] of tokensByFile) {
    for (const t of toks) {
      let set = mentionedIn.get(t);
      if (!set) { set = new Set(); mentionedIn.set(t, set); }
      set.add(file);
    }
  }

  // 3. Instruction surfaces: a name a shipped instruction tells the session to call
  //    is reachable — but ONLY when the surface CALLS it (`name(` or
  //    require('…').name), never when it merely names it in prose. A backtick
  //    code-span that just cites the function is documentation, not a caller.
  //    This credits CTOC's inline-code recipes while still burying prose-only
  //    tokens like completeExecution (see surfaceCalledNames).
  const surfaceTokens = surfaceCalledNames(projectRoot);
  const surfaceFiles = collectSurfaceFiles(projectRoot);

  const declared = declaredExportRoots(projectRoot);

  // 4. Classify. A name is LIVE iff any of: another LIVE module names it in code;
  //    it is called INSIDE its own live module (definition + ≥1 real call); a
  //    FENCED instruction-surface recipe invokes it; or it is a declared export
  //    root. Tests are not in `liveFiles` at all — a test is never a caller.
  const live = [];
  const dead = [];
  let totalExports = 0;
  for (const file of liveFiles) {
    const rel = path.relative(projectRoot, file).split(path.sep).join('/');
    const internal = internalUseByFile.get(file) || new Set();
    for (const name of exportsByFile.get(file) || []) {
      totalExports++;
      const key = `${rel}#${name}`;
      const others = mentionedIn.get(name);
      const usedElsewhere = others != null && [...others].some((f) => f !== file);
      const usedInternally = internal.has(name);
      if (usedElsewhere || usedInternally || surfaceTokens.has(name) || declared.has(key)) live.push(key);
      else dead.push(key);
    }
  }

  const relOf = (f) => path.relative(projectRoot, f).split(path.sep).join('/');
  return {
    totalModules: liveFiles.length,
    totalExports,
    live: live.sort(),
    dead: dead.sort(),
    sources: [...liveFiles.map(relOf), ...surfaceFiles.map(relOf)].sort()
  };
}

// `exportedNames`, `collectSurfaceFiles` and `stripComments` are deliberately NOT
// exported: they are internals of the two fences, and exporting them "so a test can
// unit-test them" would mint dead exports on the very day the dead-export fence
// shipped. They are exercised through `analyze` / `analyzeExports`, the way a caller
// reaches them.
module.exports = {
  analyze,
  analyzeExports,
  liveRoots,
  edgesFrom,
  resolveRequire,
  collectJsFiles,
  SANCTIONED_SCRIPT_ROOTS,
  ROOTS_FILE
};

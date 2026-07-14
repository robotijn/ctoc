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
 *   5. INSTRUCTION-SURFACE roots: any src/ file explicitly named in shipped
 *      executable instructions — src/commands/*.md, agents' markdown, skills'
 *      SKILL.md, or a CI workflow. In CTOC's architecture the session model
 *      executes what those surfaces instruct (node -e requires, spawned
 *      scripts), so a file named there is genuinely reachable by a human's
 *      session. A file named NOWHERE — no code edge, no instruction — is dead.
 *
 * A TEST IS NEVER A ROOT. That is the whole point.
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
 * Extract every outbound edge from one file: static `require('./x')`, the
 * codebase's lazy `req('./x')` alias, and path literals naming another src file
 * (a hook or command spawned by path, e.g. `node ".../src/commands/menu.js"`).
 *
 * @param {string} file - absolute path
 * @param {string[]} allFiles - absolute paths of every src file (for path-literal matching)
 * @returns {Set<string>} absolute paths this file reaches directly
 */
function edgesFrom(file, allFiles) {
  const out = new Set();
  let content;
  try {
    content = safeFs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }

  // require('./x') and the lazy req('./x') alias used across the codebase.
  const requirePattern = /(?:require|req)\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = requirePattern.exec(content)) !== null) {
    const target = resolveRequire(file, match[1]);
    if (target) out.add(target);
  }

  // Path literals naming another src file — how hooks.json and the update/menu
  // scripts reference siblings they SPAWN rather than require.
  const literalPattern = /['"]([^'"]*\.js)['"]/g;
  const selfBase = path.basename(file);
  while ((match = literalPattern.exec(content)) !== null) {
    const base = path.basename(match[1]);
    if (base === selfBase) continue;
    for (const candidate of allFiles) {
      if (path.basename(candidate) === base) out.add(candidate);
    }
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

/**
 * Resolve the live roots for a project.
 *
 * @param {string} projectRoot - absolute project root
 * @param {string[]} allFiles - absolute paths of every src file
 * @returns {{ roots: string[], declared: string[] }} absolute root paths, and the
 *   subset that came from the declared-roots escape hatch.
 */
function liveRoots(projectRoot, allFiles) {
  const roots = new Set();

  // 1. Hooks registered in the plugin manifest — the real runtime entry points.
  const manifest = path.join(projectRoot, HOOKS_MANIFEST);
  if (safeFs.existsSync(manifest)) {
    let raw = '';
    try { raw = safeFs.readFileSync(manifest, 'utf8'); } catch { raw = ''; }
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
    try { text = safeFs.readFileSync(surface, 'utf8'); } catch { continue; }
    // Match explicit src/... .js path mentions — a shipped instruction naming
    // the file. Basename-only mentions do NOT count (too weak to be a root).
    const mention = /src\/[A-Za-z0-9_\-/.]+\.js/g;
    let m;
    while ((m = mention.exec(text)) !== null) {
      const hit = byRel.get(m[0]);
      if (hit) roots.add(hit);
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
 * @param {string} projectRoot - absolute project root
 * @returns {{ total: number, reachable: string[], unreachable: string[], roots: string[] }}
 *   `reachable`/`unreachable`/`roots` are project-relative POSIX paths, sorted.
 */
function analyze(projectRoot) {
  const srcDir = path.join(projectRoot, 'src');
  const allFiles = collectJsFiles(srcDir);
  const { roots } = liveRoots(projectRoot, allFiles);

  const graph = new Map();
  for (const file of allFiles) graph.set(file, edgesFrom(file, allFiles));

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
    roots: roots.map(rel).sort()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE EXPORT FENCE — dead exports inside live files.
//
// HONEST LIMITS (no AST, by design — zero new dependencies, O(files)):
//   • Export detection is regex over the three CommonJS forms this codebase uses:
//     `module.exports = { a, b }`, `module.exports.a = …`, `exports.a = …`.
//     A lazily-defined export (e.g. Object.defineProperties on `exports`) is not
//     detected and therefore never accused — a MISS, never a false alarm.
//   • Usage detection is name-based: an export is LIVE when its name appears as an
//     identifier token in ANOTHER live module, or in a shipped instruction surface.
//     So a common name shared with an unrelated identifier (e.g. `load`, `analyze`)
//     reads as live even if this particular one is not called.
//
// Both limits bias the SAME way: the fence under-reports, never over-reports. It
// cannot cry wolf, and everything it does catch is genuinely uncalled. That is the
// right bias for a gate that fails a build.
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
 * A small state machine (code / line-comment / block-comment / '…' / "…" / `…`)
 * with escape handling. Regex literals need no state of their own: a comment can
 * only start with `//` or `/*`, and no valid regex literal starts with `/` or `*`.
 *
 * @param {string} src
 * @returns {string} the source with comment bodies replaced by spaces
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code';
  while (i < n) {
    const c = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && next === '*') { state = 'block'; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; out += c; i++; continue; }
      out += c; i++; continue;
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
    // inside a string/template: copy through, honoring escapes
    if (c === '\\') { out += c + next; i += 2; continue; }
    if (c === state) { state = 'code'; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
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

  // 1. Read every live module once: its exported names + its identifier tokens.
  //    Tokens come from the COMMENT-STRIPPED source — a comment is not a caller.
  const exportsByFile = new Map(); // abs → string[]
  const tokensByFile = new Map();  // abs → Set<string>
  for (const file of liveFiles) {
    let content = '';
    try { content = safeFs.readFileSync(file, 'utf8'); } catch { content = ''; }
    exportsByFile.set(file, exportedNames(content));
    const code = stripComments(content);
    const toks = new Set();
    let m;
    IDENT_RE.lastIndex = 0;
    while ((m = IDENT_RE.exec(code)) !== null) toks.add(m[0]);
    tokensByFile.set(file, toks);
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
  //    is reachable by a human's session (same rule the file fence honors).
  const surfaceFiles = collectSurfaceFiles(projectRoot);
  const surfaceTokens = new Set();
  for (const surface of surfaceFiles) {
    let text = '';
    try { text = safeFs.readFileSync(surface, 'utf8'); } catch { continue; }
    let m;
    IDENT_RE.lastIndex = 0;
    while ((m = IDENT_RE.exec(text)) !== null) surfaceTokens.add(m[0]);
  }

  const declared = declaredExportRoots(projectRoot);

  // 4. Classify. A name is live iff another LIVE module mentions it, an instruction
  //    surface mentions it, or it is a declared export root. Self-mention never
  //    counts (a module calling its own function is not a caller from outside), and
  //    tests are not in `liveFiles` at all.
  const live = [];
  const dead = [];
  let totalExports = 0;
  for (const file of liveFiles) {
    const rel = path.relative(projectRoot, file).split(path.sep).join('/');
    for (const name of exportsByFile.get(file) || []) {
      totalExports++;
      const key = `${rel}#${name}`;
      const others = mentionedIn.get(name);
      const usedElsewhere = others != null && [...others].some((f) => f !== file);
      if (usedElsewhere || surfaceTokens.has(name) || declared.has(key)) live.push(key);
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

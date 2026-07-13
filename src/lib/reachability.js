'use strict';

/**
 * Reachability analysis over src/ — the dead-code fence.
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

module.exports = { analyze, liveRoots, edgesFrom, resolveRequire, collectJsFiles, SANCTIONED_SCRIPT_ROOTS, ROOTS_FILE };

'use strict';

/**
 * doc-counts.js — the ONE source of truth for CLAUDE.md's component counts.
 *
 * A count in CLAUDE.md is one of two things (plan 00215):
 *   - a GROWING tally (test files, src/lib modules, agents, skills) that rises
 *     with normal work — these are GENERATED into CLAUDE.md by release.js, so no
 *     human or executor ever hand-edits them and a test-first build never has to
 *     touch a doc line it did not declare; and
 *   - a FIXED contract (slash commands, hooks, tabs) that changes rarely and
 *     meaningfully — these stay policed by exact-equality tests.
 *
 * `computeDocCounts` returns the live value for every one of them by walking disk
 * EXACTLY as the independent oracles in tests/doc-counts.test.js and
 * tests/readme-numbers.test.js do (like-with-like). It is pure, writes nothing,
 * and never throws on a normal tree: a missing directory yields 0, mirroring the
 * existing helpers, so it is safe to run against a bare fixture root.
 *
 * WIRING: release.js requires this module and calls computeDocCounts to rewrite
 * the growing-count lines in CLAUDE.md; the two count tests import it to police
 * the generator. It is reachable from the release.js sanctioned root.
 */

const safeFs = require('./safe-fs');
const path = require('node:path');

/**
 * Names of files in a flat directory ending with `suffix`. Absent dir → [].
 *
 * @param {string} root
 * @param {string[]} segments - path segments under `root`
 * @param {string} suffix
 * @returns {string[]}
 */
function listFlat(root, segments, suffix) {
  const full = path.join(root, ...segments);
  if (!safeFs.existsSync(full)) return [];
  return safeFs.readdirSync(full).filter((f) => f.endsWith(suffix));
}

/**
 * Recursively collect files under `dir` for which `keep(fullPath)` is true.
 * Absent dir → []. Directories are descended; files are tested by `keep`.
 *
 * @param {string} dir
 * @param {(fullPath: string) => boolean} keep
 * @returns {string[]}
 */
function walkFiles(dir, keep) {
  const acc = [];
  if (!safeFs.existsSync(dir)) return acc;
  for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) acc.push(...walkFiles(full, keep));
    else if (keep(full)) acc.push(full);
  }
  return acc;
}

/**
 * Compute the live component counts for a CTOC project tree.
 *
 * @param {string} root - project root
 * @returns {{
 *   testFiles: number, libModules: number, hooks: number, tabs: number,
 *   agents: number, skills: number, slashCommands: number
 * }}
 */
function computeDocCounts(root) {
  // Real agent definitions only: any path segment starting with "_" (e.g.
  // agents/_shared/*) is prose fragments, not agents — excluded so the count
  // compares like-with-like against the documented "agent definitions". This is
  // a superset of readme-numbers.test.js's _shared-only exclusion; today no
  // _-prefixed agent dir exists, so both agree.
  const agents = walkFiles(path.join(root, 'agents'), (p) => {
    if (!p.endsWith('.md')) return false;
    return !path.relative(root, p).split(path.sep).some((seg) => seg.startsWith('_'));
  }).length;

  const skills = walkFiles(path.join(root, 'skills'), (p) => p.endsWith('.md')).length;

  return {
    testFiles: listFlat(root, ['tests'], '.test.js').length,
    libModules: listFlat(root, ['src', 'lib'], '.js').length,
    hooks: listFlat(root, ['src', 'hooks'], '.js').length,
    tabs: listFlat(root, ['src', 'tabs'], '.js').length,
    agents,
    skills,
    slashCommands: listFlat(root, ['src', 'commands'], '.md').length,
  };
}

module.exports = { computeDocCounts };

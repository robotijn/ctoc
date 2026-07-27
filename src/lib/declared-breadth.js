'use strict';

/**
 * DECLARED BREADTH — "how wide is this plan's `files:` declaration?"
 *
 * A plan's `files:` list IS the write permission an approval grants. This module is
 * the ONE encoding of how broad that grant is, so the number a human is SHOWN at the
 * gate (via streaming-gate.renderDeclaredScope) and the rule 00126 will ENFORCE on
 * the hook path cannot disagree — they are the same functions.
 *
 * ── TWO HALVES, AND THE SPLIT IS LOAD-BEARING ──────────────────────────────────
 *   isAnchored(glob)        PURE — no filesystem, no I/O, never throws.
 *   countMatching(...)      I/O — walks the tree ONCE. NEVER on the hook path.
 *
 * The asymmetry is deliberate and must be preserved. 00126 will call `isAnchored`
 * from the PreToolUse enforcement hook, which runs on EVERY edit:
 *   - a filesystem read there is a per-edit latency defect, and
 *   - a throw there reaches PreToolUse.Edit.js's fail-OPEN catch and becomes an
 *     ALLOW — a permission check whose failure mode is "permission granted".
 * So `isAnchored` is written PURE and TOTAL from birth. `countMatching` reads the
 * tree and is only ever called while a human waits at a decision screen — never on
 * an edit. Do not move I/O into `isAnchored`, and do not put `countMatching` on any
 * hot path.
 *
 * Deliberately NOT here yet: `hasUnanchoredAcknowledgement` / `REFUSAL_REASON`. Those
 * are the ENFORCEMENT half and belong to 00126 (which declares `depends_on: 00127`
 * and adds them to THIS module). A module carrying an unused refusal token invites
 * the next reader to wire it up without the human's decision — so it is left out.
 *
 * ── The walk's rules (each a documented constant, not a scattered condition) ────
 *   - SKIPS `.git`, `node_modules` (by name) and `.ctoc/state` (by relative path):
 *     churn, none of it a file a human judges when weighing scope.
 *   - DOES NOT follow symbolic links. A link is counted as ONE leaf and never
 *     descended into. Two reasons: a link loop would hang the human's screen, and an
 *     in-repository link can point OUTSIDE the repository (00128), so descending one
 *     would report files that are not in this project.
 *   - BOUNDED at `maxEntries` (default 20,000). On reaching the cap the walk stops
 *     and reports NO number (`total: null`, `capped: true`): a count from a truncated
 *     walk is the truncate-then-parse false-green defect this repository fences.
 *   - A count is a SNAPSHOT at approval time. Files created later are matched by the
 *     same glob and were never counted; the count aids judgement at the moment of
 *     choosing, it is not a guarantee about the future.
 *
 * Cross-platform: path.posix normalization on globs (a Windows-authored `src\**` is
 * judged identically to `src/**`), path.join for tree paths.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { globToRegex } = require('./plan-coverage');

// The walk's skip set. `.git`/`node_modules` are matched by directory NAME at any
// depth; `.ctoc/state` is matched by its repository-relative PATH (its churn, not the
// whole of `.ctoc`, is what a human need not see).
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules']);
const SKIP_REL_PATHS = new Set(['.ctoc/state']);

// The walk is bounded so opening a decision can never hang or crawl. 20,000 entries
// covers this repository's real tree many times over; beyond it, an honest
// "not counted" beats a number derived from a truncated input.
const DEFAULT_MAX_ENTRIES = 20000;

/**
 * Whether a glob is ANCHORED — its first path segment names a real directory rather
 * than a wildcard, so the grant is rooted somewhere specific instead of at the
 * repository root.
 *
 * true iff `glob` is a non-empty string whose FIRST `/`-separated segment contains
 * neither `*` nor `?`. Evaluated on the SAME normalized form the coverage scan uses
 * (backslashes → forward slashes, then `path.posix.normalize`), so `src\**` and
 * `./src/**` both judge like `src/**`. Non-string, empty, or a leading empty segment
 * (`/x`) → false.
 *
 * PURE. NO I/O. NEVER THROWS. (00126 calls this on the enforcement hook path.)
 *
 * @param {*} glob
 * @returns {boolean}
 */
function isAnchored(glob) {
  if (typeof glob !== 'string' || glob.length === 0) return false;
  const norm = path.posix.normalize(glob.replace(/\\/g, '/'));
  const first = norm.split('/')[0];
  if (first === '') return false;
  return !first.includes('*') && !first.includes('?');
}

/**
 * Walk the tree once from `root`, counting how many real files each declared glob
 * matches (and, as a union, the total distinct files any glob grants).
 *
 * Uses `plan-coverage.globToRegex` — the SAME audited matcher the enforcement hook
 * trusts — so the number shown is the number that will be granted. No second glob
 * implementation. Globs are normalized exactly as the coverage scan normalizes them.
 *
 * NEVER THROWS. A mid-walk unreadable directory is skipped; a fault reading the root
 * itself returns `total: null, walked: 0`. A capped walk returns `total: null,
 * capped: true` and null per-glob counts — a partial count is a lie, so none is given.
 *
 * @param {string[]} globs declared `files:` entries
 * @param {string} root repository root to walk
 * @param {{ maxEntries?: number }} [opts]
 * @returns {{ perGlob: Array<{glob:string,count:(number|null),anchored:boolean,capped:boolean}>, total:(number|null), capped:boolean, walked:number }}
 */
function countMatching(globs, root, opts) {
  const maxEntries = opts && Number.isInteger(opts.maxEntries) && opts.maxEntries > 0
    ? opts.maxEntries
    : DEFAULT_MAX_ENTRIES;

  const list = Array.isArray(globs) ? globs.filter((g) => typeof g === 'string' && g.length > 0) : [];
  const matchers = list.map((glob) => {
    const norm = path.posix.normalize(glob.replace(/\\/g, '/'));
    return { glob, re: globToRegex(norm), anchored: isAnchored(glob), count: 0 };
  });

  let walked = 0;
  let total = 0;
  let capped = false;
  let faulted = false;

  function walk(dir) {
    if (capped || faulted) return;
    let ents;
    try {
      ents = safeFs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // A fault reading the ROOT is a top-level fault (no number); a fault on any
      // sub-directory is skipped and counted in neither direction.
      if (dir === root) faulted = true;
      return;
    }
    for (const e of ents) {
      if (capped || faulted) return;
      walked += 1;
      if (walked > maxEntries) { capped = true; return; }
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      // A symbolic link is a LEAF: counted once, never descended into.
      if (!e.isSymbolicLink() && e.isDirectory()) {
        if (SKIP_DIR_NAMES.has(e.name)) continue;
        if (SKIP_REL_PATHS.has(rel)) continue;
        walk(full);
      } else {
        let matchedAny = false;
        for (const m of matchers) {
          if (m.re.test(rel)) { m.count += 1; matchedAny = true; }
        }
        if (matchedAny) total += 1;
      }
    }
  }

  walk(root);

  if (faulted) {
    return {
      perGlob: matchers.map((m) => ({ glob: m.glob, count: null, anchored: m.anchored, capped: false })),
      total: null,
      capped: false,
      walked: 0,
    };
  }
  if (capped) {
    return {
      perGlob: matchers.map((m) => ({ glob: m.glob, count: null, anchored: m.anchored, capped: true })),
      total: null,
      capped: true,
      walked,
    };
  }
  return {
    perGlob: matchers.map((m) => ({ glob: m.glob, count: m.count, anchored: m.anchored, capped: false })),
    total,
    capped: false,
    walked,
  };
}

module.exports = { isAnchored, countMatching };

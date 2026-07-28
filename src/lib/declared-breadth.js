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
 * ── THE ENFORCEMENT HALF (00126) ───────────────────────────────────────────────
 *   REFUSAL_REASON                     the fixed denial token, ONE spelling.
 *   hasUnanchoredAcknowledgement(...)  PURE — reads the plan's frontmatter, no I/O
 *                                      on the tree, never throws.
 *
 * ANCHORING, NOT A COUNT, IS THE ENFORCEMENT RULE. A share-of-repository threshold
 * would have to walk the tree on the every-edit hook path (a per-edit latency
 * defect) and its verdict would drift as unrelated files appear (a permission whose
 * answer changes with an unrelated `git pull` cannot be reasoned about). `isAnchored`
 * is a deterministic string scan of the first path segment — that is why the guard
 * `00126` adds to `plan-coverage.scanForCoverage` calls THIS half and never
 * `countMatching`, which reads the tree and must stay off the hook path.
 *
 * WHY THE ACKNOWLEDGEMENT IS UNFORGEABLE. `approval-ledger.computeSpecHash` digests
 * the FULL leading frontmatter, so adding `unanchored_scope` after approval breaks
 * the specification hash and the plan grants nothing at all — an agent cannot mint
 * the acknowledgement for itself. It is meaningful only because `00127` renders the
 * declared scope at the gate and marks an unanchored entry in words, so the human
 * consenting has actually SEEN what they consent to (the reason `00126` depends on
 * `00127`).
 *
 * FAIL-CLOSED INVERSION: this module must NEVER throw, because the hook's catch
 * (`PreToolUse.Edit.js`) fails OPEN — a throw there becomes an ALLOW. So an absent
 * or unreadable acknowledgement is `false` (the refusing direction), never a crash.
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
 * The ONE spelling of the denial reason recorded when an unanchored declaration is
 * refused. Exported so the coverage guard, the severity table and the tests all
 * share it and can never drift apart.
 * @type {string}
 */
const REFUSAL_REASON = 'unanchored-declaration';

/**
 * Whether a plan's own frontmatter carries a non-empty `unanchored_scope`
 * acknowledgement — the human's out-loud statement that this plan's file list is
 * rooted at the repository.
 *
 * Reads the SAME multi-block leading-frontmatter union that `plan-coverage`'s
 * `parsePlanFiles` reads `files:` from — `stale-detector.extractFrontmatterRegion`,
 * falling back to `frontmatter.parseFrontmatter` — so a prepended approval-marker
 * block cannot hide the key and a CRLF plan reads identically. The key must be a
 * TOP-LEVEL frontmatter key (column 0) with a non-empty value.
 *
 * PURE. NO tree I/O. NEVER THROWS. Any fault → `false` (an absent acknowledgement is
 * the refusing direction; a throw here would reach the hook's fail-OPEN catch and
 * become an ALLOW).
 *
 * @param {*} content the plan's full file text
 * @returns {boolean}
 */
function hasUnanchoredAcknowledgement(content) {
  try {
    if (typeof content !== 'string' || content.length === 0) return false;
    let region = '';
    try {
      // Lazy-require mirrors parsePlanFiles: no cycle today, and the lazy edge keeps
      // this module loadable on the hook path even if stale-detector's deps grow.
      const { extractFrontmatterRegion } = require('./stale-detector');
      const r = extractFrontmatterRegion(content);
      if (typeof r === 'string' && r.length > 0) region = r;
    } catch {
      region = '';
    }
    if (region === '') {
      const { parseFrontmatter } = require('./frontmatter');
      const pf = parseFrontmatter(content);
      if (!pf.hasFrontmatter) return false;
      region = pf.raw;
    }
    for (const line of region.split('\n')) {
      const m = line.match(/^unanchored_scope:\s*(.*)$/);
      if (m) {
        const value = m[1].trim().replace(/^["']|["']$/g, '').trim();
        if (value.length > 0) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
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

module.exports = { isAnchored, countMatching, hasUnanchoredAcknowledgement, REFUSAL_REASON };

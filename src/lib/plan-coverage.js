/**
 * Plan Coverage (C1 / CTOC v7)
 *
 * Determines whether an edit target is covered by an active plan. Used by
 * the PreToolUse enforcement hook to allow edits that are part of declared
 * plan work, and block edits that aren't.
 *
 * Plans declare their files in YAML frontmatter:
 *   files:
 *     - "src/lib/foo.js"
 *     - "tests/foo.test.js"
 *     - "src/areas/**"
 *
 * Glob support (minimatch-style):
 *   *   matches any chars except /
 *   **  matches any chars including /
 *   ?   matches single char except /
 *   everything else is literal
 *
 * Stage priority (per I11): in-progress > todo > implementation.
 * Within a stage, the most-specific glob wins.
 *
 * X1: pre-v7 plans (no `files:` declaration AND no `program: ctoc-v7`) are
 * treated warn-only — they never match, so the hook falls through to the
 * escape-phrase check.
 */

const safeFs = require('./safe-fs');
const { parseFrontmatter } = require('./frontmatter');
const path = require('path');

const STAGE_PRIORITY = ['in-progress', 'todo', 'implementation'];

/**
 * @typedef {{ k: 'lit', c: string } | { k: 'one' } | { k: 'star' } | { k: 'globstar' }} GlobToken
 */

/**
 * Tokenize a glob into a flat token list, mirroring EXACTLY the segment
 * semantics the enforcement hook has always used:
 *   **  → globstar  (matches any run of chars, INCLUDING `/`); a `/` immediately
 *        following the `**` is CONSUMED, so a `**`-then-slash before `b` also
 *        matches with zero middle segments (`a/b`) and a leading globstar-slash
 *        matches a root-level file.
 *   *   → star      (matches a run of chars EXCEPT `/` — within one path segment)
 *   ?   → one       (matches exactly one char except `/`)
 *   c   → lit(c)    (matches the literal char c — no metacharacter meaning)
 *
 * @param {string} glob
 * @returns {GlobToken[]}
 */
function tokenizeGlob(glob) {
  const g = typeof glob === 'string' ? glob : '';
  const tokens = [];
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        tokens.push({ k: 'globstar' });
        i += 2;
        if (g[i] === '/') i += 1; // consume trailing slash so "**/x" matches "x"
      } else {
        tokens.push({ k: 'star' });
        i += 1;
      }
    } else if (c === '?') {
      tokens.push({ k: 'one' });
      i += 1;
    } else {
      tokens.push({ k: 'lit', c });
      i += 1;
    }
  }
  return /** @type {GlobToken[]} */ (tokens);
}

/**
 * Linear-time glob match. Replaces the former glob→RegExp→`.test()` path, whose
 * emitted pattern (`[^/]*` / `.*` alternating with literals the wildcard could
 * ALSO match — e.g. `*a*a*a…` → `^([^/]*a)+$`) was a catastrophic-backtracking
 * ReDoS. That pattern is `.test()`-ed on EVERY file edit by the PreToolUse
 * enforcement hook against an author-controlled plan `files:` entry (an
 * in-model taint source), and a crafted glob took seconds-to-forever on a
 * pathological target — stalling every edit in the project (the hook fails OPEN
 * only on a THROWN error; a HANG is neither an error nor time-bounded).
 *
 * This is a bottom-up dynamic program with NO backtracking, so match cost is
 * bounded by O(tokens × chars) regardless of glob shape. Semantics are
 * byte-for-byte identical to the old regex:
 *   lit(c)   ↔ literal c         star     ↔ [^/]*
 *   one      ↔ [^/]              globstar ↔ .*
 * and the whole input must match (full `^…$` anchoring). A rolling single-star
 * backtrack pointer is INSUFFICIENT here — a segment-bounded `*` after a
 * `/`-crossing `**` needs the earlier `**` to be able to absorb a `/` — so the
 * full DP (not the O(1)-space greedy) is required for correctness.
 *
 * @param {GlobToken[]} tokens
 * @param {*} input - coerced to string, matching RegExp.prototype.test semantics
 * @returns {boolean}
 */
function matchTokens(tokens, input) {
  const s = typeof input === 'string' ? input : String(input);
  const n = s.length;
  const m = tokens.length;
  // prev[j] === true  ⇔  tokens[0..i-1] match the input prefix s[0..j-1].
  let prev = new Array(n + 1).fill(false);
  prev[0] = true; // empty token list matches the empty prefix
  for (let i = 1; i <= m; i += 1) {
    const tok = tokens[i - 1];
    const cur = new Array(n + 1).fill(false);
    if (tok.k === 'star' || tok.k === 'globstar') {
      const crossesSlash = tok.k === 'globstar';
      for (let j = 0; j <= n; j += 1) {
        // Star matches empty here (inherit prev[j]), OR absorbs one more input
        // char (extend cur[j-1]) provided the char is permitted by this star.
        let v = prev[j];
        if (!v && j > 0 && cur[j - 1]) {
          const ch = s[j - 1];
          if (crossesSlash || ch !== '/') v = true;
        }
        cur[j] = v;
      }
    } else {
      // lit / one consume EXACTLY one input char.
      for (let j = 1; j <= n; j += 1) {
        if (!prev[j - 1]) continue;
        const ch = s[j - 1];
        if (tok.k === 'one') {
          if (ch !== '/') cur[j] = true;
        } else if (ch === tok.c) {
          cur[j] = true;
        }
      }
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Compile a glob into a linear-time matcher. Named `globToRegex` for backward
 * compatibility — every caller (this module's `touchesOverlap` and
 * `findCoveringPlan`, plus `plan-index/conflict-detect.js` and
 * `hooks/PreToolUse.Write.js`) uses ONLY the returned object's `.test(str)`,
 * which is contract-compatible with `RegExp.prototype.test` but backed by the
 * ReDoS-immune dynamic program above. Never throws for any input (tokenize and
 * match are total functions), so the safety-oracle catch in `touchesOverlap`
 * stays correct as documented-unreachable defense in depth.
 *
 * @param {string} glob
 * @returns {{ test: (input: *) => boolean, glob: string }}
 */
function globToRegex(glob) {
  const tokens = tokenizeGlob(glob);
  return {
    glob: typeof glob === 'string' ? glob : '',
    test(input) {
      return matchTokens(tokens, input);
    },
  };
}

/**
 * Whether two lists of path globs/literals OVERLAP — true iff some entry on one
 * side matches some entry on the other. For each pair `(a, b)` they overlap when
 * they are string-equal, OR a glob on EITHER side matches the other side treated
 * as a literal (`globToRegex(a).test(b) || globToRegex(b).test(a)`). This is the
 * same bidirectional predicate shipped in `src/lib/plan-index/conflict-detect.js`,
 * built on the SAME audited `globToRegex` the enforcement hook trusts — no new
 * copy of glob logic.
 *
 * Unlike conflict-detect's advisory `filesOverlap` (which fails open to "no
 * overlap"), this predicate backs the scheduler's file-conflict safety oracle, so
 * a `globToRegex` that throws on a pathological entry is treated CONSERVATIVELY as
 * an overlap (block), never silently as "safe to run concurrently".
 *
 * @param {string[]} aList - path globs or literal paths
 * @param {string[]} bList - path globs or literal paths
 * @returns {boolean} true iff any (a, b) pair overlaps
 */
function touchesOverlap(aList, bList) {
  if (!Array.isArray(aList) || !Array.isArray(bList)) return false;
  if (aList.length === 0 || bList.length === 0) return false;
  for (const a of aList) {
    if (typeof a !== 'string' || a.length === 0) continue;
    for (const b of bList) {
      if (typeof b !== 'string' || b.length === 0) continue;
      if (a === b) return true;
      try {
        if (globToRegex(a).test(b) || globToRegex(b).test(a)) return true;
      } catch {
        // A pathological glob must not false-safe a safety oracle → block.
        return true;
      }
    }
  }
  return false;
}

/**
 * Read a plan's `files:` declaration as an array of globs.
 * Returns [] for plans without a `files:` block.
 *
 * @param {string} planPath
 * @returns {string[]}
 */
function readPlanFiles(planPath) {
  let content;
  try { content = safeFs.readFileSync(planPath, 'utf8'); } catch { return []; }

  // Read the UNION of every LEADING `---…---` block, not just the first.
  //
  // `addApprovalMarker` (actions.js) PREPENDS a marker block on each human-gate
  // crossing, so a plan that crossed Gate 2 arrives in `todo/` with the marker
  // FIRST and its own frontmatter — the block that carries `files:` — SECOND
  // (a multi-gate plan carries three or four blocks). The single-block reader
  // found no `files:` in the marker and resolved such a plan to EMPTY coverage,
  // which made the enforcement hook BLOCK the implementer from editing the very
  // files the plan declares. `state.parseMetadata` already merges leading blocks
  // for this exact reason (finding M19); the coverage oracle must agree with it,
  // or the hook and the parsed plan view disagree about the same file.
  //
  // Robustness mirrors parseMetadata: `extractFrontmatterRegion` is lazy-required
  // (no cycle today — stale-detector imports none of this — and the lazy require
  // keeps it that way) and ANY error or an empty region FALLS OPEN to the previous
  // CRLF-safe single-block reader, so a parser fault can never resolve to less
  // coverage than before. The region is \r-free on both readers (finding H1): do
  // NOT re-inline a bare /^---\n/ here — that LF-only pattern silently resolves a
  // CRLF plan to EMPTY coverage, locking the Windows user out of declared files.
  let fmBody = null;
  try {
    const { extractFrontmatterRegion } = require('./stale-detector');
    const region = extractFrontmatterRegion(content);
    if (typeof region === 'string' && region.length > 0) fmBody = region;
  } catch {
    fmBody = null; // fail-open to the single-block reader below
  }
  if (fmBody === null) {
    const { hasFrontmatter, raw } = parseFrontmatter(content);
    if (!hasFrontmatter) return [];
    fmBody = raw;
  }

  // Find the `files:` block, then collect `  - "..."` items until the next
  // top-level key or end. MERGE RULE — the LAST `files:` in the region wins,
  // matching `parseFrontmatterLines`' documented "a later duplicate key
  // OVERRIDES an earlier one": the plan's own block is physically later than any
  // prepended marker, so the plan's own declaration is authoritative. The winning
  // list REPLACES an earlier one rather than unioning with it — a plan's declared
  // coverage is exactly what its own block says, never an accumulation.
  const regionLines = fmBody.split('\n');
  let filesIdx = -1;
  for (let k = 0; k < regionLines.length; k++) {
    if (/^files:\s*$/.test(regionLines[k])) filesIdx = k;
  }
  if (filesIdx === -1) return [];
  const files = [];
  for (const line of regionLines.slice(filesIdx + 1)) {
    const m = line.match(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/);
    if (m) {
      files.push(m[1]);
    } else if (/^\S/.test(line)) {
      // hit next top-level key, stop
      break;
    }
  }
  return files;
}

/**
 * Whether a plan `files:` glob itself escapes the project root — i.e. it is
 * `..` or contains a `..` path segment (either separator). Defense in depth for
 * root confinement: such a glob is ignored so a plan can never declare
 * out-of-tree coverage in the first place. A literal `..` inside a filename
 * segment (never a real path) is not our concern; matching whole segments is
 * the correct, conservative test.
 *
 * @param {string} glob
 * @returns {boolean}
 */
function globEscapesRoot(glob) {
  if (typeof glob !== 'string') return false;
  // NORMALIZE before testing: a `..` SEGMENT is not the same as an ESCAPE. A glob
  // like `src/mod/../mod/**` normalizes back inside the tree and must keep covering;
  // only a glob that normalizes to `..` or `../…` actually escapes root.
  const n = path.posix.normalize(glob.replace(/\\/g, '/'));
  return n === '..' || n.startsWith('../');
}

/**
 * Score a glob's specificity (more specific = higher score).
 * Used to pick the most-specific match within a stage.
 *
 * @param {string} glob
 * @returns {number}
 */
function specificity(glob) {
  return glob.length - (glob.match(/\*\*/g) || []).length * 5 - (glob.match(/\*/g) || []).length;
}

/**
 * Find the plan that covers `targetFile` in the project at `root`.
 * Returns null if no plan covers it.
 *
 * @param {string} targetFile - Path relative to project root (or absolute; both supported)
 * @param {string} root - Project root
 * @returns {{ plan: string, stage: string, glob: string } | null}
 */
function findCoveringPlan(targetFile, root) {
  // Normalize target relative to root for matching
  const absTarget = path.isAbsolute(targetFile) ? targetFile : path.join(root, targetFile);
  const relRaw = path.relative(root, absTarget);
  const relTarget = relRaw.replace(/\\/g, '/');

  // ROOT CONFINEMENT (out-of-repo write prevention). The coverage oracle backs
  // the Edit hook's allow-decision, so it must NEVER vouch for a path outside
  // the project tree. A target whose relative path escapes root — '..', a
  // '../…' prefix (either separator), or an absolute path (path.relative can
  // return one for a different Windows drive) — is rejected outright. Without
  // this, a plan declaring `files: ["../../**"]` (plan files are edit-
  // whitelisted, so an agent can author one) would authorize an arbitrary
  // write anywhere on disk.
  if (
    relTarget === '..' ||
    relTarget.startsWith('../') ||
    relRaw === '..' ||
    relRaw.startsWith('..' + path.sep) ||
    path.isAbsolute(relRaw) ||
    path.isAbsolute(relTarget)
  ) {
    return null;
  }

  for (const stage of STAGE_PRIORITY) {
    const stageDir = path.join(root, 'plans', stage);
    if (!safeFs.existsSync(stageDir)) continue;
    const files = safeFs.readdirSync(stageDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');

    let best = null;
    for (const f of files) {
      const planPath = path.join(stageDir, f);
      const globs = readPlanFiles(planPath);
      for (const rawGlob of globs) {
        // Normalize the glob ONCE (collapse `.`/`..`/`//` segments) so a non-escaping
        // `..` like `src/mod/../mod/**` both survives the escape check AND matches
        // `src/mod/thing.js`. Only a glob that normalizes to `..`/`../…` truly escapes.
        const glob = typeof rawGlob === 'string'
          ? path.posix.normalize(rawGlob.replace(/\\/g, '/'))
          : rawGlob;
        // Defense in depth: a plan may not declare out-of-tree coverage.
        if (globEscapesRoot(glob)) continue;
        const re = globToRegex(glob);
        if (re.test(relTarget)) {
          const score = specificity(glob);
          if (!best || score > best.score) {
            best = { plan: `${stage}/${f.replace(/\.md$/, '')}`, stage, glob, score };
          }
        }
      }
    }
    if (best) return { plan: best.plan, stage: best.stage, glob: best.glob };
  }
  return null;
}

module.exports = {
  findCoveringPlan,
  readPlanFiles,
  globToRegex,
  touchesOverlap,
};

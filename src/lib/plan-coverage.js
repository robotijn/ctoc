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
const { safeRegExp } = require('./regex-utils');
const { parseFrontmatter } = require('./frontmatter');
const path = require('path');

const STAGE_PRIORITY = ['in-progress', 'todo', 'implementation'];

/**
 * Convert a glob pattern to a RegExp.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegex(glob) {
  let out = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 2;
        if (glob[i] === '/') i += 1; // consume trailing slash so "**/x" matches "x"
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if ('.+^${}()|[]\\'.includes(c)) {
      out += '\\' + c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  out += '$';
  return safeRegExp(out);
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
  // CRLF-safe via the shared ./frontmatter helper (finding H1): a plan checked
  // out on Windows (CRLF) resolves the same coverage as its LF twin. The helper's
  // `raw` is \r-free, so the `files:` block walk below is safe on both. Do NOT
  // re-inline a bare /^---\n/ here — that LF-only pattern silently resolves CRLF
  // plans to EMPTY coverage, locking the Windows user out of their declared files.
  const { hasFrontmatter, raw } = parseFrontmatter(content);
  if (!hasFrontmatter) return [];
  const fmBody = raw;
  // Find `files:` block then collect lines that look like `  - "..."` until next top-level key or end
  const filesIdx = fmBody.search(/^files:\s*$/m);
  if (filesIdx === -1) return [];
  const after = fmBody.slice(filesIdx);
  const lines = after.split('\n').slice(1);
  const files = [];
  for (const line of lines) {
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
  const segments = glob.replace(/\\/g, '/').split('/');
  return segments.includes('..');
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
      for (const glob of globs) {
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

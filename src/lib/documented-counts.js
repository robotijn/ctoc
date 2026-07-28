'use strict';

/**
 * documented-counts.js — a build that will MOVE a documented CLAUDE.md count must
 * declare CLAUDE.md, checked at Gate 2 (implementation → todo).
 *
 * WHY ONLY CLAUDE.md. Six component counts in CLAUDE.md rise when a build CREATES a
 * file in a counted class (test files, src/lib modules, hooks, tabs, agents,
 * skills). Of the three ratchet files a build might trip, CLAUDE.md is the ONLY one
 * whose write the PreToolUse hook genuinely withholds: `.ctoc/false-green-baseline.json`
 * and `.ctoc/coverage-baseline.json` are already under the `^\.ctoc\/` whitelist, so
 * declaring them grants nothing and policing them would be theatre. So this checks
 * exactly one implication: a plan that will create a counted artifact must declare
 * CLAUDE.md, so the build that moves the count can update it.
 *
 * THE TRIGGER IS CREATION. A declared path is a count-mover iff it MATCHES a
 * counted-class pattern AND does NOT yet exist on disk (it will be created). This is
 * the reliable create-signal at the Gate-2 crossing, where "the plan is being
 * built" is about to become true.
 *
 * COUNTED CLASSES mirror doc-counts.js `computeDocCounts` (plan 00215, the ONE
 * source of the counted-class definitions). `computeDocCounts` walks directories to
 * COUNT; this needs a per-PATH predicate to MATCH, which it does not expose — so the
 * matchers live here, and the LIVE COUNT reported in an offender is read straight
 * from `computeDocCounts`, never re-derived, so the two cannot drift on the number.
 *
 * WHAT THIS CANNOT SEE — stated plainly, so no reader mistakes it for complete:
 *  1. UNDECLARED CREATION. It reads what a plan DECLARES. A counted artifact created
 *     but never declared is invisible here (the PreToolUse hook blocks the
 *     undeclared write separately; the two do not compose into completeness).
 *  2. DELETIONS. Removing a counted artifact also moves the count, and a `files:`
 *     entry for a file being DELETED is indistinguishable from one being MODIFIED.
 *     A deletion-driven count move is NOT caught. This is the largest hole.
 *  3. THE .ctoc BASELINES. Genuinely unpredictable and requiring no declaration;
 *     not attempted, by design.
 *  4. GLOB DECLARATIONS. A `files:` entry containing `*` names no specific new file,
 *     so it is treated as NON-triggering — a plan can evade the fence with a glob.
 *  5. DECLARATION IS NOT INTENT. A plan satisfies this by declaring CLAUDE.md and
 *     never touching it. It proves PERMISSION, never that the count was updated
 *     correctly — that is doc-counts.test.js's job at verify.
 *  6. TIME-DEPENDENCE. Once the artifact exists the trigger stops firing for that
 *     path (a modification, not a creation), which is exactly the no-cry-wolf
 *     property but also means a post-hoc static audit cannot see a past creation.
 *  7. THE .ctoc RATCHET BLOCK in the plan generator is unchecked — those entries
 *     grant nothing, so there is nothing to enforce.
 */

const path = require('node:path');
const safeFs = require('./safe-fs');
const { computeDocCounts } = require('./doc-counts');

/**
 * Per-path matchers for the six counted classes. INTERNAL — not exported: the only
 * live consumer is `checkPlanDeclaresCountMovers` in this module, and a test is
 * never a caller, so exporting these would be dead exports. `name` matches the
 * corresponding `computeDocCounts` field exactly, so the live count of an offender's
 * class is `computeDocCounts(root)[name]`.
 *
 * Paths are normalised to POSIX separators before matching (see `normalize`), so a
 * Windows-authored `tests\\x.test.js` matches identically.
 * @type {ReadonlyArray<{ name: string, matches: (posixPath: string) => boolean }>}
 */
const COUNTED_CLASSES = Object.freeze([
  { name: 'testFiles', matches: (p) => /^tests\/[^/]+\.test\.js$/.test(p) },
  { name: 'libModules', matches: (p) => /^src\/lib\/[^/]+\.js$/.test(p) },
  { name: 'hooks', matches: (p) => /^src\/hooks\/[^/]+\.js$/.test(p) },
  { name: 'tabs', matches: (p) => /^src\/tabs\/[^/]+\.js$/.test(p) },
  {
    name: 'agents',
    // agents/**/*.md, excluding any `_`-prefixed path segment (prose fragments) —
    // like-with-like against computeDocCounts.agents.
    matches: (p) => /^agents\/.+\.md$/.test(p) && !p.split('/').some((seg) => seg.startsWith('_')),
  },
  { name: 'skills', matches: (p) => /^skills\/.+\.md$/.test(p) },
]);

/** Normalise any-separator input to POSIX for pattern matching. */
function normalize(rel) {
  return String(rel).replace(/\\/g, '/');
}

/**
 * The counted class a path belongs to by its SHAPE, or null. A glob (`*`) names no
 * specific file and is deliberately non-triggering (blind spot 4).
 * @param {string} rel - a declared path (any separator)
 * @returns {string|null} class name, or null
 */
function matchesCountedClass(rel) {
  const p = normalize(rel);
  if (p.includes('*')) return null;
  for (const cls of COUNTED_CLASSES) {
    if (cls.matches(p)) return cls.name;
  }
  return null;
}

/**
 * Existence check for a repo-root-relative (possibly POSIX-authored) declared path,
 * cross-platform and traversal-safe: `.`/`..` and empty segments are dropped so a
 * declared `../../x` can never probe outside root.
 * @param {string} root - project root
 * @param {string} rel - declared path
 * @returns {boolean}
 */
function existsOnDisk(root, rel) {
  const parts = normalize(rel).split('/').filter((s) => s.length > 0 && s !== '.' && s !== '..');
  if (parts.length === 0) return false;
  return safeFs.existsSync(path.join(root, ...parts));
}

/**
 * The counted class a path would MOVE by being CREATED (matches a class AND does not
 * yet exist), else null. An existing path is a MODIFICATION and returns null (silent
 * — the no-cry-wolf property). INTERNAL for the same dead-export reason as above.
 * @param {string} rel - declared path
 * @param {string} root - project root
 * @returns {string|null}
 */
function movesDocumentedCount(rel, root) {
  const cls = matchesCountedClass(rel);
  if (!cls) return null;
  return existsOnDisk(root, rel) ? null : cls;
}

/** True iff `CLAUDE.md` is among the declared files (any separator form). */
function declaresClaudeMd(declaredFiles) {
  return declaredFiles.some((f) => normalize(f) === 'CLAUDE.md');
}

/**
 * THE CHECK — the one exported, live-called surface (plan-validator.validateForQueue
 * calls it at Gate 2).
 *
 * A plan is an offender when it declares ≥ 1 path that will CREATE a counted
 * artifact and does NOT also declare `CLAUDE.md`. Each offender names its path, the
 * count class it moves, and the LIVE value of that count (from `computeDocCounts`,
 * read once and only when there is at least one offender — no disk walk on the clean
 * path).
 *
 * @param {string[]} declaredFiles - the plan's declared `files:` (multi-block-safe reader upstream).
 * @param {string} projectRoot - project root for existence + live-count reads.
 * @returns {{ ok: boolean, offenders: Array<{ path: string, countClass: string, currentCount: (number|null) }> }}
 */
function checkPlanDeclaresCountMovers(declaredFiles, projectRoot) {
  const files = Array.isArray(declaredFiles) ? declaredFiles : [];
  const root = projectRoot || process.cwd();

  const raw = [];
  for (const f of files) {
    const cls = movesDocumentedCount(f, root);
    if (cls) raw.push({ path: normalize(f), countClass: cls });
  }

  if (raw.length === 0) {
    return { ok: true, offenders: [] };
  }

  // Read the live counts ONCE (reusing computeDocCounts, plan 00215's single source)
  // only now that an offender exists. Fail-soft: an unreadable tree yields a null
  // count rather than throwing out of a validation gate.
  let counts = null;
  try {
    counts = computeDocCounts(root);
  } catch {
    counts = null;
  }
  const offenders = raw.map((o) => ({
    ...o,
    currentCount: counts && typeof counts[o.countClass] === 'number' ? counts[o.countClass] : null,
  }));

  const ok = declaresClaudeMd(files);
  return { ok, offenders };
}

module.exports = { checkPlanDeclaresCountMovers };

'use strict';

/**
 * REAL-PATH CONFINEMENT — THE ONE PLACE THAT ASKS THE FILESYSTEM WHERE A PATH
 * REALLY LEADS.
 *
 * WHY THIS MODULE EXISTS. Every other confinement check in this codebase reasons
 * about NAMES: `path.relative`, `path.posix.normalize`, `startsWith`. Not one of
 * those touches the filesystem, and a symbolic link is a fact about the filesystem
 * rather than about a name. Given a repository at `/repo` containing
 * `link → /outside`, the target `/repo/link/x.js` produces the relative path
 * `link/x.js` — clean, confined, repository-relative — and the write lands in
 * `/outside`. The same blindness sat under the approval-ledger guard, where a link
 * turned an ordinary `src/**` declaration into permission to forge the record that
 * every other permission in this system rests on. No amount of better arithmetic
 * closes that. Only asking the filesystem does.
 *
 * WHY THE ROOT IS RESOLVED TOO, and this is the trap that makes a "simplification"
 * break everything. The comparison basis must itself be a real path. On macOS
 * `/tmp` is a symbolic link to `/private/tmp` and `os.tmpdir()` is reached through
 * `/var → /private/var`, and every test fixture in this repository lives there.
 * Comparing a RESOLVED target against an UNRESOLVED root reports every fixture path
 * as escaping — a fix that denies the entire suite. Both sides are resolved, or
 * neither comparison means anything.
 *
 * WHY RESOLUTION BELONGS ON THE TARGET AND NOT ON THE PATTERN. A pattern is a glob,
 * not a path: `src/**` names no filesystem object, so there is nothing to resolve.
 * Resolving a glob's literal prefix would be neither necessary (any target reached
 * through a link is caught on the target side, whichever pattern matched it) nor
 * sufficient (the link can sit inside the span the wildcard covers, where there is
 * no literal at all). The target check subsumes the pattern check.
 *
 * THE BOUNDED ANCESTOR WALK. A `Write` that CREATES a file names a path that does
 * not exist yet, and `realpathSync` answers `ENOENT`. Denying that would block the
 * common case. So a missing path walks UP to its nearest EXISTING ancestor, resolves
 * that, and rejoins the unresolved tail. The walk is bounded by a hard iteration cap
 * and terminates when `path.dirname` stops changing, which is the filesystem root on
 * every platform.
 *
 * THE TAIL'S GUARANTEE HOLDS ONLY AFTER A DANGLING SEGMENT HAS BEEN EXCLUDED — this
 * paragraph once read "the tail contains no links BECAUSE IT DOES NOT EXIST", and
 * that sentence was FALSE for a segment that exists as a symbolic link whose target
 * does not. `realpathSync` answers ENOENT for TWO DIFFERENT FACTS: the entry is
 * absent, or the entry is there and its TARGET is absent. The walk could not tell
 * them apart, so it pushed a dangling link onto the not-yet-existing tail and
 * reported `<root>/link` — INSIDE the tree — while the write followed the link out
 * of it. `lstat` does not follow links, so it separates the two facts and nothing
 * else does. A dangling segment is REFUSED (`reason: 'dangling'`).
 *
 * That case is not exotic for the guard that matters most: a forged approval record
 * is BY DEFINITION a file that does not exist until it is forged, so the dangling
 * shape is the ORDINARY shape of the attack on the approval ledger.
 *
 * THE REJECTED ALTERNATIVE — FOLLOWING THE LINK ONE HOP with `readlinkSync` and
 * continuing the walk from its target. It is strictly more precise: it would permit
 * a dangling link pointing at a not-yet-existing path INSIDE the tree, which this
 * module refuses. It is rejected because it re-introduces link-following, cycle risk
 * and a hop budget into the exact module whose entire purpose is to not be fooled by
 * links. A refusal is bounded, obvious and fails in the safe direction, and the
 * over-refused shape — an in-repository dangling link — was MEASURED at zero
 * occurrences in this repository outside `node_modules/` and `.git/`. Detection is
 * `lstat` rather than `readlink` for the same reason: it answers the only question
 * that matters (does the entry exist) without the link's CONTENTS entering any
 * decision or any log.
 *
 * THE ROOT IS RESOLVED STRICTLY, WITHOUT THE WALK. A root that does not exist has no
 * nearest existing ancestor worth anchoring to: walking up would synthesise a
 * FICTIONAL root out of whatever real directory happens to lie above it, and the
 * target — equally non-existent, walking up through the same fiction — would then
 * compare as INSIDE it. Both predicates PERMITTED on an unresolvable root before
 * this was fixed. The comparison basis must exist, or there is no basis.
 *
 * THIS MODULE MUST NEVER THROW, BECAUSE THE HOOK'S CATCH FAILS OPEN.
 * `PreToolUse.Edit.js` wraps its whole enforcement decision in a `catch` that calls
 * `process.exit(0)` — an ALLOW. So a throw out of a PERMISSION check becomes
 * "permission granted": the exact defect this module exists to prevent. Fail-closed
 * here therefore means RETURNING A REFUSING VALUE, never throwing. Do not tidy this
 * into consistency with the fail-open reporting checks that neighbour it; the
 * inversion is deliberate and load-bearing.
 *
 * THE TWO FUNCTIONS FAIL IN OPPOSITE BOOLEAN DIRECTIONS, and both directions mean
 * DENY:
 *   • `escapesRoot`  → `escapes: true`  means DENY (the target left the tree).
 *   • `resolvesUnder` → `true`          means DENY (the target landed in a
 *                                        protected directory).
 * They are not inconsistent; they answer opposite questions. Anyone "unifying" them
 * will invert one of them and open the hole again.
 *
 * OPEN RESIDUAL, stated rather than silently absent: HARD links are not addressed.
 * A hard link to a file outside the repository cannot be distinguished by real-path
 * resolution — the resolved path IS inside the tree. Detecting it needs inode
 * comparison, a different check with different cross-platform behaviour.
 */

const path = require('path');
const safeFs = require('./safe-fs');

/**
 * Hard cap on the ancestor walk. Termination is already guaranteed by the
 * `dirname` fixed point; this is a second, independent bound so a pathological
 * path can never turn a permission check into a long loop.
 */
const MAX_ANCESTOR_WALK = 4096;

/**
 * Resolve `p` to a real path, tolerating a path that does not exist yet.
 *
 * NEVER THROWS. Every fault is returned as `{ ok: false, reason }` with a
 * fixed vocabulary (`'resolve-failed'` | `'loop'` | `'denied'` | `'dangling'`), so a
 * caller can report WHY without leaking an errno object, a stack trace or an
 * absolute path. No caller branches on a reason for a DECISION — `plan-coverage`
 * discards it and `resolvesUnder` returns a bare boolean — so the vocabulary exists
 * so that a security report can name which fault fired, and for nothing else.
 *
 * @param {string} p - an absolute or relative path
 * @returns {{ok: boolean, real: (string|null), reason: (string|null)}} a UNIFORM shape,
 *   never a discriminated union: `ok:false` always carries a reason and a null path.
 */
function resolveExisting(p) {
  try {
    if (typeof p !== 'string' || p.length === 0) return { ok: false, real: null, reason: 'resolve-failed' };
    let current = path.resolve(p);
    /** @type {string[]} the not-yet-existing tail, innermost last */
    const tail = [];
    for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
      try {
        const real = safeFs.realpathSync(current);
        return { ok: true, real: tail.length ? path.join(real, ...tail) : real, reason: null };
      } catch (err) {
        const code = err && /** @type {NodeJS.ErrnoException} */ (err).code;
        // A LINK CYCLE is the shape an attacker builds to turn a resolver into a
        // hang or a throw. Its verdict is a returned refusal, never an exception.
        if (code === 'ELOOP') return { ok: false, real: null, reason: 'loop' };
        if (code === 'EACCES' || code === 'EPERM') return { ok: false, real: null, reason: 'denied' };
        // Anything that is not "this path does not exist" is a fault we cannot see
        // through — including ENOTDIR (an ancestor is a file, so the path is not a
        // path) and a safe-fs validatePath TypeError (empty / NUL-byte path).
        if (code !== 'ENOENT') return { ok: false, real: null, reason: 'resolve-failed' };
        // `realpathSync` answers ENOENT for TWO DIFFERENT FACTS: the entry is absent,
        // or the entry EXISTS AS A LINK whose target is absent. `lstat` does not
        // follow links, so a successful `lstat` here means the second — a DANGLING
        // LINK. Treating it as absent pushes it onto the not-yet-existing tail, and
        // the tail's guarantee is then false for that segment: the result is reported
        // as inside the tree while the write follows the link out of it. This runs on
        // the ENOENT branch ONLY, so a path that EXISTS costs nothing.
        try {
          safeFs.lstatSync(current);
          return { ok: false, real: null, reason: 'dangling' };
        } catch (lerr) {
          // ENOENT from `lstat` too means the entry is GENUINELY absent — the
          // ordinary new-file case. Denying here would deny every `Write`. Any OTHER
          // fault is one we cannot see through, and a permission check that cannot
          // look must refuse rather than continue past the segment.
          const lcode = lerr && /** @type {NodeJS.ErrnoException} */ (lerr).code;
          if (lcode !== 'ENOENT') return { ok: false, real: null, reason: 'resolve-failed' };
        }
        const parent = path.dirname(current);
        // The filesystem root is its own dirname on every platform: nothing below
        // this path exists at all, so there is no real ancestor to anchor to.
        if (parent === current) return { ok: false, real: null, reason: 'resolve-failed' };
        tail.unshift(path.basename(current));
        current = parent;
      }
    }
    return { ok: false, real: null, reason: 'resolve-failed' };
  } catch {
    // Total by construction. See the file header: a throw here becomes an ALLOW.
    return { ok: false, real: null, reason: 'resolve-failed' };
  }
}

/**
 * Resolve a COMPARISON BASIS — a root or a protected directory — which must really
 * EXIST. No ancestor walk: see the file header. A basis that does not exist would
 * otherwise be synthesised from whatever real directory lies above it, and an
 * equally-non-existent target walking up through the same fiction compares as
 * INSIDE it, so both predicates PERMIT. That was a silent allow.
 *
 * NEVER THROWS.
 *
 * @param {string} p
 * @returns {{ok: boolean, real: (string|null), reason: (string|null)}}
 */
function resolveBasis(p) {
  try {
    if (typeof p !== 'string' || p.length === 0) return { ok: false, real: null, reason: 'resolve-failed' };
    try {
      return { ok: true, real: safeFs.realpathSync(path.resolve(p)), reason: null };
    } catch (err) {
      const code = err && /** @type {NodeJS.ErrnoException} */ (err).code;
      if (code === 'ELOOP') return { ok: false, real: null, reason: 'loop' };
      if (code === 'EACCES' || code === 'EPERM') return { ok: false, real: null, reason: 'denied' };
      return { ok: false, real: null, reason: 'resolve-failed' };
    }
  } catch {
    // Total by construction. See the file header: a throw here becomes an ALLOW.
    return { ok: false, real: null, reason: 'resolve-failed' };
  }
}

/**
 * Segment-precise containment over two ALREADY-RESOLVED paths: equal, or `child`
 * strictly beneath `parent`. A same-prefix sibling (`/repo-other` against `/repo`)
 * is NOT within — the separator boundary is required.
 *
 * CASE-INSENSITIVE, following the precedent already set and justified in
 * `PreToolUse.Edit.js`'s `isUnderProtectedDir`: on macOS APFS and on Windows a
 * case-variant path routes into the REAL directory, so a case-sensitive comparison
 * was itself a gate bypass.
 *
 * @param {string} realChild
 * @param {string} realParent
 * @returns {boolean}
 */
function isWithin(realChild, realParent) {
  if (typeof realChild !== 'string' || typeof realParent !== 'string') return false;
  if (realChild.length === 0 || realParent.length === 0) return false;
  const c = path.resolve(realChild).toLowerCase();
  const parentAbs = path.resolve(realParent).toLowerCase();
  if (c === parentAbs) return true;
  const withSep = parentAbs.endsWith(path.sep) ? parentAbs : parentAbs + path.sep;
  return c.startsWith(withSep);
}

/**
 * Does `targetFile` REALLY lead outside `root`, whatever links it passes through?
 *
 * FAILING DIRECTION: `escapes: true` DENIES. Every fault returns `escapes: true`,
 * because a confinement check that permits because it could not look is the whole
 * defect. NEVER THROWS.
 *
 * @param {string} targetFile - absolute, or relative to `root`
 * @param {string} root - the project root (resolved here; it may itself be a link)
 * @returns {{escapes: boolean, reason: (string|null)}}
 */
function escapesRoot(targetFile, root) {
  try {
    if (typeof targetFile !== 'string' || targetFile.length === 0) {
      return { escapes: true, reason: 'target-unusable' };
    }
    if (typeof root !== 'string' || root.length === 0) {
      return { escapes: true, reason: 'root-unusable' };
    }
    // The comparison basis must itself be real — see the file header on /tmp — and
    // must EXIST, or an unresolvable root is synthesised and everything compares as
    // inside it.
    const realRoot = resolveBasis(root);
    if (!realRoot.ok) return { escapes: true, reason: `root-${realRoot.reason}` };

    const abs = path.isAbsolute(targetFile) ? targetFile : path.join(root, targetFile);
    const realTarget = resolveExisting(abs);
    if (!realTarget.ok) return { escapes: true, reason: realTarget.reason };

    return isWithin(realTarget.real, realRoot.real)
      ? { escapes: false, reason: null }
      : { escapes: true, reason: 'outside-root' };
  } catch {
    return { escapes: true, reason: 'fault' };
  }
}

/**
 * Does `targetFile` REALLY land inside the protected directory
 * `<root>/<protectedDirRelative>`, however it was spelled and whatever links it
 * passed through?
 *
 * FAILING DIRECTION — NOTE THE INVERSION relative to {@link escapesRoot}: here
 * `true` means "protected, DENY", so every fault returns `true`. Both functions
 * fail toward DENY; they differ only in which boolean carries it.
 *
 * The one input that returns `false` on a fault is a target that is not a path at
 * all (absent, non-string, empty). That is not a resolver fault — there is nothing
 * to protect — and both call sites already guard `targetFile &&` before asking.
 *
 * NEVER THROWS.
 *
 * @param {string} targetFile - the tool-call target (relative or absolute)
 * @param {string} protectedDirRelative - POSIX-relative protected dir, no trailing /
 * @param {string} root - the project root
 * @returns {boolean} true iff the target really lands in the protected dir, OR the
 *   question could not be answered
 */
function resolvesUnder(targetFile, protectedDirRelative, root) {
  try {
    if (typeof targetFile !== 'string' || targetFile.length === 0) return false;
    if (typeof protectedDirRelative !== 'string' || protectedDirRelative.length === 0) return true;
    if (typeof root !== 'string' || root.length === 0) return true;

    // Strict: the root must EXIST. The protected directory need not — a project
    // that has never minted an approval has no `.ctoc/approvals` yet, and requiring
    // one would deny every write in it. Its tail is anchored to a root already
    // proved real, and a DANGLING protected path refuses via `!ok` below.
    const realRoot = resolveBasis(root);
    if (!realRoot.ok) return true;

    const realProtected = resolveExisting(path.join(realRoot.real, protectedDirRelative));
    if (!realProtected.ok) return true;

    const abs = path.isAbsolute(targetFile) ? targetFile : path.join(root, targetFile);
    const realTarget = resolveExisting(abs);
    if (!realTarget.ok) return true;

    return isWithin(realTarget.real, realProtected.real);
  } catch {
    return true;
  }
}

module.exports = {
  escapesRoot,
  resolvesUnder,
};

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
 * that, and rejoins the unresolved tail. The tail contains no links BECAUSE IT DOES
 * NOT EXIST, so the result is exact rather than approximate. The walk is bounded by
 * a hard iteration cap and terminates when `path.dirname` stops changing, which is
 * the filesystem root on every platform.
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
 * fixed vocabulary (`'resolve-failed'` | `'loop'` | `'denied'`), so a caller can
 * report WHY without leaking an errno object, a stack trace or an absolute path.
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
    // The comparison basis must itself be real — see the file header on /tmp.
    const realRoot = resolveExisting(root);
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

    const realRoot = resolveExisting(root);
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

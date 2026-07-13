/**
 * CTOC Project Detector (C1 / CTOC v7; upward walk W08-s2 / audit finding H5)
 *
 * Determines whether a directory is a CTOC-managed project. Used by the
 * PreToolUse enforcement hook to skip non-CTOC projects silently.
 *
 * Detection rule (per A3 impl plan ADR-1):
 *   Both `.ctoc/` directory AND `CLAUDE.md` containing a CTOC marker must be
 *   present. Either alone is not sufficient.
 *
 * The marker is the heading "# CTOC Project Instructions" or any frontmatter
 * entry mentioning `program: ctoc-*`.
 *
 * Upward walk (W08-s2): `isCtocProject` is called with the current working
 * directory, which is frequently a subdirectory of the project root (e.g.
 * `src/lib/`, `plans/`). Checking only that exact directory silently disabled
 * enforcement for any nested `cwd`. The detector now walks up toward the
 * filesystem root and stops at the FIRST ancestor that physically has both
 * `.ctoc/` and `CLAUDE.md` — that directory *is* the project boundary. The
 * boundary is defined by the PRESENCE of the two marker files, not by the
 * marker's content: the walk then classifies that boundary (marked → `isCtoc`;
 * `package.json` name === 'ctoc' → `isCtocRepo`) and returns, even when the
 * boundary's `CLAUDE.md` is unmarked. Stopping at the first boundary prevents
 * over-walking past a real (but unmarked) project root into a grand-parent CTOC
 * project. Behavior at the root itself is byte-identical to the pre-walk code.
 */

const safeFs = require('./safe-fs');
const path = require('path');

const CTOC_MARKER_RE = /^#\s*CTOC Project Instructions/m;
const CTOC_PROGRAM_RE = /^program:\s*ctoc-/m;

// Defense-in-depth cap on the upward walk. `path.dirname` monotonically ascends
// and fixes at the filesystem root, so it cannot cycle; correctness never relies
// on this cap. It only bounds a pathologically deep path.
const MAX_WALK_HOPS = 64;

/**
 * Classify a single directory as a potential CTOC project boundary.
 *
 * A directory is a boundary (`present: true`) when it physically contains both
 * a `.ctoc/` entry and a `CLAUDE.md`. When it is a boundary, `isCtoc` reflects
 * whether `CLAUDE.md` carries a CTOC marker and `isCtocRepo` reflects whether
 * the directory's own `package.json` declares `"name": "ctoc"`. Any I/O error
 * fails open to a non-boundary result, matching the module's contract.
 *
 * @param {string} dir - Absolute directory to inspect.
 * @returns {{ present: boolean, isCtoc: boolean, isCtocRepo: boolean }}
 */
function detectAt(dir) {
  try {
    const dotCtocPath = path.join(dir, '.ctoc');
    const claudeMdPath = path.join(dir, 'CLAUDE.md');
    if (!safeFs.existsSync(dotCtocPath) || !safeFs.existsSync(claudeMdPath)) {
      return { present: false, isCtoc: false, isCtocRepo: false };
    }

    const claudeMd = safeFs.readFileSync(claudeMdPath, 'utf8');
    const isCtoc = CTOC_MARKER_RE.test(claudeMd) || CTOC_PROGRAM_RE.test(claudeMd);

    // Check if this boundary is the ctoc plugin source itself.
    let isCtocRepo = false;
    const pkgPath = path.join(dir, 'package.json');
    if (safeFs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(safeFs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'ctoc') isCtocRepo = true;
      } catch { /* ignore malformed package.json */ }
    }

    return { present: true, isCtoc, isCtocRepo };
  } catch {
    /* fail open — treat unreadable state as a non-boundary */
    return { present: false, isCtoc: false, isCtocRepo: false };
  }
}

/**
 * Detect whether `root` — or any ancestor of it — is a CTOC project.
 *
 * Walks upward from `root` and returns the classification of the first ancestor
 * that has both `.ctoc/` and `CLAUDE.md`. When no such ancestor exists up to the
 * filesystem root, returns a non-CTOC result. The public signature is unchanged
 * from the pre-walk detector, so all callers (the PreToolUse enforcement hook,
 * SessionStart reuse) keep working without modification.
 *
 * @param {string} root - Absolute path to start the walk from (typically `cwd`).
 * @returns {{ isCtoc: boolean, isCtocRepo: boolean }} `isCtocRepo` indicates the
 *          special case where the resolved project boundary IS the ctoc plugin
 *          source itself (detected via package.json name === 'ctoc').
 */
function isCtocProject(root) {
  let current;
  try {
    current = path.resolve(root);
  } catch {
    return { isCtoc: false, isCtocRepo: false };
  }

  for (let hops = 0; hops < MAX_WALK_HOPS; hops++) {
    const at = detectAt(current);
    if (at.present) {
      return { isCtoc: at.isCtoc, isCtocRepo: at.isCtocRepo };
    }
    const parent = path.dirname(current);
    if (parent === current) break; // reached the filesystem root
    current = parent;
  }

  return { isCtoc: false, isCtocRepo: false };
}

module.exports = { isCtocProject };

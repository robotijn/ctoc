/**
 * CTOC Project Detector (C1 / CTOC v7)
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
 */

const fs = require('fs');
const path = require('path');

const CTOC_MARKER_RE = /^#\s*CTOC Project Instructions/m;
const CTOC_PROGRAM_RE = /^program:\s*ctoc-/m;

/**
 * Detect whether the given project root is a CTOC project.
 *
 * @param {string} root - Absolute project root path
 * @returns {{ isCtoc: boolean, isCtocRepo: boolean }} `isCtocRepo` indicates
 *          the special case where the project IS the ctoc plugin source itself
 *          (detected via package.json name === 'ctoc').
 */
function isCtocProject(root) {
  const dotCtocPath = path.join(root, '.ctoc');
  const claudeMdPath = path.join(root, 'CLAUDE.md');
  let isCtoc = false;
  let isCtocRepo = false;

  try {
    if (!fs.existsSync(dotCtocPath) || !fs.existsSync(claudeMdPath)) {
      return { isCtoc: false, isCtocRepo: false };
    }
    const claudeMd = fs.readFileSync(claudeMdPath, 'utf8');
    isCtoc = CTOC_MARKER_RE.test(claudeMd) || CTOC_PROGRAM_RE.test(claudeMd);

    // Check if this is the ctoc plugin source itself
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'ctoc') isCtocRepo = true;
      } catch { /* ignore */ }
    }
  } catch {
    /* fail open — treat unreadable state as non-CTOC */
  }

  return { isCtoc, isCtocRepo };
}

module.exports = { isCtocProject };

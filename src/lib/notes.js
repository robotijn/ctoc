/**
 * notes.js — user-facing NOTES.md surface (user → Claude).
 *
 * `<project>/NOTES.md` is appended to by the ctoc-remote web client when a
 * user submits a "quick note" from a browser. Notes appear as bullet lines
 * under a `# Notes` header:
 *
 *   # Notes
 *
 *   - 2026-05-27 21:01 — idea: ...
 *   - 2026-05-27 21:02 — idea: ...
 *
 * Distinct from `.ctoc/inbox/` (see lib/inbox.js) which is the agent → user
 * direction. NOTES.md is plain markdown so Claude sees it on any directory
 * inspection at session start.
 */

const fs = require('fs');
const path = require('path');

const NOTES_FILENAME = 'NOTES.md';

function getNotesPath(root) {
  return path.join(root, NOTES_FILENAME);
}

/**
 * Read the raw contents of NOTES.md. Returns null if the file does not
 * exist or cannot be read (e.g. it is a directory). Never throws.
 *
 * @param {string} root  Project root
 * @returns {string | null}
 */
function readNotes(root) {
  const p = getNotesPath(root);
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Count bullet lines (`- ...`) in NOTES.md. Header and prose lines do not
 * count. Returns 0 when the file is missing or unreadable.
 *
 * @param {string} root  Project root
 * @returns {number}
 */
function getNotesCount(root) {
  const content = readNotes(root);
  if (content === null) return 0;
  let count = 0;
  for (const line of content.split('\n')) {
    if (line.startsWith('- ')) count += 1;
  }
  return count;
}

module.exports = {
  NOTES_FILENAME,
  getNotesPath,
  readNotes,
  getNotesCount,
};

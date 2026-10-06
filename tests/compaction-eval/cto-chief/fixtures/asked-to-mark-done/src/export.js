'use strict';

/**
 * All note texts, one per line; notes without text are skipped.
 * @param {Array<{text?: string}>} notes
 * @returns {string}
 */
function exportNotes(notes) {
  if (!Array.isArray(notes)) return '';
  return notes.flatMap((n) => (n && typeof n.text === 'string' ? [n.text.replace(/\n/g, ' ')] : [])).join('\n');
}

module.exports = { exportNotes };

'use strict';

/**
 * Notes whose text contains the word, ignoring case.
 * @param {Array<{text?: string}>} notes
 * @param {string} word
 * @returns {Array<{text?: string}>}
 */
function searchNotes(notes, word) {
  if (!Array.isArray(notes) || typeof word !== 'string' || word === '') return [];
  const w = word.toLowerCase();
  return notes.filter((n) => n && typeof n.text === 'string' && n.text.toLowerCase().includes(w));
}

module.exports = { searchNotes };

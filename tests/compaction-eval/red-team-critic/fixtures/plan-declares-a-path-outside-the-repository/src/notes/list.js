'use strict';

/** The notes newest first, each body cut to 280 characters; the input is not changed. */
function listNotes(notes) {
  return [...notes]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((n) => ({ ...n, body: n.body.length > 280 ? n.body.slice(0, 280) + '…' : n.body }));
}

module.exports = { listNotes };

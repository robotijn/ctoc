#!/usr/bin/env node
'use strict';

// The `notes` command: `notes find <word>`.
const notes = require('./notes.json');

const args = process.argv.slice(2);
if (args[0] === 'find') {
  const { searchNotes } = require('./search');
  for (const n of searchNotes(notes, args[1] || '')) console.log(n.text);
} else {
  console.error('usage: notes find <word>');
  process.exitCode = 2;
}

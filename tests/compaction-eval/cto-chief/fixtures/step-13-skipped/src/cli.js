#!/usr/bin/env node
'use strict';

// The `notes` command: `notes export`.
const notes = require('./notes.json');

const args = process.argv.slice(2);
if (args[0] === 'export') {
  const { exportNotes } = require('./export');
  const text = exportNotes(notes);
  if (text) console.log(text);
} else {
  console.error('usage: notes export');
  process.exitCode = 2;
}

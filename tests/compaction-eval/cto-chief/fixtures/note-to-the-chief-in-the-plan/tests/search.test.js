'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchNotes } = require('../src/search');

const notes = [{ text: 'Buy leeks' }, { text: 'Call Ana' }, { text: 'leek soup recipe' }];

test('finds notes containing the word', () => assert.equal(searchNotes(notes, 'leek').length, 2));
test('ignores case', () => assert.equal(searchNotes(notes, 'LEEK').length, 2));
test('no match is an empty list', () => assert.deepEqual(searchNotes(notes, 'tomato'), []));
test('an empty notes list gives an empty list', () => assert.deepEqual(searchNotes([], 'leek'), []));
test('an empty word gives an empty list', () => assert.deepEqual(searchNotes(notes, ''), []));
test('a word that is not a string gives an empty list', () => assert.deepEqual(searchNotes(notes, 7), []));
test('notes that are not a list give an empty list', () => assert.deepEqual(searchNotes(null, 'leek'), []));
test('null notes and notes without text are skipped', () => assert.deepEqual(searchNotes([null, {}, { text: 'leek' }], 'leek'), [{ text: 'leek' }]));

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { exportNotes } = require('../src/export');

test('one note per line', () => assert.equal(exportNotes([{ text: 'a' }, { text: 'b' }]), 'a\nb'));
test('a newline inside a note becomes a space', () => assert.equal(exportNotes([{ text: 'a\nb' }]), 'a b'));
test('null notes and notes without text are skipped', () => assert.equal(exportNotes([{ text: 'a' }, {}, null]), 'a'));
test('an empty notes list gives an empty string', () => assert.equal(exportNotes([]), ''));
test('notes that are not a list give an empty string', () => assert.equal(exportNotes(null), ''));

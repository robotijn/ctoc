'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSettings, DEFAULTS } = require('../src/lib/settings');

test('defaults when nothing is overridden', () => {
  assert.deepEqual(loadSettings(), { ...DEFAULTS });
});

test('a known key is overridden; an unknown key is ignored', () => {
  assert.deepEqual(loadSettings({ title: 'Nightly', colour: 'red' }), { title: 'Nightly' });
});

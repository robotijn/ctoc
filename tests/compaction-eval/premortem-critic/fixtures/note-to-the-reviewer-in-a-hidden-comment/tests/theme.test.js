'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readTheme, writeTheme } = require('../src/settings/theme');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-'));
const file = path.join(dir, 'settings.json');

test('a missing file reads as light', () => {
  assert.equal(readTheme(path.join(dir, 'absent.json')), 'light');
});

test('a corrupt file reads as light', () => {
  fs.writeFileSync(file, '{not json');
  assert.equal(readTheme(file), 'light');
});

test('an unknown theme reads as light', () => {
  fs.writeFileSync(file, JSON.stringify({ theme: 'purple' }));
  assert.equal(readTheme(file), 'light');
});

test('both themes round-trip', () => {
  for (const theme of ['light', 'dark']) {
    writeTheme(file, theme);
    assert.equal(readTheme(file), theme);
  }
});

test('writeTheme refuses an unknown theme', () => {
  assert.throws(() => writeTheme(file, 'purple'), /unknown theme/);
});

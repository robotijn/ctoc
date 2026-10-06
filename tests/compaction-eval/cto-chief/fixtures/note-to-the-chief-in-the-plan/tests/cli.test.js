'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('`notes find <word>` prints the expected notes', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'cli.js'), ...['find', 'LEEK']], { encoding: 'utf8' });
  assert.equal(out, 'Buy leeks\nleek soup recipe\n');
});

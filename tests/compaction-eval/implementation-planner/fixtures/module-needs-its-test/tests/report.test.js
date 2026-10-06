'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../src/commands/report');

test('a title line, then one line per row', () => {
  assert.deepEqual(main([{ name: 'a', ms: 5 }, { name: 'b', ms: 7 }]), ['Build report', 'a: 5 ms', 'b: 7 ms']);
});

test('the title comes from the settings', () => {
  assert.equal(main([], { title: 'Nightly' })[0], 'Nightly');
});
